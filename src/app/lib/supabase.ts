import { createClient } from '@supabase/supabase-js';

// These come from .env.local (see .env.example). Vite only exposes vars
// prefixed with VITE_ to the browser.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  // Fail loudly rather than producing confusing "fetch failed" errors. There is
  // no local fallback on purpose: quietly pointing at a second database is how
  // the app and the dashboard end up disagreeing about what the data is.
  // eslint-disable-next-line no-console
  console.error(
    '[Bencris] Missing Supabase env vars. Copy .env.example to .env.local and fill in the ' +
      'project URL and publishable key from the Supabase dashboard (Settings, API).',
  );
}

export const supabase = createClient(url ?? 'https://unconfigured.invalid', anonKey ?? 'missing-anon-key', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,

    /**
     * Read the session out of the address bar when one is there.
     *
     * This was off, and that single line broke every email link the shop can
     * send. A reset link arrives as `#access_token=...`; with detection
     * disabled the client never looks, so no session is ever created from it.
     * The page then waits, finds nobody signed in, and reports the link as
     * expired — within seconds of it being clicked, which is exactly how it
     * looked. The same applies to a signup confirmation.
     *
     * The failure was convincing because everything downstream behaved
     * sensibly: the token really was unused, there really was no session, and
     * the only session present was the anonymous one every visitor carries.
     * Setting a password on that is what produced "Updating password of an
     * anonymous user", several layers away from the cause.
     *
     * Turning it on means the client inspects the URL on load, which is what
     * `authStore` now expects: it deliberately does not mint a guest identity
     * while a link is being exchanged, so the two cannot race.
     */
    detectSessionInUrl: true,
  },
});

export const isSupabaseConfigured = Boolean(url && anonKey);
