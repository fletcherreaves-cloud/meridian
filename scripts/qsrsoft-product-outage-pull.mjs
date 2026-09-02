#!/usr/bin/env node
// scripts/qsrsoft-product-outage-pull.mjs
// QSRSoft Product Outage — backlog item K (memory/data-acquisition-shopping-list.md), "the
// cheapest pull on the whole list": one HTTP request covers all 27 stores across an entire date
// RANGE (not one call per day, unlike the sibling ops/pmix pulls) — 142 rows for 27 stores x 14
// days in the owner's own capture. Full endpoint intel, every measured caveat, and the KB
// definition are in memory/qsrsoft-report-catalog.md ("Product Outage — captured 2026-08-15");
// read that before changing selectCols or the row mapping.
//
//   GET https://api.reports.myqsrsoft.com/reporting/v2/product/outages
//       ?catalogType=outages&reportType=allOutages&nsd=d&dsd=d
//       &nsn=<27 NSN comma list>&orgId=<org>&enterpriseName=McDonalds
//       &startDate=&endDate=&weekStart=3&familyGroup=<9-value list, same as pmix-pull>
//       &selectCols=description,familyGroup,outageTimestamp,restoredTimestamp
//   -> { result: [ {menuItemNumber, description, storeNum, date, outageTimestamp,
//        familyGroup, restoredTimestamp} ] }
//
// reportType=allOutages, NEVER currentOutages -- allOutages WHERE restoredTimestamp IS NULL
// reconciles EXACTLY to currentOutages (verified live on a real 63-row sample), and
// currentOutages alone is only the still-open tail -- an ~12x undercount of real volume.
//
// ⚠️ An outage row is a manager's POS action (machine down / needs cleaning), NOT a measured
// out-of-stock -- there is no reason code on the record. This pull does not label, flag, or infer
// cause; it stores the raw event only. See the schema file's own header for the full caveat and
// why a future lost-sales join must not call this "out of stock" without a cause dimension.
//
// ⚠️ Never dedupe/join on `description` -- parallel item-number sets share one product name
// (e.g. items 3499/3502 are both "S Caramel Frappe"). Join on menuItemNumber only.
//
// ⚠️ Key on (loc, dt, item, outage_ts), NOT (loc, dt, item) -- an item can go out, be restored,
// and go out again in the same day. Same trap #292's narrower key hit before measurement showed
// it silently dropped 29% of rows.
//
// Required env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Auth -- same getFreshToken()-then-Playwright ladder as every other /reporting/v2/ pull
// (qsrsoft-ops-pull.mjs, qsrsoft-pmix-pull.mjs) -- QSRSOFT_USERNAME/PASSWORD required for both
// paths (also used to mint the token directly).
// Optional:
//   QSRSOFT_OUTAGE_START_DATE / QSRSOFT_OUTAGE_END_DATE (YYYY-MM-DD, explicit backfill range --
//     vendor KB confirms "Trailing 365 Days" is available on this report, so this stream must not
//     be built forward-only; default below already covers a year on first run)
//   QSRSOFT_OUTAGE_BACKFILL_DAYS=370 -- first-run backfill depth when the table is empty
//   QSRSOFT_OUTAGE_RECENT_DAYS=30 -- steady-state rolling re-pull window (generous on purpose --
//     an outage opened weeks ago can still be sitting un-restored, and only a re-pull covering
//     its original outage_ts date will pick up a restoredTimestamp landing on it later)
//   QSRSOFT_OUTAGE_CHUNK_DAYS=90 -- max days per single API request (untested upper bound on the
//     vendor's own side, so this stays conservative rather than assuming a full year works in one call)
//   QSRSOFT_DEBUG=1

import { safeCreateClient } from './lib/safe-supabase-client.mjs';
import { getFreshToken } from './lib/qsrsoft-auth.mjs';

const DEBUG = process.env.QSRSOFT_DEBUG === '1';
const BASE   = 'https://api.reports.myqsrsoft.com';
const ORG_ID = 'a546d4ef-684a-4f25-8bc0-6580af068875';
const REPORT_URL = 'https://v3.myqsrsoft.com/reports/mcd/product/productOutage';

const STORE_NSNS = [
  3708, 5183, 5985, 6178, 6838, 6972, 10034, 10422, 10915, 11657, 13113, 18213,
  20475, 24471, 29760, 31357, 32525, 33109, 33222, 33704, 34222, 35064, 35242,
  37566, 38609, 43380, 43701,
];
// Same 9-value list qsrsoft-pmix-pull.mjs already uses on the sibling /reporting/v2/product/
// endpoint family -- the owner's own outages capture showed this same set (truncated in the
// doc capture as "BREAKFAST_DRINK,…,DESSERT"), not independently re-verified as optional.
const FAMILY_GROUPS = ['BREAKFAST_DRINK', 'BREAKFAST_SIDE', 'BREAKFAST_ENTREE', 'REGULAR_DRINK',
  'REGULAR_ENTREE', 'FRIES', 'NON_PRODUCT', 'SHAKES', 'DESSERT'].join(',');
