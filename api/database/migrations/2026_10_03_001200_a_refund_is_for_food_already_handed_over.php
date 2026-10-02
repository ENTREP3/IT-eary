<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Let a finished order be refunded.
 *
 * `refund_order` accepted only `paid` and `preparing` and refused everything
 * else, which is backwards now that cancelling covers the kitchen's half.
 * Once the food is ready or handed over there is nothing left to cancel — a
 * refund is the only answer — and that was exactly where this stopped, so the
 * counter pressed the button and got "the refund could not be recorded".
 *
 * The complaint flow made it plainer: a diner may only ask once the food has
 * been given to them, and the shop then could not act on what they asked for.
 */
return new class extends Migration
{
    public function up(): void
    {
        $def = DB::selectOne(
            "select pg_get_functiondef(p.oid) as d
               from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'refund_order'",
        );

        if (! $def) {
            return;
        }

        // Only the one condition changes. Rewriting the whole body here would
        // restate stock returns and ledger lines that have nothing to do with
        // this, and every one of those copies could drift.
        $next = str_replace(
            "if v_order.status not in ('paid', 'preparing') then",
            "if v_order.status not in ('paid', 'preparing', 'ready', 'completed') then",
            $def->d,
        );

        if ($next !== $def->d) {
            DB::unprepared($next);
        }
    }

    public function down(): void
    {
        // Going back would stop the shop refunding food it has already served.
    }
};
