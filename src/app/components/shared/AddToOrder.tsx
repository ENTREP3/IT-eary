import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Search, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useKarinderyaStore } from '../../store/karinderyaStore';
import type { Order } from '../../lib/types';
import { humanError } from '../../lib/errors';

/**
 * Adding to a ticket at the counter.
 *
 * A diner who gets to the till and wants one more ulam used to have to be
 * refused, or served off the books: the cashier could look a ticket up and
 * settle it, and nothing else.
 *
 * Only offered before payment. After that it is no longer an order being
 * built — taking more money against a settled ticket is a second sale, and
 * handing food over without it is a hole in the till. The database refuses it
 * either way; this simply does not ask.
 *
 * Sold-out dishes are left out rather than shown greyed. The cashier is
 * standing in front of somebody waiting, and a list of things they cannot have
 * is slower to read than a list of things they can.
 */
export function AddToOrder({
  order,
  onChanged,
}: {
  order: Order;
  onChanged: (updated: Order) => void;
}) {
  const dishes = useKarinderyaStore((s) => s.dishes);
  const loaded = useKarinderyaStore((s) => s.loaded);
  const loadAll = useKarinderyaStore((s) => s.loadAll);

  // The counter screen has never needed the menu before, so nothing had loaded
  // it. Fetched here rather than on the till as a whole: it is only wanted when
  // somebody actually asks to add something, which is rare.
  useEffect(() => {
    if (!loaded) loadAll();
  }, [loaded, loadAll]);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const available = useMemo(() => {
    const q = query.trim().toLowerCase();
    return dishes
      .filter((d) => d.available)
      .filter((d) => !q || d.name.toLowerCase().includes(q) || d.tagalog?.toLowerCase().includes(q))
      // Rice to the top. It is the thing most often asked for at the counter,
      // and hunting for it down a list of twenty-five ulam is the difference
      // between a quick yes and a queue.
      .sort((a, b) => {
        const ar = a.category === 'Kanin' ? 0 : 1;
        const br = b.category === 'Kanin' ? 0 : 1;
        return ar !== br ? ar - br : a.name.localeCompare(b.name);
      })
      .slice(0, 40);
  }, [dishes, query]);

  const add = async (dishId: string) => {
    setBusy(dishId);
    setError(null);
    const { data, error: err } = await supabase.rpc('add_order_items', {
      p_ticket_code: order.ticket_code,
      p_items: [{ id: dishId, qty: 1 }],
    });
    setBusy(null);
    if (err) {
      // The refusal is the rule speaking — sold out, already paid, wrong
      // status — so it is shown as written rather than reworded.
      setError(humanError(err));
      return;
    }
    if (data) onChanged(data as Order);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-4 w-full h-11 rounded-xl border border-[#e8dfc8]/20 text-sm inline-flex items-center justify-center gap-2 hover:bg-[#e8dfc8]/5"
      >
        <Plus size={15} /> Add something to this order
      </button>
    );
  }

  return (
    <div className="mt-4 rounded-2xl border border-[#e8dfc8]/15 bg-[#0a0d0a] p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] tracking-[0.25em] uppercase opacity-50">Add to this order</span>
        <button
          onClick={() => {
            setOpen(false);
            setQuery('');
            setError(null);
          }}
          aria-label="Done adding"
          className="p-1 rounded-lg hover:bg-[#e8dfc8]/10"
        >
          <X size={15} />
        </button>
      </div>

      <div className="relative mt-3">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-40" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the menu"
          className="w-full h-10 pl-9 pr-3 rounded-lg bg-[#0f1410] border border-[#e8dfc8]/15 text-sm placeholder:text-[#e8dfc8]/35 focus:outline-none focus:ring-2 focus:ring-[#e8a84a]/40"
        />
      </div>

      {error && <p className="mt-2 text-xs text-[#e87a5c]">{error}</p>}

      <div className="mt-3 max-h-64 overflow-y-auto -mx-1 px-1">
        {!loaded ? (
          <p className="flex items-center justify-center gap-2 text-sm opacity-50 py-4">
            <Loader2 size={14} className="animate-spin" /> Loading the menu…
          </p>
        ) : available.length === 0 ? (
          <p className="text-sm opacity-50 py-4 text-center">Nothing on the menu matches that.</p>
        ) : (
          available.map((d) => (
            <button
              key={d.id}
              onClick={() => add(d.id)}
              disabled={busy !== null}
              className="w-full flex items-center justify-between gap-3 px-2 py-2 rounded-lg text-left text-sm hover:bg-[#e8dfc8]/[0.04] disabled:opacity-40"
            >
              <span className="min-w-0">
                <span className="opacity-90">{d.name}</span>
                {typeof d.stockCount === 'number' && (
                  <span className="opacity-45 text-xs"> · {d.stockCount} left</span>
                )}
              </span>
              <span className="shrink-0 flex items-center gap-2 tabular-nums opacity-70">
                ₱{Number(d.price).toFixed(2)}
                {busy === d.id ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Plus size={13} className="opacity-60" />
                )}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