const SELECT_COLS = ['description', 'familyGroup', 'outageTimestamp', 'restoredTimestamp'].join(',');

const BACKFILL_DAYS = Number(process.env.QSRSOFT_OUTAGE_BACKFILL_DAYS || 370);
const RECENT_DAYS   = Number(process.env.QSRSOFT_OUTAGE_RECENT_DAYS   || 30);
const CHUNK_DAYS    = Number(process.env.QSRSOFT_OUTAGE_CHUNK_DAYS    || 90);
const START_DATE    = (process.env.QSRSOFT_OUTAGE_START_DATE || '').trim();
const END_DATE      = (process.env.QSRSOFT_OUTAGE_END_DATE   || '').trim();

const supabase = safeCreateClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const nsn7 = n => String(n).padStart(7, '0');
const fmtDate = d => d.toISOString().slice(0, 10);
const addDay  = (d, n) => { const r = new Date(d); r.setUTCDate(r.getUTCDate() + n); return r; };

function url(start, end) {
  const params = new URLSearchParams({
    catalogType: 'outages', reportType: 'allOutages', nsd: 'd', dsd: 'd',
    nsn: STORE_NSNS.join(','), orgId: ORG_ID, enterpriseName: 'McDonalds',
    startDate: start, endDate: end, weekStart: '3',
    familyGroup: FAMILY_GROUPS, selectCols: SELECT_COLS,
  });
  return `${BASE}/reporting/v2/product/outages?${params}`;
}

// Split [start, end] into <=CHUNK_DAYS windows -- conservative against an untested per-request
// range cap on the vendor's side (see file header).
function chunkRange(start, end) {
  const chunks = [];
  let cur = new Date(start + 'T00:00:00Z');
  const endD = new Date(end + 'T00:00:00Z');
  while (cur <= endD) {
    const chunkEnd = new Date(Math.min(addDay(cur, CHUNK_DAYS - 1).getTime(), endD.getTime()));
    chunks.push({ start: fmtDate(cur), end: fmtDate(chunkEnd) });
    cur = addDay(chunkEnd, 1);
  }
  return chunks;
}

