import { useEffect, useMemo, useState } from 'react';
import { Loader2, Receipt, Search, X } from 'lucide-react';
import { useOrdersStore, formatOrderTime, itemsSummary } from '../../store/ordersStore';
import type { Order } from '../../lib/types';

/**
 * Every order the shop has taken, not just the ones still on the board.
 *
 * The dashboard shows five. That is the right number for a glance during
 * service and the wrong number for every other question an owner has: what a
 * regular usually orders, whether a refund argument is genuine, what last
 * Tuesday actually took. Those need the whole record and a way through it.
 *
 * Loaded on its own rather than from the live order feed. That feed is what the
 * kitchen board and today's figures read, and widening it to ninety days to
 * serve this screen would put three-month-old tickets back on the line.
 */

const RANGES = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
  { label: 'Everything', days: 0 },
] as const;

const STATUSES = ['all', 'pending', 'paid', 'preparing', 'ready', 'completed', 'cancelled', 'refunded'] as const;

function StatusPill({ status }: { status: Order['status'] }) {
  const tone =
    status === 'cancelled' || status === 'refunded'
      ? 'bg-[#c8442a]/25 text-[#e87a5c]'
      : status === 'completed'
        ? 'bg-[#8cc07a]/20 text-[#8cc07a]'
        : status === 'pending'
          ? 'bg-[#e8dfc8]/10 opacity-70'
          : 'bg-[#e8a84a]/20 text-[#e8a84a]';
  return <span className={`text-[10px] px-1.5 py-0.5 rounded-full capitalize ${tone}`}>{status}</span>;
}

/** What the money did, which is not the same question as what the kitchen did. */
function MoneyPill({ order }: { order: Order }) {
  if (order.status === 'refunded') {
    return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#c8442a]/25 text-[#e87a5c]">Money returned</span>;
  }
  if (!order.paid_at) {
    return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#e8dfc8]/10 opacity-70">Unpaid</span>;
  }
  if (order.payment_status === 'needs_review') {
    return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#e8a84a]/20 text-[#e8a84a]">Needs review</span>;
  }
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#8cc07a]/20 text-[#8cc07a]">
      {order.payment_method === 'gcash' ? 'GCash' : 'Cash'}
    </span>
  );
}

/**
 * One order in full.
 *
 * Exported because the dashboard opens the same thing. Two different-looking
 * answers to "what was on this ticket" is one answer too many.
 */
export function OrderDetail({ order, onClose }: { order: Order; onClose: () => void }) {
  const line = (label: string, value: React.ReactNode) => (
    <div className="flex justify-between gap-4 text-sm py-1.5 border-b border-[#e8dfc8]/8 last:border-0">
      <span className="opacity-55 shrink-0">{label}</span>
      <span className="text-right min-w-0">{value}</span>
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 grid place-items-center p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[88vh] overflow-y-auto rounded-2xl border border-[#e8dfc8]/15 bg-[#0a0d0a] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] tracking-[0.25em] uppercase opacity-50">Order</div>
            <div style={{ fontFamily: 'var(--font-display)' }} className="text-2xl text-[#e8a84a] tracking-widest">
              {order.ticket_code}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#e8dfc8]/10" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-wrap gap-2 mt-3">
          <StatusPill status={order.status} />
          <MoneyPill order={order} />
          {order.verified_in_person && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#e8dfc8]/10 opacity-70">Checked at the counter</span>
          )}
        </div>

        <div className="mt-4 rounded-xl border border-[#e8dfc8]/10 p-3">
          {order.items?.map((it, i) => (
            <div key={i} className="flex justify-between gap-3 text-sm py-1">
              <span className="min-w-0 truncate">
                <span className="opacity-55">{it.qty} ×</span> {it.name}
              </span>
              <span className="shrink-0">₱{(it.price * it.qty).toFixed(2)}</span>
            </div>
          ))}
        </div>

        <div className="mt-3">
          {line('Subtotal', `₱${Number(order.subtotal ?? order.total).toFixed(2)}`)}
          {Number(order.discount) > 0 &&
            line(
              order.promo_code ? `Discount (${order.promo_code})` : 'Discount',
              <span className="text-[#8cc07a]">−₱{Number(order.discount).toFixed(2)}</span>,
            )}
          {line('Total', <span className="text-base">₱{Number(order.total).toFixed(2)}</span>)}
          {line('Ordered by', order.customer_name || (order.customer_id ? 'Account holder' : 'Walk-in guest'))}
          {line('Placed', new Date(order.created_at).toLocaleString())}
          {order.pickup_at && line('Collecting at', new Date(order.pickup_at).toLocaleString())}
          {order.paid_at && line('Paid', new Date(order.paid_at).toLocaleString())}
          {order.completed_at && line('Completed', new Date(order.completed_at).toLocaleString())}
          {order.review_note && line('Note', order.review_note)}
          {order.proof_path && line('Receipt', <span className="opacity-55">Uploaded, viewable from the dashboard</span>)}
        </div>

        {(order.status === 'cancelled' || order.status === 'refunded') && (
          <p className="mt-3 text-xs opacity-55 leading-relaxed">
            {order.status === 'refunded'
              ? `₱${Number(order.total).toFixed(2)} was handed back and every serving went back on the menu. `
              : 'Nothing was paid, so nothing went back. '}
            The order is kept rather than deleted, so the record of what happened stays complete, and it
            is left out of every sales and profit figure.
          </p>
        )}
      </div>
    </div>
  );
}

