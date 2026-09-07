// @ts-nocheck
export default {version:'5.397', date:'2026-09-07', changes:[
  'Removed avg6() (engine/forecast.js) -- dead code confirmed 2026-09-07 while re-verifying a ' +
  'backlog claim: compute6wk() had already migrated every field it computes to metricAvg() ' +
  '(the auto-first resolver), and nothing else in src/ ever called avg6() at all. Removed its 3 ' +
  'dead imports too (labor-tools.js, smart-targets.js, App.js). obs6() (still live, called by ' +
  "compute6wk's own _cov coverage map) kept as-is; a few comments' now-dangling references to " +
  'the deleted function reworded.',
  'No behavior change -- full suite 485 files/4623 tests, build clean, eager budget 537.96 KB / ' +
  '850 KB (unchanged).',
]};
