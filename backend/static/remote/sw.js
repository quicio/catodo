// Cátodo Remote — service worker.
// Strategy:
// - On install: precache the app shell (the HTML entry; everything else is
//   content-hashed by Vite at build time and is revalidated through
//   network-first on demand).
// - On activate: drop any cache from a previous version (CACHE bump).
// - On fetch:
//     * /api/*     → network only, never cache (state changes constantly).
//     * navigate   → network-first, fallback to cached "/" shell.
//     * everything → network-first, fall back to cached shell when offline.
const CACHE = "catodo-remote-v1";
const SHELL = ["/remote/", "/remote/manifest.webmanifest", "/remote/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => undefined)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Never cache API traffic — state changes constantly.
  if (url.pathname.startsWith("/api/")) {
    return; // browser handles network directly
  }

  if (req.mode === "navigate") {
    event.respondWith(networkFirst(req));
    return;
  }

  event.respondWith(networkFirst(req));
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const resp = await fetch(req);
    if (resp && resp.status === 200 && resp.type !== "opaque") {
      cache.put(req, resp.clone()).catch(() => undefined);
    }
    return resp;
  } catch (e) {
    const cached = await cache.match(req);
    if (cached) return cached;
    // Last-resort shell so the UI can render its "disconnected" state.
    const shell = await cache.match("/remote/");
    if (shell) return shell;
    return new Response("offline", { status: 503 });
  }
}
