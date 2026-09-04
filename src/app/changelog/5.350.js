// @ts-nocheck
export default {version:'5.350', date:'2026-09-04', changes:[
  'Fixed a real bug in v5.349\'s EcoSure parser, found against a live captured API response: the ' +
  'actual getThirdPartyFoodSafetyVisitReport response wraps the report in a {results:{...}} ' +
  'envelope, not the flat object the shipped fixture (hand-built from documentation, never ' +
  'checked against a real response) assumed. parseEcoSureVisit() (src/parsers/graded-visits.js) ' +
  'now unwraps that envelope when present, falling back to the flat shape otherwise -- both the ' +
  'true wire format and every existing test fixture parse correctly.',
  'Found the bug, and the fix for it, from an owner-provided HAR capture of a live, authenticated ' +
  'Propel session -- reviewed for structure only (endpoint URLs, field names, response shapes); ' +
  'no cookie/token value or employee name from that capture was ever written to a committed file ' +
  'or surfaced in chat.',
  'The same capture answered this repo\'s own long-open question: EcoSure visitIds CAN be bulk-' +
  'enumerated. getBrandProtectionVisits&locationId=<store node> -- one of four actions previously ' +
  'recorded as "unexplored, deprioritized" -- returns a store\'s full graded-visit history ' +
  '(CFV/RGR/EcoSure mixed) with visitId+date per visit, filterable to visitTypeDescription: ' +
  '"visits.thirdPartyFoodSafety". Chained with the existing getDescendants store-list call, this ' +
  'reaches every EcoSure visitId across the whole estate.',
  'Added scripts/browser-ecosure-bulk-capture.js -- a DevTools-console snippet (not a Node script; ' +
  'propel.mcd.com is SSO+MFA, so no unattended pull is possible, unchanged) that a signed-in human ' +
  'pastes once to walk all 27 stores and download a ready-to-import seed file, replacing "read one ' +
  'visitId off the UI, capture one response, repeat" with a single paste.',
  'Verified end-to-end against real data, not just synthetic fixtures: imported the 2 real EcoSure ' +
  'visits present in the HAR (store 11657 2026-08-10 score 83, store 24471 2026-03-26 score 94) ' +
  'into Supabase graded_visits via scripts/import-ecosure-history.mjs, from an uncommitted local ' +
  'seed path -- confirmed visit_by holds a tokenized UUID, never the plaintext reviewer name.',
  'Tightened the never-commit-real-PII rule the seed format always implied but never stated: ' +
  'memory/data/ecosure-visits-seed.json and import-ecosure-history.mjs\'s header now say ' +
  'explicitly that a seed populated with real captures must stay local (ECOSURE_SEED_PATH), never ' +
  'the committed default path.',
  '3 new parser tests for the {results:{...}} wrapper (object + JSON-string forms) plus explicit ' +
  'flat back-compat coverage. 4375 tests pass (454 files, +3 new), build clean.',
]};
