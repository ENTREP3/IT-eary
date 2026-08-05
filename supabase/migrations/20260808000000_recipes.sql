-- ============================================================================
-- Bencris · Recipes, so inventory falls when food is cooked
-- ----------------------------------------------------------------------------
-- Until now the inventory was a list the owner edited by hand, and the menu had
-- no connection to it. Nothing linked "we cooked a pot of sinigang" to "we used
-- up the pork, the kangkong and the gabi", so the stock figures drifted from
-- reality within a day and the low-stock warnings meant nothing.
--
-- WHEN INGREDIENTS ARE DEDUCTED: at cooking time, not at selling time.
--
-- This matters, and getting it the other way round would be wrong. A karinderya
-- cooks a pot in the morning; the pork leaves the inventory at the stove. If
-- ingredients came off per serving sold, the stock would read high all morning
-- and would only ever be correct if every last serving happened to sell.
--
-- So: cook_batch() deducts ingredients and adds servings. Selling a serving
-- only lowers the servings-left count, which the order trigger already does.
-- The two never touch the same number, so nothing is ever counted twice.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. How many servings one batch yields
--
-- Recipe quantities are recorded per BATCH, the way a cook actually thinks:
-- "one pot of sinigang takes one and a half kilos of pork and feeds twenty".
-- ---------------------------------------------------------------------------
alter table public.dishes
  add column batch_yield int not null default 10 check (batch_yield > 0);

comment on column public.dishes.batch_yield is
  'Servings produced by one batch. Recipe quantities below are per batch.';

-- ---------------------------------------------------------------------------
-- 2. The recipe itself
-- ---------------------------------------------------------------------------
create table public.recipe_items (
  dish_id      text not null references public.dishes (id) on delete cascade,
  inventory_id text not null references public.inventory (id) on delete restrict,
  quantity     numeric(10,3) not null check (quantity > 0),

  primary key (dish_id, inventory_id)
);

comment on table public.recipe_items is
  'Ingredients used by ONE BATCH of a dish, in that inventory item''s own unit.';

alter table public.recipe_items enable row level security;

-- Anyone may read a recipe: it is what lets the menu show what is in a dish.
create policy "recipe_items_read_all" on public.recipe_items
  for select using (true);

-- Recipes are a costing decision, so only the owner edits them.
create policy "recipe_items_admin_write" on public.recipe_items
  for all using (public.is_admin()) with check (public.is_admin());

grant select on public.recipe_items to anon, authenticated;
grant insert, update, delete on public.recipe_items to authenticated;

-- ---------------------------------------------------------------------------
-- 3. can_cook() — how many batches the ingredients on hand actually allow
--
-- The limiting ingredient decides. Answers the question the owner asks every
-- morning: "can I still make sinigang today?"
-- ---------------------------------------------------------------------------
create or replace function public.can_cook(p_dish_id text)
returns numeric
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(min(floor(i.stock / r.quantity)), 0)
    from public.recipe_items r
    join public.inventory i on i.id = r.inventory_id
   where r.dish_id = p_dish_id;
$$;

