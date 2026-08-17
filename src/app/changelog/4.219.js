// @ts-nocheck
export default {version:'4.219', date:'2026-06-27', changes:[
  'Fixed 3 Peaks × Labor Gap showing nothing — root cause: r.date.toISOString() called on ISO string after IDB round-trip (strings don\'t have .toISOString()). Added _toD()/_toDK() helpers; laborByDate is now built once outside the per-slice loop instead of rebuilt 3 times',
  'Fixed case where all OEPE readings are above target (was returning null for every slice, hiding the section) — now compares worst-half vs best-half OEPE days with a label explaining the split',
  'Fixed DOW Heat-Map .getDay() calls on laborRows — same date-type safety fix applied to the DOW data builder (r.date.getDay() → _toD(r.date).getDay())',
  'Fixed Competitive Impact runtime error: r.date.toISOString() on string dates in the DOW average and row-lookup code — replaced with _toDK() helper',
  'Fixed Weekly Narrative "Unable to generate narrative" — was reading settings.anthropicKey (undefined) instead of localStorage.getItem("mf_anthropic_key")',
  'Fixed FOB Root-Cause Matrix showing rollup rows (fobPct sep:true, pLFoodPct isTotal:true) — added !c.sep&&!c.isTotal filter; Base Food excluded via actionable:false',
  'Fixed District Lens Opportunity Store/Dist Average all showing — computeMetricAverages was comparing r.date (Date) against a string cutDate; fixed to compare Date objects',
  'Fixed District View blank screen — showCohorts&&cohorts?A:B parsed as showCohorts&&(cohorts?A:B); added parentheses to fix operator precedence',
  'Fixed mdToNodes is not defined crash in forecast.js InfoIcon — circular dependency prevented import from store-dash.js; defined mdToNodes inline in forecast.js',
  'Fixed (userEvents||[]).filter is not a function — userEvents is {[loc]:{[dk]:event}} object, not array; flattened with nested Object.entries loops; fixed e.date → e.evDate',
  'Weekly Narrative: added error message propagation — if API returns {error:{...}}, shows error message instead of falling through to "Unable to generate narrative"',
  'Added Predictive Alerts callout at top of Overview tab when TREND ALERT findings exist',
  'Added feature guide strip at top of Shift Analysis tab with DOW Heat-Map / OEPE Opportunity / 3 Peaks / Competitive Impact status pills',
  'Added 3 Peaks × Labor Gap cross-reference note in PeaksTab linking users to the Shift Analysis section',
]};
