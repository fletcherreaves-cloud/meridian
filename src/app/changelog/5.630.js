// @ts-nocheck
export default {version:'5.630', date:'2026-11-05', changes:[
  '**Feature: Prime Cost % (task #86) — Labor % + FOB %, the standard combined-cost QSR KPI, ' +
  'added to the Top/Bottom Performers leaderboard next to its two components.** New ' +
  '`primeCostPct` metric-source.js chain, derived from the already auto-first laborPct/fobPct ' +
  'metrics (no new upload, no new table). direction:\'lower\' like both inputs. **Also found ' +
  'and fixed while building it:** `metricDaily()` — one of the file\'s two standard per-metric ' +
  'accessors — never actually supported `derive` at all, for ANY metric: it threw on a ' +
  'derivation-only key (avgRate, spph, oppCostDollar/Pct, actVsSched/Opp, and now ' +
  'primeCostPct) and silently skipped the derive fallback even for a key with both `srcs` and ' +
  '`derive`, unlike metricSeries/metricAvg\'s shared resolver, which already did both. Grepped ' +
  'every call site first — nothing in the app currently calls metricDaily with a derive-only ' +
  'key, so this was a dormant landmine, not a live wrong-answer bug. Fixed to mirror the ' +
  'already-proven srcs-then-derive-fallback pattern, with a cyclic-definition depth guard ' +
  'matching metricSeriesWithSource\'s own. New tests cover both: ' +
  'src/__tests__/dispatch-86-prime-cost-pct.test.js. 729/729 test files, 6658/6658 tests; ' +
  'build clean (612.48 KB / 850 KB entry budget, unchanged).',
]};
