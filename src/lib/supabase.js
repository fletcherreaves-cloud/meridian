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
async function fetchAll(builderFn, pageSize = 1000) {
  let all = [], from = 0;
  while (true) {
    const { data, error } = await builderFn(from, from + pageSize - 1);
    if (error || !data?.length) break;
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
    osat_avg:        r.osatAvg      ?? null,
    osat_b2b:        r.osatB2B      ?? null,
    accuracy_b2b:    r.accuracyB2B  ?? null,
    dt_problem:      r.dtProblem    ?? null,
    overall_problem: r.overallProblem ?? null,
    updated_by:      uid || null,
  }));
  const { error } = await supabase.from('smg_fullscale').upsert(upsert, { onConflict: 'loc,year,month' });
  if (error) { console.warn('[smg_fullscale] save error:', error); return { saved: 0, errors: [error.message] }; }
  console.log(`[smg_fullscale] saved ${upsert.length} store records`);
  return { saved: upsert.length, errors: [] };
}

export async function loadSmgFullscale({ year, month } = {}) {
  if (!supabase) return [];
  let q = supabase.from('smg_fullscale').select('*').order('year', {ascending:false}).order('month', {ascending:false});
  if (year)  q = q.eq('year',  year);
  if (month) q = q.eq('month', month);
  const { data, error } = await q;
  if (error || !data) { console.warn('[smg_fullscale] load error:', error); return []; }
  // Normalize back to camelCase
  return data.map(r => ({
    loc:            r.loc,
    year:           r.year,
    month:          r.month,
    reportStart:    r.report_start,
    reportEnd:      r.report_end,
    osatTop2:       r.osat_top2,
    osat5:          r.osat_5,
    osatAvg:        r.osat_avg,
    osatB2B:        r.osat_b2b,
    accuracyB2B:    r.accuracy_b2b,
    dtProblem:      r.dt_problem,
    overallProblem: r.overall_problem,
  }));
}

// ── SMG VOICE Performance persistence ────────────────────────────────────────
// rows: array of { period, report_type, operator_id, operator_name, loc, loc_name,
//                  dt_sat, dt_dissat, ir_sat, ir_dissat, accuracy_b2b, quality_b2b,
//                  fries_b2b, snack_wrap_b2b, source_file }
export async function saveVoicePerf(rows) {
  if (!supabase || !rows.length) return { saved: 0, errors: [] };
  const upsert = rows
    .filter(r => r.period && r.report_type && r.operator_id && r.loc)
    .map(r => ({
      period:          r.period,
      report_type:     r.report_type,
      operator_id:     r.operator_id,
      operator_name:   r.operator_name || null,
      loc:             String(r.loc),
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
    }));
  if (!upsert.length) return { saved: 0, errors: [] };
  const { error } = await supabase
    .from('smg_voice_performance')
    .upsert(upsert, { onConflict: 'period,report_type,operator_id,loc' });
  if (error) { console.warn('[voice_perf] save error:', error); return { saved: 0, errors: [error.message] }; }
  console.log(`[voice_perf] saved ${upsert.length} rows`);
  return { saved: upsert.length, errors: [] };
}

