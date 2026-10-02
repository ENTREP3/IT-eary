import { create } from 'zustand';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Profile, UserRole } from '../lib/types';

/** What the signup form collects beyond an email and a password. */
export type NewAccount = {
  firstName: string;
  middleName?: string;
  lastName: string;
  nickname?: string;
  phone?: string;
};

type AuthState = {
  session: Session | null;

  /**
   * The signed-in account, or null.
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
  signUpCustomer: (
    email: string,
    password: string,
    details: NewAccount,
  ) => Promise<{ needsConfirmation: boolean }>;
  loginCustomer: (email: string, password: string) => Promise<void>;
  /**
   * Sends the email that lets somebody back into an account they are locked
   * out of. The link lands on /reset-password, which is the only page that can
   * set a new one.
   */
  sendPasswordReset: (email: string) => Promise<void>;
  /** Sets a new password for whoever the reset link signed in. */
  setNewPassword: (password: string) => Promise<void>;
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

    /**
     * Whether this page load is somebody arriving from an email link.
     */
    const arrivingFromALink = () => {
      if (typeof window === 'undefined') return false;
      if (window.location.pathname.startsWith('/reset-password')) return true;
      const url = window.location.hash + window.location.search;
      return /access_token=|token_hash=|type=recovery|[?&]code=/.test(url);
    };

    // 1. Hydrate from any persisted session, minting one if there is none.
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) return settle(data.session);

      // Wait for the real one rather than racing it with a guest.
      if (arrivingFromALink()) return settle(null);

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

  signUpCustomer: async (email, password, details) => {
    // Carried on the auth user so the database trigger can put them on the
      // profile the moment it creates it. Passing them afterwards would mean
      // a second call that can fail on its own, leaving an account with no
      // name on it.
    const data = {
      first_name: details.firstName.trim(),
      middle_name: details.middleName?.trim() || null,
      last_name: details.lastName.trim(),
      nickname: details.nickname?.trim() || null,
      phone: details.phone?.trim() || null,
    };

    /**
     * A guest signing up is upgraded in place, not replaced.
     */
    if (get().identity?.is_anonymous) {
      const { error: upgradeError } = await supabase.auth.updateUser(
        { email, password, data },
        // Same reason as the signup below: an address change is confirmed
        // by email too, and that link must come back here.
        { emailRedirectTo: window.location.origin },
      );
      if (upgradeError) throw upgradeError;

      /**
       * The profile row already exists for a guest, created when the
       * anonymous account was, so the trigger that reads this metadata has
       * long since run and will not run again. Written directly instead.
       */
      const { error: profileError } = await supabase.rpc('save_my_profile', {
        p_first_name: data.first_name,
        p_last_name: data.last_name,
          p_middle_name: data.middle_name,
        p_nickname: data.nickname,
        p_phone: data.phone,
      });
      if (profileError) throw profileError;
      // Still anonymous until the address is confirmed, which is right: the
      // perks belong to a confirmed account.
      return { needsConfirmation: true };
    }

    const { data: created, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data,
        /*
         * Where the confirmation link lands, said explicitly.
         */
        emailRedirectTo: window.location.origin,
      },
    });
    if (error) throw error;

    /**
     * Signing up with an address that already has an account does not fail.
     */
    if (!created.session === null && created.user?.identities?.length === 0) {
      throw new Error('User already registered');
    }

    // With email confirmation switched on there is no session yet, so the
    // caller has to tell the diner to check their inbox rather than silently
    // appearing to do nothing.
    if (!created.session) return { needsConfirmation: true };

    const profile = created.user ? await fetchProfile(created.user.id) : null;
    set({ session: created.session, user: created.user, profile, loading: false });
    return { needsConfirmation: false };
  },

  loginCustomer: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const profile = data.user ? await fetchProfile(data.user.id) : null;
    set({ session: data.session, user: data.user, profile, loading: false });
  },

  sendPasswordReset: async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      // Supabase will only send somebody to an address on its own allow list,
      // so this has to match the Redirect URLs in the dashboard exactly.
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) throw error;
  },

  setNewPassword: async (password) => {
    /**
     * Refuse before asking, when the session is not the one from the link.
     */
    const { data } = await supabase.auth.getUser();
    if (!data.user || data.user.is_anonymous) {
      throw new Error(
        'This reset link is no longer valid. Ask for a new one and open it in this same browser.',
      );
    }

    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
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
