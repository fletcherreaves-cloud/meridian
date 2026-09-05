// @ts-nocheck
export default {version:'5.357', date:'2026-09-05', changes:[
  'New panel: Trend Explorer (Analytics section, 📈) -- owner-requested: pick ANY metric from ' +
  'the same ~80-metric registry Signals\' Scanner uses, pick a store and a date range, pick a ' +
  'daily/weekly/monthly/yearly frequency, and see it as a sparkline + period table. Deliberately ' +
  'SINGLE-STORE for v1 -- most registry metrics are rate/percentage values with no generic ' +
  'volume-weight field, so a correct district-wide rollup isn\'t possible yet without risking ' +
  'this repo\'s own "never average averages" rule; bucketing one store\'s own daily values into a ' +
  'wider period has no such problem (src/engine/trend-explorer.js\'s header comment has the full ' +
  'reasoning).',
  'Diagnostic bonus, delivered two ways per the ask ("labor is generally controlled on xx days, ' +
  'but struggles on xx days... then even try to cross verify the impact"): a By Day of Week bar ' +
  'chart (always available, no correlation math needed -- the direct answer to the "which ' +
  'weekdays run hot/cold" half) and a Moves Together With section that reuses Signals\' own ' +
  'Scanner correlation engine (Pearson r + Spearman + Benjamini-Hochberg FDR guardrails) rather ' +
  'than a second implementation, filtered to just the selected metric\'s pairs -- the ' +
  '"cross-verify the impact" half. Both stay clearly framed as association, never causation.',
  'src/engine/trend-explorer.js: pure aggregation helpers (bucketMetricSeries, ' +
  'filterSeriesToRange, dayOfWeekBreakdown, correlatedMetricsFor) kept separate from the React ' +
  'component so the bucketing math is directly unit-tested -- 14 new tests ' +
  '(src/__tests__/dispatch-trend-explorer.test.js), including a real catch: this app\'s business ' +
  'week starts WEDNESDAY (src/utils/date.js\'s weekStartOf(), "McDonald\'s standard"), not Sunday/ ' +
  'Monday, which the first draft of the test fixture got wrong before the app code did.',
  'Reuses existing building blocks end to end rather than duplicating them: DateRangeControl / ' +
  'LocationSelector (src/components/PanelControls.js, same panel-contract.md convention as every ' +
  'other panel), signal-registry.js\'s METRIC_CATEGORIES/extractMetricValues/scanAllPairs, and ' +
  'signals.js\'s MetricSelect (newly exported for this reuse). New TrendSparkline component ' +
  '(general {period,value} shape) since MiniSparkline in signals.js is keyed on correlation-r ' +
  'history specifically and wasn\'t a fit.',
  'Wired in as a route:true panel (src/app/panel-registry.js, id:\'trends\', section:\'analytics\', ' +
  'perm:\'analytics.store\') and lazy-loaded (src/app/App.js) -- confirmed in the build output as ' +
  'its own 7.80 kB chunk, not part of the eager entry payload (532.37 KB / 850 KB budget, ' +
  '317.63 KB headroom, unchanged by this panel).',
]};
