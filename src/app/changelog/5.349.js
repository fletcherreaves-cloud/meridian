// @ts-nocheck
export default {version:'5.349', date:'2026-09-04', changes:[
  'Added manual EcoSure (3rd-party food-safety) visit ingestion. Graded Visits now accepts .json ' +
  'files (the raw response from propel.mcd.com\'s getThirdPartyFoodSafetyVisitReport, saved from ' +
  'DevTools) alongside the existing CFV/RGR .html exports.',
  'Real automation was investigated and ruled out for this pass: Propel/PEAK use corporate SSO ' +
  'with MFA enforced, so no unattended credential-based pull can ever authenticate -- the only ' +
  'viable design is an on-demand button against a persistent, human-logged-in browser profile on ' +
  'a specific self-hosted runner, which this environment has no access to build or test. The ' +
  'owner\'s own prior research (memory/finding-ecosure-propel-api-2026-08-22.md) already ' +
  'recommended manual capture first given the low volume (~1.5 visits/week estate-wide) -- this ' +
  'ships that.',
  'parseEcoSureVisit() (src/parsers/graded-visits.js) maps the documented JSON schema into the ' +
  'same graded_visits shape CFV/RGR already use, so EcoSure visits flow straight into ' +
  'ds.gradedVisits with reportType:\'EcoSure\' -- the exact shape Visit Readiness\'s ' +
  'calibrateReadiness()/hasEcoSure gate already expected and was waiting on (always false until ' +
  'now, since nothing had ever populated it). No engine changes needed.',
  'Trusts the report\'s own visitMeetsTargetFlag for pass/fail rather than re-deriving a threshold ' +
  'rule from score -- the exact target formula was never captured, and guessing one would be an ' +
  'unverified inference the memory finding repeatedly warns against. criticalFailCount is computed ' +
  'and surfaced separately from score, per the finding\'s own note that a critical fail must not ' +
  'be hidden by an otherwise-good average.',
  'PII handled as the finding specifies: the visit reviewer\'s name is tokenized via the same ' +
  'get_or_create_employee_token() RPC saveAuditRows() already uses (never persisted as plaintext) ' +
  '-- verified by a test that inspects the exact saved payload, not just that the shared tokenizer ' +
  'works in isolation.',
  '15 new tests against a fixture built from the finding\'s own documented schema, anchored to its ' +
  'verified Ardmore-Broadway arithmetic (86/100, four cited items, 3+5+3+3=14 lost).',
  '4364 tests pass (453 files, +2 new), build clean, eager-payload budget unaffected.',
]};
