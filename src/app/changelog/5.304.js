// @ts-nocheck
export default {version:'5.304', date:'2026-09-01', changes:[
  'Weekly count-day fallback now persists to a REAL TABLE (owner req, verbatim: "Should probably ' +
  'add it to a table so it is persisted. The count days.") -- new ' +
  'supabase/schema-weekly-count-day.sql creates weekly_count_day_overrides, one row per store ' +
  '(loc, weekday, weekday_name), replacing this feature\'s first-shipped draft that packed the ' +
  'whole per-store map into a single org_config JSON blob. Same shape/RLS pattern as ' +
  'target_overrides (tenant-isolation policy, write access gated by the upload flow rather than ' +
  'RLS) -- the closest existing analog for a small, owner-editable per-store override table.',
  'loadWeeklyCountDayOverrides()/saveWeeklyCountDayOverrides() (src/lib/supabase.js) now ' +
  'read/write the table directly (select + a per-store upsert on tenant_id+loc) instead of a ' +
  'single blob. scripts/lib/weekly-count-day.mjs\'s Node-side loader updated to match. App.js\'s ' +
  'post-upload summary now reports the ACTUAL saved row count (a bad/unrecognized weekday value ' +
  'is silently skipped, not written) rather than assuming every parsed row landed.',
  '⚠️ Needs one owner action: run supabase/schema-weekly-count-day.sql in the Supabase SQL ' +
  'editor once (idempotent, ~1 minute) -- this session has no DDL execution path (checked: no ' +
  'DATABASE_URL, no exec_sql-style RPC on the project), the same situation every other ' +
  'supabase/schema-*.sql file in this repo is already in. Until then, ' +
  'loadWeeklyCountDayOverrides() degrades to {} (no fallback signal, not a crash) -- the derived ' +
  'qsr_onhand-based detection keeps working on its own in the meantime.',
  'New src/__tests__/weekly-count-day-config.test.js (mocked-client technique, same precedent as ' +
  'eom-digest-config.test.js) covers the load/save round-trip, empty-table default, an ' +
  'unrecognized-weekday-name entry being skipped rather than written, an empty save being a ' +
  'no-op, and a real write error surfacing instead of being swallowed. Full suite 3614/3614 ' +
  'passing, build clean.',
]};
