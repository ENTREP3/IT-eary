/**
 * Which dishes this diner is actually entitled to rate, according to the shop.
 */
import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { getHistory, type PastOrder } from './localPrefs';

/** How long a meal stays rateable. Mirrors the rule inside `leave_review`. */
const WINDOW_DAYS = 30;

export type Rateable = Map<string, string>;

/**
 * The same query answers two questions, so it is asked once.
 *
 * Which dishes may be rated, and what this diner has ordered lately —
 * both are "their recent paid orders", and running two queries for one
 * answer is how the two end up disagreeing about what an order is.
 */
let recent: PastOrder[] = [];

const EMPTY: Rateable = new Map();

let current: Rateable = EMPTY;
let inFlight: Promise<void> | null = null;
const listeners = new Set<(value: Rateable) => void>();

/**
 * Dish id to the ticket code that will be used to rate it.
 *
 * A dish eaten more than once maps to the most recent ticket, which is the one
 * the diner is thinking of.
 */
async function fetchRateable(): Promise<Rateable> {
  const since = new Date(Date.now() - WINDOW_DAYS * 86400e3).toISOString();

  // No filter on who: the row-level policy already restricts this to the
  // caller's own orders, and repeating it here would only invite the two rules
  // to disagree later.
  const { data, error } = await supabase
    .from('orders')
    .select('ticket_code, items, paid_at, total, created_at')
    .not('paid_at', 'is', null)
    .gte('paid_at', since)
    .order('paid_at', { ascending: false })
    .limit(50);

  if (error || !data) {
    recent = [];
    return EMPTY;
  }

  /*
   * Kept for the quick-reorder list on the menu, which read only the
   * device's own copy. A diner signed in on a new browser was shown
   * nothing there, having ordered many times — the same shape of bug as
   * the favourites and the ratings.
   */
  recent = data.map((o) => ({
    ticket_code: o.ticket_code,
    placed_at: o.created_at ?? o.paid_at,
    total: Number(o.total ?? 0),
    items: ((o.items ?? []) as Array<{ id?: string; name?: string; qty?: number; price?: number }>).map(
      (i) => ({
        id: i.id ?? '',
        name: i.name ?? '',
        qty: Number(i.qty ?? 1),
        price: Number(i.price ?? 0),
      }),
    ),
  }));

  const map: Rateable = new Map();
  for (const order of data) {
    for (const item of (order.items ?? []) as Array<{ id?: string }>) {
      // Newest first, so the first ticket seen for a dish is the right one.
      if (item?.id && !map.has(item.id)) map.set(item.id, order.ticket_code);
    }
  }
  return map;
}

function publish(next: Rateable) {
  current = next;
  for (const listener of listeners) listener(next);
}

/** Loads once for everybody. Concurrent callers share the one request. */
function refresh(): Promise<void> {
  inFlight ??= fetchRateable()
    .then(publish)
    .catch(() => publish(EMPTY))
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/**
 * Follow the session.
 */
if (typeof window !== 'undefined') {
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      publish(EMPTY);
      return;
    }
    // INITIAL_SESSION, SIGNED_IN, TOKEN_REFRESHED and USER_UPDATED all mean
    // the identity behind the next query may differ from the last one.
    void refresh();
  });
}

export function useRateable(): Rateable {
  const [value, setValue] = useState<Rateable>(current);

  useEffect(() => {
    listeners.add(setValue);
    // Covers a component mounting after the session settled, when no further
    // auth event is coming.
    if (current === EMPTY) void refresh();
    return () => {
      listeners.delete(setValue);
    };
  }, []);

  return value;
}

/** Called after an order is paid for, so the new ticket can be rated at once. */
export function refreshRateable(): void {
  void refresh();
}

/**
 * This diner's recent orders, from the device and from their account.
 */
export function useRecentOrders(): PastOrder[] {
  const [, setTick] = useState(0);

  useEffect(() => {
    const bump = () => setTick((n) => n + 1);
    listeners.add(bump);
    if (current === EMPTY) void refresh();
    return () => {
      listeners.delete(bump);
    };
  }, []);

  const seen = new Set<string>();
  const merged: PastOrder[] = [];
  for (const order of [...getHistory(), ...recent]) {
    if (seen.has(order.ticket_code)) continue;
    seen.add(order.ticket_code);
    merged.push(order);
  }
  return merged
    .sort((a, b) => new Date(b.placed_at).getTime() - new Date(a.placed_at).getTime())
    .slice(0, 10);
}