grant execute on function public.can_cook(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. cook_batch() — the one place ingredients leave the inventory
--
-- Deducts the recipe, adds the servings, and puts the dish back on the menu.
-- Refuses outright if an ingredient would go negative, because a stock figure
-- that can go below zero is worse than no stock figure at all.
-- ---------------------------------------------------------------------------
create or replace function public.cook_batch(
  p_dish_id text,
  p_batches numeric default 1
)
returns public.dishes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dish    public.dishes;
  v_short   text;
  v_lines   int;
  v_result  public.dishes;
begin
  if not public.is_admin() then
    raise exception 'only the owner may record cooking';
  end if;

  if p_batches is null or p_batches <= 0 then
    raise exception 'how many batches were cooked?';
  end if;

  select * into v_dish from public.dishes where id = p_dish_id;
  if v_dish.id is null then
    raise exception 'no dish %', p_dish_id;
  end if;

  select count(*) into v_lines from public.recipe_items where dish_id = p_dish_id;
  if v_lines = 0 then
    raise exception 'no recipe recorded for %, so ingredients cannot be deducted', v_dish.name;
  end if;

  -- Name the ingredient that is short, rather than failing with a bare error.
  select string_agg(i.name || ' (need ' || round(r.quantity * p_batches, 2) ||
                    ' ' || i.unit || ', have ' || i.stock || ')', ', ')
    into v_short
    from public.recipe_items r
    join public.inventory i on i.id = r.inventory_id
   where r.dish_id = p_dish_id
     and i.stock < r.quantity * p_batches;

  if v_short is not null then
    raise exception 'not enough %', v_short;
  end if;

  update public.inventory i
     set stock = i.stock - (r.quantity * p_batches)
    from public.recipe_items r
   where r.inventory_id = i.id
     and r.dish_id = p_dish_id;

  update public.dishes
     set stock_count = coalesce(stock_count, 0) + (v_dish.batch_yield * p_batches)::int,
         available   = true
   where id = p_dish_id
   returning * into v_result;

  return v_result;
end;
$$;

grant execute on function public.cook_batch(text, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Starter ingredients and recipes for the seeded menu
--
-- Quantities are per batch, and are a plausible starting point rather than the
-- owner's real numbers. They exist so the link between cooking and inventory
-- can be demonstrated on day one, and are meant to be corrected in the app.
-- ---------------------------------------------------------------------------
-- The seeded inventory already holds pork, chicken, kangkong, onion, garlic,
-- soy, vinegar, eggs and rice. These are the ones a sinigang recipe needs that
-- were missing.
insert into public.inventory (id, name, unit, stock, reorder_at) values
  ('tomato',   'Kamatis (Tomato)',      'kg',     8,   2),
  ('taro',     'Gabi (Taro)',           'kg',     6,   2),
  ('radish',   'Labanos (Radish)',      'kg',     5,   1.5),
  ('tamarind', 'Sinigang mix',          'sachet', 40,  10),
  ('fishsauce','Patis (Fish sauce)',    'L',      4,   1),
  ('salt',     'Asin (Salt)',           'kg',     5,   1),
  ('pepper',   'Paminta (Pepper)',      'kg',     1.5, 0.4),
  ('laurel',   'Dahon ng Laurel',       'pack',   12,  3),
  ('squash',   'Kalabasa (Squash)',     'kg',     7,   2),
  ('ampalaya', 'Ampalaya (Bitter melon)','kg',    4,   1),
  ('bagoong',  'Bagoong (Shrimp paste)', 'kg',    3,   1)
on conflict (id) do nothing;

-- Pork Sinigang, the example the owner described.
insert into public.recipe_items (dish_id, inventory_id, quantity) values
  ('sinigang', 'pork',      1.5),
  ('sinigang', 'kangkong',  2),
  ('sinigang', 'tomato',    0.5),
  ('sinigang', 'onion',     0.3),
  ('sinigang', 'taro',      0.6),
  ('sinigang', 'radish',    0.4),
  ('sinigang', 'tamarind',  2),
  ('sinigang', 'fishsauce', 0.1),
  ('sinigang', 'salt',      0.05),
  ('sinigang', 'pepper',    0.02)
on conflict do nothing;

insert into public.recipe_items (dish_id, inventory_id, quantity) values
  ('adobo', 'chicken', 2),
  ('adobo', 'soy',     0.4),
  ('adobo', 'vinegar', 0.3),
  ('adobo', 'garlic',  0.2),
  ('adobo', 'pepper',  0.02),
  ('adobo', 'laurel',  1)
on conflict do nothing;

insert into public.recipe_items (dish_id, inventory_id, quantity) values
  ('pinakbet', 'squash',   1.0),
  ('pinakbet', 'ampalaya', 0.6),
  ('pinakbet', 'onion',    0.2),
  ('pinakbet', 'tomato',   0.3),
  ('pinakbet', 'bagoong',  0.2)
on conflict do nothing;

-- Batch sizes for the dishes that now have a recipe.
update public.dishes set batch_yield = 20 where id in ('sinigang', 'adobo');
update public.dishes set batch_yield = 15 where id = 'pinakbet';
