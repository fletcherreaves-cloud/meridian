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
// The exchange host api.sso.myqsrsoft.com authenticates with the COGNITO ID token
// (RS256, iss=cognito-idp.us-east-1…, token_use=id, ~1h TTL) in x-auth-token — NOT
// the api.reports.myqsrsoft.com reporting token. It returns the short-lived eBOS
// token used for prod.ebos.qsrsoft.com/api/inv calls.
async function getEbosTokenViaSso(cognitoToken) {
  const url = `https://api.sso.myqsrsoft.com/token/ebosByOrg?orgId=${EBOS_ORG_ID}`;
  const resp = await fetch(url, {
    headers: {
      'X-Auth-Token': cognitoToken, 'Accept': 'application/json',
      'Origin': 'https://v3.myqsrsoft.com', 'Referer': 'https://v3.myqsrsoft.com/',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
    },
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    console.log(`[auth] SSO exchange HTTP ${resp.status}${DEBUG && body ? ` — ${body.slice(0, 200)}` : ''}`);
    return null;
  }
  const data = await resp.json();
  const tok = data.token || data.accessToken || data.access_token || data.ebosByOrg
      || data.ebosToken || data.x_auth_token || data.xAuthToken || (typeof data === 'string' ? data : null) || null;
  if (!tok && DEBUG) console.log('[auth] SSO exchange OK but no token field — keys:', Object.keys(data || {}).join(', '));
  return tok;
}
async function getEbosTokenViaPlaywright() {
  const u = process.env.QSRSOFT_USERNAME, p = process.env.QSRSOFT_PASSWORD;
  if (!u || !p) { console.error('[auth] no QSRSOFT_USERNAME/PASSWORD for Playwright fallback'); return null; }
  const fs = await import('node:fs');
  try { fs.mkdirSync('screenshots', { recursive: true }); } catch {}
  const shot = async (page, name) => { try { await page.screenshot({ path: `screenshots/${name}.png`, fullPage: true }); console.log(`[pw] 📸 ${name}`); } catch (e) { console.log(`[pw] screenshot ${name} failed: ${e.message}`); } };
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36' });
  const page = await context.newPage();
  let ebosToken = null;
  const grab = (t, where) => { if (!ebosToken && t && t.length > 40) { ebosToken = t; console.log(`[pw] ✓ captured eBOS token from ${where}`); } };
  // Widen capture: any *.ebos.qsrsoft.com request header, and any response body carrying an HS256 token.
  page.on('request', req => { if (req.url().includes('ebos.qsrsoft.com')) grab(req.headers()['x-auth-token'], 'request header'); });
  page.on('response', async resp => {
    if (ebosToken) return;
    const url = resp.url();
    if (!/sso\.myqsrsoft|ebos\.qsrsoft|token/i.test(url)) return;
    try { const body = await resp.text(); const m = body.match(/eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9[\w.\-]+/); if (m) grab(m[0], `response ${url.slice(0, 80)}`); } catch {}
  });
  try {
    console.log('[pw] goto v3.myqsrsoft.com …');
    await page.goto('https://v3.myqsrsoft.com', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('networkidle', { timeout: 25000 }).catch(() => {});
    console.log(`[pw] landed at: ${page.url()} — title: "${await page.title().catch(() => '?')}"`);
    await shot(page, '01-landing');
    // Dump the actual form controls present so we can see the real login UI (Cognito Hosted UI, SAML, custom…)
    const controls = await page.evaluate(() => {
      const inputs = [...document.querySelectorAll('input')].map(i => ({ name: i.name, id: i.id, type: i.type, ph: i.placeholder }));
      const btns = [...document.querySelectorAll('button, input[type=submit], a[role=button]')].map(b => ({ t: (b.innerText || b.value || '').trim().slice(0, 30), id: b.id, type: b.type }));
      return { url: location.href, inputs, btns };
    }).catch(e => ({ err: e.message }));
    console.log('[pw] form controls:', JSON.stringify(controls).slice(0, 900));

    const userSel = 'input[name="username"], input#signInFormUsername, input[name="email"], input[type="email"], #username, #email';
    const passSel = 'input[name="password"], input#signInFormPassword, input[type="password"], #password';
    const subSel  = 'input[name="signInSubmitButton"], button[type="submit"], input[type="submit"], .btn-primary, button:has-text("Sign in"), button:has-text("Login"), a:has-text("Sign in")';
    const foundUser = await page.waitForSelector(userSel, { timeout: 20000 }).then(() => true).catch(() => false);
    if (!foundUser) { console.log('[pw] ✗ no username field found — login UI not recognized (see form-controls dump + screenshot)'); await shot(page, '02-no-login'); }
    else {
      console.log('[pw] filling credentials…');
      await page.fill(userSel, u); await page.fill(passSel, p).catch(() => {});
      await shot(page, '02-filled');
      await page.click(subSel).catch(async () => { await page.keyboard.press('Enter'); });
      await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
      console.log(`[pw] post-login at: ${page.url()} — title: "${await page.title().catch(() => '?')}"`);
      await shot(page, '03-post-login');
    }
    // Trigger an eBOS request by navigating to inventory pages
    for (const url of ['https://v3.myqsrsoft.com/inventory/variance', 'https://v3.myqsrsoft.com/inventory', 'https://v3.myqsrsoft.com/']) {
      if (ebosToken) break;
      await page.goto(url, { waitUntil: 'networkidle', timeout: 25000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 5000));
    }
    if (!ebosToken) await shot(page, '04-no-token');
  } catch (e) { console.error('[auth] Playwright error:', e.message); } finally { await browser.close(); }
  if (!ebosToken) console.error('[auth] ✗ Playwright could not capture an eBOS token (see screenshots artifact + form-controls dump above)');
  return ebosToken;
}
async function resolveEbosToken() {
  // Prefer minting a FRESH eBOS token via the SSO exchange — eBOS tokens are
  // very short-lived, so a stored QSRSOFT_EBOS_TOKEN is almost always stale by
  // the time CI runs. The static token is a last-ditch fallback, not the default.
  // The exchange needs the COGNITO ID token (QSRSOFT_COGNITO_TOKEN, ~1h TTL);
  // fall back to QSRSOFT_TOKEN only for backward-compat.
  const cognito = (process.env.QSRSOFT_COGNITO_TOKEN || process.env.QSRSOFT_TOKEN || '').trim();
  if (cognito) {
    const t = await getEbosTokenViaSso(cognito);
    if (t) { console.log('[auth] ✓ eBOS token via SSO exchange (fresh)'); return t; }
    console.log('[auth] SSO exchange did not return a token — trying fallbacks');
  }
  const envToken = (process.env.QSRSOFT_EBOS_TOKEN || '').trim();
  if (envToken) { console.log('[auth] falling back to static QSRSOFT_EBOS_TOKEN (may be stale)'); return envToken; }
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
