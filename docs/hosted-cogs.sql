-- ============================================================================
-- Bencris · Ingredient costs, cost of goods sold, and price suggestions
-- ----------------------------------------------------------------------------
-- Run this in the hosted project SQL Editor.
--
-- It adds a buying price to each ingredient, works out what a serving costs to
-- make from the recipes that already exist, reports cost of goods sold, and
-- proposes a new price when an ingredient goes up.
--
-- One transaction: if anything fails, nothing is applied. Safe to run twice.
-- ============================================================================

begin;

-- ============================================================================
-- Bencris · What a dish costs to make, and when the price should follow
-- ----------------------------------------------------------------------------
-- The inventory knew how much pork was on hand but never what pork cost, so the
-- system could not answer the question every karinderya owner actually worries
-- about: am I still making money on this dish?
--
-- The recipes already record that one batch of sinigang takes 1.5 kg of pork and
-- feeds twenty. Add a price per kilo and the cost per serving falls out of that.
-- Nothing new has to be typed in twice.
--
-- WHY THIS MATTERS: ingredient prices move, menu prices do not. Pork going from
-- 300 to 350 a kilo quietly takes the margin out of every pork dish, and the
-- owner finds out weeks later when the takings look wrong. This makes the change
-- visible on the day it happens, and proposes the new price.
--
-- The system only ever SUGGESTS. Pricing is the owner's decision: they know the
-- competitor down the road, the suki who would notice, and what the market will
-- take. A system that repriced the menu by itself would be wrong about all three.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. What each ingredient costs
-- ---------------------------------------------------------------------------
alter table public.inventory
  add column if not exists cost_per_unit numeric(10,2) not null default 0
    check (cost_per_unit >= 0);

comment on column public.inventory.cost_per_unit is
  'Current buying price for one unit, in the ingredient''s own unit. 0 means not costed yet.';

-- Every delivery at a new price, kept as history. Without it the system could
-- say "pork costs 350" but never "pork went up from 300", and the increase is
-- the part the owner needs to see.
create table if not exists public.inventory_cost_history (
  id            uuid primary key default gen_random_uuid(),
  inventory_id  text not null references public.inventory (id) on delete cascade,
  cost_per_unit numeric(10,2) not null check (cost_per_unit >= 0),
  quantity      numeric(10,3),
  recorded_at   timestamptz not null default now()
);

create index if not exists inventory_cost_history_item_idx
  on public.inventory_cost_history (inventory_id, recorded_at desc);

alter table public.inventory_cost_history enable row level security;

create policy "cost_history_admin_all" on public.inventory_cost_history
  for all using (public.is_admin()) with check (public.is_admin());

grant select, insert on public.inventory_cost_history to authenticated;

-- ---------------------------------------------------------------------------
-- 2. The price the dish was costed against when it was last priced
--
-- Needed to answer "has the cost moved SINCE we set this price?". Without a
-- baseline the system can only report today's margin, not that it has slipped.
-- ---------------------------------------------------------------------------
alter table public.dishes
  add column if not exists cost_when_priced numeric(10,2);

comment on column public.dishes.cost_when_priced is
  'Cost to make one serving at the moment the price was last confirmed. NULL means never costed.';

-- ---------------------------------------------------------------------------
-- 3. dish_cost() — what one serving costs to make, right now
--
-- Recipe quantities are per BATCH, so the batch cost is divided by the servings
-- that batch yields. Returns NULL rather than 0 when anything is uncosted,
-- because a dish that appears to cost nothing would produce a nonsense margin
-- and an absurd price suggestion.
-- ---------------------------------------------------------------------------
create or replace function public.dish_cost(p_dish_id text)
returns numeric
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_yield  int;
  v_lines  int;
  v_zero   int;
  v_batch  numeric(10,2);
