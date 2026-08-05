-- ============================================================================
-- Bencris · The owner creates staff logins directly
-- ----------------------------------------------------------------------------
-- Granting a role only worked if the person had already signed up on the
-- customer page, which is the wrong way round for a karinderya. The owner hires
-- a cashier and hands them a login; the cashier does not register themselves
-- and then wait to be approved.
--
-- SECURITY. This writes into auth.users, which is normally reachable only with
-- the service-role key. That key must never reach a browser, so instead the
-- work happens inside a SECURITY DEFINER function that checks is_admin() first.
-- The privilege belongs to the function, not to the caller: an ordinary
-- customer calling this gets refused, and no secret is shipped to the client.
--
-- The column list mirrors supabase/seed.sql, including the empty-string token
-- fields. GoTrue scans those into Go strings and a NULL breaks sign-in with a
-- misleading "Database error querying schema".
-- ============================================================================

create or replace function public.create_staff_account(
  p_email     text,
  p_password  text,
  p_full_name text,
  p_role      text
)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_email text := lower(trim(p_email));
  v_id    uuid := gen_random_uuid();
begin
  if not public.is_admin() then
    raise exception 'only the owner may create staff logins';
  end if;

  if p_role not in ('admin', 'cashier') then
    raise exception 'role must be admin or cashier';
  end if;

  if v_email is null or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'that does not look like an email address';
  end if;

  if p_password is null or length(p_password) < 6 then
    raise exception 'the password needs at least 6 characters';
  end if;

  -- Already registered? Just grant the role rather than failing, which is what
  -- the owner meant anyway.
  if exists (select 1 from auth.users where email = v_email) then
    update public.profiles p
       set role = p_role::public.user_role,
           full_name = coalesce(nullif(trim(p_full_name), ''), p.full_name)
      from auth.users u
     where u.email = v_email and p.id = u.id;
    return 'existing account granted ' || p_role || ' access';
  end if;

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
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    now(),                                   -- confirmed, so they can sign in at once
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('full_name', trim(coalesce(p_full_name, ''))),
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

  -- The signup trigger has already made a 'customer' profile. Assign the role
  -- the owner actually chose.
  update public.profiles
     set role = p_role::public.user_role,
         full_name = nullif(trim(coalesce(p_full_name, '')), '')
   where id = v_id;

  return 'created';
end;
$$;

grant execute on function public.create_staff_account(text, text, text, text) to authenticated;

/**
 * Resets a staff password, for the day somebody forgets theirs.
 */
create or replace function public.set_staff_password(
  p_email    text,
  p_password text
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.is_admin() then
    raise exception 'only the owner may change a staff password';
  end if;

  if p_password is null or length(p_password) < 6 then
    raise exception 'the password needs at least 6 characters';
  end if;

  update auth.users
     set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
         updated_at = now()
   where email = lower(trim(p_email))
     and id in (select id from public.profiles where role in ('admin', 'cashier'));

  if not found then
    raise exception 'no staff account for %', p_email;
  end if;
end;
$$;

grant execute on function public.set_staff_password(text, text) to authenticated;
