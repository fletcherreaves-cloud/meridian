// @ts-nocheck
export default {version:'5.436', date:'2026-09-13', changes:[
  'Labor Analytics -- Crew Hours now auto-first, closing the one metric dispatch #324 left on ' +
  'a raw manual read: opsLaborRows (qsr_labor_summary) was already pulling crew labor hours ' +
  'daily, it just had no metric-source.js chain. Caught a wrong assumption before shipping: ' +
  'the pull script\'s own COLS_LABOR_SUM constant spells the field camelCase ' +
  '(\'crewLaborHours\'), but the real JSONB key stored is snake_case (\'crew_labor_hours\') -- ' +
  'measured live against the table before trusting the constant\'s spelling. loadOpsLaborSummary ' +
  'now aliases it to camelCase crewHrs (matching otHrs/otDollar\'s existing pattern), and the ' +
  'new chain deliberately excludes laborRows -- its parser never actually emits a crewHrs field ' +
  '(confirmed against the auto-generated loader-emits map), so the old manual read\'s laborRows ' +
  'leg was silently always null, not a real source being dropped. Crew Hours also joins the ' +
  'panel\'s store-inclusion check (dispatch #68\'s gate) now that it has a real auto chain. ' +
  'Full writeup: memory/dispatch-crewhrs-auto-first-2026-09-13.md.',
  '5 new tests confirmed to fail against pre-fix code, including a real render of ' +
  'LaborAnalyticsPanel for a store whose only resolvable metric is Crew Hours.',
  'Full suite 507/507 files, 4829/4829 tests. Build clean, 542.11 KB / 850 KB eager-payload ' +
  'budget.',
]};
