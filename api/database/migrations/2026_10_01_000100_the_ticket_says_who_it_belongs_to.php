<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Whether a ticket belongs to somebody with an account, and what to call them.
 *
 * The counter could not tell. `customer_id` looks like the answer and is not:
 * every diner is given an anonymous account the moment they open the app, so
 * that column is filled in for a walk-in guest exactly as it is for a regular
 * with a real login. A ticket from each looked identical.
 *
 * ---------------------------------------------------------------------------
 * Stamped at the time, not worked out on every read
 *
 * `from_account` is written once, when the order is placed. It could have been
 * a join to auth.users on every read, but that would be a different answer to
 * a different question: whether the person *still* has an account today. What
 * the counter needs is what was true when the food was ordered, and that does
 * not change afterwards — not when they later sign up, and not when the
 * account is deleted and the order becomes a guest order in the takings.
 *
 * No client may read auth.users either, so a join would have had to happen
 * inside a function on every listing of every order.
 *
 * ---------------------------------------------------------------------------
 * The name now uses what the diner chose to be called
 *
 * The old rule fell back to the part of their email before the @, which was
 * the best available when an account had nothing but an address. Accounts now
 * carry a nickname, a username and a real name, so the ticket uses those in
 * the order the diner would expect to be greeted — the same order
 * `display_name()` uses everywhere else.
 *
 * What the diner typed still wins over all of it. They may be ordering for
 * somebody else, and the name to call out at the counter is the one on the
 * ticket.
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
