<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * The bestseller badge becomes the owner's word rather than a calculation.
 *
 * It used to be worked out on the diner's screen: whichever dish had the
 * highest sales in its category wore the badge, whether or not anybody at the
 * shop agreed. That is the shop making a claim about its own food that nobody
 * approved, and it could never promote a new dish however good it was, because
 * a dish with no sales can never top a list.
 *
 * The figures are not thrown away. They now produce a suggestion on the admin
 * screen — "this outsold everything else in Merienda, mark it?" — and the owner
 * accepts or declines. This key remembers the ones declined, against the sales
 * figure at the time, so the same question is not asked every morning but does
 * come back if the dish climbs well past where it was refused.
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
