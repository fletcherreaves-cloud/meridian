#!/usr/bin/env node
// scripts/compute-hourly-projection-accuracy.mjs
// ── Hourly Projection Accuracy — daily compute ────────────────────────────────
// Computes ONE day's (loc, hour_slot) actual vs QSRSoft-projected sales/GC totals from
// qsr_daily_activity and upserts them into hourly_projection_accuracy — a small table purpose-
// built so the Projection Accuracy report can look back over weeks/months without re-scanning the
// large raw hourly table (which times out past ~30 days — see
// supabase/schema-hourly-projection-accuracy.sql and memory/plan-data-integrity-sweep.md). Reads
// what's already in Supabase; no QSRSoft auth needed. A single day's read (`eq('dt', DATE)`, not a
// range) stays fast even against the un-optimized table. Meant to run once daily, well after the
// target day is fully complete (all intraday DAR pulls finished) — see
// .github/workflows/hourly-projection-accuracy.yml.
//
// Required env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Optional:     HPA_DATE=YYYY-MM-DD (default: yesterday, US Central)
//
//   node scripts/compute-hourly-projection-accuracy.mjs           # yesterday (CT)
//   node scripts/compute-hourly-projection-accuracy.mjs --dry     # print only, no write
//   HPA_DATE=2026-08-01 node scripts/compute-hourly-projection-accuracy.mjs

import { createClient } from '@supabase/supabase-js';
import { withRetry } from './_retry.mjs';

const DRY = process.argv.includes('--dry');
const URL = process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const sb = createClient(URL, KEY, { auth: { persistSession: false } });

function yesterdayCT() {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(Date.now() - 86400000));
  return `${p.find(x => x.type === 'year').value}-${p.find(x => x.type === 'month').value}-${p.find(x => x.type === 'day').value}`;
}
const DATE = (process.env.HPA_DATE || '').trim() || yesterdayCT();

async function main() {
  const { data, error } = await withRetry(
    () => sb.from('qsr_daily_activity')
      .select('loc,hour_slot,product_sales,proj_sales_dollars,transactions,proj_total_transactions')
      .eq('dt', DATE),
    { tries: 4, baseMs: 800, label: 'qsr_daily_activity' }
  );
  if (error) { console.error('[hourly-projection-accuracy] read error:', error.message); process.exit(1); }
  if (!data || !data.length) {
    console.log(`[hourly-projection-accuracy] no rows for ${DATE} — nothing to compute (day may not be synced yet).`);
    return;
  }

  const nowIso = new Date().toISOString();
  const rows = data.map(r => ({
    dt: DATE, hour_slot: String(r.hour_slot), loc: String(r.loc),
    actual_sales: r.product_sales || 0, proj_sales: r.proj_sales_dollars || 0,
    actual_gc: r.transactions || 0, proj_gc: r.proj_total_transactions || 0,
    computed_at: nowIso,
  }));
  console.log(`[hourly-projection-accuracy] ${DATE}: ${rows.length} (loc, hour_slot) rows from `
    + `${new Set(rows.map(r => r.loc)).size} stores`);

  if (DRY) { console.log('[--dry] nothing written.'); return; }

  let saved = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error: werr } = await withRetry(
      () => sb.from('hourly_projection_accuracy').upsert(chunk, { onConflict: 'dt,hour_slot,loc' }),
      { tries: 4, baseMs: 800, label: `upsert[${i}]` }
    );
    if (werr) { console.error(`[hourly-projection-accuracy] write error: ${werr.message}`); process.exitCode = 1; }
    else saved += chunk.length;
  }
  console.log(`[hourly-projection-accuracy] ✓ wrote ${saved}/${rows.length} rows for ${DATE}`);
}

main().catch(e => { console.error('[hourly-projection-accuracy] FATAL', e); process.exit(1); });
