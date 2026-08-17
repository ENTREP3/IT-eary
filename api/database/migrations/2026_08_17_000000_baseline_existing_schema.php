<?php

use Illuminate\Database\Migrations\Migration;

/**
 * The line Laravel's migration history starts from.
 *
 * The schema already exists. Thirteen tables, thirty-three functions and
 * thirty-seven access policies were built and applied through the SQL files kept
 * in supabase/migrations/, and they are serving a real karinderya right now.
 *
 * This migration deliberately does NOTHING. Running it only records that
 * everything up to this point is already in place, so Laravel takes over from
 * here instead of trying to create tables that exist.
 *
 * WHY A BASELINE RATHER THAN A REWRITE
 *
 * Transcribing sixteen SQL files into PHP would produce a schema identical to
 * the one already running, while introducing the chance of a typo in an access
 * policy. A policy that is subtly wrong does not fail loudly; it quietly lets
 * the wrong person read the wrong rows. There is no upside worth that.
 *
 * supabase/migrations/ stays in the repository as the record of how the schema
 * came to be. It is history, not something to run again.
 *
 * FROM HERE ON
 *
 *   php artisan make:migration add_something
 *   php artisan migrate
 *
 * That works because Laravel connects with the database password, which is what
 * the Supabase CLI on this machine never had. Schema changes stop being SQL
 * pasted into a dashboard by hand.
 *
 * WHAT LARAVEL DOES AND DOES NOT ENFORCE
 *
 * Access policies and the SECURITY DEFINER functions are PostgreSQL features.
 * Laravel can define them, in raw SQL inside a migration, and apply them. It
 * does not enforce them: Postgres does, for every client at once, which is
 * exactly why a tampered phone still cannot underpay. Saying Eloquent enforces
 * those rules would be untrue.
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
