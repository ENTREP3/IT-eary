<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * A discount code is worth nothing without an account behind it.
 *
 * The last migration stopped a guest being *told* which promotions were
 * running, but a code they heard about anywhere else still worked. That is the
 * wrong half to close. A promotion is what the shop spends margin on to bring
 * somebody back, and it can only do that if it knows who came — otherwise it is
 * a discount handed to a stranger who leaves no trace and no reason to return.
 *
 * The rule goes in promo_discount_for(), which is the single definition of what
 * a code is worth. Both roads to a discount pass through it — preview_promo()
 * for the quote in the cart, create_ticket() for the price actually charged —
 * so gating it here is what makes it impossible for the two to disagree. A
 * refusal that only lived in the preview would leave a guest quoted a discount
 * the checkout then declined to give, which is worse than never offering it.
 *
 * preview_promo() gets the refusal in words as well, because "invalid" is a lie
 * when the code is perfectly valid and the diner simply is not signed in. It
 * says so, which turns a dead end into a reason to make an account.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
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

  -- The gate. A guest with a session is still a guest: the shop cannot bring
  -- back somebody it cannot recognise next time.
  if not public.is_real_account() then
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

  v_discount := case
    when v_promo.kind = 'percent' then p_subtotal * (v_promo.value / 100.0)
    else v_promo.value
  end;

  if v_promo.max_discount is not null then
    v_discount := least(v_discount, v_promo.max_discount);
  end if;

  -- Never more than the order is worth: a 100-peso code on an 80-peso lunch
  -- takes 80, not 100, and certainly does not owe the diner change.
  return round(least(v_discount, p_subtotal), 2);
end;
$$;

revoke all on function public.promo_discount_for(text, numeric) from public;
grant execute on function public.promo_discount_for(text, numeric) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- The same refusal, in words, before the diner commits to anything
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
  if not public.is_real_account() then
    return query select false, 0::numeric, ''::text,
      'Codes are for account holders. Sign in or make an account to use this one — it takes a moment and the code will still work.'::text;
    return;
  end if;

  select * into v_promo
    from public.promo_codes
   where code = upper(trim(coalesce(p_code, '')));

  if v_promo.code is null then
    return query select false, 0::numeric, ''::text, 'That code does not exist.'::text;
    return;
  end if;

  if not v_promo.active then
    return query select false, 0::numeric, v_promo.label, 'That promo is not running.'::text;
    return;
  end if;

  if v_promo.starts_at > now() then
    return query select false, 0::numeric, v_promo.label, 'That promo has not started yet.'::text;
    return;
  end if;

  if v_promo.ends_at is not null and v_promo.ends_at < now() then
    return query select false, 0::numeric, v_promo.label, 'That promo has ended.'::text;
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

revoke all on function public.preview_promo(text, numeric) from public;
grant execute on function public.preview_promo(text, numeric) to anon, authenticated;
SQL);
    }

    public function down(): void
    {
        // Deliberately not reversed. Putting the discount back within reach of
        // an anonymous caller is a business decision, not a schema rollback,
        // and it should be made on purpose rather than by running `migrate
        // :rollback` on a bad afternoon.
    }
};
