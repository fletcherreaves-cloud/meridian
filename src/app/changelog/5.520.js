// @ts-nocheck
export default {version:'5.520', date:'2026-10-12', changes:[
  'New general in-app notification framework (owner req 2026-09-05, scoped 2026-10-12) -- a ' +
  'type-agnostic app_notifications table (supabase/schema-app-notifications.sql) any future ' +
  'feature can post into (a Signals anomaly, a stale-stream alert, a forecast-accuracy drop, ' +
  'etc.), not another EOM-count-specific table. The pre-existing eom_count_notifications table ' +
  'and its own rich rendering (class-status chips, uncounted items, KB links) are untouched -- ' +
  'the bell now merges both sources into one unified, newest-first dropdown and badge.',
  'Delete, for real, on every notification (not just new ones): a "✕" on each row -- EOM rows ' +
  'included, via a new dismissed_at column on eom_count_notifications -- soft-deletes it ' +
  '(excluded from every future load/count, kept for SQL-editor audit rather than hard-deleted).',
  'Auto-clear ("falls off if no longer relevant") -- a producer that posts an ongoing-condition ' +
  'notification (resolve_key set) can later call autoClearAppNotifications() with its own ' +
  'freshly-recomputed "still open" list; anything no longer in that list clears itself. Pure ' +
  'set-difference logic (resolvedKeys(), src/engine/app-notifications.js) is unit-tested with a ' +
  'synthetic type, proving the mechanism works generically -- no live producer uses it yet.',
  'Push/email delivery, "where appropriate and valuable" (owner req) -- severity-based defaults ' +
  '(crit: push+email, warn: push only, info: in-app only), always overridable per-row. Reuses ' +
  'the EXISTING send primitives (sendWebPush/postResend, already generic) rather than a second ' +
  'integration -- new scripts/lib/app-notification-delivery.mjs is the thin orchestration layer ' +
  'a future server-side producer calls after inserting, mirroring EOM count notifications\' own ' +
  'buildNotificationRow() -> insert -> notifyRow() shape exactly. Not wired to any live ' +
  'producer yet -- this is the general substrate the next notification-producing feature plugs ' +
  'into, built and tested, not retrofitted everywhere speculatively.',
  '37 new tests (app-notifications.test.js, app-notification-delivery.test.js) plus the existing ' +
  'eom-count-notification-bell.test.js extended to cover the merged source, delete buttons on ' +
  'both row types, and the generic row template -- rendering the real NotificationBell, not just ' +
  'the data functions, per this repo\'s own verification standard.',
]};
