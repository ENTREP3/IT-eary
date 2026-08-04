-- ============================================================================
-- IT-eary · GCash proof of payment
-- ----------------------------------------------------------------------------
-- Closes the "payment is attested, not verified" gap: the cashier used to tap
-- Paid and the system simply believed them.
--
-- The diner now chooses a payment method at checkout, and a GCash diner uploads
-- a screenshot of their GCash receipt. The cashier sees that image the moment
-- they look the ticket up.
--
-- The counter is never allowed to deadlock over a disputed payment. Three
-- outcomes, so neither side can lose:
--
--   verified      the cashier saw good evidence (screenshot, the live GCash app,
--                 or cash in hand)
--   needs_review  the food is released and the diner is not blocked, but the
--                 sale is flagged for the owner to reconcile later against the
--                 real GCash transaction history
--   unpaid        nothing collected yet
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. orders — the diner's declared method, and the evidence for it
-- ---------------------------------------------------------------------------
alter table public.orders
  add column payment_status     text not null default 'unpaid'
    check (payment_status in ('unpaid', 'verified', 'needs_review')),
  -- Object path inside the PRIVATE payment-proofs bucket. Never a public URL:
  -- a GCash receipt shows the sender's real name, number and reference.
  add column proof_path         text,
  add column proof_uploaded_at  timestamptz,
  add column verified_in_person boolean not null default false,
  add column review_note        text;

comment on column public.orders.payment_status is
  'unpaid | verified | needs_review. needs_review = released to the diner but awaiting owner reconciliation.';
comment on column public.orders.payment_method is
  'Chosen by the diner at checkout; the cashier may switch it (e.g. they pay cash after all).';
comment on column public.orders.proof_path is
  'Path in the private payment-proofs bucket. Read by staff through a signed URL only.';

-- Settled orders are already-verified by definition.
update public.orders set payment_status = 'verified' where paid_at is not null;

create index orders_payment_status_idx on public.orders (payment_status)
  where payment_status = 'needs_review';

-- ---------------------------------------------------------------------------
-- 2. Storage RLS for payment-proofs (bucket declared in config.toml, private)
--
--    Proofs live at  <TICKET_CODE>/<something>.jpg  so path_tokens[1] is the
--    ticket code. Anonymous upload is allowed ONLY against a real, unpaid
--    ticket — otherwise the bucket would be free file hosting for anyone
--    holding the publishable key.
-- ---------------------------------------------------------------------------
-- NOTE: this checks split_part(name, '/', 1) rather than path_tokens[1].
-- path_tokens is a GENERATED column and is not yet computed while an INSERT
-- policy is being evaluated, so matching on it silently rejects every upload.
create policy "payment_proofs_anon_insert"
  on storage.objects for insert
  to anon, authenticated
  with check (
    bucket_id = 'payment-proofs'
    and exists (
      select 1 from public.orders o
      where o.ticket_code = split_part(storage.objects.name, '/', 1)
        and o.paid_at is null
    )
  );

-- Replacing a blurry screenshot: the diner calls clear_payment_proof() first,
-- which nulls proof_path and reopens the window, then uploads under a fresh
-- random filename. Overwriting the same object is therefore never needed.

-- The Storage API performs `INSERT ... RETURNING`, and Postgres requires a
-- SELECT policy to return the new row — without one every upload fails with a
-- confusing "violates row-level security" error even though the INSERT policy
-- passed. So a read policy is unavoidable.
--
-- The danger is enumeration: a row-level read policy also makes `list('')`
-- return the folder names, i.e. the ticket codes of every unpaid order, from
-- which an attacker holding only the publishable key could walk in and download
-- each receipt. That would completely defeat the "you must already know the
-- code" protection. (Revoking storage.search from anon does NOT prevent this —
-- the storage service lists through its own path.)
--
-- So the read is gated on `orders.proof_path IS NULL` — true only in the
-- moment between the object landing and attach_payment_proof() recording it,
-- typically well under a second. Once recorded, nothing under that ticket is
-- anonymously readable or listable ever again.
--
-- The diner never needs to read the file back: their own copy is on the phone.
create policy "payment_proofs_anon_read_pending_only"
  on storage.objects for select
  to anon, authenticated
  using (
    bucket_id = 'payment-proofs'
    and exists (
      select 1 from public.orders o
      where o.ticket_code = split_part(storage.objects.name, '/', 1)
        and o.paid_at is null
        and o.proof_path is null
    )
  );

