/* global self, caches */
const PREFIX = "simply-habits-";
const VERSION = "__BUILD_VERSION__";
const cacheName = PREFIX + VERSION;

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const response = await fetch("/precache.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Offline asset manifest is unavailable.");
    const manifest = await response.json();
    if (manifest.version !== VERSION) throw new Error("Offline assets do not match this app version.");
    const cache = await caches.open(cacheName);
    try { await cache.addAll(manifest.assets); }
    catch (error) { await caches.delete(cacheName); throw error; }
  })());
});
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(PREFIX) && name !== cacheName).map(name => caches.delete(name)));
    await self.clients.claim();
    const clients = await self.clients.matchAll();
    clients.forEach(client => client.postMessage({ type: "OFFLINE_READY" }));
  })());
});
self.addEventListener("message", event => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});
self.addEventListener("push", event => {
  event.waitUntil((async () => {
    let payload;
    try { payload = event.data?.json(); }
    catch (error) { console.error("Invalid push payload:", error); }
    await self.registration.showNotification(
      typeof payload?.title === "string" ? payload.title.slice(0, 100) : "Simply Habits",
      {
        body: typeof payload?.body === "string" ? payload.body.slice(0, 300) : "A little moment for you. Open your habits to check in.",
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        tag: typeof payload?.tag === "string" ? payload.tag : "simply-habits",
        data: { url: "/" },
      },
    );
  })());
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const client = clients.find(client => new URL(client.url).origin === self.location.origin);
    if (client) { await client.focus(); await client.navigate("/"); }
    else await self.clients.openWindow("/");
  })());
});
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (event.request.mode === "navigate") {
    event.respondWith((async () => {
      try { return await fetch(event.request); }
      catch {
        const pathname = url.pathname.replace(/\/+$/, "");
        const documentPath = pathname === "/privacy" || pathname === "/terms" ? pathname : "/";
        const cached = await (await caches.open(cacheName)).match(documentPath);
        return cached ?? new Response("Simply Habits is not ready offline yet. Connect once to finish installation.", { status: 503, headers: { "Content-Type": "text/plain" } });
      }
    })());
  } else if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname === "/brand.svg" || url.pathname === "/manifest.webmanifest") {
    event.respondWith((async () => (await (await caches.open(cacheName)).match(event.request)) ?? fetch(event.request))());
  }
});
