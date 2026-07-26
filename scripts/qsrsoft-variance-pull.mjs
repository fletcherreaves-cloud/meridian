#!/usr/bin/env node
// scripts/qsrsoft-variance-pull.mjs — QSRSoft EOM diagnosis data sync
//
// Pulls the food-cost diagnosis inputs from prod.ebos.qsrsoft.com for all 27
// stores and upserts them to Supabase, so the EOM Dashboard + diagnosis engine
// (src/engine/eom-diagnosis.js) are cloud-fresh on every device:
//   • Variance Stat (monthly)  → qsr_variance_stat   (top-5 by $, ±$50, yield band)
//   • Yields                    → merged onto variance rows (yield-band cause)
//   • Waste (raw_waste_promo)   → qsr_waste           (manager/pencil-whip patterns)
//   • Transfers                 → qsr_transfers       (In/Out, unposted)
//
// Parsed with the SAME src/engine/eom-parsers.js mappers the client uses (zero
// drift — the standing rule for cloud streams).
//
// Endpoints (all confirmed 2026-07-26, auth = eBOS x-auth-token):
//   GET /api/inv/{nsn}/stat_variance/monthly/{YYYY-MM-01}
//   GET /api/inv/{nsn}/stat_variance/yields?start_date=&end_date=
//   GET /api/inv/{nsn}/raw_waste_promo?start_date=&end_date=
//   GET /api/inv/{nsn}/transfers?start_date=&end_date=
//
// Required env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Auth — same eBOS ladder as scripts/qsrsoft-onhand-pull.mjs, tried in order:
//   QSRSOFT_EBOS_TOKEN → QSRSOFT_TOKEN (SSO exchange) → QSRSOFT_USERNAME/PASSWORD (Playwright)
// Optional:
//   VARIANCE_PERIOD=YYYY-MM  — override the period (default: current month UTC)
//   VARIANCE_STORES=3708,... — subset of NSNs (default: all 27)
//   QSRSOFT_DEBUG=1
//
// Token refresh: v3.myqsrsoft.com → Inventory → Variance Stat → DevTools → Network →
//   any prod.ebos.qsrsoft.com/api/inv/ request → copy X-Auth-Token → update QSRSOFT_EBOS_TOKEN.

import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import {
  mapVarianceRows, mapYieldGroups, yieldBandFor,
  mapWasteEvents, mapTransferLines,
} from '../src/engine/eom-parsers.js';

const EBOS_BASE   = 'https://prod.ebos.qsrsoft.com';
const EBOS_ORG_ID = 'a546d4ef-684a-4f25-8bc0-6580af068875';
const DEBUG       = process.env.QSRSOFT_DEBUG === '1';

const STORE_NSNS = (process.env.VARIANCE_STORES
  ? process.env.VARIANCE_STORES.split(',').map(s => s.trim())
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
  if (process.env.VARIANCE_PERIOD) return process.env.VARIANCE_PERIOD;
  const d = new Date();
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}
// period 'YYYY-MM' → { first: 'YYYY-MM-01', last: 'YYYY-MM-DD' (month end, capped at today) }
function periodRange(period) {
  const [y, m] = period.split('-').map(Number);
  const first = `${period}-01`;
  const monthEnd = new Date(Date.UTC(y, m, 0));
  const today = new Date();
  const end = (today.getUTCFullYear() === y && today.getUTCMonth() + 1 === m && today < monthEnd) ? today : monthEnd;
  const last = `${end.getUTCFullYear()}-${pad2(end.getUTCMonth() + 1)}-${pad2(end.getUTCDate())}`;
  return { first, last };
}

