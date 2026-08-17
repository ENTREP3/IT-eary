import React from 'react';
import { motion } from 'motion/react';
import { AlertTriangle, CalendarClock, Clock, X } from 'lucide-react';
import { useOrdersStore, formatOrderTime } from '../../store/ordersStore';
import type { Order } from '../../lib/types';
import { useConfirm } from './useConfirm';

/** Same panel skin the staff screens use elsewhere. */
const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`bg-[#0a0d0a] border border-[#e8dfc8]/10 rounded-2xl ${className}`}>{children}</div>
);

/** How the order was paid, or that it has not been settled yet. */
function PaymentBadge({ method }: { method: Order['payment_method'] }) {
  const style =
    method === 'gcash'
      ? 'bg-[#0074e0]/20 text-[#6dadff]'
      : method === 'cash'
        ? 'bg-[#e8dfc8]/10'
        : 'bg-[#c8442a]/25 text-[#e87a5c]';
  const label = method === 'gcash' ? 'GCash' : method === 'cash' ? 'Cash' : 'Unpaid';
  return <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${style}`}>{label}</span>;
}

/**
 * How long an order may sit in a lane before the board says something.
 *
 * These are deliberately generous. A warning that fires while the cook is still
 * reasonably working gets ignored within a day, and an ignored warning is worse
 * than none because it trains people not to look.
 */
const LATE_AFTER_MINUTES: Record<string, number> = {
  New: 10,        // taken but not started
  Preparing: 25,  // on the stove
  Ready: 15,      // cooked and going cold on the counter
};

const minutesSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);

/** "in 25m", "due now", "35m late" — how the promised collection time is running. */
function pickupState(pickupAt: string | null) {
  if (!pickupAt) return null;
  const mins = Math.round((new Date(pickupAt).getTime() - Date.now()) / 60_000);
  if (mins > 1) return { label: `pickup in ${mins}m`, late: false };
  if (mins >= -1) return { label: 'pickup due now', late: false };
  return { label: `pickup ${Math.abs(mins)}m late`, late: true };
}

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
  const confirm = useConfirm();

  /**
   * Re-renders every half minute so the clock actually moves.
   *
   * Everything else on this board arrives by push from the database, but "12m
   * in preparing" is computed from the current time, and nothing changes in the
   * data as an order grows late. Without this the warning would appear only
   * when some unrelated order happened to update, which is precisely when
   * nobody is looking.
   */
  const [, tick] = React.useState(0);
  React.useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const lanes = [
    { title: 'New', statuses: ['pending', 'paid'], accent: '#6dadff', next: 'preparing' as const, nextLabel: 'Start preparing' },
    { title: 'Preparing', statuses: ['preparing'], accent: '#e8a84a', next: 'ready' as const, nextLabel: 'Mark ready' },
    { title: 'Ready', statuses: ['ready'], accent: '#8cc07a', next: 'completed' as const, nextLabel: 'Complete' },
  ];

  /**
   * When this order actually needs to be ready.
   *
   * An order with no collection time wants feeding now, so it is due the moment
   * it was placed. One booked for later is due later, and that is the whole
   * value of asking: cooking it first would leave it going cold while somebody
   * standing at the counter waits.
   */
  const dueAt = (o: Order) => new Date(o.pickup_at ?? o.created_at).getTime();

  /**
   * Ordered by what is most urgent, not by what arrived first.
   *
   * Plain first-in-first-out ignored the collection times the diners had chosen,
   * so an order booked for an hour away sat at the top of the queue ahead of
   * someone waiting in the shop. Sorting by when each is due puts overdue work
   * first, then ASAP orders, and leaves the scheduled ones until they are close.
   */
  const queue = (statuses: string[]) =>
    orders.filter((o) => statuses.includes(o.status)).sort((a, b) => dueAt(a) - dueAt(b));

  /** Booked far enough ahead that starting it now would only make it worse. */
  const notYet = (o: Order) =>
    o.pickup_at != null && new Date(o.pickup_at).getTime() - Date.now() > 20 * 60_000;

  return (
    <div className="grid lg:grid-cols-3 gap-5">
      {lanes.map((lane) => {
        const list = queue(lane.statuses);
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

            {list.map((o) => {
              // Time in THIS lane, not since the order was placed: an order
              // that waited for payment has not been keeping the kitchen busy.
              const since = lane.title === 'New' ? o.created_at : (o.paid_at ?? o.created_at);
              const waited = minutesSince(since);
              const pickup = pickupState(o.pickup_at);
              // Dimmed rather than hidden. The cook should still see what is
              // coming, just not be drawn to start it yet.
              const later = notYet(o);
              // An order booked for later is not late for sitting there: that is
              // exactly what was asked for. Warning about it would cry wolf on
              // the orders the kitchen is handling correctly.
              const overdue = !later && waited >= (LATE_AFTER_MINUTES[lane.title] ?? 999);

              return (
              <motion.div
                key={o.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Card className={later ? 'p-4 opacity-45' : 'p-4'}>
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
                  {/* The collection time the diner chose. It was being saved and
                      shown to nobody, which made it a promise the kitchen could
                      not keep because the kitchen never heard it. */}
                  {pickup && (
                    <div
                      className={`mt-2 text-[11px] flex items-center gap-1.5 ${
                        pickup.late ? 'text-[#e87a5c]' : 'text-[#6dadff]'
                      }`}
                    >
                      <CalendarClock size={12} />
                      {pickup.label}
                    </div>
                  )}

                  <div className="mt-3 flex items-center justify-between">
                    <span
                      className={`text-[10px] flex items-center gap-1 ${
                        overdue ? 'text-[#e87a5c]' : 'opacity-40'
                      }`}
                    >
                      <Clock size={11} /> {formatOrderTime(o.created_at)}
                      <span className="opacity-80">· {waited}m in {lane.title.toLowerCase()}</span>
                    </span>
                    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }}>₱{o.total}</span>
                  </div>

                  {overdue && (
                    <div className="mt-2 flex items-center gap-1.5 text-[11px] text-[#e87a5c] bg-[#c8442a]/15 rounded-lg px-2 py-1.5">
                      <AlertTriangle size={12} className="shrink-0" />
                      {lane.title === 'Ready'
                        ? 'Cooked and waiting. Call the diner.'
                        : `Sitting ${waited} minutes. Longer than usual.`}
                    </div>
                  )}
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => setStatus(o.ticket_code, lane.next)}
                      className="flex-1 py-2 rounded-lg text-sm font-medium text-[#0a0d0a]"
                      style={{ background: lane.accent }}
                    >
                      {lane.nextLabel}
                    </button>
                    {lane.title === 'New' && (
                      <button
                        onClick={() =>
                          confirm({
                            title: `Cancel ticket ${o.ticket_code}?`,
                            body: 'The diner sees it as cancelled, and it stops counting towards the day. This cannot be undone.',
                            action: 'Cancel the order',
                            danger: true,
                            onConfirm: () => setStatus(o.ticket_code, 'cancelled'),
                          })
                        }
                        className="px-3 py-2 rounded-lg border border-[#e8dfc8]/15 text-[#e87a5c] hover:bg-[#c8442a]/20"
                        aria-label="Cancel order"
                      >
                        <X size={15} />
                      </button>
                    )}
                  </div>
                </Card>
              </motion.div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
