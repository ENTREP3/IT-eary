/**
 * Turning a diner's "yes, tell me" into an address the shop can reach.
 *
 * Two halves that must not be confused. The browser decides whether we may
 * notify at all, and that answer lives in the browser and survives everything
 * we do. Our database decides where to send, and that is a row that can be
 * added and removed freely. Somebody can have granted permission and have no
 * row — they turned it off in our UI — and that is a perfectly ordinary state,
 * not a bug to reconcile.
 *
 * Permission is never asked for on load. A prompt that appears before anybody
 * has done anything is why people block notifications reflexively, and once
 * blocked a site cannot ask again — the diner has to go into browser settings,
 * which nobody does. One refused prompt costs the shop that customer for good,
 * so the prompt is only ever raised by somebody pressing a button that says
 * what it is for.
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
 *
 * Returns the state afterwards rather than throwing, because every way this
 * can fail has the same consequence for the diner — notifications are off —
 * and a red error over a convenience they just opted into is out of
 * proportion to what was lost.
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
 *
 * Firebase rotates tokens, and a diner who signs up after ordering as a guest
 * has their row pointed at the old anonymous identity. Both leave somebody who
 * agreed to be notified silently unreachable. Calling this on sign-in costs a
 * round trip and fixes both.
 *
 * Raises no prompt: it returns immediately unless permission was already
 * granted, so it can be called on every sign-in without ever being the thing
 * that makes a diner block notifications.
 */
export async function refreshPushRegistration(): Promise<void> {
  if (pushPermission() !== 'granted') return;
  if (!(await pushAvailable())) return;
  await enablePush();
}

/**
 * Shows a notification that arrives while the diner is looking at the site.
 *
 * The service worker only runs when no tab is open, so without this a push
 * that lands while somebody is on the menu is delivered and then silently
 * dropped. Left alone, the notification a diner is most likely to be waiting
 * for — the one that arrives while they are staring at their ticket — is
 * exactly the one they never see.
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
