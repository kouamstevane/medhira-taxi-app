import { NextResponse } from 'next/server';

/**
 * Serves the Firebase Messaging Service Worker with environment variables injected.
 * Browsers fetch /firebase-messaging-sw.js — this route handler responds with the SW script.
 *
 * Using a route handler instead of a static file in /public allows us to inject
 * NEXT_PUBLIC_* env vars (which are not available inside service worker scripts).
 */
export async function GET() {
  const config = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? '',
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? '',
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? '',
  };

  const script = `
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp(${JSON.stringify(config)});

const messaging = firebase.messaging();

// Handle background messages (app not in foreground).
messaging.onBackgroundMessage((payload) => {
  const { title, body, icon } = payload.notification ?? {};
  self.registration.showNotification(title || 'Medhira', {
    body: body || '',
    icon: icon || '/icon-192.png',
    badge: '/icon-192.png',
    data: payload.data,
  });
});

// Handle notification click — open or focus the app.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  let url = '/';

  if (data.type === 'booking_request') {
    url = '/taxi';
  } else if (data.type === 'trip_started' || data.type === 'driver_arrived') {
    url = data.tripId ? '/taxi/confirmation?bookingId=' + data.tripId : '/taxi';
  } else if (data.type === 'trip_completed' || data.type === 'payment_received') {
    url = '/historique';
  } else if (data.type === 'food_order') {
    url = data.orderId ? '/food/orders/' + data.orderId : '/food/orders';
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
`.trim();

  return new NextResponse(script, {
    headers: {
      'Content-Type': 'application/javascript',
      'Service-Worker-Allowed': '/',
      'Cache-Control': 'no-cache',
    },
  });
}
