<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Abandonment, and one table for the two things worth counting.
 *
 * `menu_visits` answered one question — how many people opened the menu — and
 * the next question needs the same shape: how many started a cart and never
 * finished. Rather than a second single-purpose table, this is one row per
 * device per day per event, which also leaves room for whatever is worth
 * counting next without another migration like this one.
 *
 * Still deliberately coarse. A row says "this device opened the menu today",
 * not what it looked at or in what order. Counting is the point; following
 * somebody around is not, and a karinderya has no use for the second.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
            create table if not exists public.storefront_events (
              day          date not null default (now() at time zone 'Asia/Manila')::date,
              device_token uuid not null,
              event        text not null,
              primary key (day, device_token, event),
              constraint storefront_events_event_check
                check (event in ('menu_viewed', 'cart_started'))
            );

            comment on table public.storefront_events is
              'One row per device per day per event. The denominators for conversion and abandonment, and deliberately not a record of what anybody browsed.';

            alter table public.storefront_events enable row level security;

            drop policy if exists storefront_events_staff_read on public.storefront_events;
            create policy storefront_events_staff_read
              on public.storefront_events for select
              using (public.is_staff());
        SQL);

        // Carry over whatever the old table collected.
        DB::unprepared(<<<'SQL'
            insert into public.storefront_events (day, device_token, event)
            select day, device_token, 'menu_viewed' from public.menu_visits
            on conflict do nothing;
        SQL);

        DB::unprepared(<<<'SQL'
            create or replace function public.record_storefront_event(
              p_event        text,
              p_device_token uuid
            )
            returns void
            language sql
            security definer
            set search_path = public
            as $$
              insert into public.storefront_events (device_token, event)
              select p_device_token, p_event
               where p_device_token is not null
                 and p_event in ('menu_viewed', 'cart_started')
              on conflict (day, device_token, event) do nothing;
            $$;

            grant execute on function public.record_storefront_event(text, uuid) to anon, authenticated;

            drop function if exists public.record_menu_visit(uuid);
            drop table if exists public.menu_visits;
        SQL);

        DB::unprepared(<<<'SQL'
            -- Dropped first: the shape gains three columns, and Postgres will
            -- not replace a function whose return type has changed.
            drop function if exists public.shop_metrics(int);

            create function public.shop_metrics(p_days int default 30)
            returns table (
              orders_counted    int,
              average_order     numeric,
              buyers            int,
              repeat_buyers     int,
              repeat_rate       numeric,
              menu_visitors     int,
              conversion_rate   numeric,
              carts_started     int,
              carts_abandoned   int,
              abandon_rate      numeric
            )
            language sql
            stable
            security definer
            set search_path = public
            as $$
              with window_start as (
                select (now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365))))
                  as since
              ),
              sales as (
                select o.*,
                       coalesce(o.customer_id::text, o.device_token::text) as buyer
                  from public.orders o, window_start w
                 where o.paid_at is not null
                   and o.status not in ('cancelled', 'refunded', 'expired')
                   and o.created_at >= w.since
              ),
              per_buyer as (
                select buyer, count(*) as n from sales where buyer is not null group by buyer
              ),
              ev as (
                select e.event, e.day, e.device_token
                  from public.storefront_events e, window_start w
                 where e.day >= (w.since at time zone 'Asia/Manila')::date
              ),
              /*
               * Counting began when the first event was recorded, and a rate
               * is only honest over a period where both halves exist. Without
               * this the numerator carries months of tickets against a handful
               * of visits and conversion reads 1800%.
               */
              tracking_since as (
                select min(day) as day from public.storefront_events
              ),
              converted as (
                select count(*)::int n
                  from sales s, tracking_since t
                 where t.day is not null
                   and (s.created_at at time zone 'Asia/Manila')::date >= t.day
              ),
              viewed as (select count(*)::int n from ev where event = 'menu_viewed'),
              started as (select count(*)::int n from ev where event = 'cart_started'),
              /*
               * A cart is abandoned when a device filled one on a day and no
               * ticket of theirs was raised that day. Counted per day on
               * purpose: somebody who browses on Monday and buys on Wednesday
               * did abandon Monday's cart, and pretending otherwise flatters
               * the figure.
               */
              finished as (
                select distinct (o.created_at at time zone 'Asia/Manila')::date as day,
                       o.device_token
                  from public.orders o, window_start w
                 where o.created_at >= w.since and o.device_token is not null
              ),
              abandoned as (
                select count(*)::int n
                  from ev e
                 where e.event = 'cart_started'
                   and not exists (
                     select 1 from finished f
                      where f.day = e.day and f.device_token = e.device_token
                   )
              )
              select
                (select count(*)::int from sales),
                (select round(coalesce(avg(total), 0), 2) from sales),
                (select count(*)::int from per_buyer),
                (select count(*)::int from per_buyer where n > 1),
                (select case when count(*) = 0 then 0
                        else round(100.0 * count(*) filter (where n > 1) / count(*), 1) end
                   from per_buyer),
                (select n from viewed),
                (select case when (select n from viewed) = 0 then 0
                        else least(
                          100.0,
                          round(100.0 * (select n from converted) / (select n from viewed), 1)
                        ) end),
                (select n from started),
                (select n from abandoned),
                (select case when (select n from started) = 0 then 0
                        else round(100.0 * (select n from abandoned) / (select n from started), 1) end);
            $$;

            grant execute on function public.shop_metrics(int) to authenticated;
        SQL);
    }

    public function down(): void
    {
        DB::unprepared(<<<'SQL'
            drop function if exists public.record_storefront_event(text, uuid);
            drop table if exists public.storefront_events;
        SQL);
    }
};
