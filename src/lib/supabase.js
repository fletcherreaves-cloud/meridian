// @ts-nocheck
import { createClient } from '@supabase/supabase-js';

const URL  = import.meta.env.VITE_SUPABASE_URL;
const KEY  = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!URL || !KEY) {
  console.info('Meridian: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set — running in local-only mode');
}

// supabase is null in local-only mode; all callers must guard with `if (supabase)`
export const supabase = (URL && KEY) ? createClient(URL, KEY) : null;

// Paginate through all rows — Supabase caps at 1000 by default.
// Pass a builder fn that receives (from, to) and returns a Supabase query.
// PARALLEL pagination: count the rows, then fire every page at once (Promise.allSettled)
// instead of walking pages sequentially. Much faster for the multi-thousand-row current-
// window streams, and a partial/throttled read keeps whatever pages returned (ordered
// newest-first) instead of rejecting. Use for big date-windowed reads.
// ── Data-load failure registry ───────────────────────────────────────────────
// Systemic bug class 4: silent emptiness. Measured on production 2026-08-07 — 22 page
// requests returned HTTP 500 and the app rendered the short dataset without a word.
// Four genuinely different failures had one indistinguishable symptom (a slightly-wrong
// number): a legitimately empty result, a row-cap truncation, a pull that silently
// returned 0 rows, and an upstream column rename. You cannot tell "no data" from
// "we lost some data" by looking at a tile.
//
// This makes partial loads announce themselves. It does NOT retry and does NOT change
// what renders — a short dataset still renders, because showing recent days beats
// showing nothing. It just stops the loss being invisible.
const _dataErrors = [];
export function dataLoadErrors() { return _dataErrors.slice(); }
export function clearDataLoadErrors() { _dataErrors.length = 0; }
function _recordDataError(label, failed, total, detail) {
  const entry = { label, failed, total, detail: detail || null, at: new Date().toISOString() };
  _dataErrors.push(entry);
  console.error(
    `%c[Meridian] DATA INCOMPLETE — ${label}: ${failed}/${total} page(s) failed. Values from this source are UNDERSTATED.`,
    'color:#ef4444;font-weight:700', detail || '');
  try {
    window.dispatchEvent(new CustomEvent('mf:data-error', { detail: entry }));
  } catch { /* non-browser context */ }
}

// ── Global in-flight cap ─────────────────────────────────────────────────────
// Measured on production 2026-08-07, before and after v4.846's tiered startup.
//
// Every paginated loader here fires ALL its pages at once. That was fine while the
// startup chain ran stages one after another — the serialisation was accidentally
// rate-limiting us, keeping each stream's page-burst in its own time window. v4.846
// removed the serialisation without replacing that rate limiting, so ~100+ requests
// (qsr_daily_activity ~40 pages + labor_rows ~45 + ops_rows ~44 + ctrl_rows ~45) went
// out simultaneously. Result: qsr_daily_activity took 46s to paginate where it took
// 13.3s with the pipe to itself, and HTTP 500s went from 3 to 8.
//
// So: keep the parallelism, add the back-pressure the serial chain used to provide by
// accident. Pages queue past the cap instead of being fired into a wall.
const _MAX_INFLIGHT = 6;
let _inflight = 0;
const _waiting = [];
function _acquire() {
  if (_inflight < _MAX_INFLIGHT) { _inflight++; return Promise.resolve(); }
  return new Promise(resolve => _waiting.push(resolve));
}
function _release() {
  const next = _waiting.shift();
  if (next) next();            // hand the slot straight over, don't decrement
  else _inflight--;
}
/** Run fn() with at most _MAX_INFLIGHT concurrent Supabase requests in flight. */
async function _limited(fn) {
  await _acquire();
  try { return await fn(); } finally { _release(); }
}

async function _pagedParallel({ table, select, gteCol, gteVal, orderCol, ascending = false, extraOrder = [], pageSize = 1000, label = '' }) {
  if (!supabase) return [];
  let head = supabase.from(table).select(orderCol || 'loc', { count: 'exact', head: true });
  if (gteCol) head = head.gte(gteCol, gteVal);
  const { count } = await head;
  const pages = Math.max(1, Math.ceil((count || 0) / pageSize));
  const reqs = [];
  for (let p = 0; p < pages; p++) {
    let q = supabase.from(table).select(select);
    if (gteCol) q = q.gte(gteCol, gteVal);
    q = q.order(orderCol, { ascending });
    for (const oc of extraOrder) q = q.order(oc);
    reqs.push(() => q.range(p * pageSize, p * pageSize + pageSize - 1));
  }
  const settled = await Promise.allSettled(reqs.map(f => _limited(f)));
  const data = []; let failed = 0;
  for (const s of settled) {
    if (s.status === 'fulfilled' && s.value && !s.value.error && s.value.data) data.push(...s.value.data);
    else failed++;
  }
  if (failed) _recordDataError(label || table, failed, pages, 'egress throttle or server error — newest-first keeps the recent days');
  return data;
}

async function fetchAll(builderFn, pageSize = 1000, label = '') {
  let all = [], from = 0;
  while (true) {
    const { data, error } = await builderFn(from, from + pageSize - 1);
    // A mid-pagination error (e.g. a free-tier egress/throttle cutoff) previously returned
    // whatever pages loaded so far AS IF complete — silently dropping the rest of the rows.
    // On big reads ordered oldest-first that meant the NEWEST days vanished with no warning
    // (the "data stuck at an old date" bug). Warn loudly and mark the result partial so
    // callers/guards can surface a stale-data banner instead of trusting a truncated set.
    if (error) {
      console.warn(`[Meridian] fetchAll(${label || '?'}) truncated after ${all.length} rows — read error:`, error.message || error);
      try { Object.defineProperty(all, '_partial', { value: true, enumerable: false }); } catch {}
      break;
    }
    if (!data?.length) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

// ── Manual report upload (cross-device sync) ──────────────────────────────────
// Uploads a raw file to the 'reports' storage bucket and inserts/updates
// a pending_reports record so other devices can discover and download it.
// Returns the pending_reports row (with .id) on success, or null on error.
export async function uploadReportFile(file, reportType) {
  if (!supabase) return null;
  try {
    const ab = await file.arrayBuffer();
    // Encode to base64 in chunks to avoid call stack overflow on large files
    const bytes = new Uint8Array(ab);
    const CHUNK = 8192;
    let binary = '';
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + CHUNK, bytes.length)));
    }
    const fileData = btoa(binary);
    const storagePath = `manual/${new Date().toISOString().slice(0, 10)}/${file.name}`;
    const { data, error } = await supabase.from('pending_reports')
      .upsert({ filename: file.name, storage_path: storagePath, report_type: reportType,
                source: 'manual', processed: false, file_data: fileData },
               { onConflict: 'storage_path' })
      .select('id').single();
    if (error) { console.warn('[uploadReportFile] failed:', error.message); return null; }
    return data || null;
  } catch(e) { console.error('[uploadReportFile] exception:', e); return null; }
}

// ── Monthly Targets ───────────────────────────────────────────────────────────
// Save parsed monthly targets to Supabase. targets = { loc: {tCrewLabor, ...} }
// Returns { saved, errors }.
// Apply Smart Targets to the OFFICIAL monthly_targets for one (year, month).
// entries = [{loc, val}]; col = the DB column to set (e.g. 'sales_proj',
// 'crew_labor_pct', 'fob_target_pct'). Partial upsert — ON CONFLICT updates ONLY
// this column (+updated_at), preserving every other target already set for that
// store/month. Feeds Monthly Projections.
export async function applyOfficialTargets(entries, year, month, col = 'sales_proj') {
  if (!supabase) return { saved: 0, errors: ['Supabase not configured'] };
  const rows = (entries || []).filter(e => e && e.loc != null && e.val != null).map(e => ({
    loc: String(e.loc), year, month, [col]: e.val, updated_at: new Date().toISOString(),
  }));
  if (!rows.length) return { saved: 0, errors: [] };
  const { error } = await supabase.from('monthly_targets').upsert(rows, { onConflict: 'loc,year,month' });
  if (error) { console.error('[monthly_targets] applyOfficial error:', error.message); return { saved: 0, errors: [error.message] }; }
  return { saved: rows.length, errors: [] };
}

