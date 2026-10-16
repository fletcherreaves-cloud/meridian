// @ts-nocheck
export default {version:'5.575', date:'2026-10-16', changes:[
  'Reports redesign Phase 5 (owner request, "let\'s do them all" on a shortlist of real data ' +
  'gaps surfaced the same session): six new base reports, each built on the same ReportShell ' +
  '(Phase 2) every report in this redesign already uses, cross-listed in the Reports Hub under ' +
  'their existing categories (no new category needed).',
  '**Controls ↔ Food Cost Linkage** — the owner\'s own unbuilt ask (2026-08-31, memory/' +
  'project-backlog.md): "we have to link cash controls to food cost and report that as well." ' +
  'Shows FOB\'s monthly food-cost ratios alongside Controls\' daily employee/manager-meal and ' +
  'deposit $/count facts for the SAME real calendar months (resolved to whole months covering ' +
  'the picked range, same "resolve to the natural calendar bucket" convention Weekly Count ' +
  'Status already established) — never shown together before.',
  '**Weather Impact** — ds.weatherRows has been auto-pulled since v4.533 but only ever readable ' +
  'through Signal Lab\'s correlation Scanner. This splits each store\'s loaded days into rainy vs. ' +
  'dry and the hotter half vs. the cooler half (by that store\'s own median high temp) and shows ' +
  'the real sales/guest-count delta — a simple historical split, not a matched-day design, same ' +
  'honesty standard Promo/Discount ROI holds itself to.',
  '**Price Change Impact** — reuses price-events.js\'s existing confirmed-step detector (the ' +
  'same 14-observed-day-flat-before/after algorithm the Pricing Engine\'s live simulator and ' +
  'Signal Lab already trust) for the retrospective view it never had: what happened to sales and ' +
  'guest counts in the 14 days after each confirmed repricing event.',
  '**Item Velocity** — one pass over ds.pmixRows (699+ distinct items, never a report before — ' +
  'only reachable one item at a time via Signal Lab\'s dynamic resolver) aggregated into one ' +
  'district-or-single-store list, sorted by units sold, with a first-half-vs-second-half trend ' +
  'so a fast riser or faller stands out.',
  '**Channel Mix** — Sales Ledger\'s DT/Delivery(3PO)/Mobile-Order-Pickup/Kiosk/Front-Counter % ' +
  'fields, period average plus a first-half-vs-second-half trend in percentage POINTS (not a ' +
  'relative change, which would read confusingly for a %-of-sales metric).',
  '**Labor Opportunity Cost** — the 15 labor fields Phase 1\'s catalog audit labeled (otDollar, ' +
  'oppCostDollar, actVsSchedOpp, and more) finally get the narrative treatment: $ TOTALS for OT ' +
  'and the two opportunity-cost fields (summed across the period — "how much this cost us"), ' +
  'averages for the two hour-gap fields and Sales/Person-Hr (a daily rate, never a sum).',
  'Caught and documented, not fixed in the shared engine (pre-existing, correct behavior): ' +
  'oppCostDollar/avgRate/actVsSchedOpp/spph/fobPct are all metric-source.js DERIVE-ONLY chains ' +
  'with no `srcs` of their own, and metricRowsForRange always resolves them UNSCOPED before ' +
  'filtering by store — so the unscoped resolution can only discover which stores exist via ' +
  'ds.storeIds. The real app always populates this; a test fixture that forgets it silently ' +
  'resolves these five metrics to nothing. Documented in both affected engine files\' headers so ' +
  'the next report built on this pattern doesn\'t lose the same hour re-discovering it.',
  '38 new tests (engine math for all six reports — the before/after and first-half/second-half ' +
  'trend splits most of them compute, against the real underlying metric chains, not a mocked ' +
  'resolver — plus real panel renders proving the wiring end-to-end) plus shell-nav-snapshot/' +
  'panel-registry updated for the six new nav entries (route count forty-three -> forty-nine; ' +
  'all six icons confirmed unused anywhere else in panel-registry.js before being picked, so ' +
  'none needed an "icon has another owner" footnote). Full suite green (636/636 files, ' +
  '5917/5917 tests), build clean, within budget (564.62 KB eager / 850 KB — all six land in ' +
  'their own real lazy chunks, ~4.3-5.2 KB each, confirmed not in the eager preload list). Full ' +
  'writeup: memory/project-reports-redesign.md.',
]};
