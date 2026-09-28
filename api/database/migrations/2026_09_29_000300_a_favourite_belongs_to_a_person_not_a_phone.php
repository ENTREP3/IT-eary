<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Favourites follow the diner instead of the handset.
 *
 * They were kept on the device, and the comment in the code said why: ordering
 * was anonymous, so there was no account to hang them off. That reasoning has
 * expired — there are accounts now — and what it leaves behind is wrong in
 * three ways at once.
 *
 * Sign in on a different phone and your favourites are gone. Clear your
 * browser and they are gone. And the one that actually matters in a karinderya:
 * two people sharing a phone see each other's, because the list belongs to the
 * handset and nothing about it knows who is holding it.
 *
 * The device copy does not go away. It is what makes the heart fill in the same
 * frame it is tapped, what works with no signal, and what a guest who never
 * signs in still gets. This is the copy that survives.
 *
 * No `notified_at`, no ordering, no notes. A favourite is one bit — this diner
 * likes this dish — and the table says exactly that and nothing more.
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
 *
 * Called when a diner signs in somewhere new: they may have hearted things on
 * this phone as a guest, and the account may have things hearted elsewhere.
 * Neither should win — the answer people expect is both.
 *
 * A function rather than a plain insert so it is one round trip and one
 * decision, and so the merge rule lives next to the table instead of being
 * repeated, slightly differently, in the web app and the phone app.
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
