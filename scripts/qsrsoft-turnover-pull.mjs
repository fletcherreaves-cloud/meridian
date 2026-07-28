#!/usr/bin/env node
// scripts/qsrsoft-turnover-pull.mjs
// QSRSoft Turnover Report → per-store monthly turnover (incl. the 0-90 metric).
// Feeds the Performance-Review "0-90 Turnover" metric (= 1 − Retained>90%) →
// turnover_monthly. Pulls a trailing multi-month window so each (loc, month) row is
// backfilled/refreshed.
//
// Endpoint (confirmed 2026-07-28):
//   GET https://api.reports.myqsrsoft.com/reporting/v2/people/turnover-report
//       ?nsd=d&nsn=<csv>&orgId=<org>&enterpriseName=McDonalds
//       &startDate=YYYY-MM-01&endDate=YYYY-MM-DD&weekStart=3&dsd=m&jtcType=Crew
//   → { result: { resp: [ {nsn, month:'YYYY-MM', totalHire, totalStaff, terminations,
//        term90, retained90Days, retained90Pct, monthlyAnnualTurnOver, ttmTurnover,
//        threeMonthTurnover, …}, … per store × month … ], totals } }
//   nsd=d ⇒ per-store rows (nsd=s aggregates all stores to nsn "All Selected"). dsd=m ⇒
//   one row per month in the window. jtcType=Crew ⇒ crew turnover (the review metric).
// Parsed with parseTurnoverApi() from src/engine/people-reports.js (one source of truth).
//
// Required env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Auth ladder (mirrors the other people pulls):
//   QSRSOFT_TOKEN → QSRSOFT_COGNITO_TOKEN  (direct)  →  QSRSOFT_USERNAME/PASSWORD (Playwright)
// Optional:
//   TURNOVER_MONTHS=13     — trailing months to pull (default 13)
//   TURNOVER_START=YYYY-MM — explicit window start (overrides TURNOVER_MONTHS)
//   TURNOVER_END=YYYY-MM   — explicit window end   (default: current month)
//   TURNOVER_JTC=Crew      — jtcType filter (default Crew)
//   ROSTER_STORES=3708,…   — subset of NSNs (default all 27)
//   QSRSOFT_DEBUG=1

import { createClient } from '@supabase/supabase-js';
import { parseTurnoverApi } from '../src/engine/people-reports.js';

const API_BASE   = 'https://api.reports.myqsrsoft.com';
const ORG_ID     = 'a546d4ef-684a-4f25-8bc0-6580af068875';
const ENTERPRISE = 'McDonalds';
const REPORT_URL = 'https://v3.myqsrsoft.com/reports/mcd/people/turnoverReport';
const JTC        = (process.env.TURNOVER_JTC || 'Crew').trim();
const DEBUG      = process.env.QSRSOFT_DEBUG === '1';

