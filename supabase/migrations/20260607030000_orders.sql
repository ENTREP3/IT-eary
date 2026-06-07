-- ============================================================================
-- IT-eary · Phase 2 — Orders
-- ----------------------------------------------------------------------------
-- Each completed checkout writes one row here, including the payment method the
-- diner confirmed (Cash / GCash). This table is the source of truth for the
-- admin's "How diners pay" chart, latest orders, and today's order pulse.
-- ============================================================================

create table public.orders (
  id             uuid primary key default gen_random_uuid(),
  reference      text not null unique,
  customer_id    uuid references auth.users (id) on delete set null,
  customer_name  text,
  items          jsonb not null default '[]'::jsonb,   -- snapshot of line items
  total          numeric(10,2) not null check (total >= 0),
  payment_method text not null check (payment_method in ('cash', 'gcash')),
  status         text not null default 'pending'
                   check (status in ('pending','paid','preparing','ready','completed','cancelled')),
  created_at     timestamptz not null default now()
);

comment on table public.orders is
  'One row per checkout. payment_method drives the "How diners pay" analytics.';

create index orders_created_at_idx on public.orders (created_at desc);
create index orders_customer_idx   on public.orders (customer_id);

alter table public.orders enable row level security;

-- Insert: a logged-in customer may create an order for themselves; admins any.
create policy "orders_insert_own"
  on public.orders for insert
  to authenticated
  with check (customer_id = auth.uid() or public.is_admin());

-- Select: customers see their own orders; admins see everything.
create policy "orders_select_own_or_admin"
  on public.orders for select
  to authenticated
  using (customer_id = auth.uid() or public.is_admin());

-- Update / delete: admins only (e.g. moving an order to "preparing").
create policy "orders_admin_update"
  on public.orders for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "orders_admin_delete"
  on public.orders for delete
  to authenticated
  using (public.is_admin());

grant select, insert on public.orders to authenticated;
grant update, delete on public.orders to authenticated;

-- Broadcast inserts/updates over Realtime so the admin dashboard and its
-- notification bell update live. RLS still applies to realtime payloads.
alter publication supabase_realtime add table public.orders;

-- ----------------------------------------------------------------------------
-- admin_payment_mix(): aggregate payment methods over the last N days. Returned
-- straight to the dashboard pie chart. SECURITY DEFINER + explicit admin guard
-- so only the owner can pull the aggregate.
-- ----------------------------------------------------------------------------
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
    group by o.payment_method;
end;
$$;

grant execute on function public.admin_payment_mix(int) to authenticated;
