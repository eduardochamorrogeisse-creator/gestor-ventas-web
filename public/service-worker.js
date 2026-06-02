/* Minimal Service Worker for PWA Installation */
const CACHE_NAME = 'edumaco-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Required for PWA to be installable
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
