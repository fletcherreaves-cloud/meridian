// @ts-nocheck
export default {version:'5.288', date:'2026-08-31', changes:[
  'EOM Inventory Control -- new "Count Swings" report tab (owner request, verbatim: "take all the ' +
  'items that where lost during the month, which little hope of recovering by a recount at eom... ' +
  'I want to see the accumulative total of those and what they were and when it happened along with ' +
  'if a recount took place at the time or not and who the counting manager was"). Flattens ' +
  'buildStoreJourneys()\'s existing per-item count history (no new pull, no new grading) into one row ' +
  'per material count-swing across the WHOLE period -- not just the EOM close window -- classified ' +
  'locked (the item\'s final count, before the close window, nothing left to recover this period) vs ' +
  'recovered (a later count this period washed it out, per QSRSoft\'s own period-to-period anchoring), ' +
  'with manager attribution, case-formatted quantities, and a net +/- total for the scope. Also ' +
  'includes a "Top items to recount at count time" coaching list -- the biggest swingers this period, ' +
  'independent of locked/recovered, since the point is catching it AT the count.',
  'EOM Change Monitor -- Progression view\'s per-item event table now shows a "Variance qty" column ' +
  '(unit variance, case-formatted to 2 decimals when a case size is on file) alongside the existing ' +
  '$ column, so a manager knows what to go recount, not just the dollar impact.',
  'Case-formatted quantities across the EOM Diagnose flow (Action-Items provenance history table, ' +
  'Item Journey report-tie-out chip) now round to 2 decimals instead of 1, matching the convention ' +
  'already used elsewhere (Chronic Offenders) -- owner\'s own example: 576 units at a 384-unit case ' +
  'size reads as "1.50 cases", not "1.5".',
  'Found while building the above: qsr_raw_item_detail (rawByLoc\'s own source table) has NO ' +
  'case-size column at all -- every `.caseSz` reference against a rawByLoc item, old and new, was ' +
  'silently reading undefined. The real value (case_qty) lives in the separate qsr_raw_item_info ' +
  'table (dispatch #184\'s recipe/BOM pull) and was never merged in. Added a client loader ' +
  '(loadQsrRawItemInfo) and a rawInfoByLoc merge so every case-formatted display in this file -- ' +
  'existing and new -- actually shows real cases now, not just a raw unit count.',
  'EOM Count Swings -- new "Possible product reconstruction" section (owner request, verbatim: ' +
  '"if i was missing 100 pieces of fresh beef and 110 regular buns and 98 slices of cheese, i would ' +
  'envision that as either 100 cheeseburgers or 50 McDoubles possibly unaccounted for... a basic ' +
  'lookup conversion of how the missing items could have disappeared if they were fully assembled ' +
  'products"). Cross-references this period\'s shortages against each ingredient\'s recipe ' +
  '(qsr_raw_item_info\'s menu_items[]/recipe_serving_factor, dispatch #184 -- pulled since 2026-08-28 ' +
  'but never consumed by any UI until now) to surface candidate finished products, flagging a ' +
  '"tight fit" (every contributing ingredient\'s implied count agrees, e.g. beef+bun+cheese all ' +
  'point to ~100) vs a "loose fit" (the ratios don\'t actually match the recipe) rather than hiding ' +
  'the weaker guesses. Requires 2+ ingredients to corroborate the same menu item -- one ingredient ' +
  'alone is a coincidence, not a signal.'
]};
