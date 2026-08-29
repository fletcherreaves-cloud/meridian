// @ts-nocheck
export default {version:'5.252', date:'2026-08-29', changes:[
  'Dispatch #211 -- real email + SMS delivery for EOM count-completion notifications, wired into ' +
  'the exact hook point dispatch #209 deliberately left open pending a provider + recipient. The ' +
  'owner has since added RESEND_API_KEY as a GitHub secret and chosen delivery targets: email to ' +
  'fletcher.reaves@mcreaves.com, and "SMS" via the AT&T email-to-SMS gateway ' +
  '(3346722598@txt.att.net) sent as a second, short plain-text send through the SAME Resend ' +
  'integration -- no Twilio, no second provider. Every fired notification gets BOTH channels, ' +
  'no per-notification channel selection.' +
  '\n\n' +
  'New scripts/lib/resend-notify.mjs: sendEmailNotification(row, storeInfo) builds a real HTML ' +
  'body from the eom_count_notifications row shape (trigger class(es), ALL FOUR classes\' status/' +
  'pct per rule 3 -- not just the trigger, top-10 uncounted items by valueAtRisk plus the true ' +
  'total count/$ so nothing reads as silently truncated, and the real KB links) and POSTs to ' +
  'https://api.resend.com/emails from the shared onboarding@resend.dev sender (no domain verified ' +
  'yet). sendSmsViaCarrierGateway(row, storeInfo) hits the same API but with a hard-capped ' +
  '~300-char plain-text body (store name, trigger class(es), one decision-relevant status line, ' +
  'no KB links -- carrier gateways truncate/reject long or HTML content). Store name comes from ' +
  'the ALREADY-EXISTING src/constants.js STORE_NAMES/unpadLoc (no second lookup added). Neither ' +
  'function throws on a non-2xx response or a thrown fetch error -- both warn and continue, ' +
  'matching this same pull script\'s own eom_count_notifications insert-error pattern; no retry ' +
  'within the run (a known, documented gap, not built here).' +
  '\n\n' +
  'scripts/qsrsoft-onhand-pull.mjs: the FUTURE HOOK comment is now real code -- new exported ' +
  'notifyRow(row)/deliverNotifications(rows) call both send functions once per row in ' +
  'notificationRows, right after the eom_count_notifications insert succeeds, so the hook-point ' +
  'wiring itself (not just the send functions in isolation) is what a revert-detecting test has ' +
  'to exercise.' +
  '\n\n' +
  'New scripts/test-eom-notification-send.mjs -- a standalone, owner/PM-triggerable live smoke ' +
  'test that sends ONE real test email and ONE real test text using the ACTUAL send functions, ' +
  'with obviously-fake content ("Meridian test send -- ignore, dispatch #211 verification"). ' +
  'Reachable two ways: `RESEND_API_KEY=... node scripts/test-eom-notification-send.mjs` directly, ' +
  'or via a new workflow_dispatch input on qsrsoft-onhand-pull.yml ("Dispatch #211 smoke test -- ' +
  'send ONE real test email + text via Resend instead of running the real pull") that runs this ' +
  'script in place of the real on-hand pull for that one manual run. This agent cannot verify ' +
  'live delivery itself -- GitHub Actions secrets (RESEND_API_KEY) are only available inside a ' +
  'real triggered Actions run, never in the sandboxed dev environment -- so this is explicitly a ' +
  'post-merge step: the PM triggers it and the owner confirms both messages actually arrived.' +
  '\n\n' +
  'Tests: 19 new (mocked fetch, zero real network calls) -- resend-notify.test.js covers Resend ' +
  'request shape/headers/recipients for both functions, email content showing all four classes ' +
  '(not just the trigger) plus inline uncounted items and KB links, SMS body length/plain-text/no- ' +
  'KB-links, and graceful non-2xx/thrown-error/missing-key handling; eom-notification-delivery- ' +
  'pull.test.js proves the REAL hook-point wiring (notifyRow/deliverNotifications imported from ' +
  'the actual pull script, resend-notify.mjs mocked) fires both channels exactly once per row, ' +
  'looks up the real store name, and keeps delivering later rows after an earlier one fails; ' +
  'eom-notification-send-smoke.test.js proves the smoke-test script itself builds correct ' +
  'requests via the real send functions. Full suite 3227/3227.' +
  '\n\n' +
  'Speed check: script/workflow-only change, no src/ bundle impact -- eager-payload 523.77 KB ' +
  'gzip, unchanged from the pre-dispatch baseline, well under the 850 KB budget.',
]};
