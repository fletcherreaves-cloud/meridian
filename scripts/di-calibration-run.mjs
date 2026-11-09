#!/usr/bin/env node
// scripts/di-calibration-run.mjs
// DI Calibration automation (owner-directed 2026-11-09): "can we automate the DI calibration and
// have it execute either by our own conditions as we previously defined or just schedule them
// update on a schedule per your determination." This job runs the same grid search the in-app DI
// Calibration panel's "Calibrate All"/"↻ Recalibrate" buttons already call
// (calibrateStore() — src/engine/backtest.js) and writes the results through the exact same cloud
// path the browser does, so results show up for the owner on next load with zero UI change.
//
// Two modes, picked by DI_CALIBRATION_MODE env var ('weekly'|'full', default 'weekly'):
//   - weekly: only recalibrates stores whose LIVE drift (computeMAPEDrift(), forecast.js) has
//     crossed the exact same threshold the in-app ⚠ Drift Warning badge uses
//     (mape2w > mape6w + 5 — see src/engine/forecast.js's di_calibration_panel help text).
//   - full: recalibrates every eligible store regardless of drift, matching the documented
//     "Monthly: run Calibrate All district-wide, regardless of whether any store shows drift"
//     cadence from that same in-app Workflow Guide text.
//
// ── Where results actually get written (the real complication here) ─────────────────────────────
// Unlike every other scheduled job in this repo, DI Calibration results are NOT tenant-wide
// operational data in a tenant_id-scoped table — they live in the single-user-scoped
// public.user_settings table (user_id, key, value, updated_at), the exact same place the
// browser's saveUserSetting/loadUserSetting (src/lib/supabase.js) read/write, gated there by
// supabase.auth.getUser() — there is no "current user" in a cron job. This script writes directly
// to that table with the service-role key (bypasses RLS, can write any user_id) for the one real
// account this single-tenant app has ever had: fletcher.reaves@mcreaves.com, user_id
// c71d28f2-a210-42b3-8dfd-c872045010d5 (confirmed live against auth.users; this app has no
// multi-user deployment yet — see CLAUDE.md's "multi-tenant deployment" roadmap item — so there
// is no "whose settings" ambiguity today). The write shape mirrors src/lib/blob-sync.js's
// pushBlob() / src/views/analytics.js's own Calibrate-All handler (~line 6091-6128) exactly:
// read the existing `dialed_in` row's value ({data: {loc: calibrationResult, ...}, savedAt}),
// merge newly-calibrated stores' results into `data` (every other store's existing result is
// left untouched), write back {data: merged, savedAt: Date.now()}. model_assignments (which
// MODEL each store/horizon uses) is a separate, untouched decision — this job only ever touches
// the `dialed_in` key.
//
// Required env vars: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { safeCreateClient } from './lib/safe-supabase-client.mjs';
import { supplementLaborWithSched } from '../src/engine/labor-supplement.js';
import { forecastDay, bLocIdx, setEventImpact, computeMAPEDrift } from '../src/engine/forecast.js';
import { calibrateStore } from '../src/engine/backtest.js';
import { orgEventsToDayMap } from '../src/engine/events-import.js';
import { computeEventFactors } from '../src/utils/events.js';
import { MODEL_ASSIGNMENT_KEY, STORE_NAMES } from '../src/constants.js';

const STORE_LOCS = Object.keys(STORE_NAMES).filter(l => /^\d+$/.test(l));
const LABOR_DAYS_BACK = 400; // matches forecast-rolling-capture.mjs / forecast-week-precompute.mjs — fetchLY needs up to ~385 days back
const QSR_ACT_DAYS_BACK = 60;
const DRIFT_RECALIBRATE_THRESHOLD = 5; // computeMAPEDrift's own 'recalibrate' status threshold — not re-derived here, just named for clarity in the summary log

// The one real account this single-tenant app has — see header comment. Confirmed live via the
// Supabase Management API against auth.users (fletcher.reaves@mcreaves.com), not re-derivable
// from any table this script's own service-role credential can read (auth.users isn't exposed
// through the data API), so it's a literal here rather than a lookup.
const OWNER_USER_ID = 'c71d28f2-a210-42b3-8dfd-c872045010d5';

const MODE = (process.env.DI_CALIBRATION_MODE || 'weekly').toLowerCase() === 'full' ? 'full' : 'weekly';
const DEBUG = process.env.DI_CALIBRATION_DEBUG === '1';

const supabase = safeCreateClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function fmtDate(d) { return d.toISOString().slice(0, 10); }
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function dKeyLocal(d) { return d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10); }

