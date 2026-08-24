// GastroConnect service worker.
// Besides push notifications, it caches the app shell and static assets so a
// cold restart of the installed PWA (e.g. after iOS kills the WebView when
// switching apps) renders instantly from cache while data refreshes in the
// background — instead of a slow full reload over the network.

const CACHE_VERSION = "gc-v2";
const ASSET_CACHE = `${CACHE_VERSION}-assets`;
const SHELL_CACHE = `${CACHE_VERSION}-shell`;

self.addEventListener("install", (event) => {
  self.skipWaiting();
  // Prime the app shell during installation so the next standalone-PWA launch
  // can paint from disk before the network reconnects.
  event.waitUntil(
    fetch("/")
      .then((response) => {
        if (!response.ok) return;
        return caches.open(SHELL_CACHE).then((cache) => cache.put("/", response));
      })
      .catch(() => undefined),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Drop caches from older versions.
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("gc-") && !k.startsWith(CACHE_VERSION))
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

// Paths the service worker must never touch (API calls, dev-server internals).
function isBypassed(url) {
  return (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/@") || // vite dev internals (/@vite, /@react-refresh, ...)
    url.pathname.startsWith("/node_modules/") ||
    url.pathname.includes("hot-update")
  );
}

// Hashed build assets — immutable, safe to serve cache-first.
function isImmutableAsset(url) {
  return url.pathname.startsWith("/assets/");
}

// Small static files that rarely change — serve from cache, refresh in background.
function isStaticFile(url) {
  return /\.(png|jpg|jpeg|webp|svg|ico|woff2?|ttf)$/.test(url.pathname) || url.pathname === "/manifest.json";
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || isBypassed(url)) return;

  // App shell (navigations): return the cached shell immediately, then refresh
  // it in the background. iOS routinely discards standalone PWA WebViews while
  // switching apps; waiting for a fresh navigation request made every restart
  // feel like a full reload even though a safe shell was already on disk.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(SHELL_CACHE);
        const cached = await cache.match("/");
        const refresh = fetch(request)
          .then((response) => {
            if (response.ok) cache.put("/", response.clone());
            return response;
          });

        if (cached) {
          event.waitUntil(refresh.catch(() => undefined));
          return cached;
        }

        return refresh;
      })(),
    );
    return;
  }

  if (isImmutableAsset(url)) {
    // Cache-first: hashed filenames never change content.
    event.respondWith(
      (async () => {
        const cached = await caches.match(request, { cacheName: ASSET_CACHE });
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(ASSET_CACHE);
          cache.put(request, response.clone());
        }
        return response;
      })(),
    );
    return;
  }

  if (isStaticFile(url)) {
    // Stale-while-revalidate.
    event.respondWith(
      (async () => {
        const cache = await caches.open(ASSET_CACHE);
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((response) => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          })
          .catch(() => cached);
        return cached || network;
      })(),
    );
  }
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let data = {};
  try {
    data = event.data.json();
  } catch (e) {
    data = { title: "GastroConnect", body: event.data.text() };
  }

  const options = {
    body: data.body || "",
    icon: "/app-icon.png",
    badge: "/favicon.png",
    data: { url: data.url || "/" },
    vibrate: [200, 100, 200],
    tag: data.type || "general",
    renotify: true,
    timestamp: Date.now(),
  };

  event.waitUntil(self.registration.showNotification(data.title || "GastroConnect", options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
