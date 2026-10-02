<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * The shop's own proof that it sent a refund.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
alter table public.refunds
  add column if not exists proof_path text,
  add column if not exists proof_uploaded_at timestamptz;

comment on column public.refunds.proof_path is
  'Object path in the private payment-proofs bucket, under refunds/. The shop''s evidence that the transfer was sent. Read by staff through a signed URL only.';

-- ---------------------------------------------------------------------------
-- Staff may upload under refunds/
drop policy if exists "refund_proofs_staff_insert" on storage.objects;
create policy "refund_proofs_staff_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'payment-proofs'
    and split_part(storage.objects.name, '/', 1) = 'refunds'
    and public.is_staff()
  );

-- Reading is already covered: payment_proofs_staff_read admits any object in
-- this bucket to staff, and deletion is already owner-only. Nothing to add.

-- ---------------------------------------------------------------------------
-- Attaching it to the refund
-- ---------------------------------------------------------------------------
create or replace function public.attach_refund_proof(
  p_ticket_code text,
  p_path        text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
begin
  if not public.is_staff() then
    raise exception 'only staff may attach refund proof';
  end if;

  if coalesce(btrim(p_path), '') = '' then
    raise exception 'no file was given';
  end if;

  -- The path must be one this function would have allowed to be uploaded, so
  -- a row cannot be made to point at somebody's payment screenshot.
  if split_part(btrim(p_path), '/', 1) <> 'refunds' then
    raise exception 'that file is not a refund proof';
  end if;

  select id into v_order_id from public.orders
   where ticket_code = upper(btrim(p_ticket_code));

  if v_order_id is null then
    raise exception 'no ticket %', p_ticket_code;
  end if;

  -- The most recent refund on this ticket. A ticket can only be refunded once
  -- — refund_order refuses a second — so there is exactly one to find.
  update public.refunds
     set proof_path = btrim(p_path),
         proof_uploaded_at = now()
   where id = (
     select id from public.refunds
      where order_id = v_order_id
      order by issued_at desc
      limit 1
   );

  if not found then
    raise exception 'ticket % has not been refunded', p_ticket_code;
  end if;
end;
$$;

revoke all on function public.attach_refund_proof(text, text) from public, anon;
grant execute on function public.attach_refund_proof(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Reading a refund back, with its proof
-- ---------------------------------------------------------------------------
create or replace function public.refund_for(p_ticket_code text)
returns table (
  id                uuid,
  amount            numeric,
  method            text,
  reason            text,
  note              text,
  proof_path        text,
  proof_uploaded_at timestamptz,
  issued_at         timestamptz,
  issued_by_name    text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'only staff may read refunds';
  end if;

  return query
  select r.id, r.amount, r.method, r.reason, r.note,
         r.proof_path, r.proof_uploaded_at, r.issued_at,
         coalesce(p.full_name, p.username) as issued_by_name
    from public.refunds r
    join public.orders o on o.id = r.order_id
    left join public.profiles p on p.id = r.issued_by
   where o.ticket_code = upper(btrim(p_ticket_code))
   order by r.issued_at desc;
end;
$$;

grant execute on function public.refund_for(text) to authenticated;
SQL);
    }

    public function down(): void
    {
        DB::unprepared(<<<'SQL'
drop function if exists public.refund_for(text);
drop function if exists public.attach_refund_proof(text, text);
drop policy if exists "refund_proofs_staff_insert" on storage.objects;

alter table public.refunds
  drop column if exists proof_uploaded_at,
  drop column if exists proof_path;
SQL);
    }
};
