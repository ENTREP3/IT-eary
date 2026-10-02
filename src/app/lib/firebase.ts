/**
 * Firebase, used for one thing only: reaching a diner who closed the app.
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
 */
export const VAPID_PUBLIC_KEY =
  'BMgVcURKLVSTif84hYjjEbl_ciUXVjffhATeuVZOegxwa2T2NA9KIDZKauEbwN0_unS4Mp9AvkPCUAOveugiRw4';

let app: FirebaseApp | null = null;
let messaging: Messaging | null = null;

/**
 * Whether this browser can receive a push at all.
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
