// @ts-nocheck
export default {version:'5.408', date:'2026-09-08', changes:[
  'Labor Analysis Config tab\'s hours-of-operation editor is no longer read-only. Backlog: ' +
  '"only the maint/prep/lobby fixed-hours inputs are editable." The per-day figure (Mon-Sun, ' +
  'deciphered from the source sheet) is now a small editable box per day, matching the existing ' +
  'maint/prep/lobby inputs\' pattern.',
  'A save writes the WHOLE hours_json blob (store_labor_config), so editing one day carries every ' +
  'other day\'s existing value forward -- open/close (used independently by labor-standard.js\'s ' +
  'overnight-standard math, not shown in this table) are preserved untouched. 3 new regression ' +
  'tests against the real LaborAnalysisPanel call site, including one proving a naive ' +
  '"only send the changed day" implementation would have silently wiped the other 6.',
  'Full suite 4651/4651, build clean, 538.16 KB / 850 KB budget.',
]};
