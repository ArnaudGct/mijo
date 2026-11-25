const cacheName = 'mijo-shell-v2';
const shellAssets = ['/courses-hors-ligne.html', '/hors-ligne.js', '/icon.png?v=mijo'];
self.addEventListener('install', (event) =>
  event.waitUntil(
    caches.open(cacheName).then((cache) => cache.addAll(shellAssets)).then(() => self.skipWaiting()),
  ),
);
self.addEventListener('activate', (event) =>
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter((k) => (k.startsWith('table-shell-') || k.startsWith('mijo-shell-')) && k !== cacheName)
              .map((k) => caches.delete(k)),
          ),
        ),
    ]),
  ),
);
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== location.origin || event.request.method !== 'GET') return;
  if (shellAssets.includes(url.pathname + url.search)) {
    event.respondWith(caches.match(event.request).then((r) => r || fetch(event.request)));
    return;
  }
  if (url.pathname === '/courses' && event.request.mode === 'navigate')
    event.respondWith(fetch(event.request).catch(() => caches.match('/courses-hors-ligne.html')));
});
