#!/usr/bin/env node
// scripts/qsrsoft-security-events-pull.mjs
// Dispatch #65 — the actual daily pull for QSRSoft's event_details endpoint
// (api.security.myqsrsoft.com), unblocked now that #63 proved the 403 every prior attempt hit
// was a NETWORK-ORIGIN restriction (denied from GitHub-hosted runners, allowed from a consumer
// connection), not a credential/entitlement problem — see memory/dispatch-63.md's CORRECTION and
// memory/dispatch-65.md. This workflow therefore runs on a SELF-HOSTED runner
// (runs-on: [self-hosted, macOS, qsr-security]) on a permitted network; every other scheduled
// pull stays on hosted runners, unchanged.
//
// Shape (dispatch #58, settled by live measurement): empty registers/cashiers arrays mean ALL,
// so this is ONE request per (store, date, event_token) — 27 stores x 8 tokens = 216 requests
// for a single day, no per-register/per-cashier enumeration.
//
// Auth is SIMPLER than the DAR/regAudit pulls: memory/finding-qsrsoft-event-details-endpoint-
// 2026-08-21.md confirmed this host is token-only (X-Auth-Token), no session cookies -- a plain
// Node fetch with a minted token is the primary path, mirroring qsrsoft-ops-pull.mjs rather than
// qsrsoft-register-audit-pull.mjs's cookie/page.request dance. Playwright (real SPA login,
// USER_SRP_AUTH) is the fallback only, exactly like every other pull's two-path auth rule.
//
// PII: crew/mgr arrive as plaintext "Name - badge". src/engine/security-events.js's
// parseSecurityEventRow() extracts them but does NOT tokenize -- that happens here, right before
// the DB write, via src/engine/identity-vault.js's tokenizeRows() (same split as
// qsrsoft-register-audit-pull.mjs's saveAuditRows()). No plaintext name is ever logged.
//
// Required env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, QSRSOFT_USERNAME, QSRSOFT_PASSWORD.
// Optional env:
//   QSRSOFT_SECEVENTS_DAYS_BACK    — max days of history on initial run (default: 14)
//   QSRSOFT_SECEVENTS_DAYS_RECENT  — rolling re-pull window (default: 2)
//   QSRSOFT_SECEVENTS_START_DATE / QSRSOFT_SECEVENTS_END_DATE — explicit backfill window
//   QSRSOFT_SECEVENTS_DEBUG        — '1' for verbose (key-names-only) response-shape logging

import { createClient } from '@supabase/supabase-js';
import { makeOutcomeTracker } from './lib/pull-outcome.mjs';
import { getFreshToken } from './lib/qsrsoft-auth.mjs';
import { logPartitionCoverage, checkFreshness } from './_pipeline-contract.mjs';
import { tokenizeRows } from '../src/engine/identity-vault.js';
import { EVENT_TOKENS, storeRefFromLoc, parseSecurityEventRows } from '../src/engine/security-events.js';

const BASE = 'https://api.security.myqsrsoft.com';
const ORG_ID = 'a546d4ef-684a-4f25-8bc0-6580af068875';
const REPORT_PAGE = 'https://v3.myqsrsoft.com/reports/mcd/controlsCash/registerAudit';

const STORE_NSNS = [
  3708, 5183, 5985, 6178, 6838, 6972, 10034, 10422, 10915, 11657, 13113, 18213,
  20475, 24471, 29760, 31357, 32525, 33109, 33222, 33704, 34222, 35064, 35242,
  37566, 38609, 43380, 43701,
];
const STORE_LOCS = STORE_NSNS.map(n => String(n).padStart(7, '0'));

const DAYS_BACK   = parseInt(process.env.QSRSOFT_SECEVENTS_DAYS_BACK   || '14', 10);
const DAYS_RECENT = parseInt(process.env.QSRSOFT_SECEVENTS_DAYS_RECENT || '2',  10);
const START_DATE  = (process.env.QSRSOFT_SECEVENTS_START_DATE || '').trim();
const END_DATE    = (process.env.QSRSOFT_SECEVENTS_END_DATE   || '').trim();
const DEBUG       = process.env.QSRSOFT_SECEVENTS_DEBUG === '1';

// Guarded, not unconditional -- see qsrsoft-register-audit-pull.mjs's identical comment. Keeps
// this module importable (for its pure helpers) under vitest, where neither env var is set.
const supabase = (process.env.VITE_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
  ? createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null;

const fmtDate = d => d.toISOString().slice(0, 10);
const addDay  = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };

function dateList(startDate, endDate) {
  const out = [];
  let cur = new Date(startDate + 'T12:00:00Z');
  const end = new Date(endDate + 'T12:00:00Z');
  while (cur <= end) { out.push(fmtDate(cur)); cur = addDay(cur, 1); }
  return out;
}

