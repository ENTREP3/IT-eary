-- ============================================================================
-- Bencris · Dish ratings
-- ----------------------------------------------------------------------------
-- Food is bought on trust, and a first-time diner currently has nothing to go
-- on. Ratings used to live in the diner's own browser, which meant nobody else
-- could ever see them, so they were social proof that proved nothing.
--
-- SECURITY — a rating is only accepted against a ticket that was actually
-- settled AND that actually contained the dish. That check runs here, not in
-- the browser, so ratings cannot be manufactured by anyone holding the
-- publishable key. It is the same principle as pricing: the client states an
-- intention, the database decides whether it is true.
--
-- Diners stay anonymous, so there is no account to hang a review off. The
-- ticket code is the proof of purchase, and one ticket may rate a given dish
-- exactly once.
-- ============================================================================

create table public.reviews (
  id          uuid primary key default gen_random_uuid(),
  dish_id     text not null references public.dishes (id) on delete cascade,
  ticket_code text not null,
  rating      int  not null check (rating between 1 and 5),
  comment     text not null default '',
  author_name text,
  created_at  timestamptz not null default now(),

  -- One rating per dish per ticket. Re-rating updates the existing row.
  constraint reviews_one_per_ticket_dish unique (ticket_code, dish_id)
);

create index reviews_dish_idx on public.reviews (dish_id);

alter table public.reviews enable row level security;

-- Anyone may read ratings: that is the entire point of publishing them.
create policy "reviews_read_all" on public.reviews
  for select using (true);

-- Owners can remove abusive content. Nobody else writes directly.
create policy "reviews_admin_delete" on public.reviews
  for delete using (public.is_admin());

grant select on public.reviews to anon, authenticated;
grant delete on public.reviews to authenticated;

comment on table public.reviews is
  'Dish ratings. Insertable only through leave_review(), which verifies the ticket was settled and contained the dish.';

-- ---------------------------------------------------------------------------
-- dish_ratings — the average and count the menu actually displays.
--
-- A view rather than columns on `dishes`: ratings change independently of the
-- menu, and a stored average would need a trigger to stay honest.
-- ---------------------------------------------------------------------------
create view public.dish_ratings as
  select dish_id,
         round(avg(rating)::numeric, 1) as average,
         count(*)::int                  as total
  from public.reviews
  group by dish_id;

grant select on public.dish_ratings to anon, authenticated;

-- ---------------------------------------------------------------------------
-- leave_review() — the only way a rating enters the system.
-- ---------------------------------------------------------------------------
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
  v_code   text := upper(trim(coalesce(p_ticket_code, '')));
  v_order  public.orders;
  v_review public.reviews;
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

  insert into public.reviews (dish_id, ticket_code, rating, comment, author_name)
  values (
    p_dish_id,
    v_code,
    p_rating,
    left(trim(coalesce(p_comment, '')), 500),
    nullif(trim(coalesce(p_author_name, '')), '')
  )
  on conflict (ticket_code, dish_id) do update
    set rating     = excluded.rating,
        comment    = excluded.comment,
        created_at = now()
  returning * into v_review;

  return v_review;
end;
$$;

grant execute on function public.leave_review(text, text, int, text, text) to anon, authenticated;
