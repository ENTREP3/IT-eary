<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Everyone with an account, for the owner to look at in one place.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
create or replace function public.list_people(p_role text default null)
returns table (
  id           uuid,
  email        text,
  username     text,
  display_name text,
  full_name    text,
  phone        text,
  role         text,
  is_guest     boolean,
  orders       bigint,
  spent        numeric,
  last_order   timestamptz,
  created_at   timestamptz
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
    coalesce(o.n, 0)      as orders,
    coalesce(o.total, 0)  as spent,
    o.last_at             as last_order,
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
    -- An anonymous account that never ordered is not a customer, it is a
    -- browser that opened the menu once.
    and (not coalesce(u.is_anonymous, false) or coalesce(o.n, 0) > 0)
  order by
    -- Staff first, then customers by how much they actually order. An owner
    -- looking at this list wants the regulars, not whoever signed up last.
    case p.role when 'admin' then 0 when 'cashier' then 1 else 2 end,
    coalesce(o.n, 0) desc,
    p.created_at desc;
end;
$$;

grant execute on function public.list_people(text) to authenticated;

comment on function public.list_people(text) is
  'Everyone with an account, for the owner. Anonymous rows that never ordered are left out; anonymous rows that did are shown as guests.';

/*
 * How many of each, including the guests the list leaves out.
 *
 * Counted in the database rather than by measuring the list, so the totals do
 * not silently change meaning if the list ever gains a filter or a limit.
 */
create or replace function public.people_counts()
returns table (role text, n bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'only the owner may see the people list';
  end if;

  return query
  select p.role::text, count(*)
    from public.profiles p
    join auth.users u on u.id = p.id
   where not coalesce(u.is_anonymous, false)
      or exists (
        select 1 from public.orders
         where customer_id = p.id and paid_at is not null
      )
   group by p.role::text;
end;
$$;

grant execute on function public.people_counts() to authenticated;
SQL);
    }

    public function down(): void
    {
        DB::unprepared(<<<'SQL'
drop function if exists public.people_counts();
drop function if exists public.list_people(text);
SQL);
    }
};
