// @ts-nocheck
export default {version:'5.303', date:'2026-09-01', changes:[
  'Weekly count-day detection: "utilize both" (owner-directed, verbatim: "maybe we utilize ' +
  'both. I am ok with auto detecting. Just remember to auto detect you will need to sense all ' +
  'food and condiment complete (per the same way we do for eom) and then mid month, include ' +
  'paper. Use the organization structure as a fall back of sorts."). ' +
  'detectWeeklyCountDay() (src/engine/count-cycle.js) reverts to the STRICT completion basis ' +
  '(satisfiesWeekly || isEom -- Food+Condiment fully covered, or the close-window count that ' +
  'also covers Paper -- the SAME definition cycleCompliance()\'s own lastWeekly already uses). ' +
  'A same-day earlier version had broadened this to "any partial touch counts," matching the ' +
  'live Cadence panel\'s own basis -- reverted on owner instruction, and independently justified: ' +
  'cross-checked against the real Organization Structure ground truth, that broader basis only ' +
  'agreed with the file on 6/20 OK stores (30%).',
  'New mergeWeeklyCountDay() (count-cycle.js): combines the derived signal (when it clears a ' +
  'confidence floor) with a FALLBACK layer sourced from Organization_Structure.xlsx\'s own ' +
  '"Weekly Inventory Count Day" column -- real, owner-entered per-store data. New ' +
  'parseOrgStructureCountDays() (src/parsers/index.js) reads it off the Locations sheet on every ' +
  'org-structure upload; App.js saves it to Supabase (saveWeeklyCountDayOverrides(), org_config ' +
  'key \'weekly_count_day_overrides\', no new migration). Precedence: confident derived signal > ' +
  'file fallback > low-confidence derived (better than nothing, e.g. every FL store, which the ' +
  'file has never covered) > null.',
  'scripts/qsrsoft-onhand-pull.mjs\'s storesCountingToday() and scripts/weekly-cycle-digest-' +
  'send.mjs both now call the merge (via a new shared scripts/lib/weekly-count-day.mjs loader, ' +
  'not a second copy of the fallback logic). Found and fixed in the same pass: both had been ' +
  'looking up the derived map by a zero-padded loc key, but detectWeeklyCountDay() keys its ' +
  'output unpadded (detectSessions()\'s own unpad(r.loc)) -- so the lookup always missed and the ' +
  'weekly-count-day pull/digest had been silently selecting ZERO stores since v5.299/v5.301, ' +
  'never yet observed live because the fix landed before either had run in production.',
  'eom-dashboard.js\'s cadenceFromOnHand() (the live "🗓 Weekly Count Cadence" panel) is ' +
  'deliberately UNCHANGED and no longer calls detectWeeklyCountDay() -- a same-day earlier ' +
  'version had unified them; reverted, because the panel and the automation now have genuinely ' +
  'different jobs (dense-but-approximate display vs. precise pull/email gating), not an ' +
  'accidental duplicate. Both functions\' doc comments cross-reference the other and explain why.',
  'Tests: count-cycle.test.js\'s detectWeeklyCountDay suite reverted to the strict-basis ' +
  'expectations plus a new mid-month Food+Condiment+Paper case; new mergeWeeklyCountDay suite; ' +
  'new dispatch-weekly-count-day-fallback.test.js covers parseOrgStructureCountDays against a ' +
  'synthetic workbook AND the real committed file. Full suite 3607/3607 passing, build clean.',
]};
