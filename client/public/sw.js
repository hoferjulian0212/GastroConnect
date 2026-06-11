self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
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
