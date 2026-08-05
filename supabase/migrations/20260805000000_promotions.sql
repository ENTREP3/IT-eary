-- ============================================================================
-- Bencris · Promotional codes
-- ----------------------------------------------------------------------------
-- A karinderya's cheapest marketing lever: "SULIT10 for 10% off merienda".
-- Free to run, no ad spend, and it gives the owner a measurable reason for a
-- diner to come back.
--
-- SECURITY — the discount is computed HERE, never accepted from the client.
-- This is the same rule that already governs prices in create_ticket(): the
-- app sends a code string, and Postgres decides what (if anything) it is worth.
-- A tampered client that posts {"discount": 5000} changes nothing, because no
-- caller has an INSERT grant on orders and create_ticket ignores the field.
--
-- Redemption is counted inside the same transaction that inserts the order, so
-- a limited-run promo cannot be over-redeemed by two diners checking out at the
-- same moment (the UPDATE ... WHERE used_count < usage_limit takes the row lock).
-- ============================================================================

create table public.promo_codes (
  code         text primary key,
  label        text not null default '',
  -- 'percent' → value is 0-100. 'fixed' → value is pesos off the subtotal.
  kind         text not null check (kind in ('percent', 'fixed')),
  value        numeric(10,2) not null check (value > 0),
  -- Guards the owner's margin: a promo can require a minimum spend, and a
  -- percentage promo can be capped in pesos.
  min_subtotal numeric(10,2) not null default 0 check (min_subtotal >= 0),
  max_discount numeric(10,2) check (max_discount is null or max_discount > 0),
  starts_at    timestamptz not null default now(),
  ends_at      timestamptz,
  -- NULL = unlimited redemptions.
  usage_limit  int check (usage_limit is null or usage_limit > 0),
  used_count   int not null default 0 check (used_count >= 0),
  active       boolean not null default true,
  created_at   timestamptz not null default now(),

  constraint promo_percent_range
    check (kind <> 'percent' or value <= 100)
);

alter table public.promo_codes enable row level security;

-- Diners may READ active promos — these are advertised on the storefront and on
-- the tarpaulin outside, so the code is not a secret. What the code is *worth*
-- is still decided server-side, which is the part that matters.
create policy "promo_codes_read_active"
  on public.promo_codes for select
  using (active or public.is_staff());

create policy "promo_codes_admin_write"
  on public.promo_codes for all
  using (public.is_admin()) with check (public.is_admin());

grant select on public.promo_codes to anon, authenticated;
grant insert, update, delete on public.promo_codes to authenticated;

comment on table public.promo_codes is
  'Owner-defined discounts. Only create_ticket() may redeem one; the value is never taken from the client.';

-- ---------------------------------------------------------------------------
-- orders — keep the arithmetic auditable.
--
-- `total` stays what the diner actually owes, so every existing reader (the
-- cashier screen, the receipt, the analytics dashboard) keeps working untouched.
-- subtotal and discount are added alongside it so a settled sale can always be
-- explained: subtotal - discount = total.
-- ---------------------------------------------------------------------------
alter table public.orders
  add column subtotal   numeric(10,2) not null default 0 check (subtotal >= 0),
  add column discount   numeric(10,2) not null default 0 check (discount >= 0),
  add column promo_code text references public.promo_codes (code) on delete set null;

-- Backfill: every historical order predates promos, so it was sold at list price.
update public.orders set subtotal = total where subtotal = 0;

comment on column public.orders.subtotal is 'Menu price of the items before any discount.';
comment on column public.orders.discount is 'Pesos taken off by promo_code. subtotal - discount = total.';

-- ---------------------------------------------------------------------------
-- promo_discount_for() — the single definition of what a code is worth.
--
-- Deliberately a pure function of (code, subtotal): create_ticket() calls it to
-- charge, and preview_promo() calls it to display. One implementation means the
-- cart can never quote a discount the checkout then refuses to honour.
--
-- Returns 0 for anything invalid rather than raising, so a mistyped code is a
-- quiet "that didn't work" in the UI and not a failed checkout.
-- ---------------------------------------------------------------------------
create or replace function public.promo_discount_for(
  p_code     text,
  p_subtotal numeric
)
returns numeric
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_promo    public.promo_codes;
  v_discount numeric(10,2);
begin
  if p_code is null or trim(p_code) = '' then
    return 0;
  end if;

  select * into v_promo
    from public.promo_codes
   where code = upper(trim(p_code));

  if v_promo.code is null
     or not v_promo.active
     or v_promo.starts_at > now()
     or (v_promo.ends_at is not null and v_promo.ends_at < now())
     or (v_promo.usage_limit is not null and v_promo.used_count >= v_promo.usage_limit)
     or p_subtotal < v_promo.min_subtotal
  then
    return 0;
  end if;

  v_discount := case v_promo.kind
                  when 'percent' then p_subtotal * v_promo.value / 100
                  else v_promo.value
                end;

  if v_promo.max_discount is not null then
    v_discount := least(v_discount, v_promo.max_discount);
  end if;

  -- Never hand out more than the order is worth: a ₱50-off code on a ₱35 order
  -- discounts ₱35, not ₱50. Without this the total could go negative.
  return round(least(v_discount, p_subtotal), 2);
end;
$$;

grant execute on function public.promo_discount_for(text, numeric) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- preview_promo() — what the cart screen calls as the diner types a code.
--
-- Returns the reason on failure so the UI can say "spend ₱50 more" instead of
-- a flat "invalid", which is the difference between an abandoned cart and a
-- bigger one.
-- ---------------------------------------------------------------------------
create or replace function public.preview_promo(
  p_code     text,
  p_subtotal numeric default 0
)
returns table (valid boolean, discount numeric, label text, reason text)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_promo    public.promo_codes;
  v_discount numeric(10,2);
