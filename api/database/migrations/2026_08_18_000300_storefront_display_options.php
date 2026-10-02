<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * What the storefront shows, decided by the owner rather than by the code.
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
