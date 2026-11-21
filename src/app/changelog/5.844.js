// @ts-nocheck
export default {version:'5.844', date:'2026-11-21', changes:[
  '**Fixed six LifeLenz Data Explorer loaders fetching their ENTIRE table history on every ' +
  'single login — unbounded and growing forever.** App.js\'s eager startup stages for Schedule ' +
  'Variance/Compliance Audit/Employee Performance/Payroll Readiness/DAR call these loaders with ' +
  'zero args, and each one\'s `{start,end,locs}={}` signature had no internal default, so ' +
  '`start`/`end` stayed undefined and the `.gte`/`.lte` filters never applied. Measured live ' +
  '(service-role): `lifelenz_schedule_variance` 6,227 rows, `lifelenz_compliance_audit` 9,727, ' +
  '`lifelenz_employee_performance` 21,073, `lifelenz_payroll_readiness` 83,595 rows (and ZERO ' +
  'consuming panel — pure waste, confirmed by grep across src/views and src/features — only ' +
  'stream-freshness.js reads it, for a liveness check), `lifelenz_dar` 2,884, ' +
  '`lifelenz_attendance_summary` 1,640. Fixed with a `daysBack` default on each that only ' +
  'applies when the caller omits `start` — every existing bounded caller (loadLifeLenzDar\'s two ' +
  '`{start,end}` call sites: `refreshDar` and the LiveOps DAR fallback) is byte-identical in ' +
  'behavior. Bounds sized to the real consumer: 45d for scheduleVariance/complianceAudit/dar/ ' +
  'attendance (labor-tools.js\'s window selectors top out at 30d), 60d for employeePerformance, ' +
  '14d for payrollReadiness (the tightest — nothing consumes it but a freshness check). 7 new ' +
  'tests (`finding-lifelenz-unbounded-eager-fetch-2026-11-21.test.js`), verified to catch a ' +
  'reverted default before shipping. See `memory/plan-egress-reduction-2026-11-20.md` Section 15. ' +
  '**Separately, fixed Signals Live Ops\'s "⟳ Sync Now" button dispatching a dead workflow.** ' +
  'It called `triggerDarSync`, which dispatched the `dar` workflow (`qsrsoft-dar-pull.yml`) — ' +
  'schedule-paused since 2026-11-16 for compliance reasons (CLAUDE.md\'s QSRSoft Operator ' +
  'Security Notice), so every click was dispatching a pull that would never run. ' +
  '`loadDailyActivity`\'s own READ path already falls back to LifeLenz\'s DAR when QSRSoft\'s is ' +
  'empty (task #187); the manual button now dispatches that SAME stand-in SOURCE instead of the ' +
  'dead one — a new `lifelenz_dar` entry in the `trigger-dar-sync` Edge Function\'s workflow ' +
  'allowlist, backed by the existing hourly `lifelenz-dar-pull.yml`. `daysRecent` (days) converts ' +
  'to that workflow\'s `lookback_hours` input, floored at 24h so a same-day click always covers ' +
  'the full current business day. Data Manager\'s own "QSRSoft Daily Activity" row is left alone ' +
  'on purpose — it is honestly labeled and paused, not broken. 3 new tests ' +
  '(`dispatch-liveops-sync-now-lifelenz-dar-2026-11-21.test.js`), verified against a reverted fix.',
]};
