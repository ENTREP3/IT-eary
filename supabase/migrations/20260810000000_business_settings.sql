-- ============================================================================
-- Bencris · The shop's own details, owned by the owner
-- ----------------------------------------------------------------------------
-- The shop name, address, opening hours and contact number were hardcoded in a
-- source file. That meant the single most important information on the site,
-- and the only part a customer needs to actually turn up, could not be changed
-- without a developer. For a client with no technical staff that is a defect,
-- not a detail.
--
-- One row, id = 1, same shape as payment_settings. Anyone may read it because
-- the landing page and the trust pages are public; only the owner may write.
-- ============================================================================

create table public.business_settings (
  id            int primary key default 1 check (id = 1),
  name          text not null default 'Bencris',
  tagline       text not null default 'Kain mga sir!!',
  blurb         text not null default '',

  address_line  text not null default '',
  district      text not null default '',
  city          text not null default '',
  province      text not null default '',

  phone         text not null default '',
  email         text not null default '',

  -- Opening hours as [{days, opens, closes}], so the owner can have as many
  -- rows as the week actually needs rather than a fixed weekday/weekend pair.
  hours         jsonb not null default '[]'::jsonb,

  updated_at    timestamptz not null default now()
);

alter table public.business_settings enable row level security;

create policy "business_settings_read_all"
  on public.business_settings for select using (true);

create policy "business_settings_admin_write"
  on public.business_settings for all
  using (public.is_admin()) with check (public.is_admin());

grant select on public.business_settings to anon, authenticated;
grant insert, update on public.business_settings to authenticated;

-- Seeded with the placeholders that were previously in the source file, so the
-- owner can see exactly what still needs their real details.
insert into public.business_settings
  (id, name, tagline, blurb, address_line, district, city, province, phone, email, hours)
values (
  1,
  'Bencris',
  'Kain mga sir!!',
  'Home-cooked Filipino food served fresh every day in Dasmariñas Bayan. Check what is actually cooking before you make the trip.',
  '[Stall number and building]',
  'Dasmariñas Bayan',
  'Dasmariñas',
  'Cavite',
  '[09XX XXX XXXX]',
  '',
  '[{"days":"Monday to Saturday","opens":"6:00 AM","closes":"8:00 PM"},
    {"days":"Sunday","opens":"6:00 AM","closes":"2:00 PM"}]'::jsonb
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Staff administration
--
-- promote_to_admin and promote_to_cashier already exist, but there was no way
-- to see who holds what, and no way to take a role away when someone leaves.
-- ---------------------------------------------------------------------------
create or replace function public.list_staff()
returns table (id uuid, email text, full_name text, role text, created_at timestamptz)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_admin() then
    raise exception 'owners only';
  end if;

  return query
    select p.id, u.email::text, p.full_name, p.role::text, p.created_at
      from public.profiles p
      join auth.users u on u.id = p.id
     where p.role in ('admin', 'cashier')
     order by p.role, u.email;
end;
$$;

grant execute on function public.list_staff() to authenticated;

/**
 * Takes a staff role away without deleting the account, so somebody who leaves
 * simply becomes an ordinary customer and their history stays intact.
 *
 * Refuses to demote the last owner, otherwise the shop could lock itself out
 * of its own dashboard permanently.
 */
create or replace function public.revoke_staff(target_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id    uuid;
  v_role  text;
  v_owners int;
begin
  if not public.is_admin() then
    raise exception 'owners only';
  end if;

  select u.id, p.role::text into v_id, v_role
    from auth.users u join public.profiles p on p.id = u.id
   where u.email = target_email;

  if v_id is null then
    raise exception 'no account for %', target_email;
  end if;

  if v_role = 'admin' then
    select count(*) into v_owners from public.profiles where role = 'admin';
    if v_owners <= 1 then
      raise exception 'this is the only owner account, so its access cannot be removed';
    end if;
  end if;

  update public.profiles set role = 'customer' where id = v_id;
end;
$$;

grant execute on function public.revoke_staff(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Review moderation
--
-- The delete policy already allowed the owner to remove a review; there was no
-- way to read them all in one place to decide.
-- ---------------------------------------------------------------------------
create or replace function public.all_reviews()
returns table (
  id uuid, dish_id text, dish_name text, ticket_code text,
  rating int, comment text, created_at timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_admin() then
    raise exception 'owners only';
  end if;

  return query
    select r.id, r.dish_id, d.name, r.ticket_code, r.rating, r.comment, r.created_at
      from public.reviews r
      join public.dishes d on d.id = r.dish_id
     order by r.created_at desc;
end;
$$;

grant execute on function public.all_reviews() to authenticated;
