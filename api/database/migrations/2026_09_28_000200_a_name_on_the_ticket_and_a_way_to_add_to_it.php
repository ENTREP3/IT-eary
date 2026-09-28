<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Two things the counter could not do.
 *
 * A name on the ticket. Every order placed from an account showed "Walk-in",
 * because `customer_name` only ever held what the diner typed into the box, and
 * somebody signed in has no reason to type their own name. Ten of ten account
 * orders had none. The account knows who they are; the ticket simply never
 * asked. It is filled in now at the moment the order is made, from the profile
 * name where there is one and from the email otherwise, so the receipt, the
 * counter and the history all say the same thing without another lookup.
 *
 * And adding to an order. A diner who gets to the counter and wants one more
 * ulam had to be refused, or served off the books: the cashier could look a
 * ticket up and settle it, and nothing else. `add_order_items` lets them add to
 * a ticket that has not been paid for yet, which is the only point where it is
 * still a change to an order rather than a change to money already taken.
 *
 * The stock is held here by hand. `apply_order_to_dishes` runs on insert, so an
 * order that grows later would otherwise take servings off the shelf that
 * nothing ever reserved, and the menu would go on offering food that is spoken
 * for.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
-- ---------------------------------------------------------------------------
-- Who ordered it
-- ---------------------------------------------------------------------------
create or replace function public.stamp_customer_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  -- What the diner typed always wins. They may be ordering for somebody else,
  -- and the name on the ticket is the name to call out at the counter.
  if coalesce(trim(new.customer_name), '') <> '' or new.customer_id is null then
    return new;
  end if;

  select nullif(trim(p.full_name), '') into v_name
    from public.profiles p where p.id = new.customer_id;

  if v_name is null then
    -- The part of the address before the @. Not pretty, but it is how somebody
    -- signed in already identifies themselves here, and it beats "Walk-in" for
    -- an order the shop knows the owner of.
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

-- The orders already placed, so the history is not half anonymous.
update public.orders o
   set customer_name = coalesce(
         nullif(trim(p.full_name), ''),
         nullif(split_part(u.email, '@', 1), '')
       )
  from auth.users u
  left join public.profiles p on p.id = u.id
 where o.customer_id = u.id
   and coalesce(trim(o.customer_name), '') = '';

-- ---------------------------------------------------------------------------
-- Adding to an order at the counter
-- ---------------------------------------------------------------------------
create or replace function public.add_order_items(
  p_ticket_code text,
  p_items       jsonb
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order    public.orders;
  v_row      record;
  v_items    jsonb;
  v_subtotal numeric(10,2) := 0;
  v_added    int := 0;
begin
  if not public.is_staff() then
    raise exception 'staff only';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'nothing to add';
  end if;

  select * into v_order from public.orders
   where ticket_code = upper(trim(p_ticket_code)) for update;

  if v_order.id is null then
    raise exception 'no ticket %', p_ticket_code;
  end if;

  -- Past payment this is no longer an order being built. Taking more money for
  -- a ticket already settled is a second sale, and giving food away against one
  -- is a hole in the till.
  if v_order.paid_at is not null then
    raise exception
      'ticket % has already been paid for — ring the extra items up separately',
      p_ticket_code;
  end if;

  if v_order.status <> 'pending' then
    raise exception 'ticket % is %, so nothing can be added to it',
      p_ticket_code, v_order.status;
  end if;

  v_items := coalesce(v_order.items, '[]'::jsonb);

  for v_row in
    select d.id, d.name, d.price, d.stock_count,
           sum(greatest(1, coalesce((item ->> 'qty')::int, 1)))::int as qty
      from jsonb_array_elements(p_items) as item
      join public.dishes d on d.id = item ->> 'id'
     where d.available
     group by d.id, d.name, d.price, d.stock_count
  loop
    -- Never promise more than is in the platter.
    if v_row.stock_count is not null and v_row.stock_count < v_row.qty then
      raise exception 'only % of % left', v_row.stock_count, v_row.name;
    end if;

    -- Merged rather than appended, so a second helping of the same dish reads
    -- as "2 x Adobo" on the receipt instead of the same line printed twice.
    if exists (select 1 from jsonb_array_elements(v_items) as e
                where e ->> 'id' = v_row.id) then
      select jsonb_agg(
               case when e ->> 'id' = v_row.id
                    then jsonb_set(e, '{qty}',
                           to_jsonb(((e ->> 'qty')::int + v_row.qty)))
                    else e end)
        into v_items
        from jsonb_array_elements(v_items) as e;
    else
      v_items := v_items || jsonb_build_object(
        'id', v_row.id, 'name', v_row.name, 'qty', v_row.qty, 'price', v_row.price
      );
    end if;

    -- Held by hand: the insert trigger cannot know about an order that grew.
    update public.dishes
       set stock_count = case when stock_count is null then null
                              else greatest(0, stock_count - v_row.qty) end,
           available   = case when stock_count is null then available
                              when stock_count - v_row.qty <= 0 then false
                              else available end
     where id = v_row.id;

    v_added := v_added + 1;
  end loop;

  if v_added = 0 then
    raise exception 'none of those are on the menu right now';
  end if;

  select coalesce(sum((e ->> 'qty')::int * (e ->> 'price')::numeric), 0)
    into v_subtotal
    from jsonb_array_elements(v_items) as e;

  -- The discount stands at what it was worth when it was applied. Recomputing a
  -- percentage against a bigger bill would quietly hand out more than the promo
  -- was checked for, and the extra items are paid at menu price.
  update public.orders
     set items    = v_items,
         subtotal = v_subtotal,
         total    = greatest(0, v_subtotal - coalesce(discount, 0))
   where id = v_order.id
   returning * into v_order;

  return v_order;
end;
$$;

revoke all on function public.add_order_items(text, jsonb) from public;
grant execute on function public.add_order_items(text, jsonb) to authenticated;
SQL);
    }

    public function down(): void
    {
        DB::unprepared(<<<'SQL'
drop function if exists public.add_order_items(text, jsonb);
drop trigger if exists orders_stamp_customer_name on public.orders;
drop function if exists public.stamp_customer_name();
SQL);
    }
};
