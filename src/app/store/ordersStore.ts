import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { Order, PaymentMethod, PaymentStatus } from '../lib/types';

type OrdersState = {
  /** Orders from roughly the last 7 days, newest first (admin view). */
  orders: Order[];
  loading: boolean;
  loadRecent: () => Promise<void>;
  /**
   * Orders further back than the live feed keeps, for the history screen.
   *
   * Returned rather than stored. The list in state is what the dashboard,
   * kitchen and today's figures all read from, and quietly widening it to
   * ninety days would put three-month-old tickets on the kitchen board.
   */
  loadHistory: (days: number) => Promise<Order[]>;
  subscribe: () => () => void;
  /** Looks a ticket up by the code the diner shows at the counter. */
  findByTicket: (ticketCode: string) => Promise<Order | null>;
  /**
   * Records payment. Server-side guards reject non-staff and double payment.
   * `status` carries which of the three outcomes the cashier took.
   */
  markPaid: (args: {
    ticketCode: string;
    method: PaymentMethod;
    status?: PaymentStatus;
    inPerson?: boolean;
    note?: string | null;
  }) => Promise<Order>;
  /**
   * Short-lived signed URL for a GCash receipt. The bucket is private, so a
   * public URL would never resolve — and these images carry the sender's real
   * name and mobile number.
   */
  signedProofUrl: (proofPath: string) => Promise<string | null>;
  /**
   * Owner clearing a flagged sale after checking the real GCash history.
   * `verified: false` cancels the order — the money never arrived.
   */
  resolveReview: (ticketCode: string, verified: boolean, note?: string) => Promise<Order>;
  setStatus: (ticketCode: string, status: Order['status']) => Promise<void>;
  /**
   * Hands the money back. The database decides whether it is allowed — the
   * shop's rule is that a refund is only possible while the food can still go
   * back in the platter, and that gate cannot live in a screen.
   */
  refund: (args: {
    ticketCode: string;
    reason: string;
    method?: PaymentMethod;
    note?: string | null;
  }) => Promise<Order>;
};

const PROOF_BUCKET = 'payment-proofs';