export async function loadVoicePerf() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('smg_voice_performance')
    .select('*')
    .order('period', { ascending: false });
  if (error || !data) { console.warn('[voice_perf] load error:', error); return []; }
  return data;
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
export async function loadLifeLenzSchedule({ daysBack = 1825, daysFwd = 30 } = {}) {
  if (!supabase) return [];
  const from = new Date(); from.setDate(from.getDate() - daysBack);
  const to   = new Date(); to.setDate(to.getDate() + daysFwd);
  const fmt  = d => d.toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('lifelenz_schedule')
    .select('*')
    .gte('date', fmt(from))
    .lte('date', fmt(to))
    .order('date', { ascending: false });
  if (error || !data) { console.warn('[lifelenz_schedule] load error:', error); return []; }
  return data.map(r => ({
    loc:           r.loc,
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
export async function loadLaborRows() {
  if (!supabase) return [];
  const data = await fetchAll((from, to) => supabase
    .from('labor_rows').select('*')
    .order('report_date', { ascending: true })
    .range(from, to));
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

export async function loadPeaksRows() {
  if (!supabase) return [];
  const data = await fetchAll((from, to) => supabase
    .from('peaks_rows').select('*')
    .order('date', { ascending: false })
    .range(from, to));
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

export async function loadAuditRows() {
  if (!supabase) return [];
  const data = await fetchAll((from, to) => supabase
    .from('audit_rows').select('*')
    .order('date', { ascending: false })
    .range(from, to));
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
export async function loadQsrFob({ dates } = {}) {
  if (!supabase) return [];
  const data = await fetchAll((from, to) => {
    let q = supabase.from('qsr_fob').select('*').order('date', { ascending: false }).range(from, to);
    if (dates?.length) q = q.in('date', dates);
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

export async function loadOpsRows() {
  if (!supabase) return [];
  const data = await fetchAll((from, to) => supabase
    .from('ops_rows').select('*')
    .order('date', { ascending: false })
    .range(from, to));
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

export async function loadCtrlRows() {
  if (!supabase) return [];
  const data = await fetchAll((from, to) => supabase
    .from('ctrl_rows').select('*')
    .order('date', { ascending: false })
    .range(from, to));
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
    .select('loc,dt,hour_slot,product_sales,mean_sales,dt_untilserve,dt_trans_cnt,actual_punched_hours,total_needed_hours,total_scheduled_hours,healthy_count,unhealthy_count,proj_sales_dollars')
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
  const { data, error } = await supabase
    .from('qsr_daily_activity')
    .select('loc,dt,hour_slot,product_sales,mean_sales,dt_untilserve,dt_trans_cnt,actual_punched_hours,total_needed_hours,healthy_count,unhealthy_count')
    .gte('dt', startDate)
    .lte('dt', endDate)
    .order('dt')
    .order('loc')
    .order('hour_slot');
  if (error) { console.error('loadDailyActivityRange:', error); return []; }
  return data || [];
}

// ── Speed-of-Service history (all stations) ──────────────────────────────────
// Includes per-station until-serve + transaction counts so the panel can show
// where the bottleneck is (DT window vs front counter vs kitchen make-line vs
// beverage), not just the drive-thru. Values are milliseconds; avg = Σuntilserve
// / Σtrans / 1000 seconds. Filtered to hours with drive-thru activity.
export async function loadDtHistory(days = 90) {
  if (!supabase) return [];
  const startDt = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('qsr_daily_activity')
    .select('loc,dt,hour_slot,dt_untilserve,dt_trans_cnt,fc_untilserve,fc_trans_cnt,mfy1_untilserve,mfy1_trans_cnt,mfy2_untilserve,mfy2_trans_cnt,bev_untilserve,bev_trans_cnt')
    .gte('dt', startDt)
    .gt('dt_trans_cnt', 0)
    .limit(100000);
  if (error) { console.error('loadDtHistory:', error); return []; }
  return data || [];
}

// ── eBOS monthly op supplies by store ────────────────────────────────────────
// Returns { [loc]: totalOps } where loc is the unpadded NSN string, for a given month.
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

// ── QSRSoft daily-activity aggregated summary ─────────────────────────────────
// Returns one row per (loc, date) with sales/GC/DT totals summed across hour slots.
// Used by AtAGlance as a zero-upload fallback when laborRows is empty.
export async function loadQsrActSummary(daysBack = 35) {
  if (!supabase) return [];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysBack);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  // Paginate — qsr_daily_activity has ~675 rows/day, so a single query hits the
  // 1000-row cap and returns only the oldest ~1.5 days. fetchAll pages through all.
  const data = await fetchAll((from, to) => supabase
    .from('qsr_daily_activity')
    .select('loc,dt,product_sales,healthy_count,unhealthy_count,dt_untilserve,dt_trans_cnt,ly_product_sales,ly_transactions,actual_punched_hours,total_needed_hours')
    .gte('dt', cutoffStr)
    .order('dt')
    .range(from, to));
  const map = {};
  for (const r of data || []) {
    const loc = String(parseInt(r.loc, 10)); // strip zero-padding ("0003708" → "3708")
    const key = loc + '_' + r.dt;
    if (!map[key]) map[key] = {
      loc, date: new Date(r.dt + 'T00:00:00'),
      sales: 0, allNetSales: 0, gc: 0,
      _dtTotal: 0, _dtCars: 0,
      lySales: 0, lyGc: 0,
      actHrs: 0, needHrs: 0,
      _isQsrAct: true,
    };
    map[key].sales        += r.product_sales   || 0;
    map[key].allNetSales  += r.product_sales   || 0;
    map[key].gc           += (r.healthy_count  || 0) + (r.unhealthy_count || 0);
    map[key]._dtTotal     += r.dt_untilserve   || 0;
    map[key]._dtCars      += r.dt_trans_cnt    || 0;
    map[key].lySales      += r.ly_product_sales || 0;
    map[key].lyGc         += r.ly_transactions || 0;
    // Actual punched + needed labor hours summed across the day's hour slots —
    // the auto-pulled DAR labor totals (cloud-fresh on every device).
    map[key].actHrs       += r.actual_punched_hours || 0;
    map[key].needHrs      += r.total_needed_hours   || 0;
  }
  return Object.values(map).map(r => ({
    ...r,
    salesVsLYPct: r.lySales > 0 ? (r.sales - r.lySales) / r.lySales * 100 : null,
    // Derive a QSR labor % from the day's product sales when an average crew rate
    // is unavailable here — left null; Daily Glimpse laborPct is the primary %.
  }));
}

// ── Cloud-first emailed-report loaders ────────────────────────────────────────
// Load the server-parsed QSRSoft email reports from Supabase and return them in
// the SAME camelCase shape the client parsers produce, so existing consumers
// (delivery-mix, morning-brief, At A Glance) work unchanged — but cross-device
// fresh instead of device-local IDB. All fail soft to [] (e.g. table not yet
// created), preserving the prior IDB behavior.
const _mkDate = (dt) => new Date(dt + 'T00:00:00');

export async function loadGlimpse(daysBack = 45) {
  if (!supabase) return [];
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - daysBack);
  const { data, error } = await supabase.from('daily_glimpse_daily')
    .select('*').gte('date', cutoff.toISOString().slice(0, 10)).order('date');
  if (error) { console.warn('loadGlimpse:', error.message); return []; }
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
  const { data, error } = await supabase.from('cash_sheet_daily')
    .select('*').gte('date', cutoff.toISOString().slice(0, 10)).order('date');
  if (error) { console.warn('loadCash:', error.message); return []; }
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
  const { data, error } = await supabase.from('sales_ledger_daily')
    .select('*').gte('date', cutoff.toISOString().slice(0, 10)).order('date');
  if (error) { console.warn('loadSalesLedger:', error.message); return []; }
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
  const { data, error } = await supabase.from('user_settings')
    .select('value').eq('user_id', user.id).eq('key', key).single();
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
  const upsert = rows.filter(r => r.store && r.dateISO).map(r => ({
    report_type: r.reportType || 'CFV',
    loc:         String(r.store),
    visit_date:  r.dateISO,
    daypart:     r.daypart  ?? null,
    weekpart:    r.weekpart ?? null,
    owner:       r.owner    ?? null,
    manager:     r.manager  ?? null,
    visit_by:    r.visitBy  ?? null,
    score:       r.score    ?? null,
    pass:        r.pass     ?? null,
    channel:     r.channel  ?? null,
    mobile_app:  r.mobileApp ?? null,
    status:      r.status   ?? null,
    modules:     r.modules  ?? null,
    raw_title:   r.title    ?? null,
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
    modules: r.modules || {}, title: r.raw_title,
  }));
}
