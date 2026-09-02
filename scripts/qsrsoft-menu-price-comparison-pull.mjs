#!/usr/bin/env node
// scripts/qsrsoft-menu-price-comparison-pull.mjs
// QSRSoft Menu Price Comparison ("RFM Price Comparison") — backlog item L
// (memory/data-acquisition-shopping-list.md). The per-store LIST price book: in-store,
// eat-in/take-out, and 3PO delivery list prices per (nsn, menuItemNumber). Full endpoint
// intel, every measured caveat, and the delivery-premium sanitation rules are in
// memory/qsrsoft-report-catalog.md ("menuPriceComparison — the per-store LIST PRICE BOOK");
// read that before changing selectCols or the row mapping. Mirrors qsrsoft-pmix-pull.mjs's
// auth ladder, query builder, and per-day loop structure directly (same /reporting family
// pattern, adapted to this endpoint's own path/params).
//
//   GET https://api.reports.myqsrsoft.com/reports/mcd/product/menuPriceComparison
//       ?nsd=d&nsn=<27 NSN comma list>&orgId=<org>&enterpriseName=McDonalds
//       &startDate=&endDate=&weekStart=3
//   -> { resp: [ {nsn, menuItemNumber, price, priceEatin, priceTakeout, priceDelivery,
//        deliveryPremium, description, familyGroup, product} ] }
//
// ⚠️ It is a LIST price book, NOT a sales feed -- no soldQty/dollarsSold/cost fields.
// Complementary to qsr_product_mix (the REALIZED price), not a replacement.
//
// dated (loc, dt, item), like qsr_product_mix -- NOT current-state-only like the recipe pull.
// startDate/endDate are native, so price history is backfillable; a dated book is the only way
// to establish WHEN a price action took effect. A price book changes rarely, so daily re-pulls
// are cheap and mostly no-ops.
//
// Comma-list nsn support was measured with 3 stores in one request (memory/qsrsoft-report-
// catalog.md); this script sends all 27 in one request per day and LOGS a warning (not a hard
// failure) if fewer than 27 distinct stores come back, since a 27-store request was never
// independently re-verified the way the outage pull's was.
//
// price_eatin/price_takeout persisted even though identical to price on every row measured so
// far -- standing instruction (owner, 2026-08-15), see the schema file's own header. delivery_
// premium is NOT stored -- recomputed at read time (recompute rather than trust a value the API
// itself computes inconsistently at price=0 -- see schema header for both divide-by-zero cases).
//
// Required env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Auth -- same getFreshToken()-then-Playwright ladder as qsrsoft-pmix-pull.mjs/qsrsoft-ops-
// pull.mjs -- QSRSOFT_USERNAME/PASSWORD required for both paths.
// Optional: MENU_PRICE_START_DATE / MENU_PRICE_END_DATE (YYYY-MM-DD, backfill range -- default
//           below pulls yesterday only, since today's price is already covered by every prior
//           day's carry-forward and a price rarely changes mid-day), MENU_PRICE_STORE
//           (comma-separated NSNs, default all 27), QSRSOFT_DEBUG=1.

import { safeCreateClient } from './lib/safe-supabase-client.mjs';
import { getFreshToken } from './lib/qsrsoft-auth.mjs';

const DEBUG = process.env.QSRSOFT_DEBUG === '1';
const BASE   = 'https://api.reports.myqsrsoft.com';
const ORG_ID = 'a546d4ef-684a-4f25-8bc0-6580af068875';
const REPORT_URL = 'https://v3.myqsrsoft.com/reports/mcd/product/menuPriceComparison';

const STORE_NSNS = (process.env.MENU_PRICE_STORE
  ? process.env.MENU_PRICE_STORE.split(',').map(s => s.trim())
  : [
    3708, 5183, 5985, 6178, 6838, 6972, 10034, 10422, 10915, 11657, 13113, 18213,
    20475, 24471, 29760, 31357, 32525, 33109, 33222, 33704, 34222, 35064, 35242,
    37566, 38609, 43380, 43701,
  ]).map(String);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const supabase = safeCreateClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const nsn7 = n => String(n).padStart(7, '0');
const fmtDate = d => d.toISOString().slice(0, 10);
const addDay  = (d, n) => { const r = new Date(d); r.setUTCDate(r.getUTCDate() + n); return r; };

function url(date) {
  const params = new URLSearchParams({
    nsd: 'd', nsn: STORE_NSNS.join(','), orgId: ORG_ID, enterpriseName: 'McDonalds',
    startDate: date, endDate: date, weekStart: '3',
  });
  return `${BASE}/reports/mcd/product/menuPriceComparison?${params}`;
}

