#!/usr/bin/env node
// scripts/qsrsoft-security-events-pull.mjs
// Dispatch #81 REBUILD — the daily pull for QSRSoft's event_details endpoint
// (api.security.myqsrsoft.com). This script had NEVER worked: both of its prior auth paths
// (a bare Node fetch with a minted token, and a "Playwright fallback" that captured a token in
// the browser but then handed it BACK to a Node-side fetch) always 403'd, because
// memory/finding-api-security-transport-fingerprint-2026-08-23.md proved this host fingerprints
// the TLS/HTTP-2 CLIENT, not the credential — the owner's own working browser token returns 403
// from Node on the same machine, same network, with Chrome's full header set. Headers cannot
// forge a TLS ClientHello. See that finding for the full elimination chain (source IP,
// entitlement, token type, token contents, app client, and headers were all ruled out first).
//
// So the file's two previous claims are both WRONG and are corrected here, not just patched
// around:
//   - It is NOT a network-origin restriction ("denied from GitHub-hosted runners, allowed from a
//     consumer connection" — memory/dispatch-63.md's now-superseded CORRECTION). The owner's own
//     browser token 403'd from Node on the owner's OWN network.
//   - It is NOT token-only / direct-fetch-first. A plain Node fetch with a minted token can never
//     succeed against this host, from any network, no matter how fresh or valid the token is.
//
// ⚠️ DELIBERATE EXCEPTION to this repo's standing two-path auth rule (CLAUDE.md, "Adding a new
// automated pull"): there is no viable direct-token path for api.security at all, so there is no
// second path to keep as a fallback. The ONLY path that works is making the actual event_details
// request from INSIDE a real browser (page.evaluate()), so the request carries a genuine Chrome
// TLS/HTTP-2 fingerprint. This script therefore has exactly one auth/fetch path, and it is
// in-browser end to end — structured on qsrsoft-dar-pull.mjs's pullViaPlaywright() (its own
// "Path B: Playwright login" section), which already does this correctly for the sibling host
// api.reports.myqsrsoft.com: real Chromium SPA login, capture the X-Auth-Token from a live
// request, then run the actual fetch() from inside the page context — never handing the token
// back out to a Node-side fetch. One page.evaluate() per (store, date, event_token) unit, not one
// evaluate with an internal loop (CLAUDE.md: the latter hangs with no output).
//
// Shape (dispatch #58, settled by live measurement): empty registers/cashiers arrays mean ALL,
// so this is ONE request per (store, date, event_token) — 27 stores x 8 tokens = 216 requests
// for a single day, no per-register/per-cashier enumeration. Every one of those 216 is now its
// own page.evaluate() call, which is real added cost over the old (never-working) bare-fetch
// design — see memory/dispatch-81.md's "Resolution" section for what wall-clock measurement this
// still needs before being trusted on a daily schedule.
//
// PII: crew/mgr arrive as plaintext "Name - badge". src/engine/security-events.js's
// parseSecurityEventRow() extracts them but does NOT tokenize -- that happens here, right before
// the DB write, via src/engine/identity-vault.js's tokenizeRows() (same split as
// qsrsoft-register-audit-pull.mjs's saveAuditRows()). No plaintext name is ever logged.
//
// Required env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, QSRSOFT_USERNAME, QSRSOFT_PASSWORD.
// (QSRSOFT_USERNAME/PASSWORD drive the real SPA login — there is no QSRSOFT_TOKEN direct path
// for this host, unlike the DAR/eBOS pulls.)
// Optional env:
//   QSRSOFT_SECEVENTS_DAYS_BACK    — max days of history on initial run (default: 14)
//   QSRSOFT_SECEVENTS_DAYS_RECENT  — rolling re-pull window (default: 2)
//   QSRSOFT_SECEVENTS_START_DATE / QSRSOFT_SECEVENTS_END_DATE — explicit backfill window
//   QSRSOFT_SECEVENTS_DEBUG        — '1' for verbose (key-names-only) response-shape logging

import { createClient } from '@supabase/supabase-js';
import { makeOutcomeTracker } from './lib/pull-outcome.mjs';
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

