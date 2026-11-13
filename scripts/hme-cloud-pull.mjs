#!/usr/bin/env node
// scripts/hme-cloud-pull.mjs — HME Cloud drive-thru timer/DT timing data, all stores (task #105).
//
// Two-step REST login confirmed live 2026-11-12 (no Playwright needed): see
// memory/finding-hme-squadle-integration-2026-11-06.md for the full research history. HME's own
// `getDashboardData` endpoint only ever returns the CURRENT business day's accumulated rollup --
// there is no real historical-date or hour-level granularity reachable via REST (that only lives
// inside HME's own embedded Power BI "Trends Dashboard", explicitly not pursued -- fragile,
// short-lived embed token). So this pull runs intraday and upserts the current day's row by
// (loc, dt) -- each run overwrites the same day with the latest accumulated total; history
// accumulates one real row per store per day as the pull keeps running, day over day.
//
// Required env vars: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, HME_USERNAME, HME_PASSWORD
// Optional: HME_DEBUG (1 = verbose)

import { safeCreateClient } from './lib/safe-supabase-client.mjs';
import { makeOutcomeTracker } from './lib/pull-outcome.mjs';
import { logPartitionCoverage, checkFreshness } from './_pipeline-contract.mjs';

const AUTH_BASE  = 'https://auth.hmecloud.com';
const API_BASE   = 'https://portal-service.hmecloud.com';
const DEBUG      = process.env.HME_DEBUG === '1';

const supabase = safeCreateClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// ── Auth: the real two-step REST flow (confirmed live) ──
// Step 1 is a user-exists/SSO-redirect-check with no password (202, {location:null} for a
// direct-password account) -- not strictly required for login to succeed, but kept because the
// real browser client always calls it first and HME's backend may track it; cheap to skip on
// failure since step 2 alone has been confirmed sufficient.
async function hmeLogin(username, password) {
  const body = { username, ip: '', portalBaseUrl: 'https://portal.hmecloud.com', isAdmin: false, isPartner: false };
  try {
    await fetch(`${AUTH_BASE}/api/auth-service`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
  } catch (e) { if (DEBUG) console.log('[auth] step 1 (non-fatal):', e.message); }

  const resp = await fetch(`${AUTH_BASE}/api/auth-service`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, password }),
  });
  if (!resp.ok) throw new Error(`HME login HTTP ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  const data = await resp.json();
  if (!data?.accessToken) throw new Error(`HME login returned no accessToken: ${JSON.stringify(data).slice(0, 200)}`);
  return data.accessToken;
}

async function getDashboardData(accessToken) {
  const url = `${API_BASE}/api/dashboard/getDashboardData?isAdmin=0&reportType=&eventType=2000&hidePreconfiguredDevices=1&sortBy=undefined&sortType=undefined&period=undefined`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!resp.ok) throw new Error(`getDashboardData HTTP ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  return await resp.json();
}

// Meridian's own convention: 7-char zero-padded store number (matches STORE_NAMES keys).
function padLoc(storeNumber) {
  const digits = String(storeNumber || '').replace(/\D/g, '');
  return digits ? digits.padStart(7, '0') : null;
}

// Business-day cutover (4am) -- same reasoning as src/utils/date.js's businessDate(), reimplemented
// here in plain JS since pull scripts don't share the client bundle's engine modules. HME's own
// "current day" rollup is already business-day-shaped from HME's side (a drive-thru doesn't reset
// at midnight either), but the LOCAL clock this script runs under is UTC (GitHub Actions), so the
// cutover must be computed in the store's own wall-clock terms -- since this repo's stores are all
// US Central/Eastern and the pull is intraday, a simple UTC-minus-a-few-hours approximation is not
// safe across DST; instead this just uses the date the run started in UTC for `dt`, matching the
// same "today, as of pull time" semantics the other intraday pulls (Operations Report/DAR) use for
// their own partial-day rows -- the row is just the running total AT THE TIME OF THIS PULL, and the
// cadence (several pulls/day) means a stale partial row is corrected by the next run, not frozen.
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// Returns { saved, savedLocs } -- savedLocs is the per-row loc set that actually wrote, not
// just "parsed OK", per the standing "a store is only covered when it actually wrote
// something" rule (same precedent lifelenz-employee-performance-pull.mjs's own coverage fix
// documents).
async function upsertRows(rows) {
  if (!rows.length) return { saved: 0, savedLocs: new Set() };
  const payload = rows.map(r => ({ tenant_id: '00000000-0000-0000-0000-000000000001', updated_at: new Date().toISOString(), ...r }));
  const CHUNK = 200;
  let saved = 0;
  const savedLocs = new Set();
  for (let i = 0; i < payload.length; i += CHUNK) {
    const slice = payload.slice(i, i + CHUNK);
    const { error } = await supabase.from('hme_dt_daily').upsert(slice, { onConflict: 'loc,dt' });
    if (error) { console.warn('[supabase] upsert error:', error.message); continue; }
    saved += slice.length;
    for (const r of slice) savedLocs.add(r.loc);
  }
  return { saved, savedLocs };
}

