// @ts-nocheck
export default {version:'5.440', date:'2026-09-14', changes:[
  'Smart Targets -- FOB % row now breaks out its 6 components (Comp Waste, Raw ' +
  'Waste, Condiments, Emp/Mgr Meals, Stat Variance, Unexplained), each showing its ' +
  'own Smart target, guaranteed to sum to the Smart FOB % number already shown for ' +
  'that store. New allocateShares() (engine/smart-targets.js): splits a computed ' +
  'ratio target across named components using each component\'s own trailing ' +
  'weighted-recency level as its share -- normalized against the ACTUAL SUM of the ' +
  'levels it just computed, never against the total itself, so Σ(total*share) === ' +
  'total by construction even though each component runs its own independent ' +
  'MAD-based anomaly exclusion (which means the components can\'t, in general, ' +
  'exactly reconstruct the total\'s own excluded-day set). Official component ' +
  'figures are a direct read of each store\'s tCompWaste/tRawWaste/tCondiment/' +
  'tEmpFood/tStatLoss/tUnex -- confirmed these 6 already sum to tFOBTarget exactly ' +
  'for every store in DEFAULT_TARGETS, so no allocation was needed there. ' +
  'Component cells sit right after Smart in the table, hover for Official/Current.',
  'Also: confirmed the existing "vs Official" column math is correct as designed -- ' +
  '(Smart/Official - 1) * 100, a relative percent difference (not a percentage-' +
  'point gap), computed from full-precision underlying values rather than the ' +
  '2-decimal display figures (which is why a manual recompute off the rounded % ' +
  'columns lands a few hundredths off — display rounding, not a bug). No code ' +
  'change needed there.',
  '17 new/extended tests (7 pure allocateShares cases, 2 fobMonthly/METRICS ' +
  'registry cases, 3 real SmartTargetsPanel render cases selecting FOB % via its ' +
  'actual <select>) confirmed to fail against pre-fix code.',
  'Full suite 510/510 files, 4873/4873 tests. Build clean, 543.21 KB / 850 KB ' +
  'eager-payload budget.',
]};
