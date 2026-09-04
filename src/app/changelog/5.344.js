// @ts-nocheck
export default {version:'5.344', date:'2026-09-04', changes:[
  'Inventory Intelligence now has a real automated data source. qsr_inventory_summary has ' +
  'existed since dispatch #214 -- correctly wired into the panel, with manual upload as gap-' +
  'fill -- but nothing ever wrote to it (memory/finding-inventory-summary-automation-2026-08-27.md, ' +
  'dispatch #178), so every store showed "No auto data yet" until a manual "Inventory Summary ' +
  'and Usage.xlsx" upload. The owner captured the real endpoint live: GET /api/inv/{nsn}/' +
  'inv_summary/rawitems?start_date=...&end_date=... on prod.ebos.qsrsoft.com -- the same host ' +
  'and auth ladder already used by the automated FOB and On-Hand pulls, so no new auth ' +
  'mechanism was needed.',
  'New scripts/qsrsoft-inventory-summary-pull.mjs (daily, 12:30 UTC) + mapInventorySummaryResponse ' +
  '(src/engine/eom-parsers.js) -- field-for-field the same shape the manual XLSX upload already ' +
  'produces (start/purchases/end/actual usage per WRIN), so the auto stream and the manual ' +
  'fallback describe the identical metric. usage_per_day and days_supply (not in the raw API ' +
  'response) are derived once, from actual_usage over the pulled window length.',
  'Window defaults to month-to-date through yesterday (capped at the QSRSoft KB\'s own stated ' +
  '60-day report limit), refreshing the current period\'s row per (store, item) on every run -- ' +
  'same current-state-snapshot shape as qsr_onhand/qsr_fob.',
  'Watched in sync-failure-watch.yml. NOT wired into src/engine/stream-freshness.js\'s STREAMS ' +
  'array this pass -- that mechanism reads from the global `ds` object, and this stream is ' +
  'fetched panel-locally (loadQsrInventorySummary(), called directly by InventoryIntelligence), ' +
  'not loaded into `ds` at startup like every existing STREAMS entry. Wiring it in would mean ' +
  'touching App.js\'s data-hydration pipeline -- bigger and riskier than this pass should take ' +
  'on; the panel\'s own local "☁ Auto-sync failed" / "No auto data yet" message already covers ' +
  'the interim.',
  '9 new tests (dispatch-inventory-summary-pull.test.js) against a REAL captured API response ' +
  'fragment, not invented fixtures. Full suite (4338 tests) and build both clean, bundle size ' +
  'unaffected (server-side pull only).',
]};
