<?php

/**
 * Proves the announcements table lets in exactly who it should.
 *
 * Runs against the real hosted database but inside a transaction that is always
 * rolled back, so nothing it writes survives the run.
 *
 * Roles are simulated the way PostgREST presents them — `set local role` plus
 * the JWT claims RLS reads `auth.uid()` out of — rather than by signing in, so
 * this needs no staff passwords and cannot be defeated by having them.
 *
 * Every case that is *meant* to fail runs inside its own savepoint. Postgres
 * aborts the entire transaction on any error and refuses everything after it,
 * so without one the first expected refusal would take the rest of the run
 * down with it and report as a cascade of unrelated failures.
 *
 * Run with: docker compose exec -T api php check-announcements.php
 */

require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Illuminate\Support\Facades\DB;

/**
 * Session-mode pooling, not transaction-mode.
 *
 * The app connects on 6543, where PgBouncer hands each statement whichever
 * backend is free. That is right for an app — it is what lets a lot of short
 * queries share a few connections — but it means `set local role`, savepoints
 * and anything else scoped to a transaction do not survive to the next
 * statement. This test is built entirely out of those, and on 6543 it reported
 * every statement as fine while the transaction had already been aborted on a
 * connection we never saw again.
 *
 * Port 5432 on the same host is the session-mode pooler: one backend for the
 * whole connection, so a transaction behaves like a transaction.
 */
config(['database.connections.pgsql.port' => 5432]);
DB::purge('pgsql');

$failures = 0;
function check(bool $ok, string $what): void
{
    global $failures;
    if (! $ok) {
        $failures++;
    }
    echo ($ok ? 'PASS  ' : 'FAIL  ') . $what . PHP_EOL;
}

/** Becomes the given user under the `authenticated` role. */
function become(?string $uid): void
{
    DB::statement('set local role authenticated');
    DB::statement("set local request.jwt.claims = '" . json_encode([
        'sub' => $uid,
        'role' => 'authenticated',
    ]) . "'");
}

/** Becomes a stranger who has never signed in. */
function become_stranger(): void
{
    DB::statement('set local role anon');
    DB::statement('set local request.jwt.claims = \'{"role":"anon"}\'');
}

function become_owner_of_database(): void
{
    DB::statement('set local role postgres');
}

/**
 * Runs $fn and reports whether it was refused for the expected reason.
 *
 * The savepoint is what lets the run continue afterwards.
 */
function refused(callable $fn, string $because): bool
{
    static $n = 0;
    $sp = 'sp' . (++$n);
    DB::statement("savepoint {$sp}");
    try {
        $fn();
        DB::statement("release savepoint {$sp}");
        return false;
    } catch (Throwable $e) {
        DB::statement("rollback to savepoint {$sp}");
        return str_contains($e->getMessage(), $because);
    }
}

$soon = (new DateTimeImmutable('+1 hour'))->format(DATE_ATOM);

DB::beginTransaction();
try {
    $admin = DB::selectOne("select id from public.profiles where role = 'admin' limit 1");
    $cashier = DB::selectOne("select id from public.profiles where role = 'cashier' limit 1");

    if (! $admin) {
        echo 'No admin profile found; cannot test.' . PHP_EOL;
        DB::rollBack();
        exit(1);
    }
    echo "admin   {$admin->id}" . PHP_EOL;
    echo 'cashier ' . ($cashier->id ?? '(none)') . PHP_EOL . PHP_EOL;

    // ---- the owner may speak for the shop --------------------------------
    become($admin->id);
    $live = DB::selectOne(
        "insert into public.announcements (message, tone, ends_at)
         values ('Sarado kami ngayong hapon, may brownout.', 'warning', ?)
         returning id, created_by",
        [$soon]
    );
    become_owner_of_database();
    check($live !== null, 'the owner can post an announcement');
    check($live->created_by === $admin->id, 'the author is stamped by the database, not the client');

    // ---- a cashier may not ------------------------------------------------
    if ($cashier) {
        become($cashier->id);
        $no = refused(fn () => DB::insert(
            "insert into public.announcements (message, ends_at) values ('cashier speaking', ?)",
            [$soon]
        ), 'row-level security');
        become_owner_of_database();
        check($no, 'a cashier cannot post one');
    }

    // ---- a stranger who never signed in sees what is live ------------------
    become_stranger();
    $seen = DB::select('select id, tone from public.announcements');
    become_owner_of_database();
    check(count($seen) === 1, 'a signed-out stranger sees the live one (' . count($seen) . ' row)');
    check(($seen[0]->tone ?? null) === 'warning', 'the tone survives the round trip');

    // ---- something written for tomorrow stays invisible --------------------
    become($admin->id);
    DB::insert(
        "insert into public.announcements (message, starts_at, ends_at)
         values ('tomorrows news', now() + interval '1 day', now() + interval '2 days')"
    );
    $ownerSees = DB::select('select id from public.announcements');
    become_owner_of_database();
    check(count($ownerSees) === 2, 'the owner sees the scheduled one');

    become_stranger();
    $strangerSees = DB::select('select id from public.announcements');
    become_owner_of_database();
    check(count($strangerSees) === 1, 'an announcement written for later is invisible until then');

    // ---- a stranger cannot take the shop's notice down ---------------------
    become_stranger();
    DB::delete('delete from public.announcements');
    $survived = DB::select('select id from public.announcements');
    become_owner_of_database();
    check(count($survived) === 1, 'a stranger deleting it changes nothing');

    // ---- the table refuses what should never exist -------------------------
    become($admin->id);

    check(
        refused(fn () => DB::insert("insert into public.announcements (message) values ('forever')"), 'null value'),
        'an announcement with no end is refused'
    );

    check(
        refused(fn () => DB::insert(
            'insert into public.announcements (message, ends_at) values (?, ?)',
            [str_repeat('x', 281), $soon]
        ), 'announcements_message_length'),
        'over 280 characters is refused'
    );

    check(
        refused(fn () => DB::insert(
            'insert into public.announcements (message, ends_at) values (?, ?)',
            ['   ', $soon]
        ), 'announcements_message_length'),
        'whitespace alone is refused'
    );

    check(
        refused(fn () => DB::insert(
            "insert into public.announcements (message, starts_at, ends_at)
             values ('backwards', now(), now() - interval '1 hour')"
        ), 'announcements_window'),
        'an announcement ending before it starts is refused'
    );

    check(
        refused(fn () => DB::insert(
            'insert into public.announcements (message, tone, ends_at) values (?, ?, ?)',
            ['shouting', 'URGENT', $soon]
        ), 'announcements_tone_check'),
        'an unknown tone is refused'
    );

    become_owner_of_database();

    // ---- it is on the wire --------------------------------------------------
    $published = DB::selectOne(
        "select 1 as ok from pg_publication_tables
          where pubname = 'supabase_realtime' and schemaname = 'public'
            and tablename = 'announcements'"
    );
    check($published !== null, 'the table is in the realtime publication');
} finally {
    DB::rollBack();
    echo PHP_EOL . 'rolled back — nothing written' . PHP_EOL;
}

echo $failures ? PHP_EOL . "{$failures} failed" . PHP_EOL : PHP_EOL . 'all passed' . PHP_EOL;
exit($failures ? 1 : 0);
