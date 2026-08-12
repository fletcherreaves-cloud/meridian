// ── Measure district-relative movement noise — the gate on turning coaching verdicts on (#237) ──
// READ-ONLY. Prints distributions, does NOT choose a threshold. #237's own framing: the owner's
// target coaching improvement is 0.25-0.50pp; measure-coaching-noise-threshold.mjs (the prior run)
// found labor_pct's median ordinary 30-day drift is 0.841pp and fob_total_pct's p75 is 0.416pp —
// BOTH target sizes sit inside that noise band. This script tests the hypothesis that most of that
// movement is district-wide (commodity, promo, weather, seasonality) and differencing it out leaves
// a materially tighter residual. It may fail — a negative result (residual not much tighter) is
// exactly as valid an outcome and must be reported plainly, not massaged into a threshold.
//
// For each component, each store, each day N with a valid trailing-30 window:
//   store_delta(N)    = trailing30_store(N)    - trailing30_store(N-30)
//   district_delta(N) = trailing30_district(N) - trailing30_district(N-30)
//   residual(N)       = store_delta(N) - district_delta(N)
//
// Four things the issue named as silent corruptors if missed, all handled below:
//   1. Dollar-weight the district aggregate (Sigma $ / Sigma sales$), never average 27 percentages
//      — for EVERY component, including labor_pct, even though labor_pct's STORE-side number stays
//      a simple mean (matching metric-source.js's metricAvg() and measure-coaching-noise-threshold's
//      own convention for what the owner sees elsewhere). The district side is a different question
//      ("what did the market do") and must be weighted regardless of how the store side is displayed.
//   2. Leave-one-out: the store being measured is excluded from its own district aggregate.
//   3. Same day universe: the district delta for a given store/window is computed over the EXACT
//      calendar dates in that store's own trailing-30 window (not a district trailing-30-by-index
//      that happens to end on the same date) — same family as the aligned-but-not hazard flagged in
//      memory/project-events-redesign.md.
//   4. The >=20-observations-per-window guard applies to the district aggregate too, counted as
//      total (other-store, day) pairs with a valid value within that window's date set.
//
//   node scripts/measure-district-relative-noise.mjs
//   node scripts/measure-district-relative-noise.mjs --component labor_pct
//   node scripts/measure-district-relative-noise.mjs --min-days 180
//
// Required env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (same RLS constraint as
// measure-coaching-noise-threshold.mjs — the anon key sees zero rows on labor_rows/qsr_fob).

import { createClient } from '@supabase/supabase-js';

const URL = process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const sb = createClient(URL, KEY, { auth: { persistSession: false } });

const ONLY = (() => { const i = process.argv.indexOf('--component'); return i >= 0 ? process.argv[i + 1] : null; })();
const MIN_DAYS = (() => { const i = process.argv.indexOf('--min-days'); return i >= 0 && process.argv[i + 1] ? +process.argv[i + 1] : 120; })();
const WINDOW = 30; // matches measure-coaching-noise-threshold.mjs's "30-day movements" framing
const MIN_WINDOW_OBS = 20; // the standing guard, applied to BOTH the store side and the district side

async function fetchAllPaged(table, select) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select(select).order(table === 'labor_rows' ? 'report_date' : 'date').range(from, from + 999);
    if (error) { console.error(`${table} read error:`, error.message); process.exit(1); }
    if (!data || !data.length) break;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

// Builds: byLoc (loc -> sorted [{date,value,weight}]) for the store side, and byDate
// (date -> [{loc,value,weight}], weight-valid entries only) for the leave-one-out district side.
function indexRows(rows, valueKey, dateKey, locKey, weightKey) {
  const byLoc = {};
  const byDate = new Map();
  for (const r of rows) {
    const v = r[valueKey];
    if (v == null || !Number.isFinite(+v)) continue;
    const loc = String(r[locKey]);
    const date = r[dateKey];
    const wRaw = weightKey ? +r[weightKey] : null;
    const w = wRaw != null && Number.isFinite(wRaw) ? wRaw : null;
    (byLoc[loc] = byLoc[loc] || []).push({ date, value: +v, weight: w });
    if (w != null && w > 0) {
      if (!byDate.has(date)) byDate.set(date, []);
      byDate.get(date).push({ loc, value: +v, weight: w });
    }
  }
  for (const series of Object.values(byLoc)) series.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  return { byLoc, byDate };
}

