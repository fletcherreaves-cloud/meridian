// @ts-nocheck
export default {version:'5.354', date:'2026-09-05', changes:[
  'Fixed a fatal error in scripts/import-graded-visits-bulk.mjs (v5.352): "ON CONFLICT DO UPDATE ' +
  'command cannot affect row a second time" -- Postgres rejects an upsert batch that names the ' +
  'same (loc, visit_date, report_type) conflict key twice, and the real 2026-09-05 capture (225 ' +
  'CFV / 116 RGR / 244 EcoSure) had exactly one such collision: store 33222 had two RGR visits ' +
  'both dated 2025-05-21. Inspected against the store\'s full RGR history: visitId 7933673 scored ' +
  'a flat 100.0 on every single category (Quality/Service/Cleanliness/Shift Leadership/Health&' +
  'Safety) -- the only such row across the store\'s 4 other visits, all of which have realistic, ' +
  'varied per-category scores -- confirming it as an incomplete/placeholder record in Propel, ' +
  'not a second real visit. Excluded from this import; the real visit (visitId 7770310, 94.0 ' +
  'overall) was kept.',
  'The same latent bug exists in the older import-ecosure-history.mjs (identical unguarded ' +
  'rows.map()+upsert(chunk) shape) -- it just never happened to capture a same-day double visit ' +
  'before. Fixed once in the shared scripts/lib/graded-visits-upsert.mjs helper: ' +
  'chunkedUpsertGradedVisits() now dedupes rows by their conflict key BEFORE chunking (a Postgres ' +
  '"same key twice" rejection is a per-statement rule, not a per-chunk-boundary one), keeping the ' +
  'last row per key and warning when a collision occurs so a real future case is visible instead ' +
  'of silently dropped or crashing the whole import.',
  '5 new tests against a mock Supabase client covering the crash reproduction, last-wins ' +
  'semantics, the visible warning, the no-collision no-op path, and that dedupe runs globally ' +
  'rather than per-chunk.',
  'Live import re-run against the corrected capture succeeded: 584 rows upserted (225 CFV / 90 ' +
  'RGR / 25 RGR-HealthSafety / 244 EcoSure), independently verified via a live Supabase read.',
]};
