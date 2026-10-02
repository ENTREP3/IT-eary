<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * The two notifications that no row change can produce.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
create extension if not exists pg_cron;

alter table public.orders
  add column if not exists nudged_at timestamptz;

comment on column public.orders.nudged_at is
  'When the counter was reminded this ticket is still unpaid. Set once, so the reminder does not repeat.';

-- ---------------------------------------------------------------------------
-- Tickets nobody has settled
-- ---------------------------------------------------------------------------
create or replace function public.nudge_unpaid_tickets()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select ticket_code, total
      from public.orders
     where paid_at is null
       and status = 'pending'
       and nudged_at is null
       and created_at < now() - interval '15 minutes'
       -- Anything older than the day is not a ticket somebody is waiting on,
       -- it is one that was abandoned; a different problem, and not one a
       -- notification at the till solves.
       and created_at > now() - interval '6 hours'
     order by created_at
     limit 20
  loop
    perform public.push_notify(jsonb_build_object(
      'to', jsonb_build_object('kind', 'staff'),
      'title', 'Ticket ' || r.ticket_code || ' is still unpaid',
      'body', 'Ordered over 15 minutes ago, and it is holding stock.',
      'url', '/',
      'tag', 'unpaid-' || r.ticket_code
    ));

    update public.orders set nudged_at = now() where ticket_code = r.ticket_code;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- What the day came to
-- ---------------------------------------------------------------------------
create or replace function public.send_daily_summary()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start    timestamptz := date_trunc('day', now() at time zone 'Asia/Manila') at time zone 'Asia/Manila';
  v_orders   integer;
  v_takings  numeric;
  v_refunded numeric;
  v_unsettled integer;
begin
  select count(*), coalesce(sum(total), 0)
    into v_orders, v_takings
    from public.orders
   where paid_at >= v_start
     and status <> 'cancelled';

  select coalesce(sum(amount), 0) into v_refunded
    from public.refunds
   where created_at >= v_start;

  select count(*) into v_unsettled
    from public.orders
   where created_at >= v_start
     and paid_at is null
     and status = 'pending';

  perform public.push_notify(jsonb_build_object(
    'to', jsonb_build_object('kind', 'admins'),
    'title', 'Today: ' || trim(to_char(v_takings, 'FM999999990.00')) || ' pesos',
    'body', v_orders || ' orders'
            || case when v_refunded > 0
                 then ', ' || trim(to_char(v_refunded, 'FM999999990.00')) || ' refunded'
                 else '' end
            || case when v_unsettled > 0
                 then ', ' || v_unsettled || ' left unpaid'
                 else '' end
            || '.',
    'url', '/',
    'tag', 'summary'
  ));
exception when others then
  -- A missing table or a renamed column must not leave a cron job failing
  -- every night in a log nobody reads.
  return;
end;
$$;

-- ---------------------------------------------------------------------------
-- The schedule
-- ---------------------------------------------------------------------------
-- Unscheduled first, so re-running this migration does not stack duplicates.
select cron.unschedule('nudge-unpaid-tickets')
 where exists (select 1 from cron.job where jobname = 'nudge-unpaid-tickets');

select cron.unschedule('daily-summary')
 where exists (select 1 from cron.job where jobname = 'daily-summary');

-- Every five minutes through the day. Cheap: it reads an indexed handful of
-- rows and usually finds none.
select cron.schedule('nudge-unpaid-tickets', '*/5 * * * *', 'select public.nudge_unpaid_tickets()');

-- 20:30 Manila is 12:30 UTC, half an hour after the latest closing time.
select cron.schedule('daily-summary', '30 12 * * *', 'select public.send_daily_summary()');
SQL);
    }

    public function down(): void
    {
        DB::unprepared(<<<'SQL'
select cron.unschedule('nudge-unpaid-tickets')
 where exists (select 1 from cron.job where jobname = 'nudge-unpaid-tickets');

select cron.unschedule('daily-summary')
 where exists (select 1 from cron.job where jobname = 'daily-summary');

drop function if exists public.send_daily_summary();
drop function if exists public.nudge_unpaid_tickets();

alter table public.orders drop column if exists nudged_at;
SQL);
    }
};
