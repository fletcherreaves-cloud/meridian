// @ts-nocheck
export default {version:'5.623', date:'2026-11-04', changes:[
  '**New automated pull: LifeLenz Payroll Readiness (task #85 Phase 1, infrastructure only).** ' +
  'A fourth LifeLenz Data Explorer report pull, same Lakehouse trigger→poll→download mechanism ' +
  'as Compliance Audit/Employee Performance/Schedule Variance: per-employee, per-pay-period ' +
  'scheduled-vs-worked hours, hours/cost variance, and earnings broken out by type (regular/' +
  'overtime/double/time-off/misc/compliance/differential). Built toward the owner-requested ' +
  '"identify which shifts/employees drive overtime" correlation work -- overtime_earnings/' +
  'overtime_hours are promoted to real columns specifically for that. ' +
  '⚠️ **Unconfirmed beyond every prior Data Explorer pull, flagged explicitly rather than ' +
  'hidden**: this session had no LIFELENZ_TOKEN, so neither the reportKey ' +
  '(`payroll_readiness_report`, a naming-pattern guess) nor the field member names (from ' +
  'memory/lifelenz-session.md\'s representative, not live-captured, column description) were ' +
  'live-validated. The pull\'s dynamic GetReportMeta-driven label map means a wrong guess just ' +
  'leaves that one field in `raw` JSONB rather than breaking anything, and a wrong reportKey ' +
  'fails loudly rather than silently pulling nothing -- but real data from this pull should not ' +
  'be trusted until the owner manually triggers the new GitHub Action (or a future session with ' +
  'LIFELENZ_TOKEN runs a discovery dispatch) and its job log is read. New: ' +
  'scripts/lifelenz-payroll-readiness-pull.mjs, ' +
  '.github/workflows/lifelenz-payroll-readiness-pull.yml (watched in sync-failure-watch.yml), ' +
  'a stream-freshness.js STREAMS entry (16-day cadence, matching pay-period posting frequency, ' +
  'not the usual 1-day), supabase/schema-lifelenz-payroll-readiness.sql (deliverable for the ' +
  'owner\'s own Supabase action -- nothing run here), loadLifeLenzPayrollReadiness + App.js ' +
  'startup wiring into ds.payrollReadinessRows. No UI panel yet -- deliberately deferred until ' +
  'this pull is live-confirmed; the schedule cross-reference and Scanner correlation ' +
  'integration (task #85\'s later phases) also wait on that. 16 new tests ' +
  '(src/__tests__/dispatch-lifelenz-payroll-readiness-2026-11-04.test.js, synthetic labels -- ' +
  'same "prove the mechanism, not the real shape" approach Compliance Audit\'s own tests used ' +
  'before its report was live-confirmed).',
]};
