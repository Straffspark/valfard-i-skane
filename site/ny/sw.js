// Service worker för /ny/: gör appen användbar utan internet.
// Egna filer och data: nätet först (högst 3 s), annars sparad kopia. Typsnitt från Google: sparad kopia först.
const CACHE = 'valfard-ny-v2';
const FONTS = 'valfard-ny-fonts-v1';
const FILES = ['./', 'index.html', 'manifest.webmanifest', '../data.json', '../icon-192.png', '../icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  const keep = [CACHE, FONTS];
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('valfard-ny-') && !keep.includes(k)).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

function networkFirst(req) {
  const cached = () => caches.match(req, {ignoreSearch: true}).then(r => r || (req.mode === 'navigate' ? caches.match('index.html') : undefined));
  const net = fetch(req).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return r;
  });
  const slow = new Promise(res => setTimeout(res, 3000)).then(cached);
  // Svarar nätet inom 3 s används det; annars den sparade kopian (om det finns en), och nätet får fortsätta uppdatera cachen.
  return Promise.race([net.catch(cached), slow.then(r => r || net)]).then(r => r || net).catch(cached)
    .then(r => r || new Response('Offline', {status: 503, headers: {'Content-Type': 'text/plain; charset=utf-8'}}));
}
function fontCacheFirst(req) {
  return caches.open(FONTS).then(c => c.match(req).then(hit => hit || fetch(req).then(r => {
    if (r.ok || r.type === 'opaque') c.put(req, r.clone());
    return r;
  })));
}

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') e.respondWith(fontCacheFirst(e.request));
  else if (url.origin === location.origin) e.respondWith(networkFirst(e.request));
});
