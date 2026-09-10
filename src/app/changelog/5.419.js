// @ts-nocheck
export default {version:'5.419', date:'2026-09-10', changes:[
  'Fixed GH #1221 -- 4 of the 6 confirmed/candidate sites found while fixing #167 that had the ' +
  'same ds.targets||DEFAULT_TARGETS pattern (bypasses settings.targets, App.js\'s already-fully-' +
  'merged mergedTargets object): at-a-glance.js\'s weekProjections, features/smart-targets.js\'s ' +
  'computeSmartTargets (a legacy internal panel, not the active views/smart-targets.js fixed for ' +
  '#177), and two loops in analytics.js (the PVSA backtest and the DI-vs-DOW model comparison) -- ' +
  'all four feed forecastDay\'s tGrowth read, so a Targets-panel/v2 growth-rate override was ' +
  'silently ignored in each. Also widened analytics.js\'s FOBAnalysisPanel allTargets, which was ' +
  'already merging ds.monthlyTargets but missing the settings.targets top layer.',
  'Two sites deliberately NOT fixed in this pass: engine/tolerance-status.js\'s tolMergedTarget ' +
  'and its call chain (tolStatusesForStore -> tolStatusesDistrict -> ToleranceRollupTile) -- ' +
  'traced the full chain and found ToleranceRollupTile (the At-A-Glance tile consuming it) ' +
  'doesn\'t receive a settings prop at all, so fixing this needs real prop-threading across 4 ' +
  'call sites (including pipeline.js\'s buildStore, for the coaching-findings consumer), not a ' +
  'local one-line fix. Left open on #1221 rather than risk an incomplete thread-through.',
  '4 new tests (dispatch-1221-target-merge-chain-sweep.test.js) -- computeSmartTargets asserted ' +
  'directly on its returned currentTarget; AtAGlance verified by spying on forecastDay itself and ' +
  'checking the resolved tgt object it receives (a bare "doesn\'t throw" check would pass ' +
  'identically against the pre-fix code, since reading the wrong object doesn\'t throw -- this ' +
  'repo\'s own "would this verification still pass if reverted" rule). Both confirmed to fail ' +
  'against the pre-fix code before landing. FOBAnalysisPanel kept as a lighter smoke test, ' +
  'matching its lower-risk change (one appended spread key, no logic change). Full suite ' +
  '4695/4695, build clean, 538.60 KB / 850 KB budget.',
]};
