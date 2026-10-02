/**
 * Which of the three faces of this system the visitor has opened.
 */
export type Surface = 'diner' | 'admin' | 'cashier';

/**
 * Matched on the end of the label before the first dot, not the whole of it.
 */
const ADMIN = '-admin';
const CASHIER = '-cashier';

export function surfaceFor(hostname: string): Surface {
  const first = hostname.toLowerCase().split('.')[0];
  if (first.endsWith(ADMIN)) return 'admin';
  if (first.endsWith(CASHIER)) return 'cashier';
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

/**
 * The address a customer uses, worked out from wherever this is running.
 */
export function dinerOrigin(): string {
  if (typeof window === 'undefined') return '';

  const { protocol, host, hostname } = window.location;
  const [first, ...rest] = hostname.split('.');
  const label = first.toLowerCase();

  if (!label.endsWith(ADMIN) && !label.endsWith(CASHIER)) return `${protocol}//${host}`;

  // bencris-admin -> bencris, iteary-cashier -> iteary. Only the suffix is
  // removed, so whatever the sites are named keeps working.
  const diner = label.endsWith(ADMIN)
    ? label.slice(0, -ADMIN.length)
    : label.slice(0, -CASHIER.length);

  // The port travels with the host, which matters on a development machine.
  const port = window.location.port ? `:${window.location.port}` : '';
  return `${protocol}//${[diner, ...rest].join('.')}${port}`;
}
