#!/usr/bin/env node
// scripts/qsrsoft-ebos-pull.mjs — QSRSoft eBOS Purchases daily sync
// Pulls the store purchase ledger from prod.ebos.qsrsoft.com for all 27 stores.
// Aggregates line items to daily totals (food, paper, ops supplies, happy meal, other).
// Smart gap-detection: only re-pulls what's missing + a rolling recent window for corrections.
//
// Required env vars:
//   VITE_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//
// Auth — provide ONE of:
//   QSRSOFT_EBOS_TOKEN        — pre-captured X-Auth-Token from prod.ebos.qsrsoft.com (fastest)
//   QSRSOFT_USERNAME + QSRSOFT_PASSWORD — Playwright: logs in and fetches ALL store data from
//                                          within the live browser session (token stays valid)
//
// Optional:
//   QSRSOFT_EBOS_DAYS_BACK    — max history on first run (default: 900 ≈ 30 months)
//   QSRSOFT_EBOS_DAYS_RECENT  — rolling re-pull window for corrections (default: 30)
//   QSRSOFT_EBOS_DEBUG        — set to '1' for verbose logging
//
// Token refresh: when QSRSOFT_EBOS_TOKEN expires, go to:
//   v3.myqsrsoft.com → Inventory → Purchases → Ledger tab
//   DevTools → Network → any prod.ebos.qsrsoft.com/api/inv/ request → copy X-Auth-Token
//   → update the QSRSOFT_EBOS_TOKEN GitHub Secret.

import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

const EBOS_BASE   = 'https://prod.ebos.qsrsoft.com';
const DAYS_BACK   = parseInt(process.env.QSRSOFT_EBOS_DAYS_BACK   || '900', 10);
const DAYS_RECENT = parseInt(process.env.QSRSOFT_EBOS_DAYS_RECENT || '30',  10);
const DEBUG       = process.env.QSRSOFT_EBOS_DEBUG === '1';

