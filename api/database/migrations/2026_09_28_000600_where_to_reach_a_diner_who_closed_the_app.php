<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Where to reach somebody who is not looking at the app.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
create table if not exists public.push_tokens (
  token      text primary key,
  user_id    uuid references auth.users (id) on delete cascade,

  -- 'web' or 'android'. Kept because the two need different payload shapes:
  -- a web push carries its own notification block, an Android one is handed
  -- to the system tray by the OS.
  platform   text not null check (platform in ('web', 'android')),

  -- Roughly which device this is, for the diner's own benefit if a "signed in
  -- devices" screen is ever wanted. Never parsed, only displayed.
  label      text,

  created_at timestamptz not null default now(),
  seen_at    timestamptz not null default now(),

  -- When the last send was refused. Null means the token is believed good.
  failed_at  timestamptz,
  failures   integer not null default 0
);

comment on table public.push_tokens is
  'One row per device installation that has agreed to be notified. Keyed by the Firebase token, so re-registering the same device updates rather than duplicates.';

create index if not exists push_tokens_user_idx
  on public.push_tokens (user_id) where user_id is not null;

-- The sender asks for live tokens only, and there are far more dead ones over
-- time than live ones.
create index if not exists push_tokens_live_idx
  on public.push_tokens (user_id) where failed_at is null;

alter table public.push_tokens enable row level security;

-- A diner may see and manage only their own devices. Nobody may read anybody
-- else's — a token is a way to make a particular phone buzz, and a list of
-- them is a list of the shop's customers' devices.
drop policy if exists "push_tokens_own" on public.push_tokens;
create policy "push_tokens_own" on public.push_tokens
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update, delete on public.push_tokens to authenticated;

/*
 * Registering a device, idempotently.
 */
create or replace function public.register_push_token(
  p_token    text,
  p_platform text,
  p_label    text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'sign in before registering for notifications';
  end if;

  if coalesce(btrim(p_token), '') = '' then
    raise exception 'no token supplied';
  end if;

  if p_platform not in ('web', 'android') then
    raise exception 'unknown platform %', p_platform;
  end if;

  insert into public.push_tokens (token, user_id, platform, label)
  values (btrim(p_token), v_me, p_platform, nullif(btrim(coalesce(p_label, '')), ''))
  on conflict (token) do update
    set user_id   = v_me,
        platform  = excluded.platform,
        label     = coalesce(excluded.label, public.push_tokens.label),
        seen_at   = now(),
        -- Hearing from the device again is proof it is alive, so forgive
        -- whatever went wrong last time.
        failed_at = null,
        failures  = 0;
end;
$$;

grant execute on function public.register_push_token(text, text, text) to authenticated;

/*
 * Giving up the address again.
 *
 * Turning notifications off has to actually stop them, so this is a real
 * delete rather than a flag. Takes the token rather than the user, because a
 * diner switching one phone off should keep getting notified on the other.
 */
create or replace function public.forget_push_token(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.push_tokens
   where token = btrim(p_token)
     and user_id = auth.uid();
end;
$$;

grant execute on function public.forget_push_token(text) to authenticated;
SQL);
    }

    public function down(): void
    {
        DB::unprepared(<<<'SQL'
drop function if exists public.forget_push_token(text);
drop function if exists public.register_push_token(text, text, text);
drop table if exists public.push_tokens;
SQL);
    }
};
