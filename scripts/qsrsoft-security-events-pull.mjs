#!/usr/bin/env node
// scripts/qsrsoft-security-events-pull.mjs
// Dispatch #83 REBUILD — the daily pull for QSRSoft's event_details endpoint
// (api.security.myqsrsoft.com). Dispatch #81's premise is DEAD:
// memory/finding-api-security-transport-fingerprint-2026-08-23.md's transport/TLS-fingerprint
// conclusion (and its "only a real browser can reach this host" corollary) is OVERTURNED --
// read that file's own correction banner. A plain curl from the owner's Mac, with a full browser
// header set and a FRESH token, returned 200 and 23 real event rows. curl's TLS fingerprint
// resembles Chrome's not at all, so fingerprinting cannot be the mechanism. Worse for #81: the
// in-browser fetch is the one that FAILS -- 216/216 CORS-blocked, `net::ERR_FAILED`, preflight
// 403 (memory/dispatch-83.md's #610 diagnostics). The browser cannot make this call cross-origin
// from v3.myqsrsoft.com; a non-browser client can.
//
// So this rebuild is a SIMPLIFICATION, not another workaround: no Chromium launch, no SPA login,
// no page.evaluate() (216 of them, previously), no screenshot artifacts, no CORS problem --
// replaced by one plain Node `fetch()` per unit, exactly like every other QSRSoft reporting pull
// in this repo (qsrsoft-dar-pull.mjs / qsrsoft-ops-pull.mjs).
//
// ⚠️ `Origin` and `Referer` are settable from Node and are FORBIDDEN headers in the browser Fetch
// API -- silently dropped in-page. Since the endpoint's CORS behavior already suggested
// Origin/Referer scoping, that is a clean, sufficient explanation for why Node succeeds where the
// browser could not, without invoking any client-fingerprinting mechanism at all.
//
// 📌 This may also explain the ORIGINAL 403s that started this whole investigation (#58, #63,
// #65, #66, #67, #70): #588's fingerprint conclusion came from replaying "the owner's own working
// browser token" from Node. QSRSOFT_TOKEN is a ~1h-TTL Cognito token (#312) -- if more than an
// hour separated capture from replay, that token was simply EXPIRED, not fingerprinted. Mint
// fresh for every attempt from here on (see Token handling below) so that mistake can't recur.
//
// The repo's standing two-path auth rule (CLAUDE.md, "Adding a new automated pull") applies again
// now that a direct path actually exists: getFreshToken() is the only path this script has, same
// as several sibling reporting-API pulls -- there is no browser fallback to keep, because the
// browser was never the thing that worked.
//
// Shape (dispatch #58, settled by live measurement): empty registers/cashiers arrays mean ALL,
// so this is ONE request per (store, date, event_token) — 27 stores x 8 tokens = 216 requests
// for a single day, no per-register/per-cashier enumeration. Now plain HTTP, not a browser
// launch per request -- should cost close to what the other 216-ish-request pulls in this repo
// cost, not #81's unmeasured Chromium-per-request estimate. Wall-clock is logged at the end of
// the run (see main()) so the first live run settles this instead of leaving it estimated.
//
// PII: crew/mgr arrive as plaintext "Name - badge". src/engine/security-events.js's
// parseSecurityEventRow() extracts them but does NOT tokenize -- that happens here, right before
// the DB write, via src/engine/identity-vault.js's tokenizeRows() (same split as
// qsrsoft-register-audit-pull.mjs's saveAuditRows()). No plaintext name is ever logged.
//
// Required env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, QSRSOFT_USERNAME, QSRSOFT_PASSWORD
// (the last two feed getFreshToken()'s Cognito mint -- there is no separately-stored
// QSRSOFT_TOKEN path here, same as the other converted reporting-API pulls).
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
import { createHash } from 'node:crypto';
import { getFreshToken } from './lib/qsrsoft-auth.mjs';

