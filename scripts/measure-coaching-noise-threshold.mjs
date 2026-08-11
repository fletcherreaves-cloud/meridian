// ── Measure the coaching-loop "real change" noise threshold (#208) ───────────────────────────────
// #208's own explicit rule: "A verdict that fires on ordinary drift is worse than no verdict... if
// this measurement isn't ready, ship the loop recording cycles WITHOUT verdicts rather than with
// wrong ones." This script is that measurement. READ-ONLY — it reports distributions, it does not
// pick a threshold. A human picks the bar from the printed buckets, the same way the swing alarm's
// -10%/2wk (676 measured store-weeks) and the count-completeness 0.75 (a measured bimodal
// distribution) were picked — memory/feedback-measure-dont-reason.md.
//
// #208 scope is food cost and labor only (v1). For each component below, this pulls the full
// available history per store, builds a daily series, and measures the distribution of 30-DAY
// rolling movements (day N's trailing-30 average vs day N-30's trailing-30 average) — the same
// shape a coaching cycle's before/after comparison will use. Reported separately per component,
// since #208 explicitly expects them to differ ("condiment % is almost certainly tighter than raw
// waste").
//
// Components (all percent-of-sales unless noted):
//   labor_pct        — labor_rows.labor_pct
//   fob_total_pct    — qsr_fob: (comp_waste_amt+raw_waste_amt+condiments_amt+emp_mgr_meals_amt+
//                       stat_variance_amt+unexplained_amt) / prod_sales_amt  — the same 6-component
//                       controllable FOB% the app uses elsewhere (attention-now.js's fobByStoreLatest)
//   condiment_pct    — qsr_fob.condiments_amt / prod_sales_amt
//   raw_waste_pct    — qsr_fob.raw_waste_amt / prod_sales_amt
//   comp_waste_pct   — qsr_fob.comp_waste_amt / prod_sales_amt
//
//   node scripts/measure-coaching-noise-threshold.mjs                 # all 5 components, all 27 stores
//   node scripts/measure-coaching-noise-threshold.mjs --component labor_pct
//   node scripts/measure-coaching-noise-threshold.mjs --min-days 180  # require this much history per store (default 120)
//
// Required env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (labor_rows/qsr_fob are RLS-scoped;
// the anon key this environment has does not see rows — confirmed live, same constraint documented
// in measure-denominator-floors.mjs and measure-retail-impact.mjs).

import { createClient } from '@supabase/supabase-js';

const URL = process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const sb = createClient(URL, KEY, { auth: { persistSession: false } });

const ONLY = (() => { const i = process.argv.indexOf('--component'); return i >= 0 ? process.argv[i + 1] : null; })();
const MIN_DAYS = (() => { const i = process.argv.indexOf('--min-days'); return i >= 0 && process.argv[i + 1] ? +process.argv[i + 1] : 120; })();
const WINDOW = 30; // #208's own "30-day movements" framing

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