begin
  select * into v_promo from public.promo_codes where code = upper(trim(coalesce(p_code, '')));

  if v_promo.code is null then
    return query select false, 0::numeric, ''::text, 'That code does not exist.'::text;
    return;
  end if;

  if not v_promo.active
     or v_promo.starts_at > now()
     or (v_promo.ends_at is not null and v_promo.ends_at < now())
  then
    return query select false, 0::numeric, v_promo.label, 'That promo is not running right now.'::text;
    return;
  end if;

  if v_promo.usage_limit is not null and v_promo.used_count >= v_promo.usage_limit then
    return query select false, 0::numeric, v_promo.label, 'That promo has been fully claimed.'::text;
    return;
  end if;

  if p_subtotal < v_promo.min_subtotal then
    return query select false, 0::numeric, v_promo.label,
      format('Spend at least %s to use this.', to_char(v_promo.min_subtotal, 'FM999999.00'))::text;
    return;
  end if;

  v_discount := public.promo_discount_for(v_promo.code, p_subtotal);
  return query select true, v_discount, v_promo.label, ''::text;
end;
$$;

grant execute on function public.preview_promo(text, numeric) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- create_ticket() — now prices, discounts, and redeems in one transaction.
--
-- The redemption UPDATE carries its own `used_count < usage_limit` guard. Two
-- diners racing for the last redemption of a 50-use promo therefore serialise
-- on the row lock, and the loser is charged full price rather than both being
-- let through.
-- ---------------------------------------------------------------------------
create or replace function public.create_ticket(
  p_items          jsonb,
  p_customer_name  text default null,
  p_payment_method text default 'cash',
  p_promo_code     text default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_items    jsonb := '[]'::jsonb;
  v_subtotal numeric(10,2) := 0;
  v_discount numeric(10,2) := 0;
  v_code     text;
  v_promo    text := nullif(upper(trim(coalesce(p_promo_code, ''))), '');
  v_order    public.orders;
  v_row      record;
  v_method   text := lower(coalesce(p_payment_method, 'cash'));
  v_settings public.payment_settings;
  v_claimed  int;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'a ticket needs at least one item';
  end if;

  if v_method not in ('cash', 'gcash') then
    raise exception 'payment method must be cash or gcash';
  end if;

  select * into v_settings from public.payment_settings where id = 1;
  if v_method = 'gcash' and not coalesce(v_settings.gcash_enabled, true) then
    raise exception 'GCash is not being accepted right now';
  end if;
  if v_method = 'cash' and not coalesce(v_settings.cash_enabled, true) then
    raise exception 'cash is not being accepted right now';
  end if;

  -- Resolve every line against the live menu, collapsing duplicate ids.
  for v_row in
    select d.id,
           d.name,
           d.price,
           sum(greatest(1, coalesce((item ->> 'qty')::int, 1)))::int as qty
    from jsonb_array_elements(p_items) as item
    join public.dishes d on d.id = item ->> 'id'
    where d.available
    group by d.id, d.name, d.price
  loop
    v_items := v_items || jsonb_build_object(
      'id', v_row.id, 'name', v_row.name, 'qty', v_row.qty, 'price', v_row.price
    );
    v_subtotal := v_subtotal + (v_row.price * v_row.qty);
  end loop;

  if jsonb_array_length(v_items) = 0 then
    raise exception 'none of the requested dishes are available';
  end if;

  -- Claim the redemption first. If the guard fails the promo was exhausted
  -- between the diner's preview and this insert, so they simply pay list price.
  if v_promo is not null then
    v_discount := public.promo_discount_for(v_promo, v_subtotal);

    if v_discount > 0 then
      update public.promo_codes
         set used_count = used_count + 1
       where code = v_promo
         and (usage_limit is null or used_count < usage_limit);

      get diagnostics v_claimed = row_count;
      if v_claimed = 0 then
        v_discount := 0;
        v_promo    := null;
      end if;
    else
      v_promo := null;
    end if;
  end if;

  v_code := public.generate_ticket_code();

  insert into public.orders
    (reference, ticket_code, customer_name, items,
     subtotal, discount, promo_code, total,
     payment_method, status, payment_status)
  values
    (v_code, v_code, nullif(trim(coalesce(p_customer_name, '')), ''), v_items,
     v_subtotal, v_discount, v_promo, v_subtotal - v_discount,
     v_method, 'pending', 'unpaid')
  returning * into v_order;

  return v_order;
end;
$$;

grant execute on function public.create_ticket(jsonb, text, text, text) to anon, authenticated;

-- Same trap as the previous migration: adding a defaulted parameter creates a
-- SECOND overload instead of replacing the old one, and two candidates make the
-- RPC ambiguous over PostgREST. Retire the 3-argument version.
drop function if exists public.create_ticket(jsonb, text, text);

-- ---------------------------------------------------------------------------
-- Launch promos. Deliberately modest — this is a karinderya, not a mall sale.
-- ---------------------------------------------------------------------------
insert into public.promo_codes (code, label, kind, value, min_subtotal, max_discount, usage_limit)
values
  ('SULIT10',  '10% off, merienda promo',        'percent', 10, 100, 30,  null),
  ('BAGONG20', '20 pesos off your first order',        'fixed',   20, 120, null, 200),
  ('BALIKBAYAN','15 pesos off, salamat sa pagbalik', 'fixed',   15, 90,  null, null)
on conflict (code) do nothing;
