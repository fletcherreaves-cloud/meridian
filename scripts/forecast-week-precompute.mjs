#!/usr/bin/env node
// scripts/forecast-week-precompute.mjs
// Dispatch22, Workstream A (memory/plan-normalization-2026-08-17.md) — "move the week's
// forecast off the render path." at-a-glance.js's weekProjections useMemo was making 189
// forecastDay() calls (27 stores x 7 days) on every render: 76,503 ms of 82,221 ms measured
// render time (93%), closing a modal cost up to 4.3s. This job runs forecastDay() ONCE a day
// here instead, server-side, and writes the result to forecast_week_cache
// (supabase/schema-forecast-week-cache.sql). forecastDay() ITSELF is not touched — this is a
// new caller of the existing engine, not a new forecasting algorithm.
//
// Required env vars:
//   VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// ── Why this is safe to build as "the same code, a new caller" ────────────────────────────
// weekProjections (src/views/at-a-glance.js:1519) only reads THREE fields off forecastDay's
// return object: forecast, actual, lyAdj — every other field (oepe/tpph/labor/t2/t4/t6/
// varPct/pass/goal/...) is discarded by that specific caller. Traced forecastDay's own
// source (src/engine/forecast.js) for what those three fields actually depend on, for the
// model EVERY real store is assigned at the weekly horizon ('ae' — confirmed via
// DEFAULT_MODEL_ASSIGNMENTS in src/constants.js, all 27 stores, and forecastDay's own
// comments say so repeatedly): only ds.laborRows/laborIdx/laborByLoc and ds.qsrActSummaryRows
// (via forecastDay's internal _qsrActIdx cache) feed those three fields for the 'ae' branch —
// NOT ds.opsRows/ctrlRows/weatherRows/peaksRows, which only feed the DISCARDED fields. That
// materially shrinks what this job needs to load correctly versus replicating App.js's full
// ~30-source ds object, and every piece of logic used to build what remains (the
// supplementLaborWithSched auto/manual merge, the bIdx/bLocIdx indices, forecastDay and
// getModelAssignment themselves) is IMPORTED from the real engine modules, not hand-copied —
// so a future change to any of that logic reaches this job automatically instead of silently
// drifting from what the browser computes. See the PR body for the full trace.
//
// ── Model-assignment overrides ──────────────────────────────────────────────────────────
// forecastDay's own model routing (getModelAssignment, called INTERNALLY, not by this
// script) reads a per-store override blob from localStorage in the browser — cloud-mirrored
// to user_settings (key 'model_assignments', see labor-tools.js's _pushModelAssignments).
// There's no localStorage in Node, so this script fetches that same cloud blob and shims a
// minimal localStorage onto globalThis before calling forecastDay, so forecastDay's
// unmodified internal lookup sees the exact same override data the browser would.

import { createClient } from '@supabase/supabase-js';
import { supplementLaborWithSched } from '../src/engine/labor-supplement.js';
import { forecastDay, bLocIdx, setEventImpact } from '../src/engine/forecast.js';
import { orgEventsToDayMap } from '../src/engine/events-import.js';
import { computeEventFactors } from '../src/utils/events.js';
import { DEFAULT_TARGETS, MODEL_ASSIGNMENT_KEY, STORE_NAMES } from '../src/constants.js';

const STORE_LOCS = Object.keys(STORE_NAMES).filter(l => /^\d+$/.test(l));

const LABOR_DAYS_BACK   = 400; // matches loadLaborRows' default — fetchLY needs up to ~385 days back
const QSR_ACT_DAYS_BACK = 60;  // matches loadQsrActSummary's default in App.js's _stQsrsoftActSummary
const DEBUG = process.env.FORECAST_PRECOMPUTE_DEBUG === '1';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

function fmtDate(d) { return d.toISOString().slice(0, 10); }
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function dKeyLocal(d) { return d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10); }

// Same trivial date-keyed index every ds.laborIdx build site uses (src/app/App.js's
// _mkIdx/_mkIdx2, src/engine/pipeline.js's bIdx) — not exported anywhere, so reimplemented
// here verbatim rather than imported. Pure grouping, no business logic to drift.
function bIdx(rows) {
  const idx = {};
  for (const r of (rows || [])) {
    if (!r.loc || !r.date) continue;
    const k = r.loc + '_' + dKeyLocal(r.date);
    (idx[k] || (idx[k] = [])).push(r);
  }
  return idx;
}

