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
// Confirmed endpoint (dispatch #34's live capture):
//   GET https://api.reports.myqsrsoft.com/reports/mcd/controlsCash/regAudit
//       ?nsn=<comma-separated, UNPADDED>&orgId=...&enterpriseName=McDonalds
//       &startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&dsd=d&weekStart=3&nsd=d
//       &resultType=byDateEmployee&registerType=cashier
//   Header: X-Auth-Token: <token>
// ONE call covers a date RANGE across ALL 27 stores (comma-separated nsn) — chunked below into
// 21-day windows (matching lifelenz-pull.mjs's own chunking convention) so a large backfill
// doesn't risk one oversized/timing-out response, not because the API requires it.
//
// mapRow() field mapping — resolved against src/utils/register-audit.js's analyzeRegisterAudit
// (the actual consumer) and src/parsers/index.js:974's parseRegisterAudit (the manual-upload
// path's own column semantics), not fabricated:
//   - emp = empName (NOT empID). Chosen because parseRegisterAudit's manual-upload path has
//     always keyed audit_rows' PK on the employee NAME string, never an ID -- switching the
//     auto-pull to empID would split-brain the (loc,date,emp) history for the same real person
//     across manual vs auto rows, breaking freshest-wins continuity with 5+ months of existing
//     manually-uploaded data. A same-name collision at one store is an existing, unchanged risk,
//     not one this dispatch introduces.
//   - drawerGC = transactions. parseRegisterAudit's own header list calls this column "Drawer
//     GC"/"GC" (guest count); analyzeRegisterAudit uses it as the denominator for its own
//     avgCheck computation (totalSales/totalGC) -- transactions is the only response field that
//     fits that role.
//   - manualRefAmt = manOverringAmt, NOT folded into posOverAmt. parseRegisterAudit's Excel
//     column for this is literally "Manual Refund/Overring $" -- a distinct concept from "POS
//     Overrings $"/"POS Overrings Cnt" (-> posOverAmt/posOverCnt, from overringAmt/overringQty).
//     The manual Excel export already treats these as two separate columns; manOverringAmt's own
//     name matches the "Manual Refund/Overring" concept far better than a fold-in.
//   - avgCheck, cashOSPct, promoPct, tRedBPct/tRedBAvg, tRedAPct/tRedAAvg are NOT present as
//     pre-computed fields in the API response (parseRegisterAudit's manual path just READS these
//     from Excel columns QSRSoft pre-computes there -- it doesn't derive them, so "mirror its
//     derivation logic" isn't literally available). Derived here the way dispatch #34/#35's own
//     text suggests (rate = qty/denominator, avg = amt/qty, pct = amt/sales) -- confirmed via
//     analyzeRegisterAudit that NONE of these five are actually consumed by the risk-scoring
//     engine today (it recomputes its own avgCheck from drawerSales/drawerGC and never reads
//     r.cashOSPct/tRedBPct/tRedAPct/tRedBAvg/tRedAAvg/promoPct at all) -- populated anyway for
//     schema completeness/future panels since the derivation is a straightforward, well-defined
//     ratio, not a fabricated value, and null would be equally defensible; this is the
//     documented judgment call, not a silent guess.
//
// Required env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, QSRSOFT_USERNAME, QSRSOFT_PASSWORD
// Optional:     QSRSOFT_AUDIT_DAYS_BACK (first-run history, default 90 -- widen once the report's
//               own retention is confirmed, per CLAUDE.md's "data depth is never the limiter"),
//               QSRSOFT_AUDIT_DAYS_RECENT (rolling re-pull, default 4),
//               QSRSOFT_AUDIT_START_DATE/END_DATE (explicit backfill), QSRSOFT_AUDIT_DEBUG=1

import { createClient } from '@supabase/supabase-js';
import { makeOutcomeTracker } from './lib/pull-outcome.mjs';
import { getFreshToken } from './lib/qsrsoft-auth.mjs';
import { logPartitionCoverage, checkFreshness } from './_pipeline-contract.mjs';
import { tokenizeRows } from '../src/engine/identity-vault.js';

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

