<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Let a diner upload the photograph a refund request needs.
 *
 * The existing diner-upload policy is for GCash receipts and only accepts
 * objects against a ticket that has *not* been paid for. A complaint is the
 * opposite case by definition — the money has gone — so every upload would have
 * been refused, and the request function would then refuse the request for want
 * of a photograph.
 *
 * Kept in the same bucket under its own prefix, so one set of staff-read rules
 * covers both and there is no second bucket to remember to lock down.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
            drop policy if exists complaint_photos_diner_insert on storage.objects;
            create policy complaint_photos_diner_insert
              on storage.objects for insert
              with check (
                bucket_id = 'payment-proofs'
                and split_part(name, '/', 1) = 'complaints'
                and exists (
                  select 1 from public.orders o
                   where o.ticket_code = split_part(name, '/', 2)
                     and o.paid_at is not null
                     and o.status not in ('refunded', 'cancelled', 'expired')
                )
              );
        SQL);
    }

    public function down(): void
    {
        DB::unprepared('drop policy if exists complaint_photos_diner_insert on storage.objects');
    }
};
