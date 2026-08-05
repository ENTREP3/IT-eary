-- ============================================================================
-- Bencris · Optional customer accounts
-- ----------------------------------------------------------------------------
-- Ordering stays possible without an account. That is deliberate: on a meal
-- costing under a hundred pesos, a signup wall is the most reliable way to lose
-- the sale, and the ticket-code flow is what makes the counter fast.
--
-- What an account adds is everything that needs memory across visits:
--   * order history that survives clearing the browser
--   * payment history
--   * a live page showing whether the order is preparing, ready or completed
--   * loyalty stamps
--   * being told when a sold-out dish is back
--   * seeing new promotions the owner starts
--
-- A guest order simply has customer_id NULL and behaves exactly as before.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. orders gains an optional owner and an optional pickup time
-- ---------------------------------------------------------------------------
alter table public.orders
  add column customer_id uuid references auth.users (id) on delete set null,
  add column pickup_at   timestamptz;

create index orders_customer_idx on public.orders (customer_id)
  where customer_id is not null;

comment on column public.orders.customer_id is
  'NULL for a guest order. Set automatically when a signed-in customer checks out.';
comment on column public.orders.pickup_at is
  'When the diner said they would collect. NULL means as soon as it is ready.';

-- ---------------------------------------------------------------------------
-- 2. Reading orders
--
-- Guests keep the 24 hour window, which is what lets a ticket on a phone follow
-- itself with no account. A signed-in customer additionally sees their OWN
-- orders forever, which is the whole point of having an account.
-- ---------------------------------------------------------------------------
drop policy if exists "orders_select_recent_or_staff" on public.orders;

create policy "orders_select_own_recent_or_staff"
  on public.orders for select
  using (
    public.is_staff()
    or (customer_id is not null and customer_id = auth.uid())
    or created_at > now() - interval '24 hours'
  );

