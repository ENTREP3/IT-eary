<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * The password rule, as the owner asked for it.
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
