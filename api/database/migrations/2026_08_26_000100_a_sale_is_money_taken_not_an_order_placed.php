<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * A ticket counted as a sale the moment it was created, and never stopped.
 *
 * `apply_order_to_dishes` ran on insert and did two different jobs at once:
 * it held back a plate (right — two diners must not be sold the last serving)
 * and it recorded a sale (wrong — nobody had paid yet). Adding to a cart moved
 * the day's takings. Cancelling moved nothing back, so a cancelled order stayed
 * in the takings forever and its plate was never returned to the shelf.
 *
 * The two jobs are now separated by the event that actually distinguishes them:
 *
 *   placed     -> hold the plate
 *   paid       -> record the sale
 *   cancelled  -> give the plate back, and take the sale off if one was recorded
 *
 * `paid_at` is the marker rather than `payment_status`, because it is what the
 * cashier's own settle path stamps and what `cogs_by_day` already trusted. A
 * ticket sitting in `needs_review` is not money in the till yet; it becomes one
 * when the owner resolves it on the dashboard.
 *
 * Reversal is written so it cannot run twice. Cancelling an already-cancelled
 * order, or a second UPDATE that touches an unrelated column, must not keep
 * handing back plates — hence the guard on the previous row's own status.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
-- ---------------------------------------------------------------------------
-- Placing an order holds the plate. It does not record a sale.
-- ---------------------------------------------------------------------------
create or replace function public.apply_order_to_dishes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  did  text;
  q    int;
begin
  for item in select * from jsonb_array_elements(coalesce(new.items, '[]'::jsonb))
  loop
    did := item ->> 'id';
    q   := coalesce((item ->> 'qty')::int, 0);
    if did is null or q <= 0 then
      continue;
    end if;

    update public.dishes
      set stock_count = case when stock_count is null then null
                             else greatest(0, stock_count - q) end,
          available   = case when stock_count is null then available
                             when stock_count - q <= 0 then false
                             else available end
      where id = did;
  end loop;
  return new;
end;
$$;

comment on function public.apply_order_to_dishes() is
  'Holds plates for a new ticket. Sales are counted by settle_order_to_dishes when the money arrives.';

-- ---------------------------------------------------------------------------
-- Money arriving, and orders going away
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
  v_now_paid      boolean := new.paid_at is not null;
  v_was_paid      boolean := old.paid_at is not null;
  v_now_cancelled boolean := new.status = 'cancelled';
  v_was_cancelled boolean := old.status = 'cancelled';
begin
  -- The money landed: the sale is real now.
  if v_now_paid and not v_was_paid and not v_now_cancelled then
    for item in select * from jsonb_array_elements(coalesce(new.items, '[]'::jsonb))
    loop
      did := item ->> 'id';
      q   := coalesce((item ->> 'qty')::int, 0);
      if did is null or q <= 0 then continue; end if;
      update public.dishes set sold_today = sold_today + q where id = did;
    end loop;
  end if;

  -- Cancelled: the plate goes back on the shelf, and anything already counted
  -- as sold comes back out. Guarded on the previous status so this can only
  -- happen on the transition, never on every later write to the row.
  if v_now_cancelled and not v_was_cancelled then
    for item in select * from jsonb_array_elements(coalesce(new.items, '[]'::jsonb))
    loop
      did := item ->> 'id';
      q   := coalesce((item ->> 'qty')::int, 0);
      if did is null or q <= 0 then continue; end if;

      update public.dishes
        set stock_count = case when stock_count is null then null
                               else stock_count + q end,
            -- It only sold out because the order took the last plate, so
            -- returning the plate returns it to the menu. A dish the owner
            -- switched off by hand still has stock and is left alone.
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

drop trigger if exists orders_settle_to_dishes on public.orders;
create trigger orders_settle_to_dishes
  after update on public.orders
  for each row execute function public.settle_order_to_dishes();

-- ---------------------------------------------------------------------------
-- The same rule, applied to the figures the owner reads
-- ---------------------------------------------------------------------------
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
       and o.status <> 'cancelled'
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
drop trigger if exists orders_settle_to_dishes on public.orders;
drop function if exists public.settle_order_to_dishes();

create or replace function public.apply_order_to_dishes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  did  text;
  q    int;
begin
  for item in select * from jsonb_array_elements(coalesce(new.items, '[]'::jsonb))
  loop
    did := item ->> 'id';
    q   := coalesce((item ->> 'qty')::int, 0);
    if did is null or q <= 0 then
      continue;
    end if;

    update public.dishes
      set sold_today  = sold_today + q,
          stock_count = case when stock_count is null then null
                             else greatest(0, stock_count - q) end,
          available   = case when stock_count is null then available
                             when stock_count - q <= 0 then false
                             else available end
      where id = did;
  end loop;
  return new;
end;
$$;
SQL);
    }
};
