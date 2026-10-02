<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Favourites follow the diner instead of the handset.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
create table if not exists public.favourites (
  user_id    uuid not null references auth.users (id) on delete cascade,
  dish_id    text not null references public.dishes (id) on delete cascade,
  created_at timestamptz not null default now(),

  primary key (user_id, dish_id)
);

comment on table public.favourites is
  'Dishes a diner has marked. The device keeps its own copy for speed and for guests; this is the copy that survives a new phone.';

-- Reading the menu with favourites marked is one query per diner, always by
-- user. The primary key already leads with user_id, so it serves that.
alter table public.favourites enable row level security;

/*
 * Yours and nobody else's, in both directions.
 *
 * A list of what somebody likes is not dangerous, but it is theirs, and there
 * is no reason for one diner to be able to read another's — or, more to the
 * point, to write to it.
 */
drop policy if exists "favourites_own" on public.favourites;
create policy "favourites_own" on public.favourites
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, delete on public.favourites to authenticated;

/*
 * Bringing a device's list into the account, without losing either.
 */
create or replace function public.merge_favourites(p_dish_ids text[])
returns setof text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    return;
  end if;

  -- Dishes that have since been taken off the menu are skipped rather than
  -- raising: a stale device list must not be able to fail a sign-in.
  insert into public.favourites (user_id, dish_id)
  select v_me, d.id
    from unnest(coalesce(p_dish_ids, array[]::text[])) as wanted(id)
    join public.dishes d on d.id = wanted.id
  on conflict do nothing;

  return query
    select dish_id from public.favourites where user_id = v_me;
end;
$$;

grant execute on function public.merge_favourites(text[]) to authenticated;
SQL);
    }

    public function down(): void
    {
        DB::unprepared(<<<'SQL'
drop function if exists public.merge_favourites(text[]);
drop table if exists public.favourites;
SQL);
    }
};
