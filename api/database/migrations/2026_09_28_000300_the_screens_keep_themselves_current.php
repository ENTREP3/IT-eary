<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Four tables were broadcasting; the rest were silent.
 *
 * Realtime here is a WebSocket fed by Postgres logical replication, and a table
 * only reaches it if it is in the `supabase_realtime` publication. Dishes,
 * categories, inventory and orders were in it. Everything else was not, so the
 * owner could change the shop address, switch GCash off, start a promotion or
 * record a delivery, and no screen anywhere heard about it until somebody
 * reloaded the page.
 *
 * That is why the apps grew Refresh buttons: not because the live connection
 * was unreliable, but because for most of the data there was nothing on the
 * wire to listen to.
 *
 * The tables added here are the ones a person changes and another person needs
 * to see. Left out on purpose: `recipe_items`, `promo_redemptions`,
 * `inventory_cost_history`, `stock_alerts` and `profiles`, which either change
 * only as a side effect of something already broadcast, or are nobody's live
 * concern. Every row still passes RLS on the way out — realtime does not widen
 * who may read what, it only says sooner.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
do $$
declare
  t text;
begin
  foreach t in array array[
    -- The shop's own details and what the storefront shows. Correcting the
    -- address should reach every open menu, not wait for a reload.
    'business_settings',
    -- Switching GCash off has to reach checkout before somebody pays into it.
    'payment_settings',
    -- A new promotion is worth nothing if nobody is told until tomorrow.
    'promo_codes',
    -- A new review, on the showcase the owner curates.
    'reviews',
    -- So an expense added on the phone shows on the laptop.
    'expenses',
    -- These three feed the figures on the analytics screen.
    'refunds',
    'cook_log',
    'loyalty_rewards'
  ]
  loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;
SQL);
    }

    public function down(): void
    {
        DB::unprepared(<<<'SQL'
do $$
declare
  t text;
begin
  foreach t in array array[
    'business_settings', 'payment_settings', 'promo_codes', 'reviews',
    'expenses', 'refunds', 'cook_log', 'loyalty_rewards'
  ]
  loop
    if exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = t
    ) then
      execute format('alter publication supabase_realtime drop table public.%I', t);
    end if;
  end loop;
end
$$;
SQL);
    }
};
