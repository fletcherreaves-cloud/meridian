// @ts-nocheck
export default {version:'5.586', date:'2026-10-26', changes:[
  '**District/operator-group TPPH and OEPE are now hours/transaction-weighted Sigma/Sigma rollups, ' +
  'not an unweighted mean of each store\'s own ratio (GitHub issue #175, the TPPH/OEPE half left ' +
  'open after tLabor shipped weighted in PR #1218/v5.415).** Previously, OperatorSummaryPanel\'s ' +
  'group TPPH/OEPE and LaborAnalyticsPanel\'s district TPPH were a straight average of each ' +
  'included store\'s own ratio, weighting a 2-hour store the same as a 100-hour store -- and the ' +
  'corresponding target was deliberately left an unweighted mean too, on the stated (and correct, ' +
  'at the time) reasoning that weighting only one side would create a NEW mismatch against an ' +
  'unweighted actual rather than fix one.',
  'Fixed by routing BOTH sides through the same Sigma/Sigma family every other ratio metric in this ' +
  'file already uses for a single store: metricRate/metricSumRatio (engine/metric-source.js) already ' +
  'accept an array of locs, so passing the whole group\'s/district\'s loc list gives the true ' +
  'Sigma-numerator/Sigma-denominator rollup for the ACTUAL. The TARGET is then weighted by the ' +
  'exact same basis the actual was just summed over -- Sigma-hours for TPPH, Sigma-DT-transactions ' +
  'for OEPE (metricSumRatio\'s denSum, newly exposed alongside its existing value/n) -- via a new ' +
  'generic weightedTarget() helper (weightedLaborTarget stays hardcoded to resolveLaborTarget, which ' +
  'does not apply to a plain numeric tTpph/tOepe target).',
  '7 new tests (src/__tests__/issue-175-tpph-oepe-district-weighting.test.js, plus a metricSumRatio ' +
  'numSum/denSum unit test) prove weighted != unweighted on a fixture with deliberately unequal ' +
  'per-store hours, and render the real LaborAnalyticsPanel/OperatorSummaryPanel panels end to end.',
  'Full suite 662/662 files, 6153/6153 tests green. Build clean, within budget (a views/ + ' +
  'engine/ change, additive -- no new static import).',
]};