export async function saveMonthlyTargets(targets, year, month) {
  if (!supabase) return { saved: 0, errors: ['Supabase not configured'] };
  const rows = Object.entries(targets).map(([loc, t]) => ({
    loc, year, month,
    sales_proj:         t.tProdSales        ?? null,
    crew_labor_pct:     t.tCrewLabor        ?? null,
    bonus_crew_pct:     t.tBonusLabor       ?? null,
    tpph_target:        t.tTpph             ?? null,
    base_food_pct:      t.tFOBBase          ?? null,
    disc_coup_pct:      t.tDiscCoupPct      ?? null,
    comp_waste_pct:     t.tCompWaste        ?? null,
    raw_waste_pct:      t.tRawWaste         ?? null,
    condiment_pct:      t.tCondiment        ?? null,
    emp_food_pct:       t.tEmpFood          ?? null,
    stat_loss_pct:      t.tStatLoss         ?? null,
    unex_diff_pct:      t.tUnex             ?? null,
    fob_target_pct:     t.tFOBTarget        ?? null,
    total_food_cost_pct:t.tFOBTotal         ?? null,
    paper_cost_pct:     t.tPaperCost        ?? null,
    op_supply_target:   t.tOpSupply         ?? null,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase
    .from('monthly_targets')
    .upsert(rows, { onConflict: 'loc,year,month' });
  if (error) {
    if (error.message?.includes('relation') || error.code === '42P01') {
      console.error('[monthly_targets] Table does not exist in Supabase. Run the monthly_targets block from schema.sql in your Supabase SQL editor.');
    } else {
      console.error('[monthly_targets] save error:', error.message, error);
    }
    return { saved: 0, errors: [error.message] };
  }
  console.log(`[monthly_targets] saved ${rows.length} stores for ${year}-${month}`);
  return { saved: rows.length, errors: [] };
}

// Load monthly targets for a given year/month. Returns { loc: {tCrewLabor, ...} }
// Pass year=null/month=null to load the most recent available month.
export async function loadMonthlyTargets(year, month) {
  if (!supabase) return {};
  let q = supabase.from('monthly_targets').select('*');
  if (year && month) {
    q = q.eq('year', year).eq('month', month);
  } else {
    // Most recent month available
    q = q.order('year', { ascending: false }).order('month', { ascending: false }).limit(27);
  }
  const { data, error } = await q;
  if (error || !data) { console.warn('[monthly_targets] load error:', error); return {}; }
  const result = {};
  for (const r of data) {
    result[r.loc] = {
      tProdSales:   r.sales_proj,
      tCrewLabor:   r.crew_labor_pct,
      tBonusLabor:  r.bonus_crew_pct,
      tTpph:        r.tpph_target,
      tFOBBase:     r.base_food_pct,
      tDiscCoupPct: r.disc_coup_pct,
      tCompWaste:   r.comp_waste_pct,
      tRawWaste:    r.raw_waste_pct,
      tCondiment:   r.condiment_pct,
      tEmpFood:     r.emp_food_pct,
      tStatLoss:    r.stat_loss_pct,
      tUnex:        r.unex_diff_pct,
      tFOBTarget:   r.fob_target_pct,
      tFOBTotal:    r.total_food_cost_pct,
      tPaperCost:   r.paper_cost_pct,
      tOpSupply:    r.op_supply_target,
      _year: r.year,
      _month: r.month,
    };
  }
  return result;
}

// Load ALL monthly targets for all available periods.
// Returns { "2026-6": { loc: { tProdSales, tCrewLabor, ... } }, "2026-7": { ... } }
export async function loadAllMonthlyTargets() {
  if (!supabase) return {};
  const { data, error } = await supabase
    .from('monthly_targets')
    .select('*')
    .order('year', { ascending: false })
    .order('month', { ascending: false });
  if (error || !data) { console.warn('[monthly_targets] loadAll error:', error); return {}; }
  const result = {};
  for (const r of data) {
    const key = `${r.year}-${r.month}`;
    if (!result[key]) result[key] = {};
    result[key][r.loc] = {
      tProdSales:   r.sales_proj,
      tCrewLabor:   r.crew_labor_pct,
      tBonusLabor:  r.bonus_crew_pct,
      tTpph:        r.tpph_target,
      tFOBBase:     r.base_food_pct,
      tDiscCoupPct: r.disc_coup_pct,
      tCompWaste:   r.comp_waste_pct,
      tRawWaste:    r.raw_waste_pct,
      tCondiment:   r.condiment_pct,
      tEmpFood:     r.emp_food_pct,
      tStatLoss:    r.stat_loss_pct,
      tUnex:        r.unex_diff_pct,
      tFOBTarget:   r.fob_target_pct,
      tFOBTotal:    r.total_food_cost_pct,
      tPaperCost:   r.paper_cost_pct,
      tOpSupply:    r.op_supply_target,
      _year: r.year,
      _month: r.month,
    };
  }
  return result;
}

// List all available (year, month) combinations in monthly_targets.
export async function listMonthlyTargetPeriods() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('monthly_targets')
    .select('year, month')
    .order('year', { ascending: false })
    .order('month', { ascending: false });
  if (error || !data) return [];
  const seen = new Set();
  return data.filter(r => { const k = `${r.year}-${r.month}`; if(seen.has(k)) return false; seen.add(k); return true; });
}

// ── SMG FullScale persistence ─────────────────────────────────────────────────
// rows: array of { loc, year, month, reportStart, reportEnd, osatTop2, osat5, osatAvg,
//                  osatB2B, accuracyB2B, dtProblem, overallProblem }
export async function saveSmgFullscale(rows) {
  if (!supabase || !rows.length) return { saved: 0, errors: [] };
  const uid = (await supabase.auth.getUser())?.data?.user?.id;
  const upsert = rows.map(r => ({
    loc:             String(r.loc),
    year:            r.year,
    month:           r.month,
    report_start:    r.reportStart  || null,
    report_end:      r.reportEnd    || null,
    osat_top2:       r.osatTop2     ?? null,
    osat_5:          r.osat5        ?? null,
    osat_1:          r.osat1        ?? null,
    osat_avg:        r.osatAvg      ?? null,
    osat_b2b:        r.osatB2B      ?? null,
    accuracy_b2b:    r.accuracyB2B  ?? null,
    dt_problem:      r.dtProblem    ?? null,
    overall_problem: r.overallProblem ?? null,
    n:               r.n            ?? null,   // OSAT response count → n-weighted rollups (Notes 36 #7)
    updated_by:      uid || null,
  }));
  let { error } = await supabase.from('smg_fullscale').upsert(upsert, { onConflict: 'loc,year,month' });
  // Resilient to a not-yet-migrated table: if the `n` column doesn't exist, retry without it so
  // SMG uploads never break before the owner runs supabase/schema-smg-n.sql. Self-heals after.
  if (error && /column .*\bn\b.* does not exist|'n' column|column "n"/i.test(error.message || '')) {
    const upsertNoN = upsert.map(({ n, ...rest }) => rest);
    ({ error } = await supabase.from('smg_fullscale').upsert(upsertNoN, { onConflict: 'loc,year,month' }));
    if (!error) console.warn('[smg_fullscale] saved WITHOUT n — run schema-smg-n.sql to enable n-weighted rollups');
  }
  if (error) { console.warn('[smg_fullscale] save error:', error); return { saved: 0, errors: [error.message] }; }
  console.log(`[smg_fullscale] saved ${upsert.length} store records`);
  return { saved: upsert.length, errors: [] };
}

export async function loadSmgFullscale({ year, month } = {}) {
  if (!supabase) return [];
  // Paginate — a full 2020→now backfill (~27 stores × 60+ months ≈ 1,700 rows)
  // exceeds Supabase's 1000-row default cap; a single query would silently drop
  // ~40% of the history. fetchAll pages through everything.
  const data = await fetchAll((from, to) => {
    let q = supabase.from('smg_fullscale').select('*')
      .order('year', {ascending:false}).order('month', {ascending:false});
    if (year)  q = q.eq('year',  year);
    if (month) q = q.eq('month', month);
    return q.range(from, to);
  });
  // Normalize back to camelCase
  return (data || []).map(r => ({
    loc:            r.loc,
    year:           r.year,
    month:          r.month,
    reportStart:    r.report_start,
    reportEnd:      r.report_end,
    osatTop2:       r.osat_top2,
    osat5:          r.osat_5,
    osat1:          r.osat_1,
    osatAvg:        r.osat_avg,
    osatB2B:        r.osat_b2b,
    accuracyB2B:    r.accuracy_b2b,
    dtProblem:      r.dt_problem,
    overallProblem: r.overall_problem,
    n:              r.n ?? null,   // OSAT response count (null on pre-migration rows) → n-weighted rollups
  }));
}

// ── SMG VOICE Performance persistence ────────────────────────────────────────
// rows: array of { period, report_type, operator_id, operator_name, loc, loc_name,
//                  dt_sat, dt_dissat, ir_sat, ir_dissat, accuracy_b2b, quality_b2b,
//                  fries_b2b, snack_wrap_b2b, source_file }
// Row identity = (period, report_type, loc). operator_* is metadata only.
const _VP_METRIC_KEYS = ['dt_sat','dt_dissat','ir_sat','ir_dissat','accuracy_b2b','quality_b2b','fries_b2b','snack_wrap_b2b'];
const _vpFill = r => _VP_METRIC_KEYS.reduce((n, k) => n + (r[k] != null ? 1 : 0), 0);

export async function saveVoicePerf(rows) {
  if (!supabase || !rows.length) return { saved: 0, errors: [] };
  // Identity is (period, report_type, loc) — the STORE, not the operator. A store
  // is covered by several overlapping operator reports and a re-upload under a
  // different filename yields a different operator_id; keying on operator_id let
  // those land as duplicate rows. Org grouping is derived from loc via our own
  // wiring, so operator_id/name are kept only as descriptive metadata.
  // Collapse the batch to one row per (period, report_type, loc), keeping the
  // most-populated (a Postgres upsert also can't touch the same key twice).
  const byKey = {};
  for (const r of rows) {
    if (!r.period || !r.report_type || !r.loc) continue;
    const loc = String(r.loc);
    const k = `${r.period}|${r.report_type}|${loc}`;
    const cand = {
      period:          r.period,
      report_type:     r.report_type,
      operator_id:     r.operator_id || null,
      operator_name:   r.operator_name || null,
      loc,
      loc_name:        r.loc_name || null,
      dt_sat:          r.dt_sat ?? null,
      dt_dissat:       r.dt_dissat ?? null,
      ir_sat:          r.ir_sat ?? null,
      ir_dissat:       r.ir_dissat ?? null,
      accuracy_b2b:    r.accuracy_b2b ?? null,
      quality_b2b:     r.quality_b2b ?? null,
      fries_b2b:       r.fries_b2b ?? null,
      snack_wrap_b2b:  r.snack_wrap_b2b ?? null,
      source_file:     r.source_file || null,
    };
    if (!byKey[k] || _vpFill(cand) > _vpFill(byKey[k])) byKey[k] = cand;
  }
  const upsert = Object.values(byKey);
  if (!upsert.length) return { saved: 0, errors: [] };
  const { error } = await supabase
    .from('smg_voice_performance')
    .upsert(upsert, { onConflict: 'period,report_type,loc' });
  if (error) { console.warn('[voice_perf] save error:', error); return { saved: 0, errors: [error.message] }; }
  console.log(`[voice_perf] saved ${upsert.length} rows`);
  return { saved: upsert.length, errors: [] };
}

export async function loadVoicePerf() {
  if (!supabase) return [];
  // Paginate — a full backfill (months × ~27 stores × 3 report types) blows past
  // Supabase's 1000-row cap; a single query would silently drop the older history.
  const data = await fetchAll((from, to) => supabase
    .from('smg_voice_performance')
    .select('*')
    .order('period', { ascending: false })
    .range(from, to));
  return data || [];
}

// ── SMG VOICE Daypart (Time-of-Day) persistence ──────────────────────────────
// One row per (period, report_type, loc, daypart) with 8 metric %s. Identity is
// the store's daypart within a period/window — operator label is irrelevant.
const _VDP_KEYS = ['dt_sat','dt_dissat','ir_sat','ir_dissat','accuracy_b2b','quality_b2b','fries_b2b','snack_wrap_b2b'];
export async function saveVoiceDaypart(rows) {
  if (!supabase || !rows?.length) return { saved: 0, error: null };
  const byKey = {};
  for (const r of rows) {
    if (!r.period || !r.report_type || !r.loc || !r.daypart) continue;
    const loc = String(r.loc);
    const k = `${r.period}|${r.report_type}|${loc}|${r.daypart}`;
    byKey[k] = {
      period: r.period, report_type: r.report_type, loc, daypart: r.daypart,
      loc_name: r.storeName || r.loc_name || null,
      ..._VDP_KEYS.reduce((o, m) => (o[m] = r[m] ?? null, o), {}),
      source_file: r.source_file || null,
    };
  }
  const upsert = Object.values(byKey);
  if (!upsert.length) return { saved: 0, error: null };
  const { error } = await supabase.from('smg_voice_daypart').upsert(upsert, { onConflict: 'period,report_type,loc,daypart' });
  if (error) { console.warn('[voice_daypart] save error:', error); return { saved: 0, error: error.message }; }
  console.log(`[voice_daypart] saved ${upsert.length} rows`);
  return { saved: upsert.length, error: null };
}

export async function loadVoiceDaypart() {
  if (!supabase) return [];
  const data = await fetchAll((from, to) => supabase
    .from('smg_voice_daypart').select('*')
    .order('period', { ascending: false })
    .range(from, to));
  return (data || []).map(r => ({ ...r, storeName: r.loc_name }));
}

// ── LifeLenz Schedule persistence ────────────────────────────────────────────
// rows: array of parsed LifeLenz rows (loc, date:Date, fcstSales, schVLH, etc.)
export async function saveLifeLenzSchedule(rows) {
  if (!supabase || !rows.length) return { saved: 0, errors: [] };
  const toDateStr = d => {
    const yr = d.getFullYear();
    const mo = String(d.getMonth()+1).padStart(2,'0');
    const dy = String(d.getDate()).padStart(2,'0');
    return `${yr}-${mo}-${dy}`;
  };
  const upsert = rows.map(r => ({
    loc:            r.loc,
    date:           toDateStr(r.date),
    fcst_sales:     r.fcstSales     ?? null,
    adj_fcst_sales: r.adjFcstSales  ?? null,
    sales:          r.sales         ?? null,
    sales_diff:     r.salesDiff     ?? null,
    fcst_tcs:       r.fcstTCs       ?? null,
    tcs:            r.tcs           ?? null,
    tcs_diff:       r.tcsDiff       ?? null,
    labor_pct:      r.laborPct      ?? null,
    proj_vlh:       r.projVLH       ?? null,
    sch_vlh:        r.schVLH        ?? null,
    need_vlh:       r.needVLH       ?? null,
    vlh_diff:       r.vlhDiff       ?? null,
    fix_guide_hrs:  r.fixGuideHrs   ?? null,
    sch_fix_hrs:    r.schFixHrs     ?? null,
    proj_floor:     r.projFloor     ?? null,
    sch_floor:      r.schFloor      ?? null,
    need_floor:     r.needFloor     ?? null,
    ideal_tot_hrs:  r.idealTotHrs   ?? null,
    sal_mgr_hrs:    r.salMgrHrs     ?? null,
    crew_hrs:       r.crewHrs       ?? null,
    tot_hrs_diff:   r.totHrsDiff    ?? null,
    tpmh:           r.tpmh          ?? null,
    updated_at:     new Date().toISOString(),
  }));
  const { error } = await supabase
    .from('lifelenz_schedule')
    .upsert(upsert, { onConflict: 'loc,date' });
  if (error) { console.warn('[lifelenz_schedule] save error:', error); return { saved: 0, errors: [error.message] }; }
  console.log(`[lifelenz_schedule] saved ${upsert.length} rows`);
  return { saved: upsert.length, errors: [] };
}

// Load LifeLenz schedule rows — defaults to last 90 days + next 30 days
export async function loadLifeLenzSchedule({ daysBack = 455, daysFwd = 30 } = {}) {   // was 1825 (5yr) — egress guard, ~15 months back covers YoY + trends
  if (!supabase) return [];
  const start = new Date(); start.setDate(start.getDate() - daysBack);
  const end   = new Date(); end.setDate(end.getDate() + daysFwd);
  const fmt  = d => d.toISOString().slice(0, 10);
  // Paginate — a multi-year window across 27 stores far exceeds Supabase's 1000-row
  // cap; a single select silently returned only the newest ~1000 rows (~37 days).
  const data = await fetchAll((lo, hi) => supabase
    .from('lifelenz_schedule')
    .select('*')
    .gte('date', fmt(start))
    .lte('date', fmt(end))
    .order('date', { ascending: false })
    .range(lo, hi));
  if (!data || !data.length) return [];
  return data.map(r => ({
    // Strip zero-padding ("0003708" → "3708") — same normalization loadQsrActSummary/
    // _loadOpsTable already apply. Without it, schedRows carries the padded NSN format while
    // laborRows/allLocs/STORE_NAMES use unpadded, so any loc-keyed merge or allLocs.includes()
    // check silently drops every schedRows row (2026-08-04, found while researching the DI
    // Calibration trailing-MAPE gap — same bug class as v4.809).
    loc:           String(parseInt(r.loc, 10)),
    date:          new Date(r.date + 'T12:00:00'),
    fcstSales:     r.fcst_sales,
    adjFcstSales:  r.adj_fcst_sales,
    sales:         r.sales,
    salesDiff:     r.sales_diff,
    fcstTCs:       r.fcst_tcs,
    tcs:           r.tcs,
    tcsDiff:       r.tcs_diff,
    laborPct:      r.labor_pct,
    projVLH:       r.proj_vlh,
    schVLH:        r.sch_vlh,
    needVLH:       r.need_vlh,
    vlhDiff:       r.vlh_diff,
    fixGuideHrs:   r.fix_guide_hrs,
    schFixHrs:     r.sch_fix_hrs,
    projFloor:     r.proj_floor,
    schFloor:      r.sch_floor,
    needFloor:     r.need_floor,
    idealTotHrs:   r.ideal_tot_hrs,
    salMgrHrs:     r.sal_mgr_hrs,
    crewHrs:       r.crew_hrs,
    totHrsDiff:    r.tot_hrs_diff,
    tpmh:          r.tpmh,
    // Re-derive computed fields
    schVsIdealDiff: (r.crew_hrs > 0 && r.ideal_tot_hrs > 0) ? r.crew_hrs - (r.ideal_tot_hrs + r.sch_fix_hrs) : 0,
    schVLHOverNeed: (r.sch_vlh > 0 && r.need_vlh > 0) ? r.sch_vlh - r.need_vlh : 0,
  }));
}

// Load LifeLenz per-job (station) hours+cost rows — one per store × week × role.
// Pre-aggregated server-side by scripts/lifelenz-pull.mjs (ShiftsForSchedulePeriod).
// Default window covers ~1 year of weeks. Returns camelCase rows keyed for the
// Weekly Schedule Summary panel; loc is left zero-padded (panel normalizes).
export async function loadLifeLenzJobHours({ weeksBack = 60, weeksFwd = 4 } = {}) {
  if (!supabase) return [];
  const start = new Date(); start.setDate(start.getDate() - weeksBack * 7);
  const end   = new Date(); end.setDate(end.getDate() + weeksFwd * 7);
  const fmt  = d => d.toISOString().slice(0, 10);
  const data = await fetchAll((lo, hi) => supabase
    .from('lifelenz_job_hours')
    .select('*')
    .gte('week_start', fmt(start))
    .lte('week_start', fmt(end))
    .order('week_start', { ascending: false })
    .range(lo, hi));
  if (!data || !data.length) return [];
  return data.map(r => ({
    loc:            r.loc,
    weekStart:      r.week_start,          // 'YYYY-MM-DD' Wednesday anchor
    businessRoleId: r.business_role_id,
    name:           r.role_name,
    category:       r.category,
    code:           r.code,
    hours:          r.hours,
    cost:           r.cost,
    regHours:       r.reg_hours,
    otHours:        r.ot_hours,
    nShifts:        r.n_shifts,
  }));
}

// Save labor rows to Supabase for cross-device persistence and DI calibration history
export async function saveLaborRows(rows) {
  if (!supabase || !rows?.length) return { saved: 0, errors: [] };
  // Exclude period-summary rows — they have multi-day totals, not daily actuals.
  const valid = rows.filter(r => r.loc && r.date && r.sales > 0 && !r.isPeriodSummary);
  if (!valid.length) return { saved: 0, errors: [] };
  const upsert = valid.map(r => ({
    loc:         String(r.loc),
    report_date: r.date instanceof Date
      ? r.date.toISOString().slice(0, 10)
      : String(r.date).slice(0, 10),
    sales:       r.sales       ?? null,
    labor_pct:   r.laborPct    ?? null,
    tpph:        r.tpph        ?? null,
    ot_hrs:      r.otHrs       ?? null,
    ot_dollar:   r.otDollar    ?? null,
  }));
  const CHUNK = 500;
  let saved = 0;
  const errors = [];
  for (let i = 0; i < upsert.length; i += CHUNK) {
    const { error } = await supabase
      .from('labor_rows')
      .upsert(upsert.slice(i, i + CHUNK), { onConflict: 'loc,report_date' });
    if (error) { console.warn('[labor_rows] save error:', error); errors.push(error.message); }
    else saved += Math.min(CHUNK, upsert.length - i);
  }
  console.log(`[labor_rows] saved ${saved} rows`);
  return { saved, errors };
}

// Load all labor rows from Supabase (for DI calibration history accumulation)
// WINDOWED (v4.848). This loader previously fetched the ENTIRE table history on every
// login. Measured on production: labor_rows/ops_rows/ctrl_rows/audit_rows/peaks_rows
// together were ~150k of the ~250k rows per login, and request latency degraded from
// ~1-4s early in a load to 10-18s late — the signature of cumulative egress throttling,
// which _pagedParallel's own "egress throttle?" warning already suspected. Volume is the
// binding constraint, not ordering: two scheduling changes (v4.846, v4.847) both made
// total wall time worse while fetching the same bytes.
// 400 days is deliberate, not round: it covers matched-day vs-LY (365) and the
// documented backtest window (BT_DAYS=400). Anything shorter would silently break
// last-year comparisons and model backtests.
export async function loadLaborRows(daysBack = 400) {
  if (!supabase) return [];
  const _cut = new Date(); _cut.setDate(_cut.getDate() - daysBack);
  const _cutStr = _cut.toISOString().slice(0, 10);
  const data = await _pagedParallel({ gteCol: 'report_date', gteVal: _cutStr, table: 'labor_rows', select: '*', orderCol: 'report_date', ascending: false, label: 'laborRows' });
  if (!data.length) return [];
  return data.map(r => ({
    loc:      r.loc,
    date:     new Date(r.report_date + 'T00:00:00'),
    sales:    r.sales,
    laborPct: r.labor_pct,
    tpph:     r.tpph,
    otHrs:    r.ot_hrs,
    otDollar: r.ot_dollar,
  }));
}

// ── FOB / Food Over Base rows ────────────────────────────────────────────────
export async function saveFobRows(rows) {
  if (!supabase || !rows?.length) return { saved: 0, errors: [] };
  const toDate = r => r.date instanceof Date ? r.date.toISOString().slice(0,10) : String(r.date).slice(0,10);
  const upsert = rows.map(r => ({
    loc:                  String(r.loc),
    date:                 toDate(r),
    sales:                r.sales               ?? null,
    base_food_pct:        r.baseFoodPct         ?? null,
    fob_pct:              r.fobPct              ?? null,
    comp_waste:           r.compWaste           ?? null,
    raw_waste:            r.rawWaste            ?? null,
    condiment:            r.condiment           ?? null,
    emp_meal:             r.empMeal             ?? null,
    stat_var:             r.statVar             ?? null,
    unexplained:          r.unexplained         ?? null,
    disc_coupon:          r.discCoupon          ?? null,
    pl_food_promo:        r.pLFoodPromo         ?? null,
    pl_paper_promo:       r.pLPaperPromo        ?? null,
    pl_paper_pct:         r.pLPaperPct          ?? null,
    pl_food_pct:          r.pLFoodPct           ?? null,
    labor_pct:            r.laborPct            ?? null,
    tpph:                 r.tpph                ?? null,
    sales_vs_ly:          r.salesVsLY           ?? null,
    ops_supplies:         r.opsSupplies         ?? null,
    fob_dollar:           r.fobDollar           ?? null,
    fob_wo_unexp_pct:     r.fobWOUnexpPct       ?? null,
    fob_wo_unexp_dollar:  r.fobWOUnexpDollar    ?? null,
    pl_food_cost_dollar:  r.pLFoodCostDollar    ?? null,
    pl_paper_cost_dollar: r.pLPaperCostDollar   ?? null,
  }));
  const CHUNK = 500;
  let saved = 0; const errors = [];
  for (let i = 0; i < upsert.length; i += CHUNK) {
    const { error } = await supabase.from('fob_rows').upsert(upsert.slice(i, i + CHUNK), { onConflict: 'loc,date' });
    if (error) { console.warn('[fob_rows] save error:', error); errors.push(error.message); }
    else saved += Math.min(CHUNK, upsert.length - i);
  }
  console.log(`[fob_rows] saved ${saved} rows`);
  return { saved, errors };
}

export async function loadFobRows() {
  if (!supabase) return [];
  const { data, error } = await supabase.from('fob_rows').select('*').order('date', { ascending: false });
  if (error || !data) { console.warn('[fob_rows] load error:', error); return []; }
  return data.map(r => ({
    loc:                r.loc,
    date:               new Date(r.date + 'T00:00:00'),
    sales:              r.sales,
    baseFoodPct:        r.base_food_pct,
    fobPct:             r.fob_pct,
    compWaste:          r.comp_waste,
    rawWaste:           r.raw_waste,
    condiment:          r.condiment,
    empMeal:            r.emp_meal,
    statVar:            r.stat_var,
    unexplained:        r.unexplained,
    discCoupon:         r.disc_coupon,
    pLFoodPromo:        r.pl_food_promo,
    pLPaperPromo:       r.pl_paper_promo,
    pLPaperPct:         r.pl_paper_pct,
    pLFoodPct:          r.pl_food_pct,
    laborPct:           r.labor_pct,
    tpph:               r.tpph,
    salesVsLY:          r.sales_vs_ly,
    opsSupplies:        r.ops_supplies,
    fobDollar:          r.fob_dollar,
    fobWOUnexpPct:      r.fob_wo_unexp_pct,
    fobWOUnexpDollar:   r.fob_wo_unexp_dollar,
    pLFoodCostDollar:   r.pl_food_cost_dollar,
    pLPaperCostDollar:  r.pl_paper_cost_dollar,
  }));
}

// ── 3 Peaks rows ─────────────────────────────────────────────────────────────
export async function savePeaksRows(rows) {
  if (!supabase || !rows?.length) return { saved: 0, errors: [] };
  const toDate = r => r.date instanceof Date ? r.date.toISOString().slice(0,10) : String(r.date).slice(0,10);
  const upsert = rows.map(r => ({
    loc:           String(r.loc),
    date:          toDate(r),
    slice:         r.slice || '',
    is_svc:        r._peakSvc === true,
    oepe:          r.oepe          ?? null,
    r2p:           r.r2p           ?? null,
    avg_ctp:       r.avgCTP        ?? null,
    kvst:          r.kvst          ?? null,
    kvsu:          r.kvsu          ?? null,
    dt_gc:         r.dtGC          ?? null,
    dt_order_time: r.dtOrderTime   ?? null,
    dt_line_time:  r.dtLineTime    ?? null,
    dt_win1:       r.dtWin1        ?? null,
    dt_win2:       r.dtWin2        ?? null,
    park_cnt:      r.parkCnt       ?? null,
    park_pct:      r.parkPct       ?? null,
    park_time:     r.parkTime      ?? null,
    avg_dt_ttl:    r.avgDTTTL      ?? null,
    net_sales:     r.netSales      ?? null,
    prod_sales:    r.prodSales     ?? null,
    gc:            r.gc            ?? null,
    avg_check:     r.avgCheck      ?? null,
    tpph:          r.tpph          ?? null,
    spph:          r.spph          ?? null,
    updated_at:    new Date().toISOString(),
  }));
  const CHUNK = 500;
  let saved = 0; const errors = [];
  for (let i = 0; i < upsert.length; i += CHUNK) {
    const { error } = await supabase.from('peaks_rows').upsert(upsert.slice(i, i+CHUNK), { onConflict: 'loc,date,slice,is_svc' });
    if (error) { console.warn('[peaks_rows] save error:', error); errors.push(error.message); }
    else saved += Math.min(CHUNK, upsert.length - i);
  }
  return { saved, errors };
}

// WINDOWED (v4.848). This loader previously fetched the ENTIRE table history on every
// login. Measured on production: labor_rows/ops_rows/ctrl_rows/audit_rows/peaks_rows
// together were ~150k of the ~250k rows per login, and request latency degraded from
// ~1-4s early in a load to 10-18s late — the signature of cumulative egress throttling,
// which _pagedParallel's own "egress throttle?" warning already suspected. Volume is the
// binding constraint, not ordering: two scheduling changes (v4.846, v4.847) both made
// total wall time worse while fetching the same bytes.
// 400 days is deliberate, not round: it covers matched-day vs-LY (365) and the
// documented backtest window (BT_DAYS=400). Anything shorter would silently break
// last-year comparisons and model backtests.
export async function loadPeaksRows(daysBack = 400) {
  if (!supabase) return [];
  const _cut = new Date(); _cut.setDate(_cut.getDate() - daysBack);
  const _cutStr = _cut.toISOString().slice(0, 10);
  // PARALLEL pagination (bounded by the global in-flight cap) rather than fetchAll's
  // sequential page-after-page loop. Measured 2026-08-07: audit_rows paged 23 times
  // strictly one after another and owned the entire tail of the load — t=119s to t=156s,
  // the last 37 seconds, on its own. It runs in T3 so it never blocked usability, but it
  // was 37s of wall clock for no reason.
  const data = await _pagedParallel({ table: 'peaks_rows', select: '*', gteCol: 'date', gteVal: _cutStr, orderCol: 'date', ascending: false, label: 'peaks_rows' });
  if (!data.length) return [];
  return data.map(r => ({
    loc:         r.loc,
    date:        new Date(r.date + 'T00:00:00'),
    slice:       r.slice,
    _peakSvc:    r.is_svc,
    oepe:        r.oepe,
    r2p:         r.r2p,
    avgCTP:      r.avg_ctp,
    kvst:        r.kvst,
    kvsu:        r.kvsu,
    dtGC:        r.dt_gc,
    dtOrderTime: r.dt_order_time,
    dtLineTime:  r.dt_line_time,
    dtWin1:      r.dt_win1,
    dtWin2:      r.dt_win2,
    parkCnt:     r.park_cnt,
    parkPct:     r.park_pct,
    parkTime:    r.park_time,
    avgDTTTL:    r.avg_dt_ttl,
    netSales:    r.net_sales,
    prodSales:   r.prod_sales,
    gc:          r.gc,
    avgCheck:    r.avg_check,
    tpph:        r.tpph,
    spph:        r.spph,
  }));
}

// ── Register Audit rows ───────────────────────────────────────────────────────
export async function saveAuditRows(rows) {
  if (!supabase || !rows?.length) return { saved: 0, errors: [] };
  const toDate = r => r.date instanceof Date ? r.date.toISOString().slice(0,10) : String(r.date).slice(0,10);
  const upsert = rows.map(r => ({
    loc:             String(r.loc),
    date:            toDate(r),
    emp:             r.emp || '',
    drawer_sales:    r.drawerSales    ?? null,
    avg_check:       r.avgCheck       ?? null,
    drawer_opens:    r.drawerOpens    ?? null,
    drawer_gc:       r.drawerGC       ?? null,
    emp_meal_disc:   r.empMealDisc    ?? null,
    emp_meal_ch:     r.empMealCh      ?? null,
    manual_ref_amt:  r.manualRefAmt   ?? null,
    refund_cnt:      r.refundCnt      ?? null,
    refund_cash:     r.refundCash     ?? null,
    refund_cashless: r.refundCashless ?? null,
    mgr_meal_amt:    r.mgrMealAmt     ?? null,
    mgr_meal_cnt:    r.mgrMealCnt     ?? null,
    cash_os_dollar:  r.cashOSDollar   ?? null,
    cash_os_pct:     r.cashOSPct      ?? null,
    pos_over_amt:    r.posOverAmt     ?? null,
    pos_over_cnt:    r.posOverCnt     ?? null,
    promo_amt:       r.promoAmt       ?? null,
    promo_cnt:       r.promoCnt       ?? null,
    promo_pct:       r.promoPct       ?? null,
    t_red_b_cnt:     r.tRedBCnt       ?? null,
    t_red_b_pct:     r.tRedBPct       ?? null,
    t_red_b_avg:     r.tRedBAvg       ?? null,
    t_red_b_dollar:  r.tRedBDollar    ?? null,
    t_red_a_cnt:     r.tRedACnt       ?? null,
    t_red_a_pct:     r.tRedAPct       ?? null,
    t_red_a_avg:     r.tRedAAvg       ?? null,
    t_red_a_dollar:  r.tRedADollar    ?? null,
    updated_at:      new Date().toISOString(),
  }));
  const CHUNK = 500;
  let saved = 0; const errors = [];
  for (let i = 0; i < upsert.length; i += CHUNK) {
    const { error } = await supabase.from('audit_rows').upsert(upsert.slice(i, i+CHUNK), { onConflict: 'loc,date,emp' });
    if (error) { console.warn('[audit_rows] save error:', error); errors.push(error.message); }
    else saved += Math.min(CHUNK, upsert.length - i);
  }
  return { saved, errors };
}

// WINDOWED (v4.848). This loader previously fetched the ENTIRE table history on every
// login. Measured on production: labor_rows/ops_rows/ctrl_rows/audit_rows/peaks_rows
// together were ~150k of the ~250k rows per login, and request latency degraded from
// ~1-4s early in a load to 10-18s late — the signature of cumulative egress throttling,
// which _pagedParallel's own "egress throttle?" warning already suspected. Volume is the
// binding constraint, not ordering: two scheduling changes (v4.846, v4.847) both made
// total wall time worse while fetching the same bytes.
// 400 days is deliberate, not round: it covers matched-day vs-LY (365) and the
// documented backtest window (BT_DAYS=400). Anything shorter would silently break
// last-year comparisons and model backtests.
export async function loadAuditRows(daysBack = 400) {
  if (!supabase) return [];
  const _cut = new Date(); _cut.setDate(_cut.getDate() - daysBack);
  const _cutStr = _cut.toISOString().slice(0, 10);
  // PARALLEL pagination (bounded by the global in-flight cap) rather than fetchAll's
  // sequential page-after-page loop. Measured 2026-08-07: audit_rows paged 23 times
  // strictly one after another and owned the entire tail of the load — t=119s to t=156s,
  // the last 37 seconds, on its own. It runs in T3 so it never blocked usability, but it
  // was 37s of wall clock for no reason.
  const data = await _pagedParallel({ table: 'audit_rows', select: '*', gteCol: 'date', gteVal: _cutStr, orderCol: 'date', ascending: false, label: 'audit_rows' });
  if (!data.length) return [];
  return data.map(r => ({
    loc:            r.loc,
    date:           new Date(r.date + 'T00:00:00'),
    emp:            r.emp,
    drawerSales:    r.drawer_sales,
    avgCheck:       r.avg_check,
    drawerOpens:    r.drawer_opens,
    drawerGC:       r.drawer_gc,
    empMealDisc:    r.emp_meal_disc,
    empMealCh:      r.emp_meal_ch,
    manualRefAmt:   r.manual_ref_amt,
    refundCnt:      r.refund_cnt,
    refundCash:     r.refund_cash,
    refundCashless: r.refund_cashless,
    mgrMealAmt:     r.mgr_meal_amt,
    mgrMealCnt:     r.mgr_meal_cnt,
    cashOSDollar:   r.cash_os_dollar,
    cashOSPct:      r.cash_os_pct,
    posOverAmt:     r.pos_over_amt,
    posOverCnt:     r.pos_over_cnt,
    promoAmt:       r.promo_amt,
    promoCnt:       r.promo_cnt,
    promoPct:       r.promo_pct,
    tRedBCnt:       r.t_red_b_cnt,
    tRedBPct:       r.t_red_b_pct,
    tRedBAvg:       r.t_red_b_avg,
    tRedBDollar:    r.t_red_b_dollar,
    tRedACnt:       r.t_red_a_cnt,
    tRedAPct:       r.t_red_a_pct,
    tRedAAvg:       r.t_red_a_avg,
    tRedADollar:    r.t_red_a_dollar,
  }));
}

// ── QSRSoft FOB daily rows (automated pull) ──────────────────────────────────
export async function loadQsrFob({ dates, daysBack = 500 } = {}) {
  if (!supabase) return [];
  // Egress guard: default to a ~16-month window instead of the full history (qsr_fob is a
  // wide, daily × 27-store table). YoY still works — qsr_fob carries its own ly_* columns.
  const cutoffStr = (() => { const c = new Date(); c.setDate(c.getDate() - daysBack); return c.toISOString().slice(0, 10); })();
  const data = await fetchAll((from, to) => {
    let q = supabase.from('qsr_fob').select('*').order('date', { ascending: false }).range(from, to);
    if (dates?.length) q = q.in('date', dates);
    else if (daysBack) q = q.gte('date', cutoffStr);
    return q;
  });
  if (!data.length) return [];
  return data.map(r => ({
    loc:                       r.loc,
    date:                      r.date,
    prodSalesAmt:              r.prod_sales_amt,
    compWasteAmt:              r.comp_waste_amt,
    rawWasteAmt:               r.raw_waste_amt,
    condimentsAmt:             r.condiments_amt,
    empMgrMealsAmt:            r.emp_mgr_meals_amt,
    discountCouponsAmt:        r.discount_coupons_amt,
    statVarianceAmt:           r.stat_variance_amt,
    unexplainedAmt:            r.unexplained_amt,
    totalBaseFood:             r.total_base_food,
    pnlFoodCostBegin:          r.pnl_food_cost_begin,
    pnlFoodCostPurchases:      r.pnl_food_cost_purchases,
    pnlFoodCostAdjustments:    r.pnl_food_cost_adjustments,
    pnlFoodCostTransfers:      r.pnl_food_cost_transfers,
    pnlFoodCostPromotions:     r.pnl_food_cost_promotions,
    pnlFoodCostEnd:            r.pnl_food_cost_end,
    pnlPaperCostBegin:         r.pnl_paper_cost_begin,
    pnlPaperCostPurchases:     r.pnl_paper_cost_purchases,
    pnlPaperCostAdjustments:   r.pnl_paper_cost_adjustments,
    pnlPaperCostTransfers:     r.pnl_paper_cost_transfers,
    pnlPaperCostPromotions:    r.pnl_paper_cost_promotions,
    pnlPaperCostEnd:           r.pnl_paper_cost_end,
    lyProdSalesAmt:            r.ly_prod_sales_amt,
    lyCompWasteAmt:            r.ly_comp_waste_amt,
    lyRawWasteAmt:             r.ly_raw_waste_amt,
    lyCondimentsAmt:           r.ly_condiments_amt,
    lyEmpMgrMealsAmt:          r.ly_emp_mgr_meals_amt,
    lyDiscountCouponsAmt:      r.ly_discount_coupons_amt,
    lyStatVarianceAmt:         r.ly_stat_variance_amt,
    lyUnexplainedAmt:          r.ly_unexplained_amt,
    lyTotalBaseFood:           r.ly_total_base_food,
    lyPnlFoodCostBegin:        r.ly_pnl_food_cost_begin,
    lyPnlFoodCostPurchases:    r.ly_pnl_food_cost_purchases,
    lyPnlFoodCostAdjustments:  r.ly_pnl_food_cost_adjustments,
    lyPnlFoodCostTransfers:    r.ly_pnl_food_cost_transfers,
    lyPnlFoodCostPromotions:   r.ly_pnl_food_cost_promotions,
    lyPnlFoodCostEnd:          r.ly_pnl_food_cost_end,
    lyPnlPaperCostBegin:       r.ly_pnl_paper_cost_begin,
    lyPnlPaperCostPurchases:   r.ly_pnl_paper_cost_purchases,
    lyPnlPaperCostAdjustments: r.ly_pnl_paper_cost_adjustments,
    lyPnlPaperCostTransfers:   r.ly_pnl_paper_cost_transfers,
    lyPnlPaperCostPromotions:  r.ly_pnl_paper_cost_promotions,
    lyPnlPaperCostEnd:         r.ly_pnl_paper_cost_end,
    updatedAt:                 r.updated_at,
  }));
}

// ── Operations / Service rows ────────────────────────────────────────────────
export async function saveOpsRows(rows) {
  if (!supabase || !rows?.length) return { saved: 0, errors: [] };
  const toDate = r => r.date instanceof Date ? r.date.toISOString().slice(0,10) : String(r.date).slice(0,10);
  const upsert = rows.map(r => ({
    loc:  String(r.loc),
    date: toDate(r),
    oepe: r.oepe ?? null,
    park: r.park ?? null,
    kvst: r.kvst ?? null,
    kvsu: r.kvsu ?? null,
    r2p:  r.r2p  ?? null,
  }));
  const CHUNK = 500;
  let saved = 0; const errors = [];
  for (let i = 0; i < upsert.length; i += CHUNK) {
    const { error } = await supabase.from('ops_rows').upsert(upsert.slice(i, i + CHUNK), { onConflict: 'loc,date' });
    if (error) { console.warn('[ops_rows] save error:', error); errors.push(error.message); }
    else saved += Math.min(CHUNK, upsert.length - i);
  }
  console.log(`[ops_rows] saved ${saved} rows`);
  return { saved, errors };
}

// WINDOWED (v4.848). This loader previously fetched the ENTIRE table history on every
// login. Measured on production: labor_rows/ops_rows/ctrl_rows/audit_rows/peaks_rows
// together were ~150k of the ~250k rows per login, and request latency degraded from
// ~1-4s early in a load to 10-18s late — the signature of cumulative egress throttling,
// which _pagedParallel's own "egress throttle?" warning already suspected. Volume is the
// binding constraint, not ordering: two scheduling changes (v4.846, v4.847) both made
// total wall time worse while fetching the same bytes.
// 400 days is deliberate, not round: it covers matched-day vs-LY (365) and the
// documented backtest window (BT_DAYS=400). Anything shorter would silently break
// last-year comparisons and model backtests.
export async function loadOpsRows(daysBack = 400) {
  if (!supabase) return [];
  const _cut = new Date(); _cut.setDate(_cut.getDate() - daysBack);
  const _cutStr = _cut.toISOString().slice(0, 10);
  const data = await _pagedParallel({ gteCol: 'date', gteVal: _cutStr, table: 'ops_rows', select: '*', orderCol: 'date', ascending: false, label: 'opsRows' });
  if (!data.length) return [];
  return data.map(r => ({
    loc:  r.loc,
    date: new Date(r.date + 'T00:00:00'),
    oepe: r.oepe,
    park: r.park,
    kvst: r.kvst,
    kvsu: r.kvsu,
    r2p:  r.r2p,
  }));
}

// ── Controls rows ─────────────────────────────────────────────────────────────
export async function saveCtrlRows(rows) {
  if (!supabase || !rows?.length) return { saved: 0, errors: [] };
  const toDate = r => r.date instanceof Date ? r.date.toISOString().slice(0,10) : String(r.date).slice(0,10);
  const upsert = rows.map(r => ({
    loc:              String(r.loc),
    date:             toDate(r),
    cash_os_pct:      r.cashOSPct      ?? null,
    cash_os_amt:      r.cashOSAmt      ?? null,
    t_red_a_pct:      r.tRedAPct       ?? null,
    t_red_a_cnt:      r.tRedACnt       ?? null,
    t_red_b_pct:      r.tRedBPct       ?? null,
    t_red_b_cnt:      r.tRedBCnt       ?? null,
    pos_over_cnt:     r.posOverCnt     ?? null,
    pos_over_amt:     r.posOverAmt     ?? null,
    ot_hrs:           r.otHrs          ?? null,
    ot_dollar:        r.otDollar       ?? null,
    labor_pct:        r.laborPct       ?? null,
    act_vs_need:      r.actVsNeed      ?? null,
    disc_pct:         r.discPct        ?? null,
    disc_amt:         r.discAmt        ?? null,
    disc_cnt:         r.discCnt        ?? null,
    promo_pct:        r.promoPct       ?? null,
    promo_amt:        r.promoAmt       ?? null,
    promo_cnt:        r.promoCnt       ?? null,
    cash_ref_cnt:     r.cashRefCnt     ?? null,
    cash_ref_amt:     r.cashRefAmt     ?? null,
    cashless_ref_cnt: r.cashlessRefCnt ?? null,
    cashless_ref_amt: r.cashlessRefAmt ?? null,
    manual_ref_amt:   r.manualRefAmt   ?? null,
    drawer_opens:     r.drawerOpens    ?? null,
    tpph:             r.tpph           ?? null,
    spph:             r.spph           ?? null,
    avg_rate:         r.avgRate        ?? null,
    emp_meal_amt:     r.empMealAmt     ?? null,
    mgr_meal_amt:     r.mgrMealAmt     ?? null,
    act_hrs:          r.actHrs         ?? null,
    crew_hrs:         r.crewHrs        ?? null,
    salary_mgr_hrs:   r.salaryMgrHrs   ?? null,
    petty_amt:        r.pettyAmt       ?? null,
    deposit_amt:      r.depositAmt     ?? null,
  }));
  const CHUNK = 500;
  let saved = 0; const errors = [];
  for (let i = 0; i < upsert.length; i += CHUNK) {
    const { error } = await supabase.from('ctrl_rows').upsert(upsert.slice(i, i + CHUNK), { onConflict: 'loc,date' });
    if (error) { console.warn('[ctrl_rows] save error:', error); errors.push(error.message); }
    else saved += Math.min(CHUNK, upsert.length - i);
  }
  console.log(`[ctrl_rows] saved ${saved} rows`);
  return { saved, errors };
}

// WINDOWED (v4.848). This loader previously fetched the ENTIRE table history on every
// login. Measured on production: labor_rows/ops_rows/ctrl_rows/audit_rows/peaks_rows
// together were ~150k of the ~250k rows per login, and request latency degraded from
// ~1-4s early in a load to 10-18s late — the signature of cumulative egress throttling,
// which _pagedParallel's own "egress throttle?" warning already suspected. Volume is the
// binding constraint, not ordering: two scheduling changes (v4.846, v4.847) both made
// total wall time worse while fetching the same bytes.
// 400 days is deliberate, not round: it covers matched-day vs-LY (365) and the
// documented backtest window (BT_DAYS=400). Anything shorter would silently break
// last-year comparisons and model backtests.
export async function loadCtrlRows(daysBack = 400) {
  if (!supabase) return [];
  const _cut = new Date(); _cut.setDate(_cut.getDate() - daysBack);
  const _cutStr = _cut.toISOString().slice(0, 10);
  const data = await _pagedParallel({ gteCol: 'date', gteVal: _cutStr, table: 'ctrl_rows', select: '*', orderCol: 'date', ascending: false, label: 'ctrlRows' });
  if (!data.length) return [];
  return data.map(r => ({
    loc:            r.loc,
    date:           new Date(r.date + 'T00:00:00'),
    cashOSPct:      r.cash_os_pct,
    cashOSAmt:      r.cash_os_amt,
    tRedAPct:       r.t_red_a_pct,
    tRedACnt:       r.t_red_a_cnt,
    tRedBPct:       r.t_red_b_pct,
    tRedBCnt:       r.t_red_b_cnt,
    posOverCnt:     r.pos_over_cnt,
    posOverAmt:     r.pos_over_amt,
    otHrs:          r.ot_hrs,
    otDollar:       r.ot_dollar,
    laborPct:       r.labor_pct,
    actVsNeed:      r.act_vs_need,
    discPct:        r.disc_pct,
    discAmt:        r.disc_amt,
    discCnt:        r.disc_cnt,
    promoPct:       r.promo_pct,
    promoAmt:       r.promo_amt,
    promoCnt:       r.promo_cnt,
    cashRefCnt:     r.cash_ref_cnt,
    cashRefAmt:     r.cash_ref_amt,
    cashlessRefCnt: r.cashless_ref_cnt,
    cashlessRefAmt: r.cashless_ref_amt,
    manualRefAmt:   r.manual_ref_amt,
    drawerOpens:    r.drawer_opens,
    tpph:           r.tpph,
    spph:           r.spph,
    avgRate:        r.avg_rate,
    empMealAmt:     r.emp_meal_amt,
    mgrMealAmt:     r.mgr_meal_amt,
    actHrs:         r.act_hrs,
    crewHrs:        r.crew_hrs,
    salaryMgrHrs:   r.salary_mgr_hrs,
    pettyAmt:       r.petty_amt,
    depositAmt:     r.deposit_amt,
  }));
}

// ── Daily Activity Report rows ────────────────────────────────────────────────
// DAR is hourly per store, so load only a rolling window to keep payloads small.
export async function saveDarRows(rows) {
  if (!supabase || !rows?.length) return { saved: 0, errors: [] };
  const toDate = r => r.date instanceof Date ? r.date.toISOString().slice(0,10) : String(r.date).slice(0,10);
  const upsert = rows.map(r => ({
    loc:       String(r.loc),
    date:      toDate(r),
    hour:      String(r.hour || ''),
    oepe:      r.oepe    ?? null,
    oepe_pk:   r.oepePk  ?? null,
    r2p:       r.r2p     ?? null,
    ctp:       r.ctp     ?? null,
    sales:     r.sales   ?? null,
    gc:        r.gc      ?? null,
    check_avg: r.check   ?? null,
  }));
  const CHUNK = 500;
  let saved = 0; const errors = [];
  for (let i = 0; i < upsert.length; i += CHUNK) {
    const { error } = await supabase.from('dar_rows').upsert(upsert.slice(i, i + CHUNK), { onConflict: 'loc,date,hour' });
    if (error) { console.warn('[dar_rows] save error:', error); errors.push(error.message); }
    else saved += Math.min(CHUNK, upsert.length - i);
  }
  console.log(`[dar_rows] saved ${saved} rows`);
  return { saved, errors };
}

export async function loadDarRows({ daysBack = 90 } = {}) {
  if (!supabase) return [];
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - daysBack);
  const cutoffStr = cutoff.toISOString().slice(0,10);
  const data = await fetchAll((from, to) => supabase
    .from('dar_rows').select('*')
    .gte('date', cutoffStr)
    .order('date', { ascending: false })
    .range(from, to));
  if (!data.length) return [];
  return data.map(r => ({
    loc:    r.loc,
    date:   new Date(r.date + 'T00:00:00'),
    hour:   r.hour,
    oepe:   r.oepe,
    oepePk: r.oepe_pk,
    r2p:    r.r2p,
    ctp:    r.ctp,
    sales:  r.sales,
    gc:     r.gc,
    check:  r.check_avg,
  }));
}

// ── Feature Requests ──────────────────────────────────────────────────────────
export async function loadFeatureRequests() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('feature_requests')
    .select('*')
    .order('created_at', { ascending: false });
  if (error || !data) { console.warn('[feature_requests] load error:', error); return []; }
  return data;
}

