<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Four tables were broadcasting; the rest were silent.
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
