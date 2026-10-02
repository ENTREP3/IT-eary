<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * The owner can fix somebody's details, not only suspend or delete them.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
/*
 * Writes the name columns for one person, with the rules applied.
 *
 * Internal: neither `anon` nor `authenticated` may call it, because it takes
 * an id and therefore trusts its caller to have decided whose id that may be.
 * The two callers below each answer that question their own way.
 */
create or replace function public.write_profile_names(
  p_id          uuid,
  p_first_name  text,
  p_last_name   text,
  p_username    text,
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
  if btrim(coalesce(p_username, '')) !~ '^[A-Za-z][A-Za-z0-9_.]{2,19}$' then
    raise exception 'A username is 3 to 20 characters, starts with a letter, and uses only letters, numbers, dots or underscores.';
  end if;

  -- Checked here as well as by the unique index, so what comes back is a
  -- sentence rather than the name of a constraint.
  if exists (
    select 1 from public.profiles
     where lower(username) = lower(btrim(p_username))
       and id <> p_id
  ) then
    raise exception 'That username is taken. Try another.';
  end if;

  update public.profiles
     set first_name  = btrim(p_first_name),
         middle_name = nullif(btrim(coalesce(p_middle_name, '')), ''),
         last_name   = btrim(p_last_name),
         username    = btrim(p_username),
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

revoke all on function public.write_profile_names(uuid, text, text, text, text, text, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- A diner editing their own
-- ---------------------------------------------------------------------------
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
begin
  if auth.uid() is null then
    raise exception 'sign in first';
  end if;

  -- Whose row is never taken from the caller: it is read from the session.
  return public.write_profile_names(
    auth.uid(), p_first_name, p_last_name, p_username, p_middle_name, p_nickname, p_phone
  );
end;
$$;

grant execute on function public.save_my_profile(text, text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- The owner correcting somebody else's
-- ---------------------------------------------------------------------------
/*
 * Deliberately allows the owner to edit their own row as well, unlike
 * suspending or deleting. There is no privilege to escalate — the role is not
 * written here — and refusing it would mean an owner with no customer-facing
 * account had no way to set their own name at all.
 */
create or replace function public.save_person_profile(
  p_id          uuid,
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
begin
  if not public.is_admin() then
    raise exception 'only the owner may edit somebody else''s details';
  end if;

  return public.write_profile_names(
    p_id, p_first_name, p_last_name, p_username, p_middle_name, p_nickname, p_phone
  );
end;
$$;

grant execute on function public.save_person_profile(uuid, text, text, text, text, text, text) to authenticated;

comment on function public.save_person_profile(uuid, text, text, text, text, text, text) is
  'Lets the owner correct a name, username, nickname or number. Never writes the role or the email.';

-- ---------------------------------------------------------------------------
-- The list carries the parts, so an edit form can be filled in
-- ---------------------------------------------------------------------------
drop function if exists public.list_people(text);

create or replace function public.list_people(p_role text default null)
returns table (
  id            uuid,
  email         text,
  first_name    text,
  middle_name   text,
  last_name     text,
  username      text,
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
    p.id,
    u.email::text,
    p.first_name,
    p.middle_name,
    p.last_name,
    p.username,
    p.nickname,
    public.display_name(p) as display_name,
    p.full_name,
    p.phone,
    p.role::text,
    case when u.banned_until > now() then u.banned_until end as banned_until,
    case when p.role = 'customer' then coalesce(o.n, 0) end     as orders,
    case when p.role = 'customer' then coalesce(o.total, 0) end as spent,
    case when p.role = 'customer' then o.last_at end            as last_order,
    p.created_at
  from public.profiles p
  join auth.users u on u.id = p.id
  left join lateral (
    select count(*) as n,
           sum(orders.total) as total,
           max(orders.paid_at) as last_at
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
SQL);
    }

    public function down(): void
    {
        DB::unprepared(<<<'SQL'
drop function if exists public.save_person_profile(uuid, text, text, text, text, text, text);
drop function if exists public.write_profile_names(uuid, text, text, text, text, text, text);
drop function if exists public.list_people(text);
SQL);
    }
};
