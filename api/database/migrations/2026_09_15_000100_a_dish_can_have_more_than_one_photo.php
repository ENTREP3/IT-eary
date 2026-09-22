<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * One photograph was never going to be enough to sell a dish.
 *
 * A karinderya sells food that looks like something: the plate, the serving in
 * the platter, the meal with rice next to it. A single column could hold one of
 * those, so the owner had to choose which one lie to tell.
 *
 * Two decisions worth writing down.
 *
 * The photos live in storage and the row keeps only their URLs. The existing
 * column holds a base64 data URI — the two dishes that have a picture carry
 * about 76 KB each inside the row itself, and the menu query reads every dish
 * column. Three photos each across twenty-five dishes would have meant roughly
 * five megabytes downloaded before a diner saw a single price, on a phone, on
 * mobile data, standing in the street. A URL is a few hundred bytes, the
 * browser fetches the image only when it is shown, and it caches it afterwards.
 *
 * `image` is kept, and kept correct, rather than dropped. Every existing read
 * path uses it — the hero, the menu cards, the admin list, the storefront
 * thumbnails, both apps. A trigger keeps it equal to the first photo, so that
 * code goes on working untouched and there is exactly one answer to "what does
 * this dish look like". Old data URIs still sit in the array quite happily;
 * both apps already know how to render either kind.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
alter table public.dishes
  add column if not exists images jsonb not null default '[]'::jsonb;

comment on column public.dishes.images is
  'Ordered photos. The first is the one shown everywhere a single image is; dishes.image mirrors it.';

-- Whatever each dish already had becomes its first photo, so nothing is lost
-- and nothing looks different until somebody adds a second one.
update public.dishes
   set images = jsonb_build_array(image)
 where coalesce(image, '') <> ''
   and images = '[]'::jsonb;

-- ---------------------------------------------------------------------------
-- The single-image column stays true to the list
-- ---------------------------------------------------------------------------
create or replace function public.sync_dish_primary_image()
returns trigger
language plpgsql
as $$
begin
  -- Only when the list is what moved. An older screen still writing to `image`
  -- on its own is honoured, and seeds the list if there is nothing in it.
  if new.images is distinct from old.images then
    new.image := coalesce(new.images ->> 0, '');
  elsif coalesce(new.image, '') <> '' and new.images = '[]'::jsonb then
    new.images := jsonb_build_array(new.image);
  end if;
  return new;
end;
$$;

drop trigger if exists dishes_sync_primary_image on public.dishes;
create trigger dishes_sync_primary_image
  before update on public.dishes
  for each row execute function public.sync_dish_primary_image();

create or replace function public.set_dish_primary_image_on_insert()
returns trigger
language plpgsql
as $$
begin
  if new.images <> '[]'::jsonb then
    new.image := coalesce(new.images ->> 0, '');
  elsif coalesce(new.image, '') <> '' then
    new.images := jsonb_build_array(new.image);
  end if;
  return new;
end;
$$;

drop trigger if exists dishes_set_primary_image on public.dishes;
create trigger dishes_set_primary_image
  before insert on public.dishes
  for each row execute function public.set_dish_primary_image_on_insert();

-- ---------------------------------------------------------------------------
-- Where the photographs actually live
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('dish-photos', 'dish-photos', true)
on conflict (id) do update set public = true;

-- Readable by anybody, because this is the menu. Written only by the owner.
drop policy if exists "dish_photos_public_read" on storage.objects;
create policy "dish_photos_public_read"
  on storage.objects for select
  using (bucket_id = 'dish-photos');

drop policy if exists "dish_photos_admin_insert" on storage.objects;
create policy "dish_photos_admin_insert"
  on storage.objects for insert
  with check (bucket_id = 'dish-photos' and public.is_admin());

drop policy if exists "dish_photos_admin_update" on storage.objects;
create policy "dish_photos_admin_update"
  on storage.objects for update
  using (bucket_id = 'dish-photos' and public.is_admin())
  with check (bucket_id = 'dish-photos' and public.is_admin());

drop policy if exists "dish_photos_admin_delete" on storage.objects;
create policy "dish_photos_admin_delete"
  on storage.objects for delete
  using (bucket_id = 'dish-photos' and public.is_admin());

-- ---------------------------------------------------------------------------
-- How long each photo is held, the owner's call like every other timing
-- ---------------------------------------------------------------------------
update public.business_settings
   set storefront = jsonb_set(
         coalesce(storefront, '{}'::jsonb), '{dish_seconds}', '4'::jsonb, true)
 where id = 1
   and not (coalesce(storefront, '{}'::jsonb) ? 'dish_seconds');
SQL);
    }

    public function down(): void
    {
        DB::unprepared(<<<'SQL'
drop trigger if exists dishes_sync_primary_image on public.dishes;
drop trigger if exists dishes_set_primary_image on public.dishes;
drop function if exists public.sync_dish_primary_image();
drop function if exists public.set_dish_primary_image_on_insert();
alter table public.dishes drop column if exists images;

drop policy if exists "dish_photos_public_read" on storage.objects;
drop policy if exists "dish_photos_admin_insert" on storage.objects;
drop policy if exists "dish_photos_admin_update" on storage.objects;
drop policy if exists "dish_photos_admin_delete" on storage.objects;
SQL);
    }
};