export const useOrdersStore = create<OrdersState>((set, get) => ({
  orders: [],
  loading: false,

  loadRecent: async () => {
    set({ loading: true });
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .gte('created_at', sevenDaysAgo)
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) {
      console.error('[orders] failed to load', error);
      set({ loading: false });
      return;
    }
    set({ orders: (data as Order[]) ?? [], loading: false });
  },

  loadHistory: async (days) => {
    let q = supabase.from('orders').select('*').order('created_at', { ascending: false });
    // 0 means everything the shop has ever taken.
    if (days > 0) {
      q = q.gte('created_at', new Date(Date.now() - days * 86400000).toISOString());
    }
    const { data, error } = await q.limit(2000);
    if (error) throw error;
    return (data as Order[]) ?? [];
  },

  // Realtime: prepend new orders as they come in. Returns an unsubscribe fn.
  subscribe: () => {
    const channel = supabase
      .channel('orders-feed')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders' },
        (payload) => {
          const order = payload.new as Order;
          set((s) =>
            s.orders.some((o) => o.id === order.id)
              ? s
              : { orders: [order, ...s.orders] },
          );
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders' },
        (payload) => {
          const order = payload.new as Order;
          set((s) => ({
            orders: s.orders.map((o) => (o.id === order.id ? order : o)),
          }));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },

  findByTicket: async (ticketCode) => {
    const code = ticketCode.trim().toUpperCase();
    if (!code) return null;
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('ticket_code', code)
      .maybeSingle();
    if (error) throw error;
    return (data as Order) ?? null;
  },

  markPaid: async ({ ticketCode, method, status = 'verified', inPerson = false, note = null }) => {
    const { data, error } = await supabase.rpc('mark_ticket_paid', {
      p_ticket_code: ticketCode.trim().toUpperCase(),
      p_method: method,
      p_status: status,
      p_in_person: inPerson,
      p_note: note,
    });
    if (error) throw error;
    const order = data as Order;
    set((s) => ({ orders: s.orders.map((o) => (o.id === order.id ? order : o)) }));
    return order;
  },

  resolveReview: async (ticketCode, verified, note) => {
    const { data, error } = await supabase.rpc('resolve_payment_review', {
      p_ticket_code: ticketCode.trim().toUpperCase(),
      p_verified: verified,
      p_note: note ?? null,
    });
    if (error) throw error;
    const order = data as Order;
    set((s) => ({ orders: s.orders.map((o) => (o.id === order.id ? order : o)) }));
    return order;
  },

  signedProofUrl: async (proofPath) => {
    const { data, error } = await supabase.storage
      .from(PROOF_BUCKET)
      .createSignedUrl(proofPath, 300);
    // A missing object is a real possibility — the path is recorded separately
    // from the upload — so surface nothing rather than throwing at the counter.
    if (error) return null;
    return data?.signedUrl ?? null;
  },

  /**
   * Moves an order along the kitchen flow.
   *
   * Goes through advance_order_status() rather than updating the row directly.
   * The direct write it replaced looked identical from the counter, because the
   * staff update policy allows it, but it skipped every guard the function
   * exists to apply: food could be started on a ticket nobody had paid for, any
   * staff member could cancel rather than only the owner, and completed_at was
   * never stamped. That last one is why every completed order in the database
   * has a null completion time.
   *
   * Keyed by ticket code because that is what the function takes, and what the
   * counter actually reads off the diner's phone.
   */
  refund: async ({ ticketCode, reason, method, note = null }) => {
    const { data, error } = await supabase.rpc('refund_order', {
      p_ticket_code: ticketCode.trim().toUpperCase(),
      p_reason: reason,
      p_method: method ?? null,
      p_note: note,
    });
    if (error) throw new Error(error.message);
    const order = data as Order;
    set((s) => ({ orders: s.orders.map((o) => (o.id === order.id ? order : o)) }));
    return order;
  },

  setStatus: async (ticketCode, status) => {
    const { error } = await supabase.rpc('advance_order_status', {
      p_ticket_code: ticketCode,
      p_status: status,
    });
    if (error) throw new Error(error.message);
    set((s) => ({
      orders: s.orders.map((o) =>
        o.ticket_code === ticketCode
          ? { ...o, status, completed_at: status === 'completed' ? new Date().toISOString() : o.completed_at }
          : o,
      ),
    }));
  },
}));

// ----------------------------------------------------------------------------
// Pure analytics helpers derived from the loaded orders (used by the dashboard).
// ----------------------------------------------------------------------------
/**
 * Whether a ticket is money the shop actually took.
 *
 * Every sales figure runs through this. A ticket used to count from the moment
 * it was created, so a diner filling a cart moved the day's takings and a
 * cancelled order stayed in them forever. A sale is a payment the counter
 * confirmed, on an order that still exists.
 *
 * Refunded orders are out for the same reason cancelled ones are: the money is
 * back in the diner's hands. The serving went back in the platter too, so the
 * shop never bore its cost either.
 *
 * `needs_review` deliberately does not count. The food was released so the
 * diner was not left standing there, but nobody has yet checked the money
 * against the real GCash history — the dashboard's reconciliation card is where
 * that becomes a sale or an admission that it never was one.
 */
export function countsAsSale(o: Order) {
  return o.paid_at !== null && o.status !== 'cancelled' && o.status !== 'refunded';
}

/** A ticket the shop can still hand money back on, per the shop's own rule. */
export function isRefundable(o: Order) {
  return o.paid_at !== null && (o.status === 'paid' || o.status === 'preparing');
}

export function paymentMix(orders: Order[]) {
  let gcash = 0;
  let cash = 0;
  for (const o of orders.filter(countsAsSale)) {
    // payment_method is null until a cashier settles the ticket — an unpaid
    // ticket is not evidence of how the diner will eventually pay.
    if (o.payment_method === 'gcash') gcash++;
    else if (o.payment_method === 'cash') cash++;
  }
  const total = gcash + cash;
  return {
    gcash,
    cash,
    total,
    gcashPct: total ? Math.round((gcash / total) * 100) : 0,
    cashPct: total ? Math.round((cash / total) * 100) : 0,
  };
}

export function ordersToday(orders: Order[]) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return orders.filter((o) => new Date(o.created_at) >= start);
}

export function hourlyPulse(orders: Order[]) {
  const today = ordersToday(orders);
  const buckets = new Map<number, number>();
  for (const o of today) {
    const h = new Date(o.created_at).getHours();
    buckets.set(h, (buckets.get(h) ?? 0) + 1);
  }
  // 6am → 9pm service window
  const out: { hr: string; orders: number }[] = [];
  for (let h = 6; h <= 21; h++) {
    const label = h === 12 ? '12P' : h > 12 ? `${h - 12}P` : `${h}A`;
    out.push({ hr: label, orders: buckets.get(h) ?? 0 });
  }
  return out;
}

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Gross sales per day for the last 7 days (oldest → newest). */
export function salesByDay(orders: Order[]) {
  const out: { day: string; sales: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    const sales = orders
      .filter((o) => {
        const t = new Date(o.created_at);
        return t >= d && t < next && countsAsSale(o);
      })
      .reduce((a, o) => a + Number(o.total), 0);
    out.push({ day: DAY[d.getDay()], sales });
  }
  return out;
}

export function totalSales(orders: Order[]) {
  return orders.filter(countsAsSale).reduce((a, o) => a + Number(o.total), 0);
}

/** Best-selling dishes by quantity across the loaded orders. */
export function bestSellers(orders: Order[], limit = 5) {
  const tally = new Map<string, number>();
  for (const o of orders.filter(countsAsSale)) {
    for (const item of o.items ?? []) {
      tally.set(item.name, (tally.get(item.name) ?? 0) + (item.qty ?? 0));
    }
  }
  return [...tally.entries()]
    .map(([name, qty]) => ({ name, qty }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, limit);
}

export function formatOrderTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function itemsSummary(items: Order['items']) {
  return (items ?? [])
    .map((i) => (i.qty > 1 ? `${i.name} x${i.qty}` : i.name))
    .join(', ');
}
