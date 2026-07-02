// @ts-nocheck
import { createClient } from '@supabase/supabase-js';

const URL  = import.meta.env.VITE_SUPABASE_URL;
const KEY  = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!URL || !KEY) {
  console.info('Meridian: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set — running in local-only mode');
}

// supabase is null in local-only mode; all callers must guard with `if (supabase)`
export const supabase = (URL && KEY) ? createClient(URL, KEY) : null;

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
  if (error) { console.warn('[monthly_targets] save error:', error); return { saved: 0, errors: [error.message] }; }
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
export async function loadLifeLenzSchedule({ daysBack = 90, daysFwd = 30 } = {}) {
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

// ── Microsoft / Azure AD migration note ───────────────────────────────────────
// To switch auth to Microsoft Entra ID (M365 SSO) later:
//   1. In Supabase dashboard → Auth → Providers → Azure → enable + paste tenant/client
//   2. Replace signInWithOtp below with:
//        supabase.auth.signInWithOAuth({ provider: 'azure' })
//   3. Or: swap Supabase Auth entirely for MSAL.js and keep Supabase as the database.
//      In that case, pass the MSAL access token to Supabase via
//        supabase.auth.setSession({ access_token: msalToken })
//   The database schema and RLS policies do not change in either path.
