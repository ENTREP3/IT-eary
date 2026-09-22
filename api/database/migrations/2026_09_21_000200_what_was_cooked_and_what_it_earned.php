<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * The questions a kitchen actually asks, which the shop could not answer.
 *
 * Everything here reads data the system already held and never showed, except
 * for one genuine hole: nothing recorded that cooking had happened. `cook_batch`
 * took the ingredients off the shelf and put servings on the menu, then forgot
 * the event entirely. So the single most valuable number to a karinderya — what
 * was cooked against what sold, which is to say what went in the bin — could not
 * be worked out at all. A production log fixes that, and everything else
 * follows from figures that were already sitting there.
 *
 * The analytics are functions rather than views because every one of them is
 * owner-only. A view would lean on the caller's own permissions; these check
 * `is_admin()` themselves and refuse anybody else, the same as `cogs_by_day`.
 *
 * Money is counted the same way everywhere: a sale is a payment that was
 * confirmed, on an order that still exists. Cancelled, refunded and expired
 * orders stay out of every figure below, as they do on every screen.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
-- ---------------------------------------------------------------------------
-- What the kitchen cooked
-- ---------------------------------------------------------------------------
create table if not exists public.cook_log (
  id         uuid primary key default gen_random_uuid(),
  dish_id    text not null references public.dishes(id) on delete cascade,
  batches    integer not null check (batches > 0),
  -- Stored rather than recomputed from batch_yield, because the yield can be
  -- corrected later and that must not rewrite what happened on Tuesday.
  servings   integer not null check (servings >= 0),
  -- What one serving cost to make at the moment it was made. Ingredient prices
  -- move, and last month's waste should be valued at last month's prices.
  unit_cost  numeric(10,2),
  cooked_at  timestamptz not null default now(),
  cooked_by  uuid references auth.users(id)
);

comment on table public.cook_log is
  'One row per cooking. Without it, cooked-versus-sold — the waste figure — cannot be worked out.';

create index if not exists cook_log_dish_day_idx on public.cook_log (dish_id, cooked_at desc);

alter table public.cook_log enable row level security;

drop policy if exists "cook_log_staff_read" on public.cook_log;
create policy "cook_log_staff_read"
  on public.cook_log for select using (public.is_staff());

-- Written only by cook_batch, so a row can never claim food that was never
-- made and no ingredients were taken for.

-- ---------------------------------------------------------------------------
-- Cooking, now recorded
-- ---------------------------------------------------------------------------
create or replace function public.cook_batch(p_dish_id text, p_batches int)
returns public.dishes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dish   public.dishes;
  v_result public.dishes;
  v_short  text;
  v_made   int;
begin
  if not public.is_admin() then
    raise exception 'owners only';
  end if;

  if p_batches is null or p_batches <= 0 then
    raise exception 'cook at least one batch';
  end if;

  select * into v_dish from public.dishes where id = p_dish_id;
  if v_dish.id is null then
    raise exception 'no dish %', p_dish_id;
  end if;
  if coalesce(v_dish.batch_yield, 0) <= 0 then
    raise exception 'set how many servings a batch of % makes first', v_dish.name;
  end if;

  select i.name
    into v_short
    from public.recipe_items r
    join public.inventory i on i.id = r.inventory_id
   where r.dish_id = p_dish_id
     and i.stock < r.quantity * p_batches
   limit 1;

  if v_short is not null then
    raise exception 'not enough %', v_short;
  end if;

  update public.inventory i
     set stock = i.stock - (r.quantity * p_batches)
    from public.recipe_items r
   where r.inventory_id = i.id
     and r.dish_id = p_dish_id;

  v_made := (v_dish.batch_yield * p_batches)::int;

  update public.dishes
     set stock_count = coalesce(stock_count, 0) + v_made,
         available   = true
   where id = p_dish_id
   returning * into v_result;

  -- The event itself, which is what makes waste measurable.
  insert into public.cook_log (dish_id, batches, servings, unit_cost, cooked_by)
  values (p_dish_id, p_batches, v_made, public.dish_cost(p_dish_id), auth.uid());

  return v_result;
end;
$$;

revoke all on function public.cook_batch(text, int) from public;
grant execute on function public.cook_batch(text, int) to authenticated;

-- ---------------------------------------------------------------------------
-- When today's stock ran out
-- ---------------------------------------------------------------------------
alter table public.dishes
  add column if not exists sold_out_at timestamptz;

