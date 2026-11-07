// @ts-nocheck
export default {version:'5.676', date:'2026-11-07', changes:[
  '**Fix (v3): LifeLenz Payroll Readiness re-keyed on the report\'s real unique column, ' +
  'confirmed live.** v2 (5.629) de-duplicated in memory on `(geid,pay_period_start)` to stop the ' +
  'pull from timing out — that worked operationally but, confirmed live on 2026-11-05 via a real ' +
  'GetReportMeta call plus a real 879-row GetReportDataCsvAsync pull, was silently discarding ' +
  '86-99% of real rows: the report\'s true grain is one row per payroll entry/shift ' +
  '(`payroll_entry_id`, CSV label "Entry Id" — unique on 879/879 rows measured), not one row per ' +
  'pay period. `lifelenz_payroll_readiness` is now re-keyed to `(loc, payroll_entry_id)` ' +
  '(`supabase/schema-fix-lifelenz-payroll-readiness-pk-2026-11-07.sql`, owner migration — DDL is ' +
  'never an agent\'s own action), the pull script\'s dedup/upsert conflict target changed to ' +
  'match, and `payroll_entry_id` is now a promoted column rather than sitting unused in `raw`. ' +
  'Full writeup: memory/finding-lifelenz-payroll-readiness-pk-mismatch-2026-11-04.md.',
]};
