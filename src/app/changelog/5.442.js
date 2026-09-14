// @ts-nocheck
export default {version:'5.442', date:'2026-09-14', changes:[
  'Smart Targets -- new "📊 Backtest (YTD)" toggle: for every completed calendar ' +
  'month so far this year, per store, shows what Smart would have recommended ' +
  'AS OF that month\'s first day (leak-free -- only data from before that date), ' +
  'the real Actual for that month, and the real Official target that was loaded/' +
  'approved for that store and month at the time. Summary strip: Smart MAPE vs ' +
  'Official MAPE, and how often each was the closer call.',
  'New runMonthlyBacktest() (views/smart-targets.js) deliberately reuses the SAME ' +
  'low-level primitives (weightedRecencyLevel/weightedLevel/peerAnchor/blend, ' +
  'medianProject) the live "now" view already uses for Smart, rather than a ' +
  'parallel re-implementation -- the same pattern backtestProjectors already ' +
  'established for the 28-day "Best fit" scoreboard, extended to real calendar ' +
  'months. Official is resolved via engine/review-engine.js\'s already-shipped ' +
  'mergedTargetsForLocMonth() (the same per-store-per-past-month resolver the ' +
  'Review/EOM flows use), fed through each metric\'s OWN existing officialVal() ' +
  'accessor so labor\'s resolveLaborTarget special case and every other metric\'s ' +
  'field-extraction logic is reused exactly, not duplicated.',
  'Off by default (fetches a full year of history on first click, not on every ' +
  'panel open). Metrics whose source stream has a hard start date (Daily Glimpse ' +
  '-sourced: labor %/OEPE/avg check/promo %, floor 2026-07-01) show fewer months ' +
  'or none for periods before that floor -- documented in the panel footer as a ' +
  'real data-availability limit, not a bug. Metrics with no monthly-level ' +
  'official history (OEPE/R2P: yearly only; avg check/promo %: neither) show the ' +
  'SAME Official value across every backtest month, honestly, since no finer-' +
  'grained history was ever recorded.',
  '8 new/extended tests confirmed to fail against pre-fix code, including a real ' +
  'SmartTargetsPanel render clicking the actual Backtest button, and a leak-free ' +
  'guard (appending a wildly different future month does not change a prior ' +
  'month\'s already-computed Smart number).',
  'Full suite 513/513 files, 4901/4901 tests. Build clean, 547.10 KB / 850 KB ' +
  'eager-payload budget.',
]};
