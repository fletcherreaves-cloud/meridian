// @ts-nocheck
export default {version:'5.611', date:'2026-11-03', changes:[
  '**Fixed: "🎯 Actuals vs Target" pace table\'s MTD Actual was reading Net Sales, not Product ' +
  'Sales (owner-reported).** The emailed sales_ledger leg (all_net_sales) had been given the ' +
  'HIGHEST priority in the MTD-actual sourcing — ahead of DAR/qsrActSummary\'s real ' +
  'product_sales-derived leg — on a 2026-10-06 "close enough" call (~1% off). That basis ' +
  'mismatch against a Product-Sales target (tProdSales) is now fixed: the real product-sales ' +
  'leg wins whenever both are available; sales_ledger (net sales) drops back to a same-day ' +
  'freshness fallback only. `CurrentMonthPaceSection` in `src/views/analytics.js`.',
  '**Fixed: a new/not-yet-open store could show a real sales target on a past month\'s pace ' +
  'view (owner-reported — Lindsay-standalone 44689 showing up for October weeks before its ' +
  'planned November open).** Added the opening-side counterpart to the existing ' +
  '`storeLifecycle` (close-date) mechanism: `settings.storeOpenDates` ({loc: \'YYYY-MM-DD\'}, ' +
  'empty by default, settable from Settings → Store Status same as a close date) + ' +
  '`isStoreNotYetOpenOn()` in `src/constants.js`. `CurrentMonthPaceSection` now drops a store ' +
  'from the viewed period\'s roster when it hadn\'t opened yet as of that period\'s end — ' +
  'checked against the month being VIEWED, not "today", so stepping ‹ › past the open date ' +
  'brings it back automatically. No open date set for a store = unchanged prior behavior ' +
  '(always eligible). Fixes both Pace to Target and the Monthly Projections panel (both reuse ' +
  'this shared section). Set Lindsay 44689\'s real open date in Settings → Store Status once ' +
  'confirmed — this ships with no date hardcoded, same deliberate-empty-default precedent ' +
  'storeLifecycle already set for this exact relocation.',
]};
