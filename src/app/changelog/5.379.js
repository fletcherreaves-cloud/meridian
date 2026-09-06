// @ts-nocheck
export default {version:'5.379', date:'2026-09-06', changes:[
  'Built 1 more Decisions Panel Inventory salvage item in the same pass as v5.378 (daypart- ' +
  'erosion, item 5) -- now 5 of the 6 named items are done, only "This Week\'s Focus" remains.',
  'computeRevenueOpportunity\'s block 3 (asymmetric daypart-decline detection, "the signature of ' +
  'a nearby competitor taking market share in a specific window") extracted verbatim to ' +
  'computeDaypartErosion(loc, ds, settings) in the same new engine/revenue-opportunity.js. ' +
  'store-analytics.js imports it back; zero behavior change to RevenueIntelligence -- including ' +
  'one exact-behavior wrinkle preserved on purpose: the original explanation string called ' +
  'fPct(Math.abs(trend), 2), which always prepends "+" even on an already-abs\'d decline figure. ' +
  'Kept byte-identical rather than silently "fixed" as an unrelated cosmetic change nobody asked ' +
  'for.',
  'New daypartErosionAlerts detector in attention-feed.js fires only on the subset with a real ' +
  'competitiveSignal -- most stores resolve to "stable" or "declining together" per that ' +
  'function\'s own explanation text, neither of which is a signal worth a feed row. Wired into ' +
  'buildAttentionFeed (new erosionRows param) and live in attention-now.js (that hook receives ' +
  'no settings prop, so weeksBack falls to computeDaypartErosion\'s own default of 6, matching ' +
  'what a store sees in RevenueIntelligence under default settings too).',
  '7 new tests across revenue-opportunity.test.js and attention-feed.test.js.',
  'Only 1 of the 6 original salvage items remains unbuilt: "This Week\'s Focus" problem-type ' +
  'ranking. It may genuinely be in a retired priority-brief panel -- unconfirmed, not re-checked ' +
  'this pass. Given how wrong the "orphan" framing turned out for the other 5 (all were live, ' +
  'shipped features the whole time), the next session should MEASURE whether priority-brief is ' +
  'actually retired before assuming so.',
  'Bundle: no entry-chunk change.',
]};
