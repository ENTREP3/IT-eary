<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * The username goes, and the receipt says who served you.
 *
 * ---------------------------------------------------------------------------
 * Removing the username
 *
 * It was added so the shop could greet somebody by a name they chose. The
 * nickname does that, and does it better — it is optional, it is what people
 * actually want to be called, and it carries no expectation of being unique.
 *
 * What the username added on top was cost: a uniqueness rule, a shape rule, an
 * availability check while typing, a second thing to pick at signup, and a
 * second thing that could be taken. None of it bought anything, because
 * nothing signs in with it. Email and password is the whole of the login, and
 * keeping a second identifier that is not an identifier is how a form grows
 * fields nobody can explain.
 *
 * Dropped rather than left unused. A column still there is a column somebody
 * will write to next year.
 *
 * ---------------------------------------------------------------------------
 * Staff must have a full name
 *
 * Because the receipt now says who served the diner, and "served by" with a
 * blank after it is worse than not saying it. Enforced where staff are made,
 * so a login cannot be created without one.
 *
 * ---------------------------------------------------------------------------
 * The name is stamped, not looked up
 *
 * `orders.processed_by` holds the staff member's id, and no diner may read
 * another account's profile — rightly. Rather than open that up, the name is
 * written onto the order when payment is recorded, exactly as the customer's
 * own name already is.
 *
 * It is also the more honest record: the receipt should say who served them
 * that day, not who that person is called now, and it survives the staff
 * account being deleted.
 *
 * The role is deliberately absent. A diner has no use for knowing whether the
 * person at the till was the owner or a cashier, and printing it invites
 * questions nobody at the counter wants.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
-- ---------------------------------------------------------------------------
-- Who served them, on the order itself
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists served_by_name text;

comment on column public.orders.served_by_name is
  'The staff member who took payment, stamped at the time. Not looked up from processed_by: a diner may not read another account, and the receipt should say who served them that day.';

-- Backfill from the profiles we still have, so older receipts are not blank.
update public.orders o
   set served_by_name = p.full_name
  from public.profiles p
 where p.id = o.processed_by
   and o.served_by_name is null
   and coalesce(btrim(p.full_name), '') <> '';

-- ---------------------------------------------------------------------------
-- Stamped when payment is recorded
-- ---------------------------------------------------------------------------
create or replace function public.stamp_served_by()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only on the move to paid, and only when somebody is recorded as having
  -- done it. Re-running on later edits would rewrite history.
  if new.processed_by is not null
     and (old.processed_by is null or old.processed_by <> new.processed_by)
  then
    select nullif(btrim(coalesce(p.full_name, '')), '')
      into new.served_by_name
      from public.profiles p
     where p.id = new.processed_by;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_stamp_served_by on public.orders;
create trigger orders_stamp_served_by
  before update of processed_by on public.orders
  for each row execute function public.stamp_served_by();

-- ---------------------------------------------------------------------------
-- A staff login needs a name
-- ---------------------------------------------------------------------------
create or replace function public.create_staff_account(
  p_email text, p_password text, p_full_name text, p_role text
)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_email text := lower(trim(p_email));
  v_name  text := nullif(btrim(coalesce(p_full_name, '')), '');
  v_id    uuid := gen_random_uuid();
begin
  if not public.is_admin() then
    raise exception 'only the owner may create staff logins';
  end if;

  if p_role not in ('admin', 'cashier') then
    raise exception 'role must be admin or cashier';
  end if;

  -- Required now, because the receipt prints it. "Served by" followed by
  -- nothing is worse than not saying it at all.
  if v_name is null then
    raise exception 'A staff member needs a full name — it is printed on the receipt.';
  end if;

  if v_email is null or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'that does not look like an email address';
  end if;

  if public.password_problem(p_password) is not null then
    raise exception '%', public.password_problem(p_password);
  end if;

  if exists (select 1 from auth.users where email = v_email) then
    update public.profiles p
       set role = p_role::public.user_role,
           full_name = v_name
      from auth.users u
     where u.email = v_email and p.id = u.id;
    return 'existing account granted ' || p_role || ' access';
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
    v_email, extensions.crypt(p_password, extensions.gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', v_name)
  );

  insert into auth.identities (
    provider_id, user_id, identity_data, provider, last_sign_in_at,
    created_at, updated_at
  ) values (
    v_id::text, v_id,
    jsonb_build_object('sub', v_id::text, 'email', v_email),
    'email', now(), now(), now()
  );

  update public.profiles
     set role = p_role::public.user_role, full_name = v_name
   where id = v_id;

  return 'created';
end;
$$;

