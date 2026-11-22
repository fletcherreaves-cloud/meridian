// @ts-nocheck
export default {version:'5.848', date:'2026-11-22', changes:[
  '**Egress Wave 1 delta-sync pilot #2: `lifelenz_job_hours` now watermark-syncs too.** Task ' +
  '#190, continuing Wave 1\'s readiness-ordered rollout (`memory/plan-egress-reduction-2026-11-20.md` ' +
  'Section 17/18). First closed the loader gap the prior audit pass caught: `loadLifeLenzJobHours` ' +
  'never exposed `updatedAt` on its mapped return, even though the pull script ' +
  '(`scripts/lifelenz-pull.mjs`\'s `jobRowsFor()`) sets it unconditionally on every row — fixed in ' +
  'the SAME commit as the delta-sync build, per the audit\'s own scoping note that these fixes don\'t ' +
  'need a prerequisite PR. `loadLifeLenzJobHours({ since })` gained the same additive `since` param ' +
  'as `lifelenz_dar`\'s pilot; `_stLifelenzJobHours` now reads a `localStorage` watermark and merges ' +
  'the delta into `ds.jobHours` by `(loc, weekStart, businessRoleId)` — the table\'s real primary ' +
  'key — instead of replacing the whole array every login. Confirmed upsert-only before building on ' +
  'it. 6 new tests ' +
  '(`dispatch-egress-wave1-pilot2-lifelenz-jobhours-watermark-2026-11-22.test.js`). See ' +
  '`memory/plan-egress-reduction-2026-11-20.md` Section 19. Full suite + build both clean.',
]};
