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
};

type State = {
  profile: BusinessProfile;
  loaded: boolean;
  load: () => Promise<void>;
  save: (patch: Partial<BusinessProfile>) => Promise<void>;
};

export const useBusinessStore = create<State>((set, get) => ({
  profile: FALLBACK,
  loaded: false,

  async load() {
    const { data, error } = await supabase.from('business_settings').select('*').eq('id', 1).single();
    if (error || !data) {
      set({ loaded: true });
      return;
    }
    set({
      loaded: true,
      profile: {
        ...FALLBACK,
        ...data,
        hours: Array.isArray(data.hours) && data.hours.length ? (data.hours as Hours[]) : FALLBACK.hours,
      },
    });
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