// Identity fingerprint -- hash of the token's `sub` + `cognito:username`. Logged ONCE per run so a
// CI run can be compared against a local one for "is this even the same Cognito account?" without
// printing any identifier. Same construction as scripts/probe-security-token-identity.mjs, so the
// two lines are directly comparable by eye.
//
// Why this exists: on 2026-08-23 the pull 403'd with AccessDenied on all 216 units while the probe,
// on the SAME MACHINE with the same code path, returned 200. Token, headers, body shape, date,
// store, network and request rate were each eliminated as the variable. The remaining difference is
// WHERE the credentials come from -- the runner reads QSRSOFT_USERNAME/PASSWORD from GitHub
// Secrets, an interactive run reads them from the shell. If those are two different QSRSoft
// accounts, this line will differ between the two runs and the original entitlement finding
// (memory/finding-qsrsoft-security-entitlement-request-2026-08-22.md) is correct after all.
const identityFp = token => {
  try {
    const c = JSON.parse(Buffer.from(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return createHash('sha256').update(`${c.sub || ''}|${c['cognito:username'] || ''}`).digest('hex').slice(0, 12);
  } catch { return '(unparseable)'; }
};

const BASE = 'https://api.security.myqsrsoft.com';
const ORG_ID = 'a546d4ef-684a-4f25-8bc0-6580af068875';
const REPORT_PAGE = 'https://v3.myqsrsoft.com/reports/mcd/controlsCash/registerAudit';
// The exact header set the owner's working curl sent (memory/dispatch-83.md Q1). Send ALL of
// them until a live run proves a smaller set still works -- do not preemptively trim.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36';
const SEC_CH_UA = '"Not;A=Brand";v="8", "Chromium";v="150", "Google Chrome";v="150"';

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

// ⚠️ Validate the inputs and THROW. A silently-empty date list is the worst possible
// failure here, and it happened live on 2026-08-23: the owner entered the workflow_dispatch
// window as `2026/08/22` (slashes) instead of `2026-08-22`. `new Date('2026/08/22T12:00:00Z')`
// is an Invalid Date, every comparison against it is false, the loop body never runs, and the
// run went on to print:
//
//   [secevents-pull] 0 day(s) x 27 store(s) x 8 event token(s)
//   [secevents-pull] done -- 0 row(s) parsed, 0 saved.
//   [secevents-pull] per-store: 0/27 store(s) had at least one row upserted.
//
// ...and exited 0. GREEN. A scheduled run with a mistyped *_START_DATE secret would report
// success forever while pulling nothing -- the same "a check that runs, passes, and cannot fail
// in the case it exists for" shape as #171's pooled freshness Math.max.
//
// Fail loudly instead: an operator typo must not be indistinguishable from a quiet day.
export function dateList(startDate, endDate) {
  const parse = (v, which) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v || ''))) {
      throw new Error(
        `[secevents-pull] ${which} must be YYYY-MM-DD (dashes), got ${JSON.stringify(v)}. ` +
        `Slashes parse to an Invalid Date and would silently pull zero days.`);
    }
    const d = new Date(v + 'T12:00:00Z');
    if (Number.isNaN(d.getTime())) throw new Error(`[secevents-pull] ${which} is not a real date: ${JSON.stringify(v)}`);
    return d;
  };
  const cur0 = parse(startDate, 'start date');
  const end  = parse(endDate,   'end date');
  if (cur0 > end) {
    throw new Error(`[secevents-pull] start date ${startDate} is after end date ${endDate} -- window would be empty.`);
  }
  const out = [];
  let cur = cur0;
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