export const buildUrl = storeRef => `${BASE}/security/event_details/v1/${ORG_ID}/${storeRef}?orgId=${ORG_ID}`;
export const buildBody = (eventToken, date) => ({
  event_token: eventToken, start_date: date, end_date: date,
  registers: [], time_slices: [], cashiers: [], mgr_code: null,
});
const HDRS = token => ({
  'X-Auth-Token': token, 'Content-Type': 'application/json', 'Accept': '*/*',
  'Origin': 'https://v3.myqsrsoft.com', 'Referer': REPORT_PAGE,
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
});

// Envelope shape was never definitively pinned down (memory/dispatch-58.md's own live
// measurement recorded row COUNTS, not the raw JSON) -- accept the same three shapes
// qsrsoft-register-audit-pull.mjs's extractRows() already defends against for the SAME "an API
// nobody has published a schema for" reason, and say so loudly when none match rather than
// silently returning zero rows (the exact failure class that cost that script a full round-trip
// per wrong guess).
export function extractRows(body, unit) {
  if (Array.isArray(body)) return body;
  const rows = body?.resp || body?.result || body?.data;
  if (Array.isArray(rows)) return rows;
  if (body && typeof body === 'object') {
    const shape = Object.entries(body).map(([k, v]) =>
      Array.isArray(v) ? `${k}[${v.length}]` : `${k}:${v === null ? 'null' : typeof v}`).join(' ');
    console.error(`[secevents-pull] ${unit}: unrecognized envelope -- top-level shape: {${shape}}`);
  } else {
    console.error(`[secevents-pull] ${unit}: unrecognized body type: ${typeof body}`);
  }
  return [];
}

async function fetchOne(storeRef, eventToken, date, token) {
  const resp = await fetch(buildUrl(storeRef), {
    method: 'POST', headers: HDRS(token), body: JSON.stringify(buildBody(eventToken, date)),
  });
  const unit = `${storeRef}/${date}/${eventToken}`;
  if (resp.status === 401 || resp.status === 403) {
    // Same diagnostic-before-throw discipline as every other pull here -- an API gateway 403
    // nearly always carries a reason, and reading it is a MEASUREMENT, not a re-guess.
    const detail = await resp.text().catch(() => '(body unreadable)');
    const diagHdrs = ['x-amzn-errortype', 'x-amzn-requestid', 'x-amzn-remapped-authorization', 'www-authenticate']
      .map(h => (resp.headers.get(h) ? `${h}=${resp.headers.get(h)}` : null)).filter(Boolean).join(' · ');
    console.error(`[secevents-pull] ${unit}: ${resp.status} body: ${detail.slice(0, 400) || '(empty)'}`);
    if (diagHdrs) console.error(`[secevents-pull] ${unit}: ${resp.status} headers: ${diagHdrs}`);
    throw new Error(`AUTH_FAILED:${resp.status}`);
  }
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  const body = await resp.json();
  return extractRows(body, unit);
}

async function resolveToken(token, forceRemint) {
  return typeof token === 'function' ? await token({ forceRemint }) : token;
}

// Accumulates parsed (but still plaintext-crew/mgr) rows in memory across the whole run, rather
// than tokenizing/upserting per (store, date, token) -- tokenizeRows() already batches its RPC
// calls to one per DISTINCT name; doing that once at the end over the whole run's rows means far
// fewer round trips than the 216+ units this run makes, at estate-wide volumes the brief itself
// sized at "low tens of thousands of rows/day" (still trivial to hold in memory for one process).
async function runAll(token, dates, tracker) {
  const collected = [];
  const coveredStores = new Set();
  let loggedShapeThisRun = false;
  for (const date of dates) {
    for (const nsn of STORE_NSNS) {
      const storeRef = storeRefFromLoc(String(nsn));
      const loc = String(nsn).padStart(7, '0');
      for (const eventToken of EVENT_TOKENS) {
        const unit = `${date}:${loc}:${eventToken}`;
        try {
          const tok = await resolveToken(token, false);
          let rows;
          try {
            rows = await fetchOne(storeRef, eventToken, date, tok);
          } catch (e) {
            if (String(e.message).startsWith('AUTH_FAILED') && typeof token === 'function') {
              console.log(`[secevents-pull] ${unit}: cached token rejected — forcing a re-mint and retrying once`);
              const freshTok = await resolveToken(token, true);
              rows = await fetchOne(storeRef, eventToken, date, freshTok);
            } else throw e;
          }
          if (!rows.length) continue;
          if (DEBUG && !loggedShapeThisRun && rows[0] && typeof rows[0] === 'object') {
            // Key names only -- every row is employee-attributed PII, same discipline the
            // register-audit pull and the probe script both already follow.
            console.log(`[secevents-pull] DEBUG response row shape (key names only): ${Object.keys(rows[0]).join(',')}`);
            loggedShapeThisRun = true;
          }
          const parsed = parseSecurityEventRows(rows, { loc });
          const dropped = rows.length - parsed.length;
          if (dropped) console.log(`[secevents-pull] ${unit}: ${dropped}/${rows.length} row(s) dropped (unkeyable)`);
          collected.push(...parsed);
          coveredStores.add(loc);
          console.log(`[secevents-pull] ${unit}: ${rows.length} row(s)`);
        } catch (e) {
          if (String(e.message).startsWith('AUTH_FAILED')) throw e;
          console.error(`[secevents-pull] ${unit} ERROR: ${e.message}`);
          tracker.fail(unit, e.message);
        }
        await new Promise(r => setTimeout(r, 100));
      }
    }
  }
  return { collected, coveredStores };
}

