// @ts-nocheck
export default {version:'5.517', date:'2026-10-11', changes:[
  'Count-completeness bar raised from 95% to 100% (owner-directed: "close to 100% with the '+
  'only exception being a new wrin") -- COVER_FRAC in count-cycle.js is now 1, meaning every '+
  'active item in a class must be counted, no residual percentage slack. The slack the old '+
  '95% bar absorbed is now handled narrowly instead: a WRIN new to a store\'s active item '+
  'universe this period (diffNewWrins(), diffed against the prior period) is excluded from '+
  'both the numerator and denominator for its first period only, and surfaced separately as '+
  '"new item -- not required yet, but still needs counting" rather than silently invisible.',
  'Unified Count Cycle and the "Weekly Count Cadence" tab onto this ONE shared bar -- '+
  'cadenceFromOnHand() (eom-dashboard.js) used to independently grade the identical Food+'+
  'Condiment weekly question at CLASS_DONE_PCT=0.98; it now reads detectSessions()\'s own '+
  '`covered` array directly instead of re-deriving a second threshold, so the two panels can '+
  'never disagree on the same store/week again. eom-inventory.js\'s CLASS_DONE_PCT itself is '+
  'untouched -- it still independently grades Paper/Non-Product\'s own monthly EOM-close '+
  'completion, a different, deliberately-kept-lenient job.',
  'Fixed a real display bug this surfaced: count-cycle-panel.js\'s Count Cycle card and the '+
  'share-link report (formatWeeklyComplianceReport) both still said "fully counted at 75% '+
  'coverage or above" -- stale since COVER_FRAC was raised to 0.95 back in September and never '+
  'updated. Both now describe the real current rule.',
  'New: a count-day drift detector (countDayDrift(), count-cycle.js) cross-references each '+
  'store\'s recently-detected count day-of-week against the configured weekly_count_day_'+
  'overrides setting, and flags it ONLY when the derived signal is confident AND backed by '+
  'enough recent sessions to call it sustained, not a one-off blip.',
  'New standalone "Weekly Count Status" report (weekly-count-status-report.js) -- a printable/'+
  'exportable district roster (last full count, regular count day + drift flag, this-week '+
  'complete/incomplete, new items pending), modeled off Count Cycle\'s own data so the two can '+
  'never disagree. Linked from Count Cycle\'s own header ("🗓 Weekly Count Status report" '+
  'button), added to My Reports, and registered as a real nav entry under Reports.',
  '25 new tests (12 dispatch-new-wrin-exception-2026-10-11.test.js, 6 weekly-count-status-'+
  'report.test.js, 7 countDayDrift in count-cycle.test.js) plus updates to the existing '+
  'count-cycle/panel-registry/shell-nav ratchet tests for the new panel and raised threshold.',
]};