export function OrderHistory() {
  const loadHistory = useOrdersStore((s) => s.loadHistory);

  const [days, setDays] = useState<number>(30);
  const [rows, setRows] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<(typeof STATUSES)[number]>('all');
  const [open, setOpen] = useState<Order | null>(null);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    loadHistory(days)
      .then((r) => live && setRows(r))
      .catch((e) => live && setError(e instanceof Error ? e.message : 'Could not load the history.'))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [days, loadHistory]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((o) => {
      if (status !== 'all' && o.status !== status) return false;
      if (!q) return true;
      return (
        o.ticket_code.toLowerCase().includes(q) ||
        (o.customer_name ?? '').toLowerCase().includes(q) ||
        itemsSummary(o.items).toLowerCase().includes(q)
      );
    });
  }, [rows, query, status]);

  // Counted from what is on screen, so the totals always describe the list
  // below them rather than a wider set the owner has filtered away.
  const takings = shown
    .filter((o) => o.paid_at && o.status !== 'cancelled')
    .reduce((a, o) => a + Number(o.total), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ticket code, name or dish"
            className="w-full h-10 pl-9 pr-3 rounded-lg bg-[#0f1410] border border-[#e8dfc8]/15 text-sm placeholder:text-[#e8dfc8]/35 focus:outline-none focus:ring-2 focus:ring-[#e8a84a]/40"
          />
        </div>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="h-10 px-3 rounded-lg bg-[#0f1410] border border-[#e8dfc8]/15 text-sm"
        >
          {RANGES.map((r) => (
            <option key={r.days} value={r.days}>
              {r.label}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as (typeof STATUSES)[number])}
          className="h-10 px-3 rounded-lg bg-[#0f1410] border border-[#e8dfc8]/15 text-sm capitalize"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s === 'all' ? 'Every status' : s}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs opacity-60">
        <span>{shown.length} order{shown.length === 1 ? '' : 's'}</span>
        <span>Takings ₱{takings.toFixed(2)}</span>
        <span className="opacity-70">Unpaid and cancelled orders are listed, but not counted in the takings.</span>
      </div>

      {error && <p className="text-sm text-[#e87a5c]">{error}</p>}

      {loading ? (
        <div className="flex items-center gap-2 text-sm opacity-60 py-10 justify-center">
          <Loader2 size={15} className="animate-spin" /> Loading the record…
        </div>
      ) : shown.length === 0 ? (
        <div className="text-center py-14 opacity-50">
          <Receipt size={22} className="mx-auto mb-2 opacity-60" />
          <p className="text-sm">Nothing matches that.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-[#e8dfc8]/12 overflow-hidden">
          {shown.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => setOpen(o)}
              className="w-full text-left flex items-center justify-between gap-3 px-4 py-3 border-b border-[#e8dfc8]/8 last:border-0 hover:bg-[#e8dfc8]/[0.03] transition-colors"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono tracking-[0.1em] text-sm opacity-80">{o.ticket_code}</span>
                  <StatusPill status={o.status} />
                  <MoneyPill order={o} />
                </div>
                <div className="truncate opacity-55 text-xs mt-0.5">
                  {o.customer_name ? `${o.customer_name} · ` : ''}
                  {itemsSummary(o.items)}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div
                  style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }}
                  className={o.status === 'cancelled' ? 'line-through opacity-45' : ''}
                >
                  ₱{Number(o.total).toFixed(2)}
                </div>
                <div className="text-[10px] opacity-45">{formatOrderTime(o.created_at)}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {open && <OrderDetail order={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
