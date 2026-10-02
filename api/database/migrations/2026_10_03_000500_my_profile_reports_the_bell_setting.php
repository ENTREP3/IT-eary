<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Return `notify_in_app` from `my_profile`, so a switch can show its own state.
 *
 * Dropped first: the return type changes, and Postgres will not replace a
 * function whose signature differs.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
            drop function if exists public.my_profile();

            create function public.my_profile()
            returns table (
              id            uuid,
              email         text,
              first_name    text,
              middle_name   text,
              last_name     text,
              nickname      text,
              phone         text,
              full_name     text,
              role          text,
              notify_in_app boolean
            )
            language plpgsql
            security definer
            set search_path = public, auth
            as $$
            begin
              if auth.uid() is null then
                raise exception 'sign in first';
              end if;

              return query
              select p.id, u.email::text, p.first_name, p.middle_name, p.last_name,
                     p.nickname, p.phone, p.full_name, p.role::text,
                     coalesce(p.notify_in_app, true)
                from public.profiles p
                join auth.users u on u.id = p.id
               where p.id = auth.uid();
            end;
            $$;

            grant execute on function public.my_profile() to authenticated;
        SQL);
    }

    public function down(): void
    {
        // The previous shape is restored by its own migration if ever needed.
    }
};
