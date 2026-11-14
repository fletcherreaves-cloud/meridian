#!/usr/bin/env node
// scripts/qsrsoft-register-audit-pull.mjs
// QSRSoft Register Audit — per-employee, per-store, per-day cash/loss-prevention exceptions
// (drawer sales/GC, T-Reds before/after, POS over-rings, manual refund/overring, refunds,
// promo, manager/employee meals, cash over/short). Dispatch #35 (memory/dispatch-35.md),
// implementing against the real endpoint dispatch #34's live captures confirmed
// (memory/dispatch-34-phase0a-findings.md Part 1) — dispatch #33's shipped scaffold (PR #444)
// had an unverified, deliberately-not-attempted endpoint guess; this replaces it with the
// confirmed one. Phase 0a of memory/plan-security-loss-prevention.md — rung 2 of the
// attribution ladder in memory/data-acquisition-shopping-list.md §A.
//
// ⚠️ MIGRATED 2026-11-14 (GH issue #1314) — the endpoint below is DEAD. QSRSoft deprecated/
// denied it (403 "User is not authorized ... explicit deny in an identity-based policy") on
// every run since 2026-09-21, ~2 months straight, confirmed NOT a token problem (login + token
// capture both succeeded every time; the deny was on the resource itself). The real, currently
// live endpoint — found by watching v3.myqsrsoft.com's own network traffic while it successfully
// rendered this exact report — is documented in the NEW ENDPOINT block directly below. See
// memory/finding-register-audit-pull-endpoint-migration-2026-11-14.md for the full live
// verification (every formula below was checked against real on-screen values, not guessed).
//
// ── NEW ENDPOINT (confirmed live 2026-11-14) ────────────────────────────────────────────────
//   GET https://api.reports.myqsrsoft.com/data_layer/v1/cash/register-audit-by-employee
//       ?nsn=<comma-separated, UNPADDED>&orgId=...&enterpriseName=McDonalds
//       &startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&dsd=d&weekStart=3&nsd=d
//       &registerType=cashier&selectCols=<comma-separated allowlist, REQUIRED -- a 400 names
//       the missing param if omitted, but an UNRECOGNIZED column name is silently dropped from
//       the response with no error, confirmed by probing ~25 plausible names for the still-
//       missing Cash O/S field and getting back rows with only the base identity fields each
//       time -- so a dropped column looks exactly like one that was never requested; do not
//       "fix" a missing field by adding a plausible-sounding name to this list without an
//       independent confirmation the response actually carries it>
//   Header: x-auth-token: <token>   -- REQUIRED here, unlike the old endpoint. Confirmed this
//       must be a token captured from a real logged-in browser SESSION (the same Playwright
//       fallback this script already had); a token minted directly via getFreshToken()
//       (Cognito, no browser) gets a plain 401 on this endpoint even though it works fine for
//       several OTHER qsrsoft pulls on this same host (ops-pull, etc. post-#312). The direct
//       path below is kept (cheap, fails fast) but will reliably hit AUTH_FAILED:401 and fall
//       through to Playwright -- that is expected, not a regression to chase.
//   registerType is STILL validated server-side against [cashier, manager, preparer] (confirmed
//       live: an invalid value gets a real 400 naming the allowlist) -- the existing 3-calls-
//       per-window architecture (dispatch #59, concatenating cashier+manager+preparer) is
//       UNCHANGED.
// ONE call covers a date RANGE across ALL 27 stores (comma-separated nsn) — chunked below into
// 21-day windows (matching lifelenz-pull.mjs's own chunking convention) so a large backfill
// doesn't risk one oversized/timing-out response, not because the API requires it.
//
// 🔴 registerType is a REQUEST FILTER, not a response field (dispatch #59). The Register Audit
// offers Cashier · Manager · Preparer; this pull previously hardcoded 'cashier', so audit_rows
// held one third of the report. Collecting all three means calling this SAME endpoint once per
// type and concatenating -- the API never tells you which type a row belongs to, since you asked
// for exactly one type per call. mapRow() below takes registerType as an argument for this
// reason, not because it's ever present on `r`.
//
// This is a GRAIN CHANGE on audit_rows, not just a wider fetch. One employee can work a Cashier
// drawer and a Manager drawer on the SAME day; the table's PK was (loc, date, emp), so the second
// row would silently overwrite the first. The PK is now (loc, date, emp, register_type) --
// supabase/schema-audit-rows-register-type.sql, backfilled 'cashier' not null default so no
// existing row is ambiguous. See memory/dispatch-59.md for the full consumer audit (two readers
// assumed the old grain: src/utils/register-audit.js's days/cashOSDays/avgCashOS, and
// src/engine/security-baselines.js's personalBaseline -- both fixed in the same dispatch).
//
// mapRow() field mapping — RE-VERIFIED LIVE 2026-11-14 against the new endpoint (see the
// migration note above). Every formula marked CONFIRMED below was checked by comparing a
// computed value against the actual on-screen number for a real employee/date on the live
// Register Audit report (memory/finding-register-audit-pull-endpoint-migration-2026-11-14.md
// has the exact rows and arithmetic) -- not inferred from field names that merely sound right,
// which is exactly the trap dispatch #44's manOverringQty incident (below) already burned this
// script on once:
//   - emp = empName (NOT empId). Unchanged reasoning from the original dispatch #35/#51 mapping
//     (still true): parseRegisterAudit's manual-upload path has always keyed audit_rows' PK on
//     the employee NAME string, never an ID -- switching the auto-pull to an ID would split-brain
//     the (loc,date,emp) history across manual vs auto rows.
//   - empId = empId (same concept as the old empID, just lower-cased on the new endpoint).
//   - drawerGC = netSalesEatinQty + netSalesTakeoutQty. The old endpoint had one explicit
//     `transactions` field; the new one splits it into dine-in/takeout counts with no combined
//     total. CONFIRMED by reproducing Average Check exactly for two real employees (Aaden W:
//     netSalesAmt 4083.73 / (0+351) = 11.6346 -> displayed $11.63; Abbigail H: 2285.57/(0+210) =
//     10.883 -> displayed $10.88).
//   - avgCheck = netSalesAmt / drawerGC. CONFIRMED by the same two rows above.
//   - tRedBPct/tRedAPct = tredsBeforeAmt/netSalesAmt and tredsAfterAmt/netSalesAmt --
//     **a REAL correction, not a rename**: the OLD formula (kept from dispatch #34's original,
//     never actually confirmed) was qty/transactions, a RATE. The new endpoint's displayed
//     T-Red Before/After Pct is actually a $ SHARE OF SALES. CONFIRMED on Abbigail H's row:
//     T-Red Before $28.92/qty 10, sales $2285.57 -> 28.92/2285.57 = 1.2655% -> displayed "1.27%";
//     T-Red After $4.59/qty 1 -> 4.59/2285.57 = 0.2009% -> displayed "0.20%". The qty/transactions
//     hypothesis was checked and REJECTED first (it does not reproduce either displayed value).
//     tRedBAvg/tRedAAvg (amt/qty) are unchanged and still confirmed (28.92/10=2.89 -> "$2.89";
//     4.59/1=4.59 -> "$4.59").
//   - promoPct = promoAmt/netSalesAmt. CONFIRMED (Aaden W: 76.68/4083.73 = 1.878% -> "1.88%").
//   - manualRefAmt = manualRefundOverrings. The new endpoint merged what used to be a distinct
//     "manOverringAmt" field into one `manualRefundOverrings` field -- still kept as its OWN
//     column, NOT folded into posOverAmt (same reasoning as before: parseRegisterAudit's manual
//     Excel column is a separate "Manual Refund/Overring $").
//   - manualRefCnt stays mapped to null. CONFIRMED ABSENT AGAIN on the new endpoint, same as the
//     original dispatch #44 finding on the old one (memory/finding-cash003-manoverringqty-
//     absent-2026-08-20.md) -- there is still no Qty sibling for this field on either endpoint
//     generation, and the live UI's own "Manual Refund/Overring" column is still $-only.
//   - refundCnt/refundCash/refundCashless = cashRefundsQty+cashlessRefundsQty / cashRefundsAmt /
//     cashlessRefundsAmt. Same two-pair shape the old endpoint's refundCashAmt/refundCashlessAmt
//     already had, under new field names -- NOT independently re-verified against a nonzero
//     on-screen example this pass (every real row sampled during migration happened to have
//     zero refunds), flagged as a smaller residual judgment call, not a blind guess: the field
//     names are self-describing and match the existing cash/cashless split 1:1.
//   - 🔴 cashOSDollar / cashOSPct (Over/Short $ / %) are left mapping to NULL -- CONFIRMED
//     UNAVAILABLE from this endpoint's selectCols, not a lazy skip. Tried and ruled out: (1) every
//     arithmetic combination of the available fields (countedCash, closingReading, openingReading,
//     skimTotal, netSalesAmt, cashlessSalesAmt) against a real displayed value of -$0.16 --
//     candidates ranged from -$3,090 to +$330, nowhere close; (2) ~25 plausible field-name guesses
//     (overShortAmt, cashOverShort, expectedCash, cashVariance, startingTill, cashSalesAmt, etc.)
//     added to selectCols -- every one came back 200 OK but silently absent from the response,
//     which is this endpoint's documented behavior for ANY unrecognized column name, so a 200
//     response proves nothing. `closingReading`/`openingReading` are very likely a cumulative
//     register METER reading spanning more than this one employee's shift (their delta, ~$4,439,
//     doesn't match this employee's own ~$4,084 in sales either), not a simple per-employee
//     cash-drawer baseline -- so there is no cheap derivation left to try with the fields exposed
//     here. This is the SAME "measured, not fabricated" discipline the old manOverringQty finding
//     already set for this file: do not re-guess a plausible-sounding field/formula for this
//     without a fresh live confirmation. CASH-003 and any other Cash O/S-dependent consumer logic
//     should fall back to its existing manual-upload source for this field until/unless a
//     confirmed derivation surfaces.
//
// Required env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, QSRSOFT_USERNAME, QSRSOFT_PASSWORD
// Optional:     QSRSOFT_AUDIT_DAYS_BACK (first-run history, default 90 -- widen once the report's
//               own retention is confirmed, per CLAUDE.md's "data depth is never the limiter"),
//               QSRSOFT_AUDIT_DAYS_RECENT (rolling re-pull, default 4),
//               QSRSOFT_AUDIT_START_DATE/END_DATE (explicit backfill), QSRSOFT_AUDIT_DEBUG=1

