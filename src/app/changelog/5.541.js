// @ts-nocheck
export default {version:'5.541', date:'2026-10-13', changes:[
  'Performance Reviews -- fixed Auto-Fill from Uploaded Data not populating the 2nd half of the ' +
  'year to date (owner-reported: should include July/August/September). Root cause: App.js ' +
  'bootstraps qsrActSummaryRows/glimpseRows/opsServiceRows with a fixed ~60-day trailing window ' +
  'from "today," never refreshed for an older period -- the same bug class ' +
  'memory/finding-pace-to-target-window-gap-2026-10-06.md already found and fixed for ' +
  'CurrentMonthPaceSection (analytics.js). A review spans the whole YEAR (dispatch #152) and ' +
  'autoPopulateKPIs always fills all 12 months, so any month more than ~2 months in the past ' +
  'silently read nothing from those three sources.',
  'Fixed the same way that finding did: doAutoFill now checks, per source, whether ds already ' +
  'reaches back to Jan 1 of the review\'s year for this store -- if not, fetches a widened ' +
  'window on demand (loadQsrActSummary/loadGlimpse/loadOpsServiceStats) and passes an augmented ' +
  'copy to autoPopulateKPIs for this one call, never mutating the app\'s own ds (every other ' +
  'panel\'s 60-day window is untouched). An empty fetch result (no Supabase client configured, ' +
  'or genuinely no rows) never overrides ds\'s existing rows with nothing, same `.length` guard ' +
  'App.js\'s own Ops Report stream load already uses.',
  '2 new tests render the real PerformanceReviewsPanel -> ReviewEditor chain and click the real ' +
  'Auto-fill button (this project\'s "verification must touch the call site" standing rule -- a ' +
  'test against autoPopulateKPIs alone would pass unchanged if doAutoFill\'s widening fetch were ' +
  'reverted): one proves a stale ds now still populates an out-of-window month via the widened ' +
  'fetch, the other proves an already-wide-enough ds does NOT trigger a needless fetch.',
]};
