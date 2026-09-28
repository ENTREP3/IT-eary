<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * A way for the shop to say something to everybody at once.
 *
 * Every other piece of writing on the storefront answers a question the diner
 * asked: what is cooking, what does it cost, is it ready. None of it can carry
 * the thing a karinderya most often needs to announce — closing early for a
 * fiesta, a power cut, kambing that only came in today and will be gone by two.
 * Until now the only way to say any of it was to change the tagline, which is
 * the shop's permanent description being used as a noticeboard.
 *
 * Three decisions worth keeping:
 *
 * `ends_at` is NOT NULL, deliberately. An announcement is news, and news goes
 * stale: a sign reading "closing early today" still up on Thursday is worse
 * than no sign, because it teaches people to stop believing the banner. There
 * is no "until I remove it" option, because that is precisely the option that
 * gets forgotten. Anything genuinely permanent belongs in the shop blurb, which
 * already exists and is edited two sections higher in the same screen.
 *
 * Reading is open to `anon`. A stranger who has never signed in is exactly who
 * "we are closed this afternoon" needs to reach, and they are most of the
 * traffic. The RLS predicate carries the schedule, so an announcement written
 * at dawn for the evening is invisible to everybody, including a client that
 * asks for it directly, until its own start time.
 *
 * Writing is the owner alone — `is_admin()`, not `is_staff()`. This speaks to
 * every customer in the shop's voice, which is a different thing from moving a
 * ticket to ready, and it is the owner's name on it.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
create table if not exists public.announcements (
  id         uuid primary key default gen_random_uuid(),
  message    text not null,
  -- 'notice' is ordinary news, 'warning' is something that costs the diner a
  -- wasted trip if they miss it. Two is enough: a scale with five steps only
  -- means every announcement ends up marked urgent.
  tone       text not null default 'notice' check (tone in ('notice', 'warning')),
  starts_at  timestamptz not null default now(),
  ends_at    timestamptz not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),

  -- Long enough for the whole of "Sarado kami ngayong hapon, may brownout sa
  -- palengke. Bukas po ulit 6AM." and short enough to stay one glance.
  constraint announcements_message_length
    check (char_length(btrim(message)) between 1 and 280),

  constraint announcements_window check (ends_at > starts_at)
);

comment on table public.announcements is
  'Short-lived messages from the owner to every diner. Always expire; see ends_at.';

create index if not exists announcements_window_idx
  on public.announcements (ends_at desc, starts_at);

alter table public.announcements enable row level security;

-- What is live this second, to anybody at all.
drop policy if exists "announcements_read_live" on public.announcements;
create policy "announcements_read_live" on public.announcements
  for select
  to anon, authenticated
  using (now() >= starts_at and now() < ends_at);

-- The owner also sees what is scheduled and what has already run, because a
-- screen that hides expired announcements gives no way to tell a message that
-- finished from one that was never saved.
drop policy if exists "announcements_read_all_admin" on public.announcements;
create policy "announcements_read_all_admin" on public.announcements
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "announcements_write_admin" on public.announcements;
create policy "announcements_write_admin" on public.announcements
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select on public.announcements to anon, authenticated;
grant insert, update, delete on public.announcements to authenticated;

-- Stamp the author without trusting the client to say who it is.
create or replace function public.stamp_announcement_author()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.created_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists announcements_author on public.announcements;
create trigger announcements_author
  before insert on public.announcements
  for each row execute function public.stamp_announcement_author();

-- Say it on the wire, so a diner already looking at the menu sees the notice
-- without reloading. That is the whole point of announcing it.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'announcements'
  ) then
    alter publication supabase_realtime add table public.announcements;
  end if;
end $$;
SQL);
    }

    public function down(): void
    {
        DB::unprepared(<<<'SQL'
do $$
begin
  if exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'announcements'
  ) then
    alter publication supabase_realtime drop table public.announcements;
  end if;
end $$;

drop trigger if exists announcements_author on public.announcements;
drop function if exists public.stamp_announcement_author();
drop table if exists public.announcements;
SQL);
    }
};
