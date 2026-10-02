/**
 * How long a diner may change a rating they have left.
 */
const AN_HOUR = 60 * 60 * 1000;

export function stillEditable(ratedAt: string | undefined): boolean {
  if (!ratedAt) return true; // nothing rated yet, so nothing is settled
  const at = new Date(ratedAt).getTime();
  if (Number.isNaN(at)) return true;
  return Date.now() - at < AN_HOUR;
}
