// @ts-nocheck
export default {version:'5.715', date:'2026-11-09', changes:[
  '**🤖 DI Calibration is now automated (owner-directed 2026-11-09): "can we automate the DI '+
  'calibration and have it execute either by our own conditions as we previously defined or '+
  'just schedule them update on a schedule per your determination."** New scheduled job '+
  '(`scripts/di-calibration-run.mjs`, `.github/workflows/di-calibration-run.yml`) runs the exact '+
  'same grid search the in-app DI Calibration panel\'s own buttons already call '+
  '(`calibrateStore()`), on two cadences: **weekly** (Mondays 14:00 UTC) recalibrates only stores '+
  'whose live drift has crossed the same `mape2w > mape6w + 5` threshold the in-app ⚠ Drift '+
  'Warning badge already uses; **monthly** (1st of month, 14:30 UTC) recalibrates every eligible '+
  'store regardless of drift, matching the documented "Calibrate All, regardless of whether any '+
  'store shows drift" cadence from the in-app Workflow Guide. `workflow_dispatch` exposes both '+
  'modes on demand.\n\n'+
  '**Results write through the exact same cloud path the browser uses** (`public.user_settings`, '+
  'key `dialed_in`) so a recalibration shows up for the owner on next load with zero UI change — '+
  'this is the one genuinely new piece of plumbing here, since that table is single-user-scoped '+
  '(not the usual tenant-wide pattern every other scheduled job in this repo writes to) and a '+
  'cron job has no "current user" the way a browser session does.\n\n'+
  '**Live-validated against real production before merge** (not just unit-tested): the weekly '+
  'pass found 13/28 stores past the drift threshold, successfully recalibrated 11 of them (2 were '+
  'genuinely not-yet-eligible that run, same `recentOnly` window behavior the panel already '+
  'shows), and wrote the merged result back — read back and confirmed.\n\n'+
  '**Removed the one AAG checklist item that was purely a staleness nudge** ("N stores need '+
  'Dialed-In calibration (>30 days)") — per the owner\'s own framing, now that automation keeps '+
  'every store\'s calibration age bounded, that nudge has nothing left to tell anyone. The '+
  'red-model-health checklist item is untouched — a real bad score is still worth surfacing, '+
  'that was never just a staleness clock.',
]};
