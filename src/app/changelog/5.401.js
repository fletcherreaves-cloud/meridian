// @ts-nocheck
export default {version:'5.401', date:'2026-09-08', changes:[
  'Morning Brief\'s getLatestBriefDate() fell back to new Date() (literal right-now) whenever ' +
  'none of laborRows/ctrlRows/peaksSvcRows had a date -- exactly the cloud-only-device case (no ' +
  'manual upload today), so the brief silently rendered for the still-filling in-progress ' +
  'business day instead of the last closed one. Every daily metric downstream (OEPE/KVS/T-Reds/ ' +
  'staffing-gap/GC-vs-Sales-divergence) is a same-day snapshot, so an in-progress day risked ' +
  'false RED/AMBER severity flags across the whole rule set -- this was backlog §4\'s open ' +
  'GC_SALES_DIVERGE lead.',
  'Fixed two ways: (1) getLatestBriefDate now also reads ds.qsrActSummaryRows (the auto DAR ' +
  'rollup, already loaded elsewhere in this file for darByLoc\'s own query) so a cloud-only ' +
  'device finds its real latest date instead of falling through to "now"; (2) the result is ' +
  'clamped to lastClosedBusinessDay() (src/utils/date.js, the shared 4am-ABC-cutover helper) so ' +
  'an in-progress date can never be selected even if a manual row happens to land on today.',
  '4 new/updated tests in morning-brief-geo.test.js (previous "falls back to now" test rewritten ' +
  'to assert the correct lastClosedBusinessDay() fallback, 2 new cases for the DAR-rollup pickup ' +
  'and the same-day-clamp). Full suite 487 files/4629 tests, build clean, eager budget 538.03 KB ' +
  '/ 850 KB.',
]};
