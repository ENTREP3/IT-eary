import { create } from 'zustand';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Profile, UserRole } from '../lib/types';

type AuthState = {
  session: Session | null;

  /**
   * The signed-in account, or null.
   *
   * Deliberately null for an anonymous session. Every visitor now has one —
   * that is how a guest ticket becomes provably theirs — so `user` is no longer
   * a usable test for "has an account", and leaving it set would have shown the
   * whole account screen, loyalty card and promotions to people who never
   * signed up for anything. Anything that means "a real account" reads this.
   */
  user: User | null;

  /** The session's user id, real or anonymous. What owns the orders. */
  identity: User | null;

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
  identity: null,
  user: null,
  profile: null,
  loading: true,
  initialized: false,

  init: () => {
    if (get().initialized) return;
    set({ initialized: true });

    /**
     * Anonymous is real, but it is not an account.
     *
     * A visitor with no session gets one silently, so the orders they place
     * belong to somebody the database can name. They are never asked, never
     * told, and never see a difference — the only thing it changes is that
     * their ticket is theirs and nobody else's.
     */
    const settle = async (session: Session | null) => {
      const anonymous = session?.user?.is_anonymous === true;
      const profile =
        session?.user && !anonymous ? await fetchProfile(session.user.id) : null;
      set({
        session,
        identity: session?.user ?? null,
        user: anonymous ? null : (session?.user ?? null),
        profile,
        loading: false,
      });
    };

    // 1. Hydrate from any persisted session, minting one if there is none.
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) return settle(data.session);

      const { data: anon, error } = await supabase.auth.signInAnonymously();
      // A shop whose sign-in is unreachable should still take orders. Without a
      // session the order is placed unattached, which is the behaviour the
      // system had for its whole life until now.
      if (error) return settle(null);
      settle(anon.session);
    });

    // 2. Keep state in sync with future auth events (login, logout, refresh).
    supabase.auth.onAuthStateChange(async (_event, session) => settle(session));
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
    /**
     * A guest signing up is upgraded in place, not replaced.
     *
     * Calling signUp() while an anonymous session exists would mint a second
     * user and strand every order the first one placed — the diner would make
     * an account and watch their history vanish. Attaching the address to the
     * user they already are keeps it.
     */
    if (get().identity?.is_anonymous) {
      const { error: upgradeError } = await supabase.auth.updateUser({ email, password });
      if (upgradeError) throw upgradeError;
      // Still anonymous until the address is confirmed, which is right: the
      // perks belong to a confirmed account.
      return { needsConfirmation: true };
    }

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
    set({ session: null, identity: null, user: null, profile: null });

    // Straight back to being a guest with a name, rather than nobody at all.
    // Without this the next order they place would belong to no one and they
    // could not look it up afterwards.
    const { data } = await supabase.auth.signInAnonymously();
    if (data.session) set({ session: data.session, identity: data.session.user });
  },
}));