// ── The one fetch path: a plain Node fetch() ─────────────────────────────────────────────────
// Dispatch #83: the full header set the owner's working curl sent. No credentials:'include'
// (auth is the explicit X-Auth-Token header, same as every other reporting-API pull, not a
// session cookie).
// Exported so scripts/probe-security-token-identity.mjs can exercise this EXACT path -- headers
// included -- rather than a copy of it. Every reproduction of the pull's request built by hand has
// returned 200 while the pull returns 403, so the remaining difference has to be something a
// hand-copy does not reproduce. The only way to rule that out is to call this function itself.
export async function fetchOne(storeRef, eventToken, date, token) {
  const url = buildUrl(storeRef);
  const body = buildBody(eventToken, date);
  // ⚠️ ONE-SHOT WIRE DUMP. Measured 2026-08-23: this exact function returns 200 when called from
  // scripts/probe-security-token-identity.mjs and 403 when called from this script's own loop --
  // same machine, same shell, seconds apart, with all three arguments verified identical by
  // computation. That is impossible unless something differs that reading the source cannot show.
  // So stop reading and print what actually goes out. Fires once per process; token is a HASH and
  // a length, never a value.
  if (!globalThis.__secDumped) {
    globalThis.__secDumped = true;
    const tf = createHash('sha256').update(String(token)).digest('hex').slice(0, 12);
    let age = null, ttl = null;
    try {
      const c = JSON.parse(Buffer.from(String(token).split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
      age = c.iat ? Math.round(Date.now() / 1000 - c.iat) : null;
      ttl = c.exp ? Math.round(c.exp - Date.now() / 1000) : null;
    } catch { /* unparseable -- the hash and length still identify it */ }
    console.log('[wire] url        :', url);
    console.log('[wire] storeRef   :', JSON.stringify(storeRef), 'typeof', typeof storeRef);
    console.log('[wire] eventToken :', JSON.stringify(eventToken), '| date', JSON.stringify(date), 'typeof', typeof date);
    console.log('[wire] body       :', JSON.stringify(body));
    console.log('[wire] token      : sha256', tf, '| len', String(token).length, '| age', age + 's', '| ttl', ttl + 's');
    console.log('[wire] token type :', typeof token, token && typeof token === 'object' ? '❗ NOT A STRING -- would serialise as [object Object]' : '');
  }
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'X-Auth-Token': token,
      'Content-Type': 'application/json',
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Connection': 'keep-alive',
      'Origin': 'https://v3.myqsrsoft.com',
      'Referer': REPORT_PAGE,
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-site',
      'User-Agent': UA,
      'sec-ch-ua': SEC_CH_UA,
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"macOS"',
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
}

// Resolves either a plain token string or the getFreshToken function itself, per unit of work --
// exactly as qsrsoft-ops-pull.mjs does. One forced re-mint-and-retry on a 401/403 before that
// unit is marked failed (no browser fallback exists to bubble up to any more -- see file header).
async function resolveToken(token, forceRemint) {
  return typeof token === 'function' ? await token({ forceRemint }) : token;
}

// Accumulates parsed (but still plaintext-crew/mgr) rows in memory across the whole run, rather
// than tokenizing/upserting per (store, date, token) -- tokenizeRows() already batches its RPC
// calls to one per DISTINCT name; doing that once at the end over the whole run's rows means far
// fewer round trips than the 216+ units this run makes, at estate-wide volumes the brief itself
// sized at "low tens of thousands of rows/day" (still trivial to hold in memory for one process).
// `stores`/`eventTokens` default to the full production sweep (main()'s call is unaffected) --
// overridable so dispatch #91's token-injection test (scripts/probe-security-token-identity.mjs
// Case F) can scope this to the ONE unit that has already failed (store 3708, one event_token)
// instead of re-running all 216 for a one-variable check. Exported so that test can call the
// pull's ACTUAL loop -- module-level state, sequencing, everything -- rather than a
// reconstruction of it (same reasoning as fetchOne()'s own export, see that function's comment).
export async function runSecurityEvents(token, dates, tracker, { stores = STORE_NSNS, eventTokens = EVENT_TOKENS } = {}) {
  const collected = [];
  const coveredStores = new Set();
  let loggedShapeThisRun = false;
  try {
    const idTok = await resolveToken(token, false);
    console.log(`[secevents-pull] IDENTITY ${identityFp(idTok)} — hash of sub + cognito:username.`
      + ' Compare with scripts/probe-security-token-identity.mjs run locally; a DIFFERENT value means'
      + ' the runner and your shell are authenticating as different QSRSoft accounts.');
  } catch (e) {
    console.log(`[secevents-pull] IDENTITY unavailable (${e.message})`);
  }

  for (const date of dates) {
    for (const nsn of stores) {
      const storeRef = storeRefFromLoc(String(nsn));
      const loc = String(nsn).padStart(7, '0');
      for (const eventToken of eventTokens) {
        const unit = `${date}:${loc}:${eventToken}`;
        try {
          const tok = await resolveToken(token, false);
          let result = await fetchOne(storeRef, eventToken, date, tok);
          // ⚠️ Re-mint on 401 ONLY. A 403 carrying AccessDeniedException is a PERMISSIONS
          // verdict on the identity, not an expiry -- a fresh token has the same `sub` and gets
          // the same answer, so re-minting cannot help and is not free.
          //
          // MEASURED 2026-08-23: the previous version re-minted on 403 too. Every one of 216
          // units 403'd with `explicit deny in an identity-based policy`, so it forced ~216
          // re-mints in under two minutes and Cognito began refusing InitiateAuth outright with
          // ForbiddenException. We throttled ourselves, and the tail of that run reported a
          // Cognito failure rather than the AccessDenied that was the actual finding -- the retry
          // did not just waste calls, it BURIED the diagnosis under a second, self-inflicted one.
          const isExpiryShaped = result.status === 401
            || (result.status === 403 && !/AccessDenied/i.test(String(result.diagHdrs?.['x-amzn-errortype'] || '')));
          if (isExpiryShaped) {
            console.log(`[secevents-pull] ${unit}: token rejected (${result.status}) — forcing a re-mint and retrying once`);
            const freshTok = await resolveToken(token, true);
            result = await fetchOne(storeRef, eventToken, date, freshTok);
          } else if (result.status === 403) {
            console.log(`[secevents-pull] ${unit}: 403 AccessDenied — an authorization verdict, NOT expiry; not re-minting`);
          }
          if (result.status === 401 || result.status === 403) {
            // Same diagnostic-before-throw discipline as every other pull here -- an API gateway
            // 403 nearly always carries a reason, and reading it is a MEASUREMENT, not a re-guess.
            const bodyPreview = result.rawText || (result.json ? JSON.stringify(result.json) : '') || '(empty)';
            const diag = Object.entries(result.diagHdrs || {}).map(([k, v]) => `${k}=${v}`).join(' · ');
            console.error(`[secevents-pull] ${unit}: ${result.status} body: ${bodyPreview.slice(0, 400)}`);
            if (diag) console.error(`[secevents-pull] ${unit}: ${result.status} headers: ${diag}`);
            // Unlike dispatch #81's version, there is no browser fallback left to bubble up to --
            // a 401/403 that survives one forced re-mint is just this unit's failure. The tracker's
            // "N/N unit(s) failed" + exit 1 behavior (kept from #81, see file header) is what makes
            // a total credential/endpoint failure loud, not an early bail-out mid-loop.
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

// ── Main ───────────────────────────────────────────────────────────────────────────────────
async function main() {
  if (!process.env.VITE_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[secevents-pull] Missing Supabase env'); process.exit(1);
  }
  // getFreshToken() needs these -- check upfront rather than failing 216 times to discover it.
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

  // Dispatch #83: wall-clock was never measured for this endpoint (#81's estimate was for the
  // now-deleted page.evaluate()-per-request design) and gates putting this on a daily schedule --
  // logged here so the first live run settles it instead of leaving it estimated.
  const t0 = Date.now();
  const result = await runSecurityEvents(getFreshToken, dates, tracker);
  console.log(`[secevents-pull] fetch phase: ${((Date.now() - t0) / 1000).toFixed(1)}s for ${requestedUnits.length} unit(s)`);

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
