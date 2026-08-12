// ── Dump the worst labor_pct 30-day movements, with underlying rows (#236) ──────────────────────
// #236's own explicit instruction: "find the actual rows first... Do not aggregate — print the
// rows." This forks measure-coaching-noise-threshold.mjs's labor_pct windowing EXACTLY (same
// series construction, same trailing30(), same >=20-observation guard, same MIN_DAYS=120 default)
// so the outliers it prints are the same population p95/p99 in that script's report are drawn
// from — then, for each of the top-N |delta| movements, prints both window endpoints, the two
// trailing-30 values, each window's observation COUNT (checking whether the >=20 guard is
// actually thin-window-proof, per the issue's explicit doubt), and every individual labor_rows
// row inside both windows so a human can see whether a handful of extreme daily values (not a
// thin window) are dragging the 30-day average.
//
//   node scripts/dump-labor-movement-outliers.mjs                  # top 50
//   node scripts/dump-labor-movement-outliers.mjs --top 100
//   node scripts/dump-labor-movement-outliers.mjs --min-days 180
//
// Required env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from '@supabase/supabase-js';

const URL = process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const sb = createClient(URL, KEY, { auth: { persistSession: false } });

const TOP = (() => { const i = process.argv.indexOf('--top'); return i >= 0 && process.argv[i + 1] ? +process.argv[i + 1] : 50; })();
const MIN_DAYS = (() => { const i = process.argv.indexOf('--min-days'); return i >= 0 && process.argv[i + 1] ? +process.argv[i + 1] : 120; })();
const WINDOW = 30;

async function fetchAllPaged(table, select) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select(select).order('report_date').range(from, from + 999);
    if (error) { console.error(`${table} read error:`, error.message); process.exit(1); }
    if (!data || !data.length) break;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

const rows = await fetchAllPaged('labor_rows', 'loc,report_date,labor_pct,sales,tpph,ot_hrs,ot_dollar,uploaded_at');

const byLoc = {};
for (const r of rows) {
  if (r.labor_pct == null || !Number.isFinite(+r.labor_pct)) continue;
  (byLoc[r.loc] = byLoc[r.loc] || []).push(r);
}
for (const series of Object.values(byLoc)) series.sort((a, b) => a.report_date < b.report_date ? -1 : a.report_date > b.report_date ? 1 : 0);

const trailing30 = (series, endIdx) => {
  const start = Math.max(0, endIdx - WINDOW + 1);
  const slice = series.slice(start, endIdx + 1);
  if (slice.length < 20) return null;
  return { value: slice.reduce((a, r) => a + (+r.labor_pct), 0) / slice.length, slice };
};

const outliers = [];
for (const [loc, series] of Object.entries(byLoc)) {
  if (series.length < MIN_DAYS) continue;
  for (let i = WINDOW * 2; i < series.length; i++) {
    const now = trailing30(series, i);
    const then = trailing30(series, i - WINDOW);
    if (!now || !then) continue;
    outliers.push({
      loc, date: series[i].report_date,
      nowValue: now.value, nowSlice: now.slice, nowN: now.slice.length,
      thenDate: series[i - WINDOW].report_date, thenValue: then.value, thenSlice: then.slice, thenN: then.slice.length,
      delta: now.value - then.value,
    });
  }
}
outliers.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

console.log(`${outliers.length} total labor_pct 30-day movements measured across ${Object.keys(byLoc).length} stores (min ${MIN_DAYS} days history).`);
console.log(`\n== Top ${TOP} movements by |delta| ==================================================\n`);

function fmtPct(v) { return (v * 100).toFixed(2) + '%'; }

const storeCounts = {};
const dateCounts = {};

for (const o of outliers.slice(0, TOP)) {
  storeCounts[o.loc] = (storeCounts[o.loc] || 0) + 1;
  dateCounts[o.date] = (dateCounts[o.date] || 0) + 1;
  console.log(`loc ${o.loc}  |delta|=${(Math.abs(o.delta) * 100).toFixed(2)}pp  now(${o.date}, n=${o.nowN})=${fmtPct(o.nowValue)}  then(${o.thenDate}, n=${o.thenN})=${fmtPct(o.thenValue)}`);
  // Flag any individual daily row inside EITHER window that is itself an extreme outlier
  // (>2x the window's own mean) — the "one bad row drags a 30-day average" signature.
  for (const [label, slice, mean] of [['now', o.nowSlice, o.nowValue], ['then', o.thenSlice, o.thenValue]]) {
    for (const r of slice) {
      const v = +r.labor_pct;
      if (mean > 0 && (v > mean * 2 || v > 0.60 || v < 0)) {
        console.log(`    ^ ${label}-window extreme row: ${r.report_date} labor_pct=${fmtPct(v)} sales=${r.sales} tpph=${r.tpph} uploaded_at=${r.uploaded_at}`);
      }
    }
  }
}

console.log(`\n== Concentration among the top ${TOP} ==================================================`);
console.log('By store (loc: count):');
for (const [loc, c] of Object.entries(storeCounts).sort((a, b) => b[1] - a[1])) console.log(`  ${loc}: ${c}`);
console.log('By date (top 10 dates, date: count):');
for (const [d, c] of Object.entries(dateCounts).sort((a, b) => b[1] - a[1]).slice(0, 10)) console.log(`  ${d}: ${c}`);

console.log('\nThis is a READ-ONLY dump — it names candidate rows, it does not fix anything.');