// ── labor_rows → ds.laborRows (mirrors loadLaborRows, src/lib/supabase.js:676) ────────────
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
    loc:      r.loc,
    date:     new Date(r.report_date + 'T00:00:00'),
    sales:    r.sales,
    laborPct: r.labor_pct,
    tpph:     r.tpph,
    otHrs:    r.ot_hrs,
    otDollar: r.ot_dollar,
  }));
}

// ── qsr_daily_activity_rollup → ds.qsrActSummaryRows (mirrors _qsrActFromSummed,
// src/lib/supabase.js:1926 — only the fields forecastDay's 'ae' branch / _qsrActIdx
// fallback actually reads: sales, gc) ──────────────────────────────────────────────────────
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
    loc: String(parseInt(v.loc, 10)),
    date: new Date(v.dt + 'T00:00:00'),
    sales: v.product_sales || 0,
    gc: v.transactions || 0,
  }));
}

// ── org_events → userEvents day-map (mirrors loadOrgEvents, src/lib/supabase.js:3342, and
// App.js's own orgEventsToDayMap(orgEvents, iconFor) hydration) ───────────────────────────
// Dispatch23 §1: forecastDay's event-adjustment block (_evFactor) reads settings._userEvents
// and settings._eventFactors and silently returns a 0 lift/dip when either is absent — this
// script originally called forecastDay with an empty {} settings object, so every cache-hit
// forecast during a real tagged event (a football game, a district holiday, a price change)
// was silently the UN-adjusted number, diverging from what the live browser path computes.
// iconFor is a no-op here (icon is cosmetic UI, never read by computeEventFactors/forecastDay's
// event-factor logic) — avoids importing EVENT_TYPES just for a display string this script
// never displays.
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
    // Dispatch24 Workstream B (#388) — scope + resolved store list (mirrors loadOrgEvents,
    // src/lib/supabase.js). Undefined on a DB that hasn't run schema-org-events-scope.sql yet;
    // orgEventsToDayMap() already treats a missing/'store' scope as "expand to just [loc]".
    scope: r.scope ?? 'store', scopeState: r.scope_state ?? null, scopeLocs: r.scope_locs ?? null,
  }));
}

// ── org_event_exceptions → per-store overrides on a scoped event (mirrors loadOrgEventExceptions,
// src/lib/supabase.js) — open design question #1's answer. Missing table (pre-migration) is
// non-fatal: orgEventsToDayMap treats {} as "no exceptions", same as its other callers.
async function loadOrgEventExceptions() {
  const { data, error } = await supabase.from('org_event_exceptions').select('*');
  if (error) { console.warn(`[forecast-precompute] org_event_exceptions load failed (non-fatal, treated as no exceptions): ${error.message}`); return {}; }
  const map = {};
  for (const r of (data || [])) (map[r.event_id] = map[r.event_id] || {})[String(r.loc)] = { status: r.status, overrides: r.overrides || null };
  return map;
}

// ── event_impact → the Event Impact Registry (mirrors loadEventImpact, src/lib/supabase.js:3447,
// and App.js's _stEventImpact -> setEventImpact()) — the curated per-store x event-type MEASURED
// lift/dip that forecastDay's _evFactor checks FIRST, before the learned/computed factors. ─────
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
  return rows.map(r => ({
    loc: String(r.loc), eventType: r.event_type,
    homeImpact: r.home_impact, awayImpact: r.away_impact,
  }));
}

// ── user_settings(key='model_assignments') → localStorage shim ────────────────────────────
// Single-tenant today (one real operator) — grabs the most recently updated row for this
// key rather than filtering by user_id, since the service-role client has no browser
// session to derive auth.uid() from. Flagged here for whoever adds a second real user.
async function loadModelAssignmentOverrides() {
  const { data, error } = await supabase.from('user_settings')
    .select('value,updated_at').eq('key', 'model_assignments')
    .order('updated_at', { ascending: false }).limit(1).maybeSingle();
  if (error) { console.warn(`[forecast-precompute] model_assignments load failed (non-fatal, using DEFAULT_MODEL_ASSIGNMENTS only): ${error.message}`); return {}; }
  return (data && data.value) || {};
}

// ── the current business week's 7 days, same logic as at-a-glance.js's weekProjections ────
function currentWeekDays(weekStartDay) {
  const wsd = weekStartDay != null ? weekStartDay : 3; // default Wednesday, matches DEF_SETTINGS.weekStartDay
  const today = new Date();
  const ws = new Date(today);
  while (ws.getDay() !== wsd) ws.setDate(ws.getDate() - 1);
  return Array.from({ length: 7 }, (_, i) => addDays(new Date(ws.getFullYear(), ws.getMonth(), ws.getDate(), 12), i));
}

