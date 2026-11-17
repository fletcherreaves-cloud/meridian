// @ts-nocheck
export default {version:'5.819', date:'2026-11-17', changes:[
  '**Fixed: the 2026-11-16 QSRSoft compliance pause was being silently un-paused.** Pausing a ' +
  'workflow\'s YAML schedule doesn\'t stop every mechanism that can re-fire it — ' +
  '`scheduled-pull-watchdog.mjs`\'s own "should have run by now" safety net was re-dispatching ' +
  'every paused QSRSoft stream it manages, and two still-live Supabase pg_cron "external ' +
  'heartbeat" jobs were doing the same thing independently, straight from the database. Both ' +
  'are now disarmed: `stream-freshness.js`\'s 18 affected streams carry a real `paused` flag ' +
  '(mirrored into `scheduled-pull-registry.mjs`, checked for agreement by a new test), the ' +
  'watchdog short-circuits before ever touching a paused stream, and the Data Manager panel ' +
  'now shows a gray "⏸ PAUSED" badge instead of "AUTO" for FOB/eBOS/DAR/Security Events and the ' +
  'other paused streams, with corrected copy that no longer claims they pull "no action ' +
  'needed." Two pg_cron jobs (`external-heartbeat-onhand-pull`, `external-heartbeat-live-pulse`) ' +
  'still need the owner to run `cron.unschedule(...)` directly in Supabase — this session has ' +
  'no SQL execution path there. Full writeup: ' +
  'memory/finding-qsrsoft-compliance-pause-watchdog-override-2026-11-17.md.',
]};
