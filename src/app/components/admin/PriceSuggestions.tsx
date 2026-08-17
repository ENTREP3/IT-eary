import React, { useCallback, useEffect, useState } from 'react';
import { Check, Loader2, TrendingUp, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';

/**
 * Tells the owner when an ingredient price has quietly eaten their margin.
 *
 * Ingredient prices move and menu prices do not. Pork going from 300 to 350 a
 * kilo takes the profit out of every pork dish, and without this the owner finds
 * out weeks later when the takings look wrong and nobody can say why.
 *
 * The arithmetic is done in the database, from the recipes that already exist:
 * one batch of sinigang uses 1.5 kg of pork and feeds twenty, so the cost per
 * serving follows from the price per kilo. Nothing is typed twice.
 *
 * It only ever SUGGESTS. Pricing is the owner's call, because they know the
 * competitor down the road and the suki who would notice a five peso rise. Both
 * buttons re-baseline the cost, so declining makes the row go away instead of
 * nagging on every visit, which is how owners learn to ignore a warning.
 */

type Suggestion = {
  dish_id: string;
  dish_name: string;
  price: number;
  cost_now: number;
  cost_before: number;
  margin_now: number;
  margin_before: number;
  suggested: number;
};

const peso = (n: number) => `₱${Number(n).toFixed(2)}`;

export function PriceSuggestions() {
  const [rows, setRows] = useState<Suggestion[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('price_suggestions');
    if (error) {
      // Most likely the migration has not been applied to this project yet.
      // Staying quiet is right: this is an extra, not something the dashboard
      // should break over.
      setRows([]);
      return;
    }
    setRows((data ?? []) as Suggestion[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const decide = async (dishId: string, price: number | null) => {
    setBusy(dishId);
    setError(null);
    const { error } = await supabase.rpc('confirm_dish_price', {
      p_dish_id: dishId,
      p_price: price,
    });
    setBusy(null);
    if (error) {
      setError(error.message);
      return;
    }
    await load();
  };

  if (!rows || rows.length === 0) return null;

  return (
    <section className="rounded-2xl border border-[#e8a84a]/30 bg-[#e8a84a]/[0.06] p-5">
      <div className="flex items-center gap-2 mb-1">
        <TrendingUp size={16} className="text-[#e8a84a]" />
        <h3 className="text-sm font-medium">Ingredients went up</h3>
      </div>
      <p className="text-[12px] opacity-60 mb-4 max-w-xl leading-relaxed">
        These dishes cost more to make than when you last set their price. The
        suggested price keeps the same margin you were making before. You decide.
      </p>

      {error && (
        <div className="text-sm rounded-lg px-3 py-2 mb-3 bg-[#c8442a]/20 text-[#e87a5c]">{error}</div>
      )}

      <div className="space-y-2">
        {rows.map((r) => (
          <div
            key={r.dish_id}
            className="rounded-xl border border-[#e8dfc8]/12 bg-[#0a0d0a] p-4 flex flex-col lg:flex-row lg:items-center gap-3"
          >
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{r.dish_name}</div>
              <div className="text-[12px] opacity-60 mt-0.5">
                Costs {peso(r.cost_now)} to make, was {peso(r.cost_before)}.{' '}
                Margin {r.margin_before}% down to {r.margin_now}%.
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <div className="text-right">
                <div className="text-[10px] tracking-[0.2em] uppercase opacity-45">Now</div>
                <div className="text-sm tabular-nums">{peso(r.price)}</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] tracking-[0.2em] uppercase opacity-45 text-[#e8a84a]">Suggested</div>
                <div className="text-sm tabular-nums text-[#e8a84a]">{peso(r.suggested)}</div>
              </div>

              <button
                onClick={() => decide(r.dish_id, r.suggested)}
                disabled={busy === r.dish_id}
                className="h-9 px-3 rounded-lg text-sm font-medium bg-[#e8a84a] text-[#0a0d0a] disabled:opacity-60 inline-flex items-center gap-1.5"
              >
                {busy === r.dish_id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                Raise it
              </button>
              <button
                onClick={() => decide(r.dish_id, null)}
                disabled={busy === r.dish_id}
                title="Keep the current price and stop asking"
                className="h-9 px-3 rounded-lg text-sm border border-[#e8dfc8]/20 disabled:opacity-40 inline-flex items-center gap-1.5"
              >
                <X size={14} />
                Keep it
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
