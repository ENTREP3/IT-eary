import { SURFACE } from './surface';

/**
 * Makes the site installable, as the app it actually is.
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

  /*
   * Absolute, because the manifest is handed over as a blob.
   *
   * A blob: URL has no path to resolve against, so every relative entry in it
   * — start_url, scope, each icon src — was rejected as invalid and the whole
   * manifest ignored. The browser said so five times in the console and simply
   * never offered to install the site, which looked like the feature not
   * existing rather than being broken.
   */
  const origin = window.location.origin;

  const manifest = {
    name: shape.name,
    short_name: shape.short,
    start_url: `${origin}${shape.start}`,
    scope: `${origin}/`,
    display: 'standalone',
    orientation: 'portrait',
    theme_color: shape.theme,
    background_color: shape.background,
    icons: [
      {
        src: `${origin}/${shape.icon}-192.png`,
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: `${origin}/${shape.icon}-512.png`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      // Declared maskable as well so Android does not letterbox the tile
      // inside a white rounded square. The mark is centred with room around
      // it, which is what makes that safe to claim.
      {
        src: `${origin}/${shape.icon}-512.png`,
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
 */
function registerWorker() {
  if (!('serviceWorker' in navigator)) return;
  // Not awaited, and failure is swallowed: an install prompt is a nicety, and
  // nothing on the page should wait on it or break without it.
  navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' }).catch(() => {});
}
