// @ts-nocheck
// ── Tracking to Plan — hourly/daily/weekly/monthly/YTD $ pacing ───────────────────────────────
// Home-screen widget candidate (redesign Phase 3, owner-requested multi-granularity view,
// 2026-10-08). Hourly/daily reuse the EXACT intraday calc src/views/signals.js's LiveOps tab
// already ships (extracted here so both call ONE function — CLAUDE.md's "diff the two
// computations" rule applied preemptively, not after the two drift). Weekly/monthly/YTD are new:
// no separately-uploaded weekly or YTD budget exists anywhere in Meridian's data model, so each
// is DERIVED from the store's own official monthly $ target (mergedTargetsForLocMonth's real
// precedence chain: DEFAULT_TARGETS < yearly < monthly upload < Targets-editor override) via a
// flat run-rate (target ÷ days in month) -- "data depth is never the limiter, derive it" rather
// than declining to build a number because nothing precomputed it. The derivation is stated
// explicitly in `method` below so it is never mistaken for a real uploaded weekly/YTD budget.
import { mergedTargetsForLocMonth } from './review-engine.js';
import { metricSeries } from './metric-source.js';

// Intraday $ + GC pace vs QSRSoft's own hour-by-hour projection, for one date's
// qsr_daily_activity rows (hour_slot granularity, App.js's shared `darRows`/`refreshDar`).
// Verbatim extraction of signals.js's LiveOpsTab `planPace` memo.
export function intradayPace(rows = []) {
  let doneActual = 0, doneProj = 0, remProj = 0, fullProj = 0;
  let doneGC = 0, doneProjGC = 0, remProjGC = 0, fullProjGC = 0;
  for (const r of (rows || [])) {
    const proj = r.proj_sales_dollars || 0;
    const projGC = r.proj_total_transactions || 0;
    fullProj += proj; fullProjGC += projGC;
    if ((r.product_sales || 0) > 0) {
      doneActual += r.product_sales; doneProj += proj;
      doneGC += r.transactions || 0; doneProjGC += projGC;
    } else { remProj += proj; remProjGC += projGC; }
  }
  if (fullProj <= 0 && fullProjGC <= 0) return null;
  return {
    pacePct: doneProj > 0 ? doneActual / doneProj * 100 : null,
    projectedEOD: doneActual + remProj,
    fullProj, doneActual,
    gcPacePct: doneProjGC > 0 ? doneGC / doneProjGC * 100 : null,
    projectedEODGC: doneGC + remProjGC,
    fullProjGC, doneGC, hasGC: fullProjGC > 0,
  };
}

const daysInMonth = (y, m) => new Date(y, m, 0).getDate();

// District $ target for one calendar month -- dollar-summed across every store (never
// averaged) via the real official-targets precedence chain.
function districtMonthTarget(ds, locs, year, month) {
  let total = 0;
  for (const loc of locs) total += mergedTargetsForLocMonth(ds, loc, year, month)?.tProdSales || 0;
  return total;
}

// District actual $ for a date range -- summed (never averaged) across stores, each day
// sourced auto-first via metric-source.js's METRIC_SOURCES (qsrActSummaryRows before the
// laborRows manual fallback). Deliberately NOT vs-ly.js's autoFirstTotal/autoFirstDaily:
// measured live that those let a stale MANUAL row win over a fresher AUTO one for the same
// date (autoFirstDaily sets curByDate unconditionally from laborRows first, then only fills
// gaps from qsrActSummaryRows) -- the inverse of the standing "auto-first, manual last-resort"
// rule. That is a real latent bug in a widely-used shared helper, out of scope to fix here
// (vs-LY comparisons across the whole app depend on its current behavior); metricSeries's
// per-metric sourcing is already correct and already the standing-rule-mandated path for a
// plain metric total, so this widget uses that instead of carrying the bug forward.
function districtActual(ds, locs, range) {
  let total = 0;
  for (const loc of locs) total += Object.values(metricSeries(ds, loc, range, 'sales')).reduce((a, b) => a + b, 0);
  return total;
}

export function periodPace(ds, locs, { today = new Date() } = {}) {
  const y = today.getFullYear(), m = today.getMonth() + 1, d = today.getDate();
  const dim = daysInMonth(y, m);
  const monthTarget = districtMonthTarget(ds, locs, y, m);
  const dailyRunRate = dim > 0 ? monthTarget / dim : 0;

  const monthStart = new Date(y, m - 1, 1);
  const monthActual = districtActual(ds, locs, { s: monthStart, e: today });
  const monthPlanToDate = dailyRunRate * d;

  const weekStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6);
  const weekActual = districtActual(ds, locs, { s: weekStart, e: today });
  const weekPlanToDate = dailyRunRate * 7;

  let ytdTarget = 0;
  for (let mm = 1; mm < m; mm++) ytdTarget += districtMonthTarget(ds, locs, y, mm);
  ytdTarget += monthPlanToDate; // current month's elapsed-day share
  const yearStart = new Date(y, 0, 1);
  const ytdActual = districtActual(ds, locs, { s: yearStart, e: today });

  const pct = (actual, plan) => plan > 0 ? (actual / plan * 100) : null;
  return {
    weekly:  { actual: weekActual,  plan: weekPlanToDate,  pacePct: pct(weekActual, weekPlanToDate) },
    monthly: { actual: monthActual, plan: monthPlanToDate, pacePct: pct(monthActual, monthPlanToDate), fullMonthTarget: monthTarget },
    ytd:     { actual: ytdActual,   plan: ytdTarget,        pacePct: pct(ytdActual, ytdTarget) },
    method: "Weekly/monthly/YTD plan is derived from each store's own official monthly $ target "
      + '(run-rate = target ÷ days in month) -- Meridian has no separately-uploaded weekly or YTD budget.',
  };
}
