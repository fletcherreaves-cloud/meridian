// @ts-nocheck
export default {version:'5.532', date:'2026-10-12', changes:[
  'Added "Record Hour" to the Record Days tab (Store Dashboard -> Rankings -> Record Days) -- ' +
  "per-store all-time best single CLOCK-HOUR by sales, plus the best breakfast hour and best " +
  "regular-menu hour. Owner ask: \"show the record hour in sales... Bonus to show record hour " +
  'overall and record breakfast hour and regular menu hour."',
  'Explicitly an APPROXIMATION, labeled as such on screen: no true 15-minute sales data exists ' +
  'anywhere in the currently-pulled tables, so this reuses the existing hourly qsr_daily_activity ' +
  'table (hour_slot is a fixed clock-hour bucket, e.g. "06:00" = the 5am-6am hour) rather than a ' +
  'true rolling 60-minute window. Owner chose "ship fast approximation now" over waiting on a real ' +
  'quarter-hour pull (tracked separately -- QSRSoft Product Mix has an unpulled "By Quarter Hour" ' +
  'view that would enable the real thing). Breakfast split reuses daypartOf() (engine/labor-' +
  'standard.js) verbatim, the same hour_slot 06-11 boundary every other breakfast cut in the app ' +
  'already uses.',
  'Server-side: new view qsr_hourly_sales_records (supabase/schema-qsr-hourly-sales-records-view.sql, ' +
  'not yet applied -- run it in the Supabase SQL editor) collapses qsr_daily_activity (measured ' +
  '~631,000 rows, 2024-01-01 to today) down to one row per (loc, hour_slot), ~650 total, so the ' +
  'all-time view costs almost nothing to query. Until that migration runs, loadHourlySalesRecords() ' +
  '(src/lib/supabase.js) falls back to a bounded 60-day scan of the base table and the UI honestly ' +
  'labels it as a recent window, not an all-time record -- same probe-and-fallback shape ' +
  'loadSecurityFindings() already uses for security_findings_latest, so this ships safely ahead of ' +
  'the owner applying the migration.',
  '7 new tests (src/__tests__/dispatch-record-hour-2026-10-12.test.js), rendered through the real ' +
  'RecordDayTab per this repo\'s "would this verification still pass if the change were reverted?" ' +
  'rule -- not just the pure computeHourRecords() function in isolation.',
]};