async function getLatestPulledAt() {
  const { data, error } = await supabase.from('hme_dt_daily').select('pulled_at').order('pulled_at', { ascending: false }).limit(1);
  if (error) { console.warn('[freshness] could not read latest pulled_at:', error.message); return null; }
  return data?.[0]?.pulled_at || null;
}

async function main() {
  const username = process.env.HME_USERNAME;
  const password = process.env.HME_PASSWORD;
  if (!username || !password) { console.error('[auth] HME_USERNAME and HME_PASSWORD are required.'); process.exit(1); }

  const latestPulledAt = await getLatestPulledAt();
  const fresh = checkFreshness(latestPulledAt, { warnAfterHours: 6, errorAfterHours: 30, label: 'hme-cloud-pull' });
  if (fresh.message) (fresh.status === 'error' ? console.error : console.warn)(fresh.message);

  console.log('[hme-cloud-pull] logging in…');
  const accessToken = await hmeLogin(username, password);
  console.log('[hme-cloud-pull] ✓ authenticated');

  const dashboard = await getDashboardData(accessToken);
  const tables = dashboard?.dashboard || [];
  const storesTable = tables.find(t => t.title === 'Stores') || tables[0];
  const rawRows = storesTable?.rows || [];
  console.log(`[hme-cloud-pull] ${rawRows.length} store row(s) in dashboard response`);

  const dt = todayISO();
  const tracker = makeOutcomeTracker('hme-cloud-pull');
  const requestedUnits = rawRows.map(r => r.storeNumber || r.storeName || '?');

  const rows = [];
  for (const r of rawRows) {
    const loc = padLoc(r.storeNumber);
    if (!loc) { tracker.fail(r.storeNumber || r.storeName || '?', 'could not derive a loc from storeNumber'); continue; }
    rows.push({
      loc, dt,
      store_name: r.storeName ?? null,
      store_rank: r.storeRank != null ? parseInt(r.storeRank, 10) : null,
      cars: r.cars ?? null,
      avg_seconds: r.avg ?? null,
      goal_a: r.GoalA ?? null, goal_b: r.GoalB ?? null, goal_c: r.GoalC ?? null, goal_d: r.GoalD ?? null,
      pct: r.percent ?? null,
      pulled_at: new Date().toISOString(),
    });
  }

  const { saved, savedLocs } = await upsertRows(rows);
  // Coverage is tracked by the raw store-number/name string, matching requestedUnits above --
  // and only for rows that actually WROTE, not merely parsed (a parsed-but-unsaved row is a
  // real write failure, not coverage).
  const coveredRaw = new Set(rawRows.filter(r => savedLocs.has(padLoc(r.storeNumber))).map(r => r.storeNumber || r.storeName));
  if (saved < rows.length) tracker.fail('upsert', `saved only ${saved}/${rows.length} parsed row(s)`);

  console.log(`[hme-cloud-pull] ✓ ${saved} row(s) saved for business day ${dt}`);
  logPartitionCoverage(coveredRaw, requestedUnits, { label: 'hme-cloud-pull', kind: 'store' });

  const code = tracker.finalize({
    requestedUnits,
    totalSaved: saved,
    formatRerun: () => 're-run the whole workflow -- no per-store rerun flag exists yet',
  });
  if (code) process.exit(code);
}

export { padLoc, hmeLogin, getDashboardData };
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error('[hme-cloud-pull] fatal error:', err);
    process.exit(1);
  });
}
