#!/usr/bin/env node
// scripts/qsrsoft-punch-times-pull.mjs
// QSRSoft Actual Punch Times — real clock in/out punches (shift + meal), per employee per store.
// Dispatch #124 (memory/dispatch-124.md), built on memory/finding-qsrsoft-time-punches-endpoint-
// 2026-08-21.md's live capture. Companion to dispatch #123 (Crew Schedule Lookup, LifeLenz-side) —
// deliberately a SEPARATE pull script and SEPARATE table, no shared files.
//
// 🔴 THIS ENDPOINT CAN RETURN SOCIAL SECURITY NUMBERS. The finding's capture had `ssn` in
// selectCols and the response carried a full 9-digit SSN + full legal name for every employee.
// That capture was never recorded anywhere, on purpose. This script:
//   1. NEVER puts ssn in SELECT_COLS below — solved entirely at the request, not by fetch-then-
//      drop.
//   2. NEVER persists an SSN — not Supabase, not a log line, not a test fixture.
//   3. Runs assertNoDeniedSelectCols() at import time (mirrors qsrsoft-employee-roster-pull.mjs's
//      own guard for the sibling employee-roster endpoint) — fails loudly if a future edit ever
//      widens SELECT_COLS to include ssn or another denied field.
//   4. NEVER requests a name field either, even though the endpoint apparently supports one (the
//      finding's capture had a name alongside the ssn) — geid is the safe, stable person key, and
//      not asking for a name in the first place is strictly safer than fetching-then-tokenizing
//      it. See the identity-resolution comment below for how emp_token still gets populated.
//
// Endpoint (confirmed 2026-08-21, finding's live capture — same /reporting/v2/people/ path family
// as employee-roster, and ONE STORE PER CALL, unlike the /data_layer/v1/service/ endpoints that
// take all 27 stores in a single comma-separated `nsn`):
//   GET https://api.reports.myqsrsoft.com/reporting/v2/people/time-punches-matched
//       ?catalogType=timePunchesMatched&nsd=d&nsn=<single NSN>&orgId=<org>
//       &startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&selectCols=<allowlist>
//   Referer (from the finding's capture): https://v3.myqsrsoft.com/reports/mcd/people/punch-extract
//
// RUNTIME BUDGET (per the dispatch's explicit instruction — one-store-per-call changes the math
// vs. every other QSRSoft pull in this repo, which take all 27 stores in one call):
//   requests per run ≈ STORE_NSNS.length × ceil(windowDays / MAX_CHUNK_DAYS)
//   Daily rolling pull (DAYS_RECENT=4, one chunk): 27 requests.
//   Cold-start backfill (DAYS_BACK=90, MAX_CHUNK_DAYS=14 → 7 chunks): up to 189 requests, spread
//   over the run with a 150ms delay between calls (~30-60s of actual pull time plus network
//   latency — well inside the workflow's 30-minute timeout). A wider manual backfill via
//   QSRSOFT_PUNCH_START_DATE/END_DATE scales linearly with the same per-store-per-chunk shape;
//   run it in date-range chunks (the same way other pulls' *_START_DATE/*_END_DATE knobs are
//   used for large backfills) rather than one enormous window.
//
// 🟡 UNCONFIRMED: whether one call accepts a multi-day startDate/endDate range (the finding's own
// capture used startDate=endDate, a single day) or requires day-granularity calls. Assumed here to
// accept a range, matching every other /reporting/v2/people/ and /reports/mcd/ endpoint in this
// repo (employee-roster pulls a whole month in one call; register-audit chunks 21-day windows) —
// if a live run proves this wrong (e.g. a chunk silently returns only its first day), the fix is
// MAX_CHUNK_DAYS=1, a one-line env override, not a rewrite.
//
// 🟡 BUSINESS-DAY BOUNDARY — NOT CONFIRMED, and this table is deliberately designed around that
// uncertainty rather than guessing. No `compType` parameter is documented on this endpoint (unlike
// the DAR, which is confirmed 4am-aligned via `compType=trading`), and this sandbox has no
// QSRSoft credentials to pull a live sample and check real punch timestamps directly. So:
//   - start_date_time / end_date_time below are stored as the RAW timestamp the API returns —
//     full date+time, no separate `dt` bucket column, and NO business-day derivation applied at
//     ingest. A `dt` column would force a choice (calendar day vs. businessDate()) this script
//     cannot verify, and CLAUDE.md's own standing rule is explicit that a boundary mismatch is
//     worse than an admitted unknown.
//   - Any future consumer that needs day-bucketed punches must call businessDate()/
//     lastClosedBusinessDay() (src/utils/date.js) or bucket by calendar day EXPLICITLY, as a
//     conscious choice at query time — never assume this table already made that call.
//   - The finding's own one-day sample (punches 04:00/04:01/04:15 → 23:50) is CONSISTENT with the
//     4am business day but does not prove it (it's equally consistent with the plain calendar day,
//     since no punch in that sample crossed midnight). Confirming this needs either live QSRSoft
//     credentials (not available in this environment) or a cross-reference against DAR data for
//     the same store/day once real punch rows exist in this table — left as an explicit open item,
//     not assumed either way.
//
// 🎯 IDENTITY RESOLUTION (geid vs. audit_rows.emp_id vs. employee_name/emp_token) — resolved,
// not guessed. Independently measured in this session against LIVE production data (not just the
// finding's one-store-one-day sample):
//   node -e queried qsr_employee_tenure.geid (1000 rows, populated by the employee-roster pull —
//   SAME /reporting/v2/people/ endpoint family as this one) against audit_rows.emp_id (1000 rows,
//   populated by the Register Audit pull), via the service-role credential, both tables read with
//   real content-range (not */0). Digit-length band ranges:
//     6-digit:  geid 361,676–841,908       emp_id 361,691–841,908        — near-identical
//     7-digit:  geid 1,462,646–7,913,417   emp_id 4,171,116–7,902,187    — emp_id ⊂ geid range
//     8-digit:  geid 12,188,709–26,265,427 emp_id 12,188,709–26,263,054  — near-identical
//     9-digit:  geid 200,093,393–200,596,080 emp_id 200,123,701–200,566,188 — emp_id ⊂ geid range
//   audit_rows.emp_id ALSO had 173/1000 rows at length 1, value 0 — exactly the finding's own
//   documented '0' sentinel ("not a short geid, a placeholder where no geid was captured"), not a
//   contradiction. This CONFIRMS, on live data far broader than the finding's one-store-one-day
//   sample, that geid and audit_rows.emp_id are the same identifier space.
//
// 🔓 DISPATCH #126 (2026-08-25) — un-tokenization. Owner, directly, after this pull shipped
// tokenized: "there is no reason to hide names for scheduling and punch times > everyone can see
// this data as-is." This is a POLICY reversal only — the resolution PATH is unchanged and does
// NOT touch the risky endpoint (people/time-punches-matched) or its SELECT_COLS/DENIED_SELECT_COLS
// guard at all:
//   geid → look up qsr_employee_tenure (loc, geid) → full_employee_name (already populated,
//          owner-approved storage, dispatch #57) → stored DIRECTLY as qsr_punch_times.employee_name.
// employee_name is NULLABLE — a geid with no matching qsr_employee_tenure row (e.g. an employee
// who separated before ever appearing in an active-only roster pull) has no name to resolve and
// gets employee_name=null; geid itself is never null and remains the reliable fallback join key.
//
// emp_token KEPT (not dropped), additive alongside employee_name — dispatch #126 explicitly left
// this a documented choice, no wrong answer. Reasoning: it costs nothing extra (same tenure-name
// lookup already fetched to populate employee_name; getOrCreateToken() is only called once per
// DISTINCT resolved name, exactly as before), it is harmless to leave populated, and it keeps a
// stable join key available in case a future consumer wants to cross-reference this table against
// another name-keyed vault entry (e.g. dispatch #125's LifeLenz-side data, if that side also keeps
// emp_token) without a fragile exact-string name match across two independently-formatted sources.
// ⚠️ KNOWN LIMITATION, stated plainly rather than silently assumed away: emp_token here only
// matches dispatch #125's LifeLenz-side token for the SAME person if the two systems spell that
// employee's name identically after btrim() (get_or_create_employee_token's own normalization —
// exact string match, not fuzzy). Not verified — a QSRSoft "Last, First" vs. a LifeLenz
// "First Last" would silently produce two different tokens for the same person. employee_name (and
// geid, which IS independently confirmed as a stable space) are the fields to rely on directly;
// treat cross-source emp_token equality as unverified until checked.
//
// Required env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Auth — tried in order (matches every other QSRSoft pull in this repo, post-#312):
//   getFreshToken()    — mints a Cognito ID token per run (scripts/lib/qsrsoft-auth.mjs)
//   QSRSOFT_USERNAME + QSRSOFT_PASSWORD — Playwright fallback (also required for getFreshToken)
// Optional:
//   QSRSOFT_PUNCH_DAYS_BACK    — first-run history (default 90)
//   QSRSOFT_PUNCH_DAYS_RECENT  — rolling re-pull window (default 4)
//   QSRSOFT_PUNCH_START_DATE / QSRSOFT_PUNCH_END_DATE — explicit backfill window
//   QSRSOFT_PUNCH_STORES       — subset of NSNs, comma-separated (default: all 27)
//   QSRSOFT_PUNCH_DEBUG        — '1' for verbose logging
//
// Manual-upload fallback: deliberately NOT built. Per CLAUDE.md's "keep a manual fallback"
// checklist item, considered and skipped — this is closer to Register Audit (an automated,
// employee-attributed pull with no plausible manual-Excel equivalent QSRSoft exposes to a
// franchisee) than to a P&L/report upload. Nobody manually re-keys individual clock punches from
// a spreadsheet, and QSRSoft doesn't export this report as a franchisee-facing download the way it
// does Ops/FOB reports. Same reasoning register-audit-pull.mjs's own header gives for skipping it.

