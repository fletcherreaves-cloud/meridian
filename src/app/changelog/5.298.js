// @ts-nocheck
export default {version:'5.298', date:'2026-09-01', changes:[
  'Foundation for weekly-count automation (owner req): added detectWeeklyCountDay() to ' +
  'src/engine/count-cycle.js, deriving each store\'s TYPICAL weekly-count weekday from historical ' +
  'qsr_onhand session data. There is no stored "this store counts on Tuesdays" setting anywhere ' +
  'in the data model -- checked directly, weekly-cadence.js\'s own `expectedWeekdayByLoc` param is ' +
  'declared but never populated by any real caller, and the live count-cycle engine has no fixed ' +
  'per-store schedule either. This derives it instead of blocking on a new manual setting: the ' +
  'most common weekday among each store\'s recent qualifying weekly sessions (`satisfiesWeekly || ' +
  'isEom`, the SAME "complete weekly count" definition cycleCompliance()\'s own `lastWeekly` ' +
  'already uses), with ties breaking toward the most recent occurrence so a store that shifted ' +
  'its count day reads as the new day. Takes one row-array PER PERIOD (not one flat blob) -- ' +
  'concatenating multiple periods\' qsr_onhand rows into a single detectSessions() call would ' +
  'inflate the coverage-check denominator by however many periods are included, and two different ' +
  'dates both clearing 75% coverage of the same class universe within one period is a mathematical ' +
  'contradiction anyway, so a single period can surface at most one qualifying date. This is the ' +
  'first piece of the day\'s broader ask (share link + automatic emails working with weekly ' +
  'counts, plus an hourly intraday pull on each store\'s count day); more to follow.',
  'Also fixed two tests that broke on the real month rollover to September (measured live, ' +
  '2026-09-01): dispatch-eom-cash-controls.test.js and dispatch-swing-ledger-report.test.js both ' +
  'built date fixtures relative to `periodKey(new Date())` (the CURRENT month) but never drove the ' +
  'panel\'s period picker, instead relying on its default -- which special-cases the first 6 days ' +
  'of a month to default to the PRIOR month. That mismatch is silent (nothing renders, nothing ' +
  'throws) until the fixture dates and the default period land in different months, which is ' +
  'exactly what happened. Both now explicitly select the period, matching ' +
  'dispatch-227-eom-reports.test.js\'s own established pattern for this trap.',
]};
