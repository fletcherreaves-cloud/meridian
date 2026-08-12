// @ts-nocheck
// ── Coaching feedback loop, v1 (#208) ─────────────────────────────────────────
// identify (Needs Attention) -> assign -> intervene (record a cycle, here) ->
// measure (metric-source.js / dollar-weighted FOB, here) -> VERIFY (here, once a real
// threshold exists). Design: memory/project-coaching-feedback-loop.md.
//
// Five rules from the design doc, each enforced by a specific piece of this file:
//   1. Baseline auto-captured, never typed  -> snapshotMetricValue() is the only way in;
//      no function here accepts a caller-supplied baseline number.
//   2. The follow-up comes to him            -> toAttentionItem() builds a standard
//      attention-feed item (a new kind:'coaching-review', not a new panel) for a due cycle.
//   3. Starts from an existing finding       -> startCoachingCycle() takes loc+metric as
//      given, never chooses them.
//   4. Verdict is measured, never self-reported -> computeVerdict() reads NOISE_THRESHOLDS,
//      there is no field anywhere for a typed grade.
//   5. Single-user first                     -> no ack/notification/GM-login machinery here.
//
// Scope (#208's own instruction): food cost and labor only — the SAME 5 components
// scripts/measure-coaching-noise-threshold.mjs already measures (or will, once run), so a
// real threshold slots into NOISE_THRESHOLDS with zero shape mismatch to what was measured.
//
// NOISE_THRESHOLDS starts EMPTY. #208's own explicit fallback: "If this measurement isn't
// ready, ship the loop recording cycles WITHOUT verdicts rather than with wrong ones." No live
// Supabase session in this sandbox to run measure-coaching-noise-threshold.mjs, so v1 ships
// with computeVerdict() always returning null — a cycle log with no verdict, not a confident
// wrong one — until a future session runs that script and fills in real, cited numbers here.
import { metricAvg } from './metric-source.js';
import { lastClosedBusinessDay, addD, dKey } from '../utils/date.js';

export const REVIEW_WINDOW_DAYS = 30;
// Trailing window a baseline/result is averaged over — long enough to smooth day-of-week
// noise, short enough to reflect a recent intervention rather than the whole prior quarter.
// NOT independently measured for this purpose; matches the general scale of this repo's other
// trailing-window conventions (the swing alarm looks at 2x7-day windows) but is a judgment
// call, not a cited measurement — flagged rather than presented as derived.
export const SNAPSHOT_WINDOW_DAYS = 14;

// metric key -> how to source a trailing average for it. 'labor' uses metricAvg('laborPct') —
// the SAME simple-mean-of-daily-values every other Labor Tools panel already shows for a
// period's labor%, so a coaching baseline reads the same number the owner sees elsewhere, not
// a different "more correct" one nobody else displays. 'fob' components are DOLLAR-WEIGHTED
// (Σamt/Σsales over the window) from ds.qsrFobRows, matching computeFOBMetrics' (analytics.js)
// own established convention for FOB% — never a simple mean of daily ratios (CLAUDE.md:
// "never average averages, dollar-weight aggregates").
export const COACHING_METRICS = {
  labor_pct: { label: 'Labor %', source: 'labor' },
  fob_total_pct: { label: 'FOB % (total)', source: 'fob',
    fields: ['compWasteAmt', 'rawWasteAmt', 'condimentsAmt', 'empMgrMealsAmt', 'statVarianceAmt', 'unexplainedAmt'] },
  condiment_pct: { label: 'Condiment %', source: 'fob', fields: ['condimentsAmt'] },
  raw_waste_pct: { label: 'Raw Waste %', source: 'fob', fields: ['rawWasteAmt'] },
  comp_waste_pct: { label: 'Comp Waste %', source: 'fob', fields: ['compWasteAmt'] },
};

// Real thresholds go here once measured (scripts/measure-coaching-noise-threshold.mjs),
// each cited to the run that produced it — matching COVER_FRAC (#209, count-cycle.js) and the
// swing alarm's -10%/676-store-weeks precedent (memory/feedback-measure-dont-reason.md).
// Shape: { [metricKey]: thresholdInSameUnitAsGap } (pp for all 5 current metrics).
export const NOISE_THRESHOLDS = {};

const unpad = (l) => String(l || '').replace(/^0+/, '') || String(l || '');

function fobDollarWeightedPct(qsrFobRows, loc, fields, start, end) {
  // Raw ds.qsrFobRows shape (loadQsrFob, src/lib/supabase.js) — prodSalesAmt, NOT `sales`
  // (that normalized name only exists on FOBAnalysisPanel's locally-computed cloudFobRows).
  let amt = 0, sales = 0;
  for (const r of (qsrFobRows || [])) {
    if (!r || unpad(r.loc) !== unpad(loc)) continue;
    const d = r.date instanceof Date ? r.date : new Date(r.date);
    if (Number.isNaN(d.getTime()) || d < start || d > end) continue;
    if (!(r.prodSalesAmt > 0)) continue;
    sales += r.prodSalesAmt;
    for (const f of fields) amt += r[f] || 0;
  }
  return sales > 0 ? amt / sales : null;
}

