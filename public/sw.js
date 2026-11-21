const SHELL = 'rota-leite-shell-v5';
const FILES = ['/', '/app.css', '/app.js', '/logo.svg', '/manifest.webmanifest'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => key.startsWith('rota-leite-shell-') && key !== SHELL)
    .map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !FILES.includes(url.pathname)) return;
  event.respondWith(fetch(event.request).then(async response => {
    if (response.ok && !response.redirected) {
      const cache = await caches.open(SHELL);
      await cache.put(url.pathname, response.clone());
    }
    return response;
  }).catch(async () => await caches.match(url.pathname) || Response.error()));
});
