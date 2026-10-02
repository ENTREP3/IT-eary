import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Maximize2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { humanError } from '../../lib/errors';
import { useOrdersStore } from '../../store/ordersStore';
import { RefundDialog } from '../shared/RefundDialog';
import type { Order } from '../../lib/types';

/**
 * Refund requests a diner has raised, with the photograph they sent.
 *
 * Its own page rather than a column in the order history. A complaint is work
 * with a queue — somebody is waiting on an answer — and history is a record you
 * read, not a list you act on. Mixing them hides the one thing here that is
 * urgent among hundreds of settled tickets.
 */

type Request = {
  id: string;
  ticket_code: string;
  customer_name: string | null;
  total: number;
  reasons: string[];
  note: string | null;
  proof_path: string;
  status: 'open' | 'approved' | 'declined';
  created_at: string;
  decided_at: string | null;
  decision_note: string | null;
  order_status: string;
};

export function RefundRequests() {
  const [rows, setRows] = useState<Request[]>([]);
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);
  const [refunding, setRefunding] = useState<Order | null>(null);
  const [answering, setAnswering] = useState<string | null>(null);
  const [statedReason, setStatedReason] = useState<string | undefined>();

  const findByTicket = useOrdersStore((s) => s.findByTicket);

  const load = useCallback(async () => {
    const { data, error: err } = await supabase.rpc('refund_requests_for_staff', {
      p_status: filter,
    });
    if (err) setError(humanError(err, 'Could not load the requests.'));
    else setRows((data as Request[]) ?? []);
  }, [filter]);

  useEffect(() => {
    load();
    // A name of its own per mount: a channel that is already subscribed throws
    // when a listener is added to it.
    const channel = supabase
      .channel(`refund-requests-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'refund_requests' }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  const decide = async (id: string, status: 'approved' | 'declined', note?: string) => {
    setBusy(id);
    setError(null);
    try {
      const { error: err } = await supabase.rpc('decide_refund_request', {
        p_id: id,
        p_status: status,
        p_note: note ?? null,
      });
      if (err) throw err;
      await load();
    } catch (e) {
      setError(humanError(e, 'Could not record that.'));
    } finally {
      setBusy(null);
    }
  };

  /**
   * Opens the refund flow, and remembers which request it answers.
   *
   * The request is marked agreed only once the money is recorded as sent,
   * so a dialog that is opened and closed again leaves the queue alone.
   */
  const openRefund = async (code: string, requestId: string, reasons: string[]) => {
    const order = await findByTicket(code);
    if (!order) return;
    setAnswering(requestId);
    // What the diner said, carried straight through, so the counter is not
    // asked to invent a second account of the same event.
    setStatedReason(reasons.join(', '));
    setRefunding(order);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {(['open', 'all'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`h-9 px-4 rounded-full border text-sm transition-colors ${
              filter === f
                ? 'bg-[#e8a84a] text-[#0a0d0a] border-[#e8a84a]'
                : 'border-[#e8dfc8]/15 hover:border-[#e8dfc8]/35'
            }`}
          >
            {f === 'open' ? 'Waiting' : 'All'}
          </button>
        ))}
      </div>

      {error && (
        <div className="text-sm rounded-lg px-3 py-2 bg-[#c8442a]/20 text-[#e87a5c]">{error}</div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-[#e8dfc8]/12 bg-[#0a0d0a] p-6 text-sm opacity-55">
          {filter === 'open'
            ? 'Nothing waiting. Requests appear here the moment a diner sends one.'
            : 'No refund has been asked for yet.'}
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <Row
              key={r.id}
              r={r}
              busy={busy === r.id}
              onZoom={setZoom}
              onDecide={decide}
              onRefund={openRefund}
            />
          ))}
        </div>
      )}

      {zoom && (
        <button
          onClick={() => setZoom(null)}
          className="fixed inset-0 z-50 bg-black/85 grid place-items-center p-6"
        >
          <img src={zoom} alt="" className="max-w-full max-h-full object-contain rounded-xl" />
        </button>
      )}

      {refunding && (
        <RefundDialog
          order={refunding}
          statedReason={statedReason}
          onRefunded={() => {
            if (answering) decide(answering, 'approved');
          }}
          onClose={() => {
            setRefunding(null);
            setAnswering(null);
            setStatedReason(undefined);
          }}
        />
      )}
    </div>
  );
}

function Row({
  r,
  busy,
  onZoom,
  onDecide,
  onRefund,
}: {
  r: Request;
  busy: boolean;
  onZoom: (url: string) => void;
  onDecide: (id: string, status: 'approved' | 'declined', note?: string) => void;
  onRefund: (code: string, requestId: string, reasons: string[]) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);

  // Signed on demand and short-lived. The bucket is private, and a complaint
  // photograph is somebody's meal on a table in their house.
  useEffect(() => {
    let alive = true;
    supabase.storage
      .from('payment-proofs')
      .createSignedUrl(r.proof_path, 300)
      .then(({ data }) => {
        if (alive) setUrl(data?.signedUrl ?? null);
      });
    return () => {
      alive = false;
    };
  }, [r.proof_path]);

  const tone =
    r.status === 'open'
      ? 'border-[#e8a84a]/45'
      : r.status === 'approved'
        ? 'border-semantic-good/40'
        : 'border-[#e8dfc8]/12';

  return (
    <div className={`rounded-2xl border bg-[#0a0d0a] p-4 ${tone}`}>
      <div className="flex flex-wrap items-start gap-4">
        {url ? (
          <button onClick={() => onZoom(url)} className="relative shrink-0 group">
            <img
              src={url}
              alt=""
              className="w-28 h-28 object-cover rounded-xl bg-black/40"
            />
            <span className="absolute bottom-1 right-1 p-1 rounded bg-black/70">
              <Maximize2 size={11} />
            </span>
          </button>
        ) : (
          <div className="w-28 h-28 rounded-xl bg-[#e8dfc8]/5 grid place-items-center shrink-0">
            <Loader2 size={16} className="animate-spin opacity-40" />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono tracking-[0.15em]">{r.ticket_code}</span>
            <span className="text-sm opacity-60">₱{Number(r.total).toFixed(2)}</span>
            {r.customer_name && <span className="text-sm opacity-60">· {r.customer_name}</span>}
            <span className="text-[10px] uppercase tracking-[0.2em] opacity-45">
              {new Date(r.created_at).toLocaleString()}
            </span>
          </div>

          <ul className="mt-2 flex flex-wrap gap-1.5">
            {r.reasons.map((x) => (
              <li
                key={x}
                className="text-[11px] px-2 py-1 rounded-full bg-[#c8442a]/20 text-[#e87a5c]"
              >
                {x}
              </li>
            ))}
          </ul>

          {r.note && <p className="mt-2 text-sm opacity-75 leading-relaxed">{r.note}</p>}

          {r.status === 'open' ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {/* Two answers, because there are only two. Agreeing to a
                  refund and sending it are the same act from the counter’s
                  side, so refunding is what marks the request agreed — a
                  separate "agreed" button only invited the pair to disagree. */}
              <button
                onClick={() => onRefund(r.ticket_code, r.id, r.reasons)}
                className="h-9 px-4 rounded-lg bg-[#e8a84a] text-[#0a0d0a] text-sm font-medium"
              >
                Refund this order
              </button>
              <button
                disabled={busy}
                onClick={() => {
                  // The diner is told this word for word, so it is worth
                  // asking for one rather than sending them silence.
                  const why = window.prompt(
                    'Why is this being turned down? The diner is shown exactly this.',
                  );
                  if (why === null) return;
                  onDecide(r.id, 'declined', why.trim() || undefined);
                }}
                className="h-9 px-3 rounded-lg border border-[#e8dfc8]/15 text-sm inline-flex items-center gap-1.5 disabled:opacity-40"
              >
                <X size={14} /> Turn down
              </button>
            </div>
          ) : (
            <p className="mt-3 text-[12px] opacity-55">
              {r.status === 'approved' ? 'Agreed' : 'Turned down'}
              {r.decided_at ? ` on ${new Date(r.decided_at).toLocaleString()}` : ''}
              {r.order_status === 'refunded' ? ' · the order is refunded' : ''}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
