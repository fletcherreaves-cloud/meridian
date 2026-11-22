// @ts-nocheck
export default {version:'5.850', date:'2026-11-22', changes:[
  '**Egress Wave 1 delta-sync pilot #4: `lifelenz_compliance_audit` now watermark-syncs too.** ' +
  'Task #190, continuing Wave 1\'s readiness-ordered rollout ' +
  '(`memory/plan-egress-reduction-2026-11-20.md` Section 17/20/21). Reading the schema file ' +
  'before building (rather than trusting the original audit\'s grep-based pass) surfaced a second ' +
  'gap: `seq` is part of the table\'s real primary key `(loc, compliance_warning_id, seq)`, not ' +
  'just `lifelenz_schedule_variance`\'s — the schema calls `compliance_warning_id` the natural ' +
  'per-row key and `seq` a defensive tie-breaker for a future report revision that repeats an id, ' +
  'so it\'s almost always 0 today but the merge key is built against the full PK regardless. ' +
  'Added `seq: r.seq` to `loadLifeLenzComplianceAudit`\'s return in the same commit as the ' +
  'delta-sync build. `_stComplianceAudit` now reads a `localStorage` watermark and merges the ' +
  'delta into `ds.complianceAuditRows` by `(loc, complianceWarningId, seq)` instead of replacing ' +
  'the whole array every login, with a dedicated test proving two violations sharing one id stay ' +
  'distinct rows. The daily rollup is recomputed from the merged rows. Confirmed upsert-only ' +
  'before building on it. 6 new tests ' +
  '(`dispatch-egress-wave1-pilot4-lifelenz-complianceaudit-watermark-2026-11-22.test.js`). See ' +
  '`memory/plan-egress-reduction-2026-11-20.md` Section 21. Full suite + build both clean.',
]};
