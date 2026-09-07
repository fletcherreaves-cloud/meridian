// @ts-nocheck
export default {version:'5.391', date:'2026-09-07', changes:[
  'Scheduling: Missed Shifts now counts EXCUSED + UNEXCUSED absences (owner-confirmed ' +
  'definition -- "any shift scheduled but not worked would be a missed shift"). Was ' +
  'unexcused-only, which undercounted every excused no-show.',
  'RLS Phase 2: owner ran the recommended pg_policies count check -- 68 RESTRICTIVE policies ' +
  'live (more than schema-rls-phase2-loc.sql\'s own "expect 51", which is expected: ~10 more ' +
  'schema files have shipped their own per-store RESTRICTIVE policy since that file was ' +
  'written). Confirms the migration genuinely applied, not just written to a file that never ' +
  'ran. The live per-store isolation test (a real login as a genuinely-restricted profile) is ' +
  'still the open step.',
  'Security: xlsx CVEs fixed. package.json\'s "xlsx" now aliases to npm:@e965/xlsx@^0.20.3 ' +
  '(a SheetJS-authored npm-registry mirror of their own patched release) instead of the ' +
  'unpatched 0.18.5 -- zero import-site changes across all 14 files. npm audit confirms both ' +
  'CVEs (prototype pollution, ReDoS) are gone.',
  'New: 🗒️ Store Assessments panel (Test Kitchen) -- a real store_assessments table (manual, ' +
  'user-editable, tenant + accessible_locs RLS) finally backs the "8/20 stores rated" progress ' +
  'figure this backlog item tracked for months against a table that never actually existed ' +
  '(confirmed via a live service-role read, v5.390). Per-store status/rating/assessed-date/ ' +
  'due-date/notes, inline edit, rated/total progress card. Owner still needs to run ' +
  'supabase/schema-store-assessments.sql before the panel has anywhere to write.',
  '7 new tests (store-assessments.test.js, the two pure merge/progress helpers). Full suite ' +
  '481 files/4608 tests, build clean, eager budget 537.87 KB / 850 KB (xlsx chunk itself grew, ' +
  'lazy-loaded so it never touches the eager budget).',
]};
