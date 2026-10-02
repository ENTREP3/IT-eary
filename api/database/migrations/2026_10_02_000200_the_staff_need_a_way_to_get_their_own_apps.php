<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Somewhere to keep the download addresses for the counter and owner apps.
 *
 * The shop had one app and one address. There are now three, and the two staff
 * builds are released separately from the customer one — deliberately, since an
 * APK in the wrong release is offered to diners as an update to their menu.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
            alter table public.business_settings
              add column if not exists counter_app_url text not null default '',
              add column if not exists owner_app_url   text not null default '';

            comment on column public.business_settings.counter_app_url is
              'Link to the cashier APK, used by the staff download page and its QR code.';
            comment on column public.business_settings.owner_app_url is
              'Link to the owner APK, used by the staff download page and its QR code.';
        SQL);
    }

    public function down(): void
    {
        DB::unprepared(<<<'SQL'
            alter table public.business_settings
              drop column if exists counter_app_url,
              drop column if exists owner_app_url;
        SQL);
    }
};
