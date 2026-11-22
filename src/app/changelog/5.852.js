// @ts-nocheck
export default {version:'5.852', date:'2026-11-22', changes:[
  '**Egress Wave 1 delta-sync pilot #6: `lifelenz_payroll_readiness` now watermark-syncs too — ' +
  'closing the planned Wave 1 pilot series.** Task #190 ' +
  '(`memory/plan-egress-reduction-2026-11-20.md` Section 17/22/23). Reading the schema file ' +
  'fully before building (per the standing lesson from pilots #4/#5) found the biggest gap yet: ' +
  'the loader exposed NO `payrollEntryId` at all, despite `(loc, payroll_entry_id)` being the ' +
  'table\'s real primary key. The table\'s ORIGINAL key — `(loc, geid, pay_period_start)` — was ' +
  'outright wrong: a prior live measurement found one real employee/pay-period combination held ' +
  '13 separate shift rows, so every production pull was discarding 86-99% of real rows to ' +
  'last-write-wins dedup before a 2026-11-07 migration re-keyed the table on the report\'s real ' +
  'per-row id. A delta-sync keyed on anything less would have reintroduced that exact bug. Added ' +
  '`payrollEntryId: r.payroll_entry_id` to `loadLifeLenzPayrollReadiness`\'s return in the same ' +
  'commit as the delta-sync build; `_stPayrollReadiness` now reads a `localStorage` watermark ' +
  'and merges the delta into `ds.payrollReadinessRows` by `(loc, payrollEntryId)` instead of ' +
  'replacing the whole array every login, with a dedicated test proving multiple shift rows for ' +
  'the same employee/pay-period stay distinct. 6 new tests ' +
  '(`dispatch-egress-wave1-pilot6-lifelenz-payrollreadiness-watermark-2026-11-22.test.js`). This ' +
  'closes the planned series for schedule_variance/compliance_audit/employee_performance/' +
  'payroll_readiness alongside the earlier dar/job_hours pilots. Remaining: `hmeDt`/`squadle` ' +
  '(need their own `updatedAt` exposed first). See ' +
  '`memory/plan-egress-reduction-2026-11-20.md` Section 23. Full suite + build both clean.',
]};
