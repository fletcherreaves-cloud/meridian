// ── Measure the Patch Heatmap's per-dimension bands (#219) ───────────────────────────────────
// First production look: 18 critical / 8 watch / 1 clean — 26 of 27 flagged, the same day the
// dashboard reports 25 of 27 at trusted health and all 27 locks complete. Those can't both be
// true. patch-heatmap.js's bandFromGap(gap, badAt) constants (Sales 15%, FOB 3pp, Labor 3pp,
// Speed 20%) were CHOSEN, not derived. This script is the derivation — READ-ONLY, it reports
// distributions, it does not pick a threshold. A human (or a future session with real data)
// picks the bar from the printed percentiles, the same way the swing alarm's -10%/2wk (676
// measured store-weeks) and count-cycle's COVER_FRAC=0.75 (a measured bimodal distribution)
// were picked, not "20% sounds bad" — memory/feedback-measure-dont-reason.md.
//
// Covers 4 of the panel's 5 dimensions — Sales, FOB, Labor, Speed — each with a direct
// raw-table gap-to-target definition. Controls (ctrlScore) is deliberately OUT of scope here:
// it's a composite score computeOpsScore builds from several inputs (labor/OEPE/KVS/park), not
// a column any table carries, so measuring its distribution needs in-app instrumentation
// (logging the live-computed score over time), not a standalone SQL script — flagged, not
// guessed at.
//
// For each dimension this prints:
//   - the percentile spread of gap-to-target across every (store, day) with real data
//   - what fraction of (store, day)s are already "watch" (band<80) / "critical" (band<50)
//     under patch-heatmap.js's CURRENT badAt constant — the actual reproduction of the
//     26-of-27 production finding, per dimension
//   - candidate badAt values anchored to p75/p90/p95 of the OVER-target gap distribution
// Then estimates the compounding effect the issue flagged: assuming the 4 measured dimensions
// were independent (they are not, but it is the right sanity check), what clean rate would
// worst-of-4 produce at the CURRENT badAt vs each candidate — to show directly whether
// "26 of 27 flagged" is explained by tight per-dimension cuts compounding, not a single
// broken dimension.
//
//   node scripts/measure-patch-heatmap-bands.mjs                # all 4 dimensions
//   node scripts/measure-patch-heatmap-bands.mjs --dimension fob
//   node scripts/measure-patch-heatmap-bands.mjs --days 90       # lookback window (default 90)
//
// Required env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (labor_rows/qsr_fob/
// qsr_daily_activity_rollup are RLS-scoped; the anon key this environment has does not see
// rows — confirmed live, same constraint documented in measure-denominator-floors.mjs,
// measure-retail-impact.mjs, and measure-coaching-noise-threshold.mjs).

import { createClient } from '@supabase/supabase-js';
import { DEFAULT_TARGETS } from '../src/constants.js';
import { resolveLaborTarget } from '../src/engine/labor-basis.js';
import { oepeSeconds } from '../src/utils/oepe.js';

const URL = process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const sb = createClient(URL, KEY, { auth: { persistSession: false } });

const ONLY = (() => { const i = process.argv.indexOf('--dimension'); return i >= 0 ? process.argv[i + 1] : null; })();
const DAYS = (() => { const i = process.argv.indexOf('--days'); return i >= 0 && process.argv[i + 1] ? +process.argv[i + 1] : 90; })();
const CUTOFF = new Date(Date.now() - DAYS * 86400000).toISOString().slice(0, 10);

// Matches patch-heatmap.js's own bandFromGap exactly — the CURRENT production formula.
function bandFromGap(gap, badAt) {
  if (gap == null || !(badAt > 0)) return null;
  return Math.max(0, Math.min(100, 100 * (1 - Math.max(0, gap) / badAt)));
}

async function fetchAllPaged(table, select, dateCol) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select(select).gte(dateCol, CUTOFF).order(dateCol).range(from, from + 999);
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

// gaps: [{loc, gap}] — gap in the SAME unit patch-heatmap.js's badAt is defined in (pp or %).
// Prints the full spread, the current-badAt flag rate, and p75/p90/p95-anchored candidates.
function report(label, unit, gaps, currentBadAt) {
  if (!gaps.length) { console.log(`\n${label}: no store-days with real data in the last ${DAYS} days — nothing measured.`); return { flagWatch: null, flagCrit: null }; }
  const all = gaps.map(g => g.gap).sort((a, b) => a - b);
  const over = all.filter(g => g > 0).sort((a, b) => a - b); // only the "worse than target" side
  const stores = new Set(gaps.map(g => g.loc)).size;
  console.log(`\n── ${label} (${unit}) ──────────────────────────`);
  console.log(`  ${gaps.length} store-days across ${stores} stores (last ${DAYS}d) · ${over.length} over target (${(over.length / gaps.length * 100).toFixed(0)}%)`);
  console.log(`  full spread — p10: ${percentile(all, 0.10)?.toFixed(2)} · p50: ${percentile(all, 0.50)?.toFixed(2)} · p90: ${percentile(all, 0.90)?.toFixed(2)}`);
  if (over.length) {
    console.log(`  over-target spread — p50: ${percentile(over, 0.50).toFixed(2)} · p75: ${percentile(over, 0.75).toFixed(2)} · p90: ${percentile(over, 0.90).toFixed(2)} · p95: ${percentile(over, 0.95).toFixed(2)}`);
  }
  const bands = all.map(g => bandFromGap(g, currentBadAt));
  const flagWatch = bands.filter(b => b < 80).length / bands.length;
  const flagCrit = bands.filter(b => b < 50).length / bands.length;
  console.log(`  CURRENT badAt=${currentBadAt}: ${(flagWatch * 100).toFixed(0)}% of store-days are watch-or-worse, ${(flagCrit * 100).toFixed(0)}% critical`);
  if (over.length) {
    console.log(`  candidate badAt anchored to over-target p75/p90/p95: ${percentile(over, 0.75).toFixed(1)} / ${percentile(over, 0.90).toFixed(1)} / ${percentile(over, 0.95).toFixed(1)}`);
  }
  return { flagWatch, flagCrit };
}

