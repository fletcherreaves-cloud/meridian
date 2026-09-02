// @ts-nocheck
export default {version:'5.320', date:'2026-09-02', changes:[
  'Pricing Engine: new "💥 Price Impact" tab -- the actual deliverable the owner\'s 2008-2017 ' +
  'legacy "Menu Management" workbook modeled (its BRK/REG PRICING IMPACT sheets), rebuilt on ' +
  'live data. Pick an item, enter a hypothetical price change, and see the modeled profit ' +
  'impact at this scope/range\'s trailing volume: modeled profit $ delta, blended margin % ' +
  'before → after (dollar-weighted, never an average of store percents), and a per-store ' +
  'breakdown (price → new price, margin % → new margin %, trailing units, profit impact).',
  'When memory/finding-legacy-pricing-workbook-structure-2026-08-27.md scoped this workbook, a ' +
  'real per-item food-cost feed looked like the blocker (no distributor/Martin-Brower cost pull ' +
  'existed yet). That was never actually true for this calculation: qsr_product_mix has carried ' +
  'real per-item unit_food_cost/unit_paper_cost since dispatch #212, and computeItemMargins() ' +
  'already trusts it for the Rankings tab. simulatePriceImpact() (src/engine/pricing-engine.js) ' +
  'reuses that exact same margin math, run twice -- once at the current price, once at the ' +
  'hypothetical one -- no new data source needed.',
  'Explicitly a STATIC-elasticity model, same assumption the legacy tool made: trailing volume ' +
  'held constant regardless of the price change. Deliberately does NOT fit a demand curve and ' +
  'does NOT model a customer diverting to a substitute item -- this codebase has no calibrated ' +
  'basis for either yet, and inventing one would repeat the exact "flag any deviation" mistake ' +
  'crossStoreCompare()\'s own design (v5.319) measured its way out of. Labeled on the tab itself ' +
  'so it is never mistaken for a demand/diversion forecast.',
  '8 new unit tests for simulatePriceImpact() (src/__tests__/pricing-engine.test.js): the core ' +
  'profitImpact = priceDelta × volume identity, negative/zero deltas, dollar-weighted blending ' +
  'across stores, cross-item filtering, null-item and empty-input handling, and a zero-volume ' +
  'store (no division by zero, no fabricated 0% blend). Full suite (3704 tests) and build both ' +
  'clean; entry-chunk budget unaffected.',
]};
