-- ============================================================================
-- IT-eary · Seed data (runs on `supabase db reset`)
-- ----------------------------------------------------------------------------
-- 1. Creates the owner/admin auth account.
-- 2. Promotes it to the 'admin' role (the signup trigger always defaults to
--    'customer', so this UPDATE is what makes it an admin).
-- 3. Drops in a few sample orders so the dashboard charts aren't empty.
--
-- Default admin login:  admin@iteary.local  /  admin123
-- (Change the password from Studio or the app for anything real.)
-- ============================================================================

-- pgcrypto provides crypt()/gen_salt() for hashing the seed password.
create extension if not exists pgcrypto with schema extensions;

do $$
declare
  admin_id uuid := '11111111-1111-1111-1111-111111111111';
begin
  if not exists (select 1 from auth.users where email = 'admin@iteary.local') then
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      -- GoTrue scans these into Go strings; NULL breaks login with
      -- "Database error querying schema", so they MUST be empty strings.
      confirmation_token, recovery_token, email_change,
      email_change_token_new, email_change_token_current,
      phone_change, phone_change_token, reauthentication_token
    ) values (
      '00000000-0000-0000-0000-000000000000',
      admin_id, 'authenticated', 'authenticated',
      'admin@iteary.local',
      extensions.crypt('admin123', extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{"full_name":"Mary (Owner)"}',
      now(), now(),
      '', '', '', '', '', '', '', ''
    );

    insert into auth.identities (
      id, user_id, provider_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), admin_id, admin_id::text,
      jsonb_build_object('sub', admin_id::text, 'email', 'admin@iteary.local'),
      'email', now(), now(), now()
    );
  end if;

  -- The trigger created a 'customer' profile; promote it to admin.
  update public.profiles set role = 'admin', full_name = 'Mary (Owner)'
  where id = admin_id;
end $$;

-- ----------------------------------------------------------------------------
-- Sample orders spread across the last few days / hours so "How diners pay",
-- "Latest orders" and "Today's pulse" have something to show immediately.
-- ----------------------------------------------------------------------------
insert into public.orders (reference, customer_name, items, total, payment_method, status, created_at)
values
  ('KM100201', 'Walk-in', '[{"name":"Tapsilog","qty":1,"price":75},{"name":"Sago''t Gulaman","qty":1,"price":25}]', 100, 'gcash', 'completed', now() - interval '20 minutes'),
  ('KM100202', 'Walk-in', '[{"name":"Chicken Adobo","qty":2,"price":85}]', 170, 'cash',  'completed', now() - interval '45 minutes'),
  ('KM100203', 'Walk-in', '[{"name":"Sinigang na Baboy","qty":1,"price":95},{"name":"Halo-Halo","qty":1,"price":60}]', 155, 'gcash', 'completed', now() - interval '1 hour'),
  ('KM100204', 'Walk-in', '[{"name":"Lumpiang Shanghai","qty":1,"price":45},{"name":"Tocilog","qty":1,"price":70}]', 115, 'gcash', 'completed', now() - interval '2 hours'),
  ('KM100205', 'Walk-in', '[{"name":"Pinakbet","qty":1,"price":65}]', 65, 'cash', 'completed', now() - interval '3 hours'),
  ('KM100206', 'Walk-in', '[{"name":"Tapsilog","qty":2,"price":75}]', 150, 'gcash', 'completed', now() - interval '1 day'),
  ('KM100207', 'Walk-in', '[{"name":"Chicken Adobo","qty":1,"price":85}]', 85, 'cash', 'completed', now() - interval '1 day 2 hours'),
  ('KM100208', 'Walk-in', '[{"name":"Halo-Halo","qty":3,"price":60}]', 180, 'gcash', 'completed', now() - interval '2 days'),
  ('KM100209', 'Walk-in', '[{"name":"Sinigang na Baboy","qty":1,"price":95}]', 95, 'cash', 'completed', now() - interval '2 days 5 hours'),
  ('KM100210', 'Walk-in', '[{"name":"Sago''t Gulaman","qty":4,"price":25}]', 100, 'gcash', 'completed', now() - interval '3 days')
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