import { safeCreateClient } from './lib/safe-supabase-client.mjs';
import { makeOutcomeTracker } from './lib/pull-outcome.mjs';
import { getFreshToken } from './lib/qsrsoft-auth.mjs';
import { logPartitionCoverage, checkFreshness } from './_pipeline-contract.mjs';
import { tokenizeRows } from '../src/engine/identity-vault.js';

const BASE   = 'https://api.reports.myqsrsoft.com';
const ORG_ID = 'a546d4ef-684a-4f25-8bc0-6580af068875';
const STORE_NSNS = [
  3708, 5183, 5985, 6178, 6838, 6972, 10034, 10422, 10915, 11657, 13113, 18213,
  20475, 24471, 29760, 31357, 32525, 33109, 33222, 33704, 34222, 35064, 35242,
  37566, 38609, 43380, 43701, 44689,
];
const STORE_LOCS = STORE_NSNS.map(n => String(n).padStart(7, '0'));

const DAYS_BACK   = parseInt(process.env.QSRSOFT_AUDIT_DAYS_BACK   || '90', 10);
const DAYS_RECENT = parseInt(process.env.QSRSOFT_AUDIT_DAYS_RECENT || '4',  10);
const START_DATE  = (process.env.QSRSOFT_AUDIT_START_DATE || '').trim();
const END_DATE    = (process.env.QSRSOFT_AUDIT_END_DATE   || '').trim();
const DEBUG       = process.env.QSRSOFT_AUDIT_DEBUG === '1';