import { createClient } from '@supabase/supabase-js';
import { withRetry } from './_retry.mjs';
import { makeOutcomeTracker } from './lib/pull-outcome.mjs';
import { logPartitionCoverage, checkFreshness } from './_pipeline-contract.mjs';
import { getFreshToken } from './lib/qsrsoft-auth.mjs';
import { getOrCreateToken } from '../src/engine/identity-vault.js';

const BASE   = 'https://api.reports.myqsrsoft.com';
const ORG_ID = 'a546d4ef-684a-4f25-8bc0-6580af068875';
const REPORT_URL = 'https://v3.myqsrsoft.com/reports/mcd/people/punch-extract'; // from the finding's own capture

const STORE_NSNS = (process.env.QSRSOFT_PUNCH_STORES
  ? process.env.QSRSOFT_PUNCH_STORES.split(',').map(s => s.trim())
  : [
    3708, 5183, 5985, 6178, 6838, 6972, 10034, 10422, 10915, 11657, 13113, 18213,
    20475, 24471, 29760, 31357, 32525, 33109, 33222, 33704, 34222, 35064, 35242,
    37566, 38609, 43380, 43701,
  ]).map(String);
const STORE_LOCS = STORE_NSNS.map(n => String(n).padStart(7, '0'));

const DAYS_BACK      = parseInt(process.env.QSRSOFT_PUNCH_DAYS_BACK   || '90', 10);
const DAYS_RECENT    = parseInt(process.env.QSRSOFT_PUNCH_DAYS_RECENT || '4',  10);
const START_DATE     = (process.env.QSRSOFT_PUNCH_START_DATE || '').trim();
const END_DATE       = (process.env.QSRSOFT_PUNCH_END_DATE   || '').trim();
const DEBUG          = process.env.QSRSOFT_PUNCH_DEBUG === '1';
const MAX_CHUNK_DAYS = parseInt(process.env.QSRSOFT_PUNCH_MAX_CHUNK_DAYS || '14', 10);

