// @ts-nocheck
export default {version:'5.771', date:'2026-11-14', changes:[
  '**Task #152 (metric reconciliation), pass 2: signal-registry.js.** Verified (not accepted ' +
  'as given) the previous pass\'s claim that engine/signal-registry.js\'s Scanner/Signal-Lab ' +
  'metric groups were "mostly already covered" — true for most keys (bridged to a real ' +
  'metric-source.js chain), but 20 genuinely had no METRIC_SOURCES chain at all and were ' +
  'undocumented: 4 FOB sub-items (baseFoodPct/discCoupon/pLFoodPct/pLPaperPct — direct report ' +
  'pass-throughs), 11 SMG/VOICE customer metrics (FullScale scorecard + the separate VOICE ' +
  'Performance upload), and 5 real-formula LifeLenz Data Explorer metrics (schedGap, plus the ' +
  'Schedule Discipline and Compliance Audit count/$ pairs). All 20 added to ' +
  'METRIC_PROVENANCE with formulas traced from the real parser/engine code, 4 new tests. ' +
  '**Finding, not fixed:** signal-registry.js\'s own "salesVsLY" key (a raw monthly FOB field) ' +
  'and metric-provenance.js\'s existing curated "salesVsLY" entry (DAR matched-day calc) are ' +
  'two different real metrics sharing one name across two registries that never cross-' +
  'reference each other today — not a live bug (Metric Lineage never reads signal-registry.js), ' +
  'but would silently mislabel one of them the moment anything wires Signal Lab into Lineage ' +
  'lookups. Flagged for a product decision, not renamed unilaterally. Full status: ' +
  'memory/plan-metric-reconciliation-2026-11-14.md. 8039 tests passing, build clean ' +
  '(704.62 KB eager, budget 850 KB).',
]};
