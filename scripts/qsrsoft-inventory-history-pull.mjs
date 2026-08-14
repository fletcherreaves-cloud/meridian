#!/usr/bin/env node
// scripts/qsrsoft-inventory-history-pull.mjs — QSRSoft eBOS physical-inventory count
// history (per-count-session attribution, incl. who counted) → planned qsr_inventory_counts.
//
// STATUS: Step 0 only (issue #257). This file currently implements ONLY the
// INVHIST_PROBE=1 retention probe — NOT the real pull. The issue is explicit: "Do not
// guess the back-pull shape." The owner cannot reach further back in the UI than some
// unknown limit, and whether that's cosmetic (deep server retention), a real retention
// cutoff (empty 200s past some date), or a server range cap (400/403 on a too-wide
// window) is unknown. Guessing wrong means either under-building (missing months that
// were actually available) or wasting calls hammering a range the server rejects. The
// full pull (table schema, upsert, workflow schedule, sync-failure-watch entry, manual
// upload fallback — CLAUDE.md's standing 5-part rule for a new pull) is sized AFTER this
// probe's verdict is read, in a follow-up commit.
//
// Endpoint (owner-captured, 2026-08-13):
//   GET https://prod.ebos.qsrsoft.com/api/inv/{nsn}/physinv/inventory_history
//       ?start_busn_dt=YYYY-MM-DD&end_busn_dt=YYYY-MM-DD&select_preset=All
//   Headers: x-auth-token, x-current-nsn: {nsn}, origin: https://v3.myqsrsoft.com
//   → { variance_levels, date_range, select_preset, inv_items: [...] }
// Same eBOS host + token as qsrsoft-onhand-pull.mjs / qsrsoft-variance-pull.mjs /
// qsrsoft-ebos-pull.mjs — QSRSOFT_EBOS_TOKEN and the existing auth ladder already work,
// no new auth research needed. Auth ladder mirrors qsrsoft-variance-pull.mjs (2026-07-26
// finding: the SSO exchange needs the COGNITO ID token, not the reporting token —
// onhand-pull.mjs's older comment calling SSO a "confirmed 403 dead end" predates that).
//
// Required env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (unused by the probe itself,
//   kept required so this script's env-var contract matches its siblings from day one).
// Optional:
//   INVHIST_PROBE=1        — run the retention probe instead of (future) real pull. The
//                             real pull path does not exist yet — omitting this currently
//                             does nothing but print a message and exit.
//   INVHIST_PROBE_STORE    — NSN to probe (default: 35064, the store from the issue's own
//                             13-day sample).
//   QSRSOFT_DEBUG=1
//
// Token refresh: v3.myqsrsoft.com → Inventory → Physical Inventory History → DevTools →
//   Network → any prod.ebos.qsrsoft.com/api/inv/ request → copy X-Auth-Token → update
//   QSRSOFT_EBOS_TOKEN secret.

import { chromium } from 'playwright';

const EBOS_BASE   = 'https://prod.ebos.qsrsoft.com';
const EBOS_ORG_ID = 'a546d4ef-684a-4f25-8bc0-6580af068875';
const DEBUG        = process.env.QSRSOFT_DEBUG === '1';
const PROBE_STORE  = (process.env.INVHIST_PROBE_STORE || '35064').trim();

const pad2 = n => String(n).padStart(2, '0');
const fmtDate = d => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
function daysAgo(n) { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return fmtDate(d); }
function today() { return fmtDate(new Date()); }

// ── eBOS auth ladder (mirrors qsrsoft-variance-pull.mjs, 2026-07-26 finding) ─────────────
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
    await shot(page, '01-landing');
    const userSel = 'input[name="username"], input[name="email"], input[type="email"], #username, #email';
    const passSel = 'input[name="password"], input[type="password"], #password';
    const foundUser = await page.waitForSelector(userSel, { timeout: 20000 }).then(() => true).catch(() => false);
    if (!foundUser) { console.log('[pw] ✗ no username field found — login UI not recognized'); await shot(page, '02-no-login'); }
    else {
      const userLoc = page.locator(userSel).first();
      const passLoc = page.locator(passSel).first();
      await userLoc.click({ clickCount: 3 }); await userLoc.pressSequentially(u, { delay: 12 });
      await passLoc.click({ clickCount: 3 }).catch(() => {}); await passLoc.pressSequentially(p, { delay: 12 }).catch(() => {});
      await shot(page, '02-filled');
      const signIn = page.getByRole('button', { name: 'Sign in', exact: true });
      const clicked = await signIn.click({ timeout: 8000 }).then(() => true).catch(() => false);
      if (!clicked) { console.log('[pw] exact Sign in button not clickable — pressing Enter in password'); await passLoc.press('Enter').catch(() => {}); }
      await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 2500));
      await shot(page, '03-post-login');
    }
    for (const url of ['https://v3.myqsrsoft.com/inventory/variance', 'https://v3.myqsrsoft.com/inventory', 'https://v3.myqsrsoft.com/']) {
      if (ebosToken) break;
      await page.goto(url, { waitUntil: 'networkidle', timeout: 25000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 5000));
    }
    if (!ebosToken) await shot(page, '04-no-token');
  } catch (e) { console.error('[auth] Playwright error:', e.message); } finally { await browser.close(); }
  if (!ebosToken) console.error('[auth] ✗ Playwright could not capture an eBOS token');
  return ebosToken;
}

