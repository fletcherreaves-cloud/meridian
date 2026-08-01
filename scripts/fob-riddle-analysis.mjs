#!/usr/bin/env node
// scripts/fob-riddle-analysis.mjs
// ── The FOB "riddle": why does FOB worsen from count-submission to month-end? ────────────────────
// Owner Notes 41 (2026-08-01). Loads all available qsr_fob (daily MTD snapshots) + qsr_raw_item_detail
// (count ledgers) and tests three theories, read-only. No answer is ruled out.
//   T1  Recounts HURT — net-move variance away from zero (add apparent loss).
//   T2  Late-month drift — count lands ~3 days out, then sales/usage keep accruing to EOM without a
//       final recount → ending inventory goes stale → variance grows over the tail of the month.
//   T3  Consistency — which stores hold repeatable FOB (owner flags 34222 / 43880 / 38609) and what do
//       they do differently (recount discipline, count timing)?
//
// Env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   Optional: MONTHS=6  RECOUNT_PERIODS=2026-06,2026-07

import { createClient } from '@supabase/supabase-js';
import { fobSnapshotByStore } from '../src/engine/eom-inventory.js';
import { storeVarianceProgressions } from '../src/engine/eom-variance-progression.js';

const URL = process.env.VITE_SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error('Missing env'); process.exit(1); }
const sb = createClient(URL, KEY, { auth: { persistSession: false } });
const CONSISTENT = new Set(['0034222', '34222', '0043880', '43880', '0038609', '38609']);
const money = n => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n || 0)).toLocaleString();
const pad = (s, n) => String(s).padEnd(n);

async function selectAll(table, apply) {
  const out = []; const P = 1000;
  for (let f = 0; ; f += P) { const { data, error } = await apply(sb.from(table).select('*').range(f, f + P - 1));
    if (error) { console.error(table, error.message); process.exit(1); } out.push(...(data || [])); if (!data || data.length < P) break; }
  return out;
}
const monthOf = d => String(d || '').slice(0, 7);
const nm = loc => String(loc).replace(/^0+/, '');
const stdev = a => { if (a.length < 2) return 0; const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length); };