async function resolveWindow() {
  if (START_DATE) return { start: START_DATE, end: END_DATE || fmtDate(new Date()) };
  const today = fmtDate(new Date());
  const { data, error } = await supabase.from('qsr_product_outage').select('dt').order('dt', { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(`[outage] getWindow() latest-date read failed -- ${error.code}: ${error.message}`);
  if (!data) {
    // Empty table -- first run. Backfill the full configured depth in one go (chunked below).
    return { start: fmtDate(addDay(new Date(), -BACKFILL_DAYS)), end: today };
  }
  // Steady state: always re-cover a rolling RECENT_DAYS window, not just since the last row's
  // date -- an outage opened well before that date can still restore later, and only a re-pull
  // spanning its original outage_ts date picks up the restoredTimestamp update.
  return { start: fmtDate(addDay(new Date(), -RECENT_DAYS)), end: today };
}

const HDRS = t => ({ 'X-Auth-Token': t, 'Accept': 'application/json', 'Origin': 'https://v3.myqsrsoft.com', 'Referer': REPORT_URL, 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36' });

async function fetchRows(reqUrl, token, evalPage) {
  if (evalPage) {
    const res = await evalPage.evaluate(async ({ url, token }) => {
      try {
        const r = await fetch(url, { headers: { 'X-Auth-Token': token, 'Accept': 'application/json', 'Origin': 'https://v3.myqsrsoft.com', 'Referer': 'https://v3.myqsrsoft.com/reports/mcd/product/productOutage' }, signal: AbortSignal.timeout(25000) });
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

// menuItemNumber/storeNum are unpadded integers on this endpoint (memory/qsrsoft-report-
// catalog.md, "The store field is named differently per endpoint") -- storeNum here, matching
// nsn elsewhere. outageTimestamp/restoredTimestamp come back as "YYYY-MM-DD HH:MM:SS" -- passed
// through as-is into a `timestamp` (no tz) column, per the schema file's own header on why this
// is deliberate (a naive per-store hourly poll time, not a real event moment).
function mapRow(r) {
  if (r.menuItemNumber == null || r.storeNum == null || !r.date || !r.outageTimestamp) return null;
  return {
    loc: nsn7(r.storeNum),
    dt: String(r.date).slice(0, 10),
    item: Number(r.menuItemNumber),
    outage_ts: r.outageTimestamp,
    restored_ts: r.restoredTimestamp || null,
    descr: r.description ?? null,
    family_group: r.familyGroup ?? null,
  };
}

async function upsert(rows) {
  if (!rows.length) return 0;
  const CHUNK = 500; let saved = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await supabase.from('qsr_product_outage').upsert(chunk, { onConflict: 'loc,dt,item,outage_ts' });
    if (error) { console.warn('[outage] upsert error:', error.message); continue; }
    saved += chunk.length;
  }
  return saved;
}

async function resolveToken(token, forceRemint) {
  return typeof token === 'function' ? await token({ forceRemint }) : token;
}

async function runAll(token, chunks, evalPage) {
  let grand = 0;
  for (const { start, end } of chunks) {
    let rows;
    try {
      const tok = await resolveToken(token, false);
      try {
        rows = await fetchRows(url(start, end), tok, evalPage);
      } catch (e) {
        if (String(e.message).startsWith('AUTH_FAILED') && typeof token === 'function') {
          console.log(`[outage] ${start}..${end}: cached token rejected -- forcing a re-mint and retrying once`);
          const freshTok = await resolveToken(token, true);
          rows = await fetchRows(url(start, end), freshTok, evalPage);
        } else throw e;
      }
    } catch (e) {
      if (String(e.message).startsWith('AUTH_FAILED')) throw e;
      console.error(`[outage] ${start}..${end} ERROR: ${e.message}`);
      continue;
    }
    const mapped = rows.map(mapRow).filter(Boolean);
    const dropped = rows.length - mapped.length;
    if (dropped && DEBUG) console.log(`[outage] ${start}..${end}: ${dropped} row(s) dropped (missing item/store/date/outageTimestamp)`);
    const saved = await upsert(mapped);
    console.log(`[outage] ${start}..${end}: ${rows.length} row(s) -> ${saved} upserted`);
    grand += saved;
    await new Promise(r => setTimeout(r, 200));
  }
  return grand;
}

// ── Playwright fallback -- mirrors qsrsoft-pmix-pull.mjs / qsrsoft-ops-pull.mjs exactly,
// pointed at the Product Outage report page.
async function viaPlaywright(chunks) {
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
    await snap('outage-01-post-login.png');
    await page.goto(REPORT_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await new Promise(r => setTimeout(r, 6000));
    console.log('[auth] product outage page url:', page.url(), '| token captured:', !!token);
    console.log('[auth] api.reports requests seen:', seenApiUrls.length ? JSON.stringify(seenApiUrls) : '(none)');
    await snap('outage-02-report-page.png');
    if (!token) {
      console.log('[auth] no token from passive navigation -- attempting in-browser fetch to trigger auth…');
      const testResult = await page.evaluate(async ({ reqUrl }) => {
        try { const r = await fetch(reqUrl, { credentials: 'include' }); return { status: r.status, ok: r.ok }; }
        catch (e) { return { error: e.message, name: e.name }; }
      }, { reqUrl: url(chunks[0].start, chunks[0].end) });
      console.log('[auth] in-browser test fetch result:', JSON.stringify(testResult));
      await new Promise(r => setTimeout(r, 2000));
      await snap('outage-03-post-trigger.png');
    }
    if (!token) throw new Error('AUTH_FAILED:playwright -- could not capture token from the Product Outage report page');
    console.log(`[auth] ✓ token captured (${token.length} chars) -- pulling ${chunks.length} chunk(s)…`);
    return await runAll(token, chunks, page);
  } finally { await browser.close(); }
}

async function main() {
  if (!supabase) { console.error('[outage] Missing/invalid Supabase env'); process.exit(1); }
  const { start, end } = await resolveWindow();
  const chunks = chunkRange(start, end);
  console.log(`[outage] window: ${start}..${end} (${chunks.length} chunk(s) of <=${CHUNK_DAYS}d) -- ${STORE_NSNS.length} store(s) in 1 request per chunk`);

  console.log('[auth] trying direct server-side fetch via getFreshToken()…');
  let total;
  try {
    total = await runAll(getFreshToken, chunks, null);
  } catch (e) {
    console.log(`[auth] mint-and-fetch failed (${e.message}) -- falling back to Playwright`);
    total = await viaPlaywright(chunks);
  }

  console.log(`[outage] done -- ${total} row(s) upserted across ${chunks.length} chunk(s).`);
  // A window this size returning literally zero outage events across all 27 real stores is not
  // a plausible clean result (the owner's own 14-day sample extrapolates to ~1,300-1,800
  // district-wide rows) -- treat a total wipeout as a failed run, same reasoning
  // qsrsoft-pmix-pull.mjs already applies to its own zero-row guard.
  if (total === 0) {
    console.error('[outage] ✗ 0 rows upserted across a non-trivial window -- treating as a failed run, not an empty one. See auth/error output above.');
    process.exit(1);
  }
  process.exit(0);
}

main().catch(e => { console.error('[outage] FATAL:', e); process.exit(1); });
