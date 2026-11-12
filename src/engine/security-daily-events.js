// @ts-nocheck
// ── Daily flagged events — Phase 1 of the camera-hint fix (owner dispatch, 2026-11-12) ──────────
// Owner's own framing: "no one is ever going to sit and watch or pour through that much video."
// A real case (Holdenville/CASH-004, Ryan A) showed why — the batch job (scripts/security-rules-
// run.mjs) evaluates a rolling 28-day WINDOW and stores one verdict for the whole thing
// (security_findings), so a single outlier shift gets reported as if the whole window were bad,
// and the camera-review hint (security-panel.js's cameraReviewHint()) can only ever point at the
// window because that's the only granularity anything remembers.
//
// The fix is NOT a new computation — security-baselines.js already builds a per-(loc,empToken,day)
// row before it ever gets rolled into the window average; this module just stops throwing that
// granularity away. deriveDailyBreaches() re-runs the SAME evaluateRule() interpreter the window
// verdict already trusts, one calendar day at a time, against the EXACT rows the window-level call
// already had in hand — no new query, no new math, no second source of truth for what "flagged"
// means.
//
// Deliberately generic over `dateField` (not hardcoded to 'date'): audit_rows/qsr_security_events
// rows use `date`, but this is written so a future day-grain source with a differently-named date
// column doesn't need a second copy of this function.
import { evaluateRule } from './security-rules.js';

// Groups subjectRows by their date field. A date with MULTIPLE rows (e.g. a CASH-003-style source
// where one employee can have more than one event row on the same day) is summed together by
// evaluateRule()'s own aggField(), exactly as the window-level call already does across many days
// -- this just narrows the row set evaluateRule() sums over from "the whole window" to "one day."
function groupByDate(rows, dateField) {
  const byDate = new Map();
  for (const r of rows) {
    const d = r[dateField];
    if (!d) continue;
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d).push(r);
  }
  return byDate;
}

// `dataKey` is whatever key the caller's own evaluateRule() call already uses for this rule family
// (e.g. 'audit_rows' for CASH, a dynamic DATA_REQUIRED[0] for EVENT/LABOR) -- passed through
// unchanged so this reuses the IDENTICAL dataContext shape the window-level verdict was built from.
// `baseline` is the SAME baseline object the window-level evaluateRule() call used (computed once,
// before either the window or the daily call) -- a z-score rule's daily reading must be judged
// against the window's own personal/peer/store/network distribution, never a degenerate one-day
// baseline of its own (a single day has no distribution to z-score against; reusing the window's
// baseline is what makes "which day actually drove this" a meaningful question at all).
//
// Only ever called by the caller when the WINDOW verdict itself was pass:true (same cost
// discipline as computeWasteExoneration's own "only for a real flag" gate in security-rules-run.mjs)
// -- a clear or undetermined window has no outlier day worth hunting for.
export function deriveDailyBreaches(rule, subjectRows, dataKey, baseline, dateField = 'date') {
  const byDate = groupByDate(subjectRows, dateField);
  const breaches = [];
  for (const [date, dayRows] of byDate) {
    const evalResult = evaluateRule(rule, { [dataKey]: dayRows }, { baseline });
    if (evalResult.pass === true) {
      breaches.push({ date, value: evalResult.value, thresholdUsed: evalResult.threshold });
    }
  }
  // Oldest first -- a reader (or the camera hint) scans a short list top-to-bottom chronologically,
  // not by magnitude; magnitude is still on each row for whoever wants to re-sort.
  breaches.sort((a, b) => a.date.localeCompare(b.date));
  return breaches;
}
