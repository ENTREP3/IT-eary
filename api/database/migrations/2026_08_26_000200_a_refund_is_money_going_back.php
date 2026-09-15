<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Cancelling and refunding are different words for different events.
 *
 * `cancelled` was doing three incompatible jobs. A diner dropping an unpaid
 * ticket, the owner writing off a payment that never arrived, and the owner
 * undoing an order the shop had already been paid for all ended up in the same
 * state — so the books could not answer the one question that matters after
 * money has changed hands: does the shop owe anybody anything?
 *
 * The shop's own rule settles it:
 *
 *   cancel  — the ticket was never paid for. Nothing owed.
 *   refund  — the ticket was paid for, and the money goes back.
 *
 * And a refund is only possible while the food can still go back in the
 * platter. A karinderya cooks in batches and plates to order, so a serving on a
 * ticket that is still `paid` or `preparing` has not left the platter yet:
 * refunding it returns the serving to the count and costs the shop nothing.
 * Once the ticket is `ready` the food is plated and waiting, and neither a
 * refund nor a cancellation is offered. That gate lives here rather than in the
 * app, because a rule about money that only exists in a screen is not a rule.
 *
 * The discount is already inside `total`, so a 75-peso dish bought with a
 * 15-peso code refunds 60. What the diner paid is what the diner gets back.
 *
 * A promotion is not released by a refund. The code is spent when it is used,
 * which is the shop's decision and also stops one code being recycled through
 * an order-and-refund loop.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
-- ---------------------------------------------------------------------------
-- A seventh status, because the owner should see which of the two happened
-- ---------------------------------------------------------------------------
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status = any (array[
    'pending', 'paid', 'preparing', 'ready', 'completed', 'cancelled', 'refunded'
  ]));

-- ---------------------------------------------------------------------------
-- What was handed back, to whom, by which member of staff
-- ---------------------------------------------------------------------------
create table if not exists public.refunds (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.orders(id) on delete cascade,
  -- What the diner actually paid, discount included. Stored rather than read
  -- back off the order, so the record survives any later edit to the ticket.
  amount     numeric(10,2) not null check (amount >= 0),
  -- How the money went back, which is not always how it came in: a GCash
  -- payment is sometimes returned as cash across the counter.
  method     text not null check (method in ('cash', 'gcash')),
  reason     text not null,
  note       text,
  issued_by  uuid references auth.users(id),
  issued_at  timestamptz not null default now()
);

comment on table public.refunds is
  'Money handed back to a diner. One row per refund; the order carries the status.';

create index if not exists refunds_order_idx on public.refunds (order_id);
create index if not exists refunds_issued_idx on public.refunds (issued_at desc);

alter table public.refunds enable row level security;

drop policy if exists "refunds_staff_read" on public.refunds;
create policy "refunds_staff_read"
  on public.refunds for select
  using (public.is_staff());

-- No insert policy on purpose. Refunds are written only by refund_order(),
-- which checks the status gate. A direct insert would record money going back
-- without any of that being true.

-- ---------------------------------------------------------------------------
-- Refunding a ticket
-- ---------------------------------------------------------------------------
create or replace function public.refund_order(
  p_ticket_code text,
  p_reason      text,
  p_method      text default null,
  p_note        text default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order  public.orders;
  v_method text;
begin
  -- Whoever is at the counter, because the diner is standing there waiting for
  -- food. Every refund records which account issued it.
  if not public.is_staff() then
    raise exception 'only staff may refund an order';
  end if;

  if coalesce(trim(p_reason), '') = '' then
    raise exception 'a refund needs a reason';
  end if;

  select * into v_order from public.orders
   where ticket_code = upper(trim(p_ticket_code)) for update;

  if v_order.id is null then
    raise exception 'no ticket %', p_ticket_code;
  end if;

  if v_order.status = 'refunded' then
    raise exception 'ticket % has already been refunded', p_ticket_code;
  end if;

  -- Nothing to give back. This is a cancellation, and it has its own route.
  if v_order.paid_at is null then
    raise exception 'ticket % was never paid for — cancel it instead', p_ticket_code;
  end if;

  -- The food has left the platter.
  if v_order.status not in ('paid', 'preparing') then
    raise exception
      'ticket % is % — a refund is only possible while the food is still being prepared',
      p_ticket_code, v_order.status;
  end if;

  -- However it came in, unless the cashier says otherwise.
  v_method := coalesce(nullif(trim(p_method), ''), v_order.payment_method, 'cash');
  if v_method not in ('cash', 'gcash') then
    raise exception 'unknown refund method %', v_method;
  end if;

  update public.orders
     set status = 'refunded'
   where id = v_order.id
   returning * into v_order;

  insert into public.refunds (order_id, amount, method, reason, note, issued_by)
  values (
    v_order.id,
    -- The discount is already inside total, so this is what the diner paid.
    v_order.total,
    v_method,
    trim(p_reason),
    nullif(trim(coalesce(p_note, '')), ''),
    auth.uid()
  );

  return v_order;
end;
$$;

revoke all on function public.refund_order(text, text, text, text) from public;
grant execute on function public.refund_order(text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- The serving goes back on the shelf, and the sale comes back out
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
  -- Cancelled and refunded are different events with the same consequence for
  -- the shelf and the books: the order is no longer a sale, and its servings
  -- are available again.
  v_now_gone  boolean := new.status in ('cancelled', 'refunded');
  v_was_gone  boolean := old.status in ('cancelled', 'refunded');
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
-- Cancelling stops where the food does
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

  -- Food should not start cooking before it is paid for.
  if p_status in ('preparing', 'ready', 'completed') and v_order.paid_at is null then
    raise exception 'ticket % has not been settled yet', p_ticket_code;
  end if;

  -- Cancelling is for tickets nobody has paid for. Once money has changed
  -- hands the money has to go somewhere, which is what refund_order is for —
  -- and it says so rather than silently doing the wrong one.
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

-- ---------------------------------------------------------------------------
-- A refunded serving went back in the platter, so the shop never bore its cost
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
       and o.status not in ('cancelled', 'refunded')
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
drop function if exists public.refund_order(text, text, text, text);
drop table if exists public.refunds;

update public.orders set status = 'cancelled' where status = 'refunded';

alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status = any (array[
    'pending', 'paid', 'preparing', 'ready', 'completed', 'cancelled'
  ]));
SQL);
    }
};
