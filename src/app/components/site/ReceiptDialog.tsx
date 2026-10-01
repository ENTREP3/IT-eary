import React, { useState } from 'react';
import { Download, Loader2, X } from 'lucide-react';
import type { Order } from '../../lib/types';
import { useOrdersStore } from '../../store/ordersStore';
import { useBusinessStore } from '../../store/businessStore';
import { humanError } from '../../lib/errors';
import { useConfirm } from '../shared/useConfirm';

/**
 * The receipt for one order, reopened from the order history.
 *
 * The phone has had this since the beginning: a card in the history is
 * tappable and opens the ticket. The website only ever showed a receipt once,
 * in the moment after ordering, and closing it was final — no way back to it,
 * no way to save it, and no way to cancel an order that had not been paid for.
 *
 * ---------------------------------------------------------------------------
 * Downloading is a text file, not a picture
 *
 * A receipt is read, kept, and occasionally forwarded to somebody. A PNG of a
 * web page is none of those things well: it cannot be searched, it is large,
 * and rendering one needs a library that exists to draw screenshots. Plain
 * text opens anywhere, costs nothing, and says exactly what it is.
 *
 * ---------------------------------------------------------------------------
 * Cancelling is offered only while it is true
 *
 * An unpaid ticket can be cancelled by the diner, because nothing has happened
 * yet and the stock it holds should go back. Once it is paid the counter deals
 * with it — a refund is money moving, and that is the shop's decision rather
 * than a button on a customer's phone.
 */
