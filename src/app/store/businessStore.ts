import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { BUSINESS } from '../lib/business';

/**
 * The shop's own details, read from the database so the owner can change them.
 *
 * The constants in lib/business.ts remain as the fallback for the first paint
 * and for the case where the row cannot be read: a landing page with no address
 * at all is worse than one showing the seeded placeholder.
 */

export type Hours = { days: string; opens: string; closes: string };

/**
 * What the storefront shows, chosen by the owner.
 *
 * A missing key means on. That way a shop that has never opened this screen
 * looks exactly as it always did, and nothing disappears because a column was
 * added.
 */
export type Storefront = {
  ratings: boolean;
  comments: boolean;
  bestseller: boolean;
  low_stock: boolean;
  sold_out: boolean;
  recommended: boolean;

  /** Quote every review above the star threshold, or only the ones picked. */
  reviews_source: 'all' | 'picked';
  /** Reviews below this are never quoted, however they were chosen. */
  reviews_min_stars: number;
  /** How many are on screen at once. */
  reviews_per_batch: number;
  /** Seconds each batch stays before the next. 0 means do not cycle. */
  reviews_seconds: number;
  /** Seconds each dish stays behind the headline. 0 means hold on the first. */
  hero_seconds: number;

  /**
   * Bestseller suggestions the owner has already turned down, against the sales
   * figure at the time they said no.
   *
   * Keeping the number rather than a plain list is what stops this becoming
   * nagware: a dish declined at 30 sold stays quiet, but if it climbs to 45 the
   * question is a genuinely new one and worth asking again. Admin-side state
   * riding in the storefront row rather than a table of its own, because it is
   * one small object and it is read on the same fetch.
   */
  bestseller_dismissed: Record<string, number>;
};

export const STOREFRONT_DEFAULTS: Storefront = {
  ratings: true, comments: true, bestseller: true,
  low_stock: true, sold_out: true, recommended: true,
  reviews_source: 'all', reviews_min_stars: 4, reviews_per_batch: 2, reviews_seconds: 8,
  hero_seconds: 7,
  bestseller_dismissed: {},
};

export type BusinessProfile = {
  name: string;
  tagline: string;
  blurb: string;
  address_line: string;
  district: string;
  city: string;
  province: string;
  phone: string;
  email: string;
  hours: Hours[];
  /** Address the printed QR code points at. Empty until the owner sets it. */
  app_download_url: string;
  storefront: Storefront;
};

const FALLBACK: BusinessProfile = {
  name: BUSINESS.name,
  tagline: BUSINESS.tagline,
  blurb: BUSINESS.blurb,
  address_line: BUSINESS.address.line,
  district: BUSINESS.address.district,
  city: BUSINESS.address.city,
  province: BUSINESS.address.province,
  phone: BUSINESS.contact.phone,
  email: '',
  hours: BUSINESS.hours as unknown as Hours[],
  app_download_url: '',
  storefront: STOREFRONT_DEFAULTS,
};

/**
 * The last profile this device saw, kept so the first paint is already right.
 *
 * The row takes a few hundred milliseconds to arrive from Supabase. Painting
 * the bundled constants in the meantime showed a tagline the shop had changed
 * and then swapped it, which is a visible flicker on every refresh; waiting
 * instead left the largest text on the page blank for the whole round trip.
 * Remembering the answer avoids both, because on every visit after the first
 * the value painted immediately is the value the network is about to confirm.
 */
const CACHE_KEY = 'bencris.business.v1';

function cached(): BusinessProfile {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return FALLBACK;
    const parsed = JSON.parse(raw) as Partial<BusinessProfile>;
    return {
      ...FALLBACK,
      ...parsed,
      hours: Array.isArray(parsed.hours) && parsed.hours.length ? parsed.hours : FALLBACK.hours,
    };
  } catch {
    return FALLBACK;
  }
}

function remember(profile: BusinessProfile) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(profile));
  } catch {
    // A full or blocked localStorage costs us the head start, nothing more.
  }
}

type State = {
  profile: BusinessProfile;
  loaded: boolean;
  load: () => Promise<void>;
  save: (patch: Partial<BusinessProfile>) => Promise<void>;
};

export const useBusinessStore = create<State>((set, get) => ({
  profile: cached(),
  loaded: false,

  async load() {
    const { data, error } = await supabase.from('business_settings').select('*').eq('id', 1).single();
    if (error || !data) {
      set({ loaded: true });
      return;
    }
    const profile: BusinessProfile = {
      ...FALLBACK,
      ...data,
      hours: Array.isArray(data.hours) && data.hours.length ? (data.hours as Hours[]) : FALLBACK.hours,
      storefront: { ...STOREFRONT_DEFAULTS, ...((data.storefront ?? {}) as Partial<Storefront>) },
    };
    remember(profile);
    set({ loaded: true, profile });
  },

  async save(patch) {
    const next = { ...get().profile, ...patch };
    set({ profile: next });
    const { error } = await supabase
      .from('business_settings')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', 1);
    if (error) throw new Error(error.message);
  },
}));

/** "Stall 12, Dasmariñas Bayan, Dasmariñas, Cavite" */
export function addressOf(p: BusinessProfile): string {
  return [p.address_line, p.district, [p.city, p.province].filter(Boolean).join(', ')]
    .filter(Boolean)
    .join(', ');
}

/** Whether the shop is open right now, against the owner's own hours. */
export function isOpenNow(hours: Hours[], now = new Date()): boolean {
  const row = now.getDay() === 0 ? (hours[1] ?? hours[0]) : hours[0];
  if (!row) return false;
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
