<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Lock the ticket before cancelling it.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
            create or replace function public.cancel_my_order(
              p_ticket_code text,
              p_device_token uuid default null
            )
            returns public.orders
            language plpgsql
            security definer
            set search_path = public
            as $$
            declare
              v_order public.orders;
            begin
              -- Locked, not just read. The checks below are only worth
              -- anything if the row cannot change between them and the update.
              select * into v_order
                from public.orders
               where ticket_code = upper(trim(p_ticket_code))
                 for update;

              if not found then
                raise exception 'no ticket %', p_ticket_code;
              end if;

              if not (
                (p_device_token is not null and v_order.device_token = p_device_token)
                or (auth.uid() is not null and v_order.customer_id = auth.uid())
              ) then
                raise exception 'that ticket belongs to somebody else';
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
        SQL);
    }

    public function down(): void
    {
        // The unlocked version is the bug. Nothing to go back to.
    }
};
