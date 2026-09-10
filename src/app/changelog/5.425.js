// @ts-nocheck
export default {version:'5.425', date:'2026-09-10', changes:[
  'Performance Reviews: location-attribution rule tightening -- notes-33-queue.md\'s own "AI ' +
  'recommendations" judgment call A, verbatim. Majority-of-month stays the headline single ' +
  'score everywhere else in the app (resolvePeriodAttribution, unchanged); this ADDS a ' +
  'day-weighted split across stores for a transferred review, surfaced for auditability, plus ' +
  'a flag when no single store holds a clear (>=70%) majority of the period\'s days -- the ' +
  'exact case where relying on the single headline number (still review.loc-based for the ' +
  'whole period everywhere outside this section) risks misleading a reviewer.',
  'New periodAttributionSplit()/LOCATION_ATTRIBUTION_MAJORITY_THRESHOLD (review-engine.js), ' +
  'wired into computeSegmentedReview\'s return as attributionSplit. SegmentedReviewSection ' +
  '(performance-reviews.js, dispatch #157\'s already-live per-segment detail view) now shows ' +
  'the per-store day breakdown whenever a transfer is detected, with a red warning callout ' +
  'only when the split genuinely needs attention. No new render branch -- reuses the existing ' +
  'hasTransitions gate, so a review with no transfer is completely unaffected.',
  '11 new tests: 8 pure-function unit tests (single segment, close split, clear majority, ' +
  'exactly-at-threshold, same-store role change grouping, partial-period clipping, empty ' +
  'input, sort/tie-break) plus 3 rendering the real PerformanceReviewsPanel -> ' +
  'SegmentedReviewSection chain, reusing dispatch #157\'s own proven mid-year-transfer fixture. ' +
  '10/11 confirmed failing against the pre-fix code (the 1 that passed either way is a ' +
  'baseline negative-assertion on the flat/no-transfer case).',
  'Full suite 4745/4745, build clean, 539.61 KB / 850 KB eager-payload budget (unchanged -- the ' +
  'panel is lazy-loaded).',
]};
