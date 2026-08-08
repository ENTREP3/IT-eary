-- ============================================================================
-- Bencris · Where the app lives, so the owner can print a QR for it
-- ----------------------------------------------------------------------------
-- The plan is a printed code taped to the wall and to the menu: a diner waiting
-- for their food scans it and installs the app. For that to survive the site
-- moving hosts, the address has to be something the owner can change, not a
-- constant compiled into a build nobody at the karinderya can rebuild.
--
-- Kept on business_settings rather than in its own table because it is one more
-- fact about the shop, and the Shop screen already loads that row.
-- ============================================================================

alter table public.business_settings
  add column app_download_url text not null default '';

comment on column public.business_settings.app_download_url is
  'Address the printed QR code points at. Empty means the poster is not ready to print yet.';
