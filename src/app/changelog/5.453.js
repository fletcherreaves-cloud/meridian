// @ts-nocheck
export default {version:'5.453', date:'2026-09-16', changes:[
  'VLH Guide engine wired into a real panel (Task #73): src/engine/vlh-guide.js (the real ' +
  '2022 VLH Workbook Drive Thru + In-Store guest-count-to-hours tables, live-seeded 4,592 rows, ' +
  'shipped in v5.450) had zero UI callers. Added a 4th tab, "VLH Guide (Real)", to the existing ' +
  'Labor Allocation panel (Scheduling Hub) showing per-store/per-daypart guide-derived hours vs ' +
  'reported total_needed_hours, coverage %, and rows where the lookup couldn\'t resolve.',
  'This is deliberately separate from the panel\'s existing "vs Guide" columns on the other 3 ' +
  'tabs, which use total_needed_hours itself as the guide proxy -- the new tab is the FIRST real ' +
  'measurement against the actual workbook tables. Labeled accordingly: DT+In-Store only, not a ' +
  '1:1 reconciliation target (live-measured baseline ~38.6% coverage of total_needed_hours, per ' +
  'memory/finding-vlh-guide-tables-2026-09-16.md -- total_needed_hours also folds in Fixed Sched ' +
  '+ Floor Need and ~8 more positions this engine doesn\'t cover).',
  'loadDailyActivityRange (supabase.js) gets dt_transactions/is_transactions added to its select ' +
  '-- the two guest-count legs the engine\'s tier lookup needs, missing before this since the ' +
  'panel\'s only prior consumer never needed them. Additive select, its one other caller unaffected.',
  '1 new render test exercising the real panel (not the engine in isolation) end-to-end: real ' +
  'store config + guide tiers + DAR guest counts in, real coverage numbers out, confirming a ' +
  'store with no store_vlh_config row is correctly skipped rather than guessed. Full suite ' +
  '521/521 files, 4999/4999 tests. Build clean, eager payload 551.01 KB / 850 KB.',
]};