begin
  select batch_yield into v_yield from public.dishes where id = p_dish_id;
  if v_yield is null or v_yield <= 0 then
    return null;
  end if;

  select count(*),
         count(*) filter (where i.cost_per_unit = 0),
         sum(r.quantity * i.cost_per_unit)
    into v_lines, v_zero, v_batch
    from public.recipe_items r
    join public.inventory i on i.id = r.inventory_id
   where r.dish_id = p_dish_id;

  -- No recipe, or an ingredient nobody has priced yet: say so honestly.
  if v_lines = 0 or v_zero > 0 then
    return null;
  end if;

  return round(v_batch / v_yield, 2);
end;
$$;

grant execute on function public.dish_cost(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. receive_stock() — now records what was paid, and books the expense
--
-- Buying stock IS an expense, and it was being typed twice: once into the
-- inventory and again into the expenses screen, if anyone remembered. Recording
-- the delivery now does both, so the profit figure stops depending on memory.
-- ---------------------------------------------------------------------------
create or replace function public.receive_stock(
  p_inventory_id text,
  p_quantity     numeric,
  p_unit_cost    numeric default null
)
returns public.inventory
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.inventory;
  v_cost numeric(10,2);
begin
  if not public.is_admin() then
    raise exception 'only the owner may record a delivery';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'how much was delivered?';
  end if;

  select * into v_item from public.inventory where id = p_inventory_id;
  if v_item.id is null then
    raise exception 'no ingredient %', p_inventory_id;
  end if;

  -- Left out means "same price as last time", which is the common case and
  -- should not force the owner to retype a number that has not changed.
  v_cost := coalesce(p_unit_cost, v_item.cost_per_unit);

  update public.inventory
     set stock            = stock + p_quantity,
         cost_per_unit    = v_cost,
         last_received_at = now(),
         last_delivery    = to_char(now(), 'Mon DD')
   where id = p_inventory_id
   returning * into v_item;

  if v_cost > 0 then
    insert into public.inventory_cost_history (inventory_id, cost_per_unit, quantity)
    values (p_inventory_id, v_cost, p_quantity);

    -- The money actually spent on this delivery.
    insert into public.expenses (label, amount, category, spent_on)
    values (
      format('%s, %s %s', v_item.name, round(p_quantity, 2), v_item.unit),
      round(p_quantity * v_cost, 2),
      'Ingredients',
      current_date
    );
  end if;

  return v_item;
end;
$$;

-- The 2-argument version has to go, or PostgREST sees two candidates and the
-- call becomes ambiguous. Same trap as create_ticket().
drop function if exists public.receive_stock(text, numeric);

grant execute on function public.receive_stock(text, numeric, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. price_suggestions() — the dishes whose margin has slipped
--
-- Keeps the margin PERCENTAGE the owner originally chose, rather than the peso
-- amount. On a 95 peso dish sold at a 60% margin, holding the percentage keeps
-- the business working the same way as costs rise; holding the pesos quietly
-- erodes it every year.
-- ---------------------------------------------------------------------------
create or replace function public.price_suggestions()
returns table (
  dish_id        text,
  dish_name      text,
  price          numeric,
  cost_now       numeric,
  cost_before    numeric,
  margin_now     numeric,
  margin_before  numeric,
  suggested      numeric
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_admin() then
    raise exception 'owners only';
  end if;

  return query
  with costed as (
    select d.id, d.name, d.price, d.cost_when_priced as before,
           public.dish_cost(d.id) as now
      from public.dishes d
  )
  select c.id,
         c.name,
         c.price,
         c.now,
         c.before,
         round((c.price - c.now) / nullif(c.price, 0) * 100, 1),
         round((c.price - c.before) / nullif(c.price, 0) * 100, 1),
         -- Restore the old margin percentage at the new cost, rounded up to the
         -- next peso. Nobody prices a karinderya dish at 87.34.
         ceil(c.now / nullif(1 - (c.price - c.before) / nullif(c.price, 0), 0))
    from costed c
   where c.now is not null
     and c.before is not null
     -- Only worth interrupting the owner for a real move, not rounding noise.
     and c.now > c.before * 1.02
   order by (c.now - c.before) / nullif(c.before, 0) desc;
end;
$$;

grant execute on function public.price_suggestions() to authenticated;

-- ---------------------------------------------------------------------------
-- 6. confirm_dish_price() — the owner's decision, either way
--
-- Accepting a suggestion and rejecting one both end here. Rejecting still
-- re-baselines the cost, otherwise the same dish would be suggested again every
-- time the screen loads and the owner would learn to ignore all of it.
-- ---------------------------------------------------------------------------
create or replace function public.confirm_dish_price(
  p_dish_id text,
  p_price   numeric default null
)
returns public.dishes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dish public.dishes;
  v_cost numeric(10,2);
begin
  if not public.is_admin() then
    raise exception 'only the owner may change a price';
  end if;

  v_cost := public.dish_cost(p_dish_id);

  update public.dishes
     set price = coalesce(p_price, price),
         cost_when_priced = v_cost
   where id = p_dish_id
   returning * into v_dish;

  if v_dish.id is null then
    raise exception 'no dish %', p_dish_id;
  end if;

  return v_dish;
end;
$$;

grant execute on function public.confirm_dish_price(text, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. cogs_by_day() — cost of goods sold, and the gross profit above it
--
-- The dashboard's "profit" is sales minus expenses, where expenses are whatever
-- was BOUGHT that day. That is cash flow, not profit: buy a sack of rice on
-- Monday and Monday looks like a loss while the rest of the week looks
-- unusually good, though nothing about the business changed.
--
-- Cost of goods sold is the cost of what was actually SOLD. Sales minus COGS is
-- the gross profit, and it is the number that says whether the food is priced
-- properly, independent of when the shopping happened.
--
-- Costed at today's ingredient prices, because the order does not record what
-- the pork cost on the day. Close enough to steer by, and it moves with the
-- market rather than pretending last month's prices still hold.
-- ---------------------------------------------------------------------------
create or replace function public.cogs_by_day(p_days int default 7)
returns table (
  day        date,
  sales      numeric,
  cogs       numeric,
  gross      numeric,
  margin_pct numeric
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_admin() then
    raise exception 'owners only';
  end if;

  return query
  with sold as (
    select o.created_at::date as day,
           o.total,
           -- Only settled tickets. An unpaid ticket is an intention, and
           -- counting it as a sale would overstate both sides of the figure.
           (select coalesce(sum(
                     (item ->> 'qty')::int * coalesce(public.dish_cost(item ->> 'id'), 0)
                   ), 0)
              from jsonb_array_elements(o.items) as item) as line_cost
      from public.orders o
     where o.paid_at is not null
       and o.created_at >= current_date - (p_days - 1)
  )
  select s.day,
         round(sum(s.total), 2),
         round(sum(s.line_cost), 2),
         round(sum(s.total) - sum(s.line_cost), 2),
         round((sum(s.total) - sum(s.line_cost)) / nullif(sum(s.total), 0) * 100, 1)
    from sold s
   group by s.day
   order by s.day;
end;
$$;

grant execute on function public.cogs_by_day(int) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Baseline the dishes that already have a full recipe
--
-- Without this every costed dish would look like it had just changed price the
-- first time the screen opened, and the owner would be shown a wall of
-- suggestions that mean nothing.
-- ---------------------------------------------------------------------------
update public.dishes d
   set cost_when_priced = public.dish_cost(d.id)
 where d.cost_when_priced is null
   and public.dish_cost(d.id) is not null;

insert into supabase_migrations.schema_migrations (version)
values ('20260815000000') on conflict (version) do nothing;

commit;

-- What is costed so far. cost_per_unit of 0 means nobody has priced it yet.
select id, name, unit, stock, cost_per_unit from public.inventory order by cost_per_unit desc, name;
