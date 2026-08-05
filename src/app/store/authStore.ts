import { create } from 'zustand';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Profile, UserRole } from '../lib/types';

type AuthState = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  /** true until the initial session check + profile fetch settles */
  loading: boolean;
  initialized: boolean;

  init: () => void;
  refreshProfile: () => Promise<void>;

  /**
   * Signs in, then verifies the account holds one of `allowed` — otherwise
   * signs back out so nobody is left in a half-authenticated state.
   */
  loginStaff: (email: string, password: string, allowed: UserRole[]) => Promise<void>;

  /**
   * Customer sign-up and sign-in.
   *
   * Ordering never requires either: an account only adds memory across visits.
   * The signup trigger always assigns the inert `customer` role server-side, so
   * nothing here can grant staff access however the form is tampered with.
   */
  signUpCustomer: (email: string, password: string) => Promise<{ needsConfirmation: boolean }>;
  loginCustomer: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) {
    console.error('[auth] failed to load profile', error);
    return null;
  }
  return data as Profile;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  profile: null,
  loading: true,
  initialized: false,

  init: () => {
    if (get().initialized) return;
    set({ initialized: true });

    // 1. Hydrate from any persisted session.
    supabase.auth.getSession().then(async ({ data }) => {
      const session = data.session;
      const profile = session?.user ? await fetchProfile(session.user.id) : null;
      set({ session, user: session?.user ?? null, profile, loading: false });
    });

    // 2. Keep state in sync with future auth events (login, logout, refresh).
    supabase.auth.onAuthStateChange(async (_event, session) => {
      const profile = session?.user ? await fetchProfile(session.user.id) : null;
      set({ session, user: session?.user ?? null, profile, loading: false });
    });
  },

  refreshProfile: async () => {
    const user = get().user;
    if (!user) return;
    set({ profile: await fetchProfile(user.id) });
  },

  loginStaff: async (email, password, allowed) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    const profile = data.user ? await fetchProfile(data.user.id) : null;
    if (!profile || !allowed.includes(profile.role)) {
      await supabase.auth.signOut();
      throw new Error('This account is not authorized for that area.');
    }
    set({ session: data.session, user: data.user, profile, loading: false });
  },

  signUpCustomer: async (email, password) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;

    // With email confirmation switched on there is no session yet, so the
    // caller has to tell the diner to check their inbox rather than silently
    // appearing to do nothing.
    if (!data.session) return { needsConfirmation: true };

    const profile = data.user ? await fetchProfile(data.user.id) : null;
    set({ session: data.session, user: data.user, profile, loading: false });
    return { needsConfirmation: false };
  },

  loginCustomer: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const profile = data.user ? await fetchProfile(data.user.id) : null;
    set({ session: data.session, user: data.user, profile, loading: false });
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, user: null, profile: null });
  },
}));
