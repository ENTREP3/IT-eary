<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * A reservation that never ends is not a reservation, it is a loss.
 *
 * Placing an order takes the serving off the menu straight away, and that is
 * right: the diner is walking over, and the whole promise of this shop's site
 * is that what it says is cooking will still be there when they arrive. Selling
 * the last adobo twice would send somebody on a trip for nothing.
 *
 * But the hold had no end. A diner who took a ticket and never came held that
 * plate for ever — the food sitting in the platter, perfectly sellable, while
 * the menu told the next customer it was sold out. Nothing was wasted in the
 * kitchen, because food cannot be cooked before it is paid for; what was lost
 * was the sale to the person who actually turned up.
 *
 * So the ticket and the plate are separated. The no-show loses their ticket,
 * which is the shop's own rule and fair enough. The serving goes back on the
 * menu, because it never left the platter.
 *
 * `expired` rather than `cancelled`, though both mean nobody paid and nothing
 * is owed. A diner calling their order off and a diner never arriving are
 * different events, and the shop cannot count how often the second happens if
 * it is written down as the first.
 *
 * There is no pg_cron on this project, so nothing can run on a timer. The sweep
 * is called instead at the moments staleness becomes visible — a diner loading
 * the menu, staff opening the kitchen board — which at this volume is more than
 * often enough, and needs no new infrastructure.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status = any (array[
    'pending', 'paid', 'preparing', 'ready', 'completed',
    'cancelled', 'refunded', 'expired'
  ]));

-- ---------------------------------------------------------------------------
-- Expired joins the outcomes that put a serving back
-- ---------------------------------------------------------------------------
create or replace function public.settle_order_to_dishes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  did  text;
  q    int;
  v_now_paid  boolean := new.paid_at is not null;
  v_was_paid  boolean := old.paid_at is not null;
  -- Three different stories about why an order ended, one consequence for the
  -- shelf: it is no longer a sale, and its servings are available again.
  v_now_gone  boolean := new.status in ('cancelled', 'refunded', 'expired');
  v_was_gone  boolean := old.status in ('cancelled', 'refunded', 'expired');
begin
  if v_now_paid and not v_was_paid and not v_now_gone then
    for item in select * from jsonb_array_elements(coalesce(new.items, '[]'::jsonb))
    loop
      did := item ->> 'id';
      q   := coalesce((item ->> 'qty')::int, 0);
      if did is null or q <= 0 then continue; end if;
      update public.dishes set sold_today = sold_today + q where id = did;
    end loop;
  end if;

  -- Guarded on the previous status so this happens on the transition only,
  -- never again on some later write to the same row.
  if v_now_gone and not v_was_gone then
    for item in select * from jsonb_array_elements(coalesce(new.items, '[]'::jsonb))
    loop
      did := item ->> 'id';
      q   := coalesce((item ->> 'qty')::int, 0);
      if did is null or q <= 0 then continue; end if;

      update public.dishes
        set stock_count = case when stock_count is null then null
                               else stock_count + q end,
            available   = case when stock_count is null then available
                               when stock_count = 0 then true
                               else available end,
            sold_today  = case when v_was_paid then greatest(0, sold_today - q)
                               else sold_today end
        where id = did;
    end loop;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- The sweep
-- ---------------------------------------------------------------------------
create or replace function public.release_stale_tickets()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_freed integer;
begin
  -- Deliberately takes no arguments. Anyone loading the menu may call this, so
  -- there must be nothing to point it at: it can only ever expire tickets that
  -- are already unpaid, still pending, and out of time.
  with stale as (
    update public.orders
       set status = 'expired'
     where status = 'pending'
       and paid_at is null
       -- Where the diner named a time they would collect, that time plus an
       -- hour's grace. Otherwise two hours from ordering, which is a generous
       -- walk from anywhere in the barangay.
       and now() > coalesce(pickup_at + interval '1 hour',
                            created_at + interval '2 hours')
    returning 1
  )
  select count(*) into v_freed from stale;

  return v_freed;
end;
$$;

comment on function public.release_stale_tickets() is
  'Expires unpaid tickets nobody came for, returning their servings to the menu. Safe to call from anywhere; takes no arguments on purpose.';

revoke all on function public.release_stale_tickets() from public;
grant execute on function public.release_stale_tickets() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- An expired ticket is finished with
-- ---------------------------------------------------------------------------
create or replace function public.advance_order_status(
  p_ticket_code text,
  p_status      text
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
begin
  if not public.is_staff() then
    raise exception 'staff only';
  end if;

  if p_status not in ('preparing', 'ready', 'completed', 'cancelled') then
    raise exception 'unknown status %', p_status;
  end if;

  if p_status = 'cancelled' and not public.is_admin() then
    raise exception 'only the owner may cancel an order';
  end if;

  select * into v_order from public.orders
   where ticket_code = upper(trim(p_ticket_code)) for update;

  if v_order.id is null then
    raise exception 'no ticket %', p_ticket_code;
  end if;

  if v_order.status = 'refunded' then
    raise exception 'ticket % has been refunded', p_ticket_code;
  end if;

  if v_order.status = 'expired' then
    raise exception
      'ticket % expired unclaimed and its food went back on the menu', p_ticket_code;
  end if;

  if p_status in ('preparing', 'ready', 'completed') and v_order.paid_at is null then
    raise exception 'ticket % has not been settled yet', p_ticket_code;
  end if;

  if p_status = 'cancelled' and v_order.paid_at is not null then
    raise exception
      'ticket % has been paid for — refund it rather than cancelling it', p_ticket_code;
  end if;

  update public.orders
     set status       = p_status,
         completed_at = case when p_status = 'completed' then now() else completed_at end
   where id = v_order.id
   returning * into v_order;

  return v_order;
end;
$$;

-- An expired ticket was never paid, so it was never in the takings. Named here
-- anyway, so the rule reads the same as every other place money is counted.
create or replace function public.cogs_by_day(p_days int default 7)
returns table (
  day        date,
  sales      numeric,
  cogs       numeric,
  gross      numeric,
  margin_pct numeric
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_admin() then
    raise exception 'owners only';
  end if;

  return query
  with sold as (
    select o.created_at::date as day,
           o.total,
           (select coalesce(sum(
                     (item ->> 'qty')::int * coalesce(public.dish_cost(item ->> 'id'), 0)
                   ), 0)
              from jsonb_array_elements(o.items) as item) as line_cost
      from public.orders o
     where o.paid_at is not null
       and o.status not in ('cancelled', 'refunded', 'expired')
       and o.created_at >= current_date - (p_days - 1)
  )
  select s.day,
         round(sum(s.total), 2),
         round(sum(s.line_cost), 2),
         round(sum(s.total) - sum(s.line_cost), 2),
         round((sum(s.total) - sum(s.line_cost)) / nullif(sum(s.total), 0) * 100, 1)
    from sold s
   group by s.day
   order by s.day;
end;
$$;

grant execute on function public.cogs_by_day(int) to authenticated;
SQL);
    }

    public function down(): void
    {
        DB::unprepared(<<<'SQL'
drop function if exists public.release_stale_tickets();
update public.orders set status = 'cancelled' where status = 'expired';
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status = any (array[
    'pending', 'paid', 'preparing', 'ready', 'completed', 'cancelled', 'refunded'
  ]));
SQL);
    }
};
