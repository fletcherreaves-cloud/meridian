// @ts-nocheck
export default {version:'5.277', date:'2026-08-31', changes:[
  'At-A-Glance FOB tile\'s district-weighted targets (wTgt) -- same stale-target bug as the EOM ' +
  'Dashboard/Share View fix (v5.275), swept to this surface too: it read DEFAULT_TARGETS alone, ' +
  'never this period\'s monthly_targets override. Now layers ds.allMonthlyTargets (already loaded ' +
  'once at the App.js level, the same source eom-supervisor.js\'s computeStoreEOM() already reads) ' +
  'on top, keyed to the exact month the tile is showing (fobPeriods.curYM), before falling back to ' +
  'DEFAULT_TARGETS for any store/field with no override on file.' +
  '\n\n' +
  'Full sweep of every other DEFAULT_TARGETS[loc].tFOBTarget-style read in the app confirmed the ' +
  'rest are already correct: store-cockpit.js, store-analytics.js, patch-heatmap.js all read ' +
  '`store.t`, which is already the fully-merged monthly-aware value (App.js\'s mergedTargets, ' +
  'threaded through buildStore() in pipeline.js) -- not a second bug, verified by tracing the ' +
  'actual data flow, not assumed clean. One known, deliberately-deferred gap: smart-targets.js\'s ' +
  '`officialVal` closure (the backtest/model-calibration panel) is a period-less pure function with ' +
  'no month context at all -- a different architecture needing its own restructuring pass, not a ' +
  'quick copy of this fix. Not touched here; flagged for follow-up.'
]};
