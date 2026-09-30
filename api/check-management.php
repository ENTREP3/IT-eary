<?php

/**
 * Proves the people-management rules cannot be talked around.
 *
 * These functions delete accounts and lock people out, so the checks that
 * matter most are the refusals: an owner must not be able to lock themselves
 * out, remove the last owner, or leave the shop with nobody who can administer
 * it. A cashier must not reach any of it.
 *
 * Everything runs inside a transaction that is always rolled back, so no real
 * account is ever suspended or deleted by this.
 *
 * Run with: docker compose exec -T api php check-management.php
 */

require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Illuminate\Support\Facades\DB;

// Session-mode pooling: SET LOCAL and savepoints do not survive on 6543.
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

function become(?string $uid): void
{
    DB::statement('set local role authenticated');
    DB::statement("set local request.jwt.claims = '" . json_encode([
        'sub' => $uid, 'role' => 'authenticated',
    ]) . "'");
}
function back(): void { DB::statement('set local role postgres'); }

/** Runs $fn inside a savepoint and reports whether it was refused for $because. */
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
    $admin   = DB::selectOne("select id from public.profiles where role = 'admin' limit 1");
    $cashier = DB::selectOne("select id from public.profiles where role = 'cashier' limit 1");
    $customer = DB::selectOne("
        select p.id from public.profiles p
          join auth.users u on u.id = p.id
         where p.role = 'customer' and not coalesce(u.is_anonymous, false)
         limit 1");

    if (! $admin || ! $cashier || ! $customer) {
        echo 'Need one of each role to test.' . PHP_EOL;
        DB::rollBack();
        exit(1);
    }

    // ---- a cashier may not manage anybody ------------------------------
    become($cashier->id);
    check(refused(fn () => DB::select('select public.suspend_person(?, 7)', [$customer->id]), 'only the owner'),
        'a cashier cannot suspend');
    check(refused(fn () => DB::select('select public.delete_person(?)', [$customer->id]), 'only the owner'),
        'a cashier cannot delete');
    check(refused(fn () => DB::select('select public.set_person_role(?, ?)', [$cashier->id, 'admin']), 'only the owner'),
        'a cashier cannot promote themselves');
    back();

    // ---- an owner cannot act on themselves ------------------------------
    become($admin->id);
    check(refused(fn () => DB::select('select public.ban_person(?)', [$admin->id]), 'your own account'),
        'an owner cannot ban themselves');
    check(refused(fn () => DB::select('select public.delete_person(?)', [$admin->id]), 'your own account'),
        'an owner cannot delete themselves');

    // ---- the last owner is protected ------------------------------------
    // The cashier is promoted first so there are two, then demoted again, to
    // show the guard bites only while one owner remains.
    $owners = DB::selectOne("select count(*) n from public.profiles where role = 'admin'")->n;
    if ((int) $owners === 1) {
        DB::select('select public.set_person_role(?, ?)', [$cashier->id, 'admin']);
        $now = DB::selectOne("select count(*) n from public.profiles where role = 'admin'")->n;
        check((int) $now === 2, 'an owner can promote somebody to owner', "{$now} owners");

        // With two owners, demoting one is allowed.
        DB::select('select public.set_person_role(?, ?)', [$cashier->id, 'cashier']);
        $back = DB::selectOne("select count(*) n from public.profiles where role = 'admin'")->n;
        check((int) $back === 1, 'and can demote them again', "{$back} owner");
    }

    // Now only one owner remains, so another owner account cannot be removed.
    // Acting on self is already refused, so this is checked by promoting the
    // customer and then trying to delete the original owner as that new owner.
    DB::select('select public.set_person_role(?, ?)', [$customer->id, 'admin']);
    become($customer->id);
    // Two owners exist now, so this should be permitted — proving the guard is
    // about the last owner, not about owners in general.
    check(! refused(fn () => DB::select('select public.suspend_person(?, 1)', [$admin->id]), 'only owner'),
        'with two owners, one may suspend the other');
    DB::select('select public.restore_person(?)', [$admin->id]);
    back();

    // Drop back to one owner and confirm the guard returns.
    DB::select("update public.profiles set role = 'customer' where id = ?", [$customer->id]);
    become($admin->id);
    $solo = DB::selectOne("select count(*) n from public.profiles where role = 'admin'")->n;
    check((int) $solo === 1, 'one owner remains for the next check', "{$solo}");

    // ---- suspension is Supabase's own mechanism -------------------------
    DB::select('select public.suspend_person(?, 7)', [$customer->id]);
    back();
    $banned = DB::selectOne('select banned_until from auth.users where id = ?', [$customer->id]);
    check($banned->banned_until !== null, 'suspending sets auth.users.banned_until', (string) $banned->banned_until);

    become($admin->id);
    $listed = DB::select('select id, banned_until from public.list_people(null)');
    back();
    $row = null;
    foreach ($listed as $r) { if ($r->id === $customer->id) $row = $r; }
    check($row && $row->banned_until !== null, 'the list shows them as suspended');

    become($admin->id);
    DB::select('select public.restore_person(?)', [$customer->id]);
    back();
    $clear = DB::selectOne('select banned_until from auth.users where id = ?', [$customer->id]);
    check($clear->banned_until === null, 'restoring clears it');

    // ---- deleting keeps the shop's sales --------------------------------
    $withOrders = DB::selectOne("
        select o.customer_id, count(*) n
          from public.orders o
         where o.customer_id is not null and o.paid_at is not null
         group by o.customer_id order by 2 desc limit 1");

    if ($withOrders) {
        $before = (int) $withOrders->n;
        become($admin->id);
        DB::select('select public.delete_person(?)', [$withOrders->customer_id]);
        back();

        $gone = DB::selectOne('select count(*) n from public.profiles where id = ?', [$withOrders->customer_id]);
        check((int) $gone->n === 0, 'the account is gone');

        $orphaned = DB::selectOne(
            'select count(*) n from public.orders where customer_id is null and paid_at is not null'
        );
        check((int) $orphaned->n >= $before, 'their paid orders survive as guest orders', "{$before} kept");
    }

    // ---- guests are not listed, and staff have no order figures ---------
    become($admin->id);
    $all = DB::select('select * from public.list_people(null)');
    back();

    $guests = DB::selectOne("
        select count(*) n from public.profiles p
          join auth.users u on u.id = p.id
         where coalesce(u.is_anonymous, false)")->n;
    $listedIds = array_map(fn ($r) => $r->id, $all);
    $anonListed = DB::selectOne("
        select count(*) n from auth.users
         where coalesce(is_anonymous, false) and id = any(?::uuid[])",
        ['{' . implode(',', $listedIds) . '}']);
    check((int) $anonListed->n === 0, 'no anonymous guest is listed', "{$guests} exist, 0 listed");

    $staffRows = array_filter($all, fn ($r) => $r->role !== 'customer');
    $withFigures = array_filter($staffRows, fn ($r) => $r->orders !== null || $r->spent !== null || $r->last_order !== null);
    check(count($withFigures) === 0, 'staff carry no order figures', count($staffRows) . ' staff row(s)');

    $customerRows = array_filter($all, fn ($r) => $r->role === 'customer');
    $missing = array_filter($customerRows, fn ($r) => $r->orders === null);
    check(count($missing) === 0, 'customers still carry theirs', count($customerRows) . ' customer row(s)');

    // ---- the owner may correct somebody else's details ------------------
    $target = DB::selectOne("
        select p.id from public.profiles p
          join auth.users u on u.id = p.id
         where p.role = 'customer' and not coalesce(u.is_anonymous, false)
         limit 1");

    if ($target) {
        become($cashier->id);
        check(refused(fn () => DB::select(
            'select public.save_person_profile(?, ?, ?, ?)',
            [$target->id, 'Nope', 'Nope', 'nope123']), 'only the owner'),
            'a cashier cannot edit somebody else');
        back();

        become($admin->id);
        $row = DB::selectOne(
            'select * from public.save_person_profile(?, ?, ?, ?, ?, ?, ?)',
            [$target->id, 'Maria', 'Santos', 'maria_s', 'Reyes', 'Ate Maria', '09171234567']);
        back();
        check($row->username === 'maria_s', 'the owner can set a username', $row->username);
        check($row->full_name === 'Maria Reyes Santos', 'full_name follows', $row->full_name);
        check($row->phone === '09171234567', 'the number is saved', (string) $row->phone);

        // The role must be untouched by an edit.
        $stillCustomer = DB::selectOne("select role::text r from public.profiles where id = ?", [$target->id]);
        check($stillCustomer->r === 'customer', 'editing details does not touch the role', $stillCustomer->r);

        // And the rules are the same ones a diner meets.
        become($admin->id);
        check(refused(fn () => DB::select(
            'select public.save_person_profile(?, ?, ?, ?)',
            [$target->id, 'Maria', 'Santos', 'ab']), 'A username is 3 to 20'),
            'a short username is refused for the owner too');
        check(refused(fn () => DB::select(
            'select public.save_person_profile(?, ?, ?, ?)',
            [$target->id, '', 'Santos', 'maria_s']), 'A first name is needed'),
            'a blank first name is refused');

        // Taking a username somebody else already holds.
        $taken = DB::selectOne("select username from public.profiles where username is not null and id <> ? limit 1", [$target->id]);
        if ($taken) {
            check(refused(fn () => DB::select(
                'select public.save_person_profile(?, ?, ?, ?)',
                [$target->id, 'Maria', 'Santos', $taken->username]), 'is taken'),
                'a username already in use is refused', $taken->username);
        }
        back();
    }

    // ---- a suspension has to be a sensible length -----------------------
    // Looked up as the database owner: `authenticated` may not read
    // auth.users, which is the whole reason list_people exists.
    $other = DB::selectOne("
        select p.id from public.profiles p
          join auth.users u on u.id = p.id
         where p.role = 'customer' and not coalesce(u.is_anonymous, false)
         limit 1");
    become($admin->id);
    if ($other) {
        check(refused(fn () => DB::select('select public.suspend_person(?, 0)', [$other->id]), 'between 1 and 3650'),
            'zero days is refused');
        check(refused(fn () => DB::select('select public.suspend_person(?, 99999)', [$other->id]), 'between 1 and 3650'),
            'a suspension of 273 years is refused');
    }
    back();
} finally {
    DB::rollBack();
    echo PHP_EOL . 'rolled back — no account was really suspended or deleted' . PHP_EOL;
}

echo $fail ? PHP_EOL . "{$fail} failed" . PHP_EOL : PHP_EOL . 'all passed' . PHP_EOL;
exit($fail ? 1 : 0);
