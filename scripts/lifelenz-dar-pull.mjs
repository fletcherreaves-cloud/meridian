#!/usr/bin/env node
// scripts/lifelenz-dar-pull.mjs — LifeLenz's own hourly Daily Activity Report pull (task:
// "let's get the dar from lifelenz and wire it in to pull... hourly for now at say about 5
// minutes after each hour completed"), standing in for QSRSoft's own DAR pull while that one is
// paused for compliance reasons (memory/finding-qsrsoft-security-notice-2026-11-16.md).
//
// Real schema confirmed live via 4 rounds of GraphQL introspection against darData
// (scripts/lifelenz-dar-probe.mjs, 2026-11-17) — see supabase/schema-lifelenz-dar.sql's header
// for the full DarData/Dar/FieldValue shape and the real fieldCode list, and
// memory/finding-lifelenz-dar-schema-2026-11-17.md for the discovery writeup. This is the
// REAL production pull built from that confirmed shape — not the discovery probe, which stays
// workflow_dispatch-only and read-only.
//
// Auth: same two-path pattern as every other LifeLenz pull (static LIFELENZ_TOKEN validated
// first, falls back to a direct REST SignIn GraphQL mutation on a session-expired signal — see
// lifelenz-pull.mjs's reauth()/getAuthTokenDirect(), ported verbatim here and in the probe).
//
// Window strategy: each run re-pulls the last LOOKBACK_HOURS hours (default 6), ending at the
// most recently COMPLETED hour (never the current in-progress one, whose actuals are still
// accumulating — same "don't trust a partial bucket" caution the probe used for date selection).
// Upserting the same trailing window on every run is deliberate self-healing: an hour that came
// back with missingActuals=true because this ran too soon gets corrected by the next run once
// LifeLenz has settled it, without needing a separate backfill pass. LIFELENZ_DAR_START/
// LIFELENZ_DAR_END (ISO datetimes) override the window entirely for a manual backfill.
//
// Scope note (see supabase/schema-lifelenz-dar.sql's table comment): this pull writes
// lifelenz_dar and is watched by sync-failure-watch.yml, but the app does not read it yet —
// wiring into stream-freshness.js/metric-source.js/App.js's ds is a deliberate follow-on,
// pending a second live measurement against a Florida (Eastern-time) store schedule to confirm
// whether LifeLenz buckets darData's hourly intervals in each store's own local timezone.
//
// Required env vars: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, LIFELENZ_TOKEN
// Optional: LIFELENZ_USERNAME/LIFELENZ_PASSWORD (SignIn fallback), LIFELENZ_DAR_LOOKBACK_HOURS
// (default 6), LIFELENZ_DAR_START/LIFELENZ_DAR_END (ISO datetime override), LIFELENZ_DEBUG.

import { safeCreateClient } from './lib/safe-supabase-client.mjs';
import { makeOutcomeTracker } from './lib/pull-outcome.mjs';
import { logPartitionCoverage, checkFreshness } from './_pipeline-contract.mjs';

const BASE        = 'https://us01-connect.lifelenz.com';
const IDM_BASE     = 'https://idm.lifelenz.com';
const BUSINESS_ID  = '01979dbf-a166-759b-8702-aba9915c578e';
const GQL_URL      = `${BASE}/manager/graphql`;
const DEBUG        = process.env.LIFELENZ_DEBUG === '1';
const LOOKBACK_HOURS = parseInt(process.env.LIFELENZ_DAR_LOOKBACK_HOURS || '6', 10);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';

const supabase = safeCreateClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// Real fieldCodes confirmed live (run 44181293382, store 0003708, 2026-11-17) — see
// supabase/schema-lifelenz-dar.sql's header. Order here drives the GraphQL `data { ... }`
// selection is unnecessary (darData returns the full FieldValue list regardless of a selection
// set on fieldCode's own value — we just select `fieldCode value` on every element), but this
// list IS the authoritative column map for row-shaping below.
const FIELD_CODES = [
  'net_sales', 'transactions', 'total_transactions_variation',
  'drive_through_transactions_variation', 'window_transactions_variation',
  'sandwiches', 'sandwich_count_variation', 'avg_dt_service_time', 'avg_fc_service_time',
  'avg_mfy_service_time', 'actual_punch_hours', 'total_hours_diff',
  'total_hours_ideal_variation', 'transactions_per_punch_hour', 'sales_per_punch_hour',
  'labour_percentage_of_sales',
];

function apiHeaders(token, scheduleId = null) {
  const h = {
    'X-Auth-Token':      token,
    'X-Business-Id':     BUSINESS_ID,
    'X-Lifelenz-Device': 'webadmin',
    'X-Version':         '1.78.11',
    'Accept':            'application/json',
    'Content-Type':      'application/json',
  };
  if (scheduleId) h['X-Schedule-Id'] = scheduleId;
  return h;
}

function isSessionExpired(status, body) {
  if (status === 401 || status === 403 || status === 422) return true;
  const b = (body || '').toLowerCase();
  return b.includes('invalid_session_error') || b.includes('sign in again');
}

