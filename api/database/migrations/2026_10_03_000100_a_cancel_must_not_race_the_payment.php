<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Lock the ticket before cancelling it.
 *
 * `cancel_my_order` read the row, checked that it was unpaid and still pending,
 * and then updated it — all without holding a lock. Every other function that
 * moves an order takes `for update` first; this one was the exception, and that
 * is a narrow window with money in it.
 *
 * Ticket 7DNT6Q went through it: cancelled, `paid_at` set, payment verified,
 * GCash, and no refund recorded. Neither path allows that on its own —
 * `mark_ticket_paid` refuses a cancelled ticket and this refuses a paid one —
 * so the only way to reach it is both running at once. The diner pressed cancel
 * while the counter was recording the payment; the cancel read the row before
 * `paid_at` was written, passed its check, and then wrote over the top of a
 * ticket that had been paid for in the meantime. The shop keeps the money and
 * the diner gets nothing, with no refund row to notice it by.
 *
 * `for update` makes the two take turns. Whichever arrives second now sees what
 * the first did and refuses, which is what both were always meant to do.
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
