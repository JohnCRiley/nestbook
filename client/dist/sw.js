const CACHE = 'nestbook-v1';
const OFFLINE = '/offline.html';

// App-shell assets to precache on install
const PRECACHE = [
  '/',
  '/offline.html',
  '/icon.svg',
  '/manifest.json',
];

// ── Install: cache app shell ──────────────────────────────────────────────────
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE))
  );
  self.skipWaiting();
});

// ── Activate: delete old caches ───────────────────────────────────────────────
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (e) => {
  const { request } = e;
  const url = new URL(request.url);

  // Skip non-GET and API requests (never cache API responses)
  if (request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    // Navigation: network-first, fall back to offline page
    e.respondWith(
      fetch(request)
        .catch(() => caches.match(OFFLINE))
    );
    return;
  }

  // Static assets: cache-first
  e.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE).then((c) => c.put(request, clone));
        }
        return response;
      });
    })
  );
});
