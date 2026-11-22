const cacheName = 'table-shell-v5';
self.addEventListener('install', (event) =>
  event.waitUntil(
    caches
      .open(cacheName)
      .then((c) => c.addAll(['/courses-hors-ligne.html', '/hors-ligne.js', '/icon.png'])),
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
              .filter((k) => k.startsWith('table-shell-') && k !== cacheName)
              .map((k) => caches.delete(k)),
          ),
        ),
    ]),
  ),
);
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== location.origin || event.request.method !== 'GET') return;
  if (['/courses-hors-ligne.html', '/hors-ligne.js', '/icon.png'].includes(url.pathname)) {
    event.respondWith(caches.match(event.request).then((r) => r || fetch(event.request)));
    return;
  }
  if (url.pathname === '/courses' && event.request.mode === 'navigate')
    event.respondWith(fetch(event.request).catch(() => caches.match('/courses-hors-ligne.html')));
});
