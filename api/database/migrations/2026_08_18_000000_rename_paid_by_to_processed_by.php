<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Renames orders.paid_by to orders.processed_by.
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
