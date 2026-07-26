#!/usr/bin/env node
// scripts/qsrsoft-onhand-pull.mjs — QSRSoft On-Hand Inventory sync (EOM count-progress)
//
// Pulls the On-Hand raw-items report from prod.ebos.qsrsoft.com for all 27 stores.
// On-Hand is the count-progress signal: each item's last_counted / last_submitted
// date tells us if/when it was counted. During the last 3 days of the month we pull
// hourly so we can see when each store finishes its EOM count.
//
// Endpoint (confirmed 2026-07-26):
//   GET /api/inv/{nsn}/on_hand/rawitems?date=YYYY-MM-DD&type={F|C|P|N}&recipe=all
//       &non_zero_on_hand=false&duplicate=false
//   → { on_hand_records: [...], total_on_hand_amt }
//   `type` is the inventory-class filter (F=Food, C=Condiment, P=Paper, N=Non-Product);
//   pulled per class and tagged by the row's own invty_class.
//
// Required env:
//   VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Auth — same eBOS ladder as scripts/qsrsoft-ebos-pull.mjs (prod.ebos host), tried in order:
//   QSRSOFT_EBOS_TOKEN  — pre-captured eBOS X-Auth-Token (fastest)
//   QSRSOFT_TOKEN       — reporting token → exchanged for an eBOS token via SSO (no browser)
//   QSRSOFT_USERNAME + QSRSOFT_PASSWORD — Playwright fallback (captures eBOS token from the session)
// Optional:
//   ONHAND_FORCE=1        — run even outside the last-3-days window
//   ONHAND_PERIOD=YYYY-MM — override the period label (default: current month)
//   ONHAND_DATE=YYYY-MM-DD— override the business date queried (default: today UTC)
//   ONHAND_TYPES=F,C,P,N  — inventory class types to pull (default: F,C,P,N)
//   QSRSOFT_DEBUG=1
//
// Token refresh: v3.myqsrsoft.com → Inventory → On Hand Inventory → DevTools → Network →
//   any prod.ebos.qsrsoft.com/api/inv/ request → copy X-Auth-Token → update QSRSOFT_EBOS_TOKEN secret.

import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

const EBOS_BASE   = 'https://prod.ebos.qsrsoft.com';
const EBOS_ORG_ID = 'a546d4ef-684a-4f25-8bc0-6580af068875';
const DEBUG       = process.env.QSRSOFT_DEBUG === '1';
const FORCE       = process.env.ONHAND_FORCE === '1';
const TYPES       = (process.env.ONHAND_TYPES || 'F,C,P,N').split(',').map(s => s.trim()).filter(Boolean);

const STORE_NSNS = [
  3708, 5183, 5985, 6178, 6838, 6972,
  10034, 10422, 10915, 11657, 13113, 18213,
  20475, 24471, 29760, 31357, 32525, 33109,
  33222, 33704, 34222, 35064, 35242, 37566,
  38609, 43380, 43701,
];

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// ── Date + count-window helpers ───────────────────────────────────────────────
const pad2 = n => String(n).padStart(2, '0');
const fmtDate = d => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;

function businessDate() {
  return process.env.ONHAND_DATE || fmtDate(new Date());
}
function periodFor(dateStr) {
  return process.env.ONHAND_PERIOD || dateStr.slice(0, 7); // 'YYYY-MM'
}

// True only in the last 3 calendar days of the month (unless forced).
function inCountWindow() {
  if (FORCE) return true;
  const now = new Date();
  const lastDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  return now.getUTCDate() >= lastDay - 2;
}

// ── eBOS auth: SSO token exchange (mirrors qsrsoft-ebos-pull.mjs) ──────────────
async function getEbosTokenViaSso(qsrsoftToken) {
  const url = `https://api.sso.myqsrsoft.com/token/ebosByOrg?orgId=${EBOS_ORG_ID}`;
  const resp = await fetch(url, {
    headers: {
      'X-Auth-Token': qsrsoftToken, 'Accept': 'application/json',
      'Origin': 'https://v3.myqsrsoft.com', 'Referer': 'https://v3.myqsrsoft.com/',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
    },
  });
  if (!resp.ok) { console.log(`[auth] SSO exchange HTTP ${resp.status}`); return null; }
  const data = await resp.json();
  const token = data.token || data.accessToken || data.access_token || data.ebosByOrg
             || data.ebosToken || data.x_auth_token || (typeof data === 'string' ? data : null);
  if (!token) console.log('[auth] SSO response keys:', Object.keys(data).join(', '));
  return token || null;
}

