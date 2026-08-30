// @ts-nocheck
export default {version:'5.261', date:'2026-08-30', changes:[
  'Dispatch #220 -- Pricing Engine enrichment: waste/comp/promo breakdown per item. ' +
  'Dispatch #212 (first slice) deferred qsr_menu_item_activity enrichment because that stream ' +
  'was still early; re-measured live today and it is genuinely caught up (27/27 stores, though ' +
  'still only 2 calendar days deep and growing one day at a time) -- this lands the deferred work.' +
  '\n\n' +
  'Task 1 -- new enrichItemMargins(marginRows, activityRows, {dateRange}) in ' +
  'src/engine/pricing-engine.js, extending the file computeItemMargins() already lives in (not a ' +
  'parallel engine). Sums waste/emp_meal+mgr_meal(comp)/promo/activity per (loc, item_number) ' +
  'across every matching qsr_menu_item_activity row in the window, then multiplies by that ' +
  'item\'s OWN foodCost+paperCost from the already-joined margin row -- never ' +
  'qsr_menu_item_activity\'s own food_cost/paper_cost columns, which dispatch #212 already ' +
  'established are the same QSRSoft number duplicated, not a second source. Percentages use ' +
  '`activity` as the denominator, not `sold` (sold already excludes waste/comp/promo by ' +
  'construction). An item with no matching activity rows gets null fields, not zero -- kept ' +
  'distinguishable from a real zero-waste item. Deliberately SUMS across the whole window ' +
  '(not last-day-only like #212\'s own price/cost rule) -- a genuinely different aggregation rule ' +
  'for a genuinely different kind of data, tested explicitly against that difference. 23 unit ' +
  'tests in src/__tests__/pricing-engine.test.js cover every case named in the dispatch plus a ' +
  'multi-store roll-up helper (activityUnits, the raw summed denominator -- not in the dispatch\'s ' +
  'field list verbatim, added so a multi-store blend can do the same Σ/Σ dollar/unit-weighting ' +
  'marginPct already gets, never an average of per-store percentages).' +
  '\n\n' +
  'Task 2 -- new loadQsrMenuItemActivity({loc, dateRange}) in src/lib/supabase.js, paginated via ' +
  'the shared fetchAll() helper (dispatch #218\'s retry-on-transient-page-failure logic included ' +
  'for free), not a hand-rolled loop. Live-verified this actually pages past the 1000-row cap: ' +
  'a plain ordered-by-loc select of the first 1000 rows only spans 6 distinct stores (the exact ' +
  'trap the dispatch\'s own scoping pass caught -- an unpaginated read looking like "only a few ' +
  'stores have data" when the real count is 27/27), while the fetchAll-paginated read pulls all ' +
  '4217/4217 rows across all 27 stores, matching the table\'s live content-range exactly.' +
  '\n\n' +
  'Task 3 -- PricingEnginePanel (src/views/pricing-engine.js) gets a third ranked table, ' +
  '"Waste / Comp / Promo Dollar Drains," ranked by wasteDollars + compDollars (promo shown as ' +
  'its own column, deliberately left out of that sort -- its $ figure is the food-cost basis of ' +
  'promo\'d units, a materially different kind of dollar than a true loss, and the panel copy ' +
  'says so plainly rather than reading as "promo\'s cost to the P&L"). A hero line states the ' +
  'number and the decision per this repo\'s UI-voice rule (e.g. "$X in waste + comp this window, ' +
  'Y% of its own activity is waste -- check holding times / comp discipline"), with the exact ' +
  'figures still reachable in the table below. Reuses the existing LocationSelector and range ' +
  'tiers verbatim -- no second scope picker. Activity data loads keyed to the date-range tier ' +
  'only (not location scope), since the join is purely on (loc, item_number) already present in ' +
  'the margin rows -- switching stores re-filters instantly client-side instead of re-hitting ' +
  'Supabase. Degrades naturally on the real ~2-day-deep window (no special-casing "not enough ' +
  'data yet") -- an item with zero matching activity rows just doesn\'t appear in this table\'s ' +
  'candidates, same null-vs-zero distinction the engine makes.' +
  '\n\n' +
  'Live measurement (service-role key, store 0003708, 2026-08-27..28): hand-computed waste/comp/' +
  'promo dollars for 6 real items (Folded Egg, Sausage, Biscuit, 6 McNuggets, Sausage Burrito, ' +
  'plus item #4 for its comp path) straight from the raw qsr_menu_item_activity rows and the ' +
  'matching margin row\'s own cost basis -- all matched the engine\'s output exactly, comp path ' +
  'included (item #4: 7 summed emp_meal+mgr_meal units across 2 rows/2 days, $8.43 at that ' +
  'item\'s $1.205 unit cost).' +
  '\n\n' +
  'Checked live for the wrap-combo halving question the dispatch left open: found real ' +
  'wrap-bundle items (25269/25270/25271/25272) in qsr_menu_item_activity, but none carried ' +
  'nonzero waste/comp/promo in the sample pulled, so there is no live evidence either way on ' +
  'whether the correction is needed for activity sums -- left unapplied per the dispatch\'s own ' +
  'instruction, stated explicitly rather than silently assumed.' +
  '\n\n' +
  'pricing-engine.js lazy chunk: 12.08 KB / gzip 4.23 KB before -> 19.04 KB / gzip 5.52 KB after ' +
  '(lazy-loaded via lazyPanel(), not in the entry chunk -- eager-payload budget unchanged at ' +
  '526.82 KB gzip, same as before this dispatch). Full suite: 325 files / 3383 tests passing. ' +
  'Build clean.'
]};
