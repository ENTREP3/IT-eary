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
    detectSessionInUrl: false,
  },
});

export const isSupabaseConfigured = Boolean(url && anonKey);
