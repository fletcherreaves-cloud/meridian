// @ts-nocheck
export default {version:'5.599', date:'2026-11-02', changes:[
  '**New: Compliance Audit (Labor & Scheduling hub).** Second build against LifeLenz\'s Data ' +
  'Explorer (see v5.597\'s Schedule Variance). Pulls the Compliance Audit report daily -- real ' +
  'labor-compliance violations (meal/rest break, minor-labor-law, etc.) each with a $ cost and ' +
  'hours penalty, who it was against, and whether a manager dismissed it -- into a new tab with ' +
  'per-store, per-category, and per-employee rollups plus a recent-violations drill-down. ' +
  'Nothing in Meridian tracked this before -- a store racking up real-dollar compliance ' +
  'penalties is a concrete, measurable labor-law cost, not an abstract one.',
  'Unlike the Schedule Variance pull (9 hardcoded columns), this report has 42 real columns, so ' +
  'the pull calls LifeLenz\'s GetReportMeta live at runtime to get the real column list and ' +
  'display labels, rather than hand-typing all 42 -- more robust if the report schema changes, ' +
  'and sidesteps the guess-then-fix cycle Schedule Variance went through.',
  'Also feeds Signals\' metric registry (Compliance Violations, Compliance Cost Penalty) so it ' +
  'can auto-correlate against every other metric the Scanner already covers.',
  'New automated pull: scripts/lifelenz-compliance-audit-pull.mjs (daily, LifeLenz Compliance ' +
  'Audit Pull workflow) — watched by sync-failure-watch.yml and stream-freshness.js like every ' +
  'other daily stream.',
]};
