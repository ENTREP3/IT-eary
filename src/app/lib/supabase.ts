import { createClient } from '@supabase/supabase-js';

// These come from .env.local (see .env.example). Vite only exposes vars
// prefixed with VITE_ to the browser.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  // Fail loudly in dev rather than producing confusing "fetch failed" errors.
  // eslint-disable-next-line no-console
  console.error(
    '[IT-eary] Missing Supabase env vars. Copy .env.example to .env.local and run `npx supabase start`.',
  );
}

export const supabase = createClient(url ?? 'http://localhost:55321', anonKey ?? 'missing-anon-key', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

export const isSupabaseConfigured = Boolean(url && anonKey);
