const VERSION = "v5";
const CACHE = `shared-lists-${VERSION}`;
const STATIC_ASSETS = [
  "./icons/icon-192.svg",
  "./icons/icon-512.svg"
];

let messagingReady = false;

function initFirebaseMessaging(config) {
  if (messagingReady || !config) return;
  try {
    importScripts("https://www.gstatic.com/firebasejs/12.6.0/firebase-app-compat.js");
    importScripts("https://www.gstatic.com/firebasejs/12.6.0/firebase-messaging-compat.js");
    firebase.initializeApp(config);
    const messaging = firebase.messaging();
    messaging.onBackgroundMessage((payload) => {
      const title = payload?.notification?.title || "Liste";
      const body = payload?.notification?.body || "Nuovo aggiornamento";
      const link = payload?.fcmOptions?.link || payload?.data?.link || "/";
      self.registration.showNotification(title, {
        body,
        icon: "./icons/icon-192.svg",
        badge: "./icons/icon-192.svg",
        data: { link }
      });
    });
    messagingReady = true;
  } catch {
    // Ignore setup errors on unsupported browsers.
  }
}

self.addEventListener("message", (event) => {
  if (event?.data?.type !== "LISTAPP_FIREBASE_CONFIG") return;
  initFirebaseMessaging(event.data.config);
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
