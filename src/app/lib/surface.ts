/**
 * Which of the three faces of this system the visitor has opened.
 *
 * The shop runs one bundle on three addresses — the storefront, the owner's
 * dashboard and the counter — because they share a router, a session and every
 * store behind them. Splitting them into three builds would mean three copies
 * of that to keep in step, for a difference nobody can see.
 *
 * The address decides which one you land on, so a cashier opens
 * bencris-cashier.iteary.site and is at the till, rather than at the menu with
 * a path to remember.
 *
 * This is presentation, not protection. Every staff screen is still behind
 * RequireRole, and every table behind RLS — a diner typing the admin address
 * gets the sign-in wall exactly as they would typing /admin. Hiding a door is
 * not the same as locking it, and the lock is elsewhere.
 */
export type Surface = 'diner' | 'admin' | 'cashier';

/** Subdomain prefixes, matched before the first dot. */
const ADMIN = 'bencris-admin';
const CASHIER = 'bencris-cashier';

export function surfaceFor(hostname: string): Surface {
  const first = hostname.toLowerCase().split('.')[0];
  if (first === ADMIN) return 'admin';
  if (first === CASHIER) return 'cashier';
  return 'diner';
}

/**
 * The surface this page is being served as.
 *
 * Read once at module load rather than per render: the address cannot change
 * without a full navigation, and re-reading it on every render invites a
 * component to disagree with its neighbour about which app it is in.
 */
export const SURFACE: Surface = surfaceFor(
  typeof window === 'undefined' ? '' : window.location.hostname,
);
