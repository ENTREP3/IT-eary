<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * What the storefront shows, decided by the owner rather than by the code.
 *
 * Ratings, the bestseller mark, the "only a few left" warning, sold-out dishes
 * and the recommended row were all hardcoded on. Every one of them is a
 * judgement about how the shop presents itself, and none of them was the owner's
 * to make.
 *
 * Some of these matter more than they look. Showing sold-out dishes is honest
 * and tells a diner what to come back for; hiding them makes a thin day look
 * fuller. Showing ratings is confidence when the food is good and a liability on
 * the week the ratings are thin. A shop that has just opened may want none of it
 * until there is something worth showing.
 *
 * Stored as one jsonb column rather than six boolean columns, because these are
 * presentation choices that will grow, and adding to a jsonb object does not
 * need a migration every time somebody thinks of another one.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement("
            alter table public.business_settings
              add column if not exists storefront jsonb not null default '{}'::jsonb
        ");

        DB::statement("
            comment on column public.business_settings.storefront is
              'What the storefront shows. Missing keys mean on, so the shop looks the same until the owner changes something.'
        ");

        // The defaults are written explicitly rather than left empty, so the
        // toggles have something honest to read on first open instead of
        // guessing at what the code happens to do.
        DB::table('business_settings')->where('id', 1)->update([
            'storefront' => json_encode([
                'ratings' => true,
                'comments' => true,
                'bestseller' => true,
                'low_stock' => true,
                'sold_out' => true,
                'recommended' => true,
            ]),
        ]);
    }

    public function down(): void
    {
        DB::statement('alter table public.business_settings drop column if exists storefront');
    }
};
