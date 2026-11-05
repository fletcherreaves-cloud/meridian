// @ts-nocheck
export default {version:'5.642', date:'2026-11-05', changes:[
  '**Knowledge Base: 3 new Panel Guide articles for the highest-traffic panels still with no ' +
  'dedicated documentation (task #75).** `morning_brief_guide` (Daily Brief) — documents the ' +
  'real 12-rule MORNING_RULES correlation engine (not the stale "9 rules" the panel\'s own ' +
  'subtitle still shows) and a real, measured finding: `assembleBriefStoreData()` checks manual ' +
  'Labor/Controls uploads BEFORE the auto DAR/emailed streams for several headline fields — the ' +
  'reverse of the app\'s standing auto-first rule, documented honestly rather than assumed ' +
  'compliant. `reports_hub_guide` (Reports Hub) — a pure navigation/index layer with no data ' +
  'sourcing of its own. `date_range_report_guide` (Date-Range Report) — confirmed as a CLEAN ' +
  'example of the auto-first rule actually being followed, plus a real UX trap worth knowing: ' +
  'its Ops Score/Ctrl Score columns are NOT scoped to the picked date range, unlike every other ' +
  'column in the row. Also fixed a real gap found while researching: `panel_index`\'s own ' +
  'ANALYTICS directory never mentioned Reports Hub at all — added the missing line. 9 new ' +
  'tests, 738/738 test files, 6698/6698 tests; build clean.',
]};
