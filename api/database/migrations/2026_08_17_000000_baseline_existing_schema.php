<?php

use Illuminate\Database\Migrations\Migration;

/**
 * The line Laravel's migration history starts from.
 */
return new class extends Migration
{
    public function up(): void
    {
        // Intentionally empty. See the note above.
    }

    public function down(): void
    {
        // Nothing to undo. Rolling this back must never drop a live schema that
        // this migration did not create.
    }
};
