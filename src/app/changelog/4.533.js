// @ts-nocheck
export default {version:'4.533', date:'2026-07-25', changes:[
  'Signals can now correlate against WEATHER and DAY-OF-WEEK, not just business metrics. The auto-pulled weather (high/low/avg temp, rainfall, wind) is now a metric group in the Scanner and Signal Lab — so "warmer days → more sales?" or "rain → drive-thru mix" surface automatically. Rainfall correctly keeps its dry (zero) days so it correlates real weather, not just rainy ones.',
  'New "Calendar" factors — Weekend, Friday, Monday (0/1 flags per day) — let you correlate the common-sense weekly patterns: does this store actually run hotter on weekends? Is there a Friday lift? (Friday is broken out on purpose as the anchor for the eventual Filet-O-Fish-Fridays product-mix check.) Four new seeded signals ship on: Weekend→Sales, High Temp→Sales, Rainfall→Guests, Friday→Sales.',
  'Under the hood: temperature metrics are concept-grouped (high/low/avg won\'t clutter the scanner by "correlating" with each other), and two calendar factors never pair with each other — every cross-relationship to real business metrics still surfaces, with the same effect-size + false-discovery guardrails as before.',
]};