// ── The allowlist, hard-coded and reviewable (dispatch #124 rule 2) ─────────────────────────────
// Every field this script asks QSRSoft for, and nothing else. No ssn, no name, no timeCardNumber
// (finding: "often null; not a reliable key" — excluded from the table, not just unrequested).
export const SELECT_COLS = [
  'geid', 'storeNum', 'punchType', 'isPaidBreak', 'startDateTime', 'endDateTime',
  'inModified', 'outModified', 'jobTitleCode', 'badgeType',
];

// Denylist mirrors qsrsoft-employee-roster-pull.mjs's DENIED_SELECT_COLS for the sibling
// employee-roster endpoint, PLUS name-field variants — this finding's own capture proved a name
// field exists on THIS endpoint (present alongside ssn in the captured request), so the guard has
// to catch it specifically, not just assume the roster list covers it. Case-insensitive substring
// match so a near-variant is still caught.
const DENIED_SELECT_COLS = [
  'ssn', 'socialsecuritynumber', 'dateofbirth', 'birthday', 'dob',
  'nationalorigin', 'race', 'gender', 'sex', 'federalmaritalstatus', 'maritalstatus',
  'address', 'streetaddress', 'city', 'zipcode', 'postalcode',
  'emailaddress', 'email', 'phone', 'mobilephone', 'homephone', 'emergencycontact',
  'name', 'employeename', 'fullemployeename', 'firstname', 'lastname', 'legalname',
];
export function assertNoDeniedSelectCols(cols = SELECT_COLS) {
  const lower = cols.map(c => String(c).toLowerCase());
  const hits = lower.filter(c => DENIED_SELECT_COLS.some(denied => c.includes(denied)));
  if (hits.length) {
    throw new Error(
      `[punch-times] SELECT_COLS widened to include a denied PII field: ${hits.join(', ')}. ` +
      `See memory/finding-qsrsoft-time-punches-endpoint-2026-08-21.md and memory/dispatch-124.md ` +
      `— this fails loudly on purpose, do not remove.`
    );
  }
}
assertNoDeniedSelectCols();

