<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Show the refund, and its proof, to the person who was refunded.
 *
 * `refunds` is staff-read only and the screenshot is staff-read only, so the
 * one person with a reason to check that the money went back could not see any
 * of it. The shop keeps proof for its own protection and shows the customer
 * nothing, which is the wrong way round: the proof is most use to the person
 * waiting for the money.
 *
 * Only their own, and only what matters — how much, how it was sent, when, and
 * the screenshot if there is one. Who issued it stays inside the shop.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
            create or replace function public.my_refund(
              p_ticket_code  text,
              p_device_token uuid default null
            )
            returns table (
              amount     numeric,
              method     text,
              reason     text,
              issued_at  timestamptz,
              proof_path text
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

              -- Theirs, proved the same way the rest of the diner's own data is:
              -- the device that raised it, or the account it belongs to.
              if not (
                (p_device_token is not null and v_order.device_token = p_device_token)
                or (auth.uid() is not null and v_order.customer_id = auth.uid())
              ) then
                return;
              end if;

              return query
              select r.amount, r.method, r.reason, r.issued_at, r.proof_path
                from public.refunds r
               where r.order_id = v_order.id
               order by r.issued_at desc
               limit 1;
            end;
            $$;

            grant execute on function public.my_refund(text, uuid) to anon, authenticated;
        SQL);

        DB::unprepared(<<<'SQL'
            /*
             * Reading the screenshot itself.
             *
             * Narrower than the function above: storage rules cannot see a
             * device token, so this covers signed-in customers only. A guest is
             * told the refund happened and what it was worth, and is pointed at
             * the counter for the screenshot — better than widening this to
             * anybody holding a six-character code, since what sits behind it is
             * somebody's bank screenshot.
             */
            drop policy if exists refund_proofs_owner_read on storage.objects;
            create policy refund_proofs_owner_read
              on storage.objects for select
              using (
                bucket_id = 'payment-proofs'
                and split_part(name, '/', 1) = 'refunds'
                and exists (
                  select 1 from public.orders o
                   where o.ticket_code = split_part(name, '/', 2)
                     and o.customer_id is not null
                     and o.customer_id = auth.uid()
                )
              );
        SQL);
    }

    public function down(): void
    {
        DB::unprepared(<<<'SQL'
            drop policy if exists refund_proofs_owner_read on storage.objects;
            drop function if exists public.my_refund(text, uuid);
        SQL);
    }
};
