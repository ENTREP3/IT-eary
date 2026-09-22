import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Loader2, RefreshCw, Trash2, TrendingDown, TrendingUp, Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';

/**
 * The questions a kitchen asks, which the sales chart cannot answer.
 *
 * Takings and expenses say whether money moved. They do not say which dish is
 * quietly sold at a loss, what went in the bin at closing, or which ingredient
 * price ate the margin. Every figure here comes from a function that checks
 * `is_admin()` for itself, so the panel is only ever as trusted as the caller.
 *
 * Deliberately blunt where the news is bad. A dish below cost is shown in red
 * with the loss spelled out, because the whole point of working it out is that
 * somebody does something about it.
 */

type Outcomes = {
  placed: number; paid: number; completed: number; cancelled: number;
  expired: number; refunded: number; needs_review: number; collected_pct: number | null;
};
type Value = {
  buyers: number; repeat_buyers: number; repeat_pct: number | null;
  avg_order: number | null; avg_lifetime: number | null;
  guest_orders: number; account_orders: number;
};
type Margin = {
  dish_id: string; dish: string; category: string; price: number;
  unit_cost: number | null; margin: number | null; margin_pct: number | null;
  sold_30d: number; revenue_30d: number; profit_30d: number | null;
};
type Drift = {
  inventory_id: string; ingredient: string; unit: string;
  first_cost: number; latest_cost: number; change_pct: number | null; dishes_using: number;
};
type Waste = {
  day: string; dish_id: string; dish: string;
  cooked: number; sold: number; left_over: number; wasted_value: number;
};
type Reason = { reason: string; times: number; amount: number };

const peso = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : `₱${Number(n).toFixed(2)}`;

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-[#e8dfc8]/12 bg-[#0a0d0a] p-5">
      <h3 className="text-sm font-semibold">{title}</h3>
      {hint && <p className="text-xs opacity-50 mt-1 mb-3 max-w-prose leading-relaxed">{hint}</p>}
      <div className={hint ? '' : 'mt-3'}>{children}</div>
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <div className="text-[10px] tracking-[0.2em] uppercase opacity-45">{label}</div>
      <div style={{ fontFamily: 'var(--font-display)' }} className={`text-xl mt-0.5 ${tone ?? ''}`}>
        {value}
      </div>
    </div>
  );
}

