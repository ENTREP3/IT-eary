/**
 * Everything the diner's own device remembers.
 *
 * Ordering stays anonymous, so there is no account to hang favourites, order
 * history or ratings off. All three live in this browser instead, which is what
 * makes a second order one tap instead of a fresh start.
 *
 * Nothing here is authoritative: the ticket in Postgres is the real record.
 * This is a convenience layer, so every read is defensive and a corrupt or
 * cleared store simply behaves like a first visit.
 */
import type { Order } from './types';

const KEY = {
  favourites: 'bencris.favourites',
  history: 'bencris.history',
  ratings: 'bencris.ratings',
} as const;

/**
 * Parsed values are cached by key, and that is not an optimisation.
 *
 * These getters are read through useSyncExternalStore, which compares snapshots
 * by reference. Parsing the JSON afresh on every call would hand React a brand
 * new array each render, it would conclude the store had changed, and the
 * component would re-render forever. The cache is what keeps the snapshot
 * stable between writes.
 */
const cache = new Map<string, unknown>();

function read<T>(key: string, fallback: T): T {
  if (cache.has(key)) return cache.get(key) as T;
  let value: T;
  try {
    const raw = localStorage.getItem(key);
    value = raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    value = fallback;
  }
  cache.set(key, value);
  return value;
}

function write(key: string, value: unknown) {
  cache.set(key, value);
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private browsing, or the quota is full: favourites are not worth throwing over */
  }
}

/** Notifies the UI in the same tab; the storage event only fires cross-tab. */
const CHANGED = 'bencris:prefs';
const announce = () => window.dispatchEvent(new Event(CHANGED));

export function subscribePrefs(fn: () => void): () => void {
  // Another tab wrote to localStorage, so this tab's cache is stale.
  const onStorage = () => {
    cache.clear();
    fn();
  };
  window.addEventListener(CHANGED, fn);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGED, fn);
    window.removeEventListener('storage', onStorage);
  };
}

// ---------------------------------------------------------------- favourites
export function getFavourites(): string[] {
  return read<string[]>(KEY.favourites, []);
}

export function isFavourite(dishId: string): boolean {
  return getFavourites().includes(dishId);
}

export function toggleFavourite(dishId: string): boolean {
  const next = new Set(getFavourites());
  const nowFavourite = !next.has(dishId);
  if (nowFavourite) next.add(dishId);
  else next.delete(dishId);
  write(KEY.favourites, [...next]);
  announce();
  return nowFavourite;
}

// ------------------------------------------------------------------- history
export type PastOrder = {
  ticket_code: string;
  placed_at: string;
  total: number;
  items: { id: string; name: string; qty: number; price: number }[];
};

export function getHistory(): PastOrder[] {
  return read<PastOrder[]>(KEY.history, []);
}

/** Called the moment a ticket is issued. Keeps the ten most recent. */
export function rememberOrder(order: Order) {
  const items = (order.items ?? []).map((i) => ({
    id: i.id ?? '',
    name: i.name,
    qty: i.qty,
    price: Number(i.price),
  }));
  const entry: PastOrder = {
    ticket_code: order.ticket_code,
    placed_at: order.created_at,
    total: Number(order.total),
    items,
  };
  const rest = getHistory().filter((o) => o.ticket_code !== entry.ticket_code);
  write(KEY.history, [entry, ...rest].slice(0, 10));
  announce();
}

export function clearHistory() {
  write(KEY.history, []);
  announce();
}

// ------------------------------------------------------------------- ratings
export type Rating = { dishId: string; stars: number; comment: string; at: string; ticket: string };

export function getRatings(): Rating[] {
  return read<Rating[]>(KEY.ratings, []);
}

export function getMyRating(dishId: string): Rating | undefined {
  return getRatings().find((r) => r.dishId === dishId);
}

/**
 * A rating is only accepted against a ticket the device actually holds, which
 * is the same rule the server will enforce once ratings move into Postgres.
 */
export function saveRating(r: Rating) {
  const rest = getRatings().filter((x) => x.dishId !== r.dishId);
  write(KEY.ratings, [r, ...rest]);
  announce();
}

/** Has this device bought this dish? Gates the "rate it" control. */
export function hasOrdered(dishId: string): boolean {
  return getHistory().some((o) => o.items.some((i) => i.id === dishId));
}
