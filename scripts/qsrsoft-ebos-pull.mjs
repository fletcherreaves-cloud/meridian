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
// Auth — tried in order:
//   QSRSOFT_EBOS_TOKEN   — pre-captured X-Auth-Token from prod.ebos.qsrsoft.com (fastest)
//   getFreshToken()      — mints a fresh Cognito ID token (scripts/lib/qsrsoft-auth.mjs),
//                          exchanged for an eBOS token via SSO endpoint
//                          (api.sso.myqsrsoft.com/token/ebosByOrg — no Playwright needed).
//                          Dispatch #82 / memory/project-qsrsoft-cognito-auth-312.md: a
//                          QSRSOFT_TOKEN stored as a static secret is a ~1h-TTL Cognito
//                          token, stale ~23/24 hours by construction — QSRSOFT_TOKEN is no
//                          longer read here, replaced by a per-run fresh mint.
//   QSRSOFT_USERNAME + QSRSOFT_PASSWORD — Playwright fallback: logs in, clicks Ledger tab,
//                                          fetches all store data from within the live session
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
import { withRetry } from './_retry.mjs';
import { makeOutcomeTracker } from './lib/pull-outcome.mjs';
import { getFreshToken } from './lib/qsrsoft-auth.mjs';

const EBOS_BASE   = 'https://prod.ebos.qsrsoft.com';
const DAYS_BACK   = parseInt(process.env.QSRSOFT_EBOS_DAYS_BACK   || '900', 10);
const DAYS_RECENT = parseInt(process.env.QSRSOFT_EBOS_DAYS_RECENT || '30',  10);
const DEBUG       = process.env.QSRSOFT_EBOS_DEBUG      === '1';
const FORCE_FULL  = process.env.QSRSOFT_EBOS_FORCE_FULL === '1';

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

// ── SSO token exchange ────────────────────────────────────────────────────────
// The purchases page sends the main QSRSoft X-Auth-Token to this SSO endpoint
// and receives an eBOS-specific X-Auth-Token in return. Given a fresh Cognito ID
// token (getFreshToken()) we can skip Playwright entirely — just exchange and pull.
const EBOS_ORG_ID = 'a546d4ef-684a-4f25-8bc0-6580af068875';

async function getEbosTokenViaSso(qsrsoftToken) {
  const url = `https://api.sso.myqsrsoft.com/token/ebosByOrg?orgId=${EBOS_ORG_ID}`;
  console.log('[auth] trying SSO token exchange…');
  const resp = await fetch(url, {
    headers: {
      'X-Auth-Token': qsrsoftToken,
      'Accept':       'application/json',
      'Origin':       'https://v3.myqsrsoft.com',
      'Referer':      'https://v3.myqsrsoft.com/',
      'User-Agent':   'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
    },
  });
  if (!resp.ok) {
    console.log(`[auth] SSO exchange HTTP ${resp.status} — token may not work for eBOS`);
    return null;
  }
  const data = await resp.json();
  if (DEBUG) console.log('[auth] SSO response:', JSON.stringify(data).slice(0, 200));
  // Response shape TBD — log all keys on first successful call
  const token = data.token || data.accessToken || data.access_token
              || data.ebosByOrg || data.ebosToken || data.x_auth_token
              || (typeof data === 'string' ? data : null);
  console.log('[auth] SSO response keys:', Object.keys(data).join(', '));
  if (!token) console.log('[auth] SSO response (full):', JSON.stringify(data).slice(0, 400));
  return token || null;
}

// ── Smart gap detection ───────────────────────────────────────────────────────
async function getLatestDate() {
  const { data, error } = await supabase
    .from('qsr_ebos_daily')
    .select('date')
    .order('date', { ascending: false })
    .limit(1)
    .single();
  // #399: `error || !data` collapsed a genuinely-empty table (PGRST116) and a FAILED
  // read (network/RLS/timeout/522) into the same "no existing data" null -- and null
  // here selects the largest backfill window below. Only PGRST116 means empty; any
  // other error must abort, not escalate to the biggest pull.
  if (error && error.code !== 'PGRST116') throw new Error(`[qsrsoft-ebos-pull] getLatestDate() read failed -- ${error.code}: ${error.message}`);
  if (!data) return null;
  return new Date(data.date + 'T12:00:00Z');
}

