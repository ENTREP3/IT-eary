-- ============================================================================
-- Bencris · "Goes well with"
-- ----------------------------------------------------------------------------
-- The suggestion is computed from what diners have actually bought together,
-- not from a list somebody curated. That matters for a karinderya: the owner
-- has no time to maintain pairings, and the real answer changes with the
-- seasons anyway. Sinigang and rice will surface on their own.
--
-- Only settled tickets count. An abandoned or unpaid order is an intention,
-- and intentions would teach the suggestion the wrong thing.
-- ============================================================================

create view public.dish_pairings as
with sold as (
  select o.id as order_id, (item ->> 'id') as dish_id
    from public.orders o,
         lateral jsonb_array_elements(o.items) as item
   where o.paid_at is not null
),
pairs as (
  select a.dish_id as dish_id,
         b.dish_id as with_dish_id,
         count(*)::int as times_together
    from sold a
    join sold b on a.order_id = b.order_id and a.dish_id <> b.dish_id
   group by a.dish_id, b.dish_id
)
select p.dish_id,
       p.with_dish_id,
       p.times_together,
       row_number() over (partition by p.dish_id order by p.times_together desc) as rank
  from pairs p
  join public.dishes d on d.id = p.with_dish_id
 where d.available;

grant select on public.dish_pairings to anon, authenticated;

comment on view public.dish_pairings is
  'Dishes bought together on settled tickets, most frequent first. Drives the "goes well with" suggestion.';
