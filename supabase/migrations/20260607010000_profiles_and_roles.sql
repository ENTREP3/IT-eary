-- ============================================================================
-- IT-eary · Phase 1 — Profiles & Roles
-- ----------------------------------------------------------------------------
-- Every authenticated user (customer or admin) gets exactly one row in
-- public.profiles. The role lives here, NOT in the JWT, and is never set from
-- client-supplied input — that is the core of the privilege model.
-- ============================================================================

create type public.user_role as enum ('customer', 'admin');

create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text,
  phone      text,
  role       public.user_role not null default 'customer',
  created_at timestamptz not null default now()
);

comment on table public.profiles is
  'Application profile + role for each auth user. Role is server-controlled.';

alter table public.profiles enable row level security;

-- ----------------------------------------------------------------------------
-- is_admin(): used by RLS policies across the schema. SECURITY DEFINER lets it
-- read profiles bypassing RLS, which avoids infinite recursion (a policy on
-- profiles that selects from profiles).
-- ----------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ----------------------------------------------------------------------------
-- handle_new_user(): fires whenever Supabase Auth creates a user. It mirrors
-- the auth row into public.profiles.
--
-- SECURITY NOTE: role is hard-coded to 'customer'. A malicious client could
-- pass {"role":"admin"} in signUp metadata, so we deliberately ignore it.
-- Admins are promoted out-of-band (see seed.sql / promote_to_admin()).
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone, role)
  values (
    new.id,
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    'customer'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- promote_to_admin(): a safe, auditable way to grant admin. Only an existing
-- admin (or the service_role used by seeds) may call it.
-- ----------------------------------------------------------------------------
create or replace function public.promote_to_admin(target_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_id uuid;
begin
  if not public.is_admin() and auth.uid() is not null then
    raise exception 'only admins may promote users';
  end if;

  select id into target_id from auth.users where email = target_email;
  if target_id is null then
    raise exception 'no user with email %', target_email;
  end if;

  update public.profiles set role = 'admin' where id = target_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------
-- Read: a user sees their own profile; admins see everyone.
create policy "profiles_select_self_or_admin"
  on public.profiles for select
  using (id = auth.uid() or public.is_admin());

-- Update: a user may edit only their own row...
create policy "profiles_update_self"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- ...and column grants below ensure they can't touch `role` (no escalation).

-- ----------------------------------------------------------------------------
-- Grants (table/column level — RLS governs rows, grants govern tables/columns)
-- ----------------------------------------------------------------------------
-- Revoke the broad defaults first, then grant back only what's safe. This is
-- what actually prevents role self-escalation: without column-scoped UPDATE,
-- `authenticated` would be able to set their own role = 'admin'.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, phone) on public.profiles to authenticated;
-- insert happens only through the SECURITY DEFINER trigger, so no insert grant.

grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.promote_to_admin(text) to authenticated;
