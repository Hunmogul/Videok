/**
 * VideoKurátor – sw.js
 * Service Worker offline támogatáshoz
 */

const CACHE_NAME = 'videokurator-v1';

const ASSETS = [
  '/index.html',
  '/manifest.json',
  '/src/app.js',
  '/src/models/VideoModel.js',
  '/src/models/RatingModel.js',
  '/src/models/StorageService.js',
  '/src/models/UserModel.js',
  '/src/models/UserService.js',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  // Csak GET kérések kerülnek cache-be
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request)
      .then(cached => cached || fetch(event.request)
        .then(response => {
          // Csak sikeres válaszokat cache-elünk
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          const toCache = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, toCache));
          return response;
        })
      )
      .catch(() => {
        // Offline fallback
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      })
  );
});