async function resolveEbosToken() {
  const cognito = (process.env.QSRSOFT_COGNITO_TOKEN || process.env.QSRSOFT_TOKEN || '').trim();
  if (cognito) {
    const t = await getEbosTokenViaSso(cognito);
    if (t) { console.log('[auth] ✓ eBOS token via SSO exchange (fresh)'); return t; }
    console.log('[auth] SSO exchange did not return a token — trying fallbacks');
  }
  const envToken = (process.env.QSRSOFT_EBOS_TOKEN || '').trim();
  if (envToken) { console.log('[auth] falling back to static QSRSOFT_EBOS_TOKEN (may be stale)'); return envToken; }
  const t = await getEbosTokenViaPlaywright();
  if (!t) { console.error('[invhist-pull] ✗ no eBOS token'); process.exit(1); }
  return t;
}

// ── Probe: one (start, end) window against one store ──────────────────────────────────
// Returns { status, ok, count, sample, error }. Never throws — the whole point is to
// observe what the server does, including the failure shapes, not to bail on the first one.
async function probeWindow(token, nsn, startDate, endDate) {
  const params = new URLSearchParams({ start_busn_dt: startDate, end_busn_dt: endDate, select_preset: 'All' });
  const url = `${EBOS_BASE}/api/inv/${nsn}/physinv/inventory_history?${params}`;
  if (DEBUG) console.log('[probe] GET', url);
  try {
    const resp = await fetch(url, {
      headers: {
        'X-Auth-Token': token, 'X-Current-Nsn': String(nsn), 'Accept': 'application/json',
        'Origin': 'https://v3.myqsrsoft.com', 'Referer': 'https://v3.myqsrsoft.com/',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
      },
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      return { status: resp.status, ok: false, count: null, error: body.slice(0, 200) };
    }
    const data = await resp.json();
    const items = Array.isArray(data?.inv_items) ? data.inv_items : [];
    return { status: resp.status, ok: true, count: items.length, sample: items[0] || null };
  } catch (e) {
    return { status: null, ok: false, count: null, error: e.message };
  }
}

function logResult(label, start, end, r) {
  if (r.ok) {
    console.log(`[probe] ${label.padEnd(22)} ${start}…${end}  → HTTP ${r.status}  ${r.count} inv_items`);
  } else {
    console.log(`[probe] ${label.padEnd(22)} ${start}…${end}  → HTTP ${r.status ?? 'ERR'}  ${r.error || ''}`);
  }
}

// Narrows the earliest date with data inside [emptyStart, dataStart) by bisecting on whole
// months — matches the issue's own framing ("binary-search the earliest month"), not days;
// day-level precision doesn't matter for sizing a back-pull and would cost 4-5x the requests.
async function bisectEarliestMonth(token, nsn, knownEmptyStart, knownDataStart) {
  let lo = new Date(knownEmptyStart + 'T00:00:00Z');   // known empty (or erroring) at/after this
  let hi = new Date(knownDataStart + 'T00:00:00Z');    // known to have data at/after this
  let iterations = 0;
  const MAX_ITER = 8; // months-of-history range here is small enough that 8 halvings is plenty
  while (iterations < MAX_ITER) {
    const midMs = lo.getTime() + (hi.getTime() - lo.getTime()) / 2;
    const mid = new Date(midMs);
    mid.setUTCDate(1); // month granularity
    if (mid.getTime() <= lo.getTime() || mid.getTime() >= hi.getTime()) break; // converged
    const midStr = fmtDate(mid);
    const monthEnd = fmtDate(new Date(Date.UTC(mid.getUTCFullYear(), mid.getUTCMonth() + 1, 0)));
    const r = await probeWindow(token, nsn, midStr, monthEnd);
    logResult(`bisect (${iterations + 1}/${MAX_ITER})`, midStr, monthEnd, r);
    if (r.ok && r.count > 0) hi = mid; else lo = mid;
    iterations++;
  }
  return fmtDate(hi);
}

async function runProbe() {
  const token = await resolveEbosToken();
  console.log(`[probe] store ${PROBE_STORE} — widening-window retention probe, ${today()} UTC`);

  // Widen from a known-good recent window outward. Order matters: stop early (after two
  // consecutive non-productive windows) so a hard retention cutoff or server cap doesn't
  // cost N wasted requests once the boundary is already known.
  const WINDOWS = [
    { label: 'last 30 days',  start: daysAgo(30),  end: today() },
    { label: 'last 90 days',  start: daysAgo(90),  end: today() },
    { label: 'last 180 days', start: daysAgo(180), end: today() },
    { label: 'last 365 days', start: daysAgo(365), end: today() },
    { label: 'full 2025',     start: '2025-01-01', end: '2025-12-31' },
    { label: 'full 2024',     start: '2024-01-01', end: '2024-12-31' },
    { label: 'full 2023',     start: '2023-01-01', end: '2023-12-31' },
    { label: 'full 2022',     start: '2022-01-01', end: '2022-12-31' },
    { label: 'full 2021',     start: '2021-01-01', end: '2021-12-31' },
    { label: 'full 2020',     start: '2020-01-01', end: '2020-12-31' },
  ];

  const results = [];
  let consecutiveDead = 0;
  for (const w of WINDOWS) {
    const r = await probeWindow(token, PROBE_STORE, w.start, w.end);
    logResult(w.label, w.start, w.end, r);
    results.push({ ...w, ...r });
    const dead = !r.ok || r.count === 0;
    consecutiveDead = dead ? consecutiveDead + 1 : 0;
    if (consecutiveDead >= 2) { console.log('[probe] two consecutive empty/erroring windows — stopping the widen, verdict below'); break; }
  }

  // ── Verdict ────────────────────────────────────────────────────────────────────────
  const lastGoodWithData = [...results].reverse().find(r => r.ok && r.count > 0);
  const firstDeadAfterGood = results.find((r, i) => i > 0 && results[i - 1] === lastGoodWithData && (!r.ok || r.count === 0));
  const anyServerError = results.find(r => !r.ok && r.status && r.status !== 200);

  console.log('');
  console.log('═══ VERDICT ═══');
  if (!lastGoodWithData) {
    console.log(`No window returned data at all for store ${PROBE_STORE} — even the last-30-days window was empty/erroring. Re-check auth/store selection before trusting anything below.`);
  } else if (anyServerError && anyServerError.start <= lastGoodWithData.start) {
    console.log(`Server range cap: HTTP ${anyServerError.status} on "${anyServerError.label}" (${anyServerError.start}…${anyServerError.end}). Widest confirmed-working window: "${lastGoodWithData.label}" (${lastGoodWithData.start}…${lastGoodWithData.end}, ${lastGoodWithData.count} inv_items). Size the back-pull to chunks no wider than that window.`);
  } else if (firstDeadAfterGood && firstDeadAfterGood.ok && firstDeadAfterGood.count === 0) {
    console.log(`Retention cutoff (HTTP 200, empty inv_items) somewhere between "${lastGoodWithData.label}" (has data) and "${firstDeadAfterGood.label}" (empty). Bisecting to the earliest month with data…`);
    const earliestMonth = await bisectEarliestMonth(token, PROBE_STORE, firstDeadAfterGood.start, lastGoodWithData.start);
    console.log(`[probe] earliest month with data (approx): ${earliestMonth}`);
    console.log(`Back-pull should start no earlier than ${earliestMonth} — anything before that is confirmed empty, not worth requesting.`);
  } else {
    console.log(`Every probed window returned data, all the way back to "${WINDOWS[WINDOWS.length - 1].label}" (${WINDOWS[WINDOWS.length - 1].start}). The UI's apparent limit is cosmetic — real retention goes at least that deep. Re-run with an earlier INVHIST_PROBE_STORE window range hand-edited into WINDOWS if you need to confirm how much further back it goes.`);
  }
  console.log('═══════════════');
}

async function main() {
  if (process.env.INVHIST_PROBE === '1') { await runProbe(); return; }
  console.log('[invhist-pull] INVHIST_PROBE=1 not set — the real pull is not built yet (issue #257 step 0). Nothing to do.');
}

main().catch(err => { console.error('[invhist-pull] fatal:', err); process.exit(1); });
