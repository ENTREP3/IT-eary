/*
 * Receives notifications while no tab of this site is open.
 */
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyDrRjps4RDE9hNMm6Ic2YAo0uQdURTVARI',
  authDomain: 'iteary-92df6.firebaseapp.com',
  projectId: 'iteary-92df6',
  storageBucket: 'iteary-92df6.firebasestorage.app',
  messagingSenderId: '600601314211',
  appId: '1:600601314211:web:c8c389677d9bcc194b5016',
});

const messaging = firebase.messaging();

/*
 * Shows the notification when nothing of ours is on screen.
 */
messaging.onBackgroundMessage((payload) => {
  const data = payload.data || {};
  const title = data.title || 'Bencris';

  self.registration.showNotification(title, {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',

    /*
     * Replaces rather than stacks. A ticket that goes paid → preparing → ready
     * would otherwise leave three notifications about the same order, and the
     * only one worth reading is the last.
     */
    tag: data.tag || 'bencris',
    renotify: true,

    // Where to go when tapped, read back in the click handler below.
    data: { url: data.url || '/' },
  });
});

/*
 * Opening the right place when tapped.
 *
 * Focuses a tab already showing the site rather than opening another one.
 * Somebody who left the menu open and got told their food is ready should be
 * returned to the page they had, not given a second copy of it.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          if ('navigate' in client) client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});

/*
 * A fetch handler, so the site can be installed.
 */
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
