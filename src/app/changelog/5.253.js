// @ts-nocheck
export default {version:'5.253', date:'2026-08-29', changes:[
  'Dispatch #212 -- Pricing Engine, first slice: a real per-item margin view (menu price vs. ' +
  'unit_food_cost + unit_paper_cost) off qsr_product_mix, which has carried both since ' +
  '2026-01-01 for the full catalog, all 27 stores, with zero new pulls. New src/engine/' +
  'pricing-engine.js (computeItemMargins) reuses price-events.js\'s proven, load-bearing rule ' +
  'verbatim -- real menu price per (loc,item,date) = MAX(price) that day, never AVG, since ' +
  'qsr_product_mix carries a lower promo-tier price row alongside the real menu price on a ' +
  'promo day. Aggregates to one row per (loc,item_number) across the selected window, using ' +
  'the most recent day\'s price/cost as "current" (not an average across days, which would ' +
  'blend pre-/post-reprice prices) and summing sold_qty across every price tier for volume.' +
  '\n\n' +
  'Three data-quality traps built in, all live-confirmed against the real 2.5M-row table before ' +
  'writing the logic (service-role read, VITE_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY): (1) promo ' +
  'contamination -- the MAX(price) rule above. (2) Wrap-combo unit halving -- the vendor banner\'s ' +
  '"2 wrap menu items need multiplying by 2" turned out to apply ONLY to 4 real items (25269/70 ' +
  '"2 Ranch Snk Wrap Ml/Lrg", 25271/72 "2 Spicy Snack Wrap M/L"), detected by a description regex ' +
  'scoped to wrap items specifically -- a naive "starts with a digit" rule was live-confirmed to ' +
  'be a false-positive trap of its own (30+ unrelated piece-count items: "6 McNuggets", "2 ' +
  'Biscuits & Gravy", "4 McCrispy Strips" etc., a completely different naming convention that ' +
  'must NOT be doubled). (3) Combo vs. component double-counting -- grouped strictly by ' +
  'item_number, never description; Big Mac (item 5) and Big Mac Meal (item 8936) stay two ' +
  'separate rows.' +
  '\n\n' +
  'New src/views/pricing-engine.js (PricingEnginePanel), registered in panel-registry.js as ' +
  'kind:\'test-kitchen\', section:\'inventory-food-cost\' (its real eventual home, matching ' +
  'ProductMixPanel\'s own section) per the standing promotion rule. Reuses ProductMixPanel\'s ' +
  'existing qsr_product_mix lazy-fill/wide-range plumbing (ensureLazyFill/ensureLazyFillWide) ' +
  'rather than a second fetch path. LocationSelector + 7D/30D/90D/180D/All range tiers; a hero ' +
  'line stating the scope\'s dollar-weighted blended margin % AND the decision ("N items below ' +
  '40%, chase those first"), per the "say the number and the decision" UI voice rule; TWO ' +
  'separate ranked tables (lowest margin % vs. biggest $ contribution, deliberately not merged -- ' +
  'a thin-%-high-volume item and a high-%-low-volume item tell different stories); a multi-store ' +
  'scope dollar-weights the aggregate (ΣtotalContrib / Σrevenue), never an average of averages, ' +
  'with a click-to-expand per-store breakdown. ModalShell chrome (no route:true yet), mobile-' +
  'scroll (overflowX:auto) on both tables.' +
  '\n\n' +
  'Real live measurement (service-role credential, direct REST pull, not reasoned about): pulled ' +
  'the real 7-day qsr_product_mix window (2026-08-09..08-15, store 0013113, 2,819 real rows, ' +
  'paginated past the 1000-row REST cap) and hand-computed 6 real items in Python -- Big Mac (5), ' +
  'Big Mac Meal (8936), Hamburger (1), 6 McNuggets (60, a non-wrap leading-digit control), and ' +
  'both real wrap-combo items in that store\'s catalog (25269, 25270). The JS engine\'s output ' +
  'matched the hand computation exactly (to the cent) on every field for all 6 items, including ' +
  'the wrap items\' doubled volume/totalContrib, the McNuggets control staying UNdoubled, and the ' +
  'Big Mac / Big Mac Meal pair staying as two independent, non-double-counted rows.' +
  '\n\n' +
  '18 new unit tests (src/__tests__/pricing-engine.test.js) with synthetic qsr_product_mix-shaped ' +
  'fixtures covering all four traps (promo MAX-vs-AVG including a heavy-promo-volume adversarial ' +
  'case, wrap-halving plus the McNuggets/Biscuits/Cheeseburger-Meal false-positive control, combo/ ' +
  'component non-double-counting, marginPct correctness at volume:1), the latest-day-not-averaged ' +
  'window aggregation, and locFilter/dateRange/dual-row-shape handling (raw DB columns AND ' +
  'loadPmixRows\'s camelCase mapped shape, the real call-site shape). Full suite 3241/3241 ' +
  '(2 shell-nav-snapshot.js ratchets + 1 panel-registry.js Escape-hatch check updated for the new ' +
  'panel, all deliberate census bumps, not drift).' +
  '\n\n' +
  'Speed check: pricing-engine.js is lazy-loaded (its own ~12 KB/4.2 KB gzip chunk, separate from ' +
  'the entry). Eager-payload 523.90 KB gzip vs. the 523.78 KB pre-dispatch baseline (+0.12 KB, ' +
  'test-fixture-scale noise) -- well under the 850 KB budget.',
]};
