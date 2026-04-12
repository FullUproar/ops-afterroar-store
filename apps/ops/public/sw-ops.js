// Afterroar Ops Monitor — Service Worker
// Push notifications + offline shell for /ops PWA

const CACHE_NAME = "ops-monitor-v1";

// Install — cache the ops page shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(["/ops"]).catch(() => {
        console.log("[SW-Ops] Shell cache failed — will retry on fetch");
      });
    })
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key.startsWith("ops-monitor-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch — network-first for /ops, skip everything else
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET") return;

  // Only handle /ops navigation
  if (event.request.mode === "navigate" && url.pathname === "/ops") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          return caches.match(event.request).then((cached) => {
            return cached || new Response("Offline", { status: 503 });
          });
        })
    );
    return;
  }
});

// Push notification received
self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  const options = {
    body: data.body || "System alert",
    icon: "/logo-ring.png",
    badge: "/logo-ring-favicon.png",
    tag: data.tag || "ops-alert",
    requireInteraction: true,
    vibrate: [200, 100, 200],
    data: { url: data.url || "/ops" },
  };
  event.waitUntil(
    self.registration.showNotification(data.title || "Afterroar Ops", options)
  );
});

// Notification click — open the ops page
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/ops";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      // Focus existing window if open
      for (const client of windowClients) {
        if (client.url.includes("/ops") && "focus" in client) {
          return client.focus();
        }
      }
      // Otherwise open new window
      return clients.openWindow(url);
    })
  );
});

// Listen for messages
self.addEventListener("message", (event) => {
  if (event.data === "skipWaiting") {
    self.skipWaiting();
  }
});
