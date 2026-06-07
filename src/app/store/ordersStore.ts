import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { Order, OrderItem, PaymentMethod } from '../lib/types';

function newReference() {
  return 'KM' + Math.floor(Math.random() * 900000 + 100000);
}

type PlaceOrderArgs = {
  items: OrderItem[];
  total: number;
  paymentMethod: PaymentMethod;
  customerName?: string | null;
};

type OrdersState = {
  /** Orders from roughly the last 7 days, newest first (admin view). */
  orders: Order[];
  loading: boolean;
  loadRecent: () => Promise<void>;
  subscribe: () => () => void;
  placeOrder: (args: PlaceOrderArgs) => Promise<Order>;
  setStatus: (id: string, status: Order['status']) => Promise<void>;
};

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

  placeOrder: async ({ items, total, paymentMethod, customerName }) => {
    const { data: auth } = await supabase.auth.getUser();
    const row = {
      reference: newReference(),
      customer_id: auth.user?.id ?? null,
      customer_name: customerName ?? null,
      items,
      total,
      payment_method: paymentMethod,
      // GCash is treated as paid on confirm; cash is collected at the counter.
      status: paymentMethod === 'gcash' ? 'paid' : 'pending',
    };
    const { data, error } = await supabase
      .from('orders')
      .insert(row)
      .select('*')
      .single();
    if (error) throw error;
    return data as Order;
  },

  setStatus: async (id, status) => {
    const { error } = await supabase.from('orders').update({ status }).eq('id', id);
    if (error) throw error;
    set((s) => ({ orders: s.orders.map((o) => (o.id === id ? { ...o, status } : o)) }));
  },
}));

// ----------------------------------------------------------------------------
// Pure analytics helpers derived from the loaded orders (used by the dashboard).
// ----------------------------------------------------------------------------
export function paymentMix(orders: Order[]) {
  let gcash = 0;
  let cash = 0;
  for (const o of orders) {
    if (o.payment_method === 'gcash') gcash++;
    else cash++;
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
        return t >= d && t < next;
      })
      .reduce((a, o) => a + Number(o.total), 0);
    out.push({ day: DAY[d.getDay()], sales });
  }
  return out;
}

export function totalSales(orders: Order[]) {
  return orders.reduce((a, o) => a + Number(o.total), 0);
}

/** Best-selling dishes by quantity across the loaded orders. */
export function bestSellers(orders: Order[], limit = 5) {
  const tally = new Map<string, number>();
  for (const o of orders) {
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
