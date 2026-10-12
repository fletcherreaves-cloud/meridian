// @ts-nocheck
export default {version:'5.535', date:'2026-10-12', changes:[
  'Fixed a false "DATA INCOMPLETE ... figures UNDERSTATED" banner firing for qsr_sales_quarter_hour ' +
  '(the real Record Hour feature, v5.534) -- measured live right after PR #1440 merged: the table ' +
  'doesn\'t exist in Supabase yet (owner hasn\'t run supabase/schema-qsr-sales-quarter-hour.sql), a real ' +
  'PGRST205 (confirmed via direct curl). loadQsrSalesQuarterHour() had no table-not-yet-migrated check, ' +
  'so a plain missing table fell into _pagedParallel\'s generic failed-page path -- correct for that ' +
  'helper\'s other 10 callers (an existing table genuinely failing a read), wrong here: no table at all ' +
  'isn\'t a partial/stale read, it\'s a migration that hasn\'t run. Same probe-and-cache pattern already ' +
  'used for security_findings_latest/qsr_hourly_sales_records elsewhere in this file -- now returns [] ' +
  'silently (console warning only, no banner) until the owner applies the migration.',
]};