function resolveWindow() {
  const start = (process.env.MENU_PRICE_START_DATE || '').trim();
  const end   = (process.env.MENU_PRICE_END_DATE   || '').trim() || start;
  if (!start) {
    const y = addDay(new Date(), -1);
    const yStr = fmtDate(y);
    return { start: yStr, end: yStr };
  }
  if (!DATE_RE.test(start) || !DATE_RE.test(end)) {
    console.error(`[menu-price] ✗ MENU_PRICE_START_DATE/MENU_PRICE_END_DATE must be YYYY-MM-DD -- got start="${start}" end="${end}"`);
    process.exit(1);
  }
  if (end < start) {
    console.error(`[menu-price] ✗ MENU_PRICE_END_DATE (${end}) is before MENU_PRICE_START_DATE (${start})`);
    process.exit(1);
  }
  return { start, end };
}
function dateRange(start, end) {
  const out = [];
  for (let d = new Date(start + 'T00:00:00Z'); fmtDate(d) <= end; d = addDay(d, 1)) out.push(fmtDate(d));
  return out;
}

const HDRS = t => ({ 'X-Auth-Token': t, 'Accept': 'application/json', 'Origin': 'https://v3.myqsrsoft.com', 'Referer': REPORT_URL, 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36' });

async function fetchRows(reqUrl, token, evalPage) {
  if (evalPage) {
    const res = await evalPage.evaluate(async ({ url, token }) => {
      try {
        const r = await fetch(url, { headers: { 'X-Auth-Token': token, 'Accept': 'application/json', 'Origin': 'https://v3.myqsrsoft.com', 'Referer': 'https://v3.myqsrsoft.com/reports/mcd/product/menuPriceComparison' }, signal: AbortSignal.timeout(25000) });
        if (!r.ok) return { error: `HTTP ${r.status}` };
        const body = await r.json();
        // This endpoint wraps rows in { resp: [...] }, unlike the reporting/v2 family's { result: [...] }.
        return { rows: Array.isArray(body) ? body : (body?.resp || body?.result || []) };
      } catch (e) { return { error: e.message }; }
    }, { url: reqUrl, token });
    if (res.error) throw new Error(res.error);
    return res.rows || [];
  }
  const resp = await fetch(reqUrl, { headers: HDRS(token) });
  if (resp.status === 401 || resp.status === 403) throw new Error(`AUTH_FAILED:${resp.status}`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${(await resp.text()).slice(0, 160)}`);
  const body = await resp.json();
  return Array.isArray(body) ? body : (body?.resp || body?.result || []);
}

// nsn is unpadded on this endpoint (memory/qsrsoft-report-catalog.md, "The store field is named
// differently per endpoint" -- nsn here, storeNum on outages). delivery_premium deliberately not
// mapped/stored -- see file header.
function mapRow(r, date) {
  if (r.nsn == null || r.menuItemNumber == null) return null;
  return {
    loc: nsn7(r.nsn),
    dt: date,
    item: Number(r.menuItemNumber),
    descr: r.description ?? null,
    family_group: r.familyGroup ?? null,
    price: r.price ?? null,
    price_eatin: r.priceEatin ?? null,
    price_takeout: r.priceTakeout ?? null,
    price_delivery: r.priceDelivery ?? null,
  };
}

async function upsert(rows) {
  if (!rows.length) return 0;
  const CHUNK = 500; let saved = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await supabase.from('qsr_menu_price_comparison').upsert(chunk, { onConflict: 'loc,dt,item' });
    if (error) { console.warn('[menu-price] upsert error:', error.message); continue; }
    saved += chunk.length;
  }
  return saved;
}

async function resolveToken(token, forceRemint) {
  return typeof token === 'function' ? await token({ forceRemint }) : token;
}

async function runAll(token, dates, evalPage) {
  let grand = 0;
  const perStoreCounts = new Map(); // loc -> rows kept, across the whole run
  for (const date of dates) {
    let rows;
    try {
      const tok = await resolveToken(token, false);
      try {
        rows = await fetchRows(url(date), tok, evalPage);
      } catch (e) {
        if (String(e.message).startsWith('AUTH_FAILED') && typeof token === 'function') {
          console.log(`[menu-price] ${date}: cached token rejected -- forcing a re-mint and retrying once`);
          const freshTok = await resolveToken(token, true);
          rows = await fetchRows(url(date), freshTok, evalPage);
        } else throw e;
      }
    } catch (e) {
      if (String(e.message).startsWith('AUTH_FAILED')) throw e;
      console.error(`[menu-price] ${date} ERROR: ${e.message}`);
      continue;
    }
    const mapped = rows.map(r => mapRow(r, date)).filter(Boolean);
    const dropped = rows.length - mapped.length;
    if (dropped && DEBUG) console.log(`[menu-price] ${date}: ${dropped} row(s) dropped (missing nsn/menuItemNumber)`);
    for (const r of mapped) perStoreCounts.set(r.loc, (perStoreCounts.get(r.loc) || 0) + 1);
    const stores = new Set(mapped.map(r => r.loc));
    if (stores.size > 0 && stores.size < STORE_NSNS.length) {
      console.warn(`[menu-price] ${date}: only ${stores.size}/${STORE_NSNS.length} distinct stores in the response -- the district-wide comma-list request may not be honoured the same way it was for the outage pull. Not independently re-verified at n=27.`);
    }
    const saved = await upsert(mapped);
    console.log(`[menu-price] ${date}: ${rows.length} row(s) -> ${saved} upserted (${stores.size} distinct stores)`);
    grand += saved;
    await new Promise(r => setTimeout(r, 200));
  }
  return { grand, perStoreCounts };
}

// ── Playwright fallback -- mirrors qsrsoft-pmix-pull.mjs exactly, pointed at the RFM Price
// Comparison report page.
async function viaPlaywright(dates) {
  const u = process.env.QSRSOFT_USERNAME, pw = process.env.QSRSOFT_PASSWORD;
  if (!u || !pw) throw new Error('AUTH_FAILED:playwright -- no QSRSOFT_USERNAME/PASSWORD, cannot use Playwright fallback');
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
    await snap('menu-price-01-post-login.png');
    await page.goto(REPORT_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await new Promise(r => setTimeout(r, 6000));
    console.log('[auth] menu price comparison page url:', page.url(), '| token captured:', !!token);
    console.log('[auth] api.reports requests seen:', seenApiUrls.length ? JSON.stringify(seenApiUrls) : '(none)');
    await snap('menu-price-02-report-page.png');
    if (!token) {
      console.log('[auth] no token from passive navigation -- attempting in-browser fetch to trigger auth…');
      const testResult = await page.evaluate(async ({ reqUrl }) => {
        try { const r = await fetch(reqUrl, { credentials: 'include' }); return { status: r.status, ok: r.ok }; }
        catch (e) { return { error: e.message, name: e.name }; }
      }, { reqUrl: url(dates[0]) });
      console.log('[auth] in-browser test fetch result:', JSON.stringify(testResult));
      await new Promise(r => setTimeout(r, 2000));
      await snap('menu-price-03-post-trigger.png');
    }
    if (!token) throw new Error('AUTH_FAILED:playwright -- could not capture token from the RFM Price Comparison report page');
    console.log(`[auth] ✓ token captured (${token.length} chars) -- pulling ${dates.length} date(s)…`);
    return await runAll(token, dates, page);
  } finally { await browser.close(); }
}

async function main() {
  if (!supabase) { console.error('[menu-price] Missing/invalid Supabase env'); process.exit(1); }
  const { start, end } = resolveWindow();
  const dates = dateRange(start, end);
  console.log(`[menu-price] window: ${start}..${end} (${dates.length} day(s)) -- ${STORE_NSNS.length} store(s)`);

  console.log('[auth] trying direct server-side fetch via getFreshToken()…');
  let result;
  try {
    result = await runAll(getFreshToken, dates, null);
  } catch (e) {
    console.log(`[auth] mint-and-fetch failed (${e.message}) -- falling back to Playwright`);
    result = await viaPlaywright(dates);
  }
  const { grand: total, perStoreCounts } = result;

  const storesWithRows = perStoreCounts.size;
  console.log(`[menu-price] per-store: ${storesWithRows}/${STORE_NSNS.length} store(s) had at least one row upserted.`);
  if (storesWithRows > 0 && storesWithRows < STORE_NSNS.length) {
    const missing = STORE_NSNS.filter(nsn => !perStoreCounts.has(nsn7(nsn)));
    console.warn(`[menu-price] ${missing.length} store(s) with zero rows across the whole window: ${missing.join(', ')}`);
  }

  console.log(`[menu-price] done -- ${total} row(s) upserted.`);
  // A day with genuinely zero list-price rows across all 27 real stores is not a plausible clean
  // result -- same reasoning qsrsoft-pmix-pull.mjs already applies to its own zero-row guard.
  if (total === 0 && dates.length > 0) {
    console.error(`[menu-price] ✗ 0 rows upserted across ${dates.length} requested day(s) -- treating as a failed run, not an empty one. See auth/error output above.`);
    process.exit(1);
  }
  process.exit(0);
}

main().catch(e => { console.error('[menu-price] FATAL:', e); process.exit(1); });
