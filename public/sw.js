/*
 * The Builder Station's service worker: shows phone notifications (src/lib/push.ts) and opens the
 * page one is about when it's tapped. It doesn't keep pages or files — every page comes fresh from
 * the server.
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

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
