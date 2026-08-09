// ── Measure denominator floors for the sweep's deferred ratio-guard sites (Signature #1) ─────────
// memory/plan-data-integrity-sweep.md left these unfixed because a ">0" guard is not enough — the
// question is HOW SMALL a denominator can be before the resulting rate/comp-% is noise, and per the
// project's standing rule ("measure it, don't reason about it") that floor has to come from real
// data, not a guessed number. This is READ-ONLY — it reports distributions, it does not choose or
// write a threshold. A human picks the floor from the printed buckets, the same way the swing-alarm
// -10% and the count-completeness 0.75 were picked from measured bucket boundaries
// (memory/feedback-measure-dont-reason.md).
//
// Covers two deferred sites from the sweep plan:
//   A) src/lib/supabase.js `_finalizeQsrAct` — tpph/r2p/oepe/park/kvst day-level rate metrics.
//      Denominators: actHrs (tpph), fc_trans_cnt (r2p), dt_trans_cnt (oepe/park), mfy_trans_cnt (kvst).
//      Same formulas as _finalizeQsrAct (lines ~1810-1849) — kept in sync by hand; if that function's
//      math changes, update the mirrored formulas below too.
//   B) src/views/graded-visits.js `hourMetrics` — hourly stwGcCompPct/prodSalesCompPct vs LY.
//      Denominators: ly_transactions, ly_product_sales, PER HOUR SLOT (not per day).
//
//   node scripts/measure-denominator-floors.mjs               # both A and B, default 120-day window for B
//   node scripts/measure-denominator-floors.mjs --skip-hourly # A only (fast — one page via the daily view)
//   node scripts/measure-denominator-floors.mjs --days 60     # B's hourly pull window
//
// Required env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (qsr_daily_activity is RLS-scoped; the
// anon key this environment has access to returns 0 rows for it — confirmed live, not assumed. See
// the v4.927/v4.928 commits on this branch for the same constraint on org_events).

import { createClient } from '@supabase/supabase-js';

const URL = process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const sb = createClient(URL, KEY, { auth: { persistSession: false } });

const SKIP_HOURLY = process.argv.includes('--skip-hourly');
const DAYS = (() => { const i = process.argv.indexOf('--days'); return i >= 0 && process.argv[i + 1] ? +process.argv[i + 1] : 120; })();

async function fetchAllPaged(build, pageSize = 1000) {
  const out = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) { console.error('read error:', error.message); process.exit(1); }
    if (!data || !data.length) break;
    out.push(...data);
    if (data.length < pageSize) break;
  }
  return out;
}