async function main() {
  const fobRaw = await selectAll('qsr_fob', q => q);
  console.log(`[riddle] qsr_fob rows=${fobRaw.length}`);
  const fob = fobRaw.map(r => ({ loc: String(r.loc), date: r.date, prodSalesAmt: r.prod_sales_amt, compWasteAmt: r.comp_waste_amt, rawWasteAmt: r.raw_waste_amt, condimentsAmt: r.condiments_amt, empMgrMealsAmt: r.emp_mgr_meals_amt, statVarianceAmt: r.stat_variance_amt, unexplainedAmt: r.unexplained_amt }));
  const months = [...new Set(fob.map(r => monthOf(r.date)).filter(Boolean))].sort();
  console.log(`[riddle] months present: ${months.join(', ')}\n`);

  // ── T2 + T3: within-month FOB trajectory + monthly-final consistency ─────────────────────────
  // For each store×month, the daily MTD FOB% series (dedup to one row per day = latest that day).
  const series = {};   // loc -> month -> [{day, fobPct, sales}]
  const byDay = {};
  for (const r of fob) { const k = `${r.loc}|${r.date}`; byDay[k] = r; }   // last write wins per loc/day
  for (const r of Object.values(byDay)) {
    const mo = monthOf(r.date); if (!mo) continue;
    const parts = (r.compWasteAmt || 0) + (r.rawWasteAmt || 0) + (r.condimentsAmt || 0) + (r.empMgrMealsAmt || 0) + (r.statVarianceAmt || 0) + (r.unexplainedAmt || 0);
    const pct = r.prodSalesAmt ? parts / r.prodSalesAmt : null;
    if (pct == null) continue;
    ((series[r.loc] || (series[r.loc] = {}))[mo] || (series[r.loc][mo] = [])).push({ day: r.date.slice(8, 10), fobPct: pct, sales: r.prodSalesAmt });
  }

  // T2: for each store×month with ≥6 daily points, compare FOB% at the ~3rd-to-last captured day (proxy
  // for count time) vs the last captured day (final). Positive drift = FOB worsened over the tail.
  let t2n = 0, t2worse = 0, t2sumDrift = 0; const t2byStore = {};
  for (const loc of Object.keys(series)) for (const mo of Object.keys(series[loc])) {
    const s = series[loc][mo].slice().sort((a, b) => a.day.localeCompare(b.day));
    if (s.length < 6) continue;
    const atCount = s[s.length - 3].fobPct, atFinal = s[s.length - 1].fobPct;
    const drift = (atFinal - atCount) * 100;   // pp
    t2n++; if (drift > 0.02) t2worse++; t2sumDrift += drift;
    (t2byStore[loc] || (t2byStore[loc] = [])).push(drift);
  }

  // T3: monthly-final FOB% per store → variability (std dev) + mean.
  const finalByStore = {};
  for (const loc of Object.keys(series)) { const fins = [];
    for (const mo of Object.keys(series[loc])) { const s = series[loc][mo].slice().sort((a, b) => a.day.localeCompare(b.day)); if (s.length) fins.push(s[s.length - 1].fobPct * 100); }
    if (fins.length >= 2) finalByStore[loc] = { n: fins.length, mean: fins.reduce((a, b) => a + b, 0) / fins.length, sd: stdev(fins) };
  }

  // ── T1: recount net effect from the raw item ledgers ─────────────────────────────────────────
  const recPeriods = (process.env.RECOUNT_PERIODS || months.slice(-2).join(',')).split(',').filter(Boolean);
  const rawRaw = await selectAll('qsr_raw_item_detail', q => recPeriods.length ? q.in('period', recPeriods) : q);
  const rawByLoc = {};
  for (const r of rawRaw) (rawByLoc[String(r.loc)] || (rawByLoc[String(r.loc)] = [])).push({ wrin: r.wrin, descr: r.descr, cls: r.item_class, history: Array.isArray(r.history) ? r.history : [] });
  let t1improved = 0, t1worsened = 0; const t1byStore = {};
  for (const loc of Object.keys(rawByLoc)) {
    const progs = storeVarianceProgressions(rawByLoc[loc], { minAbs: 0 });
    let imp = 0, wor = 0;
    for (const p of progs) { if (p.nRecounts > 0) { const eff = Math.abs(p.base.dolVar) - Math.abs(p.final.dolVar); if (eff >= 0) imp += eff; else wor += -eff; } }
    t1improved += imp; t1worsened += wor; t1byStore[loc] = { imp, wor, net: imp - wor };
  }

  // ── Report ───────────────────────────────────────────────────────────────────────────────────
  console.log('════ T1 · DO RECOUNTS HURT? (raw ledger, periods ' + recPeriods.join(',') + ') ════');
  console.log(`  District: recounts moved ${money(t1improved)} TOWARD zero, ${money(t1worsened)} AWAY → net ${money(t1improved - t1worsened)} ${t1improved - t1worsened >= 0 ? '(net helpful)' : '(net HARMFUL)'}`);
  const t1rank = Object.entries(t1byStore).sort((a, b) => a[1].net - b[1].net).slice(0, 12);
  console.log('  Worst net recount effect (most harmful first):');
  for (const [loc, v] of t1rank) console.log(`    ${pad('#' + nm(loc), 8)} net ${pad(money(v.net), 10)} (toward ${money(v.imp)} / away ${money(v.wor)})${CONSISTENT.has(loc) ? '  ★consistent-store' : ''}`);

  console.log('\n════ T2 · DOES FOB DRIFT WORSE OVER THE MONTH TAIL? (last-3-days→final) ════');
  console.log(`  ${t2n} store-months measured · ${t2worse} (${Math.round(100 * t2worse / (t2n || 1))}%) worsened over the tail · avg tail drift ${(t2sumDrift / (t2n || 1)).toFixed(3)}pp (+ = worse)`);

  console.log('\n════ T3 · CONSISTENCY — monthly-final FOB% variability (lowest sd = steadiest) ════');
  const t3 = Object.entries(finalByStore).sort((a, b) => a[1].sd - b[1].sd);
  console.log('  Steadiest stores:');
  for (const [loc, v] of t3.slice(0, 8)) console.log(`    ${pad('#' + nm(loc), 8)} mean ${v.mean.toFixed(2)}% · sd ${v.sd.toFixed(2)} (n=${v.n})${CONSISTENT.has(loc) ? '  ★owner-flagged' : ''}`);
  console.log('  Owner-flagged consistent stores (34222 / 43880 / 38609):');
  for (const loc of ['0034222', '0043880', '0038609']) { const v = finalByStore[loc] || finalByStore[nm(loc)]; const t2s = (t2byStore[loc] || []); const t1s = t1byStore[loc] || t1byStore[nm(loc)];
    console.log(`    #${nm(loc)}: ${v ? `FOB mean ${v.mean.toFixed(2)}% · sd ${v.sd.toFixed(2)}` : 'no FOB history'} · tail-drift avg ${(t2s.reduce((a, b) => a + b, 0) / (t2s.length || 1)).toFixed(3)}pp · recount net ${t1s ? money(t1s.net) : '—'}`); }
  console.log('\n[riddle] done.');
}
main().catch(e => { console.error('[riddle] fatal:', e); process.exit(1); });
