<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Ask for a lowercase letter too, because Supabase now does.
 *
 * `password_problem` is what the signup and reset screens use to say what is
 * missing while somebody is typing. It checked length, a capital, a number and
 * a symbol, and deliberately not a lowercase letter — one requirement fewer to
 * explain, on the reasoning that nothing downstream cared.
 *
 * Something downstream cares now. With the password rules switched on in
 * Supabase, the server requires one of each case, so "ABCDEF1!" passes this
 * check, is offered to the user as acceptable, and is then refused by the API
 * with a message written for a developer. Advice that disagrees with the rule
 * is worse than no advice.
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
              if p_password !~ '[a-z]' then
                return 'Add a small letter.';
              end if;
              if p_password !~ '[A-Z]' then
                return 'Add a capital letter.';
              end if;
              if p_password !~ '[0-9]' then
                return 'Add a number.';
              end if;
              -- Anything that is not a letter, a digit or a space. Spelled out
              -- this way so somebody on a keyboard we have never seen is not
              -- told their symbol is the wrong sort of symbol.
              if p_password !~ '[^a-zA-Z0-9[:space:]]' then
                return 'Add a symbol, such as ! or @ or #.';
              end if;
              return null;
            end;
            $$;
        SQL);
    }

    public function down(): void
    {
        // The looser rule would only disagree with the server again.
    }
};
