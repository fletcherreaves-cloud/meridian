// @ts-nocheck
import * as React from 'react';
import { addD, addDR, dKey, dowOf, sodOf, eodOf, setWeekStartDay, mwStart, nwStart } from '../utils/date.js';

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
  (laborRows||[]).forEach(r=>{if(String(r.loc)===String(loc)&&r.sales>0)byDate[dKey(r.date)]=r.sales;});
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

// ── Adaptive DI: EWMA-windowed DI blend with per-store calibration ────────────
function forecastAdaptiveDI(laborRows, laborIdx, loc, date, params){
  const p = params || AE_DI_PARAMS[String(loc)] || {w2:0.4,w4:0.35,w6:0.25,alpha:0.20};
  const {w2,w4,w6,alpha} = p;
  const dow = date.getDay();
  const byDate = {};
  (laborRows||[]).forEach(r=>{if(String(r.loc)===String(loc)&&r.sales>0)byDate[dKey(r.date)]=r.sales;});

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
function forecastAdaptiveEnsemble(laborRows, laborIdx, loc, date){
  const str = String(loc);
  const isWeekend = (date.getDay()===0||date.getDay()===6);
  const byDate = {};
  (laborRows||[]).forEach(r=>{if(String(r.loc)===str&&r.sales>0)byDate[dKey(r.date)]=r.sales;});

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
  // Read recalibrated DI params if available (auto-updated on file load)
  const _storedParams=(()=>{try{const s=JSON.parse(localStorage.getItem('mf_ae_params')||'{}');return s.params||{};}catch{return{};}})();
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

function fetchRow(idx,loc,date,field){
  const rows=idx[loc+'_'+dKey(date)];
  if(!rows||!rows.length)return field?0:null;
  if(!field) return rows[0];
  // If multiple rows exist (e.g. both Ops Report and Labor Analysis loaded),
  // prefer the row with the highest value for the requested field to avoid
  // zero-sales Labor Analysis rows masking valid Ops Report data.
  if(rows.length===1) return rows[0][field]||0;
  const best = rows.reduce((b,r)=>(r[field]||0)>(b[field]||0)?r:b, rows[0]);
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

function avg6(rows,loc,field,wb){
  const cut=new Date(Date.now()-wb*7*86400000);
  let sum=0,cnt=0;
  for(const r of rows){if(r.loc!==loc||r.date<cut)continue;const v=r[field];if(typeof v==='number'&&v!==0){sum+=v;cnt++;}}
  return cnt?sum/cnt:0;
}

// SECTION 5: ANALYTICS ENGINE
function fetchLY(lIdx,lRows,loc,date,userEvents){
  // Returns the ACTUAL historical sales for the same DOW, ~52 weeks back.
  // Priority chain: -364 (same DOW, exactly 52wk), then -357/-371/-378/-350 as fallbacks.
  // NO blending across multiple dates — LY must match real data the user can verify.
  // NO outlier dampening — that was creating synthetic values that didn't correspond
  //   to any real sales day, breaking user trust and distorting forecasts.
  // If a candidate is a tagged event or holiday, skip it and try the next.
  const tDow = dowOf(date);
  const candidates = [-364,-357,-371,-378,-350,-385,-343];
  const isExcluded = dt => {
    if(isHoliday(dt)) return true;
    if(!userEvents) return false;
    const dk = dKey(dt);
    return !!(userEvents[loc]&&userEvents[loc][dk]);
  };
  for(const off of candidates){
    const dt = addD(date, off);
    if(dowOf(dt)!==tDow) continue;          // must be same day of week
    if(isExcluded(dt)) continue;             // skip holidays/events
    const v = fetchRow(lIdx, loc, dt, 'sales');
    if(v>0) return v;                        // first clean actual value wins
  }
  return 0;
}

// Get how many days of history a store has
// fetchLYDate — returns the actual calendar date used for the LY lookup (for UI display).
// Mirrors fetchLY's priority chain exactly so the displayed date matches the value shown.
function fetchLYDate(lIdx, loc, date, userEvents){
  const tDow=dowOf(date);
  const candidates=[-364,-357,-371,-378,-350,-385,-343];
  const isExcluded=dt=>{
    if(isHoliday(dt))return true;
    if(!userEvents)return false;
    const dk=dKey(dt);
    return !!(userEvents[loc]&&userEvents[loc][dk]);
  };
  for(const off of candidates){
    const dt=addD(date,off);
    if(dowOf(dt)!==tDow)continue;
    if(isExcluded(dt))continue;
    const v=fetchRow(lIdx,loc,dt,'sales');
    if(v>0)return dt;
  }
  return addD(date,-364); // default to 52-week prior if no data
}

// fetchGC — actual historical guest count for same DOW, 52 weeks back (mirrors fetchLY fix)
function fetchGC(lIdx,lRows,loc,date,userEvents){
  const tDow=dowOf(date);
  const candidates=[-364,-357,-371,-378,-350,-385,-343];
  const isExcluded=dt=>{
    if(isHoliday(dt))return true;
    if(!userEvents)return false;
    const dk=dKey(dt);
    return !!(userEvents[loc]&&userEvents[loc][dk]);
  };
  for(const off of candidates){
    const dt=addD(date,off);
    if(dowOf(dt)!==tDow)continue;
    if(isExcluded(dt))continue;
    const v=fetchRow(lIdx,loc,dt,'gc')||fetchRow(lIdx,loc,dt,'guestCount')||0;
    if(v>0) return v;
  }
  return 0;
}

// gcCrossCheck — validate sales forecast against GC forecast
// Returns {gcForecast, impliedCheck, normCheck, deviation, flag}
// flag: null | 'watch' (>10%) | 'alert' (>20%)
function gcCrossCheck(loc,date,ds,settings,salesForecast){
  const userEvents=settings._userEvents||{};
  const gcLY=fetchGC(ds.laborIdx,ds.laborRows,loc,date,userEvents);
  if(!gcLY||gcLY<1)return null;

  // GC trend — use same trend signal as sales
  const tDow=dowOf(date);
  const today=new Date();
  const eDt=ds.lastActual[loc]||today;
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
      if(cur>0&&ly>0) points.push((cur-ly)/ly);
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
      if(cur>0&&ly>0) points.push((cur-ly)/ly);
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
function modelHealthScore(loc, ds, settings) {
  // New/ramp stores (recentOnly flag + no DI calibration yet) are exempt from
  // health scoring — they cannot satisfy calibration or MAPE requirements by
  // design. Return a neutral "Not applicable" grade so they don't pollute
  // district health dashboards.
  const _masgn = DEFAULT_MODEL_ASSIGNMENTS[loc];
  if(_masgn&&_masgn.recentOnly&&!(settings.dialedIn&&settings.dialedIn[loc])){
    return{score:null,grade:{label:'New Store',color:'#64748b',emoji:'🔵'},
      reasons:[{cat:'Status',pts:null,max:null,msg:'New/ramp-up store — DI calibration not yet applicable'}],
      statement:'New or recently opened store. Health scoring not applicable until calibration window (typically 6 months of history).',
      samples:0,dataDaysOld:999,newStore:true};
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
    if(di.settingsFp && di.settingsFp !== settings._fp) cp=Math.max(0,cp-10);
    score+=cp;
    reasons.push({cat:'Calibration',pts:cp,max:30,
      msg:cp===30?'Current and matched':dsc>30?'Stale ('+dsc+'d) — re-run Dialed-In':'Settings changed — re-run recommended'});
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
  if(di&&(di.mape6w!=null||di.mape4w!=null||di.mape!=null)){
    // Prefer 6W MAPE (most operationally relevant), fall back to 4W then full
    const m = di.mape6w!=null ? di.mape6w : di.mape4w!=null ? di.mape4w : di.mape;
    const m2=di.mape2w; const m6=di.mape6w;
    let mp=m<5?25:m<8?20:m<12?13:m<18?6:0;
    if(m2!=null&&m6!=null&&m2>m6+5) mp=Math.max(0,mp-8);
    score+=mp;
    const drift=m2!=null&&m6!=null&&m2>m6+5?' (⚠ drifting)':'';
    const mLabel=di.mape6w!=null?'6W MAPE':di.mape4w!=null?'4W MAPE':'Full MAPE';
    reasons.push({cat:'Accuracy',pts:mp,max:25,msg:mp>=20?m.toFixed(1)+'% '+mLabel+drift:m.toFixed(1)+'% '+mLabel+' — recalibrate'+drift});
  } else {
    reasons.push({cat:'Accuracy',pts:0,max:25,msg:'Run Dialed-In to measure accuracy'});
  }
  // 4. SAMPLE SIZE (20 pts)
  const samp=di&&di.samples!=null?di.samples:rows.length;
  const sp=samp>=300?20:samp>=150?15:samp>=50?10:samp>=20?4:0;
  score+=sp;
  reasons.push({cat:'Sample Size',pts:sp,max:20,msg:samp+' data points'+(sp>=15?' (strong)':sp>=8?' (adequate)':' (limited)')});
  const grade=score>=75?{label:'Healthy',color:'#10b981',emoji:'🟢'}:
              score>=50?{label:'Fair',color:'#f59e0b',emoji:'🟡'}:
                        {label:'Needs Attention',color:'#ef4444',emoji:'🔴'};
  const top=reasons.filter(r=>r.pts<r.max*0.5).sort((a,b)=>b.max-a.max)[0];
  const statement=score>=75?'Calibrated and current — projections can be trusted for scheduling.':
    score>=50?'Usable with caution. '+((top&&top.msg)||''):
    'Needs attention before committing projections. '+((top&&top.msg)||'');
  return{score,grade,reasons,statement,samples:samp,dataDaysOld:daysOld};
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
  const r={oepe:avg6(opsL,loc,'oepe',wb),kvst:avg6(opsL,loc,'kvst',wb),
    park:avg6(opsL,loc,'park',wb),r2p:avg6(opsL,loc,'r2p',wb),
    tpph:avg6(ctrlL,loc,'tpph',wb)||avg6(laborL,loc,'tpph',wb),
    spph:avg6(ctrlL,loc,'spph',wb),laborPct:avg6(ctrlL,loc,'laborPct',wb)||avg6(laborL,loc,'laborPct',wb),
    actVsNeed:avg6(ctrlL,loc,'actVsNeed',wb),otHrs:avg6(ctrlL,loc,'otHrs',wb),
    cashOSPct:avg6(ctrlL,loc,'cashOSPct',wb),tRedAPct:avg6(ctrlL,loc,'tRedAPct',wb),
    tRedBPct:avg6(ctrlL,loc,'tRedBPct',wb),
    discPct:avg6(ctrlL,loc,'discPct',wb),cashRefCnt:avg6(ctrlL,loc,'cashRefCnt',wb),
    posOverCnt:avg6(ctrlL,loc,'posOverCnt',wb),drawerOpens:avg6(ctrlL,loc,'drawerOpens',wb),
    avgRate:avg6(ctrlL,loc,'avgRate',wb)||avg6(laborL,loc,'avgRate',wb),
    actHrs:avg6(ctrlL,loc,'actHrs',wb),
    empMealAmt:avg6(ctrlL,loc,'empMealAmt',wb),mgrMealAmt:avg6(ctrlL,loc,'mgrMealAmt',wb),
    manualRefAmt:avg6(ctrlL,loc,'manualRefAmt',wb),
    depositAmt:avg6(ctrlL,loc,'depositAmt',wb),
    floorMgmtNeeded:avg6(laborL,loc,'floorMgmtNeeded',wb),
    floorHrsSched:avg6(laborL,loc,'floorHrsSched',wb),
    fixedContractHrs:avg6(laborL,loc,'fixedContractHrs',wb),
    variableNeeded:avg6(laborL,loc,'variableNeeded',wb),
    oppCostPct:avg6(laborL,loc,'oppCostPct',wb),
    oppCostDollar:avg6(laborL,loc,'oppCostDollar',wb)};
  let kvsuS=0,kvsuC=0;const cut=new Date(Date.now()-wb*7*86400000);
  for(const row of opsL){if(row.date<cut||!row.kvsu)continue;kvsuS+=row.kvsu;kvsuC++;}
  r.kvsu=kvsuC?kvsuS/kvsuC:0;
  r.floorCompliance=r.floorMgmtNeeded>0?r.floorHrsSched/r.floorMgmtNeeded:null;
  r.r2pSuspect=r.r2p>0&&r.r2p<60;
  r.hasPettyCash=ctrlL.some(row=>row.date>=cut&&row.hasPettyCash);
  const sRows=laborL.filter(row=>row.date>=cut&&row.sales>0);
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
  r.depositBaseline=+(depositBaseline*100).toFixed(0)+'%';
  r.depositSuspect=r.depositVsSalesRatio!==null&&r.depositVsSalesRatio<depositBaseline;
  // T2W trend: last 2 weeks avg sales vs prior 2 weeks avg sales
  const t2wCut = new Date(Date.now()-14*86400000);
  const t4wCut = new Date(Date.now()-28*86400000);
  const recentRows = laborL.filter(row=>row.date>=t2wCut&&row.sales>0);
  const priorRows  = laborL.filter(row=>row.date>=t4wCut&&row.date<t2wCut&&row.sales>0);
  const recentAvg  = recentRows.length ? recentRows.reduce((a,row)=>a+row.sales,0)/recentRows.length : 0;
  const priorAvg   = priorRows.length  ? priorRows.reduce((a,row)=>a+row.sales,0)/priorRows.length   : 0;
  r.t2w = (recentRows.length>=3 && priorRows.length>=3 && priorAvg>100)
    ? +((recentAvg - priorAvg) / priorAvg).toFixed(4) : null;
  // avgCheck and weeklySales for AI Insights
  const _wbCut=new Date(Date.now()-wb*7*86400000);
  const checkRows = laborL.filter(row=>row.date>=_wbCut&&row.avgCheck>0);
  r.avgCheck = checkRows.length ? checkRows.reduce((a,row)=>a+row.avgCheck,0)/checkRows.length : 0;
  // Also try ops rows if labor doesn't have it
  if(!r.avgCheck){const oChk=opsL.filter(row=>row.date>=_wbCut&&row.avgCheck>0);r.avgCheck=oChk.length?oChk.reduce((a,row)=>a+row.avgCheck,0)/oChk.length:0;}
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
    detail: '# Locked Projections\n\n## What It Means to Lock a Projection\n\nWhen you \"lock\" a projection, you are committing to a specific forecast value for a store on a given day or week. Locked projections are:\n- **Persisted** — saved to localStorage, survive browser close/reopen\n- **Used for scheduling** — these become the numbers your team plans staffing against\n- **Compared in DI Compare** — after the week completes, compare your locked values to actuals\n\n## Weekly Lock Deadline\n\nFor scheduling purposes, weekly projections should be locked approximately 10 days before the week starts (by Wednesday of the prior week). The Command Center signals bar shows a countdown to the next lock deadline.\n\n## Monthly Lock Deadline\n\nMonthly projections should be locked by the 15th of the prior month.\n\n## How to Lock\n\n1. Open Projections from the sidebar (Forecasting > Projections)\n2. Review the model\'s projections for each store\n3. Adjust individual cells if needed (overrides the model)\n4. Click \"Lock Week\" — the system runs a safety check\n5. Acknowledge any confidence warnings\n6. Projections are locked and stored\n\n## How to Test Your Model Accuracy\n\nThe best way to backtest:\n1. Load a recent Operations Report\n2. Go to Proj vs Actuals (Forecasting > Proj vs Actuals)\n3. Select the week you want to compare\n4. The report shows: Locked Projection | AI Model | Actual | MAPE\n5. Use DI Compare to see Dialed-In model vs Default model accuracy\n\n## DI Compare\n\nDialed-In Compare shows side-by-side comparison for a completed week:\n- What the Dialed-In model predicted\n- What the Default model predicted\n- What actually happened\n- Which model was more accurate (MAPE per store)\n- This tells you definitively whether DI is helping or hurting each location',
  },

  smart_targets: {
    title: 'Smart Target Engine — How It Works',
    category: 'App Guide',
    summary: 'Data-driven target generation that analyzes your historical performance to propose realistic monthly and yearly targets for each location.',
    detail: '# Smart Target Engine\n\nAccess: Sidebar → 🎯 Smart Targets\n\n## What It Does\n\nFor each of the 7 priority metrics (OEPE, TPPH, Labor %, Cash O/S %, T-Red After %, Sales Growth, FOB %), the engine:\n1. Analyzes all available historical data for each location\n2. Computes 6W, 12W, 26W, and 52W trimmed averages\n3. Finds the best sustained 4-week performance over the last year\n4. Identifies comparable stores (same organization, within 40% of your volume)\n5. Calculates trend direction (improving, stable, declining)\n\n## Proposed Yearly (2027)\nAnchor = best sustained 4-week performance\nStretch = 30% of gap toward best comparable store in your org\nIf improving trend → additional 3% stretch credit\n\n## Proposed Monthly (Next Month)\nStep = current 6-week average + 18% of gap toward yearly goal\nThis creates a realistic progression path over 12 months\n\n## How to Use\n1. Load your Operations Report (data is required)\n2. Toggle between Monthly and Yearly modes\n3. Review proposed targets — click any cell for full reasoning\n4. Override any value by typing in the cell\n5. Approve individual stores or click Approve All\n6. Export to CSV for distribution or import to your existing templates\n\n## Confidence Levels\nHigh = 20+ data points · Medium = 8-19 · Low = under 8 (use with caution)',
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
    title: 'LifeLenz Bridge — WFM Comparison & Adjustment',
    category: 'App Guide',
    summary: 'Compares Meridian projections vs LifeLenz (WFM) projected sales. Surfaces bias direction and generates adjusted day-level projections to type into LifeLenz before schedule locks.',
    detail: '# LifeLenz Bridge\n\n## Purpose\n\nLifeLenz (Altametrics WFM, cutover Sep 2025) generates its own sales projections used for labor scheduling. When LifeLenz systematically over- or under-forecasts a store, the schedules it builds are miscalibrated. This panel surfaces that bias and tells you what number to type into LifeLenz before the schedule locks.\n\n**Access:** Sidebar → LifeLenz Bridge\n\n## Requirements\n\n- Labor Analysis file loaded with "Projected Sales" (WFM Projected Sales column, typically column V)\n- The panel auto-runs on open for the selected store\n\n## Historical Bias Calculation\n\nFor each store, the engine analyzes the last 12 weeks of days where both actual sales and LifeLenz projected sales are available:\n\n```\nbiasPct = avg[ (actual − lfzProjection) / actual ] × 100\n```\n\n- **Positive bias** = LifeLenz under-forecasted (actual came in higher than projection)\n- **Negative bias** = LifeLenz over-forecasted (actual came in lower than projection)\n\nThis is also broken down by **day-of-week** (Sunday through Saturday) because LifeLenz bias is often DOW-specific.\n\n## 14-Day Forward Projections\n\nFor each of the next 14 days, the system computes what to type into LifeLenz:\n\n1. **Direct row:** If a LifeLenz projSales value already exists for that date, use it as the anchor\n2. **Pattern mode:** If no direct row, apply the DOW-specific bias correction to Meridian\'s own forecast\n\n```\nadjustedProjection = lfzAnchor × (1 − biasPct/100)\n```\n\nThe result is the number that — when typed into LifeLenz — should produce a correctly calibrated schedule.\n\n## Meridian vs LifeLenz Accuracy\n\nFor each store, the panel also shows Meridian\'s validated MAPE vs LifeLenz\'s MAPE over the same historical window, and which wins more days (Meridian Win Rate per DOW).\n\n## District View\n\nClick "District" to run the scan across all 27 stores simultaneously and rank by bias magnitude. Stores where LifeLenz is most systematically wrong appear at the top.',
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
            style:{padding:'9px 13px',cursor:'pointer',borderBottom:'.5px solid rgba(255,255,255,.03)',
              background:selKey===art.key?'var(--adim)':'transparent'},
            onMouseEnter:e=>{if(selKey!==art.key)e.currentTarget.style.background='rgba(255,255,255,.04)';},
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
      style:{width:14,height:14,borderRadius:'50%',background:'rgba(255,255,255,.12)',
        color:'var(--text3)',fontSize:'8px',fontWeight:700,cursor:'pointer',
        display:'inline-flex',alignItems:'center',justifyContent:'center',
        userSelect:'none',flexShrink:0,transition:'background .1s',lineHeight:1},
      onMouseEnter:e=>{e.currentTarget.style.background='rgba(255,188,13,.25)';e.currentTarget.style.color='var(--amber)';},
      onMouseLeave:e=>{e.currentTarget.style.background='rgba(255,255,255,.12)';e.currentTarget.style.color='var(--text3)';}
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

function forecastDay(loc,date,ds,settings,casc,tgt,horizon,forceModel){
  if(!ds)return{date,loc,ly:0,lyAdj:0,t2:0,t4:0,t6:0,forecast:0,actual:0,goal:0,varPct:null,pass:null,isFuture:true,opsFactor:1,wAdj:0,m1:0,m2:0,oepe:0,tpph:0,labor:0,noLYData:true};
  const t=tgt||ds.targets[loc]||DEFAULT_TARGETS[loc]||{};
  const anchor=ds.lastActual[loc]||addD(new Date(),-1);
  // isFuture: date is after the last known actual OR after today (whichever is more conservative)
  const todayStart=sodOf(new Date());
  const isFuture=date>anchor&&date>=todayStart;
  const eDt=settings.mode==='Back Test'?date:anchor;
  let lyRaw=fetchLY(ds.laborIdx,ds.laborRows,loc,date,settings._userEvents);
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
  // Route new models: Adaptive Ensemble and EWMA short-circuit here
  if(_assignedModel==='ae'){
    const _aeFcst=forecastAdaptiveEnsemble(_locLaborRows,ds.laborIdx,loc,date);
    if(_aeFcst&&_aeFcst>0){
      const _aeAct=(()=>{const rr=_locLaborRows.filter(r=>r.date instanceof Date&&Math.abs(r.date-date)<86400000);return rr.length?rr[0].sales:0;})();
      const _aeORow=fetchRow(ds.opsIdx,loc,date);const _aeCtrlRow=fetchRow(ds.ctrlIdx,loc,date);
      const _aeIsFuture=date>sodOf(new Date());
      return{date,loc,forecast:Math.round(_aeFcst),ly:lyRaw,lyAdj:Math.round(_aeFcst),t2:Math.round(_aeFcst),t4:Math.round(_aeFcst),t6:Math.round(_aeFcst),actual:_aeAct,goal:0,varPct:_aeAct>0?(_aeAct-Math.round(_aeFcst))/_aeAct:null,pass:null,isFuture:_aeIsFuture,opsFactor:1,wAdj:0,m1:Math.round(_aeFcst),m2:Math.round(_aeFcst),
        oepe:_aeORow?(_aeORow.oepe||0):0,tpph:_aeCtrlRow?(_aeCtrlRow.tpph||0):0,labor:_aeCtrlRow?(_aeCtrlRow.laborPct||0):0,
        actualGC:_aeAct>0?(()=>{const rr=_locLaborRows.filter(r=>r.date instanceof Date&&Math.abs(r.date-date)<86400000);return rr.length?rr[0].gc||0:0;})():0,forecastGC:0,lyGC:0,
        noLYData:!lyRaw,modelUsed:'ae'};
    }
  }
  if(_assignedModel==='ewma'){
    const _ewmaFcst=forecastEWMA(_locLaborRows,ds.laborIdx,loc,date);
    if(_ewmaFcst&&_ewmaFcst>0){
      const _ewmaAct=(()=>{const rr=_locLaborRows.filter(r=>r.date instanceof Date&&Math.abs(r.date-date)<86400000);return rr.length?rr[0].sales:0;})();
      const _ewmaORow=fetchRow(ds.opsIdx,loc,date);const _ewmaCtrlRow=fetchRow(ds.ctrlIdx,loc,date);
      return{date,loc,forecast:Math.round(_ewmaFcst),ly:lyRaw,lyAdj:Math.round(_ewmaFcst),t2:Math.round(_ewmaFcst),t4:Math.round(_ewmaFcst),t6:Math.round(_ewmaFcst),actual:_ewmaAct,goal:0,varPct:_ewmaAct>0?(_ewmaAct-Math.round(_ewmaFcst))/_ewmaAct:null,pass:null,isFuture:date>sodOf(new Date()),opsFactor:1,wAdj:0,m1:Math.round(_ewmaFcst),m2:Math.round(_ewmaFcst),
        oepe:_ewmaORow?(_ewmaORow.oepe||0):0,tpph:_ewmaCtrlRow?(_ewmaCtrlRow.tpph||0):0,labor:_ewmaCtrlRow?(_ewmaCtrlRow.laborPct||0):0,
        actualGC:0,forecastGC:0,lyGC:0,noLYData:false,modelUsed:'ewma'};
    }
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
  // ── Enhancement 5: Event Registry ────────────────────────────────────────
  // If this date has a known tagged event, apply the learned historical impact
  const _dk = dKey(date);
  const _evTag = settings._userEvents && settings._userEvents[loc] && settings._userEvents[loc][_dk];
  const _evFactor = (()=>{
    if(!_evTag || !settings.useEventRegistry) return 0;
    const factors = settings._eventFactors && settings._eventFactors[loc];
    if(!factors) return 0;
    // Support multi-tag: average all tag impacts
    const types = (_evTag.tags&&_evTag.tags.length)
      ? _evTag.tags.map(t=>t.type) : [_evTag.type||'other'];
    const impacts = types.map(t=>factors[t]??0).filter(v=>v!==0);
    return impacts.length ? impacts.reduce((a,b)=>a+b,0)/impacts.length : 0;
  })();
  // ── Enhanced primary forecast (LY model + trend + event adj) ─────────────
  const _plusFrac = effectivePlusUp(loc,settings)/100;
  const forecast = Math.round(lyAdjH * opsFactor * (1+wAdj) * (1+trendFactor) * (1+_evFactor) * (1+_plusFrac));
  const isHol = !!holidayInfo;
  if(settings.cascade&&isFuture&&casc)casc[loc+'_'+dKey(date)]=forecast;
  const actual=!isFuture?fetchRow(ds.laborIdx,loc,date,'sales'):0;
  const goal=lyAdjH*(1+(t.tGrowth||.05));
  const varPct=actual>0?(actual-forecast)/actual:null;
  const pass=varPct!==null?Math.abs(varPct)<=(settings.tolerance||5)/100:null;
  const oRow=fetchRow(ds.opsIdx,loc,date);const cRow=fetchRow(ds.ctrlIdx,loc,date);
  // Daypart forecast (from 3 Peaks data if available)
  const dayparts=isFuture?forecastDayparts(loc,date,ds,settings):null;
  const actualGC = !isFuture ? fetchRow(ds.laborIdx, loc, date, 'gc') : 0;
  const lyGC     = fetchRow(ds.laborIdx, loc, addD(date,-364), 'gc') || 0;
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
    oepe:isFuture?p.oepe:(oRow?oRow.oepe||p.oepe:p.oepe),
    tpph:isFuture?p.tpph:(cRow?cRow.tpph||p.tpph:p.tpph),
    labor:isFuture?p.laborPct:(cRow?cRow.laborPct||p.laborPct:p.laborPct),
    dayparts,
    // modelUsed (v4.195): distinguishes a genuinely DI-calibrated result (cal
    // was non-null, real settings.dialedIn[loc] data applied) from a silent
    // fallback to default trend weights when DI was requested/assigned but
    // this store has no calibration on file. Previously only the AE/EWMA
    // short-circuit branches set this; the main pipeline never did.
    modelUsed: cal ? 'di' : (_assignedModel==='dow' ? 'dow' : _assignedModel)};
}

function forecastRange(loc,startDate,endDate,ds,settings){
  const t=ds?ds.targets[loc]||DEFAULT_TARGETS[loc]||{}:DEFAULT_TARGETS[loc]||{};
  const casc={};const days=[];
  let cur=new Date(startDate);
  while(cur<=endDate){days.push(forecastDay(loc,new Date(cur),ds,settings,casc,t));cur=addD(cur,1);}
  return days;
}

// Async chunked version — used by StoreDash to prevent UI freeze on long ranges
function forecastRangeAsync(loc,startDate,endDate,ds,settings,onChunk,onDone){
  const t=ds?ds.targets[loc]||DEFAULT_TARGETS[loc]||{}:DEFAULT_TARGETS[loc]||{};
  const casc={};
  const dates=[];let cur=new Date(startDate);
  while(cur<=endDate){dates.push(new Date(cur));cur=addD(cur,1);}
  const CHUNK=14;let i=0;const results=[];
  function processChunk(){
    const end=Math.min(i+CHUNK,dates.length);
    for(;i<end;i++) results.push(forecastDay(loc,dates[i],ds,settings,casc,t));
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
      .filter(r=>r.loc===loc&&r.date<date&&r.date.getDay()===dow&&r.sales>0)
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
      .filter(r=>r.loc===loc&&r.date<date&&r.date.getDay()===dow&&r.sales>0)
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
      detail:'Recent MAPE trending down ('+m6.toFixed(1)+'%→'+m4.toFixed(1)+'%→'+m2.toFixed(1)+'%). DI is working well.'};
  if(stable && !highErr && !degrading)
    return{label:'→ Stable',color:'#60a5fa',bg:'rgba(96,165,250,.1)',border:'rgba(96,165,250,.3)',
      detail:'MAPE consistent across windows ('+m6.toFixed(1)+'%/'+m4.toFixed(1)+'%/'+m2.toFixed(1)+'%). DI holding steady.'};
  if(degrading && !highErr)
    return{label:'⚠ Recalibrate',color:'#f59e0b',bg:'rgba(245,158,11,.1)',border:'rgba(245,158,11,.3)',
      detail:'Recent 2W MAPE ('+m2.toFixed(1)+'%) higher than 6W ('+m6.toFixed(1)+'%). Re-run calibration with latest data.'};
  if(highErr)
    return{label:'❌ Review',color:'#f87171',bg:'rgba(248,113,113,.1)',border:'rgba(248,113,113,.3)',
      detail:'MAPE above 11% in recent windows. Consider using default params or investigate anomalies.'};
  return{label:'→ Stable',color:'#60a5fa',bg:'rgba(96,165,250,.1)',border:'rgba(96,165,250,.3)',
    detail:'MAPE consistent. DI calibration reasonable.'};
}

// MODEL HEALTH SCORE — 0-100 per store
// Tells you instantly: "Can I trust this forecast?"
// Green ≥75 = Trust it   Yellow 50-74 = Use with judgment   Red <50 = Needs work
function computeModelHealth(loc, settings, ds) {
  const _masgn2 = DEFAULT_MODEL_ASSIGNMENTS[loc];
  if(_masgn2&&_masgn2.recentOnly&&!(settings.dialedIn&&settings.dialedIn[loc])){
    return{total:null,grade:'blue',gradeLabel:'New Store',gradeColor:'#64748b',
      components:{cal:null,fresh:null,mape:null,sample:null},
      notes:{cal:'New/ramp-up store',fresh:'',mape:'',sample:''},
      statement:'New or recently opened store — calibration not yet applicable.',newStore:true};
  }
  const cal = settings.dialedIn && settings.dialedIn[loc];
  const dataRows = (ds && ds.laborRows || []).filter(r => r.loc === loc && r.sales > 0);

  // ── Component 1: Calibration status (30 pts) ──────────────────
  let calScore = 0;
  let calNote = '';
  if (!cal) {
    calScore = 0; calNote = 'Not calibrated — run Dialed-In';
  } else {
    const daysSinceCal = cal.runDate
      ? Math.floor((Date.now() - new Date(cal.runDate)) / 864e5) : 99;
    const fpChanged = settings._settingsFp && cal.settingsFp && settings._settingsFp !== cal.settingsFp;
    if (daysSinceCal <= 7 && !fpChanged) { calScore = 30; calNote = 'Calibrated recently'; }
    else if (daysSinceCal <= 21 && !fpChanged) { calScore = 22; calNote = 'Calibrated '+daysSinceCal+'d ago'; }
    else if (daysSinceCal <= 42) { calScore = 14; calNote = 'Calibration aging ('+daysSinceCal+'d)'; }
    else { calScore = 6; calNote = 'Calibration stale ('+daysSinceCal+'d) — recalibrate'; }
    if (fpChanged) { calScore = Math.max(0, calScore - 10); calNote += ' · settings changed'; }
  }

  // ── Component 2: Data freshness (25 pts) ─────────────────────
  let freshScore = 0;
  let freshNote = '';
  if (!dataRows.length) {
    freshScore = 0; freshNote = 'No data loaded';
  } else {
    const latestDate = new Date(Math.max(...dataRows.map(r => r.date)));
    const daysSinceData = Math.floor((Date.now() - latestDate) / 864e5);
    if (daysSinceData <= 3) { freshScore = 25; freshNote = 'Data current'; }
    else if (daysSinceData <= 10) { freshScore = 18; freshNote = 'Data '+daysSinceData+'d old'; }
    else if (daysSinceData <= 21) { freshScore = 10; freshNote = 'Data '+daysSinceData+'d old — update soon'; }
    else { freshScore = 3; freshNote = 'Data '+daysSinceData+'d old — needs update'; }
  }

  // ── Component 3: MAPE stability (25 pts) ─────────────────────
  let mapeScore = 0;
  let mapeNote = '';
  if (!cal) {
    mapeScore = 0; mapeNote = 'Run calibration for accuracy data';
  } else {
    const mape6w = cal.mape6w, mape4w = cal.mape4w, mape2w = cal.mape2w, mapeAll = cal.mape;
    const bestMape = mape2w != null ? mape2w : mape4w != null ? mape4w : mapeAll;
    const isDrifting = mape2w != null && mape6w != null && mape2w > mape6w + 5;
    const isImproving = mape2w != null && mape6w != null && mape2w < mape6w - 2;
    if (bestMape != null) {
      if (bestMape < 5) { mapeScore = 25; mapeNote = 'MAPE excellent ('+bestMape.toFixed(1)+'%)'; }
      else if (bestMape < 8) { mapeScore = 20; mapeNote = 'MAPE good ('+bestMape.toFixed(1)+'%)'; }
      else if (bestMape < 12) { mapeScore = 13; mapeNote = 'MAPE fair ('+bestMape.toFixed(1)+'%)'; }
      else { mapeScore = 5; mapeNote = 'MAPE high ('+bestMape.toFixed(1)+'%) — check events'; }
      if (isDrifting) { mapeScore = Math.max(0, mapeScore - 8); mapeNote += ' · drifting ⚠'; }
      if (isImproving) { mapeNote += ' · improving ▼'; }
    } else {
      mapeScore = 8; mapeNote = 'MAPE computing...';
    }
  }

  // ── Component 4: Sample size (20 pts) ────────────────────────
  let sampleScore = 0;
  let sampleNote = '';
  const samples = cal ? (cal.samples || 0) : dataRows.length;
  if (samples >= 180) { sampleScore = 20; sampleNote = samples+' days of history'; }
  else if (samples >= 90) { sampleScore = 15; sampleNote = samples+' days (good)'; }
  else if (samples >= 42) { sampleScore = 8; sampleNote = samples+' days (growing)'; }
  else { sampleScore = 3; sampleNote = samples+' days (limited)'; }

  const total = calScore + freshScore + mapeScore + sampleScore;
  const grade = total >= 75 ? 'green' : total >= 50 ? 'yellow' : 'red';
  const gradeLabel = total >= 75 ? 'Trusted' : total >= 50 ? 'Caution' : 'Needs Attention';
  const gradeColor = total >= 75 ? '#10b981' : total >= 50 ? '#f59e0b' : '#f87171';

  // ── Confidence Statement (one auto-generated sentence) ────────
  const cal_part = calScore >= 22 ? 'calibrated' : 'calibration aging';
  const data_part = freshScore >= 18 ? 'data current' : 'data needs refresh';
  const mape_part = mapeScore >= 20 ? 'high accuracy' : mapeScore >= 13 ? 'acceptable accuracy' : 'accuracy needs work';
  const drift_part = cal && cal.mape2w != null && cal.mape6w != null && cal.mape2w > cal.mape6w + 5 ? ' Model is drifting — recalibrate.' : '';

  let statement = '';
  if (total >= 75) {
    statement = 'Model is healthy and can be trusted for scheduling and projections. ' +
      mapeNote + (drift_part || '');
  } else if (total >= 50) {
    statement = 'Model is usable with some caution. ' + calNote + '. ' + mapeNote +
      '. ' + (drift_part || freshNote) + '.';
  } else {
    const biggest = [
      {s:calScore, note:calNote},
      {s:freshScore, note:freshNote},
      {s:mapeScore, note:mapeNote},
      {s:sampleScore, note:sampleNote}
    ].sort((a,b)=>a.s-b.s)[0];
    statement = 'Model needs attention before use. Primary issue: ' + biggest.note + '.';
  }

  return {
    total, grade, gradeLabel, gradeColor,
    components: { cal: calScore, fresh: freshScore, mape: mapeScore, sample: sampleScore },
    notes: { cal: calNote, fresh: freshNote, mape: mapeNote, sample: sampleNote },
    statement,
  };
}

export {
  _masgnInvalidate, getModelAssignment, saveModelOverride,
  computeMAPEDrift, computeStoreSigma, getStoreOrg,
  getWeatherNote, isWeatherExtreme, calibrateWeather,
  forecastEWMA, forecastAdaptiveDI, forecastAdaptiveEnsemble,
  _wxCache, getForecastWeather,
  fetchRow, fetchWx, fetchLY, fetchLYDate, storeAgeDays, fetchRampSales,
  getDOWTrend, getDOWSpecificTrend,
  forecastDayparts, getWxAdj, modelHealthScore, compute6wk, calcOpsF,
  forecastDay, forecastRange, forecastRangeAsync,
  effectivePlusUp, forecastModels, modelAccuracy,
  getDIRecommendation, computeModelHealth,
  bLocIdx, locRows, avg6, gcCrossCheck, KnowledgeBasePanel, InfoIcon,
};
