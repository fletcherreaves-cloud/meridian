// @ts-nocheck
export default {version:'5.352', date:'2026-09-04', changes:[
  'Extended the EcoSure bulk-enumeration chain (v5.350) to also cover CFV and RGR/RGR Health & ' +
  'Safety, after re-reading the same HAR sample showed their getBrandProtectionVisits/' +
  'getCfvHistory list rows already carry every field the HTML-based parsers extract -- no ' +
  'per-visit detail call needed for either, unlike EcoSure.',
  'Added parseRGRBulkVisit()/parseCfvBulkVisit() (src/parsers/graded-visits.js). RGR trusts ' +
  'visitMeetsTargetFlag for pass, same reasoning as the EcoSure parser; CFV has no such flag in ' +
  'this action, so pass derives from CFV_BULK_PASS_THRESHOLD=80, matching the value ' +
  'import-cfv-history.mjs already verified against Propel\'s own published card. RGR Health & ' +
  'Safety gets its own report_type (\'RGR-HealthSafety\') since it\'s a separate program with its ' +
  'own visit dates, never colliding with a same-day RGR row.',
  'Extracted scripts/lib/graded-visits-upsert.mjs after the fetch-existing/chunked-upsert pattern ' +
  'was independently written three times across the CFV, EcoSure, and now unified import scripts ' +
  '-- caught before a fourth copy, per the repo\'s own "check whether a helper exists" standing ' +
  'rule. The two older scripts are untouched.',
  'Added scripts/import-graded-visits-bulk.mjs (one seed, all three report types, same ' +
  '(loc,visit_date,report_type) conflict key every graded_visits writer already shares) and ' +
  'scripts/browser-graded-visits-bulk-capture.js (one console paste, one download covering CFV+' +
  'RGR+EcoSure, instead of three separate runs). browser-ecosure-bulk-capture.js is left in ' +
  'place unmodified as a still-working EcoSure-only tool.',
  'Real EcoSure data landed in production this pass too: 244 visits across all 27 stores ' +
  '(2022-2026) imported via the already-shipped EcoSure-only script, verified tokenized (zero ' +
  'plaintext reviewer names). Visit Readiness\'s hasEcoSure gate, permanently false since it ' +
  'shipped, now has real data behind it estate-wide. The new CFV/RGR path has not yet been run ' +
  'against real data.',
  '18 new tests against the real captured RGR/CFV row shapes (not invented fixtures). 457 files / ' +
  '4401 tests pass, build clean, eager-payload budget unaffected (server/script-only change).',
]};