/**
 * The ONLY way a baseline or result value enters a coaching cycle — auto-captured, trailing
 * SNAPSHOT_WINDOW_DAYS ending at the last CLOSED business day (never literal "today," which
 * would be a partial day — signature #4). Returns null if there isn't enough real data to
 * average, never a fabricated 0.
 */
export function snapshotMetricValue(ds, loc, metricKey, asOf = null) {
  const spec = COACHING_METRICS[metricKey];
  if (!spec || !ds || !loc) return null;
  const end = lastClosedBusinessDay(asOf ? new Date(asOf) : undefined);
  const start = addD(end, -(SNAPSHOT_WINDOW_DAYS - 1));
  if (spec.source === 'labor') return metricAvg(ds, loc, { s: start, e: end }, 'laborPct');
  if (spec.source === 'fob') return fobDollarWeightedPct(ds.qsrFobRows, loc, spec.fields, start, end);
  return null;
}

/**
 * Rule 3: starts from an existing finding — loc/metricKey/note are the only caller inputs.
 * Everything else (baseline, coached_at, review_at) is derived here, never typed.
 */
export function startCoachingCycle(ds, { loc, metricKey, note = '' }, asOf = null) {
  if (!COACHING_METRICS[metricKey]) throw new Error(`Unknown coaching metric: ${metricKey}`);
  const today = dKey(asOf ? new Date(asOf) : new Date());
  return {
    loc: unpad(loc),
    metric: metricKey,
    baseline: snapshotMetricValue(ds, loc, metricKey, asOf),
    coachedAt: today,
    note: note || '',
    reviewAt: dKey(addD(new Date(today + 'T00:00:00'), REVIEW_WINDOW_DAYS)),
    result: null,
    verdict: null,
  };
}

/** Cycles whose review is due (reviewAt <= asOf) and not yet recorded (result == null). */
export function dueForReview(cycles = [], asOf = null) {
  const today = dKey(asOf ? new Date(asOf) : new Date());
  return (cycles || []).filter(c => c && c.result == null && c.reviewAt && c.reviewAt <= today);
}

/**
 * Rule 4: measured, never self-reported. Returns null (not a guess) when no threshold is
 * registered for this metric yet — the explicit v1 fallback. All 5 current metrics are
 * cost/labor percentages where LOWER is better, so a negative delta (result < baseline) is
 * improvement.
 *
 * Only distinguishes improved / worse / no-change against the BASELINE's own prior level —
 * deliberately does not also classify "held at target" (would need a target lookup, a
 * different question, and isn't required for the "record cycles" v1 fallback this ships as).
 */
export function computeVerdict(baseline, result, metricKey) {
  const threshold = NOISE_THRESHOLDS[metricKey];
  if (baseline == null || result == null || !(threshold > 0)) return null;
  const delta = result - baseline; // negative = improved (metric went down)
  if (delta <= -threshold) return 'improved';
  if (delta >= threshold) return 'worse';
  return 'no change';
}

/**
 * Rule 4, continued: records the after-window result via the SAME auto-capture path as the
 * baseline, and computes the verdict (null if no threshold yet). Returns a new cycle object;
 * does not mutate the input.
 */
export function recordCoachingResult(ds, cycle, asOf = null) {
  const result = snapshotMetricValue(ds, cycle.loc, cycle.metric, asOf);
  return { ...cycle, result, verdict: computeVerdict(cycle.baseline, result, cycle.metric) };
}

/**
 * Rule 2: the follow-up comes to him. Builds a standard attention-feed item
 * ({id,severity,category,icon,title,detail,dollars,loc}, per attention-feed.js's documented
 * shape) for a due cycle, tagged kind:'coaching-review' — the one discriminator field this
 * item type adds, since no existing item needed one. severity is always 'info': a review being
 * due is a prompt to measure, not itself a problem.
 */
export function toAttentionItem(cycle, storeName) {
  const spec = COACHING_METRICS[cycle.metric];
  const label = spec ? spec.label : cycle.metric;
  const name = typeof storeName === 'function' ? storeName(cycle.loc) : (storeName || cycle.loc);
  return {
    id: `coaching-review-${cycle.loc}-${cycle.metric}-${cycle.coachedAt}`,
    kind: 'coaching-review',
    cycleId: cycle.id,   // lets a "Log Verdict" consumer look the source cycle back up
    severity: 'info',
    category: 'Coaching',
    icon: '🎯',
    title: `Follow-up due — ${label} at ${name}`,
    detail: cycle.note
      ? `Coached ${cycle.coachedAt}: "${cycle.note}" — baseline was ${cycle.baseline != null ? (cycle.baseline * 100).toFixed(2) + '%' : '—'}.`
      : `Coached ${cycle.coachedAt} — baseline was ${cycle.baseline != null ? (cycle.baseline * 100).toFixed(2) + '%' : '—'}.`,
    dollars: 0,
    loc: cycle.loc,
  };
}
