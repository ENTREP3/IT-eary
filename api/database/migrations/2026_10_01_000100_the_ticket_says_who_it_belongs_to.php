<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Whether a ticket belongs to somebody with an account, and what to call them.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
alter table public.orders
  add column if not exists from_account boolean not null default false;

comment on column public.orders.from_account is
  'True when the diner had a real account at the time of ordering. Stamped once; a guest who signs up later does not change their old tickets.';

-- Backfill: an order belongs to an account if its owner is not anonymous.
update public.orders o
   set from_account = true
  from auth.users u
 where u.id = o.customer_id
   and not coalesce(u.is_anonymous, false)
   and o.from_account is distinct from true;

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

  -- Recorded whatever the name turns out to be, including when the diner
  -- typed their own: the counter wants to know an account is behind the
  -- ticket even if the name on it is somebody else's.
  new.from_account := not coalesce(v_anonymous, true);

  -- What the diner typed always wins. They may be ordering for somebody else.
  if coalesce(btrim(new.customer_name), '') <> '' then
    return new;
  end if;

  -- A guest has nothing to look up, and inventing something would be worse
  -- than the empty name the counter already knows how to show.
  if coalesce(v_anonymous, true) then
    return new;
  end if;

  select coalesce(
           nullif(btrim(coalesce(p.nickname, '')), ''),
           nullif(btrim(coalesce(p.username, '')), ''),
           nullif(btrim(coalesce(p.full_name, '')), ''),
           nullif(btrim(coalesce(p.first_name, '')), '')
         )
    into v_name
    from public.profiles p
   where p.id = new.customer_id;

  if v_name is null then
    -- An account made before names were collected. The part before the @ is
    -- not pretty, but it is how that person already identifies themselves
    -- here, and it beats calling out nothing.
    select nullif(split_part(u.email, '@', 1), '') into v_name
      from auth.users u where u.id = new.customer_id;
  end if;

  new.customer_name := v_name;
  return new;
end;
$$;

drop trigger if exists orders_stamp_customer_name on public.orders;
create trigger orders_stamp_customer_name
  before insert on public.orders
  for each row execute function public.stamp_customer_name();
SQL);
    }

    public function down(): void
    {
        DB::unprepared(<<<'SQL'
alter table public.orders drop column if exists from_account;
SQL);
    }
};
