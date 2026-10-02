/**
 * Turning a diner's "yes, tell me" into an address the shop can reach.
 */
import { supabase } from './supabase';
import { requestPushToken, pushAvailable, pushPermission } from './firebase';
import { getMessaging, onMessage } from 'firebase/messaging';
import { initializeApp, getApps } from 'firebase/app';
import { firebaseConfig } from './firebase';

/**
 * The token this browser last registered.
 *
 * Kept so turning notifications off can name the exact device to forget rather
 * than wiping every device the diner owns. A phone and a laptop are two rows,
 * and switching the laptop off should leave the phone alone.
 */
const TOKEN_KEY = 'bencris.push.token';

function remembered(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function remember(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private browsing; the row still exists server-side and still works */
  }
}

export type PushState =
  /** This browser cannot do it, or the site is not configured for it. */
  | 'unsupported'
  /** Possible, and the diner has not been asked. */
  | 'off'
  /** Registered; notifications will arrive. */
  | 'on'
  /** The diner said no, and the browser will not let us ask again. */
  | 'blocked';

export async function pushState(): Promise<PushState> {
  if (!(await pushAvailable())) return 'unsupported';
  if (pushPermission() === 'denied') return 'blocked';
  return remembered() ? 'on' : 'off';
}

/**
 * Asks, then records where to send.
 */
export async function enablePush(): Promise<PushState> {
  const token = await requestPushToken();
  if (!token) {
    return pushPermission() === 'denied' ? 'blocked' : 'off';
  }

  const { error } = await supabase.rpc('register_push_token', {
    p_token: token,
    p_platform: 'web',
    // Enough to tell a phone from a laptop on a "your devices" list, and
    // nothing that identifies a person.
    p_label: navigator.userAgent.slice(0, 120),
  });

  // The browser said yes but we could not record it, so we are not actually
  // reachable. Saying "on" here would be a lie the diner discovers by missing
  // the notification they asked for.
  if (error) return 'off';

  remember(token);
  return 'on';
}

/** Stops notifications to this device, leaving the diner's others alone. */
export async function disablePush(): Promise<PushState> {
  const token = remembered();
  if (token) {
    await supabase.rpc('forget_push_token', { p_token: token });
    remember(null);
  }
  return (await pushAvailable()) ? 'off' : 'unsupported';
}

/**
 * Re-registers a token that is already granted, quietly.
 */
export async function refreshPushRegistration(): Promise<void> {
  if (pushPermission() !== 'granted') return;
  if (!(await pushAvailable())) return;
  await enablePush();
}

/**
 * Shows a notification that arrives while the diner is looking at the site.
 */
export function watchForegroundPush(onNotice: (title: string, body: string) => void): () => void {
  if (pushPermission() !== 'granted') return () => {};
  try {
    const app = getApps()[0] ?? initializeApp(firebaseConfig);
    const unsubscribe = onMessage(getMessaging(app), (payload) => {
      const d = payload.data ?? {};
      onNotice(d.title ?? 'Bencris', d.body ?? '');
    });
    return unsubscribe;
  } catch {
    return () => {};
  }
}
