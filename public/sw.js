// EDEN v3 — Service Worker for offline PWA
// This caches the app shell and assets for offline use

const CACHE_NAME = 'eden-v3-cache-v1';

// Files to pre-cache on install (app shell)
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/eden-logo.png',
  '/icon-192.png',
  '/icon-512.png',
];

// Install event — pre-cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[EDEN SW] Caching app shell');
      return cache.addAll(APP_SHELL);
    })
  );
  // Activate immediately without waiting for old SW to finish
  self.skipWaiting();
});

// Activate event — clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[EDEN SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  // Take control of all open tabs immediately
  self.clients.claim();
});

// Fetch event — Network First with Cache Fallback strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Skip non-GET requests (POST, PUT, DELETE are never cached)
  if (request.method !== 'GET') return;

  // Skip Supabase API calls — always go to network
  if (request.url.includes('supabase.co')) return;

  // Skip Chrome extension requests
  if (request.url.startsWith('chrome-extension://')) return;

  // For navigation requests (HTML pages) — Network First
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache the latest version
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          return response;
        })
        .catch(() => {
          // If offline, serve from cache
          return caches.match(request).then((cached) => cached || caches.match('/index.html'));
        })
    );
    return;
  }

  // For assets (JS, CSS, images) — Stale While Revalidate
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request).then((response) => {
        // Update cache with fresh version
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
        return response;
      }).catch(() => {
        // Network failed, return nothing (cached version is already being served)
      });

      // Return cached version immediately, update in background
      return cached || networkFetch;
    })
  );
});

// Listen for messages from the main app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
