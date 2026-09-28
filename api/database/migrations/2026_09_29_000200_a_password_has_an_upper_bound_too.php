<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * The password rule, as the owner asked for it.
 *
 * Two changes.
 *
 * A maximum of 64. The owner asked for 24; 64 is the number after explaining
 * why. A stored password is hashed to a fixed length, so there is no storage
 * reason for a ceiling at all — the only honest reason is to stop somebody
 * pasting a megabyte and making the server hash it. 24 would have rejected
 * what a password manager generates by default, which pushes the most secure
 * users towards the least secure behaviour: giving up and typing something
 * they can remember. 64 bounds the input and no real person ever meets it.
 *
 * And the lowercase requirement is gone. The owner listed a capital, a number
 * and a symbol, and did not list a small letter. It was costing a rule without
 * buying anything: essentially every password containing a capital contains a
 * lowercase letter too, so the check only ever fired on SHOUTED PASSWORDS.
 *
 * The order of the checks is the order somebody fixes them in, and only the
 * first problem is ever returned — a list of five complaints about one attempt
 * reads as a telling-off.
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
  if length(p_password) > 64 then
    return 'Use 64 characters or fewer.';
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
  'Why a password is not acceptable, or NULL when it is. 8 to 64 characters, with a capital, a number and a symbol. One rule, so every caller agrees.';

grant execute on function public.password_problem(text) to anon, authenticated;
SQL);
    }

    public function down(): void
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
  if p_password !~ '[^a-zA-Z0-9[:space:]]' then
    return 'Add a symbol, such as ! or @ or #.';
  end if;
  return null;
end;
$$;
SQL);
    }
};
