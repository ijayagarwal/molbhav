// Molbhav's minimal service worker (DESIGN §20): when an /app page can't load (no network), show a small
// offline page instead of the browser's error. Nothing else is cached: state lives on the server.
const CACHE = "molbhav-offline-v1";
const OFFLINE = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.add(OFFLINE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.mode !== "navigate" || !new URL(req.url).pathname.startsWith("/app")) return;
  event.respondWith(fetch(req).catch(() => caches.match(OFFLINE)));
});
