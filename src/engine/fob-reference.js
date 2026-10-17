// @ts-nocheck
// ── FOB Reference Table engine ────────────────────────────────────────────────
// Live version of the owner's own Excel "Table 1 (2)" BX:CD reference table (Loc / L3M / L6W /
// LM / MTD / Projected / Trend), built off auto-pulled Supabase streams instead of a manually
// pasted snapshot (owner, 2026-10-17: "pasted fro[m] ops report. live would be amazing if we
// could pull that off in excel!" → scoped as an in-app Meridian build instead, approved: "Yes,
// scope what it would take in Meridian... I am good with your direction of (2)", then "And, yes,
// build it").
//
// The 16 metric columns the owner asked for: Sales Projection, Comp Sales %, Crew Labor %, TPPH
// Target, Base Food %, Disc Coup %, Comp Waste %, Raw Waste %, Condiment %, Emp Food %, Stat
// Loss %, Unex Diff %, FOB Target w/o Disc Coup, Total Food Cost %, P&L Paper Cost %, Op Supply
// Target.
//
// ⚠️ qsr_fob is a MONTH-TO-DATE CUMULATIVE snapshot per (loc, date) -- NOT a daily delta.
// Confirmed in src/views/at-a-glance.js's own comment ("qsr_fob is month-to-date, so this shows
// current running MTD cost") and its fobByMonth/fobAgg logic, which deliberately takes only the
// LATEST (month-end) row per store per month rather than averaging every day's cumulative value.
// Averaging a monotonically-growing cumulative curve across every day in a month (which is what
// metric-source.js's existing 'monthly' granularity path does for these same fields, via
// signal-registry.js's _extractViaMetricSource mean-of-daily) silently understates the real
// monthly ratio -- see memory finding filed alongside this module. This engine deliberately does
// NOT reuse that path for the 11 FOB-leg metrics below. Instead it reconstructs TRUE daily $
// deltas (today's cumulative minus yesterday's, reset to the raw value on the 1st of each month)
// once per store via fobDailyDeltas(), then sums deltas -- never cumulative legs -- over any
// window. That is the one correct way to get a dollar-weighted ratio for an arbitrary date range
// out of a cumulative source, and it mirrors at-a-glance.js's own fobAgg() $-leg formulas exactly
// (same field names, same combinations -- confirmed against the report there: store 5985 base
// food 22.7%, P&L food 27.3%).
//
// The other 5 metrics (Sales Projection, Comp Sales %, Crew Labor %, TPPH Target, Op Supply
// Target) ARE genuinely per-day independent values in their source streams, so this module reuses
// the existing, proven auto-first resolvers for them (vs-ly.js's autoFirstTotal/matchedVsLY,
// metric-source.js's metricAvg/metricSumRatio) rather than reinventing per-day resolution.
import { metricAvg, metricSumRatio } from './metric-source.js';
import { matchedVsLY, autoFirstTotal } from './vs-ly.js';
import { trendSlope } from '../features/smart-targets.js';
import { pLFoodCostFromRow, pLPaperCostFromRow } from './eom-inventory.js';

// ── FOB $ legs, read from ds.qsrFobRows' cumulative MTD snapshot ─────────────────────────────
// pLFoodPct/pLPaperPct legs reuse eom-inventory.js's own pLFoodCostFromRow/pLPaperCostFromRow
// (the ONE place this Begin+Purchases+Adjustments+Transfers-Promotions-End build-up is defined,
// per that file's own #222 extraction comment) rather than re-deriving the formula here.
const FOB_LEGS = {
  fobPct:      r => (r.rawWasteAmt||0)+(r.compWasteAmt||0)+(r.condimentsAmt||0)+(r.empMgrMealsAmt||0)+(r.statVarianceAmt||0)+(r.unexplainedAmt||0),
  baseFoodPct: r => r.totalBaseFood||0,
  compWaste:   r => r.compWasteAmt||0,
  rawWaste:    r => r.rawWasteAmt||0,
  condiment:   r => r.condimentsAmt||0,
  empMeal:     r => r.empMgrMealsAmt||0,
  statVar:     r => r.statVarianceAmt||0,
  unexplained: r => r.unexplainedAmt||0,
  discCoupon:  r => r.discountCouponsAmt||0,
  pLFoodPct:   r => pLFoodCostFromRow(r, 0).pLFoodCost,
  pLPaperPct:  r => pLPaperCostFromRow(r, 0).pLPaperCost,
};
const FOB_LEG_KEYS = Object.keys(FOB_LEGS);

function _asDate(v) { return v instanceof Date ? v : new Date(String(v) + 'T00:00:00'); }
const _normLoc = l => String(parseInt(String(l || '').replace(/\D/g, ''), 10) || '');

