-- ============================================================================
-- Bencris · Inventory that answers "how much do I still need to buy?"
-- ----------------------------------------------------------------------------
-- The old model had "reorder at": a bare threshold with no context. Seeing
-- "2.5" next to "reorder at 1" tells the owner almost nothing, because it never
-- says how much they are supposed to have in the first place.
--
-- What the owner actually wants to say is "a full stock of this is 100 eggs".
-- Then the count means something: 30 of 100, so buy 70. That shortfall is
-- exactly the number to write on the palengke list.
--
-- last_delivery also had to be typed by hand, so it was wrong the moment anyone
-- forgot. Receiving stock now stamps it automatically.
-- ============================================================================

alter table public.inventory
  add column par_level numeric(10,2) not null default 0 check (par_level >= 0);

comment on column public.inventory.par_level is
  'A full stock of this ingredient. The screen shows stock out of par_level, and par_level minus stock is what to buy.';

-- last_delivery was free text ('Apr 22', or the em dash placeholder). A real
-- date lets the screen say "3 days ago" and lets it be set automatically.
alter table public.inventory
  add column last_received_at timestamptz;

comment on column public.inventory.last_received_at is
  'Stamped automatically by receive_stock(). The old free-text last_delivery is kept for anything already recorded.';

-- Seed a sensible full-stock figure from what is already there, so no row
-- starts at zero and the screen is useful immediately. The owner corrects
-- these on the Inventory screen.
update public.inventory
   set par_level = greatest(round(reorder_at * 4, 2), round(stock, 2), 1);

-- ---------------------------------------------------------------------------
-- receive_stock() — the one way stock goes UP.
--
-- Cooking takes ingredients out (cook_batch); buying puts them back. Keeping
-- both as explicit actions means the stock figure always has an explanation,
-- and the delivery date can never drift out of step with reality.
-- ---------------------------------------------------------------------------
create or replace function public.receive_stock(
  p_inventory_id text,
  p_quantity     numeric
)
returns public.inventory
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.inventory;
begin
  if not public.is_admin() then
    raise exception 'only the owner may record a delivery';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'how much was delivered?';
  end if;

  update public.inventory
     set stock            = stock + p_quantity,
         last_received_at = now(),
         last_delivery    = to_char(now(), 'Mon DD')
   where id = p_inventory_id
   returning * into v_item;

  if v_item.id is null then
    raise exception 'no ingredient %', p_inventory_id;
  end if;

  return v_item;
end;
$$;

grant execute on function public.receive_stock(text, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- shopping_list() — what to buy, and how much.
--
-- Everything sitting below its par level, with the exact shortfall. This is the
-- list the owner takes to the palengke.
-- ---------------------------------------------------------------------------
create or replace function public.shopping_list()
returns table (
  id text, name text, unit text,
  stock numeric, par_level numeric, shortfall numeric,
  last_received_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select i.id, i.name, i.unit,
         i.stock, i.par_level,
         round(i.par_level - i.stock, 2) as shortfall,
         i.last_received_at
    from public.inventory i
   where i.par_level > 0
     and i.stock < i.par_level
   order by (i.stock / nullif(i.par_level, 0)) asc;
$$;

grant execute on function public.shopping_list() to authenticated;
