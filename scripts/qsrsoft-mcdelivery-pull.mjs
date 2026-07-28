#!/usr/bin/env node
// scripts/qsrsoft-mcdelivery-pull.mjs
// QSRSoft McDelivery 3PO → per-store monthly Delivery GC/R/D + delivery experience.
// Feeds the Performance-Review Delivery metric → mcdelivery_monthly.
//
// Endpoint (confirmed 2026-07-28; one call = all stores):
//   GET https://api.reports.myqsrsoft.com/reports/mcd/sales/mcDeliveryReport
//       ?nsd=d&nsn=<csv>&orgId=<org>&enterpriseName=McDonalds&startDate=&endDate=
//       &dsd=s&compType=trading&daysOfWeek=1..7&weekStart=3&timeSegment=custom
//       &segmentBy=summary&timeInterval=timeSlice
//       &deliveryVendor=[{CombinedVendors: DoorDash,GrubHub,PostMates,UberEats}]
//       &timeSlices=[{open-close}]
//   → { resp: [ {nsn, vendor, deliveryTransactions, deliveryAllNetSales, avgDeliveryTime,
//        avgRestaurantTime, avgTotalTime, ordersMissingItemsPct, "3POTrans", avgCSat,
//        entireOrderIncorrect, qualifiedReviews} ], totals }  (top-level resp)
// parseMcDelivery3POApi() maps it (times decimal-minutes → seconds). Review metric =
// Delivery GC/R/D = 3PO GC ÷ rest-days (computed from the window's day count).
//
// Required env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Auth ladder: QSRSOFT_TOKEN → QSRSOFT_COGNITO_TOKEN → QSRSOFT_USERNAME/PASSWORD (Playwright)
// Optional: MCDELIVERY_PERIOD=YYYY-MM · ROSTER_STORES=3708,… · QSRSOFT_DEBUG=1

import { createClient } from '@supabase/supabase-js';
import { parseMcDelivery3POApi } from '../src/engine/people-reports.js';

const API_BASE   = 'https://api.reports.myqsrsoft.com';
const ORG_ID     = 'a546d4ef-684a-4f25-8bc0-6580af068875';
const ENTERPRISE = 'McDonalds';
const REPORT_URL = 'https://v3.myqsrsoft.com/reports/mcd/sales/deliveryReport';
const DEBUG      = process.env.QSRSOFT_DEBUG === '1';

const DELIVERY_VENDOR = JSON.stringify([{ display_name: 'CombinedVendors', name: 'DoorDash,GrubHub,PostMates,UberEats', id: '3040,3041,3042,3043' }]);
const TIME_SLICES     = JSON.stringify([{ name: 'open-close', startTime: 'open', endTime: 'close' }]);

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
function currentPeriod() {
  if (process.env.MCDELIVERY_PERIOD) return process.env.MCDELIVERY_PERIOD;
  const d = new Date();
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}
// { first, last, days } — days = qualified rest-days in the window (GC/R/D denominator).
function periodRange(period) {
  const [y, m] = period.split('-').map(Number);
  const monthEnd = new Date(Date.UTC(y, m, 0));
  const today = new Date();
  const end = (today.getUTCFullYear() === y && today.getUTCMonth() + 1 === m && today < monthEnd) ? today : monthEnd;
  const first = new Date(Date.UTC(y, m - 1, 1));
  const days = Math.round((end - first) / 86400000) + 1;
  return { first: `${period}-01`, last: `${end.getUTCFullYear()}-${pad2(end.getUTCMonth() + 1)}-${pad2(end.getUTCDate())}`, days };
}

function buildUrl(period) {
  const { first, last } = periodRange(period);
  const params = new URLSearchParams({
    nsd: 'd', nsn: STORE_NSNS.join(','), orgId: ORG_ID, enterpriseName: ENTERPRISE,
    startDate: first, endDate: last, dsd: 's', compType: 'trading', daysOfWeek: '1,2,3,4,5,6,7',
    weekStart: '3', timeSegment: 'custom', segmentBy: 'summary', timeInterval: 'timeSlice',
    deliveryVendor: DELIVERY_VENDOR, timeSlices: TIME_SLICES,
  });
  return `${API_BASE}/reports/mcd/sales/mcDeliveryReport?${params}`;
}

// mcDeliveryReport wraps rows in a top-level { resp: [...] }.
function extractRows(body) {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.resp)) return body.resp;
  if (Array.isArray(body?.result?.resp)) return body.result.resp;
  if (Array.isArray(body?.result)) return body.result;
  return [];
}

