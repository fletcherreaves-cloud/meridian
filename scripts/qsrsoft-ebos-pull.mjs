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
//   QSRSOFT_USERNAME + QSRSOFT_PASSWORD — Playwright fallback (navigates to Inventory page)
//
// Optional:
//   QSRSOFT_EBOS_DAYS_BACK    — max history on first run (default: 900 ≈ 30 months)
//   QSRSOFT_EBOS_DAYS_RECENT  — rolling re-pull window for corrections (default: 30)
//   QSRSOFT_EBOS_DEBUG        — set to '1' for verbose logging
//
// Token refresh: when auth fails, go to v3.myqsrsoft.com → Inventory → Purchases → Ledger tab,
// DevTools → Network → any prod.ebos.qsrsoft.com request → copy X-Auth-Token header value →
// update the QSRSOFT_EBOS_TOKEN GitHub Secret.

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

// ── Playwright: login to v3.myqsrsoft.com and navigate to Inventory ──────────
// The eBOS token only appears in requests to prod.ebos.qsrsoft.com, which the
// Inventory → Purchases section triggers. Different token from the reporting API.
// Nav is a sidebar with collapsible sections; direct URL nav doesn't work (SPA
// uses internal routing, not path/hash). Click through the sidebar instead.
async function getEbosTokenPlaywright() {
  const u = process.env.QSRSOFT_USERNAME;
  const p = process.env.QSRSOFT_PASSWORD;
  if (!u || !p) {
    console.error('[auth] Playwright skipped — QSRSOFT_USERNAME or QSRSOFT_PASSWORD not set');
    return null;
  }

  console.log('[auth] QSRSOFT_EBOS_TOKEN missing — trying Playwright login…');
  const { mkdirSync } = await import('fs');
  try { mkdirSync('screenshots', { recursive: true }); } catch {}

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();
  let ebosToken = null;

  // Capture X-Auth-Token from ANY request to prod.ebos.qsrsoft.com
  page.on('request', req => {
    if (!req.url().includes('prod.ebos.qsrsoft.com')) return;
    const h = req.headers();
    const t = h['x-auth-token'] || h['X-Auth-Token'];
    if (t && t.length > 20 && !ebosToken) {
      ebosToken = t;
      console.log('[auth] eBOS token captured from:', req.url().replace(/\?.*/, ''));
    }
  });

  const snap = async (name) => page.screenshot({ path: `screenshots/${name}`, fullPage: true }).catch(() => {});
  const wait = (ms) => new Promise(r => setTimeout(r, ms));

  // Click the first visible element matching any selector in the list
  const clickFirst = async (selectors, timeout = 5000) => {
    for (const sel of selectors) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout }).catch(() => false)) {
          await el.click();
          return true;
        }
      } catch {}
    }
    return false;
  };

  try {
    console.log('[auth] navigating to v3.myqsrsoft.com…');
    await page.goto('https://v3.myqsrsoft.com', { waitUntil: 'networkidle', timeout: 45000 });
    await snap('ebos-01-landing.png');

    const userSel = [
      'input[name="username"]', 'input[name="email"]', 'input[type="email"]',
      '#username', '#email', 'input[autocomplete="username"]',
      'input[placeholder*="email" i]', 'input[placeholder*="username" i]',
    ].join(', ');
    const passSel = 'input[type="password"], input[name="password"]';
    const subSel  = 'button[type="submit"], input[type="submit"], .btn-primary, button:has-text("Login"), button:has-text("Sign in")';

    await page.waitForSelector(userSel, { timeout: 20000 });
    await page.fill(userSel, u);
    await page.fill(passSel, p);
    await page.click(subSel);
    await page.waitForLoadState('networkidle', { timeout: 30000 });
    await snap('ebos-02-post-login.png');
    console.log('[auth] post-login url:', page.url());

    if (!ebosToken) {
      // Dismiss any modal that appeared on the home dashboard (e.g. Waste Entry popup)
      await page.keyboard.press('Escape').catch(() => {});
      await wait(800);
      await clickFirst([
        'button:has-text("CANCEL")', 'button:has-text("Cancel")',
        '[aria-label="Close"]', 'button.close', '.modal-close',
      ], 2000);
      await wait(500);

      // Click "Inventory" in the sidebar — uses Playwright text locator which
      // matches any element type (div/span/button), not just <a>/<li>
      console.log('[auth] clicking Inventory in sidebar…');
      const invOk = await clickFirst([
        'text=Inventory',
        'nav >> text=Inventory',
        'aside >> text=Inventory',
        '[class*="sidebar"] >> text=Inventory',
        '[class*="nav"] >> text=Inventory',
      ]);
      await wait(2000);
      await snap('ebos-03-inventory-click.png');
      console.log('[auth] after Inventory click, url:', page.url(), '| found:', invOk);

      if (!ebosToken) {
        console.log('[auth] clicking Purchases…');
        const purOk = await clickFirst([
          'text=Purchases',
          'nav >> text=Purchases',
          'aside >> text=Purchases',
          '[class*="sidebar"] >> text=Purchases',
          'a:has-text("Purchases")',
          'button:has-text("Purchases")',
        ]);
        await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
        await wait(3000);
        await snap('ebos-04-purchases.png');
        console.log('[auth] after Purchases click, url:', page.url(), '| found:', purOk);
      }

      if (!ebosToken) {
        console.log('[auth] clicking Ledger tab…');
        const ledOk = await clickFirst([
          'text=Ledger',
          'button:has-text("Ledger")',
          'a:has-text("Ledger")',
          '[data-tab*="ledger" i]',
          '[class*="tab"]:has-text("Ledger")',
        ]);
        await wait(3000);
        await snap('ebos-05-ledger.png');
        console.log('[auth] after Ledger click, url:', page.url(), '| found:', ledOk);
      }

      // Give any pending eBOS requests a moment to fire
      if (!ebosToken) await wait(3000);
    }

    await snap('ebos-final.png');
    console.log('[auth] final url:', page.url());

  } catch (e) {
    console.error('[auth] Playwright error:', e.message);
    await snap('ebos-error.png');
  } finally {
    await browser.close();
  }

  if (ebosToken) {
    console.log('[auth] ✓ eBOS token captured via Playwright');
  } else {
    console.error('[auth] ✗ could not capture eBOS token via Playwright');
    console.error('  Manual refresh: v3.myqsrsoft.com → Inventory → Purchases → Ledger tab');
    console.error('  DevTools → Network → any prod.ebos.qsrsoft.com request → copy X-Auth-Token');
    console.error('  → update QSRSOFT_EBOS_TOKEN GitHub Secret');
  }
  return ebosToken;
}

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

