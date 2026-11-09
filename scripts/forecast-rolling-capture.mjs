#!/usr/bin/env node
// scripts/forecast-rolling-capture.mjs
// Rolling Forecast — Commit & Drift (owner-directed 2026-11-09). Daily job: append today's
// forecast read for every store to forecast_rolling_captures (supabase/schema-forecast-rolling-
// captures.sql) WITHOUT overwriting any prior day's row, then compare the freshest read against
// any active forecast_commits pointer and fire an app_notifications alert (in-app + push) when a
// committed period has drifted into the 'alert' tier. See
// memory/project-rolling-forecast-snapshots-2026-11-09.md for the full design and
// src/engine/forecast-drift.js for the pure drift-tier math this job reuses, unmodified.
//
// Required env vars: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// ── Why this is "the same code, a new caller" ───────────────────────────────────────────────────
// This reuses forecast-week-precompute.mjs's own already-proven ds-building recipe verbatim (same
// labor_rows/qsr_daily_activity_rollup/org_events/event_impact/org_event_exceptions loaders, same
// model-assignment localStorage shim, same forecastDay()/supplementLaborWithSched()/
// orgEventsToDayMap() imports from the real engine) rather than hand-rolling a second ds builder --
// a future change to any of that logic reaches this job automatically instead of drifting from
// what the browser (and the other precompute job) compute. Only the output shape and window are
// different: this job captures a FORWARD WINDOW of every due period (not just the current week)
// into an APPEND-ONLY table (not an overwritten cache), and adds the commit/drift/alert step
// forecast-week-precompute.mjs has no equivalent of.
//
// ── Daily vs weekly ──────────────────────────────────────────────────────────────────────────────
// Daily: today .. +DAILY_FORWARD_DAYS, one forecastDay() call per store/day.
// Weekly: no separate forecastWeek() exists anywhere in the engine (confirmed by grep) -- every
// other weekly-rollup view in this app already sums 7 daily forecasts, so this job does the same:
// a week's forecast_value is the sum of forecastDay() over its 7 days, target_period is that
// week's MONDAY (matching the schema's own comment, deliberately NOT the app's configurable
// weekStartDay setting -- a capture row's identity should be independent of whoever's UI setting
// was live the day it was written). model_used on a weekly row is the model used on that week's
// first day, informational only (a week can legitimately mix models at the daypart boundary).
//
// ── Scope: daily + weekly only (owner's own call, 2026-11-09 session) ──────────────────────────
// Monthly/yearly/hourly are NOT captured here even though the schema's period_type check
// constraint only allows 'daily'/'weekly' today anyway -- expanding to other cycles is explicitly
// future work, not an oversight.

import { safeCreateClient } from './lib/safe-supabase-client.mjs';
import { supplementLaborWithSched } from '../src/engine/labor-supplement.js';
import { forecastDay, bLocIdx, setEventImpact } from '../src/engine/forecast.js';
import { orgEventsToDayMap } from '../src/engine/events-import.js';
import { computeEventFactors } from '../src/utils/events.js';
import { computeDrift } from '../src/engine/forecast-drift.js';
import { buildAppNotification } from '../src/engine/app-notifications.js';
import { deliverAppNotification } from './lib/app-notification-delivery.mjs';
import { DEFAULT_TARGETS, MODEL_ASSIGNMENT_KEY, STORE_NAMES } from '../src/constants.js';

const STORE_LOCS = Object.keys(STORE_NAMES).filter(l => /^\d+$/.test(l));

export const DAILY_FORWARD_DAYS   = 60; // ~2 months of daily forward reads per store, per the directive's "reasonable forward window"
export const WEEKLY_FORWARD_WEEKS = 12; // ~1 quarter of weekly forward reads
const LABOR_DAYS_BACK   = 400; // matches loadLaborRows' default — fetchLY needs up to ~385 days back
const QSR_ACT_DAYS_BACK = 60;  // matches loadQsrActSummary's default in App.js's _stQsrsoftActSummary
const DEBUG = process.env.FORECAST_CAPTURE_DEBUG === '1';
const UPSERT_CHUNK = 500;