// ── stats helpers — percentile-based, same spirit as the swing-alarm/count-completeness derivations
const pct = (sorted, p) => { if (!sorted.length) return null; const i = (sorted.length - 1) * p; const lo = Math.floor(i), hi = Math.ceil(i); return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo); };
function bucketStats(values) {
  const s = values.filter(v => v != null && isFinite(v)).sort((a, b) => a - b);
  if (!s.length) return null;
  return { n: s.length, p10: pct(s, 0.10), p25: pct(s, 0.25), median: pct(s, 0.5), p75: pct(s, 0.75), p90: pct(s, 0.90), iqr: pct(s, 0.75) - pct(s, 0.25) };
}
function printBuckets(title, unit, rows, denomKey, valueKey, edges) {
  console.log(`\n── ${title} (denominator = ${denomKey}, value in ${unit}) ──`);
  console.log('denom range'.padEnd(14) + 'n'.padEnd(8) + 'p10'.padEnd(10) + 'p25'.padEnd(10) + 'median'.padEnd(10) + 'p75'.padEnd(10) + 'p90'.padEnd(10) + 'IQR');
  for (let i = 0; i < edges.length; i++) {
    const lo = edges[i], hi = i + 1 < edges.length ? edges[i + 1] - 1 : Infinity;
    const inBucket = rows.filter(r => r[denomKey] >= lo && r[denomKey] <= hi).map(r => r[valueKey]);
    const st = bucketStats(inBucket);
    const label = hi === Infinity ? `${lo}+` : (lo === hi ? `${lo}` : `${lo}-${hi}`);
    if (!st) { console.log(label.padEnd(14) + '0'); continue; }
    console.log(label.padEnd(14) + String(st.n).padEnd(8) +
      st.p10.toFixed(1).padEnd(10) + st.p25.toFixed(1).padEnd(10) + st.median.toFixed(1).padEnd(10) +
      st.p75.toFixed(1).padEnd(10) + st.p90.toFixed(1).padEnd(10) + st.iqr.toFixed(1));
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// A) Daily rate metrics — tpph/r2p/oepe/park/kvst, via the qsr_daily_activity_daily rollup view.
// ══════════════════════════════════════════════════════════════════════════════════════════════
console.log('═══ A) Daily rate-metric denominators (tpph/r2p/oepe/park/kvst) ═══');
let daily = await fetchAllPaged((from, to) => sb.from('qsr_daily_activity_daily').select('*').range(from, to));
if (!daily.length) {
  console.log('qsr_daily_activity_daily view returned 0 rows — falling back to the raw hourly table, grouped here.');
  const hourly = await fetchAllPaged((from, to) => sb.from('qsr_daily_activity').select(
    'loc,dt,product_sales,transactions,dt_untilserve,dt_untilstore,dt_trans_cnt,dt_carsheld,' +
    'fc_untilserve,fc_untilclosedrawer,fc_trans_cnt,mfy1_untilserve,mfy1_trans_cnt,mfy2_untilserve,mfy2_trans_cnt,' +
    'actual_punched_hours,healthy_count,unhealthy_count'
  ).range(from, to));
  const map = {};
  for (const r of hourly) {
    const k = r.loc + '|' + r.dt;
    const a = map[k] || (map[k] = { loc: r.loc, dt: r.dt, product_sales: 0, transactions: 0, dt_untilserve: 0, dt_untilstore: 0, dt_trans_cnt: 0, dt_carsheld: 0, fc_untilserve: 0, fc_untilclosedrawer: 0, fc_trans_cnt: 0, mfy_untilserve: 0, mfy_trans_cnt: 0, actual_punched_hours: 0 });
    a.product_sales += r.product_sales || 0; a.transactions += r.transactions || 0;
    a.dt_untilserve += r.dt_untilserve || 0; a.dt_untilstore += r.dt_untilstore || 0;
    a.dt_trans_cnt += r.dt_trans_cnt || 0; a.dt_carsheld += r.dt_carsheld || 0;
    a.fc_untilserve += r.fc_untilserve || 0; a.fc_untilclosedrawer += r.fc_untilclosedrawer || 0;
    a.fc_trans_cnt += r.fc_trans_cnt || 0;
    a.mfy_untilserve += (r.mfy1_untilserve || 0) + (r.mfy2_untilserve || 0);
    a.mfy_trans_cnt += (r.mfy1_trans_cnt || 0) + (r.mfy2_trans_cnt || 0);
    a.actual_punched_hours += r.actual_punched_hours || 0;
  }
  daily = Object.values(map);
}
console.log(`${daily.length} (loc, date) day-rows.\n`);

const enriched = daily.map(r => ({
  ...r,
  tpph: r.actual_punched_hours > 0 && r.transactions > 0 ? r.transactions / r.actual_punched_hours : null,
  r2p: r.fc_trans_cnt > 0 ? (r.fc_untilserve - r.fc_untilclosedrawer) / r.fc_trans_cnt / 1000 : null,
  oepe: r.dt_trans_cnt > 0 ? (r.dt_untilserve - r.dt_untilstore) / r.dt_trans_cnt / 1000 : null,
  park: r.dt_trans_cnt > 0 ? r.dt_carsheld / r.dt_trans_cnt * 100 : null,
  kvst: r.mfy_trans_cnt > 0 ? r.mfy_untilserve / r.mfy_trans_cnt / 1000 : null,
}));

printBuckets('TPPH', 'transactions/punched-hr', enriched.filter(r => r.actual_punched_hours > 0), 'actual_punched_hours', 'tpph', [1, 2, 4, 6, 8, 12, 16, 24]);
printBuckets('R2P', 'sec', enriched.filter(r => r.fc_trans_cnt > 0), 'fc_trans_cnt', 'r2p', [1, 5, 10, 25, 50, 100, 200, 400]);
printBuckets('OEPE', 'sec', enriched.filter(r => r.dt_trans_cnt > 0), 'dt_trans_cnt', 'oepe', [1, 5, 10, 25, 50, 100, 200, 400]);
printBuckets('Park %', '%', enriched.filter(r => r.dt_trans_cnt > 0), 'dt_trans_cnt', 'park', [1, 5, 10, 25, 50, 100, 200, 400]);
printBuckets('KVS Time', 'sec', enriched.filter(r => r.mfy_trans_cnt > 0), 'mfy_trans_cnt', 'kvst', [1, 5, 10, 25, 50, 100, 200, 400]);

console.log('\nRead the IQR column left-to-right: the floor is the first bucket where IQR stops shrinking');
console.log('sharply bucket-to-bucket (a proxy for "the metric stopped being dominated by count noise").');
console.log('That is a judgment call for a human reading this table — this script does not choose one.');

// ══════════════════════════════════════════════════════════════════════════════════════════════
// B) Hourly LY comparison — graded-visits.js hourMetrics()'s stwGcCompPct / prodSalesCompPct.
// ══════════════════════════════════════════════════════════════════════════════════════════════
if (!SKIP_HOURLY) {
  console.log(`\n\n═══ B) Hourly LY-comparison denominators (${DAYS}-day window, all stores/hours) ═══`);
  const since = new Date(Date.now() - DAYS * 86400000).toISOString().slice(0, 10);
  const hours = await fetchAllPaged((from, to) => sb.from('qsr_daily_activity')
    .select('loc,dt,hour_slot,transactions,ly_transactions,product_sales,ly_product_sales')
    .gte('dt', since).range(from, to));
  console.log(`${hours.length} hour-slot rows since ${since}.\n`);

  const withComp = hours.map(r => ({
    ...r,
    stwGcCompPct: r.ly_transactions > 0 ? ((r.transactions || 0) - r.ly_transactions) / r.ly_transactions * 100 : null,
    prodSalesCompPct: r.ly_product_sales > 0 ? ((r.product_sales || 0) - r.ly_product_sales) / r.ly_product_sales * 100 : null,
  }));
  printBuckets('STW GC +/- % (hourly)', '%', withComp.filter(r => r.ly_transactions > 0), 'ly_transactions', 'stwGcCompPct', [1, 2, 3, 5, 8, 12, 20, 40]);
  printBuckets('Prod Sales +/- % (hourly)', '%', withComp.filter(r => r.ly_product_sales > 0), 'ly_product_sales', 'prodSalesCompPct', [1, 25, 50, 100, 200, 400, 800, 1600]);

  const zeroToOne = withComp.filter(r => r.ly_transactions === 1).length;
  const total = withComp.filter(r => r.ly_transactions > 0).length;
  console.log(`\nly_transactions === 1 in ${zeroToOne} of ${total} hour-slots with any LY count `
    + `(${total ? (zeroToOne / total * 100).toFixed(1) : '0'}%) — the sweep plan's concern that "1 is `
    + `normal, not an edge case" (e.g. overnight hours) is either confirmed or refuted by that share.`);
} else {
  console.log('\n(--skip-hourly: part B not run)');
}