// Tokenizes crew/mgr names (two independent fields -- a crew token and a manager token are
// different identity ROLES on the same event, even when the same real person could plausibly
// hold both across different rows) and writes to qsr_security_events. Never logs a name.
export async function saveSecurityEventRows(rows) {
  if (!rows?.length) return { saved: 0, errors: [] };
  const crewMap = await tokenizeRows(supabase, rows, 'crewName');
  const mgrMap = await tokenizeRows(supabase, rows, 'mgrName');
  const upsert = rows.map(r => ({
    tenant_id: '00000000-0000-0000-0000-000000000001',
    loc: r.loc,
    event_token: r.eventToken,
    event_dt: r.eventDt,
    event_tm: r.eventTm,
    reg_num: r.regNum,
    order_key: r.orderKey,
    event_name: r.eventName,
    event_display: r.eventDisplay,
    event_amt: r.eventAmt,
    remaining_amt: r.remainingAmt,
    tender_type: r.tenderType,
    daypart_name: r.daypartName,
    store_busn_dt: r.storeBusnDt,
    crew_token: crewMap.get((r.crewName || '').trim()) ?? null,
    crew_badge: r.crewBadge,
    mgr_token: mgrMap.get((r.mgrName || '').trim()) ?? null,
    mgr_badge: r.mgrBadge,
    mgr_code: r.mgrCode,
    pos_session_start_dt: r.posSessionStartDt,
    pos_session_start_tm: r.posSessionStartTm,
    updated_at: new Date().toISOString(),
  }));
  const CHUNK = 500;
  let saved = 0; const errors = [];
  for (let i = 0; i < upsert.length; i += CHUNK) {
    const { error } = await supabase.from('qsr_security_events').upsert(
      upsert.slice(i, i + CHUNK),
      { onConflict: 'tenant_id,loc,event_token,event_dt,event_tm,order_key' },
    );
    if (error) { console.warn('[qsr_security_events] save error:', error); errors.push(error.message); }
    else saved += Math.min(CHUNK, upsert.length - i);
  }
  return { saved, errors };
}

// ── Gap detection (mirrors every other pull script's own getDateRange()) ────────────────────
async function getLatestDate() {
  const { data, error } = await supabase.from('qsr_security_events').select('event_dt')
    .order('event_dt', { ascending: false }).limit(1).single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`[secevents-pull] getLatestDate() read failed -- ${error.code}: ${error.message}`);
  }
  return data?.event_dt ? new Date(data.event_dt + 'T12:00:00Z') : null;
}

async function getDateRange() {
  const today = new Date();
  if (START_DATE) {
    const e = END_DATE || fmtDate(today);
    console.log(`[secevents-pull] explicit backfill window ${START_DATE} → ${e}`);
    return { startDate: START_DATE, endDate: e, latestForFreshness: await getLatestDate() };
  }
  const latest = await getLatestDate();
  const daysSince = latest ? Math.floor((today - latest) / 86400000) : DAYS_BACK;
  const back = Math.min(Math.max(DAYS_RECENT, daysSince + DAYS_RECENT), DAYS_BACK);
  const s = fmtDate(addDay(today, -back));
  console.log(latest
    ? `[secevents-pull] latest in DB: ${fmtDate(latest)} (${daysSince}d ago) — pulling ${back} days back`
    : `[secevents-pull] no existing data — pulling ${back} days of history`);
  return { startDate: s, endDate: fmtDate(today), latestForFreshness: latest };
}

