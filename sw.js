/* 赌神智慧树 offline cache: always try the network first so a new upload shows up right away,
   and fall back to the last cached copy when offline. Only same-origin files are cached. */
const CACHE = 'dushen-v26';
const SHELL = [
  './', './index.html', './css/app.css',
  './js/vendor/peerjs.min.js', './js/vendor/nacl.min.js', './js/common.js', './js/assets.js', './js/games/holdem.js', './js/games/zjh.js', './js/games/doudizhu.js', './js/games/doudizhu-coach.js', './js/engine.js',
  './js/net-core.js', './js/card.js', './js/net-online.enc.js', './js/state.js', './js/audio.js', './js/table-layout.js', './js/ui.js', './js/wheel.js', './js/main.js',
  './assets/CREDITS.txt', './assets/cards/10C.webp', './assets/cards/10D.webp', './assets/cards/10H.webp', './assets/cards/10S.webp', './assets/cards/2C.webp', './assets/cards/2D.webp', './assets/cards/2H.webp', './assets/cards/2S.webp', './assets/cards/3C.webp', './assets/cards/3D.webp', './assets/cards/3H.webp', './assets/cards/3S.webp', './assets/cards/4C.webp', './assets/cards/4D.webp', './assets/cards/4H.webp', './assets/cards/4S.webp', './assets/cards/5C.webp', './assets/cards/5D.webp', './assets/cards/5H.webp', './assets/cards/5S.webp', './assets/cards/6C.webp', './assets/cards/6D.webp', './assets/cards/6H.webp', './assets/cards/6S.webp', './assets/cards/7C.webp', './assets/cards/7D.webp', './assets/cards/7H.webp', './assets/cards/7S.webp', './assets/cards/8C.webp', './assets/cards/8D.webp', './assets/cards/8H.webp', './assets/cards/8S.webp', './assets/cards/9C.webp', './assets/cards/9D.webp', './assets/cards/9H.webp', './assets/cards/9S.webp', './assets/cards/AC.webp', './assets/cards/AD.webp', './assets/cards/AH.webp', './assets/cards/AS.webp', './assets/cards/JC.webp', './assets/cards/JD.webp', './assets/cards/JH.webp', './assets/cards/JS.webp', './assets/cards/KC.webp', './assets/cards/KD.webp', './assets/cards/KH.webp', './assets/cards/KS.webp', './assets/cards/QC.webp', './assets/cards/QD.webp', './assets/cards/QH.webp', './assets/cards/QS.webp', './assets/cards/back.webp', './assets/cards/joker-big.webp', './assets/cards/joker-small.webp', './assets/chips/black.png', './assets/chips/blue.png', './assets/chips/green.png', './assets/chips/red.png', './assets/chips/white.png', './assets/sfx/card-place-1.mp3', './assets/sfx/card-place-2.mp3', './assets/sfx/card-place-3.mp3', './assets/sfx/card-place-4.mp3', './assets/sfx/card-shove-1.mp3', './assets/sfx/card-shove-2.mp3', './assets/sfx/card-shuffle.mp3', './assets/sfx/card-slide-1.mp3', './assets/sfx/card-slide-2.mp3', './assets/sfx/card-slide-3.mp3', './assets/sfx/card-slide-4.mp3', './assets/sfx/chip-lay-1.mp3', './assets/sfx/chip-lay-2.mp3', './assets/sfx/chip-lay-3.mp3', './assets/sfx/chips-collide-1.mp3', './assets/sfx/chips-collide-2.mp3', './assets/sfx/chips-handle-1.mp3', './assets/sfx/chips-handle-2.mp3', './assets/sfx/chips-handle-3.mp3', './assets/sfx/chips-stack-1.mp3', './assets/sfx/chips-stack-2.mp3', './assets/sfx/chips-stack-3.mp3',
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