export function KitchenInsights() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [outcomes, setOutcomes] = useState<Outcomes | null>(null);
  const [value, setValue] = useState<Value | null>(null);
  const [margins, setMargins] = useState<Margin[]>([]);
  const [drift, setDrift] = useState<Drift[]>([]);
  const [waste, setWaste] = useState<Waste[]>([]);
  const [reasons, setReasons] = useState<Reason[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [o, v, m, d, w, r] = await Promise.all([
        supabase.rpc('order_outcomes', { p_days: 30 }),
        supabase.rpc('customer_value'),
        supabase.rpc('dish_margins'),
        supabase.rpc('ingredient_price_drift', { p_days: 365 }),
        supabase.rpc('waste_by_day', { p_days: 7 }),
        supabase.rpc('refund_reasons', { p_days: 30 }),
      ]);
      const first = [o, v, m, d, w, r].find((x) => x.error);
      if (first?.error) throw new Error(first.error.message);

      setOutcomes((o.data as Outcomes[])?.[0] ?? null);
      setValue((v.data as Value[])?.[0] ?? null);
      setMargins((m.data as Margin[]) ?? []);
      setDrift((d.data as Drift[]) ?? []);
      setWaste((w.data as Waste[]) ?? []);
      setReasons((r.data as Reason[]) ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read the figures.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm opacity-60 py-10 justify-center">
        <Loader2 size={15} className="animate-spin" /> Working the numbers out…
      </div>
    );
  }
  if (error) return <p className="text-sm text-[#e87a5c]">{error}</p>;

  const losing = margins.filter((m) => m.margin_pct !== null && m.margin_pct < 0);
  const uncosted = margins.filter((m) => m.unit_cost === null);
  const wasteTotal = waste.reduce((a, w) => a + Number(w.wasted_value), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[10px] tracking-[0.25em] uppercase opacity-50">The kitchen, in numbers</div>
        <button
          onClick={load}
          className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg border border-[#e8dfc8]/20 hover:bg-[#e8dfc8]/5"
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {/* The loudest thing on the screen, because it is the most expensive. */}
      {losing.length > 0 && (
        <div className="rounded-2xl border border-[#c8442a]/50 bg-[#c8442a]/10 p-4">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="text-[#e87a5c] mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-[#e87a5c]">
                {losing.length === 1 ? 'One dish is sold below what it costs to make' : `${losing.length} dishes are sold below cost`}
              </p>
              <ul className="mt-2 space-y-1">
                {losing.map((m) => (
                  <li key={m.dish_id} className="text-xs">
                    <span className="opacity-90">{m.dish}</span>{' '}
                    <span className="opacity-60">
                      sells at {peso(m.price)}, costs {peso(m.unit_cost)} —{' '}
                    </span>
                    <span className="text-[#e87a5c]">losing {peso(Math.abs(Number(m.margin)))} a serving</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <Card
          title="What happened to the orders"
          hint="Last 30 days. Collected is the only one that ends with somebody eating."
        >
          {outcomes && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <Stat label="Placed" value={String(outcomes.placed)} />
                <Stat label="Paid" value={String(outcomes.paid)} />
                <Stat
                  label="Collected"
                  value={outcomes.collected_pct === null ? '—' : `${outcomes.collected_pct}%`}
                  tone="text-[#8cc07a]"
                />
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-1 mt-4 text-xs opacity-60">
                <span>Cancelled {outcomes.cancelled}</span>
                <span>
                  Never collected {outcomes.expired}
                  {outcomes.expired > 0 && <span className="opacity-70"> · held food until released</span>}
                </span>
                <span>Refunded {outcomes.refunded}</span>
                {outcomes.needs_review > 0 && (
                  <span className="text-[#e8a84a]">Payment unchecked {outcomes.needs_review}</span>
                )}
              </div>
            </>
          )}
        </Card>

        <Card
          title="Who is buying"
          hint="Only diners with an account can be recognised on a second visit. Guests are counted, but never linked."
        >
          {value && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <Stat label="Buyers" value={String(value.buyers)} />
                <Stat
                  label="Come back"
                  value={value.repeat_pct === null ? '—' : `${value.repeat_pct}%`}
                  tone="text-[#8cc07a]"
                />
                <Stat label="Avg order" value={peso(value.avg_order)} />
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-1 mt-4 text-xs opacity-60">
                <span className="inline-flex items-center gap-1">
                  <Users size={11} /> Lifetime {peso(value.avg_lifetime)} each
                </span>
                <span>{value.guest_orders} guest orders, unlinked</span>
              </div>
            </>
          )}
        </Card>
      </div>

      <Card
        title="What went in the bin"
        hint="Cooked against sold, valued at what the ingredients cost on the day. Only dishes you recorded cooking appear here."
      >
        {waste.length === 0 ? (
          <p className="text-sm opacity-50">
            Nothing recorded yet. Use <span className="opacity-80">Record cooking</span> under a dish's recipe and
            this fills in by itself.
          </p>
        ) : (
          <>
            <div className="flex items-baseline gap-2 mb-3">
              <Trash2 size={14} className="opacity-50" />
              <span style={{ fontFamily: 'var(--font-display)' }} className="text-xl">
                {peso(wasteTotal)}
              </span>
              <span className="text-xs opacity-50">thrown away in the last 7 days</span>
            </div>
            <div className="space-y-1.5">
              {waste.slice(0, 8).map((w, i) => (
                <div key={`${w.day}-${w.dish_id}-${i}`} className="flex items-center justify-between gap-3 text-xs">
                  <span className="opacity-80 min-w-0 truncate">{w.dish}</span>
                  <span className="opacity-50 shrink-0">
                    cooked {w.cooked}, sold {w.sold} ·{' '}
                    <span className={w.left_over > 0 ? 'text-[#e87a5c]' : 'text-[#8cc07a]'}>
                      {w.left_over} left ({peso(w.wasted_value)})
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>

      <Card
        title="What each dish earns"
        hint="Last 30 days of sales against today's ingredient prices. Ordered by the profit it actually brought in."
      >
        <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full text-xs">
            <thead className="opacity-45">
              <tr className="text-left">
                <th className="font-normal pb-2">Dish</th>
                <th className="font-normal pb-2 text-right">Price</th>
                <th className="font-normal pb-2 text-right">Costs</th>
                <th className="font-normal pb-2 text-right">Margin</th>
                <th className="font-normal pb-2 text-right">Sold</th>
                <th className="font-normal pb-2 text-right">Profit</th>
              </tr>
            </thead>
            <tbody>
              {margins.slice(0, 12).map((m) => {
                const bad = m.margin_pct !== null && m.margin_pct < 0;
                const thin = m.margin_pct !== null && m.margin_pct >= 0 && m.margin_pct < 10;
                return (
                  <tr key={m.dish_id} className="border-t border-[#e8dfc8]/8">
                    <td className="py-1.5 pr-2">{m.dish}</td>
                    <td className="py-1.5 text-right tabular-nums">{peso(m.price)}</td>
                    <td className="py-1.5 text-right tabular-nums opacity-60">{peso(m.unit_cost)}</td>
                    <td
                      className={`py-1.5 text-right tabular-nums ${
                        bad ? 'text-[#e87a5c]' : thin ? 'text-[#e8a84a]' : 'text-[#8cc07a]'
                      }`}
                    >
                      {m.margin_pct === null ? '—' : `${m.margin_pct}%`}
                    </td>
                    <td className="py-1.5 text-right tabular-nums opacity-60">{m.sold_30d}</td>
                    <td className="py-1.5 text-right tabular-nums">{peso(m.profit_30d)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {uncosted.length > 0 && (
          // A dash in the margin column is not a rounding quirk; it means a
          // recipe is missing or an ingredient has no price, and every figure
          // for that dish is silently absent until somebody fixes it.
          <p className="text-[11px] opacity-50 mt-3 leading-relaxed">
            {uncosted.length} {uncosted.length === 1 ? 'dish has' : 'dishes have'} no cost yet —{' '}
            {uncosted.slice(0, 3).map((m) => m.dish).join(', ')}
            {uncosted.length > 3 ? ' and others' : ''}. Either the recipe is empty or one of its ingredients has no
            price, so nothing above can be worked out for them.
          </p>
        )}
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card
          title="What the shopping is doing to you"
          hint="How ingredient prices have moved since you first recorded them, worst first."
        >
          {drift.length === 0 ? (
            <p className="text-sm opacity-50">
              No price has moved yet. This fills in as you record deliveries with a price.
            </p>
          ) : (
            <div className="space-y-2">
              {drift.slice(0, 6).map((d) => {
                const up = Number(d.change_pct) > 0;
                return (
                  <div key={d.inventory_id} className="flex items-center justify-between gap-3 text-xs">
                    <span className="min-w-0">
                      <span className="opacity-85">{d.ingredient}</span>
                      <span className="opacity-40"> · in {d.dishes_using} {d.dishes_using === 1 ? 'dish' : 'dishes'}</span>
                    </span>
                    <span className="shrink-0 flex items-center gap-1.5">
                      <span className="opacity-45 tabular-nums">
                        {peso(d.first_cost)} → {peso(d.latest_cost)}
                      </span>
                      <span className={`inline-flex items-center gap-0.5 tabular-nums ${up ? 'text-[#e87a5c]' : 'text-[#8cc07a]'}`}>
                        {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                        {up ? '+' : ''}
                        {d.change_pct}%
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card title="Why money went back" hint="Refunds in the last 30 days, grouped by what staff said happened.">
          {reasons.length === 0 ? (
            <p className="text-sm opacity-50">No refunds. Nothing to explain.</p>
          ) : (
            <div className="space-y-1.5">
              {reasons.map((r) => (
                <div key={r.reason} className="flex items-center justify-between gap-3 text-xs">
                  <span className="opacity-80 min-w-0 truncate">{r.reason}</span>
                  <span className="opacity-55 shrink-0 tabular-nums">
                    {r.times}× · {peso(r.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