function fmtDate(d) { return d.toISOString().slice(0, 10); }
function addDay(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
const nsn7 = n => String(n).padStart(7, '0');

function chunkDateRange(startDate, endDate, maxDays = MAX_CHUNK_DAYS) {
  const chunks = [];
  let cur = new Date(startDate + 'T12:00:00Z');
  const end = new Date(endDate + 'T12:00:00Z');
  while (cur <= end) {
    const chunkEndCandidate = addDay(cur, maxDays - 1);
    const chunkEnd = chunkEndCandidate > end ? end : chunkEndCandidate;
    chunks.push({ start: fmtDate(cur), end: fmtDate(chunkEnd) });
    cur = addDay(chunkEnd, 1);
  }
  return chunks;
}

function buildUrl(nsn, startDate, endDate) {
  const params = new URLSearchParams({
    catalogType: 'timePunchesMatched', nsd: 'd', nsn: String(nsn), orgId: ORG_ID,
    enterpriseName: 'McDonalds', startDate, endDate, weekStart: '3',
    selectCols: SELECT_COLS.join(','),
  });
  return `${BASE}/reporting/v2/people/time-punches-matched?${params}`;
}

// Same three-shape envelope every other /reporting/v2/ or /reports/mcd/ endpoint in this repo has
// turned out to use (bare array, {result:[...]}, {result:{resp:[...]}}, {resp:[...]}) — see
// qsrsoft-employee-roster-pull.mjs's extractRows() and qsrsoft-register-audit-pull.mjs's own
// three-guess history for why this stays defensive rather than assuming one shape. Logs the SHAPE
// only on a miss, never row values — this payload is employee-attributed.
export function extractRows(body, unit) {
  if (Array.isArray(body)) return body;
  const rows = body?.result?.resp || body?.resp || body?.result || body?.data;
  if (Array.isArray(rows)) return rows;
  if (body && typeof body === 'object') {
    const shape = Object.entries(body).map(([k, v]) =>
      Array.isArray(v) ? `${k}[${v.length}]` : `${k}:${v === null ? 'null' : typeof v}`).join(' ');
    console.error(`[punch-pull] ${unit}: unrecognized envelope -- top-level shape: {${shape}}`);
  } else {
    console.error(`[punch-pull] ${unit}: unrecognized body type: ${typeof body}`);
  }
  return [];
}

// Response row → the shape saveRows() below expects. No supabase/fetch dependency — unit-testable
// directly. `badgeType`/`punchType` are passed through as raw strings, NEVER matched against a
// hardcoded enum (`=== 'Primary'`/`=== 'shift'`) — the finding's own sample saw only one badgeType
// value and warns other values presumably exist; an unrecognized value must still save, not drop.
export function mapRow(r) {
  const bit = v => (v == null || v === '') ? null : (Number(v) ? true : false);
  return {
    loc:            nsn7(r.storeNum),
    geid:           (r.geid == null ? '' : String(r.geid).trim()) || null,
    punchType:      r.punchType ?? null,
    isPaidBreak:    bit(r.isPaidBreak),
    startDateTime:  r.startDateTime || null,
    endDateTime:    r.endDateTime || null,
    inModified:     bit(r.inModified),
    outModified:    bit(r.outModified),
    jobTitleCode:   r.jobTitleCode ?? null,
    badgeType:      r.badgeType ?? null,
  };
}

// Guarded, not unconditional — mirrors qsrsoft-register-audit-pull.mjs / qsrsoft-employee-roster-
// pull.mjs's own reasoning: mapRow()/extractRows() are unit-tested by importing this module
// directly, and vitest's environment has neither env var set.
const supabase = (process.env.VITE_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
  ? createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null;

// ── Identity resolution: geid → qsr_employee_tenure.full_employee_name → {employee_name,
// emp_token} ─────────────────────────────────────────────────────────────────────────────────
// See the file header's "IDENTITY RESOLUTION" comment for dispatch #126's full reasoning.
// Batches ONE query per DISTINCT (loc, geid) pair in this batch (not per row), then ONE
// getOrCreateToken() RPC call per distinct name resolved — same "batch by distinct entity, not by
// row" discipline identity-vault.js's tokenizeRows() already uses. employee_name is now the
// primary result; emp_token is kept alongside it (dispatch #126, documented choice — see header).
export async function resolveEmployeeIdentity(supabaseClient, rows) {
  const map = new Map(); // `${loc}|${geid}` -> { employeeName, empToken } (either may be null; absent = no tenure row)
  const pairs = [...new Set(rows.filter(r => r.loc && r.geid).map(r => `${r.loc}|${r.geid}`))];
  if (!supabaseClient || !pairs.length) return map;

  const locs = [...new Set(pairs.map(p => p.split('|')[0]))];
  const geids = [...new Set(pairs.map(p => p.split('|')[1]))];
  const { data, error } = await supabaseClient
    .from('qsr_employee_tenure')
    .select('loc,geid,full_employee_name')
    .in('loc', locs)
    .in('geid', geids);
  if (error) {
    console.warn('[punch-pull] qsr_employee_tenure lookup failed (employee_name/emp_token will stay null this run):', error.message);
    return map;
  }

  const nameFor = new Map((data || []).map(t => [`${t.loc}|${t.geid}`, t.full_employee_name]));
  const tokenCache = new Map(); // name -> token, so a name shared by two geids costs one RPC call
  for (const pair of pairs) {
    const name = (nameFor.get(pair) || '').trim();
    if (!name) continue; // no tenure record for this geid -- employee_name/emp_token stay null, geid is the fallback key
    if (!tokenCache.has(name)) {
      tokenCache.set(name, await getOrCreateToken(supabaseClient, name));
    }
    map.set(pair, { employeeName: name, empToken: tokenCache.get(name) || null });
  }
  return map;
}

async function saveRows(rows) {
  if (!rows.length) return 0;
  const identityMap = await resolveEmployeeIdentity(supabase, rows);
  const upsert = rows
    .filter(r => r.loc && r.geid && r.startDateTime) // punch_type/start_date_time/geid/loc form the PK -- see schema comment
    .map(r => {
      const identity = identityMap.get(`${r.loc}|${r.geid}`);
      return {
        loc:              r.loc,
        geid:             r.geid,
        employee_name:    identity?.employeeName ?? null,
        emp_token:        identity?.empToken ?? null,
        punch_type:       r.punchType,
        is_paid_break:    r.isPaidBreak,
        start_date_time:  r.startDateTime,
        end_date_time:    r.endDateTime,
        in_modified:      r.inModified,
        out_modified:     r.outModified,
        job_title_code:   r.jobTitleCode,
        badge_type:       r.badgeType,
        updated_at:       new Date().toISOString(),
      };
    });
  const CHUNK = 500;
  let saved = 0;
  for (let i = 0; i < upsert.length; i += CHUNK) {
    const batch = upsert.slice(i, i + CHUNK);
    const { error } = await withRetry(
      () => supabase.from('qsr_punch_times').upsert(batch, { onConflict: 'tenant_id,loc,geid,punch_type,start_date_time' }),
      { label: 'qsr_punch_times upsert' });
    if (error) throw error;
    saved += batch.length;
  }
  return saved;
}

// ── Gap detection (mirrors every other QSRSoft pull in this repo) ──────────────────────────────
async function getLatestDate() {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('qsr_punch_times').select('start_date_time')
    .order('start_date_time', { ascending: false }).limit(1).single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`[punch-pull] getLatestDate() read failed -- ${error.code}: ${error.message}`);
  }
  return data?.start_date_time ? new Date(data.start_date_time) : null;
}