const STORE_NSNS = (process.env.ROSTER_STORES
  ? process.env.ROSTER_STORES.split(',').map(s => s.trim())
  : [
    3708, 5183, 5985, 6178, 6838, 6972,
    10034, 10422, 10915, 11657, 13113, 18213,
    20475, 24471, 29760, 31357, 32525, 33109,
    33222, 33704, 34222, 35064, 35242, 37566,
    38609, 43380, 43701,
  ]).map(String);

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const pad2 = n => String(n).padStart(2, '0');
// Window: [start-of-month N months back … end-of-window month]. Returns {first,last} ISO dates.
function windowRange() {
  const now = new Date();
  const endMonth = (process.env.TURNOVER_END || '').trim() || `${now.getUTCFullYear()}-${pad2(now.getUTCMonth() + 1)}`;
  const [ey, em] = endMonth.split('-').map(Number);
  let startMonth = (process.env.TURNOVER_START || '').trim();
  if (!startMonth) {
    const months = parseInt(process.env.TURNOVER_MONTHS || '13', 10);
    const d = new Date(Date.UTC(ey, em - 1 - (months - 1), 1));
    startMonth = `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
  }
  const monthEnd = new Date(Date.UTC(ey, em, 0));               // last day of end month
  const today = new Date();
  const end = (today.getUTCFullYear() === ey && today.getUTCMonth() + 1 === em && today < monthEnd) ? today : monthEnd;
  return {
    first: `${startMonth}-01`,
    last: `${end.getUTCFullYear()}-${pad2(end.getUTCMonth() + 1)}-${pad2(end.getUTCDate())}`,
  };
}

function buildUrl() {
  const { first, last } = windowRange();
  const params = new URLSearchParams({
    nsd: 'd', nsn: STORE_NSNS.join(','), orgId: ORG_ID, enterpriseName: ENTERPRISE,
    startDate: first, endDate: last, weekStart: '3', dsd: 'm', jtcType: JTC,
  });
  return `${API_BASE}/reporting/v2/people/turnover-report?${params}`;
}

// turnover-report wraps rows in { result: { resp: [...] } }.
function extractRows(body) {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.result?.resp)) return body.result.resp;
  if (Array.isArray(body?.result)) return body.result;
  if (Array.isArray(body?.resp)) return body.resp;
  return [];
}

// parseTurnoverApi record → turnover_monthly columns (identical to saveTurnoverMonthly).
function toRows(records) {
  return records.map(t => ({
    loc: String(t.loc), period_month: t.month,
    hires: t.hires ?? null, roster_size: t.rosterSize ?? null, terms: t.terms ?? null,
    terms_under_90: t.termsUnder90 ?? null, retained_over_90: t.retainedOver90 ?? null,
    retained_over_90_pct: t.retainedOver90Pct ?? null, monthly_annual_turnover: t.monthlyAnnualTurnover ?? null,
    ttm_turnover: t.ttmTurnover ?? null, three_month_turnover: t.threeMonthTurnover ?? null,
    turnover_090_pct: t.turnover090Pct ?? null, updated_at: new Date().toISOString(),
  }));
}

async function upsert(rows) {
  if (!rows.length) return 0;
  const CHUNK = 500; let saved = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const { error } = await supabase.from('turnover_monthly').upsert(slice, { onConflict: 'loc,period_month' });
    if (error) throw error;
    saved += slice.length;
  }
  return saved;
}

async function fetchDirect(token) {
  const url = buildUrl();
  if (DEBUG) console.log(`[turnover] GET ${url.slice(0, 140)}…`);
  const resp = await fetch(url, {
    headers: {
      'X-Auth-Token': token, 'Accept': 'application/json',
      'Origin': 'https://v3.myqsrsoft.com', 'Referer': `${REPORT_URL}`,
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
    },
  });
  if (resp.status === 401 || resp.status === 403) throw new Error(`AUTH_FAILED:${resp.status}`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${(await resp.text().catch(() => '')).slice(0, 200)}`);
  return extractRows(await resp.json());
}