// Guarded, not unconditional -- mapRow() is unit-tested by importing this module directly
// (no supabase/fetch dependency in that function itself), and vitest's environment has neither
// env var set. An unconditional createClient() call at module scope would throw at import time
// before a test could even reach mapRow(), the same class of bug fixed in dispatch #33's own
// header (that dispatch's own note on why src/lib/supabase.js can't be imported here either).
const supabase = (process.env.VITE_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
  ? createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
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
    emp_token: tokenMap.get((r.emp || '').trim()) ?? null,
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

// Response row (dispatch #34's captured field names) → the shape saveAuditRows() above expects.
// Exported for unit testing (no fetch/supabase dependency in this function itself).
export function mapRow(r) {
  const sales   = num(r.allNetSales);
  const trans   = num(r.transactions);
  const tRedB   = num(r.tRedBeforeQty), tRedBAmt = num(r.tRedBeforeAmt);
  const tRedA   = num(r.tRedAfterQty),  tRedAAmt = num(r.tRedAfterAmt);
  const promo   = num(r.promoAmt);
  const overShort = num(r.overShortAmt);
  return {
    loc:  nsn7(r.nsn),
    date: r.busnDt,
    emp:  (r.empName || '').trim(),
    drawerSales:    sales,
    avgCheck:       ratio(sales, trans),
    drawerOpens:    num(r.drawerOpens),
    drawerGC:       trans,
    empMealDisc:    num(r.empMealDiscAmt),
    empMealCh:      num(r.empMealDiscQty),
    manualRefAmt:   num(r.manOverringAmt),
    refundCnt:      (num(r.refundCashQty) || 0) + (num(r.refundCashlessQty) || 0),
    refundCash:     num(r.refundCashAmt),
    refundCashless: num(r.refundCashlessAmt),
    mgrMealAmt:     num(r.mgrMealDiscAmt),
    mgrMealCnt:     num(r.mgrMealDiscQty),
    cashOSDollar:   overShort,
    cashOSPct:      ratio(overShort, sales),
    posOverAmt:     num(r.overringAmt),
    posOverCnt:     num(r.overringQty),
    promoAmt:       promo,
    promoCnt:       num(r.promoQty),
    promoPct:       ratio(promo, sales),
    tRedBCnt:       tRedB,
    tRedBDollar:    tRedBAmt,
    tRedBPct:       ratio(tRedB, trans),
    tRedBAvg:       ratio(tRedBAmt, tRedB),
    tRedACnt:       tRedA,
    tRedADollar:    tRedAAmt,
    tRedAPct:       ratio(tRedA, trans),
    tRedAAvg:       ratio(tRedAAmt, tRedA),
  };
}

// ── Fetch (direct or Playwright in-browser) ──────────────────────────────────────────────────
// REFERER is the SPECIFIC report page, not the bare site root. This is a real difference from
// what shipped, and the current best hypothesis for the AUTH_FAILED:403 that has failed every
// run since 2026-08-20 (memory/dispatch35-register-audit-implementation.md):
//
//   qsrsoft-ops-pull.mjs  -- WORKS with a direct minted token against this SAME host --
//   sends Referer 'https://v3.myqsrsoft.com/reports/mcd/shift/operationsReport', i.e. the report
//   page the call belongs to. This script shipped with a bare 'https://v3.myqsrsoft.com/'.
//
// That fits the observed symptom specifically: a 403 (authenticated but not authorized for THIS
// request) rather than a 401 (bad/expired credential) -- and the token is known good, since it
// is freshly minted and re-minted on retry. It also matches how dispatch #34's capture was
// necessarily made: the owner's DevTools session was ON the regAudit page, so the real working
// request carried that page as its Referer.
//
// NOT yet verified against live QSRSoft -- no session in this build's history has had real
// credentials. If a workflow_dispatch run still 403s with this in place, the Referer theory is
// dead and the next candidate is the UI-interaction hypothesis in dispatch35's own writeup
// (the report may not fire its API until a date range + run/export click). Record whichever way
// it goes rather than leaving the next session to re-derive it.
const REFERER = 'https://v3.myqsrsoft.com/reports/mcd/controlsCash/regAudit';
const buildUrl = (startDate, endDate) => `${BASE}/reports/mcd/controlsCash/regAudit?` + new URLSearchParams({
  nsn: STORE_NSNS.join(','), orgId: ORG_ID, enterpriseName: 'McDonalds',
  startDate, endDate, dsd: 'd', weekStart: '3', nsd: 'd',
  resultType: 'byDateEmployee', registerType: 'cashier',
});
const HDRS = t => ({ 'X-Auth-Token': t, Accept: 'application/json', Origin: 'https://v3.myqsrsoft.com', Referer: REFERER, 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36' });

// Response envelope shape wasn't captured explicitly in dispatch #34's findings (only the
// per-row field names were) -- accept bare array, {result:[...]}, or {data:[...]}, matching the
// exact defensive fallback qsrsoft-ops-pull.mjs's own fetchRows() already uses for the same
// uncertainty across its own six endpoints.
async function fetchChunk(url, token, evalPage) {
  if (evalPage) {
    // page.request (Playwright's APIRequestContext), NOT page.evaluate(fetch). Two reasons, both
    // measured rather than assumed (run 32396347757 -- see viaPlaywright's comment):
    //   1. It sends the browser context's COOKIES. The page's own regAudit call carries no
    //      x-auth-token, so the app authenticates this endpoint by session -- this reproduces
    //      how the app itself does it instead of replaying a token the endpoint rejects.
    //   2. It is not bound by the page's CORS policy. The previous page.evaluate(fetch) failed
    //      with "Failed to fetch" precisely because v3.myqsrsoft.com -> api.reports.* is
    //      cross-origin; running the request in Playwright rather than in the page avoids that
    //      entirely.
    // The token is still sent when one was captured -- harmless if ignored, and it keeps the
    // path working unchanged if this endpoint ever does accept one.
    const hdrs = { Accept: 'application/json', Referer: REFERER };
    if (token) hdrs['X-Auth-Token'] = token;
    const r = await evalPage.request.get(url, { headers: hdrs, timeout: 30000 });
    if (r.status() === 401 || r.status() === 403) {
      const detail = await r.text().catch(() => '(body unreadable)');
      console.error(`[audit-pull] browser-context ${r.status()} body: ${detail.slice(0, 500) || '(empty)'}`);
      throw new Error(`AUTH_FAILED:${r.status()}`);
    }
    if (!r.ok()) throw new Error(`HTTP ${r.status()}: ${(await r.text()).slice(0, 200)}`);
    const body = await r.json();
    return Array.isArray(body) ? body : (body?.result || body?.data || []);
  }
  const resp = await fetch(url, { headers: HDRS(token) });
  if (resp.status === 401 || resp.status === 403) {
    // Log the response body/headers BEFORE throwing. This was a real diagnostic gap: the line
    // below already reads the body for every OTHER non-ok status, but 401/403 -- the two that
    // most need explaining -- discarded it, so three consecutive failed runs (2026-08-20)
    // produced nothing but the bare status code, and two successive theories (browser-session-
    // required, then a wrong Referer) were both formed and tested without ever reading what the
    // server actually said. An API gateway 403 nearly always carries a reason; AWS ones also put
    // it in x-amzn-errortype. Per CLAUDE.md's standing rule -- once a hypothesis is disproven the
    // next step is a MEASUREMENT, not another hypothesis -- this is that measurement.
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
  return Array.isArray(body) ? body : (body?.result || body?.data || []);
}

async function resolveToken(token, forceRemint) {
  return typeof token === 'function' ? await token({ forceRemint }) : token;
}

// `token` is either a plain string (Playwright mode, one browser-captured token for the whole
// run) or getFreshToken itself (direct mode) -- resolved per chunk, same re-mint-near-expiry +
// one forced re-mint-and-retry-on-401 pattern as qsrsoft-ops-pull.mjs's runAll().
async function runAll(token, chunks, evalPage, tracker, coveredStores) {
  let total = 0;
  for (const chunk of chunks) {
    const unit = `${chunk.start}..${chunk.end}`;
    try {
      const tok = await resolveToken(token, false);
      let rows;
      try {
        rows = await fetchChunk(buildUrl(chunk.start, chunk.end), tok, evalPage);
      } catch (e) {
        if (String(e.message).startsWith('AUTH_FAILED') && typeof token === 'function') {
          console.log(`[audit-pull] ${unit}: cached token rejected — forcing a re-mint and retrying once`);
          const freshTok = await resolveToken(token, true);
          rows = await fetchChunk(buildUrl(chunk.start, chunk.end), freshTok, evalPage);
        } else throw e;
      }
      if (!rows.length) { if (DEBUG) console.log(`[audit-pull] ${unit}: no data`); continue; }
      const mapped = rows.map(mapRow).filter(r => r.emp && r.loc && r.loc !== '0000000' && r.date);
      if (mapped.length < rows.length && DEBUG) console.log(`[audit-pull] ${unit}: ${rows.length - mapped.length} row(s) dropped (missing emp/loc/date)`);
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
  return total;
}

// Two-path auth per CLAUDE.md's standing "new automated pull" rule. Direct-first (getFreshToken,
// matching qsrsoft-ops-pull.mjs's now-proven pattern for this SAME host after #312), Playwright
// as fallback -- CLAUDE.md's own DAR-era note that api.reports.myqsrsoft.com needs a browser
// session predates #312's fix making direct-first work for ops-pull's endpoints on this same
// host, so both paths are implemented rather than assuming either one alone is sufficient.
// The intermediate report-page navigation URL below is a plausible-but-unconfirmed guess
// (mirroring the DAR/ops-pull UI<->API path-naming symmetry: api "controlsCash/regAudit" <->
// v3 "reports/mcd/controlsCash/regAudit") -- if wrong, this degrades gracefully to the same
// in-browser-fetch-trigger fallback ops-pull's own viaPlaywright() already relies on when its
// own navigation heuristic doesn't yield a token.
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
  // Record EVERY api.reports.* request the page makes, not just token-bearing ones -- mirroring
  // qsrsoft-ops-pull.mjs's own seenApiUrls log. "token captured: false" alone is ambiguous: it
  // cannot distinguish "the page fired API calls but none carried x-auth-token" from "the page
  // fired no API calls at all." Those point at completely different root causes -- a wrong
  // endpoint vs. a report that doesn't run until a UI interaction (the remaining hypothesis in
  // dispatch35's writeup) -- and the current logging can't tell them apart. Query string is
  // stripped: it carries no secret, but it is long and noisy, and the PATH is the diagnostic.
  const seenApiUrls = [];
  let seenApiHeaderNames = [];
  page.on('request', req => {
    if (!req.url().includes('api.reports.myqsrsoft.com')) return;
    const bare = req.url().replace(/\?.*/, '');
    if (!seenApiUrls.includes(bare)) seenApiUrls.push(bare);
    // NAMES only -- a Cookie or Authorization VALUE is a live credential and must never be
    // logged. The names alone answer the open question (how does the app authenticate this
    // call, given it sends no x-auth-token) without leaking anything.
    if (bare.endsWith('/regAudit') && !seenApiHeaderNames.length) {
      seenApiHeaderNames = Object.keys(req.headers()).sort();
    }
    const t = req.headers()['x-auth-token'];
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

    await page.goto('https://v3.myqsrsoft.com/reports/mcd/controlsCash/regAudit', { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 5000));
    console.log('[auth] report page url:', page.url(), '| token captured:', !!token);
    await snap('audit-02-report-page.png');

    // MEASURED 2026-08-20 (run 32396347757), and it changed the whole approach:
    //   api.reports requests seen during navigation:
    //     ["https://api.reports.myqsrsoft.com/reports/mcd/controlsCash/regAudit"]
    //   token captured: false
    // The page DOES call this exact endpoint on load -- so the endpoint is right and the
    // "report needs a UI interaction first" hypothesis is dead -- but it calls it with NO
    // x-auth-token header. The app authenticates this endpoint some other way (cookies, almost
    // certainly, set by the v3 login). That single fact explains every failure to date: the
    // direct Node path sends a token this endpoint does not accept (403), and the old
    // page.evaluate(fetch) trigger died with "Failed to fetch" because v3.myqsrsoft.com ->
    // api.reports.myqsrsoft.com is CROSS-ORIGIN and CORS-blocked in page context.
    //
    // So: stop trying to capture and replay a token, and instead issue the request through the
    // browser CONTEXT (page.request, Playwright's APIRequestContext). It shares the context's
    // cookie jar -- authenticating the same way the app itself does -- and is NOT subject to the
    // page's CORS policy, since it runs in Playwright rather than in the page.
    if (!token) {
      console.log('[auth] no x-auth-token seen on the page\'s own API calls — the app authenticates');
      console.log('[auth] this endpoint by session instead; proceeding via the browser cookie jar.');
      console.log('[auth] api.reports requests seen during navigation:',
        seenApiUrls.length ? JSON.stringify(seenApiUrls) : '(none)');
      // Header NAMES only, never values -- a Cookie/Authorization value is a live credential.
      // This confirms (or refutes) the cookie theory on the next run rather than assuming it.
      if (seenApiHeaderNames.length) {
        console.log('[auth] header names on the page\'s own regAudit call:', JSON.stringify(seenApiHeaderNames));
      }
      await snap('audit-03-pre-context-request.png');
    } else {
      console.log(`[auth] ✓ token captured (${token.length} chars)`);
    }
    // Proceed either way. `token` may be null here -- fetchChunk's browser-context branch sends
    // it only if present, and relies on cookies otherwise.
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
  console.log(`[audit-pull] ${chunks.length} chunk(s), ${STORE_LOCS.length} store(s): ${startDate} → ${endDate}`);

  const tracker = makeOutcomeTracker('audit-pull');
  const coveredStores = new Set();
  const requestedUnits = chunks.map(c => `${c.start}..${c.end}`);

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
