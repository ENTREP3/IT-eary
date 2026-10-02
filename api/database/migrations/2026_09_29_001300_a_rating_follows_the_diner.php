<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * What this diner has rated, from the shop rather than from their browser.
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
