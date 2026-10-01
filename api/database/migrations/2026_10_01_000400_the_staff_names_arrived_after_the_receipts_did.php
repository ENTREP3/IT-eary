<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Put the staff name on receipts that were printed before there was one.
 *
 * `served_by_name` was added with a backfill, and the backfill was correct for
 * the data it ran against: it copied `profiles.full_name` wherever one was set.
 * The problem was the timing. At that moment the cashier account had no full
 * name — the requirement that staff accounts carry one arrived in the same
 * migration — so every ticket that cashier had ever handled copied nothing and
 * stayed blank. Tickets handled by the owner picked up `Bencris Owner`, which is
 * the name the account was seeded with rather than a person's name.
 *
 * Both staff accounts now have real names, so the lookup that returned nothing
 * useful an hour ago returns something useful now. This re-runs it.
 *
 * ---------------------------------------------------------------------------
 * Why overwriting `Bencris Owner` is not rewriting history
 *
 * The usual rule for a stamped name is that it is frozen: a receipt says who
 * served you that day, and if that person later changes their surname the old
 * receipt keeps the old one. That rule protects a real name that was really in
 * use. `Bencris Owner` was never a name anybody went by — it is the placeholder
 * the first account was created with, and showing it to a diner is a bug in the
 * seed leaking onto a receipt. So it is replaced, and only it, matched exactly.
 * Any other stamped value is left alone.
 *
 * ---------------------------------------------------------------------------
 * The gap this does not close by itself
 *
 * A ticket paid between the column being added and this running is caught here.
 * A ticket paid from now on is caught by the trigger. What neither catches is a
 * ticket whose staff member had no name at the moment of payment and gets one
 * afterwards — the trigger fires on the order, not on the profile. That is rare
 * enough to leave alone now that both accounts are named and new ones cannot be
 * created without a name.
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
