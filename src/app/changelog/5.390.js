// @ts-nocheck
export default {version:'5.390', date:'2026-09-07', changes:[
  'FOB Root-Cause Analysis: the Recount Impact drill-down (🔬 modal → click a store) now shows ' +
  'the case-pack-converted quantity alongside each item\'s base→final $ figures, e.g. ' +
  '"$120 → $340 (≈ 2.20 cs)" -- the same convention Change Monitor, ItemJourneyView, and the FOB ' +
  'Report\'s "Top item losers" already use.',
  'Re-measured the backlog\'s own claim before touching code: 3 of the 4 named spots (Change ' +
  'Monitor, ItemJourneyView, FOB Report + its printable HTML) were already shipped -- only this ' +
  'one was genuinely missing. recountImpactByStore() (fob-recount-analysis.js) already computed ' +
  'unitVar/caseSz internally via storeVarianceProgressions; it just never passed them out. ' +
  '2 new tests (fob-recount-analysis.test.js). Full suite 480 files/4600 tests, build clean, ' +
  'eager budget 537.53 KB / 850 KB (unchanged).',
]};