export function ReceiptDialog({ order, onClose }: { order: Order; onClose: () => void }) {
  const confirm = useConfirm();
  const cancel = useOrdersStore((s) => s.cancel);
  const shop = useBusinessStore((s) => s.profile);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const paid = Boolean(order.paid_at);
  const settled = ['cancelled', 'refunded', 'expired'].includes(order.status);

  /** Only while nothing has been paid and nothing has been settled. */
  const canCancel = !paid && !settled && order.status === 'pending';

  const peso = (n: number) => `PHP ${Number(n ?? 0).toFixed(2)}`;

  /**
   * The receipt as plain text, laid out to be read in a notes app.
   *
   * Built here rather than scraped from the rendered page, so what is saved is
   * the record rather than whatever the layout happened to be.
   */
  const asText = () => {
    const lines: string[] = [];
    lines.push(shop.name || 'Bencris');
    if (shop.address_line && !shop.address_line.includes('[')) {
      lines.push([shop.address_line, shop.district, shop.city].filter(Boolean).join(', '));
    }
    lines.push('');
    lines.push(`Ticket      ${order.ticket_code}`);
    lines.push(`Date        ${new Date(order.created_at).toLocaleString()}`);
    if (order.customer_name) lines.push(`Name        ${order.customer_name}`);
    lines.push('');

    for (const item of order.items ?? []) {
      const qty = `${item.qty}x`.padEnd(5);
      lines.push(`${qty}${(item.name ?? '').padEnd(24)}${peso(Number(item.price) * item.qty)}`);
    }

    lines.push('');
    lines.push(`Subtotal    ${peso(order.subtotal || order.total)}`);
    if (order.discount > 0) {
      // The code is named because a diner checking a discount wants to know
      // which one was applied, not only that something came off.
      lines.push(`Discount    -${peso(order.discount)}${order.promo_code ? `  (${order.promo_code})` : ''}`);
    }
    lines.push(`Total       ${peso(order.total)}`);
    lines.push(`Paid by     ${order.payment_method === 'gcash' ? 'GCash' : 'Cash'}`);
    if (order.served_by_name) lines.push(`Served by   ${order.served_by_name}`);
    lines.push('');
    lines.push(`Status      ${order.status}`);
    return lines.join('\n');
  };

  const download = () => {
    const blob = new Blob([asText()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bencris-${order.ticket_code}.txt`;
    a.click();
    // Released straight away: the download has already been handed to the
    // browser, and holding the object alive leaks the whole file.
    URL.revokeObjectURL(url);
  };

  const doCancel = async () => {
    setBusy(true);
    setError(null);
    try {
      await cancel(order.ticket_code);
      onClose();
    } catch (e) {
      setError(humanError(e, 'Could not cancel that.'));
      setBusy(false);
    }
  };
  /** One label-and-value line in the header block. */
  const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="flex justify-between gap-4 py-0.5">
      <span className="opacity-55">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );

  /**
   * The torn-paper rule between sections.
   *
   * Dotted rather than solid, because a receipt is a printed thing and the
   * dots are what makes a card on a screen read as one.
   */
  const Rule = () => (
    <div
      className="my-4 border-t border-dashed border-diner-ink/25"
      aria-hidden="true"
    />
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4 py-6"
      role="dialog"
      aria-modal="true"
      onClick={busy ? undefined : onClose}
    >
      <div
        className="w-full max-w-sm max-h-full overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-end mb-2">
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-2 rounded-full bg-diner-card text-diner-ink/60 hover:text-diner-ink"
          >
            <X size={18} />
          </button>
        </div>

        {/* White, not the page colour: a receipt is a piece of paper, and the
            phone has always shown it that way. */}
        <div className="rounded-3xl bg-white text-[#1a1410] border border-diner-ink/10 p-5">
          <p className="text-center text-lg font-extrabold">
            {shop.name || 'Bencris'} Karinderya
          </p>

          <div className="mt-4 text-sm">
            <Row label="Ticket" value={<span className="font-mono">{order.ticket_code}</span>} />
            <Row
              label="Date"
              value={new Date(order.paid_at ?? order.created_at).toLocaleString()}
            />
            {order.customer_name && <Row label="Name" value={order.customer_name} />}
            <Row label="Payment" value={order.payment_method === 'gcash' ? 'GCash' : 'Cash'} />
          </div>

          <Rule />

          <div className="space-y-2 text-sm">
            {(order.items ?? []).map((item, i) => (
              <div key={i} className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p>
                    {item.qty} × {item.name}
                  </p>
                  {/* The unit price, because "3 × Chicken Curry ₱345" invites
                      the question and this answers it without being asked. */}
                  <p className="text-[11px] text-black/50">
                    ₱{Number(item.price).toFixed(2)} each
                  </p>
                </div>
                <span className="tabular-nums shrink-0">
                  ₱{(Number(item.price) * item.qty).toFixed(2)}
                </span>
              </div>
            ))}
          </div>

          <Rule />

          {/* Only when there was one. A subtotal line identical to the total
              is noise on a receipt that is read in a few seconds. */}
          {order.discount > 0 && (
            <div className="space-y-1 text-sm mb-3">
              <div className="flex justify-between gap-4">
                <span className="opacity-55">Subtotal</span>
                <span className="tabular-nums">
                  ₱{Number(order.subtotal || order.total).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="opacity-55">
                  {order.promo_code ? `Discount (${order.promo_code})` : 'Discount'}
                </span>
                <span className="tabular-nums">−₱{Number(order.discount).toFixed(2)}</span>
              </div>
            </div>
          )}

          <div className="flex items-baseline justify-between gap-4">
            <span className="text-xs tracking-[0.2em]">TOTAL</span>
            <span className="text-2xl font-extrabold tabular-nums">
              ₱{Number(order.total).toFixed(2)}
            </span>
          </div>

          {order.served_by_name && (
            <div className="mt-3 flex justify-between gap-4 text-sm">
              <span className="opacity-55">Served by</span>
              <span>{order.served_by_name}</span>
            </div>
          )}

          <p className="mt-4 text-center text-xs text-black/45">Salamat po!</p>
        </div>

        {error && <p className="mt-3 text-sm text-diner-accent">{error}</p>}

        <div className="mt-5 space-y-2">
          <button
            onClick={download}
            className="w-full h-11 rounded-full border border-diner-ink/20 inline-flex items-center justify-center gap-2 text-sm"
          >
            <Download size={15} /> Download receipt
          </button>

          {canCancel && (
            <button
              disabled={busy}
              onClick={() =>
                confirm({
                  title: `Cancel ${order.ticket_code}?`,
                  body: 'The food goes back on the shelf and the ticket is closed. You can order again any time.',
                  action: 'Cancel order',
                  danger: true,
                  onConfirm: doCancel,
                })
              }
              className="w-full h-11 rounded-full border border-diner-accent/40 text-diner-accent inline-flex items-center justify-center gap-2 text-sm disabled:opacity-50"
            >
              {busy && <Loader2 size={15} className="animate-spin" />}
              Cancel this order
            </button>
          )}

          {paid && !settled && (
            <p className="text-xs opacity-45 text-center leading-relaxed">
              Already paid for. Ask at the counter if something is wrong with this order.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
