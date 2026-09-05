// @ts-nocheck
export default {version:'5.355', date:'2026-09-05', changes:[
  'Added the PEAK per-visit detail parser and an enrichment-only import path -- ' +
  'parsePeakRoipVisit() (src/parsers/graded-visits.js) parses peak.mcd.com\'s RoipSurvey ' +
  'response, which returns EVERY question on a CFV/RGR visit (not just cited/failed ones), each ' +
  'with full question text, score, possible score, critical flag, and a per-question comment ' +
  'field -- confirmed live against a real captured visit ' +
  '(memory/finding-peak-visit-detail-api-2026-09-05.md).',
  'This is deliberately an ENRICHMENT, not a new writer: PEAK\'s own VisitId is a different id ' +
  'space than Propel\'s and was never confirmed to coincide for the same real-world visit, so ' +
  'scripts/import-peak-visit-detail.mjs never inserts a graded_visits row -- it only updates an ' +
  'existing row\'s new peak_detail JSONB column, matched by the same (loc, visit_date, ' +
  'report_type) key every other graded_visits writer already trusts, via a targeted UPDATE ' +
  '(never an upsert) that cannot touch the row\'s other columns. A PEAK visit with no matching ' +
  'existing row is reported, never guessed into a new row.',
  'supabase/graded_visits.sql: added peak_detail jsonb (both in the CREATE TABLE definition and ' +
  'as an ALTER TABLE ... ADD COLUMN IF NOT EXISTS patch line for already-deployed tables, ' +
  'matching this file\'s own completion_time precedent).',
  'The auditor name is tokenized through the same get_or_create_employee_token() path EcoSure\'s ' +
  'reviewerName already uses -- never persisted as plaintext.',
  '13 new tests: the parser against a real-shaped fixture (fabricated names/comments in place of ' +
  'the real capture), the flattened category-path + full-question-set behavior (the whole point ' +
  'of this source vs. EcoSure\'s cited-only shape), VisitTypeId->reportType mapping, and the ' +
  'enrichment loop against a mock Supabase client (matching row -> UPDATE; no matching row -> ' +
  'reported, never inserted; token resolution).',
  'Not yet run against a real capture -- no live PEAK seed exists (peak.mcd.com is SSO/MFA-gated ' +
  'the same as Propel, on-demand capture only). memory/data/peak-visit-detail-seed.json is the ' +
  'committed empty shell, same never-commit-real-data convention as the CFV/EcoSure seeds.',
]};