async function main() {
  console.log('[forecast-precompute] loading source data...');
  const [laborRowsRaw, qsrActSummaryRows, modelOverrides, orgEvents, eventImpactRows, orgEventExceptions] = await Promise.all([
    loadLaborRows(LABOR_DAYS_BACK),
    loadQsrActSummaryRows(QSR_ACT_DAYS_BACK),
    loadModelAssignmentOverrides(),
    loadOrgEvents(),
    loadEventImpact(),
    loadOrgEventExceptions(),
  ]);
  console.log(`[forecast-precompute] labor_rows=${laborRowsRaw.length} qsr_act_summary=${qsrActSummaryRows.length} org_events=${orgEvents.length} event_impact=${eventImpactRows.length} org_event_exceptions=${Object.keys(orgEventExceptions).length}`);

  const laborRows = supplementLaborWithSched(laborRowsRaw, qsrActSummaryRows);
  const ds = {
    loaded: true,
    laborRows,
    laborIdx: bIdx(laborRows),
    laborByLoc: bLocIdx(laborRows),
    qsrActSummaryRows,
    targets: {}, // matches real production ds.targets — always {} today, DEFAULT_TARGETS is the live source (see PR body)
  };

  // Same shape App.js builds on startup (orgEventsToDayMap) and the same module-level cache
  // forecastDay's _evFactor reads first (_EVENT_IMPACT via setEventImpact) — see the loader
  // functions' own comments above for why this was missing and what it silently cost.
  const userEvents = orgEventsToDayMap(orgEvents, () => '', orgEventExceptions);
  const eventImpactMap = {};
  for (const r of eventImpactRows) {
    const k = String(r.loc).replace(/^0+/, '');
    (eventImpactMap[k] = eventImpactMap[k] || {})[r.eventType] = { home: r.homeImpact, away: r.awayImpact };
  }
  setEventImpact(eventImpactMap);
  const eventFactors = computeEventFactors(ds, userEvents);

  // forecastDay's internal getModelAssignment() reads this via localStorage in the browser —
  // shimmed here so its UNMODIFIED lookup sees the same cloud-persisted override blob.
  globalThis.localStorage = {
    _store: { [MODEL_ASSIGNMENT_KEY]: JSON.stringify(modelOverrides) },
    getItem(k) { return Object.prototype.hasOwnProperty.call(this._store, k) ? this._store[k] : null; },
    setItem(k, v) { this._store[k] = String(v); },
    removeItem(k) { delete this._store[k]; },
  };

  const weekDays = currentWeekDays(); // weekStartDay override could be added here if a real second tenant needs it
  console.log(`[forecast-precompute] week ${fmtDate(weekDays[0])}..${fmtDate(weekDays[6])}, ${STORE_LOCS.length} stores`);

  // useEventRegistry:true matches DEF_SETTINGS's real default (src/constants.js) — forecastDay's
  // own _evFactor short-circuits to 0 whenever this is falsy, so leaving it out here would
  // silently reintroduce the exact gap this fix closes even with _userEvents/_eventFactors
  // populated correctly above.
  const cfg = { useEventRegistry: true, _userEvents: userEvents, _eventFactors: eventFactors };

  const upsertRows = [];
  for (const loc of STORE_LOCS) {
    const t = DEFAULT_TARGETS[loc] || {};
    for (const d of weekDays) {
      const r = forecastDay(loc, d, ds, cfg, null, t);
      upsertRows.push({
        loc,
        dt: fmtDate(d),
        forecast: r.forecast ?? null,
        actual: r.actual ?? null,
        ly: r.lyAdj ?? null,
        model_used: r.modelUsed || null,
        computed_at: new Date().toISOString(),
      });
      if (DEBUG) console.log(`[forecast-precompute]   ${loc} ${fmtDate(d)} fc=${r.forecast} act=${r.actual} ly=${r.lyAdj} model=${r.modelUsed}`);
    }
  }

  const { error } = await supabase.from('forecast_week_cache')
    .upsert(upsertRows, { onConflict: 'tenant_id,loc,dt' });
  if (error) throw new Error(`forecast_week_cache upsert failed: ${error.message}`);
  console.log(`[forecast-precompute] wrote ${upsertRows.length} rows to forecast_week_cache`);
}

main().catch(e => { console.error('[forecast-precompute] FAILED:', e); process.exit(1); });
