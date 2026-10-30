/* 赌神智慧树 offline cache: always try the network first so a new upload shows up right away,
   and fall back to the last cached copy when offline. Only same-origin files are cached. */
const CACHE = 'dushen-v13';
const SHELL = [
  './', './index.html', './css/app.css',
  './js/vendor/peerjs.min.js', './js/vendor/nacl.min.js', './js/common.js', './js/games/holdem.js', './js/games/zjh.js', './js/games/doudizhu.js', './js/games/doudizhu-coach.js', './js/engine.js',
  './js/net-core.js', './js/card.js', './js/net-online.enc.js', './js/state.js', './js/audio.js', './js/ui.js', './js/main.js',
  './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'
];
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {})); });
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return r; })
      .catch(() => caches.match(e.request).then(m => m || caches.match('./index.html')))
  );
});
