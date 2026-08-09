// ── Measure denominator floors for the sweep's deferred ratio-guard sites (Signature #1) ─────────
// memory/plan-data-integrity-sweep.md left these unfixed because a ">0" guard is not enough — the
// question is HOW SMALL a denominator can be before the resulting rate/comp-% is noise, and per the
// project's standing rule ("measure it, don't reason about it") that floor has to come from real
// data, not a guessed number. This is READ-ONLY — it reports distributions, it does not choose or
// write a threshold. A human picks the floor from the printed buckets, the same way the swing-alarm
// -10% and the count-completeness 0.75 were picked from measured bucket boundaries
// (memory/feedback-measure-dont-reason.md).
//
// Covers four deferred sites from the sweep plan:
//   A) src/lib/supabase.js `_finalizeQsrAct` — tpph/r2p/oepe/park/kvst day-level rate metrics.
//      Denominators: actHrs (tpph), fc_trans_cnt (r2p), dt_trans_cnt (oepe/park), mfy_trans_cnt (kvst).
//      Same formulas as _finalizeQsrAct (lines ~1810-1849) — kept in sync by hand; if that function's
//      math changes, update the mirrored formulas below too.
//   B) src/views/graded-visits.js `hourMetrics` — hourly stwGcCompPct/prodSalesCompPct vs LY.
//      Denominators: ly_transactions, ly_product_sales, PER HOUR SLOT (not per day).
//   C) src/views/signals.js `planPace` — same-day cumulative pacePct/gcPacePct, DISTRICT-WIDE
//      (sums every store's rows together for one date — no per-loc grouping in the real code).
//      Denominators: cumulative proj_sales_dollars / proj_total_transactions elapsed so far.
//   D) src/views/signals.js `aggregateByStore`'s `salesPct` (StoreRow "Sales pace" column) — a
//      SEPARATE, genuinely PER-STORE cumulative pace metric on a DIFFERENT field than C: this one
//      compares cumulative actual sales to cumulative `mean_sales` (this store's own historical
//      same-hour average), not the QSRSoft projection. Easy to conflate with C since both render
//      as "pace" cards in the same panel — they are different computations needing different floors.
//
// dt-speedofservice.js's early/late `us/cnt` split (also flagged in the sweep plan) is NOT covered
// here — it's a coarser aggregate of the SAME dt_trans_cnt field Part A already measures (summed
// over ~half a multi-day window per store, vs Part A's single-day-per-store), so it's strictly
// safer than what Part A already showed to rarely get small. See the sweep memory doc.
//
//   node scripts/measure-denominator-floors.mjs               # A, B, C, D — default 120-day window for B/C/D
//   node scripts/measure-denominator-floors.mjs --skip-hourly # A only (fast — one page via the daily view)
//   node scripts/measure-denominator-floors.mjs --days 60     # B/C/D's hourly pull window
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

