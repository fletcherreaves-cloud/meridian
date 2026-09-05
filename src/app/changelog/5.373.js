// @ts-nocheck
export default {version:'5.373', date:'2026-09-05', changes:[
  'Ran the leak-free "as of visit date" backtest memory/finding-ecosure-propel-api-2026-08-22.md ' +
  'prescribed for Visit Readiness\'s Waste & variance proxy (v5.372 explicitly deferred this as ' +
  'real methodology work) -- against real production data, not a synthetic sample. New ' +
  'backtestFoodSafetyProxy() reconstructs the proxy from ONLY data on record before each real ' +
  'EcoSure visit\'s own date (threading a new asOfMs cutoff through valuesByLoc/msValueForLoc/' +
  'pickValue/subScore, default Date.now() so every existing live call site is unaffected), then ' +
  'compares it against that visit\'s real score -- reusing calibrateReadiness\'s own Spearman/hit-' +
  'rate methodology rather than inventing a second statistic.',
  'Measured across 244 real EcoSure visits (2022-2026), 240 with reconstructible waste data: ' +
  'Spearman r=0.07, direction hit rate 53% (127/240), and the proxy flagged only 2 of the 4 ' +
  'visits carrying a real critical fail. Confirms at district scale -- not just the single ' +
  'Ardmore-Broadway anecdote that first raised the question -- that the waste/variance proxy has ' +
  'essentially no relationship with real EcoSure outcomes. Wired into computeVisitReadiness as ' +
  'res.fsBacktest and shown live in a new "Waste & variance proxy check" card next to the existing ' +
  'Model Check card. READINESS_GAPS\' "EcoSure calibration" entry now states this measured result ' +
  'directly, replacing the old "unvalidated -- no sample" placeholder.',
  'Not a reason to remove the flag -- Waste & variance was already reframed (dispatch #69) as its ' +
  'own waste/holding discipline signal, explicitly not a food-safety prediction. This measurement ' +
  'is why that framing must stay firm, not a reason to relax it.',
]};
