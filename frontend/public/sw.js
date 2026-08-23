// Minimal service worker to make LOPI installable as a PWA. It doesn't cache
// anything aggressively — real network requests always go through.
self.addEventListener('install', (event) => {
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener('fetch', (event) => {
  // Pass-through: rely on the browser's default network + HTTP cache.
});
