// ── One-time cleanup: null out the labor_pct=0 stub rows in labor_rows (#236) ───────────────────
// Root cause: src/parsers/index.js's parseSalesLedger (and src/lib/supabase.js's loadSalesLedger)
// stamped labor_pct/tpph/ot_hrs/ot_dollar as literal 0 on every row — "Sales Ledger has no labor
// data" — and pipeline.js merges Sales Ledger rows into ds.laborRows so their `sales` figure can
// supplement Labor Analysis history when that report lags. App.js's manual-upload save path then
// pushed those merged rows straight to the labor_rows table via saveLaborRows, whose mapping is
// `labor_pct: r.laborPct ?? null` — 0 ?? null is 0, not null, so the stub was written and upserted
// (onConflict: loc,report_date) — silently overwriting or filling in real Labor Analysis
// percentages with a false zero. A store cannot run 0% punched labor on a day with real sales, so
// `labor_pct=0 AND sales>0` is an unambiguous signature: measured 994 rows, all 27 stores,
// 2025-01-22..2026-07-23, every one of them ALSO tpph=0 AND ot_hrs=0 (verified before writing this
// script — zero rows in the 994 have a non-zero tpph or ot_hrs, so there's no legitimate-partial-
// data case being swept up here).
//
// The parser + save-path fix (same PR) stops NEW stub rows from being created. This script
// corrects the rows that already accumulated: sets labor_pct/tpph/ot_hrs/ot_dollar to NULL (honest
// "unknown," not a fabricated replacement value — the real Labor Analysis number for those dates,
// if it ever existed, was already overwritten and is not recoverable from this table) while
// leaving sales, loc, and report_date untouched.
//
//   node scripts/cleanup-labor-pct-stub-zeros.mjs --dry     # report only (start here)
//   node scripts/cleanup-labor-pct-stub-zeros.mjs           # apply
//
// Required env (apply only): VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from '@supabase/supabase-js';

const DRY = process.argv.includes('--dry');

const URL = process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const sb = createClient(URL, KEY, { auth: { persistSession: false } });

const rows = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb.from('labor_rows').select('id,loc,report_date,labor_pct,sales,tpph,ot_hrs,ot_dollar')
    .eq('labor_pct', 0).gt('sales', 0).range(from, from + 999);
  if (error) { console.error('labor_rows read error:', error.message); process.exit(1); }
  if (!data || !data.length) break;
  rows.push(...data);
  if (data.length < 1000) break;
}
console.log(`labor_rows rows matching labor_pct=0 AND sales>0: ${rows.length}`);

const suspicious = rows.filter(r => (r.tpph && r.tpph !== 0) || (r.ot_hrs && r.ot_hrs !== 0));
if (suspicious.length) {
  console.error(`\n✗ ${suspicious.length} matched rows ALSO have a non-zero tpph or ot_hrs — that's not the`);
  console.error('  stub signature this script targets (which is labor_pct=0 AND tpph=0 AND ot_hrs=0, all');
  console.error('  three together). Refusing to touch anything until this is understood. Rows:');
  console.error(JSON.stringify(suspicious.slice(0, 10), null, 1));
  process.exit(1);
}

const byLoc = {};
for (const r of rows) byLoc[r.loc] = (byLoc[r.loc] || 0) + 1;
console.log(`Stores affected: ${Object.keys(byLoc).length} of 27`);
for (const [loc, n] of Object.entries(byLoc).sort((a, b) => b[1] - a[1])) console.log(`  ${loc}: ${n}`);
const dates = rows.map(r => r.report_date).sort();
console.log(`Date range: ${dates[0]} .. ${dates[dates.length - 1]}`);

if (!rows.length) { console.log('\nNothing to clean up.'); process.exit(0); }
if (DRY) { console.log(`\n[--dry] would null labor_pct/tpph/ot_hrs/ot_dollar on ${rows.length} rows (sales left untouched). Re-run without --dry to apply.`); process.exit(0); }

let updated = 0;
for (const r of rows) {
  const { error } = await sb.from('labor_rows')
    .update({ labor_pct: null, tpph: null, ot_hrs: null, ot_dollar: null })
    .eq('id', r.id);
  if (error) { console.error(`Update error for id ${r.id} (${r.loc}/${r.report_date}):`, error.message); process.exit(1); }
  updated++;
}
console.log(`\n✓ Nulled labor_pct/tpph/ot_hrs/ot_dollar on ${updated} rows (sales preserved).`);
console.log('  Re-run scripts/measure-coaching-noise-threshold.mjs and scripts/measure-district-relative-noise.mjs');
console.log('  to see the corrected labor_pct distribution.');