async function getDateRange() {
  const today = new Date();
  if (START_DATE) {
    const e = END_DATE || fmtDate(today);
    console.log(`[punch-pull] explicit backfill window ${START_DATE} → ${e}`);
    return { startDate: START_DATE, endDate: e, latestForFreshness: await getLatestDate() };
  }
  const latest = await getLatestDate();
  const daysSince = latest ? Math.floor((today - latest) / 86400000) : DAYS_BACK;
  const back = Math.min(Math.max(DAYS_RECENT, daysSince + DAYS_RECENT), DAYS_BACK);
  const s = fmtDate(addDay(today, -back));
  console.log(latest
    ? `[punch-pull] latest in DB: ${fmtDate(latest)} (${daysSince}d ago) — pulling ${back} days back`
    : `[punch-pull] no existing data — pulling ${back} days of history`);
  return { startDate: s, endDate: fmtDate(today), latestForFreshness: latest };
}

// ── Fetch (direct or Playwright in-browser) — same X-Auth-Token pattern as employee-roster-pull,
// the confirmed-working sibling endpoint in this SAME /reporting/v2/people/ family ─────────────
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36';

async function fetchDirect(token, nsn, startDate, endDate) {
  const url = buildUrl(nsn, startDate, endDate);
  if (DEBUG) console.log(`[punch-pull] GET ${url.slice(0, 150)}…`);
  const resp = await fetch(url, {
    headers: { 'X-Auth-Token': token, 'Accept': 'application/json', 'Origin': 'https://v3.myqsrsoft.com', 'Referer': REPORT_URL, 'User-Agent': UA },
  });
  if (resp.status === 401 || resp.status === 403) throw new Error(`AUTH_FAILED:${resp.status}`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${(await resp.text().catch(() => '')).slice(0, 200)}`);
  return extractRows(await resp.json(), `${nsn}:${startDate}..${endDate}`);
}

async function resolveToken(token, forceRemint) {
  return typeof token === 'function' ? await token({ forceRemint }) : token;
}

async function runDirect(token, chunks, tracker, coveredStores) {
  let total = 0;
  for (const nsn of STORE_NSNS) {
    for (const chunk of chunks) {
      const unit = `${nsn}:${chunk.start}..${chunk.end}`;
      try {
        const tok = await resolveToken(token, false);
        let rows;
        try {
          rows = await fetchDirect(tok, nsn, chunk.start, chunk.end);
        } catch (e) {
          if (String(e.message).startsWith('AUTH_FAILED') && typeof token === 'function') {
            console.log(`[punch-pull] ${unit}: cached token rejected — forcing a re-mint and retrying once`);
            const freshTok = await resolveToken(token, true);
            rows = await fetchDirect(freshTok, nsn, chunk.start, chunk.end);
          } else throw e;
        }
        if (!rows.length) { console.log(`[punch-pull] ${unit}: 0 rows`); continue; }
        const mapped = rows.map(mapRow).filter(r => r.loc && r.geid);
        const dropped = rows.length - mapped.length;
        if (dropped) console.log(`[punch-pull] ${unit}: ${dropped}/${rows.length} row(s) dropped (missing geid/loc)`);
        const n = await saveRows(mapped);
        total += n;
        if (n) coveredStores.add(nsn7(nsn));
        console.log(`[punch-pull] ${unit}: ${rows.length} rows → ${n} saved`);
      } catch (e) {
        if (String(e.message).startsWith('AUTH_FAILED')) throw e; // bubble up for Playwright fallback
        console.error(`[punch-pull] ${unit} ERROR: ${e.message}`);
        tracker.fail(unit, e.message);
      }
      await new Promise(r => setTimeout(r, 150));
    }
  }
  return total;
}

// ── Path B: Playwright ──────────────────────────────────────────────────────────────────────────
async function viaPlaywright(chunks, tracker, coveredStores) {
  const u = process.env.QSRSOFT_USERNAME, pw = process.env.QSRSOFT_PASSWORD;
  if (!u || !pw) { console.error('[auth] no QSRSOFT_USERNAME/PASSWORD — cannot use Playwright fallback'); return null; }
  const { chromium } = await import('playwright');
  const { mkdirSync } = await import('node:fs');
  try { mkdirSync('screenshots', { recursive: true }); } catch {}
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ userAgent: UA })).newPage();
  page.setDefaultTimeout(180000);
  const snap = name => page.screenshot({ path: `screenshots/${name}`, fullPage: true }).catch(() => {});
  const wait = ms => new Promise(r => setTimeout(r, ms));

  let token = null;
  page.on('request', req => {
    if (!req.url().includes('api.reports.myqsrsoft.com')) return;
    const t = req.headers()['x-auth-token'];
    if (t && t.length > 20 && !token) token = t;
  });

  try {
    console.log('[auth] navigating to v3.myqsrsoft.com…');
    await page.goto('https://v3.myqsrsoft.com', { waitUntil: 'networkidle', timeout: 45000 });
    const userSel = ['input[name="username"]', 'input[name="email"]', 'input[type="email"]', '#username', '#email', 'input[autocomplete="username"]'].join(', ');
    const found = await page.waitForSelector(userSel, { timeout: 20000 }).then(() => true).catch(() => false);
    if (found) {
      await page.fill(userSel, u);
      await page.fill('input[type="password"], input[name="password"]', pw);
      await page.click('button[type="submit"], input[type="submit"], .btn-primary, button:has-text("Login"), button:has-text("Sign in")');
      await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    }
    await snap('punch-01-post-login.png');
    console.log('[auth] post-login url:', page.url());

    await page.goto(REPORT_URL, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
    await wait(3000);
    await snap('punch-02-report.png');
    console.log('[auth] report url:', page.url(), '| token captured:', !!token);

    if (!token) { console.error('[auth] ✗ could not capture a punch-times token'); await snap('punch-error.png'); return null; }
    console.log(`[auth] ✓ token captured (${token.length} chars) — pulling ${STORE_NSNS.length} stores × ${chunks.length} chunk(s)…`);

    let totalSaved = 0;
    for (const nsn of STORE_NSNS) {
      for (const chunk of chunks) {
        const unit = `${nsn}:${chunk.start}..${chunk.end}`;
        const result = await page.evaluate(async ({ url, tok }) => {
          try {
            const r = await fetch(url, { headers: { 'X-Auth-Token': tok, 'Accept': 'application/json', 'Origin': 'https://v3.myqsrsoft.com' }, signal: AbortSignal.timeout(20000) });
            if (!r.ok) return { error: `HTTP ${r.status}` };
            return { body: await r.json() };
          } catch (e) { return { error: e.message }; }
        }, { url: buildUrl(nsn, chunk.start, chunk.end), tok: token });

        if (result.error) {
          console.error(`[punch-pull] ${unit} ERROR: ${result.error}`);
          tracker.fail(unit, result.error);
        } else {
          const rows = extractRows(result.body, unit);
          if (!rows.length) { console.log(`[punch-pull] ${unit}: 0 rows`); }
          else {
            const mapped = rows.map(mapRow).filter(r => r.loc && r.geid);
            const n = await saveRows(mapped);
            totalSaved += n;
            if (n) coveredStores.add(nsn7(nsn));
            console.log(`[punch-pull] ${unit}: ${rows.length} rows → ${n} saved`);
          }
        }
        await wait(100);
      }
    }
    await snap('punch-final.png');
    return totalSaved;
  } catch (e) {
    console.error('[auth] Playwright error:', e.message);
    await snap('punch-error.png');
    return null;
  } finally {
    await browser.close();
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────────────────────
async function main() {
  if (!process.env.VITE_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[punch-pull] Missing Supabase env'); process.exit(1);
  }

  const { startDate, endDate, latestForFreshness } = await getDateRange();
  const fresh = checkFreshness(latestForFreshness, { warnAfterHours: 30, errorAfterHours: 54, label: 'punch-pull' });
  if (fresh.message) (fresh.status === 'error' ? console.error : console.warn)(fresh.message);

  const chunks = chunkDateRange(startDate, endDate, MAX_CHUNK_DAYS);
  console.log(`[punch-pull] ${STORE_NSNS.length} store(s) × ${chunks.length} chunk(s): ${startDate} → ${endDate} (~${STORE_NSNS.length * chunks.length} requests)`);

  const tracker = makeOutcomeTracker('punch-pull');
  const coveredStores = new Set();
  const requestedUnits = STORE_NSNS.flatMap(nsn => chunks.map(c => `${nsn}:${c.start}..${c.end}`));

  let totalSaved = 0;
  try {
    totalSaved = await runDirect(getFreshToken, chunks, tracker, coveredStores);
  } catch (e) {
    console.log(`[auth] mint-and-fetch failed (${e.message}) — falling back to Playwright`);
    totalSaved = await viaPlaywright(chunks, tracker, coveredStores) || 0;
  }

  console.log(`[punch-pull] done — ${totalSaved} rows saved.`);
  logPartitionCoverage(coveredStores, STORE_LOCS, { label: 'punch-pull', kind: 'store' });
  const code = tracker.finalize({
    requestedUnits, totalSaved,
    formatRerun: () => `QSRSOFT_PUNCH_START_DATE=${startDate} QSRSOFT_PUNCH_END_DATE=${endDate}`,
  });
  process.exit(code);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => { console.error('[punch-pull] FATAL:', e); process.exit(1); });
}
