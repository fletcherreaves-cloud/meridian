// @ts-nocheck
import * as React from 'react';
import { addD, addDR, dKey, dowOf, sodOf, setWeekStartDay, mwStart, nwStart } from '../utils/date.js';
import { lastClosedBusinessDay } from './swing-feed.js';

const h    = React.createElement;
const div  = (props, ...c) => h('div',    props, ...c);
const span = (props, ...c) => h('span',   props, ...c);
const btn  = (props, ...c) => h('button', props, ...c);
const path = (props, ...c) => h('path',   props, ...c);
const PEAK_SLICES = {'7am-9am':'breakfast','7am - 9am':'breakfast','breakfast':'breakfast','11am-2pm':'lunch','11am - 2pm':'lunch','lunch':'lunch','5pm-7pm':'dinner','5pm - 7pm':'dinner','dinner':'dinner'};
function normSlice(s){return PEAK_SLICES[s.toLowerCase().trim()]||s.toLowerCase().replace(/\s/g,'');}
import { isHoliday, getHolidayAdj } from '../utils/holidays.js';
import { DEFAULT_TARGETS, DEFAULT_MODEL_ASSIGNMENTS, MODEL_ASSIGNMENT_KEY, DEF_SETTINGS, AE_DI_PARAMS, STORE_COORDS } from '../constants.js';
import { TH, grade } from '../utils/fmt.js';
import { metricDaily, metricAvg, metricSeries } from './metric-source.js';
import { weightedRecencyProjection, robustBaseline, median, mad, _isNum as _stIsNum } from './smart-targets.js';
import { impactWeight } from './events-import.js';

// ── Event Impact Registry cache (Notes 47) — { normLoc: { eventType: {home, away} } } ─────────────
// Set once on app load from Supabase (loadEventImpact). Read in forecastDay's _evFactor so measured
// per-store event lifts drive the forecast. Module-level so it doesn't thread through every call site.
let _EVENT_IMPACT = {};
export function setEventImpact(map) { _EVENT_IMPACT = map || {}; }
export function getEventImpact() { return _EVENT_IMPACT; }

// ── Model assignment cache  (v4.208 — performance) ──────────────────────────
// getModelAssignment() is called from forecastDay() itself — the single most
// frequently-invoked function in the app — plus per-store loops in Priority
// Brief, ModelAssignmentPanel's distribution counts, and its table rendering.
// A single Why Engine district scan alone makes 1,500+ forecastDay calls; each
// was independently re-running JSON.parse on the full assignment blob just to
// read one store's one horizon. Parse once, cache it, invalidate explicitly
// on every write path (saveModelOverride, clearOvr, the backtest engine) —
// never silently stale, just never re-parsed when nothing changed.
let _masgnCache = null;
function _masgnBlob(){
  if(_masgnCache===null){
    try{ _masgnCache = JSON.parse(localStorage.getItem(MODEL_ASSIGNMENT_KEY)||'{}'); }
    catch{ _masgnCache = {}; }
  }
  return _masgnCache;
}
function _masgnInvalidate(){ _masgnCache=null; }

function getModelAssignment(loc, horizon, settings) {
  const ovr = _masgnBlob();
  if(ovr[loc]&&ovr[loc][horizon]) return ovr[loc][horizon];
  const def = DEFAULT_MODEL_ASSIGNMENTS[loc];
  if(def&&def[horizon]) return def[horizon];
  if(settings&&settings.dialedInEnabled&&settings.dialedIn&&settings.dialedIn[loc]) return {model:'di',mape:null,ref:'DI fallback'};
  return {model:'dow',mape:null,ref:'DOW fallback'};
}
function saveModelOverride(loc, horizon, modelCode) {
  try{
    const ovr = _masgnBlob(); // reuse cache as the base — no redundant parse
    if(!ovr[loc]) ovr[loc]={};
    ovr[loc][horizon]={model:modelCode,mape:null,ref:'User override '+new Date().toLocaleDateString()};
    localStorage.setItem(MODEL_ASSIGNMENT_KEY,JSON.stringify(ovr));
    _masgnCache=ovr; // cache already reflects this write — no need to invalidate+reparse
  }catch{}
}

function computeMAPEDrift(loc, ds, settings) {
  if(!ds||!ds.laborRows) return null;
  const anchor=ds.lastActual&&ds.lastActual[loc]?ds.lastActual[loc]:new Date();
  const cut2=addD(anchor,-14), cut6=addD(anchor,-42);
  const _locLab=locRows(ds.laborByLoc,ds.laborRows,loc);
  const rows6=_locLab.filter(r=>r.date>=cut6&&r.date<=anchor&&r.sales>0);
  if(rows6.length<7) return null;
  const rows2=rows6.filter(r=>r.date>=cut2);
  const errOf=rows=>rows.map(r=>{
    const fc=forecastDay(loc,r.date,ds,settings,null,null);
    if(!fc||fc.isFuture||!fc.actual||fc.actual<=0||!fc.forecast) return null;
    return Math.abs(fc.actual-fc.forecast)/fc.actual*100;
  }).filter(e=>e!==null);
  const err6=errOf(rows6), err2=errOf(rows2);
  if(!err6.length) return null;
  const mape6=err6.reduce((a,b)=>a+b,0)/err6.length;
  const mape2=err2.length?err2.reduce((a,b)=>a+b,0)/err2.length:mape6;
  const drift=Math.abs(mape2-mape6);
  return{mape2w:+mape2.toFixed(1),mape6w:+mape6.toFixed(1),drift:+drift.toFixed(1),
    status:drift>=5?'recalibrate':drift>=2?'warn':'ok'};
}

// ── Enhancement 4: Confidence Interval ───────────────────────────────────────
// Computes σ from recent forecast errors — returns sigma as a fraction (e.g. 0.06 = 6%)
function computeStoreSigma(loc, ds, settings, weeks=8) {
  if(!ds||!ds.laborRows) return null;
  const anchor=ds.lastActual&&ds.lastActual[loc]?ds.lastActual[loc]:new Date();
  const cutoff=addD(anchor,-weeks*7);
  const _locLab=locRows(ds.laborByLoc,ds.laborRows,loc);
  const rows=_locLab.filter(r=>r.date>=cutoff&&r.date<=anchor&&r.sales>0);
  if(rows.length<7) return null;
  const errors=rows.map(r=>{
    const fc=forecastDay(loc,r.date,ds,settings,null,null);
    if(!fc||fc.isFuture||!fc.actual||fc.actual<=0) return null;
    return (fc.actual-fc.forecast)/fc.actual;
  }).filter(e=>e!==null&&Math.abs(e)<0.40);
  if(errors.length<5) return null;
  const mean=errors.reduce((a,b)=>a+b,0)/errors.length;
  const sigma=Math.sqrt(errors.reduce((a,b)=>a+(b-mean)**2,0)/errors.length);
  return +sigma.toFixed(4);
}

// Store org lookup — used to segment district comparisons (FL vs OK)
const getStoreOrg = loc => (STORE_COORDS[loc]&&STORE_COORDS[loc].org)||'MCDOK';

function getWeatherNote(loc, date, ds){
  const wx=ds?.wxByDate;
  if(!wx) return null;
  const dk=dKey(date);
  const key=loc+'_'+dk;
  const w=wx[key];
  if(!w) return null;
  const notes=[];
  // Compute monthly norm from all weather rows for this loc/month
  const month=date.getMonth()+1;
  const allSameMon=(ds.weatherRows||[]).filter(r=>
    String(r.loc)===String(loc)&&r.date instanceof Date&&r.date.getMonth()+1===month&&r.tavg!=null);
  const norm=allSameMon.length?allSameMon.reduce((a,r)=>a+r.tavg,0)/allSameMon.length:null;
  if(w.tmax!=null&&w.tmax>100) notes.push(`Extreme heat (${w.tmax.toFixed(0)}°F high)`);
  else if(w.tmin!=null&&w.tmin<20) notes.push(`Severe cold (${w.tmin.toFixed(0)}°F low)`);
  else if(norm&&w.tavg!=null&&Math.abs(w.tavg-norm)>=15)
    notes.push(`${w.tavg>norm?'Warm':'Cold'} day (${w.tavg.toFixed(0)}°F, ${w.tavg>norm?'+':''}${(w.tavg-norm).toFixed(0)}°F from norm)`);
  if(w.rain!=null&&w.rain>0.5) notes.push(`Heavy rain (${w.rain.toFixed(2)}")`);
  else if(w.rain!=null&&w.rain>0.1) notes.push(`Light rain (${w.rain.toFixed(2)}")`);
  if(w.wspd!=null&&w.wspd>40) notes.push(`High winds (${w.wspd.toFixed(0)} mph)`);
  return notes.length ? '🌤 '+notes.join(' · ') : null;
}

// ── Weather extreme day check — used by AE calibration outlier filter ─────────
function isWeatherExtreme(loc, date, ds){
  const wx=ds?.wxByDate;
  if(!wx) return false;
  const w=wx[loc+'_'+dKey(date)];
  if(!w) return false;
  return (w.tmax>105||w.tmin<15||w.rain>0.75||w.wspd>50);
}

// ── EWMA DOW: Exponentially Weighted Moving Average same-day-of-week ─────────
// alpha=0.25: each prior week gets 25% less weight than the previous
// Responds 2-3x faster than simple rolling average to structural shifts
function forecastEWMA(laborRows, laborIdx, loc, date, alpha){
  alpha = alpha || 0.25;
  const dow = date.getDay();
  const byDate = {};
  (laborRows||[]).forEach(r=>{if(String(r.loc)===String(loc)&&r.sales>0&&!r.isPeriodSummary)byDate[dKey(r.date)]=r.sales;});
  const peers = Object.entries(byDate)
    .map(([dk,v])=>({d:new Date(dk+'T00:00:00'),v}))
    .filter(({d,v})=>d<date && d.getDay()===dow && v>0)
    .sort((a,b)=>b.d-a.d)
    .slice(0,14);
  if(peers.length<3) return null;
  const weights=peers.map((_,i)=>alpha*Math.pow(1-alpha,i));
  const tw=weights.reduce((a,b)=>a+b,0);
  return weights.reduce((sum,w,i)=>sum+w*peers[i].v,0)/tw;
}

// ── Simple trailing-average model (v4.532) ───────────────────────────────────
// The trailing family that beat every engineered model for period totals in the
// Smart Targets backtest (v4.483 — T3M/T6W/T3W, simple wins ~5% MAPE vs 8–14%).
// Propagated here as a first-class day-level forecast so the whole projection
// ecosystem (Monthly Projections, Forecast Accuracy, Model Assign, Proj-vs-
// Actuals — all route through forecastDay) can use it and re-validate it via
// backtest. The daily engine needs weekday granularity that a pure period total
// doesn't, so: take the robust blended trailing DAILY RATE
// (weightedRecencyProjection, reused verbatim — one implementation, per the
// consolidation rule) and multiply by a same-DOW SHAPE. A full month of these
// sums back to (trailing daily rate × days) — i.e. the winning monthly method —
// while any single day still respects its weekday. Strictly pre-`asOf` (leak-
// free), matching the ae/ewma information horizon so any win is credible.
function _dowShape(series, asOf, dow, days){
  const end = asOf instanceof Date ? new Date(asOf) : new Date(asOf);
  if(Number.isNaN(+end)) return 1;
  const start = new Date(end); start.setDate(start.getDate()-days);
  const all=[], same=[];
  for(const r of series||[]){
    const dt = r.date instanceof Date ? r.date : new Date(r.date);
    if(Number.isNaN(+dt)) continue;
    if(dt>=start && dt<end && _stIsNum(r.value)){
      all.push(r.value);
      if(dt.getDay()===dow) same.push(r.value);
    }
  }
  if(same.length<2 || all.length<7) return 1;              // too thin to shape → leave flat
  const allB = robustBaseline(all).baseline, sameB = robustBaseline(same).baseline;
  if(!(allB>0) || !_stIsNum(sameB)) return 1;
  // Clamp so a thin same-DOW sample can't blow up (a weekend can legitimately run
  // ~1.4× a weekday; beyond that is almost certainly noise, not signal).
  return Math.max(0.5, Math.min(1.8, sameB/allB));
}

// Returns {sales, gc} or null (thin history → caller falls through to the engineered pipeline).
function forecastSimple(locLaborRows, loc, date, asOf){
  const _series = (fld) => (locLaborRows||[])
    .filter(r=>r && r.date instanceof Date && !r.isPeriodSummary && r[fld]>0)
    .map(r=>({date:r.date, value:r[fld]}));
  const sSeries = _series('sales');
  if(sSeries.length<14) return null;                        // not enough trailing history to be "simple-proven"
  const wr = weightedRecencyProjection(sSeries, {asOf, targetDays:1});
  if(!wr || !_stIsNum(wr.dailyRate) || wr.dailyRate<=0) return null;
  // Holiday awareness (2026-09-11): 'simple' has no LY/seasonal component to anchor against,
  // unlike the engineered pipeline below (which corrects LY when today's/LY's holiday status
  // differ) -- it's pure trailing-rate x same-DOW-shape, so a fixed holiday (July 4, New Year's
  // Day, ...) was forecast as an ordinary day of that weekday. Measured against real MBI-vs-
  // LifeLenz backtest data (memory/finding-simple-model-holiday-blindness-2026-09-11.md):
  // holiday days averaged 12.59% MAPE for 'simple' vs 9.87% for LifeLenz's own forecast --
  // roughly 3x the ~0.8pp gap 'simple' shows on ordinary days. getHolidayAdj's own date lookups
  // only ever reference yrsBack>=1 prior years, so this stays leak-free regardless of what
  // locLaborRows otherwise contains.
  const holidayMult = isHoliday(date) ? getHolidayAdj(date, loc, locLaborRows) : 1;
  const sales = wr.dailyRate * _dowShape(sSeries, asOf, date.getDay(), 90) * holidayMult;
  let gc = 0;
  const gSeries = _series('gc');
  if(gSeries.length>=14){
    const g = weightedRecencyProjection(gSeries, {asOf, targetDays:1});
    if(g && _stIsNum(g.dailyRate) && g.dailyRate>0) gc = g.dailyRate * _dowShape(gSeries, asOf, date.getDay(), 90) * holidayMult;
  }
  return { sales, gc };
}

// ── Adaptive DI: EWMA-windowed DI blend with per-store calibration ────────────
function forecastAdaptiveDI(laborRows, laborIdx, loc, date, params){
  const p = params || AE_DI_PARAMS[String(loc)] || {w2:0.4,w4:0.35,w6:0.25,alpha:0.20};
  const {w2,w4,w6,alpha} = p;
  const dow = date.getDay();
  const byDate = {};
  (laborRows||[]).forEach(r=>{if(String(r.loc)===String(loc)&&r.sales>0&&!r.isPeriodSummary)byDate[dKey(r.date)]=r.sales;});

  function ewmaWindow(days){
    const cutoff=addDR(date,-days);
    const peers=Object.entries(byDate)
      .map(([dk,v])=>({d:new Date(dk+'T00:00:00'),v}))
      .filter(({d,v})=>d>=cutoff&&d<date&&d.getDay()===dow&&v>0)
      .sort((a,b)=>b.d-a.d);
    if(!peers.length) return null;
    const ws=peers.map((_,i)=>alpha*Math.pow(1-alpha,i));
    const tw=ws.reduce((a,b)=>a+b,0);
    return ws.reduce((s,w,i)=>s+w*peers[i].v,0)/tw;
  }
  const t2=ewmaWindow(14), t4=ewmaWindow(28), t6=ewmaWindow(42);
  const valid=[[w2,t2],[w4,t4],[w6,t6]].filter(([,v])=>v!=null);
  if(!valid.length) return null;
  const tw=valid.reduce((a,[w])=>a+w,0);
  return valid.reduce((s,[w,v])=>s+w*v,0)/tw;
}

// ── Adaptive Ensemble: Multi-signal blend with weekend-aware weights ──────────
// Signals: EWMA-DOW + LY-Adjusted + Short-term momentum + Monthly seasonality
// Weekend weights lean heavily on LY (captures seasonal patterns better)
// District avg 9.29% MAPE vs Lifelenz 9.51% — same Sep 2025–May 2026 window
function forecastAdaptiveEnsemble(laborRows, laborIdx, loc, date, fixedParams){
  const str = String(loc);
  const isWeekend = (date.getDay()===0||date.getDay()===6);
  const byDate = {};
  (laborRows||[]).forEach(r=>{if(String(r.loc)===str&&r.sales>0&&!r.isPeriodSummary)byDate[dKey(r.date)]=r.sales;});

  // Signal 1: EWMA DOW
  const sEWMA = forecastEWMA(laborRows, laborIdx, loc, date, isWeekend?0.30:0.22);

  // Signal 2: LY Adjusted (seasonal anchor — critical for weekends and post-holiday)
  const sLY = (()=>{
    let lyVal=null;
    for(let delta=0;delta<=3;delta++){
      const tryDates=[364+delta,364-delta].map(d=>addDR(date,-d));
      for(const ld of tryDates){
        const v=byDate[dKey(ld)];
        if(v&&v>0){lyVal=v;break;}
      }
      if(lyVal) break;
    }
    if(!lyVal) return null;
    const recent=Object.entries(byDate).filter(([dk])=>{
      const d=new Date(dk+'T00:00:00');
      return d>=addDR(date,-90)&&d<date;
    }).map(([,v])=>v).filter(v=>v>0);
    const ly90=Object.entries(byDate).filter(([dk])=>{
      const d=new Date(dk+'T00:00:00');
      return d>=addDR(date,-454)&&d<addDR(date,-364);
    }).map(([,v])=>v).filter(v=>v>0);
    let adj=0;
    if(recent.length&&ly90.length){
      adj=(recent.reduce((a,b)=>a+b)/recent.length)/(ly90.reduce((a,b)=>a+b)/ly90.length)-1;
      adj=Math.max(-0.20,Math.min(0.20,adj));
    }
    return lyVal*(1+adj);
  })();

  // Signal 3: Short-term momentum (recent 2W vs prior 2W, same DOW)
  const sMomentum = (()=>{
    if(!sEWMA) return null;
    const dow=date.getDay();
    const recent2W=Object.entries(byDate).filter(([dk])=>{
      const d=new Date(dk+'T00:00:00');
      return d>=addDR(date,-14)&&d<date&&d.getDay()===dow;
    }).map(([,v])=>v).filter(v=>v>0);
    const prior2W=Object.entries(byDate).filter(([dk])=>{
      const d=new Date(dk+'T00:00:00');
      return d>=addDR(date,-28)&&d<addDR(date,-14)&&d.getDay()===dow;
    }).map(([,v])=>v).filter(v=>v>0);
    if(!recent2W.length||!prior2W.length) return null;
    const factor=Math.max(0.85,Math.min(1.15,(recent2W.reduce((a,b)=>a+b)/recent2W.length)/(prior2W.reduce((a,b)=>a+b)/prior2W.length)));
    return sEWMA*factor;
  })();

  // Signal 4: Monthly seasonality factor
  const sSeasonal = (()=>{
    if(!sEWMA) return null;
    const dow=date.getDay();
    const thisMon=Object.entries(byDate).filter(([dk])=>{
      const d=new Date(dk+'T00:00:00');
      return d<date&&d.getDay()===dow&&d.getMonth()===date.getMonth();
    }).map(([,v])=>v).filter(v=>v>0);
    const allSameDow=Object.entries(byDate).filter(([dk])=>{
      const d=new Date(dk+'T00:00:00');
      return d<date&&d.getDay()===dow;
    }).map(([,v])=>v).filter(v=>v>0);
    if(thisMon.length<4||!allSameDow.length) return null;
    const factor=Math.max(0.80,Math.min(1.20,(thisMon.reduce((a,b)=>a+b)/thisMon.length)/(allSameDow.reduce((a,b)=>a+b)/allSameDow.length)));
    return sEWMA*factor;
  })();

  // Blend weights — weekend lean on LY (seasonal anchor)
  // Read recalibrated DI params if available (auto-updated on file load).
  // fixedParams (v4.537): skip the localStorage-recalibrated params and use the
  // static defaults instead. Those recalibrated params are grid-fit on the store's
  // FULL history, so in a backtest they carry a mild in-sample lookahead through
  // the DI sub-signal (~13% of the blend). A strictly leak-free re-validation (the
  // Period-Total Scoreboard) passes fixedParams=true so AE is graded ex-ante with
  // no window-fit params — closing the last asterisk on an AE win.
  const _storedParams=fixedParams?{}:(()=>{try{const s=JSON.parse(localStorage.getItem('mf_ae_params')||'{}');return s.params||{};}catch{return{};}})();
  const _diP=_storedParams[str]||AE_DI_PARAMS[str]||{w2:0.4,w4:0.35,w6:0.25,alpha:0.20};

  // Signal 5: Adaptive DI — genuinely incorporated using calibrated per-store params
  const sAdDI = forecastAdaptiveDI(laborRows, laborIdx, loc, date, _diP);

  // FL interstate stores get higher LY weight (annual highway traffic dominates)
  const _flI=['6178','6838','10034','35242','37566','38609'].includes(str);
  const W = _flI
    ? (isWeekend?{ewma:0.15,ly:0.55,momentum:0.05,seasonal:0.10,di:0.15}
                :{ewma:0.20,ly:0.50,momentum:0.10,seasonal:0.10,di:0.10})
    : (isWeekend?{ewma:0.22,ly:0.45,momentum:0.08,seasonal:0.10,di:0.15}
                :{ewma:0.35,ly:0.27,momentum:0.13,seasonal:0.12,di:0.13});

  const signals=[[W.ewma,sEWMA],[W.ly,sLY],[W.momentum,sMomentum],[W.seasonal,sSeasonal],[W.di,sAdDI]];
  const valid=signals.filter(([,v])=>v!=null&&v>0);
  if(valid.length<2) return sEWMA||sLY;
  const tw=valid.reduce((a,[w])=>a+w,0);
  return valid.reduce((s,[w,v])=>s+w*v,0)/tw;
}

const _wxCache = {};
function getForecastWeather(loc, date) {
  return _wxCache[loc+'_'+dKey(date)] || null;
}

// Auto-first fallback index over the DAR summary (qsrActSummaryRows), lazily built and
// cached on the ds object. Lets forecast/actual reads fall back to the auto-synced DAR for
// completed days that never got a manual Operations Report upload (fixes the forecast table's
// blank current-week Actual / GC columns — Notes 27 #2). Rebuilt automatically when ds changes
// (setDs makes a new object, so the non-enumerable cache is absent on the new one).
function _qsrActIdx(ds){
  if(!ds) return null;
  if(!ds._qsrActIdx){
    const idx={};
    for(const r of (ds.qsrActSummaryRows||[])){ if(!r.loc||!r.date)continue; const k=r.loc+'_'+dKey(r.date); (idx[k]||(idx[k]=[])).push(r); }
    try{ Object.defineProperty(ds,'_qsrActIdx',{value:idx,enumerable:false,configurable:true}); }catch{ ds._qsrActIdx=idx; }
  }
  return ds._qsrActIdx;
}
function fetchRow(idx,loc,date,field){
  if(!idx)return field?0:null; // ops/ctrl/weather indices are optional — absent = no row
  const rows=idx[loc+'_'+dKey(date)];
  if(!rows||!rows.length)return field?0:null;
  if(!field) return rows.find(r=>!r.isPeriodSummary)||rows[0];
  // Prefer non-period-summary rows; period-summary rows have inflated multi-day totals.
  // Among eligible rows, pick the one with the highest value for the requested field.
  const eligible=rows.filter(r=>!r.isPeriodSummary);
  const pool=eligible.length?eligible:rows;
  if(pool.length===1) return pool[0][field]||0;
  const best=pool.reduce((b,r)=>(r[field]||0)>(b[field]||0)?r:b, pool[0]);
  return best[field]||0;
}
// Weather lookup: use date-only index since Mesonet uses station IDs not store IDs
function fetchWx(ds, date, loc){
  if(!ds) return null;
  const dk = dKey(date);
  // Try loc-specific key first (Open-Meteo per-store data)
  if(loc && ds.wxByDate){
    const lk = String(loc)+'_'+dk;
    if(ds.wxByDate[lk]) return ds.wxByDate[lk];
  }
  // Fall back to date-only (Mesonet regional or last-store-wins)
  if(ds.wxByDate) return ds.wxByDate[dk]||null;
  // Last resort: scan weatherRows directly
  if(ds.weatherRows&&ds.weatherRows.length){
    return ds.weatherRows.find(r=>String(r.loc)===String(loc)&&dKey(r.date)===dk)
        || ds.weatherRows.find(r=>dKey(r.date)===dk)
        || null;
  }
  return null;
}

// ── Per-store row index  (v4.206 — performance) ─────────────────────────────
// avg6()/compute6wk() were each independently re-scanning the FULL multi-year,
// all-27-store rows array per field requested — compute6wk alone makes ~28
// avg6() calls, run 3x per store (p/p2/p4 windows) x 27 stores = ~2,000+ full
// array passes every time the store list recomputes. bLocIdx() groups rows by
// store ONCE; locRows() retrieves a store's slice in O(1) instead of O(n),
// with a safe .filter() fallback for any ds shape built before this existed.
function bLocIdx(rows){
  const idx={};
  for(const r of (rows||[])){
    if(!r.loc) continue;
    if(!idx[r.loc]) idx[r.loc]=[];
    idx[r.loc].push(r);
  }
  return idx;
}
function locRows(idxObj, fallbackRows, loc){
  if(idxObj && idxObj[loc]) return idxObj[loc];
  if(idxObj && idxObj[String(loc)]) return idxObj[String(loc)];
  return (fallbackRows||[]).filter(r=>r.loc===loc);
}

// Extracted from the 'ae'/'ewma'/'simple' branches' own inline _aeAct/_ewmaAct/_sAct IIFEs
// (dispatch22, Workstream A) — the SAME "most-recent-actual" lookup those branches already
// did independently: manual ds.laborRows first (same-day match, excluding period-summary
// rows), falling back to the auto-synced DAR (_qsrActIdx). Exported so a caller sitting on a
// PRECOMPUTED forecast (a cache — see scripts/forecast-week-precompute.mjs) can still get a
// live-fresh actual without re-running forecastDay's whole (expensive) forecast computation
// just to reach this cheap tail of it — a second hand-copy of this same filter+fallback would
// only need to drift once to make a cached row and a live-computed row disagree on "actual"
// for the exact same store/day, which is worse than the render cost this is meant to fix.
function fetchRecentActual(ds, loc, date, field='sales'){
  if(!ds) return 0;
  const _rows = locRows(ds.laborByLoc, ds.laborRows, loc);
  const rr = _rows.filter(r=>r.date instanceof Date&&Math.abs(r.date-date)<86400000&&!r.isPeriodSummary);
  return (rr.length ? (rr[0][field]||0) : 0) || fetchRow(_qsrActIdx(ds), loc, date, field);
}

// obs6() (manual-rows-only observation counting) removed 2026-10-13, mass-review notes 70 —
// compute6wk()'s `_cov` coverage map now counts via metricSeries() (the same auto-first chain
// M() itself resolves through), not raw ctrlL/opsL. See the comment above `_cov`'s construction
// in compute6wk() for the bug this replaces. Same fate as avg6() (removed 2026-09-07) once its
// last caller migrated.

// SECTION 5: ANALYTICS ENGINE
//
// Robust, tag-INDEPENDENT replacement for "is this candidate day excluded?" (v4.924). Owner
// directive: "the only time a date should be excluded from forecasting is if it is a true
// anomaly in sales or GC" — tagging an event is informational (a human explanation for a swing),
// never itself a reason to drop a day. A prior version skipped any candidate with a user-event
// tag, full stop, with no check on whether that day's actual value was unusual at all. That
// silently became catastrophic once a store had many tagged days: on 2026-08-08 Tishomingo had
// 450 tagged days, so every candidate came back excluded and calibration died district-wide
// (the fix at the time was a tag-ignoring second pass — a patch, not a redesign). This replaces
// tag presence with the SAME median ± k·MAD outlier test already proven elsewhere in this
// codebase (robustBaseline, Smart Targets, the "Simple" model): a candidate is dropped only if
// its own actual value doesn't look like it belongs with its peers — the other same-DOW
// candidates in this same offset window. Holidays are still excluded before the statistical
// test runs, because a closure genuinely has no comparable sales to test in the first place.
function _robustCandidates(found, k = 3) {
  if (found.length <= 1) return found; // nothing to compare against — nothing to judge
  const vals = found.map(f => f.v);
  const med = median(vals), md = mad(vals, med);
  const thr = md != null && md > 0 ? 1.4826 * md * k : Infinity;
  const clean = found.filter(f => Math.abs(f.v - med) <= thr);
  return clean.length ? clean : found; // never end up with zero purely from the filter
}
function fetchLY(lIdx,lRows,loc,date){
  // Returns the ACTUAL historical sales for the same DOW, ~52 weeks back.
  // Priority chain: -364 (same DOW, exactly 52wk), then -357/-371/-378/-350 as fallbacks.
  // NO blending across multiple dates — LY must match real data the user can verify.
  // NO outlier dampening on the RETURNED value — that was creating synthetic values that
  //   didn't correspond to any real sales day, breaking user trust and distorting forecasts.
  //   The outlier test below only decides which CANDIDATE to use, never alters the value.
  const tDow = dowOf(date);
  const candidates = [-364,-357,-371,-378,-350,-385,-343];
  const found = [];
  for(const off of candidates){
    const dt = addD(date, off);
    if(dowOf(dt)!==tDow) continue;          // must be same day of week
    if(isHoliday(dt)) continue;             // closures: no comparable sales, not testable
    const v = fetchRow(lIdx, loc, dt, 'sales');
    if(v>0) found.push({off,v});
  }
  if(!found.length) return 0;
  const clean = _robustCandidates(found);
  for(const off of candidates){             // priority order preserved among survivors
    const hit = clean.find(f=>f.off===off);
    if(hit) return hit.v;
  }
  return 0;
}

// Get how many days of history a store has
// fetchLYDate — returns the actual calendar date used for the LY lookup (for UI display).
// Mirrors fetchLY's priority chain + outlier test exactly so the displayed date always matches
// the value fetchLY actually used — if these two drift, the UI attributes a number to the wrong day.
function fetchLYDate(lIdx, loc, date){
  const tDow=dowOf(date);
  const candidates=[-364,-357,-371,-378,-350,-385,-343];
  const found=[];
  for(const off of candidates){
    const dt=addD(date,off);
    if(dowOf(dt)!==tDow)continue;
    if(isHoliday(dt))continue;
    const v=fetchRow(lIdx,loc,dt,'sales');
    if(v>0) found.push({off,dt,v});
  }
  if(!found.length) return addD(date,-364); // default to 52-week prior if no data
  const clean=_robustCandidates(found);
  for(const off of candidates){
    const hit=clean.find(f=>f.off===off);
    if(hit) return hit.dt;
  }
  return addD(date,-364);
}

// fetchGC — actual historical guest count for same DOW, 52 weeks back (mirrors fetchLY)
function fetchGC(lIdx,lRows,loc,date){
  const tDow=dowOf(date);
  const candidates=[-364,-357,-371,-378,-350,-385,-343];
  const found=[];
  for(const off of candidates){
    const dt=addD(date,off);
    if(dowOf(dt)!==tDow)continue;
    if(isHoliday(dt))continue;
    const v=fetchRow(lIdx,loc,dt,'gc')||fetchRow(lIdx,loc,dt,'guestCount')||0;
    if(v>0) found.push({off,v});
  }
  if(!found.length) return 0;
  const clean=_robustCandidates(found);
  for(const off of candidates){
    const hit=clean.find(f=>f.off===off);
    if(hit) return hit.v;
  }
  return 0;
}

// gcCrossCheck — validate sales forecast against GC forecast
// Returns {gcForecast, impliedCheck, normCheck, deviation, flag}
// flag: null | 'watch' (>10%) | 'alert' (>20%)
function gcCrossCheck(loc,date,ds,settings,salesForecast){
  const gcLY=fetchGC(ds.laborIdx,ds.laborRows,loc,date);
  if(!gcLY||gcLY<1)return null;

  // GC trend — use same trend signal as sales
  const tDow=dowOf(date);
  const today=new Date();
  const eDt=(ds.lastActual&&ds.lastActual[loc])||today;
  const gcTrend=getDOWTrend(ds.laborIdx,loc,date,eDt,1,2)*0.5+
                getDOWTrend(ds.laborIdx,loc,date,eDt,3,4)*0.3+
                getDOWTrend(ds.laborIdx,loc,date,eDt,5,6)*0.2;
  const gcForecast=Math.round(gcLY*(1+gcTrend));
  if(gcForecast<1)return null;

  // Implied average check from sales forecast
  const impliedCheck=salesForecast/gcForecast;

  // Store's 6-week rolling avg check norm
  const cut6=addD(today,-42);
  const normRows=(ds.laborRows||[]).filter(r=>r.loc===loc&&r.date>=cut6&&r.sales>0&&r.gc>0);
  if(normRows.length<5)return null;
  const normCheck=normRows.reduce((a,r)=>a+r.sales/r.gc,0)/normRows.length;
  if(normCheck<0.5)return null;

  const deviation=(impliedCheck-normCheck)/normCheck;
  const flag=Math.abs(deviation)>0.20?'alert':Math.abs(deviation)>0.10?'watch':null;

  return{gcForecast,impliedCheck:+impliedCheck.toFixed(2),
    normCheck:+normCheck.toFixed(2),deviation:+deviation.toFixed(4),flag};
}

function storeAgeDays(laborRows, loc) {
  const rows = laborRows.filter(r=>r.loc===loc&&r.sales>0&&r.date);
  if(!rows.length) return 0;
  const first = rows.reduce((a,r)=>r.date<a?r.date:a, rows[0].date);
  return Math.round((Date.now()-first.getTime())/864e5);
}

// Ramp model for new stores (<365 days of history)
// Uses rolling actual averages by DOW, falling back to district avg
function fetchRampSales(laborRows, laborIdx, loc, date, ds) {
  const ageDays = storeAgeDays(laborRows, loc);
  const dow = dowOf(date);
  const today = new Date();

  // How many weeks of actuals to use based on age
  let lookbackDays;
  if(ageDays < 14)        lookbackDays = ageDays;        // all we have
  else if(ageDays < 42)   lookbackDays = 14;              // 2 weeks
  else if(ageDays < 98)   lookbackDays = 28;              // 4 weeks
  else                    lookbackDays = 42;              // 6 weeks

  if(lookbackDays < 3) {
    // Brand new — use district DOW average
    const districtRows = (ds.laborRows||[]).filter(r=>r.date>=addD(today,-42)&&r.sales>0&&r.loc!==loc);
    const dowRows = districtRows.filter(r=>dowOf(r.date)===dow);
    if(dowRows.length>=3) return dowRows.reduce((a,r)=>a+r.sales,0)/dowRows.length * 0.65; // new stores open at ~65% of district avg
    return 0;
  }

  // Rolling average of same DOW actuals
  const cutoff = addD(date, -lookbackDays);
  const myRows = (ds.laborRows||[]).filter(r=>r.loc===loc&&r.sales>0&&r.date>=cutoff&&r.date<today&&dowOf(r.date)===dow);
  if(myRows.length>=1) return myRows.reduce((a,r)=>a+r.sales,0)/myRows.length;

  // Fallback: any recent actuals for this DOW
  const anyRows = (ds.laborRows||[]).filter(r=>r.loc===loc&&r.sales>0&&dowOf(r.date)===dow);
  if(anyRows.length>=1) {
    const sorted = anyRows.sort((a,b)=>b.date-a.date);
    return sorted.slice(0,4).reduce((a,r)=>a+r.sales,0)/Math.min(sorted.length,4);
  }
  return 0;
}

// A same-DOW year-over-year growth point is only meaningful if BOTH days were normal trading
// days. A closure day has sales just above zero, and `ly > 0` alone lets it through as a
// DENOMINATOR — which is how the 6-Week Performance chart came to plot a 1,200,000% axis
// (Notes 62). Real examples in labor_rows: $8.98 on 2026-01-25, $9.38 on Christmas 2024,
// $30.07 on the 2025-01-22 ice storm. An $8.98 last-year denominator against a $10k day is
// +111,300%, and averaging even one of those destroys the trend it is meant to measure.
//
// THE BOUND IS MEASURED, NOT CHOSEN. Across 40,000 store-days in 26 stores, 39,357 (98.4%)
// fall at or above 70% of their own store's median day, and only 76 fall below 25%. Those 76
// are the closures and severe-weather days. A day at 25% of median against a median day is
// exactly +300% growth, so ±300% is where the real distribution ends and artifacts begin —
// the cut is the measurement, not a round number that felt safe.
//
// Points are DROPPED, not clamped: clamping a +12,000 outlier to +3 still drags the mean up
// and would keep reporting a fake surge. A closure is missing information, not a big number.
const YOY_MAX_GROWTH = 3.0;    // +300% — LY day at 25% of median vs a normal current day
const YOY_MIN_GROWTH = -0.75;  // -75%  — current day at 25% of median vs a normal LY day
const _yoyPoint = (cur, ly) => {
  if (!(cur > 0) || !(ly > 0)) return null;
  const g = (cur - ly) / ly;
  return (g > YOY_MAX_GROWTH || g < YOY_MIN_GROWTH) ? null : g;
};

function getDOWTrend(lIdx,loc,tDt,eDt,wkS,wkE){
  // Collect YOY growth for same DOW in the specific week range [wkS..wkE]
  const tDow=dowOf(tDt);const points=[];
  // Walk back from eDt, collect one same-DOW point per week in range
  let chk=new Date(eDt);let weekIdx=0;let lastSun=null;
  for(let att=0;att<wkE*14+14;att++){
    chk=addD(chk,-1);
    if(dowOf(chk)===0) weekIdx++; // crossed Sunday = new week back
    if(weekIdx>=wkS&&weekIdx<=wkE&&dowOf(chk)===tDow){
      const cur=fetchRow(lIdx,loc,chk,'sales');
      const ly=fetchRow(lIdx,loc,addD(chk,-364),'sales');
      { const _g=_yoyPoint(cur,ly); if(_g!==null) points.push(_g); }
    }
    if(weekIdx>wkE+1) break;
  }
  return points.length?points.reduce((a,v)=>a+v,0)/points.length:0;
}

// DOW-specific trend: YOY trend for THIS specific weekday only
function getDOWSpecificTrend(lIdx, loc, targetDow, eDt, weeksBack) {
  const points=[];
  let chk=new Date(eDt); let weekIdx=0;
  for(let att=0;att<weeksBack*14+14;att++){
    chk=addD(chk,-1);
    if(dowOf(chk)===0) weekIdx++;
    if(weekIdx<=weeksBack&&dowOf(chk)===targetDow){
      const cur=fetchRow(lIdx,loc,chk,'sales');
      const ly=fetchRow(lIdx,loc,addD(chk,-364),'sales');
      { const _g=_yoyPoint(cur,ly); if(_g!==null) points.push(_g); }
    }
    if(weekIdx>weeksBack+1) break;
  }
  return points.length>=3 ? points.reduce((a,v)=>a+v,0)/points.length : null;
}

// ── EMPIRICAL WEATHER CALIBRATION ────────────
// For each store, compute actual correlation between weather variables
// and sales deviation from DOW baseline using historical data.
// Returns {loc: {rain, hot, cold, wind}} coefficients.
function calibrateWeather(ds) {
  if(!ds||!ds.loaded||!ds.laborRows.length||!ds.weatherRows.length) return {};
  const result = {};
  const storeIds = ds.storeIds||[];

  for(const loc of storeIds) {
    const laborByDate = {};
    ds.laborRows.filter(r=>r.loc===loc&&r.sales>0)
      .forEach(r=>laborByDate[dKey(r.date)]=r);

    // Build DOW baselines (sunny, non-rain days only for clean baseline)
    const dowBase = {};
    for(const [dk, row] of Object.entries(laborByDate)) {
      const wRow = fetchWx(ds, row.date);
      if(wRow&&(wRow.rain||0)>0.1) continue; // exclude rainy days from baseline
      const d = row.date.getDay();
      if(!dowBase[d]) dowBase[d] = [];
      dowBase[d].push(row.sales);
    }
    const dowMean = {};
    for(const [d,vals] of Object.entries(dowBase)) {
      if(vals.length>=3) dowMean[d] = vals.reduce((a,v)=>a+v,0)/vals.length;
    }

    // Collect paired (weather, sales deviation) samples
    const rainSamples=[], hotSamples=[], coldSamples=[], windSamples=[];
    for(const [dk, row] of Object.entries(laborByDate)) {
      const wRow = fetchWx(ds, row.date);
      if(!wRow) continue;
      const baseline = dowMean[row.date.getDay()];
      if(!baseline) continue;
      const dev = (row.sales - baseline) / baseline; // fractional deviation

      if((wRow.rain||0)>0.1) rainSamples.push({x:wRow.rain, y:dev});
      if((wRow.tmax||0)>95)  hotSamples.push({x:(wRow.tmax-95)/10, y:dev});
      if((wRow.tmax||0)>0&&(wRow.tmax||0)<35) coldSamples.push({x:(35-wRow.tmax)/35, y:dev});
      if((wRow.wmax||0)>25)  windSamples.push({x:(wRow.wmax-25)/25, y:dev});
    }

    // Simple linear regression: y = slope * x
    function slope(samples) {
      if(samples.length<4) return null;
      const n=samples.length;
      const sx=samples.reduce((a,s)=>a+s.x,0), sy=samples.reduce((a,s)=>a+s.y,0);
      const sxy=samples.reduce((a,s)=>a+s.x*s.y,0), sx2=samples.reduce((a,s)=>a+s.x*s.x,0);
      const denom=n*sx2-sx*sx;
      if(Math.abs(denom)<1e-10) return null;
      return (n*sxy-sx*sy)/denom;
    }

    const rainCoef  = slope(rainSamples);
    const hotCoef   = slope(hotSamples);
    const coldCoef  = slope(coldSamples);
    const windCoef  = slope(windSamples);

    if(rainCoef!==null||hotCoef!==null) {
      result[loc] = {
        rain:  rainCoef  !==null ? Math.max(-0.15, Math.min(0.02, rainCoef))  : null,
        hot:   hotCoef   !==null ? Math.max(-0.10, Math.min(0.01, hotCoef))   : null,
        cold:  coldCoef  !==null ? Math.max(-0.08, Math.min(0.01, coldCoef))  : null,
        wind:  windCoef  !==null ? Math.max(-0.05, Math.min(0.01, windCoef))  : null,
        n:     rainSamples.length+hotSamples.length,
        calibrated: true
      };
    }
  }
  return result;
}

// ── DAYPART FORECAST ENGINE ──────────────────
// When 3 Peaks data is loaded, compute separate trend per daypart
// Returns {breakfast, lunch, dinner} forecast objects or null
function forecastDayparts(loc, date, ds, settings) {
  if(!ds||!ds.peaksSvcRows||!ds.peaksSvcRows.length) return null;
  if(!ds.peaksSalesRows||!ds.peaksSalesRows.length) return null;

  const locStr = String(loc||'').trim();
  const dow = date.getDay();
  const wb = settings.weeksBack||6;
  const slices = ['breakfast','lunch','dinner'];
  const sliceNames = {breakfast:'7–9 AM',lunch:'11 AM–2 PM',dinner:'5–7 PM'};
  const result = {};

  for(const sl of slices) {
    // Get all same-DOW sales rows for this slice for this store
    const salesRows = ds.peaksSalesRows
      .filter(r=>String(r.loc||'').trim()===locStr && normSlice(r.slice)===sl && r.date.getDay()===dow && r.netSales>0)
      .sort((a,b)=>b.date-a.date);

    if(salesRows.length < 3) continue;

    // T2W / T6W trend for this daypart + DOW
    const cut2 = new Date(date.getTime() - 14*86400000);
    const cut6 = new Date(date.getTime() - 42*86400000);
    const cutLY = new Date(date.getTime() - 364*86400000);

    const recent = salesRows.filter(r=>r.date<date&&r.date>=cut2);
    const mid    = salesRows.filter(r=>r.date<cut2&&r.date>=cut6);
    const ly     = salesRows.filter(r=>r.date>=cutLY&&r.date<cut2);

    const avgR = recent.length ? recent.reduce((a,r)=>a+r.netSales,0)/recent.length : 0;
    const avgM = mid.length    ? mid.reduce((a,r)=>a+r.netSales,0)/mid.length       : 0;
    const avgLY= ly.length     ? ly.reduce((a,r)=>a+r.netSales,0)/ly.length        : 0;

    const lyAnchor = avgLY>0 ? avgLY : (salesRows[salesRows.length-1]?.netSales||0);
    if(lyAnchor<=0) continue;

    const tw = settings.trendWeights||{t2:.5,t4:.3,t6:.2};
    const t2 = avgR>0&&lyAnchor>0 ? (avgR-lyAnchor)/lyAnchor : 0;
    const t6 = avgM>0&&lyAnchor>0 ? (avgM-lyAnchor)/lyAnchor : 0;
    const trend = t2*tw.t2 + t6*(tw.t4+tw.t6);
    const forecast = lyAnchor*(1+trend)*(1+(settings.plusUp||0)/100);

    // Service metrics avg for this daypart
    const svcRows = ds.peaksSvcRows
      .filter(r=>String(r.loc||'').trim()===locStr && normSlice(r.slice)===sl)
      .slice(0, wb*1); // recent entries
    const avgOepe = svcRows.length ? svcRows.reduce((a,r)=>a+(r.oepe||0),0)/svcRows.length : 0;
    const avgPark = svcRows.length ? svcRows.reduce((a,r)=>a+(r.parkPct||0),0)/svcRows.length : 0;

    result[sl] = {
      slice:sl, label:sliceNames[sl],
      lyAnchor, trend:+trend.toFixed(4), t2:+t2.toFixed(4), t6:+t6.toFixed(4),
      forecast:+forecast.toFixed(2),
      avgOepe:+avgOepe.toFixed(1), avgPark:+avgPark.toFixed(4),
      sampleCount:salesRows.length
    };
  }
  return Object.keys(result).length >= 2 ? result : null;
}

function getWxAdj(wIdx,loc,date,ws,empirical,ds){
  if(!ws||!ws.enabled)return 0;
  // Use fetchWx (date-only) since Mesonet uses station IDs, not store IDs
  let row = (ds?fetchWx(ds,date):null) || getForecastWeather(loc,date);
  if(!row)return 0;
  const{tmax=0,davg=0,havg=0,rain=0,rnum=0,wmax=0,mslp=0}=row;
  // Use empirical per-store coefficients when calibrated
  const emp=empirical&&empirical[loc];
  if(emp&&emp.calibrated){
    let adj=0;
    if(rain>0.1&&emp.rain!=null) adj+=emp.rain*Math.min(rain,3);
    if(tmax>95&&emp.hot!=null)   adj+=emp.hot*((tmax-95)/10);
    if(tmax>0&&tmax<35&&emp.cold!=null) adj+=emp.cold*((35-tmax)/35);
    if(wmax>25&&emp.wind!=null)  adj+=emp.wind*((wmax-25)/25);
    return Math.max(-.15,Math.min(.03,adj));
  }
  // Fallback: settings sliders
  let adj=0;
  if(tmax>100)adj+=ws.hotDay/100;else if(tmax>95)adj+=(ws.hotDay/100)*.6;
  if(tmax>0&&tmax<20)adj+=ws.coldDay/100;else if(tmax>0&&tmax<32)adj+=(ws.coldDay/100)*.5;
  if(tmax>=65&&tmax<=85)adj+=ws.niceDay/100;
  if(rain>.25){adj+=rnum>=3?(ws.lightRain/100)*1.3:ws.lightRain/100;if(rain>1.5)adj+=ws.heavyRain/100;}
  if(wmax>35)adj+=ws.highWind/100;if(wmax>50)adj+=ws.veryHighWind/100;
  if(davg>65)adj-=.01;if(davg>72)adj-=.01;
  if(havg>90&&tmax>80)adj-=.008;
  if(mslp>0&&mslp<1005)adj-=.008;
  return Math.max(-.10,Math.min(.03,adj));
}
// MODEL HEALTH SCORE — 0 to 100 per store
// CANONICAL implementation (dispatch #41, 2026-08-25). This used to be one of two independently-
// maintained 0-100 scorers in this file — `computeModelHealth` below was the other, feeding
// ModelHealthBadge while this one fed at-a-glance.js/store-analytics.js. Reconciled: this stays
// canonical (true-zero component floors, 6W→4W→full MAPE-window priority), and computeModelHealth
// is now a thin adapter over this function (see its own header) — both call sites see zero change.
// Measured before reconciling (throwaway fixture harness, not committed — see
// memory/dispatch-41.md ## Resolution for the numbers): on identical inputs the two functions
// disagreed by up to 17 points on a stale-calibration case and by 25 points on a drifting-MAPE
// case, and — independent of that disagreement — THIS function alone already had the
// floor-masking bug the dispatch flagged: a store with perfect Calibration/Freshness/Sample but a
// catastrophic 25-30% MAPE (Accuracy 0/25) still weighted-summed to 75/100, a green "Healthy"
// grade, because three healthy components diluted one true failure. The weakest-link gate below
// fixes that directly — it did not require picking one function's rubric over the other's.
function modelHealthScore(loc, ds, settings) {
  // New/ramp stores (recentOnly flag + no DI calibration yet) are exempt from
  // health scoring — they cannot satisfy calibration or MAPE requirements by
  // design. Return a neutral "Not applicable" grade so they don't pollute
  // district health dashboards.
  const _masgn = DEFAULT_MODEL_ASSIGNMENTS[loc];
  if(_masgn&&_masgn.recentOnly&&!(settings.dialedIn&&settings.dialedIn[loc])){
    // recentOnly conflates two different real situations (see backtest.js's own comment on this
    // flag): a genuinely new/ramp-up location with too little history for DI (Ponce de Leon,
    // opened 2026-03-13, monthly/yearly n:0), OR a long-open store with a documented early
    // bad-data period that DI's LY-based method still can't clear despite real AE/DOW/LY
    // calibration existing (Elgin/Mossy Head/Tishomingo — all n in the hundreds at monthly/
    // yearly horizons per DEFAULT_MODEL_ASSIGNMENTS). Labeling the second group "New Store" was
    // measured wrong 2026-09-06 (Tishomingo has been open >1 year with 503 days of yearly
    // calibration on record) — a data-sparse-for-DI store is not the same claim as a new store.
    const _hasLongRunCalibration = !!((_masgn.monthly&&_masgn.monthly.n>0)||(_masgn.yearly&&_masgn.yearly.n>0));
    if(_hasLongRunCalibration){
      return{score:null,grade:{label:'DI N/A',color:'#64748b',emoji:'🔵'},
        reasons:[{cat:'Status',pts:null,max:null,msg:'Established store — DI calibration not viable for this data pattern; AE/DOW/LY models calibrated instead'}],
        statement:'Established store. Dialed-In calibration is not viable for this store\'s data pattern (see model-assignment note), but simpler models (AE/DOW/LY) are calibrated and running — not a new-location gap.',
        samples:0,dataDaysOld:999,newStore:true,longRunCalibrated:true};
    }
    return{score:null,grade:{label:'New Store',color:'#64748b',emoji:'🔵'},
      reasons:[{cat:'Status',pts:null,max:null,msg:'New/ramp-up store — DI calibration not yet applicable'}],
      statement:'New or recently opened store. Health scoring not applicable until calibration window (typically 6 months of history).',
      samples:0,dataDaysOld:999,newStore:true,longRunCalibrated:false};
  }
  const di = settings.dialedIn&&settings.dialedIn[loc];
  const today = Date.now();
  let score = 0;
  const reasons = [];
  // 1. CALIBRATION STATUS (30 pts)
  if(!di){
    score+=0; reasons.push({cat:'Calibration',pts:0,max:30,msg:'Not calibrated — run Dialed-In'});
  } else {
    const dsc = di.runDate ? Math.floor((today-new Date(di.runDate).getTime())/864e5) : 999;
    let cp = dsc>30?15:dsc>14?22:30;
    // Settings-fingerprint check — fixed for real (dispatch #41). This used to compare
    // di.settingsFp against settings._fp, a field never assigned anywhere in the app (grepped
    // the whole src tree), so the -10 penalty fired on EVERY calibrated store unconditionally.
    // computeModelHealth had the mirror-image bug (compared against settings._settingsFp,
    // also never assigned, so its penalty never fired). Fixed by computing the CURRENT
    // settings' fingerprint the same way backtest.js's calibrateStore already stamps di.settingsFp
    // (JSON.stringify of the same two calibration-relevant fields), so the comparison is real.
    const _curSettingsFp = JSON.stringify({lyOutlierThreshold:settings.lyOutlierThreshold, opsNorm:settings.opsNorm});
    const fpChanged = di.settingsFp && di.settingsFp !== _curSettingsFp;
    if(fpChanged) cp=Math.max(0,cp-10);
    score+=cp;
    reasons.push({cat:'Calibration',pts:cp,max:30,
      msg:fpChanged?'Settings changed — re-run recommended':cp===30?'Current and matched':dsc>30?'Stale ('+dsc+'d) — re-run Dialed-In':dsc+'d ago'});
  }
  // 2. DATA FRESHNESS (25 pts)
  const _locLab=locRows(ds&&ds.laborByLoc,(ds&&ds.laborRows)||[],loc);
  const rows=_locLab.filter(r=>r.sales>0);
  const lastDt=rows.length?Math.max(...rows.map(r=>r.date instanceof Date?r.date.getTime():new Date(r.date).getTime())):0;
  const daysOld=lastDt?Math.floor((today-lastDt)/864e5):999;
  const fp=daysOld<3?25:daysOld<7?20:daysOld<14?12:daysOld<30?5:0;
  score+=fp;
  reasons.push({cat:'Data Freshness',pts:fp,max:25,
    msg:fp>=20?'Current ('+daysOld+'d)':rows.length?daysOld+'d old — refresh recommended':'No data loaded'});
  // 3. MAPE ACCURACY (25 pts) — use best available short-window MAPE, not full-period
  // mp/isDrifting hoisted to function scope (not just this block) — the weakest-link gate
  // below needs both: mp===0 is one of the gate's OR conditions, and a drifting store is
  // held out of a green grade even when mp itself still scores decently.
  let mp=0, isDrifting=false;
  if(di&&(di.mape6w!=null||di.mape4w!=null||di.mape!=null)){
    // Prefer 6W MAPE (most operationally relevant), fall back to 4W then full
    const m = di.mape6w!=null ? di.mape6w : di.mape4w!=null ? di.mape4w : di.mape;
    const m2=di.mape2w; const m6=di.mape6w;
    mp=m<5?25:m<8?20:m<12?13:m<18?6:0;
    isDrifting=m2!=null&&m6!=null&&m2>m6+5;
    if(isDrifting) mp=Math.max(0,mp-8);
    score+=mp;
    const drift=isDrifting?' (⚠ drifting)':'';
    const mLabel=di.mape6w!=null?'6W MAPE':di.mape4w!=null?'4W MAPE':'Full MAPE';
    reasons.push({cat:'Accuracy',pts:mp,max:25,msg:mp>=20?m.toFixed(2)+'% '+mLabel+drift:m.toFixed(2)+'% '+mLabel+' — recalibrate'+drift});
  } else {
    reasons.push({cat:'Accuracy',pts:0,max:25,msg:'Run Dialed-In to measure accuracy'});
  }
  // 4. SAMPLE SIZE (20 pts)
  const samp=di&&di.samples!=null?di.samples:rows.length;
  const sp=samp>=300?20:samp>=150?15:samp>=50?10:samp>=20?4:0;
  score+=sp;
  reasons.push({cat:'Sample Size',pts:sp,max:20,msg:samp+' data points'+(sp>=15?' (strong)':sp>=8?' (adequate)':' (limited)')});

  // ── Weakest-link override gate (dispatch #41, step 2) ──────────────────────────────────────
  // On top of the weighted sum, not a 5th weighted bucket. A single catastrophic component must
  // not be diluted by three healthy ones — measured live in scenario F of the pre-fix divergence
  // harness: Calibration 30/30 + Freshness 25/25 + Sample 20/20 + Accuracy a true 0/25 still
  // weighted-summed to 75/100, a green "Healthy" grade, for a store whose forecast is measurably
  // wrong 25-30% of the time. SLA-scoring precedent for this shape: min(hard-gate,
  // weighted-average), not a replacement for the weighted core.
  // Three conditions are full failures and cap the grade at red outright: never calibrated, data
  // critically stale (>45d — roughly double the top Freshness cutoff), or Accuracy itself scored
  // a true 0. A 4th — MAPE drift (2W meaningfully worse than 6W) — is a leading indicator the
  // Accuracy number alone hasn't caught up to yet, not a proven failure, so it only holds the
  // grade out of green (caps at yellow) rather than forcing red.
  const neverCalibrated=!di;
  const dataCriticallyStale=daysOld>45;
  const accuracyIsZero=mp===0;
  const hardFail=neverCalibrated||dataCriticallyStale||accuracyIsZero;
  const rawLabel=score>=75?'Healthy':score>=50?'Fair':'Needs Attention';
  let grade=score>=75?{label:'Healthy',color:'#10b981',emoji:'🟢'}:
             score>=50?{label:'Fair',color:'#f59e0b',emoji:'🟡'}:
                       {label:'Needs Attention',color:'#ef4444',emoji:'🔴'};
  // displayScore: the weighted total, clamped to agree with the gated grade when the gate
  // overrides it. Every consumer of this function's return value that buckets by `.score`
  // thresholds instead of reading `.grade` directly (at-a-glance.js's checklist item and its
  // district green/yellow/red tally both do — `s<50`, `score>=75`) needs the NUMBER itself to
  // land in the right band, or the gate would only ever show up in the two spots
  // (store-analytics.js's confidence bar, ModelHealthBadge) that read `.grade` as a string.
  // `reasons[].pts` — the individual component breakdown users actually see broken out — stays
  // the honest unclamped weighted math; only this single summary number is capped, matching the
  // SLA-scoring precedent this dispatch is grounded in (`min(hard-gate, weighted-average)`).
  let displayScore=score;
  let gateReason=null;
  if(hardFail && rawLabel!=='Needs Attention'){
    gateReason=neverCalibrated?'Never calibrated.':dataCriticallyStale?'Data '+daysOld+'d stale (>45d).':'Accuracy scored 0 — MAPE at or above the failing threshold.';
    grade={label:'Needs Attention',color:'#ef4444',emoji:'🔴'};
    displayScore=Math.min(score,49);
  } else if(isDrifting && rawLabel==='Healthy'){
    gateReason='MAPE is drifting (2W meaningfully worse than 6W) — held out of Healthy pending recalibration.';
    grade={label:'Fair',color:'#f59e0b',emoji:'🟡'};
    displayScore=Math.min(score,74);
  }
  const top=reasons.filter(r=>r.pts<r.max*0.5).sort((a,b)=>b.max-a.max)[0];
  const statement=grade.label==='Healthy'?'Calibrated and current — projections can be trusted for scheduling.':
    grade.label==='Fair'?'Usable with caution. '+(gateReason||(top&&top.msg)||''):
    'Needs attention before committing projections. '+(gateReason||(top&&top.msg)||'');
  return{score:displayScore,grade,reasons,statement,samples:samp,dataDaysOld:daysOld,gated:!!gateReason,gateReason};
}

function compute6wk(loc,ds,wb){
  wb=wb||6;
  // Pre-filter to this store's rows ONCE via the index — every avg6() call
  // below used to independently re-scan the FULL multi-year, all-27-store
  // array for a single field. With ~28 avg6() calls per invocation and this
  // function running 3x per store across 27 stores, that was 2,000+ full
  // array passes per recompute. Same avg6() logic, same semantics — just a
  // far smaller array handed to it.
  const opsL  = locRows(ds.opsByLoc, ds.opsRows, loc);
  const ctrlL = locRows(ds.ctrlByLoc, ds.ctrlRows, loc);
  const laborL= locRows(ds.laborByLoc, ds.laborRows, loc);
  // ── Resolvable metrics go through metric-source.js (auto-first per day) ──────
  // These 18 previously read raw ds.opsRows / ds.ctrlRows / ds.laborRows — the MANUAL
  // uploads only — which is the standing-rule violation that made recent windows blank or
  // stale everywhere compute6wk feeds: both scorecards, every KPI tile, StoreCard and
  // RankingView's inputs. metricAvg resolves each DAY auto-first through that metric's
  // chain, so a day covered by Glimpse or the DAR now counts.
  //
  // ⚠️ THIS CHANGES DISPLAYED NUMBERS, deliberately. laborPct in particular: the chain
  // puts glimpseRows FIRST because pre-2026-08-03 ctrlRows.laborPct holds the wrong
  // (Actual, not Punched) value — so some stores will move, and the new number is the
  // correct one.
  //
  // `?? 0` preserves avg6's contract for the ~30 consumers that do arithmetic on these.
  // The no-data signal lives in r._cov below, which is what the scorecards read.
  // Ends on the last CLOSED business day, not literal "now" (signature #4) — this range
  // feeds oepe/tpph/kvst/park/kvsu into calcOpsF's baseOpsF (backtest.js), so a still-filling
  // today doesn't just distort a display number here, it distorts the forecast adjustment
  // every store gets. Computed once and reused below for T2W and the avgCheck window too, so
  // every trailing comparison compute6wk makes agrees on where "today" ends.
  const _lastClosed6wk = lastClosedBusinessDay();
  const _range = { s: addD(_lastClosed6wk, -(wb * 7 - 1)), e: _lastClosed6wk };
  const M = (key) => metricAvg(ds, [loc], _range, key) ?? 0;

  const r={oepe:M('oepe'),kvst:M('kvst'),park:M('park'),r2p:M('r2p'),
    tpph:M('tpph'),spph:M('spph'),laborPct:M('laborPct'),
    actVsNeed:M('actVsNeed'),otHrs:M('otHrs'),actHrs:M('actHrs'),avgRate:M('avgRate'),
    cashOSPct:M('cashOSPct'),tRedAPct:M('tRedAPct'),tRedBPct:M('tRedBPct'),
    discPct:M('discPct'),cashRefCnt:M('cashRefCnt'),
    posOverCnt:M('posOverCnt'),drawerOpens:M('drawerOpens'),

    // ⚠️ This heading used to read "Manual-only: no auto stream carries these and no
    // derivation exists," verified 2026-08-08 — that stopped being true 2026-08-28 when
    // empMealAmt/mgrMealAmt gained glimpseRows+auditRows chains and manualRefAmt gained an
    // auditRows fallback (metric-source.js). All three were already routed through M() here
    // regardless (so the VALUES were never actually manual-only), but found stale while
    // fixing _cov's own manual-only assumption for the Controls Integrity fields above
    // (2026-10-13) — left as a pointer that these three are no longer MANUAL_ONLY_METRICS
    // either, not a claim that nothing here still is.
    empMealAmt:M('empMealAmt'),mgrMealAmt:M('mgrMealAmt'),
    manualRefAmt:M('manualRefAmt'),
    depositAmt:M('depositAmt'),
    floorMgmtNeeded:M('floorMgmtNeeded'),
    floorHrsSched:M('floorHrsSched'),
    fixedContractHrs:M('fixedContractHrs'),
    variableNeeded:M('variableNeeded'),
    oppCostPct:M('oppCostPct'),
    oppCostDollar:M('oppCostDollar')};
  // Coverage map: how many real observations backed each metric. M() returns 0 for
  // "no data", which the scorecards graded as a passing zero — see the note below.
  // Consumers can now tell a genuine 0 from an absent metric and render '—' instead of green.
  //
  // ✅ FIXED (mass-review notes 70, 2026-10-13) — this used to count ONLY raw manual rows
  // (obs6(ctrlL,...)/obs6(opsL,...)), completely bypassing the auto-first metric-source.js
  // chain M() itself already resolves each of these fields through. A store with zero MANUAL
  // Controls/Ops uploads (the now-common case per the "Auto/emailed-first" standing rule) read
  // cov=0 for every field here even when metricAvg found real values from an auto-pulled
  // source (e.g. qsr_cash_sheet → opsCashRows → cashOSPct/tRedAPct/drawerOpens/etc). Two
  // compounding effects: CtrlScorecard's COV_FIELD gate (store-dash.js) showed '—' for every
  // row despite real underlying data, and computeCtrlScore (pipeline.js) — which treats
  // cov[field]<=0 as "skip this component, shrink the denominator" — ended up skipping EVERY
  // component for such a store, collapsing to the same degenerate 75/100 (the one flat
  // structural +3 allowance divided by the 4 max points left once every other component's
  // "else max-=N" fired) regardless of real performance. Found live: a uniform 75/100 CTRL
  // column across 26 stores with wildly different real OPS scores; qsr_cash_sheet confirmed
  // (service-role read) to hold real, current drawer/T-Red/refund/overring data for a sample
  // store the whole time. Now counts how many days metricSeries actually resolved — the same
  // chain M() uses — so cov and the value it gates can never disagree about whether data exists.
  const COV_CHAIN_KEY = {
    cashOSPct:'cashOSPct', tRedAPct:'tRedAPct', tRedBPct:'tRedBPct', drawerOpens:'drawerOpens',
    posOverCnt:'posOverCnt', cashRefCnt:'cashRefCnt', discPct:'discPct', manualRefAmt:'manualRefAmt',
    empMealAmt:'empMealAmt', mgrMealAmt:'mgrMealAmt', otHrs:'otHrs', tpph:'tpph', laborPct:'laborPct',
    oepe:'oepe', r2p:'r2p', kvst:'kvst', park:'park', kvsu:'kvsHealthy', // kvsu's own chain key differs
  };
  r._cov=(()=>{
    const c={};
    for(const f in COV_CHAIN_KEY) c[f]=Object.keys(metricSeries(ds,loc,_range,COV_CHAIN_KEY[f])).length;
    return c;
  })();
  // ✅ FIXED (mass-review notes 70, 2026-10-13) — kvsu used to be the one metric in this
  // function still read straight off raw opsL (manual Ops upload only), bypassing
  // metric-source.js's auto-first 'kvsHealthy' chain (glimpseRows→opsServiceRows→
  // qsrActSummaryRows→opsRows.kvsu) that every sibling metric above already uses via M().
  // Routed through metricAvg directly (not the shared M() helper, which does `?? 0`) so the
  // null-vs-zero distinction below is preserved: metricAvg already returns null on zero
  // resolved days, exactly matching the old raw loop's kvsuC?sum/count:null contract that
  // computeOpsScore's p.kvsu!=null presence check (#150/#178 item 6) depends on. The old
  // loop's own eodOf()/noon-row upper-bound concern doesn't apply here — metricSeries buckets
  // by calendar date, same as every other M()-routed metric already sharing this _range.
  r.kvsu=metricAvg(ds,[loc],_range,'kvsHealthy');
  const cut=_range.s;
  r.floorCompliance=r.floorMgmtNeeded>0?r.floorHrsSched/r.floorMgmtNeeded:null;
  r.r2pSuspect=r.r2p>0&&r.r2p<60;
  r.hasPettyCash=ctrlL.some(row=>row.date>=cut&&row.date<=_lastClosed6wk&&row.hasPettyCash);
  const sRows=laborL.filter(row=>row.date>=cut&&row.date<=_lastClosed6wk&&row.sales>0);
  const avgSales=sRows.length?sRows.reduce((a,row)=>a+row.sales,0)/sRows.length:0;
  r.depositVsSalesRatio=r.depositAmt>0&&avgSales>0?r.depositAmt/avgSales:null;
  // Dynamic deposit baseline: derive from this store own history (cashless ratio varies by location)
  const allDep=ctrlL.filter(row=>row.depositAmt>0);
  const allSales=laborL.filter(row=>row.sales>0);
  let depositBaseline=0.20; // default floor
  if(allDep.length>=7&&allSales.length>=7){
    const sMap={};for(const row of allSales)sMap[dKey(row.date)]=row.sales;
    const ratios=allDep.map(row=>{const s=sMap[dKey(row.date)];return s>0?row.depositAmt/s:null;}).filter(v=>v!==null&&v>0.05&&v<=1.5);
    if(ratios.length>=5){
      ratios.sort((a,b)=>a-b);
      const med=ratios[Math.floor(ratios.length/2)];
      depositBaseline=Math.max(0.10,med-0.12); // flag if 12pts below store"s own median
    }
  }
  r.depositBaseline=(depositBaseline*100).toFixed(2)+'%';
  r.depositSuspect=r.depositVsSalesRatio!==null&&r.depositVsSalesRatio<depositBaseline;
  // T2W trend: last 2 weeks avg sales vs prior 2 weeks avg sales. Ends on the last CLOSED
  // business day (signature #4), not literal "now" — both cuts also gained an upper bound
  // (row.date<=_lastClosed6wk), since neither had one before: a logged-today row would have
  // ridden along into recentAvg uncapped even after fixing just the cutoff's start.
  const t2wCut = addD(_lastClosed6wk,-13);
  const t4wCut = addD(_lastClosed6wk,-27);
  const recentRows = laborL.filter(row=>row.date>=t2wCut&&row.date<=_lastClosed6wk&&row.sales>0);
  const priorRows  = laborL.filter(row=>row.date>=t4wCut&&row.date<t2wCut&&row.sales>0);
  const recentAvg  = recentRows.length ? recentRows.reduce((a,row)=>a+row.sales,0)/recentRows.length : 0;
  const priorAvg   = priorRows.length  ? priorRows.reduce((a,row)=>a+row.sales,0)/priorRows.length   : 0;
  r.t2w = (recentRows.length>=3 && priorRows.length>=3 && priorAvg>100)
    ? +((recentAvg - priorAvg) / priorAvg).toFixed(4) : null;
  // avgCheck and weeklySales for AI Insights. Same _lastClosed6wk boundary + explicit upper
  // bound (signature #4) — this filter had no ceiling at all before, so a logged-today row
  // rode straight into the average.
  const checkRows = laborL.filter(row=>row.date>=_range.s&&row.date<=_lastClosed6wk&&row.avgCheck>0);
  r.avgCheck = checkRows.length ? checkRows.reduce((a,row)=>a+row.avgCheck,0)/checkRows.length : 0;
  // Also try ops rows if labor doesn't have it
  if(!r.avgCheck){const oChk=opsL.filter(row=>row.date>=_range.s&&row.date<=_lastClosed6wk&&row.avgCheck>0);r.avgCheck=oChk.length?oChk.reduce((a,row)=>a+row.avgCheck,0)/oChk.length:0;}
  r.weeklySales = sRows.length ? sRows.reduce((a,row)=>a+row.sales,0)/Math.max(1,Math.ceil(sRows.length/7)) : 0;
  return r;
}

function calcOpsF(p,t,om,norm){
  // norm = {oepe,tpph,kvst} — store own historical avg to use instead of targets when opsNorm enabled
  let f=1;
  // Use norm (store historical avg) if provided, else use target
  const effOepe = norm&&norm.oepe>0 ? norm.oepe : t.tOepe;
  if(p.oepe>0&&effOepe>0){if(p.oepe>effOepe+20)f*=(1+om.oepeSeverePenalty/100);else if(p.oepe>effOepe)f*=(1+om.oepePenalty/100);else f*=(1+om.oepeBonus/100);}
  if(p.kvst>0&&t.tKvst>0&&p.kvst>t.tKvst)f*=(1+om.kvstPenalty/100);
  if(p.kvsu>0&&t.tKvsu>0&&p.kvsu<t.tKvsu)f*=(1+om.kvsuPenalty/100);
  if(p.park>0&&t.tPark>0&&p.park>t.tPark)f*=(1+om.parkPenalty/100);
  const effTpph = norm&&norm.tpph>0 ? norm.tpph : t.tTpph;
  if(p.tpph>0&&effTpph>0){if(p.tpph<effTpph)f*=(1+om.tpphPenalty/100);else f*=(1+om.tpphBonus/100);}
  if(p.actVsNeed<-30)f*=(1+om.shortStaffPenalty/100);else if(p.actVsNeed>15)f*=(1+om.readyStaffBonus/100);
  return Math.max(om.opsFactorFloor/100,f);
}

// KNOWLEDGE BASE — Metric definitions, scoring logic, reference data

const KB_ARTICLES = {

  // PANEL INDEX — live map of every panel (mirrors memory/panel-catalog.md)
  panel_index: {
    title: 'Panel Index — every panel, explained',
    category: 'App Guide',
    summary: 'A live map of every Meridian panel, grouped like the sidebar — find where a workflow lives or see what each panel does at a glance.',
    detail: '**A live index of every Meridian panel, grouped the way the sidebar is. Use it to find where a workflow lives or to see what a panel does at a glance.**\n\n' +
      '**DAILY**\n- **Home** — command center + KPI overview.\n- **Needs Attention** — auto-flagged stores/metrics that need action.\n- **Daily Brief** — the morning KPI summary.\n- **Date-Range Report** — ad-hoc report over any dates.\n- **Events** — promo / known-event calendar that feeds forecasts & Smart Targets (relabeled from "Events & Tags" — same panel, broader scope).\n\n' +
      '**PERFORMANCE**\n- **Org Summary** — org/district rollup scorecard.\n- **Leaderboards** — rank stores (or rolled-up Patch / Operator / State groups) across any KPI.\n- **Planning** — one panel, five tabs: **Targets** (monthly targets, saved to cloud) · **Monthly** (per-store monthly projection + patch rollups) · **Pace** (MTD actual vs target + run-rate) · **Yearly** (annual projection view) · **Smart Targets** (learned, defensible target per store for sales / labor % / FOB / speed, with backtest). Tabs load on demand.\n\n\n' +
      '**FORECASTING AND LABOR PROJECTIONS**\n- **Projections** — the Projection Workspace: double-click any cell to override the AI model, lock rows for scheduling, approve, drill down. Promoted out of Test Kitchen (v5.685).\n- **Proj vs Actuals** — re-runs the forecast model against a past window and compares it to real actuals; a weekly accuracy backtest. Promoted out of Test Kitchen (v5.685).\n- **DI Calibration** — per-store Dialed-In model calibration (Calibrate All, drift warnings, per-store opt out). Promoted out of Test Kitchen (v5.685).\n\n' +
      '**LABOR & SCHEDULING**\n- **Scheduling** — one hub, 12 tabs: **Labor Analytics** (TPPH, labor %, OT, Actual-vs-Need) · **Pay Events** (pay-raise/review-cycle tracking) · **Schedule Discipline** (who edited a published schedule + cost impact) · **Compliance Audit** (meal/rest break, minor-labor violations + $ penalty) · **Employee Performance** (per-employee attendance/drop/pickup/swap activity) · **Scheduling** (scheduling intelligence) · **Schedule Summary** (LifeLenz weekly band across all stores + per-station hours & cost) · **Labor Analysis** (weekly Fixed/Floor/VLH plan from the LifeLenz sync) · **Labor Allocation** (daypart TPPH targets) · **Training Retention** (before/after workshop delta) · **Retention Rollup** (Patch/Operator/Org/State rollup of Training Retention) · **Skills** (per-employee cross-training matrix). Tabs load on demand and follow your role.\n\n' +
      '**PEOPLE / HR**\n- **Performance Reviews** — weighted GM/manager reviews with scoring.\n- **Visit Readiness** — predicted PACE readiness score + risk drivers.\n- **Graded Visits** — PACE graded-visit data (CFV / RGR / EcoSure).\n\n' +
      '**OPERATIONS**\n- **Food Cost** — FOB / food-cost analysis.\n- **End of Month** — per-store EOM inventory troubleshooter.\n- **EOM Supervisor** — supervisor EOM rollup.\n- **Guest Voice** — SMG VOICE CSAT (comments + FullScale scorecard).\n- **3PO Delivery** — third-party / delivery channel mix.\n- **Promo / Discount ROI** — matched-day lift vs give-away; per-store verdicts.\n\n' +
      '**ANALYTICS**\n- **Signals** — live tracking-to-plan, anomalies, Speed of Service, Signal Lab + auto-correlation Scanner.\n- **DT Speed of Service** — drive-thru speed by station/daypart.\n- **SAGE** — Claude-powered advisor (RBAC-scoped, live data tools).\n- **Above-Store One-Pager** — district/operator rollup with a Rollup/Leadership scope selector; Leadership scope is the weekly cascade review (Owner→DO→Supervisor→GM) + the Weekly Business Review, which prints to PDF or downloads as an editable Word (.doc), blank or auto-filled, and re-shapes its content to the selected level. (The standalone "Leadership One-Pager" panel was retired and merged in here — dispatch #190.)\n- **Forms Library** — the leadership review forms catalogued by cascade level, each with Print-blank and Word-blank actions.\n- **Task Queue** — roadmap feature requests + data-issue tickets in one list (used to be two separate panels).\n- **Reports Hub** — categorized index of every report-shaped panel in the app (cross-listed by subject area: Daily & Operations, Sales & Forecasting, Guest Experience, Labor & Payroll, Financial & Promotions, Leadership & Above-Store, Custom Reports), plus a ⭐ My Reports tab for saved, pre-scoped report subscriptions.\n- **Forecast Brief** — SAGE-written Intelligence Brief (store/patch/operator/org/district scope) analyzing the trailing 6 weeks of real performance into a plain-language opportunity/coaching narrative; not a forecast of the upcoming period.\n- **Market Intelligence** — location + market/weather context.\n- **District View / Store One-Pager** — district rollup + single-store summary.\n\n' +
      '**TEST KITCHEN** *(experimental, dev-gated)*\n- A forecast/diagnostic lab: Forecast Models, Forecast Accuracy, LifeLenz Gap/Bridge, and various store experiments. Being triaged — promote / merge / retire. (Projections, Proj vs Actuals, and DI Calibration were promoted out — see **Forecasting and Labor Projections** above. Anomaly Scan and Why Engine are optional panels, not Test Kitchen — enable them from Panel Manager if hidden.)\n\n' +
      '**ADMIN**\n- **Settings** — app settings.\n- **Panel Manager** — show/hide the optional/experimental sidebar panels (with a description of each).\n- **Changelog** — version history.\n- **Knowledge Base** — this reference.\n- **Metric Lineage** — a transparent registry of every metric that is calculated from other metrics: its exact formula, upstream inputs, and the source report/table, so any number can be verified against source.\n- **Data Manager** — uploads + on-demand Sync buttons.\n- **Save / Restore Session** · **Help**.',
  },

  // ROLES & DEFAULT PERMISSIONS — task #78 (owner-queued "for later")
  roles_and_permissions: {
    title: 'Roles & Default Permissions',
    category: 'App Guide',
    summary: 'The 9 real roles, what each one can see, and how to change a user\'s role or store access.',
    detail: '**The 9 real roles, most access to least** (`profiles.role`\'s DB CHECK constraint — these are the only 9 values that exist; a different string, including the literal word "developer" or "office_staff", matches nothing):\n\n' +
      '- **Admin** (level 1) — full access, bypasses every permission check.\n' +
      '- **Owner / Developer** (level 1) — the SAME top tier as Admin, not a separate rung above it.\n' +
      '- **VP** (level 2) — multi-district.\n' +
      '- **DO** (District Ops, level 3) — district-level.\n' +
      '- **Manager** (level 3) — the pre-existing/default role; **every new signup lands here**, not at the top.\n' +
      '- **OM** (Ops Manager, level 4).\n' +
      '- **AS** (Area Supervisor, level 5) — patch-level, a subset of stores.\n' +
      '- **GM** (General Manager, level 6) — own store only.\n' +
      '- **SM / AM / DM** (level 7) — the lowest tier.\n\n' +
      '**Two separate mechanisms decide what a role actually sees**, and they answer different questions. (1) **Which panels/actions** — `hasPermission(roleId, permKey)` checks a role against each panel\'s `perm:` requirement; an unrecognized role id gets ZERO permissions (fails closed), never full access. (2) **Which stores\' data** — Supabase Row-Level Security keyed off that user\'s `accessible_locs` list (`null` = every store; a real list = only those stores), enforced at the database layer on every query, not just hidden in the UI. A role answers "can this person open this panel"; `accessible_locs` answers "which stores\' numbers do they see once they\'re in it" — a GM and a DO can both open the same panel and see entirely different data.\n\n' +
      '**To change a user\'s role, their store access, or which panels a role can see:** Settings → Admin (only visible if you hold `users.manage.all` or the delegated `users.manage.lower` permission — a supervisor with delegated access can manage roles below their own level, never their own or above). The Admin panel\'s **Users** tab sets a person\'s role from a dropdown and edits their `accessible_locs` inline — both take effect immediately, no redeploy. A separate **role editor** (same panel) sets which panels are enabled/disabled for an entire role at once via an opt-out list — toggle a panel off there and nobody at that role sees it, regardless of their individual `accessible_locs`.\n\n' +
      '**To promote an experimental panel out of Test Kitchen:** that\'s a code change (`panel-registry.js`\'s `kind:` field), not a role setting — see Panel Index\'s Test Kitchen note, or ask Claude Code to flip it.',
  },

  // Task #75 (ongoing KB-coverage backlog) — the Workflow Guide panel itself had no article,
  // despite being the one panel whose entire job is explaining how to use the others.
  workflow: {
    title: 'Workflow Guide',
    category: 'App Guide',
    summary: 'The step-by-step DAILY / WEEKLY / MONTHLY checklist for running the app, plus a quick-reference glossary of key features — opens from the 🧭 Workflow nav item or the "?" help menu.',
    detail: '**What it offers:** A role-aware checklist broken into three cadences — **DAILY** (load fresh data, check Home/At A Glance, review Priority Brief, spot-check a store), **WEEKLY** (lock the week\'s projection, run Proj vs Actuals, check DI Calibration, review Food Cost, generate Intelligence Briefs), and **MONTHLY** (lock the month\'s projection, calibrate all forecast models, review channel mix, revenue review, operator roll-up briefs) — plus a **Key Features** quick-reference section explaining Store KB, Shift Analysis, Why Engine, and other cross-cutting tools in one place. Each step names the exact panel/button to use, not just the general idea.\n\n**How the data is obtained:** This is static guide content (`WORKFLOW_GUIDE_SECTIONS` in `App.js`) — it doesn\'t read any live data itself. The WEEKLY and MONTHLY sections are hidden for roles at level 5+ (AS/GM/SM-AM-DM) since those are district-wide lock/calibration cadences a single-store role doesn\'t run; DAILY and Key Features show for every role.\n\n**What it represents:** A deliberately opinionated, current-state answer to "what do I actually do, and where" — written to match the real current location of each step\'s panel, which moves over time as panels get promoted, renamed, or merged (e.g. Projections/Proj vs Actuals/DI Calibration moved out of Test Kitchen into the real sidebar in v5.685; this guide\'s own copy is kept in sync with moves like that, not just written once).\n\n**How to read and use it:** New to the app, or unsure what to do today vs. this week vs. this month? Start here rather than guessing from the sidebar. Each step is short by design — if a step\'s own panel needs more depth, that panel has its own Panel Guide article (follow the InfoIcon ⓘ on that panel) rather than this guide trying to explain everything inline.',
  },

  // MODEL HEALTH
  model_health: {
    title: 'Model Health Score',
    category: 'Forecast Quality',
    summary: 'How much to trust this store\'s AI forecast (0-100)',
    detail: '**What it measures:** The reliability of this store\\\'s Dialed-In forecast model, combining four factors into a 0-100 score.\n\n**Scoring breakdown (100 points total):**\n\n**Calibration Status (30 pts)**\n- 30 pts: Calibrated within 7 days, settings match\n- 22 pts: Calibrated 8-21 days ago\n- 14 pts: Calibrated 22-42 days ago\n- 6 pts: Calibrated but stale (>42 days)\n- -10 pts: Settings changed since last calibration (recalibrate)\n\n**Data Freshness (25 pts)**\n- 25 pts: Data loaded within 3 days\n- 18 pts: 4-10 days old\n- 10 pts: 11-21 days old\n- 3 pts: 22-30 days old\n- 0 pts: No data or >30 days old\n\n**MAPE Accuracy (25 pts)**\n- 25 pts: Forecast error <5%\n- 20 pts: 5-8% error\n- 13 pts: 8-12% error\n- 6 pts: 12-18% error\n- 0 pts: >18% error (DI may be hurting this store)\n- -8 pts: Model is drifting (recent MAPE worsening vs 6-week)\n\n**Sample Size (20 pts)**\n- 20 pts: 300+ days of history\n- 15 pts: 150-299 days\n- 9 pts: 60-149 days\n- 4 pts: 14-59 days\n\n**Thresholds:** 🟢 Trusted ≥75 · 🟡 Caution 50-74 · 🔴 Needs Attention <50\n\n**Action:** If a store scores below 50, do not rely on its Dialed-In projections for weekly scheduling without manual review.',
  },

  // OEPE
  oepe: {
    title: 'OEPE (w/o Parked) — Order End to Present End',
    category: 'Operations',
    summary: 'Time from order totaled to last item presented to customer (from bump bar). Excludes parked orders. Lower is better.',
    detail: '**What it measures:** The elapsed time from when a customer\'s order is TOTALED (Total button pressed) to when the LAST ITEM is presented to the customer from the bump bar. The w/o Parked version excludes temporarily parked orders.\n\n**Why it matters:** OEPE is the primary front counter speed metric. It directly correlates with customer throughput, satisfaction scores, and average check. Every 10 seconds over target represents meaningful lost capacity during peak hours.\n\n**Typical targets:** 140-165 seconds depending on store volume and layout. Higher-volume stores can sustain lower targets due to dedicated staffing.\n\n**Scoring in buildBrief:**\n- Critical: OEPE >18s over target (scheduling/staffing issue, not kitchen speed)\n- Watch: OEPE >8s over target\n\n**Common causes of elevated OEPE:**\n1. Understaffed front counter during peaks\n2. Order accuracy issues causing re-entry\n3. Payment processing delays (card readers)\n4. Menu complexity or new item confusion\n\n**Note:** OEPE measures the *entry-to-print* window, not total service time. A fast OEPE with slow kitchen can still result in poor guest experience — look at OEPE + TPPH together.',
  },

  tpph: {
    title: 'TPPH — Transactions Per Punched Hour',
    category: 'Operations',
    summary: 'Labor efficiency: transactions completed per punched (clocked-in) labor hour. Higher is better.',
    detail: '**What it measures:** The number of transactions completed divided by total PUNCHED (clocked-in) labor hours. Uses actual time-punched hours, not scheduled hours. A measure of how efficiently labor is being utilized.\n\n**Why it matters:** TPPH is the primary labor efficiency metric. A TPPH of 5.0 means each scheduled person-hour produces 5 customer transactions. Higher TPPH = more revenue per dollar spent on labor.\n\n**Typical targets:** 5.0-6.0 depending on store volume and daypart mix. Drive-thru heavy stores trend lower.\n\n**Relationship to Labor%:** TPPH and Labor% are mathematically linked. If TPPH drops without a corresponding sales decrease, labor% is rising. Track both together.\n\n**Scoring:**\n- Watch: TPPH more than 15% below target indicates overstaffing or traffic drop\n- Critical: TPPH >25% below target with flat sales = significant scheduling inefficiency',
  },

  labor_pct: {
    title: 'Labor % — Labor Cost as Percentage of Net Sales',
    category: 'Operations / Financial',
    summary: 'Labor cost relative to sales revenue. Lower is better (within safe staffing levels).',
    detail: '**What it measures:** Total labor cost (wages + employer taxes + benefits) divided by net sales, expressed as a percentage.\n\n**Why it matters:** Labor is typically the largest controllable cost. At average district volume ($11K/day), each 1% of excess labor = ~$40/day = ~$1,200/month = ~$14,600/year per location.\n\n**Typical targets:** 20-22% depending on market wage rates and store volume. Higher-volume stores can sustain lower labor% due to fixed-cost leverage.\n\n**Common causes of elevated labor%:**\n1. Overtime (OTIF — Overtime in Forecast): Most impactful. OT costs 1.5× base rate.\n2. Scheduling misalignment with traffic patterns\n3. Sales decline without corresponding schedule reduction\n4. Ghost scheduling (people scheduled but not needed)\n\n**OT threshold:** >5 hours/day average OT is flagged as Critical in buildBrief. At $13/hr avg + 1.5x = ~$97.50/day in pure premium cost for each OT hour over 5.',
  },

  r2p: {
    title: 'R2P — Receipt to Print',
    category: 'Operations',
    summary: 'Time from payment receipt to item printed/served. Target ≤90 seconds.',
    detail: '**What it measures:** The elapsed time from when payment is collected to when the order is completed and printed for handoff. Primary speed metric for order fulfillment accuracy.\n\n**Normal range:** 60-120 seconds depending on item complexity.\n\n**Integrity signal — R2P <60s:** When R2P averages below 60 seconds consistently, it may indicate a "serve-off" pattern: items being handed to customers before payment is processed, then voided. This is one of the most common mechanisms for theft in QSR environments. This signal is most significant when combined with elevated T-Red counts.\n\n**Compound alert:** R2P <60s + T-Red after hours elevated = Critical integrity flag requiring video review.',
  },

  // Added fresh-eyes role audit (2026-11-11, memory/finding-fresh-eyes-role-audit-2026-11-11.md
  // §1 Q8) -- "FOB %" flagged as the worst bare-acronym offender in home-screen tiles, with no
  // definitional KB entry anywhere (fob_reference_table_guide existed, but that's a PANEL guide
  // for the FOB Reference Table, not a one-line "what is FOB%" article like oepe/r2p/labor_pct
  // already have). This fills that specific gap.
  fob_pct: {
    title: 'FOB % — Food Over Base',
    category: 'Food Cost / Inventory',
    summary: 'Food cost loss from on-hand inventory vs. what the POS sold says should be on hand, as a % of sales. Lower is better.',
    detail: '**What it measures:** The dollar difference between the food inventory a store SHOULD have on hand (based on what the POS says was sold, built up from each item\'s recipe/BOM) and what is ACTUALLY counted on hand, expressed as a percentage of net sales.\n\n**Why "Food OVER Base":** The on-hand count sits OVER (above or below) the theoretical BASE the POS sales data implies. A positive FOB% means more product is unaccounted for than the sales data explains — waste, spoilage, over-portioning, or theft. It is not the same thing as total food cost %, which also includes purchasing price and is not in Meridian\'s data model.\n\n**Typical targets:** 3.0-5.5% depending on store/menu mix; CLAUDE.md\'s own district targets treat <3.5% as healthy and >5.5% as a real problem, not noise.\n\n**Common causes of elevated FOB%:** over-portioning, prep waste, spoilage/expired product, miscounted on-hand inventory, or theft of product rather than cash.\n\n**Where to dig further:** FOB / Food Cost panel\'s per-store troubleshooter (FOBAnalysisPanel/FOBEOMPanel) breaks this down by item/WRIN; EOM Dashboard\'s Change Monitor shows the recount-vs-FOB impact specifically.',
  },

  t_red: {
    title: 'T-Red After Total % — Post-Total Transaction Reductions',
    category: 'Controls / Integrity',
    summary: 'Percentage of orders where an item is voided/reduced AFTER the Total button is pressed. Post-total reductions are the highest-risk integrity signal.',
    detail: '**What it measures:** The percentage of orders where items are voided/reduced AFTER the Total button has been pressed. Previously called "Transaction Reds" — register overrides, voids, or corrections — occurring after the store closes for the day.\n\n**Why after-hours specifically:** During business hours, T-Reds require manager intervention with customers present. After hours, they can be executed without witnesses. Post-close T-Reds are the most common mechanism for register manipulation in quick service restaurants.\n\n**Targets:** Store-specific, typically 0.2-0.4% of transactions. Any value >1.5× the location\'s historical baseline triggers a Critical alert.\n\n**What to look for in video review:**\n1. Voids without a corresponding customer return\n2. Discount applications after food has been handed out\n3. Multiple voids from the same employee on the same shift\n4. Voids clustered around cash declaration time',
  },

  cash_os: {
    title: 'Cash O/S — Cash Over/Short',
    category: 'Controls / Integrity',
    summary: 'Daily cash variance as percentage of sales. Target near 0%. Any pattern >0.5% is Critical.',
    detail: '**What it measures:** The difference between the cash that should be in the register (based on sales + change given) versus what is actually in the drawer at count, expressed as a percentage of daily net sales.\n\n**Normal variance:** ±0.1-0.2% is expected from counting errors and change-making mistakes.\n\n**Alert threshold:** >0.5% consistently (either over or short) indicates a systemic issue.\n\n**Short (negative):** Cash is leaving the register. Could indicate theft, incorrect change-making, or unrecorded voids.\n\n**Over (positive):** More cash than expected. Can indicate under-ringing (charging less than intended) or failure to record all sales.\n\n**Why the sign matters:** Persistent "shorts" are more concerning than occasional "overs." A pattern of small, consistent shorts is a classic embezzlement indicator.\n\n**Cross-reference:** Always compare Cash O/S with drawer count frequency (tDrawer), T-Red rates, and deposit amounts.',
  },

  mape: {
    title: 'MAPE — Mean Absolute Percentage Error',
    category: 'Forecast Accuracy',
    summary: 'Average percentage error between AI forecasts and actual sales. Lower is better.',
    detail: '**What it measures:** The average percentage difference between what the model predicted and what actually happened, across the evaluation period.\n\n**Formula:** Average of |Actual - Forecast| / Actual × 100\n\n**Interpretation:**\n- <5%: Excellent. Can schedule aggressively to model.\n- 5-10%: Good. Projections reliable for planning; add small buffer for scheduling.\n- 10-15%: Fair. Review model before locking projections. Check for events or anomalies.\n- 15-25%: Poor. Use as a starting point only; significant manual review required.\n- >25%: Do not trust. Something structural is wrong with this store\\\'s model — erratic history, major operational change, insufficient LY data.\n\n**Ada-Country Club warning:** This store\\\'s MAPE calibrated at 116%, meaning the Dialed-In model is actively making forecasts worse than the simple LY baseline. Use ⊘ Skip in Dialed-In and forecast manually or from the default model.\n\n**MAPE by window:** The app tracks MAPE at 6W, 4W, 2W, and 1W windows. If 2W MAPE is significantly higher than 6W MAPE, the model is "drifting" — recent weeks are becoming harder to predict. This often signals an operational change (new GM, remodel, new competitor) that the model hasn\'t adapted to yet.',
  },

  dialed_in: {
    title: 'Dialed-In Calibration',
    category: 'Forecast Engine',
    summary: 'Per-store model optimization. Finds the 4 parameters that minimize forecast error for each location.',
    detail: '**What it does:** Runs a grid search over ~21,500 valid combinations of 4 forecast parameters to find the configuration that produces the lowest MAPE for each specific store, evaluated against the same holiday-adjusted, trend-blended, event-aware formula the live forecast actually uses (fixed in v4.195 — previously the search used a simplified standalone formula that omitted these factors, meaning the \'best\' combo it found was not actually best against real forecasts).\n\n**The 4 calibrated parameters:**\n\n**LY Weight (lyW):** How much the forecast relies on last year\'s same day vs. the district day-of-week average. Ranges 0.50-1.00. A store with a major operational change last year might need lower LY weight.\n\n**Trend Weights (t2, t4, t6):** How much weight to give the 2-week, 4-week, and 6-week trend windows respectively. Must sum to ≤0.95. Some stores are better predicted by recent trend (high t2); others by longer-term patterns (high t6).\n\n**Ops Multiplier (opsMult):** How much the ops metrics (OEPE, TPPH, labor) should influence the sales forecast. 0 = ops don\'t affect projection. 1.5 = strong positive correlation assumed.\n\n**Forecast formula (matches the live model exactly as of v4.195):**\n\nfc = (lyRaw × lyW + distDOWAvg × (1 - lyW)) × holidayLyAdj\n   × (1 + (opsF - 1) × opsMult)\n   × wAdj\n   × (1 + trendFactor)\n   × (1 + eventRegistryAdj)\n   × (1 + plusUp)\n\nwhere trendFactor blends 65% global trend (t2/t4/t6 weighted) with 35% DOW-specific trend, clamped to ±15%.\n\n**When to recalibrate:** Any settings change (targets, weights), after significant operational changes, or after >42 days since last run.',
  },

  drawer_open: {
    title: 'Drawer Open',
    category: 'Controls / Integrity',
    summary: 'Count of non-sales drawer openings. Lower is better. Each unexplained open is an opportunity for unauthorized cash removal.',
    detail: 'What it measures: The number of times the cash drawer was opened for reasons OTHER than a sales transaction. This includes manual opens, change making outside of sales, manager access, and unauthorized opens.\n\nWhy it matters: Every non-sales drawer open is a potential opportunity for unauthorized cash removal. High counts indicate loose cash drawer discipline.\n\nNormal range: Target varies by store (your targets range from 0 to 75+ depending on location). A store with 0 as target indicates all drawer opens should be tied to sales.\n\nIntegrity signal: Drawer opens that cluster at specific times of day (especially after close or during low-traffic periods) are a key pattern to investigate. Cross-reference with Cash O/S and T-Red After Total when drawer counts are elevated.\n\nNote: This is distinct from Drawer Variance (which measures dollar differences). Drawer Open counts behavior, not money amounts.',
  },

  condiment_pct: {
    title: 'Condiment Cost %',
    category: 'Food Cost',
    summary: 'Total condiment usage cost per $1,000 of sales. Oil is typically the highest-cost condiment.',
    detail: 'What it measures: The total cost of condiment usage (per $1,000 of net sales). Unlike food items, condiments in McDonald\'s are NOT directly tied to recipes — they are tracked separately as a usage metric.\n\nWhat counts as a condiment: Ketchup packets, salt & pepper, dipping sauces (nuggets/chicken strips), jelly and jam — and most significantly, cooking oil used for frying. Oil is the largest single condiment cost by a significant margin and represents the most opportunity for cost control.\n\nWhy it matters: Condiment costs can indicate portion discipline (are crew members using appropriate amounts?), waste (opening multiple packets per order), or pilferage (taking product home). Oil cost additionally reflects fryer temperature management and product holdtime compliance.\n\nOpportunity area: Oil usage optimization through proper fryer temperature management, correct product load sizes, and filter schedule adherence can yield meaningful savings given oil\'s outsized share of condiment cost.',
  },

  file_import_guide: {
    title: 'File Import Guide — Complete Data Management',
    category: 'App Guide',
    summary: 'How to load files, what each file does, how data is stored, and how often to update.',
    detail: '# Data Architecture\n\nMeridian is a browser-based application. All operational data must be loaded each session from your exported QSRSoft/POS files. Once loaded, it lives in memory until you close or refresh the browser.\n\n## What Persists Between Sessions\n\nThe following is saved to your browser\'s localStorage automatically:\n- **Settings** — all settings, calibrations, and configuration\n- **Dialed-In Calibrations** — per-store model parameters (re-run monthly or after data updates)\n- **Monthly Targets** — set in the Targets panel, persists indefinitely\n- **Yearly Goals** — set in Targets > Yearly Goals tab\n- **Locked Projections** — weekly and monthly projections you have locked\n- **Event Tags** — dates you have tagged as special events\n\n## What Must Be Loaded Each Session\n\nThese files must be re-uploaded every time you open the app:\n\n**Operations Report** (most important — load every session)\n- Filename format: Operations_Report_YYYY-MM-DD_to_YYYY-MM-DD.xlsx\n- Contains: Sales (LY, actuals, net sales by day), Service (OEPE, TPPH, KVS), Controls (T-Reds, Cash O/S, Labor), FOB (food cost, waste)\n- Update frequency: Load the most recent available export each session\n- How often to export from QSRSoft: Weekly at minimum, daily if actively managing projections\n\n**OpsTargets.xlsx** (upload when targets change)\n- Filename: OpsTargets.xlsx\n- Contains: All 44 target metrics for each location\n- Update frequency: When targets change (typically monthly/quarterly)\n- After upload: Targets automatically migrate to the monthly version system\n- Note: Monthly and yearly overrides in the Targets panel persist and take priority\n\n**Labor Analysis** (optional, enhances labor metrics)\n- Filename format: Labor_Analysis_YYYY-MM-DD_to_YYYY-MM-DD.xlsx\n- Contains: Detailed labor hours, OT, floor management data\n- Update frequency: With each Operations Report upload\n\n**Register Audit** (controls and integrity analysis)\n- Filename format: Register_Audit_YYYY-MM-DD_to_YYYY-MM-DD.xlsx\n- Contains: Per-employee transaction data, voids, refunds, cash O/S by person\n- Update frequency: Weekly for active monitoring\n\n**Weather Data** (improves forecast accuracy)\n- Filename: WeatherData.xls\n- Update frequency: Monthly or when running recalibration\n\n**3 Peaks** (peak hour analysis)\n- Filename format: 3_Peaks_YYYY-MM-DD_to_YYYY-MM-DD.xlsx\n- Update frequency: Monthly\n\n**Shift Manager Summary** (GM-level analysis)\n- Filename format: Shift_Manager_Summary_YYYY-MM-DD_to_YYYY-MM-DD.xlsx\n- Update frequency: Monthly\n\n## Planned Future Files (not yet implemented)\n\n- **Monthly Restaurant Projections** — for importing locked monthly projection targets (pending)\n- **Annual Goals Template** — standardized yearly goals upload (pending)\n- **Intelligence Engine Training Data** — correlation results and model improvements (future)\n\n## File Naming — Critical\n\nThe app auto-detects file type from filename and sheet names. Use exact naming:\n- Operations Report: Must contain \'Operations_Report\' or \'Operations Report\'\n- OpsTargets: Must be named \'OpsTargets.xlsx\'\n- Labor Analysis: Must contain \'Labor_Analysis\' or \'Labor Analysis\'\n- Register Audit: Must contain \'Register_Audit\' or \'Register Audit\'\n\n## Load Order Recommendation\n\n1. Operations Report (establishes the primary data set)\n2. Labor Analysis (supplements labor data)\n3. Register Audit (supplements controls data)\n4. Weather Data (for forecast calibration sessions)\n5. OpsTargets (only when targets have changed)\n\nMultiple files can be loaded simultaneously by selecting all at once in the file picker.',
  },

  locked_projections: {
    title: 'Locked Projections — How They Work',
    category: 'App Guide',
    summary: 'How to lock projections, what happens when you do, and how to compare to actuals.',
    detail: '# Locked Projections\n\n## What It Means to Lock a Projection\n\nWhen you \"lock\" a projection, you are committing to a specific forecast value for a store on a given day or week. Locked projections are:\n- **Persisted** — saved to Supabase, cloud-synced across devices\n- **Used for scheduling** — these become the numbers your team plans staffing against\n- **Compared in DI Compare** — after the week completes, compare your locked values to actuals\n\n## Weekly Lock Deadline\n\nFor scheduling purposes, weekly projections should be locked approximately 10 days before the week starts (by Wednesday of the prior week). The Command Center signals bar shows a countdown to the next lock deadline.\n\n## Monthly Lock Deadline\n\nMonthly projections should be locked by the 15th of the prior month.\n\n## How to Lock\n\n1. Open ▦ Projections (sidebar → Forecasting and Labor Projections) — this is the only grid with lock/override. (Planning → Monthly tab is the monthly Targets editor — it edits target values, not locked projections, and has no lock mechanic of its own.)\n2. Review the model\'s projections for each store\n3. Adjust individual cells if needed (overrides the model)\n4. Click \"Lock Week\" — the system runs a safety check\n5. Acknowledge any confidence warnings\n6. Projections are locked and stored\n\n## How to Test Your Model Accuracy\n\nThe best way to backtest:\n1. Load a recent Operations Report\n2. Go to ◑ Proj vs Actuals (sidebar → Forecasting and Labor Projections)\n3. Select the week you want to compare\n4. The report shows: Locked Projection | AI Model | Actual | MAPE\n5. Use DI Compare to see Dialed-In model vs Default model accuracy\n\n## DI Compare\n\nDialed-In Compare shows side-by-side comparison for a completed week:\n- What the Dialed-In model predicted\n- What the Default model predicted\n- What actually happened\n- Which model was more accurate (MAPE per store)\n- This tells you definitively whether DI is helping or hurting each location',
  },

  // Task #75 (ongoing KB-coverage backlog) — the real nav panel itself had no article; only
  // the locking workflow (above) and the backtest (pvsa) did. Promoted out of Test Kitchen the
  // night before this was written (v5.685) — written against the current, post-promotion state.
  proj: {
    title: 'Projections — Panel Guide',
    category: 'Panel Guide',
    summary: 'The Projection Workspace — override and lock a sales forecast per store, week or month, for scheduling and DI-accuracy comparison. The only grid with a lock mechanic in the app.',
    detail: '**What it offers:** A per-store grid of the AI sales forecast for a chosen Week (Wed-start) or Month, grouped by Patch / Operator / Org / All Stores. Double-click any cell to override the model\'s number; the override is tracked separately from the raw forecast so you can always see both. **Lock** commits a row (or, via "Lock All", the whole visible scope) to a specific value — this is what the rest of the app means by a "locked projection." **Approve** is a second step after locking, for workflows that want a review gate before a locked number is treated as final. A slide-out drill-down (▶ per store) shows the day-by-day forecast build and an audit trail of overrides/locks for that store.\n\n**How the data is obtained:** The forecast itself is computed live by the same `forecastDay` engine every other forecast-reading panel uses (trend + ops + weather + events, or the store\'s assigned alternate model) — not a stored snapshot, so it reflects current calibration and settings. Overrides and locks are written to Supabase (`lockedProjections`, passed down from `App.js`) and sync across devices immediately. The grid also shows the LifeLenz/QSRSoft scheduling system\'s own sales projection per store side by side, for an outside sanity check against Meridian\'s number.\n\n**What it represents:** A locked value becomes the number your team schedules against, and is what **DI Compare** and **Proj vs Actuals** check real actuals against once the period closes — this is the one place in the app where a forecast number gets elevated from "the model\'s best guess" to "the number we committed to." Locking and approving is gated: only a **Projections & Targets owner** (DO/VP and above, or a user explicitly granted ownership) can lock or approve a row — everyone else can view the grid and drill into a store, but the lock/approve buttons are disabled. A granted owner\'s action triggers a notification to the other owners so nobody is surprised by a change they didn\'t make.\n\n**How to read and use it:** This is the WEEKLY (lock by ~10 days before the week starts) and MONTHLY (lock by the 15th of the prior month) workflow step described in the Workflow Guide. Check the MAPE shown next to each store before trusting its forecast as-is — a high-MAPE store is a candidate for a manual override or a trip to DI Calibration rather than a blind lock. Use the ▶ drill-down when a number looks wrong, to see the day-by-day build and prior override/lock history for that store rather than guessing why the grid shows what it shows.',
  },

  smart_targets: {
    title: 'Smart Target Engine — How It Works',
    category: 'App Guide',
    summary: 'Data-driven target generation that analyzes your historical performance to propose realistic monthly and yearly targets for each location.',
    detail: '# Smart Target Engine\n\nAccess: Planning → Smart Targets tab\n\n## What It Does\n\nFor each of the 7 priority metrics (OEPE, TPPH, Labor %, Cash O/S %, T-Red After %, Sales Growth, FOB %), the engine:\n1. Analyzes all available historical data for each location\n2. Computes 6W, 12W, 26W, and 52W trimmed averages\n3. Finds the best sustained 4-week performance over the last year\n4. Identifies comparable stores (same organization, within 40% of your volume)\n5. Calculates trend direction (improving, stable, declining)\n\n## Proposed Yearly (2027)\nAnchor = best sustained 4-week performance\nStretch = 30% of gap toward best comparable store in your org\nIf improving trend → additional 3% stretch credit\n\n## Proposed Monthly (Next Month)\nStep = current 6-week average + 18% of gap toward yearly goal\nThis creates a realistic progression path over 12 months\n\n## How to Use\n1. Load your Operations Report (data is required)\n2. Toggle between Monthly and Yearly modes\n3. Review proposed targets — click any cell for full reasoning\n4. Override any value by typing in the cell\n5. Approve individual stores or click Approve All\n6. Export to CSV for distribution or import to your existing templates\n\n## Confidence Levels\nHigh = 20+ data points · Medium = 8-19 · Low = under 8 (use with caution)',
  },

  targets_editor: {
    title: 'Monthly & Yearly Targets — Panel Guide',
    category: 'Panel Guide',
    summary: 'The in-app Monthly and Yearly Targets grids — how to edit a target value directly, how that differs from Excel upload, and why neither of these has a lock mechanic.',
    detail: '# Monthly & Yearly Targets\n\n**Access:** Planning → Monthly tab (`monthly_targets`) and Planning → Yearly tab → Target Categories (`yearly_targets`). Two separate tables/panels, same editing pattern.\n\n## How Data Is Obtained\nThe primary bulk-entry path is Excel upload — the QSRSoft Monthly Projections / OpsTargets workbook for Monthly, the yearly targets workbook for Yearly — a full period, all stores, one upload. Both grids are also individually editable in-app: click any store\'s cell to open an input, type the new value, and commit with Enter or by clicking away (Escape cancels). A commit writes the WHOLE row for that store/period straight to Supabase (`saveMonthlyTargets`/`saveYearlyTargets`), not just the one field — so editing one cell never loses the rest of that row\'s values. Use in-app editing for one-off corrections between uploads; use the Excel upload for a full re-set of a period.\n\n## What It Represents\n**Monthly** covers ~18 fields across 4 categories: Sales & Labor (incl. Sales $, Crew/Bonus Labor %, TPPH), Service (OEPE/KVST/R2P/KVSU), Food Cost (FOB base, waste, condiment, employee food, etc.), and Other Costs (Op Supply $, paper cost). **Yearly** covers ~24 fields across 5 categories: Service & Ops, CSAT, Digital, People, and Labor & FOB. Percent fields are entered and shown as a plain percent number (e.g. type `28` for 28%) but stored as a fraction (`0.28`) — the grid converts both directions automatically.\n\n## How to Read and Use It\nFlat per-store rows are editable; grouped/rollup rows (patch, operator, state totals) are not — those are sums/averages across stores, not any one store\'s real data. Yearly also has Print Report / Export buttons for a printable copy of the Target Categories view, reflecting any in-app edits live. Smart Targets\' "Apply as Official" action (see the **Smart Target Engine** article) writes directly into Monthly\'s `tProdSales` field — that\'s the other real write path into this same grid, alongside manual edits and Excel upload.\n\n## What This Is NOT\nNeither grid has a lock, double-click-override, or approval mechanic of any kind — editing a cell here saves immediately and permanently (until the next edit or upload). That is a deliberately separate feature: locking a sales projection for scheduling/DI-accuracy purposes only exists in **▦ Projections** (sidebar → Forecasting and Labor Projections) — see the **Locked Projections** article for that workflow. Don\'t confuse "set this month\'s Sales target to $X" (here) with "commit to this week\'s forecast for scheduling" (there) — they\'re different tables, different panels, and different deadlines.',
  },

  // ── FORECAST ENGINE ──────────────────────────────────────────────────────────

  forecast_formula: {
    title: 'Core Forecast Formula — DOW / DI Model',
    category: 'Forecast Engine',
    summary: 'The step-by-step formula used by the DOW and Dialed-In models to produce a day-level sales forecast.',
    detail: '# Core Forecast Formula\n\n## Final Expression\n\n```\nforecast = lyAdjH × opsFactor × (1 + wAdj) × (1 + trendFactor) × (1 + eventFactor) × (1 + plusUp)\n```\n\n## Step 1 — Last Year Baseline (lyRaw)\n\nLooks up actual sales for the same day-of-week ~52 weeks ago. Priority chain (skipping holidays and tagged events):\n- −364 days (exact 52 weeks)\n- −357, −371, −378, −350, −385, −343 days (DOW-matched fallbacks)\n\nIf no valid LY exists (new store < 365 days), the **Ramp Model** is used instead.\n\n## Step 2 — LY Weight Blend (lyAdj)\n\nWhen Dialed-In calibration sets `lyW < 1.0`, the store\'s LY is blended with the district DOW average from the same org (OK or FL stores compared separately):\n\n```\nlyAdj = lyRaw × lyW + districtDOWAvg × (1 − lyW)\n```\n\n`lyW` defaults to 1.0 (pure store LY). DI calibration may reduce this when the store\'s prior-year data is distorted.\n\n## Step 3 — Holiday Correction (lyAdjH)\n\n```\nlyAdjH = lyAdj × holidayLyAdj\n```\n\n- If today is a holiday but LY was not → `holidayLyAdj < 1` (reduce LY, expect lower traffic)\n- If LY was a holiday but today is not → `holidayLyAdj > 1` (LY understates normal volume)\n- If same holiday on both sides → `holidayLyAdj = 1` (no adjustment needed)\n\n## Step 4 — Trend Factor (trendFactor)\n\nThree trend windows calculated as YOY growth for same DOW in that recency band:\n- **t2** = weeks 1–2 (most recent)\n- **t4** = weeks 3–4\n- **t6** = weeks 5–6\n\n```\nglobalTrend = t2×tw.t2 + t4×tw.t4 + t6×tw.t6\n              (default weights: 0.50 / 0.30 / 0.20)\n\nblendedTrend = globalTrend×0.65 + dowSpecificTrend×0.35\n\ntrendFactor = clamp(blendedTrend × 0.30, −15%, +15%)\n```\n\nDI calibration supplies its own `{t2, t4, t6}` weights found by grid search.\n\n## Step 5 — Ops Factor (opsFactor)\n\nAdjusts forecast based on operational performance vs targets (or store\'s own historical norm when Ops Normalization is enabled):\n- **OEPE severe**: configurable penalty (e.g. −3%)\n- **OEPE normal over target**: configurable penalty (e.g. −1.5%)\n- **OEPE under target**: configurable bonus (e.g. +0.5%)\n- **TPPH below target**: configurable penalty\n- **TPPH above target**: configurable bonus\n- **Act vs Need < −30 hrs**: short-staff penalty\n- **Act vs Need > +15 hrs**: over-staff bonus\n- **KVST / parking over target**: penalties\n\n```\nopsFactor = max(opsFactorFloor, rawOpsF)\neffectiveOpsFactor = 1 + (rawOpsF − 1) × calOpsMult\n```\n\n`calOpsMult` from DI calibration (0.0–1.5) scales how strongly ops influence the forecast.\n\n## Step 6 — Weather Adjustment (wAdj)\n\nWhen weather data is loaded and weather is enabled: see **Weather Adjustment** article. Clamped max −15% / +3%.\n\n## Step 7 — Event Factor (eventFactor)\n\nIf the date has a tagged event with a learned historical impact: see **Event Registry** article.\n\n## Step 8 — Plus-Up (plusUp)\n\nA percentage added to the final result. Priority: store-level override → patch (supervisor group) override → global setting. Used to apply known uplift (e.g. major LTO, new daypart launch).',
  },

  model_types: {
    title: 'Model Types — DOW, DI, AE, EWMA',
    category: 'Forecast Engine',
    summary: 'The four model codes used in Meridian and when each is appropriate.',
    detail: '# Model Types\n\nMeridian assigns each store a model per horizon (weekly / monthly) via the **Model Assignments** panel. Four codes exist:\n\n## DOW — Day-of-Week Baseline\n\nThe default model. Uses the **Core Forecast Formula** with the district-default trend weights (t2=0.50, t4=0.30, t6=0.20) and opsMult=1.0. No per-store calibration.\n\n**Best for:** Stable stores with consistent history. Start here before running Dialed-In.\n\n## DI — Dialed-In\n\nRuns the same **Core Forecast Formula** but substitutes store-specific calibrated parameters `{lyW, t2, t4, t6, opsMult}` found by the Dialed-In grid search (~21,500 combinations tested). The best combination is the one with the lowest MAPE against the last 42 days of actuals.\n\n**Best for:** Stores with sufficient history (50+ data points) where the default model has >8% MAPE.\n\n## AE — Adaptive Ensemble\n\nA 5-signal blend model that does NOT use the Core Formula. Instead it weights five independent signals:\n1. EWMA DOW (exponential decay on same-DOW actuals)\n2. LY Adjusted (prior-year + 90-day YOY trend)\n3. Short-term Momentum (recent 2W vs prior 2W same-DOW)\n4. Monthly Seasonality (this-month DOW vs all-time DOW avg)\n5. Adaptive DI (per-store calibrated EWMA blend)\n\nSee **Adaptive Ensemble** article for weights and full detail.\n\n**Best for:** Stores validated at district avg 9.29% MAPE (vs LifeLenz 9.51%) — the primary model for new or trending stores.\n\n## EWMA — Exponentially Weighted Moving Average\n\nA simple single-signal model. Collects up to 14 most-recent same-DOW actuals and applies exponential decay weighting (α=0.25 by default). No LY, no trend windows, no ops factor.\n\n```\nforecast = Σ(α × (1−α)^i × peers[i]) / Σ(α × (1−α)^i)\n```\n\n**Best for:** Stores in rapid operational change (new GM, remodel, relocation ramp) where historical data is unreliable as an anchor.',
  },

  adaptive_ensemble: {
    title: 'Adaptive Ensemble (AE) — 5-Signal Blend Model',
    category: 'Forecast Engine',
    summary: 'Multi-signal ensemble validated at 9.29% district MAPE vs LifeLenz 9.51% on the same evaluation window.',
    detail: '# Adaptive Ensemble Model\n\n## Overview\n\nThe AE model blends 5 independent signals, each capturing a different aspect of sales behavior. It does NOT use the Core Formula (lyAdj × opsFactor × ...). District validated: avg 9.29% MAPE vs LifeLenz 9.51%, same Sep 2025–May 2026 window. AE wins 16/27 stores head-to-head.\n\n## The 5 Signals\n\n**Signal 1 — EWMA DOW**\nExponential decay on same-DOW actuals. α=0.22 weekday, α=0.30 weekend (weekend needs faster response to seasonal shifts).\n\n**Signal 2 — LY Adjusted**\nPrior-year same date + YOY adjustment from recent 90 days vs LY 90-day window:\n```\nadj = avg(recent 90d) / avg(LY 90d window) − 1   [clamped ±20%]\nlySignal = lyRaw × (1 + adj)\n```\nLooks ±3 days to find a valid LY match (handles DOW drift year-over-year).\n\n**Signal 3 — Short-term Momentum**\nRecent 2 weeks vs prior 2 weeks, same DOW only:\n```\nfactor = avg(last 14d same-DOW) / avg(14d−28d same-DOW)   [clamped 0.85–1.15]\nmomentumSignal = ewmaSignal × factor\n```\n\n**Signal 4 — Monthly Seasonality**\nThis month\'s same-DOW average vs all-time same-DOW average (min 4 data points required):\n```\nfactor = avg(this month, same DOW) / avg(all-time, same DOW)   [clamped 0.80–1.20]\nseasonalSignal = ewmaSignal × factor\n```\n\n**Signal 5 — Adaptive DI**\nPer-store calibrated EWMA blend across 14d/28d/42d windows. See **Dialed-In Calibration** article.\n\n## Blend Weights\n\n**Oklahoma stores:**\n\n| Signal | Weekday | Weekend |\n|---|---|---|\n| EWMA DOW | 0.35 | 0.22 |\n| LY Adjusted | 0.27 | 0.45 |\n| Momentum | 0.13 | 0.08 |\n| Seasonality | 0.12 | 0.10 |\n| Adaptive DI | 0.13 | 0.15 |\n\n**Florida Interstate stores** (6178, 6838, 10034, 35242, 37566, 38609): Higher LY weight captures annual highway traffic patterns.\n\n| Signal | Weekday | Weekend |\n|---|---|---|\n| EWMA DOW | 0.20 | 0.15 |\n| LY Adjusted | 0.50 | 0.55 |\n| Momentum | 0.10 | 0.05 |\n| Seasonality | 0.10 | 0.10 |\n| Adaptive DI | 0.10 | 0.15 |\n\nWeights are renormalized over available signals — if a signal has insufficient data (< 2-3 same-DOW points), it is excluded and the remaining weights sum to 1.0 automatically.',
  },

  ewma_model: {
    title: 'EWMA DOW — Exponentially Weighted Moving Average',
    category: 'Forecast Engine',
    summary: 'Responds 2-3x faster than a simple rolling average to structural shifts. Weights recent weeks more heavily.',
    detail: '# EWMA DOW Model\n\n## Formula\n\n```\nforecast = Σ(α × (1−α)^i × S_i) / Σ(α × (1−α)^i)\n```\n\nwhere `S_i` is the actual sales i weeks ago on the same day-of-week, and α is the decay factor (lower α = slower decay = more memory).\n\n## Parameters\n\n- **α (standalone EWMA model):** 0.25\n- **α (inside Adaptive Ensemble weekday):** 0.22\n- **α (inside Adaptive Ensemble weekend):** 0.30\n- **Lookback:** up to 14 most-recent same-DOW actuals (about 14 weeks)\n- **Minimum required:** 3 same-DOW data points\n\n## Decay Weights\n\nWith α=0.25, the weights by recency:\n\n| Week | Weight | Cumulative |\n|---|---|---|\n| Most recent | 0.250 | 25.0% |\n| 1 week prior | 0.188 | 43.8% |\n| 2 weeks prior | 0.141 | 57.9% |\n| 3 weeks prior | 0.105 | 68.4% |\n| 4 weeks prior | 0.079 | 76.3% |\n\nThe most recent 5 same-DOW days account for ~76% of the forecast.\n\n## When to Use\n\nEWMA is best for stores in transition: new GM taking over, active remodel, opening ramp-up period, or any time the LY anchor is untrustworthy. It ignores the prior year entirely and adapts quickly to the current trajectory.',
  },

  adaptive_di: {
    title: 'Adaptive DI — Calibrated Multi-Window EWMA Blend',
    category: 'Forecast Engine',
    summary: 'Per-store calibrated blend of 14d / 28d / 42d EWMA windows. Used as Signal 5 inside the AE model.',
    detail: '# Adaptive DI Model\n\n## What It Does\n\nCombines three EWMA lookback windows with per-store weights calibrated by Dialed-In:\n\n```\nEWMA(14d) = exponential average of same-DOW actuals within last 14 days\nEWMA(28d) = exponential average of same-DOW actuals within last 28 days\nEWMA(42d) = exponential average of same-DOW actuals within last 42 days\n\nforecast = (w2 × EWMA(14d) + w4 × EWMA(28d) + w6 × EWMA(42d)) / (w2 + w4 + w6)\n```\n\n(Only includes windows that have at least one data point; renormalizes accordingly.)\n\n## Per-Store Parameters\n\nEach store has calibrated `{w2, w4, w6, alpha}` stored in the AE params table. These represent how much weight that store benefits from recency (high w2) vs longer-term stability (high w6).\n\nDefault fallback when uncalibrated: `{w2: 0.40, w4: 0.35, w6: 0.25, alpha: 0.20}`\n\n## Relationship to Dialed-In\n\nAdaptive DI is NOT the same as DI model mode. When a store is assigned the DI model, it uses the Core Forecast Formula with calibrated `{lyW, t2, t4, t6, opsMult}` parameters. Adaptive DI is only Signal 5 inside the AE blend — it runs unconditionally for all stores as an input to AE, regardless of model assignment.',
  },

  dialed_in_calibration: {
    title: 'Dialed-In Calibration — Grid Search',
    category: 'Forecast Engine',
    summary: 'Per-store parameter optimization. Finds the 5 parameters that minimize forecast error over the last 42 days.',
    detail: '# Dialed-In Calibration\n\n## What It Does\n\nRuns a grid search over ~21,500 valid combinations of 5 forecast parameters to find the configuration that minimizes MAPE for each specific store, evaluated against the **same complete pipeline** the live forecast uses (holiday adjustments, trend blending, event factors, all applied).\n\n## The 5 Calibrated Parameters\n\n**lyW (LY Weight) — 0.50 to 1.00**\nHow much the store\'s own prior-year data is trusted vs the district DOW average. Use lower values when the store had a major operational change last year (new GM, renovation, relocation).\n\n**t2 (2-Week Trend Weight) — 0.10 to 0.80**\nWeight given to the most-recent 2-week YOY trend. High t2 = forecasts adapt quickly to recent changes.\n\n**t4 (4-Week Trend Weight) — 0.05 to 0.60**\n\n**t6 (6-Week Trend Weight) — 0.05 to 0.60**\n\nConstraint: `t2 + t4 + t6 ≤ 0.95` (some global trend influence is always preserved).\n\n**opsMult (Ops Multiplier) — 0.0 to 1.5**\nHow strongly ops metrics (OEPE, TPPH, parking) influence the sales forecast. 0.0 = ignore ops entirely. 1.5 = amplify ops signal by 50%.\n\n## Full Calibrated Formula\n\n```\nfc = lyAdjH × (1 + (opsF−1)×opsMult) × (1+wAdj) × (1+trendFactor) × (1+eventFactor) × (1+plusUp)\n\ntrendFactor = clamp(blendedTrend × 0.30, −15%, +15%)\nblendedTrend = t2×0.65_global + 0.35_DOWspecific   (using DI t2/t4/t6 weights)\n```\n\n## When to Recalibrate\n\n- Any settings change (targets, ops multipliers, weather)\n- After significant operational changes at a store\n- After >42 days since last run\n- When MAPE drift status is "recalibrate" (2W MAPE exceeds 6W MAPE by ≥5%)\n\n## DI Skip\n\nStores can be excluded from Dialed-In via the Skip toggle in Model Assignments. When skipped, the store uses its assigned fallback model (typically DOW or AE). Reasons to skip: insufficient history (<50 data points), ongoing operational instability, or when DI is actively worsening MAPE vs the default.',
  },

  event_registry: {
    title: 'Event Registry — Tagging and Impact Learning',
    category: 'Forecast Engine',
    summary: 'Tag dates with event types; the engine learns the historical sales impact and applies it to future forecasts.',
    detail: '# Event Registry\n\n## How It Works\n\nThe Events & Tags panel lets you tag any date at any store with one or more event types (weather, school calendar, operations, community events, etc.). The forecast engine learns the average sales impact of each event type from your history and applies it to future tagged dates.\n\n## Impact Calculation\n\nFor each store and each event type, the engine computes the average % deviation of actual sales vs the baseline forecast on days tagged with that type:\n\n```\nimpact(loc, eventType) = avg[ (actual − baselineForecast) / baselineForecast ] across tagged days\n```\n\nThis is stored as a fraction (e.g. −0.12 = 12% sales reduction).\n\n## Application to Forecasts\n\nWhen a future date is tagged, the forecast becomes:\n\n```\nforecast × (1 + eventFactor)\n```\n\nIf a date has multiple event tags, the eventFactor is the average of all applicable tag impacts.\n\n## Event Categories\n\n- **Weather:** Winter Storm, Snow, Ice, Tornado, Severe T-Storm, Flooding, Hurricane, High Winds, General Weather\n- **Store Events:** Technology, Utilities, Maintenance, Power Outage, Outage/Issue\n- **Community/External:** Public Emergency, Road Closure, Construction, Major Local Event, Competition\n- **Operations:** LTO/Promo, Holiday, Staffing Issue, CFV, EcoSure, RGR\n- **School Calendar:** School Year Begins/Ends, School Break, No School Day, Early Release\n\n## Holidays\n\nHolidays (Independence Day, Labor Day, Thanksgiving, Christmas, etc.) are handled separately via `isHoliday()` and `getHolidayAdj()` — a built-in table of known sales impact multipliers. You do not need to tag holidays manually; they are auto-detected.',
  },

  weather_adjustment: {
    title: 'Weather Adjustment — Empirical Calibration',
    category: 'Forecast Engine',
    summary: 'Calibrates per-store weather impact using linear regression of historical sales deviations vs weather variables.',
    detail: '# Weather Adjustment\n\n## Two Modes\n\n### Mode 1 — Empirical (Preferred)\n\nWhen weather data is loaded and "Use Empirical Weather" is enabled, the engine runs a per-store linear regression of actual sales deviation from DOW baseline vs weather variables. This is calibrated on sunny/dry days as the baseline (rainy days are excluded from the norm computation).\n\n**Variables and clamps:**\n\n| Condition | Trigger | Coefficient Clamp |\n|---|---|---|\n| Rain | > 0.1" | max −15%, min +2% |\n| Extreme Heat | tmax > 95°F | max −10%, min +1% |\n| Extreme Cold | tmax < 35°F | max −8%, min +1% |\n| High Wind | wmax > 25 mph | max −5%, min +1% |\n\nFormula: `wAdj = rainCoef×min(rain,3) + hotCoef×(tmax−95)/10 + coldCoef×(35−tmax)/35 + windCoef×(wmax−25)/25`\nFinal clamp: `max(−15%, min(+3%, wAdj))`\n\nMinimum 4 paired samples required per variable for regression to run.\n\n### Mode 2 — Settings Sliders (Fallback)\n\nWhen empirical is disabled or insufficient data exists, uses manually configured percentages from Settings:\n- Hot Day (>100°F), Cold Day (<20°F), Nice Day (65–85°F)\n- Light Rain (>0.25"), Heavy Rain (>1.5")\n- High Wind (>35 mph), Very High Wind (>50 mph)\n- Humidity / pressure minor adjustments\n\n## Fetching Forecast Weather\n\nWeather for future dates is fetched from **Open-Meteo** (free, no key required) per store location. The fetch runs with a 1.1-second delay between stores and up to 5 retry attempts on 429 (rate limit) responses, with progressive backoff: 0 / 15s / 30s / 60s / 120s.',
  },

  mape_drift: {
    title: 'MAPE Drift Detection',
    category: 'Forecast Engine',
    summary: 'Detects when a model is getting worse recently vs its 6-week history — early warning before calibration breaks down.',
    detail: '# MAPE Drift Detection\n\n## What It Measures\n\nCompares recent forecast accuracy (last 14 days) against the longer-term window (last 42 days):\n\n```\nmape2w = avg |actual − forecast| / actual  over last 14 days\nmape6w = avg |actual − forecast| / actual  over last 42 days\ndrift  = |mape2w − mape6w|\n```\n\n## Status Thresholds\n\n| Drift | Status | Action |\n|---|---|---|\n| < 2% | OK | No action needed |\n| 2–5% | Warn | Monitor; consider recalibrating |\n| ≥ 5% | Recalibrate | Model is degrading — run Dialed-In |\n\n## How It Affects Model Health Score\n\nWhen drift is detected (mape2w > mape6w + 5%), the Model Health Score loses 8 accuracy points (from the 25-point accuracy component).\n\n## Common Causes\n\n- New GM changing staffing patterns\n- Competitor opening or closing nearby\n- Remodel / construction affecting access\n- Major operational change (hours, menu, kiosk rollout)\n- Seasonal shift not yet captured in LY\n\nUsually resolves within 4–6 weeks once the change stabilizes, but recalibrating immediately locks the new baseline.',
  },

  confidence_interval: {
    title: 'Confidence Interval — Forecast Uncertainty Bands',
    category: 'Forecast Engine',
    summary: 'Statistical uncertainty bands derived from recent forecast error distribution (σ from last 8 weeks).',
    detail: '# Confidence Intervals\n\n## Computation\n\nFor each store, the engine computes standard deviation (σ) of percentage forecast errors from the last 8 weeks (minimum 7 data points, outliers >40% excluded):\n\n```\nerrors = [(actual − forecast) / actual] for each day in last 8 weeks\nσ = standard_deviation(errors)\n```\n\n## Interpretation\n\nThe confidence band shown in the UI represents ±1σ (approximately 68% confidence):\n\n```\nlower_bound = forecast × (1 − σ)\nupper_bound = forecast × (1 + σ)\n```\n\n| σ Value | Meaning |\n|---|---|---|\n| < 5% | Tight — model predicts well, schedule confidently |\n| 5–10% | Moderate — some uncertainty, add small scheduling buffer |\n| 10–15% | Wide — significant uncertainty, review before committing |\n| > 15% | Very wide — model unreliable, use manual judgment |\n\n## Relationship to MAPE\n\nσ and MAPE are related but not identical. MAPE measures average magnitude of error; σ measures spread of error distribution. A store can have low MAPE (on average accurate) but high σ (wildly variable) — these are both reported separately.',
  },

  new_store_ramp: {
    title: 'New Store Ramp Model',
    category: 'Forecast Engine',
    summary: 'For stores with fewer than 365 days of history, uses rolling actual averages instead of prior-year data.',
    detail: '# New Store Ramp Model\n\nWhen a store has no valid LY data (opened < 52 weeks ago or insufficient history), the standard LY lookup returns 0 and Meridian automatically switches to the Ramp Model.\n\n## Lookback by Age\n\n| Store Age | Lookback Window Used |\n|---|---|\n| < 14 days | All available actuals |\n| 14–41 days | Last 14 days same-DOW actuals |\n| 42–97 days | Last 28 days same-DOW actuals |\n| 98–399 days | Last 42 days same-DOW actuals |\n| ≥ 400 days | Standard LY model (52-week lookup) |\n\n## Brand-New Store (< 3 days of data)\n\nFalls back to the **district DOW average from the last 42 days** (excluding this store), scaled to 65% because new stores typically open below district average:\n\n```\nforecast = districtDOWAvg × 0.65\n```\n\n## After the Ramp Period\n\nOnce the store accumulates 365+ days of history with at least one valid LY match, it automatically transitions to the standard LY model. For stores opened in 2026 (e.g. Ponce de Leon-Hwy 81/I-10 opened 03/13/26), DI calibration is not viable until 6+ months of history is available.\n\n## Ponce de Leon Note\n\nStore 43701 opened 03/13/26. As of Jun 2026 (~14 weeks old), it is in the 42-day lookback window. DI calibration should not be run until approximately September 2026.',
  },

  daypart_engine: {
    title: 'Daypart Forecasting Engine',
    category: 'Forecast Engine',
    summary: 'When 3 Peaks data is loaded, produces separate forecasts for Breakfast (7–9 AM), Lunch (11 AM–2 PM), and Dinner (5–7 PM).',
    detail: '# Daypart Forecasting Engine\n\n## When It Activates\n\nThe daypart engine runs when **both** 3 Peaks files are loaded (peaksSalesRows AND peaksSvcRows). It produces a separate forecast for each of the three main dayparts for future dates.\n\n## Formula (per daypart)\n\n```\nlyAnchor = avg net sales for this store, same DOW, same daypart from last year\n\nt2 = (avg last 14d same-DOW same-daypart − lyAnchor) / lyAnchor\nt6 = (avg 14d−42d same-DOW same-daypart − lyAnchor) / lyAnchor\n\ntrend = t2 × tw.t2 + t6 × (tw.t4 + tw.t6)\n\nforecast = lyAnchor × (1 + trend) × (1 + plusUp)\n```\n\nDefault trend weights applied: t2=0.50, t4+t6 combined=0.50.\n\n**Minimum required:** 3 same-DOW same-daypart sales rows. If a daypart has insufficient history, it is excluded from the output.\n\n## Service Metrics per Daypart\n\nAlongside the sales forecast, the engine also reports:\n- **Avg OEPE** for this daypart (from peaksSvcRows)\n- **Avg Park %** for this daypart\n\nThis lets you identify whether a slow OEPE is a breakfast-specific issue vs lunch-specific.\n\n## Daypart Definitions\n\n| Daypart | Window | File Header |\n|---|---|---|\n| Breakfast | 7:00–9:00 AM | "7am-9am", "breakfast" |\n| Lunch | 11:00 AM–2:00 PM | "11am-2pm", "lunch" |\n| Dinner | 5:00–7:00 PM | "5pm-7pm", "dinner" |',
  },

  gc_crosscheck: {
    title: 'Guest Count Cross-Check',
    category: 'Forecast Engine',
    summary: 'Validates the sales forecast against an independent GC-based forecast. Flags >10% divergence as Watch, >20% as Alert.',
    detail: '# Guest Count Cross-Check\n\n## Purpose\n\nA parallel validation layer that catches when the sales forecast implies an unusual average check (sales ÷ guest count). This catches:\n- Over-forecasted sales driven by ops assumptions\n- Structural shifts (menu price changes, product mix shifts)\n- Data anomalies where LY GC and LY sales are mismatched\n\n## Calculation\n\n```\n# GC forecast (same LY priority chain as sales, with GC trend)\ngcForecast = gcLY × (1 + gcTrend)\n\n# Implied average check from sales forecast\nimpliedCheck = salesForecast / gcForecast\n\n# Store\'s actual 6-week rolling avg check (from recent Labor Analysis)\nnormCheck = avg(sales / gc) over last 42 days with data\n\n# Divergence from norm\ndeviation = (impliedCheck − normCheck) / normCheck\n```\n\n## Alert Thresholds\n\n| Deviation | Status |\n|---|---|\n| ≤ 10% | Normal |\n| 10–20% | Watch — implied check diverging from norm |\n| > 20% | Alert — investigate before locking projection |\n\n## Requirements\n\n- Minimum 5 recent rows with both sales and GC data for normCheck to compute\n- normCheck must be > $0.50 (filters data anomalies)\n- GC LY must be > 0\n\nThe cross-check runs on every future date in forecastDay() and its result is included in the return object for use in projection displays.',
  },

  lifelenz_bridge: {
    title: 'MBI vs LifeLenz Accuracy — WFM Comparison & Adjustment',
    category: 'App Guide',
    summary: 'Compares Meridian projections vs LifeLenz (WFM) projected sales. Surfaces bias direction and generates adjusted day-level projections to type into LifeLenz before schedule locks.',
    detail: '# MBI vs LifeLenz Accuracy\n\n## Purpose\n\nLifeLenz (Altametrics WFM, cutover Sep 2025) generates its own sales projections used for labor scheduling. When LifeLenz systematically over- or under-forecasts a store, the schedules it builds are miscalibrated. This panel surfaces that bias and tells you what number to type into LifeLenz before the schedule locks.\n\n**Access:** ⚗ Test Kitchen → Forecast Reports → "MBI vs LifeLenz Accuracy" tab\n\n## Requirements\n\n- Labor Analysis file loaded with "Projected Sales" (WFM Projected Sales column, typically column V)\n- The panel auto-runs on open for the selected store\n\n## Historical Bias Calculation\n\nFor each store, the engine analyzes the last 12 weeks of days where both actual sales and LifeLenz projected sales are available:\n\n```\nbiasPct = avg[ (actual − lfzProjection) / actual ] × 100\n```\n\n- **Positive bias** = LifeLenz under-forecasted (actual came in higher than projection)\n- **Negative bias** = LifeLenz over-forecasted (actual came in lower than projection)\n\nThis is also broken down by **day-of-week** (Sunday through Saturday) because LifeLenz bias is often DOW-specific.\n\n## 14-Day Forward Projections\n\nFor each of the next 14 days, the system computes what to type into LifeLenz:\n\n1. **Direct row:** If a LifeLenz projSales value already exists for that date, use it as the anchor\n2. **Pattern mode:** If no direct row, apply the DOW-specific bias correction to Meridian\'s own forecast\n\n```\nadjustedProjection = lfzAnchor × (1 − biasPct/100)\n```\n\nThe result is the number that — when typed into LifeLenz — should produce a correctly calibrated schedule.\n\n## Meridian vs LifeLenz Accuracy\n\nFor each store, the panel also shows Meridian\'s validated MAPE vs LifeLenz\'s MAPE over the same historical window, and which wins more days (Meridian Win Rate per DOW).\n\n## District View\n\nClick "District" to run the scan across all 27 stores simultaneously and rank by bias magnitude. Stores where LifeLenz is most systematically wrong appear at the top.',
  },

  plus_up: {
    title: 'Plus-Up — Sales Adjustment Layer',
    category: 'Forecast Engine',
    summary: 'A percentage added to all model forecasts at store, patch, or district level. Used for known uplifts like LTOs or new daypart launches.',
    detail: '# Plus-Up System\n\n## Purpose\n\nPlus-Up adds a fixed percentage to every model\'s output, after all other adjustments. It represents a human override for known uplifts or headwinds that the model cannot learn from history (e.g. a major new LTO launching nationally, a new daypart, or a known local event series).\n\n## Priority Chain\n\nThree levels, highest priority wins:\n\n1. **Store-level override** (`plusUpByStore[loc]`) — set per store in Projection Workspace\n2. **Patch (supervisor group) override** (`plusUpByPatch[patch]`) — applies to all stores in a supervisor\'s group\n3. **Global setting** (`plusUp`) — applies to all stores\n\n```\neffectivePlusUp(loc) =\n  if plusUpByStore[loc] defined → use that\n  else if any patch contains loc and plusUpByPatch[patch] defined → use that\n  else global plusUp\n```\n\n## Where It Applies\n\nPlus-Up is applied as the final multiplicative factor in the Core Forecast Formula, and also inside EWMA, Momentum, and Regression models. AE model does NOT apply Plus-Up (it uses the AE pipeline).\n\n## Typical Values\n\n- 0% — normal operation (default)\n- +2% to +5% — known positive LTO or favorable comps period\n- −2% to −5% — known headwind (major road closure, competition opening)',
  },

  model_health_scoring: {
    title: 'Model Health Score — Scoring Breakdown',
    category: 'Forecast Engine',
    summary: 'Four-component score (0–100) measuring how much to trust a store\'s Dialed-In forecast.',
    detail: '# Model Health Score\n\n## Overview\n\nA 0–100 composite score displayed on each store in the Projection Workspace and Forecast Accuracy panel. Four components:\n\n## Component 1 — Calibration Status (30 pts max)\n\n| Condition | Points |\n|---|---|\n| Calibrated within 7 days, settings unchanged | 30 |\n| Calibrated 8–21 days ago | 22 |\n| Calibrated 22–42 days ago | 15 |\n| Calibrated > 42 days ago | 6 |\n| Not calibrated at all | 0 |\n| Settings changed since last calibration | −10 |\n\n## Component 2 — Data Freshness (25 pts max)\n\n| Days since last actual | Points |\n|---|---|\n| < 3 days | 25 |\n| 3–6 days | 20 |\n| 7–13 days | 12 |\n| 14–29 days | 5 |\n| ≥ 30 days or no data | 0 |\n\n## Component 3 — MAPE Accuracy (25 pts max)\n\nUses best available short-window MAPE (6W preferred, then 4W, then full):\n\n| MAPE | Points |\n|---|---|\n| < 5% | 25 |\n| 5–8% | 20 |\n| 8–12% | 13 |\n| 12–18% | 6 |\n| > 18% | 0 |\n| + drift penalty (2W MAPE > 6W + 5%) | −8 |\n\n## Component 4 — Sample Size (20 pts max)\n\n| Data Points | Points |\n|---|---|\n| ≥ 300 | 20 |\n| 150–299 | 15 |\n| 60–149 | 10 |\n| 20–59 | 4 |\n| < 20 | 0 |\n\n## Thresholds\n\n- 🟢 **Trusted** ≥ 75 — projections can be scheduled against confidently\n- 🟡 **Fair** 50–74 — usable with caution; review before locking\n- 🔴 **Needs Attention** < 50 — do not rely without manual review',
  },

  // ── PANEL GUIDE (owner request 2026-11-03: "an overview of the panel offers followed by a
  // description of how the data is obtained and what it represents and how it can be read and
  // used... SOP style"). First batch -- the ~20 highest-traffic panels (the Workflow Guide's
  // DAILY/WEEKLY/MONTHLY/KEY FEATURES list). Remaining panels are a follow-on pass, not all 94
  // at once -- see memory/finding-kb-panel-guide-2026-11-03.md for scope and the full list of
  // what's covered vs. not yet.

  home_at_a_glance: {
    title: 'Home / At A Glance — Reading the District Home Screen',
    category: 'Panel Guide',
    summary: 'The district home screen: a configurable grid of signal tiles answering "what needs my attention today" before you drill into any one store.',
    detail: '# Home (At A Glance)\n\n' +
      '## Overview\n\nThis is the screen you land on after login (nav label "Home"; the screen itself is titled "At A Glance"). It is a grid of independent tiles/sections, each answering a different district-level question — it is not one computed score, it is many small signals side by side so a pattern (e.g. three stores all behind on labor) is visible at a glance.\n\n' +
      '**Default sections, top to bottom:** Needs You Today (red-flagged stores), Visit Readiness, Tracking to Plan, Did It Work? (coaching-loop follow-up), SAGE Scheduled Runs, Tolerance Status, Intelligence Summary, Projections & Forecasting, Sales & Guest Counts, Digital Sales, Service, Controls & Labor, FOB & Food Cost, District Pulse, Store Leaderboard. Below the tile grid: the patch heat map, bullseye distribution view, and the district projections section (next-period forecast vs LY).\n\n' +
      '## How the data gets here\n\nEvery tile follows the app-wide **auto/emailed-first, freshest-wins** rule: a tile is fed by an automated QSRSoft/LifeLenz sync or emailed stream first, and only falls back to a manual upload (Operations Report, Labor Analysis, FOB Excel) to fill a date/store the cloud hasn\'t covered yet. Manual data never overrides an auto value for the same store/date — it only fills a gap. If a tile looks stale, check the freshness banner/Data Manager\'s per-stream table before assuming the number itself is wrong.\n\n' +
      '## What it represents\n\nEach tile scores stores against **their own targets**, not a flat district number — so a small, low-volume store and a flagship store are each judged against what is realistic for them. "Needs You Today" and the patch heat map are the fastest way to see which specific stores have a critical flag right now; the other tiles (Sales, Digital, Service, Controls & Labor, FOB) are the same KPI families you\'ll see again, in more depth, inside each store\'s own dashboard.\n\n' +
      '## How to use it\n\n1. Start with **Needs You Today** / the patch heat map — these are the stores to open first.\n2. Scan **District Pulse** (a 5-metric radar: Sales/Labor, OEPE, T-Reds, FOB, each vs that store\'s own target) for a fast read on whether a problem is isolated or spread across KPI families.\n3. Use **Tracking to Plan** for an in-progress read on today\'s pace (hourly/daily reuse the live intraday DAR projection; weekly/monthly/YTD are derived from each store\'s own official monthly $ target, since there is no separate weekly/YTD budget upload — read these as a pace projection, not an uploaded figure).\n4. Click **🎯 Priority Brief** when you want the same signals turned into a ranked, tiered action list instead of a tile grid.\n5. The **Sections ☰** control lets you reorder or hide tiles — this is a personal display preference (saved locally and to your account), it does not change what data is computed.\n\nEvery tile and section here is also covered as its own, deeper KB article where one exists (e.g. look up the specific metric — OEPE, TPPH, Labor %, T-Red After % — for the full definition and targets).',
  },

  priority_brief: {
    title: 'Priority Brief — District Priority Brief (Tiered Daily Coaching List)',
    category: 'Panel Guide',
    summary: 'Turns every store\'s findings into three tiers — Action Required / Watch Closely / Running Well — so you know who to call first.',
    detail: '# Priority Brief\n\n' +
      '**On screen as:** the "🎯 Priority Brief" button on At A Glance (its underlying panel id is `priority-brief`; note the panel metadata label is "Priority Actions" — a known internal naming inconsistency, not two different features).\n\n' +
      '## Overview\n\nThe Priority Brief takes every store\'s already-computed finding set (the same findings engine that feeds the Intelligence Brief and every store\'s own dashboard) and sorts the whole district into three tiers:\n\n' +
      '- 🔴 **Action Required** — any store with ≥1 critical finding\n' +
      '- 🟡 **Watch Closely** — stores with watch-level flags but no critical finding (this includes a forecast-accuracy watch: a store with weekly MAPE over 12% and otherwise clean operational flags is surfaced here, not silently buried in the green tier)\n' +
      '- 🟢 **Running Well** — only positive/OK findings\n\n' +
      'Within each tier, stores are sorted by how many findings they have (red) or by combined ops/controls score (green).\n\n' +
      '## How the data gets here\n\nNo separate pull — it reads each store\'s `findings` array, the same structured output the rest of the app already computed from your loaded/synced Operations, Labor, and Controls data. Filterable by Org (All/OK/FL) or by supervisor patch.\n\n' +
      '## What it represents\n\nA **District Pulse** summary at the top also tallies which issue type (cash, labor, OEPE, T-Red, deposit, overtime, scheduling) is most common district-wide right now, as a "This Week\'s Focus" pointer for a district-level conversation, not just a per-store one.\n\n' +
      '## How to use it\n\n1. Work the **Action Required** tier first, in the order shown (most findings / highest dollar impact first).\n2. Use **District Pulse\'s focus line** to decide whether this week\'s coaching should be store-specific or a district-wide process fix (e.g. if OT discipline is the top bucket district-wide, that\'s a scheduling-template conversation with every supervisor, not one GM).\n3. Click any store card to jump straight into its full dashboard.\n4. Use the Org/patch filter to run this as a supervisor\'s own patch-level daily standup list.',
  },

  store_dashboard_overview: {
    title: 'Store Dashboard — Overview Tab',
    category: 'Panel Guide',
    summary: 'The per-store landing tab: Sales vs LY, Labor %, OEPE, TPPH, and Cash O/S at a glance, each colored against that store\'s own target.',
    detail: '# Store Dashboard — Overview\n\n' +
      '## Overview\n\nReached by clicking any store from the district grid, District View, or a tile on At A Glance. The Overview tab is the default landing tab and shows the store\'s core KPI set — Sales (with vs-LY%), Labor %, OEPE, and TPPH — plus Cash O/S, each colored green/amber/red against that store\'s own configured target, not a flat district number.\n\n' +
      '## How the data gets here\n\nSame auto-first, freshest-wins sourcing as every other panel in the app: QSRSoft DAR/eBOS auto-sync and emailed streams first, manual Operations Report / Labor Analysis / Register Audit upload only filling a gap the cloud hasn\'t covered yet.\n\n' +
      '## What it represents\n\nSales vs LY is a matched-day comparison, not a flat delta. Labor % is labor cost (wages + taxes/benefits) over net sales. OEPE and TPPH are the store\'s speed and labor-efficiency metrics (see their own KB articles for full definitions and typical target ranges). Cash O/S is the daily cash variance as a percentage of sales — look up the Cash O/S article for why the *sign* (over vs short) matters, not just the magnitude.\n\n' +
      '## How to use it\n\n1. Scan the four/five KPI rows first — anything colored red or amber is the reason you\'re looking at this store.\n2. Move to **Shift Analysis** for the day-of-week/daypart breakdown behind a flagged number (e.g. is OEPE bad every day, or only Friday dinner?).\n3. Move to **Intelligence Brief** for the same store\'s full findings list (critical/watch/ok, plus a forecast outlook line) in one place, or generate the AI narrative version for a coaching conversation.\n4. Cross-reference OEPE and TPPH together, not separately — a store can look fine on one and be masking a problem on the other (see the TPPH article\'s note on this).',
  },

  shift_analysis_tab: {
    title: 'Shift Analysis Tab — Day-of-Week, Channel Mix, and Peak-Hour Labor',
    category: 'Panel Guide',
    summary: 'Day-of-week ops patterns, channel mix, OEPE Revenue Opportunity, 3 Peaks × Labor Gap, and Competitive Impact — one tab, several sub-sections, two of which need extra files loaded.',
    detail: '# Shift Analysis\n\n' +
      '## Overview\n\nA tab inside the store\'s dashboard (store-analytics.js) with several independently useful sub-sections, reachable via nav pills at the top of the tab:\n\n' +
      '- **Day-of-week ops metrics** — baseline patterns from your loaded Operations/DAR data, always available.\n' +
      '- **Channel mix heatmap** — DT/MOP/Kiosk/Delivery share by day, from the same data.\n' +
      '- **OEPE Revenue Opportunity** — the estimated revenue impact of closing an OEPE gap.\n' +
      '- **3 Peaks × Labor Gap** — cross-references peak-hour OEPE against same-day labor deployment to reveal understaffed high-OEPE days. **Requires a 3 Peaks file to be loaded** (Breakfast/Lunch/Dinner service + sales export) — without it, this section shows a dimmed "Load 3 Peaks file to unlock" prompt instead of data.\n' +
      '- **Competitive Impact** — sales impact vs the DOW baseline on dates you\'ve tagged with a Competition event. **Requires at least one tagged event** in the Calendar/Events panel — tag a competitor opening, promotion, or closure using the Competition event type first, then this section populates.\n\n' +
      '## How the data gets here\n\nThe always-available sections use the same auto-first operations data every other panel does. The two gated sections each need one extra input: a manually uploaded 3 Peaks export, or a manually tagged Calendar event — both are one-time setup per store/date, not a recurring upload.\n\n' +
      '## What it represents\n\nThis tab exists to answer "when, specifically, is the problem happening" once the Overview tab has told you a KPI is off-target — it breaks a flat weekly/monthly number down by day-of-week and, where unlocked, by peak window.\n\n' +
      '## How to use it\n\n1. Start with day-of-week ops metrics to see if a flagged KPI is a specific-day problem or a constant one.\n2. If a day shows elevated OEPE, check **3 Peaks × Labor Gap** (once loaded) to see whether that day was also understaffed at that peak — that distinguishes a staffing problem from an execution problem.\n3. If you suspect a competitor event explains a dip, tag it in the Calendar first, then come back to **Competitive Impact** to see the measured effect vs that store\'s own DOW baseline.',
  },

  intelligence_brief: {
    title: 'Intelligence Brief — Per-Store Findings + AI Narrative',
    category: 'Panel Guide',
    summary: 'Two related things share this name: the store dashboard\'s structured findings list, and a separate "Generate" button that produces a full AI-written narrative analysis.',
    detail: '# Intelligence Brief\n\n' +
      '## Two things share this name — know which one you\'re looking at\n\n' +
      '1. **The Intelligence Brief tab** (inside a store\'s dashboard) is a structured list of that store\'s findings — the same critical/watch/ok findings used by the Priority Brief\'s tiering — plus one added forecast-outlook line (projected sales this period vs LY, with a bullish/headwind read). It is not prose; it is a prioritized list of flagged items.\n' +
      '2. **"🧠 Generate Intelligence Brief"** is a separate AI-generated narrative report you can run for a single store, a whole district, or any other scope — it produces free-text analysis (downloadable, regenerable) rather than the structured list above.\n\n' +
      '## How the data gets here\n\nBoth read from the same underlying findings/metrics the rest of the app already computed from your synced/loaded data — neither is a separate data pull. The AI narrative version sends that computed context to Claude to produce the written analysis.\n\n' +
      '## What it represents\n\nThe structured findings list is the fastest way to see exactly what\'s flagged and why, with severity already sorted. The AI narrative version is meant to read like a briefing document — useful to hand to, or read aloud to, a GM or supervisor without them having to interpret a findings list themselves.\n\n' +
      '## How to use it\n\n- Use the **structured findings tab** when you (the DO/supervisor) are the one deciding what to act on.\n- Use **🧠 Generate** when you want a ready-to-share narrative for a coaching conversation or a written record of this period\'s review — regenerate it any time the underlying data has moved since you last ran it.',
  },

  planning_hub: {
    title: 'Planning Hub — Targets, Monthly, Pace, Yearly, Smart',
    category: 'Panel Guide',
    summary: 'One panel, five tabs, covering every projection and target workflow from monthly sales targets to the learned Smart Targets model.',
    detail: '# Planning Hub\n\n**Access:** sidebar → Planning. Five tabs, each a separate panel loaded on demand — switching tabs doesn\'t reload the whole hub.\n\n## Targets\nThe Unified Targets panel — the monthly target workbook values (sales, labor, FOB components, etc.) uploaded via the QSRSoft Monthly Projections / OpsTargets workbook, with company/state/patch/store override cascade for the fields the Targets Editor registry covers.\n\n## Monthly\nThe Monthly Targets grid (`monthly_targets` table) — per-store monthly target values (Sales & Labor, Service, Food Cost, Other Costs) with patch/operator rollups. Click any store\'s cell to edit it in place — saves straight to Supabase. Excel upload (the QSRSoft Monthly Projections / OpsTargets workbook) remains the bulk-entry path for a full month across all stores. **This tab has no lock or double-click-override mechanic** — that\'s a separate feature, see "How to lock a sales projection" below.\n\n## Pace\nMonth-to-date actual vs target with a run-rate projection to month-end — answers "are we on pace to hit this month\'s target" without waiting for the month to close.\n\n## Yearly\nThe Yearly Targets grid (`yearly_targets` table), broken into category tabs (Service & Ops, CSAT, Digital, People, Labor & FOB). Same click-to-edit-and-save pattern as Monthly, plus a printable/exportable report (Print Report / Export buttons). No lock mechanic here either.\n\n## Smart\nThe Smart Targets engine — see the **Smart Target Engine** article for how it computes a defensible target per store. Its own "Apply as Official" action writes straight into Monthly\'s `tProdSales`.\n\n## How to lock a sales projection (a different system from Targets)\nLocking commits a specific forecast value for scheduling and DI-accuracy comparison — it only exists in **▦ Projections** (sidebar → Forecasting and Labor Projections; double-click a cell to override, then Lock). See the **Locked Projections** article for the full workflow and deadlines (~10 days before each week starts; by the 15th of the prior month for the full month). Check the MAPE % shown next to each store before trusting its forecast — a high MAPE means the model has been unreliable for that store recently; see the **MAPE** article for what the number means and the **DI Calibration** article for fixing it.',
  },

  pvsa: {
    title: 'Proj vs Actuals — Forecast Backtest Report',
    category: 'Panel Guide',
    summary: 'Compares past weeks\' AI forecasts against what actually happened, per store, so you know which stores\' models are trustworthy right now.',
    detail: '# Proj vs Actuals\n\n**Access:** sidebar → Forecasting and Labor Projections → ◑ Proj vs Actuals (promoted out of Test Kitchen, v5.685).\n\n## What It Does\nFor each store, re-runs the forecast model (using TODAY\'s settings/calibration) against every day in a past window, and compares that forecast to the actual sales recorded for that day (from Labor Analysis / `laborRows`). Rolls the daily comparison up into weekly totals.\n\n## How Data Is Obtained\n- **Forecast side:** computed live by calling the same `forecastDay` engine the live Planning → Monthly tab uses — not a stored snapshot, so it reflects your CURRENT calibration and settings, not what was projected at the time.\n- **Actual side:** `ds.laborRows` (Labor Analysis upload) for the same store/date.\n- Weeks are **Wednesday-start** (McDonald\'s standard business week), either the last 2/4/6 weeks (preset) or a custom date range.\n\n## What It Represents\nEach week shows: forecast total, actual total, LY total, and that week\'s **MAPE** (mean absolute % error — see the **MAPE** article for the general definition). This report\'s own color/narrative cuts are **<6% = "✓ Excellent accuracy"**, **6–10% = "~ OK accuracy"**, **>10% = "✗ Needs work"** — a tighter bar than some other MAPE displays in the app, by design, since this view is specifically meant to flag stores needing recalibration.\n\n## How to Use\n1. Pick a grouping (Patch / Operator / Org / All Stores) and a window (2/4/6 weeks, or a custom range).\n2. Run the backtest.\n3. Any store consistently landing in the "Needs work" band across multiple weeks is a candidate for **DI Calibration** (run ↺ Recalibrate on it) rather than continuing to trust its current model as-is.\n\nThis is a weekly workflow step (Workflow Guide: "Run Projection vs Actuals report") — run it every Wednesday alongside locking the coming week\'s projection.',
  },

  di_calibration_panel: {
    title: 'DI Calibration — Panel & Workflow',
    category: 'Panel Guide',
    summary: 'The screen where you run, review, and act on per-store Dialed-In calibration. For the calibration math itself, see Dialed-In Calibration — Grid Search.',
    detail: '# DI Calibration (the panel)\n\n**Access:** sidebar → Forecasting and Labor Projections → ◎ DI Calibration (promoted out of Test Kitchen, v5.685).\n\nThis article covers the SCREEN and workflow. For what the grid search actually optimizes and the formula it calibrates, see the **Dialed-In Calibration — Grid Search** article — this page won\'t repeat that.\n\n## What\'s On Screen\n- **Stats bar:** calibrated store count, mean/median MAPE across all calibrated stores, average 6W/4W/2W MAPE, and a live running status.\n- **▶ Calibrate All:** runs the grid search for every store in sequence (~10–15 seconds for the full district). Writes results to a per-store results table and to cloud storage (so results and overrides sync across devices).\n- **✓ Apply & Enable:** turns on Dialed-In district-wide, using the calibrated parameters instead of the default model.\n- **↻ (per-store):** recalibrates just that one store.\n- **✓ Use / ⊘ Skip (per store):** opt a specific store OUT of Dialed-In even while it stays on district-wide, falling back to the default model for that store only.\n- **🔄 icon:** appears next to a store when settings have changed since its last calibration — a visual "recalibrate recommended" flag, independent of the drift warning below.\n\n## The ⚠ Drift Warning\nShown next to a store\'s MAPE when its 2-week MAPE is more than 5 points worse than its 6-week MAPE (`mape2w > mape6w + 5`) — meaning the model has gotten noticeably LESS accurate recently than its longer-term track record. A green ▲ instead means the model is improving (2W MAPE more than 3 points better than 6W). See the **MAPE Drift Detection** article for the underlying logic.\n\n## How to Use\n- **Weekly:** check for ⚠ drift warnings on individual stores; run ↺ Recalibrate on any that show one.\n- **Monthly:** run ▶ Calibrate All district-wide, regardless of whether any store shows drift — this refreshes every store\'s model with the latest 6+ weeks of actuals.\n- A store needs ~60+ days of history before it can calibrate at all; a newer store will show as "not yet eligible," not as an error.',
  },

  food_cost_panel: {
    title: 'Food Cost — Panel Guide',
    category: 'Panel Guide',
    summary: 'FOB / food-cost variance analysis ranked by dollar impact, plus an End of Month inventory-troubleshooting mode in the same panel.',
    detail: '# Food Cost\n\n**Access:** sidebar → Food Cost (this panel was renamed from "FOB Analysis" — same panel, same id `fob-analysis`, just a label change).\n\n## How Data Is Obtained\nCloud-first: the `qsr_fob` auto-synced stream is the primary source (6 controllable FOB components + FOB% + Base Food% + Discounts% + Total Food Cost %, computed Σ$ ÷ Σsales — never averaged as a plain average of percentages). A manual FOB Excel upload (`ds.fobRows`) fills any store/date gap the auto stream doesn\'t cover yet, but never overrides it — the standard auto-first, manual-fallback rule used throughout the app.\n\n## What It Represents\nFood cost variance (actual usage vs target) broken down by store and by cost component (waste, condiment, paper, etc.), for a selectable month.\n\n## How to Read and Use It\nThe **Root-Cause Priority Matrix** is the main coaching tool on this panel: it ranks (store, component) pairs by dollar impact — not just by percentage over target — so the highest-dollar opportunity surfaces first regardless of which store or which component it is. Expand any row for the per-store breakdown behind that number. Use the Print button to export a PDF for a coaching conversation.\n\n**Workflow:** weekly, review the top 3 Root-Cause Priority Matrix items district-wide before moving further down the list — those are where a coaching conversation will have the most dollar impact.\n\n## End of Month Mode\nA mode tab inside this same panel (📋 End of Month) — the per-store EOM inventory troubleshooter, for reconciling a physical count against the running FOB numbers at month-end. It is not a separate panel; old `?panel=fob-eom` links and the sidebar\'s old "End of Month" entry both redirect here with this mode pre-selected.',
  },

  gm_letters: {
    title: 'GM Letters — AI Coaching Letters',
    category: 'Panel Guide',
    summary: 'Generates a personalized weekly performance coaching letter per GM, grounded in that store\'s real trend data and findings — single-store or district-wide batch.',
    detail: '**What it offers:** Single mode generates one AI-written coaching letter for a chosen store; Batch mode runs the same generator across every store in the district in one pass, with per-store progress and the ability to expand/review/edit each letter before sharing.\n\n**How the data is obtained:** Pulled entirely from `buildStore`/`buildBrief` output already computed for that store — no separate query. Specifically: 6/4/2-week trend snapshots for Labor %, TPPH, and OEPE (with explicit improving/worsening/stable direction), the store\'s current Critical/Watch/Strength findings, its Store KB note, and a 4-week Why Engine scan for forecast-accuracy context (MAPE, % of misses explained, worst day-of-week).\n\n**What it represents:** A structured prompt built from that real data is sent to the AI, which writes the letter — it is not canned text, but it is also not independently researched; the letter can only be as good as the underlying trend/findings data for that store and period.\n\n**How to read and use it:** Review every AI-generated letter before sending — there is an explicit "reviewed" step in the UI. Use Single mode after loading fresh data for a one-off coaching conversation; use Batch mode for the monthly operator roll-up (filter to an operator\'s store group or patch, generate letters for all of them, and bring them to the monthly review meeting). A letter with "No specific flags this period" means performance was within normal ranges — that is a legitimate (if less actionable) outcome, not a missing-data error.',
  },

  delivery_3po: {
    title: '3PO Delivery — Channel Mix & Delivery Platforms',
    category: 'Panel Guide',
    summary: 'Two tabs: a 5-channel sales-mix overview (DT/Breakfast/Delivery/MOP/Kiosk) and a DoorDash/UberEats/Grubhub platform drill-down.',
    detail: '**What it offers:** This panel merged the old "Channel Intel" panel in as its Overview tab (an overview + drill-down pairing on the same delivery slice, not two separate computations). **Overview** shows Drive-Thru, Breakfast, MOP (mobile order & pay), Kiosk, and Delivery as a % of total sales per store, with a per-store ranking view for each channel. **Delivery Platforms** breaks the Delivery slice itself down by DoorDash / UberEats / Grubhub.\n\n**How the data is obtained:** The two tabs are deliberately NOT unified onto one data source. Overview reads the Operations Report\'s Sales-sheet channel columns; Delivery Platforms reads the QSRSoft Cash Sheet (cloud auto-pulled) for per-platform sales and guest counts.\n\n**What it represents:** Overview is a snapshot of how guests are ordering (counter vs. drive-thru vs. digital/delivery channels); Delivery Platforms is specifically which third-party app the delivery portion is coming through.\n\n**How to read and use it:** Use Overview to spot stores with unusually low digital/delivery mix vs. the district average — that is often a missed sales-opportunity signal, not just a channel curiosity. Use the date range selector (7/14/28/60 days) to separate a real trend from a one-week blip. Use Delivery Platforms when a store\'s delivery revenue is concentrated in one app, since that is a single-point-of-failure risk if that platform runs a promo pause or an outage.',
  },

  revenue_intelligence: {
    title: 'Revenue Intelligence Engine',
    category: 'Panel Guide',
    summary: 'District-wide OEPE-driven revenue opportunity: what closing each store\'s speed gap to target is worth in dollars per month, plus daypart erosion and competitive-pressure signals.',
    detail: '**What it offers:** A per-store "💡 Revenue Intelligence" view with four pieces: OEPE dollar value (what each second of speed is worth at that store\'s volume), unrealized revenue (the monthly $ opportunity if the store closed its OEPE gap to target), daypart erosion detection, and competitive-pressure signals — plus multi-model sales projections for context. The top of the panel totals every store\'s OEPE opportunity into one district-wide number.\n\n**How the data is obtained:** Computed by `computeRevenueOpportunity()` against the same store data (`ds`) and settings/targets already loaded elsewhere in the app — not a separate upload. The district ranking re-runs this computation for every store to sort them by opportunity size.\n\n**What it represents:** This is a **projection of additional throughput value**, not booked revenue — it answers "if this store\'s OEPE matched its target, this is roughly what the extra transactions would be worth per month," which is a planning number for prioritizing coaching attention, not a guaranteed dollar figure.\n\n**How to read and use it:** Sort the district ranking by opportunity size to decide which stores\' speed problems are actually costing the most money — a store with a large OEPE gap AND high volume ranks above a small store with the same gap. Treat a flagged competitive-pressure signal (🔍) as a prompt to check if a nearby competitor opening/promotion explains a sales erosion pattern before assuming it is purely an internal speed issue. Use this in operator-level discussions to make the case for staffing/training investment in dollar terms, not just seconds.',
  },

  guest_voice_smg: {
    title: 'Guest Voice (SMG VOICE)',
    category: 'Panel Guide',
    summary: 'Customer satisfaction scores from SMG — a FullScale aggregate scorecard (OSAT/Accuracy B2B) and individual customer comments, both color-coded against adjustable thresholds.',
    detail: '**What it offers:** Two data views in one panel — a FullScale scorecard table (aggregate monthly OSAT / Top-2 / OSAT B2B / Accuracy B2B scores per store) and individual customer comments. Scores are color-coded green/yellow/red against a threshold standard you can customize.\n\n**How the data is obtained:** Two separate manual uploads — drop a `FullScale_Report.xlsx` for the aggregate scorecard numbers, or an SMG VOICE PDF for individual customer comments. These are different files covering different granularity (store/month aggregate vs. per-guest feedback), not two formats of the same data.\n\n**What it represents:** OSAT (Overall Satisfaction) and Accuracy B2B (order accuracy, "back-of-house to bag") are the two headline scores. The shipped default standard is OSAT/Top-2/OSAT B2B ≥ 90% and Accuracy B2B ≥ 95% — but these are adjustable, not hardcoded: the ⚙ Thresholds panel lets you set your own standard, or auto-calibrate it from your own historical FullScale data (p75 of your actual results), which needs at least 4 store-month records to run.\n\n**How to read and use it:** Treat a store red on OSAT or Accuracy B2B as an immediate coaching item — these are guest-facing satisfaction/accuracy failures, not internal efficiency metrics. Use the comments view for the "why" behind a low score; use the scorecard for the district-wide trend. If your district\'s real historical performance runs meaningfully above or below the 90%/95% defaults, auto-calibrate the thresholds rather than coaching against a standard that doesn\'t match your actual operation.',
  },

  scheduling_hub: {
    title: 'Scheduling Hub',
    category: 'Panel Guide',
    summary: 'One hub, twelve tabs, covering everything labor/scheduling: efficiency analytics, pay-event tracking, LifeLenz compliance/variance/performance audits, the scheduling tools themselves, and skills/retention.',
    detail: '**What it offers — current tabs:**\n- **Labor Analytics** — TPPH, labor %, OT, Actual-vs-Need staffing gap\n- **Pay Events** — pay-raise / review-cycle tracking, next to the AROP column it explains\n- **Schedule Discipline** — who edited a published schedule, what changed, and the hours/cost impact (from LifeLenz Data Explorer)\n- **Compliance Audit** — real labor-compliance violations (meal/rest break, minor-labor, etc.) with a $ cost/hours penalty (LifeLenz Data Explorer)\n- **Employee Performance** — per-employee attendance %, drop/pickup/swap activity, discipline/commendations (LifeLenz Data Explorer)\n- **Scheduling** — the scheduling-intelligence tools themselves\n- **Schedule Summary** — the LifeLenz weekly band across all stores, with per-station hours & cost\n- **Labor Analysis** — the weekly Fixed/Floor/VLH plan from the LifeLenz sync\n- **Labor Allocation** — daypart-level TPPH actual vs. target\n- **Training Retention** — per-store before/after workshop delta\n- **Retention Rollup** — the same retention data rolled up by Patch/Operator/Org/State\n- **Skills** — per-employee cross-training matrix\n\n**How the data is obtained:** A mix of the LifeLenz daily auto-sync (Schedule Discipline, Compliance Audit, Employee Performance, Schedule Summary, Labor Analysis all read from LifeLenz Data Explorer pulls) and the QSRSoft/Operations auto streams (Labor Analytics). Tabs load on demand, not all at once.\n\n**What it represents:** This hub is the single home for anything about who is scheduled, what they\'re paid, whether the schedule was followed and compliant, and whether labor is being used efficiently — as opposed to Planning (sales/target projections) or Performance Reviews (formal GM scoring).\n\n**How to read and use it:** Each tab is scoped by role/permission, so what you see here reflects what your role is allowed to act on. Start with Labor Analytics for the day-to-day efficiency read; use Compliance Audit and Schedule Discipline when investigating a specific labor-cost or compliance problem; use Retention Rollup for a district-level view of which patches/operators are getting the most out of training investment.',
  },

  store_kb_guide: {
    title: 'Store KB — Per-Store Operational Context',
    category: 'Panel Guide',
    summary: 'A free-text note plus click-to-toggle context tags per store — "things to know about this store" that don\'t show up in any report but change how its numbers should be read.',
    detail: '**What it offers:** Reached from Settings → Store Notes. Pairs a free-text "Operational Context" note with click-to-toggle Quick Tags grouped into 5 categories: **Performance** (well-run, high-volume, improving, model-degrading), **Management** (gm-in-training, new-gm, fl, high-turnover), **Location** (tourist, interstate, seasonal, school-zone), **Physical** (capacity-limited, single-lane, new-location, remodel), **Context** (loves-gas-station, historical-anomaly, di-skipped, insufficient-data) — plus custom free-text tags.\n\n**How the data is obtained:** A static seed table (one entry per store, in `constants.js`) merged with a user-editable overlay you maintain yourself — no external source, this is entirely your own institutional knowledge.\n\n**What it represents:** Durable context about WHY a store\'s numbers look the way they do — a fact a report alone can\'t tell you (e.g. "GM in Training" explains a temporary dip; "Capacity Limited" explains why volume plateaus below target).\n\n**How to read and use it:** Tagging a store once improves how multiple OTHER panels interpret its numbers — anomaly-threshold leniency, AI-generated coaching letters, peer-comparison logic, and Signals all read these tags automatically. Tag a store the moment you know something is true about it (new GM, remodel, seasonal pattern) rather than waiting — the tag\'s value compounds across every panel that reads it, not just this one.',
  },

  why_engine_guide: {
    title: 'Why Engine — Root-Cause Analysis for Forecast Misses',
    category: 'Panel Guide',
    summary: 'Explains why a store\'s actual sales missed its forecast on a given day, with a ranked list of possible causes — not a single confidence score.',
    detail: '**What it offers:** A single-store scan over a lookback window, or a district-wide scan, that explains a sales miss.\n\n**How the data is obtained:** Compares each day\'s real sales against that day\'s forecast (the same forecast engine every other panel uses) — no separate pull.\n\n**What it represents:** `diagnoseMiss()` runs 7 independent checks per miss and returns a list of causes, each tagged **PRIMARY / CONTRIBUTING / NOTE / DISTRICT-WIDE / MULTI-STORE / REGIONAL / UNKNOWN** — this is a weighted list of tagged causes, not a single numeric confidence score. The 7 checks: (1) a tagged calendar event, (2) cross-store correlation (if ≥2 other stores moved the same direction, it\'s flagged district/regional, not store-specific), (3) weather adjustment, (4) ops factor (OEPE/TPPH/staffing-driven), (5) trend divergence between the 2-week and 6-week windows, (6) missing LY data, (7) a store-specific statistical anomaly (≥2σ from that store\'s own same-DOW history). An AI Lookup button can search for local news/weather/events on that date.\n\n**How to read and use it:** When a store\'s actual sales diverge sharply from forecast, open Why Engine for that store/date before assuming it\'s a scheduling or ops problem — a `DISTRICT-WIDE` cause means look at the whole district, not that one GM.',
  },

  competitive_impact_guide: {
    title: 'Competitive Impact',
    category: 'Panel Guide',
    summary: 'Measures the real sales effect of a tagged competitor event against the store\'s own day-of-week baseline — not an assumption, a calculated before/after.',
    detail: '**What it offers:** A sub-section inside Store Dashboard → Shift Analysis, dimmed/empty until at least one competition event is tagged.\n\n**How the data is obtained:** Tag a date in the Calendar with one of 6 competition event types (Competition/General, Competitor New Opening, Promo/Deal, Closed/Down, Price Change, Media/PR Event).\n\n**What it represents:** For every tagged event, `impact = (actual sales that day − this store\'s own DOW average) / DOW average`, averaged across all tagged events for that store, shown as "Avg impact: +X%" with each event\'s individual date/type/impact listed below (a closure event color-flips the sign so a positive impact reads as good news for you).\n\n**How to read and use it:** Tag competitor opens/closes/promos as you learn about them, then check this tab after a few data points accumulate — it tells you in dollars-relative-to-normal whether that competitor is actually moving your sales, not just whether you assume it is.',
  },

  sage_guide: {
    title: 'SAGE — AI Advisor',
    category: 'Panel Guide',
    summary: 'A Claude-powered conversational advisor with 12 live data tools, RBAC-scoped to what your role and stores are allowed to see.',
    detail: '**What it offers:** A streaming chat panel — ask a direct question in plain language instead of opening 3-4 different panels to piece an answer together.\n\n**How the data is obtained:** 12 live tools reading directly from Meridian\'s real cloud tables (sales/DT, LifeLenz labor, forecast MAPE, promo ROI, labor summary, EOM recount impact, SMG scores, data-stream health, Forms completion) plus two search tools (the QSRSoft vendor Help Center docs, and this repo\'s own curated internal notes) and a web-search tool for outside-the-app context (local news/weather).\n\n**What it represents:** Every data tool is RBAC-scoped — a GM asking about labor only ever sees their own store\'s data, the same access boundary every other panel enforces.\n\n**How to read and use it:** Every answer has a 🐞 Log button (turns it into a Task Queue ticket or Feature Request with the Q+A context pre-filled) and a 📚 Prompts library (save a question, reuse it, or ⏰ Schedule it to auto-run on a recurring cadence). Use SAGE when you have a specific question spanning multiple data sources; use the panel itself when you want to browse/scan rather than ask.',
  },

  signals_guide: {
    title: 'Signals — Live Alerts and Correlation Discovery',
    category: 'Panel Guide',
    summary: 'Ten real tabs: live intraday tracking and alerts, two store-level diagnostics (projection bias, park-vs-speed), a read-only QSRSoft config reference, and four correlation-discovery tools for finding which of your metrics actually move together.',
    detail: '**What it offers:** **⚡ Live Ops** — today\'s (or a past day\'s) tracking-to-plan in $ and guest count with a traffic-vs-sales divergence flag, a per-store Sales Pace/DT Speed/Labor-vs-Need/Accuracy table, and — inside this same tab, not a separate one — a **Baseline Anomalies** strip for hours running far off their historical QSRSoft mean. **📐 Projection Accuracy** — a standalone, non-cumulative actual-vs-QSRSoft-projected bias by hour-of-day over 7/14/30/60/90-day windows, district-wide or per store; a different lens than Live Ops\' cumulative pace, built to catch a persistent projection-source bias worth manually correcting rather than a one-day blip. **🅿️ Park × OEPE** — a quadrant diagnostic pairing each store\'s trailing-90-day park% against its OEPE excluding parked time, since parking is a deliberate tool and only reads as a problem against how fast the store still runs. **🎛️ Store Controls** — a read-only reference view of each store\'s real QSRSoft RFM/Cash/Variance/Deposit/Autopost configuration (T-Red thresholds, discount %s, tax tables, cash limits), shown beside Meridian\'s own Smart-Targets-style targets only where the two concepts are unambiguous, never auto-applied. **Built-in** — the registry\'s own pre-defined signal cards (domain-filterable), plus a Scheduling Cascade callout when enough of a linked chain is confirmed. **Signal Lab** — build and save a custom X→Y correlation from any two registry metrics or product-mix items, with promote/retire/vote. **🔎 Scanner** — auto-correlates every metric pair in the registry, plus optionally top product-mix items, with an effect-size floor and Benjamini-Hochberg FDR correction, and one-click-tracks a found pair into Signal Lab. **🔗 Correlations** — the retired standalone Metric Correlations panel, folded in here on Scanner\'s own FDR-corrected statistics (a chosen target metric vs. a predictor catalog). **😊 CSAT Drivers** — scans operational metrics against SMG VOICE/FullScale CSAT outcomes for within-store correlations, tiered signal/noise, savable to a driver knowledge base that tracks decay over time. **⚰ Graveyard** — retired Signal Lab definitions, restorable.\n\n**How the data is obtained:** Reads the same auto-synced cloud streams (DAR, LifeLenz, Controls, Weather, Calendar day-of-week flags, SMG FullScale, product mix) everything else in the app does through the shared metric-source resolver — no separate upload. Store Controls and Projection Accuracy additionally read their own small, purpose-built tables (`qsr_store_controls`/`qsr_store_settings`, `hourly_projection_accuracy`), each populated by its own scheduled pull.\n\n**What it represents:** A tool for finding and diagnosing relationships and biases ("does rain really hurt sales at this store?", "is this hour of day systematically over-projected?", "is this store under-parking?"), not a single KPI dashboard like Home or Store Dashboard. Speed of Service itself is a separate panel with its own KB article — it is not one of this panel\'s tabs despite the name overlap.\n\n**How to read and use it:** Check Live Ops first for today\'s live flags, including Baseline Anomalies. Reach for Projection Accuracy or Park × OEPE when a Live Ops number looks persistently off and you want to know whether the cause is the projection source itself or a store\'s own staffing/parking pattern. Reach for Scanner, Correlations, or CSAT Drivers when you have a hunch about two things being related and want it checked against real history — with the statistical guardrails doing the work of ruling out a fluke — before acting on the hunch alone. Store Controls is a reference for what QSRSoft itself has configured, not a performance target.',
  },

  security_panel_guide: {
    title: 'Security — Panel Guide',
    category: 'Panel Guide',
    summary: 'A read-only loss-prevention investigation surface, grouped by SUBJECT (person or item) rather than by rule — a lead is convergence across signals, not one isolated flag.',
    detail: '**What it offers:** Three domain tabs — **Cash** and **Labor** (subjects identified by employee token) and **Inventory** (subjects identified by item/WRIN) — each showing every subject with at least one rule evaluated against them in the selected window, grouped so every rule a subject PASSED is visible right next to the one they didn\'t (exoneration is as visible as a flag, by design). A subject flagged on three of four independent signals is a real lead; flagged on one alone is noise, and that convergence is invisible in the underlying batch job\'s own rule-major output — this panel\'s whole reason for existing.\n\n**How the data is obtained:** Reads `security_findings`, written by a scheduled batch job that evaluates rules against QSRSoft cash/inventory/labor data — this panel never writes a finding, only displays what the batch already decided. A rule\'s verdict renders as one of three states, never collapsed into a simple pass/fail: **flagged** (a real, definite hit), **clear** (the rule evaluated and found nothing — a real exoneration, not an absence of data), or **undetermined** (no exposure, no baseline, or below the minimum population to evaluate at all — rendering this as "clear" would be a false exoneration). A fourth state, **hygiene**, overrides the other three when a finding is actually a data-setup issue (a deactivated or obsolete item, a new item still ramping) rather than a security verdict about a person — it is deliberately routed away from reading as either a flag or a clean pass.\n\n**What it represents:** Access is gated to the same tier `security_findings`\' own RLS enforces (admin/owner/area_supervisor always; manager/gm only when `org_config.gm_identity_reveal_enabled` is on) — an unauthorized role gets an empty read indistinguishable from "no findings," so this panel checks permission explicitly rather than trusting an empty result. Names are masked by default (`RevealName`) and only resolved on an explicit reveal action, logged via `logAppAccess`. A per-subject drill-down (click to expand) shows three further layers: cross-store prevalence (is this specific to one store, or an estate-wide pattern?), rule-mix composition vs. the estate, and — for cash subjects — a real event timeline.\n\n**How to read and use it:** Filter by minimum signal count to cut noise before reading individual subjects — a subject flagged on only 1 of many rules is usually not worth individual review; raise the filter to surface genuine multi-signal convergence first. Always check the cross-store prevalence step before treating a flag as subject-specific: a high local-only share is a real lead, a low one often means an estate-wide broken mapping or threshold issue, not a problem unique to that person or store. The 🖨 print/export report is explicitly labeled CONFIDENTIAL — Loss Prevention; treat it, and this panel generally, as sensitive personnel-adjacent material, not a routine operational report.',
  },

  visit_readiness_guide: {
    title: 'Visit Readiness — Panel Guide',
    category: 'Panel Guide',
    summary: 'Per-store predicted PACE graded-visit readiness — a transparent weighted composite scored against each store\'s own targets, with top risk drivers and the store\'s last real visit result.',
    detail: '**What it offers:** A per-store readiness score predicting how a store would likely score on its next CFV/RGRV graded visit, built from four weighted sub-scores — **Speed 35%** (CFV DT OEPE, DT Line Time, R2P, RGRV Service), **Accuracy 30%** (CFV order accuracy, re-ring/problem-order behavior), **Quality 20%** (RGRV Quality — holding discipline, remakes, product standards; CFV sandwich + fries), **Leadership 15%** (RGRV Shift Leadership — positioning, travel paths, pre-shift data, peak coverage). Each metric scores against that store\'s OWN target (`DEFAULT_TARGETS`) or a standard benchmark where no per-store target exists, not a flat district bar. Weights renormalize over whatever sub-scores actually have data for a store, so a store missing one input isn\'t penalized for the gap itself.\n\n**How the data is obtained:** Pulled from the same auto/emailed/manual sources every other panel reads (QSRSoft Daily Glimpse, Operations Report, Labor, DAR/Controls, FOB, SMG FullScale, LifeLenz schedules) — every input is traced in the engine\'s own `SOURCE_META` registry (system, report, table, and whether that feed is auto/emailed/manual) and surfaced verbatim in the report so any number can be checked at its source. Food-safety status (see below) comes from the real EcoSure result when one is CURRENT for that store, falling back to a waste/variance proxy only for the gap between visits.\n\n**What it represents:** Each store card shows the overall readiness %, a band (e.g. Ready/Watch/At Risk), its **top risk drivers** (the specific sub-metrics furthest below target, worst first — this is what actually explains a low score, not just the number itself), an EcoSure/food-safety badge ("EcoSure: Pass/Watch/CRITICAL" when a real current EcoSure result exists, proxy-based otherwise — labeled so it\'s never confused with a real inspection result), and the store\'s **last actual graded visit** (type, real score, pass/fail, date, and any critical fails) for comparison against the prediction.\n\n**How to read and use it:** Use the top risk drivers to know exactly what to coach before a visit, not just that a store is "at risk." The composite is intentionally diagnostic, not punitive — it\'s scored against the store\'s own targets so a small, low-volume store isn\'t compared unfairly to a flagship. Food-safety status is deliberately kept OUT of the readiness composite (so one critical doesn\'t silently distort the Speed/Accuracy/Quality/Leadership picture) — read it as its own line, not folded into the score. Cleanliness remains an acknowledged data gap — there\'s no live metric in the composite for it yet.',
  },

  equipment_results_guide: {
    title: 'Equipment Results — Panel Guide',
    category: 'Panel Guide',
    summary: 'Survey-link management plus a cross-store rollup of the crew equipment walkthrough — which stores have logged their equipment, how much of it has been checked against the real PQRG operating settings, and when it was last touched.',
    detail: '**What it offers:** Two things in one authenticated panel. (1) **Link management** — create, copy, list, and revoke the public equipment-survey link(s) crew use to walk a store and log its equipment, with a one-click "Copy Survey Link" for the common case of one shared link for everyone. (2) **Cross-store results rollup** — every store\'s item count, how many of those items have been checked against their real operating settings ("reviewed"), and who last touched that store\'s survey and when.\n\n**How the data is obtained:** The survey link opens a separate, no-login public form (name + store picker, then add/edit equipment) that anyone on-site — GM, AS, crew trainer — can fill out and revisit; it writes straight to Supabase (`equipment_survey_entries`), not local-only. Each entry can carry a placement zone (Front Counter, Drive Thru, McCafé Cell, BDAP Cell, Dessert Cell, Production Area, Prep Area, Back of House), serial number, and certification date where that equipment type calls for them. Picking a catalog model surfaces that model\'s real operating settings from the **Pocket Quality Reference Guide (PQRG)** — McDonald\'s own crew reference manual — covering grills, fryers, combi ovens, toasters, steamers, UHC, staging cabinets, and espresso machines so far; the person on-site can check the real equipment against it and leave a note if something\'s off.\n\n**What it represents:** This is a living record, not a one-time survey — equipment gets re-walked and updated over time, and a store with zero items simply hasn\'t been walked yet (not a data error). The rollup\'s `itemCount`/`reviewedCount` reflect current state (a removed item drops out), while "last activity" reflects the most recent touch of any kind, including a removal.\n\n**How to read and use it:** Use the rollup to see which stores still need a walkthrough, and the reviewed-vs-total ratio to see how much of each store\'s equipment has actually been checked against its real PQRG settings (as opposed to just logged). The panel\'s location selector supports multi-select, so an owner or supervisor can check a patch or any custom set of stores at once instead of one store at a time. This is a gating reference for ordering the RIGHT consumable/chemical for a store\'s actual equipment, not a general asset registry — a bake oven, egg cooker, and a few other equipment categories aren\'t in the catalog yet and are a known, explicitly scoped gap, not an oversight.',
  },

  // Owner request 2026-11-09 -- "let's denote our findings... on the bounds of data collection
  // available. Seems we have discovered most of them. Good not to lose. Also good for others to
  // be able to find easily." Full index lives in memory/data-collection-bounds-2026-11-09.md
  // (the individual memory/finding-*.md files keep the full measurement detail per entry) --
  // this article is that index surfaced where someone working in the app would actually find it,
  // not just in a memory file nobody opens day to day.
  data_collection_bounds: {
    title: 'Data Collection Bounds — what\'s genuinely unavailable, and why',
    category: 'App Guide',
    summary: 'Every measured, genuine upstream data floor across every source this app pulls from — vs. the far more common case (a table\'s earliest row is just a backfill artifact, not a real limit).',
    detail: '**The default assumption in this app: a table\'s earliest row is almost always a backfill artifact (when the pull was first run), not a real data floor — "data depth is never the limiter," per this project\'s own standing rule. Treat anything NOT listed below as backfillable, not as a limitation to work around or report as a finding.**\n\n' +
      '**Genuine upstream floors (data never existed before this point):**\n' +
      '- **LifeLenz for Oklahoma begins Oct 2025** (`lifelenz_schedule`, OK stores only) — the system transition itself. The one real "we can\'t" that remains across the whole LifeLenz/QSRSoft estate.\n' +
      '- **Emailed-stream hard floor at 2026-07-01** (`daily_glimpse_daily` / `sales_ledger_daily` / `cash_sheet_daily`) — the source emails for earlier periods were never sent; a configuration-start date, not a vendor retention limit.\n' +
      '- **QSRSoft security events (`qsr_security_events`): ~92-day retention floor** — binary-searched to the exact boundary, 2026-08-08 fails / 2026-08-09 succeeds.\n' +
      '- **QSRSoft DAR/OPS reports: the real floor sits between 2018-02 and 2019-09**, NOT the claimed "7-year rolling retention" — that 7-year figure is a conservative backfill target now, not a measured limit. Don\'t cite it as confirmed.\n' +
      '- **Store 43701 (Ponce de Leon-Hwy 81/I-10) opened 2026-03-13** — zero history before that for `qsr_fob`/`labor_rows` is real (the store didn\'t exist), not a pull gap.\n\n' +
      '**Easy to mistake for a retention limit, but isn\'t:** EBOS (`qsr_ebos_daily`) has a per-store `ebos_activation_date` (e.g. 2019-08-08 for store 3708) — rows before a store\'s own activation date are missing because that store\'s EBOS module wasn\'t on yet, not a vendor-side cutoff.\n\n' +
      '**Backfill artifacts that look like floors but aren\'t:** `qsr_cash_sheet` starting 2024-04-01 and `qsr_daily_activity_rollup` starting 2025-01-01 both mark when the pull first ran, not when the real data begins — backfillable. The Jan–Mar 2026 gap in `monthly_targets` was an internal entry gap (reconstructed via the forecast engine), not a vendor limit.\n\n' +
      '**Still open, not yet proven either way:** no confirmed automatable source exists yet for Inventory Summary & Usage (`qsr_inventory_summary`) — the original Food Cost EOM panel still takes this one as a manual upload; two candidate approaches were explored and neither shipped.\n\n' +
      '**Full detail and the individual measurements behind each entry:** `memory/data-collection-bounds-2026-11-09.md` (the index) and the `memory/finding-*.md` files it cross-references.',
  },

  data_manager_guide: {
    title: 'Data Manager — Panel Guide',
    category: 'Panel Guide',
    summary: 'The daily data-loading hub — drag-drop manual uploads, on-demand Sync buttons for the auto-pulled streams, and a per-source coverage table showing exactly what date range each store has.',
    detail: '**What it offers:** Two complementary ways to get data into Meridian. (1) **Manual upload** — drag Excel exports (Operations Report, Labor Analysis, Register Audit, FOB/Food Cost, OpsTargets, Weather, 3 Peaks, etc.) onto the panel or use the Load button; the app auto-detects file type from the filename and sheet names. (2) **On-demand Sync** — a ↻ Sync button next to each auto-pulled stream (QSRSoft Daily Activity, eBOS Purchases, FOB/P&L Cost, LifeLenz Schedule, Security Events) that dispatches that stream\'s GitHub Actions pull immediately instead of waiting for its daily schedule; data refreshes in ~10 minutes after a successful trigger.\n\n**How the data is obtained:** Every data source on this panel falls into one of two rows: a green **AUTO** badge (GitHub Actions pulls this daily on its own, cloud-first — `lifelenz_schedule`, `qsr_ebos_daily`, `qsr_fob`, `qsr_daily_activity`, and more) or a plain manual-upload row with no such badge (device-local until uploaded, and only as fresh as the last upload). Each auto row shows a staleness dot and "↻ synced Xago" so you can see at a glance whether that stream is current without opening Signals or At A Glance.\n\n**What it represents:** A per-source coverage table — exact date range loaded, row counts, and (for auto streams) last-sync time — so you can tell at a glance whether a given store/date is covered by the cloud or still needs a manual upload. **Auto/emailed-first, freshest-wins** is the standing rule behind every number this feeds elsewhere in the app: manual uploads fill a gap the cloud streams don\'t cover yet, but never override auto/emailed data once it exists for that date. A date range that looks short or missing is usually a backfill gap, not a real limit — see the **Data Collection Bounds** article for the short list of genuine exceptions.\n\n**How to read and use it:** Check this panel first in your daily routine — it\'s the "Load fresh data" step of the DAILY workflow. If a tile elsewhere in the app looks stale, this is where to find out why (which stream is behind) and fix it (Sync button for an auto stream, a fresh upload for a manual one) rather than guessing. The "Clear ALL stored data" action wipes everything local and forces a re-upload/re-sync on next launch — a last resort for a corrupted local cache, not a routine action.',
  },

  performance_reviews_guide: {
    title: 'Performance Reviews',
    category: 'Panel Guide',
    summary: 'Structured quarterly manager reviews across 4 fully configurable weighted categories (not a fixed set), with auto-fill from already-uploaded data where available.',
    detail: '**What it offers:** Structured quarterly reviews for GM/AM/DM/SM/AS/OM roles. The real default category structure is **4 weighted categories** — Running Great Restaurants, Sales Drivers, Profitability, People Staffing & Retention — plus a separate Administration section, each with an editable weight (must sum to 100%). Categories themselves can be renamed, added, or removed per org — this is NOT a fixed 6-dimension scorecard.\n\n**How the data is obtained:** "Auto-fill from Uploaded Data" (KPI Results tab) pulls OEPE, R2P, KVS, Sales vs Target, Labor %, FOB %, Voice OSAT, Delivery Wait, Digital/Delivery GC-R-D, Shift Certified Managers, Headcount, 0-90 Crew Turnover, and Total Profit from uploaded/cloud-synced reports — Voice OSAT specifically comes from the SMG FullScale upload\'s Overall Satisfaction 5-star %, auto-filled per month. Everything else is entered manually each quarter.\n\n**What it represents:** A weighted composite score per manager, built from both auto-sourced and manually-entered inputs — the weighting is the organization\'s own stated priorities, not a fixed formula.\n\n**How to read and use it:** Run the auto-fill first each quarter, fill in what wasn\'t auto-sourced, then generate the printable PDF review form for the actual review conversation.',
  },

  graded_visits_guide: {
    title: 'Graded Visits — Panel Guide',
    category: 'Panel Guide',
    summary: 'The real PACE/CFV/RGR/EcoSure graded-visit history — the actual results Visit Readiness is trying to predict, with per-question detail on what was cited.',
    detail: '**What it offers:** Browse/upload actual graded visit records — CFV, RGR, and EcoSure — with per-store score, pass/fail (CFV\'s pass threshold is 80%), a per-category module breakdown, and a "most likely visit" pattern bar (daypart/channel/day/weekpart) summarizing when this store actually gets visited. A per-question detail view (PeakDetailBlock) shows every question asked on the visit, defaulting to only the ones with a comment (a real RGR visit can run 193 questions with 15 commented — showing all 193 by default would bury the signal), with a toggle to see every question.\n\n**How the data is obtained:** Excel/PDF uploads, parsed by `parseGradedVisit`/`parseEcoSureVisit` into the `graded_visits` table. CFV/RGR rows store their module breakdown as `{category: {pct}}`; EcoSure rows use a different shape entirely (`pointsReceived`/`citedItems`/`sections`/`comments`) on the same polymorphic column — code reading `.modules` filters to entries that actually look like `{pct}` so an EcoSure row\'s differently-shaped entries don\'t crash a CFV/RGR-only display. Per-question detail is enriched separately via `scripts/import-peak-visit-detail.mjs`.\n\n**What it represents:** This is the REAL, already-happened result — not a prediction. **Visit Readiness** (see that article) is the forward-looking predicted score built from daily operational metrics; this panel is the ground truth those predictions get checked against, and Visit Readiness\'s own "last actual visit" field is sourced directly from this data.\n\n**How to read and use it:** Use this alongside Visit Readiness: a low predicted readiness followed by a real low score here validates the model; a mismatch is worth investigating on its own. Use the per-question detail to see exactly what was cited on a visit, not just which module\'s percentage dropped — that\'s what turns a score into a coaching conversation. The visit-pattern bar tells you when this store is actually graded most often, useful for timing PACE Action Plan prep.',
  },

  customer_complaints_guide: {
    title: 'Customer Complaints — Panel Guide',
    category: 'Panel Guide',
    summary: 'Browse and search the raw Propel Customer Care case feed — the real complaint text behind the Complaint Contacts/100K review metric, not a second copy of that rate.',
    detail: '**What it offers:** Store, incident/received date, status (Open/Closed), issue/sub-issue code, and the real customer-submitted comment text for every captured case — filterable by store scope, status, date range, and free-text search across the issue code and comment.\n\n**How the data is obtained:** `scripts/browser-complaints-bulk-capture.js` (run against a signed-in propel.mcd.com tab) plus `scripts/import-complaints-history.mjs` for backfill — a manual, on-demand capture, unlike the daily auto-pulled streams (DAR/LifeLenz/FOB). A store showing "No complaint cases captured yet" means the capture hasn\'t been run recently for it, not that the store genuinely had zero complaints.\n\n**What it represents:** This is the raw case feed, deliberately NOT a rate. It reads the exact same `ds.complaintCases` array the Complaint Contacts/100K metric in Performance Reviews filters — that normalization (cases ÷ guest count × 100,000) is computed in `review-engine.js`, never recomputed here, so the panel and the KPI can never silently disagree about what counts as a case.\n\n**How to read and use it:** Reach for this when a Complaint Contacts/100K figure in a review looks high and you need to know WHY — click a row to expand its full comment text rather than just the issue code. Use the status filter to separate still-open cases from closed ones.',
  },

  crew_schedule_guide: {
    title: 'Crew Schedule — Panel Guide',
    category: 'Panel Guide',
    summary: 'Look up a specific employee\'s upcoming shifts, or their recent time punches, in one merged two-tab page — names render directly, no reveal step.',
    detail: '**What it offers:** Two tabs sharing one location-scope and search box. **Schedule** — search for one or more employees, see their upcoming shifts (date, store, start/end time, role, absent flag), default window today through +13 days. **Punches** — the same search/scope pattern over actual clocked time punches, default window the trailing 7 days (a punch can\'t exist for a date that hasn\'t happened yet).\n\n**How the data is obtained:** Both tabs are cloud-auto, not manual upload — Schedule reads LifeLenz\'s shift-assignment sync (`lifelenz_shift_assignments`), Punches reads QSRSoft\'s punch sync (`qsr_punch_times`). The two tabs\' employee identity spaces don\'t cross: Schedule keys by LifeLenz\'s `assignedEmploymentId`, Punches keys by QSRSoft\'s `geid`, with no crosswalk table joining them — selecting someone in one tab does not carry the selection to the other, so each tab keeps its own independent selection and date range.\n\n**What it represents:** Employee names render directly on this panel (owner decision, 2026-08-25: "there is no reason to hide names for scheduling and punch times — everyone can see this data as-is") — this is ordinary scheduling data, not a security investigation, so it uses the same plain nav permission (`analytics.store`) plus the table\'s own store-scoping every other operational panel uses, not Security\'s gated name-reveal mechanism.\n\n**How to read and use it:** This is what answers the GM/Supervisor routine\'s "Time Punch Review, OT monitoring" line — search a name or employee number on the Schedule tab to see what\'s coming up, or switch to Punches for their actual clocked hours over the trailing week to check against it.',
  },

  labor_analysis_guide: {
    title: 'Labor Analysis — Panel Guide',
    category: 'Panel Guide',
    summary: 'The weekly Fixed/Floor/VLH labor plan — scheduled hours & cost vs. forecast and target, recommended Fixed/Floor hours, and a printable per-store FLH planning worksheet.',
    detail: '**What it offers:** A weekly (not daily) per-store report, dollar-weighted to OK/FL/Grand subtotals and scoped by store/patch/state: Sales Forecast, real Labor %, Target %, GC Forecast, TPPH, blended $/hr Rate, Hours Forecast, Hours Scheduled, Scheduled/Target Labor $, Hours/± vs. Forecast and Target, $ ± Target, and three recommended fixed-hours columns (Rec Fix @10%, Rec Fix @15%, Combined @25%). A **Config** tab holds the per-store "gathered" fixed-hours inputs (maintenance hours/people/days-off, prep hours, lobby hours, 24-hour flag, hours of operation per day) that feed those recommendations.\n\n**How the data is obtained:** Auto-first — the week is derived from the daily LifeLenz schedule auto-sync (`lifelenz_schedule`); a manually uploaded MBI Labor Analysis workbook (Data Manager) only gap-fills a store/week the auto source doesn\'t have yet, and never overrides it (the standard auto-first, freshest-wins rule). A header chip reads "⟳ Auto" (plus a count of any gap-filled stores) or "Manual" so the source is never ambiguous.\n\n**What it represents:** Hours Forecast = Projected VLH + Fixed + Floor hours (hourly stores only). Target % resolves through the shared labor-basis resolver (`tCrewLabor`), which can legitimately diverge from the original MBI workbook\'s own hand-typed Target column — that\'s expected, not a data error. A "Partial week" ⚠ tooltip appears on Labor %/Rate/Scheduled Labor $ whenever less than 95% of the week\'s sales have a reported labor % so far — those figures are real, just not the full week\'s number yet.\n\n**How to read and use it:** This is the GM/Supervisor routine\'s "Review Labor Analysis Report (projected labor %, peak hours, fixed labor guide)" line — a weekly PLANNING tool, distinct from Scheduling Hub\'s Labor Analytics tab (the day-to-day TPPH/labor%/OT/staffing-gap read). Use the 🗒 FLH Worksheet print action for a per-store Wed→Tue Fixed/Floor-hours planning sheet, with the real McDonald\'s station codes and guidance notes (Floor, Admin/Cash, Closing, Food Safety, Lobby, Maintenance, Pre-Shift, Training, Truck Delivery, Walk Thrus, and more) pre-filled, ready for a manager to write planned hours into.',
  },

  task_queue_guide: {
    title: 'Task Queue — Panel Guide',
    category: 'Panel Guide',
    summary: 'One merged list for tiered internal work tickets (T1/T2/T3) and votable roadmap Feature Requests, plus the pre-seeded historical roadmap.',
    detail: '**What it offers:** Every entry carries a type. **🔧 Task** entries are tiered — T1 (config/copy/minor UI, auto-safe), T2 (new feature or logic change, needs a PR + review), T3 (infra/schema/auth, human-only). **💡 Feature Request** entries are votable, publicly submitted capability asks, carrying dev notes and a completed-version badge once shipped. A ~30-item seed list of historical/planned roadmap items (client-side only, never a database row) fills in Feature Request history until a matching live row supersedes it.\n\n**How the data is obtained:** Two separate Supabase tables today — `tasks` and `feature_requests` — normalized into one shared shape in this panel; each keeps its own native status vocabulary under the hood (backlog/ready/in_progress/done/blocked for tasks; idea/planned/in-progress/completed/declined for feature requests) shown through one shared badge language so the two read as one list. SAGE\'s 🐞 Log action and the in-panel Feature-Request submission form both write here.\n\n**What it represents:** This is the GM routine\'s "SimpleThink fix-it-list" / tech-needs-submission equivalent — anything broken, needed, or wished-for gets filed as one ticket type or the other instead of living in a side channel (a Slack message, a verbal ask). Priority is unified to a 1=High / 2=Medium / 3=Low scale across both types regardless of which table a given row actually lives in.\n\n**How to read and use it:** File a data-pull failure or a wrong SAGE answer as a 🔧 Task; file a capability you wish existed as a 💡 Feature Request so others can vote it up. Filter by type/status/category to see what\'s actually outstanding rather than scrolling the full merged history, including the seeded past roadmap.',
  },

  // Task #75 (ongoing KB-coverage backlog) — 3 more nav-level panels with no guide yet.
  eom_dashboard_guide: {
    title: 'Inventory Control (EOM Dashboard) — Panel Guide',
    category: 'Panel Guide',
    summary: 'The all-stores End-Of-Month close hub: per-store count progress, a dollar-weighted FOB $/% snapshot, incomplete-count diagnosis, and comms tracking of who was told what — plus five folded-in report tabs (Supervisor Rollup, Count Cycle, Missing Items, Team Snapshot, Recount Impact).',
    detail: '**What it offers:** The district-wide hub for the month-end inventory close. The core scoreboard shows, per store: how far along its count is, a dollar-weighted FOB $/% snapshot for the period, a diagnosis of what\'s still blocking completion, and whether/when that store\'s manager has actually been told. Several deeper investigations have been folded in as tabs on this same hub rather than living as separate panels — **Supervisor Rollup** (district-level EOM summary), **Count Cycle** (weekly count-cadence compliance), **Missing Items Report** (district-wide uncounted-item list), **Team Snapshot** (a simplified "send to Teams" EOM status), and **Recount Impact** (what a recount actually changed).\n\n**How the data is obtained:** Count progress is derived from the auto-pulled QSRSoft On-Hand stream (`qsr_onhand`) — a line item counts as "counted" once its `last_counted`/`last_submitted` date falls inside the count window, the **last 3 calendar days of the month** (owner-authoritative domain: Food/Condiment/Paper counted on either of the first two of those days, Non-Product on the last day). FOB is the dollar-weighted `qsr_fob` MTD snapshot, same convention every other FOB-reading panel uses. Diagnosis state and manager-communication tracking persist to `eom_count_status`/`eom_diag_config`, so a diagnosis or a "told the GM" mark survives a reload instead of resetting every session.\n\n**What it represents:** FOB (what\'s actually controllable here) is Food + Condiment classes only — roughly 24-28% of revenue, not total food cost. "Believes done" is a real, named completion threshold (not 100%) — a store can read as functionally complete well before every last line item is literally counted, because a handful of genuinely immaterial items lagging doesn\'t change the store\'s real FOB picture.\n\n**How to read and use it:** This is the panel to open heading into month-end close — it tells you which stores still need a push, why (via the diagnosis), and whether that store already knows. Use the Supervisor Rollup tab for the district-level view a DO/supervisor would want instead of store-by-store scrolling, and Recount Impact when a store\'s numbers moved after a recount and you need to know exactly what changed and why.',
  },

  controls_food_cost_link_guide: {
    title: 'Controls ↔ Food Cost Linkage — Panel Guide',
    category: 'Panel Guide',
    summary: 'FOB\'s monthly food-cost ratios shown side by side with Controls\' daily meal/deposit/discount facts, for the same real calendar month — a comparison that had never been surfaced in one place before this report.',
    detail: '**What it offers:** One row per store per calendar month, with FOB\'s reported ratios (FOB %, Comp Waste %, Raw Waste %, Condiment %, Emp Meal % as FOB reports it, Stat Variance %, Unexplained Diff %) alongside Controls\' own daily-summed facts for that same month (Employee Meal $ and count, Manager Meal $ and count, Deposit $, Discount % and $). These are two real data families that have each existed for a while but were never shown next to each other until this report.\n\n**How the data is obtained:** FOB is reported once a month; Controls records daily. Both are resolved to the **same whole calendar months** covering your selected date range (not an arbitrary partial-month slice), so the two families line up on the real period FOB actually reports for. Every value goes through `signal-registry.js`\'s shared `metricValueForRange()` — there is no second, separate resolution path that could silently disagree with what Signals/Scanner would show for the same metric.\n\n**What it represents:** A blank cell means that metric genuinely has no data for that store-month yet (a real "not reported" fact), not a crash or a dropped row. The point of the report is the DISCONNECT between the two families, not either column alone — e.g. a store with rising Employee Meal $/count in Controls but no matching move in FOB\'s own reported Emp Meal % (or vice versa) is exactly the kind of mismatch worth a closer look, since the two are supposed to be describing the same underlying activity from two different systems.\n\n**How to read and use it:** Run it over a multi-month range for one store or a scope of stores, then scan for a metric pair that should move together but didn\'t. This report doesn\'t diagnose WHY a mismatch happened — it surfaces that one exists, which is the starting point for pulling the underlying detail (Food Cost / Controls panels) to find out.',
  },

  pricing_engine_guide: {
    title: 'Pricing Engine — Panel Guide',
    category: 'Panel Guide',
    summary: 'Per-item margin (menu price vs. food + paper cost) from the auto-pulled product-mix stream, across 5 tabs — Rankings, Item Lookup, Cross-Store, Price Impact (a what-if simulator), and Menu Prices.',
    detail: '**What it offers:** Five tabs over the same underlying per-item margin data. **📊 Rankings** — Lowest Margin % (a rate concern — not volume-weighted, so a low-volume item can rank here), $ Contribution (volume-weighted margin $ × volume — what actually moves the P&L), Waste/Comp/Promo Dollar Drains, and Estimated Lost Sales from product outages. **🔎 Item Lookup** — search any item, see its margin build (menu price, food cost, paper cost), and expand its real ingredient-level recipe/BOM as an independent cross-check against the margin-table cost. **🏬 Cross-Store** — compare one item\'s price/cost/margin across every store at once, with pinning. **💥 Price Impact** — a what-if simulator: pick an item, type a $ price delta, see the modeled profit impact. **🏷️ Menu Prices** — the real current menu price per item.\n\n**How the data is obtained:** Everything comes from `qsr_product_mix`, already auto-pulled for the full catalog across all 27 stores — no new pull, no manual upload. Within a single day, menu price is the real MAX(price) that day (never an average — a promo/discount tier always prices below the real menu price, so taking the max recovers the true menu price even on a day with promo activity). Across a multi-day window, the engine uses the MOST RECENT day\'s max price/cost as the item\'s "current" figure, not an average across the window — averaging would blend pre-/post-reprice prices into a number nobody actually charges. Volume is summed across the WHOLE window and ALL price tiers (a promo-tier sale is still a real unit sold; only the price used for margin math excludes non-max rows).\n\n**What it represents:** **Price Impact\'s simulation holds volume constant** — it answers "if this item\'s price moved by $X and people kept buying the same amount, what would that do to profit," not a demand-elasticity forecast. A big simulated $ impact on a high-volume item is a real number worth knowing, but it is not a prediction that customers would actually keep buying at the same rate after a price change. Blended margin %\'s shown across stores are dollar-weighted (Σmargin$/Σprice$), never a plain average of each store\'s own percentage.\n\n**How to read and use it:** Start on Rankings to see which items are a rate problem (Lowest Margin %) vs. a real P&L problem (the volume-weighted $ Contribution list — a thin-margin, high-volume item can matter more than a healthy-margin, low-volume one). Use Item Lookup\'s recipe/BOM cross-check when a margin number looks wrong, to see whether the cost side or the price side is the issue. Use Price Impact to size up a proposed price change before making it, remembering the constant-volume caveat above.',
  },

  // Task #95 (owner req, 2026-11-05) — Leaderboards got a Custom… date range on its Rankings
  // and Top/Bottom modes this same pass; this article is also the "note of sorts... an
  // information icon" the owner asked for to point a multi-period Custom range at Performance
  // Trends instead, since Leaderboards deliberately still collapses any range (preset or
  // Custom) into one ranked total, never a period-by-period breakdown.
  // Task #90 (design doc memory/plan-yoy-trend-dashboard-2026-11-05.md) — Performance Trends had
  // no Panel Guide / InfoIcon at all until this pass; added alongside the new YoY Trends panel
  // specifically so the two can cross-link each other (and Trend Explorer), per the doc's
  // "findability" risk the owner flagged: three genuinely different trend questions now exist
  // (sequential period-over-period / single-store exploratory / district-wide multi-year YoY),
  // so each one's info icon names the other two rather than leaving a user to guess which panel
  // answers their actual question.
  trend_report_guide: {
    title: 'Performance Trends — Panel Guide',
    category: 'Panel Guide',
    summary: 'Current MTD / last complete month / two months back, side by side, for any primary metric across All Locations plus OK/FL breakouts — sequential period-over-period, not year-over-year.',
    detail: '**What it offers:** Three stacked periods — Current MTD (completed business days only), Last Complete Month, Two Months Back — for one metric at a time, with a combined All-Locations figure plus a per-store ranked table (Top/Bottom 25%/50% filters). A separate **📧 Email Summary** mode reproduces the owner\'s own reference table (Combined/OK/FL × Sales/GC/Labor/FOB, 3 trailing complete months + current MTD), with Sales/GC as a genuine calendar-year-over-year comp.\n\n**What it does NOT do:** This panel answers "how did each of the last few periods move," never "how does this year compare to last year across every month." For that, see **📈 YoY Trends** (Analytics ↳ ⚗ Test Kitchen) — a full monthly series overlaying the current year against 2-4 prior years, calendar-month matched, for any store/patch/district scope. For an open-ended single-store question over any date range ("does Fridays run differently"), see **Trend Explorer** instead.',
  },

  leaderboards_guide: {
    title: 'Leaderboards — Panel Guide',
    category: 'Panel Guide',
    summary: 'Three leaderboard questions in one panel — current-period rank, all-time single-best records, top/bottom distribution — each with its own date/window control, now including a custom range.',
    detail: '**What it offers:** Three modes, each answering a genuinely different question, so each keeps its own location scope and its own window control rather than sharing one. **🏆 Rankings** — current-period cross-store (or Patch/Operator/State rollup) rank on any metric, over Today/Yesterday/Last Week/Last 2 Weeks/MTD/Last 4 Weeks/Last 6 Weeks or now a **Custom…** date range. **🏆 Record Days** — the all-time single best day/week/month per store, an all-time scan with no window control at all (there is no "period" to pick for an all-time record). **🏆 Top/Bottom** — the distribution of over- vs. under-performers on one metric across a scope you pick, over Last Week/Last 4 Weeks/Last 6 Weeks/MTD or now a **Custom…** range too (district perm, stricter than the other two modes).\n\n**What a Custom range does, and does not, do:** Picking a Custom range on Rankings or Top/Bottom still collapses the ENTIRE selected range into one ranked total or one ranked rate for that window — a 90-day Custom range shows one number per store, the same way a 4-Week preset does, never a week-by-week or month-by-month breakdown within it. That is by design: a leaderboard is a single ranked list, not a trend.\n\n**How to read and use it:** If you picked a Custom range that spans more than one natural period (several weeks or months) and want to see those periods broken out individually alongside the rolled-up total — not just one collapsed figure for the whole span — that is **📊 Performance Trends** (Analytics ↳ ⚗ Test Kitchen), not this panel: it shows Current MTD / Last complete month / Two months back side by side, for the same metrics, with the full-period total alongside each period\'s own figure. Reach for Leaderboards to answer "who\'s ahead right now" or "what\'s the all-time best"; reach for Performance Trends when the question is "how did each period move."',
  },

  // Task #75 batch (2026-11-05) — the 3 highest-traffic panels still with no Panel Guide entry.
  morning_brief_guide: {
    title: 'Daily Brief — Morning Intelligence Brief (Panel Guide)',
    category: 'Panel Guide',
    summary: 'The district\'s daily correlation/anomaly scan — 12 rules flagging controls-integrity and floor-management patterns per store per day, sorted worst-first. The single highest-traffic panel in the app.',
    detail: '# Daily Brief\n\n' +
      '**On screen as:** "☀️ Daily Brief" in the sidebar (panel id `morning-brief`); the panel\'s own header still reads "Morning Intelligence Brief" and its subtitle reads "Correlation engine · 12 rules · N stores · Sorted by priority" (fixed 2026-11-05 — the live `MORNING_RULES` array in `src/features/morning-brief.js` defines 12 rule objects, 6 tagged `controls` + 6 tagged `service`; the subtitle previously said "9 rules," stale).\n\n' +
      '## Overview\nFor a chosen date (defaulting to the most recent date with any data, clamped to the last closed 4am-to-4am business day), every store is run through 12 independent correlation rules — this is not a KPI summary, it is a rules engine. Each rule either returns nothing or returns a RED/AMBER finding with a headline, a plain-English explanation of why the pattern matters, and a specific investigative action (e.g. "pull register audit detail," "observe kitchen KVS compliance on next visit"). A store\'s overall severity is RED if any rule fired RED, AMBER if any fired AMBER, else GREEN (or NODATA if nothing loaded for that store/date) — stores are sorted worst-first by a weighted priority score (RED findings count 10x, AMBER 3x).\n\n' +
      '**The 12 rules, by category:**\n- **Controls (6):** Drawer Opens (cash integrity risk, ≥10 = RED), Large Refund/Overring (≥$100 = RED), T-Red After Total Spike, Sales/GC Divergence ("theft signal" — sales down but guest count holding, implying average check collapsed), Cash Over/Short variance, Food Cost / Base Food% variance.\n- **Service (6):** Manager Not Actively Managing Floor (adequate staffing + high OEPE), Drive-Through Pull-Off Risk (adequate staffing + high OEPE + near-zero DT Parked), Timing Data Integrity ("serve-off" — KVS implausibly fast relative to OEPE), Single-Side Kitchen Operation (low KVS usage despite adequate staffing), Evening/Late-Night OEPE gap vs. morning, Guest Satisfaction (SMG OSAT) below standard.\n\n' +
      '## How the data gets here\n**Fixed 2026-11-05 (owner-caught, real data-accuracy bug) — this panel used to check manual Labor/Controls uploads BEFORE the auto/emailed streams for its headline fields, the reverse of this app\'s standing auto-first rule.** `assembleBriefStoreData()` now routes sales, GC, TPPH, Labor%, Act-vs-Need, POS-Over $, refund $, and Cash O/S $ through `metricDaily()` (`src/engine/metric-source.js`, the shared auto-first resolver) FIRST — the same function `drawerOpens`/`tRedAPct`/`tRedBPct`/`oepe`/`kvst` already used — with the manual upload (`ds.laborRows`/`ds.ctrlRows`) and any source metric-source.js doesn\'t register for that key (Daily Glimpse/Cash Sheet\'s gc/sales fields, Labor\'s pre-combined refund figure) kept only as a last-resort fallback. The 8-week OEPE/KVS norms (`computeStoreNorms`) are unchanged — the manually uploaded 3 Peaks file is still checked first there, by design (store-specific precision the district-wide `metricAvg()` resolver doesn\'t have, not a manual-vs-auto priority bug).\n\nThe "Today\'s Hourly Pace" card at the top of the panel (`TodayPaceCard`) is unambiguously auto-sourced — it reads `qsr_daily_activity` directly with no manual path, and was never part of this bug.\n\nWhich date gets picked by default IS auto-aware: `getLatestBriefDate()` looks at manual Labor/Controls/3-Peaks dates AND the auto DAR rollup together, then clamps to the last closed business day — so a cloud-only device (no manual upload at all) still lands on a real, recent date rather than falling through to "today."\n\n## What it represents\nEach store card shows a severity badge, the assigned supervisor, up to 3 active flags inline (with a "+N more" overflow), and a quick metrics strip (sales vs. projection, OEPE vs. its own 8-week norm, drawer-open count) — each colored by the same thresholds the rules themselves use. Expanding a card shows every fired flag in full (headline + detail + the specific action to take) plus a full metrics grid (roughly a dozen fields, more if FOB/SMG data exists for that store) and a literal "Data: Labor · Controls · 3 Peaks · …" line naming exactly which sources backed that card — including an explicit nudge ("load 3 Peaks or email Glimpse for service data", "upload FOB for food cost") when something is missing. A Data Source Coverage strip at the top of the whole panel shows the same ✓/○ status district-wide (Daily Activity, Labor, Controls, 3 Peaks, Food Cost, SMG OSAT), each with its row count.\n\n**This is a different engine from Priority Brief / Intelligence Brief.** Those read the shared `findings` array (trend-based, ongoing). Daily Brief runs its own separate `MORNING_RULES` correlation scan, built specifically around a single day\'s controls-integrity and floor-management patterns (drawer opens, serve-offs, pull-offs, etc.) — don\'t assume the two "brief" panels are reading the same underlying flags, because they aren\'t.\n\n## How to use it\n1. Open it first thing — use the 🔴/🟡/🟢/⚪ district-pulse tiles (which double as click-to-filter toggles) or the Supervisor filter pills to narrow to what needs attention right now.\n2. Click a store card to expand every fired flag — each one ends in a concrete "→ action" line; that is what to actually go do, not just a number to note.\n3. Use the date picker to re-run the exact same 12-rule scan against a prior date when investigating a specific incident after the fact.\n4. Check the Data Source Coverage strip and each card\'s own "Data: …" line before trusting a GREEN/NODATA read for a store — a quiet NODATA or a card missing 3 Peaks/Controls can look clean simply because nothing was there to flag, not because the store is actually fine.\n5. Use 📤 Export Brief for a standalone, shareable HTML copy of the day\'s brief.\n6. Watch the 📡 Signal Watch strip (when present) — any custom Signal Lab correlation promoted to this panel shows its live r/strength here alongside the rule-based flags.',
  },

  reports_hub_guide: {
    title: 'Reports Hub — Panel Guide',
    category: 'Panel Guide',
    summary: 'The categorized index of every report-shaped panel in the app, cross-listed by subject area, plus the My Reports tab for saved, pre-scoped subscriptions. A pure navigation layer — it computes nothing itself.',
    detail: '# Reports Hub\n\n' +
      '**On screen as:** "🗂 Reports Hub" in the sidebar (panel id `my-reports` — relabeled from "My Reports" in Phase 3, 2026-10-16; the id didn\'t change, only the label and what it opens). Reached via `routePanel===\'my-reports\'` in `src/app/App.js` (~line 4204), which renders `ReportsHub` (`src/views/reports-hub.js`) directly — `ReportsHub` carries its own `RoutePanelShell` internally, there is no separate wrapper in App.js. **This panel did not exist in Panel Index\'s own directory listing until this article\'s companion fix — a real, confirmed gap:** the ANALYTICS section of the `panel_index` article jumped straight from Task Queue to Forecast Brief with no Reports Hub line at all.\n\n' +
      '## Overview\nReports Hub is a categorized landing page over every "report-shaped" panel already in the app: find a report by subject area instead of having to remember which panel or sidebar section it lives under. It is explicitly a CROSS-LIST, not a relocation — every panel it links to keeps its own separate nav entry and section; this is a second, categorized entry point into the same panels, not a new home for them. The old standalone "My Reports" saved-subscription picker was folded in as this hub\'s own "⭐ My Reports" tab, unchanged in behavior.\n\nSeven category tabs (`REPORT_CATEGORIES`, `src/app/reports-catalog.js`): Daily & Operations, Sales & Forecasting, Guest Experience, Labor & Payroll, Financial & Promotions, Leadership & Above-Store, and Custom Reports — plus an "All (N)" tab and the "⭐ My Reports" tab. As of this writing the catalog lists 29 direct-launch panel tiles plus 5 subscription tiles (34 total) — that count will grow as new reports are cross-listed, so treat it as a snapshot, not a hard number.\n\n## How the data gets here\n**This panel has no data sourcing of its own to evaluate against the auto/emailed-first standard — it is a pure router/index**, not a computation. It builds two kinds of tiles: (1) **`panel` tiles** — direct-launch; clicking one just calls `onOpenPanel(id)` → `goRoute(id)`, routing straight into that panel\'s own existing route, since each of those panels already owns its own data sourcing, controls and LocationSelector. Label/icon/perm for these are pulled live from `panel-registry.js`\'s `PANEL_BY_ID` (the one source of truth), so they can\'t drift out of sync with the registry — only `category` and the one-line `desc` are catalog-only fields. (2) **`subscription` tiles** — Above-Store One-Pager, Events Calendar, Visit Readiness, SMG VOICE, Weekly Count Status (`REPORTS` in `src/views/report-subscriptions.js`) — clicking one calls `onLaunchSubscription`, which pre-scopes and routes into that report rather than a raw panel open.\n\nEvery actual metric inside any of these destination panels is sourced however that panel itself sources it — and that varies panel to panel (e.g. the Date-Range Report tile routes to a panel that is cleanly auto-first; see that article). Reports Hub itself answers none of those questions; it only answers "where do I click."\n\n## What it represents\nA subject-area directory, not a new report in its own right. The "My Reports" tab is the one piece of Reports Hub that holds real, user-owned data: a saved subscription is `{report, scope, period, customRange, panels}` — persisted to `localStorage` and mirrored to Supabase (`report_subscriptions`, fails soft to local-only if the cloud write fails) — letting you re-open a specific report/scope/period combination in one click instead of re-building it each time.\n\n## How to use it\n1. Browse by category tab (or "All") to find a report by subject rather than by panel name; click any tile.\n2. A `panel` tile jumps straight into that panel with its own normal controls — set the date range/scope there as you would from its regular sidebar entry.\n3. A `subscription` tile, or anything on the ⭐ My Reports tab, opens already pre-scoped (scope, period, and — for Above-Store One-Pager — the chosen panel subset all pre-applied).\n4. Use ⭐ My Reports to save a report+scope+period you run on a recurring cadence: pick the report, the Level/Grouping (same All→State→Patch→Store pill selector used everywhere else in the app), a period where one applies (Month-to-date / Last 7 days / Last month / Custom range), then "➕ Save to My Reports." Use "▶ Open now (without saving)" for a one-off.\n5. Auto-delivery (scheduled email of a saved report) is explicitly flagged in the panel\'s own footnote as "coming" — not live yet. Today every entry here opens in-app only, pre-scoped.',
  },

  date_range_report_guide: {
    title: 'Date-Range Report — Panel Guide',
    category: 'Panel Guide',
    summary: 'An ad-hoc, any-dates × any-stores comparison table against the live forecast — and a clean example of the app\'s auto/emailed-first sourcing rule actually being followed.',
    detail: '# Date-Range Report\n\n' +
      '**On screen as:** "📅 Date-Range Report" in the sidebar (panel id `report`; no permission gate — `perm:null` in `panel-registry.js`, unlike most analytics panels). Reached via `routePanel===\'report\'` in `src/app/App.js` (~line 4022), wrapped directly in `RoutePanelShell` there (title "📊 Date-Range Comprehensive Report"), around the `DateRangeReport` component in `src/views/analytics.js` (~line 6266).\n\n' +
      '## Overview\nPick a start date, an end date (defaults: the last 14 days through today), and one or more stores (default: All Stores), then click "▶ Generate Report." The result is one table, one row per store, sorted by actual sales descending: Days (with data) · Sales · vs LY% · vs Forecast% · MAPE% · Pass Rate% · Avg Check · OEPE · TPPH · Labor% · Ops Score · Ctrl Score. Export to CSV (`DateRangeReport_<start>_to_<end>_<scope>.csv`).\n\n## How the data gets here\n**This panel correctly follows the app\'s auto/emailed-first, freshest-wins rule — confirmed by reading the code, not assumed.** Sales/GC/OEPE/TPPH/Labor%/Avg-Check all come from `metricSeries(ds, loc, range, metric)` (`src/engine/metric-source.js`), the shared auto-first resolver — the component\'s own code comment explicitly notes this was previously broken (reading `ds.laborRows` — manual only — directly) and was fixed under the data-integrity sweep so a day covered only by the auto DAR / emailed streams is now included, not dropped.\n\n**vs LY% and vs Forecast% are both live-computed, not read from any stored or uploaded figure.** The panel re-runs `forecastDay()` — the same engine every other forecast-facing panel in the app uses — for every day in the picked range, for every included store, using TODAY\'s settings/calibration (not whatever was in effect when the days in the range actually happened). That gives both the forecast total (`vs Forecast%`) and the LY-adjusted total (`vs LY%`) fresh each time you run the report. MAPE% and Pass Rate% (pass = within the store\'s own tolerance setting, default 5%) come from that same live re-run.\n\n**Rollup math is deliberately not "average of averages":** TPPH is a ratio-of-sums derived from guest-count/TPPH per row, not a mean of daily ratios; Labor% is sales-weighted (Σlabor$ ÷ Σsales, excluding near-zero/missing-labor days) rather than a plain mean of daily percentages; Avg Check is Σsales ÷ Σguests. OEPE is the one exception and is a plain mean by explicit design — the code\'s own comment notes the underlying service source carries no guest-count or car-count field to weight by, so there is no real weighting basis available for it.\n\n**Two things worth knowing before reading the numbers:** (1) if a store\'s date-range series comes back empty for a given metric, that metric falls back to the store\'s current pre-computed summary figure (`p.oepe`/`p.tpph`/`p.laborPct`/`p.avgCheck`) rather than showing blank — so a thin or gappy range for one store can quietly show its CURRENT running figure instead of a real range figure. (2) **Ops Score and Ctrl Score are NOT scoped to the picked date range at all** — they are read straight off the store object\'s own current/standing score, the same number you\'d see today regardless of which historical range you picked. Every other column in the row is genuinely scoped to your chosen dates; these two are not.\n\n## What it represents\nA flexible, any-dates × any-stores side-by-side — useful when you want a comparison window that doesn\'t match any of the app\'s other fixed reports (a specific promo week, a specific incident window, a custom multi-store comparison), with the SAME forecast/MAPE logic the rest of the app uses, not a separately-computed accuracy figure.\n\n## How to use it\n1. Pick your date range and stores (or leave it on All Stores), then Generate Report.\n2. Read MAPE% and Pass Rate% against this panel\'s own color cuts (MAPE <5% green / <10% amber / else red; Pass Rate ≥80% green / ≥60% amber / else red) to spot-check forecast reliability for the EXACT window you\'re asking about — tighter or looser than the headline Forecast Accuracy numbers can be, since this is a fresh re-run for your specific range, not a cached backtest.\n3. Export to CSV for sharing or archiving a cross-location snapshot of a specific period.\n4. Remember Ops Score / Ctrl Score are current-standing figures, not date-range-scoped, when reading them next to the columns that are.',
  },

  // Task #75 (ongoing KB-coverage backlog, 2026-11-06 batch) -- 6 more real, traffic-relevant
  // nav panels named directly in the GM routine (memory/plan-role-based-panel-gating-2026-11-03.md
  // #3's direct-match table) that had no article yet.
  inventory_guide: {
    title: 'Inventory Intelligence — Panel Guide',
    category: 'Panel Guide',
    summary: 'Four-section usage/overstock/transfer report (Service, Production, Overstock, Transfers) over the auto-pulled QSRSoft on-hand stream, with manual upload as a never-overriding gap-fill only.',
    detail: '**What it offers:** Four tabs over the same underlying item rows. **Service** / **Production** — the top 20 items in each area by Usage per $1,000 net sales (regardless of current stock level), a daily stocking guide with a 10% safety-buffer "Daily Target." **Overstock** — items exceeding a configurable day-supply threshold (default 14 days), each showing Excess Days/Cases/Value, plus a separate action-item callout for any item with a negative on-hand or negative usage rate (each carries its own specific correction instruction — count-and-correct, verify depleted, or review the usage entry). **Transfers** — cross-location matching of an overstocked sender (>threshold days) against a needs-supply receiver (<half that threshold), same organization only, minimum 0.5-case transfer, sorted by distance; an optional "Roll up duplicate WRINs" toggle merges split line items for the same product before computing any of the above.\n\n**How the data is obtained:** Cloud-first from `qsr_inventory_summary` (auto-pulled, latest period per store×WRIN). A manual inventory upload only GAP-FILLS a (store, WRIN) the cloud stream does not yet cover and never overrides a row the cloud already has — the header chip states plainly whether you\'re looking at cloud data, cloud+manual gap-fill, a failed auto-sync, or manual-only (a failed cloud read is shown as its own distinct state, never silently mistaken for "no data"). The `cls` (class) field from the source is mapped onto this panel\'s five fixed classes (Paper/Food/Condiment/Ops Supplies/Miscellaneous) through a small known-synonym table; a genuinely unrecognized class value is NOT silently bucketed into Miscellaneous — it still shows under "All Classes" but not under any specific class filter, and the header flags exactly how many such items exist so a real vocabulary mismatch is visible instead of hidden.\n\n**What it represents:** Every cloud-sourced quantity field (usage/day, starting/ending on-hand, actual usage) is in the item\'s own natural count unit (each/container/bag/etc.) — NEVER pre-converted to cases, confirmed by the source API never returning `uom:\'Case\'`. Excess Cases divides by the item\'s case size to convert into a purchasing unit; Excess Value does NOT divide by case size (it\'s a pure dollar figure), which is why a plausible-looking dollar total can sit next to what looks like an oddly large case count for a small-pack item — that\'s the natural-unit math working correctly, not a bug.\n\n**How to read and use it:** Use Service/Production as a daily stocking checklist, not a stock-level alert — it ranks by usage rate, independent of what\'s currently on hand. Use Overstock to find tied-up cash and start a transfer conversation; the action-item list above it is the one section that needs correcting in the inventory system itself, not acted on operationally. Export a single location\'s report (role-tiered summary text for GM/Supervisor/Operator/Org framing) or the full bulk district report for sharing.',
  },

  speed_of_service_guide: {
    title: 'Speed of Service — Panel Guide',
    category: 'Panel Guide',
    summary: 'Order-to-serve by station (Drive-Thru, Front Counter, Kitchen/MFY, Beverage) against each store\'s own calibrated target, with weekly-trend, daypart, and hour-of-day drill-ins.',
    detail: '**What it offers:** Four clickable "by station" boxes (🚗 DT, 🧾 Front Counter, 🍔 Kitchen/MFY, 🥤 Beverage) double as a station SELECTOR — whichever you click drives the Store Ranking table plus the Weekly Trend / Daypart / By-Hour charts below it. Each station box carries a gauge bar against its own green/amber/red band. A date-range control (default 90 days), an org/state/patch/store filter, CSV/JSON export, and a full printable district report (summary + by-station + store ranking + weekly trend + daypart + by-hour, as real tables, not just chart images) round it out.\n\n**How the data is obtained:** `qsr_daily_activity` (the auto-pulled DAR stream), summed per store/week/daypart/hour then run through each station\'s own formula. Drive-Thru uses the reconciled `oepeSeconds()` definition (the same one every other OEPE-reading panel in the app uses, independently validated against a real QSRSoft Service report at r=0.9958) — not a raw sum of the underlying fields. Front Counter, Kitchen, and Beverage use a simpler raw Σuntilserve ÷ Σtransaction-count ratio (their own formula corrections are a separate, not-yet-done piece of work, so treat those three as directionally reliable rather than reconciled to the same standard as DT).\n\n**What it represents:** Green/amber bands are PER-STORE, PER-STATION targets where one exists — DT uses the store\'s own `tOepe`, Front Counter `tR2p`, Kitchen `tKvst`, each with a +40-second amber buffer above it. Beverage has no calibrated per-store target at all (owner-confirmed) and always renders against a flat default band with a dashed border and a "(default)" label, so a guessed threshold never reads as trustworthy as a real one. A store missing its own target field for a given station falls back to that same flat default, with the identical visual flag. Weekly-trend and daypart/hour aggregates use SCOPE-level bands — the selected stores\' own targets averaged together — rather than any single store\'s number, since no one store\'s target is correct for a multi-store view.\n\n**How to read and use it:** Click a station box to make it the one driving Store Ranking and the three trend charts below — the ranking table itself always colors each row against THAT STORE\'s own band (not the scope average), so a store can be red in Store Ranking even while the district-wide chart above it reads green. Use Weekly Trend\'s store/patch mode (not just the single "avg" bar) to see whether a slow district average is one outlier store or a genuine district-wide pattern. Daypart/By-Hour pinpoint WHEN the bottleneck actually happens, which is often more actionable than the all-day average alone.',
  },

  store_one_pager_guide: {
    title: 'Store One-Pager — Panel Guide',
    category: 'Panel Guide',
    summary: 'A single-store, print-ready performance brief — KPIs vs. target, a day-of-week sales breakdown, forecast-model assignment, and auto-written plain-language observations, all generated fresh from the live data.',
    detail: '**What it offers:** Pick one store and a period (Last 2/4/6 Weeks or Month-to-Date), then generate a printable one-page HTML brief: a KPI table (value / target / status) for the period\'s averaged metrics, a day-of-week sales/guest-count bar breakdown (highlighting the strongest day), the store\'s current forecast model assignment per horizon (DI / LY-Adjusted / DOW-Trend, with its MAPE where available), and a short list (max 5) of auto-generated plain-language observations — e.g. "Sales trending X% above last year," "OEPE averaging Ns — Ns above target," "Labor Xpp above target" — each one computed from the SAME averaged figures the KPI table shows, not a separate narrative engine.\n\n**How the data is obtained:** Every metric (sales, GC, avg check, OEPE, park%, labor%, TPPH, FOB%) is pulled through `metricSeries()` — the shared auto-first resolver every other panel in the app uses — over the selected period, for the one selected store. The averaging window deliberately EXCLUDES the still-open business day (via `businessDate()`), so a partial today never drags a period average toward whatever fraction of the day has posted so far. Last-Year comparison uses the same metric resolved over the matching prior-year window.\n\n**What it represents:** Each KPI row\'s status (✓ On Target / ⚠ Watch / ✗ Off Track) is a simple percentage-gap-to-target cut: within 5% of target is On Target, within 15% is Watch, beyond that is Off Track — the same three-tier framing across every row, lower-is-better metrics (like labor%) measured the opposite direction from higher-is-better ones (like sales), as appropriate per row. The auto-observations are generated, not hand-written per store — the same five checks run for every store every time, only the numbers and which direction they point change.\n\n**How to read and use it:** Use the period picker to match whatever window you\'re discussing (a recent 2-week slice vs. the full month), then print or screen-preview the brief as a leave-behind for a store visit, a GM 1:1, or a quick store-health snapshot — it is deliberately a single store at a time, not a comparison tool (use Leaderboards or Trend Explorer for cross-store comparison).',
  },

  launch_planner_guide: {
    title: 'New Store Launch Planner — Panel Guide',
    category: 'Panel Guide',
    summary: 'A reusable day-by-day (and hourly/15-min) sales-ramp plan for a newly opening or relocating store, blended from real comparable stores\' own opening trajectories — not a guess, and not tied to any one store.',
    detail: '**What it offers:** Pick a store, an open date, an optional grand-opening date, a mature-weekly-sales assumption, and one or more comparable stores (each with a weight) that already went through a similar opening/relocation. "↻ Regenerate from ramp model" produces a day-by-day plan — Day N, calendar date, Projected $ (from the model), an editable Override $, the Effective $ (override if set, else projected), and Suggested Labor Hours. A **Plan Length** selector (60/90/180/365 days, default 365) controls the window, with a **"Projected Total (N days): $X"** stat summing the full plan. Each day also has independent **"▸ Hourly"** and **"▸ 15-min"** toggles that expand a real intraday breakdown. An optional **Predecessor Store** field (e.g. the store being replaced in a relocation) adds a real day-of-week shape on top of the day-level numbers.\n\n**How the data is obtained:** The day-level shape comes from `src/engine/new-store-ramp.js`\'s `projectNewStoreSales`/`blendRampShapes` — each comparable store\'s OWN real sales trajectory from its own first trading day forward, expressed as a fraction of its OWN mature run-rate (the trailing up to 90 real trading days as of that store\'s own history), then blended across comparables by weight. This is a SHAPE, not a dollar figure — the caller-supplied mature-weekly-sales assumption supplies the actual scale; the engine deliberately never guesses it, since that depends on judgment calls (format upgrade, drive-thru addition, inflation since the comparable opened) only a person can size. The Hourly/15-min breakdowns are separate derived views (`hourlyShapeFor`/`quarterHourShapeFor`, same file) built live from each comparable\'s real `hour_slot`/`qtr_slot` rows in `qsr_daily_activity`/`qsr_sales_quarter_hour` — computed on demand when a day is expanded, never persisted. The day-of-week shape (`dowShapeFor`) is a SEPARATE, simpler mechanism from the live forecasting engine\'s own `_dowShape` (a leak-free, asOf-bounded shape of an ACTIVE store\'s own recent history) — this one derives a single 7-value shape once from a RETIRED predecessor store\'s entire real history, with no leak-free constraint, and is applied multiplicatively to each day\'s projected $ only after the day maps to a real calendar date.\n\n**What it represents:** Comparable openings have real-measured-data precedent for running ABOVE their own eventual mature run-rate for the first several weeks (a grand-opening bump), not below it — check the Projected $ column for the shape before assuming a slow ramp. Suggested Labor Hours is computed correctly through average check (`(effective $ ÷ avg check) ÷ TPPH`), never by dividing dollars straight by a TPPH figure, since TPPH is a transactions-per-hour ratio, not a dollars-per-hour one. "Regenerate from ramp model" re-derives every row whose `source` is still `\'ramp\'` but NEVER touches a row the owner has manually overridden (`source:\'manual\'`) — the mechanic that lets changing the comparables/weights/assumption and re-running never silently discard a manual correction. A row matching the Grand Opening date is visually flagged.\n\n**How to use it:** Every input is a form field, not a constant — picking a different store, comparables, weights, run-rate assumption, and dates re-purposes this same tool for the next opening/relocation, with no new code. Use the Override $ column for known exceptions (a confirmed early closure, a known local event), the Predecessor Store field when relocating an existing store in the same trade area (its real day-of-week pattern is usually more locally relevant than a comparable from a different town), and the Hourly/15-min toggles to translate a day\'s total into an intraday staffing curve — both carry an overnight-comparability warning when a comparable store is itself near-closed overnight, so that shape isn\'t silently misapplied to a store that stays open through the night.',
  },

  weekly_count_status_guide: {
    title: 'Weekly Count Status — Panel Guide',
    category: 'Panel Guide',
    summary: 'A flat, printable district roster — last full count, regular count day, and this-week complete/overdue status per store — meant to be shared with the team, not drilled into for troubleshooting.',
    detail: '**What it offers:** One row per store: regular count day, last full count date (and how many days ago), this-week status (✅ Complete / ⚠ Overdue / — No full weekly yet), and clickable (not tooltip-only) badges for pending "new" items (first period, excepted from the compliance count but still need an actual count entered) and "stale" items (excepted, but need cleanup rather than counting). A count-day DRIFT flag (⚠ changed?) appears when the actual pattern of recent qualifying counts no longer matches what Settings/QSRSoft say the store\'s regular count day is — hover/click shows the sample size and confidence behind that call. Print (branded HTML) and CSV export, scoped to any store/patch/state/district selection.\n\n**How the data is obtained:** The SAME engine (`count-cycle.js`: `cycleCompliance`/`detectWeeklyCountDay`/`countDayDrift`) Count Cycle\'s own exceptions-first compliance tab reads — this panel and Count Cycle can never disagree on a store\'s compliance facts, because neither recomputes its own copy. Regular count day is DERIVED from the actual pattern in several trailing periods of real on-hand data, then merged with any manual override set in Settings (the derived/detected value wins unless an override is present). Whatever single day you pick in the date control resolves to that date\'s WHOLE containing calendar week before anything downstream reads it — so two people picking different days within the same week always see identical results, rather than "did it happen" depending on which day of the week you happened to click.\n\n**What it represents:** "This week\'s status" requires a full Food AND Condiment count to count as Complete for that week — a store can show items genuinely counted and still read Overdue if that full combination hasn\'t landed yet this week. The drift flag is a statistical call ("looks like a real, sustained change, not a one-off"), not a certainty — it only fires once the engine\'s own minimum-sample confidence bar is cleared.\n\n**How to use it:** Use this as the shareable, print-and-hand-to-the-team version of count compliance — Count Cycle itself (inside Inventory Control) is the tool for digging into WHY a specific store is behind; this panel is the clean roster for distribution. Act on a drift flag by updating BOTH the in-app setting and the actual QSRSoft configuration to the real day, since the two are independent records that can silently disagree once a store genuinely changes its count day.',
  },

  digital_checklists_guide: {
    title: 'Digital Checklists — Panel Guide',
    category: 'Panel Guide',
    summary: 'A fillable, cloud-saved version of every QSRSoft checklist form (pre-shift, cleanliness, travel path, and more) — distinct from the blank-only print version, and saved per store/day in Supabase.',
    detail: '**What it offers:** Pick any form from the pulled QSRSoft forms library (grouped by category in the left rail), pick a store and a business date, then fill it in on screen — checkbox-style items with their own option set (defaulting to Complete / Needs Action / Action Taken when a form doesn\'t specify its own), date/time fields, and free-text fields, all driven by ONE generic renderer rather than a custom layout per form. Save Draft to persist progress without finalizing, or Submit to mark it complete for that store/day.\n\n**How the data is obtained:** The form CATALOG comes from `public/forms/*.json`, produced by `scripts/qsrsoft-forms-pull.mjs` pulling every published QSRSoft form — this panel shows "No forms captured yet" with the exact pull command if that script hasn\'t run yet, rather than a silent empty state. Each item in a form has no stable id in QSRSoft\'s own raw payload, so a response is keyed on "section-index :: item-title" instead — the same convention the underlying Supabase table\'s own schema documents. A submission is uniquely identified by (store, form, business date) — opening the same form for the same store on the same day reloads whatever draft or submission already exists for that exact combination rather than starting blank.\n\n**What it represents:** This is the FILLABLE companion to the separate, still-existing blank/print-by-hand Forms (Printable) panel — the same underlying forms, but completed and saved as real Meridian records instead of printed and filed on paper. It is distinct from Forms Library (below), which only generates blank leadership-review documents, not day-to-day operational checklists.\n\n**How to use it:** Pick the form, store, and date FIRST — the fill-in area stays locked with a reminder prompt until a store is selected. Use Save Draft through a shift and Submit once genuinely complete; a submitted form still shows its own "· Submitted" status distinctly from an in-progress draft when reopened.',
  },

  forms_library_guide: {
    title: 'Forms Library — Panel Guide',
    category: 'Panel Guide',
    summary: 'Blank, cascade-level leadership review forms (print to PDF or download as editable Word) — the template side of the Leadership One-Pager\'s live-filled reports.',
    detail: '**What it offers:** A catalog of leadership review forms organized by cascade level — Owner→DO, DO→Supervisor, Supervisor→GM — each with its own level-specific description (e.g. a district scorecard + supervisor-accountability focus at the Owner→DO level, vs. a store scorecard + shift-manager-tracking focus at Supervisor→GM). As of this writing the catalog holds one form, "Weekly Business Review" (wins, a performance scorecard, a level-specific deep dive, and commitments), available at all three levels; new forms slot into the same catalog as they\'re built. Each form offers "📋 Print (blank)" and "⬇ Word (blank)" actions.\n\n**How the data is obtained:** This panel generates BLANK forms only — it deliberately ignores all live data, passing an empty state object into the exact same builder functions (`weeklyReviewHtml`/`printWeeklyReview`/`downloadDoc`) the Leadership One-Pager uses for its own LIVE, pre-filled version. That shared-builder design means the blank template and the live-filled report can never drift into two different layouts — a change to one builder changes both.\n\n**What it represents:** A deliberately blank starting point for a leader-led discussion prep — the idea being the leader fills it in by hand (on paper or in the downloaded Word doc) BEFORE the discussion, as a forcing function to actually look at results first. The panel\'s own footer text states the loop explicitly: iterate on the Word version, send it back, and it gets folded into the template for everyone.\n\n**How to use it:** Use this panel when you want the blank version to hand-complete ahead of a review. Want the numbers already filled in instead? This panel\'s own banner points you to the Leadership One-Pager — set your scope and cascade level there and use its own Weekly Review / Word buttons for the identical form, pre-filled with real figures. **Note (not fixed in this pass):** this panel renders its own hand-rolled modal backdrop rather than the shared `ModalShell`/`RoutePanelShell` convention most panels now use — a real, confirmed panel-contract gap, left as-is here since this pass is documentation content only, not a UI-convention fix.',
  },

  // Task #75 (ongoing KB-coverage backlog, 2026-11-06 batch 5) -- 6 more real, traffic-relevant
  // nav panels. The GM-routine cross-walk (memory/plan-role-based-panel-gating-2026-11-03.md §3)
  // is now exhausted of easy direct-match candidates not yet covered (forms-print, named
  // directly in that table's "Food safety / checklist items" row, is the last one); the other
  // 5 were picked by direct measurement of real `kind:'nav'` panel-registry.js ids against the
  // real KB_ARTICLES key list, favoring the two brand-new-this-session features (curated-home,
  // quick-capture) and three real Supervisor/OM/DO-tier analytical panels named in that same
  // plan doc's §3 Supervisor/OM sections (above-store, operator-summary, promo-roi).
  forms_print_guide: {
    title: 'Printable Forms — Panel Guide',
    category: 'Panel Guide',
    summary: 'Blank, fill-by-hand QSRSoft Pre-Shift Checklist and Travel Path templates — print or download as standalone HTML, with a self-serve "request pull" when a form is missing or stale.',
    detail: '**What it offers:** A searchable, category-grouped catalog of captured QSRSoft shift-management form templates. Pick one to preview it on screen (a dark-themed mirror of the real QSRSoft colored-section/navy-card look), then either "🖨 Print / PDF" (opens the browser print dialog, which also offers Save as PDF) or "⬇ HTML" (downloads a standalone file). A "Compact B&W" toggle switches the preview/print to an ink-light black-on-white layout for anyone printing a stack of these daily. If a form isn\'t in the catalog yet, or looks out of date, a "🔄 Request pull" button dispatches a background re-pull (scoped to the current search text, or all forms if the search box is empty) rather than requiring someone to run the capture script by hand.\n\n**How the data is obtained:** Templates are captured ONCE from QSRSoft by `scripts/qsrsoft-forms-pull.mjs` into static `public/forms/*.json` files (an index manifest plus one JSON per form) — this panel reads those files directly via `fetch()`, not a live database query, so "no forms captured yet" means the pull script has never run, not that QSRSoft has no forms. The "Request pull" button calls the same `trigger-dar-sync` Edge Function workflow (`forms` entry) other on-demand syncs use, so a missing/stale form can be refreshed from inside the app instead of needing direct QSRSoft credentials and a manual commit of the resulting JSON.\n\n**What it represents:** This is the BLANK, PRINT-BY-HAND companion to the separate, cloud-saved Digital Checklists panel — the exact same underlying form templates, but filled in on paper (or a downloaded HTML file) instead of saved as a Meridian record per store/day. A normalized form here can come from either a raw "questions" array or an already section-shaped JSON (the pull script\'s own evolving output format) — both render identically; a checklist item with no explicit option list defaults to Complete / Action Needed.\n\n**How to use it:** Search by title if the catalog is long, preview before committing to print, and toggle Compact B&W when printing several forms back-to-back to save ink. Use "Request pull" only when a form is genuinely missing or has changed in QSRSoft — it runs a real background job (a few minutes), not an instant refresh. Need the SAME form filled in and saved digitally instead of on paper? Use Digital Checklists.',
  },

  curated_home_guide: {
    title: 'Curated Home — Panel Guide',
    category: 'Panel Guide',
    summary: 'A role-voiced, format-customizable front door onto Morning Brief\'s own correlation engine — same facts and same numbers, written at store/patch/district altitude depending on who\'s looking, in checklist, bullets, or narrative form.',
    detail: '**What it offers:** The exact same 12-rule flag set Morning Brief\'s `computeMorningBrief()` already computes (controls risk, service, labor, etc.), re-narrated by role and rendered as one of three view styles — Checklist (one item per row with a colored status dot, closest to Daily Brief\'s own look), Bullets (a condensed list), and Narrative (flowing paragraphs grouped by severity) — all render the identical underlying item list; switching views never changes which facts are shown, only how densely they\'re presented. **Consolidated 2026-11-09** (owner: "Checklist, Bullets and Narrative are all the same except the look"): these three used to be three separate always-visible buttons in the main picker; now only ONE picker entry shows (labeled with whichever style is currently chosen), and a small in-panel "View" control alongside the data itself is where you actually switch between the three — only the one you\'ve picked is ever on screen at once.\n\n**How the data is obtained:** Calls the real `computeMorningBrief(ds, briefDate, darByLoc)` directly (via the shared `useBriefDarByLoc()` hook Morning Brief itself now exports, so this panel reuses the exact same DAR-aggregation path rather than a second copy of it) — this is a second front door onto Morning Brief\'s engine, not a new rules engine or a new data source. `buildCuratedHomeItems()` (`src/engine/curated-home.js`) then transforms that SAME output based on the caller\'s role: a `gm`/`sm_am_dm`/`manager` role gets "store altitude" — one tactical item per flag, near-verbatim to what Morning Brief already writes; an `area_supervisor`/`om`/`do` role gets "patch altitude" — every store flagging the SAME rule collapses into ONE pattern item ("N of M stores in your patch are flagging X"), with a headline rebuilt fresh (never reusing one store\'s own live number, like "19s over target," as if it applied to every affected store) while the detail/action text is reused verbatim, since `MORNING_RULES` already writes those two fields generically per severity tier rather than per live value; `vp`/`owner`/`admin` gets the identical aggregation at "district altitude." Two separate per-user settings persist this, both in Supabase `user_settings` mirrored to `localStorage` for the instant read on next load (the same persistence shape `at-a-glance.js`\'s `kpi_secs`/attention-ack settings already use): `curated_home_format` (which top-level picker entry — Game Plan / The Patch / The Ledger / the single Checklist-Bullets-Narrative entry) and `curated_home_data_view` (which of the three view styles, when that entry is active). A format value saved before the 2026-11-09 consolidation (one of checklist/bullets/narrative directly) migrates losslessly on load, never resets to a default.\n\n**What it represents:** Same underlying flags RBAC already scopes to the caller\'s own accessible stores — this panel never re-derives "my patch" itself. The altitude change is purely about WORDING, never about hiding or inventing data: the exact number and the exact recommended action stay visible in every view style and at every altitude, per the app\'s standing "Voice by role" rule. A store with no logged data for the brief date is simply excluded from the item list and from the N/M totals at patch/district altitude, not counted as "0 flags."\n\n**How to use it:** Pick your view once in the small "View" control next to the data — it\'s remembered across sessions and devices. A GM reads this nearly identically to Daily Brief; a Supervisor/OM/DO reads it as "which issues are patch-wide vs. one-off" without having to open every store\'s own brief separately. **Note:** this panel currently ships alongside the existing Daily Brief as its own nav entry, not as a replacement for the app\'s Command/Home view — promoting it to the literal front door is a separate, not-yet-made product decision.',
  },

  quick_capture_guide: {
    title: 'Log Something (Quick-Capture) — Panel Guide',
    category: 'Panel Guide',
    summary: 'An always-reachable top-bar entry point for logging an operational event in seconds — category tiles, quick-pick chips, or free text — that writes into the SAME events pipeline the Calendar uses and immediately shows back the real measured impact of that event type at that store.',
    detail: '**What it offers:** A 3-step flow opened from the "‼ Log something" button in the top bar (reachable from anywhere, not three clicks into a store\'s own tab). Step 1: pick a category tile (the app\'s existing `EVENT_TYPE_GROUPS` — Weather, Store Events, Community/External, Competition, Operations, School Calendar, Retail/Shopping — unchanged, just surfaced as tiles instead of a dropdown). Step 2: pick a quick-suggest chip for a common item in that category, or type a genuine free-text description instead (a chip pick and free text are mutually exclusive — picking one clears the other so the final label is never ambiguous); optionally pick the store (defaults to whichever store is currently selected) and add a note. Step 3, after "Log it →": a confirmation showing the real measured impact.\n\n**How the data is obtained:** Submitting calls `saveOrgEvents()` (`src/lib/supabase.js`) — the EXACT SAME write path the Events Calendar\'s own manual and bulk entry points use, via `buildQuickCaptureEvent()` (`src/engine/quick-capture.js`), which assembles the identical row shape (`loc`/`dateStart`/`dateEnd`/`type`/`label`/`scope:\'store\'`/`note`/`enteredBy`/`method:\'quick-capture\'`) `saveOrgEvents` already consumes — so a quick-captured event is indistinguishable downstream (Event Impact Registry, Signals\' Scanner, the Events panel itself) from one typed into the calendar by hand. The date logged is always `businessDate()` — the current 4am-cutover business day — never the literal calendar date. After a successful save, it queries `loadEventImpact()` and looks up this exact (store, event type) pair via `lookupMeasuredImpact()`.\n\n**What it represents:** The confirmation number is a REAL measured figure from the Event Impact Registry — the same engine that already measures a per-store × event-type sales/GC lift or drag from every logged event — never an invented placeholder. If this exact store/type combination has no prior measured occurrence, the panel says so honestly ("No measured history yet… It\'ll start contributing… going forward") rather than showing a fabricated number. There is deliberately no gamification here (no badges, streaks, or points) — the real measured-impact number IS the feedback loop the app uses to make logging feel worthwhile.\n\n**How to use it:** Use this the moment something worth tracking happens — a call-out, an equipment outage, a local event, a competitor move — rather than waiting to remember it later in the Calendar. "Log another" resets straight back to the category step for logging several things in one sitting. The same underlying write path is also reachable through SAGE\'s `log_event` tool (natural-language logging) and feeds Signals\' Scanner as one more correlatable series — this tile-based flow and those two integrations all write to one place, with no separate schema.',
  },

  above_store_guide: {
    title: 'Above-Store One-Pager — Panel Guide',
    category: 'Panel Guide',
    summary: 'A build-your-own, printable rollup across any scope (district/state/patch/store) and period — eight toggleable panels, an AI executive read, and an alternate Leadership Cascade view for the Owner→DO/DO→Supervisor/Supervisor→GM review loop.',
    detail: '**What it offers:** Two distinct views reached via a toggle at the top, NOT the same axis as the location scope below it — this toggle decides WHO the page is for and what it\'s FOR, not WHERE. "Rollup" is the original quantified, read-only district/patch/store summary: pick a scope (All / Oklahoma / Florida / a named patch / one store, via the standard location selector) and a period (Month-to-date, Last 7 days, Last month, or a custom range), then toggle any of eight panels on/off — Sales/GC, FOB/Food Cost, Scheduling, Labor, Service, Controls, Guest Voice, and Upcoming Impacts (events in the next 21 days, with a caveat when last year\'s matching comparison window itself contained a tagged event, enriched with that event\'s own measured impact when the Event Impact Registry has one). "Leadership" is the harvested former "Leadership One-Pager" (merged in here, dispatch #190) — a cascade-level (Owner→DO / DO→Supervisor / Supervisor→GM) opportunity-$-headlined review with its own persisted week-to-week action plan and accountability loop, and its own separate Org/OK/FL/Owner/DO/Supervisor/OM + store-pill location picker (deliberately NOT the same LocationSelector the Rollup view uses, since the cascade framing doesn\'t map onto a simple All/State/Patch/Store hierarchy).\n\n**How the data is obtained:** Every Rollup metric reuses the SAME shared builders/resolvers every other panel in the app reads through — `metricAvg`/`matchedVsLY` (auto-first per-day resolution + matched-day vs-LY), the one-pager-data.js builders (`buildCurrentState`/`buildReviewActuals`/`buildScheduleActuals`/`buildControlsOutliers`), and `fobByRange` for the dollar-weighted FOB%, filtered down to exactly the selected scope\'s stores (a historical bug once let FOB% silently sum all 27 stores regardless of scope — fixed, and this filter is why). For a Custom period old enough that the app\'s normal bootstrap window (laborRows/qsrActSummaryRows) doesn\'t reach back far enough for the matched-day LY leg (364 days further back than the range itself), this panel widens those two streams on demand in the background — a brief render on the narrower data while that resolves is expected, not a bug.\n\n**What it represents:** MTD and multi-day period math excludes the still-open business day from averaging (same `lastClosedBusinessDay()` convention every other period-aware panel uses) so a partial today never distorts a labor%/OEPE average. Each enabled panel shows the district-level number plus — for a multi-store scope — a per-store drilldown table underneath it (click the panel to expand), so the rollup number and "who\'s actually driving it" are always one click apart, on screen and in print. The optional "🧠 Analyze" button streams a short SAGE-written executive read (2-3 sentences on what\'s driving results, the biggest risk and win, one concrete focus) built FROM the same numeric brief the print view uses — never a separately-sourced narrative.\n\n**How to use it:** Toggle off panels you don\'t need for a tighter, more focused print — this IS the "build your own" rollup the owner asked for (every panel has its own show/hide toggle, including Upcoming Impacts). Use the Leadership view instead when the actual job is a structured cascade discussion with a persisted action plan, not a one-off numeric snapshot.',
  },

  operator_summary_guide: {
    title: 'Org Summary (Operator Summary) — Panel Guide',
    category: 'Panel Guide',
    summary: 'A cross-store comparison table, grouped by Company, State/Org, Operator, or Patch — sales, labor%, food cost%, TPPH, and OEPE, each rolled up the statistically correct way for that specific metric, never a flat average-of-averages.',
    detail: '**What it offers:** One row per group (Company = everything in one row; Org = by state; Operator = by the real operator-to-store mapping in Settings, falling back to each store\'s own org-coords operator; Patch = by the live, effective-dated `supervisorGroups()` assignment — NOT the Settings editor\'s own snapshot, which only recomputes when someone hits Save there). A period picker (2/4/6 weeks, MTD, Last Month, 3/6 months, YTD, or a custom range), a sort dropdown (Sales / vs LY / Labor % / Food % / TPPH / OEPE), and a "focus" filter to isolate one single group\'s own row. Export to CSV at any time via the header\'s Export control.\n\n**How the data is obtained:** Sales and its vs-LY comparison use the shared `autoFirstTotal`/`matchedVsLY` resolvers (auto-first sourcing, matched-day LY comparison — the fix for an earlier bug where every group showed roughly the same wrong "-32%"). Rate metrics (labor%, OT hours, Cash O/S) use `metricAvg`, the shared auto-first-then-manual resolver. TPPH and OEPE specifically use `metricRate`/`metricSumRatio` — a true Σnumerator/Σdenominator rollup across every store in the group, weighted by each store\'s own real hours (TPPH) or drive-thru transaction count (OEPE) — NOT a simple average of each store\'s own ratio, which would silently let a tiny store\'s TPPH count exactly as much as the district\'s highest-volume store. Food cost figures prefer the manual monthly FOB Report submission; when that\'s missing for a store/period, they fall back to the latest in-range snapshot from the auto-pulled `qsr_fob` stream (period-to-date totals, never summed across multiple snapshot rows — summing those would inflate the dollar figure roughly 30x).\n\n**What it represents:** The district-level row for each group is itself weighted correctly per metric, not a mean of the stores\' own already-weighted numbers — labor%/food% are sales-weighted (Σdollars ÷ Σsales), TPPH/OEPE are the same true ratio-of-sums basis described above, and only a genuinely unweighted figure (like average OT hours) is a plain per-store mean. A store contributes zero weight to the TPPH/OEPE rollup specifically if its own ratio couldn\'t be computed that way for the period (no day resolved both legs) — it still shows in its own row, just excluded from that one weighted figure.\n\n**How to use it:** Switch the grouping to match the comparison you actually want to make (Operator for "whose stores are running well," Patch for "which supervisor\'s group needs attention") — the same underlying store-level numbers, regrouped. Click a group\'s row to expand its own store-level detail without leaving the table. A zero-data guard distinguishes "nothing loaded at all" (the whole panel shows a loading message) from "this period/group combination resolves to zero rows" (the controls stay visible, only the results area is empty) — don\'t mistake the second for the first.',
  },

  promo_roi_guide: {
    title: 'Promo / Discount ROI — Panel Guide',
    category: 'Panel Guide',
    summary: 'A matched-day verdict on whether promotions and discounts pay for themselves — Promotions scored against a real national marketing calendar, Discounts honestly left unscored because no equivalent exogenous signal exists for it.',
    detail: '**What it offers:** Two lever sections, Promotions and Discounts, each with a district-level verdict chip (Pays / Costs / Neutral / n/a) and a per-store table (days measured, sales lift %, sales/give-away per heavy day, gross-profit delta per day, that store\'s own verdict). An adjustable "Incremental margin" slider (10-60%, default 35%) controls the margin assumption GP Δ/day is computed against, for every store at once. Print and CSV export cover both levers\' full tables at whatever margin is currently set.\n\n**How the data is obtained:** Promotions is scored by a matched-day design: days a REAL, exogenous national promo-calendar tag (`org_events`, set months ahead by McDonald\'s corporate — independently verified to not be derived from that day\'s own sales) covers are compared against untagged days WITHIN the same day-of-week at the same store, controlling for the weekly pattern. **Discounts is intentionally left unscored** — there is no calendar fact for when a register-level discount happens (it\'s a same-day, reactive decision), so any matched-day split here would have no real "tagged vs. untagged" axis to split on. This is a deliberate fix, not a gap: an earlier version split BOTH levers on same-day promo spend/discount intensity, which was measured to be endogenous — give-away dollars scale with traffic, so that split sorted busy days into "heavy" regardless of any real underlying effect, and was shown to fabricate a positive lift even at a true effect of 0%.\n\n**What it represents:** GP Δ/day = (sales lift on tagged days × your incremental-margin assumption) − the extra give-away on those same days. A store reads "Pays" when the lift more than covers the give-away, "Costs" when it doesn\'t — but this is explicitly a directional, association-with-controls screen, not a randomized controlled trial; the panel\'s own copy states this plainly rather than overclaiming causality. A store needs roughly 4+ weeks of both tagged and untagged days within a known calendar window to score at all; fewer than that, or zero tagged-calendar coverage loaded for the current stores, shows the honest reason (which of two distinct "can\'t tell" cases it is) rather than a blank.\n\n**How to use it:** Treat the per-store table as sorted worst-ROI-first — that\'s where to start a coaching conversation about promo execution or give-away control. Adjust the incremental-margin slider to match your real product mix before trusting GP Δ/day at face value; it\'s a district-wide assumption, and per-store margin genuinely varies. Never read "Discounts: n/a" as "discounts don\'t matter" — it means this specific analytical method cannot determine an answer for that lever, not that the answer is zero.',
  },

  count_cycle_guide: {
    title: 'Count Cycle — Panel Guide',
    category: 'Panel Guide',
    summary: 'The exceptions-first weekly inventory-count compliance tab inside Inventory Control — the same engine Weekly Count Status reads for its own shareable roster, so the two can never disagree.',
    detail: '**What it offers:** A tab inside the Inventory Control hub (`eom-dashboard`) focused on WHY a store is or isn\'t compliant this week, rather than the flat district roster Weekly Count Status presents for distribution. Per store: regular count day (derived, with a manual Settings override available), last full count and how long ago, this week\'s Food+Condiment completion status, and clickable "new" (first-period, excepted but still needing an actual count) and "stale" (excepted, needs cleanup) item badges — plus a count-day drift flag when the real recent pattern no longer matches the recorded regular day, with its own confidence/sample-size detail on hover.\n\n**How the data is obtained:** `src/engine/count-cycle.js`\'s `cycleCompliance`/`detectWeeklyCountDay`/`countDayDrift` — the EXACT SAME functions Weekly Count Status reads for its own roster, so this tab and that panel can never show conflicting compliance facts for the same store, because neither recomputes an independent copy. The regular count day is derived from the actual pattern across several trailing periods of real on-hand data, then merged with any manual Settings override (the derived/detected value wins unless an explicit override exists). Whichever single date you pick in this tab\'s date control resolves to that date\'s WHOLE containing calendar week before anything downstream reads it, so picking any day within the same week always produces identical results.\n\n**What it represents:** "This week\'s status" requires a full Food AND Condiment count landing in the SAME week to read Complete — a store can show real counted items and still read Overdue if the full combination hasn\'t posted yet. The drift flag is a statistical call, gated by the engine\'s own minimum-sample confidence bar, not a certainty — it only fires once there\'s enough recent pattern to trust.\n\n**How to use it:** Use this tab, inside Inventory Control, to actually troubleshoot WHY a specific store is behind — drill into its new/stale item badges, check for a drift flag, and correct the root cause. Use the separate Weekly Count Status panel when you want the clean, print-and-distribute version of the same facts for the whole team — they read from the same engine, so there\'s never a reason to reconcile them against each other.',
  },

  // Task #75 (ongoing KB-coverage backlog, 2026-11-06 batch 6) -- 6 more real, traffic-relevant
  // nav panels, named directly in memory/plan-role-based-panel-gating-2026-11-03.md's §3
  // Supervisor-tier "plausibly real Supervisor tools" note (the GM-routine cross-walk itself is
  // now exhausted, per batch 5's own closing note).
  trend_explorer_guide: {
    title: 'Trend Explorer — Panel Guide',
    category: 'Panel Guide',
    summary: 'Pick any metric in the registry, any date range, any frequency, for one store — see it as a sparkline + table, a day-of-week read, and what else moves with it, reusing Signals\' own Scanner rather than a second correlation engine.',
    detail: '**What it offers:** Pick a metric (the same registry Signals/Scanner reads from), a store, a date range, and a frequency (Daily/Weekly/Monthly/Yearly — automatically narrowed to Monthly/Yearly for a metric that has no daily granularity). The result is a sparkline + period-over-period table, a day-of-week bar breakdown (daily frequency only), and a "Moves together with" list of up to 5 other metrics most correlated with this one for this store/period.\n\n**How the data is obtained:** `extractMetricValues()` (`src/engine/signal-registry.js`) pulls the raw series for the chosen metric/store, then `bucketMetricSeries()` (`src/engine/trend-explorer.js`) re-aggregates it into the chosen frequency — summing for a `aggregate:\'sum\'` metric (counts/dollars), averaging for everything else (rates/percentages), the EXACT same sum-vs-mean rule `extractMetricValues` itself already follows, so a metric buckets identically here as it does everywhere else in the app. The "Moves together with" list reuses Signals\' Scanner `scanAllPairs()` output directly — the SAME Pearson/Spearman sweep with its own effect-size/FDR significance filtering already applied before this panel ever sees the results; this panel adds no second filter and no second correlation math.\n\n**What it represents:** This panel is DELIBERATELY SINGLE-STORE ONLY — picking a store is mandatory, with no district-wide rollup option. Most registry metrics are rates/percentages with no volume-weighting metadata exposed generically, so a correct multi-store rollup for those would risk this app\'s own "never average averages" trap; bucketing ONE store\'s own values into a wider period has no such problem since there\'s only one entity being summed or averaged either way. The day-of-week breakdown and the delta-vs-prior-period badge both color by the metric\'s own `better` direction (higher-is-better vs lower-is-better) where the registry defines one.\n\n**How to use it:** Use this when you want to ask an open-ended question about ONE store\'s own history that none of the app\'s fixed reports happen to answer — "does this store\'s TPPH actually run differently on Fridays," "what else was moving when this metric spiked three weeks ago." The correlation list is framed explicitly as "move together," never a causal claim — read it as a lead to investigate, not a verdict.\n\n**Looking for an actual year-over-year TREND instead** — this year\'s trajectory against last year\'s (and prior years), month by month, across a district/patch/state scope, not one store\'s own history? That\'s **📈 YoY Trends** (Analytics ↳ ⚗ Test Kitchen), a different panel built for exactly that question.',
  },

  // Task #90 (design doc memory/plan-yoy-trend-dashboard-2026-11-05.md) — confirmed gap: nothing
  // in the app showed a trended, multi-month, year-over-year line for a chosen metric across
  // stores/district before this panel. Registry choice (PERFORMER_METRICS), default 3-year
  // trailing window (current + 2 prior) and default metric (Sales) are the owner's 3 open
  // questions' REASONABLE DEFAULTS per the task brief -- all easily reconfigured, not
  // irreversible architecture; see the PR body for the full reasoning.
  yoy_trends_guide: {
    title: 'YoY Trends — Panel Guide',
    category: 'Panel Guide',
    summary: 'A full monthly series overlaying this year against 2-4 prior years, calendar-month matched (not weekday-shadow matched), for any metric across any LocationSelector scope — a real trend line, not a single vs-LY percentage.',
    detail: '**What it offers:** Pick a metric (`PERFORMER_METRICS`, the same registry Leaderboards and Targets Editor Tier 2 already use), a scope (All/State/Patch/Store, multi-select), and a trailing window (2-4 years). The chart overlays one line per year — current year solid/full-strength, prior years progressively fainter/dashed, oldest faintest — with a month-by-month table underneath (actual / LY actual / Δ%), exportable the same CSV/JSON/Print way every other data-heavy panel in the app is.\n\n**4 years is the picker\'s ceiling, not a real ceiling (task #99):** this panel only renders up to a 4-year overlay, but that\'s a UI choice, not a data floor — per the project\'s standing "data depth is never the limiter" rule, most of what\'s pulled in goes back far further than what\'s currently loaded, and a table\'s earliest row is usually just when its pull was first run. If a deeper comparison is worth having, the data is a backfill away, not a hard limit — see the **Data Collection Bounds** article for the short list of genuine exceptions (the one real one here: LifeLenz for Oklahoma only starts Oct 2025).\n\n**Calendar matching, not weekday-shadow matching:** each month is compared to the exact SAME calendar month N year(s) back (September vs. last September), the same proven pattern Performance Trends\' own Email Summary uses for its calendar-YoY comps — deliberately NOT `vs-ly.js`\'s `matchedVsLY` (364-day/weekday-shadow matching), which is correct for a trading-WEEK comparison and wrong for a calendar month for the exact reason Performance Trends had to fix that bug (owner-caught, 2026-09-14).\n\n**Rollup math:** a ratio metric (Labor %, FOB %, TPPH…) is a true Σnumerator ÷ Σdenominator for the month, never an average of daily percentages; a volume metric (Sales, Guest Count) is the real monthly total. A store that opened within the comparison window\'s honeymoon-ramp period (the same young-restaurant trap `vs-ly.js`\'s `lyQuality` already guards against elsewhere) is excluded from a multi-store rollup line entirely — so every year\'s figure uses the identical set of stores — or, for a single selected store, kept but flagged, since the user explicitly chose it.\n\n**What it does NOT do:** This is a monthly-granularity, multi-year view — for day-level exploration of one store\'s own history (day-of-week effects, what else moved with a spike), use **Trend Explorer** instead; for sequential period-over-period (Current MTD / Last Month / Two Months Back), use **📊 Performance Trends**.',
  },

  conversion_efficiency_guide: {
    title: 'Conversion Efficiency Ratio — Panel Guide',
    category: 'Panel Guide',
    summary: 'Food usage vs. target by raw item, from McDonald\'s corporate Owner Operator Reports — an annualized $ opportunity per store, by which of 18 fixed raw items is running furthest over its conversion target.',
    detail: '**What it offers:** One row per store — its latest reporting period, an estimated annual $ opportunity (positive = using more product than target calls for, a real recoverable food cost), YTD $ impact vs. the prior year, how many of the 18 fixed raw items are tracked, and the single biggest-opportunity item. A per-store "Items" drill-down shows all 18 raw items\' actual-vs-target 52-week conversion ratio, excess cases/year, and both the annual and YTD dollar figures individually.\n\n**How the data is obtained:** Manual upload only today (a monthly "Owner_Operator_<name>.pdf" dropped in via Data Manager, parsed by `parsers/conversion-efficiency.js`) — this stream isn\'t part of the app\'s auto-pull `ds` pipeline, so the panel loads straight from Supabase (`loadConversionEfficiency()`) on mount instead of reading `ds`. Worth knowing: `supabase/functions/ingest-report/index.ts`\'s filename-detection logic already recognizes this exact filename pattern (`owner_operator*`) and would route it into the same email-ingest pipeline several other report types already use automatically — so the receiving side is ready, but as of this writing the panel\'s own on-screen copy still describes manual upload as the only path, meaning the Gmail-forwarding side of that pipeline has not yet been turned on for this specific report.\n\n**What it represents:** `financial_opportunity_annual`/`financial_impact_ytd` are already-signed dollar figures straight from the source report (positive = over target, a real loss; negative = under target, a credit) — this panel does not recompute them. Only ONE period per store counts, even across a wider date-range selection, and is NEVER summed across months — both $ figures in the source report are already annualized/YTD running totals, so summing across periods would double-count the same window. A too-narrow date range can silently hide a store\'s most recent upload if that upload\'s period falls outside it — the panel\'s own date presets default to "All Time" specifically because of a real 2026-10-20 incident where a backfilled historical upload "wasn\'t loading" for exactly this reason.\n\n**How to use it:** Read the "What to do" line at the top — it already names the single biggest-opportunity store and item for your current selection. Drill into that store\'s Items table to see whether the opportunity is concentrated in one raw item (a training/portioning fix) or spread across several (worth a broader food-cost conversation). Compare YTD $ Impact against the Annual Opportunity figure to see whether the gap is improving or worsening against last year.',
  },

  oil_efficiency_guide: {
    title: 'Oil Efficiency — Panel Guide',
    category: 'Panel Guide',
    summary: 'Oil use vs. target and filtration compliance by store, from Cargill\'s monthly Oil Management Reports — the same data the VITO fry-filtration pilot candidate list was built from.',
    detail: '**What it offers:** One row per store — its latest period\'s 3-month and 12-month trailing rolling averages for oil use vs. target, an estimated $ impact (or, when Cargill\'s own report has no $ figure for that store, a "Quality Concern" or "Optimized" label instead), and filtration compliance over the same two windows. The "What to do" line surfaces any Quality Concern-flagged store first — a food-quality risk, not just a dollar figure — ahead of the single biggest $-opportunity store if none are flagged.\n\n**How the data is obtained:** Manual upload only today (a monthly "<operator>_Cargill_food_oil_report_<Mon>_<YYYY>.pdf" dropped in via Data Manager, parsed by `parsers/oil-efficiency.js`) — same architecture as Conversion Efficiency Ratio, loading straight from Supabase (`loadOilEfficiency()`) on mount since this stream isn\'t in the app\'s auto-pull `ds` pipeline. Same caveat as that report: `ingest-report`\'s filename detection already recognizes this exact Cargill filename pattern and could route it through automatic email ingest, but the panel\'s own copy still describes manual upload as the only path today.\n\n**What it represents:** Every percentage here is already a ROLLING AVERAGE straight from the source report (not a value this app computes) — only one period per store counts even across a wider date-range selection, never summed, for the same reason as Conversion Efficiency Ratio (these figures are already running averages, so summing periods would double-count). A negative oil-use percentage renders in an amber warning color specifically — this app\'s own convention here, not a distinct field in the source data. **A direct, real-money use of this exact data**: this is the same `oil_use_pct`/`filtration_pct`/`impact_dollars`/Quality-Concern dataset this session used to build a ranked VITO fry-filtration pilot candidate list and a vendor outreach draft (task #59) — this panel is where that same data lives for ongoing review, not a one-off export.\n\n**How to use it:** A Quality Concern flag is the one thing worth checking before the dollar figure — Cargill is flagging a food-safety-adjacent filtration problem, not just inefficient spend. Sort by the $ impact column to find where a filtration fix would pay for itself fastest. Compare the 3-month figure against the 12-month figure to see whether a store\'s oil discipline is improving or sliding.',
  },

  labor_opportunity_cost_guide: {
    title: 'Labor Opportunity Cost — Panel Guide',
    category: 'Panel Guide',
    summary: 'OT, overstaffing, and understaffing $ broken into real drivers, by store — period TOTALS for the three dollar columns, period AVERAGES for the two hour-gap columns and Sales/Person-Hr, each column\'s sign meaning carried by a colored arrow + tooltip instead of a bare "(signed)" label.',
    detail: '**What it offers:** One row per store across six columns: OT $ (Total), Opportunity Cost $ (Total), Act-vs-Sched Opportunity $ (Total), Act vs Needed Hrs (Avg/day), Act vs Sched Hrs (Avg/day), and Sales/Person-Hr (Avg). The three $ total columns and the two hour-gap columns each carry a small colored arrow (▲ red / ▼ green) with a hover tooltip explaining what positive vs. negative actually means for that specific column — the panel\'s own house rule, since "vs needed" and "vs scheduled" are genuinely different claims that must not share one tooltip sentence.\n\n**How the data is obtained:** `src/engine/labor-opportunity-cost.js`\'s `buildLaborOpportunityCostReport()`, resolving each column through `metricValueForRange`/`metricRowsForRange` (`signal-registry.js`) — no separate computation of its own. The three $ columns are summed across the whole selected date range (`otDollar` already carries the registry\'s own `aggregate:\'sum\'` flag; `oppCostDollar`/`actVsSchedOpp` don\'t, so this report sums their real daily values itself, arithmetically identical to what a `sum` flag would produce). The two hour-gap columns and Sales/Person-Hr stay as the registry\'s own period AVERAGE — summing a persisting daily staffing gap across many days would double-count the same gap as if it multiplied.\n\n**What it represents:** `signedBasis` distinguishes two genuinely different claims per the engine\'s own header: `\'needed\'` columns (Opportunity Cost $, Act vs Needed Hrs) are signed against the NEEDED-hours baseline — positive means overstaffed vs. need, negative means understaffed vs. need; `\'sched\'` columns (Act-vs-Sched Opportunity $, Act vs Sched Hrs) are signed against the SCHEDULE instead — positive means the store ran over its own plan. Reading a large negative Opportunity Cost $ together with a large negative Act-vs-Needed Hrs means understaffing cost real sales; the same negative $ figure alongside hours running ABOVE need points at overstaffing instead — the panel\'s own on-screen guidance says to check both together before coaching either direction.\n\n**How to use it:** Sort by Opportunity Cost $ (Total) to find where staffing mismatch cost the most over your selected range, then check the matching hour-gap column\'s sign to know whether that was an overstaffing or understaffing problem before coaching a GM either direction. Act-vs-Sched Opportunity $ answers a different, narrower question — how well the SCHEDULE itself (not the actual staffing) tracked the plan — useful for a planning-accuracy conversation separate from execution.',
  },

  weather_impact_guide: {
    title: 'Weather Impact — Panel Guide',
    category: 'Panel Guide',
    summary: 'How rain and heat have historically moved one store\'s own sales and guest counts — a simple historical split, not a matched-day design, since weather has no equivalent "coverage window" concept to match on.',
    detail: '**What it offers:** For one store\'s loaded days over the selected range: a rainy-vs-dry split (day counts, average sales each way, the % sales and % guest-count delta) and a hotter-half-vs-cooler-half split by that store\'s own median high temperature (same four figures). Both splits need at least 3 days per group to report an average — below that, the group\'s figures show as unavailable rather than a noisy average.\n\n**How the data is obtained:** `src/engine/weather-impact.js`\'s `buildWeatherImpactReport()`, reading `ds.weatherRows` (the auto-pulled Open-Meteo stream, loaded since v4.533) through `metricRowsForRange` — this data has been flowing into the app the whole time, but before this panel existed it was only reachable indirectly through Signals\' Scanner correlation sweep, never as its own direct report.\n\n**What it represents:** This is a DELIBERATE simple historical split (rainy vs. dry days; hotter vs. cooler half), not a matched-day design like Promo/Discount ROI\'s calendar-tag comparison — weather has no equivalent exogenous "coverage window" concept to split on, so a same-store split across enough days is the most honest directional read available. The panel states this plainly as association, not a controlled comparison, matching the same honesty standard Promo ROI holds itself to for its own lever.\n\n**How to use it:** A real, sizable delta here is this specific store\'s OWN measured weather sensitivity — use it to pre-plan staffing or prep ahead of a forecasted rain day or heat wave at that store, not as a district-wide rule (a coastal FL store and an inland OK store can have genuinely different weather sensitivities). Because this is single-store-scoped data read through a date range, run it per store you\'re planning for rather than expecting one district-wide number.',
  },

  loss_prevention_summary_guide: {
    title: 'Loss Prevention Summary — Panel Guide',
    category: 'Panel Guide',
    summary: 'Discount / Promo / Cash O/S / Refunds / Overrides / T-Reds, by store, over any date range — the first report built on the shared ReportShell chrome, reusing the same 16 Controls metrics the rest of the app already resolves through one registry.',
    detail: '**What it offers:** One row per store across 20 columns spanning six loss-prevention areas: Discount (%/$/count), Promo (%/$/count), Cash O/S (%/$) plus Drawer Opens, POS Override (count/$), Cash Refund (count/$), Cashless Refund (count/$), T-Reds Before and After (%/count each), and Manual Refund $.\n\n**How the data is obtained:** Every single column resolves through `metricValueForRange()` (`src/engine/signal-registry.js`) — `src/engine/loss-prevention-report.js`\'s own header states this report deliberately introduces no new resolution logic of its own, reusing exactly the Controls category\'s metric keys that already have a real, agreed-upon direction in the registry. `metricValueForRange` itself decides sum-vs-average per metric (a count/$ metric sums across the range, a %/rate metric averages) — the same rule every other rollup in the app already follows, so this report can\'t silently diverge from how the SAME metrics read anywhere else (the per-metric Reports Hub deep-dives, Signals, Scanner).\n\n**What it represents:** This was the proof-of-concept report for the whole Reports Hub redesign — the FIRST panel built on `ReportShell` (the shared date-range + LocationSelector + Run chrome that gave every report after it Print/CSV/Excel/PDF export for free) — so its own simplicity (one flat table, no narrative "what to do" line, no drill-down) is a reflection of that history, not a sign it\'s less complete than newer reports like Oil Efficiency or Promo ROI.\n\n**How to use it:** Use this as the single flat comparison table across every loss-prevention metric at once, when you want to scan many stores for an outlier on any of these 20 figures in one pass, rather than opening six separate metric-specific views. For a narrative verdict or a deeper drill-down on any ONE of these levers specifically (Promo ROI\'s matched-day scoring, for instance), use that lever\'s own dedicated report instead — this panel is the wide, flat scan, not the deep one.',
  },

  // Task #75 (ongoing KB-coverage backlog, 2026-11-06 batch 7). Picked, in order: the remaining
  // named-but-uncovered Reports-Hub deep-dives batch 6 flagged (price-change-impact/item-
  // velocity/channel-mix), the Custom Report Builder (the catalog-driven sibling those fixed
  // reports sit alongside), and two clearly-daily-use panels no plan doc names directly but whose
  // own real traffic earns a judgment call: Needs Attention and Forecast Brief. Writing the
  // Forecast Brief article surfaced a real mix-up worth recording: `id:'brief'` (panel-registry
  // label "Forecast Brief") actually renders `LocationBrief` (App.js, routePanel==='brief'), a
  // SAGE-written narrative brief -- NOT `DistrictPriorityBrief` (a different component, reached
  // only via the separate `modal==='priority-brief'`/showPriorityBrief path, not this nav entry).
  // Confirmed by reading App.js's own routing before writing the article, not assumed from the
  // similar name -- and it caught a real, fixed stale panel_index line below (see that entry's
  // own note).
  attention_guide: {
    title: 'Needs Attention — Panel Guide',
    category: 'Panel Guide',
    summary: 'A single, severity-ranked, store-grouped feed fusing every cross-domain detector in the app — cash, labor, OEPE, sales-decline, FOB, visit risk, signal decay, sync staleness, and more — so one screen replaces opening eight separate panels to triage the day.',
    detail: '**What it offers:** Three severity chips (Critical / Watch / Acknowledged) filter a store-grouped list, worst finding first — unlike a flat top-N "top issues" list, every flagged store gets its own entry here, never silently dropped to make room for a higher-severity one elsewhere. A pinned "District" strip above the store list holds loc-less items (sync staleness, fading saved correlations) that have no single store to attach to. A collapsible "Running Well" section lists every store with zero live crit/watch items, sorted by name (not by score) — a deliberate choice, since the composite Ops/Ctrl score this app already flags as unreliable for ranking would just import that same unreliability here. Acknowledging an item (✓ Ack) dismisses it until the underlying situation changes; a coaching-review follow-up item shows "🎯 Log Verdict →" instead, since dismissing a review without recording whether the coaching actually worked would defeat the loop\'s entire point.\n\n**How the data is obtained:** `src/engine/attention-feed.js`\'s `buildAttentionFeed()` merges roughly 17 independent small detector functions (FOB outliers vs. the district rate, FOB over its own target, sales/guest-count behind LY, traffic-vs-sales divergence, slow drive-thru, visit-readiness risk, CSAT opportunity, signal decay, EOM count exceptions, integrity flags, stale auto-sync, daypart erosion, transfer opportunities, forecast calibration gap, plus the same findings Daily Brief already computes) into one ranked list via `rankAttention()` — severity first, then dollar impact. `rankAttention` is explicitly "no-silent-caps": a caller that passes a real max and hits it gets a console warning naming exactly what was dropped, rather than items quietly vanishing; this panel itself passes an effectively unbounded max so a store-grouped view can never lose a whole store to a flat cap.\n\n**What it represents:** This panel is the 2026 merge of two previously separate panels (Attention Now\'s flat list and the original Needs Attention) — issue #115 — so an item that used to show up in either old panel still shows up here, under one severity-ranked, store-grouped view. Acknowledgements persist to their own `user_settings` row (`ATTENTION_ACK_SETTING_KEY`), kept deliberately SEPARATE from the swing alarm\'s own ack row — sharing one blob would let one domain\'s pruning logic silently drop the other domain\'s acks the moment its own live-item set stopped including them.\n\n**How to use it:** Start with the Critical chip for anything needing same-day action, then Watch for things worth a look before they escalate. Check the pinned District strip even when every store looks clean — a stale auto-sync flag there means the REST of this panel\'s own findings may be running on old data. Use "Running Well" to confirm a quiet district is actually quiet, not just unmeasured.',
  },

  brief_guide: {
    title: 'Forecast Brief — Panel Guide',
    category: 'Panel Guide',
    summary: 'A SAGE-written Intelligence Brief at any scope (store/patch/operator/org/district) — a plain-language opportunity/coaching narrative generated from the trailing 6 weeks of real performance data. Not a forecast of the upcoming period, despite the nav label.',
    detail: '**What it offers:** Pick a scope when opening it (one store, or Entire Patch/Operator/Org/District), then click "🧠 Generate Intelligence Brief" to get an AI-written analysis: a single-store brief leads with a one-sentence performance headline, 3-4 insights connecting metrics to sales outcomes, the #1 opportunity by estimated weekly dollar impact, forecast-model confidence, and 3 specific coaching recommendations; a multi-store brief instead opens with a 2-3 sentence executive summary, the top 2-3 opportunities ranked by dollar impact across the group, standout performers vs. locations needing attention, and a 30-60-90 day roadmap. Either way: Regenerate re-runs the same prompt fresh, Export saves the text.\n\n**How the data is obtained:** `buildBriefContext()` assembles a plain-text block per store — 6-week sales total, average check, T2W/T6W vs. LY, OEPE/TPPH/Labor% each against that store\'s own target, Ops Score, and forecast MAPE — using the shared `metricSeries()` resolver and ending on the last CLOSED business day (never a still-filling "today", which would feed the AI a misleadingly low final data point). That assembled text is the ENTIRE input to `callSageOnce()` — there is no separate detection/rules engine behind this panel the way Daily Brief or Needs Attention have; SAGE reads the numbers and writes the narrative directly.\n\n**What it represents:** This is NOT a forecast of the upcoming period — despite the sidebar label "Forecast Brief" (🔭), the on-screen title reads "🧠 Intelligence Brief" and the content is entirely retrospective: 6 weeks of what already happened, turned into a written read. Because the narrative is AI-generated from real numbers rather than a second independently-computed model, its $-impact estimates and recommendations are SAGE\'s own interpretation of the context block — cross-check a specific dollar figure or recommendation against the panel it actually came from (Daily Brief, Labor Opportunity Cost, etc.) before treating it as a precise figure in its own right.\n\n**How to use it:** Generate a single-store brief before a GM coaching conversation for a quick, conversational read connecting that store\'s own metrics to outcomes. Generate a patch/org/district brief for a written executive summary to share up or across — the 30-60-90 day roadmap section is meant to be handed off as a starting action list, not a final plan. Regenerate if the underlying data has moved since the last run; this panel never auto-refreshes a stale brief for you.',
  },

  custom_report_builder_guide: {
    title: 'Custom Report Builder — Panel Guide',
    category: 'Panel Guide',
    summary: 'Pick any metrics from the app\'s own reconciled registry, side by side, over any date range and scope — save and optionally share the definition — the catalog-driven counterpart to the Reports Hub\'s fixed-column reports.',
    detail: '**What it offers:** A metric picker grouped by the SAME categories Signals\' registry already uses (chip-style toggle, click to add/remove), a "View As" control that decouples the picked date WINDOW from how it\'s broken out (one total for the whole range, or split into Daily/Weekly/Monthly periods — the window itself never changes, only how it\'s sliced), and a Save/Load layer: name a combination, optionally mark it "🔗 Shared" so every user in the tenant can load it (RLS-enforced; only the author can edit or delete it — the UI simply doesn\'t offer a control that would fail anyway).\n\n**How the data is obtained:** Every picked metric resolves through `metricValueForRange()`/`metricRowsForRange()` (`src/engine/signal-registry.js`) — the exact same resolution path Loss Prevention Summary and every other Reports Hub deep-dive already uses, never a second computation. The picker itself is filtered to metrics whose `granularity` includes `\'daily\'` (a monthly-only metric like FOB% has nothing to return through a date-range report) and, for any metric that someday declares a `perm` requirement, to only what the caller\'s own role can see — no metric does yet, but the filter already exists so a future gated metric is excluded automatically.\n\n**What it represents:** This is the dynamic-catalog sibling of the fixed-column Reports Hub reports (Loss Prevention, Price Change Impact, etc.) — same underlying metric-resolution engine, but the COLUMNS are whatever you pick rather than a fixed list, and the result can be saved and reused. A saved definition stores only metric keys + name + shared flag, so it always reflects whatever those metrics currently mean in the registry, not a frozen snapshot.\n\n**How to use it:** Build once, save with a clear name, and reuse it across date ranges and store scopes rather than re-picking the same metrics every time. Mark a definition Shared only when it\'s genuinely useful to the whole team — anyone in the tenant can load a shared definition, though only its author can edit or retire it. Switch "View As" to Daily/Weekly/Monthly before re-running when you want a trend inside the same window, not just its total.',
  },

  price_change_impact_guide: {
    title: 'Price Change Impact — Panel Guide',
    category: 'Panel Guide',
    summary: 'What happened to sales and guest counts in the 14 days after each CONFIRMED repricing event — real measured price elasticity per store, reusing the Pricing Engine\'s own confirmed-step detector rather than a second one.',
    detail: '**What it offers:** One row per store per confirmed price-change date within the selected range: items repriced that day, the average price step, average sales and guest counts before vs. after, and the resulting % deltas, plus how many days were actually observed on each side (fewer than the full 14 near either edge of the available data).\n\n**How the data is obtained:** `src/engine/price-change-impact.js`\'s `buildPriceChangeImpactReport()` reuses `price-events.js`\'s existing confirmed-step detector — the SAME one the Pricing Engine\'s live simulator and Signal Lab already trust — rather than a second, independently-tuned detector. A "confirmed" event requires a flat price on both sides of the change date for the full `DEFAULT_WINDOW_DAYS` (14) window; this report is explicitly the retrospective view that detector never had before.\n\n**What it represents:** A big, sustained sales/guest move after a confirmed change date IS that item set\'s real measured price elasticity at that specific store — not a model estimate. A small or flat move after a real price increase says the repricing cost little in volume there. Because only CONFIRMED (flat-before/flat-after) events qualify, a store with constant promotional activity around its pricing may show fewer or zero rows here even if its menu prices did change — that\'s the detector correctly declining to call a confound-free comparison, not a gap in coverage.\n\n**How to use it:** Run it after a real price change has had two full weeks to settle, scoped to the stores that took the change. A sales delta that holds steady alongside a flat or improving guest-count delta is the strongest signal the increase was absorbed without volume loss; a guest-count drop alongside the sales gain says some of that increase came at the cost of traffic, not pure margin.',
  },

  item_velocity_guide: {
    title: 'Item Velocity — Panel Guide',
    category: 'Panel Guide',
    summary: 'What\'s selling and what\'s dying, aggregated across any stores you pick, top 50 items by units sold, with a first-half-vs-second-half trend on each — one pass over product-mix data, not the per-item Signal Lab resolver.',
    detail: '**What it offers:** One row per item across the selected stores and date range — units sold, revenue, and a Trend % comparing the first half of the picked range to the second half (each normalized to a per-day rate so an uneven split doesn\'t bias the comparison). Sorted by units sold by default; up to `DEFAULT_TOP_N` (50) items shown.\n\n**How the data is obtained:** `src/engine/item-velocity.js`\'s `buildItemVelocityReport()` makes one direct pass over `ds.pmixRows` (the product-mix stream) per the selected scope and range — explicitly NOT routed through the per-item Signal Lab metric resolver (`pmixItem:<code>`) that Scanner uses for correlating one item against other metrics; this report aggregates straight from the raw rows for its own district/store total instead.\n\n**What it represents:** A large positive Trend % is a genuine rising item worth featuring or prepping more of; a large negative Trend % is worth checking for a real quality, availability, or distribution issue before assuming it\'s pure demand softening — the report measures the MOVEMENT, it doesn\'t diagnose the cause. Items with too little volume to compute a meaningful half-vs-half comparison show a blank Trend rather than a noisy number.\n\n**How to use it:** Scope to a single store when checking one location\'s own menu mix, or to the whole district/patch when looking for a district-wide rising or falling item. A fast faller worth checking first: cross-reference against known promo end dates or a recent menu/price change (Price Change Impact, above) before assuming it\'s an isolated decline.',
  },

  channel_mix_guide: {
    title: 'Channel Mix — Panel Guide',
    category: 'Panel Guide',
    summary: 'Drive-Thru / Delivery (3PO) / Mobile Order Pickup / Kiosk / Front Counter — % of sales and how each is trending, by store — Sales Ledger\'s existing per-channel fields, shown together as a trend report for the first time.',
    detail: '**What it offers:** One row per store, five channel columns each paired with its own Trend column: Drive-Thru %, Delivery (3PO) %, Mobile Order Pickup %, Kiosk %, Front Counter %. Each channel\'s % is the period AVERAGE; its Trend is the first-half-vs-second-half comparison, expressed in percentage POINTS (e.g. "+3.2pt"), not a relative percentage change.\n\n**How the data is obtained:** `src/engine/channel-mix.js`\'s `buildChannelMixReport()` reads the Sales Ledger stream\'s existing per-channel % fields (`slDtPct`/`slDelivPct`/`slMopPct`/`slKioskPct`/`slFcPct`) — data that has always flowed into the app, but was never assembled into one side-by-side trend table across all five channels before this report.\n\n**What it represents:** The Trend columns are deliberately in PERCENTAGE POINTS rather than a relative % change, because a channel moving from 2% to 4% of sales is a 100% relative increase but only a 2-point absolute shift — points are the honest way to compare a shift\'s real weight against the others on the same row. A store shifting several points toward or away from a channel over the picked period is the real signal; the single-period average alone can look identical for two stores with very different trajectories.\n\n**How to use it:** Use the Trend columns, not just the current-period averages, to catch a channel-mix shift still in progress — a rain-driven dine-in/drive-thru shift (see Weather Impact) or a new local delivery competitor are exactly the kind of move this surfaces before it shows up as a sales variance elsewhere. Compare across stores in the same district to see whether a shift is store-specific or a district-wide pattern.',
  },

  // Task #75 (ongoing KB-coverage backlog, 2026-11-06 batch 8) -- the GM-routine and Supervisor-
  // tier named sources (memory/plan-role-based-panel-gating-2026-11-03.md) are both exhausted as
  // of batch 7; this batch was picked by a fresh direct panel-registry.js kind:'nav'/'optional'
  // sweep diffed against the current KB_ARTICLES keys, judged on real day-to-day traffic.
  events_guide: {
    title: 'Events — Panel Guide',
    category: 'Panel Guide',
    summary: 'The community & business calendar, incident log, measured impact registry, and recurring rules, all in one panel — five views over the same underlying org_events rows Quick-Capture, SAGE\'s log_event, and the calendar import all write into.',
    detail: '**What it offers:** Five pills over one shell -- Upcoming (the next ~30 days of calendar-visible events, grouped one row per day/label/type with a "N stores" scope chip for anything multi-location), Calendar (the month-grid Calendar Manager -- see that article -- for adding events directly on a date and registering recurring annual rules), Log (the trailing window of log-only entries -- incidents, competition notes, staffing/training entries that never belong on a shared calendar), Impact (the Event Impact Registry\'s own panel, opened as an overlay), and Rules (recurring-event rule management -- the same Calendar Manager component as the Calendar pill, opened straight onto its Rules tab) -- plus an always-visible "✎ Full ledger" button (not a pill) into the older search/filter/sort/inline-edit/CSV-export list for anything these summary views don\'t cover. Each event row shows a confidence glyph (measured/estimated/assumed) plus the real measured sales impact where one exists.\n\n**How the data is obtained:** Upcoming vs. Log is NOT two separate tables -- both read the SAME `userEvents` rows (`org_events`, via `saveOrgEvents()`), split by each event\'s own `visibility` field (`\'log\'` vs. everything else, falling back to `defaultVisibilityFor(type)` when unset). Events sharing the same (date, normalized label, type) collapse into one row with a scope chip rather than N identical rows -- one Thanksgiving entry across 27 stores shows as "27 stores," not 27 rows. The impact glyph reads `loadEventImpact()` (the Event Impact Registry, `event_impact` table) keyed by (loc, event type) -- "measured" means a real per-store x type figure exists, "estimated" means the registry has a same-type figure from elsewhere without this store\'s own data, "assumed" means nothing in the registry covers this type at all yet.\n\n**What it represents:** This is the SAME write path Quick-Capture\'s tiles and SAGE\'s `log_event` tool both feed -- an event logged through either of those shows up here identically to one typed directly into Calendar, because all three go through `saveOrgEvents()` with no second schema. Calendar/Rules/Impact stay their own pre-existing full components, opened as overlays on top of this shell rather than rebuilt flat -- a deliberate "thin shell now" scope decision (not a visual inconsistency) so the two genuinely new views (Upcoming, Log) could ship without touching ~2000 lines of already-working UI this environment can\'t visually re-verify.\n\n**How to use it:** Start on Upcoming for what\'s coming in the next month across your scope; switch to Log when you want the incident/competition/staffing trail instead of calendar-visible events. Click a multi-store scope chip to see exactly which stores a shared event covers before assuming it applies everywhere. Use "Full ledger" only when you need to search, edit, or export -- the two summary views are read-only by design.',
  },

  loc_intel_guide: {
    title: 'Market Intelligence — Panel Guide',
    category: 'Panel Guide',
    summary: 'Per-store statistical correlations (OEPE, weather, labor coverage, day-of-week) computed live from real ops data, an AI-written narrative brief over the same figures, and an independent Census trade-area demographics snapshot.',
    detail: '**What it offers:** Three modes for one selected store. Statistical: real Pearson-r OEPE-vs-sales correlation with a same-vs-over-target sales delta, a weather-impact breakdown (rain/dry days, wind, peak rainfall intensity, pressure, hot/cold/mild temperature bands, each only shown once it clears a minimum sample size), ops-metric correlations (TPPH/DT Parked %/OEPE vs. sales via median-split high/low comparison), labor-coverage impact (understaffed vs. not, by `actVsNeed`), opportunity-cost totals, average-check trend, and day-of-week sales patterns. AI: a SAGE-written narrative (Executive Summary / What\'s Driving Performance / Top Growth Opportunities / 90-Day Focus) built from a truncated version of the exact same statistical figures -- never a separate set of numbers. Demographics: an independent Census-tract trade-area snapshot, refreshed on demand.\n\n**How the data is obtained:** The statistical mode computes everything live, in-browser, from `ds.laborRows`/`ds.opsRows`/`ds.ctrlRows`/`ds.wxByDate` for the selected store -- Pearson correlation (`pearsonR()`), weather buckets, and median-split ops comparisons are all real math run fresh on each view, not a cached or pre-aggregated figure. Each stat has its own minimum-sample gate (5-20 paired observations depending on the stat) below which it simply doesn\'t render rather than showing a noisy number. The AI mode calls `callSageOnce()` with a JSON payload built directly from those same statistical results (OEPE correlation, weather sensitivity, labor-coverage impact, top 3 dollar-ranked opportunities) -- the narrative can only talk about what the statistical mode already computed, it never fetches anything new. Demographics is architecturally independent of `ds` entirely: it reads/writes a separate `store_demographics` Supabase table, populated only when the Refresh Demographics action is clicked, which runs a real Census Geocoder + ACS5 American Community Survey fetch per store.\n\n**What it represents:** Every correlation here is association, not causation, and the panel\'s own AI prompt explicitly instructs "frame opportunities positively" rather than overclaiming -- read the r-values and % deltas as leads worth investigating, not verdicts. A store with too little history simply won\'t show weather/ops correlations at all (the minimum-sample gates fail closed, not with a fabricated low-confidence number). Demographics never auto-refreshes -- a store\'s trade-area snapshot can go stale between manual refreshes, and the panel has no freshness indicator distinguishing a week-old pull from a year-old one.\n\n**How to use it:** Use Statistical mode to find a store\'s own specific operational levers (does ITS sales actually move with OEPE, rain, or labor coverage) before reaching for a district-wide assumption. Use AI mode as a ready-to-share narrative version of the exact same findings, not a second opinion. Print exports every section computed so far (Statistical + Growth Roadmap + Correlations + Day-of-Week + Weather, plus the AI brief if generated) into one report.',
  },

  cash_variance_pattern_guide: {
    title: 'Cash Variance Pattern — Panel Guide',
    category: 'Panel Guide',
    summary: 'Cash O/S, POS overrides, refunds, drawer opens, and T-Reds After, averaged by store AND day-of-week -- never by register or employee, because this app\'s data model has no register-number field and naming individuals in an automated report is out of scope by this repo\'s own "verify, don\'t accuse" convention.',
    detail: '**What it offers:** One row per store x day-of-week combination with at least 3 observed days, across ten columns: Cash O/S % and $, POS Override count and $, Manual Refund $, Cash/Cashless Refund counts, Drawer Opens/No-Sale count, T-Reds After count and %. Every column is sortable, so the worst store/day combinations surface naturally rather than through a built-in flag.\n\n**How the data is obtained:** `buildCashVariancePatternReport()` (`src/engine/cash-variance-pattern.js`) reads the SAME Controls metric group `signal-registry.js` already tracks store-day-level (never per-employee), via `metricRowsForRange()`, then buckets by day-of-week instead of by date. **Deliberately store x day-of-week grain, not register- or employee-level** -- this app\'s real Register Audit import is keyed by employee + store + date, with no register-NUMBER field anywhere in the data model, so a literal per-register report was never buildable here even before the privacy question. A bucket below 3 observed days is dropped entirely as too noisy to report, rather than shown with a misleadingly precise average.\n\n**What it represents:** There is DELIBERATELY NO built-in "flagged" threshold on this report -- per this repo\'s own standing rule against inventing an unvalidated cutoff (the swing alarm\'s -10% and the count-completeness 75% both came from hundreds of measured store-weeks; this report has no equivalent backtest), every number shown is a real average, and deciding what\'s worth acting on is left to the reader\'s own judgment, sorted however they choose.\n\n**How to use it:** Sort by any column to find which store/day combination runs consistently high on that specific signal -- a recurring pattern on the SAME day most weeks (not a one-off) is what\'s worth a closer look at that shift\'s cash-handling procedures. Cross-reference a flagged store/day against who\'s typically scheduled that shift (Scheduling Hub) rather than this report naming anyone directly -- it was built specifically to not do that.',
  },

  metric_lineage_guide: {
    title: 'Metric Lineage — Panel Guide',
    category: 'Panel Guide',
    summary: 'The "how is this number built?" reference -- every metric Meridian computes FROM other metrics, with its exact formula, upstream inputs, and verifiable source report/table, so any number on screen can be checked against its real source.',
    detail: '**What it offers:** A searchable, filterable table of the metric-provenance registry -- one row per metric, showing its source system (QSRSoft/LifeLenz/SMG VOICE/Meridian-derived), the human-facing report it lives on, the Supabase table it\'s persisted in, and -- for anything CALCULATED rather than read directly -- a "Calculated" badge, its exact formula, and its upstream inputs. Defaults to showing only composed (calculated) metrics; a toggle reveals direct single-source reads too. Exports to CSV/print via the same shared export dropdown other panels use.\n\n**How the data is obtained:** Pure read, no `ds`/Supabase coupling at all -- `METRIC_PROVENANCE` (`src/engine/metric-provenance.js`) IS the source of truth, not a derived view of something else. A core set of entries is hand-curated (speed metrics field-reconciled to the real DAR, SMG\'s exact OSAT/EAP definitions, etc. -- kept hand-written specifically because the human-written prose itself is the value), and everything `metric-source.js`\'s `METRIC_SOURCES` resolver knows about that nobody hand-curated is synthesized automatically from that SAME resolver every other metric in the app reads through -- so a metric added to `METRIC_SOURCES` (one line, per that file\'s own convention) appears here with zero additional work, never silently missing.\n\n**What it represents:** This is the single explicit "100% transparency, no black-box numbers" directive\'s home -- every calculated figure anywhere in the app should be traceable back to a row here, and that row\'s formula should match what the code actually does, not an aspirational description of it. A metric with no "Calculated" badge is read directly from one source with no further math -- there\'s nothing to verify beyond confirming the source report itself.\n\n**How to use it:** Search by metric name, a specific field, or a report name to find how any on-screen number is really built, then check its formula and inputs against the source report it names. Use this as the arbiter whenever two panels seem to disagree on a number -- compare their formulas here before assuming either one is wrong.',
  },

  district_lens_guide: {
    title: 'District Lens — Panel Guide',
    category: 'Panel Guide',
    summary: 'A district-wide correlation heatmap (every store x every tracked metric, against sales/guest-count/avg-check), an opportunity ranking by correlation strength x gap-from-district-average, and an AI-written OK-vs-FL executive comparison -- all from real Pearson-r math, not a canned narrative.',
    detail: '**What it offers:** A heatmap tab -- every store as a row, every tracked predictor metric (OEPE, R2P, TPPH, DT Parked %, Labor %, OT Hours, Cash O/S, T-Reds After, Discount %, FOB %) as a column, colored by that store\'s own real Pearson-r against the chosen outcome (sales, guest count, or avg check), over a trailing 90-day window ending on the last CLOSED business day. An opportunity ranking surfaces each store\'s single strongest lever, weighted by both correlation strength AND how far that store sits from the district average on that same metric. An OK-vs-FL org summary pulls each org\'s top 5 metrics (requiring data from at least half that org\'s stores and a meaningful average |r|), and a Generate-narrative action asks SAGE to write a 3-paragraph executive comparison from those exact two lists plus the top 3 ranked opportunities -- nothing the narrative says isn\'t already computed on screen.\n\n**How the data is obtained:** `computeAllCorrelations()` runs a real Pearson-r for every store x predictor pair against the chosen outcome metric, gated by a minimum sample size and a t-statistic significance tier (weak/sig/strong, requiring at least 10 paired observations). `computeMetricAverages()` separately computes each store\'s own 90-day trailing average for the same set of metrics, used both to color the heatmap\'s intensity and to compute each store\'s gap from the district average for the opportunity ranking. The narrative prompt passed to SAGE contains only the already-computed top-metric lists and opportunity rankings -- `callSageOnce()` writes prose from those real numbers, it does not re-derive or invent any of them.\n\n**What it represents:** Heatmap cell color intensity scales with the absolute correlation (capped around 0.65), so a deep green or red cell is a genuinely strong real correlation for that store, not just a visual exaggeration -- a near-neutral cell means the correlation is below 0.05, essentially no relationship found. The opportunity ranking\'s score deliberately combines correlation strength WITH the size of a store\'s gap from the district average -- a store can have a moderately strong correlation but rank low if it\'s already near the district average on that metric, since there\'s less real room to close.\n\n**How to use it:** Switch the outcome metric (sales/GC/avg check) to see whether a store\'s strongest lever changes depending on what you\'re trying to move. Use the opportunity ranking to find the single most actionable coaching lever per store, not just the metric with the biggest raw correlation district-wide. Generate the narrative when you want a ready-to-present OK-vs-FL comparison -- it\'s built from the same two org-summary lists visible in the tabs, just written in prose.',
  },

  pay_rate_history_guide: {
    title: 'Pay Rate History — Panel Guide',
    category: 'Panel Guide',
    summary: 'Every detected or logged pay-rate change, crew and management, with its labor-cost impact — Owner/Admin/DO only, wage data, access-logged on every view.',
    detail: '**What it offers:** One merged list of pay-rate changes across two genuinely different populations: Crew (hourly, no pay-raise event is ever logged anywhere, so this report IS the detector) and Management -- GM/AM/DM/SM (a real logged change event, written by the pull script\'s own diff when it runs). Each row shows who, their store, the effective date, the old and new rate, the $ delta, and an estimated weekly/annual labor-cost impact.\n\n**How the data is obtained:** Crew changes are DERIVED, not logged -- `weeklyCrewRates()` joins `lifelenz_shift_pay` to `lifelenz_shift_assignments` into a per-employee weekly rate series, then `detectRateSteps()` finds the actual step-changes in that series. Each detected step carries a `rateBasis` check: a step only reads as a clean `\'straight-time\'` change when BOTH the before AND after rate are confirmed straight-time (not blended with overtime); otherwise it\'s labeled `\'blended -- verify\'`, since a blended rate on either side means the $ delta could partly be an OT-mix swing rather than a real rate change -- a real correction the owner caught and this report now applies automatically. Management changes come from `ds.employeePayRateChanges`, an already-logged event the pull script writes when it detects a diff -- `managementRateChanges()` only reshapes that, it detects nothing itself. Impact is computed from the person\'s OWN measured hours in the week the change took effect, not an assumed full-time figure (management uses `ASSUMED_MANAGEMENT_WEEKLY_HOURS` only when no measured hours exist for that person).\n\n**What it represents:** This panel handles real wage data -- viewing it is logged to `app_access_log` on every mount (`logAppAccess(\'panel_view\', \'pay-rate-history\')`, best-effort, never blocking the panel) per an explicit owner request, since pay data is sensitive even within an Owner/Admin/DO-only panel. A `\'blended -- verify\'` row is not necessarily wrong -- it\'s an honest flag that the detected delta needs a human look before being treated as a confirmed raise or cut, not a confident number.\n\n**How to use it:** Trust `\'straight-time\'`-basis rows at face value; treat `\'blended -- verify\'` rows as a starting point for a manual check against the actual LifeLenz record before using that $ delta in any labor-cost conversation. Use this to answer "when did this person\'s rate actually change and what did it cost us" without having to manually diff LifeLenz exports.',
  },

  // Task #75 (ongoing KB-coverage backlog, 2026-11-06 batch 9) -- fresh panel-registry.js sweep
  // (both named plan-doc candidate sources exhausted as of batches 5/7); 6 panels picked by
  // direct traffic/importance judgment. NOTE: the sweep's original 6th pick, 'priority-brief',
  // turned out to already be fully covered by the pre-existing `priority_brief` entry above
  // (same key family, richer content) -- swapped for the genuinely uncovered `fob-reference-table`
  // panel instead. See memory/finding-kb-panel-guide-2026-11-03.md batch 9 section.
  store_compare_guide: {
    title: 'Store Compare — Panel Guide',
    category: 'Panel Guide',
    summary: 'Side-by-side scorecard, radar chart, and sales-trend line for 2–5 stores at once, each metric\'s best value starred — the quick head-to-head tool, not a district-wide rollup.',
    detail: '**What it offers:** Pick 2–5 stores from a chip row (a 6th pick is blocked, not silently swapped), then read three views of the same selection: a Scorecard table (Combined score, Ops Score, Controls, OEPE, TPPH, KVS Time, DT Parked%, Labor%, OT Hrs — one ★ per row marking whichever selected store has the best value), a Radar chart, and a Sales Trend line chart.\n\n**How the data is obtained:** Every metric reads straight off each store\'s own already-computed summary object (`s.opsScore`/`s.ctrlScore`/`s.p.*`) — the SAME per-store figures Store Dashboard and every other store-level panel already show; this panel computes nothing new, it only lays several stores\' numbers out next to each other. Combined score uses the SAME Ops/Controls weight split (`settings.ctrlWeight`, default 40%) every other combined-score display in the app already uses — not a separate weighting.\n\n**What it represents:** The ★ "best" marker is directional-aware per row (OEPE/KVS Time/OT Hrs are lower-is-better, Ops/Controls/TPPH are higher-is-better) but intentionally does NOT mark a "best" for DT Parked% or Labor% — both are target-range metrics, where neither the highest nor lowest value is objectively "best," so the panel honestly shows no star there rather than picking a misleading winner.\n\n**How to use it:** Use this for a quick, direct head-to-head — "how does Store A stack up against B and C right now" — not for a district-wide view (Org Summary and District Lens cover that altitude). The Radar tab is the fastest way to see WHICH dimension separates the stores; the Scorecard is the one to screenshot or read numbers off of.',
  },
  product_mix_dashboard_guide: {
    title: 'Product Mix — Panel Guide',
    category: 'Panel Guide',
    summary: 'Family-group unit sales, discount exposure, and mix-share, from either the auto-pulled per-store/per-date Cloud stream or a manually uploaded file — Cloud carries real item-level detail the manual upload never has.',
    detail: '**What it offers:** A family-group breakdown (units, discount rate, discount-dollar share, mix %) sortable by Units / Disc Rate / Mix %, switchable between two independent data sources via a Cloud/Manual toggle. The Cloud source additionally offers a per-store, per-date-range view (7D/30D/90D/180D/All) with its own top-15 item-level table — a grain the manual upload never carries at all.\n\n**How the data is obtained:** Cloud is `ds.pmixRows`, the auto-pulled stream (`scripts/qsrsoft-pmix-pull.mjs` → `qsr_product_mix`), per-store per-date per-item — but it is LAZY-loaded, fetched only once this panel is actually opened (`ensureLazyFill(\'pmixRows\')`), confirmed by the panel\'s own header comment to be the fix for a real 2026-08-26 bug where `qsr_product_mix` held 2.5M fresh rows while this panel showed "No Cloud Product Mix Data," because nothing had ever triggered the fetch. The 90D/180D/All ranges go through a SEPARATE wide-fetch tier (`ensureLazyFillWide`) gated specifically on picking one of those ranges, so the default 30-day view never pays that cost and a range label is never shown over data that doesn\'t actually cover it. Manual is `ds.pmixData`, a per-file, lifetime-cumulative rollup with no per-store/per-date grain and no item-level detail — strictly family-group totals, uploaded files with a missing required column surface their own parse error rather than silently zeroing.\n\n**What it represents:** Cloud and Manual are two genuinely different grains, not the same data two ways — Cloud is dated and per-item; Manual is undated and family-level-only. The toggle defaults to Cloud only once real cloud rows have actually landed in `ds.pmixRows`; on a fresh mount (before the lazy-fill resolves) it starts on Manual so a store with real manual data already uploaded isn\'t hidden behind an empty, still-loading Cloud tab.\n\n**How to use it:** Use Cloud + a specific store + a date range for "what\'s actually selling and where is discount dollars going" at real per-item granularity. Use Manual only when no Cloud data exists yet for the period you need. **Note:** this panel renders its own hand-rolled full-screen backdrop rather than the shared `ModalShell` convention most newer panels use — a real, confirmed `panel-contract.md` gap, flagged here, not fixed in this documentation-only pass.',
  },
  dar_daypart_guide: {
    title: 'DAR Daypart Analytics — Panel Guide',
    category: 'Panel Guide',
    summary: 'Hourly OEPE/guest-count/sales from a manually uploaded Daily Activity Report file — peak-hour, daypart, and capacity-constraint views for one store at a time.',
    detail: '**What it offers:** Three views over the same hourly data for one selected store: Hour View (bar charts of OEPE and guest count by hour), Dayparts (AM Peak/Lunch/PM Peak/Evening averages), and Capacity (a table flagging whether the peak-guest-count hour and the worst-OEPE hour coincide — a real capacity constraint — or occur at different hours, meaning the slowdown isn\'t simply "too busy").\n\n**How the data is obtained:** This panel reads `ds.darRows`, which is a genuinely DIFFERENT table from the auto-pulled DAR stream (`qsr_daily_activity`) that Speed of Service, Signals, and most of the rest of the app read — `ds.darRows` is populated ONLY by manually uploading Daily Activity Report Excel files (`Daily_Activity_Report_YYYYMMDD.xlsx`), parsed client-side and saved to the Supabase `dar_rows` table (`saveDarRows()`/`loadDarRows()`, `src/lib/supabase.js`) so it persists across devices/sessions the same way other uploads do, but it is never automatically refreshed by any pull script. The empty state says exactly this — "Load Daily Activity Report files... to see hourly performance data" — honestly, not implying an auto feed exists.\n\n**What it represents:** "DAR" is used for two different real things in this app and they share no rows — this panel\'s `dar_rows` (manual-upload-only, this panel\'s sole consumer) and the much more widely used auto-pulled `qsr_daily_activity` (Speed of Service, Signals, the error-telemetry-adjacent panels, etc.). A store with zero manual DAR uploads shows "No DAR Data Loaded" here even while every other panel in the app is reading plenty of fresh hourly data from the OTHER stream — that is not a contradiction, it is two separate datasets.\n\n**How to use it:** Use this specifically when you have a manually uploaded Daily Activity Report file to analyze for peak-hour/capacity questions at ONE store. For the same kind of hourly question using the already-auto-pulled stream the rest of the app relies on, use Speed of Service or Signals instead — this panel will not reflect data that only exists in `qsr_daily_activity`.',
  },
  fob_reference_table_guide: {
    title: 'FOB Reference Table — Panel Guide',
    category: 'Panel Guide',
    summary: 'A live, auto-pulled version of the owner\'s own Excel target-setting reference sheet — 16 metrics × L3M/L6W/LM/MTD/Projected/Trend, per store, meant to inform the master workbook, not replace it.',
    detail: '**What it offers:** Pick one of 16 metrics (Sales Projection, Comp Sales %, Crew Labor %, TPPH Target, Base Food %, Disc Coup %, Comp Waste %, Raw Waste %, Condiment %, Emp Food %, Stat Loss %, Unex Diff %, FOB Target w/o Disc Coup, Total Food Cost %, P&L Paper Cost %, Op Supply Target) and see every selected store\'s trailing 3-month average (L3M), trailing 6-week average (L6W), last completed month (LM), current month-to-date (MTD), a Projected figure, and a 6-month Trend arrow — the same Loc/L3M/L6W/LM/MTD/Projected/Trend shape as the owner\'s Excel "Table 1 (2)" reference sheet he previously built by hand from a pasted Ops Report snapshot. Export dumps all 16 metrics for every selected store in one file.\n\n**How the data is obtained:** 11 of the 16 metrics (every cost/waste/FOB-leg % plus Total Food Cost % and P&L Paper Cost %) read from `ds.qsrFobRows`, which is a MONTH-TO-DATE CUMULATIVE snapshot per (loc, date), not a daily delta — so this engine (`src/engine/fob-reference.js`) first reconstructs TRUE daily $ deltas per store via `fobDailyDeltas()` (today\'s cumulative minus yesterday\'s, reset to the raw value on the 1st of each month), then sums those deltas — never the cumulative legs themselves — over whatever window is being read (Σ$÷Σsales, dollar-weighted, never an average of daily ratios). The other 5 metrics (Sales Projection, Comp Sales %, Crew Labor %, TPPH Target, Op Supply Target) are genuinely per-day-independent values already, so they reuse the app\'s existing auto-first resolvers (`metric-source.js`\'s `metricAvg`/`metricSumRatio`, `vs-ly.js`\'s `matchedVsLY`/`autoFirstTotal`) instead of a separate computation.\n\n**What it represents:** Projected is NOT just MTD — it blends MTD with the L3M average, weighted more toward MTD as the month progresses (so an early-month MTD reading, noisy on a handful of days, doesn\'t dominate); for a dollar metric, MTD is first turned into a full-month run-rate (MTD ÷ elapsed days × days in month) before that same blend, since a raw MTD $ total isn\'t comparable to a full-month L3M average. Trend is a slope (`trendSlope()`, the same calc the TPPH trend arrow already uses) over up to the last 6 fully completed months, called "flat" below a small deadband (|slope| < 0.02) rather than flip-flopping on float noise — the arrow\'s color is direction-aware per metric (up is good only for `better:\'higher\'` metrics; every cost % wants to trend down).\n\n**How to read and use it:** This is a target-SETTING aid, not a live KPI dashboard — use it to sanity-check or update the master workbook\'s per-store target columns with a trailing-average/trend view that no longer requires manually pasting an Ops Report snapshot. Switch metrics with the dropdown rather than looking for a multi-metric grid — the table always shows one metric\'s six columns across every selected store at a time.',
  },
  email_digests_guide: {
    title: 'Email Digests — Panel Guide',
    category: 'Panel Guide',
    summary: 'Opt-in/opt-out toggles for a small, fixed catalog of scheduled emails (currently EOM Digest and Weekly Cycle Digest) — distinct from Reports Hub\'s "My Reports," which are launchable in-app views, not emails.',
    detail: '**What it offers:** One row per entry in `EMAIL_DIGEST_CATALOG` (`src/engine/email-digest-catalog.js`) — currently two real digests, EOM Digest (daily count-completion/FOB roll-up during the count window) and Weekly Cycle Digest (daily per-store weekly-count-compliance status) — each with a single Subscribe/Subscribed toggle, sent to the signed-in account\'s own email.\n\n**How the data is obtained:** Subscriptions are read/written through `loadMyEmailDigestSubscriptions()`/`setEmailDigestSubscription()` against a Supabase `email_digest_subscriptions` table, keyed only by each digest\'s catalog `key` — this panel and the table are entirely generic over the catalog array, so adding a new scheduled digest to that one file is the full UI-side change needed to make it selectable here. The actual SENDING is a separate concern: each catalog entry names its own send script (e.g. `scripts/eom-digest-send.mjs`), which resolves real subscriber emails via `loadDigestSubscriberEmails(key)` and mails them on its own schedule — this panel only controls what a signed-in user can see and toggle, it never sends anything itself.\n\n**What it represents:** This is NOT the same thing as Reports Hub\'s "⭐ My Reports" — that\'s a per-scope, launchable IN-APP report you open and view; this panel is a short, fixed list of whole ORG-WIDE scheduled EMAILS with no scope or period picker at all. Confusing the two would mean looking in the wrong place for either feature.\n\n**How to use it:** Subscribe to whichever scheduled emails are relevant to your role; unsubscribe any time. If a digest you want doesn\'t exist yet, it isn\'t a setting to toggle here — it\'s a new catalog entry (and send script) someone has to build first.',
  },
  anomaly_scan_guide: {
    title: 'Anomaly Scan — Panel Guide',
    category: 'Panel Guide',
    summary: 'A model-independent day-of-week-baseline anomaly detector (not forecast-vs-actual) with optional AI web-search lookup per flagged day, single or batched, to find and auto-tag the real-world cause.',
    detail: '**What it offers:** Run Scan builds, for every store, a rolling per-day-of-week median sales baseline from real history, then flags days that deviate from THAT DOW\'s own median beyond a configurable threshold (default 8%) — sortable by variance or date, filterable by store/day-of-week/tag-status/holiday. For any flagged day, "🔍 AI" runs a one-off web-search lookup for a real-world cause near that store on that date; "🤖 AI Batch" runs the same lookup across every untagged, non-holiday flagged day in groups of 3, with regional (multi-store) findings queued for manual review rather than auto-applied broadly.\n\n**How the data is obtained:** The baseline is deliberately MODEL-INDEPENDENT — it compares a day\'s actual sales against that store\'s own historical per-DOW median (built from `metricSeries()`, the same auto-first resolver other panels use), never against a forecast output, and needs at least 21 positive-sales days before it will baseline a store at all. Each DOW bucket excludes $0 days and any day already weather-tagged, with a console-logged tripwire if a bucket gets emptied out by tagging — a deliberately bounded exception to this app\'s general "measured, not tag-excluded" calibration rule, safe here specifically because an emptied bucket produces NO baseline rather than a wrong one. The AI lookup is routed entirely through `sage-chat` (`callSageOnce`) using its server-side web-search tool — no personal Anthropic key, no client-side tool-use loop — and must return strict JSON (confidence/eventType/tagLabel/summary/geoRelevant/autoTag/broadEvent). Results are cached in `localStorage`, not Supabase, so a scan doesn\'t persist across devices.\n\n**What it represents:** An auto-tag only fires when confidence ≥ 75 AND the finding is geographically relevant AND a specific event was actually found — anything short of that stays an unconfirmed suggestion, never silently applied. A `broadEvent` finding (one that plausibly hit multiple stores, not just this one) is queued for a human decision rather than fanned out automatically, since confirming it at one store doesn\'t confirm it everywhere.\n\n**How to use it:** Run Scan first, then work Red/high-variance rows top-down; use single "🔍 AI" lookups when you want to review each cause yourself, or "🤖 AI Batch" to clear a backlog, then review the Review tab for anything queued as regional before accepting it district-wide.',
  },

  // Task #75 (ongoing KB-coverage backlog, 2026-11-06 batch 10) -- same panel-registry.js sweep
  // method, picking up the 4 remaining genuinely-uncovered nav panels (panel-manager, settings,
  // troubleshoot, news). Two sweep hits from batch 9's own candidate list ('help'/'admin') turned
  // out to be SECTIONS entries (panel-registry.js's SECTIONS array), not real panels -- excluded
  // as false positives rather than written up as empty guides.
  panel_manager_guide: {
    title: 'Panel Manager — Panel Guide',
    category: 'Panel Guide',
    summary: 'Show/hide optional (experimental, lower-traffic) panels in your own sidebar — a per-device display preference, not an access control, and never deletes a panel.',
    detail: '**What it offers:** One toggle row per entry in `OPTIONAL_PANELS` (`src/constants.js`), grouped by category, each with a plain-language blurb and a show/hide switch, plus Show All / Hide All. A collapsible "Core panels" reference list underneath shows every always-shown `kind:\'nav\'` panel (reusing `panel-registry.js`\'s own `PANELS` array directly, not a second hand-typed list) — informational only, not toggleable.\n\n**How the data is obtained:** Visibility state is `{id: true/false}` saved to `localStorage` (`mf.optionalPanelVis`) via `loadPanelVis()`/`savePanelVis()` — there is no Supabase sync for this preference, unlike most of this app\'s settings. A toggle is **per device/browser**, not per account.\n\n**What it represents:** Hiding a panel here only removes it from YOUR sidebar — it does not restrict anyone else\'s access (that\'s role-based permissions, a separate system) and the panel\'s own data/computation keeps running exactly as before; toggling it back on instantly restores it, nothing is deleted. A row shows "no access" instead of a working toggle when your role\'s permission doesn\'t cover that panel, since showing a switch you can\'t actually use would be misleading.\n\n**How to use it:** Use this to declutter your own sidebar down to the handful of optional panels you actually use regularly — it is reversible at zero cost, so toggle freely. Remember it won\'t follow you to another device or browser; if a panel you expect is missing there, check this panel again on that device rather than assuming it was removed from the app.',
  },
  settings_guide: {
    title: 'Settings — Panel Guide',
    category: 'Panel Guide',
    summary: 'A multi-section config hub (Identity, Forecast, Labor, Theme, Metrics, org-structure editors, AI, role-gated Users/Dev/Data tabs) — almost everything here syncs across your devices via Supabase, with one deliberate exception.',
    detail: '**What it offers:** A sidebar of sections inside one modal (`Settings`, `src/views/management.js`) — Identity (your name/district/operator name, used in report headers and exports), Forecast (weeks-back, week-start day, pass/miss tolerance %), Labor, Theme, Metrics, the org-structure editors (Operators/DOs/Patches/GMs/Roles/OMs/Store Status), AI, and Store Notes — plus three additional tabs (Users, Dev, Data) that only render for roles with the matching permission (`onOpenAdmin`/`admin`/`owner`), not shown at all to everyone else.\n\n**How the data is obtained:** Every section writes through one shared `set(path, val)` helper into the app\'s single `settings` object, which `saveSettings()` (`src/app/App.js`) both writes to `localStorage` (`mf_settings`, for an instant read on this device) AND pushes to Supabase (`pushConfigToSupabase(..., \'app_settings\')`) — so changes here DO follow you across devices, unlike Panel Manager\'s visibility toggles. **The one deliberate exception:** the AI section\'s personal Anthropic API key (used only by the Backtest/Anomaly panels\' "🔍 AI" lookup, not SAGE itself) is explicitly `localStorage`-only (`mf_anthropic_key`) and the UI says so directly — it never reaches Supabase and never follows you to another device or browser.\n\n**What it represents:** This is the one place that edits truly global app behavior (forecast trend window, pass/miss tolerance, org-structure assignments) rather than a single panel\'s own view — a change here can affect scorecards, reports, and other panels district-wide, not just what you personally see.\n\n**How to use it:** Use Identity/Theme/AI for personal preference; use Forecast/Labor/Metrics only when you intend an app-wide behavior change, since those are shared settings, not a personal view option (that\'s Panel Manager). If you don\'t see Users/Dev/Data tabs, that\'s your role working as designed, not a bug.',
  },
  troubleshooting_guide: {
    title: 'Troubleshooting — Panel Guide',
    category: 'Panel Guide',
    summary: 'The app\'s real "Help" — plain-language End User fixes plus a Developer mode with the CLAUDE.md-adjacent diagnostics (token refresh steps, stream names, SAGE\'s own checklist), both reachable by anyone, searchable, and printable.',
    detail: '**What it offers:** A searchable reference doc (`TroubleshootingPanel`, `src/views/troubleshooting.js`) with two modes toggled by anyone opening the panel — **👤 End User** (stale data, a blank panel, a number that looks wrong, how to report a problem) and **🛠 Developer** (known data-source quirks: LifeLenz token refresh, why QSRSoft always falls through to Playwright, the 4am business-day boundary trap, in-progress-day rate-metric contamination, and more) — each a set of real Q&A entries grouped into colored sections, with a search box and a 🖶 Print button for the currently-selected mode.\n\n**How the data is obtained:** Nothing is pulled live — every entry is static, hand-written reference content, SEEDED from (not duplicated from) existing real sources rather than invented fresh: the Developer mode\'s SAGE section reuses `sage.js`\'s own `buildTroubleshootPrompt()` steps and DATA_SOURCES tool→table map verbatim, and its stream-freshness guidance points at the real `STREAMS` array (`stream-freshness.js`) and `sync-failure-watch.yml` convention rather than a hand-typed, driftable copy.\n\n**What it represents:** This panel is deliberately named "Troubleshooting," not "Help" — the owner\'s own distinction is that "Help" used to mean the daily/weekly onboarding checklist, which already exists separately as the **Workflow** panel; this panel exists specifically for "something looks wrong, how do I fix or report it." The Developer mode toggle has no separate permission gate of its own (same `perm:null` as the panel itself) — any user who opens Troubleshooting can switch into it, not just Owner/Admin.\n\n**How to use it:** Start in End User mode for a quick self-serve fix; switch to Developer mode when you\'re chasing a data-source-level cause (a dead token, a boundary mismatch) rather than a UI symptom. Use the 🐞 Log action referenced under "How do I report a problem" from an actual SAGE answer when you have one — it pre-fills a ready troubleshooting prompt rather than starting from a blank Task Queue ticket.',
  },
  news_guide: {
    title: 'Local News — Panel Guide',
    category: 'Panel Guide',
    summary: 'Nightly-pulled local RSS near each store — road closures, crime, business, weather, health, community — honestly labeled as local CONTEXT, not brand monitoring, with genuine store-to-store ambiguity shown rather than guessed away.',
    detail: '**What it offers:** A feed of recent local news stories attributed to the nearest store(s), tagged by signal type (🚧 Roads, 🚨 Crime, 🏪 Business, 🌪 Weather, 🧾 Health, 🎪 Community) with a date, outlet, and link. A story genuinely local to a town with more than one store (Ardmore, DeFuniak Springs) is shown attributed to BOTH, labeled "EITHER," rather than the engine guessing a single one. A rare real McDonald\'s mention is marked "BRAND MENTION" with a gold left-border accent.\n\n**How the data is obtained:** `scripts/news-rss-pull.mjs` pulls nine local outlets nightly (`src/engine/news-sources.js`), classifies each story\'s signal type (`news-classify.js`), and attributes it to the nearest store(s) by locality (`locality.js`) before writing to Supabase; the panel itself (`NewsPanel`, `src/views/news-panel.js`) only reads the already-classified/attributed rows via `loadNewsMentions()`.\n\n**What it represents:** This panel is explicit about NOT being brand monitoring — the seeding run found zero McDonald\'s mentions across all nine feeds, and the panel\'s own footer says so rather than reading as silently broken. Every row is local CONTEXT around a store (most commonly roads/community/business), which matters operationally because a cause like a nearby road closure is invisible to every sales-per-hour metric until the traffic loss has already happened — this is the one data source in the app that can explain a sales drop no operational number can see coming.\n\n**How to use it:** Check this when a store\'s traffic moves for no reason visible in any other panel — a road closure or a nearby competitor/business change is the kind of thing this feed catches that Signals/Anomaly Scan cannot. Treat an "EITHER" story as applying to both listed stores for coaching purposes, not as something to resolve to one — the engine is being honest about real ambiguity, not failing to pick.',
  },
  // ── Batch 12 (2026-11-06) — the first pass at the kind:'hub-tab'/'internal' tier (nav/optional
  // was swept exhaustively through batch 11). Most hub-tab/internal panel-registry ids turned out
  // to be already-covered aliases/redirects into an existing nav parent's own article (e.g.
  // 'labor-allocation'/'sched-summary'/etc are all named explicitly inside scheduling_hub's own
  // tab list; 'monthly-proj'/'pace-target'/'yearly-proj'/'unified-targets' are all named inside
  // planning_hub's). These four did NOT have a real article anywhere, under any name — see
  // memory/finding-kb-panel-guide-2026-11-03.md's batch 12 section for the full measurement.
  review_target_overrides_guide: {
    title: 'Targets Editor — Panel Guide',
    category: 'Panel Guide',
    summary: 'Set a Performance Review target field (one with no, or an adjustable, workbook source) at Company/State/Patch/Store scope, with a live cascade-resolution preview — a different feature from the Monthly/Yearly Targets grids despite the similar name.',
    detail: '**Access:** Performance Reviews → Customize → Targets tab (`TargetsEditorSection`, `src/views/targets-editor.js`). Not its own sidebar entry — the registry id `targets-editor` redirects here (`reviews.customize` permission, narrower than the old standalone panel\'s `analytics.store`).\n\n**What it offers:** Pick one of the review target fields that has no clean workbook source (Delivery Wait, Digital/Delivery GC-R-D, Headcount, Shift Leader Target, FOB % Target, Total Profit vs Target, Complaint Contacts /100K, EPB2B, FS Audits, Food Safety EcoSure, FS Completion T-60, Shift Verifications, Retention Execution, EAP — the full, named list lives in `target-overrides.js`\'s `TARGET_OVERRIDE_FIELDS`, each with its own note on exactly why it has no workbook column), then set a value at **Company-wide / State / Patch / Store** scope using the same progressive `LocationSelector` every other scope-aware panel uses. A live preview below lets you pick one real store and see exactly which tier\'s override wins for it, plus the full resolved target value including any workbook/default fallback.\n\n**How the data is obtained:** Overrides write to their own table (`target_overrides`, via `saveTargetOverride`/`deleteTargetOverride`) — a dedicated overlay, not a row written into `yearly_targets`/`monthly_targets` (those are untouched workbook snapshots; a company/state/patch-scoped value has no single store row to attach to without corrupting that provenance). `mergedTargetsForLoc` (review-engine.js) resolves the real precedence for a review calculation.\n\n**What it represents:** Precedence, highest wins: **Store override > Patch override > State override > Company override > monthly target > yearly target > app default.** A human setting a number here is always trusted over whatever a workbook last said, the same reasoning `mergedTargetsForLoc` already uses for monthly-over-yearly. Overrides are NOT year-scoped — one set value applies to every period until changed or removed.\n\n**How to read and use it:** Use this specifically for review metrics that have no workbook column at all (most of the list) or where the owner wants a different number than the workbook default for a specific scope. **Do not confuse this with the Monthly & Yearly Targets grids** (Planning → Monthly/Yearly) — those edit `monthly_targets`/`yearly_targets` rows directly for sales/labor/service/food-cost fields with real workbook columns; this panel exists for the *other* set of review fields, the ones a workbook was never going to cover.',
  },
  performance_calculator_guide: {
    title: 'Performance Calc — Panel Guide',
    category: 'Panel Guide',
    summary: 'A drive-thru throughput "what-if" slider: drag OEPE, Labor %, or Average Check and see the projected guest-count, sales, labor-hours, and TPPH impact — a staffing/capacity tool, not a Performance Review scoring engine despite living in the same hub.',
    detail: '**Access:** Performance Reviews → Customize → Calculator tab (`PerformanceCalculatorSection`, `src/views/performance-calculator.js`). Not its own sidebar entry — the registry id `perf-calc` redirects here (`reviews.customize` permission).\n\n**What it offers:** Pick a store; three sliders (OEPE seconds, Labor %, Average Check $) initialize to that store\'s real trailing-6-week baseline (`metricAvg` over the last closed business day minus 41 days) and can be dragged freely from there. As you drag, KPI cards update live showing the projected cars/hour, daily guest count, daily sales, labor hours, and TPPH, each shown against its "was" baseline.\n\n**How the data is obtained:** Baseline OEPE/Labor %/Average Check/Sales/GC/TPPH all route through `metric-source.js`\'s auto-first resolver, same as every other panel — these are just slider starting points the user freely adjusts, so staleness here is low-stakes, unlike a live monitoring number. The throughput model itself is a fixed formula, not data-driven: `cars/hour = 3600 / (OEPE + 30s order time + 5s safety gap)`, and the resulting speed CHANGE converts to a guest-count change at either 75% (stores tagged `capacity-limited`/`high-volume` in Store KB — demand exceeds capacity, so faster service directly captures more guests) or 30% (every other store — demand-limited, guests arrive when they arrive regardless of speed) conversion rate.\n\n**What it represents:** This is a standalone throughput/staffing projection tool — it does **not** import or diverge from `review-engine.js`\'s `rateMetric`/`computeScores` (which score a PERSON\'s review against 1-4 rating bands). It shares a name and a `people` section with Performance Reviews, and nothing else; the only reason it lives inside the Customize tab at all is a dispatch-#199 relocation, not a shared engine.\n\n**How to read and use it:** Use it to answer "if we shaved 15 seconds off OEPE at this store, what would that realistically do to sales and labor hours" — drag OEPE down and watch the GC/sales/TPPH cards move. Check the store\'s own capacity-limited tag first (Store KB) before trusting a large GC swing: a demand-limited store will show a much smaller guest-count gain from the same speed improvement, by design, not by bug.',
  },
  calendar_manager_guide: {
    title: 'Calendar — Panel Guide',
    category: 'Panel Guide',
    summary: 'The proactive event calendar — a month-grid view, recurring annual rules so a school break or local festival never needs re-tagging, and an AI-assisted search for upcoming school/local events, all landing in one human-approval queue before anything writes.',
    detail: '**Access:** Events → 📆 Calendar pill (and its sibling 🔁 Recurring Rules pill — same component, different starting tab), `CalendarManagerPanel` (`src/features/calendar.js`). Not its own sidebar entry — the registry id `calendar-manager` redirects into Events\' Calendar pill.\n\n**What it offers:** Three internal tabs. **📆 Calendar** — a month grid showing tagged events across stores at a glance; click a day to add one (reuses the same Event Entry modal Quick-Capture and the Events ledger use — one write path, not a parallel one). **🔁 Recurring Rules** — register an annual pattern once (a school district\'s Thanksgiving break, an annual local festival) instead of re-tagging the same event every year; a rule never auto-writes an instance, it only ever surfaces one for confirmation. **🔔 Pending** — the shared review queue for anything not yet approved: rule-generated instances AND results from the proactive AI search (`searchUpcomingEvents`, via SAGE\'s `callSageOnce` web-search tool) for school calendars and local events, single-store or batched across all stores — one inbox, two sources, nothing written until a human approves it from this tab.\n\n**How the data is obtained:** Everything confirmed here writes through the same `org_events` storage (`saveOrgEvents`/`updateOrgEvent`) every other event-entry surface in the app uses — the Calendar grid, Quick-Capture, and SAGE\'s `log_event` tool are not three separate systems, they are three entry points into one table. The AI search path is the one source that does NOT write directly: its results land in Pending exactly like a recurring rule\'s generated instance, requiring the same explicit approval.\n\n**What it represents:** This is the "know what\'s coming before it happens" half of the event system — Events\' own Upcoming/Log pills are retrospective-leaning (what already got tagged); Calendar/Rules/Pending is the proactive half that tries to get events on the calendar before the day arrives, particularly school-calendar and local-festival dates that recur every year but are easy to forget to re-tag each cycle.\n\n**How to read and use it:** Set up a Recurring Rule once for anything that truly repeats annually (a school district\'s known break schedule) rather than re-tagging it every season. Check Pending periodically — an AI-search result or a rule-generated instance sitting unapproved there is not yet affecting any forecast, so a stale Pending queue is a real gap, not a harmless backlog.',
  },
  fcst_accuracy_guide: {
    title: 'Forecast Accuracy — Panel Guide',
    category: 'Panel Guide',
    summary: 'Run a real backtest comparing five forecast methods (LY Adjusted, AI, Blend, Simple, Dialed-In) plus the LifeLenz/QSRSoft scheduling projection against actual sales, over any date range, per store or district-wide — the UI workflow behind the MAPE numbers the engine articles describe.',
    detail: '**Access:** sidebar → ⚗ Test Kitchen → Forecast Reports → 🎯 Forecast Accuracy tab (`ForecastAccuracyPanel`, `src/views/analytics.js`, hosted by `ForecastReportsPanel`, `src/features/forecast-reports.js`). Not its own sidebar entry — the registry id `fcst-accuracy` redirects into Forecast Reports\' Forecast Accuracy tab, sharing that hub with the **MBI vs LifeLenz Accuracy** tab (see that article).\n\n**What it offers:** Pick a period (2/4/6 Weeks, 3/6 Months, YTD, Last Month, Last Year, or a Custom range) and a scope (all stores or one), then run a real backtest. Results show a per-store MAPE table, sortable by any of six columns: **LY Adjusted** (pure LY × holiday adjustment), **AI Forecast** (the full model — trend+ops+weather+events, or AE/EWMA when that\'s the store\'s assigned model, shown by badge), **Blend** (simple average of LY and AI), **Simple** (the T3M/T6W/T3W trailing-average family — the method that won the Smart Targets backtest), **Dialed-In** (DI calibration re-run fresh over this exact date range, not reusing a stale calibration), and **Sched Proj** (the LifeLenz/QSRSoft scheduling system\'s own sales projection, included for an apples-to-apples outside comparison). Two collapsible sections below the table add a **Day-of-Week Accuracy Breakdown** and a **Weekly/Daily Breakdown**.\n\n**How the data is obtained:** This is a live backtest, not a cached report — every run re-computes each model\'s forecast for every day in the selected range against that day\'s real actual sales, re-deriving Dialed-In\'s calibration fresh rather than reading a stored one. It can be cancelled mid-run (a progress counter tracks records processed).\n\n**What it represents:** This panel answers "which forecasting method is actually most accurate for this store, over this exact window" with a real re-run, not a inference from a different panel\'s numbers — see the **Model Types**, **MAPE**, and **Adaptive Ensemble** articles for what each model/metric means conceptually; this is where you go to actually measure it for your own date range and stores rather than trusting the district-wide validation numbers those articles cite.\n\n**How to read and use it:** Sort by a given model\'s column to rank stores by how well THAT model does; a store where every model scores high MAPE together points at a data/volatility problem bigger than model choice. Use a Custom range matching a specific period you\'re investigating (e.g. "since the new GM started") rather than always defaulting to 6 Weeks, since the right comparison window depends on what question you\'re actually asking.',
  },
};

// Minimal markdown-to-React-nodes renderer (mirrors store-dash.js version; kept here to avoid circular import)
function mdToNodes(text){
  if(!text) return [];
  const lines=text.split('\n');
  const nodes=[];
  let inList=false, listItems=[];
  const flushList=()=>{
    if(listItems.length){
      nodes.push(h('ul',{style:{margin:'4px 0 8px 0',paddingLeft:18}},
        listItems.map((li,i)=>h('li',{key:i,style:{fontSize:'10px',color:'var(--text)',lineHeight:1.6,marginBottom:2}},inlineFmt(li)))));
      listItems=[]; inList=false;
    }
  };
  const inlineFmt=(s)=>{
    const parts=s.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((p,i)=>p.startsWith('**')&&p.endsWith('**')?h('strong',{key:i,style:{color:'var(--text)',fontWeight:700}},p.slice(2,-2)):p);
  };
  for(let i=0;i<lines.length;i++){
    const line=lines[i], trimmed=line.trim();
    if(!trimmed){flushList();if(nodes.length)nodes.push(h('div',{key:'sp'+i,style:{height:4}}));continue;}
    if(/^#\s/.test(trimmed)){flushList();nodes.push(h('div',{key:i,style:{fontSize:'13px',fontWeight:800,color:'var(--amber)',marginBottom:6,marginTop:10,borderBottom:'.5px solid var(--bdr)',paddingBottom:4}},trimmed.replace(/^#+\s*/,'')));continue;}
    if(/^##\s/.test(trimmed)){flushList();nodes.push(h('div',{key:i,style:{fontSize:'11px',fontWeight:700,color:'var(--text)',marginBottom:4,marginTop:10}},trimmed.replace(/^#+\s*/,'')));continue;}
    if(/^###\s/.test(trimmed)){flushList();nodes.push(h('div',{key:i,style:{fontSize:'10px',fontWeight:700,color:'var(--amber)',marginBottom:3,marginTop:8,letterSpacing:'.3px',textTransform:'uppercase'}},trimmed.replace(/^#+\s*/,'')));continue;}
    if(/^[-*]\s/.test(trimmed)){inList=true;listItems.push(trimmed.replace(/^[-*]\s/,''));continue;}
    if(/^\d+\.\s/.test(trimmed)){inList=true;listItems.push(trimmed.replace(/^\d+\.\s/,''));continue;}
    if(/^---+$/.test(trimmed)){flushList();nodes.push(h('div',{key:i,style:{height:1,background:'var(--bdr)',margin:'8px 0'}}));continue;}
    if(/^\*\*.*\*\*:?$/.test(trimmed)){flushList();nodes.push(h('div',{key:i,style:{fontSize:'10px',fontWeight:700,color:'var(--amber)',marginTop:8,marginBottom:2}},trimmed.replace(/\*\*/g,'')));continue;}
    flushList();
    nodes.push(h('p',{key:i,style:{fontSize:'10px',color:'var(--text2)',lineHeight:1.7,margin:'0 0 4px 0'}},inlineFmt(trimmed)));
  }
  flushList();
  return nodes;
}

// InfoIcon — click to open knowledge base article

function KnowledgeBasePanel({onClose}) {
  const [search, setSearch] = React.useState('');
  const [selKey, setSelKey] = React.useState(null);
  const [activeCategory, setActiveCategory] = React.useState('all');

  const categories = [
    {id:'all',label:'All'},
    {id:'Panel Guide',label:'Panels'},
    {id:'Forecast Engine',label:'Forecast Engine'},
    {id:'Forecast Quality',label:'Accuracy'},
    {id:'Operations',label:'Ops'},
    {id:'Controls',label:'Controls'},
    {id:'Food Cost',label:'Food'},
    {id:'App Guide',label:'App Guide'},
  ];

  const articles = Object.entries(KB_ARTICLES).map(([key,art])=>({key,...art}));
  const filtered = articles.filter(a=>{
    const matchS=!search||a.title.toLowerCase().includes(search.toLowerCase())||a.summary.toLowerCase().includes(search.toLowerCase());
    const matchC=activeCategory==='all'||a.category.includes(activeCategory);
    return matchS&&matchC;
  });
  const selected=selKey?articles.find(a=>a.key===selKey):null;

  return div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.6)',zIndex:400,
    display:'flex',justifyContent:'flex-end'}},
    div({style:{flex:1},onClick:onClose}),
    div({style:{width:700,height:'100%',background:'var(--surf)',
      borderLeft:'.5px solid var(--bdr2)',display:'flex',flexDirection:'column',
      boxShadow:'-20px 0 60px rgba(0,0,0,.5)'}},
      div({style:{padding:'14px 20px',borderBottom:'.5px solid var(--bdr)',
        display:'flex',alignItems:'center',justifyContent:'space-between',
        background:'var(--surf2)',flexShrink:0}},
        div(null,
          div({style:{fontSize:'14px',fontWeight:800,color:'var(--amber)',letterSpacing:'-.2px'}},'📖 Knowledge Base'),
          div({style:{fontSize:'9px',color:'var(--text3)',marginTop:2}},
            'Metric definitions · Scoring logic · Integrity thresholds')
        ),
        btn({className:'btn btn-sm',onClick:onClose},'✕')
      ),
      div({style:{padding:'8px 14px',borderBottom:'.5px solid var(--bdr)',
        display:'flex',gap:6,alignItems:'center',flexShrink:0}},
        h('input',{placeholder:'Search...',value:search,
          onChange:e=>setSearch(e.target.value),
          style:{flex:1,background:'var(--surf)',border:'.5px solid var(--bdr)',
            borderRadius:'var(--r)',padding:'4px 8px',fontSize:'10px',
            color:'var(--text)',outline:'none'}}),
        ...categories.map(cat=>btn({key:cat.id,onClick:()=>setActiveCategory(cat.id),
          style:{fontSize:'8px',padding:'3px 7px',flexShrink:0,
            background:activeCategory===cat.id?'var(--amber)':'var(--surf2)',
            color:activeCategory===cat.id?'#000':'var(--text3)',
            border:'.5px solid var(--bdr)',borderRadius:'var(--r)',cursor:'pointer',
            fontWeight:activeCategory===cat.id?700:400}},cat.label))
      ),
      div({style:{display:'flex',flex:1,overflow:'hidden'}},
        div({style:{width:220,flexShrink:0,borderRight:'.5px solid var(--bdr)',overflowY:'auto'}},
          filtered.length===0&&div({style:{padding:20,fontSize:'10px',color:'var(--text3)',textAlign:'center'}},'No results'),
          filtered.map(art=>div({key:art.key,onClick:()=>setSelKey(selKey===art.key?null:art.key),
            style:{padding:'9px 13px',cursor:'pointer',borderBottom:'.5px solid var(--bdr)',
              background:selKey===art.key?'var(--adim)':'transparent'},
            onMouseEnter:e=>{if(selKey!==art.key)e.currentTarget.style.background='var(--surf2)';},
            onMouseLeave:e=>{if(selKey!==art.key)e.currentTarget.style.background='transparent';}},
            div({style:{fontSize:'8px',fontWeight:700,letterSpacing:'.4px',textTransform:'uppercase',
              color:'var(--amber)',marginBottom:2,opacity:.8}},art.category),
            div({style:{fontSize:'10px',fontWeight:600,color:'var(--text)',lineHeight:1.3}},art.title),
            div({style:{fontSize:'8px',color:'var(--text3)',marginTop:2,lineHeight:1.5,
              overflow:'hidden',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical'}},
              art.summary)
          ))
        ),
        div({style:{flex:1,overflowY:'auto',padding:selected?22:0}},
          selected?div(null,
            div({style:{fontSize:'8px',fontWeight:700,letterSpacing:'.5px',textTransform:'uppercase',
              color:'var(--amber)',marginBottom:5}},selected.category),
            div({style:{fontSize:'15px',fontWeight:800,color:'var(--text)',letterSpacing:'-.2px',
              marginBottom:6}},selected.title),
            div({style:{fontSize:'10px',color:'var(--text2)',lineHeight:1.6,
              padding:'8px 12px',background:'var(--surf2)',borderRadius:'var(--r)',
              marginBottom:14,borderLeft:'3px solid var(--amber)'}},selected.summary),
            div({style:{lineHeight:1.7}},...mdToNodes(selected.detail))
          ):div({style:{display:'flex',flexDirection:'column',alignItems:'center',
              justifyContent:'center',height:'100%',color:'var(--text3)',gap:8}},
            div({style:{fontSize:'28px',opacity:.3}},'📖'),
            div({style:{fontSize:'10px'}},filtered.length>0?'Select an article':'No results')
          )
        )
      )
    )
  );
}

function InfoIcon({articleKey, inline}) {
  const [open, setOpen] = React.useState(false);
  const article = KB_ARTICLES[articleKey];
  if(!article) return null;

  return div({style:{display:inline?'inline':'inline-flex',alignItems:'center',gap:2,
    verticalAlign:'middle',marginLeft:4}},
    span({
      onClick:(e)=>{e.stopPropagation();setOpen(o=>!o);},
      title:'Click for details: '+article.title,
      style:{width:14,height:14,borderRadius:'50%',background:'var(--surf3)',
        color:'var(--text3)',fontSize:'8px',fontWeight:700,cursor:'pointer',
        display:'inline-flex',alignItems:'center',justifyContent:'center',
        userSelect:'none',flexShrink:0,transition:'background .1s',lineHeight:1},
      onMouseEnter:e=>{e.currentTarget.style.background='rgba(255,188,13,.25)';e.currentTarget.style.color='var(--amber)';},
      onMouseLeave:e=>{e.currentTarget.style.background='var(--surf3)';e.currentTarget.style.color='var(--text3)';}
    },'?'),
    open&&div({
      style:{position:'fixed',zIndex:500,width:420,maxHeight:'80vh',overflowY:'auto',
        background:'var(--surf)',border:'.5px solid var(--bdr2)',borderRadius:'var(--rl)',
        boxShadow:'0 12px 40px rgba(0,0,0,.7)',top:'50%',left:'50%',
        transform:'translate(-50%,-50%)',padding:20},
      onClick:e=>e.stopPropagation()},
      // Close backdrop
      div({style:{position:'fixed',inset:0,zIndex:-1},onClick:()=>setOpen(false)}),
      div({style:{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:12}},
        div(null,
          div({style:{fontSize:'8px',fontWeight:700,letterSpacing:'.5px',textTransform:'uppercase',
            color:'var(--amber)',marginBottom:3}},article.category),
          div({style:{fontSize:'14px',fontWeight:800,color:'var(--text)',letterSpacing:'-.2px'}},
            article.title)
        ),
        btn({className:'btn btn-sm',onClick:()=>setOpen(false)},'✕')
      ),
      div({style:{fontSize:'10px',color:'var(--text2)',fontWeight:500,padding:'6px 10px',
        background:'var(--surf2)',borderRadius:'var(--r)',marginBottom:12,lineHeight:1.5}},
        article.summary),
      div({style:{lineHeight:1.7}}, ...mdToNodes(article.detail))
    )
  );
}

// ── Event-registry weight for the trailing/adaptive models (ae/ewma/simple) ──────────────
// dow/di forecast off an explicit LY+trend blend, so a tagged event's factor is pure added
// signal with no risk of double-counting. ae/ewma/simple are different: they fit directly to
// recent actuals, so once a MULTI-DAY event's own elevated days roll into their trailing
// windows, those models start reflecting the new reality on their own — applying the full
// event factor on top of that would double-count it. Measured directly in each model's own
// code: forecastAdaptiveEnsemble's momentum signal compares the last 14 calendar days against
// the prior 14 (clamped ±15%), its LY-adjustment signal compares 90-day windows (clamped
// ±20%), and forecastEWMA's same-weekday window holds the last 14 OCCURRENCES of that weekday
// (up to ~98 calendar days back). None of them see anything until enough event-period days
// have actually accumulated in those windows — so the gap is real and worth closing, but it
// closes itself once the event is old enough that the adaptive signals have caught up.
// _evEventAgeDays walks backward from `date` counting consecutive prior days carrying the
// SAME tag type (0 = date itself is the first tagged day) — this naturally gives 0 for a
// single-day event (holiday, sports, etc.), so this taper never changes behavior for those;
// it only ramps down a factor that's been active for many consecutive days, which in practice
// means the long-running comp_closure/own_closure events this was built for.
function _evEventAgeDays(userEvents, loc, date, type){
  const evMap = userEvents && userEvents[loc];
  if(!evMap || !type) return 0;
  let d = date, age = 0;
  while(age < 400){
    const prev = addD(d, -1);
    const tag = evMap[dKey(prev)];
    const types = tag ? ((tag.tags&&tag.tags.length) ? tag.tags.map(t=>t.type) : [tag.type||'other']) : [];
    if(!types.includes(type)) break;
    d = prev; age++;
  }
  return age;
}
// Full weight through day 14 (none of the trailing models have turned over their shortest
// window yet), linearly down to zero by day 90 (AE's LY-adjustment window and EWMA's
// same-weekday window have both substantially rotated in event-period days by then). A
// judgment call, not a backtested constant — documented here so it's easy to find and
// recalibrate against a real backtest later rather than silently drifting.
function _trailingModelEvWeight(ageDays){
  const RAMP_FULL=14, RAMP_ZERO=90;
  if(ageDays<=RAMP_FULL) return 1;
  if(ageDays>=RAMP_ZERO) return 0;
  return 1-(ageDays-RAMP_FULL)/(RAMP_ZERO-RAMP_FULL);
}

function forecastDay(loc,date,ds,settings,casc,tgt,horizon,forceModel){
  if(!ds)return{date,loc,ly:0,lyAdj:0,t2:0,t4:0,t6:0,forecast:0,actual:0,goal:0,varPct:null,pass:null,isFuture:true,opsFactor:1,wAdj:0,m1:0,m2:0,oepe:0,tpph:0,labor:0,noLYData:true};
  const t=tgt||ds.targets[loc]||DEFAULT_TARGETS[loc]||{};
  // Goal = last year grown by the store's target growth. The main pipeline computes this
  // at the bottom of the function, but the AE / EWMA / simple short-circuits above it all
  // returned `goal:0` — and since all 27 stores are assigned model 'ae', the Goal column
  // was dead for every store, always. Same formula, hoisted so every return path can use
  // it. Falls back to 0 when there is no LY, which is honest: no LY, no goal.
  const _goalOf=(ly)=>(ly>0?Math.round(ly*(1+(t.tGrowth||.05))):0);
  const anchor=(ds.lastActual&&ds.lastActual[loc])||addD(new Date(),-1);
  // isFuture: date is after the last known actual OR after today (whichever is more conservative)
  const todayStart=sodOf(new Date());
  const isFuture=date>anchor&&date>=todayStart;
  const eDt=settings.mode==='Back Test'?date:anchor;
  let lyRaw=fetchLY(ds.laborIdx,ds.laborRows,loc,date);
  const noLYData=lyRaw===0;
  // For new stores (<365 days history), use the ramp model instead of LY lookup
  if(noLYData&&ds&&ds.laborRows) {
    const ageDays=storeAgeDays(ds.laborRows,loc);
    if(ageDays>0&&ageDays<400) lyRaw=fetchRampSales(ds.laborRows,ds.laborIdx,loc,date,ds)||0;
  }
  // Per-store Dialed-In calibration overrides global settings
  // Only use Dialed-In calibration if explicitly enabled by user
  // Per-store DI skip: if this store is in dialedInSkipped, use default model params
  // Model assignment: use backtest-derived optimal model per store+horizon
  // forceModel (v4.195): optional override bypassing getModelAssignment entirely —
  // added so the Forecast Accuracy Report can backtest "what would DI/AE/EWMA have
  // produced for this store+date" through the SAME pipeline every other model uses,
  // without mutating localStorage/settings.dialedIn or duplicating forecast logic
  // into the report itself (which would silently drift out of sync over time as
  // this pipeline changes). undefined/omitted = fully unchanged prior behavior.
  const _assignedHorizon = horizon||'weekly';
  const _assignment = forceModel ? {model:forceModel} : getModelAssignment(loc, _assignedHorizon, settings);
  const _assignedModel = _assignment.model||'dow';
  const _diSkip=forceModel ? false : (settings.dialedInSkipped||[]).includes(loc);
  const _hasDI = !_diSkip&&settings.dialedInEnabled&&settings.dialedIn&&settings.dialedIn[loc];
  // Pre-filter to this store's rows once — AE/EWMA internally scan laborRows for
  // the matching loc on every call; using the per-store slice is identical math
  // but ~80× faster (1,539 rows vs 123k rows per call × hundreds of calls).
  const _locLaborRows = locRows(ds.laborByLoc, ds.laborRows, loc);
  // ── New Store Launch Plan short-circuit (memory/project-new-store-launch-planner.md) ──────
  // A store with a real comparable-store ramp plan (new_store_launch_plan, built by the Launch
  // Planner tool) but no usable real trading history yet — e.g. 44689/Lindsay before its
  // 2026-11-14 opening — has nothing for ANY model below to work from: ae/ewma/simple/dow/di all
  // key off `_locLaborRows`, which is empty, so every one of them returns 0 or falls through.
  // `fetchRampSales` above only ever substitutes a LY figure (65% of district DOW average) and
  // only once `ageDays>0`, which a store with zero rows never reaches — so without this, a
  // genuinely-ramp-modeled store (real $/week assumption, real day-of-week shape from its real
  // predecessor) silently showed 0 everywhere Monthly Projections/Forecast Accuracy/etc. read it.
  // Checked BEFORE the model dispatch below (a model "trained" on zero real rows is meaningless
  // regardless of which one the store happens to be assigned) but gated tightly: only when this
  // exact (loc,date) has a real plan row AND the store has nothing real to forecast from
  // otherwise (`noLYData` AND zero real rows for this loc) — so a store that starts accumulating
  // real trading data (even inside the plan's own date window) stops being short-circuited the
  // moment it has real history, and every other store (no launchPlanByLoc entry at all) is
  // completely unaffected.
  const _launchPlanDay = ds.launchPlanByLoc && ds.launchPlanByLoc[loc] && ds.launchPlanByLoc[loc][dKey(date)];
  if (_launchPlanDay && noLYData && _locLaborRows.length === 0) {
    const _lpVal = Math.round(_launchPlanDay.effective);
    const _lpFut = date > sodOf(new Date());
    const _lpAct = _lpFut ? 0 : (fetchRow(_qsrActIdx(ds), loc, date, 'sales') || 0);
    const _lpVarPct = _lpAct > 0 ? (_lpAct - _lpVal) / _lpAct : null;
    const _lpPass = _lpVarPct !== null ? Math.abs(_lpVarPct) <= (settings.tolerance || 5) / 100 : null;
    return {
      date, loc, forecast: _lpVal, ly: 0, lyAdj: _lpVal, t2: 0, t4: 0, t6: 0,
      actual: _lpAct,
      // goal = forecast, not _goalOf(lyRaw) — there's no real prior year to grow from for a
      // brand-new store; the launch plan's own projection IS the target.
      goal: _lpVal,
      varPct: _lpVarPct, pass: _lpPass, isFuture: _lpFut, opsFactor: 1, wAdj: 0, m1: _lpVal, m2: _lpVal,
      oepe: _lpFut ? 0 : (metricDaily(ds, loc, date, 'oepe') || 0),
      tpph: _lpFut ? 0 : (metricDaily(ds, loc, date, 'tpph') || 0),
      labor: _lpFut ? 0 : (metricDaily(ds, loc, date, 'laborPct') || 0),
      actualGC: 0, forecastGC: 0, lyGC: 0, noLYData: true, modelUsed: 'launch-plan',
    };
  }
  // ── Enhancement 5: Event Registry ────────────────────────────────────────
  // Hoisted above the ae/ewma/simple short-circuits (was previously only computed in the
  // dow/di pipeline further below) so every model path can see a tagged event — see
  // _trailingModelEvWeight's comment for why ae/ewma/simple get a tapered version instead of
  // the full factor dow/di use unchanged.
  const _dk = dKey(date);
  const _evTag = settings._userEvents && settings._userEvents[loc] && settings._userEvents[loc][_dk];
  const _evFactor = (()=>{
    if(!_evTag || !settings.useEventRegistry) return 0;
    // A canceled/postponed event drops its lift entirely (editability, Notes 46).
    if(_evTag.status==='canceled'||_evTag.status==='postponed') return 0;
    const types = (_evTag.tags&&_evTag.tags.length)
      ? _evTag.tags.map(t=>t.type) : [_evTag.type||'other'];
    // 1) Event Impact Registry (Notes 47) — the MEASURED, curated per-store × event-type value wins.
    // For sports, pick home vs away from the label; other types use the single home_impact.
    const reg = _EVENT_IMPACT[String(loc).replace(/^0+/,'')];
    if(reg){
      const label=String(_evTag.label||'');
      const away=/\(away\)/i.test(label), home=/\(home\)/i.test(label);
      const rv = types.map(t=>{ const e=reg[t]; if(!e)return null;
        if(t==='sports') return _stIsNum(away?e.away:home?e.home:e.home)?(away?e.away:e.home):null;
        return _stIsNum(e.home)?e.home:null; }).filter(v=>v!=null);
      if(rv.length) return Math.max(-0.25, Math.min(0.25, rv.reduce((a,b)=>a+b,0)/rv.length));
    }
    // 2) Learned historical impact (data-driven), when present.
    const factors = (settings._eventFactors && settings._eventFactors[loc]) || {};
    const learned = types.map(t=>factors[t]??0).filter(v=>v!==0);
    if(learned.length) return learned.reduce((a,b)=>a+b,0)/learned.length;
    // 3) Stored expected impact on the event record: manual expectedSalesDelta, else magnitude×daypart weight.
    const stored = (_stIsNum(_evTag.expectedSalesDelta) && _evTag.expectedSalesDelta!==0)
      ? _evTag.expectedSalesDelta
      : (_evTag.impact ? impactWeight(_evTag.impact) : 0);
    return Math.max(-0.25, Math.min(0.25, stored||0));
  })();
  // Age keyed off the first tag type present (realistically there's only ever one tag type
  // per store-day — see the comment on _evEventAgeDays). Full weight for dow/di (unchanged
  // behavior); tapered for ae/ewma/simple, applied at each of their own return points below.
  const _evAgeType = _evTag ? ((_evTag.tags&&_evTag.tags.length) ? _evTag.tags[0].type : (_evTag.type||'other')) : null;
  const _evTrailingWeight = _evTag ? _trailingModelEvWeight(_evEventAgeDays(settings._userEvents, loc, date, _evAgeType)) : 1;
  // Route new models: Adaptive Ensemble and EWMA short-circuit here
  if(_assignedModel==='ae'){
    const _aeFcst=forecastAdaptiveEnsemble(_locLaborRows,ds.laborIdx,loc,date,settings&&settings._aeStrictParams);
    if(_aeFcst&&_aeFcst>0){
      const _aeAct=(()=>{const rr=_locLaborRows.filter(r=>r.date instanceof Date&&Math.abs(r.date-date)<86400000&&!r.isPeriodSummary);return rr.length?rr[0].sales:0;})()||fetchRow(_qsrActIdx(ds),loc,date,'sales');
      // WAS: fetchRow(ds.opsIdx/ds.ctrlIdx) — raw ds.opsRows / ds.ctrlRows, i.e. the
      // MANUAL uploads only. That violates the standing auto-first rule and is why the
      // Forecast Table showed '—' for OEPE / TPPH / Labor% on recent days: those days are
      // served by Glimpse and the DAR, which the raw read cannot see. Not an edge case —
      // all 27 stores are assigned weekly:{model:'ae'}, so this branch IS the universal
      // path for that table. metricDaily resolves auto-first per day, and for laborPct it
      // matters twice over: the chain puts glimpseRows FIRST because pre-2026-08-03
      // ctrlRows.laborPct holds the wrong (Actual, not Punched) value — so the raw read
      // could also show a known-wrong number, not just a blank.
      // The 'simple' branch below already did this correctly.
      const _aeIsFuture=date>sodOf(new Date());
      // #178 item 4: t2/t4/t6 used to be set to the raw dollar forecast (Math.round(_aeFcst))
      // instead of a YOY trend RATIO, which is what every other model path puts there and what
      // ForecastRow's "T2W/T6W — YOY Sales%" cells render as (r.t2*100).toFixed(2)+'%'. Since
      // all 27 stores are assigned model 'ae', this made every store's T2W/T6W column show a
      // ~$10k-40k daily forecast × 100 as a "percent" — a 6-7 digit garbage number the owner
      // reported as "xxxxxxx.xx%". Now computed the same way the engineered/dow path does.
      const _aeT2=getDOWTrend(ds.laborIdx,loc,date,eDt,1,2), _aeT4=getDOWTrend(ds.laborIdx,loc,date,eDt,3,4), _aeT6=getDOWTrend(ds.laborIdx,loc,date,eDt,5,6);
      // Tagged-event adjustment, tapered — see _trailingModelEvWeight. AE's own trailing
      // signals (momentum/LY-adjustment) only partially see a just-started event, so a fresh
      // tag still needs this; an old one is already reflected in _aeFcst on its own.
      const _aeEvFactor = _evFactor * _evTrailingWeight;
      const _aeAdjFcst = _aeFcst * (1 + _aeEvFactor);
      // #178 item 4: `pass` was hardcoded null in this branch, and since all 27 real stores
      // are assigned model 'ae', the Forecast Table's Pass Rate was UNCONDITIONALLY 0% for
      // every store, every range — not a legitimate "this store is missing its forecast"
      // reading, a value that could structurally never be anything else. varPct was already
      // computed correctly here; pass just never got derived from it. Same tolerance formula
      // the engineered/dow path already uses below.
      const _aeVarPct=_aeAct>0?(_aeAct-Math.round(_aeAdjFcst))/_aeAct:null;
      const _aePass=_aeVarPct!==null?Math.abs(_aeVarPct)<=(settings.tolerance||5)/100:null;
      return{date,loc,forecast:Math.round(_aeAdjFcst),ly:lyRaw,lyAdj:Math.round(_aeAdjFcst),t2:_aeT2,t4:_aeT4,t6:_aeT6,_evFactor:_aeEvFactor,actual:_aeAct,goal:_goalOf(lyRaw),varPct:_aeVarPct,pass:_aePass,isFuture:_aeIsFuture,opsFactor:1,wAdj:0,m1:Math.round(_aeAdjFcst),m2:Math.round(_aeAdjFcst),
        oepe:_aeIsFuture?0:(metricDaily(ds,loc,date,'oepe')||0),tpph:_aeIsFuture?0:(metricDaily(ds,loc,date,'tpph')||0),labor:_aeIsFuture?0:(metricDaily(ds,loc,date,'laborPct')||0),
        actualGC:_aeAct>0?(()=>{const rr=_locLaborRows.filter(r=>r.date instanceof Date&&Math.abs(r.date-date)<86400000);return rr.length?rr[0].gc||0:0;})():0,forecastGC:0,lyGC:0,
        noLYData:!lyRaw,modelUsed:'ae'};
    }
  }
  if(_assignedModel==='ewma'){
    const _ewmaFcst=forecastEWMA(_locLaborRows,ds.laborIdx,loc,date);
    if(_ewmaFcst&&_ewmaFcst>0){
      const _ewmaAct=(()=>{const rr=_locLaborRows.filter(r=>r.date instanceof Date&&Math.abs(r.date-date)<86400000&&!r.isPeriodSummary);return rr.length?rr[0].sales:0;})()||fetchRow(_qsrActIdx(ds),loc,date,'sales');
      // Same raw-read bug as the AE branch above — resolved auto-first via metricDaily.
      const _ewmaIsFuture=date>sodOf(new Date());
      // Same fix as the AE branch above — t2/t4/t6 are YOY trend ratios, not dollars.
      const _ewT2=getDOWTrend(ds.laborIdx,loc,date,eDt,1,2), _ewT4=getDOWTrend(ds.laborIdx,loc,date,eDt,3,4), _ewT6=getDOWTrend(ds.laborIdx,loc,date,eDt,5,6);
      // Tagged-event adjustment, tapered — see _trailingModelEvWeight / the AE branch above.
      const _ewEvFactor = _evFactor * _evTrailingWeight;
      const _ewAdjFcst = _ewmaFcst * (1 + _ewEvFactor);
      // Same Pass Rate fix as the AE branch above — pass derived from the already-correct varPct.
      const _ewVarPct=_ewmaAct>0?(_ewmaAct-Math.round(_ewAdjFcst))/_ewmaAct:null;
      const _ewPass=_ewVarPct!==null?Math.abs(_ewVarPct)<=(settings.tolerance||5)/100:null;
      return{date,loc,forecast:Math.round(_ewAdjFcst),ly:lyRaw,lyAdj:Math.round(_ewAdjFcst),t2:_ewT2,t4:_ewT4,t6:_ewT6,_evFactor:_ewEvFactor,actual:_ewmaAct,goal:_goalOf(lyRaw),varPct:_ewVarPct,pass:_ewPass,isFuture:date>sodOf(new Date()),opsFactor:1,wAdj:0,m1:Math.round(_ewAdjFcst),m2:Math.round(_ewAdjFcst),
        oepe:_ewmaIsFuture?0:(metricDaily(ds,loc,date,'oepe')||0),tpph:_ewmaIsFuture?0:(metricDaily(ds,loc,date,'tpph')||0),labor:_ewmaIsFuture?0:(metricDaily(ds,loc,date,'laborPct')||0),
        actualGC:0,forecastGC:0,lyGC:0,noLYData:false,modelUsed:'ewma'};
    }
  }
  if(_assignedModel==='simple'){
    // Anchor to the START of `date` (not eDt) so the trailing windows never see the
    // day being forecast or anything after it — strictly leak-free, so any backtest
    // win is credible. windowRate normalizes rows to midnight, so a start-of-day
    // bound cleanly excludes the target day itself.
    const _sf=forecastSimple(_locLaborRows,loc,date,sodOf(date));
    if(_sf&&_sf.sales>0){
      // Tagged-event adjustment, tapered — see _trailingModelEvWeight / the AE branch above.
      // Sales only, matching the dow/di path (which doesn't apply _evFactor to forecastGC either).
      const _spEvFactor = _evFactor * _evTrailingWeight;
      const _sVal=Math.round(_sf.sales*(1+_spEvFactor));
      const _sFut=date>sodOf(new Date());
      const _sAct=!_sFut?((()=>{const rr=_locLaborRows.filter(r=>r.date instanceof Date&&Math.abs(r.date-date)<86400000&&!r.isPeriodSummary);return rr.length?rr[0].sales:0;})()||fetchRow(_qsrActIdx(ds),loc,date,'sales')):0;
      const _sActGC=!_sFut?((()=>{const rr=_locLaborRows.filter(r=>r.date instanceof Date&&Math.abs(r.date-date)<86400000&&!r.isPeriodSummary);return rr.length?(rr[0].gc||0):0;})()||fetchRow(_qsrActIdx(ds),loc,date,'gc')):0;
      // Same fix as the AE/EWMA branches above — t2/t4/t6 are YOY trend ratios, not dollars.
      const _spT2=getDOWTrend(ds.laborIdx,loc,date,eDt,1,2), _spT4=getDOWTrend(ds.laborIdx,loc,date,eDt,3,4), _spT6=getDOWTrend(ds.laborIdx,loc,date,eDt,5,6);
      // Same Pass Rate fix as the AE/EWMA branches above — pass derived from the already-correct varPct.
      const _spVarPct=_sAct>0?(_sAct-_sVal)/_sAct:null;
      const _spPass=_spVarPct!==null?Math.abs(_spVarPct)<=(settings.tolerance||5)/100:null;
      return{date,loc,forecast:_sVal,ly:lyRaw,lyAdj:_sVal,t2:_spT2,t4:_spT4,t6:_spT6,_evFactor:_spEvFactor,
        actual:_sAct,goal:_goalOf(lyRaw),varPct:_spVarPct,pass:_spPass,isFuture:_sFut,opsFactor:1,wAdj:0,m1:_sVal,m2:_sVal,
        oepe:_sFut?0:(metricDaily(ds,loc,date,'oepe')||0),tpph:_sFut?0:(metricDaily(ds,loc,date,'tpph')||0),labor:_sFut?0:(metricDaily(ds,loc,date,'laborPct')||0),
        actualGC:_sActGC,forecastGC:Math.round(_sf.gc||0),lyGC:0,noLYData:!lyRaw,modelUsed:'simple'};
    }
    // thin history → fall through to the engineered dow pipeline below
  }
  const cal = (_assignedModel==='di'&&_hasDI) ? settings.dialedIn[loc] : null;
  const tw = cal ? {t2:cal.t2,t4:cal.t4||.25,t6:cal.t6} : (settings.trendWeights||{t2:.5,t4:.3,t6:.2});
  const calOpsMult = cal ? cal.opsMult : 1.0;
  const calLyW = (cal&&cal.lyW!=null) ? cal.lyW : 1.0; // LY weight from calibration
  // lyW blend: when calibration lyW < 1.0, blend store LY with district DOW avg
  // This helps distorted-LY stores (new openings, grand-opening year) forecast more accurately
  let lyAdj=lyRaw;
  if(calLyW<0.999&&lyRaw>0) {
    const _dow=date.getDay();
    const _locOrg = getStoreOrg(loc); // segment by org: FL stores compare to FL, OK to OK
    const _distRows=(ds.laborRows||[]).filter(r=>r.loc!==loc&&r.sales>0&&dowOf(r.date)===_dow
      &&Math.abs(r.date.getTime()-addD(date,-364).getTime())<30*864e5
      &&getStoreOrg(r.loc)===_locOrg); // same org only
    const _distAvg=_distRows.length?_distRows.reduce((a,r)=>a+r.sales,0)/_distRows.length:lyRaw;
    lyAdj=lyRaw*calLyW+_distAvg*(1-calLyW);
  }
  const t2=getDOWTrend(ds.laborIdx,loc,date,eDt,1,2);
  const t4=getDOWTrend(ds.laborIdx,loc,date,eDt,3,4);
  const t6=getDOWTrend(ds.laborIdx,loc,date,eDt,5,6);
  const _globalTrend=t2*tw.t2+t4*tw.t4+t6*tw.t6;
  // DOW-specific trend: how is THIS weekday performing YOY vs all-DOW trend?
  const _dowSpecific=getDOWSpecificTrend(ds.laborIdx,loc,date.getDay(),eDt,settings.weeksBack||6);
  // Blend: 65% global trend, 35% DOW-specific (when available)
  const wTrend=_dowSpecific!==null ? _globalTrend*0.65+_dowSpecific*0.35 : _globalTrend;
  const p=compute6wk(loc,ds,settings.weeksBack||6);
  // calOpsMult scales the ops INFLUENCE (deviation from 1.0), not the raw factor.
  // opsMult=1.0 = normal, 0.5 = half the ops signal, 0.0 = ignore ops entirely.
  // Ops normalization: use store own historical avg as baseline if enabled
  const _opsNormEnabled = settings.opsNorm && (settings.opsNormByStore?.[loc]!==false);
  const _opsNorm = _opsNormEnabled ? {
    oepe: p.oepe||0,   // current 6-wk rolling avg IS the store normal
    tpph: p.tpph||0,
    kvst: p.kvst||0,
  } : null;
  const _rawOpsF=calcOpsF(p,t,settings.opsMults||DEF_SETTINGS.opsMults,_opsNorm);
  const opsFactor=1+((_rawOpsF-1)*calOpsMult);
  const wAdj=getWxAdj(ds.weatherIdx,loc,date,settings.weather,settings.useEmpirical?settings.empiricalWeather:null,ds);
  const m1=lyAdj*(1+t6);const m2=lyAdj*(1+wTrend);
  // Holiday awareness: adjust LY baseline for known holiday impact
  const holidayInfo = isHoliday(date);
  // Only apply LY holiday correction if the -364 date was actually used as LY baseline.
  // If fetchLY excluded it (it was a holiday), no correction needed — LY is already clean.
  const _ly364 = addD(date,-364);
  const _ly364IsHoliday = !!isHoliday(_ly364);
  const _ly364IsExcluded = _ly364IsHoliday || !!(settings._userEvents&&settings._userEvents[loc]&&settings._userEvents[loc][dKey(_ly364)]);
  const lyHolidayInfo = _ly364IsExcluded ? null : isHoliday(_ly364);
  // If TODAY is a holiday but LY was not (or different holiday), adjust LY up
  // If LY was a holiday but today is not, adjust LY down
  const holidayLyAdj = (()=>{
    if(holidayInfo&&lyHolidayInfo&&holidayInfo.label===lyHolidayInfo.label) return 1; // same holiday, use LY as-is
    if(holidayInfo&&!lyHolidayInfo) return getHolidayAdj(date,loc,_locLaborRows); // today is holiday, LY was not → expect lower
    if(!holidayInfo&&lyHolidayInfo) return 1/Math.max(0.3,getHolidayAdj(addD(date,-364),loc,_locLaborRows)); // LY was holiday, today not → LY underestimates
    return 1;
  })();
  const lyAdjH = lyAdj * holidayLyAdj;
  // ── Enhancement 1: Trend Integration ─────────────────────────────────────
  // wTrend is already computed above (65% global + 35% DOW-specific)
  const _trendAlpha = settings.trendAlpha ?? 0.30;
  const trendFactor = settings.useTrendInForecast !== false
    ? Math.max(-0.15, Math.min(0.15, wTrend * _trendAlpha)) // clamped ±15%
    : 0;
  // _evFactor (and _evTag/_dk) is now computed once, above, before the ae/ewma/simple
  // short-circuits — this dow/di path keeps using the same full (untapered) value it always
  // has; only ae/ewma/simple get the tapered version, applied at their own return points.
  // ── Enhanced primary forecast (LY model + trend + event adj) ─────────────
  const _plusFrac = effectivePlusUp(loc,settings)/100;
  const forecast = Math.round(lyAdjH * opsFactor * (1+wAdj) * (1+trendFactor) * (1+_evFactor) * (1+_plusFrac));
  const isHol = !!holidayInfo;
  if(settings.cascade&&isFuture&&casc)casc[loc+'_'+dKey(date)]=forecast;
  // Auto-first: manual Operations Report actual, else the auto-synced DAR (qsrActSummaryRows).
  const actual=!isFuture?(fetchRow(ds.laborIdx,loc,date,'sales')||fetchRow(_qsrActIdx(ds),loc,date,'sales')):0;
  const goal=lyAdjH*(1+(t.tGrowth||.05));
  const varPct=actual>0?(actual-forecast)/actual:null;
  const pass=varPct!==null?Math.abs(varPct)<=(settings.tolerance||5)/100:null;
  const oRow=fetchRow(ds.opsIdx,loc,date);const cRow=fetchRow(ds.ctrlIdx,loc,date);
  // Daypart forecast (from 3 Peaks data if available)
  const dayparts=isFuture?forecastDayparts(loc,date,ds,settings):null;
  const actualGC = !isFuture ? (fetchRow(ds.laborIdx, loc, date, 'gc')||fetchRow(_qsrActIdx(ds),loc,date,'gc')) : 0;
  const lyGC     = fetchRow(ds.laborIdx, loc, addD(date,-364), 'gc') || fetchRow(_qsrActIdx(ds),loc,addD(date,-364),'gc') || 0;
  const forecastGC = lyGC>0 ? Math.round(lyGC*(1+(t.tGrowth||.05))*(opsFactor)) : 0;
  // ── Enhancement 2: GC × AvgCheck parallel model (must be after lyGC is declared) ─
  const lyAvgCheck = lyGC > 0 && lyRaw > 0 ? lyRaw / lyGC : 0;
  const lyAdjHgc   = lyGC * holidayLyAdj;
  const forecastGC_gca = lyAdjHgc * opsFactor * (1+wAdj) * (1+trendFactor) * (1+_evFactor);
  const forecastGCA = lyAvgCheck > 0
    ? Math.round(forecastGC_gca * lyAvgCheck * (1+_plusFrac)) : 0;
  return{date,loc,ly:lyRaw,lyAdj,t2,t4,t6,wTrend,m1,m2,forecast,forecastGCA,trendFactor,_evFactor,actual,goal,varPct,pass,isFuture,noLYData,
    opsFactor,wAdj,actualGC,lyGC,forecastGC,
    isHol, holiday:holidayInfo, holidayLyAdj,
    // Auto-first per-day metrics (manual Ops/Controls → Daily Glimpse) via the shared resolver,
    // so completed days that only have auto-synced data still populate. Fall back to the 6-wk avg.
    oepe:isFuture?p.oepe:(metricDaily(ds,loc,date,'oepe')||p.oepe),
    tpph:isFuture?p.tpph:(metricDaily(ds,loc,date,'tpph')||p.tpph),
    labor:isFuture?p.laborPct:(metricDaily(ds,loc,date,'laborPct')||p.laborPct),
    dayparts,
    // modelUsed (v4.195): distinguishes a genuinely DI-calibrated result (cal
    // was non-null, real settings.dialedIn[loc] data applied) from a silent
    // fallback to default trend weights when DI was requested/assigned but
    // this store has no calibration on file. Previously only the AE/EWMA
    // short-circuit branches set this; the main pipeline never did.
    modelUsed: cal ? 'di' : (_assignedModel==='dow'||_assignedModel==='simple' ? 'dow' : _assignedModel)};
}

// Dispatch #41 step 4 — give a red Model Health grade a real consequence. When the canonical
// modelHealthScore() grades a store red ("Needs Attention"), the store's DISPLAYED default
// projection switches to the Simple/trailing model (T3M/T6W/T3W median — forecastDay's 'simple'
// branch) instead of whatever engineered model triggered the red grade. That family is the one
// this project's own v4.483 27-store backtest already proved most robust, so it's the reasonable
// fallback rather than continuing to display a model the health score just said not to trust.
// Scoped deliberately narrow: this only picks forecastDay's forceModel argument for the two range
// functions below, which is what feeds the store's displayed projection (store-analytics.js's
// StoreDash). It does NOT touch getModelAssignment, saveModelOverride, or any Model Assignment
// backtest/override data — a caller that explicitly passes its own forceModel (the Forecast
// Accuracy Report, backtest.js) bypasses getModelAssignment entirely already and never reaches
// this gate. Computed ONCE per range call (not per day) — modelHealthScore does an O(rows) scan,
// and a display range can cover many days.
function _redGateForceModel(loc,ds,settings){
  const h=modelHealthScore(loc,ds,settings);
  return (h&&h.grade&&h.grade.label==='Needs Attention')?'simple':undefined;
}

function forecastRange(loc,startDate,endDate,ds,settings){
  const t=ds?ds.targets[loc]||DEFAULT_TARGETS[loc]||{}:DEFAULT_TARGETS[loc]||{};
  const casc={};const days=[];
  const _fm=_redGateForceModel(loc,ds,settings);
  let cur=new Date(startDate);
  while(cur<=endDate){days.push(forecastDay(loc,new Date(cur),ds,settings,casc,t,undefined,_fm));cur=addD(cur,1);}
  return days;
}

// Async chunked version — used by StoreDash to prevent UI freeze on long ranges
function forecastRangeAsync(loc,startDate,endDate,ds,settings,onChunk,onDone){
  const t=ds?ds.targets[loc]||DEFAULT_TARGETS[loc]||{}:DEFAULT_TARGETS[loc]||{};
  const casc={};
  const _fm=_redGateForceModel(loc,ds,settings);
  const dates=[];let cur=new Date(startDate);
  while(cur<=endDate){dates.push(new Date(cur));cur=addD(cur,1);}
  const CHUNK=14;let i=0;const results=[];
  function processChunk(){
    const end=Math.min(i+CHUNK,dates.length);
    for(;i<end;i++) results.push(forecastDay(loc,dates[i],ds,settings,casc,t,undefined,_fm));
    if(onChunk) onChunk([...results],i,dates.length);
    if(i<dates.length) setTimeout(processChunk,0);
    else if(onDone) onDone(results);
  }
  setTimeout(processChunk,0);
}


// Per-store plus-up: store override > patch override > global
function effectivePlusUp(loc, settings) {
  const byStore = settings.plusUpByStore||{};
  if(byStore[loc]!=null) return byStore[loc];
  // Check patch override
  const byPatch = settings.plusUpByPatch||{};
  const patches = settings.supervisorGroups||{};
  for(const [patch,ids] of Object.entries(patches)) {
    if(ids.includes(loc)&&byPatch[patch]!=null) return byPatch[patch];
  }
  return settings.plusUp||0;
}

// MULTI-MODEL FORECAST ENGINE
// 4 independent projection methods + ensemble
function forecastModels(loc, date, ds, settings) {
  const t = ds ? ds.targets[loc]||DEFAULT_TARGETS[loc]||{} : DEFAULT_TARGETS[loc]||{};
  const casc = {};

  // Model 1: Composite (current engine — LY + trend + ops + weather)
  const m1 = forecastDay(loc, date, ds, settings, casc, t);

  // Model 2: Pure Trend (LY + T2/T6 blend, no ops factor, no weather)
  const pureTrend = (() => {
    const {lyAdj,t2,t6,wTrend} = m1;
    const fc = lyAdj*(1+wTrend)*(1+effectivePlusUp(loc,settings)/100);
    return {forecast:Math.round(fc), name:'Trend-Only', key:'m2'};
  })();

  // Model 3: Momentum (exponential decay weighting of last 8 weeks actual)
  const momentum = (() => {
    if(!ds||!ds.laborRows) return null;
    const dow = date.getDay();
    const recent = ds.laborRows
      .filter(r=>r.loc===loc&&r.date<date&&r.date.getDay()===dow&&r.sales>0&&!r.isPeriodSummary)
      .sort((a,b)=>b.date-a.date).slice(0,8);
    if(recent.length<3) return null;
    let wtSum=0, wSum=0;
    recent.forEach((r,i)=>{const w=Math.exp(-0.3*i);wtSum+=r.sales*w;wSum+=w;});
    const fc = (wtSum/wSum)*(1+effectivePlusUp(loc,settings)/100);
    return {forecast:Math.round(fc), name:'Momentum', key:'m3'};
  })();

  // Model 4: DOW Linear Regression (12-week same-DOW trendline)
  const regression = (() => {
    if(!ds||!ds.laborRows) return null;
    const dow = date.getDay();
    const pts = ds.laborRows
      .filter(r=>r.loc===loc&&r.date<date&&r.date.getDay()===dow&&r.sales>0&&!r.isPeriodSummary)
      .sort((a,b)=>a.date-b.date).slice(-12);
    if(pts.length<5) return null;
    const n=pts.length;
    const xs=pts.map((_,i)=>i), ys=pts.map(r=>r.sales);
    const xMean=xs.reduce((a,v)=>a+v,0)/n, yMean=ys.reduce((a,v)=>a+v,0)/n;
    const slope=xs.reduce((a,x,i)=>a+(x-xMean)*(ys[i]-yMean),0)/xs.reduce((a,x)=>a+(x-xMean)**2,0);
    const intcpt=yMean-slope*xMean;
    const fc=(intcpt+slope*n)*(1+effectivePlusUp(loc,settings)/100);
    return {forecast:Math.round(Math.max(fc,0)), name:'Regression', key:'m4'};
  })();

  // Ensemble: equal-weight blend of available models
  const avail = [m1.forecast, pureTrend.forecast, momentum?.forecast, regression?.forecast].filter(Boolean);
  const ensemble = {forecast:Math.round(avail.reduce((a,v)=>a+v,0)/avail.length), name:'Ensemble', key:'ens'};

  return {composite:m1, pureTrend, momentum, regression, ensemble,
    allModels:[
      {key:'m1',name:'Composite',forecast:m1.forecast,desc:'LY + trend + ops + weather'},
      {key:'m2',name:'Trend-Only',forecast:pureTrend.forecast,desc:'LY anchor + weighted trend, no ops/weather'},
      {key:'m3',name:'Momentum',forecast:momentum?.forecast,desc:'Exponential decay weighting of last 8 same-DOW actuals'},
      {key:'m4',name:'Regression',forecast:regression?.forecast,desc:'12-week same-DOW linear regression'},
      {key:'ens',name:'Ensemble',forecast:ensemble.forecast,desc:'Equal blend of all available models'},
    ]};
}

// Track model accuracy to find most reliable per store
function modelAccuracy(loc, ds, settings, weeksBack) {
  if(!ds||!ds.laborRows) return {};
  const wb = weeksBack||(settings&&settings.weeksBack)||6;
  const cut = new Date(Date.now()-wb*7*86400000);
  const actuals = ds.laborRows.filter(r=>r.loc===loc&&r.date>=cut&&r.sales>0);
  if(actuals.length<5) return {};

  const scores = {m1:[],m2:[],m3:[],m4:[],ens:[]};
  for(const row of actuals) {
    const models = forecastModels(loc, row.date, ds, settings);
    for(const m of models.allModels) {
      if(m.forecast>0) {
        const err = Math.abs(row.sales - m.forecast)/row.sales*100;
        scores[m.key].push(err);
      }
    }
  }

  const result = {};
  for(const [k,errs] of Object.entries(scores)) {
    if(errs.length>=3) {
      const mape = errs.reduce((a,v)=>a+v,0)/errs.length;
      result[k] = {mape:+mape.toFixed(1), n:errs.length, accuracy:+Math.max(0,100-mape).toFixed(1)};
    }
  }
  const best = Object.entries(result).sort((a,b)=>a[1].mape-b[1].mape)[0];
  result._best = best?best[0]:null;
  return result;
}

// ── DI Use/No-Use Recommendation Engine ──────────────────────────────────────
// Returns {label, color, bg, border, detail} based on per-store MAPE profile
function getDIRecommendation(r) {
  if(!r||r.mape==null) return null;
  const m6=r.mape6w??r.mape, m4=r.mape4w??m6, m2=r.mape2w??m4, m1=r.mape1w;
  const improving = m2<m4 && m4<=m6+0.5;           // getting better toward present
  const degrading  = m2>m4+0.8 || m2>m6+1.5;        // getting worse recently
  const veryLow    = Math.min(m6,m4,m2) < 5.5;
  const highErr    = Math.min(m6,m4,m2) > 11;
  const stable     = Math.abs(m6-m2) < 1.2;

  if(veryLow && !degrading)
    return{label:'🏆 Excellent',color:'#10b981',bg:'rgba(16,185,129,.12)',border:'rgba(16,185,129,.35)',
      detail:'Sub-5.5% recent MAPE — best-in-class accuracy. Strong DI benefit.'};
  if(improving && !highErr)
    return{label:'✅ Improving',color:'#34d399',bg:'rgba(52,211,153,.1)',border:'rgba(52,211,153,.3)',
      detail:'Recent MAPE trending down ('+m6.toFixed(2)+'%→'+m4.toFixed(2)+'%→'+m2.toFixed(2)+'%). DI is working well.'};
  if(stable && !highErr && !degrading)
    return{label:'→ Stable',color:'#60a5fa',bg:'rgba(96,165,250,.1)',border:'rgba(96,165,250,.3)',
      detail:'MAPE consistent across windows ('+m6.toFixed(2)+'%/'+m4.toFixed(2)+'%/'+m2.toFixed(2)+'%). DI holding steady.'};
  if(degrading && !highErr)
    return{label:'⚠ Recalibrate',color:'#f59e0b',bg:'rgba(245,158,11,.1)',border:'rgba(245,158,11,.3)',
      detail:'Recent 2W MAPE ('+m2.toFixed(2)+'%) higher than 6W ('+m6.toFixed(2)+'%). Re-run calibration with latest data.'};
  if(highErr)
    return{label:'❌ Review',color:'var(--crit)',bg:'rgba(244,63,94,.1)',border:'rgba(244,63,94,.3)',
      detail:'MAPE above 11% in recent windows. Consider using default params or investigate anomalies.'};
  return{label:'→ Stable',color:'#60a5fa',bg:'rgba(96,165,250,.1)',border:'rgba(96,165,250,.3)',
    detail:'MAPE consistent. DI calibration reasonable.'};
}

// MODEL HEALTH SCORE — 0-100 per store — THIN ADAPTER (dispatch #41, 2026-08-25)
// Tells you instantly: "Can I trust this forecast?"
// Green ≥75 = Trust it   Yellow 50-74 = Use with judgment   Red <50 = Needs work
//
// Used to be a second, independently-maintained scorer with its own copy of the whole 30/25/25/20
// rubric — same weights and cutoffs as modelHealthScore above by coincidence of a shared origin
// commit, but its own component floors that could never reach true 0 (Calibration/Freshness/MAPE/
// Sample floored at 6/3/5/3 respectively once a store had ever had any data — see modelHealthScore's
// header for the measured consequence) and a mirror-image dead-field bug on the settings
// fingerprint (compared against settings._settingsFp — also never assigned anywhere in the app, so
// this function's fingerprint penalty never fired, opposite of modelHealthScore's always-fired bug).
// Reconciled by calling the canonical modelHealthScore(loc, ds, settings) and reshaping its result
// into this function's existing return shape. Zero behavior difference for at-a-glance.js/
// store-analytics.js (unchanged, canonical directly); model-health-badge.js's ModelHealthBadge now
// renders the SAME numbers store-analytics.js's confidence bar does, on the same screen.
// Argument order (loc, settings, ds) is kept exactly as before — NOT (loc, ds, settings) like the
// canonical function — because that was always the swapped order every real call site already uses;
// changing it here would just move the "which order" foot-gun into this file instead of removing it.
function computeModelHealth(loc, settings, ds) {
  const h = modelHealthScore(loc, ds, settings);
  if (h.newStore) {
    // longRunCalibrated (2026-09-06): an established store where DI specifically isn't viable
    // (Elgin/Mossy Head/Tishomingo) is a different claim than a genuinely new location — forward
    // modelHealthScore's own corrected label/note instead of this wrapper's hardcoded 'New Store'
    // string, which previously overrode it unconditionally for every recentOnly store alike.
    return {
      total: null, grade: 'blue', gradeLabel: h.grade.label, gradeColor: '#64748b',
      components: { cal: null, fresh: null, mape: null, sample: null },
      notes: { cal: h.longRunCalibrated ? 'DI not viable — AE/DOW/LY calibrated' : 'New/ramp-up store', fresh: '', mape: '', sample: '' },
      statement: h.statement, newStore: true, longRunCalibrated: !!h.longRunCalibrated,
    };
  }
  // reasons[].cat → this function's fixed 4 keys. modelHealthScore's reasons array is the single
  // source of both the points and the human-readable note per component.
  const byCat = {};
  for (const r of h.reasons) byCat[r.cat] = r;
  const grade = h.grade.label === 'Healthy' ? 'green' : h.grade.label === 'Fair' ? 'yellow' : 'red';
  const gradeLabel = h.grade.label === 'Healthy' ? 'Trusted' : h.grade.label === 'Fair' ? 'Caution' : 'Needs Attention';
  const gradeColor = grade === 'green' ? '#10b981' : grade === 'yellow' ? 'var(--warn)' : 'var(--crit)';
  return {
    total: h.score, grade, gradeLabel, gradeColor,
    components: {
      cal: byCat['Calibration'] ? byCat['Calibration'].pts : 0,
      fresh: byCat['Data Freshness'] ? byCat['Data Freshness'].pts : 0,
      mape: byCat['Accuracy'] ? byCat['Accuracy'].pts : 0,
      sample: byCat['Sample Size'] ? byCat['Sample Size'].pts : 0,
    },
    notes: {
      cal: byCat['Calibration'] ? byCat['Calibration'].msg : '',
      fresh: byCat['Data Freshness'] ? byCat['Data Freshness'].msg : '',
      mape: byCat['Accuracy'] ? byCat['Accuracy'].msg : '',
      sample: byCat['Sample Size'] ? byCat['Sample Size'].msg : '',
    },
    statement: h.statement,
  };
}

export {
  _masgnInvalidate, getModelAssignment, saveModelOverride,
  computeMAPEDrift, computeStoreSigma, getStoreOrg,
  getWeatherNote, isWeatherExtreme, calibrateWeather,
  forecastEWMA, forecastAdaptiveDI, forecastAdaptiveEnsemble,
  _wxCache, getForecastWeather,
  fetchRow, fetchWx, fetchLY, fetchLYDate, fetchGC, storeAgeDays, fetchRampSales,
  getDOWTrend, getDOWSpecificTrend,
  forecastDayparts, getWxAdj, modelHealthScore, compute6wk, calcOpsF,
  forecastDay, forecastRange, forecastRangeAsync,
  effectivePlusUp, forecastModels, modelAccuracy,
  getDIRecommendation, computeModelHealth,
  bLocIdx, locRows, gcCrossCheck, KnowledgeBasePanel, InfoIcon,
  fetchRecentActual,
};