// Playwright fallback — capture an eBOS token from the live inventory session.
async function getEbosTokenViaPlaywright() {
  const u = process.env.QSRSOFT_USERNAME, p = process.env.QSRSOFT_PASSWORD;
  if (!u || !p) { console.error('[auth] no QSRSOFT_USERNAME/PASSWORD for Playwright fallback'); return null; }
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36' });
  const page = await context.newPage();
  let ebosToken = null;
  // capture the token off any prod.ebos.qsrsoft.com request the app fires
  page.on('request', req => {
    if (ebosToken) return;
    if (req.url().includes('prod.ebos.qsrsoft.com')) {
      const t = req.headers()['x-auth-token'];
      if (t && t.length > 20) ebosToken = t;
    }
  });
  try {
    await page.goto('https://v3.myqsrsoft.com', { waitUntil: 'networkidle', timeout: 45000 });
    const userSel = ['input[name="username"]','input[name="email"]','input[type="email"]','#username','#email'].join(', ');
    const passSel = 'input[type="password"], input[name="password"], #password';
    const subSel  = 'button[type="submit"], input[type="submit"], .btn-primary, button:has-text("Login"), button:has-text("Sign in")';
    await page.waitForSelector(userSel, { timeout: 20000 });
    await page.fill(userSel, u); await page.fill(passSel, p); await page.click(subSel);
    await page.waitForLoadState('networkidle', { timeout: 30000 });
    // navigate to the On-Hand inventory page so an eBOS request fires
    if (!ebosToken) {
      await page.goto('https://v3.myqsrsoft.com/inventory/on-hand', { waitUntil: 'networkidle', timeout: 25000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 4000));
    }
  } catch (e) { console.error('[auth] Playwright error:', e.message); } finally { await browser.close(); }
  if (!ebosToken) console.error('[auth] ✗ could not capture eBOS token — refresh QSRSOFT_EBOS_TOKEN manually');
  return ebosToken;
}

async function resolveEbosToken() {
  const envToken = (process.env.QSRSOFT_EBOS_TOKEN || '').trim();
  if (envToken) { console.log('[auth] using QSRSOFT_EBOS_TOKEN'); return envToken; }
  const reporting = (process.env.QSRSOFT_TOKEN || '').trim();
  if (reporting) {
    const t = await getEbosTokenViaSso(reporting);
    if (t) { console.log('[auth] ✓ eBOS token via SSO exchange'); return t; }
  }
  const t = await getEbosTokenViaPlaywright();
  if (!t) { console.error('[onhand-pull] ✗ no eBOS token'); process.exit(1); }
  return t;
}

// ── Fetch one store's On-Hand items for one class type ────────────────────────
async function fetchOnHand(token, nsn, dateStr, type) {
  const params = new URLSearchParams({
    date: dateStr, type, recipe: 'all', non_zero_on_hand: 'false', duplicate: 'false',
  });
  const url = `${EBOS_BASE}/api/inv/${nsn}/on_hand/rawitems?${params}`;
  if (DEBUG) console.log('[onhand] GET', url);
  const resp = await fetch(url, {
    headers: {
      'X-Auth-Token': token, 'X-Current-Nsn': String(nsn), 'Accept': 'application/json',
      'Accept-Encoding': 'gzip, deflate, br, zstd',
      'Origin': 'https://v3.myqsrsoft.com', 'Referer': 'https://v3.myqsrsoft.com/',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
    },
  });
  if (resp.status === 401 || resp.status === 403) throw new Error(`AUTH_FAILED:${resp.status}`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${(await resp.text().catch(() => '')).slice(0, 160)}`);
  const data = await resp.json();
  return Array.isArray(data?.on_hand_records) ? data.on_hand_records : [];
}

const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
// "07/21/2026 08:59" → "2026-07-21"
function toISODate(v) {
  if (!v) return null;
  const m = String(v).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[3]}-${pad2(+m[1])}-${pad2(+m[2])}` : null;
}

// Map a raw On-Hand record → qsr_onhand row (fields confirmed 2026-07-26).
function mapOnHandRow(item, nsn, period) {
  return {
    loc:            String(nsn).padStart(7, '0'),
    period,
    wrin:           String(item.full_wrin || '').trim(),
    descr:          item.long_desc ?? null,
    cls:            item.invty_class ?? null,          // "Food" / "Condiment" / "Paper" / "Non-Product"
    cases:          num(item.case_count),
    packs:          num(item.inner_pack_count),
    loose:          num(item.loose_count),
    total_units:    num(item.total_units),
    unit_price:     num(item.unit_price),
    on_hand_amt:    Number.isFinite(item.nonRoundedOnHandAmt) ? item.nonRoundedOnHandAmt : num(item.on_hand_amt),
    last_counted:   toISODate(item.last_counted),
    last_submitted: toISODate(item.last_submitted),
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
  const dateStr = businessDate();
  const period  = periodFor(dateStr);
  let token = await resolveEbosToken();
  console.log(`[onhand-pull] date ${dateStr} · period ${period} · types [${TYPES.join(',')}] × ${STORE_NSNS.length} stores`);

  let totalSaved = 0, storesWithData = 0, authFailed = false;
  for (const nsn of STORE_NSNS) {
    if (authFailed) break;
    const rows = [];
    for (const type of TYPES) {
      try {
        const items = await fetchOnHand(token, nsn, dateStr, type);
        rows.push(...items.map(it => mapOnHandRow(it, nsn, period)).filter(r => r.wrin));
      } catch (e) {
        if (e.message.startsWith('AUTH_FAILED')) { authFailed = true; console.error('[onhand-pull] auth failed — refresh QSRSOFT_EBOS_TOKEN'); break; }
        console.warn(`  ${nsn} type ${type}: ${e.message}`);
      }
    }
    // de-dup by wrin within the store (a wrin should map to one class)
    const byWrin = new Map();
    for (const r of rows) byWrin.set(r.wrin, r);
    const deduped = [...byWrin.values()];
    if (deduped.length) { totalSaved += await upsertRows(deduped); storesWithData++; }
    if (DEBUG) console.log(`  ${nsn}: ${deduped.length} items`);
  }
  console.log(`[onhand-pull] ✓ ${totalSaved} item-rows across ${storesWithData} stores for ${period}`);
  if (authFailed) process.exit(1);
}

main().catch(err => { console.error('[onhand-pull] fatal:', err); process.exit(1); });
