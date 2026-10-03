<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Close the day: what was not sold is thrown away, and counted as thrown away.
 *
 * Servings carried over midnight. Twenty cooked, fifteen sold, and the next
 * morning the menu still offered five — food that had sat out overnight and
 * could not be served. The figures agreed with the menu rather than with the
 * kitchen: nothing recorded the loss, so a day that wasted a quarter of its
 * cooking looked identical to one that sold out.
 *
 * Three changes, and they belong together:
 *
 *   1. A closing records what was left, at what it cost to make, and sets the
 *      count to zero. Waste stops being inferred from cooked-minus-sold and
 *      becomes a row with a date on it.
 *   2. No servings means none, not unlimited. A blank was read as "do not
 *      track", which is a reasonable default for a shop that never counts and
 *      a dangerous one for a shop that does.
 *   3. Nought servings means off the menu, decided by the database rather than
 *      by somebody remembering to flip a switch.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
            create table if not exists public.spoilage (
              id         uuid primary key default gen_random_uuid(),
              dish_id    text not null references public.dishes (id) on delete cascade,
              servings   integer not null check (servings > 0),
              -- What a serving cost to make, kept at the time rather than
              -- recomputed: ingredient prices move, and last week's loss should
              -- be valued at last week's prices.
              unit_cost  numeric(10,2),
              day        date not null default (now() at time zone 'Asia/Manila')::date,
              closed_at  timestamptz not null default now(),
              -- Null when the nightly job did it rather than a person.
              closed_by  uuid references auth.users (id)
            );

            comment on table public.spoilage is
              'Servings cooked and not sold by closing. The waste figure as an event with a date, rather than a subtraction.';

            create index if not exists spoilage_day_idx on public.spoilage (day desc);

            -- One closing per dish per day. Running the job twice, or closing by
            -- hand after it has run, must not double the loss.
            create unique index if not exists spoilage_one_per_day
              on public.spoilage (dish_id, day);

            alter table public.spoilage enable row level security;

            drop policy if exists spoilage_staff_read on public.spoilage;
            create policy spoilage_staff_read
              on public.spoilage for select using (public.is_staff());
        SQL);

        // ------------------------------------------------------------------
        // No servings means none.
        // ------------------------------------------------------------------
        DB::unprepared(<<<'SQL'
            update public.dishes set stock_count = 0 where stock_count is null;

            alter table public.dishes
              alter column stock_count set default 0;

            alter table public.dishes
              alter column stock_count set not null;

            comment on column public.dishes.stock_count is
              'Servings left today. Zero means none, and takes the dish off the menu — it never meant unlimited.';
        SQL);

        // ------------------------------------------------------------------
        // Nought servings means off the menu.
        // ------------------------------------------------------------------
        DB::unprepared(<<<'SQL'
            create or replace function public.dish_follows_its_stock()
            returns trigger
            language plpgsql
            as $$
            begin
              -- Only one direction is forced. Running out takes a dish off the
              -- menu; having servings does not put it back on, because the
              -- owner may be holding it back for a reason of their own and
              -- overruling that would be the system arguing with them.
              if coalesce(new.stock_count, 0) <= 0 then
                new.available := false;
              end if;
              return new;
            end;
            $$;

            drop trigger if exists dishes_follow_stock on public.dishes;
            create trigger dishes_follow_stock
              before insert or update on public.dishes
              for each row execute function public.dish_follows_its_stock();
        SQL);

        // ------------------------------------------------------------------
        // The closing itself.
        // ------------------------------------------------------------------
        DB::unprepared(<<<'SQL'
            create or replace function public.close_the_day()
            returns int
            language plpgsql
            security definer
            set search_path = public
            as $$
            declare
              v_closed int := 0;
              v_day    date := (now() at time zone 'Asia/Manila')::date;
            begin
              insert into public.spoilage (dish_id, servings, unit_cost, day, closed_by)
              select d.id, d.stock_count, public.dish_cost(d.id), v_day, auth.uid()
                from public.dishes d
               where coalesce(d.stock_count, 0) > 0
              on conflict (dish_id, day) do nothing;

              get diagnostics v_closed = row_count;

              -- The trigger above takes each one off the menu as this lands.
              update public.dishes
                 set stock_count = 0
               where coalesce(stock_count, 0) > 0;

              return v_closed;
            end;
            $$;

            comment on function public.close_the_day() is
              'Records what was left as spoilage and zeroes the counts. Safe to run twice: one closing per dish per day.';

            grant execute on function public.close_the_day() to authenticated;
        SQL);

        // ------------------------------------------------------------------
        // Nightly, so nobody has to remember.
        // ------------------------------------------------------------------
        DB::unprepared(<<<'SQL'
            do $$
            begin
              perform cron.unschedule('close-the-day');
            exception when others then
              null;
            end $$;
        SQL);

        DB::unprepared(<<<'SQL'
            -- 23:00 in Manila, which is 15:00 UTC. After any plausible closing
            -- time and before midnight, so the loss lands on the day that
            -- cooked it rather than the morning after.
            select cron.schedule('close-the-day', '0 15 * * *', 'select public.close_the_day()');
        SQL);

        // ------------------------------------------------------------------
        // What it cost, for the dashboard.
        // ------------------------------------------------------------------
        DB::unprepared(<<<'SQL'
            create or replace function public.spoilage_by_day(p_days int default 7)
            returns table (
              day           date,
              servings      int,
              wasted_value  numeric
            )
            language sql
            stable
            security definer
            set search_path = public
            as $$
              select s.day,
                     sum(s.servings)::int,
                     round(sum(s.servings * coalesce(s.unit_cost, 0)), 2)
                from public.spoilage s
               where public.is_staff()
                 and s.day >= ((now() at time zone 'Asia/Manila')::date
                               - greatest(1, least(coalesce(p_days, 7), 365)))
               group by s.day
               order by s.day;
            $$;

            grant execute on function public.spoilage_by_day(int) to authenticated;
        SQL);
    }

    public function down(): void
    {
        DB::unprepared(<<<'SQL'
            do $$
            begin
              perform cron.unschedule('close-the-day');
            exception when others then
              null;
            end $$;
        SQL);

        DB::unprepared(<<<'SQL'
            drop function if exists public.spoilage_by_day(int);
            drop function if exists public.close_the_day();
            drop trigger if exists dishes_follow_stock on public.dishes;
            drop function if exists public.dish_follows_its_stock();
            alter table public.dishes alter column stock_count drop not null;
            drop table if exists public.spoilage;
        SQL);
    }
};
