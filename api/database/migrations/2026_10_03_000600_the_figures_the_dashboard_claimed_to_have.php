<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Average order value, repeat purchases, and a real conversion rate.
 */
return new class extends Migration
{
    public function up(): void
    {
        // Conversion needs a denominator, and nothing anywhere counted somebody
        // opening the menu. One row per device per day: enough to divide by,
        // and not a log of what anybody looked at.
        DB::unprepared(<<<'SQL'
            create table if not exists public.menu_visits (
              day          date not null default (now() at time zone 'Asia/Manila')::date,
              device_token uuid not null,
              primary key (day, device_token)
            );

            comment on table public.menu_visits is
              'One row per device per day that opened the menu. The denominator for conversion, and deliberately not a record of what was browsed.';

            alter table public.menu_visits enable row level security;

            -- Nobody reads this directly. The figures come from a function that
            -- only staff may call, and a diner has no business counting others.
            drop policy if exists menu_visits_staff_read on public.menu_visits;
            create policy menu_visits_staff_read
              on public.menu_visits for select
              using (public.is_staff());
        SQL);

        DB::unprepared(<<<'SQL'
            create or replace function public.record_menu_visit(p_device_token uuid)
            returns void
            language sql
            security definer
            set search_path = public
            as $$
              insert into public.menu_visits (device_token)
              values (p_device_token)
              on conflict (day, device_token) do nothing;
            $$;

            grant execute on function public.record_menu_visit(uuid) to anon, authenticated;
        SQL);

        DB::unprepared(<<<'SQL'
            /*
             * The three figures, for a window of days.
             *
             * A sale is a ticket that was paid for and not cancelled, refunded
             * or expired — the same rule the rest of the dashboard uses, so the
             * numbers here agree with the ones beside them.
             *
             * Repeat purchase counts a buyer by account where there is one and
             * by device otherwise, because a guest ordering twice from the same
             * phone is the thing being measured.
             */
            create or replace function public.shop_metrics(p_days int default 30)
            returns table (
              orders_counted  int,
              average_order   numeric,
              buyers          int,
              repeat_buyers   int,
              repeat_rate     numeric,
              menu_visitors   int,
              conversion_rate numeric
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
              visits as (
                select count(*)::int as n
                  from public.menu_visits m, window_start w
                 where m.day >= (w.since at time zone 'Asia/Manila')::date
              )
              select
                (select count(*)::int from sales),
                (select round(coalesce(avg(total), 0), 2) from sales),
                (select count(*)::int from per_buyer),
                (select count(*)::int from per_buyer where n > 1),
                (select case when count(*) = 0 then 0
                        else round(100.0 * count(*) filter (where n > 1) / count(*), 1) end
                   from per_buyer),
                (select n from visits),
                (select case when (select n from visits) = 0 then 0
                        else round(100.0 * (select count(*) from sales) / (select n from visits), 1) end);
            $$;

            grant execute on function public.shop_metrics(int) to authenticated;
        SQL);
    }

    public function down(): void
    {
        DB::unprepared(<<<'SQL'
            drop function if exists public.shop_metrics(int);
            drop function if exists public.record_menu_visit(uuid);
            drop table if exists public.menu_visits;
        SQL);
    }
};
