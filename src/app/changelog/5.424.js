// @ts-nocheck
export default {version:'5.424', date:'2026-09-10', changes:[
  'Performance Reviews: ReviewList gained the "tag/search by score" Phase 2 punch-list item -- ' +
  'a name-search box and a score-band filter. The score bands reuse overallLabel()\'s own ' +
  '3.5/2.5/1.5 cutoffs and wording (the SAME scale ScorePill already colors by and SummaryTab ' +
  'already labels) rather than inventing a second, independently-tuned scale for the same ' +
  'numbers.',
  'Fixed a real pre-existing UX bug found in the same pass: the empty-list message said "No ' +
  'reviews yet" even when reviews existed and the active filters just matched none of them -- ' +
  'now distinguishes that case with its own "No reviews match these filters" copy.',
  'Re-measured the rest of the Phase 2 punch list while in this file: Dev Plan tab and the ' +
  'wage-review-section wiring were both already fully built (stale backlog lines, corrected). ' +
  'YoY trend view and hourly-manager reviews remain genuinely open -- no design decision made ' +
  'on either here.',
  '6 new tests (dispatch-review-list-search-score-filter.test.js) render the real ' +
  'PerformanceReviewsPanel -> ReviewList chain; 5/6 confirmed failing against the pre-fix code ' +
  '(the 6th is a no-filter baseline sanity check). Full suite 4734/4734, build clean, 539.39 ' +
  'KB / 850 KB eager-payload budget (unchanged -- the panel is lazy-loaded).',
]};
