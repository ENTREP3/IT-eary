<?php

/**
 * Confirms the notification machinery is actually in place.
 *
 * A migration reporting DONE only says the statements ran. It does not say the
 * extension is usable, the cron jobs are scheduled, or that a trigger fires on
 * the column somebody assumed it did. This looks at what is really there.
 *
 * Read-only apart from one transaction that is always rolled back.
 *
 * Run with: docker compose exec -T api php check-notifications.php
 */

require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Illuminate\Support\Facades\DB;

// Session-mode pooling: transaction-scoped work does not survive on 6543.
config(['database.connections.pgsql.port' => 5432]);
DB::purge('pgsql');

$failures = 0;
function check(bool $ok, string $what, string $detail = ''): void
{
    global $failures;
    if (! $ok) {
        $failures++;
    }
    echo ($ok ? 'PASS  ' : 'FAIL  ') . $what . ($detail ? "  ($detail)" : '') . PHP_EOL;
}

// ---- extensions ---------------------------------------------------------
foreach (['pg_net', 'pg_cron'] as $ext) {
    $row = DB::selectOne('select 1 as ok from pg_extension where extname = ?', [$ext]);
    check($row !== null, "the {$ext} extension is installed");
}

// ---- the bridge ---------------------------------------------------------
$fn = DB::selectOne(
    "select 1 as ok from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'push_notify'"
);
check($fn !== null, 'push_notify() exists');

// It must not be callable by a customer's browser.
foreach (['anon', 'authenticated'] as $role) {
    $granted = DB::selectOne(
        "select has_function_privilege(?, 'public.push_notify(jsonb)', 'EXECUTE') as ok",
        [$role]
    );
    check(! ($granted->ok ?? false), "{$role} cannot call push_notify()");
}

// ---- triggers -----------------------------------------------------------
$expected = [
    'dishes_sold_out_notice'   => 'dishes',
    'inventory_low_notice'     => 'inventory',
    'orders_proof_notice'      => 'orders',
    'orders_cancelled_notice'  => 'orders',
    'reviews_poor_notice'      => 'reviews',
];
foreach ($expected as $trigger => $table) {
    $row = DB::selectOne(
        "select 1 as ok from pg_trigger t
           join pg_class c on c.oid = t.tgrelid
          where t.tgname = ? and c.relname = ? and not t.tgisinternal",
        [$trigger, $table]
    );
    check($row !== null, "{$trigger} is on {$table}");
}

// ---- scheduled jobs -----------------------------------------------------
foreach (['nudge-unpaid-tickets' => '*/5 * * * *', 'daily-summary' => '30 12 * * *'] as $job => $when) {
    $row = DB::selectOne('select schedule, active from cron.job where jobname = ?', [$job]);
    check($row !== null && $row->schedule === $when && $row->active,
        "{$job} is scheduled", $row->schedule ?? 'missing');
}

// Exactly one of each: re-running the migration must not stack duplicates.
$dupes = DB::selectOne(
    "select count(*) as n from cron.job where jobname in ('nudge-unpaid-tickets', 'daily-summary')"
);
check((int) $dupes->n === 2, 'no duplicate cron jobs', $dupes->n . ' rows');

// ---- the daily summary can actually run ---------------------------------
// It reads public.refunds, which this migration did not create. If that table
// or its amount column is not what was assumed, the summary would fail every
// night inside its own exception handler and nobody would ever know.
$refunds = DB::selectOne(
    "select 1 as ok from information_schema.columns
      where table_schema = 'public' and table_name = 'refunds' and column_name = 'amount'"
);
check($refunds !== null, 'refunds.amount exists, so the summary can read it');

// ---- password rule ------------------------------------------------------
$cases = [
    ['short1!A', null],                       // exactly 8, has all three
    ['Sh0rt!', 'Use at least 8 characters.'],
    [str_repeat('Aa1!', 17), 'Use 64 characters or fewer.'],   // 68 chars
    [str_repeat('Aa1!', 16), null],                            // exactly 64
    ['nocapital1!', 'Add a capital letter.'],
    ['NoDigits!!', 'Add a number.'],
    ['NoSymbol123', 'Add a symbol, such as ! or @ or #.'],
    ['alllowercase', 'Add a capital letter.'],                 // no longer asks for a small letter
];
foreach ($cases as [$password, $want]) {
    $got = DB::selectOne('select public.password_problem(?) as p', [$password])->p;
    check($got === $want, 'password: ' . substr($password, 0, 22) . (strlen($password) > 22 ? '…' : ''),
        $got ?? 'accepted');
}

// ---- favourites ---------------------------------------------------------
$tbl = DB::selectOne(
    "select 1 as ok from information_schema.tables
      where table_schema = 'public' and table_name = 'favourites'"
);
check($tbl !== null, 'favourites table exists');

$rls = DB::selectOne("select relrowsecurity as on from pg_class where relname = 'favourites'");
check((bool) ($rls->on ?? false), 'favourites has row-level security on');

DB::beginTransaction();
try {
    $me = DB::selectOne("select id from public.profiles limit 1");
    $dish = DB::selectOne("select id from public.dishes limit 1");

    if ($me && $dish) {
        DB::statement('set local role authenticated');
        DB::statement("set local request.jwt.claims = '" . json_encode([
            'sub' => $me->id, 'role' => 'authenticated',
        ]) . "'");

        $merged = DB::select('select public.merge_favourites(?) as dish_id', ['{' . $dish->id . '}']);
        DB::statement('set local role postgres');

        check(count($merged) >= 1, 'merge_favourites() adds and returns the union');

        DB::statement('set local role authenticated');
        $mine = DB::select('select dish_id from public.favourites');
        DB::statement('set local role postgres');
        check(count($mine) >= 1, 'the favourite is readable by its owner');
    } else {
        echo "SKIP  merge_favourites (no profile or dish to test with)" . PHP_EOL;
    }
} finally {
    DB::rollBack();
    echo PHP_EOL . 'rolled back — nothing written' . PHP_EOL;
}

echo $failures ? PHP_EOL . "{$failures} failed" . PHP_EOL : PHP_EOL . 'all passed' . PHP_EOL;
exit($failures ? 1 : 0);
