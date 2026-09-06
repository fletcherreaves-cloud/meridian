// @ts-nocheck
export default {version:'5.385', date:'2026-09-06', changes:[
  'Correction to v5.384: reverted the threshold half of the FOB metric fix in Performance ' +
  'Reviews; the metric-definition half (score FOB%, not fob$) was correct and stands.',
  'v5.384 also set unit:\'abs\', t:[-0.0015,0.0015,0.0045] -- the owner\'s 0.15/0.45-percentage-' +
  'point figures, but from perf-review-excel-audit.md\'s Round 1 (2026-07-27). A fuller read of ' +
  'the same file found Round 2 (2026-07-28, one day later) explicitly revises this: those ' +
  'figures are PREVIOUS-ORG BONUS-ELIGIBILITY GATES, meant for a separate, currently-OFF "Bonus ' +
  'Eligibility" module, "distinct from the 1-4 competency scoring" -- not the base scoring bands.',
  'Round 2 never named a replacement base-scoring threshold for FOB, so unit/t reverted to the ' +
  'value that shipped before either round touched it (unit:\'pct\', t:[-0.05,0.05,0.10] -- ' +
  'relative-%-of-target, the shape most other metrics here use), now correctly applied to the ' +
  'FOB% actual/target instead of the old dollar figures.',
  'The genuinely still-unbuilt piece is the Bonus Eligibility module itself (Labor -0.25pts/FOB ' +
  '-0.15pts of target, toggle-gated, off by default) -- a real new feature (a config toggle plus ' +
  'its own scoring section), not attempted here.',
  '10 tests rewritten to match the corrected config. Full suite 477 files/4566 tests pass; build ' +
  'clean, budget unchanged (536.90 KB eager / 850 KB).',
]};
