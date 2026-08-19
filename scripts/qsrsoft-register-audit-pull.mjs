#!/usr/bin/env node
// scripts/qsrsoft-register-audit-pull.mjs
// QSRSoft Register Audit — per-employee, per-store, per-day cash/loss-prevention exceptions
// (drawer sales/opens, T-Reds before/after, POS over-rings, refunds, promo, manager/employee
// meals, cash over/short). Dispatch #33 (memory/dispatch-33.md), Phase 0a of
// memory/plan-security-loss-prevention.md — rung 2 of the attribution ladder in
// memory/data-acquisition-shopping-list.md §A. Everything except the pull already existed:
// parser (src/parsers/index.js:974 parseRegisterAudit, manual-upload only), Supabase table
// (audit_rows, PK loc,date,emp), loader (loadAuditRows), risk-scoring engine
// (src/utils/register-audit.js analyzeRegisterAudit).
//
// ── HONEST STATUS: the report endpoint is NOT YET CONFIRMED ─────────────────────────────────
// This dispatch's own text says finding it requires a live DevTools capture (QSRSoft UI →
// Network tab, run the Register Audit export, capture the request) — this session has NO
// QSRSoft credentials and confirmed its network egress to v3.myqsrsoft.com/
// api.reports.myqsrsoft.com is blocked (proxy 403), so that capture could not be done here.
// Rather than guess a plausible-looking URL and risk silently writing WRONG rows into
// personnel-sensitive data (data-acquisition-shopping-list.md §A explicitly flags Register
// Audit as personnel-sensitive, gated by the 2026-08-13 policy), fetchRegisterAuditDay() below
// throws a clear, loud error naming exactly what's missing. Everything ELSE in this file —
// auth, backfill/gap-detection windowing, the save path (a server-side twin of
// src/lib/supabase.js's saveAuditRows(), see that function's own comment for why it's a twin
// and not a straight import), coverage/freshness instrumentation — is real, complete, and does
// not need to change once the endpoint is confirmed; only fetchRegisterAuditDay()'s URL/params
// and mapRow()'s field names need filling in. See fetchRegisterAuditDay()'s own comment for a
// grounded starting hypothesis.
//
// Required env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, QSRSOFT_USERNAME, QSRSOFT_PASSWORD
// Optional:     QSRSOFT_AUDIT_DAYS_BACK (first-run history, default 90 — widen once the report's
//               own retention is confirmed, per CLAUDE.md's "data depth is never the limiter"),
//               QSRSOFT_AUDIT_DAYS_RECENT (rolling re-pull, default 4),
//               QSRSOFT_AUDIT_START_DATE/END_DATE (explicit backfill), QSRSOFT_AUDIT_DEBUG=1

import { createClient } from '@supabase/supabase-js';
import { makeOutcomeTracker } from './lib/pull-outcome.mjs';
import { getFreshToken } from './lib/qsrsoft-auth.mjs';
import { logPartitionCoverage, checkFreshness } from './_pipeline-contract.mjs';

const BASE   = 'https://api.reports.myqsrsoft.com';
const ORG_ID = 'a546d4ef-684a-4f25-8bc0-6580af068875';
const STORE_NSNS = [
  3708, 5183, 5985, 6178, 6838, 6972, 10034, 10422, 10915, 11657, 13113, 18213,
  20475, 24471, 29760, 31357, 32525, 33109, 33222, 33704, 34222, 35064, 35242,
  37566, 38609, 43380, 43701,
];
const STORE_LOCS = STORE_NSNS.map(n => String(n).padStart(7, '0'));

const DAYS_BACK   = parseInt(process.env.QSRSOFT_AUDIT_DAYS_BACK   || '90', 10);
const DAYS_RECENT = parseInt(process.env.QSRSOFT_AUDIT_DAYS_RECENT || '4',  10);
const START_DATE  = (process.env.QSRSOFT_AUDIT_START_DATE || '').trim();
const END_DATE    = (process.env.QSRSOFT_AUDIT_END_DATE   || '').trim();
const DEBUG       = process.env.QSRSOFT_AUDIT_DEBUG === '1';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const fmtDate = d => d.toISOString().slice(0, 10);
const addDay  = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };

// Server-side twin of src/lib/supabase.js's saveAuditRows() — NOT a straight import, because
// that file opens its own client via `import.meta.env` (a Vite build-time transform) against
// the ANON key; both fail outright under plain Node (confirmed: `import.meta.env` is
// `undefined` here, so the module throws at import time before this script could even call
// it), which is exactly why every other pull script in this repo (dar-pull, ops-pull, …)
// reimplements its own local upsert against the SERVICE ROLE key instead of importing
// src/lib/supabase.js. Column mapping and onConflict below are copied verbatim from that
// file's saveAuditRows (src/lib/supabase.js:859) so the two stay one contract even though
// they can't be one function across the browser/Node boundary.
async function saveAuditRows(rows) {
  if (!rows?.length) return { saved: 0, errors: [] };
  const toDate = r => r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date).slice(0, 10);
  const upsert = rows.map(r => ({
    loc:             String(r.loc),
    date:            toDate(r),
    emp:             r.emp || '',
    drawer_sales:    r.drawerSales    ?? null,
    avg_check:       r.avgCheck       ?? null,
    drawer_opens:    r.drawerOpens    ?? null,
    drawer_gc:       r.drawerGC       ?? null,
    emp_meal_disc:   r.empMealDisc    ?? null,
    emp_meal_ch:     r.empMealCh      ?? null,
    manual_ref_amt:  r.manualRefAmt   ?? null,
    refund_cnt:      r.refundCnt      ?? null,
    refund_cash:     r.refundCash     ?? null,
    refund_cashless: r.refundCashless ?? null,
    mgr_meal_amt:    r.mgrMealAmt     ?? null,
    mgr_meal_cnt:    r.mgrMealCnt     ?? null,
    cash_os_dollar:  r.cashOSDollar   ?? null,
    cash_os_pct:     r.cashOSPct      ?? null,
    pos_over_amt:    r.posOverAmt     ?? null,
    pos_over_cnt:    r.posOverCnt     ?? null,
    promo_amt:       r.promoAmt       ?? null,
    promo_cnt:       r.promoCnt       ?? null,
    promo_pct:       r.promoPct       ?? null,
    t_red_b_cnt:     r.tRedBCnt       ?? null,
    t_red_b_pct:     r.tRedBPct       ?? null,
    t_red_b_avg:     r.tRedBAvg       ?? null,
    t_red_b_dollar:  r.tRedBDollar    ?? null,
    t_red_a_cnt:     r.tRedACnt       ?? null,
    t_red_a_pct:     r.tRedAPct       ?? null,
    t_red_a_avg:     r.tRedAAvg       ?? null,
    t_red_a_dollar:  r.tRedADollar    ?? null,
    updated_at:      new Date().toISOString(),
  }));
  const CHUNK = 500;
  let saved = 0; const errors = [];
  for (let i = 0; i < upsert.length; i += CHUNK) {
    const { error } = await supabase.from('audit_rows').upsert(upsert.slice(i, i + CHUNK), { onConflict: 'loc,date,emp' });
    if (error) { console.warn('[audit_rows] save error:', error); errors.push(error.message); }
    else saved += Math.min(CHUNK, upsert.length - i);
  }
  return { saved, errors };
}

// ── Gap detection (mirrors qsrsoft-dar-pull.mjs / qsrsoft-ops-pull.mjs exactly) ──────────────
async function getLatestDate() {
  const { data, error } = await supabase.from('audit_rows').select('date').order('date', { ascending: false }).limit(1).single();
  // #399's lesson, same as every other pull script's getLatestDate(): only PGRST116 ("0 rows")
  // means genuinely empty; any other error (network/RLS/timeout/522) must abort, not silently
  // fall through to the biggest backfill window.
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`[audit-pull] getLatestDate() read failed -- ${error.code}: ${error.message}`);
  }
  return data?.date ? new Date(data.date + 'T12:00:00Z') : null;
}

async function getDateRange() {
  const today = new Date();
  if (START_DATE) {
    const e = END_DATE || fmtDate(today);
    console.log(`[audit-pull] explicit backfill window ${START_DATE} → ${e}`);
    return { startDate: START_DATE, endDate: e, latestForFreshness: await getLatestDate() };
  }
  const latest = await getLatestDate();
  const daysSince = latest ? Math.floor((today - latest) / 86400000) : DAYS_BACK;
  const back = Math.min(Math.max(DAYS_RECENT, daysSince + DAYS_RECENT), DAYS_BACK);
  const s = fmtDate(addDay(today, -back));
  console.log(latest
    ? `[audit-pull] latest in DB: ${fmtDate(latest)} (${daysSince}d ago) — pulling ${back} days back`
    : `[audit-pull] no existing data — pulling ${back} days of history`);
  return { startDate: s, endDate: fmtDate(today), latestForFreshness: latest };
}

// ── THE ONE UNCONFIRMED PIECE ─────────────────────────────────────────────────────────────
// Fetch Register Audit rows for ONE store × ONE date. Returns an array in the SAME shape
// parseRegisterAudit's own output uses (src/parsers/index.js:1031-1054 — emp/loc/date plus
// the 20-ish metric fields saveAuditRows expects), so saveAuditRows() below needs no changes
// regardless of what the real API response looks like.
//
// GROUNDED STARTING HYPOTHESIS (not verified — cross-referenced from existing code, not a
// DevTools capture): comparing parseRegisterAudit's column list against qsrsoft-ops-pull.mjs's
// COLS_CASH_EXTRACT (its cash-sheet-extract endpoint), the two are near-identical field-for-
// field -- T-Reds Before/After count+$, POS over-rings count+$, cash/cashless refunds,
// promo, employee/manager meal discounts, cash over/short. cash-sheet-extract already
// aggregates these at STORE grain; Register Audit is very plausibly the SAME underlying report
// segmented by EMPLOYEE instead, the same way qsr_peaks_sales segments qtr-hr-sales by
// time_slice via segmentBy=peaks and qsr_service_stats segments service/statistics by
// segmentBy=summary/segmentNames=timeSlice (see ENDPOINTS in qsrsoft-ops-pull.mjs). Worth
// trying `${BASE}/reporting/v2/cash/cash-sheet-extract` (or a sibling path) with an added
// segmentBy=employee/segmentNames=cashier-style param FIRST during the DevTools capture,
// before assuming an entirely separate report family — but capture and confirm the real
// request rather than trusting this guess; a wrong-but-200-OK response could silently write
// incorrect rows into personnel-sensitive data (data-acquisition-shopping-list.md §A), which
// is exactly why this function throws instead of attempting the guess as live code.
async function fetchRegisterAuditDay(_token, _date) {
  throw new Error(
    '[audit-pull] fetchRegisterAuditDay() not yet implemented -- the Register Audit report ' +
    'endpoint has not been captured (see this file\'s header comment for the required DevTools ' +
    'steps and a grounded-but-unverified starting hypothesis). Capture the real request from a ' +
    'session with live QSRSoft access, then fill in this function\'s URL/params and confirm the ' +
    'response maps to the field list saveAuditRows() below expects.'
  );
}

