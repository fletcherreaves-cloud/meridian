// @ts-nocheck
export default {version:'5.450', date:'2026-09-16', changes:[
  'VLH guide-based needed-hours calculation (Task #56). Blocked all week on the actual 2022 ' +
  'VLH Workbook PDFs -- store_vlh_config was already built as the foundation, but the real ' +
  'guest-count -> labor-hours breakpoints only exist in McDonald\'s own workbook, and the owner ' +
  'supplied both books (High Productivity + Standard, 49 pages each) mid-week.',
  'Parsed all 96 config pages (docs/2022_VLH_Workbook_*.pdf, now committed for provenance) into ' +
  'scripts/data/vlh-guide-2022-seed.json -- 4,592 rows, zero structural issues across every ' +
  'config (0-9999 coverage, sequential tiers, no gaps, all combos unique), spot-checked against ' +
  'the raw PDF text. Scoped to Drive Thru + In-Store ONLY -- the workbook has ~10 labor-position ' +
  'tables per page, but only these two have an unambiguous DAR guest-count mapping ' +
  '(dt_transactions/is_transactions match their own section labels 1:1); the other 8 positions\' ' +
  'guest-count driver isn\'t stated in the PDF text and DAR doesn\'t carry the per-item actuals ' +
  'to test a guess, so they were deliberately left unwired rather than risk shipping wrong labor ' +
  'guidance on a live business tool.',
  'New: supabase/schema-vlh-guide.sql (reference table, not tenant-scoped -- same "public read" ' +
  'shape as qsrsoft_kb) + scripts/seed-vlh-guide.mjs, and src/engine/vlh-guide.js ' +
  '(guideNeededHoursForRow, guideVsReportedByStoreDaypart) -- pure functions reusing ' +
  'labor-standard.js\'s daypartOf rather than re-deriving daypart boundaries.',
  '✅ Live-measured, not assumed: with SUPABASE_SERVICE_ROLE_KEY available this session, ran the ' +
  'real engine against real DAR data (27 stores, 14 days, 9,720 rows, store_vlh_config already ' +
  '100% populated). Drive Thru + In-Store guide hours cover 38.6% of total_needed_hours -- ' +
  'expected, not a bug, since QSRSoft\'s own field description says total_needed_hours = ' +
  'Variable Needed (all ~10 positions, this covers 2) + Fixed Sched + Floor Need. Resolves the ' +
  'old "assumed to be the VLH guide value... not confirmed" caveat in ' +
  'memory/analysis-labor-allocation-2026-08-18.md into an actual measured relationship.',
  '⚠️ Two things remain before this is live: the owner runs supabase/schema-vlh-guide.sql + ' +
  'node scripts/seed-vlh-guide.mjs (same "owner runs the SQL" pattern as every other new table ' +
  'this session), and no UI panel surfaces this yet -- this dispatch shipped the engine + data + ' +
  'live verification, not a new panel. 14 new tests (vlh-guide.test.js). Full suite 521/521 ' +
  'files, 4991/4991 tests. Build clean, eager payload unchanged at 550.56 KB / 850 KB (the new ' +
  'engine isn\'t imported by any UI yet). Full write-up: ' +
  'memory/finding-vlh-guide-tables-2026-09-16.md.',
]};