-- ---------------------------------------------------------------------------
-- 3. create_ticket() — records who ordered, if anyone, and when they will collect
-- ---------------------------------------------------------------------------
create or replace function public.create_ticket(
  p_items          jsonb,
  p_customer_name  text default null,
  p_payment_method text default 'cash',
  p_promo_code     text default null,
  p_pickup_at      timestamptz default null
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
    (reference, ticket_code, customer_name, customer_id, items,
     subtotal, discount, promo_code, total,
     payment_method, status, payment_status, pickup_at)
  values
    (v_code, v_code, nullif(trim(coalesce(p_customer_name, '')), ''), v_customer, v_items,
     v_subtotal, v_discount, v_promo, v_subtotal - v_discount,
     v_method, 'pending', 'unpaid', p_pickup_at)
  returning * into v_order;

  return v_order;
end;
$$;

grant execute on function public.create_ticket(jsonb, text, text, text, timestamptz) to anon, authenticated;

-- Retire the previous signature so PostgREST is never ambiguous.
drop function if exists public.create_ticket(jsonb, text, text, text);

-- Records when the diner actually walked away with the food. This is what the
-- loyalty count is based on, so it has to be a real timestamp rather than an
-- inference from the status.
alter table public.orders add column completed_at timestamptz;

-- ---------------------------------------------------------------------------
-- 4. advance_order_status() — the kitchen flow, usable by the counter too
--
-- The counter is the same person as the kitchen in a karinderya this size, so
-- restricting status changes to the owner made the feature unusable in
-- practice. Any staff member may advance an order; only the owner may cancel.
-- ---------------------------------------------------------------------------
create or replace function public.advance_order_status(
  p_ticket_code text,
  p_status      text
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
begin
  if not public.is_staff() then
    raise exception 'only staff may change an order status';
  end if;

  if p_status not in ('preparing', 'ready', 'completed', 'cancelled') then
    raise exception 'unknown status %', p_status;
  end if;

  if p_status = 'cancelled' and not public.is_admin() then
    raise exception 'only the owner may cancel an order';
  end if;

  select * into v_order from public.orders
   where ticket_code = upper(trim(p_ticket_code)) for update;

  if v_order.id is null then
    raise exception 'no ticket %', p_ticket_code;
  end if;

  -- Food should not start cooking before it is paid for.
  if p_status in ('preparing', 'ready', 'completed') and v_order.paid_at is null then
    raise exception 'ticket % has not been settled yet', p_ticket_code;
  end if;

  update public.orders
     set status       = p_status,
         completed_at = case when p_status = 'completed' then now() else completed_at end
   where id = v_order.id
   returning * into v_order;

  return v_order;
end;
$$;

grant execute on function public.advance_order_status(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Being told when a sold-out dish is back
-- ---------------------------------------------------------------------------
create table public.stock_alerts (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users (id) on delete cascade,
  dish_id     text not null references public.dishes (id) on delete cascade,
  created_at  timestamptz not null default now(),
  notified_at timestamptz,

  constraint stock_alerts_one_per_dish unique (customer_id, dish_id)
);

alter table public.stock_alerts enable row level security;

create policy "stock_alerts_own" on public.stock_alerts
  for all
  using (customer_id = auth.uid())
  with check (customer_id = auth.uid());

grant select, insert, delete on public.stock_alerts to authenticated;

-- When a dish comes back, mark every waiting alert so the customer's page can
-- surface it. Deliberately a flag rather than an email: this costs nothing.
create or replace function public.flag_restocked_dishes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.available and not old.available then
    update public.stock_alerts
       set notified_at = now()
     where dish_id = new.id
       and notified_at is null;
  end if;
  return new;
end;
$$;

create trigger dishes_restocked
  after update of available on public.dishes
  for each row execute function public.flag_restocked_dishes();

-- ---------------------------------------------------------------------------
-- 6. Loyalty stamps
--
-- Counted from completed orders rather than a separate tally, so the number can
-- never drift from what actually happened.
-- ---------------------------------------------------------------------------
create table public.loyalty_rewards (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references auth.users (id) on delete cascade,
  code         text not null references public.promo_codes (code) on delete cascade,
  earned_at    timestamptz not null default now(),
  redeemed_at  timestamptz
);

alter table public.loyalty_rewards enable row level security;

create policy "loyalty_own" on public.loyalty_rewards
  for select using (customer_id = auth.uid() or public.is_admin());

grant select on public.loyalty_rewards to authenticated;

/**
 * How many completed orders this customer has, and whether a reward is due.
 * Every fifth completed order earns one.
 */
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
  if v_me is null then
    return query select 0, 5, '[]'::jsonb;
    return;
  end if;

  select count(*)::int into v_count
    from public.orders
   where customer_id = v_me and status = 'completed';

  return query
    select v_count,
           (5 - (v_count % 5))::int,
           coalesce(
             (select jsonb_agg(jsonb_build_object('code', l.code, 'earned_at', l.earned_at, 'redeemed_at', l.redeemed_at))
                from public.loyalty_rewards l where l.customer_id = v_me),
             '[]'::jsonb
           );
end;
$$;

grant execute on function public.my_loyalty() to authenticated;

/**
 * Issues a personal discount code once a customer reaches another multiple of
 * five completed orders. Called by the customer's own orders page; issuing is
 * idempotent because the code is derived from the milestone.
 */
create or replace function public.claim_loyalty_reward()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me        uuid := auth.uid();
  v_count     int;
  v_milestone int;
  v_earned    int;
  v_code      text;
begin
  if v_me is null then
    raise exception 'sign in to claim a reward';
  end if;

  select count(*)::int into v_count
    from public.orders
   where customer_id = v_me and status = 'completed';

  v_milestone := v_count / 5;
  if v_milestone < 1 then
    raise exception 'you need % more completed orders', 5 - v_count;
  end if;

  select count(*)::int into v_earned
    from public.loyalty_rewards where customer_id = v_me;

  if v_earned >= v_milestone then
    raise exception 'you have already claimed every reward you have earned';
  end if;

  -- Short, personal and unguessable enough for a discount worth 20 pesos.
  v_code := 'SUKI' || upper(substr(replace(v_me::text, '-', ''), 1, 4)) || v_milestone::text;

  insert into public.promo_codes (code, label, kind, value, min_subtotal, usage_limit)
  values (v_code, 'Loyalty reward, 20 pesos off', 'fixed', 20, 60, 1)
  on conflict (code) do nothing;

  insert into public.loyalty_rewards (customer_id, code) values (v_me, v_code);

  return v_code;
end;
$$;

grant execute on function public.claim_loyalty_reward() to authenticated;
