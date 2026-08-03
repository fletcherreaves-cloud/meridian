// @ts-nocheck
// ── One-Pager data adapter (ds → engine inputs) ───────────────────────────────
// The ONLY ds/stream-coupled layer of the One-Pager. Maps the live dataset +
// qsr_fob rows into the normalized per-store inputs the pure engines consume
// (opportunity.js / one-pager.js). Sources metrics through the shared resolvers
// (metric-source auto-first, DEFAULT_TARGETS) and uses the dashboard's canonical
// dollar-weighted FOB% (Σ components ÷ Σ prodSales) — never a re-derived formula.
import { metricSeries, metricAvg } from './metric-source.js';
import { matchedVsLY } from './vs-ly.js';
import { computeScheduleRollup, FIXED_FLOOR_SEG_MIN, FIXED_FLOOR_SEG_MAX, FIXED_FLOOR_COMBINED_MAX } from './schedule-summary.js';
import { DEFAULT_TARGETS } from '../constants.js';

const unpad = l => String(l || '').replace(/^0+/, '') || String(l || '');
const monthOf = d => (typeof d === 'string' ? d : (d && d.toISOString ? d.toISOString() : '')).slice(0, 7);
const inRange = (d, range) => { const k = (typeof d === 'string' ? d : (d && d.toISOString ? d.toISOString() : '')).slice(0, 10); return k >= range.s && k <= range.e; };

// Sum / count of a metric's daily values for one loc over a range (auto-first per day).
function sumSeries(ds, loc, range, key) {
  const s = metricSeries(ds, loc, range, key);
  let sum = 0, n = 0;
  for (const k in s) { sum += s[k]; n++; }
  return { sum, days: n };
}

// Canonical dollar-weighted FOB over a range, per loc: Σ components ÷ Σ prodSales.
// Rows with no positive product-sales base are skipped entirely — a component-only
// row (waste $ present, prodSales 0/null) would otherwise inflate the numerator
// without adding to the denominator and blow the % up (the FL 14.88% anomaly). A
// valid FOB contribution requires a real sales base for the same period.
export function fobByRange(fobRows, range) {
  const acc = {};
  const at = loc => acc[loc] || (acc[loc] = { prodSales: 0, fob$: 0, lyProdSales: 0, lyFob$: 0 });
  for (const r of (fobRows || [])) {
    if (!inRange(r.date, range)) continue;
    const loc = unpad(r.loc);
    const prod = r.prodSalesAmt || 0;
    if (prod > 0) {
      const a = at(loc);
      a.prodSales += prod;
      a.fob$ += (r.compWasteAmt || 0) + (r.rawWasteAmt || 0) + (r.condimentsAmt || 0)
              + (r.empMgrMealsAmt || 0) + (r.statVarianceAmt || 0) + (r.unexplainedAmt || 0);
    }
    // Same-basis LAST-YEAR aggregation from the qsr_fob ly_* dollar columns, so FOB% vs LY
    // uses the IDENTICAL dollar-weighted method as the current FOB% (Σ components ÷ Σ prod
    // sales) — an apples-to-apples direction signal, never a re-derived formula. Guarded on a
    // real LY sales base for the same reason as current (a component-only LY row would inflate).
    const lyProd = r.lyProdSalesAmt || 0;
    if (lyProd > 0) {
      const a = at(loc);
      a.lyProdSales += lyProd;
      a.lyFob$ += (r.lyCompWasteAmt || 0) + (r.lyRawWasteAmt || 0) + (r.lyCondimentsAmt || 0)
                + (r.lyEmpMgrMealsAmt || 0) + (r.lyStatVarianceAmt || 0) + (r.lyUnexplainedAmt || 0);
    }
  }
  for (const loc in acc) {
    const a = acc[loc];
    a.fobPct = a.prodSales ? a.fob$ / a.prodSales : null;
    a.lyFobPct = a.lyProdSales ? a.lyFob$ / a.lyProdSales : null;
  }
  return acc;
}