// ── eBOS auth ladder (mirrors qsrsoft-onhand-pull.mjs) ────────────────────────
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
  return data.token || data.accessToken || data.access_token || data.ebosByOrg
      || data.ebosToken || data.x_auth_token || (typeof data === 'string' ? data : null) || null;
}
async function getEbosTokenViaPlaywright() {
  const u = process.env.QSRSOFT_USERNAME, p = process.env.QSRSOFT_PASSWORD;
  if (!u || !p) { console.error('[auth] no QSRSOFT_USERNAME/PASSWORD for Playwright fallback'); return null; }
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36' });
  const page = await context.newPage();
  let ebosToken = null;
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
    if (!ebosToken) {
      await page.goto('https://v3.myqsrsoft.com/inventory/variance', { waitUntil: 'networkidle', timeout: 25000 }).catch(() => {});
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
  if (!t) { console.error('[variance-pull] ✗ no eBOS token'); process.exit(1); }
  return t;
}

// ── Fetch one endpoint for one store ──────────────────────────────────────────
async function ebosGet(token, nsn, path) {
  const url = `${EBOS_BASE}/api/inv/${nsn}/${path}`;
  if (DEBUG) console.log('[GET]', url);
  const resp = await fetch(url, {
    headers: {
      'X-Auth-Token': token, 'X-Current-Nsn': String(nsn), 'Accept': 'application/json',
      'Origin': 'https://v3.myqsrsoft.com', 'Referer': 'https://v3.myqsrsoft.com/',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
    },
  });
  if (resp.status === 401 || resp.status === 403) throw new Error(`AUTH_FAILED:${resp.status}`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${(await resp.text().catch(() => '')).slice(0, 160)}`);
  const data = await resp.json();
  return Array.isArray(data) ? data : [];
}

// "07/20/2026" or "2026-07-20" → "2026-07-20"
function toISO(v) {
  if (!v) return null;
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[3]}-${pad2(+m[1])}-${pad2(+m[2])}` : null;
}

async function upsert(table, rows, onConflict) {
  if (!rows.length) return 0;
  const CHUNK = 500; let saved = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase.from(table).upsert(rows.slice(i, i + CHUNK), { onConflict });
    if (error) console.warn(`[${table}] upsert error:`, error.message);
    else saved += Math.min(CHUNK, rows.length - i);
  }
  return saved;
}

async function main() {
  const period = currentPeriod();
  const { first, last } = periodRange(period);
  const range = `start_date=${first}&end_date=${last}`;
  const token = await resolveEbosToken();
  console.log(`[variance-pull] period ${period} (${first}…${last}) × ${STORE_NSNS.length} stores`);

  let vSaved = 0, wSaved = 0, tSaved = 0, storesOk = 0, authFailed = false;
  for (const nsn of STORE_NSNS) {
    if (authFailed) break;
    const loc = String(nsn).padStart(7, '0');
    try {
      // Variance + yields (merge yield band onto each variance row for the cause overlay)
      const [rawVar, rawYields] = await Promise.all([
        ebosGet(token, nsn, `stat_variance/monthly/${first}`),
        ebosGet(token, nsn, `stat_variance/yields?${range}`).catch(() => []),
      ]);
      const yieldLookup = mapYieldGroups(rawYields);
      const varRows = mapVarianceRows(rawVar).map(v => {
        const band = yieldBandFor(v.wrin, yieldLookup);
        return { ...v, loc, period, expUsage: v.expectedUsage, actUsage: v.actualUsage, yieldBand: band };
      });
      vSaved += await upsert('qsr_variance_stat', varRows.map(v => ({
        loc, period, wrin: v.wrin, cls: v.cls, descr: v.descr,
        raw_waste: v.rawWaste, comp_waste: v.compWaste, exp_usage: v.expectedUsage,
        act_usage: v.actualUsage, variance: v.unitVar, dol_diff: v.dolDiff,
        yield_val: v.yield, pct_sales: v.pctOfSales, raw_item_id: v.rawItemId,
      })).filter(r => r.wrin), 'loc,period,wrin');

      // Waste
      const rawWaste = await ebosGet(token, nsn, `raw_waste_promo?${range}`).catch(() => []);
      const wasteRows = mapWasteEvents(rawWaste).map((w, i) => ({
        loc, period, event_id: rawWaste[i]?.id ?? null,
        busn_dt: toISO(w.dt), busn_tm: w.tm, wtype: w.type, amount: w.amount,
        manager: w.manager, wsource: w.source, edited: w.edited, reason: w.reason,
      })).filter(r => r.event_id != null);
      wSaved += await upsert('qsr_waste', wasteRows, 'loc,event_id');

      // Transfers
      const rawXfer = await ebosGet(token, nsn, `transfers?${range}`).catch(() => []);
      const xferRows = mapTransferLines(rawXfer).map(t => ({
        loc, period, transfer_id: t.id, wrin: t.wrin, dir: t.dir,
        counterparty: t.counterpartyNsn, busn_dt: toISO(t.dt), status: t.status,
        line_amt: t.lineAmt, transfer_amt: t.transferTotal, manager: t.manager,
        descr: t.descr, cls: t.cls, units: t.units,
      })).filter(r => r.transfer_id != null && r.wrin);
      tSaved += await upsert('qsr_transfers', xferRows, 'loc,transfer_id,wrin');

      storesOk++;
      if (DEBUG) console.log(`  ${nsn}: ${varRows.length} var · ${wasteRows.length} waste · ${xferRows.length} xfer`);
    } catch (e) {
      if (e.message.startsWith('AUTH_FAILED')) { authFailed = true; console.error('[variance-pull] auth failed — refresh QSRSOFT_EBOS_TOKEN'); break; }
      console.warn(`  ${nsn}: ${e.message}`);
    }
  }

  console.log(`[variance-pull] ✓ ${storesOk}/${STORE_NSNS.length} stores · ${vSaved} variance · ${wSaved} waste · ${tSaved} transfer rows for ${period}`);
  if (authFailed) process.exit(1);
}

main().catch(err => { console.error('[variance-pull] fatal:', err); process.exit(1); });
