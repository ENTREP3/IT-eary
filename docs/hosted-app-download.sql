-- ============================================================================
-- Bencris · One column, for the printed QR poster
-- ----------------------------------------------------------------------------
-- Run this in the hosted project's SQL Editor, after hosted-setup.sql.
--
-- The Shop screen now has a "Poster for the wall" section that generates a QR
-- code and prints it. It needs somewhere to keep the address that code points
-- at, so the poster survives the site moving hosts without anyone rebuilding
-- the app.
--
-- Safe to run twice: the guard skips it if the column is already there.
-- ============================================================================

alter table public.business_settings
  add column if not exists app_download_url text not null default '';

comment on column public.business_settings.app_download_url is
  'Address the printed QR code points at. Empty means the poster is not ready to print yet.';

insert into supabase_migrations.schema_migrations (version)
values ('20260814000000')
on conflict (version) do nothing;

select app_download_url, tagline from public.business_settings where id = 1;
