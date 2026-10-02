<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Lets the person who placed an order call it off.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
create or replace function public.cancel_my_order(p_ticket_code text)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
begin
  select * into v_order
    from public.orders
   where ticket_code = upper(trim(p_ticket_code));

  if not found then
    raise exception 'no ticket %', p_ticket_code;
  end if;

  -- Staff have their own route through advance_order_status(), which stamps
  -- the audit fields this one deliberately does not.
  if v_order.customer_id is not null and v_order.customer_id <> auth.uid() then
    raise exception 'that ticket belongs to somebody else';
  end if;

  if v_order.customer_id is null
     and v_order.created_at < now() - interval '24 hours' then
    raise exception 'that ticket is too old to cancel here, please ask at the counter';
  end if;

  if v_order.paid_at is not null then
    raise exception 'that order is already paid, please ask at the counter';
  end if;

  if v_order.status <> 'pending' then
    raise exception 'the kitchen has already started that order';
  end if;

  update public.orders
     set status = 'cancelled'
   where id = v_order.id
  returning * into v_order;

  return v_order;
end;
$$;

revoke all on function public.cancel_my_order(text) from public;
grant execute on function public.cancel_my_order(text) to anon, authenticated;
SQL);
    }

    public function down(): void
    {
        DB::unprepared('drop function if exists public.cancel_my_order(text);');
    }
};
