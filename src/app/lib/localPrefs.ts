/**
 * Everything the diner's own device remembers.
 */
import type { Order } from './types';

const KEY = {
  favourites: 'bencris.favourites',
  history: 'bencris.history',
  ratings: 'bencris.ratings',
  device: 'bencris.device',
  cart: 'bencris.cart',
} as const;

/**
 * Parsed values are cached by key, and that is not an optimisation.
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

/**
 * Replaces the whole list, used when the account and the device are merged.
 *
 * Separate from toggleFavourite because it is a different operation: that
 * one is a diner's decision, this one is two lists being reconciled.
 */
export function setFavourites(dishIds: string[]) {
  write(KEY.favourites, [...new Set(dishIds)]);
  announce();
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

/**
 * This device’s rating for a dish, on one ticket.
 *
 * A rating belongs to a meal, not to a dish. Without the ticket, rating
 * Chicken Curry once made every later Chicken Curry look rated — the stars
 * appeared filled in on an order nobody had rated, and said they could no
 * longer be changed.
 *
 * Called without one it answers the looser question: has this dish been
 * rated at all? That is what a dish card on the menu wants to know.
 */
export function getMyRating(dishId: string, ticket?: string): Rating | undefined {
  return getRatings().find(
    (r) => r.dishId === dishId && (ticket === undefined || r.ticket === ticket),
  );
}

/**
 * A rating is only accepted against a ticket the device actually holds, which
 * is the same rule the server will enforce once ratings move into Postgres.
 */
export function saveRating(r: Rating) {
  // Keyed by the meal: the same dish on a later visit is a separate rating,
  // and replacing by dish alone threw the earlier one away.
  const rest = getRatings().filter(
    (x) => !(x.dishId === r.dishId && x.ticket === r.ticket),
  );
  write(KEY.ratings, [r, ...rest]);
  announce();
}

/** Has this device bought this dish? Gates the "rate it" control. */
export function hasOrdered(dishId: string): boolean {
  return getHistory().some((o) => o.items.some((i) => i.id === dishId));
}

/** What is in the cart, as ids and counts. */
export type SavedLine = { id: string; qty: number };

/**
 * The cart, kept so a refresh does not empty it.
 *
 * Ids and counts only — never names or prices. Those come from the menu
 * when the cart is rebuilt, so a dish that changed price or sold out
 * overnight cannot be ordered at yesterday’s terms out of a stale copy
 * sitting in somebody’s browser.
 */
export function getCart(): SavedLine[] {
  const raw = read<SavedLine[]>(KEY.cart, []);
  return Array.isArray(raw) ? raw.filter((l) => l && l.id && l.qty > 0) : [];
}

export function saveCart(lines: SavedLine[]) {
  write(KEY.cart, lines);
}
