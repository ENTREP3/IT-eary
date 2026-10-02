import React, { useState } from 'react';
import { Loader2, Undo2, X } from 'lucide-react';
import { useOrdersStore } from '../../store/ordersStore';
import type { Order, PaymentMethod } from '../../lib/types';
import { humanError } from '../../lib/errors';
import { supabase } from '../../lib/supabase';

/**
 * Handing money back over the counter.
 */

const REASONS = [
  'We ran out of the dish',
  'Diner changed their mind',
  'Wrong order taken',
  'Diner waited too long',
  'Paid twice by mistake',
] as const;

export function RefundDialog({
  order,
  onClose,
  onRefunded,
  statedReason,
}: {
  order: Order;
  onClose: () => void;
  /** Called once the money has actually been recorded as sent. */
  onRefunded?: () => void;
  /**
   * What the diner already said was wrong, when this answers a request.
   *
   * The counter was being asked to pick a reason from a list of the shop’s
   * own — ran out, wrong order, closing early — for a refund the customer
   * had already explained. Two accounts of one event, and the one kept was
   * the one from the person who was not there.
   */
  statedReason?: string;
}) {
  const refund = useOrdersStore((s) => s.refund);

  const [reason, setReason] = useState<string>(statedReason ?? REASONS[0]);
  const [other, setOther] = useState('');
  const [method, setMethod] = useState<PaymentMethod>(order.payment_method ?? 'cash');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * The shop's own proof that it sent the money.
   *
   * Optional, and attached after the refund rather than before it.
   * Giving the money back is the part that matters; a diner must never
   * stand at the counter unrefunded because a photo would not upload.
   */
  const [proof, setProof] = useState<File | null>(null);

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

      // Deliberately after, and deliberately swallowed. The refund is
      // recorded either way; a failed upload is worth a line in the log,
      // not an error over a refund that actually happened.
      if (proof) {
        try {
          const ext = proof.name.split('.').pop()?.toLowerCase() || 'jpg';
          const path = `refunds/${order.ticket_code}/${crypto.randomUUID()}.${ext}`;
          const { error: upErr } = await supabase.storage
            .from('payment-proofs')
            .upload(path, proof, { contentType: proof.type || 'image/jpeg' });
          if (!upErr) {
            await supabase.rpc('attach_refund_proof', {
              p_ticket_code: order.ticket_code,
              p_path: path,
            });
          }
        } catch {
          /* the money is back; the receipt can be added later */
        }
      }

      onRefunded?.();
      onClose();
    } catch (e) {
      setError(humanError(e, 'The refund could not be recorded.'));
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

        {/* When the diner has already said what was wrong, the counter is
            shown it rather than asked to pick from the shop’s own list. Two
            accounts of one event is one too many, and the one worth keeping
            is from the person who ate the food. */}
        {statedReason ? (
          <div className="mt-4">
            <span className="text-[11px] opacity-55">Why — as the diner put it</span>
            <p className="mt-1 rounded-lg border border-[#e8dfc8]/15 px-3 py-2 text-sm">
              {statedReason}
            </p>
          </div>
        ) : (
          <>
            <label className="block mt-4">
              <span className="text-[11px] opacity-55">Why</span>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className={`${field} mt-1`}
              >
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
          </>
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
          {/* The number they paid from, which is where the money goes back.
              Shown only for a GCash refund, because that is the only one that
              has to be sent somewhere — cash is handed over the counter. */}
          {method === 'gcash' && (
            <div className="mt-2 rounded-lg border border-semantic-gcash/35 bg-semantic-gcash/10 px-3 py-2">
              <div className="text-[11px] opacity-60">Send it to</div>
              {order.gcash_sender ? (
                <div className="text-base tabular-nums tracking-wide">
                  {order.gcash_sender}
                </div>
              ) : (
                <div className="text-[12px] opacity-70 leading-relaxed">
                  They did not leave a number. Ask them for it before sending,
                  and check it against the receipt they uploaded.
                </div>
              )}
            </div>
          )}

          {order.payment_method && method !== order.payment_method && (
            // Normal, not a mistake: a GCash payment is often handed back as
            // notes across the counter because it is faster.
            <p className="text-[11px] opacity-55 mt-1.5">
              They paid by {order.payment_method === 'gcash' ? 'GCash' : 'cash'}. Sending it back a different
              way is fine, it is just recorded as it happened.
            </p>
          )}
        </div>

        {/* Offered for a GCash refund, where there is a screenshot to keep.
            Cash handed across the counter has no receipt to photograph, so
            asking for one would only be a box nobody can fill. */}
        {method === 'gcash' && (
          <div className="mt-3">
            <span className="text-[11px] opacity-55">Proof you sent it (optional)</span>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setProof(e.target.files?.[0] ?? null)}
              className="mt-1 block w-full text-xs file:mr-3 file:h-8 file:px-3 file:rounded-lg file:border-0 file:bg-[#e8dfc8]/10 file:text-[#e8dfc8] file:text-xs"
            />
            <p className="text-[11px] opacity-45 mt-1">
              The GCash screenshot. Kept for the shop only, in case the refund is ever
              questioned. The refund is recorded whether or not you add one.
            </p>
          </div>
        )}

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
