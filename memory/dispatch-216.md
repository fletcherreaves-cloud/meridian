# Dispatch #216 — Web Push: real device alerts for in-app notifications

## Context — most of the PWA plumbing already exists, this is smaller than it looks

Owner ask (2026-08-29): *"can the in app notifications fire an alert on devices?"* Yes — the
standard mechanism is the Web Push API (a service-worker `push` event → `showNotification()`),
which delivers an OS-level banner/lock-screen alert even when Meridian isn't open in a foreground
tab. **Scoping check found this app is already most of the way there**, which changes the shape of
this dispatch from "build a PWA" to "extend the one that's already shipped":
- `public/sw.js` is already a real, registered service worker (`src/meridian.js:35-40` registers it
  on every load) — currently handles only the Web Share Target flow. This dispatch ADDS a `push`
  and `notificationclick` listener to the SAME file; it does not need a new SW or a new
  registration call.
- `public/manifest.webmanifest` already exists, already `display:'standalone'` with real icons —
  the app is already installable. The iOS caveat below is just "the owner needs to Add to Home
  Screen once," not "we need to build a manifest."

**iOS caveat, real and unavoidable**: iOS Safari only accepts push subscriptions for a site that's
been added to the home screen (iOS 16.4+) — a push subscribe attempt from a normal Safari tab on
iOS will fail/no-op. Desktop Chrome/Firefox/Edge and Android Chrome work with zero install step.
Say this plainly in the UI when the subscribe toggle can't succeed (Task 4), don't fail silently.

## Task 1 — VAPID keypair (one-time, generate for real, don't guess)

Add `web-push` (npm) as a dependency. Generate a real VAPID keypair with
`webpush.generateVAPIDKeys()` — do not fabricate placeholder keys. Report both values in the PR
body but **do not commit either key to the repo**:
- Public key → the owner adds as `VITE_VAPID_PUBLIC_KEY` in Vercel's env vars (safe to expose
  client-side, that's what "public" means here) AND as a GitHub Actions secret of the same name
  (the Node send script in Task 5 needs both keys to sign a push, via
  `webpush.setVapidDetails(subject, publicKey, privateKey)`).
- Private key → the owner adds as `VAPID_PRIVATE_KEY`, GitHub Actions secret only, never exposed to
  the client build.