function toRows(byLoc, period, restDays) {
  return Object.entries(byLoc).map(([loc, d]) => ({
    loc: String(loc), period_month: period, vendor: d.vendor ?? null,
    delivery_gc: d.threePoGC ?? null,
    delivery_gc_rd: (d.threePoGC != null && restDays) ? d.threePoGC / restDays : d.threePoGC ?? null,
    pos_mcdelivery_gc: d.posMcDeliveryGC ?? null, pos_3po_sales: d.pos3poSales ?? null,
    csat: d.csat ?? null, orders_missing_items_pct: d.ordersMissingItemsPct ?? null,
    incorrect_orders: d.incorrectOrders ?? null, mcdelivery_time_sec: d.mcDeliveryTimeSec ?? null,
    restaurant_time_sec: d.restaurantTimeSec ?? null, total_experience_time_sec: d.totalExperienceTimeSec ?? null,
    rest_days: restDays ?? null, updated_at: new Date().toISOString(),
  }));
}

async function upsert(rows) {
  if (!rows.length) return 0;
  const CHUNK = 500; let saved = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const { error } = await supabase.from('mcdelivery_monthly').upsert(slice, { onConflict: 'loc,period_month' });
    if (error) throw error;
    saved += slice.length;
  }
  return saved;
}

async function fetchDirect(token, period) {
  const url = buildUrl(period);
  if (DEBUG) console.log(`[mcdelivery] GET ${url.slice(0, 140)}…`);
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

async function fetchViaPlaywright(period) {
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
    await snap('mcdelivery-01-landing.png');

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
    await snap('mcdelivery-02-post-login.png');
    console.log('[auth] post-login url:', page.url());

    await page.goto(REPORT_URL, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
    await wait(3000);
    await snap('mcdelivery-03-report.png');
    console.log('[auth] report url:', page.url(), '| token captured:', !!token);

    if (!token) {
      await page.evaluate(async url => { try { await fetch(url, { credentials: 'include' }); } catch {} }, buildUrl(period));
      await wait(2000);
    }
    if (!token) { console.error('[auth] ✗ could not capture a reporting token'); await snap('mcdelivery-error.png'); return null; }
    console.log(`[auth] ✓ token captured (${token.length} chars) — fetching mcdelivery…`);

    const result = await page.evaluate(async ({ url, tok }) => {
      try {
        const r = await fetch(url, {
          headers: { 'X-Auth-Token': tok, 'Accept': 'application/json', 'Origin': 'https://v3.myqsrsoft.com', 'Referer': 'https://v3.myqsrsoft.com/' },
          signal: AbortSignal.timeout(45000),
        });
        if (!r.ok) return { error: `HTTP ${r.status}` };
        return { body: await r.json() };
      } catch (e) { return { error: e.message }; }
    }, { url: buildUrl(period), tok: token });

    await snap('mcdelivery-final.png');
    if (result.error) { console.error('[mcdelivery] in-browser fetch error:', result.error); return null; }
    return extractRows(result.body);
  } catch (e) {
    console.error('[auth] Playwright error:', e.message);
    await snap('mcdelivery-error.png');
    return null;
  } finally {
    await browser.close();
  }
}

async function main() {
  const period = currentPeriod();
  const { days } = periodRange(period);
  console.log(`[mcdelivery] period ${period} (${days} rest-days) × ${STORE_NSNS.length} stores`);

  let rawRows = null;
  const directTokens = [
    ['QSRSOFT_TOKEN', (process.env.QSRSOFT_TOKEN || '').trim()],
    ['QSRSOFT_COGNITO_TOKEN', (process.env.QSRSOFT_COGNITO_TOKEN || '').trim()],
  ].filter(([, t]) => t);
  for (const [name, tok] of directTokens) {
    try {
      console.log(`[auth] trying direct fetch with ${name}…`);
      rawRows = await fetchDirect(tok, period);
      console.log(`[auth] ✓ ${name} accepted`);
      break;
    } catch (e) {
      if (e.message.startsWith('AUTH_FAILED')) { console.log(`[auth] ${name} rejected (${e.message}) — next method`); continue; }
      throw e;
    }
  }
  if (rawRows == null) {
    console.log('[auth] direct token(s) unavailable/rejected — falling back to Playwright');
    rawRows = await fetchViaPlaywright(period);
  }
  if (rawRows == null) { console.error('[mcdelivery] ✗ no auth method succeeded'); process.exit(1); }

  const byLoc = parseMcDelivery3POApi(rawRows);
  const rows = toRows(byLoc, period, days);
  const found = Object.keys(byLoc).length;
  console.log(`[mcdelivery] ${found} stores`);
  if (found < STORE_NSNS.length) console.warn(`[mcdelivery] ⚠ only ${found}/${STORE_NSNS.length} stores in response`);
  const saved = await upsert(rows);
  console.log(`[mcdelivery] ✓ ${saved} store rows upserted to mcdelivery_monthly for ${period}`);
  if (!saved) process.exit(1);
}

main().catch(err => { console.error('[mcdelivery] FATAL:', err); process.exit(1); });