async function getDateRange() {
  const today = new Date();
  if (FORCE_FULL) {
    console.log(`[ebos-pull] force_full=1 — pulling full ${DAYS_BACK} days of history`);
    return { startDate: fmtDate(addDay(today, -DAYS_BACK)), endDate: fmtDate(today) };
  }
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
// The QSRSoft ledger "Total Purchases" row = Purchase + Credit + Adjustment records (transfers "Out"/"In"
// are the separate "Total Transfers" row). Verified on 5183 July: ops Purchase 4555.20 + Credit 328.66 =
// 4883.86 = the ledger Ops Supplies column to the cent (Credit was previously dropped → op supplies was
// under-reported). Only ops_purchases is consumed downstream, but netting credits into every category
// keeps all of them ledger-accurate.
const PURCHASE_RECORD_TYPES = new Set(['Purchase', 'Credit', 'Adjustment']);
const isPurchaseRecord = rt => PURCHASE_RECORD_TYPES.has(rt);
function aggregateByDate(items, nsn) {
  // One-time raw-field dump (DUMP_EBOS_FIELDS=1) for a target store — reveal every numeric sub-field +
  // its month total so we can see which fields QSRSoft rolls into the ledger "Ops Supplies" column.
  if (process.env.DUMP_EBOS_FIELDS === '1' && !globalThis.__ebosDumped
      && String(nsn) === (process.env.DUMP_EBOS_STORE || '5183')) {
    globalThis.__ebosDumped = true;
    const mon = process.env.DUMP_EBOS_MONTH || '2026-07';
    const purch = items.filter(it => it.record_type === 'Purchase' && String(it.posted_date || '').startsWith(mon));
    console.log(`[EBOS-FIELDS] NSN ${nsn} month ${mon}: ${purch.length} Purchase items; keys: ${Object.keys(purch[0] || items[0] || {}).join(', ')}`);
    const totals = {};
    for (const it of purch) for (const [k, v] of Object.entries(it)) if (typeof v === 'number') totals[k] = (totals[k] || 0) + v;
    console.log(`[EBOS-FIELDS] NSN ${nsn} ${mon} numeric-field totals: ${JSON.stringify(Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, Math.round(v * 100) / 100])))}`);
    console.log(`[EBOS-FIELDS] record_type values: ${JSON.stringify([...new Set(items.map(it => it.record_type))])}`);
    // ops_sub broken down by record_type (all rows in the month) — reveal whether the ledger's Ops
    // Supplies nets in Credit/Adjustment/Out, and by how much (should reconcile to 4883.86 for 5183).
    const byRt = {};
    for (const it of items.filter(x => String(x.posted_date || '').startsWith(mon))) {
      const rt = it.record_type || '?';
      byRt[rt] = byRt[rt] || { count: 0, ops_sub: 0, other_sub: 0, happy_meal_sub: 0, other_charges_credits: 0 };
      byRt[rt].count++; byRt[rt].ops_sub += it.ops_sub || 0; byRt[rt].other_sub += it.other_sub || 0;
      byRt[rt].happy_meal_sub += it.happy_meal_sub || 0; byRt[rt].other_charges_credits += it.other_charges_credits || 0;
    }
    console.log(`[EBOS-FIELDS] ${mon} ops_sub/etc by record_type: ${JSON.stringify(Object.fromEntries(Object.entries(byRt).map(([k, v]) => [k, { count: v.count, ops_sub: Math.round(v.ops_sub * 100) / 100, other_sub: Math.round(v.other_sub * 100) / 100, hm: Math.round(v.happy_meal_sub * 100) / 100, occ: Math.round(v.other_charges_credits * 100) / 100 }])))}`);
    const credOps = items.filter(x => x.record_type === 'Credit' && String(x.posted_date || '').startsWith(mon) && Math.abs(x.ops_sub || 0) > 0.005)
      .map(x => ({ date: x.posted_date, inv: x.invoice_identifier, wrin: x.wrin, desc: x.description, ops: Math.round((x.ops_sub || 0) * 100) / 100, total: Math.round((x.total_amount || 0) * 100) / 100 }))
      .sort((a, b) => Math.abs(b.ops) - Math.abs(a.ops));
    console.log(`[EBOS-FIELDS] ${mon} Credit line items with ops spend (${credOps.length}): ${JSON.stringify(credOps.slice(0, 30))}`);
    console.log(`[EBOS-FIELDS] sample Purchase item: ${JSON.stringify(purch[0] || {})}`);
  }
  // Per-date raw line-item dump (DUMP_EBOS_DATES=YYYY-MM-DD,YYYY-MM-DD,...) — for comparing two
  // dates whose day-bucket totals came out byte-identical (a real anomaly: independent purchase
  // batches essentially never post the exact same total to the cent). Reveals whether it's the
  // SAME invoice landing on two dates (a date-assignment bug) or two genuinely different invoices.
  const dumpDates = String(nsn) === (process.env.DUMP_EBOS_STORE || '5183')
    ? (process.env.DUMP_EBOS_DATES || '').split(',').map(s => s.trim()).filter(Boolean) : [];
  for (const d of dumpDates) {
    const dayItems = items.filter(x => isPurchaseRecord(x.record_type) && String(x.posted_date || '') === d)
      .map(x => ({ id: x.id, line_item_id: x.line_item_id, inv: x.invoice_identifier, wrin: x.wrin, desc: x.description, rt: x.record_type, ops: Math.round((x.ops_sub || 0) * 100) / 100, total: Math.round((x.total_amount || 0) * 100) / 100 }));
    console.log(`[EBOS-DATE] NSN ${nsn} ${d}: ${dayItems.length} purchase-record item(s), ops_sub sum ${Math.round(dayItems.reduce((s, x) => s + x.ops, 0) * 100) / 100}: ${JSON.stringify(dayItems)}`);
  }
  const byDate = {};
  for (const item of items) {
    if (!isPurchaseRecord(item.record_type)) continue;   // Purchase + Credit + Adjustment (ledger Total Purchases)
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
      'X-Current-Nsn':   String(nsn),
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
    // Dispatch #177 investigation: log every prod.ebos.qsrsoft.com/api/ URL fired while DEBUG
    // is on, so a one-off run can reveal endpoints beyond store_ledger (e.g. whatever backs the
    // "approvePending" tab) without any change to the production pull/aggregate path.
    if (DEBUG && req.url().includes('prod.ebos.qsrsoft.com/api/')) {
      console.log('[debug-req]', req.method(), req.url().replace(/\?.*/, ''), '| qs:', req.url().split('?')[1] || '');
    }
    if (!req.url().includes('prod.ebos.qsrsoft.com/api/inv/')) return;
    const t = req.headers()['x-auth-token'];
    if (t && t.length > 20 && !ebosToken) {
      ebosToken = t;
      console.log('[auth] eBOS token captured from:', req.url().replace(/\?.*/, ''));
    }
  });

  // Dispatch #177 investigation: also capture response BODIES for the same set of requests, so a
  // one-off DEBUG run can reveal field shape (e.g. a posted/pending status) without a second pass.
  if (DEBUG) {
    page.on('response', async resp => {
      const url = resp.url();
      if (!url.includes('prod.ebos.qsrsoft.com/api/')) return;
      try {
        const ct = resp.headers()['content-type'] || '';
        if (!ct.includes('json')) return;
        const body = await resp.text();
        console.log('[debug-resp]', url.replace(/\?.*/, ''), '| status:', resp.status(), '| body(first 800):', body.slice(0, 800));
      } catch (e) {
        console.log('[debug-resp] read failed for', url.replace(/\?.*/, ''), '-', e.message);
      }
    });
  }

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

    // ── Navigate to Purchases page ──
    // The overview uses GraphQL (no X-Auth-Token). REST calls to prod.ebos.qsrsoft.com/api/inv/
    // only fire when the Ledger tab is clicked — so we must click it to capture the token.
    console.log('[auth] navigating to /cimt/inventory/purchases…');
    await page.goto('https://v3.myqsrsoft.com/cimt/inventory/purchases', { waitUntil: 'networkidle', timeout: 30000 });
    await wait(2000);
    await snap('ebos-03-purchases.png');
    console.log('[auth] purchases url:', page.url());

    if (!ebosToken) {
      // Diagnostic: log all tab-role / tab-class elements so we can see exact text
      const tabInfo = await page.evaluate(() =>
        [...document.querySelectorAll('[role="tab"], [class*="tab"]')]
          .map(el => el.textContent.trim().slice(0, 40))
          .filter(Boolean)
      );
      console.log('[auth] tabs on page:', JSON.stringify(tabInfo));

      // Click the Ledger tab via DOM text-node walk (works on any element type)
      const ledgerClick = await page.evaluate(() => {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
          if (node.textContent.trim() !== 'Ledger') continue;
          let el = node.parentElement;
          for (let i = 0; i < 5; i++) {
            if (!el) break;
            const r = el.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) {
              el.click();
              return { ok: true, tag: el.tagName, cls: el.className.toString().slice(0, 60) };
            }
            el = el.parentElement;
          }
        }
        return { ok: false };
      });
      console.log('[auth] Ledger tab click:', JSON.stringify(ledgerClick));
      await wait(3000); // wait for REST call to fire
      await snap('ebos-04-ledger.png');
      console.log('[auth] after Ledger click, url:', page.url(), '| token:', !!ebosToken);
    }

    if (!ebosToken) {
      console.error('[auth] ✗ could not capture eBOS token');
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
      let dumped = false;

      for (const nsn of nsns) {
        const url = `${base}/api/inv/${nsn}/purchase/store_ledger?start_date=${startDate}&end_date=${endDate}`;
        try {
          const r = await fetch(url, {
            headers: {
              'X-Auth-Token':  token,
              'X-Current-Nsn': String(nsn),
              'Accept':        'application/json',
              'Origin':        'https://v3.myqsrsoft.com',
              'Referer':       'https://v3.myqsrsoft.com/',
            },
          });
          if (!r.ok) { log.push(`NSN ${nsn} HTTP ${r.status}`); continue; }
          const items = await r.json();

          // One-time raw-field dump (DUMP_EBOS_FIELDS=1) — reveal every numeric sub-field + its month
          // total so we can see which fields QSRSoft rolls into the ledger "Ops Supplies" column.
          if (args.dumpFields && !dumped && String(nsn) === (args.dumpStore || '5183')) {
            dumped = true;
            const mon = args.dumpMonth || '2026-07';
            const purch = items.filter(it => it.record_type === 'Purchase' && String(it.posted_date || '').startsWith(mon));
            log.push(`[EBOS-FIELDS] NSN ${nsn} month ${mon}: ${purch.length} Purchase items; keys: ${Object.keys(purch[0] || items[0] || {}).join(', ')}`);
            const totals = {};
            for (const it of purch) for (const [k, v] of Object.entries(it)) if (typeof v === 'number') totals[k] = (totals[k] || 0) + v;
            log.push(`[EBOS-FIELDS] NSN ${nsn} ${mon} numeric-field totals: ${JSON.stringify(Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, Math.round(v * 100) / 100])))}`);
            log.push(`[EBOS-FIELDS] record_type values seen: ${JSON.stringify([...new Set(items.map(it => it.record_type))])}`);
            const byRt = {};
            for (const it of items.filter(x => String(x.posted_date || '').startsWith(mon))) {
              const rt = it.record_type || '?';
              byRt[rt] = byRt[rt] || { count: 0, ops_sub: 0, other_sub: 0, happy_meal_sub: 0, other_charges_credits: 0 };
              byRt[rt].count++; byRt[rt].ops_sub += it.ops_sub || 0; byRt[rt].other_sub += it.other_sub || 0;
              byRt[rt].happy_meal_sub += it.happy_meal_sub || 0; byRt[rt].other_charges_credits += it.other_charges_credits || 0;
            }
            log.push(`[EBOS-FIELDS] ${mon} by record_type: ${JSON.stringify(Object.fromEntries(Object.entries(byRt).map(([k, v]) => [k, { n: v.count, ops: Math.round(v.ops_sub * 100) / 100, other: Math.round(v.other_sub * 100) / 100, hm: Math.round(v.happy_meal_sub * 100) / 100, occ: Math.round(v.other_charges_credits * 100) / 100 }])))}`);
            // Individual Credit line items that carry ops spend — answers "what were the positive credits?"
            const credOps = items.filter(x => x.record_type === 'Credit' && String(x.posted_date || '').startsWith(mon) && Math.abs(x.ops_sub || 0) > 0.005)
              .map(x => ({ date: x.posted_date, inv: x.invoice_identifier, wrin: x.wrin, desc: x.description, ops: Math.round((x.ops_sub || 0) * 100) / 100, total: Math.round((x.total_amount || 0) * 100) / 100 }))
              .sort((a, b) => Math.abs(b.ops) - Math.abs(a.ops));
            log.push(`[EBOS-FIELDS] ${mon} Credit line items with ops spend (${credOps.length}): ${JSON.stringify(credOps.slice(0, 30))}`);
            log.push(`[EBOS-FIELDS] sample Purchase item: ${JSON.stringify(purch[0] || {})}`);
          }

          // Per-date raw line-item dump (args.dumpDates) — see the Node-side aggregateByDate's
          // matching block for what this answers. record_type check inlined (isPurchaseRecord
          // is a Node module-scope const, not reachable inside this in-browser page.evaluate).
          if (String(nsn) === (args.dumpStore || '5183') && args.dumpDates && args.dumpDates.length) {
            const PT = { Purchase: 1, Credit: 1, Adjustment: 1 };
            for (const d of args.dumpDates) {
              const dayItems = items.filter(x => PT[x.record_type] && String(x.posted_date || '') === d)
                .map(x => ({ id: x.id, line_item_id: x.line_item_id, inv: x.invoice_identifier, wrin: x.wrin, desc: x.description, rt: x.record_type, ops: Math.round((x.ops_sub || 0) * 100) / 100, total: Math.round((x.total_amount || 0) * 100) / 100 }));
              log.push(`[EBOS-DATE] NSN ${nsn} ${d}: ${dayItems.length} purchase-record item(s), ops_sub sum ${Math.round(dayItems.reduce((s, x) => s + x.ops, 0) * 100) / 100}: ${JSON.stringify(dayItems)}`);
            }
          }

          // Aggregate: sum sub-categories by posted_date, Purchase records only
          const byDate = {};
          const PT = { Purchase: 1, Credit: 1, Adjustment: 1 };   // ledger "Total Purchases" = these (not Out/In transfers)
          for (const item of items) {
            if (!PT[item.record_type] || !item.posted_date) continue;
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

          // Dispatch #177 investigation: confirmed via a DEBUG request-log capture that
          // GET /api/inv/{nsn}/purchase?purchase_status=Pending is a real, same-token eBOS
          // endpoint (it's what the Purchases page's default "approvePending" tab calls) --
          // but the one store sampled there (3708) had zero pending invoices, so its shape
          // is still unknown. Probe all stores here (still read-only, no persistence) to find
          // a real non-empty example.
          if (args.probePending) {
            try {
              const pr = await fetch(`${base}/api/inv/${nsn}/purchase?purchase_status=Pending`, {
                headers: {
                  'X-Auth-Token':  token,
                  'X-Current-Nsn': String(nsn),
                  'Accept':        'application/json',
                  'Origin':        'https://v3.myqsrsoft.com',
                  'Referer':       'https://v3.myqsrsoft.com/',
                },
              });
              if (!pr.ok) { log.push(`[PENDING-PROBE] NSN ${nsn} HTTP ${pr.status}`); }
              else {
                const pending = await pr.json();
                const n = Array.isArray(pending) ? pending.length : -1;
                log.push(`[PENDING-PROBE] NSN ${nsn}: ${n} pending invoice(s)${n > 0 ? ' -- keys: ' + Object.keys(pending[0]).join(', ') + ' -- sample: ' + JSON.stringify(pending[0]).slice(0, 500) : ''}`);
              }
            } catch (e) {
              log.push(`[PENDING-PROBE] NSN ${nsn} error: ${e.message}`);
            }
            // All 27 stores came back 0 pending -- healthy, but leaves the item SHAPE unknown
            // for the case that matters. One extra call (single store only) against the same
            // endpoint with purchase_status=Approved reveals that shape via a real record,
            // without fabricating field names for a financial-verification check.
            if (String(nsn) === (args.dumpStore || '5183')) {
              try {
                const ar = await fetch(`${base}/api/inv/${nsn}/purchase?purchase_status=Approved`, {
                  headers: {
                    'X-Auth-Token':  token,
                    'X-Current-Nsn': String(nsn),
                    'Accept':        'application/json',
                    'Origin':        'https://v3.myqsrsoft.com',
                    'Referer':       'https://v3.myqsrsoft.com/',
                  },
                });
                if (!ar.ok) { log.push(`[APPROVED-PROBE] NSN ${nsn} HTTP ${ar.status}`); }
                else {
                  const approved = await ar.json();
                  const n = Array.isArray(approved) ? approved.length : -1;
                  log.push(`[APPROVED-PROBE] NSN ${nsn}: ${n} approved invoice(s)${n > 0 ? ' -- keys: ' + Object.keys(approved[0]).join(', ') + ' -- sample: ' + JSON.stringify(approved[0]).slice(0, 600) : ''}`);
                }
              } catch (e) {
                log.push(`[APPROVED-PROBE] NSN ${nsn} error: ${e.message}`);
              }
            }
          }
        } catch (e) {
          log.push(`NSN ${nsn} error: ${e.message}`);
        }
      }
      return { rows, log };
    }, { token: ebosToken, nsns: STORE_NSNS, startDate, endDate, base: EBOS_BASE, debug: DEBUG,
         dumpFields: process.env.DUMP_EBOS_FIELDS === '1', dumpStore: process.env.DUMP_EBOS_STORE || '5183', dumpMonth: process.env.DUMP_EBOS_MONTH || '2026-07',
         dumpDates: (process.env.DUMP_EBOS_DATES || '').split(',').map(s => s.trim()).filter(Boolean),
         probePending: process.env.PROBE_PENDING_INVOICES === '1' });

    for (const msg of log) console.log('[ebos]', msg);
    await snap('ebos-final.png');
    return { rows, log };

  } catch (e) {
    console.error('[auth] Playwright error:', e.message);
    await snap('ebos-error.png');
    return null;
  } finally {
    await browser.close();
  }
}

