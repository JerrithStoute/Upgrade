/*
 * The Builder Station's service worker: shows phone notifications (src/lib/push.ts) and opens the
 * page one is about when it's tapped; with no signal, shows the "You're offline" page instead of the
 * browser's own error. It keeps only that one page — every other page comes fresh from the server.
 */

const OFFLINE = "/offline.html";
const CACHE = "offline-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.add(new Request(OFFLINE, { cache: "reload" })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // An older copy of the offline page: gone.
      for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
      await self.clients.claim();
    })(),
  );
});

// Opening a page: from the server as always — only when that fails (no signal) the offline page.
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(fetch(event.request).catch(async () => (await caches.match(OFFLINE)) || Response.error()));
});

self.addEventListener("push", (event) => {
  let note = { title: "New update", body: "", url: "/", tag: undefined };
  try {
    note = { ...note, ...event.data.json() };
  } catch {
    if (event.data) note.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(note.title, {
      body: note.body,
      tag: note.tag,
      renotify: !!note.tag,
      icon: "/api/app-icon?s=192",
      badge: "/api/app-icon?s=96&badge=1",
      data: { url: note.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // The app (or a tab) already open: bring it up on that page.
      for (const c of open) {
        if (new URL(c.url).origin === self.location.origin && "focus" in c) {
          await c.focus();
          if ("navigate" in c) await c.navigate(url).catch(() => {});
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
