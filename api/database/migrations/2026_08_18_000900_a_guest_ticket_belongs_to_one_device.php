<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Stops a guest ticket being everybody's ticket.
 *
 * The read policy said: staff, or your own account, OR anything created in the
 * last 24 hours. That last clause is what let a ticket on a phone follow itself
 * without an account, and it is far too generous — it does not require the
 * code, so any anonymous caller could list every order placed today, with the
 * customer's name, what they ate, what they paid, and the path to their GCash
 * receipt. Guessing was never necessary.
 *
 * The fix is to give the device an identity the database can check. On the
 * first order a device mints a random token, keeps it, and sends it with every
 * ticket it raises. The order records it. From then on the device can ask for
 * its own orders and nobody else's, and the code is no longer the only thing
 * standing between a stranger and somebody's lunch.
 *
 * That solves the second problem at the same time. A guest who closed the page
 * without copying the code used to have nothing: the counter could look it up,
 * but had no way to tell whether the person asking actually placed it. The
 * device now remembers on their behalf, so a returning guest sees their own
 * ongoing tickets without having written anything down.
 *
 * Reads go through functions rather than a policy because the token cannot be
 * put in a policy: it is not in the caller's JWT, and a custom header would not
 * survive Realtime or a preflight. A function takes it as an argument, which is
 * plain to read and works from every client.
 *
 * The blanket window goes. Two consequences, both accepted deliberately:
 *
 *  - Tickets raised before this migration have no token, so a guest holding one
 *    can no longer pull it up themselves. The counter still can. Within a day
 *    the problem ages out of existence.
 *  - Realtime stops delivering order changes to guests, because Realtime
 *    authorises with the JWT alone and a guest has none. The ticket screens
 *    poll instead, which costs one row every few seconds while somebody is
 *    actually watching the screen.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
alter table public.orders
  add column if not exists device_token uuid;

comment on column public.orders.device_token is
  'The device that raised this ticket, for guests who have no account. Never shown to anybody; it only ever appears as an argument to my_orders(), find_my_ticket() and cancel_my_order().';

create index if not exists orders_device_token_idx
  on public.orders (device_token, created_at desc)
  where device_token is not null;

-- ---------------------------------------------------------------------------
-- Reading orders: staff, or your own account. Nothing else.
-- ---------------------------------------------------------------------------
drop policy if exists "orders_select_own_recent_or_staff" on public.orders;

create policy "orders_select_own_or_staff"
  on public.orders for select
  using (
    public.is_staff()
    or (customer_id is not null and customer_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- create_ticket() — now records which device raised it
-- ---------------------------------------------------------------------------
drop function if exists public.create_ticket(jsonb, text, text, text, timestamptz);

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

  if v_promo is not null then
    v_discount := public.promo_discount_for(v_promo, v_subtotal);

    if v_discount > 0 then
      update public.promo_codes
         set used_count = used_count + 1
       where code = v_promo
         and (usage_limit is null or used_count < usage_limit);

      get diagnostics v_claimed = row_count;
      if v_claimed = 0 then
        v_discount := 0;
        v_promo    := null;
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

  return v_order;
end;
$$;

revoke all on function public.create_ticket(jsonb, text, text, text, timestamptz, uuid) from public;
grant execute on function public.create_ticket(jsonb, text, text, text, timestamptz, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- What this device ordered
-- ---------------------------------------------------------------------------
create or replace function public.my_orders(p_device_token uuid default null)
returns setof public.orders
language sql
security definer
set search_path = public
as $$
  select *
    from public.orders
   where (p_device_token is not null and device_token = p_device_token)
      -- A diner who signs in after ordering as a guest keeps both: the account
      -- carries across devices, the token carries the orders placed before
      -- there was an account to carry them.
      or (auth.uid() is not null and customer_id = auth.uid())
   order by created_at desc
   limit 30;
$$;

revoke all on function public.my_orders(uuid) from public;
grant execute on function public.my_orders(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- One ticket, if it is yours
-- ---------------------------------------------------------------------------
create or replace function public.find_my_ticket(
  p_ticket_code  text,
  p_device_token uuid default null
)
returns setof public.orders
language sql
security definer
set search_path = public
as $$
  select *
    from public.orders
   where ticket_code = upper(trim(p_ticket_code))
     and (
       (p_device_token is not null and device_token = p_device_token)
       or (auth.uid() is not null and customer_id = auth.uid())
       or public.is_staff()
     )
   limit 1;
$$;

revoke all on function public.find_my_ticket(text, uuid) from public;
grant execute on function public.find_my_ticket(text, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Cancelling: same ownership test, now that the 24 hour window is gone
-- ---------------------------------------------------------------------------
drop function if exists public.cancel_my_order(text);

create or replace function public.cancel_my_order(
  p_ticket_code  text,
  p_device_token uuid default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
begin
  select * into v_order
    from public.orders
   where ticket_code = upper(trim(p_ticket_code));

  if not found then
    raise exception 'no ticket %', p_ticket_code;
  end if;

  if not (
    (p_device_token is not null and v_order.device_token = p_device_token)
    or (auth.uid() is not null and v_order.customer_id = auth.uid())
  ) then
    raise exception 'that ticket belongs to somebody else';
  end if;

  if v_order.paid_at is not null then
    raise exception 'that order is already paid, please ask at the counter';
  end if;

  if v_order.status <> 'pending' then
    raise exception 'the kitchen has already started that order';
  end if;

  update public.orders
     set status = 'cancelled'
   where id = v_order.id
  returning * into v_order;

  return v_order;
end;
$$;

revoke all on function public.cancel_my_order(text, uuid) from public;
grant execute on function public.cancel_my_order(text, uuid) to anon, authenticated;
SQL);
    }

    public function down(): void
    {
        DB::unprepared(<<<'SQL'
drop function if exists public.find_my_ticket(text, uuid);
drop function if exists public.my_orders(uuid);
drop function if exists public.cancel_my_order(text, uuid);

drop policy if exists "orders_select_own_or_staff" on public.orders;
create policy "orders_select_own_recent_or_staff"
  on public.orders for select
  using (
    public.is_staff()
    or (customer_id is not null and customer_id = auth.uid())
    or created_at > now() - interval '24 hours'
  );
SQL);
    }
};
