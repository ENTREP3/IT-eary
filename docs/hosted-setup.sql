-- ============================================================================
-- Bencris · Finish setting up the hosted project
-- ----------------------------------------------------------------------------
-- Run this ONCE, after hosted-catchup.sql. It does three things:
--
--   1. Creates the first owner login, so somebody can get into /admin at all.
--      Every account after this one is created from inside the app, on the
--      Staff access screen. This script is never needed again.
--
--   2. Restores the payment_settings row. The table is there but empty on this
--      project, and the storefront reads it to decide whether to offer GCash,
--      so its payment screen fails without it.
--
--   3. Sets the tagline the owner asked for.
--
-- HOW TO USE
--   a. Change the three values in the "set your details" block below.
--   b. Paste the whole file into the hosted project's SQL Editor and run it.
--   c. Sign in at /admin with that email and password.
--   d. Create the cashier from Admin -> Staff access.
--
-- The password is hashed by the database (bcrypt) before it is stored, exactly
-- as a normal signup would be. Supabase keeps SQL Editor history, so change the
-- password from inside the app afterwards if that history matters to you.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. The first owner
-- ---------------------------------------------------------------------------
do $$
declare
  ----------------------------------------------------------------------------
  -- SET YOUR DETAILS
  ----------------------------------------------------------------------------
  v_email    text := 'owner@bencris.com';      -- the email you will sign in with
  v_password text := 'change-this-password';   -- at least 6 characters
  v_name     text := 'Bencris Owner';
  ----------------------------------------------------------------------------
  v_id       uuid := gen_random_uuid();
begin
  v_email := lower(trim(v_email));

  if length(v_password) < 6 then
    raise exception 'the password needs at least 6 characters';
  end if;

  -- Already registered (created by hand in the dashboard, say)? Then this is a
  -- promotion, not a signup, and the existing password is left alone.
  if exists (select 1 from auth.users where email = v_email) then
    update public.profiles p
       set role      = 'admin'::public.user_role,
           full_name = coalesce(nullif(trim(v_name), ''), p.full_name)
      from auth.users u
     where u.email = v_email and p.id = u.id;

    raise notice 'existing account % promoted to owner (password unchanged)', v_email;
    return;
  end if;

  -- The empty-string token columns are not optional. GoTrue reads them into Go
  -- strings, and a NULL there fails sign-in with a misleading
  -- "Database error querying schema".
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, recovery_token, email_change,
    email_change_token_new, email_change_token_current,
    phone_change, phone_change_token, reauthentication_token
  ) values (
    '00000000-0000-0000-0000-000000000000',
    v_id, 'authenticated', 'authenticated',
    v_email,
    extensions.crypt(v_password, extensions.gen_salt('bf')),
    now(),                                    -- confirmed, so sign-in works at once
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('full_name', trim(v_name)),
    now(), now(),
    '', '', '', '', '', '', '', ''
  );

  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_id, v_id::text,
    jsonb_build_object('sub', v_id::text, 'email', v_email),
    'email', now(), now(), now()
  );

  -- The signup trigger has already made a 'customer' profile for this id.
  update public.profiles
     set role = 'admin'::public.user_role, full_name = trim(v_name)
   where id = v_id;

  raise notice 'owner account % created', v_email;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. The payment settings row
--
-- One row, id = 1, the same shape the app has always expected. Its absence is
-- why the storefront logs "failed to load settings": the query asks for exactly
-- one row and gets none.
-- ---------------------------------------------------------------------------
insert into public.payment_settings (id) values (1)
  on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. The tagline
--
-- Everything on the Shop screen is editable in the app, including this, but it
-- may as well be right from the first page load.
-- ---------------------------------------------------------------------------
update public.business_settings
   set tagline = 'Kain mga sir!!', updated_at = now()
 where id = 1;

commit;

-- ---------------------------------------------------------------------------
-- What the app will show now. The first result is the Staff access list; the
-- second confirms the two singleton rows are present.
-- ---------------------------------------------------------------------------
select u.email, p.role, p.full_name, u.created_at
  from public.profiles p
  join auth.users u on u.id = p.id
 where p.role in ('admin', 'cashier')
 order by p.role, u.email;

select (select count(*) from public.payment_settings)  as payment_settings_rows,
       (select count(*) from public.business_settings) as business_settings_rows,
       (select tagline from public.business_settings where id = 1) as tagline;
