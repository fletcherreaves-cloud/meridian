// @ts-nocheck
export default {version:'5.681', date:'2026-11-07', changes:[
  '**New: Movers Alerts (task #91) — push notifications for sustained/sharp sales declines, ' +
  'targeted to GM/AS/DO.** Builds on the existing `app_notifications` general framework ' +
  '(shipped 2026-10-12) rather than a new table — Movers is its first real producer. A new ' +
  '`src/engine/movers-alert.js` applies measured thresholds (CRIT: 1 day ≤ -25% vs LY; WARN: ' +
  '3+ consecutive days ≤ -20%) — see `memory/plan-movers-alerts-2026-11-07.md` for the full ' +
  '53,196-store-day measurement, which found up-swings are NOT a usable alert signal at this ' +
  'grain (routine, not anomalous) and deliberately has no up-swing rule. `scripts/' +
  'movers-alert-run.mjs` runs on OCCURRENCE — `.github/workflows/movers-alert-run.yml` fires ' +
  'right after the QSRSoft Daily Activity Pull completes, not on its own schedule. Push content ' +
  'carries the swing + a top-cause classification reusing swing-detect.js’s own traffic-vs-' +
  'check-mix logic (the full Why Engine needs the browser’s live dataset and can’t run from a ' +
  'pull script). **New capability**: `app_notifications` gained a `target_roles` column and ' +
  '`scripts/lib/app-notification-delivery.mjs` now resolves push recipients by role + ' +
  '`accessible_locs` when set — every push notification shipped before this broadcast to every ' +
  'subscribed device (no per-role targeting existed anywhere in the app). Owner action required: ' +
  'run the `target_roles` migration block in `supabase/schema-app-notifications.sql` before real ' +
  'rows can be targeted (DDL, never an agent’s own action).',
]};
