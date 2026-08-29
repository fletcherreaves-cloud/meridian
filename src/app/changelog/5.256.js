// @ts-nocheck
export default {version:'5.256', date:'2026-08-29', changes:[
  'Dispatch #216 -- Web Push: real OS-level device alerts for EOM count-completion notifications, ' +
  'the owner\'s follow-on ask right after #211/#215\'s email+SMS+digest work: "can the in app ' +
  'notifications fire an alert on devices?" Scoping check found the PWA plumbing (public/sw.js\'s ' +
  'registered service worker, public/manifest.webmanifest\'s standalone+icons) was already ' +
  'shipping -- this dispatch ADDS push handlers to what already exists, it did not build a PWA ' +
  'from scratch.' +
  '\n\n' +
  'Task 1 -- generated a real VAPID keypair (webpush.generateVAPIDKeys(), not fabricated) via the ' +
  'new web-push devDependency. Public key -> VITE_VAPID_PUBLIC_KEY (Vercel env + GitHub secret); ' +
  'private key -> VAPID_PRIVATE_KEY (GitHub secret only, never client-side). Both values are in ' +
  'the PR body for the owner to add post-merge -- neither is committed anywhere.' +
  '\n\n' +
  'Task 2 -- new supabase/schema-push-subscriptions.sql: push_subscriptions (id, user_id, ' +
  'endpoint, p256dh, auth_key, user_agent, tenant_id), unique on (user_id, endpoint) so ' +
  're-subscribing the same device upserts instead of duplicating. RLS scoped to user_id = ' +
  'auth.uid() -- NOT tenant_id alone, since a push subscription is inherently per-person (a user ' +
  'can have several: phone + desktop), unlike every other stream table in this repo. Needs a ' +
  'manual SQL-editor run post-merge, same handoff pattern as schema-eom-count-notifications.sql.' +
  '\n\n' +
  'Task 3 -- public/sw.js gained push + notificationclick listeners, ADDED alongside the existing ' +
  'Web Share Target fetch handler (unchanged, verified working after the edit -- read the whole ' +
  'file before and after per the dispatch\'s own instruction). push shows a title/body ' +
  'notification from the JSON payload; notificationclick focuses an existing window and navigates ' +
  'it, or opens a new one, to the payload\'s url. That url reuses the SAME \'eom-dashboard:<loc>\' ' +
  'deep-link shape the in-app bell already uses (dispatch #209\'s eomInitialStore), just carried ' +
  'as a real \'?panel=eom-dashboard&store=<loc>\' URL since a push has to open a URL, not call a ' +
  'JS function -- App.js\'s eomInitialMode/eomInitialStore initializers now also read that `store` ' +
  'query param on a cold load, so the two paths (in-app bell click vs. push click from a closed ' +
  'app) land on the identical panel state.' +
  '\n\n' +
  'Task 4 -- src/app/shell.js\'s NotificationBell dropdown gained a "🔔 Enable device alerts" ' +
  'toggle (DeviceAlertsToggle): requests Notification permission, subscribes via ' +
  'pushManager.subscribe() (new urlBase64ToUint8Array() helper -- subscribe() needs a Uint8Array, ' +
  'not the raw VAPID string), upserts the subscription to push_subscriptions via two new ' +
  'src/lib/supabase.js helpers (upsertPushSubscription/deletePushSubscription), and a matching ' +
  'disable path (pushSubscription.unsubscribe() + row delete) -- no way to turn it on without a ' +
  'way to turn it back off. iOS-not-installed and permission-denied both show a clear inline ' +
  'message instead of a silent/opaque failure (the owner\'s own device is already installed, so ' +
  'this only gates OTHER future users). JUDGMENT CALL: this is a small toggle inside the bell\'s ' +
  'existing hand-rolled dropdown (not a ModalShell/RoutePanelShell panel), so panel-contract\'s ' +
  'close-button/date-picker/LocationSelector/mobile-scroll items don\'t apply -- there is no such ' +
  'surface here to bring into line.' +
  '\n\n' +
  'Task 5 -- new scripts/lib/webpush-notify.mjs (sendWebPush(), matching resend-notify.mjs\'s own ' +
  'non-throwing log-and-continue convention) wired into the ONE existing hook point, ' +
  'qsrsoft-onhand-pull.mjs\'s notifyRow() -- the same function that already calls ' +
  'sendEmailNotification/sendSmsViaCarrierGateway. Fetches ALL push_subscriptions rows (no ' +
  'per-role routing yet, matching #211/#215\'s "everyone for now" scope) and sends one push per ' +
  'row -- a user with 2 devices gets 2 pushes, by design. A 404/410 response deletes that dead ' +
  'subscription row automatically (standard Web Push hygiene). New scripts/test-webpush-send.mjs ' +
  'mirrors #211\'s own smoke-test script for a post-merge live confirmation once the VAPID ' +
  'secrets exist; wired into qsrsoft-onhand-pull.yml as a new workflow_dispatch input alongside ' +
  'the existing #211 test-notification one.' +
  '\n\n' +
  'A real live push delivery test is NOT possible from this sandbox -- no real browser can create ' +
  'a push subscription here; this is stated plainly rather than skipped silently, per the ' +
  'dispatch\'s own verification list. 13 new unit tests: webpush-notify.test.js (8, mocked ' +
  'web-push -- payload shape, 404/410 deletes the row, non-throws on other failures, missing-' +
  'VAPID-config path) and eom-notification-push-pull.test.js (5, mocked sendWebPush + ' +
  'push_subscriptions read -- proves the notifyRow() WIRING itself, not just the engine, so ' +
  'reverting the hook-point call would fail these per the "would this still pass if reverted" ' +
  'rule). Full suite green, build clean.',
]};
