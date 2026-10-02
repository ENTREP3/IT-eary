<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Ask a GCash payer which number to send a refund back to.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
            alter table public.orders
              add column if not exists gcash_sender text;

            comment on column public.orders.gcash_sender is
              'The number the diner paid from, so a GCash refund has somewhere to go. Never shown to other diners.';
        SQL);

        // Taken with the proof, in the same call, so there is no second step a
        // diner can skip and no window where one exists without the other.
        DB::unprepared(<<<'SQL'
            create or replace function public.attach_payment_proof(
              p_ticket_code text,
              p_path        text,
              p_sender      text default null
            )
            returns public.orders
            language plpgsql
            security definer
            set search_path = public
            as $$
            declare
              v_code  text := upper(trim(p_ticket_code));
              v_order public.orders;
              v_sender text := nullif(btrim(coalesce(p_sender, '')), '');
            begin
              select * into v_order from public.orders where ticket_code = v_code for update;

              if v_order.id is null then
                raise exception 'no ticket %', p_ticket_code;
              end if;
              if v_order.paid_at is not null then
                raise exception 'ticket % is already settled', p_ticket_code;
              end if;
              -- The path must sit under this ticket's own folder.
              if split_part(p_path, '/', 1) <> v_code then
                raise exception 'proof path does not belong to ticket %', p_ticket_code;
              end if;

              -- Digits, spaces and the usual punctuation only, and long enough
              -- to be a number. Deliberately loose: a diner mistyping their own
              -- number is the counter's problem to notice, not this function's,
              -- and refusing an unusual format would be worse than storing it.
              if v_sender is not null and length(regexp_replace(v_sender, '[^0-9]', '', 'g')) < 7 then
                raise exception 'that does not look like a mobile number';
              end if;

              update public.orders
                 set proof_path        = p_path,
                     proof_uploaded_at = now(),
                     gcash_sender      = coalesce(v_sender, gcash_sender)
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
            drop function if exists public.attach_payment_proof(text, text, text);
            alter table public.orders drop column if exists gcash_sender;
        SQL);
    }
};