- `subject` for `setVapidDetails` → `mailto:fletcher.reaves@mcreaves.com` (VAPID requires a contact
  URI, doesn't need to be anything more than that).

Flag clearly in the PR body: **this needs the owner to add two GitHub secrets and one Vercel env
var before real pushes can be sent or subscribed to** — same handoff pattern as `RESEND_API_KEY`.

## Task 2 — `push_subscriptions` table (new, `supabase/schema-push-subscriptions.sql`)

One row per device/browser a user has subscribed from (a user can have several — phone + desktop —
don't assume one). Standard Web Push subscription shape:
```
create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles(id) not null,
  endpoint    text not null,
  p256dh      text not null,
  auth_key    text not null,
  user_agent  text,
  created_at  timestamptz default now(),
  tenant_id   uuid
);
```
Unique on `(user_id, endpoint)` (re-subscribing the same device upserts, doesn't duplicate). RLS:
a user can insert/select/delete only their own rows (`user_id = auth.uid()`), matching this repo's
tenant-scoped RLS pattern elsewhere (`schema-eom-count-notifications.sql` is the template — but this
table is scoped by `user_id`, not just `tenant_id`, since a push subscription is inherently
per-person, not per-tenant-wide). service_role (the Node send script, Task 5) bypasses RLS as usual.

## Task 3 — service worker: `push` + `notificationclick` (extend `public/sw.js`, don't replace it)

Add, don't remove, the existing share-target `fetch` handler. New listeners:
```js
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(self.registration.showNotification(data.title || 'Meridian', {
    body: data.body || '', icon: '/icons/icon-192.png', badge: '/icons/icon-192.png',
    data: { url: data.url || '/' },
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const url = event.notification.data?.url || '/';
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of clients) if ('focus' in c) { c.navigate(url); return c.focus(); }
    return self.clients.openWindow(url);
  })());
});
```
(Sketch, not a literal patch — fit it into the existing file's style/structure.) The payload's `url`
should deep-link into the app the same way dispatch #209's in-app bell already does (check
`eomInitialStore` state / `App.js`'s existing deep-link handling for the EOM Dashboard Scoreboard
tab, and reuse that URL shape rather than inventing a second deep-link convention).

## Task 4 — client subscribe flow (near the existing `NotificationBell`, `src/app/shell.js`)

A "🔔 Enable device alerts" toggle/button — check the panel-contract conventions and this
component's existing structure before deciding exact placement (could be inline in the bell's
dropdown, or a small settings affordance next to it). On click:
1. `Notification.requestPermission()` — bail with a clear inline message if denied (browsers don't
   let you re-prompt after a denial; tell the user to check site settings).
2. `navigator.serviceWorker.ready`, then `registration.pushManager.subscribe({ userVisibleOnly:
   true, applicationServerKey: <urlBase64ToUint8Array(VITE_VAPID_PUBLIC_KEY)> })` — write the
   base64→Uint8Array helper (standard, small, well-known conversion; don't skip it, `subscribe()`
   requires a `Uint8Array`, not a raw string).
3. Upsert the resulting subscription (`endpoint`, `keys.p256dh`, `keys.auth`) to
   `push_subscriptions` via the authenticated Supabase client, keyed to `auth.uid()`.
4. On iOS where the page isn't installed (`navigator.standalone === false` on Safari, or
   `!window.matchMedia('(display-mode: standalone)').matches` more generally), show the "Add to
   Home Screen first" message instead of attempting `subscribe()` and failing opaquely.

A toggle to unsubscribe (browser `pushSubscription.unsubscribe()` + delete the Supabase row) —
don't ship subscribe without a way to turn it back off.

## Task 5 — send-side (new `scripts/lib/webpush-notify.mjs`, wired into the EXISTING EOM notification delivery point)

`sendWebPush(subscription, payload)` — thin wrapper around `webpush.sendNotification({endpoint,
keys:{p256dh, auth}}, JSON.stringify(payload))`, matching `resend-notify.mjs`'s own non-throwing
error-handling convention (log + continue on failure, don't crash the run). **On a 404 or 410
response specifically** (the subscription is dead — user revoked permission, uninstalled, etc.),
delete that `push_subscriptions` row — standard Web Push hygiene, not optional (a dead subscription
that's never cleaned up just accumulates failed sends forever).

Wire this into `scripts/qsrsoft-onhand-pull.mjs`'s existing `notifyRow(row)` (the same function that
already calls `sendEmailNotification`/`sendSmsViaCarrierGateway` — search for it, it's already the
one hook point for per-store notification delivery): fetch all `push_subscriptions` rows for
whichever user(s) should be alerted (for now, all of them — this app doesn't yet have per-role
notification routing, matching the "everything to the owner for now" pattern #211/#215 already
established) and call `sendWebPush()` once per subscription. A user with 2 devices gets 2 pushes,
by design.

## Verification

- Unit tests (mocked `web-push`) for `sendWebPush()`: correct payload shape, correct handling of a
  410/404 (deletes the row — assert the delete call happens), non-throwing on other failures.
- A live measurement is NOT possible from this sandbox (no real browser push subscription can be
  created here) — say so plainly rather than skipping silently. Instead: build a small
  `scripts/test-webpush-send.mjs` smoke-test script (mirroring #211's
  `test-eom-notification-send.mjs` pattern) that the PM/owner can run post-merge once the VAPID
  secrets are in place, to confirm a real subscribed device actually receives a push.
- Confirm the existing share-target `fetch` handler in `public/sw.js` still works after your edit
  (don't accidentally replace/shadow it — read the whole file, this is a small file, there's no
  excuse to skim it).
- Panel-contract check on wherever Task 4's toggle lands.
- Standard suite + build. Version bump (re-check `origin/main`'s current highest changelog version
  fresh immediately before committing).

## Out of scope

- Any notification source beyond the existing EOM count-completion pipeline — this dispatch wires
  push into the ONE existing hook point (`notifyRow()`); wiring #215's roll-up digest or any future
  notification type into push is a follow-up, not required here.
- Per-role/per-user targeted push (sending only to the relevant Supervisor/DO) — same "route to
  everyone for now" scope as #211/#215, for the same reason (no real per-role recipient data model
  yet).
- Rich push actions (action buttons on the notification, e.g. "Snooze"/"View") — a plain
  title+body+click-to-open notification is the full scope here.
- Any native mobile app / APNs / FCM — Web Push only, per this being a PWA, not a native app.
