import React from 'react';
import { Printer, Download, Check } from 'lucide-react';
import { downloadTextFile } from '../lib/exportCsv';
import type { Order } from '../lib/types';

const STORE_NAME = 'Bencris Karinderya';

function peso(n: number) {
  return `₱${Number(n).toFixed(2)}`;
}

function methodLabel(order: Order) {
  if (order.payment_method === 'gcash') return 'GCash';
  if (order.payment_method === 'cash') return 'Cash';
  return 'Unpaid';
}

/** Plain-text receipt sized for an 80mm thermal roll (32 columns). */
export function buildReceiptText(order: Order) {
  const W = 32;
  const line = (l: string, r: string) => l + r.padStart(Math.max(1, W - l.length));
  const rule = '-'.repeat(W);

  const out: string[] = [
    STORE_NAME.padStart(Math.floor((W + STORE_NAME.length) / 2)),
    '',
    `Ticket:  ${order.ticket_code}`,
    `Date:    ${new Date(order.paid_at ?? order.created_at).toLocaleString()}`,
  ];
  if (order.customer_name) out.push(`Name:    ${order.customer_name}`);
  out.push(`Payment: ${methodLabel(order)}`, rule);

  for (const item of order.items ?? []) {
    out.push(`${item.qty} x ${item.name}`);
    out.push(line('', peso(item.qty * item.price)));
  }

  out.push(rule, line('TOTAL', peso(order.total)), '', 'Salamat po!', '');
  return out.join('\n');
}

export function downloadReceipt(order: Order) {
  downloadTextFile(`receipt-${order.ticket_code}.txt`, buildReceiptText(order));
}

export function Receipt({
  order,
  onPrint,
  className = '',
}: {
  order: Order;
  onPrint?: () => void;
  className?: string;
}) {
  return (
    <div className={className}>
      <div
        id="receipt-printable"
        className="bg-white text-[#1a1a1a] rounded-2xl p-6 font-mono text-sm shadow-lg"
      >
        <div className="text-center">
          <div
            style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}
            className="text-xl tracking-tight"
          >
            {STORE_NAME}
          </div>
          <div className="mt-3 inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.2em] text-[#3a5a3a]">
            <Check size={13} /> {order.paid_at ? 'Paid' : 'Unpaid'}
          </div>
        </div>

        <div className="mt-5 space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="opacity-60">Ticket</span>
            <span className="font-bold tracking-[0.2em]">{order.ticket_code}</span>
          </div>
          <div className="flex justify-between">
            <span className="opacity-60">Date</span>
            <span>{new Date(order.paid_at ?? order.created_at).toLocaleString()}</span>
          </div>
          {order.customer_name && (
            <div className="flex justify-between">
              <span className="opacity-60">Name</span>
              <span>{order.customer_name}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="opacity-60">Payment</span>
            <span>{methodLabel(order)}</span>
          </div>
        </div>

        <div className="my-4 border-t border-dashed border-[#1a1a1a]/30" />

        <div className="space-y-2">
          {(order.items ?? []).map((item, i) => (
            <div key={i} className="flex justify-between gap-3">
              <span className="min-w-0">
                {item.qty} × {item.name}
                <span className="block text-[10px] opacity-50">{peso(item.price)} each</span>
              </span>
              <span className="whitespace-nowrap">{peso(item.qty * item.price)}</span>
            </div>
          ))}
        </div>

        <div className="my-4 border-t border-dashed border-[#1a1a1a]/30" />

        <div className="flex justify-between items-baseline">
          <span className="uppercase tracking-[0.2em] text-xs">Total</span>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }} className="text-2xl">
            {peso(order.total)}
          </span>
        </div>

        <div className="mt-5 text-center text-[11px] opacity-50">Salamat po!</div>
      </div>

      <div className="mt-4 flex gap-3 print:hidden">
        <button
          onClick={onPrint ?? (() => window.print())}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#e8a84a] text-[#0a0d0a] text-sm font-medium"
        >
          <Printer size={15} /> Print
        </button>
        <button
          onClick={() => downloadReceipt(order)}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-current/20 text-sm"
        >
          <Download size={15} /> Download
        </button>
      </div>
    </div>
  );
}