// Response row → the SAME shape parseRegisterAudit's manual-upload path already produces
// (src/parsers/index.js:1031), so saveAuditRows (src/lib/supabase.js:859) needs no changes.
// Field NAMES on the left are deliberately whatever the confirmed API returns -- adjust once
// real field names are known; the shape on the RIGHT (saveAuditRows' contract) must not drift.
function mapRow(_apiRow, _loc, _date) {
  throw new Error('[audit-pull] mapRow() depends on fetchRegisterAuditDay()\'s real response shape -- fill in alongside it.');
}

async function pullOneDay(token, date, tracker, coveredStores) {
  let dayTotal = 0;
  for (const loc of STORE_LOCS) {
    try {
      const apiRows = await fetchRegisterAuditDay(token, date, loc);
      if (!apiRows.length) { if (DEBUG) console.log(`[audit-pull]   ${loc} ${date}: no data`); continue; }
      const rows = apiRows.map(r => mapRow(r, loc, date));
      const { saved, errors } = await saveAuditRows(rows);
      if (errors.length) throw new Error(errors[0]);
      dayTotal += saved;
      if (saved > 0) coveredStores.add(loc);
    } catch (e) {
      // fetchRegisterAuditDay()'s not-yet-implemented error is the SAME cause for every
      // (loc, date) pair -- abort the whole run on the first one instead of retrying it
      // 27×N times and printing the identical message that many times.
      if (e.message.includes('not yet implemented')) throw e;
      console.error(`[audit-pull]   ${loc} ${date} ERROR: ${e.message}`);
      tracker.fail(`${loc} ${date}`, e.message);
    }
  }
  return dayTotal;
}

// ── Main ───────────────────────────────────────────────────────────────────────────────────
async function main() {
  if (!process.env.VITE_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[audit-pull] Missing Supabase env'); process.exit(1);
  }
  if (!process.env.QSRSOFT_USERNAME || !process.env.QSRSOFT_PASSWORD) {
    console.error('[audit-pull] Missing QSRSOFT_USERNAME/QSRSOFT_PASSWORD'); process.exit(1);
  }

  const { startDate, endDate, latestForFreshness } = await getDateRange();
  // warnAfterHours/errorAfterHours match lifelenz-pull.mjs/qsrsoft-dar-pull.mjs's own
  // dispatch #32 thresholds -- one/two missed daily runs, same reasoning (this dispatch's own
  // plan file names Register Audit as the highest-value pull on the security list; a silent
  // staleness here matters at least as much as on the operational pulls).
  const fresh = checkFreshness(latestForFreshness, { warnAfterHours: 30, errorAfterHours: 54, label: 'audit-pull' });
  if (fresh.message) (fresh.status === 'error' ? console.error : console.warn)(fresh.message);

  const dates = [];
  for (let d = new Date(startDate + 'T12:00:00Z'); fmtDate(d) <= endDate; d = addDay(d, 1)) dates.push(fmtDate(d));
  console.log(`[audit-pull] ${dates.length} date(s) × ${STORE_LOCS.length} store(s): ${startDate} → ${endDate}`);

  const tracker = makeOutcomeTracker('audit-pull');
  const coveredStores = new Set();
  const requestedUnits = dates.flatMap(d => STORE_LOCS.map(loc => `${loc} ${d}`));

  let totalSaved = 0;
  for (const date of dates) {
    const token = await getFreshToken();
    totalSaved += await pullOneDay(token, date, tracker, coveredStores);
  }

  console.log(`[audit-pull] done — ${totalSaved} rows saved.`);
  logPartitionCoverage(coveredStores, STORE_LOCS, { label: 'audit-pull', kind: 'store' });
  const code = tracker.finalize({
    requestedUnits, totalSaved,
    formatRerun: () => `QSRSOFT_AUDIT_START_DATE=${startDate} QSRSOFT_AUDIT_END_DATE=${endDate}`,
  });
  process.exit(code);
}

main().catch(e => { console.error('[audit-pull] FATAL:', e); process.exit(1); });
