// Sehat Saathi web app: opens fast and still shows something on a weak connection.
// Pages: network first, last copy if offline. App files: cache first. The API is never cached.
const CACHE = "sehat-v2";
const START = ["/patient", "/icons/icon-192.png"];

const OFFLINE = `<!doctype html><html lang="ur" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sehat Saathi</title><body style="margin:0;font-family:system-ui,sans-serif;background:#040d0c;color:#eaf5f2;display:grid;place-items:center;min-height:100vh;text-align:center;padding:24px">
<div><h1 style="font-size:22px">انٹرنیٹ نہیں ہے · No internet</h1>
<p style="color:#8ea7a1">ایمرجنسی میں فوراً 1122 پر کال کریں۔<br>In an emergency, call 1122 now.</p>
<a href="tel:1122" style="display:inline-block;margin-top:12px;padding:16px 28px;border-radius:999px;background:#ff4d5a;color:#fff;font-weight:700;text-decoration:none;font-size:20px">Call 1122</a></div></body></html>`;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(START)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(url.pathname, copy));
          }
          return res;
        })
        .catch(async () => (await caches.match(url.pathname)) || new Response(OFFLINE, { headers: { "Content-Type": "text/html; charset=utf-8" } })),
    );
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});

// Phone notifications (medicine reminders, elder check-ins, blood requests, area alerts).
self.addEventListener("push", (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch {
    d = { title: "Sehat Saathi", body: e.data ? e.data.text() : "" };
  }
  e.waitUntil(
    self.registration.showNotification(d.title || "Sehat Saathi", {
      body: d.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { link: d.link || "/app" },
      vibrate: [120, 60, 120],
    }),
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const link = (e.notification.data && e.notification.data.link) || "/app";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) {
          c.navigate(link);
          return c.focus();
        }
      }
      return self.clients.openWindow(link);
    }),
  );
});