// ── Pure helpers -- unchanged signatures, still covered unmodified by
// src/__tests__/qsrsoft-security-events-pull.test.js. Only their CALLER changed (in-browser
// fetch instead of a Node-side one); the URL/body/envelope shape did not.
export const buildUrl = storeRef => `${BASE}/security/event_details/v1/${ORG_ID}/${storeRef}?orgId=${ORG_ID}`;
export const buildBody = (eventToken, date) => ({
  event_token: eventToken, start_date: date, end_date: date,
  registers: [], time_slices: [], cashiers: [], mgr_code: null,
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

// ── The one fetch path: entirely inside the browser (page.evaluate()) ───────────────────────
// url/body are built in Node from the pure helpers above (cheap, no network), then handed to the
// page as data -- the fetch() call itself, and everything about the TLS/HTTP-2 connection it
// opens, happens inside Chromium. No credentials:'include' (auth is the explicit X-Auth-Token
// header, same as qsrsoft-dar-pull.mjs's in-browser fetch, not a session cookie).
async function fetchOneInBrowser(page, storeRef, eventToken, date, token) {
  const url = buildUrl(storeRef);
  const body = buildBody(eventToken, date);
  try {
    return await page.evaluate(async ({ url, body, token, referer }) => {
      try {
        const r = await fetch(url, {
          method: 'POST',
          headers: {
            'X-Auth-Token': token,
            'Content-Type': 'application/json',
            'Accept': '*/*',
            'Origin': 'https://v3.myqsrsoft.com',
            'Referer': referer,
          },
          body: JSON.stringify(body),
        });
        const text = await r.text();
        let json = null;
        try { json = JSON.parse(text); } catch { /* non-JSON body -- rawText carries it below */ }
        const diagHdrs = {};
        for (const h of ['x-amzn-errortype', 'x-amzn-requestid', 'x-amzn-remapped-authorization', 'www-authenticate']) {
          const v = r.headers.get(h);
          if (v) diagHdrs[h] = v;
        }
        return { status: r.status, ok: r.ok, json, rawText: json ? null : text.slice(0, 400), diagHdrs };
      } catch (e) {
        return { error: e.message };
      }
    }, { url, body, token, referer: REPORT_PAGE });
  } catch (e) {
    // page.evaluate() itself threw (e.g. page navigated away, browser torn down) -- distinct
    // from the in-page fetch throwing, which is already caught and returned above.
    return { error: `page.evaluate failed: ${e.message}` };
  }
}

// Accumulates parsed (but still plaintext-crew/mgr) rows in memory across the whole run, rather
// than tokenizing/upserting per (store, date, token) -- tokenizeRows() already batches its RPC
// calls to one per DISTINCT name; doing that once at the end over the whole run's rows means far
// fewer round trips than the 216+ units this run makes, at estate-wide volumes the brief itself
// sized at "low tens of thousands of rows/day" (still trivial to hold in memory for one process).
async function runSecurityEvents(page, token, dates, tracker) {
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
          const result = await fetchOneInBrowser(page, storeRef, eventToken, date, token);
          if (result.error) throw new Error(result.error);
          if (result.status === 401 || result.status === 403) {
            // Same diagnostic-before-throw discipline as every other pull here -- an API gateway
            // 403 nearly always carries a reason, and reading it is a MEASUREMENT, not a re-guess.
            const bodyPreview = result.rawText || (result.json ? JSON.stringify(result.json) : '') || '(empty)';
            const diag = Object.entries(result.diagHdrs || {}).map(([k, v]) => `${k}=${v}`).join(' · ');
            console.error(`[secevents-pull] ${unit}: ${result.status} body: ${bodyPreview.slice(0, 400)}`);
            if (diag) console.error(`[secevents-pull] ${unit}: ${result.status} headers: ${diag}`);
            // A 401/403 here means the CAPTURED browser token itself was rejected -- unlike the
            // old getFreshToken() path, there is no cheap re-mint to retry with; the only way to
            // get a new token is a fresh SPA login, which this run does not attempt mid-flight.
            // Bubble up so the caller can stop and report a real auth failure rather than
            // silently marking 216+ units failed one at a time.
            throw new Error(`AUTH_FAILED:${result.status}`);
          }
          if (!result.ok) throw new Error(`HTTP ${result.status}: ${(result.rawText || '').slice(0, 200)}`);
          const rows = extractRows(result.json, unit);
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

// ── The one auth/fetch path: real Chromium SPA login → capture X-Auth-Token from a live
// request → in-browser fetch for every unit, never leaving the page. See the file header for
// why this departs from the repo's normal two-path convention. ─────────────────────────────
async function viaPlaywright(dates, tracker) {
  const u = process.env.QSRSOFT_USERNAME, pw = process.env.QSRSOFT_PASSWORD;
  if (!u || !pw) {
    console.error('[auth] no QSRSOFT_USERNAME/PASSWORD — cannot run (in-browser fetch is the ONLY auth path for this host, there is no direct-token fallback)');
    return { collected: [], coveredStores: new Set() };
  }
  const { chromium } = await import('playwright');
  const { mkdirSync } = await import('fs');
  try { mkdirSync('screenshots', { recursive: true }); } catch {}
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();
  page.setDefaultTimeout(180000);
  let token = null;
  // Dispatch #67 -- track EVERY request the listener saw, not just ones carrying x-auth-token.
  // Zero total requests and zero matching requests are different diagnoses: the first means the
  // page never made any network calls (unlikely, but distinguishes "nothing loaded" from "things
  // loaded, none of them authenticated"); the second alone was already logged before and left the
  // question open.
  let totalRequestsSeen = 0;
  page.on('request', async req => {
    totalRequestsSeen++;
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
    // ⚠️ Do NOT use waitForLoadState('networkidle') as the post-click wait. This is a client-side
    // SPA login: the click fires an XHR, it does not navigate. networkidle reports the state of
    // the page load that ALREADY finished, so it can return in milliseconds -- before the auth
    // request has even been issued -- and the script then races on to page.goto(REPORT_PAGE),
    // which ABORTS the in-flight login. The session is never established and the app renders a
    // fresh (blank) login route, which reads like a rejected credential but is not one.
    //
    // MEASURED 2026-08-23, from the run's own screenshot artifact: secevents-01-post-login.png --
    // taken on the line right after the old networkidle wait -- shows the email and password
    // fields still populated and the submit button still reading "Signing in". The wait had
    // returned mid-flight. secevents-02-report-page.png, taken after the navigation, shows an
    // EMPTY form with no [role="alert"] and the email cleared: an unauthenticated redirect, not
    // a credential error (a rejected password keeps the email and shows a message).
    //
    // Wait for a real success SIGNAL instead, so the wait cannot depend on how fast this
    // particular machine is. Success = the SPA has written its Cognito idToken to localStorage
    // (the exact key dispatch #67 measured the app reading). Fall back to "the login form is
    // gone", since a UI that authenticates without that key would otherwise hang the full
    // timeout for no reason.
    let loginSignal = null;
    try {
      loginSignal = await page.waitForFunction(() => {
        if (Object.keys(localStorage).some(k => k.endsWith('.idToken'))) return 'idToken';
        const formGone = !document.querySelector('input[type="password"], input[name="password"]');
        return formGone ? 'form-gone' : false;
      }, { timeout: 60000 }).then(h => h.jsonValue());
    } catch {
      loginSignal = null; // timed out -- diagnostics below say what the page actually shows
    }
    console.log('[auth] login completion signal:', loginSignal || 'NONE (timed out after 60s)');
    console.log('[auth] post-login url:', page.url());
    await snap('secevents-01-post-login.png');
    // Dispatch #67 Resolution -- the live run got no token from either localStorage or
    // interception, and the only way to tell "login didn't complete" from "login completed but
    // mints no token anywhere" was a screenshot this sandbox cannot reach. Assert and log
    // everything a screenshot would have shown, in text, so this settles from the Actions log
    // alone next run:
    const postLoginState = await page.evaluate(() => {
      const loginFieldPresent = !!document.querySelector(
        'input[name="username"], input[name="email"], input[type="email"], #username, #email, ' +
        'input[autocomplete="username"], input[type="password"], input[name="password"]'
      );
      const alertEl = document.querySelector('[role="alert"]');
      const alertText = alertEl ? alertEl.textContent.trim().slice(0, 200) : null;
      const bodyText = document.body ? document.body.innerText.trim() : '';
      return {
        title: document.title,
        loginFieldPresent,
        alertText,
        // Only when the page renders almost nothing (a bare error page, not the real app shell)
        // is the body text itself informative -- a loaded SPA's body text would be enormous and
        // useless to log, so cap what's captured to short pages only.
        shortBodyText: bodyText.length > 0 && bodyText.length <= 300 ? bodyText : null,
        localStorageKeys: Object.keys(localStorage).sort(),
      };
    });
    console.log('[auth] post-login document.title:', JSON.stringify(postLoginState.title));
    console.log('[auth] post-login login-form-still-present:', postLoginState.loginFieldPresent);
    console.log('[auth] post-login localStorage key NAMES:', postLoginState.localStorageKeys.length
      ? postLoginState.localStorageKeys.join(', ') : '(empty -- no keys of any kind)');
    if (postLoginState.alertText) console.log('[auth] post-login role="alert" text:', JSON.stringify(postLoginState.alertText));
    if (postLoginState.shortBodyText) console.log('[auth] post-login short body text:', JSON.stringify(postLoginState.shortBodyText));
    console.log('[auth] post-login requests seen so far: total', totalRequestsSeen, '| carrying x-auth-token:', token ? 1 : 0);
    // Dispatch #67 Task 1 -- the owner measured (browser console, exact x-auth-token value from
    // a working event_details request vs localStorage) that the SPA sends the plain Cognito ID
    // token straight out of storage: nothing is minted at click time, nothing derived, nothing
    // wrapped. So read it directly rather than depend on a request happening to carry it -- the
    // request-interception listener above stays wired as a fallback only (a silent null from
    // localStorage must not look identical to a failed login).
    const spaToken = await page.evaluate(() => {
      const k = Object.keys(localStorage).find(k => k.endsWith('.idToken'));
      return k ? localStorage.getItem(k) : null;
    });
    console.log('[auth] localStorage idToken read:', spaToken ? `true (${spaToken.length} chars)` : 'false');
    // Dispatch #66: the previous .catch(() => {}) here swallowed the navigation error
    // AND never logged page.url() afterward, so a failed navigation was indistinguishable
    // from a successful one that simply saw no token -- the run just printed nothing
    // (qsrsoft-register-audit-pull.mjs's equivalent DOES log the post-navigation url
    // unconditionally, which is the only reason its own "navigated but no token" case is
    // diagnosable at all; that's the "tell" that flagged this bug). Catch and keep the
    // error message instead of discarding it, and always log the URL + token state
    // together so the three distinct outcomes (nav failed / navigated, no token / navigated,
    // token captured) are each unambiguous in the log.
    let navError = null;
    try {
      await page.goto(REPORT_PAGE, { waitUntil: 'networkidle', timeout: 30000 });
    } catch (e) { navError = e.message; }
    await new Promise(r => setTimeout(r, 5000));
    console.log('[auth] report page url:', page.url(),
      '| nav error:', navError || '(none)',
      '| interception token captured:', token ? `true (${token.length} chars)` : 'false',
      '| requests seen: total', totalRequestsSeen, 'carrying x-auth-token:', token ? 1 : 0);
    await snap('secevents-02-report-page.png');
    // Merge of #560 (dispatch #67) into #593 (dispatch #81). #560 MEASURED on the Mac mini
    // that request interception captured nothing -- zero requests carried x-auth-token -- while
    // the SPA's plain Cognito ID token sat in localStorage the whole time. So localStorage is
    // PRIMARY and interception is the fallback; taking #593's interception-only version would
    // have reintroduced the exact no-token failure #560 diagnosed.
    // #560's claim-name diff is deliberately NOT carried over: it compared the SPA token against
    // getFreshToken()'s bare token, and #593 deletes both getFreshToken() and runAll() outright
    // (the bare-Node path can never reach this host -- see the transport-fingerprint finding), so
    // there is no longer a second token to diff against.
    const finalToken = spaToken || token;
    console.log('[auth] token source:', spaToken ? 'localStorage (primary)' : (token ? 'request-interception (fallback)' : 'none'));
    if (!finalToken) {
      console.error('[auth] ✗ no token from localStorage or interception during SPA login');
      tracker.fail('playwright-login', navError ? `navigation failed: ${navError}` : 'no token captured');
      return { collected: [], coveredStores: new Set() };
    }
    console.log(`[auth] ✓ token captured — fetching ${dates.length} day(s) × ${STORE_NSNS.length} store(s) × ${EVENT_TOKENS.length} event token(s) IN-BROWSER (${dates.length * STORE_NSNS.length * EVENT_TOKENS.length} page.evaluate() calls)…`);
    const result = await runSecurityEvents(page, finalToken, dates, tracker);
    await snap('secevents-final.png');
    return result;
  } catch (e) {
    if (String(e.message).startsWith('AUTH_FAILED')) {
      console.error(`[auth] ✗ captured token was rejected mid-run (${e.message}) — this run does not re-login and retry; a subsequent scheduled run will attempt a fresh SPA login`);
    } else {
      console.error(`[auth] ✗ Playwright run failed: ${e.message}`);
    }
    tracker.fail('playwright-run', e.message);
    await snap('secevents-error.png');
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

  const result = await viaPlaywright(dates, tracker);

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
