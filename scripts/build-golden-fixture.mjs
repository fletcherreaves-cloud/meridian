#!/usr/bin/env node
// @ts-nocheck
// Builds src/__tests__/fixtures/golden.json — a small, frozen slice of REAL production
// data used to pin computed metrics in CI.
//
// WHY THIS EXISTS: on 2026-08-07 a single session produced ~10 wrong assumptions, two
// of which reached production (a public data exposure and a timeout that emptied four
// tiles). Every one was caught by querying the live database; none by code review or
// by the 768 existing tests. Those tests cover pure functions with synthetic inputs —
// the bugs live in SOURCING and AGGREGATION over real row shapes.
//
// A frozen real slice closes that gap: any change that shifts a computed number fails
// CI instead of appearing in the owner's browser.
//
// Re-run only when you INTEND the numbers to move, and review the diff:
//   node scripts/build-golden-fixture.mjs
//
// Small on purpose — 3 stores × 7 days. Big enough to exercise padded and unpadded loc
// formats, multi-source resolution and the ratio rollups; small enough to read.

import { readFileSync, writeFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);
const BASE = env.VITE_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;  // not `URL` — that shadows the global constructor
if (!BASE || !KEY) { console.error('need VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local'); process.exit(1); }

const LOCS_PADDED   = ['0003708', '0005183', '0005985'];
const LOCS_UNPADDED = LOCS_PADDED.map(l => String(parseInt(l, 10)));
// Window chosen so MANUAL and AUTO sources OVERLAP — that is where resolution ORDER
// matters (manual Controls/Labor first, then emailed, then auto-pulled), and pinning
// it is half the point of this fixture. Manual uploads stop after mid-July
// (labor_rows ends 2026-07-23, ctrl_rows/ops_rows end 2026-07-15) because the owner
// moved to auto pulls, so a later window would silently test only the auto path.
const FROM = '2026-07-09', TO = '2026-07-15';

async function q(table, params) {
  const u = new URL(`${BASE}/rest/v1/${table}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const r = await fetch(u, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
  if (!r.ok) { console.warn(`  ${table}: HTTP ${r.status}`); return []; }
  return r.json();
}
const inList = a => `in.(${a.join(',')})`;

const out = { _meta: { from: FROM, to: TO, locsPadded: LOCS_PADDED, locsUnpadded: LOCS_UNPADDED, builtFrom: 'production' } };

// Padded-loc sources
for (const [key, table, dcol] of [
  ['rollup',     'qsr_daily_activity_rollup', 'dt'],
  ['qsrFob',     'qsr_fob',                   'date'],
  ['opsCash',    'qsr_cash_sheet',            'dt'],
  ['opsLabor',   'qsr_labor_summary',         'dt'],
  ['opsService', 'qsr_service_stats',         'dt'],
]) {
  out[key] = await q(table, { select: '*', loc: inList(LOCS_PADDED), [dcol]: `gte.${FROM}`, limit: '500' });
  out[key] = out[key].filter(r => (r[dcol] || '').slice(0, 10) <= TO);
  console.log(`  ${key.padEnd(11)} ${out[key].length} rows`);
}
// Unpadded-loc sources
for (const [key, table, dcol] of [
  ['labor',   'labor_rows', 'report_date'],
  ['ctrl',    'ctrl_rows',  'date'],
  ['ops',     'ops_rows',   'date'],
  ['glimpse', 'daily_glimpse_daily', 'date'],
  ['cash',    'cash_sheet_daily',    'date'],
  ['ledger',  'sales_ledger_daily',  'date'],
]) {
  out[key] = await q(table, { select: '*', loc: inList(LOCS_UNPADDED), [dcol]: `gte.${FROM}`, limit: '500' });
  out[key] = out[key].filter(r => (r[dcol] || '').slice(0, 10) <= TO);
  console.log(`  ${key.padEnd(11)} ${out[key].length} rows`);
}

writeFileSync('src/__tests__/fixtures/golden.json', JSON.stringify(out, null, 1));
const total = Object.entries(out).filter(([k]) => k !== '_meta').reduce((a, [, v]) => a + v.length, 0);
console.log(`\nwrote src/__tests__/fixtures/golden.json — ${total} rows across ${Object.keys(out).length - 1} sources`);