// ── Sales — gap = -(pct vs LY), matching bandFromGap(-pct, 15) in patch-heatmap.js ──────────
async function measureSales() {
  const rows = await fetchAllPaged('qsr_daily_activity_rollup', 'loc,dt,product_sales,ly_product_sales', 'dt');
  const gaps = rows
    .filter(r => r.product_sales > 0 && r.ly_product_sales > 0)
    .map(r => ({ loc: String(r.loc), gap: -((r.product_sales - r.ly_product_sales) / r.ly_product_sales * 100) }));
  return report('Sales (vs LY)', '%', gaps, 15);
}

// ── FOB — gap = (fobPct - target) * 100, matching bandFromGap(overPp, 3) ────────────────────
async function measureFob() {
  const rows = await fetchAllPaged('qsr_fob', 'loc,date,prod_sales_amt,comp_waste_amt,raw_waste_amt,condiments_amt,emp_mgr_meals_amt,stat_variance_amt,unexplained_amt', 'date');
  const gaps = rows
    .filter(r => r.prod_sales_amt > 0)
    .map(r => {
      const loc = String(parseInt(r.loc, 10));
      const tgt = DEFAULT_TARGETS[loc];
      if (!tgt || tgt.tFOBTarget == null) return null;
      const fobPct = ((r.comp_waste_amt || 0) + (r.raw_waste_amt || 0) + (r.condiments_amt || 0) +
        (r.emp_mgr_meals_amt || 0) + (r.stat_variance_amt || 0) + (r.unexplained_amt || 0)) / r.prod_sales_amt;
      return { loc, gap: (fobPct - tgt.tFOBTarget) * 100 };
    }).filter(Boolean);
  return report('FOB (vs target)', 'pp', gaps, 3);
}

// ── Labor — gap = (labor_pct - resolveLaborTarget) * 100, matching bandFromGap(overPp, 3) ───
async function measureLabor() {
  const rows = await fetchAllPaged('labor_rows', 'loc,report_date,labor_pct', 'report_date');
  const gaps = rows
    .filter(r => r.labor_pct > 0)
    .map(r => {
      const loc = String(parseInt(r.loc, 10));
      const tgt = DEFAULT_TARGETS[loc];
      const laborTarget = tgt ? resolveLaborTarget(tgt) : null;
      if (!laborTarget) return null;
      return { loc, gap: (r.labor_pct - laborTarget) * 100 };
    }).filter(Boolean);
  return report('Labor (vs target)', 'pp', gaps, 3);
}

// ── Speed (OEPE) — gap = (oepe - target)/target * 100, matching bandFromGap(overPct, 20) ────
async function measureSpeed() {
  const rows = await fetchAllPaged('qsr_daily_activity_rollup', 'loc,dt,dt_untilserve,dt_untilstore,dt_heldtime,dt_trans_cnt', 'dt');
  const gaps = rows
    .filter(r => r.dt_trans_cnt > 0)
    .map(r => {
      const loc = String(parseInt(r.loc, 10));
      const tgt = DEFAULT_TARGETS[loc];
      if (!tgt || !(tgt.tOepe > 0)) return null;
      const oepe = oepeSeconds({ dt_untilserve: r.dt_untilserve, dt_untilstore: r.dt_untilstore, dt_heldtime: r.dt_heldtime, dt_trans_cnt: r.dt_trans_cnt });
      if (oepe == null) return null;
      return { loc, gap: (oepe - tgt.tOepe) / tgt.tOepe * 100 };
    }).filter(Boolean);
  return report('Speed / OEPE (vs target)', '%', gaps, 20);
}

const DIMENSIONS = { sales: measureSales, fob: measureFob, labor: measureLabor, speed: measureSpeed };

const results = {};
for (const [name, fn] of Object.entries(DIMENSIONS)) {
  if (ONLY && ONLY !== name) continue;
  results[name] = await fn();
}

const withData = Object.values(results).filter(r => r && r.flagWatch != null);
if (withData.length > 1) {
  console.log(`\n── Compounding check (worst-of-${withData.length}, assuming independence — the real min() is not independent, this is a sanity bound) ──`);
  const cleanRateWatch = withData.reduce((a, r) => a * (1 - r.flagWatch), 1);
  const cleanRateCrit = withData.reduce((a, r) => a * (1 - r.flagCrit), 1);
  console.log(`  Est. district-wide "all dimensions >= watch" rate at CURRENT badAt: ${(cleanRateWatch * 100).toFixed(0)}% of store-days`);
  console.log(`  Est. district-wide "all dimensions >= critical-safe" rate: ${(cleanRateCrit * 100).toFixed(0)}% of store-days`);
  console.log('  Compare against the production observation: 1 of 27 (3.7%) clean. If this estimate lands');
  console.log('  near that, the current badAt values explain the 26-of-27 finding on their own — the fix is');
  console.log('  moving each badAt to its own p90/p95 candidate above, not touching the worst-of-N logic.');
}

console.log('\nThis is a READ-ONLY measurement — it does not choose a threshold. Pick each badAt from the');
console.log('over-target percentiles above (p90 or p95, matching this repo\'s existing convention), update');
console.log('the constant in patch-heatmap.js\'s storeDimensions(), and state the chosen number + this');
console.log('measurement in the code comment, the same way COVER_FRAC (#209) and the swing alarm cite theirs.');
