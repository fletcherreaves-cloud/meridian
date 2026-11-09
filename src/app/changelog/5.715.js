// @ts-nocheck
export default {version:'5.715', date:'2026-11-09', changes:[
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
]};
