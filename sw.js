// Meridian Service Worker — v4.239
// Handles Web Share Target API so files can be shared directly from
// QSRSoft (or any app) to Meridian on mobile without opening a file picker.
// Stashes shared files in Cache API; App.js picks them up on next render.

const SHARE_CACHE = 'mf-share-v1';

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

    // Redirect back to the app — the app's mount effect picks up the cache
    return Response.redirect('/meridian/', 303);
  })());
});
