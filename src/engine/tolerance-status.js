// @ts-nocheck
// ── Tolerance status — single source of truth for the 24-metric tol-based KPI comparison ──
//
// Dispatch #94 Phase 1 replaced UnifiedTargetsPanel's (src/views/store-dash.js) old uniform
// 5%/15%-relative-to-target color band with an absolute per-metric `tol` comparison (green if
// |current-official| <= tol, yellow if <= tol*2, red beyond — multiplier picked from real
// district data, see memory/dispatch-94.md Resolution). That logic, and the metric/value
// sourcing it depends on (which metrics have a tol, where "current" and "official target" come
// from), originally lived entirely inline inside UnifiedTargetsPanel's function body.
//
// Phase 2 (district-wide out-of-tolerance rollup, at-a-glance.js's ToleranceRollupTile) and
// Phase 3 (coaching findings, engine/coaching-findings.js) both need the EXACT same comparison
// and the EXACT same "current"/"official" values UnifiedTargetsPanel shows — otherwise a tile
// or a coaching brief could disagree with the KPI table a user just looked at, which is the
// "two panels disagree on one number" bug class CLAUDE.md's Dev Rules calls out by name. So
// this module is that single source of truth: UnifiedTargetsPanel now imports TOL_METRICS /
// TOL_SPEC / tolValuesForLoc / tolMergedTarget / tolStatus from here instead of declaring its
// own copies, and every other consumer does the same.
//
// tolStatus() is the ONLY place the tol*2 yellow-band multiplier is expressed. Do not
// reimplement the comparison elsewhere — import this.

import { DEFAULT_TARGETS } from '../constants.js';
import { businessDate } from '../utils/date.js';
import { robustBaseline } from '../utils/stats.js';

// ── Metric definitions — all 24, verbatim from UnifiedTargetsPanel's former inline METRICS ──
// `offKey` null means the metric has no official-target file field, so it never produces a
// tol status (statusCol/tolStatus both require both `cur` and `off` to be non-null) — it still
// renders in the KPI table's Current column, just without a status color. Only the 15 metrics
// with a real `offKey` participate in tol rollups.
export const TOL_METRICS = [
  // Service
  {id:'oepe',    cat:'svc',   l:'OEPE (seconds)',     offKey:'tOepe',    unit:'s',   lowerBetter:true,  tol:10},
  {id:'park',    cat:'svc',   l:'DT Park %',          offKey:'tPark',    unit:'%',   lowerBetter:true,  tol:.03},
  {id:'kvst',    cat:'svc',   l:'KVS Time (seconds)', offKey:'tKvst',    unit:'s',   lowerBetter:true,  tol:10},
  // Dispatch #77 -- was lowerBetter:false, contradicting every other site including this
  // table's OWN sibling table, whose label literally reads "R2P (lower=better)". See
  // memory/dispatch-77.md.
  {id:'r2p',     cat:'svc',   l:'R2P (seconds)',      offKey:'tR2p',     unit:'s',   lowerBetter:true, tol:5},
  // Labor
  {id:'tpph',    cat:'labor', l:'TPPH',               offKey:'tTpph',    unit:'',    lowerBetter:false, tol:.2},
  {id:'labor',   cat:'labor', l:'Labor %',             offKey:'tLabor',   unit:'%',   lowerBetter:true,  tol:.02},
  {id:'crewlbr', cat:'labor', l:'Crew Labor %',        offKey:'tCrewLabor',unit:'%', lowerBetter:true,  tol:.02},
  {id:'actvsNd', cat:'labor', l:'Act vs Need (hrs)',   offKey:null,       unit:'hr',  lowerBetter:false, tol:2},
  // FOB
  // Dispatch #115: offKey was tFOBBase, but the cloud-side current value (totalBaseFood,
  // ~21-24% of sales -- QSRSoft's "Base Food" line on the Food-Over-Base report, a broad
  // theoretical/recipe-costed basis) and tFOBBase (~3.8-4.6% -- the yearly workbook's narrow
  // "Base Food %" variance-tolerance target, paired correctly with the MANUAL fobRows.baseFoodPct
  // side of this same metric) are two differently-scaled quantities that happen to share a label.
  // Live-measured (27 stores, memory/dispatch-115.md Resolution): totalBaseFood/sales +
  // (compWaste+rawWaste+condiment+empMeal+statVar+unexplained)/sales reconstructs P&L Total Food
  // Cost % to within ~0.5pp on every store -- confirming totalBaseFood is the THEORETICAL portion
  // of total food cost, not the narrow variance component tFOBBase names. No existing target field
  // represents that theoretical-base quantity (tFOBTotal is the closest by magnitude but is the
  // P&L ACTUAL total, not the theoretical base -- comparing against it still misses by a uniform
  // ~4-5pp on every store, the same systematic-not-real-signal failure mode). offKey:null per this
  // file's own established convention (see actvsNd/disc/cashOS/etc. above) -- renders the current
  // value with no false status color, rather than compared against a definitionally wrong number.
  {id:'baseFd',  cat:'fob',   l:'Base Food %',           offKey:null,  unit:'%',  lowerBetter:true,  tol:.005},
  {id:'fob',     cat:'fob',   l:'FOB (Over Base) %',     offKey:'tFOBTarget',unit:'%',  lowerBetter:true,  tol:.01},
  {id:'fobTot',  cat:'fob',   l:'Total Food Cost %',     offKey:'tFOBTotal', unit:'%',  lowerBetter:true,  tol:.005},
  {id:'compW',   cat:'fob',   l:'Comp Waste %',          offKey:'tCompWaste',unit:'%',  lowerBetter:true,  tol:.001},
  {id:'rawW',    cat:'fob',   l:'Raw Waste %',            offKey:'tRawWaste', unit:'%',  lowerBetter:true,  tol:.002},
  {id:'cond',    cat:'fob',   l:'Condiment %',            offKey:'tCondiment',unit:'%',  lowerBetter:true,  tol:.005},
  {id:'empMl',   cat:'fob',   l:'Emp Meal %',             offKey:'tEmpFood',  unit:'%',  lowerBetter:true,  tol:.002},
  {id:'statV',   cat:'fob',   l:'Stat Var %',             offKey:'tStatLoss', unit:'%',  lowerBetter:true,  tol:.005},
  {id:'disc',    cat:'fob',   l:'Disc/Coupon %',          offKey:null,        unit:'%',  lowerBetter:true,  tol:.01},
  // POS Controls
  {id:'cashOS',  cat:'pos',   l:'Cash O/S %',            offKey:null,       unit:'%',   lowerBetter:true,  tol:.01},
  {id:'tRedB',   cat:'pos',   l:'T-Red Before %',        offKey:null,       unit:'%',   lowerBetter:true,  tol:.01},
  {id:'tRedA',   cat:'pos',   l:'T-Red After %',         offKey:null,       unit:'%',   lowerBetter:true,  tol:.01},
  {id:'discP',   cat:'pos',   l:'Discount %',            offKey:null,       unit:'%',   lowerBetter:true,  tol:.02},
  // Sales
  {id:'gc',      cat:'sales', l:'STW Guest Count',       offKey:null,       unit:'',    lowerBetter:false, tol:50},
  {id:'avgChk',  cat:'sales', l:'Avg Check ($)',          offKey:null,       unit:'$',   lowerBetter:false, tol:.25},
  {id:'sales',   cat:'sales', l:'Daily Sales ($)',        offKey:null,       unit:'$',   lowerBetter:false, tol:500},
];

