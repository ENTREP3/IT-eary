<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Suspending, banning, deleting, and changing what somebody is.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
/*
 * Shared guard. Every management function starts here, so the rules cannot be
 * enforced in four places and drift in three of them.
 *
 * p_needs_another_owner is for the actions that could leave the shop
 * unadministered: deleting, banning or demoting the only owner there is.
 */
create or replace function public.assert_may_manage(
  p_target uuid,
  p_needs_another_owner boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owners int;
begin
  if not public.is_admin() then
    raise exception 'only the owner may manage people';
  end if;

  if p_target = auth.uid() then
    raise exception 'You cannot do that to your own account.';
  end if;

  if not exists (select 1 from public.profiles where id = p_target) then
    raise exception 'That account no longer exists.';
  end if;

  if p_needs_another_owner
     and exists (select 1 from public.profiles where id = p_target and role = 'admin') then
    select count(*) into v_owners from public.profiles where role = 'admin';
    if v_owners <= 1 then
      raise exception 'That is the only owner account. Make somebody else an owner first.';
    end if;
  end if;
end;
$$;

revoke all on function public.assert_may_manage(uuid, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Suspend for a while
-- ---------------------------------------------------------------------------
create or replace function public.suspend_person(p_id uuid, p_days integer default 7)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  perform public.assert_may_manage(p_id, true);

  if p_days is null or p_days < 1 or p_days > 3650 then
    raise exception 'A suspension runs between 1 and 3650 days.';
  end if;

  update auth.users
     set banned_until = now() + make_interval(days => p_days)
   where id = p_id;
end;
$$;

grant execute on function public.suspend_person(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Ban outright
-- ---------------------------------------------------------------------------
-- A hundred years rather than a nullable "forever" flag, so there is one
-- column to read and one rule for reading it.
create or replace function public.ban_person(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  perform public.assert_may_manage(p_id, true);
  update auth.users set banned_until = now() + interval '100 years' where id = p_id;
end;
$$;

grant execute on function public.ban_person(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Let them back in
-- ---------------------------------------------------------------------------
create or replace function public.restore_person(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  perform public.assert_may_manage(p_id, false);
  update auth.users set banned_until = null where id = p_id;
end;
$$;

grant execute on function public.restore_person(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Delete the account
-- ---------------------------------------------------------------------------
create or replace function public.delete_person(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  perform public.assert_may_manage(p_id, true);

  -- profiles, favourites, loyalty, stock alerts and push tokens cascade from
  -- here. Orders do not: they are SET NULL, so the shop keeps its takings and
  -- the meal simply becomes a guest order.
  delete from auth.users where id = p_id;
end;
$$;

grant execute on function public.delete_person(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Change what somebody is
-- ---------------------------------------------------------------------------
create or replace function public.set_person_role(p_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_role not in ('admin', 'cashier', 'customer') then
    raise exception 'unknown role %', p_role;
  end if;

  -- Demoting an owner needs another owner to exist; promoting somebody never
  -- does, so the guard only bites in the direction that could lock the shop.
  perform public.assert_may_manage(p_id, p_role <> 'admin');

  update public.profiles set role = p_role::user_role where id = p_id;
end;
$$;

grant execute on function public.set_person_role(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- The list says who is suspended
-- ---------------------------------------------------------------------------
drop function if exists public.list_people(text);

create or replace function public.list_people(p_role text default null)
returns table (
  id            uuid,
  email         text,
  username      text,
  display_name  text,
  full_name     text,
  phone         text,
  role          text,
  is_guest      boolean,
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
    p.username,
    public.display_name(p) as display_name,
    p.full_name,
    p.phone,
    p.role::text,
    coalesce(u.is_anonymous, false) as is_guest,
    -- Only while it is still in force. A suspension that ended last week is
    -- not something the screen should still be shouting about.
    case when u.banned_until > now() then u.banned_until end as banned_until,
    coalesce(o.n, 0)     as orders,
    coalesce(o.total, 0) as spent,
    o.last_at            as last_order,
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
    and (not coalesce(u.is_anonymous, false) or coalesce(o.n, 0) > 0)
  order by
    case p.role when 'admin' then 0 when 'cashier' then 1 else 2 end,
    coalesce(o.n, 0) desc,
    p.created_at desc;
end;
$$;

grant execute on function public.list_people(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Reading your own details back
create or replace function public.my_profile()
returns table (
  id          uuid,
  email       text,
  first_name  text,
  middle_name text,
  last_name   text,
  username    text,
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
         p.username, p.nickname, p.phone, p.full_name, p.role::text
    from public.profiles p
    join auth.users u on u.id = p.id
   where p.id = auth.uid();
end;
$$;

grant execute on function public.my_profile() to authenticated;
SQL);
    }

    public function down(): void
    {
        DB::unprepared(<<<'SQL'
drop function if exists public.my_profile();
drop function if exists public.set_person_role(uuid, text);
drop function if exists public.delete_person(uuid);
drop function if exists public.restore_person(uuid);
drop function if exists public.ban_person(uuid);
drop function if exists public.suspend_person(uuid, integer);
drop function if exists public.assert_may_manage(uuid, boolean);
SQL);
    }
};
