import React, { useMemo, useState } from 'react';
import { Loader2, Minus, Plus, Search, Trash2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useKarinderyaStore } from '../../store/karinderyaStore';
import { usePaymentStore } from '../../store/paymentStore';
import { humanError } from '../../lib/errors';
import type { Order } from '../../lib/types';

/**
 * Taking an order at the counter, without the diner's phone.
 *
 * Until now every ticket began on a customer's device. That is fine while the
 * website is up and the diner has a phone with battery, and it is the whole
 * ordering system when either of those is not true — which is exactly when a
 * queue forms. The counter needs to be able to start an order itself.
 *
 * It calls the same `create_ticket` the storefront does. That function already
 * detaches the order from a staff account, so a ticket raised here belongs to
 * nobody, like the walk-in it is: the kitchen board, the receipt and the
 * takings all treat it as an ordinary ticket, because it is one.
 */
export function CounterOrder({ onCreated }: { onCreated: (order: Order) => void }) {
  const dishes = useKarinderyaStore((s) => s.dishes);
  const settings = usePaymentStore((s) => s.settings);

  const [qty, setQty] = useState<Record<string, number>>({});
  const [name, setName] = useState('');
  const [method, setMethod] = useState<'cash' | 'gcash'>('cash');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const menu = useMemo(() => {
    const q = search.trim().toLowerCase();
    return dishes
      .filter((d) => d.available)
      .filter((d) => !q || d.name.toLowerCase().includes(q));
  }, [dishes, search]);

  const lines = useMemo(
    () =>
      Object.entries(qty)
        .filter(([, n]) => n > 0)
        .map(([id, n]) => ({ dish: dishes.find((d) => d.id === id)!, n }))
        .filter((l) => l.dish),
    [qty, dishes],
  );

  const total = lines.reduce((sum, l) => sum + l.dish.price * l.n, 0);

  const add = (id: string) => setQty((q) => ({ ...q, [id]: (q[id] ?? 0) + 1 }));
  const sub = (id: string) =>
    setQty((q) => ({ ...q, [id]: Math.max(0, (q[id] ?? 0) - 1) }));
  const drop = (id: string) => setQty((q) => ({ ...q, [id]: 0 }));

  const place = async () => {
    setBusy(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.rpc('create_ticket', {
        p_items: lines.map((l) => ({ id: l.dish.id, qty: l.n })),
        p_customer_name: name.trim() || null,
        p_payment_method: method,
        // No promo and no device: a walk-in has no account for "once each" to
        // be counted against, and nothing to prove the ticket is theirs later.
        p_promo_code: null,
        p_device_token: null,
      });
      if (err) throw err;
      setQty({});
      setName('');
      onCreated(data as Order);
    } catch (e) {
      setError(humanError(e, 'Could not start that order.'));
    } finally {
      setBusy(false);
    }
  };

  const cashOk = settings?.cash_enabled ?? true;
  const gcashOk = settings?.gcash_enabled ?? true;

  return (
    <div className="grid lg:grid-cols-[1fr_20rem] gap-5">
      {/* ------------------------------------------------------------ menu */}
      <div>
        <div className="relative mb-3">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-40" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find a dish"
            className="w-full h-10 pl-9 pr-3 rounded-lg bg-[#0f1410] border border-[#e8dfc8]/15 text-sm outline-none focus:border-[#e8a84a]/60"
          />
        </div>

        {menu.length === 0 ? (
          <p className="text-sm opacity-50 py-8 text-center">
            Nothing is available to sell right now.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {menu.map((d) => {
              const n = qty[d.id] ?? 0;
              return (
                <button
                  key={d.id}
                  onClick={() => add(d.id)}
                  className={`text-left p-3 rounded-xl border transition-colors ${
                    n > 0
                      ? 'border-[#e8a84a] bg-[#e8a84a]/10'
                      : 'border-[#e8dfc8]/12 bg-[#0a0d0a] hover:border-[#e8dfc8]/30'
                  }`}
                >
                  <div className="text-sm font-medium leading-snug">{d.name}</div>
                  <div className="text-xs opacity-55 mt-0.5">₱{d.price.toFixed(2)}</div>
                  {n > 0 && (
                    <div className="mt-1.5 text-[11px] text-[#e8a84a]">× {n} on the ticket</div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ----------------------------------------------------------- ticket */}
      <div className="rounded-2xl border border-[#e8dfc8]/12 bg-[#0a0d0a] p-4 h-fit lg:sticky lg:top-4">
        <h3 className="text-[10px] tracking-[0.25em] uppercase opacity-50 mb-3">This order</h3>

        {lines.length === 0 ? (
          <p className="text-sm opacity-45 py-4">Tap a dish to start.</p>
        ) : (
          <div className="space-y-2 mb-3">
            {lines.map((l) => (
              <div key={l.dish.id} className="flex items-center gap-2 text-sm">
                <div className="flex-1 min-w-0">
                  <div className="truncate">{l.dish.name}</div>
                  <div className="text-[11px] opacity-50">₱{l.dish.price.toFixed(2)} each</div>
                </div>
                <button
                  onClick={() => sub(l.dish.id)}
                  className="w-7 h-7 grid place-items-center rounded-full border border-[#e8dfc8]/20"
                  aria-label={`One fewer ${l.dish.name}`}
                >
                  <Minus size={12} />
                </button>
                <span className="w-5 text-center tabular-nums">{l.n}</span>
                <button
                  onClick={() => add(l.dish.id)}
                  className="w-7 h-7 grid place-items-center rounded-full border border-[#e8dfc8]/20"
                  aria-label={`One more ${l.dish.name}`}
                >
                  <Plus size={12} />
                </button>
                <button
                  onClick={() => drop(l.dish.id)}
                  className="w-7 h-7 grid place-items-center rounded-lg text-[#e8dfc8]/45 hover:text-[#e87a5c]"
                  aria-label={`Take ${l.dish.name} off`}
                >
                  <X size={13} />
                </button>
              </div>
            ))}

            {lines.length > 1 && (
              <button
                onClick={() => setQty({})}
                className="w-full mt-1 py-2 rounded-lg text-xs opacity-60 border border-dashed border-[#e8dfc8]/20 inline-flex items-center justify-center gap-1.5 hover:text-[#e87a5c]"
              >
                <Trash2 size={12} /> Clear the ticket
              </button>
            )}
          </div>
        )}

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name to call (optional)"
          className="w-full h-9 px-3 rounded-lg bg-[#0f1410] border border-[#e8dfc8]/15 text-sm outline-none focus:border-[#e8a84a]/60"
        />

        <div className="flex gap-2 mt-2">
          {cashOk && (
            <MethodButton on={method === 'cash'} onClick={() => setMethod('cash')} label="Cash" />
          )}
          {gcashOk && (
            <MethodButton on={method === 'gcash'} onClick={() => setMethod('gcash')} label="GCash" />
          )}
        </div>

        <div className="flex items-baseline justify-between mt-4 mb-3">
          <span className="text-xs opacity-55">Total</span>
          <span style={{ fontFamily: 'var(--font-display)' }} className="text-2xl tabular-nums">
            ₱{total.toFixed(2)}
          </span>
        </div>

        {error && <p className="text-sm text-[#e87a5c] mb-2">{error}</p>}

        <button
          onClick={place}
          disabled={busy || lines.length === 0}
          className="w-full h-11 rounded-full bg-[#e8a84a] text-[#0a0d0a] text-sm font-medium inline-flex items-center justify-center gap-2 disabled:opacity-40"
        >
          {busy && <Loader2 size={15} className="animate-spin" />}
          Make the ticket
        </button>
      </div>
    </div>
  );
}

function MethodButton({
  on,
  onClick,
  label,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 h-9 rounded-lg text-sm border transition-colors ${
        on ? 'bg-[#e8a84a] text-[#0a0d0a] border-[#e8a84a]' : 'border-[#e8dfc8]/15 hover:border-[#e8dfc8]/35'
      }`}
    >
      {label}
    </button>
  );
}
