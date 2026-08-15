#!/usr/bin/env node
// scripts/qsrsoft-pmix-pull.mjs
// QSRSoft Product Mix (PMIX) — per-item, per-price-point sales facts.
//
// Endpoint confirmed 2026-08-14 (memory/qsrsoft-report-catalog.md, "Product Mix — the
// SALES view" — read that section before changing selectCols or the row mapping, it has
// the full capture, reconciliation math, and every measured caveat this file is built
// from). Same /reporting/v2/ family qsrsoft-ops-pull.mjs already drives, so this file
// mirrors that script's auth ladder, query builder and Playwright fallback structure
// directly rather than reinventing them.
//
//   GET https://api.reports.myqsrsoft.com/reporting/v2/product/product-mix-bundles
//       ?catalogType=productMix&reportType=summary&nsn=<csv>&orgId=<org>
//       &enterpriseName=McDonalds&startDate=&endDate=&weekStart=3
//       &familyGroup=BREAKFAST_DRINK,BREAKFAST_SIDE,BREAKFAST_ENTREE,REGULAR_DRINK,
//                    REGULAR_ENTREE,FRIES,NON_PRODUCT,SHAKES,DESSERT
//       &poo=Combined&timeSegment=openClose&segmentBy=summary&timeInterval=summary
//       &segmentNames=open-close&segmentsSelected=open-close&nsd=s&dsd=s
//       &selectCols=soldQty,discQty,menuItemNumber,description,familyGroup,price,
//                   dollarsSold,promoQty,offerAmt,unitFoodCost,unitPaperCost
//   → { result: [ {menuItemNumber, price, soldQty, discQty, description, familyGroup,
//        dollarsSold, promoQty, offerAmt, unitFoodCost, unitPaperCost, bundleQty,
//        bundleDiscAmt, totalUnitFoodCost, totalUnitPaperCost} ] }
//
// dollarsSold/totalUnitFoodCost/totalUnitPaperCost are requested (the API always returns
// them) but deliberately NOT stored — measured exactly equal to price*soldQty /
// unitFoodCost*soldQty / unitPaperCost*soldQty on the captured payload (0 exceptions).
// Storing both a primitive and its extension invites them to disagree; the extensions are
// computed at read time instead. bundleQty/bundleDiscAmt are requested implicitly by the
// endpoint but not selected or stored — measured zero on every row of the captured
// payload despite the endpoint's name; not designed around until a capture shows one
// non-zero. discAmt is NOT in selectCols yet — memory/qsrsoft-report-catalog.md flags it
// as the one still-unknown column needed to close the reconciliation identity
// (ΣdollarsSold − Σoffer_amt − Σdisc_amt == allNetSales); add it here once captured.
//
// Rows with soldQty=0 are catalog placeholders (measured 21/441 on the captured payload)
// — filtered before upsert, not stored.
//
// Required env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Auth ladder: QSRSOFT_TOKEN (direct) → QSRSOFT_COGNITO_TOKEN (direct) →
//              QSRSOFT_USERNAME/PASSWORD (Playwright, mirrors qsrsoft-ops-pull.mjs exactly:
//              logs in, navigates to the Product Mix report page to passively capture a
//              token, in-browser fetch fallback if that alone doesn't fire a token-bearing
//              request).
// Optional: PMIX_START_DATE / PMIX_END_DATE (YYYY-MM-DD, backfill range — target 2024-01
//           per the issue, matching DAR/VOICE depth; probe retention depth first per the
//           standing rule, same as #257/#259 did — do not assume it reaches that far),
//           PMIX_STORE (comma-separated NSNs, default all 27), QSRSOFT_DEBUG=1.

import { createClient } from '@supabase/supabase-js';
import { savePmixRows } from '../src/lib/supabase.js';

const BASE   = 'https://api.reports.myqsrsoft.com';
const ORG_ID = 'a546d4ef-684a-4f25-8bc0-6580af068875';
const REPORT_URL = 'https://v3.myqsrsoft.com/reports/mcd/product/productMixDrillDown';
const DEBUG  = process.env.QSRSOFT_DEBUG === '1';

const STORE_NSNS = (process.env.PMIX_STORE
  ? process.env.PMIX_STORE.split(',').map(s => s.trim())
  : [
    3708, 5183, 5985, 6178, 6838, 6972, 10034, 10422, 10915, 11657, 13113, 18213,
    20475, 24471, 29760, 31357, 32525, 33109, 33222, 33704, 34222, 35064, 35242,
    37566, 38609, 43380, 43701,
  ]).map(String);

const FAMILY_GROUPS = ['BREAKFAST_DRINK', 'BREAKFAST_SIDE', 'BREAKFAST_ENTREE', 'REGULAR_DRINK',
  'REGULAR_ENTREE', 'FRIES', 'NON_PRODUCT', 'SHAKES', 'DESSERT'].join(',');