async function fetchViaPlaywright() {
  const u = process.env.QSRSOFT_USERNAME, pw = process.env.QSRSOFT_PASSWORD;
  if (!u || !pw) { console.error('[auth] no QSRSOFT_USERNAME/PASSWORD for Playwright fallback'); return null; }
  const { chromium } = await import('playwright');
  const { mkdirSync } = await import('node:fs');
  try { mkdirSync('screenshots', { recursive: true }); } catch {}
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36' });
  const page = await context.newPage();
  page.setDefaultTimeout(180000);
  const snap = name => page.screenshot({ path: `screenshots/${name}`, fullPage: true }).catch(() => {});
  const wait = ms => new Promise(r => setTimeout(r, ms));

  let token = null;
  page.on('request', req => {
    if (!req.url().includes('api.reports.myqsrsoft.com')) return;
    const t = req.headers()['x-auth-token'];
    if (t && t.length > 20 && !token) { token = t; if (DEBUG) console.log('[auth] token captured from', req.url().replace(/\?.*/, '')); }
  });

  try {
    console.log('[auth] navigating to v3.myqsrsoft.com…');
    await page.goto('https://v3.myqsrsoft.com', { waitUntil: 'networkidle', timeout: 45000 });
    await snap('turnover-01-landing.png');

    const userSel = [
      'input[name="username"]', 'input[name="email"]', 'input[type="email"]',
      '#username', '#email', 'input[autocomplete="username"]',
      'input[placeholder*="email" i]', 'input[placeholder*="username" i]',
    ].join(', ');
    const passSel = 'input[type="password"], input[name="password"]';
    const foundUser = await page.waitForSelector(userSel, { timeout: 20000 }).then(() => true).catch(() => false);
    if (foundUser) {
      const userLoc = page.locator(userSel).first();
      const passLoc = page.locator(passSel).first();
      await userLoc.click({ clickCount: 3 }); await userLoc.pressSequentially(u, { delay: 12 });
      await passLoc.click({ clickCount: 3 }).catch(() => {}); await passLoc.pressSequentially(pw, { delay: 12 }).catch(() => {});
      const signIn = page.getByRole('button', { name: 'Sign in', exact: true });
      const clicked = await signIn.click({ timeout: 8000 }).then(() => true).catch(() => false);
      if (!clicked) await passLoc.press('Enter').catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
      await wait(2500);
    } else {
      console.log('[auth] no login form (already authenticated?) — continuing');
    }
    await snap('turnover-02-post-login.png');
    console.log('[auth] post-login url:', page.url());

    await page.goto(REPORT_URL, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
    await wait(3000);
    await snap('turnover-03-report.png');
    console.log('[auth] report url:', page.url(), '| token captured:', !!token);

    if (!token) {
      await page.evaluate(async url => { try { await fetch(url, { credentials: 'include' }); } catch {} }, buildUrl());
      await wait(2000);
    }
    if (!token) { console.error('[auth] ✗ could not capture a reporting token'); await snap('turnover-error.png'); return null; }
    console.log(`[auth] ✓ token captured (${token.length} chars) — fetching turnover…`);

    const result = await page.evaluate(async ({ url, tok }) => {
      try {
        const r = await fetch(url, {
          headers: { 'X-Auth-Token': tok, 'Accept': 'application/json', 'Origin': 'https://v3.myqsrsoft.com', 'Referer': 'https://v3.myqsrsoft.com/' },
          signal: AbortSignal.timeout(45000),
        });
        if (!r.ok) return { error: `HTTP ${r.status}` };
        return { body: await r.json() };
      } catch (e) { return { error: e.message }; }
    }, { url: buildUrl(), tok: token });

    await snap('turnover-final.png');
    if (result.error) { console.error('[turnover] in-browser fetch error:', result.error); return null; }
    return extractRows(result.body);
  } catch (e) {
    console.error('[auth] Playwright error:', e.message);
    await snap('turnover-error.png');
    return null;
  } finally {
    await browser.close();
  }
}

async function main() {
  const { first, last } = windowRange();
  console.log(`[turnover] window ${first}…${last} · jtcType=${JTC} · ${STORE_NSNS.length} stores`);

  let rawRows = null;
  const directTokens = [
    ['QSRSOFT_TOKEN', (process.env.QSRSOFT_TOKEN || '').trim()],
    ['QSRSOFT_COGNITO_TOKEN', (process.env.QSRSOFT_COGNITO_TOKEN || '').trim()],
  ].filter(([, t]) => t);
  for (const [name, tok] of directTokens) {
    try {
      console.log(`[auth] trying direct fetch with ${name}…`);
      rawRows = await fetchDirect(tok);
      console.log(`[auth] ✓ ${name} accepted`);
      break;
    } catch (e) {
      if (e.message.startsWith('AUTH_FAILED')) { console.log(`[auth] ${name} rejected (${e.message}) — next method`); continue; }
      throw e;
    }
  }
  if (rawRows == null) {
    console.log('[auth] direct token(s) unavailable/rejected — falling back to Playwright');
    rawRows = await fetchViaPlaywright();
  }
  if (rawRows == null) { console.error('[turnover] ✗ no auth method succeeded'); process.exit(1); }

  const records = parseTurnoverApi(rawRows);                    // skips "All Selected"/"Grand Total"
  const rows = toRows(records);
  const stores = new Set(records.map(r => r.loc)).size;
  const months = new Set(records.map(r => r.month)).size;
  console.log(`[turnover] ${rows.length} store-month rows (${stores} stores × ${months} months)`);
  if (!stores) {
    console.error('[turnover] ✗ no per-store rows — response was aggregate-only (check nsd=d / jtcType)');
    process.exit(1);
  }
  if (stores < STORE_NSNS.length) console.warn(`[turnover] ⚠ only ${stores}/${STORE_NSNS.length} stores present`);
  const saved = await upsert(rows);
  console.log(`[turnover] ✓ ${saved} rows upserted to turnover_monthly`);
  if (!saved) process.exit(1);
}

main().catch(err => { console.error('[turnover] FATAL:', err); process.exit(1); });
