#!/usr/bin/env node
// scripts/qsrsoft-onhand-pull.mjs — QSRSoft On-Hand Inventory sync (EOM count-progress)
//
// ⚠️  SKELETON — awaiting endpoint capture (Notes 29, 2026-07-26).
//     Two things must be filled in from a DevTools capture before this runs:
//       (1) TODO(endpoint): the On-Hand request URL + query params (fetchOnHand)
//       (2) TODO(fields):   the exact JSON field names in the response (mapOnHandRow)
//     To capture: v3.myqsrsoft.com → open On-Hand Inventory for one store →
//       DevTools → Network → click the api.reports.myqsrsoft.com request →
//       copy the full Request URL (incl. query string) and the Response JSON shape,
//       plus the X-Auth-Token header. On-Hand is a PER-LOCATION call.
//
// What On-Hand gives us: the count-progress signal. Each item carries a
// "last counted" / "last submitted" date; a store is ~done when ~90-95% of items
// have been counted inside the current count window (last 3 days of the month).
//
// Cadence: hourly on the last 3 days of the month (gated in-script, since GitHub
// cron can't express "last N days of month"). Force any time with ONHAND_FORCE=1.
//
// Required env:
//   VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Auth (one of):
//   QSRSOFT_TOKEN  — pre-captured X-Auth-Token (fastest)
//   QSRSOFT_USERNAME + QSRSOFT_PASSWORD — Playwright login fallback
// Optional:
//   ONHAND_FORCE=1        — run even outside the last-3-days window
//   ONHAND_PERIOD=YYYY-MM — override the period being counted (default: current month)
//   ONHAND_ENDPOINT=...   — override the On-Hand base URL (until hard-coded below)
//   QSRSOFT_DEBUG=1

import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

const API_BASE   = 'https://api.reports.myqsrsoft.com';
const ORG_ID     = 'a546d4ef-684a-4f25-8bc0-6580af068875';
const ENTERPRISE = 'McDonalds';
const DEBUG      = process.env.QSRSOFT_DEBUG === '1';
const FORCE      = process.env.ONHAND_FORCE === '1';

// All 27 store NSNs (confirmed 2026-07-06).
const STORE_NSNS = [
  3708, 5183, 5985, 6178, 6838, 6972,
  10034, 10422, 10915, 11657, 13113, 18213,
  20475, 24471, 29760, 31357, 32525, 33109,
  33222, 33704, 34222, 35064, 35242, 37566,
  38609, 43380, 43701,
];

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// ── Period + count-window gate ────────────────────────────────────────────────
const pad2 = n => String(n).padStart(2, '0');

function currentPeriod() {
  if (process.env.ONHAND_PERIOD) return process.env.ONHAND_PERIOD;
  const d = new Date();
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}

// True only in the last 3 calendar days of the month (unless forced).
function inCountWindow() {
  if (FORCE) return true;
  const now = new Date();
  const lastDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  return now.getUTCDate() >= lastDay - 2;
}

// ── Playwright login (mirrors scripts/qsrsoft-pull.mjs; per-script copy is the convention) ──
async function getAuthTokenPlaywright() {
  const u = process.env.QSRSOFT_USERNAME, p = process.env.QSRSOFT_PASSWORD;
  if (!u || !p) { console.error('[auth] no QSRSOFT_USERNAME/PASSWORD for Playwright fallback'); return null; }
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36' });
  const page = await context.newPage();
  let authToken = null;
  page.on('request', req => { const t = req.headers()['x-auth-token']; if (t && t.length > 20 && !authToken) authToken = t; });
  page.on('response', resp => { try { const t = resp.headers()['x-auth-token']; if (t && !authToken) authToken = t; } catch {} });
  try {
    await page.goto('https://v3.myqsrsoft.com', { waitUntil: 'networkidle', timeout: 45000 });
    const userSel = ['input[name="username"]','input[name="email"]','input[type="email"]','#username','#email','input[autocomplete="username"]'].join(', ');
    const passSel = 'input[type="password"], input[name="password"], #password';
    const subSel  = 'button[type="submit"], input[type="submit"], .btn-primary, button:has-text("Login"), button:has-text("Sign in")';
    await page.waitForSelector(userSel, { timeout: 20000 });
    await page.fill(userSel, u); await page.fill(passSel, p); await page.click(subSel);
    await page.waitForLoadState('networkidle', { timeout: 30000 });
    if (!authToken) {
      authToken = await page.evaluate(() => {
        for (const s of [localStorage, sessionStorage]) for (let i = 0; i < s.length; i++) {
          const v = s.getItem(s.key(i));
          if (v && /^[A-Za-z0-9\-._~+/]+=*$/.test(v) && v.length > 40 && v.length < 1000) return v;
        }
        return null;
      });
    }
    if (!authToken) { await page.goto('https://v3.myqsrsoft.com/reports', { waitUntil: 'networkidle', timeout: 20000 }).catch(()=>{}); await new Promise(r => setTimeout(r, 3000)); }
  } catch (e) { console.error('[auth] Playwright error:', e.message); } finally { await browser.close(); }
  if (!authToken) console.error('[auth] ✗ could not capture token — refresh QSRSOFT_TOKEN manually (DevTools → Network → X-Auth-Token)');
  return authToken;
}