comment on column public.dishes.sold_out_at is
  'When the last serving went. A dish gone by eleven was under-cooked, and every sale after that hour was lost.';

create or replace function public.stamp_sold_out()
returns trigger
language plpgsql
as $$
begin
  if new.stock_count is null then
    new.sold_out_at := null;
  elsif new.stock_count = 0 and coalesce(old.stock_count, 0) > 0 then
    new.sold_out_at := now();
  elsif new.stock_count > 0 then
    -- Cooking more, or a held plate coming back, means it is on the menu again.
    new.sold_out_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists dishes_stamp_sold_out on public.dishes;
create trigger dishes_stamp_sold_out
  before update on public.dishes
  for each row execute function public.stamp_sold_out();

-- ---------------------------------------------------------------------------
-- Cooked against sold, which is to say what went in the bin
-- ---------------------------------------------------------------------------
create or replace function public.waste_by_day(p_days int default 7)
returns table (
  day          date,
  dish_id      text,
  dish         text,
  cooked       int,
  sold         int,
  left_over    int,
  wasted_value numeric
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
  with made as (
    select c.cooked_at::date as day, c.dish_id,
           sum(c.servings)::int as cooked,
           -- Valued at what it cost on the day, not at today's prices.
           avg(c.unit_cost) as unit_cost
      from public.cook_log c
     where c.cooked_at >= current_date - (p_days - 1)
     group by 1, 2
  ),
  moved as (
    select o.created_at::date as day,
           item ->> 'id' as dish_id,
           sum((item ->> 'qty')::int)::int as sold
      from public.orders o
      cross join lateral jsonb_array_elements(o.items) as item
     where o.paid_at is not null
       and o.status not in ('cancelled', 'refunded', 'expired')
       and o.created_at >= current_date - (p_days - 1)
     group by 1, 2
  )
  select m.day,
         m.dish_id,
         d.name,
         m.cooked,
         coalesce(s.sold, 0),
         greatest(0, m.cooked - coalesce(s.sold, 0)),
         round(greatest(0, m.cooked - coalesce(s.sold, 0)) * coalesce(m.unit_cost, 0), 2)
    from made m
    join public.dishes d on d.id = m.dish_id
    left join moved s on s.day = m.day and s.dish_id = m.dish_id
   order by m.day desc, 7 desc;
end;
$$;

grant execute on function public.waste_by_day(int) to authenticated;

-- ---------------------------------------------------------------------------
-- What each dish earns, which is rarely the dish anybody would guess
-- ---------------------------------------------------------------------------
create or replace function public.dish_margins()
returns table (
  dish_id     text,
  dish        text,
  category    text,
  price       numeric,
  unit_cost   numeric,
  margin      numeric,
  margin_pct  numeric,
  sold_30d    int,
  revenue_30d numeric,
  profit_30d  numeric
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
  with moved as (
    select item ->> 'id' as dish_id,
           sum((item ->> 'qty')::int)::int as qty,
           sum((item ->> 'qty')::int * (item ->> 'price')::numeric) as revenue
      from public.orders o
      cross join lateral jsonb_array_elements(o.items) as item
     where o.paid_at is not null
       and o.status not in ('cancelled', 'refunded', 'expired')
       and o.created_at >= current_date - 29
     group by 1
  )
  select d.id,
         d.name,
         d.category,
         d.price,
         public.dish_cost(d.id),
         case when public.dish_cost(d.id) is null then null
              else round(d.price - public.dish_cost(d.id), 2) end,
         case when public.dish_cost(d.id) is null or d.price = 0 then null
              else round((d.price - public.dish_cost(d.id)) / d.price * 100, 1) end,
         coalesce(m.qty, 0),
         round(coalesce(m.revenue, 0), 2),
         case when public.dish_cost(d.id) is null then null
              else round(coalesce(m.revenue, 0) - coalesce(m.qty, 0) * public.dish_cost(d.id), 2) end
    from public.dishes d
    left join moved m on m.dish_id = d.id
   order by 10 desc nulls last;
end;
$$;

grant execute on function public.dish_margins() to authenticated;

-- ---------------------------------------------------------------------------
-- What the shopping is doing to the margins
-- ---------------------------------------------------------------------------
create or replace function public.ingredient_price_drift(p_days int default 90)
returns table (
  inventory_id text,
  ingredient   text,
  unit         text,
  first_cost   numeric,
  latest_cost  numeric,
  change_pct   numeric,
  dishes_using int
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
  with hist as (
    select h.inventory_id,
           (array_agg(h.cost_per_unit order by h.recorded_at))[1]   as first_cost,
           (array_agg(h.cost_per_unit order by h.recorded_at desc))[1] as latest_cost,
           count(*) as n
      from public.inventory_cost_history h
     where h.recorded_at >= current_date - (p_days - 1)
       and h.cost_per_unit > 0
     group by h.inventory_id
  )
  select i.id,
         i.name,
         i.unit,
         round(h.first_cost, 2),
         round(h.latest_cost, 2),
         round((h.latest_cost - h.first_cost) / nullif(h.first_cost, 0) * 100, 1),
         (select count(distinct r.dish_id)::int
            from public.recipe_items r where r.inventory_id = i.id)
    from hist h
    join public.inventory i on i.id = h.inventory_id
   -- Only where it actually moved; a price that held steady is not news.
   where h.n > 1 and h.latest_cost <> h.first_cost
   order by abs((h.latest_cost - h.first_cost) / nullif(h.first_cost, 0)) desc nulls last;
end;
$$;

grant execute on function public.ingredient_price_drift(int) to authenticated;

-- ---------------------------------------------------------------------------
-- Who comes back, and what they are worth
-- ---------------------------------------------------------------------------
create or replace function public.customer_value()
returns table (
  buyers          int,
  repeat_buyers   int,
  repeat_pct      numeric,
  avg_order       numeric,
  avg_lifetime    numeric,
  guest_orders    int,
  account_orders  int
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
  with sales as (
    select o.customer_id, o.total
      from public.orders o
     where o.paid_at is not null
       and o.status not in ('cancelled', 'refunded', 'expired')
  ),
  per_person as (
    select customer_id, count(*) as orders, sum(total) as spent
      from sales where customer_id is not null
     group by customer_id
  )
  select (select count(*)::int from per_person),
         (select count(*)::int from per_person where orders > 1),
         (select round(count(*) filter (where orders > 1)::numeric
                       / nullif(count(*), 0) * 100, 1) from per_person),
         (select round(avg(total), 2) from sales),
         (select round(avg(spent), 2) from per_person),
         -- Named plainly, because a guest is invisible to every figure above:
         -- ordering without an account is a first-class path in this shop.
         (select count(*)::int from sales where customer_id is null),
         (select count(*)::int from sales where customer_id is not null);
end;
$$;

grant execute on function public.customer_value() to authenticated;

-- ---------------------------------------------------------------------------
-- Why money went back, and where paying goes wrong
-- ---------------------------------------------------------------------------
create or replace function public.refund_reasons(p_days int default 30)
returns table (reason text, times int, amount numeric)
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
  select f.reason, count(*)::int, round(sum(f.amount), 2)
    from public.refunds f
   where f.issued_at >= current_date - (p_days - 1)
   group by f.reason
   order by 2 desc;
end;
$$;

grant execute on function public.refund_reasons(int) to authenticated;

create or replace function public.order_outcomes(p_days int default 30)
returns table (
  placed        int,
  paid          int,
  completed     int,
  cancelled     int,
  expired       int,
  refunded      int,
  needs_review  int,
  collected_pct numeric
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
  with o as (
    select * from public.orders
     where created_at >= current_date - (p_days - 1)
  )
  select count(*)::int,
         count(*) filter (where paid_at is not null)::int,
         count(*) filter (where status = 'completed')::int,
         count(*) filter (where status = 'cancelled')::int,
         count(*) filter (where status = 'expired')::int,
         count(*) filter (where status = 'refunded')::int,
         count(*) filter (where payment_status = 'needs_review')::int,
         -- Of everything ordered, how much was actually carried away.
         round(count(*) filter (where status = 'completed')::numeric
               / nullif(count(*), 0) * 100, 1)
    from o;
end;
$$;

grant execute on function public.order_outcomes(int) to authenticated;
SQL);
    }

    public function down(): void
    {
        DB::unprepared(<<<'SQL'
drop function if exists public.waste_by_day(int);
drop function if exists public.dish_margins();
drop function if exists public.ingredient_price_drift(int);
drop function if exists public.customer_value();
drop function if exists public.refund_reasons(int);
drop function if exists public.order_outcomes(int);
drop trigger if exists dishes_stamp_sold_out on public.dishes;
drop function if exists public.stamp_sold_out();
alter table public.dishes drop column if exists sold_out_at;
drop table if exists public.cook_log;
SQL);
    }
};
