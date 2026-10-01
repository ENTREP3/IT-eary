<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Take the dead username off the receipts it was stamped onto.
 *
 * A receipt for one diner reads `kylecanlapan12`, which is the front half of
 * their email address. Nobody typed that and no code strips an `@` — it is the
 * username the old signup form invented from the email, and the name-stamping
 * trigger of the time preferred it over everything else. Usernames were removed
 * this morning and the trigger now prefers the nickname, which is why tickets
 * raised since read `Kyle`. The stamp is frozen at order time, though, so the
 * four tickets from the 28th kept what they were given.
 *
 * ---------------------------------------------------------------------------
 * Matched narrowly, on purpose
 *
 * The condition is that the stamped name is *exactly* the email's local part,
 * case-insensitively. That is the signature of the generated username and
 * nothing else — a name a diner typed themselves does not accidentally equal
 * the front of their own address.
 *
 * This matters because the column also holds names people typed at the counter,
 * and those are theirs. One ticket in this data is stamped `SUKIF9061` and
 * another `gabriel`; neither matches its email local part, so both are left
 * exactly as they are. Overwriting a name somebody chose, to replace it with one
 * we think suits them better, would be the worse bug of the two.
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
