// Meridian Service Worker — v5.256
// Handles Web Share Target API so files can be shared directly from
// QSRSoft (or any app) to Meridian on mobile without opening a file picker.
// Stashes shared files in Cache API; App.js picks them up on next render.
//
// Dispatch #216 (2026-08-29) added the push/notificationclick listeners below for real
// OS-level device alerts (lock-screen/banner) — same file, same registration
// (src/meridian.js already registers this SW on every page load; no new registration call
// needed). The share-target fetch handler above/below is UNCHANGED.

const SHARE_CACHE = 'mf-share-v4276';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Only intercept the share-target POST; let everything else pass through normally
  if (!url.pathname.endsWith('/share-target') || event.request.method !== 'POST') return;

  event.respondWith((async () => {
    try {
      const formData = await event.request.formData();
      const files    = formData.getAll('files');

      if (files.length > 0) {
        const cache = await caches.open(SHARE_CACHE);

        // Clear any previously pending shared files first
        const old = await cache.keys();
        await Promise.all(old.map(k => cache.delete(k)));

        for (const file of files) {
          const buf = await file.arrayBuffer();
          await cache.put(
            `shared/${encodeURIComponent(file.name)}`,
            new Response(buf, {
              headers: {
                'Content-Type': file.type || 'application/octet-stream',
                'X-File-Name':  file.name,
              },
            })
          );
        }
      }
    } catch (err) {
      console.warn('[Meridian SW] share-target error:', err);
    }

    // Redirect back to the app — the app's mount effect picks up the cache.
    // App deploys at root now (start_url "/"); the old "/meridian/" path was a
    // stale GitHub-Pages-era base and no longer valid.
    return Response.redirect('/', 303);
  })());
});

// ── Web Push (dispatch #216) ─────────────────────────────────────────────────
// scripts/lib/webpush-notify.mjs sends the payload as JSON:
// { title, body, url } — url is the same 'eom-dashboard:<loc>' deep-link shape App.js's
// eomInitialStore already consumes for the in-app notification bell (src/app/shell.js's
// NotificationBell), just carried as a real '?panel=eom-dashboard&store=<loc>' URL so a closed
// app/browser has something to open. No action buttons (out of scope) — plain click-to-open.
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (err) { console.warn('[Meridian SW] push payload not JSON:', err); }
  event.waitUntil(self.registration.showNotification(data.title || 'Meridian', {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: data.url || '/' },
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const url = event.notification.data && event.notification.data.url || '/';
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of clients) {
      if ('focus' in c) {
        if ('navigate' in c) { try { await c.navigate(url); } catch (err) { console.warn('[Meridian SW] navigate failed:', err); } }
        return c.focus();
      }
    }
    return self.clients.openWindow(url);
  })());
});
