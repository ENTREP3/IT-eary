-- ============================================================================
-- Bencris · Letting the owner choose what the storefront shows off
-- ----------------------------------------------------------------------------
-- The front page decided for itself what to highlight: whatever sold most, and
-- whatever was running low. Both are computed from figures the system already
-- has, which makes them honest but also completely deaf to the owner.
--
-- An owner knows things the numbers do not. Today's kaldereta came out
-- especially well. The kambing has to move before it turns. A dish is new and
-- nobody has ordered it yet, so by definition it will never be a bestseller and
-- never be promoted. That last one is a trap: a purely automatic front page can
-- only ever advertise what is already popular.
--
-- So the owner gets one deliberate lever, and the automatic badges stay.
-- ============================================================================

alter table public.dishes
  add column if not exists featured boolean not null default false;

comment on column public.dishes.featured is
  'Owner has chosen to show this off on the storefront, regardless of what the sales figures say.';

-- Only the owner decides what gets promoted, the same as prices. The read side
-- is already public, because the storefront has to show it to strangers.
create index if not exists dishes_featured_idx on public.dishes (featured)
  where featured;

insert into supabase_migrations.schema_migrations (version)
values ('20260816000000')
on conflict (version) do nothing;
