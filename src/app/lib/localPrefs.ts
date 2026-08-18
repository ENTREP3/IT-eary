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
  device: 'bencris.device',
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

// -------------------------------------------------------------- device token
/**
 * This browser's own identity, for ordering without an account.
 *
 * The database used to let anybody read any order from the last 24 hours,
 * because that was the only way a guest ticket could follow itself. This is
 * what replaces it: a random value minted on the first order and kept, which
 * the database matches against the tickets raised with it. A diner sees their
 * own orders and nobody else's, and — because the browser remembers it — they
 * can close the page without writing the code down and still find their way
 * back to a ticket that is still cooking.
 *
 * It is not a secret worth much on its own: it identifies a device, not a
 * person, and it can only ever fetch orders that device itself placed.
 */
export function deviceToken(): string {
  let token = read<string>(KEY.device, '');
  if (!token) {
    token = crypto.randomUUID();
    write(KEY.device, token);
  }
  return token;
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

/**
 * Drops one ticket from this device's list.
 *
 * Used when a diner cancels: leaving it in history would let "Order again"
 * offer back a ticket that no longer exists, and would show a cancelled order
 * among the ones they actually ate.
 */
export function forgetOrder(ticketCode: string) {
  write(
    KEY.history,
    getHistory().filter((o) => o.ticket_code !== ticketCode),
  );
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