// Guarded, not unconditional -- mapRow() is unit-tested by importing this module directly
// (no supabase/fetch dependency in that function itself), and vitest's environment has neither
// env var set. An unconditional createClient() call at module scope would throw at import time
// before a test could even reach mapRow(), the same class of bug fixed in dispatch #33's own
// header (that dispatch's own note on why src/lib/supabase.js can't be imported here either).
const supabase = (process.env.VITE_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
  ? safeCreateClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null;

const fmtDate = d => d.toISOString().slice(0, 10);
const addDay  = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
const nsn7    = n => String(n).padStart(7, '0');
const num     = v => (v == null || v === '' || isNaN(Number(v))) ? null : Number(v);
const ratio   = (n, d) => (n == null || d == null || !d) ? null : n / d;

function chunkDateRange(startDate, endDate, maxDays = 21) {
  const chunks = [];
  let cur = new Date(startDate + 'T12:00:00Z');
  const end = new Date(endDate + 'T12:00:00Z');
  while (cur <= end) {
    const chunkEndCandidate = addDay(cur, maxDays - 1);
    const chunkEnd = chunkEndCandidate > end ? end : chunkEndCandidate;
    chunks.push({ start: fmtDate(cur), end: fmtDate(chunkEnd) });
    cur = addDay(chunkEnd, 1);
  }
  return chunks;
}

// Server-side twin of src/lib/supabase.js's saveAuditRows() -- NOT a straight import (confirmed
// under plain Node: that file's `import.meta.env` is undefined outside Vite and it opens the
// anon key, not service role -- every pull script in this repo avoids importing it for exactly
// that reason). Column mapping and onConflict copied verbatim from src/lib/supabase.js:859.
async function saveAuditRows(rows) {
  if (!rows?.length) return { saved: 0, errors: [] };
  // dispatch #37 (Direction B) -- one token lookup/create per DISTINCT employee name in this
  // batch, not per row. emp_token is additive alongside emp (the name column) -- see
  // supabase/schema-identity-vault.sql's header for why the PK/emp column itself is untouched.
  const tokenMap = await tokenizeRows(supabase, rows, 'emp');
  const upsert = rows.map(r => ({
    loc: r.loc, date: r.date, emp: r.emp,
    register_type: r.registerType || 'cashier',
    emp_id:   r.empId ?? null,
    emp_token: tokenMap.get((r.emp || '').trim()) ?? null,
    drawer_sales:    r.drawerSales    ?? null,
    avg_check:       r.avgCheck       ?? null,
    drawer_opens:    r.drawerOpens    ?? null,
    drawer_gc:       r.drawerGC       ?? null,
    emp_meal_disc:   r.empMealDisc    ?? null,
    emp_meal_ch:     r.empMealCh      ?? null,
    manual_ref_amt:  r.manualRefAmt   ?? null,
    manual_ref_cnt:  r.manualRefCnt   ?? null,
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
    const { error } = await supabase.from('audit_rows').upsert(upsert.slice(i, i + CHUNK), { onConflict: 'loc,date,emp,register_type' });
    if (error) { console.warn('[audit_rows] save error:', error); errors.push(error.message); }
    else saved += Math.min(CHUNK, upsert.length - i);
  }
  return { saved, errors };
}

// ── Gap detection (mirrors qsrsoft-dar-pull.mjs / qsrsoft-ops-pull.mjs exactly) ──────────────
async function getLatestDate() {
  const { data, error } = await supabase.from('audit_rows').select('date').order('date', { ascending: false }).limit(1).single();
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

// Response row (new data_layer/v1/cash/register-audit-by-employee field names, confirmed live
// 2026-11-14) → the shape saveAuditRows() above expects. Exported for unit testing (no
// fetch/supabase dependency in this function itself).
// `registerType` (dispatch #59) is NOT read off `r` -- the API returns no such field, since it's
// the REQUEST filter that produced this exact response (see the header comment). The caller
// supplies which of the three calls this row came from; defaults to 'cashier' so a caller that
// doesn't pass it (every pre-#59 test and call site) keeps its exact prior behaviour.
export function mapRow(r, registerType = 'cashier') {
  const sales   = num(r.netSalesAmt);
  // drawerGC: no single combined-transaction field on this endpoint -- sum the dine-in/takeout
  // split. null+null stays null (not 0) via num()'s own undefined-safe contract; only sum when
  // at least one leg resolved, so a genuinely all-missing row doesn't silently become "0 GC".
  const eatIn = num(r.netSalesEatinQty), takeout = num(r.netSalesTakeoutQty);
  const trans = (eatIn == null && takeout == null) ? null : (eatIn || 0) + (takeout || 0);
  const tRedB   = num(r.tredsBeforeQty), tRedBAmt = num(r.tredsBeforeAmt);
  const tRedA   = num(r.tredsAfterQty),  tRedAAmt = num(r.tredsAfterAmt);
  const promo   = num(r.promoAmt);
  return {
    loc:  nsn7(r.storeNum),
    date: r.date,
    emp:  (r.empName || '').trim(),
    registerType,
    empId: (r.empId == null ? '' : String(r.empId).trim()) || null,
    drawerSales:    sales,
    avgCheck:       ratio(sales, trans),
    drawerOpens:    num(r.drawerOpensQty),
    drawerGC:       trans,
    empMealDisc:    num(r.empMealDiscountAmt),
    empMealCh:      num(r.empMealDiscountQty),
    manualRefAmt:   num(r.manualRefundOverrings),
    manualRefCnt:   null, // confirmed absent on this endpoint too -- see header comment
    refundCnt:      (num(r.cashRefundsQty) || 0) + (num(r.cashlessRefundsQty) || 0),
    refundCash:     num(r.cashRefundsAmt),
    refundCashless: num(r.cashlessRefundsAmt),
    mgrMealAmt:     num(r.mgrMealDiscountAmt),
    mgrMealCnt:     num(r.mgrMealDiscountQty),
    cashOSDollar:   null, // confirmed unavailable from this endpoint -- see header comment
    cashOSPct:      null,
    posOverAmt:     num(r.overringAmt),
    posOverCnt:     num(r.overringQty),
    promoAmt:       promo,
    promoCnt:       num(r.promoQty),
    promoPct:       ratio(promo, sales),
    tRedBCnt:       tRedB,
    tRedBDollar:    tRedBAmt,
    tRedBPct:       ratio(tRedBAmt, sales), // $ share of sales, NOT qty/transactions -- see header
    tRedBAvg:       ratio(tRedBAmt, tRedB),
    tRedACnt:       tRedA,
    tRedADollar:    tRedAAmt,
    tRedAPct:       ratio(tRedAAmt, sales), // $ share of sales, NOT qty/transactions -- see header
    tRedAAvg:       ratio(tRedAAmt, tRedA),
  };
}

// ── Fetch (direct or Playwright in-browser) ──────────────────────────────────────────────────
// Everything below this point was rewritten 2026-11-14 for the endpoint migration (GH #1314).
// The old Referer-only auth theory (no x-auth-token needed) is DEAD on the new endpoint --
// confirmed live: the new endpoint 401s without a valid x-auth-token, and that token must come
// from a real browser SESSION (Playwright login), not a bare Cognito mint (getFreshToken() alone
// gets a plain 401 here even though it works for several other qsrsoft pulls on this host).
const REPORT_PAGE = 'https://v3.myqsrsoft.com/reports/mcd/controlsCash/registerAudit';
const REFERER = REPORT_PAGE;
// The Register Audit offers all three; dispatch #59 collects all three (was cashier-only).
// STILL TRUE on the new endpoint -- registerType is server-validated against this exact list
// (confirmed live: a bogus value gets a real 400 naming the allowlist).
export const REGISTER_TYPES = ['cashier', 'manager', 'preparer'];
// The exact set of columns this script needs, confirmed live 2026-11-14 (see the big comment
// above mapRow() for which displayed UI column each backs and how it was verified). An
// unrecognized column name is silently DROPPED from the response (no error) -- so adding a new
// one here is not itself proof it exists; confirm it against a real response first.
const SELECT_COLS = [
  'storeNum', 'empId', 'empName', 'date',
  'netSalesAmt', 'netSalesEatinQty', 'netSalesTakeoutQty', 'drawerOpensQty',
  'empMealDiscountAmt', 'empMealDiscountQty', 'mgrMealDiscountAmt', 'mgrMealDiscountQty',
  'manualRefundOverrings',
  'overringAmt', 'overringQty',
  'cashRefundsAmt', 'cashRefundsQty', 'cashlessRefundsAmt', 'cashlessRefundsQty',
  'promoAmt', 'promoQty',
  'tredsBeforeQty', 'tredsBeforeAmt', 'tredsAfterQty', 'tredsAfterAmt',
];
export const buildUrl = (startDate, endDate, registerType = 'cashier') =>
  `${BASE}/data_layer/v1/cash/register-audit-by-employee?` + new URLSearchParams({
    nsn: STORE_NSNS.join(','), orgId: ORG_ID, enterpriseName: 'McDonalds',
    startDate, endDate, dsd: 'd', weekStart: '3', nsd: 'd',
    registerType, selectCols: SELECT_COLS.join(','),
  });
// Confirmed live 2026-11-14: this endpoint REQUIRES x-auth-token (unlike the old one, which
// authenticated by Origin/Referer alone). Origin/Referer are still sent -- harmless, and match
// what the real browser call itself sends.
const HDRS = (t) => ({
  Accept: '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  Origin: 'https://v3.myqsrsoft.com',
  Referer: REFERER,
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
  ...(t ? { 'x-auth-token': t } : {}),
});

// Response envelope, confirmed live 2026-11-14 by direct observation (not guessed): a plain
// `{ result: [...] }`. Bare array / {data:[...]} kept as defensive fallbacks only, matching the
// same uncertainty-hedge every other qsrsoft pull in this repo uses for an undocumented API.
// Logs the SHAPE only (top-level keys, array lengths), never values: this payload is
// employee-attributed and every row is PII.
export function extractRows(body, unit) {
  if (Array.isArray(body)) return body;
  const rows = body?.result || body?.resp || body?.data;
  if (Array.isArray(rows)) return rows;
  if (body && typeof body === 'object') {
    const shape = Object.entries(body).map(([k, v]) =>
      Array.isArray(v) ? `${k}[${v.length}]` : `${k}:${v === null ? 'null' : typeof v}`).join(' ');
    console.error(`[audit-pull] ${unit}: unrecognized envelope -- top-level shape: {${shape}}`);
  } else {
    console.error(`[audit-pull] ${unit}: unrecognized body type: ${typeof body}`);
  }
  return [];
}

async function fetchChunk(url, token, evalPage) {
  if (evalPage) {
    // page.request (Playwright's APIRequestContext) rather than page.evaluate(fetch) -- NOT
    // bound by the page's own CORS policy, since v3.myqsrsoft.com -> api.reports.myqsrsoft.com
    // is cross-origin and a page.evaluate(fetch) would be CORS-blocked in page context.
    const hdrs = { Accept: 'application/json', Referer: REFERER };
    if (token) hdrs['x-auth-token'] = token;
    const r = await evalPage.request.get(url, { headers: hdrs, timeout: 30000 });
    if (r.status() === 401 || r.status() === 403) {
      const detail = await r.text().catch(() => '(body unreadable)');
      console.error(`[audit-pull] browser-context ${r.status()} body: ${detail.slice(0, 500) || '(empty)'}`);
      throw new Error(`AUTH_FAILED:${r.status()}`);
    }
    if (!r.ok()) throw new Error(`HTTP ${r.status()}: ${(await r.text()).slice(0, 200)}`);
    const body = await r.json();
    return extractRows(body, url.replace(/^.*register-audit-by-employee\?/, "").slice(0, 60));
  }
  const resp = await fetch(url, { headers: HDRS(token) });
  if (resp.status === 401 || resp.status === 403) {
    // Log the response body/headers BEFORE throwing -- per CLAUDE.md's standing rule, once a
    // hypothesis is disproven the next step is a MEASUREMENT, not another hypothesis.
    const detail = await resp.text().catch(() => '(body unreadable)');
    const diagHdrs = ['x-amzn-errortype', 'x-amzn-requestid', 'x-amzn-remapped-authorization',
      'www-authenticate', 'x-amzn-apigateway-id', 'apigw-requestid']
      .map(h => (resp.headers.get(h) ? `${h}=${resp.headers.get(h)}` : null)).filter(Boolean).join(' · ');
    console.error(`[audit-pull] ${resp.status} body: ${detail.slice(0, 500) || '(empty)'}`);
    if (diagHdrs) console.error(`[audit-pull] ${resp.status} headers: ${diagHdrs}`);
    throw new Error(`AUTH_FAILED:${resp.status}`);
  }
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  const body = await resp.json();
  return extractRows(body, url.replace(/^.*register-audit-by-employee\?/, "").slice(0, 60));
}

async function resolveToken(token, forceRemint) {
  return typeof token === 'function' ? await token({ forceRemint }) : token;
}

// `token` is either a plain string (Playwright mode, one browser-captured token for the whole
// run) or getFreshToken itself (direct mode) -- resolved per chunk, same re-mint-near-expiry +
// one forced re-mint-and-retry-on-401 pattern as qsrsoft-ops-pull.mjs's runAll().
async function runAll(token, chunks, evalPage, tracker, coveredStores) {
  let total = 0;
  // dispatch #47 -- diagnostic only, DEBUG-gated (QSRSOFT_AUDIT_DEBUG=1), logged ONCE per run (not
  // per chunk -- three chunks emitting the identical key list is noise, per the dispatch's own
  // instruction). Key names ONLY, never values: every row is employee-attributed PII, same
  // discipline extractRows() already uses one level up for the envelope shape. This settles
  // whether CASH-003's manual_ref_cnt field exists under a different name than manOverringQty
  // (finding-cash003-manoverringqty-absent-2026-08-20.md measured it null in 19,985 backfilled
  // rows) -- the field-name guess was wrong, this is the measurement that guess stood in for.
  let loggedShapeThisRun = false;
  for (const chunk of chunks) {
    // Dispatch #59: one chunk now means three calls, one per register type -- the endpoint
    // filters server-side, so there is no way to get Cashier+Manager+Preparer in one response.
    // Nested inside the chunk loop (not a separate outer pass) so a Manager-call auth failure on
    // one chunk doesn't require a second full pass over every chunk to retry it.
    for (const registerType of REGISTER_TYPES) {
      const unit = `${chunk.start}..${chunk.end}:${registerType}`;
      try {
        const tok = await resolveToken(token, false);
        let rows;
        try {
          rows = await fetchChunk(buildUrl(chunk.start, chunk.end, registerType), tok, evalPage);
        } catch (e) {
          if (String(e.message).startsWith('AUTH_FAILED') && typeof token === 'function') {
            console.log(`[audit-pull] ${unit}: cached token rejected — forcing a re-mint and retrying once`);
            const freshTok = await resolveToken(token, true);
            rows = await fetchChunk(buildUrl(chunk.start, chunk.end, registerType), freshTok, evalPage);
          } else throw e;
        }
        if (!rows.length) { console.log(`[audit-pull] ${unit}: 0 rows returned`); continue; }
        if (DEBUG && !loggedShapeThisRun && rows[0] && typeof rows[0] === 'object') {
          console.log(`[audit-pull] DEBUG response row shape (key names only): ${Object.keys(rows[0]).join(',')}`);
          loggedShapeThisRun = true;
        }
        const mapped = rows.map(r => mapRow(r, registerType)).filter(r => r.emp && r.loc && r.loc !== '0000000' && r.date);
        const dropped = rows.length - mapped.length;
        // UNCONDITIONAL, not DEBUG-gated. A wrong field name in mapRow() drops every row and prints
        // "N rows -> 0 saved", which reads exactly like "the report is empty" -- the same silent-zero
        // class as the envelope bug above, one layer further in. If most rows drop, print the first
        // row's KEY NAMES so the mismatch is diagnosable without another run. Key names only: this
        // payload is employee-attributed and every value is PII.
        if (dropped) {
          console.log(`[audit-pull] ${unit}: ${dropped}/${rows.length} row(s) dropped (missing emp/loc/date)`);
          if (mapped.length === 0 && rows[0] && typeof rows[0] === 'object') {
            console.error(`[audit-pull] ${unit}: ALL rows dropped -- first row's field names: ${Object.keys(rows[0]).join(',')}`);
          }
        }
        const { saved, errors } = await saveAuditRows(mapped);
        if (errors.length) throw new Error(errors[0]);
        total += saved;
        for (const r of mapped) coveredStores.add(r.loc);
        console.log(`[audit-pull] ${unit}: ${rows.length} rows → ${saved} saved`);
      } catch (e) {
        if (String(e.message).startsWith('AUTH_FAILED')) throw e;
        console.error(`[audit-pull] ${unit} ERROR: ${e.message}`);
        tracker.fail(unit, e.message);
      }
      await new Promise(r => setTimeout(r, 150));
    }
  }
  return total;
}

// Two-path auth per CLAUDE.md's standing "new automated pull" rule. Direct-first (getFreshToken)
// will reliably fail on THIS endpoint -- confirmed live 2026-11-14, a bare Cognito mint gets a
// plain 401 here even on this same api.reports.myqsrsoft.com host where it works for several
// other pulls -- so Playwright is the real path for this one, kept as a graceful fallback rather
// than reworked into the primary, so a future change to this endpoint's auth requirement (if
// QSRSoft ever accepts a direct-minted token here too) needs no structural change to pick up.
async function viaPlaywright(chunks, tracker, coveredStores) {
  const u = process.env.QSRSOFT_USERNAME, pw = process.env.QSRSOFT_PASSWORD;
  if (!u || !pw) { console.error('[auth] no QSRSOFT_USERNAME/PASSWORD — cannot use Playwright fallback'); return null; }
  const { chromium } = await import('playwright');
  const { mkdirSync } = await import('fs');
  try { mkdirSync('screenshots', { recursive: true }); } catch {}
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ userAgent: HDRS('')['User-Agent'] })).newPage();
  page.setDefaultTimeout(180000);
  let token = null;
  // Record EVERY api.reports.* request the page makes, not just token-bearing ones -- a run
  // that captures no token at all still distinguishes "the page fired API calls but none carried
  // x-auth-token" from "the page fired no API calls at all" via this log, which point at
  // completely different root causes. Query string is stripped: it carries no secret, but it is
  // long and noisy, and the PATH is the diagnostic.
  const seenApiUrls = [];
  // async listener: allHeaders() below is async. Playwright allows this -- the handler's promise
  // is not awaited by the event loop, but the token capture only has to complete before the
  // navigation waits finish, which they comfortably do.
  page.on('request', async req => {
    if (!req.url().includes('api.reports.myqsrsoft.com')) return;
    const bare = req.url().replace(/\?.*/, '');
    if (!seenApiUrls.includes(bare)) seenApiUrls.push(bare);
    // allHeaders() (async, COMPLETE) rather than headers() (sync, PROVISIONAL) -- Playwright's
    // headers() can omit headers the browser attaches after interception.
    const all = await req.allHeaders();
    const t = all['x-auth-token'];
    if (t && t.length > 20 && !token) token = t;
  });
  const snap = name => page.screenshot({ path: `screenshots/${name}`, fullPage: true }).catch(() => {});
  try {
    await page.goto('https://v3.myqsrsoft.com', { waitUntil: 'networkidle', timeout: 45000 });
    const userSel = ['input[name="username"]', 'input[name="email"]', 'input[type="email"]', '#username', '#email', 'input[autocomplete="username"]'].join(', ');
    await page.waitForSelector(userSel, { timeout: 20000 });
    await page.fill(userSel, u);
    await page.fill('input[type="password"], input[name="password"]', pw);
    await page.click('button[type="submit"], input[type="submit"], .btn-primary, button:has-text("Login"), button:has-text("Sign in")');
    await page.waitForLoadState('networkidle', { timeout: 30000 });
    console.log('[auth] post-login url:', page.url());
    await snap('audit-01-post-login.png');

    await page.goto(REPORT_PAGE, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 5000));
    console.log('[auth] report page url:', page.url(), '| token captured:', !!token);
    await snap('audit-02-report-page.png');

    // The new endpoint (GH #1314 migration) REQUIRES x-auth-token -- if none was captured here,
    // every subsequent fetchChunk call will 401. Log what the page actually called so a future
    // failure is diagnosable without another run, same discipline the direct path's 401/403
    // handler already uses.
    if (!token) {
      console.log('[auth] ✗ no x-auth-token captured from the page\'s own API calls -- every');
      console.log('[auth] subsequent request will 401. api.reports requests seen during navigation:',
        seenApiUrls.length ? JSON.stringify(seenApiUrls) : '(none)');
      await snap('audit-03-no-token-captured.png');
    } else {
      console.log(`[auth] ✓ token captured (${token.length} chars)`);
    }
    console.log(`[auth] pulling ${chunks.length} chunk(s) via the browser context…`);
    // Catch AUTH_FAILED here rather than letting it escape. viaPlaywright() is called from
    // INSIDE main()'s catch block (the direct path's own failure handler), so anything thrown
    // here has nothing left to catch it and kills the process with a FATAL stack trace --
    // skipping makeOutcomeTracker's finalize() and its "zero rows saved -- a quiet no-op, not a
    // success" reporting. That regressed in the same change that started calling runAll() on the
    // no-token path (run 32397005570). This is the fallback of last resort: it should report a
    // clean failure, never crash. Returning 0 preserves the original contract.
    try {
      return await runAll(token, chunks, page, tracker, coveredStores);
    } catch (e) {
      console.error(`[auth] ✗ browser-context pull failed: ${e.message}`);
      tracker.fail('playwright-fallback', e.message);
      return 0;
    }
  } finally { await browser.close(); }
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
  const fresh = checkFreshness(latestForFreshness, { warnAfterHours: 30, errorAfterHours: 54, label: 'audit-pull' });
  if (fresh.message) (fresh.status === 'error' ? console.error : console.warn)(fresh.message);

  const chunks = chunkDateRange(startDate, endDate, 21);
  console.log(`[audit-pull] ${chunks.length} chunk(s) × ${REGISTER_TYPES.length} register type(s), ${STORE_LOCS.length} store(s): ${startDate} → ${endDate}`);

  const tracker = makeOutcomeTracker('audit-pull');
  const coveredStores = new Set();
  // One requested unit per (chunk, registerType) -- must match runAll()'s own `unit` strings
  // exactly, or tracker.finalize()'s failRate = failed/requested denominator goes wrong the
  // moment one register type's calls fail (dispatch #59: 3x the calls per chunk, not 1x).
  const requestedUnits = chunks.flatMap(c => REGISTER_TYPES.map(t => `${c.start}..${c.end}:${t}`));

  let totalSaved = 0;
  try {
    totalSaved = await runAll(getFreshToken, chunks, null, tracker, coveredStores);
  } catch (e) {
    console.log(`[auth] mint-and-fetch failed (${e.message}) — falling back to Playwright`);
    totalSaved = await viaPlaywright(chunks, tracker, coveredStores) || 0;
  }

  console.log(`[audit-pull] done — ${totalSaved} rows saved.`);
  logPartitionCoverage(coveredStores, STORE_LOCS, { label: 'audit-pull', kind: 'store' });
  const code = tracker.finalize({
    requestedUnits, totalSaved,
    formatRerun: () => `QSRSOFT_AUDIT_START_DATE=${startDate} QSRSOFT_AUDIT_END_DATE=${endDate}`,
  });
  process.exit(code);
}

// Only run main() when executed directly (not when imported for mapRow() unit tests).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => { console.error('[audit-pull] FATAL:', e); process.exit(1); });
}
