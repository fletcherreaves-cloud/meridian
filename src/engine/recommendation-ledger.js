// @ts-nocheck
// Recommendation Accuracy Ledger -- Phase 1 pure helpers (task #80 follow-on, owner-approved
// 2026-11-04). See memory/plan-recommendation-accuracy-ledger-2026-11-04.md for the full design
// and supabase/schema-recommendation-ledger.sql for the table (not yet created in live
// Supabase -- the owner's own action, per this repo's standing DDL rule).
//
// Pure, UI-framework-free, and deliberately tiny: the capture/grading call sites in
// analytics.js and the grading script both build their dedupe key and grade through these same
// two functions, so the convention lives in exactly one place.

// One row per (loc, source, field, period) -- matches the `dedupe_key` unique index in
// schema-recommendation-ledger.sql. `periodKey` is caller-supplied (e.g. '2026-11' for a
// monthly target, or a store's own period token for a future source) so this stays agnostic to
// what "period" means for a given source.
export function dedupeKeyFor(source, loc, field, periodKey) {
  return [source, loc, field, periodKey].join(':');
}

// The 1st of the month AFTER the target month, 00:00 UTC -- safely past the target month's own
// close (the real actual for e.g. November isn't fully knowable until December 1st), as an ISO
// string ready for a timestamptz column.
export function outcomeDueAtForMonth(year, month) {
  const nextMonth = month === 12 ? 0 : month;
  const nextYear = month === 12 ? year + 1 : year;
  return new Date(Date.UTC(nextYear, nextMonth, 1)).toISOString();
}

// Grades one recommendation against its real outcome. Reuses runPeriodTotalBacktest's own
// percentage-error philosophy (backtest.js) rather than inventing new grading math: a signed
// percent error, banded against `tolerance` (default 0.05 = 5%, matching owner-sales-
// forecast.js's own OWNER_FORECAST_PARAMS.reviewFlagThreshold -- the one existing precedent for
// "how far off is too far" on this exact kind of suggestion). `null` in, `null` out -- never a
// fabricated grade when either value is missing.
export function gradeOutcome(recommendationValue, outcomeValue, tolerance = 0.05) {
  if (typeof recommendationValue !== 'number' || typeof outcomeValue !== 'number') {
    return { outcome_error: null, grade: null };
  }
  const outcome_error = outcomeValue - recommendationValue;
  if (recommendationValue === 0) {
    return { outcome_error, grade: outcomeValue === 0 ? 'within_tolerance' : (outcome_error > 0 ? 'under' : 'over') };
  }
  const pctError = Math.abs(outcome_error / recommendationValue);
  const grade = pctError <= tolerance ? 'within_tolerance' : (outcome_error > 0 ? 'under' : 'over');
  return { outcome_error, grade };
}
