// @ts-nocheck
export default {version:'5.388', date:'2026-09-07', changes:[
  'Scheduling: LifeLenz Time & Attendance now pulls live -- replaces scheduling.js\'s ' +
  'hand-transcribed TA_DATA (frozen since Jun 2026, no live source, "Update by uploading a ' +
  'new T&A report" that never got a pull built).',
  'Report-name slug found live: attendance_report (LIFELENZ_TOKEN alone works, no Playwright ' +
  'needed). New scripts/lifelenz-attendance-pull.mjs rolls each store\'s per-employee CSV rows ' +
  'up to a rolling 28-day summary (supabase/schema-lifelenz-attendance.sql, tenant + ' +
  'accessible_locs RLS like every other loc-keyed operational table). Daily workflow, watched ' +
  'in sync-failure-watch.yml, checked in stream-freshness.js STREAMS.',
  'Missed Shifts (the only TA_DATA field the UI actually renders -- the other 5 were dead data, ' +
  'computed but never displayed) now sources from sum(unexcused absences) per store, auto-first ' +
  'with the frozen snapshot as a per-store fallback until that store\'s first live pull lands. ' +
  'The Scheduling banner and Missed Shifts tile both show the real live/static mix (e.g. ' +
  '"12/27 stores live, rest Jun 1-28") instead of an all-or-nothing flag.',
  '⚠️ The mapping from "unexcused absences" to "missed shifts" is a judgment call, not a ' +
  'verified-identical replacement of whatever the original hand-typed number\'s own methodology ' +
  'was (it documented no source at all) -- flagged for owner confirmation.',
  '10 new tests (lifelenz-attendance-pull.test.js) against the REAL captured CSV shape, not a ' +
  'guessed one. Full suite 479 files/4592 tests -- 1 pre-existing, unrelated failure (a ' +
  'date-sensitive EOM dashboard test, fails identically on main before this change) left as-is, ' +
  'not touched. Build clean, eager budget 537.42 KB / 850 KB.',
]};
