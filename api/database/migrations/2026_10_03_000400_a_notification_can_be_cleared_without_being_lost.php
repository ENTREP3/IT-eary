<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Let somebody clear their bell, and turn it off entirely.
 *
 * The bell only ever filled up. There was no way to tidy it and no way to say
 * "stop showing me these" short of ignoring the badge, which is how a badge
 * stops meaning anything.
 *
 * Clearing hides rather than deletes. The row is the shop's record that it told
 * somebody their order was ready, and a diner tidying their own list should not
 * erase that — so `dismissed_at` is set and the row stays where it is.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
            alter table public.notifications
              add column if not exists dismissed_at timestamptz;

            comment on column public.notifications.dismissed_at is
              'When the person cleared it from their bell. The row is kept; only their view of it is hidden.';

            -- On by default, because a notification nobody asked to stop is the
            -- point of the feature. Null counts as on, so every existing row
            -- needs no backfill.
            alter table public.profiles
              add column if not exists notify_in_app boolean not null default true;

            comment on column public.profiles.notify_in_app is
              'Whether the bell shows anything. The shop still records what it sent.';
        SQL);

        DB::unprepared(<<<'SQL'
            -- A cleared notification is gone from the list, and from the count.
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
                 and n.dismissed_at is null
               order by n.created_at desc
               limit greatest(1, least(coalesce(p_limit, 30), 100));
            $$;

            create or replace function public.my_unread_count()
            returns int
            language sql
            stable
            security definer
            set search_path = public
            as $$
              select count(*)::int
                from public.notifications
               where user_id = auth.uid()
                 and read_at is null
                 and dismissed_at is null;
            $$;

            /*
             * Clears one, or all of them.
             *
             * Null clears everything, which is what the button in the bell
             * does. Passing an id clears a single row, for the swipe or the x
             * on one entry.
             */
            create or replace function public.dismiss_notifications(p_id uuid default null)
            returns void
            language sql
            security definer
            set search_path = public
            as $$
              update public.notifications
                 set dismissed_at = now()
               where user_id = auth.uid()
                 and dismissed_at is null
                 and (p_id is null or id = p_id);
            $$;

            /*
             * Whether the bell shows anything, as the person themselves decides.
             *
             * Its own function because `profiles` also holds `role`, and a
             * policy wide enough to let somebody switch off their own
             * notifications would be wide enough to let them make themselves an
             * owner.
             */
            create or replace function public.set_my_notify_in_app(p_on boolean)
            returns boolean
            language sql
            security definer
            set search_path = public
            as $$
              update public.profiles
                 set notify_in_app = coalesce(p_on, true)
               where id = auth.uid()
              returning notify_in_app;
            $$;

            grant execute on function public.dismiss_notifications(uuid) to authenticated;
            grant execute on function public.set_my_notify_in_app(boolean) to authenticated;
        SQL);
    }

    public function down(): void
    {
        DB::unprepared(<<<'SQL'
            drop function if exists public.set_my_notify_in_app(boolean);
            drop function if exists public.dismiss_notifications(uuid);
            alter table public.profiles drop column if exists notify_in_app;
            alter table public.notifications drop column if exists dismissed_at;
        SQL);
    }
};
