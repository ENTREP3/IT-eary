import React, { useEffect, useState } from 'react';
import { Loader2, Maximize2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { deviceToken } from '../../lib/localPrefs';
import type { Order } from '../../lib/types';

/**
 * What the shop sent back, shown to the person who was refunded.
 *
 * The shop kept a screenshot for its own protection and showed the customer
 * nothing, which is the wrong way round — the proof is most use to the person
 * waiting for the money.
 */

type Refund = {
  amount: number;
  method: string | null;
  reason: string | null;
  issued_at: string;
  proof_path: string | null;
};

export function RefundNotice({ order }: { order: Order }) {
  const [refund, setRefund] = useState<Refund | null>(null);
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    supabase
      .rpc('my_refund', {
        p_ticket_code: order.ticket_code,
        p_device_token: deviceToken(),
      })
      .then(({ data }) => {
        if (!alive) return;
        setRefund((Array.isArray(data) ? data[0] : data) ?? null);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [order.ticket_code]);

  // Signed separately, and allowed to fail: a guest can see that the refund
  // happened but not the screenshot, because storage rules cannot check a
  // device the way the function above can.
  useEffect(() => {
    if (!refund?.proof_path) return;
    let alive = true;
    supabase.storage
      .from('payment-proofs')
      .createSignedUrl(refund.proof_path, 300)
      .then(({ data }) => {
        if (alive) setProofUrl(data?.signedUrl ?? null);
      });
    return () => {
      alive = false;
    };
  }, [refund?.proof_path]);

  if (loading || !refund) return null;

  return (
    <div className="mt-3 rounded-2xl border border-semantic-cash/40 bg-semantic-cash/10 p-4">
      <div className="text-[10px] tracking-[0.25em] uppercase text-semantic-cash">
        Refunded
      </div>

      <div className="mt-1 flex items-baseline gap-2">
        <span
          style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}
          className="text-2xl tabular-nums"
        >
          ₱{Number(refund.amount).toFixed(2)}
        </span>
        <span className="text-xs opacity-60">
          {refund.method === 'gcash' ? 'sent by GCash' : 'in cash'}
        </span>
      </div>

      <div className="text-[11px] opacity-55 mt-1">
        {new Date(refund.issued_at).toLocaleString()}
        {refund.reason ? ` · ${refund.reason}` : ''}
      </div>

      {proofUrl ? (
        <button onClick={() => setZoom(true)} className="relative mt-3 block w-full">
          <img
            src={proofUrl}
            alt="The shop's proof that it sent the refund"
            className="w-full max-h-56 object-contain rounded-xl bg-black/5"
          />
          <span className="absolute bottom-2 right-2 flex items-center gap-1 px-2 py-1 rounded-lg bg-black/70 text-white text-[11px]">
            <Maximize2 size={11} /> Enlarge
          </span>
        </button>
      ) : refund.method === 'gcash' ? (
        <p className="text-[11px] opacity-55 mt-2 leading-relaxed">
          Ask at the counter if you need a copy of the transfer.
        </p>
      ) : null}

      {zoom && proofUrl && (
        <button
          onClick={() => setZoom(false)}
          className="fixed inset-0 z-[70] bg-black/85 grid place-items-center p-6"
        >
          <img src={proofUrl} alt="" className="max-w-full max-h-full object-contain rounded-xl" />
        </button>
      )}
    </div>
  );
}

/** Only worth asking the database when the order says it was refunded. */
export function maybeRefunded(order: Order) {
  return order.status === 'refunded';
}