// Per-store inputs for computeOpportunity(). `range` = { s, e } ISO date strings.
// WINDOW-CONSISTENCY (Notes 32 C): every pillar uses the SAME window's sales, guests
// and day-count. We deliberately do NOT fall back to the FOB row's prodSales for
// netSales/avgCheck — that figure spans the FOB report's period (often a full month),
// and mixing a monthly sales base into a weekly window inflates avgCheck (monthly $ ÷
// weekly guests) which blows up the GC opportunity pillar (the "weekly = way too high"
// bug). The food pillar applies the FOB% RATE to the window's own sales so a monthly
// FOB row can't overstate a weekly food$. The canonical FOB% (for the header tile) still
// uses the fob rows' own base, carried separately as fobProdSales.
export function buildOnePagerInputs(ds, fobRows, locs, range) {
  const fob = fobByRange(fobRows, range);
  return (locs || []).map(loc => {
    const L = unpad(loc);
    const t = DEFAULT_TARGETS[L] || {};
    const sales = sumSeries(ds, loc, range, 'sales');
    const gc = sumSeries(ds, loc, range, 'gc');
    const projGc = sumSeries(ds, loc, range, 'projGC');     // QSRSoft plan guests (pace baseline)
    const projSales = sumSeries(ds, loc, range, 'projSales'); // QSRSoft plan product sales $
    const f = fob[L] || {};
    const days = sales.days || gc.days || 0;
    const netSales = sales.sum || 0;                     // window sales only — no monthly fallback
    const avgCheck = (netSales > 0 && gc.sum > 0) ? netSales / gc.sum : (t.tAvgCheck ?? null);
    return {
      loc: L,
      netSales,
      prodSales: netSales,               // food-opportunity base = the window's own sales
      fobProdSales: f.prodSales ?? null, // canonical FOB% denominator (fob rows' own period base)
      days,
      avgCheck,
      laborPctActual: metricAvg(ds, loc, range, 'laborPct'),
      laborPctTarget: t.tLabor ?? null,
      fobPctActual: f.fobPct ?? null,
      fobPctTarget: t.tFOBTarget ?? null,
      gcPerDayActual: days ? gc.sum / days : null,
      // Pace-to-projection: expected GC/day from QSRSoft's own plan over the matched days.
      gcPerDayTarget: projGc.days ? projGc.sum / projGc.days : null,
      // Sales-to-plan (the GC/traffic opportunity, tied to Projected Prod Sales — Notes 35):
      // per-DAY figures so different day-coverage between actual & plan can't skew the gap.
      // gc$ = pos0(projSales/day − actualSales/day) × days — a bounded, sane $ shortfall vs plan.
      salesPerDay:     days ? netSales / days : null,
      projSalesPerDay: projSales.days ? projSales.sum / projSales.days : null,
    };
  });
}

// Current value of each follow-up-tracked metric, per loc, over the range — feeds
// reconcileFollowUps(). Rates via metricAvg; fob% via the canonical formula; gc/day derived.
export function buildMetricNow(ds, fobRows, locs, range) {
  const fob = fobByRange(fobRows, range);
  const out = {};
  for (const loc of (locs || [])) {
    const L = unpad(loc);
    const gc = sumSeries(ds, loc, range, 'gc');
    out[L] = {
      laborPct: metricAvg(ds, loc, range, 'laborPct'),
      fobPct: (fob[L] || {}).fobPct ?? null,
      oepe: metricAvg(ds, loc, range, 'oepe'),
      r2p: metricAvg(ds, loc, range, 'r2p'),
      kvst: metricAvg(ds, loc, range, 'kvst'),
      gcPerDay: gc.days ? gc.sum / gc.days : null,
    };
  }
  return out;
}

