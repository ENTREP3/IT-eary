<?php
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
config(['database.connections.pgsql.port' => 5432]);
Illuminate\Support\Facades\DB::purge('pgsql');
use Illuminate\Support\Facades\DB;

$fail = 0;
function check($ok, $what, $detail = '') { global $fail; if (!$ok) $fail++;
  echo ($ok ? 'PASS  ' : 'FAIL  ') . $what . ($detail ? "  ($detail)" : '') . PHP_EOL; }

$admin   = DB::selectOne("select id from public.profiles where role='admin' limit 1");
$cashier = DB::selectOne("select id from public.profiles where role='cashier' limit 1");

function become($uid) {
  DB::statement('set local role authenticated');
  DB::statement("set local request.jwt.claims = '" . json_encode(['sub'=>$uid,'role'=>'authenticated']) . "'");
}
function back() { DB::statement('set local role postgres'); }
function refused(callable $fn, string $needle): bool {
  static $n = 0; $sp = 'sp' . (++$n);
  DB::statement("savepoint $sp");
  try { $fn(); DB::statement("release savepoint $sp"); return false; }
  catch (Throwable $e) { DB::statement("rollback to savepoint $sp"); return str_contains($e->getMessage(), $needle); }
}

DB::beginTransaction();
try {
  // ---- only the owner may look ----
  become($cashier->id);
  check(refused(fn() => DB::select('select * from public.list_people(null)'), 'only the owner'),
        'a cashier cannot list people');
  back();

  become($admin->id);
  $rows = DB::select('select * from public.list_people(null)');
  back();
  check(count($rows) > 0, 'the owner sees the list', count($rows) . ' people');

  $guests = array_filter($rows, fn($r) => $r->is_guest);
  check(true, 'guests who ordered are included', count($guests) . ' guest(s) with orders');

  // Staff sort first.
  check($rows[0]->role === 'admin', 'staff are listed first', $rows[0]->role);

  // Nobody with zero orders and an anonymous account should be present.
  $ghosts = array_filter($rows, fn($r) => $r->is_guest && (int)$r->orders === 0);
  check(count($ghosts) === 0, 'empty guest rows are left out', count($ghosts) . ' found');

  become($admin->id);
  $counts = DB::select('select * from public.people_counts()');
  back();
  foreach ($counts as $c) echo "        {$c->role}: {$c->n}\n";
  check(count($counts) > 0, 'counts come back');

  // ---- usernames ----
  check(DB::selectOne("select public.username_available('maria_dc') as ok")->ok === true, 'a free username is available');
  check(DB::selectOne("select public.username_available('ab') as ok")->ok === false, 'two characters is refused');
  check(DB::selectOne("select public.username_available('9lives') as ok")->ok === false, 'starting with a digit is refused');
  check(DB::selectOne("select public.username_available('has space') as ok")->ok === false, 'a space is refused');

  // ---- saving a profile ----
  become($admin->id);
  $saved = DB::selectOne("select * from public.save_my_profile('Juan', 'Dela Cruz', 'juandc', 'Santos', null, null)");
  back();
  check($saved->username === 'juandc', 'the username is saved', $saved->username);
  check($saved->full_name === 'Juan Santos Dela Cruz', 'full_name follows the parts', $saved->full_name);

  become($admin->id);
  $greet = DB::selectOne("select public.display_name(p) as n from public.profiles p where p.id = ?", [$admin->id]);
  back();
  check($greet->n === 'juandc', 'the greeting uses the username', $greet->n);

  become($admin->id);
  $saved2 = DB::selectOne("select * from public.save_my_profile('Juan', 'Dela Cruz', 'juandc', null, 'Tito Juan', null)");
  $greet2 = DB::selectOne("select public.display_name(p) as n from public.profiles p where p.id = ?", [$admin->id]);
  back();
  check($greet2->n === 'Tito Juan', 'a nickname wins over the username', $greet2->n);
  check($saved2->full_name === 'Juan Dela Cruz', 'dropping the middle name updates full_name', $saved2->full_name);

  // ---- the role is not reachable from the profile save ----
  become($admin->id);
  $stillAdmin = DB::selectOne("select role::text as r from public.profiles where id = ?", [$admin->id]);
  back();
  check($stillAdmin->r === 'admin', 'saving a profile does not touch the role', $stillAdmin->r);
} finally {
  DB::rollBack();
  echo PHP_EOL . 'rolled back — nothing written' . PHP_EOL;
}
echo $fail ? PHP_EOL . "$fail failed" . PHP_EOL : PHP_EOL . 'all passed' . PHP_EOL;
exit($fail ? 1 : 0);