// Same trivial date-keyed index every ds.laborIdx build site uses (src/app/App.js's _mkIdx,
// forecast-week-precompute.mjs/forecast-rolling-capture.mjs's own bIdx) — not exported anywhere,
// reimplemented here verbatim per the established convention for this one.
function bIdx(rows) {
  const idx = {};
  for (const r of (rows || [])) {
    if (!r.loc || !r.date) continue;
    const k = r.loc + '_' + dKeyLocal(r.date);
    (idx[k] || (idx[k] = [])).push(r);
  }
  return idx;
}

// ── Source loaders — identical in shape to forecast-rolling-capture.mjs's own (duplicated per
// that file's own documented convention: none of these are exported from any shared module). ────
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
  if (error) { console.warn(`[di-calibration-run] org_event_exceptions load failed (non-fatal, treated as no exceptions): ${error.message}`); return {}; }
  const map = {};
  for (const r of (data || [])) (map[r.event_id] = map[r.event_id] || {})[String(r.loc)] = { status: r.status, overrides: r.overrides || null };
  return map;
}

async function loadModelAssignmentOverrides() {
  const { data, error } = await supabase.from('user_settings')
    .select('value,updated_at').eq('key', 'model_assignments')
    .order('updated_at', { ascending: false }).limit(1).maybeSingle();
  if (error) { console.warn(`[di-calibration-run] model_assignments load failed (non-fatal, using defaults only): ${error.message}`); return {}; }
  return (data && data.value) || {};
}

async function loadTolerancePct() {
  const { data, error } = await supabase.from('org_config').select('data').eq('key', 'app_settings').maybeSingle();
  if (error || !data?.data) return 5;
  return Number(data.data.tolerance) || 5;
}

// The one piece genuinely specific to this job: the CURRENT dialed_in blob, both as the input to
// the weekly drift check (settings.dialedIn must reflect what's actually live right now, not a
// freshly-recalibrated guess — otherwise every store would read as "just calibrated, no drift" on
// its own brand-new numbers) and as the base to merge this run's results into before writing back.
async function loadDialedIn() {
  const { data, error } = await supabase.from('user_settings')
    .select('value').eq('user_id', OWNER_USER_ID).eq('key', 'dialed_in').maybeSingle();
  if (error) throw new Error(`dialed_in load failed: ${error.message}`);
  const raw = data?.value;
  if (!raw || typeof raw !== 'object') return { data: {}, savedAt: 0 };
  if (raw.data && typeof raw.data === 'object') return { data: raw.data, savedAt: raw.savedAt || 0 };
  return { data: raw, savedAt: 0 }; // legacy flat-map shape (src/lib/blob-sync.js's normalizeDialedIn covers the same case client-side)
}

async function writeDialedIn(mergedData) {
  const value = { data: mergedData, savedAt: Date.now() };
  const { error } = await supabase.from('user_settings')
    .upsert({ user_id: OWNER_USER_ID, key: 'dialed_in', value, updated_at: new Date().toISOString() },
            { onConflict: 'user_id,key' });
  if (error) throw new Error(`dialed_in write failed: ${error.message}`);
  return value;
}

async function buildDs(dialedIn) {
  console.log('[di-calibration-run] loading source data...');
  const [laborRowsRaw, qsrActSummaryRows, modelOverrides, orgEvents, orgEventExceptions, tolerancePct] = await Promise.all([
    loadLaborRows(LABOR_DAYS_BACK),
    loadQsrActSummaryRows(QSR_ACT_DAYS_BACK),
    loadModelAssignmentOverrides(),
    loadOrgEvents(),
    loadOrgEventExceptions(),
    loadTolerancePct(),
  ]);
  console.log(`[di-calibration-run] labor_rows=${laborRowsRaw.length} qsr_act_summary=${qsrActSummaryRows.length} org_events=${orgEvents.length} tolerancePct=${tolerancePct}`);

  const laborRows = supplementLaborWithSched(laborRowsRaw, qsrActSummaryRows);
  const ds = {
    loaded: true,
    laborRows,
    laborIdx: bIdx(laborRows),
    laborByLoc: bLocIdx(laborRows),
    storeIds: STORE_LOCS,
    targets: {}, // forecastDay()'s own `tgt||ds.targets[loc]||DEFAULT_TARGETS[loc]||{}` fallback chain needs this key to exist, even empty — matches forecast-rolling-capture.mjs's own ds shape
  };

  const userEvents = orgEventsToDayMap(orgEvents, () => '', orgEventExceptions);
  setEventImpact({});
  const eventFactors = computeEventFactors(ds, userEvents);

  // calibrateStore/computeMAPEDrift -> forecastDay -> getModelAssignment reads localStorage for
  // per-store overrides; same shim forecast-rolling-capture.mjs already uses for the identical
  // reason (there is no localStorage global in Node).
  globalThis.localStorage = {
    _store: { [MODEL_ASSIGNMENT_KEY]: JSON.stringify(modelOverrides) },
    getItem(k) { return Object.prototype.hasOwnProperty.call(this._store, k) ? this._store[k] : null; },
    setItem(k, v) { this._store[k] = String(v); },
    removeItem(k) { delete this._store[k]; },
  };

  const settings = {
    useEventRegistry: true, _userEvents: userEvents, _eventFactors: eventFactors,
    tolerance: tolerancePct, weeksBack: 6,
    dialedIn: dialedIn.data, dialedInEnabled: Object.keys(dialedIn.data || {}).length > 0,
  };
  return { ds, settings };
}

