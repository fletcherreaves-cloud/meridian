// @ts-nocheck
export default {version:'5.382', date:'2026-09-06', changes:[
  'Docs-only correction to v5.381\'s commit body/changelog: it claimed GitHub issues #228 and ' +
  '#231 were already resolved, citing dispatch-228-resend-count-notification.md and dispatch-' +
  '231-complaints-metric.md as evidence. Those dispatch files are real and correctly verified, ' +
  'but GitHub issues #228 and #231 are a DIFFERENT, unrelated pair of bugs that happen to share ' +
  'the same numbers by coincidence -- caught while trying to verify #302/#303/#285/#289 next and ' +
  'finding real GitHub issues with completely different titles under those same numbers.',
  'Re-verified the REAL GitHub issues #228 (FOB Analysis weights period-to-date snapshots as if ' +
  'they were daily rows) and #231 (Patch Heatmap ignores the period selector, was P1) against ' +
  'the actual code -- both are ALSO already fixed, just never closed. #228: computeFOBMetrics ' +
  '(analytics.js) already reduces to one latest-dated row per loc (latestByLoc) before any sales-' +
  'weighted calculation runs, so the weighting is a real per-store district average, not a blend ' +
  'of cumulative snapshots (fix traces to "Dispatch #102", never tied back to closing this issue). ' +
  '#231: patch-heatmap.js removed the dateRange prop entirely rather than wiring it through a ' +
  'pipeline never designed for period-comparison, rewrote every empty-state string to stop ' +
  'claiming scoping it never had, and has its own guard test (patch-heatmap-daterange.test.js).',
  'Also confirmed #302 (parsePMixData hierarchical-export bug) is fixed and tested ' +
  '(pmix-parser.test.js\'s "hierarchy (#302)" suite) -- GitHub issue was also just never closed.',
  'Closed GitHub issues #228, #231, #302 with the evidence above. #285 and #289 confirmed still ' +
  'genuinely open and unaddressed -- both are real, substantive items (a probe-script methodology ' +
  'bug; three missing target-workbook blocks gating VOICE grading) and not attempted this pass.',
  'No code changes. Bundle: unchanged.',
]};