// Every TOL_METRIC with a real official-target field AND a declared tol — the set that can
// actually produce a tol status. Phase 2/3 consumers should iterate this, not TOL_METRICS.
export const TOL_ROLLUP_METRICS = TOL_METRICS.filter(m => m.offKey && m.tol != null);

// ── Source map (auto/emailed-first, freshest-wins) — verbatim from UnifiedTargetsPanel's
// former inline SPEC. Each metric points at its CORRECT source; manual rows are primary,
// cloud streams fill any loc/date with no manual upload. FOB uses qsr_fob $-amounts so
// district roll-ups can be dollar-weighted exactly (Σ$/Σprodsales), never a mean of %s.
export const TOL_SPEC = {
  oepe:   {man:{src:'opsRows',f:'oepe'},        cloud:{src:'glimpseRows',f:'oepe'}},
  park:   {man:{src:'opsRows',f:'park'},        cloud:{src:'glimpseRows',f:'parkedPct'}},
  kvst:   {man:{src:'opsRows',f:'kvst'},        cloud:{src:'glimpseRows',f:'kvst'}},
  r2p:    {man:{src:'opsRows',f:'r2p'}},
  tpph:   {man:{src:'ctrlRows',f:'tpph'}, man2:{src:'laborRows',f:'tpph'}, cloud:{src:'qsrActSummaryRows',fn:r=>r.actHrs>0?r.gc/r.actHrs:null}},
  labor:  {man:{src:'ctrlRows',f:'laborPct'}, man2:{src:'laborRows',f:'laborPct'}, cloud:{src:'glimpseRows',f:'laborPct'}},
  crewlbr:{man:{src:'laborRows',f:'crewLaborPct'}},
  actvsNd:{man:{src:'laborRows',f:'actVsNeed'}, cloud:{src:'qsrActSummaryRows',fn:r=>(r.actHrs!=null&&r.needHrs!=null)?r.actHrs-r.needHrs:null}, keepZero:true, signed:true},
  baseFd: {man:{src:'fobRows',f:'baseFoodPct'}, fob:{num:'totalBaseFood'}},
  fob:    {man:{src:'fobRows',f:'fobPct'},      fob:{fobSum:true}},
  fobTot: {man:{src:'fobRows',f:'pLFoodPct'},   fob:{pnl:true}},
  compW:  {man:{src:'fobRows',f:'compWaste'},   fob:{num:'compWasteAmt'}},
  rawW:   {man:{src:'fobRows',f:'rawWaste'},    fob:{num:'rawWasteAmt'}},
  cond:   {man:{src:'fobRows',f:'condiment'},   fob:{num:'condimentsAmt'}},
  empMl:  {man:{src:'fobRows',f:'empMeal'},     fob:{num:'empMgrMealsAmt'}},
  statV:  {man:{src:'fobRows',f:'statVar'},     fob:{num:'statVarianceAmt'}},
  disc:   {man:{src:'fobRows',f:'discCoupon'},  fob:{num:'discountCouponsAmt'}},
  cashOS: {man:{src:'ctrlRows',f:'cashOSPct'},  cloud:{src:'glimpseRows',f:'cashOSPct'}, signed:true},
  tRedB:  {man:{src:'ctrlRows',f:'tRedBPct'}},
  tRedA:  {man:{src:'ctrlRows',f:'tRedAPct'}},
  discP:  {man:{src:'ctrlRows',f:'discPct'}},
  gc:     {man:{src:'laborRows',f:'gc'},        cloud:{src:'qsrActSummaryRows',f:'gc'}},
  avgChk: {man:{src:'laborRows',f:'avgCheck'},  cloud:{src:'qsrActSummaryRows',fn:r=>r.gc>0?r.sales/r.gc:null}},
  sales:  {man:{src:'laborRows',f:'sales'},     cloud:{src:'qsrActSummaryRows',f:'sales'}},
};

