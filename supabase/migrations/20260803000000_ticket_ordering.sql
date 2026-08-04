-- ============================================================================
-- IT-eary · Ticket-Based Ordering + Cashier Role
-- ----------------------------------------------------------------------------
-- Replaces the account-based checkout with a counter flow:
--   customer builds a cart (no login) -> create_ticket() issues a short code
--   -> customer shows the code at the counter -> cashier types it in, collects
--   payment, and calls mark_ticket_paid() -> receipt for both sides.
--
-- Customers have no auth accounts at all. Every customer-side write goes
-- through a SECURITY DEFINER RPC, so `anon` never gets direct table writes.
-- ============================================================================

-- The `cashier` enum value is added in the preceding migration
-- (20260802235900_cashier_role_enum.sql) — Postgres requires it to be
-- committed before the function bodies and policies below can reference it.

-- ---------------------------------------------------------------------------
-- 1. is_staff(): admin OR cashier. Mirrors is_admin()'s SECURITY DEFINER
--    pattern so RLS policies on profiles don't recurse.
-- ---------------------------------------------------------------------------
create or replace function public.is_staff()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'cashier')
  );
$$;

grant execute on function public.is_staff() to anon, authenticated;

create or replace function public.promote_to_cashier(target_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_id uuid;
begin
  if not public.is_admin() and auth.uid() is not null then
    raise exception 'only admins may assign the cashier role';
  end if;

  select id into target_id from auth.users where email = target_email;
  if target_id is null then
    raise exception 'no user with email %', target_email;
  end if;

  update public.profiles set role = 'cashier' where id = target_id;
end;
$$;

grant execute on function public.promote_to_cashier(text) to authenticated;

-- Staff need to read each other's profiles (the cashier screen shows who took
-- payment). The old policy only allowed self-or-admin.
drop policy if exists "profiles_select_self_or_admin" on public.profiles;
create policy "profiles_select_self_or_staff"
  on public.profiles for select
  using (id = auth.uid() or public.is_staff());

-- ---------------------------------------------------------------------------
-- 2. orders -> tickets
-- ---------------------------------------------------------------------------
-- The old policies reference customer_id, so they must go before the column
-- can be dropped. The replacements are created in section 6.
drop policy if exists "orders_insert_own"          on public.orders;
drop policy if exists "orders_select_own_or_admin" on public.orders;
drop policy if exists "orders_admin_update"        on public.orders;
drop policy if exists "orders_admin_delete"        on public.orders;

alter table public.orders
  add column ticket_code text,
  add column paid_at     timestamptz,
  add column paid_by     uuid references auth.users (id) on delete set null;

-- Backfill any existing rows so the NOT NULL below can be applied.
update public.orders set ticket_code = 'LEGACY' || substr(replace(id::text, '-', ''), 1, 6)
  where ticket_code is null;

alter table public.orders
  alter column ticket_code set not null,
  add constraint orders_ticket_code_key unique (ticket_code);

-- The customer no longer chooses how they'll pay; the cashier records it when
-- money actually changes hands. NULL therefore means "not yet paid".
alter table public.orders alter column payment_method drop not null;

-- customer_id referenced auth.users, which customers no longer have.
alter table public.orders drop column customer_id;

create index orders_ticket_code_idx on public.orders (ticket_code);

comment on column public.orders.ticket_code is
  'Short human-typeable code the diner shows at the counter.';
comment on column public.orders.payment_method is
  'NULL until a cashier confirms payment via mark_ticket_paid().';

-- ---------------------------------------------------------------------------
-- 3. Ticket code generation
--    32-symbol alphabet with O/0/I/1 removed so codes are unambiguous when
--    read aloud or typed. 6 chars ~= 1.07 billion combinations.
-- ---------------------------------------------------------------------------
create or replace function public.generate_ticket_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  candidate text;
  attempt   int := 0;
begin
  loop
    candidate := '';
    for _ in 1..6 loop
      candidate := candidate || substr(alphabet, floor(random() * length(alphabet))::int + 1, 1);
    end loop;

    exit when not exists (select 1 from public.orders where ticket_code = candidate);

    attempt := attempt + 1;
    if attempt >= 20 then
      raise exception 'could not allocate a unique ticket code';
    end if;
  end loop;

  return candidate;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. create_ticket() — the ONLY way an order enters the system.
