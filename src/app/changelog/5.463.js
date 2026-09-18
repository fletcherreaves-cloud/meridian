// @ts-nocheck
export default {version:'5.463', date:'2026-09-18', changes:[
  'Why Engine: fixed crossStoreCheck() (engine/why.js), the district-wide-vs-store-specific ' +
  'miss classifier feeding diagnoseMiss\'s "🏪 X of Y other stores also showed..." cause line. It ' +
  'filtered raw ds.laborRows directly -- manual-upload-only, no auto fallback, and an unbounded ' +
  'history scan -- so a cloud-only store got NO cross-store correlation check at all, and every ' +
  'store\'s peer baseline silently used its ENTIRE history instead of a bounded recent window.',
  'Fixed to route through metric-source.js\'s metricDaily/metricSeries (auto-first \'sales\' ' +
  'resolver, same one every other panel already uses) with a 98-day (~14 same-DOW weeks) ' +
  'lookback -- matching the EWMA DOW forecast model\'s own already-established convention, not ' +
  'an invented window. Same DOW-bucketing pattern (T00:00:00 local-time parse) already proven ' +
  'in store-analytics.js\'s ShiftAnalysisTab fix.',
  '3 new tests against the real exported crossStoreCheck(), fixtures carrying ONLY ' +
  'qsrActSummaryRows (no ds.laborRows anywhere) -- would fail on a revert to the old code, per ' +
  'this repo\'s own verification standard. Full suite 527/527 files, 5033/5033 tests. Build ' +
  'clean, eager payload 551.25 KB gzip (budget 850 KB).',
]};
