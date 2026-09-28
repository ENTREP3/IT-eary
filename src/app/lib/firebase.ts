/**
 * Firebase, used for one thing only: reaching a diner who closed the app.
 *
 * Everything else here talks to Supabase. Firebase is present because Cloud
 * Messaging is the only way to make a phone buzz when nothing of ours is
 * running, and because the Android app will need FCM regardless — going
 * through it on the web too means one sender, one credential and one token
 * table instead of two parallel paths.
 *
 * ---------------------------------------------------------------------------
 * Why this configuration is in source rather than in .env.local
 *
 * It is not a secret. Firebase's own documentation says so: these values
 * identify the project, they do not authorise anything. Whatever protects the
 * data is elsewhere — for us, Supabase RLS.
 *
 * More to the point, it *cannot* live in an environment variable. The service
 * worker that receives a push while the tab is closed is a standalone file
 * served as-is from /firebase-messaging-sw.js. It is never touched by Vite, so
 * `import.meta.env` means nothing inside it and the config has to be written
 * out literally there. Keeping a second copy in .env.local would mean two
 * places to change and one of them silently going stale.
 */
import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getMessaging, getToken, isSupported, type Messaging } from 'firebase/messaging';

export const firebaseConfig = {
  apiKey: 'AIzaSyDrRjps4RDE9hNMm6Ic2YAo0uQdURTVARI',
  authDomain: 'iteary-92df6.firebaseapp.com',
  projectId: 'iteary-92df6',
  storageBucket: 'iteary-92df6.firebasestorage.app',
  messagingSenderId: '600601314211',
  appId: '1:600601314211:web:c8c389677d9bcc194b5016',
};

/**
 * The public half of the Web Push certificate, from
 * Firebase console → Project settings → Cloud Messaging → Web Push certificates.
 *
 * Public, like the rest of the config: it is what the browser's push service
 * checks a message was signed by. The private half never leaves Google.
 *
 * Empty until it is generated. Push then reports itself unavailable rather
 * than failing at the call, so the rest of the site is unaffected.
 */
export const VAPID_PUBLIC_KEY =
  'BMgVcURKLVSTif84hYjjEbl_ciUXVjffhATeuVZOegxwa2T2NA9KIDZKauEbwN0_unS4Mp9AvkPCUAOveugiRw4';

let app: FirebaseApp | null = null;
let messaging: Messaging | null = null;

/**
 * Whether this browser can receive a push at all.
 *
 * Several cannot, and none of it is the diner's fault: iOS Safari only allows
 * it for a site added to the home screen, Firefox in private browsing refuses,
 * and any browser without a service worker is out. The honest answer is to
 * hide the option rather than offer something that will not work.
 */
export async function pushAvailable(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return false;
  if (!VAPID_PUBLIC_KEY) return false;
  try {
    return await isSupported();
  } catch {
    return false;
  }
}

function messagingOrNull(): Messaging | null {
  if (messaging) return messaging;
  try {
    app ??= initializeApp(firebaseConfig);
    messaging = getMessaging(app);
    return messaging;
  } catch {
    return null;
  }
}

/**
 * Asks to notify, and returns the device's address if allowed.
 *
 * Null covers every way this can decline to work — permission refused, the
 * browser cannot do it, Firebase unreachable — because the caller's response
 * to all of them is the same: leave notifications off and say so plainly.
 *
 * Deliberately never called on page load. A permission prompt that appears
 * before somebody has done anything is the reason people block notifications
 * reflexively; this runs when they ask for it.
 */
export async function requestPushToken(): Promise<string | null> {
  if (!(await pushAvailable())) return null;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return null;

  const m = messagingOrNull();
  if (!m) return null;

  try {
    // Registered by hand rather than left to the SDK, so the scope is the site
    // root. Left to itself the SDK registers under /firebase-cloud-messaging-*
    // and the worker cannot see clients on other paths, which is how a
    // notification ends up opening a second copy of the site instead of
    // focusing the tab already showing it.
    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
      scope: '/',
    });

    return await getToken(m, {
      vapidKey: VAPID_PUBLIC_KEY,
      serviceWorkerRegistration: registration,
    });
  } catch {
    return null;
  }
}

/** Whether the diner has already agreed, without asking them again. */
export function pushPermission(): NotificationPermission | null {
  if (typeof window === 'undefined' || !('Notification' in window)) return null;
  return Notification.permission;
}
