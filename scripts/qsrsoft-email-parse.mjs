#!/usr/bin/env node
// scripts/qsrsoft-email-parse.mjs
// Server-side parse of the emailed QSRSoft CSV reports (Sales Ledger / Daily
// Glimpse / Cash Sheet) that are already ingested to the `qsr-reports` Supabase
// storage bucket by the Gmail poller + ingest-report Edge Function.
//
// WHY: these reports were previously parsed ONLY client-side on login, into
// device-local IndexedDB — so channel mix / 3PO / controls / OEPE / KVS were
// stale after time away and absent on other devices. This job parses them with
// the SAME src/parsers functions the client uses (zero drift) and upserts to
// sales_ledger_daily / daily_glimpse_daily / cash_sheet_daily so they are
// cloud-fresh on every device.
//
// Run:   node scripts/qsrsoft-email-parse.mjs [--days=4] [--debug]
// Env:   VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (reads .env.local too)

import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseSalesLedger, parseDailyGlimpse, parseCashSheet } from '../src/parsers/index.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT  = join(__dir, '..');

// Load .env.local (for local runs; GitHub Actions injects real env vars)
try {
  const env = readFileSync(join(ROOT, '.env.local'), 'utf8');
  for (const line of env.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const args  = process.argv.slice(2);
const DEBUG = args.includes('--debug');
const DAYS  = (() => { const a = args.find(x => x.startsWith('--days=')); return a ? parseInt(a.split('=')[1], 10) : 4; })();

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const BUCKET = 'qsr-reports';

// Normalize loc to short numeric form (strip zero-padding) to match STORE_NAMES
// and qsr_daily_activity summary rows. e.g. '0003708' -> '3708'.
const normLoc = (loc) => { const n = parseInt(String(loc), 10); return Number.isFinite(n) ? String(n) : String(loc || '').trim(); };
// JS Date -> 'YYYY-MM-DD' (runner is UTC; parser builds dates at noon so no drift)
const ymd = (d) => { const dt = d instanceof Date ? d : new Date(d); return isNaN(dt) ? null : dt.toISOString().slice(0, 10); };
// Extract a YYYY-MM-DD hint from a filename/path (QSRSoft names embed the date)
const dateHintFrom = (s) => { const m = String(s || '').match(/(\d{4}-\d{2}-\d{2})/); return m ? new Date(m[1] + 'T12:00:00Z') : new Date(); };
const num = (v) => (v === null || v === undefined || v === '' || Number.isNaN(v)) ? null : v;

// report_type (from pending_reports / ingest-report detectReportType) → handler
const HANDLERS = {
  'sales-ledger':  { table: 'sales_ledger_daily',  parse: (wb, fn) => parseSalesLedger(wb, fn),              map: mapSalesLedger },
  'daily-glimpse': { table: 'daily_glimpse_daily',  parse: (wb, fn) => parseDailyGlimpse(wb, dateHintFrom(fn)), map: mapGlimpse },
  'cash-sheet':    { table: 'cash_sheet_daily',      parse: (wb, fn) => parseCashSheet(wb, fn),                 map: mapCashSheet },
};

function mapSalesLedger(r) {
  return {
    loc: normLoc(r.loc), date: ymd(r.date),
    all_net_sales: num(r.allNetSales), all_net_sales_ly: num(r.allNetSalesLY), sales_vs_ly_pct: num(r.salesVsLYPct),
    gc: num(r.gc), avg_check: num(r.avgCheck),
    dt_sales: num(r.dtSales), dt_gc: num(r.dtGC), dt_avg_chk: num(r.dtAvgChk), dt_pct_total: num(r.dtPctTotal),
    bf_sales: num(r.bfSales), bf_gc: num(r.bfGC), bf_avg_chk: num(r.bfAvgChk), bf_pct_total: num(r.bfPctTotal),
    deliv_sales: num(r.delivSales), deliv_gc: num(r.delivGC), deliv_avg_chk: num(r.delivAvgChk), deliv_pct_total: num(r.delivPctTotal),
    mop_sales: num(r.mopSales), mop_gc: num(r.mopGC), mop_avg_chk: num(r.mopAvgChk), mop_pct_total: num(r.mopPctTotal),
    kiosk_sales: num(r.kioskSales), kiosk_gc: num(r.kioskGC), kiosk_avg_chk: num(r.kioskAvgChk), kiosk_pct_total: num(r.kioskPctTotal),
    fc_sales: num(r.fcSales), fc_gc: num(r.fcGC), fc_pct_total: num(r.fcPctTotal),
    in_store_sales: num(r.inStoreSales), in_store_gc: num(r.inStoreGC), in_store_pct_total: num(r.inStorePctTotal),
    eat_in_sales: num(r.eatInSales), eat_in_gc: num(r.eatInGC),
    updated_at: new Date().toISOString(),
  };
}

function mapGlimpse(r) {
  return {
    loc: normLoc(r.loc), date: ymd(r.date),
    all_net_sales: num(r.allNetSales), sales_vs_prior: num(r.salesVsPrior), sales_vs_prior_pct: num(r.salesVsPriorPct),
    dt_sales: num(r.dtSales), dt_gc: num(r.dtGC), dt_avg_check: num(r.dtAvgCheck),
    gc: num(r.gc), avg_check: num(r.avgCheck), labor_pct: num(r.laborPct),
    promo_amt: num(r.promoAmt), promo_pct: num(r.promoPct),
    pos_over_cnt: num(r.posOverCnt), pos_over_amt: num(r.posOverAmt),
    cash_os: num(r.cashOS), cash_os_pct: num(r.cashOSPct),
    t_red_void_cnt: num(r.tRedVoidCnt), t_red_deleted_cnt: num(r.tRedDeletedCnt),
    oepe: num(r.oepe), oepe_full: num(r.oepeFull), parked_pct: num(r.parkedPct),
    kvst: num(r.kvst), kvs_items: num(r.kvsItems), kvs_healthy: num(r.kvsHealthy),
    brk_car_cnt: num(r.brkCarCnt), lu_car_cnt: num(r.luCarCnt), dn_car_cnt: num(r.dnCarCnt),
    digital_pct_sales: num(r.digitalPctSales), app_pct_sales: num(r.appPctSales),
    updated_at: new Date().toISOString(),
  };
}

function mapCashSheet(r) {
  return {
    loc: normLoc(r.loc), date: ymd(r.date),
    all_net_sales: num(r.allNetSales), gc: num(r.gc), avg_check: num(r.avgCheck),
    doordash_sales: num(r.doorDashSales), doordash_gc: num(r.doorDashGC),
    ubereats_sales: num(r.uberEatsSales), ubereats_gc: num(r.uberEatsGC),
    grubhub_sales: num(r.grubhubSales), grubhub_gc: num(r.grubhubGC),
    total_3po_sales: num(r.total3poSales), total_3po_gc: num(r.total3poGC),
    mop_eat_in: num(r.mopEatIn), mop_takeout: num(r.mopTakeout),
    kiosk_eat_in: num(r.kioskEatIn), kiosk_takeout: num(r.kioskTakeout),
    cash_os: num(r.cashOS), cash_os_pct: num(r.cashOSPct),
    cash_ref_cnt: num(r.cashRefCnt), cash_ref_amt: num(r.cashRefAmt),
    cashless_ref_cnt: num(r.cashlessRefCnt), cashless_ref_amt: num(r.cashlessRefAmt),
    pos_over_cnt: num(r.posOverCnt), pos_over_amt: num(r.posOverAmt),
    t_red_void_cnt: num(r.tRedVoidCnt), t_red_deleted_cnt: num(r.tRedDeletedCnt),
    updated_at: new Date().toISOString(),
  };
}

async function upsertRows(table, rows) {
  const clean = rows.filter(r => r.loc && r.date);
  if (!clean.length) return 0;
  const BATCH = 500;
  let total = 0;
  for (let i = 0; i < clean.length; i += BATCH) {
    const slice = clean.slice(i, i + BATCH);
    const { error } = await sb.from(table).upsert(slice, { onConflict: 'loc,date' });
    if (error) { console.error(`  ✗ upsert ${table} batch ${i}: ${error.message}`); continue; }
    total += slice.length;
  }
  return total;
}

async function main() {
  // Process a rolling recent window (idempotent upserts) rather than keying off
  // pending_reports.processed — the client parse sets that flag on login, and we
  // must not depend on a user having logged in.
  const cutoff = new Date(Date.now() - DAYS * 86400000).toISOString();
  const { data: pending, error } = await sb
    .from('pending_reports')
    .select('filename,storage_path,report_type,uploaded_at')
    .in('report_type', Object.keys(HANDLERS))
    .gte('uploaded_at', cutoff)
    .order('uploaded_at', { ascending: true });
  if (error) { console.error('pending_reports query failed:', error.message); process.exit(1); }
  if (!pending || !pending.length) { console.log(`No sales-ledger/daily-glimpse/cash-sheet reports in the last ${DAYS} day(s).`); return; }

  console.log(`Found ${pending.length} report(s) to parse (last ${DAYS} day(s)).`);
  const summary = {};
  for (const p of pending) {
    const h = HANDLERS[p.report_type];
    if (!h) continue;
    // Daily Glimpse has no per-row date column — its rows are dated from the
    // filename. A weekly/monthly Glimpse file therefore collapses all its
    // store-days onto one date and would overwrite good daily rows. Daily
    // Glimpse files already cover every date, so skip the rollups.
    if (p.report_type === 'daily-glimpse' && /weekly|monthly/i.test(p.filename)) {
      if (DEBUG) console.log(`  · skip rollup ${p.filename} (glimpse has no date column)`);
      continue;
    }
    try {
      const { data: blob, error: dlErr } = await sb.storage.from(BUCKET).download(p.storage_path);
      if (dlErr || !blob) { console.error(`  ✗ download ${p.storage_path}: ${dlErr?.message || 'no data'}`); continue; }
      const buf = Buffer.from(await blob.arrayBuffer());
      const wb  = XLSX.read(buf, { type: 'buffer' });
      const parsed = h.parse(wb, p.filename) || [];
      const rows = parsed.map(h.map);
      const n = await upsertRows(h.table, rows);
      summary[h.table] = (summary[h.table] || 0) + n;
      if (DEBUG) console.log(`  ✓ ${p.filename} → ${h.table}: ${n} row(s)`);
    } catch (e) {
      console.error(`  ✗ ${p.filename} (${p.report_type}): ${e.message}`);
    }
  }
  console.log('Done. Upserted:', JSON.stringify(summary));
}

main().catch(e => { console.error(e); process.exit(1); });