// ── Fetch one store's purchase ledger for a date range ───────────────────────
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

// ── Aggregate line items to daily totals ─────────────────────────────────────
// Only "Purchase" records count as spend. Credits and Out transfers are excluded.
// Each sub-field (food, paper, ops, etc.) is summed per posted_date.
function aggregateByDate(items, nsn) {
  const byDate = {};
  for (const item of items) {
    if (item.record_type !== 'Purchase') continue;
    const date = item.posted_date;
    if (!date) continue;
    if (!byDate[date]) {
      byDate[date] = { food: 0, paper: 0, ops: 0, hm: 0, other: 0 };
    }
    byDate[date].food  += item.food_sub        || 0;
    byDate[date].paper += item.paper_sub       || 0;
    byDate[date].ops   += item.ops_sub         || 0;
    byDate[date].hm    += item.happy_meal_sub  || 0;
    byDate[date].other += item.other_sub       || 0;
  }

  const loc = String(nsn).padStart(7, '0');
  return Object.entries(byDate).map(([date, t]) => ({
    loc,
    date,
    food_purchases:  Math.round(t.food  * 10000) / 10000,
    paper_purchases: Math.round(t.paper * 10000) / 10000,
    ops_purchases:   Math.round(t.ops   * 10000) / 10000,
    hm_purchases:    Math.round(t.hm    * 10000) / 10000,
    other_purchases: Math.round(t.other * 10000) / 10000,
  }));
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  // QSRSOFT_EBOS_TOKEN preferred; Playwright fallback captures it by navigating to Inventory
  const envToken = (process.env.QSRSOFT_EBOS_TOKEN || '').trim();
  const token = envToken || await getEbosTokenPlaywright();
  if (!token) {
    console.error('[ebos-pull] no auth token available — exiting');
    process.exit(1);
  }

  const { startDate, endDate } = await getDateRange();
  console.log(`[ebos-pull] date range: ${startDate} → ${endDate}`);
  console.log(`[ebos-pull] stores: ${STORE_NSNS.length}`);

  let totalLineItems = 0;
  let totalDayRows   = 0;
  let totalSaved     = 0;
  let authFailed     = false;
  const buffer = [];

  async function flush() {
    if (!buffer.length) return;
    const batch = buffer.splice(0);
    const { error } = await supabase.from('qsr_ebos_daily').upsert(batch, { onConflict: 'loc,date' });
    if (error) console.error('[supabase] upsert error:', error.message);
    else totalSaved += batch.length;
  }

  for (const nsn of STORE_NSNS) {
    if (authFailed) break;
    try {
      const items = await fetchStoreLedger(token, nsn, startDate, endDate);
      const rows  = aggregateByDate(items, nsn);
      totalLineItems += items.length;
      totalDayRows   += rows.length;
      buffer.push(...rows);
      console.log(`[ebos] NSN ${nsn}: ${items.length} line items → ${rows.length} day-rows`);
      if (buffer.length >= 500) await flush();
    } catch (e) {
      if (e.message.startsWith('AUTH_FAILED')) {
        authFailed = true;
        console.error(`[ebos] auth failed on NSN ${nsn} — QSRSOFT_EBOS_TOKEN has expired`);
        console.error('  Refresh: v3.myqsrsoft.com → Inventory → Purchases → Ledger tab');
        console.error('  DevTools → Network → prod.ebos.qsrsoft.com request → copy X-Auth-Token');
        console.error('  → update QSRSOFT_EBOS_TOKEN GitHub Secret');
      } else {
        console.error(`[ebos] NSN ${nsn} error: ${e.message}`);
      }
    }
  }

  await flush();
  console.log(`[ebos-pull] done — ${totalLineItems} line items, ${totalDayRows} store-days aggregated, ${totalSaved} rows saved to qsr_ebos_daily`);
  if (authFailed) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
