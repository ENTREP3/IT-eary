<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * The things the shop notices by itself.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
-- ---------------------------------------------------------------------------
-- A dish runs out
-- ---------------------------------------------------------------------------
-- On the edge, not the state: an owner editing the price of an already
-- sold-out dish must not be told it has just sold out.
create or replace function public.tell_owner_dish_sold_out()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.available and not new.available then
    perform public.push_notify(jsonb_build_object(
      'to', jsonb_build_object('kind', 'admins'),
      'title', new.name || ' has run out',
      'body', 'It is now hidden from the menu.',
      'url', '/',
      -- Per dish, so a busy afternoon does not bury each one under the next.
      'tag', 'soldout-' || new.id
    ));
  end if;
  return new;
end;
$$;

drop trigger if exists dishes_sold_out_notice on public.dishes;
create trigger dishes_sold_out_notice
  after update of available on public.dishes
  for each row execute function public.tell_owner_dish_sold_out();

-- ---------------------------------------------------------------------------
-- An ingredient falls below its par level
create or replace function public.tell_owner_stock_low()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.reorder_at > 0
     and new.stock <= new.reorder_at
     and old.stock > old.reorder_at then
    perform public.push_notify(jsonb_build_object(
      'to', jsonb_build_object('kind', 'admins'),
      'title', 'Running low on ' || new.name,
      'body', trim(to_char(new.stock, 'FM999999990.99')) || ' ' || new.unit || ' left.',
      'url', '/',
      'tag', 'lowstock-' || new.id
    ));
  end if;
  return new;
end;
$$;

drop trigger if exists inventory_low_notice on public.inventory;
create trigger inventory_low_notice
  after update of stock on public.inventory
  for each row execute function public.tell_owner_stock_low();

-- ---------------------------------------------------------------------------
-- A diner uploads proof of a GCash payment
-- ---------------------------------------------------------------------------
-- Somebody is standing at the counter waiting to be let through, so this one
-- goes to whoever is working rather than only the owner.
create or replace function public.tell_counter_proof_arrived()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.proof_path is not null
     and (old.proof_path is null or old.proof_path <> new.proof_path) then
    perform public.push_notify(jsonb_build_object(
      'to', jsonb_build_object('kind', 'staff'),
      'title', 'GCash proof for ' || new.ticket_code,
      'body', 'Someone is waiting for this to be checked.',
      'url', '/',
      'tag', 'proof-' || new.ticket_code
    ));
  end if;
  return new;
end;
$$;

drop trigger if exists orders_proof_notice on public.orders;
create trigger orders_proof_notice
  after update of proof_path on public.orders
  for each row execute function public.tell_counter_proof_arrived();

-- ---------------------------------------------------------------------------
-- An order is cancelled by staff
create or replace function public.tell_owner_order_cancelled()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    perform public.push_notify(jsonb_build_object(
      'to', jsonb_build_object('kind', 'admins'),
      'title', 'Order ' || new.ticket_code || ' was cancelled',
      'body', 'Worth ' || trim(to_char(new.total, 'FM999999990.00')) || ' pesos.',
      'url', '/',
      'tag', 'cancelled-' || new.ticket_code
    ));
  end if;
  return new;
end;
$$;

drop trigger if exists orders_cancelled_notice on public.orders;
create trigger orders_cancelled_notice
  after update of status on public.orders
  for each row execute function public.tell_owner_order_cancelled();

-- ---------------------------------------------------------------------------
-- A poor rating arrives
create or replace function public.tell_owner_poor_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dish text;
begin
  if new.rating <= 2 then
    select name into v_dish from public.dishes where id = new.dish_id;

    perform public.push_notify(jsonb_build_object(
      'to', jsonb_build_object('kind', 'admins'),
      'title', new.rating || '-star rating for ' || coalesce(v_dish, new.dish_id),
      'body', coalesce(nullif(btrim(new.comment), ''), 'No comment left.'),
      'url', '/',
      -- Not per dish: two bad ratings in one evening are two things to read.
      'tag', 'rating-' || new.id
    ));
  end if;
  return new;
end;
$$;

drop trigger if exists reviews_poor_notice on public.reviews;
create trigger reviews_poor_notice
  after insert on public.reviews
  for each row execute function public.tell_owner_poor_rating();
SQL);
    }

    public function down(): void
    {
        DB::unprepared(<<<'SQL'
drop trigger if exists reviews_poor_notice on public.reviews;
drop trigger if exists orders_cancelled_notice on public.orders;
drop trigger if exists orders_proof_notice on public.orders;
drop trigger if exists inventory_low_notice on public.inventory;
drop trigger if exists dishes_sold_out_notice on public.dishes;

drop function if exists public.tell_owner_poor_rating();
drop function if exists public.tell_owner_order_cancelled();
drop function if exists public.tell_counter_proof_arrived();
drop function if exists public.tell_owner_stock_low();
drop function if exists public.tell_owner_dish_sold_out();
SQL);
    }
};
