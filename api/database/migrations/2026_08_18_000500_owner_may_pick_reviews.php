<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Lets the owner mark a review as one to quote.
 *
 * reviews carried a policy to read and a policy to delete, and nothing to
 * update. Adding a `featured` column without this would have produced the worst
 * kind of failure: a blocked write returns success with zero rows changed, so
 * the switch would have flipped in the screen, saved nothing, and quietly
 * reverted on the next load with no error anywhere.
 *
 * Scoped to the owner, like every other editorial decision. A cashier cannot
 * choose what the shop quotes about itself, and nobody can edit the words a
 * diner wrote: only whether they are shown.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement("
            create policy \"reviews_admin_feature\"
              on public.reviews for update
              using (public.is_admin())
              with check (public.is_admin())
        ");

        DB::statement('grant update on public.reviews to authenticated');
    }

    public function down(): void
    {
        DB::statement('drop policy if exists "reviews_admin_feature" on public.reviews');
    }
};
