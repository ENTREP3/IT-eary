-- ============================================================================
-- IT-eary · Menu + demo data
-- ----------------------------------------------------------------------------
-- Lives in a migration (not seed.sql) so it reaches BOTH the local stack and a
-- hosted project — `supabase db push` applies migrations only, never seeds.
--
-- Split of responsibilities:
--   this file    → menu, categories, inventory + demo orders/expenses
--   seed.sql     → local-only staff auth accounts (never pushed to a hosted
--                  project, whose accounts are created with real passwords)
--
-- Every insert is idempotent, so re-running is safe.
--
-- To clear the demo history from a hosted project once you have real trade:
--   delete from public.orders;
--   delete from public.expenses;
-- ----------------------------------------------------------------------------
-- Sample tickets spread across the last few days / hours so "How diners pay",
-- "Latest orders" and "Today's pulse" have something to show immediately.
--
-- The last three are deliberately left UNPAID (payment_method NULL, no
-- paid_at) so the cashier screen has live tickets to look up and settle:
--   PAY001 · PAY002 · PAY003
--
-- Order matters: these run BEFORE the dishes insert below, so the
-- apply_order_to_dishes() trigger no-ops against an empty menu and the
-- hand-tuned sold_today values further down survive intact.
-- ----------------------------------------------------------------------------
insert into public.orders (reference, ticket_code, customer_name, items, total, payment_method, status, paid_at, created_at)
values
  ('T7K2M9', 'T7K2M9', 'Walk-in', '[{"id":"tapsilog","name":"Tapsilog","qty":1,"price":75},{"id":"sago","name":"Sago''t Gulaman","qty":1,"price":25}]', 100, 'gcash', 'completed', now() - interval '20 minutes', now() - interval '20 minutes'),
  ('R4N8QD', 'R4N8QD', 'Walk-in', '[{"id":"adobo","name":"Chicken Adobo","qty":2,"price":85}]', 170, 'cash',  'completed', now() - interval '45 minutes', now() - interval '45 minutes'),
  ('W6Y3HJ', 'W6Y3HJ', 'Walk-in', '[{"id":"sinigang","name":"Sinigang na Baboy","qty":1,"price":95},{"id":"halohalo","name":"Halo-Halo","qty":1,"price":60}]', 155, 'gcash', 'completed', now() - interval '1 hour', now() - interval '1 hour'),
  ('B2V5XK', 'B2V5XK', 'Walk-in', '[{"id":"lumpia","name":"Lumpiang Shanghai","qty":1,"price":45},{"id":"tocilog","name":"Tocilog","qty":1,"price":70}]', 115, 'gcash', 'completed', now() - interval '2 hours', now() - interval '2 hours'),
  ('M9F4TP', 'M9F4TP', 'Walk-in', '[{"id":"pinakbet","name":"Pinakbet","qty":1,"price":65}]', 65, 'cash', 'completed', now() - interval '3 hours', now() - interval '3 hours'),
  ('K3D7RS', 'K3D7RS', 'Walk-in', '[{"id":"tapsilog","name":"Tapsilog","qty":2,"price":75}]', 150, 'gcash', 'completed', now() - interval '1 day', now() - interval '1 day'),
  ('N5G2WZ', 'N5G2WZ', 'Walk-in', '[{"id":"adobo","name":"Chicken Adobo","qty":1,"price":85}]', 85, 'cash', 'completed', now() - interval '1 day 2 hours', now() - interval '1 day 2 hours'),
  ('P8J6CV', 'P8J6CV', 'Walk-in', '[{"id":"halohalo","name":"Halo-Halo","qty":3,"price":60}]', 180, 'gcash', 'completed', now() - interval '2 days', now() - interval '2 days'),
  ('X4B9LM', 'X4B9LM', 'Walk-in', '[{"id":"sinigang","name":"Sinigang na Baboy","qty":1,"price":95}]', 95, 'cash', 'completed', now() - interval '2 days 5 hours', now() - interval '2 days 5 hours'),
  ('H7Q3ZF', 'H7Q3ZF', 'Walk-in', '[{"id":"sago","name":"Sago''t Gulaman","qty":4,"price":25}]', 100, 'gcash', 'completed', now() - interval '3 days', now() - interval '3 days'),
  -- Unpaid tickets waiting at the counter.
  ('PAY001', 'PAY001', 'Jun',     '[{"id":"tapsilog","name":"Tapsilog","qty":1,"price":75},{"id":"sago","name":"Sago''t Gulaman","qty":2,"price":25}]', 125, null, 'pending', null, now() - interval '4 minutes'),
  ('PAY002', 'PAY002', 'Liza',    '[{"id":"sinigang","name":"Sinigang na Baboy","qty":2,"price":95}]', 190, null, 'pending', null, now() - interval '9 minutes'),
  ('PAY003', 'PAY003', null,      '[{"id":"lumpia","name":"Lumpiang Shanghai","qty":3,"price":45},{"id":"halohalo","name":"Halo-Halo","qty":1,"price":60}]', 195, null, 'pending', null, now() - interval '15 minutes')
