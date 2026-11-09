// @ts-nocheck
export default {version:'5.715', date:'2026-11-09', changes:[
  '**🎯 Bullseye tile — ring counts + 3 new metric tabs (owner-directed 2026-11-09).** '+
  '"Add numbers to the bands to represent the different rings" — each ring label now shows a '+
  'dynamic count ("BEATING (5)", "AT TARGET (2)", "BELOW TARGET (20)") of the CURRENT scope\'s own '+
  'stores in that band (All vs a single state vs a single patch each show their own real '+
  'distribution), using the exact same band classification the dots themselves already use.\n\n'+
  '**3 new tabs**, reusing the same store.p/store.t shape (buildStore()/DEFAULT_TARGETS) the '+
  'existing 4 already read, each confirmed against a real field before adding: R2P (`p.r2p`/'+
  '`t.tR2p`), KVS Time (`p.kvst`/`t.tKvst`), Healthy Use of KVS/Side 2 (`p.kvsu`/`t.tKvsu`).',
  '**📆 FY Year rail card is live (owner-directed 2026-11-09: "Noticing on Projection Workspace '+
  'that FY Year are still greyed out as not yet available. Need to remedy this soon so i can '+
  'properly forecast next year").** The real work was never missing — the Yearly Targets panel '+
  '(`src/views/yearly-projections.js`, Planning Hub\'s Yearly tab) has existed since dispatch #61. '+
  'What was missing was the link: Projection Workspace\'s "📆 FY Year" rail card was a disabled, '+
  '45%-opacity placeholder with no click handler. It now opens Yearly Targets directly — same '+
  'destination and permission (`analytics.store`) the app\'s own `modal===\'yearly-proj\'` nav '+
  'already uses elsewhere, just reachable from inside Projection Workspace too. Deliberately NOT '+
  'wired as a third `railSelected` state alongside Week/Month (which drive this SAME panel\'s own '+
  'body) — a year\'s worth of targets already lives in its own real panel, so this is an honest '+
  'nav-away action (➜ icon, "Open Yearly Targets →" label), not a fake in-place yearly forecast.',
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