// ── Fetch all stores with a known token (external Node.js fetches) ────────────
async function runWithToken(token, startDate, endDate) {
  let totalLineItems = 0, totalDayRows = 0, totalSaved = 0, authFailed = false;
  const tracker = makeOutcomeTracker('ebos-pull');
  const buffer = [];
  const flush = async () => {
    if (!buffer.length) return;
    const batch = buffer.splice(0);
    const { error } = await withRetry(() => supabase.from('qsr_ebos_daily').upsert(batch, { onConflict: 'loc,date' }), { label: 'qsr_ebos_daily upsert' });
    if (error) console.error('[supabase] upsert error:', error.message);
    else totalSaved += batch.length;
  };
  console.log(`[ebos-pull] date range: ${startDate} → ${endDate}`);
  for (const nsn of STORE_NSNS) {
    if (authFailed) break;
    try {
      const items = await fetchStoreLedger(token, nsn, startDate, endDate);
      const rows  = aggregateByDate(items, nsn);
      totalLineItems += items.length;
      totalDayRows   += rows.length;
      // Dispatch (2026-09-01, Mossy Head/37566 finding): a day that had purchase-record ops on an
      // EARLIER pull but zero on THIS pull (QSRSoft reassigned the invoice's posted_date to another
      // day, a normal correction on their end) never had its old row cleared -- upsert only touches
      // dates present in the CURRENT batch, so the stale day-total lived on forever and the monthly
      // rollup double-counted the reassigned invoice (proven live: Aug 11 + Aug 18 both stale-
      // duplicated a day-total that had moved to Aug 12 / Aug 19 respectively). Clear the store's
      // whole pulled window first, THEN insert the fresh set below -- only after a successful fetch
      // for THIS store, so a per-store fetch failure never wipes that store's still-good prior data.
      const loc = String(nsn).padStart(7, '0');
      const { error: clearErr } = await withRetry(
        () => supabase.from('qsr_ebos_daily').delete().eq('loc', loc).gte('date', startDate).lte('date', endDate),
        { label: 'qsr_ebos_daily stale-day clear' },
      );
      if (clearErr) console.error(`[ebos] NSN ${nsn} stale-day clear error: ${clearErr.message}`);
      buffer.push(...rows);
      console.log(`[ebos] NSN ${nsn}: ${items.length} line items → ${rows.length} day-rows`);
      if (buffer.length >= 500) await flush();
    } catch (e) {
      if (e.message.startsWith('AUTH_FAILED')) {
        authFailed = true;
        console.error(`[ebos] auth failed — token expired or invalid`);
      } else {
        console.error(`[ebos] NSN ${nsn} error: ${e.message}`);
        tracker.fail(nsn, e.message);
      }
    }
  }
  await flush();
  console.log(`[ebos-pull] done — ${totalLineItems} line items, ${totalDayRows} store-days, ${totalSaved} rows saved`);
  if (authFailed) process.exit(1);

  // #263: no store-subset override exists for this script today -- a re-run reruns
  // every store for the same date range until one is added.
  const code = tracker.finalize({
    requestedUnits: STORE_NSNS, totalSaved,
    formatRerun: () => `same date range (${startDate}…${endDate}) — no store-subset flag exists yet, reruns all stores`,
  });
  if (code) process.exit(code);
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const envToken = (process.env.QSRSOFT_EBOS_TOKEN || '').trim();
  const { startDate, endDate } = await getDateRange();
  console.log(`[ebos-pull] stores: ${STORE_NSNS.length}`);

  // ── Path A: pre-captured QSRSOFT_EBOS_TOKEN ──
  if (envToken) {
    return runWithToken(envToken, startDate, endDate);
  }

  // ── Path B: SSO token exchange, cognito token minted fresh via getFreshToken() ──
  try {
    const cognitoToken = await getFreshToken();
    const ssoToken = await getEbosTokenViaSso(cognitoToken);
    if (ssoToken) {
      console.log('[auth] ✓ eBOS token obtained via SSO exchange');
      return runWithToken(ssoToken, startDate, endDate);
    }
    console.log('[auth] SSO exchange did not return a usable token — falling back to Playwright');
  } catch (e) {
    console.log(`[auth] getFreshToken() failed (${e.message}) — falling back to Playwright`);
  }

  // ── Path C: Playwright — login + fetch all data from within the live session ──
  const pwResult = await pullViaPlaywright(startDate, endDate);
  if (!pwResult) {
    console.error('[ebos-pull] no auth — set QSRSOFT_EBOS_TOKEN or QSRSOFT_USERNAME+PASSWORD');
    process.exit(1);
  }
  const { rows, log: pwLog } = pwResult;

  // #263: pullViaPlaywright's per-store loop runs inside the browser (page.evaluate) and
  // can't reach this process's tracker directly -- it logs "NSN X error:"/"NSN X HTTP NNN"
  // into the `log` array instead (already printed above as "[ebos] ..."), which this
  // parses after the fact to apply the same zero-rows/threshold check as Path A/B.
  const failedNsns = [];
  for (const msg of pwLog) {
    const m = /^NSN (\d+) (?:error|HTTP)/.exec(msg);
    if (m) failedNsns.push(m[1]);
  }

  // Same stale-day clear as runWithToken (see its own comment for the Mossy Head finding this
  // fixes) -- scoped to stores that actually fetched successfully this run (excluding failedNsns),
  // same safety rule: never clear a store's data on the strength of a fetch we know failed.
  const clearedLocs = STORE_NSNS.filter(n => !failedNsns.includes(String(n))).map(n => String(n).padStart(7, '0'));
  if (clearedLocs.length) {
    const { error: clearErr } = await withRetry(
      () => supabase.from('qsr_ebos_daily').delete().in('loc', clearedLocs).gte('date', startDate).lte('date', endDate),
      { label: 'qsr_ebos_daily stale-day clear' },
    );
    if (clearErr) console.error(`[ebos] stale-day clear error: ${clearErr.message}`);
  }

  let totalSaved = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    const { error } = await withRetry(() => supabase.from('qsr_ebos_daily').upsert(batch, { onConflict: 'loc,date' }), { label: 'qsr_ebos_daily upsert' });
    if (error) console.error('[supabase] upsert error:', error.message);
    else totalSaved += batch.length;
  }
  console.log(`[ebos-pull] done — ${rows.length} store-days aggregated, ${totalSaved} rows saved to qsr_ebos_daily`);

  const tracker = makeOutcomeTracker('ebos-pull');
  for (const nsn of failedNsns) tracker.fail(nsn, 'see [ebos] log above');
  const code = tracker.finalize({
    requestedUnits: STORE_NSNS, totalSaved,
    formatRerun: () => `same date range (${startDate}…${endDate}) — no store-subset flag exists yet, reruns all stores`,
  });
  if (code) process.exit(code);
}

main().catch(e => { console.error(e); process.exit(1); });
