import { SURFACE } from './surface';

/**
 * Makes the site installable, as the app it actually is.
 *
 * None of the three sites could be added to a home screen. The usual cause is a
 * missing manifest, and that was the cause here: there was no manifest at all,
 * no icon above 192px, and the only service worker was the one Firebase
 * messaging registers for notifications. A browser with nothing to read does not
 * argue, it just never offers to install — which looks from the outside like the
 * feature not existing.
 *
 * ---------------------------------------------------------------------------
 * Why it is built here and not shipped as a file
 *
 * One `dist` is served at three addresses. A `public/manifest.json` would be the
 * same bytes for the diner, the counter and the owner, so all three would
 * install under one name and one icon, and a cashier's home screen would end up
 * with a tile called "Bencris" that opens the till. The surface is only known
 * once the page is running, so the manifest is assembled then and handed to the
 * browser as a blob.
 */

type Shape = {
  name: string;
  short: string;
  /** Where the installed app opens. The counter has no business starting on the menu. */
  start: string;
  icon: string;
  theme: string;
  background: string;
};

const SHAPES: Record<typeof SURFACE, Shape> = {
  diner: {
    name: 'Bencris Karinderya',
    short: 'Bencris',
    start: '/',
    icon: 'icon',
    theme: '#f4ead5',
    background: '#f4ead5',
  },
  cashier: {
    name: 'Bencris Counter',
    short: 'Counter',
    start: '/',
    icon: 'icon-counter',
    theme: '#0f1410',
    background: '#0f1410',
  },
  admin: {
    name: 'Bencris Owner',
    short: 'Owner',
    start: '/',
    icon: 'icon-owner',
    theme: '#0f1410',
    background: '#0f1410',
  },
};

export function makeInstallable() {
  if (typeof document === 'undefined') return;

  const shape = SHAPES[SURFACE];

  const manifest = {
    name: shape.name,
    short_name: shape.short,
    start_url: shape.start,
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    theme_color: shape.theme,
    background_color: shape.background,
    icons: [
      {
        src: `/${shape.icon}-192.png`,
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: `/${shape.icon}-512.png`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      // Declared maskable as well so Android does not letterbox the tile
      // inside a white rounded square. The mark is centred with room around
      // it, which is what makes that safe to claim.
      {
        src: `/${shape.icon}-512.png`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };

  const blob = new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' });

  const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
    ?? document.head.appendChild(Object.assign(document.createElement('link'), { rel: 'manifest' }));
  link.href = URL.createObjectURL(blob);

  // iOS reads none of the above. It wants its own tag, and without one it uses
  // a screenshot of the page as the home-screen icon.
  const apple = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]')
    ?? document.head.appendChild(
      Object.assign(document.createElement('link'), { rel: 'apple-touch-icon' }),
    );
  apple.href = `/${shape.icon}-192.png`;

  registerWorker();
}

/**
 * Registers the service worker that installability requires.
 *
 * It is the notifications worker, and that is not a shortcut. A browser only
 * offers to install a site when a worker is registered and handling fetches, so
 * one had to be registered up front — but `firebase-messaging-sw.js` already
 * claims the root scope, and two different scripts cannot both own a scope. A
 * second worker added for installability would have replaced that registration
 * and broken push without a word.
 *
 * So the same script is registered here, with the same scope the messaging code
 * asks for later. Registering an identical script at an identical scope returns
 * the existing registration rather than making a second one, which is what lets
 * both callers ask without fighting.
 *
 * Done on load rather than when notifications are switched on, because
 * otherwise the site could only be installed by somebody who had already
 * accepted push — two unrelated things, tied together by an accident of which
 * code happened to register a worker.
 */
function registerWorker() {
  if (!('serviceWorker' in navigator)) return;
  // Not awaited, and failure is swallowed: an install prompt is a nicety, and
  // nothing on the page should wait on it or break without it.
  navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' }).catch(() => {});
}
