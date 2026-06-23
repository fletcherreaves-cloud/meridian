// @ts-nocheck
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import * as XLSX from 'xlsx'
import { Chart } from 'chart.js/auto'
import './meridian.css'

const ReactDOM = { createRoot }

import { addD, addDR, dKey, nDK, dowOf, sodOf, eodOf, setWeekStartDay, mwStart, nwStart, fmtDI, fmtRng, nDays, rngMode, dFmt, dFmtShort, dFmtDow, thisWeek } from './utils/date.js';
import { isHoliday, getHolidayAdj, autoTagHolidays, buildHolidays, HOLIDAY_MAP } from './utils/holidays.js';
import { DEFAULT_TARGETS, DEFAULT_MODEL_ASSIGNMENTS, MODEL_ASSIGNMENT_KEY, DEF_SETTINGS, AE_DI_PARAMS, MODEL_CODE_LABELS, STORE_COORDS, STORE_NAMES, sName, sNameC, DOW_BASE, STORE_KB, STORE_KB_EDIT_KEY, getKBEdits, saveKBEdits, getKB, EVENT_TYPES, EVENT_TYPE_GROUPS, INV_ORG_COORDS } from './constants.js';
import { _masgnInvalidate, getModelAssignment, saveModelOverride, computeMAPEDrift, computeStoreSigma, getStoreOrg, getWeatherNote, isWeatherExtreme, calibrateWeather, forecastEWMA, forecastAdaptiveDI, forecastAdaptiveEnsemble, _wxCache, getForecastWeather, fetchRow, fetchWx, fetchLY, fetchLYDate, storeAgeDays, fetchRampSales, getDOWTrend, getDOWSpecificTrend, forecastDayparts, getWxAdj, modelHealthScore, compute6wk, calcOpsF, forecastDay, forecastRange, forecastRangeAsync, effectivePlusUp, forecastModels, modelAccuracy, getDIRecommendation, computeModelHealth, bLocIdx, locRows, avg6, gcCrossCheck, KnowledgeBasePanel, InfoIcon } from './engine/forecast.js';
import { idbDateKey, idbPutRows, idbGetAllRows, idbGetMeta, idbSetMeta, idbClearAll, idbGetCoverage, coverageFromLoadedRows, withTimeout, idbQuickSessionCheck, loadDsFromIDB } from './db/index.js';
import { crossStoreCheck, lookupMissEvent, diagnoseMiss, computeForecastComposition, classifyMissCauses, runWhyEngineScan, runWhyEngineDistrict } from './engine/why.js';
import { GMCoachingBrief } from './engine/coaching.js';
import { LifelenzGapPanel, LifeLenzBridgePanel } from './features/lifelenz.js';
import { CalendarManagerPanel, EventEntryModal, EventRegistryModal } from './features/calendar.js';
import { detectCleanDataStart, runModelAssignmentBacktest, calibrateStore } from './engine/backtest.js';
import { computeEventFactors } from './utils/events.js';
import { analyzeRegisterAudit } from './utils/register-audit.js';
import { parseInventoryData, InventoryIntelligence } from './views/inventory.js';
import { computeSmartTargets, SmartTargetPanel } from './features/smart-targets.js';
import { DARDaypartPanel, ProductMixPanel, LaborAnalyticsPanel, OperatorSummaryPanel } from './views/labor-tools.js';
import { loadLockedProjections, saveLockedProjections, getLockedAmount, lockProjectionWeek, ProjectionWorkflow } from './features/projections.js';
import {
  fetchForecastWeather,
  ymKey, loadTargetsV2, saveTargetsV2, getMonthTargets, getTargetsForDate, setMonthTargets,
  getYearlyStorageKey, loadYearlyTargets, saveYearlyTargets, setYearlyTarget, getYearlyTarget, exportYearlyTargets,
  copyMonthTargets, toggleMonthLock, exportTargetsV2, getTargetMonths, migrateTargetsToV2,
  PEAK_SLICES, normSlice, analyzePeaks,
  mdToNodes,
  useChart, TT, AX, LEG, SalesChart, OpsRadar, TrendChart,
  wxIcon, ForecastRow, ForecastTable,
  Brief, OpsScorecard, CtrlScorecard, AITabInsight, PeaksTab, generatePlan, ActionPlanTab,
  StoreCard, DistrictGrid, OrgView, ExportDropdown, RankingView, PerformanceCalculator,
  UnifiedTargetsPanel, MonthlyTargetManager, EventCalendar,
  OpsBarChart, CompareRadarChart, CompareLineChart,
} from './views/store-dash.js';

window._cdnError = function(name) {
  var msg = '<div style="padding:30px;font-family:monospace;background:#090e18;color:#e2e8f0;min-height:100vh">'
    +'<div style="color:#f59e0b;font-size:18px;font-weight:700;margin-bottom:14px">&#9888; Meridian &#8212; Script Load Error</div>'
    +'<div style="color:#f87171;font-size:13px;margin-bottom:16px">Failed to load: <b>'+name+'</b></div>'
    +'<div style="color:#94a3b8;font-size:12px;line-height:1.8;margin-bottom:20px">'
    +'<b>This app requires an internet connection to load its libraries.</b><br><br>'
    +'<b>On iPhone/iPad:</b><br>'
    +'&#9312; Open the file in Safari (not Files preview)<br>'
    +'&#9313; Make sure you have an active internet connection<br>'
    +'&#9314; Share file &#8594; Open in Safari<br><br>'
    +'<b>On Mac/Windows:</b> Open the file in Chrome or Firefox with internet access.<br>'
    +'</div></div>';
  // Safe: use a deferred approach so body exists
  window._cdnErrorMsg = msg;
  window._cdnFailed = true;
};

// ════════════════════════════════════════════════════════════════════════════════
// MORNING INTELLIGENCE BRIEF  —  Correlation Engine + Panel
// ════════════════════════════════════════════════════════════════════════════════

// ── Supervisor patch map (from org structure) ────────────────────────────────
const SUPERVISOR_PATCHES = {
  'Spencer':   ['3708','6972','24471','32525'],
  'Langford':  ['5183','33222','29760','33704'],
  'Podroza':   ['5985','13113','43380','43701'],
  'Vaughn':    ['10422','10915','35064','31357'],
  'Estrada':   ['20475','18213','11657','33109'],
  'Denley':    ['6178','6838','10034','35242','37566','38609'],
};
const LOC_SUPERVISOR = {};
Object.entries(SUPERVISOR_PATCHES).forEach(([sup,locs])=>locs.forEach(l=>LOC_SUPERVISOR[l]=sup));

// ── Correlation rules engine ─────────────────────────────────────────────────
// Each rule: { id, name, category, description, evaluate(data) → {severity,headline,detail,action} | null }
const MORNING_RULES = [

  { id:'DRAWER_OPENS', name:'Cash Integrity Risk', category:'controls', icon:'💰',
    evaluate(d){
      const v=d.drawerOpens;
      if(v==null) return null;
      if(v>=10) return {severity:'RED',
        headline:`${v} drawer opens — HIGH cash integrity risk`,
        detail:`10+ drawer opens indicates either a severely untrained employee making repeated errors (leading to T-Reds, refunds, overrings) or an experienced employee actively gaming the register to remove excess cash. Either scenario requires immediate follow-up.`,
        action:`Pull register audit detail for this date. Identify the employee(s) with highest opens. Review corresponding T-Red After Total %, refunds, and manual overrings for the same shift.`};
      if(v>=5) return {severity:'AMBER',
        headline:`${v} drawer opens — elevated cash integrity risk`,
        detail:`5–9 drawer opens is above normal. Could be an inexperienced employee struggling with the register or an early pattern worth monitoring.`,
        action:`Review register activity log. Confirm with shift manager who was on register. Check for corresponding cash variance or overring activity.`};
      return null;
    }},

  { id:'REFUND_OVERRING', name:'Large Refund or Overring', category:'controls', icon:'🧾',
    evaluate(d){
      const refund=d.refundAmt||0, over=d.posOverAmt||d.manualRefAmt||0;
      const maxV=Math.max(refund,over), isRef=refund>=over;
      if(maxV>=100) return {severity:'RED',
        headline:`$${maxV.toFixed(2)} ${isRef?'refund':'overring'} — immediate investigation required`,
        detail:`Transactions of this size are almost never legitimate without manager authorization and documentation. This is a significant red flag for POS manipulation.`,
        action:`Pull the specific transaction record. Identify employee and MOD. Obtain explanation and documentation. Review video surveillance if available.`};
      if(maxV>=50) return {severity:'AMBER',
        headline:`$${maxV.toFixed(2)} ${isRef?'refund':'overring'} — verify authorization`,
        detail:`Above the normal $50 threshold. Requires confirmation of proper manager authorization and a legitimate business reason.`,
        action:`Confirm transaction was manager-approved and documented with reason.`};
      return null;
    }},

  { id:'TRED_SPIKE', name:'T-Red After Total Spike', category:'controls', icon:'🔴',
    evaluate(d){
      const v=d.tRedAPct||d.tRedBPct||0;
      if(v==null||v===0) return null;
      const pct=v>1?v:v*100; // normalize to %
      if(pct>=3) return {severity:'RED',
        headline:`T-Red After Total at ${pct.toFixed(1)}% — controls concern`,
        detail:`T-Reds After Total represent voids after the Total button — a strong indicator of cash integrity issues. Rates above 3% warrant immediate review.`,
        action:`Review individual T-Red transactions. Cross-reference with drawer opens and cash O/S for the same shift.`};
      if(pct>=1.5) return {severity:'AMBER',
        headline:`T-Red After Total at ${pct.toFixed(1)}% — elevated`,
        detail:`Above normal range. Monitor for trend. Could indicate training issues or deliberate manipulation.`,
        action:`Review T-Red transactions and confirm with shift manager.`};
      return null;
    }},

  { id:'GC_SALES_DIVERGE', name:'Sales/GC Divergence — Theft Signal', category:'controls', icon:'📉',
    evaluate(d){
      const {salesVsExp, gcVsExp} = d;
      if(salesVsExp==null||gcVsExp==null) return null;
      const diverge = gcVsExp - salesVsExp; // GC is up relative to sales
      if(salesVsExp < -5 && gcVsExp > -2 && diverge >= 8) {
        const sev = diverge >= 15 ? 'RED' : 'AMBER';
        return {severity: sev,
          headline:`Sales ${salesVsExp.toFixed(1)}% below projection but GC only ${gcVsExp>0?'+':''}${gcVsExp.toFixed(1)}% — ${diverge.toFixed(0)}pp divergence`,
          detail:`Normal operations show sales and guest counts move together. When sales drop significantly but guest counts hold, the average check has collapsed — a pattern consistent with systematic POS reductions (voids, refunds, discounts, comp meals) inflating the gap.`,
          action:`Immediately review POS reductions for this period: manual refunds, voids, discounts, and comp meals. Calculate if reduction totals are proportionate to the sales gap. This pattern requires prompt investigation.`};
      }
      return null;
    }},

  { id:'STAFFED_SLOW', name:'Manager Not Actively Managing Floor', category:'service', icon:'👔',
    evaluate(d){
      const {actVsNeed, oepe, oepeNorm} = d;
      if(actVsNeed==null||oepe==null||!oepeNorm) return null;
      const staffOk = Math.abs(actVsNeed) <= 2;
      const oepeHigh = oepe > oepeNorm * 1.15;
      if(!staffOk||!oepeHigh) return null;
      const pctOver = Math.round((oepe/oepeNorm-1)*100);
      const sev = oepe > oepeNorm * 1.30 ? 'RED' : 'AMBER';
      return {severity: sev,
        headline:`OEPE ${Math.round(oepe)}s (${pctOver}% above norm) with adequate staffing (${actVsNeed>0?'+':''}${actVsNeed} vs needed)`,
        detail:`Staffing is not the issue — the location has what it needs. High OEPE despite adequate staffing points to the manager on duty not actively managing the floor, not properly planning the shift, or not being present during peak periods. If this persists beyond one period, it escalates to a management performance concern.`,
        action:`On next visit: observe floor management presence during peak periods. Review shift planner execution. Coach MOD on floor management fundamentals and holding crew accountable to speed standards.`};
    }},

  { id:'STAFFED_NO_PARK', name:'Drive-Through Pull-Off Risk', category:'service', icon:'🚗',
    evaluate(d){
      const {actVsNeed, oepe, oepeNorm, dtPark} = d;
      if(actVsNeed==null||oepe==null||dtPark==null) return null;
      const staffOk = Math.abs(actVsNeed) <= 2;
      const oepeHigh = oepe > (oepeNorm||160) * 1.08;
      const parkLow = dtPark <= 5;
      if(!staffOk||!oepeHigh||!parkLow) return null;
      return {severity:'AMBER',
        headline:`OEPE ${Math.round(oepe)}s with DT Parked at ${Math.round(dtPark||0)}% — manager not pulling cars`,
        detail:`Adequate staffing and high OEPE with near-zero DT Parking indicates the manager is not using the park position to manage drive-through clock times. Customers are likely pulling off rather than waiting, representing lost sales and potentially inflating speed numbers through attrition.`,
        action:`Coach MOD on proactive DT parking to prevent pull-offs and maintain flow. Review DT window positioning procedures during peak periods.`};
    }},

  { id:'TIMER_GAMING', name:'Timing Data Integrity Issue', category:'service', icon:'⏱',
    evaluate(d){
      const {kvst, oepe, oepeNorm} = d;
      if(!kvst||!oepe) return null;
      const kvsVeryLow = kvst < 40;
      const oepeHigh = oepe > (oepeNorm||160) * 1.08;
      const kvsModLow = kvst < 55;
      if(kvsVeryLow && oepeHigh) return {severity:'RED',
        headline:`KVS ${Math.round(kvst)}s but OEPE ${Math.round(oepe)}s — timing math doesn't add up`,
        detail:`If kitchen times were legitimate at ${Math.round(kvst)}s, OEPE should be significantly lower. These metrics are inconsistent. Two explanations: (1) Kitchen staff are serving orders before completion — "serving off" — which inflates KVS performance while OEPE suffers because food isn't actually ready. (2) There is a fundamental breakdown getting completed food to customers at the window. Either way, something is wrong.`,
        action:`Observe kitchen KVS compliance on next visit. Confirm employees are completing the full KVS sequence before serving. If serving off is occurring, address with crew and manager — this creates unreliable operational data and real service failure.`};
      if(kvsModLow && !oepeHigh) return {severity:'AMBER',
        headline:`KVS averaging ${Math.round(kvst)}s — unusually fast, verify accuracy`,
        detail:`Consistently low KVS times may indicate crew is completing the KVS sequence prematurely. Verify through observation.`,
        action:`Observe kitchen procedures on next visit. Confirm proper KVS sequencing and compliance.`};
      return null;
    }},

  { id:'KVS_USAGE_LOW', name:'Single-Side Kitchen Operation', category:'service', icon:'🍳',
    evaluate(d){
      const {kvsu, actVsNeed, oepe, oepeNorm} = d;
      if(kvsu==null||actVsNeed==null) return null;
      const kvsU = kvsu>1 ? kvsu : kvsu*100; // normalize to %
      const staffOk = actVsNeed >= -2; // not severely understaffed
      const kvsLow = kvsU < 20;
      const oepeHigh = oepe > (oepeNorm||160) * 1.08;
      if(!kvsLow||!staffOk||!oepeHigh) return null;
      return {severity:'AMBER',
        headline:`KVS usage ${Math.round(kvsU||0)}% with adequate staffing and high OEPE`,
        detail:`Low KVS utilization during adequate staffing windows with elevated OEPE strongly suggests the manager is operating only one side of the kitchen. At this volume level, single-side kitchen operation is a major constraint on speed and is a correctable management issue.`,
        action:`Confirm with MOD: are both kitchen sides being utilized during peak periods? Coach on dual-side kitchen management standards. KVS dual-side utilization with adequate staffing should be non-negotiable.`};
    }},

  { id:'DAYPART_OEPE', name:'Evening/Late Night OEPE Driving Variance', category:'service', icon:'🌙',
    evaluate(d){
      const {periods} = d;
      if(!periods||periods.length < 2) return null;
      const morning = periods.filter(p=>p.period<=11).map(p=>p.oepe).filter(Boolean);
      const evening = periods.filter(p=>p.period>=17).map(p=>p.oepe).filter(Boolean);
      if(!morning.length||!evening.length) return null;
      const avgAM = morning.reduce((a,b)=>a+b,0)/morning.length;
      const avgPM = evening.reduce((a,b)=>a+b,0)/evening.length;
      const gap = avgPM - avgAM;
      if(gap >= 25) return {severity:'AMBER',
        headline:`Evening OEPE (${Math.round(avgPM)}s) is ${Math.round(gap)}s higher than morning (${Math.round(avgAM)}s)`,
        detail:`A significant daypart OEPE gap typically points to evening/late night opportunities — less oversight, less accountability. This is where easy improvements hide. Fixing one daypart can move storewide metrics meaningfully.`,
        action:`Focus next coaching session on evening shift management. Review MOD floor presence and crew accountability during PM periods. Often a structural shift management issue rather than a staffing issue.`};
      return null;
    }},

  { id:'CASH_OS', name:'Cash Over/Short Variance', category:'controls', icon:'💵',
    evaluate(d){
      const v=d.cashOSAmt;
      if(v==null||v===0) return null;
      const abs = Math.abs(v);
      if(abs >= 20) return {severity: abs>=50?'RED':'AMBER',
        headline:`Cash O/S ${v<0?'short':'over'} by $${abs.toFixed(2)}`,
        detail:`${abs>=50?'Significant cash variance warrants immediate investigation.':'Cash variance above normal threshold.'} ${v<0?'Cash shorts are more concerning than overs and should always be traced.':'Cash overs can indicate pricing errors or transaction manipulation.'}`,
        action:`Reconcile drawer counts and identify the shift(s) with variance. Cross-reference with drawer opens and T-Red activity.`};
      return null;
    }},
];

// ── Compute 8-week rolling norms per store ───────────────────────────────────
function computeStoreNorms(loc, ds){
  const cutoff = new Date(Date.now()-56*24*3600*1000); // 8 weeks back
  const peaks = (ds.peaksSvcRows||[]).filter(r=>String(r.loc)===String(loc)&&r.date>=cutoff&&r.oepe>0);
  const labors = (ds.laborRows||[]).filter(r=>String(r.loc)===String(loc)&&r.date>=cutoff&&r.sales>0);
  const avg = (arr,f) => arr.length ? arr.reduce((s,r)=>s+(r[f]||0),0)/arr.length : null;
  const gcSalesRatios = labors.filter(r=>r.sales>0&&r.gc>0).map(r=>r.gc/r.sales);
  return {
    oepeNorm: avg(peaks,'oepe'),
    kvstNorm: avg(peaks.filter(r=>r.kvst>0),'kvst'),
    gcSalesRatio: gcSalesRatios.length ? gcSalesRatios.reduce((a,b)=>a+b,0)/gcSalesRatios.length : null,
  };
}

// ── Assemble one store's data for a target date ──────────────────────────────
function assembleBriefStoreData(loc, targetDate, ds){
  const locStr = String(loc);
  const dk = dKey(targetDate);
  const sameDay = r => String(r.loc)===locStr && dKey(r.date)===dk;
  // Also allow ±1 day for data availability
  const nearby = r => String(r.loc)===locStr && Math.abs(r.date-targetDate)<2*86400000;

  const labor  = (ds.laborRows||[]).find(sameDay) || (ds.laborRows||[]).find(nearby);
  const ctrl   = (ds.ctrlRows||[]).find(sameDay)  || (ds.ctrlRows||[]).find(nearby);
  const peaks  = (ds.peaksSvcRows||[]).filter(r=>String(r.loc)===locStr&&Math.abs(r.date-targetDate)<3*86400000);
  const norms  = computeStoreNorms(loc, ds);

  // Aggregate peaks to daily
  const avgPeaks = (f) => peaks.length ? peaks.map(r=>r[f]||0).filter(v=>v>0).reduce((a,b)=>a+b,0)/Math.max(1,peaks.filter(r=>(r[f]||0)>0).length) : null;
  const oepe = avgPeaks('oepe');
  const kvst = avgPeaks('kvst');
  const _kvsuRaw = avgPeaks('kvsu');
  const kvsu = _kvsuRaw==null?null:(_kvsuRaw<=1?_kvsuRaw*100:_kvsuRaw);
  const _parkRaw = avgPeaks('park');
  const dtPark = _parkRaw==null?null:(_parkRaw<=1?Math.round(_parkRaw*1000)/10:_parkRaw);

  // GC vs expected
  const salesVsExp = (()=>{
   const _p=labor?.projSales>0?labor.projSales:
     (()=>{const _t=typeof DEFAULT_TARGETS!=='undefined'?DEFAULT_TARGETS[locStr]:null;
           const _m=_t?.tJuneProj||_t?.tOperatorProj||_t?.tMayProj||0;
           return _m>0?Math.round(_m/30):0;})();
   return _p>0&&labor?.sales>0?(((labor.sales-_p)/_p)*100):null;
 })();
  const expGC = (norms.gcSalesRatio && labor?.sales) ? labor.sales*norms.gcSalesRatio : null;
  const gcVsExp = (expGC && labor?.gc) ? ((labor.gc-expGC)/expGC*100) : null;

  return {
    loc, name: sNameC(loc),
    supervisor: LOC_SUPERVISOR[locStr]||'Unknown',
    hasData: !!(labor||ctrl||peaks.length),
    // Labor fields
    sales:      labor?.sales>0 ? labor.sales : null,
    // projSales: prefer Lifelenz daily projection from Labor Analysis;
    // fall back to operator monthly projection ÷ 30 from DEFAULT_TARGETS
    projSales: (()=>{
      if(labor?.projSales>0) return labor.projSales;
      const tgt = typeof DEFAULT_TARGETS!=='undefined' ? DEFAULT_TARGETS[locStr] : null;
      const monthly = tgt?.tJuneProj || tgt?.tOperatorProj || tgt?.tMayProj || 0;
      return monthly>0 ? Math.round(monthly/30) : null;
    })(),
    gc:         labor?.gc>0 ? labor.gc : (labor?.actualGC>0 ? labor.actualGC : null),
    tpph:       labor?.tpph>0 ? labor.tpph :
                (ctrl?.tpph>0 ? ctrl.tpph :
                (DEFAULT_TARGETS[locStr]?.tJuneTpph>0 ? DEFAULT_TARGETS[locStr].tJuneTpph : null)),
    laborPct:   labor?.laborPct>0 ? labor.laborPct :
                (ctrl?.laborPct>0 ? ctrl.laborPct :
                (DEFAULT_TARGETS[locStr]?.tJuneLaborPct>0 ? DEFAULT_TARGETS[locStr].tJuneLaborPct : null)),
    actVsNeed:  labor?.actVsNeed != null ? labor.actVsNeed : (ctrl?.actVsNeed ?? null),
    salesVsExp, gcVsExp,
    // Controls fields
    drawerOpens:  ctrl?.drawerOpens||null,
    posOverAmt:   ctrl?.posOverAmt||null,
    manualRefAmt: ctrl?.manualRefAmt||null,
    refundAmt:    ctrl?.refundAmt||(ctrl?.cashRefAmt||0)+(ctrl?.cashlessRefAmt||0)||null,
    tRedAPct:     ctrl?.tRedAPct||null,
    tRedBPct:     ctrl?.tRedBPct||null,
    cashOSAmt:    ctrl?.cashOSAmt||null,
    // Service fields
    oepe, kvst, kvsu, dtPark,
    oepeNorm: norms.oepeNorm,
    kvstNorm: norms.kvstNorm,
    // Daypart data
    periods: peaks.map(r=>({period: r.date instanceof Date ? r.date.getHours() : 12, oepe:r.oepe, kvst:r.kvst})),
    // Data coverage
    hasLabor: !!labor,
    hasCtrl:  !!ctrl,
    hasPeaks: peaks.length > 0,
  };
}

// ── Run correlation rules against one store's assembled data ─────────────────
function evaluateStoreCorrelations(data){
  return MORNING_RULES.map(rule=>{
    try{ return rule.evaluate(data) ? {...rule.evaluate(data), id:rule.id, name:rule.name, icon:rule.icon, category:rule.category} : null; }
    catch(e){ return null; }
  }).filter(Boolean);
}

// ── Compute full district morning brief ──────────────────────────────────────
function computeMorningBrief(ds, targetDate){
  const stores = Object.keys(STORE_NAMES).map(loc=>{
    const data = assembleBriefStoreData(loc, targetDate, ds);
    const flags = evaluateStoreCorrelations(data);
    const severity = flags.some(f=>f.severity==='RED') ? 'RED'
                   : flags.some(f=>f.severity==='AMBER') ? 'AMBER'
                   : data.hasData ? 'GREEN' : 'NODATA';
    return {...data, flags, severity,
      priorityScore: (flags.filter(f=>f.severity==='RED').length*10)
                   + (flags.filter(f=>f.severity==='AMBER').length*3)
                   + (severity==='NODATA'?0:1)};
  }).sort((a,b)=>b.priorityScore-a.priorityScore);
  return {
    date: targetDate,
    generatedAt: new Date(),
    stores,
    summary:{
      red:   stores.filter(s=>s.severity==='RED').length,
      amber: stores.filter(s=>s.severity==='AMBER').length,
      green: stores.filter(s=>s.severity==='GREEN').length,
      noData:stores.filter(s=>s.severity==='NODATA').length,
      totalFlags: stores.reduce((s,st)=>s+st.flags.length,0),
    }
  };
}

// ── Helper: get latest date that has any brief data ──────────────────────────
function getLatestBriefDate(ds){
  const allDates = [
    ...(ds.laborRows||[]).map(r=>r.date),
    ...(ds.ctrlRows||[]).map(r=>r.date),
    ...(ds.peaksSvcRows||[]).map(r=>r.date),
  ].filter(Boolean);
  if(!allDates.length) return new Date();
  return new Date(Math.max(...allDates.map(d=>d instanceof Date?d:new Date(d))));
}

// ── Severity helpers ─────────────────────────────────────────────────────────
const SCOLOR = {RED:'#ef4444',AMBER:'#f59e0b',GREEN:'#10b981',NODATA:'#4a6080'};
const SBG    = {RED:'rgba(239,68,68,.08)',AMBER:'rgba(245,158,11,.07)',GREEN:'rgba(16,185,129,.06)',NODATA:'rgba(255,255,255,.03)'};
const SBDR   = {RED:'rgba(239,68,68,.3)',AMBER:'rgba(245,158,11,.25)',GREEN:'rgba(16,185,129,.2)',NODATA:'rgba(255,255,255,.07)'};

// ── StoreBriefCard component ─────────────────────────────────────────────────
function StoreBriefCard({store, expanded, setExpanded}){
  const isOpen = expanded === store.loc;
  const {severity, flags, name, supervisor, hasData,
         sales, projSales, gc, oepe, oepeNorm, drawerOpens,
         actVsNeed, tpph, laborPct, kvst, dtPark} = store;
  const c = SCOLOR[severity], bg = SBG[severity], bdr = SBDR[severity];

  return h('div',{
    key:store.loc,
    style:{background:bg,border:`1px solid ${bdr}`,borderRadius:'10px',
           marginBottom:'8px',overflow:'hidden',transition:'all .2s'}},

    // ── Card header (always visible) ──────────────────────────────────────
    h('div',{
      style:{padding:'12px 14px',cursor:'pointer',display:'flex',alignItems:'flex-start',gap:'10px'},
      onClick:()=>setExpanded(isOpen?null:store.loc)},

      // Severity badge
      h('div',{style:{
        width:'32px',height:'32px',borderRadius:'50%',background:c,flexShrink:0,
        display:'flex',alignItems:'center',justifyContent:'center',
        fontSize:'12px',color:'white',fontWeight:800,marginTop:'1px'}},
        severity==='RED'?'!!':severity==='AMBER'?'!':severity==='GREEN'?'✓':'?'),

      // Store info
      h('div',{style:{flex:1,minWidth:0}},
        h('div',{style:{display:'flex',alignItems:'center',gap:'6px',flexWrap:'wrap',marginBottom:'3px'}},
          h('span',{style:{fontWeight:700,fontSize:'13px',color:'var(--text,#111827)'}},name),
          h('span',{style:{fontSize:'10px',color:'var(--text3,#6b7280)',background:'rgba(128,128,128,.1)',
                           borderRadius:'4px',padding:'1px 6px'}},supervisor),
          !hasData&&h('span',{style:{fontSize:'10px',color:'var(--text3,#9ca3af)',fontStyle:'italic'}},'no data'),
        ),
        flags.length>0
          ? h('div',{style:{display:'flex',flexWrap:'wrap',gap:'4px',marginTop:'4px'}},
              flags.slice(0,3).map(f=>
                h('span',{key:f.id,style:{
                  fontSize:'10px',fontWeight:600,padding:'2px 7px',borderRadius:'99px',
                  background:f.severity==='RED'?'rgba(239,68,68,.15)':'rgba(245,158,11,.15)',
                  border:`1px solid ${f.severity==='RED'?'rgba(239,68,68,.3)':'rgba(245,158,11,.3)'}`,
                  color:SCOLOR[f.severity]}},
                  f.icon+' '+f.name)),
              flags.length>3&&h('span',{style:{fontSize:'10px',color:'#4a6080',padding:'2px 7px'}},
                `+${flags.length-3} more`)
            )
          : hasData&&h('div',{style:{fontSize:'11px',color:'var(--green,#059669)',marginTop:'2px'}},'✓ No flags — all metrics within range'),
      ),

      // Quick metrics strip
      h('div',{style:{display:'flex',gap:'8px',flexShrink:0,alignItems:'flex-start'}},
        sales!=null&&h('div',{style:{textAlign:'right'}},
          h('div',{style:{fontFamily:'monospace',fontSize:'11px',fontWeight:700,
                          color:projSales&&sales<projSales*0.95?'#ef4444':projSales&&sales<projSales?'#f59e0b':'#10b981'}},
            '$'+(sales/1000).toFixed(1)+'K'),
          h('div',{style:{fontSize:'9px',color:'#4a6080'}},'sales')),
        oepe!=null&&h('div',{style:{textAlign:'right'}},
          h('div',{style:{fontFamily:'monospace',fontSize:'11px',fontWeight:700,
                          color:oepeNorm&&oepe>oepeNorm*1.15?'#ef4444':oepeNorm&&oepe>oepeNorm*1.05?'#f59e0b':'#10b981'}},
            oepe.toFixed(0)+'s'),
          h('div',{style:{fontSize:'9px',color:'#4a6080'}},'OEPE')),
        drawerOpens!=null&&h('div',{style:{textAlign:'right'}},
          h('div',{style:{fontFamily:'monospace',fontSize:'11px',fontWeight:700,
                          color:drawerOpens>=10?'#ef4444':drawerOpens>=5?'#f59e0b':'#10b981'}},
            drawerOpens.toFixed(0)),
          h('div',{style:{fontSize:'9px',color:'#4a6080'}},'D.Opens')),
        h('div',{style:{fontSize:'14px',color:'#4a6080',marginTop:'6px',transition:'transform .2s',
                         transform:isOpen?'rotate(180deg)':'rotate(0deg)'}},'▾')
      ),
    ),

    // ── Expanded detail ────────────────────────────────────────────────────
    isOpen && h('div',{style:{borderTop:`1px solid ${bdr}`,padding:'14px'}},
      // All flags expanded
      flags.length>0 && h('div',{style:{marginBottom:'14px'}},
        flags.map(f=>
          h('div',{key:f.id,
            style:{background:f.severity==='RED'?'rgba(239,68,68,.07)':'rgba(245,158,11,.06)',
                   border:`1px solid ${f.severity==='RED'?'rgba(239,68,68,.2)':'rgba(245,158,11,.2)'}`,
                   borderRadius:'8px',padding:'12px 14px',marginBottom:'8px'}},
            h('div',{style:{fontWeight:700,fontSize:'12px',color:SCOLOR[f.severity],marginBottom:'6px'}},
              f.icon+' '+f.name+' — '+f.headline),
            h('p',{style:{fontSize:'12px',color:'var(--text,#374151)',lineHeight:'1.7',marginBottom:'8px'}},f.detail),
            h('div',{style:{fontSize:'11px',fontWeight:600,color:'var(--text,#1f2937)',
                            borderLeft:'2px solid '+SCOLOR[f.severity],paddingLeft:'8px',lineHeight:'1.6'}},
              '→ '+f.action),
          ))
      ),
      // Key metrics detail grid
      h('div',{style:{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(100px,1fr))',gap:'7px'}},
        [
          ['Sales',  sales!=null?'$'+(sales/1000).toFixed(1)+'K':'—'],
          ['Projected',projSales!=null?'$'+(projSales/1000).toFixed(1)+'K':'—'],
          ['vs Proj', store.salesVsExp!=null?(store.salesVsExp>0?'+':'')+store.salesVsExp.toFixed(1)+'%':'—',
            store.salesVsExp!=null?(store.salesVsExp>-3?'#10b981':store.salesVsExp>-8?'#f59e0b':'#ef4444'):null],
          ['GC',     gc!=null?gc.toFixed(0):'—'],
          ['OEPE',   oepe!=null?oepe.toFixed(0)+'s':'—', oepeNorm&&oepe?oepe>oepeNorm*1.15?'#ef4444':oepe>oepeNorm*1.05?'#f59e0b':'#10b981':null],
          ['OEPE Norm',oepeNorm!=null?oepeNorm.toFixed(0)+'s':'—'],
          ['KVS',    kvst!=null?kvst.toFixed(0)+'s':'—'],
          ['DT Parked',dtPark!=null?dtPark.toFixed(0)+'%':'—'],
          ['Act vs Need',actVsNeed!=null?(actVsNeed>0?'+':'')+actVsNeed.toFixed(1):'—',
            actVsNeed!=null?(Math.abs(actVsNeed)<=2?'#10b981':Math.abs(actVsNeed)<=4?'#f59e0b':'#ef4444'):null],
          ['TPPH',   tpph!=null?tpph.toFixed(1):'—'],
          ['Labor%', laborPct!=null?((laborPct>1?laborPct:laborPct*100).toFixed(1))+'%':'—'],
          ['Drawer Opens',drawerOpens!=null?drawerOpens.toFixed(0):'—',
            drawerOpens!=null?(drawerOpens<5?'#10b981':drawerOpens<10?'#f59e0b':'#ef4444'):null],
        ].map(([lbl,val,clr])=>
          h('div',{style:{background:'rgba(255,255,255,.04)',borderRadius:'6px',padding:'8px 10px',textAlign:'center'}},
            h('div',{style:{fontFamily:'monospace',fontSize:'13px',fontWeight:700,color:clr||'var(--text,#111827)'}},val),
            h('div',{style:{fontSize:'9px',color:'#4a6080',textTransform:'uppercase',letterSpacing:'.06em',marginTop:'2px'}},lbl)
          )
        )
      ),
      h('div',{style:{fontSize:'10px',color:'var(--text3,#6b7280)',marginTop:'10px',display:'flex',gap:'10px',flexWrap:'wrap'}},
        h('span',null,'Data: '+([store.hasLabor&&'Labor',store.hasCtrl&&'Controls',store.hasPeaks&&'3 Peaks'].filter(Boolean).join(' · ')||'None loaded')+(!store.hasPeaks?' · (need 3 Peaks covering '+briefDate.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})+')':'')),
      )
    )
  );
}

// ── MorningBriefPanel ────────────────────────────────────────────────────────
function MorningBriefPanel({ds, settings}){
  const uSt=React.useState, uM=React.useMemo, uCB=React.useCallback, uE=React.useEffect;
  const [briefDate, setBriefDate] = uSt(()=>getLatestBriefDate(ds));
  const [expanded, setExpanded] = uSt(null);
  const [filter, setFilter] = uSt('ALL'); // ALL | RED | AMBER | GREEN
  const [supervisorFilter, setSupervisorFilter] = uSt('ALL');
  const [generating, setGenerating] = uSt(false);

  // Re-sync date if ds changes
  uE(()=>{ const ld=getLatestBriefDate(ds); if(ld) setBriefDate(ld); },[ds]);

  const brief = uM(()=>computeMorningBrief(ds, briefDate),[ds, briefDate]);
  const filtered = uM(()=>{
    let s = brief.stores;
    if(filter!=='ALL') s=s.filter(st=>st.severity===filter);
    if(supervisorFilter!=='ALL') s=s.filter(st=>st.supervisor===supervisorFilter);
    return s;
  },[brief,filter,supervisorFilter]);

  const dateStr = briefDate instanceof Date ? briefDate.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'}) : '';
  const {red,amber,green,noData,totalFlags} = brief.summary;
  const supervisors = [...new Set(Object.keys(SUPERVISOR_PATCHES))];

  return h('div',{style:{padding:'16px',maxWidth:'860px',margin:'0 auto'}},

    // ── Header ──────────────────────────────────────────────────────────────
    h('div',{style:{marginBottom:'20px'}},
      h('div',{style:{display:'flex',alignItems:'flex-start',justifyContent:'space-between',flexWrap:'wrap',gap:'10px'}},
        h('div',null,
          h('div',{style:{fontSize:'11px',fontWeight:700,letterSpacing:'.1em',textTransform:'uppercase',color:'#f59e0b',marginBottom:'4px'}},'Morning Intelligence Brief'),
          h('div',{style:{fontFamily:"'Syne',sans-serif",fontSize:'22px',fontWeight:900,letterSpacing:'-.03em',color:'var(--text,#111827)'}},dateStr),
          h('div',{style:{fontSize:'11px',color:'#4a6080',marginTop:'3px'}},
            totalFlags+' flag'+(totalFlags!==1?'s':'')+' across '+brief.stores.filter(s=>s.hasData).length+' stores with data · '+(noData>0?noData+' stores no data · ':'')+
            'Generated '+new Date().toLocaleTimeString()),
        ),
        h('div',{style:{display:'flex',gap:'8px',alignItems:'center',flexWrap:'wrap'}},
          h('input',{type:'date',
            value:briefDate instanceof Date?briefDate.toISOString().slice(0,10):'',
            onChange:e=>setBriefDate(new Date(e.target.value+'T12:00:00')),
            style:{background:'rgba(255,255,255,.07)',border:'1px solid rgba(255,255,255,.12)',
                   borderRadius:'7px',padding:'6px 10px',color:'var(--text,#111827)',fontSize:'12px',cursor:'pointer'}}),
          h('button',{
            onClick:()=>exportBriefHTML(brief),
            style:{background:'rgba(245,158,11,.15)',border:'1px solid rgba(245,158,11,.3)',
                   color:'#f59e0b',borderRadius:'7px',padding:'7px 14px',cursor:'pointer',
                   fontSize:'12px',fontWeight:600}},
            '📤 Export Brief'),
        )
      )
    ),

    // ── District pulse KPIs ──────────────────────────────────────────────────
    h('div',{style:{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'8px',marginBottom:'16px'}},
      [
        ['🔴',red,'Stores Need Attention','#ef4444','rgba(239,68,68,.08)','rgba(239,68,68,.25)','RED'],
        ['🟡',amber,'Stores Flag Review','#f59e0b','rgba(245,158,11,.07)','rgba(245,158,11,.25)','AMBER'],
        ['🟢',green,'Stores All Clear','#10b981','rgba(16,185,129,.06)','rgba(16,185,129,.2)','GREEN'],
        ['⚪',noData,'Stores No Data','#4a6080','rgba(255,255,255,.03)','rgba(255,255,255,.08)','NODATA'],
      ].map(([icon,count,label,c,bg,bdr,fv])=>
        h('div',{key:fv,
          onClick:()=>setFilter(filter===fv?'ALL':fv),
          style:{background:filter===fv||filter==='ALL'?bg:'rgba(255,255,255,.02)',
                 border:`1px solid ${filter===fv?c:bdr}`,borderRadius:'9px',
                 padding:'12px 14px',cursor:'pointer',transition:'all .15s',
                 textAlign:'center'}},
          h('div',{style:{fontSize:'22px',fontWeight:900,color:c,fontFamily:"'Syne',sans-serif",letterSpacing:'-.03em'}},count),
          h('div',{style:{fontSize:'10px',color:'#4a6080',textTransform:'uppercase',letterSpacing:'.07em',marginTop:'3px'}},label)
        )
      )
    ),

    // ── Filters row ──────────────────────────────────────────────────────────
    h('div',{style:{display:'flex',gap:'6px',marginBottom:'14px',flexWrap:'wrap',alignItems:'center'}},
      h('span',{style:{fontSize:'11px',color:'#4a6080',marginRight:'4px'}},'Supervisor:'),
      ['ALL',...supervisors].map(sup=>
        h('button',{key:sup,
          onClick:()=>setSupervisorFilter(sup),
          style:{padding:'4px 10px',borderRadius:'99px',border:'1px solid',fontSize:'11px',
                 fontWeight:600,cursor:'pointer',
                 background:supervisorFilter===sup?'rgba(245,158,11,.15)':'transparent',
                 borderColor:supervisorFilter===sup?'rgba(245,158,11,.4)':'rgba(255,255,255,.1)',
                 color:supervisorFilter===sup?'#f59e0b':'#4a6080'}},sup)
      ),
    ),

    // ── Store cards ──────────────────────────────────────────────────────────
    filtered.length===0
      ? h('div',{style:{textAlign:'center',padding:'40px',color:'#4a6080',fontSize:'13px'}},'No stores match the current filter')
      : filtered.map(store=>
          h(StoreBriefCard,{key:store.loc,store,expanded,setExpanded})
        ),
  );
}

// ── Export standalone brief HTML ─────────────────────────────────────────────
function exportBriefHTML(brief){
  const dateStr = brief.date instanceof Date
    ? brief.date.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'})
    : 'Unknown Date';
  const {red,amber,green,noData,totalFlags} = brief.summary;

  const storeHTML = brief.stores.filter(s=>s.hasData||s.flags.length>0).map(s=>{
    const c = SCOLOR[s.severity];
    const flagsHTML = s.flags.map(f=>`
      <div class="flag flag-${f.severity.toLowerCase()}">
        <div class="flag-title">${f.icon} ${f.name}</div>
        <div class="flag-headline">${f.headline}</div>
        <p class="flag-detail">${f.detail}</p>
        <div class="flag-action">→ ${f.action}</div>
      </div>`).join('');
    const metricsHTML = [
      ['Sales',      s.sales!=null?'$'+(s.sales/1000).toFixed(1)+'K':'—'],
      ['Projected',  s.projSales!=null?'$'+(s.projSales/1000).toFixed(1)+'K':'—'],
      ['vs Proj',    s.salesVsExp!=null?(s.salesVsExp>0?'+':'')+s.salesVsExp.toFixed(1)+'%':'—'],
      ['OEPE',       s.oepe!=null?s.oepe.toFixed(0)+'s':'—'],
      ['KVS',        s.kvst!=null?s.kvst.toFixed(0)+'s':'—'],
      ['DT Park%',   s.dtPark!=null?s.dtPark.toFixed(0)+'%':'—'],
      ['Act vs Need',s.actVsNeed!=null?(s.actVsNeed>=0?'+':'')+s.actVsNeed.toFixed(1):'—'],
      ['D.Opens',    s.drawerOpens!=null?s.drawerOpens.toFixed(0):'—'],
      ['Labor%',     s.laborPct!=null?((s.laborPct>1?s.laborPct:s.laborPct*100).toFixed(1))+'%':'—'],
    ].map(([l,v])=>`<div class="metric"><div class="metric-val">${v}</div><div class="metric-lbl">${l}</div></div>`).join('');
    return `<div class="store-card sev-${s.severity.toLowerCase()}">
      <div class="store-hdr">
        <div class="store-dot" style="background:${c}">${s.severity==='RED'?'!!':s.severity==='AMBER'?'!':'✓'}</div>
        <div class="store-info">
          <div class="store-name">${s.name}</div>
          <div class="store-sup">${s.supervisor}</div>
        </div>
        <div class="metric-row-mini">${metricsHTML}</div>
      </div>
      ${s.flags.length?'<div class="flags">'+flagsHTML+'</div>':'<div class="no-flags">✓ No flags — all metrics within normal range</div>'}
    </div>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Morning Brief — ${dateStr}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;900&display=swap');
:root{--navy:#080e1c;--surf:#0d1829;--amber:#f59e0b;--green:#10b981;--red:#ef4444;--text:#eef2ff;--text2:#7da0c4;--text3:#3d5a7a;--bdr:rgba(255,255,255,.08)}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:var(--navy);color:var(--text);font-size:13px;line-height:1.6;padding:20px}
.wrap{max-width:900px;margin:0 auto}
.header{margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid var(--bdr)}
.header h1{font-family:'Syne',sans-serif;font-size:28px;font-weight:900;letter-spacing:-.03em;margin-bottom:3px}
.header .sub{font-size:12px;color:var(--text3)}
.pulse{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px}
.pulse-card{border-radius:8px;padding:12px;text-align:center;border:1px solid}
.pulse-val{font-size:24px;font-weight:900;font-family:'Syne',sans-serif}
.pulse-lbl{font-size:9px;text-transform:uppercase;letter-spacing:.07em;margin-top:2px;color:var(--text3)}
.store-card{border-radius:9px;border:1px solid;margin-bottom:8px;overflow:hidden;break-inside:avoid}
.sev-red{border-color:rgba(239,68,68,.3);background:rgba(239,68,68,.06)}
.sev-amber{border-color:rgba(245,158,11,.3);background:rgba(245,158,11,.05)}
.sev-green{border-color:rgba(16,185,129,.2);background:rgba(16,185,129,.04)}
.store-hdr{padding:10px 14px;display:flex;align-items:flex-start;gap:10px;flex-wrap:wrap}
.store-dot{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:white;flex-shrink:0}
.store-name{font-size:13px;font-weight:700}
.store-sup{font-size:10px;color:var(--text3)}
.metric-row-mini{display:flex;gap:6px;flex-wrap:wrap;margin-left:auto}
.metric{background:rgba(255,255,255,.04);border-radius:5px;padding:5px 8px;text-align:center}
.metric-val{font-size:11px;font-weight:700;font-family:monospace}
.metric-lbl{font-size:8px;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-top:1px}
.flags{padding:10px 14px;border-top:1px solid var(--bdr)}
.flag{border-radius:7px;padding:10px 12px;margin-bottom:6px;border:1px solid}
.flag-red{background:rgba(239,68,68,.07);border-color:rgba(239,68,68,.2)}
.flag-amber{background:rgba(245,158,11,.06);border-color:rgba(245,158,11,.2)}
.flag-title{font-size:11px;font-weight:700;margin-bottom:3px}
.flag-red .flag-title{color:var(--red)}
.flag-amber .flag-title{color:var(--amber)}
.flag-headline{font-size:12px;font-weight:600;color:var(--text);margin-bottom:5px}
.flag-detail{font-size:11px;color:var(--text2);line-height:1.7;margin-bottom:5px}
.flag-action{font-size:11px;font-weight:600;color:var(--text);border-left:2px solid;padding-left:7px;line-height:1.5}
.flag-red .flag-action{border-color:var(--red)}
.flag-amber .flag-action{border-color:var(--amber)}
.no-flags{padding:8px 14px;font-size:11px;color:var(--green)}
.eyebrow{font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--amber);margin-bottom:3px;font-weight:700}
@media print{
  body{background:white;color:#0a0f1e;padding:10px}
  .store-card{break-inside:avoid;background:white!important;border-color:#ddd!important}
  .flag{background:#fff8f0!important;border-color:#fde68a!important}
  .flag-red{background:#fff0f0!important;border-color:#fca5a5!important}
  .metric{background:#f8f8f8!important}
  .sev-red{background:#fff5f5!important}
  .sev-amber{background:#fffbeb!important}
  .sev-green{background:#f0fdf4!important}
}
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <div class="eyebrow">Meridian · Morning Intelligence Brief</div>
    <h1>${dateStr}</h1>
    <div class="sub">${totalFlags} flag${totalFlags!==1?'s':''} · ${red} attention · ${amber} review · ${green} clear · Generated ${new Date().toLocaleString()}</div>
  </div>
  <div class="pulse">
    <div class="pulse-card" style="border-color:rgba(239,68,68,.3);background:rgba(239,68,68,.07)"><div class="pulse-val" style="color:#ef4444">${red}</div><div class="pulse-lbl">Need Attention</div></div>
    <div class="pulse-card" style="border-color:rgba(245,158,11,.3);background:rgba(245,158,11,.06)"><div class="pulse-val" style="color:#f59e0b">${amber}</div><div class="pulse-lbl">Flag Review</div></div>
    <div class="pulse-card" style="border-color:rgba(16,185,129,.25);background:rgba(16,185,129,.05)"><div class="pulse-val" style="color:#10b981">${green}</div><div class="pulse-lbl">All Clear</div></div>
    <div class="pulse-card" style="border-color:rgba(255,255,255,.08);background:transparent"><div class="pulse-val" style="color:#4a6080">${noData}</div><div class="pulse-lbl">No Data</div></div>
  </div>
  ${storeHTML}
</div>
</body>
</html>`;

  const blob=new Blob([html],{type:'text/html'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download='Meridian_Morning_Brief_'+brief.date.toISOString().slice(0,10)+'.html';
  a.click();
  URL.revokeObjectURL(url);
}


window.onerror = function(msg, src, line, col, err) {
  document.getElementById('root').innerHTML =
    '<div style="padding:40px;font-family:monospace;background:#090e18;color:#e2e8f0;min-height:100vh">' +
    '<div style="color:#f59e0b;font-size:18px;font-weight:700;margin-bottom:16px">⚠ McForecast — Script Error</div>' +
    '<div style="color:#ef4444;font-size:13px;margin-bottom:8px">' + msg + '</div>' +
    '<div style="color:#94a3b8;font-size:11px">Line ' + line + ', Col ' + col + '</div>' +
    '<div style="color:#94a3b8;font-size:11px;margin-top:8px">' + (src||'') + '</div>' +
    '<div style="color:#64748b;font-size:10px;margin-top:16px">Open DevTools Console (F12) for full stack trace.</div>' +
    '</div>';
  return true;
};

// SECTION 1: CONFIG & STORE NAMES
const APP_VERSION = 'v5.37a';
const APP_BUILD   = '2026-05-02';
// STORE_NAMES, sName, sNameC → imported from ./constants.js


const CONTACTS={
  aboveStore:[
    {name:'Molly Mcgill',    email:'Molly@mcdok.com',     role:'Above Store'},
    {name:'Hugh Bonner',     email:'Hugh@mcdok.com',      role:'Above Store'},
    {name:'Fletcher Reaves', email:'Fletcher@mcdok.com',  role:'Above Store'},
  ],
  operators:{
    'Ryan Thorley':       {emails:['Ryan@mcdok.com','Ryan@emeraldarches.com'], org:'MCDOK/EA'},
    'Gary Mornhinweg':    {emails:['Gary@mcdok.com'],       org:'MCDOK'},
    'Rick/Kathy Thorley': {emails:['rick@mcdok.com','kathy@mcdok.com'], org:'MCDOK'},
    'Jacob Thorley':      {emails:['Jacob@emeraldarches.com'], org:'Emerald Arches'},
  },
  supervisors:{
    'Robert Spencer':     {email:'Robert@mcdok.com'},
    'Krystiana Langford': {email:'Krystiana@mcdok.com'},
    'Ashley Podroza':     {email:'Ashley@mcdok.com'},
    'Steven Vaughn':      {email:'Steven@mcdok.com'},
    'Amanda Estrada':     {email:'Amanda@mcdok.com'},
    'Brad Denley':        {email:'Brad@emeraldarches.com'},
  }
};

// Email routing for reports
function getReportRecipients(scope, stores, settings) {
  const above=CONTACTS.aboveStore.map(c=>c.email);
  const allOps=Object.values(CONTACTS.operators).flatMap(o=>o.emails);
  if(scope==='all')   return [...new Set([...above,...allOps])];
  if(scope==='MCDOK'){
    const ops=Object.values(CONTACTS.operators).filter(o=>o.org==='MCDOK').flatMap(o=>o.emails);
    return [...new Set([...above,...ops])];
  }
  if(scope==='Emerald Arches'){
    const ops=Object.values(CONTACTS.operators).filter(o=>o.org==='Emerald Arches').flatMap(o=>o.emails);
    return [...new Set([...above,...ops])];
  }
  if(scope==='patch'&&stores.length){
    const supName=stores[0].sup;
    const supEmail=supName?CONTACTS.supervisors[supName]?.email:'';
    const opEmails=stores.flatMap(s=>{
      const op=Object.entries(CONTACTS.operators).find(([k])=>k===s.operator||k.replace(' (EA)','')===s.operator);
      return op?op[1].emails:[];
    });
    return [...new Set([...above,...(supEmail?[supEmail]:[]),...opEmails])];
  }
  if(scope==='store'&&stores.length){
    const s=stores[0];
    const gmEmail=s.gmEmail?[s.gmEmail]:[];
    const supEmail=s.supEmail?[s.supEmail]:[];
    return [...new Set([...gmEmail,...supEmail,...above])];
  }
  return above;
}

const STORE_STAFF={
  '3708': {gm:'Cinthya Armedariz',  gmEmail:'Cinthya@mcdok.com',  sup:'Robert Spencer',    supEmail:'Robert@mcdok.com'},
  '5183': {gm:'Mukarram Norman',    gmEmail:'Mukarram@mcdok.com',  sup:'Krystiana Langford',supEmail:'Krystiana@mcdok.com'},
  '5985': {gm:'Stacey Hyatt',       gmEmail:'Stacey@mcdok.com',   sup:'Ashley Podroza',    supEmail:'Ashley@mcdok.com'},
  '6972': {gm:'Nick Rice',          gmEmail:'Nick@mcdok.com',     sup:'Robert Spencer',    supEmail:'Robert@mcdok.com'},
  '10422':{gm:'Ashleyh Hegwer',     gmEmail:'Ashleyh@mcdok.com',  sup:'Ashley Podroza',    supEmail:'Ashley@mcdok.com'},
  '10915':{gm:'Caleb Nunnelley',    gmEmail:'Caleb@mcdok.com',    sup:'Steven Vaughn',     supEmail:'Steven@mcdok.com'},
  '11657':{gm:'Jessie Hiatt',       gmEmail:'Jessie@mcdok.com',   sup:'Amanda Estrada',    supEmail:'Amanda@mcdok.com'},
  '13113':{gm:'Chris Abbey',        gmEmail:'Chris@mcdok.com',    sup:'Ashley Podroza',    supEmail:'Ashley@mcdok.com'},
  '18213':{gm:'Cora Bahling',       gmEmail:'Cora@mcdok.com',     sup:'Krystiana Langford',supEmail:'Krystiana@mcdok.com'},
  '20475':{gm:'Derek McGirt',       gmEmail:'Derek@mcdok.com',    sup:'Amanda Estrada',    supEmail:'Amanda@mcdok.com'},
  '24471':{gm:'Mystykal Abbey',     gmEmail:'Mystykal@mcdok.com', sup:'Robert Spencer',    supEmail:'Robert@mcdok.com'},
  '29760':{gm:'Heather Danforth',   gmEmail:'Heather@mcdok.com',  sup:'Krystiana Langford',supEmail:'Krystiana@mcdok.com'},
  '31357':{gm:'Brady Giambaresi',   gmEmail:'Brady@mcdok.com',    sup:'Amanda Estrada',    supEmail:'Amanda@mcdok.com'},
  '32525':{gm:'Aliyah Richardson',  gmEmail:'Aliyah@mcdok.com',   sup:'Robert Spencer',    supEmail:'Robert@mcdok.com'},
  '33109':{gm:'Rey Araiz',          gmEmail:'Rey@mcdok.com',      sup:'Ashley Podroza',    supEmail:'Ashley@mcdok.com'},
  '33222':{gm:'Carol Escusa',       gmEmail:'Carol@mcdok.com',    sup:'Krystiana Langford',supEmail:'Krystiana@mcdok.com'},
  '33704':{gm:'Candy Barksdale',    gmEmail:'Candy@mcdok.com',    sup:'Steven Vaughn',     supEmail:'Steven@mcdok.com'},
  '34222':{gm:'Hunter McKee',       gmEmail:'Hunter@mcdok.com',   sup:'Steven Vaughn',     supEmail:'Steven@mcdok.com'},
  '35064':{gm:'Lynsey Yahola',      gmEmail:'Lynsey@mcdok.com',   sup:'Steven Vaughn',     supEmail:'Steven@mcdok.com'},
  '43380':{gm:'Zukarr Eaves',       gmEmail:'Zukarr@mcdok.com',   sup:'Ashley Podroza',    supEmail:'Ashley@mcdok.com'},
  '6178': {gm:'Janet Jeter',        gmEmail:'Janet@emeraldarches.com',       sup:'Brad Denley',supEmail:'Brad@emeraldarches.com'},
  '6838': {gm:'Stephanie Harris',   gmEmail:'Stephanie@emeraldarches.com',   sup:'Brad Denley',supEmail:'Brad@emeraldarches.com'},
  '10034':{gm:'Harlee Yates',       gmEmail:'Harlee@emeraldarches.com',      sup:'Brad Denley',supEmail:'Brad@emeraldarches.com'},
  '35242':{gm:'Michele Nixon',      gmEmail:'Michele@emeraldarches.com',     sup:'Brad Denley',supEmail:'Brad@emeraldarches.com'},
  '37566':{gm:'Debra Herndon',      gmEmail:'Debra@emeraldarches.com',       sup:'Brad Denley',supEmail:'Brad@emeraldarches.com'},
  '38609':{gm:'Christina Bencokzy', gmEmail:'Christina@emeraldarches.com',   sup:'Brad Denley',supEmail:'Brad@emeraldarches.com'},
  '43701':{gm:'Shannon Hardin',     gmEmail:'Shannon@emeraldarches.com',     sup:'Brad Denley',supEmail:'Brad@emeraldarches.com'},
};




// Store coordinates for live weather forecasts (Open-Meteo API)

// Geographic distance (miles) between two store coords — used for regional event matching
function storeDistance(locA, locB) {
  const a=STORE_COORDS[locA], b=STORE_COORDS[locB];
  if(!a||!b||!a.lat||!b.lat) return Infinity;
  const R=3959, toR=d=>d*Math.PI/180;
  const dLat=toR(b.lat-a.lat), dLon=toR(b.lng-a.lng);
  const x=Math.sin(dLat/2)**2+Math.cos(toR(a.lat))*Math.cos(toR(b.lat))*Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
}
// Regional radius per org — Oklahoma stores span ~250mi, FL panhandle ~100mi
function regionalRadius(loc){return (STORE_COORDS[loc]&&STORE_COORDS[loc].org==='Emerald Arches')?80:150;}
// ════════════════════════════════════════════════════════════════════════════════
// RECURRING EVENTS ENGINE  (v4.200 — Calendar System)
// ════════════════════════════════════════════════════════════════════════════════
// Most disruptive non-holiday events repeat annually — school breaks, early-
// release days, recurring local festivals. Rather than re-tag every instance
// every year, a recurrence RULE is stored once and expanded into dated
// instances on demand. Instances are never auto-written to mf_events — they
// surface as pending confirmations (same review-before-trust principle as the
// rest of the event system) because school-calendar dates shift slightly
// year to year and a wrong auto-applied date would silently corrupt
// calibration rather than just being absent.
//
// Storage: localStorage 'mf_recurring_rules' — array of:
//   {id, label, type (EVENT_TYPES key), locs:[loc,...], month, day,
//    durationDays, active, source:'manual'|'ai_search', createdAt}
// ─────────────────────────────────────────────────────────────────────────────
function loadRecurringRules(){
  try{ return JSON.parse(localStorage.getItem('mf_recurring_rules')||'[]'); }catch{ return []; }
}
function saveRecurringRules(rules){
  try{ localStorage.setItem('mf_recurring_rules', JSON.stringify(rules)); }catch(e){}
}

// Expand one rule into a concrete {start,end} date range for a given year.
function expandRecurringRule(rule, year){
  if(!rule||rule.month==null||rule.day==null) return null;
  const start = new Date(year, rule.month-1, rule.day, 12);
  const dur = Math.max(1, rule.durationDays||1);
  const end = new Date(start.getTime() + (dur-1)*86400000);
  return {start, end};
}

// For every active rule, find instances in [today, today+monthsAhead] that
// are NOT already present in userEvents for ALL of the rule's target stores
// — these are the ones needing confirmation. A rule is considered "applied"
// for a given year+store only if every day in its range is already tagged.
function getRecurringInstancesNeedingConfirm(rules, userEvents, monthsAhead=14){
  const out=[];
  const now=new Date();
  const horizon=new Date(now.getTime()+monthsAhead*30*86400000);
  const thisYear=now.getFullYear();
  (rules||[]).filter(r=>r.active!==false).forEach(rule=>{
    for(const year of [thisYear, thisYear+1]){
      const span=expandRecurringRule(rule, year);
      if(!span) continue;
      if(span.end<now||span.start>horizon) continue;
      const missingLocs=(rule.locs||[]).filter(loc=>{
        let d=new Date(span.start);
        while(d<=span.end){
          const dk=dKey(d);
          if(!(userEvents[loc]&&userEvents[loc][dk])) return true; // at least one day untagged
          d=new Date(d.getTime()+86400000);
        }
        return false;
      });
      if(missingLocs.length) out.push({
        ruleId:rule.id, ruleLabel:rule.label, type:rule.type,
        start:span.start, end:span.end, locs:missingLocs,
      });
    }
  });
  return out;
}

// ════════════════════════════════════════════════════════════════════════════════
// PROACTIVE CALENDAR SEARCH  (v4.200 — Calendar System)
// ════════════════════════════════════════════════════════════════════════════════
// Forward-looking sibling of lookupMissEvent (which searches reactively, tied
// to an already-detected anomaly). This searches BEFORE anything has gone
// wrong — school district academic calendars and major local events are
// public, predictable, and findable months in advance. Same model/tool/auth
// pattern as lookupMissEvent for consistency; output is structured JSON since
// results need to become calendar entries, not a paragraph for a human to read.
// Results are NEVER auto-applied — they return as candidates for the pending
// review queue in CalendarManagerPanel.
// ─────────────────────────────────────────────────────────────────────────────
async function searchUpcomingEvents(loc){
  const apiKey=(()=>{try{return localStorage.getItem('mf_anthropic_key')||'';}catch{return '';}})();
  if(!apiKey) throw new Error('No Anthropic API key set. Add one in Settings → AI & Integrations.');

  const coord=STORE_COORDS[loc]||{};
  const city=coord.city||'';
  const state=coord.state||'OK';
  const stateFull = state==='FL'?'Florida':'Oklahoma';
  const storeName=STORE_NAMES[loc]||loc;

  const prompt='You are a McDonald\'s district analytics assistant building a proactive events calendar.\n\n'+
'Store: '+storeName+', '+city+', '+stateFull+'\n\n'+
'Search for information that could affect this restaurant\'s sales over the next 4 months:\n'+
'1. The academic calendar for the public school district serving '+city+', '+stateFull+' — find early-release days, no-school/teacher in-service days, and the start/end dates of any school breaks (Thanksgiving, winter break, spring break) for the current school year.\n'+
'2. Any major local events, festivals, concerts, or sports tournaments scheduled in or near '+city+' in the next 120 days that could meaningfully draw or divert foot traffic.\n\n'+
'Return ONLY a JSON array, no other text, no markdown code fences, no explanation. Each item must follow this exact shape:\n'+
'{"date":"YYYY-MM-DD","endDate":"YYYY-MM-DD or null","type":"school_early_release|school_no_school|school_break|school_start|school_end|event","label":"short label","confidence":"high|medium|low","sourceNote":"one short sentence on where this came from"}\n\n'+
'If you find nothing reliable, return an empty array: []';

  const res=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',
    headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
    body:JSON.stringify({
      model:'claude-haiku-4-5-20251001',
      max_tokens:2048,
      tools:[{type:'web_search_20250305',name:'web_search'}],
      messages:[{role:'user',content:prompt}]
    })});
  if(!res.ok){const err=await res.json().catch(()=>({}));throw new Error((err.error&&err.error.message)||'HTTP '+res.status);}
  const data=await res.json();
  const text=(data.content||[]).filter(b=>b.type==='text'&&b.text).map(b=>b.text).join('\n');

  // Defensive JSON extraction — model may wrap in prose or code fences despite instructions
  const first=text.indexOf('['), last=text.lastIndexOf(']');
  if(first===-1||last===-1||last<first) return [];
  let parsed;
  try{ parsed=JSON.parse(text.slice(first,last+1)); }catch(e){ return []; }
  if(!Array.isArray(parsed)) return [];

  // Validate + normalize each candidate; drop anything malformed rather than
  // surfacing garbage into the review queue
  return parsed.filter(c=>c&&c.date&&/^\d{4}-\d{2}-\d{2}$/.test(c.date)&&EVENT_TYPES[c.type]).map(c=>({
    date:c.date, endDate:(c.endDate&&/^\d{4}-\d{2}-\d{2}$/.test(c.endDate))?c.endDate:null,
    type:c.type, label:(c.label||EVENT_TYPES[c.type].label).slice(0,90),
    confidence:['high','medium','low'].includes(c.confidence)?c.confidence:'medium',
    sourceNote:(c.sourceNote||'').slice(0,180),
  }));
}

// ── Enhancement 3: MAPE Drift Detection ──────────────────────────────────────
// Returns {mape2w, mape6w, drift, status:'ok'|'warn'|'recalibrate'}

// SECTION 2: UTILITIES
const f$=n=>'$'+Math.round(n||0).toLocaleString();
// Shared table-header style (v4.195) — consolidated from three independently
// duplicated local copies that had drifted (two included textAlign:'right'
// baked in, one didn't). Removed textAlign entirely from the shared base:
// every th({...TH,...}) call site across the app was audited and confirmed
// to already set textAlign explicitly per-column, so this constant carries
// no implicit alignment that could silently differ by which copy a component
// happened to have. Update header styling here once instead of 2-3 places.
const TH={background:'var(--surf3)',padding:'5px 8px',fontSize:'8px',
  textTransform:'uppercase',letterSpacing:'.3px',color:'var(--text2)',
  borderBottom:'.5px solid var(--bdr)',whiteSpace:'nowrap'};
const fPct=(n,d=1)=>((n||0)>=0?'+':'')+(((n||0)*100).toFixed(d))+'%';
const fP=(n,d=2)=>(n||0)?((n*100).toFixed(d)+'%'):'—';
const fN=(n,d=1)=>n!=null?n.toFixed(d):'—';

// DOW_BASE → imported from ./constants.js
const grade=s=>s>=90?'A':s>=80?'B':s>=70?'C':s>=60?'D':'F';
const gLbl=s=>s>=90?'Elite':s>=80?'Strong':s>=70?'Solid':s>=60?'Developing':'Needs Attn';
const gCol=s=>s>=90?'#10b981':s>=80?'#84cc16':s>=70?'#eab308':s>=60?'#f97316':'#ef4444';
const gBg=s=>s>=90?'rgba(16,185,129,.09)':s>=80?'rgba(132,204,18,.09)':s>=70?'rgba(234,179,8,.09)':s>=60?'rgba(249,115,22,.09)':'rgba(239,68,68,.09)';
const gBdr=s=>s>=90?'#065f46':s>=80?'#14532d':s>=70?'#78350f':s>=60?'#7c2d12':'#7f1d1d';

function parseXLDate(v){
  if(!v&&v!==0) return null;
  if(v instanceof Date){
    // Shift to noon UTC to survive timezone display in any US timezone
    const d=new Date(v); d.setUTCHours(12,0,0,0); return d;
  }
  if(typeof v==='number'){
    // Excel serial → UTC midnight → shift to noon to survive tz display
    const d=new Date((v-25569)*86400000+43200000); // +12h
    return d;
  }
  // String date like '2024-11-28' — parse as local noon
  const parts=String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(parts) return new Date(+parts[1],+parts[2]-1,+parts[3],12,0,0);
  const d=new Date(v); return isNaN(d)?null:d;
}
function findCol(hdrs,...names){
  // Exact match first (all names), then substring fallback (all names).
  // Normalizes non-breaking spaces and extra whitespace common in QSRSoft exports.
  const norm=s=>String(s||'').replace(/[\u00a0\u2009\u202f\u2060]/g,' ').replace(/\s+/g,' ').trim().toLowerCase();
  for(const name of names){
    const t=norm(name);
    for(let i=0;i<hdrs.length;i++){if(hdrs[i]!=null&&norm(String(hdrs[i]))===t)return i;}
  }
  for(const name of names){
    const t=norm(name);if(t.length<=3)continue;
    for(let i=0;i<hdrs.length;i++){if(hdrs[i]!=null&&norm(String(hdrs[i])).includes(t))return i;}
  }
  return -1;
}
// fc() — findCol with fallback chain that correctly handles column index 0
function fc(h,...names){for(const n of names){const i=findCol(h,n);if(i>=0)return i;}return -1;}
// fcx() — exact match version: finds column where header equals name exactly (not substring)
function fcx(h,...names){for(const n of names){const s=n.toLowerCase();for(let i=0;i<h.length;i++){const v=h[i];if(v&&String(v).toLowerCase().trim()===s)return i;}}return -1;}
function autoHdrRow(raw,max=5){for(let i=0;i<Math.min(max,raw.length);i++){const r=raw[i];if(r&&r.some(c=>c&&String(c).toLowerCase().trim()==='loc'))return i;}return 0;}
function parseRaw(wb,sheet){const ws=wb.Sheets[sheet]||wb.Sheets[wb.SheetNames[0]];if(!ws)return[];return XLSX.utils.sheet_to_json(ws,{header:1,defval:null,raw:true});}
function parsePct(v){if(v===null||v===undefined||v==='')return 0;if(typeof v==='number')return Math.abs(v)>1.5?v/100:v;const s=String(v).replace('%','').trim();const n=parseFloat(s);return isNaN(n)?0:(Math.abs(n)>1.5?n/100:n);}

// Date helpers

// MERIDIAN PERSISTENT STORAGE — implemented in src/db/index.js (Dexie)

// NEW FORECAST MODELS  (v190) — Adaptive Ensemble, EWMA DOW, Auto-DI
// Validated against Lifelenz Sep 2025–May 2026: AE district avg 9.29%
// vs Lifelenz 9.51% on identical evaluation window. AE wins 16/27 stores.

// Per-store auto-calibrated DI parameters (from Python grid search, recency-weighted)

// ── Labor % color helper ─────────────────────
// Returns {color, arrow, label} based on distance from target
function laborColor(laborPct, tLabor, settings) {
  if(!laborPct||!tLabor) return {color:'#94a3b8',arrow:'',label:'—'};
  const s = settings||DEF_SETTINGS;
  const green = (s.laborGreenPct!=null?s.laborGreenPct:0.5)/100;
  const yellow= (s.laborYellowPct!=null?s.laborYellowPct:1.5)/100;
  const diff  = laborPct - tLabor;            // positive = over target (bad), negative = under (good)
  const absDiff = Math.abs(diff);
  const arrow = diff > 0.001 ? ' ▲' : diff < -0.001 ? ' ▼' : '';
  if(absDiff <= green)  return {color:'#10b981', arrow, label:'On Target'};
  if(absDiff <= yellow) return {color:'#f59e0b', arrow, label: diff>0?'Slightly High':'Slightly Low'};
  return {color:'#ef4444', arrow, label: diff>0?'Over Target':'Under Target'};
}

// ── Live weather forecast (Open-Meteo — free, no API key) ──────────
async function fetchHistoricalWeather(locs, startDate, endDate) {
  // Auto-fetch historical weather from Open-Meteo for any store without Mesonet data
  const results = [];
  for(const loc of locs) { // Open-Meteo is free with no hard rate limitlimiting
    const sc = STORE_COORDS[loc];
    if(!sc) continue;
    try {
      const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${sc.lat}&longitude=${sc.lon||sc.lng}&start_date=${startDate}&end_date=${endDate}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max&temperature_unit=fahrenheit&windspeed_unit=mph&precipitation_unit=inch&timezone=America%2FChicago`;
      const r = await fetch(url);
      if(!r.ok) continue;
      const data = await r.json();
      if(data.daily) {
        data.daily.time.forEach((dt, i) => {
          results.push({
            loc, date: new Date(dt+'T12:00:00'),
            tmax: data.daily.temperature_2m_max[i]||0,
            tmin: data.daily.temperature_2m_min[i]||0,
            rain: data.daily.precipitation_sum[i]||0,
            wmax: data.daily.windspeed_10m_max[i]||0,
            source: 'open-meteo-hist'
          });
        });
      }
    } catch(e) { /* silent fail */ }
  }
  // Store results in _wxCache so ForecastRow can access them
  for(const row of results){
    const key = row.loc+'_'+dKey(row.date);
    if(!_wxCache[key]) _wxCache[key] = {
      tmax:row.tmax, tmin:row.tmin, rain:row.rain, wmax:row.wmax, source:'open-meteo-hist'
    };
  }
  return results;
}



// SECTION 3: FILE DETECTOR

// ── Restaurant Projections file parser ──────────────────────────────────────
function parseProjectionsFile(wb, filename) {
  const rows = [];
  const ws = wb.Sheets[wb.SheetNames[0]];
  if(!ws) return [];
  const raw = XLSX.utils.sheet_to_json(ws, {header:1, defval:null, raw:true});
  // Find header row (has 'Restaurant' and 'Sales Projection')
  let hi = -1;
  for(let i=0;i<Math.min(raw.length,5);i++){
    const r = raw[i]||[];
    const joined = r.map(c=>String(c||'').toLowerCase()).join(' ');
    if(joined.includes('restaurant') && (joined.includes('projection') || joined.includes('qsr soft'))) {
      hi = i; break;
    }
  }
  if(hi < 0) return [];
  const hdr = (raw[hi]||[]).map(c=>String(c||'').toLowerCase());
  const ci = k => hdr.findIndex(h=>h.includes(k));
  const C = {
    rest: ci('restaurant'),
    proj: ci('sales projection'),
    qsr:  ci('qsr soft'),
    labor:ci('crew labor'),
    tpph: ci('tpph'),
    bonus:ci('bonus crew'),
    food: ci('base food'),
  };
  for(let i=hi+1;i<raw.length;i++){
    const row = raw[i];
    if(!row||!row[C.rest]) continue;
    const restStr = String(row[C.rest]||'');
    const loc = restStr.split(' - ')[0].trim();
    if(!loc||!/^\d{4,6}$/.test(loc)) continue;
    const proj = C.proj>=0 ? parseFloat(String(row[C.proj]||0).replace(/,/g,''))||0 : 0;
    const qsr  = C.qsr>=0  ? parseFloat(row[C.qsr])||0  : 0;
    const lab  = C.labor>=0? parseFloat(row[C.labor])||0 : 0;
    const tpph = C.tpph>=0 ? parseFloat(row[C.tpph])||0  : 0;
    rows.push({loc, proj, qsr, labor:lab, tpph});
  }
  return rows;
}

// ── Apply parsed projections to DEFAULT_TARGETS ───────────────────────────
function applyProjectionsToTargets(rows, label){
  let applied = 0;
  rows.forEach(r=>{
    if(!DEFAULT_TARGETS[r.loc]) return;
    const upd = {};
    if(r.proj>0)  { upd.tJuneProj=r.proj; upd.tOperatorProj=r.proj; }
    if(r.qsr>0)   upd.tQSRSoftProj=r.qsr;
    if(r.labor>0) upd.tJuneLaborPct=r.labor;
    if(r.tpph>0)  upd.tJuneTpph=r.tpph;
    Object.assign(DEFAULT_TARGETS[r.loc], upd);
    applied++;
  });
  console.log(`[Meridian] Projections applied: ${applied} stores from ${label}`);
  return applied;
}

function sniffSheetType(wb) {
  // Peek at first sheet headers to determine data type from content
  const ws = wb.Sheets[wb.SheetNames[0]];
  if(!ws) return null;
  const raw = XLSX.utils.sheet_to_json(ws, {header:1, defval:null, raw:true});
  const hdrs = (raw[0]||[]).concat(raw[1]||[]).map(h=>String(h||'').toLowerCase());
  const joined = hdrs.join(' ');
  // OpsData signature: OEPE, KVS, DT Parked
  if(joined.includes('oepe') || joined.includes('kvs time') || joined.includes('dt parked'))
    return {type:'ops', label:'OpsData (auto-detected from content)', confidence:'high'};
  // ControlsData signature: cash over/short, t-red, discount
  if(joined.includes('cash over') || joined.includes('t-red') || joined.includes('discount pct') || joined.includes('drawer opens'))
    return {type:'ctrl', label:'ControlsData (auto-detected from content)', confidence:'high'};
  // Labor signature: punched labor, opportunity cost, projected sales
  if(joined.includes('punched labor') || joined.includes('opportunity cost') || joined.includes('projected sales') || joined.includes('salaried manager'))
    return {type:'labor', label:'Labor Analysis (auto-detected from content)', confidence:'high'};
  // Weather signature: tmax, tmin, rain
  if(joined.includes('tmax') || joined.includes('tmin') || (joined.includes('rain') && joined.includes('wmax')))
    return {type:'weather', label:'WeatherData (auto-detected from content)', confidence:'high'};
  // Peaks signature: time slice, oepe no parked
  if(joined.includes('time slice') || joined.includes('oepe no parked'))
    return {type:'peaks', label:'3 Peaks (auto-detected from content)', confidence:'high'};
  // Register audit signature: emp name, drawer sales, t-red before
  if(joined.includes('emp name') || joined.includes('drawer sales') || joined.includes('t-red before cnt'))
    return {type:'register', label:'Register Audit (auto-detected from content)', confidence:'high'};
  // Trends signature: all net sales, stw gc
  if(joined.includes('all net sales') || (joined.includes('stw gc') && joined.includes('average check')))
    return {type:'trends', label:'Trends Report (auto-detected from content)', confidence:'high'};
  // Projections file signature: 'Sales Projection' or 'QSR Soft' in headers
  if(joined.includes('sales projection') || joined.includes('qsr soft sales') || joined.includes('mcdok') && joined.includes('projection'))
    return {type:'projections', label:'Restaurant Projections (auto-detected)', confidence:'high'};
  return null;
}

function detectType(filename, wb){
  const fn=filename.toLowerCase().replace(/\.[^.]+$/,'').trim();
  const ext=filename.split('.').pop().toLowerCase();
  const dm=filename.match(/(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})/i);
  const dr=dm?{from:dm[1],to:dm[2]}:null;
  // Mesonet: all-digit filename
  if(/^\d+$/.test(fn)&&(ext==='csv'||ext==='txt'))return{type:'weather',label:'WeatherData (Mesonet)',dr,confidence:'high'};
  // Combined Meridian workbook
  if(fn.startsWith('mcforecast pro data')||fn.includes('mcforecast pro data'))return{type:'combined',label:'Meridian Data (4 sheets)',dr,confidence:'high'};
  // *** NEW: Operations Report (combined Sales/Service/Controls/FOB) ***
  if(fn.startsWith('operations report')||fn.includes('operations report')||fn.startsWith('operations_report')||fn.includes('operations_report'))return{type:'ops_report',label:'Operations Report (Sales+Service+Controls+FOB)',dr,confidence:'high'};
  // 3 Peaks
  if(fn.startsWith('3 peaks')||fn.includes('3 peaks'))return{type:'peaks',label:'3 Peaks Report',dr,confidence:'high'};
  // Register Audit
  if(fn.startsWith('register audit')||fn.includes('register audit'))return{type:'register',label:'Register Audit',dr,confidence:'high'};
  // Trends
  if(fn.startsWith('trends')||fn.includes('trends'))return{type:'trends',label:'Trends Report',dr,confidence:'high'};
  // Records
  if(fn.startsWith('records')||fn.includes('records'))return{type:'records',label:'Records Report',dr,confidence:'high'};
  // Shift Manager Summary
  if(fn.includes('shift manager')||fn.includes('shift mgr'))return{type:'shiftmgr',label:'Shift Manager Summary',dr,confidence:'high'};
  // ── DAR — Daily Activity Report ──
  if(fn.includes('daily activity report')||fn.includes('daily_activity'))return{type:'dar',label:'Daily Activity Report (Hourly)',dr,confidence:'high'};
  // ── Product Mix ──
  if(fn.includes('product mix')||fn.includes('product_mix')||fn.includes('pmix'))return{type:'pmix',label:'Product Mix',dr,confidence:'high'};
  // Labor Analysis
  if(fn.startsWith('labor analysis')||fn.includes('labor analysis'))return{type:'labor',label:'Labor Analysis',dr,confidence:'high'};
  // Service → OpsData
  // Service → OpsData (QSRSoft sheet/file naming)
  if(fn.startsWith('service ')||fn==='service')return{type:'ops',label:'OpsData (Service)',dr,confidence:'high'};
  // Controls → ControlsData (QSRSoft sheet/file naming)
  // NOTE: In the 4-sheet workbook Service=OpsData, Controls=ControlsData
  // Standalone downloads follow the same convention
  if(fn.startsWith('controls ')||fn==='controls')return{type:'ctrl',label:'ControlsData (Controls)',dr,confidence:'high'};
  // OpsTargets
  if(fn.includes('target'))return{type:'targets',label:'OpsTargets',dr,confidence:'high'};
  // Fuzzy filename matches
  if(fn.includes('opsdata')||fn.includes('ops data'))return{type:'ops',label:'OpsData (fuzzy)',dr,confidence:'medium'};
  if(fn.includes('service')||fn.includes('oepe')||fn.includes('speed'))return{type:'ops',label:'OpsData (fuzzy)',dr,confidence:'medium'};
  if(fn.includes('control')||fn.includes('cash'))return{type:'ctrl',label:'ControlsData (fuzzy)',dr,confidence:'medium'};
  if(fn.includes('labor'))return{type:'labor',label:'Labor (fuzzy)',dr,confidence:'medium'};
  if(fn.includes('weather')||fn.includes('mesonet'))return{type:'weather',label:'WeatherData (fuzzy)',dr,confidence:'medium'};
  // Inventory Summary and Usage (paper/food/condiment)
  if(fn.includes('inventory summary')&&fn.includes('usage'))return{type:'inventory',label:'Inventory Summary & Usage',confidence:'high',loc:(()=>{const m=filename.match(/^(\d{4,6})\s*[-\u2013]/);return m?m[1]:null;})()};
  // Projections file: detected by filename before sniff
  if(fn.includes('projection')&&(filename.endsWith('.xlsm')||filename.endsWith('.xlsx')))
    return{type:'projections',label:'Restaurant Projections',dr,confidence:'high'};
  // Last resort: content-sniff the actual file headers
  if(wb){const sniffed=sniffSheetType(wb);if(sniffed)return{...sniffed,dr};}
  return{type:'unknown',label:'Unknown — select type below',dr,confidence:'low'};
}

async function readFile(file){
  return new Promise((res,rej)=>{
    const r=new FileReader();
    const isCSV=file.name.toLowerCase().endsWith('.csv')||file.name.toLowerCase().endsWith('.txt');
    if(isCSV){
      r.onload=e=>{try{res(XLSX.read(e.target.result,{type:'string',raw:true}));}catch(err){rej(err);}};
      r.readAsText(file);
    }else{
      r.onload=e=>{try{res(XLSX.read(new Uint8Array(e.target.result),{type:'array',cellDates:false,raw:true}));}catch(err){rej(err);}};
      r.readAsArrayBuffer(file);
    }
  });
}


// SECTION 4: PARSERS
function parseLaborData(wb,sheet,defaultDateOverride){
  // Accept 'Sales' (new Operations Report format) OR 'Labor Analysis' (legacy)
  if(!sheet){
    const names=(wb.SheetNames||[]);
    const salesSheet = names.find(s=>s.toLowerCase()==='sales'||s.toLowerCase().startsWith('sales '));
    const laborSheet = names.find(s=>s.toLowerCase().startsWith('labor analysis'));
    sheet = salesSheet || laborSheet || names[0] || 'Labor Analysis';
  }
  const raw=parseRaw(wb,sheet),hi=autoHdrRow(raw),h=raw[hi]||[];
  // Detect period-summary format: Operations Report summary has no Business Date column.
  // Extract "to" date from sheet name (e.g. "Sales 2026-05-01 to 2026-05-14").

  // ── Period-summary date handling ─────────────────────────────────────────
  // Operations Report sheets have no Business Date column — they're aggregated
  // over the period. Use defaultDateOverride (from filename) → sheet name → today.
  const _dateColIdx=fc(h,'Business Date','Date','Period');
  const _sheetDates=(sheet||'').match(/(\d{4}-\d{2}-\d{2})/g)||[];
  const _summaryDate=_dateColIdx<0
    ?(defaultDateOverride||(_sheetDates.length?new Date(_sheetDates[_sheetDates.length-1]+'T12:00:00'):new Date()))
    :null;
  const C={loc:fc(h,'Loc','Store'),date:_dateColIdx,
    sales:fc(h,'Product Sales'),allNetSales:fc(h,'All Net Sales'),
    proj:findCol(h,'Projected Sales'),gc:fc(h,'STW GC','GC'),actualGC:findCol(h,'Actual GC'),
    opp:fc(h,'Opportunity Cost %'),oppD:fc(h,'Opportunity Cost $'),
    avgChk:fc(h,'Average Check'),
    tpph:findCol(h,'TPPH'),spph:findCol(h,'SPPH'),avn:fc(h,'Act vs Need'),
    labor:fc(h,'Punched Labor %'),crewLaborPct:fc(h,'Crew Labor %'),
    totalLaborPct:fc(h,'Total Labor %'),
    otHrs:fc(h,'OT Hrs'),otD:fc(h,'OT $'),
    actHrs:fc(h,'Act Hrs'),avgRate:fc(h,'Avg Rate'),
    salMgr:fc(h,'Salaried Manager Hours'),
    fixCon:fc(h,'Fixed Contract Hours'),fixSch:fc(h,'Fixed Labor Hours Scheduled'),
    varNeed:fc(h,'Variable Labor Hours Needed'),
    flrNeed:fc(h,'Floor Management Hours Needed'),flrSch:fc(h,'Floor Hours Sched'),
    projTot:fc(h,'Projected Total Hrs'),totNeed:fc(h,'Total Hours Needed'),
    // ── Channel Sales (from Operations Report Sales sheet) ──
    salesVsLYPct:findCol(h,'All Net Sales +/- %'),
    dtSales:findCol(h,'DT Sales'),dtGC:findCol(h,'DT GC'),dtAvgChk:findCol(h,'DT Average Check'),dtPctTotal:findCol(h,'DT % of Total Sales'),
    bfSales:findCol(h,'Breakfast All Net Sales'),bfGC:findCol(h,'Breakfast GC'),bfAvgChk:findCol(h,'Breakfast Average Check'),bfPctTotal:findCol(h,'Breakfast % of Total Sales'),
    delivSales:findCol(h,'McDelivery Net Sales'),delivGC:findCol(h,'McDelivery GC'),delivAvgChk:findCol(h,'McDelivery Average Check'),delivPctTotal:findCol(h,'McDelivery % of Total Sales'),
    mopSales:findCol(h,'MOP Sales'),mopGC:findCol(h,'MOP GCs'),mopAvgChk:findCol(h,'MOP Average Check ','MOP Average Check'),mopPctTotal:findCol(h,'MOP Sales %'),
    kioskSales:findCol(h,'Kiosk All Net Sales'),kioskGC:findCol(h,'Kiosk GC'),kioskAvgChk:findCol(h,'Kiosk Average Check'),kioskPctTotal:findCol(h,'Kiosk % of Total Sales'),
    eatInSales:findCol(h,'Eat in Sales'),eatInGC:findCol(h,'Eat in GC'),
    inStoreSales:findCol(h,'In-Store All Net Sales'),inStoreGC:findCol(h,'In-Store GC'),inStorePctTotal:findCol(h,'In-Store % of Total Sales'),
    fcSales:findCol(h,'FC All Net Sales'),fcGC:findCol(h,'FC GC'),fcPctTotal:findCol(h,'FC % of Total Sales')}; 
  const rows=[];
  for(let i=hi+1;i<raw.length;i++){
    const r=raw[i];if(!r)continue;
    const loc=String(r[C.loc]||'').trim();if(!loc||!/^\d+$/.test(loc))continue;
    const dt=C.date>=0?parseXLDate(r[C.date]):_summaryDate;if(!dt)continue;
    const flrNeed=parseFloat(r[C.flrNeed])||0;
    const flrSch=parseFloat(r[C.flrSch])||0;
    const laborPctVal=parsePct(r[C.labor])||parsePct(r[C.crewLaborPct])||parsePct(r[C.totalLaborPct]);
    rows.push({loc,date:dt,
      sales:parseFloat(r[C.sales])||parseFloat(r[C.allNetSales])||0,
      allNetSales:parseFloat(r[C.allNetSales])||0,
      projSales:parseFloat(r[C.proj])||0,
      gc:parseFloat(r[C.gc])||0,actualGC:parseFloat(r[C.actualGC])||0,
      oppCostPct:parsePct(r[C.opp]),oppCostDollar:parseFloat(r[C.oppD])||0,
      avgCheck:parseFloat(r[C.avgChk])||0,tpph:parseFloat(r[C.tpph])||0,spph:parseFloat(r[C.spph])||0,
      actVsNeed:parseFloat(r[C.avn])||0,laborPct:laborPctVal,
      otHrs:parseFloat(r[C.otHrs])||0,otDollar:parseFloat(r[C.otD])||0,
      actHrs:parseFloat(r[C.actHrs])||0,avgRate:parseFloat(r[C.avgRate])||0,
      salaryMgrHrs:parseFloat(r[C.salMgr])||0,
      fixedContractHrs:parseFloat(r[C.fixCon])||0,fixedSchedHrs:parseFloat(r[C.fixSch])||0,
      variableNeeded:parseFloat(r[C.varNeed])||0,
      floorMgmtNeeded:flrNeed,floorHrsSched:flrSch,
      floorCompliance:flrNeed>0?flrSch/flrNeed:null,
      // Channel sales breakdown
      salesVsLYPct:parseFloat(r[C.salesVsLYPct])||null,
      dtSales:parseFloat(r[C.dtSales])||0,dtGC:parseFloat(r[C.dtGC])||0,dtAvgChk:parseFloat(r[C.dtAvgChk])||0,dtPctTotal:parsePct(r[C.dtPctTotal]),
      bfSales:parseFloat(r[C.bfSales])||0,bfGC:parseFloat(r[C.bfGC])||0,bfAvgChk:parseFloat(r[C.bfAvgChk])||0,bfPctTotal:parsePct(r[C.bfPctTotal]),
      delivSales:parseFloat(r[C.delivSales])||0,delivGC:parseFloat(r[C.delivGC])||0,delivAvgChk:parseFloat(r[C.delivAvgChk])||0,delivPctTotal:parsePct(r[C.delivPctTotal]),
      mopSales:parseFloat(r[C.mopSales])||0,mopGC:parseFloat(r[C.mopGC])||0,mopAvgChk:parseFloat(r[C.mopAvgChk])||0,mopPctTotal:parsePct(r[C.mopPctTotal]),
      kioskSales:parseFloat(r[C.kioskSales])||0,kioskGC:parseFloat(r[C.kioskGC])||0,kioskAvgChk:parseFloat(r[C.kioskAvgChk])||0,kioskPctTotal:parsePct(r[C.kioskPctTotal]),
      eatInSales:parseFloat(r[C.eatInSales])||0,eatInGC:parseFloat(r[C.eatInGC])||0,
      inStoreSales:parseFloat(r[C.inStoreSales])||0,inStoreGC:parseFloat(r[C.inStoreGC])||0,inStorePctTotal:parsePct(r[C.inStorePctTotal]),
      fcSales:parseFloat(r[C.fcSales])||0,fcGC:parseFloat(r[C.fcGC])||0,fcPctTotal:parsePct(r[C.fcPctTotal])});
  }
  return rows;
}

function parseOpsData(wb,sheet,defaultDateOverride){
  // Accept 'Service' (new Operations Report format) OR 'OpsData' (legacy)
  if(!sheet){
    const names=(wb.SheetNames||[]);
    const svcSheet  = names.find(s=>s.toLowerCase()==='service'||s.toLowerCase().startsWith('service '));
    const opsSheet  = names.find(s=>s.toLowerCase()==='opsdata'||s.toLowerCase().startsWith('opsdata'));
    sheet = svcSheet || opsSheet || names[0] || 'OpsData';
  }
  const raw=parseRaw(wb,sheet),hi=autoHdrRow(raw),h=raw[hi]||[];
  // Detect period-summary format: Operations Report summary has no Business Date column.
  // Extract "to" date from sheet name (e.g. "Sales 2026-05-01 to 2026-05-14").

  // ── Period-summary date handling ─────────────────────────────────────────
  // Operations Report sheets have no Business Date column — they're aggregated
  // over the period. Use defaultDateOverride (from filename) → sheet name → today.
  const _dateColIdx=fc(h,'Business Date','Date','Period');
  const _sheetDates=(sheet||'').match(/(\d{4}-\d{2}-\d{2})/g)||[];
  const _summaryDate=_dateColIdx<0
    ?(defaultDateOverride||(_sheetDates.length?new Date(_sheetDates[_sheetDates.length-1]+'T12:00:00'):new Date()))
    :null;
  const C={loc:fc(h,'Loc','Store'),date:_dateColIdx,oepe:findCol(h,'OEPE W/O Parked'),
    park:findCol(h,'DT Parked %'),kvst:findCol(h,'KVS Time Per GC'),
    kvsu:findCol(h,'KVS Healthy Usage'),r2p:findCol(h,'R2P')};
  const rows=[];
  for(let i=hi+1;i<raw.length;i++){
    const r=raw[i];if(!r)continue;
    const loc=String(r[C.loc]||'').trim();if(!loc||!/^\d+$/.test(loc))continue;
    const dt=C.date>=0?parseXLDate(r[C.date]):_summaryDate;if(!dt)continue;const kv=r[C.kvsu];
    if(typeof kv==='number')kvsu=kv>1?kv/100:kv;
    else if(kv){const s=String(kv).replace('%','').replace("'",'').trim();kvsu=parseFloat(s)>1?parseFloat(s)/100:parseFloat(s)||0;}
    rows.push({loc,date:dt,oepe:parseFloat(r[C.oepe])||0,park:parsePct(r[C.park]),
      kvst:parseFloat(r[C.kvst])||0,kvsu,r2p:parseFloat(r[C.r2p])||0});
  }
  return rows;
}

function parseCtrlData(wb,sheet,defaultDateOverride){
  // Accept 'Controls' (new Operations Report format) OR 'ControlsData' (legacy)
  if(!sheet){
    const names=(wb.SheetNames||[]);
    const ctrlSheet = names.find(s=>s.toLowerCase()==='controls'||s.toLowerCase().startsWith('controls '));
    const ctrlData  = names.find(s=>s.toLowerCase().startsWith('controlsdata'));
    sheet = ctrlSheet || ctrlData || names[0] || 'ControlsData';
  }
  const raw=parseRaw(wb,sheet),hi=autoHdrRow(raw),h=raw[hi]||[];
  // ── Period-summary date handling ─────────────────────────────────────────
  // Operations Report sheets have no Business Date column — they're aggregated
  // over the period. Use defaultDateOverride (from filename) → sheet name → today.
  const _dateColIdx=fc(h,'Business Date','Date','Period');
  const _sheetDates=(sheet||'').match(/(\d{4}-\d{2}-\d{2})/g)||[];
  const _summaryDate=_dateColIdx<0
    ?(defaultDateOverride||(_sheetDates.length?new Date(_sheetDates[_sheetDates.length-1]+'T12:00:00'):new Date()))
    :null;
  const C={loc:fc(h,'Loc','Store'),date:_dateColIdx,
    // Cash
    cashOS:fc(h,'Cash Over/Short %','Cash Over/ Short %','Cash O/S %'),
    cashOSAmt:fc(h,'Cash Over/Short','Cash Over/ Short $'),
    // T-Reds
    tRedAPct:fc(h,'T-Red After Pct','T-Red After %'),
    tRedACnt:fc(h,'T-Red After Cnt','T-Red After Count'),
    tRedBPct:fc(h,'T-Red Before Pct','T-Red Before %'),
    tRedBCnt:fc(h,'T-Red Before Cnt','T-Red Before Count'),
    // POS / Refunds
    posCnt:fc(h,'POS Overrings Cnt','POS Overrings'),
    posAmt:fc(h,'POS Overrings Amt','POS Overrings $'),
    // OT — in new format at col 2
    otHrs:fc(h,'OT Hrs','OT Hours'),otD:fc(h,'OT $','OT Dollar'),
    // Labor — new format has both; prefer Actual Labor %
    actLabor:fc(h,'Actual Labor %','Punched Labor %','Labor %'),
    punchLabor:fc(h,'Punched Labor %','Punched Labor'),
    // Operations
    avn:fc(h,'Act vs Need','Act vs Need %'),
    tpph:fc(h,'TPPH','Trans Per Person Hour'),
    spph:findCol(h,'SPPH'),
    avgRate:fc(h,'Avg Rate','Avg Rate of Pay'),
    actHrs:fc(h,'Act Hrs','Actual Hours'),
    crewHrs:fc(h,'Crew Labor Hours','Crew Hours'),
    // Promo group (separate from Discount group in Operations Report)
    promoPct:fc(h,'Promo Pct','Promo %'),
    promoAmt:fc(h,'Promo Amt','Promo $'),
    promoCnt:findCol(h,'Promo Cnt'),
    // Discount group (separate from Promo)
    discPct:fc(h,'Discount Pct','Discount %'),
    discAmt:fc(h,'Discount Amt','Discount $'),
    discCnt:findCol(h,'Discount Cnt'),
    // Refunds
    cashRefCnt:fc(h,'Cash Refund Cnt'),cashRefAmt:fc(h,'Cash Refund Amt'),
    cashlessRefCnt:fc(h,'Cashless Refund Cnt'),cashlessRefAmt:fc(h,'Cashless Refund Amt'),
    manRef:fc(h,'Manual Refund/Overring Amt','Manual Refund/Overring $','Manual Refund'),
    // Drawer
    drawer:findCol(h,'Drawer Opens'),
    // Meals
    empMeal:fc(h,'Emp Meal Amt','Emp Meal $'),mgrMeal:fc(h,'Manager Meal Amt','Mgr Meal $'),
    // Cash management
    petty:fc(h,'Petty Cash Amt','Petty Cash $'),deposit:fc(h,'Deposit Amt','Deposit $'),
    salMgr:fc(h,'Salaried Manager Hours','Salaried Mgr Hrs')};
  const rows=[];
  for(let i=hi+1;i<raw.length;i++){
    const r=raw[i];if(!r)continue;
    const loc=String(r[C.loc]||'').trim();if(!loc||!/^\d+$/.test(loc))continue;
    const dt=C.date>=0?parseXLDate(r[C.date]):_summaryDate;if(!dt)continue;
    const pettyAmt=parseFloat(r[C.petty])||0;
    // Prefer Actual Labor % (punched hours ÷ sales), fall back to Punched Labor %
    const laborPctVal = parsePct(r[C.actLabor]) || parsePct(r[C.punchLabor]);
    rows.push({loc,date:dt,
      cashOSPct:parsePct(r[C.cashOS]),cashOSAmt:parseFloat(r[C.cashOSAmt])||0,
      tRedAPct:parsePct(r[C.tRedAPct]),tRedACnt:parseFloat(r[C.tRedACnt])||0,
      tRedBPct:parsePct(r[C.tRedBPct]),tRedBCnt:parseFloat(r[C.tRedBCnt])||0,
      posOverCnt:parseFloat(r[C.posCnt])||0,posOverAmt:parseFloat(r[C.posAmt])||0,
      otHrs:parseFloat(r[C.otHrs])||0,otDollar:parseFloat(r[C.otD])||0,
      laborPct:laborPctVal,actVsNeed:parseFloat(r[C.avn])||0,
      discPct:parsePct(r[C.discPct]),discAmt:parseFloat(r[C.discAmt])||0,
      discCnt:parseFloat(r[C.discCnt])||0,
      promoPct:parsePct(r[C.promoPct]),promoAmt:parseFloat(r[C.promoAmt])||0,
      promoCnt:parseFloat(r[C.promoCnt])||0,
      cashRefCnt:parseFloat(r[C.cashRefCnt])||0,cashRefAmt:parseFloat(r[C.cashRefAmt])||0,
      cashlessRefCnt:parseFloat(r[C.cashlessRefCnt])||0,cashlessRefAmt:parseFloat(r[C.cashlessRefAmt])||0,
      manualRefAmt:parseFloat(r[C.manRef])||0,drawerOpens:parseFloat(r[C.drawer])||0,
      tpph:parseFloat(r[C.tpph])||0,spph:parseFloat(r[C.spph])||0,
      avgRate:parseFloat(r[C.avgRate])||0,
      empMealAmt:parseFloat(r[C.empMeal])||0,mgrMealAmt:parseFloat(r[C.mgrMeal])||0,
      actHrs:parseFloat(r[C.actHrs])||0,crewHrs:parseFloat(r[C.crewHrs])||0,
      salaryMgrHrs:parseFloat(r[C.salMgr])||0,
      pettyAmt,hasPettyCash:pettyAmt>0,depositAmt:parseFloat(r[C.deposit])||0});
  }
  return rows;
}

function parseWeatherData(wb,sheet){
  sheet=sheet||'WeatherData';
  const raw=parseRaw(wb,sheet),hi=autoHdrRow(raw),h=raw[hi]||[];
  const C={loc:fc(h,'Loc','Store'),date:fc(h,'Date','Business Date'),yr:findCol(h,'YEAR'),mo:findCol(h,'MONTH'),dy:findCol(h,'DAY'),
    stid:findCol(h,'STID'),tmax:findCol(h,'TMAX'),tmin:findCol(h,'TMIN'),davg:findCol(h,'DAVG'),
    havg:findCol(h,'HAVG'),wcmn:findCol(h,'WCMN'),wmax:findCol(h,'WMAX'),wspd:findCol(h,'WSPD'),
    rain:findCol(h,'RAIN'),rnum:findCol(h,'RNUM'),rmax:findCol(h,'RMAX'),mslp:findCol(h,'MSLP')};
  const rows=[];
  for(let i=hi+1;i<raw.length;i++){
    const r=raw[i];if(!r)continue;
    let dt=C.date>=0?parseXLDate(r[C.date]):null;
    if(!dt&&C.yr>=0&&C.mo>=0&&C.dy>=0){const yr=parseInt(r[C.yr]),mo=parseInt(r[C.mo]),d=parseInt(r[C.dy]);if(yr&&mo&&d)dt=new Date(yr,mo-1,d);}
    if(!dt)continue;
    let loc=C.loc>=0?String(r[C.loc]||'').trim():'';
    const stid=C.stid>=0?String(r[C.stid]||'').trim():'';
    if(!loc&&stid)loc=stid;if(!loc)continue;
    rows.push({loc,date:dt,stid,tmax:parseFloat(r[C.tmax])||0,tmin:parseFloat(r[C.tmin])||0,
      davg:parseFloat(r[C.davg])||0,havg:parseFloat(r[C.havg])||0,wcmn:parseFloat(r[C.wcmn])||0,
      wmax:parseFloat(r[C.wmax])||0,wspd:parseFloat(r[C.wspd])||0,
      rain:parseFloat(r[C.rain])||0,rnum:parseFloat(r[C.rnum])||0,rmax:parseFloat(r[C.rmax])||0,
      mslp:parseFloat(r[C.mslp])||0});
  }
  return rows;
}

function parseTargets(wb,sheet){
  sheet=sheet||'OpsTargets';
  const raw=parseRaw(wb,sheet),hi=autoHdrRow(raw),h=raw[hi]||[];
  const C={
    loc:         fc(h,'Loc','Store'),
    // Service targets
    oepe:        findCol(h,'Target OEPE'),
    tpph:        fc(h,'TPPH\nTarget','Target TPPH'),
    kvst:        findCol(h,'Target KVS Time'),
    kvsu:        findCol(h,'Target KVS Usage'),
    park:        findCol(h,'Target DT Parked %'),
    avgCheck:    findCol(h,'Average Check'),
    prodSales:   findCol(h,'Product Sales'),
    // Labor targets
    labor:       fc(h,'Labor Target','Combined Labor %'),
    crewLabor:   findCol(h,'Crew Labor %'),
    bonusCrew:   findCol(h,'Bonus Crew Labor%'),
    growth:      findCol(h,'Growth Goal %'),
    // Controls — T-Reds
    tRedBPct:    findCol(h,'T-Reds Before %'),
    tRedBAvg:    findCol(h,'T-Reds Before Avg'),
    tRedBDollar: findCol(h,'T-Reds Before $'),
    tRedAPct:    findCol(h,'T-Reds After %'),
    tRedAAvg:    findCol(h,'T-Reds After Avg'),
    tRedADollar: findCol(h,'T-Reds After $'),
    // Controls — Promo/Discount
    promoCnt:    findCol(h,'Promo #'),
    promoPct:    findCol(h,'Promo %'),
    promoAmt:    findCol(h,'Promo $'),
    discCoupPct: findCol(h,'Disc Coup %'),
    // Controls — Drawer/POS/Refund
    drawer:      findCol(h,'Drawer Opens'),
    posOverPct:  findCol(h,'POS Overring %'),
    posOverAmt:  findCol(h,'POS Overing $'),
    refundCnt:   findCol(h,'Refund #'),
    refundPct:   findCol(h,'Refund %'),
    refundAmt:   findCol(h,'Refund $'),
    refundCash:  findCol(h,'Refund Cashless $'),
    manRefPct:   fc(h,'Manual Refund/ Overring %','Manual Refund'),
    manRefAmt:   findCol(h,'Manual Refund/ Overring $'),
    // Controls — Cash
    cashOSPct:   fc(h,'Cash Over/ Short %','Cash Over/Short %'),
    cashOSAmt:   fc(h,'Cash Over/ Short $','Cash Over/Short $'),
    // FOB targets
    fobBase:     findCol(h,'Base Food\n%'),
    fobCompWaste:findCol(h,'Comp Waste %'),
    fobRawWaste: fc(h,'Raw Waste %','Raw Waste'),
    fobCondiment:fc(h,'Condiment\n%','Condiment %','Condiment'),
    fobEmpFood:  fc(h,'Emp Food\n%','Emp Food %','Employee Food %','Emp Food'),
    fobStatLoss: fc(h,'Stat Loss\n%','Stat Loss %','Stat Loss'),
    fobUnex:     fc(h,'Unex Diff\n%','Unex Diff %','Unexplained Diff %','Unex Diff'),
    fobTarget:   fc(h,'FOB Target w/o Disc Coup','FOB Target'),
    fobTotalFC:  fc(h,'Total Food Cost\n%','Total Food Cost %','Total Food Cost'),
    fobBonusBase:fc(h,'Bonus Food Over Base Target','Bonus Food'),
    // Other
    paperCost:   fc(h,'P &. L Paper Cost %','Paper Cost %','P&L Paper'),
    opSupply:    findCol(h,'Op Supply Target'),
    bonusCrew:   findCol(h,'Bonus Crew Labor%'),
    fobBonusBase:findCol(h,'Bonus Food Over Base Target','Bonus Food'),
    posOverAmt:  findCol(h,'POS Overing $','POS Overring $'),
    refundAmt:   findCol(h,'Refund $'),
    refundCash:  findCol(h,'Refund Cashless $'),
    manRefAmt:   findCol(h,'Manual Refund/ Overring $'),
  };
  const targets={};
  for(let i=hi+1;i<raw.length;i++){
    const r=raw[i];if(!r)continue;
    const loc=String(r[C.loc]||'').trim();if(!loc||!/^\d+$/.test(loc))continue;
    targets[loc]={
      // Service / Operations
      tOepe:       parseFloat(r[C.oepe])||140,
      tTpph:       parseFloat(r[C.tpph])||5.5,
      tKvst:       parseFloat(r[C.kvst])||50,
      tKvsu:       parsePct(r[C.kvsu]),
      tPark:       parsePct(r[C.park]),
      tAvgCheck:   parseFloat(r[C.avgCheck])||0,
      tProdSales:  parseFloat(r[C.prodSales])||0,
      tR2p:        90,
      // Labor
      tLabor:      parsePct(r[C.labor])||parsePct(r[C.crewLabor]),
      tCrewLabor:  parsePct(r[C.crewLabor]),
      tCombLabor:  parsePct(r[C.labor]),
      tGrowth:     parsePct(r[C.growth])||.05,
      // T-Reds
      tRedBPct:    parsePct(r[C.tRedBPct]),
      tRedBAvg:    parseFloat(r[C.tRedBAvg])||0,
      tRedBDollar: parseFloat(r[C.tRedBDollar])||0,
      tRedAPct:    parsePct(r[C.tRedAPct]),
      tRedAAvg:    parseFloat(r[C.tRedAAvg])||0,
      tRedADollar: parseFloat(r[C.tRedADollar])||0,
      // Promo / Discount
      tPromoCnt:   parseFloat(r[C.promoCnt])||0,
      tPromoPct:   parsePct(r[C.promoPct]),
      tPromoAmt:   parseFloat(r[C.promoAmt])||0,
      tDiscCoupPct:parsePct(r[C.discCoupPct]),
      // Drawer / POS / Refund
      tDrawer:     parseFloat(r[C.drawer])||60,
      tPosOverPct: parsePct(r[C.posOverPct]),
      tRefundCnt:  parseFloat(r[C.refundCnt])||0,
      tRefundPct:  parsePct(r[C.refundPct]),
      tManRefPct:  parsePct(r[C.manRefPct]),
      // Cash
      tCashOSPct:  parsePct(r[C.cashOSPct]),
      tCashOSAmt:  parseFloat(r[C.cashOSAmt])||0,
      // FOB
      tFOBBase:    parsePct(r[C.fobBase]),
      tCompWaste:  parsePct(r[C.fobCompWaste]),
      tRawWaste:   parsePct(r[C.fobRawWaste]),
      tCondiment:  parsePct(r[C.fobCondiment]),
      tEmpFood:    parsePct(r[C.fobEmpFood]),
      tStatLoss:   parsePct(r[C.fobStatLoss]),
      tUnex:       parsePct(r[C.fobUnex]),
      tFOBTarget:  parsePct(r[C.fobTarget]),
      tFOBTotal:   parsePct(r[C.fobTotalFC]),
      tFOBBonusBase:parseFloat(r[C.fobBonusBase])||0,
      // Other
      tBonusLabor: parsePct(r[C.bonusCrew]),
      tPaperCost:  parsePct(r[C.paperCost]),
      tOpSupply:   parseFloat(r[C.opSupply])||0,
      tPosOverAmt: parseFloat(r[C.posOverAmt])||0,
      tRefundAmt:  parseFloat(r[C.refundAmt])||0,
      tRefundCash: parseFloat(r[C.refundCash])||0,
      tManRefAmt:  parseFloat(r[C.manRefAmt])||0,
    };
  }
  return targets;
}

// ── 3 PEAKS PARSER ─────────────────────────
// Two sheets: Sales and Service, both with Time Slice rows
// Time slices: 7am-9am, 11am-2pm, 5pm-7pm
function parse3PeaksService(wb, sheet) {
  sheet = sheet || wb.SheetNames.find(s=>s.toLowerCase()==='service'||s.toLowerCase().startsWith('service '))||wb.SheetNames.find(s=>s.toLowerCase().includes('service'))||wb.SheetNames[0];
  const raw=parseRaw(wb,sheet),hi=autoHdrRow(raw,10),h=raw[hi]||[];
  const C={loc:fc(h,'Loc','Store','Location','NSN'),
    date:fc(h,'Business Date','Date','Biz Date'),
    slice:fc(h,'Time Slice','Daypart','Period'),
    oepe:fc(h,'OEPE W/O Parked','OEPE No Parked'),
    r2p:fcx(h,'R2P'),avgCTP:findCol(h,'Avg CTP'),
    kvst:fcx(h,'KVS Time Per GC'),
    kvsu:fcx(h,'KVS Healthy Usage'),
    dtGC:fcx(h,'DT GC'),
    dtOrder:fcx(h,'DT Order Time'),dtLine:fcx(h,'DT Line Time'),
    dtWin1:fcx(h,'DT Win1 Time'),dtWin2:fcx(h,'DT Win2 Time'),
    parkCnt:fcx(h,'DT Parked Count'),parkPct:fcx(h,'DT Parked %'),parkTime:fcx(h,'DT Parked Time'),
    avgDTTTL:findCol(h,'Avg DT TTL')}; 
  const rows=[];let lastLoc='';
  for(let i=hi+1;i<raw.length;i++){
    const r=raw[i];if(!r)continue;
    const rawLoc=C.loc>=0?String(r[C.loc]||'').trim():'';
    if(rawLoc&&/^\d+$/.test(rawLoc))lastLoc=rawLoc;
    const loc=lastLoc;if(!loc||!/^\d+$/.test(loc))continue;
    const dt=parseXLDate(r[C.date]);if(!dt)continue;
    const slice=String(r[C.slice]||'').trim();if(!slice)continue;
    rows.push({loc,date:dt,slice,
      oepe:parseFloat(r[C.oepe])||0,r2p:parseFloat(r[C.r2p])||0,
      avgCTP:parseFloat(r[C.avgCTP])||0,kvst:parseFloat(r[C.kvst])||0,
      kvsu:parsePct(r[C.kvsu]),dtGC:parseFloat(r[C.dtGC])||0,
      dtOrderTime:parseFloat(r[C.dtOrder])||0,dtLineTime:parseFloat(r[C.dtLine])||0,
      dtWin1:parseFloat(r[C.dtWin1])||0,dtWin2:parseFloat(r[C.dtWin2])||0,
      parkCnt:parseFloat(r[C.parkCnt])||0,parkPct:parsePct(r[C.parkPct]),
      parkTime:parseFloat(r[C.parkTime])||0,avgDTTTL:parseFloat(r[C.avgDTTTL])||0});
  }
  return rows;
}

function parse3PeaksSales(wb, sheet) {
  sheet = sheet || wb.SheetNames.find(s=>s.toLowerCase()==='sales'||s.toLowerCase().startsWith('sales '))||wb.SheetNames.find(s=>s.toLowerCase().includes('sales'))||wb.SheetNames[0];
  const raw=parseRaw(wb,sheet),hi=autoHdrRow(raw,10),h=raw[hi]||[];
  const C={loc:fc(h,'Loc','Store','Location','NSN'),
    date:fc(h,'Business Date','Date','Biz Date'),
    slice:fc(h,'Time Slice','Daypart','Period'),
    netSales:fc(h,'All Net Sales','Net Sales','Total Sales','FC All Net Sales'),
    prodSales:findCol(h,'Product Sales'),gc:fc(h,'STW GC','GC','Transactions'),
    avgCheck:findCol(h,'Average Check'),tpph:findCol(h,'TPPH'),spph:findCol(h,'SPPH')};
  const rows=[];let lastLoc='';
  for(let i=hi+1;i<raw.length;i++){
    const r=raw[i];if(!r)continue;
    const rawLoc=C.loc>=0?String(r[C.loc]||'').trim():'';
    if(rawLoc&&/^\d+$/.test(rawLoc))lastLoc=rawLoc;
    const loc=lastLoc;if(!loc||!/^\d+$/.test(loc))continue;
    const dt=parseXLDate(r[C.date]);if(!dt)continue;
    const slice=String(r[C.slice]||'').trim();if(!slice)continue;
    rows.push({loc,date:dt,slice,
      netSales:parseFloat(r[C.netSales])||0,prodSales:parseFloat(r[C.prodSales])||0,
      gc:parseFloat(r[C.gc])||0,avgCheck:parseFloat(r[C.avgCheck])||0,
      tpph:parseFloat(r[C.tpph])||0,spph:parseFloat(r[C.spph])||0});
  }
  return rows;
}

// Normalize slice names to consistent keys

// ── REGISTER AUDIT PARSER ────────────────────
// Per-employee, per-register, per-date
// FOB (Food Over Base) Parser
// Sheet name: 'FOB' in Operations Report
function parseFOBData(wb, sheet, defaultDateOverride, fromDate) {
  sheet = sheet || (wb.SheetNames||[]).find(s=>s.toLowerCase()==='fob'||s.toLowerCase().startsWith('fob '))||
          (wb.SheetNames||[]).find(s=>s.toLowerCase().includes('fob'))||'FOB';
  const raw = parseRaw(wb, sheet);
  if(!raw||!raw.length) return [];
  const hi  = autoHdrRow(raw);
  const h   = raw[hi] || [];
  const fc  = (...args) => findCol(h, ...args);

  // Detect period-summary format: Operations Report summary has no Business Date column.
  // Extract "to" date from sheet name (e.g. "Sales 2026-05-01 to 2026-05-14").
  const _dateColIdx=findCol(h,'Month','Business Date','Date','Period');
  const _sheetDates=(sheet||'').match(/(\d{4}-\d{2}-\d{2})/g)||[];
  const _summaryDate=_dateColIdx<0
    ?(defaultDateOverride||(_sheetDates.length?new Date(_sheetDates[_sheetDates.length-1]+'T12:00:00'):new Date()))
    :null;
  const C = {
    loc:        fc('Loc','Store','Location','NS#'),
    date:       _dateColIdx,
    sales:      fc('Prod Net Sales','Product Sales','Net Sales','Sales'),
    // Food Cost breakdown — Operations Report FOB column names
    baseFoodPct:fc('Base Food %','Base Food Pct','Base Food Cost %'),
    fobPct:     fc('FOB %','Food Over Base %','FOB Pct'),
    compWaste:  fc('Comp Waste %','Comp Waste Pct','Completed Waste %'),   // Completed (finished product) waste
    rawWaste:   fc('Raw Waste %','Raw Waste Pct'),                          // Raw/uncooked product waste
    condiment:  fc('Condiment %','Condiment Pct'),
    empMeal:    fc('Emp Meal %','Emp Food %','Employee Meal %'),
    statVar:    fc('Stat Var %','Stat Loss %','Statistical Variance %'),
    unexplained:fc('Unexplained %','Unexplained Pct'),
    discCoupon: fc('Disc Coupon %','Discount Coupon %','Disc Coup %'),
    // P&L promo amounts
    pLFoodPromo:fc('P & L Food Promo $','P&L Food Promo $','Food Promo'),
    pLPaperPromo:fc('P & L Paper Promo $','P&L Paper Promo $','Paper Promo'),
    pLPaperPct: fc('P & L Paper Cost %','Paper Cost %','P&L Paper Cost %'),
    pLFoodPct:  fc('P & L Food Cost %','Food Cost %','P&L Food Cost %'),
    // Cross-check metrics also in FOB
    laborPct:   fc('Actual Labor %','Labor %','Act Labor %'),
    tpph:       fc('TPPH','Trans Per Person Hour'),
    salesVsLY:  fc('Product Sales +/- %','Sales +/- %','vs LY %'),
    opsSupplies:fc('Ops Supplies','Op Supplies','Operating Supplies'),
    fobDollar:  fc('FOB $','FOB Dollar'),
    fobWOUnexpPct:    fc('FOB W/O Unexp %','FOB Without Unexplained %'),
    fobWOUnexpDollar: fc('FOB W/O Unexp $','FOB Without Unexplained $'),
    pLFoodCostDollar: fc('P & L Food Cost $','P&L Food Cost $','Food Cost $'),
    pLPaperCostDollar:fc('P & L Paper Cost $','P&L Paper Cost $','Paper Cost $'),
  };
  const rows=[];
  for(let ri=hi+1;ri<raw.length;ri++){
    const row=raw[ri];if(!row||row.every(v=>v==null||v===''))continue;
    const locRaw=String(row[C.loc]||'').trim().split('-')[0].trim().replace(/[^0-9]/g,'');
    if(!locRaw||isNaN(+locRaw))continue;
    const loc=String(+locRaw);
    const dt=C.date>=0?parseXLDate(row[C.date]):_summaryDate;
    rows.push({
      loc, date:dt,
      sales:      parseFloat(row[C.sales])||0,
      baseFoodPct:parseFloat(row[C.baseFoodPct])||0,
      fobPct:     parseFloat(row[C.fobPct])||0,
      compWaste:  parseFloat(row[C.compWaste])||0,
      rawWaste:   parseFloat(row[C.rawWaste])||0,
      condiment:  parseFloat(row[C.condiment])||0,
      empMeal:    parseFloat(row[C.empMeal])||0,
      statVar:    parseFloat(row[C.statVar])||0,
      unexplained:parseFloat(row[C.unexplained])||0,
      discCoupon: parseFloat(row[C.discCoupon])||0,
      pLFoodPromo:parseFloat(row[C.pLFoodPromo])||0,
      pLPaperPromo:parseFloat(row[C.pLPaperPromo])||0,
      pLPaperPct: parseFloat(row[C.pLPaperPct])||0,
      pLFoodPct:  parseFloat(row[C.pLFoodPct])||0,
      laborPct:   parseFloat(row[C.laborPct])||0,
      tpph:       parseFloat(row[C.tpph])||0,
      salesVsLY:  parseFloat(row[C.salesVsLY])||null,
      opsSupplies:parseFloat(row[C.opsSupplies])||0,
      fobDollar:  parseFloat(row[C.fobDollar])||0,
      fobWOUnexpPct:    parseFloat(row[C.fobWOUnexpPct])||0,
      fobWOUnexpDollar: parseFloat(row[C.fobWOUnexpDollar])||0,
      pLFoodCostDollar: parseFloat(row[C.pLFoodCostDollar])||0,
      pLPaperCostDollar:parseFloat(row[C.pLPaperCostDollar])||0,
    });
  }
  return rows;
}

function parseRegisterAudit(wb, sheet) {
  sheet = sheet || wb.SheetNames.find(s=>s.toLowerCase().startsWith('register audit'))||wb.SheetNames[0];
  const raw=parseRaw(wb,sheet),hi=autoHdrRow(raw),h=raw[hi]||[];
  const C={emp:fc(h,'Emp Name','Employee','Employee Name','Cashier'),
    loc:fc(h,'Loc','Store'),date:fc(h,'Business Date','Date'),
    drawerSales:findCol(h,'Drawer Sales'),avgCheck:findCol(h,'Average Check'),
    drawerOpens:findCol(h,'Drawer Opens'),drawerGC:fc(h,'Drawer GC','GC'),
    empMealDisc:fc(h,'Emp Meal Disc $','Emp Meal $'),
    empMealCh:findCol(h,'Emp Meal Disc Ch'),
    manualRef:fc(h,'Manual Refund/Overring $','Manual Refund/Overing $','Manual Refund'),
    refundCnt:fc(h,'Refund Cnt','Cash Refund Cnt'),
    refundCash:fc(h,'Refund Cash $','Cash Refund Amt'),
    refundCashless:fc(h,'Refund Cashless $','Cashless Refund Amt'),
    mgrMeal:fc(h,'Mgr Meal $','Manager Meal Amt'),
    mgrMealCnt:fc(h,'Mgr Meal #','Manager Meal Cnt'),
    cashOS:fc(h,'Over/Short $','Cash Over/Short'),
    cashOSPct:fc(h,'Over/Short %','Cash Over/Short %'),
    posOverAmt:fc(h,'POS Overrings $','POS Overings $','POS Overrings Amt'),
    posOverCnt:fcx(h,'POS Overrings','POS Overrings Cnt','POS Overings Cnt'),
    promoAmt:fc(h,'Promo Amt'),promoCnt:fc(h,'Promo #','Promo Cnt','Promo Count'),
    promoPct:fc(h,'Promo Pct','Promo %'),
    tRedBCnt:findCol(h,'T-Red Before Cnt'),tRedBPct:findCol(h,'T-Red Before Pct'),
    tRedBAvg:findCol(h,'T-Red Before Avg'),tRedBDollar:fc(h,'T-Red Before $','T-Red Before Amt'),
    tRedACnt:findCol(h,'T-Red After Cnt'),tRedAPct:findCol(h,'T-Red After Pct'),
    tRedAAvg:findCol(h,'T-Red After Avg'),tRedADollar:fc(h,'T-Red After $','T-Red After Amt')};

  // The Register Audit uses GROUPED ROWS:
  //   Employee summary row: col[emp]='Aaden W', col[loc]='29760', col[date]=null
  //   Detail rows:          col[emp]=null,       col[loc]='29760', col[date]=2026-03-01
  // Strategy: carry-forward the employee name until the next employee row.
  // Also skip the 'Total' grand-total row (first data row after header).

  const rows=[]; let lastEmp=''; let lastLoc='';
  for(let i=hi+1;i<raw.length;i++){
    const r=raw[i]; if(!r) continue;

    const rawEmp = C.emp>=0 ? String(r[C.emp]||'').trim() : '';
    const rawLoc = C.loc>=0 ? String(r[C.loc]||'').trim() : '';
    const rawDate = C.date>=0 ? r[C.date] : null;

    // Skip grand total row (first row, emp='Total', no date)
    if(rawEmp.toLowerCase()==='total') continue;

    // Employee summary row: has name but no date
    if(rawEmp && !/^\d+$/.test(rawEmp) && !rawDate) {
      lastEmp = rawEmp;
      // loc may or may not be on this row — update if present
      if(rawLoc && /^\d+$/.test(rawLoc)) lastLoc = rawLoc;
      continue; // summary row itself has no per-day data
    }

    // Detail row: no employee name (carry forward), must have date and numeric loc
    const loc = (rawLoc && /^\d+$/.test(rawLoc)) ? rawLoc : lastLoc;
    if(!loc) continue;
    const dt = parseXLDate(rawDate); if(!dt) continue;
    const emp = lastEmp || rawEmp; if(!emp) continue;

    rows.push({emp, loc, date:dt,
      drawerSales:parseFloat(r[C.drawerSales])||0,
      avgCheck:parseFloat(r[C.avgCheck])||0,
      drawerOpens:parseFloat(r[C.drawerOpens])||0,
      drawerGC:parseFloat(r[C.drawerGC])||0,
      empMealDisc:parseFloat(r[C.empMealDisc])||0,
      empMealCh:parseFloat(r[C.empMealCh])||0,
      manualRefAmt:parseFloat(r[C.manualRef])||0,
      refundCnt:parseFloat(r[C.refundCnt])||0,
      refundCash:parseFloat(r[C.refundCash])||0,
      refundCashless:parseFloat(r[C.refundCashless])||0,
      mgrMealAmt:parseFloat(r[C.mgrMeal])||0,
      mgrMealCnt:parseFloat(r[C.mgrMealCnt])||0,
      cashOSDollar:parseFloat(r[C.cashOS])||0,
      cashOSPct:parsePct(r[C.cashOSPct]),
      posOverAmt:parseFloat(r[C.posOverAmt])||0,
      posOverCnt:parseFloat(r[C.posOverCnt])||0,
      promoAmt:parseFloat(r[C.promoAmt])||0,
      promoCnt:parseFloat(r[C.promoCnt])||0,
      promoPct:parsePct(r[C.promoPct]),
      tRedBCnt:parseFloat(r[C.tRedBCnt])||0,tRedBPct:parsePct(r[C.tRedBPct]),
      tRedBAvg:parseFloat(r[C.tRedBAvg])||0,tRedBDollar:parseFloat(r[C.tRedBDollar])||0,
      tRedACnt:parseFloat(r[C.tRedACnt])||0,tRedAPct:parsePct(r[C.tRedAPct]),
      tRedAAvg:parseFloat(r[C.tRedAAvg])||0,tRedADollar:parseFloat(r[C.tRedADollar])||0});
  }

  console.log('[McForecast] Register Audit parsed: '+rows.length+' rows, '+
    [...new Set(rows.map(r=>r.emp))].length+' employees, '+
    [...new Set(rows.map(r=>r.loc))].length+' stores');
  return rows;
}

// ── SHIFT MANAGER SUMMARY PARSER ───────────
function parseShiftMgr(wb, sheet) {
  sheet = sheet || wb.SheetNames.find(s=>s.toLowerCase().startsWith('shift manager'))||wb.SheetNames[0];
  const raw=parseRaw(wb,sheet),hi=autoHdrRow(raw),h=raw[hi]||[];
  const C={loc:fc(h,'Loc','Store'),date:fc(h,'Business Date','Date'),
    slice:fc(h,'Time Slice','Daypart','Period'),
    mgr:findCol(h,'Manager Name'),shifts:findCol(h,'# of Shifts'),
    sales:fc(h,'All Net Sales'),oepe:fc(h,'OEPE W/O Parked','OEPE'),
    r2p:fcx(h,'R2P'),avgCheck:findCol(h,'Average Check'),
    kvst:fc(h,'KVS Time Per GC'),kvsu:fcx(h,'KVS Healthy Usage'),
    labor:fc(h,'Punch Labor %','Punched Labor %','Punch Labor'),
    avn:findCol(h,'Act vs Need'),dtSales:findCol(h,'DT Sales')};
  const rows=[];
  for(let i=hi+1;i<raw.length;i++){
    const r=raw[i];if(!r)continue;
    const loc=String(r[C.loc]||'').trim();if(!loc||!/^\d+$/.test(loc))continue;
    const dt=parseXLDate(r[C.date]);if(!dt)continue;
    const slice=String(r[C.slice]||'').trim();
    const mgr=String(r[C.mgr]||'').trim();
    rows.push({loc,date:dt,slice,mgr,
      shifts:parseFloat(r[C.shifts])||1,
      sales:parseFloat(r[C.sales])||0,
      oepe:parseFloat(r[C.oepe])||0,r2p:parseFloat(r[C.r2p])||0,
      avgCheck:parseFloat(r[C.avgCheck])||0,
      kvst:parseFloat(r[C.kvst])||0,kvsu:parsePct(r[C.kvsu]),
      laborPct:parsePct(r[C.labor]),actVsNeed:parseFloat(r[C.avn])||0,
      dtSales:parseFloat(r[C.dtSales])||0});
  }
  return rows;
}

// ── TRENDS REPORT PARSER ─────────────────────
// Weekly aggregated LY comparisons — fiscal weeks (Wed-Tue)
function parseTrends(wb, sheet) {
  sheet = sheet || wb.SheetNames[0];
  const raw=parseRaw(wb,sheet),hi=autoHdrRow(raw),h=raw[hi]||[];
  const C={loc:fc(h,'Loc','Store'),date:fc(h,'Date','Business Date'),
    netSales:findCol(h,'All Net Sales'),netSalesPct:findCol(h,'All Net Sales +/-'),
    prodSales:findCol(h,'Product Sales'),prodSalesPct:findCol(h,'Product Sales +/-'),
    gc:findCol(h,'STW GC'),gcPct:findCol(h,'STW GC +/-'),
    avgCheck:findCol(h,'Average Check'),avgCheckPct:findCol(h,'Average Check +/-')};
  const rows=[];
  for(let i=hi+1;i<raw.length;i++){
    const r=raw[i];if(!r)continue;
    const loc=String(r[C.loc]||'').trim();if(!loc||!/^\d+$/.test(loc))continue;
    // Date is a range string like "3/26/2025 - 4/1/2025" — extract week start
    const dateStr=String(r[C.date]||'').trim();
    const dateMatch=dateStr.match(/(\d+\/\d+\/\d+)/);
    const weekStart=dateMatch?new Date(dateMatch[1]):null;
    if(!weekStart)continue;
    rows.push({loc,date:weekStart,dateLabel:dateStr,
      netSales:parseFloat(r[C.netSales])||0,
      netSalesPct:parsePct(r[C.netSalesPct]),
      prodSales:parseFloat(r[C.prodSales])||0,
      prodSalesPct:parsePct(r[C.prodSalesPct]),
      gc:parseFloat(r[C.gc])||0,gcPct:parsePct(r[C.gcPct]),
      avgCheck:parseFloat(r[C.avgCheck])||0,
      avgCheckPct:parsePct(r[C.avgCheckPct])});
  }
  return rows;
}

// ── RECORDS REPORT PARSER ────────────────────
// Store all-time bests per KPI — used for aspirational targeting & brief context
function parseRecords(wb, sheet) {
  sheet = sheet || wb.SheetNames[0];
  const raw=parseRaw(wb,sheet);
  if(!raw||!raw.length) return {};
  // Records file: Row 0 = group labels (DT Sales, DT Transactions...),
  //               Row 1 = col types (Loc, Value, Date, Value, Date...)
  // autoHdrRow finds 'Loc' at row 1 (hi=1); group labels are at row 0
  const hi = autoHdrRow(raw);
  const hGroup = (hi>0 ? raw[hi-1] : raw[0]) || [];
  const hCols  = raw[hi] || [];
  const locCol = findCol(hCols,'Loc');
  const colPairs = [];
  // Scan group-label row for named KPIs
  for(let i=0;i<hGroup.length;i++){
    const grp=String(hGroup[i]||'').trim();
    if(!grp||grp.toLowerCase()==='loc') continue;
    // Find corresponding Value/Date pair in hCols starting at column i
    for(let j=i;j<Math.min(i+4,hCols.length-1);j++){
      if(String(hCols[j]||'').toLowerCase()==='value'&&
         String(hCols[j+1]||'').toLowerCase()==='date'){
        colPairs.push({label:grp,valCol:j,dateCol:j+1});
        break;
      }
    }
  }
  // Fallback: if no group row, use old single-row approach
  if(!colPairs.length){
    for(let i=0;i<hCols.length-1;i++){
      const cur=String(hCols[i]||'').trim(),next=String(hCols[i+1]||'').trim();
      if(cur&&next.toLowerCase()==='date'&&cur.toLowerCase()!=='date'){
        colPairs.push({label:cur,valCol:i,dateCol:i+1});i++;
      }
    }
  }
  const records={};
  for(let i=hi+1;i<raw.length;i++){
    const r=raw[i];if(!r)continue;
    const loc=String(r[locCol]||'').trim();if(!loc||!/^\d+$/.test(loc))continue;
    const storeRecs={loc};
    for(const{label,valCol,dateCol}of colPairs){
      const val=parseFloat(r[valCol])||0;
      const dt=parseXLDate(r[dateCol]);
      const key=label.replace(/\s+/g,'_').replace(/[^a-zA-Z0-9_]/g,'').toLowerCase();
      if(val>0) storeRecs[key]={value:val,date:dt,label};
    }
    records[loc]=storeRecs;
  }
  return records;
}

// DAILY ACTIVITY REPORT (DAR) PARSER  (v179)
// Parses hourly store metrics (OEPE, GC, Sales, R2P) from DAR file
// Date extracted from filename hint set during file loading.
function parseDARData(wb, dateHint) {
  let dt = dateHint;
  if(!dt||isNaN(dt)) { const m=(wb.SheetNames[0]||'').match(/(\d{4}-\d{2}-\d{1,2})/); if(m)dt=new Date(m[1]+'T12:00:00'); }
  if(!dt||isNaN(dt)) return [];
  const rows=[];
  // Main sheet (service data per hour)
  const s0=wb.SheetNames[0],r0=parseRaw(wb,s0),h0=r0[0]||[];
  const C0={loc:fc(h0,'Loc','Store'),hour:fc(h0,'End Time','Hour'),
    oepe:fc(h0,'OEPE','OEPE W/O Parked'),oepePk:findCol(h0,'OEPE W/O Parked'),
    r2p:findCol(h0,'R2P'),ctp:findCol(h0,'Avg CTP')};
  // Sales sheet
  const s1=wb.SheetNames.find(s=>s.toLowerCase()==='sales')||wb.SheetNames[1];
  const r1=s1?parseRaw(wb,s1):[],h1=r1[0]||[];
  const C1={loc:fc(h1,'Loc','Store'),hour:fc(h1,'End Time','Hour'),
    sales:fc(h1,'All Net Sales'),gc:findCol(h1,'STW GC'),check:findCol(h1,'All Net Avg Check')};
  const salMap={};
  for(let i=1;i<r1.length;i++){const r=r1[i];if(!r||r[C1.loc]==null)continue;
    const k=String(r[C1.loc]).trim()+'_'+(r[C1.hour]||'');
    salMap[k]={sales:r[C1.sales]||0,gc:r[C1.gc]||0,check:r[C1.check]||0};}
  for(let i=1;i<r0.length;i++){const r=r0[i];if(!r||r[C0.loc]==null)continue;
    const loc=String(r[C0.loc]).trim(),hour=r[C0.hour]||'',sal=salMap[loc+'_'+hour]||{};
    rows.push({loc,date:dt,hour,oepe:parseFloat(r[C0.oepe])||0,
      oepePk:parseFloat(r[C0.oepePk])||0,r2p:parseFloat(r[C0.r2p])||0,
      ctp:parseFloat(r[C0.ctp])||0,sales:sal.sales||0,gc:sal.gc||0,check:sal.check||0});}
  return rows;
}

// PRODUCT MIX PARSER  (v179)
// Parses item-level unit sales; aggregates by Family Group
function parsePMixData(wb) {
  const sh=wb.SheetNames.find(s=>s.toLowerCase().includes('pmix')||s.toLowerCase().includes('product mix'))||wb.SheetNames[0];
  const raw=parseRaw(wb,sh),hi=autoHdrRow(raw,3),h=raw[hi]||[];
  const C={item:fc(h,'Menu Item #','Item #','Item'),units:fc(h,'Units Sold','Units'),
    disc:fc(h,'Disc Qty','Discount Qty'),discAmt:fc(h,'Offer Discount $'),
    desc:fc(h,'Desc','Description'),family:fc(h,'Family Group','Category')};
  const rows=[],byFamily={};
  for(let i=hi+1;i<raw.length;i++){const r=raw[i];if(!r||r[C.item]==null)continue;
    const fam=r[C.family]||'Other',units=parseFloat(r[C.units])||0;
    rows.push({item:r[C.item],units,disc:parseFloat(r[C.disc])||0,
      discAmt:parseFloat(r[C.discAmt])||0,desc:r[C.desc]||'',family:fam});
    if(!byFamily[fam])byFamily[fam]={family:fam,units:0,disc:0,items:0};
    byFamily[fam].units+=units;byFamily[fam].disc+=parseFloat(r[C.disc])||0;byFamily[fam].items++;}
  return {rows,byFamily};
}


// ── PEAK ANALYTICS ───────────────────────────
// Compute 6-week peak averages and trend for each time slice

// ── TRENDS VALIDATION ────────────────────────
// Cross-check engine trend vs QSRSoft reported trend
function validateTrend(trendsRows, loc, engineT2W) {
  const recent=trendsRows.filter(r=>r.loc===loc).sort((a,b)=>b.date-a.date);
  if(!recent.length)return null;
  const lastWk=recent[0];
  const diff=Math.abs((engineT2W||0)-lastWk.netSalesPct);
  return{qsrTrend:lastWk.netSalesPct,engineTrend:engineT2W||0,
    variance:diff,aligned:diff<.02,
    label:diff<.01?'Confirmed':diff<.02?'Close match':'Diverging — review LY data'};
}

function autoDetectSheets(wb){
  const n=wb.SheetNames;
  return{
    // Match 'Sales 2022-...' or 'Labor Analysis' or first sheet
    labor:n.find(s=>s.toLowerCase().startsWith('sales '))||n.find(s=>s.toLowerCase().includes('labor'))||n[0],
    ops:n.find(s=>s.toLowerCase()==='service'||s.toLowerCase().startsWith('service '))||null,
    ctrl:n.find(s=>s.toLowerCase()==='controls'||s.toLowerCase().startsWith('controls '))||null,
    weather:n.find(s=>s.toLowerCase().includes('weather'))||null,
    targets:n.find(s=>s.toLowerCase().includes('target'))||null,
    fob:n.find(s=>s.toLowerCase()==='fob'||s.toLowerCase().startsWith('fob '))||null,
    sales:n.find(s=>s.toLowerCase()==='sales')||null
  };
}

function buildDS(workbooks){
  const ds={laborRows:[],opsRows:[],ctrlRows:[],weatherRows:[],inventoryRows:[],
    peaksSvcRows:[],peaksSalesRows:[],auditRows:[],fobRows:[],trendsRows:[],
    darRows:[],   // Daily Activity Report — hourly OEPE/GC/Sales per store
    pmixData:{},  // Product Mix — item-level sales aggregated by family group
    records:{},targets:{},loaded:false,
    laborIdx:{},opsIdx:{},ctrlIdx:{},weatherIdx:{},storeIds:[],lastActual:{},
    laborByLoc:{},opsByLoc:{},ctrlByLoc:{},darByLoc:{}};
  for(const{wb,type}of workbooks){
    try{
      if(type==='labor')    ds.laborRows.push(...parseLaborData(wb));
      else if(type==='ops') {
        ds.opsRows.push(...parseOpsData(wb));
        // Pull Controls and FOB sheets from Operations Report (same file, different sheets)
        try{const ctr=parseCtrlData(wb);if(ctr&&ctr.length)ds.ctrlRows.push(...ctr);}catch(e){}
        try{const fob=parseFOBData(wb);if(fob&&fob.length)ds.fobRows.push(...fob);}catch(e){}
      }
      else if(type==='ctrl')ds.ctrlRows.push(...parseCtrlData(wb));
  if(type==='projections'){
    const pRows=parseProjectionsFile(wb,filename||'');
    applyProjectionsToTargets(pRows,filename||'projections');
    // Also store as projRows for future reference
    if(!ds.projRows) ds.projRows=[];
    ds.projRows.push(...pRows);
  }
      else if(type==='fob')  ds.fobRows.push(...parseFOBData(wb));
      else if(type==='weather')ds.weatherRows.push(...parseWeatherData(wb));
      else if(type==='targets')Object.assign(ds.targets,parseTargets(wb));
      else if(type==='peaks'){
        const _pkSvc=parse3PeaksService(wb);
        console.log('[McForecast] 3Peaks Service rows:',_pkSvc.length,'locs:',[...new Set(_pkSvc.map(r=>r.loc))].join(','));
        ds.peaksSvcRows.push(..._pkSvc);
        const _pkSal=parse3PeaksSales(wb);
        console.log('[McForecast] 3Peaks Sales rows:',_pkSal.length);
        ds.peaksSalesRows.push(..._pkSal);
      }
      else if(type==='register')ds.auditRows.push(...parseRegisterAudit(wb));
      else if(type==='trends') ds.trendsRows.push(...parseTrends(wb));
    else if(type==='dar') {
      // Extract date from filename: Daily_Activity_Report_YYYYMMDD.xlsx
      const dm = file.name.match(/(\d{8})/);
      const dateHint = dm ? new Date(dm[1].slice(0,4)+'-'+dm[1].slice(4,6)+'-'+dm[1].slice(6,8)+'T12:00:00') : new Date();
      ds.darRows.push(...parseDARData(wb, dateHint));
    }
    else if(type==='pmix') {
      const pmx = parsePMixData(wb);
      Object.assign(ds.pmixData, pmx.byFamily ? {[file.name]: pmx} : {});
    }
      else if(type==='inventory'){const ir=parseInventoryData(wb,filename||'');if(ir.length)ds.inventoryRows.push(...ir);}
      else if(type==='records') Object.assign(ds.records,parseRecords(wb));
      else{
        // Auto-detect sheets in combined workbook
        const sh={
          labor:wb.SheetNames.find(s=>s.toLowerCase().includes('labor'))||wb.SheetNames[0],
          ops:wb.SheetNames.find(s=>s.toLowerCase()==='service'||s.toLowerCase().startsWith('service'))||null,
          ctrl:wb.SheetNames.find(s=>s.toLowerCase()==='controls'||s.toLowerCase().startsWith('controls'))||null,
          weather:wb.SheetNames.find(s=>s.toLowerCase().includes('weather'))||null,
          targets:wb.SheetNames.find(s=>s.toLowerCase().includes('target'))||null,
        };
        if(sh.labor)  ds.laborRows.push(...parseLaborData(wb,sh.labor));
        if(sh.ops)    ds.opsRows.push(...parseOpsData(wb,sh.ops));
        if(sh.ctrl)   ds.ctrlRows.push(...parseCtrlData(wb,sh.ctrl));
        if(sh.weather)ds.weatherRows.push(...parseWeatherData(wb,sh.weather));
        if(sh.targets)Object.assign(ds.targets,parseTargets(wb,sh.targets));
      }
    }catch(e){console.warn('Parse error:',type,e);}
  }
  ds.loaded=ds.laborRows.length>0;
  // Auto-tag holidays on every data load (v4.195) — was previously only a
  // side-effect of generating a Review Pack, an easy-to-miss manual trigger.
  // Idempotent: skips anything already tagged, so this is safe to run on
  // every load without overwriting manual corrections.
  if(ds.loaded){
    try{
      const _existingEvents=JSON.parse(localStorage.getItem('mf_events')||'{}');
      const {events:_taggedEvents,tagged:_autoTaggedCount}=autoTagHolidays(ds.laborRows,_existingEvents);
      if(_autoTaggedCount>0) localStorage.setItem('mf_events',JSON.stringify(_taggedEvents));
    }catch(e){console.warn('Auto-holiday-tag on load failed:',e);}
  }
  function bIdx(rows){const idx={};for(const r of rows){if(!r.loc||!r.date)continue;const k=r.loc+'_'+dKey(r.date);if(!idx[k])idx[k]=[];idx[k].push(r);}return idx;}
  // Weather-specific index: keyed by date only (station ID irrelevant for regional OK weather)
  function bWxIdx(rows){
  const idx={};
  for(const r of rows){
    if(!r.date) continue;
    const dk=dKey(r.date);
    // Per-store key for Open-Meteo data (loc-specific lookup)
    if(r.loc) idx[String(r.loc)+'_'+dk]=r;
    // Date-only key for backward compat (keeps first entry per date)
    if(!idx[dk]) idx[dk]=r;
  }
  return idx;
}
  ds.laborIdx=bIdx(ds.laborRows);ds.opsIdx=bIdx(ds.opsRows);
  ds.ctrlIdx=bIdx(ds.ctrlRows);ds.weatherIdx=bIdx(ds.weatherRows);
  ds.laborByLoc=bLocIdx(ds.laborRows);ds.opsByLoc=bLocIdx(ds.opsRows);
  ds.ctrlByLoc=bLocIdx(ds.ctrlRows);ds.darByLoc=bLocIdx(ds.darRows);
  ds.wxByDate=bWxIdx(ds.weatherRows); // date-only lookup — station ID irrelevant for regional OK
  ds.storeIds=[...new Set(ds.laborRows.map(r=>r.loc))].sort();
  for(const r of ds.laborRows){if(r.sales>0){if(!ds.lastActual[r.loc]||r.date>ds.lastActual[r.loc])ds.lastActual[r.loc]=r.date;}}
  if(ds.auditRows.length>0)ds.empRisk=analyzeRegisterAudit(ds.auditRows);
  return ds;
}


function computeOpsScore(p,t,sc){
  let score=0,max=0;
  if(t.tOepe>0&&p.oepe>0){max+=15;if(p.oepe<=t.tOepe)score+=sc.oepeT1pts;else if(p.oepe<=t.tOepe+sc.oepeT2gap)score+=sc.oepeT2pts;else if(p.oepe<=t.tOepe+sc.oepeT3gap)score+=sc.oepeT3pts;}
  if(t.tKvst>0&&p.kvst>0){max+=sc.kvstMaxPts;if(p.kvst<=t.tKvst)score+=sc.kvstMaxPts;else if(p.kvst<=t.tKvst*sc.kvstPartialPct)score+=sc.kvstPartialPts;}
  if(t.tKvsu>0&&p.kvsu>0){max+=sc.kvsuMaxPts;if(p.kvsu>=t.tKvsu)score+=sc.kvsuMaxPts;else if(p.kvsu>=t.tKvsu*sc.kvsuPartialPct)score+=sc.kvsuPartialPts;}
  if(t.tPark>0&&p.park>0){max+=sc.parkMaxPts;if(p.park<=t.tPark)score+=sc.parkMaxPts;else if(p.park<=t.tPark*sc.parkPartialPct)score+=sc.parkPartialPts;}
  if(t.tTpph>0&&p.tpph>0){max+=sc.tpphMaxPts;if(p.tpph>=t.tTpph)score+=sc.tpphMaxPts;else if(p.tpph>=t.tTpph*sc.tpphT2pct)score+=sc.tpphT2pts;else if(p.tpph>=t.tTpph*sc.tpphT3pct)score+=sc.tpphT3pts;}
  if(t.tLabor>0&&p.laborPct>0){max+=sc.laborMaxPts;const g=Math.abs(p.laborPct-t.tLabor);if(g<=sc.laborT1gap)score+=sc.laborMaxPts;else if(g<=sc.laborT2gap)score+=sc.laborT1pts;else if(g<=sc.laborT3gap)score+=sc.laborT2pts;}
  return max?+(score/max*100).toFixed(1):50;
}

function computeCtrlScore(p,sc){
  let score=0;const ac=Math.abs(p.cashOSPct||0);const{cashPts,tredPts,otPts,refundPts,discPts}=sc;
  if(ac<=sc.cashT1)score+=cashPts[0];else if(ac<=sc.cashT2)score+=cashPts[1];else if(ac<=sc.cashT3)score+=cashPts[2];else if(ac<=sc.cashT4)score+=cashPts[3];
  const tra=p.tRedAPct||0;if(tra<=sc.tredT1)score+=tredPts[0];else if(tra<=sc.tredT2)score+=tredPts[1];else if(tra<=sc.tredT3)score+=tredPts[2];
  score+=3;
  const ot=p.otHrs||0;if(ot<=sc.otT1)score+=otPts[0];else if(ot<=sc.otT2)score+=otPts[1];else if(ot<=sc.otT3)score+=otPts[2];else if(ot<=sc.otT4)score+=otPts[3];
  const rc=p.cashRefCnt||0;if(rc<=sc.refundT1)score+=refundPts[0];else if(rc<=sc.refundT2)score+=refundPts[1];else if(rc<=sc.refundT3)score+=refundPts[2];
  const dp=p.discPct||0;if(dp<=sc.discT1)score+=discPts[0];else if(dp<=sc.discT2)score+=discPts[1];else if(dp<=sc.discT3)score+=discPts[2];
  return +Math.min(100,score/40*100).toFixed(1);
}

function normalizeScores(stores,mode){
  if(!mode||mode==='absolute'||!stores||!stores.length)return stores;
  if(mode==='relative'){
    const allO=stores.map(s=>s.opsScore),allC=stores.map(s=>s.ctrlScore);
    const mxO=Math.max(...allO),mnO=Math.min(...allO),mxC=Math.max(...allC),mnC=Math.min(...allC);
    return stores.map(s=>({...s,opsScore:mxO===mnO?80:+(60+40*((s.opsScore-mnO)/(mxO-mnO))).toFixed(1),ctrlScore:mxC===mnC?80:+(60+40*((s.ctrlScore-mnC)/(mxC-mnC))).toFixed(1)}));
  }
  if(mode==='optimistic')return stores.map(s=>({...s,opsScore:+Math.min(100,s.opsScore*1.12+5).toFixed(1),ctrlScore:+Math.min(100,s.ctrlScore*1.12+5).toFixed(1)}));
  return stores;
}

function buildBrief(p,t,os,cs,pSales,pLY,ds,loc){
  const f=[];const tR2p=t.tR2p||90;

  // ── CRITICAL FLAGS ────────────────────────────
  if(Math.abs(p.cashOSPct||0)>.005) f.push({t:'crit',m:'CRITICAL — CASH INTEGRITY: Cash Over/Short averaging '+(((p.cashOSPct||0)*100).toFixed(2))+'% of sales. Exceeds 0.5% threshold. Immediate video audit and deposit cross-reference required. This is the highest-priority integrity signal in the system.'});
  if((t.tRedAPct||0)>0&&(p.tRedAPct||0)>t.tRedAPct*1.5) f.push({t:'crit',m:'CRITICAL — POS INTEGRITY: Post-close T-Reds at '+((p.tRedAPct||0)*100).toFixed(2)+'% vs '+(t.tRedAPct*100).toFixed(2)+'% target ('+Math.round((p.tRedAPct/t.tRedAPct-1)*100)+'% over). After-close voids are the easiest and most common mechanism for skimming. Cross-reference register video for all after-hours activity.'});
  if((p.otHrs||0)>5) f.push({t:'crit',m:'CRITICAL — OVERTIME: Averaging '+(p.otHrs||0).toFixed(1)+' hrs/day of OT. At '+'$'+(p.avgRate||12).toFixed(2)+'/hr avg rate, this is adding ~$'+Math.round((p.otHrs||0)*1.5*(p.avgRate||12))+'/day in premium cost. Primary cause is typically scheduling structure, not traffic volume. Immediate schedule restructure required.'});
  if(p.hasPettyCash) f.push({t:'crit',m:'CRITICAL — PETTY CASH: Activity detected. This organization does not use petty cash — any amount present is an automatic integrity flag requiring immediate investigation.'});
  if(p.depositSuspect) f.push({t:'crit',m:'CRITICAL — DEPOSIT: Avg deposit is '+((p.depositVsSalesRatio||0)*100).toFixed(0)+'% of sales vs '+p.depositBaseline+' expected baseline for this location. Consistent shortfall is a cash diversion indicator. Cross-reference deposit slips vs POS daily reports.'});

  // ── CROSS-SIGNAL INTEGRITY ──────────────────
  if(p.r2pSuspect&&(p.tRedAPct||0)>(t.tRedAPct||.003)*1.2) f.push({t:'crit',m:'INTEGRITY ALERT — COMPOUND SIGNAL: R2P averaging '+Math.round(p.r2p||0)+'s (below 60s — early serve-off pattern) AND T-Red After elevated at '+((p.tRedAPct||0)*100).toFixed(2)+'%. Both signals appearing together strongly indicate order manipulation. Do not address separately — this warrants a coordinated video/register review.'});
  else if(p.r2pSuspect) f.push({t:'crit',m:'INTEGRITY ALERT — R2P: Averaging '+Math.round(p.r2p||0)+'s, below 60s threshold. Historically indicates orders served off EXPO monitor before food is ready, creating artificially fast times. Cross-reference EXPO reports and line video.'});
  else if((p.r2p||0)>tR2p+15) f.push({t:'watch',m:'WATCH — DINE-IN SPEED: R2P at '+Math.round(p.r2p||0)+'s vs '+tR2p+'s corporate target. Dine-in service lagging. Review EXPO workflow, kitchen-to-counter handoff, and crew positioning during service windows.'});

  // ── SCHEDULING COMPLIANCE ───────────────────
  if(p.floorCompliance!==null&&p.floorCompliance!==undefined&&(p.floorMgmtNeeded||0)>0){
    if(p.floorCompliance<0.75) f.push({t:'crit',m:'CRITICAL — SCHEDULING: Floor management compliance at '+((p.floorCompliance||0)*100).toFixed(0)+'%. Managers are not notating required floor hours on schedules. This inflates variable hour allocation and artificially increases labor cost calculations. Fix schedules before addressing labor%.'});
    else if(p.floorCompliance<0.90) f.push({t:'watch',m:'WATCH — SCHEDULING: Floor management compliance at '+((p.floorCompliance||0)*100).toFixed(0)+'% (target ≥90%). Incomplete floor hour notations are causing variable hour over-allocation. Coaching needed on schedule-building process.'});
    else f.push({t:'ok',m:'STRENGTH — SCHEDULING: Floor management compliance at '+((p.floorCompliance||0)*100).toFixed(0)+'%. Managers are correctly notating floor hours, enabling accurate variable hour allocation and reliable labor modeling.'});
  }

  // ── OPS WATCH FLAGS ─────────────────────────
  if((t.tOepe||0)>0&&(p.oepe||0)>t.tOepe+15){
    const lost=Math.round(((p.oepe||0)-t.tOepe)/30*4);
    f.push({t:'watch',m:'WATCH — OEPE: '+Math.round(p.oepe||0)+'s vs '+t.tOepe+'s target (+'+Math.round((p.oepe||0)-t.tOepe)+'s). Estimated '+lost+' additional abandoned cars per peak hour. Primary drivers are typically window staffing, beverage positioning, and pull-time execution. Review order-to-pull sequence and window crew alignment.'});
  } else if((t.tOepe||0)>0&&(p.oepe||0)>0&&(p.oepe||0)<=t.tOepe) {
    f.push({t:'ok',m:'STRENGTH — OEPE: '+Math.round(p.oepe||0)+'s vs '+t.tOepe+'s target. Drive-thru speed is meeting store-specific standard. Window execution and pull-time management are working.'});
  }

  if((t.tLabor||0)>0&&(p.laborPct||0)>t.tLabor+.02) f.push({t:'watch',m:'WATCH — LABOR: '+((p.laborPct||0)*100).toFixed(1)+'% vs '+(t.tLabor*100).toFixed(1)+'% target (+'+Math.round(((p.laborPct||0)-t.tLabor)*100*10)/10+'%). '+((p.otHrs||0)>2?'Overtime is the primary driver ($'+Math.round((p.otHrs||0)*1.5*(p.avgRate||12))+'/day premium). Restructure scheduling before cutting crew.':'Likely a volume-vs-schedule alignment issue. Review schedule build process and floor hour compliance.')});

  if((p.discPct||0)>.065) f.push({t:'watch',m:'WATCH — DISCOUNTS: '+((p.discPct||0)*100).toFixed(1)+'% of sales. P90 across district is 6.5%. Verify against active LTO calendar. Unauthorized discounting erodes net sales without corresponding traffic benefit.'});

  if((t.tPark||0)>0&&(p.park||0)>t.tPark*1.3) f.push({t:'watch',m:'WATCH — DT PARKING: '+((p.park||0)*100).toFixed(1)+'% vs '+(t.tPark*100).toFixed(1)+'% target. Kitchen is not keeping pace with DT demand. Review pull-time targets, pre-assembly process, and expediter positioning.'});

  if((t.tTpph||0)>0&&(p.tpph||0)>0&&(p.tpph||0)<t.tTpph*.9) f.push({t:'watch',m:'WATCH — THROUGHPUT: TPPH at '+(p.tpph||0).toFixed(2)+' vs '+t.tTpph.toFixed(1)+' target. Throughput is below standard — crew is not processing transactions efficiently relative to schedule. Review peak staffing alignment and window crew deployment.'});

  if((p.posOverCnt||0)>5) f.push({t:'watch',m:'WATCH — POS OVERRINGS: Averaging '+(p.posOverCnt||0).toFixed(1)+' overrings/day (target ≤5). Overrings are the operational equivalent of T-Reds — items voided after being added to an order. Pattern warrants manager-level review of POS activity.'});

  // ── SPECIFIC STRENGTHS ────────────────────────
  const critOrWatch = f.some(x=>x.t==='crit'||x.t==='watch');
  if(!critOrWatch) {
    if(cs>=90) f.push({t:'ok',m:'STRENGTH — CONTROLS ELITE ('+cs+'/100): Cash O/S '+((p.cashOSPct||0)*100).toFixed(3)+'% · T-Red After '+((p.tRedAPct||0)*100).toFixed(2)+'% · Drawer Opens '+(p.drawerOpens||0).toFixed(1)+'/day. All controls metrics within excellent ranges. This store is a cash integrity model.'});
    else if(cs>=80) f.push({t:'ok',m:'STRENGTH — CONTROLS ('+(cs)+'/100): Cash handling, POS activity, and refund patterns are within acceptable ranges. Cash O/S '+((p.cashOSPct||0)*100).toFixed(3)+'% · T-Red After '+((p.tRedAPct||0)*100).toFixed(2)+'%.'});
    if(os>=90) f.push({t:'ok',m:'STRENGTH — OPS ELITE ('+os+'/100): OEPE '+(p.oepe>0?Math.round(p.oepe)+'s':' on target')+' · TPPH '+(p.tpph||0).toFixed(2)+' · DT Parked '+((p.park||0)*100).toFixed(1)+'%. Exceptional operational execution across speed, throughput, and positioning metrics.'});
    else if(os>=80) f.push({t:'ok',m:'STRENGTH — OPS ('+os+'/100): Speed and throughput are performing well vs store-specific targets. OEPE '+(p.oepe>0?Math.round(p.oepe)+'s / target '+t.tOepe+'s':'')+' · TPPH '+(p.tpph||0).toFixed(2)+'.'});
  }

  if(f.length===0) f.push({t:'ok',m:'All monitored metrics are within normal ranges across Ops, Controls, Labor, and Scheduling. No flags raised.'});

  // ── RECORDS CONTEXT ───────────────────────────
  if(ds&&ds.records&&ds.records[loc]){
    const rec=ds.records[loc];
    const oepeRec=rec.oepe_no_parked||rec.oepe;
    if(oepeRec&&oepeRec.value>0&&(p.oepe||0)>0){
      const gap=Math.round((p.oepe||0)-oepeRec.value);
      if(gap>10) f.push({t:'watch',m:'OPPORTUNITY — OEPE: Store record is '+oepeRec.value+'s ('+( oepeRec.date instanceof Date?oepeRec.date:new Date(oepeRec.date)).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})+'), '+gap+'s better than current '+Math.round(p.oepe||0)+'s avg. That capability has been demonstrated. It can be replicated.'});
    }
    const salesRec=rec.total_sales;
    if(salesRec&&salesRec.value>0) f.push({t:'ok',m:'RECORD — SALES: All-time best single day: '+f$(salesRec.value)+' ('+(salesRec.date instanceof Date?salesRec.date:new Date(salesRec.date)).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})+').'});
  }

  // ── FORECAST LINE ────────────────────────────
  if(pLY>0) f.push({t:'fc',m:'AI FORECAST: '+f$(pSales)+' projected this period ('+fPct((pSales-pLY)/pLY)+' vs LY '+f$(pLY)+'). '+(pSales>=pLY?'Bullish — sustained momentum across T2/T4/T6 trend windows.':'Model reflects current operational headwinds and trend pressure. Improving ops factor will shift forecast upward.')});
  return f;
}

function buildStore(loc,ds,settings){
  const t=(ds&&ds.targets&&ds.targets[loc])||DEFAULT_TARGETS[loc]||{};
  const name=STORE_NAMES[loc]||('Store '+loc);
  const sc=settings.scoring||DEF_SETTINGS.scoring;
  let p;
  let p2=null,p4=null;
  if(ds&&ds.loaded){
    const _bt0=performance.now();
    p=compute6wk(loc,ds,settings.weeksBack||6);
    p2=compute6wk(loc,ds,2);
    p4=compute6wk(loc,ds,4);
    if(window._perfStats) window._perfStats.compute6wk += (performance.now()-_bt0);
  }else{
    // Mock deterministic data for demo
    function sr(n){const s=loc.split('').reduce((a,c)=>a*31+c.charCodeAt(0),0);const x=Math.sin(s*(n+1))*10000;return x-Math.floor(x);}
    p={oepe:Math.round((t.tOepe||130)*(0.88+sr(1)*.28)),kvst:Math.round((t.tKvst||50)*(0.88+sr(2)*.28)),
      kvsu:Math.min(1,Math.max(.2,(t.tKvsu||.7)*(0.75+sr(3)*.4))),park:Math.min(.5,Math.max(.02,(t.tPark||.15)*(0.65+sr(4)*.65))),
      tpph:+((t.tTpph||5.5)*(0.82+sr(5)*.35)).toFixed(2),laborPct:+((t.tLabor||.21)*(0.9+sr(6)*.22)).toFixed(4),
      actVsNeed:(sr(6)-.5)*40,otHrs:+(sr(7)*6.5).toFixed(1),cashOSPct:+((sr(8)-.45)*.014).toFixed(5),
      tRedAPct:+((t.tRedAPct||.002)*(0.4+sr(9)*2.2)).toFixed(5),discPct:+(0.03+sr(10)*.055).toFixed(3),
      cashRefCnt:+(sr(11)*5).toFixed(1),spph:+(8+sr(12)*4).toFixed(2),avgRate:+(10+sr(13)*3).toFixed(2),
      posOverCnt:+(sr(14)*8).toFixed(1),drawerOpens:+(t.tDrawer||50)*(0.8+sr(15)*.4),
      empMealAmt:+(sr(16)*30).toFixed(2),mgrMealAmt:+(sr(17)*20).toFixed(2),manualRefAmt:+(sr(18)*80).toFixed(2),
      r2p:+(75+sr(19)*40).toFixed(0),r2pSuspect:false,floorCompliance:null,floorMgmtNeeded:0,
      hasPettyCash:false,depositSuspect:false,depositVsSalesRatio:null,oppCostDollar:+(sr(20)*100).toFixed(0)};
  }
  const os=computeOpsScore(p,t,sc);
  const cs=computeCtrlScore(p,sc);
  const cut4=new Date(Date.now()-28*86400000);
  const now4=new Date(Date.now());
  let pSales=0,pLY=0;
  if(ds&&ds.loaded){
    // pLY must mirror pSales's exact window width (28 days) shifted back one year —
    // missing upper bound here previously summed ~392 days of LY sales against
    // pSales's 28 days, producing a uniform ~93% "decline" on every store that
    // was a unit-window mismatch, not a real signal.
    for(const r of locRows(ds.laborByLoc, ds.laborRows, loc)){if(r.date>=cut4)pSales+=r.sales||r.projSales||0;const lyDt=addD(r.date,364);if(lyDt>=cut4&&lyDt<=now4&&r.sales>0)pLY+=r.sales;}
  }else{
    function sr(n){const s=loc.split('').reduce((a,c)=>a*31+c.charCodeAt(0),0);const x=Math.sin(s*(n+1))*10000;return x-Math.floor(x);}
    const ap=(t.tOepe<=75?2800000:t.tOepe<=110?2100000:t.tOepe<=125?1750000:1400000)/52;
    pLY=Math.round(ap*(0.92+sr(12)*.16));
    pSales=Math.round(pLY*(1+(os+cs)/200*.14-.03+(sr(13)-.5)*.06));
  }
  const _bft0=performance.now();
  const findings=buildBrief(p,t,os,cs,pSales,pLY,ds,loc);
  if(window._perfStats) window._perfStats.buildBrief += (performance.now()-_bft0);
  const hasCrit=findings.some(f=>f.t==='crit');
  const concern=hasCrit?(Math.abs(p.cashOSPct||0)>.005?'Cash O/S >0.5%':(p.tRedAPct||(t.tRedAPct||0)*1.5)>0&&(p.tRedAPct||0)>(t.tRedAPct||0)*1.5?'T-Red After elevated':(p.otHrs||0)>5?'OT >5 hrs/day':'Multiple flags'):((p.oepe||0)>t.tOepe+15&&t.tOepe>0)?'OEPE over target':((p.laborPct||0)>t.tLabor+.02&&t.tLabor>0)?'Labor% over target':null;
  const strength=!hasCrit?(cs>=90?'Controls: Elite':os>=90?'Ops: Elite':cs>=80?'Controls: Strong':os>=80?'Ops: Strong':null):null;
  const sc2=STORE_COORDS[loc]||{};
  const staff=STORE_STAFF[loc]||{};
  // Find operator name from settings
  let operator='';
  for(const[op,locs] of Object.entries((settings.operators||DEF_SETTINGS.operators))){
    if(locs.includes(loc)){operator=op.replace(' (EA)','');break;}
  }
  return{loc,name,t,p,p2,p4,opsScore:os,ctrlScore:cs,pSales,pLY,findings,hasCrit,concern,strength,
    city:sc2.city||'',state:sc2.state||'',addr:sc2.addr||'',org:sc2.org||'MCDOK',
    gm:staff.gm||'',gmEmail:staff.gmEmail||'',
    sup:staff.sup||'',supEmail:staff.supEmail||'',
    operator,
    hasRecords:!!(ds&&ds.records&&ds.records[loc]&&Object.keys(ds.records[loc]).filter(k=>k!=='loc').length>0)};
}


function detectAnomalies(ds, userEvents){
  if(!ds||!ds.loaded||!ds.laborRows.length)return[];
  const anoms=[];
  const storeIds=ds.storeIds||Object.keys(DEFAULT_TARGETS);
  for(const loc of storeIds){
    const rows=ds.laborRows.filter(r=>r.loc===loc&&r.sales>0).sort((a,b)=>a.date-b.date);
    if(rows.length<7)continue;
    const byDow={};
    // Build baseline excluding event-tagged dates (closures, remodels etc.)
    for(const r of rows){
      const dk=dKey(r.date);
      const ev=userEvents&&userEvents[loc]&&userEvents[loc][dk];
      if(ev&&(ev.type==='closure'||ev.type==='remodel'||ev.type==='weather')) continue; // exclude from baseline
      const d=r.date.getDay();if(!byDow[d])byDow[d]=[];byDow[d].push(r.sales);
    }
    for(const r of rows){
      const dk=dKey(r.date);
      const ev=userEvents&&userEvents[loc]&&userEvents[loc][dk];
      if(ev&&ev.type==='closure') continue; // closed days never anomalies
      const d=r.date.getDay(),vals=byDow[d];if(!vals||vals.length<4)continue;
      const mean=vals.reduce((a,v)=>a+v,0)/vals.length;
      const std=Math.sqrt(vals.reduce((a,v)=>a+(v-mean)**2,0)/vals.length);
      if(std<100)continue;
      const z=(r.sales-mean)/std;
      if(Math.abs(z)>=2.5){
        const evNote = ev ? ' [Event: '+ev.label+(ev.note?' — '+ev.note:'')+']' : '';
        anoms.push({loc,name:STORE_NAMES[loc]||('Store '+loc),date:r.date,dow:DOW_BASE[r.date.getDay()],
          metric:'Sales',actual:r.sales,mean:Math.round(mean),std:Math.round(std),z:+z.toFixed(2),
          direction:z>0?'above':'below',eventTag:ev||null,
          severity:ev?'medium':Math.abs(z)>=3.5?'critical':Math.abs(z)>=3?'high':'medium',
          note:(z>0?'Sales '+Math.round(((r.sales-mean)/mean)*100)+'% above':
                   'Sales '+Math.round(((mean-r.sales)/mean)*100)+'% below')+
               ' normal '+DOW_BASE[r.date.getDay()]+evNote});
      }
    }
  }
  return anoms.sort((a,b)=>{const sv={critical:3,high:2,medium:1};return(sv[b.severity]||0)-(sv[a.severity]||0)||(b.date-a.date);});
}

// SECTION 6: DATE PRESETS
const DATE_PRESETS=[
  {id:'yesterday',l:'Yesterday',fn:()=>{const d=addD(new Date(),-1);return{s:sodOf(d),e:eodOf(d),label:'Yesterday'};}},
  {id:'this_wk',l:'This Week',fn:()=>{const s=mwStart();return{s:sodOf(s),e:eodOf(addD(s,6)),label:'This Week'};}},
  {id:'last_wk',l:'Last Week',fn:()=>{const s=addD(mwStart(),-7);return{s:sodOf(s),e:eodOf(addD(s,6)),label:'Last Week'};}},
  {id:'next_wk',l:'Next Week',fn:()=>{const s=nwStart();return{s:sodOf(s),e:eodOf(addD(s,6)),label:'Next Week'};}},
  {id:'next_2wk',l:'Next 2 Wks',fn:()=>{const s=nwStart();return{s:sodOf(s),e:eodOf(addD(s,13)),label:'Next 2 Weeks'};}},
  {id:'next_4wk',l:'Next 4 Wks',fn:()=>{const s=nwStart();return{s:sodOf(s),e:eodOf(addD(s,27)),label:'Next 4 Weeks'};}},
  {id:'mtd',l:'Month to Date',fn:()=>{const s=new Date(new Date().getFullYear(),new Date().getMonth(),1);return{s:sodOf(s),e:eodOf(new Date()),label:'Month to Date'};}},
  {id:'last_2wk',l:'Last 2 Weeks',fn:()=>{const e=addD(new Date(),-1);const s=addD(e,-13);return{s:sodOf(s),e:eodOf(e),label:'Last 2 Weeks'};}},
  {id:'last_4wk',l:'Last 4 Weeks',fn:()=>{const e=addD(new Date(),-1);const s=addD(e,-27);return{s:sodOf(s),e:eodOf(e),label:'Last 4 Weeks'};}},
  {id:'this_mo',l:'This Month',fn:()=>{const n=new Date();const s=new Date(n.getFullYear(),n.getMonth(),1);const e=new Date(n.getFullYear(),n.getMonth()+1,0);return{s:sodOf(s),e:eodOf(e),label:'This Month'};}},
  {id:'last_mo',l:'Last Month',fn:()=>{const n=new Date();const s=new Date(n.getFullYear(),n.getMonth()-1,1);const e=new Date(n.getFullYear(),n.getMonth(),0);return{s:sodOf(s),e:eodOf(e),label:'Last Month'};}},
  {id:'next_mo',l:'Next Month',fn:()=>{const n=new Date();const s=new Date(n.getFullYear(),n.getMonth()+1,1);const e=new Date(n.getFullYear(),n.getMonth()+2,0);return{s:sodOf(s),e:eodOf(e),label:'Next Month'};}},
  {id:'ytd',l:'Year to Date',fn:()=>{const s=new Date(new Date().getFullYear(),0,1);return{s:sodOf(s),e:eodOf(new Date()),label:'Year to Date'};}},
  {id:'last_yr',l:'Last Year',fn:()=>{const y=new Date().getFullYear()-1;return{s:sodOf(new Date(y,0,1)),e:eodOf(new Date(y,11,31)),label:'Last Year'};}},
];

function mergeDS(existing, wb, type, filename) {
  // type may be a string ('peaks') or a detectType() object ({type:'peaks',...}) — normalize
  if(type && typeof type === 'object') type = type.type || 'unknown';
  // Clone existing DS arrays (shallow) and add new parsed rows
  const ds = {
    ...existing,
    laborRows:    [...existing.laborRows],
    opsRows:      [...existing.opsRows],
    ctrlRows:     [...existing.ctrlRows],
    weatherRows:  [...existing.weatherRows],
    peaksSvcRows: [...(existing.peaksSvcRows||[])],
    peaksSalesRows:[...(existing.peaksSalesRows||[])],
    auditRows:    [...(existing.auditRows||[])],
    fobRows:      [...(existing.fobRows||[])],
    trendsRows:   [...(existing.trendsRows||[])],
    inventoryRows:[...(existing.inventoryRows||[])],
    targets:      {...existing.targets},
    records:      {...existing.records},
  };
  try {
    console.log('[McForecast] Parsing file type:', type, '| Sheets:', wb.SheetNames.join(', '));
    const _beforeRows = {labor:ds.laborRows.length, ops:ds.opsRows.length, ctrl:ds.ctrlRows.length, peaks:(ds.peaksSvcRows||[]).length, audit:(ds.auditRows||[]).length};
    if(type==='labor')    ds.laborRows.push(...parseLaborData(wb));
    else if(type==='ops') ds.opsRows.push(...parseOpsData(wb));
    else if(type==='ctrl')ds.ctrlRows.push(...parseCtrlData(wb));
    else if(type==='weather')ds.weatherRows.push(...parseWeatherData(wb));
    else if(type==='targets')Object.assign(ds.targets,parseTargets(wb));
    else if(type==='peaks'){ds.peaksSvcRows.push(...parse3PeaksService(wb));ds.peaksSalesRows.push(...parse3PeaksSales(wb));}
    else if(type==='register')ds.auditRows.push(...parseRegisterAudit(wb));
    else if(type==='trends')ds.trendsRows.push(...parseTrends(wb));
    else if(type==='inventory'){const ir=parseInventoryData(wb,filename||'');if(ir.length)ds.inventoryRows.push(...ir);}
    else if(type==='dar'){
      const dm=(filename||'').match(/(\d{8})/);
      const dh=dm?new Date(dm[1].slice(0,4)+'-'+dm[1].slice(4,6)+'-'+dm[1].slice(6,8)+'T12:00:00'):new Date();
      if(!ds.darRows)ds.darRows=[];
      ds.darRows.push(...parseDARData(wb,dh));
    }
    else if(type==='pmix'){
      if(!ds.pmixData)ds.pmixData={};
      const pmx=parsePMixData(wb);
      ds.pmixData[filename||'pmix']=pmx;
    }
    else if(type==='shiftmgr'){if(!ds.shiftRows)ds.shiftRows=[];ds.shiftRows.push(...parseShiftMgr(wb));}
    else if(type==='records')Object.assign(ds.records,parseRecords(wb));
    else if(type==='ops_report'||type==='combined'){
      // Operations Report: Sales + Service + Controls + FOB sheets.
      // All sheets are period-summary format (no Business Date column).
      // Extract period date from filename (most reliable — never truncated like sheet names).
      // Handles YYYYMMDD, YYYY-MM-DD, and sheet-name fallback for any filename format.
      const _fn=String(filename||'');
      const _fnD8=_fn.match(/(\d{8})/g)||[];
      const _fnDash=_fn.match(/(\d{4}-\d{2}-\d{2})/g)||[];
      let _toDate,_fromDate;
      if(_fnD8.length>=2){
        const fmt=s=>s.slice(0,4)+'-'+s.slice(4,6)+'-'+s.slice(6,8);
        _fromDate=new Date(fmt(_fnD8[0])+'T12:00:00');
        _toDate=new Date(fmt(_fnD8[_fnD8.length-1])+'T12:00:00');
      } else if(_fnDash.length>=2){
        _fromDate=new Date(_fnDash[0]+'T12:00:00');
        _toDate=new Date(_fnDash[_fnDash.length-1]+'T12:00:00');
      } else {
        // Fallback: collect all complete YYYY-MM-DD dates from sheet names
        const _shDates=[...(new Set((wb.SheetNames||[]).flatMap(s=>(s.match(/(\d{4}-\d{2}-\d{2})/g)||[]))))].sort();
        _fromDate=_shDates.length?new Date(_shDates[0]+'T12:00:00'):null;
        _toDate=_shDates.length?new Date(_shDates[_shDates.length-1]+'T12:00:00'):new Date();
      }
      console.log('[McForecast] Ops Report date range:',_fromDate?.toDateString(),'→',_toDate?.toDateString(),'| from file:',_fn.slice(-40));
      try{ds.laborRows.push(...parseLaborData(wb,null,_toDate));}
      catch(e){console.warn('[McForecast] Sales sheet parse error:',e.message);}
      try{ds.opsRows.push(...parseOpsData(wb,null,_toDate));}
      catch(e){console.warn('[McForecast] Service sheet parse error:',e.message);}
      try{const ctr=parseCtrlData(wb,null,_toDate);if(ctr&&ctr.length)ds.ctrlRows.push(...ctr);}
      catch(e){console.warn('[McForecast] Controls sheet parse error:',e.message);}
      try{ds.fobRows.push(...parseFOBData(wb,null,_toDate,_fromDate));}
      catch(e){console.warn('[McForecast] FOB sheet parse error:',e.message);}
    }
    else {
      // Try to auto-detect sheets
      const sh=autoDetectSheets(wb);
      if(sh.labor)ds.laborRows.push(...parseLaborData(wb,sh.labor));
      if(sh.ops)ds.opsRows.push(...parseOpsData(wb,sh.ops));
      if(sh.ctrl)ds.ctrlRows.push(...parseCtrlData(wb,sh.ctrl));
    }
  } catch(e){console.warn('mergeDS parse error:',type,filename,e);}
  console.log('[McForecast] After parse - Labor:', ds.laborRows.length, 'Ops:', ds.opsRows.length, 'Ctrl:', ds.ctrlRows.length, '3Peaks:', (ds.peaksSvcRows||[]).length, 'Audit:', (ds.auditRows||[]).length);
  // Deduplication: for each (loc, date) key, keep only the LAST row added.
  // This ensures the Operations Report (which should be loaded as the most current file)
  // takes precedence over older separate files for the same dates.
  function dedup(rows){
    const seen={};
    for(let i=rows.length-1;i>=0;i--){
      const r=rows[i];if(!r.loc||!r.date)continue;
      const k=r.loc+'_'+dKey(r.date);
      if(!seen[k])seen[k]=true;else rows.splice(i,1);
    }
    return rows;
  }
  dedup(ds.laborRows);dedup(ds.opsRows);dedup(ds.ctrlRows);dedup(ds.fobRows);
  // Rebuild indexes
  function bIdx(rows){const idx={};for(const r of rows){if(!r.loc||!r.date)continue;const k=r.loc+'_'+dKey(r.date);if(!idx[k])idx[k]=[];idx[k].push(r);}return idx;}
  function bWxIdx(rows){const idx={};for(const r of rows){if(!r.date)continue;const k=dKey(r.date);if(!idx[k])idx[k]=r;}return idx;}
  ds.laborIdx=bIdx(ds.laborRows);ds.opsIdx=bIdx(ds.opsRows);
  ds.ctrlIdx=bIdx(ds.ctrlRows);ds.weatherIdx=bIdx(ds.weatherRows);
  ds.laborByLoc=bLocIdx(ds.laborRows);ds.opsByLoc=bLocIdx(ds.opsRows);
  ds.ctrlByLoc=bLocIdx(ds.ctrlRows);ds.darByLoc=bLocIdx(ds.darRows);
  ds.wxByDate=bWxIdx(ds.weatherRows);
  ds.storeIds=[...new Set(ds.laborRows.map(r=>r.loc))].sort();
  ds.loaded=ds.laborRows.length>0;
  // Auto-tag holidays on every data load (v4.195) — was previously only a
  // side-effect of generating a Review Pack, an easy-to-miss manual trigger.
  // Idempotent: skips anything already tagged, so this is safe to run on
  // every load without overwriting manual corrections.
  if(ds.loaded){
    try{
      const _existingEvents=JSON.parse(localStorage.getItem('mf_events')||'{}');
      const {events:_taggedEvents,tagged:_autoTaggedCount}=autoTagHolidays(ds.laborRows,_existingEvents);
      if(_autoTaggedCount>0) localStorage.setItem('mf_events',JSON.stringify(_taggedEvents));
    }catch(e){console.warn('Auto-holiday-tag on load failed:',e);}
  }
  ds.lastActual={};
  for(const r of ds.laborRows){if(r.sales>0){if(!ds.lastActual[r.loc]||r.date>ds.lastActual[r.loc])ds.lastActual[r.loc]=r.date;}}
  if(ds.auditRows.length>0)ds.empRisk=analyzeRegisterAudit(ds.auditRows);
  return ds;
}

// ErrorBoundary React class component
class ErrorBoundary extends React.Component {
  constructor(p){super(p);this.state={err:null};}
  static getDerivedStateFromError(e){return{err:e};}
  componentDidCatch(e,i){console.error('McForecast error:',e,i);}
  render(){
    if(this.state.err)return h('div',{style:{padding:40,fontFamily:'monospace',background:'#090e18',color:'#e2e8f0',minHeight:'100vh'}},
      h('div',{style:{color:'#f59e0b',fontSize:20,fontWeight:700,marginBottom:16}},'⚠ Meridian — Runtime Error'),
      h('div',{style:{color:'#f87171',fontSize:13,marginBottom:12}},this.state.err.message),
      h('pre',{style:{color:'#64748b',fontSize:11}},this.state.err.stack||''),
      h('button',{onClick:()=>this.setState({err:null}),style:{marginTop:20,padding:'8px 16px',background:'#f59e0b',border:'none',borderRadius:6,cursor:'pointer',fontWeight:600}},'Try to recover')
    );
    return this.props.children;
  }
}

// SECTION 7: REACT HELPERS (plain createElement)
const {useState, useEffect, useCallback, useMemo, useRef} = React;
const h = React.createElement;

// shorthand element factories
const div  = (props, ...c) => h('div',  props, ...c);
const span = (props, ...c) => h('span', props, ...c);
const btn  = (props, ...c) => h('button', props, ...c);
const inp  = (props)       => h('input',  props);
const sel  = (props, ...c) => h('select', props, ...c);
const opt  = (props, ...c) => h('option', props, ...c);
const td   = (props, ...c) => h('td',    props, ...c);
const th   = (props, ...c) => h('th',    props, ...c);
const tr   = (props, ...c) => h('tr',    props, ...c);
const tbl  = (props, ...c) => h('table', props, ...c);



// SECTION 8: DATE RANGE PICKER
function DatePicker({value, onChange}) {
  const safe = value||thisWeek();
  const [open, setOpen] = useState(false);
  const [activeP, setActiveP] = useState('next_wk');
  const [cs, setCs] = useState(fmtDI(safe.s));
  const [ce, setCe] = useState(fmtDI(safe.e));
  const ref = useRef(null);

  useEffect(() => {
    const handler = e => { if(ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const applyPreset = p => {
    const r = p.fn(); setActiveP(p.id);
    setCs(fmtDI(r.s)); setCe(fmtDI(r.e));
    onChange({...r, preset:p.id}); setOpen(false);
  };

  const applyCustom = () => {
    const s = new Date(cs+'T00:00:00'), e = new Date(ce+'T00:00:00');
    if(isNaN(s)||isNaN(e)||s>e) return;
    setActiveP('custom');
    onChange({s:sodOf(s),e:eodOf(e),label:'Custom Range',preset:'custom'});
    setOpen(false);
  };

  const mode = rngMode(safe.s, safe.e);
  const days = nDays(safe.s, safe.e);
  const badgeCls = mode==='future'?'badge-fut':mode==='past'?'badge-hist':'badge-mix';
  const modeLabel = mode==='future'?'PROJ':mode==='past'?'HIST':'MIXED';

  return div({className:'drp', ref},
    btn({className:'drp-btn', onClick:()=>setOpen(o=>!o)},
      span(null,'📅'),
      span(null, safe.label||fmtRng(safe.s,safe.e)),
      span({style:{opacity:.5,fontSize:'10px'}}, ' ('+days+'d)'),
      span(null,' ▾')
    ),
    open && div({className:'drp-popup'},
      div({className:'drp-presets'},
        DATE_PRESETS.map(p => btn({key:p.id, className:'drp-pre'+(activeP===p.id?' on':''), onClick:()=>applyPreset(p)}, p.l))
      ),
      div({className:'drp-custom'},
        h('label',null,'From'),
        inp({type:'date', value:cs, onChange:e=>setCs(e.target.value)}),
        h('label',null,'To'),
        inp({type:'date', value:ce, onChange:e=>setCe(e.target.value)}),
        btn({className:'btn btn-a btn-sm', onClick:applyCustom}, 'Apply')
      ),
      div({className:'drp-foot'},
        span({className:'drp-foot-l'}, fmtRng(safe.s,safe.e)+' · '+days+' day'+(days!==1?'s':'')),
        span({className:'badge-fut '+badgeCls, style:{padding:'2px 7px',borderRadius:'99px',fontSize:'9px',fontWeight:700}}, modeLabel)
      )
    )
  );
}




// ANOMALY PANEL
function AnomalyPanel({ds, stores, userEvents, initFilter, onSelectStore, onClose}) {
  const [filter, setFilter] = useState(initFilter||'all');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);

  const anoms = useMemo(()=>{
    if(!ds||!ds.loaded) return [];
    const raw=detectAnomalies(ds,stores);
    return raw.filter(a=>{
      if(filter==='crit'&&a.severity!=='critical') return false;
      if(filter==='warn'&&a.severity!=='warning') return false;
      if(search&&!(a.name||'').toLowerCase().includes(search.toLowerCase())&&!(a.metric||'').toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  },[ds,stores,filter,search]);

  return div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.65)',zIndex:300,display:'flex',flexDirection:'column',alignItems:'center',padding:20,overflowY:'auto'}},
    div({style:{background:'var(--surf)',borderRadius:'var(--rl)',border:'.5px solid var(--bdr2)',width:'100%',maxWidth:800,display:'flex',flexDirection:'column',maxHeight:'92vh',overflow:'hidden'}},
      div({style:{padding:'14px 18px',borderBottom:'.5px solid var(--bdr)',display:'flex',alignItems:'center',gap:10}},
        div(null,div({style:{fontSize:'15px',fontWeight:700}},'⚠ Anomaly Detection'),div({style:{fontSize:'11px',color:'var(--text2)',marginTop:2}},anoms.length+' anomalies · '+filter)),
        btn({onClick:onClose,style:{marginLeft:'auto',background:'none',border:'none',color:'var(--text2)',fontSize:20,cursor:'pointer'}},'×')
      ),
      div({style:{padding:'8px 18px',borderBottom:'.5px solid var(--bdr)',display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}},
        ['all','crit','warn'].map(f=>btn({key:f,className:'sbtn'+(filter===f?' on':''),onClick:()=>setFilter(f)},
          {all:'All',crit:'⚠ Critical',warn:'Warning'}[f])),
        inp({className:'srch',placeholder:'Search…',value:search,onChange:e=>setSearch(e.target.value),style:{marginLeft:'auto',width:130}})
      ),
      div({style:{overflowY:'auto',flex:1}},
        !ds||!ds.loaded&&div({style:{padding:30,textAlign:'center',color:'var(--text3)',fontSize:'13px'}},'Load real data to run anomaly detection.'),
        anoms.length===0&&ds&&ds.loaded&&div({style:{padding:30,textAlign:'center',color:'#10b981',fontSize:'13px'}},'✓ No anomalies detected for current filter.'),
        anoms.map((a,i)=>{
          const isCrit=a.severity==='critical';
          const isExp=expanded===i;
          return div({key:i,style:{borderBottom:'.5px solid var(--bdr)',background:isCrit?'rgba(239,68,68,.04)':'transparent'}},
            div({style:{display:'flex',alignItems:'center',gap:10,padding:'10px 18px',cursor:'pointer'},onClick:()=>setExpanded(isExp?null:i)},
              div({style:{width:6,height:6,borderRadius:'50%',background:isCrit?'#f87171':'#f59e0b',flexShrink:0}}),
              div({style:{flex:1}},
                div({style:{fontWeight:600,fontSize:'11px'}},(a.name||'')+(a.date?' · '+new Date(a.date).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}):'')),
                div({style:{fontSize:'10px',color:'var(--text3)',marginTop:2}},a.metric+' · '+(a.value||'')+(a.baseline?' vs avg '+(a.baseline):''))
              ),
              span({style:{fontSize:'10px',color:'var(--text2)'}},isExp?'▲':'▼')
            ),
            isExp&&div({style:{padding:'0 18px 12px 32px'}},
              a.description&&div({style:{fontSize:'11px',color:'var(--text2)',lineHeight:1.6,marginBottom:8}},a.description),
              a.causes&&a.causes.length>0&&div({style:{fontSize:'10px',color:'var(--text3)',marginBottom:8}},
                div({style:{fontWeight:600,marginBottom:3,color:'var(--text2)'}},'Possible causes:'),
                a.causes.map((c,ci)=>div({key:ci},ci+1+'. '+c))
              ),
              div({style:{display:'flex',gap:6}},
                a.loc&&btn({className:'btn btn-sm btn-a',onClick:()=>{const s=stores.find(st=>st.loc===a.loc);if(s){onSelectStore(s);onClose();}}},
                  '→ Open Store Dashboard'),
              )
            )
          );
        })
      )
    )
  );
}

// SHIFT ANALYSIS TAB
function ShiftAnalysisTab({store, ds, settings}) {
  const {p, t, loc} = store;
  const wb = settings.weeksBack||6;
  const cut = new Date(Date.now()-wb*7*86400000);
  const locStr = String(loc||'').trim();
  const opsRows   = ds&&ds.opsRows   ? ds.opsRows.filter(r=>r.loc===loc&&r.date>=cut)   : [];
  const laborRows = ds&&ds.laborRows ? ds.laborRows.filter(r=>r.loc===loc&&r.date>=cut) : [];
  const ctrlRows  = ds&&ds.ctrlRows  ? ds.ctrlRows.filter(r=>r.loc===loc&&r.date>=cut)  : [];
  const cAvg=(f)=>ctrlRows.length?ctrlRows.reduce((a,r)=>a+(r[f]||0),0)/ctrlRows.filter(r=>r[f]>0).length||0:0;
  const hasPeaks  = ds&&ds.peaksSvcRows&&ds.peaksSvcRows.some(r=>String(r.loc||'').trim()===locStr);
  const peaksData = hasPeaks ? analyzePeaks(ds.peaksSvcRows,ds.peaksSalesRows,loc,wb) : null;
  const dayDates  = laborRows.filter(r=>{const d=r.date.getDay();return d>=1&&d<=5;});
  const wkndDates = laborRows.filter(r=>{const d=r.date.getDay();return d===0||d===6;});
  const avgDay    = dayDates.length  ? dayDates.reduce((a,r)=>a+r.sales,0)/dayDates.length  : 0;
  const avgWknd   = wkndDates.length ? wkndDates.reduce((a,r)=>a+r.sales,0)/wkndDates.length: 0;

  const dowData = [0,1,2,3,4,5,6].map(d=>{
    const lR=laborRows.filter(r=>r.date.getDay()===d);
    const oR=opsRows.filter(r=>r.date.getDay()===d);
    const oAvg=(f)=>oR.length?oR.reduce((a,r)=>a+(r[f]||0),0)/oR.length:0;
    const lAvg=(f)=>lR.length?lR.reduce((a,r)=>a+(r[f]||0),0)/lR.length:0;
    return{dow:DOW_BASE[d],n:lR.length,sales:lR.length?lR.reduce((a,r)=>a+r.sales,0)/lR.length:0,
      oepe:oAvg('oepe'),kvst:oAvg('kvst'),park:oAvg('park'),r2p:oAvg('r2p'),
      tpph:cAvg('tpph')||lAvg('tpph')||oAvg('tpph'),kvsu:oAvg('kvsu'),labor:cAvg('laborPct')||lAvg('laborPct'),ot:cAvg('otHrs')||lAvg('otHrs')};
  });
  const maxSales = Math.max(...dowData.map(d=>d.sales),1);
  const best  = dowData.reduce((b,d)=>d.sales>b.sales?d:b,dowData[0]);
  const worst = dowData.filter(d=>d.sales>0).reduce((b,d)=>d.sales<b.sales?d:b,dowData.find(d=>d.sales>0)||dowData[0]);

  const SliceCard = ({sl, data}) => {
    const info={breakfast:{label:'Breakfast',time:'7–9 AM',col:'#f59e0b'},lunch:{label:'Lunch',time:'11 AM–2 PM',col:'#10b981'},dinner:{label:'Dinner',time:'5–7 PM',col:'#818cf8'}};
    const inf=info[sl]||{label:sl,time:'',col:'#94a3b8'};
    if(!data||(!data.oepe&&!data.netSales))return null;
    const oepeOk=data.oepe>0&&t.tOepe>0?data.oepe<=t.tOepe:null;
    return div({style:{background:'var(--surf2)',border:`.5px solid ${inf.col}33`,borderRadius:'var(--r)',padding:'10px 12px',flex:1,minWidth:140}},
      div({style:{display:'flex',alignItems:'baseline',gap:6,marginBottom:8}},
        span({style:{fontSize:'12px',fontWeight:700,color:inf.col}},inf.label),
        span({style:{fontSize:'9px',color:'var(--text3)'}},inf.time)
      ),
      [{l:'OEPE',v:data.oepe>0?Math.round(data.oepe)+'s':'—',ok:oepeOk},
       {l:'R2P', v:data.r2p>0?Math.round(data.r2p)+'s':'—',ok:data.r2p>0?data.r2p<=90:null},
       {l:'KVS', v:data.kvst>0?Math.round(data.kvst)+'s':'—',ok:data.kvst>0&&t.tKvst>0?data.kvst<=t.tKvst:null},
       {l:'Parked',v:data.parkPct>0?fP(data.parkPct,1):'—',ok:null},
       {l:'Sales',v:data.netSales>0?f$(Math.round(data.netSales)):'—',ok:null},
       {l:'TPPH', v:data.tpph>0?data.tpph.toFixed(2):'—',ok:data.tpph>0&&t.tTpph>0?data.tpph>=t.tTpph:null},
      ].map((m,i)=>div({key:i,style:{display:'flex',justifyContent:'space-between',fontSize:'10px',padding:'3px 0',borderBottom:i<5?'.5px solid var(--bdr)':'none'}},
        span({style:{color:'var(--text3)'}},m.l),
        span({style:{fontFamily:'var(--mono)',color:m.ok===null?'var(--text)':m.ok?'#10b981':'#f97316',fontWeight:m.ok!==null?600:400}},m.v)
      ))
    );
  };

  return div(null,
    div({style:{display:'flex',alignItems:'center',gap:10,marginBottom:12,flexWrap:'wrap'}},
    div({style:{fontSize:'13px',fontWeight:700}},'⏱ Shift Analysis'),
    div({style:{fontSize:'10px',color:'var(--text3)',background:'var(--surf2)',border:'.5px solid var(--bdr)',borderRadius:4,padding:'2px 8px'}},
      'Last '+wb+' weeks · '+new Date(Date.now()-wb*7*86400000).toLocaleDateString('en-US',{month:'short',day:'numeric'})+' – Today · Avg per day of week'
    )
  ),
    laborRows.length>0&&div({style:{marginBottom:14}},
      div({style:{fontSize:'10px',fontWeight:600,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.4px',marginBottom:8}},'Weekday vs Weekend'),
      div({style:{display:'flex',gap:8,flexWrap:'wrap'}},
        [{label:'Mon–Fri Avg',val:avgDay,col:'#60a5fa'},{label:'Sat–Sun Avg',val:avgWknd,col:'#f59e0b'},
         {label:'Wknd Premium',val:avgDay>0?(avgWknd-avgDay)/avgDay:0,col:'#34d399',isPct:true,tip:'How much more the store sells per day on weekends vs weekdays. Positive = weekends are stronger.'}
        ].map((k,i)=>div({key:i,style:{background:'var(--surf2)',border:'.5px solid var(--bdr)',borderRadius:'var(--r)',padding:'10px 14px',flex:1,minWidth:120}},
          div({style:{fontSize:'10px',color:'var(--text3)',marginBottom:4}},k.label),
          div({style:{fontFamily:'var(--mono)',fontSize:'17px',fontWeight:700,color:k.col}},
            k.isPct?fPct(k.val):k.val>0?f$(Math.round(k.val)):'—'),k.tip&&div({title:k.tip,style:{fontSize:'8px',color:'var(--text3)',marginTop:2,cursor:'help'}},k.label==='Wknd Premium'?'ℹ Sat/Sun avg vs Mon–Fri avg':'')
        ))
      )
    ),
    laborRows.length>0&&div({style:{marginBottom:14}},
      div({style:{fontSize:'10px',fontWeight:600,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.4px',marginBottom:8}},'Average Sales by Day of Week'),
      div({style:{display:'flex',gap:5,alignItems:'flex-end',height:80,padding:'0 2px'}},
        dowData.map((d,i)=>{
          const barH=maxSales>0?Math.max(6,(d.sales/maxSales)*68):6;
          const isWknd=i===0||i===6;
          return div({key:i,style:{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:2}},
            d.sales>0&&div({style:{fontSize:'8px',color:'var(--text3)',fontFamily:'var(--mono)'}},'$'+Math.round(d.sales/1000)+'K'),
            div({style:{width:'100%',height:barH+'px',background:isWknd?'#f59e0b':'#60a5fa',borderRadius:'2px 2px 0 0',
              opacity:d.n>0?1:.2,position:'relative'}},
              (d===best||d===worst)&&div({style:{position:'absolute',top:-12,width:'100%',textAlign:'center',fontSize:'8px',color:d===best?'#10b981':'#f97316'}},d===best?'▲':'▼')
            ),
            div({style:{fontSize:'9px',color:'var(--text3)',fontWeight:isWknd?600:400}},d.dow.slice(0,3))
          );
        })
      )
    ),
    div({style:{marginBottom:14}},
      div({style:{fontSize:'10px',fontWeight:600,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.4px',marginBottom:8}},'Ops Metrics by Day of Week'),
      div({style:{overflowX:'auto'}},
        tbl({style:{width:'100%',borderCollapse:'collapse',fontSize:'10px',tableLayout:'fixed'}},
          h('thead',null,tr(null,
            ...[['Day',60],['Days',38],['Sales',70],['OEPE',55],['KVS',50],['Park%',52],['R2P',48],['TPPH',50],['KVS%',50],['Labor%',55],['OT',44]]
            .map(([l,w])=>th({style:{padding:'4px 6px',background:'var(--surf3)',fontSize:'8px',textTransform:'uppercase',letterSpacing:'.3px',color:'var(--text2)',textAlign:l==='Day'?'left':'right',borderBottom:'.5px solid var(--bdr)',width:w,whiteSpace:'nowrap'}},l))
          )),
          h('tbody',null,dowData.map((d,i)=>{
            const isWknd=i===0||i===6;
            const c2=(ok)=>ok===null?'var(--text3)':ok?'#10b981':'#f97316';
            const oepeOk=d.oepe>0&&t.tOepe>0?d.oepe<=t.tOepe:null;
            const kvstOk=d.kvst>0&&t.tKvst>0?d.kvst<=t.tKvst:null;
            const parkOk=d.park>0?(d.park>=.12&&d.park<=.16):null;
            const r2pOk=d.r2p>0?d.r2p<=90:null;
            const tpphOk=d.tpph>0&&t.tTpph>0?d.tpph>=t.tTpph:null;
            const lDiff=d.labor>0&&t.tLabor>0?Math.abs(d.labor-t.tLabor):null;
            const laborOk=lDiff!=null?lDiff<=(settings.laborGreenPct||0.5)/100:null;
            const otOk=d.ot>0?d.ot<=2:null;
            return tr({key:i,style:{borderBottom:'.5px solid var(--bdr)',background:i%2===0?'transparent':'rgba(255,255,255,.01)'}},
              td({style:{padding:'4px 6px',fontWeight:isWknd?700:400,color:isWknd?'#f59e0b':'var(--text)'}},
                d.dow+(d===best?' ▲':d===worst&&d.sales>0?' ▼':'')),
              td({style:{padding:'4px 6px',textAlign:'right',color:'var(--text3)'}},d.n>0?d.n:'—'),
              td({style:{padding:'4px 6px',textAlign:'right',fontFamily:'var(--mono)',fontWeight:600}},d.sales>0?f$(Math.round(d.sales)):'—'),
              td({style:{padding:'4px 6px',textAlign:'right',fontFamily:'var(--mono)',color:c2(oepeOk)}},d.oepe>0?Math.round(d.oepe)+'s':'—'),
              td({style:{padding:'4px 6px',textAlign:'right',fontFamily:'var(--mono)',color:c2(kvstOk)}},d.kvst>0?Math.round(d.kvst)+'s':'—'),
              td({style:{padding:'4px 6px',textAlign:'right',fontFamily:'var(--mono)',color:c2(parkOk)}},d.park>0?fP(d.park,1):'—'),
              td({style:{padding:'4px 6px',textAlign:'right',fontFamily:'var(--mono)',color:c2(r2pOk)}},d.r2p>0?Math.round(d.r2p)+'s':'—'),
              td({style:{padding:'4px 6px',textAlign:'right',fontFamily:'var(--mono)',color:c2(tpphOk)}},d.tpph>0?d.tpph.toFixed(2):'—'),
              td({style:{padding:'4px 6px',textAlign:'right',fontFamily:'var(--mono)',color:d.kvsu>0&&t.tKvsu>0?(d.kvsu>=t.tKvsu?'#10b981':'#ef4444'):'var(--text3)'}},d.kvsu>0?fP(d.kvsu,1):'—'),
              td({style:{padding:'4px 6px',textAlign:'right',fontFamily:'var(--mono)',color:c2(laborOk)}},d.labor>0?fP(d.labor,1):'—'),
              td({style:{padding:'4px 6px',textAlign:'right',fontFamily:'var(--mono)',color:c2(otOk)}},d.ot>0?d.ot.toFixed(1):'—')
            );
          }))
        )
      ),
      div({style:{display:'flex',gap:10,marginTop:5,fontSize:'9px',color:'var(--text3)'}},
        span(null,span({style:{color:'#10b981'}},'● '),'On target'),
        span(null,span({style:{color:'#f97316'}},'● '),'Off target'),
        span({style:{marginLeft:'auto'}},'▲ Best day  ▼ Lowest day')
      )
    ),
    div({style:{marginBottom:12}},
      div({style:{fontSize:'10px',fontWeight:600,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.4px',marginBottom:8}},
        'Peak Daypart Performance'+(hasPeaks?' (3 Peaks Data)':' — Load 3 Peaks file to unlock')
      ),
      hasPeaks&&div({style:{display:'flex',gap:8,flexWrap:'wrap'}},
        ['breakfast','lunch','dinner'].map(sl=>peaksData&&peaksData[sl]&&h(SliceCard,{key:sl,sl,data:peaksData[sl]}))
      ),
      !hasPeaks&&div({style:{padding:'12px',background:'var(--surf2)',border:'.5px solid var(--bdr)',borderRadius:'var(--r)',fontSize:'11px',color:'var(--text3)'}},
        'Load a 3 Peaks YYYY-MM-DD to YYYY-MM-DD.xlsx file to unlock Breakfast / Lunch / Dinner performance breakdown.'
      )
    ),
    h(AITabInsight,{
      label:'AI Labor & Shift Analysis',
      buildPrompt:()=>{
        const storeName = STORE_NAMES[loc]||loc;
        const laborPct = p.laborPct>0?(p.laborPct*100).toFixed(1)+'%':'N/A';
        const targetLab = t.tLabor?(t.tLabor*100).toFixed(1)+'%':'N/A';
        const tpph = p.tpph>0?p.tpph.toFixed(2):'N/A';
        return 'You are a McDonald\'s labor management expert. Analyze shift data for '+storeName+' (store #'+loc+').\n\n'+
          'Labor %: '+laborPct+' (target: '+targetLab+')\n'+
          'TPPH: '+tpph+' (target: '+(t.tTpph||'N/A')+')\n'+
          'OEPE: '+(p.oepe>0?Math.round(p.oepe)+'s':'N/A')+' (target: '+(t.tOepe||'N/A')+'s)\n'+
          'Avg rate: $'+(p.avgRate>0?p.avgRate.toFixed(2):'N/A')+'\n\n'+
          'Based on this data, provide 3-5 specific recommendations to optimize labor scheduling, reduce over/under staffing, and improve crew productivity. Include specific tactics for peak vs off-peak deployment.';
      }
    })
  );
}

// OPS BAR CHART

// MULTI-MODEL PROJECTION PANEL
function ModelComparisonPanel({loc, date, ds, settings, userEvents}) {
  const [accuracy,   setAccuracy]   = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [drillWeek,  setDrillWeek]  = useState(null); // week index to drill into
  const wb = settings.weeksBack||6;

  const models = useMemo(()=>{
    if(!ds||!ds.loaded) return null;
    return forecastModels(loc, date, ds, {...settings,_userEvents:userEvents});
  },[loc, date, ds, settings]);

  // Build 6-week actual history
  const weekHistory = useMemo(()=>{
    if(!ds||!ds.laborRows) return [];
    const now = new Date();
    const weeks = [];
    for(let w=0;w<wb;w++){
      const wEnd   = new Date(now); wEnd.setDate(now.getDate()-w*7);
      const wStart = new Date(wEnd); wStart.setDate(wEnd.getDate()-6);
      const rows   = ds.laborRows.filter(r=>r.loc===loc&&r.date>=wStart&&r.date<=wEnd&&r.sales>0)
                      .sort((a,b)=>a.date-b.date);
      if(!rows.length) continue;
      const totalAct = rows.reduce((a,r)=>a+r.sales,0);
      // Run forecast model for each day to get model predictions
      const days = rows.map(r=>{
        const m = forecastModels(loc, r.date, ds, {...settings,_userEvents:userEvents});
        return {date:r.date, actual:r.sales,
          m1:m.composite?.forecast||0, m2:m.trendOnly?.forecast||0,
          m3:m.momentum?.forecast||0,  m4:m.regression?.forecast||0,
          ens:m.ensemble?.forecast||0};
      });
      const totM1  = days.reduce((a,d)=>a+d.m1,0);
      const totEns = days.reduce((a,d)=>a+d.ens,0);
      const varM1  = totM1>0  ? (totalAct-totM1)/totM1   : null;
      const varEns = totEns>0 ? (totalAct-totEns)/totEns : null;
      weeks.push({w, wStart, wEnd, totalAct, totM1, totEns, varM1, varEns, days,
        label: wStart.toLocaleDateString('en-US',{month:'short',day:'numeric'})+
               '–'+wEnd.toLocaleDateString('en-US',{month:'short',day:'numeric'})});
    }
    return weeks.reverse(); // oldest first
  },[loc, ds, settings, wb]);

  const runAccuracy = () => {
    setLoading(true);
    setTimeout(()=>{
      const acc = modelAccuracy(loc, ds, {...settings,_userEvents:userEvents}, wb);
      setAccuracy(acc);
      setLoading(false);
    }, 0);
  };

  if(!models) return div({style:{padding:16,color:'var(--text3)',fontSize:'11px'}},'Load data to run model comparison.');

  const MODEL_COLS = ['#60a5fa','#34d399','#f59e0b','#a78bfa','#f472b6'];
  const MODEL_NAMES = {m1:'Composite',m2:'Trend-Only',m3:'Momentum',m4:'Regression',ens:'Ensemble'};

  return div({style:{padding:'12px 16px'}},
    // ── Header
    div({style:{display:'flex',alignItems:'center',gap:10,marginBottom:8,flexWrap:'wrap'}},
      div(null,
        div({style:{fontSize:'13px',fontWeight:700}},'📐 Projection Model Comparison'),
        div({style:{fontSize:'10px',color:'var(--text3)',marginTop:2}},
          accuracy&&accuracy._best
            ? '★ Most accurate: '+(MODEL_NAMES[accuracy._best]||accuracy._best)+
              (accuracy[accuracy._best]?' ('+accuracy[accuracy._best].mape.toFixed(1)+'% avg error)':'')
            : 'Hit ⚡ Score to backtest all 5 models — the winner gets a star.'
        )
      ),
      btn({className:'btn btn-sm',style:{marginLeft:'auto'},onClick:runAccuracy,disabled:loading},
        loading?'⏳ Scoring…':'⚡ Score Accuracy ('+wb+'wk)')
    ),

    // ── Model cards — today forecast
    div({style:{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:6,marginBottom:14}},
      models.allModels.filter(m=>m.forecast>0).map((m,i)=>{
        const acc = accuracy&&accuracy[m.key];
        const isBest = accuracy&&accuracy._best===m.key;
        return div({key:m.key,style:{
          background:'var(--surf2)',
          border:`.5px solid ${isBest?MODEL_COLS[i]:'var(--bdr)'}`,
          borderRadius:'var(--r)',padding:'8px 10px',textAlign:'center',
          boxShadow:isBest?`0 0 10px ${MODEL_COLS[i]}40`:undefined}},
          isBest&&div({style:{fontSize:'8px',fontWeight:700,color:MODEL_COLS[i],marginBottom:2,letterSpacing:'.4px'}},'★ BEST'),
          div({style:{fontSize:'9px',fontWeight:600,color:MODEL_COLS[i],marginBottom:4}},m.name),
          div({style:{fontFamily:'var(--mono)',fontSize:'18px',fontWeight:700,marginBottom:2}},f$(m.forecast)),
          acc&&div({style:{fontSize:'9px',color:acc.mape<=5?'#10b981':acc.mape<=10?'#f59e0b':'#ef4444',fontWeight:600}},
            acc.accuracy+'% acc · '+acc.mape.toFixed(1)+'% err')
        );
      })
    ),

    // ── 6-Week Actual History table
    weekHistory.length>0&&div(null,
      div({style:{fontSize:'10px',fontWeight:700,color:'var(--text2)',marginBottom:6,
        textTransform:'uppercase',letterSpacing:'.4px'}},
        'Last '+wb+' Weeks — Actual vs Model'),
      tbl({style:{width:'100%',borderCollapse:'collapse',fontSize:'10px',marginBottom:12}},
        h('thead',null,tr(null,
          ...[['Week','left'],['Actual','right'],['Composite','right'],
              ['vs Act','right'],['Ensemble','right'],['vs Act','right']].map(([l,a])=>
            th({style:{padding:'4px 8px',background:'var(--surf3)',fontSize:'8px',
              textTransform:'uppercase',letterSpacing:'.3px',color:'var(--text3)',
              textAlign:a,borderBottom:'.5px solid var(--bdr)'}},l)
          )
      )),
        h('tbody',null,weekHistory.map((wk,i)=>{
          const isOpen = drillWeek===i;
          const varM1col = wk.varM1===null?'var(--text3)':Math.abs(wk.varM1)<.02?'#10b981':Math.abs(wk.varM1)<.05?'#f59e0b':'#ef4444';
          const varEnscol= wk.varEns===null?'var(--text3)':Math.abs(wk.varEns)<.02?'#10b981':Math.abs(wk.varEns)<.05?'#f59e0b':'#ef4444';
          return [
            tr({key:'r'+i,
              onClick:()=>setDrillWeek(isOpen?null:i),
              style:{borderBottom:'.5px solid var(--bdr)',cursor:'pointer',
                background:isOpen?'rgba(96,165,250,.06)':'transparent'}},
              td({style:{padding:'5px 8px',fontWeight:600,color:'var(--text2)'}},'← '+wk.label),
              td({style:{padding:'5px 8px',textAlign:'right',fontFamily:'var(--mono)',fontWeight:700}},f$(wk.totalAct)),
              td({style:{padding:'5px 8px',textAlign:'right',fontFamily:'var(--mono)',color:'var(--text3)'}},wk.totM1>0?f$(wk.totM1):'—'),
              td({style:{padding:'5px 8px',textAlign:'right',fontFamily:'var(--mono)',fontWeight:600,color:varM1col}},
                wk.varM1!==null?((wk.varM1>=0?'+':'')+fPct(wk.varM1)):'—'),
              td({style:{padding:'5px 8px',textAlign:'right',fontFamily:'var(--mono)',color:'var(--text3)'}},wk.totEns>0?f$(wk.totEns):'—'),
              td({style:{padding:'5px 8px',textAlign:'right',fontFamily:'var(--mono)',fontWeight:600,color:varEnscol}},
                wk.varEns!==null?((wk.varEns>=0?'+':'')+fPct(wk.varEns)):'—')
            ),
            // Drill-down rows
            isOpen&&wk.days.map((day,di)=>
              tr({key:'d'+i+di,style:{background:'rgba(96,165,250,.04)',borderBottom:'.5px solid rgba(255,255,255,.04)'}},
                td({style:{padding:'3px 8px 3px 20px',color:'var(--text3)',fontSize:'9px'}},
                  day.date.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})),
                td({style:{padding:'3px 8px',textAlign:'right',fontFamily:'var(--mono)',fontSize:'10px',
                  fontWeight:700,color:'#60a5fa'}},f$(day.actual)),
                td({style:{padding:'3px 8px',textAlign:'right',fontFamily:'var(--mono)',fontSize:'10px',color:'var(--text3)'}},
                  day.m1>0?f$(day.m1):'—'),
                td({style:{padding:'3px 8px',textAlign:'right',fontFamily:'var(--mono)',fontSize:'9px',
                  color:day.m1>0?Math.abs(day.actual-day.m1)/day.actual<.02?'#10b981':'#f87171':'var(--text3)'}},
                  day.m1>0?((day.actual>=day.m1?'+':'')+fPct((day.actual-day.m1)/day.m1)):'—'),
                td({style:{padding:'3px 8px',textAlign:'right',fontFamily:'var(--mono)',fontSize:'10px',color:'var(--text3)'}},
                  day.ens>0?f$(day.ens):'—'),
                td({style:{padding:'3px 8px',textAlign:'right',fontFamily:'var(--mono)',fontSize:'9px',
                  color:day.ens>0?Math.abs(day.actual-day.ens)/day.actual<.02?'#10b981':'#f87171':'var(--text3)'}},
                  day.ens>0?((day.actual>=day.ens?'+':'')+fPct((day.actual-day.ens)/day.ens)):'—')
              )
            )
          ];
        }))
      ),
      // Summary footer
      weekHistory.length>=2&&div({style:{fontSize:'10px',color:'var(--text3)',
        background:'var(--surf2)',borderRadius:'var(--r)',padding:'8px 12px'}},
        span({style:{fontWeight:600,color:'var(--text)'}},'Spread: '),
        f$(Math.min(...models.allModels.filter(m=>m.forecast>0).map(m=>m.forecast))),
        ' – ',
        f$(Math.max(...models.allModels.filter(m=>m.forecast>0).map(m=>m.forecast))),
        span({style:{marginLeft:12,color:'#94a3b8'}},'Click any week row to see daily breakdown.')
      )
    )
  );
}

// REVENUE INTELLIGENCE ENGINE
// The thing you haven't thought of:
// Dollar value of OEPE gap + unrealized revenue
// Daypart erosion as competitive pressure signal
// Labor efficiency inflection analysis
function computeRevenueOpportunity(store, ds, settings) {
  const {p, t, loc} = store;
  const result = {};

  // 1. OEPE Dollar Gap — what is each second of OEPE improvement worth?
  if(p.oepe>0 && t.tOepe>0 && p.oepe>t.tOepe) {
    const gapSec = p.oepe - t.tOepe;
    const dtGCPerHour = p.dtGC>0 ? p.dtGC : 50; // cars/hour estimate
    const avgCheck = p.avgCheck>0 ? p.avgCheck : (p.laborPct>0&&p.tpph>0?9.50:8.50);
    // At current OEPE, cars/hr = 3600/OEPE. At target, = 3600/tOepe.
    const currentRate = 3600/p.oepe;
    const targetRate  = 3600/t.tOepe;
    const addlCarsPerHour = Math.max(0, targetRate - currentRate);
    const revenuePerHour  = addlCarsPerHour * avgCheck;
    const peakHours = 4; // conservative: breakfast+lunch peak
    const dailyOpportunity = revenuePerHour * peakHours;
    const monthlyOpportunity = dailyOpportunity * 30;
    const valuePerSecond = dailyOpportunity / gapSec;
    result.oepe = {gapSec, addlCarsPerHour:+addlCarsPerHour.toFixed(2),
      dailyOpportunity:+dailyOpportunity.toFixed(2), monthlyOpportunity:+monthlyOpportunity.toFixed(0),
      valuePerSecond:+valuePerSecond.toFixed(2), avgCheck, dtGCPerHour};
  }

  // 2. DT Parked % Optimization — where is the efficiency sweet spot?
  if(p.park>0 && ds && ds.peaksSvcRows) {
    const locStr = String(loc||'').trim();
    const svcRows = ds.peaksSvcRows.filter(r=>String(r.loc||'').trim()===locStr&&r.parkPct>0&&r.tpph>0);
    if(svcRows.length>=6) {
      // Find park% range where TPPH is highest
      const buckets = {};
      svcRows.forEach(r=>{
        const bucket=Math.round(r.parkPct*100/5)*5; // 5% buckets
        if(!buckets[bucket])buckets[bucket]=[];
        buckets[bucket].push(r.tpph||0);
      });
      const avgByBucket = Object.entries(buckets).map(([pct,tpphs])=>
        ({pct:+pct,tpph:tpphs.reduce((a,v)=>a+v,0)/tpphs.length,n:tpphs.length}))
        .filter(b=>b.n>=2).sort((a,b)=>b.tpph-a.tpph);
      if(avgByBucket.length>0) {
        result.parkOpt = {
          optimalParkPct:avgByBucket[0].pct,
          currentParkPct:Math.round(p.park*100),
          bestTPPH:+avgByBucket[0].tpph.toFixed(2),
          currentTPPH:p.tpph||0,
          note:avgByBucket[0].pct<14?'Your data shows TPPH peaks at lower park rates — you may be over-parking.':
               avgByBucket[0].pct>20?'Your data shows TPPH improves with higher park rates — consider staging more aggressively.':
               'Park rate is near the optimal zone based on your data.'
        };
      }
    }
  }

  // 3. Daypart Erosion — asymmetric decline signals competitive pressure
  if(ds && ds.peaksSalesRows) {
    const locStr = String(loc||'').trim();
    const wb6 = (settings&&settings.weeksBack)||6;
    const cut12 = new Date(Date.now()-wb6*2*7*86400000); // 2× lookback for comparison base
    const cut6  = new Date(Date.now()-wb6*7*86400000);   // lookback period
    const slices = ['breakfast','lunch','dinner'];
    const erosion = {};
    for(const sl of slices) {
      const all   = ds.peaksSalesRows.filter(r=>String(r.loc||'').trim()===locStr&&normSlice(r.slice)===sl&&r.date>=cut12);
      const recent= all.filter(r=>r.date>=cut6);
      const older = all.filter(r=>r.date<cut6);
      if(recent.length>=3&&older.length>=3) {
        const avgR = recent.reduce((a,r)=>a+r.netSales,0)/recent.length;
        const avgO = older.reduce((a,r)=>a+r.netSales,0)/older.length;
        const trend = avgO>0?(avgR-avgO)/avgO:0;
        erosion[sl] = {trend:+trend.toFixed(4), avgRecent:+avgR.toFixed(0), avgOlder:+avgO.toFixed(0)};
      }
    }
    if(Object.keys(erosion).length>=2) {
      const trends = Object.values(erosion).map(e=>e.trend);
      const overallTrend = trends.reduce((a,v)=>a+v,0)/trends.length;
      const maxVariance = Math.max(...trends)-Math.min(...trends);
      // Asymmetric: one daypart significantly worse than others
      const isAsymmetric = maxVariance>0.06;
      const worstSlice = Object.entries(erosion).sort((a,b)=>a[1].trend-b[1].trend)[0];
      const bestSlice  = Object.entries(erosion).sort((a,b)=>b[1].trend-a[1].trend)[0];
      result.erosion = {erosion, overallTrend:+overallTrend.toFixed(4), isAsymmetric,
        worstSlice:worstSlice[0], worstTrend:worstSlice[1].trend,
        bestSlice:bestSlice[0], bestTrend:bestSlice[1].trend,
        competitiveSignal: isAsymmetric && worstSlice[1].trend<-0.05,
        explanation: isAsymmetric && worstSlice[1].trend<-0.05
          ? `${worstSlice[0].charAt(0).toUpperCase()+worstSlice[0].slice(1)} is declining ${fPct(Math.abs(worstSlice[1].trend))} while other dayparts hold — this is the signature of a nearby competitor taking market share in a specific window, not an overall traffic issue. Check what opened near this store in the last 90 days.`
          : overallTrend<-0.03
          ? 'All dayparts declining proportionally — likely a traffic, economic, or macro-level issue rather than a competitive threat.'
          : 'Daypart mix is stable. No asymmetric erosion detected.'
      };
    }
  }

  // 4. TPPH Gap
  if(p.tpph>0 && t.tTpph>0 && p.tpph<t.tTpph) {
    const gap=t.tTpph-p.tpph, avgCheck=p.avgCheck>0?p.avgCheck:8.50;
    const addlTx=gap*8*4; // gap × crew × peak hrs
    result.tpph={gap:+gap.toFixed(2),dailyOpportunity:+(addlTx*avgCheck).toFixed(0),
      monthlyOpportunity:+(addlTx*avgCheck*30).toFixed(0),
      note:'TPPH gap of '+gap.toFixed(2)+' vs target. ~'+addlTx.toFixed(0)+' missed transactions/day at current check average.'};
  }

  // 5. Average Check Gap
  if(p.avgCheck>0 && t.tAvgCheck>0 && p.avgCheck<t.tAvgCheck) {
    const gap=t.tAvgCheck-p.avgCheck, dailyGC=Math.max((p.dtGC||0)+(p.tpph||0)*32,200);
    result.avgCheck={gap:+gap.toFixed(2),current:+p.avgCheck.toFixed(2),target:+t.tAvgCheck.toFixed(2),
      dailyOpportunity:+(gap*dailyGC).toFixed(0),monthlyOpportunity:+(gap*dailyGC*30).toFixed(0),
      note:'Check avg $'+p.avgCheck.toFixed(2)+' vs $'+t.tAvgCheck.toFixed(2)+' target. $'+gap.toFixed(2)+' gap × ~'+Math.round(dailyGC)+' daily transactions.'};
  }

  // 6. Labor % Overage
  if(p.laborPct>0 && t.tLabor>0 && p.laborPct>t.tLabor) {
    const gap=p.laborPct-t.tLabor, weekly=p.weeklySales||5000;
    result.labor={gapPct:+(gap*100).toFixed(2),weeklyDollarImpact:+(gap*weekly).toFixed(0),
      monthlyDollarImpact:+(gap*weekly*4.3).toFixed(0),
      note:'Labor '+( gap*100).toFixed(2)+'% over target. ~$'+(gap*weekly).toFixed(0)+'/week in excess labor at current sales pace.'};
  }

  // 7. OT Cost
  if(p.otHrs>0) {
    const rate=p.avgRate>0?p.avgRate:12, cost=p.otHrs*rate*0.5;
    result.ot={dailyOTHrs:+p.otHrs.toFixed(1),dailyOTCost:+cost.toFixed(0),
      weeklyOTCost:+(cost*7).toFixed(0),monthlyOTCost:+(cost*7*4.3).toFixed(0),
      note:p.otHrs.toFixed(1)+' OT hrs/day avg × $'+rate.toFixed(2)+' × 50% premium = ~$'+cost.toFixed(0)+'/day avoidable cost.'};
  }

  // 8. Cash O/S Exposure
  if(p.cashOSPct!=null && Math.abs(p.cashOSPct)>0.002) {
    const weekly=p.weeklySales||5000, exposure=Math.abs(p.cashOSPct)*weekly;
    result.cashExposure={osPct:p.cashOSPct,weeklyExposure:+exposure.toFixed(0),annualExposure:+(exposure*52).toFixed(0),
      note:'Cash O/S at '+fP(Math.abs(p.cashOSPct),2)+'=~$'+exposure.toFixed(0)+'/week ($'+(exposure*52).toFixed(0)+' annualized). '+(Math.abs(p.cashOSPct)>0.01?'INVESTIGATE.':'Monitor.')};
  }

  // 9. Avg Check Momentum
  if(p.avgCheck>0){
    const r2 = (ds.laborRows||[]).filter(r=>r.loc===loc&&r.date>=new Date(Date.now()-14*864e5)&&r.avgCheck>0);
    const r6 = (ds.laborRows||[]).filter(r=>r.loc===loc&&r.date>=new Date(Date.now()-42*864e5)&&r.date<new Date(Date.now()-14*864e5)&&r.avgCheck>0);
    const ac2=r2.length?r2.reduce((a,r)=>a+r.avgCheck,0)/r2.length:0;
    const ac6=r6.length?r6.reduce((a,r)=>a+r.avgCheck,0)/r6.length:0;
    if(ac2>0&&ac6>0){
      const mom=(ac2-ac6)/ac6, wkGC=p.avgGC||500;
      result.avgCheckMomentum={current:+ac2.toFixed(2),prior:+ac6.toFixed(2),momentum:+mom.toFixed(4),
        direction:mom>=0?'up':'down',weeklyImpact:+(mom*ac6*wkGC*7).toFixed(0),
        note:'Avg check '+(mom>=0?'up':'down')+' '+(Math.abs(mom)*100).toFixed(1)+'% vs prior 4 wks. '
          +(mom<-0.02?'Investigate upsell, suggestive selling, combo attachment.':mom>0.02?'Positive momentum — protect with LTO & combo focus.':'Avg check stable.')};
    }
  }

  // 10. DT Sales Mix
  const dtR=(ds.laborRows||[]).filter(r=>r.loc===loc&&r.date>=new Date(Date.now()-42*864e5)&&r.sales>0&&(r.dtSales||0)>0);
  if(dtR.length>=5){
    const dtMix=dtR.reduce((a,r)=>a+(r.dtSales/r.sales),0)/dtR.length;
    const tDT=t.tDtPct||0.70, gap=tDT-dtMix;
    if(Math.abs(gap)>0.03)
      result.dtSalesMix={actual:+dtMix.toFixed(4),target:+tDT.toFixed(4),gap:+gap.toFixed(4),
        weeklyImpact:+(Math.abs(gap)*(p.weeklySales||30000)).toFixed(0),
        note:'DT mix '+(dtMix*100).toFixed(1)+'% vs '+(tDT*100).toFixed(0)+'% target. '
          +(gap>0.05?'Under-performing DT — check window time, headset, pre-sell.':gap<-0.05?'Strong DT mix. Monitor FC/Kiosk.':'Within range.')};
  }

  // 11. Salaried Manager Compliance
  const salR=(ds.laborRows||[]).filter(r=>r.loc===loc&&r.date>=new Date(Date.now()-42*864e5)&&r.salMgrHrs!=null);
  if(salR.length>=5){
    const avgSal=salR.reduce((a,r)=>a+(r.salMgrHrs||0),0)/salR.length, tSal=t.tSalMgrHrs||8;
    if(Math.abs(tSal-avgSal)>0.5)
      result.salMgrCompliance={actual:+avgSal.toFixed(1),target:tSal,gapHrs:+(tSal-avgSal).toFixed(1),
        weeklyImpact:+((tSal-avgSal)*(p.avgRate||13)*7).toFixed(0),
        note:'Sal mgr avg '+avgSal.toFixed(1)+'h/day vs '+tSal+'h target. '
          +(tSal-avgSal>1?'Under-floor: inadequate mgmt coverage.':tSal-avgSal<-1?'Over-floor: review swing efficiency.':'Within tolerance.')};
  }

  // 12. Promo / Discount Drag
  const proR=(ds.ctrlRows||[]).filter(r=>r.loc===loc&&r.date>=new Date(Date.now()-42*864e5)&&r.promoAmt>0);
  if(proR.length>=5){
    const avgD=proR.reduce((a,r)=>a+r.promoAmt,0)/proR.length;
    const pPct=(p.weeklySales||30000)/7>0?avgD/((p.weeklySales||30000)/7):0;
    if(pPct>0.02)
      result.promoDrag={avgDaily:+avgD.toFixed(2),promoPct:+pPct.toFixed(4),
        weeklyImpact:+(avgD*7).toFixed(0),annualImpact:+(avgD*365).toFixed(0),
        note:'Avg $'+avgD.toFixed(0)+'/day promos ('+(pPct*100).toFixed(1)+'% of sales). '
          +(pPct>0.08?'HIGH — investigate unauthorized discounts/meal abuse.':pPct>0.04?'ELEVATED — review authorization workflow.':'Monitor.')};
  }

  return result;
}

function RevenueIntelligence({stores, ds, settings, userEvents, onSelectStore, onClose}) {
  const [selStore, setSelStore] = useState(stores[0]?.loc||'');
  const store = stores.find(s=>s.loc===selStore)||stores[0];
  const [modelDate, setModelDate] = useState(fmtDI(addD(new Date(),1)));

  const opData = useMemo(()=>{
    if(!store) return null;
    return computeRevenueOpportunity(store, ds, settings);
  },[store,ds,settings]);

  const models = useMemo(()=>{
    if(!store||!ds||!ds.loaded) return null;
    try{return forecastModels(store.loc, new Date(modelDate+'T12:00:00'), ds, {...settings,_userEvents:userEvents});}
    catch{return null;}
  },[store,ds,settings,modelDate]);

  // District-wide opportunity ranking
  const districtOps = useMemo(()=>{
    return stores.map(s=>{
      const op = computeRevenueOpportunity(s, ds, settings);
      return {...s, oepeMo:op.oepe?.monthlyOpportunity||0, hasCompSig:op.erosion?.competitiveSignal||false,
        worstSlice:op.erosion?.worstSlice, erosionTrend:op.erosion?.worstTrend||0, opData:op};
    }).sort((a,b)=>b.oepeMo-a.oepeMo);
  },[stores,ds]);

  const totalDistrictOpp = districtOps.reduce((a,s)=>a+(s.oepeMo||0),0);

  return div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.7)',zIndex:300,display:'flex',flexDirection:'column',alignItems:'center',padding:'16px',overflowY:'auto'}},
    div({style:{background:'var(--surf)',borderRadius:'var(--rl)',border:'.5px solid var(--bdr2)',width:'100%',maxWidth:1000,display:'flex',flexDirection:'column',maxHeight:'94vh',overflow:'hidden'}},

      div({style:{padding:'14px 18px',borderBottom:'.5px solid var(--bdr)',display:'flex',alignItems:'center',gap:10,flexShrink:0,flexWrap:'wrap'}},
        div(null,
          div({style:{fontSize:'15px',fontWeight:700}},'💡 Revenue Intelligence Engine'),
          div({style:{fontSize:'11px',color:'var(--text2)',marginTop:2}},
            'OEPE dollar value · Unrealized revenue · Daypart erosion · Competitive pressure signals · Multi-model projections')
        ),
        btn({onClick:onClose,style:{marginLeft:'auto',background:'none',border:'none',color:'var(--text2)',fontSize:20,cursor:'pointer'}},'×')
      ),

      div({style:{overflowY:'auto',flex:1}},

        // District opportunity summary
        div({style:{padding:'12px 18px',borderBottom:'.5px solid var(--bdr)',background:'var(--surf2)'}},
          div({style:{display:'flex',gap:16,flexWrap:'wrap',alignItems:'center'}},
            div(null,
              div({style:{fontSize:'10px',color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.4px'}},
                'District OEPE Revenue Opportunity (Monthly)'),
              div({style:{fontFamily:'var(--mono)',fontSize:'24px',fontWeight:700,color:'#f59e0b'}},
                totalDistrictOpp>0?f$(totalDistrictOpp):'Calculate below')
            ),
            div({style:{fontSize:'10px',color:'var(--text3)',maxWidth:360,lineHeight:1.6}},
              'If every store closed its OEPE gap to target, this is the estimated monthly revenue increase from additional throughput. Each second of improvement has a store-specific dollar value shown below.'
            ),
            districtOps.filter(s=>s.hasCompSig).length>0&&div({style:{
              background:'rgba(239,68,68,.08)',border:'.5px solid rgba(239,68,68,.25)',borderRadius:'var(--r)',padding:'8px 12px'}},
              div({style:{fontSize:'11px',fontWeight:700,color:'#f87171',marginBottom:3}}),
              '🔍 '+districtOps.filter(s=>s.hasCompSig).length+' competitive pressure signal'+(districtOps.filter(s=>s.hasCompSig).length>1?'s':'')+' detected',
              div({style:{fontSize:'10px',color:'var(--text3)'}},
                districtOps.filter(s=>s.hasCompSig).map(s=>s.name.split(' ')[0]).join(', '))
            )
          )
        ),

        // Store selector + detail
        div({style:{padding:'12px 18px'}},
          div({style:{display:'flex',gap:8,marginBottom:14,flexWrap:'wrap',alignItems:'center'}},
            sel({value:selStore,onChange:e=>setSelStore(e.target.value),
              style:{background:'var(--surf2)',border:'.5px solid var(--bdr)',borderRadius:'var(--r)',color:'var(--text)',fontSize:'12px',padding:'6px 10px'}},
              stores.map(s=>opt({key:s.loc,value:s.loc},s.name+' #'+s.loc))
            ),
            btn({className:'btn btn-sm',onClick:()=>{if(store)onSelectStore(store);onClose();}},
              '→ Open Store Dashboard')
          ),

          store&&opData&&div({style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}},

            // OEPE Dollar Value card
            opData.oepe?div({style:{background:'rgba(245,158,11,.06)',border:'.5px solid rgba(245,158,11,.25)',borderRadius:'var(--rl)',padding:'14px 16px'}},
              div({style:{fontSize:'11px',fontWeight:700,color:'#f59e0b',marginBottom:10}},'⏱ OEPE Revenue Gap'),
              div({style:{fontFamily:'var(--mono)',fontSize:'22px',fontWeight:700,color:'#f59e0b',marginBottom:4}},
                f$(opData.oepe.monthlyOpportunity)+'/mo'),
              div({style:{fontSize:'10px',color:'var(--text2)',marginBottom:10}},
                'Estimated additional revenue if OEPE reaches '+store.t.tOepe+'s target'),
              [
                ['Current OEPE', Math.round(store.p.oepe)+'s'],
                ['Target OEPE', store.t.tOepe+'s'],
                ['Gap', opData.oepe.gapSec.toFixed(1)+'s'],
                ['$/second of improvement', f$(opData.oepe.valuePerSecond)],
                ['Extra cars/hr at target', '+'+opData.oepe.addlCarsPerHour.toFixed(1)],
                ['Extra revenue/day', f$(opData.oepe.dailyOpportunity)],
              ].map(([l,v],i)=>div({key:i,style:{display:'flex',justifyContent:'space-between',fontSize:'10px',padding:'3px 0',borderBottom:i<5?'.5px solid rgba(245,158,11,.15)':'none'}},
                span({style:{color:'var(--text3)'}},l),
                span({style:{fontFamily:'var(--mono)',fontWeight:600}},v)
              ))
            ):div({style:{background:'var(--surf2)',border:'.5px solid var(--bdr)',borderRadius:'var(--r)',padding:'14px',display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text3)',fontSize:'11px'}},'OEPE on target — no gap'),

            // Daypart Erosion card
            opData.erosion?div({style:{
              background:opData.erosion.competitiveSignal?'rgba(239,68,68,.06)':'rgba(16,185,129,.04)',
              border:`.5px solid ${opData.erosion.competitiveSignal?'rgba(239,68,68,.25)':'rgba(16,185,129,.2)'}`,
              borderRadius:'var(--rl)',padding:'14px 16px'}},
              div({style:{fontSize:'11px',fontWeight:700,color:opData.erosion.competitiveSignal?'#f87171':'#34d399',marginBottom:10}},
                opData.erosion.competitiveSignal?'🔍 Competitive Pressure Detected':'📊 Daypart Trend Analysis'),
              div({style:{fontSize:'10px',color:'var(--text2)',lineHeight:1.6,marginBottom:10}},opData.erosion.explanation),
              Object.entries(opData.erosion.erosion).map(([sl,data],i)=>div({key:i,style:{
                display:'flex',justifyContent:'space-between',fontSize:'10px',padding:'4px 0',
                borderBottom:i<Object.keys(opData.erosion.erosion).length-1?'.5px solid rgba(255,255,255,.06)':'none'}},
                span({style:{textTransform:'capitalize',fontWeight:600}},sl),
                div({style:{display:'flex',gap:10}},
                  span({style:{fontFamily:'var(--mono)',color:'var(--text3)'}},f$(data.avgRecent)+'/day'),
                  span({style:{fontFamily:'var(--mono)',fontWeight:700,color:data.trend>=0?'#10b981':'#f87171'}},
                    (data.trend>=0?'+':'')+fPct(data.trend))
                )
              ))
            ):div({style:{background:'var(--surf2)',border:'.5px solid var(--bdr)',borderRadius:'var(--r)',padding:'14px',display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text3)',fontSize:'11px',textAlign:'center'}},'Load 3 Peaks data to unlock daypart erosion analysis'),

            // Parked % Optimization card
            opData.parkOpt&&div({style:{background:'rgba(129,140,248,.06)',border:'.5px solid rgba(129,140,248,.2)',borderRadius:'var(--r)',padding:'12px 14px'}},
              div({style:{fontSize:'11px',fontWeight:700,color:'#a5b4fc',marginBottom:8}},'🚗 DT Parked % Optimization'),
              div({style:{fontSize:'10px',color:'var(--text2)',marginBottom:8}},opData.parkOpt.note),
              div({style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}},
                [{l:'Your optimal (by data)',v:opData.parkOpt.optimalParkPct+'%',c:'#a5b4fc'},
                 {l:'Current avg',v:opData.parkOpt.currentParkPct+'%',c:'var(--text)'},
                 {l:'Best TPPH found',v:opData.parkOpt.bestTPPH.toFixed(2),c:'#a5b4fc'},
                 {l:'Current TPPH',v:(opData.parkOpt.currentTPPH||0).toFixed(2),c:'var(--text)'},
                ].map((k,i)=>div({key:i,style:{textAlign:'center',background:'var(--surf3)',borderRadius:'var(--r)',padding:'6px'}},
                  div({style:{fontSize:'8px',color:'var(--text3)',marginBottom:2}},k.l),
                  div({style:{fontFamily:'var(--mono)',fontWeight:700,color:k.c}},k.v)
                ))
              )
            )
          ),

          // ── TPPH Gap card
          opData&&opData.tpph&&div({style:{
            background:'rgba(251,191,36,.05)',border:'.5px solid rgba(251,191,36,.3)',
            borderRadius:'var(--rl)',padding:'12px 16px',marginBottom:8}},
            div({style:{fontSize:'11px',fontWeight:700,color:'#fbbf24',marginBottom:4}},'⚡ TPPH Efficiency Gap'),
            div({style:{fontSize:'10px',color:'var(--text2)',marginBottom:8}},opData.tpph.note),
            div({style:{display:'flex',gap:8}},
              ...[['TPPH Gap',opData.tpph.gap.toFixed(2)],
                  ['Extra TX/Day','+'+opData.tpph.dailyOpportunity&&(opData.tpph.dailyOpportunity/8.5).toFixed(0)],
                  ['Daily Opp',f$(opData.tpph.dailyOpportunity)],
                  ['Monthly Opp',f$(opData.tpph.monthlyOpportunity)]
              ].map(([l,v],i)=>div({key:i,style:{flex:1,background:'var(--surf2)',borderRadius:'var(--r)',padding:'8px',textAlign:'center'}},
                div({style:{fontSize:'9px',color:'var(--text3)',marginBottom:2}},l),
                div({style:{fontFamily:'var(--mono)',fontWeight:700,fontSize:'12px'}},v)
              ))
            )
          ),

          // ── Labor Cost card
          opData&&opData.labor&&div({style:{
            background:opData.labor.gapPct>0?'rgba(239,68,68,.05)':'rgba(16,185,129,.05)',
            border:'.5px solid '+(opData.labor.gapPct>0?'rgba(239,68,68,.3)':'rgba(16,185,129,.3)'),
            borderRadius:'var(--rl)',padding:'12px 16px',marginBottom:8}},
            div({style:{fontSize:'11px',fontWeight:700,color:opData.labor.gapPct>0?'#f87171':'#10b981',marginBottom:4}},
              opData.labor.gapPct>0?'⚠ Labor % Overage':'✓ Labor Efficiency'),
            div({style:{fontSize:'10px',color:'var(--text2)',marginBottom:8}},opData.labor.note),
            div({style:{display:'flex',gap:8}},
              ...[['Gap',opData.labor.gapPct.toFixed(2)+'%'],
                  ['Weekly Impact',f$(opData.labor.weeklyDollarImpact)],
                  ['Monthly Impact',f$(opData.labor.monthlyDollarImpact)]
              ].map(([l,v],i)=>div({key:i,style:{flex:1,background:'var(--surf2)',borderRadius:'var(--r)',padding:'8px',textAlign:'center'}},
                div({style:{fontSize:'9px',color:'var(--text3)',marginBottom:2}},l),
                div({style:{fontFamily:'var(--mono)',fontWeight:700,fontSize:'12px',
                  color:opData.labor.gapPct>0&&l==='Gap'?'#f87171':'inherit'}},v)
              ))
            )
          ),

          // ── OT Cost card
          opData&&opData.ot&&opData.ot.weeklyOTCost>50&&div({style:{
            background:'rgba(249,115,22,.05)',border:'.5px solid rgba(249,115,22,.3)',
            borderRadius:'var(--rl)',padding:'12px 16px',marginBottom:8}},
            div({style:{fontSize:'11px',fontWeight:700,color:'#fb923c',marginBottom:4}},'⏱ OT Cost Exposure'),
            div({style:{fontSize:'10px',color:'var(--text2)',marginBottom:8}},opData.ot.note),
            div({style:{display:'flex',gap:8}},
              ...[['OT Hrs/Day',opData.ot.dailyOTHrs.toFixed(1)],
                  ['Weekly Cost','$'+opData.ot.weeklyOTCost],
                  ['Monthly Cost','$'+opData.ot.monthlyOTCost]
              ].map(([l,v],i)=>div({key:i,style:{flex:1,background:'var(--surf2)',borderRadius:'var(--r)',padding:'8px',textAlign:'center'}},
                div({style:{fontSize:'9px',color:'var(--text3)',marginBottom:2}},l),
                div({style:{fontFamily:'var(--mono)',fontWeight:700,fontSize:'12px'}},v)
              ))
            )
          ),

          // ── Cash Exposure card
          opData&&opData.cashExposure&&div({style:{
            background:'rgba(239,68,68,.05)',border:'.5px solid rgba(239,68,68,.3)',
            borderRadius:'var(--rl)',padding:'12px 16px',marginBottom:8}},
            div({style:{fontSize:'11px',fontWeight:700,color:'#f87171',marginBottom:4}},'💰 Cash O/S Exposure'),
            div({style:{fontSize:'10px',color:'var(--text2)',marginBottom:8}},opData.cashExposure.note),
            div({style:{display:'flex',gap:8}},
              ...[['O/S %',fP(Math.abs(opData.cashExposure.osPct),2)],
                  ['Weekly',f$(opData.cashExposure.weeklyExposure)],
                  ['Annualized',f$(opData.cashExposure.annualExposure)]
              ].map(([l,v],i)=>div({key:i,style:{flex:1,background:'var(--surf2)',borderRadius:'var(--r)',padding:'8px',textAlign:'center'}},
                div({style:{fontSize:'9px',color:'var(--text3)',marginBottom:2}},l),
                div({style:{fontFamily:'var(--mono)',fontWeight:700,fontSize:'12px',color:'#f87171'}},v)
              ))
            )
          ),

          // ── Avg Check Momentum card
          opData&&opData.avgCheckMomentum&&div({style:{
            background:opData.avgCheckMomentum.direction==='up'?'rgba(16,185,129,.05)':'rgba(239,68,68,.05)',
            border:'.5px solid '+(opData.avgCheckMomentum.direction==='up'?'rgba(16,185,129,.3)':'rgba(239,68,68,.3)'),
            borderRadius:'var(--rl)',padding:'12px 16px',marginBottom:8}},
            div({style:{fontSize:'11px',fontWeight:700,color:opData.avgCheckMomentum.direction==='up'?'#10b981':'#f87171',marginBottom:4}},
              opData.avgCheckMomentum.direction==='up'?'📈 Avg Check Momentum — Positive':'📉 Avg Check Momentum — Declining'),
            div({style:{fontSize:'10px',color:'var(--text2)',marginBottom:8}},opData.avgCheckMomentum.note),
            div({style:{display:'flex',gap:8}},
              ...[['2-Wk Avg','$'+opData.avgCheckMomentum.current],
                  ['Prior Avg','$'+opData.avgCheckMomentum.prior],
                  ['Wk Impact',f$(opData.avgCheckMomentum.weeklyImpact)]
              ].map(([l,v],i)=>div({key:i,style:{flex:1,background:'var(--surf2)',borderRadius:'var(--r)',padding:'8px',textAlign:'center'}},
                div({style:{fontSize:'9px',color:'var(--text3)',marginBottom:2}},l),
                div({style:{fontFamily:'var(--mono)',fontWeight:700,fontSize:'12px'}},v)
              ))
            )
          ),

          // ── DT Sales Mix card
          opData&&opData.dtSalesMix&&div({style:{
            background:'rgba(96,165,250,.05)',border:'.5px solid rgba(96,165,250,.3)',
            borderRadius:'var(--rl)',padding:'12px 16px',marginBottom:8}},
            div({style:{fontSize:'11px',fontWeight:700,color:'#60a5fa',marginBottom:4}},'🚗 DT Sales Mix'),
            div({style:{fontSize:'10px',color:'var(--text2)',marginBottom:8}},opData.dtSalesMix.note),
            div({style:{display:'flex',gap:8}},
              ...[['Actual',fP(opData.dtSalesMix.actual,1)],
                  ['Target',fP(opData.dtSalesMix.target,1)],
                  ['Wk Opp',f$(opData.dtSalesMix.weeklyImpact)]
              ].map(([l,v],i)=>div({key:i,style:{flex:1,background:'var(--surf2)',borderRadius:'var(--r)',padding:'8px',textAlign:'center'}},
                div({style:{fontSize:'9px',color:'var(--text3)',marginBottom:2}},l),
                div({style:{fontFamily:'var(--mono)',fontWeight:700,fontSize:'12px',color:'#60a5fa'}},v)
              ))
            )
          ),

          // ── Salaried Manager Compliance card
          opData&&opData.salMgrCompliance&&div({style:{
            background:opData.salMgrCompliance.gapHrs>0?'rgba(245,158,11,.05)':'rgba(16,185,129,.05)',
            border:'.5px solid '+(opData.salMgrCompliance.gapHrs>0?'rgba(245,158,11,.3)':'rgba(16,185,129,.3)'),
            borderRadius:'var(--rl)',padding:'12px 16px',marginBottom:8}},
            div({style:{fontSize:'11px',fontWeight:700,color:opData.salMgrCompliance.gapHrs>0?'#f59e0b':'#10b981',marginBottom:4}},'👔 Salaried Mgr Compliance'),
            div({style:{fontSize:'10px',color:'var(--text2)',marginBottom:8}},opData.salMgrCompliance.note),
            div({style:{display:'flex',gap:8}},
              ...[['Actual',opData.salMgrCompliance.actual+'h'],
                  ['Target',opData.salMgrCompliance.target+'h'],
                  ['Wk Impact',f$(Math.abs(opData.salMgrCompliance.weeklyImpact))]
              ].map(([l,v],i)=>div({key:i,style:{flex:1,background:'var(--surf2)',borderRadius:'var(--r)',padding:'8px',textAlign:'center'}},
                div({style:{fontSize:'9px',color:'var(--text3)',marginBottom:2}},l),
                div({style:{fontFamily:'var(--mono)',fontWeight:700,fontSize:'12px'}},v)
              ))
            )
          ),

          // ── Promo / Discount Drag card
          opData&&opData.promoDrag&&div({style:{
            background:'rgba(165,180,252,.05)',border:'.5px solid rgba(165,180,252,.3)',
            borderRadius:'var(--rl)',padding:'12px 16px',marginBottom:8}},
            div({style:{fontSize:'11px',fontWeight:700,color:'#a5b4fc',marginBottom:4}},'🏷 Promo / Discount Drag'),
            div({style:{fontSize:'10px',color:'var(--text2)',marginBottom:8}},opData.promoDrag.note),
            div({style:{display:'flex',gap:8}},
              ...[['Avg/Day','$'+opData.promoDrag.avgDaily],
                  ['Wk Total',f$(opData.promoDrag.weeklyImpact)],
                  ['Annual',f$(opData.promoDrag.annualImpact)]
              ].map(([l,v],i)=>div({key:i,style:{flex:1,background:'var(--surf2)',borderRadius:'var(--r)',padding:'8px',textAlign:'center'}},
                div({style:{fontSize:'9px',color:'var(--text3)',marginBottom:2}},l),
                div({style:{fontFamily:'var(--mono)',fontWeight:700,fontSize:'12px',color:'#a5b4fc'}},v)
              ))
            )
          ),

          // Multi-model projection panel
          store&&div({style:{border:'.5px solid var(--bdr)',borderRadius:'var(--rl)',overflow:'hidden',marginBottom:12}},
            div({style:{padding:'8px 14px',background:'var(--surf2)',borderBottom:'.5px solid var(--bdr)',display:'flex',gap:10,alignItems:'center'}},
              div({style:{fontSize:'11px',fontWeight:600}},'Multi-Model Projection'),
              inp({type:'date',value:modelDate,onChange:e=>setModelDate(e.target.value),
                style:{background:'var(--surf)',border:'.5px solid var(--bdr)',borderRadius:'var(--r)',color:'var(--text)',fontSize:'11px',padding:'3px 7px'}})
            ),
            store&&h(ModelComparisonPanel,{loc:store.loc,date:new Date(modelDate+'T12:00:00'),ds,settings,userEvents})
          ),

          // District OEPE opportunity ranked list
          div({style:{border:'.5px solid var(--bdr)',borderRadius:'var(--rl)',overflow:'hidden'}},
            div({style:{padding:'8px 14px',background:'var(--surf2)',borderBottom:'.5px solid var(--bdr)',fontSize:'11px',fontWeight:600}},'District OEPE Opportunity Ranking'),
            div({style:{overflowX:'auto'}},
              tbl({style:{width:'100%',borderCollapse:'collapse',fontSize:'10px'}},
                h('thead',null,tr(null,
                  ...[['Store',''],['OEPE Gap',''],['$/second',''],['$/month opp',''],['Daypart Signal','']].map(([l])=>
                    th({style:{padding:'5px 10px',background:'var(--surf3)',fontSize:'8px',textTransform:'uppercase',letterSpacing:'.3px',color:'var(--text2)',textAlign:'left',borderBottom:'.5px solid var(--bdr)'}},l)
                  )
                )),
                h('tbody',null,districtOps.map((s,i)=>tr({key:s.loc,style:{borderBottom:'.5px solid var(--bdr)',
                  background:selStore===s.loc?'rgba(245,158,11,.06)':'transparent',cursor:'pointer'},
                  onClick:()=>setSelStore(s.loc)},
                  td({style:{padding:'5px 10px',fontWeight:600}},s.name),
                  td({style:{padding:'5px 10px',fontFamily:'var(--mono)',color:s.oepeMo>0?'#f59e0b':'#10b981'}},
                    s.opData?.oepe?s.opData.oepe.gapSec.toFixed(1)+'s':'On target ✓'),
                  td({style:{padding:'5px 10px',fontFamily:'var(--mono)'}},
                    s.opData?.oepe?f$(s.opData.oepe.valuePerSecond):'—'),
                  td({style:{padding:'5px 10px',fontFamily:'var(--mono)',fontWeight:s.oepeMo>5000?700:400,color:s.oepeMo>5000?'#f59e0b':'var(--text)'}},
                    s.oepeMo>0?f$(s.oepeMo):'—'),
                  td({style:{padding:'5px 10px'}},
                    s.hasCompSig?span({style:{fontSize:'9px',color:'#f87171',fontWeight:700}},'🔍 Comp pressure — '+s.worstSlice):
                    s.erosionTrend<-0.04?span({style:{fontSize:'9px',color:'#f59e0b'}},
                      '⚠ '+( s.worstSlice||'')+ ' declining'):
                    span({style:{fontSize:'9px',color:'#34d399'}},'✓ Stable'))
                )))
              )
            )
          )
        )
      )
    )
  );
}

// REGISTER AUDIT — NARRATIVE ENGINE
function RegisterAuditNarrative({auditData, store, ds}) {
  if(!auditData||!auditData.employees||!auditData.employees.length) return null;
  const {p, t} = store;
  const employees = auditData.employees;
  const wxR = ds ? ds.weatherRows&&ds.weatherRows.length>0 ? ds.weatherRows[ds.weatherRows.length-1] : null : null;

  // Find patterns
  const highRisk = employees.filter(e=>e.riskScore>=40);
  const medRisk  = employees.filter(e=>e.riskScore>=40&&e.riskScore<=70);
  const topCash  = [...employees].sort((a,b)=>(b.cashOS||0)-(a.cashOS||0)).slice(0,3).filter(e=>Math.abs(e.cashOS||0)>2);
  const topVoids = [...employees].sort((a,b)=>(b.voids||0)-(a.voids||0)).slice(0,3).filter(e=>(e.voids||0)>0);
  const topDisc  = [...employees].sort((a,b)=>(b.discPct||0)-(a.discPct||0)).slice(0,3).filter(e=>(e.discPct||0)>.15);
  const avgDrawer= employees.reduce((a,e)=>a+(e.drawerOpens||0),0)/employees.length;
  const highOpens= employees.filter(e=>(e.drawerOpens||0)>avgDrawer*1.5);

  // Build narrative paragraphs
  const paras = [];

  // Opening: overall picture
  const totalRisk = highRisk.length;
  const riskPct = Math.round(totalRisk/employees.length*100);
  paras.push({
    type: totalRisk>5?'crit':totalRisk>2?'watch':'ok',
    title: 'Overall Controls Picture',
    text: employees.length===0
      ? 'No employee-level register data is available for this period.'
      : totalRisk===0
        ? `Controls reviewed across ${employees.length} employees. ${employees.filter(e=>e.riskScore>=15).length} employees show minor deviations worth monitoring. No registers are triggering high-risk thresholds at this time — cash variance is within normal range, void activity is not concentrated, and no unusual discount patterns found.`
        : `Out of ${employees.length} employees reviewed, ${totalRisk} (${riskPct}%) are showing elevated risk indicators that warrant direct attention. ${medRisk.length} more fall in the watch category. The concerns are not distributed randomly — they concentrate in specific individuals and specific patterns, which points toward behavior rather than system error.`
  });

  // Cash O/S narrative
  if(topCash.length>0) {
    const worst = topCash[0];
    const patternNote = employees.filter(e=>Math.abs(e.cashOS||0)>1).length>=3
      ? `The cash variance pattern is spread across ${employees.filter(e=>Math.abs(e.cashOS||0)>1).length} employees, which can indicate a systemic issue — possibly incorrect change-making procedure, inconsistent counting protocols at shift change, or a manager not catching variances before closeout.`
      : `The variance is concentrated in 1–2 employees rather than spread across the team, which is more consistent with an individual behavior issue than a process failure.`;
    paras.push({
      type: Math.abs(worst.cashOS||0)>10?'crit':'watch',
      title: 'Cash Over/Short',
      text: `The most significant cash variance belongs to ${worst.emp||'Unknown'}, running ${worst.cashOS>=0?'+':'-'}$${Math.abs(worst.cashOS||0).toFixed(2)} over/short across their shifts. ${Math.abs(worst.cashOS||0)>10?'At this level, the variance is too large and consistent to attribute to counting error alone — this warrants a video review of their drawer interactions.':'This is at the upper edge of acceptable variance but not yet in the territory that demands escalation.'} ${patternNote}`
    });
  }

  // Void pattern narrative
  if(topVoids.length>0) {
    const worst = topVoids[0];
    const totalVoids = employees.reduce((a,e)=>a+(e.voids||0),0);
    const avgVoids = totalVoids/employees.length;
    const isConcentrated = (worst.voids||0)>avgVoids*3;
    paras.push({
      type: (worst.voids||0)>10||(p.tRedAPct||0)>(.005)?'crit':'watch',
      title: 'Void & Refund Activity',
      text: `Total void activity across the team averages ${avgVoids.toFixed(1)} per employee. ${worst.emp||'Unknown'} is running at ${worst.voids} voids — ${isConcentrated?`3× the store average, which is statistically significant and not consistent with normal order correction. Voids concentrated in one employee, especially if they cluster after close or in periods of low supervision, are a primary integrity indicator.`:`above average but not at a level that definitively indicates a pattern.`} ${(p.tRedAPct||0)>(t.tRedAPct||.003)*1.5?'Combined with the elevated T-Red After rate for this store, the void pattern strengthens the case for a closer look at specific transactions.':''}`
    });
  }

  // Discount narrative
  if(topDisc.length>0) {
    const worst = topDisc[0];
    paras.push({
      type: (worst.discPct||0)>.25?'crit':'watch',
      title: 'Discount & Meal Activity',
      text: `${worst.emp||'Unknown'} is applying discounts on ${fP(worst.discPct||0,1)} of transactions — ${(worst.discPct||0)>.20?'well above':(worst.discPct||0)>.12?'above':'near'} the expected range. Discount rates above 15% on a consistent basis either indicate a misunderstanding of discount eligibility, a habit of applying unauthorized discounts to drive tips or personal relationships, or systematic meal fraud. Cross-reference these transactions with the Meal Activity report to determine if the employee meals policy explains the rate or if there's an unexplained gap.`
    });
  }

  // Drawer opens
  if(highOpens.length>0) {
    paras.push({
      type: 'watch',
      title: 'Drawer Open Frequency',
      text: `${highOpens.map(e=>e.emp||'Unknown').join(', ')} ${highOpens.length>1?'are':'is'} opening the drawer at ${highOpens[0].drawerOpens} times — significantly more than the ${Math.round(avgDrawer)} team average. Every non-tendered drawer open is an integrity exposure. Frequent opens that don't correspond to cash transactions are worth investigating, particularly if they coincide with periods of high cash variance.`
    });
  }

  // What to do
  const actions = [];
  if(highRisk.length>0) actions.push('Pull video on the top '+Math.min(2,highRisk.length)+' risk employee'+(highRisk.length>1?'s':'')+' ('+highRisk.slice(0,2).map(e=>e.emp||'Unknown').join(', ')+') for a representative week of transactions.');
  if(topVoids.length>0) actions.push('Cross-reference void report with T-Red After report — are voids happening after the transaction is tendered?');
  if(topCash.length>0) actions.push('Implement supervisor double-count at shift change for any drawer running >±$3 consistently.');
  if(topDisc.length>0) actions.push('Pull the Meal Activity log for the high-discount employees and compare to scheduled hours.');
  if(actions.length===0) actions.push('Continue monitoring. Set a 30-day alert threshold — if any metric crosses the amber level, escalate immediately.');

  paras.push({type:'fc',title:'Recommended Actions',text:actions.map((a,i)=>(i+1)+'. '+a).join('\n')});

  const colMap={crit:'#f87171',watch:'#f59e0b',ok:'#10b981',fc:'#60a5fa'};
  const bgMap={crit:'rgba(239,68,68,.05)',watch:'rgba(245,158,11,.05)',ok:'rgba(16,185,129,.04)',fc:'rgba(96,165,250,.05)'};

  return div({style:{marginTop:14}},
    div({style:{fontSize:'11px',fontWeight:700,color:'var(--text2)',marginBottom:10,textTransform:'uppercase',letterSpacing:'.4px'}},'📋 Register Intelligence Narrative'),
    paras.map((p2,i)=>div({key:i,style:{background:bgMap[p2.type],border:`.5px solid ${colMap[p2.type]}33`,borderRadius:'var(--r)',padding:'10px 12px',marginBottom:8}},
      div({style:{fontSize:'10px',fontWeight:700,color:colMap[p2.type],textTransform:'uppercase',letterSpacing:'.4px',marginBottom:5}},p2.title),
      div({style:{fontSize:'11px',color:'var(--text2)',lineHeight:1.7,whiteSpace:'pre-line'}},p2.text)
    ))
  );
}

function RegisterAuditTab({ds, loc}) {
  const auditRows = ds&&ds.auditRows ? ds.auditRows.filter(r=>r.loc===loc) : [];
  const auditData = auditRows.length>0 ? analyzeRegisterAudit(auditRows) : null;

  if(!auditRows.length) return div({style:{padding:20}},
    div({className:'empty-st'},
      div({className:'empty-st-t'},'No Register Audit data'),
      div({className:'empty-st-s'},'Load a Register Audit YYYY-MM-DD to YYYY-MM-DD.xlsx file to activate employee-level register analysis.')
    )
  );

  const {employees=[],summary={}} = auditData||{};
  const [activeSection, setActiveSection] = React.useState('overview');
  const sorted = [...employees].sort((a,b)=>(b.riskScore||0)-(a.riskScore||0));
  const riskColor = s=>s>=70?'#f87171':s>=40?'#f59e0b':s>=15?'#84cc16':'#10b981';
  const riskLabel = s=>s>=70?'HIGH':s>=40?'WATCH':s>=15?'LOW':'CLEAN';

  const SECTIONS = [
    {k:'overview', l:'Overview'},
    {k:'treds',    l:'T-Reds'},
    {k:'refunds',  l:'Refunds & Overrings'},
    {k:'cash',     l:'Cash & Discounts'},
  ];

  const ColHdr = (l, align='left') =>
    th({style:{padding:'5px 8px',background:'var(--surf3)',fontSize:'8px',textTransform:'uppercase',
      letterSpacing:'.3px',color:'var(--text2)',textAlign:align,borderBottom:'.5px solid var(--bdr)'}},l);

  const Cell = (v, col='var(--text)', align='left') =>
    td({style:{padding:'5px 8px',fontFamily:'var(--mono)',fontSize:'10px',color:col,textAlign:align}},v);

  return div(null,
    div({style:{fontSize:'13px',fontWeight:700,marginBottom:4}},'⚖ Register Audit Analysis'),
    div({style:{fontSize:'10px',color:'var(--text3)',marginBottom:10}},
      auditRows.length+' transactions · '+employees.length+' employees · sorted by risk score'),

    // Summary KPIs
    div({style:{display:'flex',gap:8,flexWrap:'wrap',marginBottom:10}},
      [{l:'Employees',v:employees.length,c:'var(--text)'},
       {l:'High Risk',v:employees.filter(e=>e.riskScore>=70).length,c:'#f87171'},
       {l:'Watch',v:employees.filter(e=>e.riskScore>=40&&e.riskScore<70).length,c:'#f59e0b'},
       {l:'T-Red After (total)',v:employees.reduce((a,e)=>a+e.tRedACnt,0),c:'#f87171'},
       {l:'T-Red $ (total)',v:'$'+employees.reduce((a,e)=>a+e.tRedADollar,0).toFixed(2),c:'#f87171'},
       {l:'Refunds (total)',v:employees.reduce((a,e)=>a+e.refundCnt,0),c:'#f59e0b'},
       {l:'POS Overrings',v:employees.reduce((a,e)=>a+e.posOver,0),c:'#fb923c'},
       {l:'Avg O/S',v:'$'+(Math.round(employees.reduce((a,e)=>a+Math.abs(e.cashOS||0),0)/Math.max(1,employees.length)*100)/100).toFixed(2),c:'var(--text)'},
      ].map((k,i)=>div({key:i,style:{background:'var(--surf2)',border:'.5px solid var(--bdr)',borderRadius:'var(--r)',padding:'6px 10px',textAlign:'center',flex:1,minWidth:70}},
        div({style:{fontSize:'8px',color:'var(--text3)',marginBottom:2}},k.l),
        div({style:{fontFamily:'var(--mono)',fontSize:'13px',fontWeight:700,color:k.c}},k.v)
      ))
    ),

    // Section tabs
    div({style:{display:'flex',gap:4,marginBottom:8,borderBottom:'.5px solid var(--bdr)',paddingBottom:6}},
      SECTIONS.map(s=>div({key:s.k,onClick:()=>setActiveSection(s.k),
        style:{padding:'4px 12px',fontSize:'10px',fontWeight:activeSection===s.k?700:400,
          color:activeSection===s.k?'var(--amber)':'var(--text3)',cursor:'pointer',
          borderBottom:activeSection===s.k?'2px solid var(--amber)':'2px solid transparent'}},s.l))
    ),

    // ── OVERVIEW ──
    activeSection==='overview'&&div({style:{overflowX:'auto'}},
      tbl({style:{width:'100%',borderCollapse:'collapse',fontSize:'10px'}},
        h('thead',null,tr(null,
          ColHdr('Employee'),ColHdr('Risk'),ColHdr('Days'),ColHdr('T-Red A#','right'),ColHdr('T-Red A$','right'),
          ColHdr('Refunds','right'),ColHdr('POS Over','right'),ColHdr('O/S','right'),ColHdr('Disc%','right')
        )),
        h('tbody',null,sorted.map((e,i)=>tr({key:i,style:{borderBottom:'.5px solid var(--bdr)',background:i%2?'rgba(255,255,255,.01)':'transparent'}},
          td({style:{padding:'5px 8px',fontWeight:600,maxWidth:160,overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis'}},e.emp||'Unknown'),
          td({style:{padding:'5px 8px'}},span({style:{fontSize:'9px',fontWeight:700,padding:'2px 6px',borderRadius:3,
            background:riskColor(e.riskScore||0)+'22',color:riskColor(e.riskScore||0),border:`.5px solid ${riskColor(e.riskScore||0)}44`}},riskLabel(e.riskScore||0))),
          Cell(e.txCount||'—','var(--text3)','right'),
          Cell(e.tRedACnt||0, e.tRedACnt>5?'#f87171':e.tRedACnt>2?'#f59e0b':'var(--text)','right'),
          Cell('$'+(e.tRedADollar||0).toFixed(2), e.tRedADollar>20?'#f87171':e.tRedADollar>5?'#f59e0b':'var(--text)','right'),
          Cell(e.refundCnt||0, e.refundCnt>3?'#f59e0b':'var(--text)','right'),
          Cell(e.posOver||0, e.posOver>5?'#f59e0b':'var(--text)','right'),
          Cell(((e.cashOS||0)>=0?'+':'')+((e.cashOS||0).toFixed(2)), Math.abs(e.cashOS||0)>5?'#f87171':Math.abs(e.cashOS||0)>2?'#f59e0b':'var(--text)','right'),
          Cell((e.discPct||0)>0?fP(e.discPct,1):'—', (e.discPct||0)>.2?'#f87171':(e.discPct||0)>.1?'#f59e0b':'var(--text)','right')
        )))
      )
    ),

    // ── T-REDS ──
    activeSection==='treds'&&div({style:{overflowX:'auto'}},
      div({style:{fontSize:'10px',color:'var(--text3)',marginBottom:8}},'T-Red After = post-transaction void (highest risk). T-Red Before = pre-total correction (context-dependent).'),
      tbl({style:{width:'100%',borderCollapse:'collapse',fontSize:'10px'}},
        h('thead',null,tr(null,
          ColHdr('Employee'),ColHdr('T-Red After #','right'),ColHdr('T-Red After $','right'),ColHdr('T-Red A $/day','right'),
          ColHdr('T-Red Before #','right'),ColHdr('T-Red Before $','right'),ColHdr('Risk Flag')
        )),
        h('tbody',null,sorted.filter(e=>e.tRedACnt>0||e.tRedBCnt>0).map((e,i)=>tr({key:i,
          style:{borderBottom:'.5px solid var(--bdr)',background:i%2?'rgba(255,255,255,.01)':'transparent'}},
          td({style:{padding:'5px 8px',fontWeight:600,maxWidth:160,overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis'}},e.emp||'Unknown'),
          Cell(e.tRedACnt, e.tRedACnt>5?'#f87171':e.tRedACnt>2?'#f59e0b':'var(--text)','right'),
          Cell('$'+(e.tRedADollar||0).toFixed(2), e.tRedADollar>20?'#f87171':e.tRedADollar>5?'#f59e0b':'var(--text)','right'),
          Cell('$'+(e.avgTRedADollar||0).toFixed(2), e.avgTRedADollar>3?'#f87171':e.avgTRedADollar>1?'#f59e0b':'var(--text)','right'),
          Cell(e.tRedBCnt, e.tRedBCnt>8?'#f59e0b':'var(--text)','right'),
          Cell('$'+(e.tRedBDollar||0).toFixed(2),'var(--text3)','right'),
          td({style:{padding:'5px 8px',fontSize:'9px',color:'var(--text3)'}},
            e.tRedACnt>5?'⚠ High T-Reds after Total pressed':e.tRedADollar>20?'⚠ High reduction dollar value':e.tRedBCnt>8?'↑ Elevated pre-total reductions':'—')
        )))
      )
    ),

    // ── REFUNDS & OVERRINGS ──
    activeSection==='refunds'&&div({style:{overflowX:'auto'}},
      tbl({style:{width:'100%',borderCollapse:'collapse',fontSize:'10px'}},
        h('thead',null,tr(null,
          ColHdr('Employee'),ColHdr('Refund #','right'),ColHdr('Refund Cash$','right'),ColHdr('Refund Cashless$','right'),
          ColHdr('POS Overring #','right'),ColHdr('POS Overring $','right'),ColHdr('Manual Refund $','right')
        )),
        h('tbody',null,sorted.filter(e=>e.refundCnt>0||e.posOver>0||e.manualRef>0).map((e,i)=>tr({key:i,
          style:{borderBottom:'.5px solid var(--bdr)',background:i%2?'rgba(255,255,255,.01)':'transparent'}},
          td({style:{padding:'5px 8px',fontWeight:600,maxWidth:160,overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis'}},e.emp||'Unknown'),
          Cell(e.refundCnt||0, e.refundCnt>5?'#f59e0b':'var(--text)','right'),
          Cell('$'+(e.refundCash||0).toFixed(2),'var(--text)','right'),
          Cell('$'+(e.refundCashless||0).toFixed(2),'var(--text3)','right'),
          Cell(e.posOver||0, e.posOver>5?'#f59e0b':'var(--text)','right'),
          Cell('$'+(e.posOverAmt||0).toFixed(2), e.posOverAmt>50?'#f59e0b':'var(--text)','right'),
          Cell('$'+(e.manualRef||0).toFixed(2), e.manualRef>25?'#f87171':e.manualRef>10?'#f59e0b':'var(--text)','right')
        )))
      )
    ),

    // ── CASH & DISCOUNTS ──
    activeSection==='cash'&&div({style:{overflowX:'auto'}},
      tbl({style:{width:'100%',borderCollapse:'collapse',fontSize:'10px'}},
        h('thead',null,tr(null,
          ColHdr('Employee'),ColHdr('Days'),ColHdr('Cash O/S$','right'),ColHdr('Avg O/S$/day','right'),
          ColHdr('Drawer Opens','right'),ColHdr('Avg Opens/day','right'),ColHdr('Disc/Promo %','right'),ColHdr('Promo $','right')
        )),
        h('tbody',null,sorted.map((e,i)=>tr({key:i,
          style:{borderBottom:'.5px solid var(--bdr)',background:i%2?'rgba(255,255,255,.01)':'transparent'}},
          td({style:{padding:'5px 8px',fontWeight:600,maxWidth:160,overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis'}},e.emp||'Unknown'),
          Cell(e.txCount||'—','var(--text3)','right'),
          Cell(((e.cashOSTotal||0)>=0?'+':'')+((e.cashOSTotal||0).toFixed(2)), Math.abs(e.cashOSTotal||0)>10?'#f87171':Math.abs(e.cashOSTotal||0)>3?'#f59e0b':'var(--text)','right'),
          Cell(((e.cashOS||0)>=0?'+':'')+((e.cashOS||0).toFixed(2)), Math.abs(e.cashOS||0)>5?'#f87171':Math.abs(e.cashOS||0)>2?'#f59e0b':'var(--text)','right'),
          Cell(e.drawerOpens||0,'var(--text3)','right'),
          Cell(e.avgDrawerOpens>0?e.avgDrawerOpens.toFixed(1):'—', e.avgDrawerOpens>8?'#f59e0b':'var(--text)','right'),
          Cell((e.discPct||0)>0?fP(e.discPct,1):'—', (e.discPct||0)>.2?'#f87171':(e.discPct||0)>.1?'#f59e0b':'var(--text)','right'),
          Cell(e.promoAmt>0?'$'+e.promoAmt.toFixed(2):'—','var(--text3)','right')
        )))
      )
    ),

    h(RegisterAuditNarrative,{auditData,store:{p:{},t:{}},ds}),
    h(AITabInsight,{label:'AI Register Audit Analysis',
      buildPrompt:()=>{
        if(!auditData||!auditData.employees||!auditData.employees.length) return 'No audit data.';
        const top3=(auditData.employees||[]).slice(0,3).map(e=>
          (e.emp||'?')+' risk:'+Math.round(e.riskScore||0)+' voids:'+e.tRedACnt+' OS:$'+(e.cashOS||0).toFixed(2)).join('; ');
        const s=auditData.summary||{};
        return 'McDonald\'s register audit for '+loc+'. Top risk: '+top3+'. District: '+(s.totalVoids||0)+' voids, '+(s.highRisk||0)+' high-risk. Provide coaching talking points for high-risk employees and 2-3 process improvements to reduce cash handling errors.';
      }})
  );
}

// COMPARE COMPONENTS

// STORE DASHBOARD (SECTION 13)
function StoreDash({store, ds, settings, allStores, onBack, onNav, dateRange, userEvents, lockedProjections}) {
  const [tab, setTab]             = useState('overview');
  const [wk, setWk]               = useState([]);
  const [wkLoading, setWkLoading] = useState(false);
  const [wkProgress, setWkProgress]= useState(0);
  const [opsChartType, setOpsChartType]= useState('radar');
  const {p, t} = store;

  useEffect(()=>{
    if(!ds) return;
    setWkLoading(true); setWkProgress(0);
    fetchForecastWeather(store.loc); // always fetch — covers up to 16 days ahead
    // Auto-fetch historical weather from Open-Meteo for any dates not in Mesonet file
    const _wxS = dateRange.s, _wxE = dateRange.e;
    const _wxToday = new Date();
    const _wxFmt = d => d.toISOString().slice(0,10);
    if(_wxS < _wxToday) {
      const _wxHistEnd = _wxE < _wxToday ? _wxE : new Date(_wxToday.getTime()-864e5);
      fetchHistoricalWeather([store.loc], _wxFmt(_wxS), _wxFmt(_wxHistEnd))
        .then(()=>{ setWk(prev=>[...prev]); }); // force re-render after cache populated
    }
    forecastRangeAsync(store.loc, dateRange.s, dateRange.e, ds, {...settings,_userEvents:userEvents},
      (partial,done,total)=>{setWk(partial);setWkProgress(Math.round(done/total*100));},
      (final)=>{setWk(final);setWkLoading(false);setWkProgress(100);
        // Auto-calibrate: silent background run, only when 10+ new data points since last calibration
        if(ds&&ds.loaded&&settings.dialedInEnabled!==false) {
          const _existing = settings.dialedIn&&settings.dialedIn[store.loc];
          // Gate: count rows added since last calibration run date
          const _lastRun = _existing&&_existing.runDate ? new Date(_existing.runDate) : new Date(0);
          const _newRows = (ds.laborRows||[]).filter(r=>r.loc===store.loc&&r.sales>0&&r.date>_lastRun);
          const _shouldRun = _newRows.length>=10 || !_existing; // 10+ new points or never calibrated
          if(_shouldRun) {
            calibrateStore(store.loc,ds,{...settings,_userEvents:userEvents}).then(result=>{
              if(!result) return;
              if(!_existing||result.mape<(_existing.mape||99)-0.5) {
                const next={...settings,dialedIn:{...(settings.dialedIn||{}),[store.loc]:result}};
                saveSettings(next);
              }
            }).catch(()=>{});
          }
        }
      }
    );
  },[store.loc, ds, settings, dateRange]);

  const rangeTotal = wk.reduce((a,r)=>a+(r.forecast||0),0);
  const rangeLY    = wk.reduce((a,r)=>a+(r.lyAdj||0),0);
  const rangeAct   = wk.filter(r=>r.actual>0).reduce((a,r)=>a+r.actual,0);
  // Guard: only show vs LY variance if LY data is meaningful (>$500 for the period)
  const rangeVar   = rangeLY>500?(rangeTotal-rangeLY)/rangeLY:null;
  const mode       = rangeAct>rangeTotal*.8&&rangeTotal>0?'past':rangeTotal>0&&wk.filter(r=>r.isFuture).length>wk.length*.5?'future':'mixed';

  const tabs=[
    {id:'overview',    l:'Overview'},
    {id:'forecast',    l:'Forecast Table'},
    {id:'scorecards',  l:'Scorecards'},
    {id:'brief',       l:'Intelligence Brief'},
    {id:'intelligence',l:'📊 Intelligence'},
    {id:'action',      l:'📋 Action Plan'},
    {id:'shift',       l:'⏱ Shift Analysis'},
    {id:'peaks',       l:'3 Peaks'},
    {id:'register',    l:'Register Audit'},
    {id:'records',     l:'🏆 Records'},
    {id:'insights',    l:'💡 AI Insights'},
  ];

  // KPI cards
  const lyV = store.pLY>0?(store.pSales-store.pLY)/store.pLY:null;
  const kpis=[
    {l:'Period Sales',  v:wkLoading&&wk.length===0?'…':mode==='past'&&rangeAct>0?f$(rangeAct):f$(rangeTotal), s:rangeVar!=null?fPct(rangeVar)+' vs LY':ds&&ds.loaded?'Live':'Mock', c:rangeVar!=null?(rangeVar>=0?'#10b981':'#ef4444'):'#94a3b8'},
    {l:'Ops Score',     v:store.opsScore+'/100',  s:'Operations health',    c:store.opsScore>=80?'#10b981':store.opsScore>=65?'#f59e0b':'#ef4444'},
    {l:'Controls',      v:store.ctrlScore+'/100', s:'Controls health',      c:store.ctrlScore>=80?'#10b981':store.ctrlScore>=65?'#f59e0b':'#ef4444'},
    {l:'OEPE',          v:p.oepe>0?Math.round(p.oepe)+'s':'—',   s:'Target '+( t.tOepe||'—')+'s · 6-wk avg',  c:p.oepe>0&&t.tOepe>0?(p.oepe<=t.tOepe?'#10b981':'#ef4444'):'#94a3b8'},
    {l:'TPPH',          v:p.tpph>0?p.tpph.toFixed(2):'—',         s:'Target '+(t.tTpph||'—')+' · 6-wk avg',       c:p.tpph>0&&t.tTpph>0?(p.tpph>=t.tTpph?'#10b981':'#ef4444'):'#94a3b8'},
    {l:'Labor %',       v:p.laborPct>0?fP(p.laborPct,1):'—',      s:'Target '+(t.tLabor?(t.tLabor*100).toFixed(1)+'%':'—')+' · 6-wk avg', c:laborColor(p.laborPct,t.tLabor,settings).color},
    {l:'T2W Trend',     v:p.t2w!=null?fPct(p.t2w):'—',            s:p.t2w!=null?'2-wk vs prior 2-wk avg (rolling)':'Insufficient data (need 3+ days each period)',              c:p.t2w!=null?(p.t2w>=0?'#10b981':'#ef4444'):'#94a3b8'},
    {l:'Cash O/S',      v:(ds?.ctrlRows||[]).some(r=>r.loc===store.loc)?((p.cashOSPct||0)>=0?'+':'')+((p.cashOSPct||0)*100).toFixed(3)+'%':'—', s:'Target <0.10% · 6-wk avg · +over −short', c:Math.abs(p.cashOSPct||0)<.001?'#10b981':Math.abs(p.cashOSPct||0)<.003?'#f59e0b':'#ef4444'},
  ];

  // Model Health Score computation
  const health = modelHealthScore(store.loc, ds, settings);

  return div(null,
    // Model Health Confidence Bar — shows above store header
    div({
      style:{padding:'5px 16px',background:
        health.score>=75?'rgba(16,185,129,.07)':health.score>=50?'rgba(245,158,11,.07)':'rgba(239,68,68,.07)',
        borderBottom:'.5px solid '+(health.score>=75?'rgba(16,185,129,.2)':health.score>=50?'rgba(245,158,11,.2)':'rgba(239,68,68,.2)'),
        display:'flex',alignItems:'center',gap:10,cursor:'pointer',userSelect:'none'},
      title:'Model Health measures how much you can trust this store\'s AI forecast. Click to open Knowledge Base.',
      onClick:()=>{if(window._openKB)window._openKB('model_health');}},
      div({style:{display:'flex',flexDirection:'column',gap:1}},
        div({style:{display:'flex',alignItems:'center',gap:6}},
          span({style:{fontSize:'10px',fontWeight:800,color:health.grade.color}},
            health.grade.emoji+' Forecast Model Health: '+health.score+'/100 — '+health.grade.label),
          span({style:{fontSize:'8px',color:'var(--text3)',border:'.5px solid var(--bdr)',
            borderRadius:3,padding:'0 4px'}},'Forecasting only · Click for details')
        ),
        span({style:{fontSize:'9px',color:'var(--text2)'}},health.statement)
      ),
      div({style:{marginLeft:'auto',display:'flex',gap:4,fontSize:'8px',color:'var(--text3)',fontFamily:'var(--mono)'}},
        health.reasons.map((r,i)=>div({key:i,style:{textAlign:'center',padding:'2px 6px',
          background:'rgba(255,255,255,.04)',borderRadius:3}},
          div(null,r.cat),
          div({style:{color:r.pts>=r.max*.7?'#10b981':r.pts>=r.max*.4?'#f59e0b':'#ef4444',fontWeight:700}},r.pts+'/'+r.max)
        ))
      )
    ),
    // Store header bar
    div({style:{display:'flex',alignItems:'center',gap:10,padding:'10px 0',marginBottom:8,flexWrap:'wrap'}},
      btn({className:'btn btn-sm',onClick:onBack},'← District'),
      div({style:{flex:1}},
        div({style:{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}},
          div({style:{fontSize:'15px',fontWeight:700}},store.name),
          store.org&&store.org!=='MCDOK'&&span({style:{fontSize:'9px',fontWeight:700,padding:'2px 7px',
            borderRadius:3,background:'rgba(167,139,250,.15)',color:'#a78bfa',
            border:'.5px solid rgba(167,139,250,.3)'}},store.org)
        ),
        div({style:{fontSize:'10px',color:'var(--text3)',marginTop:2,display:'flex',gap:12,flexWrap:'wrap'}},
          span(null,'#'+store.loc+' · '+(store.city||'')+', '+(store.state||'OK')),
          store.gm&&span({title:store.gmEmail||''},'GM: ',span({style:{color:'var(--text2)',fontWeight:600}},store.gm)),
          store.sup&&span({title:store.supEmail||''},' · Sup: ',span({style:{color:'var(--text2)'}},store.sup)),
          store.operator&&span({},' · Op: ',span({style:{color:'var(--text2)'}},store.operator))
        ),
        store.addr&&div({style:{fontSize:'9px',color:'var(--text3)',marginTop:1}},store.addr),
        div({style:{marginTop:6}},
          h(ModelHealthBadge,{loc:store.loc,settings,ds,showDetail:true})
        )
      ),
      wkLoading&&div({style:{fontSize:'10px',color:'#f59e0b'}},wkProgress+'%')
    ),

    // KPI cards
    div({style:{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:6,marginBottom:10}},
      kpis.map((k,i)=>div({key:i,className:'kpi-card',style:{cursor:'default'}},
        div({className:'kpi-l'},k.l),
        div({className:'kpi-v',style:{color:k.c}},k.v),
        div({className:'kpi-s',style:{color:k.c}},k.s)
      ))
    ),

    // Loading bar
    wkLoading&&div({style:{height:2,background:'var(--bdr)',position:'relative',overflow:'hidden',marginBottom:4}},
      div({style:{position:'absolute',top:0,left:0,height:'100%',width:wkProgress+'%',background:'var(--amber)',transition:'width .2s'}})
    ),

    // Tabs
    div({className:'tabs'},tabs.map(tb=>div({key:tb.id,className:'tab'+(tab===tb.id?' on':''),onClick:()=>setTab(tb.id)},tb.l))),

    // Date range context pill
    div({style:{display:'flex',alignItems:'center',gap:8,padding:'4px 0',marginBottom:4,flexWrap:'wrap'}},
      div({style:{fontSize:'9px',background:'rgba(245,158,11,.1)',border:'.5px solid rgba(245,158,11,.3)',borderRadius:4,padding:'2px 10px',color:'var(--amber)',fontWeight:600}},
        '📅 '+dateRange.s.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})+
        ' – '+dateRange.e.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})+
        (dateRange.label?' · '+dateRange.label:'')
      ),
      wk.length>0&&div({style:{fontSize:'9px',color:'var(--text3)'}},
        wk.filter(r=>!r.isFuture).length+' actual day'+(wk.filter(r=>!r.isFuture).length!==1?'s':'') +
        (wk.filter(r=>r.isFuture).length>0?' · '+wk.filter(r=>r.isFuture).length+' projected':'')
      )
    ),
    // Tab content
    tab==='overview'&&div(null,
      div({style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:8}},
        div({className:'chart-box'},
          div({style:{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}},
            div({className:'chart-title',style:{margin:0}},'Ops Performance'),
            div({style:{display:'flex',gap:3}},
              [['radar','⬡'],['bar','▬']].map(([k,l])=>btn({key:k,className:'sbtn'+(opsChartType===k?' on':''),onClick:()=>setOpsChartType(k),style:{fontSize:'9px',padding:'1px 5px'}},l))
            )
          ),
          opsChartType==='radar'?h(OpsRadar,{perf:p,tgt:t}):h(OpsBarChart,{perf:p,tgt:t})
        ),
        div({className:'chart-box'},div({className:'chart-title'},'Sales Trend'),h(SalesChart,{dayRows:wk,tgt:t})),
        div({className:'chart-box',style:{gridColumn:'1/-1'}},div({className:'chart-title'},'6-Week Performance — T2W & T6W Trend'),h(TrendChart,{dayRows:wk}))
      )
    ),

    // ── Enterprise Overview Panels ──────────────────────────────────
    tab==='overview'&&allStores&&allStores.length>1&&div({style:{marginTop:12}},

      // Revenue at Risk widget
      (()=>{
        const today=new Date();
        const next4wk=addD(today,28);
        const districtStores=allStores.filter(s=>/^\d+$/.test(s.loc));
        const totalGap=districtStores.reduce((a,s)=>{
          const weekSales=s.pSales||0;
          const tgt=(s.t&&s.t.tSales)||weekSales;
          return a+(tgt-weekSales)*4;
        },0);
        const atRisk=districtStores.filter(s=>{const ws=s.pSales||0;const tg=(s.t&&s.t.tSales)||ws;return ws<tg*0.97;});
        return div({style:{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap'}},
          div({style:{flex:'1 1 200px',background:'rgba(239,68,68,.06)',border:'.5px solid rgba(239,68,68,.25)',
            borderRadius:'var(--rl)',padding:'12px 16px'}},
            div({style:{fontSize:'9px',color:'#f87171',fontWeight:700,letterSpacing:'.5px',marginBottom:4}},'⚠ REVENUE AT RISK — NEXT 4 WEEKS'),
            div({style:{fontFamily:'var(--mono)',fontWeight:800,fontSize:'20px',color:totalGap>0?'#f87171':'#10b981'}},
              totalGap>0?'-'+f$(Math.abs(Math.round(totalGap))):'+'+f$(Math.abs(Math.round(totalGap)))),
            div({style:{fontSize:'9px',color:'var(--text3)',marginTop:4}},
              atRisk.length+' of '+districtStores.length+' locations running below target pace')
          ),
          div({style:{flex:'1 1 200px',background:'rgba(165,180,252,.06)',border:'.5px solid rgba(165,180,252,.25)',
            borderRadius:'var(--rl)',padding:'12px 16px'}},
            div({style:{fontSize:'9px',color:'#a5b4fc',fontWeight:700,letterSpacing:'.5px',marginBottom:4}},'📊 DISTRICT FORECAST CONFIDENCE'),
            (()=>{
              const calStores=districtStores.filter(s=>settings.dialedIn&&settings.dialedIn[s.loc]&&settings.dialedIn[s.loc].mape!=null);
              const avgMape=calStores.length?calStores.reduce((a,s)=>a+settings.dialedIn[s.loc].mape,0)/calStores.length:null;
              return div(null,
                div({style:{fontFamily:'var(--mono)',fontWeight:800,fontSize:'20px',color:avgMape!=null?(avgMape<6?'#10b981':avgMape<10?'#f59e0b':'#f87171'):'var(--text3)'}},
                  avgMape!=null?'±'+avgMape.toFixed(1)+'% MAPE':'Not Calibrated'),
                div({style:{fontSize:'9px',color:'var(--text3)',marginTop:4}},
                  calStores.length+'/'+districtStores.length+' stores calibrated')
              );
            })()
          )
        );
      })(),

      // Sales Momentum Rank
      div({style:{marginBottom:12}},
        div({style:{fontSize:'10px',fontWeight:700,color:'var(--amber)',marginBottom:8,display:'flex',alignItems:'center',gap:6}},
          '📈 Sales Momentum Rank',
          div({style:{fontSize:'9px',color:'var(--text3)',fontWeight:400}},'2-wk trend vs prior 2-wk · all locations')),
        div({style:{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))',gap:6}},
          [...(allStores||[])].filter(s=>/^\d+$/.test(s.loc)&&s.p&&s.p.t2w!=null)
            .sort((a,b)=>b.p.t2w-a.p.t2w)
            .map((s,i)=>{
              const arrow=s.p.t2w>0.02?'▲':s.p.t2w<-0.02?'▼':'→';
              const col=s.p.t2w>0.02?'#10b981':s.p.t2w<-0.02?'#f87171':'#f59e0b';
              const name=sName(s.loc);
              return div({key:s.loc,
                style:{display:'flex',alignItems:'center',gap:8,padding:'6px 10px',
                  background:'var(--surf2)',borderRadius:'var(--r)',border:'.5px solid var(--bdr)',
                  borderLeft:'.5px solid '+col}},
                div({style:{fontSize:'10px',color:'var(--text3)',minWidth:20,fontWeight:600}},i+1),
                span({style:{fontSize:'12px',color:col}},[arrow]),
                div({style:{flex:1,fontSize:'10px',color:'var(--text)'}},[name]),
                div({style:{fontFamily:'var(--mono)',fontSize:'10px',fontWeight:700,color:col}},
                  (s.p.t2w>=0?'+':'')+( s.p.t2w*100).toFixed(1)+'%')
              );
            })
        )
      ),

      // MAPE Leaderboard (if calibrated)
      settings.dialedInEnabled&&settings.dialedIn&&(()=>{
        const calList=(allStores||[]).filter(s=>/^\d+$/.test(s.loc)&&settings.dialedIn[s.loc]&&settings.dialedIn[s.loc].mape!=null);
        if(!calList.length) return null;
        const sorted=[...calList].sort((a,b)=>settings.dialedIn[a.loc].mape-settings.dialedIn[b.loc].mape);
        return div({style:{marginBottom:12}},
          div({style:{fontSize:'10px',fontWeight:700,color:'var(--amber)',marginBottom:8}},
            '🎯 Forecast Accuracy Leaderboard — MAPE (lower is better)'),
          div({style:{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))',gap:6}},
            sorted.map((s,i)=>{
              const cal=settings.dialedIn[s.loc];
              const col=cal.mape<6?'#10b981':cal.mape<10?'#f59e0b':'#f87171';
              const name=sName(s.loc);
              const recent=cal.recentMape!=null?cal.recentMape:null;
              return div({key:s.loc,
                style:{display:'flex',alignItems:'center',gap:8,padding:'6px 10px',
                  background:'var(--surf2)',borderRadius:'var(--r)',border:'.5px solid var(--bdr)',
                  borderLeft:'.5px solid '+col}},
                div({style:{fontSize:'10px',color:'var(--text3)',minWidth:20,fontWeight:600}},i+1),
                div({style:{flex:1,fontSize:'10px',color:'var(--text)'}},[name]),
                div({style:{textAlign:'right'}},
                  div({style:{fontFamily:'var(--mono)',fontSize:'10px',fontWeight:700,color:col}},cal.mape.toFixed(1)+'%'),
                  recent!=null&&div({style:{fontSize:'8px',color:'var(--text3)'}},['4wk: '+recent.toFixed(1)+'%'])
                )
              );
            })
          )
        );
      })(),

      // Operator Performance Summary
      settings.supervisorGroups&&Object.keys(settings.supervisorGroups||{}).length>0&&(()=>{
        const groups=settings.supervisorGroups||{};
        return div({style:{marginBottom:12}},
          div({style:{fontSize:'10px',fontWeight:700,color:'var(--amber)',marginBottom:8}},'👔 Operator Performance Summary'),
          div({style:{display:'flex',gap:8,flexWrap:'wrap'}},
            Object.entries(groups).map(([name,locs])=>{
              const groupStores=(allStores||[]).filter(s=>locs.includes(s.loc));
              if(!groupStores.length) return null;
              const totalSales=groupStores.reduce((a,s)=>a+(s.pSales||0),0);
              const avgOps=groupStores.reduce((a,s)=>a+(s.opsScore||0),0)/groupStores.length;
              const trends=groupStores.filter(s=>s.p&&s.p.t2w!=null);
              const avgTrend=trends.length?trends.reduce((a,s)=>a+s.p.t2w,0)/trends.length:null;
              return div({key:name,
                style:{flex:'1 1 200px',background:'var(--surf2)',border:'.5px solid var(--bdr)',
                  borderRadius:'var(--rl)',padding:'12px 14px'}},
                div({style:{fontSize:'11px',fontWeight:700,marginBottom:8}},name),
                div({style:{display:'flex',gap:12,flexWrap:'wrap'}},
                  [{l:'Stores',v:groupStores.length,c:'var(--text)'},
                   {l:'4-Wk Sales',v:f$(Math.round(totalSales)),c:'var(--text)'},
                   {l:'Ops Score',v:Math.round(avgOps)+'/100',c:avgOps>=80?'#10b981':avgOps>=65?'#f59e0b':'#f87171'},
                   {l:'T2W Trend',v:avgTrend!=null?((avgTrend>=0?'+':'')+( avgTrend*100).toFixed(1)+'%'):'—',
                    c:avgTrend!=null?(avgTrend>=0?'#10b981':'#f87171'):'var(--text3)'}
                  ].map((k,j)=>div({key:j,style:{textAlign:'center'}},
                    div({style:{fontSize:'8px',color:'var(--text3)',marginBottom:2}},k.l),
                    div({style:{fontFamily:'var(--mono)',fontWeight:700,color:k.c,fontSize:'12px'}},k.v)
                  ))
                )
              );
            })
          )
        );
      })()
    ),
    tab==='forecast'   && h(ForecastTable,{weekDays:wk,tgt:t,ds,loc:store.loc,settings,store,userEvents,lockedProjections}),
    tab==='scorecards' && div(null,h(OpsScorecard,{store,settings}),h(CtrlScorecard,{store,settings})),
    tab==='brief'      && div(null,
        h(Brief,{store,rangeTotal,rangeLY}),
        h(AITabInsight,{
          label:'💡 AI Priority Actions',
          buildPrompt:()=>{
            const {p,t}=store||{p:{},t:{}};
            const storeName=STORE_NAMES[store&&store.loc]||(store&&store.loc)||'Store';
            const issues=[];
            if(p.oepe>0&&t.tOepe>0&&p.oepe>t.tOepe) issues.push('OEPE '+Math.round(p.oepe)+'s vs '+t.tOepe+'s target');
            if(p.tpph>0&&t.tTpph>0&&p.tpph<t.tTpph) issues.push('TPPH '+p.tpph.toFixed(2)+' vs '+t.tTpph+' target');
            if(p.laborPct>0&&t.tLabor>0&&p.laborPct>t.tLabor) issues.push('Labor '+(p.laborPct*100).toFixed(1)+'% vs '+(t.tLabor*100).toFixed(1)+'% target');
            const vsLY=rangeLY>0?(rangeTotal-rangeLY)/rangeLY*100:null;
            if(vsLY!==null) issues.push('Sales '+(vsLY>=0?'+':'')+vsLY.toFixed(1)+'% vs LY');
            return 'McDonald\'s operations consultant reviewing '+storeName+'. Key metrics: '+issues.join(', ')+'. Give a prioritized 3-action plan for THIS WEEK. Each action must be specific, measurable, and tied directly to these metrics. Lead with the highest-impact item.';
          }
        })
      ),
    tab==='action'     && h(ActionPlanTab,{store,ds,settings,dateRange}),
    tab==='shift'      && h(ShiftAnalysisTab,{store,ds,settings}),
    tab==='peaks'      && h(PeaksTab,{ds,loc:store.loc,tgt:t,settings}),
    tab==='register'   && h(RegisterAuditTab,{ds,loc:store.loc}),
    tab==='records'    && h(StoreRecordsTab,{ds,loc:store.loc,name:store.name}),
    tab==='insights'   && h(AIInsightsTab,{store,ds,settings}),
    tab==='intelligence'&&h(LocationIntelligence,{store,allStores,ds,settings,scope:'store',onClose:()=>setTab('overview')})
  );
}

// STORE RECORDS TAB
function StoreRecordsTab({ds, loc, name}) {
  const recs = ds&&ds.records&&ds.records[loc];
  if(!recs) return div({style:{padding:20}},
    div({className:'empty-st'},
      div({className:'empty-st-t'},'No Records Data'),
      div({className:'empty-st-s'},'Load the Records - Total Day - Sun-Sat - Total.xlsx file to see all-time store records.')
    )
  );

  // Build display list from record keys
  const LABELS = {
    dt_sales_value:      {l:'DT Sales',         fmt:'dollar', icon:'🚗', col:'#60a5fa'},
    dt_transactions:     {l:'DT Transactions',  fmt:'num',    icon:'🚗', col:'#60a5fa'},
    kvs_sandwiches:      {l:'KVS Sandwiches',   fmt:'num',    icon:'⏱',  col:'#a78bfa'},
    kvs_time:            {l:'KVS Time',          fmt:'sec',    icon:'⏱',  col:'#a78bfa', lower:true},
    oepe_no_parked:      {l:'OEPE (No Parked)', fmt:'sec',    icon:'🏁', col:'#34d399', lower:true},
    r2p:                 {l:'R2P',              fmt:'sec',    icon:'🍟', col:'#f59e0b', lower:true},
    total_sales:         {l:'Total Sales',      fmt:'dollar', icon:'💰', col:'#10b981'},
    total_transactions:  {l:'Total Transactions',fmt:'num',   icon:'💰', col:'#10b981'},
  };

  const entries = Object.entries(recs)
    .filter(([k,v])=>k!=='loc'&&v&&v.value>0)
    .map(([k,v])=>({key:k, ...v, meta:LABELS[k]||{l:v.label||k, fmt:'num', icon:'📊', col:'var(--text3)'}}))
    .sort((a,b)=>a.meta.l.localeCompare(b.meta.l));

  const fmtRec = (val, fmt) => {
    if(fmt==='dollar') return f$(val);
    if(fmt==='sec')    return val.toFixed(1)+'s';
    return val.toLocaleString();
  };

  return div({style:{padding:2}},
    div({style:{display:'flex',alignItems:'center',gap:8,marginBottom:14}},
      div({style:{fontSize:'13px',fontWeight:700}},'🏆 All-Time Store Records'),
      div({style:{fontSize:'10px',color:'var(--text3)'}},'Best single-day performance on record')
    ),
    div({style:{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:8}},
      entries.map((rec,i)=>div({key:i,style:{
        background:'var(--surf2)',
        border:`.5px solid ${rec.meta.col}40`,
        borderRadius:'var(--rl)',padding:'12px 14px',
        position:'relative',overflow:'hidden'}},
        // Color accent bar
        div({style:{position:'absolute',top:0,left:0,width:3,height:'100%',background:rec.meta.col,borderRadius:'3px 0 0 3px'}}),
        div({style:{paddingLeft:8}},
          div({style:{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:6}},
            div({style:{fontSize:'9px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.4px',
              color:rec.meta.col}},rec.meta.icon+' '+rec.meta.l),
            rec.meta.lower&&span({style:{fontSize:'7px',color:'var(--text3)',marginTop:1}},'lower=better')
          ),
          div({style:{fontFamily:'var(--mono)',fontSize:'22px',fontWeight:800,
            color:rec.meta.col,marginBottom:4}},fmtRec(rec.value, rec.meta.fmt)),
          div({style:{fontSize:'9px',color:'var(--text3)'}},
            rec.date
              ? '📅 '+rec.date.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})
              : 'Date unknown'
          )
        )
      ))
    ),
    entries.length===0&&div({style:{color:'var(--text3)',padding:16,fontSize:'11px'}},
      'No records found in loaded file.'),
    h(AITabInsight,{label:'AI Records Analysis',
      buildPrompt:()=>{
        if(!recs) return 'No records data.';
        const entries=Object.entries(recs).slice(0,8).map(([k,v])=>k+':'+(typeof v==='object'?JSON.stringify(v).slice(0,40):String(v))).join(', ');
        return 'McDonald\'s store records for '+name+'. Records: '+entries+'. Which records are most at risk of being broken given current trends? Which represent the biggest operational gaps? Give specific improvement actions.';
      }})
  );
}

// MODAL STUBS (Compare, Insights, Dev, Settings)
function MultiStoreComparison({stores, ds, settings, onSelectStore, onClose}) {
  const [selected, setSelected] = useState([]);
  const [tab, setTab] = useState('scorecard');
  const cw=(settings.ctrlWeight||40)/100, ow=1-cw;
  const toggle=loc=>setSelected(prev=>prev.includes(loc)?prev.filter(l=>l!==loc):prev.length<5?[...prev,loc]:prev);
  const selStores=stores.filter(s=>selected.includes(s.loc));
  const COLS=['#60a5fa','#f59e0b','#34d399','#f472b6','#a78bfa'];
  const METRICS=[
    {label:'Combined',fn:s=>+(s.opsScore*ow+s.ctrlScore*cw).toFixed(1),fmt:v=>v.toFixed(1),higherBetter:true},
    {label:'Ops Score',fn:s=>s.opsScore,fmt:v=>v.toFixed(1),higherBetter:true},
    {label:'Controls',fn:s=>s.ctrlScore,fmt:v=>v.toFixed(1),higherBetter:true},
    {label:'OEPE',fn:s=>s.p.oepe||0,fmt:v=>Math.round(v)+'s',higherBetter:false},
    {label:'TPPH',fn:s=>s.p.tpph||0,fmt:v=>v.toFixed(2),higherBetter:true},
    {label:'KVS Time',fn:s=>s.p.kvst||0,fmt:v=>Math.round(v)+'s',higherBetter:false},
    {label:'DT Parked%',fn:s=>s.p.park||0,fmt:v=>fP(v,1),higherBetter:'range'},
    {label:'Labor%',fn:s=>s.p.laborPct||0,fmt:v=>fP(v,1),higherBetter:'target'},
    {label:'OT Hrs',fn:s=>s.p.otHrs||0,fmt:v=>v.toFixed(1),higherBetter:false},
  ];
  const getBest=(m,vals)=>{const nz=vals.filter(v=>v>0);if(!nz.length)return null;return m.higherBetter===false?Math.min(...nz):m.higherBetter===true?Math.max(...nz):null;};

  return div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.65)',zIndex:300,display:'flex',flexDirection:'column',alignItems:'center',padding:'20px',overflowY:'auto'}},
    div({style:{background:'var(--surf)',borderRadius:'var(--rl)',border:'.5px solid var(--bdr2)',width:'100%',maxWidth:940,display:'flex',flexDirection:'column',maxHeight:'92vh',overflow:'hidden'}},
      div({style:{padding:'14px 18px',borderBottom:'.5px solid var(--bdr)',display:'flex',alignItems:'center',gap:10}},
        div(null,
          div({style:{fontSize:'15px',fontWeight:700}},'📊 Multi-Store Comparison'),
          div({style:{fontSize:'11px',color:'var(--text2)',marginTop:2}},selected.length>=2?selected.length+' stores selected':'Select 2–5 stores to compare')
        ),
        btn({onClick:onClose,style:{marginLeft:'auto',background:'none',border:'none',color:'var(--text2)',fontSize:20,cursor:'pointer'}},'×')
      ),
      div({style:{padding:'8px 18px',borderBottom:'.5px solid var(--bdr)',display:'flex',gap:5,flexWrap:'wrap'}},
        stores.map(s=>{const idx=selected.indexOf(s.loc);const col=idx>=0?COLS[idx]:null;
          return btn({key:s.loc,style:{fontSize:'10px',padding:'3px 8px',borderRadius:4,border:`.5px solid ${col||'var(--bdr)'}`,background:col?col+'22':'transparent',color:col||'var(--text2)',cursor:'pointer',opacity:!col&&selected.length>=5?.4:1},onClick:()=>toggle(s.loc)},
            (col?'✓ ':'')+s.name.split(' ')[0]+' '+s.loc);
        })
      ),
      selected.length>=2&&div({style:{borderBottom:'.5px solid var(--bdr)',display:'flex'}},
        [['scorecard','Scorecard'],['chart','Radar'],['sales','Sales Trend']].map(([id,l])=>div({key:id,className:'tab'+(tab===id?' on':''),onClick:()=>setTab(id),style:{fontSize:'11px'}},l))
      ),
      selected.length<2
        ?div({style:{padding:30,textAlign:'center',color:'var(--text3)',fontSize:'13px'}},'Select at least 2 stores to compare')
        :div({style:{overflowY:'auto',flex:1}},
          tab==='scorecard'&&div({style:{overflowX:'auto'}},
            tbl({style:{borderCollapse:'collapse',width:'100%',fontSize:'11px'}},
              h('thead',null,h('tr',null,
                h('th',{style:{padding:'8px 12px',background:'var(--surf3)',textAlign:'left',fontSize:'9px',textTransform:'uppercase',letterSpacing:'.3px',color:'var(--text2)'}},'Metric'),
                selStores.map((s,i)=>h('th',{key:s.loc,style:{padding:'8px 10px',background:'var(--surf3)',borderLeft:'.5px solid var(--bdr)'}},
                  div({style:{fontWeight:700,color:COLS[i],fontSize:'11px'}},s.name),
                  div({style:{fontSize:'9px',color:'var(--text3)'}},'#'+s.loc)
                ))
              )),
              h('tbody',null,METRICS.map((m,mi)=>{
                const vals=selStores.map(s=>m.fn(s));const best=getBest(m,vals);
                return h('tr',{key:mi,style:{borderBottom:'.5px solid var(--bdr)'}},
                  h('td',{style:{padding:'6px 12px',fontSize:'11px',color:'var(--text2)'}},m.label),
                  vals.map((v,i)=>{const isBest=best!==null&&v===best&&v>0;
                    return h('td',{key:i,style:{padding:'6px 10px',textAlign:'right',fontFamily:'var(--mono)',fontWeight:isBest?700:400,color:isBest?COLS[i]:'var(--text)',borderLeft:'.5px solid var(--bdr)'}},
                      v>0?m.fmt(v):'—',isBest&&h('span',{style:{fontSize:'8px',marginLeft:3}},'★'));
                  })
                );
              }))
            )
          ),
          tab==='chart'&&h(CompareRadarChart,{selStores,COLS,METRICS}),
          tab==='sales'&&h(CompareLineChart,{selStores,COLS,ds})
        )
    )
  );
}

const INSIGHT_KEY='mf_insights';
function loadInsights(){try{return JSON.parse(localStorage.getItem(INSIGHT_KEY)||'[]');}catch{return[];}}
function saveInsights(ins){try{localStorage.setItem(INSIGHT_KEY,JSON.stringify(ins));}catch{}}

function AIInsightsLog({stores, settings, onClose}) {
  const [insights, setInsights] = useState(loadInsights);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [addText, setAddText] = useState('');
  const [addCat, setAddCat] = useState('ops');
  const [addLoc, setAddLoc] = useState('all');
  const CATS={ops:{l:'Operations',c:'#60a5fa'},ctrl:{l:'Controls',c:'#f87171'},labor:{l:'Labor',c:'#f59e0b'},sales:{l:'Sales',c:'#34d399'},weather:{l:'Weather',c:'#93c5fd'},anomaly:{l:'Anomaly',c:'#f97316'},other:{l:'Other',c:'#94a3b8'}};
  const add=(text,cat,source,loc)=>{const ins=[{id:Date.now(),text,cat,source,loc,date:new Date().toISOString(),status:'new',implemented:false,starred:false},...insights];setInsights(ins);saveInsights(ins);};
  const upd=(id,patch)=>{const ins=insights.map(i=>i.id===id?{...i,...patch}:i);setInsights(ins);saveInsights(ins);};
  const rem=id=>{const ins=insights.filter(i=>i.id!==id);setInsights(ins);saveInsights(ins);};
  const displayed=insights.filter(i=>{if(filter==='starred'&&!i.starred)return false;if(filter==='implemented'&&!i.implemented)return false;if(filter==='pending'&&(i.implemented||i.status==='dismissed'))return false;if(search&&!i.text.toLowerCase().includes(search.toLowerCase()))return false;return true;});
  return div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.65)',zIndex:300,display:'flex',flexDirection:'column',alignItems:'center',padding:'20px',overflowY:'auto'}},
    div({style:{background:'var(--surf)',borderRadius:'var(--rl)',border:'.5px solid var(--bdr2)',width:'100%',maxWidth:800,display:'flex',flexDirection:'column',maxHeight:'92vh',overflow:'hidden'}},
      div({style:{padding:'14px 18px',borderBottom:'.5px solid var(--bdr)',display:'flex',alignItems:'center',gap:10}},
        div(null,div({style:{fontSize:'15px',fontWeight:700}},'🧠 AI Insights Log'),div({style:{fontSize:'11px',color:'var(--text2)',marginTop:2}},insights.length+' insights · '+insights.filter(i=>i.implemented).length+' implemented')),
        btn({className:'btn btn-sm',onClick:()=>setAddOpen(o=>!o)},addOpen?'✕ Cancel':'+ Add'),
        btn({onClick:onClose,style:{marginLeft:'auto',background:'none',border:'none',color:'var(--text2)',fontSize:20,cursor:'pointer'}},'×')
      ),
      addOpen&&div({style:{padding:'10px 18px',borderBottom:'.5px solid var(--bdr)',background:'var(--surf2)'}},
        div({style:{display:'flex',gap:6,marginBottom:6}},
          sel({value:addCat,onChange:e=>setAddCat(e.target.value),style:{background:'var(--surf)',border:'.5px solid var(--bdr)',borderRadius:'var(--r)',color:'var(--text)',fontSize:'11px',padding:'4px 8px'}},Object.entries(CATS).map(([k,v])=>opt({key:k,value:k},v.l))),
          sel({value:addLoc,onChange:e=>setAddLoc(e.target.value),style:{background:'var(--surf)',border:'.5px solid var(--bdr)',borderRadius:'var(--r)',color:'var(--text)',fontSize:'11px',padding:'4px 8px'}},opt({value:'all'},'All Stores'),stores.map(s=>opt({key:s.loc,value:s.loc},s.name)))
        ),
        div({style:{display:'flex',gap:6}},
          h('textarea',{value:addText,onChange:e=>setAddText(e.target.value),placeholder:'Insight or finding...',style:{flex:1,background:'var(--surf)',border:'.5px solid var(--bdr)',borderRadius:'var(--r)',color:'var(--text)',fontSize:'11px',padding:'6px 8px',resize:'vertical',minHeight:56,fontFamily:'var(--sans)'}}),
          btn({className:'btn btn-a',style:{alignSelf:'flex-end',padding:'6px 14px'},onClick:()=>{if(addText.trim()){add(addText.trim(),addCat,'manual',addLoc);setAddText('');setAddOpen(false);}}},'Save')
        )
      ),
      div({style:{padding:'6px 18px',borderBottom:'.5px solid var(--bdr)',display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}},
        [['all','All'],['pending','Pending'],['starred','Starred'],['implemented','Done']].map(([k,l])=>btn({key:k,className:'sbtn'+(filter===k?' on':''),onClick:()=>setFilter(k)},l)),
        inp({className:'srch',placeholder:'Search...',value:search,onChange:e=>setSearch(e.target.value),style:{width:130,marginLeft:'auto'}})
      ),
      div({style:{overflowY:'auto',flex:1,padding:'10px 18px'}},
        !insights.length&&div({className:'empty-st'},div({className:'empty-st-t'},'No insights yet'),div({className:'empty-st-s'},'AI findings and manual notes appear here.')),
        displayed.map((ins,i)=>{const cat=CATS[ins.cat||ins.category]||CATS.other;
          return div({key:ins.id,style:{background:ins.implemented?'rgba(52,211,153,.04)':'var(--surf2)',border:`.5px solid ${ins.implemented?'rgba(52,211,153,.2)':'var(--bdr)'}`,borderRadius:'var(--r)',padding:'10px 12px',marginBottom:8}},
            div({style:{display:'flex',alignItems:'flex-start',gap:8}},
              div({style:{flex:1}},
                div({style:{display:'flex',gap:6,alignItems:'center',marginBottom:4,flexWrap:'wrap'}},
                  span({style:{fontSize:'9px',fontWeight:700,padding:'1px 6px',borderRadius:3,background:cat.c+'22',color:cat.c,border:`.5px solid ${cat.c}44`}},cat.l),
                  span({style:{fontSize:'9px',color:'var(--text3)'}},(ins.loc==='all'?'All Stores':STORE_NAMES[ins.loc]||ins.loc)+' · '+new Date(ins.date).toLocaleDateString('en-US',{month:'short',day:'numeric'})),
                  ins.implemented&&span({style:{fontSize:'9px',color:'#34d399',fontWeight:600}},'✓ Done')
                ),
                div({style:{fontSize:'11px',color:'var(--text)',lineHeight:1.6}},ins.text)
              ),
              div({style:{display:'flex',flexDirection:'column',gap:4}},
                btn({onClick:()=>upd(ins.id,{starred:!ins.starred}),style:{background:'none',border:'none',cursor:'pointer',fontSize:'14px',opacity:ins.starred?1:.3}},'⭐'),
                btn({onClick:()=>upd(ins.id,{implemented:!ins.implemented}),style:{background:'none',border:'.5px solid var(--bdr)',borderRadius:3,cursor:'pointer',fontSize:'9px',padding:'2px 5px',color:ins.implemented?'#34d399':'var(--text3)'}},ins.implemented?'✓':'Done'),
                btn({onClick:()=>rem(ins.id),style:{background:'none',border:'none',cursor:'pointer',fontSize:'11px',color:'var(--text3)'}},'✕')
              )
            )
          );
        })
      )
    )
  );
}

function DevDashboard({ds, settings, stores, userEvents, onClose}) {
  const [tab, setTab] = useState('audit');
  const [traceStore, setTraceStore] = useState('');
  const [traceDate, setTraceDate] = useState(fmtDI(new Date()));
  const [traceResult, setTraceResult] = useState(null);
  const totals={labor:ds?ds.laborRows.length:0,ops:ds?ds.opsRows.length:0,ctrl:ds?ds.ctrlRows.length:0,weather:ds?ds.weatherRows.length:0,peaks:ds?(ds.peaksSvcRows||[]).length:0,audit:ds?(ds.auditRows||[]).length:0};
  const audit = useMemo(()=>{
    if(!ds||!ds.loaded)return null;
    return ds.storeIds.map(loc=>{
      const lR=ds.laborRows.filter(r=>r.loc===loc),oR=ds.opsRows.filter(r=>r.loc===loc),cR=ds.ctrlRows.filter(r=>r.loc===loc);
      const wR=ds.weatherRows?ds.weatherRows.filter(r=>r.loc===loc):[];
      const pR=(ds.peaksSvcRows||[]).filter(r=>String(r.loc||'').trim()===loc);
      const dates=lR.map(r=>r.date).sort((a,b)=>a-b);
      const first=dates[0],last=dates[dates.length-1];
      const exp=first&&last?Math.round((last-first)/86400000)+1:0;
      const cov=exp>0?+(lR.length/exp*100).toFixed(0):0;
      return{loc,name:STORE_NAMES[loc]||loc,labor:lR.length,ops:oR.length,ctrl:cR.length,weather:wR.length,peaks:pR.length,audit:(ds.auditRows||[]).filter(r=>r.loc===loc).length,first,last,coverage:cov,ok:lR.length>0&&oR.length>0&&cR.length>0};
    });
  },[ds]);

  return div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.65)',zIndex:300,display:'flex',flexDirection:'column',alignItems:'center',padding:'20px',overflowY:'auto'}},
    div({style:{background:'var(--surf)',borderRadius:'var(--rl)',border:'.5px solid var(--bdr2)',width:'100%',maxWidth:940,display:'flex',flexDirection:'column',maxHeight:'92vh',overflow:'hidden'}},
      div({style:{padding:'14px 18px',borderBottom:'.5px solid var(--bdr)',display:'flex',alignItems:'center',gap:10}},
        div(null,div({style:{fontSize:'15px',fontWeight:700}},'🛠 Developer Dashboard'),div({style:{fontSize:'11px',color:'var(--text2)',marginTop:2}},ds&&ds.loaded?'Live data — '+( ds.storeIds||[]).length+' stores':'Mock data')),
        btn({onClick:onClose,style:{marginLeft:'auto',background:'none',border:'none',color:'var(--text2)',fontSize:20,cursor:'pointer'}},'×')
      ),
      div({style:{padding:'8px 18px',borderBottom:'.5px solid var(--bdr)',display:'flex',gap:14,flexWrap:'wrap',background:'var(--surf2)'}},
        Object.entries({Labor:totals.labor,'Ops':totals.ops,'Ctrl':totals.ctrl,'Wx':totals.weather,'Peaks':totals.peaks,'Audit':totals.audit}).map(([k,v])=>div({key:k,style:{textAlign:'center',minWidth:60}},div({style:{fontFamily:'var(--mono)',fontSize:'16px',fontWeight:700,color:v>0?'#10b981':'#ef4444'}},v.toLocaleString()),div({style:{fontSize:'9px',color:'var(--text3)',textTransform:'uppercase'}},k)))
      ),
      div({className:'tabs'},['audit','trace','settings_dump'].map(t2=>div({key:t2,className:'tab'+(tab===t2?' on':''),onClick:()=>setTab(t2),style:{fontSize:'11px'}},t2==='audit'?'Data Audit':t2==='trace'?'Engine Trace':'Settings Dump'))),
      div({style:{overflowY:'auto',flex:1,padding:'12px 18px'}},
        tab==='audit'&&(audit?div({style:{overflowX:'auto'}},
          tbl({style:{width:'100%',borderCollapse:'collapse',fontSize:'10px'}},
            h('thead',null,tr(null,...['Store','Labor','Ops','Ctrl','Wx','Peaks','Audit','Coverage','Status'].map(l=>th({style:{padding:'4px 8px',background:'var(--surf3)',fontSize:'8px',textTransform:'uppercase',color:'var(--text2)',textAlign:'left',borderBottom:'.5px solid var(--bdr)'}},l)))),
            h('tbody',null,audit.map((a,i)=>tr({key:a.loc,style:{borderBottom:'.5px solid var(--bdr)'}},
              td({style:{padding:'4px 8px',fontWeight:500}},a.name),
              ...[a.labor,a.ops,a.ctrl,a.weather,a.peaks,a.audit].map((v,j)=>td({key:j,style:{padding:'4px 8px',fontFamily:'var(--mono)',color:v>0?'#10b981':'#ef4444'}},v)),
              td({style:{padding:'4px 8px',color:a.coverage>=90?'#10b981':a.coverage>=70?'#f59e0b':'#ef4444',fontFamily:'var(--mono)'}},a.coverage>0?a.coverage+'%':'—'),
              td({style:{padding:'4px 8px'}},span({style:{fontSize:'8px',fontWeight:700,padding:'1px 5px',borderRadius:2,background:a.ok?'rgba(16,185,129,.1)':'rgba(245,158,11,.1)',color:a.ok?'#10b981':'#f59e0b'}},a.ok?'Full':'Partial'))
            )))
          )
        ):div({style:{padding:20,color:'var(--text3)',textAlign:'center'}},'Load real data to run audit')),
        tab==='trace'&&div(null,
          div({style:{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap',alignItems:'flex-end'}},
            div(null,div({style:{fontSize:'10px',color:'var(--text3)',marginBottom:4}},'Store'),sel({value:traceStore,onChange:e=>setTraceStore(e.target.value),style:{background:'var(--surf)',border:'.5px solid var(--bdr)',borderRadius:'var(--r)',color:'var(--text)',fontSize:'11px',padding:'5px 8px'}},opt({value:''},'— Select —'),(ds&&ds.storeIds||Object.keys(DEFAULT_TARGETS)).map(loc=>opt({key:loc,value:loc},STORE_NAMES[loc]||loc)))),
            div(null,div({style:{fontSize:'10px',color:'var(--text3)',marginBottom:4}},'Date'),inp({type:'date',value:traceDate,onChange:e=>setTraceDate(e.target.value),style:{background:'var(--surf)',border:'.5px solid var(--bdr)',borderRadius:'var(--r)',color:'var(--text)',fontSize:'11px',padding:'5px 8px'}})),
            btn({className:'btn btn-a',onClick:()=>{if(!traceStore||!traceDate)return;const r=forecastDay(traceStore,new Date(traceDate+'T12:00:00'),ds,{...settings,_userEvents:userEvents||{}});setTraceResult(r);}}, '▶ Run Trace')
          ),
          traceResult&&div({style:{background:'var(--surf2)',border:'.5px solid var(--bdr)',borderRadius:'var(--r)',padding:'12px 14px'}},
            div({style:{fontSize:'12px',fontWeight:600,marginBottom:10,color:'var(--amber)'}},
              'Trace — '+STORE_NAMES[traceResult.loc]+' · '+new Date(traceDate+'T12:00:00').toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'})),
            [['LY Anchor',traceResult.lyAdj>0?f$(traceResult.lyAdj):'No LY data'],
             ['T2W Trend',(traceResult.t2*100).toFixed(2)+'%'],
             ['T6W Trend',(traceResult.t6*100).toFixed(2)+'%'],
             ['Ops Factor',(traceResult.opsFactor||1).toFixed(4)+'×'],
             ['Weather Adj',((traceResult.wAdj||0)*100).toFixed(2)+'%'],
             ['Plus-Up',effectivePlusUp(traceResult.loc,settings).toFixed(1)+'%'],
             ['══ FORECAST',f$(traceResult.forecast)],
             ['Actual',traceResult.actual>0?f$(traceResult.actual):'(future)'],
             ['Variance',traceResult.varPct!=null?fPct(traceResult.varPct):'—'],
            ].map(([k,v],i)=>div({key:i,style:{display:'flex',gap:10,padding:'4px 0',borderBottom:'.5px solid var(--bdr)',fontSize:'11px',background:k.startsWith('══')?'rgba(245,158,11,.05)':'transparent'}},
              span({style:{minWidth:180,color:'var(--text3)'}}),k,
              span({style:{fontFamily:'var(--mono)',fontWeight:k.startsWith('══')?700:400,color:k.startsWith('══')?'var(--amber)':'var(--text)'}}),v
            ))
          )
        ),
        tab==='settings_dump'&&h('pre',{style:{fontSize:'10px',color:'var(--text2)',background:'var(--surf2)',border:'.5px solid var(--bdr)',borderRadius:'var(--r)',padding:'12px',overflowX:'auto',lineHeight:1.6,maxHeight:400}},
          JSON.stringify({mode:settings.mode,cascade:settings.cascade,plusUp:settings.plusUp,tolerance:settings.tolerance,weeksBack:settings.weeksBack,scoringMode:settings.scoringMode,ctrlWeight:settings.ctrlWeight,useEmpirical:settings.useEmpirical,metricActive:settings.metricActive,storesLoaded:ds?ds.storeIds.length:0},null,2)
        )
      )
    )
  );
}

// SETTINGS
function Settings({settings, onUpdate, onClose}) {
  const S=settings;
  const [activeSection, setActiveSection] = useState('identity');
  const set=(path,val)=>{const keys=path.split('.');const next=JSON.parse(JSON.stringify(S));let cur=next;keys.slice(0,-1).forEach(k=>{if(!cur[k])cur[k]={};cur=cur[k];});cur[keys[keys.length-1]]=val;onUpdate(next);};
  const inp2=({path,...rest})=>inp({...rest,value:S[path]??'',onChange:e=>set(path,isNaN(e.target.value)?e.target.value:+e.target.value)});
  const Toggle=({label,path,options})=>div({className:'set-row'},div({className:'set-lbl'},label),div({style:{display:'flex',gap:4}},options.map(([l,v])=>btn({key:String(l),className:'sbtn'+(S[path]===v?' on':''),onClick:()=>set(path,v),style:{fontSize:'10px',padding:'2px 8px'}},l))));

  return div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.7)',zIndex:300,overflowY:'auto',display:'flex',justifyContent:'flex-start',padding:'20px 20px 20px 8px'}},
    div({style:{background:'var(--surf)',borderRadius:'var(--rl)',border:'.5px solid var(--bdr2)',width:'100%',maxWidth:640,height:'fit-content'}},
      div({style:{padding:'14px 18px',borderBottom:'.5px solid var(--bdr)',display:'flex',alignItems:'center',gap:10}},
        div({style:{fontSize:'15px',fontWeight:700}},'⚙ Settings'),
        btn({onClick:onClose,style:{marginLeft:'auto',background:'none',border:'none',color:'var(--text2)',fontSize:20,cursor:'pointer'}},'×')
      ),
      div({style:{display:'flex',flex:1,overflow:'hidden'}},
        // ── Sidebar menu
        div({style:{width:140,flexShrink:0,borderRight:'.5px solid var(--bdr)',
          background:'var(--surf2)',padding:'8px 0',overflowY:'auto'}},
          ...[['identity','👤 Identity'],['forecast','📐 Forecast'],['labor','👥 Labor'],
              ['appearance','🎨 Theme'],['metrics','📊 Metrics'],['operators','🏢 Operators'],['supervisors','🗂 Patches'],
              ['ai','🤖 AI'],['dev','🛠 Dev']
          ].map(([k,l])=>div({key:k,
            onClick:()=>setActiveSection(k),
            style:{padding:'8px 14px',fontSize:'10px',fontWeight:activeSection===k?700:400,
              color:activeSection===k?'var(--amber)':'var(--text2)',
              background:activeSection===k?'rgba(245,158,11,.08)':'transparent',
              cursor:'pointer',borderLeft:activeSection===k?'2px solid var(--amber)':'2px solid transparent'}
          },l))
        ),
        // ── Section content
        div({style:{flex:1,overflowY:'auto',padding:'14px 18px'}},

        activeSection==='ai'&&div({className:'set-sec'},
          div({className:'set-sec-t'},'🤖 AI & Integrations'),
          div({className:'set-sec-t'},'AI & Integrations'),
          div({className:'set-note'},'Anthropic API key enables AI Lookup in Backtest and Anomaly panels. Stored locally in your browser.'),
          div({className:'set-row'},
            div({className:'set-lbl'},'Anthropic API Key',h('a',{href:'https://console.anthropic.com',target:'_blank',style:{fontSize:'9px',color:'#818cf8',marginLeft:6}},'Get key →')),
            inp({className:'set-inp',type:'password',defaultValue:(()=>{try{return localStorage.getItem('mf_anthropic_key')||'';}catch{return '';}})(),placeholder:'sk-ant-…',onBlur:e=>{try{if(e.target.value.trim())localStorage.setItem('mf_anthropic_key',e.target.value.trim());else localStorage.removeItem('mf_anthropic_key');}catch{}},style:{fontFamily:'var(--mono)',fontSize:'11px'}})
          )
        ),

        activeSection==='identity'&&div({className:'set-sec'},
          div({className:'set-sec-t'},'Identity'),
          div({className:'set-row'},div({className:'set-lbl'},'Your Name'),inp({className:'set-inp',defaultValue:S.userName||'',onBlur:e=>set('userName',e.target.value),placeholder:'e.g. Fletcher',title:'Used in the At a Glance welcome greeting'})),
          div({className:'set-row'},div({className:'set-lbl'},'District Name'),inp({className:'set-inp',defaultValue:S.districtName||'',onBlur:e=>set('districtName',e.target.value),placeholder:'e.g. McDOK'})),
          div({className:'set-note'},'Appears in report headers, file exports, and email subjects. Update if your district or operating company name changes. Stays editable.'),
          div({className:'set-row'},div({className:'set-lbl'},'Operator Name'),inp({className:'set-inp',defaultValue:S.operatorName||'',onBlur:e=>set('operatorName',e.target.value),placeholder:'e.g. Ryan Thorley'}))
        ),
        activeSection==='forecast'&&div({className:'set-sec'},
          div({className:'set-sec-t'},'Forecast Parameters'),
          div({className:'set-row'},div({className:'set-lbl'},'Weeks Back (trend)'),inp2({className:'set-inp',path:'weeksBack',type:'number',min:2,max:12})),
          div({className:'set-note'},'How many weeks of rolling data to use when computing the 6-week ops/labor averages shown on store dashboards. Default 6. Increase to 12 for very volatile stores; decrease to 2–3 for stores that changed recently (new manager, remodel, etc).'),
          div({className:'set-row'},div({className:'set-lbl'},'Week Start Day'),
            h('select',{className:'set-inp',value:S.weekStartDay!==undefined?S.weekStartDay:3,
              onChange:e=>set('weekStartDay',+e.target.value)},
              h('option',{value:0},'Sunday'),
              h('option',{value:1},'Monday'),
              h('option',{value:3},'Wednesday (McDonald\'s)'),
              h('option',{value:4},'Thursday'),
              h('option',{value:5},'Friday')
            )
          ),
          div({className:'set-row'},div({className:'set-lbl'},'Tolerance % (pass/miss)'),inp2({className:'set-inp',path:'tolerance',type:'number',min:1,max:15})),
          div({className:'set-note'},'The ± percentage band that defines Pass vs Miss on scorecards and in reports. A store within this range of its target counts as passing. Default 3%. Tighter = higher standards; wider = more tolerance for variance.'),
          div({className:'set-note'},'LY Method: Each projected day compares to the actual same day of week, 52 weeks prior (e.g., Monday Jun 1, 2026 → actual Monday Jun 2, 2025). Holidays and tagged events are skipped to the next clean comparable week. No synthetic blending is applied — LY always reflects real historical data you can verify.'),
          div({className:'set-note'},'If a LY date had an unusual result (event, closure, weather), tag it in Events. The engine automatically skips tagged dates and uses the next clean comparable week instead.'),
          div({className:'set-row'},div({className:'set-lbl'},'Plus-Up %'),inp2({className:'set-inp',path:'plusUp',type:'number',min:-10,max:20})),
          div({className:'set-note'},'+2% means the model adds 2% on top of its calculation. Management judgment override — applied directly to every forecast day. Use when model consistently under- or over-calls. Per-store override available in store settings.'),
          h(Toggle,{label:'Cascade',path:'cascade',options:[['On',true],['Off',false]]}),
          div({className:'set-note'},'Cascade: each week forecast anchors to the prior week projected sales. Best OFF for most stores.'),
          div({className:'set-note'},'Each week\'s forecast anchors to the prior week\'s projected sales instead of last year\'s actual. Best OFF for most stores — ON can compound errors over long projection windows.'),
          div({className:'set-row'},
            div({className:'set-lbl'},'Trend Weights (T2/T4/T6)'),
            div({style:{display:'flex',gap:4}},
              ['t2','t4','t6'].map(k=>inp({key:k,className:'set-inp',defaultValue:S.trendWeights?S.trendWeights[k]:'',type:'number',min:0,max:1,step:.05,style:{width:52},onBlur:e=>set('trendWeights.'+k,+e.target.value),placeholder:k==='t2'?.5:k==='t4'?.3:.2}))
            )
          )
        ),
        activeSection==='labor'&&div({className:'set-sec'},
          div({className:'set-sec-t'},'Labor % Thresholds'),
          div({className:'set-row'},div({className:'set-lbl'},'Green threshold (±%)'),inp2({className:'set-inp',path:'laborGreenPct',type:'number',min:.1,max:2,step:.1})),
          div({className:'set-note'},'Labor% within this many points of target shows green on scorecards. Default ±0.3%. This is your acceptable operating range — tighter for high-volume stores, slightly wider for smaller stores.'),
          div({className:'set-row'},div({className:'set-lbl'},'Yellow threshold (±%)'),inp2({className:'set-inp',path:'laborYellowPct',type:'number',min:.5,max:5,step:.1}))
        ),
        activeSection==='appearance'&&div({className:'set-sec'},
          div({className:'set-sec-t'},'🎨 Appearance'),
          div({className:'set-note'},'Choose a color theme and display mode. Each theme reflects a different visual identity — all data and functionality are identical across themes.'),
          // Theme picker
          div({style:{marginBottom:10}},
            div({style:{fontSize:'10px',color:'var(--text2)',marginBottom:6,fontWeight:600}},'Color Theme'),
            div({style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}},
              [
                {id:'command',label:'Command Center',desc:'Navy + Gold (QSRSoft-inspired)'},
                {id:'golden', label:'Golden Standard',desc:'Warm charcoal + McD Gold'},
                {id:'dualbrand',label:'Dual Brand',desc:'MCDOK Red vs EA Teal - two orgs'},
                {id:'refined', label:'Refined Dark',desc:'Minimal premium — Bloomberg style'},
              ].map(({id,label,desc})=>
                div({key:id,
                  style:{border:'.5px solid '+(S.theme===id?'var(--acc1)':'var(--bdr)'),
                    borderRadius:'var(--r)',padding:'8px 10px',cursor:'pointer',
                    background:S.theme===id?'var(--adim)':'transparent',
                    transition:'all .15s'},
                  onClick:()=>set('theme',id)},
                  div({style:{display:'flex',alignItems:'center',gap:6}},
                    div({style:{width:10,height:10,borderRadius:'50%',
                      background:id==='command'?'#FFBC0D':id==='golden'?'#FFC72C':id==='dualbrand'?'#DA291C':'#FFB700'}}),
                    div({style:{fontWeight:600,fontSize:'10px'}},label),
                    S.theme===id&&span({style:{marginLeft:'auto',color:'var(--acc1)',fontSize:'9px'}},'✓ Active')
                  ),
                  div({style:{fontSize:'9px',color:'var(--text3)',marginTop:2}},desc)
                )
              )
            )
          ),
          // Light / Dark toggle
          div({style:{display:'flex',alignItems:'center',gap:10,marginBottom:6}},
            div({style:{fontSize:'10px',color:'var(--text2)',fontWeight:600}},'Display Mode'),
            div({style:{display:'flex',gap:4}},
              ['light','dark'].map(mode=>
                btn({key:mode,
                  className:'btn btn-sm'+(S.colorMode===mode?' btn-a':''),
                  style:{padding:'3px 12px',fontSize:'10px'},
                  onClick:()=>set('colorMode',mode)},
                  mode==='light'?'☀ Light':'🌙 Dark'
                )
              )
            )
          ),
          div({className:'set-note'},'System preference is the default. Override here sticks across sessions.')
        ),
        activeSection==='metrics'&&div({className:'set-sec'},
          div({style:{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}},
            div({className:'set-sec-t',style:{margin:0}},'Scoring Weights '),
            h(InfoIcon,{articleKey:'model_health'})
          ),
          div({className:'set-note',style:{marginBottom:10}},'Adjust how Ops and Controls metrics are weighted in the combined score. Default 70/30. These weights affect ALL store scorecards — calibrate to reflect your district\'s priorities.'),
          h(Toggle,{label:'Scoring Mode',path:'scoringMode',options:[['Absolute','absolute'],['Relative','relative'],['Optimistic','optimistic']]}),
          div({className:'set-row'},div({className:'set-lbl'},'Controls Weight %'),inp2({className:'set-inp',path:'ctrlWeight',type:'number',min:0,max:80})),
          div({className:'set-note'},'Controls Weight: % of Ops Score from Controls scorecard vs Operations scorecard. Default 30%. Affects score display only — does not affect forecasts.')
        ),
        activeSection==='metrics'&&div({className:'set-sec'},
          div({className:'set-sec-t'},'Active Metrics'),
          div({className:'set-note'},'Toggle metrics off to exclude them from scoring.'),
          div({style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:4,marginTop:4}},
            Object.entries({oepe:'OEPE',kvst:'KVS Time',kvsu:'KVS Usage',park:'DT Parked%',tpph:'TPPH',labor:'Labor%',r2p:'R2P',cashOS:'Cash O/S',tRedA:'T-Red After',ot:'OT Hours',refund:'Refunds',disc:'Discounts'}).map(([key,label])=>{
              const active=(S.metricActive||{})[key]!==false;
              return div({key,style:{display:'flex',alignItems:'center',gap:6,padding:'3px 6px',background:active?'rgba(16,185,129,.06)':'rgba(239,68,68,.06)',border:`.5px solid ${active?'rgba(16,185,129,.2)':'rgba(239,68,68,.2)'}`,borderRadius:'var(--r)',cursor:'pointer'},onClick:()=>{const next=JSON.parse(JSON.stringify(S.metricActive||{}));next[key]=!active;set('metricActive',next);}},
                span({style:{fontSize:'10px'}}),active?'✓':'✗',
                span({style:{fontSize:'10px',color:active?'var(--text)':'var(--text3)',marginLeft:4}},label)
              );
            })
          )
        ),
        activeSection==='forecast'&&div({className:'set-sec'},
          div({className:'set-sec-t'},'Forecast Model — Enhancement Toggles'),
          div({className:'set-note'},'Control which forecast enhancements are active. Changes take effect immediately. Toggle off if you suspect an enhancement is affecting accuracy negatively.'),
          div({style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}},
            ...([
              ['useTrendInForecast','Trend Integration','Blend recent trend into the primary forecast formula. Alpha controls how strongly trend moves the number.',true],
              ['useGCAModel','GC × Avg Check Model (primary)','When ON, forecast = Forecast Guest Count × LY Avg Check. Computes alongside LY model — compare both.',false],
              ['showGCAComparison','Show Both Models in Projection','Show LY model and GCA model side-by-side in the Projection Workflow table.',true],
              ['useEventRegistry','Event Registry Adjustment','Apply learned historical impact from tagged events to matching future forecast dates.',true],
              ['showDaypartSupplement','Daypart Supplement','Show B/L/D breakdown under projection rows (requires 3 Peaks data).',true],
            ].map(([key,label,note,def])=>div({key,style:{background:'var(--surf2)',border:'.5px solid var(--bdr)',borderRadius:'var(--r)',padding:'8px 10px'}},
              div({style:{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:3}},
                div({style:{fontSize:'10px',fontWeight:600,color:'var(--text)'}},(S[key]!==undefined?S[key]:def)?'🟢 '+label:'⚫ '+label),
                h('select',{className:'set-inp',style:{width:60,fontSize:'9px'},
                  value:(S[key]!==undefined?S[key]:def)?'on':'off',
                  onChange:e=>set(key,e.target.value==='on')},
                  h('option',{value:'on'},'On'),h('option',{value:'off'},'Off'))
              ),
              div({style:{fontSize:'8px',color:'var(--text3)',lineHeight:1.4}},note)
            )))
          ),
          S.useTrendInForecast!==false&&div({className:'set-row',style:{marginBottom:10}},
            div({className:'set-lbl'},'Trend Alpha (blend weight)'),
            div({style:{display:'flex',alignItems:'center',gap:8}},
              h('input',{type:'range',min:0,max:0.6,step:0.05,
                value:S.trendAlpha??0.30,
                onChange:e=>set('trendAlpha',+e.target.value),
                style:{width:120}}),
              div({style:{fontSize:'11px',fontFamily:'var(--mono)',color:'var(--amber)',fontWeight:700,minWidth:30}},
                (((S.trendAlpha??0.30)*100).toFixed(0))+'%'),
              div({style:{fontSize:'9px',color:'var(--text3)'}},
                '0% = ignore trend · 30% = moderate · 60% = strong trend following')
            )
          ),
          div({className:'set-sec-t',style:{marginTop:8}},'Empirical Weather Calibration'),
          div({className:'set-note'},'Calculates per-store rain/heat/cold coefficients from loaded Mesonet data. More accurate than global sliders. Requires 12+ months of Mesonet weather data loaded. When OFF, uses global weather sliders. Tied directly to forecast weather adjustment (wAdj).'),
          h(Toggle,{label:'Use Empirical Coefficients',path:'useEmpirical',options:[['Off',false],['On',true]]}),
          div({className:'set-row',style:{marginTop:8}},
            div({className:'set-lbl'},'Ops Normalization'),
            h('select',{className:'set-inp',value:S.opsNorm?'on':'off',
              onChange:e=>set('opsNorm',e.target.value==='on')},
              h('option',{value:'off'},'Off — use targets as baseline'),
              h('option',{value:'on'},'On — use store\'s own history as baseline')
            )
          ),
          S.opsNorm&&div({className:'set-note',style:{marginTop:4}},
            'When enabled, ops metrics (OEPE, TPPH, etc.) are evaluated against each store\'s own rolling average rather than targets. Prevents double-penalizing stores whose LY data already reflects their consistent performance level. Per-store override available in store settings.'),
          S.useEmpirical&&div({style:{marginTop:6}},
            btn({className:'btn btn-a',style:{fontSize:'11px',padding:'5px 12px'},onClick:()=>{const emp=calibrateWeather(window._mfDS||{});const n=Object.keys(emp).length;if(n>0){set('empiricalWeather',emp);alert('Calibrated '+n+' stores.');}else alert('Load Mesonet data first.');}},
              '⚡ Run Calibration Now'),
            Object.keys(S.empiricalWeather||{}).length>0&&div({style:{marginTop:5,fontSize:'10px',color:'var(--text3)'}},Object.keys(S.empiricalWeather).length+' stores calibrated')
          )
        ),
        activeSection==='operators'&&div({className:'set-sec'},
          div({className:'set-sec-t'},'Operator Groups'),
          div({className:'set-note'},'Edit operators and their store numbers. If you see duplicates, click Reset below to pull the latest structure from the app.'),
          div({style:{marginBottom:8}},
            btn({className:'btn btn-sm',onClick:()=>{
              const n={...S,operators:{...DEF_SETTINGS.operators},supervisorGroups:{...DEF_SETTINGS.supervisorGroups}};
              onUpdate(n);
            }},'↺ Sync operators & supervisors from defaults')
          ),
          Object.entries(S.operators||{}).map(([name,ids])=>div({key:name,className:'set-row'},
            div({style:{display:'flex',gap:6,alignItems:'center',marginBottom:3}},
              div({className:'set-lbl',style:{margin:0,fontWeight:600}},name),
              btn({className:'btn btn-sm btn-red',style:{padding:'1px 6px',fontSize:'9px'},onClick:()=>{if(confirm('Remove '+name+'?')){const next=JSON.parse(JSON.stringify(S));delete next.operators[name];onUpdate(next);}}},'✕')
            ),
            inp({className:'set-inp',defaultValue:ids.join(','),key:name+ids.join(','),onBlur:e=>set('operators.'+name,e.target.value.split(',').map(s=>s.trim()).filter(Boolean))})
          )),
          div({className:'set-row'},
            div({className:'set-lbl',style:{marginBottom:6}},'Add Operator'),
            div({style:{display:'flex',gap:6}},
              inp({id:'new-op',className:'set-inp',placeholder:'Name',style:{flex:1}}),
              btn({className:'btn btn-sm btn-a',onClick:()=>{const n=document.getElementById('new-op').value.trim();if(n){const next=JSON.parse(JSON.stringify(S));if(!next.operators)next.operators={};next.operators[n]=[];onUpdate(next);document.getElementById('new-op').value='';}}},' +')
            )
          )
        ),
        activeSection==='supervisors'&&div({className:'set-sec'},
          div({className:'set-sec-t'},'Supervisor Patches'),
          Object.entries(S.supervisorGroups||{}).map(([name,ids])=>div({key:name,className:'set-row'},
            div({style:{display:'flex',gap:6,alignItems:'center',marginBottom:3}},
              div({className:'set-lbl',style:{margin:0,fontWeight:600}},name),
              btn({className:'btn btn-sm btn-red',style:{padding:'1px 6px',fontSize:'9px'},onClick:()=>{if(confirm('Remove '+name+'?')){const next=JSON.parse(JSON.stringify(S));delete next.supervisorGroups[name];onUpdate(next);}}},'✕')
            ),
            inp({className:'set-inp',defaultValue:ids.join(','),key:name+ids.join(','),onBlur:e=>set('supervisorGroups.'+name,e.target.value.split(',').map(s=>s.trim()).filter(Boolean))})
          )),
          div({className:'set-row'},
            div({className:'set-lbl',style:{marginBottom:6}},'Add Supervisor Patch'),
            div({style:{display:'flex',gap:6}},
              inp({id:'new-sup',className:'set-inp',placeholder:'Supervisor Name',style:{flex:1}}),
              btn({className:'btn btn-sm btn-a',onClick:()=>{const n=document.getElementById('new-sup').value.trim();if(n){const next=JSON.parse(JSON.stringify(S));if(!next.supervisorGroups)next.supervisorGroups={};next.supervisorGroups[n]=[];onUpdate(next);document.getElementById('new-sup').value='';}}},'+')
            )
          )
        ),
        activeSection==='dev'&&div({style:{display:'flex',flexDirection:'column',gap:6,marginTop:8}},
          btn({className:'btn',style:{width:'100%',padding:'8px',fontSize:'12px'},onClick:()=>{try{localStorage.setItem('mf_settings',JSON.stringify(settings));alert('Saved!');}catch(e){alert('Failed: '+e.message);}}},'💾 Save to Browser'),
          btn({className:'btn btn-a',style:{width:'100%',padding:'8px',fontSize:'12px'},onClick:()=>{navigator.clipboard&&navigator.clipboard.writeText(JSON.stringify(settings,null,2)).then(()=>alert('Copied!'));}},'📤 Export JSON'),
          btn({className:'btn',style:{width:'100%',padding:'8px',fontSize:'12px'},onClick:()=>{const s=prompt('Paste settings JSON:');if(s)try{onUpdate(JSON.parse(s));alert('Imported!');}catch(e){alert('Invalid JSON');}}},'📋 Import JSON'),
          btn({className:'btn btn-red',style:{width:'100%',padding:'8px',fontSize:'12px'},onClick:()=>{if(confirm('Reset to defaults?'))onUpdate(DEF_SETTINGS);}},'↺ Reset to Defaults')
        )
      )// close content div
    )// close flex row (sidebar+content)
  )// close inner panel
);
}

// ATTENTION PANEL — inline critical issues drop-down

// LOCKED PROJECTIONS SYSTEM


// AI INSIGHTS TAB
function AIInsightsTab({store, ds, settings}) {
  const {p, t, loc} = store;
  const wb = settings.weeksBack||6;  // component-level so render can use it
  const [insights, setInsights] = React.useState(null);
  const [loading,  setLoading]  = React.useState(false);
  const [error,    setError]    = React.useState(null);
  const apiKey = (()=>{try{return localStorage.getItem('mf_anthropic_key')||'';}catch{return '';}})();

  const generateInsights = async () => {
    if(!apiKey){ setError('No API key — add it in Settings → AI & Integrations.'); return; }
    setLoading(true); setError(null);

    // Build rich context for this store
    const laborRows = ds&&ds.laborRows?ds.laborRows.filter(r=>r.loc===loc&&r.date>=new Date(Date.now()-wb*7*864e5)):[];
    const ctrlRows  = ds&&ds.ctrlRows ?ds.ctrlRows.filter(r=>r.loc===loc&&r.date>=new Date(Date.now()-wb*7*864e5)):[];
    const opsRows   = ds&&ds.opsRows  ?ds.opsRows.filter(r=>r.loc===loc&&r.date>=new Date(Date.now()-wb*7*864e5)):[];

    const avg = (arr,f) => arr.length ? arr.filter(r=>r[f]>0).reduce((a,r)=>a+(r[f]||0),0)/Math.max(1,arr.filter(r=>r[f]>0).length) : 0;

    const ctx = {
      store: STORE_NAMES[loc]||loc, loc,
      weeksBack: wb,
      oepe:        p.oepe?.toFixed(1),     tOepe: t.tOepe,
      tpph:        p.tpph?.toFixed(2),     tTpph: t.tTpph,
      kvst:        p.kvst?.toFixed(1),     tKvst: t.tKvst,
      kvsu:        p.kvsu?(p.kvsu*100).toFixed(1):null, tKvsu: t.tKvsu?(t.tKvsu*100).toFixed(1):null,
      labor:       p.laborPct?(p.laborPct*100).toFixed(2):null, tLabor: t.tLabor?(t.tLabor*100).toFixed(2):null,
      opsScore:    store.opsScore, ctrlScore: store.ctrlScore,
      cashOS:      p.cashOSPct?(p.cashOSPct*100).toFixed(3):null,
      tRedAPct:    p.tRedAPct?(p.tRedAPct*100).toFixed(2):null,
      otHrs:       p.otHrs?.toFixed(1),
      avgCheck:    p.avgCheck>0?p.avgCheck.toFixed(2):'N/A', tAvgCheck: t.tAvgCheck>0?t.tAvgCheck.toFixed(2):'N/A',
      t2wTrend:    p.t2w?(p.t2w*100).toFixed(1):null,
      t6wSales:    Math.round(p.weeklySales||p.avgSales||0),
    };

    const prompt = `You are an expert McDonald's district analytics consultant reviewing performance data for ${ctx.store} (store #${ctx.loc}).

Here is the last ${ctx.weeksBack}-week performance summary:
- OEPE: ${ctx.oepe}s (target ≤${ctx.tOepe}s) — ${ctx.oepe>ctx.tOepe?"OVER target by "+(ctx.oepe-ctx.tOepe).toFixed(1)+'s':'at or under target'}
- TPPH: ${ctx.tpph} (target ≥${ctx.tTpph}) — ${ctx.tpph<ctx.tTpph?'UNDER target':'meeting target'}
- KVS Time: ${ctx.kvst}s (target ≤${ctx.tKvst}s)
- KVS Usage: ${ctx.kvsu}% (target ≥${ctx.tKvsu}%)
- Labor %: ${ctx.labor}% (target ${ctx.tLabor}%)
- Cash O/S: ${ctx.cashOS}% (target ≤0.5%)
- T-Red After %: ${ctx.tRedAPct}%
- OT Hours/day: ${ctx.otHrs}
- Avg Check: $${ctx.avgCheck} (target $${ctx.tAvgCheck})
- Ops Score: ${ctx.opsScore}/100 | Controls Score: ${ctx.ctrlScore}/100
- 2-Week Sales Trend: ${ctx.t2wTrend}% vs prior 2 weeks
- Weekly Sales Avg: $${ctx.t6wSales.toLocaleString()}

Based on this data, provide:
1. **Top 3 Priority Actions** — the highest-leverage improvements this store should make RIGHT NOW, with specific operational steps, not generic advice
2. **Key Correlation Finding** — identify any metric relationships that stand out (e.g., if OEPE is high AND TPPH is low, that suggests staffing not speed; if labor is over AND OT is high, that's a scheduling problem not a hiring problem)
3. **One Positive** — what is this store doing well that should be protected/replicated
4. **Risk Flag** — any metric combination that should prompt a personal visit or coaching conversation

Be specific, quantitative, and direct. This is for a district manager who knows their business.`;

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages',{method:'POST',
        headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
        body:JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:1200,
          messages:[{role:'user',content:prompt}]})});
      if(!res.ok){const e=await res.json().catch(()=>({}));throw new Error((e.error&&e.error.message)||'HTTP '+res.status);}
      const data = await res.json();
      const text = (data.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('\n\n');
      setInsights(text);
    } catch(e){ setError('AI call failed: '+e.message); }
    setLoading(false);
  };

  // Parse AI response into sections
  const sections = insights ? insights.split(/\n(?=\d+\.|\*\*[A-Z])/).filter(Boolean) : [];

  return div({style:{padding:2}},
    div({style:{display:'flex',alignItems:'center',gap:10,marginBottom:12}},
      div(null,
        div({style:{fontSize:'13px',fontWeight:700}},'💡 AI Performance Insights'),
        div({style:{fontSize:'10px',color:'var(--text3)',marginTop:2}},
          'Claude analyzes this store\'s metrics and returns prioritized, specific recommendations.')
      ),
      btn({className:'btn btn-a',style:{marginLeft:'auto',padding:'6px 16px'},
        onClick:generateInsights, disabled:loading||!apiKey},
        loading ? '⏳ Analyzing…' : insights ? '↻ Refresh' : '⚡ Generate Insights')
    ),

    !apiKey&&div({style:{background:'rgba(245,158,11,.08)',border:'.5px solid rgba(245,158,11,.3)',
      borderRadius:'var(--r)',padding:'10px 14px',fontSize:'10px',color:'#f59e0b',marginBottom:10}},
      '⚠ Add your Anthropic API key in Settings → AI & Integrations to enable this feature.'),

    error&&div({style:{background:'rgba(239,68,68,.08)',border:'.5px solid rgba(239,68,68,.3)',
      borderRadius:'var(--r)',padding:'10px 14px',fontSize:'10px',color:'#f87171',marginBottom:10}},error),

    !insights&&!loading&&!error&&div({style:{color:'var(--text3)',fontSize:'11px',textAlign:'center',padding:'32px 16px',
      border:'.5px dashed var(--bdr)',borderRadius:'var(--rl)',marginBottom:10}},
      '📊 Hit \"Generate Insights\" to have Claude review this store\'s metrics and surface the highest-leverage opportunities.'),

    loading&&div({style:{textAlign:'center',padding:32,color:'var(--text3)'}},
      div({style:{fontSize:'11px',marginBottom:8}},'🤖 Analyzing '+wb+'-week performance data…'),
      div({style:{fontSize:'10px'}},'Claude is reviewing OEPE, labor, controls, check avg, and trend data...')),

    insights&&div(null,
      sections.map((sec,i)=>{
        const isCrit = sec.includes('Risk Flag')||sec.includes('VISIT');
        const isPos  = sec.includes('Positive');
        const isCorr = sec.includes('Correlation');
        const col = isCrit?'rgba(239,68,68,.08)':isPos?'rgba(16,185,129,.08)':isCorr?'rgba(96,165,250,.08)':'var(--surf2)';
        const bdr = isCrit?'rgba(239,68,68,.3)':isPos?'rgba(16,185,129,.3)':isCorr?'rgba(96,165,250,.3)':'var(--bdr)';
        return div({key:i,style:{background:col,border:`.5px solid ${bdr}`,borderRadius:'var(--r)',
          padding:'10px 14px',marginBottom:8}},
          ...mdToNodes(sec.trim()));
      }),
      div({style:{fontSize:'9px',color:'var(--text3)',marginTop:8,textAlign:'right'}},
        'Generated by Claude · Based on last '+wb+' weeks of data · Reload or refresh to update')
    )
  );
}

// AI BACKTEST ANOMALY SCANNER

// ── Manual Event Entry Modal (Phase 1b) ────────────────────────────────────────
// Lets the user tag ANY date at ANY location — no scan required.
// Supports single dates and date ranges (tags each day individually with rangeId).

function importReview(file, onTagEvent, onDone) {
  const reader=new FileReader();
  reader.onload=e=>{
    try{
      const data=JSON.parse(e.target.result);
      const loc=data.loc;
      let count=0;
      (data.responses||[]).forEach(r=>{
        if(!r.type&&!r.note) return; // skip unreviewed
        const evType=r.type||'other';
        const et=EVENT_TYPES[evType]||EVENT_TYPES.other;
        const note=r.note||r.label||et.label;
        onTagEvent(loc,r.dk,note,evType,{tagLabel:r.label||et.label,source:'GM Review Import',tags:[{type:evType,...et}]});
        count++;
      });
      onDone&&onDone(count,data.storeName||loc);
    }catch(err){alert('Could not read review file: '+err.message);}
  };
  reader.readAsText(file);
}


// EVENT REGISTRY MODAL
// Shows ALL tagged events from userEvents — independent of scan results.
// Searchable, filterable, exportable as CSV.

// FOB ANALYSIS PANEL — Session 1
// Mirrors the QSRSoft FOB/Operations Report format.
// Data: ds.fobRows | Targets: DEFAULT_TARGETS[loc] per store
// Month-only selection (as per business requirement).
const FOB_COMP=[
  {key:'compWaste',  tgt:'tCompWaste',  label:'Completed Waste',     icon:'🗑', threshold:0.001,  lower:true},
  {key:'rawWaste',   tgt:'tRawWaste',   label:'Raw Waste',           icon:'🥩', threshold:0.001,  lower:true},
  {key:'condiment',  tgt:'tCondiment',  label:'Condiments',          icon:'🧂', threshold:0.001,  lower:true},
  {key:'empMeal',    tgt:'tEmpFood',    label:'Emp / Mgr Meals',     icon:'🍔', threshold:0.001,  lower:true},
  {key:'statVar',    tgt:'tStatLoss',   label:'Variance Stat',       icon:'📊', threshold:0.002,  lower:true},
  {key:'unexplained',tgt:'tUnex',       label:'Unexplained',         icon:'❓', threshold:0.0005, lower:true},
  {key:'fobPct',     tgt:'tFOBTarget',  label:'Food Over Base (FOB)',icon:'📈', threshold:0.003,  lower:true, sep:true},
  {key:'baseFoodPct',tgt:'tFOBBase',    label:'Base Food',           icon:'🥗', threshold:0.005,  lower:true},
  {key:'discCoupon', tgt:'tDiscCoupPct',label:'Discounts / Coupons', icon:'🎫', threshold:0.003,  lower:false, note:'Lower is favorable — means more discount activity vs. sales'},
  {key:'pLFoodPct',  tgt:'tFOBTotal',   label:'Total Food Cost',     icon:'💰', threshold:0.005,  lower:true, isTotal:true},
];

function computeFOBMetrics(fobRows, allTargets, selLoc, selMonth){
  const rows=(fobRows||[]).filter(r=>{
    if(r.sales<=0) return false;
    if(selLoc!=='all'&&r.loc!==selLoc) return false;
    if(selMonth&&r.date){const ym=r.date.toISOString().slice(0,7);if(ym!==selMonth)return false;}
    return true;
  });
  if(!rows.length) return null;
  const totalSales=rows.reduce((a,r)=>a+r.sales,0);
  const locTotals={}; // for per-location breakdown
  rows.forEach(r=>{if(!locTotals[r.loc])locTotals[r.loc]={sales:0,rows:[]};locTotals[r.loc].sales+=r.sales;locTotals[r.loc].rows.push(r);});
  // Get district-level weighted targets
  const tgtLocs=selLoc!=='all'?[selLoc]:Object.keys(locTotals);
  const result={totalSales,rowCount:rows.length,locCount:Object.keys(locTotals).length};
  FOB_COMP.forEach(c=>{
    // Weighted actual
    const wPct=totalSales>0?rows.reduce((a,r)=>a+(r[c.key]||0)*r.sales,0)/totalSales:0;
    // Weighted target (use store-specific targets weighted by sales)
    const wTgt=totalSales>0?tgtLocs.reduce((a,loc)=>{
      const s=locTotals[loc]?.sales||0;
      const t=(allTargets&&allTargets[loc]&&allTargets[loc][c.tgt])||0;
      return a+t*s;
    },0)/totalSales:0;
    const diffPct=wPct-wTgt; // positive = over target (unfavorable for cost metrics)
    const diffDollar=diffPct*totalSales;
    // Per-location breakdown
    const locBreakdown=Object.entries(locTotals).map(([loc,d])=>{
      const lPct=d.sales>0?d.rows.reduce((a,r)=>a+(r[c.key]||0)*r.sales,0)/d.sales:0;
      const lTgt=(allTargets&&allTargets[loc]&&allTargets[loc][c.tgt])||wTgt;
      return{loc,pct:lPct,tgt:lTgt,diff:lPct-lTgt,dollar:(lPct-lTgt)*d.sales,sales:d.sales};
    }).sort((a,b)=>Math.abs(b.diff)-Math.abs(a.diff)); // sorted by biggest variance
    result[c.key]={actual:wPct,target:wTgt,diffPct,diffDollar,actualDollar:wPct*totalSales,locBreakdown};
  });
  return result;
}

// LABOR ANALYTICS DASHBOARD  (v163)
// Period-selectable labor intelligence: Labor%, TPPH, OT, Act vs Need, AROP
// Tabs: Overview | Rankings | Day of Week | 6-Week Trend
// Data: ds.laborRows + ds.ctrlRows  ·  Targets: DEFAULT_TARGETS per store
// OPERATOR PERFORMANCE SUMMARY  (v169)
// Groups stores by operator (INV_ORG_COORDS.op) and shows aggregated
// sales, labor, service, and controls metrics with store drill-down.
// COMPREHENSIVE BACKTEST ENGINE  (v179 — Build 3)
// Runs all 3 models (LY Adj, DI, Default Trend) against all loaded
// historical actuals for every store. Computes MAPE per model per
// standard period. Identifies best model by period. Shows goal-seek
// improvement if different DI params had been used.
// STORE KNOWLEDGE BASE EDITOR  (v181)
// Lets the user view and edit operational notes + tags per location.
// Edits are persisted to localStorage and merged over the STORE_KB
// constant at runtime via getKB(loc). Used by: Ops Analysis, Anomaly
// Scanner, Pre-Forecast Brief, Backtest interpretation, DI warnings.
// METRIC CORRELATION EXPLORER  (v183 — New Tools)
// For each store: Pearson correlation between operational metrics and
// sales/GC outcomes. Shows which levers most drive results.
// Computed from all available ctrlRows + laborRows + opsRows.
function MetricCorrelationExplorer({stores, ds, settings, onClose}) {
  const {useState:uSt, useMemo:uM} = React;
  const LOCS = Object.keys(STORE_NAMES).sort((a,b)=>STORE_NAMES[a].localeCompare(STORE_NAMES[b]));
  const [selLoc, setSelLoc] = uSt(LOCS[0]);
  const [target, setTarget] = uSt('sales');

  const TARGETS = [
    {id:'sales',  l:'Daily Sales ($)', fn:r=>r.sales},
    {id:'gc',     l:'Guest Count',     fn:r=>r.gc||0},
    {id:'avgChk', l:'Avg Check',       fn:r=>r.avgCheck||0},
  ];

  const PREDICTORS = [
    {id:'oepe',      l:'OEPE (speed)',       src:'ops', fn:r=>r.oepe,        lowerGoodForSales:true,  note:'Lower OEPE = faster service → more throughput → potential GC/sales lift'},
    {id:'park',      l:'Park Rate %',        src:'ops', fn:r=>r.park,        lowerGoodForSales:false, note:'High park rate may inflate OEPE — review with actual GC context'},
    {id:'r2p',       l:'R2P Time',           src:'ops', fn:r=>r.r2p,         lowerGoodForSales:true,  note:'Faster R2P = better food safety; corr with sales usually minor'},
    {id:'labor',     l:'Labor %',            src:'labor',fn:r=>r.laborPct,   lowerGoodForSales:false, note:'Lower labor % can help profit but too low may hurt service quality'},
    {id:'tpph',      l:'TPPH',              src:'labor',fn:r=>r.tpph,        lowerGoodForSales:false, note:'Higher TPPH = more productive scheduling; may correlate with GC'},
    {id:'otHrs',     l:'OT Hours',           src:'labor',fn:r=>r.otHrs,      lowerGoodForSales:false, note:'High OT often signals staffing stress — may impact service quality'},
    {id:'cashOS',    l:'Cash O/S %',         src:'ctrl', fn:r=>r.cashOSPct,  lowerGoodForSales:false, note:'Cash variance is a controls signal; may correlate with traffic days'},
    {id:'tRedA',     l:'T-Red After %',      src:'ctrl', fn:r=>r.tRedAPct,   lowerGoodForSales:false, note:'High voids may indicate order accuracy issues or staff inexperience'},
    {id:'discPct',   l:'Discount %',         src:'ctrl', fn:r=>r.discPct,    lowerGoodForSales:false, note:'Higher discount rate may lift GC but compress average check'},
    {id:'fobPct',    l:'FOB %',              src:'ctrl', fn:r=>r.fobPct,     lowerGoodForSales:false, note:'Food cost % — negatively correlated with profit margin'},
  ];

  // Pearson correlation: r = Σ(xi-x̄)(yi-ȳ) / sqrt(Σ(xi-x̄)² · Σ(yi-ȳ)²)
  const pearson = (xs, ys) => {
    if(xs.length < 10) return null;
    const mx = xs.reduce((a,b)=>a+b)/xs.length;
    const my = ys.reduce((a,b)=>a+b)/ys.length;
    let num=0, dxa=0, dya=0;
    for(let i=0;i<xs.length;i++){const dx=xs[i]-mx,dy=ys[i]-my;num+=dx*dy;dxa+=dx*dx;dya+=dy*dy;}
    const denom = Math.sqrt(dxa*dya);
    return denom===0?null:num/denom;
  };

  const correlations = uM(()=>{
    const lR=(ds.laborRows||[]).filter(r=>String(r.loc)===selLoc&&r.sales>0);
    const oR=(ds.opsRows||[]).filter(r=>String(r.loc)===selLoc);
    const cR=(ds.ctrlRows||[]).filter(r=>String(r.loc)===selLoc);
    // Build a joined dataset keyed by date
    const byDate = {};
    const dk = d => dKey(d);
    lR.forEach(r=>{byDate[dk(r.date)]={...byDate[dk(r.date)],...r};});
    oR.forEach(r=>{byDate[dk(r.date)]={...byDate[dk(r.date)],...r};});
    cR.forEach(r=>{byDate[dk(r.date)]={...byDate[dk(r.date)],...r};});
    const joined = Object.values(byDate).filter(r=>r.sales>0);

    const tFn = TARGETS.find(t2=>t2.id===target)?.fn || (r=>r.sales);
    const ys = joined.map(tFn).filter(v=>v>0);
    if(ys.length < 10) return [];

    return PREDICTORS.map(p=>{
      const paired = joined.map(r=>({x:p.fn(r), y:tFn(r)}))
        .filter(({x,y})=>x!=null&&x>0&&y>0&&!isNaN(x)&&!isNaN(y));
      const r = pearson(paired.map(p=>p.x), paired.map(p=>p.y));
      const n = paired.length;
      // Significance: t = r*sqrt(n-2)/sqrt(1-r²); p<.05 if |t|>1.96 for n>30
      const t = r!=null&&n>2 ? Math.abs(r)*Math.sqrt(n-2)/Math.sqrt(1-r*r) : null;
      const sig = t!=null&&n>=10 ? (t>2.6?'strong':t>1.96?'sig':'weak') : null;
      return { ...p, r, n, sig, paired };
    }).filter(p=>p.r!=null).sort((a,b)=>Math.abs(b.r)-Math.abs(a.r));
  },[ds,selLoc,target]);

  const kbEntry = uM(()=>getKB(selLoc),[selLoc]);

  const corrBar = r => {
    const pct = Math.abs(r)*100;
    const col  = r>0 ? '#34d399' : '#f87171';
    return div({style:{display:'flex',alignItems:'center',gap:6,flex:1}},
      r<0&&div({style:{flex:1}}),
      div({style:{width:pct+'%',minWidth:2,height:8,background:col,borderRadius:4,
        [r>0?'marginLeft':'marginRight']:'auto'}}),
      r>0&&div({style:{flex:1}})
    );
  };

  const sigBadge = sig => sig==='strong'?span({style:{fontSize:'7px',padding:'1px 5px',
    borderRadius:99,background:'rgba(52,211,153,.15)',color:'#34d399',fontWeight:700}},'●● Strong'):
    sig==='sig'?span({style:{fontSize:'7px',padding:'1px 5px',borderRadius:99,
    background:'rgba(245,158,11,.15)',color:'#f59e0b'}}):'';

  return div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.82)',zIndex:456,
    display:'flex',alignItems:'flex-start',justifyContent:'center',padding:20,paddingTop:24}},
    div({style:{background:'var(--surf)',border:'.5px solid var(--bdr2)',borderRadius:'var(--rl)',
      width:'100%',maxWidth:900,maxHeight:'90vh',display:'flex',flexDirection:'column',
      boxShadow:'0 20px 60px rgba(0,0,0,.5)',overflow:'hidden'}},
      // Header
      div({style:{padding:'10px 16px',borderBottom:'.5px solid var(--bdr)',flexShrink:0,
        background:'var(--surf2)',display:'flex',alignItems:'center',gap:10}},
        span({style:{fontSize:'18px'}},'🔗'),
        div({style:{flex:1}},
          div({style:{fontSize:'13px',fontWeight:800,color:'var(--text)'}},'Metric Correlation Explorer'),
          div({style:{fontSize:'9px',color:'var(--text3)',marginTop:1}},
            'Pearson correlation between operational metrics and sales/GC outcomes. Identifies which levers most drive results at each location.')
        ),
        h('select',{value:selLoc,onChange:e=>setSelLoc(e.target.value),
          style:{background:'var(--surf)',border:'.5px solid var(--bdr)',borderRadius:'var(--r)',
            color:'var(--text)',fontSize:'9px',padding:'3px 6px'}},
          LOCS.map(l=>h('option',{key:l,value:l},sNameC(l)))
        ),
        btn({className:'btn btn-sm',style:{color:'var(--text3)'},onClick:onClose},'✕')
      ),
      // Target selector
      div({style:{padding:'7px 16px',borderBottom:'.5px solid var(--bdr)',flexShrink:0,
        display:'flex',gap:6,alignItems:'center',background:'var(--surf2)'}},
        span({style:{fontSize:'8.5px',color:'var(--text3)'}},'Outcome to explain:'),
        ...TARGETS.map(t=>btn({key:t.id,className:'btn btn-sm',
          style:{fontSize:'8.5px',
            background:target===t.id?'var(--adim)':'transparent',
            color:target===t.id?'var(--amber)':'var(--text3)',
            borderColor:target===t.id?'rgba(245,158,11,.4)':'var(--bdr)'},
          onClick:()=>setTarget(t.id)},t.l)),
        div({style:{marginLeft:'auto',fontSize:'7.5px',color:'var(--text3)',fontStyle:'italic'}},
          'Range: -1 (strong negative) to +1 (strong positive) · n = matched trading days')
      ),
      // KB note
      kbEntry.notes&&div({style:{padding:'5px 16px',borderBottom:'.5px solid var(--bdr)',flexShrink:0,
        background:'rgba(96,165,250,.05)',fontSize:'8px',color:'#93c5fd'}},
        '📍 '+kbEntry.notes.slice(0,140)+(kbEntry.notes.length>140?'…':'')),
      // Results
      div({style:{flex:1,overflowY:'auto',padding:'8px 0'}},
        correlations.length===0?
          div({style:{color:'var(--text3)',textAlign:'center',padding:40,fontSize:'11px'}},
            'Load an Operations Report for ',sNameC(selLoc),' to compute correlations. Need 10+ trading days.') :
        div(null,
          // Scale legend
          div({style:{display:'flex',justifyContent:'space-between',padding:'0 16px',marginBottom:4,fontSize:'7.5px',color:'var(--text3)'}},
            span('← Negative correlation (metric ↑ → outcome ↓)'),
            span('Positive correlation (metric ↑ → outcome ↑) →')
          ),
          // Column headers
          h('table',{style:{width:'100%',borderCollapse:'collapse',fontSize:'9px'}},
            h('thead',null,h('tr',{style:{borderBottom:'.5px solid var(--bdr)'}},
              ...['Metric','n','r','Strength','← neg  correlation  pos →','What This Means']
               .map((l,i)=>h('th',{key:i,style:{padding:'4px 8px',fontSize:'7.5px',fontWeight:700,
                 textTransform:'uppercase',letterSpacing:'.4px',color:'var(--text3)',
                 textAlign:i<=3?'left':'center'}},(l)))
            )),
            h('tbody',null,...correlations.map((c,i)=>{
              const strength = Math.abs(c.r);
              const col = c.r>0 ? '#34d399' : '#f87171';
              const strLabel = strength>.7?'Very Strong':strength>.4?'Moderate':strength>.2?'Weak':'Negligible';
              return h('tr',{key:c.id,style:{borderBottom:'.5px solid rgba(255,255,255,.04)',
                background:i%2?'rgba(255,255,255,.015)':'transparent'}},
                h('td',{style:{padding:'6px 8px',fontWeight:600,color:'var(--text2)',whiteSpace:'nowrap'}},c.l),
                h('td',{style:{padding:'6px 8px',color:'var(--text3)',fontFamily:'var(--mono)',fontSize:'8px'}},c.n),
                h('td',{style:{padding:'6px 8px',fontFamily:'var(--mono)',fontWeight:700,
                  color:col,fontSize:'10px'}},(c.r>0?'+':'')+c.r.toFixed(3)),
                h('td',{style:{padding:'6px 8px',fontSize:'8px'}},
                  span({style:{padding:'2px 6px',borderRadius:99,
                    background:strength>.4?'rgba(52,211,153,.1)':strength>.2?'rgba(245,158,11,.1)':'rgba(255,255,255,.05)',
                    color:strength>.4?'#34d399':strength>.2?'#f59e0b':'var(--text3)'}},
                    (strength>.4?'◆ ':'◇ ')+strLabel)),
                h('td',{style:{padding:'6px 8px',width:200}},
                  div({style:{position:'relative',height:16,display:'flex',alignItems:'center'}},
                    div({style:{position:'absolute',left:'50%',top:0,bottom:0,width:.5,background:'rgba(255,255,255,.15)'}}),
                    div({style:{
                      position:'absolute',
                      [c.r>0?'left':'right']:'50%',
                      width:(Math.min(Math.abs(c.r),.999)*48)+'%',
                      height:8,background:col,borderRadius:c.r>0?'0 4px 4px 0':'4px 0 0 4px',
                      top:4,opacity:.85}})
                  )
                ),
                h('td',{style:{padding:'6px 8px',fontSize:'8px',color:'var(--text3)',lineHeight:1.5,maxWidth:280}},c.note)
              );
            }))
          ),
          // Interpretation guidance
          div({style:{margin:'8px 16px',padding:'8px 12px',background:'rgba(255,255,255,.03)',
            borderRadius:'var(--r)',border:'.5px solid var(--bdr)',fontSize:'8px',color:'var(--text3)',lineHeight:1.7}},
            span({style:{fontWeight:700,color:'var(--text)'}},'Interpreting correlations: '),
            '|r| > 0.7 = very strong · 0.4–0.7 = moderate · 0.2–0.4 = weak · < 0.2 = negligible. ',
            'Correlation ≠ causation. A strong negative OEPE correlation means faster service tends to occur on higher-sales days — ',
            span({style:{fontStyle:'italic'}},'not necessarily that slowing OEPE causes more sales.'),
            ' Use alongside the Performance Calculator to model directional impact. ',
            'n = trading days with complete data for both variables.')
        )
      )
    )
  );
}

// MODEL ASSIGNMENT PANEL  (v184)
// Per-store per-horizon model recommendations from backtest.
// Shows winning MAPE + competing MAPEs as supporting evidence.
// User can override any assignment per store per horizon.
// STORE ONE-PAGER GENERATOR  (v185)
// Generates a professional, print-ready one-page store brief.
// Opens in a new browser window/tab — print to PDF via browser.
// Data: last 4W actuals vs targets, DOW pattern, model assignment,
// top observations, KB context.
function StoreOnePager({stores, ds, settings, onClose}) {
  const [selLoc,   setSelLoc]   = React.useState(
    Object.keys(STORE_NAMES).sort((a,b)=>STORE_NAMES[a].localeCompare(STORE_NAMES[b]))[0]
  );
  const [period,   setPeriod]   = React.useState('4wk');
  const [preview,  setPreview]  = React.useState(false);

  const PERIODS = [{id:'2wk',l:'Last 2 Weeks'},{id:'4wk',l:'Last 4 Weeks'},
                   {id:'6wk',l:'Last 6 Weeks'},{id:'mtd',l:'Month to Date'}];

  const periodDays = {twk:14,'2wk':14,'4wk':28,'6wk':42,'mtd':null};

  const data = React.useMemo(()=>{
    const cutoff = period==='mtd'
      ? new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      : addDR(new Date(), -(periodDays[period]||28));
    const lR = (ds.laborRows||[]).filter(r=>String(r.loc)===selLoc&&r.date>=cutoff&&r.sales>0);
    const oR = (ds.opsRows||[]).filter(r=>String(r.loc)===selLoc&&r.date>=cutoff);
    const cR = (ds.ctrlRows||[]).filter(r=>String(r.loc)===selLoc&&r.date>=cutoff);
    const lyR= (ds.laborRows||[]).filter(r=>{
      const ly=new Date(r.date); ly.setFullYear(ly.getFullYear()-1);
      return String(r.loc)===selLoc&&r.date>=addDR(cutoff,-364)&&r.date<addDR(new Date(),-364)&&r.sales>0;
    });

    const avg=(arr,f)=>{const v=arr.map(r=>r[f]).filter(v=>v!=null&&v>0);return v.length?v.reduce((a,b)=>a+b)/v.length:null;};
    const sum=(arr,f)=>arr.reduce((a,r)=>a+(r[f]||0),0);
    const n=lR.length||1;

    // DOW breakdown
    const byDOW=[0,1,2,3,4,5,6].map(d=>{
      const rows=lR.filter(r=>r.date.getDay()===d);
      return{day:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d],
        sales:rows.length?sum(rows,'sales')/rows.length:null,
        gc:rows.length?sum(rows,'gc')/rows.length:null,n:rows.length};
    }).filter(d=>d.n>0);

    // LY comparison
    const lyAvgSales = lyR.length ? sum(lyR,'sales')/lyR.length : null;
    const curAvgSales = avg(lR,'sales');
    const vsLY = curAvgSales&&lyAvgSales ? (curAvgSales-lyAvgSales)/lyAvgSales : null;

    const tgt = DEFAULT_TARGETS[selLoc]||{};
    const kb  = getKB(selLoc);
    const assign = DEFAULT_MODEL_ASSIGNMENTS[selLoc]||{};
    const org = INV_ORG_COORDS&&INV_ORG_COORDS[selLoc];

    // Auto-observations
    const obs = [];
    const laborPct=avg(cR,'laborPct')||avg(lR,'laborPct');
    const tpph=avg(cR,'tpph')||avg(lR,'tpph');
    const oepe=avg(oR,'oepe');
    const fob=avg(cR,'fobPct');
    if(vsLY!=null){obs.push(vsLY>=0
      ?`Sales trending ${(vsLY*100).toFixed(1)}% above last year — positive trajectory`
      :`Sales ${Math.abs(vsLY*100).toFixed(1)}% below last year — review traffic patterns`);}
    if(tgt.tOepe&&oepe){const gap=oepe-tgt.tOepe;obs.push(gap>15
      ?`OEPE averaging ${Math.round(oepe)}s — ${Math.round(gap)}s above ${tgt.tOepe}s target; throughput opportunity`
      :`OEPE at ${Math.round(oepe)}s — within ${Math.abs(Math.round(gap))}s of ${tgt.tOepe}s target`);}
    if(tgt.tLabor&&laborPct){const gap=(laborPct-tgt.tLabor)*100;obs.push(Math.abs(gap)<1
      ?`Labor % on target at ${(laborPct*100).toFixed(1)}%`
      :gap>0?`Labor ${gap.toFixed(1)}pp above target — scheduling review recommended`:`Labor ${Math.abs(gap).toFixed(1)}pp below target`);}
    if(byDOW.length>0){const best=byDOW.reduce((a,b)=>((b.sales||0)>(a.sales||0)?b:a));
      const worst=byDOW.reduce((a,b)=>((b.sales||0)<(a.sales||0)?b:a));
      obs.push(`Strongest day: ${best.day} (avg $${Math.round(best.sales||0).toLocaleString()}) — consider additional staffing`);}
    if(fob&&tgt.tFOBBase){const gap=(fob-tgt.tFOBBase)*100;obs.push(gap>0.5
      ?`FOB ${(fob*100).toFixed(1)}% — ${gap.toFixed(1)}pp above ${(tgt.tFOBBase*100).toFixed(1)}% target`
      :`FOB on track at ${(fob*100).toFixed(1)}%`);}

    return {lR,oR,cR,n,tgt,kb,assign,org,byDOW,vsLY,lyAvgSales,
      sales:curAvgSales,gc:avg(lR,'gc'),check:avg(lR,'avgCheck'),
      laborPct,tpph,oepe,park:avg(oR,'park'),fob,obs:obs.slice(0,5)};
  },[selLoc,period,ds,settings]);

  const generateAndPrint = () => {
    const d=data;
    const fmt$=v=>v?'$'+Math.round(v).toLocaleString():'—';
    const fmtP=v=>v!=null?(v*100).toFixed(1)+'%':'—';
    const fmtN=v=>v!=null?v.toFixed(1):'—';
    const tgt=d.tgt;
    const store=STORE_NAMES[selLoc]||selLoc;
    const org=d.org;
    const assign=d.assign;
    const now=new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});
    const pLabel=PERIODS.find(p=>p.id===period)?.l||period;

    const kpiRow=(label,val,target,fmt,lowerBetter)=>{
      const tgtStr=target?fmt(target):'—';
      let status='', statusColor='#6b7280';
      if(val!=null&&target!=null){
        const gap=lowerBetter?(val-target)/target:(target-val)/target;
        if(gap<=0.05){status='✓ On Target';statusColor='#059669';}
        else if(gap<=0.15){status='⚠ Watch';statusColor='#d97706';}
        else{status='✗ Off Track';statusColor='#dc2626';}
      }
      return `<tr>
        <td style="padding:8px 12px;font-weight:600;color:#111;border-bottom:1px solid #f3f4f6">${label}</td>
        <td style="padding:8px 12px;font-family:monospace;font-size:15px;font-weight:700;color:#111;border-bottom:1px solid #f3f4f6">${val!=null?fmt(val):'—'}</td>
        <td style="padding:8px 12px;color:#6b7280;border-bottom:1px solid #f3f4f6">${tgtStr}</td>
        <td style="padding:8px 12px;font-weight:600;color:${statusColor};border-bottom:1px solid #f3f4f6">${status}</td>
      </tr>`;
    };

    const dowRows=d.byDOW.map(d=>{
      const maxS=Math.max(...data.byDOW.map(r=>r.sales||0));
      const pct=maxS>0?((d.sales||0)/maxS*100):0;
      const isMax=d.sales===maxS;
      return `<tr style="background:${isMax?'#ecfdf5':'white'}">
        <td style="padding:6px 12px;font-weight:${isMax?'700':'400'};color:${isMax?'#059669':'#374151'}">${d.day}</td>
        <td style="padding:6px 12px;font-family:monospace;color:#111">${d.sales?'$'+Math.round(d.sales).toLocaleString():'—'}</td>
        <td style="padding:6px 12px;color:#6b7280">${d.gc?Math.round(d.gc):'—'}</td>
        <td style="padding:6px 12px"><div style="width:${pct.toFixed(0)}%;height:10px;background:${isMax?'#059669':'#d1fae5'};border-radius:3px"></div></td>
        <td style="padding:6px 12px;color:#6b7280">${d.n}d</td>
      </tr>`;
    }).join('');

    const modelRow=(hz,icon,label)=>{
      const a=(assign[hz]||{});
      const m=a.model||'dow';
      const mc=m==='di'?'#d97706':m==='ly'?'#2563eb':'#7c3aed';
      const ml={di:'Dialed-In',ly:'LY Adjusted',dow:'DOW Trend'};
      return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #f3f4f6">
        <span style="width:80px;font-size:12px;color:#6b7280">${icon} ${label}</span>
        <span style="background:${mc}22;color:${mc};padding:2px 10px;border-radius:99px;font-weight:700;font-size:12px">${ml[m]}</span>
        ${a.mape?`<span style="font-family:monospace;font-size:12px;color:#374151">${a.mape.toFixed(1)}% MAPE</span>`:''}
        ${a.ref?`<span style="font-size:11px;color:#9ca3af;margin-left:4px">${a.ref.slice(0,50)}</span>`:''}
      </div>`;
    };

    const html=`<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Store One-Pager — ${store}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&family=JetBrains+Mono:wght@400;700&display=swap');
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Inter',sans-serif;background:#f8fafc;color:#111;font-size:13px}
  @media print{
    body{background:white}
    .no-print{display:none!important}
    .page{box-shadow:none!important;margin:0!important;border-radius:0!important;max-width:100%!important}
  }
</style>
</head><body>
<div class="no-print" style="background:#1e293b;padding:12px 24px;display:flex;align-items:center;gap:12px">
  <span style="color:#f59e0b;font-weight:800;font-size:16px">Meridian</span>
  <span style="color:#94a3b8;font-size:13px">Store One-Pager — ${store}</span>
  <button onclick="window.print()" style="margin-left:auto;background:#f59e0b;border:none;color:#000;padding:7px 20px;border-radius:6px;font-weight:700;cursor:pointer;font-size:13px">🖨 Print / Save as PDF</button>
  <button onclick="window.close()" style="background:transparent;border:1px solid #475569;color:#94a3b8;padding:7px 14px;border-radius:6px;cursor:pointer">Close</button>
</div>
<div class="page" style="max-width:900px;margin:24px auto;background:white;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,.10);overflow:hidden">
  <!-- Header -->
  <div style="background:linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%);padding:28px 32px;color:white">
    <div style="display:flex;justify-content:space-between;align-items:flex-start">
      <div>
        <div style="font-size:11px;letter-spacing:.08em;color:#94a3b8;text-transform:uppercase;margin-bottom:6px">Store Performance Brief</div>
        <div style="font-size:28px;font-weight:900;letter-spacing:-.5px">${store}</div>
        <div style="margin-top:8px;display:flex;gap:16px;flex-wrap:wrap">
          <span style="font-size:12px;color:#94a3b8">Store #${selLoc}</span>
          ${org?`<span style="font-size:12px;color:#94a3b8">Operator: ${org.op||'—'}</span>`:''}
          ${org?`<span style="font-size:12px;color:#94a3b8">Supervisor: ${org.sup||'—'}</span>`:''}
          <span style="font-size:12px;color:#94a3b8">${org&&org.state==='FL'?'Emerald Arches (FL)':'MCDOK (OK)'}</span>
        </div>
      </div>
      <div style="text-align:right">
        <div style="font-size:11px;color:#94a3b8">Period</div>
        <div style="font-size:16px;font-weight:700;color:#f59e0b">${pLabel}</div>
        <div style="font-size:11px;color:#94a3b8;margin-top:4px">Generated ${now}</div>
        <div style="font-size:11px;color:#64748b;margin-top:2px">CONFIDENTIAL</div>
      </div>
    </div>
    <!-- LY comparison banner -->
    ${d.vsLY!=null?`<div style="margin-top:16px;padding:10px 16px;background:${d.vsLY>=0?'rgba(5,150,105,.2)':'rgba(220,38,38,.2)'};border-radius:8px;display:inline-block">
      <span style="font-size:13px;font-weight:700;color:${d.vsLY>=0?'#34d399':'#f87171'}">
        ${d.vsLY>=0?'↑':'↓'} ${Math.abs(d.vsLY*100).toFixed(1)}% vs Prior Year
      </span>
      <span style="font-size:12px;color:#94a3b8;margin-left:8px">Avg daily: ${fmt$(d.sales)} vs LY ${fmt$(d.lyAvgSales)}</span>
    </div>`:''}
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:0">
    <!-- KPI Table -->
    <div style="padding:24px 32px;border-right:1px solid #f1f5f9">
      <div style="font-size:11px;font-weight:700;letter-spacing:.08em;color:#6b7280;text-transform:uppercase;margin-bottom:12px">Key Performance Indicators</div>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr>
          <th style="padding:6px 12px;text-align:left;font-size:11px;color:#9ca3af;font-weight:600;border-bottom:2px solid #e5e7eb">Metric</th>
          <th style="padding:6px 12px;text-align:left;font-size:11px;color:#9ca3af;font-weight:600;border-bottom:2px solid #e5e7eb">Actual</th>
          <th style="padding:6px 12px;text-align:left;font-size:11px;color:#9ca3af;font-weight:600;border-bottom:2px solid #e5e7eb">Target</th>
          <th style="padding:6px 12px;text-align:left;font-size:11px;color:#9ca3af;font-weight:600;border-bottom:2px solid #e5e7eb">Status</th>
        </tr></thead>
        <tbody>
          ${kpiRow('Daily Sales ($)',d.sales,null,fmt$,false)}
          ${kpiRow('Guest Count',d.gc,null,v=>''+Math.round(v),false)}
          ${kpiRow('Avg Check',d.check,null,v=>'$'+v.toFixed(2),false)}
          ${kpiRow('Labor %',d.laborPct,tgt.tLabor,fmtP,true)}
          ${kpiRow('TPPH',d.tpph,tgt.tTpph,fmtN,false)}
          ${kpiRow('OEPE (seconds)',d.oepe,tgt.tOepe,v=>Math.round(v)+'s',true)}
          ${kpiRow('Park %',d.park,tgt.tPark,fmtP,true)}
          ${kpiRow('FOB %',d.fob,tgt.tFOBBase,fmtP,true)}
        </tbody>
      </table>
    </div>

    <!-- DOW + Model -->
    <div style="padding:24px 32px">
      <div style="font-size:11px;font-weight:700;letter-spacing:.08em;color:#6b7280;text-transform:uppercase;margin-bottom:12px">Day of Week Pattern</div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
        <thead><tr>
          <th style="padding:4px 12px;text-align:left;font-size:11px;color:#9ca3af;font-weight:600;border-bottom:2px solid #e5e7eb">Day</th>
          <th style="padding:4px 12px;text-align:left;font-size:11px;color:#9ca3af;font-weight:600;border-bottom:2px solid #e5e7eb">Avg Sales</th>
          <th style="padding:4px 12px;text-align:left;font-size:11px;color:#9ca3af;font-weight:600;border-bottom:2px solid #e5e7eb">Avg GC</th>
          <th style="padding:4px 12px;text-align:left;font-size:11px;color:#9ca3af;font-weight:600;border-bottom:2px solid #e5e7eb">Relative</th>
          <th style="padding:4px 12px;text-align:left;font-size:11px;color:#9ca3af;font-weight:600;border-bottom:2px solid #e5e7eb">n</th>
        </tr></thead>
        <tbody>${dowRows}</tbody>
      </table>
      <div style="font-size:11px;font-weight:700;letter-spacing:.08em;color:#6b7280;text-transform:uppercase;margin-bottom:8px">Forecast Model Assignments</div>
      ${modelRow('weekly','📅','Weekly')}${modelRow('monthly','🗓','Monthly')}${modelRow('yearly','📆','Yearly')}
    </div>
  </div>

  <!-- Observations -->
  <div style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e5e7eb">
    <div style="font-size:11px;font-weight:700;letter-spacing:.08em;color:#6b7280;text-transform:uppercase;margin-bottom:12px">Key Observations</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      ${d.obs.map(o=>`<div style="display:flex;gap:8px;align-items:flex-start;padding:8px 12px;background:white;border-radius:6px;border:1px solid #e5e7eb">
        <span style="color:#f59e0b;flex-shrink:0;margin-top:1px">◆</span>
        <span style="font-size:12px;color:#374151;line-height:1.5">${o}</span>
      </div>`).join('')}
    </div>
  </div>

  <!-- Context -->
  ${d.kb&&d.kb.notes?`<div style="padding:16px 32px;border-top:1px solid #e5e7eb">
    <div style="font-size:11px;font-weight:700;letter-spacing:.08em;color:#6b7280;text-transform:uppercase;margin-bottom:6px">Store Context</div>
    <div style="font-size:12px;color:#6b7280;line-height:1.6">${d.kb.notes}</div>
    ${d.kb.tags&&d.kb.tags.length?`<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">${d.kb.tags.map(t=>`<span style="font-size:11px;padding:2px 8px;border-radius:99px;background:#f1f5f9;color:#64748b">${t}</span>`).join('')}</div>`:''}
  </div>`:''}

  <!-- Footer -->
  <div style="padding:12px 32px;background:#0f172a;display:flex;justify-content:space-between;align-items:center">
    <span style="color:#f59e0b;font-weight:800;font-size:14px">Meridian</span>
    <span style="color:#475569;font-size:11px">QSR Forecasting & Analytics · Generated ${now} · CONFIDENTIAL</span>
  </div>
</div>
</body></html>`;

    const w = window.open('','_blank','width=960,height=800,scrollbars=yes');
    if(w){ w.document.write(html); w.document.close(); }
    else { alert('Allow pop-ups for this page to open the one-pager. Then try again.'); }
  };

  const LOCS = Object.keys(STORE_NAMES).sort((a,b)=>STORE_NAMES[a].localeCompare(STORE_NAMES[b]));

  return div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.82)',zIndex:460,
    display:'flex',alignItems:'center',justifyContent:'center',padding:24}},
    div({style:{background:'var(--surf)',border:'.5px solid var(--bdr2)',borderRadius:'var(--rl)',
      width:'100%',maxWidth:640,display:'flex',flexDirection:'column',
      boxShadow:'0 20px 60px rgba(0,0,0,.5)',overflow:'hidden'}},
      div({style:{padding:'12px 16px',borderBottom:'.5px solid var(--bdr)',background:'var(--surf2)',
        display:'flex',alignItems:'center',gap:10}},
        span({style:{fontSize:'18px'}},'📄'),
        div({style:{flex:1}},
          div({style:{fontSize:'13px',fontWeight:800,color:'var(--text)'}},'Store One-Pager Generator'),
          div({style:{fontSize:'9px',color:'var(--text3)'}},'Professional print-ready brief — opens in new tab, save as PDF via browser print')
        ),
        btn({className:'btn btn-sm',style:{color:'var(--text3)'},onClick:onClose},'✕')
      ),
      div({style:{padding:'20px 24px',display:'flex',flexDirection:'column',gap:14}},
        div(null,
          div({style:{fontSize:'9px',fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.4px',marginBottom:5}},'Select Store'),
          h('select',{value:selLoc,onChange:e=>setSelLoc(e.target.value),
            style:{width:'100%',background:'var(--surf)',border:'.5px solid var(--bdr)',borderRadius:'var(--r)',
              color:'var(--text)',fontSize:'11px',padding:'6px 10px'}},
            LOCS.map(l=>h('option',{key:l,value:l},sName(l)))
          )
        ),
        div(null,
          div({style:{fontSize:'9px',fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.4px',marginBottom:5}},'Report Period'),
          div({style:{display:'flex',gap:6}},
            PERIODS.map(p=>btn({key:p.id,className:'btn btn-sm',
              style:{fontSize:'9px',background:period===p.id?'var(--adim)':'transparent',
                color:period===p.id?'var(--amber)':'var(--text3)',
                borderColor:period===p.id?'rgba(245,158,11,.4)':'var(--bdr)'},
              onClick:()=>setPeriod(p.id)},p.l))
          )
        ),
        // Summary preview
        data.sales&&div({style:{padding:'12px',background:'rgba(245,158,11,.06)',
          borderRadius:'var(--r)',border:'.5px solid rgba(245,158,11,.2)',fontSize:'9px',color:'var(--text3)'}},
          `Preview: ${STORE_NAMES[selLoc]} · Avg daily sales ${data.sales?'$'+Math.round(data.sales).toLocaleString():'—'} · `,
          data.n+' days of data · ',
          (data.vsLY!=null?`${data.vsLY>=0?'+':''}${(data.vsLY*100).toFixed(1)}% vs LY`:' LY comparison unavailable')
        ),
        div({style:{display:'flex',gap:8,justifyContent:'flex-end',marginTop:4}},
          btn({className:'btn btn-sm',style:{color:'var(--text3)'},onClick:onClose},'Cancel'),
          btn({className:'btn btn-sm btn-a',style:{fontWeight:700,padding:'7px 20px',fontSize:'11px'},
            onClick:generateAndPrint},'📄 Generate & Open One-Pager')
        )
      )
    )
  );
}


// DAR DAYPART ANALYTICS  (v186)
// Surfaces hourly data from Daily Activity Reports.
// Shows: peak hour identification, OEPE by hour, GC by hour,
// daypart breakdown (AM/Lunch/PM/Evening), capacity analysis.
// DATA MANAGER PANEL  (v187)
// View and manage persisted IndexedDB data coverage.
// Shows row counts and date ranges per data type.
// Allows selective clear or full reset.
function DataManagerPanel({ds, idbCoverage, onClose}) {
  const {useState:uSt, useEffect:uE} = React;
  const [cov,    setCov]   = uSt(idbCoverage||{});
  const [wxFetching,setWxFetching] = uSt(false);
  const [wxMsg,     setWxMsg]      = uSt('');
  const [status, setStatus]= uSt('');
  const [loading,setLoading]=uSt(false);

  uE(()=>{
    (async()=>{
      setLoading(true);
      const c = await idbGetCoverage();
      setCov(c);
      setLoading(false);
    })();
  },[]);

  const STORE_LABELS = {
    laborRows:'Labor Analysis',opsRows:'Operations Report',
    ctrlRows:'Controls Data',fobRows:'FOB Report',
    auditRows:'Register Audit',peaksRows:'3 Peaks Report',
    darRows:'Daily Activity Reports',pmixRows:'Product Mix',
  };

  const totalRows = Object.values(cov).reduce((a,v)=>a+(v?.count||0),0);

  const handleClear = async()=>{
    if(!confirm('Clear ALL stored data from IndexedDB? Your loaded files will still work, but the app will require re-uploading data on next launch.')) return;
    setStatus('Clearing…');
    await idbClearAll();
    const fresh = await idbGetCoverage();
    setCov(fresh);
    setStatus('✓ All stored data cleared');
  };

  const colVal = (c,k) => c?.[k] != null ? c[k] : '—';

  return div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.82)',zIndex:462,
    display:'flex',alignItems:'center',justifyContent:'center',padding:20}},
    div({style:{background:'var(--surf)',border:'.5px solid var(--bdr2)',borderRadius:'var(--rl)',
      width:'100%',maxWidth:680,display:'flex',flexDirection:'column',
      boxShadow:'0 20px 60px rgba(0,0,0,.5)',overflow:'hidden'}},
      div({style:{padding:'12px 16px',borderBottom:'.5px solid var(--bdr)',background:'var(--surf2)',
        display:'flex',alignItems:'center',gap:10}},
        span({style:{fontSize:'18px'}},'🗄'),
        div({style:{flex:1}},
          div({style:{fontSize:'13px',fontWeight:800,color:'var(--text)'}},'Data Manager'),
          div({style:{fontSize:'9px',color:'var(--text3)'}},'IndexedDB persistent storage · '+totalRows.toLocaleString()+' total rows stored · data survives browser refresh')
        ),
        btn({className:'btn btn-sm',style:{color:'var(--text3)'},onClick:onClose},'✕')
      ),
      div({style:{padding:'16px',overflowY:'auto'}},
        loading&&div({style:{color:'var(--text3)',textAlign:'center',padding:20}},'Loading coverage…'),
        !loading&&div(null,
          // Coverage table
          h('table',{style:{width:'100%',borderCollapse:'collapse',fontSize:'9px',marginBottom:14}},
            h('thead',null,h('tr',null,
              ...['Data Type','Rows','Earliest','Latest'].map((l,i)=>
                h('th',{key:i,style:{padding:'6px 10px',fontSize:'8px',fontWeight:700,
                  textTransform:'uppercase',letterSpacing:'.4px',color:'var(--text3)',
                  borderBottom:'.5px solid var(--bdr)',textAlign:i===0?'left':'right'}},(l)))
            )),
            h('tbody',null,...Object.entries(STORE_LABELS).map(([k,label],i)=>{
              const c=cov[k]||{count:0};
              const hasData=c.count>0;
              return h('tr',{key:k,style:{background:i%2?'rgba(255,255,255,.015)':'transparent',
                borderBottom:'.5px solid rgba(255,255,255,.04)'}},
                h('td',{style:{padding:'6px 10px',fontWeight:600,
                  color:hasData?'var(--text)':'var(--text3)'}},(label)),
                h('td',{style:{padding:'6px 10px',textAlign:'right',fontFamily:'var(--mono)',
                  color:hasData?'var(--amber)':'var(--text3)',fontWeight:hasData?700:400}},
                  hasData?c.count.toLocaleString():'—'),
                h('td',{style:{padding:'6px 10px',textAlign:'right',fontFamily:'var(--mono)',
                  color:'var(--text3)',fontSize:'8px'}},hasData?c.from:'—'),
                h('td',{style:{padding:'6px 10px',textAlign:'right',fontFamily:'var(--mono)',
                  color:'var(--text3)',fontSize:'8px'}},hasData?c.to:'—')
              );
            }))
          ),
          // Info box
          totalRows>0&&div({style:{padding:'10px 14px',background:'rgba(16,185,129,.07)',
            borderRadius:'var(--r)',border:'.5px solid rgba(16,185,129,.2)',marginBottom:14,
            fontSize:'9px',color:'#34d399',lineHeight:1.7}},
            '✓ Data persists across sessions. Load new files anytime — rows are merged and deduplicated by location + date. ',
            'No need to reload historical files on next launch.'
          ),
          totalRows===0&&div({style:{padding:'10px 14px',background:'rgba(245,158,11,.07)',
            borderRadius:'var(--r)',border:'.5px solid rgba(245,158,11,.2)',marginBottom:14,
            fontSize:'9px',color:'var(--amber)',lineHeight:1.7}},
            '⚠ No data stored yet. Load your Excel files — Meridian will persist them automatically. ',
            'Next time you open the app, the data will already be there.'
          ),
          // Status
          status&&div({style:{marginBottom:10,fontSize:'9px',color:'#10b981'}},(status)),
          // Actions
          div({style:{display:'flex',gap:8,justifyContent:'flex-end'}},
            totalRows>0&&btn({className:'btn btn-sm',
              style:{color:'#f87171',border:'.5px solid rgba(248,113,113,.3)',fontSize:'9px'},
              onClick:handleClear},'🗑 Clear All Stored Data'),
      !wxFetching&&btn({style:{background:'rgba(96,165,250,.1)',border:'1px solid rgba(96,165,250,.25)',color:'#60a5fa',padding:'8px 14px',borderRadius:'8px',cursor:'pointer',fontSize:'12px',fontWeight:600},
        onClick:async()=>{
          if(!navigator.onLine&&!window.location.href.startsWith('file://')){
            setWxMsg('Internet connection required for weather fetch.'); return;
          }
          setWxFetching(true); setWxMsg('Starting weather fetch for 27 stores…');
          try{
            const endD=new Date().toISOString().slice(0,10);
            const rows=await fetchOpenMeteoWeather('2022-01-01',endD,(done,total,name)=>{
              setWxMsg('Fetching weather '+done+'/'+total+' — '+name);
            });
            if(rows.length>0){
              await idbPutRows('weatherRows',rows);
              const fresh=await idbGetCoverage();
              setIdbCoverage(fresh);
              setWxMsg('✓ '+rows.length.toLocaleString()+' weather records stored — all 27 stores · 2022–present');
            } else {
              setWxMsg('⚠ No weather data returned — check internet connection');
            }
          }catch(e){setWxMsg('⚠ Weather fetch error: '+e.message);}
          setWxFetching(false);
        }
      },'🌤 Fetch All Weather'),
      wxFetching&&div({style:{fontSize:'11px',color:'var(--text3)',padding:'6px 0',fontStyle:'italic'}},wxMsg),
            btn({className:'btn btn-sm btn-a',onClick:onClose},'Close')
          )
        )
      )
    )
  );
}


// ── end LaborAnalyticsPanel ───────────────────────────────────────────

// ════════════════════════════════════════════════════════════════════════════════
// DISTRICT PRIORITY BRIEF  (v4.198)
// ════════════════════════════════════════════════════════════════════════════════
// Above-store intelligence panel for operators, supervisors, and field
// consultants. Synthesizes every store's pre-computed signal set (findings,
// opsScore, ctrlScore, pSales/pLY, p.t2w) into a single prioritized view
// answering: "Where do I need to focus this week?"
//
// Tiers:
//   🔴 Action Required — stores with ≥1 critical finding from buildBrief
//   🟡 Watch Closely   — stores with watch flags but no critical finding
//   🟢 Running Well    — stores with only positive/ok findings
//
// Within each tier, sorted by severity (finding count) then by dollar impact.
// Filter by Org (All / OK / FL) or by Supervisor patch.
// Each store card links to the full store dashboard via onSelectStore callback.
// ─────────────────────────────────────────────────────────────────────────────
function DistrictPriorityBrief({stores, ds, settings, userEvents, onSelectStore, onClose}) {
  console.log('[PERF] DistrictPriorityBrief render start, stores.length=', stores&&stores.length);
  const _mountT0=performance.now();
  const {useState:uSt, useMemo:uM} = React;
  const [orgFilter, setOrgFilter] = uSt('all');
  const [expanded,  setExpanded]  = uSt({});
  const toggleExp = (loc) => setExpanded(p=>({...p,[loc]:!p[loc]}));

  // ── Supervisor patches (for filter buttons) ────────────────────────────────
  const supPatches = uM(()=>{
    const seen=new Set(), patches=[];
    (stores||[]).forEach(s=>{
      const sup=s.sup||(INV_ORG_COORDS[s.loc]||{}).sup||'';
      if(sup&&!seen.has(sup)){seen.add(sup);patches.push(sup);}
    });
    return patches.sort();
  },[stores]);

  // ── Tier classification ────────────────────────────────────────────────────
  const tiered = uM(()=>{
    const _t0=performance.now();
    const valid = (stores||[]).filter(s=>/^\d+$/.test(s.loc)&&s.findings);
    const filtFn = orgFilter==='all' ? ()=>true
      : orgFilter==='ok' ? s=>(INV_ORG_COORDS[s.loc]||{}).state==='OK'
      : orgFilter==='fl' ? s=>(INV_ORG_COORDS[s.loc]||{}).state==='FL'
      : s=>s.sup===orgFilter; // supervisor filter

    const out = valid.filter(filtFn).map(s=>{
      const crits = s.findings.filter(f=>f.t==='crit');
      const watches= s.findings.filter(f=>f.t==='watch');
      const oks    = s.findings.filter(f=>f.t==='ok');
      const vsLY   = s.pLY>0?(s.pSales-s.pLY)/s.pLY:null;

      // ── Why Engine: calibration gap detection (zero recomputation) ─────────
      // Reads the MAPE stored in the model assignment (already computed and
      // written by the backtest engine or the AE validation run). If MAPE > 12%
      // AND there are no operational crits/watches from buildBrief, the store is
      // in the "green" tier operationally but has a forecast accuracy problem —
      // surfaced as a distinct amber watch flag so it's not silently hidden.
      const masgn  = getModelAssignment(s.loc, 'weekly', settings);
      const storedMape = masgn&&masgn.mape!=null ? masgn.mape : null;
      const calGap = storedMape!=null && storedMape>12 && crits.length===0 && watches.length===0;
      const calGapWatch = calGap
        ? {t:'watch', m:'FORECAST ACCURACY — weekly MAPE '+storedMape.toFixed(1)+'% (threshold 12%). '
            +'Why Engine scan recommended: high MAPE with no operational flags usually means missing event tags or model calibration drift, not a performance issue.'}
        : null;

      const effectiveWatches = calGapWatch ? [calGapWatch, ...watches] : watches;
      const tier = crits.length>0 ? 'red'
        : effectiveWatches.length>0 ? 'amber'
        : 'green';
      return{...s, crits, watches:effectiveWatches, oks, vsLY, tier, calGap, storedMape};
    });
    console.log('[PERF] tiered computation ('+out.length+' stores):', (performance.now()-_t0).toFixed(1)+'ms');
    return out;
  },[stores,orgFilter]);

  const red   = uM(()=>tiered.filter(s=>s.tier==='red')
    .sort((a,b)=>b.crits.length-a.crits.length||b.watches.length-a.watches.length),[tiered]);
  const amber = uM(()=>tiered.filter(s=>s.tier==='amber')
    .sort((a,b)=>b.watches.length-a.watches.length),[tiered]);
  const green = uM(()=>tiered.filter(s=>s.tier==='green')
    .sort((a,b)=>(b.opsScore+b.ctrlScore)-(a.opsScore+a.ctrlScore)),[tiered]);

  // ── District pulse ─────────────────────────────────────────────────────────
  const pulse = uM(()=>{
    if(!tiered.length) return null;
    const _t0=performance.now();
    const totS = tiered.reduce((a,s)=>a+(s.pSales||0),0);
    const totLY= tiered.reduce((a,s)=>a+(s.pLY||0),0);
    const vsLY = totLY>0?(totS-totLY)/totLY:null;
    // District-wide focus: which issue type appears most?
    const issueCounts={cash:0,labor:0,oepe:0,tred:0,deposit:0,overtime:0,scheduling:0};
    tiered.forEach(s=>{
      s.findings.forEach(f=>{
        if(f.m.includes('CASH')&&(f.m.includes('INTEGRITY')||f.m.includes('O/S'))) issueCounts.cash++;
        else if(f.m.includes('T-Red')&&f.t!=='ok') issueCounts.tred++;
        else if(f.m.includes('DEPOSIT')) issueCounts.deposit++;
        else if(f.m.includes('OVERTIME')||f.m.includes('OT')) issueCounts.overtime++;
        else if(f.m.includes('LABOR')) issueCounts.labor++;
        else if(f.m.includes('OEPE')) issueCounts.oepe++;
        else if(f.m.includes('SCHEDULING')||f.m.includes('FLOOR')) issueCounts.scheduling++;
      });
    });
    const topIssue = Object.entries(issueCounts).sort((a,b)=>b[1]-a[1])[0];
    const focusMap = {
      cash:'🚨 Cash / Deposit integrity — coordinate multi-store controls review',
      tred:'🚨 POS void patterns elevated — district-wide T-Red After audit warranted',
      deposit:'🚨 Deposit shortfalls — cross-reference deposit slips vs POS daily reports',
      overtime:'⚠️ OT discipline — align schedule builds across the portfolio before next week locks',
      labor:'⚠️ Labor % trending over target — schedule review at most-impacted stores',
      oepe:'⚠️ Drive-thru speed — window staffing and pull-time execution district-wide',
      scheduling:'⚠️ Floor management compliance — correct schedule-building process before addressing labor%',
    };
    const focus = topIssue&&topIssue[1]>0 ? focusMap[topIssue[0]] : '✅ District is largely on target — reinforce what\'s working';
    console.log('[PERF] pulse computation:', (performance.now()-_t0).toFixed(1)+'ms');
    return{totS,vsLY,focus,redN:red.length,amberN:amber.length,greenN:green.length,n:tiered.length};
  },[tiered,red,amber,green]);

  console.log('[PERF] DistrictPriorityBrief total render-body time:', (performance.now()-_mountT0).toFixed(1)+'ms');


  // ── Finding formatter ──────────────────────────────────────────────────────
  // Strip the "CRITICAL — " / "WATCH — " / "STRENGTH — " / "INTEGRITY ALERT — " prefix
  // to keep card text tighter; the pill already conveys severity.
  const fmtFinding = (msg, maxLen=160) => {
    const clean = msg
      .replace(/^CRITICAL\s*—\s*/,'')
      .replace(/^WATCH\s*—\s*/,'')
      .replace(/^STRENGTH\s*—\s*/,'')
      .replace(/^INTEGRITY ALERT\s*—\s*/,'')
      .replace(/^OPPORTUNITY\s*—\s*/,'')
      .replace(/^RECORD\s*—\s*/,'')
      .replace(/^AI FORECAST:\s*/,'');
    return clean.length>maxLen ? clean.slice(0,maxLen)+'…' : clean;
  };

  // ── Store card component ───────────────────────────────────────────────────
  const StoreCard = ({s, tierCol, tierIcon}) => {
    const isExp = !!expanded[s.loc];
    const allWatchFindings = s.watches;
    const displayCrits  = isExp ? s.crits   : s.crits.slice(0,2);
    const displayWatches= isExp ? allWatchFindings : allWatchFindings.slice(0,1);
    const hasMore = s.crits.length+s.watches.length > displayCrits.length+displayWatches.length;
    const trendDir = s.p&&s.p.t2w!=null ? (s.p.t2w>=.02?'📈':s.p.t2w<=-.02?'📉':'→') : null;
    const trendCol = s.p&&s.p.t2w!=null ? (s.p.t2w>=.02?'#10b981':s.p.t2w<=-.02?'#ef4444':'var(--text3)') : 'var(--text3)';
    return div({style:{
      border:'.5px solid '+tierCol+'55',borderRadius:'var(--r)',
      background:tierCol==='#ef4444'?'rgba(239,68,68,.04)':tierCol==='#f59e0b'?'rgba(245,158,11,.035)':'rgba(16,185,129,.04)',
      padding:'10px 14px',marginBottom:8}},
      // ── Card header ────────────────────────────────────────────────
      div({style:{display:'flex',alignItems:'flex-start',gap:10,marginBottom:6}},
        span({style:{fontSize:'16px',flexShrink:0,lineHeight:'22px'}},tierIcon),
        div({style:{flex:1,minWidth:0}},
          div({style:{display:'flex',flexWrap:'wrap',gap:6,alignItems:'baseline',marginBottom:2}},
            span({style:{fontSize:'11px',fontWeight:800,color:'var(--amber)'}},(STORE_NAMES[s.loc]||s.loc)),
            span({style:{fontSize:'9px',color:'var(--text3)'}},'#'+s.loc),
            s.city&&span({style:{fontSize:'8.5px',color:'var(--text3)'}},'· '+s.city+(s.state?', '+s.state:'')),
            trendDir&&span({style:{fontSize:'9px',color:trendCol,fontWeight:600}},
              trendDir+(s.p.t2w!=null?' '+(s.p.t2w>=0?'+':'')+((s.p.t2w*100).toFixed(1))+'% 2W':'')),
            s.calGap&&span({title:'Forecast MAPE '+s.storedMape+'% — Why Engine scan recommended',
              style:{fontSize:'7px',padding:'1px 6px',borderRadius:99,background:'rgba(99,102,241,.15)',
                color:'#818cf8',fontWeight:700,cursor:'help'}},'🔬 '+s.storedMape+'% MAPE')
          ),
          div({style:{display:'flex',gap:10,flexWrap:'wrap',fontSize:'8.5px',color:'var(--text3)'}},
            s.gm&&div(null,'GM: ',span({style:{color:'var(--text2)'}},(s.gm||'').split(' ')[0])),
            s.operator&&div(null,'Operator: ',span({style:{color:'var(--text2)'}},s.operator.split(' ').slice(-1)[0])),
            s.sup&&div(null,'Sup: ',span({style:{color:'var(--text2)'}},s.sup.split(' ').slice(-1)[0])),
            s.vsLY!=null&&div(null,'4W vs LY: ',span({style:{color:s.vsLY>=0?'#10b981':'#f87171',fontWeight:700}},
              (s.vsLY>=0?'+':'')+((s.vsLY*100).toFixed(1))+'%'))
          )
        ),
        div({style:{display:'flex',gap:4,flexShrink:0}},
          onSelectStore&&btn({
            style:{fontSize:'8px',padding:'3px 9px',background:'rgba(245,158,11,.1)',
              border:'.5px solid rgba(245,158,11,.25)',borderRadius:'var(--r)',
              color:'var(--amber)',cursor:'pointer',whiteSpace:'nowrap'},
            onClick:()=>{onSelectStore(s.loc);onClose&&onClose();}
          },'Open →')
        )
      ),
      // ── Findings ───────────────────────────────────────────────────
      div({style:{display:'flex',flexDirection:'column',gap:4}},
        ...displayCrits.map((f,i)=>div({key:'c'+i,style:{
          fontSize:'9px',lineHeight:1.5,color:'var(--text)',
          padding:'5px 9px',background:'rgba(239,68,68,.07)',
          border:'.5px solid rgba(239,68,68,.2)',borderRadius:4}},
          span({style:{fontSize:'7.5px',fontWeight:700,color:'#ef4444',textTransform:'uppercase',
            letterSpacing:'.3px',display:'block',marginBottom:2}},'Critical'),
          fmtFinding(f.m,isExp?999:160)
        )),
        ...displayWatches.map((f,i)=>div({key:'w'+i,style:{
          fontSize:'9px',lineHeight:1.5,color:'var(--text2)',
          padding:'4px 9px',background:'rgba(245,158,11,.05)',
          border:'.5px solid rgba(245,158,11,.15)',borderRadius:4}},
          fmtFinding(f.m,isExp?999:140)
        )),
        (hasMore||isExp)&&btn({
          style:{alignSelf:'flex-start',marginTop:2,fontSize:'8px',padding:'2px 8px',
            background:'transparent',border:'.5px solid var(--bdr)',borderRadius:'var(--r)',
            color:'var(--text3)',cursor:'pointer'},
          onClick:()=>toggleExp(s.loc)},
          isExp ? '▲ Show less'
                : '▼ +'+(s.crits.length+s.watches.length-displayCrits.length-displayWatches.length)+' more')
      )
    );
  };

  if(!stores||!stores.length||!stores.some(s=>s.findings))
    return div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.85)',zIndex:451,display:'flex',alignItems:'center',justifyContent:'center'}},
      div({style:{textAlign:'center',color:'var(--text3)',padding:40}},
        div({style:{fontSize:40,marginBottom:12}},'🎯'),
        div({style:{fontSize:'14px',fontWeight:700,color:'var(--text)',marginBottom:8}},'No Data Loaded'),
        div({style:{fontSize:'11px',lineHeight:1.6,marginBottom:16}},'Load an Operations Report or Labor Analysis to generate the Priority Brief.'),
        btn({className:'btn btn-sm',onClick:onClose},'Close')));

  return div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.82)',zIndex:451,display:'flex',flexDirection:'column',paddingTop:20}},
    div({style:{flex:'0 0 20px',cursor:'pointer'},onClick:onClose}),
    div({style:{flex:1,background:'var(--surf)',maxWidth:980,margin:'0 auto',width:'calc(100% - 32px)',
      borderRadius:'var(--rl) var(--rl) 0 0',display:'flex',flexDirection:'column',overflow:'hidden',
      boxShadow:'0 -8px 40px rgba(0,0,0,.4)'}},

      // ── Header ──────────────────────────────────────────────────────────────
      div({style:{padding:'10px 16px',borderBottom:'.5px solid var(--bdr)',flexShrink:0,
        background:'var(--surf2)',display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}},
        span({style:{fontSize:'20px'}},'🎯'),
        div({style:{flex:1}},
          div({style:{fontSize:'14px',fontWeight:800,color:'var(--text)'}},'District Priority Brief'),
          div({style:{fontSize:'9px',color:'var(--text3)',marginTop:1}},
            (settings.districtName||'District')+' · '+new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})+
            (ds&&ds.loaded?' · '+((stores||[]).filter(s=>s.findings).length)+' stores with data':' · Load data to generate'))
        ),
        div({style:{display:'flex',gap:3,flexWrap:'wrap',alignItems:'center'}},
          ...(['all','ok','fl',...supPatches].map(f=>btn({key:f,
            style:{padding:'3px 9px',borderRadius:99,fontSize:'8.5px',cursor:'pointer',
              border:'.5px solid '+(orgFilter===f?'rgba(245,158,11,.4)':'var(--bdr)'),
              background:orgFilter===f?'var(--adim)':'transparent',
              color:orgFilter===f?'var(--amber)':'var(--text2)'},
            onClick:()=>setOrgFilter(f)},
            f==='all'?'All':'OK'===f?'🟠 OK':'FL'===f?'🔵 FL':f.split(' ').slice(-1)[0])))
        ),
        btn({className:'btn btn-sm',style:{color:'var(--text3)',flexShrink:0},onClick:onClose},'✕')
      ),

      // ── Pulse bar ───────────────────────────────────────────────────────────
      pulse&&div({style:{padding:'8px 16px',borderBottom:'.5px solid var(--bdr)',flexShrink:0,
        background:'var(--surf)',display:'flex',gap:12,alignItems:'center',flexWrap:'wrap'}},
        // Tier counters
        div({style:{display:'flex',gap:6}},
          div({style:{display:'flex',alignItems:'center',gap:4,fontSize:'10px',fontWeight:700,color:'#ef4444'}},
            span({style:{width:10,height:10,borderRadius:'50%',background:'#ef4444',display:'inline-block'}}),
            pulse.redN,' action required'),
          div({style:{display:'flex',alignItems:'center',gap:4,fontSize:'10px',fontWeight:600,color:'#f59e0b'}},
            span({style:{width:10,height:10,borderRadius:'50%',background:'#f59e0b',display:'inline-block'}}),
            pulse.amberN,' watching'),
          div({style:{display:'flex',alignItems:'center',gap:4,fontSize:'10px',color:'#10b981'}},
            span({style:{width:10,height:10,borderRadius:'50%',background:'#10b981',display:'inline-block'}}),
            pulse.greenN,' running well')
        ),
        pulse.vsLY!=null&&div({style:{fontSize:'9px',color:'var(--text3)',borderLeft:'.5px solid var(--bdr)',paddingLeft:12}},
          '4-Week vs LY: ',span({style:{color:pulse.vsLY>=0?'#10b981':'#f87171',fontWeight:700}},
            (pulse.vsLY>=0?'+':'')+((pulse.vsLY*100).toFixed(1))+'%'),
          '  ·  Sales: ',span({style:{color:'var(--text)',fontWeight:600}},f$(pulse.totS))
        ),
        // Focus recommendation
        div({style:{marginLeft:'auto',fontSize:'9px',color:'var(--text2)',maxWidth:320,lineHeight:1.4,
          background:'rgba(245,158,11,.05)',border:'.5px solid rgba(245,158,11,.2)',
          borderRadius:'var(--r)',padding:'4px 10px'}},
          span({style:{fontSize:'7.5px',fontWeight:700,color:'var(--amber)',textTransform:'uppercase',
            letterSpacing:'.3px',display:'block',marginBottom:2}},'This Week\'s Focus'),
          pulse.focus)
      ),

      // ── Scrollable content ───────────────────────────────────────────────────
      div({style:{flex:1,overflowY:'auto',padding:'0 16px 32px'}},

        // ── Action Required ────────────────────────────────────────────────────
        red.length>0&&div(null,
          div({style:{display:'flex',alignItems:'center',gap:8,margin:'14px 0 8px',
            padding:'5px 0',borderBottom:'.5px solid rgba(239,68,68,.25)'}},
            span({style:{width:10,height:10,borderRadius:'50%',background:'#ef4444',display:'inline-block'}}),
            div({style:{fontSize:'10px',fontWeight:700,color:'#ef4444',textTransform:'uppercase',letterSpacing:'.5px'}},'Action Required'),
            span({style:{fontSize:'8.5px',color:'var(--text3)',fontWeight:400}},red.length+' store'+(red.length>1?'s':''))
          ),
          ...red.map(s=>h(StoreCard,{key:s.loc,s,tierCol:'#ef4444',tierIcon:'🚨'}))
        ),

        // ── Watch Closely ──────────────────────────────────────────────────────
        amber.length>0&&div(null,
          div({style:{display:'flex',alignItems:'center',gap:8,margin:'14px 0 8px',
            padding:'5px 0',borderBottom:'.5px solid rgba(245,158,11,.25)'}},
            span({style:{width:10,height:10,borderRadius:'50%',background:'#f59e0b',display:'inline-block'}}),
            div({style:{fontSize:'10px',fontWeight:700,color:'#f59e0b',textTransform:'uppercase',letterSpacing:'.5px'}},'Watch Closely'),
            span({style:{fontSize:'8.5px',color:'var(--text3)',fontWeight:400}},amber.length+' store'+(amber.length>1?'s':''))
          ),
          ...amber.map(s=>h(StoreCard,{key:s.loc,s,tierCol:'#f59e0b',tierIcon:'⚠️'}))
        ),

        // ── Running Well ───────────────────────────────────────────────────────
        green.length>0&&div(null,
          div({style:{display:'flex',alignItems:'center',gap:8,margin:'14px 0 8px',
            padding:'5px 0',borderBottom:'.5px solid rgba(16,185,129,.2)'}},
            span({style:{width:10,height:10,borderRadius:'50%',background:'#10b981',display:'inline-block'}}),
            div({style:{fontSize:'10px',fontWeight:700,color:'#10b981',textTransform:'uppercase',letterSpacing:'.5px'}},'Running Well'),
            span({style:{fontSize:'8.5px',color:'var(--text3)',fontWeight:400}},green.length+' store'+(green.length>1?'s':''))
          ),
          div({style:{display:'flex',gap:6,flexWrap:'wrap',paddingBottom:4}},
            ...green.map(s=>{
              const hasStr=s.strength&&s.strength.length>0;
              return div({key:s.loc,style:{
                display:'flex',alignItems:'center',gap:6,
                padding:'5px 10px',borderRadius:'var(--r)',
                background:'rgba(16,185,129,.05)',border:'.5px solid rgba(16,185,129,.2)',
                cursor:onSelectStore?'pointer':'default'},
                onClick:onSelectStore?()=>{onSelectStore(s.loc);onClose&&onClose();}:undefined},
                div({style:{fontSize:'9px',fontWeight:700,color:'var(--amber)'}},(STORE_NAMES[s.loc]||s.loc)),
                hasStr&&div({style:{fontSize:'8px',color:'#34d399'}},
                  '· '+(s.strength.includes('ELITE')?'⭐ Elite':s.strength.includes('CONTROLS')?'🔒 Controls':s.strength.includes('OPS')?'⚡ Ops':'✓'))
              );
            })
          )
        )
      )
    )
  );
}
// ── end DistrictPriorityBrief ──────────────────────────────────────────────

// ════════════════════════════════════════════════════════════════════════════════
// WHY ENGINE PANEL  (v4.201 — Engine 2 UI)
// ════════════════════════════════════════════════════════════════════════════════
// Surfaces runWhyEngineScan / runWhyEngineDistrict. Single-store mode shows a
// composition summary, DOW miss pattern, and the worst individual misses each
// with their full qualitative diagnosis (reusing diagnoseMiss verbatim — this
// panel doesn't re-derive causation, it just runs the existing trusted logic
// systematically and aggregates it). District mode ranks all stores by MAPE
// and explained%, surfacing calibration candidates: stores where most misses
// have no event tag, no regional correlation, and no anomaly signal — i.e.
// the model itself may need attention, not just better event coverage.
// ─────────────────────────────────────────────────────────────────────────────
function WhyEnginePanel({stores, ds, settings, userEvents, onUpdate, onClose}) {
  const {useState:uSt, useRef:uR} = React;
  const LOCS = Object.keys(STORE_NAMES).sort((a,b)=>STORE_NAMES[a].localeCompare(STORE_NAMES[b]));

  const [mode, setMode] = uSt('single'); // 'single' | 'district'
  const [selLoc, setSelLoc] = uSt(LOCS[0]);
  const [weeksBack, setWeeksBack] = uSt(8);
  const [scanResult, setScanResult] = uSt(null);
  const [scanning, setScanning] = uSt(false);

  const [districtResults, setDistrictResults] = uSt(null);
  const [districtRunning, setDistrictRunning] = uSt(false);
  const [districtProg, setDistrictProg] = uSt(null);
  const cancelRef = uR(false);

  const [expandedMiss, setExpandedMiss] = uSt(null);
  const [showAddEvent, setShowAddEvent] = uSt(false);
  const [prefillLoc, setPrefillLoc] = uSt(null);

  const runSingle = (loc) => {
    setScanning(true);
    // Synchronous CPU-bound work — small enough not to need a worker, but
    // defer one tick so the "scanning" state actually paints first.
    setTimeout(()=>{
      const result = runWhyEngineScan(loc, ds, userEvents, settings, weeksBack);
      setScanResult(result);
      setScanning(false);
    },10);
  };

  const runDistrict = async () => {
    if(!window.confirm('Run the Why Engine across all '+LOCS.length+' stores ('+weeksBack+' weeks each)?\n\nThis is CPU-bound (no API calls) and typically takes 10-30 seconds.')) return;
    cancelRef.current=false;
    setDistrictRunning(true);
    setDistrictResults(null);
    const results = await runWhyEngineDistrict(stores, ds, userEvents, settings, weeksBack,
      (p)=>{ if(!cancelRef.current) setDistrictProg(p); });
    if(!cancelRef.current) setDistrictResults(results);
    setDistrictRunning(false);
    setDistrictProg(null);
  };
  const cancelDistrict = ()=>{ cancelRef.current=true; setDistrictRunning(false); setDistrictProg(null); };

  const jumpToStore = (loc) => {
    setSelLoc(loc);
    if(districtResults&&districtResults[loc]) setScanResult(districtResults[loc]);
    else runSingle(loc);
    setMode('single');
  };

  const DOW_NAMES=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const BUCKET_LABELS = {
    event:{label:'Tagged Event', icon:'📌', col:'#a5b4fc'},
    regional:{label:'Regional/District Pattern', icon:'🏪', col:'#f59e0b'},
    weather:{label:'Weather (Primary)', icon:'🌦', col:'#93c5fd'},
    isolated_anomaly:{label:'Isolated Store Anomaly', icon:'🔍', col:'#f97316'},
    contributing_factors:{label:'Minor Contributing Factors', icon:'⚙️', col:'#84cc16'},
    unexplained:{label:'Unexplained', icon:'❓', col:'#64748b'},
  };

  const fmt$ = v => (v>=0?'+':'-')+'$'+Math.round(Math.abs(v)).toLocaleString();
  const fmtPlain$ = v => '$'+Math.round(Math.abs(v)).toLocaleString();

  if(!ds||!ds.loaded) return div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.85)',zIndex:464,display:'flex',alignItems:'center',justifyContent:'center'}},
    div({style:{textAlign:'center',color:'var(--text3)',padding:40}},
      div({style:{fontSize:40,marginBottom:12}},'🔬'),
      div({style:{fontSize:'14px',fontWeight:700,color:'var(--text)',marginBottom:8}},'No Data Loaded'),
      div({style:{fontSize:'11px',marginBottom:16,lineHeight:1.6}},'Load a Labor Analysis or Operations Report to run the Why Engine.'),
      btn({className:'btn btn-sm',onClick:onClose},'Close')));

  return div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.82)',zIndex:464,
    display:'flex',alignItems:'flex-start',justifyContent:'center',padding:20,paddingTop:24}},

    showAddEvent&&h(EventEntryModal,{stores,settings,
      onTagEvent:(loc,dk,note,evType,opts)=>{
        if(loc==='_refresh_'&&opts&&opts._refreshState){ onUpdate(opts._refreshState); }
      },
      onClose:()=>{setShowAddEvent(false);setPrefillLoc(null);}}),

    div({style:{background:'var(--surf)',border:'.5px solid var(--bdr2)',borderRadius:'var(--rl)',
      width:'100%',maxWidth:920,maxHeight:'92vh',display:'flex',flexDirection:'column',
      boxShadow:'0 20px 60px rgba(0,0,0,.5)',overflow:'hidden'}},

      // Header
      div({style:{padding:'12px 16px',borderBottom:'.5px solid var(--bdr)',background:'var(--surf2)',
        display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}},
        span({style:{fontSize:'18px'}},'🔬'),
        div({style:{flex:1}},
          div({style:{fontSize:'13px',fontWeight:800,color:'var(--text)'}},'Why Engine'),
          div({style:{fontSize:'9px',color:'var(--text3)'}},'Systematic miss attribution — composition + diagnosis, run across every day instead of one click at a time')
        ),
        div({style:{display:'flex',gap:3}},
          ...[['single','📍 Single Store'],['district','🏙 District']].map(([id,l])=>
            btn({key:id,style:{fontSize:'9px',padding:'4px 10px',borderRadius:'var(--r)',
              background:mode===id?'var(--adim)':'transparent',
              color:mode===id?'var(--amber)':'var(--text3)',
              border:'.5px solid '+(mode===id?'rgba(245,158,11,.4)':'var(--bdr)'),cursor:'pointer'},
              onClick:()=>setMode(id)},l))
        ),
        btn({className:'btn btn-sm',style:{color:'var(--text3)'},onClick:onClose},'✕')
      ),

      // ════════ SINGLE STORE MODE ════════
      mode==='single'&&React.createElement(React.Fragment,null,
        div({style:{padding:'10px 16px',borderBottom:'.5px solid var(--bdr)',flexShrink:0,
          display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}},
          h('select',{value:selLoc,onChange:e=>{setSelLoc(e.target.value);setScanResult(null);},
            style:{fontSize:'11px',padding:'5px 8px',background:'var(--surf)',border:'.5px solid var(--bdr)',
              borderRadius:'var(--r)',color:'var(--text)',flex:1,minWidth:160}},
            LOCS.map(l=>h('option',{key:l,value:l},sName(l)))),
          h('select',{value:weeksBack,onChange:e=>{setWeeksBack(+e.target.value);setScanResult(null);},
            style:{fontSize:'10px',padding:'5px 8px',background:'var(--surf)',border:'.5px solid var(--bdr)',
              borderRadius:'var(--r)',color:'var(--text)'}},
            [4,8,12,16].map(w=>h('option',{key:w,value:w},w+' weeks'))),
          btn({className:'btn btn-sm btn-a',style:{fontWeight:700},disabled:scanning,
            onClick:()=>runSingle(selLoc)},scanning?'⏳ Scanning…':'▶ Run Scan')
        ),
        div({style:{flex:1,overflowY:'auto',padding:'14px 16px'}},
          !scanResult&&!scanning&&div({style:{color:'var(--text3)',textAlign:'center',padding:'40px 20px',fontSize:'11px'}},
            div({style:{fontSize:36,marginBottom:10}},'🔬'),
            div(null,'Select a store and run the scan. Decomposes every day\'s forecast composition and runs full miss diagnosis across the window.')),

          scanResult&&React.createElement(React.Fragment,null,
            // Summary card
            div({style:{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,marginBottom:14}},
              [['MAPE',scanResult.mape+'%','var(--amber)'],
               ['Days Scanned',scanResult.n,'var(--text)'],
               ['Explained',scanResult.explainedPct+'%','#10b981'],
               ['Worst DOW',scanResult.worstDOW?DOW_NAMES[scanResult.worstDOW.dow]:'—','#f59e0b']
              ].map(([l,v,c],i)=>div({key:i,style:{background:'var(--surf2)',border:'.5px solid var(--bdr)',
                borderRadius:'var(--r)',padding:'10px',textAlign:'center'}},
                div({style:{fontSize:'16px',fontWeight:800,color:c}},v),
                div({style:{fontSize:'7.5px',color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.4px',marginTop:2}},l)))
            ),
            // Composition averages
            div({style:{marginBottom:14}},
              div({style:{fontSize:'9px',fontWeight:700,color:'var(--text3)',textTransform:'uppercase',
                letterSpacing:'.4px',marginBottom:6}},'Average Forecast Composition (per day)'),
              div({style:{display:'flex',gap:8,flexWrap:'wrap'}},
                [['🌦 Weather',scanResult.avgWeatherDollars,'#93c5fd'],
                 ['⚙️ Ops',scanResult.avgOpsDollars,'#f59e0b'],
                 ['📈 Trend',scanResult.avgTrendDollars,'#84cc16'],
                 ['📌 Event',scanResult.avgEventDollars,'#a5b4fc']
                ].map(([l,v,c],i)=>div({key:i,style:{flex:'1 1 100px',background:c+'11',border:'.5px solid '+c+'33',
                  borderRadius:'var(--r)',padding:'8px 10px'}},
                  div({style:{fontSize:'8px',color:c,fontWeight:700,marginBottom:3}},l),
                  div({style:{fontSize:'12px',fontWeight:800,color:'var(--text)'}},fmt$(v))))
              )
            ),
            // Bucket breakdown
            div({style:{marginBottom:14}},
              div({style:{fontSize:'9px',fontWeight:700,color:'var(--text3)',textTransform:'uppercase',
                letterSpacing:'.4px',marginBottom:6}},'Miss Causes — '+scanResult.n+' Days'),
              div({style:{display:'flex',gap:6,flexWrap:'wrap'}},
                ...Object.entries(scanResult.bucketCounts).sort((a,b)=>b[1]-a[1]).map(([bucket,count])=>{
                  const bl=BUCKET_LABELS[bucket]||BUCKET_LABELS.unexplained;
                  return div({key:bucket,style:{display:'flex',alignItems:'center',gap:5,
                    padding:'4px 10px',borderRadius:99,background:bl.col+'15',border:'.5px solid '+bl.col+'40'}},
                    span({style:{fontSize:'11px'}},bl.icon),
                    span({style:{fontSize:'9px',color:bl.col,fontWeight:700}},count),
                    span({style:{fontSize:'8px',color:'var(--text3)'}},bl.label));
                })
              )
            ),
            // Worst misses
            div(null,
              div({style:{fontSize:'9px',fontWeight:700,color:'var(--text3)',textTransform:'uppercase',
                letterSpacing:'.4px',marginBottom:6}},'Worst Misses — Click to Expand'),
              ...scanResult.worst.map((m,i)=>{
                const isExp = expandedMiss===i;
                const isUnder = m.missDollars>0; // actual > forecast
                return div({key:i,style:{border:'.5px solid var(--bdr)',borderRadius:'var(--r)',
                  marginBottom:6,overflow:'hidden',background:'var(--surf2)'}},
                  div({style:{padding:'8px 12px',display:'flex',alignItems:'center',gap:8,cursor:'pointer'},
                    onClick:()=>setExpandedMiss(isExp?null:i)},
                    span({style:{fontSize:'9px',fontWeight:700,color:'var(--text)'}},
                      m.date.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})),
                    span({style:{fontSize:'9px',fontWeight:700,color:isUnder?'#10b981':'#ef4444'}},
                      fmt$(m.missDollars)+' ('+(m.missPct>=0?'+':'')+m.missPct.toFixed(1)+'%)'),
                    span({style:{fontSize:'8px',color:(BUCKET_LABELS[m.bucket]||{}).col||'var(--text3)'}},
                      (BUCKET_LABELS[m.bucket]||{}).icon+' '+(BUCKET_LABELS[m.bucket]||{}).label),
                    span({style:{marginLeft:'auto',fontSize:'9px',color:'var(--text3)'}},isExp?'▲':'▼')
                  ),
                  isExp&&div({style:{padding:'0 12px 12px'}},
                    div({style:{fontSize:'8.5px',color:'var(--text3)',marginBottom:8}},
                      'Forecast '+fmtPlain$(m.r.forecast)+' · Actual '+fmtPlain$(m.r.actual)),
                    ...m.causes.map((c,ci)=>div({key:ci,style:{display:'flex',gap:8,marginBottom:6,
                      padding:'6px 8px',background:'rgba(255,255,255,.03)',borderRadius:4,
                      borderLeft:'2px solid '+c.color}},
                      span({style:{fontSize:'11px',flexShrink:0}},c.icon),
                      div({style:{flex:1}},
                        span({style:{fontSize:'7px',fontWeight:700,color:c.color,marginRight:6}},c.weight),
                        span({style:{fontSize:'8.5px',color:'var(--text2)',lineHeight:1.5}},c.text)
                      )
                    )),
                    btn({style:{fontSize:'8px',padding:'3px 9px',borderRadius:4,background:'rgba(245,158,11,.1)',
                      border:'.5px solid rgba(245,158,11,.25)',color:'var(--amber)',cursor:'pointer',marginTop:4},
                      onClick:()=>{setPrefillLoc(selLoc);setShowAddEvent(true);}},'🏷 Tag Event for This Date')
                  )
                );
              })
            )
          )
        )
      ),

      // ════════ DISTRICT MODE ════════
      mode==='district'&&React.createElement(React.Fragment,null,
        div({style:{padding:'10px 16px',borderBottom:'.5px solid var(--bdr)',flexShrink:0,
          display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}},
          div({style:{flex:1,fontSize:'9px',color:'var(--text3)'}},
            districtResults
              ? Object.keys(districtResults).filter(l=>districtResults[l]).length+' stores scanned · ranked by MAPE'
              : 'Runs the scan across every store — CPU-bound, no API calls.'),
          h('select',{value:weeksBack,onChange:e=>setWeeksBack(+e.target.value),
            style:{fontSize:'10px',padding:'5px 8px',background:'var(--surf)',border:'.5px solid var(--bdr)',
              borderRadius:'var(--r)',color:'var(--text)'}},
            [4,8,12,16].map(w=>h('option',{key:w,value:w},w+' weeks'))),
          btn({className:'btn btn-sm btn-a',style:{fontWeight:700},disabled:districtRunning,
            onClick:runDistrict},districtRunning?'⏳ Scanning…':'▶ Run District Scan'),
          districtRunning&&btn({className:'btn btn-sm',style:{color:'#f87171'},onClick:cancelDistrict},'⏹ Cancel')
        ),
        districtRunning&&districtProg&&div({style:{padding:'8px 16px',borderBottom:'.5px solid var(--bdr)',flexShrink:0}},
          div({style:{display:'flex',justifyContent:'space-between',marginBottom:4,fontSize:'9px',color:'var(--text3)'}},
            span(null,'Store '+districtProg.done+' of '+districtProg.total+' · '+districtProg.storeName),
            span(null,Math.round(districtProg.done/districtProg.total*100)+'%')),
          div({style:{height:5,background:'var(--surf2)',borderRadius:99,overflow:'hidden'}},
            div({style:{height:'100%',width:Math.round(districtProg.done/districtProg.total*100)+'%',
              background:'var(--amber)',borderRadius:99,transition:'width .3s'}}))
        ),
        div({style:{flex:1,overflowY:'auto',padding:'12px 16px'}},
          !districtResults&&!districtRunning&&div({style:{color:'var(--text3)',textAlign:'center',padding:'40px 20px',fontSize:'11px'}},
            div({style:{fontSize:36,marginBottom:10}},'🏙'),
            div(null,'Run the district scan to rank every store by MAPE and explained-miss rate.')),
          districtResults&&h('table',{style:{width:'100%',borderCollapse:'collapse',fontSize:'9px'}},
            h('thead',null,h('tr',null,
              ['Store','MAPE','Explained','Top Driver','Worst DOW'].map((l,i)=>
                h('th',{key:i,style:{padding:'6px 8px',fontSize:'8px',fontWeight:700,color:'var(--text3)',
                  textTransform:'uppercase',letterSpacing:'.3px',borderBottom:'.5px solid var(--bdr)',
                  textAlign:i===0?'left':'center'}},l)))),
            h('tbody',null,
              ...Object.entries(districtResults).filter(([,r])=>r)
                .sort((a,b)=>b[1].mape-a[1].mape)
                .map(([loc,r])=>{
                  const topBucket = Object.entries(r.bucketCounts).sort((a,b)=>b[1]-a[1])[0];
                  const bl = topBucket?(BUCKET_LABELS[topBucket[0]]||{}):{};
                  return h('tr',{key:loc,style:{borderBottom:'.5px solid rgba(255,255,255,.05)',
                    cursor:'pointer'},onClick:()=>jumpToStore(loc)},
                    h('td',{style:{padding:'7px 8px',fontWeight:700,color:'var(--amber)'}},sNameC(loc)),
                    h('td',{style:{padding:'7px 8px',textAlign:'center',
                      color:r.mape>12?'#ef4444':r.mape>8?'#f59e0b':'#10b981',fontWeight:700}},r.mape+'%'),
                    h('td',{style:{padding:'7px 8px',textAlign:'center',color:'var(--text2)'}},r.explainedPct+'%'),
                    h('td',{style:{padding:'7px 8px',textAlign:'center',color:bl.col||'var(--text3)'}},
                      (bl.icon||'')+' '+(bl.label||'—')),
                    h('td',{style:{padding:'7px 8px',textAlign:'center',color:'var(--text3)'}},
                      r.worstDOW?DOW_NAMES[r.worstDOW.dow]:'—')
                  );
                })
            )
          )
        )
      )
    )
  );
}
// ── end WhyEnginePanel ───────────────────────────────────────────────────────




function FOBAnalysisPanel({stores, ds, settings, onClose}){
  const allLocs=(stores||[]).filter(s=>/^\d+$/.test(s.loc)).map(s=>s.loc);
  const okLocs=React.useMemo(()=>allLocs.filter(l=>(INV_ORG_COORDS[l]||{}).state==='OK'),[allLocs]);
  const flLocs=React.useMemo(()=>allLocs.filter(l=>(INV_ORG_COORDS[l]||{}).state==='FL'),[allLocs]);
  const [selLoc,setSelLoc]=React.useState('all');
  const [selMonth,setSelMonth]=React.useState('');
  const [expandedRow,setExpandedRow]=React.useState(null);
  const [showAllLocs,setShowAllLocs]=React.useState(false);
  // For market-level filters resolve to the set of locs, then pass 'all' to computeFOBMetrics
  // with a pre-filtered fobRows slice so location breakdown still works per-store
  const fobActiveLocs=React.useMemo(()=>{
    if(selLoc==='all') return allLocs;
    if(selLoc==='ok')  return okLocs;
    if(selLoc==='fl')  return flLocs;
    return allLocs.includes(selLoc)?[selLoc]:[];
  },[selLoc,allLocs,okLocs,flLocs]);

  // Available months from fobRows
  const months=React.useMemo(()=>{
    const ms=new Set();
    (ds.fobRows||[]).filter(r=>r.sales>0).forEach(r=>{if(r.date)ms.add(r.date.toISOString().slice(0,7));});
    return[...ms].sort().reverse();
  },[ds.fobRows]);

  // Auto-select most recent month
  React.useEffect(()=>{if(months.length&&!selMonth)setSelMonth(months[0]);},[months]);

  // Merge all targets
  const allTargets=React.useMemo(()=>{
    const t={};
    allLocs.forEach(loc=>{t[loc]=(settings.targets&&settings.targets[loc])||DEFAULT_TARGETS[loc]||{};});
    return t;
  },[allLocs,settings]);

  const metrics=React.useMemo(()=>{
    // For OK/FL market filters, pre-filter fobRows to active locs then pass 'all'
    const filtRows=(selLoc==='ok'||selLoc==='fl')
      ? (ds.fobRows||[]).filter(r=>fobActiveLocs.includes(String(r.loc)))
      : ds.fobRows;
    const effLoc=(selLoc==='ok'||selLoc==='fl')?'all':selLoc;
    return computeFOBMetrics(filtRows,allTargets,effLoc,selMonth);
  },[ds.fobRows,allTargets,selLoc,selMonth,fobActiveLocs]);

  const pFmt=v=>(v>=0?'+':'')+(v*100).toFixed(2)+'%';
  const pFmtA=v=>(v*100).toFixed(2)+'%';
  const dFmt=v=>'$'+Math.abs(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  const fCol=(diffPct,lower)=>{
    if(lower){return diffPct>0.005?'#ef4444':diffPct>0.001?'#f59e0b':'#10b981';}
    return Math.abs(diffPct)<0.001?'var(--text)':'var(--text2)';
  };
  const statusBadge=(c,m)=>{
    if(!m||!m[c.key]) return null;
    const{diffPct}=m[c.key];
    const bad=c.lower?diffPct>c.threshold:false;
    const warn=c.lower?diffPct>0&&diffPct<=c.threshold:false;
    if(bad)return span({style:{fontSize:'8px',padding:'1px 5px',borderRadius:3,fontWeight:700,
      background:'rgba(239,68,68,.12)',color:'#ef4444',border:'.5px solid rgba(239,68,68,.3)'}},'⚠ Over');
    if(warn)return span({style:{fontSize:'8px',padding:'1px 5px',borderRadius:3,fontWeight:700,
      background:'rgba(245,158,11,.12)',color:'#f59e0b',border:'.5px solid rgba(245,158,11,.3)'}},'△ Watch');
    return span({style:{fontSize:'8px',padding:'1px 5px',borderRadius:3,fontWeight:700,
      background:'rgba(16,185,129,.12)',color:'#10b981',border:'.5px solid rgba(16,185,129,.3)'}},'✓ OK');
  };

  const monthLabel=m=>{if(!m)return'—';const[y,mo]=m.split('-');return new Date(+y,+mo-1,1).toLocaleDateString('en-US',{month:'long',year:'numeric'});};

  // Summary KPI cards
  const kpiCards=()=>{
    if(!metrics) return null;
    const tc=metrics.pLFoodPct,fob=metrics.fobPct,bfood=metrics.baseFoodPct;
    const aboveCount=FOB_COMP.filter(c=>c.lower&&metrics[c.key]&&metrics[c.key].diffPct>0.001).length;
    return div({style:{display:'flex',gap:8,padding:'10px 16px',flexWrap:'wrap',borderBottom:'.5px solid var(--bdr)',flexShrink:0,background:'var(--surf2)'}},
      ...[
        {label:'Total Food Cost',val:pFmtA(tc.actual),sub:tc.diffPct>0?'▲ '+pFmt(tc.diffPct)+' vs target':'✓ '+pFmt(Math.abs(tc.diffPct))+' under',
         col:fCol(tc.diffPct,true),bg:tc.diffPct>0.005?'rgba(239,68,68,.06)':'rgba(16,185,129,.06)'},
        {label:'Food Over Base',val:pFmtA(fob.actual),sub:fob.diffPct>0?'▲ '+pFmt(fob.diffPct)+' vs target':'✓ '+pFmt(Math.abs(fob.diffPct))+' under',
         col:fCol(fob.diffPct,true),bg:fob.diffPct>0.003?'rgba(245,158,11,.06)':'rgba(16,185,129,.06)'},
        {label:'Base Food',val:pFmtA(bfood.actual),sub:bfood.diffPct>0?'▲ '+pFmt(bfood.diffPct)+' vs target':'✓ '+pFmt(Math.abs(bfood.diffPct))+' under',
         col:fCol(bfood.diffPct,true),bg:bfood.diffPct>0.005?'rgba(245,158,11,.06)':'rgba(16,185,129,.06)'},
        {label:'Components Over Target',val:aboveCount+' / '+FOB_COMP.filter(c=>c.lower).length,sub:'categories above threshold',
         col:aboveCount>3?'#ef4444':aboveCount>1?'#f59e0b':'#10b981',bg:'rgba(255,255,255,.02)'},
        {label:'Net Sales (Period)',val:'$'+(metrics.totalSales/1000).toFixed(0)+'K',sub:metrics.locCount+' location'+(metrics.locCount!==1?'s':'')+' · '+metrics.rowCount+' records',
         col:'#a5b4fc',bg:'rgba(165,180,252,.04)'},
      ].map((k,i)=>div({key:i,style:{flex:'1 1 130px',minWidth:130,background:k.bg,border:'.5px solid var(--bdr)',borderRadius:6,padding:'8px 12px'}},
        div({style:{fontSize:'8px',textTransform:'uppercase',letterSpacing:'.5px',color:'var(--text3)',marginBottom:2}},k.label),
        div({style:{fontSize:'15px',fontFamily:'var(--mono)',fontWeight:700,color:k.col}},''+k.val),
        div({style:{fontSize:'8px',color:'var(--text3)',marginTop:2}},k.sub)
      ))
    );
  };

  const thS={fontSize:'8px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.5px',
    color:'var(--text3)',padding:'5px 8px',textAlign:'right',borderBottom:'.5px solid var(--bdr)',background:'var(--mid2)',whiteSpace:'nowrap'};

  const fobRow=(c,i)=>{
    if(!metrics||!metrics[c.key]) return null;
    const m=metrics[c.key];
    const dc=fCol(m.diffPct,c.lower);
    const isExpanded=expandedRow===c.key;
    return[
      tr({key:c.key,style:{borderBottom:'.5px solid rgba(255,255,255,.04)',
        background:c.isTotal?'rgba(165,180,252,.06)':c.sep?'rgba(255,255,255,.02)':i%2?'rgba(255,255,255,.015)':'transparent',
        borderTop:c.sep?'1px solid rgba(255,255,255,.1)':'none',cursor:'pointer'},
        onClick:()=>setExpandedRow(isExpanded?null:c.key)},
        td({style:{padding:'5px 8px',textAlign:'left',fontWeight:c.isTotal?700:500,color:c.isTotal?'#a5b4fc':'var(--text)',fontSize:'9px'}},
          span({style:{marginRight:5}},c.icon),c.label),
        td({style:{padding:'5px 8px',textAlign:'right',fontFamily:'var(--mono)',fontSize:'9px',color:'var(--text2)'}},pFmtA(m.target)),
        td({style:{padding:'5px 8px',textAlign:'right',fontFamily:'var(--mono)',fontSize:'9px',fontWeight:c.isTotal?700:500,color:c.isTotal?'#a5b4fc':'var(--text)'}},pFmtA(m.actual)),
        td({style:{padding:'5px 8px',textAlign:'right',fontFamily:'var(--mono)',fontSize:'9px',color:'var(--text3)'}},dFmt(m.actualDollar)),
        td({style:{padding:'5px 8px',textAlign:'right',fontFamily:'var(--mono)',fontSize:'9px',fontWeight:700,color:dc}},
          (m.diffPct>0?'▲ ':m.diffPct<-0.0005?'▼ ':'')+pFmt(m.diffPct)),
        td({style:{padding:'5px 8px',textAlign:'right',fontFamily:'var(--mono)',fontSize:'9px',fontWeight:700,color:dc}},
          (m.diffDollar<0?'+':m.diffDollar>0?'-':'')+(m.diffDollar!==0?dFmt(m.diffDollar):'—')),
        td({style:{padding:'5px 8px',textAlign:'center'}},statusBadge(c,metrics)),
        td({style:{padding:'5px 8px',textAlign:'center',fontSize:'10px',color:'var(--text3)'}},(isExpanded?'▲':'▼'))
      ),
      isExpanded&&selLoc==='all'&&tr({key:c.key+'_exp'},td({colSpan:8,style:{padding:0}},
        div({style:{background:'var(--mid2)',borderBottom:'.5px solid var(--bdr)',padding:'8px 16px'}},
          div({style:{fontSize:'8px',color:'var(--text3)',marginBottom:6,fontWeight:700}},
            'Location breakdown — sorted by highest variance (click to collapse)'),
          div({style:{display:'flex',flexWrap:'wrap',gap:4}},
            m.locBreakdown.slice(0,showAllLocs?999:10).map((l,li)=>{
              const dc2=fCol(l.diff,c.lower);
              return div({key:l.loc,style:{fontSize:'8.5px',background:'var(--surf3)',border:'.5px solid '+dc2+'44',
                borderRadius:4,padding:'4px 8px',minWidth:140}},
                div({style:{fontWeight:600,color:'var(--gold)',marginBottom:1}},sName(l.loc)),
                div({style:{fontFamily:'var(--mono)',color:dc2,fontWeight:700}},pFmtA(l.pct),' ',
                  span({style:{fontSize:'7px',color:'var(--text3)'}},'(tgt '+pFmtA(l.tgt)+')'))
              );
            }),
            m.locBreakdown.length>10&&!showAllLocs&&btn({className:'btn btn-sm',style:{alignSelf:'center',fontSize:'8px'},
              onClick:e=>{e.stopPropagation();setShowAllLocs(true);}},
              '+ '+(m.locBreakdown.length-10)+' more')
          )
        )
      ))
    ].filter(Boolean);
  };

  if(!ds||!(ds.fobRows||[]).length) return div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.85)',zIndex:450,display:'flex',alignItems:'center',justifyContent:'center'}},
    div({style:{textAlign:'center',color:'var(--text3)',padding:40}},
      div({style:{fontSize:40,marginBottom:12}},'🥗'),
      div({style:{fontSize:'14px',fontWeight:700,color:'var(--text)',marginBottom:8}},'No FOB Data Loaded'),
      div({style:{fontSize:'11px',marginBottom:16,lineHeight:1.6}},'Load an Operations Report file. The FOB sheet is parsed automatically.'),
      btn({className:'btn btn-sm',onClick:onClose},'Close')));

  return div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.82)',zIndex:450,display:'flex',flexDirection:'column',paddingTop:20}},
    div({style:{flex:'0 0 20px',cursor:'pointer'},onClick:onClose}),
    div({style:{flex:1,background:'var(--surf)',maxWidth:1100,margin:'0 auto',width:'calc(100% - 32px)',
      borderRadius:'var(--rl) var(--rl) 0 0',display:'flex',flexDirection:'column',overflow:'hidden',
      boxShadow:'0 -8px 40px rgba(0,0,0,.4)'}},
      // ── Title bar ──────────────────────────────────────────────────
      div({style:{padding:'10px 16px',borderBottom:'.5px solid var(--bdr)',flexShrink:0,
        background:'var(--surf2)',display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}},
        div({style:{fontSize:'14px',fontWeight:800,color:'var(--text)'}},'🥗 FOB Analysis'),
        // Month selector
        div({style:{display:'flex',flexDirection:'column',gap:1}},
          div({style:{fontSize:'7.5px',color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.4px'}},'Period'),
          h('select',{value:selMonth,onChange:e=>{setSelMonth(e.target.value);setExpandedRow(null);},
            style:{background:'var(--surf3)',border:'.5px solid var(--bdr)',borderRadius:'var(--r)',
              color:'var(--text)',fontSize:'10px',padding:'3px 8px'}},
            months.map(m=>h('option',{key:m,value:m},monthLabel(m))))),
        // Location selector
        div({style:{display:'flex',flexDirection:'column',gap:1}},
          div({style:{fontSize:'7.5px',color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.4px'}},'Location'),
          h('select',{value:selLoc,onChange:e=>{setSelLoc(e.target.value);setExpandedRow(null);},
            style:{background:'var(--surf3)',border:'.5px solid var(--bdr)',borderRadius:'var(--r)',
              color:'var(--text)',fontSize:'10px',padding:'3px 8px',maxWidth:200}},
            h('option',{value:'all'},'All Locations ('+allLocs.length+')'),
            h('option',{value:'ok'},'MCDOK — OK ('+okLocs.length+')'),
            h('option',{value:'fl'},'Emerald Arches — FL ('+flLocs.length+')'),
            allLocs.map(l=>h('option',{key:l,value:l},sNameC(l))))),
        div({style:{marginLeft:'auto',display:'flex',gap:6}},
          h(ExportDropdown,{
            title:'FOB Analysis — '+(selLoc==='all'?'All Locations':selLoc==='ok'?'MCDOK (OK)':selLoc==='fl'?'Emerald Arches (FL)':(STORE_NAMES[selLoc]||selLoc))+(selMonth?' · '+selMonth:''),
            filename:'fob_analysis_'+(selMonth||'all')+'_'+new Date().toISOString().slice(0,10),
            rows:(metrics&&metrics.byLoc?metrics.byLoc.map(s=>({
              Store: String(s.loc)+' — '+(STORE_NAMES[s.loc]||s.loc),
              'FOB %': s.fobPct!=null?((s.fobPct*100).toFixed(1)+'%'):'—',
              'FC %': s.fcPct!=null?((s.fcPct*100).toFixed(1)+'%'):'—',
              'Debit %': s.debitPct!=null?((s.debitPct*100).toFixed(1)+'%'):'—',
              'Credit %': s.creditPct!=null?((s.creditPct*100).toFixed(1)+'%'):'—',
              'MOP %': s.mopPct!=null?((s.mopPct*100).toFixed(1)+'%'):'—',
              'Kiosk %': s.kioskPct!=null?((s.kioskPct*100).toFixed(1)+'%'):'—',
            })):[]),
          }),
          btn({className:'btn btn-sm',style:{color:'var(--text3)'},onClick:onClose},'✕'))
      ),
      // ── KPI cards ──────────────────────────────────────────────────
      kpiCards(),
      // ── Contributors table ──────────────────────────────────────────
      !metrics?div({style:{flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text3)',fontSize:'11px'}},
        'No FOB data for '+monthLabel(selMonth)+(selLoc!=='all'?' · '+sNameC(selLoc):'')):
      div({style:{flex:1,overflowY:'auto',padding:'0 0 20px'}},
        // Instruction note
        div({style:{padding:'6px 16px',fontSize:'8.5px',color:'var(--text3)',borderBottom:'.5px solid var(--bdr)',
          background:'rgba(255,255,255,.02)',display:'flex',gap:12}},
          span(null,'Click any row to expand location breakdown.'),
          span(null,'Difference % = Actual − Target. Positive = over target (unfavorable for cost items). Green = under target.'),
          span({style:{marginLeft:'auto'}},selLoc==='all'?'District weighted average by sales':selLoc==='ok'?'MCDOK — OK weighted average by sales':selLoc==='fl'?'Emerald Arches — FL weighted average by sales':'Per-location result for '+sNameC(selLoc))
        ),
        h('table',{style:{width:'100%',borderCollapse:'collapse',fontSize:'9px'}},
          h('thead',null,h('tr',null,
            ...['Category','Target %','Actual %','Actual $','Difference %','Difference $','Status',''].map((l,j)=>
              th({key:j,style:{...thS,textAlign:j===0?'left':'right',paddingLeft:j===0?16:8}},l)))),
          h('tbody',null,...FOB_COMP.flatMap((c,i)=>fobRow(c,i)).filter(Boolean)),
          h('tfoot',null,tr(null,td({colSpan:8,style:{padding:'6px 16px',fontSize:'8px',color:'var(--text3)',
            borderTop:'.5px solid rgba(255,255,255,.08)',fontStyle:'italic'}},
            'Difference $ = (Actual% − Target%) × Net Sales. Negative = favorable (money below target). Positive = unfavorable (over target).')))
        )
      )
    )
  );
}

// FORECAST ACCURACY REPORT — Session 3
// Per-store, per-model MAPE backtest over any period.
// Models: LY Adjusted | AI Forecast | Simple Blend | Dialed-In (if calibrated)
// Data: ds.laborRows (actuals) × forecastDay() (model outputs)
function ForecastAccuracyPanel({stores, ds, settings, userEvents, onClose}) {
  const [selPeriod, setSelPeriod] = React.useState('6wk');
  const [cStart, setCStart] = React.useState('');
  const [cEnd, setCEnd] = React.useState('');
  const [selLoc, setSelLoc] = React.useState('all');
  const [running, setRunning] = React.useState(false);
  const [prog, setProg] = React.useState(0);
  const [tot, setTot] = React.useState(0);
  const [results, setResults] = React.useState(null);
  const [expandDow, setExpandDow] = React.useState(false);
  const [sortCol, setSortCol] = React.useState('ai');
  const cancelRef = React.useRef(false);

  const allLocs = React.useMemo(()=>(stores||[]).filter(s=>/^\d+$/.test(s.loc)).map(s=>s.loc),[stores]);
  const today = new Date();
  const addD2 = (d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x;};

  const PERIODS = [
    {id:'2wk', l:'2 Weeks',    fn:()=>({s:addD2(today,-14),e:today})},
    {id:'4wk', l:'4 Weeks',    fn:()=>({s:addD2(today,-28),e:today})},
    {id:'6wk', l:'6 Weeks',    fn:()=>({s:addD2(today,-42),e:today})},
    {id:'3m',  l:'3 Months',   fn:()=>({s:addD2(today,-90),e:today})},
    {id:'6m',  l:'6 Months',   fn:()=>({s:addD2(today,-180),e:today})},
    {id:'ytd', l:'YTD',        fn:()=>({s:new Date(today.getFullYear(),0,1),e:today})},
    {id:'lm',  l:'Last Month', fn:()=>({s:new Date(today.getFullYear(),today.getMonth()-1,1),e:new Date(today.getFullYear(),today.getMonth(),0)})},
    {id:'ly',  l:'Last Year',  fn:()=>({s:new Date(today.getFullYear()-1,0,1),e:new Date(today.getFullYear()-1,11,31)})},
    {id:'custom',l:'Custom',   fn:()=>({s:new Date(cStart+'T00:00:00'),e:new Date(cEnd+'T00:00:00')})},
  ];
  const curP = PERIODS.find(p=>p.id===selPeriod)||PERIODS[2];

  const mapeCol = v=>v==null?'var(--text3)':v<5?'#10b981':v<8?'#f59e0b':'#ef4444';
  const mapeFmt = v=>v==null?'—':v.toFixed(1)+'%';
  const avg = arr=>arr.length?arr.reduce((a,b)=>a+b,0)/arr.length:null;
  const DOW_NAMES=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const MODELS = [
    {key:'ly',  label:'LY Adjusted', col:'#94a3b8', desc:'Pure LY ×holiday adj'},
    {key:'ai',  label:'AI Forecast',  col:'#60a5fa', desc:'Full model: trend+ops+weather+events — or AE/EWMA when assigned (see badge)'},
    {key:'blend',label:'Blend',       col:'#34d399', desc:'Simple avg of LY and AI'},
    {key:'di',  label:'Dialed-In',    col:'#f5bc00', desc:'DI calibration backtested fresh over this date range'},
  ];

  const runBacktest = React.useCallback(async ()=>{
    cancelRef.current=false;
    setRunning(true);setResults(null);setProg(0);setTot(0);
    const range=curP.fn();
    if(!range.s||!range.e||isNaN(range.s.getTime())||isNaN(range.e.getTime())||range.s>range.e){
      alert('Invalid date range.');setRunning(false);return;
    }
    const locs=selLoc==='all'?allLocs:[selLoc];
    // Guarded ds?.laborRows (was unguarded ds.laborRows) — crashed with
    // "Cannot read properties of null (reading 'laborRows')" when Run
    // Backtest is clicked before any data is loaded. Confirmed pre-existing
    // in the v4.194 baseline, found during today's testing, not introduced
    // by the DI live-backtest fix below. Same class of bug as the documented
    // ds?.laborRows fix elsewhere in the app (v5.37a).
    const rows=(ds?.laborRows||[]).filter(r=>
      r.date>=range.s&&r.date<=range.e&&r.sales>100&&!r.isFuture&&
      locs.includes(String(r.loc))
    ).sort((a,b)=>a.date-b.date);
    if(!rows.length){alert('No completed sales records in this period.');setRunning(false);return;}
    setTot(rows.length);

    // acc[loc] = {ly:[], ai:[], blend:[], di:[], by dow}
    const acc={};
    const aiModelTally={}; // loc -> {ae:n, ewma:n, dow:n, di:n} — which model actually
    // produced the "AI Forecast" number per row. Closes a known open finding:
    // when assigned 'ae', forecastDay short-circuits and returns AE's number
    // as .forecast directly — previously silently folded into "AI Forecast"
    // with zero way to tell from this report that AE (not the standard DOW-
    // trend composite) produced it. Tallied per-row rather than assumed
    // constant per-store, since assignments could in principle change mid-
    // backtest-window even though that's rare in practice.
    locs.forEach(loc=>{acc[String(loc)]={ly:[],ai:[],blend:[],di:[]};aiModelTally[String(loc)]={};});

    const CHUNK=40;
    for(let i=0;i<rows.length;i+=CHUNK){
      if(cancelRef.current) break;
      rows.slice(i,i+CHUNK).forEach(r=>{
        try{
          const ls=String(r.loc);
          const t=(settings.targets&&settings.targets[ls])||DEFAULT_TARGETS[ls]||{};
          const f=forecastDay(ls,r.date,ds,{...settings,_userEvents:userEvents},null,t);
          if(!f||f.isFuture||r.sales<=0) return;
          if(f.modelUsed){
            aiModelTally[ls][f.modelUsed]=(aiModelTally[ls][f.modelUsed]||0)+1;
          }
          const act=r.sales;
          const lyE=f.lyAdj>0?Math.abs(act-f.lyAdj)/act*100:null;
          const aiE=f.forecast>0?Math.abs(act-f.forecast)/act*100:null;
          const blE=(f.lyAdj>0&&f.forecast>0)?Math.abs(act-(f.lyAdj+f.forecast)/2)/act*100:null;
          const dow=r.date.getDay();
          if(!acc[ls]) return;
          if(lyE!=null&&lyE<150){acc[ls].ly.push({v:lyE,dow});}
          if(aiE!=null&&aiE<150){acc[ls].ai.push({v:aiE,dow});}
          if(blE!=null&&blE<150){acc[ls].blend.push({v:blE,dow});}
          // Live DI backtest (v4.195) — previously this report read a stale
          // calibration-time snapshot (settings.dialedIn[loc].mape6w) instead
          // of freshly backtesting DI over the SAME selected window as LY/AI/
          // Blend above, making "Blend is winning district-wide" comparisons
          // apples-to-oranges per the known open finding. Gated behind
          // dialedInEnabled + this store actually having calibration data,
          // to avoid doubling forecastDay calls district-wide when DI isn't
          // even in use.
          if(settings.dialedInEnabled&&settings.dialedIn&&settings.dialedIn[ls]){
            const fDI=forecastDay(ls,r.date,ds,{...settings,_userEvents:userEvents},null,t,null,'di');
            const diE=fDI&&fDI.forecast>0?Math.abs(act-fDI.forecast)/act*100:null;
            if(diE!=null&&diE<150){acc[ls].di.push({v:diE,dow});}
          }
        }catch(e){}
      });
      setProg(Math.min(i+CHUNK,rows.length));
      await new Promise(res=>setTimeout(res,0));
    }
    if(cancelRef.current){setRunning(false);return;}

    // Build per-store results
    const byStore={};
    locs.forEach(loc=>{
      const ls=String(loc);
      const d=acc[ls]||{ly:[],ai:[],blend:[],di:[]};
      // diM now freshly backtested over the selected window (see loop above),
      // not a stale calibration-time snapshot. Falls back to the old static
      // settings.dialedIn[ls] read only if DI was disabled/uncalibrated for
      // this store (so the column doesn't just go blank for stores that
      // were never under live consideration this run).
      const diStatic=settings.dialedIn&&settings.dialedIn[ls];
      const diM=d.di.length ? avg(d.di.map(x=>x.v)) : (diStatic?(diStatic.mape6w??diStatic.mape4w??diStatic.mape):null);
      const lyM=avg(d.ly.map(x=>x.v));
      const aiM=avg(d.ai.map(x=>x.v));
      const blM=avg(d.blend.map(x=>x.v));
      const candidates=[['LY Adjusted',lyM],['AI Forecast',aiM],['Blend',blM]];
      if(diM!=null) candidates.push(['Dialed-In',diM]);
      const valid=candidates.filter(([,v])=>v!=null);
      const best=valid.length?valid.reduce((a,b)=>a[1]<b[1]?a:b)[0]:'—';
      // Dominant model behind the "AI Forecast" number for this store —
      // resolved from the per-row tally rather than assumed, in case an
      // assignment changed mid-window. Ties broken by whichever was tallied
      // first (Object.entries preserves insertion order); rare in practice.
      const tally=aiModelTally[ls]||{};
      const tallyEntries=Object.entries(tally);
      const aiModelUsed=tallyEntries.length
        ? tallyEntries.reduce((a,b)=>b[1]>a[1]?b:a)[0]
        : null;
      // DOW breakdown
      const dowRows=Array.from({length:7},(_,dow)=>{
        const f=(arr,dw)=>{const x=arr.filter(z=>z.dow===dw);return x.length?avg(x.map(z=>z.v)):null;};
        const lyD=f(d.ly,dow),aiD=f(d.ai,dow),blD=f(d.blend,dow);
        const cands=[['LY',lyD],['AI',aiD],['Blend',blD]].filter(([,v])=>v!=null);
        const bestD=cands.length?cands.reduce((a,b)=>a[1]<b[1]?a:b)[0]:'—';
        return{dow,ly:lyD,ai:aiD,blend:blD,best:bestD};
      });
      byStore[ls]={lyMape:lyM,aiMape:aiM,blendMape:blM,diMape:diM,best,dayCount:d.ai.length,dowRows,aiModelUsed};
    });

    // District aggregates
    const allLY=locs.flatMap(l=>(acc[String(l)]?.ly||[]));
    const allAI=locs.flatMap(l=>(acc[String(l)]?.ai||[]));
    const allBL=locs.flatMap(l=>(acc[String(l)]?.blend||[]));
    const allDI=locs.flatMap(l=>(acc[String(l)]?.di||[]));
    const distLY=avg(allLY.map(x=>x.v)),distAI=avg(allAI.map(x=>x.v)),distBL=avg(allBL.map(x=>x.v));
    // distDI now aggregated from the SAME live per-row backtest collected in
    // the loop above (allDI), matching exactly how LY/AI/Blend are aggregated
    // — fixes the apples-to-oranges comparison flagged as a known open
    // finding (district-wide "Blend is winning" was being compared against
    // a stale DI calibration-time snapshot, not a freshly backtested number
    // over the same selected window). Falls back to the static per-store
    // snapshot only if zero rows had live DI data this run (e.g. DI disabled
    // district-wide), so the district card doesn't just go blank.
    const distDI = allDI.length ? avg(allDI.map(x=>x.v)) : (()=>{
      const diVals=locs.map(l=>{const d=settings.dialedIn&&settings.dialedIn[String(l)];return d?(d.mape6w??d.mape4w??d.mape):null;}).filter(v=>v!=null);
      return diVals.length?avg(diVals):null;
    })();
    const distCands=[['LY Adjusted',distLY],['AI Forecast',distAI],['Blend',distBL]];
    if(distDI!=null) distCands.push(['Dialed-In',distDI]);
    const distBest=distCands.filter(([,v])=>v!=null).reduce((a,b)=>a[1]<b[1]?a:b,['—',999])[0];

    // Best model by DOW (district-wide)
    const dowBest=Array.from({length:7},(_,dow)=>{
      const f=(arr,dw)=>{const x=arr.filter(z=>z.dow===dw);return x.length?avg(x.map(z=>z.v)):null;};
      const lyD=f(allLY,dow),aiD=f(allAI,dow),blD=f(allBL,dow);
      const cands=[['LY',lyD],['AI',aiD],['Blend',blD]].filter(([,v])=>v!=null);
      return{dow,ly:lyD,ai:aiD,blend:blD,best:cands.length?cands.reduce((a,b)=>a[1]<b[1]?a:b)[0]:'—'};
    });

    const rl=range.s.toLocaleDateString('en-US',{month:'short',day:'numeric'})+'\u2013'+range.e.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
    setResults({byStore,dist:{ly:distLY,ai:distAI,blend:distBL,di:distDI,best:distBest},
      dowBest,totalDays:rows.length,locCount:locs.length,periodLabel:curP.l,rangeLabel:rl});
    setRunning(false);
  },[selPeriod,selLoc,allLocs,ds,settings,curP,cStart,cEnd]);

  // Sorted stores for display
  const sorted=results?[...allLocs.filter(l=>results.byStore[String(l)])].sort((a,b)=>{
    const get=l=>results.byStore[String(l)]?.[sortCol==='ly'?'lyMape':sortCol==='blend'?'blendMape':sortCol==='di'?'diMape':'aiMape']??999;
    return get(a)-get(b);
  }):[];

  // Export CSV
  const exportCSV=()=>{
    if(!results) return;
    const hdr=['Store#','Store Name','Days','LY Adj MAPE','AI Forecast MAPE','AI Model Used','Blend MAPE','Dialed-In MAPE','Best Model'];
    const rows=sorted.map(loc=>{
      const s=results.byStore[String(loc)];
      const nm=sNameC(String(loc));
      return[loc,nm,s.dayCount,
        s.lyMape!=null?s.lyMape.toFixed(2)+'%':'—',
        s.aiMape!=null?s.aiMape.toFixed(2)+'%':'—',
        s.aiModelUsed&&s.aiModelUsed!=='dow'?(MODEL_CODE_LABELS[s.aiModelUsed]||s.aiModelUsed):'DOW Trend',
        s.blendMape!=null?s.blendMape.toFixed(2)+'%':'—',
        s.diMape!=null?s.diMape.toFixed(2)+'%':'—',
        s.best];
    });
    const csv=[hdr,...rows].map(r=>r.map(v=>'"'+String(v||'').replace(/"/g,'""')+'"').join(',')).join('\n');
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
    a.download='ForecastAccuracy_'+curP.l.replace(/\s/g,'_')+'_'+new Date().toISOString().slice(0,10)+'.csv';
    a.click();
  };

  const thS={fontSize:'8px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.5px',
    color:'var(--text3)',padding:'5px 8px',textAlign:'right',borderBottom:'.5px solid var(--bdr)',
    background:'var(--mid2)',whiteSpace:'nowrap',cursor:'pointer',userSelect:'none'};

  // SVG bar chart
  const renderChart=()=>{
    if(!results||sorted.length===0) return null;
    const bW=20,gW=2,grp=8,nB=3;
    const sW=nB*(bW+gW)+grp;
    const W=sorted.length*sW+30,H=80;
    const allVals=sorted.flatMap(l=>{const s=results.byStore[String(l)];return[s.lyMape,s.aiMape,s.blendMape].filter(v=>v!=null);});
    const maxV=Math.max(15,...allVals);
    const bH=v=>v!=null?Math.max(2,(v/maxV)*(H-24)):0;
    const COLS=['#94a3b8','#60a5fa','#34d399'];
    return h('svg',{viewBox:'0 0 '+(W+4)+' '+(H+16),style:{width:'100%',maxHeight:110,overflow:'visible'}},
      // Guide lines
      ...[5,10].map(pct=>{
        if(pct>maxV) return null;
        const y=(H-24)-(bH(pct));
        return h('g',{key:'line'+pct},
          h('line',{x1:0,y1:y,x2:W,y2:y,stroke:pct===5?'rgba(16,185,129,.35)':'rgba(239,68,68,.35)',strokeWidth:.5,strokeDasharray:'3,2'}),
          h('text',{x:2,y:y-2,fontSize:7,fill:pct===5?'#10b981':'#ef4444'},pct+'%'));
      }),
      sorted.map((loc,si)=>{
        const s=results.byStore[String(loc)];if(!s) return null;
        const x=si*sW+15;
        const nm=(()=>{const n=sNameC(String(loc));return n.split(' ').slice(0,2).join(' ');})();
        return h('g',{key:loc},
          [s.lyMape,s.aiMape,s.blendMape].map((v,bi)=>{
            if(v==null) return null;
            const bx=x+bi*(bW+gW),bh=bH(v),by=H-24-bh;
            return h('g',{key:bi},
              h('rect',{x:bx,y:by,width:bW,height:bh,rx:2,fill:COLS[bi],fillOpacity:.75}),
              bh>14&&h('text',{x:bx+bW/2,y:by+bh/2+3,textAnchor:'middle',fontSize:6.5,fill:'rgba(255,255,255,.9)',fontWeight:'700'},v.toFixed(1)+'%'));
          }),
          h('text',{x:x+sW/2-grp/2,y:H-10,textAnchor:'middle',fontSize:6.5,fill:'rgba(255,255,255,.45)'},nm)
        );
      }),
      // Legend
      h('g',{transform:'translate(8,'+(H+6)+')'},
        MODELS.slice(0,3).map((m,i)=>h('g',{key:m.key,transform:'translate('+(i*80)+',0)'},
          h('rect',{x:0,y:-5,width:8,height:5,rx:1,fill:m.col,fillOpacity:.75}),
          h('text',{x:11,y:0,fontSize:6.5,fill:'rgba(255,255,255,.5)'},m.label)))
      )
    );
  };

  return div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.82)',zIndex:450,display:'flex',flexDirection:'column',paddingTop:16}},
    div({style:{flex:'0 0 16px',cursor:'pointer'},onClick:onClose}),
    div({style:{flex:1,background:'var(--surf)',maxWidth:1100,margin:'0 auto',width:'calc(100% - 32px)',
      borderRadius:'var(--rl) var(--rl) 0 0',display:'flex',flexDirection:'column',overflow:'hidden',
      boxShadow:'0 -8px 40px rgba(0,0,0,.4)'}},

      // ── Title bar ─────────────────────────────────────────────────
      div({style:{padding:'10px 16px',borderBottom:'.5px solid var(--bdr)',flexShrink:0,
        background:'var(--surf2)',display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}},
        div({style:{flex:1}},
          div({style:{fontSize:'14px',fontWeight:800,color:'var(--text)'}},'🎯 Forecast Accuracy Report'),
          div({style:{fontSize:'8px',color:'var(--text3)',marginTop:2}},'Backtest each model against completed actuals. Lower MAPE = more accurate. Green <5% · Yellow 5-8% · Red >8%.')),
        results&&btn({className:'btn btn-sm',style:{color:'#10b981',borderColor:'rgba(16,185,129,.3)'},onClick:exportCSV},'⬇ Export CSV'),
        btn({className:'btn btn-sm',style:{color:'var(--text3)'},onClick:onClose},'✕')
      ),

      // ── Controls ───────────────────────────────────────────────────
      div({style:{padding:'8px 16px',borderBottom:'.5px solid var(--bdr)',flexShrink:0,
        background:'rgba(255,255,255,.02)',display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}},
        // Period presets
        div({style:{display:'flex',gap:3,flexWrap:'wrap'}},
          PERIODS.filter(p=>p.id!=='custom').map(p=>btn({key:p.id,className:'btn btn-sm',
            style:{fontSize:'9px',fontWeight:selPeriod===p.id?700:400,
              background:selPeriod===p.id?'rgba(245,188,0,.12)':'transparent',
              color:selPeriod===p.id?'var(--gold)':'var(--text3)',
              borderColor:selPeriod===p.id?'rgba(245,188,0,.4)':'rgba(255,255,255,.1)'},
            onClick:()=>setSelPeriod(p.id)},p.l))),
        btn({className:'btn btn-sm',style:{fontSize:'9px',
          background:selPeriod==='custom'?'rgba(245,188,0,.12)':'transparent',
          color:selPeriod==='custom'?'var(--gold)':'var(--text3)',
          borderColor:selPeriod==='custom'?'rgba(245,188,0,.4)':'rgba(255,255,255,.1)'},
          onClick:()=>setSelPeriod('custom')},'Custom'),
        selPeriod==='custom'&&div({style:{display:'flex',gap:6,alignItems:'center',fontSize:'9px',color:'var(--text3)'}},
          h('input',{type:'date',value:cStart,onChange:e=>setCStart(e.target.value),
            style:{background:'var(--surf3)',border:'.5px solid var(--bdr)',borderRadius:'var(--r)',color:'var(--text)',fontSize:'9px',padding:'2px 5px'}}),
          span(null,'to'),
          h('input',{type:'date',value:cEnd,onChange:e=>setCEnd(e.target.value),
            style:{background:'var(--surf3)',border:'.5px solid var(--bdr)',borderRadius:'var(--r)',color:'var(--text)',fontSize:'9px',padding:'2px 5px'}})),
        h('select',{value:selLoc,onChange:e=>setSelLoc(e.target.value),
          style:{background:'var(--surf3)',border:'.5px solid var(--bdr)',borderRadius:'var(--r)',
            color:'var(--text)',fontSize:'9px',padding:'3px 6px',marginLeft:8}},
          h('option',{value:'all'},'All Locations ('+allLocs.length+')'),
          allLocs.map(l=>h('option',{key:l,value:l},sNameC(l)))),
        div({style:{marginLeft:'auto',display:'flex',gap:8,alignItems:'center'}},
          running&&btn({className:'btn btn-sm',style:{color:'#f87171',borderColor:'rgba(248,113,113,.3)'},
            onClick:()=>{cancelRef.current=true;}},'✕ Cancel'),
          btn({className:'btn btn-sm btn-a',style:{fontWeight:700,fontSize:'10px',padding:'4px 14px'},
            disabled:running,
            onClick:running?null:runBacktest},
            running?'Running...':'▶ Run Backtest'))
      ),

      // ── Progress bar ───────────────────────────────────────────────
      running&&div({style:{flexShrink:0,padding:'6px 16px',background:'rgba(245,188,0,.04)',borderBottom:'.5px solid var(--bdr)'}},
        div({style:{display:'flex',justifyContent:'space-between',fontSize:'8px',color:'var(--text3)',marginBottom:4}},
          span(null,'Computing '+curP.l+' backtest…'),
          span(null,prog+' / '+tot+' records'+(tot>0?' ('+Math.round(prog/tot*100)+'%)':''))),
        div({style:{height:4,background:'var(--surf3)',borderRadius:2,overflow:'hidden'}},
          div({style:{height:'100%',background:'var(--gold)',borderRadius:2,width:(tot>0?(prog/tot*100):0)+'%',transition:'width .15s'}}))
      ),

      // ── Results ─────────────────────────────────────────────────────
      !results&&!running&&div({style:{flex:1,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:12,color:'var(--text3)'}},
        div({style:{fontSize:40}},'📊'),
        div({style:{fontSize:'13px',fontWeight:600,color:'var(--text)'}},'Select a period and run the backtest'),
        div({style:{fontSize:'10px',textAlign:'center',maxWidth:400,lineHeight:1.6}},'The backtest computes each model\'s accuracy against completed actuals in the selected period. Longer periods provide more reliable MAPE estimates but take more time to compute.')),

      results&&div({style:{flex:1,overflowY:'auto',padding:'0 0 24px'}},

        // ── District summary cards ───────────────────────────────────
        div({style:{display:'flex',gap:8,padding:'10px 16px',borderBottom:'.5px solid var(--bdr)',flexWrap:'wrap',background:'var(--surf2)'}},
          ...[
            {label:'Best Model (District)',val:results.dist.best,col:'var(--gold)',bg:'rgba(245,188,0,.06)'},
            {label:'AI Forecast MAPE',    val:mapeFmt(results.dist.ai),  col:mapeCol(results.dist.ai),   bg:results.dist.ai<5?'rgba(16,185,129,.06)':results.dist.ai<8?'rgba(245,158,11,.06)':'rgba(239,68,68,.06)'},
            {label:'LY Adjusted MAPE',    val:mapeFmt(results.dist.ly),  col:mapeCol(results.dist.ly),   bg:'rgba(255,255,255,.02)'},
            {label:'Blend MAPE',          val:mapeFmt(results.dist.blend),col:mapeCol(results.dist.blend),bg:'rgba(255,255,255,.02)'},
            results.dist.di!=null&&{label:'Dialed-In MAPE',val:mapeFmt(results.dist.di),col:mapeCol(results.dist.di),bg:'rgba(245,188,0,.04)'},
            {label:'Period / Records',val:results.periodLabel,sub:results.rangeLabel+' · '+results.totalDays.toLocaleString()+' days',col:'#a5b4fc',bg:'rgba(165,180,252,.04)'},
          ].filter(Boolean).map((k,i)=>div({key:i,style:{flex:'1 1 130px',minWidth:120,background:k.bg,border:'.5px solid var(--bdr)',borderRadius:6,padding:'7px 10px'}},
            div({style:{fontSize:'8px',textTransform:'uppercase',letterSpacing:'.4px',color:'var(--text3)',marginBottom:3}},k.label),
            div({style:{fontSize:'14px',fontWeight:800,fontFamily:'var(--mono)',color:k.col}},k.val),
            k.sub&&div({style:{fontSize:'8px',color:'var(--text3)',marginTop:1}},k.sub)))
        ),

        // ── Bar chart ───────────────────────────────────────────────
        div({style:{padding:'10px 16px 4px',borderBottom:'.5px solid var(--bdr)'}},
          div({style:{fontSize:'8px',color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.5px',marginBottom:6}},'MAPE by Store — Sorted Best to Worst (AI Forecast) · Horizontal guides at 5% and 10%'),
          renderChart()
        ),

        // ── Detail table ─────────────────────────────────────────────
        div({style:{padding:'0 0 8px'}},
          div({style:{padding:'6px 16px',fontSize:'8px',color:'var(--text3)',display:'flex',gap:12,alignItems:'center',borderBottom:'.5px solid var(--bdr)',background:'var(--surf2)'}},
            span({style:{fontWeight:700,color:'var(--text)'}},sorted.length+' locations'),
            span(null,'Click column headers to sort · Best model per row highlighted in gold'),
            div({style:{marginLeft:'auto',display:'flex',gap:6}},
              span(null,'Sort by:'),
              ...[['ai','AI'],['ly','LY Adj'],['blend','Blend'],['di','DI']].map(([k,l])=>
                span({key:k,style:{cursor:'pointer',fontWeight:sortCol===k?700:400,
                  color:sortCol===k?'var(--gold)':'var(--text3)',padding:'0 4px'},
                  onClick:()=>setSortCol(k)},l))
            )
          ),
          h('table',{style:{width:'100%',borderCollapse:'collapse',fontSize:'9px'}},
            h('thead',null,h('tr',null,
              th({style:{...thS,textAlign:'left',paddingLeft:16}},'Store'),
              th({style:{...thS,textAlign:'center'}},'Days'),
              ...MODELS.map(m=>th({key:m.key,style:{...thS,color:sortCol===m.key?m.col:'var(--text3)'},
                onClick:()=>setSortCol(m.key)},m.label+' ▾')),
              th({style:{...thS,textAlign:'center',color:'var(--gold)'}},'Best Model')
            )),
            h('tbody',null, sorted.map((loc,i)=>{
              const s=results.byStore[String(loc)];if(!s) return null;
              const nm=sNameC(String(loc));
              const vals={ly:s.lyMape,ai:s.aiMape,blend:s.blendMape,di:s.diMape};
              return tr({key:loc,style:{borderBottom:'.5px solid rgba(255,255,255,.04)',background:i%2?'rgba(255,255,255,.015)':'transparent'}},
                td({style:{padding:'5px 8px 5px 16px',fontWeight:600,color:'var(--gold)'}},''+nm),
                td({style:{padding:'5px 8px',textAlign:'center',fontFamily:'var(--mono)',color:'var(--text3)',fontSize:'8px'}},''+s.dayCount),
                ...MODELS.map(m=>{
                  const v=vals[m.key];
                  const isBest=s.best===m.label;
                  // Model-used badge — AI Forecast column only (v4.195).
                  // Previously this column gave zero indication when a
                  // store's assignment routed through AE or EWMA's
                  // short-circuit in forecastDay rather than the standard
                  // DOW-trend composite; both silently looked identical here.
                  // Omitted for plain 'dow' (the unlabeled default) so the
                  // common case stays visually quiet.
                  const modelBadge = (m.key==='ai'&&s.aiModelUsed&&s.aiModelUsed!=='dow')
                    ? span({title:'AI Forecast for this store was produced by: '+(MODEL_CODE_LABELS[s.aiModelUsed]||s.aiModelUsed),
                        style:{fontSize:'6.5px',marginLeft:3,padding:'1px 3px',borderRadius:3,
                        background:'rgba(129,140,248,.18)',color:'#a5b4fc',fontWeight:700,verticalAlign:'middle'}},
                        s.aiModelUsed==='ae'?'🤖':s.aiModelUsed==='ewma'?'📈':s.aiModelUsed.toUpperCase())
                    : null;
                  return td({key:m.key,style:{padding:'5px 8px',textAlign:'right',fontFamily:'var(--mono)',fontWeight:isBest?800:400,
                    color:isBest?m.col:mapeCol(v),
                    background:isBest?m.col+'11':'transparent'}},
                    v!=null?h('span',null,mapeFmt(v),isBest&&h('sup',{style:{fontSize:'7px',marginLeft:2}},'★'),modelBadge):h('span',{style:{color:'var(--text3)'}},m.key==='di'?'Not calibrated':'—'));
                }),
                td({style:{padding:'5px 8px',textAlign:'center',fontWeight:700,fontSize:'8px',color:'var(--gold)'}},''+s.best)
              );
            }))
          )
        ),

        // ── Day-of-Week accuracy breakdown ───────────────────────────
        div({style:{borderTop:'.5px solid var(--bdr)'}},
          div({style:{padding:'8px 16px',display:'flex',alignItems:'center',gap:8,cursor:'pointer',background:'var(--surf2)'},
            onClick:()=>setExpandDow(v=>!v)},
            span({style:{fontSize:'9px',fontWeight:700,color:'var(--text)'}},(expandDow?'▲':'▶')+' Day-of-Week Accuracy Breakdown'),
            span({style:{fontSize:'8px',color:'var(--text3)'}},'Which model performs best for each day of the week — district-wide')),
          expandDow&&div({style:{overflowX:'auto'}},
            h('table',{style:{width:'100%',borderCollapse:'collapse',fontSize:'9px'}},
              h('thead',null,h('tr',null,
                th({style:{...thS,textAlign:'left',paddingLeft:16}},'Day'),
                ...MODELS.slice(0,3).map(m=>th({key:m.key,style:{...thS,color:m.col}},m.label)),
                th({style:{...thS,textAlign:'center',color:'var(--gold)'}},'Best')
              )),
              h('tbody',null, results.dowBest.map((dw,i)=>{
                const bestCol=dw.best==='AI'?'#60a5fa':dw.best==='LY'?'#94a3b8':dw.best==='Blend'?'#34d399':'var(--text)';
                return tr({key:i,style:{borderBottom:'.5px solid rgba(255,255,255,.04)',background:i%2?'rgba(255,255,255,.015)':'transparent'}},
                  td({style:{padding:'5px 8px 5px 16px',fontWeight:600,color:'var(--text)'}},''+DOW_NAMES[dw.dow]),
                  ...['ly','ai','blend'].map(k=>td({key:k,style:{padding:'5px 8px',textAlign:'right',fontFamily:'var(--mono)',
                    color:mapeCol(dw[k]),fontWeight:dw.best===(k==='ly'?'LY':k==='ai'?'AI':'Blend')?700:400}},mapeFmt(dw[k]))),
                  td({style:{padding:'5px 8px',textAlign:'center',fontWeight:700,color:bestCol}},''+dw.best)
                );
              }))
            )
          )
        )
      )
    )
  );
}

// OPS METRICS ANOMALY CROSS-CHECK  (v172)
// For each untagged anomaly, compare that day's operational metrics
// against the store's DOW historical baseline to identify likely causes.
// Returns signals (metric deviations) + a conclusion (ops vs external).
// Data sources: ds.ctrlRows (labor/tpph/actVsNeed), ds.opsRows (oepe/kvsu/park)
//               ds.laborRows (daily actuals for historical DOW baselines)
function computeOpsAnalysis(row, ds) {
  if(!ds||!row) return null;
  const loc = String(row.loc||'');
  const dt  = row.date instanceof Date ? row.date : new Date(row.date);
  const dow = dt.getDay();

  // ── Fetch the specific day's records ─────────────────────────────────
  const ctrlRow = fetchRow(ds.ctrlIdx,  loc, dt);
  const opsRow  = fetchRow(ds.opsIdx,   loc, dt);
  const labRow  = fetchRow(ds.laborIdx, loc, dt);
  const get = (obj,f) => obj&&obj[f]!=null&&obj[f]!==0 ? obj[f] : null;

  const dayLabor  = get(ctrlRow,'laborPct') || get(labRow,'laborPct');
  const dayTpph   = get(ctrlRow,'tpph')     || get(labRow,'tpph');
  const dayAvn    = ctrlRow?.actVsNeed != null ? ctrlRow.actVsNeed : (labRow?.actVsNeed != null ? labRow.actVsNeed : null);
  const dayActHrs = get(ctrlRow,'actHrs')   || get(labRow,'actHrs');
  const dayOepe   = get(opsRow,'oepe');
  const dayKvsu   = get(opsRow,'kvsu');

  const hasAnyData = dayLabor || dayTpph || dayOepe || dayActHrs || dayAvn != null;
  if(!hasAnyData) return {
    signals:[], conclusion:'No operational records found for this date.',
    conclusionType:'nodata', peerCount:0,
    note:'Load Shift Manager Summary covering this period for ops context.'
  };

  // ── DOW baselines (trimmed mean, data before this date) ──────────────
  const peerCtrl = (ds.ctrlRows||[]).filter(r=>r.loc===loc&&r.date.getDay()===dow&&r.sales>0&&r.date<dt);
  const peerLab  = (ds.laborRows||[]).filter(r=>r.loc===loc&&r.date.getDay()===dow&&r.sales>0&&r.date<dt);
  const peerOps  = (ds.opsRows||[]).filter( r=>r.loc===loc&&r.date.getDay()===dow&&r.date<dt);
  const allCtrl  = [...peerCtrl,...peerLab];
  const peerCount= Math.max(peerCtrl.length, peerLab.length);

  const trim = (arr,f) => {
    const v = arr.map(r=>r[f]).filter(v=>v!=null&&v>0).sort((a,b)=>a-b);
    if(!v.length) return null;
    if(v.length < 4) return v.reduce((a,b)=>a+b)/v.length;
    const cut = Math.max(1,Math.floor(v.length*.10));
    const t = v.slice(cut, v.length-cut);
    return t.reduce((a,b)=>a+b)/t.length;
  };

  const bl_labor  = trim(allCtrl, 'laborPct');
  const bl_tpph   = trim(allCtrl, 'tpph');
  const bl_actHrs = trim(allCtrl, 'actHrs');
  const bl_oepe   = trim(peerOps,  'oepe');
  const bl_kvsu   = trim(peerOps,  'kvsu');

  const dev = (d,b) => b>0 ? (d-b)/b : null;

  // ── KEY INSIGHT: ops metrics are DEMAND-DRIVEN ────────────────────────
  // OEPE/TPPH/Labor% are heavily influenced by sales volume.
  // On busy days, OEPE naturally worsens (more cars). On slow days it improves.
  // So the DIRECTION of the sales variance fundamentally changes how we
  // interpret each metric signal:
  //   • OEPE slower on a DOWN day  → genuine ops issue (no demand excuse)
  //   • OEPE slower on an UP day   → likely demand pressure (expected), only
  //                                   flag if extremely worse than sales delta
  //   • TPPH below baseline on DOWN day → real throughput problem (idle crew)
  //   • Act Hours below baseline   → direction-independent capacity signal
  const isDown = (row.varPct||0) < -4;  // meaningful negative variance
  const isUp   = (row.varPct||0) >  4;  // meaningful positive variance
  const salesDelta = Math.abs(row.varPct||0) / 100; // fractional sales shift

  const signals = [];
  const addSig = (metric,icon,dayVal,blVal,direction,impact,note) =>
    signals.push({metric,icon,dayVal,blVal,direction,impact,note});

  // ── OEPE ─────────────────────────────────────────────────────────────
  if(dayOepe && bl_oepe) {
    const d = dev(dayOepe, bl_oepe);
    if(d != null) {
      if(isDown && d > 0.10) {
        // Slow OEPE on a SLOW day = red flag — no volume excuse
        addSig('OEPE','⏱', Math.round(dayOepe)+'s', Math.round(bl_oepe)+'s', 'slow','negative',
          'Service was '+(d*100).toFixed(0)+'% slower than baseline on a below-average sales day — with fewer cars in line, OEPE should be faster. This suggests an equipment issue, staffing problem, or operational disruption independent of demand.');
      } else if(isDown && d < -0.12) {
        // Fast OEPE on a slow day — expected, but note it
        addSig('OEPE','⏱', Math.round(dayOepe)+'s', Math.round(bl_oepe)+'s', 'fast','informational',
          'Faster-than-normal service on a slow day — expected behavior with less demand pressure. Not a contributing factor.');
      } else if(isUp && d > 0.30) {
        // Extremely slow OEPE on a busy day — beyond what volume explains
        const expectedSlowdown = salesDelta * 0.40; // rough expected: 40% of sales delta
        if(d > expectedSlowdown + 0.15) {
          addSig('OEPE','⏱', Math.round(dayOepe)+'s', Math.round(bl_oepe)+'s', 'slow','warning',
            'Service '+(d*100).toFixed(0)+'% slower on a +'+(row.varPct||0).toFixed(0)+'% sales day — slowdown exceeds what volume alone explains. Possible operational bottleneck on top of demand pressure.');
        }
      }
      // Moderate OEPE slowdown on a busy day = expected/demand-driven → no signal
    }
  }

  // ── TPPH ──────────────────────────────────────────────────────────────
  if(dayTpph && bl_tpph) {
    const d = dev(dayTpph, bl_tpph);
    if(d != null) {
      if(isDown && d < -0.12) {
        // Low TPPH on a slow day = real problem — no volume to blame
        addSig('TPPH','📉', dayTpph.toFixed(1), bl_tpph.toFixed(1), 'low','negative',
          'Transaction rate '+(Math.abs(d)*100).toFixed(0)+'% below baseline despite lower-than-normal sales volume — throughput should be at least normal on a quiet day. Suggests crew efficiency or execution issue.');
      } else if(isUp && d > 0.12) {
        addSig('TPPH','📈', dayTpph.toFixed(1), bl_tpph.toFixed(1), 'high','positive',
          'Above-average throughput on a busy day — strong crew execution handled elevated volume efficiently.');
      } else if(isDown && d > 0.12) {
        addSig('TPPH','📈', dayTpph.toFixed(1), bl_tpph.toFixed(1), 'high','informational',
          'Higher throughput on a slow day — expected with less demand pressure. Normal.');
      }
    }
  }

  // ── Labor % ───────────────────────────────────────────────────────────
  if(dayLabor && bl_labor) {
    const diff = dayLabor - bl_labor;
    if(isDown && diff > 0.04) {
      // High labor% on a slow day = cost problem (labor fixed cost shows in lean revenue)
      addSig('Labor %','👥', (dayLabor*100).toFixed(1)+'%', (bl_labor*100).toFixed(1)+'%', 'over','cost',
        'Labor '+(diff*100).toFixed(1)+'pp above baseline on a below-average sales day — fixed labor costs are amplified when revenue is low. This compounds the financial impact of the sales shortfall.');
    } else if(diff < -0.04 && isDown) {
      // Low labor% on a slow day — could be aggressive cut or reduced hours
      addSig('Labor %','👥', (dayLabor*100).toFixed(1)+'%', (bl_labor*100).toFixed(1)+'%', 'under','informational',
        'Labor % below baseline on a slow day — may reflect appropriate staffing cuts or reduced operating hours.');
    } else if(isUp && diff > 0.05) {
      // High labor% on a big day — possibly not enough people to handle volume efficiently
      addSig('Labor %','👥', (dayLabor*100).toFixed(1)+'%', (bl_labor*100).toFixed(1)+'%', 'over','warning',
        'Labor cost elevated even on a strong sales day — crew may not have scaled to volume efficiently.');
    }
  }

  // ── Act Hours (most reliable direction-independent signal) ───────────
  if(dayActHrs && bl_actHrs) {
    const d = dev(dayActHrs, bl_actHrs);
    if(d != null && d < -0.28) {
      addSig('Act Hours','⏰', dayActHrs.toFixed(1)+' hrs', bl_actHrs.toFixed(1)+' hrs', 'low','negative',
        'Significantly fewer hours worked than typical for any '+ DOW_BASE[dow]+ ' — store likely operated reduced hours, had a late open, early close, or staffing emergency. This is a strong direct explanation for any sales shortfall.');
    } else if(d != null && d > 0.20 && isDown) {
      // Lots of hours on a slow day = overstaffed
      addSig('Act Hours','⏰', dayActHrs.toFixed(1)+' hrs', bl_actHrs.toFixed(1)+' hrs', 'high','cost',
        'More hours than typical on a below-average sales day — overstaffing amplifies the cost of a slow day.');
    }
  }

  // ── Act vs Need ───────────────────────────────────────────────────────
  if(dayAvn != null) {
    if(dayAvn < -80 && isDown) {
      // Short-staffed on a slow day = real issue
      addSig('Act vs Need','⚠️', dayAvn.toFixed(0)+' hrs', '0 target', 'short','negative',
        Math.abs(dayAvn).toFixed(0)+' hrs below scheduled need on a slow day — severe understaffing even when traffic was low suggests a staffing failure (call-outs, no-shows) that would have constrained the store\'s ability to serve customers.');
    } else if(dayAvn < -80 && isUp) {
      addSig('Act vs Need','⚠️', dayAvn.toFixed(0)+' hrs', '0 target', 'short','warning',
        Math.abs(dayAvn).toFixed(0)+' hrs below need on a BUSY day — the store may have been constrained from serving the volume available, limiting the sales upside.');
    } else if(dayAvn > 120) {
      addSig('Act vs Need','💰', '+'+dayAvn.toFixed(0)+' hrs', '0 target', 'over','cost',
        dayAvn.toFixed(0)+' hrs above scheduled need — significant excess labor cost.');
    }
  }

  // ── KVS Healthy Usage ─────────────────────────────────────────────────
  if(dayKvsu && bl_kvsu) {
    const d = dev(dayKvsu, bl_kvsu);
    if(d != null && d < -0.15) {
      addSig('KVS Usage','📺', (dayKvsu*100).toFixed(0)+'%', (bl_kvsu*100).toFixed(0)+'%', 'low','negative',
        'KVS healthy usage '+(Math.abs(d)*100).toFixed(0)+'% below typical — possible system issue or process breakdown. On a '+(isDown?'slow':'busy')+' day this '+(isDown?'amplifies any ops-related sales drag':'may have constrained throughput')+' .');
    }
  }

  // ── Conclusion ────────────────────────────────────────────────────────
  const neg = signals.filter(s=>s.impact==='negative');
  const pos = signals.filter(s=>s.impact==='positive');
  const inf = signals.filter(s=>s.impact==='informational');

  let conclusion, conclusionType, suggestedTag;
  if(neg.length === 0 && signals.filter(s=>s.impact!=='informational').length === 0) {
    if(isDown) {
      conclusion = 'No operational anomalies detected on a below-average sales day. Operational metrics were within normal range — the sales '+(row.varPct).toFixed(0)+'% deviation is consistent with an external factor (weather, local event, road closure, competitor promotion, or other traffic driver).';
    } else {
      conclusion = 'No operational red flags on this above-average sales day. Strong results with clean ops likely reflect external demand lift (local event, competitor closure, weather, promotional traffic).';
    }
    conclusionType = 'external';
    suggestedTag   = isDown ? 'weather / local event / tech issue / competitor' : 'local event / promotion / competitor closure';
  } else if(neg.length >= 2) {
    conclusion = 'Multiple operational issues on this date. The sales '+(row.varPct>=0?'performance':'shortfall')+' appears partially or fully ops-driven. Review staffing records and GM notes before tagging as an external event.';
    conclusionType = 'ops';
    suggestedTag   = 'ops issue — review with GM';
  } else if(neg.length === 1) {
    conclusion = ''+neg[0].metric+' was outside normal range. This may be a contributing factor to the sales variance. Consider whether it alone explains the deviation or if an external event also played a role.';
    conclusionType = 'mixed';
    suggestedTag   = 'mixed — partial ops factor';
  } else {
    conclusion = 'Positive operational signals on this date. '+(isUp?'Sales outperformance may be supported by strong crew execution.':'Worth noting the operational context.');
    conclusionType = 'positive';
    suggestedTag   = 'strong execution / note for record';
  }

  const peerKB = getKB(loc);  // merged: constant STORE_KB + any user edits
  return { signals, conclusion, conclusionType, suggestedTag, peerCount,
    hasOpsIssue: neg.length > 0,
    kbNote: peerKB.notes || null,
    kbTags: peerKB.tags || [] };
}

function AIBacktestScanner({stores, ds, settings, userEvents, onTagEvent}) {
  const [scanning,  setScanning]  = React.useState(false);
  // Load cached results from localStorage on mount
  const [results,   setResults]   = React.useState(()=>{
    try{
      const s=localStorage.getItem('mf_backtest_results');
      if(!s) return null;
      const parsed=JSON.parse(s,(_,v)=>typeof v==='string'&&/^\d{4}-/.test(v)?new Date(v):v);
      // CRITICAL: The JSON reviver above converts dKeyStr ('2026-04-15') → Date object.
      // This breaks tag lookups since events are stored with ISO string keys.
      // Post-process: ensure dKeyStr is always an ISO date string.
      if(parsed&&typeof parsed==='object'){
        for(const loc of Object.keys(parsed)){
          if(!Array.isArray(parsed[loc])) continue;
          for(const row of parsed[loc]){
            if(row.dKeyStr instanceof Date) row.dKeyStr=dKey(row.dKeyStr);
            else if(!row.dKeyStr&&row.date instanceof Date) row.dKeyStr=dKey(row.date);
          }
        }
      }
      return parsed;
    }catch{return null;}
  });
  const [progress,  setProgress]  = React.useState(0);
  const [selLoc,    setSelLoc]    = React.useState('all');
  const [sortBy,    setSortBy]    = React.useState('variance'); // 'variance' | 'date'
  const [tagPick,   setTagPick]   = React.useState(null);
  const [showHols,  setShowHols]  = React.useState(true);  // show/hide auto-tagged holidays
  const [tagFilter, setTagFilter] = React.useState('all'); // 'all'|'untagged'|'tagged'
  const [tagStores, setTagStores] = React.useState({}); // {rowKey: [loc,...]} selected stores per row
  const [threshold, setThreshold] = React.useState(8);    // % variance threshold
  const [aiResult,  setAiResult]  = React.useState({});   // loc+date → ai text
  const [aiLoading, setAiLoading] = React.useState({});
  // ── Batch AI scan state ─────────────────────────────────────────────────
  const [batchScanning, setBatchScanning] = React.useState(false);
  const [batchProg,     setBatchProg]     = React.useState({done:0,total:0,tagged:0,found:0});
  const [expandedTag,   setExpandedTag]   = React.useState(null); // key for expanded tag detail
  const [autoHolTagged, setAutoHolTagged] = React.useState(0);    // count of auto-tagged holidays last scan
  const [showEventEntry,setShowEventEntry] = React.useState(false);
  const [showEventRegistry,setShowEventRegistry] = React.useState(false); // manual event entry modal
  const cancelBatchRef = React.useRef(false);
  const [pendingRegional,setPendingRegional]=React.useState([]); // regional events awaiting review
  const [showRegional,setShowRegional]=React.useState(false);
  const [tagSelected,  setTagSelected]  = React.useState([]); // multi-select tag keys for open picker
  const [tagCustomNote,setTagCustomNote]= React.useState(''); // free-text note in tag picker
  const [scanTab,      setScanTab]      = React.useState('all'); // 'all'|'review'|'tagged'|'holidays'|'calendar'
  const [calMonth,     setCalMonth]     = React.useState(null); // null = auto most-recent
  const [opsOpen,      setOpsOpen]      = React.useState(new Set()); // keys with ops analysis visible
  const toggleOps = React.useCallback(k=>setOpsOpen(prev=>{const n=new Set(prev);n.has(k)?n.delete(k):n.add(k);return n;}),[]);
  const [filtersOpen,  setFiltersOpen]  = React.useState(false);  // unified filter panel
  const [dowFilter,    setDowFilter]    = React.useState([]);      // [] = all DOWs; else [0,1,2...] subset
  const DOW_LABELS = ['Su','Mo','Tu','We','Th','Fr','Sa'];
  const DOW_FULL   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  // Reset tag selections when a new row is opened for tagging
  React.useEffect(()=>{setTagSelected([]);setTagCustomNote('');},[tagPick]);
  const apiKey = (()=>{try{return localStorage.getItem('mf_anthropic_key')||'';}catch{return '';}})();
  // ── Batch AI auto-scan ────────────────────────────────────────────────────
  const lookupAnomalyForBatch = async (row) => {
    if(!apiKey||cancelBatchRef.current) return null;
    const key=row.loc+'_'+row.dateStr;
    const coords=STORE_COORDS[row.loc];
    const stateStr=coords&&coords.state==='FL'?'Florida':'Oklahoma';
    const cityRaw=STORE_NAMES[row.loc]||row.loc;
    const city=coords?coords.city:(cityRaw.replace(/[^a-zA-Z0-9\s,]/g,'').split('-').pop().trim());
    const dir=row.varPct<0?'UNDER':'OVER';
    const prompt='Investigate McDonald\'s sales anomaly.\n'+
      'Store: '+cityRaw+' ('+city+', '+stateStr+')\n'+
      'Date: '+row.dateStr+' ('+row.dow+')\n'+
      'Sales '+(dir==='UNDER'?'below':'above')+' baseline: $'+Math.round(row.actual).toLocaleString()+
      ' actual vs $'+Math.round(row.forecast).toLocaleString()+' baseline ('+(row.varPct>0?'+':'')+row.varPct.toFixed(1)+'%)\n\n'+
      'Search for what happened near '+city+', '+stateStr+' on '+row.dateStr+'.\n'+
      'Look for: severe weather (ice/snow/tornado/flood/hurricane), road closures, major events (concerts/festivals/fairs),'+
      ' sporting events, construction, power outages, or any factor that would '+(dir==='UNDER'?'reduce':'increase')+' restaurant traffic.\n\n'+
      'Be specific — name the actual event, storm name, or cause if found.\n\n'+
      'Respond ONLY with valid JSON (no markdown, no extra text):\n'+
      '{\n'+
      '  "confidence": 0-100,\n'+
      '  "eventType": "weather|event|closure|construction|sports|road|power|holiday|other",\n'+
      '  "tagLabel": "3-5 word short label e.g. Ice Storm Uri or Thunder Football Game",\n'+
      '  "summary": "2-3 sentence description with specific details about what happened and why it affected traffic",\n'+
      '  "geoRelevant": true|false,\n'+
      '  "autoTag": true|false,\n'+
      '  "broadEvent": true|false,\n'+
      '  "affectedArea": "geographic description e.g. South Central Oklahoma or Florida Panhandle"\n'+
      '}\n\n'+
      'Rules:\n'+
      '- autoTag:true ONLY if confidence>=75 AND geoRelevant AND you found a confirmed specific event\n'+
      '- broadEvent:true if the event was regional (affected multiple cities/counties, not just this one store)\n'+
      '- If no event found, set confidence:<30 and autoTag:false';
    try{
      const resp=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',
        headers:{'Content-Type':'application/json','x-api-key':apiKey,
          'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
        body:JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:600,
          tools:[{type:'web_search_20250305',name:'web_search'}],
          messages:[{role:'user',content:prompt}]})});
      const data=await resp.json();
      const text=(data.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('').trim();
      const m=text.match(/\{[\s\S]*\}/);
      if(!m) return null;
      const r=JSON.parse(m[0]);
      // Store the full AI summary for display in the scan results table
      setAiResult(prev=>({...prev,[key]:(r.tagLabel?'['+r.tagLabel+']: ':'')+r.summary||'No specific event found.'}));
      return r;
    }catch(e){return null;}
  };

  const runBatchAIScan = async () => {
    if(!apiKey||!results){alert(!apiKey?'Add API key in Settings first.':'Run scan first to detect anomalies.');return;}
    cancelBatchRef.current=false;
    const _uev=(()=>{try{return JSON.parse(localStorage.getItem('mf_events')||'{}');}catch{return {};}})();
    const isT=(loc,dk)=>!!(_uev[loc]&&_uev[loc][dk]);
    const untagged=sortedRows.filter(r=>!isT(r.loc,r.dKeyStr||r.dateStr)&&!r.isHoliday);
    if(!untagged.length){alert('No untagged non-holiday anomalies to scan.');return;}
    const msg='Run AI scan on '+untagged.length+' untagged anomalies?\n\n'+
      '• Already-tagged rows are skipped\n'+
      '• Processing in groups of 3 (~'+Math.ceil(untagged.length/3*1.5/60)+' min estimated)\n'+
      '• Regional events will be queued for your review\n\n'+
      'This uses your Anthropic API key.';
    if(!window.confirm(msg)) return;
    setBatchScanning(true);
    setBatchProg({done:0,total:untagged.length,tagged:0,found:0});
    const regionalQueue=[];
    let tagged=0,found=0;
    for(let i=0;i<untagged.length;i+=3){
      if(cancelBatchRef.current) break;
      const batch=untagged.slice(i,Math.min(i+3,untagged.length));
      const bRes=await Promise.all(batch.map(row=>lookupAnomalyForBatch(row)));
      for(let j=0;j<batch.length;j++){
        const row=batch[j],r=bRes[j];
        if(!r) continue;
        if(r.summary&&r.confidence>20) found++;
        if(r.autoTag&&r.confidence>=75&&r.geoRelevant){
          // Full note: label + complete description, never truncated
          const fullNote=r.tagLabel+': '+r.summary;
          onTagEvent(row.loc,nDK(row.dKeyStr)||row.dateStr,fullNote,r.eventType||'other',
            {aiMatched:true,aiConfidence:r.confidence,tagLabel:r.tagLabel});
          tagged++;
          // If broad regional event, find other stores with same-date anomalies within radius
          if(r.broadEvent){
            const radius=regionalRadius(row.loc);
            const sameDateOthers=Object.entries(results||{}).flatMap(([loc,anoms])=>
              anoms.filter(a=>a.dKeyStr===row.dKeyStr&&loc!==row.loc&&a.flag===row.flag)
                .map(a=>({...a,loc}))
            );
            const nearby=sameDateOthers.map(other=>{
              const dist=storeDistance(row.loc,other.loc);
              const alreadyTagged=isT(other.loc,other.dKeyStr||other.dateStr);
              return{...other,dist,alreadyTagged};
            }).filter(o=>o.dist<=radius&&!o.alreadyTagged);
            if(nearby.length>0){
              regionalQueue.push({
                event:r,primaryRow:row,candidates:nearby.sort((a,b)=>a.dist-b.dist),
                tagLabel:r.tagLabel,fullNote
              });
            }
          }
        }
      }
      setBatchProg({done:Math.min(i+3,untagged.length),total:untagged.length,tagged,found});
      if(i+3<untagged.length) await new Promise(res=>setTimeout(res,1500));
    }
    setBatchScanning(false);
    if(regionalQueue.length>0){
      setPendingRegional(regionalQueue);
      setShowRegional(true);
    }
  };

  // ── HTML Presentation Export ────────────────────────────────────────────
  const exportHTMLReport = () => {
    if(!results) return;
    const uev=(()=>{try{return JSON.parse(localStorage.getItem('mf_events')||'{}');}catch{return {};}})();
    const allRows=Object.entries(results).flatMap(([loc,anoms])=>anoms.map(r=>({...r,loc})));
    const tagged=allRows.filter(r=>uev[r.loc]&&uev[r.loc][r.dKeyStr||r.dateStr]);
    const aiTaggedCt=tagged.filter(r=>(uev[r.loc]&&uev[r.loc][r.dKeyStr||r.dateStr]||{}).aiMatched).length;
    const manualCt=tagged.filter(r=>!(uev[r.loc]&&uev[r.loc][r.dKeyStr||r.dateStr]||{}).aiMatched).length;
    const vc=p=>p>0?'#10b981':'#ef4444';
    const rowH=r=>{
      const tag=uev[r.loc]&&uev[r.loc][r.dKeyStr||r.dateStr];
      const name=sName(r.loc);
      const tagCell=tag
        ?`<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:9px;font-weight:700;background:${tag.aiMatched?'rgba(96,165,250,.15)':'rgba(16,185,129,.15)'};color:${tag.aiMatched?'#60a5fa':'#10b981'};border:.5px solid ${tag.aiMatched?'rgba(96,165,250,.4)':'rgba(16,185,129,.4)'};">${tag.aiMatched?'AI Matched':'Manual'} — ${tag.label||''} ${tag.aiMatched?'('+tag.aiConfidence+'%)':''}</span>${tag.note?'<br><span style="font-size:8px;color:#94a3b8;">'+tag.note+'</span>':''}`
        :'<span style="color:#475569;font-size:9px;">Untagged</span>';
      return `<tr style="border-bottom:.5px solid rgba(255,255,255,.05)${r.isHoliday?';background:rgba(165,180,252,.04)':''}"><td style="padding:5px 10px;font-weight:600;color:#f5bc00;white-space:nowrap;">${name}</td><td style="padding:5px 10px;white-space:nowrap;">${r.dateStr}</td><td style="padding:5px 10px;color:#94a3b8;">${r.dow}</td><td style="padding:5px 10px;text-align:right;font-family:monospace;">${'$'+Math.round(r.actual).toLocaleString()}</td><td style="padding:5px 10px;text-align:right;font-family:monospace;color:#475569;">${'$'+Math.round(r.forecast).toLocaleString()}</td><td style="padding:5px 10px;text-align:right;font-family:monospace;font-weight:700;color:${vc(r.varPct)};">${(r.varPct>0?'+':'')+r.varPct.toFixed(1)+'%'}</td><td style="padding:5px 10px;">${tagCell}</td></tr>`;
    };
    const minDate=allRows.reduce((a,r)=>r.date<a?r.date:a,allRows[0]?.date||new Date());
    const maxDate=allRows.reduce((a,r)=>r.date>a?r.date:a,allRows[0]?.date||new Date());
    const spanLabel=allRows.length?minDate.toLocaleDateString('en-US',{month:'short',year:'numeric'})+' - '+maxDate.toLocaleDateString('en-US',{month:'short',year:'numeric'}):'';
    const html='<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Meridian - Anomaly Report</title>'+
      '<link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Geist:wght@400;600;700;800&display=swap" rel="stylesheet">'+
      '<style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:Geist,sans-serif;background:#080c14;color:#f0f4ff;font-size:11px;line-height:1.6;-webkit-print-color-adjust:exact;}'+
      '.page{max-width:1100px;margin:0 auto;padding:40px 44px;}'+
      '.card{background:#111827;border:.5px solid rgba(255,255,255,.07);border-radius:8px;padding:14px 16px;text-align:center;}'+
      '.card .n{font-family:"DM Mono",monospace;font-size:22px;font-weight:700;}.card .l{font-size:8px;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-top:3px;}'+
      'table{width:100%;border-collapse:collapse;}th{font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#64748b;border-bottom:.5px solid rgba(255,255,255,.1);padding:6px 10px;text-align:left;}'+
      '@media print{body{background:#fff;color:#111;}.card{background:#f5f5f5;border-color:#ddd;}}</style></head><body>'+
      '<div class="page">'+
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px;padding-bottom:20px;border-bottom:1px solid #f5bc00;">'+
      '<div><div style="font-size:9px;color:#64748b;letter-spacing:.5px;text-transform:uppercase;margin-bottom:4px;">Meridian</div>'+
      '<div style="font-size:22px;font-weight:800;letter-spacing:-.5px;">Sales Anomaly Report</div>'+
      '<div style="font-size:10px;color:#64748b;margin-top:4px;">'+new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'})+' | Threshold: \u00b1'+threshold+'% | '+spanLabel+'</div></div>'+
      '<div style="text-align:right;font-size:10px;color:#64748b;">MCDOK | Emerald Arches<br>27 Locations</div></div>'+
      '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:28px;">'+
      '<div class="card"><div class="n" style="color:#f59e0b;">'+allRows.length+'</div><div class="l">Total Anomalies</div></div>'+
      '<div class="card"><div class="n" style="color:#ef4444;">'+allRows.filter(r=>r.varPct<0).length+'</div><div class="l">Under Baseline</div></div>'+
      '<div class="card"><div class="n" style="color:#10b981;">'+allRows.filter(r=>r.varPct>0).length+'</div><div class="l">Over Baseline</div></div>'+
      '<div class="card"><div class="n" style="color:#60a5fa;">'+aiTaggedCt+'</div><div class="l">AI Auto-Tagged</div></div>'+
      '<div class="card"><div class="n" style="color:#a5b4fc;">'+manualCt+'</div><div class="l">Manually Tagged</div></div></div>'+
      '<div style="font-size:12px;font-weight:700;margin-bottom:10px;">All Anomalies \u2014 Sorted by Impact</div>'+
      '<table><thead><tr><th>Store</th><th>Date</th><th>Day</th><th style="text-align:right;">Actual</th><th style="text-align:right;">Baseline</th><th style="text-align:right;">Variance</th><th>Event / Tag</th></tr></thead>'+
      '<tbody>'+allRows.sort((a,b)=>Math.abs(b.varPct)-Math.abs(a.varPct)).map(rowH).join('')+'</tbody></table>'+
      '<div style="margin-top:28px;padding-top:14px;border-top:.5px solid rgba(255,255,255,.07);display:flex;justify-content:space-between;font-size:9px;color:#64748b;">'+
      '<span>Meridian \u2014 Sales Anomaly Report | Confidential</span>'+
      '<span style="font-family:\'DM Mono\',monospace;color:#f5bc00;opacity:.5;">v5.17 | '+Object.keys(results).length+' stores</span></div>'+
      '</div></body></html>';
    const blob=new Blob([html],{type:'text/html'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;a.download='anomaly_report_'+new Date().toISOString().slice(0,10)+'.html';
    a.click();URL.revokeObjectURL(url);
  };

  const lookupAnomaly = async (row) => {    if(!apiKey) return;
    const key = row.loc+'_'+row.dateStr;
    setAiLoading(prev=>({...prev,[key]:true}));
    try {
      const cityRaw = STORE_NAMES[row.loc]||row.loc;
      const city = cityRaw.replace(/[^a-zA-Z0-9\s,]/g,'').split('-').pop().trim();
      const stateStr = ['6178','6838','35242','37566','38609'].includes(row.loc)?'Florida':'Oklahoma';
      const prompt = 'McDonald\'s district analytics. Sales anomaly at '+cityRaw+' on '+row.dateStr+'.\n'+
        'Actual: $'+row.actual.toFixed(0)+' vs DOW baseline $'+row.forecast.toFixed(0)+' ('+(row.varPct>0?'+':'')+row.varPct.toFixed(1)+'%).\n'+
        'Search for news, weather, events, closures on that date near '+city+', '+stateStr+'. 2-3 sentence summary.';
      const resp = await fetch('https://api.anthropic.com/v1/messages',{
        method:'POST',
        headers:{'Content-Type':'application/json','x-api-key':apiKey,
          'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
        body:JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:300,
          tools:[{type:'web_search_20250305',name:'web_search'}],
          messages:[{role:'user',content:prompt}]})
      });
      const data = await resp.json();
      const text=(data.content||[]).filter(b=>b.type==='text').map(b=>b.text).join(' ').trim()||'No relevant events found.';
      setAiResult(prev=>({...prev,[key]:text}));
    } catch(e){ setAiResult(prev=>({...prev,[key]:'AI lookup failed: '+e.message})); }
    finally { setAiLoading(prev=>({...prev,[key]:false})); }
  };

  const exportCSV = () => {
    if(!results) return;
    const rows=[['Store','Date','Day','Actual','DOW Baseline','Variance%','Flag','Holiday']];
    for(const [loc,anomalies] of Object.entries(results)){
      for(const r of anomalies){
        rows.push([STORE_NAMES[loc]||loc,r.dateStr,r.dow,
          r.actual.toFixed(2),r.forecast.toFixed(2),r.varPct.toFixed(2),r.flag,r.holidayName||'']);
      }
    }
    const csv=rows.map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\n');
    const blob=new Blob([csv],{type:'text/csv'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;a.download='backtest_anomalies_'+new Date().toISOString().slice(0,10)+'.csv';
    a.click();URL.revokeObjectURL(url);
  };
  const clearCache=()=>{
    try{localStorage.removeItem('mf_backtest_results');}catch(e){}
    setResults(null);setAiResult({});
  };
  const runScan = async () => {
    if(!ds||!ds.loaded) return;
    setScanning(true); setResults(null); setProgress(0);
    const allResults = {};
    const locs = ds.storeIds;

    for(let li=0;li<locs.length;li++){
      const loc = locs[li];
      setProgress(Math.round(li/locs.length*100));

      // ── DOW BASELINE APPROACH ──────────────────────────────────────────
      // Build per-DOW rolling median from ALL available actuals for this store.
      // Flag days where actual deviates from that DOW's median by > threshold.
      // This is model-independent: no forecast needed, purely historical baseline.

      // Deduplicate by date (include $0 days — they're valid anomalies)
      const allForLoc = ds.laborRows.filter(r=>r.loc===loc&&r.sales!=null&&r.sales>=0);
      const seenDates = new Set();
      const laborRows = allForLoc.filter(r=>{
        const dk = dKey(r.date); if(seenDates.has(dk)) return false;
        seenDates.add(dk); return true;
      });
      // Need 21 rows with actual sales for a meaningful baseline
      if(laborRows.filter(r=>r.sales>0).length < 21) continue;

      // Build DOW buckets — use only positive-sales days for baseline (exclude $0 and holidays)
      const dowBuckets = {0:[],1:[],2:[],3:[],4:[],5:[],6:[]};
      for(const r of laborRows){
        if(r.sales<=0) continue; // exclude $0 from baseline — they ARE anomalies
        if(isHoliday(r.date)) continue; // don't include holidays in baseline
        dowBuckets[r.date.getDay()].push(r.sales);
      }

      // Compute trimmed mean per DOW (remove top/bottom 10% to reduce outlier influence)
      const dowBaseline = {};
      for(const [dow, vals] of Object.entries(dowBuckets)){
        if(vals.length < 4) continue;
        const sorted = [...vals].sort((a,b)=>a-b);
        const trim = Math.max(1, Math.floor(sorted.length*0.10));
        const trimmed = sorted.slice(trim, sorted.length-trim);
        dowBaseline[dow] = trimmed.reduce((a,v)=>a+v,0)/trimmed.length;
      }

      // Flag anomalies — $0 sales days are always flagged (-100%) regardless of threshold
      const anomalies = [];
      const cutoff = new Date(Date.now()-14*864e5); // skip last 2 weeks (data still arriving)
      for(const r of laborRows){
        if(r.date > cutoff) continue;
        const dow = r.date.getDay();
        const baseline = dowBaseline[dow];
        if(!baseline || baseline < 100) continue;
        const varPct = r.sales<=0 ? -100 : (r.sales - baseline) / baseline * 100;
        // $0 days always flagged; other days need to exceed threshold
        if(r.sales>0 && Math.abs(varPct) < threshold) continue;
        const isHol = isHoliday(r.date);
        // vs LY: same calendar date 52 weeks ago — secondary signal for trend context
        const lyDate364 = addD(r.date,-364);
        const lyActual  = fetchRow(ds.laborIdx,loc,lyDate364,'sales')||0;
        const lyVarPct  = lyActual>0 ? (r.sales-lyActual)/lyActual*100 : null;
        anomalies.push({
          date: r.date,
          actual: r.sales,
          forecast: Math.round(baseline), // DOW trimmed mean baseline (all loaded history)
          varPct,
          lyActual, lyVarPct,             // vs LY context — secondary signal
          flag: varPct > 0 ? 'over' : 'under',
          dow: r.date.toLocaleDateString('en-US',{weekday:'short',timeZone:'UTC'}),
          dateStr: r.date.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}),
          dKeyStr: dKey(r.date), // ISO key for event calendar storage
          loc,
          isHoliday: !!isHol,
          holidayName: isHol ? isHol.label : null,
        wxNote:getWeatherNote(loc,r.date,ds),
        });
      }

      // Sort by absolute variance — show all above threshold
      anomalies.sort((a,b)=>Math.abs(b.varPct)-Math.abs(a.varPct));
      if(anomalies.length) allResults[loc] = anomalies;
      await new Promise(r=>setTimeout(r,0)); // yield to browser
    }

    setResults(allResults);
    // ── Auto-tag detected holidays ────────────────────────────────────────
    // Holidays are definitively known events — no AI needed, tag automatically
    (()=>{
      const _uevNow=(()=>{try{return JSON.parse(localStorage.getItem('mf_events')||'{}');}catch{return {};}})();
      const isTaggedNow=(loc,dk)=>{const k=nDK(dk);return!!(k&&_uevNow[loc]&&_uevNow[loc][k]);};
      let autoHolCount=0;
      for(const [loc,anoms] of Object.entries(allResults)){
        for(const row of anoms){
          if(!row.isHoliday||isTaggedNow(loc,row.dKeyStr)) continue;
          const holName=row.holidayName||'Holiday';
          const holType=holName.toLowerCase().includes('christmas')||holName.toLowerCase().includes('thanksgiving')
            ?'holiday':'holiday';
          onTagEvent(loc,dKey(row.date||new Date()),holName,'holiday',{
            tagLabel:holName,
            tags:[{type:'holiday',...(EVENT_TYPES.holiday||{icon:'🎉',label:holName,col:'#f59e0b'})}],
            customNote:'Auto-detected by Holiday Calendar',
            source:'Auto-Holiday Scan'
          });
          autoHolCount++;
        }
      }
      if(autoHolCount>0){
        // Brief toast-style note — store in state via a setTimeout so it shows after render
        setAutoHolTagged(autoHolCount);
      }
    })();
    // Merge with any previously saved results (append new anomalies)
    try{
      const existing = JSON.parse(localStorage.getItem('mf_backtest_results')||'{}');
      const merged = {...existing};
      for(const [loc,rows] of Object.entries(allResults)){
        merged[loc] = rows; // replace with fresh scan
      }
      localStorage.setItem('mf_backtest_results', JSON.stringify(merged));
    }catch(e){}
    setProgress(100);
    setScanning(false);
  };

  const filteredLocs = results ? (selLoc==='all' ? Object.keys(results) : [selLoc].filter(l=>results[l])) : [];
  // DOW filter: if any days selected, filter allFlatRows to those day-of-week only
  const dowSet = new Set(dowFilter);
  // For date sort: flatten all anomalies, sort by date, then re-group
  // Merge prop (reactive) with localStorage snapshot so tags appear instantly after saving
  const _uev = React.useMemo(()=>{
    const stored=(()=>{try{return JSON.parse(localStorage.getItem('mf_events')||'{}');}catch{return {};}})();
    if(!userEvents) return stored;
    const merged={...stored};
    Object.keys(userEvents).forEach(loc=>{
      if(!merged[loc])merged[loc]={};
      Object.assign(merged[loc],userEvents[loc]||{});
    });
    return merged;
  },[results, tagPick, userEvents]);
  // nDK is global — normalizes any date key to YYYY-MM-DD ISO string
  const isTagged = (loc,dk) => {
    const k=nDK(dk);
    return !!(k&&_uev[loc]&&_uev[loc][k]);
  };

    const sortedRows = React.useMemo(()=>{
    if(!results) return [];
    let all = filteredLocs.flatMap(loc=>(results[loc]||[]).map(r=>({...r,loc})));
    // Apply filters
    if(!showHols) all = all.filter(r=>!r.isHoliday);
    const _uevSort=_uev; // Use the already-merged useMemo value — avoids redundant localStorage read
    if(tagFilter==='untagged') all=all.filter(r=>!isTagged(r.loc,r.dKeyStr||r.dateStr)&&!r.isHoliday);
    if(tagFilter==='tagged')   all=all.filter(r=>isTagged(r.loc,r.dKeyStr||r.dateStr));
    if(tagFilter==='ai')       all=all.filter(r=>(_uevSort[r.loc]&&_uevSort[r.loc][r.dKeyStr||r.dateStr]||{}).aiMatched);
    if(tagFilter==='holiday')  all=all.filter(r=>r.isHoliday);
    if(tagFilter==='manual')   all=all.filter(r=>{const ev=_uevSort[r.loc]&&_uevSort[r.loc][r.dKeyStr||r.dateStr];return ev&&!ev.aiMatched&&ev.source!=='Auto-Holiday Scan';});
    // DOW filter — only show selected days of week
    if(dowFilter.length>0) all=all.filter(r=>dowFilter.includes(r.date instanceof Date?r.date.getDay():new Date(r.date).getDay()));
    if(sortBy==='date') all.sort((a,b)=>b.date-a.date);
    else all.sort((a,b)=>Math.abs(b.varPct)-Math.abs(a.varPct));
    return all;
  },[results,filteredLocs,sortBy,showHols,tagFilter,_uev,dowFilter]);
  // renderTagPicker — shared between per-store and flat date-sort renders
  const renderTagPicker = (row, key) => {
    const locsToTag=(tagStores&&tagStores[key]&&tagStores[key].length)?tagStores[key]:[row.loc];
    const toggleTag=(k)=>setTagSelected(prev=>prev.includes(k)?prev.filter(x=>x!==k):[...prev,k]);
    const applyTags=()=>{
      if(!tagSelected.length&&!tagCustomNote.trim()){alert('Select at least one tag or enter a custom note.');return;}
      const selectedETs=tagSelected.map(k=>EVENT_TYPES[k]||EVENT_TYPES.other);
      const labels=selectedETs.map(et=>et.label);
      const icons=selectedETs.map(et=>et.icon).join(' ');
      const primaryType=tagSelected[0]||'other';
      const aiPrefix=aiResult[key]?'AI context: '+aiResult[key]+' | ':'';
      const note=(tagCustomNote.trim()||labels.join(' + '))+(aiResult[key]?(' | '+aiResult[key]):'');
      for(const tl of locsToTag){
        onTagEvent(tl,nDK(row.dKeyStr)||row.dateStr,
          tagCustomNote.trim()||labels.join(' + '),
          primaryType,
          {tagLabel:labels.join(' + '),
           aiNote:aiResult[key]||'',
           tags:tagSelected.map(k=>({type:k,...EVENT_TYPES[k]})),
           customNote:tagCustomNote.trim()});
      }
      setTagPick(null);
    };
    return div({style:{fontSize:'9px',background:'var(--surf)',border:'.5px solid var(--bdr2)',
      borderRadius:'var(--rl)',padding:'14px 16px',maxWidth:660}},
      // Header
      div({style:{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}},
        div(null,
          div({style:{fontSize:'10px',fontWeight:700,color:'var(--text)'}},'📌 Tag Event'),
          div({style:{fontSize:'8.5px',color:'var(--text3)',marginTop:1}},
            row.dateStr+' ('+row.dow+') · Select one or more tags · can combine')
        ),
        btn({className:'btn btn-sm',style:{color:'var(--text3)'},onClick:()=>setTagPick(null)},'✕')
      ),
      // Store selector
      div({style:{marginBottom:10}},
        div({style:{fontSize:'8px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.5px',
          color:'var(--text3)',marginBottom:4}},'Apply to:'),
        div({style:{display:'flex',gap:3,flexWrap:'wrap'}},
          stores&&stores.map(s=>{
            const sel=tagStores&&tagStores[key]&&tagStores[key].includes(s.loc);
            const name=sName(s.loc);
            return div({key:s.loc,onClick:()=>{
              const cur=(tagStores&&tagStores[key])||[row.loc];
              const has=cur.includes(s.loc);
              const next=has?cur.filter(l=>l!==s.loc):[...cur,s.loc];
              setTagStores({...tagStores,[key]:next.length?next:[row.loc]});
            },style:{cursor:'pointer',padding:'2px 7px',borderRadius:3,fontSize:'8.5px',
              background:sel?'rgba(165,180,252,.15)':'rgba(255,255,255,.04)',
              border:'.5px solid '+(sel?'rgba(165,180,252,.5)':'rgba(255,255,255,.08)'),
              color:sel?'#a5b4fc':'var(--text3)',userSelect:'none'}},
              sel?'☑ ':'☐ ',name)})
        )
      ),
      // Tag groups
      EVENT_TYPE_GROUPS.map((grp,gi)=>div({key:gi,style:{marginBottom:8}},
        div({style:{fontSize:'7.5px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.8px',
          color:'var(--text3)',marginBottom:4}},grp.label),
        div({style:{display:'flex',gap:3,flexWrap:'wrap'}},
          grp.items.map(k=>{
            const et=EVENT_TYPES[k];
            const sel=tagSelected.includes(k);
            if(!et) return null;
            return btn({key:k,onClick:()=>toggleTag(k),
              style:{fontSize:'9px',padding:'3px 9px',
                background:sel?et.col+'33':'rgba(255,255,255,.04)',
                color:sel?et.col:'var(--text3)',
                border:'.5px solid '+(sel?et.col+'88':'rgba(255,255,255,.08)'),
                borderRadius:4,cursor:'pointer',fontWeight:sel?700:400,
                transition:'all .1s'}},
              et.icon+' '+et.label+(sel?' ✓':''))})
        )
      )),
      // Selected tags summary
      tagSelected.length>0&&div({style:{display:'flex',gap:4,flexWrap:'wrap',
        padding:'6px 8px',background:'rgba(255,255,255,.04)',borderRadius:4,
        border:'.5px solid rgba(255,255,255,.08)',marginBottom:8}},
        div({style:{fontSize:'8px',color:'var(--text3)',marginRight:2,alignSelf:'center'}},'Selected:'),
        tagSelected.map(k=>{const et=EVENT_TYPES[k];return et?span({key:k,style:{
          fontSize:'8px',padding:'1px 7px',borderRadius:3,fontWeight:600,
          background:et.col+'22',color:et.col,border:'.5px solid '+et.col+'55',
          cursor:'pointer'},onClick:()=>toggleTag(k)},et.icon+' '+et.label+' ×'):null;})
      ),
      // Custom note
      div({style:{marginBottom:10}},
        div({style:{fontSize:'8px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.5px',
          color:'var(--text3)',marginBottom:4}},'Custom Note (optional — overrides button labels)'),
        h('textarea',{value:tagCustomNote,
          onChange:e=>setTagCustomNote(e.target.value),
          placeholder:'e.g. Internet down at location, credit cards not working for 5 hours, 3pm–8pm',
          rows:2,
          style:{width:'100%',background:'var(--surf)',border:'.5px solid var(--bdr)',
            borderRadius:'var(--r)',padding:'6px 8px',fontSize:'9px',
            color:'var(--text)',outline:'none',resize:'vertical',
            fontFamily:'inherit',lineHeight:1.5}})
      ),
      // AI context if available
      aiResult[key]&&div({style:{fontSize:'8px',color:'#60a5fa',padding:'4px 8px',
        background:'rgba(96,165,250,.06)',borderRadius:3,
        border:'.5px solid rgba(96,165,250,.2)',marginBottom:8}},
        span({style:{fontWeight:700}},'🤖 AI Context: '),aiResult[key]),
      // Action buttons
      div({style:{display:'flex',gap:6,justifyContent:'flex-end'}},
        btn({className:'btn btn-sm',style:{color:'var(--text3)'},
          onClick:()=>setTagPick(null)},'Cancel'),
        btn({className:'btn btn-a',
          disabled:!tagSelected.length&&!tagCustomNote.trim(),
          style:{fontSize:'9px',padding:'4px 14px',fontWeight:700,
            opacity:(!tagSelected.length&&!tagCustomNote.trim())?.4:1},
          onClick:applyTags},
          tagSelected.length?'Apply '+(tagSelected.length>1?tagSelected.length+' Tags':'Tag')+
            (locsToTag.length>1?' to '+locsToTag.length+' Stores':''):'Apply Note')
      )
    );
  };

  // nDK is global (defined near dKey) — normalizes any date key to YYYY-MM-DD ISO string
  const totalAnomalies = results ? Object.values(results).reduce((a,v)=>a+v.length,0) : 0;
  const varCol = r => r.varPct>0?'#10b981':'#ef4444';

  const allFlatRows = React.useMemo(()=>
    results ? Object.entries(results).flatMap(([loc,anoms])=>anoms.map(r=>({...r,loc}))) : []
  ,[results]);

  // Tag counts — reactive to _uev (updates when any tag is saved)
  const tagCounts = React.useMemo(()=>{
    let tagged=0,aiTagged=0,manual=0,holTagged=0,hols=0;
    for(const r of allFlatRows){
      const dk=nDK(r.dKeyStr)||r.dateStr;
      const ev=_uev[r.loc]&&_uev[r.loc][dk];
      if(r.isHoliday) hols++;
      if(ev){tagged++;if(ev.aiMatched)aiTagged++;else if(ev.source==='Auto-Holiday Scan')holTagged++;else manual++;}
    }
    const tot=allFlatRows.length,untagged=tot-tagged;
    return{tot,tagged,aiTagged,manual,holTagged,hols,untagged,pct:tot?Math.round(tagged/tot*100):0};
  },[allFlatRows,_uev]);

  // Tab-filtered rows (tab selector narrows sortedRows)
  const tabRows = React.useMemo(()=>{
    if(!sortedRows) return [];
    switch(scanTab){
      case 'review':   return sortedRows.filter(r=>!isTagged(r.loc,nDK(r.dKeyStr)||r.dateStr)&&!r.isHoliday);
      case 'tagged':   return sortedRows.filter(r=>isTagged(r.loc,nDK(r.dKeyStr)||r.dateStr));
      case 'holidays': return sortedRows.filter(r=>r.isHoliday);
      default:         return sortedRows;
    }
  },[sortedRows,scanTab,_uev]);

  // Tag all untagged holidays across loaded scan results (no scan required)
  const tagAllHolidays = ()=>{
    if(!allFlatRows.length){alert('Run a scan first to detect holiday anomalies.');return;}
    const cur=(()=>{try{return JSON.parse(localStorage.getItem('mf_events')||'{}');}catch{return {};}})();
    let n=0;
    for(const r of allFlatRows){
      if(!r.isHoliday) continue;
      const dk=dKey(r.date instanceof Date?r.date:new Date(r.date));
      if(cur[r.loc]&&cur[r.loc][dk]) continue;
      onTagEvent(r.loc,dk,r.holidayName||'Holiday','holiday',{
        tagLabel:r.holidayName||'Holiday',
        tags:[{type:'holiday',...(EVENT_TYPES.holiday||{icon:'🎉',label:'Holiday',col:'#f59e0b'})}],
        source:'Auto-Holiday Scan',customNote:'Tagged via Tag All Holidays'
      });
      n++;
    }
    n>0?setAutoHolTagged(n):alert('All detected holidays are already tagged.');
  };

  // Calendar: available months + cells for active month
  const calMonths = React.useMemo(()=>{
    const seen=new Set();
    allFlatRows.forEach(r=>{const d=r.date instanceof Date?r.date:new Date(r.date);seen.add(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'));});
    return[...seen].sort().reverse();
  },[allFlatRows]);
  const activeMon = calMonth||(calMonths[0]||'');
  const calCells = React.useMemo(()=>{
    if(!activeMon||!allFlatRows.length) return {};
    const [cy,cm]=activeMon.split('-').map(Number);
    const cells={};
    for(const r of allFlatRows){
      const d=r.date instanceof Date?r.date:new Date(r.date);
      if(d.getFullYear()!==cy||d.getMonth()+1!==cm) continue;
      const day=d.getDate();
      if(!cells[day]) cells[day]={day,rows:[],date:d};
      cells[day].rows.push(r);
    }
    return cells;
  },[allFlatRows,activeMon]);

  // Tag status badge for a single row
  const tagBadge=(r)=>{
    const dk=nDK(r.dKeyStr)||r.dateStr;
    const ev=_uev[r.loc]&&_uev[r.loc][dk];
    const s=(txt,bg,col,bdr)=>span({style:{display:'inline-block',fontSize:'8px',padding:'1px 6px',borderRadius:3,fontWeight:700,background:bg,color:col,border:'.5px solid '+bdr,whiteSpace:'nowrap'}},txt);
    if(!ev){
      if(r.isHoliday) return s('🎉 '+(r.holidayName||'Holiday').slice(0,20),'rgba(245,188,0,.12)','#f5bc00','rgba(245,188,0,.35)');
      return s('❓ Unreviewed','rgba(239,68,68,.06)','var(--text3)','rgba(239,68,68,.15)');
    }
    if(ev.aiMatched) return s('🤖 '+(ev.tagLabel||ev.label||'AI').slice(0,22)+(ev.aiConfidence?' ('+ev.aiConfidence+'%)':''),'rgba(96,165,250,.12)','#60a5fa','rgba(96,165,250,.35)');
    if(ev.source==='Auto-Holiday Scan') return s('🎉 '+(ev.tagLabel||ev.label||'Holiday').slice(0,22),'rgba(245,188,0,.12)','#f5bc00','rgba(245,188,0,.35)');
    return s('✅ '+(ev.tagLabel||ev.label||'Tagged').slice(0,22),'rgba(16,185,129,.12)','#10b981','rgba(16,185,129,.35)');
  };

  // Enhanced table row renderer
  const renderRow=(row,i)=>{
    const key=row.loc+'_'+(nDK(row.dKeyStr)||row.dateStr);
    const dk=nDK(row.dKeyStr)||row.dateStr;
    const ev=_uev[row.loc]&&_uev[row.loc][dk];
    const isT=!!ev;
    const absP=Math.abs(row.varPct);
    const varBg=row.varPct>0?`rgba(16,185,129,${Math.min(.18,absP/100*.25)})`:`rgba(239,68,68,${Math.min(.18,absP/100*.25)})`;
    const name=sName(row.loc);
    return React.createElement(React.Fragment,{key:i},
      tr({style:{borderBottom:'.5px solid rgba(255,255,255,.04)',
        background:tagPick===key?'rgba(165,180,252,.05)':row.isHoliday?'rgba(245,188,0,.03)':i%2?'rgba(255,255,255,.015)':'transparent',
        cursor:'pointer'},onClick:()=>setTagPick(tagPick===key?null:key)},
        td({style:{padding:'5px 8px',fontWeight:600,color:'var(--amber)',fontSize:'9px',whiteSpace:'nowrap',maxWidth:130,overflow:'hidden',textOverflow:'ellipsis'}},name),
        td({style:{padding:'5px 8px',fontSize:'9px',color:'var(--text2)',whiteSpace:'nowrap'}},row.dateStr),
        td({style:{padding:'5px 8px',fontSize:'9px',color:'var(--text3)'}},(row.dow||'')),
        td({style:{padding:'5px 8px',textAlign:'right',fontFamily:'var(--mono)',fontSize:'9px'}},
          '$'+Math.round(row.actual).toLocaleString()),
        td({style:{padding:'5px 8px',textAlign:'right',fontFamily:'var(--mono)',fontSize:'9px',color:'var(--text3)'}},
          '$'+Math.round(row.forecast).toLocaleString()),
        td({style:{padding:'5px 8px',textAlign:'right',fontFamily:'var(--mono)',fontWeight:700,fontSize:'9px',
          color:varCol(row),background:varBg,borderRadius:3}},
          (row.varPct>0?'+':'')+row.varPct.toFixed(1)+'%'),
        // vs LY: same calendar date 52 weeks prior — secondary context column
        td({style:{padding:'5px 8px',textAlign:'right',fontFamily:'var(--mono)',fontSize:'9px',
          color:row.lyVarPct!=null?(row.lyVarPct>0?'#34d399':row.lyVarPct<0?'#f87171':'var(--text3)'):'var(--text3)'},
          title:row.lyActual>0?'LY actual: $'+Math.round(row.lyActual).toLocaleString():undefined},
          row.lyVarPct!=null?(row.lyVarPct>0?'+':'')+row.lyVarPct.toFixed(1)+'%':'—'),
        td({style:{padding:'5px 6px',minWidth:140}},tagBadge(row)),
        td({style:{padding:'5px 6px',textAlign:'right',whiteSpace:'nowrap'}},
          div({style:{display:'flex',gap:3,justifyContent:'flex-end',alignItems:'center'}},
            btn({className:'btn btn-sm',style:{fontSize:'8px',padding:'2px 7px',
              color:isT?'var(--text3)':'#a5b4fc',
              borderColor:isT?'var(--bdr)':'rgba(165,180,252,.3)',
              background:tagPick===key?'rgba(165,180,252,.08)':'transparent'},
              onClick:e=>{e.stopPropagation();setTagPick(tagPick===key?null:key);}},
              tagPick===key?'✕':isT?'✏ Edit':'📌 Tag'),
            apiKey&&!isT&&btn({className:'btn btn-sm',disabled:!!aiLoading[key],
              style:{fontSize:'8px',padding:'2px 7px',opacity:aiLoading[key]?.5:1},
              onClick:e=>{e.stopPropagation();lookupAnomaly(row);}},
              aiLoading[key]?'…':'🔍 AI'),
            // 📊 Ops Analysis button — local, no API needed
            btn({className:'btn btn-sm',
              style:{fontSize:'8px',padding:'2px 7px',
                color:opsOpen.has(key)?'var(--amber)':'#34d399',
                borderColor:opsOpen.has(key)?'rgba(245,158,11,.35)':'rgba(52,211,153,.25)',
                background:opsOpen.has(key)?'rgba(245,158,11,.06)':'transparent'},
              title:'Cross-check sales deviation against operational metrics for this date',
              onClick:e=>{e.stopPropagation();toggleOps(key);}},
              opsOpen.has(key)?'▲ Ops':'📊 Ops')
          )
        )
      ),
      aiResult[key]&&!tagPick&&tr({key:'ai_'+i,
        style:{background:'rgba(96,165,250,.04)',borderBottom:'.5px solid var(--bdr)'}},
        td({colSpan:9,style:{padding:'4px 12px 5px',fontSize:'8.5px',color:'#93c5fd',lineHeight:1.5}},
          span({style:{fontWeight:700,marginRight:5}},'🤖'),aiResult[key])),
      tagPick===key&&tr({key:'tp_'+i,
        style:{background:'rgba(165,180,252,.03)',borderBottom:'.5px solid var(--bdr2)'}},
        td({colSpan:9,style:{padding:'10px 12px'}},renderTagPicker(row,key))),
      // ── 📊 Ops Analysis row ─────────────────────────────────────────────
      opsOpen.has(key)&&(()=>{
        const a = computeOpsAnalysis(row, ds);
        if(!a) return null;
        const typeColors = {external:'#60a5fa', ops:'#f59e0b', mixed:'#94a3b8', positive:'#10b981', nodata:'#475569'};
        const typeLabels = {external:'📌 Likely External — tag for context', ops:'⚙️ Ops-Driven — review with team before tagging', mixed:'⚠️ Mixed signals — may be partially ops-driven', positive:'✅ Strong execution — overperformance may be internal', nodata:'No data'};
        const impactCol  = imp => imp==='negative'?'#f87171':imp==='positive'?'#34d399':imp==='cost'?'#f59e0b':'#94a3b8';
        const col = typeColors[a.conclusionType]||'#94a3b8';
        return tr({key:'ops_'+i,style:{background:'rgba(16,185,129,.02)',borderBottom:'.5px solid var(--bdr)'}},
          td({colSpan:9,style:{padding:'10px 14px'}},
            div({style:{display:'flex',gap:12,flexWrap:'wrap'}},
              // Left: header + signals list
              div({style:{flex:'1 1 340px'}},
                div({style:{fontSize:'9.5px',fontWeight:700,color:'var(--text)',marginBottom:7,display:'flex',alignItems:'center',gap:6}},
                  '📊 Ops Metrics Analysis',
                  a.kbNote&&span({style:{fontSize:'8px',color:'#94a3b8',fontWeight:400,marginLeft:6,fontStyle:'italic'}},
                    '📍 '+a.kbNote.slice(0,80)+(a.kbNote.length>80?'…':'')),
                  span({style:{fontSize:'8px',color:'var(--text3)',fontWeight:400}},'·',
                  a.peerCount>0?(' '+a.peerCount+' historical '+DOW_BASE[row.date instanceof Date?row.date.getDay():new Date(row.date).getDay()]+'s as baseline'):''),
                ),
                a.signals.length===0
                  ? div({style:{fontSize:'9px',color:'#10b981',display:'flex',alignItems:'center',gap:5,padding:'4px 0'}},
                      span({style:{fontSize:'13px'}},'✅'),
                      span(null,'All tracked metrics within normal range for this day'))
                  : div({style:{display:'flex',flexDirection:'column',gap:4}},
                      ...a.signals.map((s,si)=>div({key:si,style:{display:'flex',gap:8,alignItems:'flex-start',
                        padding:'5px 8px',borderRadius:'var(--r)',border:'.5px solid var(--bdr)',
                        background:s.impact==='negative'?'rgba(248,113,113,.06)':s.impact==='positive'?'rgba(52,211,153,.06)':'rgba(245,158,11,.04)'}},
                        span({style:{fontSize:'13px',flexShrink:0}},s.icon),
                        div({style:{flex:1}},
                          div({style:{display:'flex',gap:6,alignItems:'baseline',marginBottom:2}},
                            span({style:{fontSize:'9px',fontWeight:700,color:'var(--text)'}},(s.metric)),
                            span({style:{fontSize:'9.5px',fontFamily:'var(--mono)',fontWeight:700,color:impactCol(s.impact)}},(s.dayVal)),
                            span({style:{fontSize:'8px',color:'var(--text3)'}},'vs '+s.blVal+' avg')
                          ),
                          div({style:{fontSize:'8.5px',color:'var(--text3)',lineHeight:1.5}},(s.note))
                        )
                      ))
                    )
              ),
              // Right: conclusion + suggested tag
              div({style:{flex:'0 1 260px',borderLeft:'.5px solid var(--bdr)',paddingLeft:12,display:'flex',flexDirection:'column',gap:8,justifyContent:'center'}},
                div({style:{fontSize:'9px',lineHeight:1.6,color:'var(--text2)'}},a.conclusion),
                div({style:{padding:'6px 10px',borderRadius:'var(--r)',background:col+'14',border:'.5px solid '+col+'44'}},
                  div({style:{fontSize:'8px',textTransform:'uppercase',letterSpacing:'.4px',color:'var(--text3)',marginBottom:2}},'Suggested Classification'),
                  div({style:{fontSize:'9.5px',fontWeight:700,color:col}},(typeLabels[a.conclusionType]||'—')),
                  a.suggestedTag&&div({style:{fontSize:'8px',color:'var(--text3)',marginTop:2,fontStyle:'italic'}},(a.suggestedTag))
                )
              )
            )
          )
        );
      })()
    );
  };

  // Calendar heat-map view — enhanced with grouping, readable names, print support
  const [calGroup, setCalGroup] = React.useState('all'); // 'all'|'ok'|'fl'

  const calendarView=()=>{
    if(!calMonths.length) return div({style:{color:'var(--text3)',textAlign:'center',padding:40,fontSize:'11px'}},'Run a scan to populate the calendar view.');
    const [cy,cm]=activeMon.split('-').map(Number);
    const daysInMonth=new Date(cy,cm,0).getDate();
    // All store locs in scan results
    const scanLocs=[...new Set(allFlatRows.map(r=>r.loc))].sort();
    // Apply grouping filter
    const okScanLocs=scanLocs.filter(l=>(INV_ORG_COORDS[l]||{}).state==='OK');
    const flScanLocs=scanLocs.filter(l=>(INV_ORG_COORDS[l]||{}).state==='FL');
    const allStoreLocs=calGroup==='ok'?okScanLocs:calGroup==='fl'?flScanLocs:scanLocs;

    const DOW_S=['Su','Mo','Tu','We','Th','Fr','Sa'];
    // Store label: 4-digit number + 2-char state flag for easy identification
    // Consistent label: first 10 chars of city name — never falls back to loc# 
    const storeLbl=loc=>{
      const name=(STORE_NAMES[loc]||loc);
      const city=name.split('-')[0].trim();
      return city.length>10?city.slice(0,9)+'…':city;
    };
    const cellBg=rows=>{
      if(!rows||!rows.length) return 'transparent';
      if(rows.some(r=>r.isHoliday)) return 'rgba(245,188,0,.18)';
      const avg=rows.reduce((a,r)=>a+r.varPct,0)/rows.length;
      if(avg>25)return'rgba(16,185,129,.25)';if(avg>10)return'rgba(16,185,129,.14)';
      if(avg<-25)return'rgba(239,68,68,.25)';if(avg<-10)return'rgba(239,68,68,.14)';
      return avg>0?'rgba(16,185,129,.07)':'rgba(239,68,68,.07)';
    };
    const cellCol=rows=>{
      if(!rows||!rows.length) return 'var(--text3)';
      if(rows.some(r=>r.isHoliday)) return '#f5bc00';
      const avg=rows.reduce((a,r)=>a+r.varPct,0)/rows.length;
      return avg>0?'#10b981':'#ef4444';
    };
    // Print calendar: generates a standalone HTML window
    const printCalendar=()=>{
      const tbl=document.querySelector('.mf-cal-table');
      if(!tbl){alert('Calendar not visible');return;}
      const monthLabel=new Date(cy,cm-1,1).toLocaleDateString('en-US',{month:'long',year:'numeric'});
      const grpLabel=calGroup==='ok'?'MCDOK (OK)':calGroup==='fl'?'Emerald Arches (FL)':'All Locations';
      const win=window.open('','_blank','width=1200,height=900');
      win.document.write('<html><head><title>McForecast Anomaly Calendar — '+monthLabel+'</title>'+
        '<style>body{font-family:system-ui,sans-serif;font-size:8px;padding:16px;color:#111}'+
        'h2{font-size:14px;margin:0 0 6px}p{font-size:10px;color:#666;margin:0 0 10px}'+
        'table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:2px 3px;text-align:center}'+
        'th{background:#f5f5f5;font-weight:700;font-size:7px}'+
        '.wk{background:#fafafa}.leg{display:flex;gap:12px;margin-bottom:8px;font-size:9px;align-items:center}'+
        '.ls{width:14px;height:10px;border-radius:2px;display:inline-block;margin-right:3px;border:1px solid #ccc}'+
        '@media print{button{display:none}}</style></head><body>'+
        '<button onclick="window.print()" style="margin-bottom:12px;padding:6px 14px;background:#007aff;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px">🖨 Print</button>'+
        '<h2>📅 McForecast Anomaly Calendar — '+monthLabel+'</h2>'+
        '<p>'+grpLabel+' · '+allStoreLocs.length+' stores · Threshold ±'+(settings.anomalyThreshold||8)+'%</p>'+
        '<div class="leg">'+
          '<span><span class="ls" style="background:rgba(239,68,68,.4)"></span>Under baseline</span>'+
          '<span><span class="ls" style="background:rgba(16,185,129,.4)"></span>Over baseline</span>'+
          '<span><span class="ls" style="background:rgba(245,188,0,.35)"></span>Holiday</span>'+
          '<span><span class="ls" style="border:2px solid #10b981;background:transparent"></span>Tagged ✅</span>'+
        '</div>'+
        tbl.outerHTML+'</body></html>');
      win.document.close();
    };
    return div({style:{padding:'0 0 20px'}},
      // Controls row
      div({style:{display:'flex',gap:8,marginBottom:8,flexWrap:'wrap',alignItems:'center'}},
        // Month pills
        div({style:{display:'flex',gap:3,flexWrap:'wrap',alignItems:'center',flex:1}},
          span({style:{fontSize:'9px',color:'var(--text3)',marginRight:2}},'Month:'),
          calMonths.slice(0,24).map(m=>{
            const[my,mm]=m.split('-');
            const lbl=new Date(+my,+mm-1,1).toLocaleDateString('en-US',{month:'short',year:'2-digit'});
            return btn({key:m,onClick:()=>setCalMonth(m),
              style:{padding:'2px 8px',borderRadius:99,border:'.5px solid '+(activeMon===m?'rgba(245,158,11,.4)':'var(--bdr)'),
                background:activeMon===m?'var(--adim)':'transparent',
                color:activeMon===m?'var(--amber)':'var(--text2)',fontSize:'9px',cursor:'pointer'}},lbl);
          })
        ),
        // Group filter
        div({style:{display:'flex',gap:2,border:'.5px solid var(--bdr)',borderRadius:'var(--r)',overflow:'hidden',flexShrink:0}},
          ...['all','ok','fl'].map(g=>btn({key:g,onClick:()=>setCalGroup(g),
            style:{padding:'3px 8px',border:'none',fontSize:'9px',cursor:'pointer',
              background:calGroup===g?'var(--amber)':'transparent',
              color:calGroup===g?'#000':'var(--text3)'}},
            g==='all'?'All':g==='ok'?'OK':'FL'))
        ),
        btn({className:'btn btn-sm',style:{flexShrink:0},onClick:printCalendar},'🖨 Print')
      ),
      // Legend
      div({style:{display:'flex',gap:12,fontSize:'8px',color:'var(--text3)',marginBottom:8,flexWrap:'wrap'}},
        ...[
          ['rgba(239,68,68,.25)','none','Under baseline'],
          ['rgba(16,185,129,.25)','none','Over baseline'],
          ['rgba(245,188,0,.18)','none','Holiday 🎉'],
          ['transparent','1.5px solid #10b981','Tagged ✅'],
        ].map(([bg,brd,lbl],i)=>
          div({key:i,style:{display:'flex',alignItems:'center',gap:4}},
            div({style:{width:14,height:10,borderRadius:2,background:bg,border:brd}}),lbl))),
      div({style:{overflowX:'auto'}},
        h('table',{className:'mf-cal-table',style:{borderCollapse:'collapse',fontSize:'8px'}},
          h('thead',null,h('tr',null,
            th({style:{padding:'3px 8px',color:'var(--text3)',fontWeight:600,textAlign:'left',
              borderBottom:'.5px solid var(--bdr)',minWidth:52}},'Day'),
            allStoreLocs.map(loc=>th({key:loc,style:{padding:'2px 3px',textAlign:'center',
              borderBottom:'.5px solid var(--bdr)',fontWeight:600,color:'var(--text3)',
              minWidth:34,maxWidth:50,overflow:'hidden',whiteSpace:'nowrap',fontSize:'7px',
              writingMode:'vertical-rl',transform:'rotate(180deg)',height:60,verticalAlign:'bottom'},
              title:(STORE_NAMES[loc]||loc)},
              storeLbl(loc)))
          )),
          h('tbody',null,Array.from({length:daysInMonth},(_,idx)=>idx+1).map(day=>{
            const cellD=calCells[day];
            const d=cellD?cellD.date:new Date(cy,cm-1,day,12);
            const dow=d.getDay();
            const isWkend=dow===0||dow===6;
            return tr({key:day,style:{borderBottom:'.5px solid rgba(255,255,255,.025)',
              background:isWkend?'rgba(255,255,255,.015)':'transparent'}},
              td({style:{padding:'2px 8px',fontWeight:600,color:isWkend?'var(--text2)':'var(--text3)',
                whiteSpace:'nowrap',borderRight:'.5px solid var(--bdr)'}},
                DOW_S[dow]+' '+day),
              allStoreLocs.map(loc=>{
                const rows=(calCells[day]||{rows:[]}).rows.filter(r=>r.loc===loc);
                const isT2=rows.some(r=>isTagged(r.loc,nDK(r.dKeyStr)||r.dateStr));
                const bg=rows.length?cellBg(rows):'transparent';
                const brd=isT2?'1.5px solid #10b981':rows.length?'.5px solid rgba(255,255,255,.08)':'.5px solid transparent';
                const varP=rows.length?rows[0].varPct:0;
                return td({key:loc,title:rows.length?((STORE_NAMES[loc]||loc).split('-').pop().trim()+': '+(varP>0?'+':'')+varP.toFixed(1)+'%'):'',
                  style:{padding:'1px 2px',cursor:rows.length?'pointer':'default'},
                  onClick:()=>rows.length&&(setScanTab('all'),setSelLoc(loc))},
                  div({style:{width:26,height:16,borderRadius:2,background:bg,border:brd,
                    display:'flex',alignItems:'center',justifyContent:'center',
                    fontSize:'7px',fontWeight:700,color:rows.length?cellCol(rows):'transparent',
                    margin:'0 auto'}},
                    rows.length?(rows.some(r=>r.isHoliday)?'🎉':Math.round(Math.abs(varP))+'%'):''));
              })
            );
          }))
        )
      )
    );
  };

  return div({style:{padding:'0 2px'}},
    showEventEntry&&h(EventEntryModal,{stores,settings,onTagEvent,onClose:()=>setShowEventEntry(false)}),
    showEventRegistry&&h(EventRegistryModal,{stores,userEvents,onTagEvent,onClose:()=>setShowEventRegistry(false)}),

    // ── Regional Events review modal ─────────────────────────────────────────
    showRegional&&pendingRegional.length>0&&div({style:{position:'fixed',inset:0,
      background:'rgba(0,0,0,.75)',zIndex:400,display:'flex',alignItems:'center',
      justifyContent:'center',padding:20}},
      div({style:{background:'var(--surf)',border:'.5px solid var(--bdr2)',borderRadius:'var(--rl)',
        maxWidth:720,width:'100%',maxHeight:'85vh',display:'flex',flexDirection:'column'}},
        div({style:{padding:'14px 18px',borderBottom:'.5px solid var(--bdr)',
          display:'flex',alignItems:'center',gap:10,flexShrink:0}},
          div(null,
            div({style:{fontSize:'14px',fontWeight:700,color:'var(--amber)'}},'🌐 Regional Events — Review & Approve'),
            div({style:{fontSize:'10px',color:'var(--text3)',marginTop:2}},
              'AI detected broad events affecting multiple stores. Review and approve tagging.')),
          btn({onClick:()=>setShowRegional(false),style:{marginLeft:'auto',background:'none',
            border:'none',color:'var(--text2)',fontSize:20,cursor:'pointer'}},'×')),
        div({style:{overflowY:'auto',padding:'12px 18px',flex:1}},
          pendingRegional.map((event,ei)=>{
            const coords=STORE_COORDS[event.primaryRow.loc];
            return div({key:ei,style:{marginBottom:16,background:'rgba(245,158,11,.04)',
              border:'.5px solid rgba(245,158,11,.2)',borderRadius:8,padding:'12px 14px'}},
              div({style:{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}},
                div(null,
                  div({style:{fontSize:'11px',fontWeight:700,color:'var(--amber)'}},'⚠ '+event.tagLabel),
                  div({style:{fontSize:'9px',color:'var(--text3)',marginTop:2}},
                    'Detected at: '+(STORE_NAMES[event.primaryRow.loc]||event.primaryRow.loc)+
                    ' · '+(coords?coords.city+', '+coords.state:'Unknown')+
                    ' · '+event.primaryRow.dateStr)),
                btn({className:'btn btn-sm btn-red',onClick:()=>setPendingRegional(p=>p.filter((_,i)=>i!==ei))},'✕ Dismiss')),
              div({style:{fontSize:'9px',color:'var(--text2)',marginBottom:8,lineHeight:1.5}},event.event.summary||''),
              div({style:{marginBottom:8}},
                div({style:{fontSize:'8px',color:'var(--text3)',marginBottom:4,fontWeight:700}},'Nearby stores with same-date anomalies:'),
                div({style:{display:'flex',flexWrap:'wrap',gap:4}},
                  event.candidates.map((c,ci)=>div({key:ci,style:{fontSize:'8.5px',
                    background:'var(--surf2)',border:'.5px solid var(--bdr)',borderRadius:4,padding:'3px 8px'}},
                    sNameC(c.loc)+
                    ' · '+c.dist.toFixed(0)+'mi · '+(c.varPct>0?'+':'')+c.varPct.toFixed(1)+'%')))),
              div({style:{display:'flex',gap:6}},
                btn({className:'btn btn-a',style:{fontSize:'9px'},onClick:()=>{
                  event.candidates.forEach(c=>onTagEvent(c.loc,nDK(c.dKeyStr)||c.dateStr,event.fullNote,event.event.eventType||'other',{
                    tagLabel:event.tagLabel,aiMatched:true,aiConfidence:event.event.confidence,source:'Regional AI'}));
                  setPendingRegional(p=>p.filter((_,i)=>i!==ei));}},
                  'Apply to '+event.candidates.length+' Stores'),
                btn({className:'btn btn-sm',onClick:()=>setPendingRegional(p=>p.filter((_,i)=>i!==ei))},'Skip')
              )
            );
          })
        )
      )
    ),

    // ── Header ───────────────────────────────────────────────────────────────
    div({style:{marginBottom:8,display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:6}},
      div(null,
        div({style:{fontSize:'13px',fontWeight:700,marginBottom:2}},'🔍 Historical Sales Anomaly Scanner'),
        div({style:{fontSize:'9px',color:'var(--text3)',lineHeight:1.6}},
          span(null,'DOW trimmed mean baseline · holiday-excluded · all loaded history · '),
          span({style:{fontStyle:'italic'}},'vs LY% = same date 52 weeks prior. Anomaly = deviation from DOW avg > ±threshold.'))),
      pendingRegional.length>0&&btn({className:'btn btn-sm',style:{color:'#f5bc00',borderColor:'rgba(245,188,0,.3)'},
        onClick:()=>setShowRegional(true)},'🌐 '+pendingRegional.length+' Regional Pending')
    ),

    // ── Unified Controls bar ─────────────────────────────────────────────────
    div({style:{display:'flex',gap:5,alignItems:'center',flexWrap:'wrap',
      background:'var(--surf2)',border:'.5px solid var(--bdr)',borderRadius:'var(--r)',
      padding:'7px 10px',marginBottom:0}},
      // ── 🔽 FILTERS pill ────────────────────────────────────────────────
      div({style:{position:'relative'}},
        btn({className:'btn btn-sm',
          style:{display:'flex',alignItems:'center',gap:4,
            color:(dowFilter.length>0||threshold!==8)?'var(--amber)':'var(--text2)',
            borderColor:(dowFilter.length>0||threshold!==8)?'rgba(245,158,11,.4)':'var(--bdr)',
            background:(dowFilter.length>0||threshold!==8)?'var(--adim)':'transparent'},
          onClick:()=>setFiltersOpen(o=>!o)},
          '🔽 Filters',
          (dowFilter.length>0||threshold!==8)&&span({style:{fontSize:'8px',
            background:'var(--amber)',color:'#000',borderRadius:99,padding:'0 5px',marginLeft:3}},
            [threshold!==8?'±'+threshold+'%':'',dowFilter.length?dowFilter.length+'d':''].filter(Boolean).join(' ')),
          span({style:{fontSize:'9px',color:'var(--text3)',marginLeft:2}},filtersOpen?'▲':'▼')
        )
      ),
      div({style:{width:'.5px',height:14,background:'var(--bdr2)',margin:'0 2px'}}),
      btn({className:'btn btn-sm',style:{color:'#f5bc00',borderColor:'rgba(245,188,0,.3)'},
        title:'Auto-tag all detected holiday anomalies in current scan results',
        onClick:tagAllHolidays,disabled:!results||!allFlatRows.some(r=>r.isHoliday)},'🎉 Tag Holidays'),
      btn({className:'btn btn-sm',style:{color:'#10b981',borderColor:'rgba(16,185,129,.3)'},
        onClick:()=>setShowEventEntry(true)},'➕ Add Event'),
      btn({className:'btn btn-sm',style:{color:'#a5b4fc',borderColor:'rgba(165,180,252,.3)'},
        title:'View all tagged events registry',onClick:()=>setShowEventRegistry(true)},'📋 Registry'),
      div({style:{display:'flex',gap:4,marginLeft:'auto',flexWrap:'wrap',alignItems:'center'}},
        results&&btn({className:'btn btn-sm',onClick:exportCSV},'⬇ CSV'),
        results&&btn({className:'btn btn-sm',style:{color:'#60a5fa',borderColor:'rgba(96,165,250,.3)'},onClick:exportHTMLReport},'📊 Report'),
        results&&btn({className:'btn btn-sm',style:{color:'#a5b4fc',borderColor:'rgba(165,180,252,.3)'},
          onClick:()=>{const _aK=(()=>{try{return localStorage.getItem('mf_anthropic_key')||'';}catch{return '';}})();const _ue=(()=>{try{return JSON.parse(localStorage.getItem('mf_events')||'{}');}catch{return {};}})();const loc=selLoc&&selLoc!=='all'?selLoc:stores&&stores[0]&&stores[0].loc;if(!loc){alert('Select a location first.');return;}generateReviewPack(loc,ds,settings,_ue,_aK);}},'📤 Pack'),
        results&&btn({className:'btn btn-sm',style:{color:'#34d399',borderColor:'rgba(52,211,153,.3)'},
          onClick:()=>{const inp=document.createElement('input');inp.type='file';inp.accept='.json';inp.onchange=e=>{if(e.target.files[0])importReview(e.target.files[0],onTagEvent,(n,name)=>{alert('✅ Imported '+n+(n!==1?' responses':' response')+' from '+name+'.');});};inp.click();}},'📥 Import'),
        results&&!batchScanning&&btn({className:'btn btn-sm',disabled:!apiKey,
          style:{color:'#a5b4fc',borderColor:'rgba(165,180,252,.3)',opacity:apiKey?1:.45},
          title:apiKey?'AI scan all untagged anomalies (skips already-tagged rows)':'Add API key in Settings',
          onClick:runBatchAIScan},'🤖 AI Batch'),
        results&&batchScanning&&div({style:{display:'flex',alignItems:'center',gap:6}},
          span({style:{fontSize:'8.5px',color:'#a5b4fc',fontFamily:'var(--mono)'}},'🤖 '+batchProg.done+'/'+batchProg.total+' · '+batchProg.tagged+'✓'),
          btn({className:'btn btn-sm btn-red',style:{fontSize:'8px'},onClick:()=>{cancelBatchRef.current=true;setBatchScanning(false);}},'■ Stop')),
        results&&btn({className:'btn btn-sm',style:{color:'#ef4444',borderColor:'rgba(239,68,68,.3)'},
          title:'Clear cached scan results',onClick:clearCache},'🗑'),
        btn({className:'btn btn-a',onClick:runScan,disabled:scanning||!ds?.loaded,
          style:{fontWeight:700,padding:'5px 16px'}},
          scanning?'⏳ '+progress+'%…':results?'↻ Re-Scan':'▶ Run Scan')
      )
    ),

    // ── KPI Summary ───────────────────────────────────────────────────────────
    results&&div({style:{display:'flex',gap:5,marginBottom:8,flexWrap:'wrap'}},
      ...[
        {l:'Total',    v:tagCounts.tot,   col:'var(--text)',  bg:'rgba(255,255,255,.02)'},
        {l:'Under',    v:allFlatRows.filter(r=>r.varPct<0).length, col:'#f87171', bg:'rgba(239,68,68,.06)'},
        {l:'Over',     v:allFlatRows.filter(r=>r.varPct>0).length, col:'#34d399', bg:'rgba(16,185,129,.06)'},
        {l:'Tagged',   v:tagCounts.tagged+'  /  '+tagCounts.tot+'   ('+tagCounts.pct+'%)', col:'#10b981', bg:'rgba(16,185,129,.06)'},
        {l:'AI Auto',  v:tagCounts.aiTagged,  col:'#60a5fa',  bg:'rgba(96,165,250,.06)'},
        {l:'Holidays', v:tagCounts.hols,      col:'#f5bc00',  bg:'rgba(245,188,0,.06)'},
        {l:'Untagged', v:tagCounts.untagged,  col:tagCounts.untagged>0?'#f97316':'#10b981', bg:tagCounts.untagged>0?'rgba(249,115,22,.06)':'rgba(16,185,129,.04)'},
      ].map((k,i)=>div({key:i,style:{flex:'1 1 80px',minWidth:80,background:k.bg,
        border:'.5px solid var(--bdr)',borderRadius:6,padding:'6px 10px'}},
        div({style:{fontSize:'7.5px',textTransform:'uppercase',letterSpacing:'.4px',color:'var(--text3)',marginBottom:2}},k.l),
        div({style:{fontSize:'13px',fontFamily:'var(--mono)',fontWeight:700,color:k.col}},''+k.v)
      ))
    ),

    // ── Coverage progress bar ─────────────────────────────────────────────────
    results&&tagCounts.tot>0&&(()=>{
      const {tagged,aiTagged,manual,holTagged,tot}=tagCounts;
      const bar=(pct2,col)=>div({style:{height:'100%',width:Math.max(0,pct2)+'%',background:col,transition:'width .5s'}});
      return div({style:{background:'var(--surf2)',border:'.5px solid var(--bdr)',borderRadius:'var(--r)',
        padding:'5px 10px',marginBottom:8}},
        div({style:{display:'flex',justifyContent:'space-between',marginBottom:3,fontSize:'8px',color:'var(--text3)'}},
          span(null,'Coverage — '+tagged+' of '+tot+' tagged ('+tagCounts.pct+'%)'),
          div({style:{display:'flex',gap:10}},
            span(null,span({style:{color:'#10b981'}},'█'),' '+manual+' manual'),
            span(null,span({style:{color:'#60a5fa'}},'█'),' '+aiTagged+' AI'),
            span(null,span({style:{color:'#f5bc00'}},'█'),' '+holTagged+' holiday'),
            span({style:{color:tagCounts.untagged>0?'#f97316':'var(--text3)'}},span(null,'□'),' '+tagCounts.untagged+' open')
          )
        ),
        div({style:{height:5,borderRadius:3,background:'rgba(255,255,255,.06)',display:'flex',overflow:'hidden'}},
          bar(Math.round(manual/tot*100),'#10b981'),
          bar(Math.round(aiTagged/tot*100),'#60a5fa'),
          bar(Math.round(holTagged/tot*100),'#f5bc00')
        )
      );
    })(),

    // ── Toast: holiday auto-tag ───────────────────────────────────────────────
    autoHolTagged>0&&div({style:{background:'rgba(245,158,11,.08)',border:'.5px solid rgba(245,158,11,.3)',
      borderRadius:'var(--r)',padding:'4px 10px',marginBottom:6,fontSize:'8.5px',color:'#f59e0b',
      display:'flex',gap:8,alignItems:'center'}},
      '🎉 '+autoHolTagged+' holiday date'+(autoHolTagged!==1?'s':'')+' auto-tagged.',
      btn({style:{marginLeft:'auto',background:'none',border:'none',color:'#f59e0b',cursor:'pointer',fontSize:'10px'},
        onClick:()=>setAutoHolTagged(0)},'✕')
    ),

    // ── Tab bar ───────────────────────────────────────────────────────────────
    results&&div({style:{display:'flex',gap:0,borderBottom:'.5px solid var(--bdr)',marginBottom:10}},
      ...[
        {id:'all',      l:'📋 All',         n:sortedRows.length},
        {id:'review',   l:'❓ Needs Review', n:tagCounts.untagged},
        {id:'tagged',   l:'✅ Tagged',       n:tagCounts.tagged},
        {id:'holidays', l:'🎉 Holidays',     n:tagCounts.hols},
        {id:'calendar', l:'📅 Calendar',     n:null},
      ].map(t=>btn({key:t.id,
        style:{padding:'6px 12px',border:'none',
          borderBottom:scanTab===t.id?'2px solid var(--amber)':'2px solid transparent',
          fontSize:'10px',fontWeight:scanTab===t.id?700:400,background:'transparent',
          color:scanTab===t.id?'var(--amber)':'var(--text3)',cursor:'pointer',whiteSpace:'nowrap'},
        onClick:()=>setScanTab(t.id)},
        t.l+(t.n!=null?' ('+t.n+')':'')))
    ),

    // ── Calendar tab ──────────────────────────────────────────────────────────
    results&&scanTab==='calendar'&&calendarView(),

    // ── Table tabs ────────────────────────────────────────────────────────────
    results&&scanTab!=='calendar'&&div(null,
      // ── FILTERS expanded panel ────────────────────────────────────────────
      filtersOpen&&div({style:{background:'var(--surf2)',border:'.5px solid var(--bdr)',
        borderRadius:'var(--r)',padding:'12px 14px',marginBottom:6,
        display:'flex',flexDirection:'column',gap:10}},
        // Threshold
        div({style:{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}},
          div({style:{display:'flex',alignItems:'center',gap:6,flex:'0 0 auto'}},
            span({style:{fontSize:'9px',color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.3px',width:70}},'Threshold'),
            h('input',{type:'range',min:5,max:20,step:1,value:threshold,
              onChange:e=>setThreshold(+e.target.value),style:{width:80}}),
            span({style:{fontSize:'11px',fontFamily:'var(--mono)',color:'var(--amber)',fontWeight:700,minWidth:36}},'±'+threshold+'%')
          ),
          div({style:{fontSize:'8.5px',color:'var(--text3)',lineHeight:1.5,flex:1}},
            'Days where sales deviate from the DOW trimmed-mean baseline by more than this amount are flagged. ',
            span({style:{color:'var(--amber)'}},'Lower threshold = more flags. Higher = fewer, larger anomalies only.'))
        ),
        // DOW filter
        div({style:{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}},
          span({style:{fontSize:'9px',color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.3px',width:70,flexShrink:0}},'Day of Week'),
          div({style:{display:'flex',gap:3,flexWrap:'wrap'}},
            btn({className:'btn btn-sm',style:{fontSize:'8.5px',padding:'3px 8px',
              background:dowFilter.length===0?'var(--adim)':'transparent',
              color:dowFilter.length===0?'var(--amber)':'var(--text3)',
              borderColor:dowFilter.length===0?'rgba(245,158,11,.4)':'var(--bdr)'},
              onClick:()=>setDowFilter([])},'All'),
            ...DOW_LABELS.map((d,i)=>btn({key:i,className:'btn btn-sm',
              style:{fontSize:'8.5px',padding:'3px 8px',minWidth:30,
                background:dowFilter.includes(i)?'var(--adim)':'transparent',
                color:dowFilter.includes(i)?'var(--amber)':'var(--text3)',
                borderColor:dowFilter.includes(i)?'rgba(245,158,11,.4)':'var(--bdr)'},
              onClick:()=>setDowFilter(prev=>prev.includes(i)?prev.filter(x=>x!==i):[...prev,i])},d))
          ),
          dowFilter.length>0&&div({style:{fontSize:'8.5px',color:'var(--text3)',fontStyle:'italic'}},
            'Showing: '+dowFilter.map(i=>DOW_FULL[i]).join(', '))
        ),
        // Reset
        (threshold!==8||dowFilter.length>0)&&btn({className:'btn btn-sm',
          style:{alignSelf:'flex-start',fontSize:'8.5px',color:'var(--text3)'},
          onClick:()=>{setThreshold(8);setDowFilter([]);}},
          '↺ Reset Filters')
      ),
      // Location + sort + filter controls
      div({style:{display:'flex',gap:5,alignItems:'center',flexWrap:'wrap',marginBottom:7}},
        div({style:{display:'flex',flexDirection:'column',gap:1}},
          span({style:{fontSize:'7px',color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.3px'}},'Location'),
          h('select',{value:selLoc,onChange:e=>setSelLoc(e.target.value),
            style:{background:'var(--surf2)',border:'.5px solid var(--bdr)',borderRadius:'var(--r)',
              color:'var(--text)',fontSize:'10px',padding:'3px 8px',maxWidth:180}},
            h('option',{value:'all'},'All Stores ('+Object.keys(results||{}).length+')'),
            Object.keys(results||{}).map(loc=>h('option',{key:loc,value:loc},
              sNameC(loc))))),
        div({style:{display:'flex',flexDirection:'column',gap:1}},
          span({style:{fontSize:'7px',color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.3px'}},'Sort'),
          div({style:{display:'flex',gap:3}},
            btn({className:'btn btn-sm'+(sortBy==='variance'?' btn-a':''),onClick:()=>setSortBy('variance')},'Impact'),
            btn({className:'btn btn-sm'+(sortBy==='date'?' btn-a':''),onClick:()=>setSortBy('date')},'Date'))),
        scanTab==='all'&&div({style:{display:'flex',flexDirection:'column',gap:1}},
          span({style:{fontSize:'7px',color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.3px'}},'Include'),
          btn({className:'btn btn-sm'+(showHols?' btn-a':''),
            onClick:()=>setShowHols(v=>!v)},'🎉 Holidays')),
        span({style:{fontSize:'9px',color:'var(--text3)',alignSelf:'flex-end',paddingBottom:2}},
          tabRows.length+' rows'+(selLoc!=='all'?' · '+sNameC(selLoc):''))
      ),
      // Results table
      tabRows.length>0?
        h('table',{style:{width:'100%',borderCollapse:'collapse',fontSize:'9.5px'}},
          h('thead',null,h('tr',null,
            ...['Store','Date','Day','Actual $','DOW Avg','vs DOW%','vs LY%','Status',''].map((l,i)=>
              th({key:i,style:{padding:'5px 8px',fontSize:'8px',fontWeight:700,textTransform:'uppercase',
                letterSpacing:'.4px',color:'var(--text3)',borderBottom:'.5px solid var(--bdr)',
                textAlign:i>=3&&i<=5?'right':'left',whiteSpace:'nowrap'}},l))
          )),
          h('tbody',null,...tabRows.map((row,i)=>renderRow(row,i)))
        ):
        div({style:{color:'var(--text3)',textAlign:'center',padding:'28px 16px',fontSize:'11px',
          background:'rgba(255,255,255,.01)',borderRadius:'var(--r)',border:'.5px dashed var(--bdr)'}},
          scanTab==='review' ?'✓ All caught up — no unreviewed anomalies in current filter.':
          scanTab==='tagged' ?'No tagged anomalies yet. Run scan and start tagging.':
          scanTab==='holidays'?'No holidays detected. Check that your data covers holiday periods.':
          'No anomalies match the current filter.')
    ),

    // ── Empty state ────────────────────────────────────────────────────────────
    !results&&!scanning&&div({style:{color:'var(--text3)',fontSize:'11px',textAlign:'center',
      padding:'40px 16px',border:'.5px dashed var(--bdr)',borderRadius:'var(--rl)'}},
      div({style:{fontSize:'32px',marginBottom:12}},'🔍'),
      div({style:{fontWeight:700,color:'var(--text)',marginBottom:6}},'Ready to Scan'),
      div({style:{fontSize:'10px',lineHeight:1.8,color:'var(--text3)'}},
        'Compares each day to its store-specific day-of-week baseline.\n'+
        'Flags deviations beyond ±'+threshold+'%. Tags are stored separately\n'+
        'and persist across re-scans and page refreshes.'))
  );
}

function AttentionPanel({stores, onSelectStore, onClose}) {
  const [selStore, setSelStore] = React.useState(null);
  const [tab, setTab] = React.useState('critical');

  // Group findings by store, sorted by severity
  const storeFindings = React.useMemo(()=>{
    return (stores||[])
      .map(s=>({
        store:s,
        crits:s.findings.filter(f=>f.t==='crit'),
        warns:s.findings.filter(f=>f.t==='warn'),
        total:s.findings.filter(f=>f.t==='crit'||f.t==='warn').length
      }))
      .filter(x=>x.total>0)
      .sort((a,b)=>b.crits.length-a.crits.length||b.warns.length-a.warns.length);
  },[stores]);

  const critStores = storeFindings.filter(x=>x.crits.length>0);
  const warnStores = storeFindings.filter(x=>x.crits.length===0&&x.warns.length>0);
  const displayList = tab==='critical'?critStores:tab==='watch'?warnStores:storeFindings;

  const selectedItem = selStore ? storeFindings.find(x=>x.store.loc===selStore) : null;

  return div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.75)',zIndex:300,
    display:'flex',alignItems:'flex-start',justifyContent:'center',padding:'40px 20px',
    overflowY:'auto'}},

    div({style:{width:'100%',maxWidth:920,background:'var(--surf)',borderRadius:'var(--rl)',
      border:'.5px solid rgba(239,68,68,.3)',overflow:'hidden',
      boxShadow:'0 20px 60px rgba(0,0,0,.6)'}},

      // Header
      div({style:{display:'flex',alignItems:'center',justifyContent:'space-between',
        padding:'14px 20px',borderBottom:'.5px solid var(--bdr)',
        background:'rgba(239,68,68,.06)'}},
        div(null,
          div({style:{fontSize:'14px',fontWeight:800,color:'#f87171',
            letterSpacing:'-.2px'}},'⚠ Needs Attention — District Analysis'),
          div({style:{fontSize:'9px',color:'var(--text3)',marginTop:2}},
            critStores.length+' stores with critical issues · '+warnStores.length+' stores on watch · '+
            storeFindings.reduce((a,x)=>a+x.crits.length,0)+' total critical flags')
        ),
        btn({className:'btn btn-sm',onClick:onClose},'✕ Close')
      ),

      // Tab bar
      div({style:{display:'flex',gap:0,borderBottom:'.5px solid var(--bdr)'}},
        ...(['critical','watch','all']).map(t=>
          btn({key:t,onClick:()=>{setTab(t);setSelStore(null);},
            style:{padding:'8px 16px',fontSize:'10px',fontWeight:600,border:'none',
              borderBottom:tab===t?'2px solid #ef4444':'2px solid transparent',
              background:'transparent',color:tab===t?'#f87171':'var(--text3)',
              cursor:'pointer',textTransform:'capitalize'}},
            {critical:'🔴 Critical ('+critStores.length+')',
             watch:'🟡 Watch ('+warnStores.length+')',
             all:'All Flagged ('+storeFindings.length+')'}[t]
          )
        )
      ),

      // Two-column layout: list + detail
      div({style:{display:'flex',maxHeight:'65vh',overflow:'hidden'}},

        // Left: store list
        div({style:{width:280,flexShrink:0,borderRight:'.5px solid var(--bdr)',
          overflowY:'auto'}},
          displayList.length===0&&div({style:{padding:20,fontSize:'10px',color:'var(--text3)',
            textAlign:'center'}},'No issues in this category ✓'),
          displayList.map((item,i)=>
            div({key:item.store.loc,
              onClick:()=>setSelStore(selStore===item.store.loc?null:item.store.loc),
              style:{padding:'10px 14px',cursor:'pointer',borderBottom:'.5px solid var(--bdr)',
                background:selStore===item.store.loc?'rgba(239,68,68,.08)':'transparent',
                transition:'background .1s'},
              onMouseEnter:e=>{if(selStore!==item.store.loc)e.currentTarget.style.background='rgba(255,255,255,.03)';},
              onMouseLeave:e=>{if(selStore!==item.store.loc)e.currentTarget.style.background='transparent';}},
              div({style:{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:3}},
                span({style:{fontWeight:700,fontSize:'10px',color:'var(--text)'}},(item.store.name?item.store.name:sNameC(item.store.loc)).slice(0,22)),
                div({style:{display:'flex',gap:3}},
                  item.crits.length>0&&span({style:{fontSize:'8px',fontWeight:700,padding:'1px 4px',
                    borderRadius:3,background:'rgba(239,68,68,.15)',color:'#f87171'}},item.crits.length+' crit'),
                  item.warns.length>0&&span({style:{fontSize:'8px',fontWeight:700,padding:'1px 4px',
                    borderRadius:3,background:'rgba(245,158,11,.15)',color:'#f59e0b'}},item.warns.length+' watch')
                )
              ),
              // Top issue preview
              div({style:{fontSize:'8px',color:'var(--text3)',overflow:'hidden',
                textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:240}},
                (item.crits[0]||item.warns[0])?.m?.split('–')[0]?.trim()?.slice(0,60)||'')
            )
          )
        ),

        // Right: detail panel
        div({style:{flex:1,overflowY:'auto',padding:selectedItem?0:20}},
          selectedItem?
            div(null,
              // Store header in detail view
              div({style:{padding:'12px 16px',background:'rgba(255,255,255,.02)',
                borderBottom:'.5px solid var(--bdr)',display:'flex',alignItems:'center',
                justifyContent:'space-between'}},
                div(null,
                  div({style:{fontWeight:800,fontSize:'13px',color:'var(--amber)'}},(selectedItem.store.name||sNameC(selectedItem.store.loc))),
                  div({style:{fontSize:'9px',color:'var(--text3)'}},
                    (selectedItem.store.city||'')+', '+(selectedItem.store.state||'OK')+' · #'+selectedItem.store.loc+
                    ' · GM: '+(selectedItem.store.gm||'Unknown'))
                ),
                btn({className:'btn btn-sm',style:{fontSize:'9px'},
                  onClick:()=>{onSelectStore&&onSelectStore(selectedItem.store);}},
                  'Open Full Dashboard →')
              ),
              // Findings list with rich context
              div({style:{padding:'12px 16px'}},
                // Critical findings
                selectedItem.crits.length>0&&div({style:{marginBottom:12}},
                  div({style:{fontSize:'9px',fontWeight:700,letterSpacing:'.5px',
                    textTransform:'uppercase',color:'#f87171',marginBottom:6,
                    display:'flex',alignItems:'center',gap:4}},
                    span(null,'🔴'),span(null,'Critical Issues')
                  ),
                  ...selectedItem.crits.map((f,i)=>
                    div({key:i,style:{marginBottom:8,padding:'8px 12px',
                      background:'rgba(239,68,68,.06)',borderRadius:'var(--r)',
                      borderLeft:'3px solid #ef4444'}},
                      div({style:{fontSize:'10px',fontWeight:700,color:'#f87171',marginBottom:4}},
                        (f.m||'').split('–')[0].trim()),
                      div({style:{fontSize:'9px',color:'var(--text2)',lineHeight:1.6}},
                        ...mdToNodes((f.detail||f.m||'').replace(/^.*?–\s*/,'').trim()||
                          'This metric requires immediate attention. Review with your operations team and create an action plan.'))
                    )
                  )
                ),
                // Watch findings
                selectedItem.warns.length>0&&div(null,
                  div({style:{fontSize:'9px',fontWeight:700,letterSpacing:'.5px',
                    textTransform:'uppercase',color:'#f59e0b',marginBottom:6,
                    display:'flex',alignItems:'center',gap:4}},
                    span(null,'🟡'),span(null,'Watch Items')
                  ),
                  ...selectedItem.warns.map((f,i)=>
                    div({key:i,style:{marginBottom:6,padding:'8px 12px',
                      background:'rgba(245,158,11,.06)',borderRadius:'var(--r)',
                      borderLeft:'3px solid #f59e0b'}},
                      div({style:{fontSize:'9px',fontWeight:700,color:'#f59e0b',marginBottom:2}},
                        (f.m||'').split('–')[0].trim()),
                      div({style:{fontSize:'9px',color:'var(--text3)',lineHeight:1.5}},
                        (f.m||'').replace(/^.*?–\s*/,'').trim().slice(0,200))
                    )
                  )
                ),
                // Metrics snapshot for context
                selectedItem.store.p&&div({style:{marginTop:12,padding:'8px 12px',
                  background:'var(--surf2)',borderRadius:'var(--r)'}},
                  div({style:{fontSize:'9px',fontWeight:700,color:'var(--text3)',
                    marginBottom:6,textTransform:'uppercase',letterSpacing:'.4px'}},'Metrics Snapshot'),
                  div({style:{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'4px 12px'}},
                    ...([
                      ['Ops Score',selectedItem.store.opsScore+'/100'],
                      ['Ctrl Score',selectedItem.store.ctrlScore+'/100'],
                      ['OEPE',selectedItem.store.p.oepe>0?Math.round(selectedItem.store.p.oepe)+'s':'—'],
                      ['TPPH',selectedItem.store.p.tpph>0?selectedItem.store.p.tpph.toFixed(2):'—'],
                      ['Labor%',selectedItem.store.p.laborPct>0?(selectedItem.store.p.laborPct*100).toFixed(1)+'%':'—'],
                      ['T2W Trend',selectedItem.store.p.t2w!=null?((selectedItem.store.p.t2w>=0?'+':'')+selectedItem.store.p.t2w.toFixed(1)+'%'):'—'],
                    ].map(([l,v],i)=>div({key:i,style:{display:'flex',justifyContent:'space-between',
                      fontSize:'9px',borderBottom:'.5px solid rgba(255,255,255,.04)',paddingBottom:2}},
                      span({style:{color:'var(--text3)'}},l),
                      span({style:{fontFamily:'var(--mono)',color:'var(--text)',fontWeight:600}},v)
                    )))
                  )
                )
              )
            )
          :div({style:{display:'flex',flexDirection:'column',alignItems:'center',
              justifyContent:'center',height:'100%',color:'var(--text3)',gap:8}},
              div({style:{fontSize:'24px'}},'←'),
              div({style:{fontSize:'10px'}},
                displayList.length>0?'Select a store to see detailed analysis':'No issues found')
            )
        )
      )
    )
  );
}




function DialedInPanel({stores, ds, settings, userEvents, onUpdateSettings, onClose}) {
  const [running,  setRunning]  = React.useState(false);
  const [results,  setResults]  = React.useState(()=>{
    try{const s=localStorage.getItem('mf_dialed_in');return s?JSON.parse(s):{};}catch{return {};}
  });
  const [progress, setProgress] = React.useState(0);
  const [curStore, setCurStore] = React.useState('');
  // comboProgress (v4.195): intra-store progress, 0-100, driven by
  // calibrateStore's onProgress callback. Needed now that a single store's
  // grid search takes ~3s (was ~6ms pre-v4.195 grid expansion) — without
  // this, the per-store-only progress bar below would visibly freeze for
  // that whole duration on every store, looking hung rather than working.
  const [comboProgress, setComboProgress] = React.useState(0);
  const [selLoc,   setSelLoc]   = React.useState('all');
  const [storeLog, setStoreLog] = React.useState([]); // per-store calibration results

  const runAll = async () => {
    if(!ds||!ds.loaded) return;
    setRunning(true); setProgress(0); setStoreLog([]);
    const locs=ds.storeIds.filter(l=>/^\d+$/.test(l)); // exclude 'NaN'/'Total' rows
    const updated={...results};
    const log=[];
    for(let i=0;i<locs.length;i++){
      const loc=locs[i];
      setCurStore(STORE_NAMES[loc]||loc);
      setProgress(Math.round(i/locs.length*100));
      setComboProgress(0);
      let cal=null;
      const rowCount=(ds.laborRows||[]).filter(r=>r.loc===loc&&r.sales>0).length;
      try{cal=await calibrateStore(loc,ds,{...settings,_userEvents:userEvents},(done,total)=>setComboProgress(Math.round(done/total*100)));}catch(err){
        console.warn('Calibration error for',loc,err);
        log.push({loc,status:'error',detail:err.message||'unknown error',rows:rowCount});
        setStoreLog([...log]);
        continue;
      }
      if(cal&&!cal._why){
        updated[loc]=cal;
        log.push({loc,status:'ok',mape:cal.mape,rows:rowCount});
      } else {
        const _reason=cal&&cal._why?cal._why:'returned bare null';
        log.push({loc,status:'null',detail:_reason,rows:rowCount});
      }
      setStoreLog([...log]);
      await new Promise(r=>setTimeout(r,0));
      // Save to localStorage every 5 stores — protects against any mid-loop crash
      if(i>0&&i%5===0){try{localStorage.setItem('mf_dialed_in',JSON.stringify(updated));}catch(e){}}
    }
    setResults(updated);
    try{localStorage.setItem('mf_dialed_in',JSON.stringify(updated));}catch(e){}
    // Push calibrations into settings.dialedIn — pass plain object, not function updater
    // (saveSettings does JSON.stringify which corrupts localStorage if given a function)
    if(onUpdateSettings){
      const merged = {...settings, dialedIn:{...(settings.dialedIn||{}),...updated}};
      onUpdateSettings(merged);
    }
    setRunning(false); setCurStore(''); setProgress(100);
  };

  const runOne = async (loc) => {
    if(!ds||!ds.loaded) return;
    setRunning(true); setCurStore(STORE_NAMES[loc]||loc); setProgress(0); setComboProgress(0);
    let cal=null;
    try{cal=await calibrateStore(loc,ds,{...settings,_userEvents:userEvents},(done,total)=>setComboProgress(Math.round(done/total*100)));}catch(err){console.warn('Calibration error for',loc,err);}
    const updated={...results};
    if(cal){
      updated[loc]=cal;
      setResults(updated);
      try{localStorage.setItem('mf_dialed_in',JSON.stringify(updated));}catch(e){}
      if(onUpdateSettings) onUpdateSettings({...settings,dialedIn:{...(settings.dialedIn||{}),[loc]:cal}});
    }
    setRunning(false); setCurStore(''); setProgress(100);
  };

  const clearAll = () => {
    setResults({});
    try{localStorage.removeItem('mf_dialed_in');}catch(e){}
    if(onUpdateSettings) onUpdateSettings({...settings,dialedIn:{},dialedInEnabled:false});
  };

  const applyAll = () => {
    if(onUpdateSettings) onUpdateSettings({...settings,dialedIn:{...(settings.dialedIn||{}),...results},dialedInEnabled:true});
  };

  const dispLocs = selLoc==='all' ? Object.keys(results) : [selLoc].filter(l=>results[l]);
  const calibCount = Object.keys(results).length;
  const allMapeVals = Object.values(results).map(r=>r.mape||0);
  const avgMape = calibCount>0 ? (allMapeVals.reduce((a,v)=>a+v,0)/calibCount).toFixed(2) : '—';
  // medianMape (v4.195): the mean above is easily dominated by a small number
  // of stores with pre-documented historical-data anomalies (e.g. a store
  // with known bad early-data periods showing 175%+ or 350%+ full-history
  // MAPE while its recent-window MAPE is healthy single digits — see the
  // per-store Recalibrate/Review flags below for which ones). Median is
  // naturally robust to that without needing a hardcoded exclude-list tied
  // to today's specific anomalies, which would silently stop helping the
  // moment a different, not-yet-flagged store has a bad data period.
  // Showing both rather than picking one avoids silently hiding either signal.
  const medianMape = (()=>{
    if(!allMapeVals.length) return '—';
    const sorted=[...allMapeVals].sort((a,b)=>a-b);
    const mid=Math.floor(sorted.length/2);
    const med=sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2;
    return med.toFixed(2);
  })();
  const mapeColor = m => m<4?'#10b981':m<6?'#f59e0b':m<9?'#fb923c':'#ef4444';

  return div({style:{display:'flex',flexDirection:'column',height:'80vh'}},
    // Header
    div({style:{padding:'14px 18px',borderBottom:'.5px solid var(--bdr)',display:'flex',alignItems:'center',gap:10}},
      div(null,
        div({style:{fontSize:'14px',fontWeight:700}},'🎯 Dialed-In — Per-Store Calibration Engine'),
        div({style:{fontSize:'10px',color:'var(--text3)',marginTop:2}},
          'Grid-searches '+lyWs_label+' parameter combos per store. Finds the model configuration that minimizes forecast error (MAPE) for each location individually.')
      ),
      div({style:{marginLeft:'auto',display:'flex',gap:8,alignItems:'center'}},

        btn({onClick:onClose,style:{background:'none',border:'none',color:'var(--text2)',fontSize:22,cursor:'pointer'}},'×')
      )
    ),

    // Stats bar
    div({style:{display:'flex',gap:8,padding:'10px 18px',borderBottom:'.5px solid var(--bdr)',flexWrap:'wrap'}},
      [{l:'Calibrated Stores',v:calibCount+'/'+stores.length,c:'var(--amber)'},
       {l:'MAPE (Full) — Mean / Median',
         v:avgMape+'% / '+medianMape+'%',
         c:avgMape!=='—'?mapeColor(+avgMape):'var(--text3)',
         title:(avgMape!=='—'&&medianMape!=='—'&&Math.abs(+avgMape-+medianMape)>5)
           ?'Mean and median diverge significantly — likely 1-2 stores with known historical data anomalies (bad early periods, recent data fine) are pulling the mean up. Check the Rec. column below for ⚠ Recalibrate / ❌ Review flags. Median is more representative of typical store performance.'
           :'Average forecast error across all calibrated stores, full eval window.'},
       {l:'Avg 6W MAPE',...(()=>{const vals=(stores||[]).filter(s=>/^\d+$/.test(s.loc)&&settings.dialedIn&&settings.dialedIn[s.loc]&&settings.dialedIn[s.loc].mape6w!=null);const avg=vals.length?vals.reduce((a,s)=>a+settings.dialedIn[s.loc].mape6w,0)/vals.length:null;return{v:avg!=null?avg.toFixed(1)+'%':'—',c:avg!=null?mapeColor(avg):'var(--text3)'};})()},
       {l:'Avg 4W MAPE',...(()=>{const vals=(stores||[]).filter(s=>/^\d+$/.test(s.loc)&&settings.dialedIn&&settings.dialedIn[s.loc]&&settings.dialedIn[s.loc].mape4w!=null);const avg=vals.length?vals.reduce((a,s)=>a+settings.dialedIn[s.loc].mape4w,0)/vals.length:null;return{v:avg!=null?avg.toFixed(1)+'%':'—',c:avg!=null?mapeColor(avg):'var(--text3)'};})()},
       {l:'Avg 2W MAPE',...(()=>{const vals=(stores||[]).filter(s=>/^\d+$/.test(s.loc)&&settings.dialedIn&&settings.dialedIn[s.loc]&&settings.dialedIn[s.loc].mape2w!=null);const avg=vals.length?vals.reduce((a,s)=>a+settings.dialedIn[s.loc].mape2w,0)/vals.length:null;return{v:avg!=null?avg.toFixed(1)+'%':'—',c:avg!=null?mapeColor(avg):'var(--text3)'};})()},
       {l:'Status',v:running?('⏳ '+curStore+'…'):'Ready',c:running?'#60a5fa':'#10b981'},
      ].map((k,i)=>div({key:i,title:k.title,style:{flex:1,minWidth:100,background:'var(--surf2)',borderRadius:'var(--r)',
        padding:'6px 12px',textAlign:'center',cursor:k.title?'help':'default'}},
        div({style:{fontSize:'8px',color:'var(--text3)',marginBottom:2}},k.l),
        div({style:{fontFamily:'var(--mono)',fontSize:'13px',fontWeight:700,color:k.c}},k.v)
      ))
    ),

    // Progress
    running&&div({style:{padding:'8px 18px'}},
      div({style:{height:4,background:'var(--surf2)',borderRadius:2,overflow:'hidden'}},
        div({style:{width:progress+'%',height:'100%',background:'var(--amber)',transition:'width .3s',borderRadius:2}})
      ),
      div({style:{fontSize:'9px',color:'var(--text3)',marginTop:4,textAlign:'center'}},
        progress+'% — calibrating '+curStore),
      // Intra-store grid-search progress (v4.195) — a single store's search
      // now takes ~3s (446K combos, was ~6ms at 540), so without this the
      // bar above would visibly freeze at one percentage for that whole
      // stretch on every store, looking hung rather than working.
      div({style:{height:2,background:'var(--surf2)',borderRadius:1,overflow:'hidden',marginTop:5}},
        div({style:{width:comboProgress+'%',height:'100%',background:'#818cf8',transition:'width .15s',borderRadius:1}})
      ),
      div({style:{fontSize:'7.5px',color:'var(--text3)',marginTop:2,textAlign:'center'}},
        'grid search: '+comboProgress+'%')
    ),

    // Controls
    div({style:{display:'flex',gap:6,padding:'10px 18px',borderBottom:'.5px solid var(--bdr)',flexWrap:'wrap'}},
      btn({className:'btn btn-a',onClick:runAll,disabled:running||!ds?.loaded,style:{fontWeight:700}},
        running?'⏳ Calibrating…':'▶ Calibrate All '+stores.length+' Stores'),
      calibCount>0&&div({style:{display:'flex',alignItems:'center',gap:8}},
        btn({className:'btn btn-sm',onClick:applyAll,disabled:running},'✓ Apply & Enable'),
        div({style:{display:'flex',alignItems:'center',gap:4,fontSize:'10px',color:settings.dialedInEnabled?'#10b981':'var(--text3)'}},
          h('input',{type:'checkbox',checked:!!settings.dialedInEnabled,
            onChange:e=>onUpdateSettings&&onUpdateSettings({...settings,dialedInEnabled:e.target.checked}),
            id:'dial-en'}),
          h('label',{htmlFor:'dial-en',style:{cursor:'pointer'}},
            settings.dialedInEnabled?'✓ Active — Using calibrated params':'Disabled — Using default params')
        )
      ),
      calibCount>0&&btn({className:'btn btn-sm',style:{color:'#ef4444',borderColor:'rgba(239,68,68,.3)'},onClick:clearAll,disabled:running},'🗑 Clear All'),
      div({style:{marginLeft:'auto',display:'flex',alignItems:'center',gap:6}},
        h('select',{value:selLoc,onChange:e=>setSelLoc(e.target.value),
          style:{background:'var(--surf)',border:'.5px solid var(--bdr)',borderRadius:'var(--r)',
            color:'var(--text)',fontSize:'10px',padding:'3px 8px'}},
          h('option',{value:'all'},'All Calibrated Stores'),
          stores.map(s=>h('option',{key:s.loc,value:s.loc},s.name+(results[s.loc]?' ✓':'')))
        )
      )
    ),

    // Results table
    div({style:{flex:1,overflowY:'auto',padding:'0 18px'}},
      // ── Per-store calibration log (shows after each run) ──
      storeLog.length>0&&div({style:{marginBottom:12,border:'.5px solid var(--bdr)',
        borderRadius:'var(--r)',overflow:'hidden',fontSize:'9px'}},
        div({style:{display:'flex',justifyContent:'space-between',padding:'4px 10px',
          background:'var(--surf3)',fontWeight:700,fontSize:'9px',color:'var(--text2)'}},
          span(null,'Last Calibration Run — '+storeLog.length+' stores processed'),
          span({style:{color:'#10b981'}},storeLog.filter(s=>s.status==='ok').length+' succeeded')
        ),
        storeLog.filter(s=>s.status!=='ok').map((s,i)=>
          div({key:i,style:{display:'flex',gap:8,padding:'3px 10px',
            borderTop:'.5px solid var(--bdr)',background:'rgba(239,68,68,.04)'}},
            span({style:{color:'#f87171',fontWeight:700,minWidth:14}},'✗'),
            span({style:{fontWeight:600,minWidth:120}},sNameC(s.loc)),
            span({style:{color:'var(--text3)'}},'Rows: '+s.rows),
            span({style:{color:'#f87171',flex:1}},'→ '+s.detail)
          )
        )
      ),
      calibCount===0&&!running&&div({style:{textAlign:'center',padding:32,color:'var(--text3)',fontSize:'11px'}},
        'No calibrations yet. Hit "Calibrate All" to run.\nEach store needs ~60+ days of history to calibrate.\nTakes about 10-15 seconds for the full district.'),
      calibCount>0&&div({style:{overflowX:'auto',paddingTop:10}},
        tbl({style:{width:'100%',borderCollapse:'collapse',fontSize:'10px'}},
          h('thead',null,tr(null,
            ...['Store',div({style:{display:'inline-flex',alignItems:'center',gap:3}},'MAPE',h(InfoIcon,{articleKey:'mape'})),'Trend →','6W','4W','2W','1W','T2W wt','T4W wt','T6W wt','Ops Mult','Samples','Run Date','Rec.','USE DI',''].map((l,j)=>
              th({key:j,style:{padding:'5px 8px',background:'var(--surf3)',fontSize:'8px',textTransform:'uppercase',
                letterSpacing:'.3px',color:'var(--text2)',textAlign:j>0?'right':'left',borderBottom:'.5px solid var(--bdr)'}},l)
            )
          )),
          h('tbody',null, dispLocs.map((loc,i)=>{
            const r=results[loc];
            if(!r) return null;
            // Compare to default MAPE (not stored — show improvement direction)
            const mc=mapeColor(r.mape);
            return tr({key:loc,style:{borderBottom:'.5px solid var(--bdr)',background:i%2?'rgba(255,255,255,.01)':'transparent'}},
              td({style:{padding:'5px 8px',fontWeight:600,maxWidth:180,overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis'}},STORE_NAMES[loc]||loc),
              td({style:{padding:'5px 8px',textAlign:'right',fontFamily:'var(--mono)',fontWeight:700,color:mc}},
                r.mape.toFixed(2)+'%',
                // recentOnly detection indicator (v4.195) — only renders for
                // stores flagged recentOnly in DEFAULT_MODEL_ASSIGNMENTS
                // (Elgin, Mossy Head, Tishomingo, Ponce de Leon). Lets
                // Fletcher directly verify the auto-detected clean-data
                // boundary rather than only trusting the resulting MAPE.
                r.recentOnlyFlag && (r.windowApplied
                  ? h('span',{title:'Recency window applied: bad early-data period auto-detected, calibration restricted to data starting '+r.windowStart+' (detected clean data beginning '+r.cleanDataDetected+'). Protects against the documented historical data anomaly for this store.',
                      style:{marginLeft:5,fontSize:'9px',cursor:'help',color:'#818cf8'}},'📅')
                  : h('span',{title:'This store is flagged as having a historical data anomaly, but auto-detection could not confidently find a clean-data boundary — no restriction was applied. Full MAPE may be inflated by bad early data; check 6W/4W/2W/1W instead.',
                      style:{marginLeft:5,fontSize:'9px',cursor:'help',color:'#f59e0b'}},'⚠'))
              ),
              // Trend sparkline: 6W→4W→2W→1W direction
              td({style:{padding:'5px 8px',textAlign:'center',fontSize:'11px'},
                title:r.mape6w!=null&&r.mape1w!=null?('6W:'+r.mape6w.toFixed(1)+'% → 1W:'+r.mape1w.toFixed(1)+'%'):'Run calibration to see trend'},
                r.mape6w!=null&&r.mape1w!=null?(
                  r.mape1w<r.mape6w-2?span({style:{color:'#10b981'}},'▼ Better'):
                  r.mape1w>r.mape6w+2?span({style:{color:'#f87171'}},'▲ Worse'):
                  span({style:{color:'#f59e0b'}},'→ Stable')
                ):'—'),
              td({style:{padding:'5px 8px',textAlign:'right',fontSize:'9px',color:r.mape6w!=null?mapeColor(r.mape6w):'var(--text3)',fontFamily:'var(--mono)'}},r.mape6w!=null?r.mape6w.toFixed(1)+'%':'—'),
              td({style:{padding:'5px 8px',textAlign:'right',fontSize:'9px',color:r.mape4w!=null?mapeColor(r.mape4w):'var(--text3)',fontFamily:'var(--mono)'}},r.mape4w!=null?r.mape4w.toFixed(1)+'%':'—'),
              td({style:{padding:'5px 8px',textAlign:'right',fontSize:'9px',color:r.mape2w!=null?mapeColor(r.mape2w):'var(--text3)',fontFamily:'var(--mono)',fontWeight:r.mape2w!=null?700:400}},
                // Drift indicator: if 2W MAPE is 5+ points worse than 6W
                r.mape2w!=null?span(null,r.mape2w.toFixed(1)+'%',
                  r.mape6w!=null&&r.mape2w>r.mape6w+5?span({style:{marginLeft:4,color:'#f87171'},title:'Model drifting — consider recalibrating'},'⚠')
                  :r.mape6w!=null&&r.mape2w<r.mape6w-3?span({style:{marginLeft:4,color:'#10b981'},title:'Model improving'},'▲'):null
                ):'—'),
              td({style:{padding:'5px 8px',textAlign:'right',fontSize:'9px',color:r.mape1w!=null?mapeColor(r.mape1w):'var(--text3)',fontFamily:'var(--mono)',fontWeight:r.mape1w!=null?700:400},
                title:'Last 7 days — most comparable to a Date Range Report for Last Week'},
                r.mape1w!=null?r.mape1w.toFixed(1)+'%':'—'),
              td({style:{padding:'5px 8px',textAlign:'right',fontFamily:'var(--mono)'}},(r.t2*100).toFixed(0)+'%'),
              td({style:{padding:'5px 8px',textAlign:'right',fontFamily:'var(--mono)'}},((r.t4||0)*100).toFixed(0)+'%'),
              td({style:{padding:'5px 8px',textAlign:'right',fontFamily:'var(--mono)'}},(r.t6*100).toFixed(0)+'%'),
              td({style:{padding:'5px 8px',textAlign:'right',fontFamily:'var(--mono)'}},(r.opsMult||1).toFixed(2)+'x'),
              td({style:{padding:'5px 8px',textAlign:'right',color:'var(--text3)'}},r.samples),
              td({style:{padding:'5px 8px',textAlign:'right',fontSize:'9px',color:'var(--text3)'}},r.runDate||'—'),
              // ── Recommendation cell ──────────────────────────────
              td({style:{padding:'5px 8px',textAlign:'center'}},
                (()=>{
                  const rec=getDIRecommendation(r);
                  if(!rec) return span({style:{color:'var(--text3)',fontSize:'9px'}},'—');
                  return span({title:rec.detail,
                    style:{display:'inline-block',fontSize:'8.5px',fontWeight:700,
                      padding:'2px 8px',borderRadius:3,whiteSpace:'nowrap',cursor:'default',
                      color:rec.color,background:rec.bg,border:'.5px solid '+rec.border}},
                    rec.label);
                })()
              ),
              // ── Per-store DI Enable/Skip toggle ──
              td({style:{padding:'5px 8px',textAlign:'center'}},
                (()=>{
                  const skipped=(settings.dialedInSkipped||[]).includes(loc);
                  return btn({
                    className:'btn btn-sm',
                    title:skipped?'Click to USE Dialed-In for this store':'Click to SKIP Dialed-In for this store (use default model)',
                    style:{fontSize:'9px',padding:'2px 8px',
                      background:skipped?'rgba(239,68,68,.1)':'rgba(16,185,129,.1)',
                      color:skipped?'#ef4444':'#10b981',
                      border:'.5px solid '+(skipped?'rgba(239,68,68,.3)':'rgba(16,185,129,.3)')},
                    onClick:()=>{
                      if(!onUpdateSettings)return;
                      const cur=(settings.dialedInSkipped||[]);
                      const next=skipped?cur.filter(x=>x!==loc):[...cur,loc];
                      onUpdateSettings({...settings,dialedInSkipped:next});
                    }
                  }, skipped?'⊘ Skip':'✓ Use');
                })()
              ),
              td({style:{padding:'5px 8px',textAlign:'right'}},
                div({style:{display:'flex',gap:3,alignItems:'center',justifyContent:'flex-end'}},
                  (()=>{
                    const curFp=JSON.stringify({lyOutlierThreshold:settings.lyOutlierThreshold,opsNorm:settings.opsNorm});
                    return (r.settingsFp&&r.settingsFp!==curFp)?
                      span({style:{fontSize:'9px',color:'#f59e0b'},title:'Settings changed — recalibrate recommended'},'🔄'):null;
                  })(),
                  btn({className:'btn btn-sm',disabled:running,onClick:()=>runOne(loc)},'↻')
                ))
            );
          }))
        )
      )
    )
  );
}

// label for the UI
const lyWs_label = '~21,500';

const FILE_TYPE_LABELS={labor:'Labor Analysis',ops:'Service/Ops',ctrl:'Controls',weather:'Weather',peaks:'3 Peaks',register:'Register Audit',targets:'Targets',trends:'Trends',records:'Records',inventory:'Inventory Summary & Usage'};

// APP ROOT (SECTION 19)

// DATE-RANGE COMPREHENSIVE REPORT
function DateRangeReport({stores, ds, settings, userEvents, onClose}) {
  const today = new Date();
  const fmt = d => d.toISOString().slice(0,10);
  const [startDate, setStartDate] = React.useState(fmt(addD(today,-13)));
  const [endDate,   setEndDate]   = React.useState(fmt(today));
  const [selLocs,   setSelLocs]   = React.useState(['all']);
  const [running,   setRunning]   = React.useState(false);
  const [report,    setReport]    = React.useState(null);

  const toggleLoc = loc => {
    if(loc==='all'){ setSelLocs(['all']); return; }
    setSelLocs(prev => {
      const without = prev.filter(l=>l!=='all'&&l!==loc);
      return prev.includes(loc) ? (without.length?without:['all']) : [...without,loc];
    });
  };

  const buildReport = async () => {
    setRunning(true);
    const s = new Date(startDate+'T00:00:00'), e = new Date(endDate+'T23:59:59');
    const targetLocs = selLocs.includes('all') ? (ds.storeIds||[]) : selLocs;
    const results = [];
    for(const loc of targetLocs){
      const rows = (ds.laborRows||[]).filter(r=>r.loc===loc&&r.date>=s&&r.date<=e&&r.sales>0);
      if(!rows.length) continue;
      const store = stores.find(st=>st.loc===loc);
      if(!store) continue;
      const {p,t} = store;
      const actualSales  = rows.reduce((a,r)=>a+r.sales,0);
      const fcRows = rows.map(r=>forecastDay(loc,r.date,ds,{...settings,_userEvents:userEvents}));
      const fcSales = fcRows.reduce((a,r)=>a+(r.forecast||0),0);
      const lySales = fcRows.reduce((a,r)=>a+(r.lyAdj||0),0);
      const mape = rows.length>=3 ? rows.reduce((a,r,i)=>{
        const fc=fcRows[i].forecast; return a+(fc>0?Math.abs(r.sales-fc)/r.sales*100:0);
      },0)/rows.length : null;
      const passRate = rows.length>=3 ? rows.filter((r,i)=>{
        const fc=fcRows[i].forecast;
        return fc>0&&Math.abs(r.sales-fc)/r.sales<=(settings.tolerance||5)/100;
      }).length/rows.length*100 : null;
      const opsRows = (ds.opsRows||[]).filter(r=>r.loc===loc&&r.date>=s&&r.date<=e);
      const ctrlRows = (ds.ctrlRows||[]).filter(r=>r.loc===loc&&r.date>=s&&r.date<=e);
      const avgOepe = opsRows.length?opsRows.reduce((a,r)=>a+(r.oepe||0),0)/opsRows.length:p.oepe||0;
      // TPPH is in laborRows (not opsRows) — fix source
      const avgTpph = rows.filter(r=>r.tpph>0).length ? rows.filter(r=>r.tpph>0).reduce((a,r)=>a+r.tpph,0)/rows.filter(r=>r.tpph>0).length : p.tpph||0;
      // Only average days with actual labor data (exclude zero-labor days from avg)
      const _laborRows = rows.filter(r=>r.laborPct>0.01); // >1% to exclude missing data
      const avgLabor = _laborRows.length ? _laborRows.reduce((a,r)=>a+r.laborPct,0)/_laborRows.length : p.laborPct||0;
      const avgCheck = rows.filter(r=>r.avgCheck>0).reduce((a,r,_,arr)=>a+r.avgCheck/arr.length,0)||p.avgCheck||0;
      results.push({loc,name:STORE_NAMES[loc]||loc,days:rows.length,
        actualSales,fcSales,lySales,
        vsLY:lySales>0?(actualSales-lySales)/lySales:null,
        vsFc:fcSales>0?(actualSales-fcSales)/fcSales:null,
        mape,passRate,avgOepe,avgTpph,avgLabor,avgCheck,
        opsScore:store.opsScore,ctrlScore:store.ctrlScore});
      await new Promise(r=>setTimeout(r,0));
    }
    results.sort((a,b)=>b.actualSales-a.actualSales);
    setReport({results,startDate,endDate,generatedAt:new Date().toISOString()});
    setRunning(false);
  };

  const exportCSV = () => {
    if(!report) return;
    const hdr = ['Store','Days','Actual Sales','vs LY%','vs Forecast%','MAPE%','Pass Rate%','Avg Check','OEPE','TPPH','Labor%','Ops Score','Ctrl Score'];
    const rows = report.results.map(r=>[
      r.name,r.days,r.actualSales.toFixed(0),
      r.vsLY!=null?(r.vsLY*100).toFixed(1):'—',
      r.vsFc!=null?(r.vsFc*100).toFixed(1):'—',
      r.mape!=null?r.mape.toFixed(1):'—',
      r.passRate!=null?r.passRate.toFixed(0):'—',
      r.avgCheck>0?r.avgCheck.toFixed(2):'—',
      r.avgOepe>0?r.avgOepe.toFixed(0):'—',
      r.avgTpph>0?r.avgTpph.toFixed(2):'—',
      r.avgLabor>0?(r.avgLabor*100).toFixed(1):'—',
      r.opsScore||'—',r.ctrlScore||'—'
    ]);
    const csv=[hdr,...rows].map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\n');
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
    // Named: DateRangeReport_StartDate_EndDate_LocationScope.csv
    const _scope=selectedLocs.length===allLocs.length?'AllStores':selectedLocs.length===1?sNameC(selectedLocs[0]):'Multi('+selectedLocs.length+')';
    a.download='DateRangeReport_'+startDate+'_to_'+endDate+'_'+_scope.replace(/[^A-Za-z0-9]/g,'_')+'.csv';a.click();
  };

  const th2 = (l,align='right') => th({style:{padding:'5px 8px',background:'var(--surf3)',
    fontSize:'8px',textTransform:'uppercase',letterSpacing:'.3px',color:'var(--text2)',
    textAlign:align,borderBottom:'.5px solid var(--bdr)',whiteSpace:'nowrap'}},l);
  const td2 = (v,c='var(--text)',align='right') => td({style:{padding:'5px 8px',
    fontFamily:'var(--mono)',fontSize:'10px',color:c,textAlign:align}},v);

  return div({style:{display:'flex',flexDirection:'column',height:'90vh'}},
    // Header
    div({style:{padding:'14px 18px',borderBottom:'.5px solid var(--bdr)',display:'flex',alignItems:'center',gap:10}},
      div(null,
        div({style:{fontSize:'14px',fontWeight:700}},'📊 Date-Range Comprehensive Report'),
        div({style:{fontSize:'10px',color:'var(--text3)',marginTop:2}},
          'Compares all metrics for any date range across selected locations.')
      ),
      div({style:{marginLeft:'auto',display:'flex',gap:8,alignItems:'center'}},

        btn({onClick:onClose,style:{background:'none',border:'none',color:'var(--text2)',fontSize:22,cursor:'pointer'}},'×')
      )
    ),

    // Controls
    div({style:{padding:'12px 18px',borderBottom:'.5px solid var(--bdr)',display:'flex',gap:12,flexWrap:'wrap',alignItems:'flex-end'}},
      div(null,
        div({style:{fontSize:'9px',color:'var(--text3)',marginBottom:4,fontWeight:600}},'START'),
        h('input',{type:'date',value:startDate,onChange:e=>setStartDate(e.target.value),
          style:{background:'var(--surf)',border:'.5px solid var(--bdr)',borderRadius:'var(--r)',
            color:'var(--text)',fontSize:'11px',padding:'4px 8px'}})
      ),
      div(null,
        div({style:{fontSize:'9px',color:'var(--text3)',marginBottom:4,fontWeight:600}},'END'),
        h('input',{type:'date',value:endDate,onChange:e=>setEndDate(e.target.value),
          style:{background:'var(--surf)',border:'.5px solid var(--bdr)',borderRadius:'var(--r)',
            color:'var(--text)',fontSize:'11px',padding:'4px 8px'}})
      ),
      div({style:{flex:1}},
        div({style:{fontSize:'9px',color:'var(--text3)',marginBottom:4,fontWeight:600}},'LOCATIONS'),
        div({style:{display:'flex',gap:4,flexWrap:'wrap'}},
          btn({className:'btn btn-sm'+(selLocs.includes('all')?' btn-a':''),
            style:{fontSize:'9px'},onClick:()=>setSelLocs(['all'])},'All Stores'),
          stores.map(s=>btn({key:s.loc,className:'btn btn-sm'+(selLocs.includes(s.loc)?' btn-a':''),
            style:{fontSize:'8px',padding:'2px 6px'},onClick:()=>toggleLoc(s.loc)},
            sName(s.loc)))
        )
      ),
      div({style:{display:'flex',gap:6}},
        report&&btn({className:'btn btn-sm',onClick:exportCSV},'⬇ CSV'),
        btn({className:'btn btn-a',onClick:buildReport,disabled:running||!ds?.loaded,
          style:{fontWeight:700,padding:'6px 18px'}},
          running?'⏳ Building…':'▶ Generate Report')
      )
    ),

    // Results
    div({style:{flex:1,overflowY:'auto',padding:'0 18px'}},
      !report&&!running&&div({style:{textAlign:'center',padding:40,color:'var(--text3)',fontSize:'11px'}},
        'Select a date range and locations, then click Generate Report.'),
      report&&div({style:{paddingTop:10}},
        div({style:{fontSize:'10px',color:'var(--text3)',marginBottom:8}},
          'Report: '+report.startDate+' → '+report.endDate+' · '
          +report.results.length+' location'+(report.results.length!==1?'s':'')+' · '
          +'Generated '+new Date(report.generatedAt).toLocaleTimeString()),
        div({style:{overflowX:'auto'}},
          h('table',{style:{width:'100%',borderCollapse:'collapse',fontSize:'10px'}},
            h('thead',null,
              tr(null,
                th2('Store','left'),th2('Days'),th2('Sales'),th2('vs LY'),th2('vs Fcst'),
                th2('MAPE'),th2('Pass%'),th2('Avg Chk'),th2('OEPE'),th2('TPPH'),
                th2('Labor%'),th2('Ops'),th2('Ctrl')
              )
            ),
            h('tbody',null, report.results.map((r,i)=>tr({key:i,style:{
              borderBottom:'.5px solid var(--bdr)',background:i%2?'rgba(255,255,255,.01)':'transparent'}},
              td2(r.name,'var(--text)','left'),
              td2(r.days,'var(--text3)'),
              td2(f$(r.actualSales),'var(--text)'),
              td2(r.vsLY!=null?((r.vsLY>=0?'+':'')+( r.vsLY*100).toFixed(1)+'%'):'—',
                r.vsLY!=null?(r.vsLY>=0?'#10b981':'#f87171'):'var(--text3)'),
              td2(r.vsFc!=null?((r.vsFc>=0?'+':'')+(r.vsFc*100).toFixed(1)+'%'):'—',
                r.vsFc!=null?(r.vsFc>=0?'#10b981':'#f87171'):'var(--text3)'),
              td2(r.mape!=null?r.mape.toFixed(1)+'%':'—',
                r.mape!=null?(r.mape<5?'#10b981':r.mape<10?'#f59e0b':'#f87171'):'var(--text3)'),
              td2(r.passRate!=null?r.passRate.toFixed(0)+'%':'—',
                r.passRate!=null?(r.passRate>=80?'#10b981':r.passRate>=60?'#f59e0b':'#f87171'):'var(--text3)'),
              td2(r.avgCheck>0?'$'+r.avgCheck.toFixed(2):'—'),
              td2(r.avgOepe>0?Math.round(r.avgOepe)+'s':'—',
                r.avgOepe>0?'var(--text)':'var(--text3)'),
              td2(r.avgTpph>0?r.avgTpph.toFixed(2):'—'),
              td2(r.avgLabor>0?(r.avgLabor*100).toFixed(1)+'%':'—',
                r.avgLabor>0?'var(--text)':'var(--text3)'),
              td2(r.opsScore!=null?r.opsScore+'/100':'—',
                r.opsScore!=null?(r.opsScore>=80?'#10b981':r.opsScore>=65?'#f59e0b':'#f87171'):'var(--text3)'),
              td2(r.ctrlScore!=null?r.ctrlScore+'/100':'—',
                r.ctrlScore!=null?(r.ctrlScore>=80?'#10b981':r.ctrlScore>=65?'#f59e0b':'#f87171'):'var(--text3)')
            )))
          )
        )
      )
    )
  );
}

// FORECAST AUDIT PANEL — full transparency per day
function ForecastAudit({store, ds, settings, userEvents, dateRange, onClose}) {
  const {loc, p, t} = store;
  const [selDate, setSelDate] = React.useState(null);
  const [audit,   setAudit]   = React.useState(null);
  const [loading, setLoading] = React.useState(false);

  // Get days in current range
  const days = React.useMemo(()=>{
    const result=[];
    let d = new Date(dateRange.s);
    while(d<=dateRange.e){result.push(new Date(d));d=addD(d,1);}
    return result;
  },[dateRange]);

  const runAudit = async (date) => {
    setLoading(true); setAudit(null); setSelDate(date);
    // Build a rich audit by calling forecastDay with trace mode
    const tDow = dowOf(date);
    const DOW_NAMES=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const userEvents = settings._userEvents||{};

    // LY lookup trace — mirrors fetchLY priority chain (first clean value wins, no blending)
    const candidates=[-364,-357,-371,-378,-350,-385,-343];
    const lyTrace=[];
    const isExcl = dt => {
      if(isHoliday(dt)) return {excluded:true,reason:'Holiday: '+(isHoliday(dt).label||'known holiday')};
      const dk=dKey(dt);
      if(userEvents[loc]&&userEvents[loc][dk]) return {excluded:true,reason:'Tagged event: '+(userEvents[loc][dk].note||userEvents[loc][dk].label)};
      return {excluded:false};
    };
    let lyRaw=0;
    for(const off of candidates){
      const dt=addD(date,off);
      if(dowOf(dt)!==tDow){lyTrace.push({off,dt,dow:DOW_NAMES[dowOf(dt)],status:'wrong DOW',val:null});continue;}
      const excl=isExcl(dt);
      if(excl.excluded){lyTrace.push({off,dt,status:'excluded: '+excl.reason,val:null});continue;}
      const v=fetchRow(ds.laborIdx,loc,dt,'sales');
      if(v>0){
        lyTrace.push({off,dt,status:'✓ used as LY',val:v,weight:'100% (first clean hit)'});
        lyRaw=v; // first clean value wins — same as fetchLY
        break;   // stop here, no blending
      } else {
        lyTrace.push({off,dt,status:'no data',val:null});
      }
    }

    // Call actual forecastDay for the real result
    const row = forecastDay(loc,date,ds,{...settings,_userEvents:userEvents},null,t);

    // Dialed-In info
    const cal = settings.dialedInEnabled&&settings.dialedIn&&settings.dialedIn[loc];

    // Holiday info
    const holidayInfo = isHoliday(date);
    const _ly364 = addD(date,-364);
    const ly364Excl = isExcl(_ly364);
    const lyHolInfo = ly364Excl.excluded ? null : isHoliday(_ly364);

    // Ops info
    const oRow = ds.opsRows&&ds.opsRows.filter&&ds.opsRows.filter(r=>r.loc===loc&&dKey(r.date)===dKey(date))[0];

    setAudit({date,row,lyRaw,lyTrace,cal,holidayInfo,lyHolInfo,oRow,p,t});
    setLoading(false);
  };

  const fRow = (label, value, note, color) =>
    div({style:{display:'flex',alignItems:'baseline',gap:8,padding:'4px 0',borderBottom:'.5px solid var(--bdr)'}},
      div({style:{minWidth:200,fontSize:'10px',color:'var(--text3)',flexShrink:0}},label),
      div({style:{fontFamily:'var(--mono)',fontSize:'11px',fontWeight:600,color:color||'var(--text)'}},[value]),
      note&&div({style:{fontSize:'9px',color:'var(--text3)',marginLeft:'auto'}},note)
    );

  return div({style:{display:'flex',flexDirection:'column',height:'90vh'}},
    // Header
    div({style:{padding:'14px 18px',borderBottom:'.5px solid var(--bdr)',display:'flex',alignItems:'center',gap:10}},
      div(null,
        div({style:{fontSize:'14px',fontWeight:700}},'🔬 Forecast Audit — '+(STORE_NAMES[loc]||loc)),
        div({style:{fontSize:'10px',color:'var(--text3)',marginTop:2}},'Full transparency: every input, weight, and multiplier used to compute each day forecast.')
      ),
      div({style:{marginLeft:'auto',display:'flex',gap:8,alignItems:'center'}},

        btn({onClick:onClose,style:{background:'none',border:'none',color:'var(--text2)',fontSize:22,cursor:'pointer'}},'×')
      )
    ),

    div({style:{display:'flex',flex:1,overflow:'hidden'}},
      // Date selector sidebar
      div({style:{width:140,borderRight:'.5px solid var(--bdr)',overflowY:'auto',padding:'8px 0'}},
        div({style:{fontSize:'9px',color:'var(--text3)',padding:'4px 12px',fontWeight:600}},'SELECT DATE'),
        days.map((d,i)=>{
          const dk2=dKey(d);
          const isSelected=selDate&&dKey(selDate)===dk2;
          const r=forecastDay(loc,d,ds,{...settings,
            _userEvents:userEvents||{},
            _eventFactors:settings.useEventRegistry!==false?computeEventFactors(ds,userEvents||{}):{}
          },null,t);
          return div({key:i,
            style:{padding:'6px 12px',cursor:'pointer',fontSize:'10px',
              background:isSelected?'rgba(165,180,252,.15)':'transparent',
              borderLeft:isSelected?'3px solid #a5b4fc':'3px solid transparent',
              color:isSelected?'#a5b4fc':'var(--text2)'},
            onClick:()=>runAudit(d)},
            div({style:{fontWeight:600}},d.toLocaleDateString('en-US',{month:'short',day:'numeric'})),
            div({style:{fontSize:'9px',color:'var(--text3)'}},['Sun Mon Tue Wed Thu Fri Sat'.split(' ')[d.getDay()]]),
            r.forecast>0&&div({style:{fontSize:'9px',color:'#a5b4fc'}},f$(r.forecast))
          );
        })
      ),

      // Audit detail
      div({style:{flex:1,overflowY:'auto',padding:'16px 20px'}},
        !selDate&&div({style:{textAlign:'center',padding:40,color:'var(--text3)'}},'Select a date on the left to see the full audit trail.'),
        loading&&div({style:{textAlign:'center',padding:40,color:'var(--text3)'}},'⏳ Computing audit...'),
        audit&&div(null,
          // Summary
          div({style:{background:'rgba(165,180,252,.08)',border:'.5px solid rgba(165,180,252,.2)',
            borderRadius:'var(--rl)',padding:'12px 16px',marginBottom:16}},
            div({style:{fontSize:'11px',fontWeight:700,marginBottom:4}},
              audit.date.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'})),
            div({style:{display:'flex',gap:20,flexWrap:'wrap',marginTop:8}},
              [{l:'AI Forecast',v:f$(audit.row.forecast),c:'#a5b4fc'},
               {l:'Actual',v:audit.row.actual>0?f$(audit.row.actual):'—',c:'#10b981'},
               {l:'vs Actual',v:audit.row.actual>0?((audit.row.actual>audit.row.forecast?'+':'')+((audit.row.actual-audit.row.forecast)/audit.row.forecast*100).toFixed(1)+'%'):'—',
                c:audit.row.actual>0?(audit.row.actual>=audit.row.forecast?'#10b981':'#f87171'):'var(--text3)'},
               {l:'Holiday',v:audit.holidayInfo?audit.holidayInfo.label:'None',c:audit.holidayInfo?'#f59e0b':'var(--text3)'},
               {l:'Dialed-In',v:settings.dialedInEnabled&&audit.cal?'Enabled ('+(audit.cal.mape||'?').toFixed(1)+'% MAPE)':'Off',c:settings.dialedInEnabled&&audit.cal?'#10b981':'var(--text3)'}
              ].map((k,i)=>div({key:i,style:{textAlign:'center'}},
                div({style:{fontSize:'9px',color:'var(--text3)'}},[k.l]),
                div({style:{fontFamily:'var(--mono)',fontWeight:700,color:k.c,fontSize:'13px'}},[k.v])
              ))
            )
          ),

          // LY Lookup
          div({style:{marginBottom:16}},
            div({style:{fontSize:'11px',fontWeight:700,color:'#60a5fa',marginBottom:8,borderBottom:'.5px solid var(--bdr)',paddingBottom:4}},'📊 STEP 1: Last Year Lookup'),
            fRow('Target DOW',audit.date.toLocaleDateString('en-US',{weekday:'long'})+' (DOW '+audit.date.getDay()+')'),
            fRow('LY Candidates checked',audit.lyTrace.length+' dates'),
            ...audit.lyTrace.map((lt,i)=>
              div({key:i,style:{display:'flex',gap:8,padding:'3px 0 3px 16px',
                background:lt.status==='used'?'rgba(16,185,129,.04)':'',
                borderLeft:lt.status==='used'?'2px solid #10b981':'2px solid transparent'}},
                div({style:{minWidth:60,fontSize:'9px',color:'var(--text3)'}},(lt.off>0?'+':'' )+lt.off+'d'),
                div({style:{minWidth:90,fontSize:'9px'}},[lt.dt.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'2-digit'})]),
                div({style:{minWidth:140,fontSize:'9px',color:lt.status==='used'?'#10b981':'#f87171'}},[lt.status]),
                lt.val&&div({style:{fontFamily:'var(--mono)',fontSize:'9px',color:'#a5b4fc'}},[f$(lt.val)]),
                lt.weight&&div({style:{fontSize:'9px',color:'var(--amber)',marginLeft:4}},['w:'+lt.weight])
              )
            ),
            fRow('LY Actual Used',f$(audit.lyRaw), audit.lyTrace.filter(t2=>t2.status==='✓ used as LY').length+' date found (first clean same-DOW hit)','#a5b4fc')
          ),

          // Calibration
          div({style:{marginBottom:16}},
            div({style:{fontSize:'11px',fontWeight:700,color:'#f59e0b',marginBottom:8,borderBottom:'.5px solid var(--bdr)',paddingBottom:4}},'🎯 STEP 2: Dialed-In Calibration'),
            settings.dialedInEnabled&&audit.cal
              ? div(null,
                  fRow('lyW (LY weight)',((audit.cal.lyW||1)*100).toFixed(0)+'%','Blend: store LY ×'+(( audit.cal.lyW||1)*100).toFixed(0)+'% + district avg ×'+(100-( audit.cal.lyW||1)*100).toFixed(0)+'%'),
                  fRow('Trend Weights','t2:'+((audit.cal.t2||.5)*100).toFixed(0)+'% · t4:'+((audit.cal.t4||.25)*100).toFixed(0)+'% · t6:'+((audit.cal.t6||.25)*100).toFixed(0)+'%'),
                  fRow('opsMult',audit.cal.opsMult!=null?audit.cal.opsMult.toFixed(2):'1.00','Ops influence scaling (1.0=normal)'),
                  fRow('Calibrated MAPE',audit.cal.mape!=null?audit.cal.mape.toFixed(1)+'%':'—'),
                  fRow('Last run',audit.cal.runDate||'—')
                )
              : fRow('Status',settings.dialedInEnabled?'No calibration data yet — run Dialed-In':'Off — using global defaults',null,'var(--text3)')
          ),

          // Trend
          div({style:{marginBottom:16}},
            div({style:{fontSize:'11px',fontWeight:700,color:'#84cc16',marginBottom:8,borderBottom:'.5px solid var(--bdr)',paddingBottom:4}},'📈 STEP 3: Trend Signal'),
            fRow('T2W trend (2wk YOY)',audit.row.t2!=null?(audit.row.t2>=0?'+':'')+( audit.row.t2*100).toFixed(1)+'%':'—'),
            fRow('T4W trend (4wk YOY)',audit.row.t4!=null?(audit.row.t4>=0?'+':'')+( audit.row.t4*100).toFixed(1)+'%':'—'),
            fRow('T6W trend (6wk YOY)',audit.row.t6!=null?(audit.row.t6>=0?'+':'')+( audit.row.t6*100).toFixed(1)+'%':'—'),
            fRow('Blended trend (wTrend)',audit.row.trend!=null?(audit.row.trend>=0?'+':'')+( audit.row.trend*100).toFixed(2)+'%':'computed','65% global + 35% DOW-specific','var(--amber)')
          ),

          // Ops Factor
          div({style:{marginBottom:16}},
            div({style:{fontSize:'11px',fontWeight:700,color:'#f59e0b',marginBottom:8,borderBottom:'.5px solid var(--bdr)',paddingBottom:4}},'⚙️ STEP 4: Ops Factor'),
            fRow('OEPE (6wk avg)',audit.p.oepe>0?Math.round(audit.p.oepe)+'s':'—','Target: '+(audit.t.tOepe||'—')+'s'),
            fRow('TPPH (6wk avg)',audit.p.tpph>0?audit.p.tpph.toFixed(2):'—','Target: '+(audit.t.tTpph||'—')),
            fRow('Ops Factor (raw)',audit.row.opsFactor!=null?audit.row.opsFactor.toFixed(4):'—','1.0=neutral, <1=headwind, >1=tailwind'),
            fRow('Ops Normalization',settings.opsNorm?'On (vs store avg)':'Off (vs targets)')
          ),

          // Holiday Adjustment
          div({style:{marginBottom:16}},
            div({style:{fontSize:'11px',fontWeight:700,color:'#a5b4fc',marginBottom:8,borderBottom:'.5px solid var(--bdr)',paddingBottom:4}},'🗓 STEP 5: Holiday Adjustment'),
            fRow('Today holiday?',audit.holidayInfo?audit.holidayInfo.label+' ('+audit.holidayInfo.impact+')':'No'),
            fRow('LY (-364d) holiday?',audit.lyHolInfo?audit.lyHolInfo.label:'No (or excluded from lookup)'),
            fRow('Holiday LY adj',
              (audit.row.holidayLyAdj!=null?audit.row.holidayLyAdj:1).toFixed(4),
              audit.row.holidayLyAdj&&audit.row.holidayLyAdj!==1
                ?'Applied: '+(audit.row.holiday?audit.row.holiday.label:'holiday')+' multiplier ('+audit.row.holidayLyAdj.toFixed(4)+')'
                :'Corrects for holidays shifting between years')
          ),

          // Final Formula
          div({style:{background:'rgba(16,185,129,.06)',border:'.5px solid rgba(16,185,129,.2)',
            borderRadius:'var(--rl)',padding:'12px 16px',marginBottom:16}},
            div({style:{fontSize:'11px',fontWeight:700,color:'#10b981',marginBottom:8}},'🧮 FINAL CALCULATION'),
            div({style:{fontFamily:'var(--mono)',fontSize:'10px',lineHeight:1.8,color:'var(--text2)'}},
              'lyAdjH    = '+f$(Math.round(audit.row.lyAdj||audit.lyRaw))+' × '+(audit.row.holidayLyAdj||1).toFixed(4)+' (holAdj) = '+f$(Math.round((audit.row.lyAdj||audit.lyRaw)*(audit.row.holidayLyAdj||1))),'\n',
              'opsFactor = '+(audit.row.opsFactor||1).toFixed(4),'\n',
              'wTrend    = '+(audit.row.wTrend!=null?(audit.row.wTrend*100).toFixed(2)+'%':'0.00% (neutral)'),'\n',
              'trendFactor= '+(audit.row.trendFactor!=null?(audit.row.trendFactor>=0?'+':'')+( audit.row.trendFactor*100).toFixed(2)+'% (wTrend × α'+(settings.trendAlpha??0.3).toFixed(2)+', clamped ±15%)':'0.00%'),'\n',
              'evFactor  = '+(audit.row._evFactor&&audit.row._evFactor!==0?((audit.row._evFactor>=0?'+':'')+( audit.row._evFactor*100).toFixed(2)+'% (Event Registry learned impact)'):'0.00% (no matching event tag)'),'\n',
              'wAdj      = '+(audit.row.wAdj!=null?(audit.row.wAdj*100).toFixed(2):'0.00')+'% (weather)','\n',
              'plusUp    = '+((settings.plusUpByStore&&settings.plusUpByStore[loc])||settings.plusUp||0)+'%','\n',
              div({style:{marginTop:8,borderTop:'.5px solid rgba(16,185,129,.3)',paddingTop:8,
                fontWeight:700,fontSize:'12px',color:'#10b981'}},[
                'Forecast = lyAdjH × opsFactor × (1+wAdj) × (1+trend) × (1+evAdj) × (1+plusUp/100)','\n',
                '        = '+f$(Math.round((audit.row.lyAdj||audit.lyRaw)*(audit.row.holidayLyAdj||1)))+
                  ' × '+(audit.row.opsFactor||1).toFixed(4)+
                  ' × '+(1+(audit.row.wAdj||0)).toFixed(4)+
                  ' × '+(1+(audit.row.trendFactor||0)).toFixed(4)+
                  ' × '+(1+(audit.row._evFactor||0)).toFixed(4)+
                  ' × '+(1+((settings.plusUpByStore&&settings.plusUpByStore[loc])||settings.plusUp||0)/100).toFixed(4)+
                  ' = '+f$(audit.row.forecast)
              ])
            )
          )
        )
      )
    )
  );
}

// LOCATION INTELLIGENCE BRIEF — AI-powered store analysis
// Per-store, per-patch, per-operator, org and district roll-ups

// ─── Markdown → React nodes (for AI output rendering) ───────────────────────

function LocationBrief({stores, ds, settings, scope, scopeLabel, onClose}) {
  // scope: 'store'|'patch'|'operator'|'org'|'district'
  // scopeLabel: the name/group to display
  const [brief,   setBrief]   = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error,   setError]   = React.useState(null);
  const [selStore, setSelStore] = React.useState(stores&&stores[0]&&stores[0].loc);

  const apiKey = React.useMemo(()=>{
    try{return localStorage.getItem('mf_anthropic_key')||'';}catch{return '';}
  },[]);

  // Build the data context for the brief
  const buildBriefContext = (locs) => {
    const storeList = (stores||[]).filter(s=>locs.includes(s.loc));
    const lines = [];

    for(const store of storeList){
      const {p, t, loc, name} = store;
      if(!p) continue;
      const lyData = (ds.laborRows||[]).filter(r=>r.loc===loc&&r.sales>0);
      const recentRows = lyData.filter(r=>r.date>=addD(new Date(),-42)).sort((a,b)=>b.date-a.date);
      const totalSales = recentRows.reduce((a,r)=>a+(r.sales||0),0);
      const avgCheck = recentRows.filter(r=>r.gc>0).reduce((a,r)=>a+(r.sales/r.gc),0)/(recentRows.filter(r=>r.gc>0).length||1);
      const mape = settings.dialedIn&&settings.dialedIn[loc]&&settings.dialedIn[loc].mape;
      const cal = settings.dialedIn&&settings.dialedIn[loc];

      lines.push([
        'STORE: '+(STORE_NAMES[loc]||loc)+' (#'+loc+')',
        '  6-Wk Sales: $'+(totalSales||0).toLocaleString()+' | Avg Check: $'+avgCheck.toFixed(2),
        '  T2W vs LY: '+((p.t2w||0)*100).toFixed(1)+'% | T6W vs LY: '+((p.t6w||0)*100).toFixed(1)+'%',
        '  OEPE: '+(p.oepe>0?Math.round(p.oepe)+'s':'—')+' (target '+(t.tOepe||'—')+'s)',
        '  TPPH: '+(p.tpph>0?p.tpph.toFixed(2):'—')+' (target '+(t.tTpph||'—')+')',
        '  Labor%: '+(p.laborPct>0?(p.laborPct*100).toFixed(1)+'%':'—')+' (target '+(t.tLabor?(t.tLabor*100).toFixed(1)+'%':'—')+')',
        '  Ops Score: '+(store.opsScore||'—')+'/100',
        '  Forecast MAPE: '+(mape!=null?mape.toFixed(1)+'%':'not calibrated'),
        '  T2W Trend: '+(cal&&cal.mape2w!=null?cal.mape2w.toFixed(1)+'% (recent)':'—'),
        ''
      ].join('\n'));
    }
    return lines.join('');
  };

  const generateBrief = async (locs, label) => {
    if(!apiKey){setError('Set your Anthropic API key in Settings → AI to use this feature.');return;}
    setLoading(true); setBrief(null); setError(null);
    const context = buildBriefContext(locs);
    const isMulti = locs.length > 1;
    const prompt = isMulti
      ? 'You are an expert McDonald\u2019s district operations analyst with 30+ years experience. '+
        'Analyze this '+label+' data and write an ENTERPRISE-LEVEL performance brief.\n\n'+
        'DATA:\n'+context+'\n\n'+
        'REQUIREMENTS:\n'+
        '1. Start with a 2-3 sentence executive summary covering group performance trend\n'+
        '2. Identify top 2-3 opportunities across the group (ranked by $ impact)\n'+
        '3. Call out standout performers (positive) and locations needing urgent attention\n'+
        '4. Note any metrics correlations (e.g., OEPE improvement → sales lift pattern)\n'+
        '5. Provide a prioritized 30-60-90 day roadmap for this group\n'+
        '6. Write in plain business English — like a briefing to a district VP\n'+
        '7. Be specific with numbers and location names\n'+
        'Format: Use bold headers, bullet points where appropriate, keep under 500 words.'
      : 'You are an expert McDonald\u2019s operations analyst. Write a LOCATION INTELLIGENCE BRIEF.\n\n'+
        'DATA:\n'+context+'\n\n'+
        'REQUIREMENTS:\n'+
        '1. Start with a 1-sentence performance headline\n'+
        '2. 3-4 specific insights connecting metrics to sales outcomes (e.g., OEPE vs sales, weather patterns)\n'+
        '3. Identify the #1 opportunity by estimated weekly $ impact\n'+
        '4. Note forecast model accuracy and confidence\n'+
        '5. Provide 3 specific, actionable coaching recommendations\n'+
        '6. Frame positively — growth roadmap not just problems\n'+
        '7. Write conversationally, like a seasoned operator talking to a GM\n'+
        'Format: Bold key numbers. Use bullet points. Keep under 350 words.';

    try{
      const resp = await fetch('https://api.anthropic.com/v1/messages',{
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          'x-api-key':apiKey,
          'anthropic-version':'2023-06-01',
          'anthropic-dangerous-direct-browser-access':'true'
        },
        body:JSON.stringify({
          model:'claude-haiku-4-5-20251001',
          max_tokens:2000,
          messages:[{role:'user',content:prompt}]
        })
      });
      if(!resp.ok){
        const errData = await resp.json().catch(()=>({}));
        throw new Error('API error '+resp.status+': '+(errData.error&&errData.error.message||'Check API key in Settings → AI'));
      }
      const data = await resp.json();
      if(data.error) throw new Error(data.error.message+' — Check API key in Settings → AI');
      const text = data.content.map(b=>b.type==='text'?b.text:'').join('');
      setBrief(text);
    }catch(e){
      setError('Brief generation failed: '+e.message);
    }
    setLoading(false);
  };

  // Parse markdown-ish output into formatted React elements
  const renderBrief = (text) => {
    if(!text) return null;
    const nodes = mdToNodes(text);
    return div({style:{lineHeight:1.7}}, ...nodes);
  };

  // Determine which locs to analyze based on scope
  const getLocs = () => {
    if(scope==='store') return selStore?[selStore]:[];
    if(scope==='district') return (stores||[]).filter(s=>/^\d+$/.test(s.loc)).map(s=>s.loc);
    return (stores||[]).filter(s=>/^\d+$/.test(s.loc)).map(s=>s.loc);
  };

  const activeLocs = getLocs();
  const activeLabel = scope==='store'?(STORE_NAMES[selStore]||selStore||''):scopeLabel;

  return div({style:{display:'flex',flexDirection:'column',height:'90vh',maxHeight:'90vh'}},
    // Header
    div({style:{padding:'14px 18px',borderBottom:'.5px solid var(--bdr)',
      display:'flex',alignItems:'center',gap:10,flexShrink:0}},
      div(null,
        div({style:{fontSize:'14px',fontWeight:800,display:'flex',alignItems:'center',gap:6}},
          span({style:{fontSize:'16px'}},'🧠'),
          'Intelligence Brief',
          div({style:{fontSize:'10px',background:'var(--adim)',color:'var(--amber)',
            padding:'1px 8px',borderRadius:10,fontWeight:600}},activeLabel)
        ),
        div({style:{fontSize:'9px',color:'var(--text3)',marginTop:2}},
          'AI-powered analysis · Sales trends · Ops correlations · Actionable coaching roadmap')
      ),
      btn({onClick:onClose,style:{marginLeft:'auto',background:'none',border:'none',
        color:'var(--text2)',fontSize:22,cursor:'pointer'}},'×')
    ),

    // Store selector (for multi-store scopes)
    scope!=='store'&&div({style:{padding:'8px 18px',borderBottom:'.5px solid var(--bdr)',
      display:'flex',gap:6,flexWrap:'wrap',alignItems:'center',flexShrink:0}},
      div({style:{fontSize:'9px',color:'var(--text3)',marginRight:4}},'Analyze:'),
      btn({className:'btn btn-sm'+(activeLocs===getLocs()?' btn-a':''),
        style:{fontSize:'9px'},onClick:()=>generateBrief(getLocs(),activeLabel)},
        'Entire '+scope.charAt(0).toUpperCase()+scope.slice(1)),
      scope!=='district'&&(stores||[]).filter(s=>getLocs().includes(s.loc)).map(s=>
        btn({key:s.loc,className:'btn btn-sm',style:{fontSize:'9px'},
          onClick:()=>generateBrief([s.loc],sNameC(s.loc))},
          sNameC(s.loc)
        )
      )
    ),

    // Main content
    div({style:{flex:1,overflowY:'auto',padding:'16px 18px'}},
      !brief&&!loading&&!error&&div({style:{textAlign:'center',padding:40}},
        !apiKey&&div({style:{background:'rgba(239,68,68,.08)',border:'.5px solid rgba(239,68,68,.3)',
          borderRadius:'var(--r)',padding:'10px 16px',marginBottom:16,fontSize:'10px',color:'#f87171'}},
          '🔑 No API key set — go to Settings → AI to add your Anthropic API key. The key is required for all AI features including this brief.'),
        div({style:{fontSize:'14px',marginBottom:8,color:'var(--text3)'}},apiKey?'🧠':'🔑'),
        div({style:{fontWeight:600,marginBottom:6}},apiKey?'Ready to generate brief':'API key required'),
        div({style:{fontSize:'10px',color:'var(--text3)',marginBottom:16,maxWidth:300,margin:'0 auto 16px'}},
          apiKey?'Click below to generate a comprehensive analysis for '+activeLabel:
          'Set your Anthropic API key in Settings → AI to enable AI-powered briefs'),
        apiKey&&btn({className:'btn btn-a',style:{padding:'8px 20px',fontSize:'11px'},
          onClick:()=>generateBrief(getLocs(),activeLabel)},
          '🧠 Generate Intelligence Brief for '+activeLabel)
      ),
      loading&&div({style:{textAlign:'center',padding:40}},
        div({style:{fontSize:'24px',marginBottom:8}},'⏳'),
        div({style:{color:'var(--text3)',fontSize:'11px'}},'Analyzing '+activeLocs.length+' location'+(activeLocs.length>1?'s':'')+' · Building intelligence brief...')
      ),
      error&&div({style:{padding:16,background:'rgba(239,68,68,.1)',border:'.5px solid rgba(239,68,68,.3)',borderRadius:'var(--r)',color:'#f87171',fontSize:'11px'}},
        '⚠ '+error),
      brief&&div(null,
        // Regenerate button
        div({style:{display:'flex',justifyContent:'flex-end',marginBottom:12,gap:6}},
          btn({className:'btn btn-sm',onClick:()=>generateBrief(getLocs(),activeLabel)},'↻ Regenerate'),
          btn({className:'btn btn-sm',onClick:()=>{
            const el=document.createElement('a');
            el.href='data:text/plain;charset=utf-8,'+encodeURIComponent(activeLabel+'\n\n'+brief);
            el.download='Brief_'+activeLabel.replace(/[^A-Za-z0-9]/g,'_')+'_'+dKey(new Date())+'.txt';
            el.click();
          }},'⬇ Export')
        ),
        div({style:{background:'var(--surf2)',border:'.5px solid var(--bdr)',borderRadius:'var(--rl)',
          padding:'16px 20px'}},
          renderBrief(brief)
        )
      )
    )
  );
}

// PROJECTION vs ACTUALS REPORT — Professional backtest comparison
// Shows AI forecast accuracy by location, week, patch, operator, org
// Print / Save / Email ready
function ProjectionVsActualsReport({stores, ds, settings, userEvents, onClose}) {
  const [groupBy,      setGroupBy]     = React.useState('patch');
  const [weeksBack,    setWeeksBack]   = React.useState(4);
  const [computing,    setComputing]   = React.useState(false);
  const [report,       setReport]      = React.useState(null);
  const [expandedCell, setExpandedCell]= React.useState(null);

  const runBacktest = React.useCallback(async () => {
    if(!ds||!ds.loaded) return;
    setComputing(true); setReport(null); setExpandedCell(null);
    const today = new Date();
    // Compute allLocs inline (safe inside useCallback — no hooks allowed here)
    const allLocs = (stores||[]).filter(s=>/^\d+$/.test(s.loc)).map(s=>s.loc);
    const results = {};
    // Build past N complete Wed-Tue weeks
    const weeks = [];
    let d = new Date(today);
    while(d.getDay()!==2) d.setDate(d.getDate()-1);
    d.setDate(d.getDate()-6);
    for(let w=0;w<weeksBack;w++){
      const ws=new Date(d); ws.setDate(d.getDate()-w*7); weeks.push(ws);
    }
    weeks.reverse();
    for(const loc of allLocs){
      const t=(ds.targets&&ds.targets[loc])||DEFAULT_TARGETS[loc]||{};
      results[loc]=[];
      for(const weekStart of weeks){
        const days=[];
        for(let i=0;i<7;i++){
          const date=addD(weekStart,i);
          const actRow=(ds.laborRows||[]).find(r=>r.loc===loc&&dKey(r.date)===dKey(date));
          if(!actRow||!actRow.sales||actRow.sales<=0) continue;
          const fcRow=forecastDay(loc,date,ds,{...settings,_userEvents:userEvents||{}},null,t);
          days.push({date,forecast:fcRow.forecast||0,actual:actRow.sales,lyAdj:fcRow.lyAdj||0});
        }
        if(days.length>0){
          const wkFc=days.reduce((a,r)=>a+r.forecast,0);
          const wkAct=days.reduce((a,r)=>a+r.actual,0);
          const wkLY=days.reduce((a,r)=>a+r.lyAdj,0);
          const mape=days.length?+(days.reduce((a,r)=>a+Math.abs(r.forecast-r.actual)/r.actual,0)/days.length*100).toFixed(1):null;
          results[loc].push({weekStart,days,wkFc,wkAct,wkLY,mape,
            vsLY:wkLY>0?+((wkAct-wkLY)/wkLY*100).toFixed(1):null});
        }
        await new Promise(res=>setTimeout(res,0));
      }
    }
    setReport({results,weeks,allLocs});
    setComputing(false);
  },[ds,settings,stores,weeksBack]);

  const mapeColor=m=>!m?'var(--text3)':+m<6?'#10b981':+m<10?'#f59e0b':'#f87171';
  const fmtWk=d=>'Wk '+d.toLocaleDateString('en-US',{month:'short',day:'numeric'});
  const narrative=(mape,dir)=>mape===null?'No data':
    mape<6?'✓ Excellent accuracy'+(dir?'  '+dir:''):
    mape<10?'~ OK accuracy'+(dir?'  '+dir:''):
    '✗ Needs work'+(dir?'  '+dir:'');

  const getGroups=()=>{
    if(!report) return [];
    if(groupBy==='patch') return Object.entries(settings.supervisorGroups||{});
    if(groupBy==='operator') return Object.entries(settings.operators||DEF_SETTINGS.operators||{});
    if(groupBy==='org') return [['MCDOK',report.allLocs.filter(l=>getStoreOrg(l)==='MCDOK')],['Emerald Arches',report.allLocs.filter(l=>getStoreOrg(l)==='Emerald Arches')]];
    return [['All Stores',report.allLocs]];
  };

  // TH (table header style) now comes from the module-scope constant above.

  const renderGroupTable=(groupName,locs)=>{
    const groupLocs=(locs||[]).filter(l=>report.allLocs.includes(l));
    if(!groupLocs.length) return null;
    const weeks=report.weeks;
    const groupWeekTotals=weeks.map(wk=>{
      const wkKey=dKey(wk);
      let tFc=0,tAct=0,tLY=0,ms=0,mc=0;
      groupLocs.forEach(loc=>{
        const w=report.results[loc]&&report.results[loc].find(x=>dKey(x.weekStart)===wkKey);
        if(w){tFc+=w.wkFc;tAct+=w.wkAct;tLY+=w.wkLY;if(w.mape!=null){ms+=w.mape;mc++;}}
      });
      return{tFc,tAct,tLY,avgMape:mc?+(ms/mc).toFixed(1):null,vsLY:tLY>0?+((tAct-tLY)/tLY*100).toFixed(1):null};
    });

    return div({key:groupName,className:'pvsa-group',style:{marginBottom:20,pageBreakInside:'auto'}},  
      div({style:{display:'flex',alignItems:'center',gap:8,padding:'5px 0',
        borderBottom:'1px solid var(--bdr2)',marginBottom:4}},
        div({style:{fontWeight:700,fontSize:'11px',color:'var(--amber)'}},[groupName]),
        div({style:{fontSize:'9px',color:'var(--text3)'}},[groupLocs.length+' locations']),
        groupWeekTotals.length>1&&div({style:{marginLeft:'auto',display:'flex',gap:6,fontSize:'9px',alignItems:'center'}},
          span({style:{color:'var(--text3)'}},'MAPE trend:'),
          groupWeekTotals.map((gt,i)=>div({key:i,style:{
            color:gt.avgMape!=null?mapeColor(gt.avgMape):'var(--text3)',
            fontWeight:600,fontFamily:'var(--mono)'}},[gt.avgMape!=null?gt.avgMape.toFixed(1)+'%':'—']))
        )
      ),
      tbl({style:{width:'100%',borderCollapse:'collapse',fontSize:'10px'}},
        h('thead',null,tr(null,
          th({style:{...TH,textAlign:'left',minWidth:140}},'Location'),
          ...weeks.map((wk,i)=>th({key:i,style:{...TH,minWidth:110,textAlign:'center'}},fmtWk(wk))),
          th({style:{...TH,minWidth:110,textAlign:'center'}},weeksBack+'-Wk Avg')
        )),
        h('tbody',null,
          ...groupLocs.flatMap(loc=>{
            const wkData=weeks.map(wk=>{
              const d=report.results[loc]&&report.results[loc].find(w=>dKey(w.weekStart)===dKey(wk));
              return d||null;
            });
            const allMapes=wkData.filter(Boolean).map(w=>w.mape).filter(v=>v!=null);
            const avgMape=allMapes.length?+(allMapes.reduce((a,v)=>a+v,0)/allMapes.length).toFixed(1):null;
            const mapeDir=allMapes.length>1?(allMapes[allMapes.length-1]<allMapes[0]-1?'▼ Improving':allMapes[allMapes.length-1]>allMapes[0]+1?'▲ Getting worse':'→ Stable'):null;
            const name=(STORE_NAMES[String(loc)]||loc);

            const storeRow=tr({key:loc,style:{borderBottom:'.5px solid var(--bdr)'}},
              td({style:{padding:'4px 8px',fontWeight:600}},[name]),
              ...wkData.map((wk,i)=>
                td({key:i,style:{padding:'4px 8px',textAlign:'center',cursor:wk?'pointer':'default',
                  background:expandedCell===loc+'_'+i?'rgba(245,158,11,.07)':'transparent'},
                  title:wk?'Click for day-by-day breakdown':'',
                  onClick:wk?()=>setExpandedCell(p=>p===loc+'_'+i?null:loc+'_'+i):null},
                  wk?div(null,
                    div({style:{fontFamily:'var(--mono)',fontSize:'10px',fontWeight:700,
                      color:mapeColor(wk.mape),display:'flex',alignItems:'center',gap:3,justifyContent:'center'}},
                      wk.mape!=null?wk.mape.toFixed(1)+'%':'—',
                      wk.mape!=null&&span({style:{fontWeight:400,fontSize:'8px',color:'var(--text3)'}},
                        wk.mape<6?' ✓ Excellent':wk.mape<10?' ~ OK':' ✗ Missed')),
                    div({style:{fontSize:'8px',display:'flex',gap:6,justifyContent:'center',marginTop:1}},
                      div({style:{color:wk.vsLY!=null?(wk.vsLY>=0?'#10b981':'#f87171'):'var(--text3)'}},
                        wk.vsLY!=null?((wk.vsLY>=0?'+':'')+wk.vsLY+'% vs LY'):'—'),
                      div({style:{color:'var(--text3)'}},f$(wk.wkAct))),
                    div({style:{fontSize:'7px',color:'var(--amber)',marginTop:2}},
                      expandedCell===loc+'_'+i?'▲ collapse':'▼ expand days'),
                    // Day-by-day expansion
                    expandedCell===loc+'_'+i&&div({style:{marginTop:6,borderTop:'.5px solid var(--bdr)',paddingTop:4}},
                      div({style:{fontSize:'8px',fontWeight:700,color:'var(--text3)',marginBottom:3,
                        textTransform:'uppercase',letterSpacing:'.3px'}},'Day-by-day breakdown:'),
                      wk.days.map((day,di)=>{
                        const err=day.actual>0?+(Math.abs(day.forecast-day.actual)/day.actual*100).toFixed(1):null;
                        const vsLY=day.lyAdj>0?+((day.actual-day.lyAdj)/day.lyAdj*100).toFixed(1):null;
                        const status=err==null?'—':err<5?'✓ Accurate':err<10?'~ OK':'✗ Missed';
                        const sc=err==null?'var(--text3)':err<5?'#10b981':err<10?'#f59e0b':'#f87171';
                        const dow=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][day.date.getDay()];
                        return div({key:di,style:{display:'grid',gridTemplateColumns:'30px 1fr 60px 50px',
                          gap:4,padding:'2px 0',borderBottom:'.5px solid rgba(255,255,255,.04)',fontSize:'8px'}},
                          span({style:{color:'var(--text3)'}},[dow+' '+day.date.getDate()]),
                          span({style:{fontFamily:'var(--mono)',color:'var(--text)'}},[f$(day.actual)]),
                          span({style:{color:sc,fontWeight:600}},[status+(err!=null?' '+err+'%':'')]),
                          vsLY!=null?span({style:{color:vsLY>=0?'#10b981':'#f87171',fontSize:'7px'}},
                            [(vsLY>=0?'+':'')+vsLY+'% LY']):span({style:{color:'var(--text3)'}},'—')
                        );
                      })
                    )
                  ):div({style:{color:'var(--text3)',fontSize:'9px'}},'No data')
                )
              ),
              td({style:{padding:'4px 8px',textAlign:'center'}},
                div({style:{fontFamily:'var(--mono)',fontWeight:700,color:mapeColor(avgMape)}},
                  avgMape!=null?avgMape.toFixed(1)+'%':'—'),
                mapeDir&&div({style:{fontSize:'8px',color:'var(--text3)',marginTop:1}},mapeDir),
                div({style:{fontSize:'8px',color:'var(--text3)'}},allMapes.length+'wk data')
              )
            );

            // Day detail expansion rows
            const dayRows=wkData.flatMap((wk,wi)=>{
              if(expandedCell!==loc+'_'+wi||!wk||!wk.days||!wk.days.length) return [];
              const acc=wk.mape;
              const msg=acc===null?'No data':acc<6?'✓ Highly accurate — model well-calibrated this week.':
                acc<10?'~ Acceptable — some variance, room to improve.':
                '✗ Model missed — check for unusual events, schedule changes, or recalibrate.';
              const DOWn=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
              return [tr({key:'exp'+wi,style:{background:'rgba(99,102,241,.05)',borderBottom:'.5px solid var(--bdr)'}},
                td({colSpan:weeks.length+2,style:{padding:'6px 12px'}},
                  div({style:{fontWeight:700,fontSize:'9px',color:'var(--amber)',marginBottom:4}},
                    'Day-by-day: '+fmtWk(wk.weekStart)+' — '+span({style:{fontWeight:400,color:mapeColor(acc)}},msg)),
                  div({style:{display:'flex',flexWrap:'wrap',gap:5}},
                    wk.days.map((day,di)=>{
                      const err=day.actual>0?Math.abs(day.forecast-day.actual)/day.actual*100:null;
                      const vsLY=day.lyAdj>0?((day.actual-day.lyAdj)/day.lyAdj*100).toFixed(1):null;
                      return div({key:di,style:{background:'var(--surf)',borderRadius:4,
                        padding:'4px 7px',border:'.5px solid var(--bdr)',minWidth:88}},
                        div({style:{fontSize:'8px',fontWeight:700,color:'var(--text2)'}},
                          DOWn[day.date.getDay()]+' '+day.date.toLocaleDateString('en-US',{month:'numeric',day:'numeric'})),
                        div({style:{fontSize:'11px',fontFamily:'var(--mono)',fontWeight:800}},f$(day.actual)),
                        div({style:{fontSize:'8px',color:'var(--text3)'}},['Fcst: '+f$(day.forecast)]),
                        err!=null&&div({style:{fontSize:'8px',fontWeight:600,
                          color:err<5?'#10b981':err<10?'#f59e0b':'#f87171'}},
                          (err<5?'✓ ':err<10?'~ ':'✗ ')+err.toFixed(1)+'% err'),
                        vsLY&&div({style:{fontSize:'8px',fontWeight:600,
                          color:+vsLY>=0?'#10b981':'#f87171'}},
                          (+vsLY>=0?'+':'')+vsLY+'% vs LY')
                      );
                    })
                  )
                )
              )];
            });
            return [storeRow,...dayRows];
          }),
          // Group subtotal row
          tr({style:{background:'rgba(245,158,11,.06)',borderTop:'1px solid var(--bdr)'}},
            td({style:{padding:'5px 8px',fontWeight:700,color:'var(--amber)'}},[groupName+' Total']),
            ...groupWeekTotals.map((gt,i)=>
              td({key:i,style:{padding:'5px 8px',textAlign:'center'}},
                gt.avgMape!=null?div(null,
                  div({style:{fontFamily:'var(--mono)',fontWeight:700,color:mapeColor(gt.avgMape)}},
                    gt.avgMape.toFixed(1)+'% avg'),
                  div({style:{fontSize:'8px',display:'flex',gap:6,justifyContent:'center'}},
                    div({style:{color:gt.vsLY!=null?(gt.vsLY>=0?'#10b981':'#f87171'):'var(--text3)'}},
                      gt.vsLY!=null?((gt.vsLY>=0?'+':'')+gt.vsLY+'% vs LY'):'—'),
                    div({style:{color:'var(--text3)'}},f$(gt.tAct)))
                ):div({style:{color:'var(--text3)'}},['—'])
              )
            ),
            td({style:{padding:'5px 8px',textAlign:'center',fontFamily:'var(--mono)',fontWeight:700,color:'var(--amber)'}},
              groupWeekTotals.filter(g=>g.avgMape!=null).length?
              (groupWeekTotals.filter(g=>g.avgMape!=null).reduce((a,g)=>a+g.avgMape,0)/
              groupWeekTotals.filter(g=>g.avgMape!=null).length).toFixed(1)+'%':'—')
          )
        )
      )
    );
  };

  return div({style:{display:'flex',flexDirection:'column',height:'92vh'}},
    // Header
    div({style:{padding:'14px 18px',borderBottom:'.5px solid var(--bdr)',
      display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',flexShrink:0}},
      div(null,
        div({style:{fontSize:'14px',fontWeight:800}},['📊 Projection vs Actuals Report']),
        div({style:{fontSize:'9px',color:'var(--text3)',marginTop:2}},
          ['AI forecast accuracy vs actual results — click any cell to expand daily detail'])
      ),
      div({style:{display:'flex',gap:6,marginLeft:8,alignItems:'center',flexWrap:'wrap'}},
        div({style:{fontSize:'9px',color:'var(--text3)'}},'Look back:'),
        [2,4,6].map(n=>btn({key:n,className:'btn btn-sm'+(weeksBack===n?' btn-a':''),
          style:{fontSize:'9px',padding:'2px 8px'},onClick:()=>setWeeksBack(n)},n+'W')),
        div({style:{width:1,background:'var(--bdr)',height:14}}),
        div({style:{fontSize:'9px',color:'var(--text3)'}},'Group:'),
        [['all','All'],['patch','Patch'],['operator','Operator'],['org','Org']].map(([v,l])=>
          btn({key:v,className:'btn btn-sm'+(groupBy===v?' btn-a':''),
            style:{fontSize:'9px',padding:'2px 8px'},onClick:()=>setGroupBy(v)},l))
      ),
      div({style:{display:'flex',gap:6,marginLeft:'auto',alignItems:'center'}},
        btn({className:'btn btn-sm btn-a',style:{fontWeight:700},onClick:runBacktest,disabled:computing},
          computing?'⏳ Computing...':'▶ Run Report'),
        report&&btn({className:'btn btn-sm',onClick:()=>window.print()},'🖨 Print'),
        report&&btn({className:'btn btn-sm',onClick:()=>{
          const rows=[['Group','Location',...(report.weeks||[]).map(w=>fmtWk(w)),'Avg MAPE']];
          getGroups().forEach(([gName,locs])=>{
            const gLocs=(locs||[]).filter(l=>report.allLocs.includes(l));
            gLocs.forEach(loc=>{
              const wkM=(report.weeks||[]).map(wk=>{
                const d=report.results[loc]&&report.results[loc].find(w=>dKey(w.weekStart)===dKey(wk));
                return d&&d.mape!=null?d.mape.toFixed(1)+'%':'—';
              });
              const allM=wkM.filter(m=>m!=='—').map(parseFloat);
              rows.push([gName,(STORE_NAMES[String(loc)]||loc),...wkM,
                allM.length?(allM.reduce((a,v)=>a+v,0)/allM.length).toFixed(1)+'%':'—']);
            });
          });
          const csv=rows.map(r=>r.map(v=>'"'+v+'"').join(',')).join('\n');
          const a=document.createElement('a');
          a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv);
          a.download='ProjVsActuals_L'+weeksBack+'W_'+dKey(new Date())+'.csv';
          a.click();
        }},'⬇ CSV'),
        btn({className:'btn btn-sm',onClick:onClose},['✕ Close'])
      )
    ),
    // Body
    div({style:{flex:1,overflowY:'auto',padding:'16px 20px'}},
      !report&&!computing&&div({style:{textAlign:'center',padding:60}},
        div({style:{fontSize:'32px',marginBottom:12}},'📊'),
        div({style:{fontWeight:600,marginBottom:6}},'Run the backtest to see projection accuracy'),
        div({style:{fontSize:'10px',color:'var(--text3)',marginBottom:20,maxWidth:400,margin:'0 auto 20px'}},
          ['Computes what the AI model would have forecast for each of the last '+weeksBack+' weeks, then compares to your loaded actual sales. Shows MAPE, vs-LY%, and trend direction. Click any cell to drill into daily detail.']),
        btn({className:'btn btn-a',style:{padding:'10px 24px',fontSize:'12px'},onClick:runBacktest},
          ['▶ Run '+weeksBack+'-Week Backtest Report'])
      ),
      computing&&div({style:{textAlign:'center',padding:60}},
        div({style:{fontSize:'24px',marginBottom:8}},'⏳'),
        div({style:{color:'var(--text3)',fontSize:'11px'}},['Computing '+weeksBack+' weeks across all locations...'])
      ),
      report&&div(null,
        // Summary KPIs
        div({style:{display:'flex',gap:8,marginBottom:16,flexWrap:'wrap'}},
          (()=>{
            const allMapes=report.allLocs.flatMap(loc=>(report.results[loc]||[]).map(w=>w.mape).filter(v=>v!=null));
            const avgMape=allMapes.length?+(allMapes.reduce((a,v)=>a+v,0)/allMapes.length).toFixed(1):null;
            const allVsLY=report.allLocs.flatMap(loc=>(report.results[loc]||[]).map(w=>w.vsLY).filter(v=>v!=null));
            const avgVsLY=allVsLY.length?+(allVsLY.reduce((a,v)=>a+v,0)/allVsLY.length).toFixed(1):null;
            const bestStore=report.allLocs.map(loc=>{
              const m=(report.results[loc]||[]).map(w=>w.mape).filter(v=>v!=null);
              return{loc,avg:m.length?m.reduce((a,v)=>a+v,0)/m.length:99};
            }).sort((a,b)=>a.avg-b.avg)[0];
            return [
              {l:'District Avg MAPE',v:avgMape!=null?avgMape+'%':'—',c:mapeColor(avgMape),
                sub:avgMape!=null?(avgMape<6?'Excellent accuracy':avgMape<10?'Good accuracy':'Needs attention'):''},
              {l:'Avg vs Last Year',v:avgVsLY!=null?((avgVsLY>=0?'+':'')+avgVsLY+'%'):'—',
                c:avgVsLY!=null?(avgVsLY>=0?'#10b981':'#f87171'):'var(--text3)',sub:weeksBack+'-week rolling'},
              {l:'Most Accurate',v:bestStore?(STORE_NAMES[String(bestStore.loc)]||bestStore.loc):'—',
                c:'#10b981',sub:bestStore?bestStore.avg.toFixed(1)+'% avg MAPE':''},
              {l:'Weeks Analyzed',v:String(weeksBack),c:'var(--amber)',sub:report.allLocs.length+' locations'},
            ].map((k,i)=>div({key:i,style:{flex:'1 1 160px',background:'var(--surf2)',
              border:'.5px solid var(--bdr)',borderRadius:'var(--rl)',padding:'10px 14px'}},
              div({style:{fontSize:'9px',color:'var(--text3)',marginBottom:4,fontWeight:600,
                textTransform:'uppercase',letterSpacing:'.5px'}},[k.l]),
              div({style:{fontFamily:'var(--mono)',fontWeight:800,fontSize:'18px',color:k.c}},[k.v]),
              div({style:{fontSize:'9px',color:'var(--text3)',marginTop:2}},[k.sub])
            ));
          })()
        ),
        // Legend
        div({style:{display:'flex',gap:10,marginBottom:12,fontSize:'9px',color:'var(--text3)',
          padding:'5px 10px',background:'var(--surf2)',borderRadius:'var(--r)',alignItems:'center'}},
          span({style:{fontWeight:600}},'MAPE guide:'),
          div({style:{display:'flex',gap:2,alignItems:'center'}},div({style:{width:8,height:8,borderRadius:2,background:'#10b981'}}),span(' <6% = Excellent ✓')),
          div({style:{display:'flex',gap:2,alignItems:'center'}},div({style:{width:8,height:8,borderRadius:2,background:'#f59e0b'}}),span(' 6-10% = OK ~')),
          div({style:{display:'flex',gap:2,alignItems:'center'}},div({style:{width:8,height:8,borderRadius:2,background:'#f87171'}}),span(' >10% = Missed ✗')),
          span({style:{marginLeft:8}},['· Click any cell to see daily breakdown · MAPE = Mean Absolute % Error (lower = better model accuracy)'])
        ),
        ...getGroups().map(([name,locs])=>renderGroupTable(name,locs||[]))
      )
    )
  );
}


// Health score badge — compact, for use anywhere
function ModelHealthBadge({loc, settings, ds, showDetail}) {
  const health = computeModelHealth(loc, settings, ds);
  const [open, setOpen] = React.useState(false);

  return div({style:{display:'inline-flex',flexDirection:'column',alignItems:'flex-start',gap:2}},
    div({style:{display:'flex',alignItems:'center',gap:5,cursor:'pointer'},
      onClick:()=>setOpen(o=>!o),
      title:'Model Health Score — '+health.statement},
      // Score pill
      div({style:{display:'flex',alignItems:'center',gap:3,padding:'2px 7px',borderRadius:10,
        background:health.gradeColor+'22',border:'.5px solid '+health.gradeColor+'66'}},
        div({style:{width:6,height:6,borderRadius:'50%',background:health.gradeColor,flexShrink:0}}),
        span({style:{fontWeight:700,fontSize:'9px',color:health.gradeColor}},health.total),
        span({style:{fontSize:'8px',color:health.gradeColor}},' '+health.gradeLabel)
      ),
      showDetail&&span({style:{fontSize:'8px',color:'var(--text3)',marginLeft:2}},open?'▲':'▼')
    ),
    // Detail panel — only shows when open
    open&&showDetail&&div({style:{background:'var(--surf2)',border:'.5px solid var(--bdr)',
      borderRadius:'var(--r)',padding:'8px 10px',minWidth:220,fontSize:'9px',zIndex:10,
      boxShadow:'0 4px 12px rgba(0,0,0,.3)'}},
      div({style:{fontWeight:700,marginBottom:6,color:'var(--text)'}},
        'Model Health: '+health.total+'/100 — '+health.gradeLabel),
      div({style:{marginBottom:8,color:'var(--text2)',lineHeight:1.5}},health.statement),
      [
        {l:'Calibration', s:health.components.cal, max:30, n:health.notes.cal},
        {l:'Data Freshness', s:health.components.fresh, max:25, n:health.notes.fresh},
        {l:'MAPE Stability', s:health.components.mape, max:25, n:health.notes.mape},
        {l:'Sample Size', s:health.components.sample, max:20, n:health.notes.sample},
      ].map((c,i)=>div({key:i,style:{marginBottom:5}},
        div({style:{display:'flex',justifyContent:'space-between',marginBottom:2}},
          span({style:{color:'var(--text2)'}},[c.l]),
          span({style:{fontWeight:600,color:c.s/c.max>=.8?'#10b981':c.s/c.max>=.5?'#f59e0b':'#f87171'}},
            [c.s+'/'+c.max])
        ),
        div({style:{height:3,background:'var(--bdr)',borderRadius:2}},
          div({style:{height:'100%',borderRadius:2,width:(c.s/c.max*100)+'%',
            background:c.s/c.max>=.8?'#10b981':c.s/c.max>=.5?'#f59e0b':'#f87171',
            transition:'width .3s'}})),
        div({style:{fontSize:'8px',color:'var(--text3)',marginTop:1}},[c.n])
      ))
    )
  );
}

function AtAGlance({stores, ds, settings, userEvents, lockedProjections, dateRange, onOpenStore, onOpenProjections, onOpenPVSA, onOpenBrief, onNav, onOpenModal}) {
  const today = new Date();
  const allLocs = (stores||[]).filter(s=>/^\d+$/.test(s.loc)).map(s=>s.loc);
  const orgOf = loc => (STORE_COORDS[String(loc)]||{}).org||'MCDOK';
  const okLocs = allLocs.filter(l=>orgOf(l)==='MCDOK');
  const flLocs = allLocs.filter(l=>orgOf(l)==='Emerald Arches');

  // ── Date range comes from the toolbar (global App state) ───────────────
  // The toolbar date picker controls the date range for all views including At a Glance.

  const inRange = (d,r) => d&&r&&r.s&&r.e&&d>=r.s&&d<=r.e;

  // ── Comment mode ─────────────────────────────────────────────
  const [commentMode,setCommentMode] = React.useState(()=>localStorage.getItem('mf_comment_mode')||'rule');
  const [aiComment,setAiComment] = React.useState(null);
  const [aiLoading,setAiLoading] = React.useState(false);

  // ── Section config ───────────────────────────────────────────
  const DEF_SECS=[
    {id:'intelligence',label:'Intelligence Summary',icon:'🧠',on:true},
    {id:'projections',label:'Projections & Forecasting',icon:'📈',on:true},
    {id:'sales',label:'Sales & Guest Counts',icon:'💰',on:true},
    {id:'digital',label:'Digital Sales',icon:'📱',on:true},
    {id:'service',label:'Service',icon:'⚡',on:true},
    {id:'controls',label:'Controls & Labor',icon:'🔒',on:true},
    {id:'fob',label:'FOB & Food Cost',icon:'🍟',on:true},
    {id:'radar',label:'District Pulse',icon:'🎯',on:true},
    {id:'leaderboard',label:'Store Leaderboard',icon:'🏆',on:true},
    {id:'labor',label:'Labor (standalone)',icon:'👥',on:false},
  ];
  const [secs,setSecs] = React.useState(()=>{
    try{const s=JSON.parse(localStorage.getItem('mf_kpi_secs')||'null');if(!s)return DEF_SECS;const merged=[...s];DEF_SECS.forEach(d=>{if(!merged.find(m=>m.id===d.id))merged.push(d);});return merged;}catch(e){return DEF_SECS;}
  });
  const [showSecCfg,setShowSecCfg] = React.useState(false);
  const [lbMetric,setLbMetric] = React.useState('sales'); // leaderboard selected metric
  const saveSecs = s=>{setSecs(s);localStorage.setItem('mf_kpi_secs',JSON.stringify(s));};
  const toggleSec = id=>saveSecs(secs.map(s=>s.id===id?{...s,on:!s.on}:s));
  const moveSec = (id,dir)=>{
    const idx=secs.findIndex(s=>s.id===id);if(idx<0)return;
    const n=[...secs];const to=idx+dir;if(to<0||to>=n.length)return;
    [n[idx],n[to]]=[n[to],n[idx]];saveSecs(n);
  };

  // ── Action checklist ─────────────────────────────────────────
  const [cl,setCl] = React.useState(()=>{
    try{return JSON.parse(localStorage.getItem('mf_checklist_v2')||'[]');}catch(e){return [];}
  });
  const [showArchive,setShowArchive] = React.useState(false);
  const saveCl = c=>{setCl(c);localStorage.setItem('mf_checklist_v2',JSON.stringify(c));};

  // Auto-generate checklist items from app state
  const autoItems = React.useMemo(()=>{
    const items=[];
    const latestLab = ds&&ds.laborRows&&ds.laborRows.length?
      new Date(Math.max(...ds.laborRows.map(r=>r.date).filter(Boolean))):null;
    const dataAge = latestLab?Math.floor((today-latestLab)/864e5):999;
    if(dataAge>14) items.push({id:'auto_data_stale',priority:'high',
      text:'Data is '+dataAge+' days old — upload Operations Report',
      detail:'Upload: Operations_Report_[YYYY-MM-DD]_to_[YYYY-MM-DD].xlsx'});
    else if(dataAge>7) items.push({id:'auto_data_warn',priority:'medium',
      text:'Data is '+dataAge+' days old — update when available',detail:''});
    const wsd=settings.weekStartDay!=null?settings.weekStartDay:3;
    const ws=new Date(today);while(ws.getDay()!==wsd)ws.setDate(ws.getDate()-1);
    const wsKey=dKey(ws);
    const lp=lockedProjections||{};
    const unlocked=allLocs.filter(loc=>!lp[loc+'_'+wsKey]);
    if(unlocked.length>0) items.push({id:'auto_locks',priority:'high',
      text:unlocked.length+' store'+(unlocked.length>1?'s':'')+' missing this week\'s projection lock',
      detail:unlocked.map(l=>STORE_NAMES[l]||l).join(', ')});
    const redStores=allLocs.filter(loc=>modelHealthScore(loc,ds,settings).score<50);
    if(redStores.length>0) items.push({id:'auto_red_health',priority:'high',
      text:redStores.length+' store'+(redStores.length>1?'s':'')+' at red model health',
      detail:redStores.map(l=>STORE_NAMES[l]||l).join(', ')});
    const uncal=allLocs.filter(loc=>{
      const di=settings.dialedIn&&settings.dialedIn[loc];
      if(!di)return true;
      return di.runDate&&Math.floor((today-new Date(di.runDate))/864e5)>30;
    });
    if(uncal.length>3) items.push({id:'auto_calibration',priority:'medium',
      text:uncal.length+' stores need Dialed-In calibration (>30 days)',
      detail:'Go to Dialed-In → Run & Apply'});
    return items;
  },[ds?.laborRows?.length,allLocs,settings,lockedProjections]);

  const activeCl=cl.filter(c=>!c.archivedAt);
  const archivedCl=cl.filter(c=>c.archivedAt);
  const activeAutoItems=autoItems.filter(ai=>!cl.find(c=>c.id===ai.id&&c.archivedAt&&(today-new Date(c.archivedAt))<86400000));
  const allActiveItems=[...activeAutoItems,...activeCl.filter(c=>!c.id.startsWith('auto_'))];

  const archiveItem=id=>{
    const now=new Date().toISOString();
    // For auto items: add to cl with archivedAt
    if(id.startsWith('auto_')){
      const existing=cl.find(c=>c.id===id);
      if(existing) saveCl(cl.map(c=>c.id===id?{...c,archivedAt:now}:c));
      else saveCl([...cl,{id,archivedAt:now,text:autoItems.find(a=>a.id===id)?.text||'',isAuto:true}]);
    } else {
      saveCl(cl.map(c=>c.id===id?{...c,archivedAt:now}:c));
    }
  };
  const restoreItem=id=>saveCl(cl.map(c=>c.id===id?{...c,archivedAt:null}:c));
  const deleteItem=id=>saveCl(cl.filter(c=>c.id!==id));

  // ── Aggregation helpers ───────────────────────────────────────

  // effectiveDateRange: use toolbar period if it has data, otherwise fall
  // back to most recent 30 days of loaded data so tiles always show content.
  const effectiveDateRange = React.useMemo(()=>{
    if(!dateRange?.s) return dateRange;
    const hasData=(ds?.laborRows||[]).some(r=>r.date&&r.date>=dateRange.s&&r.date<=dateRange.e);
    if(hasData)return{...dateRange,isFallback:false};
    const dates=(ds?.laborRows||[]).map(r=>r.date).filter(Boolean);
    if(!dates.length)return{...dateRange,isFallback:false};
    const maxD=new Date(Math.max(...dates));
    const minD=new Date(maxD);minD.setDate(minD.getDate()-29);minD.setHours(0,0,0,0);
    const toD=new Date(maxD);toD.setHours(23,59,59,999);
    return{s:minD,e:toD,isFallback:true,
      fallbackLabel:maxD.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})};
  },[dateRange,ds?.laborRows?.length]);

  const labInRange = React.useMemo(()=>
    (ds?.laborRows||[]).filter(r=>inRange(r.date,effectiveDateRange))
  ,[ds?.laborRows?.length,effectiveDateRange]);

  const opsInRange = React.useMemo(()=>
    (ds?.opsRows||[]).filter(r=>inRange(r.date,effectiveDateRange))
  ,[ds?.opsRows?.length,effectiveDateRange]);

  const ctrlInRange = React.useMemo(()=>
    (ds?.ctrlRows||[]).filter(r=>inRange(r.date,effectiveDateRange))
  ,[ds?.ctrlRows?.length,effectiveDateRange]);

  // FOB is monthly data (dated the 1st of each month).
  // Always show the most recent available month — don't filter by the weekly dateRange.
  const fobRecent = React.useMemo(()=>{
    const rows=ds?.fobRows||[];
    if(!rows.length)return [];
    const dates=rows.map(r=>r.date).filter(Boolean);
    if(!dates.length)return [];
    const maxDate=new Date(Math.max(...dates));
    return rows.filter(r=>r.date&&
      r.date.getFullYear()===maxDate.getFullYear()&&
      r.date.getMonth()===maxDate.getMonth());
  },[ds?.fobRows?.length]);
  const fobInRange = fobRecent; // alias so existing code compiles unchanged

  const avgOf=(rows,field)=>{const v=rows.map(r=>r[field]).filter(x=>x!=null&&x>0);return v.length?v.reduce((a,b)=>a+b,0)/v.length:null;};
  const sumOf=(rows,field)=>rows.reduce((a,r)=>a+(r[field]||0),0);
  const pctOf=(a,b)=>b>0?((a/b-1)*100).toFixed(1)+'%':null;

  const labByLoc=loc=>labInRange.filter(r=>r.loc===String(loc));
  const opsByLoc=loc=>opsInRange.filter(r=>r.loc===String(loc));
  const ctrlByLoc=loc=>ctrlInRange.filter(r=>r.loc===String(loc));
  const fobByLoc=loc=>fobInRange.filter(r=>r.loc===String(loc));

  // ── Market averages ───────────────────────────────────────────
  const mktAvg=(locs,rows,field,fn='avg')=>{
    const vals=locs.map(loc=>{
      const r=rows.filter(row=>row.loc===String(loc));
      return fn==='sum'?sumOf(r,field):avgOf(r,field);
    }).filter(v=>v!=null&&v>0);
    return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null;
  };

  // ── Data status ────────────────────────────────────────────────
  const latestLab=React.useMemo(()=>{
    const dates=(ds?.laborRows||[]).map(r=>r.date).filter(Boolean);
    return dates.length?new Date(Math.max(...dates)):null;
  },[ds?.laborRows?.length]);
  const dataAge=latestLab?Math.floor((today-latestLab)/864e5):999;
  const ageClr=dataAge<=3?'#10b981':dataAge<=7?'#f59e0b':'#f87171';

  // ── Model health ───────────────────────────────────────────────
  const hlth=React.useMemo(()=>{
    let g=0,y=0,r=0;
    allLocs.forEach(loc=>{const h=modelHealthScore(loc,ds,settings);if(h.score>=75)g++;else if(h.score>=50)y++;else r++;});
    return{green:g,yellow:y,red:r};
  },[allLocs,ds?.laborRows?.length,settings?.dialedIn]);

  // ── Rule-based state comment ───────────────────────────────────
  const ruleComment=React.useMemo(()=>{
    const issues=[];const good=[];
    if(dataAge>14)issues.push({lvl:'critical',msg:'data is '+dataAge+' days old'});
    else if(dataAge>7)issues.push({lvl:'warning',msg:'data is '+dataAge+' days stale'});
    else good.push(dataAge===0?'data loaded today':'data is '+dataAge+'d old');
    const wsd=settings.weekStartDay!=null?settings.weekStartDay:3;
    const ws=new Date(today);while(ws.getDay()!==wsd)ws.setDate(ws.getDate()-1);
    const wsKey=dKey(ws);const lp=lockedProjections||{};
    const nLocked=allLocs.filter(loc=>lp[loc+'_'+wsKey]).length;
    if(nLocked===allLocs.length&&allLocs.length>0)good.push('all '+allLocs.length+' projection locks complete');
    else if(allLocs.length-nLocked>5)issues.push({lvl:'warning',msg:(allLocs.length-nLocked)+' projection locks still needed'});
    if(hlth.red>0)issues.push({lvl:'warning',msg:hlth.red+' store'+(hlth.red>1?'s':'')+' at red model health'});
    else if(hlth.green>=allLocs.length*.75&&allLocs.length>0)good.push(hlth.green+' stores at trusted health');
    if(!ds?.loaded||!ds.laborRows?.length)issues.push({lvl:'critical',msg:'no data loaded — upload Operations Report'});
    if(issues.some(i=>i.lvl==='critical'))
      return{tone:'critical',color:'#f87171',text:'🚨 Action required — '+issues.map(i=>i.msg).join('; ')+'.'};
    if(issues.length>0)
      return{tone:'warning',color:'#f59e0b',text:'⚠️  A few items need attention: '+issues.map(i=>i.msg).join(', ')+'.'};
    return{tone:'good',color:'#10b981',text:'✅ Things are looking up! '+(good.length?good.join(', ').replace(/^./,s=>s.toUpperCase())+'.':"District is on track.")};
  },[dataAge,hlth,allLocs,lockedProjections,ds?.loaded,settings?.weekStartDay]);

  const fetchAIComment=async()=>{
    const apiKey=(()=>{try{return localStorage.getItem('mf_anthropic_key')||'';}catch{return '';}})();
    if(!apiKey){
      setAiComment('No API key configured. Go to Settings → AI & Integrations and add your Anthropic API key.');
      return;
    }
    setAiLoading(true);
    try{
      const summary={dataAge,healthGreen:hlth.green,healthYellow:hlth.yellow,healthRed:hlth.red,
        totalStores:allLocs.length,lockedStores:allLocs.filter(l=>(lockedProjections||{})[l+'_'+dKey(new Date())]).length,
        ruleComment:ruleComment.text};
      const res=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',
        headers:{'Content-Type':'application/json','x-api-key':apiKey,
          'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
        body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:200,
          messages:[{role:'user',content:'You are an assistant for a McDonald\'s district operations tool. Write ONE short paragraph (2-3 sentences, plain English, warm but professional tone) summarizing the state of the district for the operator\'s morning dashboard. Data: '+JSON.stringify(summary)+'. Keep it concise and actionable.'}]})});
      const d=await res.json();
      setAiComment((d.content||[]).map(b=>b.text||'').join(''));
    }catch(e){setAiComment('AI narrative unavailable: '+e.message);}
    setAiLoading(false);
  };

  // ── Helpers ────────────────────────────────────────────────────
  const Chip=({label,val,vs,good,fmt})=>{
    const clr=vs!=null?(good==='high'?val>=vs:'low'?val<=vs:val>=vs)?'#10b981':'#f87171':'var(--text3)';
    return div({style:{display:'flex',flexDirection:'column',alignItems:'center',minWidth:60,gap:2}},
      div({style:{fontSize:'16px',fontFamily:'var(--mono)',fontWeight:700,color:clr}},
        fmt?fmt(val):(val!=null?val.toFixed(1):'—')),
      div({style:{fontSize:'7px',color:'var(--text3)',letterSpacing:'.5px',textTransform:'uppercase'}},label)
    );
  };

  const MktBadge=({ok,fl,fmt})=>div({style:{display:'flex',gap:6,marginTop:4,flexWrap:'wrap'}},
    ok!=null&&span({style:{fontSize:'9px',background:'rgba(59,130,246,.15)',color:'#60a5fa',borderRadius:3,padding:'1px 5px'}},
      'OK: '+(fmt?fmt(ok):ok.toFixed(1))),
    fl!=null&&span({style:{fontSize:'9px',background:'rgba(16,185,129,.15)',color:'#34d399',borderRadius:3,padding:'1px 5px'}},
      'FL: '+(fmt?fmt(fl):fl.toFixed(1)))
  );

  const SecCard=({id,label,icon,children})=>div({style:{background:'var(--surf)',border:'.5px solid var(--bdr)',borderRadius:8,overflow:'hidden',marginBottom:10}},
    div({style:{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',background:'var(--surf2)',borderBottom:'.5px solid var(--bdr)'}},
      span({style:{fontSize:14}},icon),
      span({style:{fontSize:'11px',fontWeight:700,color:'var(--text)',letterSpacing:'.3px'}}),
      span({style:{fontSize:'11px',fontWeight:700,color:'var(--text)'}},label)
    ),
    div({style:{padding:'10px 12px'}},children)
  );

  const KpiRow=({label,val,okAvg,flAvg,tgt,fmtFn,goodDir})=>{
    const tgtClr=tgt!=null&&val!=null?(goodDir==='low'?val<=tgt:val>=tgt)?'#10b981':'#f87171':'transparent';
    return div({style:{display:'flex',alignItems:'center',gap:8,padding:'4px 0',borderBottom:'.5px solid rgba(255,255,255,.04)'}},
      div({style:{fontSize:'9px',color:'var(--text3)',width:130,flexShrink:0}},label),
      div({style:{fontSize:'11px',fontFamily:'var(--mono)',fontWeight:600,color:'var(--text)',width:70}},(fmtFn?fmtFn(val):(val!=null?val.toFixed(1):' — '))),
      tgt!=null&&div({style:{width:8,height:8,borderRadius:'50%',background:tgtClr,flexShrink:0}}),
      (okAvg!=null||flAvg!=null)&&MktBadge({ok:okAvg,fl:flAvg,fmt:fmtFn})
    );
  };

  // ── Projection section ─────────────────────────────────────────
  const projSec=React.useMemo(()=>{
    const mapeVals=allLocs.map(loc=>{const di=settings.dialedIn?.[loc];return di?.mape6w??di?.mape4w??di?.mape;}).filter(v=>v!=null);
    const avgMape=mapeVals.length?mapeVals.reduce((a,b)=>a+b,0)/mapeVals.length:null;
    const wsd=settings.weekStartDay!=null?settings.weekStartDay:3;
    const ws=new Date(today);while(ws.getDay()!==wsd)ws.setDate(ws.getDate()-1);
    const wsKey=dKey(ws);const lp=lockedProjections||{};
    const locked=allLocs.filter(loc=>lp[loc+'_'+wsKey]).length;
    return{avgMape,locked,total:allLocs.length,health:hlth};
  },[allLocs,settings?.dialedIn,lockedProjections,hlth]);

  // ── Sales section ─────────────────────────────────────────────
  const salesSec=React.useMemo(()=>{
    if(!labInRange.length)return null;
    const byLoc=loc=>labInRange.filter(r=>r.loc===String(loc));
    const totSales=allLocs.reduce((a,l)=>a+sumOf(byLoc(l),'allNetSales'),0)||allLocs.reduce((a,l)=>a+sumOf(byLoc(l),'sales'),0);
    const totGC=allLocs.reduce((a,l)=>a+sumOf(byLoc(l),'gc'),0);
    const avgChk=totGC>0?totSales/totGC:0;
    const channels=[
      {key:'dtSales',pctKey:'dtPctTotal',label:'Drive-Thru'},
      {key:'bfSales',pctKey:'bfPctTotal',label:'Breakfast'},
      {key:'delivSales',pctKey:'delivPctTotal',label:'McDelivery'},
      {key:'mopSales',pctKey:'mopPctTotal',label:'MOP'},
      {key:'kioskSales',pctKey:'kioskPctTotal',label:'Kiosk'},
      {key:'eatInSales',pctKey:null,label:'Eat-In'},
    ];
    const chData=channels.map(ch=>{
      const s=sumOf(labInRange,ch.key);
      const pct=totSales>0&&s>0?s/totSales:null;
      const okA=mktAvg(okLocs,labInRange,ch.key,'sum');
      const flA=mktAvg(flLocs,labInRange,ch.key,'sum');
      return{...ch,sales:s,pct,okAvgPct:null,flAvgPct:null};
    });
    const salesVsLY=avgOf(labInRange,'salesVsLYPct');
    // GC vs LY: shift dateRange back 364 days, query ds.laborRows directly
    const lyS=addD(dateRange.s,-364),lyE=addD(dateRange.e,-364);
    const labLY=(ds?.laborRows||[]).filter(r=>r.date>=lyS&&r.date<=lyE&&allLocs.includes(String(r.loc))&&r.gc>0);
    const totGCLY=labLY.reduce((a,r)=>a+(r.gc||0),0);
    const gcVsLY=totGCLY>10?(totGC-totGCLY)/totGCLY:null;
    // Avg check vs LY
    const totSalesLY=labLY.reduce((a,r)=>a+(r.sales||0),0);
    const avgCheckLY=totGCLY>0?totSalesLY/totGCLY:0;
    const avgCheckVsLY=avgCheckLY>0?(avgChk-avgCheckLY)/avgCheckLY:null;
    return{totSales,totGC,avgChk,channels:chData,salesVsLY,gcVsLY,avgCheckVsLY};
  },[labInRange,allLocs,okLocs,flLocs,ds?.laborRows,dateRange]);

  // ── Labor section ─────────────────────────────────────────────
  const laborSec=React.useMemo(()=>{
    // Labor productivity metrics (TPPH, labor%, OT, Act vs Need) live in the
    // Controls sheet (ctrlRows/Billable Sales group) — NOT the Sales sheet (labInRange).
    // Sales sheet only has channel sales data. Fall back to labInRange if ctrl is empty.
    const cRows=ctrlInRange.length?ctrlInRange:[];
    const lRows=labInRange;
    if(!cRows.length&&!lRows.length)return null;
    const laborPct=avgOf(cRows,'laborPct')||avgOf(lRows,'laborPct');
    const tpph=avgOf(cRows,'tpph')||avgOf(lRows,'tpph');
    const avn=avgOf(cRows,'actVsNeed')||avgOf(lRows,'actVsNeed');
    const otHrs=sumOf(cRows,'otHrs')||sumOf(lRows,'otHrs');
    const actHrs=sumOf(cRows,'actHrs')||sumOf(lRows,'actHrs');
    const crewHrs=sumOf(cRows,'crewHrs');
    const avgRate=avgOf(cRows,'avgRate')||avgOf(lRows,'avgRate');
    // Market averages — also from Controls sheet
    const okLaborAvg=mktAvg(okLocs,cRows,'laborPct')||mktAvg(okLocs,lRows,'laborPct');
    const flLaborAvg=mktAvg(flLocs,cRows,'laborPct')||mktAvg(flLocs,lRows,'laborPct');
    const okTpphAvg=mktAvg(okLocs,cRows,'tpph')||mktAvg(okLocs,lRows,'tpph');
    const flTpphAvg=mktAvg(flLocs,cRows,'tpph')||mktAvg(flLocs,lRows,'tpph');
    const ranked=[...allLocs].map(loc=>{
      const cr=cRows.filter(r=>r.loc===String(loc));
      const lr=lRows.filter(r=>r.loc===String(loc));
      return{loc,laborPct:avgOf(cr,'laborPct')||avgOf(lr,'laborPct'),tpph:avgOf(cr,'tpph')||avgOf(lr,'tpph')};
    }).filter(x=>x.laborPct!=null).sort((a,b)=>a.laborPct-b.laborPct);
    return{laborPct,tpph,avn,otHrs,actHrs,crewHrs,avgRate,okLaborAvg,flLaborAvg,okTpphAvg,flTpphAvg,ranked};
  },[labInRange,ctrlInRange,allLocs,okLocs,flLocs]);

  // ── Service section ───────────────────────────────────────────
  const serviceSec=React.useMemo(()=>{
    if(!opsInRange.length)return null;
    const oepe=avgOf(opsInRange,'oepe');
    const park=avgOf(opsInRange,'park');
    const kvst=avgOf(opsInRange,'kvst');
    const kvsu=avgOf(opsInRange,'kvsu');
    const r2p=avgOf(opsInRange,'r2p');
    return{
      oepe,okOepe:mktAvg(okLocs,opsInRange,'oepe'),flOepe:mktAvg(flLocs,opsInRange,'oepe'),
      park,okPark:mktAvg(okLocs,opsInRange,'park'),flPark:mktAvg(flLocs,opsInRange,'park'),
      kvst,okKvst:mktAvg(okLocs,opsInRange,'kvst'),flKvst:mktAvg(flLocs,opsInRange,'kvst'),
      kvsu,okKvsu:mktAvg(okLocs,opsInRange,'kvsu'),flKvsu:mktAvg(flLocs,opsInRange,'kvsu'),
      r2p,okR2p:mktAvg(okLocs,opsInRange,'r2p'),flR2p:mktAvg(flLocs,opsInRange,'r2p'),
    };
  },[opsInRange,allLocs,okLocs,flLocs]);

  // ── Controls section ─────────────────────────────────────────
  const ctrlSec=React.useMemo(()=>{
    if(!ctrlInRange.length)return null;
    const a=f=>avgOf(ctrlInRange,f);
    const s=f=>sumOf(ctrlInRange,f);
    // Field names match exactly what parseCtrlData stores
    return{
      // T-Reds (correct field names)
      tRedBPct:a('tRedBPct'),tRedBCnt:s('tRedBCnt'),
      tRedAPct:a('tRedAPct'),tRedACnt:s('tRedACnt'),
      // Promo — now correctly mapped to Promo Pct group (separate from Discount)
      promoPct:a('promoPct'),promoCnt:s('promoCnt'),promoAmt:s('promoAmt'),
      // Cash
      cashOSPct:a('cashOSPct'),cashOSAmt:s('cashOSAmt'),
      // Refunds — separate cash and cashless in parseCtrlData
      cashRefCnt:s('cashRefCnt'),cashRefAmt:s('cashRefAmt'),
      cashlessRefCnt:s('cashlessRefCnt'),cashlessRefAmt:s('cashlessRefAmt'),
      manualRefAmt:s('manualRefAmt'),
      // POS Overrings — stored as posOverCnt/posOverAmt
      overringCnt:s('posOverCnt'),overringAmt:s('posOverAmt'),
      drawerOpens:s('drawerOpens'),
      // Meals
      empMealAmt:s('empMealAmt'),mgrMealAmt:s('mgrMealAmt'),
      // Labor (Controls Billable Sales group — the right source)
      discPct:a('discPct'),tpph:a('tpph'),laborPct:a('laborPct'),
      actVsNeed:a('actVsNeed'),otHrs:s('otHrs'),actHrs:s('actHrs'),
      // Market averages
      okTRedAPct:mktAvg(okLocs,ctrlInRange,'tRedAPct'),flTRedAPct:mktAvg(flLocs,ctrlInRange,'tRedAPct'),
      okTRedBPct:mktAvg(okLocs,ctrlInRange,'tRedBPct'),flTRedBPct:mktAvg(flLocs,ctrlInRange,'tRedBPct'),
      okPromoPct:mktAvg(okLocs,ctrlInRange,'promoPct'),flPromoPct:mktAvg(flLocs,ctrlInRange,'promoPct'),
      okCashOSPct:mktAvg(okLocs,ctrlInRange,'cashOSPct'),flCashOSPct:mktAvg(flLocs,ctrlInRange,'cashOSPct'),
    };
  },[ctrlInRange,okLocs,flLocs]);

  // ── FOB section ───────────────────────────────────────────────
  const fobSec=React.useMemo(()=>{
    if(!fobInRange.length)return null;
    const a=f=>avgOf(fobInRange,f);
    return{
      fobPct:a('fobPct'),baseFoodPct:a('baseFoodPct'),unexplained:a('unexplained'),
      compWaste:a('compWaste'),rawWaste:a('rawWaste'),condiment:a('condiment'),
      empMeal:a('empMeal'),statVar:a('statVar'),discCoupon:a('discCoupon'),
      pLFoodPct:a('pLFoodPct'),pLPaperPct:a('pLPaperPct'),
      okFobPct:mktAvg(okLocs,fobInRange,'fobPct'),flFobPct:mktAvg(flLocs,fobInRange,'fobPct'),
      okPLFoodPct:mktAvg(okLocs,fobInRange,'pLFoodPct'),flPLFoodPct:mktAvg(flLocs,fobInRange,'pLFoodPct'),
      okBaseFoodPct:mktAvg(okLocs,fobInRange,'baseFoodPct'),flBaseFoodPct:mktAvg(flLocs,fobInRange,'baseFoodPct'),
      okUnexp:mktAvg(okLocs,fobInRange,'unexplained'),flUnexp:mktAvg(flLocs,fobInRange,'unexplained'),
      okCompWaste:mktAvg(okLocs,fobInRange,'compWaste'),flCompWaste:mktAvg(flLocs,fobInRange,'compWaste'),
      okRawWaste:mktAvg(okLocs,fobInRange,'rawWaste'),flRawWaste:mktAvg(flLocs,fobInRange,'rawWaste'),
      okCondiment:mktAvg(okLocs,fobInRange,'condiment'),flCondiment:mktAvg(flLocs,fobInRange,'condiment'),
      okEmpMeal:mktAvg(okLocs,fobInRange,'empMeal'),flEmpMeal:mktAvg(flLocs,fobInRange,'empMeal'),
      okStatVar:mktAvg(okLocs,fobInRange,'statVar'),flStatVar:mktAvg(flLocs,fobInRange,'statVar'),
      okDiscCoupon:mktAvg(okLocs,fobInRange,'discCoupon'),flDiscCoupon:mktAvg(flLocs,fobInRange,'discCoupon'),
    };
  },[fobInRange,okLocs,flLocs]);

  // ── Intelligence Summary (Morning Brief) ─────────────────────────
  const intelSec=React.useMemo(()=>{
    if(!stores.length) return null;
    // Weighted district targets (sales-weighted where possible, else simple avg)
    const getTgt=(tKey,dflt)=>{
      const vals=allLocs.map(l=>{const t=(settings.targets&&settings.targets[l])||DEFAULT_TARGETS[l]||{};return t[tKey]??dflt;});
      return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:dflt;
    };
    const laborTgt=getTgt('tLabor',0.22);
    const fobTgt=getTgt('tFOBTotal',0.279);
    const oepeTgt=getTgt('tOepe',140);
    const tpphTgt=getTgt('tTpph',5.5);
    const parkTgt=getTgt('tPark',0.12);
    // Per-store alert analysis
    const diMap=settings.dialedIn||{};
    const storeAlerts=allLocs.map(loc=>{
      const t=(settings.targets&&settings.targets[loc])||DEFAULT_TARGETS[loc]||{};
      const locLabor=laborSec?.ranked?.find(r=>r.loc===String(loc))?.laborPct;
      const locMape=diMap[loc]?.mape6w??diMap[loc]?.mape4w??diMap[loc]?.mape;
      const s=stores.find(st=>st.loc===String(loc));
      const p=s?.p||{};
      const issues=[];
      if(p.t4w!=null&&p.t4w<-0.05) issues.push('sales↓');
      if(locLabor!=null&&locLabor>(t.tLabor||laborTgt)+0.02) issues.push('labor↑');
      if(locMape!=null&&locMape>10) issues.push('mape↑');
      return{loc,issues};
    }).filter(x=>x.issues.length>0);
    const declineSt=storeAlerts.filter(x=>x.issues.includes('sales↓')).length;
    const laborSt=storeAlerts.filter(x=>x.issues.includes('labor↑')).length;
    const mapeSt=storeAlerts.filter(x=>x.issues.includes('mape↑')).length;
    return{laborTgt,fobTgt,oepeTgt,tpphTgt,parkTgt,storeAlerts,declineSt,laborSt,mapeSt};
  },[allLocs,stores,settings,laborSec]);

  // ── Existing district projection (reuse existing data) ────────
  const [deepStore,setDeepStore]=React.useState(null);
  const [projPeriod,setProjPeriod]=React.useState('week');

  const userName=settings.userName||'';
  const hour=today.getHours();
  const greetWord=hour<12?'Good morning':hour<17?'Good afternoon':'Good evening';

  const pF=v=>v!=null?fP(v):'—';
  const pFn=(v,d=1)=>v!=null?((v*100).toFixed(d)+'%'):'—';
  const sFmt=v=>v!=null?f$(Math.round(v)):'—';
  const tFmt=v=>v!=null?Math.round(v)+'s':'—';

  // ── Weekly trend (last 6 completed weeks, for Projections sparkline) ─
  // ── Memoized CI + Drift (Enhancement 3+4) ─────────────────────────────────
  const ciAndDrift=React.useMemo(()=>{
    if(!ds||!ds.loaded||!stores||!stores.length) return null;
    try{
      const nextWeekStart=mwStart();
      const sigmas=stores.map(s=>{try{return computeStoreSigma(s.loc,ds,{...settings,_userEvents:userEvents||{}},6)||0.07;}catch{return 0.07;}});
      const avgSigma=sigmas.reduce((a,b)=>a+b,0)/sigmas.length||0.07;
      const dayFcs=stores.map(s=>{try{const r=forecastDay(s.loc,nextWeekStart,ds,settings);return r&&!r.noLYData?(r.forecast||0):0;}catch{return 0;}});
      const weekFcTotal=dayFcs.reduce((a,b)=>a+b,0)*7;
      const ciLow=weekFcTotal>0?Math.round(weekFcTotal*(1-1.645*avgSigma)):0;
      const ciHigh=weekFcTotal>0?Math.round(weekFcTotal*(1+1.645*avgSigma)):0;
      const driftStores=stores.map(s=>{try{const d=computeMAPEDrift(s.loc,ds,{...settings,_userEvents:userEvents||{}});return d&&d.status!=='ok'&&d.drift>=2?{s,d}:null;}catch{return null;}}).filter(Boolean);
      return{ciLow,ciHigh,driftStores,avgSigma};
    }catch(e){return null;}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[ds&&ds.laborRows&&ds.laborRows.length,stores&&stores.length]);

  const weeklyTrend=React.useMemo(()=>{    if(!ds?.laborRows?.length)return[];
    const wsd=settings?.weekStartDay??3;
    const getWS=d=>{const w=new Date(d);while(w.getDay()!==wsd)w.setDate(w.getDate()-1);w.setHours(0,0,0,0);return w;};
    const result=[];
    for(let w=6;w>=1;w--){
      const ws=getWS(addD(today,-(w*7))),we=addD(new Date(ws),6);we.setHours(23,59,59,999);
      const wRows=(ds.laborRows||[]).filter(r=>r.date&&r.date>=ws&&r.date<=we);
      const sales=wRows.reduce((a,r)=>a+(r.allNetSales||r.sales||0),0);
      if(!sales){result.push({label:'—',sales:0,vsLY:null});continue;}
      const lyWs=addD(new Date(ws),-364),lyWe=addD(new Date(we),-364);
      const lyRows=(ds.laborRows||[]).filter(r=>r.date&&r.date>=lyWs&&r.date<=lyWe);
      const lySales=lyRows.reduce((a,r)=>a+(r.allNetSales||r.sales||0),0);
      result.push({label:ws.toLocaleDateString('en-US',{month:'short',day:'numeric'}),
        sales,lySales,vsLY:lySales>0?(sales-lySales)/lySales:null});
    }
    return result;
  },[ds?.laborRows?.length]);

  // ── Leaderboard store rankings ────────────────────────────────────────
  const lbData=React.useMemo(()=>{
    const META={
      sales:{getVal:loc=>{const r=labInRange.filter(r=>r.loc===String(loc));const v=r.reduce((a,x)=>a+(x.allNetSales||0),0);return r.length&&v>0?v:null;},
        fmt:v=>f$(Math.round(v)),higherBetter:true,label:'Net Sales',unit:'$'},
      oepe:{getVal:loc=>avgOf(opsInRange.filter(r=>r.loc===String(loc)),'oepe'),
        fmt:v=>Math.round(v)+'s',higherBetter:false,label:'OEPE W/O Parked',unit:'s'},
      labor:{getVal:loc=>avgOf(ctrlInRange.filter(r=>r.loc===String(loc)),'laborPct'),
        fmt:v=>((v||0)*100).toFixed(1)+'%',higherBetter:false,label:'Labor %',unit:'%'},
      tred:{getVal:loc=>avgOf(ctrlInRange.filter(r=>r.loc===String(loc)),'tRedAPct'),
        fmt:v=>((v||0)*100).toFixed(2)+'%',higherBetter:false,label:'T-Red After %',unit:'%'},
    };
    const m=META[lbMetric]||META.sales;
    const data=allLocs.map(loc=>({loc,name:STORE_NAMES[String(loc)]||loc,
      value:m.getVal(loc),org:flLocs.includes(String(loc))?'FL':'OK'}))
      .filter(x=>x.value!=null)
      .sort((a,b)=>m.higherBetter?b.value-a.value:a.value-b.value);
    const avg=data.length?data.reduce((a,s)=>a+s.value,0)/data.length:null;
    return{data,avg,fmt:m.fmt,label:m.label,higherBetter:m.higherBetter};
  },[lbMetric,labInRange,opsInRange,ctrlInRange,allLocs,flLocs]);

  // Digital sales section useMemo
  const digitalSec=React.useMemo(()=>{
    if(!labInRange.length)return null;
    const sm=allLocs.map(loc=>{
      const rows=labInRange.filter(r=>r.loc===String(loc));
      const tot=rows.reduce((a,r)=>a+(r.allNetSales||0),0);
      if(!tot)return null;
      const deliv=rows.reduce((a,r)=>a+(r.delivSales||0),0);
      const mop=rows.reduce((a,r)=>a+(r.mopSales||0),0);
      const kiosk=rows.reduce((a,r)=>a+(r.kioskSales||0),0);
      const dt=rows.reduce((a,r)=>a+(r.dtSales||0),0);
      const eatIn=rows.reduce((a,r)=>a+(r.eatInSales||0),0);
      return{loc,tot,deliv,mop,kiosk,dig:deliv+mop+kiosk,dt,eatIn,org:flLocs.includes(String(loc))?'FL':'OK'};
    }).filter(Boolean);
    if(!sm.length)return null;
    const distTot=sm.reduce((a,s)=>a+s.tot,0);
    if(!distTot)return null;
    const distDig=sm.reduce((a,s)=>a+s.dig,0);
    const distDeliv=sm.reduce((a,s)=>a+s.deliv,0);
    const distMop=sm.reduce((a,s)=>a+s.mop,0);
    const distKiosk=sm.reduce((a,s)=>a+s.kiosk,0);
    const pct=v=>distTot>0?v/distTot:null;
    const mktPct=(locs,field)=>{const ms=sm.filter(s=>locs.includes(String(s.loc)));const t=ms.reduce((a,s)=>a+s.tot,0);const v=ms.reduce((a,s)=>a+s[field],0);return t>0?v/t:null;};
    return{digitalPct:pct(distDig),delivPct:pct(distDeliv),mopPct:pct(distMop),kioskPct:pct(distKiosk),
      digitalSales:distDig,delivSales:distDeliv,mopSales:distMop,kioskSales:distKiosk,totSales:distTot,
      okDigPct:mktPct(okLocs,'dig'),flDigPct:mktPct(flLocs,'dig'),
      okDelivPct:mktPct(okLocs,'deliv'),flDelivPct:mktPct(flLocs,'deliv'),
      okMopPct:mktPct(okLocs,'mop'),flMopPct:mktPct(flLocs,'mop'),
      okKioskPct:mktPct(okLocs,'kiosk'),flKioskPct:mktPct(flLocs,'kiosk'),
      digStoreCount:sm.filter(s=>s.dig>0).length,storeCount:sm.length};
  },[labInRange,okLocs,flLocs,allLocs]);

  // ── No data state ─────────────────────────────────────────────
  const noData=!ds?.loaded||!ds.laborRows?.length;

  // ── RENDER ────────────────────────────────────────────────────
  return div({style:{display:'flex',flexDirection:'column',height:'100%',overflowY:'auto'}},

    // ── WELCOME HEADER ─────────────────────────────────────────
    div({style:{background:'linear-gradient(135deg,#090e18 0%,rgba(10,18,40,.98) 100%)',
      padding:'18px 24px 14px',borderBottom:'1px solid var(--bdr)',flexShrink:0}},

      // Title row
      div({style:{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:8}},
        div(null,
          div({style:{fontSize:'22px',fontWeight:800,color:'var(--amber)',letterSpacing:'-0.5px',lineHeight:1.1}},
            'At a Glance'),
          userName
            ?div({style:{fontSize:'13px',color:'rgba(255,255,255,.8)',marginTop:2,fontWeight:500}},
                greetWord+', '+userName+'!')
            :div({style:{fontSize:'12px',color:'rgba(255,255,255,.5)',marginTop:2}},
                greetWord+'!  ',
                span({style:{fontSize:'10px',color:'rgba(245,158,11,.6)',cursor:'pointer'},
                  onClick:()=>{}/* Settings is a separate nav */,
                  title:'Go to Settings → Your Name to personalize your greeting'},
                  '(Add your name in Settings ✎)')),
        ),
        // Period label — shows the active toolbar date range
        div({style:{fontSize:'10px',padding:'4px 10px',borderRadius:4,
          background:'rgba(255,255,255,.18)',border:'.5px solid rgba(255,255,255,.4)',
          color:'#fff',fontWeight:500,letterSpacing:'.2px',whiteSpace:'nowrap'}},
          dateRange&&dateRange.s?
            dateRange.s.toLocaleDateString('en-US',{month:'short',day:'numeric'})+
            ' – '+dateRange.e.toLocaleDateString('en-US',{month:'short',day:'numeric'}):
            'This Week')
      ),

      // State comment
      div({style:{display:'flex',alignItems:'center',gap:8}},
        div({style:{flex:1,fontSize:'11px',lineHeight:1.5,
          color:commentMode==='ai'&&aiComment?'rgba(255,255,255,.85)':ruleComment.color}},
          commentMode==='rule'?ruleComment.text:
          aiLoading?'Generating...':(aiComment||ruleComment.text)),
        div({style:{display:'flex',gap:4}},
          ['rule','ai'].map(m=>btn({key:m,
            style:{fontSize:'9px',padding:'2px 8px',borderRadius:3,cursor:'pointer',fontWeight:500,
              background:commentMode===m?'rgba(245,158,11,.35)':'rgba(255,255,255,.18)',
              color:commentMode===m?'var(--amber)':'#fff',
              border:commentMode===m?'.5px solid rgba(245,158,11,.6)':'.5px solid rgba(255,255,255,.4)'},
            onClick:()=>{setCommentMode(m);if(m==='ai'&&!aiComment)fetchAIComment();}},
            m==='rule'?'Rule-Based':'AI Narrative'))
        )
      ),

      // Data freshness badge
      div({style:{marginTop:6,fontSize:'9px',color:ageClr}},
        '● Data: '+( latestLab?latestLab.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})+' ('+dataAge+'d ago)':'Not loaded'))
    ),

    // ── ACTION CHECKLIST ───────────────────────────────────────
    allActiveItems.length>0&&div({style:{background:'var(--surf)',borderBottom:'.5px solid var(--bdr)',
      padding:'10px 24px',flexShrink:0}},
      div({style:{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}},
        div({style:{fontSize:'11px',fontWeight:700,color:'var(--amber)'}},
          '📋 Action Checklist ('+allActiveItems.length+' active)'),
        div({style:{display:'flex',gap:6}},
          archivedCl.length>0&&btn({style:{fontSize:'9px',color:'var(--text3)',background:'none',border:'none',cursor:'pointer'},
            onClick:()=>setShowArchive(!showArchive)},
            (showArchive?'Hide':'Show')+' archive ('+archivedCl.length+')'),
          btn({style:{fontSize:'10px',color:'var(--text3)',background:'none',border:'none',cursor:'pointer',
            padding:'2px 6px',borderRadius:3,border:'.5px solid var(--bdr)'},
            onClick:()=>setShowSecCfg(!showSecCfg)},'Sections \u2630')
        )
      ),
      div({style:{display:'flex',flexDirection:'column',gap:4}},
        allActiveItems.map(item=>
          div({key:item.id,style:{display:'flex',alignItems:'flex-start',gap:8,padding:'5px 8px',
            borderRadius:5,background:item.priority==='high'?'rgba(248,113,113,.08)':
              item.priority==='medium'?'rgba(245,158,11,.08)':'rgba(255,255,255,.04)',
            border:'.5px solid '+(item.priority==='high'?'rgba(248,113,113,.2)':
              item.priority==='medium'?'rgba(245,158,11,.2)':'rgba(255,255,255,.08)')}},
            btn({style:{flexShrink:0,width:16,height:16,borderRadius:3,
              border:'.5px solid var(--bdr)',background:'transparent',cursor:'pointer',
              display:'flex',alignItems:'center',justifyContent:'center',marginTop:1},
              onClick:()=>archiveItem(item.id)},''),
            div({style:{flex:1,minWidth:0}},
              div({style:{fontSize:'10px',fontWeight:500,color:'var(--text)'}},item.text),
              item.detail&&div({style:{fontSize:'9px',color:'var(--text3)',marginTop:2,wordBreak:'break-all'}},item.detail)
            ),
            span({style:{fontSize:'8px',color:item.priority==='high'?'#f87171':'#f59e0b',flexShrink:0,marginTop:2}},
              item.priority==='high'?'●':item.priority==='medium'?'◑':'')
          )
        )
      ),
      showArchive&&archivedCl.length>0&&div({style:{marginTop:8,borderTop:'.5px solid var(--bdr)',paddingTop:8}},
        div({style:{fontSize:'9px',fontWeight:700,color:'var(--text3)',marginBottom:4}},'ARCHIVED'),
        archivedCl.map(item=>
          div({key:item.id,style:{display:'flex',alignItems:'center',gap:8,padding:'3px 6px',opacity:.6}},
            div({style:{flex:1,fontSize:'9px',color:'var(--text3)',textDecoration:'line-through'}},item.text),
            btn({style:{fontSize:'9px',color:'var(--amber)',background:'none',border:'none',cursor:'pointer'},
              onClick:()=>restoreItem(item.id)},'Restore'),
            btn({style:{fontSize:'9px',color:'#f87171',background:'none',border:'none',cursor:'pointer'},
              onClick:()=>deleteItem(item.id)},'✕')
          )
        )
      )
    ),

    // ── SECTION CONFIG PANEL ──────────────────────────────────
    showSecCfg&&div({style:{background:'var(--surf2)',borderBottom:'.5px solid var(--bdr)',
      padding:'10px 24px',flexShrink:0}},
      div({style:{fontSize:'11px',fontWeight:700,color:'var(--amber)',marginBottom:8}},'⚙ Configure KPI Sections'),
      div({style:{display:'flex',flexWrap:'wrap',gap:6}},
        secs.map((s,i)=>
          div({key:s.id,style:{display:'flex',alignItems:'center',gap:6,padding:'4px 8px',
            borderRadius:5,background:s.on?'rgba(245,158,11,.12)':'rgba(255,255,255,.04)',
            border:'.5px solid '+(s.on?'rgba(245,158,11,.3)':'var(--bdr)')}},
            btn({style:{fontSize:'9px',background:'none',border:'none',cursor:'pointer',color:'var(--text3)'},
              onClick:()=>moveSec(s.id,-1),disabled:i===0},'↑'),
            btn({style:{fontSize:'9px',background:'none',border:'none',cursor:'pointer',color:'var(--text3)'},
              onClick:()=>moveSec(s.id,1),disabled:i===secs.length-1},'↓'),
            span({style:{fontSize:'12px'}},s.icon),
            span({style:{fontSize:'10px',color:s.on?'var(--amber)':'var(--text3)'}},s.label),
            btn({style:{fontSize:'9px',padding:'1px 6px',borderRadius:3,cursor:'pointer',
              background:s.on?'var(--amber)':'rgba(255,255,255,.08)',
              color:s.on?'var(--navy)':'var(--text3)',border:'none'},
              onClick:()=>toggleSec(s.id)},s.on?'On':'Off')
          )
        )
      )
    ),

    // ── LOADED DATA SUMMARY ────────────────────────────────────
    div({style:{background:'var(--surf)',borderBottom:'.5px solid var(--bdr)',
      padding:'8px 24px',flexShrink:0,display:'flex',alignItems:'center',
      gap:16,flexWrap:'wrap'}},
      div({style:{fontSize:'10px',fontWeight:700,color:'var(--text3)',
        letterSpacing:'.5px',textTransform:'uppercase',flexShrink:0}},'Loaded Data'),
      ...(()=>{
        const sources=[
          {name:'Sales/Labor',rows:ds?.laborRows,icon:'💰'},
          {name:'Service',rows:ds?.opsRows,icon:'⚡'},
          {name:'Controls',rows:ds?.ctrlRows,icon:'🔒'},
          {name:'FOB',rows:ds?.fobRows,icon:'🍟'},
        ];
        return sources.map(src=>{
          const rows=src.rows||[];
          if(!rows.length)return div({key:src.name,style:{fontSize:'9px',
            color:'rgba(255,255,255,.25)',padding:'2px 8px',borderRadius:3,
            background:'rgba(255,255,255,.04)',border:'.5px solid var(--bdr)'}},
            src.icon+' '+src.name+': Not loaded');
          const dates=rows.map(r=>r.date).filter(Boolean);
          const minD=dates.length?new Date(Math.min(...dates)):null;
          const maxD=dates.length?new Date(Math.max(...dates)):null;
          const fmt=d=>d?d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'2-digit'}):'?';
          const uniqueLocs=[...new Set(rows.map(r=>r.loc))].length;
          return div({key:src.name,style:{fontSize:'9px',
            color:'var(--text)',padding:'2px 8px',borderRadius:3,
            background:'rgba(16,185,129,.08)',border:'.5px solid rgba(16,185,129,.2)'}},
            src.icon+' '+src.name+': '+fmt(minD)+' – '+fmt(maxD)+
            ' ('+rows.length.toLocaleString()+' rows, '+uniqueLocs+' stores)');
        });
      })()
    ),
    div({style:{flex:1,overflowY:'auto',padding:'12px 24px'}},

      noData&&div({style:{padding:'24px',textAlign:'center',color:'var(--text3)',fontSize:'12px'}},
        div({style:{fontSize:'24px',marginBottom:8}},'📂'),
        div({style:{fontWeight:600,color:'var(--text)',marginBottom:4}},'No data loaded'),
        div(null,'Upload Operations Report to see your At a Glance dashboard.')
      ),

      !noData&&div({style:{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(380px,1fr))',gap:10}},

        // ── PROJECTIONS SECTION ──
        // ── INTELLIGENCE SUMMARY TILE ──────────────────────────
        secs.find(s=>s.id==='intelligence'&&s.on)&&(()=>{
          const sl=salesSec,lb=laborSec,fb=fobSec,sv=serviceSec,it=intelSec;
          const noData=!sl&&!lb&&!fb&&!sv;
          // Signal row helper
          const sigRow=(icon,label,valStr,subStr,col,statusDot,navFn)=>
            div({key:label,style:{display:'flex',alignItems:'center',gap:8,padding:'6px 12px',
              borderBottom:'.5px solid rgba(255,255,255,.05)',cursor:navFn?'pointer':'default'},
              onClick:navFn||undefined},
              span({style:{fontSize:'14px',width:20,textAlign:'center'}},icon),
              div({style:{flex:1,minWidth:0}},
                div({style:{fontSize:'9px',fontWeight:600,color:'var(--text)',letterSpacing:'.2px'}},''+label),
                div({style:{fontSize:'8px',color:'var(--text3)',marginTop:1,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}},''+subStr)
              ),
              div({style:{textAlign:'right',flexShrink:0}},
                div({style:{fontSize:'13px',fontWeight:800,fontFamily:'var(--mono)',color:col,lineHeight:1}},valStr),
                div({style:{fontSize:'8px',color:statusDot==='🟢'?'#10b981':statusDot==='🟡'?'#f59e0b':statusDot==='🔴'?'#ef4444':'var(--text3)',fontWeight:700,marginTop:1}},
                  statusDot==='🟢'?'▲ On Track':statusDot==='🟡'?'△ Watch':statusDot==='🔴'?'⚠ Attention':'— No Data')
              )
            );

          // Build signals
          const svLY=sl?.salesVsLY;
          const gcVLY=sl?.gcVsLY;
          const labor=lb?.laborPct;
          const fobFC=fb?.pLFoodPct;
          const mape=projSec?.avgMape;
          const oepe=sv?.oepe;
          const park=sv?.park;

          const signals=[
            {icon:'💰',label:'Sales vs Last Year',
             val:svLY!=null?(svLY>=0?'+':'')+(svLY*100).toFixed(1)+'%':'—',
             sub:sl?'$'+(sl.totSales/1000).toFixed(0)+'K total · '+(sl.totGC||0).toLocaleString()+' guests':'Load Operations Report',
             col:svLY==null?'var(--text3)':svLY>=0.01?'#10b981':svLY>=-0.03?'#f59e0b':'#ef4444',
             dot:svLY==null?'—':svLY>=0?'🟢':svLY>=-0.03?'🟡':'🔴',
             nav:()=>onOpenModal&&onOpenModal('ranking:t2w')},
            {icon:'👥',label:'Guest Count vs Last Year',
             val:gcVLY!=null?(gcVLY>=0?'+':'')+(gcVLY*100).toFixed(1)+'%':'—',
             sub:gcVLY!=null?'Check Avg: $'+(sl?.avgChk||0).toFixed(2)+(sl?.avgCheckVsLY!=null?' ('+(sl.avgCheckVsLY>=0?'+':'')+(sl.avgCheckVsLY*100).toFixed(1)+'% vs LY)':''):'No LY guest count data',
             col:gcVLY==null?'var(--text3)':gcVLY>=0?'#10b981':gcVLY>=-0.03?'#f59e0b':'#ef4444',
             dot:gcVLY==null?'—':gcVLY>=0?'🟢':gcVLY>=-0.03?'🟡':'🔴',
             nav:()=>onOpenModal&&onOpenModal('ranking:gc')},
            {icon:'👷',label:'Labor %',
             val:labor!=null?(labor*100).toFixed(1)+'%':'—',
             sub:it&&labor!=null?'Target '+((it.laborTgt||0)*100).toFixed(1)+'% · '+(labor-(it.laborTgt||0)>=0?'+':'')+((labor-(it.laborTgt||0))*100).toFixed(1)+'pts vs target'+(it.laborSt>0?' · ⚠ '+it.laborSt+' loc over':''):'No labor data',
             col:labor==null?'var(--text3)':labor>(it?.laborTgt||0.22)+0.02?'#ef4444':labor>(it?.laborTgt||0.22)?'#f59e0b':'#10b981',
             dot:labor==null?'—':labor>(it?.laborTgt||0.22)+0.02?'🔴':labor>(it?.laborTgt||0.22)?'🟡':'🟢',
             nav:()=>onOpenModal&&onOpenModal('labor-analytics')},
            {icon:'🥗',label:'Total Food Cost %',
             val:fobFC!=null?(fobFC*100).toFixed(1)+'%':'—',
             sub:it&&fobFC!=null?'Target '+((it.fobTgt||0)*100).toFixed(1)+'% · '+(fobFC-(it.fobTgt||0)>=0?'+':'')+((fobFC-(it.fobTgt||0))*100).toFixed(2)+'pts vs target'+(fb?.unexplained>0.001?' · ❓ Unexplained: '+(fb.unexplained*100).toFixed(2)+'%':''):'Load FOB data',
             col:fobFC==null?'var(--text3)':fobFC>(it?.fobTgt||0.279)+0.005?'#ef4444':fobFC>(it?.fobTgt||0.279)?'#f59e0b':'#10b981',
             dot:fobFC==null?'—':fobFC>(it?.fobTgt||0.279)+0.005?'🔴':fobFC>(it?.fobTgt||0.279)?'🟡':'🟢',
             nav:()=>onOpenModal&&onOpenModal('fob-analysis')},
            {icon:'🎯',label:'Forecast Accuracy (MAPE)',
             val:mape!=null?mape.toFixed(1)+'%':'—',
             sub:mape!=null?(projSec.locked||0)+'/'+allLocs.length+' locked · '+(projSec.locked===allLocs.length?'All projections locked':'Locks pending')+'  · Model health: 🟢'+projSec.health.green+' 🟡'+projSec.health.yellow+' 🔴'+projSec.health.red:'Run Dialed-In calibration to compute MAPE',
             col:mape==null?'var(--text3)':mape<5?'#10b981':mape<8?'#f59e0b':'#ef4444',
             dot:mape==null?'—':mape<5?'🟢':mape<8?'🟡':'🔴',
             nav:()=>onOpenModal&&onOpenModal('fcst-accuracy')},
            oepe!=null&&{icon:'⚡',label:'OEPE / Drive-Thru Speed',
             val:Math.round(oepe)+'s',
             sub:it?'Target '+Math.round(it.oepeTgt||140)+'s · DT Parked: '+((park||0)*100).toFixed(1)+'%'+(park>(it.parkTgt||0.12)?' ⚠ Over target':''):'No service data',
             col:oepe<(it?.oepeTgt||140)?'#10b981':oepe<(it?.oepeTgt||140)+15?'#f59e0b':'#ef4444',
             dot:oepe<(it?.oepeTgt||140)?'🟢':oepe<(it?.oepeTgt||140)+15?'🟡':'🔴',
             nav:()=>onOpenModal&&onOpenModal('ranking:oepe')},
          ].filter(Boolean);

          return div({style:{background:'var(--surf)',border:'.5px solid var(--bdr)',borderRadius:8,overflow:'hidden',
            // Gold accent on top border for "command center" visual weight
            boxShadow:'inset 0 1px 0 rgba(245,188,0,.3)'}},
            // Header
            div({style:{display:'flex',alignItems:'center',gap:6,padding:'8px 12px',
              background:'linear-gradient(90deg,var(--surf2) 0%,rgba(245,188,0,.06) 100%)',
              borderBottom:'.5px solid var(--bdr)'}},
              span({style:{fontSize:'14px'}},'🧠'),
              div({style:{flex:1}},
                div({style:{fontSize:'11px',fontWeight:800,color:'var(--gold)',letterSpacing:'-.2px'}},'Intelligence Summary'),
                div({style:{fontSize:'8px',color:'var(--text3)',marginTop:1}},
                  'District morning brief · '+dateRange.label+' · '+(noData?'Load data files to populate':''+allLocs.length+' locations'))
              ),
              noData&&span({style:{fontSize:'9px',color:'var(--text3)',fontStyle:'italic'}},'No data loaded'),
              !noData&&it&&(it.declineSt+it.laborSt+it.mapeSt>0)&&
                div({style:{display:'flex',gap:4}},
                  it.declineSt>0&&span({style:{fontSize:'8px',padding:'2px 6px',borderRadius:3,fontWeight:700,background:'rgba(239,68,68,.12)',color:'#ef4444',border:'.5px solid rgba(239,68,68,.3)'}},it.declineSt+' declining'),
                  it.laborSt>0&&span({style:{fontSize:'8px',padding:'2px 6px',borderRadius:3,fontWeight:700,background:'rgba(245,158,11,.12)',color:'#f59e0b',border:'.5px solid rgba(245,158,11,.3)'}},it.laborSt+' labor ↑'),
                  it.mapeSt>0&&span({style:{fontSize:'8px',padding:'2px 6px',borderRadius:3,fontWeight:700,background:'rgba(139,92,246,.12)',color:'#a78bfa',border:'.5px solid rgba(139,92,246,.3)'}},it.mapeSt+' MAPE ↑')
                )
            ),
            // Signal rows
            div(null,...signals.map(s=>sigRow(s.icon,s.label,s.val,s.sub,s.col,s.dot,s.nav))),
            // Footer — clickable alert chips
            !noData&&it&&it.storeAlerts.length>0&&div({style:{padding:'6px 12px',borderTop:'.5px solid var(--bdr)',
              background:'var(--surf2)',display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}},
              span({style:{fontSize:'8px',color:'var(--text3)',marginRight:2}},'Needs attention:'),
              it.storeAlerts.slice(0,8).map(a=>
                div({key:a.loc,style:{fontSize:'8px',padding:'2px 7px',borderRadius:3,cursor:'pointer',
                  background:'rgba(239,68,68,.08)',border:'.5px solid rgba(239,68,68,.2)',
                  color:'var(--text2)',display:'flex',gap:4,alignItems:'center'},
                  onClick:()=>onOpenStore&&onOpenStore(a.loc),title:'Click to open '+a.loc},
                  span({style:{fontWeight:700,color:'var(--gold)'}},sNameC(a.loc).split(',')[0].trim()),
                  span({style:{color:'var(--text3)'}},'·'),
                  span(null,a.issues.join(', '))
                )
              ),
              it.storeAlerts.length>8&&span({style:{fontSize:'8px',color:'var(--text3)'}},'+'+( it.storeAlerts.length-8)+' more'),
              btn({style:{marginLeft:'auto',fontSize:'8px',padding:'2px 9px',borderRadius:4,
                background:'rgba(245,158,11,.1)',border:'.5px solid rgba(245,158,11,.25)',
                color:'var(--amber)',cursor:'pointer',flexShrink:0},
                onClick:()=>onOpenModal&&onOpenModal('priority-brief')},
                '🎯 Priority Brief →')
            )
          );
        })(),

        // ── PROJECTIONS SECTION ──
        secs.find(s=>s.id==='projections'&&s.on)&&div({style:{background:'var(--surf)',border:'.5px solid var(--bdr)',borderRadius:8,overflow:'hidden'}},
          div({style:{display:'flex',alignItems:'center',gap:6,padding:'8px 12px',background:'var(--surf2)',borderBottom:'.5px solid var(--bdr)',cursor:'pointer'},
            onClick:onOpenProjections},
            span(null,'📈'),
            span({style:{fontSize:'11px',fontWeight:700,color:'var(--text)',flex:1}},'Projections & Forecasting'),
            span({style:{fontSize:'9px',color:'var(--amber)'}},'→')
          ),
          div({style:{padding:'10px 12px',display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}},
            div({style:{textAlign:'center'}},
              div({style:{fontSize:'18px',fontWeight:800,fontFamily:'var(--mono)',
                color:projSec.avgMape!=null?(projSec.avgMape<8?'#10b981':projSec.avgMape<12?'#f59e0b':'#f87171'):'var(--text3)'}},
                projSec.avgMape!=null?projSec.avgMape.toFixed(1)+'%':'—'),
              div({style:{fontSize:'8px',color:'var(--text3)',letterSpacing:'.5px',textTransform:'uppercase'}},'Avg MAPE (6W)')
            ),
            div({style:{textAlign:'center'}},
              div({style:{fontSize:'18px',fontWeight:800,fontFamily:'var(--mono)',
                color:projSec.locked===projSec.total?'#10b981':projSec.locked>projSec.total*.5?'#f59e0b':'#f87171'}},
                projSec.locked+'/'+projSec.total),
              div({style:{fontSize:'8px',color:'var(--text3)',letterSpacing:'.5px',textTransform:'uppercase'}},'Locks Complete')
            ),
            div({style:{textAlign:'center'},
              title:'Model Health: Each store scored 0-100 on 4 factors — Data Freshness (30pts), Calibration Quality (30pts), Recent Accuracy/MAPE (20pts), Sample Size (20pts). Green ≥75 | Yellow 50-74 | Red <50. Hover individual store models for breakdown.'},
              div({style:{display:'flex',justifyContent:'center',gap:4}},
                [['🟢',projSec.health.green,'≥75'],['🟡',projSec.health.yellow,'50-74'],['🔴',projSec.health.red,'<50']].map(([e,n,range])=>
                  span({key:e,style:{fontSize:'10px'},title:e+' = '+n+' stores scoring '+range},e+n)
                )
              ),
              div({style:{fontSize:'8px',color:'var(--text3)',letterSpacing:'.5px',textTransform:'uppercase',marginTop:2}},'Model Health ⓘ')
            )
          ),
          // ── Confidence Interval + Drift row ─────────────────
          ciAndDrift&&(()=>{
            const{ciLow,ciHigh,driftStores}=ciAndDrift;
            if(!ciLow&&!ciHigh) return null;
            return div({style:{padding:'6px 12px 8px',borderTop:'.5px solid var(--bdr)',
              display:'flex',gap:12,alignItems:'center',flexWrap:'wrap'}},
              div({style:{flex:1}},
                div({style:{fontSize:'8px',color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.5px',marginBottom:2}},'Next Week · 90% Confidence'),
                div({style:{fontSize:'11px',fontFamily:'var(--mono)',fontWeight:700,color:'var(--text)'}},
                  '$'+(ciLow/1000).toFixed(0)+'K',span({style:{color:'var(--text3)',fontWeight:400}},' – '),
                  '$'+(ciHigh/1000).toFixed(0)+'K')
              ),
              driftStores.length>0&&div({style:{display:'flex',gap:4,flexWrap:'wrap'}},
                driftStores.slice(0,4).map(({s,d})=>{
                  const col=d.status==='recalibrate'?'#f87171':'#f59e0b';
                  return span({key:s.loc,title:(STORE_NAMES[s.loc]||s.loc)+' — MAPE drift: '+d.mape2w+'% (2wk) vs '+d.mape6w+'% (6wk)',
                    style:{fontSize:'8px',padding:'1px 5px',borderRadius:3,background:col+'22',
                      color:col,border:'.5px solid '+col+'44',fontWeight:600,cursor:'default'}},
                    sNameC(s.loc).split(' ').pop()+' ⚠')})
              )
            );
          })(),
          // ── 6-week sparkline trend ──────────────────────────────
          weeklyTrend.some(w=>w.sales>0)&&div({style:{padding:'8px 12px 10px',borderTop:'.5px solid var(--bdr)'}},
            div({style:{fontSize:'8px',color:'var(--text3)',letterSpacing:'.5px',textTransform:'uppercase',marginBottom:4}},
              '6-Week District Sales Trend'),
            (()=>{
              const maxS=Math.max(...weeklyTrend.map(w=>w.sales).filter(x=>x>0))||1;
              const bw=34,gap=6,tot=weeklyTrend.length;
              const svgW=tot*(bw+gap)-gap, svgH=60;
              return h('svg',{viewBox:'0 0 '+(svgW+4)+' '+svgH,
                style:{width:'100%',height:76,overflow:'visible'}},
                weeklyTrend.map((wk,i)=>{
                  const barH=Math.max(3,Math.round((wk.sales/maxS)*44));
                  const x=i*(bw+gap)+2, y=48-barH;
                  const clr=wk.vsLY==null?'rgba(255,255,255,.25)':wk.vsLY>=0?'#10b981':wk.vsLY>-.05?'#f59e0b':'#f87171';
                  return h('g',{key:i},
                    h('rect',{x,y,width:bw,height:barH,rx:2,fill:clr,fillOpacity:.8}),
                    wk.sales>0&&h('text',{x:x+bw/2,y:y-2,textAnchor:'middle',fontSize:'9',fontWeight:'700',fill:'rgba(255,255,255,.85)'},
                      '$'+(wk.sales/1000).toFixed(0)+'K'),
                    h('text',{x:x+bw/2,y:54,textAnchor:'middle',fontSize:'6',fill:'rgba(255,255,255,.4)'},
                      wk.label||'—'),
                    wk.vsLY!=null&&h('text',{x:x+bw/2,y:58,textAnchor:'middle',fontSize:'8',fontWeight:'600',
                      fill:wk.vsLY>=0?'#10b981':'#f87171'},
                      (wk.vsLY>=0?'+':'')+((wk.vsLY*100).toFixed(1))+'%')
                  );
                })
              );
            })()
          )
        ),

        // ── LOCK DEADLINE COUNTDOWN ──────────────────────────────────────
        (()=>{
          const t=new Date();
          // Weekly deadline: 10 days before next work-week start (next Wed)
          const nextWed=new Date(t);nextWed.setDate(t.getDate()+(3-t.getDay()+7)%7+7);
          const wkLeft=Math.ceil((nextWed-t)/864e5)-10;
          // Monthly deadline: 15th of next month
          const moDeadline=new Date(t.getFullYear(),t.getMonth()+1,15);
          const moLeft=Math.ceil((moDeadline-t)/864e5);
          // Yearly deadline: ~30 days before new year
          const yrDeadline=new Date(t.getFullYear(),11,1); // Dec 1
          const yrLeft=Math.ceil((yrDeadline-t)/864e5);
          const deadlines=[
            {l:'Weekly Lock',days:wkLeft,note:'lock by '+(new Date(nextWed.getTime()-10*864e5)).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})},
            {l:'Monthly Lock',days:moLeft,note:'lock by '+moDeadline.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})},
            yrLeft>0&&yrLeft<60&&{l:'Yearly Lock',days:yrLeft,note:'lock by '+yrDeadline.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})},
          ].filter(Boolean);
          const col=d=>d<=0?'#f87171':d<=3?'#f97316':d<=7?'#f59e0b':'#34d399';
          const label=d=>d<=0?'OVERDUE':d===1?'Tomorrow':d+'d';
          const urgent=deadlines.some(d=>d.days<=3);
          if(!urgent&&deadlines.every(d=>d.days>10)) return null; // hide when all comfortable
          return div({style:{
            background:urgent?'rgba(249,115,22,.06)':'rgba(52,211,153,.04)',
            border:'.5px solid '+(urgent?'rgba(249,115,22,.25)':'rgba(52,211,153,.18)'),
            borderRadius:'var(--r)',padding:'8px 12px',margin:'8px 0',
            display:'flex',gap:12,alignItems:'center',flexWrap:'wrap',cursor:'pointer'},
            onClick:()=>onOpenProjections&&onOpenProjections(),
            title:'Click to open Projection Workflow'},
            span({style:{fontSize:'11px'}},'🔒'),
            div({style:{fontSize:'8px',fontWeight:700,color:'var(--text2)',textTransform:'uppercase',letterSpacing:'.4px',flexShrink:0}},'Lock Deadlines'),
            ...deadlines.map((d,i)=>div({key:i,style:{display:'flex',gap:4,alignItems:'center'}},
              div({style:{fontSize:'8px',color:'var(--text3)'}},(d.l)+':'),
              div({style:{fontSize:'10px',fontWeight:800,fontFamily:'var(--mono)',color:col(d.days)}},(label(d.days))),
              div({style:{fontSize:'7px',color:'var(--text3)',fontStyle:'italic'}},'('+d.note+')')
            )),
            div({style:{marginLeft:'auto',fontSize:'8px',color:urgent?'#f97316':'#34d399',fontStyle:'italic'}},
              urgent?'⚠ Action needed':'→ Open Projections')
          );
        })(),

        // ── SALES SECTION ──
        secs.find(s=>s.id==='sales'&&s.on)&&div({style:{background:'var(--surf)',border:'.5px solid var(--bdr)',borderRadius:8,overflow:'hidden'}},
          div({style:{display:'flex',alignItems:'center',gap:6,padding:'8px 12px',background:'var(--surf2)',borderBottom:'.5px solid var(--bdr)',cursor:'pointer'},
            onClick:()=>onOpenModal&&onOpenModal('ranking')},
            span(null,'💰'),
            span({style:{fontSize:'11px',fontWeight:700,color:'var(--text)',flex:1}},'Sales & Guest Counts'),
            span({style:{fontSize:'9px',color:'var(--amber)'}},'→'),
            salesSec&&salesSec.salesVsLY!=null&&span({style:{fontSize:'10px',fontFamily:'var(--mono)',
              color:(salesSec.salesVsLY*100)>=0?'#10b981':'#f87171'}},
              ((salesSec.salesVsLY*100)>=0?'+':'')+((salesSec.salesVsLY||0)*100).toFixed(1)+'% vs LY')
          ),
          salesSec?div({style:{padding:'10px 12px'}},
            // Top metrics
            div({style:{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:8}},
              div({style:{textAlign:'center'}},
                div({style:{fontSize:'16px',fontWeight:800,fontFamily:'var(--mono)',color:'var(--amber)'}},
                  sFmt(salesSec.totSales)),
                div({style:{fontSize:'8px',color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.5px'}},'Net Sales')
              ),
              div({style:{textAlign:'center'}},
                div({style:{fontSize:'16px',fontWeight:800,fontFamily:'var(--mono)',color:'var(--text)'}},
                  salesSec.totGC>0?Math.round(salesSec.totGC).toLocaleString():'—'),
                div({style:{fontSize:'8px',color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.5px'}},'Guest Count')
              ),
              div({style:{textAlign:'center'}},
                div({style:{fontSize:'16px',fontWeight:800,fontFamily:'var(--mono)',color:'var(--text)'}},
                  salesSec.avgChk>0?('$'+salesSec.avgChk.toFixed(2)):'—'),
                div({style:{fontSize:'8px',color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.5px'}},'Avg Check')
              )
            ),
            // Channel breakdown
            salesSec.channels.some(c=>c.sales>0)&&div({style:{borderTop:'.5px solid var(--bdr)',paddingTop:8}},
              div({style:{fontSize:'9px',fontWeight:600,color:'var(--text3)',marginBottom:4,letterSpacing:'.5px'}},'CHANNEL MIX'),
              div({style:{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:4}},
                salesSec.channels.filter(c=>c.sales>0).map(ch=>
                  div({key:ch.key,style:{textAlign:'center',padding:'4px 2px',borderRadius:4,background:'rgba(255,255,255,.04)'}},
                    div({style:{fontSize:'11px',fontWeight:700,fontFamily:'var(--mono)',color:'var(--text)'}},
                      ch.pct!=null?(ch.pct*100).toFixed(0)+'%':'—'),
                    div({style:{fontSize:'8px',color:'var(--text3)',lineHeight:1.2}},ch.label)
                  )
                )
              )
            )
          ):div({style:{padding:'12px',textAlign:'center',color:'var(--text3)',fontSize:'10px'}},'No sales data for this period')
        ),

        // ── LABOR SECTION ──
        secs.find(s=>s.id==='labor'&&s.on)&&div({style:{background:'var(--surf)',border:'.5px solid var(--bdr)',borderRadius:8,overflow:'hidden'}},
          div({style:{display:'flex',alignItems:'center',gap:6,padding:'8px 12px',background:'var(--surf2)',borderBottom:'.5px solid var(--bdr)',cursor:'pointer'},
            onClick:()=>onOpenModal&&onOpenModal('ranking')},
            span(null,'👥'),
            span({style:{fontSize:'11px',fontWeight:700,color:'var(--text)',flex:1}},'Labor'),
            span({style:{fontSize:'9px',color:'var(--amber)'}},'→')
          ),
          laborSec?div({style:{padding:'10px 12px'}},
            div({style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}},
              div({style:{textAlign:'center'}},
                div({style:{fontSize:'18px',fontWeight:800,fontFamily:'var(--mono)',
                  color:laborSec.laborPct!=null?(laborSec.laborPct<.28?'#10b981':laborSec.laborPct<.32?'#f59e0b':'#f87171'):'var(--text3)'}},
                  laborSec.laborPct!=null?((laborSec.laborPct||0)*100).toFixed(1)+'%':'—'),
                div({style:{fontSize:'8px',color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.5px'}},'Labor %'),
                MktBadge({ok:laborSec.okLaborAvg,fl:laborSec.flLaborAvg,fmt:v=>((v||0)*100).toFixed(1)+'%'})
              ),
              div({style:{textAlign:'center'}},
                div({style:{fontSize:'18px',fontWeight:800,fontFamily:'var(--mono)',color:'var(--text)'}},
                  laborSec.tpph!=null?laborSec.tpph.toFixed(1):'—'),
                div({style:{fontSize:'8px',color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.5px'}},'TPPH'),
                MktBadge({ok:laborSec.okTpphAvg,fl:laborSec.flTpphAvg,fmt:v=>(v||0).toFixed(1)})
              )
            ),
            div({style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}},
              div({style:{textAlign:'center',padding:'6px',borderRadius:5,
                background:laborSec.avn!=null?(laborSec.avn>=-2?'rgba(16,185,129,.08)':'rgba(248,113,113,.08)'):'rgba(255,255,255,.04)'}},
                div({style:{fontSize:'14px',fontWeight:700,fontFamily:'var(--mono)',
                  color:laborSec.avn!=null?(laborSec.avn>=-2?'#10b981':'#f87171'):'var(--text3)'}},
                  laborSec.avn!=null?(laborSec.avn>0?'+':'')+laborSec.avn.toFixed(1):'—'),
                div({style:{fontSize:'8px',color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.5px'}},'Avg Act vs Need')
              ),
              div({style:{textAlign:'center',padding:'6px',borderRadius:5,
                background:laborSec.otHrs>0?'rgba(248,113,113,.08)':'rgba(16,185,129,.08)'}},
                div({style:{fontSize:'14px',fontWeight:700,fontFamily:'var(--mono)',
                  color:laborSec.otHrs>0?'#f87171':'#10b981'}},
                  laborSec.otHrs.toFixed(1)+'h'),
                div({style:{fontSize:'8px',color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.5px'}},'OT Hours')
              )
            )
          ):div({style:{padding:'12px',textAlign:'center',color:'var(--text3)',fontSize:'10px'}},'No labor data for this period')
        ),

        // ── SERVICE SECTION ──
        secs.find(s=>s.id==='service'&&s.on)&&div({style:{background:'var(--surf)',border:'.5px solid var(--bdr)',borderRadius:8,overflow:'hidden'}},
          div({style:{display:'flex',alignItems:'center',gap:6,padding:'8px 12px',background:'var(--surf2)',borderBottom:'.5px solid var(--bdr)',cursor:'pointer'},
            onClick:()=>onOpenModal&&onOpenModal('ranking')},
            span(null,'⚡'),
            span({style:{fontSize:'11px',fontWeight:700,color:'var(--text)',flex:1}},'Service'),
            span({style:{fontSize:'9px',color:'var(--amber)'}},'→')
          ),
          serviceSec?div({style:{padding:'10px 12px'}},
            [
              {label:'OEPE W/O Parked',val:serviceSec.oepe,ok:serviceSec.okOepe,fl:serviceSec.flOepe,fmt:v=>Math.round(v)+'s',goodDir:'low',tgt:160},
              {label:'DT Parked %',val:serviceSec.park,ok:serviceSec.okPark,fl:serviceSec.flPark,fmt:v=>((v||0)*100).toFixed(1)+'%',goodDir:'low',tgt:.10},
              {label:'KVS Time Per GC',val:serviceSec.kvst,ok:serviceSec.okKvst,fl:serviceSec.flKvst,fmt:v=>Math.round(v)+'s',goodDir:'low',tgt:55},
              {label:'KVS Healthy Usage',val:serviceSec.kvsu,ok:serviceSec.okKvsu,fl:serviceSec.flKvsu,fmt:v=>((v||0)*100).toFixed(1)+'%',goodDir:'high',tgt:.90},
              {label:'R2P',val:serviceSec.r2p,ok:serviceSec.okR2p,fl:serviceSec.flR2p,fmt:v=>Math.round(v)+'s',goodDir:'low',tgt:90},
            ].map((row,i)=>{
              const clr=row.tgt!=null&&row.val!=null?(row.goodDir==='low'?row.val<=row.tgt:row.val>=row.tgt)?'#10b981':'#f87171':'var(--text)';
              return div({key:i,style:{display:'flex',alignItems:'center',gap:8,padding:'4px 0',
                borderBottom:i<4?'.5px solid rgba(255,255,255,.04)':'none'}},
                div({style:{fontSize:'9px',color:'var(--text3)',width:130,flexShrink:0}},row.label),
                div({style:{fontSize:'11px',fontFamily:'var(--mono)',fontWeight:600,color:clr,width:48}},
                  row.val!=null?row.fmt(row.val):'—'),
                div({style:{flex:1}},MktBadge({ok:row.ok,fl:row.fl,fmt:row.fmt}))
              );
            })
          ):div({style:{padding:'12px',textAlign:'center',color:'var(--text3)',fontSize:'10px'}},'No service data for this period')
        ),

        // ── CONTROLS SECTION ──
        secs.find(s=>s.id==='controls'&&s.on)&&div({style:{background:'var(--surf)',border:'.5px solid var(--bdr)',borderRadius:8,overflow:'hidden'}},
          div({style:{display:'flex',alignItems:'center',gap:6,padding:'8px 12px',background:'var(--surf2)',borderBottom:'.5px solid var(--bdr)',cursor:'pointer'},
            onClick:()=>onNav&&onNav('district')},
            span(null,'🔒'),
            span({style:{fontSize:'11px',fontWeight:700,color:'var(--text)',flex:1}},'Controls & Integrity'),
            span({style:{fontSize:'9px',color:'var(--amber)'}},'→')
          ),
          ctrlSec?div({style:{padding:'10px 12px'}},
            // ── Labor sub-section ─────────────────────────────────────
            laborSec&&div({style:{marginBottom:10,paddingBottom:8,borderBottom:'.5px solid var(--bdr)'}},
              div({style:{fontSize:'8px',fontWeight:700,color:'var(--text3)',letterSpacing:'.5px',
                textTransform:'uppercase',marginBottom:5}},'Labor Metrics'),
              div({style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:4}},
                [
                  {lbl:'Labor %',v:laborSec.laborPct,ok:laborSec.okLaborAvg,fl:laborSec.flLaborAvg,
                   fmt:v=>((v||0)*100).toFixed(1)+'%',clr:(laborSec.laborPct||0)<.22?'#10b981':(laborSec.laborPct||0)<.26?'#f59e0b':'#f87171'},
                  {lbl:'TPPH',v:laborSec.tpph,ok:laborSec.okTpphAvg,fl:laborSec.flTpphAvg,
                   fmt:v=>(v||0).toFixed(1),clr:(laborSec.tpph||0)>=5?'#10b981':(laborSec.tpph||0)>=4?'#f59e0b':'#f87171'},
                  {lbl:'Act vs Need',v:laborSec.avn,ok:null,fl:null,
                   fmt:v=>(v>=0?'+':'')+((v||0).toFixed(1)),
                   clr:(laborSec.avn||0)>=0?'rgba(255,255,255,.8)':'#f87171'},
                  {lbl:'OT Hours',v:laborSec.otHrs,ok:null,fl:null,
                   fmt:v=>(v||0).toFixed(1)+'h',
                   clr:(laborSec.otHrs||0)<20?'#10b981':(laborSec.otHrs||0)<50?'#f59e0b':'#f87171'},
                ].map((r,i)=>div({key:'lm'+i,style:{padding:'4px 5px',borderRadius:3,background:'rgba(255,255,255,.03)'}},
                  div({style:{display:'flex',justifyContent:'space-between',alignItems:'baseline'}},
                    span({style:{fontSize:'8px',color:'var(--text3)'}},r.lbl),
                    span({style:{fontSize:'10px',fontFamily:'var(--mono)',fontWeight:700,color:r.clr}},
                      r.v!=null?r.fmt(r.v):'--')),
                  (r.ok!=null||r.fl!=null)&&div({style:{marginTop:1}},MktBadge({ok:r.ok,fl:r.fl,fmt:r.fmt}))))
              )
            ),
            // ── Integrity metrics ──────────────────────────────────────
            div({style:{fontSize:'8px',fontWeight:700,color:'var(--text3)',letterSpacing:'.5px',
              textTransform:'uppercase',marginBottom:5}},'Integrity Metrics'),
            [
              {label:'T-Red After %',val:ctrlSec.tRedAPct,ok:ctrlSec.okTRedAPct,fl:ctrlSec.flTRedAPct,fmt:v=>((v||0)*100).toFixed(2)+'%',goodDir:'low'},
              {label:'T-Red After Count',val:ctrlSec.tRedACnt,ok:null,fl:null,fmt:v=>Math.round(v)+'',goodDir:'low'},
              {label:'T-Red Before %',val:ctrlSec.tRedBPct,ok:ctrlSec.okTRedBPct,fl:ctrlSec.flTRedBPct,fmt:v=>((v||0)*100).toFixed(2)+'%',goodDir:'low'},
              {label:'Promo/Disc %',val:ctrlSec.promoPct,ok:ctrlSec.okPromoPct,fl:ctrlSec.flPromoPct,fmt:v=>((v||0)*100).toFixed(2)+'%',goodDir:'low'},
              {label:'Cash O/S %',val:ctrlSec.cashOSPct,ok:ctrlSec.okCashOSPct,fl:ctrlSec.flCashOSPct,fmt:v=>((v||0)*100).toFixed(3)+'%',goodDir:'low'},
              {label:'Cash Refunds',val:ctrlSec.cashRefCnt,ok:null,fl:null,fmt:v=>Math.round(v)+'',goodDir:'low'},
              {label:'POS Overrings',val:ctrlSec.overringCnt,ok:null,fl:null,fmt:v=>Math.round(v)+'',goodDir:'low'},
              {label:'OT Hours',val:ctrlSec.otHrs,ok:null,fl:null,fmt:v=>(v||0).toFixed(1)+'h',goodDir:'low'},
            ].map((row,i)=>
              div({key:i,style:{display:'flex',alignItems:'center',gap:8,padding:'3px 0',
                borderBottom:i<7?'.5px solid rgba(255,255,255,.04)':'none'}},
                div({style:{fontSize:'9px',color:'var(--text3)',width:130,flexShrink:0}},row.label),
                div({style:{fontSize:'10px',fontFamily:'var(--mono)',fontWeight:600,color:'var(--text)',width:64}},
                  row.val!=null?row.fmt(row.val):'—'),
                div({style:{flex:1}},MktBadge({ok:row.ok,fl:row.fl,fmt:row.fmt}))
              )
            )
          ):div({style:{padding:'12px',textAlign:'center',color:'var(--text3)',fontSize:'10px'}},'No controls data — upload Operations Report')
        ),

        // ── FOB SECTION ──
        secs.find(s=>s.id==='fob'&&s.on)&&div({style:{background:'var(--surf)',border:'.5px solid var(--bdr)',borderRadius:8,overflow:'hidden'}},
          div({style:{display:'flex',alignItems:'center',gap:6,padding:'8px 12px',background:'var(--surf2)',borderBottom:'.5px solid var(--bdr)',cursor:'pointer'},
            onClick:()=>onOpenBrief&&onOpenBrief()},
            span(null,'🍟'),
            span({style:{fontSize:'11px',fontWeight:700,color:'var(--text)',flex:1}},'FOB & Food Cost'),
            span({style:{fontSize:'9px',color:'var(--amber)'}},'→')
          ),
          fobSec?div({style:{padding:'10px 12px'}},
            // Big FOB%, Food Cost%, Base Food%
            div({style:{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:6,marginBottom:8}},
              div({style:{textAlign:'center',padding:'8px',borderRadius:5,
                background:fobSec.fobPct!=null?(fobSec.fobPct<.035?'rgba(16,185,129,.08)':fobSec.fobPct<.055?'rgba(245,158,11,.08)':'rgba(248,113,113,.08)'):'rgba(255,255,255,.04)'}},
                div({style:{fontSize:'16px',fontWeight:800,fontFamily:'var(--mono)',
                  color:fobSec.fobPct!=null?(fobSec.fobPct<.035?'#10b981':fobSec.fobPct<.055?'#f59e0b':'#f87171'):'var(--text3)'}},
                  fobSec.fobPct!=null?((fobSec.fobPct||0)*100).toFixed(2)+'%':'—'),
                div({style:{fontSize:'8px',color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.5px'}},'FOB %'),
                MktBadge({ok:fobSec.okFobPct,fl:fobSec.flFobPct,fmt:v=>((v||0)*100).toFixed(2)+'%'})
              ),
              div({style:{textAlign:'center',padding:'8px',borderRadius:5,background:'rgba(255,255,255,.04)'}},
                div({style:{fontSize:'16px',fontWeight:800,fontFamily:'var(--mono)',color:'var(--text)'}},
                  fobSec.pLFoodPct!=null?((fobSec.pLFoodPct||0)*100).toFixed(1)+'%':'—'),
                div({style:{fontSize:'8px',color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.5px'}},'P&L Food Cost %'),
                MktBadge({ok:fobSec.okPLFoodPct,fl:fobSec.flPLFoodPct,fmt:v=>((v||0)*100).toFixed(1)+'%'})
              ),
              div({style:{textAlign:'center',padding:'8px',borderRadius:5,background:'rgba(255,255,255,.04)'}},
                div({style:{fontSize:'16px',fontWeight:800,fontFamily:'var(--mono)',color:'var(--text)'}},
                  fobSec.baseFoodPct!=null?((fobSec.baseFoodPct||0)*100).toFixed(1)+'%':'—'),
                div({style:{fontSize:'8px',color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.5px'}},'Base Food %'),
                MktBadge({ok:fobSec.okBaseFoodPct,fl:fobSec.flBaseFoodPct,fmt:v=>((v||0)*100).toFixed(1)+'%'})
              )
            ),
            // Waste components
            div({style:{borderTop:'.5px solid var(--bdr)',paddingTop:8}},
              div({style:{fontSize:'9px',fontWeight:600,color:'var(--text3)',marginBottom:4,letterSpacing:'.5px'}},'FOB COMPONENTS'),
              div({style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:3}},
                [
                  {l:'Unexplained',v:fobSec.unexplained,ok:fobSec.okUnexp,fl:fobSec.flUnexp,alert:(fobSec.unexplained||0)>.003},
                  {l:'Comp Waste',v:fobSec.compWaste,ok:fobSec.okCompWaste,fl:fobSec.flCompWaste},
                  {l:'Raw Waste',v:fobSec.rawWaste,ok:fobSec.okRawWaste,fl:fobSec.flRawWaste},
                  {l:'Condiment',v:fobSec.condiment,ok:fobSec.okCondiment,fl:fobSec.flCondiment},
                  {l:'Emp Meal',v:fobSec.empMeal,ok:fobSec.okEmpMeal,fl:fobSec.flEmpMeal},
                  {l:'Stat Var',v:fobSec.statVar,ok:fobSec.okStatVar,fl:fobSec.flStatVar},
                ].map((item,i)=>
                  div({key:i,style:{display:'flex',flexDirection:'column',
                    padding:'2px 5px',borderRadius:3,
                    background:item.alert?'rgba(248,113,113,.08)':'rgba(255,255,255,.02)'}},
                    div({style:{display:'flex',justifyContent:'space-between',alignItems:'center'}},
                      span({style:{fontSize:'8px',color:'var(--text3)'}},item.l),
                      span({style:{fontSize:'9px',fontFamily:'var(--mono)',fontWeight:600,
                        color:item.alert?'#f87171':'var(--text)'}},
                        item.v!=null?((item.v||0)*100).toFixed(2)+'%':'—')
                    ),
                    (item.ok!=null||item.fl!=null)&&div({style:{marginTop:1}},
                      MktBadge({ok:item.ok,fl:item.fl,fmt:v=>((v||0)*100).toFixed(2)+'%'}))
                  )
                )
              ),
              // Disc/Coupon — tracked but not included in FOB calculation
              div({style:{marginTop:4,paddingTop:4,borderTop:'.5px dashed rgba(255,255,255,.1)'}},
                div({style:{display:'flex',flexDirection:'column',
                  padding:'2px 5px',borderRadius:3,background:'rgba(255,255,255,.02)'}},
                  div({style:{display:'flex',justifyContent:'space-between',alignItems:'center'}},
                    span({style:{fontSize:'8px',color:'var(--text)',fontWeight:600}},
                      'Disc/Coupon ',
                      span({style:{fontSize:'7px',color:'var(--amber)',fontWeight:600},
                        title:'Disc/Coupon is tracked for awareness but is NOT included in the FOB calculation.'},'*')),
                    span({style:{fontSize:'9px',fontFamily:'var(--mono)',fontWeight:600,color:'rgba(255,255,255,.5)'}},
                      fobSec.discCoupon!=null?((fobSec.discCoupon||0)*100).toFixed(2)+'%':'—')
                  ),
                  (fobSec.okDiscCoupon!=null||fobSec.flDiscCoupon!=null)&&div({style:{marginTop:1}},
                    MktBadge({ok:fobSec.okDiscCoupon,fl:fobSec.flDiscCoupon,fmt:v=>((v||0)*100).toFixed(2)+'%'})),
                  div({style:{fontSize:'7px',color:'rgba(255,255,255,.3)',marginTop:2}},
                    '* Not included in FOB calculation — monitored for trend only')
                )
              )
            )
          ):div({style:{padding:'12px',textAlign:'center',color:'var(--text3)',fontSize:'10px'}},'No FOB data — upload Operations Report with FOB sheet')
        ),

        // ── DIGITAL SALES SECTION ──────────────────────────────────
        secs.find(s=>s.id==='digital'&&s.on)&&div({style:{background:'var(--surf)',border:'.5px solid var(--bdr)',borderRadius:8,overflow:'hidden'}},
          div({style:{display:'flex',alignItems:'center',gap:6,padding:'8px 12px',background:'var(--surf2)',borderBottom:'.5px solid var(--bdr)',cursor:'pointer'},
            onClick:()=>onOpenModal&&onOpenModal('ranking')},
            span(null,'\uD83D\uDCF1'),
            span({style:{fontSize:'11px',fontWeight:700,color:'var(--text)',flex:1}},'Digital Sales'),
            digitalSec&&span({style:{fontSize:'9px',color:'#60a5fa',fontWeight:600}},
              'McDelivery + MOP + Kiosk'),
            span({style:{fontSize:'9px',color:'var(--amber)'}},' \u2192')
          ),
          digitalSec?div({style:{padding:'10px 12px'}},
            // ── Hero metric: Digital Mix ──────────────────────────────
            div({style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:10}},
              div({style:{textAlign:'center',padding:'8px',borderRadius:6,
                background:'rgba(96,165,250,.1)',border:'.5px solid rgba(96,165,250,.2)'}},
                div({style:{fontSize:'22px',fontWeight:900,fontFamily:'var(--mono)',color:'#60a5fa'}},
                  digitalSec.digitalPct!=null?((digitalSec.digitalPct||0)*100).toFixed(1)+'%':'--'),
                div({style:{fontSize:'8px',color:'rgba(96,165,250,.7)',letterSpacing:'.5px',
                  textTransform:'uppercase',marginTop:2}},'Digital Mix'),
                MktBadge({ok:digitalSec.okDigPct,fl:digitalSec.flDigPct,fmt:v=>((v||0)*100).toFixed(1)+'%'})
              ),
              div({style:{textAlign:'center',padding:'8px',borderRadius:6,background:'rgba(255,255,255,.04)'}},
                div({style:{fontSize:'18px',fontWeight:800,fontFamily:'var(--mono)',color:'var(--text)'}},
                  digitalSec.digitalSales>0?f$(Math.round(digitalSec.digitalSales)):'--'),
                div({style:{fontSize:'8px',color:'var(--text3)',letterSpacing:'.5px',
                  textTransform:'uppercase',marginTop:2}},'Digital Revenue'),
                div({style:{fontSize:'8px',color:'var(--text3)',marginTop:2}},
                  'of '+f$(Math.round(digitalSec.totSales))+' total'),
                div({style:{fontSize:'8px',color:'rgba(96,165,250,.6)',marginTop:2}},
                  digitalSec.digStoreCount+'/'+digitalSec.storeCount+' stores reporting digital')
              )
            ),
            // ── Digital Mix Bar ───────────────────────────────────────
            div({style:{marginBottom:10}},
              div({style:{display:'flex',justifyContent:'space-between',fontSize:'8px',
                color:'var(--text3)',marginBottom:3}},
                span(null,'Digital'),span(null,'Traditional')),
              div({style:{background:'rgba(255,255,255,.06)',borderRadius:4,height:12,overflow:'hidden',
                display:'flex'}},
                div({style:{width:((digitalSec.digitalPct||0)*100).toFixed(1)+'%',
                  background:'linear-gradient(90deg,#60a5fa,#818cf8)',height:'100%',
                  borderRadius:'4px 0 0 4px',transition:'width .8s ease',
                  display:'flex',alignItems:'center',justifyContent:'center',
                  fontSize:'7px',color:'#fff',fontWeight:700,overflow:'hidden'}},
                  ((digitalSec.digitalPct||0)*100)>8?((digitalSec.digitalPct||0)*100).toFixed(1)+'%':''),
                div({style:{flex:1,display:'flex',alignItems:'center',justifyContent:'center',
                  fontSize:'7px',color:'rgba(255,255,255,.4)'}},
                  (((1-(digitalSec.digitalPct||0))*100).toFixed(1))+'%')
              )
            ),
            // ── Channel breakdown ─────────────────────────────────────
            div({style:{fontSize:'8px',fontWeight:700,color:'var(--text3)',letterSpacing:'.5px',
              textTransform:'uppercase',marginBottom:5}},'Digital Channels'),
            div({style:{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:5,marginBottom:8}},
              [
                {icon:'\uD83D\uDE9A',label:'McDelivery',pct:digitalSec.delivPct,ok:digitalSec.okDelivPct,fl:digitalSec.flDelivPct,clr:'#f59e0b'},
                {icon:'\uD83D\uDCF2',label:'MOP',pct:digitalSec.mopPct,ok:digitalSec.okMopPct,fl:digitalSec.flMopPct,clr:'#34d399'},
                {icon:'\u2328\uFE0F',label:'Kiosk',pct:digitalSec.kioskPct,ok:digitalSec.okKioskPct,fl:digitalSec.flKioskPct,clr:'#a78bfa'},
              ].map((ch,i)=>div({key:'ch'+i,style:{padding:'6px',borderRadius:5,textAlign:'center',
                background:'rgba(255,255,255,.03)',border:'.5px solid rgba(255,255,255,.07)'}},
                div({style:{fontSize:'10px',marginBottom:2}},ch.icon),
                div({style:{fontSize:'12px',fontWeight:800,fontFamily:'var(--mono)',color:ch.clr}},
                  ch.pct!=null?((ch.pct||0)*100).toFixed(1)+'%':'--'),
                div({style:{fontSize:'7px',color:'var(--text3)',marginBottom:3}},ch.label),
                MktBadge({ok:ch.ok,fl:ch.fl,fmt:v=>((v||0)*100).toFixed(1)+'%'})
              ))
            ),
            // ── Strategy note ──────────────────────────────────────────
            div({style:{padding:'5px 8px',borderRadius:4,background:'rgba(96,165,250,.05)',
              border:'.5px solid rgba(96,165,250,.15)'}},
              div({style:{fontSize:'8px',color:'rgba(96,165,250,.7)',lineHeight:1.5}},
                '\uD83D\uDCA1 McDonald\'s digital strategy targets 40%+ digital mix system-wide. '+
                'MOP & Kiosk drive higher avg check. McDelivery expands trade area beyond 3-mile radius.')
            )
          ):div({style:{padding:'12px',textAlign:'center',color:'var(--text3)',fontSize:'10px'}},
            'No channel data — upload Operations Report with Sales sheet')
        ),

        // ── DISTRICT PULSE RADAR ──
        secs.find(s=>s.id==='radar'&&s.on)&&(()=>{
          // Scores: 0-1 where 1.0 = at or better than target, 0 = significantly below
          const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v||0));
          const METRICS=[
            {label:'Sales vs LY',short:'Sales',icon:'💰',angle:270,
              score:salesSec?.salesVsLY!=null?clamp(0.5+(salesSec.salesVsLY*10),0,1):0.5,
              display:salesSec?.salesVsLY!=null?((salesSec.salesVsLY*100)>=0?'+':'')+((salesSec.salesVsLY||0)*100).toFixed(1)+'%':'—',
              hint:'Target: flat or better vs last year'},
            {label:'Service',short:'OEPE',icon:'⚡',angle:342,
              score:serviceSec?.oepe?clamp(150/serviceSec.oepe,0,1):0.5,
              display:serviceSec?.oepe?Math.round(serviceSec.oepe)+'s':'—',
              hint:'Target: ≤150s OEPE'},
            {label:'Labor',short:'Labor%',icon:'👥',angle:54,
              score:laborSec?.laborPct?clamp(0.22/Math.max(0.01,laborSec.laborPct),0,1):0.5,
              display:laborSec?.laborPct?((laborSec.laborPct||0)*100).toFixed(1)+'%':'—',
              hint:'Target: ≤22% labor'},
            {label:'T-Reds',short:'T-Red',icon:'🔒',angle:126,
              score:ctrlSec?.tRedAPct?clamp(0.003/Math.max(0.001,ctrlSec.tRedAPct),0,1):0.5,
              display:ctrlSec?.tRedAPct?((ctrlSec.tRedAPct||0)*100).toFixed(2)+'%':'—',
              hint:'Target: ≤0.30% T-Red After'},
            {label:'FOB',short:'FOB%',icon:'🍟',angle:198,
              score:fobSec?.fobPct?clamp(0.04/Math.max(0.005,fobSec.fobPct),0,1):0.5,
              display:fobSec?.fobPct?((fobSec.fobPct||0)*100).toFixed(1)+'%':'—',
              hint:'Target: ≤4.0% FOB'},
          ];
          const overallScore=Math.round(METRICS.reduce((a,m)=>a+m.score,0)/METRICS.length*100);
          const scoreClr=overallScore>=75?'#10b981':overallScore>=50?'#f59e0b':'#f87171';
          const scoreBg=overallScore>=75?'rgba(16,185,129,.12)':overallScore>=50?'rgba(245,158,11,.12)':'rgba(248,113,113,.12)';
          const cx=100,cy=100,maxR=68;
          const RAD=d=>d*Math.PI/180;
          const pt=(a,r)=>[cx+r*Math.cos(RAD(a)),cy+r*Math.sin(RAD(a))];
          const gPoly=r=>METRICS.map(m=>pt(m.angle,r)).map(([x,y])=>x.toFixed(1)+','+y.toFixed(1)).join(' ');
          const dataPoly=METRICS.map(m=>pt(m.angle,maxR*m.score)).map(([x,y])=>x.toFixed(1)+','+y.toFixed(1)).join(' ');
          return div({style:{background:'var(--surf)',border:'.5px solid var(--bdr)',borderRadius:8,overflow:'hidden'}},
            div({style:{display:'flex',alignItems:'center',gap:6,padding:'8px 12px',background:'var(--surf2)',borderBottom:'.5px solid var(--bdr)'}},
              span(null,'🎯'),
              span({style:{fontSize:'11px',fontWeight:700,color:'var(--text)',flex:1}},'District Pulse'),
              span({style:{fontSize:'9px',color:'var(--text3)',marginRight:4}},'Performance vs Targets'),
            ),
            div({style:{padding:'12px',display:'flex',gap:12,alignItems:'center',flexWrap:'wrap'}},
              // SVG Radar
              div({style:{flex:'0 0 auto',position:'relative'}},
                h('svg',{viewBox:'0 0 200 200',style:{width:180,height:180}},
                  // Background pentagons
                  ...[1,.67,.33].map((pct,gi)=>
                    h('polygon',{key:'g'+gi,points:gPoly(maxR*pct),
                      fill:'none',stroke:'rgba(255,255,255,.08)',strokeWidth:.5})
                  ),
                  // Axis spokes
                  ...METRICS.map((m,i)=>{
                    const [ax,ay]=pt(m.angle,maxR);
                    return h('line',{key:'sp'+i,x1:100,y1:100,x2:ax.toFixed(1),y2:ay.toFixed(1),
                      stroke:'rgba(255,255,255,.12)',strokeWidth:.5});
                  }),
                  // Data fill polygon
                  h('polygon',{points:dataPoly,
                    fill:scoreClr+'33',stroke:scoreClr,strokeWidth:1.5,strokeLinejoin:'round'}),
                  // Target ring (outer pentagon)
                  h('polygon',{points:gPoly(maxR),fill:'none',stroke:scoreClr,strokeWidth:.5,strokeDasharray:'2,2',opacity:.4}),
                  // Vertex dots on data polygon
                  ...METRICS.map((m,i)=>{
                    const [dx,dy]=pt(m.angle,maxR*m.score);
                    return h('circle',{key:'dot'+i,cx:dx.toFixed(1),cy:dy.toFixed(1),r:3,
                      fill:scoreClr,stroke:'var(--surf)',strokeWidth:1});
                  }),
                  // Axis labels
                  ...METRICS.map((m,i)=>{
                    const [lx,ly]=pt(m.angle,maxR*1.32);
                    const ta=lx<cx-4?'end':lx>cx+4?'start':'middle';
                    return h('g',{key:'lab'+i},
                      h('text',{x:lx.toFixed(1),y:(ly-3).toFixed(1),textAnchor:ta,fontSize:6.5,
                        fill:'rgba(255,255,255,.6)',fontWeight:'600'},m.short),
                      h('text',{x:lx.toFixed(1),y:(ly+5).toFixed(1),textAnchor:ta,fontSize:5.5,
                        fill:scoreClr,fontFamily:'monospace'},m.display)
                    );
                  }),
                  // Center score
                  h('circle',{cx:100,cy:100,r:16,fill:scoreBg,stroke:scoreClr,strokeWidth:.5}),
                  h('text',{x:100,y:98,textAnchor:'middle',dominantBaseline:'middle',
                    fontSize:13,fontWeight:700,fill:scoreClr,fontFamily:'monospace'},overallScore),
                  h('text',{x:100,y:111,textAnchor:'middle',fontSize:4.5,fill:'rgba(255,255,255,.35)'},'SCORE')
                )
              ),
              // Metric legend
              div({style:{flex:1,minWidth:0}},
                div({style:{fontSize:'9px',color:'var(--text3)',fontWeight:700,letterSpacing:'.5px',
                  textTransform:'uppercase',marginBottom:6}},'Metric Breakdown'),
                ...METRICS.map((m,i)=>{
                  const pct=Math.round(m.score*100);
                  const barClr=pct>=75?'#10b981':pct>=50?'#f59e0b':'#f87171';
                  return div({key:'leg'+i,style:{marginBottom:5}},
                    div({style:{display:'flex',justifyContent:'space-between',marginBottom:2}},
                      span({style:{fontSize:'8px',color:'var(--text)',fontWeight:500}},m.icon+' '+m.label),
                      span({style:{fontSize:'8px',fontFamily:'monospace',color:barClr,fontWeight:700}},m.display)
                    ),
                    div({style:{background:'rgba(255,255,255,.06)',borderRadius:2,height:4,overflow:'hidden'}},
                      div({style:{width:pct+'%',height:'100%',background:barClr,
                        borderRadius:2,transition:'width .6s ease'}})
                    ),
                    div({style:{fontSize:'6px',color:'rgba(255,255,255,.25)',marginTop:1}},m.hint)
                  );
                }),
                div({style:{marginTop:8,paddingTop:6,borderTop:'.5px solid var(--bdr)',
                  display:'flex',justifyContent:'space-between',alignItems:'center'}},
                  div({style:{fontSize:'8px',color:'var(--text3)'}},'Overall District Health'),
                  div({style:{fontSize:'13px',fontWeight:800,fontFamily:'monospace',color:scoreClr}},overallScore+'/100')
                )
              )
            )
          );
        })(),
        // ── STORE LEADERBOARD ──
        secs.find(s=>s.id==='leaderboard'&&s.on)&&div({style:{background:'var(--surf)',border:'.5px solid var(--bdr)',borderRadius:8,overflow:'hidden'}},
          div({style:{display:'flex',alignItems:'center',gap:6,padding:'8px 12px',background:'var(--surf2)',borderBottom:'.5px solid var(--bdr)',cursor:'pointer'},
            onClick:()=>onOpenModal&&onOpenModal('ranking')},
            span(null,'🏆'),
            span({style:{fontSize:'11px',fontWeight:700,color:'var(--text)',flex:1}},'Store Leaderboard'),
            span({style:{fontSize:'9px',color:'var(--amber)'}},'→')
          ),
          div({style:{padding:'8px 12px'}},
            // Metric tabs
            div({style:{display:'flex',gap:3,marginBottom:8,flexWrap:'wrap'}},
              [['sales','💰 Sales'],['oepe','⚡ OEPE'],['labor','👥 Labor%'],['tred','🔒 T-Reds']].map(([k,l])=>
                btn({key:k,style:{fontSize:'9px',padding:'3px 8px',borderRadius:4,cursor:'pointer',fontWeight:600,
                  background:lbMetric===k?'var(--amber)':'rgba(255,255,255,.07)',
                  color:lbMetric===k?'var(--navy)':'var(--text3)',border:'none'},
                  onClick:()=>setLbMetric(k)},l)
              )
            ),
            lbData.data.length===0?div({style:{textAlign:'center',color:'var(--text3)',fontSize:'10px',padding:'16px 0'}},'No data for this period'):
            (()=>{
              const {data,avg,fmt,label,higherBetter}=lbData;
              const top3=data.slice(0,3),bot3=data.slice(-3).reverse();
              const maxV=Math.max(...data.map(s=>s.value));
              const StoreRow=({s,rank,isTop})=>{
                const medal=['🥇','🥈','🥉'];
                const vsAvg=avg&&avg>0?((s.value-avg)/avg*100):null;
                const barPct=maxV>0?Math.min(100,s.value/maxV*100):0;
                const clr=isTop?(rank===0?'#f59e0b':rank===1?'rgba(255,255,255,.6)':'rgba(180,120,60,.9)'):'#f87171';
                return div({style:{marginBottom:5,padding:'4px 6px',borderRadius:5,
                  background:isTop?'rgba(16,185,129,.06)':'rgba(248,113,113,.06)',
                  border:'.5px solid '+(isTop?'rgba(16,185,129,.15)':'rgba(248,113,113,.15)')}},
                  div({style:{display:'flex',alignItems:'center',gap:5,marginBottom:3}},
                    span({style:{fontSize:rank<3?'13px':'9px',flexShrink:0}},rank<3?medal[rank]:(isTop?'↑':'↓')),
                    span({style:{fontSize:'9px',color:'var(--text)',fontWeight:600,flex:1,
                      overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:120}},
                      s.name),
                    span({style:{marginLeft:'auto',fontSize:'7px',
                      background:s.org==='FL'?'rgba(52,211,153,.15)':'rgba(96,165,250,.15)',
                      color:s.org==='FL'?'#34d399':'#60a5fa',
                      padding:'1px 4px',borderRadius:2,fontWeight:700,flexShrink:0}},s.org),
                    span({style:{fontSize:'10px',fontFamily:'monospace',fontWeight:700,
                      color:isTop?'#10b981':'#f87171',marginLeft:4,flexShrink:0}},fmt(s.value))
                  ),
                  div({style:{display:'flex',gap:4,alignItems:'center'}},
                    div({style:{flex:1,background:'rgba(255,255,255,.06)',borderRadius:2,height:3}},
                      div({style:{width:barPct.toFixed(0)+'%',height:'100%',
                        background:isTop?'rgba(16,185,129,.6)':'rgba(248,113,113,.5)',borderRadius:2}})
                    ),
                    vsAvg!=null&&span({style:{fontSize:'7px',fontFamily:'monospace',flexShrink:0,
                      color:((higherBetter&&vsAvg>=0)||(!higherBetter&&vsAvg<=0))?'rgba(16,185,129,.7)':'rgba(248,113,113,.7)'}},
                      (vsAvg>=0?'+':'')+vsAvg.toFixed(1)+'% vs avg')
                  )
                );
              };
              return div(null,
                div({style:{fontSize:'8px',color:'#10b981',fontWeight:700,letterSpacing:'.5px',
                  textTransform:'uppercase',marginBottom:4}},'▲ Top 3 — '+label),
                ...top3.map((s,i)=>h(StoreRow,{key:'t'+s.loc,s,rank:i,isTop:true})),
                avg!=null&&div({style:{textAlign:'center',fontSize:'8px',color:'var(--text3)',
                  padding:'4px 0',borderTop:'.5px dashed rgba(255,255,255,.1)',
                  borderBottom:'.5px dashed rgba(255,255,255,.1)',margin:'4px 0'}},
                  'District Avg: '+fmt(avg)+' ('+data.length+' stores)'),
                div({style:{fontSize:'8px',color:'#f87171',fontWeight:700,letterSpacing:'.5px',
                  textTransform:'uppercase',margin:'4px 0'}},'▼ Bottom 3 — '+label),
                ...bot3.map((s,i)=>h(StoreRow,{key:'b'+s.loc,s,rank:i,isTop:false}))
              );
            })()
          )
        ),
      ), // end grid

      // ── DISTRICT PROJECTIONS MINI TABLE ────────────────────────
      !noData&&(()=>{
        // Compute weekly projections for all stores inline
        const wsd=settings.weekStartDay!=null?settings.weekStartDay:3;
        const ws=new Date(today);while(ws.getDay()!==wsd)ws.setDate(ws.getDate()-1);
        const weekDays=Array.from({length:7},(_,i)=>addD(new Date(ws.getFullYear(),ws.getMonth(),ws.getDate(),12),i));
        const wsKey=dKey(new Date(ws.getFullYear(),ws.getMonth(),ws.getDate(),12));
        const lp=lockedProjections||{};
        const DOWabbr=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
        const storeProjs=allLocs.map(loc=>{
          const t=(ds.targets&&ds.targets[loc])||DEFAULT_TARGETS[loc]||{};
          let wkTotal=0,lyTotal=0;
          weekDays.forEach(d=>{
            const r=forecastDay(loc,d,ds,{...settings,
            _userEvents:userEvents||{},
            _eventFactors:settings.useEventRegistry!==false?computeEventFactors(ds,userEvents||{}):{}
          },null,t);
            wkTotal+=(r.forecast||0);lyTotal+=(r.lyAdj||0);
          });
          const isLocked=!!(lp[loc+'_'+wsKey]);
          const vsLY=lyTotal>0?((wkTotal-lyTotal)/lyTotal*100).toFixed(1):null;
          return{loc,name:STORE_NAMES[String(loc)]||loc,wkTotal,lyTotal,vsLY,isLocked,org:orgOf(loc),actualTotal:0};
        }).sort((a,b)=>b.wkTotal-a.wkTotal);
        const distTotal=storeProjs.reduce((a,s)=>a+s.wkTotal,0);
        const distLY=storeProjs.reduce((a,s)=>a+s.lyTotal,0);
        const distVsLY=distLY>0?((distTotal-distLY)/distLY*100).toFixed(1):null;
        return div({style:{marginTop:16,borderTop:'.5px solid var(--bdr)',paddingTop:12}},
          // Header row
          div({style:{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}},
            div(null,
              div({style:{fontSize:'12px',fontWeight:700,color:'var(--text)'}},'📊 This Week — District Projection'),
              div({style:{fontSize:'9px',color:'var(--text3)',marginTop:2}},
                'Week of '+weekDays[0].toLocaleDateString('en-US',{month:'short',day:'numeric'})+
                ' – '+weekDays[6].toLocaleDateString('en-US',{month:'short',day:'numeric'})+
                '  ·  District Total: '+f$(Math.round(distTotal))+
                (distVsLY!=null?'  ·  vs LY: '+(+distVsLY>=0?'+':'')+distVsLY+'%':''))
            ),
            btn({style:{fontSize:'10px',padding:'4px 12px',borderRadius:5,cursor:'pointer',
              background:'rgba(245,158,11,.15)',color:'var(--amber)',
              fontWeight:600,border:'.5px solid rgba(245,158,11,.3)'},
              onClick:onOpenProjections},'Full Projections →')
          ),
          // Store list
          div({style:{overflowX:'auto'}},
            h('table',{style:{width:'100%',borderCollapse:'collapse',fontSize:'10px'}},
              h('thead',null,
                h('tr',null,
                  h('th',{style:{textAlign:'left',padding:'4px 6px',color:'var(--text3)',fontWeight:600,fontSize:'9px',
                    borderBottom:'.5px solid var(--bdr)',whiteSpace:'nowrap'}},'Store'),
                  weekDays.map((d,i)=>h('th',{key:i,style:{textAlign:'right',padding:'4px 6px',color:'var(--text3)',
                    fontWeight:600,fontSize:'9px',borderBottom:'.5px solid var(--bdr)',whiteSpace:'nowrap'}},
                    DOWabbr[d.getDay()])),
                  h('th',{style:{textAlign:'right',padding:'4px 8px',color:'var(--amber)',fontWeight:700,
                    fontSize:'9px',borderBottom:'.5px solid var(--bdr)',borderLeft:'.5px solid var(--bdr)',
                    whiteSpace:'nowrap'}},'Proj'),
                  h('th',{style:{textAlign:'right',padding:'4px 6px',color:'#34d399',fontWeight:700,
                    fontSize:'9px',borderBottom:'.5px solid var(--bdr)',whiteSpace:'nowrap'}},'Actual'),
                  h('th',{style:{textAlign:'right',padding:'4px 6px',color:'var(--text3)',fontWeight:600,
                    fontSize:'9px',borderBottom:'.5px solid var(--bdr)',whiteSpace:'nowrap'},
                    title:'vs LY (actual days only): actual sales for completed days vs the same days last year. Partial weeks compare only days where data exists.'},'vs LY'),
                  h('th',{style:{textAlign:'right',padding:'4px 6px',color:'var(--text3)',fontWeight:600,
                    fontSize:'9px',borderBottom:'.5px solid var(--bdr)',whiteSpace:'nowrap'},
                    title:'Acc% (completed days only): |actual minus projected| / actual for days where actuals exist. Green <5%, Yellow 5-10%, Red >=10%. Blank for future days.'},'Acc%'),
                  h('th',{style:{textAlign:'center',padding:'4px 6px',color:'var(--text3)',fontWeight:600,
                    fontSize:'9px',borderBottom:'.5px solid var(--bdr)',whiteSpace:'nowrap'}},'Lock')
                )
              ),
              h('tbody',null,
                storeProjs.map((sp,si)=>{
                  const t=(ds.targets&&ds.targets[sp.loc])||DEFAULT_TARGETS[sp.loc]||{};
                  const rowDays=weekDays.map(d=>{
                    const r=forecastDay(sp.loc,d,ds,{...settings,_userEvents:userEvents||{}},null,t);
                    return {fc:r.forecast||0, act:r.actual||0, ly:r.lyAdj||0};
                  });
                  const actualTotal=rowDays.reduce((a,r)=>a+r.act,0);
                  const hasActuals=actualTotal>0;
                  // vs LY: compare only the days we have actuals for — not the full week LY
                  // This gives honest YOY for completed days only
                  const lyForActualDays=rowDays.reduce((a,r)=>a+(r.act>0?r.ly:0),0);
                  const vsLYAct=lyForActualDays>0&&hasActuals?((actualTotal-lyForActualDays)/lyForActualDays*100).toFixed(1):null;
                  // Acc%: |actual − projected| / actual for completed days only
                  const projForActualDays=rowDays.reduce((a,r)=>a+(r.act>0?r.fc:0),0);
                  const accPct=hasActuals&&projForActualDays>0?(Math.abs(actualTotal-projForActualDays)/actualTotal*100).toFixed(1):null;
                  const accClr=accPct==null?'var(--text3)':parseFloat(accPct)<5?'#10b981':parseFloat(accPct)<10?'#f59e0b':'#f87171';
                  const vsLYNum=sp.vsLY!=null?parseFloat(sp.vsLY):null;
                  const vsClr=vsLYNum==null?'var(--text3)':vsLYNum>=0?'#10b981':'#f87171';
                  const vsLYActNum=vsLYAct!=null?parseFloat(vsLYAct):null;
                  const vsActClr=vsLYActNum==null?'var(--text3)':vsLYActNum>=0?'#10b981':'#f87171';
                  return h('tr',{key:sp.loc,style:{borderBottom:'.5px solid rgba(255,255,255,.04)',
                    background:si%2===0?'transparent':'rgba(255,255,255,.02)'}},
                    h('td',{style:{padding:'4px 6px',color:'var(--text)',whiteSpace:'nowrap',maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',fontSize:'10px'}},
                      span({style:{marginRight:4,fontSize:'7px',color:sp.org==='MCDOK'?'#60a5fa':'#34d399'}},sp.org==='MCDOK'?'OK':'FL'),
                      sp.name),
                    rowDays.map((d,i)=>h('td',{key:i,style:{textAlign:'right',padding:'4px 6px',
                      fontFamily:'var(--mono)',fontSize:'9px',
                      color:d.act>0?'#34d399':'var(--text3)'}},
                      d.act>0?f$(Math.round(d.act)):d.fc>0?f$(Math.round(d.fc)):'—')),
                    h('td',{style:{textAlign:'right',padding:'4px 8px',fontFamily:'var(--mono)',
                      fontWeight:700,fontSize:'10px',color:'var(--amber)',
                      borderLeft:'.5px solid var(--bdr)'}},
                      sp.wkTotal>0?f$(Math.round(sp.wkTotal)):'—'),
                    h('td',{style:{textAlign:'right',padding:'4px 6px',fontFamily:'var(--mono)',
                      fontSize:'9px',color:'#34d399'}},
                      hasActuals?f$(Math.round(actualTotal)):'—'),
                    h('td',{style:{textAlign:'right',padding:'4px 6px',fontFamily:'var(--mono)',
                      fontSize:'9px',color:vsActClr}},
                      vsLYAct!=null?(vsLYActNum>=0?'+':'')+vsLYAct+'%':'—'),
                    h('td',{style:{textAlign:'right',padding:'4px 6px',fontFamily:'var(--mono)',
                      fontSize:'9px',color:accClr}},
                      accPct!=null?accPct+'%':'—'),
                    h('td',{style:{textAlign:'center',padding:'4px 6px',fontSize:'10px'}},
                      sp.isLocked?'🔒':'⬜')
                  );
                }),
                // District total row
                h('tr',{style:{borderTop:'.5px solid var(--amber)',background:'rgba(245,158,11,.05)'}},
                  h('td',{style:{padding:'5px 6px',fontWeight:700,fontSize:'10px',color:'var(--amber)'}},'District Total'),
                  weekDays.map((_,i)=>h('td',{key:i,style:{}})),
                  h('td',{style:{textAlign:'right',padding:'5px 8px',fontFamily:'var(--mono)',
                    fontWeight:800,fontSize:'11px',color:'var(--amber)',borderLeft:'.5px solid var(--bdr)'}},
                    f$(Math.round(distTotal))),
                  h('td',{style:{textAlign:'right',padding:'5px 6px',fontFamily:'var(--mono)',
                    fontSize:'10px',color:'#34d399'}},
                    (()=>{const da=storeProjs.reduce((a,s)=>a+(s.actualTotal||0),0);return da>0?f$(Math.round(da)):'—';})()),
                  h('td',{style:{textAlign:'right',padding:'5px 6px',fontFamily:'var(--mono)',
                    fontSize:'10px',color:distVsLY!=null?(+distVsLY>=0?'#10b981':'#f87171'):'var(--text3)'}},
                    distVsLY!=null?((+distVsLY>=0?'+':'')+distVsLY+'%'):'—'),
                  h('td',{style:{textAlign:'right',padding:'5px 6px',fontFamily:'var(--mono)',
                    fontSize:'10px',color:'var(--text3)'}},'—'),
                  h('td',null)
                )
              )
            )
          )
        );
      })()

    ) // end main scroll
  ); // end AtAGlance
}

function DialedInComparisonReport({stores, ds, settings, userEvents, onClose}) {
  const [weekStart, setWeekStart] = React.useState(()=>{
    const d=new Date(); const diff=(3-d.getDay()+7)%7||7;
    const w=new Date(d); w.setDate(d.getDate()-diff*2); // last complete week
    return dKey(w);
  });
  const [groupBy,   setGroupBy]  = React.useState('patch');
  const [computing, setComputing]= React.useState(false);
  const [report,    setReport]   = React.useState(null);

  const fmtWk = dt => 'Week of '+new Date(dt+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
  const mapeColor = m => !m?'var(--text3)':+m<6?'#10b981':+m<10?'#f59e0b':'#f87171';

  const runComparison = React.useCallback(async()=>{
    if(!ds||!ds.loaded){return;}
    setComputing(true); setReport(null);
    const wStart = new Date(weekStart+'T12:00:00');
    const allLocs=(stores||[]).filter(s=>/^\d+$/.test(s.loc)).map(s=>s.loc);
    const results={};

    for(const loc of allLocs){
      const t=(ds.targets&&ds.targets[loc])||DEFAULT_TARGETS[loc]||{};
      const di=settings.dialedIn&&settings.dialedIn[loc];

      // weeklyIsDI (v4.195 fix): this report is genuinely week-scoped (Prev/
      // Next navigate by week), so 'weekly' is the correct horizon to check
      // — but most stores' weekly assignment is 'ae', not 'di' (confirmed via
      // DEFAULT_MODEL_ASSIGNMENTS). forecastDay's weekly call short-circuits
      // to AE regardless of whether settings.dialedIn is present or stripped,
      // so fcDI and fcBase were IDENTICAL for every such store — this report
      // has been silently comparing AE-vs-AE for nearly every location,
      // always showing 0% improvement / "Consider recalibrating" regardless
      // of whether DI calibration is actually good. Detect this upfront and
      // report it honestly (N/A) instead of running a comparison that can't
      // possibly show a difference.
      const weeklyAssignment = getModelAssignment(loc,'weekly',settings);
      const weeklyIsDI = (weeklyAssignment&&weeklyAssignment.model)==='di';

      if(!weeklyIsDI){
        results[loc]={days:[],mapeDI:null,mapeBase:null,improvement:null,
          wkFcDI:0,wkFcBase:0,wkAct:0,wkLY:0,
          hasDI:!!(di&&di.mape!=null),
          notApplicable:true,
          notApplicableReason:'Weekly model assignment is '+(MODEL_CODE_LABELS[weeklyAssignment&&weeklyAssignment.model]||(weeklyAssignment&&weeklyAssignment.model)||'dow')+', not Dialed-In — no weekly comparison to make',
          verdict:'N/A — not DI weekly'};
        continue;
      }

      // Settings WITHOUT Dialed-In: use DEF_SETTINGS calibration values
      const settingsBase={...settings,
        dialedIn:{...settings.dialedIn,[loc]:null}, // remove this store calibration
      };
      // Settings WITH Dialed-In
      const settingsDI={...settings};

      const days=[]; let diMapeSum=0,baseMapeSum=0,cnt=0;
      for(let i=0;i<7;i++){
        const date=addD(wStart,i);
        const actRow=(ds.laborRows||[]).find(r=>r.loc===loc&&dKey(r.date)===dKey(date));
        if(!actRow||!actRow.sales||actRow.sales<=0) continue;

        const fcDI=forecastDay(loc,date,ds,{...settingsDI,_userEvents:userEvents||{}},null,t);
        const fcBase=forecastDay(loc,date,ds,{...settingsBase,_userEvents:userEvents||{}},null,t);

        const errDI=Math.abs(fcDI.forecast-actRow.sales)/actRow.sales*100;
        const errBase=Math.abs(fcBase.forecast-actRow.sales)/actRow.sales*100;
        diMapeSum+=errDI; baseMapeSum+=errBase; cnt++;

        days.push({date,
          actual:actRow.sales, lyAdj:fcDI.lyAdj||0,
          fcDI:fcDI.forecast, fcBase:fcBase.forecast,
          errDI:+errDI.toFixed(1), errBase:+errBase.toFixed(1),
          betterWithDI: errDI < errBase-0.5,
          worseWithDI: errDI > errBase+0.5,
        });
        await new Promise(res=>setTimeout(res,0));
      }

      const mapeDI=cnt?+(diMapeSum/cnt).toFixed(1):null;
      const mapeBase=cnt?+(baseMapeSum/cnt).toFixed(1):null;
      const improvement=mapeDI!=null&&mapeBase!=null?+(mapeBase-mapeDI).toFixed(1):null;
      const wkFcDI=days.reduce((a,d)=>a+d.fcDI,0);
      const wkFcBase=days.reduce((a,d)=>a+d.fcBase,0);
      const wkAct=days.reduce((a,d)=>a+d.actual,0);
      const wkLY=days.reduce((a,d)=>a+d.lyAdj,0);

      results[loc]={days,mapeDI,mapeBase,improvement,wkFcDI,wkFcBase,wkAct,wkLY,
        hasDI:!!(di&&di.mape!=null),
        verdict: improvement==null?'No data':
          improvement>3?'Dialed-In significantly better':
          improvement>0.5?'Dialed-In better':
          improvement<-3?'Not Dialed-In is better — recalibrate':
          'About the same'
      };
    }

    // District-level summary
    const allMapesDI=allLocs.map(l=>results[l]&&results[l].mapeDI).filter(v=>v!=null);
    const allMapesBase=allLocs.map(l=>results[l]&&results[l].mapeBase).filter(v=>v!=null);
    const districtDI=allMapesDI.length?+(allMapesDI.reduce((a,v)=>a+v,0)/allMapesDI.length).toFixed(1):null;
    const districtBase=allMapesBase.length?+(allMapesBase.reduce((a,v)=>a+v,0)/allMapesBase.length).toFixed(1):null;
    const districtImprovement=districtDI!=null&&districtBase!=null?+(districtBase-districtDI).toFixed(1):null;

    setReport({results,allLocs,weekStart,districtDI,districtBase,districtImprovement});
    setComputing(false);
  },[ds,settings,stores,weekStart]);

  const navWeek = delta => {
    const d=new Date(weekStart+'T12:00:00');
    d.setDate(d.getDate()+delta*7);
    setWeekStart(dKey(d));
    setReport(null);
  };

  const getGroups=()=>{
    if(!report) return [];
    if(groupBy==='patch') return Object.entries(settings.supervisorGroups||{});
    if(groupBy==='operator') return Object.entries(settings.operators||DEF_SETTINGS.operators||{});
    if(groupBy==='org') return [['MCDOK',report.allLocs.filter(l=>getStoreOrg(l)==='MCDOK')],['Emerald Arches',report.allLocs.filter(l=>getStoreOrg(l)!=='MCDOK')]];
    return [['All Stores',report.allLocs]];
  };

  // TH (table header style) now comes from the module-scope constant above.

  return div({style:{display:'flex',flexDirection:'column',height:'92vh'}},
    // Header
    div({style:{padding:'14px 18px',borderBottom:'.5px solid var(--bdr)',
      display:'flex',alignItems:'center',gap:10,flexWrap:'wrap',flexShrink:0}},
      div(null,
        div({style:{fontSize:'14px',fontWeight:800}},'⚡ Dialed-In vs Default Comparison'),
        div({style:{fontSize:'9px',color:'var(--text3)',marginTop:2}},
          'Compare forecast accuracy with Dialed-In calibration vs without — see the exact dollar difference and MAPE improvement')
      ),
      // Week picker
      div({style:{display:'flex',alignItems:'center',gap:6,marginLeft:8}},
        btn({className:'btn btn-sm',onClick:()=>navWeek(-1)},'← Prev'),
        div({style:{fontSize:'10px',fontWeight:600,padding:'0 8px',minWidth:180,textAlign:'center'}},fmtWk(weekStart)),
        btn({className:'btn btn-sm',onClick:()=>navWeek(1)},'Next →'),
      ),
      // Group selector
      div({style:{display:'flex',gap:4,marginLeft:8,alignItems:'center'}},
        div({style:{fontSize:'9px',color:'var(--text3)'}},'Group:'),
        [['all','All'],['patch','Patch'],['operator','Operator'],['org','Org']].map(([v,l])=>
          btn({key:v,className:'btn btn-sm'+(groupBy===v?' btn-a':''),
            style:{fontSize:'9px',padding:'2px 8px'},onClick:()=>setGroupBy(v)},l))
      ),
      div({style:{display:'flex',gap:6,marginLeft:'auto',alignItems:'center'}},
        btn({className:'btn btn-sm btn-a',style:{fontWeight:700},
          onClick:runComparison,disabled:computing},
          computing?'⏳ Computing...':'▶ Run Comparison'),
        report&&btn({className:'btn btn-sm',onClick:()=>window.print(),title:'Print report'},'🖨 Print'),
        report&&btn({className:'btn btn-sm',
          onClick:()=>{
            const hdr=['Group','Location','Has Dialed-In','MAPE (DI)','MAPE (Default)','Improvement','Verdict','Wk Actual $','Wk Fcst DI $','Wk Fcst Default $'];
            const rows=[];
            getGroups().forEach(([gn,locs])=>{
              (locs||[]).filter(l=>report.allLocs.includes(l)).forEach(loc=>{
                const r=report.results[loc]; if(!r) return;
                const name=sName(loc);
                rows.push([gn,name,r.hasDI?'Yes':'No',
                  r.mapeDI!=null?r.mapeDI+'%':'—',r.mapeBase!=null?r.mapeBase+'%':'—',
                  r.improvement!=null?(r.improvement>0?'+':'')+r.improvement+'%':'—',
                  r.verdict,r.wkAct||0,r.wkFcDI||0,r.wkFcBase||0]);
              });
            });
            const csv=[hdr,...rows].map(r=>r.map(v=>'"'+v+'"').join(',')).join('\n');
            const fn='DIComparison_'+weekStart+'_'+groupBy+'.csv';
            const a=document.createElement('a');a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv);
            a.download=fn;a.click();
          }},'⬇ CSV'),
        btn({className:'btn btn-sm',onClick:onClose},'✕ Close')
      )
    ),

    // Body
    div({style:{flex:1,overflowY:'auto',padding:'16px 20px'}},
      !report&&!computing&&div({style:{textAlign:'center',padding:60}},
        div({style:{fontSize:'32px',marginBottom:12}},'⚡'),
        div({style:{fontWeight:600,marginBottom:6}},'Compare forecast accuracy with and without Dialed-In'),
        div({style:{fontSize:'10px',color:'var(--text3)',marginBottom:20,maxWidth:440,margin:'0 auto 20px'}},
          'This report runs the AI forecast for the selected week two ways: once with your Dialed-In calibration parameters, and once with the default settings. Shows which stores benefit most from calibration — and any where the default might actually be better.'),
        btn({className:'btn btn-a',style:{padding:'10px 24px',fontSize:'12px'},
          onClick:runComparison},'▶ Run Comparison — '+fmtWk(weekStart))
      ),
      computing&&div({style:{textAlign:'center',padding:60}},
        div({style:{fontSize:'24px',marginBottom:8}},'⏳'),
        div({style:{color:'var(--text3)',fontSize:'11px'}},'Running dual forecast across all locations for '+fmtWk(weekStart)+'...')
      ),
      report&&div(null,
        // District summary KPIs
        div({style:{display:'flex',gap:8,marginBottom:16,flexWrap:'wrap'}},
          [
            {l:'District MAPE — Dialed-In',v:report.districtDI!=null?report.districtDI+'%':'—',
              c:mapeColor(report.districtDI),sub:'with calibration'},
            {l:'District MAPE — Default',v:report.districtBase!=null?report.districtBase+'%':'—',
              c:mapeColor(report.districtBase),sub:'without calibration'},
            {l:'Calibration Improvement',
              v:report.districtImprovement!=null?(report.districtImprovement>0?'+':'')+report.districtImprovement+'%':'—',
              c:report.districtImprovement>0?'#10b981':report.districtImprovement<0?'#f87171':'#94a3b8',
              sub:report.districtImprovement>0?'Dialed-In is helping':'Default is competitive'},
            {l:'Stores with Dialed-In',
              v:report.allLocs.filter(l=>report.results[l]&&report.results[l].hasDI).length+'/'+report.allLocs.length,
              c:'var(--amber)',sub:'calibrated stores'},
          ].map((k,i)=>div({key:i,style:{flex:'1 1 160px',background:'var(--surf2)',
            border:'.5px solid var(--bdr)',borderRadius:'var(--rl)',padding:'10px 14px'}},
            div({style:{fontSize:'8px',color:'var(--text3)',fontWeight:600,
              textTransform:'uppercase',letterSpacing:'.5px',marginBottom:3}},[k.l]),
            div({style:{fontFamily:'var(--mono)',fontWeight:800,fontSize:'18px',color:k.c}},[k.v]),
            div({style:{fontSize:'9px',color:'var(--text3)',marginTop:2}},[k.sub])
          ))
        ),
        // Legend
        div({style:{fontSize:'9px',color:'var(--text3)',padding:'5px 10px',
          background:'var(--surf2)',borderRadius:'var(--r)',marginBottom:12,
          display:'flex',gap:12,alignItems:'center',flexWrap:'wrap'}},
          span({style:{fontWeight:600}},'Reading this report:'),
          span(null,'DI MAPE = accuracy with Dialed-In · Default = without calibration · Improvement = how many points better Dialed-In is · Green improvement = Dialed-In is helping')
        ),
        // No-DI-weekly banner (v4.195) — this report is genuinely week-scoped,
        // so it correctly checks each store's WEEKLY model assignment. If
        // none of the visible stores are DI-assigned weekly (their DI
        // calibration applies at monthly/yearly instead — see Model
        // Assignments), every row below will show N/A. This banner explains
        // why upfront instead of leaving 27 empty-looking rows unexplained.
        (()=>{
          const naCount=report.allLocs.filter(l=>report.results[l]&&report.results[l].notApplicable).length;
          if(naCount===0) return null;
          return div({style:{fontSize:'9.5px',padding:'8px 12px',marginBottom:12,
            background:'rgba(96,165,250,.08)',border:'.5px solid rgba(96,165,250,.3)',
            borderRadius:'var(--r)',color:'var(--text2)'}},
            naCount===report.allLocs.length
              ? '⊘ No stores currently use Dialed-In at the weekly horizon — every store below shows N/A. Most Dialed-In calibration in this district applies at the monthly or yearly horizon instead (see 🎯 Model Assignments). This report specifically compares the WEEKLY forecast, so it has nothing to compare here.'
              : naCount+' of '+report.allLocs.length+' stores below show N/A — their weekly model assignment isn\'t Dialed-In (see 🎯 Model Assignments), so there\'s no weekly DI-vs-Default comparison to make for them.'
          );
        })(),
        // Group tables
        ...getGroups().map(([groupName,locs])=>{
          const gLocs=(locs||[]).filter(l=>report.allLocs.includes(l));
          if(!gLocs.length) return null;
          const gDI=gLocs.map(l=>report.results[l]&&report.results[l].mapeDI).filter(v=>v!=null);
          const gBase=gLocs.map(l=>report.results[l]&&report.results[l].mapeBase).filter(v=>v!=null);
          const gAvgDI=gDI.length?+(gDI.reduce((a,v)=>a+v,0)/gDI.length).toFixed(1):null;
          const gAvgBase=gBase.length?+(gBase.reduce((a,v)=>a+v,0)/gBase.length).toFixed(1):null;
          const gImprove=gAvgDI!=null&&gAvgBase!=null?+(gAvgBase-gAvgDI).toFixed(1):null;
          return div({key:groupName,className:'pvsa-group',style:{marginBottom:20}},
            div({style:{display:'flex',alignItems:'center',gap:8,
              borderBottom:'1px solid var(--bdr2)',paddingBottom:4,marginBottom:4}},
              div({style:{fontWeight:700,fontSize:'11px',color:'var(--amber)'}},[groupName]),
              gImprove!=null&&div({style:{fontSize:'9px',fontWeight:600,padding:'1px 8px',borderRadius:10,
                background:gImprove>0?'rgba(16,185,129,.1)':'rgba(239,68,68,.1)',
                color:gImprove>0?'#10b981':'#f87171',border:'.5px solid '+(gImprove>0?'rgba(16,185,129,.3)':'rgba(239,68,68,.3)')}},
                'Group improvement: '+(gImprove>0?'+':'')+gImprove+'%')
            ),
            tbl({style:{width:'100%',borderCollapse:'collapse',fontSize:'10px'}},
              h('thead',null,tr(null,
                th({style:{...TH,textAlign:'left',minWidth:140}},'Location'),
                th({style:{...TH,textAlign:'right'}},'Has DI'),
                th({style:{...TH,textAlign:'right'}},'DI MAPE'),
                th({style:{...TH,textAlign:'right'}},'Default MAPE'),
                th({style:{...TH,textAlign:'right'}},'Improvement'),
                th({style:{...TH,textAlign:'right'}},'Wk Actual'),
                th({style:{...TH,textAlign:'right'}},'DI Fcst'),
                th({style:{...TH,textAlign:'right'}},'Default Fcst'),
                th({style:{...TH,textAlign:'right',minWidth:160}},'Verdict')
              )),
              h('tbody',null,
                ...gLocs.map(loc=>{
                  const r=report.results[loc]; if(!r) return null;
                  const name=sName(loc);
                  const impColor=r.improvement==null?'var(--text3)':r.improvement>0?'#10b981':r.improvement<0?'#f87171':'#94a3b8';
                  return tr({key:loc,style:{borderBottom:'.5px solid var(--bdr)'}},
                    td({style:{padding:'4px 8px',fontWeight:600}},[name]),
                    td({style:{padding:'4px 8px',textAlign:'center'}},[
                      r.hasDI?span({style:{color:'#10b981',fontWeight:700}},'✓ Yes'):
                               span({style:{color:'#f87171'}},'— No')
                    ]),
                    td({style:{padding:'4px 8px',textAlign:'right',fontFamily:'var(--mono)',fontWeight:700,color:mapeColor(r.mapeDI)}},[r.mapeDI!=null?r.mapeDI+'%':'—']),
                    td({style:{padding:'4px 8px',textAlign:'right',fontFamily:'var(--mono)',color:mapeColor(r.mapeBase)}},[r.mapeBase!=null?r.mapeBase+'%':'—']),
                    td({style:{padding:'4px 8px',textAlign:'right',fontFamily:'var(--mono)',fontWeight:700,color:impColor}},
                      [r.improvement!=null?(r.improvement>0?'+':'')+r.improvement+'%':'—']),
                    td({style:{padding:'4px 8px',textAlign:'right',fontFamily:'var(--mono)'}},[r.wkAct>0?f$(r.wkAct):'—']),
                    td({style:{padding:'4px 8px',textAlign:'right',fontFamily:'var(--mono)',color:mapeColor(r.mapeDI)}},[r.wkFcDI>0?f$(r.wkFcDI):'—']),
                    td({style:{padding:'4px 8px',textAlign:'right',fontFamily:'var(--mono)',color:'var(--text3)'}},[r.wkFcBase>0?f$(r.wkFcBase):'—']),
                    td({style:{padding:'4px 8px',fontSize:'9px',color:impColor,fontWeight:600}},[r.verdict])
                  );
                }),
                // Group total row
                tr({style:{background:'rgba(245,158,11,.06)',borderTop:'1px solid var(--bdr)',fontWeight:700}},
                  td({style:{padding:'5px 8px',color:'var(--amber)'}},[groupName+' Total']),
                  td({style:{padding:'5px 8px',textAlign:'center',fontSize:'9px',color:'var(--text3)'}},
                    [gLocs.filter(l=>report.results[l]&&report.results[l].hasDI).length+'/'+gLocs.length+' calibrated']),
                  td({style:{padding:'5px 8px',textAlign:'right',fontFamily:'var(--mono)',color:mapeColor(gAvgDI)}},[gAvgDI!=null?gAvgDI+'%':'—']),
                  td({style:{padding:'5px 8px',textAlign:'right',fontFamily:'var(--mono)',color:mapeColor(gAvgBase)}},[gAvgBase!=null?gAvgBase+'%':'—']),
                  td({style:{padding:'5px 8px',textAlign:'right',fontFamily:'var(--mono)',fontWeight:700,
                    color:gImprove!=null?(gImprove>0?'#10b981':gImprove<0?'#f87171':'#94a3b8'):'var(--text3)'}},
                    [gImprove!=null?(gImprove>0?'+':'')+gImprove+'%':'—']),
                  td({colSpan:4,style:{padding:'5px 8px',textAlign:'center',fontSize:'9px',
                    color:gImprove!=null?(gImprove>0?'#10b981':'#f87171'):'var(--text3)'}},
                    [gImprove!=null?(gImprove>0?'Calibration is helping this group':'Consider recalibrating'):'No data'])
                )
              )
            )
          );
        })
      )
    )
  );
}

// SIDEBAR — v0.dev Bloomberg Terminal layout
function AppSidebar({view, setView, selStore, stores, ds, settings, onOpenModal, onLoadFiles, onSaveSession, onRestoreSession, loadMsg}) {
  const [collapsed, setCollapsed] = React.useState(false);
  const [expandedGroup, setExpandedGroup] = React.useState('nav');
  const w = collapsed ? 48 : 220;

  const navItemSub = (label, icon, onClick, active, badge) =>
    div({style:{display:'flex',alignItems:'center',gap:collapsed?0:8,
      padding:collapsed?'6px 0':'5px 10px 5px '+(collapsed?10:20),
      borderRadius:'var(--r)',cursor:'pointer',
      background:active?'var(--adim)':'transparent',
      color:active?'var(--amber)':'var(--text3)',
      transition:'all .15s',justifyContent:collapsed?'center':'flex-start',
      position:'relative',fontSize:'11px',fontWeight:active?600:400,
      borderLeft:collapsed?'none':'1.5px solid var(--bdr)'},
      onClick, title:collapsed?label:undefined,
      onMouseEnter:e=>{e.currentTarget.style.background=active?'var(--adim)':'rgba(255,255,255,.04)';},
      onMouseLeave:e=>{e.currentTarget.style.background=active?'var(--adim)':'transparent';}},
      collapsed?null:span({style:{width:8,height:8,borderRadius:'50%',flexShrink:0,
        background:active?'var(--amber)':'var(--bdr2)'}},null),
      !collapsed&&span(null,label)
    );
  const navLabel = (l) =>
    div({style:{padding:'4px 14px 2px',fontSize:'7px',fontWeight:700,
      textTransform:'uppercase',letterSpacing:'.7px',color:'var(--text3)',marginTop:8}},(l));
  const navItem = (label, icon, onClick, active, badge) =>
    div({style:{display:'flex',alignItems:'center',gap:collapsed?0:8,
      padding:collapsed?'8px 0':'6px 10px',borderRadius:'var(--r)',cursor:'pointer',
      background:active?'var(--adim)':'transparent',
      color:active?'var(--amber)':'var(--text2)',
      transition:'all .15s',justifyContent:collapsed?'center':'flex-start',
      position:'relative',fontSize:'12px',fontWeight:active?600:400},
      onClick, title:collapsed?label:undefined,
      onMouseEnter:e=>{e.currentTarget.style.background=active?'var(--adim)':'var(--surf2)';},
      onMouseLeave:e=>{e.currentTarget.style.background=active?'var(--adim)':'transparent';}},
      span({style:{fontSize:14,flexShrink:0}},icon),
      !collapsed&&span(null,label),
      !collapsed&&badge>0&&span({style:{marginLeft:'auto',background:'rgba(239,68,68,.15)',
        color:'#ef4444',border:'.5px solid rgba(239,68,68,.25)',borderRadius:10,
        fontSize:9,padding:'1px 5px',fontWeight:700}},badge)
    );

  const sectionLabel = (txt) => collapsed?null:
    div({style:{fontSize:'9px',fontWeight:700,letterSpacing:'.8px',color:'var(--text3)',
      textTransform:'uppercase',padding:'12px 10px 4px',marginTop:4}},txt);

  // Needs Attention badge count
  const needsCount = (stores||[]).filter(s=>s.findings&&s.findings.some(f=>f.t==='crit')).length;

  return div({style:{width:w,minWidth:w,height:'100%',background:'var(--surf)',
    borderRight:'.5px solid var(--bdr)',display:'flex',flexDirection:'column',
    transition:'width .2s ease',flexShrink:0,overflowX:'hidden',zIndex:10}},

    // ── Logo & collapse toggle ──────────────────────────────────
    div({style:{display:'flex',alignItems:'center',gap:8,padding:collapsed?'14px 0':'14px 12px',
      borderBottom:'.5px solid var(--bdr)',justifyContent:collapsed?'center':'flex-start',
      flexShrink:0}},
      div({style:{width:30,height:30,borderRadius:'var(--r)',background:'var(--amber)',
        display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,
        cursor:'pointer',transition:'transform .15s'},
        onClick:()=>setCollapsed(p=>!p),
        title:collapsed?'Expand sidebar':'Collapse sidebar'},
        span({style:{fontSize:15,fontWeight:900,color:'#000',fontFamily:'var(--sans)',
          lineHeight:1}},'M')
      ),
      !collapsed&&div({style:{overflow:'hidden'}},
        div({style:{fontSize:'13px',fontWeight:700,color:'var(--text)',
          whiteSpace:'nowrap',lineHeight:1.3}},'Meridian'),
        div({style:{fontSize:'9px',color:'var(--text3)',letterSpacing:'.5px',
          textTransform:'uppercase',whiteSpace:'nowrap'}},
          settings.districtName||'District')
      )
    ),

    // ── Navigation ──────────────────────────────────────────────
    div({style:{flex:1,overflowY:'auto',overflowX:'hidden',padding:collapsed?'8px 4px':'8px'}},

      sectionLabel('Views'),
      // ── DAILY ──────────────────────────────────────────────────
      navLabel('DAILY'),
      navItem('Command Center',     '⌂', ()=>setView('command'),  view==='command'),
      navItem('⚠ Needs Attention',  '🔴', ()=>onOpenModal('attention'), false, needsCount),
      navItem('Anomaly Scanner',    '🔍', ()=>onOpenModal('aiscan'), false),
      navItem('Projections',        '▦', ()=>onOpenModal('proj'),       false),
      // Fixed v4.195: this was wired to onOpenModal('report') (Date-Range
      // Comprehensive Report) — a pre-existing mislabel unrelated to the
      // redesign, found via UI testing. Now correctly opens the actual
      // Projection Workflow, same destination as 'Projections' above.
      navItem('Projection Workflow','🔒', ()=>onOpenModal('proj'),       false),
      navItem('Proj vs Actuals',    '◑', ()=>onOpenModal('pvsa'),       false),
      // Re-added v4.195: previously only reachable via the mislabeled
      // 'Projection Workflow' item above (now correctly fixed to open the
      // actual Projection Workflow). Without this, the Date-Range
      // Comprehensive Report — a real, working feature — would have had
      // zero nav entry point.
      navItem('Date-Range Report',  '📅', ()=>onOpenModal('report'),     false),
      navItem('Events & Tags',      '◷', ()=>onOpenModal('events'),     false),
      // ── PLANNING & FORECAST ────────────────────────────────────
      navLabel('PLANNING & FORECAST'),
      navItem('Model Assignments',  '🎯', ()=>onOpenModal('model-assign'),  false),
      navItem('Dialed-In Calibration','◎',()=>onOpenModal('dialedin'),     false),
      navItem('Forecast Accuracy',  '🎯', ()=>onOpenModal('fcst-accuracy'), false),
      navItem('Lifelenz Gap Report','📊', ()=>onOpenModal('lfz-gap'),       false),
      navItem('DI Compare',         '⚡', ()=>onOpenModal('dicompare'),     false),
      // ── PERFORMANCE ────────────────────────────────────────────
      navLabel('PERFORMANCE'),
      navItem('Rankings',           '⇈', ()=>onOpenModal('ranking'),       false),
      navItem('Targets',            '◉', ()=>onOpenModal('unified-targets'),false),
      navItem('Priority Brief',      '🎯', ()=>onOpenModal('priority-brief'),  false),
      navItem('Labor Analytics',    '👷', ()=>onOpenModal('labor-analytics'),false),
      navItem('FOB Analysis',       '🥗', ()=>onOpenModal('fob-analysis'),  false),
      navItem('Operator Summary',   '👔', ()=>onOpenModal('operator-summary'),false),
      navItem('Revenue Intel',      '◈', ()=>onOpenModal('revintel'),      false),
      // ── STORE OPERATIONS ───────────────────────────────────────
      navLabel('STORE OPERATIONS'),
      navItem('Store KB',           '📍', ()=>onOpenModal('store-kb'),     false),
      navItem('District View',      '⊞', ()=>{setView('district');}, view==='district'),
      navItem('Loc Intelligence',   '📊', ()=>onOpenModal('loc-intel'),    false),
      navItem('Inventory',          '📦', ()=>onOpenModal('inventory'),    false),
      navItem('Intelligence Brief', '🧠', ()=>onOpenModal('brief'),        false),
      navItem('Morning Brief',      '☀️', ()=>onOpenModal('morning-brief'), false),
      navItem('About / Changelog','ℹ️', ()=>onOpenModal('about'),          false),
      // ── TOOLS ──────────────────────────────────────────────────
      navLabel('TOOLS'),
      navItem('Performance Calculator','🧮',()=>onOpenModal('perf-calc'),  false),
      navItem('Metric Correlations', '🔗',()=>onOpenModal('corr-explorer'),false),
      navItem('Compare',             '⇄', ()=>onOpenModal('compare'),      false),
      navItem('Store One-Pager',     '📄', ()=>onOpenModal('one-pager'),   false),
      navItem('GM Coaching Letters', '👨‍💼',()=>onOpenModal('gm-brief'),    false),
      navItem('Calendar Manager',    '📅', ()=>onOpenModal('calendar-manager'), false),
      navItem('Why Engine',          '🔬', ()=>onOpenModal('why-engine'),       false),
      navItem('LifeLenz Bridge',     '🌉', ()=>onOpenModal('lifelenz-bridge'),  false),
      navItem('DAR Daypart',         '⏱', ()=>onOpenModal('dar-daypart'),  false),
      navItem('Product Mix',         '🍔', ()=>onOpenModal('pmix'),        false),
      // ── ADMIN ──────────────────────────────────────────────────
      navLabel('ADMIN'),
      navItem('Settings',            '⚙', ()=>onOpenModal('settings'),    false),
      navItem('Knowledge Base',      '📖', ()=>onOpenModal('kb'),          false),
      navItem('Data Manager',         '🗄', ()=>onOpenModal('data-manager'), false),
      navItem('Save Session',        '💾', ()=>onSaveSession&&onSaveSession(), false),
      navItem('Restore Session',     '📂', ()=>onRestoreSession&&onRestoreSession(), false),
      navItem('Help',                '?',  ()=>onOpenModal('help'),        false),
    ),

    // ── Footer status ───────────────────────────────────────────
    div({style:{borderTop:'.5px solid var(--bdr)',padding:collapsed?'10px 0':'10px 12px',
      flexShrink:0,display:'flex',alignItems:'center',gap:8,justifyContent:collapsed?'center':'flex-start'}},
      // Data live indicator
      div({style:{width:7,height:7,borderRadius:'50%',flexShrink:0,
        background:ds&&ds.loaded?'#10b981':'#64748b',
        boxShadow:ds&&ds.loaded?'0 0 6px rgba(16,185,129,.5)':'none',
        animation:ds&&ds.loaded?'pulse 2s infinite':'none'}}),
      !collapsed&&div({style:{fontSize:'9px',color:'var(--text3)',overflow:'hidden'}},
        div({style:{color:'var(--text2)',fontWeight:600,fontSize:'10px',whiteSpace:'nowrap'}},
          ds&&ds.loaded?'Data loaded':'No data'),
        ds&&ds.storeIds&&div({style:{whiteSpace:'nowrap'}},
          ds.storeIds.length+' stores · '+
          (ds.laborRows&&ds.laborRows.length>0?Math.floor(ds.laborRows.length/1000)+'K rows':'no data'))
      )
    )
  );
}

// ── App Topbar (slim contextual header) ─────────────────────────────
function AppTopbar({view, selStore, stores, ds, settings, dateRange, onDateChange, locScope, onScopeChange,
                    onOpenModal, onLoadFiles, onSaveSession, loadMsg, setView,
                    sessionBanner, onClearSession}) {
  const today = new Date();

  // View title
  const viewTitle = view==='command'?'Command Center':
    view==='district'?'District Overview':
    view==='org'?'Org Structure':
    view==='store'&&selStore?sNameC(selStore)||'Store Detail':
    'Meridian';

  // Week label for projection context
  const wStart = React.useMemo(()=>{
    const d=new Date(); const wsd=settings.weekStartDay!=null?settings.weekStartDay:3;
    const diff=(wsd-d.getDay()+7)%7; const w=new Date(d); w.setDate(d.getDate()-diff);
    return w;
  },[settings.weekStartDay]);

  return div({style:{height:44,background:'var(--surf)',borderBottom:'.5px solid var(--bdr)',
    display:'flex',alignItems:'center',padding:'0 16px',gap:12,flexShrink:0}},

    // Left: title + period
    div({style:{display:'flex',alignItems:'center',gap:10,flex:1,minWidth:0}},
      div({style:{fontSize:'13px',fontWeight:700,color:'var(--amber)',
        whiteSpace:'nowrap',letterSpacing:'-.2px'}},viewTitle),
      div({style:{display:'flex',alignItems:'center',gap:4,fontSize:'10px',color:'var(--text3)'}},'·'),
      div({style:{fontSize:'10px',color:'var(--text3)',fontFamily:'var(--mono)',
        whiteSpace:'nowrap'}},
        'Week of '+wStart.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})
      ),
      ds&&ds.loaded&&div({style:{display:'flex',alignItems:'center',gap:4,
        background:'rgba(16,185,129,.08)',border:'.5px solid rgba(16,185,129,.2)',
        borderRadius:10,padding:'1px 7px'}},
        div({style:{width:5,height:5,borderRadius:'50%',background:'#10b981',
          animation:'pulse 2s infinite'}}),
        span({style:{fontSize:'8px',color:'#10b981',fontWeight:600,fontFamily:'var(--mono)'}},'LIVE')
      ),
      // Session age indicator — shows how fresh the auto-saved data is
      (()=>{
        // Read the IDB session age from sessionBanner if available, else check last file load
        const ageDays = sessionBanner?.savedAt
          ? Math.floor((Date.now()-new Date(sessionBanner.savedAt))/86400000)
          : ds?.loaded ? 0 : null;
        if(ageDays===null&&!ds?.loaded) return null;
        const col = ageDays===0?'#34d399':ageDays<=3?'#f59e0b':'#f87171';
        const label = ageDays===0?'Auto-saved today':ageDays===1?'Session: 1d old':'Session: '+ageDays+'d old';
        const tip = ageDays>3?'Consider loading a fresh Operations Report — session data may be stale':'Session data is current';
        return div({style:{display:'flex',alignItems:'center',gap:3,
          background:'rgba(255,255,255,.04)',border:'.5px solid rgba(255,255,255,.1)',
          borderRadius:10,padding:'1px 8px',cursor:'pointer'},
          title:tip,
          onClick:onClearSession},
          span({style:{fontSize:'7px',color:col,fontWeight:600,fontFamily:'var(--mono)'}},label),
          ageDays>3&&span({style:{fontSize:'8px',color:'#f87171'}},' ⚠')
        );
      })()
    ),

    // Right: actions
    div({style:{display:'flex',alignItems:'center',gap:2}},
      // Pre-Forecast Brief quick-access
      ds&&ds.loaded&&btn({className:'btn btn-sm',
        style:{fontSize:'9px',color:'var(--gold)',borderColor:'rgba(245,188,0,.3)',
          background:'rgba(245,188,0,.06)',marginRight:4},
        title:'Open Pre-Forecast Brief — analysis of the upcoming projection period',
        onClick:()=>onOpenModal&&onOpenModal('proj-brief')},'📋 Pre-Brief'),
      // Scope filter — OK / FL / All
      div({style:{display:'flex',gap:1,marginRight:4}},
        ...[['all','All'],['ok','OK'],['fl','FL']].map(([s,l])=>
          btn({key:s,className:'btn btn-sm',
            style:{fontSize:'9px',padding:'2px 7px',
              background:locScope===s?'rgba(245,188,0,.15)':'transparent',
              color:locScope===s?'var(--gold)':'var(--text3)',
              borderColor:locScope===s?'rgba(245,188,0,.4)':'rgba(255,255,255,.1)',
              fontWeight:locScope===s?700:400},
            onClick:()=>onScopeChange&&onScopeChange(s)},l)
        )
      ),
      // Date range picker — controls all views
      h(DatePicker,{value:dateRange,onChange:onDateChange}),
      // Load files
      div({style:{position:'relative'}},
        btn({className:'btn btn-sm',style:{fontSize:'10px'},
          onClick:onLoadFiles},'↑ Load'),
        loadMsg&&div({style:{position:'absolute',top:'calc(100% + 4px)',right:0,
          background:'var(--surf2)',border:'.5px solid var(--bdr)',borderRadius:'var(--r)',
          padding:'4px 8px',fontSize:'9px',color:'var(--text2)',whiteSpace:'nowrap',
          zIndex:50}},loadMsg)
      ),
      btn({className:'btn btn-sm',title:'Save session to file',style:{fontSize:'10px'},
        onClick:onSaveSession},'💾'),
      btn({className:'btn btn-sm',style:{fontSize:'10px'},
        onClick:()=>onOpenModal('settings')},'⚙'),
      btn({className:'btn btn-sm',style:{fontSize:'10px'},
        onClick:()=>onOpenModal('help')},'?'),
      // Dark mode toggle
      btn({className:'btn btn-sm',style:{fontSize:'10px'},
        title:'Toggle light/dark mode',
        onClick:()=>{
          const next=settings.colorMode==='dark'?'light':'dark';
          document.documentElement.setAttribute('data-mode',next);
        }},settings.colorMode==='dark'?'☀':'🌙')
    )
  );
}

// LOCATION INTELLIGENCE — Statistical + AI Deep Dive
function pearsonR(xs,ys){
  var n=xs.length;if(n<5||n!==ys.length)return null;
  var mx=xs.reduce(function(a,b){return a+b;},0)/n;
  var my=ys.reduce(function(a,b){return a+b;},0)/n;
  var num=xs.reduce(function(s,x,i){return s+(x-mx)*(ys[i]-my);},0);
  var dx=xs.reduce(function(s,x){return s+(x-mx)*(x-mx);},0);
  var dy=ys.reduce(function(s,y){return s+(y-my)*(y-my);},0);
  var den=Math.sqrt(dx*dy);
  return den===0?null:+(num/den).toFixed(3);
}
function liDOWPatterns(loc,ds){
  var DAYS=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var bins=[[],[],[],[],[],[],[]];
  (ds.laborRows||[]).filter(function(r){return r.loc===loc&&r.sales>0;}).forEach(function(r){bins[r.date.getDay()].push(r.sales);});
  var avgs=bins.map(function(b){return b.length>2?b.reduce(function(a,v){return a+v;},0)/b.length:null;});
  var valid=avgs.filter(function(v){return v!==null;});
  if(!valid.length)return null;
  var grand=valid.reduce(function(a,b){return a+b;},0)/valid.length;
  return{avgs:avgs,days:DAYS,grand:grand,counts:bins.map(function(b){return b.length;})};
}
function liOEPECorr(loc,ds,settings){
  var t=(settings.targets&&settings.targets[loc])||DEFAULT_TARGETS[loc]||{};
  var oepeTgt=t.tOepe||240;
  var pairs=[];
  (ds.opsRows||[]).filter(function(r){return r.loc===loc&&r.oepe>0;}).forEach(function(r){
    var dk=dKey(r.date);
    var lr=(ds.laborRows||[]).find(function(l){return l.loc===loc&&dKey(l.date)===dk&&l.sales>0;});
    if(lr)pairs.push({oepe:r.oepe,sales:lr.sales});
  });
  if(pairs.length<10)return null;
  var r=pearsonR(pairs.map(function(p){return p.oepe;}),pairs.map(function(p){return p.sales;}));
  var above=pairs.filter(function(p){return p.oepe>oepeTgt;}),at=pairs.filter(function(p){return p.oepe<=oepeTgt;});
  var avgAbove=above.length>3?above.reduce(function(s,p){return s+p.sales;},0)/above.length:null;
  var avgAt=at.length>3?at.reduce(function(s,p){return s+p.sales;},0)/at.length:null;
  var pct=avgAbove&&avgAt?(avgAbove-avgAt)/avgAt:null;
  return{r:r,n:pairs.length,pct:pct,avgAbove:avgAbove,avgAt:avgAt,oepeTgt:oepeTgt,above:above.length,at:at.length};
}
function liWeatherCorr(loc,ds){
  if(!ds.wxByDate||!Object.keys(ds.wxByDate).length)return null;
  var pairs=[];
  (ds.laborRows||[]).filter(function(r){return r.loc===loc&&r.sales>0;}).forEach(function(r){
    var wx=ds.wxByDate[dKey(r.date)];
    if(wx)pairs.push({sales:r.sales,rain:wx.rain||0,rmax:wx.rmax||0,
      tmax:wx.tmax||0,tmin:wx.tmin||0,wspd:wx.wspd||0,wmax:wx.wmax||0,mslp:wx.mslp||0});
  });
  if(pairs.length<20)return null;
  // Bucket helpers
  function split(arr,key,cutHigh,cutLow){
    var hi=arr.filter(function(p){return p[key]>cutHigh;});
    var lo=arr.filter(function(p){return p[key]<=cutLow;});
    var avg=function(a){return a.length>3?a.reduce(function(s,p){return s+p.sales;},0)/a.length:null;};
    var impact=function(a,b){return(a&&b)?(a-b)/b:null;};
    return{hi:avg(hi),lo:avg(lo),impact:impact(avg(hi),avg(lo)),n:hi.length};
  }
  var rainD=pairs.filter(function(p){return p.rain>0.1;}),dryD=pairs.filter(function(p){return p.rain<=0.1;});
  var avgRain=rainD.length>3?rainD.reduce(function(s,p){return s+p.sales;},0)/rainD.length:null;
  var avgDry=dryD.length>3?dryD.reduce(function(s,p){return s+p.sales;},0)/dryD.length:null;
  var rainImpact=avgRain&&avgDry?(avgRain-avgDry)/avgDry:null;
  var coldD=pairs.filter(function(p){return p.tmax<40;}),hotD=pairs.filter(function(p){return p.tmax>95;}),mildD=pairs.filter(function(p){return p.tmax>=40&&p.tmax<=95;});
  var windHeavy=split(pairs,'wmax',30,15);
  var windSpd=split(pairs,'wspd',20,10);
  var highRain=split(pairs,'rmax',0.2,0.05);   // peak 5-min intensity
  var pressure=split(pairs,'mslp',1020,1005);   // high pressure vs low pressure
  return{n:pairs.length,rainDays:rainD.length,dryDays:dryD.length,avgRain:avgRain,avgDry:avgDry,rainImpact:rainImpact,
    avgCold:coldD.length>3?coldD.reduce(function(s,p){return s+p.sales;},0)/coldD.length:null,
    avgHot:hotD.length>3?hotD.reduce(function(s,p){return s+p.sales;},0)/hotD.length:null,
    avgMild:mildD.length>3?mildD.reduce(function(s,p){return s+p.sales;},0)/mildD.length:null,
    windHeavy:windHeavy,windSpd:windSpd,highRain:highRain,pressure:pressure,
    // Full variable array for correlation matrix display
    variables:[
      {key:'rain',label:'Rainfall',unit:'in',icon:'🌧',impact:rainImpact,n:rainD.length,group:'Weather'},
      {key:'rmax',label:'Peak 5-min Rain',unit:'in',icon:'⛈',impact:highRain.impact,n:highRain.n,group:'Weather'},
      {key:'wmax',label:'Max Wind Gust',unit:'mph',icon:'💨',impact:windHeavy.impact?-windHeavy.impact:null,n:windHeavy.n,group:'Weather'},
      {key:'wspd',label:'Avg Wind Speed',unit:'mph',icon:'💨',impact:windSpd.impact?-windSpd.impact:null,n:windSpd.n,group:'Weather'},
      {key:'tmax_hot',label:'High Heat (>95°F)',unit:'°F',icon:'🌡',impact:hotD.length>3&&mildD.length>3?(hotD.reduce(function(s,p){return s+p.sales;},0)/hotD.length-mildD.reduce(function(s,p){return s+p.sales;},0)/mildD.length)/(mildD.reduce(function(s,p){return s+p.sales;},0)/mildD.length):null,n:hotD.length,group:'Weather'},
      {key:'tmax_cold',label:'Cold Days (<40°F)',unit:'°F',icon:'🌨',impact:coldD.length>3&&mildD.length>3?(coldD.reduce(function(s,p){return s+p.sales;},0)/coldD.length-mildD.reduce(function(s,p){return s+p.sales;},0)/mildD.length)/(mildD.reduce(function(s,p){return s+p.sales;},0)/mildD.length):null,n:coldD.length,group:'Weather'},
      {key:'mslp',label:'High Pressure',unit:'mb',icon:'📊',impact:pressure.impact,n:pressure.n,group:'Weather'},
    ].filter(function(v){return v.impact!=null&&v.n>=5;})
  };
}
// ── Ops metric correlations (TPPH, DT Parked%, OEPE vs sales) ────────────
function liOpsCorr(loc,ds){
  var result={variables:[]};
  var labMap={};
  (ds.laborRows||[]).filter(function(r){return r.loc===loc&&r.sales>0;}).forEach(function(r){labMap[dKey(r.date)]=r;});
  var ctrl=(ds.ctrlRows||[]).filter(function(r){return r.loc===loc;});
  var ops=(ds.opsRows||[]).filter(function(r){return r.loc===loc;});
  // TPPH (higher=better → positive correlation with sales)
  var tpphPairs=ctrl.filter(function(r){return r.tpph>0&&labMap[dKey(r.date)];}).map(function(r){return{x:r.tpph,s:labMap[dKey(r.date)].sales};});
  if(tpphPairs.length>=20){
    var med=tpphPairs.map(function(p){return p.x;}).sort(function(a,b){return a-b;})[Math.floor(tpphPairs.length/2)];
    var hi=tpphPairs.filter(function(p){return p.x>=med;}),lo=tpphPairs.filter(function(p){return p.x<med;});
    var avg=function(a){return a.reduce(function(s,p){return s+p.s;},0)/a.length;};
    var imp=hi.length&&lo.length?(avg(hi)-avg(lo))/avg(lo):null;
    if(imp!=null)result.variables.push({key:'tpph',label:'TPPH (Transactions/Person/Hr)',unit:'trans',icon:'⚡',impact:imp,n:tpphPairs.length,group:'Operations',positiveIsGood:true});
  }
  // DT Parked % (higher=worse → negative correlation)
  var parkPairs=ops.filter(function(r){return r.dtParked!=null&&labMap[dKey(r.date)];}).map(function(r){return{x:r.dtParked,s:labMap[dKey(r.date)].sales};});
  if(parkPairs.length>=20){
    var medP=parkPairs.map(function(p){return p.x;}).sort(function(a,b){return a-b;})[Math.floor(parkPairs.length/2)];
    var hiP=parkPairs.filter(function(p){return p.x>=medP;}),loP=parkPairs.filter(function(p){return p.x<medP;});
    var avgP=function(a){return a.reduce(function(s,p){return s+p.s;},0)/a.length;};
    var impP=hiP.length&&loP.length?(avgP(hiP)-avgP(loP))/avgP(loP):null;
    if(impP!=null)result.variables.push({key:'dtParked',label:'DT Parked %',unit:'%',icon:'🚗',impact:impP,n:parkPairs.length,group:'Operations',positiveIsGood:false,invert:true});
  }
  // OEPE (lower=better → negative correlation)
  var oepePairs=ops.filter(function(r){return r.oepeWoP>0&&labMap[dKey(r.date)];}).map(function(r){return{x:r.oepeWoP,s:labMap[dKey(r.date)].sales};});
  if(oepePairs.length>=20){
    var medO=oepePairs.map(function(p){return p.x;}).sort(function(a,b){return a-b;})[Math.floor(oepePairs.length/2)];
    var hiO=oepePairs.filter(function(p){return p.x>=medO;}),loO=oepePairs.filter(function(p){return p.x<medO;});
    var avgO=function(a){return a.reduce(function(s,p){return s+p.s;},0)/a.length;};
    var impO=hiO.length&&loO.length?(avgO(hiO)-avgO(loO))/avgO(loO):null;
    if(impO!=null)result.variables.push({key:'oepe',label:'OEPE Without Parked (sec)',unit:'s',icon:'⏱',impact:impO,n:oepePairs.length,group:'Operations',positiveIsGood:false,invert:true});
  }
  return result.variables.length?result:null;
}
function liOppCost(loc,ds){
  var rows=(ds.laborRows||[]).filter(function(r){return r.loc===loc&&r.sales>0&&r.oppCostDollar>0;});
  if(rows.length<5)return null;
  var totalOpp=rows.reduce(function(s,r){return s+r.oppCostDollar;},0);
  var totalSales=rows.reduce(function(s,r){return s+r.sales;},0);
  return{totalOpp:totalOpp,totalSales:totalSales,annualized:totalOpp/rows.length*365,pctRev:totalSales>0?totalOpp/totalSales:0,rows:rows.length};
}
function liLaborCoverage(loc,ds){
  var rows=(ds.laborRows||[]).filter(function(r){return r.loc===loc&&r.sales>0&&r.actVsNeed!==0&&r.actVsNeed!=null;});
  if(rows.length<10)return null;
  var under=rows.filter(function(r){return r.actVsNeed<-1;}),ok=rows.filter(function(r){return r.actVsNeed>=-1;});
  var avgUnder=under.length>3?under.reduce(function(s,r){return s+r.sales;},0)/under.length:null;
  var avgOk=ok.length>3?ok.reduce(function(s,r){return s+r.sales;},0)/ok.length:null;
  return{pctUnder:rows.length>0?under.length/rows.length:0,impact:avgUnder&&avgOk?(avgUnder-avgOk)/avgOk:null,avgUnder:avgUnder,avgOk:avgOk,rows:rows.length};
}
function liAvgCheckTrend(loc,ds){
  var rows=(ds.laborRows||[]).filter(function(r){return r.loc===loc&&r.sales>0&&r.avgCheck>0&&r.gc>0;}).sort(function(a,b){return a.date-b.date;});
  if(rows.length<10)return null;
  var r=pearsonR(rows.map(function(r){return r.avgCheck;}),rows.map(function(r){return r.gc;}));
  var recent=rows.slice(-14),older=rows.slice(0,Math.min(14,rows.length));
  var recentAvg=recent.reduce(function(s,r){return s+r.avgCheck;},0)/recent.length;
  var olderAvg=older.reduce(function(s,r){return s+r.avgCheck;},0)/older.length;
  return{r:r,trend:(recentAvg-olderAvg)/olderAvg,recentAvg:recentAvg,olderAvg:olderAvg,rows:rows.length};
}
function liComputeAll(loc,ds,settings){
  if(!ds||!ds.loaded)return null;
  var cut6w=new Date(Date.now()-42*864e5);
  var laborRows=(ds.laborRows||[]).filter(function(r){return r.loc===loc&&r.sales>0;});
  var recent6w=laborRows.filter(function(r){return r.date>cut6w;});
  var avgWeeklySales=recent6w.length>0?recent6w.reduce(function(s,r){return s+r.sales;},0)/6:0;
  var avgDailySales=recent6w.length>0?recent6w.reduce(function(s,r){return s+r.sales;},0)/recent6w.length:0;
  var t=(settings.targets&&settings.targets[loc])||DEFAULT_TARGETS[loc]||{};
  return{loc:loc,name:sName(loc),
    annualSales:avgWeeklySales*52,avgDailySales:avgDailySales,avgWeeklySales:avgWeeklySales,
    oepe:liOEPECorr(loc,ds,settings),weather:liWeatherCorr(loc,ds),opsCorr:liOpsCorr(loc,ds),dow:liDOWPatterns(loc,ds),
    labor:liLaborCoverage(loc,ds),opp:liOppCost(loc,ds),avgCheck:liAvgCheckTrend(loc,ds),
    dataRows:laborRows.length,tgt:t};
}
function liBuildRoadmap(stats){
  if(!stats)return[];
  var opps=[],ann=stats.annualSales||0;
  if(stats.oepe&&stats.oepe.pct!=null&&Math.abs(stats.oepe.pct)>0.01){
    opps.push({cat:'Service Speed',icon:'⏱',metric:'OEPE',
      finding:'Drive-thru speed directly correlates with daily revenue at this location.',
      detail:'OEPE above target on '+stats.oepe.above+' days measured. '+(stats.oepe.pct<0?'Faster service days averaged '+(Math.abs(stats.oepe.pct)*100).toFixed(1)+'% more in sales than slower days.':'Slower service days show '+(Math.abs(stats.oepe.pct)*100).toFixed(1)+'% lower sales vs. on-target days.'),
      action:'Implement structured car-pull discipline and pre-staging during peak windows. Target: under '+stats.oepe.oepeTgt+'s consistently.',
      dollarOpp:Math.abs(stats.oepe.pct)*ann});
  }
  if(stats.opp&&stats.opp.annualized>500){
    opps.push({cat:'Revenue Capture',icon:'💰',metric:'Opportunity Cost',
      finding:'Measurable OEPE-related lost sales are recoverable with consistent service focus.',
      detail:'Avg $'+Math.round(stats.opp.totalOpp/stats.opp.rows).toLocaleString()+'/day in opportunity cost over '+stats.opp.rows+' measured days. Annualized: $'+Math.round(stats.opp.annualized).toLocaleString()+' ('+( stats.opp.pctRev*100).toFixed(1)+'% of revenue).',
      action:'Target OEPE consistently below '+( stats.tgt.tOepe||240)+'s. Prioritize peak-hour service flow and disciplined car-pull protocol.',
      dollarOpp:stats.opp.annualized});
  }
  if(stats.labor&&stats.labor.impact!=null&&Math.abs(stats.labor.impact)>0.02){
    var dolOpp=Math.abs(stats.labor.impact)*stats.labor.pctUnder*ann;
    opps.push({cat:'Staffing',icon:'👥',metric:'Labor Coverage',
      finding:'Understaffed days are statistically linked to lower sales performance.',
      detail:(stats.labor.pctUnder*100).toFixed(0)+'% of days run more than 1 hour under needed labor. '+(stats.labor.impact<0?'Understaffed days average '+(Math.abs(stats.labor.impact)*100).toFixed(1)+'% less in sales vs. adequately-staffed days.':''),
      action:'Review weekly scheduling templates for recurring gaps. Ensure floor management coverage during all peak dayparts.',
      dollarOpp:dolOpp>0?dolOpp:0});
  }
  if(stats.weather&&stats.weather.rainImpact!=null&&Math.abs(stats.weather.rainImpact)>0.02){
    opps.push({cat:'Weather Awareness',icon:'🌧',metric:'Weather Sensitivity',
      finding:'This location shows measurable weather-related sales variance worth planning around.',
      detail:'Rain days average '+(Math.abs(stats.weather.rainImpact)*100).toFixed(1)+'% '+(stats.weather.rainImpact<0?'lower':'higher')+' sales vs. dry days (based on '+stats.weather.rainDays+' rainy days). '+(stats.weather.avgCold?'Cold-weather (<40°F) days also show distinct patterns.':''),
      action:'Build weather-aware scheduling templates. Adjust staffing and product mix prep based on forecast.',
      dollarOpp:Math.abs(stats.weather.rainImpact)*ann*(stats.weather.rainDays/Math.max(1,stats.weather.n))});
  }
  opps.sort(function(a,b){return b.dollarOpp-a.dollarOpp;});
  return opps.slice(0,5);
}
function liGenerateExportHTML(stats,roadmap,aiContent,mode,districtName){
  var name=stats.name||'Location';
  var now=new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});
  var dname=districtName||'MCDOK';
  var fmtD=function(v){return v==null?'—':'$'+Math.round(v).toLocaleString();};
  var fmtP=function(v){return v==null?'—':(v>=0?'+':'')+(v*100).toFixed(1)+'%';};
  var css='*{box-sizing:border-box;margin:0;padding:0}'
    +'body{font-family:-apple-system,Helvetica Neue,Arial,sans-serif;color:#1e293b;background:#fff;font-size:12px}'
    +'.hdr{background:#090e18;color:#fff;padding:20px 28px;display:flex;align-items:center;gap:14px}'
    +'.mark{width:36px;height:36px;background:#f59e0b;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:900;color:#000;flex-shrink:0}'
    +'.brand{font-size:13px;font-weight:800;color:#f59e0b}.meta{font-size:10px;color:#94a3b8;margin-top:2px}'
    +'.rpt-title{font-size:20px;font-weight:800;padding:18px 28px 10px;border-bottom:2px solid #f59e0b;margin-bottom:0}'
    +'.sec{padding:14px 28px;border-bottom:0.5px solid #e2e8f0}'
    +'.sec-title{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#f59e0b;margin-bottom:10px}'
    +'.kpi-row{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:10px}'
    +'.kpi{background:#f8fafc;border:0.5px solid #e2e8f0;border-radius:6px;padding:10px 14px}'
    +'.kpi-lbl{font-size:8px;text-transform:uppercase;letter-spacing:.5px;color:#64748b}'
    +'.kpi-val{font-size:17px;font-weight:700;color:#1e293b;margin-top:3px}.kpi-val.green{color:#10b981}'
    +'.stat{font-size:10px;color:#475569;margin-bottom:5px;line-height:1.5}.stat-lbl{font-weight:700;color:#334155}'
    +'.opp{display:flex;gap:10px;margin-bottom:12px;align-items:flex-start;padding:10px;background:#f8fafc;border-radius:6px;border:0.5px solid #e2e8f0}'
    +'.opp-rank{width:24px;height:24px;border-radius:50%;background:#f59e0b;color:#000;font-weight:900;font-size:11px;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px}'
    +'.opp-cat{font-size:8px;text-transform:uppercase;letter-spacing:.5px;color:#64748b;margin-bottom:2px}'
    +'.opp-title{font-weight:700;font-size:11px;color:#1e293b;margin-bottom:2px}'
    +'.opp-dollar{font-size:14px;font-weight:800;color:#10b981;margin:2px 0}'
    +'.opp-detail{font-size:9px;color:#475569;line-height:1.4;margin-bottom:3px}.opp-action{font-size:9px;color:#1e40af;line-height:1.4}'
    +'.corr-row{display:flex;justify-content:space-between;align-items:flex-start;padding:8px 0;border-bottom:0.5px solid #f1f5f9;gap:12px}'
    +'.corr-label{font-size:11px;font-weight:700;color:#1e293b;margin-bottom:2px}'
    +'.corr-detail{font-size:9px;color:#64748b;line-height:1.4}'
    +'.corr-val{font-size:11px;font-weight:700;flex-shrink:0;text-align:right}'
    +'.dow-row{display:flex;align-items:center;gap:8px;margin-bottom:4px}'
    +'.dow-lbl{width:28px;font-size:9px;color:#64748b;text-align:right;flex-shrink:0}'
    +'.dow-bar-wrap{flex:1;background:#f1f5f9;border-radius:3px;height:14px;overflow:hidden}'
    +'.dow-bar{height:14px;background:#f59e0b;opacity:.65;border-radius:3px}'
    +'.dow-val{width:72px;font-size:9px;text-align:right;flex-shrink:0;font-weight:700}'
    +'.dow-vs{width:40px;font-size:8px;text-align:right;flex-shrink:0}'
    +'.wx-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}'
    +'.wx-row{display:flex;justify-content:space-between;padding:4px 0;border-bottom:0.5px solid #f1f5f9;font-size:10px}'
    +'.ai-txt{font-size:11px;line-height:1.8;color:#1e293b;white-space:pre-wrap}'
    +'.footer{padding:10px 28px;text-align:center;font-size:8px;color:#94a3b8;border-top:0.5px solid #e2e8f0;margin-top:4px}'
    +'@media print{.hdr{background:#000!important;-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact}'
    +'.dow-bar{background:#f59e0b!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}'
    +'.kpi-row{display:grid!important}}';

  // Performance overview section
  var kpiHTML='<div class="kpi-row">'
    +'<div class="kpi"><div class="kpi-lbl">Est. Annual Revenue</div><div class="kpi-val">'+fmtD(stats.annualSales)+'</div></div>'
    +'<div class="kpi"><div class="kpi-lbl">Avg Daily Sales</div><div class="kpi-val">'+fmtD(stats.avgDailySales)+'</div></div>'
    +'<div class="kpi"><div class="kpi-lbl">Historical Data Points</div><div class="kpi-val">'+stats.dataRows+'</div></div>'
    +'<div class="kpi"><div class="kpi-lbl">Total Opp / Year</div><div class="kpi-val green">'+fmtD(roadmap.reduce(function(s,o){return s+o.dollarOpp;},0))+'</div></div>'
    +'</div>'
    +(stats.oepe?'<div class="stat"><span class="stat-lbl">OEPE Correlation:</span> '+(stats.oepe.r!=null?'r\u2009=\u2009'+stats.oepe.r+' ('+stats.oepe.n+' paired days)':'insufficient data')+(stats.oepe.pct!=null?' \u2014 '+(Math.abs(stats.oepe.pct)*100).toFixed(1)+'% sales variance vs. target adherence.':'')+'</div>':'')
    +(stats.weather?'<div class="stat"><span class="stat-lbl">Weather Impact:</span> Rain days '+(stats.weather.rainImpact!=null?fmtP(stats.weather.rainImpact)+' vs. dry-day average':'insufficient data')+'.</div>':'')
    +(stats.opp?'<div class="stat"><span class="stat-lbl">Opportunity Cost:</span> '+fmtD(stats.opp.annualized)+'/yr annualized ('+(stats.opp.pctRev*100).toFixed(1)+'% of revenue, '+stats.opp.rows+' days).</div>':'');

  // Growth Roadmap
  var oppHTML=roadmap.map(function(o,i){
    return '<div class="opp"><div class="opp-rank">'+(i+1)+'</div><div style="flex:1">'
      +'<div class="opp-cat">'+o.icon+' '+o.cat+' \u2014 '+o.metric+'</div>'
      +'<div class="opp-title">'+o.finding+'</div>'
      +'<div class="opp-dollar">'+fmtD(o.dollarOpp)+'/yr opportunity</div>'
      +'<div class="opp-detail">'+o.detail+'</div>'
      +'<div class="opp-action"><strong>Action:</strong> '+o.action+'</div>'
      +'</div></div>';
  }).join('');

  // Operational Correlations
  var corrHTML='';
  if(stats.oepe){
    var oepeColor=stats.oepe.pct!=null?(Math.abs(stats.oepe.pct)>0.03?'#ef4444':'#64748b'):'#64748b';
    corrHTML+='<div class="corr-row"><div style="flex:1"><div class="corr-label">\u23f1 OEPE \u2192 Sales</div>'
      +'<div class="corr-detail">'+(stats.oepe.pct!=null?(stats.oepe.pct<0?'Faster service days average '+(Math.abs(stats.oepe.pct)*100).toFixed(1)+'% more in sales. Target: '+stats.oepe.oepeTgt+'s.':'Slower days show '+(Math.abs(stats.oepe.pct)*100).toFixed(1)+'% lower sales vs. on-target days.'):'Insufficient paired data.')+'<br><em>'+stats.oepe.n+' paired days analyzed.</em></div>'
      +'</div><div class="corr-val" style="color:'+oepeColor+'">'+(stats.oepe.r!=null?'r\u2009=\u2009'+stats.oepe.r:'—')+'</div></div>';
  }
  if(stats.labor){
    var labColor=stats.labor.impact!=null?(stats.labor.impact<-0.02?'#ef4444':'#10b981'):'#64748b';
    corrHTML+='<div class="corr-row"><div style="flex:1"><div class="corr-label">\uD83D\uDC65 Labor Coverage \u2192 Sales</div>'
      +'<div class="corr-detail">Understaffed days (>1hr under needed): '+(stats.labor.pctUnder*100).toFixed(0)+'% of periods. '+(stats.labor.avgUnder&&stats.labor.avgOk?'Understaffed avg: '+fmtD(stats.labor.avgUnder)+' vs. adequate: '+fmtD(stats.labor.avgOk)+'.':'')+'</div>'
      +'</div><div class="corr-val" style="color:'+labColor+'">'+(stats.labor.impact!=null?fmtP(stats.labor.impact):'—')+'</div></div>';
  }
  if(stats.opp){
    corrHTML+='<div class="corr-row"><div style="flex:1"><div class="corr-label">\uD83D\uDCB0 Opportunity Cost</div>'
      +'<div class="corr-detail">Avg $'+Math.round(stats.opp.totalOpp/stats.opp.rows).toLocaleString()+'/day over '+stats.opp.rows+' days. '+(stats.opp.pctRev*100).toFixed(1)+'% of revenue.</div>'
      +'</div><div class="corr-val" style="color:#f59e0b">'+fmtD(stats.opp.annualized)+'/yr</div></div>';
  }
  if(stats.avgCheck){
    var acColor=stats.avgCheck.trend!=null?(stats.avgCheck.trend>0.01?'#10b981':stats.avgCheck.trend<-0.01?'#ef4444':'#64748b'):'#64748b';
    corrHTML+='<div class="corr-row"><div style="flex:1"><div class="corr-label">\uD83D\uDCB3 Avg Check Trend</div>'
      +'<div class="corr-detail">Recent avg: $'+(stats.avgCheck.recentAvg||0).toFixed(2)+' vs. older: $'+(stats.avgCheck.olderAvg||0).toFixed(2)+'. Check\u2194GC correlation: r\u2009=\u2009'+(stats.avgCheck.r||'—')+'.</div>'
      +'</div><div class="corr-val" style="color:'+acColor+'">'+(stats.avgCheck.trend!=null?fmtP(stats.avgCheck.trend)+' recent':'—')+'</div></div>';
  }

  // Day-of-Week patterns
  var dowHTML='';
  if(stats.dow){
    var DAYS=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    var grand=stats.dow.grand||1;
    dowHTML='<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 24px">';
    stats.dow.avgs.forEach(function(avg,i){
      if(!avg)return;
      var bar=Math.min(100,avg/grand*100);
      var vsG=(avg-grand)/grand;
      var vc=vsG>0.02?'color:#10b981':vsG<-0.02?'color:#ef4444':'color:#94a3b8';
      dowHTML+='<div class="dow-row">'
        +'<div class="dow-lbl">'+DAYS[i]+'</div>'
        +'<div class="dow-bar-wrap"><div class="dow-bar" style="width:'+bar.toFixed(1)+'%"></div></div>'
        +'<div class="dow-val">'+fmtD(avg)+'</div>'
        +'<div class="dow-vs" style="'+vc+'">'+(vsG>=0?'+':'')+(vsG*100).toFixed(0)+'%</div>'
        +'</div>';
    });
    dowHTML+='</div>';
  }

  // Weather
  var wxHTML='';
  if(stats.weather){
    wxHTML='<div class="wx-grid"><div><div style="font-weight:700;font-size:10px;margin-bottom:6px">Precipitation</div>'
      +(stats.weather.avgDry?'<div class="wx-row"><span>\u2600\ufe0f Dry days ('+stats.weather.dryDays+')</span><span>'+fmtD(stats.weather.avgDry)+'</span></div>':'')
      +(stats.weather.avgRain?'<div class="wx-row"><span>\uD83C\uDF27 Rain days ('+stats.weather.rainDays+')</span><span>'+fmtD(stats.weather.avgRain)+'</span></div>':'')
      +(stats.weather.rainImpact?'<div style="font-size:9px;color:#64748b;margin-top:4px">Impact: '+fmtP(stats.weather.rainImpact)+' vs. dry</div>':'')
      +'</div><div><div style="font-weight:700;font-size:10px;margin-bottom:6px">Temperature Bands</div>'
      +(stats.weather.avgCold?'<div class="wx-row"><span>\uD83E\uDD76 Cold (<40\u00b0F)</span><span>'+fmtD(stats.weather.avgCold)+'</span></div>':'')
      +(stats.weather.avgMild?'<div class="wx-row"><span>\uD83D\uDE0A Mild (40-95\u00b0F)</span><span>'+fmtD(stats.weather.avgMild)+'</span></div>':'')
      +(stats.weather.avgHot?'<div class="wx-row"><span>\uD83E\uDD75 Hot (>95\u00b0F)</span><span>'+fmtD(stats.weather.avgHot)+'</span></div>':'')
      +'</div></div>';
  }

  return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Location Intelligence \u2014 '+name+'</title>'
    +'<style>'+css+'</style></head><body>'
    +'<div class="hdr"><div class="mark">M</div><div><div class="brand">Meridian</div><div class="meta">'+dname+' \u00b7 Generated '+now+'</div></div></div>'
    +'<div class="rpt-title">\uD83D\uDCCA Location Intelligence Report \u2014 '+name+'</div>'
    +'<div class="sec"><div class="sec-title">Performance Overview</div>'+kpiHTML+'</div>'
    +'<div class="sec"><div class="sec-title">\uD83D\uDCB0 Growth Roadmap \u2014 Ranked Opportunities</div>'
    +(oppHTML||'<div style="color:#94a3b8;font-size:11px">Insufficient data. Load at least 6 weeks of operations data.</div>')+'</div>'
    +(corrHTML?'<div class="sec"><div class="sec-title">\uD83D\uDCC8 Operational Correlations</div>'+corrHTML+'</div>':'')
    +(dowHTML?'<div class="sec"><div class="sec-title">\uD83D\uDCC5 Day-of-Week Sales Patterns</div>'+dowHTML+'</div>':'')
    +(wxHTML?'<div class="sec"><div class="sec-title">\uD83C\uDF26 Weather Impact Analysis</div>'+wxHTML+'</div>':'')
    +(mode==='ai'&&aiContent?'<div class="sec"><div class="sec-title">\uD83E\uDD16 AI Intelligence Brief</div><div class="ai-txt">'+aiContent+'</div></div>':'')
    +'<div class="footer">Meridian \u00b7 Location Intelligence \u00b7 '+now+' \u00b7 Confidential \u2014 For internal use only</div>'
    +'</body></html>';
}
async function liGenerateAI(stats,roadmap,onUpdate){
  var truncStats={location:stats.name,estimatedAnnualRevenue:stats.annualSales,dataPoints:stats.dataRows,
    oepeCorrelation:stats.oepe?{pearsonR:stats.oepe.r,salesVariancePct:stats.oepe.pct,daysAboveTarget:stats.oepe.above,target:stats.oepe.oepeTgt}:null,
    weatherSensitivity:stats.weather?{rainImpactPct:stats.weather.rainImpact,rainDaysMeasured:stats.weather.rainDays}:null,
    laborCoverageImpact:stats.labor?{pctDaysUnderstaffed:stats.labor.pctUnder,salesImpactPct:stats.labor.impact}:null,
    annualizedOppCost:stats.opp?stats.opp.annualized:null,
    topOpportunities:roadmap.slice(0,3).map(function(o){return{category:o.cat,dollarOpp:Math.round(o.dollarOpp),action:o.action};})};
  var prompt="You are a senior McDonald's operations consultant with 30+ years of experience, advising a district manager. Write a Location Intelligence Report for "+stats.name+" in natural, conversational language.\n\nDATA:\n"+JSON.stringify(truncStats,null,2)+"\n\nFORMAT:\n**Executive Summary** (2-3 sentences: where this location stands, one key strength, one key opportunity)\n\n**What's Driving Performance** (3-4 bullets, each tied to a specific number from the data, lead with positives)\n\n**Top Growth Opportunities** (rank top 3 by dollar impact; for each: what the data shows, why it matters, specific action, estimated annual opportunity in dollars)\n\n**90-Day Focus** (single most impactful action, what to measure weekly, what success looks like)\n\nRequirements: Sound like a knowledgeable colleague briefing a peer. Every claim must reference a specific number. Frame opportunities positively. Use dollar amounts not just percentages.";
  try{
    var resp=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:1200,messages:[{role:'user',content:prompt}]})});
    var d=await resp.json();
    var text=(d.content&&d.content.map(function(c){return c.text||'';}).join(''))||'';
    onUpdate(text);
  }catch(e){onUpdate('Error generating AI narrative: '+e.message);}
}
function LocationIntelligence({store,allStores,ds,settings,scope,onClose}){
  var [mode,setMode]=React.useState('statistical');
  var [activeLevel,setActiveLevel]=React.useState(scope||'store');
  var [selLoc,setSelLoc]=React.useState(store?store.loc:(allStores&&allStores[0]&&allStores[0].loc)||'');
  var [aiContent,setAiContent]=React.useState('');
  var [generating,setGenerating]=React.useState(false);
  var [expandedStore,setExpandedStore]=React.useState(null);
  var locs=React.useMemo(function(){return(allStores||[]).filter(function(s){return/^\d+$/.test(s.loc);}).map(function(s){return s.loc;});},
    [allStores]);
  var stats=React.useMemo(function(){
    if(!ds||!ds.loaded)return null;
    if(activeLevel==='store'&&selLoc)return liComputeAll(selLoc,ds,settings);
    var all=locs.map(function(l){return liComputeAll(l,ds,settings);}).filter(Boolean);
    if(!all.length)return null;
    return{loc:'ROLLUP',name:activeLevel==='district'?'District Overview':'Roll-Up View',
      annualSales:all.reduce(function(s,r){return s+(r.annualSales||0);},0),
      avgDailySales:all.reduce(function(s,r){return s+(r.avgDailySales||0);},0)/all.length,
      avgWeeklySales:all.reduce(function(s,r){return s+(r.avgWeeklySales||0);},0),
      dataRows:all.reduce(function(s,r){return s+(r.dataRows||0);},0),
      stores:all,tgt:{}};
  },[ds,settings,activeLevel,selLoc,locs.join(',')]);
  var roadmap=React.useMemo(function(){
    if(!stats||!ds||!ds.loaded)return[];
    if(activeLevel==='store')return liBuildRoadmap(stats);
    var all=(stats.stores||[]).map(function(s){return liBuildRoadmap(s);}).reduce(function(a,b){return a.concat(b);},[]);
    all.sort(function(a,b){return b.dollarOpp-a.dollarOpp;});
    return all.slice(0,5);
  },[stats,activeLevel,ds]);
  var handleGenAI=async function(){
    if(!stats)return;
    // AI API calls are blocked by browser security when running from file:// protocol
    if(window.location.protocol==='file:'){
      setAiContent('AI Narrative is unavailable when running from a local file.\n\nBrowser security blocks API calls from the file:// protocol.\n\nTo enable AI Narrative:\n1. Serve the file through a local web server, OR\n2. Use the Statistical mode above — it contains the same underlying analysis without requiring an internet connection.\n\nYour Growth Roadmap and Operational Correlations below are complete and fully data-driven.');
      return;
    }
    setGenerating(true);setAiContent('');
    await liGenerateAI(stats,roadmap,function(txt){setAiContent(txt);setGenerating(false);});
  };
  var handlePrint=function(){
    if(!stats)return;
    var html=liGenerateExportHTML(stats,roadmap,aiContent,mode,settings.districtName);
    var w=window.open('','_blank');
    if(w){w.document.write(html);w.document.close();w.focus();setTimeout(function(){w.print();},600);}
  };
  var handleDownload=function(){
    if(!stats)return;
    var html=liGenerateExportHTML(stats,roadmap,aiContent,mode,settings.districtName);
    var blob=new Blob([html],{type:'text/html'});
    var url=URL.createObjectURL(blob);
    var a=document.createElement('a');
    a.href=url;a.download='McForecast_LI_'+(stats.name||'report').replace(/[^a-z0-9]/gi,'_')+'_'+new Date().toISOString().slice(0,10)+'.html';
    document.body.appendChild(a);a.click();
    setTimeout(function(){URL.revokeObjectURL(url);document.body.removeChild(a);},1000);
  };
  var noData=!ds||!ds.loaded;
  var fmtD=function(v){return v==null?'—':'$'+Math.round(v).toLocaleString();};
  var fmtPct=function(v){return v==null?'—':(v>=0?'+':'')+(v*100).toFixed(1)+'%';};
  var mapeC=function(v){return v==null?'var(--text3)':Math.abs(v)<0.25?'#10b981':Math.abs(v)<0.5?'#f59e0b':'#ef4444';};
  var S={
    sec:{marginBottom:16,background:'var(--surf2)',borderRadius:'var(--rl)',border:'.5px solid var(--bdr)',overflow:'hidden'},
    secHdr:{padding:'9px 14px',borderBottom:'.5px solid var(--bdr)',fontSize:'9px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.8px',color:'var(--amber)'},
    secBody:{padding:'12px 14px'},
    kpiRow:{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:4},
    kpiBox:{background:'var(--surf3)',borderRadius:'var(--r)',padding:'10px 12px',border:'.5px solid var(--bdr)'},
    kpiLbl:{fontSize:'8px',textTransform:'uppercase',letterSpacing:'.5px',color:'var(--text3)',marginBottom:3},
    kpiVal:{fontSize:'17px',fontWeight:700,fontFamily:'var(--mono)'},
    oppRow:{display:'flex',gap:10,marginBottom:14,alignItems:'flex-start'},
    oppRank:{width:24,height:24,borderRadius:'50%',background:'var(--amber)',color:'#000',fontWeight:900,fontSize:12,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,marginTop:2},
    oppDollar:{fontSize:'14px',fontWeight:800,color:'#10b981',margin:'3px 0'},
    oppDetail:{fontSize:'10px',color:'var(--text2)',lineHeight:1.5,marginBottom:3},
    oppAction:{fontSize:'10px',color:'#818cf8',lineHeight:1.4},
    findRow:{display:'flex',justifyContent:'space-between',alignItems:'flex-start',padding:'8px 0',borderBottom:'.5px solid rgba(255,255,255,.04)',gap:12},
  };
  return div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.82)',zIndex:460,display:'flex',flexDirection:'column',paddingTop:24}},
    div({style:{flex:'0 0 24px',cursor:'pointer'},onClick:onClose}),
    div({style:{flex:1,background:'var(--surf)',display:'flex',flexDirection:'column',overflow:'hidden',maxWidth:1200,margin:'0 auto',width:'calc(100% - 32px)',borderRadius:'var(--rl) var(--rl) 0 0',boxShadow:'0 -8px 40px rgba(0,0,0,.4)'}},
      // HEADER
      div({style:{padding:'11px 18px',borderBottom:'.5px solid var(--bdr)',display:'flex',alignItems:'center',gap:8,flexShrink:0,background:'var(--surf2)',flexWrap:'wrap'}},
        div({style:{fontSize:'13px',fontWeight:800,color:'var(--amber)',flexShrink:0}},'📊 Location Intelligence'),
        div({style:{display:'flex',gap:2}},
          [['store','Store'],['district','District']].map(function(pair){
            return btn({key:pair[0],className:'btn btn-sm'+(activeLevel===pair[0]?' btn-a':''),style:{fontSize:'9px'},onClick:function(){setActiveLevel(pair[0]);}},pair[1]);
          })
        ),
        activeLevel==='store'&&h('select',{value:selLoc,onChange:function(e){setSelLoc(e.target.value);},
          style:{background:'var(--surf3)',border:'.5px solid var(--bdr)',borderRadius:'var(--r)',color:'var(--text)',fontSize:'10px',padding:'3px 6px',maxWidth:180}},
          locs.map(function(l){return h('option',{key:l,value:l},sNameC(l));})
        ),
        div({style:{display:'flex',gap:0,border:'.5px solid var(--bdr)',borderRadius:'var(--r)',overflow:'hidden',marginLeft:'auto'}},
          [['statistical','📊 Statistical'],['ai','🤖 AI Narrative']].map(function(pair){
            return btn({key:pair[0],onClick:function(){setMode(pair[0]);},style:{padding:'4px 11px',fontSize:'9px',fontWeight:600,border:'none',
              background:mode===pair[0]?'var(--amber)':'var(--surf)',color:mode===pair[0]?'#000':'var(--text3)',cursor:'pointer'}},pair[1]);
          })
        ),
        mode==='ai'&&btn({className:'btn btn-sm btn-a',style:{fontSize:'9px'},onClick:handleGenAI,disabled:generating||noData},generating?'⏳ Generating…':'⚡ Generate'),
        btn({className:'btn btn-sm',style:{fontSize:'9px'},onClick:handlePrint,title:'Print / Save as PDF'},'🖨 Print'),
        btn({className:'btn btn-sm',style:{fontSize:'9px'},onClick:handleDownload,title:'Download HTML report'},'⬇ Download'),
        btn({className:'btn btn-sm',onClick:onClose},'✕')
      ),
      // BODY
      div({style:{flex:1,overflowY:'auto',padding:18}},
        noData&&div({style:{textAlign:'center',padding:60,color:'var(--text3)'}},
          div({style:{fontSize:40,marginBottom:12}},'📊'),
          div({style:{fontSize:'13px',fontWeight:700,color:'var(--text)',marginBottom:8}},'Load your data to generate Location Intelligence'),
          div({style:{fontSize:'10px',lineHeight:1.8,color:'var(--text3)'}},
            'Required: Operations Report + Labor Analysis.',
            div(null,'Optional (enriches analysis): Weather data, Register Audit, Voice/CSAT.'))
        ),
        !noData&&mode==='ai'&&div(null,
          !aiContent&&!generating&&div({style:{padding:40,textAlign:'center',color:'var(--text3)',fontSize:'11px'}},'Click ⚡ Generate to create an AI-powered narrative for this location.'),
          generating&&div({style:{padding:40,textAlign:'center'}},
            div({style:{fontSize:'12px',color:'var(--amber)',fontWeight:600}},'⏳ Generating intelligence narrative…'),
            div({style:{fontSize:'10px',color:'var(--text3)',marginTop:8}},'Analyzing historical patterns and building your roadmap. Usually 15-30 seconds.')),
          aiContent&&div({style:S.sec},
            div({style:S.secHdr},'🤖 AI-Generated Intelligence Brief'),
            div({style:{padding:'14px 16px',whiteSpace:'pre-wrap',fontSize:'12px',lineHeight:1.85,color:'var(--text)'}},aiContent)
          ),
          aiContent&&stats&&roadmap.length>0&&div({style:{...S.sec,marginTop:12}},
            div({style:S.secHdr},'💰 Statistical Backing — Growth Roadmap'),
            div({style:S.secBody},roadmap.map(function(o,i){
              return div({key:i,style:S.oppRow},
                div({style:S.oppRank},i+1),
                div({style:{flex:1}},
                  div({style:{fontSize:'9px',textTransform:'uppercase',letterSpacing:'.5px',color:'var(--text3)',marginBottom:2}},o.icon+' '+o.cat+' — '+o.metric),
                  div({style:{fontSize:'11px',fontWeight:700,color:'var(--text)',marginBottom:2}},o.finding),
                  div({style:S.oppDollar},fmtD(o.dollarOpp)+'/yr opportunity'),
                  div({style:S.oppDetail},o.detail),
                  div({style:S.oppAction},'▶ '+o.action)
                )
              );
            }))
          )
        ),
        !noData&&mode==='statistical'&&stats&&(function(){
          var isRollUp=activeLevel!=='store';
          return div(null,
            // KPI summary
            div({style:S.sec},
              div({style:S.secHdr},'Performance Overview — '+(stats.name||'')),
              div({style:S.secBody},
                div({style:S.kpiRow},
                  [{l:'Est. Annual Revenue',v:fmtD(stats.annualSales),s:'based on 6W avg',c:'var(--text)'},{l:'Avg Daily Sales',v:fmtD(stats.avgDailySales),s:'recent 6 weeks',c:'var(--text)'},{l:'Historical Data Points',v:(stats.dataRows||0).toLocaleString(),s:'records loaded',c:'var(--text)'},{l:'Total Opp / Year',v:fmtD(roadmap.reduce(function(s,o){return s+o.dollarOpp;},0)),s:'identified opportunities',c:'#10b981'}]
                  .map(function(k,i){return div({key:i,style:S.kpiBox},div({style:S.kpiLbl},k.l),div({style:{...S.kpiVal,color:k.c}},k.v),div({style:{fontSize:'8px',color:'var(--text3)',marginTop:2}},k.s));})
                )
              )
            ),
            // Growth roadmap
            roadmap.length>0&&div({style:S.sec},
              div({style:S.secHdr},'💰 Growth Roadmap — Ranked by Dollar Opportunity'),
              div({style:S.secBody},roadmap.map(function(o,i){
                return div({key:i,style:S.oppRow},
                  div({style:S.oppRank},i+1),
                  div({style:{flex:1}},
                    div({style:{fontSize:'9px',textTransform:'uppercase',letterSpacing:'.5px',color:'var(--text3)',marginBottom:2}},o.icon+' '+o.cat+' — '+o.metric),
                    div({style:{fontSize:'11px',fontWeight:700,color:'var(--text)',marginBottom:2}},o.finding),
                    div({style:S.oppDollar},fmtD(o.dollarOpp)+'/yr opportunity'),
                    div({style:S.oppDetail},o.detail),
                    div({style:S.oppAction},'▶ '+o.action)
                  )
                );
              }))
            ),
            // Operational correlations
            div({style:S.sec},
              div({style:S.secHdr},'📈 Operational Correlations'),
              div({style:S.secBody},
                [stats.oepe&&{label:'OEPE → Sales',icon:'⏱',val:stats.oepe.r!=null?'r = '+stats.oepe.r:'—',
                    detail:stats.oepe.pct!=null?(stats.oepe.pct<0?'Faster service days average '+(Math.abs(stats.oepe.pct)*100).toFixed(1)+'% more in sales. Target: '+stats.oepe.oepeTgt+'s.':'Slower days show '+(Math.abs(stats.oepe.pct)*100).toFixed(1)+'% lower sales vs. on-target days. Target: '+stats.oepe.oepeTgt+'s.'):'Insufficient paired OEPE + sales data.',
                    sub:(stats.oepe.n||0)+' paired days | '+stats.oepe.above+' above target / '+stats.oepe.at+' at/below',
                    c:stats.oepe.r!=null?mapeC(Math.abs(stats.oepe.r)-0.25):'var(--text3)'},
                  stats.labor&&{label:'Labor Coverage → Sales',icon:'👥',val:stats.labor.impact!=null?fmtPct(stats.labor.impact):'—',
                    detail:'Understaffed days (>1hr under needed): '+(stats.labor.pctUnder*100).toFixed(0)+'% of periods. '+(stats.labor.avgUnder&&stats.labor.avgOk?'Understaffed avg: '+fmtD(stats.labor.avgUnder)+' vs. adequate: '+fmtD(stats.labor.avgOk)+'.':''),
                    sub:(stats.labor.rows||0)+' days with act-vs-need data',
                    c:stats.labor.impact!=null?(stats.labor.impact<-0.02?'#ef4444':'#10b981'):'var(--text3)'},
                  stats.opp&&{label:'Opportunity Cost',icon:'💰',val:fmtD(stats.opp.annualized)+'/yr',
                    detail:'Avg $'+Math.round(stats.opp.totalOpp/stats.opp.rows).toLocaleString()+'/day captured over '+stats.opp.rows+' days. '+(stats.opp.pctRev*100).toFixed(1)+'% of revenue.',
                    sub:'Source: Opportunity Cost $ field in operations data',c:'#f59e0b'},
                  stats.avgCheck&&{label:'Avg Check Trend',icon:'💳',val:stats.avgCheck.trend!=null?fmtPct(stats.avgCheck.trend)+' recent':'—',
                    detail:'Check↔GC correlation: r = '+(stats.avgCheck.r||'—')+'. Recent avg: $'+(stats.avgCheck.recentAvg||0).toFixed(2)+' vs. older: $'+(stats.avgCheck.olderAvg||0).toFixed(2)+'.',
                    sub:(stats.avgCheck.rows||0)+' days analyzed',
                    c:stats.avgCheck.trend!=null?(stats.avgCheck.trend>0.01?'#10b981':stats.avgCheck.trend<-0.01?'#ef4444':'var(--text3)'):'var(--text3)'},
                ].filter(Boolean).map(function(c,i){
                  return div({key:i,style:{...S.findRow,padding:'10px 0'}},
                    div({style:{flex:1}},
                      div({style:{fontSize:'11px',fontWeight:700,color:'var(--text)',marginBottom:2}},c.icon+' '+c.label),
                      div({style:{fontSize:'10px',color:'var(--text2)',lineHeight:1.5}},c.detail),
                      div({style:{fontSize:'8px',color:'var(--text3)',marginTop:3}},c.sub)
                    ),
                    div({style:{fontFamily:'var(--mono)',fontSize:'11px',fontWeight:700,textAlign:'right',flexShrink:0,color:c.c}},c.val)
                  );
                })
              )
            ),
            // Day-of-week
            stats.dow&&div({style:S.sec},
              div({style:S.secHdr},'📅 Day-of-Week Sales Patterns'),
              div({style:{padding:'10px 14px'}},
                div({style:{display:'flex',flexDirection:'column',gap:5}},
                  stats.dow.days.map(function(d,i){
                    var avg=stats.dow.avgs[i],grand=stats.dow.grand||1;
                    if(!avg)return null;
                    var barPct=Math.min(100,avg/grand*100),vsG=(avg-grand)/grand;
                    return div({key:d,style:{display:'flex',alignItems:'center',gap:8}},
                      div({style:{width:28,fontSize:'9px',color:'var(--text2)',flexShrink:0,textAlign:'right'}},d),
                      div({style:{flex:1,background:'rgba(255,255,255,.06)',borderRadius:3,height:16,position:'relative',overflow:'hidden'}},
                        div({style:{position:'absolute',left:0,top:0,bottom:0,width:barPct+'%',background:'var(--amber)',opacity:.65,borderRadius:3}})
                      ),
                      div({style:{width:76,fontFamily:'var(--mono)',fontSize:'10px',textAlign:'right',flexShrink:0}},fmtD(avg)),
                      div({style:{width:44,fontSize:'9px',textAlign:'right',flexShrink:0,color:vsG>0.02?'#10b981':vsG<-0.02?'#ef4444':'var(--text3)'}},
                        (vsG>=0?'+':''+(vsG*100).toFixed(0)+'%'))
                    );
                  })
                )
              )
            ),
            // Weather
            stats.weather&&div({style:S.sec},
              div({style:S.secHdr},'🌦 Weather Impact Analysis'),
              div({style:{padding:'10px 14px'}},
                div({style:{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:16}},
                  div(null,
                    div({style:{fontSize:'10px',fontWeight:700,color:'var(--text)',marginBottom:8}},'Precipitation'),
                    div({style:S.findRow},div(null,'☀ Dry days ('+stats.weather.dryDays+')'),div({style:{fontFamily:'var(--mono)',fontSize:'10px'}},fmtD(stats.weather.avgDry))),
                    div({style:S.findRow},div(null,'🌧 Rain days ('+stats.weather.rainDays+')'),div({style:{fontFamily:'var(--mono)',fontSize:'10px',color:stats.weather.rainImpact<-0.02?'#ef4444':stats.weather.rainImpact>0.02?'#10b981':'var(--text)'}},fmtD(stats.weather.avgRain))),
                    stats.weather.rainImpact&&div({style:{marginTop:6,fontSize:'10px',color:'var(--text2)'}},'Rain impact: '+(stats.weather.rainImpact>=0?'+':'')+(stats.weather.rainImpact*100).toFixed(1)+'% vs. dry days')
                  ),
                  div(null,
                    div({style:{fontSize:'10px',fontWeight:700,color:'var(--text)',marginBottom:8}},'Temperature Bands'),
                    stats.weather.avgCold&&div({style:S.findRow},div(null,'🥶 Cold (<40°F)'),div({style:{fontFamily:'var(--mono)',fontSize:'10px'}},fmtD(stats.weather.avgCold))),
                    stats.weather.avgMild&&div({style:S.findRow},div(null,'😊 Mild (40-95°F)'),div({style:{fontFamily:'var(--mono)',fontSize:'10px'}},fmtD(stats.weather.avgMild))),
                    stats.weather.avgHot&&div({style:S.findRow},div(null,'🥵 Hot (>95°F)'),div({style:{fontFamily:'var(--mono)',fontSize:'10px'}},fmtD(stats.weather.avgHot)))
                  )
                )
              )
            ),
            // Roll-up store list
            isRollUp&&stats.stores&&stats.stores.length>0&&div({style:S.sec},
              div({style:S.secHdr},'Store-by-Store Breakdown'),
              div({style:{maxHeight:380,overflowY:'auto'}},
                stats.stores.map(function(s){
                  var sR=liBuildRoadmap(s),top=sR[0],isExp=expandedStore===s.loc;
                  return div({key:s.loc},
                    div({style:{padding:'9px 14px',borderBottom:'.5px solid rgba(255,255,255,.04)',cursor:'pointer',display:'flex',alignItems:'center',gap:10,background:isExp?'var(--adim)':'transparent'},
                      onClick:function(){setExpandedStore(isExp?null:s.loc);}},
                      div({style:{fontSize:'11px',fontWeight:600,flex:1}},s.name),
                      div({style:{fontSize:'10px',color:'var(--text3)'}},fmtD(s.annualSales)+' ann.'),
                      top&&div({style:{fontSize:'9px',color:'#10b981',fontWeight:600}},fmtD(top.dollarOpp)+' opp'),
                      div({style:{color:'var(--text3)',fontSize:11}},isExp?'▼':'▶')
                    ),
                    isExp&&div({style:{padding:'10px 14px 14px 28px',background:'rgba(255,255,255,.02)'}},
                      sR.slice(0,2).map(function(o,i){
                        return div({key:i,style:{marginBottom:8}},
                          div({style:{fontSize:'9px',color:'var(--amber)',fontWeight:700}},o.icon+' '+o.cat),
                          div({style:{fontSize:'10px',color:'var(--text)',marginBottom:2}},o.finding),
                          div({style:{fontSize:'9px',color:'#10b981',fontWeight:700}},fmtD(o.dollarOpp)+'/yr'),
                          div({style:{fontSize:'9px',color:'var(--text3)'}},o.action)
                        );
                      })
                    )
                  );
                })
              )
            )
          );
        })()
      )
    )
  );
}

// ── Session Save / Restore ───────────────────────────────────────────
// Serializes the full ds object + all localStorage keys to a single JSON file.
// Dates are stored as ISO strings and reconstructed on import.
function mfExportSession(ds, onMsg) {
  if(!ds||!ds.loaded){if(onMsg)onMsg('⚠ No data loaded to save');return;}
  const ROW_KEYS=['laborRows','opsRows','ctrlRows','fobRows','weatherRows',
    'peaksSvcRows','peaksSalesRows','auditRows','trendsRows'];
  const serR=function(rows){return (rows||[]).map(function(r){return r.date instanceof Date?Object.assign({},r,{date:r.date.toISOString()}):r;});};
  const serLA=function(la){var o={};for(var k in la||{}){var d=la[k];o[k]=d instanceof Date?d.toISOString():d;}return o;};
  var dsExp={storeIds:ds.storeIds,loaded:ds.loaded,records:ds.records,targets:ds.targets,
    lastActual:serLA(ds.lastActual)};
  ROW_KEYS.forEach(function(k){dsExp[k]=serR(ds[k]);});
  var data={_mcf:'session',_ver:'1.0',_ts:new Date().toISOString(),_stores:ds.storeIds.length,
    ds:dsExp,ls:{}};
  var LS_KEYS=['mf_settings','mf_dialed_in','mf_targets_v2','mf_locked_projections','mf_events','mf_backtest_results'];
  var yrKeys=Object.keys(localStorage).filter(function(k){return k.indexOf('mf_targets_yearly_')===0;});
  LS_KEYS.concat(yrKeys).forEach(function(k){var v=localStorage.getItem(k);if(v)data.ls[k]=v;});
  var blob=new Blob([JSON.stringify(data)],{type:'application/json'});
  var url=URL.createObjectURL(blob);
  var a=document.createElement('a');
  var dt=new Date().toISOString().slice(0,10).replace(/-/g,'');
  a.href=url;a.download='McForecast_Session_'+dt+'.json';
  document.body.appendChild(a);a.click();
  setTimeout(function(){URL.revokeObjectURL(url);document.body.removeChild(a);},1000);
  if(onMsg)onMsg('✓ Session saved · '+ds.storeIds.length+' stores · '+(ds.laborRows?ds.laborRows.length:0)+' labor rows');
}

function mfRestoreSession(file, setDs, saveSettings, onMsg) {
  var reader=new FileReader();
  reader.onload=function(e){
    try{
      var data=JSON.parse(e.target.result);
      if(!data||data._mcf!=='session')throw new Error('Not a McForecast session file');
      // Restore localStorage keys first
      var ls=data.ls||{};
      Object.keys(ls).forEach(function(k){try{localStorage.setItem(k,ls[k]);}catch{}});
      // Rebuild ds object
      if(data.ds){
        var ROW_KEYS=['laborRows','opsRows','ctrlRows','fobRows','weatherRows',
          'peaksSvcRows','peaksSalesRows','auditRows','trendsRows'];
        function _bIdx(rows){var idx={};for(var i=0;i<rows.length;i++){var r=rows[i];if(!r.loc||!r.date)continue;var k=r.loc+'_'+dKey(r.date);if(!idx[k])idx[k]=[];idx[k].push(r);}return idx;}
        function _bWxIdx(rows){var idx={};for(var i=0;i<rows.length;i++){var r=rows[i];if(!r.date)continue;var k=dKey(r.date);if(!idx[k])idx[k]=r;}return idx;}
        var rds=Object.assign({},data.ds,{laborIdx:{},opsIdx:{},ctrlIdx:{},weatherIdx:{},wxByDate:{},lastActual:{}});
        for(var loc in data.ds.lastActual||{}){var v=data.ds.lastActual[loc];rds.lastActual[loc]=v?new Date(v):null;}
        ROW_KEYS.forEach(function(k){
          rds[k]=(data.ds[k]||[]).map(function(r){return r.date&&typeof r.date==='string'?Object.assign({},r,{date:new Date(r.date)}):r;});
        });
        rds.laborIdx=_bIdx(rds.laborRows);rds.opsIdx=_bIdx(rds.opsRows);
        rds.ctrlIdx=_bIdx(rds.ctrlRows);rds.weatherIdx=_bIdx(rds.weatherRows);
        rds.laborByLoc=bLocIdx(rds.laborRows);rds.opsByLoc=bLocIdx(rds.opsRows);
        rds.ctrlByLoc=bLocIdx(rds.ctrlRows);rds.darByLoc=bLocIdx(rds.darRows);
        rds.wxByDate=_bWxIdx(rds.weatherRows);
        // Convert dates nested inside ds.records (best/worst day records)
        if(rds.records&&typeof rds.records==='object'){
          Object.keys(rds.records).forEach(function(loc){
            var rec=rds.records[loc];
            if(rec&&typeof rec==='object'){
              Object.keys(rec).forEach(function(k){
                var entry=rec[k];
                if(entry&&typeof entry==='object'&&entry.date&&typeof entry.date==='string'){
                  entry.date=new Date(entry.date);
                }
              });
            }
          });
        }
        try{if(rds.auditRows&&rds.auditRows.length>0)rds.empRisk=analyzeRegisterAudit(rds.auditRows);}catch{}
        setDs(rds);
      }
      // Restore settings — apply dialedIn from mf_dialed_in if present
      if(ls['mf_settings']){
        try{
          var sv=JSON.parse(ls['mf_settings']);
          var mg=Object.assign({},DEF_SETTINGS,sv);
          mg.operators=Object.assign({},DEF_SETTINGS.operators,sv.operators||{});
          mg.supervisorGroups=Object.assign({},DEF_SETTINGS.supervisorGroups,sv.supervisorGroups||{});
          if(ls['mf_dialed_in']){
            var di=JSON.parse(ls['mf_dialed_in']);
            if(di&&Object.keys(di).length>0){mg.dialedIn=Object.assign({},di,mg.dialedIn||{});mg.dialedInEnabled=true;}
          }
          saveSettings(mg);
        }catch{}
      }
      var stCnt=((data.ds&&data.ds.storeIds)||[]).length;
      var lrCnt=((data.ds&&data.ds.laborRows)||[]).length;
      if(onMsg)onMsg('✓ Session restored · '+stCnt+' stores · '+lrCnt+' labor rows');
    }catch(err){if(onMsg)onMsg('⚠ Restore failed: '+err.message);}
  };
  reader.readAsText(file);
}

// SESSION AUTO-SAVE / AUTO-RESTORE  (v175)
// Uses IndexedDB (no size limit) for zero-friction session persistence.
// Saves full ds object automatically after every file load.
// On next startup: non-intrusive banner lets user restore with one click.
// File-based export/import (mfExportSession/mfRestoreSession) still works
// as a portable backup — this layer sits on top.
const _MF_IDB   = 'McForecastPro_Sessions_v1';
const _MF_STORE = 'sessions';
const _MF_KEY   = 'latest';

function _mfOpenDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(_MF_IDB, 1);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(_MF_STORE))
        db.createObjectStore(_MF_STORE);
    };
    req.onsuccess = e => res(e.target.result);
    req.onerror   = e => rej(e.target.error);
    req.onblocked = () => rej(new Error('McForecastPro_Sessions IDB blocked by another open tab.'));
  });
}

// Serialize ds: Date → ISO string, skip rebuilt indices (they're derived)
function _mfSerDS(ds) {
  if (!ds) return null;
  const ROW_KEYS = ['laborRows','opsRows','ctrlRows','fobRows','weatherRows',
                    'peaksSvcRows','peaksSalesRows','auditRows','trendsRows'];
  const serR = rows => (rows||[]).map(r => {
    if (!r) return r;
    const o = {...r};
    if (o.date instanceof Date) o.date = o.date.toISOString();
    return o;
  });
  const serLA = la => {
    const o = {};
    for (const k in la||{}) { const d = la[k]; o[k] = d instanceof Date ? d.toISOString() : d; }
    return o;
  };
  const out = { loaded:ds.loaded, storeIds:ds.storeIds, targets:ds.targets, records:ds.records,
    lastActual: serLA(ds.lastActual) };
  ROW_KEYS.forEach(k => out[k] = serR(ds[k]));
  return out;
}

// Deserialize ds: ISO string → Date, rebuild indices
function _mfDeserDS(raw) {
  if (!raw) return null;
  const ROW_KEYS = ['laborRows','opsRows','ctrlRows','fobRows','weatherRows',
                    'peaksSvcRows','peaksSalesRows','auditRows','trendsRows'];
  function _bIdxL(rows){const idx={};for(const r of rows){if(!r.loc||!r.date)continue;const k=r.loc+'_'+dKey(r.date);if(!idx[k])idx[k]=[];idx[k].push(r);}return idx;}
  function _bWxL(rows){const idx={};for(const r of rows){if(!r.date)continue;idx[dKey(r.date)]=r;}return idx;}
  const rds = {...raw, laborIdx:{}, opsIdx:{}, ctrlIdx:{}, weatherIdx:{}, wxByDate:{}, lastActual:{}};
  // Restore lastActual dates
  for (const loc in raw.lastActual||{}) {
    const v = raw.lastActual[loc];
    rds.lastActual[loc] = v ? new Date(v) : null;
  }
  // Restore row date objects
  ROW_KEYS.forEach(k => {
    rds[k] = (raw[k]||[]).map(r => {
      if (!r) return r;
      const o = {...r};
      if (typeof o.date === 'string') o.date = new Date(o.date);
      return o;
    });
  });
  // Restore records dates
  if (rds.records && typeof rds.records === 'object') {
    Object.keys(rds.records).forEach(loc => {
      const rec = rds.records[loc];
      if (rec && typeof rec === 'object') {
        Object.keys(rec).forEach(k => {
          if (rec[k]?.date && typeof rec[k].date === 'string') rec[k].date = new Date(rec[k].date);
        });
      }
    });
  }
  // Rebuild indices
  rds.laborIdx  = _bIdxL(rds.laborRows);
  rds.opsIdx    = _bIdxL(rds.opsRows);
  rds.ctrlIdx   = _bIdxL(rds.ctrlRows);
  rds.weatherIdx = _bIdxL(rds.weatherRows);
  rds.laborByLoc = bLocIdx(rds.laborRows);
  rds.opsByLoc   = bLocIdx(rds.opsRows);
  rds.ctrlByLoc  = bLocIdx(rds.ctrlRows);
  rds.darByLoc   = bLocIdx(rds.darRows);
  rds.wxByDate   = _bWxL(rds.weatherRows);
  // Rebuild audit analysis if available
  try { if (rds.auditRows?.length) rds.empRisk = analyzeRegisterAudit(rds.auditRows); } catch {}
  return rds;
}

// Compute display metadata from ds
function _mfSessionMeta(ds) {
  const rows = ds.laborRows || [];
  const dates = rows.map(r => r.date).filter(d => d instanceof Date).sort((a,b) => a-b);
  return {
    storeCount:  (ds.storeIds||[]).length,
    laborRows:   rows.length,
    ctrlRows:    (ds.ctrlRows||[]).length,
    opsRows:     (ds.opsRows||[]).length,
    peakRows:    (ds.peakRows||[]).length + (ds.peaksSvcRows||[]).length,
    auditRows:   (ds.auditRows||[]).length,
    trendsRows:  (ds.trendsRows||[]).length,
    earliest:    dates.length ? dKey(dates[0])                       : null,
    latest:      dates.length ? dKey(dates[dates.length-1])          : null,
  };
}

// Auto-save to IndexedDB (called after every file load)
async function mfIDBSave(ds) {
  if (!ds || !ds.loaded) return false;
  try {
    const db   = await _mfOpenDB();
    const data = {
      savedAt: new Date().toISOString(),
      meta:    _mfSessionMeta(ds),
      dsRaw:   _mfSerDS(ds),
      // ls keys (settings, events, etc.) are already persisted by their own handlers
    };
    await new Promise((res, rej) => {
      const tx = db.transaction(_MF_STORE, 'readwrite');
      tx.objectStore(_MF_STORE).put(data, _MF_KEY);
      tx.oncomplete = res;
      tx.onerror    = e => rej(e.target.error);
    });
    db.close();
    return true;
  } catch (e) {
    console.warn('[McForecast] IDB auto-save failed:', e);
    return false;
  }
}

// Load latest session from IndexedDB
async function mfIDBLoad() {
  try {
    const db  = await _mfOpenDB();
    const rec = await new Promise((res, rej) => {
      const tx  = db.transaction(_MF_STORE, 'readonly');
      const req = tx.objectStore(_MF_STORE).get(_MF_KEY);
      req.onsuccess = e => res(e.target.result);
      req.onerror   = e => rej(e.target.error);
    });
    db.close();
    return rec || null;
  } catch (e) {
    console.warn('[McForecast] IDB load failed:', e);
    return null;
  }
}

// Clear session from IndexedDB
async function mfIDBClear() {
  try {
    const db = await _mfOpenDB();
    await new Promise((res, rej) => {
      const tx = db.transaction(_MF_STORE, 'readwrite');
      tx.objectStore(_MF_STORE).delete(_MF_KEY);
      tx.oncomplete = res; tx.onerror = e => rej(e.target.error);
    });
    db.close();
  } catch (e) { console.warn('[McForecast] IDB clear failed:', e); }
}

// ── SessionBanner component ────────────────────────────────────────────────
function SessionBanner({session, onRestore, onDismiss}) {
  const [restoring, setRestoring] = React.useState(false);
  if (!session) return null;
  const { meta, savedAt } = session;
  const ageDays = savedAt ? Math.floor((Date.now() - new Date(savedAt)) / 86400000) : null;
  const ageLabel = ageDays === 0 ? 'today' : ageDays === 1 ? 'yesterday' : ageDays + ' days ago';
  const ageCol = ageDays > 7 ? '#f87171' : ageDays > 3 ? '#f59e0b' : '#34d399';
  const dateLabel = savedAt
    ? new Date(savedAt).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit'})
    : 'Unknown';

  const doRestore = async () => {
    setRestoring(true);
    try { await onRestore(session); } finally { setRestoring(false); }
  };

  return div({style:{
    background:'rgba(52,211,153,.07)', border:'.5px solid rgba(52,211,153,.25)',
    borderRadius:'var(--r)', padding:'10px 14px', marginBottom:8,
    display:'flex', alignItems:'center', gap:10, flexWrap:'wrap',
  }},
    span({style:{fontSize:'16px'}},'📂'),
    div({style:{flex:1}},
      div({style:{fontSize:'11px',fontWeight:700,color:'var(--text)',marginBottom:2}},
        'Session found — ',span({style:{color:ageCol}},ageLabel),
        span({style:{color:'var(--text3)',fontWeight:400}},
          '  ·  Saved '+dateLabel)),
      div({style:{fontSize:'9px',color:'var(--text3)',display:'flex',gap:10,flexWrap:'wrap'}},
        meta?.storeCount&&span(null,meta.storeCount+' stores'),
        meta?.laborRows&&span(null,(meta.laborRows).toLocaleString()+' labor rows'),
        meta?.earliest&&meta?.latest&&span(null,meta.earliest+' → '+meta.latest),
        meta?.peakRows>0&&span(null,meta.peakRows+' peaks rows'),
        meta?.auditRows>0&&span(null,meta.auditRows+' audit rows'),
      )
    ),
    div({style:{display:'flex',gap:6,flexShrink:0}},
      btn({className:'btn btn-sm',
        style:{background:'rgba(52,211,153,.15)',borderColor:'rgba(52,211,153,.4)',
          color:'#34d399',fontWeight:700,padding:'4px 14px'},
        disabled:restoring, onClick:doRestore},
        restoring?'⏳ Restoring…':'✓ Restore Session'),
      btn({className:'btn btn-sm',style:{color:'var(--text3)'},onClick:onDismiss},'Not now')
    )
  );
}
// ── end session system ──────────────────────────────────────────────────────

// ── Meridian version + changelog ─────────────────────────────────────────────
const MERIDIAN_VERSION    = '4.216';
const MERIDIAN_BUILD_DATE = '2026-06-19';
const MERIDIAN_CHANGELOG  = [
  {version:'4.216', date:'2026-06-19', changes:[
    'Fixed the triple-redundant read found while reviewing the restore path: performFullIDBRestore() was reading the same large stores from IndexedDB up to 3 times — once in loadDsFromIDB(), again in idbGetCoverage() just for date ranges, a third time for the weather cache bridge',
    'Added coverageFromLoadedRows() — computes the identical coverage stats from data already in memory, zero additional IndexedDB reads. Weather cache now reuses the already-loaded weather array directly',
    'Net effect: Restore Session now reads your data once instead of up to three times',
  ]},
  {version:'4.215', date:'2026-06-19', changes:[
    'Stopped patching the restore mechanism and fixed the actual design flaw: session restore was automatic and blocking — if it hung for any reason, the app gave you no way to interact with anything, including closing a stuck modal',
    'Session restore is now opt-in. The app loads instantly and empty on every load. A lightweight, hard-timeout-bounded check (count() only, 3-second cap, cannot block the shell no matter what) detects a previous session and shows a dismissible banner — you click Restore Session when ready, instead of it happening automatically before you can do anything else',
    'Added a universal Escape-key handler that closes every modal in the app unconditionally — does not depend on diagnosing why something got stuck, just guarantees a way out',
    'This directly resolves the stuck Dialed-In Comparison modal — that flag (showDICompare) is included in the Escape handler',
    'All prior fixes this session (compute6wk indexing, getModelAssignment caching, AtAGlance/StoreDash/OrgView modal-gating, the IDB schema and race-condition fixes) remain in place — none of that work is lost, this addresses the structural risk sitting on top of it',
  ]},
  {version:'4.214', date:'2026-06-19', changes:[
    'Critical finding: fully quitting Chrome (not just closing tabs) and the freeze STILL happened in the regular profile — that ruled out every stale-tab/blocked-connection theory, since nothing could survive a full quit',
    'Re-examined every Incognito test with that ruled out: Incognito ALWAYS starts with empty IndexedDB, meaning every "fast in Incognito" result was also a "nothing to restore" result — the same confound from the very first extension test, missed a second time',
    'Found the real bug: openIDB() only cached the RESOLVED value, not the in-flight request. loadDsFromIDB() fires 8 idbGetAllRows() calls simultaneously via Promise.all — every one of them called openIDB() before any had resolved, so all 8 independently fired their own indexedDB.open() against the same database instead of sharing one connection',
    'This is a within-tab, within-session bug — explains why it persisted through a full Chrome quit, and why it only manifests with substantial existing data (Incognito\'s always-empty DB has nothing for 8 racing connections to meaningfully contend over)',
    'Fixed: cache the in-flight promise itself, not just the eventual value — every concurrent caller now awaits the same single open() instead of starting 8 redundant ones',
  ]},
  {version:'4.213', date:'2026-06-19', changes:[
    'Different symptom this time: freeze on INITIAL load with zero data loaded — ruled out the AtAGlance fix as the cause, since there was nothing to compute',
    'Found a real gap: openIDB() had no onblocked handler. If another open tab/window holds an older-version connection to MeridianDB, a version-change request just hangs forever — never firing onerror, onsuccess, or onupgradeneeded. No heavy CPU, nothing to catch in a Performance trace — just a promise that never settles',
    'Given how many file versions have been opened back-to-back across this session\'s testing, a stale older-version tab is a very plausible explanation',
    'Fixed: added onblocked to both IndexedDB connections (MeridianDB and the separate McForecastPro_Sessions backup) — now rejects cleanly into the existing try/catch instead of hanging silently',
    'Practical step alongside this fix: close any other open Meridian tabs/windows before reloading, since that\'s the actual trigger condition if this theory is right',
  ]},
  {version:'4.212', date:'2026-06-19', changes:[
    'Found the actual root cause via a Chrome Performance recording (console-level instrumentation had ruled out everything it could see — this needed a real profiler)',
    'AtAGlance — the main dashboard, a 1600-line component — was rendering and fully recomputing every time ANY of 53 separate modal flags opened, even though it was 100% visually hidden behind the full-screen overlay the entire time',
    'Confirmed directly in the profile: AtAGlance\'s own render function was the dominant cost in a 177-second interaction, not Priority Brief, not buildStore, not React itself',
    'Fixed: added a single anyModalOpen check (OR of every modal-visibility flag in App\'s own scope — 7 candidates were excluded after verifying they\'re declared in other components, which would have caused an immediate crash) and gated AtAGlance, StoreDash, and OrgView on it — none of them render while a modal covers them',
    'Tradeoff worth knowing: these views fully unmount while hidden rather than just visually hiding, so local UI state (like scroll position) resets when a modal closes. Worth it given the alternative was multi-minute freezes.',
  ]},
  {version:'4.211', date:'2026-06-19', changes:[
    'Incognito test confirmed the freeze was a Chrome extension — \'message\' handler violation dropped from 174,745ms to 242ms with extensions disabled. That variable is resolved.',
    'Found the real cause of the remaining IDB error: weatherRows was never in IDB_STORES at all — not a stale-version gap like darRows/pmixRows, a flat-out missing entry from day one',
    'Pinpointed via the exact failure location: Promise.all index 7 in loadDsFromIDB maps directly to idbGetAllRows(\'weatherRows\') — confirmed reproducible even in a guaranteed-fresh Incognito IndexedDB, which ruled out versioning as the cause for this specific store',
    'Fixed: weatherRows added to IDB_STORES. IDB_VERSION bumped 3→4 so a re-download to the same exact filename still gets the store created correctly',
    'Swept every idbGetAllRows/idbPutRows call site in the codebase — all 9 distinct store names now present in the schema, no other mismatches found',
  ]},
  {version:'4.210', date:'2026-06-19', changes:[
    'Found via real console data: the [PERF] instrumentation proved Priority Brief\'s own code is fast (rawStores 418ms, tiered/pulse/render-body all under 1ms) — the freeze was NOT in this code path',
    'Real culprit: IndexedDB schema mismatch. IDB_VERSION was never bumped when IDB_STORES grew (darRows/pmixRows/peaksRows added later) — onupgradeneeded only fires on a version increase, so existing browsers never got those object stores created',
    'Every read/write against a missing store threw "object store not found" — repeatedly, including 16x on a single auto-save, visible directly in console output',
    'Fixed: IDB_VERSION bumped 2→3. The upgrade handler is purely additive (only creates missing stores) so this is safe regardless of how outdated any browser\'s existing copy is',
    'Flagged but not fixed: "listener indicated an asynchronous response" errors in the console are a near-textbook Chrome extension signature, not page code — Meridian has no chrome.runtime API usage. Worth testing in Incognito to rule in/out extension involvement in the remaining freeze time',
  ]},
  {version:'4.209', date:'2026-06-19', changes:[
    'Diagnostic instrumentation (temporary) — Priority Brief still hard-freezing the browser despite two rounds of targeted fixes means something is being missed, not guessed around',
    'Console timing added at: rawStores (all 27 buildStore calls, broken down into compute6wk vs buildBrief time), and DistrictPriorityBrief\'s own mount/tiered/pulse computations',
    'Open the browser console before clicking Priority Brief — the [PERF] log lines will show exactly where the time goes on the next freeze, replacing speculation with real numbers from the actual session',
  ]},
  {version:'4.208', date:'2026-06-19', changes:[
    'Performance: found a second hot-path issue — getModelAssignment() re-parsed the full localStorage assignment blob on every single call, with no caching',
    'Called directly from forecastDay() — the single most-invoked function in the app. A Why Engine district scan alone makes 1,500+ forecastDay calls, each independently re-parsing the same JSON',
    'Also called once per store inside District Priority Brief\'s tiered computation — 27 full re-parses on every filter-pill click',
    'Added a module-level cache, invalidated explicitly on all 3 write paths (saveModelOverride, clearOvr, the backtest engine) — parse once, never silently stale',
    'Confirmed via real data: the LY fix (v4.205) is working correctly — District Priority Brief now shows properly differentiated 4W vs LY per store (e.g. Elgin +12.3%, Chickasha -6.9%) instead of uniform ~-93%',
  ]},
  {version:'4.207', date:'2026-06-19', changes:[
    'Fixed runtime crash: GM Coaching Letters threw "userEvents is not defined" — Why Engine cross-wiring (v4.203) referenced userEvents inside buildContext but never added it to the component\'s props or the call site',
    'GMCoachingBrief now correctly receives userEvents — isolated to this one component; DistrictPriorityBrief and LifeLenzBridgePanel were already wired correctly from their original construction',
    'Swept the rest of the codebase for the same pattern (referencing a variable without receiving it as a prop) — no other instances found',
  ]},
  {version:'4.206', date:'2026-06-19', changes:[
    'Performance: found the actual cause of recurring slowness — compute6wk() makes ~28 avg6() calls per invocation, each independently re-scanning the FULL multi-year, all-27-store array for one field',
    'Runs 3x per store (p/p2/p4 windows) x 27 stores = 2,000+ full array passes every time the store list recomputes — on load, on settings save, on Dialed-In calibration',
    'Added a per-store row index (laborByLoc/opsByLoc/ctrlByLoc/darByLoc), built once at every data-load and session-restore path — same 5 places the existing per-day index already gets built',
    'compute6wk and buildStore\'s pSales/pLY loop now operate on the pre-filtered per-store slice instead of the full district-wide array — identical math, identical semantics, far less to scan',
    'Fixed the most common load path too (App startup IndexedDB restore) — confirmed via existing code comments to be more frequent in practice than fresh Excel upload',
  ]},
  {version:'4.205', date:'2026-06-19', changes:[
    'Critical fix: buildStore\'s pLY (4-week LY comparison) was missing an upper date bound — summed ~392 days of LY sales against pSales\'s 28 days',
    'Caused a uniform ~92-93% "decline vs LY" on every single store regardless of actual performance — first surfaced via District Priority Brief\'s aggregate, but affected every consumer of store.pSales/store.pLY',
    'Also silently affected GM Coaching Letters\' "Sales (4wk) vs LY" line — every letter generated before this fix would have shown a false catastrophic decline',
    'Fixed at the source in buildStore — cascades correctly to District Priority Brief, GM Coaching Letters, and all other vsLY consumers with no per-feature changes needed',
  ]},
  {version:'4.204', date:'2026-06-19', changes:[
    'Model Assignment Backtest — first real-data run: 65 of 81 store×horizon assignments updated, all known problem stores (Elgin, Sulphur, Madill, Tishomingo) resolved correctly per their existing notes',
    'Found + fixed: Mossy Head yearly horizon showed 355%+ MAPE across all models — one contaminated period the recentOnly window didn\'t fully exclude was dominating the average',
    'Backtest MAPE is now a trimmed mean — worst ~5% of individual-day errors excluded before averaging (min sample guards apply), so one bad data day can\'t decide the model winner',
    'Trimming is always surfaced in the evidence ref ("N outlier days excluded") — never silently hidden, since a high trim count is itself a data-quality signal worth noticing',
  ]},
  {version:'4.203', date:'2026-06-18', changes:[
    'Engine cross-wiring: Why Engine ↔ GM Coaching Letters, Priority Brief, LifeLenz Bridge',
    'GM Coaching Letters: buildContext() now runs a 4-week Why Engine scan per store — accuracy + attribution injected into the prompt',
    'GM Coaching Letters: INSIGHT instruction is now specific (low explained% → surfaces missing event context or worst-DOW pattern as the coaching insight)',
    'Priority Brief: calibration gap detection via stored model MAPE — green stores with MAPE >12% promoted to amber with a 🔬 badge (zero recomputation)',
    'LifeLenz Bridge: each DOW bias stat now shows why LifeLenz is biased (weather-driven vs model gap vs situational) — changes how confidently to make the adjustment',
  ]},
  {version:'4.202', date:'2026-06-18', changes:[
    'LifeLenz Bridge — complementary to LifeLenz scheduling, not competing with it (no API, manual entry only)',
    'LEVEL: forward adjustment % per store/day — direct comparison when LifeLenz\'s own "Projected Sales" exists for that date in the loaded file, historical DOW-bias pattern fallback when it doesn\'t',
    'SHAPE: hourly distribution curves built from real darRows history, flagged for deviation when a tagged Calendar event (school release, local event, weather) suggests the normal hourly shape won\'t hold',
    'Single-store 14-day forward view + district-wide ranked scan, Copy Table for fast manual entry',
    'Every adjustment is labeled Direct or Pattern-based — no false confidence when LifeLenz\'s own forward number isn\'t in the loaded file',
  ]},
  {version:'4.201', date:'2026-06-18', changes:[
    'Why Engine — systematic miss attribution, the answer to "why did we miss" across every day, not one click at a time',
    'diagnoseMiss/crossStoreCheck extracted from ForecastTable closures to top-level functions — reused, not duplicated',
    'New: dollar-quantified forecast composition (weather/ops/trend/event $ contribution) via exact algebra on the known forecast formula',
    'Single-store scan: MAPE, explained-vs-unexplained miss rate, DOW miss pattern, worst misses each with full diagnosis',
    'District scan: ranks all 27 stores by MAPE and explained%, surfaces calibration candidates (high MAPE + low explained = model gap, not missing event data)',
    'Every miss card can tag an event directly, closing the loop back into calibration',
  ]},
  {version:'4.200', date:'2026-06-18', changes:[
    'Calendar Manager — proactive event calendar, converts event system from reactive to forward-looking',
    'School calendar event types added (early release, no-school, breaks, year start/end)',
    'Recurring rules engine — register an annual pattern once instead of re-tagging every year',
    'Proactive AI search — finds school district calendars + local events via web search, single-store or all-27 batch',
    'Unified Pending Review queue — AI-search and recurring-rule instances both require human approval before writing',
    'Month-grid calendar view with District/OK/FL/single-store scope, reuses existing EventEntryModal for entry',
    'Every write goes through the same mf_events storage — no separate code path, every existing system sees these identically',
  ]},
  {version:'4.199', date:'2026-06-18', changes:[
    'GM Coaching Letters — evolved from single-store on-demand to district-wide batch engine',
    'Batch mode: "Generate All 27" — one supervisor can maintain a coaching cadence with every GM',
    'Data source upgraded — now pulls buildStore\'s findings/opsScore/ctrlScore/trend instead of raw rows',
    '6wk→4wk→2wk trend direction precomputed and stated explicitly (was previously absent entirely)',
    'Critical findings now force the letter\'s FOCUS section to address them directly, not generically',
    'Every letter is an editable draft with a Reviewed checkbox — human review before copy/print',
  ]},
  {version:'4.198', date:'2026-06-18', changes:[
    'District Priority Brief — tiered (Action Required / Watch Closely / Running Well) above-store view',
    'Synthesizes existing store findings/scores — no new computation, pure intelligence layer',
    '"This Week\'s Focus" — auto-derived from most common issue type district-wide',
    'Filterable by org (OK/FL) and supervisor patch · linked from sidebar and AtAGlance',
  ]},
  {version:'4.197', date:'2026-06-18', changes:[
    'Structural audit complete — DevDashboard Engine Trace now wires _userEvents into forecastDay',
    'ShiftAnalysisTab reviewed — pure historical display, no forecast pipeline calls, no wiring needed',
    'Labor Analytics ⚡ Insights tab — 10-rule engine, ranked findings with $ impact estimates',
  ]},
  {version:'4.196', date:'2026-06-18', changes:[
    'Model Assignment Backtest Engine — re-runnable, tests DOW/AE/EWMA/DI per store × horizon',
    'Uses forecastDay\'s forceModel param — same pipeline as production, zero duplicated math',
    'Model Assignment panel — Re-run Backtest button, live progress, change summary, preserves manual overrides',
  ]},
  {version:'4.195', date:'2026-06-17', changes:[
    'calibrateStore full rewrite — holiday/event/DOW-specific/plus-up now in the evaluation formula',
    'ds.laborRows date-sort fix before .slice(-400) — root cause of inflated historical anomaly MAPEs',
    '_userEvents wired to every calibrateStore/forecastDay/forecastModels call site (was silently empty in many)',
    'detectCleanDataStart — automatic bad-data-period detection for Tishomingo/Elgin/Mossy Head/Ponce de Leon',
    'Holiday model redesign — fullClosure/partialClosure flags, real prior-year per-store holiday data',
    'autoTagHolidays — now runs automatically on every data load (Excel upload and IDB restore)',
  ]},
  {version:'4.192', date:'2026-06-10', changes:[
    'Morning Intelligence Brief — 9 correlation rules, 27 stores sorted by priority',
    'June 2026 projections — embedded all 27 stores, drag-and-drop parser for future months',
    'Projected/VS Proj in brief — falls back to June monthly target ÷ 30',
    'TPPH/Labor% in brief — ctrl row + June target fallbacks',
    'Inventory Excess Cases — fixed for Display as Each format (÷ caseSize)',
    'About/Changelog modal (this screen)',
  ]},
  {version:'4.191', date:'2026-06-01', changes:[
    'Open-Meteo weather API — all 27 stores including FL, 2022–present, IDB-persistent',
    'LFZ Gap panel corrected — honest 9.29% AE vs 9.51% LFZ same-period comparison',
    'Weather notes on anomaly detection, isWeatherExtreme in AE calibration',
    'STORE_COORDS — all 27 locations for weather API (coord.lng→.lon fix)',
  ]},
  {version:'4.190', date:'2026-05-28', changes:[
    'Adaptive Ensemble (AE) model — default weekly, 40,262 rows walk-forward validated',
    'AE auto-recalibration on data load from Sep 2025–May 2026 window',
    'Model Assignment Panel, IndexedDB persistent storage',
  ]},
  {version:'4.18x', date:'2026-05-15', changes:[
    'Florida stores — all 7 Emerald Arches locations integrated',
    'Lifelenz Gap panel, DAR daypart panel, Product Mix panel',
    'Mobile v2 — Convention Demo Mode, Beat LFZ badges, head-to-head hero card',
  ]},
];

function App() {
  const [ds, setDs]               = useState(null);
  const [view, setView]           = useState('command'); // command | district | store | org
  const [selStore, setSelStore]   = useState(null);
  const [locScope,   setLocScope]   = useState('all');
  const [dateRange, setDateRange] = useState(()=>thisWeek());
  const [settings, setSettings]   = useState(()=>{
    try{
      const s=localStorage.getItem('mf_settings');
      const saved=s?JSON.parse(s):{};
      // Deep merge: user prefs override DEF_SETTINGS, but new operators/supervisors added in code are always included
      const merged={...DEF_SETTINGS,...saved};
      // Merge operators — add any new ones from DEF_SETTINGS not in saved
      merged.operators={...DEF_SETTINGS.operators,...(saved.operators||{})};
      merged.supervisorGroups={...DEF_SETTINGS.supervisorGroups,...(saved.supervisorGroups||{})};
      // Auto-apply stored calibrations silently on every startup — fixes 0/27 on open
      try{
        const di=localStorage.getItem('mf_dialed_in');
        if(di){
          const diObj=JSON.parse(di);
          if(diObj&&Object.keys(diObj).length>0){
            merged.dialedIn={...diObj,...(merged.dialedIn||{})};
            merged.dialedInEnabled=true;
          }
        }
      }catch{}
      return merged;
    }catch{return DEF_SETTINGS;}
  });
  const [userEvents, setUserEvents]= useState(()=>{try{return JSON.parse(localStorage.getItem('mf_events')||'{}');}catch{return {};}});
  const [showSettings, setShowSettings]= useState(false);
  const [showRanking, setShowRanking]  = useState(false);
  const [rankingDefault, setRankingDefault] = useState('score');
  const [showTargets, setShowTargets]  = useState(false);
  const [showUnifiedTargets, setShowUnifiedTargets] = useState(false);
  const [showPerfCalc,    setShowPerfCalc]    = useState(false);
  const [showCorrExplorer,setShowCorrExplorer]= useState(false);
  const [showModelAssign, setShowModelAssign] = useState(false);
  const [showOnePager,    setShowOnePager]    = useState(false);
  const [showGMBrief,     setShowGMBrief]     = useState(false);
  const [idbCoverage,     setIdbCoverage]     = useState(null);
  const [showDataManager, setShowDataManager] = useState(false);
  const [showLFZGap,      setShowLFZGap]      = useState(false);
  const [showDARDaypart,  setShowDARDaypart]  = useState(false);
  const [showPMix,        setShowPMix]        = useState(false);
  const [showEvents, setShowEvents]    = useState(false);
  const [showCalendarManager, setShowCalendarManager] = useState(false);
  const [showWhyEngine, setShowWhyEngine] = useState(false);
  const [showLifeLenzBridge, setShowLifeLenzBridge] = useState(false);
  const [showCompare, setShowCompare]  = useState(false);
  const [showInsights,setShowInsights] = useState(false);
  const [showDev, setShowDev]          = useState(false);
  const [showRevIntel,setShowRevIntel] = useState(false);
  const [showAnoms, setShowAnoms]      = useState(false);
  const [showAIScan, setShowAIScan]    = useState(false);
  const [showDialedIn, setShowDialedIn]= useState(false);
  const [showReport,   setShowReport]  = useState(false);
  const [showProj,     setShowProj]    = useState(false);
  const [showProjBriefSA, setShowProjBriefSA] = useState(false); // standalone Pre-Forecast Brief
  const [sessionBanner,   setSessionBanner]   = useState(null);  // IDB restore prompt
  const [showAudit,    setShowAudit]   = useState(false);
  const [showBrief,    setShowBrief]   = useState(false);
  const [showMorningBrief, setShowMorningBrief] = useState(false); // Morning Brief panel
  const [showAbout, setShowAbout] = useState(false); // About/Changelog modal
  const [showPVSA,     setShowPVSA]    = useState(false);
  const [showDICompare,setShowDICompare]= useState(false);
  const [showHelp,     setShowHelp]    = useState(false);
  const [briefScope,   setBriefScope]  = useState({scope:'district',label:'District'});
  const [lockedProjections, setLockedProjections] = useState(()=>{
    try{return JSON.parse(localStorage.getItem('mf_locked_projections')||'{}');}catch{return {};}
  });
  const saveLockedProjections = useCallback((next)=>{
    setLockedProjections(next);
    try{localStorage.setItem('mf_locked_projections',JSON.stringify(next));}catch{}
  },[]);
  const [anomFilter, setAnomFilter]    = useState('all');
  const [showAttention, setShowAttention] = useState(false);
  const [showKB, setShowKB] = useState(false);
  const [showSmartTargets, setShowSmartTargets] = useState(false);
  const [showLocIntel,     setShowLocIntel]     = useState(false);
  const [showInventory,    setShowInventory]    = useState(false);
  const [showFOB,             setShowFOB]             = useState(false);
  const [showLaborAnalytics,  setShowLaborAnalytics]  = useState(false);
  const [showOperatorSummary, setShowOperatorSummary] = useState(false);
  const [showPriorityBrief,   setShowPriorityBrief]   = useState(false);
  const [showStoreKB,         setShowStoreKB]         = useState(false);
  const [showFcstAccuracy, setShowFcstAccuracy] = useState(false);
  const [userTargets, setUserTargets]  = useState(()=>{try{return JSON.parse(localStorage.getItem('mf_targets')||'{}');}catch{return {};}});
  const [loadMsg, setLoadMsg]          = useState(null);
  const [sessionAvailable, setSessionAvailable] = useState(null); // {count} when a previous session is detected but not yet restored
  const [sessionRestoring, setSessionRestoring] = useState(false);

  // Auto-migrate flat targets → v2 on startup

  // ── Session restore: now opt-in, not automatic  (v4.215) ─────────────────
  // The previous behavior tried to restore the FULL session — every row of
  // potentially years of multi-store data — automatically, before the app
  // shell could become interactive at all. If that process hung for ANY
  // reason (and across several rounds of fixes, it kept finding new ways
  // to), there was no way to interact with the app around it — not even to
  // close a modal that happened to be open. That's the actual design flaw,
  // not any single bug inside the restore mechanism itself.
  //
  // Now: a genuinely lightweight check (count() only, hard-timeout-bounded
  // so it can NEVER block the shell, regardless of what else might be wrong
  // with IndexedDB) runs on mount. If a previous session is found, a banner
  // offers to restore it — a deliberate, visible action the user takes when
  // ready, not a blocking process they have no control over. The heavy
  // restore logic is unchanged; it just no longer runs automatically.
  const performFullIDBRestore = async () => {
    setSessionRestoring(true);
    try{
      const {labor,ops,ctrl,fob,audit,peaks,dar,weather} = await loadDsFromIDB();
      const total = labor.length+ops.length+ctrl.length;
      if(total>0){
        const bIdx=(rows)=>{const idx={};for(const r of rows){if(!r.loc||!r.date)continue;const k=r.loc+'_'+dKey(r.date);if(!idx[k])idx[k]=[];idx[k].push(r);}return idx;};
        const lastAct={};
        for(const r of labor){if(r.sales>0){if(!lastAct[r.loc]||r.date>lastAct[r.loc])lastAct[r.loc]=r.date;}}
        const restoredDs={
          laborRows:labor, opsRows:ops, ctrlRows:ctrl,
          fobRows:fob, auditRows:audit,
          peaksSvcRows:peaks.filter(r=>r._peakSvc===true||r.svcType), peaksSalesRows:peaks.filter(r=>r._peakSvc===false&&!r.svcType),
          darRows:dar,
          pmixData:{}, weatherRows:weather||[], trendsRows:[], inventoryRows:[], records:{},
          targets:{}, loaded:labor.length>0,
          laborIdx:bIdx(labor), opsIdx:bIdx(ops), ctrlIdx:bIdx(ctrl),
          laborByLoc:bLocIdx(labor), opsByLoc:bLocIdx(ops), ctrlByLoc:bLocIdx(ctrl), darByLoc:bLocIdx(dar),
          weatherIdx:{}, wxByDate:{},
          storeIds:[...new Set(labor.map(r=>r.loc))].sort(),
          lastActual:lastAct,
        };
        if(audit.length>0) try{restoredDs.empRisk=analyzeRegisterAudit(audit);}catch(e){}
        setDs(restoredDs);
        try{
          const _existingEvents=JSON.parse(localStorage.getItem('mf_events')||'{}');
          const {events:_taggedEvents,tagged:_autoTaggedCount}=autoTagHolidays(restoredDs.laborRows,_existingEvents);
          if(_autoTaggedCount>0){
            localStorage.setItem('mf_events',JSON.stringify(_taggedEvents));
            setUserEvents(_taggedEvents);
          }
        }catch(e){console.warn('Auto-holiday-tag on IDB restore failed:',e);}
        // v4.216: both of these used to re-read large stores from IndexedDB
        // a second and third time — coverage from data already in memory,
        // weather cache from the `weather` array already loaded above.
        const cov = coverageFromLoadedRows(labor, ops, ctrl, fob, audit, peaks, dar, weather);
        setIdbCoverage(cov);
        (weather||[]).forEach(r=>{if(!r.loc||!r.date)return;
          const _wk=String(r.loc)+'_'+dKey(r.date instanceof Date?r.date:new Date(r.date));
          if(!_wxCache[_wk])_wxCache[_wk]={tmax:r.tmax,tmin:r.tmin,rain:r.rain,wmax:r.wmax||r.wspd||0,source:r.source||'idb'};
        });
        const labCov=cov.laborRows;
        const msg = labCov?.count>0
          ? `💾 Stored data loaded · ${labCov.count.toLocaleString()} labor rows · ${labCov.from} → ${labCov.to}`
          : '💾 Stored data loaded from IndexedDB';
        setLoadMsg(msg);
        setTimeout(()=>setLoadMsg(null),6000);
        console.log(`IDB restore: ${total} total rows`);
      }
      setSessionAvailable(null); // restored — clear the banner
    }catch(e){
      console.warn('IDB restore failed:',e);
      alert('Session restore failed: '+e.message+'\n\nYou can still load data fresh via Upload.');
    }
    setSessionRestoring(false);
  };

  React.useEffect(()=>{
    (async()=>{
      // Hard-timeout-bounded — this can NEVER block the app shell, no matter
      // what else might be wrong with IndexedDB underneath it.
      const check = await withTimeout(idbQuickSessionCheck(), 3000, {available:false, timedOut:true});
      if(check.available) setSessionAvailable(check);
      else if(check.timedOut) console.warn('[IDB] Quick session check timed out — skipping auto-restore prompt. Data can still be loaded via Upload.');
    })();
  },[]);

  React.useEffect(()=>{
    const existing=userTargets;
    if(existing&&Object.keys(existing).length>0){
      migrateTargetsToV2(existing, ymKey(new Date()));
    }
  },[]);

  const saveUserEvents = useCallback((next)=>{setUserEvents(next);try{localStorage.setItem('mf_events',JSON.stringify(next));}catch{}}, []);
  // ── One-time migration: normalize legacy Date.toString() tag keys → YYYY-MM-DD ──
  // Tags saved before v4_164 used Date.toString() keys like "Thu Jan 23 2026 06:00:00 GMT-0600"
  // which nDK() can't match against ISO "2026-01-23". This runs once on mount and fixes them.
  React.useEffect(()=>{
    try{
      const raw=localStorage.getItem('mf_events');
      if(!raw)return;
      const evs=JSON.parse(raw);
      let changed=false;
      for(const loc of Object.keys(evs)){
        const locEvs=evs[loc];
        for(const dk of Object.keys(locEvs)){
          // Check if this looks like a Date.toString() format (contains day-of-week name)
          const normalized=nDK(dk);
          if(normalized&&normalized!==dk&&/^\d{4}-\d{2}-\d{2}$/.test(normalized)){
            locEvs[normalized]=locEvs[dk];
            delete locEvs[dk];
            changed=true;
          }
        }
      }
      if(changed){
        localStorage.setItem('mf_events',JSON.stringify(evs));
        setUserEvents(evs);
        console.log('[McForecast] Migrated legacy tag keys to ISO format');
      }
    }catch(e){console.warn('[McForecast] Tag key migration error:',e);}
  },[]);
  const saveUserTargets= useCallback((next)=>{setUserTargets(next);try{localStorage.setItem('mf_targets',JSON.stringify(next));}catch{}}, []);

  // ── IndexedDB auto-save: fires whenever ds changes (i.e., after every file load) ──
  React.useEffect(() => {
    if (!ds || !ds.loaded) return;
    const t = setTimeout(() => {
      mfIDBSave(ds).then(ok => {
        if (ok) console.log('[McForecast] Session auto-saved to IndexedDB', new Date().toLocaleTimeString());
      });
    }, 800); // slight debounce so rapid multi-file drops don't thrash IDB
    return () => clearTimeout(t);
  }, [ds]);

  // ── Startup IDB check: look for a saved session and offer restore ─────────────
  React.useEffect(() => {
    mfIDBLoad().then(session => {
      if (!session || !session.dsRaw) return;
      const ageDays = session.savedAt
        ? Math.floor((Date.now() - new Date(session.savedAt)) / 86400000)
        : 999;
      if (ageDays > 30) { mfIDBClear(); return; } // stale — clear silently
      setSessionBanner(session);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const saveSettings = useCallback((next) => {
    // Accepts plain object only (DI panel now passes plain objects, not functional updates)
    setSettings(next);
    try { localStorage.setItem('mf_settings', JSON.stringify(next)); } catch {}
    if(next.weekStartDay !== undefined) setWeekStartDay(next.weekStartDay);
  }, []);

  // Session Save / Restore handlers
  const handleSaveSession = useCallback(()=>{
    mfExportSession(ds,setLoadMsg);      // file download (portable)
    mfIDBSave(ds);                       // also refresh IDB (belt-and-suspenders)
    setTimeout(()=>setLoadMsg(null),5000);
  },[ds]);
  const handleRestoreSession = useCallback(()=>{
    document.getElementById('session-restore-input')&&document.getElementById('session-restore-input').click();
  },[]);
  const handleClearSession = useCallback(async()=>{
    if(!confirm('Clear the auto-saved session from IndexedDB? You can still load a .json session file manually.'))return;
    await mfIDBClear();
    setSessionBanner(null);
    setLoadMsg('✓ Auto-saved session cleared');
    setTimeout(()=>setLoadMsg(null),3000);
  },[]);

  // Initialize weekStartDay from persisted settings
  React.useEffect(()=>{setWeekStartDay(settings.weekStartDay!==undefined?settings.weekStartDay:3);},[]);

  // Expose DS globally for calibration
  // Apply theme + color mode to <html> element whenever settings change
  useEffect(()=>{
    const theme = settings.theme||'command';
    const mode  = settings.colorMode||'light';
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-mode',  mode);
  },[settings.theme, settings.colorMode]);

    useEffect(()=>{window._mfDS=ds;},[ds]);
    useEffect(()=>{window._mfSettings=settings;},[settings]);
    // KB panel bridge — allows StoreDash to open a specific KB article
    React.useEffect(()=>{
      window._openKB=(articleKey)=>{setShowKB(true);};
    },[]);

  // Event tag listeners (mf_tag_event, mf_tag_event_multi, mf_remove_event)
  useEffect(()=>{
    const tag=(e)=>{
      const{loc:sLoc,locs,date,type,note}=e.detail;
      const tagLocs=locs||[sLoc];
      const dk=dKey(date),et=EVENT_TYPES[type]||EVENT_TYPES.other;
      setUserEvents(prev=>{
        const next=JSON.parse(JSON.stringify(prev));
        tagLocs.forEach(l=>{if(!next[l])next[l]={};next[l][dk]={type,note,icon:et.icon,label:et.label};});
        try{localStorage.setItem('mf_events',JSON.stringify(next));}catch{}
        return next;
      });
    };
    const remove=(e)=>{
      const{loc,date}=e.detail;const dk=dKey(date);
      setUserEvents(prev=>{
        const next=JSON.parse(JSON.stringify(prev));
        if(next[loc]){delete next[loc][dk];if(!Object.keys(next[loc]).length)delete next[loc];}
        try{localStorage.setItem('mf_events',JSON.stringify(next));}catch{}
        return next;
      });
    };
    document.addEventListener('mf_tag_event',tag);
    document.addEventListener('mf_tag_event_multi',tag);
    document.addEventListener('mf_remove_event',remove);
    return()=>{
      document.removeEventListener('mf_tag_event',tag);
      document.removeEventListener('mf_tag_event_multi',tag);
      document.removeEventListener('mf_remove_event',remove);
    };
  },[userEvents,saveUserEvents]);

  const mergedTargets = useMemo(()=>{
    const merged={};
    const locs = ds?ds.storeIds:Object.keys(DEFAULT_TARGETS);
    const curYm=ymKey(new Date());
    const v2=loadTargetsV2();
    const v2cur=v2[curYm]||{};
    locs.forEach(loc=>{
      // Priority: v2 monthly override > user flat override > ds.targets > DEFAULT_TARGETS
      merged[loc]={...DEFAULT_TARGETS[loc],...(ds&&ds.targets[loc]||{}),...(userTargets[loc]||{}),...(v2cur[loc]||{})};
    });
    return merged;
  },[ds,userTargets]);

  const rawStores = useMemo(()=>{
    if(!ds) return [];
    const _t0=performance.now();
    window._perfStats = {compute6wk:0, buildBrief:0};
    const result = ds.storeIds.filter(loc=>/^\d+$/.test(loc)).sort((a,b)=>+a-+b).map(loc=>buildStore(loc,ds,{...settings,targets:mergedTargets}));
    const _total=(performance.now()-_t0);
    console.log('[PERF] rawStores (all 27 buildStore calls):', _total.toFixed(1)+'ms',
      '— compute6wk:', window._perfStats.compute6wk.toFixed(1)+'ms',
      'buildBrief:', window._perfStats.buildBrief.toFixed(1)+'ms',
      'other:', (_total-window._perfStats.compute6wk-window._perfStats.buildBrief).toFixed(1)+'ms');
    return result;
  },[ds,settings,mergedTargets]);

  const stores = useMemo(()=>normalizeScores(rawStores,settings.scoringMode||'absolute'),[rawStores,settings.scoringMode]);

  const goStore=(s)=>{setSelStore(s&&s.loc?s.loc:s);setView('store');};
  const critCount = stores.reduce((a,s)=>a+s.findings.filter(f=>f.t==='crit').length,0);

  const dsRef = useRef(ds);
  useEffect(()=>{dsRef.current=ds;},[ds]);

  const handleFiles = useCallback(async(files)=>{
    if(!files||!files.length) return;
    const fileArr=Array.from(files);
    setLoadMsg('⏳ Reading '+fileArr.length+' file'+(fileArr.length>1?'s…':'…'));
    let currentDS=dsRef.current||buildDS([]);
    const loaded=[];
    for(const file of fileArr){
      try{
        setLoadMsg('⏳ Parsing '+file.name+'…');
        const ab=await file.arrayBuffer();
        const wb=XLSX.read(ab,{type:'array'});
        const type=detectType(file.name,wb);
        currentDS=mergeDS(currentDS,wb,type,file.name);
        loaded.push({name:file.name,type});
      }catch(e){
        console.error('File parse error:',file.name,e);
        setLoadMsg('⚠ Error reading '+file.name);
      }
    }
    setDs(currentDS);
    // Re-sync userEvents from localStorage (v4.195) — autoTagHolidays runs
    // synchronously inside the parsing pipeline (mergeDS → buildDS) and
    // writes any newly-tagged holidays directly to localStorage, since it's
    // a plain function with no access to React's setUserEvents callback.
    // Without this re-sync, the in-memory userEvents state would silently
    // diverge from what's actually persisted until a manual page reload —
    // meaning calibration calls made later in THIS session (which read
    // userEvents from React state, not localStorage directly) could still
    // miss the auto-tagged holidays from the load that just happened.
    try{
      const _refreshedEvents=JSON.parse(localStorage.getItem('mf_events')||'{}');
      setUserEvents(_refreshedEvents);
    }catch(e){console.warn('userEvents re-sync after load failed:',e);}
    const names=loaded.map(f=>f.name.replace(/\.[^.]+$/,'').split(' ').slice(0,3).join(' ')).join(', ');
    setLoadMsg('✓ '+names+' loaded · '+currentDS.storeIds.length+' stores');
    // ── Persist to IndexedDB (survives refresh) ──────────────────────────
    (async()=>{
      try{
        const ds=currentDS;
        if(ds.laborRows?.length) await idbPutRows('laborRows',ds.laborRows);
        if(ds.opsRows?.length)   await idbPutRows('opsRows',ds.opsRows);
        if(ds.ctrlRows?.length)  await idbPutRows('ctrlRows',ds.ctrlRows);
        if(ds.fobRows?.length)   await idbPutRows('fobRows',ds.fobRows);
        if(ds.auditRows?.length) await idbPutRows('auditRows',ds.auditRows);
        const _peaksAll=[...(ds.peaksSvcRows||[]),...(ds.peaksSalesRows||[])];
        if(_peaksAll.length) await idbPutRows('peaksRows',_peaksAll.map(r=>({...r,_peakSvc:!!(r.svcType||r.service)})));
        if(ds.darRows?.length)   await idbPutRows('darRows',ds.darRows);
        if(ds.pmixData&&Object.keys(ds.pmixData).length){
          const pmixSerial=Object.entries(ds.pmixData).map(([k,v])=>({_rk:'pmix:'+k,_d:'0000-00-00',loc:'pmix',filename:k,...(typeof v==='object'?v:{})}));
          await idbPutRows('pmixRows',pmixSerial);
        }
        await idbSetMeta('lastFile',{names,ts:Date.now()});
        // Auto-recalibrate AE model params when new data loads
        // (runs async in background — non-blocking)
        (async()=>{
          try{
            const recalib={};
            const locList=currentDS.storeIds||[];
            for(const loc of locList){
              const lRows=(currentDS.laborRows||[]).filter(r=>String(r.loc)===String(loc)&&r.sales>0);
              if(lRows.length<60) continue;
              const byDate={};
              lRows.forEach(r=>{byDate[dKey(r.date)]=r.sales;});
              // Lightweight recency-weighted grid search
              const evalDates=Object.keys(byDate).sort().slice(-90);
              let bestWMAPE=999,bestP=AE_DI_PARAMS[loc]||{w2:0.4,w4:0.35,w6:0.25,alpha:0.20};
              for(const w2 of [0.6,0.5,0.4,0.33])for(const w4 of [0.3,0.25,0.33]){
                const w6=Math.round((1-w2-w4)*100)/100;
                if(w6<0.05) continue;
                for(const alpha of [0.15,0.20,0.25,0.30,0.35]){
                  const errs=[],wts=[];
                  for(let i=20;i<evalDates.length;i++){
                    const fd=new Date(evalDates[i]+'T00:00:00');
                    const actual=byDate[evalDates[i]];
                    if(!actual||actual<100) continue;
                    if(isWeatherExtreme(loc,fd,currentDS)) continue; // skip weather outliers
                    const fcst=forecastAdaptiveDI(currentDS.laborRows,currentDS.laborIdx,loc,fd,{w2,w4,w6,alpha});
                    if(!fcst) continue;
                    const dayAge=(evalDates.length-1-i);
                    const wt=Math.pow(0.98,dayAge);
                    errs.push(Math.abs(actual-fcst)/actual*wt);
                    wts.push(wt);
                  }
                  if(!errs.length) continue;
                  const wmape=errs.reduce((a,b)=>a+b)/wts.reduce((a,b)=>a+b)*100;
                  if(wmape<bestWMAPE){bestWMAPE=wmape;bestP={w2,w4,w6,alpha};}
                }
              }
              recalib[loc]=bestP;
            }
            // Store recalibrated params
            try{localStorage.setItem('mf_ae_params',JSON.stringify({params:recalib,ts:Date.now()}));}catch{}
            console.log('AE auto-recalibration complete for',Object.keys(recalib).length,'stores');
          }catch(e){console.warn('AE recalibration failed:',e);}
        })();
        const cov=await idbGetCoverage();
        setIdbCoverage(cov);
        const labCov=cov.laborRows;
        setLoadMsg('✓ Saved · '+names+' · '+(labCov?.count||0).toLocaleString()+' labor rows stored');
      }catch(e){ console.warn('IDB persist error:',e); }
    })();
    setTimeout(()=>setLoadMsg(null),6000);
  },[]);

  // Drag-drop
  useEffect(()=>{
    const prevent=(e)=>{e.preventDefault();e.stopPropagation();};
    const drop=(e)=>{e.preventDefault();e.stopPropagation();const files=e.dataTransfer&&e.dataTransfer.files;if(files&&files.length)handleFiles(files);};
    document.addEventListener('dragover',prevent);document.addEventListener('drop',drop);
    return()=>{document.removeEventListener('dragover',prevent);document.removeEventListener('drop',drop);};
  },[handleFiles]);

  // Render
  // ── anyModalOpen  (v4.212 — performance) ────────────────────────────────
  // AtAGlance (and any other background view) was rendering — and fully
  // re-running its own internal computation — even while completely hidden
  // behind a full-screen modal. Confirmed via a Chrome Performance recording:
  // clicking to open Priority Brief showed AtAGlance's own render function
  // consuming the dominant share of a 177-second interaction, despite being
  // invisible the entire time. Every modal in this app is a full-screen
  // fixed-position overlay, so there's no visual reason for the view behind
  // it to keep computing. This OR's together every modal-visibility flag —
  // safe to be over-inclusive here (pausing AtAGlance during a small popup
  // that doesn't fully cover it costs nothing, since it's instant to resume).
  // New panels: add their show-flag here, or they'll silently reintroduce
  // this exact bug for themselves.
  const anyModalOpen = showAIScan||showAbout||showAnoms||showAttention||showAudit||showBrief||
    showCalendarManager||showCompare||showCorrExplorer||showDARDaypart||
    showDICompare||showDataManager||showDev||showDialedIn||showEvents||showFOB||showFcstAccuracy||
    showGMBrief||showHelp||showInsights||showInventory||showKB||showLFZGap||showLaborAnalytics||
    showLifeLenzBridge||showLocIntel||showModelAssign||
    showMorningBrief||showOnePager||showOperatorSummary||showPMix||showPVSA||
    showPerfCalc||showPriorityBrief||showProj||showProjBriefSA||showRanking||
    showReport||showRevIntel||showSettings||showSmartTargets||showStoreKB||
    showTargets||showUnifiedTargets||showWhyEngine;

  // ── Universal Escape hatch  (v4.215) ────────────────────────────────────
  // Whatever caused this specific freeze, the deeper problem was that a
  // stuck modal had no way out at all. This doesn't depend on understanding
  // why something got stuck — Escape always closes every modal, full stop.
  React.useEffect(()=>{
    const onKey = (e) => {
      if(e.key!=='Escape') return;
      setShowAIScan(false);setShowAbout(false);setShowAnoms(false);setShowAttention(false);
      setShowAudit(false);setShowBrief(false);setShowCalendarManager(false);setShowCompare(false);
      setShowCorrExplorer(false);setShowDARDaypart(false);setShowDICompare(false);
      setShowDataManager(false);setShowDev(false);setShowDialedIn(false);setShowEvents(false);
      setShowFOB(false);setShowFcstAccuracy(false);setShowGMBrief(false);setShowHelp(false);
      setShowInsights(false);setShowInventory(false);setShowKB(false);setShowLFZGap(false);
      setShowLaborAnalytics(false);setShowLifeLenzBridge(false);setShowLocIntel(false);
      setShowModelAssign(false);setShowMorningBrief(false);setShowOnePager(false);
      setShowOperatorSummary(false);setShowPMix(false);setShowPVSA(false);setShowPerfCalc(false);
      setShowPriorityBrief(false);setShowProj(false);setShowProjBriefSA(false);setShowRanking(false);
      setShowReport(false);setShowRevIntel(false);setShowSettings(false);setShowSmartTargets(false);
      setShowStoreKB(false);setShowTargets(false);setShowUnifiedTargets(false);setShowWhyEngine(false);
    };
    document.addEventListener('keydown', onKey);
    return ()=>document.removeEventListener('keydown', onKey);
  },[]);

  return div({style:{height:'100vh',display:'flex',background:'var(--bg)',color:'var(--text)',fontFamily:'var(--sans)',overflow:'hidden'}},

    // ── Session restore banner (v4.215) ──────────────────────────────────
    // Always visible, independent of view/modal state — restore is now a
    // deliberate action the user takes, never an automatic process that
    // could block the app before this very button could be clicked.
    sessionAvailable&&div({style:{position:'fixed',top:14,left:'50%',transform:'translateX(-50%)',
      zIndex:9999,display:'flex',alignItems:'center',gap:10,padding:'9px 14px',
      background:'var(--surf)',border:'.5px solid rgba(245,158,11,.4)',borderRadius:'var(--rl)',
      boxShadow:'0 8px 28px rgba(0,0,0,.45)'}},
      span({style:{fontSize:'15px'}},'💾'),
      span({style:{fontSize:'10.5px',color:'var(--text)'}},
        'Previous session found — '+sessionAvailable.count.toLocaleString()+' labor rows'),
      btn({className:'btn btn-sm btn-a',style:{fontSize:'9px',fontWeight:700,padding:'4px 12px'},
        disabled:sessionRestoring, onClick:performFullIDBRestore},
        sessionRestoring?'⏳ Restoring…':'Restore Session'),
      btn({className:'btn btn-sm',style:{fontSize:'9px',color:'var(--text3)'},
        disabled:sessionRestoring, onClick:()=>setSessionAvailable(null)},'Dismiss')
    ),

    // ── LEFT SIDEBAR ─────────────────────────────────────────────
    h(AppSidebar,{
      view, setView,
      selStore,
      stores, ds, settings,
      loadMsg,
      onLoadFiles: () => document.getElementById('file-input-main')&&document.getElementById('file-input-main').click(),
      onSaveSession: handleSaveSession,
      onRestoreSession: handleRestoreSession,
      onOpenModal: (modal) => {
        if(modal==='ranking'||modal.startsWith('ranking:')){
          setShowRanking(true);
          setRankingDefault(modal.includes(':')?modal.split(':')[1]:'score');
        }
        if(modal==='aiscan')    setShowAIScan(p=>!p);
        if(modal==='revintel')  setShowRevIntel(true);
        if(modal==='compare')   setShowCompare(true);
        if(modal==='proj')      setShowProj(true);
        if(modal==='proj-brief') setShowProjBriefSA(true);
        if(modal==='dialedin')  setShowDialedIn(true);
        if(modal==='pvsa')      setShowPVSA(true);
        if(modal==='dicompare') setShowDICompare(true);
        if(modal==='report')    setShowReport(true);
        if(modal==='morning-brief') setShowMorningBrief(true);
        if(modal==='about') setShowAbout(true);
        if(modal==='brief')     {
          if(selStore) setBriefScope({scope:'store',label:sNameC(selStore),locs:[selStore]});
          else setBriefScope({scope:'district',label:settings.districtNameShort||'District',locs:null});
          setShowBrief(true);
        }
        if(modal==='targets')   setShowTargets(true);
        if(modal==='events')    setShowEvents(true);
        if(modal==='settings')  setShowSettings(true);
        if(modal==='help')      setShowHelp(true);
        if(modal==='kb')        setShowKB(true);
        if(modal==='smart-targets') setShowSmartTargets(true);
        if(modal==='loc-intel')     setShowLocIntel(true);
        if(modal==='inventory')     setShowInventory(true);
        if(modal==='fob-analysis')        setShowFOB(true);
        if(modal==='labor-analytics')     setShowLaborAnalytics(true);
        if(modal==='operator-summary')    setShowOperatorSummary(true);
        if(modal==='priority-brief')      setShowPriorityBrief(true);
        if(modal==='store-kb')            setShowStoreKB(true);
        if(modal==='model-assign')        setShowModelAssign(true);
        if(modal==='one-pager')            setShowOnePager(true);
        if(modal==='gm-brief')             setShowGMBrief(true);
        if(modal==='calendar-manager')     setShowCalendarManager(true);
        if(modal==='why-engine')           setShowWhyEngine(true);
        if(modal==='lifelenz-bridge')      setShowLifeLenzBridge(true);
        if(modal==='dar-daypart')          setShowDARDaypart(true);
        if(modal==='pmix')                 setShowPMix(true);
        if(modal==='data-manager')         setShowDataManager(true);
        if(modal==='lfz-gap')              setShowLFZGap(true);
        if(modal==='perf-calc')           setShowPerfCalc(true);
        if(modal==='corr-explorer')       setShowCorrExplorer(true);
        if(modal==='unified-targets')     setShowUnifiedTargets(true);
        if(modal==='fcst-accuracy')   setShowFcstAccuracy(true);
        if(modal==='attention') setShowAttention(true);
      }
    }),

    // ── RIGHT MAIN AREA ────────────────────────────────────────────
    div({style:{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',minWidth:0}},

      // Slim topbar
      h(AppTopbar,{
        view, setView, selStore, stores, ds, settings,
        dateRange, onDateChange: setDateRange,
        locScope, onScopeChange: setLocScope,
        loadMsg,
        onLoadFiles: () => document.getElementById('file-input-main')&&document.getElementById('file-input-main').click(),
        onSaveSession: handleSaveSession,
        sessionBanner,
        onClearSession: handleClearSession,
        onOpenModal: (modal) => {
          if(modal==='settings')   setShowSettings(true);
          if(modal==='help')       setShowHelp(true);
          if(modal==='proj-brief') setShowProjBriefSA(true);
        }
      }),

      // Hidden file input wired to the sidebar Load button
      h('input',{id:'file-input-main',type:'file',multiple:true,accept:'.xlsx,.xlsm,.xls,.csv',
        style:{display:'none'},
        onChange:e=>handleFiles(Array.from(e.target.files||[]))}),
      // Hidden file input for session restore
      h('input',{id:'session-restore-input',type:'file',accept:'.json',
        style:{display:'none'},
        onChange:e=>{
          const f=e.target.files&&e.target.files[0];
          e.target.value='';
          if(!f)return;
          setLoadMsg('⏳ Restoring session…');
          mfRestoreSession(f,setDs,saveSettings,(msg)=>{setLoadMsg(msg);setTimeout(()=>setLoadMsg(null),5000);});
        }}),

          // Main content — fills right panel, scrollable
      div({style:{flex:1,overflowY:'auto',padding:'0 16px 32px'}},
      // ── Session restore banner (shown on startup if IDB session found) ────
      sessionBanner&&h(SessionBanner,{
        session:sessionBanner,
        onDismiss:()=>setSessionBanner(null),
        onRestore:async(session)=>{
          try{
            const restored=_mfDeserDS(session.dsRaw);
            if(!restored){alert('Session data could not be restored.');return;}
            setDs(restored);
            setSessionBanner(null);
            setLoadMsg('✓ Session restored · '+( restored.storeIds?.length||0)+' stores · '+(restored.laborRows?.length||0)+' labor rows');
            setTimeout(()=>setLoadMsg(null),6000);
          }catch(e){
            console.error('[McForecast] Session restore error:',e);
            alert('Session restore failed: '+e.message);
            setSessionBanner(null);
          }
        }
      }),
      view==='command'&&!anyModalOpen&&h(AtAGlance,{stores:locScope==='ok'?stores.filter(s=>INV_ORG_COORDS[s.loc]&&INV_ORG_COORDS[s.loc].state==='OK'):locScope==='fl'?stores.filter(s=>INV_ORG_COORDS[s.loc]&&INV_ORG_COORDS[s.loc].state==='FL'):stores,ds,settings,userEvents,lockedProjections,dateRange,
        onOpenStore:s=>{goStore(s);},
        onOpenProjections:()=>setShowProj(true),
        onOpenPVSA:()=>setShowPVSA(true),
        onOpenBrief:()=>setShowBrief(true),
        onNav:v=>setView(v),
        onOpenModal:(modal)=>{
          if(modal==='ranking'||modal.startsWith('ranking:')){
            setShowRanking(true);
            setRankingDefault(modal.includes(':')?modal.split(':')[1]:'score');
          }
          else if(modal==='settings')setShowSettings&&setShowSettings(true);
        }}),
      view==='district'&&!selStore&&h(DistrictGrid,{stores,ds,settings,dateRange,userEvents,onSelectStore:goStore}),
      view==='store'&&selStore&&!anyModalOpen&&h(StoreDash,{store:stores.find(s=>s.loc===selStore)||stores[0],ds,settings,allStores:stores,onBack:()=>{setView('district');setSelStore(null);},onNav:goStore,dateRange,userEvents}),
      view==='patch'&&!anyModalOpen&&h(OrgView,{stores,settings,onSelectStore:goStore,groupBy:'patch'}),
      view==='org'&&!anyModalOpen&&h(OrgView,{stores,settings,onSelectStore:goStore,groupBy:'operator'})
    )  // close main content scroll area
    )  // close right panel flex-col

  , // Modals rendered at root of the flex layout (position:fixed, so location in tree doesn't matter)
    showSettings &&h(Settings, {settings,onUpdate:saveSettings,onClose:()=>setShowSettings(false)}),
    showRanking  &&h(RankingView,{stores,ds,settings,dateRange,onDateChange:setDateRange,defaultMetric:rankingDefault,onSelectStore:s=>{goStore(s);setShowRanking(false);},onClose:()=>setShowRanking(false)}),
    showTargets  &&h(MonthlyTargetManager,{userTargets,mergedTargets,onUpdate:saveUserTargets,onClose:()=>setShowTargets(false),ds}),
    showUnifiedTargets&&h(UnifiedTargetsPanel,{stores,ds,settings,onClose:()=>setShowUnifiedTargets(false)}),
    showPerfCalc&&h(PerformanceCalculator,{stores,ds,settings,onClose:()=>setShowPerfCalc(false)}),
    showCorrExplorer&&h(MetricCorrelationExplorer,{stores,ds,settings,onClose:()=>setShowCorrExplorer(false)}),
    showModelAssign&&h(ModelAssignmentPanel,{stores,ds,settings,userEvents,onClose:()=>setShowModelAssign(false)}),
    showOnePager&&h(StoreOnePager,{stores,ds,settings,onClose:()=>setShowOnePager(false)}),
    showGMBrief&&h(GMCoachingBrief,{stores,ds,settings,userEvents,onClose:()=>setShowGMBrief(false)}),
    showDARDaypart&&h(DARDaypartPanel,{stores,ds,settings,onClose:()=>setShowDARDaypart(false)}),
    showDataManager&&h(DataManagerPanel,{ds,idbCoverage,onClose:()=>setShowDataManager(false)}),
    showLFZGap&&h(LifelenzGapPanel,{ds,settings,onClose:()=>setShowLFZGap(false)}),
    showPMix&&h(ProductMixPanel,{stores,ds,settings,onClose:()=>setShowPMix(false)}),
    showEvents   &&h(EventCalendar,{userEvents,onUpdate:saveUserEvents,onClose:()=>setShowEvents(false),stores}),
    showCalendarManager&&h(CalendarManagerPanel,{stores,ds,settings,userEvents,onUpdate:saveUserEvents,onClose:()=>setShowCalendarManager(false)}),
    showWhyEngine&&h(WhyEnginePanel,{stores,ds,settings,userEvents,onUpdate:saveUserEvents,onClose:()=>setShowWhyEngine(false)}),
    showLifeLenzBridge&&h(LifeLenzBridgePanel,{stores,ds,settings,userEvents,onClose:()=>setShowLifeLenzBridge(false)}),
    showCompare  &&h(MultiStoreComparison,{stores,ds,settings,onSelectStore:s=>{goStore(s);setShowCompare(false);},onClose:()=>setShowCompare(false)}),
    showInsights &&h(AIInsightsLog,{stores,settings,onClose:()=>setShowInsights(false)}),
    showRevIntel &&h(RevenueIntelligence,{stores,ds,settings,userEvents,onSelectStore:s=>{goStore(s);setShowRevIntel(false);},onClose:()=>setShowRevIntel(false)}),
    showDev      &&h(DevDashboard,{ds,settings,stores,userEvents,onClose:()=>setShowDev(false)}),
    showKB&&h(KnowledgeBasePanel,{onClose:()=>setShowKB(false)}),
    showSmartTargets&&h(SmartTargetPanel,{stores,ds,settings,onClose:()=>setShowSmartTargets(false)}),
    showLocIntel&&h(LocationIntelligence,{allStores:stores,ds,settings,scope:'district',onClose:()=>setShowLocIntel(false)}),
    showInventory&&h(InventoryIntelligence,{stores,ds,settings,onClose:()=>setShowInventory(false)}),
    showFOB&&h(FOBAnalysisPanel,{stores,ds,settings,onClose:()=>setShowFOB(false)}),
    showLaborAnalytics&&h(LaborAnalyticsPanel,{stores,ds,settings,onClose:()=>setShowLaborAnalytics(false)}),
    showPriorityBrief&&h(DistrictPriorityBrief,{stores,ds,settings,userEvents,onSelectStore:s=>{goStore(s);setShowPriorityBrief(false);},onClose:()=>setShowPriorityBrief(false)}),
    showOperatorSummary&&h(OperatorSummaryPanel,{stores,ds,settings,onClose:()=>setShowOperatorSummary(false)}),
    showStoreKB&&h(StoreKBEditor,{onClose:()=>setShowStoreKB(false)}),
    showFcstAccuracy&&h(ForecastAccuracyPanel,{stores,ds,settings,userEvents,onClose:()=>setShowFcstAccuracy(false)}),
    showAttention&&h(AttentionPanel,{stores,onSelectStore:s=>{goStore(s);setShowAttention(false);},onClose:()=>setShowAttention(false)}),
    showAnoms    &&h(AnomalyPanel,{ds,stores,userEvents,initFilter:anomFilter,onSelectStore:s=>{goStore(s);setShowAnoms(false);setAnomFilter('all');},onClose:()=>{setShowAnoms(false);setAnomFilter('all');}}),
    showAIScan&&div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.75)',zIndex:300,overflowY:'auto',padding:20}},
      div({style:{background:'var(--surf)',borderRadius:'var(--rl)',border:'.5px solid var(--bdr2)',maxWidth:940,margin:'0 auto'}},
        div({style:{padding:'12px 16px',borderBottom:'.5px solid var(--bdr)',display:'flex',alignItems:'center'}},
          div({style:{fontSize:'13px',fontWeight:700}},'🔍 Historical Sales Anomaly Scan'),
          btn({onClick:()=>setShowAIScan(false),style:{marginLeft:'auto',background:'none',border:'none',color:'var(--text2)',fontSize:20,cursor:'pointer'}},'×')
        ),
        div({style:{padding:'16px'}},h(AIBacktestScanner,{stores,ds,settings,userEvents,onTagEvent:(loc,dk,note,evType,opts)=>{
          // Handle _refresh_ signal from EventEntryModal — receives complete new state
          // already written to localStorage; just sync React state with it.
          if(loc==='_refresh_'&&opts&&opts._refreshState){
            saveUserEvents(opts._refreshState);
            return;
          }
          setUserEvents(prev=>{
            const next=JSON.parse(JSON.stringify(prev));
            if(!next[loc])next[loc]={};
            const et=EVENT_TYPES[evType||'other']||EVENT_TYPES.other;
            const tagsArr=opts&&opts.tags&&opts.tags.length?opts.tags:[{type:evType||'other',...et}];
            const labelStr=opts&&opts.tagLabel?opts.tagLabel:(tagsArr.map(t=>t.label).join(' + ')||et.label);
            const iconStr=tagsArr.map(t=>t.icon||'📌').join(' ');
            next[loc][dk]={
              type:evType||'other',
              note:note||'Anomaly flagged from backtest scan',
              icon:iconStr,label:labelStr,
              tags:tagsArr,
              customNote:opts&&opts.customNote?opts.customNote:'',
              aiNote:opts&&opts.aiNote?opts.aiNote:'',
              ...(opts&&opts.aiMatched?{aiMatched:true,aiConfidence:opts.aiConfidence,source:'AI Batch Scan'}:{source:'Manual'})
            };
            try{localStorage.setItem('mf_events',JSON.stringify(next));}catch{}
            return next;
          });}}))
      )
    ),
    showProj&&div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.8)',zIndex:300,overflowY:'auto',padding:20}},
      div({style:{background:'var(--surf)',borderRadius:'var(--rl)',border:'.5px solid var(--bdr2)',width:'96vw',maxWidth:1700,margin:'0 auto',maxHeight:'92vh',display:'flex',flexDirection:'column'}},
        h(ProjectionWorkflow,{stores,ds,settings,userEvents,lockedProjections,onSaveLocked:saveLockedProjections,onClose:()=>setShowProj(false)})
      )
    ),
    // ── Standalone Pre-Forecast Brief (from topbar shortcut or nav) ──────
    showProjBriefSA&&h(PreForecastBrief,{
      stores,ds,settings,userEvents,
      weekStart:(()=>{const d=new Date();const wsd=settings.weekStartDay!=null?settings.weekStartDay:3;const diff=(wsd-d.getDay()+7)%7||7;const w=new Date(d);w.setDate(d.getDate()+diff);return dKey(w);})(),
      projPeriod:'week',lockedProjections,
      onRun:()=>{setShowProjBriefSA(false);setShowProj(true);},
      onClose:()=>setShowProjBriefSA(false)
    }),
    showReport&&div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.8)',zIndex:300,overflowY:'auto',padding:20}},
      div({style:{background:'var(--surf)',borderRadius:'var(--rl)',border:'.5px solid var(--bdr2)',maxWidth:1100,margin:'0 auto',maxHeight:'92vh',display:'flex',flexDirection:'column'}},
        h(DateRangeReport,{stores,ds,settings,userEvents,onClose:()=>setShowReport(false)})
      )
    ),
    showDICompare&&div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.85)',zIndex:370,display:'flex',alignItems:'center',justifyContent:'center',padding:20}},
      div({style:{background:'var(--surf)',borderRadius:'var(--rl)',border:'.5px solid var(--bdr2)',
        width:'100%',maxWidth:1100,display:'flex',flexDirection:'column',maxHeight:'94vh'}},
        h(DialedInComparisonReport,{stores,ds,settings,userEvents,onClose:()=>setShowDICompare(false)})
      )
    ),
    showPVSA&&div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.85)',zIndex:360,display:'flex',alignItems:'center',justifyContent:'center',padding:20}},
      div({style:{background:'var(--surf)',borderRadius:'var(--rl)',border:'.5px solid var(--bdr2)',
        width:'100%',maxWidth:1100,display:'flex',flexDirection:'column',maxHeight:'94vh'}},
        h(ProjectionVsActualsReport,{stores,ds,settings,userEvents,onClose:()=>setShowPVSA(false)})
      )
    ),
    showHelp&&div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.85)',zIndex:400,
      display:'flex',alignItems:'center',justifyContent:'center',padding:20}},
      div({style:{background:'var(--surf)',borderRadius:'var(--rl)',border:'.5px solid var(--bdr2)',
        width:'100%',maxWidth:800,maxHeight:'94vh',display:'flex',flexDirection:'column'}},
        // Help header
        div({style:{padding:'14px 18px',borderBottom:'.5px solid var(--bdr)',
          display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}},
          div({style:{fontSize:'16px',fontWeight:800}},'📖 Meridian — Workflow Guide'),
          btn({onClick:()=>setShowHelp(false),style:{background:'none',border:'none',
            color:'var(--text2)',fontSize:22,cursor:'pointer'}},'×')
        ),
        // Help content
        div({style:{overflowY:'auto',padding:'16px 20px',fontSize:'11px',lineHeight:1.7}},
          ...[
            {day:'DAILY (Every day you open the app)',color:'#10b981',items:[
              {t:'1. Load fresh data',d:'Upload the latest QSRSoft Operations Report and Register Audit. The Data Status panel on the Home screen shows how old your current data is. Red = needs immediate refresh. Target: data no older than 3 days.'},
              {t:'2. Check the Home Command Center',d:'Review Signals Feed for any red/yellow alerts. Check the Projection Pulse to see next-7-day district forecast vs LY. Click any store showing red to investigate.'},
              {t:'3. Review Needs Attention',d:'The ⚠ button in the toolbar shows any stores with active alerts (integrity issues, scheduling problems, critical metrics). Address red items first.'},
              {t:'4. Spot-check a store',d:'Click any store in the district grid to open its dashboard. Review OEPE, TPPH, Labor%, and Cash O/S against targets. The Model Health Score tells you whether you can trust its forecast.'},
            ]},
            {day:'WEEKLY (Every Wednesday — start of work week)',color:'#f59e0b',items:[
              {t:'1. Lock the weekly projection',d:'Open Projections (📋 button). The workspace shows all 27 stores with AI-generated forecasts. Review any stores with high MAPE (the ±% next to store name). Double-click any cell to override if you have specific knowledge. Lock all rows when satisfied. Deadline: 10 days before week start.'},
              {t:'2. Run Projection vs Actuals report',d:'Click 📊 Proj vs Act and run a 2-4 week backtest. This shows how accurate the prior week AI forecasts were vs actual results. Click any cell to see day-by-day breakdown. Look for stores that are consistently missing — those need recalibration.'},
              {t:'3. Check Dialed-In for drifting stores',d:'Go to any store dashboard → Dialed-In. Look for the ⚠ drift warning. Stores with 2W MAPE significantly worse than 6W MAPE are drifting. Run ↺ Recalibrate on those stores.'},
              {t:'4. Generate Intelligence Brief',d:'Click 🧠 Brief from a store or from the district view. For your Monday morning review, run a District brief to get a plain-English summary of where things stand and what needs attention.'},
            ]},
            {day:'MONTHLY (By the 15th of prior month)',color:'#f87171',items:[
              {t:'1. Lock the monthly projection',d:'Open Projections → set Period to Month. Review all stores monthly totals. The system shows weekly sub-totals within the month. Approve all stores. Deadline: 15th of the prior month.'},
              {t:'2. Run full backtest and recalibrate all stores',d:'Dialed-In panel → Calibrate All. This updates the model for every store using the latest 6+ weeks of actual data. Run this monthly to keep the model sharp. Takes about 10-15 seconds for all 27 stores.'},
              {t:'3. Review model health for all stores',d:'Check the Home Command Center Model Health grid. Any stores in yellow or red should have their Dialed-In re-run. Target: 20+ stores green before committing monthly projections.'},
              {t:'4. Intelligence Brief — Operator roll-ups',d:'Generate a brief for each operator (Ryan, Gary, Rick/Kathy, Jacob). These are the right reports to share with each operator at the monthly review meeting.'},
            ]},
            {day:'ANNUAL (1 month before year start)',color:'#818cf8',items:[
              {t:'1. Lock the annual projection',d:'This is a district-level aggregate based on monthly projections. Work week by week through the full year using the monthly projection workflow. Deadline: approximately December 1 for the following year.'},
              {t:'2. Review and update targets',d:'Go to Settings → Targets and review each store OEPE, TPPH, Labor%, and growth targets. Annual target reviews should reflect changes in store capacity, staffing, or business mix.'},
              {t:'3. Reset and recalibrate all models',d:'After updating targets, run Calibrate All in Dialed-In. New targets change the ops factor calculations, so a fresh calibration ensures the model adapts.'},
            ]},
            {day:'AS NEEDED — Automation Candidates',color:'#94a3b8',items:[
              {t:'Auto-actions currently handled',d:'• Data loading: manual (drag-drop weekly) · • Calibration: auto when 10+ new points · • Signals: refresh on load · • Deadline alerts: live calculated'},
              {t:'Future automation candidates',d:'• Weekly brief email Wednesdays · • Auto-lock reminder Sundays (T-10 days) · • Monthly alert on the 10th · • MAPE alert when accuracy drops >3 points week-over-week'},
            ]},
          ].map((section,si)=>div({key:si,style:{marginBottom:20}},
            div({style:{display:'flex',alignItems:'center',gap:8,marginBottom:10,
              padding:'6px 10px',background:section.color+'15',borderRadius:'var(--r)',
              borderLeft:'3px solid '+section.color}},
              div({style:{fontWeight:800,fontSize:'12px',color:section.color}},section.day)
            ),
            div({style:{paddingLeft:12}},
              ...section.items.map((item,ii)=>div({key:ii,style:{marginBottom:12}},
                div({style:{fontWeight:700,fontSize:'11px',color:'var(--text)',marginBottom:3}},
                  item.t),
                div({style:{color:'var(--text2)',fontSize:'10px',lineHeight:1.6,
                  whiteSpace:'pre-line'}},item.d)
              ))
            )
          ))
        )
      )
    ),
    showBrief&&div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.85)',zIndex:350,display:'flex',alignItems:'center',justifyContent:'center',padding:20}},
      div({style:{background:'var(--surf)',borderRadius:'var(--rl)',border:'.5px solid var(--bdr2)',
        width:'100%',maxWidth:720,display:'flex',flexDirection:'column',maxHeight:'92vh'}},
        h(LocationBrief,{
          stores:briefScope.locs?stores.filter(s=>briefScope.locs.includes(s.loc)):stores,
          ds,settings,
          scope:briefScope.scope,
          scopeLabel:briefScope.label,
          onClose:()=>setShowBrief(false)
        })
      )
    ),
    showAbout&&div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.88)',zIndex:370,
      display:'flex',alignItems:'flex-start',justifyContent:'center',padding:'16px',overflowY:'auto'}},
      div({style:{background:'var(--surf)',borderRadius:'var(--rl)',border:'.5px solid var(--bdr2)',
        width:'100%',maxWidth:720,position:'relative'}},
        h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',
          padding:'14px 18px',borderBottom:'.5px solid var(--bdr2)',position:'sticky',top:0,
          background:'var(--surf)',zIndex:10}},
          h('div',null,
            h('div',{style:{fontFamily:"'Syne',sans-serif",fontSize:'16px',fontWeight:800}},
              'Meridian. v'+MERIDIAN_VERSION),
            h('div',{style:{fontSize:'11px',color:'var(--text3)',marginTop:'2px'}},
              'QSR Forecasting & Intelligence · MCDOK & Emerald Arches · 27 Locations · Build '+MERIDIAN_BUILD_DATE)),
          h('button',{onClick:()=>setShowAbout(false),
            style:{background:'none',border:'none',color:'var(--text3)',fontSize:'20px',cursor:'pointer'}},'✕')),
        div({style:{padding:'20px 24px',overflowY:'auto',maxHeight:'80vh'}},
          // Stats row
          div({style:{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'10px',marginBottom:'24px'}},
            [['27','Stores'],['5','Forecast Models'],['40,262','Rows Validated'],['9','Correlation Rules']]
              .map(([v,l])=>div({style:{background:'rgba(245,158,11,.06)',border:'1px solid rgba(245,158,11,.15)',
                borderRadius:'8px',padding:'12px',textAlign:'center'}},
                div({style:{fontFamily:"'Syne',sans-serif",fontSize:'22px',fontWeight:800,color:'var(--amber)'}},v),
                div({style:{fontSize:'10px',color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.07em',marginTop:'2px'}},l)))
          ),
          // Changelog
          h('div',{style:{fontFamily:"'Syne',sans-serif",fontSize:'14px',fontWeight:800,
            marginBottom:'14px',color:'var(--text)'}},'Changelog'),
          ...MERIDIAN_CHANGELOG.map(entry=>
            div({style:{borderLeft:'2px solid rgba(245,158,11,.3)',paddingLeft:'16px',marginBottom:'20px'}},
              div({style:{display:'flex',gap:'10px',alignItems:'center',marginBottom:'8px'}},
                div({style:{fontFamily:"'Syne',sans-serif",fontSize:'13px',fontWeight:800,color:'var(--amber)'}},
                  'v'+entry.version),
                div({style:{fontSize:'11px',color:'var(--text3)'}},'·'),
                div({style:{fontSize:'11px',color:'var(--text3)'}},' '+entry.date)),
              h('ul',{style:{paddingLeft:'16px',display:'flex',flexDirection:'column',gap:'5px'}},
                entry.changes.map((c,i)=>
                  h('li',{key:i,style:{fontSize:'12px',color:'var(--text2)',lineHeight:'1.6'}},c)))
            )
          ),
          // Data sources info
          div({style:{borderTop:'.5px solid var(--bdr)',paddingTop:'16px',marginTop:'8px'}},
            div({style:{fontSize:'11px',color:'var(--text3)',lineHeight:'1.8'}},
              '⚡ Architecture: Single-file HTML · React 18 UMD · IndexedDB storage · Open-Meteo weather API'),
            div({style:{fontSize:'11px',color:'var(--text3)',lineHeight:'1.8',marginTop:'4px'}},
              '📊 Data sources: QSRSoft (manual export) · Lifelenz (Labor Analysis) · 3 Peaks · Register Audit · FOB · Inventory'),
            div({style:{fontSize:'11px',color:'var(--text3)',lineHeight:'1.8',marginTop:'4px'}},
              '🔒 All data stored locally in your browser · No cloud upload · No external data transmission')
          )
        )
      )
    ),
        showMorningBrief&&div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.88)',zIndex:360,display:'flex',alignItems:'flex-start',justifyContent:'center',padding:'16px',overflowY:'auto'}},
      div({style:{background:'var(--surf)',borderRadius:'var(--rl)',border:'.5px solid var(--bdr2)',width:'100%',maxWidth:920,position:'relative'}},
        h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'14px 18px',borderBottom:'.5px solid var(--bdr2)',position:'sticky',top:0,background:'var(--surf)',zIndex:10}},
          h('div',null,
            h('div',{style:{fontFamily:"'Syne',sans-serif",fontSize:'16px',fontWeight:800,letterSpacing:'-.02em'}},'☀️ Morning Intelligence Brief'),
            h('div',{style:{fontSize:'11px',color:'var(--text3)',marginTop:'2px'}},'Correlation engine · 9 rules · 27 stores · Sorted by priority')),
          h('button',{onClick:()=>setShowMorningBrief(false),style:{background:'none',border:'none',color:'var(--text3)',fontSize:'20px',cursor:'pointer',lineHeight:1,padding:'0 4px'}},'✕')),
        div({style:{overflowY:'auto',maxHeight:'88vh'}},
          h(MorningBriefPanel,{ds,settings}))
      )
    ),
        showAudit&&selStore&&div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.8)',zIndex:300,overflowY:'auto',padding:20}},
      div({style:{background:'var(--surf)',borderRadius:'var(--rl)',border:'.5px solid var(--bdr2)',maxWidth:980,margin:'0 auto',maxHeight:'92vh',display:'flex',flexDirection:'column'}},
        h(ForecastAudit,{
          store:stores.find(s=>s.loc===(selStore&&selStore.loc?selStore.loc:selStore))||null,
          ds,settings,userEvents,dateRange,
          onClose:()=>setShowAudit(false)
        })
      )
    ),
    showDialedIn&&div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.8)',zIndex:300,overflowY:'auto',padding:20}},
      div({style:{background:'var(--surf)',borderRadius:'var(--rl)',border:'.5px solid var(--bdr2)',maxWidth:1100,margin:'0 auto',maxHeight:'90vh',display:'flex',flexDirection:'column'}},
        h(DialedInPanel,{stores,ds,settings,userEvents,onUpdateSettings:saveSettings,onClose:()=>setShowDialedIn(false)})
      )
    )
  );
}

try {
  ReactDOM.createRoot(document.getElementById('root')).render(
    React.createElement(ErrorBoundary, null, React.createElement(App))
  );
} catch(e) {
  document.getElementById('root').innerHTML =
    `<div style="padding:40px;font-family:monospace;background:#090e18;color:#e2e8f0;min-height:100vh">
      <div style="color:#f59e0b;font-size:20px;font-weight:700;margin-bottom:16px">⚠ McForecast — Startup Error</div>
      <div style="color:#f87171;font-size:13px;margin-bottom:12px">${e.message}</div>
      <pre style="color:#64748b;font-size:11px">${e.stack||''}</pre>
      <button onclick="localStorage.clear();location.reload()" style="margin-top:20px;padding:8px 16px;background:#f59e0b;border:none;border-radius:6px;cursor:pointer;font-weight:600">Clear settings & reload</button>
    </div>`;
}
