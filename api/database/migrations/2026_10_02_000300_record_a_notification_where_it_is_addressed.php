<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Move the recording of notifications to the one place that resolves an audience.
 */
return new class extends Migration
{
    public function up(): void
    {
        // The edge function reads through PostgREST, which only exposes
        // `public`. Asking it for everyone with an account means asking the
        // database, since `auth.users` is not reachable from out there.
        DB::unprepared(<<<'SQL'
            create or replace function public.account_holder_ids()
            returns setof uuid
            language sql
            stable
            security definer
            set search_path = public
            as $$
              select id from auth.users where coalesce(is_anonymous, false) = false;
            $$;

            comment on function public.account_holder_ids() is
              'Everyone with a real account, for notifications addressed to everyone. A guest has nowhere to keep one.';

            revoke all on function public.account_holder_ids() from public, anon, authenticated;
        SQL);

        foreach ([
            'tell_owner_dish_sold_out',
            'tell_owner_stock_low',
            'tell_counter_proof_arrived',
            'tell_owner_order_cancelled',
            'tell_owner_poor_rating',
            'nudge_unpaid_tickets',
            'send_daily_summary',
        ] as $fn) {
            $body = DB::selectOne(
                'select pg_get_functiondef(p.oid) as def
                   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = \'public\' and p.proname = ?',
                [$fn],
            );

            if (! $body) {
                continue;
            }

            $next = str_replace(
                'perform public.notify_people(',
                'perform public.push_notify(',
                $body->def,
            );

            if ($next !== $body->def) {
                DB::unprepared($next);
            }
        }

        DB::unprepared('drop function if exists public.notify_people(jsonb)');
    }

    public function down(): void
    {
        DB::unprepared('drop function if exists public.account_holder_ids()');
    }
};