// Same direct REST login lifelenz-pull.mjs's reauth() / the probe's getAuthTokenDirect() use —
// a GraphQL SignIn mutation against idm.lifelenz.com, no Playwright needed.
async function getAuthTokenDirect() {
  const u = process.env.LIFELENZ_USERNAME;
  const p = process.env.LIFELENZ_PASSWORD;
  const query = `mutation SignIn($username: String!, $credential: String!) {
    signIn(email: $username, credential: $credential) { authToken }
  }`;
  const credential = Buffer.from(p || '', 'utf8').toString('base64');
  const r = await fetch(`${IDM_BASE}/external/graphql?SignIn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': UA, 'Accept': '*/*', 'X-Lifelenz-Device': 'webadmin', 'X-Version': '1.78.11' },
    body: JSON.stringify({ operationName: 'SignIn', variables: { username: u, credential }, query }),
  });
  const data = await r.json().catch(() => null);
  if (data?.errors) { console.warn('[auth-direct] SignIn error:', JSON.stringify(data.errors).slice(0, 300)); return null; }
  return data?.data?.signIn?.authToken || null;
}

async function resolveToken() {
  let token = process.env.LIFELENZ_TOKEN || null;
  if (token) {
    const check = await fetch(`${BASE}/api/admin/businesses/${BUSINESS_ID}/schedules`, { headers: apiHeaders(token) });
    if (!check.ok) {
      const body = await check.text().catch(() => '');
      if (isSessionExpired(check.status, body)) {
        console.warn('[auth] LIFELENZ_TOKEN rejected, falling back to SignIn mutation');
        token = null;
      }
    }
  }
  if (!token) token = await getAuthTokenDirect();
  if (!token) throw new Error('Could not resolve a LifeLenz auth token via LIFELENZ_TOKEN or LIFELENZ_USERNAME/PASSWORD SignIn.');
  return token;
}

async function gql(token, scheduleId, operationName, query, variables) {
  const resp = await fetch(`${GQL_URL}?${operationName}`, {
    method: 'POST',
    headers: apiHeaders(token, scheduleId),
    body: JSON.stringify({ operationName, query, variables }),
  });
  const text = await resp.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 2000) }; }
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${text.slice(0, 300)}`);
  if (json?.errors) throw new Error(`GraphQL error: ${JSON.stringify(json.errors).slice(0, 300)}`);
  return json?.data;
}

