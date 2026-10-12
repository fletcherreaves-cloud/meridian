// @ts-nocheck
export default {version:'5.523', date:'2026-10-12', changes:[
  'Fixed a real bug in the brand-new lifelenz_punch_edits table (v5.522), found via a manual ' +
  'live run the same day it shipped: adjusted_punch_at was part of the primary key, which makes ' +
  'Postgres treat it as implicitly NOT NULL -- but real LifeLenz data has Add/Edit rows where ' +
  'that field is legitimately blank. 7 of 26 active stores had their ENTIRE batch upsert fail ' +
  'silently (133 of 317 real edit-events lost) while the job\'s own exit code still read success.',
  'Fix: dropped adjusted_punch_at from the primary key (now loc/geid/punch_type/modified_at, all ' +
  'four already guaranteed non-null by parsePunchEditCSV\'s own row-building filter) in both ' +
  'supabase/schema-lifelenz-punch-edits.sql and upsertPunchEditRows()\'s matching onConflict. ' +
  'The schema file now also carries an idempotent ALTER migration for the table that already ' +
  'exists live under the old (buggy) key -- editing the file alone does not retroactively fix it.',
  'Same live run independently confirmed the rest of the build is correct: the report endpoint, ' +
  'auth, and scheduleId-reuse all worked against the real API (200 on every store), and ' +
  'parsePunchEditCSV correctly parsed 317 real edit-events across 26 stores. See ' +
  'memory/finding-lifelenz-punch-edit-audit-report-2026-10-12.md for the full "measured, not ' +
  'assumed" writeup -- store counts only, no employee-level data recorded.',
]};
