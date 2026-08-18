<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Two relationships that always existed in practice but not in the database.
 *
 * 1. dishes.category held text that happened to match categories.name, with
 *    nothing enforcing it. The menu was grouped by string comparison, so a
 *    typo produced a dish in a category that did not exist, and it simply
 *    vanished from the chips with no error anywhere.
 *
 *    ON UPDATE CASCADE is the real prize: renaming a category now renames it on
 *    every dish by itself, which until today needed application code to go and
 *    move them. ON DELETE RESTRICT keeps that application code honest, because
 *    it reassigns dishes before removing a category and the database will now
 *    refuse if it ever forgets.
 *
 * 2. expenses had no link to the ingredient a purchase was for. receive_stock()
 *    books the expense, but the only trace was the label text, so "how much
 *    have I spent on pork this month" could not be answered without parsing
 *    words. The column is nullable because most expenses are not ingredients at
 *    all: rent, gas, a tarpaulin.
 *
 * Checked before writing: all four categories in use match a real row, and no
 * ingredient expenses exist yet, so nothing needs backfilling.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement("
            alter table public.dishes
              add constraint dishes_category_fkey
              foreign key (category) references public.categories (name)
              on update cascade
              on delete restrict
        ");

        DB::statement("
            alter table public.expenses
              add column if not exists inventory_id text
              references public.inventory (id) on delete set null
        ");

        DB::statement("
            comment on column public.expenses.inventory_id is
              'The ingredient this purchase was for, when it was one. NULL for rent, gas and anything else.'
        ");

        // receive_stock() has to record the link it is now able to record.
        // Recreated in full because PL/pgSQL is resolved when it runs.
        DB::unprepared(<<<'SQL'
create or replace function public.receive_stock(
  p_inventory_id text,
  p_quantity     numeric,
  p_unit_cost    numeric default null
)
returns public.inventory
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.inventory;
  v_cost numeric(10,2);
begin
  if not public.is_admin() then
    raise exception 'only the owner may record a delivery';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'how much was delivered?';
  end if;

  select * into v_item from public.inventory where id = p_inventory_id;
  if v_item.id is null then
    raise exception 'no ingredient %', p_inventory_id;
  end if;

  -- Left out means "same price as last time", which is the common case and
  -- should not force the owner to retype a number that has not changed.
  v_cost := coalesce(p_unit_cost, v_item.cost_per_unit);

  update public.inventory
     set stock            = stock + p_quantity,
         cost_per_unit    = v_cost,
         last_received_at = now(),
         last_delivery    = to_char(now(), 'Mon DD')
   where id = p_inventory_id
   returning * into v_item;

  if v_cost > 0 then
    insert into public.inventory_cost_history (inventory_id, cost_per_unit, quantity)
    values (p_inventory_id, v_cost, p_quantity);

    -- The money actually spent, now tied to the ingredient it bought so the
    -- owner can ask what a single ingredient has cost them over a month.
    insert into public.expenses (label, amount, category, spent_on, inventory_id)
    values (
      format('%s, %s %s', v_item.name, round(p_quantity, 2), v_item.unit),
      round(p_quantity * v_cost, 2),
      'Ingredients',
      current_date,
      p_inventory_id
    );
  end if;

  return v_item;
end;
$$;
SQL);
    }

    public function down(): void
    {
        DB::statement('alter table public.dishes drop constraint if exists dishes_category_fkey');
        DB::statement('alter table public.expenses drop column if exists inventory_id');
    }
};
