<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Draws the line between a guest and a customer, now that guests have sessions.
 *
 * Anonymous sign-ins give every device a real Supabase user, which is what
 * makes a guest ticket provably theirs. The catch is the one the dashboard
 * warns about: an anonymous user carries the `authenticated` role, so every
 * rule written as "authenticated may do this" would quietly start admitting
 * them.
 *
 * The policies here were already written on identity rather than role — they
 * ask is_admin(), is_staff(), or customer_id = auth.uid() — so nothing opened
 * up on its own. What does need saying out loud is the difference between
 * having an identity and having an account:
 *
 *   A guest gets an identity, and it buys them exactly one thing: their own
 *   orders are theirs, and nobody else's are.
 *
 *   An account is what earns the perks — the running promotions, the loyalty
 *   card, being told when a sold-out dish comes back. Those exist to be worth
 *   signing up for. If every guest silently collected them there would be
 *   nothing left to sign up for.
 *
 * A discount code still works for anyone who types one, because preview_promo()
 * and create_ticket() price it themselves. What an account buys is being told
 * the codes exist without the shop paying to advertise them.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
-- ---------------------------------------------------------------------------
-- A real account, as opposed to a device that has merely been given a name
-- ---------------------------------------------------------------------------
create or replace function public.is_real_account()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- Sessions issued before anonymous sign-ins existed carry no is_anonymous
  -- claim at all. Treating a missing claim as "real" is the safe default: it
  -- keeps every account that already had these perks.
  select auth.uid() is not null
     and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false;
$$;

grant execute on function public.is_real_account() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- The promotions list
-- ---------------------------------------------------------------------------
drop policy if exists "promo_codes_read_active" on public.promo_codes;

create policy "promo_codes_read_active"
  on public.promo_codes for select
  using ((active and public.is_real_account()) or public.is_staff());

-- ---------------------------------------------------------------------------
-- The loyalty card
-- ---------------------------------------------------------------------------
drop policy if exists "loyalty_own" on public.loyalty_rewards;

create policy "loyalty_own"
  on public.loyalty_rewards for select
  using (
    (customer_id = auth.uid() and public.is_real_account())
    or public.is_admin()
  );

create or replace function public.my_loyalty()
returns table (completed int, until_next int, rewards jsonb)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_me    uuid := auth.uid();
  v_count int;
begin
  -- An empty card rather than an error, so the screen simply shows nothing
  -- instead of breaking for somebody who never asked for a card.
  if v_me is null or not public.is_real_account() then
    return query select 0, 5, '[]'::jsonb;
    return;
  end if;

  select count(*)::int into v_count
    from public.orders
   where customer_id = v_me and status = 'completed';

  return query
    select v_count,
           case when v_count % 5 = 0 then 5 else 5 - (v_count % 5) end,
           coalesce(
             (select jsonb_agg(jsonb_build_object(
                       'id', r.id, 'label', r.label, 'earned_at', r.earned_at,
                       'redeemed_at', r.redeemed_at))
                from public.loyalty_rewards r
               where r.customer_id = v_me),
             '[]'::jsonb
           );
end;
$$;

revoke all on function public.my_loyalty() from public;
grant execute on function public.my_loyalty() to authenticated;

-- ---------------------------------------------------------------------------
-- "Tell me when it is back"
--
-- The promise is that somebody gets in touch, and there is nowhere to reach a
-- device. It stays an account feature.
-- ---------------------------------------------------------------------------
drop policy if exists "stock_alerts_own" on public.stock_alerts;

create policy "stock_alerts_own"
  on public.stock_alerts for all
  using (customer_id = auth.uid() and public.is_real_account())
  with check (customer_id = auth.uid() and public.is_real_account());
SQL);
    }

    public function down(): void
    {
        DB::unprepared(<<<'SQL'
drop policy if exists "promo_codes_read_active" on public.promo_codes;
create policy "promo_codes_read_active"
  on public.promo_codes for select
  using (active or public.is_staff());

drop policy if exists "loyalty_own" on public.loyalty_rewards;
create policy "loyalty_own"
  on public.loyalty_rewards for select
  using (customer_id = auth.uid() or public.is_admin());

drop policy if exists "stock_alerts_own" on public.stock_alerts;
create policy "stock_alerts_own"
  on public.stock_alerts for all
  using (customer_id = auth.uid())
  with check (customer_id = auth.uid());

drop function if exists public.is_real_account();
SQL);
    }
};