// ── Two-path auth (direct-first, matching qsrsoft-ops-pull.mjs -- this host is token-only, no
// cookies, per memory/finding-qsrsoft-event-details-endpoint-2026-08-21.md) ─────────────────
async function viaPlaywright(dates, tracker) {
  const u = process.env.QSRSOFT_USERNAME, pw = process.env.QSRSOFT_PASSWORD;
  if (!u || !pw) { console.error('[auth] no QSRSOFT_USERNAME/PASSWORD — cannot use Playwright fallback'); return { collected: [], coveredStores: new Set() }; }
  const { chromium } = await import('playwright');
  const { mkdirSync } = await import('fs');
  try { mkdirSync('screenshots', { recursive: true }); } catch {}
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();
  page.setDefaultTimeout(180000);
  let token = null;
  page.on('request', async req => {
    try {
      const all = await req.allHeaders();
      const t = all['x-auth-token'];
      if (t && t.length > 20 && !token) token = t;
    } catch { /* torn-down request, not diagnostic */ }
  });
  const snap = name => page.screenshot({ path: `screenshots/${name}`, fullPage: true }).catch(() => {});
  try {
    await page.goto('https://v3.myqsrsoft.com', { waitUntil: 'networkidle', timeout: 45000 });
    const userSel = ['input[name="username"]', 'input[name="email"]', 'input[type="email"]', '#username', '#email', 'input[autocomplete="username"]'].join(', ');
    await page.waitForSelector(userSel, { timeout: 20000 });
    await page.fill(userSel, u);
    await page.fill('input[type="password"], input[name="password"]', pw);
    await page.click('button[type="submit"], input[type="submit"], .btn-primary, button:has-text("Login"), button:has-text("Sign in")');
    await page.waitForLoadState('networkidle', { timeout: 30000 });
    console.log('[auth] post-login url:', page.url());
    await snap('secevents-01-post-login.png');
    await page.goto(REPORT_PAGE, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 5000));
    console.log('[auth] token captured via real SPA login (USER_SRP_AUTH):', !!token);
    await snap('secevents-02-report-page.png');
    if (!token) { console.error('[auth] ✗ no x-auth-token seen on any request during SPA login'); tracker.fail('playwright-fallback', 'no token captured'); return { collected: [], coveredStores: new Set() }; }
    return await runAll(token, dates, tracker);
  } catch (e) {
    console.error(`[auth] ✗ Playwright fallback failed: ${e.message}`);
    tracker.fail('playwright-fallback', e.message);
    return { collected: [], coveredStores: new Set() };
  } finally { await browser.close(); }
}

// ── Main ───────────────────────────────────────────────────────────────────────────────────
async function main() {
  if (!process.env.VITE_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[secevents-pull] Missing Supabase env'); process.exit(1);
  }
  if (!process.env.QSRSOFT_USERNAME || !process.env.QSRSOFT_PASSWORD) {
    console.error('[secevents-pull] Missing QSRSOFT_USERNAME/QSRSOFT_PASSWORD'); process.exit(1);
  }

  const { startDate, endDate, latestForFreshness } = await getDateRange();
  const fresh = checkFreshness(latestForFreshness, { warnAfterHours: 30, errorAfterHours: 54, label: 'secevents-pull' });
  if (fresh.message) (fresh.status === 'error' ? console.error : console.warn)(fresh.message);

  const dates = dateList(startDate, endDate);
  console.log(`[secevents-pull] ${dates.length} day(s) × ${STORE_NSNS.length} store(s) × ${EVENT_TOKENS.length} event token(s): ${startDate} → ${endDate}`);

  const tracker = makeOutcomeTracker('secevents-pull');
  const requestedUnits = dates.flatMap(d => STORE_LOCS.flatMap(loc => EVENT_TOKENS.map(t => `${d}:${loc}:${t}`)));

  let result;
  try {
    result = await runAll(getFreshToken, dates, tracker);
  } catch (e) {
    console.log(`[auth] mint-and-fetch failed (${e.message}) — falling back to Playwright`);
    result = await viaPlaywright(dates, tracker);
  }

  const { saved, errors } = await saveSecurityEventRows(result.collected);
  if (errors.length) console.error(`[secevents-pull] ${errors.length} save error(s), first: ${errors[0]}`);

  console.log(`[secevents-pull] done — ${result.collected.length} row(s) parsed, ${saved} saved.`);
  logPartitionCoverage(result.coveredStores, STORE_LOCS, { label: 'secevents-pull', kind: 'store' });
  const code = tracker.finalize({
    requestedUnits, totalSaved: saved,
    formatRerun: () => `QSRSOFT_SECEVENTS_START_DATE=${startDate} QSRSOFT_SECEVENTS_END_DATE=${endDate}`,
  });
  process.exit(code);
}

// Only run main() when executed directly (not when imported for unit tests of the pure helpers).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => { console.error('[secevents-pull] FATAL:', e); process.exit(1); });
}
