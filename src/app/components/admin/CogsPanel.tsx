import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

/**
 * Cost of goods sold, and the gross profit above it.
 *
 * The dashboard's existing profit line is sales minus what was BOUGHT that day,
 * which is cash flow rather than profit. Buy a sack of rice on Monday and Monday
 * reads as a loss while the rest of the week looks unusually good, though
 * nothing about the business changed.
 *
 * COGS is the cost of what was actually SOLD. Sales minus COGS answers a
 * different and more useful question: is the food priced properly, regardless of
 * when the shopping happened.
 */

type Row = {
  day: string;
  sales: number;
  cogs: number;
  gross: number;
  margin_pct: number;
};

const peso = (n: number) => `₱${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export function CogsPanel() {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    supabase.rpc('cogs_by_day', { p_days: 7 }).then(({ data, error }) => {
      // Absent until the migration is applied, or empty until ingredients are
      // costed. Either way this is an extra, so it stays quiet rather than
      // breaking the screen around it.
      setRows(error ? [] : ((data ?? []) as Row[]));
    });
  }, []);

  if (!rows || rows.length === 0) return null;

  const sales = rows.reduce((n, r) => n + Number(r.sales), 0);
  const cogs = rows.reduce((n, r) => n + Number(r.cogs), 0);
  const gross = sales - cogs;
  const margin = sales ? Math.round((gross / sales) * 1000) / 10 : 0;

  // Zero COGS means no dish has a full costed recipe yet, so the "gross profit"
  // would read as 100% and be worse than showing nothing.
  if (cogs <= 0) {
    return (
      <section className="rounded-2xl border border-[#e8dfc8]/12 bg-[#0a0d0a] p-5">
        <h3 className="text-sm font-medium mb-1">Cost of goods sold</h3>
        <p className="text-[12px] opacity-55 max-w-xl leading-relaxed">
          Put a price per unit on each ingredient in Inventory and this will show
          what the food you sold actually cost to make, and the profit above it.
          It uses the recipes you already have, so there is nothing extra to type.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-[#e8dfc8]/12 bg-[#0a0d0a] p-5">
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <h3 className="text-sm font-medium">Cost of goods sold</h3>
        <span className="text-[10px] tracking-[0.2em] uppercase opacity-45">Last 7 days</span>
      </div>
      <p className="text-[12px] opacity-55 mb-4">
        What the food you actually sold cost to make, at today's ingredient prices.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Figure label="Sales" value={peso(sales)} />
        <Figure label="Cost of goods" value={peso(cogs)} />
        <Figure label="Gross profit" value={peso(gross)} accent />
        <Figure label="Gross margin" value={`${margin}%`} accent={margin >= 50} />
      </div>

      <div className="mt-4 space-y-1.5">
        {rows.map((r) => (
          <div key={r.day} className="flex items-center gap-3 text-[12px]">
            <span className="w-20 shrink-0 opacity-55">
              {new Date(r.day).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })}
            </span>
            <div className="flex-1 h-2 rounded-full bg-[#e8dfc8]/8 overflow-hidden flex">
              <span
                className="h-full bg-[#c8442a]"
                style={{ width: `${Math.min(100, (Number(r.cogs) / Math.max(1, Number(r.sales))) * 100)}%` }}
              />
              <span className="h-full bg-[#8cc07a] flex-1" />
            </div>
            <span className="w-24 text-right tabular-nums opacity-70">{peso(r.gross)}</span>
            <span className="w-12 text-right tabular-nums opacity-45">{r.margin_pct}%</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-4 text-[11px] opacity-45">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#c8442a]" /> Cost
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#8cc07a]" /> Profit
        </span>
      </div>
    </section>
  );
}

function Figure({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-[#e8dfc8]/10 p-3">
      <div className="text-[10px] tracking-[0.2em] uppercase opacity-45">{label}</div>
      <div
        className={`text-lg mt-1 tabular-nums ${accent ? 'text-[#8cc07a]' : ''}`}
        style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }}
      >
        {value}
      </div>
    </div>
  );
}
