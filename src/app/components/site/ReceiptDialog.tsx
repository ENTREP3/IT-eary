import React, { useState } from 'react';
import { Download, Link as LinkIcon, Loader2, Share2, X } from 'lucide-react';
import type { Order } from '../../lib/types';
import { useOrdersStore } from '../../store/ordersStore';
import { useBusinessStore } from '../../store/businessStore';
import { humanError } from '../../lib/errors';
import { useConfirm } from '../shared/useConfirm';
import { receiptPng, saveBlob } from '../../lib/receiptImage';
import { dinerOrigin } from '../../lib/surface';

/**
 * The receipt for one order, reopened from the order history.
 */
export function ReceiptDialog({ order, onClose }: { order: Order; onClose: () => void }) {
  const confirm = useConfirm();
  const cancel = useOrdersStore((s) => s.cancel);
  const shop = useBusinessStore((s) => s.profile);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Said when something quietly succeeded, like a link reaching the clipboard. */
  const [note, setNote] = useState<string | null>(null);

  const paid = Boolean(order.paid_at);
  const settled = ['cancelled', 'refunded', 'expired'].includes(order.status);

  /** Only while nothing has been paid and nothing has been settled. */
  const canCancel = !paid && !settled && order.status === 'pending';

  const peso = (n: number) => `PHP ${Number(n ?? 0).toFixed(2)}`;

  /** Saves the receipt as a picture, in the browser's downloads. */
  const download = async () => {
    setError(null);
    try {
      const blob = await receiptPng(order, shop, dinerOrigin());
      saveBlob(blob, `bencris-${order.ticket_code}.png`);
    } catch (e) {
      setError(humanError(e, 'Could not save the receipt.'));
    }
  };

  /**
   * Sends the receipt on, with a way back to the shop.
   */
  const share = async () => {
    setError(null);
    setNote(null);
    const link = dinerOrigin();
    const text = `My order from ${shop.name || 'Bencris'} Karinderya`;

    try {
      const blob = await receiptPng(order, shop, link);
      const file = new File([blob], `bencris-${order.ticket_code}.png`, {
        type: 'image/png',
      });

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ text, url: link, files: [file] });
        return;
      }
      if (navigator.share) {
        await navigator.share({ text, url: link });
        return;
      }
      await navigator.clipboard.writeText(`${text} — ${link}`);
      setNote('Link copied. The receipt is in your downloads if you save it.');
    } catch (e) {
      // Dismissing the share sheet rejects, and that is not a failure worth
      // reporting to somebody who just decided not to send it.
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setError(humanError(e, 'Could not share the receipt.'));
    }
  };

  /**
   * Puts the shop's address on the clipboard.
   */
  const copyLink = async () => {
    setError(null);
    try {
      await navigator.clipboard.writeText(dinerOrigin());
      setNote('Link copied.');
    } catch {
      // Clipboard access can be refused outright. Showing the address is the
      // fallback that always works, since it can be selected by hand.
      setNote(dinerOrigin());
    }
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
    /* A solid panel, not a floating card on a translucent wash.
     */
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      onClick={busy ? undefined : onClose}
    >
      <div
        className="w-full max-w-sm max-h-[92vh] flex flex-col overflow-hidden rounded-3xl bg-diner-ground text-diner-ink border border-diner-ink/10 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-diner-ink/10 shrink-0">
          <span className="text-xs tracking-[0.25em] uppercase opacity-55">Receipt</span>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-2 -mr-2 rounded-full text-diner-ink/60 hover:text-diner-ink"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4">
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
        </div>

        <div className="shrink-0 border-t border-diner-ink/10 p-4 space-y-2">
          {error && <p className="text-sm text-diner-accent">{error}</p>}
          {note && <p className="text-sm text-diner-ink/70">{note}</p>}
          {/* Two different things, so two buttons. Saving puts a picture in
              the downloads folder; sharing hands it to somebody else with a
              way back to the shop. */}
          <div className="flex gap-2">
            <button
              onClick={download}
              className="flex-1 h-11 rounded-full border border-diner-ink/20 inline-flex items-center justify-center gap-2 text-sm hover:border-diner-ink/40"
            >
              <Download size={15} /> Download
            </button>
            <button
              onClick={share}
              className="flex-1 h-11 rounded-full border border-diner-ink/20 inline-flex items-center justify-center gap-2 text-sm hover:border-diner-ink/40"
            >
              <Share2 size={15} /> Share
            </button>
          </div>

          <button
            onClick={copyLink}
            className="w-full h-9 rounded-full text-xs text-diner-ink/60 hover:text-diner-ink inline-flex items-center justify-center gap-1.5"
          >
            <LinkIcon size={13} /> Copy the shop link
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
