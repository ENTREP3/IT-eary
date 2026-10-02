<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Take the dead username off the receipts it was stamped onto.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement(<<<'SQL'
            update public.orders o
               set customer_name = coalesce(
                     nullif(btrim(coalesce(p.nickname, '')), ''),
                     nullif(btrim(coalesce(p.first_name, '')), ''),
                     nullif(btrim(coalesce(p.full_name, '')), '')
                   )
              from public.profiles p, auth.users u
             where p.id = o.customer_id
               and u.id = o.customer_id
               and coalesce(u.is_anonymous, false) = false
               -- the signature of the generated username
               and lower(btrim(o.customer_name)) = lower(split_part(u.email, '@', 1))
               -- and only when there is a real name to put there instead
               and coalesce(
                     nullif(btrim(coalesce(p.nickname, '')), ''),
                     nullif(btrim(coalesce(p.first_name, '')), ''),
                     nullif(btrim(coalesce(p.full_name, '')), '')
                   ) is not null
        SQL);
    }

    public function down(): void
    {
        // Nothing to undo to. The previous values were generated from email
        // addresses by a feature that no longer exists.
    }
};