// Excludes the still-open business day (businessDate(), 4am ABC cutover) so a partial today
// doesn't dilute a trailing baseline — same fix already applied to the Biggest Miss table and
// the swing alarm.
const _openDayMs = () => new Date(businessDate() + 'T00:00:00').getTime();
const _inRangeMs = (r, ms, openMs) => { const d = r.date instanceof Date ? r.date : new Date(r.date); const t = d && !isNaN(d) ? d.getTime() : NaN; return !isNaN(t) && t >= ms && t < openMs; };
const _keep = (v, spec) => typeof v === 'number' && !isNaN(v) && (spec.keepZero || v !== 0);

// qsr_fob is MTD-cumulative → collapse to one value per (loc,month): the final (max-date) row
// = that month's actual. Returns [{val, num, den, date}].
function _fobMonthly(ds, loc, sinceMs, spec) {
  const openMs = _openDayMs();
  const byMon = {};
  for (const r of (ds.qsrFobRows || [])) {
    if (String(parseInt(r.loc, 10)) !== String(loc) || !_inRangeMs(r, sinceMs, openMs)) continue;
    const d = r.date instanceof Date ? r.date : new Date(String(r.date).slice(0,10) + 'T00:00:00');
    const key = d.getFullYear() + '-' + d.getMonth();
    if (!byMon[key] || d > byMon[key]._d) byMon[key] = { ...r, _d: d };
  }
  const out = [];
  for (const r of Object.values(byMon)) {
    const den = r.prodSalesAmt || 0; if (den <= 0) continue;
    let num;
    if (spec.fob.num) num = r[spec.fob.num] || 0;
    else if (spec.fob.fobSum) num = (r.rawWasteAmt||0)+(r.compWasteAmt||0)+(r.condimentsAmt||0)+(r.empMgrMealsAmt||0)+(r.statVarianceAmt||0)+(r.unexplainedAmt||0);
    else if (spec.fob.pnl) num = (r.pnlFoodCostBegin||0)+(r.pnlFoodCostPurchases||0)+(r.pnlFoodCostAdjustments||0)+(r.pnlFoodCostTransfers||0)-(r.pnlFoodCostPromotions||0)-(r.pnlFoodCostEnd||0);
    else continue;
    out.push({ val: num / den, num, den, date: r._d });
  }
  return out;
}

// Exposed for callers (e.g. UnifiedTargetsPanel's dollar-weighted district FOB rollup) that
// need the raw {val,num,den,date} pairs, not just the resolved value list tolValuesForLoc
// returns.
export function tolFobMonthly(ds, loc, sinceMs, spec) { return _fobMonthly(ds, loc, sinceMs, spec); }

