// @ts-nocheck
export default {version:'5.824', date:'2026-11-17', changes:[
  '**New report: DT OEPE w/o Parked.** Owner request — "DT OEPE w/o parked for MTD, LM, Last ' +
  '30 Days, Last 45 Days, Last 90 Days and YTD, per store." `METRIC_SOURCES.oepe` already IS ' +
  'the w/o-parked formula (`src/utils/oepe.js`\'s `oepeSeconds()` excludes held/parked time); ' +
  'the new piece is `engine/dt-oepe-report.js`\'s 6 period windows plus a true Σnum/Σden ' +
  '(`metricRate`) read per store, not an average-of-daily-averages. New Reports panel ' +
  '`DT OEPE w/o Parked` (`dt-oepe-report`, `views/dt-oepe-report.js`, built on `ReportShell` ' +
  'like every other Phase 5 report), cross-listed into the Reports Hub catalog.',
  '**Spot-Check Ruler: added a Reports entry point.** The owner, on learning what the ' +
  'Spot-Check Ruler was: "can we add that to reports?" The worksheet (task #129) already ' +
  'existed but only opened reactively, from Count Cycle\'s own follow-up button or Curated ' +
  'Home\'s "just logged a count" banner — no way to open any store\'s most recent qualifying ' +
  'count on demand. New `Spot-Check Ruler` report (`spot-check-ruler-report`, ' +
  '`views/spot-check-ruler-report.js`): pick a store, see its current `lastWeekly` session via ' +
  'the SAME `cycleCompliance()` resolution those two reactive entry points already use, open ' +
  'the real worksheet.',
]};
