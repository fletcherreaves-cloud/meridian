// @ts-nocheck
export default {version:'5.392', date:'2026-09-07', changes:[
  'Performance Reviews: ReviewEditor now shows a missing-targets banner (visible on every tab) ' +
  'naming any scored metric with no resolvable target, plus a "Set Targets →" button that jumps ' +
  'straight to Customize > Targets. missingReviewTargets() (review-engine.js) already existed, ' +
  'engine-tested, but had no UI consumer -- this closes the gap.',
  '"One-click seed" was scoped to "jump to the real Targets editor" rather than auto-filling a ' +
  'guessed value -- most flagged metrics (OEPE, KVS, FOB%, etc.) have no sales-forecast-style ' +
  'model to seed a sensible default from, and writing a fabricated number into a scored review ' +
  'is worse than an honest "no target set" flag.',
  '3 new tests (missing-review-targets-banner.test.js), rendering the real PerformanceReviewsPanel ' +
  '-> ReviewEditor chain. Also re-measured and corrected two other stale backlog lines: the FOB ' +
  'variance-chart loopback-anchoring + per-item chart item was already fully shipped ' +
  '(eom-dashboard.js\'s Weekly Count Cadence drill-down), and the §13 RLS note was updated with ' +
  'the owner\'s live 68-policy pg_policies measurement.',
  'Full suite 482 files/4611 tests, build clean, eager budget 537.96 KB / 850 KB (unchanged).',
]};
