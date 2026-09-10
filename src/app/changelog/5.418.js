// @ts-nocheck
export default {version:'5.418', date:'2026-09-10', changes:[
  'Fixed GH #167: Projections\' forecast computation had its own copy of #153\'s "buildStore ' +
  'discards mergedTargets" defect. Traced forecastDay\'s target param end to end -- it reads ' +
  'exactly one field off it, t.tGrowth (the year-over-year growth rate used to extrapolate this ' +
  'year\'s forecast from last year\'s actual) -- and found three call sites in ' +
  'features/projections.js (computeWeek, the _fcstCache builder, and _cachedForecast\'s ' +
  'fallback) all built that target from ds.targets[loc]||DEFAULT_TARGETS[loc], the exact #153 ' +
  'defect-1 pattern (ds.targets is {} on every cloud-load path; only an in-session ' +
  'OpsTargets.xlsx upload fills it). So a Targets-panel or v2 monthly override to a store\'s ' +
  'growth rate was silently ignored by every Projections forecast, falling through to the ' +
  'static DEFAULT_TARGETS value -- the issue\'s own worry ("a second live instance of #153, on ' +
  'the owner\'s approved sales numbers") confirmed real, just for tGrowth rather than sales_proj ' +
  'directly (that field turned out to reach its consumers correctly, per an earlier verified ' +
  'pass).',
  'Fixed with one shared, exported projectionTarget(loc, ds, settings) helper -- settings.targets ' +
  'first (App.js\'s already-fully-merged mergedTargets object), ds.targets as a fallback, ' +
  'DEFAULT_TARGETS last -- matching the pattern PreForecastBrief already used two components ' +
  'above in the same file. All three call sites now route through it so they can\'t drift into ' +
  'different answers again.',
  'While tracing this, found the SAME 2-tier (ds.targets||DEFAULT_TARGETS, no settings.targets) ' +
  'pattern in 5 more files (at-a-glance.js, features/smart-targets.js -- a separate, ' +
  '`kind:\'internal\'` legacy panel, NOT the active views/smart-targets.js fixed for #177 this ' +
  'morning -- and analytics.js ×2), plus 2 sites with a different partial-merge shape ' +
  '(tolerance-status.js, analytics.js) that may or may not be the same bug. Not fixed in this ' +
  'pass -- scoped as a dedicated follow-up rather than blindly patched, since some may be ' +
  'deliberate. Filed as #1221.',
  '4 new tests (dispatch-167-projections-target-merge-chain.test.js) against the real exported ' +
  'projectionTarget, confirmed to fail against the pre-fix code before landing. Full suite ' +
  '4691/4691, build clean, 538.57 KB / 850 KB budget.',
]};
