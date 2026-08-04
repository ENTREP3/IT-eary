/**
 * The single source for who Bencris is.
 *
 * The landing page, the trust pages, the receipt and the page metadata all read
 * from here, so the shop's details are corrected in one place rather than eight.
 *
 * Values in [square brackets] are placeholders the owner still has to confirm.
 * They are deliberately obvious on screen so nobody ships them by accident.
 */

export const BUSINESS = {
  name: 'Bencris',
  kind: 'Karinderya',
  tagline: 'Kain na, tayo na.',
  blurb:
    'Home-cooked Filipino food served fresh every day in Dasmariñas Bayan. ' +
    'Check what is actually cooking before you make the trip.',

  /** Street-level address. Bracketed parts are still to be confirmed. */
  address: {
    line: '[Stall number and building]',
    district: 'Dasmariñas Bayan',
    city: 'Dasmariñas',
    province: 'Cavite',
    country: 'Philippines',
  },

  hours: [
    { days: 'Monday to Saturday', opens: '6:00 AM', closes: '8:00 PM' },
    { days: 'Sunday', opens: '6:00 AM', closes: '2:00 PM' },
  ],

  contact: {
    phone: '[09XX XXX XXXX]',
    /** Diners never need this; it is here for the trust pages. */
    email: '[bencris@example.com]',
  },

  priceRange: '₱',
} as const;

export const addressOneLine = [
  BUSINESS.address.line,
  BUSINESS.address.district,
  `${BUSINESS.address.city}, ${BUSINESS.address.province}`,
].join(', ');

/** "Mon to Sat, 6:00 AM to 8:00 PM" for tight spaces like the header. */
export const hoursOneLine = BUSINESS.hours
  .map((h) => `${h.days}, ${h.opens} to ${h.closes}`)
  .join(' · ');

/**
 * Is the shop open right now? Used for the live "Open now" pill.
 * Deliberately simple: parses the 12-hour strings above rather than pulling in
 * a date library for two rows of opening times.
 */
export function isOpenNow(now = new Date()): boolean {
  const row = now.getDay() === 0 ? BUSINESS.hours[1] : BUSINESS.hours[0];
  const toMinutes = (t: string) => {
    const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(t.trim());
    if (!m) return null;
    let h = Number(m[1]) % 12;
    if (m[3].toUpperCase() === 'PM') h += 12;
    return h * 60 + Number(m[2]);
  };
  const open = toMinutes(row.opens);
  const close = toMinutes(row.closes);
  if (open === null || close === null) return false;
  const mins = now.getHours() * 60 + now.getMinutes();
  return mins >= open && mins < close;
}
