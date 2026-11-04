// @ts-nocheck
export default {version:'5.617', date:'2026-11-04', changes:[
  '**Ops/Controls scores now blend in trend, alongside the existing actual-vs-target grade ' +
  '(owner-requested, memory/plan-ops-ctrl-score-redesign-2026-11-04.md).** The flat opsScore/ ' +
  'ctrlScore (every sort/rollup/coaching threshold in the app) is UNCHANGED. New ' +
  '`opsScoreBlended`/`ctrlScoreBlended` (src/engine/pipeline.js\'s `computeTrendBlendedScore`) ' +
  'add a damped, capped contribution from the store\'s own recent trend -- buildStore\'s existing ' +
  '"2-week score minus 4-week score" velocity -- so a store genuinely improving reads higher ' +
  'than an identically-positioned flat store, and a declining store reads lower, before either ' +
  'one reaches its target outright. Store Dashboard (Ops/Controls scorecards) shows a small ' +
  '"↑/↓ NN trend-blended" badge next to the real score when they differ by half a point or more ' +
  '-- hidden otherwise, so a flat store shows nothing extra. Damp (0.5) and cap (±8 points) are ' +
  'first-pass defaults in DEF_SETTINGS.scoring (trendDamp/trendCap) -- unlike the sales-forecast ' +
  'model\'s owner-fitted dials, these are explicitly NOT backtested, just a reasonable starting ' +
  'point pending real-world observation. 10 new tests ' +
  '(src/__tests__/dispatch-ops-ctrl-trend-blend-2026-11-04.test.js) cover the damping, both-' +
  'direction capping, 0-100 clamping, and null-trend passthrough. 714/714 test files, 6572/6572 ' +
  'tests; build clean.',
]};