// Per-location breakdown (Notes 33 B#10) — one row per store in the selected scope, so
// the page rolls up to the group AND lists its locations individually (screen + print).
// Same shared sourcing as the header (metric-source auto-first, canonical FOB%, matched
// vs-LY) so a store row reconciles to the roll-up. `opp` (computeOpportunity result)
// supplies the per-store recoverable $. Sorted worst-sales-vs-LY first (where to look).
export function buildPerLocationRows(ds, fobRows, locs, range, opp) {
  const fob = fobByRange(fobRows, range);
  const oppByLoc = {};
  for (const p of (opp?.perStore || [])) oppByLoc[unpad(p.loc)] = p;
  const rows = (locs || []).map(loc => {
    const L = unpad(loc);
    const t = DEFAULT_TARGETS[L] || {};
    const sales = sumSeries(ds, loc, range, 'sales');
    const vsLY = matchedVsLY(ds, [loc], range, 'sales');
    const f = fob[L] || {};
    const o = oppByLoc[L] || {};
    // Recoverable $ normalized to a WEEKLY figure (matches the suggested-actions framing).
    const oppWk = (o.total$ != null && o.days > 0) ? o.total$ * 7 / o.days : (o.total$ ?? null);
    return {
      loc: L,
      netSales: sales.sum || 0,
      salesVsLYPct: vsLY.pct != null ? vsLY.pct * 100 : null,
      fobPct: f.fobPct ?? null,       fobTarget: t.tFOBTarget ?? null,
      laborPct: metricAvg(ds, loc, range, 'laborPct'), laborTarget: t.tLabor ?? null,
      oepe: metricAvg(ds, loc, range, 'oepe'),         oepeTarget: t.tOepe ?? null,
      r2p: metricAvg(ds, loc, range, 'r2p'),           r2pTarget: t.tR2p ?? null,
      oppWk: oppWk,
    };
  });
  // Worst sales-vs-LY first; stores with no vs-LY sink to the bottom.
  return rows.sort((a, b) => (a.salesVsLYPct ?? 1e9) - (b.salesVsLYPct ?? 1e9));
}

