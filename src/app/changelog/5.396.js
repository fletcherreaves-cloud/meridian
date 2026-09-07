// @ts-nocheck
export default {version:'5.396', date:'2026-09-07', changes:[
  'Items Recounted tile (At A Glance) now runs every week, not just near month-end. It was ' +
  'gated to a district-wide EOM close window (last 3 days of the month + first week after) -- ' +
  'now always-on, with a SEPARATE window per store, anchored to that store\'s own most recent ' +
  'complete weekly count (new weeklyRecountWindows(), engine/count-cycle.js, reusing ' +
  'cycleCompliance()\'s own lastWeekly). Subsumes the EOM case rather than running alongside it.',
  'eom-ledger-baseline.js\'s itemCloseWindowRecount/ledgerBaselineDiff/ledgerScopeDiff gained an ' +
  'additive closeWindowEnd param (defaults null = unbounded, unchanged EOM behavior) so a ' +
  'per-store weekly window doesn\'t bleed into the following week\'s regular count.',
  'Raised COVER_FRAC 0.75 -> 0.95 (what "complete weekly count" means everywhere it\'s used, ' +
  'Count Cycle\'s own overdue-grading included) -- owner-directed: stores are expected to run a ' +
  'FULL weekly count, not a partial one. Live-measured before landing on 0.95: 0.98 (EOM\'s own ' +
  'bar) flips 21/27 stores to overdue for a single real period -- most genuine full counts never ' +
  'hit exactly 98% of the active-item universe; 0.95 flips a real, actionable 7/27.',
  'dt-speedofservice.js\'s 2-4pm daypart label renamed "PM" -> "Snack" (owner-confirmed), ' +
  'matching morning-brief.js/store-analytics.js\'s own naming for the same daypart.',
  '7 new tests (2 rendering the real AtAGlance -> ItemsRecountedTile call site against a mocked ' +
  'Supabase client, 4 on weeklyRecountWindows directly, plus count-cycle.test.js\'s own threshold ' +
  'assertion updated). Full suite 485 files/4623 tests, build clean, eager budget 537.96 KB / ' +
  '850 KB (unchanged -- both touched panels are lazy-loaded).',
]};
