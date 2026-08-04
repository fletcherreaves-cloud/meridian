#!/usr/bin/env node
// scripts/qsrsoft-ops-pull.mjs
// QSRSoft Operations Report — the full report as store-level daily REST pulls.
// Automates what used to require the manual Operations Report / Controls upload (#37),
// AND brings official LY into Controls / Labor / Service. One config-driven pull over
// several endpoints (all api.reports.myqsrsoft.com, same X-Auth-Token auth as the DAR).
// See memory/reference-operations-report-apis.md for the endpoint + field intel.
//
// Endpoints (all one row per store × day unless noted; every field has an ly_ twin):
//   cash-sheet-extract → qsr_cash_sheet   (Controls: discount, T-Reds, meals, drawer, refunds)
//   labor-summary      → qsr_labor_summary(OT hours/$, crew labor, salaried mgr, gross) + labor-detail needed hrs
//   service/statistics → qsr_service_stats(CTP/OEPE/DT/MFY/KVS/RTP/Bev — summary segment)
//   cash-sheet (sales) → qsr_sales_mix     (channel sales breakdown + ly + ybl)
//   qtr-hr-sales peaks → qsr_peaks_sales   (3 Peaks daypart sales by channel; one row per store×daypart)
//
// Auth (tried in order): QSRSOFT_TOKEN (direct) → QSRSOFT_USERNAME/PASSWORD (Playwright fallback:
// logs in, opens the Operations Report page, captures the X-Auth-Token, fetches in-browser).
// Required: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// Optional: QSRSOFT_OPS_DAYS_BACK (first-run history, default 45), QSRSOFT_OPS_DAYS_RECENT (rolling, 4),
//           QSRSOFT_OPS_START_DATE/END_DATE (explicit backfill), QSRSOFT_OPS_DEBUG=1.

import { createClient } from '@supabase/supabase-js';

const BASE   = 'https://api.reports.myqsrsoft.com';
const ORG_ID = 'a546d4ef-684a-4f25-8bc0-6580af068875';
const STORE_NSNS = [
  3708, 5183, 5985, 6178, 6838, 6972, 10034, 10422, 10915, 11657, 13113, 18213,
  20475, 24471, 29760, 31357, 32525, 33109, 33222, 33704, 34222, 35064, 35242,
  37566, 38609, 43380, 43701,
];
const DAYS_BACK   = parseInt(process.env.QSRSOFT_OPS_DAYS_BACK   || '45', 10);
const DAYS_RECENT = parseInt(process.env.QSRSOFT_OPS_DAYS_RECENT || '4',  10);
const START_DATE  = (process.env.QSRSOFT_OPS_START_DATE || '').trim();
const END_DATE    = (process.env.QSRSOFT_OPS_END_DATE   || '').trim();
const DEBUG       = process.env.QSRSOFT_OPS_DEBUG === '1';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const nsn7 = n => String(n).padStart(7, '0');
const num  = v => (v == null || v === '' || isNaN(Number(v))) ? null : Number(v);
const fmtDate = d => d.toISOString().slice(0, 10);
const addDay  = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
// snake_case a camelCase api key; strip an 'ly.'/'ybl.' prefix handled by the caller.
const snake = s => s.replace(/([A-Z])/g, '_$1').replace(/__+/g, '_').toLowerCase().replace(/^_/, '');

// Map a flat api row's selected cols → { col: value } incl ly_/ybl_ twins. `cols` = the base
// (non-prefixed) api field names to keep. Returns snake_cased columns.
function mapCols(row, cols) {
  const out = {};
  for (const c of cols) {
    out[snake(c)] = num(row[c]);
    if (`ly.${c}` in row)  out['ly_' + snake(c)]  = num(row[`ly.${c}`]);
    if (`ybl.${c}` in row) out['ybl_' + snake(c)] = num(row[`ybl.${c}`]);
  }
  return out;
}

