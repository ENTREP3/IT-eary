<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Answer the diner, and let them see where their request stands.
 *
 * A refund request went in and nothing came back. Staff were notified the
 * moment one arrived, the diner was told neither when it was agreed nor when
 * it was turned down, and their ticket showed no sign a request existed at
 * all — so the only way to find out was to go back to the counter and ask,
 * which is what the request was supposed to save.
 *
 * Being turned down matters more than being agreed with. A refund that is
 * granted announces itself: the money arrives and the ticket says refunded. A
 * refusal is silent, and silence is what makes somebody come back angry.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
            create or replace function public.tell_diner_refund_decided()
            returns trigger
            language plpgsql
            security definer
            set search_path = public
            as $$
            declare
              v_code text;
            begin
              if new.status = old.status then
                return new;
              end if;

              select ticket_code into v_code from public.orders where id = new.order_id;

              if new.status = 'approved' then
                perform public.push_notify(jsonb_build_object(
                  'to', jsonb_build_object('kind', 'ticket', 'ticket_code', v_code),
                  'title', 'Your refund was agreed',
                  'body', 'The counter is sending your money back for ' || coalesce(v_code, 'your order') || '.',
                  'url', '/account',
                  'tag', 'refund-' || new.id
                ));
              elsif new.status = 'declined' then
                perform public.push_notify(jsonb_build_object(
                  'to', jsonb_build_object('kind', 'ticket', 'ticket_code', v_code),
                  'title', 'Your refund was not agreed',
                  'body', coalesce(
                    nullif(btrim(new.decision_note), ''),
                    'Ask at the counter if you would like to talk about it.'
                  ),
                  'url', '/account',
                  'tag', 'refund-' || new.id
                ));
              end if;

              return new;
            end;
            $$;

            drop trigger if exists refund_requests_decided on public.refund_requests;
            create trigger refund_requests_decided
              after update of status on public.refund_requests
              for each row execute function public.tell_diner_refund_decided();
        SQL);

        DB::unprepared(<<<'SQL'
            -- Where a diner's own request stands, so the ticket can say so
            -- instead of looking as though nothing was ever sent.
            create or replace function public.my_refund_request(
              p_ticket_code  text,
              p_device_token uuid default null
            )
            returns table (
              status        text,
              reasons       text[],
              note          text,
              decision_note text,
              created_at    timestamptz,
              decided_at    timestamptz
            )
            language plpgsql
            stable
            security definer
            set search_path = public
            as $$
            declare
              v_order public.orders;
            begin
              select * into v_order from public.orders
               where ticket_code = upper(btrim(p_ticket_code));

              if v_order.id is null then
                return;
              end if;

              if not (
                (p_device_token is not null and v_order.device_token = p_device_token)
                or (auth.uid() is not null and v_order.customer_id = auth.uid())
              ) then
                return;
              end if;

              return query
              select r.status, r.reasons, r.note, r.decision_note,
                     r.created_at, r.decided_at
                from public.refund_requests r
               where r.order_id = v_order.id
               order by r.created_at desc
               limit 1;
            end;
            $$;

            grant execute on function public.my_refund_request(text, uuid) to anon, authenticated;
        SQL);
    }

    public function down(): void
    {
        DB::unprepared(<<<'SQL'
            drop trigger if exists refund_requests_decided on public.refund_requests;
            drop function if exists public.tell_diner_refund_decided();
            drop function if exists public.my_refund_request(text, uuid);
        SQL);
    }
};