async function getStoreSchedules(token) {
  const headers = { ...apiHeaders(token), Accept: 'application/json' };
  const base = `${BASE}/api/admin/businesses/${BUSINESS_ID}/schedules`;
  let all = [], nextUrl = base;
  while (nextUrl) {
    const resp = await fetch(nextUrl, { headers });
    if (!resp.ok) throw new Error(`[schedules] REST ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
    const data = await resp.json();
    all = all.concat(data?.data || []);
    nextUrl = data?.links?.next || null;
  }
  const stores = all
    .filter(s => s.attributes?.schedule_status === 'active')
    .filter(s => /\b\d{4,7}\b/.test(s.attributes?.schedule_name || s.attributes?.code || ''))
    .map(s => ({ id: s.id, name: s.attributes.schedule_name || s.attributes.code || s.id }));
  return stores;
}

// Schedule name → 7-char zero-padded store number (matches lifelenz_schedule.loc / every other
// LifeLenz pull's own locFromName).
function locFromName(name) {
  const m = String(name || '').match(/\b(\d{4,7})\b/);
  return m ? m[1].padStart(7, '0') : null;
}

const DAR_QUERY = `query GetDARData($businessId: ID!, $scheduleId: ID!, $startDateTime: ISO8601DateTime!, $endDateTime: ISO8601DateTime!, $granularity: DarGranularityEnum) {
  darData(businessId: $businessId, scheduleId: $scheduleId, startDateTime: $startDateTime, endDateTime: $endDateTime, granularity: $granularity) {
    dar { data { fieldCode value } missingActuals startTime }
  }
}`;

async function fetchDarData(token, scheduleId, startDateTime, endDateTime) {
  const data = await gql(token, scheduleId, 'GetDARData', DAR_QUERY, {
    businessId: BUSINESS_ID, scheduleId, startDateTime, endDateTime, granularity: 'hour',
  });
  return data?.darData?.dar || [];
}

// Pure, exported for tests: one Dar{} element (real FieldValue shape) → one lifelenz_dar row.
// value arrives as a bare String on every FieldValue regardless of the metric's logical type
// (count vs rate) — stored as numeric throughout, never coerced to integer, since that's the
// honest shape of what the API actually sends (see schema-lifelenz-dar.sql's header).
export function darIntervalToRow(loc, interval) {
  const row = {
    loc,
    start_time: interval.startTime,
    missing_actuals: interval.missingActuals ?? null,
  };
  const byCode = new Map((interval.data || []).map(fv => [fv.fieldCode, fv.value]));
  for (const code of FIELD_CODES) {
    const raw = byCode.get(code);
    const n = raw == null || raw === '' ? null : parseFloat(raw);
    row[code] = Number.isFinite(n) ? n : null;
  }
  return row;
}

async function upsertRows(rows) {
  if (!rows.length) return 0;
  const payload = rows.map(r => ({
    tenant_id: '00000000-0000-0000-0000-000000000001',
    updated_at: new Date().toISOString(),
    ...r,
  }));
  const CHUNK = 500;
  let saved = 0;
  for (let i = 0; i < payload.length; i += CHUNK) {
    const slice = payload.slice(i, i + CHUNK);
    const { error } = await supabase.from('lifelenz_dar').upsert(slice, { onConflict: 'loc,start_time' });
    if (error) { console.warn('[supabase] upsert error:', error.message); continue; }
    saved += slice.length;
  }
  return saved;
}

async function getLatestStartTime() {
  const { data, error } = await supabase
    .from('lifelenz_dar')
    .select('start_time')
    .order('start_time', { ascending: false })
    .limit(1);
  if (error) { console.warn('[freshness] could not read latest start_time:', error.message); return null; }
  return data?.[0]?.start_time || null;
}

// Floors to the start of the current UTC hour, then steps back one more hour — the most
// recently COMPLETED hour, matching the probe's "a day definitely closed" caution at hour
// granularity: the in-progress hour's actuals are still accumulating, so pulling it would just
// write a row this same run (or the next) overwrites a minute later with a different number.
function mostRecentlyCompletedHour(now = new Date()) {
  const floored = new Date(now);
  floored.setUTCMinutes(0, 0, 0);
  floored.setUTCHours(floored.getUTCHours() - 1);
  return floored;
}

async function main() {
  const token = await resolveToken();

  const latestStartTime = await getLatestStartTime();
  const fresh = checkFreshness(latestStartTime, { warnAfterHours: 3, errorAfterHours: 8, label: 'lifelenz-dar-pull' });
  if (fresh.message) (fresh.status === 'error' ? console.error : console.warn)(fresh.message);

  let windowStart, windowEnd;
  if (process.env.LIFELENZ_DAR_START && process.env.LIFELENZ_DAR_END) {
    windowStart = new Date(process.env.LIFELENZ_DAR_START);
    windowEnd = new Date(process.env.LIFELENZ_DAR_END);
  } else {
    windowEnd = mostRecentlyCompletedHour();
    windowStart = new Date(windowEnd.getTime() - LOOKBACK_HOURS * 3_600_000);
  }
  console.log(`[lifelenz-dar-pull] window: ${windowStart.toISOString()} → ${windowEnd.toISOString()}`);

  const schedules = await getStoreSchedules(token);
  if (!schedules.length) { console.error('[schedules] no store schedules found.'); process.exit(1); }
  console.log(`[schedules] ${schedules.length} store schedules`);

  const tracker = makeOutcomeTracker('lifelenz-dar-pull');
  const requestedUnits = schedules.map(s => s.name);
  const coveredSchedules = new Set();
  const allScheduleIds = schedules.map(s => s.id);

  let totalSaved = 0, totalParsed = 0;
  for (const schedule of schedules) {
    const loc = locFromName(schedule.name);
    if (!loc) { tracker.fail(schedule.name, 'could not derive loc from schedule name'); continue; }
    try {
      const intervals = await fetchDarData(token, schedule.id, windowStart.toISOString(), windowEnd.toISOString());
      if (!intervals.length) { console.log(`  ${schedule.name} (loc ${loc}): no intervals in window`); continue; }
      const rows = intervals.map(iv => darIntervalToRow(loc, iv));
      totalParsed += rows.length;
      const saved = await upsertRows(rows);
      totalSaved += saved;
      if (saved === 0) {
        tracker.fail(schedule.name, `parsed ${rows.length} row(s) but saved 0 — upsert write failure`);
      } else {
        coveredSchedules.add(schedule.id);
        if (saved < rows.length) tracker.fail(schedule.name, `upsert saved only ${saved}/${rows.length} parsed row(s)`);
      }
      if (DEBUG) console.log(`  ${schedule.name} (loc ${loc}): ${rows.length} hour(s) parsed, ${saved} saved`);
    } catch (e) {
      console.warn(`  ${schedule.name}: ${e.message}`);
      tracker.fail(schedule.name, e.message);
    }
  }
  console.log(`[lifelenz-dar-pull] ✓ ${totalSaved} row(s) saved across ${coveredSchedules.size}/${schedules.length} stores`);

  logPartitionCoverage(coveredSchedules, allScheduleIds, { label: 'lifelenz-dar-pull', kind: 'schedule' });
  const code = tracker.finalize({
    requestedUnits,
    totalSaved: totalParsed > 0 ? totalSaved : coveredSchedules.size,
    formatRerun: () => 're-run the whole workflow (hourly cadence self-heals a missed run on the next pass) — no per-store rerun flag exists yet',
  });
  if (code) process.exit(code);
}

// Exported for src/__tests__/lifelenz-dar-pull.test.js.
export { locFromName, mostRecentlyCompletedHour, FIELD_CODES };
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error('[lifelenz-dar-pull] fatal error:', err);
    process.exit(1);
  });
}
