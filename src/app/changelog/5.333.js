// @ts-nocheck
export default {version:'5.333', date:'2026-09-03', changes:[
  'Simplification: Scheduling Intelligence\'s wAvgTPMH(rows) was a literal duplicate of ' +
  'engine/weighted.js\'s ratioOfSumsDerived(rows, r=>r.tcs, r=>r.tpmh), including the same ' +
  'plain-mean fallback -- now delegates to the shared helper instead of re-implementing it. ' +
  'wAvgLaborPct (this file\'s other rollup) is intentionally left untouched -- it applies ' +
  'normLaborPct and a different null-guard that admits a legitimate 0% labor reading, which the ' +
  'shared helper\'s guard would incorrectly drop.',
  'Behavior-preserving: same 11/11 scheduling-rollups.test.js assertions pass unchanged. Full ' +
  'suite (3718 tests) and build both clean (533.11 KB / 850 KB eager budget). Smoke-tested via ' +
  'dev server + headless Chromium, zero JS errors.',
]};
