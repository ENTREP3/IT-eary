<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * A code is worth one discount to each diner, not one discount per order.
 *
 * `used_count` was only ever a cap on the promotion as a whole: run SULIT10
 * with a limit of fifty and one determined regular could take all fifty. A
 * promotion is meant to buy fifty visits from fifty people, and there was
 * nothing in the schema that said so.
 *
 * Redemptions are now recorded per account, and the primary key is the rule —
 * (code, customer) can only exist once, so the database refuses a second
 * attempt rather than trusting anybody to check first. That matters under load:
 * two orders placed a moment apart with the same code cannot both slip through
 * a `select ... if not exists`, but they cannot both insert the same key.
 *
 * The loser of that race is charged full price rather than failing outright,
 * which is how the existing `used_count` race already behaves. A diner who
 * double-taps ends up with lunch, not an error.
 *
 * Guests were already refused a discount. This adds the other half of the same
 * thought: a discount has to attach to somebody, so an order with no customer
 * on it — a staff account testing the storefront, for instance — gets none
 * either. Otherwise "once per account" would have an unlimited back door.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
create table if not exists public.promo_redemptions (
  code        text not null references public.promo_codes(code)
                on update cascade on delete cascade,
  customer_id uuid not null references auth.users(id) on delete cascade,
  order_id    uuid references public.orders(id) on delete set null,
  redeemed_at timestamptz not null default now(),
  primary key (code, customer_id)
);

comment on table public.promo_redemptions is
  'One row per code per diner. The primary key is the once-per-account rule; nothing else enforces it.';

alter table public.promo_redemptions enable row level security;

drop policy if exists "promo_redemptions_own_or_staff" on public.promo_redemptions;
create policy "promo_redemptions_own_or_staff"
  on public.promo_redemptions for select
  using (customer_id = auth.uid() or public.is_staff());

-- Everything already redeemed, so the rule applies from today rather than
-- forgiving every code anybody has used so far.
insert into public.promo_redemptions (code, customer_id, order_id, redeemed_at)
select distinct on (o.promo_code, o.customer_id)
       o.promo_code, o.customer_id, o.id, o.created_at
  from public.orders o
 where o.promo_code is not null
   and o.customer_id is not null
   and o.discount > 0
   and exists (select 1 from public.promo_codes p where p.code = o.promo_code)
 order by o.promo_code, o.customer_id, o.created_at
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- What a code is worth, to this diner, right now
-- ---------------------------------------------------------------------------
create or replace function public.promo_discount_for(
  p_code     text,
  p_subtotal numeric
)
returns numeric
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_promo    public.promo_codes;
  v_discount numeric(10,2);
  v_code     text := upper(trim(coalesce(p_code, '')));
begin
  if v_code = '' then
    return 0;
  end if;

  -- A guest with a session is still a guest: the shop cannot bring back
  -- somebody it will not recognise next time.
  if not public.is_real_account() then
    return 0;
  end if;

  -- Once each. Checked here as well as enforced by the key, so the cart quotes
  -- the truth rather than promising a discount the checkout will withdraw.
  if exists (
    select 1 from public.promo_redemptions r
     where r.code = v_code and r.customer_id = auth.uid()
  ) then
    return 0;
  end if;

  select * into v_promo from public.promo_codes where code = v_code;

  if v_promo.code is null
     or not v_promo.active
     or v_promo.starts_at > now()
     or (v_promo.ends_at is not null and v_promo.ends_at < now())
     or (v_promo.usage_limit is not null and v_promo.used_count >= v_promo.usage_limit)
     or p_subtotal < v_promo.min_subtotal
  then
    return 0;
  end if;

  v_discount := case v_promo.kind
                  when 'percent' then p_subtotal * v_promo.value / 100
                  else v_promo.value
                end;

  if v_promo.max_discount is not null then
    v_discount := least(v_discount, v_promo.max_discount);
  end if;

  -- Never hand out more than the order is worth: a 50-peso code on a 35-peso
  -- order discounts 35, not 50. Without this the total could go negative.
  return round(least(v_discount, p_subtotal), 2);
end;
$$;

revoke all on function public.promo_discount_for(text, numeric) from public;
grant execute on function public.promo_discount_for(text, numeric) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- The same answer, in words, before the diner commits to anything
-- ---------------------------------------------------------------------------
create or replace function public.preview_promo(
  p_code     text,
  p_subtotal numeric default 0
)
returns table (valid boolean, discount numeric, label text, reason text)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_promo    public.promo_codes;
  v_discount numeric(10,2);
  v_code     text := upper(trim(coalesce(p_code, '')));
begin
  if not public.is_real_account() then
    return query select false, 0::numeric, ''::text,
      'Codes are for account holders. Sign in or make an account to use this one — it takes a moment and the code will still work.'::text;
    return;
  end if;

  select * into v_promo from public.promo_codes where code = v_code;

  if v_promo.code is null then
    return query select false, 0::numeric, ''::text, 'That code does not exist.'::text;
    return;
  end if;

  if exists (
    select 1 from public.promo_redemptions r
     where r.code = v_code and r.customer_id = auth.uid()
  ) then
    return query select false, 0::numeric, v_promo.label,
      'You have already claimed this code. Each one is good once per account.'::text;
    return;
  end if;

  if not v_promo.active then
    return query select false, 0::numeric, v_promo.label, 'That promo is not running.'::text;
    return;
  end if;

  if v_promo.starts_at > now() then
    return query select false, 0::numeric, v_promo.label, 'That promo has not started yet.'::text;
    return;
  end if;

  if v_promo.ends_at is not null and v_promo.ends_at < now() then
    return query select false, 0::numeric, v_promo.label, 'That promo has ended.'::text;
    return;
  end if;

  if v_promo.usage_limit is not null and v_promo.used_count >= v_promo.usage_limit then
    return query select false, 0::numeric, v_promo.label, 'That promo has been fully claimed.'::text;
    return;
  end if;

  if p_subtotal < v_promo.min_subtotal then
    return query select false, 0::numeric, v_promo.label,
      format('Spend at least %s to use this.', to_char(v_promo.min_subtotal, 'FM999999.00'))::text;
    return;
  end if;

  v_discount := public.promo_discount_for(v_promo.code, p_subtotal);
  return query select true, v_discount, v_promo.label, ''::text;
