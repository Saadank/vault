// VAULT — Service Worker
// Cache-first for static assets, network-first for API calls.

const CACHE = "vault-v1";
const STATIC = [
  "/",
  "/static/css/design-system.css",
  "/static/js/data.js",
  "/static/js/mobile-atoms.jsx",
  "/static/js/mobile-screens.jsx",
  "/static/js/mobile-sheets.jsx",
  "/static/js/mobile-app.jsx",
  "/static/js/primitives.jsx",
  "/static/js/charts.jsx",
  "/static/js/modals.jsx",
  "/static/js/auth.jsx",
  "/static/js/dashboard.jsx",
  "/static/js/analytics.jsx",
  "/static/js/transactions.jsx",
  "/static/js/tweaks-panel.jsx",
  "/static/js/app.jsx",
  "/static/manifest.json",
  "/static/icons/icon-192.png",
  "/static/icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(STATIC)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // Always go network-first for API calls
  if (url.pathname.startsWith("/api/")) {
    e.respondWith(
      fetch(e.request).catch(() =>
        new Response(JSON.stringify({ detail: "Offline — no connection" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        })
      )
    );
    return;
  }

  // Cache-first for everything else (static assets, HTML shell)
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request).then((response) => {
        if (response.ok) {
          caches.open(CACHE).then((c) => c.put(e.request, response.clone()));
        }
        return response;
      });
    })
  );
});
