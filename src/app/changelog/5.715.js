// @ts-nocheck
export default {version:'5.715', date:'2026-11-09', changes:[
  '**🧭 Spot-Check Ruler → "Count Follow-Up" (owner-directed rename, 2026-11-09)** — every user-'+
  'facing string renamed (modal title, share link title, prompt text, button labels); internal '+
  'code names (SpotCheckRulerModal, etc.) are unchanged, a pure display rename.\n\n'+
  '**Timezone "glitch" verified NOT a bug** — a direct SQL check confirmed zero duplicate '+
  '(loc, cls, count_date) rows in inv_count_sessions; the CDT/CST split some dates showed was the '+
  'real 2026-11-01 US fall-back DST transition landing inside the lookback window, not a '+
  'computation error. The recount-date display now formats dates plainly (no raw Date.toString() '+
  'timezone suffix) regardless.\n\n'+
  '**New Q2 — "What FOB component has the most opportunity for the current count?"** — derived '+
  'from the same driver set (Comp/Raw Waste, Condiments, Stat Variance) the EOM diagnosis report\'s '+
  'own FOB-over-target analysis already uses, picking whichever component is furthest over its '+
  'own target.\n\n'+
  '**Q5 (confidence) is now a 1-5 click rating scale**, not free text.\n\n'+
  '**Q6/Q7 split** — "did you review the reports?" is now a yes/no click, with a conditional "if '+
  'yes, what did you find?" follow-up that only appears once answered Yes.\n\n'+
  '7 questions total (up from 5). New `confidence_rating`/`reports_reviewed` columns on '+
  '`spot_check_ruler_notes` (applied live this session).',
  '**🎯 Bullseye tile — ring counts + 3 new metric tabs (owner-directed 2026-11-09).** '+
  '"Add numbers to the bands to represent the different rings" — each ring label now shows a '+
  'dynamic count ("BEATING (5)", "AT TARGET (2)", "BELOW TARGET (20)") of the CURRENT scope\'s own '+
  'stores in that band (All vs a single state vs a single patch each show their own real '+
  'distribution), using the exact same band classification the dots themselves already use.\n\n'+
  '**3 new tabs**, reusing the same store.p/store.t shape (buildStore()/DEFAULT_TARGETS) the '+
  'existing 4 already read, each confirmed against a real field before adding: R2P (`p.r2p`/'+
  '`t.tR2p`), KVS Time (`p.kvst`/`t.tKvst`), Healthy Use of KVS/Side 2 (`p.kvsu`/`t.tKvsu`).',
  '**🔧 Shift Scoreboard fixes (owner-reported 2026-11-09, four separate issues in one worksheet).**\n\n'+
  '**Labor % was reading wildly low (0.70% / 0.47% against a ~19-21% target).** Root-caused live, '+
  'not guessed: QSRSoft\'s `labor-summary` endpoint does not track an in-progress business day in '+
  'real time — its `crew_labor_hours` leg sat at the SAME tiny value (e.g. 2.92hrs) across 10+ '+
  'successive 15-min pulls while the DAR\'s `actual_punched_hours` climbed to 163+ for the same '+
  'store/day, confirmed on a second store too (1.71hrs reported vs 50.18hrs actually punched, '+
  'even on a freshly-pulled row). `metric-source.js`\'s `laborPct` derive now carries a staleness '+
  'guard (new `actHrsGuard`/`crewHrsGuard` legs, both engineered to never block on missing data — '+
  'only a POSITIVELY KNOWN stale reading nulls the value) — shows "—" rather than a number an '+
  'order of magnitude too low. This is a shared metric-source.js fix, so every other "today" '+
  'Labor % reading in the app benefits, not just this panel.\n\n'+
  '**OEPE tile relabeled "OEPE W/O Parked"** — the value was already correct (the live sources '+
  '`qsrActSummaryRows`/`glimpseRows` both already use the w/o-parked formula); only the label '+
  'didn\'t match the rest of the app\'s own convention.\n\n'+
  '**POS-Over $ / Cash O/S $ targets were showing the store\'s raw MONTHLY dollar figure '+
  '(`tPosOverAmt`/`tCashOSAmt`) against a single day\'s actual** ("$641 in POS Overings is a bit '+
  'steep" — owner). Both targets now scale by the store\'s own rate (`tPosOverPct`/`tCashOSPct`) '+
  '× today\'s forecasted sales, the same day the actual reading covers.\n\n'+
  '**Added an "As of [date] · [time] — today so far, running" stamp** for trustworthiness, and '+
  'labeled every tile\'s basis explicitly as a running/cumulative read of today (not a multi-day '+
  'average, not an isolated current-hour snapshot) — true hourly-slice tiles are a larger, '+
  'separate build flagged for a follow-up, not guessed at here.',
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
