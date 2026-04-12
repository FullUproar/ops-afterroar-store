// Afterroar Store Ops — Service Worker
// Hand-written for full control. No framework dependency.

const CACHE_VERSION = "afterroar-v1";
const APP_SHELL_CACHE = `shell-${CACHE_VERSION}`;
const API_CACHE = `api-${CACHE_VERSION}`;

// App shell: cache on install for offline loading
const SHELL_URLS = ["/dashboard", "/dashboard/checkout", "/dashboard/returns/new", "/dashboard/trade-ins/new"];

// Install: precache app shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) => {
      // Cache navigations — these will be HTML pages
      return cache.addAll(SHELL_URLS).catch(() => {
        // Non-critical: some URLs may fail if not yet built
        console.log("[SW] Some shell URLs failed to cache — will retry on next fetch");
      });
    })
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== APP_SHELL_CACHE && key !== API_CACHE)
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch strategy
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests (mutations should never be cached)
  if (event.request.method !== "GET") return;

  // Skip auth routes entirely
  if (url.pathname.startsWith("/api/auth")) return;

  // API routes: network-first, cache fallback for read-only endpoints
  if (url.pathname.startsWith("/api/")) {
    // Only cache safe read endpoints
    const cacheable =
      url.pathname.startsWith("/api/inventory") ||
      url.pathname.startsWith("/api/customers") ||
      url.pathname.startsWith("/api/me") ||
      url.pathname.startsWith("/api/reports");

    if (cacheable) {
      event.respondWith(
        fetch(event.request)
          .then((response) => {
            // Cache successful responses
            if (response.ok) {
              const clone = response.clone();
              caches.open(API_CACHE).then((cache) => cache.put(event.request, clone));
            }
            return response;
          })
          .catch(() => {
            // Network failed — try cache
            return caches.match(event.request).then((cached) => {
              return cached || new Response(JSON.stringify({ error: "Offline" }), {
                status: 503,
                headers: { "Content-Type": "application/json" },
              });
            });
          })
      );
      return;
    }

    // Non-cacheable API routes: network only
    return;
  }

  // Navigation requests: network-first, cache fallback
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Cache the page for offline
          if (response.ok) {
            const clone = response.clone();
            caches.open(APP_SHELL_CACHE).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          // Try exact match first, then fall back to /dashboard
          return caches.match(event.request).then((cached) => {
            return cached || caches.match("/dashboard");
          });
        })
    );
    return;
  }

  // Static assets (JS, CSS, images, fonts): cache-first
  if (
    url.pathname.startsWith("/_next/") ||
    url.pathname.match(/\.(js|css|png|jpg|svg|woff2?)$/)
  ) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(APP_SHELL_CACHE).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }
});

// Listen for messages from the main thread
self.addEventListener("message", (event) => {
  if (event.data === "skipWaiting") {
    self.skipWaiting();
  }
});
