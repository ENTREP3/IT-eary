-- ============================================================================
-- IT-eary · LOCAL staff accounts (runs on `supabase db reset`)
-- ----------------------------------------------------------------------------
-- Creates the two staff auth accounts and assigns their roles — the signup
-- trigger always defaults to 'customer', so these UPDATEs are what grant staff
-- access.
--
-- Diners never have accounts — ordering is ticket-based and anonymous.
--
-- ⚠️  LOCAL ONLY. These are weak, publicly-known development passwords:
--         admin@bencris.local   / admin123
--         cashier@bencris.local / cashier123
--     `supabase db push` never runs seeds, so they cannot reach a hosted
--     project by accident — and they must not be recreated there by hand.
--     On a hosted project, create staff in the Supabase dashboard with real
--     passwords, then assign the role with promote_to_admin(email) /
--     promote_to_cashier(email).
--
-- Menu, categories, inventory and demo orders live in the migration
-- 20260803010000_menu_and_demo_data.sql so they reach hosted projects too.
-- ============================================================================

-- pgcrypto provides crypt()/gen_salt() for hashing the seed passwords.
create extension if not exists pgcrypto with schema extensions;

-- Creates a confirmed email/password auth user + its identity row, idempotently.
create or replace function pg_temp.seed_staff_user(
  p_id       uuid,
  p_email    text,
  p_password text,
  p_name     text
)
returns void
language plpgsql
as $$
begin
  if exists (select 1 from auth.users where email = p_email) then
    return;
  end if;

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
    p_id, 'authenticated', 'authenticated',
    p_email,
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('full_name', p_name),
    now(), now(),
    '', '', '', '', '', '', '', ''
  );

  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), p_id, p_id::text,
    jsonb_build_object('sub', p_id::text, 'email', p_email),
    'email', now(), now(), now()
  );
end;
$$;

do $$
declare
  admin_id   uuid := '11111111-1111-1111-1111-111111111111';
  cashier_id uuid := '22222222-2222-2222-2222-222222222222';
begin
  perform pg_temp.seed_staff_user(admin_id,   'admin@bencris.local',   'admin123',   'Mary (Owner)');
  perform pg_temp.seed_staff_user(cashier_id, 'cashier@bencris.local', 'cashier123', 'Ana (Cashier)');

  -- The signup trigger created 'customer' profiles; assign the real roles.
  update public.profiles set role = 'admin', full_name = 'Mary (Owner)'
  where id = admin_id;

  update public.profiles set role = 'cashier', full_name = 'Ana (Cashier)'
  where id = cashier_id;
end $$;

-- ---------------------------------------------------------------------------
-- YOUR OWN STAFF ACCOUNTS
--
-- `supabase db reset` rebuilds the database from the migrations and this file,
-- so anything created by hand in Studio, or through the Shop screen, is wiped.
-- That is fine for demo data and very much not fine for your own login.
--
-- Add yours here and it survives every reset. Uncomment, change the details,
-- and give each person a different id (any unique uuid will do).
-- ---------------------------------------------------------------------------
-- do $$
-- declare
--   my_id uuid := '33333333-3333-3333-3333-333333333333';
-- begin
--   perform pg_temp.seed_staff_user(my_id, 'you@example.com', 'your-password', 'Your Name');
--   update public.profiles set role = 'admin', full_name = 'Your Name' where id = my_id;
-- end $$;