async function fetchAllPaged(build, pageSize = 1000, { fatal = true } = {}) {
  const out = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) {
      if (fatal) { console.error('read error:', error.message); process.exit(1); }
      console.log('read error (falling back):', error.message);
      return null;
    }
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
// Same stats, bucketed by TIME OF DAY (the hour_slot each cumulative sample was taken at) instead
// of by denominator magnitude — answers "by what hour does this normalize" directly, rather than
// "how many dollars/guests does it take" (printBuckets above). hour_slot is the END hour of a
// 1-hour block (e.g. slot '6' = 5am-6am), same convention as HourlyDetail/dt-speedofservice.js.
// `baseline`, when given (e.g. 100 for a ratio-to-plan metric), adds a "bias" column =
// median - baseline — the signal for a SYSTEMATIC over/under-projection pattern at that hour,
// as distinct from IQR (noise/spread). A consistently negative bias at the same hour across many
// days points at the projection source itself (QSRSoft/LifeLenz's hourly curve), not at Meridian's
// math — exactly the kind of pattern worth logging for its own sake, per the owner's ask.
function printHourBuckets(title, unit, rows, hourKey, valueKey, baseline = null) {
  console.log(`\n── ${title} (by hour-of-day, value in ${unit}) ──`);
  const byHour = {};
  for (const r of rows) { const h = String(r[hourKey]); (byHour[h] = byHour[h] || []).push(r[valueKey]); }
  const hours = Object.keys(byHour).sort((a, b) => (+a) - (+b));
  const fmt = x => x === 0 ? '12a' : x <= 11 ? `${x}a` : x === 12 ? '12p' : `${x - 12}p`;
  const biasHdr = baseline != null ? 'bias(med-' + baseline + ')' : '';
  console.log('hour block'.padEnd(12) + 'n'.padEnd(8) + 'p10'.padEnd(10) + 'p25'.padEnd(10) + 'median'.padEnd(10) + 'p75'.padEnd(10) + 'p90'.padEnd(10) + 'IQR'.padEnd(8) + biasHdr);
  for (const h of hours) {
    const end = parseInt(h, 10);
    const label = isNaN(end) ? h : `${fmt((end - 1 + 24) % 24)}-${fmt(end)}`;
    const st = bucketStats(byHour[h]);
    if (!st) { console.log(label.padEnd(12) + '0'); continue; }
    const bias = baseline != null ? (st.median - baseline >= 0 ? '+' : '') + (st.median - baseline).toFixed(1) : '';
    console.log(label.padEnd(12) + String(st.n).padEnd(8) +
      st.p10.toFixed(1).padEnd(10) + st.p25.toFixed(1).padEnd(10) + st.median.toFixed(1).padEnd(10) +
      st.p75.toFixed(1).padEnd(10) + st.p90.toFixed(1).padEnd(10) + st.iqr.toFixed(1).padEnd(8) + bias);
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// A) Daily rate metrics — tpph/r2p/oepe/park/kvst, via the qsr_daily_activity_daily rollup view.
// ══════════════════════════════════════════════════════════════════════════════════════════════
console.log('═══ A) Daily rate-metric denominators (tpph/r2p/oepe/park/kvst) ═══');
const sinceA = new Date(Date.now() - DAYS * 86400000).toISOString().slice(0, 10);
console.log(`(bounded to the last ${DAYS} days, since ${sinceA} — the view/table has no cache and a full-table `
  + `GROUP BY timed out unbounded; pass --days to widen once you know this window is fast enough)\n`);
let daily = await fetchAllPaged((from, to) => sb.from('qsr_daily_activity_daily').select('*').gte('dt', sinceA).range(from, to), 1000, { fatal: false });
if (!daily || !daily.length) {
  console.log((daily ? 'qsr_daily_activity_daily view returned 0 rows' : 'qsr_daily_activity_daily view failed')
    + ' — falling back to the raw hourly table, grouped here.');
  const hourly = await fetchAllPaged((from, to) => sb.from('qsr_daily_activity').select(
    'loc,dt,product_sales,transactions,dt_untilserve,dt_untilstore,dt_trans_cnt,dt_carsheld,' +
    'fc_untilserve,fc_untilclosedrawer,fc_trans_cnt,mfy1_untilserve,mfy1_trans_cnt,mfy2_untilserve,mfy2_trans_cnt,' +
    'actual_punched_hours,healthy_count,unhealthy_count'
  ).gte('dt', sinceA).range(from, to)) || [];
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

  // ════════════════════════════════════════════════════════════════════════════════════════════
  // C) Same-day cumulative pacing — src/views/signals.js planPace's pacePct/gcPacePct (Signature
  // #1, deferred: "partial-day-so-far denominator... the missing piece is a magnitude guard, not
  // a date cutoff"). planPace sums EVERY store's rows together for one calendar date (LiveOpsTab
  // loads DAR rows with no loc filter) — it is a DISTRICT-WIDE aggregate, not per-store. An
  // earlier version of this script grouped by (loc,dt), measuring single-store pacing noise —
  // caught before use (owner asked "what are the impacts" before applying the resulting floor,
  // which is what surfaced the mismatch) and fixed here to group by DATE ONLY, summing all
  // stores' same-hour rows together before accumulating cumulatively through the day — matching
  // planPace's actual computation shape. Reconstructs, for every real date, the cumulative
  // doneActual/doneProj (and GC equivalents) at EVERY hour position — i.e. "what would this ratio
  // have shown if read at this exact hour" — using historical (already-complete) days as a stand-
  // in for the many possible elapsed-hours states a live read can land on.
  // ════════════════════════════════════════════════════════════════════════════════════════════
  console.log(`\n\n═══ C) Same-day cumulative pacing denominators, district-wide (${DAYS}-day window) ═══`);
  const paceRows = await fetchAllPaged((from, to) => sb.from('qsr_daily_activity')
    .select('loc,dt,hour_slot,product_sales,proj_sales_dollars,transactions,proj_total_transactions,mean_sales')
    .gte('dt', since).range(from, to));
  const byDate = {};
  for (const r of paceRows) { (byDate[r.dt] = byDate[r.dt] || []).push(r); }
  const paceSamples = [];
  for (const dateRows of Object.values(byDate)) {
    // Sum ALL stores' rows for this date together per hour_slot first (matching planPace, which
    // never groups by loc), then walk hour_slot in order accumulating cumulatively.
    const byHour = {};
    for (const r of dateRows) {
      const h = r.hour_slot;
      const b = byHour[h] || (byHour[h] = { actual: 0, proj: 0, gc: 0, projGC: 0 });
      b.actual += r.product_sales || 0; b.proj += r.proj_sales_dollars || 0;
      b.gc += r.transactions || 0; b.projGC += r.proj_total_transactions || 0;
    }
    let doneActual = 0, doneProj = 0, doneGC = 0, doneProjGC = 0;
    for (const h of Object.keys(byHour).sort()) {
      const b = byHour[h];
      doneActual += b.actual; doneProj += b.proj;
      doneGC += b.gc; doneProjGC += b.projGC;
      paceSamples.push({
        hourSlot: h,
        doneProj, pacePct: doneProj > 0 ? doneActual / doneProj * 100 : null,
        doneProjGC, gcPacePct: doneProjGC > 0 ? doneGC / doneProjGC * 100 : null,
      });
    }
  }
  console.log(`${paceSamples.length} cumulative same-day snapshots (one per hour-elapsed, `
    + `${Object.keys(byDate).length} district-days, ALL stores summed per hour).\n`);
  // Bucket edges widened ~10-30x vs a per-store measurement — this is now a 27-store sum, so even
  // the first business hour plausibly clears what a single store would take all morning to reach.
  printBuckets('Sales Pace % (cumulative $ so far, district)', '%', paceSamples.filter(r => r.doneProj > 0), 'doneProj', 'pacePct', [1, 500, 1000, 2500, 5000, 10000, 20000, 40000]);
  printBuckets('GC Pace % (cumulative guests so far, district)', '%', paceSamples.filter(r => r.doneProjGC > 0), 'doneProjGC', 'gcPacePct', [1, 25, 50, 100, 250, 500, 1000, 2000]);
  printHourBuckets('Sales Pace % (district)', '%', paceSamples.filter(r => r.doneProj > 0), 'hourSlot', 'pacePct', 100);
  printHourBuckets('GC Pace % (district)', '%', paceSamples.filter(r => r.doneProjGC > 0), 'hourSlot', 'gcPacePct', 100);

  // ════════════════════════════════════════════════════════════════════════════════════════════
  // D) Per-store cumulative pace vs historical mean — aggregateByStore's salesPct (StoreRow's
  // "Sales pace" column + its expandable HourlyDetail per-hour pace, both in signals.js). A
  // DIFFERENT metric from C, on a DIFFERENT field: denominator is cumulative mean_sales (this
  // store's own historical same-hour average), summed across only its COMPLETED hours
  // (product_sales>0) so far today — genuinely per-store, the metric the owner correctly recalled
  // existing here that Part C's district-wide planPace measurement doesn't cover.
  // ════════════════════════════════════════════════════════════════════════════════════════════
  console.log(`\n\n═══ D) Per-store cumulative pace-vs-mean denominators (${DAYS}-day window) ═══`);
  const byStoreDate = {};
  for (const r of paceRows) { const k = r.loc + '|' + r.dt; (byStoreDate[k] = byStoreDate[k] || []).push(r); }
  const storePaceSamples = [];
  for (const dayRows of Object.values(byStoreDate)) {
    dayRows.sort((a, b) => String(a.hour_slot).localeCompare(String(b.hour_slot)));
    let sales = 0, meanSales = 0;
    for (const r of dayRows) {
      if ((r.product_sales || 0) > 0) { // only completed hours, matching aggregateByStore exactly
        sales += r.product_sales || 0;
        meanSales += r.mean_sales || 0;
        storePaceSamples.push({ hourSlot: r.hour_slot, meanSales, salesPct: meanSales > 0 ? sales / meanSales * 100 : null });
      }
    }
  }
  console.log(`${storePaceSamples.length} cumulative per-store same-day snapshots (one per completed `
    + `hour, ${Object.keys(byStoreDate).length} store-days).\n`);
  printBuckets('Store Sales Pace % (cumulative $ vs own mean)', '%', storePaceSamples.filter(r => r.meanSales > 0), 'meanSales', 'salesPct', [1, 25, 50, 100, 250, 500, 1000, 2500]);
  printHourBuckets('Store Sales Pace % (per-store)', '%', storePaceSamples.filter(r => r.meanSales > 0), 'hourSlot', 'salesPct', 100);

  console.log('\nNote: signals.js\'s separate per-hour "Baseline Anomalies" detector (not measured here) already');
  console.log('has its own MIN_MEAN=300 floor on this same mean_sales field — lower priority, already guarded,');
  console.log('though whether 300 was itself measured or just chosen is unconfirmed. See the sweep memory doc.');

  // ════════════════════════════════════════════════════════════════════════════════════════════
  // E) STANDALONE (non-cumulative) per-hour actual vs projected. Answers two distinct owner
  // questions: (1) does comparing hour-by-hour instead of cumulative look different — expectation
  // was worse, since cumulative gets a "free" smoothing benefit from summing multiple hours'
  // dollars together as the day progresses, which a standalone single hour never gets; and (2) is
  // there a SYSTEMATIC (not just noisy) over/under-projection pattern by hour-of-day, worth
  // logging in its own right — a persistent bias at the same hour across many days would point at
  // the projection source itself (QSRSoft/LifeLenz's hourly curve), not at Meridian's math, and
  // would be a real, actionable "manually override this hour's projection" candidate. Reuses
  // paceRows already fetched for C/D — no new query.
  // ════════════════════════════════════════════════════════════════════════════════════════════
  console.log(`\n\n═══ E) STANDALONE (non-cumulative) per-hour actual vs projected ═══`);
  const byDateHourAll = {};
  for (const r of paceRows) {
    const k = r.dt + '|' + r.hour_slot;
    const b = byDateHourAll[k] || (byDateHourAll[k] = { hourSlot: r.hour_slot, actual: 0, proj: 0 });
    b.actual += r.product_sales || 0; b.proj += r.proj_sales_dollars || 0;
  }
  const standaloneDistrict = Object.values(byDateHourAll)
    .filter(b => b.proj > 0).map(b => ({ hourSlot: b.hourSlot, ratio: b.actual / b.proj * 100 }));
  printHourBuckets('Standalone hourly Sales % (district, non-cumulative)', '%', standaloneDistrict, 'hourSlot', 'ratio', 100);

  const standaloneStore = paceRows
    .filter(r => (r.proj_sales_dollars || 0) > 0)
    .map(r => ({ hourSlot: r.hour_slot, ratio: (r.product_sales || 0) / r.proj_sales_dollars * 100 }));
  printHourBuckets('Standalone hourly Sales % (per-store, non-cumulative)', '%', standaloneStore, 'hourSlot', 'ratio', 100);

  console.log('\nCompare these IQR/bias columns directly against Part C\'s "Sales Pace % (district)" and');
  console.log('Part D\'s "Store Sales Pace % (per-store)" tables above — same hour labels, same baseline');
  console.log('(100), non-cumulative here vs cumulative-so-far there. A persistent BIAS at the same hour');
  console.log('across many days (not just a wide IQR) is the pattern worth investigating in the projection');
  console.log('source itself, separate from whatever Meridian decides to do about display/suppression.');
} else {
  console.log('\n(--skip-hourly: parts B, C, and D not run)');
}
