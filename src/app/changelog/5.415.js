// @ts-nocheck
export default {version:'5.415', date:'2026-09-10', changes:[
  'GH #164 (Labor basis rollout) is fully migrated -- re-measured against current code before ' +
  'touching anything: the invariant test it asked for (labor-basis-invariant.test.js) already ' +
  'passes on main, and the "69 readers across 13 files" grading/display paths are down to a ' +
  'handful of comments, the deliberately-left-alone seeded-demo-data block, and the monthly- ' +
  'targets parser/persistence layer (writes, not reads -- out of #164\'s own scope from the ' +
  'start). computeOpsScore, buildBrief\'s WATCH-LABOR finding, and finding-rules.js\'s dollar ' +
  'figure all cite the same resolveLaborTarget()-resolved number.',
  'What was still genuinely open, from the triage\'s own "finding 2" (deliberately kept OUT of ' +
  '#164\'s scope as a separate bug): labor-tools.js\'s district/operator/patch labor-% TARGET ' +
  'was a straight unweighted per-store mean, compared against an ACTUAL that IS sales-weighted ' +
  '-- apples-to-oranges, and a direct violation of CLAUDE.md\'s standing "never average ' +
  'averages, dollar-weight aggregates" rule. "$700k @ 20% + $300k @ 25% blends to 21.5%, not ' +
  '22.5%." Both call sites (OperatorSummaryPanel\'s per-group distTgt, LaborAnalyticsPanel\'s ' +
  'district-wide distTgt) had the bug; fixed by routing both through one shared, exported, ' +
  'pure weightedLaborTarget() so they can\'t independently drift into two different answers ' +
  'again. tTpph/tOepe deliberately stay unweighted (simple mean) -- their own corresponding ' +
  'actuals (op.tpph/op.oepe, dist.tpph) are themselves simple means, so weighting only the ' +
  'target would introduce a NEW mismatch rather than fix one; dollar-weighting is only correct ' +
  'when the number it\'s compared against is also dollar-weighted.',
  'Findings 3 (smart-targets.js\'s officialVal bypassing the merge chain) and 4 ' +
  '(scheduling.js\'s tJuneLaborPct) from the same triage: 3 is confirmed still open (own code ' +
  'comment: "deliberately NOT fixed here per the #164 triage\'s own note to keep it a separate ' +
  'commit") and remains a separate, smaller sourcing bug, not touched in this pass; 4\'s named ' +
  'field no longer appears in scheduling.js at all -- already resolved or removed.',
  '9 new tests (dispatch-164-labor-tools-district-target-weighting.test.js): 4 unit tests on ' +
  'the exported weightedLaborTarget() (the triage\'s own $700k/$300k example, zero-weight ' +
  'exclusion, unresolvable-target exclusion, empty-input), plus a real LaborAnalyticsPanel ' +
  'render confirming the district KPI card\'s sub-text shows the sales-weighted target ' +
  '(23.00%) and not the unweighted mean (25.00%) -- confirmed to fail against the pre-fix code ' +
  '(reverted labor-tools.js, re-ran) before landing. Full suite 4679/4679, build clean, ' +
  '538.62 KB / 850 KB budget.',
]};