grant execute on function public.create_staff_account(text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- The username goes
-- ---------------------------------------------------------------------------
-- display_name first, since it reads the column being dropped.
create or replace function public.display_name(p public.profiles)
returns text
language sql
immutable
set search_path = public
as $$
  select coalesce(
    nullif(btrim(coalesce(p.nickname, '')), ''),
    nullif(btrim(coalesce(p.first_name, '')), ''),
    nullif(btrim(coalesce(p.full_name, '')), ''),
    'there'
  );
$$;

drop function if exists public.username_available(text);

create or replace function public.write_profile_names(
  p_id          uuid,
  p_first_name  text,
  p_last_name   text,
  p_middle_name text,
  p_nickname    text,
  p_phone       text
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.profiles;
begin
  if coalesce(btrim(p_first_name), '') = '' then
    raise exception 'A first name is needed.';
  end if;
  if coalesce(btrim(p_last_name), '') = '' then
    raise exception 'A last name is needed.';
  end if;

  update public.profiles
     set first_name  = btrim(p_first_name),
         middle_name = nullif(btrim(coalesce(p_middle_name, '')), ''),
         last_name   = btrim(p_last_name),
         nickname    = nullif(btrim(coalesce(p_nickname, '')), ''),
         phone       = nullif(btrim(coalesce(p_phone, '')), '')
   where id = p_id
   returning * into v_row;

  if v_row.id is null then
    raise exception 'That account no longer exists.';
  end if;

  return v_row;
end;
$$;

revoke all on function public.write_profile_names(uuid, text, text, text, text, text)
  from public, anon, authenticated;

drop function if exists public.save_my_profile(text, text, text, text, text, text);

create or replace function public.save_my_profile(
  p_first_name  text,
  p_last_name   text,
  p_middle_name text default null,
  p_nickname    text default null,
  p_phone       text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'sign in first';
  end if;
  return public.write_profile_names(
    auth.uid(), p_first_name, p_last_name, p_middle_name, p_nickname, p_phone
  );
end;
$$;

grant execute on function public.save_my_profile(text, text, text, text, text) to authenticated;

drop function if exists public.save_person_profile(uuid, text, text, text, text, text, text);

create or replace function public.save_person_profile(
  p_id          uuid,
  p_first_name  text,
  p_last_name   text,
  p_middle_name text default null,
  p_nickname    text default null,
  p_phone       text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'only the owner may edit somebody else''s details';
  end if;
  return public.write_profile_names(
    p_id, p_first_name, p_last_name, p_middle_name, p_nickname, p_phone
  );
end;
$$;

grant execute on function public.save_person_profile(uuid, text, text, text, text, text) to authenticated;

-- New accounts no longer carry one.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id, full_name, first_name, middle_name, last_name, nickname, phone, role
  )
  values (
    new.id,
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'first_name', ''),
    nullif(new.raw_user_meta_data ->> 'middle_name', ''),
    nullif(new.raw_user_meta_data ->> 'last_name', ''),
    nullif(new.raw_user_meta_data ->> 'nickname', ''),
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    'customer'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- The ticket's name follows the same order as the greeting.
create or replace function public.stamp_customer_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name      text;
  v_anonymous boolean;
begin
  if new.customer_id is null then
    return new;
  end if;

  select coalesce(u.is_anonymous, false) into v_anonymous
    from auth.users u where u.id = new.customer_id;

  new.from_account := not coalesce(v_anonymous, true);

  if coalesce(btrim(new.customer_name), '') <> '' then
    return new;
  end if;

  if coalesce(v_anonymous, true) then
    return new;
  end if;

  select coalesce(
           nullif(btrim(coalesce(p.nickname, '')), ''),
           nullif(btrim(coalesce(p.full_name, '')), ''),
           nullif(btrim(coalesce(p.first_name, '')), '')
         )
    into v_name
    from public.profiles p
   where p.id = new.customer_id;

  if v_name is null then
    select nullif(split_part(u.email, '@', 1), '') into v_name
      from auth.users u where u.id = new.customer_id;
  end if;

  new.customer_name := v_name;
  return new;
end;
$$;

drop function if exists public.my_profile();

create or replace function public.my_profile()
returns table (
  id          uuid,
  email       text,
  first_name  text,
  middle_name text,
  last_name   text,
  nickname    text,
  phone       text,
  full_name   text,
  role        text
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'sign in first';
  end if;

  return query
  select p.id, u.email::text, p.first_name, p.middle_name, p.last_name,
         p.nickname, p.phone, p.full_name, p.role::text
    from public.profiles p
    join auth.users u on u.id = p.id
   where p.id = auth.uid();
end;
$$;

grant execute on function public.my_profile() to authenticated;

drop function if exists public.list_people(text);

create or replace function public.list_people(p_role text default null)
returns table (
  id            uuid,
  email         text,
  first_name    text,
  middle_name   text,
  last_name     text,
  nickname      text,
  display_name  text,
  full_name     text,
  phone         text,
  role          text,
  banned_until  timestamptz,
  orders        bigint,
  spent         numeric,
  last_order    timestamptz,
  created_at    timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'only the owner may see the people list';
  end if;

  return query
  select
    p.id, u.email::text, p.first_name, p.middle_name, p.last_name, p.nickname,
    public.display_name(p) as display_name,
    p.full_name, p.phone, p.role::text,
    case when u.banned_until > now() then u.banned_until end,
    case when p.role = 'customer' then coalesce(o.n, 0) end,
    case when p.role = 'customer' then coalesce(o.total, 0) end,
    case when p.role = 'customer' then o.last_at end,
    p.created_at
  from public.profiles p
  join auth.users u on u.id = p.id
  left join lateral (
    select count(*) as n, sum(orders.total) as total, max(orders.paid_at) as last_at
      from public.orders
     where orders.customer_id = p.id
       and orders.paid_at is not null
       and orders.status <> 'cancelled'
  ) o on true
  where (p_role is null or p.role::text = p_role)
    and not coalesce(u.is_anonymous, false)
  order by
    case p.role when 'admin' then 0 when 'cashier' then 1 else 2 end,
    coalesce(o.n, 0) desc,
    p.created_at desc;
end;
$$;

grant execute on function public.list_people(text) to authenticated;

-- And finally the column itself.
alter table public.profiles drop constraint if exists profiles_username_shape;
drop index if exists profiles_username_unique;
alter table public.profiles drop column if exists username;
SQL);
    }

    public function down(): void
    {
        DB::unprepared(<<<'SQL'
alter table public.profiles add column if not exists username text;
drop trigger if exists orders_stamp_served_by on public.orders;
drop function if exists public.stamp_served_by();
alter table public.orders drop column if exists served_by_name;
SQL);
    }
};
