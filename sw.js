// Ceylin & Emre Günlüğü - PWA Service Worker (v2.0)
const CACHE_NAME = 'ce-diary-cache-v2.0';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/playlist.html',
  '/manifest.json',
  '/css/style.css?v=5.0',
  '/js/app.js?v=5.0',
  '/js/hearts.js?v=5.0',
  '/js/peerjs.min.js',
  '/js/face-api.min.js',
  '/assets/icon-180.png',
  '/assets/icon-192.png',
  '/assets/icon-512.png',
  '/assets/hearts/1.svg',
  '/assets/hearts/10.svg',
  '/assets/hearts/15.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('Pre-cache warning (non-fatal):', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Skip caching for audio streams (Range requests) and API sync
  if (req.headers.has('range') || url.pathname.startsWith('/api/') || url.pathname.includes('/.netlify/')) {
    return;
  }

  // Network-first for HTML pages
  if (req.mode === 'navigate' || req.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(req)
        .then((networkRes) => {
          const clone = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          return networkRes;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('/index.html')))
    );
    return;
  }

  // Cache-first for images, fonts, scripts, styles
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((networkRes) => {
        if (!networkRes || networkRes.status !== 200 || networkRes.type !== 'basic') {
          return networkRes;
        }
        const clone = networkRes.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        return networkRes;
      });
    })
  );
});
