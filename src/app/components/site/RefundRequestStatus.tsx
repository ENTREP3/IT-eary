import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { deviceToken } from '../../lib/localPrefs';
import type { Order } from '../../lib/types';

/**
 * Where a diner's own refund request stands.
 *
 * Without this a request went in and nothing came back: the ticket looked
 * exactly as it had before, so the only way to find out was to return to the
 * counter and ask — which is what sending the request was meant to save.
 */

export type RequestState = {
  status: 'open' | 'approved' | 'declined';
  reasons: string[];
  note: string | null;
  decision_note: string | null;
  created_at: string;
  decided_at: string | null;
};

/** Reads the diner's latest request for a ticket, or null. */
export function useMyRefundRequest(order: Order, reloadKey = 0) {
  const [state, setState] = useState<RequestState | null>(null);

  useEffect(() => {
    let alive = true;
    supabase
      .rpc('my_refund_request', {
        p_ticket_code: order.ticket_code,
        p_device_token: deviceToken(),
      })
      .then(({ data }) => {
        if (!alive) return;
        setState((Array.isArray(data) ? data[0] : data) ?? null);
      });
    return () => {
      alive = false;
    };
  }, [order.ticket_code, reloadKey]);

  return state;
}

export function RefundRequestStatus({ request }: { request: RequestState }) {
  // Agreed is said by the refund itself — the money arrives and the ticket
  // reads refunded — so repeating it here would be two notices for one event.
  if (request.status === 'approved') return null;

  const waiting = request.status === 'open';

  return (
    <div
      className={`mt-3 rounded-2xl border p-4 ${
        waiting
          ? 'border-diner-ink/20 bg-diner-card'
          : 'border-diner-accent/40 bg-diner-accent/10'
      }`}
    >
      <div
        className={`text-[10px] tracking-[0.25em] uppercase ${
          waiting ? 'opacity-55' : 'text-diner-accent'
        }`}
      >
        {waiting ? 'Refund asked' : 'Refund not agreed'}
      </div>

      <p className="text-sm mt-1 leading-relaxed">
        {waiting
          ? 'The counter has your photo and reasons. You will be told once somebody has looked at it.'
          : request.decision_note ||
            'Ask at the counter if you would like to talk about it.'}
      </p>

      <p className="text-[11px] opacity-50 mt-2">
        {request.reasons.join(', ')} ·{' '}
        {new Date(request.decided_at ?? request.created_at).toLocaleString()}
      </p>
    </div>
  );
}