export async function saveFeatureRequest(req) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('feature_requests')
    .insert([req])
    .select()
    .single();
  if (error) { console.warn('[feature_requests] save error:', error); return null; }
  return data;
}

export async function updateFeatureRequest(id, updates) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('feature_requests')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) { console.warn('[feature_requests] update error:', error); return null; }
  return data;
}

export async function voteFeatureRequest(id, currentVotes) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('feature_requests')
    .update({ votes: (currentVotes || 0) + 1, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) { console.warn('[feature_requests] vote error:', error); return null; }
  return data;
}

// ── Custom Signals ────────────────────────────────────────────────────────────
export async function loadCustomSignals() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('custom_signals')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) { console.warn('[custom_signals] load error:', error); return []; }
  return (data || []).map(r => ({
    id:          r.id,
    name:        r.name,
    xMetric:     r.x_metric,
    yMetric:     r.y_metric,
    granularity: r.granularity,
    scope:       r.scope,
    status:      r.status,
    promoted_to: r.promoted_to || [],
    latest_r:    r.latest_r,
    latest_n:    r.latest_n,
    history:     r.history || [],
    note:        r.note,
    votes:       r.votes || 0,
    xCondition:  r.x_condition || 'all',
    xReference:  r.x_reference || 'median',
    yCondition:  r.y_condition || 'all',
    yReference:  r.y_reference || 'median',
    created_at:  r.created_at,
  }));
}

export async function saveCustomSignal(def) {
  if (!supabase) return null;
  const uid = (await supabase.auth.getUser())?.data?.user?.id;
  const row = {
    name:        def.name,
    x_metric:    def.xMetric,
    y_metric:    def.yMetric,
    granularity: def.granularity || 'daily',
    scope:       def.scope || 'district',
    status:      def.status || 'active',
    promoted_to: def.promoted_to || [],
    latest_r:    def.latest_r ?? null,
    latest_n:    def.latest_n ?? null,
    history:     def.history || [],
    note:        def.note || null,
    x_condition: def.xCondition || 'all',
    x_reference: def.xReference || 'median',
    y_condition: def.yCondition || 'all',
    y_reference: def.yReference || 'median',
    created_by:  uid || null,
  };
  const { data, error } = await supabase
    .from('custom_signals')
    .insert([row])
    .select()
    .single();
  if (error) { console.warn('[custom_signals] save error:', error); return null; }
  return data;
}

export async function updateCustomSignal(id, updates) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('custom_signals')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) { console.warn('[custom_signals] update error:', error); return null; }
  return data;
}

// Append a new r/n measurement to history and update latest_r / latest_n
export async function appendCustomSignalHistory(id, r, n, existingHistory) {
  if (!supabase) return;
  const entry = { date: new Date().toISOString().slice(0,10), r, n };
  const history = [...(existingHistory || []), entry].slice(-50); // keep last 50
  await supabase.from('custom_signals').update({
    latest_r: r, latest_n: n, history,
  }).eq('id', id);
}

// ── Saved correlations (CSAT driver KB, v4.540) ───────────────────────────────
export async function loadSavedCorrelations() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('saved_correlations').select('*')
    .order('within_r', { ascending: false });
  if (error) { console.warn('[saved_correlations] load error:', error); return []; }
  return (data || []).map(r => ({
    id: r.id, kind: r.kind,
    outcomeKey: r.outcome_key, outcomeLabel: r.outcome_label,
    driverKey: r.driver_key, driverLabel: r.driver_label,
    granularity: r.granularity, scope: r.scope,
    withinR: r.within_r, pooledR: r.pooled_r, partialR: r.partial_r, spearman: r.spearman,
    n: r.n, effN: r.eff_n, qValue: r.q_value, tier: r.tier, direction: r.direction,
    note: r.note, status: r.status, history: r.history || [],
    createdAt: r.created_at, updatedAt: r.updated_at,
  }));
}

// Upsert a saved driver (keyed by kind+outcome+driver+granularity+scope), appending
// a dated snapshot to its history so strength-over-time (decay) can be charted.
export async function saveSavedCorrelation(d) {
  if (!supabase) return null;
  const uid = (await supabase.auth.getUser())?.data?.user?.id;
  const point = { date: new Date().toISOString().slice(0,10), withinR: d.withinR ?? null, n: d.n ?? null, tier: d.tier ?? null };
  const row = {
    kind: d.kind || 'csat',
    outcome_key: d.outcomeKey, outcome_label: d.outcomeLabel,
    driver_key: d.driverKey, driver_label: d.driverLabel,
    granularity: d.granularity || 'monthly', scope: d.scope || 'district',
    within_r: d.withinR ?? null, pooled_r: d.pooledR ?? null, partial_r: d.partialR ?? null, spearman: d.spearman ?? null,
    n: d.n ?? null, eff_n: d.effN ?? null, q_value: d.qValue ?? null, tier: d.tier ?? null, direction: d.direction ?? null,
    note: d.note ?? null, status: d.status || 'watching',
    history: [...(d.history || []), point].slice(-50),
    created_by: uid || null, updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from('saved_correlations')
    .upsert([row], { onConflict: 'kind,outcome_key,driver_key,granularity,scope' })
    .select().single();
  if (error) { console.warn('[saved_correlations] save error:', error); return null; }
  return data;
}

export async function updateSavedCorrelation(id, patch) {
  if (!supabase) return false;
  const row = { updated_at: new Date().toISOString() };
  if (patch.status != null) row.status = patch.status;
  if (patch.note != null) row.note = patch.note;
  const { error } = await supabase.from('saved_correlations').update(row).eq('id', id);
  if (error) { console.warn('[saved_correlations] update error:', error); return false; }
  return true;
}

export async function deleteSavedCorrelation(id) {
  if (!supabase) return false;
  const { error } = await supabase.from('saved_correlations').delete().eq('id', id);
  if (error) { console.warn('[saved_correlations] delete error:', error); return false; }
  return true;
}

// ── SMG VOICE comments (cloud-persist, v4.546) ────────────────────────────────
function _cmtISO(d) {
  if (!d) return null;
  if (d instanceof Date) return isNaN(+d) ? null : d.toISOString().slice(0, 10);
  const s = String(d).trim();
  // ISO already?
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // M/D/YYYY
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) { const yr = m[3].length === 2 ? '20' + m[3] : m[3]; return `${yr}-${String(+m[1]).padStart(2,'0')}-${String(+m[2]).padStart(2,'0')}`; }
  const dt = new Date(s); return isNaN(+dt) ? null : dt.toISOString().slice(0, 10);
}

// Strip NUL + C0/C1 control chars (keeping \n and \t) that Postgres `text`
// columns reject. Non-string input passes through untouched.
function _pgSafeText(s) {
  if (s == null) return s;
  return String(s).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
}

export async function saveSmgComments(rows) {
  if (!supabase || !rows?.length) return { saved: 0 };
  // Build rows DEDUPED by dedup_key within this batch. A Postgres upsert throws
  // "ON CONFLICT DO UPDATE command cannot affect row a second time" when the same
  // key appears twice in one call — which happens constantly with generic comments
  // ("Friendly service"). That single throw nukes the whole batch → 0 saved. So we
  // collapse in-batch duplicates here, enrich the key with visit_date + score to
  // avoid merging genuinely distinct comments, and chunk so one bad slice can't
  // sink everything.
  const byKey = new Map();
  for (const r of rows) {
    // Postgres `text` cannot hold a NUL byte (U+0000). PDF extraction leaves
    // stray NUL + other control chars in comment text; PostgREST serializes
    // them into a JSON escape Postgres rejects ("unsupported Unicode escape
    // sequence", SQLSTATE 22P05), which zeroes the whole batch. _pgSafeText
    // strips NUL + C0/C1 controls (keeping newlines/tabs) from every string
    // field so one bad comment can't sink the save.
    const txt = _pgSafeText(r.text || '').trim();
    if (!txt) continue;
    const cd = _cmtISO(r.commentDate) || _cmtISO(r.visitDate);
    const vd = _cmtISO(r.visitDate);
    const sc = (typeof r.score === 'number' && Number.isFinite(r.score)) ? r.score : null;
    const dedup_key = `${String(r.loc ?? r.nsn ?? '')}|${cd || ''}|${vd || ''}|${sc ?? ''}|${txt.slice(0, 140)}`;
    if (byKey.has(dedup_key)) continue;
    byKey.set(dedup_key, {
      loc: String(r.loc ?? r.nsn ?? ''), store_name: _pgSafeText(r.storeName) || null,
      comment_date: cd, visit_date: vd, nsn: r.nsn || null,
      satisfaction_label: _pgSafeText(r.satisfactionLabel) || null, score: sc,
      text: txt, report_start: _cmtISO(r.reportStart), report_end: _cmtISO(r.reportEnd),
      source_file: _pgSafeText(r.sourceFile || r.source_file) || null, dedup_key,
    });
  }
  let upsert = [...byKey.values()];
  if (!upsert.length) return { saved: 0 };

  // Constraint-independent idempotency: rather than rely on `onConflict:'dedup_key'`
  // (which fails outright if the table was created without the UNIQUE index and
  // silently zeroes the whole save), fetch the dedup_keys already in the table,
  // drop the ones we already have, and plain-INSERT the rest. Re-uploads stay
  // idempotent whether or not the unique index exists.
  try {
    const existing = new Set();
    const seen = await fetchAll((from, to) => supabase
      .from('smg_comments').select('dedup_key').range(from, to));
    for (const r of (seen || [])) if (r && r.dedup_key) existing.add(r.dedup_key);
    if (existing.size) upsert = upsert.filter(r => !existing.has(r.dedup_key));
  } catch (e) {
    // If the pre-fetch fails, fall through to insert and let the constraint (if
    // any) dedupe — better to attempt the save than abort.
    console.warn('[smg_comments] existing-key prefetch failed:', e);
  }
  if (!upsert.length) return { saved: 0, error: null };

  let saved = 0, lastErr = null;
  for (let i = 0; i < upsert.length; i += 500) {
    const chunk = upsert.slice(i, i + 500);
    const { error } = await supabase.from('smg_comments').insert(chunk);
    if (error) { lastErr = error; console.warn('[smg_comments] save error:', error); }
    else saved += chunk.length;
  }
  return { saved, error: lastErr ? lastErr.message : null };
}