// ── Endpoint registry ─────────────────────────────────────────────────────────
// Each: table, PK conflict cols, url(date) builder, and map(row,date)→db record.
const COLS_CASH_EXTRACT = ['promoAmt','promoQty','netSalesAmt','drawerOpensQty','cashOverOrShort','tredsBeforeQty','tredsBeforeAmt','tredsAfterQty','tredsAfterAmt','overringQty','overringAmt','manRefundOverringAmt','cashRefundsQty','cashRefundsAmt','cashlessRefundsQty','cashlessRefundsAmt','couponAQty','couponBQty','couponCQty','couponDQty','couponEQty','empMealDiscountQty','empMealDiscountAmt','mgrMealDiscountQty','mgrMealDiscountAmt','discountQty','discountAmt','billableSalesQty','billableSalesAmt','pettyCashReimAmt','actualDepAmt'];
const COLS_LABOR_SUM    = ['overTimeTotalHours','overTimeTotalDollars','crewLaborDollars','crewLaborHours','totalHours','salariedManagerHours','grossDollars','salariedManagerDollars'];
const COLS_LABOR_DET    = ['totalNeededHours'];
const COLS_SERVICE      = ['ctpTotal','ctpTrans','oepeTotal','oepeTrans','oepeNoParked_total','oepeNoParked_trans','dtServeTotal','dtServeTrans','dtUntilStore','dtTrans','dtLineTimeTotal','dtLineTimeTrans','dtWinOneTimeTotal','dtWinOneTimeTrans','dtWinTwoTimeTotal','dtWinTwoTimeTrans','dtCarsHeld','dtHeldTime','mfyOneServeTotal','mfyOneServeTrans','mfyOneServeItems','mfyOneItemsCnt','mfy2_untilserve','mfyTwoServeTrans','mfyTwoServeItems','mfyTwoItemsCnt','healthyCnt','unhealthyCnt','fcUntilServe','fcTrans','fcUntilStore','rtpTotal','rtpTrans','bevUntilServe','bevTrans','bevRunTimeTotal','bevRunTimeTrans','bevUntilCloseDrawer'];
const COLS_SALES_MIX    = ['netSalesAmt','productSalesAmt','grossSalesQty','netSalesBfastAmt','netSalesBfastQty','netSalesDthruAmt','netSalesDthruQty','deliveryAmt','deliveryQty','netSalesEatinAmt','netSalesEatinQty','kioskAmt','kioskQty','mobileAmt','mobileQty','netSalesTakeoutAmt','netSalesTakeoutQty'];
const COLS_PEAKS        = ['allNetSales','transactions','deliveryAllNetSales','deliveryTransactions','dtAllNetSales','dtTransactions','driveThruMobileTransactions','driveThruMobileAllNetSales','fcAllNetSales','fcTransactions','kioskAllNetSales','kioskTransactions','mobileOrderAheadAllNetSales','mobileOrderAheadTransactions'];

const base = (date, extra = {}) => new URLSearchParams({
  nsn: STORE_NSNS.join(','), orgId: ORG_ID, enterpriseName: 'McDonalds',
  startDate: date, endDate: date, nsd: 'd', dsd: 's', weekStart: '3',
  daysOfWeek: '1,2,3,4,5,6,7', ...extra,
});

// Each endpoint's map returns a DB row: identity cols (loc/dt[/time_slice]) + a `metrics` JSONB
// holding all selected fields incl ly_/ybl_ twins (snake_cased). JSONB avoids a 300-column schema
// and lets loaders spread it; new selectCols need no migration. `merge:true` (labor-detail) upserts
// a partial payload — supabase-js only SETs the columns present, so it augments the labor row.
const ENDPOINTS = [
  { key: 'cash', table: 'qsr_cash_sheet', conflict: 'loc,dt',
    url: d => `${BASE}/reporting/v2/cash/cash-sheet-extract?${base(d, { compType: 'calendar', selectCols: COLS_CASH_EXTRACT.join(',') })}`,
    map: (r, d) => ({ loc: nsn7(r.storeNum), dt: d, metrics: mapCols(r, COLS_CASH_EXTRACT) }) },
  { key: 'labor', table: 'qsr_labor_summary', conflict: 'loc,dt',
    url: d => `${BASE}/reporting/v2/labor/labor-summary?${base(d, { compType: 'calendar', selectCols: COLS_LABOR_SUM.join(',') })}`,
    map: (r, d) => ({ loc: nsn7(r.storeNum), dt: d, metrics: mapCols(r, COLS_LABOR_SUM) }) },
  { key: 'laborDetail', table: 'qsr_labor_summary', conflict: 'loc,dt',
    url: d => `${BASE}/reporting/v2/labor/labor-detail?${base(d, { enterprise: 'laborDetail', compType: 'calendar', selectCols: COLS_LABOR_DET.join(',') })}`,
    map: (r, d) => ({ loc: nsn7(r.storeNum), dt: d, needed: mapCols(r, COLS_LABOR_DET) }) },
  { key: 'service', table: 'qsr_service_stats', conflict: 'loc,dt',
    url: d => `${BASE}/data_layer/v1/service/statistics?${base(d, { catalogType: 'serviceStats', enterprise: 'mcd', timeSegment: 'openClose', segmentBy: 'summary', segmentNames: 'timeSlice', segmentsSelected: 'open-close', compType: 'calendar', selectCols: COLS_SERVICE.join(',') })}`,
    map: (r, d) => ({ loc: nsn7(r.storeNum), dt: d, metrics: mapCols(r, COLS_SERVICE) }) },
  { key: 'salesMix', table: 'qsr_sales_mix', conflict: 'loc,dt',
    url: d => `${BASE}/reporting/v2/cash/cash-sheet?${base(d, { catalogType: 'cashSheet', compType: 'calendar', yblCompType: 'true', selectCols: COLS_SALES_MIX.join(',') })}`,
    map: (r, d) => ({ loc: nsn7(r.storeNum), dt: d, metrics: mapCols(r, COLS_SALES_MIX) }) },
  { key: 'peaks', table: 'qsr_peaks_sales', conflict: 'loc,dt,time_slice',
    url: d => `${BASE}/reporting/v2/sales/qtr-hr-sales?${base(d, { catalogType: 'sales', timeSegment: 'peaks', segmentBy: 'peaks', timeInterval: 'peaks', compType: 'trading', segmentNames: '7am-9am,7am-9am,11am-2pm,11am-2pm,5pm-7pm,5pm-7pm', segmentsSelected: '07:00-09:00,31:00-33:00,11:00-14:00,35:00-38:00,17:00-19:00,41:00-43:00', selectCols: COLS_PEAKS.join(',') })}`,
    map: (r, d) => ({ loc: nsn7(r.storeNum), dt: d, time_slice: String(r.timeSlice || ''), metrics: mapCols(r, COLS_PEAKS) }) },
];

