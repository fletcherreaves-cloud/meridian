// @ts-nocheck
export default {version:'5.323', date:'2026-09-02', changes:[
  'Pricing Engine: Rankings tab now shows "📉 Estimated Lost Sales — Product Outages" -- the ' +
  '"build on top of K" half of the Product Outage pull (v5.322). Joins qsr_product_outage ' +
  'events to the panel\'s own item margin/volume rows on (loc, item), the exact join the ' +
  'outage schema\'s own header names as the reason that pull exists: "Fried Apple Pie was ' +
  'flagged unavailable at five stores" now shows an estimated lost-sales $ figure, ranked, ' +
  'with a per-store breakdown, an "open now" flag for outages not yet restored, and a top-line ' +
  '"check the machine/POS status" hero line (say the number AND the decision).',
  'estimateOutageLostSales() (src/engine/pricing-engine.js): a deliberately named STATIC-demand ' +
  'estimate -- an item\'s trailing daily volume (already computed by the panel\'s own ' +
  'computeItemMargins) spread evenly across 24h, times hours the item was flagged ' +
  'unavailable. Not a fitted demand curve, not daypart-aware (same transparency discipline ' +
  'simulatePriceImpact v5.320 and crossStoreCompare v5.319 already established this session). ' +
  'Never labels or infers CAUSE -- an outage row is a manager\'s POS action, not a confirmed ' +
  'out-of-stock, per the schema\'s own caution; this only ever estimates foregone sales ' +
  'dollars, shown explicitly as an estimate, never dressed up as a measurement.',
  'Requires a bounded range (7D/30D/90D/180D) to have a daily-rate denominator -- "All Time" ' +
  'shows an explicit empty state rather than fabricating a rate. 9 new unit tests: the core ' +
  '24h-outage-equals-one-days-volume identity, an open (unrestored) outage measured against ' +
  'the panel\'s own "as of" date rather than raw browser time, summing multiple events for the ' +
  'same item, cross-store roll-up sorted by each store\'s own contribution, and the null-safety ' +
  'cases (no matching item row, zero volume, zero duration, no window denominator, empty ' +
  'input). Full suite (3718 tests) and build both clean; entry-chunk budget unaffected.',
]};
