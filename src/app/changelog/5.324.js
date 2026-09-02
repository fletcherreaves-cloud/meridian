// @ts-nocheck
export default {version:'5.324', date:'2026-09-02', changes:[
  'New automated pull: Menu Price Comparison, "RFM Price Comparison" (backlog item L, ' +
  'memory/data-acquisition-shopping-list.md) -- the per-store LIST price book: in-store, eat-' +
  'in/take-out, and 3PO delivery list prices per (nsn, menuItemNumber). Dated (loc, dt, item) ' +
  'like qsr_product_mix, not current-state-only like the recipe pull -- startDate/endDate are ' +
  'native, so price history is backfillable, and a dated book is the only way to establish ' +
  'WHEN a price action took effect (the missing half of confirming the owner\'s own "we did ' +
  'not participate in the whole price change strategy" note per store per item, from the ' +
  'record rather than memory).',
  '⚠️ A LIST price book, NOT a sales feed -- no soldQty/dollarsSold/cost fields. Complementary ' +
  'to qsr_product_mix (the REALIZED price), not a replacement; together they measure discount ' +
  'depth (realized − list), which neither answers alone.',
  'price_eatin/price_takeout persisted even though identical to price on every row measured so ' +
  'far -- standing instruction (owner, 2026-08-15): the split is a real POS capability some ' +
  'states use to tax eat-in vs. take-out prepared food differently, and collapsing the schema ' +
  'now would silently break the first multi-tenant deployment into such a state, invisibly, ' +
  'since the columns would agree right up until they didn\'t. delivery_premium is NOT stored -- ' +
  'the API computes it inconsistently at price=0 (0 in one case, null in another); recomputed ' +
  'at read time from price/price_delivery instead of trusting a value that could drift from its ' +
  'own inputs.',
  'scripts/qsrsoft-menu-price-comparison-pull.mjs: same two-path auth ladder and per-day-loop ' +
  'structure as qsrsoft-pmix-pull.mjs. Comma-list nsn support was only independently measured ' +
  'at 3 stores for this endpoint (unlike the outage pull\'s confirmed 27) -- the script logs a ' +
  'warning, not a silent gap, if fewer than 27 distinct stores come back on a run. New table ' +
  'qsr_menu_price_comparison (schema SQL handed to the owner to run -- no DDL execution access ' +
  'from this session). Watched in sync-failure-watch.yml. loadQsrMenuPriceComparison() added ' +
  'for future consumption. Full suite (3718 tests) and build both clean.',
]};
