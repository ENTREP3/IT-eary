import React, { useState } from 'react';
import { Loader2, Undo2, X } from 'lucide-react';
import { useOrdersStore } from '../../store/ordersStore';
import type { Order, PaymentMethod } from '../../lib/types';

/**
 * Handing money back over the counter.
 *
 * A refund is not a cancellation and the shop is careful about the difference:
 * cancelling is for a ticket nobody paid for, refunding is for one they did.
 * This is only ever offered while the food can still go back in the platter,
 * and the database refuses it otherwise — so an error here is the rule
 * speaking, not a bug, and it is shown to the cashier as written.
 *
 * A reason is required. A refund with no reason is a hole in the day's takings
 * that nobody can explain a week later, which is exactly when it gets asked
 * about.
 */

const REASONS = [
  'We ran out of the dish',
  'Diner changed their mind',
  'Wrong order taken',
  'Diner waited too long',
  'Paid twice by mistake',
] as const;

export function RefundDialog({ order, onClose }: { order: Order; onClose: () => void }) {
  const refund = useOrdersStore((s) => s.refund);

  const [reason, setReason] = useState<string>(REASONS[0]);
  const [other, setOther] = useState('');
  const [method, setMethod] = useState<PaymentMethod>(order.payment_method ?? 'cash');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finalReason = reason === 'Other' ? other.trim() : reason;

  const submit = async () => {
    if (!finalReason) {
      setError('Say what the refund is for.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await refund({ ticketCode: order.ticket_code, reason: finalReason, method, note: note.trim() || null });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The refund could not be recorded.');
      setBusy(false);
    }
  };

  const field = 'w-full h-10 px-3 rounded-lg bg-[#0f1410] border border-[#e8dfc8]/15 text-sm focus:outline-none focus:ring-2 focus:ring-[#e8a84a]/40';

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 grid place-items-center p-4"
      role="dialog"
      aria-modal="true"
      onClick={busy ? undefined : onClose}
    >
      <div
        className="w-full max-w-md max-h-[88vh] overflow-y-auto rounded-2xl border border-[#e8dfc8]/15 bg-[#0a0d0a] p-5 text-[#e8dfc8]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] tracking-[0.25em] uppercase opacity-50">Refund</div>
            <div style={{ fontFamily: 'var(--font-display)' }} className="text-2xl text-[#e8a84a] tracking-widest">
              {order.ticket_code}
            </div>
          </div>
          <button onClick={onClose} disabled={busy} className="p-1.5 rounded-lg hover:bg-[#e8dfc8]/10 disabled:opacity-40" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="mt-4 rounded-xl border border-[#e8dfc8]/12 p-3">
          <div className="flex justify-between items-baseline">
            <span className="text-sm opacity-60">Giving back</span>
            <span style={{ fontFamily: 'var(--font-display)' }} className="text-2xl">
              ₱{Number(order.total).toFixed(2)}
            </span>
          </div>
          {Number(order.discount) > 0 && (
            // Said plainly, because the figure is smaller than the menu price
            // and a cashier counting notes needs to know that is deliberate.
            <p className="text-[11px] opacity-55 mt-1.5 leading-relaxed">
              What they paid, not the menu price. ₱{Number(order.subtotal).toFixed(2)} less the{' '}
              ₱{Number(order.discount).toFixed(2)} discount
              {order.promo_code ? ` from ${order.promo_code}` : ''}.
            </p>
          )}
          <p className="text-[11px] opacity-55 mt-1.5 leading-relaxed">
            Every serving goes back on the menu, and the order stops counting towards the day.
          </p>
        </div>

        <label className="block mt-4">
          <span className="text-[11px] opacity-55">Why</span>
          <select value={reason} onChange={(e) => setReason(e.target.value)} className={`${field} mt-1`}>
            {REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
            <option value="Other">Other</option>
          </select>
        </label>

        {reason === 'Other' && (
          <input
            autoFocus
            value={other}
            onChange={(e) => setOther(e.target.value)}
            placeholder="Say what happened"
            className={`${field} mt-2`}
          />
        )}

        <div className="mt-3">
          <span className="text-[11px] opacity-55">Handed back as</span>
          <div className="flex gap-2 mt-1">
            {(['cash', 'gcash'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMethod(m)}
                className={`flex-1 h-10 rounded-lg border text-sm transition-colors ${
                  method === m
                    ? 'border-[#e8a84a]/60 bg-[#e8a84a]/15 text-[#e8a84a]'
                    : 'border-[#e8dfc8]/15 hover:border-[#e8dfc8]/30'
                }`}
              >
                {m === 'gcash' ? 'GCash' : 'Cash'}
              </button>
            ))}
          </div>
          {order.payment_method && method !== order.payment_method && (
            // Normal, not a mistake: a GCash payment is often handed back as
            // notes across the counter because it is faster.
            <p className="text-[11px] opacity-55 mt-1.5">
              They paid by {order.payment_method === 'gcash' ? 'GCash' : 'cash'}. Sending it back a different
              way is fine, it is just recorded as it happened.
            </p>
          )}
        </div>

        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional)"
          className={`${field} mt-3`}
        />

        {error && <p className="mt-3 text-sm text-[#e87a5c]">{error}</p>}

        <div className="flex gap-2 mt-5">
          <button
            onClick={onClose}
            disabled={busy}
            className="flex-1 h-11 rounded-lg border border-[#e8dfc8]/20 text-sm disabled:opacity-40"
          >
            Never mind
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="flex-1 h-11 rounded-lg bg-[#e8a84a] text-[#0a0d0a] text-sm font-medium inline-flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Undo2 size={15} />}
            {busy ? 'Recording…' : `Refund ₱${Number(order.total).toFixed(2)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
