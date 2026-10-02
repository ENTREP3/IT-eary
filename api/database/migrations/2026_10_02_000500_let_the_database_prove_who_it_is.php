<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * A way for the send-push function to recognise a call from the database.
 *
 * It recognised one by comparing the Authorization header against its own
 * SUPABASE_SERVICE_ROLE_KEY. That assumes both sides hold the same string, and
 * they do not: this project issues the new-style keys, while the key in Vault
 * is the legacy service_role JWT. Both are valid and both work against the API
 * — they are simply different text, so the comparison failed and every call
 * from a trigger was answered "staff only".
 *
 * Asking PostgREST settles it without either side knowing the other's secret.
 * It validates the token and puts the claims in the request, so a token with
 * the service_role claim can say so for itself whatever format it arrived in.
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
