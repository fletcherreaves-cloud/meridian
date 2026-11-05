// @ts-nocheck
export default {version:'5.631', date:'2026-11-05', changes:[
  '**Knowledge Base (task #75): 3 more Panel Guide articles — Inventory Control (EOM ' +
  'Dashboard), Controls ↔ Food Cost Linkage, and Pricing Engine.** All three were real nav ' +
  'panels with zero KB coverage. `eom_dashboard_guide` covers the 3-day count-window domain, ' +
  'the Food+Condiment-only FOB scope, and the 5 folded-in report tabs (Supervisor Rollup, ' +
  'Count Cycle, Missing Items, Team Snapshot, Recount Impact). `controls_food_cost_link_guide` ' +
  'covers the calendar-month alignment between FOB\'s monthly ratios and Controls\' daily ' +
  'facts, and frames the disconnect between them as the point of the report, not either side ' +
  'alone. `pricing_engine_guide` covers all 5 tabs, the real MAX(price)-per-day rule (never an ' +
  'average — a promo tier always prices below menu, so max() recovers the real price), and ' +
  'flags Price Impact\'s simulator as holding volume constant (a profit-impact calculation, ' +
  'not a demand-elasticity forecast). Each article verified directly against its real ' +
  'engine/view code, not written from the panel name alone, per standing KB-accuracy rule. ' +
  'New tests: dispatch-kb-eom-dashboard/-controls-food-cost-link/-pricing-engine-2026-11-05. ' +
  'More panels remain uncovered — ongoing backlog, not closed by this pass. 731/731 test ' +
  'files, 6662/6662 tests; build clean.',
]};
