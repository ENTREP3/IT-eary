<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Drop the two-argument `attach_payment_proof`.
 *
 * Adding the sender number as a defaulted third argument created an overload
 * rather than replacing anything, so both signatures existed at once and a
 * two-argument call — which is what every released app makes — could no longer
 * be resolved. PostgREST would have started answering "function is not unique"
 * for a step that stands between a diner and their lunch.
 *
 * The three-argument one defaults the number to null, so the old calls keep
 * working against it unchanged.
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
