// @ts-nocheck
export default {version:'5.334', date:'2026-09-03', changes:[
  'Cleanup: removed loadStoreDaypartData (src/lib/supabase.js) -- a defined-but-never-called ' +
  'loader with zero consumers anywhere in the app (metric-inventory-2026-08-07.md\'s dead-loader ' +
  'list). Functionally superseded on both axes it covered: loadDailyActivityRangeForStore ' +
  '(per-store, date range, has a live consumer in store-cockpit.js) and loadDailyActivity ' +
  '(all-store, single day). No behavior change -- nothing called this function.',
  'Full suite (3721 tests) and build both clean (533.13 KB / 850 KB eager budget). No UI ' +
  'surface -- no browser smoke test needed.',
]};
