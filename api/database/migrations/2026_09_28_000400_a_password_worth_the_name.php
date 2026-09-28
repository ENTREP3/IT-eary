<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Six characters was the whole rule, and the worksheet said otherwise.
 *
 * `create_staff_account` and `set_staff_password` both checked nothing but
 * length, and six of anything is guessable in seconds. The Lab 3 worksheet has
 * been claiming for weeks that a password here needs uppercase, lowercase,
 * numbers and symbols — a promise the code did not keep.
 *
 * These are the accounts most worth taking: a staff login can read every
 * customer's order, change prices, and settle money.
 *
 * The rule lives in one function so the two callers cannot drift apart, and so
 * the apps can ask the database what the rule is rather than each keeping a
 * copy that slowly stops matching. It returns the reason rather than a boolean,
 * because "not strong enough" tells somebody nothing about what to type next.
 *
 * Existing passwords are not revalidated. This gates what can be set from now
 * on; forcing a working account to change mid-service would lock a cashier out
 * of a till with a queue in front of it.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
create or replace function public.password_problem(p_password text)
returns text
language plpgsql
immutable
set search_path = public
as $$
begin
  if p_password is null or length(p_password) < 8 then
    return 'Use at least 8 characters.';
  end if;
  if p_password !~ '[a-z]' then
    return 'Add a small letter.';
  end if;
  if p_password !~ '[A-Z]' then
    return 'Add a capital letter.';
  end if;
  if p_password !~ '[0-9]' then
    return 'Add a number.';
  end if;
  -- Anything that is not a letter, a digit or a space. Spelled out this way so
  -- somebody on a keyboard we have never seen is not told their symbol is the
  -- wrong sort of symbol.
  if p_password !~ '[^a-zA-Z0-9[:space:]]' then
    return 'Add a symbol, such as ! or @ or #.';
  end if;
  return null;
end;
$$;

comment on function public.password_problem(text) is
  'Why a password is not acceptable, or NULL when it is. One rule, so every caller agrees.';

grant execute on function public.password_problem(text) to anon, authenticated;
SQL);

        // Swap the length check in each staff function for the shared rule.
        //
        // Called inline rather than through a local, because one of the two has
        // no `declare` block at all and adding one by pattern is how a working
        // function gets broken for the sake of tidiness. It is IMMUTABLE and
        // trivial, so asking twice costs nothing.
        $check = <<<'SQL'
if public.password_problem(p_password) is not null then
    raise exception '%', public.password_problem(p_password);
  end if;
SQL;

        foreach (['create_staff_account', 'set_staff_password'] as $fn) {
            $def = DB::selectOne(
                'select pg_get_functiondef(oid) d from pg_proc where proname = ?',
                [$fn]
            );
            if (!$def) {
                continue;
            }

            $patched = preg_replace(
                "/if p_password is null or length\(p_password\) < 6 then\s*\n\s*raise exception '[^']*';\s*\n\s*end if;/",
                $check,
                $def->d,
                1,
                $count
            );

            if (!$count) {
                throw new RuntimeException(
                    "$fn no longer contains the length check this migration replaces"
                );
            }

            DB::unprepared($patched);
        }
    }

    public function down(): void
    {
        DB::unprepared('drop function if exists public.password_problem(text);');
    }
};
