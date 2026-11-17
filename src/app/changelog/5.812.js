// @ts-nocheck
export default {version:'5.812', date:'2026-11-17', changes:[
  '**[sweep:data-sourcing] Targets vs Actual: TPPH/OEPE/KVS Time/R2P now use the Σ/Σ rollup, ' +
  'not flat mean-of-daily.** Weekly self-maintenance sweep found the Monthly tab\'s TPPH row ' +
  'and the entire Yearly tab (TPPH/OEPE/KVS Time/R2P) reading `metricAvg` directly for ratio-' +
  'capable metrics — the exact completeness-artifact bug (an in-progress business day blended ' +
  'into a period average at full weight) that dispatches #153/#155/#221 already fixed for ' +
  'every other TPPH/OEPE/KVS/R2P call site in the app. Crew Labor %, right next to each of ' +
  'these in the same arrays, already used `metricSumRatio` — tpph/oepe/kvst/r2p just never got ' +
  'the same treatment in this brand-new (2026-11-15) report. Fixed by switching those 5 call ' +
  'sites to `metricRate` (Σ/Σ, falling back to the old `metricAvg` figure only when the raw ' +
  'legs can\'t resolve — so no number that displayed before goes blank). Parked % stays on ' +
  '`metricAvg` deliberately (no declared ratio numerator/denominator for it). The Daily tab\'s ' +
  'own documented metricAvg rationale was left untouched (Tier C — reversing a documented ' +
  'decision needs the owner\'s own call, flagged in the sweep report, not applied here).',
]};
