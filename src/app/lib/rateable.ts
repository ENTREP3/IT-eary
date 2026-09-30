/**
 * Which dishes this diner is actually entitled to rate, according to the shop.
 *
 * The device already keeps its own list of what it ordered, and for a long
 * time that was the only list there was — ordering was anonymous, so there was
 * nowhere else to put it. It works right up until the diner is somewhere else:
 * ordered on their phone and looking at a laptop, cleared their browser,
 * opened the real site having tested on localhost. In every one of those the
 * button to rate a meal they genuinely ate is simply absent, and nothing
 * explains why.
 *
 * The database has always known better. `leave_review` asks only that the
 * ticket was paid, is under thirty days old, and contained the dish — it never
 * cared which browser was used. This closes the gap by asking it.
 *
 * ---------------------------------------------------------------------------
 * One query, shared, and reloaded when the session changes
 *
 * Both of those matter, and the second is a bug this file had on its first
 * attempt.
 *
 * Shared, because every dish card on the menu needs the same answer. A hook
 * that fetched per card issued twenty-five identical queries on every visit to
 * the menu.
 *
 * Reloaded on sign-in, because Supabase restores a session from storage
 * asynchronously. A query fired the instant a component mounts can easily run
 * before the session is back, in which case row-level security correctly shows
 * it nothing — and a list loaded once at mount then stays empty forever. The
 * diner is signed in, has eaten the dish, and the button never appears.
 *
 * That failure is invisible in development, because there the device history
 * usually has the order anyway and covers for it.
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
 *
 * Signing in is the moment this becomes answerable, and signing out is the
 * moment the answer stops being this person's. Registered once at module load
 * rather than per component, so the number of subscriptions does not grow with
 * the number of dishes on the menu.
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
 *
 * Merged rather than one or the other: the device covers a guest who never
 * signed in, and the account covers somebody on a browser they have not used
 * before. Duplicates are collapsed on the ticket code, which is the same
 * order seen from both sides.
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
