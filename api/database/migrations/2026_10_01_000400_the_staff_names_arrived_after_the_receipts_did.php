<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Put the staff name on receipts that were printed before there was one.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement(<<<'SQL'
            update public.orders o
               set served_by_name = nullif(btrim(coalesce(p.full_name, '')), '')
              from public.profiles p
             where p.id = o.processed_by
               and nullif(btrim(coalesce(p.full_name, '')), '') is not null
               and (
                     -- never stamped, because there was nothing to stamp
                     coalesce(btrim(o.served_by_name), '') = ''
                     -- or stamped with the seed's placeholder
                     or btrim(o.served_by_name) = 'Bencris Owner'
                   )
        SQL);
    }

    public function down(): void
    {
        // Deliberately empty. Reversing this would mean blanking names that are
        // correct, and the column's own migration is what owns dropping it.
    }
};