create policy "payment_proofs_staff_read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'payment-proofs' and public.is_staff());

create policy "payment_proofs_admin_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'payment-proofs' and public.is_admin());

-- ---------------------------------------------------------------------------
-- Block bucket ENUMERATION by anonymous clients.
--
-- The read policy above is row-level, so a plain `list('')` would happily return
-- the folder names — i.e. the ticket codes of every unpaid order — and from
-- there an attacker could read each receipt. That would completely defeat the
-- "you must already know the code" protection.
--
-- Listing is served by storage.search*/list_objects_with_delimiter, so revoking
-- execute from `anon` closes enumeration while leaving upload and direct
-- download working. Staff are `authenticated` and keep full listing.
-- Nothing in either app lists a bucket as an anonymous user.
-- ---------------------------------------------------------------------------
revoke execute on function storage.search(text, text, integer, integer, integer, text, text, text) from anon;
revoke execute on function storage.search_v2(text, text, integer, integer, text, text, text, text) from anon;
revoke execute on function storage.list_objects_with_delimiter(text, text, text, integer, text, text, text) from anon;

-- ---------------------------------------------------------------------------
-- 3. create_ticket() — now records the diner's chosen payment method
-- ---------------------------------------------------------------------------
create or replace function public.create_ticket(
  p_items          jsonb,
  p_customer_name  text default null,
  p_payment_method text default 'cash'
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_items    jsonb := '[]'::jsonb;
  v_total    numeric(10,2) := 0;
  v_code     text;
  v_order    public.orders;
  v_row      record;
  v_method   text := lower(coalesce(p_payment_method, 'cash'));
  v_settings public.payment_settings;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'a ticket needs at least one item';
  end if;

  if v_method not in ('cash', 'gcash') then
    raise exception 'payment method must be cash or gcash';
  end if;

  -- Respect the owner's toggles — don't let a disabled method through.
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
    v_total := v_total + (v_row.price * v_row.qty);
  end loop;

  if jsonb_array_length(v_items) = 0 then
    raise exception 'none of the requested dishes are available';
  end if;

  v_code := public.generate_ticket_code();

  insert into public.orders
    (reference, ticket_code, customer_name, items, total, payment_method, status, payment_status)
  values
    (v_code, v_code, nullif(trim(coalesce(p_customer_name, '')), ''),
     v_items, v_total, v_method, 'pending', 'unpaid')
  returning * into v_order;

  return v_order;
end;
$$;

grant execute on function public.create_ticket(jsonb, text, text) to anon, authenticated;

-- `create or replace` with an extra parameter creates a SECOND overload rather
-- than replacing the original. Two candidates make the RPC ambiguous over
-- PostgREST and every call fails, so retire the 2-argument version.
drop function if exists public.create_ticket(jsonb, text);

-- ---------------------------------------------------------------------------
-- 4. attach_payment_proof() — the diner's only write path for evidence.
--    anon cannot UPDATE orders directly, so this records the uploaded path.
-- ---------------------------------------------------------------------------
create or replace function public.attach_payment_proof(
  p_ticket_code text,
  p_path        text
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code  text := upper(trim(p_ticket_code));
  v_order public.orders;
begin
  select * into v_order from public.orders where ticket_code = v_code for update;

  if v_order.id is null then
    raise exception 'no ticket %', p_ticket_code;
  end if;
  if v_order.paid_at is not null then
    raise exception 'ticket % is already settled', p_ticket_code;
  end if;
  -- The path must sit under this ticket's own folder.
  if split_part(p_path, '/', 1) <> v_code then
    raise exception 'proof path does not belong to ticket %', p_ticket_code;
  end if;

  update public.orders
     set proof_path        = p_path,
         proof_uploaded_at = now()
   where id = v_order.id
   returning * into v_order;

  return v_order;
end;
$$;

grant execute on function public.attach_payment_proof(text, text) to anon, authenticated;

-- Lets a diner swap a blurry screenshot: nulls proof_path so the upload window
-- reopens. Only ever possible while the ticket is unsettled.
create or replace function public.clear_payment_proof(p_ticket_code text)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
begin
  update public.orders
     set proof_path = null, proof_uploaded_at = null
   where ticket_code = upper(trim(p_ticket_code))
     and paid_at is null
   returning * into v_order;

  if v_order.id is null then
    raise exception 'no unsettled ticket %', p_ticket_code;
  end if;

  return v_order;
end;
$$;

grant execute on function public.clear_payment_proof(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. mark_ticket_paid() — records WHICH of the three outs the cashier took
-- ---------------------------------------------------------------------------
create or replace function public.mark_ticket_paid(
  p_ticket_code text,
  p_method      text,
  p_status      text default 'verified',
  p_in_person   boolean default false,
  p_note        text default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
begin
  if not public.is_staff() then
    raise exception 'only staff may record payment';
  end if;

  if p_method not in ('cash', 'gcash') then
    raise exception 'payment method must be cash or gcash';
  end if;

  if p_status not in ('verified', 'needs_review') then
    raise exception 'payment status must be verified or needs_review';
  end if;

  select * into v_order
    from public.orders
   where ticket_code = upper(trim(p_ticket_code))
   for update;

  if v_order.id is null then
    raise exception 'no ticket %', p_ticket_code;
  end if;
  if v_order.status = 'cancelled' then
    raise exception 'ticket % was cancelled', p_ticket_code;
  end if;
  if v_order.paid_at is not null then
    raise exception 'ticket % is already paid', p_ticket_code;
  end if;

  update public.orders
     set status             = 'paid',
         payment_method     = p_method,
         payment_status     = p_status,
         verified_in_person = coalesce(p_in_person, false),
         review_note        = nullif(trim(coalesce(p_note, '')), ''),
         paid_at            = now(),
         paid_by            = auth.uid()
   where id = v_order.id
   returning * into v_order;

  return v_order;
end;
$$;

grant execute on function public.mark_ticket_paid(text, text, text, boolean, text) to authenticated;

-- Drop the old 2-argument signature so callers can't silently use the version
-- that has no notion of payment_status.
drop function if exists public.mark_ticket_paid(text, text);

-- ---------------------------------------------------------------------------
-- 6. resolve_payment_review() — the owner clearing a flagged sale
-- ---------------------------------------------------------------------------
create or replace function public.resolve_payment_review(
  p_ticket_code text,
  p_verified    boolean,
  p_note        text default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
begin
  if not public.is_admin() then
    raise exception 'only the owner may resolve a flagged payment';
  end if;

  update public.orders
     set payment_status = case when p_verified then 'verified' else 'needs_review' end,
         review_note    = nullif(trim(coalesce(p_note, '')), ''),
         status         = case when p_verified then status else 'cancelled' end
   where ticket_code = upper(trim(p_ticket_code))
   returning * into v_order;

  if v_order.id is null then
    raise exception 'no ticket %', p_ticket_code;
  end if;

  return v_order;
end;
$$;

grant execute on function public.resolve_payment_review(text, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. admin_payment_mix() — count SETTLED orders only.
--
--    REGRESSION GUARD: this previously filtered on `payment_method is not null`.
--    That was correct when the column stayed null until a cashier settled the
--    ticket — but the diner now sets it at checkout, so that filter would count
--    every unpaid intention as a sale. Filter on paid_at instead.
-- ---------------------------------------------------------------------------
create or replace function public.admin_payment_mix(p_days int default 7)
returns table (method text, order_count bigint, revenue numeric)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admins only';
  end if;

  return query
    select o.payment_method,
           count(*)::bigint,
           coalesce(sum(o.total), 0)::numeric
    from public.orders o
    where o.created_at >= now() - make_interval(days => p_days)
      and o.paid_at is not null
    group by o.payment_method;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. storage_usage() — free tier is 1 GB, and proofs are kept indefinitely,
--    so the owner gets a readout rather than a silent surprise.
-- ---------------------------------------------------------------------------
create or replace function public.storage_usage()
returns table (bucket text, object_count bigint, bytes bigint)
language plpgsql
security definer
set search_path = public, storage
as $$
begin
  if not public.is_admin() then
    raise exception 'admins only';
  end if;

  return query
    select o.bucket_id::text,
           count(*)::bigint,
           coalesce(sum((o.metadata ->> 'size')::bigint), 0)::bigint
    from storage.objects o
    group by o.bucket_id;
end;
$$;

grant execute on function public.storage_usage() to authenticated;
