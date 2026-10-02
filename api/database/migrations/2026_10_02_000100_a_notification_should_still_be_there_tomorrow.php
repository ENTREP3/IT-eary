<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Keep the things the shop says, instead of only shouting them once.
 *
 * Everything the notification system produces has been fire-and-forget: a push
 * goes to whatever devices are registered, and if nobody was holding the phone,
 * or the app was open at the time, or notifications were never switched on, the
 * event is gone. There is no list anywhere of what happened while you were busy
 * — which is most of the working day in a karinderya.
 *
 * The dashboard has a bell, and it has been lying by omission. It counts new
 * orders and low stock, computed in the browser from rows it already had, and
 * knows nothing about the five other things the shop sends: a dish selling out,
 * an order cancelled, a poor rating, a GCash proof waiting, a ticket left
 * unpaid. The cashier had no bell at all, and a diner with an account had
 * nowhere to see what they had been told.
 *
 * ---------------------------------------------------------------------------
 * One call does both
 *
 * The important part is not the table, it is that `notify_people` records and
 * sends in one place. Writing the bell as a second system — its own inserts
 * beside the existing push calls — guarantees that one day a trigger gains a
 * notification that reaches phones and never appears in the app, or the
 * reverse, and nobody notices because both halves look fine on their own.
 *
 * So the triggers now call `notify_people`, which resolves the audience once,
 * writes a row per person, and then hands the identical payload to
 * `push_notify`. A bell entry and a push are two deliveries of one notification
 * rather than two features that happen to agree.
 *
 * The audience rules are a transcription of the ones in the send-push edge
 * function, deliberately kept to the same five kinds and the same meanings.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
            create table if not exists public.notifications (
              id         uuid primary key default gen_random_uuid(),
              user_id    uuid not null references auth.users (id) on delete cascade,
              title      text not null,
              body       text,
              -- Where tapping it should go. Relative, because the same row is
              -- read by the website and by two phone apps.
              url        text,
              -- Groups repeats of the same thing, exactly as the push payload
              -- does, so a bell can collapse them later if it ever needs to.
              tag        text,
              created_at timestamptz not null default now(),
              read_at    timestamptz
            );

            create index if not exists notifications_for_person
              on public.notifications (user_id, created_at desc);

            -- Unread counting happens on every page load of three apps.
            create index if not exists notifications_unread
              on public.notifications (user_id) where read_at is null;

            alter table public.notifications enable row level security;

            drop policy if exists notifications_are_private on public.notifications;
            create policy notifications_are_private
              on public.notifications for select
              using (user_id = auth.uid());

            -- Marking your own as read is the only write a client may make.
            -- Creating one is the database's job: a client that could insert
            -- here could put words in the shop's mouth.
            drop policy if exists notifications_marked_read_by_owner on public.notifications;
            create policy notifications_marked_read_by_owner
              on public.notifications for update
              using (user_id = auth.uid())
              with check (user_id = auth.uid());
        SQL);

        // A bell that only fills on reload is a bell somebody has to remember
        // to go and check. Wrapped because adding a table already in the
        // publication raises, and this migration should survive a re-run.
        DB::unprepared(<<<'SQL'
            do $$
            begin
              alter publication supabase_realtime add table public.notifications;
            exception when duplicate_object then
              null;
            end $$;
        SQL);

        DB::unprepared(<<<'SQL'
            /*
             * Records a notification and sends it, for one audience.
             *
             * A transcription of the audience rules in the send-push edge
             * function. The two must agree, and the way to make them agree is
             * for one call to produce both deliveries rather than for two
             * systems to be kept in step by hand.
             */
            create or replace function public.notify_people(p_message jsonb)
            returns void
            language plpgsql
            security definer
            set search_path = public
            as $$
            declare
              v_to    jsonb := p_message -> 'to';
              v_kind  text  := v_to ->> 'kind';
              v_ids   uuid[];
            begin
              if v_kind = 'admins' then
                select array_agg(id) into v_ids
                  from public.profiles where role = 'admin';

              elsif v_kind = 'staff' then
                select array_agg(id) into v_ids
                  from public.profiles where role in ('admin', 'cashier');

              elsif v_kind = 'ticket' then
                -- A guest who ordered without an account has nobody to tell,
                -- and that is ordinary rather than a failure.
                select array_agg(customer_id) into v_ids
                  from public.orders
                 where ticket_code = upper(btrim(v_to ->> 'ticket_code'))
                   and customer_id is not null;

              elsif v_kind = 'dish_waiters' then
                select array_agg(customer_id) into v_ids
                  from public.stock_alerts
                 where dish_id = (v_to ->> 'dish_id')
                   and customer_id is not null;

              elsif v_kind = 'users' then
                select array_agg(value::uuid) into v_ids
                  from jsonb_array_elements_text(coalesce(v_to -> 'user_ids', '[]'::jsonb));

              elsif v_kind = 'everyone' then
                /*
                 * Only people with an account.
                 *
                 * A guest is a row in auth.users with no email and no password
                 * that the next visit replaces, so a bell entry for one is
                 * written for somebody who will never look at it. The push
                 * still goes to every registered device, guests included —
                 * that is what 'everyone' means for a shout — but the kept
                 * copy belongs to people who have somewhere to keep it.
                 */
                select array_agg(id) into v_ids
                  from auth.users
                 where coalesce(is_anonymous, false) = false;
              end if;

              if v_ids is not null then
                insert into public.notifications (user_id, title, body, url, tag)
                select distinct u, p_message ->> 'title', p_message ->> 'body',
                       p_message ->> 'url', p_message ->> 'tag'
                  from unnest(v_ids) as u
                 where u is not null;
              end if;

              -- Sent after recording, so a phone that is switched off does not
              -- cost somebody the entry in their bell.
              perform public.push_notify(p_message);
            end;
            $$;

            comment on function public.notify_people(jsonb) is
              'Records a notification for everyone in the audience, then sends it as a push. Triggers should call this rather than push_notify.';

            revoke all on function public.notify_people(jsonb) from public, anon, authenticated;
        SQL);

        // ------------------------------------------------------------------
        // What a client is allowed to ask for.
        // ------------------------------------------------------------------
        DB::unprepared(<<<'SQL'
            /*
             * The caller's own notifications, newest first.
             *
             * A function rather than a plain select so the apps cannot drift on
             * what "recent" means, and so the shape stays ours to change.
             */
            create or replace function public.my_notifications(p_limit int default 30)
            returns table (
              id         uuid,
              title      text,
              body       text,
              url        text,
              created_at timestamptz,
              read_at    timestamptz
            )
            language sql
            stable
            security definer
            set search_path = public
            as $$
              select n.id, n.title, n.body, n.url, n.created_at, n.read_at
                from public.notifications n
               where n.user_id = auth.uid()
               order by n.created_at desc
               limit greatest(1, least(coalesce(p_limit, 30), 100));
            $$;

            /*
             * How many are waiting, which is all a bell badge needs.
             *
             * Separate from the list because the badge is read on every page
             * and the list only when the bell is opened.
             */
            create or replace function public.my_unread_count()
            returns int
            language sql
            stable
            security definer
            set search_path = public
            as $$
              select count(*)::int
                from public.notifications
               where user_id = auth.uid() and read_at is null;
            $$;

            /*
             * Marks everything read, which is what opening a bell means.
             *
             * Per-item read state would be a nicer model and a worse product
             * here: these are glanceable one-liners, not messages that get
             * replied to, and a list where some entries stay bold after being
             * looked at is a list people stop trusting.
             */
            create or replace function public.mark_notifications_read()
            returns void
            language sql
            security definer
            set search_path = public
            as $$
              update public.notifications
                 set read_at = now()
               where user_id = auth.uid() and read_at is null;
            $$;

            grant execute on function public.my_notifications(int) to authenticated;
            grant execute on function public.my_unread_count() to authenticated;
            grant execute on function public.mark_notifications_read() to authenticated;
        SQL);

        // ------------------------------------------------------------------
        // Every existing trigger now records as well as sends.
        // ------------------------------------------------------------------
        foreach ([
            'tell_owner_dish_sold_out',
            'tell_owner_stock_low',
            'tell_counter_proof_arrived',
            'tell_owner_order_cancelled',
            'tell_owner_poor_rating',
            'nudge_unpaid_tickets',
            'send_daily_summary',
        ] as $fn) {
            $body = DB::selectOne(
                'select pg_get_functiondef(p.oid) as def
                   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = \'public\' and p.proname = ?',
                [$fn],
            );

            if (! $body) {
                continue;
            }

            // Only the call changes. Rewriting each function by hand here would
            // mean restating five trigger bodies that have nothing to do with
            // this change, and every one of those copies could drift.
            $next = str_replace(
                'perform public.push_notify(',
                'perform public.notify_people(',
                $body->def,
            );

            if ($next !== $body->def) {
                DB::unprepared($next);
            }
        }
    }

    public function down(): void
    {
        DB::unprepared(<<<'SQL'
            drop function if exists public.mark_notifications_read();
            drop function if exists public.my_unread_count();
            drop function if exists public.my_notifications(int);
            drop function if exists public.notify_people(jsonb);
            drop table if exists public.notifications;
        SQL);
    }
};
