import React, { useEffect, useState } from 'react';
import { ChefHat, Loader2, Plus, Trash2, TriangleAlert } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useConfirm } from '../shared/useConfirm';
import { useKarinderyaStore } from '../../store/karinderyaStore';

/**
 * The link between the menu and the store room.
 *
 * A dish's recipe is recorded per BATCH, the way a cook actually thinks: one
 * pot of sinigang takes a kilo and a half of pork and feeds twenty. Recording
 * that a batch was cooked is the only thing that draws ingredients out of the
 * inventory, which is why the numbers stay honest: selling a serving lowers the
 * servings left, cooking lowers the ingredients, and the two never overlap.
 */

type RecipeRow = { inventory_id: string; quantity: number };

export function RecipePanel({ dishId, dishName }: { dishId: string; dishName: string }) {
  const confirm = useConfirm();
  const inventory = useKarinderyaStore((s) => s.inventory);
  const loadAll = useKarinderyaStore((s) => s.loadAll);

  const [rows, setRows] = useState<RecipeRow[]>([]);
  const [yieldPerBatch, setYieldPerBatch] = useState(10);
  const [canCook, setCanCook] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

  const [newItem, setNewItem] = useState('');
  const [newQty, setNewQty] = useState('1');
  const [batches, setBatches] = useState('1');

  const load = async () => {
    const [recipe, dish, cookable] = await Promise.all([
      supabase.from('recipe_items').select('inventory_id, quantity').eq('dish_id', dishId),
      supabase.from('dishes').select('batch_yield').eq('id', dishId).single(),
      supabase.rpc('can_cook', { p_dish_id: dishId }),
    ]);
    setRows((recipe.data ?? []) as RecipeRow[]);
    if (dish.data) setYieldPerBatch(dish.data.batch_yield ?? 10);
    setCanCook(cookable.data === null ? null : Number(cookable.data));
    setLoading(false);
  };

  useEffect(() => {
    setLoading(true);
    load();
  }, [dishId]);

  const unitOf = (id: string) => inventory.find((i) => i.id === id)?.unit ?? '';
  const nameOf = (id: string) => inventory.find((i) => i.id === id)?.name ?? id;
  const stockOf = (id: string) => inventory.find((i) => i.id === id)?.stock ?? 0;

  const addRow = async () => {
    if (!newItem || !Number(newQty)) return;
    setBusy(true);
    const { error } = await supabase
      .from('recipe_items')
      .upsert({ dish_id: dishId, inventory_id: newItem, quantity: Number(newQty) });
    setBusy(false);
    if (error) return setMessage({ tone: 'bad', text: error.message });
    setNewItem('');
    setNewQty('1');
    load();
  };

  const removeRow = async (inventoryId: string) => {
    await supabase.from('recipe_items').delete().eq('dish_id', dishId).eq('inventory_id', inventoryId);
    load();
  };

  const saveYield = async (n: number) => {
    setYieldPerBatch(n);
    await supabase.from('dishes').update({ batch_yield: n }).eq('id', dishId);
  };

  const cook = async () => {
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.rpc('cook_batch', {
      p_dish_id: dishId,
      p_batches: Number(batches) || 1,
    });
    setBusy(false);
    if (error) return setMessage({ tone: 'bad', text: error.message });
    setMessage({
      tone: 'ok',
      text: `Cooked. ${yieldPerBatch * (Number(batches) || 1)} servings added, ingredients deducted.`,
    });
    await Promise.all([load(), loadAll()]);
  };

  const field =
    'h-9 rounded-lg border px-2.5 text-sm outline-none bg-[#0f1410] border-[#e8dfc8]/15 text-[#e8dfc8] focus:border-[#e8a84a]/60';

  if (loading) {
    return (
      <div className="py-6 grid place-items-center opacity-50">
        <Loader2 className="animate-spin" size={16} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="opacity-60">One batch feeds</span>
          <input
            type="number"
            min={1}
            value={yieldPerBatch}
            onChange={(e) => saveYield(Number(e.target.value) || 1)}
            className={`${field} w-20`}
          />
          <span className="opacity-60">servings</span>
        </label>
        {canCook !== null && rows.length > 0 && (
          <span
            className={`text-xs px-2.5 py-1 rounded-full border ${
              canCook > 0
                ? 'border-[#8cc07a]/45 text-[#8cc07a]'
                : 'border-[#e87a5c]/50 text-[#e87a5c]'
            }`}
          >
            {canCook > 0
              ? `Enough ingredients for ${canCook} more ${canCook === 1 ? 'batch' : 'batches'}`
              : 'Not enough ingredients to cook this'}
          </span>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm opacity-55 flex items-center gap-2">
          <TriangleAlert size={14} className="text-[#e8a84a]" />
          No recipe yet, so cooking this dish will not draw anything from the inventory.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r) => {
            const short = stockOf(r.inventory_id) < r.quantity;
            return (
              <li
                key={r.inventory_id}
                className="flex items-center gap-3 text-sm py-1.5 border-b border-[#e8dfc8]/8"
              >
                <span className="flex-1">{nameOf(r.inventory_id)}</span>
                <span className="tabular-nums opacity-80">
                  {r.quantity} {unitOf(r.inventory_id)}
                </span>
                <span className={`text-xs tabular-nums ${short ? 'text-[#e87a5c]' : 'opacity-45'}`}>
                  {stockOf(r.inventory_id)} in stock
                </span>
                <button
                  onClick={() =>
                    confirm({
                      title: 'Remove this ingredient from the recipe?',
                      body: 'Cooking a batch will stop deducting it, and the dish cost changes.',
                      action: 'Remove it',
                      danger: true,
                      onConfirm: () => removeRow(r.inventory_id),
                    })
                  }
                  className="opacity-40 hover:opacity-100 hover:text-[#e87a5c]"
                  aria-label={`Remove ${nameOf(r.inventory_id)}`}
                >
                  <Trash2 size={14} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* ------------------------------------------------------ add line */}
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex-1 min-w-[180px]">
          <span className="text-[11px] opacity-55 block mb-1">Ingredient</span>
          <select value={newItem} onChange={(e) => setNewItem(e.target.value)} className={`${field} w-full`}>
            <option value="">Choose from inventory</option>
            {inventory
              .filter((i) => !rows.some((r) => r.inventory_id === i.id))
              .map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          <span className="text-[11px] opacity-55 block mb-1">Per batch</span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={newQty}
            onChange={(e) => setNewQty(e.target.value)}
            className={`${field} w-24`}
          />
        </label>
        <button
          onClick={addRow}
          disabled={busy || !newItem}
          className="h-9 px-3 rounded-lg border border-[#e8dfc8]/20 text-sm inline-flex items-center gap-1.5 disabled:opacity-40"
        >
          <Plus size={14} /> Add
        </button>
      </div>

      {/* --------------------------------------------------- cook a batch */}
      <div className="pt-3 border-t border-[#e8dfc8]/10 flex flex-wrap items-end gap-2">
        <label>
          <span className="text-[11px] opacity-55 block mb-1">Batches cooked</span>
          <input
            type="number"
            min="1"
            step="1"
            value={batches}
            onChange={(e) => setBatches(e.target.value)}
            className={`${field} w-24`}
          />
        </label>
        <button
          onClick={cook}
          disabled={busy || rows.length === 0}
          className="h-9 px-4 rounded-lg bg-[#e8a84a] text-[#0a0d0a] text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <ChefHat size={15} />}
          Record cooking
        </button>
        <span className="text-xs opacity-45">
          Adds {yieldPerBatch * (Number(batches) || 1)} servings of {dishName} and deducts the
          ingredients.
        </span>
      </div>

      {message && (
        <p className={`text-sm ${message.tone === 'ok' ? 'text-[#8cc07a]' : 'text-[#e87a5c]'}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
