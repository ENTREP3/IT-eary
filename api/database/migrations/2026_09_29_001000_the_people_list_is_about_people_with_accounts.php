<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Two corrections to who the people list is about, and what it says about them.
 *
 * ---------------------------------------------------------------------------
 * Guests are not listed at all
 *
 * The first version included an anonymous diner if they had ordered, reasoning
 * that they were a real customer who simply never signed up. That was wrong
 * for what this screen is: an account is something you manage — suspend, ban,
 * change the role of, delete — and an anonymous row is none of those things.
 * It has no email to write to, no name to recognise, no password to reset, and
 * banning it accomplishes nothing because the next visit mints another one.
 *
 * Their orders are not lost by this. They are still in the takings, still in
 * the analytics, still on the kitchen board. They are simply not people the
 * owner can do anything to, so they do not belong on the screen whose whole
 * purpose is doing something to somebody.
 *
 * ---------------------------------------------------------------------------
 * Staff have no order figures
 *
 * Orders, spend and last order are now null for anyone who is not a customer.
 *
 * Not for tidiness: those numbers were actively misleading. `create_ticket`
 * deliberately leaves `customer_id` empty when a signed-in member of staff
 * checks out, so that a cashier testing the storefront does not bank orders
 * and loyalty against themselves. The figures for staff were therefore always
 * zero — and a column reading "0 orders, ₱0.00" next to the owner's name reads
 * as a fact about the owner rather than as a column that does not apply.
 *
 * Null says "this does not apply". Zero says "this applies, and it is none".
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
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
    -- Only while it is still in force. A suspension that ended last week is
    -- not something the screen should still be shouting about.
    case when u.banned_until > now() then u.banned_until end as banned_until,
    -- Null, not zero, for staff: see the note at the top of this migration.
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
    -- An account, not a browser that once opened the menu.
    and not coalesce(u.is_anonymous, false)
  order by
    case p.role when 'admin' then 0 when 'cashier' then 1 else 2 end,
    coalesce(o.n, 0) desc,
    p.created_at desc;
end;
$$;

grant execute on function public.list_people(text) to authenticated;

comment on function public.list_people(text) is
  'Everyone with a real account, for the owner. Anonymous guests are excluded: there is nothing to manage about one. Order figures are null for staff, because staff orders are deliberately not attributed to them.';

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
   group by p.role::text;
end;
$$;

grant execute on function public.people_counts() to authenticated;
SQL);
    }

    public function down(): void
    {
        // The previous definition lives in
        // 2026_09_29_000900_the_owner_can_actually_manage_people.
        DB::unprepared(<<<'SQL'
drop function if exists public.list_people(text);
SQL);
    }
};
