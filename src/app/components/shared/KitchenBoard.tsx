import React from 'react';
import { motion } from 'motion/react';
import { Clock, X } from 'lucide-react';
import { useOrdersStore, formatOrderTime } from '../../store/ordersStore';
import type { Order } from '../../lib/types';

/** Same panel skin the staff screens use elsewhere. */
const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`bg-[#0a0d0a] border border-[#e8dfc8]/10 rounded-2xl ${className}`}>{children}</div>
);

/**
 * The live order queue, shared by the owner dashboard and the counter.
 *
 * In a karinderya this size the person on the till is also the person calling
 * to the kitchen, so keeping this board owner-only made it useless in practice.
 * Both staff screens mount the same component; the database decides who may
 * actually advance a status.
 */
export function KitchenBoard({ orders }: { orders: Order[] }) {
  const setStatus = useOrdersStore((s) => s.setStatus);

  const lanes = [
    { title: 'New', statuses: ['pending', 'paid'], accent: '#6dadff', next: 'preparing' as const, nextLabel: 'Start preparing' },
    { title: 'Preparing', statuses: ['preparing'], accent: '#e8a84a', next: 'ready' as const, nextLabel: 'Mark ready' },
    { title: 'Ready', statuses: ['ready'], accent: '#8cc07a', next: 'completed' as const, nextLabel: 'Complete' },
  ];

  const fifo = (statuses: string[]) =>
    orders
      .filter((o) => statuses.includes(o.status))
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  return (
    <div className="grid lg:grid-cols-3 gap-5">
      {lanes.map((lane) => {
        const list = fifo(lane.statuses);
        return (
          <div key={lane.title} className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: lane.accent }} />
              <span className="text-sm tracking-[0.15em] uppercase opacity-70">{lane.title}</span>
              <span className="text-xs opacity-40">({list.length})</span>
            </div>

            {list.length === 0 && (
              <Card className="p-5 text-sm opacity-40 border-dashed">Nothing here.</Card>
            )}

            {list.map((o) => (
              <motion.div
                key={o.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Card className="p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-mono tracking-[0.15em] text-[#e8a84a]">
                      {o.ticket_code}
                    </span>
                    <PaymentBadge method={o.payment_method} />
                  </div>
                  <div className="mt-2 space-y-0.5">
                    {(o.items ?? []).map((it, idx) => (
                      <div key={idx} className="text-sm flex justify-between gap-2">
                        <span className="opacity-85">{it.qty} × {it.name}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-[10px] opacity-40 flex items-center gap-1">
                      <Clock size={11} /> {formatOrderTime(o.created_at)}
                    </span>
                    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }}>₱{o.total}</span>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => setStatus(o.id, lane.next)}
                      className="flex-1 py-2 rounded-lg text-sm font-medium text-[#0a0d0a]"
                      style={{ background: lane.accent }}
                    >
                      {lane.nextLabel}
                    </button>
                    {lane.title === 'New' && (
                      <button
                        onClick={() => setStatus(o.id, 'cancelled')}
                        className="px-3 py-2 rounded-lg border border-[#e8dfc8]/15 text-[#e87a5c] hover:bg-[#c8442a]/20"
                        aria-label="Cancel order"
                      >
                        <X size={15} />
                      </button>
                    )}
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
