<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Drop the two-argument `attach_payment_proof`.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared('drop function if exists public.attach_payment_proof(text, text)');
    }

    public function down(): void
    {
        // Bringing it back would restore the ambiguity.
    }
};
