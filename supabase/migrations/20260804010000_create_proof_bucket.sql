-- ============================================================================
-- IT-eary · Create the payment-proofs bucket in SQL
-- ----------------------------------------------------------------------------
-- Buckets declared in supabase/config.toml are only created for the LOCAL
-- Docker stack. `supabase db push` ships migrations, not config, so a hosted
-- project ended up with the storage RLS policies but no bucket for them to
-- guard — and every receipt upload failed with "Bucket not found".
--
-- Buckets are just rows in storage.buckets, so creating it here makes a deploy
-- self-contained: push the migrations and the project is ready.
--
-- Private on purpose. A GCash receipt shows the sender's real name, mobile
-- number and reference; the policies in 20260804000000 are what let staff read
-- them through short-lived signed URLs.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-proofs',
  'payment-proofs',
  false,
  2097152,                                   -- 2 MiB backstop; the apps shrink
                                             -- images to ~100 KB before upload
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
  set public            = excluded.public,
      file_size_limit   = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Same treatment for the QR bucket, which had the same local-only problem.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-assets',
  'payment-assets',
  true,                                      -- public: diners scan the QR
  5242880,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