end;
$$;

revoke all on function public.preview_promo(text, numeric) from public;
grant execute on function public.preview_promo(text, numeric) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- create_ticket() — claims the redemption in the same transaction as the price
-- ---------------------------------------------------------------------------
create or replace function public.create_ticket(
  p_items          jsonb,
  p_customer_name  text default null,
  p_payment_method text default 'cash',
  p_promo_code     text default null,
  p_pickup_at      timestamptz default null,
  p_device_token   uuid default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_items    jsonb := '[]'::jsonb;
  v_subtotal numeric(10,2) := 0;
  v_discount numeric(10,2) := 0;
  v_code     text;
  v_promo    text := nullif(upper(trim(coalesce(p_promo_code, ''))), '');
  v_order    public.orders;
  v_row      record;
  v_method   text := lower(coalesce(p_payment_method, 'cash'));
  v_settings public.payment_settings;
  v_claimed  int;
  v_customer uuid := auth.uid();
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'a ticket needs at least one item';
  end if;

  if v_method not in ('cash', 'gcash') then
    raise exception 'payment method must be cash or gcash';
  end if;

  -- Staff accounts are not customers. Without this a cashier testing the
  -- storefront would quietly attach their own orders to their staff account.
  if v_customer is not null and public.is_staff() then
    v_customer := null;
  end if;

  select * into v_settings from public.payment_settings where id = 1;
  if v_method = 'gcash' and not coalesce(v_settings.gcash_enabled, true) then
    raise exception 'GCash is not being accepted right now';
  end if;
  if v_method = 'cash' and not coalesce(v_settings.cash_enabled, true) then
    raise exception 'cash is not being accepted right now';
  end if;

  for v_row in
    select d.id,
           d.name,
           d.price,
           sum(greatest(1, coalesce((item ->> 'qty')::int, 1)))::int as qty
    from jsonb_array_elements(p_items) as item
    join public.dishes d on d.id = item ->> 'id'
    where d.available
    group by d.id, d.name, d.price
  loop
    v_items := v_items || jsonb_build_object(
      'id', v_row.id, 'name', v_row.name, 'qty', v_row.qty, 'price', v_row.price
    );
    v_subtotal := v_subtotal + (v_row.price * v_row.qty);
  end loop;

  if jsonb_array_length(v_items) = 0 then
    raise exception 'none of the requested dishes are available';
  end if;

  -- A discount has to land on somebody. With no customer on the order there is
  -- nothing for "once each" to be counted against, so there is no discount.
  if v_promo is not null and v_customer is null then
    v_promo := null;
  end if;

  if v_promo is not null then
    v_discount := public.promo_discount_for(v_promo, v_subtotal);

    if v_discount > 0 then
      -- The promotion's own cap first.
      update public.promo_codes
         set used_count = used_count + 1
       where code = v_promo
         and (usage_limit is null or used_count < usage_limit);

      get diagnostics v_claimed = row_count;
      if v_claimed = 0 then
        v_discount := 0;
        v_promo    := null;
      else
        -- Then this diner's one and only go at it. The key is what decides;
        -- losing the race costs the discount, never the lunch.
        begin
          insert into public.promo_redemptions (code, customer_id)
          values (v_promo, v_customer);
        exception when unique_violation then
          update public.promo_codes
             set used_count = greatest(used_count - 1, 0)
           where code = v_promo;
          v_discount := 0;
          v_promo    := null;
        end;
      end if;
    else
      v_promo := null;
    end if;
  end if;

  v_code := public.generate_ticket_code();

  insert into public.orders
    (reference, ticket_code, customer_name, customer_id, device_token, items,
     subtotal, discount, promo_code, total,
     payment_method, status, payment_status, pickup_at)
  values
    (v_code, v_code, nullif(trim(coalesce(p_customer_name, '')), ''), v_customer,
     p_device_token, v_items,
     v_subtotal, v_discount, v_promo, v_subtotal - v_discount,
     v_method, 'pending', 'unpaid', p_pickup_at)
  returning * into v_order;

  -- Which order spent it, for the owner reading the promotion back later.
  if v_promo is not null then
    update public.promo_redemptions
       set order_id = v_order.id
     where code = v_promo and customer_id = v_customer;
  end if;

  return v_order;
end;
$$;

revoke all on function public.create_ticket(jsonb, text, text, text, timestamptz, uuid) from public;
grant execute on function public.create_ticket(jsonb, text, text, text, timestamptz, uuid) to anon, authenticated;
SQL);
    }

    public function down(): void
    {
        DB::unprepared('drop table if exists public.promo_redemptions cascade;');
    }
};
