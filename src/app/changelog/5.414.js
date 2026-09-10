// @ts-nocheck
export default {version:'5.414', date:'2026-09-10', changes:[
  'Monthly Targets upload now persists tLabor (Combined Labor %) and tFOBBonusBase (Bonus Food ' +
  'Over Base Target) -- GH #164\'s 2026-08-11 triage ("Triage of all 69 reads") flagged this as ' +
  '"finding 1," more urgent than the migration itself: parseMonthlyTargets() extracts fields ' +
  'saveMonthlyTargets() silently dropped, so a value could exist in-memory right after upload ' +
  'and vanish on the next reload from Supabase -- "scores can change between uploading the ' +
  'monthly file and refreshing the page." Re-measured against CURRENT code before touching ' +
  'anything, per CLAUDE.md\'s "measure it, don\'t reason about it" rule -- the finding had ' +
  'narrowed since Aug 11: parseMonthlyTargets() no longer produces tOepe/tPark/tKvst/tKvsu/' +
  'tR2p/tOsat/tOsatB2B at all (those moved to the separate parseYearlyTargets() at some point ' +
  'since), so the original "8 dropped fields" claim is stale. What\'s still genuinely live: ' +
  'tLabor and tFOBBonusBase, both still parsed, neither persisted.',
  'tLabor matters specifically because it IS the field GH #164\'s larger migration (69 readers ' +
  'across 13 files, tLabor legacy vs tCrewLabor authoritative) is named after -- until that ' +
  'migration lands, any surface still reading t.tLabor was silently falling back to ' +
  'DEFAULT_TARGETS the moment the page reloaded post-upload, exactly the "score changes between ' +
  'upload and refresh" contradiction the issue is about.',
  'Two new nullable monthly_targets columns (labor_pct, fob_bonus_base_pct) -- ' +
  'supabase/schema-monthly-targets-labor-fobbonus.sql (owner needs to run this) plus the ' +
  'matching columns added to schema.sql\'s own CREATE TABLE so schema-drift-test.js\'s ratchet ' +
  '(dispatch #52\'s rider -- schema.sql and standalone migrations must agree) stays clean. ' +
  'Purely additive: every existing row/column unchanged, zero behavior change until the next ' +
  'monthly-targets upload actually carries a value for either field.',
  'Wired into saveMonthlyTargets + both loadMonthlyTargets/loadAllMonthlyTargets (same ' +
  '_stripNullTargets() null-handling every other column already gets, per #166). 8 new tests ' +
  '(dispatch-164-monthly-targets-labor-fobbonus-persist.test.js) covering the save side, both ' +
  'load functions, null-stripping, a pre-migration row with the columns entirely absent, and ' +
  'the full save-then-simulated-reload round trip that reproduces the exact defect #164 traced. ' +
  'Full suite 4674/4674, build clean, 538.62 KB / 850 KB eager-payload budget.',
]};
