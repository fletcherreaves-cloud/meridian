// @ts-nocheck
export default {version:'5.682', date:'2026-11-07', changes:[
  '**Movers Alerts (v5.681) live-verified end-to-end, then paused pending a real recipient ' +
  'account.** Confirmed working against real production data the same day it shipped — a real ' +
  'CRIT alert fired for Sulphur (-27.0% vs LY, classified as average-check erosion) and landed ' +
  'correctly in `app_notifications` with the right `target_roles`. Owner then asked to hold ' +
  'actual firing until a real GM/AS/DO account with its own device push subscription exists — ' +
  '`.github/workflows/movers-alert-run.yml`’s automatic on-occurrence trigger is commented out ' +
  '(manual `workflow_dispatch` testing still available). See ' +
  '`memory/plan-movers-alerts-2026-11-07.md` for the full verification + pause writeup.',
]};
