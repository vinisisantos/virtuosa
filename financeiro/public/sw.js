const CACHE_NAME = 'virtuosa-v5';
const STATIC_ASSETS = [
  '/logo-virtuosa.png',
];

// Install: cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network-first strategy for pages, cache-first for static assets
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Skip non-GET, API requests, and static HTML files (login, etc.)
  if (request.method !== 'GET' || request.url.includes('/api/') || request.url.endsWith('.html')) return;

  // Static assets: cache-first
  if (STATIC_ASSETS.some((asset) => request.url.includes(asset))) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request))
    );
    return;
  }

  // Pages: network-first, fallback to cache
  event.respondWith(
    fetch(request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        return response;
      })
      .catch(() => caches.match(request))
  );
});

// ── Push Notifications ──
self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const title = data.title || 'Virtuosa';
    const options = {
      body: data.body || '',
      icon: data.icon || '/logo-virtuosa.png',
      badge: '/logo-virtuosa.png',
      tag: 'order-' + Date.now(),
      vibrate: [200, 100, 200],
      data: { url: data.url || '/pedidos' },
      actions: [
        { action: 'open', title: 'Ver Pedidos' },
      ],
    };

    event.waitUntil(self.registration.showNotification(title, options));
  } catch (e) {
    // Fallback for plain text
    event.waitUntil(
      self.registration.showNotification('Virtuosa', {
        body: event.data.text(),
        icon: '/logo-virtuosa.png',
      })
    );
  }
});

// Click on notification → open the app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url || '/pedidos';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If app is already open, focus it
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      // Otherwise, open a new window
      return self.clients.openWindow(url);
    })
  );
});
