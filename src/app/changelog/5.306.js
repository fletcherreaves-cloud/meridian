// @ts-nocheck
export default {version:'5.306', date:'2026-09-01', changes:[
  'New "📧 Email Digests" self-serve subscription panel (owner req, verbatim: "can we build out ' +
  'a section... to configure email reports? If we are being smart we will go ahead make this ' +
  'available based on users and allow anyone to sign up or opt in to whichever reports they want ' +
  'emailed to them."). Sidebar → Notifications → Email Digests -- perm:null, open to any ' +
  'authenticated role. Lists every scheduled digest (EMAIL_DIGEST_CATALOG, src/engine/email-' +
  'digest-catalog.js -- currently EOM Digest + Weekly Cycle Digest) with a one-tap Subscribe/' +
  'Unsubscribe toggle, backed by a new email_digest_subscriptions table (one row per (user, ' +
  'digest), supabase/schema-email-digest-subscriptions.sql -- needs the same one-time owner SQL-' +
  'editor step as v5.304\'s weekly_count_day_overrides table).',
  '⚠️ NOT the same feature as "My Reports" (public.report_subscriptions, src/views/report-' +
  'subscriptions.js) -- that\'s an older, separate feature: saved, scope/period-configurable ' +
  'report LAUNCHES, opened in-app. This new table and panel are for opting into the scheduled ' +
  'digests the system already renders and sends server-side on a fixed cadence. (Nearly built a ' +
  'second table under the SAME report_subscriptions name before catching the collision -- ' +
  'renamed to email_digest_subscriptions specifically to avoid it.)',
  'scripts/lib/eom-digest-notify.mjs\'s recipientFor() -- a deliberate v1 placeholder always ' +
  'resolving to the owner\'s own email (dispatch #215) -- is replaced by async recipientsFor(), ' +
  'resolving every real eom_digest subscriber, falling back to [EMAIL_TO] only when nobody has ' +
  'subscribed yet. scripts/weekly-cycle-digest-send.mjs gets the same treatment for ' +
  'weekly_cycle_digest. Both fan out via Promise.all(...postResend) rather than changing ' +
  'postResend()\'s own single-recipient shape.',
  'Tests: new email-digest-subscriptions.test.js (Node-side loadDigestSubscriberEmails, direct ' +
  'fake-client parameter -- no module mocking needed), email-digest-subscriptions-ui.test.js ' +
  '(mocked-client technique for the UI-facing load/save pair, matching eom-digest-config.test.js\'' +
  's precedent), eom-digest-notify.test.js updated for the async rename (and stubs its Supabase ' +
  'env vars to empty BEFORE importing the module -- this sandbox happens to carry real Supabase ' +
  'credentials, which would otherwise leak a real query into every mocked-fetch assertion). ' +
  'shell-nav-snapshot.test.js\'s nav-text ratchet updated for the new item. Full suite passing, ' +
  'build clean.',
]};
