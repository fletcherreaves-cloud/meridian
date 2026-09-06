// @ts-nocheck
export default {version:'5.376', date:'2026-09-06', changes:[
  'Built forecast-calibration-gap flag (1 of 6 Decisions Panel Inventory salvage items, ' +
  'decisions-panel-inventory-2026-08-10.md #6) -- a store whose forecast MAPE is genuinely high ' +
  'but is otherwise showing green (nothing else in the attention feed flagged it crit or warn) ' +
  'was structurally invisible before this: buildBrief only looks at operational metrics, and no ' +
  'existing detector looks at MAPE at all. New forecastCalibrationGap() in ' +
  'src/engine/attention-feed.js fires when a store clears 12% MAPE AND has zero crit/warn items ' +
  'from any other detector -- which means it necessarily runs AFTER the rest of ' +
  'buildAttentionFeed is assembled, unlike every independent detector before it.',
  'Wired into the live feed (attention-now.js useAttentionFeed) sourcing each store\'s MAPE from ' +
  'DEFAULT_MODEL_ASSIGNMENTS[loc].weekly.mape -- the same static per-store backtest figure ' +
  'modelHealthScore (engine/forecast.js) already reads for its own Accuracy scoring component, ' +
  'so this introduces no new data-sourcing precedent.',
  '6 new tests in attention-feed.test.js covering the threshold, the crit/warn suppression, that ' +
  'an info-severity item does NOT suppress it, that a different store\'s flag does not cross-' +
  'suppress, and the real buildAttentionFeed wiring end to end.',
  '5 of the 6 salvage items remain unbuilt -- each needs porting real logic out of a retired ' +
  'panel (cross-store transfer matcher, duplicate-WRIN detector, OEPE-dollarization for slow-DT ' +
  'ranking, daypart-asymmetry detector, "This Week\'s Focus" problem-type ranking) that this pass ' +
  'did not locate/verify against current code, unlike this one which was fully self-contained.',
  'Bundle: no entry-chunk change (attention-feed.js/attention-now.js are already reached, not ' +
  'newly imported).',
]};
