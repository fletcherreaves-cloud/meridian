// @ts-nocheck
export default {version:'5.386', date:'2026-09-06', changes:[
  'Performance Reviews: built the Bonus Eligibility module named as unbuilt in v5.385 -- a ' +
  'previous-org benefit (owner: "current org has NOT implemented this benefit yet but likely ' +
  'will next year"), fully separate from the 1-4 base competency scoring.',
  'Off by default. A toggle in Customize -> Weights ("Bonus Eligibility Module") turns on a ' +
  'pass/fail gate: Labor at least 0.25pts under target AND FOB at least 0.15pts under target, ' +
  'the exact absolute percentage-point figures from perf-review-excel-audit.md\'s Round 1, now ' +
  'used for the gate they were actually meant for per Round 2, not the base scoring bands.',
  'Purely additive by design -- computeScores/computeScoreBreakdown never read cfg.bonusEligibility ' +
  'at all, so it cannot change any existing score whether on or off. New pure functions ' +
  'bonusEligibilityForMonth/bonusEligibilityForPeriod (review-engine.js) read the same mo.labor/ ' +
  'mo.foodOB actual/target values the base scoring reads, graded against the absolute gate instead ' +
  'of the relative-%-of-target band. Period rollup requires every rated month to pass both gates -- ' +
  'a bonus benefit is normally all-or-nothing, not an averaged pass rate.',
  'Shows as a small "Bonus Eligibility" badge on the review Summary tab once enabled, per period, ' +
  'with each gate\'s pass/fail and how many months were rated.',
  '16 new tests (bonus-eligibility-module.test.js), including a same-output-on-vs-off regression ' +
  'proof for computeScores/computeScoreBreakdown. Full suite 478 files/4582 tests pass; build ' +
  'clean, eager budget 537.18 KB / 850 KB.',
]};