// Weekly-Review scorecard actuals that DON'T live in the header current-state grid
// (Notes 35): GC vs LY, Voice OSAT / Accuracy-B2B (monthly SMG FullScale), KVS time,
// and the scope's PROJECTED product sales (the Product-Sales "target"). Kept here — the
// one ds-coupled layer — so weeklyReviewHtml stays presentation-only. Returns fractions
// for %-metrics (valFmt ×100), seconds for KVS, $ for projSales; null when absent.
export function buildReviewActuals(ds, locs, range) {
  const locSet = new Set((locs || []).map(unpad));
  const gcv = matchedVsLY(ds, locs, range, 'gc');   // matched-day current-vs-LY guest counts
  // Voice OSAT / B2B — the most recent month present in smgFullscale for the scope,
  // simple mean across the scope's stores (CSAT %, no natural $ weight).
  const smg = ds?.smgFullscale || [];
  let bestY = 0, bestM = 0, bestKey = -1;
  for (const r of smg) {
    if (!locSet.has(unpad(r.loc)) || !r.year || !r.month) continue;
    const k = r.year * 12 + r.month;
    if (k > bestKey) { bestKey = k; bestY = r.year; bestM = r.month; }
  }
  // Response-count (n) weighted mean of a CSAT % across the scope's stores for the latest month:
  // Σ(pct·n)/Σn — the correct roll-up (never average averages). Falls back to a simple mean only
  // when response counts aren't present (legacy Small-Graph uploads, or pre-migration rows with
  // null n). The FullScale "Combined" row's weighted value is reproduced this way. (Notes 36 #7)
  const meanField = (field) => {
    if (bestKey < 0) return null;
    const rows = smg.filter(r => locSet.has(unpad(r.loc)) && (r.year * 12 + r.month) === bestKey && r[field] != null && !isNaN(r[field]));
    if (!rows.length) return null;
    const weighted = rows.every(r => typeof r.n === 'number' && r.n > 0);
    if (weighted) {
      const num = rows.reduce((s, r) => s + r[field] * r.n, 0);
      const den = rows.reduce((s, r) => s + r.n, 0);
      return den > 0 ? num / den : null;
    }
    return rows.reduce((s, r) => s + r[field], 0) / rows.length;
  };
  // Projected product sales over the window (scope sum) — Product-Sales target.
  let projSales = 0, hasProj = false;
  for (const loc of (locs || [])) { const s = sumSeries(ds, loc, range, 'projSales'); if (s.days) { projSales += s.sum; hasProj = true; } }
  // Scope-average targets from each store's DEFAULT_TARGETS (KVS pace + healthy usage).
  // Read the EFFECTIVE target: the uploaded yearly-targets file lands in ds.targets (e.g. the
  // "Overall Satisfaction B2B" → tOsatB2B), while static DEFAULT_TARGETS only carries the seeded
  // ones (tKvst/tKvsu). Prefer ds.targets so yearly-file targets (OSAT B2B) actually land.
  const tgtAvg = (field) => {
    const vals = (locs || []).map(l => {
      const u = unpad(l);
      const t = (ds && ds.targets && ds.targets[u]) || DEFAULT_TARGETS[u] || {};
      return t[field];
    }).filter(v => v != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };
  return {
    gcVsLY: gcv?.pct ?? null,
    // Voice OSAT = the "5"-rated share only (owner: rated 5 is all that counts), NOT Top-2-Box.
    osat: meanField('osat5'),
    // OSAT B2B = the "1"-rated share (worst box) — lower is better. Replaces the old Accuracy-B2B.
    osatB2B: meanField('osat1'),
    accB2B: meanField('accuracyB2B'),   // kept for any legacy reference
    kvsPerGc: metricAvg(ds, locs, range, 'kvst'),           // KVS Time per GC (seconds)
    kvsHealthy: metricAvg(ds, locs, range, 'kvsHealthy'),   // KVS Healthy Usage (0–1 fraction) — Daily Glimpse
    kvsTimeTarget: tgtAvg('tKvst'),
    kvsHealthyTarget: tgtAvg('tKvsu'),
    osatTarget: tgtAvg('tOsat'),         // "VOICE OSAT PACE" from the yearly-targets file (5★ goal)
    osatB2BTarget: tgtAvg('tOsatB2B'),   // "Overall Satisfaction B2B" from the yearly-targets file
    projSales: hasProj ? projSales : null,
    smgMonth: bestKey >= 0 ? `${bestY}-${String(bestM).padStart(2, '0')}` : null,
  };
}

// Scheduling / VLH band for the Above-Store One-Pager (Notes 47 — the one panel with
// no metric-source key; sourced straight from ds.schedRows / LifeLenz). Reuses the
// reconciled computeScheduleRollup so Scheduled-vs-Forecast hours, Schd TPMH and the
// Fixed/Floor/Combined shares match the Scheduling panel exactly. All ratios-of-
// aggregates — never an average of daily %s. Returns null when the scope has no
// schedule rows in the window (the LifeLenz sync may not cover a past `last-month`).
export function buildScheduleActuals(ds, locs, range) {
  const band = computeScheduleRollup((ds && ds.schedRows) || [], locs, range);
  if (!band) return null;
  return {
    schedHrs: band.schedHrs,
    fcstHrs: band.fcstHrs,
    hrsDiff: band.hrsDiff,                       // + = over-scheduled vs forecast, − = under
    tpmh: band.tpmh,                             // scheduled transactions per man-hour
    fixedPct: band.fixedLaborPct,               // fixed hrs ÷ scheduled hrs (band 10–15%)
    floorPct: band.floorLaborPct,               // floor hrs ÷ scheduled hrs (band 10–15%)
    combinedPct: band.combinedFixedFloorPct,    // (fixed+floor) ÷ scheduled (cap ≤25%)
    nStores: band.nStores,
    // Owner-confirmed standards (echoed so the UI/print can flag in-band vs breach).
    segMin: FIXED_FLOOR_SEG_MIN, segMax: FIXED_FLOOR_SEG_MAX, combinedMax: FIXED_FLOOR_COMBINED_MAX,
  };
}

// Controls loss-prevention OUTLIERS for the Above-Store One-Pager (Notes 47 v2 — the
// "who and when" behind the Controls scope averages). Sourced through metricSeries
// (auto-first per day), NEVER a raw ctrlRows filter, so it obeys the standing data-
// sourcing rule. For each controls metric it returns the scope average + the worst
// individual store-days:
//   cashOSPct — ranked by ABSOLUTE deviation from 0 (a big over AND a big short are both
//               exposure); the signed value is kept so the UI shows over(+)/short(−).
//   tRedAPct / discPct — ranked HIGH (more = worse).
// Returns { <key>: { avg, n, outliers: [{loc, date, val}] } }, up to topN worst days each.
// Days that are clean (0 / non-positive for the "high" metrics) are excluded so the list
// only ever surfaces genuine offenders, not filler.
const CONTROLS_OUTLIER_METRICS = [
  { key: 'cashOSPct', dir: 'abs' },
  { key: 'tRedAPct',  dir: 'high' },
  { key: 'discPct',   dir: 'high' },
];
export function buildControlsOutliers(ds, locs, range, topN = 3) {
  const out = {};
  for (const { key, dir } of CONTROLS_OUTLIER_METRICS) {
    const pts = [];
    for (const loc of (locs || [])) {
      const s = metricSeries(ds, loc, range, key);
      for (const dk in s) pts.push({ loc: unpad(loc), date: dk, val: s[dk] });
    }
    const n = pts.length;
    const avg = n ? pts.reduce((a, p) => a + p.val, 0) / n : null;
    const sev = p => (dir === 'abs' ? Math.abs(p.val) : p.val);
    const outliers = pts
      .filter(p => (dir === 'abs' ? p.val !== 0 : p.val > 0))
      .sort((a, b) => sev(b) - sev(a))
      .slice(0, topN);
    out[key] = { avg, n, outliers };
  }
  return out;
}

// Scope-level headline KPIs for the page header grid (dollar-weighted where it matters).
export function buildCurrentState(ds, fobRows, locs, range) {
  const inputs = buildOnePagerInputs(ds, fobRows, locs, range);
  const totSales = inputs.reduce((s, i) => s + (i.netSales || 0), 0);
  // Canonical FOB% = Σ components ÷ Σ (fob rows' OWN prodSales base) — never the window
  // sales base (that would divide a fob-period numerator by a window denominator and
  // inflate the %, the FL-14.88% class of bug). Sourced straight from fobByRange.
  const fobAgg = Object.values(fobByRange(fobRows, range));
  const totFob$ = fobAgg.reduce((s, a) => s + (a.fob$ || 0), 0);
  const totFobProd = fobAgg.reduce((s, a) => s + (a.prodSales || 0), 0);
  const tgt = (field) => {
    const vals = locs.map(l => (DEFAULT_TARGETS[unpad(l)] || {})[field]).filter(v => v != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };
  return [
    { key: 'sales',    label: 'Product Sales', actual: totSales, target: null, fmt: '$' },
    { key: 'fobPct',   label: 'FOB %',      actual: totFobProd ? totFob$ / totFobProd : null, target: tgt('tFOBTarget'), fmt: '%', lowerBetter: true },
    { key: 'laborPct', label: 'Labor %',    actual: metricAvg(ds, locs, range, 'laborPct'), target: tgt('tLabor'), fmt: '%', lowerBetter: true },
    { key: 'oepe',     label: 'OEPE',       actual: metricAvg(ds, locs, range, 'oepe'), target: tgt('tOepe'), fmt: 's', lowerBetter: true },
    // R2P + OEPE now derive from the cloud-fresh DAR (fc_ / dt_ timings) when a manual
    // Ops Report / Glimpse hasn't landed — so both populate current-day. TPPH derives from DAR hours.
    { key: 'r2p',      label: 'R2P',        actual: metricAvg(ds, locs, range, 'r2p'), target: tgt('tR2p'), fmt: 's', lowerBetter: true },
    { key: 'tpph',     label: 'TPPH',       actual: metricAvg(ds, locs, range, 'tpph'), target: tgt('tTpph'), fmt: 'n' },
  ];
}
