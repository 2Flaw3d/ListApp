const VERSION = "v6";
const CACHE = `shared-lists-${VERSION}`;
const STATIC_ASSETS = [
  "./icons/icon-192.svg",
  "./icons/icon-512.svg"
];

function pickNotificationPayload(raw) {
  const notification = raw?.notification || raw?.webpush?.notification || {};
  const data = raw?.data || {};

  const title = notification.title || data.title || "Liste";
  const body = notification.body || data.body || "Nuovo aggiornamento";
  const link = raw?.fcmOptions?.link || raw?.webpush?.fcmOptions?.link || data.link || "/";

  return {
    title,
    options: {
      body,
      icon: notification.icon || "/icons/icon-192.svg",
      badge: notification.badge || "/icons/icon-192.svg",
      tag: notification.tag || data.tag || undefined,
      renotify: notification.renotify === true,
      data: { link }
    }
  };
}

self.addEventListener("push", (event) => {
  let raw = {};
  try {
    raw = event.data?.json?.() || {};
  } catch {
    raw = {};
  }

  const { title, options } = pickNotificationPayload(raw);
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification?.data?.link || "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if ("focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(target);
      return null;
    })
  );
});

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const request = event.request;
  const url = new URL(request.url);
  const accept = request.headers.get("accept") || "";
  const isDocument = request.mode === "navigate" || accept.includes("text/html");
  const isManifest = url.pathname.endsWith("manifest.webmanifest");

  if (isDocument || isManifest) {
    event.respondWith(
      fetch(request).catch(() => caches.match(request).then((cached) => cached || caches.match("./")))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (!response || response.status !== 200 || response.type !== "basic") return response;
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy));
        return response;
      });
    })
  );
});