export async function loadSmgComments({ daysBack = 365 } = {}) {
  if (!supabase) return [];
  const cutoff = new Date(Date.now() - daysBack * 86400000).toISOString().slice(0, 10);
  const data = await fetchAll((from, to) => supabase
    .from('smg_comments').select('*')
    .gte('comment_date', cutoff)
    .order('comment_date', { ascending: false })
    .range(from, to));
  // Keep dates as ISO strings (not Date objects) to match parser output — the
  // comment panel sorts and renders them as strings, and a Date here both
  // breaks localeCompare and prints as an ugly full datetime.
  return (data || []).map(r => ({
    loc: r.loc, storeName: r.store_name,
    commentDate: r.comment_date || null,
    visitDate: r.visit_date || null,
    nsn: r.nsn, satisfactionLabel: r.satisfaction_label, score: r.score,
    text: r.text, reportStart: r.report_start, reportEnd: r.report_end,
  }));
}

// ── On-demand sync triggers ───────────────────────────────────────────────────
// Dispatch any data-pull workflow from the app. `workflow` is one of
// 'dar' | 'ebos' | 'fob' | 'lifelenz'; `inputs` optionally overrides that
// workflow's dispatch inputs (e.g. { days_recent: 1 }). Backed by the
// trigger-dar-sync Edge Function, which owns the workflow allowlist + defaults.
export async function triggerSync(workflow = 'dar', inputs = {}) {
  if (!supabase) return { error: 'No Supabase client' };
  const sbUrl = import.meta.env.VITE_SUPABASE_URL || '';
  if (!sbUrl) return { error: 'VITE_SUPABASE_URL not set' };
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { error: 'Not authenticated' };
  try {
    const res = await fetch(`${sbUrl}/functions/v1/trigger-dar-sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ workflow, inputs }),
    });
    const text = await res.text().catch(() => '');
    if (!res.ok) return { error: `Sync failed (${res.status})${text ? ': ' + text : ''}` };
    try { return JSON.parse(text); } catch { return {}; }
  } catch (e) {
    return { error: e.message || 'Network error' };
  }
}

// Back-compat wrapper for the existing Live Ops DAR button.
export async function triggerDarSync({ daysBack = 7, daysRecent = 1 } = {}) {
  return triggerSync('dar', { days_back: String(daysBack), days_recent: String(daysRecent) });
}

// ── qsr_daily_activity ────────────────────────────────────────────────────────
export async function loadDailyActivity({ date, daysBack = 1 } = {}) {
  if (!supabase) return [];
  const target = date || new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('qsr_daily_activity')
    .select('loc,dt,hour_slot,product_sales,mean_sales,transactions,mean_transactions,proj_total_transactions,dt_untilserve,dt_trans_cnt,actual_punched_hours,total_needed_hours,total_scheduled_hours,healthy_count,unhealthy_count,proj_sales_dollars')
    .eq('dt', target)
    .order('loc')
    .order('hour_slot');
  if (error) { console.error('loadDailyActivity:', error); return []; }
  return data || [];
}

export async function loadStoreDaypartData(loc, date) {
  if (!supabase) return [];
  const locPadded = String(loc).padStart(7, '0');
  const target = date || new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('qsr_daily_activity')
    .select('dt,hour_slot,product_sales,mean_sales,ly_product_sales,dt_untilserve,dt_trans_cnt,proj_sales_dollars,actual_punched_hours,total_needed_hours')
    .eq('loc', locPadded)
    .eq('dt', target)
    .order('hour_slot');
  if (error) { console.error('loadStoreDaypartData:', error); return []; }
  return data || [];
}

export async function loadDailyActivityRange(startDate, endDate) {
  if (!supabase) return [];
  // Paginate — 27 stores × ~25 hour slots exceeds the 1000-row cap after ~1.5 days,
  // so a single select silently truncated any multi-day range.
  return fetchAll((lo, hi) => supabase
    .from('qsr_daily_activity')
    .select('loc,dt,hour_slot,product_sales,mean_sales,dt_untilserve,dt_trans_cnt,actual_punched_hours,total_needed_hours,healthy_count,unhealthy_count')
    .gte('dt', startDate)
    .lte('dt', endDate)
    .order('dt')
    .order('loc')
    .order('hour_slot')
    .range(lo, hi));
}

// ── Speed-of-Service history (all stations) ──────────────────────────────────
// Includes per-station until-serve + transaction counts so the panel can show
// where the bottleneck is (DT window vs front counter vs kitchen make-line vs
// beverage), not just the drive-thru. Values are milliseconds; avg = Σuntilserve
// / Σtrans / 1000 seconds. Filtered to hours with drive-thru activity.
export async function loadDtHistory(days = 90) {
  if (!supabase) return [];
  const startDt = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  // Paginate — .limit(100000) does NOT defeat Supabase's server-side max-rows cap
  // (~1000), so 90 days × 27 stores was silently truncated to ~1 day. fetchAll pages.
  return fetchAll((lo, hi) => supabase
    .from('qsr_daily_activity')
    .select('loc,dt,hour_slot,dt_untilserve,dt_trans_cnt,fc_untilserve,fc_trans_cnt,mfy1_untilserve,mfy1_trans_cnt,mfy2_untilserve,mfy2_trans_cnt,bev_untilserve,bev_trans_cnt')
    .gte('dt', startDt)
    .gt('dt_trans_cnt', 0)
    .order('dt')
    .order('loc')
    .order('hour_slot')
    .range(lo, hi));
}

// ── eBOS monthly op supplies by store ────────────────────────────────────────
// Returns { [loc]: totalOps } where loc is the unpadded NSN string, for a given month.
// Self-serve beverage-tower flag per store (integrity #47 — the fountain-yield exemption). Reads
// store_vlh_config.in_store ('self_serve' vs 'crew_pour'); returns a Set of normalized (unpadded)
// locs that have a self-serve tower. Egress-minimal (2 columns). Empty/failed → empty set (no
// suppression) so we never HIDE a real loss because config wasn't loaded.
export async function loadSelfServeTowerLocs() {
  if (!supabase) return new Set();
  try {
    const { data, error } = await supabase.from('store_vlh_config').select('loc,in_store');
    if (error) { console.warn('[Meridian] loadSelfServeTowerLocs:', error.message); return new Set(); }
    const norm = s => String(s || '').replace(/^0+/, '') || String(s || '');
    return new Set((data || []).filter(r => r.in_store === 'self_serve').map(r => norm(r.loc)));
  } catch (e) { console.warn('[Meridian] loadSelfServeTowerLocs:', e?.message || e); return new Set(); }
}

export async function loadEbosMonthlyByStore(year, month) {
  if (!supabase) return {};
  const y = String(year), m = String(month).padStart(2, '0');
  const start = `${y}-${m}-01`;
  const end   = `${y}-${m}-31`; // gt/lte bounds handle varying month lengths
  const { data, error } = await supabase
    .from('qsr_ebos_daily')
    .select('loc,ops_purchases')
    .gte('date', start)
    .lte('date', end);
  if (error) { console.error('loadEbosMonthlyByStore:', error); return {}; }
  const map = {};
  for (const r of data || []) {
    const loc = String(parseInt(r.loc, 10));
    map[loc] = (map[loc] || 0) + (r.ops_purchases || 0);
  }
  return map;
}

// ── QSRSoft People reports → Perf-Review People metrics (Notes 32) ────────────
// Monthly per-loc: Roster Statistics (headcount), Employee Roster role counts
// (shift-cert), Turnover (0-90). All keyed (loc, period_month 'YYYY-MM'). Parsers in
// src/engine/people-reports.js produce the record shapes these save; loaders return
// flat rows tagged with `month` for the review auto-populate month lookup.
export async function saveRosterStatistics(periodMonth, byLoc) {
  if (!supabase || !byLoc) return { saved: 0 };
  const rows = Object.entries(byLoc).map(([loc, s]) => ({
    loc: String(loc), period_month: periodMonth,
    crew_staff: s.crewStaff ?? null, shift_staff: s.shiftStaff ?? null, gmdm_staff: s.gmdmStaff ?? null,
    crew_active: s.crewActive ?? null, shift_active: s.shiftActive ?? null,
    roster_size: s.rosterSize ?? null, roster_active: s.rosterActive ?? null, under18: s.under18 ?? null,
  }));
  const { error } = await supabase.from('roster_statistics').upsert(rows, { onConflict: 'loc,period_month' });
  if (error) { console.warn('[roster_statistics] save error:', error.message); return { saved: 0, errors: [error.message] }; }
  return { saved: rows.length };
}
export async function loadRosterStatistics() {
  if (!supabase) return [];
  const data = await fetchAll((from, to) => supabase.from('roster_statistics').select('*').order('period_month').range(from, to));
  return (data || []).map(r => ({
    loc: String(parseInt(r.loc, 10)), month: r.period_month,
    crewStaff: r.crew_staff, shiftStaff: r.shift_staff, gmdmStaff: r.gmdm_staff,
    crewActive: r.crew_active, shiftActive: r.shift_active, rosterSize: r.roster_size,
    rosterActive: r.roster_active, under18: r.under18,
  }));
}

export async function saveRosterRoleCounts(periodMonth, byLoc) {
  if (!supabase || !byLoc) return { saved: 0 };
  const rows = Object.entries(byLoc).map(([loc, c]) => ({
    loc: String(loc), period_month: periodMonth,
    crew: c.crew ?? null, shift_mgr: c.shiftMgr ?? null, gm: c.gm ?? null,
    maintenance: c.maintenance ?? null, admin: c.admin ?? null, other: c.other ?? null, total: c.total ?? null,
  }));
  const { error } = await supabase.from('roster_role_counts').upsert(rows, { onConflict: 'loc,period_month' });
  if (error) { console.warn('[roster_role_counts] save error:', error.message); return { saved: 0, errors: [error.message] }; }
  return { saved: rows.length };
}
export async function loadRosterRoleCounts() {
  if (!supabase) return [];
  const data = await fetchAll((from, to) => supabase.from('roster_role_counts').select('*').order('period_month').range(from, to));
  return (data || []).map(r => ({
    loc: String(parseInt(r.loc, 10)), month: r.period_month,
    crew: r.crew, shiftMgr: r.shift_mgr, gm: r.gm, maintenance: r.maintenance, admin: r.admin, other: r.other, total: r.total,
  }));
}

export async function saveTurnoverMonthly(byLoc) {
  if (!supabase || !byLoc) return { saved: 0 };
  const rows = Object.entries(byLoc).map(([loc, t]) => ({
    loc: String(loc), period_month: t.month,
    hires: t.hires ?? null, roster_size: t.rosterSize ?? null, terms: t.terms ?? null,
    terms_under_90: t.termsUnder90 ?? null, retained_over_90: t.retainedOver90 ?? null,
    retained_over_90_pct: t.retainedOver90Pct ?? null, monthly_annual_turnover: t.monthlyAnnualTurnover ?? null,
    ttm_turnover: t.ttmTurnover ?? null, three_month_turnover: t.threeMonthTurnover ?? null,
    turnover_090_pct: t.turnover090Pct ?? null,
  }));
  const { error } = await supabase.from('turnover_monthly').upsert(rows, { onConflict: 'loc,period_month' });
  if (error) { console.warn('[turnover_monthly] save error:', error.message); return { saved: 0, errors: [error.message] }; }
  return { saved: rows.length };
}
export async function loadTurnoverMonthly() {
  if (!supabase) return [];
  const data = await fetchAll((from, to) => supabase.from('turnover_monthly').select('*').order('period_month').range(from, to));
  return (data || []).map(r => ({
    loc: String(parseInt(r.loc, 10)), month: r.period_month,
    hires: r.hires, rosterSize: r.roster_size, terms: r.terms, termsUnder90: r.terms_under_90,
    retainedOver90: r.retained_over_90, retainedOver90Pct: r.retained_over_90_pct,
    monthlyAnnualTurnover: r.monthly_annual_turnover, ttmTurnover: r.ttm_turnover,
    threeMonthTurnover: r.three_month_turnover, turnover090Pct: r.turnover_090_pct,
  }));
}

// ── Digital App + McDelivery 3PO (monthly per-loc) → review digital/delivery ───
// GC/R/D metrics. Parsers in src/engine/people-reports.js; pulls upsert monthly.
// loaders return flat rows tagged with `month` for the review auto-populate lookup.
export async function saveDigitalAppMonthly(periodMonth, byLoc) {
  if (!supabase || !byLoc) return { saved: 0 };
  const rows = Object.entries(byLoc).map(([loc, d]) => ({
    loc: String(loc), period_month: periodMonth,
    app_sales: d.sales ?? null, app_gc: d.gcs ?? null, app_gc_rd: d.gcPerRestDay ?? null,
    app_pct_sales: d.pctOfSales ?? null, avg_check: d.avgCheck ?? null, rest_days: d.restDays ?? null,
  }));
  const { error } = await supabase.from('digital_app_monthly').upsert(rows, { onConflict: 'loc,period_month' });
  if (error) { console.warn('[digital_app_monthly] save error:', error.message); return { saved: 0, errors: [error.message] }; }
  return { saved: rows.length };
}
export async function loadDigitalAppMonthly() {
  if (!supabase) return [];
  const data = await fetchAll((from, to) => supabase.from('digital_app_monthly').select('*').order('period_month').range(from, to));
  return (data || []).map(r => ({
    loc: String(parseInt(r.loc, 10)), month: r.period_month,
    appSales: r.app_sales, appGc: r.app_gc, appGcRd: r.app_gc_rd,
    appPctSales: r.app_pct_sales, avgCheck: r.avg_check, restDays: r.rest_days,
  }));
}

export async function saveMcdeliveryMonthly(periodMonth, byLoc, restDays = null) {
  if (!supabase || !byLoc) return { saved: 0 };
  const rows = Object.entries(byLoc).map(([loc, m]) => ({
    loc: String(loc), period_month: periodMonth, vendor: m.vendor ?? null,
    delivery_gc: m.threePoGC ?? null,
    delivery_gc_rd: (m.threePoGC != null && restDays) ? m.threePoGC / restDays : (m.threePoGC ?? null),
    pos_mcdelivery_gc: m.posMcDeliveryGC ?? null, pos_3po_sales: m.pos3poSales ?? null,
    csat: m.csat ?? null, orders_missing_items_pct: m.ordersMissingItemsPct ?? null,
    incorrect_orders: m.incorrectOrders ?? null, mcdelivery_time_sec: m.mcDeliveryTimeSec ?? null,
    restaurant_time_sec: m.restaurantTimeSec ?? null, total_experience_time_sec: m.totalExperienceTimeSec ?? null,
    rest_days: restDays ?? null,
  }));
  const { error } = await supabase.from('mcdelivery_monthly').upsert(rows, { onConflict: 'loc,period_month' });
  if (error) { console.warn('[mcdelivery_monthly] save error:', error.message); return { saved: 0, errors: [error.message] }; }
  return { saved: rows.length };
}
export async function loadMcdeliveryMonthly() {
  if (!supabase) return [];
  const data = await fetchAll((from, to) => supabase.from('mcdelivery_monthly').select('*').order('period_month').range(from, to));
  return (data || []).map(r => ({
    loc: String(parseInt(r.loc, 10)), month: r.period_month, vendor: r.vendor,
    deliveryGc: r.delivery_gc, deliveryGcRd: r.delivery_gc_rd, posMcDeliveryGc: r.pos_mcdelivery_gc,
    pos3poSales: r.pos_3po_sales, csat: r.csat, ordersMissingItemsPct: r.orders_missing_items_pct,
    incorrectOrders: r.incorrect_orders, mcDeliveryTimeSec: r.mcdelivery_time_sec,
    restaurantTimeSec: r.restaurant_time_sec, totalExperienceTimeSec: r.total_experience_time_sec, restDays: r.rest_days,
  }));
}

// ── Shift Manager Summary (monthly per-manager) → DM/shift review attribution ──
// Per (loc, geid) manager-on-duty attributed performance. Feeds the review-form
// manager dropdown (name→geid) + autoPopulate for DM/shift roles (their own shifts;
// GMs keep store-total). Speed metrics in seconds. Pull: qsrsoft-shift-manager-pull.
export async function loadShiftManagerMonthly() {
  if (!supabase) return [];
  const data = await fetchAll((from, to) => supabase.from('shift_manager_monthly').select('*').order('period_month').range(from, to));
  return (data || []).map(r => ({
    loc: String(parseInt(r.loc, 10)), month: r.period_month, geid: r.geid, name: r.manager_name,
    numShifts: r.num_shifts, actualHours: r.actual_hours,
    actualVsScheduled: r.actual_vs_scheduled, actualVsNeeded: r.actual_vs_needed,
    netSales: r.net_sales, transactions: r.transactions, avgCheck: r.avg_check, tpph: r.tpph,
    oepe: r.oepe, r2p: r.r2p, ctp: r.ctp, dtTtl: r.dt_ttl, kvs: r.kvs, laborPct: r.labor_pct,
  }));
}

// ── eBOS daily op-supplies rows (for ds — feeds Perf-Review opSupplies actual) ─
// One row per (loc, date) carrying the day's operating-supplies purchases. Paginated —
// 27 stores × a year exceeds the 1000-row cap. loc unpadded to match the rest of ds.
export async function loadEbosDaily(daysBack = 400) {
  if (!supabase) return [];
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - daysBack);
  const iso = cutoff.toISOString().slice(0, 10);
  const data = await fetchAll((from, to) => supabase.from('qsr_ebos_daily')
    .select('loc,date,ops_purchases').gte('date', iso).order('date').range(from, to));
  return (data || []).map(r => ({
    loc: String(parseInt(r.loc, 10)), date: _mkDate(r.date), opsPurchases: r.ops_purchases ?? 0,
  }));
}

// ── QSRSoft daily-activity aggregated summary ─────────────────────────────────
// Returns one row per (loc, date) with sales/GC/DT totals summed across hour slots.
// Used by AtAGlance as a zero-upload fallback when laborRows is empty.
// ── Shared derivations for the DAR daily summary ────────────────────────────
// Both paths below (server-side rollup view, and the hourly fallback) produce the SAME
// summed shape, then run it through this one finalizer. The derived metrics live here
// and ONLY here: each carries the store/date it was reconciled against the QSRSoft
// report, and duplicating that math into SQL would create a second definition free to
// drift from this one.
function _finalizeQsrAct(rows) {
  return rows.map(r => ({
    ...r,
    salesVsLYPct: r.lySales > 0 ? (r.sales - r.lySales) / r.lySales * 100 : null,
    // Derived cloud TPPH = TRANSACTIONS ÷ actual punched labor hours. Uses the DAR's
    // real `transactions` count — NOT healthy+unhealthy (a KVS order-health count that
    // massively understated TPPH, e.g. 0.1 vs a ~5 target). Matches the Shift Manager
    // Summary's transPerPunchedHour. Both come from the auto-pulled DAR (cloud-fresh);
    // manual Ops/Controls TPPH still wins first via metric-source ordering.
    tpph: r.actHrs > 0 && r.txns > 0 ? r.txns / r.actHrs : null,
    // R2P (Receipt to Print, sec) = (fc_untilserve − fc_untilclosedrawer) ÷ fc_trans_cnt ÷ 1000.
    // Reconciled EXACTLY to the QSRSoft Daily Activity report's R2P column across every
    // active hour (store 3708, 2026-07-28). fc_untilserve alone = "Avg Win TTL" (window
    // total) — NOT R2P; subtracting drawer-close time yields the receipt-to-print interval.
    // Cloud-fresh (DAR pulls run ~8a/10a/2p CT), so current-day One-Pager R2P populates.
    r2p: r._fcCnt > 0 ? (r._fcServe - r._fcDrawer) / r._fcCnt / 1000 : null,
    // OEPE (Order-to-Exit Peak Efficiency, sec) = (dt_untilserve − dt_untilstore) ÷ dt_trans_cnt ÷ 1000,
    // count-weighted across the day. Reconciled EXACTLY to the DAR report's OEPE column (store 3708,
    // 2026-07-28): subtracting the order-point→window travel (dt_untilstore) from the total drive-thru
    // time yields order-to-exit. Cloud-fresh → fills current-day OEPE when the emailed Glimpse lags.
    oepe: r._dtCars > 0 ? (r._dtTotal - r._dtStore) / r._dtCars / 1000 : null,
    // DT Parked % (0–1 fraction) = cars held ÷ DT transactions served, count-weighted across
    // the day. Reconciled EXACT to the Operations Report's own dt_cars_held/dt_serve_trans
    // (store 3708, 2026-08-03: DAR 105/773=13.58% vs Ops Report 105/773=13.59%, rounding-only
    // difference). Cloud-fresh + live intraday (unlike qsr_service_stats, which has no row
    // until the day finalizes) — owner confirmed 2026-08-04 this was already available here,
    // just not selected/wired through.
    park: r._dtCars > 0 ? r._dtHeld / r._dtCars : null,
    // KVS Healthy Usage (0–1 fraction) = healthy ÷ (healthy + unhealthy) order-health counts,
    // summed across the day. Same 0–1 shape as the emailed Glimpse `kvsHealthy`, so it slots in
    // as a metric-source fallback (kvsHealthy) and the One-Pager / AAG KVS row fills cloud-fresh.
    kvsHealthy: (r._kvsH + r._kvsU) > 0 ? r._kvsH / (r._kvsH + r._kvsU) : null,
    // KVS Time per GC (seconds) = total MFY serve time ÷ total MFY transaction count ÷ 1000.
    // Reconciled EXACTLY to the DAR report's "KVS Time Per GC" column (store 3708, 2026-07-30:
    // 06:00 1,192,796÷14÷1000 = 85s ✓ · 07:00 46.6s→47 ✓ · 08:00 61.4s→60 ✓). Cloud-fresh, so the
    // One-Pager / AAG KVS-Time row fills from the DAR when the emailed Glimpse lags/omits KVS.
    kvst: r._mfyCnt > 0 ? r._mfyTime / r._mfyCnt / 1000 : null,
    // Derive a QSR labor % from the day's product sales when an average crew rate
    // is unavailable here — left null; Daily Glimpse laborPct is the primary %.
  }));
}

// Build the summed shape from one already-aggregated (loc, dt) row.
function _qsrActFromSummed(loc, dt, v) {
  return {
    loc, date: new Date(dt + 'T00:00:00'),
    sales: v.product_sales || 0, allNetSales: v.product_sales || 0,
    gc: v.transactions || 0, txns: v.transactions || 0,
    _dtTotal: v.dt_untilserve || 0, _dtStore: v.dt_untilstore || 0,
    _dtCars: v.dt_trans_cnt || 0, _dtHeld: v.dt_carsheld || 0,
    _fcServe: v.fc_untilserve || 0, _fcDrawer: v.fc_untilclosedrawer || 0,
    _fcCnt: v.fc_trans_cnt || 0,
    projGC: v.proj_total_transactions || 0, projSales: v.proj_sales_dollars || 0,
    lySales: v.ly_product_sales || 0, lyGc: v.ly_transactions || 0,
    actHrs: v.actual_punched_hours || 0, needHrs: v.total_needed_hours || 0,
    _kvsH: v.healthy_count || 0, _kvsU: v.unhealthy_count || 0,
    _mfyTime: v.mfy_untilserve || 0, _mfyCnt: v.mfy_trans_cnt || 0,
    _isQsrAct: true,
  };
}

// Daily DAR summary. Prefers the server-side rollup view (supabase/schema-qsr-daily-summary.sql):
// 27 stores x 60 days is ~1,620 rows = ONE page, versus ~40,000 hourly rows over ~40 pages.
// Measured 2026-08-07: the hourly path was the largest remaining stream AND produced 18 of 22
// HTTP 500s, failing in batches of exactly the client's concurrency cap.
//
// Falls back to the hourly path automatically when the view is absent, so the app works
// identically before and after the SQL is run — deploying first is safe.
export async function loadQsrActSummary(daysBack = 35) {
  if (!supabase) return [];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysBack);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  // Probe the view with a LIMIT 1. Deliberately NOT count:'exact' — on an aggregating
  // view an exact count forces Postgres to compute the whole GROUP BY just to count the
  // rows, so the "cheap probe" costs more than the query it guards. Measured on
  // production 2026-08-07: the count probe took 22.9s and returned HTTP 500, and the app
  // silently fell back to the 40-request hourly path it was meant to replace.
  const probe = await _limited(() => supabase
    .from('qsr_daily_activity_daily').select('loc').gte('dt', cutoffStr).limit(1));
  if (probe && !probe.error) {
    // Page until a short page. db-max-rows is 1000 here and .range() does NOT raise it,
    // so a 60-day window (~1,647 rows) MUST be paged or it silently truncates. Two
    // iterations in practice; no count query needed to know when to stop.
    const PAGE = 1000, rows = [];
    for (let p = 0; p < 20; p++) {
      const res = await _limited(() => supabase
        .from('qsr_daily_activity_daily').select('*').gte('dt', cutoffStr)
        .order('dt', { ascending: false }).order('loc')
        .range(p * PAGE, p * PAGE + PAGE - 1));
      if (!res || res.error) {
        _recordDataError('qsr act summary (rollup view)', 1, p + 1,
          res && res.error ? res.error.message : 'page failed');
        break;
      }
      rows.push(...(res.data || []));
      if (!res.data || res.data.length < PAGE) break;   // short page = done
    }
    const out = rows.map(r => _qsrActFromSummed(String(parseInt(r.loc, 10)), r.dt, r));
    console.log(`[Meridian] qsr act summary via daily rollup view — ${out.length} rows`);
    if (out.length) return _finalizeQsrAct(out);
    // View exists but returned nothing — fall through to hourly rather than report
    // an empty day as fact.
  }
  console.warn('[Meridian] qsr_daily_activity_daily view unavailable — falling back to hourly pagination. Run supabase/schema-qsr-daily-summary.sql to remove ~40 requests/login.',
    probe && probe.error ? probe.error.message : '');

  // Paginate — qsr_daily_activity has ~675 rows/day, so a single query hits the
  // 1000-row cap and returns only the oldest ~1.5 days. fetchAll pages through all.
  // PARALLEL pagination (count → fire every page at once) instead of ~39 sequential
  // round-trips — this was the slow "took a while" current-data load. Ordered NEWEST-first
  // + Promise.allSettled so a partial failure (free-tier egress throttle) still keeps the
  // RECENT days every current-window tile/form needs, and one bad page can't reject the whole
  // load. Aggregation is by (loc,dt) so page order doesn't affect the result.
  const SELECT = 'loc,dt,product_sales,transactions,healthy_count,unhealthy_count,dt_untilserve,dt_untilstore,dt_trans_cnt,dt_carsheld,fc_untilserve,fc_untilclosedrawer,fc_trans_cnt,mfy1_untilserve,mfy1_trans_cnt,mfy2_untilserve,mfy2_trans_cnt,proj_total_transactions,proj_sales_dollars,ly_product_sales,ly_transactions,actual_punched_hours,total_needed_hours';
  const PAGE = 1000;
  const { count } = await supabase.from('qsr_daily_activity')
    .select('loc', { count: 'exact', head: true }).gte('dt', cutoffStr);
  const pages = Math.max(1, Math.ceil((count || 0) / PAGE));
  const reqs = [];
  for (let p = 0; p < pages; p++) {
    reqs.push(() => supabase.from('qsr_daily_activity').select(SELECT).gte('dt', cutoffStr)
      .order('dt', { ascending: false }).order('loc').order('hour_slot')
      .range(p * PAGE, p * PAGE + PAGE - 1));
  }
  const settled = await Promise.allSettled(reqs.map(f => _limited(f)));
  const data = []; let failedPages = 0;
  for (const s of settled) {
    if (s.status === 'fulfilled' && s.value && !s.value.error && s.value.data) data.push(...s.value.data);
    else failedPages++;
  }
  if (failedPages) _recordDataError('qsr act summary (hourly fallback)', failedPages, pages, 'run supabase/schema-qsr-daily-summary.sql to replace ~40 requests with 1');
  const map = {};
  for (const r of data || []) {
    const loc = String(parseInt(r.loc, 10)); // strip zero-padding ("0003708" → "3708")
    const key = loc + '_' + r.dt;
    if (!map[key]) map[key] = {
      loc, date: new Date(r.dt + 'T00:00:00'),
      sales: 0, allNetSales: 0, gc: 0, txns: 0,
      _dtTotal: 0, _dtStore: 0, _dtCars: 0, _dtHeld: 0,
      _fcServe: 0, _fcDrawer: 0, _fcCnt: 0,
      projGC: 0, projSales: 0,
      lySales: 0, lyGc: 0,
      actHrs: 0, needHrs: 0,
      _kvsH: 0, _kvsU: 0,
      _mfyTime: 0, _mfyCnt: 0,
      _isQsrAct: true,
    };
    map[key].sales        += r.product_sales   || 0;
    map[key].allNetSales  += r.product_sales   || 0;
    // GC = real transaction count (matches ly_transactions used for LY). healthy+unhealthy is
    // a near-empty KVS order-health count (~1/day) — sourcing GC from it made avg check
    // (sales ÷ gc) explode and GC-vs-LY read ~-100% (Notes 35: the $21M/wk opportunity bug).
    map[key].gc           += r.transactions    || 0;
    map[key].txns         += r.transactions    || 0;   // true transaction count (for TPPH)
    map[key]._dtTotal     += r.dt_untilserve   || 0;
    map[key]._dtStore     += r.dt_untilstore   || 0;
    map[key]._dtCars      += r.dt_trans_cnt    || 0;
    map[key]._dtHeld      += r.dt_carsheld     || 0;
    // Front-counter timings for R2P (Receipt to Print). Sum the raw ms + counts
    // across hour slots, then count-weight below.
    map[key]._fcServe     += r.fc_untilserve      || 0;
    map[key]._fcDrawer    += r.fc_untilclosedrawer || 0;
    map[key]._fcCnt       += r.fc_trans_cnt        || 0;
    // Projected (plan) guests + sales — the store's EXPECTED delivery for the day. Used
    // to pace the One-Pager GC opportunity vs plan (not vs a best-in-class store), so a
    // down sales trend doesn't inflate the gap. Same source as Signals Tracking-to-Plan.
    map[key].projGC       += r.proj_total_transactions || 0;
    map[key].projSales    += r.proj_sales_dollars      || 0;
    map[key].lySales      += r.ly_product_sales || 0;
    map[key].lyGc         += r.ly_transactions || 0;
    // Actual punched + needed labor hours summed across the day's hour slots —
    // the auto-pulled DAR labor totals (cloud-fresh on every device).
    map[key].actHrs       += r.actual_punched_hours || 0;
    map[key].needHrs      += r.total_needed_hours   || 0;
    // KVS Healthy Usage components: did the store open BOTH prep-table sides (MFY2) when the
    // item volume called for it. healthy_count = time side 2 was correctly on; unhealthy_count =
    // time it was called for but off. Healthy Usage % = healthy ÷ (healthy+unhealthy) — 100% if on
    // the whole time it's needed, 50% if half, blank when volume never called for side 2 (NOT a
    // penalty). Summed across hour slots; ratio finalized below. (owner-explained 2026-07-30)
    map[key]._kvsH        += r.healthy_count   || 0;
    map[key]._kvsU        += r.unhealthy_count || 0;
    // KVS Time components — the Kitchen Video System stations ARE the MFY (make-for-you) lines,
    // so the DAR's report-computed "KVS Time Per GC" = total MFY serve time ÷ total MFY trans.
    // Sum the raw ms + counts across hour slots; finalize per-GC seconds below.
    map[key]._mfyTime     += (r.mfy1_untilserve || 0) + (r.mfy2_untilserve || 0);
    map[key]._mfyCnt      += (r.mfy1_trans_cnt  || 0) + (r.mfy2_trans_cnt  || 0);
  }
  return _finalizeQsrAct(Object.values(map));
}

// Fast daily product-sales per (loc,date) for a window — minimal columns and
// PARALLEL pagination (count → fire all page requests at once), so a long window
// loads in seconds instead of ~60 sequential round-trips. Used by Smart Targets.
export async function loadDailySales(days = 120) {
  if (!supabase) return [];
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const PAGE = 1000;
  const { count } = await supabase.from('qsr_daily_activity')
    .select('loc', { count: 'exact', head: true }).gte('dt', cutoffStr);
  const total = count || 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  // Deterministic order so parallel .range() slices partition without gaps/overlap.
  const reqs = [];
  for (let p = 0; p < pages; p++) {
    reqs.push(supabase.from('qsr_daily_activity')
      .select('loc,dt,product_sales')
      .gte('dt', cutoffStr)
      .order('dt').order('loc').order('hour_slot')
      .range(p * PAGE, p * PAGE + PAGE - 1));
  }
  const results = await Promise.all(reqs);
  const map = {};
  for (const res of results) {
    for (const r of (res && res.data) || []) {
      const loc = String(parseInt(r.loc, 10));
      const k = loc + '|' + r.dt;
      if (!map[k]) map[k] = { loc, date: new Date(r.dt + 'T00:00:00'), sales: 0 };
      map[k].sales += r.product_sales || 0;
    }
  }
  return Object.values(map);
}

// ── Cloud-first emailed-report loaders ────────────────────────────────────────
// Load the server-parsed QSRSoft email reports from Supabase and return them in
// the SAME camelCase shape the client parsers produce, so existing consumers
// (delivery-mix, morning-brief, At A Glance) work unchanged — but cross-device
// fresh instead of device-local IDB. All fail soft to [] (e.g. table not yet
// created), preserving the prior IDB behavior.
const _mkDate = (dt) => new Date(dt + 'T00:00:00');

// ── Operations Report streams (#37) — the store-daily JSONB tables from qsrsoft-ops-pull.mjs.
// Each row's `metrics` JSONB (snake_cased fields incl ly_/ybl_) is spread flat onto the row, so
// consumers read { loc, date, discount_amt, treds_after_qty, over_time_total_hours, … } directly.
// daysBack bounds egress. Return [] when the table isn't created yet (fails soft).
async function _loadOpsTable(table, daysBack, extra) {
  if (!supabase) return [];
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - daysBack);
  const iso = cutoff.toISOString().slice(0, 10);
  try {
    const data = await fetchAll((from, to) => supabase.from(table).select('*')
      .gte('dt', iso).order('dt', { ascending: false }).range(from, to));
    return (data || []).map(r => ({
      // Strip zero-padding ("0003708" → "3708") — same normalization loadQsrActSummary already
      // does. Without it, every ops*Rows stream (opsCashRows/opsLaborRows/opsServiceRows/
      // opsSalesMixRows/opsPeaksRows) carries the qsr_* tables' padded NSN format while allLocs/
      // STORE_NAMES/ctrlRows/glimpseRows use unpadded — any `allLocs.includes(String(r.loc))` or
      // metric-source.js loc-keyed lookup then silently drops every row from these streams. Found
      // 2026-08-04: DT Parked %/KVS Healthy Usage/T-Red %s reading real, complete DB data (verified
      // via direct query) yet showing blank in the AAG — eom-supervisor.js's own reads were unaffected
      // only because that file re-pads both sides before comparing (`.padStart(7,'0')`), which is a
      // no-op either way and stays correct after this change.
      loc: String(parseInt(r.loc, 10)), date: new Date(r.dt + 'T00:00:00'),
      ...(r.metrics || {}), ...(r.needed || {}),
      ...(r.time_slice != null ? { timeSlice: r.time_slice } : {}),
    }));
  } catch (e) { console.warn(`[${table}] load skipped:`, e?.message || e); return []; }
}
// Controls — also derives discPct = discount $ ÷ net sales (reconciled to the report:
// 174.15/10076.96 = 1.73% for 3708 2026-07-29). T-Red % denominators are left for a
// reconciliation pass (qty/amt are exact and already flat on the row).
export const loadOpsCashSheet = async (d = 45) => {
  const rows = await _loadOpsTable('qsr_cash_sheet', d);
  return rows.map(r => ({
    ...r,
    discPct: (r.net_sales_amt > 0 && r.discount_amt != null) ? r.discount_amt / r.net_sales_amt : null,
    mealDiscAmt: (r.emp_meal_discount_amt || 0) + (r.mgr_meal_discount_amt || 0),
    // T-Reds Before/After % + drawer opens (#37) — closes the stale-Controls gap for these
    // three fields the same way discPct already does: net-sales-weighted, auto-fresh backstop.
    tRedBPct: (r.net_sales_amt > 0 && r.treds_before_amt != null) ? r.treds_before_amt / r.net_sales_amt : null,
    tRedAPct: (r.net_sales_amt > 0 && r.treds_after_amt != null) ? r.treds_after_amt / r.net_sales_amt : null,
    drawerOpens: r.drawer_opens_qty != null ? Number(r.drawer_opens_qty) : null,
    // Cash Over/Short $ (#52) — auto-first backstop for EOM Supervisor's Cash +/- actual.
    cashOSAmt: r.cash_over_or_short != null ? Number(r.cash_over_or_short) : null,
    // Cash Over/Short % (2026-08-04) — same net-sales-weighted pattern as discPct/tRedAPct above;
    // ctrlAuto only had this from glimpseRows/cashRows, which weren't covering the current week.
    cashOSPct: (r.net_sales_amt > 0 && r.cash_over_or_short != null) ? r.cash_over_or_short / r.net_sales_amt : null,
    // T-Red counts + cash/cashless refund counts+$ (2026-08-04) — the AAG Controls & Integrity
    // tile only had the T-Red PERCENTS auto-sourced (above); the raw qty/amt counts were still
    // manual-only, so they read 0 whenever no manual Controls upload covered the period even
    // though real counts existed in qsr_cash_sheet all along.
    tRedACnt: r.treds_after_qty != null ? Number(r.treds_after_qty) : null,
    tRedBCnt: r.treds_before_qty != null ? Number(r.treds_before_qty) : null,
    cashRefCnt: r.cash_refunds_qty != null ? Number(r.cash_refunds_qty) : null,
    cashRefAmt: r.cash_refunds_amt != null ? Number(r.cash_refunds_amt) : null,
    cashlessRefCnt: r.cashless_refunds_qty != null ? Number(r.cashless_refunds_qty) : null,
    cashlessRefAmt: r.cashless_refunds_amt != null ? Number(r.cashless_refunds_amt) : null,
  }));
};
// OT + crew + needed hrs. Alias the snake_cased OT fields to the app's otHrs/otDollar so tiles that
// look for those names (AAG Labor, EOM Supervisor) can read the auto stream with no manual upload (#37).
export const loadOpsLaborSummary = async (d = 45) => {
  const rows = await _loadOpsTable('qsr_labor_summary', d);
  return rows.map(r => ({ ...r, otHrs: Number(r.over_time_total_hours) || 0, otDollar: Number(r.over_time_total_dollars) || 0 }));
};
// Service stats → derive the composed metrics the AAG/One-Pager read (the raw fields are already flat
// on the row via _loadOpsTable). This is the cloud-fresh source that fills KVS (the DAR carries MFY
// serve time but its order-health counts are 0, so DAR-derived KVS Healthy is null) + DT Parked.
//   KVS Time/GC = Σ MFY serve time ÷ Σ MFY trans ÷ 1000 (reconciled to the QSRSoft KVS column)
//   KVS Healthy = healthy ÷ (healthy+unhealthy) order-health counts (0–1)
//   OEPE        = oepe_total ÷ oepe_trans ÷ 1000 (≈ the DAR OEPE; a backstop)
//   DT Parked % = dt_cars_held ÷ dt_serve_trans (0–1)
export const loadOpsServiceStats = async (d = 45) => {
  const rows = await _loadOpsTable('qsr_service_stats', d);
  return rows.map(r => {
    const mfyTime  = (Number(r.mfy_one_serve_total) || 0) + (Number(r.mfy2_untilserve) || 0);
    const mfyTrans = (Number(r.mfy_one_serve_trans) || 0) + (Number(r.mfy_two_serve_trans) || 0);
    const kvsDen   = (Number(r.healthy_cnt) || 0) + (Number(r.unhealthy_cnt) || 0);
    return {
      ...r,
      kvst:       mfyTrans > 0 ? mfyTime / mfyTrans / 1000 : null,
      kvsHealthy: kvsDen   > 0 ? (Number(r.healthy_cnt) || 0) / kvsDen : null,
      oepe:       Number(r.oepe_trans)     > 0 ? Number(r.oepe_total) / Number(r.oepe_trans) / 1000 : null,
      park:       Number(r.dt_serve_trans) > 0 ? (Number(r.dt_cars_held) || 0) / Number(r.dt_serve_trans) : null,
    };
  });
};
export const loadOpsSalesMix     = (d = 45) => _loadOpsTable('qsr_sales_mix', d);      // channel sales + ly + ybl
export const loadOpsPeaksSales   = (d = 45) => _loadOpsTable('qsr_peaks_sales', d);    // 3 Peaks daypart sales

export async function loadGlimpse(daysBack = 45) {
  if (!supabase) return [];
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - daysBack);
  const iso = cutoff.toISOString().slice(0, 10);
  // Paginate + order NEWEST-first: 27 stores × 45-60 days exceeds Supabase's 1000-row cap,
  // and if a page read is cut off (free-tier egress throttle), we must keep the RECENT days
  // these freshest-wins tiles need — ascending order silently dropped the newest days (the
  // "Service/Controls stuck at an old date" bug, even though email-parse writes them current).
  const data = await _pagedParallel({ table: 'daily_glimpse_daily', select: '*', gteCol: 'date', gteVal: iso, orderCol: 'date', ascending: false, label: 'glimpse' });
  return (data || []).map(r => ({
    loc: r.loc, date: _mkDate(r.date),
    allNetSales: r.all_net_sales, salesVsPrior: r.sales_vs_prior, salesVsPriorPct: r.sales_vs_prior_pct,
    dtSales: r.dt_sales, dtGC: r.dt_gc, dtAvgCheck: r.dt_avg_check,
    gc: r.gc, avgCheck: r.avg_check, laborPct: r.labor_pct,
    promoAmt: r.promo_amt, promoPct: r.promo_pct,
    posOverCnt: r.pos_over_cnt, posOverAmt: r.pos_over_amt,
    cashOS: r.cash_os, cashOSPct: r.cash_os_pct,
    tRedVoidCnt: r.t_red_void_cnt, tRedDeletedCnt: r.t_red_deleted_cnt,
    oepe: r.oepe, oepeFull: r.oepe_full, parkedPct: r.parked_pct,
    kvst: r.kvst, kvsItems: r.kvs_items, kvsHealthy: r.kvs_healthy,
    brkCarCnt: r.brk_car_cnt, luCarCnt: r.lu_car_cnt, dnCarCnt: r.dn_car_cnt,
    digitalPctSales: r.digital_pct_sales, appPctSales: r.app_pct_sales,
    _isCloud: true,
  }));
}

export async function loadCash(daysBack = 45) {
  if (!supabase) return [];
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - daysBack);
  const iso = cutoff.toISOString().slice(0, 10);
  const data = await _pagedParallel({ table: 'cash_sheet_daily', select: '*', gteCol: 'date', gteVal: iso, orderCol: 'date', ascending: false, label: 'cash' });
  return (data || []).map(r => ({
    loc: r.loc, date: _mkDate(r.date),
    allNetSales: r.all_net_sales, gc: r.gc, avgCheck: r.avg_check,
    doorDashSales: r.doordash_sales, doorDashGC: r.doordash_gc,
    uberEatsSales: r.ubereats_sales, uberEatsGC: r.ubereats_gc,
    grubhubSales: r.grubhub_sales, grubhubGC: r.grubhub_gc,
    total3poSales: r.total_3po_sales, total3poGC: r.total_3po_gc,
    mopEatIn: r.mop_eat_in, mopTakeout: r.mop_takeout,
    kioskEatIn: r.kiosk_eat_in, kioskTakeout: r.kiosk_takeout,
    cashOS: r.cash_os, cashOSPct: r.cash_os_pct,
    cashRefCnt: r.cash_ref_cnt, cashRefAmt: r.cash_ref_amt,
    cashlessRefCnt: r.cashless_ref_cnt, cashlessRefAmt: r.cashless_ref_amt,
    posOverCnt: r.pos_over_cnt, posOverAmt: r.pos_over_amt,
    tRedVoidCnt: r.t_red_void_cnt, tRedDeletedCnt: r.t_red_deleted_cnt,
    _isCloud: true,
  }));
}

export async function loadSalesLedger(daysBack = 45) {
  if (!supabase) return [];
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - daysBack);
  const iso = cutoff.toISOString().slice(0, 10);
  const data = await _pagedParallel({ table: 'sales_ledger_daily', select: '*', gteCol: 'date', gteVal: iso, orderCol: 'date', ascending: false, label: 'salesLedger' });
  return (data || []).map(r => ({
    loc: r.loc, date: _mkDate(r.date),
    sales: r.all_net_sales, allNetSales: r.all_net_sales, allNetSalesLY: r.all_net_sales_ly, salesVsLYPct: r.sales_vs_ly_pct,
    gc: r.gc, avgCheck: r.avg_check,
    dtSales: r.dt_sales, dtGC: r.dt_gc, dtAvgChk: r.dt_avg_chk, dtPctTotal: r.dt_pct_total,
    bfSales: r.bf_sales, bfGC: r.bf_gc, bfAvgChk: r.bf_avg_chk, bfPctTotal: r.bf_pct_total,
    delivSales: r.deliv_sales, delivGC: r.deliv_gc, delivAvgChk: r.deliv_avg_chk, delivPctTotal: r.deliv_pct_total,
    mopSales: r.mop_sales, mopGC: r.mop_gc, mopAvgChk: r.mop_avg_chk, mopPctTotal: r.mop_pct_total,
    kioskSales: r.kiosk_sales, kioskGC: r.kiosk_gc, kioskAvgChk: r.kiosk_avg_chk, kioskPctTotal: r.kiosk_pct_total,
    fcSales: r.fc_sales, fcGC: r.fc_gc, fcPctTotal: r.fc_pct_total,
    inStoreSales: r.in_store_sales, inStoreGC: r.in_store_gc, inStorePctTotal: r.in_store_pct_total,
    eatInSales: r.eat_in_sales, eatInGC: r.eat_in_gc,
    laborPct: 0, actHrs: 0, otHrs: 0, tpph: 0, spph: 0,
    _isCloudLedger: true,
  }));
}

// ── Forecast snapshots ────────────────────────────────────────────────────────
// Upsert per-day forecast accuracy rows from the backtest panel.
// rows: Array<{loc, dt, source, forecast_sales, actual_sales, mape}>
export async function saveForecastSnapshots(rows) {
  if (!supabase || !rows?.length) return;
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await supabase
      .from('forecast_snapshots')
      .upsert(rows.slice(i, i + BATCH), { onConflict: 'loc,dt,source' });
    if (error) console.error('saveForecastSnapshots batch', i, error.message);
  }
}

export async function loadForecastSnapshots(locs, days = 90) {
  if (!supabase) return [];
  const startDt = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  let q = supabase
    .from('forecast_snapshots')
    .select('loc,dt,source,forecast_sales,actual_sales,mape')
    .gte('dt', startDt)
    .order('dt', { ascending: true })
    .limit(50000);
  if (locs?.length) q = q.in('loc', locs);
  const { data, error } = await q;
  if (error) { console.error('loadForecastSnapshots:', error.message); return []; }
  return data || [];
}

export async function loadQsrFieldDefs() {
  if (!supabase) return {};
  const { data, error } = await supabase
    .from('qsr_field_definitions')
    .select('page_key,field_label,description');
  if (error) { console.warn('[supabase] loadQsrFieldDefs:', error.message); return {}; }
  const map = {};
  for (const row of data || []) {
    if (!map[row.page_key]) map[row.page_key] = {};
    map[row.page_key][row.field_label] = row.description;
  }
  return map;
}

// ── Task Queue ────────────────────────────────────────────────────────────────
export async function loadTasks() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .not('status', 'eq', 'scrapped')
    .order('priority', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) { console.warn('[supabase] loadTasks:', error.message); return []; }
  return data || [];
}

export async function saveTask(task) {
  if (!supabase) return null;
  const { data, error } = await supabase.from('tasks').insert(task).select().single();
  if (error) { console.warn('[supabase] saveTask:', error.message); return null; }
  return data;
}

export async function updateTask(id, updates) {
  if (!supabase) return;
  const { error } = await supabase
    .from('tasks')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) console.warn('[supabase] updateTask:', error.message);
}

// ── Session Notes ─────────────────────────────────────────────────────────────
export async function loadSessionNotes() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('session_notes')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) { console.warn('[supabase] loadSessionNotes:', error.message); return []; }
  return data || [];
}

export async function saveSessionNote(body, source = 'manual') {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('session_notes')
    .insert({ body, source })
    .select()
    .single();
  if (error) { console.warn('[supabase] saveSessionNote:', error.message); return null; }
  return data;
}

export async function markNoteConsumed(id) {
  if (!supabase) return;
  await supabase.from('session_notes').update({ consumed: true }).eq('id', id);
}

// ── User settings (cross-device persistence) ─────────────────────────────────
// Stores arbitrary JSON blobs keyed by setting name, tied to the authenticated user.
// Requires: CREATE TABLE user_settings (user_id uuid references auth.users, key text,
//   value jsonb, updated_at timestamptz default now(), PRIMARY KEY (user_id, key));
// RLS: enable, policy: user_id = auth.uid() for all operations.
export async function saveUserSetting(key, value) {
  if (!supabase) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from('user_settings')
    .upsert({ user_id: user.id, key, value, updated_at: new Date().toISOString() },
             { onConflict: 'user_id,key' });
}

export async function loadUserSetting(key) {
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  // maybeSingle() (not single()) → returns null instead of a 406 Not Acceptable when the
  // setting hasn't been saved yet (a first-run / unsaved key is normal, not an error).
  const { data, error } = await supabase.from('user_settings')
    .select('value').eq('user_id', user.id).eq('key', key).maybeSingle();
  if (error) return null;
  return data?.value ?? null;
}

// ── Microsoft / Azure AD migration note ───────────────────────────────────────
// To switch auth to Microsoft Entra ID (M365 SSO) later:
//   1. In Supabase dashboard → Auth → Providers → Azure → enable + paste tenant/client
//   2. Replace signInWithOtp below with:
//        supabase.auth.signInWithOAuth({ provider: 'azure' })
//   3. Or: swap Supabase Auth entirely for MSAL.js and keep Supabase as the database.
//      In that case, pass the MSAL access token to Supabase via
//        supabase.auth.setSession({ access_token: msalToken })
//   The database schema and RLS policies do not change in either path.

// ── Graded Visits (CFV / RGR / Ecosure) ──────────────────────────────────────
export async function saveGradedVisits(rows) {
  if (!supabase || !rows?.length) return { saved: 0, errors: [] };
  // Dedupe by the conflict key (last wins) — a single upsert batch cannot touch
  // the same (loc, visit_date, report_type) row twice or Postgres rejects it all.
  const byKey = new Map();
  for (const r of rows) { if (r.store && r.dateISO) byKey.set(String(r.store) + '|' + r.dateISO + '|' + (r.reportType || 'CFV'), r); }
  const deduped = [...byKey.values()];
  const upsert = deduped.map(r => ({
    report_type: r.reportType || 'CFV',
    loc:         String(r.store),
    visit_date:  r.dateISO,
    daypart:     r.daypart  ?? null,
    weekpart:    r.weekpart ?? null,
    owner:       r.owner    ?? null,
    manager:     r.manager  ?? null,
    visit_by:    r.visitBy  ?? null,
    score:           r.score    ?? null,
    pass:            r.pass     ?? null,
    channel:         r.channel  ?? null,
    mobile_app:      r.mobileApp ?? null,
    status:          r.status   ?? null,
    completion_time: r.completionTime ?? null,
    modules:         r.modules  ?? null,
    raw_title:       r.title    ?? null,
    updated_at:  new Date().toISOString(),
  }));
  if (!upsert.length) return { saved: 0, errors: ['no valid rows (missing store or date)'] };
  const { error } = await supabase.from('graded_visits').upsert(upsert, { onConflict: 'loc,visit_date,report_type' });
  if (error) { console.warn('[graded_visits] save error:', error); return { saved: 0, errors: [error.message] }; }
  console.log(`[graded_visits] saved ${upsert.length} visits`);
  return { saved: upsert.length, errors: [] };
}

export async function loadGradedVisits() {
  if (!supabase) return [];
  const { data, error } = await supabase.from('graded_visits').select('*').order('visit_date', { ascending: false });
  if (error) { console.warn('[graded_visits] load error:', error); return []; }
  return (data || []).map(r => ({
    id: r.id, reportType: r.report_type, store: r.loc, dateISO: r.visit_date, date: r.visit_date,
    daypart: r.daypart, weekpart: r.weekpart, owner: r.owner, manager: r.manager, visitBy: r.visit_by,
    score: r.score, pass: r.pass, channel: r.channel, mobileApp: r.mobile_app, status: r.status,
    completionTime: r.completion_time,
    modules: r.modules || {}, title: r.raw_title,
  }));
}

// ── Operational context for a graded visit ───────────────────────────────────
// The hourly DAR picture for a store on the visit date (speed by station, labor
// vs need/sched, KVS health) plus the day's Daily Glimpse summary (OEPE/KVS/labor)
// — the environment the restaurant was in when the visit happened. Foundation for
// the Graded-Visit Predictor. loc is padded to 7 for qsr_daily_activity.
export async function loadVisitDAR(loc, dateISO) {
  if (!supabase || !loc || !dateISO) return { hours: [], glimpse: null };
  const padded = String(parseInt(loc, 10)).padStart(7, '0');
  const short = String(parseInt(loc, 10));
  const [{ data: hrs }, { data: gl }] = await Promise.all([
    supabase.from('qsr_daily_activity')
      .select('hour_slot,product_sales,transactions,ly_product_sales,ly_transactions,dt_untilserve,dt_trans_cnt,dt_untilstore,dt_untilrecall,dt_carsheld,dt_heldtime,fc_untilserve,fc_untilclosedrawer,fc_trans_cnt,mfy1_untilserve,mfy1_trans_cnt,mfy2_untilserve,mfy2_trans_cnt,bev_untilserve,bev_trans_cnt,actual_punched_hours,actual_punched_dollars,prod_sales_scrubbed,total_needed_hours,total_scheduled_hours,healthy_count,unhealthy_count')
      .eq('loc', padded).eq('dt', dateISO).order('hour_slot'),
    supabase.from('daily_glimpse_daily').select('*').eq('loc', short).eq('date', dateISO).limit(1),
  ]);
  return { hours: hrs || [], glimpse: (gl && gl[0]) || null };
}

// ── Labor Analysis (Fixed-Labor-Hours) ───────────────────────────────────────
// Per-store config (hours-of-op + gathered fixed-hours) and weekly LifeLenz
// inputs. Derived efficiency columns are computed in src/engine/labor-analysis.js,
// never stored. loc is unpadded ('3708') to match STORE_NAMES.

// Upsert per-store config. `configs` = [{loc, is24hr, is24Note, maintHours,
// maintPeople, maintDaysOff, prepHours, lobbyHours, hours}].
export async function saveStoreLaborConfig(configs) {
  if (!supabase) return { saved: 0, errors: ['Supabase not configured'] };
  const rows = (configs || []).filter(c => c && c.loc).map(c => ({
    loc: String(parseInt(c.loc, 10)),
    is_24hr: !!c.is24hr,
    is_24_note: c.is24Note ?? null,
    maint_hours: c.maintHours ?? null,
    maint_people: c.maintPeople ?? null,
    maint_days_off: c.maintDaysOff ?? null,
    prep_hours: c.prepHours ?? null,
    lobby_hours: c.lobbyHours ?? null,
    hours_json: c.hours ?? null,
    updated_at: new Date().toISOString(),
  }));
  if (!rows.length) return { saved: 0, errors: [] };
  const { error } = await supabase.from('store_labor_config').upsert(rows, { onConflict: 'loc' });
  if (error) {
    if (error.message?.includes('relation') || error.code === '42P01')
      console.error('[store_labor_config] Table missing — run the store_labor_config block from schema.sql.');
    else console.error('[store_labor_config] save error:', error.message);
    return { saved: 0, errors: [error.message] };
  }
  return { saved: rows.length, errors: [] };
}

// Load all store config → { loc: {is24hr, is24Note, maintHours, ..., hours} }.
export async function loadStoreLaborConfig() {
  if (!supabase) return {};
  const { data, error } = await supabase.from('store_labor_config').select('*');
  if (error || !data) { if (error) console.warn('[store_labor_config] load error:', error.message); return {}; }
  const out = {};
  for (const r of data) out[r.loc] = {
    loc: r.loc, is24hr: r.is_24hr, is24Note: r.is_24_note,
    maintHours: r.maint_hours, maintPeople: r.maint_people, maintDaysOff: r.maint_days_off,
    prepHours: r.prep_hours, lobbyHours: r.lobby_hours, hours: r.hours_json || {},
  };
  return out;
}

// Upsert weekly Band-1 inputs. `rows` = [{loc, band1{...}}] or flat band1 rows;
// pass weekStart/weekEnd/monthTag from the parsed sheet.
export async function saveLifeLenzLaborWeek(stores, { weekStart, weekEnd, monthTag, source = 'mbi_upload' } = {}) {
  if (!supabase) return { saved: 0, errors: ['Supabase not configured'] };
  if (!weekStart) return { saved: 0, errors: ['weekStart required'] };
  const rows = (stores || []).map(s => (s.band1 ? s.band1 : s)).filter(b => b && b.loc).map(b => ({
    loc: String(parseInt(b.loc, 10)),
    week_start: weekStart, week_end: weekEnd ?? null, month_tag: monthTag ?? null,
    proj_sales_month: b.projSalesMonth ?? null,
    sales_fcst: b.salesFcst ?? null,
    labor_pct_actual: b.laborPctActual ?? null,
    gc_fcst: b.gcFcst ?? null,
    hours_fcst: b.hoursFcst ?? null,
    hours_sched: b.hoursSched ?? null,
    sched_fixed_pct: b.schedFixedPct ?? null,
    tpph: b.tpph ?? null,
    rate: b.rate ?? null,
    labor_target_org: b.laborTargetOrg ?? null,
    actual_hours: b.actualHours ?? null,
    source,
    updated_at: new Date().toISOString(),
  }));
  if (!rows.length) return { saved: 0, errors: [] };
  const { error } = await supabase.from('lifelenz_labor_week').upsert(rows, { onConflict: 'loc,week_start' });
  if (error) {
    if (error.message?.includes('relation') || error.code === '42P01')
      console.error('[lifelenz_labor_week] Table missing — run the lifelenz_labor_week block from schema.sql.');
    else console.error('[lifelenz_labor_week] save error:', error.message);
    return { saved: 0, errors: [error.message] };
  }
  return { saved: rows.length, errors: [] };
}

// Load weekly labor inputs. Pass weekStart for one week, else the latest week per
// store. Returns { weekStart, rows: { loc: {salesFcst, laborPctActual, ...} } }.
export async function loadLifeLenzLaborWeek({ weekStart = null } = {}) {
  if (!supabase) return { weekStart: null, rows: {} };
  let q = supabase.from('lifelenz_labor_week').select('*');
  if (weekStart) q = q.eq('week_start', weekStart);
  else q = q.order('week_start', { ascending: false });
  const { data, error } = await q;
  if (error || !data) { if (error) console.warn('[lifelenz_labor_week] load error:', error.message); return { weekStart: null, rows: {} }; }
  // Back-compat heal: rows written before v4.464 stored Hours Forecast/Scheduled
  // as Excel [h]:mm day-serials (raw ~62.5) instead of real hours (~1500). A real
  // store's weekly hours are always >1000, so anything under 300 is a day-serial
  // → ×24. New uploads already store real hours, so this is a no-op for them.
  const _healHrs = v => (v != null && v > 0 && v < 300) ? v * 24 : v;
  // Without an explicit week, keep only each store's most-recent row.
  const rows = {}; let latest = weekStart;
  for (const r of data) {
    if (rows[r.loc]) continue; // data is week-desc → first seen is newest
    if (!latest || r.week_start > latest) latest = r.week_start;
    rows[r.loc] = {
      loc: r.loc, weekStart: r.week_start, weekEnd: r.week_end, monthTag: r.month_tag,
      projSalesMonth: r.proj_sales_month, salesFcst: r.sales_fcst, laborPctActual: r.labor_pct_actual,
      gcFcst: r.gc_fcst, hoursFcst: _healHrs(r.hours_fcst), hoursSched: _healHrs(r.hours_sched), schedFixedPct: r.sched_fixed_pct,
      tpph: r.tpph, rate: r.rate, laborTargetOrg: r.labor_target_org, actualHours: _healHrs(r.actual_hours), source: r.source,
    };
  }
  return { weekStart: latest, rows };
}

// ── Smart Targets: per-store known-event adjustments ─────────────────────────
// excludeDates (drop one-off days from learning) + eventDelta (signed units added
// to the projected total) + note, keyed by (loc, metricKey). Fails soft to {}.
export async function loadSmartTargetAdjustments(metricKey = null) {
  if (!supabase) return {};
  let q = supabase.from('smart_target_adjustments').select('*');
  if (metricKey) q = q.eq('metric_key', metricKey);
  const { data, error } = await q;
  if (error) {
    if (!(error.message || '').includes('relation') && error.code !== '42P01')
      console.warn('[smart_target_adjustments] load error:', error.message);
    return {};
  }
  const out = {};
  for (const r of data || []) {
    const loc = String(parseInt(r.loc, 10));
    (out[r.metric_key] = out[r.metric_key] || {})[loc] = {
      excludeDates: Array.isArray(r.exclude_dates) ? r.exclude_dates : [],
      eventDelta: typeof r.event_delta === 'number' ? r.event_delta : 0,
      note: r.event_note || '',
    };
  }
  return metricKey ? (out[metricKey] || {}) : out;
}

export async function saveSmartTargetAdjustment(loc, metricKey, { excludeDates = [], eventDelta = 0, note = '' } = {}) {
  if (!supabase) return { saved: 0, errors: ['Supabase not configured'] };
  if (!loc || !metricKey) return { saved: 0, errors: ['loc + metricKey required'] };
  // Empty adjustment → delete the row so the table only holds real overrides.
  const clean = (excludeDates || []).filter(Boolean);
  if (!clean.length && !eventDelta && !(note || '').trim()) {
    const { error } = await supabase.from('smart_target_adjustments')
      .delete().eq('loc', String(parseInt(loc, 10))).eq('metric_key', metricKey);
    if (error) { console.warn('[smart_target_adjustments] delete error:', error.message); return { saved: 0, errors: [error.message] }; }
    return { saved: 0, deleted: true, errors: [] };
  }
  const row = {
    loc: String(parseInt(loc, 10)), metric_key: metricKey,
    exclude_dates: clean, event_delta: Number(eventDelta) || 0,
    event_note: (note || '').trim() || null, updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('smart_target_adjustments').upsert(row, { onConflict: 'loc,metric_key' });
  if (error) {
    if ((error.message || '').includes('relation') || error.code === '42P01')
      console.error('[smart_target_adjustments] Table missing — run the smart_target_adjustments block from schema.sql.');
    else console.error('[smart_target_adjustments] save error:', error.message);
    return { saved: 0, errors: [error.message] };
  }
  return { saved: 1, errors: [] };
}

// ── SAGE: saved prompt library ───────────────────────────────────────────────
// Reusable prompts the owner saves for quick re-run. Fails soft to [] if the table
// isn't created yet.
export async function loadSagePrompts() {
  if (!supabase) return [];
  const { data, error } = await supabase.from('sage_prompts').select('*').order('updated_at', { ascending: false });
  if (error) {
    if (!(error.message || '').includes('relation') && error.code !== '42P01')
      console.warn('[sage_prompts] load error:', error.message);
    return [];
  }
  return (data || []).map(r => ({ id: r.id, title: r.title, promptText: r.prompt_text, tags: r.tags || '', createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at,
    scheduleEnabled: !!r.schedule_enabled, scheduleHour: r.schedule_hour, scheduleFreq: r.schedule_freq || 'daily', scheduleDow: r.schedule_dow, lastRunAt: r.last_run_at }));
}

// Set/clear a prompt's auto-run schedule (Phase 2). enabled+hour+freq(+dow for weekly).
export async function updateSagePromptSchedule(id, { enabled = false, hour = null, freq = 'daily', dow = null } = {}) {
  if (!supabase || !id) return { saved: 0, errors: ['id required'] };
  const row = { schedule_enabled: !!enabled, schedule_hour: enabled ? hour : null, schedule_freq: enabled ? freq : null, schedule_dow: enabled && freq === 'weekly' ? dow : null, updated_at: new Date().toISOString() };
  const { error } = await supabase.from('sage_prompts').update(row).eq('id', id);
  if (error) { console.warn('[sage_prompts] schedule error:', error.message); return { saved: 0, errors: [error.message] }; }
  return { saved: 1, errors: [] };
}

// Recent scheduled-prompt run history (for the At-A-Glance tile + library log).
export async function loadSagePromptRuns(limit = 10) {
  if (!supabase) return [];
  const { data, error } = await supabase.from('sage_prompt_runs').select('*').order('ran_at', { ascending: false }).limit(limit);
  if (error) {
    if (!(error.message || '').includes('relation') && error.code !== '42P01')
      console.warn('[sage_prompt_runs] load error:', error.message);
    return [];
  }
  return (data || []).map(r => ({ id: r.id, promptId: r.prompt_id, title: r.title, ranAt: r.ran_at, ok: r.ok !== false, resultMd: r.result_md || '', error: r.error || '' }));
}

export async function saveSagePrompt({ id = null, title, promptText, tags = '', createdBy = '' } = {}) {
  if (!supabase) return { saved: 0, errors: ['Supabase not configured'] };
  if (!title || !promptText) return { saved: 0, errors: ['title + promptText required'] };
  const row = { title, prompt_text: promptText, tags: tags || null, updated_at: new Date().toISOString() };
  if (id) row.id = id; else row.created_by = createdBy || null;
  const { data, error } = await supabase.from('sage_prompts').upsert(row).select().single();
  if (error) {
    if ((error.message || '').includes('relation') || error.code === '42P01')
      console.error('[sage_prompts] Table missing — run the sage_prompts block from schema.sql.');
    else console.error('[sage_prompts] save error:', error.message);
    return { saved: 0, errors: [error.message] };
  }
  return { saved: 1, row: data, errors: [] };
}

export async function deleteSagePrompt(id) {
  if (!supabase || !id) return { deleted: 0 };
  const { error } = await supabase.from('sage_prompts').delete().eq('id', id);
  if (error) { console.warn('[sage_prompts] delete error:', error.message); return { deleted: 0, errors: [error.message] }; }
  return { deleted: 1 };
}

// ── Crew Skills Matrix (LifeLenz People List) ────────────────────────────────
// Per-employee skill ratings (1-5) by job. Keyed by the ROSTER store (the store
// whose People page/file this is), NOT the employee's home store — a person
// rostered at a transition/shared store must show under THAT store even if their
// home store is elsewhere. `home_store` keeps the home for display.
// `employees` = [{employee, loc(home), homeStore, role, roleCode, isPrimaryRole,
//                 schoolCalendar, skills:{job:rating}}].
// opts.rosterLoc = the store this roster belongs to (overrides each e.loc).
// opts.replace   = delete this store's existing rows first, so the roster is
//                  authoritative (a re-pull/upload wins — "pull takes precedence")
//                  and no stale crew linger.
export async function saveEmployeeSkills(employees, { source = 'lifelenz_people_csv', rosterLoc = null, replace = false } = {}) {
  if (!supabase) return { saved: 0, errors: ['Supabase not configured'] };
  const roster = rosterLoc != null ? String(parseInt(rosterLoc, 10)) : null;
  const rows = (employees || []).filter(e => e && e.employee && (roster || e.loc)).map(e => ({
    loc: roster || String(parseInt(e.loc, 10)),
    employee: e.employee,
    home_store: e.homeStore ?? null,
    role: e.role ?? null,
    role_code: e.roleCode ?? null,
    is_primary_role: e.isPrimaryRole !== false,
    school_calendar: e.schoolCalendar ?? null,
    skills_json: e.skills ?? {},
    source,
    updated_at: new Date().toISOString(),
  }));
  if (!rows.length) return { saved: 0, errors: [] };
  if (replace && roster) {
    const { error: delErr } = await supabase.from('employee_skills').delete().eq('loc', roster);
    if (delErr) console.warn('[employee_skills] replace-delete error:', delErr.message);
  }
  const { error } = await supabase.from('employee_skills').upsert(rows, { onConflict: 'loc,employee' });
  if (error) {
    if (error.message?.includes('relation') || error.code === '42P01')
      console.error('[employee_skills] Table missing — run the employee_skills block from schema.sql.');
    else console.error('[employee_skills] save error:', error.message);
    return { saved: 0, errors: [error.message] };
  }
  return { saved: rows.length, errors: [] };
}

// Load the whole skills roster → [{employee, loc(roster), homeStore, ..., updatedAt}].
// Paginated: the roster is >1000 rows (27 stores × ~57 crew), and Supabase caps a
// plain select at 1000 — without paging, ~19 stores' worth silently drop.
export async function loadEmployeeSkills() {
  if (!supabase) return [];
  const PAGE = 1000;
  const { count } = await supabase.from('employee_skills').select('loc', { count: 'exact', head: true });
  const pages = Math.max(1, Math.ceil((count || 0) / PAGE));
  const reqs = [];
  for (let p = 0; p < pages; p++) reqs.push(supabase.from('employee_skills').select('*').order('loc').order('employee').range(p * PAGE, p * PAGE + PAGE - 1));
  const results = await Promise.all(reqs);
  const out = [];
  for (const res of results) {
    if (res.error) { console.warn('[employee_skills] load error:', res.error.message); continue; }
    for (const r of (res.data || [])) out.push({
      employee: r.employee, loc: r.loc, homeStore: r.home_store, role: r.role,
      roleCode: r.role_code, isPrimaryRole: r.is_primary_role, schoolCalendar: r.school_calendar,
      skills: r.skills_json || {}, source: r.source, updatedAt: r.updated_at,
    });
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// EOM Inventory streams (Notes 29) — auto-pulled QSRSoft inventory reports.
// period = 'YYYY-MM'. Row shapes mirror src/views/fob-eom.js parsers.
// ═══════════════════════════════════════════════════════════════════════════

const _toISO = v => v == null ? null : (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
const _fromISO = v => v == null ? null : new Date(String(v).slice(0, 10) + 'T00:00:00');

async function _chunkUpsert(table, rows, onConflict) {
  const CHUNK = 500;
  let saved = 0; const errors = [];
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase.from(table).upsert(rows.slice(i, i + CHUNK), { onConflict });
    if (error) { console.warn(`[${table}] save error:`, error.message); errors.push(error.message); }
    else saved += Math.min(CHUNK, rows.length - i);
  }
  console.log(`[${table}] saved ${saved} rows`);
  return { saved, errors };
}

// ── On-Hand Inventory ─────────────────────────────────────────────────────────
export async function saveQsrOnHand(rows) {
  if (!supabase || !rows?.length) return { saved: 0, errors: [] };
  const up = rows.map(r => ({
    loc:            String(r.loc),
    period:         String(r.period),
    wrin:           String(r.wrin),
    descr:          r.descr ?? r.desc ?? null,
    cls:            r.cls ?? null,
    cases:          r.cases ?? null,
    packs:          r.packs ?? null,
    loose:          r.loose ?? null,
    total_units:    r.totalUnits ?? null,
    unit_price:     r.unitPrice ?? null,
    on_hand_amt:    r.onHandAmt ?? null,
    last_counted:   _toISO(r.lastCounted),
    last_submitted: _toISO(r.lastSubmitted),
  }));
  return _chunkUpsert('qsr_onhand', up, 'loc,period,wrin');
}

export async function loadQsrOnHand({ period } = {}) {
  if (!supabase) return [];
  const data = await fetchAll((from, to) => {
    let q = supabase.from('qsr_onhand').select('*').range(from, to);
    if (period) q = q.eq('period', period);
    return q;
  });
  return (data || []).map(r => ({
    // Strip zero-padding — same fix as loadQsrRawItemDetail (v4.821): this loader never
    // normalized loc either, so byLoc/computeCountProgress lookups keyed by the app's
    // unpadded convention silently found nothing (2026-08-05, "no indication of items
    // counted" despite FOB numbers being right — FOB comes from a different, already-
    // normalized source).
    loc: String(parseInt(r.loc, 10)), period: r.period, wrin: r.wrin, descr: r.descr, cls: r.cls,
    cases: r.cases, packs: r.packs, loose: r.loose, totalUnits: r.total_units,
    unitPrice: r.unit_price, onHandAmt: r.on_hand_amt,
    lastCounted: _fromISO(r.last_counted), lastSubmitted: _fromISO(r.last_submitted),
    updatedAt: r.updated_at,
  }));
}

// ── Variance Stat / Yields ────────────────────────────────────────────────────
export async function saveQsrVarianceStat(rows) {
  if (!supabase || !rows?.length) return { saved: 0, errors: [] };
  const up = rows.map(r => ({
    loc:        String(r.loc),
    period:     String(r.period),
    wrin:       String(r.wrin),
    cls:        r.cls ?? null,
    descr:      r.descr ?? r.desc ?? null,
    raw_waste:  r.rawWaste ?? null,
    comp_waste: r.compWaste ?? null,
    exp_usage:  r.expUsage ?? null,
    act_usage:  r.actUsage ?? null,
    variance:   r.variance ?? null,
    dol_diff:   r.dolDiff ?? null,
    yield_val:  r.yield ?? r.yieldVal ?? null,
    pct_sales:  r.pctOfSales ?? r.pctSales ?? null,
    raw_item_id: r.rawItemId ?? null,
    yield_lo:   r.yieldLo ?? r.yieldBand?.lo ?? null,
    yield_hi:   r.yieldHi ?? r.yieldBand?.hi ?? null,
  }));
  return _chunkUpsert('qsr_variance_stat', up, 'loc,period,wrin');
}

export async function loadQsrVarianceStat({ period } = {}) {
  if (!supabase) return [];
  const data = await fetchAll((from, to) => {
    let q = supabase.from('qsr_variance_stat').select('*').range(from, to);
    if (period) q = q.eq('period', period);
    return q;
  });
  return (data || []).map(r => ({
    loc: String(parseInt(r.loc, 10)), period: r.period, wrin: r.wrin, cls: r.cls, descr: r.descr,
    rawWaste: r.raw_waste, compWaste: r.comp_waste, expUsage: r.exp_usage,
    actUsage: r.act_usage, variance: r.variance, dolDiff: r.dol_diff,
    yield: r.yield_val, yieldLo: r.yield_lo, yieldHi: r.yield_hi,
    pctOfSales: r.pct_sales, rawItemId: r.raw_item_id, updatedAt: r.updated_at,
  }));
}

// Variance history for one store across a set of periods (oldest→newest look-back) — powers the
// Action-Items provenance panel (per-item month-over-month series + pattern classification).
// Scoped to one loc + an explicit period list to keep egress bounded (on-demand, per modal open).
export async function loadQsrVarianceHistory({ loc, periods = [] } = {}) {
  if (!supabase || !loc || !periods.length) return [];
  const data = await fetchAll((from, to) =>
    supabase.from('qsr_variance_stat').select('*')
      .eq('loc', String(loc).padStart(7, '0')).in('period', periods).range(from, to));
  return (data || []).map(r => ({
    loc: String(parseInt(r.loc, 10)), period: r.period, wrin: r.wrin, cls: r.cls, descr: r.descr,
    variance: r.variance, dolDiff: r.dol_diff, yield: r.yield_val,
    yieldLo: r.yield_lo, yieldHi: r.yield_hi, pctOfSales: r.pct_sales,
  }));
}

// DISTRICT-WIDE variance history across a set of periods — powers the Chronic Offenders scan
// (which items are chronically High-Variance / Loss-Forming across ALL stores over a past window).
// On-demand only (explicit "Run scan" button) — this reads many rows, so it must never auto-run.
// Minimal columns to keep the egress bounded; optional `locs` narrows to the current filter.
// Session cache for the variance-history pull (egress guard, task #20). The three integrity scans
// (Chronic / Reliability / Rubber-band) request the SAME periods every run; without this, running
// all three = 3× the multi-month fetch, and re-opening a modal re-pulls. Cache the FULL period pull
// keyed by the sorted period set (loc filtering is applied client-side after), TTL 5 min. Cleared
// on any variance write. This alone removes most of the egress from the integrity features.
const _varHistCache = new Map(); // periodsKey -> { at, rows }
const _VARHIST_TTL = 5 * 60 * 1000;
export function clearVarianceHistoryCache() { _varHistCache.clear(); }
export async function loadQsrVarianceHistoryAll({ periods = [], locs = null } = {}) {
  if (!supabase || !periods.length) return [];
  const norm = s => String(s || '').replace(/^0+/, '') || String(s || '');
  const locSet = locs && locs.length ? new Set(locs.map(norm)) : null;
  const key = [...periods].sort().join(',');
  const hit = _varHistCache.get(key);
  let rows;
  if (hit && (Date.now() - hit.at) < _VARHIST_TTL) {
    rows = hit.rows;
  } else {
    const data = await fetchAll((from, to) => supabase.from('qsr_variance_stat')
      .select('loc,period,wrin,cls,descr,variance,dol_diff').in('period', periods).range(from, to));
    rows = (data || []).map(r => ({
      loc: String(parseInt(r.loc, 10)), period: r.period, wrin: r.wrin, cls: r.cls, descr: r.descr,
      variance: r.variance, dolDiff: r.dol_diff,
    }));
    _varHistCache.set(key, { at: Date.now(), rows });
  }
  return locSet ? rows.filter(r => locSet.has(norm(r.loc))) : rows;
}

// ── EOM Waste (raw_waste_promo) ───────────────────────────────────────────────
export async function saveQsrWaste(rows) {
  if (!supabase || !rows?.length) return { saved: 0, errors: [] };
  const up = rows.map(r => ({
    loc:      String(r.loc),
    period:   String(r.period),
    event_id: r.eventId ?? r.id,
    busn_dt:  _toISO(r.dt ?? r.busnDt),
    busn_tm:  r.tm ?? r.busnTm ?? null,
    wtype:    r.type ?? r.wtype ?? null,
    amount:   r.amount ?? null,
    manager:  r.manager ?? null,
    wsource:  r.source ?? r.wsource ?? null,
    edited:   !!r.edited,
    reason:   r.reason ?? null,
  })).filter(r => r.event_id != null);
  return _chunkUpsert('qsr_waste', up, 'loc,event_id');
}

export async function loadQsrWaste({ period } = {}) {
  if (!supabase) return [];
  const data = await fetchAll((from, to) => {
    let q = supabase.from('qsr_waste').select('*').range(from, to);
    if (period) q = q.eq('period', period);
    return q;
  });
  return (data || []).map(r => ({
    loc: String(parseInt(r.loc, 10)), period: r.period, eventId: r.event_id, dt: r.busn_dt, tm: r.busn_tm,
    type: r.wtype, amount: r.amount, manager: r.manager, source: r.wsource,
    edited: r.edited, reason: r.reason, updatedAt: r.updated_at,
  }));
}

// ── EOM Transfers (transfers) ─────────────────────────────────────────────────
export async function saveQsrTransfers(rows) {
  if (!supabase || !rows?.length) return { saved: 0, errors: [] };
  const up = rows.map(r => ({
    loc:          String(r.loc),
    period:       String(r.period),
    transfer_id:  r.transferId ?? r.id,
    wrin:         String(r.wrin),
    dir:          r.dir ?? null,
    counterparty: r.counterpartyNsn ?? r.counterparty ?? null,
    busn_dt:      _toISO(r.dt ?? r.busnDt),
    status:       r.status ?? null,
    line_amt:     r.lineAmt ?? null,
    transfer_amt: r.transferTotal ?? r.transferAmt ?? null,
    manager:      r.manager ?? null,
    descr:        r.descr ?? null,
    cls:          r.cls ?? null,
    units:        r.units ?? null,
  })).filter(r => r.transfer_id != null && r.wrin);
  return _chunkUpsert('qsr_transfers', up, 'loc,transfer_id,wrin');
}

export async function loadQsrTransfers({ period } = {}) {
  if (!supabase) return [];
  const data = await fetchAll((from, to) => {
    let q = supabase.from('qsr_transfers').select('*').range(from, to);
    if (period) q = q.eq('period', period);
    return q;
  });
  return (data || []).map(r => ({
    loc: String(parseInt(r.loc, 10)), period: r.period, transferId: r.transfer_id, wrin: r.wrin, dir: r.dir,
    counterpartyNsn: r.counterparty, dt: r.busn_dt, status: r.status, lineAmt: r.line_amt,
    transferTotal: r.transfer_amt, manager: r.manager, descr: r.descr, cls: r.cls, units: r.units,
    updatedAt: r.updated_at,
  }));
}

// ── EOM Raw-item forensic register (raw_detail) ───────────────────────────────
export async function saveQsrRawItemDetail(rows) {
  if (!supabase || !rows?.length) return { saved: 0, errors: [] };
  const up = rows.map(r => ({
    loc:        String(r.loc),
    period:     String(r.period),
    wrin:       String(r.wrin),
    descr:      r.descr ?? null,
    item_class: r.itemClass ?? r.item_class ?? null,
    history:    Array.isArray(r.history) ? r.history : [],
  })).filter(r => r.wrin);
  return _chunkUpsert('qsr_raw_item_detail', up, 'loc,period,wrin');
}

export async function loadQsrRawItemDetail({ period, loc } = {}) {
  if (!supabase) return [];
  // qsr_raw_item_detail stores the padded NSN format ("0033109"); querying by an unpadded
  // caller-supplied loc would never match, so pad it here (same direction as the padStart
  // pattern elsewhere) — this is the QUERY side. The RETURN side needs the opposite: this
  // loader never stripped the padding on the way OUT, unlike every other loader (loadQsrActSummary,
  // _loadOpsTable, loadLifeLenzSchedule), so any consumer grouping by String(r.loc) against the
  // app's unpadded convention (STORE_NAMES/allLocs/rows) silently fails to match — found 2026-08-05
  // debugging eom-dashboard.js's Weekly Count Cadence showing "no full weekly on record" for
  // stores with real, complete same-day counts already in the table.
  const data = await fetchAll((from, to) => {
    let q = supabase.from('qsr_raw_item_detail').select('*').range(from, to);
    if (period) q = q.eq('period', period);
    if (loc) q = q.eq('loc', String(loc).padStart(7, '0'));
    return q;
  });
  return (data || []).map(r => ({
    loc: String(parseInt(r.loc, 10)), period: r.period, wrin: r.wrin, descr: r.descr, itemClass: r.item_class,
    history: Array.isArray(r.history) ? r.history : [], updatedAt: r.updated_at,
  }));
}

// ── Inventory Summary & Usage ─────────────────────────────────────────────────
export async function saveQsrInventorySummary(rows) {
  if (!supabase || !rows?.length) return { saved: 0, errors: [] };
  const up = rows.map(r => ({
    loc:           String(r.loc),
    period:        String(r.period),
    wrin:          String(r.wrin),
    descr:         r.descr ?? r.desc ?? null,
    cls:           r.cls ?? null,
    uom:           r.uom ?? null,
    case_sz:       r.caseSz ?? null,
    cost:          r.cost ?? null,
    start_inv:     r.startInv ?? null,
    purchases:     r.purchases ?? null,
    end_inv:       r.endInv ?? null,
    actual_usage:  r.actualUsage ?? null,
    usage_per_day: r.usagePerDay ?? null,
    days_supply:   r.daysSupply ?? null,
    rng:           r.range ?? r.rng ?? null,
  }));
  return _chunkUpsert('qsr_inventory_summary', up, 'loc,period,wrin');
}

export async function loadQsrInventorySummary({ period } = {}) {
  if (!supabase) return [];
  const data = await fetchAll((from, to) => {
    let q = supabase.from('qsr_inventory_summary').select('*').range(from, to);
    if (period) q = q.eq('period', period);
    return q;
  });
  return (data || []).map(r => ({
    loc: r.loc, period: r.period, wrin: r.wrin, descr: r.descr, cls: r.cls,
    uom: r.uom, caseSz: r.case_sz, cost: r.cost, startInv: r.start_inv,
    purchases: r.purchases, endInv: r.end_inv, actualUsage: r.actual_usage,
    usagePerDay: r.usage_per_day, daysSupply: r.days_supply, range: r.rng, updatedAt: r.updated_at,
  }));
}

// ── Per-store EOM status (dashboard + notification + comms verification) ───────
export async function saveEomCountStatus(rows) {
  if (!supabase || !rows?.length) return { saved: 0, errors: [] };
  const up = rows.map(r => ({
    loc:              String(r.loc),
    period:           String(r.period),
    items_total:      r.itemsTotal ?? null,
    items_counted:    r.itemsCounted ?? null,
    pct_counted:      r.pctCounted ?? null,
    food_done:        r.foodDone ?? false,
    condiment_done:   r.condimentDone ?? false,
    paper_done:       r.paperDone ?? false,
    nonproduct_done:  r.nonproductDone ?? false,
    last_activity_at: r.lastActivityAt instanceof Date ? r.lastActivityAt.toISOString() : (r.lastActivityAt ?? null),
    notified_90:      r.notified90 ?? false,
    notified_at:      r.notifiedAt instanceof Date ? r.notifiedAt.toISOString() : (r.notifiedAt ?? null),
    diagnosis_status: r.diagnosisStatus ?? 'pending',
    comms_status:     r.commsStatus ?? 'none',
    comms_recipient:  r.commsRecipient ?? null,
    comms_sent_at:    r.commsSentAt instanceof Date ? r.commsSentAt.toISOString() : (r.commsSentAt ?? null),
    comms_note:       r.commsNote ?? null,
    fob_pct:          r.fobPct ?? null,
    total_fc_pct:     r.totalFcPct ?? null,
    updated_at:       new Date().toISOString(),
  }));
  return _chunkUpsert('eom_count_status', up, 'loc,period');
}

export async function loadEomCountStatus({ period } = {}) {
  if (!supabase) return [];
  const data = await fetchAll((from, to) => {
    let q = supabase.from('eom_count_status').select('*').range(from, to);
    if (period) q = q.eq('period', period);
    return q;
  });
  return (data || []).map(r => ({
    loc: String(parseInt(r.loc, 10)), period: r.period, itemsTotal: r.items_total, itemsCounted: r.items_counted,
    pctCounted: r.pct_counted, foodDone: r.food_done, condimentDone: r.condiment_done,
    paperDone: r.paper_done, nonproductDone: r.nonproduct_done, lastActivityAt: r.last_activity_at,
    notified90: r.notified_90, notifiedAt: r.notified_at, diagnosisStatus: r.diagnosis_status,
    commsStatus: r.comms_status, commsRecipient: r.comms_recipient, commsSentAt: r.comms_sent_at,
    commsNote: r.comms_note, fobPct: r.fob_pct, totalFcPct: r.total_fc_pct, updatedAt: r.updated_at,
  }));
}

// ── EOM snapshots (baseline lock + day-2 change monitor) ─────────────────────────
// A point-in-time LOCK of a store's full EOM state: FOB + all 6 components, per-item count qty /
// on-hand $ / variance / last-counted, and per-class completion. Written after ~4am (auto cron) and
// on demand ("Lock baseline"); tomorrow we diff the live pull against the latest baseline to see
// which moves helped (variance toward $0 / FOB down) or hurt. APPEND-ONLY — we keep every checkpoint
// (owner: "err on saving too much"). One row per (loc, snapshot).
export async function saveEomSnapshots(rows) {
  if (!supabase || !rows?.length) return { saved: 0, errors: [] };
  const uid = (await supabase.auth.getUser())?.data?.user?.id || null;
  const up = rows.map(r => ({
    loc: String(r.loc), period: String(r.period),
    kind: r.kind || 'baseline', label: r.label ?? null,
    taken_at: r.takenAt instanceof Date ? r.takenAt.toISOString() : (r.takenAt || new Date().toISOString()),
    taken_by: r.takenBy ?? uid,
    fob: r.fob ?? null, count: r.count ?? null, items: r.items ?? null, meta: r.meta ?? null,
  }));
  const errors = []; let saved = 0;
  for (let i = 0; i < up.length; i += 150) {
    const chunk = up.slice(i, i + 150);
    const { error } = await supabase.from('eom_snapshots').insert(chunk);
    if (error) errors.push(error.message); else saved += chunk.length;
  }
  return { saved, errors };
}

// Load snapshots for a period. `latestPerLoc` collapses to the newest snapshot per store (the active
// baseline to diff against). `kind`/`loc` narrow further. Ordered newest-first.
export async function loadEomSnapshots({ period, kind, loc, latestPerLoc } = {}) {
  if (!supabase) return [];
  const data = await fetchAll((from, to) => {
    let q = supabase.from('eom_snapshots').select('*').order('taken_at', { ascending: false }).range(from, to);
    if (period) q = q.eq('period', period);
    if (kind) q = q.eq('kind', kind);
    if (loc) q = q.eq('loc', String(loc));
    return q;
  });
  let out = (data || []).map(r => ({
    id: r.id, loc: r.loc, period: r.period, kind: r.kind, label: r.label,
    takenAt: r.taken_at, takenBy: r.taken_by, fob: r.fob, count: r.count, items: r.items, meta: r.meta,
  }));
  if (latestPerLoc) {
    const seen = new Map();
    for (const s of out) { const k = String(s.loc); if (!seen.has(k)) seen.set(k, s); } // already desc by taken_at
    out = [...seen.values()];
  }
  return out;
}

// ── Org calendar events (Notes 46) — cloud-first replacement for the localStorage mf_events ──────
// Row shape mirrors src/engine/events-import.js output. Returns app-shaped event objects.
export async function loadOrgEvents() {
  if (!supabase) return [];
  const data = await fetchAll((from, to) => supabase.from('org_events').select('*').order('date_start').range(from, to), 1000, 'org_events');
  return (data || []).map(r => ({
    id: r.id, loc: String(r.loc), dateStart: r.date_start, dateEnd: r.date_end, span: !!r.span,
    category: r.category, type: r.event_type, label: r.label,
    impact: { magnitude: r.impact_magnitude, daypart: r.impact_daypart, gameDay: !!r.impact_gameday, raw: r.impact_raw },
    opponent: r.opponent ?? null, kickoff: r.kickoff ?? null, status: r.status ?? null,
    expectedSalesDelta: r.expected_sales_delta, expectedGcDelta: r.expected_gc_delta,
    url: r.url, verification: r.verification, note: r.note,
    enteredBy: r.entered_by, enteredAt: r.entered_at, method: r.method,
  }));
}
// Bulk upsert (import). Events keyed by (loc, date_start, label). Chunked to stay under limits.
export async function saveOrgEvents(events, { method = 'bulk upload', enteredBy = null } = {}) {
  if (!supabase || !events?.length) return { saved: 0, errors: [] };
  const nowIso = new Date().toISOString();
  const rows = events.map(e => ({
    loc: String(e.loc), date_start: e.dateStart, date_end: e.dateEnd || e.dateStart, span: !!e.span,
    category: e.category ?? null, event_type: e.type ?? null, label: e.label,
    impact_magnitude: e.impact?.magnitude ?? null, impact_daypart: e.impact?.daypart ?? null,
    impact_gameday: !!e.impact?.gameDay, impact_raw: e.impact?.raw ?? e.impactRaw ?? null,
    opponent: e.opponent ?? null, kickoff: e.kickoff ?? null,
    expected_sales_delta: e.expectedSalesDelta ?? null, expected_gc_delta: e.expectedGcDelta ?? null,
    url: e.url ?? null, verification: e.verification ?? null, note: e.note ?? null,
    entered_by: e.enteredBy ?? enteredBy, entered_at: e.enteredAt ?? nowIso, method: e.method ?? method,
    updated_at: nowIso,
  }));
  // Strip opponent/kickoff if that migration hasn't run yet (schema-org-events-sports.sql) so imports
  // never break; self-heals once the columns exist.
  const stripSports = arr => arr.map(({ opponent, kickoff, ...rest }) => rest);
  let saved = 0; const errors = [];
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    let { error, count } = await supabase.from('org_events').upsert(chunk, { onConflict: 'loc,date_start,label', count: 'exact' });
    if (error && /column .*(opponent|kickoff).* does not exist/i.test(error.message || '')) {
      ({ error, count } = await supabase.from('org_events').upsert(stripSports(chunk), { onConflict: 'loc,date_start,label', count: 'exact' }));
    }
    if (error) errors.push(error.message); else saved += count ?? chunk.length;
  }
  return { saved, errors };
}
export async function deleteOrgEvent(id) {
  if (!supabase || id == null) return { error: 'no-id' };
  const { error } = await supabase.from('org_events').delete().eq('id', id);
  return { error: error?.message || null };
}
// Update a single org_events row by id (in-app editing: time/opponent/impact/status/note changes).
// patch keys are camelCase; mapped to columns here. Only provided keys are written.
export async function updateOrgEvent(id, patch = {}) {
  if (!supabase || id == null) return { error: 'no-id' };
  const M = {
    label: 'label', note: 'note', url: 'url', status: 'status',
    opponent: 'opponent', kickoff: 'kickoff',
    dateStart: 'date_start', dateEnd: 'date_end',
    expectedSalesDelta: 'expected_sales_delta', expectedGcDelta: 'expected_gc_delta',
    impactMagnitude: 'impact_magnitude', impactDaypart: 'impact_daypart', impactGameday: 'impact_gameday',
  };
  const row = { updated_at: new Date().toISOString() };
  for (const [k, col] of Object.entries(M)) if (k in patch) row[col] = patch[k];
  let { error } = await supabase.from('org_events').update(row).eq('id', id);
  // Self-heal if the status column isn't migrated yet (schema-org-events-status.sql).
  if (error && /column .*status.* does not exist/i.test(error.message || '') && 'status' in row) {
    const { status, ...rest } = row;
    ({ error } = await supabase.from('org_events').update(rest).eq('id', id));
  }
  return { error: error?.message || null };
}
export async function loadOrgSchoolConfig() {
  if (!supabase) return [];
  const data = await fetchAll((from, to) => supabase.from('org_school_config').select('*').range(from, to), 1000, 'org_school_config');
  return (data || []).map(r => ({
    loc: String(r.loc), city: r.city, state: r.state, district: r.district,
    firstDay: r.first_day, lastDay: r.last_day, startTime: r.start_time, stopTime: r.stop_time,
    verification: r.verification, url: r.url,
  }));
}
export async function saveOrgSchoolConfig(configs) {
  if (!supabase || !configs?.length) return { saved: 0, errors: [] };
  const rows = configs.map(c => ({
    loc: String(c.loc), city: c.city ?? null, state: c.state ?? null, district: c.district ?? null,
    first_day: c.firstDay ?? null, last_day: c.lastDay ?? null, start_time: c.startTime ?? null,
    stop_time: c.stopTime ?? null, verification: c.verification ?? null, url: c.url ?? null,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase.from('org_school_config').upsert(rows, { onConflict: 'loc' });
  return { saved: error ? 0 : rows.length, errors: error ? [error.message] : [] };
}

// ── Event Impact Registry (Notes 47 findings home) — per store × event-type measured sales impact ──
export async function loadEventImpact() {
  if (!supabase) return [];
  const data = await fetchAll((from, to) => supabase.from('event_impact').select('*').range(from, to), 1000, 'event_impact');
  return (data || []).map(r => ({
    loc: String(r.loc), eventType: r.event_type,
    homeImpact: r.home_impact, awayImpact: r.away_impact,
    measuredHome: r.measured_home, measuredAway: r.measured_away,
    nHome: r.n_home, nAway: r.n_away, source: r.source, storeType: r.store_type, note: r.note,
    updatedAt: r.updated_at,
  }));
}
export async function saveEventImpact(rows) {
  if (!supabase || !rows?.length) return { saved: 0, errors: [] };
  const uid = (await supabase.auth.getUser())?.data?.user?.id || null;
  const up = rows.map(r => ({
    loc: String(r.loc), event_type: r.eventType || 'sports',
    home_impact: r.homeImpact ?? null, away_impact: r.awayImpact ?? null,
    measured_home: r.measuredHome ?? null, measured_away: r.measuredAway ?? null,
    n_home: r.nHome ?? null, n_away: r.nAway ?? null,
    source: r.source || 'override', store_type: r.storeType ?? null, note: r.note ?? null,
    updated_by: uid, updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase.from('event_impact').upsert(up, { onConflict: 'loc,event_type' });
  return { saved: error ? 0 : up.length, errors: error ? [error.message] : [] };
}

// ── Multi-tenant registry (Track B, read-side scaffolding) ────────────────────
// Additive + fail-soft. These read the tenant tables created by
// schema-multitenant-phase1.sql. They are NOT yet wired into the app — behavior is
// unchanged until a future change routes the store registry through them. Until the
// tables exist, every call returns an empty/null result and the app uses constants.js.
export async function loadTenants() {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase.from('tenants').select('*');
    if (error) return [];
    return (data || []).map(r => ({ id: r.id, name: r.name, shortName: r.short_name, createdAt: r.created_at }));
  } catch { return []; }
}
export async function loadTenantStores(tenantId = null) {
  if (!supabase) return [];
  try {
    let q = supabase.from('tenant_stores').select('*');
    if (tenantId) q = q.eq('tenant_id', tenantId);
    const { data, error } = await q;
    if (error) return [];
    return (data || []).map(r => ({ tenantId: r.tenant_id, loc: String(r.loc), org: r.org }));
  } catch { return []; }
}
// The logged-in user's tenant id (null if the column/tenant isn't set up yet).
export async function loadMyTenantId() {
  if (!supabase) return null;
  try {
    const uid = (await supabase.auth.getUser())?.data?.user?.id || null;
    if (!uid) return null;
    const { data, error } = await supabase.from('profiles').select('tenant_id').eq('id', uid).maybeSingle();
    if (error) return null;
    return data?.tenant_id || null;
  } catch { return null; }
}

// ── Report subscriptions (Notes 49) ──────────────────────────────────────────
// A per-user list of saved report configs (report + scope/grouping + period + panels).
// localStorage is the instant/primary cache; Supabase (report_subscriptions.subs jsonb,
// one row per user) is the cross-device mirror. All Supabase paths fail soft — the
// feature works fully offline/without the table, just device-local.
const REPORT_SUBS_LS = 'mf_report_subs';
function readSubsLS() {
  try { const v = JSON.parse(localStorage.getItem(REPORT_SUBS_LS) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
function writeSubsLS(subs) {
  try { localStorage.setItem(REPORT_SUBS_LS, JSON.stringify(subs || [])); } catch {}
}
export async function loadReportSubs() {
  const local = readSubsLS();
  if (!supabase) return local;
  try {
    const uid = (await supabase.auth.getUser())?.data?.user?.id || null;
    if (!uid) return local;
    const { data, error } = await supabase.from('report_subscriptions').select('subs').eq('user_id', uid).maybeSingle();
    if (error) return local;                       // table missing / RLS — stay local
    const remote = Array.isArray(data?.subs) ? data.subs : null;
    if (remote) { writeSubsLS(remote); return remote; }   // cloud wins when present
    return local;
  } catch { return local; }
}
export async function saveReportSubs(subs) {
  const clean = Array.isArray(subs) ? subs : [];
  writeSubsLS(clean);                              // always persist locally first
  if (!supabase) return { ok: true, cloud: false };
  try {
    const uid = (await supabase.auth.getUser())?.data?.user?.id || null;
    if (!uid) return { ok: true, cloud: false };
    const { error } = await supabase.from('report_subscriptions')
      .upsert({ user_id: uid, subs: clean, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    return { ok: true, cloud: !error };
  } catch { return { ok: true, cloud: false }; }
}

// Per-store secondary-review status (day-2): owner marks a store reviewed/flagged with a note.
export async function saveEomSecondaryReview(row) {
  if (!supabase || !row?.loc) return { error: 'no-op' };
  const uid = (await supabase.auth.getUser())?.data?.user?.id || null;
  const { error } = await supabase.from('eom_secondary_review').upsert({
    loc: String(row.loc), period: String(row.period),
    status: row.status ?? 'reviewed', note: row.note ?? null,
    reviewed_at: new Date().toISOString(), reviewed_by: uid, updated_at: new Date().toISOString(),
  }, { onConflict: 'loc,period' });
  return { error: error?.message || null };
}

export async function loadEomSecondaryReview({ period } = {}) {
  if (!supabase) return {};
  const data = await fetchAll((from, to) => {
    let q = supabase.from('eom_secondary_review').select('*').range(from, to);
    if (period) q = q.eq('period', period);
    return q;
  });
  const m = {};
  for (const r of (data || [])) m[String(r.loc)] = { status: r.status, note: r.note, reviewedAt: r.reviewed_at };
  return m;
}

// ── EOM share links (Phase 1: opaque, scoped, read-only, no-login access) ──
export async function createEomShareLink({ loc, period, storeName, title, fob, recapMd, fullMd, expiresDays = 14 } = {}) {
  if (!supabase) return { error: 'no-db' };
  const uid = (await supabase.auth.getUser())?.data?.user?.id || null;
  const expires_at = new Date(Date.now() + expiresDays * 86400000).toISOString();
  const { data, error } = await supabase.from('eom_share_links').insert({
    loc: String(loc), period: String(period), store_name: storeName ?? null, title: title ?? null,
    fob: fob ?? null, recap_md: recapMd ?? null, full_md: fullMd ?? null, created_by: uid, expires_at,
  }).select('token').single();
  return { token: data?.token || null, error: error?.message || null };
}
export async function loadEomShareLinks({ period } = {}) {
  if (!supabase) return [];
  const data = await fetchAll((from, to) => {
    let q = supabase.from('eom_share_links').select('token,loc,period,store_name,created_at,expires_at,revoked,view_count,last_viewed_at,acknowledged_at').order('created_at', { ascending: false }).range(from, to);
    if (period) q = q.eq('period', period);
    return q;
  });
  return (data || []).map(r => ({ token: r.token, loc: r.loc, period: r.period, storeName: r.store_name, createdAt: r.created_at, expiresAt: r.expires_at, revoked: r.revoked, viewCount: r.view_count, lastViewedAt: r.last_viewed_at, acknowledgedAt: r.acknowledged_at }));
}
export async function revokeEomShareLink(token, revoked = true) {
  if (!supabase || !token) return { error: 'no-op' };
  const { error } = await supabase.from('eom_share_links').update({ revoked }).eq('token', token);
  return { error: error?.message || null };
}
// Public reader — no auth; calls the eom-share edge function (the only public gateway to a link).
async function callShareFn(payload) {
  if (!URL || !KEY) return { error: 'no-db' };
  try {
    const res = await fetch(`${URL}/functions/v1/eom-share`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: `Bearer ${KEY}` },
      body: JSON.stringify(payload),
    });
    return await res.json();
  } catch (e) { return { error: String(e?.message || e) }; }
}
// Pre-computed integrity flags (e.g. implausible recount batches) for the Needs-Attention panel.
export async function loadEomIntegrityFlags({ period } = {}) {
  if (!supabase) return [];
  try {
    const data = await fetchAll((from, to) => {
      let q = supabase.from('eom_integrity_flags').select('*').range(from, to);
      if (period) q = q.eq('period', period);
      return q;
    });
    return (data || []).map(r => ({ loc: r.loc, period: r.period, kind: r.kind, severity: r.severity, title: r.title, detail: r.detail, dollars: r.dollars, meta: r.meta }));
  } catch { return []; }   // table may not exist yet → fail-soft
}

// Count-status history (longitudinal spine): per store/period count timing, counters, exceptions,
// integrity-flag counts, FOB result. For trend analysis + manager accountability + SAGE.
export async function loadEomCountStatusHistory({ loc, period } = {}) {
  if (!supabase) return [];
  try {
    const data = await fetchAll((from, to) => {
      let q = supabase.from('eom_count_status_history').select('*').order('period', { ascending: false }).range(from, to);
      if (loc) q = q.eq('loc', String(loc));
      if (period) q = q.eq('period', period);
      return q;
    });
    return data || [];
  } catch { return []; }   // table may not exist yet → fail-soft
}

export async function fetchSharedEom(token) { return callShareFn({ token }); }
export async function refreshSharedEom(token) { return callShareFn({ token, action: 'refresh' }); }
export async function acknowledgeSharedEom(token, note) { return callShareFn({ token, action: 'acknowledge', note }); }

// ── EOM count-date exceptions (accept an early count as the EOM count; logged + attributed) ──
export async function saveEomCountException(row) {
  if (!supabase || !row?.loc) return { error: 'no-op' };
  const uid = (await supabase.auth.getUser())?.data?.user?.id || null;
  const { error } = await supabase.from('eom_count_exceptions').upsert({
    loc: String(row.loc), period: String(row.period), kind: row.kind || 'early-count-accepted',
    accepted_date: row.acceptedDate ?? null, approved_by: row.approvedBy ?? null, note: row.note ?? null,
    created_at: new Date().toISOString(), created_by: uid,
  }, { onConflict: 'loc,period,kind' });
  return { error: error?.message || null };
}
export async function deleteEomCountException({ loc, period, kind = 'early-count-accepted' } = {}) {
  if (!supabase || !loc) return { error: 'no-op' };
  const { error } = await supabase.from('eom_count_exceptions').delete().eq('loc', String(loc)).eq('period', String(period)).eq('kind', kind);
  return { error: error?.message || null };
}
export async function loadEomCountExceptions({ period } = {}) {
  if (!supabase) return {};
  const data = await fetchAll((from, to) => {
    let q = supabase.from('eom_count_exceptions').select('*').range(from, to);
    if (period) q = q.eq('period', period);
    return q;
  });
  const m = {};
  for (const r of (data || [])) m[String(r.loc)] = { kind: r.kind, acceptedDate: r.accepted_date, approvedBy: r.approved_by, note: r.note, createdAt: r.created_at };
  return m;
}

// ── QSRSoft Knowledge Base (#41) — grounds SAGE + diagnostics in QSRSoft's own methodology ──
export async function loadQsrKb() {
  if (!supabase) return [];
  const data = await fetchAll((from, to) => supabase.from('qsrsoft_kb').select('id,title,body_text,category,section,html_url,updated_at').order('category', { ascending: true }).range(from, to));
  return (data || []).map(r => ({ id: r.id, title: r.title, bodyText: r.body_text, category: r.category, section: r.section, htmlUrl: r.html_url, updatedAt: r.updated_at }));
}

// Keyword search over the KB (title + body). Sanitizes the query for PostgREST's or() filter syntax.
export async function searchQsrKb(query, { limit = 20 } = {}) {
  if (!supabase || !query) return [];
  const q = String(query).replace(/[,%()]/g, ' ').trim();
  if (!q) return [];
  const { data, error } = await supabase.from('qsrsoft_kb')
    .select('id,title,body_text,category,section,html_url')
    .or(`title.ilike.%${q}%,body_text.ilike.%${q}%`).limit(limit);
  if (error) return [];
  return (data || []).map(r => ({ id: r.id, title: r.title, bodyText: r.body_text, category: r.category, section: r.section, htmlUrl: r.html_url }));
}

// ── EOM item disposition (#38) — the verify-&-clear decision per obsolete/inactive item ──
export async function saveEomItemDisposition(rows) {
  if (!supabase || !rows?.length) return { saved: 0, errors: [] };
  const uid = (await supabase.auth.getUser())?.data?.user?.id || null;
  const up = rows.map(r => ({
    loc: String(r.loc), period: String(r.period), wrin: String(r.wrin),
    disposition: r.disposition ?? null, cls: r.cls ?? null, descr: r.descr ?? null,
    on_hand_amt: r.onHandAmt ?? r.on_hand_amt ?? null, note: r.note ?? null,
    decided_at: new Date().toISOString(), decided_by: uid,
  }));
  const { error } = await supabase.from('eom_item_disposition').upsert(up, { onConflict: 'loc,period,wrin' });
  if (error) { console.warn('[eom_item_disposition] save error:', error.message); return { saved: 0, errors: [error.message] }; }
  return { saved: up.length, errors: [] };
}
export async function loadEomItemDisposition({ period, loc } = {}) {
  if (!supabase) return [];
  try {
    const data = await fetchAll((from, to) => {
      let q = supabase.from('eom_item_disposition').select('*').range(from, to);
      if (period) q = q.eq('period', period);
      if (loc) q = q.eq('loc', String(loc));
      return q;
    });
    return (data || []).map(r => ({
      loc: r.loc, period: r.period, wrin: r.wrin, disposition: r.disposition, cls: r.cls,
      descr: r.descr, onHandAmt: r.on_hand_amt, note: r.note, decidedAt: r.decided_at,
    }));
  } catch (e) { console.warn('[eom_item_disposition] load skipped:', e?.message || e); return []; }
}

// ── EOM notification settings (flexible jsonb) ─────────────────────────────────
export async function loadEomNotificationSettings(key = 'default') {
  if (!supabase) return null;
  const { data, error } = await supabase.from('eom_notification_settings').select('*').eq('key', key).maybeSingle();
  if (error) { console.warn('[eom_notification_settings] load error:', error.message); return null; }
  return data ? { key: data.key, settings: data.settings || {}, updatedAt: data.updated_at } : null;
}

export async function saveEomNotificationSettings(settings, key = 'default') {
  if (!supabase) return { saved: 0, errors: ['no supabase'] };
  const { error } = await supabase.from('eom_notification_settings')
    .upsert({ key, settings: settings || {}, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) { console.warn('[eom_notification_settings] save error:', error.message); return { saved: 0, errors: [error.message] }; }
  return { saved: 1, errors: [] };
}

// ── EOM diagnosis flow config (editable check registry) ───────────────────────
// Reuses the eom_notification_settings jsonb table under key 'diag_config' so no
// new table/SQL is needed. settings = { checks: [{id, order, enabled, params}] }.
export async function loadEomDiagConfig() {
  const row = await loadEomNotificationSettings('diag_config');
  return Array.isArray(row?.settings?.checks) ? row.settings.checks : null;
}
export async function saveEomDiagConfig(checks) {
  return saveEomNotificationSettings({ checks: checks || [] }, 'diag_config');
}

// ── Leadership One-Pagers (weekly cascade) ────────────────────────────────────
// one_pagers: the weekly page (scope + narrative). one_pager_action_items: action
// items that persist week-to-week (thread_key stable across weeks) with a status and
// the metric they target (for the "did it move?" follow-up loop). Both RBAC-scoped.
export async function loadOnePagers({ limit = 60 } = {}) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('one_pagers').select('*').order('period', { ascending: false }).limit(limit);
  if (error) { console.warn('[one_pagers] load error:', error.message); return []; }
  return data || [];
}

export async function saveOnePager(row) {
  if (!supabase) return null;
  const uid = (await supabase.auth.getUser())?.data?.user?.id;
  const payload = { ...row, author_id: row.author_id || uid, updated_at: new Date().toISOString() };
  // upsert on (level, scope_key, period) so re-saving a week overwrites in place
  const { data, error } = await supabase
    .from('one_pagers').upsert(payload, { onConflict: 'level,scope_key,period' }).select().single();
  if (error) { console.warn('[one_pagers] save error:', error.message); return null; }
  return data;
}

export async function loadActionItems({ scopeKey, includeResolved = true } = {}) {
  if (!supabase) return [];
  let q = supabase.from('one_pager_action_items').select('*').order('created_at', { ascending: true });
  if (scopeKey) q = q.eq('scope_key', scopeKey);
  if (!includeResolved) q = q.neq('status', 'done');
  const { data, error } = await q;
  if (error) { console.warn('[action_items] load error:', error.message); return []; }
  return data || [];
}

export async function saveActionItem(item) {
  if (!supabase) return null;
  const uid = (await supabase.auth.getUser())?.data?.user?.id;
  const payload = { ...item, author_id: item.author_id || uid, updated_at: new Date().toISOString() };
  const { data, error } = await supabase
    .from('one_pager_action_items').upsert(payload).select().single();
  if (error) { console.warn('[action_items] save error:', error.message); return null; }
  return data;
}

export async function updateActionItem(id, updates) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('one_pager_action_items').update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id).select().single();
  if (error) { console.warn('[action_items] update error:', error.message); return null; }
  return data;
}