const supabase = safeCreateClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Exported for unit testing (the pure date-window logic) without mocking network calls or
// pulling in the full forecastDay/Supabase pipeline -- see
// src/__tests__/dispatch-rolling-forecast-capture-2026-11-09.test.js.
export function fmtDate(d) { return d.toISOString().slice(0, 10); }
export function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function dKeyLocal(d) { return d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10); }
export function noonOf(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12); }
// Monday of the week containing `d` -- deliberately independent of the app's weekStartDay
// setting, per the header comment above.
export function mondayOf(d) {
  const r = noonOf(d);
  const dow = r.getDay(); // 0=Sun..6=Sat
  r.setDate(r.getDate() + (dow === 0 ? -6 : 1 - dow));
  return r;
}

// Same trivial date-keyed index every ds.laborIdx build site uses (src/app/App.js's
// _mkIdx/_mkIdx2, src/engine/pipeline.js's bIdx) — not exported anywhere, so reimplemented here
// verbatim, same as forecast-week-precompute.mjs already does.
function bIdx(rows) {
  const idx = {};
  for (const r of (rows || [])) {
    if (!r.loc || !r.date) continue;
    const k = r.loc + '_' + dKeyLocal(r.date);
    (idx[k] || (idx[k] = [])).push(r);
  }
  return idx;
}