const SELECT_COLS = ['soldQty', 'discQty', 'menuItemNumber', 'description', 'familyGroup', 'price',
  'dollarsSold', 'promoQty', 'offerAmt', 'unitFoodCost', 'unitPaperCost'].join(',');

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const pad2 = n => String(n).padStart(2, '0');
const fmtDate = d => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
const addDay = (d, n) => { const r = new Date(d); r.setUTCDate(r.getUTCDate() + n); return r; };
const nsn7 = n => String(n).padStart(7, '0');
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function url(date) {
  const params = new URLSearchParams({
    catalogType: 'productMix', reportType: 'summary',
    nsn: STORE_NSNS.join(','), orgId: ORG_ID, enterpriseName: 'McDonalds',
    startDate: date, endDate: date, weekStart: '3',
    familyGroup: FAMILY_GROUPS, poo: 'Combined',
    timeSegment: 'openClose', segmentBy: 'summary', timeInterval: 'summary',
    segmentNames: 'open-close', segmentsSelected: 'open-close', nsd: 's', dsd: 's',
    selectCols: SELECT_COLS,
  });
  return `${BASE}/reporting/v2/product/product-mix-bundles?${params}`;
}

// Fail-fast input validation (PR #267 review, 2026-08-14, applied repo-wide since): a bad
// PMIX_START_DATE/PMIX_END_DATE should error on the input, not surface as a confusing
// downstream auth or empty-result failure.
function resolveWindow() {
  const start = (process.env.PMIX_START_DATE || '').trim();
  const end   = (process.env.PMIX_END_DATE   || '').trim() || start;
  if (!start) {
    // No explicit range: default to yesterday only — today's totals are still
    // accumulating, matching the "only ever evaluate the most recent COMPLETE day" rule
    // this repo already applies elsewhere (qsrsoft-ops-pull.mjs's cash-anomaly check).
    const y = addDay(new Date(), -1);
    const yStr = fmtDate(y);
    return { start: yStr, end: yStr };
  }
  if (!DATE_RE.test(start) || !DATE_RE.test(end)) {
    console.error(`[pmix] ✗ PMIX_START_DATE/PMIX_END_DATE must be YYYY-MM-DD — got start="${start}" end="${end}"`);
    process.exit(1);
  }
  if (end < start) {
    console.error(`[pmix] ✗ PMIX_END_DATE (${end}) is before PMIX_START_DATE (${start})`);
    process.exit(1);
  }
  return { start, end };
}
function dateRange(start, end) {
  const out = [];
  for (let d = new Date(start + 'T00:00:00Z'); fmtDate(d) <= end; d = addDay(d, 1)) out.push(fmtDate(d));
  return out;
}

