<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Let a cashier cancel an order that was never paid for.
 *
 * `advance_order_status` refused cancellation to anybody who was not the owner.
 * The intent was sound — cancelling is the one status change that cannot be
 * walked back — but it was written before the rule below it, which already
 * refuses to cancel anything that has been paid for and sends it to the refund
 * flow instead. Between the two, the owner-only check was not protecting money.
 * All it could still block was the unpaid case, and the unpaid case is the
 * counter's own work: somebody orders, wanders off, and the food they are
 * holding needs to go back on the menu for the queue behind them.
 *
 * It failed in the worst way, too. The cashier screen offers the button, asks
 * "Cancel ticket HBBXEE?", takes the confirmation — and then the database says
 * no, twelve minutes into a ticket nobody is coming back for.
 *
 * ---------------------------------------------------------------------------
 * What still cannot happen
 *
 * A paid ticket is untouched by this: the check below still turns it away and
 * names refunding as the thing to do instead, so money leaving the shop stays
 * the owner's decision and keeps its proof-of-refund trail. `is_staff()` still
 * guards the whole function, so a diner cannot reach it — they cancel their own
 * unpaid tickets through `cancel_my_order`, which checks the ticket is theirs.
 */
return new class extends Migration
{
    public function up(): void
    {
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

              -- The only guard cancelling needs. Nothing paid for is cancelled
              -- here by anyone, owner included: that is a refund, and a refund
              -- has proof attached to it.
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
        SQL);
    }

    public function down(): void
    {
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

              if v_order.status = 'expired' then
                raise exception
                  'ticket % expired unclaimed and its food went back on the menu', p_ticket_code;
              end if;

              if p_status in ('preparing', 'ready', 'completed') and v_order.paid_at is null then
                raise exception 'ticket % has not been settled yet', p_ticket_code;
              end if;

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
        SQL);
    }
};
