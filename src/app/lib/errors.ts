/**
 * What a person should be told when something fails.
 */

type MaybeError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  status?: number | null;
  name?: string | null;
};

/** Our own rules speak for themselves; everything else is translated. */
const OURS = 'P0001';

export function humanError(e: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (!e) return fallback;

  const err = (typeof e === 'object' ? e : {}) as MaybeError;
  const raw = (err.message ?? String(e) ?? '').trim();
  const code = err.code ?? undefined;
  const status = err.status ?? undefined;

  // Written by us, for this exact situation.
  if (code === OURS && raw) return raw;

  const low = raw.toLowerCase();

  // ---- the connection ------------------------------------------------------
  if (
    low.includes('failed to fetch') ||
    low.includes('networkerror') ||
    low.includes('load failed') ||
    err.name === 'TypeError'
  ) {
    return 'Cannot reach the shop right now. Check your connection and try again.';
  }
  if (low.includes('timeout') || low.includes('timed out') || status === 504) {
    return 'That took too long to answer. Please try again.';
  }

  // ---- who you are ---------------------------------------------------------
  if (low.includes('jwt') || low.includes('token is expired') || status === 401) {
    return 'You have been signed out. Please sign in again.';
  }
  if (
    low.includes('row-level security') ||
    low.includes('permission denied') ||
    code === '42501' ||
    status === 403
  ) {
    return 'You do not have permission to do that.';
  }
  if (low.includes('invalid login credentials')) {
    return 'That email and password do not match.';
  }
  // Supabase phrases this several ways depending on which endpoint refused —
  // signup, an email change, or an anonymous guest claiming an address.
  if (
    low.includes('user already registered') ||
    low.includes('already been registered') ||
    low.includes('already registered') ||
    low.includes('already exists') ||
    low.includes('email_exists') ||
    low.includes('user_already_exists')
  ) {
    return 'There is already an account with that email. Try signing in instead.';
  }
  if (low.includes('email not confirmed')) {
    return 'Check your email and confirm the address before signing in.';
  }

  /*
   * "Updating password of an anonymous user without an email or phone is
   * not allowed".
   */
  if (low.includes('anonymous user')) {
    return (
      'That reset link has already been used or has expired. Ask for a new one, ' +
      'and open it in this same browser.'
    );
  }

  // A token that was already spent, or a stale link opened twice.
  if (
    low.includes('otp_expired') ||
    low.includes('token has expired') ||
    low.includes('invalid token') ||
    low.includes('token not found')
  ) {
    return 'That link has expired or was already used. Ask for a new one.';
  }
  if (low.includes('password should be') || low.includes('weak password')) {
    return 'That password is too weak. Use a longer one.';
  }

  // ---- the data ------------------------------------------------------------
  if (code === '23505') return 'That already exists.';
  if (code === '23503') return 'Something this depends on is missing, so it cannot be saved.';
  if (code === '23514' || code === '22P02') return 'One of those values is not allowed.';
  if (code === '23502') return 'Something required was left blank.';
  if (code === 'PGRST116') return 'Nothing was found.';

  // ---- too fast, or our end ------------------------------------------------
  if (status === 429 || low.includes('too many')) {
    // Naming the wait matters: 'a moment' invites trying again in ten
    // seconds, failing, and concluding the site is broken.
    return 'Too many attempts. Wait an hour before asking for another email.';
  }
  if ((status ?? 0) >= 500) {
    return 'The shop system had a problem at its end. Please try again.';
  }

  // Anything left is machinery nobody standing at a counter can act on. The
  // real text still reaches the console for whoever is fixing it.
  if (raw) console.error('[error]', raw, e);
  return fallback;
}
