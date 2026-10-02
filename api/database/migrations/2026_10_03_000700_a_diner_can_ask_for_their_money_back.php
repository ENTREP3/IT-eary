<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Let a diner ask for a refund, with a reason and a photograph.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
            create table if not exists public.refund_requests (
              id            uuid primary key default gen_random_uuid(),
              order_id      uuid not null references public.orders (id) on delete cascade,
              -- Null for a guest, who is identified by their device instead.
              customer_id   uuid references auth.users (id) on delete set null,
              device_token  uuid,
              reasons       text[] not null,
              note          text,
              proof_path    text not null,
              status        text not null default 'open',
              decided_by    uuid references auth.users (id),
              decided_at    timestamptz,
              decision_note text,
              created_at    timestamptz not null default now(),

              constraint refund_requests_status_check
                check (status in ('open', 'approved', 'declined'))
            );

            create index if not exists refund_requests_open
              on public.refund_requests (created_at desc) where status = 'open';

            -- One open request per order. A second is the same complaint twice,
            -- and a queue with duplicates is one the counter stops trusting.
            create unique index if not exists refund_requests_one_open
              on public.refund_requests (order_id) where status = 'open';

            alter table public.refund_requests enable row level security;

            drop policy if exists refund_requests_read on public.refund_requests;
            create policy refund_requests_read
              on public.refund_requests for select
              using (
                public.is_staff()
                or (customer_id is not null and customer_id = auth.uid())
              );
        SQL);

        DB::unprepared(<<<'SQL'
            do $$
            begin
              alter publication supabase_realtime add table public.refund_requests;
            exception when duplicate_object then
              null;
            end $$;
        SQL);

        DB::unprepared(<<<'SQL'
            create or replace function public.request_refund(
              p_ticket_code  text,
              p_reasons      text[],
              p_proof_path   text,
              p_note         text default null,
              p_device_token uuid default null
            )
            returns public.refund_requests
            language plpgsql
            security definer
            set search_path = public
            as $$
            declare
              v_order public.orders;
              v_row   public.refund_requests;
            begin
              select * into v_order from public.orders
               where ticket_code = upper(btrim(p_ticket_code)) for update;

              if v_order.id is null then
                raise exception 'no ticket %', p_ticket_code;
              end if;

              if not (
                (p_device_token is not null and v_order.device_token = p_device_token)
                or (auth.uid() is not null and v_order.customer_id = auth.uid())
              ) then
                raise exception 'that ticket belongs to somebody else';
              end if;

              if v_order.paid_at is null then
                raise exception 'nothing has been paid for ticket % yet', p_ticket_code;
              end if;

              if v_order.status in ('refunded', 'cancelled', 'expired') then
                raise exception 'ticket % is already settled', p_ticket_code;
              end if;

              if p_reasons is null or array_length(p_reasons, 1) is null then
                raise exception 'say what was wrong with it';
              end if;

              -- Required by the column, not only by the screen. A complaint
              -- about food nobody can see is one the counter cannot judge, and
              -- a rule that lives in a form is not a rule.
              if coalesce(btrim(p_proof_path), '') = '' then
                raise exception 'a photograph is needed';
              end if;

              insert into public.refund_requests
                (order_id, customer_id, device_token, reasons, note, proof_path)
              values
                (v_order.id, v_order.customer_id, v_order.device_token,
                 p_reasons, nullif(btrim(coalesce(p_note, '')), ''), p_proof_path)
              returning * into v_row;

              return v_row;
            end;
            $$;

            grant execute on function public.request_refund(text, text[], text, text, uuid)
              to anon, authenticated;
        SQL);

        DB::unprepared(<<<'SQL'
            -- The queue, carrying enough of the order to judge it without a
            -- second lookup.
            create or replace function public.refund_requests_for_staff(p_status text default 'open')
            returns table (
              id            uuid,
              ticket_code   text,
              customer_name text,
              total         numeric,
              reasons       text[],
              note          text,
              proof_path    text,
              status        text,
              created_at    timestamptz,
              decided_at    timestamptz,
              decision_note text,
              order_status  text
            )
            language sql
            stable
            security definer
            set search_path = public
            as $$
              select r.id, o.ticket_code, o.customer_name, o.total, r.reasons, r.note,
                     r.proof_path, r.status, r.created_at, r.decided_at, r.decision_note,
                     o.status::text
                from public.refund_requests r
                join public.orders o on o.id = r.order_id
               where public.is_staff()
                 and (p_status = 'all' or r.status = p_status)
               order by r.created_at desc
               limit 200;
            $$;

            /*
             * The counter's answer.
             *
             * Approving does not move money by itself. refund_order does that,
             * and it is what records the amount, the method and the proof of
             * sending; this marks the complaint dealt with so the queue empties,
             * and keeps who decided it.
             */
            create or replace function public.decide_refund_request(
              p_id     uuid,
              p_status text,
              p_note   text default null
            )
            returns public.refund_requests
            language plpgsql
            security definer
            set search_path = public
            as $$
            declare
              v_row public.refund_requests;
            begin
              if not public.is_staff() then
                raise exception 'staff only';
              end if;

              if p_status not in ('approved', 'declined') then
                raise exception 'a request is either approved or declined';
              end if;

              update public.refund_requests
                 set status        = p_status,
                     decided_by    = auth.uid(),
                     decided_at    = now(),
                     decision_note = nullif(btrim(coalesce(p_note, '')), '')
               where id = p_id and status = 'open'
               returning * into v_row;

              if v_row.id is null then
                raise exception 'that request has already been dealt with';
              end if;

              return v_row;
            end;
            $$;

            grant execute on function public.refund_requests_for_staff(text) to authenticated;
            grant execute on function public.decide_refund_request(uuid, text, text) to authenticated;
        SQL);

        DB::unprepared(<<<'SQL'
            create or replace function public.tell_staff_refund_asked()
            returns trigger
            language plpgsql
            security definer
            set search_path = public
            as $$
            declare
              v_code text;
            begin
              select ticket_code into v_code from public.orders where id = new.order_id;

              perform public.push_notify(jsonb_build_object(
                'to', jsonb_build_object('kind', 'staff'),
                'title', 'Refund asked for ' || coalesce(v_code, ''),
                'body', array_to_string(new.reasons, ', '),
                'url', '/',
                'tag', 'refund-' || new.id
              ));
              return new;
            end;
            $$;

            drop trigger if exists refund_requests_notice on public.refund_requests;
            create trigger refund_requests_notice
              after insert on public.refund_requests
              for each row execute function public.tell_staff_refund_asked();
        SQL);
    }

    public function down(): void
    {
        DB::unprepared(<<<'SQL'
            drop trigger if exists refund_requests_notice on public.refund_requests;
            drop function if exists public.tell_staff_refund_asked();
            drop function if exists public.decide_refund_request(uuid, text, text);
            drop function if exists public.refund_requests_for_staff(text);
            drop function if exists public.request_refund(text, text[], text, text, uuid);
            drop table if exists public.refund_requests;
        SQL);
    }
};
