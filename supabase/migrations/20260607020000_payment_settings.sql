-- ============================================================================
-- IT-eary · Phase 2 — Payment Settings
-- ----------------------------------------------------------------------------
-- A single, owner-controlled row describing how diners pay the karinderya:
-- the GCash number, the account name, and a QR image (stored in the
-- `payment-assets` storage bucket). Customers read it at checkout; only the
-- admin can change it.
-- ============================================================================

create table public.payment_settings (
  id              int primary key default 1,
  gcash_enabled   boolean not null default true,
  gcash_name      text    not null default 'K-MARY Karinderya',
  gcash_number    text    not null default '0917 555 0123',
  gcash_qr_url    text,
  cash_enabled    boolean not null default true,
  updated_at      timestamptz not null default now(),
  -- enforce singleton: only the row with id = 1 may ever exist
  constraint payment_settings_singleton check (id = 1)
);

comment on table public.payment_settings is
  'Singleton row (id=1) holding the karinderya''s payment configuration.';

-- Keep updated_at fresh on every change.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger payment_settings_touch
  before update on public.payment_settings
  for each row execute function public.touch_updated_at();

-- Seed the single row so the app always has settings to read.
insert into public.payment_settings (id) values (1)
  on conflict (id) do nothing;

alter table public.payment_settings enable row level security;

-- Read: anyone (diners aren't required to be logged in to see how to pay).
create policy "payment_settings_read_all"
  on public.payment_settings for select
  using (true);

-- Write: admins only.
create policy "payment_settings_admin_update"
  on public.payment_settings for update
  using (public.is_admin())
  with check (public.is_admin());

grant select on public.payment_settings to anon, authenticated;
grant update on public.payment_settings to authenticated;

-- ----------------------------------------------------------------------------
-- Storage RLS for the `payment-assets` bucket (declared in config.toml).
-- Public bucket = anyone can read the QR; only admins may upload/replace it.
-- ----------------------------------------------------------------------------
create policy "payment_assets_public_read"
  on storage.objects for select
  using (bucket_id = 'payment-assets');

create policy "payment_assets_admin_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'payment-assets' and public.is_admin());

create policy "payment_assets_admin_update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'payment-assets' and public.is_admin())
  with check (bucket_id = 'payment-assets' and public.is_admin());

create policy "payment_assets_admin_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'payment-assets' and public.is_admin());
