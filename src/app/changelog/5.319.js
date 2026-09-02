// @ts-nocheck
export default {version:'5.319', date:'2026-09-02', changes:[
  'Pricing Engine: new "🏬 Cross-Store" tab -- cross-reference the same item\'s price/cost/margin ' +
  'across a chosen set of stores (owner request from the prior session: "cross reference price ' +
  'points between selected groups of stores"). Pin any 2+ items to compare; each card shows the ' +
  'item\'s price range across stores and a per-store table (price, food+paper cost, margin %, and ' +
  'a Δ-vs-that-store\'s-own-median-margin column).',
  'Deliberately NOT a peer-price-deviation flag. A live measurement (real qsr_product_mix, store ' +
  '3708 vs. the district, 2026-08-25..08-31) disproved that design before it was built: Big Mac ' +
  'legitimately ranges $4.99-$6.99 (40%) and Double Quarter Cheese $6.19-$9.59 (55%) across the 27 ' +
  'real stores -- regional/local pricing is a deliberate franchise decision, so "flag a store priced ' +
  'far from its peers" would trip on nearly every item and be pure noise. Food/paper cost, by ' +
  'contrast, is essentially uniform store to store for the same item (same distributor, same ' +
  'recipe) -- so cross-store margin-% variance is almost entirely just price variance restated, not ' +
  'a second signal either. The calibrated signal engine.js\'s new crossStoreCompare() computes ' +
  'instead: an item\'s margin at a store vs. THAT SAME STORE\'S OWN median margin across its other ' +
  'items. Every store in the sample showed roughly the same ~10-15pt Big-Mac-to-DQC margin gap ' +
  'except one, whose gap was ~23pt -- double the norm -- because that one store\'s DQC was mispriced ' +
  'relative to how it prices everything else (its Big Mac was completely average). That is a real ' +
  '"did someone forget to reprice this" candidate a peer-comparison approach would have missed ' +
  'entirely. The Δ column is a plain sortable number, bolded only past 10pts -- never an auto-flag; ' +
  'per CLAUDE.md\'s "Voice by role," the engine shows the number, the operator makes the call.',
  'crossStoreCompare(itemRows) added to src/engine/pricing-engine.js, fed recipeEnrichedItemRows ' +
  '(the un-aggregated per-(loc,item) rows -- never aggregateAcrossStores()\'d displayRows, which ' +
  'collapses the very per-store rows this needs to compare). 9 new unit tests using fixtures ' +
  'modeled on the live measurement above (including the ~23pt-outlier store), covering the ' +
  'self-relative gap math, price-spread pass-through, null-marginPct and null-loc/itemNumber ' +
  'exclusion, and empty input.',
]};