// Reconstruct TRUE daily $ deltas per store from qsr_fob's cumulative MTD snapshot.
// Exported for tests. Returns { [loc]: [{date, sales, legs:{key:$}}, ...] } sorted ascending.
export function fobDailyDeltas(ds) {
  const rows = ds?.qsrFobRows || [];
  const sorted = rows
    .map(r => ({ ...r, _d: _asDate(r.date) }))
    .filter(r => !isNaN(r._d))
    .sort((a, b) => a._d - b._d);
  const byLoc = new Map();
  for (const r of sorted) {
    const loc = _normLoc(r.loc);
    if (!byLoc.has(loc)) byLoc.set(loc, { list: [], prev: null });
    const bucket = byLoc.get(loc);
    const prev = bucket.prev;
    const sameMonth = prev && prev.d.getFullYear() === r._d.getFullYear() && prev.d.getMonth() === r._d.getMonth();
    const curSales = r.prodSalesAmt || 0;
    const entry = { date: r._d, sales: sameMonth ? curSales - prev.cumSales : curSales, legs: {} };
    const cumLegs = {};
    for (const k of FOB_LEG_KEYS) {
      cumLegs[k] = FOB_LEGS[k](r);
      entry.legs[k] = sameMonth ? cumLegs[k] - (prev.cumLegs[k] || 0) : cumLegs[k];
    }
    bucket.list.push(entry);
    bucket.prev = { d: r._d, cumSales: curSales, cumLegs };
  }
  const out = {};
  for (const [loc, b] of byLoc) out[loc] = b.list;
  return out;
}

// Σleg ÷ Σsales over [start,end] from a store's own delta list -- dollar-weighted, never an
// average of daily ratios (same standing rule metric-source.js's whole file is built around).
function _fobWindowRatio(deltas, legKey, start, end) {
  let legSum = 0, salesSum = 0;
  for (const e of deltas) {
    if (e.date >= start && e.date <= end) { legSum += e.legs[legKey] || 0; salesSum += e.sales || 0; }
  }
  return salesSum > 0 ? legSum / salesSum : null;
}

function _ebosSum(ds, loc, range) {
  const L = _normLoc(loc);
  let sum = 0, any = false;
  for (const r of (ds?.ebosRows || [])) {
    if (_normLoc(r.loc) !== L) continue;
    const d = r.date instanceof Date ? r.date : new Date(r.date);
    if (isNaN(d) || d < range.s || d > range.e) continue;
    sum += r.opsPurchases || 0;
    any = true;
  }
  return any ? sum : null;
}

// ── Date window helpers ───────────────────────────────────────────────────────────────────────
const _mStart = d => new Date(d.getFullYear(), d.getMonth(), 1);
const _mEnd   = d => new Date(d.getFullYear(), d.getMonth() + 1, 0);
const _addM   = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1);
const _addD   = (d, n) => new Date(d.getTime() + n * 86400000);

export function fobReferenceWindows(asOf) {
  return {
    mtd: { s: _mStart(asOf), e: asOf },
    lm:  { s: _mStart(_addM(asOf, -1)), e: _mEnd(_addM(asOf, -1)) },
    l3m: { s: _mStart(_addM(asOf, -3)), e: _mEnd(_addM(asOf, -1)) }, // 3 fully completed months
    l6w: { s: _addD(asOf, -41), e: asOf },                          // rolling 6 weeks
  };
}

// ── The 16 metric columns ─────────────────────────────────────────────────────────────────────
// kind: 'pct' | 'dollar' | 'rate' (trans/person-hr) -- governs how Projected blends MTD vs L3M.
// fobLeg: when set, resolved via the delta-reconstruction above; otherwise via the `key`-specific
// daily-native resolver in _resolveWindow below.
export const FOB_REFERENCE_METRICS = [
  { key: 'salesProjection', label: 'Sales Projection',         kind: 'dollar', better: 'higher' },
  { key: 'compSalesPct',    label: 'Comp Sales %',             kind: 'pct',    better: 'higher' },
  { key: 'crewLaborPct',    label: 'Crew Labor %',             kind: 'pct',    better: 'lower' },
  { key: 'tpphTarget',      label: 'TPPH Target',              kind: 'rate',   better: 'higher' },
  { key: 'baseFoodPct',     label: 'Base Food %',              kind: 'pct',    better: 'lower', fobLeg: 'baseFoodPct' },
  { key: 'discCouponPct',   label: 'Disc Coup %',              kind: 'pct',    better: 'lower', fobLeg: 'discCoupon' },
  { key: 'compWastePct',    label: 'Comp Waste %',             kind: 'pct',    better: 'lower', fobLeg: 'compWaste' },
  { key: 'rawWastePct',     label: 'Raw Waste %',              kind: 'pct',    better: 'lower', fobLeg: 'rawWaste' },
  { key: 'condimentPct',    label: 'Condiment %',              kind: 'pct',    better: 'lower', fobLeg: 'condiment' },
  { key: 'empFoodPct',      label: 'Emp Food %',               kind: 'pct',    better: 'lower', fobLeg: 'empMeal' },
  { key: 'statLossPct',     label: 'Stat Loss %',              kind: 'pct',    better: 'lower', fobLeg: 'statVar' },
  { key: 'unexDiffPct',     label: 'Unex Diff %',              kind: 'pct',    better: 'lower', fobLeg: 'unexplained' },
  { key: 'fobTargetPct',    label: 'FOB Target w/o Disc Coup', kind: 'pct',    better: 'lower', fobLeg: 'fobPct' },
  { key: 'totalFoodCostPct',label: 'Total Food Cost %',        kind: 'pct',    better: 'lower', fobLeg: 'pLFoodPct' },
  { key: 'paperCostPct',    label: 'P&L Paper Cost %',         kind: 'pct',    better: 'lower', fobLeg: 'pLPaperPct' },
  { key: 'opSupplyTarget',  label: 'Op Supply Target',         kind: 'dollar', better: 'lower' },
];

