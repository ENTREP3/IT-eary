<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Letting the database send a notification when nobody pressed a button.
 *
 * Everything notified so far was triggered by a person: staff mark an order
 * ready, the owner posts an announcement. Those go out from the app that did
 * it, using that person's own session, and need nothing here.
 *
 * The rest have no such moment. A dish sells out because a customer bought the
 * last one. Stock crosses its par level because a recipe consumed it. A rating
 * arrives at ten at night. In every case the person who needs telling — usually
 * the owner — is nowhere near a screen, and the person who caused it must not
 * be the one sending it: a diner's browser cannot be trusted to notify the shop
 * about the shop.
 *
 * So the database does it. Postgres cannot make an HTTPS request on its own, so
 * `pg_net` does the asking and the edge function does the sending.
 *
 * ---------------------------------------------------------------------------
 * Two things this is careful about
 *
 * **It never blocks or fails the thing that triggered it.** `pg_net` queues the
 * request and returns at once rather than waiting for a reply, and every call
 * here is wrapped so that any error — a missing key, an unreachable function,
 * a malformed payload — is swallowed. A notification that cannot be sent must
 * never stop an order being placed. The shop selling food matters more than
 * the shop being told about it.
 *
 * **The key is not in this file.** The service role key can read and write
 * every table, so it cannot live in a migration that goes into git. It is read
 * at call time from Supabase Vault, which is encrypted at rest and readable
 * only by the database owner. Until somebody puts it there this whole
 * mechanism does nothing at all, quietly and on purpose — see the note printed
 * at the end of this migration.
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
