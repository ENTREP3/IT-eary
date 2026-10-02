<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Letting the database send a notification when nobody pressed a button.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
create extension if not exists pg_net with schema extensions;

/*
 * Posts one notification to the edge function.
 *
 * Takes the same body shape the web app sends, so there is one contract for
 * notifications rather than one per caller: { to, title, body, url, tag }.
 */
create or replace function public.push_notify(p_message jsonb)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_key text;
  v_url text := 'https://tgazemsmihvodammodfu.supabase.co/functions/v1/send-push';
begin
  -- The key lives in Vault, never in the schema. Missing is a normal state on
  -- a fresh project, not an error: it simply means nothing is sent yet.
  begin
    select decrypted_secret into v_key
      from vault.decrypted_secrets
     where name = 'service_role_key'
     limit 1;
  exception when others then
    v_key := null;
  end;

  if v_key is null or v_key = '' then
    return;
  end if;

  -- Fire and forget. pg_net queues this on a background worker and returns
  -- immediately, so the transaction that triggered it is not waiting on
  -- Firebase, on Google, or on the network.
  perform extensions.net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body    := p_message
  );
exception when others then
  -- Deliberately silent. Whatever went wrong here, the order still stands and
  -- the stock is still correct; raising would undo real work for the sake of
  -- a message.
  return;
end;
$$;

comment on function public.push_notify(jsonb) is
  'Asks the send-push edge function to notify somebody. Never raises: a failed notification must not fail the thing that caused it.';

revoke all on function public.push_notify(jsonb) from public, anon, authenticated;
SQL);
    }

    public function down(): void
    {
        DB::unprepared(<<<'SQL'
drop function if exists public.push_notify(jsonb);
SQL);
    }
};
