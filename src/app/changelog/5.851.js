// @ts-nocheck
export default {version:'5.851', date:'2026-11-22', changes:[
  '**Egress Wave 1 delta-sync pilot #5: `lifelenz_employee_performance` now watermark-syncs ' +
  'too.** Task #190, continuing Wave 1\'s readiness-ordered rollout ' +
  '(`memory/plan-egress-reduction-2026-11-20.md` Section 17/21/22). Read the schema file fully ' +
  'before building, per pilot #4\'s own lesson — this one checked out clean: the real PK is ' +
  '`(loc, geid, period_end)`, a simple rolling-window key with no `seq` tie-breaker like its two ' +
  'siblings, and the loader already exposed all three verbatim. No additive field fix needed. ' +
  '`loadLifeLenzEmployeePerformance({ since })` gained the additive `since` param; ' +
  '`_stEmployeePerformance` now reads a `localStorage` watermark and merges the delta into ' +
  '`ds.employeePerformanceRows` by `(loc, geid, periodEnd)` instead of replacing the whole array ' +
  'every login. Confirmed upsert-only before building on it. 6 new tests ' +
  '(`dispatch-egress-wave1-pilot5-lifelenz-employeeperformance-watermark-2026-11-22.test.js`). ' +
  'See `memory/plan-egress-reduction-2026-11-20.md` Section 22. Full suite + build both clean.',
]};