// ── Source loaders — identical to forecast-week-precompute.mjs's own (see that file's header
// for why each one reads what it reads); duplicated rather than imported since none of them are
// exported from that script, matching the existing convention for these small pure loaders. ────
async function loadLaborRows(daysBack) {
  const cutoff = fmtDate(addDays(new Date(), -daysBack));
  const rows = [];
  const PAGE = 1000;
  for (let p = 0; ; p++) {
    const { data, error } = await supabase.from('labor_rows').select('*')
      .gte('report_date', cutoff).order('report_date', { ascending: false })
      .range(p * PAGE, p * PAGE + PAGE - 1);
    if (error) throw new Error(`labor_rows page ${p} failed: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return rows.map(r => ({
    loc: r.loc, date: new Date(r.report_date + 'T00:00:00'), sales: r.sales,
    laborPct: r.labor_pct, tpph: r.tpph, otHrs: r.ot_hrs, otDollar: r.ot_dollar,
  }));
}

async function loadQsrActSummaryRows(daysBack) {
  const cutoff = fmtDate(addDays(new Date(), -daysBack));
  const rows = [];
  const PAGE = 1000;
  for (let p = 0; ; p++) {
    const { data, error } = await supabase.from('qsr_daily_activity_rollup')
      .select('loc,dt,product_sales,transactions')
      .gte('dt', cutoff).order('dt', { ascending: false })
      .range(p * PAGE, p * PAGE + PAGE - 1);
    if (error) throw new Error(`qsr_daily_activity_rollup page ${p} failed: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return rows.map(v => ({
    loc: String(parseInt(v.loc, 10)), date: new Date(v.dt + 'T00:00:00'),
    sales: v.product_sales || 0, gc: v.transactions || 0,
  }));
}

async function loadOrgEvents() {
  const rows = [];
  const PAGE = 1000;
  for (let p = 0; ; p++) {
    const { data, error } = await supabase.from('org_events').select('*')
      .order('date_start').range(p * PAGE, p * PAGE + PAGE - 1);
    if (error) throw new Error(`org_events page ${p} failed: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return rows.map(r => ({
    id: r.id, loc: String(r.loc), dateStart: r.date_start, dateEnd: r.date_end, span: !!r.span,
    category: r.category, type: r.event_type, label: r.label,
    impact: { magnitude: r.impact_magnitude, daypart: r.impact_daypart, gameDay: !!r.impact_gameday, raw: r.impact_raw },
    opponent: r.opponent ?? null, kickoff: r.kickoff ?? null, status: r.status ?? null,
    expectedSalesDelta: r.expected_sales_delta, expectedGcDelta: r.expected_gc_delta,
    url: r.url, verification: r.verification, note: r.note,
    enteredBy: r.entered_by, enteredAt: r.entered_at, method: r.method,
    scope: r.scope ?? 'store', scopeState: r.scope_state ?? null, scopeLocs: r.scope_locs ?? null,
  }));
}

async function loadOrgEventExceptions() {
  const { data, error } = await supabase.from('org_event_exceptions').select('*');
  if (error) { console.warn(`[forecast-rolling-capture] org_event_exceptions load failed (non-fatal, treated as no exceptions): ${error.message}`); return {}; }
  const map = {};
  for (const r of (data || [])) (map[r.event_id] = map[r.event_id] || {})[String(r.loc)] = { status: r.status, overrides: r.overrides || null };
  return map;
}

async function loadEventImpact() {
  const rows = [];
  const PAGE = 1000;
  for (let p = 0; ; p++) {
    const { data, error } = await supabase.from('event_impact').select('*')
      .range(p * PAGE, p * PAGE + PAGE - 1);
    if (error) throw new Error(`event_impact page ${p} failed: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return rows.map(r => ({ loc: String(r.loc), eventType: r.event_type, homeImpact: r.home_impact, awayImpact: r.away_impact }));
}

async function loadModelAssignmentOverrides() {
  const { data, error } = await supabase.from('user_settings')
    .select('value,updated_at').eq('key', 'model_assignments')
    .order('updated_at', { ascending: false }).limit(1).maybeSingle();
  if (error) { console.warn(`[forecast-rolling-capture] model_assignments load failed (non-fatal, using DEFAULT_MODEL_ASSIGNMENTS only): ${error.message}`); return {}; }
  return (data && data.value) || {};
}

// settings.tolerance is a shared, tenant-wide figure (org_config key='app_settings', the same
// row App.js's Settings modal writes via pushConfigToSupabase) -- not per-user, so there's no
// "whose settings" ambiguity for a district-wide batch job. Falls back to forecastDay's own
// documented default (5) on any read failure or pre-migration/empty row, same as every
// `settings.tolerance||5` read already scattered through forecast.js.
async function loadTolerancePct() {
  const { data, error } = await supabase.from('org_config').select('data').eq('key', 'app_settings').maybeSingle();
  if (error || !data?.data) return 5;
  return Number(data.data.tolerance) || 5;
}

async function buildDs() {
  console.log('[forecast-rolling-capture] loading source data...');
  const [laborRowsRaw, qsrActSummaryRows, modelOverrides, orgEvents, eventImpactRows, orgEventExceptions, tolerancePct] = await Promise.all([
    loadLaborRows(LABOR_DAYS_BACK),
    loadQsrActSummaryRows(QSR_ACT_DAYS_BACK),
    loadModelAssignmentOverrides(),
    loadOrgEvents(),
    loadEventImpact(),
    loadOrgEventExceptions(),
    loadTolerancePct(),
  ]);
  console.log(`[forecast-rolling-capture] labor_rows=${laborRowsRaw.length} qsr_act_summary=${qsrActSummaryRows.length} org_events=${orgEvents.length} event_impact=${eventImpactRows.length} org_event_exceptions=${Object.keys(orgEventExceptions).length} tolerancePct=${tolerancePct}`);

  const laborRows = supplementLaborWithSched(laborRowsRaw, qsrActSummaryRows);
  const ds = {
    loaded: true,
    laborRows,
    laborIdx: bIdx(laborRows),
    laborByLoc: bLocIdx(laborRows),
    qsrActSummaryRows,
    targets: {},
  };

  const userEvents = orgEventsToDayMap(orgEvents, () => '', orgEventExceptions);
  const eventImpactMap = {};
  for (const r of eventImpactRows) {
    const k = String(r.loc).replace(/^0+/, '');
    (eventImpactMap[k] = eventImpactMap[k] || {})[r.eventType] = { home: r.homeImpact, away: r.awayImpact };
  }
  setEventImpact(eventImpactMap);
  const eventFactors = computeEventFactors(ds, userEvents);

  globalThis.localStorage = {
    _store: { [MODEL_ASSIGNMENT_KEY]: JSON.stringify(modelOverrides) },
    getItem(k) { return Object.prototype.hasOwnProperty.call(this._store, k) ? this._store[k] : null; },
    setItem(k, v) { this._store[k] = String(v); },
    removeItem(k) { delete this._store[k]; },
  };

  const cfg = { useEventRegistry: true, _userEvents: userEvents, _eventFactors: eventFactors, tolerance: tolerancePct };
  return { ds, cfg, tolerancePct };
}

// ── Capture ──────────────────────────────────────────────────────────────────────────────────────
function buildCaptures(ds, cfg, today) {
  const capturedDate = fmtDate(today);
  const dayCache = new Map(); // `${loc}|${dateStr}` -> forecastDay() result, shared between the daily loop and the weekly sum so the overlap between the two windows is only computed once per store/day

  function dayForecast(loc, date) {
    const key = loc + '|' + fmtDate(date);
    if (dayCache.has(key)) return dayCache.get(key);
    const t = DEFAULT_TARGETS[loc] || {};
    const r = forecastDay(loc, date, ds, cfg, null, t);
    dayCache.set(key, r);
    return r;
  }

  const dailyDates = Array.from({ length: DAILY_FORWARD_DAYS + 1 }, (_, i) => addDays(noonOf(today), i));
  const thisMonday = mondayOf(today);
  const weekStarts = Array.from({ length: WEEKLY_FORWARD_WEEKS }, (_, i) => addDays(thisMonday, i * 7));

  const dailyRows = [];
  const weeklyRows = [];
  for (const loc of STORE_LOCS) {
    for (const d of dailyDates) {
      const r = dayForecast(loc, d);
      dailyRows.push({
        loc, period_type: 'daily', target_period: fmtDate(d), captured_date: capturedDate,
        lead_days: Math.round((d - noonOf(today)) / 86400000),
        forecast_value: Number(r.forecast) || 0,
        model_used: r.modelUsed || null,
      });
      if (DEBUG) console.log(`[forecast-rolling-capture]   daily  ${loc} ${fmtDate(d)} fc=${r.forecast} model=${r.modelUsed}`);
    }
    for (const ws of weekStarts) {
      let sum = 0; let firstModel = null;
      for (let i = 0; i < 7; i++) {
        const r = dayForecast(loc, addDays(ws, i));
        sum += Number(r.forecast) || 0;
        if (firstModel == null) firstModel = r.modelUsed || null;
      }
      weeklyRows.push({
        loc, period_type: 'weekly', target_period: fmtDate(ws), captured_date: capturedDate,
        lead_days: Math.round((ws - noonOf(today)) / 86400000),
        forecast_value: sum,
        model_used: firstModel,
      });
      if (DEBUG) console.log(`[forecast-rolling-capture]   weekly ${loc} ${fmtDate(ws)} fc=${sum.toFixed(2)} model=${firstModel}`);
    }
  }
  return { dailyRows, weeklyRows };
}

async function writeCaptures(rows) {
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK);
    const { error } = await supabase.from('forecast_rolling_captures')
      .upsert(chunk, { onConflict: 'tenant_id,loc,period_type,target_period,captured_date' });
    if (error) throw new Error(`forecast_rolling_captures upsert failed (rows ${i}-${i + chunk.length}): ${error.message}`);
  }
}

// ── Drift + alerting ────────────────────────────────────────────────────────────────────────────
// Fires only at the 'alert' tier, per the directive -- 'watching' is meant to be seen on the
// Week/Day card itself, not pushed to a phone. Dedupe follows the exact movers-alert-run.mjs
// pattern: a non-null resolve_key, checked against app_notifications before inserting, so a
// period that's been sitting in 'alert' for several days in a row fires ONCE, not every run --
// it naturally re-fires if the owner dismisses/clears it and the period drifts into 'alert'
// again later (a fresh swing), since dismissed_at/cleared_at are excluded from the "already
// fired" check.
async function checkDriftAndAlert(periodType, freshRows, tolerancePct) {
  const { data: commits, error } = await supabase.from('forecast_commits')
    .select('loc,target_period,committed_captured_date')
    .eq('period_type', periodType);
  if (error) { console.warn(`[forecast-rolling-capture] forecast_commits load failed (${periodType}): ${error.message}`); return { checked: 0, fired: 0 }; }
  if (!commits || !commits.length) { console.log(`[forecast-rolling-capture] no active ${periodType} commits — nothing to drift-check`); return { checked: 0, fired: 0 }; }

  const freshByKey = new Map(freshRows.map(r => [r.loc + '|' + r.target_period, r]));
  let fired = 0;
  for (const c of commits) {
    const fresh = freshByKey.get(c.loc + '|' + c.target_period);
    if (!fresh) continue; // target_period is outside this run's forward window -- no fresh read today, nothing to compare

    const { data: committedRow, error: cErr } = await supabase.from('forecast_rolling_captures')
      .select('forecast_value')
      .eq('loc', c.loc).eq('period_type', periodType).eq('target_period', c.target_period)
      .eq('captured_date', c.committed_captured_date).maybeSingle();
    if (cErr || !committedRow) continue; // the pointed-at capture isn't in the table -- nothing to compare against

    const drift = computeDrift(fresh.forecast_value, committedRow.forecast_value, tolerancePct);
    if (!drift || drift.tier !== 'alert') continue;
    if (await fireDriftAlert(c.loc, periodType, c.target_period, drift)) fired++;
  }
  return { checked: commits.length, fired };
}

async function fireDriftAlert(loc, periodType, targetPeriod, drift) {
  const resolveKey = `forecast-drift:${loc}:${periodType}:${targetPeriod}`;
  const { data: existing, error: exErr } = await supabase.from('app_notifications')
    .select('id').eq('type', 'forecast-drift').eq('resolve_key', resolveKey)
    .is('dismissed_at', null).is('cleared_at', null).limit(1);
  if (exErr) { console.warn(`[forecast-rolling-capture] dedupe check failed for ${resolveKey}: ${exErr.message}`); return false; } // fail closed — never double-fire on a read error
  if (existing && existing.length) return false;

  const storeName = STORE_NAMES[loc] || loc;
  const periodLabel = periodType === 'daily' ? targetPeriod : `week of ${targetPeriod}`;
  const dirWord = drift.deltaPct >= 0 ? 'up' : 'down';
  const row = buildAppNotification({
    type: 'forecast-drift',
    loc, period: targetPeriod, severity: 'warn',
    title: `${storeName}: forecast drifted off the committed plan (${periodLabel})`,
    detail: `Live forecast is ${dirWord} ${Math.abs(drift.deltaPct).toFixed(1)}% from the committed plan — committed $${drift.committedValue.toFixed(0)}, now $${drift.liveValue.toFixed(0)}.`,
    link: 'projections',
    resolveKey,
    payload: { loc, periodType, targetPeriod, ...drift },
  });
  const { error: insError } = await supabase.from('app_notifications').insert([row]);
  if (insError) { console.warn(`[forecast-rolling-capture] app_notifications insert failed for ${resolveKey}: ${insError.message}`); return false; }
  await deliverAppNotification(row, { supabase });
  console.log(`[forecast-rolling-capture] ALERT fired: ${loc} ${periodType} ${targetPeriod} delta=${drift.deltaPct.toFixed(1)}%`);
  return true;
}

async function main() {
  if (!supabase) { console.warn('[forecast-rolling-capture] no Supabase client — missing env vars'); return; }
  const today = new Date();
  const { ds, cfg, tolerancePct } = await buildDs();

  console.log(`[forecast-rolling-capture] capturing ${STORE_LOCS.length} stores, daily +${DAILY_FORWARD_DAYS}d / weekly +${WEEKLY_FORWARD_WEEKS}wk, captured_date=${fmtDate(today)}`);
  const { dailyRows, weeklyRows } = buildCaptures(ds, cfg, today);
  console.log(`[forecast-rolling-capture] computed ${dailyRows.length} daily + ${weeklyRows.length} weekly capture rows`);

  await writeCaptures([...dailyRows, ...weeklyRows]);
  console.log(`[forecast-rolling-capture] wrote ${dailyRows.length + weeklyRows.length} capture rows`);

  const dailyDrift = await checkDriftAndAlert('daily', dailyRows, tolerancePct);
  const weeklyDrift = await checkDriftAndAlert('weekly', weeklyRows, tolerancePct);
  console.log(`[forecast-rolling-capture] drift check — daily: ${dailyDrift.checked} commit(s) checked, ${dailyDrift.fired} alert(s) fired; weekly: ${weeklyDrift.checked} commit(s) checked, ${weeklyDrift.fired} alert(s) fired`);
}

// Matches the repo's established "runs only as the entry point, not when imported" guard
// (e.g. scripts/eom-digest-send.mjs) -- lets a test import this module's pure helpers
// (fmtDate/addDays/mondayOf/noonOf) without triggering a real Supabase run as a side effect of
// the import itself. See src/__tests__/dispatch-rolling-forecast-capture-2026-11-09.test.js.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => { console.error('[forecast-rolling-capture] FAILED:', e); process.exit(1); });
}