// ── Fetch + upsert ──────────────────────────────────────────────────────────
const HDRS = t => ({ 'X-Auth-Token': t, 'Accept': 'application/json', 'Origin': 'https://v3.myqsrsoft.com', 'Referer': 'https://v3.myqsrsoft.com/reports/mcd/shift/operationsReport', 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36' });

async function fetchRows(url, token, evalPage) {
  if (evalPage) {
    const res = await evalPage.evaluate(async ({ url, token }) => {
      try {
        const r = await fetch(url, { headers: { 'X-Auth-Token': token, 'Accept': 'application/json', 'Origin': 'https://v3.myqsrsoft.com', 'Referer': 'https://v3.myqsrsoft.com/reports/mcd/shift/operationsReport' }, signal: AbortSignal.timeout(25000) });
        if (!r.ok) return { error: `HTTP ${r.status}` };
        const body = await r.json();
        // reporting/v2 wraps rows in { result: [...] }; data_layer/v1 (service stats) returns a bare array.
        return { rows: Array.isArray(body) ? body : (body?.result || []) };
      } catch (e) { return { error: e.message }; }
    }, { url, token });
    if (res.error) throw new Error(res.error);
    return res.rows || [];
  }
  const resp = await fetch(url, { headers: HDRS(token) });
  if (resp.status === 401 || resp.status === 403) throw new Error(`AUTH_FAILED:${resp.status}`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${(await resp.text()).slice(0, 160)}`);
  const body = await resp.json();
  return Array.isArray(body) ? body : (body?.result || []);
}

async function upsert(table, records, conflict) {
  const SIZE = 500; let total = 0;
  for (let i = 0; i < records.length; i += SIZE) {
    const { error } = await supabase.from(table).upsert(records.slice(i, i + SIZE), { onConflict: conflict });
    if (error) throw new Error(`[${table}] ${error.message}`);
    total += Math.min(SIZE, records.length - i);
  }
  return total;
}

// Run all endpoints across all dates with a given token (evalPage set → in-browser fetch).
async function runAll(token, dates, evalPage) {
  let grand = 0;
  for (const ep of ENDPOINTS) {
    let epTotal = 0;
    for (const date of dates) {
      try {
        const rows = await fetchRows(ep.url(date), token, evalPage);
        if (!rows.length) { if (DEBUG) console.log(`[ops] ${ep.key} ${date}: no data`); continue; }
        let records = rows.map(r => ep.map(r, date)).filter(r => r.loc && r.loc !== '0000000');
        // labor-detail merges its needed-hours into the labor row for the same (loc,dt).
        const n = await upsert(ep.table, records, ep.conflict);
        epTotal += n;
      } catch (e) {
        if (String(e.message).startsWith('AUTH_FAILED')) throw e;
        console.error(`[ops] ${ep.key} ${date} ERROR: ${e.message}`);
      }
      await new Promise(r => setTimeout(r, 120));
    }
    console.log(`[ops] ${ep.key} → ${ep.table}: ${epTotal} rows`);
    grand += epTotal;
  }
  return grand;
}

// ── Date range (gap-aware, like the DAR pull) ─────────────────────────────────
async function getDates() {
  const today = new Date();
  if (START_DATE) { const e = END_DATE || fmtDate(today); const out = []; for (let d = new Date(START_DATE); fmtDate(d) <= e; d = addDay(d, 1)) out.push(fmtDate(d)); return out; }
  let latest = null;
  try { const { data } = await supabase.from('qsr_cash_sheet').select('dt').order('dt', { ascending: false }).limit(1).single(); latest = data?.dt || null; } catch {}
  const daysSince = latest ? Math.floor((today - new Date(latest + 'T12:00:00Z')) / 86400000) : DAYS_BACK;
  const back = Math.min(Math.max(DAYS_RECENT, daysSince + DAYS_RECENT), DAYS_BACK);
  const out = []; for (let i = back; i >= 0; i--) out.push(fmtDate(addDay(today, -i)));
  return out;
}

// ── Playwright fallback (mirrors the DAR pull) ────────────────────────────────
async function viaPlaywright(dates) {
  const u = process.env.QSRSOFT_USERNAME, pw = process.env.QSRSOFT_PASSWORD;
  if (!u || !pw) { console.error('[auth] no QSRSOFT_USERNAME/PASSWORD — cannot use Playwright fallback'); return null; }
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ userAgent: HDRS('')['User-Agent'] })).newPage();
  page.setDefaultTimeout(180000);
  let token = null;
  page.on('request', req => { if (req.url().includes('api.reports.myqsrsoft.com')) { const t = req.headers()['x-auth-token']; if (t && t.length > 20 && !token) token = t; } });
  try {
    await page.goto('https://v3.myqsrsoft.com', { waitUntil: 'networkidle', timeout: 45000 });
    const userSel = ['input[name="username"]','input[name="email"]','input[type="email"]','#username','#email','input[autocomplete="username"]'].join(', ');
    await page.waitForSelector(userSel, { timeout: 20000 });
    await page.fill(userSel, u);
    await page.fill('input[type="password"], input[name="password"]', pw);
    await page.click('button[type="submit"], input[type="submit"], .btn-primary, button:has-text("Login"), button:has-text("Sign in")');
    await page.waitForLoadState('networkidle', { timeout: 30000 });
    await page.goto('https://v3.myqsrsoft.com/reports/mcd/shift/operationsReport', { waitUntil: 'networkidle', timeout: 30000 });
    await new Promise(r => setTimeout(r, 4000));
    // The Operations Report page doesn't always auto-fire an api.reports.myqsrsoft.com request, so the
    // token listener never sees one. The Daily Activity page reliably does (it's what the working DAR
    // pull uses) — and it's the SAME X-Auth-Token for every api.reports endpoint, so grab it there.
    if (!token) {
      console.log('[auth] no token from Operations Report — trying Daily Activity page…');
      await page.goto('https://v3.myqsrsoft.com/reports/mcd/shift/dailyActivity', { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 4000));
    }
    // 2026-08-04 fix: neither report page reliably auto-fires a request anymore (observed: both
    // navigations complete with zero api.reports.myqsrsoft.com traffic, silently producing "0 rows
    // upserted" every run since ~Aug 1 despite a valid login). qsrsoft-dar-pull.mjs's Playwright
    // fallback already has a third step for exactly this — an in-browser fetch() (with the page's
    // own session cookies) to ACTIVELY trigger the auth flow instead of waiting for a passive one.
    // Ported here verbatim: any one real endpoint URL works as the trigger, the request listener
    // above captures the X-Auth-Token from it the same way it would from an organic page request.
    if (!token) {
      console.log('[auth] no token from either report page — attempting in-browser fetch to trigger auth…');
      const triggerUrl = ENDPOINTS[0].url(dates[0]);
      const testResult = await page.evaluate(async ({ url }) => {
        try { const r = await fetch(url, { credentials: 'include' }); return { status: r.status, ok: r.ok }; }
        catch (e) { return { error: e.message }; }
      }, { url: triggerUrl });
      console.log('[auth] in-browser test fetch result:', JSON.stringify(testResult));
      await new Promise(r => setTimeout(r, 2000));
    }
    if (!token) { console.error('[auth] ✗ could not capture token from Operations Report, Daily Activity, or an in-browser fetch trigger'); return 0; }
    console.log(`[auth] ✓ token captured (${token.length} chars) — pulling ${dates.length} date(s) × ${ENDPOINTS.length} endpoints…`);
    return await runAll(token, dates, page);
  } finally { await browser.close(); }
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  if (!process.env.VITE_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) { console.error('Missing Supabase env'); process.exit(1); }
  const dates = await getDates();
  console.log(`[ops] pulling ${dates.length} date(s): ${dates[0]}…${dates[dates.length - 1]}`);
  let total = 0;
  const token = process.env.QSRSOFT_TOKEN;
  if (token) {
    try { total = await runAll(token, dates, null); }
    catch (e) { if (String(e.message).startsWith('AUTH_FAILED')) { console.log('[auth] direct token 401/403 — falling back to Playwright'); total = await viaPlaywright(dates); } else throw e; }
  } else { total = await viaPlaywright(dates); }
  console.log(`[ops] done — ${total} rows upserted across ${ENDPOINTS.length} endpoints.`);
  process.exit(0);
})().catch(e => { console.error('[ops] FATAL:', e); process.exit(1); });
