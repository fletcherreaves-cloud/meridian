// @ts-nocheck
export default {version:'5.475', date:'2026-09-21', changes:[
  'EOM Item Journey: added a per-item "🧠 Ask SAGE" curated prompt -- backlog §6\'s "CoachQ ' +
  'curated prompts" ask, at the natural drill-down level the ask was really about. The real ' +
  'CoachQ-API integration is a separate, much bigger, Cognito-auth-blocked item and was NOT ' +
  'touched here -- this reuses the existing, proven window.__MF_SAGE_SEED__ + \'mf:open-sage\' ' +
  'pattern (askSageWaste\'s whole-store waste picture, the FOB-report modal) one level deeper: a ' +
  'single flagged item\'s own verdict, variance reconciliation, and already-computed facts/' +
  'inferences, which ItemJourneyView had no SAGE entry point for at all.',
  'ItemJourneyView (exported, src/views/eom-dashboard.js) gained an optional onAskSage prop, ' +
  'rendered as a button in the verdict banner only when supplied -- existing callers (the case-' +
  'pack-suffix tests) are unaffected. EOMDashboardPanel wires a new askSageItemJourney callback ' +
  '(same file) into it, seeded from the real journey data already on screen -- no new fetch.',
  '4 new tests: 2 mount the real exported ItemJourneyView and drive the actual button click (no ' +
  'button renders without the prop; clicking it calls back with the real journey object) -- 3 of ' +
  '4 assertions confirmed to fail against the pre-fix code (temporarily reverted and re-ran). The ' +
  'other 2 read eom-dashboard.js\'s real source to confirm EOMDashboardPanel wires a REAL closure ' +
  '(not a no-op) into the prop -- the full click-through fixture (Diagnose -> Item Journeys -> ' +
  'pick an item) needs a much deeper raw-item-detail mock than this feature\'s own risk warrants, ' +
  'same tradeoff sage-paginate.test.js already makes for an index.ts call site it can\'t click-' +
  'test either. Full suite 538/538 files, 5075/5075 tests. Build clean, eager payload 551.62 KB ' +
  'gzip (budget 850 KB).',
]};
