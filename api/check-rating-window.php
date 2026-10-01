<?php

/**
 * Proves a rating can be corrected for an hour and not afterwards.
 *
 * Runs against the real hosted database inside a transaction that is always
 * rolled back, so no real rating is created or altered.
 *
 * The case that matters most is the second one: the old code overwrote
 * created_at on every edit, which would have pushed the deadline an hour
 * further out each time and let somebody rewrite a rating indefinitely — the
 * exact thing the window exists to stop.
 *
 * Run with: docker compose exec -T api php check-rating-window.php
 */

require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Illuminate\Support\Facades\DB;

config(['database.connections.pgsql.port' => 5432]);
DB::purge('pgsql');

$fail = 0;
function check(bool $ok, string $what, string $detail = ''): void
{
    global $fail;
    if (! $ok) {
        $fail++;
    }
    echo ($ok ? 'PASS  ' : 'FAIL  ') . $what . ($detail ? "  ($detail)" : '') . PHP_EOL;
}

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

DB::beginTransaction();
try {
    // A paid ticket with a dish on it, which is all leave_review requires.
    $order = DB::selectOne("
        select ticket_code, items from public.orders
         where paid_at is not null and paid_at > now() - interval '30 days'
         order by paid_at desc limit 1");

    if (! $order) {
        echo 'No recent paid ticket to test with.' . PHP_EOL;
        DB::rollBack();
        exit(0);
    }

    $dish = json_decode($order->items, true)[0]['id'] ?? null;
    echo "ticket {$order->ticket_code}, dish {$dish}" . PHP_EOL . PHP_EOL;

    // ---- rating, then correcting it straight away -----------------------
    DB::statement('delete from public.reviews where ticket_code = ? and dish_id = ?',
        [$order->ticket_code, $dish]);

    $first = DB::selectOne('select * from public.leave_review(?, ?, ?, ?)',
        [$order->ticket_code, $dish, 5, 'Masarap']);
    check((int) $first->rating === 5, 'a rating can be left', $first->rating . ' stars');

    $second = DB::selectOne('select * from public.leave_review(?, ?, ?, ?)',
        [$order->ticket_code, $dish, 2, 'Changed my mind']);
    check((int) $second->rating === 2, 'and corrected within the hour', $second->rating . ' stars');

    // ---- the bug: created_at must NOT move when edited -------------------
    check($second->created_at === $first->created_at,
        'editing does not move created_at',
        $first->created_at . ' -> ' . $second->created_at);
    check($second->edited_at !== null, 'the edit is recorded separately', (string) $second->edited_at);

    // ---- after an hour, it stands ---------------------------------------
    // Aged by hand rather than by waiting, which is the only way to test a
    // deadline without an hour of patience.
    DB::statement("update public.reviews set created_at = now() - interval '61 minutes'
                    where ticket_code = ? and dish_id = ?", [$order->ticket_code, $dish]);

    check(refused(fn () => DB::select('select public.leave_review(?, ?, ?, ?)',
        [$order->ticket_code, $dish, 1, 'too late']), 'no longer be changed'),
        'an hour later it can no longer be changed');

    $unchanged = DB::selectOne('select rating from public.reviews
                                 where ticket_code = ? and dish_id = ?',
        [$order->ticket_code, $dish]);
    check((int) $unchanged->rating === 2, 'and the refused edit changed nothing',
        $unchanged->rating . ' stars');

    // ---- repeatedly editing must not hold the window open ---------------
    // Back inside the window, edit twice, then age from the ORIGINAL rating.
    DB::statement("update public.reviews set created_at = now() - interval '50 minutes'
                    where ticket_code = ? and dish_id = ?", [$order->ticket_code, $dish]);

    DB::select('select public.leave_review(?, ?, ?, ?)', [$order->ticket_code, $dish, 3, 'a']);
    DB::select('select public.leave_review(?, ?, ?, ?)', [$order->ticket_code, $dish, 4, 'b']);

    $after = DB::selectOne('select created_at from public.reviews
                             where ticket_code = ? and dish_id = ?',
        [$order->ticket_code, $dish]);
    $age = DB::selectOne('select extract(epoch from (now() - ?::timestamptz))/60 as mins',
        [$after->created_at]);

    check((int) $age->mins >= 49,
        'two edits did not reset the clock',
        'still ' . round($age->mins) . ' minutes old');

    // ---- what the diner's own list reports -------------------------------
    $customer = DB::selectOne('select customer_id from public.orders where ticket_code = ?',
        [$order->ticket_code]);

    if ($customer && $customer->customer_id) {
        DB::statement('set local role authenticated');
        DB::statement("set local request.jwt.claims = '" . json_encode([
            'sub' => $customer->customer_id, 'role' => 'authenticated',
        ]) . "'");
        $mine = DB::select('select dish_id, ticket_code, editable from public.my_reviews()');
        DB::statement('set local role postgres');

        // Matched on the ticket as well as the dish: a diner can rate the
        // same dish on two different visits, and the older one is
        // correctly no longer editable.
        $row = null;
        foreach ($mine as $r) {
            if ($r->dish_id === $dish && $r->ticket_code === $order->ticket_code) {
                $row = $r;
            }
        }
        echo '        returned ' . count($mine) . " row(s)
";
        if ($row) {
            echo '        editable = ' . var_export($row->editable, true) . "
";
        }
        // Postgres booleans arrive as true/false or as the strings t/f,
        // depending on the driver. Both mean the same thing.
        $editable = $row !== null
            && filter_var($row->editable, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE) === true;
        check($editable, 'my_reviews says it is still editable at 50 minutes');
    }
} finally {
    DB::rollBack();
    echo PHP_EOL . 'rolled back — no real rating was changed' . PHP_EOL;
}

echo $fail ? PHP_EOL . "{$fail} failed" . PHP_EOL : PHP_EOL . 'all passed' . PHP_EOL;
exit($fail ? 1 : 0);
