-- ============================================================================
-- Bencris · Recipes for the rest of the menu
-- ----------------------------------------------------------------------------
-- Three dishes had a recipe and six did not, which meant the low-stock warnings
-- only told half the story and most of the menu could be cooked without the
-- inventory noticing.
--
-- Quantities are per batch, in each ingredient's own unit, and are a plausible
-- starting point rather than the owner's real numbers. They are meant to be
-- corrected on the Menu screen once the kitchen weighs a real pot.
-- ============================================================================

insert into public.inventory (id, name, unit, stock, reorder_at) values
  ('beef',      'Baka (Beef)',            'kg',   6,   2),
  ('sugar',     'Asukal (Sugar)',         'kg',   8,   2),
  ('wrapper',   'Lumpia wrapper',         'pack', 15,  4),
  ('carrot',    'Karot (Carrot)',         'kg',   5,   1.5),
  ('potato',    'Patatas (Potato)',       'kg',   7,   2),
  ('liver',     'Liver spread',           'can',  10,  3),
  ('tomato-sauce','Tomato sauce',         'can',  12,  3),
  ('bellpepper','Bell pepper',            'kg',   3,   1),
  ('milk',      'Gatas (Evaporated milk)','can',  20,  5),
  ('ice',       'Yelo (Ice)',             'kg',   30,  8),
  ('beans',     'Halo-halo beans mix',    'kg',   5,   1.5),
  ('ube',       'Ube halaya',             'kg',   3,   1),
  ('sago-pearl','Sago pearls',            'kg',   4,   1),
  ('gulaman',   'Gulaman bars',           'pack', 12,  3),
  ('cooking-oil','Mantika (Cooking oil)', 'L',    8,   2)
on conflict (id) do nothing;

-- Tapsilog: cured beef, garlic rice, fried egg.
insert into public.recipe_items (dish_id, inventory_id, quantity) values
  ('tapsilog', 'beef',        2),
  ('tapsilog', 'rice',        3),
  ('tapsilog', 'eggs',        1),
  ('tapsilog', 'garlic',      0.15),
  ('tapsilog', 'soy',         0.2),
  ('tapsilog', 'vinegar',     0.1),
  ('tapsilog', 'sugar',       0.15),
  ('tapsilog', 'cooking-oil', 0.3)
on conflict do nothing;

-- Tocilog: sweet cured pork, garlic rice, fried egg.
insert into public.recipe_items (dish_id, inventory_id, quantity) values
  ('tocilog', 'pork',        2),
  ('tocilog', 'rice',        3),
  ('tocilog', 'eggs',        1),
  ('tocilog', 'sugar',       0.4),
  ('tocilog', 'garlic',      0.15),
  ('tocilog', 'cooking-oil', 0.3)
on conflict do nothing;

-- Lumpiang Shanghai: ground pork rolls, fried.
insert into public.recipe_items (dish_id, inventory_id, quantity) values
  ('lumpia', 'pork',        1.5),
  ('lumpia', 'wrapper',     2),
  ('lumpia', 'carrot',      0.4),
  ('lumpia', 'onion',       0.2),
  ('lumpia', 'garlic',      0.1),
  ('lumpia', 'eggs',        0.5),
  ('lumpia', 'cooking-oil', 0.6),
  ('lumpia', 'salt',        0.03),
  ('lumpia', 'pepper',      0.02)
on conflict do nothing;

-- Kalderetang Kambing: goat in tomato and liver sauce.
insert into public.recipe_items (dish_id, inventory_id, quantity) values
  ('kaldereta', 'goat',         2),
  ('kaldereta', 'tomato-sauce', 2),
  ('kaldereta', 'liver',        1),
  ('kaldereta', 'potato',       0.8),
  ('kaldereta', 'carrot',       0.5),
  ('kaldereta', 'bellpepper',   0.3),
  ('kaldereta', 'onion',        0.3),
  ('kaldereta', 'garlic',       0.15),
  ('kaldereta', 'laurel',       1)
on conflict do nothing;

-- Halo-Halo: shaved ice, milk, sweet beans, ube.
insert into public.recipe_items (dish_id, inventory_id, quantity) values
  ('halohalo', 'ice',    4),
  ('halohalo', 'milk',   4),
  ('halohalo', 'beans',  1),
  ('halohalo', 'ube',    0.5),
  ('halohalo', 'sugar',  0.5),
  ('halohalo', 'gulaman', 1)
on conflict do nothing;

-- Sago't Gulaman: pearls, jelly, brown sugar syrup.
insert into public.recipe_items (dish_id, inventory_id, quantity) values
  ('sago', 'sago-pearl', 0.8),
  ('sago', 'gulaman',    2),
  ('sago', 'sugar',      1),
  ('sago', 'ice',        3)
on conflict do nothing;

-- Batch sizes. Drinks and merienda come out of a larger pot than an ulam.
update public.dishes set batch_yield = 20 where id in ('tapsilog', 'tocilog');
update public.dishes set batch_yield = 30 where id in ('lumpia', 'sago', 'halohalo');
update public.dishes set batch_yield = 15 where id = 'kaldereta';
