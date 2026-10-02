<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * A way for the send-push function to recognise a call from the database.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
            create or replace function public.is_service_role()
            returns boolean
            language sql
            stable
            as $$
              select coalesce(
                nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
                ''
              ) = 'service_role';
            $$;

            comment on function public.is_service_role() is
              'Whether this request arrived with the service role. Reports the caller''s own claim and reveals nothing.';

            grant execute on function public.is_service_role() to anon, authenticated, service_role;
        SQL);
    }

    public function down(): void
    {
        DB::unprepared('drop function if exists public.is_service_role()');
    }
};
