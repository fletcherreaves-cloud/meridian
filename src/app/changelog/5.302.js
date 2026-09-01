// @ts-nocheck
export default {version:'5.302', date:'2026-09-01', changes:[
  'Correction to today\'s weekly-count-day detection (v5.298-5.301): the owner caught, from a ' +
  'live screenshot of the "🗓 Weekly Count Cadence" panel, that a per-store weekly count-day ' +
  'signal already existed and was already populating on-screen -- directly contradicting this ' +
  'session\'s own earlier research, which had concluded no such signal existed anywhere. It was ' +
  'right there in eom-dashboard.js\'s cadenceFromOnHand(), just not exported from an engine file ' +
  'a grep for "weekly count day" would have surfaced, and was measured live 27/27-populated back ' +
  'on 2026-08-25 (dispatch #112) using a broader "any real Food/Condiment attempt" ' +
  '(touchedWeeklyClasses) basis -- a fix for the EXACT under-population problem ' +
  'detectWeeklyCountDay() had just been built with (a 75%-coverage compliance bar, which dispatch ' +
  '#112 measured populates only 2/27 stores).',
  'Fixed by making detectWeeklyCountDay() (src/engine/count-cycle.js) the single shared ' +
  'implementation of the proven touchedWeeklyClasses basis, and refactoring cadenceFromOnHand() ' +
  'to call it instead of maintaining its own separate inline tally -- one algorithm, not two, so ' +
  'the new weekly-count-day pull window and digest email (both built on detectWeeklyCountDay()) ' +
  'can never disagree with what the Weekly Count Cadence panel already shows for the same store. ' +
  'count-cycle.test.js updated: the old "partial session returns null" case now correctly reads ' +
  'as a detected weekday (that IS the fix), with a new genuine-null case (Paper-only activity) ' +
  'and a new test for the real single-period-multiple-session-dates quirk this basis relies on.',
  'Full suite 3598/3598 passing, build clean, entry gzip unchanged at the module level (dead ' +
  '`dowOf` import removed from eom-dashboard.js, no longer needed once its inline tally was ' +
  'replaced). No change to weeklyDone/lastWeekly/Overdue status grading (dispatch #97\'s ' +
  'deliberate 98% bar) -- day-of-week pattern detection and completion-status grading stay the ' +
  'separate questions dispatch #112 established them as.',
]};