// Daily {loc,date,value[,weight]} series -> trailing-30 average at each day N with >=20 real
// obs in its window (avoids a mostly-empty window reading as a real level), then the
// distribution of |trailing30(N) - trailing30(N-30)| across all valid N, per store, pooled
// district-wide at the end (labeled by store too, so a store-specific outlier is visible
// rather than averaged away).
//
// weightKey enables a DOLLAR-WEIGHTED trailing average (Σvalue*weight/Σweight) instead of a
// simple mean of daily ratios — CLAUDE.md's standing rule ("never average averages,
// dollar-weight aggregates"). A daily FOB% is itself a ratio (amt/sales); a simple mean of 30
// such ratios is NOT the same number as Σamt/Σsales for the month, and computeFOBMetrics
// (analytics.js) already establishes dollar-weighting as this app's real convention for FOB%
// — the coaching-loop engine (engine/coaching-loop.js) reads FOB baselines/results the same
// way, so this script must measure movements of the SAME quantity the verdict will apply to,
// or the threshold would not mean what it claims to. labor_pct has no weightKey — it stays a
// simple mean, matching metric-source.js's metricAvg(), which is what every other Labor Tools
// panel already shows for a period's labor%; a coaching baseline should read the same number
// the owner sees everywhere else, not a more "correct" but different one nobody else displays.
function rollingMovements(rows, valueKey, dateKey = 'date', locKey = 'loc', weightKey = null) {
  const byLoc = {};
  for (const r of rows) {
    const v = r[valueKey];
    if (v == null || !Number.isFinite(+v)) continue;
    const w = weightKey ? +r[weightKey] || 0 : 1;
    const loc = String(r[locKey]);
    (byLoc[loc] = byLoc[loc] || []).push({ date: r[dateKey], value: +v, weight: w });
  }
  const moves = []; // {loc, date, delta} — delta in PERCENTAGE POINTS if value is a fraction
  for (const [loc, series] of Object.entries(byLoc)) {
    series.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
    if (series.length < MIN_DAYS) continue;
    const trailing30 = (endIdx) => {
      const start = Math.max(0, endIdx - WINDOW + 1);
      const slice = series.slice(start, endIdx + 1);
      if (slice.length < 20) return null;
      if (!weightKey) return slice.reduce((a, r) => a + r.value, 0) / slice.length;
      const wSum = slice.reduce((a, r) => a + r.weight, 0);
      return wSum > 0 ? slice.reduce((a, r) => a + r.value * r.weight, 0) / wSum : null;
    };
    for (let i = WINDOW * 2; i < series.length; i++) {
      const now = trailing30(i);
      const then = trailing30(i - WINDOW);
      if (now == null || then == null) continue;
      moves.push({ loc, date: series[i].date, delta: (now - then) });
    }
  }
  return moves;
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function report(label, unit, moves) {
  if (!moves.length) { console.log(`${label}: no store had ${MIN_DAYS}+ days of coverage — nothing measured.`); return; }
  const abs = moves.map(m => Math.abs(m.delta)).sort((a, b) => a - b);
  const stores = new Set(moves.map(m => m.loc)).size;
  const scale = unit === 'pp' ? 100 : 1;
  console.log(`\n── ${label} (${unit === 'pp' ? 'percentage points' : unit}) ──────────────────────────`);
  console.log(`  ${moves.length} 30-day movements across ${stores} stores`);
  for (const p of [0.50, 0.75, 0.90, 0.95, 0.99]) {
    console.log(`  p${Math.round(p * 100)}: ${(percentile(abs, p) * scale).toFixed(3)}${unit === 'pp' ? 'pp' : ''}`);
  }
  const mean = abs.reduce((a, b) => a + b, 0) / abs.length;
  console.log(`  mean |delta|: ${(mean * scale).toFixed(3)}${unit === 'pp' ? 'pp' : ''}`);
}

const laborRows = await fetchAllPaged('labor_rows', 'loc,report_date,labor_pct');
const fobRows = await fetchAllPaged('qsr_fob', 'loc,date,prod_sales_amt,comp_waste_amt,raw_waste_amt,condiments_amt,emp_mgr_meals_amt,stat_variance_amt,unexplained_amt');

// Each FOB row carries its own prod_sales_amt as `weight` — dollar-weighting needs the
// per-day denominator alongside the per-day ratio, not just the ratio.
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

const COMPONENTS = {
  labor_pct: { rows: laborRows, key: 'labor_pct', dateKey: 'report_date', unit: 'pp', weightKey: null },
  fob_total_pct: { rows: fobTotalPct, key: 'pct', dateKey: 'date', unit: 'pp', weightKey: 'weight' },
  condiment_pct: { rows: fobWithPct('condiments_amt'), key: 'pct', dateKey: 'date', unit: 'pp', weightKey: 'weight' },
  raw_waste_pct: { rows: fobWithPct('raw_waste_amt'), key: 'pct', dateKey: 'date', unit: 'pp', weightKey: 'weight' },
  comp_waste_pct: { rows: fobWithPct('comp_waste_amt'), key: 'pct', dateKey: 'date', unit: 'pp', weightKey: 'weight' },
};

for (const [name, cfg] of Object.entries(COMPONENTS)) {
  if (ONLY && ONLY !== name) continue;
  const moves = rollingMovements(cfg.rows, cfg.key, cfg.dateKey, 'loc', cfg.weightKey);
  report(name, cfg.unit, moves);
}

console.log('\nThis is a READ-ONLY measurement — it does not choose a threshold. Pick the "real change"');
console.log('bar per component from the buckets above (e.g. p90 or p95 of ordinary drift), the same');
console.log('way the swing alarm and count-completeness thresholds were picked, and state the chosen');
console.log('number + the measurement it came from in the coaching-loop verdict code\'s own comment.');