on conflict (reference) do nothing;

-- ----------------------------------------------------------------------------
-- Menu, categories & inventory (moved out of the browser into Postgres).
-- ----------------------------------------------------------------------------
insert into public.categories (name) values
  ('Ulam'), ('Silog'), ('Merienda'), ('Inumin')
on conflict (name) do nothing;

insert into public.dishes (id, name, tagalog, price, category, description, image, available, sold_today) values
  ('adobo','Chicken Adobo','Adobong Manok',85,'Ulam','Soy, vinegar, garlic, bay leaf. Slow-simmered until the sauce hugs every piece.','https://images.unsplash.com/photo-1642509600566-96fe95a744b3?w=800&q=80',true,42),
  ('sinigang','Sinigang na Baboy','Pork in Sour Broth',95,'Ulam','Tamarind-sour broth with pork belly, kangkong, sitaw, and labanos.','https://images.unsplash.com/photo-1585116782242-a8ee668a7b9c?w=800&q=80',true,28),
  ('tapsilog','Tapsilog','Tapa • Sinangag • Itlog',75,'Silog','Marinated beef tapa, garlic fried rice, sunny-side-up egg. The classic.','https://images.unsplash.com/photo-1600289031464-74d374b64991?w=800&q=80',true,61),
  ('tocilog','Tocilog','Tocino • Sinangag • Itlog',70,'Silog','Sweet-cured pork tocino caramelized on the pan, with garlic rice and egg.','https://images.unsplash.com/photo-1606525575548-2d62ed40291d?w=800&q=80',true,35),
  ('pinakbet','Pinakbet','Vegetable Stew',65,'Ulam','Ilocano-style vegetables simmered with bagoong, kalabasa, ampalaya, okra.','https://images.unsplash.com/photo-1536489885071-87983c3e2859?w=800&q=80',true,19),
  ('lumpia','Lumpiang Shanghai','Fried Pork Spring Rolls',45,'Merienda','Crispy hand-rolled pork lumpia. 5 pieces. Served with sweet-chili dip.','https://images.unsplash.com/photo-1759922222212-3657d43bd5b5?w=800&q=80',true,54),
  ('kaldereta','Kalderetang Kambing','Goat Stew',120,'Ulam','Rich tomato-liver sauce with bell peppers, olives, and tender goat.','https://images.unsplash.com/photo-1771384552858-feb0574f958d?w=800&q=80',false,0),
  ('halohalo','Halo-Halo','Mix-Mix',60,'Merienda','Shaved ice, leche flan, ube halaya, sago, beans, langka — a whole afternoon in a glass.','https://images.unsplash.com/photo-1763994682399-fc8d7612c21e?w=800&q=80',true,33),
  ('sago','Sago''t Gulaman','Tapioca Pearls & Jelly',25,'Inumin','Brown-sugar-syrup cooler with tapioca pearls and gulaman strips.','https://images.unsplash.com/photo-1775889184856-7b2d5caf9a47?w=800&q=80',true,88)
on conflict (id) do nothing;

insert into public.inventory (id, name, unit, stock, reorder_at, last_delivery) values
  ('rice','Bigas (Rice)','kg',48,20,'Apr 20'),
  ('chicken','Manok (Chicken)','kg',6.2,8,'Apr 22'),
  ('pork','Baboy (Pork)','kg',14.5,10,'Apr 22'),
  ('goat','Kambing (Goat)','kg',0,5,'Apr 14'),
  ('soy','Toyo (Soy Sauce)','L',3.1,2,'Apr 18'),
  ('vinegar','Suka (Vinegar)','L',1.4,2,'Apr 10'),
  ('garlic','Bawang (Garlic)','kg',2.8,1.5,'Apr 21'),
  ('onion','Sibuyas (Onion)','kg',3.6,2,'Apr 21'),
  ('kangkong','Kangkong','bundle',4,6,'Apr 22'),
  ('eggs','Itlog (Eggs)','tray',2.5,3,'Apr 20')
on conflict (id) do nothing;

-- A week of expenses so the profit chart has a real expense line.
insert into public.expenses (label, amount, category, spent_on) values
  ('Palengke — meat & veg', 2100, 'Supplies', current_date - 6),
  ('Rice delivery',          680, 'Supplies', current_date - 6),
  ('Palengke — meat & veg', 2680, 'Supplies', current_date - 5),
  ('LPG refill',             950, 'Utilities', current_date - 5),
  ('Palengke — meat & veg', 3120, 'Supplies', current_date - 4),
  ('Palengke — meat & veg', 3480, 'Supplies', current_date - 3),
  ('Helper wage',           2250, 'Labor',    current_date - 2),
  ('Palengke — meat & veg', 2300, 'Supplies', current_date - 1),
  ('Electricity',            980, 'Utilities', current_date),
  ('Palengke — meat & veg', 1660, 'Supplies', current_date)
on conflict do nothing;
