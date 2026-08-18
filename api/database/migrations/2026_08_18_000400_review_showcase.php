<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Choosing which reviews the shop shows off, and how they cycle.
 *
 * An on/off switch for ratings was not control. The owner could show all of
 * them or none of them, and a single sour review sat beside the good ones with
 * nothing to be done about it short of deleting it, which is dishonest.
 *
 * Picking is the honest middle: every review stays in the system and still
 * counts towards each dish's average, but the owner decides which ones are
 * quoted on the front page. That is what any shop does with a testimonial board.
 *
 * The showcase settings live in the storefront column beside the display
 * switches, since they are the same kind of decision.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement('alter table public.reviews add column if not exists featured boolean not null default false');

        DB::statement("
            comment on column public.reviews.featured is
              'Owner chose to quote this one on the storefront. The rating still counts towards the dish average either way.'
        ");

        // Fast enough without an index at this size, but the showcase reads this
        // on every storefront load, which is the busiest query in the system.
        DB::statement('create index if not exists reviews_featured_idx on public.reviews (featured) where featured');

        $current = json_decode(
            DB::table('business_settings')->where('id', 1)->value('storefront') ?: '{}',
            true
        );

        DB::table('business_settings')->where('id', 1)->update([
            'storefront' => json_encode(array_merge($current, [
                // 'all' quotes anything above the star threshold, 'picked' quotes
                // only what the owner marked. Starting on 'all' keeps a new shop
                // from having an empty board until somebody curates it.
                'reviews_source' => 'all',
                'reviews_min_stars' => 4,
                'reviews_per_batch' => 2,
                'reviews_seconds' => 8,
            ])),
        ]);
    }

    public function down(): void
    {
        DB::statement('drop index if exists reviews_featured_idx');
        DB::statement('alter table public.reviews drop column if exists featured');
    }
};
