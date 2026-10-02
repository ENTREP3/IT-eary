import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

/**
 * The three figures the dashboard used to describe but never computed.
 */

type Metrics = {
  orders_counted: number;
  average_order: number;
  buyers: number;
  repeat_buyers: number;
  repeat_rate: number;
  menu_visitors: number;
  conversion_rate: number;
  carts_started: number;
  carts_abandoned: number;
  abandon_rate: number;
};

export function ShopMetrics({ days = 30 }: { days?: number }) {
  const [m, setM] = useState<Metrics | null>(null);

  useEffect(() => {
    let alive = true;
    supabase.rpc('shop_metrics', { p_days: days }).then(({ data }) => {
      const row = Array.isArray(data) ? data[0] : data;
      if (alive && row) setM(row as Metrics);
    });
    return () => {
      alive = false;
    };
  }, [days]);

  if (!m) return null;

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
      <Figure
        label="Average order"
        value={`₱${Number(m.average_order).toFixed(2)}`}
        note={`Across ${m.orders_counted} paid ticket${m.orders_counted === 1 ? '' : 's'}.`}
      />

      <Figure
        label="Repeat buyers"
        value={`${Number(m.repeat_rate).toFixed(1)}%`}
        note={
          m.buyers === 0
            ? 'Nobody has bought yet.'
            : `${m.repeat_buyers} of ${m.buyers} bought more than once. A guest counts by device.`
        }
      />

      <Figure
        label="Menu to ticket"
        value={m.menu_visitors === 0 ? '—' : `${Number(m.conversion_rate).toFixed(1)}%`}
        note={
          m.menu_visitors === 0
            ? 'Counting starts from the first visit after this was added.'
            : `${m.orders_counted} paid of ${m.menu_visitors} who opened the menu.`
        }
      />

      <Figure
        label="Carts abandoned"
        value={m.carts_started === 0 ? '—' : `${Number(m.abandon_rate).toFixed(1)}%`}
        note={
          m.carts_started === 0
            ? 'Counted from the first cart started after this was added.'
            : `${m.carts_abandoned} of ${m.carts_started} filled a cart and left.`
        }
      />
    </div>
  );
}

function Figure({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-2xl border border-[#e8dfc8]/12 bg-[#0a0d0a] p-4">
      <div className="text-[10px] tracking-[0.25em] uppercase opacity-50">{label}</div>
      <div
        style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }}
        className="text-3xl mt-1 tabular-nums"
      >
        {value}
      </div>
      <p className="text-[11px] opacity-50 mt-1.5 leading-relaxed">{note}</p>
    </div>
  );
}
