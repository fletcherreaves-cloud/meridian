// @ts-nocheck
export default {version:'5.480', date:'2026-09-23', changes:[
  'Performance Reviews: added a year-over-year trend view -- the one still-genuinely-open item ' +
  'from the Phase 2 punch list (Dev Plan tab, wage-section wiring, tag/search-by-score were all ' +
  'already shipped as of the 2026-09-10 re-measurement).',
  'A review record has no stable identity for the person being reviewed -- review.geid is the ' +
  'ATTRIBUTING MANAGER\'s id (Notes 33 A#3), only set for shift-attributable roles, never the ' +
  'reviewed person\'s own -- so name (case/whitespace-normalized) is the only signal a trend can ' +
  'match on across years. New yearlyTrendFor(reviews,cfg,name) (src/engine/review-engine.js) ' +
  'returns each year\'s computeScores(r,cfg).year.overall for a name, sorted ascending. ' +
  'ReviewList shows a trend strip (reusing the existing ScorePill) once the name search narrows ' +
  'to exactly one person with 2+ scored years -- never shown unfiltered (ambiguous which ' +
  'person) or for a single-year person (nothing to trend).',
  '7 new tests (dispatch-review-yoy-trend-2026-09-23.test.js): 3 against the real exported ' +
  'yearlyTrendFor (name matching, cross-person exclusion, junk input), 4 rendering the real ' +
  'PerformanceReviewsPanel -> ReviewList chain -- 4 of 7 confirmed to fail against the pre-fix ' +
  'code (the other 3 are negative-case baselines expected to pass either way). Full suite ' +
  '541/541 files, 5094/5094 tests. Build clean, eager payload 552.29 KB gzip (budget 850 KB).',
]};
