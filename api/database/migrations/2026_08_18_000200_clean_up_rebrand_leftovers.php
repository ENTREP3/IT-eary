<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Three leftovers the schema dump exposed.
 */
return new class extends Migration
{
    public function up(): void
    {
        // The live row, which is what a diner actually sees.
        DB::table('payment_settings')
            ->where('id', 1)
            ->where('gcash_name', 'K-MARY Karinderya')
            ->update(['gcash_name' => DB::raw("(select name from public.business_settings where id = 1)")]);

        // The defaults, so a fresh install starts blank rather than wrong.
        DB::statement("alter table public.payment_settings alter column gcash_name set default ''");
        DB::statement("alter table public.payment_settings alter column gcash_number set default ''");
        DB::statement("alter table public.business_settings alter column tagline set default ''");

        DB::statement('alter table public.orders rename constraint orders_paid_by_fkey to orders_processed_by_fkey');
    }

    public function down(): void
    {
        DB::statement('alter table public.orders rename constraint orders_processed_by_fkey to orders_paid_by_fkey');

        DB::statement("alter table public.payment_settings alter column gcash_name set default 'K-MARY Karinderya'::text");
        DB::statement("alter table public.payment_settings alter column gcash_number set default '0917 555 0123'::text");
        DB::statement("alter table public.business_settings alter column tagline set default 'Kain na, tayo na.'::text");
    }
};
