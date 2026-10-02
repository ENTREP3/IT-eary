<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Decide cancelling by whether the food is ready, not by whether it was paid.
 *
 * Both cancel paths refused a paid ticket and told people to ask for a refund
 * instead. That drew the line in the wrong place. What matters is whether the
 * kitchen has finished: an order that has not been cooked yet can simply stop,
 * whoever has paid, and the money goes back through the ordinary refund flow.
 * Once the food is ready or handed over there is nothing to call off — there is
 * only a complaint about what was received, and that is a refund request.
 *
 * So cancelling is allowed up to and including `preparing`, and refused from
 * `ready` onwards. A diner whose paid ticket is still in the queue can stop it
 * themselves rather than queueing at the counter to say so.
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
              -- Locked, not just read: the checks below are only worth anything
              -- if the row cannot change between them and the update.
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

              if v_order.status in ('cancelled', 'refunded', 'expired') then
                raise exception 'ticket % is already settled', p_ticket_code;
              end if;

              -- The only line that matters. Paid or not, a ticket the kitchen
              -- has not finished can still be stopped.
              if v_order.status in ('ready', 'completed') then
                raise exception
                  'the food for ticket % is already ready — ask for a refund instead', p_ticket_code;
              end if;

              update public.orders
                 set status = 'cancelled'
               where id = v_order.id
              returning * into v_order;

              return v_order;
            end;
            $$;
        SQL);

        DB::unprepared(<<<'SQL'
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

              -- Same rule as the diner's own cancel: the kitchen decides, not
              -- the till. Money already taken goes back as a refund, which is a
              -- separate act with its own record.
              if p_status = 'cancelled' and v_order.status in ('ready', 'completed') then
                raise exception
                  'ticket % is already ready — refund it rather than cancelling it', p_ticket_code;
              end if;

              update public.orders
                 set status       = p_status,
                     completed_at = case when p_status = 'completed' then now() else completed_at end
               where id = v_order.id
               returning * into v_order;

              return v_order;
            end;
            $$;
        SQL);
    }

    public function down(): void
    {
        // The earlier rule refused to cancel anything paid for, which is the
        // thing being corrected.
    }
};
