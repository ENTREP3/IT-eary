<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Renames orders.paid_by to orders.processed_by.
 *
 * The old name said the wrong thing. It reads as "who paid", and people
 * reasonably assumed it held the customer. It never did: it holds the STAFF
 * MEMBER who took the money, set from auth.uid() inside mark_ticket_paid(),
 * which refuses to run for anyone who is not staff.
 *
 * Who actually paid was never missing. A signed-in diner is orders.customer_id;
 * a guest has that column null and appears as customer_name, or as nobody at
 * all. So this is purely a naming fix, and no data moves.
 *
 * mark_ticket_paid() is recreated because PL/pgSQL resolves column names when it
 * runs, not when it is defined: renaming the column alone would leave a function
 * that looks fine and fails the next time a cashier settles a ticket. The body
 * below is the live definition with the column renamed and nothing else touched.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement('alter table public.orders rename column paid_by to processed_by');

        DB::unprepared('CREATE OR REPLACE FUNCTION public.mark_ticket_paid(p_ticket_code text, p_method text, p_status text DEFAULT \'verified\'::text, p_in_person boolean DEFAULT false, p_note text DEFAULT NULL::text)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO \'public\'
AS $function$
declare
  v_order public.orders;
begin
  if not public.is_staff() then
    raise exception \'only staff may record payment\';
  end if;

  if p_method not in (\'cash\', \'gcash\') then
    raise exception \'payment method must be cash or gcash\';
  end if;

  if p_status not in (\'verified\', \'needs_review\') then
    raise exception \'payment status must be verified or needs_review\';
  end if;

  select * into v_order
    from public.orders
   where ticket_code = upper(trim(p_ticket_code))
   for update;

  if v_order.id is null then
    raise exception \'no ticket %\', p_ticket_code;
  end if;
  if v_order.status = \'cancelled\' then
    raise exception \'ticket % was cancelled\', p_ticket_code;
  end if;
  if v_order.paid_at is not null then
    raise exception \'ticket % is already paid\', p_ticket_code;
  end if;

  update public.orders
     set status             = \'paid\',
         payment_method     = p_method,
         payment_status     = p_status,
         verified_in_person = coalesce(p_in_person, false),
         review_note        = nullif(trim(coalesce(p_note, \'\')), \'\'),
         paid_at            = now(),
         processed_by            = auth.uid()
   where id = v_order.id
   returning * into v_order;

  return v_order;
end;
$function$
');

        DB::statement("comment on column public.orders.processed_by is 'The staff member who settled this ticket. Who ordered is customer_id.'");
    }

    public function down(): void
    {
        DB::statement('alter table public.orders rename column processed_by to paid_by');

        DB::unprepared('CREATE OR REPLACE FUNCTION public.mark_ticket_paid(p_ticket_code text, p_method text, p_status text DEFAULT \'verified\'::text, p_in_person boolean DEFAULT false, p_note text DEFAULT NULL::text)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO \'public\'
AS $function$
declare
  v_order public.orders;
begin
  if not public.is_staff() then
    raise exception \'only staff may record payment\';
  end if;

  if p_method not in (\'cash\', \'gcash\') then
    raise exception \'payment method must be cash or gcash\';
  end if;

  if p_status not in (\'verified\', \'needs_review\') then
    raise exception \'payment status must be verified or needs_review\';
  end if;

  select * into v_order
    from public.orders
   where ticket_code = upper(trim(p_ticket_code))
   for update;

  if v_order.id is null then
    raise exception \'no ticket %\', p_ticket_code;
  end if;
  if v_order.status = \'cancelled\' then
    raise exception \'ticket % was cancelled\', p_ticket_code;
  end if;
  if v_order.paid_at is not null then
    raise exception \'ticket % is already paid\', p_ticket_code;
  end if;

  update public.orders
     set status             = \'paid\',
         payment_method     = p_method,
         payment_status     = p_status,
         verified_in_person = coalesce(p_in_person, false),
         review_note        = nullif(trim(coalesce(p_note, \'\')), \'\'),
         paid_at            = now(),
         paid_by            = auth.uid()
   where id = v_order.id
   returning * into v_order;

  return v_order;
end;
$function$
');
    }
};