function _resolveWindow(ds, loc, metric, range, deltasForLoc) {
  if (metric.fobLeg) return _fobWindowRatio(deltasForLoc, metric.fobLeg, range.s, range.e);
  switch (metric.key) {
    case 'salesProjection': { const v = autoFirstTotal(ds, loc, range, 'sales'); return v > 0 ? v : null; }
    case 'compSalesPct':    { const m = matchedVsLY(ds, loc, range, 'sales'); return m.days ? m.pct : null; }
    case 'crewLaborPct':    { const r = metricSumRatio(ds, [loc], range, 'laborPct'); return r ? r.value : null; }
    case 'tpphTarget':      return metricAvg(ds, [loc], range, 'tpph');
    case 'opSupplyTarget':  return _ebosSum(ds, loc, range);
    default: return null;
  }
}

function _blend(a, b, w) {
  if (a == null && b == null) return null;
  if (a == null) return b;
  if (b == null) return a;
  return w * a + (1 - w) * b;
}

// Projected = where the metric will land for the current month. A ratio/rate metric blends its
// MTD-so-far value with its L3M average, weighted toward MTD as the month progresses (so an
// early-month MTD reading -- noisy on a handful of days -- doesn't dominate). A dollar metric
// first turns its MTD total into a full-month run-rate (MTD ÷ elapsed days × days in month)
// before the same blend, since a raw MTD $ total isn't comparable to a full-month L3M average.
function _computeProjected(metric, windowVals, asOf) {
  const { mtd, l3m } = windowVals;
  const elapsedDays = asOf.getDate();
  const daysInMonth = _mEnd(asOf).getDate();
  const w = Math.min(1, elapsedDays / daysInMonth);
  if (metric.kind === 'dollar') {
    const mtdRunRate = mtd != null ? (mtd / elapsedDays) * daysInMonth : null;
    const l3mPerMonth = l3m != null ? l3m / 3 : null; // l3m window holds the 3-month SUM
    return _blend(mtdRunRate, l3mPerMonth, w);
  }
  return _blend(mtd, l3m, w);
}

// Trend = direction over the last up to 6 fully completed months, via smart-targets.js's own
// trendSlope() (the same slope calc the TPPH trend-arrow logic already uses). |slope| < 0.02 is
// called flat -- not a formal threshold study, just a small deadband so float noise on a nearly
// constant metric doesn't flip-flop the arrow.
function _computeTrend(ds, loc, metric, asOf, deltasForLoc) {
  const vals = [];
  for (let i = 6; i >= 1; i--) {
    const range = { s: _mStart(_addM(asOf, -i)), e: _mEnd(_addM(asOf, -i)) };
    const v = _resolveWindow(ds, loc, metric, range, deltasForLoc);
    if (v != null) vals.push(v);
  }
  if (vals.length < 4) return { slope: 0, direction: 'flat' };
  const slope = trendSlope(vals);
  return { slope, direction: Math.abs(slope) < 0.02 ? 'flat' : (slope > 0 ? 'up' : 'down') };
}

// One row per store: { loc, metrics: { [metricKey]: { l3m, l6w, lm, mtd, projected, trend, trendSlope } } }
export function computeFobReferenceTable(ds, locs, asOf = new Date()) {
  const list = (Array.isArray(locs) ? locs : [locs]).map(_normLoc);
  const windows = fobReferenceWindows(asOf);
  const allDeltas = fobDailyDeltas(ds);
  return list.map(loc => {
    const deltasForLoc = allDeltas[loc] || [];
    const metrics = {};
    for (const metric of FOB_REFERENCE_METRICS) {
      const windowVals = {
        l3m: _resolveWindow(ds, loc, metric, windows.l3m, deltasForLoc),
        l6w: _resolveWindow(ds, loc, metric, windows.l6w, deltasForLoc),
        lm:  _resolveWindow(ds, loc, metric, windows.lm, deltasForLoc),
        mtd: _resolveWindow(ds, loc, metric, windows.mtd, deltasForLoc),
      };
      const projected = _computeProjected(metric, windowVals, asOf);
      const trend = _computeTrend(ds, loc, metric, asOf, deltasForLoc);
      metrics[metric.key] = { ...windowVals, projected, trend: trend.direction, trendSlope: trend.slope };
    }
    return { loc, metrics };
  });
}