async function resolveToken() {
  let token = process.env.QSRSOFT_TOKEN || null;
  if (!token) token = await getAuthTokenPlaywright();
  if (!token) { console.error('[onhand-pull] ✗ no token'); process.exit(1); }
  return token;
}

// ── Fetch one store's On-Hand report ──────────────────────────────────────────
// TODO(endpoint): replace the URL + params below with the captured request.
// The FOB pull (scripts/qsrsoft-pull.mjs:230) is the reference for the header set.
async function fetchOnHand(token, nsn, period) {
  const base = process.env.ONHAND_ENDPOINT
    || `${API_BASE}/reporting/v2/inventory/on-hand`; // TODO(endpoint): confirm exact path
  const params = new URLSearchParams({
    nsn:            String(nsn),
    orgId:          ORG_ID,
    enterpriseName: ENTERPRISE,
    period,                                            // TODO(endpoint): confirm period param name/format
  });
  const url = `${base}?${params}`;
  if (DEBUG) console.log('[onhand] GET', url.slice(0, 120) + '…');
  const resp = await fetch(url, {
    headers: {
      'X-Auth-Token': token, 'Accept': 'application/json',
      'Origin': 'https://v3.myqsrsoft.com', 'Referer': 'https://v3.myqsrsoft.com/',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
    },
  });
  if (resp.status === 401 || resp.status === 403) throw new Error(`AUTH_FAILED:${resp.status}`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${(await resp.text().catch(() => '')).slice(0, 200)}`);
  const data = await resp.json();
  return data.result || data.rows || data || []; // TODO(endpoint): confirm the array wrapper key
}

// Map a raw On-Hand item to the qsr_onhand table (columns are known; source names TODO).
function mapOnHandRow(item, nsn, period) {
  const loc = String(nsn).padStart(7, '0');
  const asISO = v => {
    if (!v) return null;
    const m = String(v).match(/(\d{2})\/(\d{2})\/(\d{4})/); // MM/DD/YYYY (as seen in the Excel export)
    if (m) return `${m[3]}-${m[1]}-${m[2]}`;
    const d = new Date(v); return isNaN(d) ? null : d.toISOString().slice(0, 10);
  };
  // TODO(fields): confirm the JSON field names against the captured response.
  // Target columns mirror parseOnHand() in src/views/fob-eom.js.
  return {
    loc, period,
    wrin:           String(item.wrin ?? item.itemId ?? '').trim(),
    descr:          item.description ?? item.desc ?? null,
    cls:            item.class ?? item.cls ?? null,
    cases:          item.cases ?? null,
    packs:          item.packs ?? null,
    loose:          item.loose ?? null,
    total_units:    item.totalUnits ?? item.total ?? null,
    unit_price:     item.unitPrice ?? item.price ?? null,
    on_hand_amt:    item.onHandAmt ?? item.amount ?? null,
    last_counted:   asISO(item.lastCounted ?? item.lastCountedDate),
    last_submitted: asISO(item.lastSubmitted ?? item.lastSubmittedDate),
    updated_at:     new Date().toISOString(),
  };
}

async function upsertRows(rows) {
  if (!rows.length) return 0;
  const CHUNK = 500; let saved = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase.from('qsr_onhand').upsert(rows.slice(i, i + CHUNK), { onConflict: 'loc,period,wrin' });
    if (error) console.warn('[supabase] upsert error:', error.message);
    else saved += Math.min(CHUNK, rows.length - i);
  }
  return saved;
}

async function main() {
  if (!inCountWindow()) {
    console.log('[onhand-pull] outside the last-3-days count window — skipping (ONHAND_FORCE=1 to override)');
    return;
  }
  const period = currentPeriod();
  let token = await resolveToken();
  console.log(`[onhand-pull] period ${period} × ${STORE_NSNS.length} stores`);

  let totalSaved = 0, storesWithData = 0;
  for (const nsn of STORE_NSNS) {
    try {
      const items = await fetchOnHand(token, nsn, period);
      if (!items.length) { if (DEBUG) console.log(`  ${nsn}: no data`); continue; }
      const rows = items.map(it => mapOnHandRow(it, nsn, period)).filter(r => /\d{4,}/.test(r.wrin));
      totalSaved += await upsertRows(rows);
      storesWithData++;
      if (DEBUG) console.log(`  ${nsn}: ${rows.length} items`);
    } catch (e) {
      if (e.message.startsWith('AUTH_FAILED')) {
        console.warn('[onhand-pull] token expired mid-run — re-auth…');
        token = await getAuthTokenPlaywright();
        if (!token) { console.error('[onhand-pull] ✗ re-auth failed'); process.exit(1); }
        continue; // retry this store next loop iteration would need re-queue; simplest: skip, next run catches it
      }
      console.warn(`  ${nsn}: ${e.message}`);
    }
  }
  console.log(`[onhand-pull] ✓ ${totalSaved} item-rows across ${storesWithData} stores for ${period}`);
}

main().catch(err => { console.error('[onhand-pull] fatal:', err); process.exit(1); });
