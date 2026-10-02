<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Call pg_net by a name that exists.
 *
 * `push_notify` asked for `extensions.net.http_post`. Postgres reads a
 * three-part name as database.schema.function, so that is a request for a
 * database called "extensions" and it fails with "cross-database references are
 * not implemented" every single time. The function ends with a catch-all that
 * returns quietly, written so a failed notification could never undo the order
 * that caused it — and it swallowed this too.
 *
 * So no database trigger has ever sent a notification: not a dish selling out,
 * not low stock, not a GCash proof waiting, not a cancellation, not a poor
 * rating, not the unpaid nudge, not the daily summary. They fired, built their
 * message, called this, and lost it. Nothing anywhere said so.
 *
 * pg_net installs into `extensions`, but it creates its own `net` schema for
 * the functions, so the correct name is `net.http_post`. The only change here
 * is the prefix.
 *
 * The catch-all stays — the reasoning for it was right, and an order must not
 * fail because Firebase is unreachable. What it cost was the two years of
 * silence, so it now says something to the server log on its way past. A
 * `raise warning` cannot roll anything back and leaves a trace in the logs,
 * which is the difference between failing quietly and failing invisibly.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
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
              -- The key lives in Vault, never in the schema. Missing is a normal
              -- state on a fresh project: it means nothing is sent yet.
              begin
                select decrypted_secret into v_key
                  from vault.decrypted_secrets
                 where name = 'service_role_key'
                 limit 1;
              exception when others then
                v_key := null;
              end;

              if v_key is null or v_key = '' then
                raise warning 'push_notify: no service_role_key in vault, nothing sent';
                return;
              end if;

              -- Fire and forget. pg_net queues this on a background worker and
              -- returns immediately, so the transaction that caused it is not
              -- waiting on Firebase, on Google, or on the network.
              perform net.http_post(
                url     := v_url,
                headers := jsonb_build_object(
                  'Content-Type', 'application/json',
                  'Authorization', 'Bearer ' || v_key
                ),
                body    := p_message
              );
            exception when others then
              -- Still never fails the caller: the order stands and the stock is
              -- correct, and raising would undo real work for the sake of a
              -- message. But it says so now, because the silent version of this
              -- hid a broken call for the life of the feature.
              raise warning 'push_notify failed: % (%)', sqlerrm, sqlstate;
              return;
            end;
            $$;

            comment on function public.push_notify(jsonb) is
              'Asks the send-push edge function to notify somebody. Warns rather than raising: a failed notification must not fail the thing that caused it.';

            revoke all on function public.push_notify(jsonb) from public, anon, authenticated;
        SQL);
    }

    public function down(): void
    {
        // Deliberately not reversible. The previous version could not send
        // anything, and restoring it would only restore the silence.
    }
};
