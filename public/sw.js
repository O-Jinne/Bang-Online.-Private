// 서비스 워커: 앱 화면 뼈대를 캐시해 두면 서버가 슬립에서 깨어나는 동안(최대 약 1분)에도 화면이 먼저 뜹니다.
// stale-while-revalidate: 캐시를 즉시 쓰고, 뒤에서 최신본으로 갱신합니다.
const CACHE = 'bang-v7';
const SHELL = ['/', '/index.html', '/style.css', '/fonts/hangul.css', '/icons.js', '/portraits.js', '/app.js', '/engine.js', '/manifest.webmanifest', '/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname === '/healthz') return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const net = fetch(req).then((res) => { if (res && res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
      return cached || (await net) || new Response('오프라인입니다.', { status: 503 });
    })
  );
});
