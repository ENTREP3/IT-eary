<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Three leftovers the schema dump exposed.
 *
 * 1. payment_settings.gcash_name still said "K-MARY Karinderya", the name this
 *    shop had before the rebrand, and not only as a column default: the live row
 *    said it too. The diner's GCash screen reads that column directly, so anyone
 *    paying that way was told to send money to a business that no longer exists.
 *    Wrong branding is the small half of that problem; being asked to transfer
 *    money to an unfamiliar name is the half that loses the sale.
 *
 * 2. The defaults themselves carried the old identity, so a fresh install would
 *    have inherited the same wrong name and the old tagline. Both now default to
 *    empty, which shows as a blank the owner can fill rather than a confident
 *    lie.
 *
 * 3. The foreign key on orders.processed_by was still named orders_paid_by_fkey.
 *    Renaming a column does not rename its constraints, so the old name survived
 *    the rename and would have sent the next person looking for a column that no
 *    longer exists.
 *
 * NOT fixed here, because it is not mine to invent: gcash_number is still the
 * placeholder 0917 555 0123. The owner has to enter their real number on the
 * Payments screen before anyone is asked to send money to it.
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