--
--    SECURITY: the client sends dish ids + quantities only. Prices and the
--    total are recomputed here from public.dishes, so a tampered client cannot
--    pay ₱1 for a ₱120 dish. Unavailable dishes are rejected outright.
-- ---------------------------------------------------------------------------
create or replace function public.create_ticket(
  p_items         jsonb,
  p_customer_name text default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_items  jsonb := '[]'::jsonb;
  v_total  numeric(10,2) := 0;
  v_code   text;
  v_order  public.orders;
  v_row    record;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'a ticket needs at least one item';
  end if;

  -- Resolve every line against the live menu, collapsing duplicate ids.
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
    v_total := v_total + (v_row.price * v_row.qty);
  end loop;

  if jsonb_array_length(v_items) = 0 then
    raise exception 'none of the requested dishes are available';
  end if;

  v_code := public.generate_ticket_code();

  insert into public.orders (reference, ticket_code, customer_name, items, total, status)
  values (v_code, v_code, nullif(trim(coalesce(p_customer_name, '')), ''), v_items, v_total, 'pending')
  returning * into v_order;

  return v_order;
end;
$$;

grant execute on function public.create_ticket(jsonb, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. mark_ticket_paid() — staff-only. Rejects an already-paid ticket so a
--    double-click can't read as a second payment.
-- ---------------------------------------------------------------------------
create or replace function public.mark_ticket_paid(
  p_ticket_code text,
  p_method      text
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
    raise exception 'only staff may record payment';
  end if;

  if p_method not in ('cash', 'gcash') then
    raise exception 'payment method must be cash or gcash';
  end if;

  select * into v_order
    from public.orders
   where ticket_code = upper(trim(p_ticket_code))
   for update;

  if v_order.id is null then
    raise exception 'no ticket %', p_ticket_code;
  end if;

  if v_order.status = 'cancelled' then
    raise exception 'ticket % was cancelled', p_ticket_code;
  end if;

  if v_order.paid_at is not null then
    raise exception 'ticket % is already paid', p_ticket_code;
  end if;

  update public.orders
     set status         = 'paid',
         payment_method = p_method,
         paid_at        = now(),
         paid_by        = auth.uid()
   where id = v_order.id
   returning * into v_order;

  return v_order;
end;
$$;

grant execute on function public.mark_ticket_paid(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. RLS — rebuilt for the no-accounts model.
--
--    TRADE-OFF (accepted): anon can select orders from the last 24h, not
--    strictly "their own" — there is no identity to scope by. This is what
--    lets the customer app read its ticket and receive live status updates.
--    Codes are ~1 billion combinations and orders carry no personal data
--    beyond an optional first name. Anon cannot write to orders at all.
-- ---------------------------------------------------------------------------
create policy "orders_select_recent_or_staff"
  on public.orders for select
  using (public.is_staff() or created_at > now() - interval '24 hours');

create policy "orders_staff_update"
  on public.orders for update
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy "orders_admin_delete"
  on public.orders for delete
  to authenticated
  using (public.is_admin());

-- Inserts happen exclusively through create_ticket(); no client gets INSERT.
revoke all on public.orders from anon, authenticated;
grant select on public.orders to anon, authenticated;
grant update on public.orders to authenticated;
grant delete on public.orders to authenticated;

-- ---------------------------------------------------------------------------
-- 7. "How diners pay" must count only tickets that were actually settled.
--    Unpaid tickets have payment_method NULL and would otherwise surface as a
--    phantom third slice in the dashboard pie chart.
-- ---------------------------------------------------------------------------
create or replace function public.admin_payment_mix(p_days int default 7)
returns table (method text, order_count bigint, revenue numeric)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admins only';
  end if;

  return query
    select o.payment_method,
           count(*)::bigint,
           coalesce(sum(o.total), 0)::numeric
    from public.orders o
    where o.created_at >= now() - make_interval(days => p_days)
      and o.payment_method is not null
    group by o.payment_method;
end;
$$;