// Pure — exported for unit testing without mocking Supabase/forecastDay. `mode` is 'weekly'|
// 'full'; `driftByLoc` maps loc -> computeMAPEDrift()'s return (or null when it couldn't compute
// one, e.g. too little recent history). In 'full' mode drift is never even consulted (every
// store is selected) — matches the documented "Monthly: run Calibrate All... regardless of
// whether any store shows drift" cadence.
export function selectStoresToCalibrate(mode, locs, driftByLoc) {
  const toCalibrate = [];
  const skipped = [];
  for (const loc of locs) {
    if (mode === 'full') { toCalibrate.push({ loc, reason: 'full mode' }); continue; }
    const drift = driftByLoc[loc];
    if (!drift) { skipped.push({ loc, reason: 'not enough recent history to drift-check (computeMAPEDrift returned null)' }); continue; }
    if (drift.status === 'recalibrate') toCalibrate.push({ loc, reason: `drift=${drift.drift} (mape2w=${drift.mape2w} mape6w=${drift.mape6w})` });
    else skipped.push({ loc, reason: `drift ${drift.status} (${drift.drift}) — below the ${DRIFT_RECALIBRATE_THRESHOLD}-point recalibrate threshold` });
  }
  return { toCalibrate, skipped };
}

async function main() {
  console.log(`[di-calibration-run] mode=${MODE}`);
  if (!supabase) { console.error('[di-calibration-run] missing VITE_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY — aborting'); process.exitCode = 1; return; }

  const dialedIn = await loadDialedIn();
  const { ds, settings } = await buildDs(dialedIn);

  const driftByLoc = {};
  if (MODE !== 'full') for (const loc of STORE_LOCS) driftByLoc[loc] = computeMAPEDrift(loc, ds, settings);
  const { toCalibrate, skipped } = selectStoresToCalibrate(MODE, STORE_LOCS, driftByLoc);

  console.log(`[di-calibration-run] ${toCalibrate.length}/${STORE_LOCS.length} stores selected for calibration this run`);
  for (const s of skipped) if (DEBUG) console.log(`[di-calibration-run]   skip ${s.loc}: ${s.reason}`);

  const merged = { ...dialedIn.data };
  const results = [];
  for (const { loc, reason } of toCalibrate) {
    let cal = null;
    try { cal = await calibrateStore(loc, ds, settings, () => {}); }
    catch (err) { results.push({ loc, status: 'error', detail: err.message || String(err) }); console.error(`[di-calibration-run] ${loc} calibration threw: ${err.message || err}`); continue; }
    if (cal && !cal._why) {
      const prevMape6w = merged[loc]?.mape6w;
      merged[loc] = cal;
      results.push({ loc, status: 'ok', reason, prevMape6w, newMape6w: cal.mape6w, newMape2w: cal.mape2w });
      console.log(`[di-calibration-run] ${loc} recalibrated (${reason}) — mape6w ${prevMape6w ?? '—'} -> ${cal.mape6w}`);
    } else {
      const why = cal?._why || 'returned bare null';
      results.push({ loc, status: cal?._notYetEligible ? 'ineligible' : 'no-result', detail: why });
      console.log(`[di-calibration-run] ${loc} not calibrated: ${why}`);
    }
  }

  if (toCalibrate.length) {
    const written = await writeDialedIn(merged);
    console.log(`[di-calibration-run] wrote dialed_in: ${Object.keys(written.data).length} stores total, savedAt=${written.savedAt}`);
  } else {
    console.log('[di-calibration-run] nothing to write — no store crossed the recalibrate threshold this run');
  }

  const ok = results.filter(r => r.status === 'ok').length;
  const errors = results.filter(r => r.status === 'error').length;
  console.log(`[di-calibration-run] done — ${ok} recalibrated, ${errors} errors, ${skipped.length} skipped (no drift / insufficient history)`);
  if (errors) process.exitCode = 1;
}

// Matches the repo's established "runs only as the entry point, not when imported" guard (e.g.
// scripts/forecast-rolling-capture.mjs) — lets a test import selectStoresToCalibrate without
// triggering a real Supabase run as a side effect of the import itself.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error('[di-calibration-run] fatal:', err); process.exit(1); });
}
