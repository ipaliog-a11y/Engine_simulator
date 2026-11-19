/* Pixel Powertrain — offline-first service worker. */
const CACHE = 'pixel-engine-sim-v6';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './favicon.svg',
  './tracks/real-circuits.js',
  './assets/PressStart2P-latin.woff2',
  './assets/PressStart2P-greek.woff2',
  './assets/icon-192.png',
  './assets/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// The PAGE and the real-circuits pack are network-first; fonts and icons stay cache-first.
//
// This used to be cache-first for everything, with a cache name that never changed — so once a
// browser had the page, it kept serving that copy and a new build on GitHub Pages never reached it.
// For a sim whose numbers change with every build, that is the worst possible failure: you test
// what you think is the new physics and are looking at the old. The page now always comes from the
// network when there is one, and from the cache only when offline.
//
// real-circuits.js changes when tracks are added (build 386: 22 → 32). Cache-first under a fixed
// CACHE name left returning visitors on the old pack: the TRACK menu still showed 22 circuits
// after GitHub Pages had 32. Bumping CACHE drops the stale store; network-first for that URL
// keeps the next import from sticking again. Fonts and icons do not change between builds, so
// they stay cache-first.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const put = (res) => {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
    return res;
  };
  if (e.request.mode === 'navigate' || e.request.destination === 'document') {
    e.respondWith(fetch(e.request).then(put).catch(() => caches.match(e.request).then((c) => c || caches.match('./index.html'))));
    return;
  }
  if (/\/tracks\/real-circuits\.js$/.test(new URL(e.request.url).pathname)) {
    e.respondWith(fetch(e.request).then(put).catch(() => caches.match(e.request)));
    return;
  }
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request).then(put).catch(() => cached))
  );
});
