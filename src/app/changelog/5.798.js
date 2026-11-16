// @ts-nocheck
export default {version:'5.798', date:'2026-11-16', changes:[
  '**Fixed: Shift Analysis\'s "3 Peaks × Labor Gap" TPPH always showed "—" while OEPE/R2P/KVS/' +
  'Sales were real.** Root cause was bigger than a display bug: the whole section was reading a ' +
  'manual "3 Peaks" Excel upload last refreshed 2026-06-30 (4.5 months stale), and TPPH had ' +
  'never once had a non-zero value in that table. Rather than ask for a fresh upload, the section ' +
  'now derives OEPE/R2P/KVS/Park%/Sales/TPPH per daypart from the already-pulled HOURLY ' +
  'qsr_daily_activity stream (new src/engine/daypart-peaks.js), auto-first ahead of the manual ' +
  'upload. Also applies to the standalone 3 Peaks tab (Store Dashboard).',
]};