// Cloud-first daily value series for a metric+store since `sinceMs`.
export function tolValuesForLoc(ds, metricId, loc, sinceMs) {
  const spec = TOL_SPEC[metricId]; if (!spec || !ds) return [];
  const openMs = _openDayMs();
  // FOB metrics: manual fobRows.f first, else qsr_fob monthly actuals.
  if (spec.fob) {
    const man = (ds.fobRows || []).filter(r => String(r.loc) === String(loc) && _inRangeMs(r, sinceMs, openMs))
      .map(r => r[spec.man.f]).filter(v => _keep(v, spec));
    if (man.length) return man;
    return _fobMonthly(ds, loc, sinceMs, spec).map(p => p.val).filter(v => _keep(v, spec));
  }
  // Manual (+ optional secondary manual) primary
  for (const key of ['man', 'man2']) {
    const s = spec[key]; if (!s) continue;
    const vals = (ds[s.src] || []).filter(r => String(r.loc) === String(loc) && _inRangeMs(r, sinceMs, openMs))
      .map(r => (s.fn ? s.fn(r) : r[s.f])).filter(v => _keep(v, spec));
    if (vals.length) return vals;
  }
  // Cloud fallback
  if (spec.cloud) {
    const s = spec.cloud;
    const matchLoc = s.src === 'qsrFobRows' ? (r => String(parseInt(r.loc,10)) === String(loc)) : (r => String(r.loc) === String(loc));
    return (ds[s.src] || []).filter(r => matchLoc(r) && _inRangeMs(r, sinceMs, openMs))
      .map(r => (s.fn ? s.fn(r) : r[s.f])).filter(v => _keep(v, spec));
  }
  return [];
}

// Official targets — yearly (ds.targets) then monthly (ds.monthlyTargets) override
// DEFAULT_TARGETS. Verbatim from UnifiedTargetsPanel's former inline mergedT.
export function tolMergedTarget(ds, loc) {
  return {...(DEFAULT_TARGETS[loc]||{}), ...((ds&&ds.targets&&ds.targets[loc])||{}), ...((ds&&ds.monthlyTargets&&ds.monthlyTargets[loc])||{})};
}

// ── The tol-based threshold comparison (dispatch #94 Phase 1) ─────────────────────────────
// green if |cur-off| <= tol, yellow if <= tol*2, red beyond. Multiplier picked from real
// district data — see memory/dispatch-94.md Resolution (Phase 1). THE single implementation;
// every consumer (UnifiedTargetsPanel's statusCol, the Phase 2 rollup tile, Phase 3 coaching
// findings) calls this rather than re-deriving the math.
export function tolStatus(cur, off, tol) {
  if (cur == null || off == null || tol == null) return null;
  const diff = Math.abs(cur - off);
  if (diff <= tol) return 'green';
  if (diff <= tol * 2) return 'yellow';
  return 'red';
}

export const TOL_STATUS_COLOR = { green: '#10b981', yellow: '#f59e0b', red: '#ef4444' };
export const TOL_STATUS_ICON  = { green: '✓', yellow: '⚠', red: '✗' };

// Last-4-weeks trailing current value for one metric at one store, robust-baselined the same
// way UnifiedTargetsPanel computes its "Current (L4W)" column.
export function tolCurrentValue(ds, metricId, loc, l4wMs) {
  return robustBaseline(tolValuesForLoc(ds, metricId, loc, l4wMs)).value;
}

// Per-store, per-rollup-metric tol status: {metricId, label, cat, unit, cur, off, tol, status}.
// Only includes TOL_ROLLUP_METRICS (has both offKey and tol) and only entries where both a
// current value and an official target actually resolved (status non-null).
export function tolStatusesForStore(ds, loc, { l4wMs } = {}) {
  const sinceMs = l4wMs != null ? l4wMs : Date.now() - 28 * 86400000;
  const off = tolMergedTarget(ds, loc);
  const out = [];
  for (const m of TOL_ROLLUP_METRICS) {
    const offVal = off[m.offKey];
    if (offVal == null) continue;
    const cur = tolCurrentValue(ds, m.id, loc, sinceMs);
    const status = tolStatus(cur, offVal, m.tol);
    if (!status) continue;
    out.push({ metricId: m.id, label: m.l, cat: m.cat, unit: m.unit, cur, off: offVal, tol: m.tol, status });
  }
  return out;
}

// District-wide: { loc: [ ...tolStatusesForStore entries... ] } across every loc in
// DEFAULT_TARGETS (or a caller-supplied subset, e.g. an RBAC-scoped accessible_locs list).
export function tolStatusesDistrict(ds, locs, opts) {
  const allLocs = locs && locs.length ? locs : Object.keys(DEFAULT_TARGETS);
  const out = {};
  for (const loc of allLocs) out[loc] = tolStatusesForStore(ds, loc, opts);
  return out;
}
