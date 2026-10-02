<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Lets the owner mark a review as one to quote.
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
