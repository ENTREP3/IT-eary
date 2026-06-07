-- ============================================================================
-- IT-eary · Phase 4 — Menu, Inventory, Categories & Expenses move to Postgres
-- ----------------------------------------------------------------------------
-- Previously these lived only in the browser (Zustand + localStorage), so the
-- storefront and admin weren't truly one system. Now they're server-backed:
-- public read for the menu, admin-only writes, all enforced by RLS.
-- ============================================================================

-- ---------- categories ------------------------------------------------------
create table public.categories (
  name       text primary key,
  created_at timestamptz not null default now()
);
alter table public.categories enable row level security;

create policy "categories_read_all" on public.categories
  for select using (true);
create policy "categories_admin_write" on public.categories
  for all using (public.is_admin()) with check (public.is_admin());

grant select on public.categories to anon, authenticated;
grant insert, update, delete on public.categories to authenticated;

-- ---------- dishes ----------------------------------------------------------
create table public.dishes (
  id          text primary key,
  name        text not null,
  tagalog     text not null default '',
  price       numeric(10,2) not null default 0 check (price >= 0),
  category    text not null default 'Ulam',
  description text not null default '',
  image       text not null default '',
  available   boolean not null default true,
  sold_today  int not null default 0,
  -- NULL = unlimited; when set, the order trigger decrements it and flips
  -- `available` to false at 0 so you can't oversell a limited dish.
  stock_count int,
  created_at  timestamptz not null default now()
);
alter table public.dishes enable row level security;

create policy "dishes_read_all" on public.dishes
  for select using (true);
create policy "dishes_admin_write" on public.dishes
  for all using (public.is_admin()) with check (public.is_admin());

grant select on public.dishes to anon, authenticated;
grant insert, update, delete on public.dishes to authenticated;

-- ---------- inventory (admin-only) -----------------------------------------
create table public.inventory (
  id            text primary key,
  name          text not null,
  unit          text not null default 'kg',
  stock         numeric(10,2) not null default 0,
  reorder_at    numeric(10,2) not null default 0,
  last_delivery text not null default '—',
  created_at    timestamptz not null default now()
);
alter table public.inventory enable row level security;

create policy "inventory_admin_all" on public.inventory
  for all using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.inventory to authenticated;

-- ---------- expenses (admin-only) — makes the profit chart real -------------
create table public.expenses (
  id         uuid primary key default gen_random_uuid(),
  label      text not null,
  amount     numeric(10,2) not null check (amount >= 0),
  category   text not null default 'Supplies',
  spent_on   date not null default current_date,
  created_at timestamptz not null default now()
);
alter table public.expenses enable row level security;

create policy "expenses_admin_all" on public.expenses
  for all using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.expenses to authenticated;

create index expenses_spent_on_idx on public.expenses (spent_on desc);

-- ----------------------------------------------------------------------------
-- #3 Order fulfillment trigger: when an order is inserted, walk its line items
-- and (a) bump dishes.sold_today, (b) decrement stock_count where tracked,
-- flipping `available` off at zero. Runs in the same transaction as the insert.
-- ----------------------------------------------------------------------------
create or replace function public.apply_order_to_dishes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  did  text;
  q    int;
begin
  for item in select * from jsonb_array_elements(coalesce(new.items, '[]'::jsonb))
  loop
    did := item ->> 'id';
    q   := coalesce((item ->> 'qty')::int, 0);
    if did is null or q <= 0 then
      continue;
    end if;

    update public.dishes
      set sold_today  = sold_today + q,
          stock_count = case when stock_count is null then null
                             else greatest(0, stock_count - q) end,
          available   = case when stock_count is null then available
                             when stock_count - q <= 0 then false
                             else available end
      where id = did;
  end loop;
  return new;
end;
$$;

create trigger orders_apply_to_dishes
  after insert on public.orders
  for each row execute function public.apply_order_to_dishes();

-- ----------------------------------------------------------------------------
-- Realtime: storefront menu + admin inventory update live across devices.
-- ----------------------------------------------------------------------------
alter publication supabase_realtime add table public.dishes;
alter publication supabase_realtime add table public.categories;
alter publication supabase_realtime add table public.inventory;