// Store-side trailing-30: index-based window over the store's OWN pruned series (only its real
// observation dates), matching measure-coaching-noise-threshold.mjs's trailing30() exactly, but
// also returns the window's calendar dates so the district side can be aligned to them (guard #3).
function trailing30WithDates(series, endIdx, storeWeighted) {
  const start = Math.max(0, endIdx - WINDOW + 1);
  const slice = series.slice(start, endIdx + 1);
  if (slice.length < MIN_WINDOW_OBS) return null;
  let value;
  if (!storeWeighted) {
    value = slice.reduce((a, r) => a + r.value, 0) / slice.length;
  } else {
    const wSum = slice.reduce((a, r) => a + (r.weight || 0), 0);
    value = wSum > 0 ? slice.reduce((a, r) => a + r.value * (r.weight || 0), 0) / wSum : null;
  }
  if (value == null) return null;
  return { value, dates: slice.map(r => r.date) };
}

// District side: dollar-weighted mean over the EXACT date set passed in, excluding `excludeLoc`
// (leave-one-out), pooled across every OTHER store that has a valid weighted observation on each
// of those dates. Requires >=MIN_WINDOW_OBS total (other-store, day) pairs (guard #4).
function districtWeightedAvg(dates, excludeLoc, byDate) {
  let sumVW = 0, sumW = 0, count = 0;
  for (const d of dates) {
    const entries = byDate.get(d);
    if (!entries) continue;
    for (const e of entries) {
      if (e.loc === excludeLoc) continue;
      sumVW += e.value * e.weight;
      sumW += e.weight;
      count++;
    }
  }
  if (count < MIN_WINDOW_OBS || sumW <= 0) return null;
  return sumVW / sumW;
}

// Returns [{loc, date, storeDelta, districtDelta, residual}]
function districtRelativeMovements(rows, valueKey, dateKey, locKey, storeWeightKey, districtWeightKey) {
  const { byLoc, byDate } = indexRows(rows, valueKey, dateKey, locKey, districtWeightKey);
  const out = [];
  for (const [loc, series] of Object.entries(byLoc)) {
    if (series.length < MIN_DAYS) continue;
    for (let i = WINDOW * 2; i < series.length; i++) {
      const now = trailing30WithDates(series, i, !!storeWeightKey);
      const then = trailing30WithDates(series, i - WINDOW, !!storeWeightKey);
      if (!now || !then) continue;
      const storeDelta = now.value - then.value;
      const districtNow = districtWeightedAvg(now.dates, loc, byDate);
      const districtThen = districtWeightedAvg(then.dates, loc, byDate);
      if (districtNow == null || districtThen == null) continue;
      const districtDelta = districtNow - districtThen;
      out.push({ loc, date: series[i].date, storeDelta, districtDelta, residual: storeDelta - districtDelta });
    }
  }
  return out;
}

function reportSideBySide(label, unit, moves) {
  if (!moves.length) { console.log(`\n${label}: 0 (store,day) pairs survived all guards — nothing measured.`); return; }
  const scale = unit === 'pp' ? 100 : 1;
  const rawAbs = moves.map(m => Math.abs(m.storeDelta)).sort((a, b) => a - b);
  const residAbs = moves.map(m => Math.abs(m.residual)).sort((a, b) => a - b);
  const stores = new Set(moves.map(m => m.loc)).size;
  console.log(`\n== ${label} (${unit}) ==================================================`);
  console.log(`  ${moves.length} (store,day) pairs surviving all guards, ${stores} stores`);
  console.log(`  ${'pct'.padEnd(6)} ${'raw |store_delta|'.padStart(20)} ${'|residual|'.padStart(14)}`);
  const p95Raw = percentile(rawAbs, 0.95), p95Resid = percentile(residAbs, 0.95);
  for (const p of [0.50, 0.75, 0.90, 0.95, 0.99]) {
    const r = percentile(rawAbs, p) * scale, s = percentile(residAbs, p) * scale;
    console.log(`  p${String(Math.round(p * 100)).padEnd(3)} ${(r.toFixed(3) + unit).padStart(20)} ${(s.toFixed(3) + unit).padStart(14)}`);
  }
  const meanRaw = rawAbs.reduce((a, b) => a + b, 0) / rawAbs.length * scale;
  const meanResid = residAbs.reduce((a, b) => a + b, 0) / residAbs.length * scale;
  console.log(`  mean  ${(meanRaw.toFixed(3) + unit).padStart(20)} ${(meanResid.toFixed(3) + unit).padStart(14)}`);
  const reduction = (p95Resid && p95Resid > 0) ? p95Raw / p95Resid : null;
  console.log(`  REDUCTION FACTOR (raw p95 / residual p95): ${reduction != null ? reduction.toFixed(2) + 'x' : 'n/a'}`);

  // Per-store dispersion — a wild store is a data problem to name, not a threshold to raise.
  const byStore = {};
  for (const m of moves) (byStore[m.loc] = byStore[m.loc] || []).push(Math.abs(m.residual));
  const storeStats = Object.entries(byStore).map(([loc, arr]) => {
    const sorted = arr.slice().sort((a, b) => a - b);
    return { loc, n: arr.length, p90: percentile(sorted, 0.90) * scale };
  }).sort((a, b) => b.p90 - a.p90);
  console.log(`  per-store |residual| p90, worst 5 of ${storeStats.length}:`);
  for (const s of storeStats.slice(0, 5)) console.log(`    ${s.loc.padEnd(8)} n=${String(s.n).padEnd(4)} p90=${s.p90.toFixed(3)}${unit}`);
  console.log(`  per-store |residual| p90, best 5:`);
  for (const s of storeStats.slice(-5).reverse()) console.log(`    ${s.loc.padEnd(8)} n=${String(s.n).padEnd(4)} p90=${s.p90.toFixed(3)}${unit}`);
}

