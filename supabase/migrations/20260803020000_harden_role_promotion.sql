-- ============================================================================
-- IT-eary · Make role promotion honest
-- ----------------------------------------------------------------------------
-- The original promote_to_admin()/promote_to_cashier() ended in a bare
--
--     update public.profiles set role = ... where id = target_id;
--
-- If no profile row existed for that auth user, the UPDATE matched zero rows
-- and the function still returned successfully — reporting a promotion that
-- never happened. Someone would create a user in the dashboard, "promote" it,
-- and then be locked out with no indication of why.
--
-- Both functions now:
--   1. insert the profile if it is missing (self-healing), and
--   2. raise if the row still could not be written.
--
-- Also adds staff_directory(), so an admin can actually see who holds which
-- role — profiles has no email column (emails live in auth.users), which makes
-- the role model hard to inspect from the dashboard.
-- ============================================================================

create or replace function public.set_user_role(
  target_email text,
  new_role     public.user_role
)
returns public.user_role
language plpgsql
security definer
set search_path = public
as $$
declare
  target_id uuid;
  touched   int;
begin
  -- Same guard as before: an existing admin, or an unauthenticated caller
  -- (the seed / SQL editor running as postgres).
  if not public.is_admin() and auth.uid() is not null then
    raise exception 'only admins may change roles';
  end if;

  select id into target_id from auth.users where email = lower(trim(target_email));
  if target_id is null then
    raise exception 'no auth user with email % — create it first (Authentication -> Users)', target_email;
  end if;

  update public.profiles set role = new_role where id = target_id;
  get diagnostics touched = row_count;

  -- No profile row yet (e.g. the user predates the handle_new_user trigger).
  -- Create it rather than silently doing nothing.
  if touched = 0 then
    insert into public.profiles (id, role)
    values (target_id, new_role)
    on conflict (id) do update set role = excluded.role;
    get diagnostics touched = row_count;
  end if;

  if touched = 0 then
    raise exception 'could not set role for % — no profile row written', target_email;
  end if;

  return new_role;
end;
$$;

grant execute on function public.set_user_role(text, public.user_role) to authenticated;

create or replace function public.promote_to_admin(target_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.set_user_role(target_email, 'admin');
end;
$$;

create or replace function public.promote_to_cashier(target_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.set_user_role(target_email, 'cashier');
end;
$$;

-- ----------------------------------------------------------------------------
-- staff_directory(): admin-only join of auth.users -> profiles, so you can
-- confirm from the SQL editor who is staff and whether their email is
-- confirmed (an unconfirmed user cannot sign in, which looks identical to a
-- wrong password from the app's side).
-- ----------------------------------------------------------------------------
create or replace function public.staff_directory()
returns table (
  email        text,
  full_name    text,
  role         public.user_role,
  email_confirmed boolean,
  created_at   timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() and auth.uid() is not null then
    raise exception 'admins only';
  end if;

  return query
    select u.email::text,
           p.full_name,
           p.role,
           u.email_confirmed_at is not null,
           p.created_at
    from auth.users u
    left join public.profiles p on p.id = u.id
    order by p.role nulls last, u.email;
end;
$$;

grant execute on function public.staff_directory() to authenticated;