const pad2    = n => String(n).padStart(2, '0');
const fmtDate = d => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth()+1)}-${pad2(d.getUTCDate())}`;
const addDay  = (d, n) => { const r = new Date(d); r.setUTCDate(r.getUTCDate() + n); return r; };

const STORE_NSNS = [
  3708,  5183,  5985,  6178,  6838,  6972,
  10034, 10422, 10915, 11657, 13113, 18213,
  20475, 24471, 29760, 31357, 32525, 33109,
  33222, 33704, 34222, 35064, 35242, 37566,
  38609, 43380, 43701,
];

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// ── Smart gap detection ───────────────────────────────────────────────────────
async function getLatestDate() {
  const { data, error } = await supabase
    .from('qsr_ebos_daily')
    .select('date')
    .order('date', { ascending: false })
    .limit(1)
    .single();
  if (error || !data) return null;
  return new Date(data.date + 'T12:00:00Z');
}

async function getDateRange() {
  const today      = new Date();
  const latestDate = await getLatestDate();
  let daysBack;
  if (!latestDate) {
    daysBack = DAYS_BACK;
    console.log(`[ebos-pull] no existing data — pulling ${daysBack} days of history`);
  } else {
    const daysSince = Math.floor((today - latestDate) / 86400000);
    daysBack = Math.min(Math.max(DAYS_RECENT, daysSince + DAYS_RECENT), DAYS_BACK);
    console.log(`[ebos-pull] latest date ${fmtDate(latestDate)} (${daysSince}d ago) — pulling ${daysBack} days`);
  }
  const start = addDay(today, -daysBack);
  return { startDate: fmtDate(start), endDate: fmtDate(today) };
}

// ── Aggregate line items to daily totals ─────────────────────────────────────
// Only "Purchase" records count as spend. Credits and Out transfers are excluded.
function aggregateByDate(items, nsn) {
  const byDate = {};
  for (const item of items) {
    if (item.record_type !== 'Purchase') continue;
    const date = item.posted_date;
    if (!date) continue;
    if (!byDate[date]) byDate[date] = [0, 0, 0, 0, 0];
    byDate[date][0] += item.food_sub       || 0;
    byDate[date][1] += item.paper_sub      || 0;
    byDate[date][2] += item.ops_sub        || 0;
    byDate[date][3] += item.happy_meal_sub || 0;
    byDate[date][4] += item.other_sub      || 0;
  }
  const loc = String(nsn).padStart(7, '0');
  return Object.entries(byDate).map(([date, t]) => ({
    loc, date,
    food_purchases:  Math.round(t[0] * 10000) / 10000,
    paper_purchases: Math.round(t[1] * 10000) / 10000,
    ops_purchases:   Math.round(t[2] * 10000) / 10000,
    hm_purchases:    Math.round(t[3] * 10000) / 10000,
    other_purchases: Math.round(t[4] * 10000) / 10000,
  }));
}

// ── External fetch (used when QSRSOFT_EBOS_TOKEN env var is set) ─────────────
async function fetchStoreLedger(token, nsn, startDate, endDate) {
  const url = `${EBOS_BASE}/api/inv/${nsn}/purchase/store_ledger?start_date=${startDate}&end_date=${endDate}`;
  if (DEBUG) console.log(`[ebos] GET ${url}`);
  const resp = await fetch(url, {
    headers: {
      'X-Auth-Token':    token,
      'Accept':          'application/json',
      'Accept-Encoding': 'gzip, deflate, br, zstd',
      'Origin':          'https://v3.myqsrsoft.com',
      'Referer':         'https://v3.myqsrsoft.com/',
      'User-Agent':      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
    },
  });
  if (resp.status === 401 || resp.status === 403) throw new Error(`AUTH_FAILED:${resp.status}`);
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`HTTP ${resp.status}: ${body.slice(0, 200)}`);
  }
  return resp.json();
}

// ── Playwright: login, navigate, fetch ALL store data from within the session ─
// The eBOS session token is invalidated when the browser closes. To avoid this,
// we keep the browser open and run all 27 store_ledger fetches via page.evaluate()
// while the session is still alive. The browser only closes after all data is back.
async function pullViaPlaywright(startDate, endDate) {
  const u = process.env.QSRSOFT_USERNAME;
  const p = process.env.QSRSOFT_PASSWORD;
  if (!u || !p) {
    console.error('[auth] QSRSOFT_USERNAME or QSRSOFT_PASSWORD not set');
    return null;
  }

  console.log('[auth] launching Playwright…');
  const { mkdirSync } = await import('fs');
  try { mkdirSync('screenshots', { recursive: true }); } catch {}

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(180000); // 3 min — enough for 27 sequential API calls

  let ebosToken = null;
  // Capture token from /api/inv/ requests (not /api/cash/ which fires on the home page)
  page.on('request', req => {
    if (!req.url().includes('prod.ebos.qsrsoft.com/api/inv/')) return;
    const t = req.headers()['x-auth-token'];
    if (t && t.length > 20 && !ebosToken) {
      ebosToken = t;
      console.log('[auth] eBOS token captured from:', req.url().replace(/\?.*/, ''));
    }
  });

  const snap = async (name) => page.screenshot({ path: `screenshots/${name}`, fullPage: true }).catch(() => {});
  const wait = (ms) => new Promise(r => setTimeout(r, ms));

  try {
    // ── Login ──
    console.log('[auth] navigating to v3.myqsrsoft.com…');
    await page.goto('https://v3.myqsrsoft.com', { waitUntil: 'networkidle', timeout: 45000 });
    await snap('ebos-01-landing.png');

    const userSel = [
      'input[name="username"]', 'input[name="email"]', 'input[type="email"]',
      '#username', '#email', 'input[autocomplete="username"]',
      'input[placeholder*="email" i]', 'input[placeholder*="username" i]',
    ].join(', ');
    await page.waitForSelector(userSel, { timeout: 20000 });
    await page.fill(userSel, u);
    await page.fill('input[type="password"], input[name="password"]', p);
    await page.click('button[type="submit"], input[type="submit"], .btn-primary, button:has-text("Login"), button:has-text("Sign in")');
    await page.waitForLoadState('networkidle', { timeout: 30000 });
    await snap('ebos-02-post-login.png');
    console.log('[auth] post-login url:', page.url());

    // ── Navigate to Purchases page → triggers api/inv/purchase/vendor → captures token ──
    console.log('[auth] navigating to /cimt/inventory/purchases…');
    await page.goto('https://v3.myqsrsoft.com/cimt/inventory/purchases', { waitUntil: 'networkidle', timeout: 30000 });
    await wait(2000);
    await snap('ebos-03-purchases.png');
    console.log('[auth] purchases url:', page.url());

    if (!ebosToken) {
      console.error('[auth] ✗ could not capture eBOS token from purchases page');
      console.error('  Manual refresh: v3.myqsrsoft.com → Inventory → Purchases → Ledger tab');
      console.error('  DevTools → Network → prod.ebos.qsrsoft.com/api/inv/ request → X-Auth-Token');
      console.error('  → update QSRSOFT_EBOS_TOKEN GitHub Secret');
      await snap('ebos-final.png');
      return null;
    }
    console.log('[auth] ✓ eBOS token captured — fetching all stores from browser session…');

    // ── Fetch all 27 stores from WITHIN the live browser session ──
    // Browser stays open → session token remains valid for all fetches.
    // Aggregation runs in-browser to keep the returned payload small.
    console.log(`[ebos-pull] date range: ${startDate} → ${endDate} | stores: ${STORE_NSNS.length}`);

    const { rows, log } = await page.evaluate(async (args) => {
      const { token, nsns, startDate, endDate, base, debug } = args;
      const rows = [], log = [];

      for (const nsn of nsns) {
        const url = `${base}/api/inv/${nsn}/purchase/store_ledger?start_date=${startDate}&end_date=${endDate}`;
        try {
          const r = await fetch(url, {
            headers: {
              'X-Auth-Token': token,
              'Accept':       'application/json',
              'Origin':       'https://v3.myqsrsoft.com',
              'Referer':      'https://v3.myqsrsoft.com/',
            },
          });
          if (!r.ok) { log.push(`NSN ${nsn} HTTP ${r.status}`); continue; }
          const items = await r.json();

          // Aggregate: sum sub-categories by posted_date, Purchase records only
          const byDate = {};
          for (const item of items) {
            if (item.record_type !== 'Purchase' || !item.posted_date) continue;
            const d = item.posted_date;
            if (!byDate[d]) byDate[d] = [0, 0, 0, 0, 0];
            byDate[d][0] += item.food_sub       || 0;
            byDate[d][1] += item.paper_sub      || 0;
            byDate[d][2] += item.ops_sub        || 0;
            byDate[d][3] += item.happy_meal_sub || 0;
            byDate[d][4] += item.other_sub      || 0;
          }
          const loc = String(nsn).padStart(7, '0');
          const nDays = Object.keys(byDate).length;
          for (const [date, t] of Object.entries(byDate)) {
            rows.push({
              loc, date,
              food_purchases:  Math.round(t[0] * 10000) / 10000,
              paper_purchases: Math.round(t[1] * 10000) / 10000,
              ops_purchases:   Math.round(t[2] * 10000) / 10000,
              hm_purchases:    Math.round(t[3] * 10000) / 10000,
              other_purchases: Math.round(t[4] * 10000) / 10000,
            });
          }
          log.push(`NSN ${nsn}: ${items.length} line items → ${nDays} day-rows`);
          if (debug) log.push(`  sample: ${JSON.stringify(items[0]).slice(0, 120)}`);
        } catch (e) {
          log.push(`NSN ${nsn} error: ${e.message}`);
        }
      }
      return { rows, log };
    }, { token: ebosToken, nsns: STORE_NSNS, startDate, endDate, base: EBOS_BASE, debug: DEBUG });

    for (const msg of log) console.log('[ebos]', msg);
    await snap('ebos-final.png');
    return rows;

  } catch (e) {
    console.error('[auth] Playwright error:', e.message);
    await snap('ebos-error.png');
    return null;
  } finally {
    await browser.close();
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const envToken = (process.env.QSRSOFT_EBOS_TOKEN || '').trim();
  const { startDate, endDate } = await getDateRange();
  console.log(`[ebos-pull] stores: ${STORE_NSNS.length}`);

  // ── Path A: pre-captured token — fast external Node.js fetches ──
  if (envToken) {
    let totalLineItems = 0, totalDayRows = 0, totalSaved = 0, authFailed = false;
    const buffer = [];
    const flush = async () => {
      if (!buffer.length) return;
      const batch = buffer.splice(0);
      const { error } = await supabase.from('qsr_ebos_daily').upsert(batch, { onConflict: 'loc,date' });
      if (error) console.error('[supabase] upsert error:', error.message);
      else totalSaved += batch.length;
    };
    console.log(`[ebos-pull] using QSRSOFT_EBOS_TOKEN | date range: ${startDate} → ${endDate}`);
    for (const nsn of STORE_NSNS) {
      if (authFailed) break;
      try {
        const items = await fetchStoreLedger(envToken, nsn, startDate, endDate);
        const rows  = aggregateByDate(items, nsn);
        totalLineItems += items.length;
        totalDayRows   += rows.length;
        buffer.push(...rows);
        console.log(`[ebos] NSN ${nsn}: ${items.length} line items → ${rows.length} day-rows`);
        if (buffer.length >= 500) await flush();
      } catch (e) {
        if (e.message.startsWith('AUTH_FAILED')) {
          authFailed = true;
          console.error(`[ebos] QSRSOFT_EBOS_TOKEN expired — update the GitHub Secret`);
          console.error('  v3.myqsrsoft.com → Inventory → Purchases → Ledger tab');
          console.error('  DevTools → Network → prod.ebos.qsrsoft.com/api/inv/ → copy X-Auth-Token');
        } else {
          console.error(`[ebos] NSN ${nsn} error: ${e.message}`);
        }
      }
    }
    await flush();
    console.log(`[ebos-pull] done — ${totalLineItems} line items, ${totalDayRows} store-days, ${totalSaved} rows saved`);
    if (authFailed) process.exit(1);
    return;
  }

  // ── Path B: Playwright — login + fetch all data from within the live session ──
  const rows = await pullViaPlaywright(startDate, endDate);
  if (!rows) {
    console.error('[ebos-pull] no auth — set QSRSOFT_EBOS_TOKEN or QSRSOFT_USERNAME+PASSWORD');
    process.exit(1);
  }

  let totalSaved = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    const { error } = await supabase.from('qsr_ebos_daily').upsert(batch, { onConflict: 'loc,date' });
    if (error) console.error('[supabase] upsert error:', error.message);
    else totalSaved += batch.length;
  }
  console.log(`[ebos-pull] done — ${rows.length} store-days aggregated, ${totalSaved} rows saved to qsr_ebos_daily`);
}

main().catch(e => { console.error(e); process.exit(1); });
