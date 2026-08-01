#!/usr/bin/env node
// scripts/eom-accumulation-scan.mjs
// ── How many REAL count-accumulation cases are in the ledger? ────────────────────────────────────
// Owner 2026-08-01. Points the v4.718 accumulation signature at live qsr_raw_item_detail: a multi-entry
// count SESSION whose binding net is a large positive OVERAGE = a total re-entered on top of a submitted
// count while the device timer was active (app adds unless "Replace Count"). Read-only.
//   Env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   Optional: MIN_OVERAGE=150  PERIODS=2026-07,2026-06
// Run:  node --env-file=.env.local scripts/eom-accumulation-scan.mjs

import { createClient } from '@supabase/supabase-js';
import { itemCountSessions } from '../src/engine/eom-count-sessions.js';

const URL = process.env.VITE_SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error('Missing env (need VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)'); process.exit(1); }
const sb = createClient(URL, KEY, { auth: { persistSession: false } });

const MIN = Number(process.env.MIN_OVERAGE || 150);
const OPP = new Set(['3708', '29760', '33704', '10422']);       // the net-harmful-recount opportunities
const STEADY = new Set(['34222', '43380', '38609']);            // the steady control stores
const nm = loc => String(loc).replace(/^0+/, '');
const money = n => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n || 0)).toLocaleString();
const pad = (s, n) => String(s).padEnd(n);

async function selectAll(table, apply) {
  const out = []; const P = 1000;
  for (let f = 0; ; f += P) {
    const { data, error } = await apply(sb.from(table).select('*').range(f, f + P - 1));
    if (error) { console.error(table, error.message); process.exit(1); }
    out.push(...(data || [])); if (!data || data.length < P) break;
  }
  return out;
}

const pad7 = c => String(c).padStart(7, '0');

async function main() {
  const periodsEnv = (process.env.PERIODS || '2026-07').split(',').map(s => s.trim()).filter(Boolean);
  // Focus stores only unless ALL_STORES=1 (the full table is large and times out on an unfiltered scan).
  const focusLocs = [...OPP, ...STEADY].map(pad7);
  const raw = await selectAll('qsr_raw_item_detail', q => {
    let qq = q.in('period', periodsEnv);
    if (!process.env.ALL_STORES) qq = qq.in('loc', focusLocs);
    return qq;
  });
  const periods = [...new Set(raw.map(r => r.period).filter(Boolean))].sort();
  console.log(`[accum] qsr_raw_item_detail rows=${raw.length} · periods=${periods.join(', ') || '(all)'} · min overage=${money(MIN)}\n`);

  const byLoc = {};
  for (const r of raw) (byLoc[String(r.loc)] || (byLoc[String(r.loc)] = [])).push(r);

  const stores = [];
  for (const loc of Object.keys(byLoc)) {
    const hits = [];
    for (const it of byLoc[loc]) {
      const { sessions } = itemCountSessions(Array.isArray(it.history) ? it.history : [], {});
      for (const s of sessions) {
        if (s.nEntries < 2) continue;
        if (s.netDolVar < MIN) continue;
        hits.push({ wrin: it.wrin, descr: it.descr || it.wrin, period: it.period, date: s.date,
          overage: s.netDolVar, nEntries: s.nEntries, manager: s.manager });
      }
    }
    if (hits.length) { hits.sort((a, b) => b.overage - a.overage); stores.push({ loc, hits, total: hits.reduce((x, h) => x + h.overage, 0) }); }
  }
  stores.sort((a, b) => b.total - a.total);

  const tag = loc => OPP.has(nm(loc)) ? '  ◀ OPPORTUNITY' : STEADY.has(nm(loc)) ? '  (steady control)' : '';
  const districtCases = stores.reduce((n, s) => n + s.hits.length, 0);
  const districtDollars = stores.reduce((n, s) => n + s.total, 0);

  console.log(`════ DISTRICT: ${districtCases} accumulation cases across ${stores.length} stores · ${money(districtDollars)} of overage ════\n`);

  // Opportunity + steady stores first, in detail
  const focus = stores.filter(s => OPP.has(nm(s.loc)) || STEADY.has(nm(s.loc)));
  console.log('──── Opportunity + steady stores ────');
  for (const code of [...OPP, ...STEADY]) {
    const s = stores.find(x => nm(x.loc) === code);
    if (!s) { console.log(`  #${pad(code, 7)} — 0 cases${OPP.has(code) ? '  ◀ OPPORTUNITY' : '  (steady control)'}`); continue; }
    console.log(`  #${pad(nm(s.loc), 7)} ${pad(s.hits.length + ' cases', 9)} ${pad(money(s.total), 10)}${tag(s.loc)}`);
    for (const h of s.hits.slice(0, 6))
      console.log(`      ${pad(h.descr, 22)} +${pad(money(h.overage), 9)} ${h.nEntries}entries ${h.date}${h.manager ? ' · ' + h.manager : ''} [${h.period}]`);
  }

  console.log('\n──── All stores with ≥1 case (ranked by $ overage) ────');
  for (const s of stores) console.log(`  #${pad(nm(s.loc), 7)} ${pad(s.hits.length + ' cases', 9)} ${pad(money(s.total), 10)}${tag(s.loc)}`);
}
main();
