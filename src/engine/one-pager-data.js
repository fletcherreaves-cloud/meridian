// @ts-nocheck
// ── One-Pager data adapter (ds → engine inputs) ───────────────────────────────
// The ONLY ds/stream-coupled layer of the One-Pager. Maps the live dataset +
// qsr_fob rows into the normalized per-store inputs the pure engines consume
// (opportunity.js / one-pager.js). Sources metrics through the shared resolvers
// (metric-source auto-first, DEFAULT_TARGETS) and uses the dashboard's canonical
// dollar-weighted FOB% (Σ components ÷ Σ prodSales) — never a re-derived formula.
import { metricSeries, metricAvg } from './metric-source.js';
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
export function fobByRange(fobRows, range) {
  const acc = {};
  for (const r of (fobRows || [])) {
    if (!inRange(r.date, range)) continue;
    const loc = unpad(r.loc);
    const a = acc[loc] || (acc[loc] = { prodSales: 0, fob$: 0 });
    a.prodSales += r.prodSalesAmt || 0;
    a.fob$ += (r.compWasteAmt || 0) + (r.rawWasteAmt || 0) + (r.condimentsAmt || 0)
            + (r.empMgrMealsAmt || 0) + (r.statVarianceAmt || 0) + (r.unexplainedAmt || 0);
  }
  for (const loc in acc) { const a = acc[loc]; a.fobPct = a.prodSales ? a.fob$ / a.prodSales : null; }
  return acc;
}

// Per-store inputs for computeOpportunity(). `range` = { s, e } ISO date strings.
export function buildOnePagerInputs(ds, fobRows, locs, range) {
  const fob = fobByRange(fobRows, range);
  return (locs || []).map(loc => {
    const L = unpad(loc);
    const t = DEFAULT_TARGETS[L] || {};
    const sales = sumSeries(ds, loc, range, 'sales');
    const gc = sumSeries(ds, loc, range, 'gc');
    const f = fob[L] || {};
    const days = sales.days || gc.days || 0;
    const netSales = sales.sum || f.prodSales || 0;
    const prodSales = f.prodSales || netSales;
    return {
      loc: L,
      netSales,
      prodSales,
      days,
      avgCheck: gc.sum ? netSales / gc.sum : (t.tAvgCheck ?? null),
      laborPctActual: metricAvg(ds, loc, range, 'laborPct'),
      laborPctTarget: t.tLabor ?? null,
      fobPctActual: f.fobPct ?? null,
      fobPctTarget: t.tFOBTarget ?? null,
      gcPerDayActual: days ? gc.sum / days : null,
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

// Scope-level headline KPIs for the page header grid (dollar-weighted where it matters).
export function buildCurrentState(ds, fobRows, locs, range) {
  const inputs = buildOnePagerInputs(ds, fobRows, locs, range);
  const totSales = inputs.reduce((s, i) => s + (i.netSales || 0), 0);
  const totProd = inputs.reduce((s, i) => s + (i.prodSales || 0), 0);
  const totFob$ = Object.values(fobByRange(fobRows, range)).reduce((s, a) => s + (a.fob$ || 0), 0);
  const tgt = (field) => {
    const vals = locs.map(l => (DEFAULT_TARGETS[unpad(l)] || {})[field]).filter(v => v != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };
  return [
    { key: 'sales',    label: 'Net Sales',  actual: totSales, target: null, fmt: '$' },
    { key: 'fobPct',   label: 'FOB %',      actual: totProd ? totFob$ / totProd : null, target: tgt('tFOBTarget'), fmt: '%', lowerBetter: true },
    { key: 'laborPct', label: 'Labor %',    actual: metricAvg(ds, locs, range, 'laborPct'), target: tgt('tLabor'), fmt: '%', lowerBetter: true },
    { key: 'oepe',     label: 'OEPE',       actual: metricAvg(ds, locs, range, 'oepe'), target: tgt('tOepe'), fmt: 's', lowerBetter: true },
    { key: 'r2p',      label: 'R2P',        actual: metricAvg(ds, locs, range, 'r2p'), target: tgt('tR2p'), fmt: 's', lowerBetter: true },
    { key: 'tpph',     label: 'TPPH',       actual: metricAvg(ds, locs, range, 'tpph'), target: tgt('tTpph'), fmt: 'n' },
  ];
}
