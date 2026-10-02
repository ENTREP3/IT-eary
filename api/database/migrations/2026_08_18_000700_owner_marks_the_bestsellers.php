<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * The bestseller badge becomes the owner's word rather than a calculation.
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
            'storefront' => json_encode(array_merge($current, [
                // dish id => sales at the moment the owner said no
                'bestseller_dismissed' => (object) [],
            ])),
        ]);
    }

    public function down(): void
    {
        // Nothing to undo. A stray key in the settings breaks nothing, and
        // removing it would only risk clearing something added since.
    }
};
