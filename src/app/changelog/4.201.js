// @ts-nocheck
export default {version:'4.201', date:'2026-06-18', changes:[
  'Why Engine — systematic miss attribution, the answer to "why did we miss" across every day, not one click at a time',
  'diagnoseMiss/crossStoreCheck extracted from ForecastTable closures to top-level functions — reused, not duplicated',
  'New: dollar-quantified forecast composition (weather/ops/trend/event $ contribution) via exact algebra on the known forecast formula',
  'Single-store scan: MAPE, explained-vs-unexplained miss rate, DOW miss pattern, worst misses each with full diagnosis',
  'District scan: ranks all 27 stores by MAPE and explained%, surfaces calibration candidates (high MAPE + low explained = model gap, not missing event data)',
  'Every miss card can tag an event directly, closing the loop back into calibration',
]};
