<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * A rating can be corrected for an hour, then it stands.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
alter table public.reviews
  add column if not exists edited_at timestamptz;

comment on column public.reviews.created_at is
  'When the diner first rated this. Never overwritten: the edit window is measured from it.';
comment on column public.reviews.edited_at is
  'When they last changed it, within the hour they are allowed to.';

create or replace function public.leave_review(
  p_ticket_code text,
  p_dish_id     text,
  p_rating      int,
  p_comment     text default '',
  p_author_name text default null
)
returns public.reviews
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code     text := upper(trim(coalesce(p_ticket_code, '')));
  v_order    public.orders;
  v_review   public.reviews;
  v_existing public.reviews;
begin
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'a rating must be between 1 and 5';
  end if;

  select * into v_order from public.orders where ticket_code = v_code;

  if v_order.id is null then
    raise exception 'no ticket %', p_ticket_code;
  end if;

  -- Only a settled ticket counts. An unpaid ticket is an intention, not a meal.
  if v_order.paid_at is null then
    raise exception 'ticket % has not been paid, so it cannot leave a rating', v_code;
  end if;

  -- Ratings are about a recent meal, not one from last year.
  if v_order.paid_at < now() - interval '30 days' then
    raise exception 'ticket % is older than 30 days', v_code;
  end if;

  -- The ticket must actually have contained the dish being rated.
  if not exists (
    select 1 from jsonb_array_elements(v_order.items) as item
    where item ->> 'id' = p_dish_id
  ) then
    raise exception 'ticket % did not include that dish', v_code;
  end if;

  /*
   * The window, checked before anything is written.
   *
   * Measured from when they first rated, not from the last edit, so repeatedly
   * editing cannot hold it open. The message says what to do about it, which
   * is nothing — that is the point of it settling.
   */
  select * into v_existing from public.reviews
   where ticket_code = v_code and dish_id = p_dish_id;

  if v_existing.id is not null
     and v_existing.created_at < now() - interval '1 hour' then
    raise exception
      'This rating was left more than an hour ago, so it can no longer be changed.';
  end if;

  insert into public.reviews (dish_id, ticket_code, rating, comment, author_name)
  values (
    p_dish_id,
    v_code,
    p_rating,
    left(trim(coalesce(p_comment, '')), 500),
    nullif(trim(coalesce(p_author_name, '')), '')
  )
  on conflict (ticket_code, dish_id) do update
    set rating    = excluded.rating,
        comment   = excluded.comment,
        -- created_at is deliberately absent: it says when the meal was rated,
        -- and overwriting it both falsifies that and reopens the window above.
        edited_at = now()
  returning * into v_review;

  return v_review;
end;
$$;

grant execute on function public.leave_review(text, text, int, text, text) to anon, authenticated;

-- The diner's own ratings now say whether each can still be changed, so the
-- apps can hide a control that would only be refused.
--
-- Dropped first: this adds a column to the returned table, and Postgres
-- refuses to replace a function whose return type has changed.
drop function if exists public.my_reviews();

create or replace function public.my_reviews()
returns table (
  dish_id     text,
  ticket_code text,
  rating      int,
  comment     text,
  created_at  timestamptz,
  editable    boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;

  return query
  select r.dish_id, r.ticket_code, r.rating, r.comment, r.created_at,
         r.created_at > now() - interval '1 hour' as editable
    from public.reviews r
    join public.orders o on o.ticket_code = r.ticket_code
   where o.customer_id = auth.uid()
   order by r.created_at desc;
end;
$$;

grant execute on function public.my_reviews() to authenticated;
SQL);
    }

    public function down(): void
    {
        DB::unprepared(<<<'SQL'
alter table public.reviews drop column if exists edited_at;
SQL);
    }
};
