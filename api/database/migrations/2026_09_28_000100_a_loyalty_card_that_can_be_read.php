<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * The loyalty card threw an error at exactly the people it was built for.
 *
 * `my_loyalty()` asked `loyalty_rewards` for a `label` column that has never
 * existed on it — the table holds id, customer_id, code, earned_at and
 * redeemed_at, and the label lives on `promo_codes`, one join away.
 *
 * It went unnoticed because of the order of the checks. A guest, or anybody
 * without a real account, hits the early return and gets an empty card back
 * without ever reaching the broken query. Only a signed-in customer got as far
 * as the failing select. The web page then did this:
 *
 *     supabase.rpc('my_loyalty').then(({ data }) => { if (row) ... })
 *
 * which ignores the error, leaves `loyalty` null, and renders nothing at all.
 * So the card worked for people it was not for and vanished for the ones it
 * was, silently, with nothing in the console to say why.
 *
 * The rewards now come back with the code the diner actually has to type, and
 * whether it has been spent — which is the part that makes the list worth
 * showing at all, rather than a number that resets when the page reloads.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
create or replace function public.my_loyalty()
returns table (completed integer, until_next integer, rewards jsonb)
language plpgsql
stable
security definer
set search_path = public
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
                       'id',          r.id,
                       -- The code is the point of the whole thing: it is what
                       -- the diner types at checkout.
                       'code',        r.code,
                       'label',       coalesce(p.label, 'Loyalty reward'),
                       'earned_at',   r.earned_at,
                       'redeemed_at', r.redeemed_at
                     ) order by r.earned_at desc)
                from public.loyalty_rewards r
                left join public.promo_codes p on p.code = r.code
               where r.customer_id = v_me),
             '[]'::jsonb
           );
end;
$$;

grant execute on function public.my_loyalty() to authenticated;
SQL);
    }

    public function down(): void
    {
        // Deliberately not restored. The previous body referenced a column that
        // does not exist, so putting it back would only reinstate the error.
    }
};
