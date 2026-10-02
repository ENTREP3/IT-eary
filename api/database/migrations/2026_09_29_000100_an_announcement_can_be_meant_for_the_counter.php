<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Who an announcement is for, and whether it is worth a buzz.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
alter table public.announcements
  add column if not exists audience text not null default 'diners',
  add column if not exists notify boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'announcements_audience_check'
  ) then
    alter table public.announcements
      add constraint announcements_audience_check
      check (audience in ('diners', 'staff', 'both'));
  end if;
end $$;

comment on column public.announcements.audience is
  'diners | staff | both. Enforced by the read policies, not by the client.';

comment on column public.announcements.notify is
  'Whether posting this also sent a push notification. Off by default: a banner is cheap, a buzz is not.';

-- Diners, and anybody not signed in at all, see only what is addressed to them.
drop policy if exists "announcements_read_live" on public.announcements;
create policy "announcements_read_live" on public.announcements
  for select
  to anon, authenticated
  using (
    now() >= starts_at
    and now() < ends_at
    and audience in ('diners', 'both')
  );

-- Staff additionally see what was written for the counter.
drop policy if exists "announcements_read_staff" on public.announcements;
create policy "announcements_read_staff" on public.announcements
  for select
  to authenticated
  using (
    public.is_staff()
    and now() >= starts_at
    and now() < ends_at
    and audience in ('staff', 'both')
  );
SQL);
    }

    public function down(): void
    {
        DB::unprepared(<<<'SQL'
drop policy if exists "announcements_read_staff" on public.announcements;

drop policy if exists "announcements_read_live" on public.announcements;
create policy "announcements_read_live" on public.announcements
  for select
  to anon, authenticated
  using (now() >= starts_at and now() < ends_at);

alter table public.announcements
  drop constraint if exists announcements_audience_check;

alter table public.announcements
  drop column if exists audience,
  drop column if exists notify;
SQL);
    }
};
