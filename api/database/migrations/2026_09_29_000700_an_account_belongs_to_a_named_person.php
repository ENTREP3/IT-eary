<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * An account with a person behind it.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
alter table public.profiles
  add column if not exists first_name  text,
  add column if not exists middle_name text,
  add column if not exists last_name   text,
  add column if not exists username    text,
  add column if not exists nickname    text;

comment on column public.profiles.username is
  'What the shop calls them. Unique without case. Null for a guest who never made an account.';
comment on column public.profiles.nickname is
  'Preferred over username in a greeting, when set.';
comment on column public.profiles.full_name is
  'Kept equal to the name parts by a trigger. Receipts and staff lists read this.';

-- Unique without case, and only where one exists: several guests with no
-- username must not collide with each other.
create unique index if not exists profiles_username_unique
  on public.profiles (lower(username))
  where username is not null;

/*
 * What a username may be.
 */
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_username_shape') then
    alter table public.profiles
      add constraint profiles_username_shape
      check (username is null or username ~ '^[A-Za-z][A-Za-z0-9_.]{2,19}$');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- full_name follows the parts
-- ---------------------------------------------------------------------------
create or replace function public.compose_full_name()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Only when the parts say something. A profile that predates this migration
  -- keeps whatever full_name it already had rather than being blanked.
  if coalesce(new.first_name, '') <> '' or coalesce(new.last_name, '') <> '' then
    new.full_name := btrim(
      concat_ws(' ',
        nullif(btrim(coalesce(new.first_name, '')), ''),
        nullif(btrim(coalesce(new.middle_name, '')), ''),
        nullif(btrim(coalesce(new.last_name, '')), '')
      )
    );
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_full_name on public.profiles;
create trigger profiles_full_name
  before insert or update of first_name, middle_name, last_name on public.profiles
  for each row execute function public.compose_full_name();

-- ---------------------------------------------------------------------------
-- What to call somebody
-- ---------------------------------------------------------------------------
-- One rule, so the website, the phone app and a receipt cannot each pick a
-- different one of the four things that might be a person's name.
create or replace function public.display_name(p public.profiles)
returns text
language sql
immutable
set search_path = public
as $$
  select coalesce(
    nullif(btrim(coalesce(p.nickname, '')), ''),
    nullif(btrim(coalesce(p.username, '')), ''),
    nullif(btrim(coalesce(p.first_name, '')), ''),
    nullif(btrim(coalesce(p.full_name, '')), ''),
    'there'
  );
$$;

comment on function public.display_name(public.profiles) is
  'What to greet this person by. Falls back to "there", so "Welcome back, there" is the worst case rather than a blank.';

-- ---------------------------------------------------------------------------
-- Is this username free?
-- ---------------------------------------------------------------------------
/*
 * Answered for anyone, signed in or not, because the signup form needs it
 * before an account exists.
 */
create or replace function public.username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_username ~ '^[A-Za-z][A-Za-z0-9_.]{2,19}$'
     and not exists (
       select 1 from public.profiles
        where lower(username) = lower(btrim(p_username))
     );
$$;

grant execute on function public.username_available(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Saving your own details
-- ---------------------------------------------------------------------------
/*
 * A function rather than letting the client update the row directly, because
 * `profiles` also holds `role`. An UPDATE policy wide enough to let somebody
 * fix their surname is wide enough to let them set role = 'admin', and no
 * amount of care in the app closes that. This writes the name columns and
 * nothing else, so the role simply is not reachable from here.
 */
create or replace function public.save_my_profile(
  p_first_name  text,
  p_last_name   text,
  p_username    text,
  p_middle_name text default null,
  p_nickname    text default null,
  p_phone       text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me  uuid := auth.uid();
  v_row public.profiles;
begin
  if v_me is null then
    raise exception 'sign in first';
  end if;

  if coalesce(btrim(p_first_name), '') = '' then
    raise exception 'A first name is needed.';
  end if;
  if coalesce(btrim(p_last_name), '') = '' then
    raise exception 'A last name is needed.';
  end if;
  if btrim(coalesce(p_username, '')) !~ '^[A-Za-z][A-Za-z0-9_.]{2,19}$' then
    raise exception 'A username is 3 to 20 characters, starts with a letter, and uses only letters, numbers, dots or underscores.';
  end if;

  -- Checked here as well as by the unique index, so the diner gets a sentence
  -- rather than a constraint name.
  if exists (
    select 1 from public.profiles
     where lower(username) = lower(btrim(p_username))
       and id <> v_me
  ) then
    raise exception 'That username is taken. Try another.';
  end if;

  update public.profiles
     set first_name  = btrim(p_first_name),
         middle_name = nullif(btrim(coalesce(p_middle_name, '')), ''),
         last_name   = btrim(p_last_name),
         username    = btrim(p_username),
         nickname    = nullif(btrim(coalesce(p_nickname, '')), ''),
         phone       = coalesce(nullif(btrim(coalesce(p_phone, '')), ''), phone)
   where id = v_me
   returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.save_my_profile(text, text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- A new account arrives with what the form collected
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id, full_name, first_name, middle_name, last_name, username, nickname, phone, role
  )
  values (
    new.id,
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'first_name', ''),
    nullif(new.raw_user_meta_data ->> 'middle_name', ''),
    nullif(new.raw_user_meta_data ->> 'last_name', ''),
    -- A username that is already taken is dropped rather than failing the
    -- signup. The form checks first; this is the race between two people
    -- choosing the same name in the same second, and losing an account over
    -- it would be far worse than asking for a different name afterwards.
    (
      select nullif(new.raw_user_meta_data ->> 'username', '')
       where not exists (
         select 1 from public.profiles
          where lower(username) = lower(new.raw_user_meta_data ->> 'username')
       )
    ),
    nullif(new.raw_user_meta_data ->> 'nickname', ''),
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    'customer'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
SQL);
    }

    public function down(): void
    {
        DB::unprepared(<<<'SQL'
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

drop function if exists public.save_my_profile(text, text, text, text, text, text);
drop function if exists public.username_available(text);
drop function if exists public.display_name(public.profiles);
drop trigger if exists profiles_full_name on public.profiles;
drop function if exists public.compose_full_name();

alter table public.profiles drop constraint if exists profiles_username_shape;
drop index if exists profiles_username_unique;

alter table public.profiles
  drop column if exists nickname,
  drop column if exists username,
  drop column if exists last_name,
  drop column if exists middle_name,
  drop column if exists first_name;
SQL);
    }
};
