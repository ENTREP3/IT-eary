<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * What this diner has rated, from the shop rather than from their browser.
 *
 * The rating itself was always saved properly — it is in `reviews`, it counts
 * towards the dish average, and everybody can see it. What was kept on the
 * device was the answer to a different question: *did I rate this?* That drives
 * the filled-in stars and whether the button says "Rate this dish" or "Edit
 * your rating".
 *
 * So signing in on another browser showed a diner their own ratings as though
 * they had never left one. Nothing was lost — the ratings were on the dishes
 * the whole time — but the screen said otherwise, which is the same thing to
 * the person reading it.
 *
 * ---------------------------------------------------------------------------
 * Found by ticket, because that is what a review is attached to
 *
 * `reviews` has no customer column. It has a ticket code, and that was a good
 * decision: a rating is proof of a meal, and the ticket is the proof. It also
 * meant a guest with no account could rate what they ate.
 *
 * Ownership therefore runs through the order: the tickets belonging to this
 * account, and the reviews left against them. A guest's ratings stay on their
 * device, which is the only place they can be.
 *
 * The device copy is not going away. It answers instantly, works offline, and
 * covers the guest. This is the copy that survives a new browser.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
create or replace function public.my_reviews()
returns table (
  dish_id     text,
  ticket_code text,
  rating      int,
  comment     text,
  created_at  timestamptz
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
  select r.dish_id, r.ticket_code, r.rating, r.comment, r.created_at
    from public.reviews r
    join public.orders o on o.ticket_code = r.ticket_code
   where o.customer_id = auth.uid()
   order by r.created_at desc;
end;
$$;

grant execute on function public.my_reviews() to authenticated;

comment on function public.my_reviews() is
  'The ratings this diner has left, found through the tickets their account owns. Drives the filled-in stars, so they survive a new browser.';
SQL);
    }

    public function down(): void
    {
        DB::unprepared(<<<'SQL'
drop function if exists public.my_reviews();
SQL);
    }
};