const HDRS = t => ({ 'X-Auth-Token': t, 'Accept': 'application/json', 'Origin': 'https://v3.myqsrsoft.com', 'Referer': 'https://v3.myqsrsoft.com/reports/mcd/product/productMixDrillDown', 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36' });

async function fetchRows(reqUrl, token, evalPage) {
  if (evalPage) {
    const res = await evalPage.evaluate(async ({ url, token }) => {
      try {
        const r = await fetch(url, { headers: { 'X-Auth-Token': token, 'Accept': 'application/json', 'Origin': 'https://v3.myqsrsoft.com', 'Referer': 'https://v3.myqsrsoft.com/reports/mcd/product/productMixDrillDown' }, signal: AbortSignal.timeout(25000) });
        if (!r.ok) return { error: `HTTP ${r.status}` };
        const body = await r.json();
        return { rows: Array.isArray(body) ? body : (body?.result || []) };
      } catch (e) { return { error: e.message }; }
    }, { url: reqUrl, token });
    if (res.error) throw new Error(res.error);
    return res.rows || [];
  }
  const resp = await fetch(reqUrl, { headers: HDRS(token) });
  if (resp.status === 401 || resp.status === 403) throw new Error(`AUTH_FAILED:${resp.status}`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${(await resp.text()).slice(0, 160)}`);
  const body = await resp.json();
  return Array.isArray(body) ? body : (body?.result || []);
}

// Maps one API row → the shape savePmixRows() expects. loc comes from the row itself if
// present (the endpoint is a multi-store pull, one response covering all requested NSNs —
// unconfirmed field name for which store each row belongs to since the capture was a
// single-store request; storeNum/nsn is the convention every sibling reporting/v2 endpoint
// uses, so that's the first guess, but VERIFY against a real multi-store response before
// trusting this silently drops rows into the wrong store).
function mapRow(r, date) {
  return {
    loc: nsn7(r.storeNum ?? r.nsn ?? ''),
    date,
    item: r.menuItemNumber,
    price: r.price,
    desc: r.description,
    familyGroup: r.familyGroup,
    soldQty: r.soldQty,
    discQty: r.discQty,
    promoQty: r.promoQty,
    offerAmt: r.offerAmt,
    unitFoodCost: r.unitFoodCost,
    unitPaperCost: r.unitPaperCost,
  };
}

async function runAll(token, dates, evalPage) {
  let grand = 0;
  for (const date of dates) {
    let rows;
    try {
      rows = await fetchRows(url(date), token, evalPage);
    } catch (e) {
      if (String(e.message).startsWith('AUTH_FAILED')) throw e;
      console.error(`[pmix] ${date} ERROR: ${e.message}`);
      continue;
    }
    if (!rows.length) { if (DEBUG) console.log(`[pmix] ${date}: no data`); continue; }
    const mapped = rows.map(r => mapRow(r, date))
      .filter(r => r.loc && r.loc !== '0000000' && Number(r.soldQty) > 0); // soldQty=0 rows are catalog placeholders — see file header
    if (!mapped.length) { if (DEBUG) console.log(`[pmix] ${date}: ${rows.length} row(s), all filtered (placeholders)`); continue; }
    const { saved, errors } = await savePmixRows(mapped);
    if (errors.length) console.warn(`[pmix] ${date}: ${errors.length} save error(s)`);
    console.log(`[pmix] ${date}: ${mapped.length}/${rows.length} row(s) upserted (${rows.length - mapped.length} placeholder(s) filtered)`);
    grand += saved;
    await new Promise(r => setTimeout(r, 120));
  }
  return grand;
}

// ── Playwright fallback — mirrors qsrsoft-ops-pull.mjs exactly, pointed at the Product
// Mix report page instead of the Operations Report.
async function viaPlaywright(dates) {
  const u = process.env.QSRSOFT_USERNAME, pw = process.env.QSRSOFT_PASSWORD;
  if (!u || !pw) { console.error('[auth] no QSRSOFT_USERNAME/PASSWORD — cannot use Playwright fallback'); return null; }
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ userAgent: HDRS('')['User-Agent'] })).newPage();
  page.setDefaultTimeout(180000);
  let token = null;
  const seenApiUrls = [];
  page.on('request', req => {
    if (!req.url().includes('api.reports.myqsrsoft.com')) return;
    seenApiUrls.push(req.url().replace(/\?.*/, ''));
    const t = req.headers()['x-auth-token'];
    if (t && t.length > 20 && !token) token = t;
  });
  const snap = (name) => page.screenshot({ path: `screenshots/${name}`, fullPage: true }).catch(() => {});
  try {
    await page.goto('https://v3.myqsrsoft.com', { waitUntil: 'networkidle', timeout: 45000 });
    const userSel = ['input[name="username"]', 'input[name="email"]', 'input[type="email"]', '#username', '#email', 'input[autocomplete="username"]'].join(', ');
    await page.waitForSelector(userSel, { timeout: 20000 });
    await page.fill(userSel, u);
    await page.fill('input[type="password"], input[name="password"]', pw);
    await page.click('button[type="submit"], input[type="submit"], .btn-primary, button:has-text("Login"), button:has-text("Sign in")');
    await page.waitForLoadState('networkidle', { timeout: 30000 });
    await snap('pmix-01-post-login.png');
    await page.goto(REPORT_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await new Promise(r => setTimeout(r, 6000));
    console.log('[auth] product mix page url:', page.url(), '| token captured:', !!token);
    console.log('[auth] api.reports requests seen:', seenApiUrls.length ? JSON.stringify(seenApiUrls) : '(none)');
    await snap('pmix-02-report-page.png');
    if (!token) {
      console.log('[auth] no token from passive navigation — attempting in-browser fetch to trigger auth…');
      const testResult = await page.evaluate(async ({ reqUrl }) => {
        try { const r = await fetch(reqUrl, { credentials: 'include' }); return { status: r.status, ok: r.ok }; }
        catch (e) { return { error: e.message, name: e.name }; }
      }, { reqUrl: url(dates[0]) });
      console.log('[auth] in-browser test fetch result:', JSON.stringify(testResult));
      await new Promise(r => setTimeout(r, 2000));
      await snap('pmix-03-post-trigger.png');
    }
    if (!token) { console.error('[auth] ✗ could not capture token from the Product Mix report page'); return 0; }
    console.log(`[auth] ✓ token captured (${token.length} chars) — pulling ${dates.length} date(s)…`);
    return await runAll(token, dates, page);
  } finally { await browser.close(); }
}

async function main() {
  if (!process.env.VITE_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) { console.error('[pmix] Missing Supabase env'); process.exit(1); }
  const { start, end } = resolveWindow();
  const dates = dateRange(start, end);
  console.log(`[pmix] window: ${start}…${end} (${dates.length} day(s)) — ${STORE_NSNS.length} store(s)`);

  const token = (process.env.QSRSOFT_TOKEN || process.env.QSRSOFT_COGNITO_TOKEN || '').trim();
  let total = 0;
  if (token) {
    console.log('[auth] using direct token');
    try { total = await runAll(token, dates, null); }
    catch (e) {
      if (String(e.message).startsWith('AUTH_FAILED')) { console.log('[auth] direct token 401/403 — falling back to Playwright'); total = await viaPlaywright(dates) || 0; }
      else throw e;
    }
  } else {
    console.log('[auth] no direct token — falling back to Playwright');
    total = await viaPlaywright(dates) || 0;
  }
  console.log(`[pmix] done — ${total} row(s) upserted.`);
  process.exit(0);
}

main().catch(e => { console.error('[pmix] FATAL:', e); process.exit(1); });