const laborRows = await fetchAllPaged('labor_rows', 'loc,report_date,labor_pct,sales');
const fobRows = await fetchAllPaged('qsr_fob', 'loc,date,prod_sales_amt,comp_waste_amt,raw_waste_amt,condiments_amt,emp_mgr_meals_amt,stat_variance_amt,unexplained_amt');

const fobWithPct = (field) => fobRows
  .filter(r => r.prod_sales_amt > 0)
  .map(r => ({ loc: r.loc, date: r.date, pct: (r[field] || 0) / r.prod_sales_amt, weight: r.prod_sales_amt }));

const fobTotalPct = fobRows
  .filter(r => r.prod_sales_amt > 0)
  .map(r => ({
    loc: r.loc, date: r.date,
    pct: ((r.comp_waste_amt || 0) + (r.raw_waste_amt || 0) + (r.condiments_amt || 0) +
      (r.emp_mgr_meals_amt || 0) + (r.stat_variance_amt || 0) + (r.unexplained_amt || 0)) / r.prod_sales_amt,
    weight: r.prod_sales_amt,
  }));

const laborWithWeight = laborRows
  .filter(r => r.sales > 0)
  .map(r => ({ loc: r.loc, date: r.report_date, labor_pct: r.labor_pct, weight: r.sales }));

// storeWeightKey: null keeps the STORE side a simple mean (matches metric-source.js's metricAvg()
// and the prior script's own convention for labor). districtWeightKey is 'weight' for EVERY
// component without exception — the district aggregate is always dollar-weighted per the issue.
const COMPONENTS = {
  labor_pct: { rows: laborWithWeight, key: 'labor_pct', dateKey: 'date', unit: 'pp', storeWeightKey: null, districtWeightKey: 'weight' },
  fob_total_pct: { rows: fobTotalPct, key: 'pct', dateKey: 'date', unit: 'pp', storeWeightKey: 'weight', districtWeightKey: 'weight' },
  condiment_pct: { rows: fobWithPct('condiments_amt'), key: 'pct', dateKey: 'date', unit: 'pp', storeWeightKey: 'weight', districtWeightKey: 'weight' },
  raw_waste_pct: { rows: fobWithPct('raw_waste_amt'), key: 'pct', dateKey: 'date', unit: 'pp', storeWeightKey: 'weight', districtWeightKey: 'weight' },
  comp_waste_pct: { rows: fobWithPct('comp_waste_amt'), key: 'pct', dateKey: 'date', unit: 'pp', storeWeightKey: 'weight', districtWeightKey: 'weight' },
};

for (const [name, cfg] of Object.entries(COMPONENTS)) {
  if (ONLY && ONLY !== name) continue;
  const moves = districtRelativeMovements(cfg.rows, cfg.key, cfg.dateKey, 'loc', cfg.storeWeightKey, cfg.districtWeightKey);
  reportSideBySide(name, cfg.unit, moves);
}

console.log('\nThis is a READ-ONLY measurement — it does not choose a threshold. If the residual is not');
console.log('much tighter than raw |store_delta|, district-wide drift is NOT the dominant noise source');
console.log('and a different approach is needed (longer windows, or confidence-based verdicts) — report');
console.log('that outcome plainly rather than picking a threshold that papers over it. labor_pct\'s result');
console.log('is untrustworthy until #236 (tail contamination) closes, but is included here for comparison.');
