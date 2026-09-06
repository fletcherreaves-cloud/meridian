// @ts-nocheck
export default {version:'5.384', date:'2026-09-06', changes:[
  'Performance Reviews: fixed the FOB metric-definition mismatch (owner-approved spec, ' +
  'perf-review-excel-audit.md 2026-07-27/28). Food Over Base used to score in DOLLARS against ' +
  'a workbook target that is a PERCENTAGE -- a real unit mismatch, not just a loose threshold, ' +
  'and the reason FOB never had an auto-filled target (a bespoke dollar-conversion workaround ' +
  'covered the gap instead).',
  'foodOB now scores FOB% directly -- fob$÷prodSales for the auto-pulled qsr_fob source, the ' +
  'raw fobPct field for the manual fallback (same auto-first sourcing priority as before, just ' +
  'a different unit). Scoring switched from relative-%-of-target to absolute percentage-points ' +
  '(the owner\'s explicit ask -- "FOB% within 0.15 pts of the target FOB%"), with thresholds ' +
  'converted to this app\'s fraction-of-1 storage scale for a percentage.',
  'FOB target now auto-fills from the workbook directly through the same generic mechanism ' +
  'every other metric uses, replacing the special-case dollar conversion this exposed FOB to ' +
  'before -- the "unblocks target auto-fill" this fix was for.',
  '10 new tests locking in the real scoring outcomes (boundary values verified numerically ' +
  'against the scoring engine\'s own comparison logic before writing assertions -- an ' +
  'exact-threshold value is floating-point sensitive), plus updates to 4 existing test files ' +
  'whose fixtures asserted the old dollar-scale behavior.',
  'Labor % has the same "relative vs absolute" looseness issue per the same owner decision, but ' +
  'is a separate metric (already percentage-scaled, so lower-risk, threshold-only) -- not ' +
  'bundled into this fix, flagged as a natural follow-up.',
  'Bundle: 536.90 KB eager / 850 KB budget (536.86 KB before -- negligible change).',
]};
