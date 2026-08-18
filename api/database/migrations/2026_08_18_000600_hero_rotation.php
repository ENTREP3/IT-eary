<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * How fast the front page changes the dish behind the headline.
 *
 * Kept separate from the review timer even though both cycle. A photograph
 * behind a headline wants longer than a quote does: the eye finishes reading a
 * short review and is ready to move on, while an image that swaps too often
 * reads as a flickering advert.
 */
return new class extends Migration
{
    public function up(): void
    {
        $current = json_decode(
            DB::table('business_settings')->where('id', 1)->value('storefront') ?: '{}',
            true
        );

        DB::table('business_settings')->where('id', 1)->update([
            'storefront' => json_encode(array_merge($current, ['hero_seconds' => 7])),
        ]);
    }

    public function down(): void
    {
        // Nothing to undo. A stray key in the settings breaks nothing, and
        // removing it would only risk clearing something added since.
    }
};
