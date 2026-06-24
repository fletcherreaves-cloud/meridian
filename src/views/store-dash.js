// @ts-nocheck
import * as React from 'react';
import { Chart } from 'chart.js/auto';
import { addDR, dKey, fmtDI, sodOf } from '../utils/date.js';
import { buildHolidays } from '../utils/holidays.js';
import { DEFAULT_TARGETS, DOW_BASE, STORE_COORDS, STORE_NAMES, sName, sNameC, getKB, EVENT_TYPES } from '../constants.js';
import { InfoIcon, fetchWx, getForecastWeather, gcCrossCheck, locRows, _wxCache } from '../engine/forecast.js';
import { diagnoseMiss, lookupMissEvent } from '../engine/why.js';
import { idbPutRows } from '../db/index.js';
import { ModelHealthBadge } from './analytics.js';
import { TH, f$, fPct, fP, fN, grade, gLbl, gCol } from '../utils/fmt.js';

const {useState, useEffect, useCallback, useMemo, useRef} = React;
const h    = React.createElement;
const div  = (props, ...c) => h('div',    props, ...c);
const span = (props, ...c) => h('span',   props, ...c);
const btn  = (props, ...c) => h('button', props, ...c);
const inp  = (props)       => h('input',  props);
const sel  = (props, ...c) => h('select', props, ...c);
const opt  = (props, ...c) => h('option', props, ...c);
const td   = (props, ...c) => h('td',    props, ...c);
const th   = (props, ...c) => h('th',    props, ...c);
const tr   = (props, ...c) => h('tr',    props, ...c);
const tbl  = (props, ...c) => h('table', props, ...c);

async function fetchForecastWeather(loc) {
  const coord = STORE_COORDS[loc];
  if(!coord) return;
  // Cache for 3 hours - refresh to catch new forecast windows
  const cacheKey='_fetched_'+loc+'_'+new Date().toISOString().slice(0,13);
  if(_wxCache[cacheKey]) return;
  _wxCache[cacheKey]=true;
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${coord.lat}&longitude=${coord.lon||coord.lng}`
      + `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max,precipitation_hours`
      + `&temperature_unit=fahrenheit&windspeed_unit=mph&precipitation_unit=inch`
      + `&forecast_days=16&timezone=America%2FChicago`;
    const res = await fetch(url);
    if(!res.ok) return;
    const data = await res.json();
    const {time,temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max,precipitation_hours} = data.daily||{};
    if(!time) return;
    time.forEach((dateStr,i)=>{
      const key = loc+'_'+dateStr;
      const _fwEntry = {
        tmax:  Math.round(temperature_2m_max[i]||0),
        tmin:  Math.round(temperature_2m_min[i]||0),
        rain:  +(precipitation_sum[i]||0).toFixed(2),
        wmax:  Math.round(windspeed_10m_max[i]||0),
        rnum:  Math.round(precipitation_hours[i]||0)/5,
        source:'forecast'
      };
      _wxCache[key] = _fwEntry;
      // Persist to IDB — forecast weather survives page reload
      idbPutRows('weatherRows',[{_rk:key,loc,date:new Date(dateStr+'T12:00:00'),..._fwEntry}]).catch(()=>{});
    });
  } catch(e) { console.warn('Weather fetch failed for '+loc+':', e.message); }
}

// ── Yearly targets helpers ──────────────────────────────────────────
function getYearlyStorageKey(year) { return 'mf_targets_yearly_'+(year||new Date().getFullYear()); }
function loadYearlyTargets(year) {
  try { return JSON.parse(localStorage.getItem(getYearlyStorageKey(year))||'{}'); } catch { return {}; }
}
function saveYearlyTargets(year, data) {
  try { localStorage.setItem(getYearlyStorageKey(year), JSON.stringify(data)); return true; } catch { return false; }
}
function setYearlyTarget(year, loc, fields) {
  const data = loadYearlyTargets(year);
  data[loc] = {...(data[loc]||{}), ...fields};
  saveYearlyTargets(year, data);
}
function getYearlyTarget(year, loc, defaultFallback) {
  const data = loadYearlyTargets(year);
  return {...(defaultFallback||{}), ...(data[loc]||{})};
}
function exportYearlyTargets(year) { return JSON.stringify(loadYearlyTargets(year), null, 2); }

// MONTHLY TARGETS v2 — Per-month versioned target system (Option C)
// Storage: localStorage 'mf_targets_v2': { 'YYYY-MM': { loc: {targets} } }

function ymKey(date) {
  const d = date instanceof Date ? date : new Date(date||Date.now());
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
}

function loadTargetsV2() {
  try { return JSON.parse(localStorage.getItem('mf_targets_v2')||'{}'); } catch { return {}; }
}
function saveTargetsV2(data) {
  try { localStorage.setItem('mf_targets_v2', JSON.stringify(data)); return true; } catch { return false; }
}

// Get targets for a specific year-month string (e.g. '2026-05')
// Falls back to the most recent prior month that has targets, then DEFAULT_TARGETS
function getMonthTargets(ym, loc, defaultFallback) {
  const v2 = loadTargetsV2();
  // Try the exact month
  if (v2[ym] && v2[ym][loc]) return {...(defaultFallback||{}), ...v2[ym][loc]};
  // Try prior months in reverse order
  const months = Object.keys(v2).filter(k=>k<=ym).sort().reverse();
  for (const m of months) {
    if (v2[m] && v2[m][loc]) return {...(defaultFallback||{}), ...v2[m][loc]};
  }
  return defaultFallback || {};
}

// Get targets appropriate for a specific date
function getTargetsForDate(date, loc, defaultFallback) {
  return getMonthTargets(ymKey(date), loc, defaultFallback);
}

// Set targets for a specific month (merges with existing)
function setMonthTargets(ym, loc, fields) {
  const v2 = loadTargetsV2();
  if (!v2[ym]) v2[ym] = {};
  v2[ym][loc] = {...(v2[ym][loc]||{}), ...fields};
  saveTargetsV2(v2);
}

// Copy one month's targets to another (or all months)
function copyMonthTargets(fromYm, toYm, locs) {
  const v2 = loadTargetsV2();
  const fromData = v2[fromYm] || {};
  if (!v2[toYm]) v2[toYm] = {};
  (locs||Object.keys(fromData)).forEach(loc=>{
    if (fromData[loc]) v2[toYm][loc] = {...fromData[loc]};
  });
  saveTargetsV2(v2);
}

// Lock/unlock a month (locked months show warning before editing)
function toggleMonthLock(ym) {
  const v2 = loadTargetsV2();
  if (!v2[ym]) v2[ym] = {};
  v2[ym]._locked = !v2[ym]._locked;
  saveTargetsV2(v2);
  return v2[ym]._locked;
}

// Export all monthly targets as JSON
function exportTargetsV2() {
  return JSON.stringify(loadTargetsV2(), null, 2);
}

// Get available months that have targets set
function getTargetMonths() {
  const v2 = loadTargetsV2();
  return Object.keys(v2).filter(k=>!k.startsWith('_')).sort().reverse();
}

// Bootstrap: migrate existing flat targets to v2 format for current month
function migrateTargetsToV2(userTargets, ym) {
  if (!userTargets || !Object.keys(userTargets).length) return;
  const v2 = loadTargetsV2();
  if (v2[ym]) return; // already have this month
  v2[ym] = {};
  Object.entries(userTargets).forEach(([loc, tgts]) => {
    if (loc && tgts && typeof tgts === 'object') v2[ym][loc] = {...tgts};
  });
  saveTargetsV2(v2);
}

const PEAK_SLICES = {
  '7am-9am':'breakfast','7am - 9am':'breakfast','breakfast':'breakfast',
  '11am-2pm':'lunch','11am - 2pm':'lunch','lunch':'lunch',
  '5pm-7pm':'dinner','5pm - 7pm':'dinner','dinner':'dinner'
};
function normSlice(s){return PEAK_SLICES[s.toLowerCase().trim()]||s.toLowerCase().replace(/\s/g,'');}

function analyzePeaks(peakSvcRows, peakSalesRows, loc, wb) {
  // Use all available data for this location — no arbitrary date cutoff
  // so loaded historical files are always visible
  const locStr = String(loc||'').trim();
  const svcRows  = peakSvcRows.filter(r=>String(r.loc||'').trim()===locStr);
  const salesRows= peakSalesRows.filter(r=>String(r.loc||'').trim()===locStr);
  // Prefer recent wb weeks if we have enough data, otherwise use all
  const cut = new Date(Date.now()-(wb||6)*7*86400000);
  const svcR  = svcRows.filter(r=>r.date>=cut).length  >= 3 ? svcRows.filter(r=>r.date>=cut)  : svcRows;
  const salesR= salesRows.filter(r=>r.date>=cut).length>= 3 ? salesRows.filter(r=>r.date>=cut): salesRows;
  const slices=['breakfast','lunch','dinner'];
  const result={};
  for(const sl of slices){
    const sv=svcR.filter(r=>normSlice(r.slice)===sl);
    const sa=salesR.filter(r=>normSlice(r.slice)===sl);
    const avg=(arr,field)=>arr.length?arr.reduce((a,r)=>a+(r[field]||0),0)/arr.length:0;
    result[sl]={
      oepe:avg(sv,'oepe'),r2p:avg(sv,'r2p'),kvst:avg(sv,'kvst'),
      parkPct:avg(sv,'parkPct'),dtGC:avg(sv,'dtGC'),
      netSales:avg(sa,'netSales'),gc:avg(sa,'gc'),
      avgCheck:avg(sa,'avgCheck'),tpph:avg(sa,'tpph'),
      count:Math.max(sv.length,sa.length)
    };
  }
  return result;
}

function mdToNodes(text){
  if(!text) return [];
  const lines=text.split('\n');
  const nodes=[];
  let inList=false;
  let listItems=[];
  const flushList=()=>{
    if(listItems.length){
      nodes.push(h('ul',{style:{margin:'4px 0 8px 0',paddingLeft:18}},
        listItems.map((li,i)=>h('li',{key:i,style:{fontSize:'10px',color:'var(--text)',
          lineHeight:1.6,marginBottom:2}},inlineFormat(li)))
      ));
      listItems=[]; inList=false;
    }
  };
  const inlineFormat=(s)=>{
    // Bold **text** and **Priority X:** patterns
    const parts=s.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((p,i)=>{
      if(p.startsWith('**')&&p.endsWith('**'))
        return h('strong',{key:i,style:{color:'var(--text)',fontWeight:700}},p.slice(2,-2));
      return p;
    });
  };
  for(let i=0;i<lines.length;i++){
    const line=lines[i];
    const trimmed=line.trim();
    if(!trimmed){flushList();if(nodes.length)nodes.push(h('div',{key:'sp'+i,style:{height:4}}));continue;}
    // H1 #
    if(/^#\s/.test(trimmed)){flushList();nodes.push(h('div',{key:i,style:{fontSize:'13px',fontWeight:800,color:'var(--amber)',marginBottom:6,marginTop:10,borderBottom:'.5px solid var(--bdr)',paddingBottom:4}},trimmed.replace(/^#+\s*/,'')));continue;}
    // H2 ##
    if(/^##\s/.test(trimmed)){flushList();nodes.push(h('div',{key:i,style:{fontSize:'11px',fontWeight:700,color:'var(--text)',marginBottom:4,marginTop:10}},trimmed.replace(/^#+\s*/,'')));continue;}
    // H3 ###
    if(/^###\s/.test(trimmed)){flushList();nodes.push(h('div',{key:i,style:{fontSize:'10px',fontWeight:700,color:'var(--amber)',marginBottom:3,marginTop:8,letterSpacing:'.3px',textTransform:'uppercase'}},trimmed.replace(/^#+\s*/,'')));continue;}
    // Bullets - or *
    if(/^[-*]\s/.test(trimmed)){
      inList=true;
      listItems.push(trimmed.replace(/^[-*]\s/,''));
      continue;
    }
    // Numbered list 1. 2. etc
    if(/^\d+\.\s/.test(trimmed)){
      inList=true;
      listItems.push(trimmed.replace(/^\d+\.\s/,''));
      continue;
    }
    // Horizontal rule ---
    if(/^---+$/.test(trimmed)){flushList();nodes.push(h('div',{key:i,style:{height:1,background:'var(--bdr)',margin:'8px 0'}}));continue;}
    // Bold-only lines (action headers like **Priority 1:**)
    if(/^\*\*.*\*\*:?$/.test(trimmed)){
      flushList();
      nodes.push(h('div',{key:i,style:{fontSize:'10px',fontWeight:700,color:'var(--amber)',marginTop:8,marginBottom:2}},trimmed.replace(/\*\*/g,'')));
      continue;
    }
    // Regular paragraph
    flushList();
    nodes.push(h('p',{key:i,style:{fontSize:'10px',color:'var(--text2)',lineHeight:1.7,margin:'0 0 4px 0'}},inlineFormat(trimmed)));
  }
  flushList();
  return nodes;
}

// SECTION 9: CHART WRAPPERS
function useChart(canvasRef, buildFn, deps) {
  const chartRef = useRef(null);
  useEffect(() => {
    if(!canvasRef.current) return;
    if(chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
    try { chartRef.current = buildFn(canvasRef.current); }
    catch(e) { console.warn('Chart error:', e); }
    return () => { if(chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
  }, deps); // eslint-disable-line
}

const TT = {backgroundColor:'#1a2332',titleColor:'#e2e8f0',bodyColor:'#94a3b8',borderColor:'#1e2d3d',borderWidth:1};
const AX = {ticks:{color:'#64748b',font:{size:9}},grid:{color:'rgba(255,255,255,.04)'}};
const LEG = {position:'bottom',labels:{color:'#94a3b8',boxWidth:10,font:{size:10}}};

function SalesChart({dayRows, tgt}) {
  const ref = useRef(null);
  useChart(ref, canvas => {
    if(!dayRows||!dayRows.length) return null;
    const labels = dayRows.map(r => DOW_BASE[r.date.getDay()]+' '+r.date.toLocaleDateString('en-US',{month:'numeric',day:'numeric'}));
    return new Chart(canvas, {type:'bar', data:{labels, datasets:[
      {label:'LY Sales', data:dayRows.map(r=>Math.round(r.lyAdj)||0), backgroundColor:'rgba(100,116,139,.45)', borderColor:'rgba(100,116,139,.7)', borderWidth:.5, order:3},
      {label:'Goal',     data:dayRows.map(r=>Math.round(r.goal)||0),  backgroundColor:'rgba(74,222,128,.15)',  borderColor:'rgba(74,222,128,.5)',  borderWidth:.5, order:2},
      {label:'AI Forecast', data:dayRows.map(r=>Math.round(r.forecast)||0), type:'line', borderColor:'#f59e0b', backgroundColor:'transparent', borderWidth:2.5, pointStyle:'diamond', pointRadius:5, order:1, tension:.3},
      {label:'Actual',   data:dayRows.map(r=>r.actual>0?Math.round(r.actual):null), type:'line', borderColor:'#60a5fa', backgroundColor:'transparent', borderWidth:2, pointRadius:4, order:0, tension:.3, spanGaps:false},
    ]},
    options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
      plugins:{legend:LEG, tooltip:{...TT,callbacks:{label:c=>`${c.dataset.label}: $${Math.round(c.raw||0).toLocaleString()}`}}},
      scales:{x:{...AX},y:{...AX,ticks:{...AX.ticks,callback:v=>'$'+Math.round(v/1000)+'K'}}}}});
  }, [dayRows]);
  return div({style:{height:180}}, h('canvas',{ref}));
}

function OpsRadar({perf, tgt}) {
  const ref = useRef(null);
  useChart(ref, canvas => {
    const toS=(a,t,low=true)=>(!t||!a)?50:Math.min(100,Math.round((low?t/a:a/t)*100));
    const labels = ['OEPE','TPPH','KVS Time','KVS Usage','DT Parked%','Labor%'];
    const data = [
      toS(perf.oepe,tgt.tOepe), toS(perf.tpph,tgt.tTpph,false),
      toS(perf.kvst,tgt.tKvst), toS(perf.kvsu,tgt.tKvsu,false),
      toS(perf.park,tgt.tPark), toS(Math.abs((perf.laborPct||0)-(tgt.tLabor||0)),.03)
    ];
    return new Chart(canvas, {type:'radar', data:{labels, datasets:[
      {label:'Target', data:[100,100,100,100,100,100], borderColor:'rgba(245,158,11,.3)', backgroundColor:'rgba(245,158,11,.04)', borderWidth:1, pointRadius:0},
      {label:'Actual', data, borderColor:'#60a5fa', backgroundColor:'rgba(96,165,250,.12)', borderWidth:2, pointRadius:4, pointBackgroundColor:'#60a5fa'},
    ]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:LEG,tooltip:{...TT}},
      scales:{r:{backgroundColor:'transparent',angleLines:{color:'rgba(255,255,255,.05)'},grid:{color:'rgba(255,255,255,.07)'},pointLabels:{color:'#94a3b8',font:{size:9}},ticks:{display:false},suggestedMin:0,suggestedMax:100}}}});
  }, [perf, tgt]);
  return div({style:{height:195}}, h('canvas',{ref}));
}

function TrendChart({dayRows}) {
  const ref = useRef(null);
  useChart(ref, canvas => {
    if(!dayRows||!dayRows.length) return null;
    const labels = dayRows.map(r => DOW_BASE[r.date.getDay()]);
    return new Chart(canvas, {type:'bar', data:{labels, datasets:[
      {label:'T2W %', data:dayRows.map(r=>+(r.t2*100).toFixed(1)), backgroundColor:dayRows.map(r=>r.t2>=0?'rgba(74,222,128,.5)':'rgba(248,113,113,.5)'), borderColor:dayRows.map(r=>r.t2>=0?'#4ade80':'#f87171'), borderWidth:1},
      {label:'T6W %', data:dayRows.map(r=>+(r.t6*100).toFixed(1)), backgroundColor:dayRows.map(r=>r.t6>=0?'rgba(74,222,128,.25)':'rgba(248,113,113,.25)'), borderColor:dayRows.map(r=>r.t6>=0?'rgba(74,222,128,.5)':'rgba(248,113,113,.5)'), borderWidth:1},
    ]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:LEG,tooltip:{...TT,callbacks:{label:c=>`${c.dataset.label}: ${c.raw}%`}}},
      scales:{x:{...AX},y:{...AX,ticks:{...AX.ticks,callback:v=>v+'%'}}}}});
  }, [dayRows]);
  return div({style:{height:155}}, h('canvas',{ref}));
}

// SECTION 10: FORECAST TABLE
function wxIcon(row, ds, loc) {
  if(!row) return {icon:'—',col:'var(--text3)',tip:''};
  // Historical Mesonet first, then live forecast cache
  const r = (fetchWx(ds, row.date))
            || getForecastWeather(loc||row.loc, row.date);
  const adj = row.wAdj||0;
  const rain = r ? (r.rain||0) : 0;
  const tmax = r ? (r.tmax||0) : 0;
  const rnum = r ? (r.rnum||0) : 0;
  const wmax = r ? (r.wmax||0) : 0;
  const isForecast = r&&r.source==='forecast';
  const suffix = isForecast ? '*' : ''; // asterisk = live forecast data
  if(rain > 1.5) return {icon:'⛈'+suffix, col:'#93c5fd', tip:'Heavy rain'+(isForecast?' (forecast)':'')};
  if(rain > 0.25 && rnum >= 3) return {icon:'🌦'+suffix, col:'#93c5fd', tip:'Intermittent rain'+(isForecast?' (forecast)':'')};
  if(rain > 0.25) return {icon:'🌧'+suffix, col:'#93c5fd', tip:'Rain'+(isForecast?' (forecast)':'')};
  if(wmax > 35) return {icon:'💨'+suffix, col:'#fbbf24', tip:'High wind'+(isForecast?' (forecast)':'')};
  if(tmax > 100) return {icon:'🌡'+suffix, col:'#f87171', tip:'Extreme heat'+(isForecast?' (forecast)':'')};
  if(tmax > 0 && tmax < 25) return {icon:'🌨'+suffix, col:'#bfdbfe', tip:'Very cold'+(isForecast?' (forecast)':'')};
  if(tmax >= 65 && tmax <= 85) return {icon:'☀️'+suffix, col:'#fbbf24', tip:'Ideal'+(isForecast?' (forecast)':'')};
  if(adj < -0.03) return {icon:'↓', col:'#f97316', tip:'Weather headwind'};
  if(adj > 0.005) return {icon:'↑', col:'#4ade80', tip:'Weather tailwind'};
  if(isForecast) return {icon:'📡', col:'#a5b4fc', tip:'Forecast loaded'};
  return {icon:'—', col:'var(--text3)', tip:''};
}

// FORECAST ROW — extracted so useState is legal
function ForecastRow({r, di, wi, tgt, ds, loc, settings, userEvents}) {
  const [showTag, setShowTag] = useState(false);
  const [tagLocs, setTagLocs] = useState([loc]);
  // Local weather state: captures async Open-Meteo data for past dates where
  // the Mesonet file may not have coverage. Updates after fetch completes.
  const [localWx, setLocalWx] = useState(null);
  const ev  = userEvents&&userEvents[loc]&&userEvents[loc][dKey(r.date)];
  const et  = ev ? EVENT_TYPES[ev.type] : null;
  // Weather lookup chain: Mesonet file → _wxCache (Open-Meteo) → localWx (async) → forecast API
  const wxR = fetchWx(ds, r.date) || _wxCache[r.loc+'_'+dKey(r.date)] || localWx || (r.isFuture?getForecastWeather(r.loc, r.date):null);
  // For past days without Mesonet coverage: kick off async fetch and re-render when it arrives
  React.useEffect(()=>{
    if(r.isFuture){
      // Future date: try _wxCache first, if empty kick off forecast fetch + re-render
      const fKey = r.loc+'_'+dKey(r.date);
      if(_wxCache[fKey]) return; // already cached — no fetch needed
      const fCoord = STORE_COORDS[r.loc];
      if(!fCoord) return;
      // Fetch 16-day forecast (covers all future rows in one call per store)
      fetchForecastWeather(r.loc).then(()=>{
        const fw = _wxCache[fKey];
        if(fw) setLocalWx(fw); // triggers re-render of this row
      }).catch(()=>{});
      return;
    }
    const key = r.loc+'_'+dKey(r.date);
    if(fetchWx(ds,r.date)||_wxCache[key]) return; // already have data
    if(localWx) return; // already loaded locally
    const dk = dKey(r.date);
    // Fetch single-day historical weather from Open-Meteo archive
    const coord = STORE_COORDS[r.loc];
    if(!coord) return;
    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${coord.lat}&longitude=${coord.lon||coord.lng}`
      + `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max`
      + `&temperature_unit=fahrenheit&windspeed_unit=mph&precipitation_unit=inch`
      + `&start_date=${dk}&end_date=${dk}&timezone=America%2FChicago`;
    let cancelled = false;
    fetch(url).then(res=>res.ok?res.json():null).then(data=>{
      if(cancelled||!data||!data.daily) return;
      const wx = {
        tmax: Math.round(data.daily.temperature_2m_max[0]||0),
        tmin: Math.round(data.daily.temperature_2m_min[0]||0),
        rain: +(data.daily.precipitation_sum[0]||0).toFixed(2),
        wmax: Math.round(data.daily.windspeed_10m_max[0]||0),
        source: 'open-meteo-hist'
      };
      _wxCache[key] = wx; // populate cache for future renders
      setLocalWx(wx);
    }).catch(()=>{});
    return ()=>{ cancelled=true; };
  },[r.date, r.loc, r.isFuture]);
  const wxSuggest = wxR&&wxR.rain>1.0?'weather':wxR&&(wxR.tmax>100||wxR.tmax<28&&wxR.tmax>0)?'weather':null;
  // Guest Count cross-validation (future days only)
  const gcCheck = (r.isFuture&&r.forecast>0&&ds)
    ? gcCrossCheck(loc,r.date,ds,settings,r.forecast) : null;
  const hasWxData = wxR&&(wxR.tmax>0||wxR.rain>0||wxR.wmax>0);
  const gc  = v => v>=0?'#4ade80':'#f87171';
  const laborCol = laborColor(r.labor, tgt.tLabor, settings);

  return tr({className:r.isFuture?'fut':''},
    // ── Date cell with tagger ──
    td({style:{position:'relative',whiteSpace:'nowrap'}},
      div({style:{display:'flex',alignItems:'center',gap:2}},
        span(null, r.date.toLocaleDateString('en-US',{month:'numeric',day:'numeric'})),
        et&&span({title:et.label+(ev.note?' — '+ev.note:''),style:{fontSize:'10px'}}, et.icon),
        btn({
          style:{background:'none',border:'none',cursor:'pointer',fontSize:'9px',
            color:ev?'var(--amber)':'var(--text3)',padding:'0 1px',opacity:ev?1:.35,lineHeight:1},
          title:'Tag date as event',
          onClick:e=>{e.stopPropagation();setShowTag(s=>!s);if(!showTag)setTagLocs([loc]);}
        }, ev?'✎':'📌'),
        showTag&&div({
          style:{position:'absolute',top:'calc(100% + 2px)',left:0,zIndex:200,
            background:'var(--surf)',border:'.5px solid var(--bdr2)',borderRadius:'var(--rl)',
            padding:'10px 12px',minWidth:280,boxShadow:'0 8px 32px rgba(0,0,0,.5)',fontSize:'10px'},
          onClick:e=>e.stopPropagation()
        },
          div({style:{fontWeight:600,color:'var(--text)',marginBottom:6}},
            '📌 '+r.date.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric'})
          ),
          // Weather tip
          hasWxData&&div({style:{
            fontSize:'9px',color:'#93c5fd',background:'rgba(96,165,250,.08)',
            border:'.5px solid rgba(96,165,250,.2)',borderRadius:3,padding:'4px 7px',marginBottom:7
          }},
            '🌦 ',
            wxR.tmax>0&&span(null,'Hi '+Math.round(wxR.tmax)+'°'),
            wxR.tmin>0&&span({style:{color:'#60a5fa',marginLeft:4}},'Lo '+Math.round(wxR.tmin)+'°'),
            wxR.rain>0.05&&span({style:{marginLeft:4}},wxR.rain.toFixed(2)+'"'),
            wxR.wmax>0&&span({style:{color:'#94a3b8',marginLeft:4}},Math.round(wxR.wmax)+'mph'),
            wxSuggest&&span({style:{color:'#f59e0b',marginLeft:6,fontWeight:600}},'→ likely weather event')
          ),
          !hasWxData&&div({style:{fontSize:'9px',color:'var(--text3)',marginBottom:6}},'No weather data for this date'),
          // Event type picker
          div({style:{fontSize:'9px',color:'var(--text3)',marginBottom:4,fontWeight:600,textTransform:'uppercase',letterSpacing:'.3px'}},'Event type:'),
          div({style:{display:'flex',flexWrap:'wrap',gap:3,marginBottom:8}},
            Object.entries(EVENT_TYPES).map(([k,v])=>
              btn({key:k,
                style:{fontSize:'9px',padding:'2px 8px',borderRadius:3,cursor:'pointer',
                  border:'.5px solid '+v.color+'66',
                  background:ev&&ev.type===k?v.bg+'44':'transparent',
                  color:v.color,fontWeight:ev&&ev.type===k?700:400},
                onClick:()=>{
                  const defNote = wxSuggest===k&&wxR
                    ? 'Weather: '+(wxR.tmax?Math.round(wxR.tmax)+'°F ':'')+(wxR.rain>0.05?wxR.rain.toFixed(2)+'"':'')+( wxR.wmax>25?' '+Math.round(wxR.wmax)+'mph wind':'')
                    : (ev&&ev.note)||'';
                  const note = prompt('Add a note (optional):', defNote)||defNote;
                  document.dispatchEvent(new CustomEvent('mf_tag_event_multi',{
                    detail:{locs:tagLocs, date:r.date, type:k, note}
                  }));
                  setShowTag(false); setTagLocs([loc]);
                }
              }, v.icon+' '+v.label)
            )
          ),
          // Multi-store picker
          div({style:{fontSize:'9px',color:'var(--text3)',marginBottom:3,fontWeight:600}},'Apply to stores:'),
          div({style:{display:'flex',flexWrap:'wrap',gap:2,maxHeight:60,overflowY:'auto',marginBottom:7}},
            Object.keys(DEFAULT_TARGETS).map(l=>{
              const selected = tagLocs.includes(l);
              return btn({key:l,
                style:{fontSize:'8px',padding:'1px 5px',borderRadius:3,cursor:'pointer',
                  border:'.5px solid var(--bdr)',
                  background:selected?'rgba(99,102,241,.15)':'transparent',
                  color:selected?'#a5b4fc':'var(--text3)'},
                onClick:e=>{e.stopPropagation();
                  setTagLocs(prev=>prev.includes(l)?prev.filter(x=>x!==l):[...prev,l]);}
              }, (STORE_NAMES[l]||l).split(' ')[0]+' #'+l);
            })
          ),
          div({style:{display:'flex',gap:6,alignItems:'center',justifyContent:'space-between'}},
            ev&&btn({
              style:{fontSize:'8px',color:'#f87171',background:'none',border:'.5px solid rgba(239,68,68,.3)',borderRadius:3,cursor:'pointer',padding:'2px 6px'},
              onClick:()=>{document.dispatchEvent(new CustomEvent('mf_remove_event',{detail:{loc,date:r.date}}));setShowTag(false);}
            },'✕ Remove tag'),
            btn({style:{fontSize:'8px',color:'var(--text3)',background:'none',border:'none',cursor:'pointer'},
              onClick:()=>{setShowTag(false);setTagLocs([loc]);}},'✕ Close')
          )
        )
      )
    ),
    // ── Rest of columns ──
    td(null, DOW_BASE[r.date.getDay()]),
    td(null, r.lyAdj>0 ? f$(r.lyAdj) : r.noLYData ? span({style:{color:'#64748b',fontSize:'9px'}},'No LY') : '—'),
    td(null, r.m2>0?f$(r.m2):'—'),
    td({className:'fcc'},
      r.forecast>0?div(null,
        div({style:{fontFamily:'var(--mono)',fontWeight:700}},f$(r.forecast)),
        r.lyAdj>0?div({style:{fontSize:'8px',
          color:r.forecast>=r.lyAdj?'#10b981':'#f87171',fontWeight:600}},
          (r.forecast>=r.lyAdj?'+':'')+((r.forecast-r.lyAdj)/r.lyAdj*100).toFixed(1)+'% vs LY'):null
      ):'—'),
    // GC column: actual guest count (past days) or cross-check indicator (future days)
    td({style:{textAlign:'center',padding:'2px 4px',verticalAlign:'middle',
        cursor:(!r.isFuture&&r.actualGC>0)||(r.isFuture&&gcCheck&&gcCheck.flag)?'help':'default'},
        title:r.isFuture&&gcCheck
          ?'GC Forecast: '+(gcCheck.gcForecast||r.forecastGC||0)+' guests\nImplied Avg Check: $'+gcCheck.impliedCheck+'\nStore Norm: $'+gcCheck.normCheck+' ('+(gcCheck.deviation*100>=0?'+':'')+(gcCheck.deviation*100).toFixed(1)+'%)'
          :!r.isFuture&&r.actualGC>0
          ?'Actual: '+r.actualGC+' guests'+(r.lyGC>0?'\nLY: '+r.lyGC+' ('+(r.actualGC>=r.lyGC?'+':'')+((r.actualGC-r.lyGC)/r.lyGC*100).toFixed(1)+'% YOY)':'')+(r.forecastGC>0?'\nFcst: '+r.forecastGC:'')
          :r.forecastGC>0?'Forecast GC: '+r.forecastGC+' guests':undefined},
      r.isFuture
        ? (gcCheck&&gcCheck.flag==='alert'?span({style:{color:'#f87171',fontSize:'10px'}},'🔴')
           :gcCheck&&gcCheck.flag==='watch'?span({style:{color:'#f59e0b',fontSize:'10px'}},'⚠')
           :gcCheck?span({style:{color:'#10b981',fontSize:'10px'}},'✓')
           :r.forecastGC>0?span({style:{color:'var(--text3)',fontFamily:'var(--mono)',fontSize:'9px'}},r.forecastGC.toLocaleString())
           :null)
        : r.actualGC>0
          ? div({style:{display:'flex',flexDirection:'column',alignItems:'center',lineHeight:1.25}},
              span({style:{fontWeight:700,color:'var(--text2)',fontFamily:'var(--mono)',fontSize:'9px'}},r.actualGC.toLocaleString()),
              r.lyGC>0?span({style:{fontSize:'8px',color:r.actualGC>=r.lyGC?'#10b981':'#f87171'}},(r.actualGC>=r.lyGC?'+':'')+Math.round((r.actualGC-r.lyGC)/r.lyGC*100)+'%')
              :null)
          : span({style:{color:'var(--text3)',fontSize:'9px'}},'—')
    ),
    td(null, r.actual>0?f$(r.actual):'—'),
    td({style:{color:'#4ade80'}}, r.goal>0?f$(r.goal):'—'),
    td({style:{color:gc(r.t2)}}, (r.t2*100).toFixed(1)+'%'),
    td({style:{color:gc(r.t6)}}, (r.t6*100).toFixed(1)+'%'),
    td({style:{color:r.oepe>0&&tgt.tOepe>0?(r.oepe<=tgt.tOepe?'#4ade80':'#f97316'):'inherit'}}, r.oepe>0?Math.round(r.oepe)+'s':'—'),
    td({style:{color:r.tpph>0&&tgt.tTpph>0?(r.tpph>=tgt.tTpph?'#4ade80':'#f97316'):'inherit'}}, r.tpph>0?r.tpph.toFixed(2):'—'),
    td({style:{color:laborCol.color}}, r.labor>0?(fP(r.labor,1)+laborCol.arrow):'—'),
    td({style:{textAlign:'center',fontFamily:'var(--mono)',fontSize:'10px'}},
      r.opsFactor>0?((r.opsFactor>=1?'+':'')+((r.opsFactor-1)*100).toFixed(1)+'%'):'—'),
    td({style:{textAlign:'center',fontFamily:'var(--mono)',fontSize:'10px',
      color:r.varPct!=null?(r.varPct>=0?'#4ade80':'#f87171'):'inherit'}},
      r.varPct!=null?((r.varPct>=0?'+':'')+fP(r.varPct,1)):'—'),
    td(null, r.pass===true?span({className:'pass'},'PASS'):r.pass===false?span({className:'fail'},'MISS'):r.isFuture?span({className:'proj'},'PROJ'):null),
    td({style:{textAlign:'center',verticalAlign:'top',padding:'4px 2px'}}, (()=>{
      if(!hasWxData) return span({style:{fontSize:'13px',color:'var(--text3)'},title:wxR?'No data':''},wxR?'—':'');
      const isFcstWx = wxR&&wxR.source==='forecast';
      const wxIco = wxR.rain>1.5?'⛈':wxR.rain>0.25?'🌧':wxR.tmax>95?'🌡':wxR.tmax<28&&wxR.tmax>0?'🥶':wxR.tmax>=65&&wxR.tmax<=85?'😎':'🌤';
      return div({style:{display:'flex',flexDirection:'column',alignItems:'center',gap:'1px',minWidth:50}},
        div({style:{display:'flex',alignItems:'center',gap:3}},
          span({style:{fontSize:'13px'}},wxIco),
          isFcstWx&&span({style:{fontSize:'7px',color:'#a5b4fc',fontWeight:700}},'FCST')
        ),
        wxR.tmax>0&&div({style:{display:'flex',gap:3,fontSize:'8px',fontFamily:'var(--mono)'}},
          span({style:{color:'#f87171',fontWeight:600}},Math.round(wxR.tmax)+'°'),
          wxR.tmin>0&&span({style:{color:'#93c5fd'}},Math.round(wxR.tmin)+'°')
        ),
        (wxR.rain>0.05||wxR.wmax>0)&&div({style:{fontSize:'8px',fontFamily:'var(--mono)',color:'var(--text3)',display:'flex',gap:3}},
          wxR.rain>0.05&&span({style:{color:'#93c5fd'}},wxR.rain.toFixed(2)+'"'),
          wxR.wmax>0&&span({style:{color:'#94a3b8'}},Math.round(wxR.wmax)+'mph')
        )
      );
    })())
  );
}

function BacktestChart({actualDays}) {
  const ref = useRef(null);
  useChart(ref, canvas => {
    if(!actualDays||actualDays.length<3) return null;
    const sorted = [...actualDays].sort((a,b)=>a.date-b.date);
    const labels = sorted.map(r=>DOW_BASE[r.date.getDay()].slice(0,3)+' '+r.date.toLocaleDateString('en-US',{month:'numeric',day:'numeric'}));
    const fc = sorted.map(r=>Math.round(r.forecast));
    const ac = sorted.map(r=>Math.round(r.actual));
    const absErrs = sorted.map(r=>+Math.abs((r.forecast-r.actual)/r.actual*100).toFixed(1));
    const errColors = absErrs.map(e=>e<5?'rgba(16,185,129,.65)':e<10?'rgba(245,158,11,.65)':'rgba(239,68,68,.65)');
    const errBorders = absErrs.map(e=>e<5?'#10b981':e<10?'#f59e0b':'#ef4444');
    return new Chart(canvas,{type:'bar',data:{labels,datasets:[
      {label:'Forecast',data:fc,backgroundColor:'rgba(99,102,241,.2)',borderColor:'#818cf8',borderWidth:1,order:2},
      {label:'Actual',data:ac,type:'line',borderColor:'#34d399',backgroundColor:'transparent',borderWidth:2.5,pointRadius:3,pointBackgroundColor:'#34d399',order:1,tension:.3},
      {label:'Accuracy',data:absErrs,type:'bar',backgroundColor:errColors,borderColor:errBorders,borderWidth:1,yAxisID:'y2',order:3,barPercentage:.35},
    ]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
      plugins:{legend:LEG,tooltip:{...TT,callbacks:{label:c=>c.dataset.label==='Accuracy'?
        (c.raw<5?'✓ '+c.raw+'% error (excellent)':c.raw<10?'⚠ '+c.raw+'% error (ok)':'✗ '+c.raw+'% error (missed)'):
        `${c.dataset.label}: $${Math.round(c.raw||0).toLocaleString()}`}}},
      scales:{
        x:{...AX},
        y:{...AX,ticks:{...AX.ticks,callback:v=>'$'+Math.round(v/1000)+'K'}},
        y2:{position:'right',min:0,max:Math.max(20,...absErrs)+2,
          ticks:{color:'#94a3b8',font:{size:8},callback:v=>v+'%'},
          grid:{display:false},title:{display:true,text:'Forecast Error %',color:'#94a3b8',font:{size:8}}}
      }}});
  },[actualDays]);
  return div({style:{height:160,marginTop:10}},h('canvas',{ref}));
}

// ════════════════════════════════════════════════════════════════════════════════
// MISS DIAGNOSIS  (extracted to top-level in v4.201 — was a closure inside
// ForecastTable, scoped to a single rendered store/view). Promoted so the
// Why Engine can call it across many stores and many days systematically,
// not just on a single clicked-into worst-miss. Behavior is UNCHANGED —
// loc/ds/userEvents are now explicit parameters instead of closures.
// ════════════════════════════════════════════════════════════════════════════════
// crossStoreCheck, lookupMissEvent, diagnoseMiss, computeForecastComposition,
// classifyMissCauses, runWhyEngineScan, runWhyEngineDistrict → src/engine/why.js

function ForecastTable({weekDays, tgt, ds, loc, settings, store, userEvents}) {
  if(!weekDays||!weekDays.length) return div({className:'empty-st'}, div({className:'empty-st-t'}, 'Computing forecast...'));
  const today = sodOf(new Date());
  const gc = v => v>=0?'#4ade80':'#f87171';
  const noLYDays = weekDays.filter(r=>r.noLYData).length;
  const totalDays = weekDays.length;
  const hasNoLY = noLYDays > totalDays * 0.5;
  const hasWeather = ds && ds.weatherRows && ds.weatherRows.length > 0;

  // Group into weeks
  const weeks = [];
  for(let i=0; i<weekDays.length; i+=7) weeks.push(weekDays.slice(i,i+7));

  // Scenarios for future days
  const futureDays = weekDays.filter(r=>r.isFuture);
  // Hoist these so they're available in the render scope below
  const pastTotal = weekDays.filter(r=>!r.isFuture&&r.actual>0).reduce((a,r)=>a+r.actual,0);
  const futureTotal = futureDays.reduce((a,r)=>a+(r.forecast||0),0);
  let scenarios = null;
  if(futureDays.length>0) {
    const base = pastTotal + futureTotal;
    const lyVar = futureDays.reduce((a,r)=>a+(r.lyAdj>0?(r.forecast-r.lyAdj)/r.lyAdj:0),0)/futureDays.length;
    const t2avg = futureDays.reduce((a,r)=>a+r.t2,0)/futureDays.length;
    const t6avg = futureDays.reduce((a,r)=>a+r.t6,0)/futureDays.length;
    const allBull = t2avg>0&&t6avg>0, allBear = t2avg<0&&t6avg<0;
    const weeksOut = Math.ceil(futureDays.length/7);
    const baseConf = Math.max(30, Math.min(95, 90-(weeksOut-1)*8-(allBull||allBear?0:12)));
    scenarios = {
      bull:{amt:base*1.04,pastTotal,futureTotal, conf:Math.round(baseConf*.9), why:(allBull?'T2/T4/T6 all positive. ':'Mixed trends. ')+'Assumes ops improvement and favorable conditions.'},
      base:{amt:base,pastTotal,futureTotal,conf:baseConf,               why:'Weighted T2/T4/T6 blend with current ops factor. '+(allBull?'Trend windows aligned bullish.':allBear?'Trend windows aligned bearish.':'Trend windows diverging.')},
      cons:{amt:base*.96,pastTotal,futureTotal,conf:Math.round(baseConf*.9), why:'Conservative: assumes ops headwinds persist. '+(weeksOut>2?'Confidence decays beyond 2 weeks.':'Near-term projection.')},
    };
  }

  // Backtest accuracy — compute when we have both forecast and actual
  // actualDays: days with both real actuals and model forecast in selected range
  const actualDays = weekDays.filter(r=>r.actual>0&&r.forecast>0);
  const backtest = actualDays.length >= 2 ? (()=>{
    const errs = actualDays.map(r=>Math.abs(r.actual-r.forecast)/r.actual);
    const mape = errs.reduce((a,v)=>a+v,0)/errs.length*100;
    const bias = actualDays.reduce((a,r)=>a+(r.forecast-r.actual)/r.actual,0)/actualDays.length*100;
    const passRate = actualDays.filter(r=>r.pass===true).length/actualDays.length*100;
    const accuracy = Math.max(0,Math.min(100,100-mape));
    const best = actualDays.reduce((b,r)=>Math.abs(r.actual-r.forecast)<Math.abs(b.actual-b.forecast)?r:b);
    const worst= actualDays.reduce((b,r)=>Math.abs(r.actual-r.forecast)>Math.abs(b.actual-b.forecast)?r:b);
    return{mape:+mape.toFixed(1),bias:+bias.toFixed(1),passRate:+passRate.toFixed(0),accuracy:+accuracy.toFixed(1),n:actualDays.length,best,worst};
  })() : null;

  // ── Miss diagnosis ─────────────────────────
  // ── Cross-store correlation on miss date ────
  // For a given date, check how many OTHER stores also missed in the same direction
  const missCauses = backtest&&backtest.worst ? diagnoseMiss(loc, ds, userEvents, backtest.worst) : [];
  const bestDrivers = backtest&&backtest.best ? (()=>{
    const r=backtest.best;const ev=userEvents&&userEvents[loc]&&userEvents[loc][dKey(r.date)];
    const d=[];
    if(ev) d.push(ev.icon+' '+ev.label);
    if((r.wAdj||0)>0.01) d.push('☀️ Favorable weather (+'+((r.wAdj||0)*100).toFixed(1)+'%)');
    if((r.opsFactor||1)>1.01) d.push('⚙️ Strong ops execution');
    if((r.t2||0)>0.02) d.push('📈 Positive T2W trend');
    return d.length?d.join(' · '):'Model aligned — no single dominant driver.';
  })() : '';

  return div(null,
    backtest && div({style:{background:'rgba(52,211,153,.06)',border:'.5px solid rgba(52,211,153,.25)',borderRadius:'var(--r)',padding:'12px 16px',marginBottom:12}},
      div({style:{display:'flex',alignItems:'center',gap:8,marginBottom:10}},
        div({style:{fontSize:'13px',fontWeight:700,color:'#34d399'}},'📐 Backtest Accuracy Report'),
        div({style:{fontSize:'10px',color:'var(--text3)'}},'Based on '+backtest.n+' days with actual data in selected range')
      ),
      div({style:{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,marginBottom:10}},
        [{l:'Accuracy Score',v:backtest.accuracy+'%',c:backtest.accuracy>=90?'#10b981':backtest.accuracy>=80?'#84cc16':backtest.accuracy>=70?'#f59e0b':'#ef4444',s:backtest.accuracy>=90?'Excellent':backtest.accuracy>=80?'Good':backtest.accuracy>=70?'Acceptable':'Needs calibration'},
         {l:'MAPE',v:backtest.mape+'%',c:backtest.mape<=5?'#10b981':backtest.mape<=10?'#f59e0b':'#ef4444',s:'Mean abs % error'},
         {l:'Forecast Bias',v:(backtest.bias>0?'+':'')+backtest.bias+'%',c:Math.abs(backtest.bias)<=2?'#10b981':'#f59e0b',s:backtest.bias>2?'Engine skews high':backtest.bias<-2?'Engine skews low':'Unbiased'},
         {l:'Pass Rate',v:backtest.passRate+'%',c:backtest.passRate>=80?'#10b981':backtest.passRate>=60?'#f59e0b':'#ef4444',s:'Days within tolerance'},
        ].map((k,i)=>div({key:i,style:{background:'var(--surf2)',border:'.5px solid var(--bdr)',borderRadius:'var(--r)',padding:'8px 12px',textAlign:'center'}},
          div({style:{fontSize:'9px',color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.3px',marginBottom:4}},k.l),
          div({style:{fontFamily:'var(--mono)',fontSize:'18px',fontWeight:700,color:k.c}},k.v),
          div({style:{fontSize:'9px',color:'var(--text3)',marginTop:2}},k.s)
        ))
      ),
      h(BacktestChart,{actualDays}),
      div({style:{display:'flex',gap:12,flexWrap:'wrap'}},
        backtest.best&&div({style:{flex:1,minWidth:200,background:'rgba(16,185,129,.06)',border:'.5px solid rgba(16,185,129,.2)',borderRadius:'var(--r)',padding:'9px 12px'}},
          div({style:{fontSize:'9px',color:'#34d399',fontWeight:700,textTransform:'uppercase',letterSpacing:'.4px',marginBottom:4}},'✓ Most Accurate Forecast'),
          div({style:{fontSize:'12px',fontWeight:600}},DOW_BASE[(backtest.best.date instanceof Date?backtest.best.date:new Date(backtest.best.date)).getDay()]+' '+(backtest.best.date instanceof Date?backtest.best.date:new Date(backtest.best.date)).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})),
          div({style:{fontSize:'10px',color:'var(--text2)',marginTop:2}},f$(backtest.best.forecast)+' forecast · '+f$(backtest.best.actual)+' actual · ',span({style:{color:'#34d399',fontWeight:600}},fPct((backtest.best.forecast-backtest.best.actual)/backtest.best.actual)+' off')),
          bestDrivers&&div({style:{fontSize:'10px',color:'#34d399',marginTop:5,lineHeight:1.4}},bestDrivers)
        ),
        backtest.worst&&(()=>{
          const [aiResult, setAiResult] = useState({loading:false,text:'',error:null});
          const cross = missCauses.find(c=>c.crossData);
          const affectedCount = cross?(cross.crossData.sameDir.length+1):1;
          const wRow = (fetchWx(ds,backtest.worst.date))||getForecastWeather(loc,backtest.worst.date);
          return div({style:{flex:2,minWidth:240,background:'rgba(239,68,68,.05)',border:'.5px solid rgba(239,68,68,.25)',borderRadius:'var(--r)',padding:'9px 12px'}},
            div({style:{fontSize:'9px',color:'#f87171',fontWeight:700,textTransform:'uppercase',letterSpacing:'.4px',marginBottom:4}},'✗ Biggest Miss — Cause Analysis'),
            div({style:{display:'flex',alignItems:'baseline',gap:8,marginBottom:4,flexWrap:'wrap'}},
              div({style:{fontSize:'12px',fontWeight:600}},DOW_BASE[(backtest.worst.date instanceof Date?backtest.worst.date:new Date(backtest.worst.date)).getDay()]+' '+(backtest.worst.date instanceof Date?backtest.worst.date:new Date(backtest.worst.date)).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})),
              div({style:{fontSize:'10px',color:'var(--text2)'}},f$(backtest.worst.forecast)+' fcst · '+f$(backtest.worst.actual)+' actual'),
              div({style:{fontSize:'11px',fontWeight:700,
                color:backtest.worst.actual>backtest.worst.forecast?'#10b981':'#f87171',marginLeft:'auto'}},
                (backtest.worst.actual>backtest.worst.forecast?'📈 Beat Forecast +':'')+
                (backtest.worst.actual<=backtest.worst.forecast?'':'')+(backtest.worst.actual>backtest.worst.forecast?'':'')+
                (backtest.worst.actual>backtest.worst.forecast
                  ? fPct((backtest.worst.actual-backtest.worst.forecast)/backtest.worst.forecast)+' vs fcst'
                  : fPct((backtest.worst.actual-backtest.worst.forecast)/backtest.worst.forecast)+' vs fcst')
              )
            ),
            // Cross-store summary banner if multi-store
            cross&&div({style:{background:'rgba(249,115,22,.1)',border:'.5px solid rgba(249,115,22,.3)',borderRadius:'var(--r)',padding:'6px 10px',marginBottom:8,display:'flex',gap:8,alignItems:'flex-start'}},
              span({style:{fontSize:'16px',flexShrink:0}},'🏪'),
              div(null,
                div({style:{fontSize:'11px',fontWeight:600,color:'#fb923c',marginBottom:2}},cross.weight+' EVENT — '+cross.crossData.sameDir.length+' OTHER STORES ALSO IMPACTED'),
                div({style:{fontSize:'10px',color:'var(--text2)',lineHeight:1.5}},
                  cross.crossData.sameDir.slice(0,6).map((s,i)=>
                    span({key:i,style:{display:'inline-block',background:'var(--surf)',border:'.5px solid var(--bdr)',borderRadius:3,padding:'1px 6px',fontSize:'9px',fontFamily:'var(--mono)',marginRight:4,marginBottom:2}},s.name.split(' ')[0]+' '+s.loc)
                  ),
                  cross.crossData.sameDir.length>6&&span({style:{fontSize:'9px',color:'var(--text3)'}},'+'+( cross.crossData.sameDir.length-6)+' more')
                )
              )
            ),
            // Cause list
            missCauses.filter(c=>!c.crossData).map((cause,ci)=>div({key:ci,style:{display:'flex',gap:7,padding:'5px 0',borderTop:ci>0?'.5px solid rgba(239,68,68,.12)':'none',alignItems:'flex-start'}},
              span({style:{fontSize:'13px',flexShrink:0,marginTop:1}},cause.icon),
              div({style:{flex:1}},
                span({style:{fontSize:'8px',fontWeight:700,padding:'1px 5px',borderRadius:2,background:'rgba(239,68,68,.12)',color:cause.color,letterSpacing:'.3px',marginRight:5}},cause.weight),
                span({style:{fontSize:'10px',color:'var(--text2)',lineHeight:1.5}},cause.text)
              )
            )),
            // AI Lookup button
            div({style:{marginTop:8,paddingTop:8,borderTop:'.5px solid rgba(239,68,68,.15)'}},
              !aiResult.loading&&!aiResult.text&&btn({
                className:'btn btn-sm',
                style:{fontSize:'10px',background:'rgba(99,102,241,.15)',borderColor:'rgba(99,102,241,.4)',color:'#a5b4fc'},
                onClick:()=>lookupMissEvent(backtest.worst.date,loc,wRow,setAiResult,cross?cross.crossData.sameDir:[])
              },'🤖 AI Lookup — What happened on this date?'),
              aiResult.loading&&div({style:{display:'flex',alignItems:'center',gap:6,fontSize:'10px',color:'#a5b4fc'}},
                span({className:'spinner'}),
                'Searching for events near '+(STORE_COORDS[loc]?STORE_COORDS[loc].city+', OK':'this area')+' on '+(backtest.worst.date instanceof Date?backtest.worst.date:new Date(backtest.worst.date)).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})+'…'
              ),
              aiResult.text&&div({style:{marginTop:6}},
                div({style:{display:'flex',alignItems:'center',gap:6,marginBottom:5}},
                  div({style:{fontSize:'10px',fontWeight:600,color:'#a5b4fc'}},'🤖 AI Analysis'),
                  btn({onClick:()=>setAiResult({loading:false,text:'',error:null}),style:{background:'none',border:'none',color:'var(--text3)',fontSize:'10px',cursor:'pointer',marginLeft:'auto'}}),'× Clear'
                ),
                div({style:{fontSize:'10px',color:'var(--text2)',lineHeight:1.6,background:'rgba(99,102,241,.07)',border:'.5px solid rgba(99,102,241,.2)',borderRadius:'var(--r)',padding:'8px 10px',whiteSpace:'pre-line'}},
                  aiResult.text
                ),
                div({style:{marginTop:8}},
                  div({style:{fontSize:'9px',color:'#a5b4fc',fontWeight:600,textTransform:'uppercase',letterSpacing:'.4px',marginBottom:5}},'📌 Tag this date in Event Calendar'),
                  div({style:{display:'flex',flexWrap:'wrap',gap:4,marginBottom:6}},
                    Object.entries(EVENT_TYPES).map(([k,v])=>
                      btn({key:k,
                        style:{fontSize:'9px',padding:'3px 8px',borderRadius:3,border:'.5px solid '+v.color+'55',background:v.bg,color:v.color,cursor:'pointer'},
                        onClick:()=>{
                          const note=aiResult.text.split('\n').find(l=>l.trim().startsWith('-'))||aiResult.text.slice(0,100);
                          document.dispatchEvent(new CustomEvent('mf_tag_event',{detail:{loc,date:backtest.worst.date,type:k,note:note.replace(/^[-•*]\s*/,'').slice(0,120)}}));
                          setAiResult(prev=>({...prev,tagged:k}));
                        }
                      }, v.icon+' '+v.label)
                    )
                  ),
                  aiResult.tagged&&div({style:{fontSize:'10px',color:'#34d399',fontWeight:600}},
                    '✓ Tagged as '+EVENT_TYPES[aiResult.tagged].label+' · Open Event Calendar to review or edit'
                  )
                )
              ),
              aiResult.error&&div({style:{fontSize:'10px',color:'#f87171',marginTop:6,lineHeight:1.6,whiteSpace:'pre-line'}},
                aiResult.error,
                aiResult.searchUrl&&div({style:{marginTop:6}},
                  btn({className:'btn btn-sm',style:{fontSize:'9px'},onClick:()=>window.open(aiResult.searchUrl,'_blank')},'🔍 Open Web Search Instead')
                )
              )
            )
          );
        })()
      )
    ),
    hasNoLY && div({style:{background:'rgba(129,140,248,.08)',border:'.5px solid rgba(129,140,248,.3)',borderRadius:'var(--r)',padding:'10px 14px',marginBottom:12,display:'flex',alignItems:'center',gap:10}},
      span({style:{fontSize:'20px'}},'ℹ️'),
      div(null,
        div({style:{fontWeight:600,fontSize:'12px',color:'#a5b4fc'}},'New Store — Limited Last-Year Data'),
        div({style:{fontSize:'11px',color:'#94a3b8',marginTop:2}},
          'This location has no prior-year sales history for '+noLYDays+' of '+totalDays+' days in this range. Projections use district trend averages as a substitute baseline. Accuracy will improve as the store builds history. Backtest results for this store will be limited until 12+ months of data are available.'
        )
      )
    ),
    futureDays.length>0 && div({style:{
      display:'flex',gap:8,padding:'10px 0 4px',flexWrap:'wrap',alignItems:'center'}},
      // MAPE-based confidence band — derived from actual store forecast accuracy
      (()=>{
        const calMape = settings&&settings.dialedIn&&settings.dialedIn[loc]&&settings.dialedIn[loc].mape!=null
          ? Math.min(settings.dialedIn[loc].mape/100, 0.25) : 0.10; // cap at 25%, default 10%
        const base = (scenarios&&scenarios.base&&scenarios.base.amt)||0;
        const pastT = scenarios&&scenarios.base&&scenarios.base.pastTotal||0;
        const futT  = scenarios&&scenarios.base&&scenarios.base.futureTotal||0;
        if(base<=0) return null;
        const lo = Math.round(base*(1-calMape));
        const hi = Math.round(base*(1+calMape));
        const mapeLabel = (calMape*100).toFixed(1)+'% MAPE';
        return [
          div({style:{flex:'0 0 auto',textAlign:'center',background:'rgba(239,68,68,.06)',
            border:'.5px solid rgba(239,68,68,.25)',borderRadius:'var(--r)',padding:'6px 14px'}},
            div({style:{fontSize:'8px',color:'#f87171',fontWeight:700,marginBottom:2}},'LOW END'),
            div({style:{fontFamily:'var(--mono)',fontWeight:700,fontSize:'13px',color:'#f87171'}},f$(lo)),
            div({style:{fontSize:'8px',color:'var(--text3)'}},'-'+mapeLabel)
          ),
          div({style:{flex:1,textAlign:'center',padding:'6px 0'}},
            div({style:{fontSize:'8px',color:'var(--text3)',marginBottom:4}},
              pastT>0?(f$(pastT)+' actual + '+f$(futT)+' projected'):'All projected'),
            div({style:{fontFamily:'var(--mono)',fontWeight:800,fontSize:'16px',color:'#a5b4fc'}},f$(base)),
            div({style:{fontSize:'9px',color:'var(--text3)',marginTop:2}},
              'Forecast · ±'+mapeLabel+' confidence'),
            div({style:{display:'flex',height:3,borderRadius:2,overflow:'hidden',marginTop:6,background:'var(--surf2)'}},
              div({style:{flex:1,background:'rgba(239,68,68,.4)'}}),
              div({style:{flex:2,background:'#a5b4fc'}}),
              div({style:{flex:1,background:'rgba(16,185,129,.4)'}})
            )
          ),
          div({style:{flex:'0 0 auto',textAlign:'center',background:'rgba(16,185,129,.06)',
            border:'.5px solid rgba(16,185,129,.25)',borderRadius:'var(--r)',padding:'6px 14px'}},
            div({style:{fontSize:'8px',color:'#10b981',fontWeight:700,marginBottom:2}},'HIGH END'),
            div({style:{fontFamily:'var(--mono)',fontWeight:700,fontSize:'13px',color:'#10b981'}},f$(hi)),
            div({style:{fontSize:'8px',color:'var(--text3)'}},'+'+mapeLabel)
          )
        ];
      })()
    ),
    // Daypart panel — shown when 3 Peaks data produces daypart forecasts
    (()=>{
      const dpDays = weekDays.filter(r=>r.isFuture&&r.dayparts&&Object.keys(r.dayparts).length>=2);
      if(!dpDays.length) return null;
      const sliceInfo={breakfast:{l:'Breakfast',t:'7–9 AM',c:'#f59e0b',bg:'rgba(245,158,11,.07)'},lunch:{l:'Lunch',t:'11 AM–2 PM',c:'#10b981',bg:'rgba(16,185,129,.07)'},dinner:{l:'Dinner',t:'5–7 PM',c:'#818cf8',bg:'rgba(129,140,248,.07)'}};
      // Aggregate dayparts across projection days
      const dpTotals={};
      for(const r of dpDays){for(const[sl,dp]of Object.entries(r.dayparts||{})){if(!dpTotals[sl]){dpTotals[sl]={total:0,days:0,trend:0};}dpTotals[sl].total+=dp.forecast||0;dpTotals[sl].days++;dpTotals[sl].trend+=dp.trend||0;}}
      const hasDp=Object.keys(dpTotals).length>=2;
      if(!hasDp) return null;
      return div({style:{background:'var(--surf2)',border:'.5px solid var(--bdr)',borderRadius:'var(--r)',padding:'10px 14px',marginBottom:10}},
        div({style:{fontSize:'10px',fontWeight:600,color:'var(--text2)',textTransform:'uppercase',letterSpacing:'.4px',marginBottom:8}},
          '📊 Daypart Forecast — '+dpDays.length+'-Day Projection (from 3 Peaks data)'),
        div({style:{display:'flex',gap:8,flexWrap:'wrap'}},
          Object.entries(dpTotals).map(([sl,dp])=>{
            const inf=sliceInfo[sl]||{l:sl,t:'',c:'#94a3b8',bg:'rgba(148,163,184,.07)'};
            const avgTrend=dp.days?dp.trend/dp.days:0;
            return div({key:sl,style:{flex:1,minWidth:130,background:inf.bg,border:`.5px solid ${inf.c}33`,borderRadius:'var(--r)',padding:'9px 12px'}},
              div({style:{display:'flex',alignItems:'baseline',gap:6,marginBottom:6}},
                span({style:{fontSize:'12px',fontWeight:700,color:inf.c}},inf.l),
                span({style:{fontSize:'10px',color:'var(--text3)'}},inf.t)
              ),
              div({style:{fontFamily:'var(--mono)',fontSize:'18px',fontWeight:700,marginBottom:4}},f$(Math.round(dp.total))),
              div({style:{fontSize:'10px',color:avgTrend>=0?'#10b981':'#f87171'}},(avgTrend>=0?'▲ +':'▼ ')+(avgTrend*100).toFixed(1)+'% trend vs LY'),
              div({style:{fontSize:'9px',color:'var(--text3)',marginTop:2}},dp.days+' days · '+f$(Math.round(dp.total/dp.days))+'/day avg')
            );
          })
        )
      );
    })(),
    div({className:'fc-wrap'},
      tbl({className:'fc-tbl'},
        h('thead', null,
          // ── Row 1: Group labels spanning column groups ──
          tr(null,
            th({colSpan:2,style:{background:'var(--surf3)',borderBottom:'.5px solid var(--bdr)'}},''),
            th({colSpan:6,style:{background:'rgba(96,165,250,.06)',borderBottom:'.5px solid var(--bdr)',
              textAlign:'center',fontSize:'8px',color:'var(--text3)',fontWeight:600,letterSpacing:'.3px'}},'SALES PROJECTION'),
            th({colSpan:2,style:{background:'rgba(16,185,129,.06)',borderBottom:'.5px solid var(--bdr)',
              textAlign:'center',fontSize:'8px',color:'#34d399',fontWeight:600,letterSpacing:'.3px'}},'YOY TREND — 6-WK AVG'),
            th({colSpan:3,style:{background:'rgba(245,158,11,.06)',borderBottom:'.5px solid var(--bdr)',
              textAlign:'center',fontSize:'8px',color:'#f59e0b',fontWeight:600,letterSpacing:'.3px'}},'OPS METRICS — 6-WK AVG'),
            th({style:{background:'var(--surf3)',borderBottom:'.5px solid var(--bdr)'}},''),
            th({colSpan:2,style:{background:'rgba(239,68,68,.06)',borderBottom:'.5px solid var(--bdr)',
              textAlign:'center',fontSize:'8px',color:'#f87171',fontWeight:600,letterSpacing:'.3px'}},'RESULT'),
            th({style:{background:'rgba(96,165,250,.04)',borderBottom:'.5px solid var(--bdr)'}},'')
          ),
          // ── Row 2: Column labels ──
          tr(null,
            th({style:{textAlign:'left',whiteSpace:'nowrap'}},'Date'),
            th({style:{textAlign:'left'}},'DOW'),
            th(null,'LY Adj'),
            th(null,'Blend'),
            th({style:{color:'#93c5fd',whiteSpace:'nowrap'}},'AI Fcst'),
            th({style:{textAlign:'center',fontSize:'8px',color:'var(--text3)'},title:'Past days: actual guest count with YOY%. Future days: GC cross-check — ✓=aligned, ⚠=implied avg check >10% off, 🔴=>20% off'},'GC'),
            th(null,'Actual'),
            th({style:{color:'#4ade80'}},'Goal'),
            th({style:{color:'#34d399',fontSize:'9px',lineHeight:1.2,textAlign:'center'}},'T2W',h('br'),h('span',{style:{fontWeight:400,color:'var(--text3)',fontSize:'8px'}},'YOY Sales%')),
            th({style:{color:'#34d399',fontSize:'9px',lineHeight:1.2,textAlign:'center'}},'T6W',h('br'),h('span',{style:{fontWeight:400,color:'var(--text3)',fontSize:'8px'}},'YOY Sales%')),
            th({style:{color:'#f59e0b',fontSize:'9px'}},'OEPE'),
            th({style:{color:'#f59e0b',fontSize:'9px'}},'TPPH'),
            th({style:{color:'#f59e0b',fontSize:'9px'}},'Labor%'),
            th({style:{fontSize:'9px'}},'Ops×'),
            th({style:{color:'#f87171',fontSize:'9px',whiteSpace:'nowrap'}},'AI vs Act'),
            th({style:{color:'#4ade80',fontSize:'9px'}},'✓'),
            th({style:{color:'#a5b4fc',fontSize:'8px',lineHeight:1.3,textAlign:'center'}},'Wx')
          )
        ),
        h('tbody', null, [
          ...weeks.map((wk,wi) => {
          const wkLY  = wk.reduce((a,r)=>a+(r.lyAdj||0),0);
          const wkFC  = wk.reduce((a,r)=>a+(r.forecast||0),0);
          const wkAct = wk.filter(r=>r.actual>0).reduce((a,r)=>a+r.actual,0);
          const wkGoal= wk.reduce((a,r)=>a+(r.goal||0),0);
          const wkLabel= 'Week '+(wi+1)+'  ·  '+wk[0].date.toLocaleDateString('en-US',{month:'short',day:'numeric'})+' – '+wk[wk.length-1].date.toLocaleDateString('en-US',{month:'short',day:'numeric'});
          return [
            wi>0 && tr({key:'wkb'+wi, className:'wkbreak'}, td({colSpan:15}, wkLabel)),
            ...wk.map((r,di) => h(ForecastRow, {key:wi+'-'+di, r, di, wi, tgt, ds, loc, settings, userEvents})),
            (()=>{
              const wkGC   = wk.reduce((a,r)=>a+(r.actualGC||0),0);
              const wkFcGC = wk.reduce((a,r)=>a+(r.forecastGC||0),0);
              return tr({key:'wtot'+wi, className:'wtot'},
                td({colSpan:2}, weeks.length>1?'Wk '+(wi+1)+' Total':'WEEK TOTAL'),
                td(null,f$(wkLY)), td(null,'—'), td({className:'fcc'},f$(wkFC)),
                // GC col: show actual GC sum for the week, or forecast GC if no actuals
                td({style:{textAlign:'center',fontFamily:'var(--mono)',fontSize:'9px',color:'var(--text3)'}},
                  wkGC>0?wkGC.toLocaleString():wkFcGC>0?span({style:{color:'rgba(100,116,139,.7)',fontStyle:'italic'}},wkFcGC.toLocaleString()):'—'),
                td(null,wkAct>0?f$(wkAct):'—'), td({style:{color:'#4ade80'}},f$(wkGoal)),
                td({colSpan:9},null)
              );
            })()
          ];
        }).flat().filter(Boolean),
          // ── Period Total ──
          weekDays.length>1&&(()=>{
            const totLY=weekDays.reduce((a,r)=>a+(r.lyAdj||0),0);
            const totFC=weekDays.reduce((a,r)=>a+(r.forecast||0),0);
            const totAct=weekDays.filter(r=>r.actual>0).reduce((a,r)=>a+r.actual,0);
            const totGoal=weekDays.reduce((a,r)=>a+(r.goal||0),0);
            const pctLabel=totAct>0?'vs Actual':totLY>0?'vs LY':'';
            const pctVal=totAct>0&&totFC>0?(totAct-totFC)/totAct:totLY>0&&totFC>0?(totFC-totLY)/totLY:null;
            return tr({key:'ptot',style:{background:'rgba(245,158,11,.07)',borderTop:'.5px solid rgba(245,158,11,.3)'}},
              td({colSpan:2,style:{padding:'6px 10px',fontFamily:'var(--mono)',fontSize:'10px',fontWeight:700,color:'var(--amber)',textTransform:'uppercase',letterSpacing:'.5px'}},'PERIOD TOTAL · '+weekDays.length+' days'),
              td({style:{fontFamily:'var(--mono)',fontWeight:600}},totLY>0?f$(totLY):'—'),
              td(null,'—'),
              td({className:'fcc',style:{fontSize:'13px',fontWeight:700}},
                div(null,
                  div({style:{fontFamily:'var(--mono)',fontWeight:700}},f$(totFC)),
                  totLY>0?div({style:{fontSize:'8px',fontWeight:600,
                    color:totFC>=totLY?'#10b981':'#f87171'}},(totFC>=totLY?'+':'')+((totFC-totLY)/totLY*100).toFixed(1)+'% vs LY'):null
                )),
              // GC column — period total of actual GC, or forecast GC
              (()=>{
                const totGC   = weekDays.reduce((a,r)=>a+(r.actualGC||0),0);
                const totFcGC = weekDays.reduce((a,r)=>a+(r.forecastGC||0),0);
                return td({style:{textAlign:'center',fontFamily:'var(--mono)',fontSize:'9px',color:'var(--text3)'}},
                  totGC>0?div({style:{display:'flex',flexDirection:'column',alignItems:'center',lineHeight:1.3}},
                    span({style:{fontWeight:700,color:'var(--text2)'}},totGC.toLocaleString()),
                    span({style:{fontSize:'8px'}},totGC>0?'guests':'')
                  ):totFcGC>0?span({style:{fontStyle:'italic',fontSize:'8.5px'}},totFcGC.toLocaleString()):'—');
              })(),
              td({style:{fontFamily:'var(--mono)',fontWeight:600,color:'#60a5fa'}},
                div(null,
                  div(null,totAct>0?f$(totAct):'—'),
                  totAct>0&&totLY>0?div({style:{fontSize:'8px',fontWeight:600,
                    color:totAct>=totLY?'#10b981':'#f87171'}},(totAct>=totLY?'+':'')+((totAct-totLY)/totLY*100).toFixed(1)+'% vs LY'):null
                )),
              td({style:{fontFamily:'var(--mono)',fontWeight:600,color:'#4ade80'}},totGoal>0?f$(totGoal):'—'),
              td({colSpan:7},null), // T2W, T6W, OEPE, TPPH, Labor%, OPS×, AI VS ACT
              td({style:{fontFamily:'var(--mono)',fontSize:'11px',fontWeight:700,color:pctVal!=null?(pctVal>=0?'#4ade80':'#f87171'):'var(--text3)'}},
                pctVal!=null?fPct(pctVal)+' '+pctLabel:'—'),
              td(null)
            );
          })()
        ])
      )
    )
  );
}

// SECTION 11: INTELLIGENCE BRIEF
function Brief({store, rangeTotal, rangeLY}) {
  const imap={crit:'!!',watch:'▶▶',ok:'OK',fc:'FC'};
  const bcls={crit:'bi bi-crit',watch:'bi bi-watch',ok:'bi bi-ok',fc:'bi bi-fc'};
  const icls={crit:'biicon ic-crit',watch:'biicon ic-watch',ok:'biicon ic-ok',fc:'biicon ic-fc'};
  const tcls={crit:'bitext bt-crit',watch:'bitext bt-watch',ok:'bitext bt-ok',fc:'bitext bt-fc'};
  // If we have live range totals, re-compute the forecast finding with correct numbers
  const findings = rangeTotal&&rangeLY
    ? store.findings.filter(f=>f.t!=='fc').concat([{t:'fc',
        m:'AI FORECAST: '+f$(rangeTotal)+' projected this period ('+fPct((rangeTotal-rangeLY)/rangeLY)+' vs LY '+f$(rangeLY)+'). '
          +(rangeTotal>=rangeLY?'Bullish — sustained momentum across T2/T4/T6 trend windows.':'Model reflects current operational headwinds and trend pressure.')
      }])
    : store.findings;
  return div(null,
    div({className:'brief-hdr'}, 'Intelligence Brief — '+store.name),
    findings.map((f,i) =>
      div({key:i, className:bcls[f.t]},
        span({className:icls[f.t]}, imap[f.t]),
        span({className:tcls[f.t]}, f.m)
      )
    )

  );
}

// SECTION 12: SCORECARDS
function OpsScorecard({store, settings}) {
  const {p, p2, p4, t} = store;
  const q2 = p2||p; const q4 = p4||p; // fallback to 6wk if not computed

  // [label, raw_6wk, raw_2wk, raw_4wk, target_raw, higher_better, note, fmt]
  // fmt: 'sec'|'pct'|'num'|'dollar'|null
  const opsRows = [
    ['OEPE W/O Parked', p.oepe, q2.oepe, q4.oepe, t.tOepe, false, 'Lower = faster DT', 'sec'],
    ['KVS Time/GC',     p.kvst, q2.kvst, q4.kvst, t.tKvst, false, 'Kitchen speed',      'sec'],
    ['KVS Healthy %',   p.kvsu, q2.kvsu, q4.kvsu, t.tKvsu, true,  'Dual-side utilization', 'pct'],
    ['DT Parked %',     p.park, q2.park, q4.park, t.tPark, false, 'Pull-forward rate',  'pct'],
    ['TPPH',            p.tpph, q2.tpph, q4.tpph, t.tTpph, true,  'Trans/person hour',  'num'],
    ['R2P',             p.r2p,  q2.r2p,  q4.r2p,  90,      false, 'Dine-in speed ≤90s', 'sec'],
    ['Floor Compliance',p.floorCompliance!=null?p.floorCompliance*100:null,
                        q2.floorCompliance!=null?q2.floorCompliance*100:null,
                        q4.floorCompliance!=null?q4.floorCompliance*100:null,
                        90, true, 'Mgr floor notations', 'pct'],
  ];
  const laborRows = [
    ['Labor %',         p.laborPct*100, q2.laborPct*100, q4.laborPct*100, t.tLabor*100, null, '≤target = green', 'pct'],
    ['Act vs Need',     p.actVsNeed,    q2.actVsNeed,    q4.actVsNeed,    0,            null, 'Scheduling gap',  'num'],
    ['OT Hrs/Day',      p.otHrs,        q2.otHrs,        q4.otHrs,        2,            false,'OT discipline',   'num'],
    ['Avg Rate',        p.avgRate,      q2.avgRate,      q4.avgRate,      null,         null, '6-wk avg wage',   'dollar'],
    ['Salary Mgr Hrs',  p.salaryMgrHrs, q2.salaryMgrHrs, q4.salaryMgrHrs, null,        null, 'Fixed cost',      'num'],
  ];

  const fmtVal = (v, fmt) => {
    if(v==null||v===0&&fmt==='pct') return '—';
    if(fmt==='sec') return v>0?Math.round(v)+'s':'—';
    if(fmt==='pct') return v>0||v<0?fP(v/100,1):'—';
    if(fmt==='dollar') return v>0?'$'+fN(v,2):'—';
    if(fmt==='num') return v!=null?fN(v,v<10?2:0):'—';
    return v!=null?String(v):'—';
  };

  const varColor = (v2, tgt, hb) => {
    if(v2==null||tgt==null||tgt===0) return 'var(--text3)';
    const good = hb===null ? Math.abs(v2-tgt)<=tgt*.01 : hb ? v2>=tgt : v2<=tgt;
    return good ? '#10b981' : '#ef4444';
  };
  const varStr = (v2, tgt, fmt, hb) => {
    if(v2==null||tgt==null) return '—';
    const diff = v2-tgt;
    const s = (diff>=0?'+':'')+fN(diff, fmt==='pct'?1:fmt==='sec'?0:2);
    return fmt==='pct'?s+'pp':fmt==='sec'?s+'s':s;
  };

  const trendDir = (v2, v6) => {
    if(v2==null||v6==null||v6===0) return null;
    const pct = (v2-v6)/Math.abs(v6);
    return Math.abs(pct)<.02?null:pct>0?'↑':'↓';
  };

  const ScRow = ({row, isLabor}) => {
    const [l, v6, v2, v4, tgt, hb, note, fmt] = row;
    const vstr = varStr(v2, tgt, fmt, hb);
    const vcol = varColor(v2, tgt, hb);
    const trend = trendDir(v2, v6);
    const trendCol = hb===false ? (trend==='↓'?'#10b981':trend==='↑'?'#ef4444':null) : (trend==='↑'?'#10b981':trend==='↓'?'#ef4444':null);
    return tr(null,
      td({style:{padding:'5px 8px',color:'var(--text2)',fontSize:'10px'}},
        l, trend&&span({style:{fontSize:'10px',color:trendCol,marginLeft:3}},trend)
      ),
      td({style:{padding:'5px 8px',textAlign:'right',fontFamily:'var(--mono)',fontSize:'10px',
        fontWeight:600,color:'var(--text)'}}, fmtVal(v2, fmt)),
      td({style:{padding:'5px 8px',textAlign:'right',fontFamily:'var(--mono)',fontSize:'10px',
        color:'var(--text3)'}}, fmtVal(v4, fmt)),
      td({style:{padding:'5px 8px',textAlign:'right',fontFamily:'var(--mono)',fontSize:'10px',
        color:'rgba(255,255,255,.35)'}}, fmtVal(v6, fmt)),
      td({style:{padding:'5px 8px',textAlign:'right',fontFamily:'var(--mono)',fontSize:'10px',
        color:tgt!=null?'var(--text3)':'rgba(255,255,255,.25)'}},
        tgt!=null?(fmt==='pct'?fP(tgt/100,1):fmt==='sec'?tgt+'s':fmt==='dollar'?'$'+fN(tgt,2):fN(tgt,1)):'—'),
      td({style:{padding:'5px 8px',textAlign:'right',fontFamily:'var(--mono)',fontSize:'10px',
        fontWeight:600,color:vcol}}, vstr),
      td({style:{padding:'5px 8px',fontSize:'9px',color:'var(--text3)'}}, note)
    );
  };

  const THead = () => tr(null,
    th({style:{padding:'5px 8px',textAlign:'left',fontSize:'8px',textTransform:'uppercase',
      letterSpacing:'.3px',color:'var(--text3)',borderBottom:'.5px solid var(--bdr)',minWidth:130}},'Metric'),
    th({style:{padding:'5px 8px',textAlign:'right',fontSize:'8px',textTransform:'uppercase',
      letterSpacing:'.3px',color:'#60a5fa',borderBottom:'.5px solid var(--bdr)',width:65}},'2-Wk'),
    th({style:{padding:'5px 8px',textAlign:'right',fontSize:'8px',textTransform:'uppercase',
      letterSpacing:'.3px',color:'var(--text3)',borderBottom:'.5px solid var(--bdr)',width:65}},'4-Wk'),
    th({style:{padding:'5px 8px',textAlign:'right',fontSize:'8px',textTransform:'uppercase',
      letterSpacing:'.3px',color:'rgba(255,255,255,.3)',borderBottom:'.5px solid var(--bdr)',width:65}},'6-Wk'),
    th({style:{padding:'5px 8px',textAlign:'right',fontSize:'8px',textTransform:'uppercase',
      letterSpacing:'.3px',color:'var(--text3)',borderBottom:'.5px solid var(--bdr)',width:65}},'Target'),
    th({style:{padding:'5px 8px',textAlign:'right',fontSize:'8px',textTransform:'uppercase',
      letterSpacing:'.3px',color:'var(--text3)',borderBottom:'.5px solid var(--bdr)',width:55}},'Var'),
    th({style:{padding:'5px 8px',fontSize:'8px',textTransform:'uppercase',
      letterSpacing:'.3px',color:'var(--text3)',borderBottom:'.5px solid var(--bdr)'}}, 'Note')
  );

  return div({className:'sc-section'},
    div({className:'sc-hdr', style:{background:'rgba(56,189,248,.08)',color:'#7dd3fc',border:'.5px solid rgba(56,189,248,.2)'}},
      'OPERATIONAL METRICS',
      span({style:{fontSize:'9px',color:'var(--text3)',marginLeft:8,fontWeight:400}},'2-Wk = primary · ↑↓ vs 6-Wk trend'),
      span({style:{marginLeft:'auto',fontFamily:'var(--mono)',fontSize:'15px',color:gCol(store.opsScore)}},
        store.opsScore+' / 100 · '+grade(store.opsScore)+' '+gLbl(store.opsScore))
    ),
    tbl({className:'sc-tbl'},
      h('thead',null,
        tr(null,
          th({colSpan:1,style:{background:'var(--surf3)',borderBottom:'.5px solid var(--bdr)'}},''),
          th({colSpan:3,style:{background:'rgba(96,165,250,.06)',borderBottom:'.5px solid var(--bdr)',
            textAlign:'center',fontSize:'7px',color:'var(--text3)',fontWeight:700,letterSpacing:'.3px',
            textTransform:'uppercase',padding:'3px 8px'}},
            'ROLLING AVERAGES (2-Wk / 4-Wk / 6-Wk)'),
          th({colSpan:2,style:{background:'var(--surf3)',borderBottom:'.5px solid var(--bdr)'}},'')
        ),
        h(THead)
      ),
      h('tbody',null, opsRows.map((row,i)=>h(ScRow,{key:i,row})))
    ),
    div({style:{padding:'4px 10px',background:'rgba(96,165,250,.08)',border:'.5px solid rgba(96,165,250,.25)',borderRadius:'6px 6px 0 0',fontSize:'9px',fontWeight:700,letterSpacing:'.3px',color:'#60a5fa',marginTop:8}},'LABOR & SCHEDULING'),
    tbl({className:'sc-tbl', style:{borderTop:'none',borderRadius:'0 0 6px 6px'}},
      h('thead',null,
            tr(null,
              th({colSpan:1,style:{background:'var(--surf3)',borderBottom:'.5px solid var(--bdr)'}},''),
              th({colSpan:2,style:{background:'rgba(16,185,129,.06)',borderBottom:'.5px solid var(--bdr)',
                textAlign:'center',fontSize:'7px',color:'#34d399',fontWeight:700,letterSpacing:'.3px',
                textTransform:'uppercase',padding:'3px 8px'}},
                'ROLLING AVERAGES (2-Wk · 6-Wk)'),
              th({colSpan:2,style:{background:'var(--surf3)',borderBottom:'.5px solid var(--bdr)'}},'')
            ),
            h(THead)
          ),
      h('tbody',null, laborRows.map((row,i)=>h(ScRow,{key:i,row})))
    )
  );
}

function CtrlScorecard({store}) {
  const {p, p2, p4, t} = store;
  const q2 = p2||p; const q4 = p4||p;

  // THead shared with OpsScorecard style
  const THead = () => tr(null,
    th({style:{padding:'5px 8px',textAlign:'left',fontSize:'8px',textTransform:'uppercase',letterSpacing:'.3px',color:'var(--text3)',borderBottom:'.5px solid var(--bdr)',minWidth:140}},'Metric'),
    th({style:{padding:'5px 8px',textAlign:'right',fontSize:'8px',textTransform:'uppercase',letterSpacing:'.3px',color:'#60a5fa',borderBottom:'.5px solid var(--bdr)',width:65}},'2-Wk'),
    th({style:{padding:'5px 8px',textAlign:'right',fontSize:'8px',textTransform:'uppercase',letterSpacing:'.3px',color:'var(--text3)',borderBottom:'.5px solid var(--bdr)',width:65}},'4-Wk'),
    th({style:{padding:'5px 8px',textAlign:'right',fontSize:'8px',textTransform:'uppercase',letterSpacing:'.3px',color:'rgba(255,255,255,.3)',borderBottom:'.5px solid var(--bdr)',width:65}},'6-Wk'),
    th({style:{padding:'5px 8px',textAlign:'right',fontSize:'8px',textTransform:'uppercase',letterSpacing:'.3px',color:'var(--text3)',borderBottom:'.5px solid var(--bdr)',width:65}},'Target'),
    th({style:{padding:'5px 8px',textAlign:'right',fontSize:'8px',textTransform:'uppercase',letterSpacing:'.3px',color:'var(--text3)',borderBottom:'.5px solid var(--bdr)',width:55}},'Var'),
    th({style:{padding:'5px 8px',fontSize:'8px',textTransform:'uppercase',letterSpacing:'.3px',color:'var(--text3)',borderBottom:'.5px solid var(--bdr)'}},'Note')
  );

  // Ctrl rows: [label, 6wk_val, 2wk_val, 4wk_val, target, pass_fn, note]
  const groups = [
    {l:'CASH INTEGRITY', col:'rgba(239,68,68,.08)', bc:'rgba(239,68,68,.25)', tc:'#f87171', rows:[
      ['Cash Over/Short %',  p.cashOSPct,  q2.cashOSPct,  q4.cashOSPct,  t.tCashOSPct||-.001, v=>Math.abs(v||0)<=.005, 'pct3', '>0.5% = immediate review'],
      ['Drawer Opens/Day',   p.drawerOpens,q2.drawerOpens,q4.drawerOpens, t.tDrawer||50,      v=>v<=(t.tDrawer||50),   'num1', 'Excess opens = cash gap risk'],
    ]},
    {l:'POS INTEGRITY', col:'rgba(249,115,22,.08)', bc:'rgba(249,115,22,.25)', tc:'#fb923c', rows:[
      ['T-Red After %',      p.tRedAPct,   q2.tRedAPct,   q4.tRedAPct,   t.tRedAPct||.003,   v=>v<=(t.tRedAPct||.003),'pct2', 'Post-close voids = manipulation risk'],
      ['T-Red Before %',     p.tRedBPct,   q2.tRedBPct,   q4.tRedBPct,   null,               null,                    'pct2', 'Pre-total voids — context dependent'],
      ['POS Overrings/Day',  p.posOverCnt, q2.posOverCnt, q4.posOverCnt, 5,                  v=>v<=5,                 'num1', '>5/day = investigate'],
      ['Manual Refund/Day',  p.manualRefAmt,q2.manualRefAmt,q4.manualRefAmt,50,              v=>v<=50,                'dollar','Rising trend = flag'],
    ]},
    {l:'REFUND & DISCOUNT', col:'rgba(251,191,36,.08)', bc:'rgba(251,191,36,.2)', tc:'#fbbf24', rows:[
      ['Cash Refund/Day',    p.cashRefCnt, q2.cashRefCnt, q4.cashRefCnt, 2,                  v=>v<=2,                 'num1', 'Harder to audit than cashless'],
      ['Discount % Sales',   p.discPct,    q2.discPct,    q4.discPct,    t.tDiscPct||.05,    v=>v<=.065,              'pct1', '>6.5% without active LTO = check'],
    ]},
    {l:'MEAL ACTIVITY', col:'rgba(52,211,153,.08)', bc:'rgba(52,211,153,.2)', tc:'#34d399', rows:[
      ['Emp Meal/Day',       p.empMealAmt, q2.empMealAmt, q4.empMealAmt, null,               null,                    'dollar','Track for unusual patterns'],
      ['Mgr Meal/Day',       p.mgrMealAmt, q2.mgrMealAmt, q4.mgrMealAmt, null,               null,                   'dollar','Track for unusual patterns'],
    ]},
    {l:'OVERTIME', col:'rgba(96,165,250,.08)', bc:'rgba(96,165,250,.2)', tc:'#60a5fa', rows:[
      ['OT Hours/Day',       p.otHrs,      q2.otHrs,      q4.otHrs,      2,                  v=>v<=2,                 'num1', 'Compresses labor % fast'],
    ]},
  ];

  const fmtV = (v, fmt) => {
    if(v==null) return '—';
    if(fmt==='pct3') return fP(v,3);
    if(fmt==='pct2') return fP(v,2);
    if(fmt==='pct1') return fP(v,1);
    if(fmt==='num1') return fN(v,1);
    if(fmt==='dollar') return '$'+fN(v,2);
    return fN(v,1);
  };

  return div({className:'sc-section', style:{marginTop:14}},
    div({className:'sc-hdr', style:{background:'rgba(249,115,22,.08)',color:'#fb923c',border:'.5px solid rgba(249,115,22,.2)'}},
      'CONTROLS INTEGRITY',
      span({style:{fontSize:'9px',color:'var(--text3)',marginLeft:8,fontWeight:400}},'2-Wk primary · ↑↓ vs 6-Wk'),
      span({style:{marginLeft:'auto',fontFamily:'var(--mono)',fontSize:'15px',color:gCol(store.ctrlScore)}},
        store.ctrlScore+' / 100 · '+grade(store.ctrlScore)+' '+gLbl(store.ctrlScore))
    ),
    groups.map((g,gi) =>
      div({key:gi, style:{marginBottom:8}},
        div({style:{padding:'4px 10px',background:g.col,border:`.5px solid ${g.bc}`,borderRadius:'6px 6px 0 0',fontSize:'9px',fontWeight:700,letterSpacing:'.3px',color:g.tc}}, g.l),
        tbl({className:'sc-tbl', style:{borderTop:'none',borderRadius:'0 0 6px 6px'}},
          h('thead',null, h(THead)),
          h('tbody',null, g.rows.map(([l,v6,v2,v4,tgt,passFn,fmt,note],ri) => {
            const pass = passFn&&v2!=null ? passFn(v2) : null;
            const tgtStr = tgt!=null?(fmt.startsWith('pct')?fP(tgt,1):fmt==='dollar'?'$'+fN(tgt,2):fN(tgt,1)):'—';
            const varV = v2!=null&&tgt!=null ? v2-tgt : null;
            const varS = varV!=null ? ((varV>=0?'+':'')+fmtV(Math.abs(varV),fmt).replace('$','')).replace('--','-') : '—';
            return tr({key:ri},
              td({style:{padding:'5px 8px',fontSize:'10px',color:'var(--text2)'}}, l),
              td({style:{padding:'5px 8px',textAlign:'right',fontFamily:'var(--mono)',fontSize:'10px',fontWeight:600,color:'var(--text)'}}, fmtV(v2,fmt)),
              td({style:{padding:'5px 8px',textAlign:'right',fontFamily:'var(--mono)',fontSize:'10px',color:'var(--text3)'}}, fmtV(v4,fmt)),
              td({style:{padding:'5px 8px',textAlign:'right',fontFamily:'var(--mono)',fontSize:'10px',color:'rgba(255,255,255,.3)'}}, fmtV(v6,fmt)),
              td({style:{padding:'5px 8px',textAlign:'right',fontFamily:'var(--mono)',fontSize:'10px',color:'var(--text3)'}}, tgtStr),
              td({style:{padding:'5px 8px',textAlign:'right',fontFamily:'var(--mono)',fontSize:'10px',fontWeight:600,
                color:pass===null?'var(--text3)':pass?'#10b981':'#ef4444'}}, varV!=null?varS:'—'),
              td({style:{padding:'5px 8px',fontSize:'9px',color:'var(--text3)'}}, note)
            );
          }))
        )
      )
    )
  );
}

// PEAKS TAB COMPONENT
// AI Tab Insight — reusable AI button for any tab
function AITabInsight({buildPrompt, label}) {
  const [insight, setInsight] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [err,     setErr]     = React.useState(null);
  const apiKey = (()=>{try{return localStorage.getItem('mf_anthropic_key')||'';}catch{return '';}})();

  if(!apiKey) return null; // silently hide if no key

  const run = async () => {
    setLoading(true); setErr(null); setInsight(null);
    try {
      const prompt = buildPrompt();
      const resp = await fetch('https://api.anthropic.com/v1/messages',{
        method:'POST',
        headers:{'Content-Type':'application/json','x-api-key':apiKey,
          'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
        body:JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:600,
          messages:[{role:'user',content:prompt}]})
      });
      const data = await resp.json();
      const text = (data.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('').trim();
      setInsight(text||'No insights generated.');
      // Store AI plan globally for printPlan to access
      if(label&&label.includes('Priority')) window._lastAIPriorityPlan=text;
    } catch(e){ setErr('AI error: '+e.message); }
    finally { setLoading(false); }
  };

  return div({style:{marginTop:12,borderTop:'.5px solid var(--bdr)',paddingTop:10}},
    div({style:{display:'flex',alignItems:'center',gap:8,marginBottom:6}},
      btn({className:'btn btn-sm',onClick:run,disabled:loading,
        style:{color:'#a5b4fc',borderColor:'rgba(165,180,252,.3)'}},
        loading?'⏳ Analyzing…':'💡 '+label),
      insight&&btn({className:'btn btn-sm',style:{color:'var(--text3)'},onClick:()=>setInsight(null)},'✕')
    ),
    err&&div({style:{fontSize:'10px',color:'#f87171',padding:'6px 10px',background:'rgba(239,68,68,.06)',borderRadius:'var(--r)'}},err),
    insight&&div({style:{padding:'10px 12px',
      background:'rgba(165,180,252,.06)',borderRadius:'var(--r)',border:'.5px solid rgba(165,180,252,.2)'}},
      ...mdToNodes(insight))
  );
}

function PeaksTab({ds, loc, tgt, settings}) {
  const locStr = String(loc||'').trim();
  // Debug: check what locs are in peaks data
  const allPeakLocs = ds&&ds.peaksSvcRows ? [...new Set(ds.peaksSvcRows.map(r=>String(r.loc||'').trim()))] : [];
  const hasPeaks = allPeakLocs.includes(locStr) ||
    (ds&&ds.peaksSalesRows&&ds.peaksSalesRows.some(r=>String(r.loc||'').trim()===locStr));
  const record = ds&&ds.records&&ds.records[loc];
  const wb = settings.weeksBack||6;
  const peaks = hasPeaks ? analyzePeaks(ds.peaksSvcRows||[],ds.peaksSalesRows||[],loc,wb) : null;
  const sliceInfo = {
    breakfast:{label:'Breakfast',time:'7:00 AM – 9:00 AM',color:'#f59e0b',bg:'rgba(245,158,11,.08)',bdr:'rgba(245,158,11,.25)'},
    lunch:    {label:'Lunch',    time:'11:00 AM – 2:00 PM',color:'#10b981',bg:'rgba(16,185,129,.08)',bdr:'rgba(16,185,129,.25)'},
    dinner:   {label:'Dinner',   time:'5:00 PM – 7:00 PM',color:'#818cf8',bg:'rgba(129,140,248,.08)',bdr:'rgba(129,140,248,.25)'},
  };
  if(!hasPeaks) return div({style:{padding:20}},
    div({className:'empty-st'},
      div({className:'empty-st-t'},'No 3 Peaks data for this store'),
      div({className:'empty-st-s',style:{maxWidth:480}},
        ds&&(ds.peaksSvcRows||[]).length>0
          ? div(null,
              div({style:{marginBottom:8}},'3 Peaks file IS loaded ('+( ds.peaksSvcRows||[]).length+' rows total) but store #'+locStr+' was not found in it.'),
              div({style:{marginBottom:6,fontSize:'11px',color:'var(--text3)'}},'Store numbers found in file: '),
              div({style:{display:'flex',flexWrap:'wrap',gap:4}},
                allPeakLocs.slice(0,20).map(l=>span({key:l,style:{fontFamily:'var(--mono)',fontSize:'10px',padding:'1px 6px',background:'var(--surf3)',border:'.5px solid var(--bdr)',borderRadius:3}},l))
              ),
              allPeakLocs.length>20&&div({style:{fontSize:'10px',color:'var(--text3)',marginTop:4}},'...and '+(allPeakLocs.length-20)+' more'),
              div({style:{marginTop:10,fontSize:'11px',color:'#f59e0b'}},
                '💡 If your store numbers match, check that the 3 Peaks file contains data for store #'+locStr+'. Some QSRSoft exports omit stores with no peak activity.'
              )
            )
          : 'Load a 3 Peaks YYYY-MM-DD to YYYY-MM-DD.xlsx file to activate peak hour analysis.'
      )
    )
  );
  return div(null,
    div({style:{marginBottom:12,padding:'8px 0',borderBottom:'.5px solid var(--bdr)',display:'flex',alignItems:'center',gap:10}},
      div({style:{fontSize:'11px',fontWeight:600,color:'var(--text2)',textTransform:'uppercase',letterSpacing:'.5px'}},'Peak Hour Performance — '+wb+'-Week Avg'),
      div({style:{fontSize:'10px',color:'var(--text3)'}},loc+' · '+STORE_NAMES[loc])
    ),
    ['breakfast','lunch','dinner'].map(sl => {
      const info = sliceInfo[sl];
      const p = peaks&&peaks[sl];
      if(!p) return null;
      const oepeOk = p.oepe>0&&tgt.tOepe>0?p.oepe<=tgt.tOepe:null;
      const r2pOk  = p.r2p>0?p.r2p<=90:null;
      return div({key:sl, style:{background:info.bg,border:`.5px solid ${info.bdr}`,borderRadius:'var(--rl)',padding:'14px 16px',marginBottom:10}},
        div({style:{display:'flex',alignItems:'baseline',gap:10,marginBottom:12}},
          div({style:{fontSize:'14px',fontWeight:700,color:info.color}},info.label),
          div({style:{fontSize:'11px',color:'var(--text2)'}},info.time),
          p.count>0&&div({style:{fontSize:'10px',color:'var(--text3)',marginLeft:'auto'}},p.count+' sessions in window')
        ),
        div({style:{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(120px,1fr))',gap:8}},
          [
            {l:'OEPE',v:p.oepe>0?Math.round(p.oepe)+'s':'—',ok:oepeOk,tg:tgt.tOepe?'Target: '+tgt.tOepe+'s':''},
            {l:'R2P',v:p.r2p>0?Math.round(p.r2p)+'s':'—',ok:r2pOk,tg:'Target: ≤90s'},
            {l:'KVS Time',v:p.kvst>0?Math.round(p.kvst)+'s':'—',ok:p.kvst>0&&tgt.tKvst>0?p.kvst<=tgt.tKvst:null,tg:tgt.tKvst?'Target: '+tgt.tKvst+'s':''},
            {l:'DT Parked %',v:p.parkPct>0?fP(p.parkPct,1):'—',ok:p.parkPct>0&&tgt.tPark>0?p.parkPct<=tgt.tPark:null,tg:tgt.tPark?'Target: '+fP(tgt.tPark):''},
            {l:'Net Sales',v:p.netSales>0?f$(p.netSales):'—',ok:null,tg:'Peak window total'},
            {l:'Transactions',v:p.gc>0?Math.round(p.gc):'—',ok:null,tg:'Peak window GC'},
            {l:'Avg Check',v:p.avgCheck>0?'$'+p.avgCheck.toFixed(2):'—',ok:null,tg:'Peak avg check'},
          ].map((k,i)=>div({key:i,className:'kcard',style:{background:'rgba(0,0,0,.15)'}},
            div({className:'kl'},k.l),
            div({className:'kv',style:{color:k.ok===null?'var(--text)':k.ok?'#10b981':'#f97316',fontSize:'15px'}},k.v),
            div({className:'ks',style:{color:k.ok===null?'var(--text3)':k.ok?'#065f46':'#7c2d12'}},k.tg)
          ))
        )
      );
    }),
    record && div({style:{marginTop:16}},
      div({className:'sec-lbl',style:{marginBottom:10}},'Store All-Time Records'),
      div({style:{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))',gap:8}},
        Object.entries(record).filter(([k])=>k!=='loc').map(([k,v],i)=>
          div({key:i,style:{background:'var(--surf2)',border:'.5px solid var(--bdr)',borderRadius:'var(--r)',padding:'9px 11px'}},
            div({style:{fontSize:'9px',color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.3px',marginBottom:3}},v.label),
            div({style:{fontFamily:'var(--mono)',fontSize:'15px',fontWeight:700,color:'#f59e0b'}},
              typeof v.value==='number'&&v.value>1000?f$(v.value):typeof v.value==='number'?v.value.toFixed(2):v.value
            ),
            v.date&&div({style:{fontSize:'9px',color:'var(--text3)',marginTop:2}},'Set: '+v.date.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}))
          )
        )
      )
    ),
    hasPeaks&&h(AITabInsight,{
      label:'AI Analysis — 3 Peaks',
      buildPrompt:()=>{
        const storeName=STORE_NAMES[loc]||loc;
        const bk=peaks&&peaks.breakfast||{}, ln=peaks&&peaks.lunch||{}, dn=peaks&&peaks.dinner||{};
        const fv = (v,suffix) => v>0?(+v.toFixed(v<10?2:0))+suffix:'no data';
        return 'You are a McDonald\'s service speed expert. Analyze this 3 Peaks data for '+storeName+' (#'+loc+').\n\n'+
          'BREAKFAST — OEPE: '+fv(bk.oepe,'s')+' | R2P: '+fv(bk.r2p,'s')+' | TPPH: '+fv(bk.tpph,'')+' | Park%: '+fv(bk.parkPct*100,'%')+'\n'+
          'LUNCH     — OEPE: '+fv(ln.oepe,'s')+' | R2P: '+fv(ln.r2p,'s')+' | TPPH: '+fv(ln.tpph,'')+' | Park%: '+fv(ln.parkPct*100,'%')+'\n'+
          'DINNER    — OEPE: '+fv(dn.oepe,'s')+' | R2P: '+fv(dn.r2p,'s')+' | TPPH: '+fv(dn.tpph,'')+' | Park%: '+fv(dn.parkPct*100,'%')+'\n\n'+
          'Give 3-5 specific, actionable recommendations to improve speed and throughput. Call out which daypart needs the most attention first. Include specific tactics for EXPO discipline, pre-sell, and order accuracy. Be direct.';
      }
    })
  );
}

function generatePlan(store, settings) {
  const {p,t,findings,opsScore:os,ctrlScore:cs,loc} = store;
  const crits  = findings.filter(f=>f.t==='crit');
  const watchs = findings.filter(f=>f.t==='watch');
  const oks    = findings.filter(f=>f.t==='ok');
  const green  = (settings&&settings.laborGreenPct||0.5)/100;
  const yellow = (settings&&settings.laborYellowPct||1.5)/100;

  // Build priority actions from findings + metric gaps
  const actions = [];

  // OT first if critical
  if((p.otHrs||0)>2) {
    const otCost = Math.round((p.otHrs||0)*1.5*(p.avgRate||12)*30);
    actions.push({
      priority:'HIGH', category:'Labor Cost', icon:'💰',
      issue:`Overtime averaging ${(p.otHrs||0).toFixed(1)} hrs/day`,
      target:'≤ 2.0 OT hrs/day',
      gap:`${((p.otHrs||0)-2).toFixed(1)} hrs over`,
      cost:`~$${otCost.toLocaleString()}/month in OT premium`,
      steps:[
        'Audit current schedule for structural OT causes (shift overlap, early call-ins, late closures). Review current staffing levels vs. projected need',
        'Review peak coverage — is OT driven by volume or scheduling gaps?',
        'Set hard stop on voluntary OT without manager approval',
        'Schedule 30-min review with the store manager — identify which specific shifts are generating OT',
        'Implement daily OT tracking visible to all managers'
      ],
      week1:'Identify top 3 OT-generating shifts. Document and present findings.',
      week2:'New schedule implemented. Track week-over-week OT change to validate improvement.',
      week3:'Track compliance. Address any schedule drift immediately.',
      week4:'Measure result. Target: OT ≤ 2.0/day. Recalibrate if needed.'
    });
  }

  // Cash O/S if elevated
  if(Math.abs(p.cashOSPct||0)>.003) {
    actions.push({
      priority:Math.abs(p.cashOSPct||0)>.005?'CRITICAL':'HIGH', category:'Cash Integrity', icon:'🔒',
      issue:`Cash Over/Short at ${((p.cashOSPct||0)*100).toFixed(3)}% of sales`,
      target:'< 0.10% average',
      gap:`${(Math.abs(p.cashOSPct||0)*100-.1).toFixed(3)}% above threshold`,
      cost:`~$${Math.round(Math.abs(p.cashOSPct||0)*(p.laborPct>0?120000:80000))}/yr estimated exposure`,
      steps:[
        'Pull register-level report for last 30 days — identify which drawers/shifts are driving variance',
        'Compare deposit slips to POS daily summary for each day in the period',
        'Review drawer open frequency by cashier — high opens correlate with cash gaps',
        'Implement double-count protocol at shift change for all drawers over ±$5',
        'Supervisor spot-count at least 3 drawers per week unannounced'
      ],
      week1:'Complete register audit review. Flag top 3 high-risk employees to supervisor.',
      week2:'Double-count protocol live on all shifts. Review first week results.',
      week3:'Compare O/S trend week-over-week. Hold individual coaching if still elevated.',
      week4:'Target: < 0.10%. If not achieved, escalate to full video audit.'
    });
  }

  // OEPE if elevated
  if((t.tOepe||0)>0&&(p.oepe||0)>t.tOepe+10) {
    const gapSec = Math.round((p.oepe||0)-t.tOepe);
    actions.push({
      priority:'HIGH', category:'Drive-Thru Speed', icon:'⏱',
      issue:`OEPE at ${Math.round(p.oepe||0)}s vs ${t.tOepe}s target (+${gapSec}s)`,
      target:`≤ ${t.tOepe}s OEPE`,
      gap:`${gapSec} seconds above target`,
      cost:`Est. ${Math.round(gapSec/30*4)} additional abandoned cars/peak hour`,
      steps:[
        'Time-study the window sequence: order → cashier → expo → delivery. Identify the longest dwell point.',
        'Review beverage staging — pre-positioned vs made-to-order at window is the single biggest OEPE lever',
        'Check pull-time execution — cars being held at window instead of stacked',
        'Review crew positioning during peak: dedicated window vs flex roles',
        'Set OEPE visible on KVS or digital board during peak hours for real-time awareness'
      ],
      week1:'Conduct window time-study during top 2 peak windows. Document dwell breakdown.',
      week2:'Implement top fix (usually beverage staging or pull timing). Measure.',
      week3:'Track OEPE daily. Coach any shift running >15s over target.',
      week4:`Target: ${t.tOepe}s or better. Document what worked — replicate across shifts.`
    });
  }

  // T-Red After if elevated
  if((t.tRedAPct||0)>0&&(p.tRedAPct||0)>t.tRedAPct*1.3) {
    actions.push({
      priority:'CRITICAL', category:'POS Integrity', icon:'🚨',
      issue:`T-Red After at ${((p.tRedAPct||0)*100).toFixed(2)}% (target: ${((t.tRedAPct||0)*100).toFixed(2)}%)`,
      target:`≤ ${((t.tRedAPct||0)*100).toFixed(2)}% T-Red After`,
      gap:`${(((p.tRedAPct||0)-(t.tRedAPct||0))*100).toFixed(2)}% above target`,
      cost:'Unquantifiable — integrity risk. Cannot be left unaddressed.',
      steps:[
        'Pull T-Red After report by register and by shift — isolate timing and location',
        'Cross-reference with video for top 5 T-Red After dates in the period',
        'Review with store manager — has this been tracked and addressed previously?',
        'Set up daily T-Red After alert — any day over threshold triggers same-day review',
        'Require manager approval for any Reduction after Total is pressed on ePOS over $5'
      ],
      week1:'Complete video cross-reference on top 5 events. Document findings.',
      week2:'Approval process live for Reductions after Total is pressed on ePOS. Track compliance.',
      week3:'Review T-Red After trend. Any repeat patterns = escalate.',
      week4:'Target: at or below threshold. Ongoing weekly monitoring required.'
    });
  }

  // Labor % if off
  const laborDiff = (p.laborPct||0)-(t.tLabor||0);
  if(t.tLabor>0&&Math.abs(laborDiff)>yellow) {
    actions.push({
      priority:Math.abs(laborDiff)>.03?'HIGH':'MEDIUM', category:'Labor Management', icon:'👥',
      issue:`Labor % at ${((p.laborPct||0)*100).toFixed(1)}% vs ${((t.tLabor||0)*100).toFixed(1)}% target`,
      target:`${((t.tLabor||0)*100).toFixed(1)}% ± ${(yellow*100).toFixed(1)}%`,
      gap:`${(Math.abs(laborDiff)*100).toFixed(1)}% ${laborDiff>0?'over':'under'} target`,
      cost:laborDiff>0?`~$${Math.round(laborDiff*80000*12/52)}/week above labor budget`:'Under-labor may be impacting service',
      steps:[
        laborDiff>0?'Verify floor management compliance first — incomplete floor notations inflate variable hours':'Confirm staffing levels are meeting traffic demand',
        'Review schedule against actual punches — identify early arrivals, late departures, and no-shows',
        'Compare act vs need vs actual hours by day — scheduling gap or over-schedule?',
        laborDiff>0?'Establish schedule approval process: manager builds → supervisor approves before posting':'Consider adding strategic positions during proven high-volume windows',
        'Track labor % daily, not just weekly — catch problems before they compound'
      ],
      week1:'Complete schedule vs punch audit for last 2 weeks. Document gaps.',
      week2:'Revised scheduling process live. First full week of new approach.',
      week3:'Measure improvement. Is labor % moving toward target?',
      week4:`Target: ${((t.tLabor||0)*100).toFixed(1)}% ± ${(yellow*100).toFixed(1)}%. Adjust and continue.`
    });
  }

  // If no critical issues, add a continuous improvement action
  if(actions.length===0) {
    actions.push({
      priority:'MAINTAIN', category:'Continuous Improvement', icon:'📈',
      issue:'All primary metrics within acceptable ranges',
      target:'Sustain current performance while driving top-line growth',
      gap:'Focus shifts from correction to optimization',
      cost:'Opportunity cost: each 1% OEPE improvement → ~3 additional transactions/peak',
      steps:[
        'Document what is working well — standardize and train to these practices',
        'Identify the single metric closest to threshold — address it proactively',
        'Set a stretch goal: if OEPE is at target, can you beat it by 5s this month?',
        'Share this store\'s strengths with other stores in the patch',
        'Review records data — which all-time bests are reachable this period?'
      ],
      week1:'Document top 3 operational strengths and how they are being maintained.',
      week2:'Identify stretch metric. Set measurable goal.',
      week3:'Mid-period check: on track for stretch goal?',
      week4:'Assess results. Celebrate wins. Set next period targets.'
    });
  }

  const overallHealth = os>80&&cs>80?'STRONG':os>70&&cs>70?'SOLID':crits.length>0?'NEEDS ATTENTION':'DEVELOPING';
  const outlook = store.pSales>store.pLY?'Positive trend — store is running ahead of prior year.':store.pLY>0?'Store is running behind prior year. Sales-side focus needed alongside ops improvements.':'Insufficient LY data for trend comparison.';

  return {actions, overallHealth, outlook, crits, watchs, oks, os, cs};
}

function ActionPlanTab({store, ds, settings, dateRange}) {
  const plan = useMemo(()=>generatePlan(store,settings),[store,settings]);
  const {p,t} = store;
  const printPlan = () => {
    const win=window.open('','_blank');
    const priorityColor={CRITICAL:'#dc2626',HIGH:'#ea580c',MEDIUM:'#d97706',MAINTAIN:'#16a34a'};
    const actionHtml=plan.actions.map(a=>`
      <div style="border:1px solid #ddd;border-radius:6px;padding:14px 16px;margin-bottom:14px;page-break-inside:avoid">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
          <span style="font-size:18px">${a.icon}</span>
          <div>
            <span style='background:${priorityColor[a.priority]||'#666'};color:white;font-size:10px;font-weight:700;padding:2px 8px;border-radius:3px">${a.priority}</span>
            <strong style="margin-left:8px;font-size:14px">${a.category}</strong>
          </div>
        </div>
        <p style="margin:4px 0;font-size:13px"><strong>Issue:</strong> ${a.issue}</p>
        <p style="margin:4px 0;font-size:13px"><strong>Target:</strong> ${a.target}</p>
        <p style="margin:4px 0;font-size:12px;color:#555"><strong>Gap:</strong> ${a.gap}</p>
        ${a.cost?`<p style="margin:4px 0 10px;font-size:12px;color:#555"><strong>Impact:</strong> ${a.cost}</p>`:''}
        <div style="margin:10px 0">
          <strong style="font-size:11px;text-transform:uppercase;letter-spacing:.5px">Action Steps</strong>
          <ol style="margin:6px 0 0;padding-left:18px;font-size:12px;line-height:1.7">
            ${a.steps.map(s=>`<li>${s}</li>`).join('')}
          </ol>
        </div>
        <div style="background:#f8f8f8;border-radius:4px;padding:10px;margin-top:8px;font-size:11px">
          <strong>Checkpoints:</strong><br>
          Week 1: ${a.week1}<br>Week 2: ${a.week2}<br>Week 3: ${a.week3}<br>Week 4: ${a.week4}
        </div>
      </div>`).join('');
    win.document.write(`<!DOCTYPE html><html><head><title>Action Plan — ${store.name}</title>
      <style>body{font-family:Arial,sans-serif;padding:28px;color:#111;max-width:800px;margin:0 auto}
      h1{font-size:22px;margin-bottom:4px}h2{font-size:14px;font-weight:600;margin:18px 0 6px;color:#333;border-bottom:1px solid #eee;padding-bottom:4px}
      p{margin:0 0 6px;font-size:13px}@page{margin:.6in}
/* ═══════════════════════════════════════════
   SIDEBAR & TOPBAR — v0.dev layout
═══════════════════════════════════════════ */

/* Sidebar scrollbar */
aside::-webkit-scrollbar{width:4px;}
aside::-webkit-scrollbar-track{background:transparent;}
aside::-webkit-scrollbar-thumb{background:var(--bdr2);border-radius:2px;}

/* Smooth sidebar hover states */
.sidebar-nav-item{
  display:flex;align-items:center;gap:8px;
  padding:5px 10px;border-radius:var(--r);
  cursor:pointer;font-size:12px;font-weight:400;
  color:var(--text2);transition:all .12s;
  user-select:none;
}
.sidebar-nav-item:hover{background:var(--surf2);color:var(--text);}
.sidebar-nav-item.active{
  background:var(--adim);color:var(--amber);font-weight:600;
}
.sidebar-section-label{
  font-size:9px;font-weight:700;letter-spacing:.8px;
  text-transform:uppercase;color:var(--text3);
  padding:10px 10px 3px;margin-top:2px;
}

/* KPI strip */
.kpi-strip{
  display:flex;flex-direction:row;align-items:stretch;gap:0;
  background:var(--surf);border-bottom:.5px solid var(--bdr);
  overflow-x:auto;flex-shrink:0;width:100%;
}
.kpi-tile{
  display:flex;flex-direction:column;gap:2px;
  padding:8px 20px;flex-shrink:0;
  border-right:.5px solid var(--bdr);
}
.kpi-tile-label{
  font-size:9px;font-weight:700;letter-spacing:.6px;
  text-transform:uppercase;color:var(--text3);
}
.kpi-tile-value{
  font-size:16px;font-weight:700;font-family:var(--mono);
  color:var(--amber);line-height:1;
}
.kpi-tile-trend{
  display:flex;align-items:center;gap:3px;
  font-size:9px;font-family:var(--mono);
}

/* Projection cell colors (v0.dev style) */
.proj-cell-above-strong{background:rgba(16,185,129,.18);}
.proj-cell-above{background:rgba(16,185,129,.09);}
.proj-cell-below{background:rgba(239,68,68,.09);}
.proj-cell-below-strong{background:rgba(239,68,68,.18);}
.proj-cell-actual{border-top:2px solid rgba(16,185,129,.4);}
.proj-cell-projected{border-top:2px solid rgba(100,116,139,.3);}

/* Pulse animation */
@keyframes pulse{
  0%,100%{opacity:1;}
  50%{opacity:.5;}
}

</style></head><body>
      <h1>📋 Action Plan — ${store.name}</h1>
      <p style="color:#666;font-size:12px">${settings.districtName} · Store #${store.loc} · Generated ${new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}</p>
      <div style="display:flex;gap:12px;margin:12px 0;flex-wrap:wrap">
        <div style="padding:8px 14px;background:#f0f9f4;border:1px solid #bbf7d0;border-radius:4px;font-size:12px"><strong>Ops Health:</strong> ${store.opsScore}/100</div>
        <div style="padding:8px 14px;background:#fff7ed;border:1px solid #fed7aa;border-radius:4px;font-size:12px"><strong>Controls:</strong> ${store.ctrlScore}/100</div>
        <div style="padding:8px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px;font-size:12px"><strong>Status:</strong> ${plan.overallHealth}</div>
      </div>
      <h2>OVERALL OUTLOOK</h2><p>${plan.outlook}</p>
      <h2>PRIORITY ACTION ITEMS</h2>${actionHtml}
      ${window._lastAIPriorityPlan ? `<h2>AI COACHING ANALYSIS</h2>
        <div style="background:#f8f8f8;border-left:4px solid #c8a840;padding:16px 20px;margin-top:8px;border-radius:0 6px 6px 0;font-size:12px;line-height:1.8;white-space:pre-wrap">${window._lastAIPriorityPlan.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/^## (.*$)/gm,'<strong style=\"font-size:13px\">$1</strong><br>').replace(/^### (.*$)/gm,'<em>$1</em><br>').replace(/^- (.*$)/gm,'• $1<br>').replace(/\n/g,'<br>')}</div>` : ''}
      <p style="color:#999;font-size:10px;margin-top:20px;border-top:1px solid #eee;padding-top:8px">Generated by Meridian · ${settings.districtName}</p>
      </body></html>
`);
    win.document.close();win.print();
  };

  const priorityColors={CRITICAL:{bg:'rgba(239,68,68,.08)',bdr:'rgba(239,68,68,.3)',tc:'#f87171'},HIGH:{bg:'rgba(249,115,22,.07)',bdr:'rgba(249,115,22,.3)',tc:'#fb923c'},MEDIUM:{bg:'rgba(245,158,11,.07)',bdr:'rgba(245,158,11,.25)',tc:'#f59e0b'},MAINTAIN:{bg:'rgba(16,185,129,.06)',bdr:'rgba(16,185,129,.25)',tc:'#34d399'}};

  return div(null,
    div({style:{display:'flex',alignItems:'center',gap:10,marginBottom:14,flexWrap:'wrap'}},
      div({style:{flex:1}},
        div({style:{fontSize:'14px',fontWeight:700}},'📋 Action Plan — '+store.name),
        div({style:{fontSize:'11px',color:'var(--text2)',marginTop:2}},
          'Status: ',span({style:{fontWeight:600,color:plan.overallHealth==='STRONG'?'#10b981':plan.overallHealth==='SOLID'?'#84cc16':'#f97316'}},plan.overallHealth),
          ' · Ops: '+plan.os+'/100 · Controls: '+plan.cs+'/100'
        )
      ),
      btn({className:'btn btn-sm',onClick:printPlan},'⎙ Print Plan')
    ),
    div({style:{background:'var(--surf2)',border:'.5px solid var(--bdr)',borderRadius:'var(--r)',padding:'10px 14px',marginBottom:14,fontSize:'11px',color:'var(--text2)',lineHeight:1.6}},
      span({style:{fontWeight:600,color:'var(--text)'}},'30-Day Outlook: '),plan.outlook
    ),
    plan.actions.map((a,i)=>{
      const pc=priorityColors[a.priority]||priorityColors.MEDIUM;
      const [open,setOpen]=useState(true);
      return div({key:i,style:{background:pc.bg,border:`.5px solid ${pc.bdr}`,borderRadius:'var(--r)',marginBottom:10,overflow:'hidden'}},
        div({style:{padding:'10px 14px',display:'flex',alignItems:'center',gap:10,cursor:'pointer'},onClick:()=>setOpen(o=>!o)},
          span({style:{fontSize:'18px',flexShrink:0}},a.icon),
          div({style:{flex:1}},
            div({style:{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}},
              span({style:{fontSize:'9px',fontWeight:700,padding:'2px 7px',borderRadius:3,background:pc.bdr,color:pc.tc}},a.priority),
              span({style:{fontSize:'12px',fontWeight:600}},a.category)
            ),
            div({style:{fontSize:'11px',color:'var(--text2)',marginTop:2}},a.issue)
          ),
          span({style:{fontSize:'12px',color:'var(--text3)'}}),open?'▲':'▼'
        ),
        open&&div({style:{padding:'0 14px 12px',borderTop:`.5px solid ${pc.bdr}`}},
          div({style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,margin:'10px 0',fontSize:'11px'}},
            div(null,span({style:{color:'var(--text3)'}},'Target: '),span({style:{fontWeight:600}},a.target)),
            div(null,span({style:{color:'var(--text3)'}},'Gap: '),span({style:{fontWeight:600,color:pc.tc}},a.gap))
          ),
          a.cost&&div({style:{fontSize:'10px',color:'var(--text3)',marginBottom:8}},a.cost),
          div({style:{marginBottom:10}},
            div({style:{fontSize:'10px',fontWeight:600,textTransform:'uppercase',letterSpacing:'.4px',color:'var(--text2)',marginBottom:6}},'Action Steps'),
            a.steps.map((step,si)=>div({key:si,style:{display:'flex',gap:8,fontSize:'11px',padding:'4px 0',borderBottom:`.5px solid ${pc.bdr}`,lineHeight:1.5}},
              span({style:{fontFamily:'var(--mono)',fontSize:'10px',color:pc.tc,flexShrink:0,paddingTop:1}},(si+1)+'.'),
              span(null,step)
            ))
          ),
          div({style:{background:'var(--surf)',borderRadius:'var(--r)',padding:'10px 12px',fontSize:'10px'}},
            div({style:{fontWeight:600,marginBottom:6,color:'var(--text2)',textTransform:'uppercase',letterSpacing:'.4px'}},'4-Week Checkpoints'),
            ['Wk 1','Wk 2','Wk 3','Wk 4'].map((wl,wi)=>div({key:wi,style:{display:'flex',gap:8,padding:'3px 0',borderBottom:wi<3?`.5px solid var(--bdr)`:'none'}},
              span({style:{fontFamily:'var(--mono)',color:pc.tc,fontWeight:700,minWidth:32,flexShrink:0}},wl),
              span({style:{color:'var(--text2)'}},[a.week1,a.week2,a.week3,a.week4][wi])
            ))
          )
        )
      );
    }),
    plan.oks.length>0&&div({style:{marginTop:8}},
      div({style:{fontSize:'10px',fontWeight:600,textTransform:'uppercase',letterSpacing:'.4px',color:'var(--text3)',marginBottom:8}},'Strengths to Protect'),
      plan.oks.slice(0,3).map((f,i)=>div({key:i,style:{fontSize:'11px',color:'#34d399',padding:'4px 10px',background:'rgba(52,211,153,.06)',border:'.5px solid rgba(52,211,153,.2)',borderRadius:'var(--r)',marginBottom:4}},f.m))
    )
  );
}

// DISTRICT GRID (SECTION 13a)
function StoreCard({store, onSelect}) {
  const {p, t, opsScore, ctrlScore, name, loc, city} = store;
  const combined = Math.round(opsScore*0.6+ctrlScore*0.4);
  const trend = p.t2w!=null?p.t2w:null;
  const healthColor = combined>=80?'#10b981':combined>=65?'#f59e0b':'#ef4444';
  const hasRecords = store.hasRecords;
  return div({className:'store-card',onClick:()=>onSelect(store),
    style:{borderLeft:'3px solid '+(store.org==='Emerald Arches'?'var(--ea-accent)':'var(--mcdok-accent)')}},
    div({style:{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}},
      div(null,
        div({style:{display:'flex',alignItems:'center',gap:4}},
          div({style:{fontWeight:700,fontSize:'13px'}},(name.length>26?name.replace(/-/g,'\u2011').slice(0,25)+'\u2026':name)),
          hasRecords&&span({style:{fontSize:'9px',cursor:'default'},title:'This store has records data loaded'},'🏆')
        ),
        div({style:{fontSize:'9px',color:'var(--text3)'}},
          (store.city||city||'')+', '+(store.state||'OK')+' · #'+loc),
        store.gm&&div({style:{fontSize:'9px',color:'var(--text3)',marginTop:1}},'GM: '+store.gm)
      ),
      div({style:{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:3}},
        div({style:{fontFamily:'var(--mono)',fontSize:'20px',fontWeight:700,color:healthColor}},combined),
        store.org&&store.org!=='MCDOK'&&span({style:{fontSize:'8px',fontWeight:700,padding:'1px 5px',
          borderRadius:3,background:'rgba(167,139,250,.15)',color:'#a78bfa',
          border:'.5px solid rgba(167,139,250,.3)'}},store.org),
        div({style:{display:'flex',alignItems:'center',gap:2}},h(ModelHealthBadge,{loc:store.loc,settings:window._mfSettings||{},ds:window._mfDS||{},showDetail:false}),h(InfoIcon,{articleKey:'model_health'}))
      )
    ),
    div({style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'3px 6px',fontSize:'10px',marginBottom:6}},
      ...[
        ['Ops',opsScore+'/100',opsScore>=80?'#10b981':opsScore>=65?'#f59e0b':'#ef4444'],
        ['Ctrl',ctrlScore+'/100',ctrlScore>=80?'#10b981':ctrlScore>=65?'#f59e0b':'#ef4444'],
        ['OEPE',p.oepe>0?Math.round(p.oepe)+'s':'—',p.oepe>0&&t.tOepe>0?(p.oepe<=t.tOepe?'#10b981':'#ef4444'):'#94a3b8'],
        ['TPPH',p.tpph>0?p.tpph.toFixed(2):'—',p.tpph>0&&t.tTpph>0?(p.tpph>=t.tTpph?'#10b981':'#ef4444'):'#94a3b8'],
        ['Labor',p.laborPct>0?fP(p.laborPct,1):'—',laborColor(p.laborPct,t.tLabor,{laborGreenPct:.5,laborYellowPct:2}).color],
        ['T2W',trend!=null?fPct(trend):'—',trend!=null?(trend>=0?'#10b981':'#ef4444'):'#94a3b8'],
      ].map(([l,v,c],i)=>div({key:i,style:{display:'flex',justifyContent:'space-between',borderBottom:'.5px solid rgba(255,255,255,.04)',paddingBottom:2}},
        span({style:{color:'var(--text3)'}},l),
        span({style:{fontFamily:'var(--mono)',color:c,fontWeight:600}},v)
      ))
    ),
    // Show top critical issue (not raw count) — clickable to go to store
    (()=>{
      const crits=store.findings.filter(f=>f.t==='crit');
      const warns=store.findings.filter(f=>f.t==='warn');
      if(!crits.length&&!warns.length) return null;
      const topMsg=crits.length?(crits[0].m||'').slice(0,40):warns[0]&&(warns[0].m||'').slice(0,40);
      return div({
        onClick:()=>{if(onSelect)onSelect(store);},
        style:{fontSize:'9px',cursor:'pointer',userSelect:'none',
          color:crits.length?'#f87171':'#f59e0b',
          background:crits.length?'rgba(239,68,68,.08)':'rgba(245,158,11,.08)',
          border:'.5px solid '+(crits.length?'rgba(239,68,68,.2)':'rgba(245,158,11,.2)'),
          borderRadius:3,padding:'3px 7px',marginTop:2,
          display:'flex',alignItems:'center',gap:4},
        title:'Click to open '+store.name+' — '+crits.length+' critical, '+warns.length+' watch'},
        span(null,crits.length?'⚠':'◉'),
        span({style:{fontWeight:600}},crits.length?'Critical':'Watch'),
        crits.length>0&&span({style:{opacity:.7}},': '+topMsg.split('–')[0].trim().slice(0,30)+'…')
      );
    })()
  );
}

function DistrictGrid({stores, ds, settings, dateRange, userEvents, onSelectStore}) {
  const [sort, setSort] = useState('score');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [showUpload, setShowUpload] = useState(!ds||!ds.loaded);

  const sorted = useMemo(()=>{
    let s=[...stores];
    if(search) s=s.filter(st=>st.name.toLowerCase().includes(search.toLowerCase())||String(st.loc).includes(search));
    if(filter==='crit') s=s.filter(st=>st.findings.some(f=>f.t==='crit'));
    if(filter==='watch') s=s.filter(st=>st.findings.some(f=>f.t==='warn'));
    s.sort((a,b)=>{
      if(sort==='score') return (b.opsScore*0.6+b.ctrlScore*0.4)-(a.opsScore*0.6+a.ctrlScore*0.4);
      if(sort==='oepe') return (a.p.oepe||999)-(b.p.oepe||999);
      if(sort==='tpph') return (b.p.tpph||0)-(a.p.tpph||0);
      if(sort==='labor') return (a.p.laborPct||0)-(b.p.laborPct||0);
      if(sort==='t2w') return (b.p.t2w||0)-(a.p.t2w||0);
      return 0;
    });
    return s;
  },[stores,sort,filter,search]);

  const distScore = stores.length?Math.round(stores.reduce((a,s)=>a+(s.opsScore*0.6+s.ctrlScore*0.4),0)/stores.length):0;
  const critCount = stores.reduce((a,s)=>a+s.findings.filter(f=>f.t==='crit').length,0);

  return div(null,
    // District summary bar
    div({style:{display:'flex',gap:8,padding:'8px 0 14px',flexWrap:'wrap',alignItems:'center'}},
      [{l:'District Score',v:distScore+'/100',c:distScore>=80?'#10b981':distScore>=65?'#f59e0b':'#ef4444'},
       {l:'Stores Loaded',v:(ds&&ds.storeIds?ds.storeIds.length:0)+'/'+Object.keys(STORE_NAMES).length,c:ds&&ds.loaded?'#10b981':'#94a3b8'},
       {l:'Critical Findings',v:critCount,c:critCount>0?'#ef4444':'#10b981'},
       {l:'Watch Flags',v:stores.reduce((a,s)=>a+s.findings.filter(f=>f.t==='warn').length,0),c:'#f59e0b'},
       {l:'Data Status',v:ds&&ds.loaded?'Live':'Mock',c:ds&&ds.loaded?'#10b981':'#94a3b8',/* click removed — showDataStatus not implemented */},
      ].map((k,i)=>div({key:i,className:'kpi-card',
        style:{flex:1,minWidth:100,cursor:k.click?'pointer':'default',
          outline:k.click?'.5px solid rgba(255,255,255,.08)':'none'},
        onClick:k.click||undefined,title:k.click?'Click for details':''},
        div({className:'kpi-l'},k.l),
        div({className:'kpi-v',style:{color:k.c,fontSize:'18px'}},k.v)
      ))
    ),

    // Upload prompt if no data
    !ds||!ds.loaded?div({style:{marginBottom:16,background:'rgba(96,165,250,.06)',border:'.5px solid rgba(96,165,250,.2)',borderRadius:'var(--rl)',padding:'16px 20px'}},
      div({style:{fontSize:'13px',fontWeight:700,marginBottom:6}},'📂 Load QSRSoft Data'),
      div({style:{fontSize:'11px',color:'var(--text2)',marginBottom:10,lineHeight:1.6}},
        'Drop any QSRSoft export anywhere on the page, or click Load in the header. Accepts: Labor Analysis, Service, Controls, 3 Peaks, Register Audit, Mesonet weather CSV, and Targets files.'),
      div({style:{fontSize:'10px',color:'var(--text3)'}},
        'While waiting for data, the app shows projected numbers based on district averages and default targets.')
    ):null,

    // Sort/filter toolbar
    div({style:{display:'flex',gap:6,marginBottom:12,flexWrap:'wrap',alignItems:'center'}},
      ['score','oepe','tpph','labor','t2w'].map(s=>btn({key:s,className:'sbtn'+(sort===s?' on':''),onClick:()=>setSort(s),style:{fontSize:'10px'}},
        {score:'Score',oepe:'OEPE',tpph:'TPPH',labor:'Labor',t2w:'Trend'}[s])),
      span({style:{borderLeft:'.5px solid var(--bdr)',margin:'0 2px'}}),
      ['all','crit','watch'].map(f=>btn({key:f,className:'sbtn'+(filter===f?' on':''),onClick:()=>setFilter(f),style:{fontSize:'10px'}},
        {all:'All',crit:'⚠ Critical',watch:'Watch'}[f])),
      inp({className:'srch',placeholder:'Search store…',value:search,onChange:e=>setSearch(e.target.value),style:{marginLeft:'auto',width:120}})
    ),

    // Store cards grid
    div({style:{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))',gap:8}},
      sorted.map(s=>h(StoreCard,{key:s.loc,store:s,onSelect:onSelectStore}))
    )
  );
}

// ORG VIEW
function OrgView({stores, settings, onSelectStore}) {
  const operators = settings.operators||{};
  const supervisors = settings.supervisorGroups||{};
  const byOp = Object.entries(operators).map(([name,locs])=>({name,stores:stores.filter(s=>locs.includes(s.loc))})).filter(g=>g.stores.length>0);
  const bySup = Object.entries(supervisors).map(([name,locs])=>({name,stores:stores.filter(s=>locs.includes(s.loc))})).filter(g=>g.stores.length>0);
  const [view,setView]=useState('operator');

  const GroupCard=({group,onSelectStore})=>{
    const avg=s=>group.stores.length?group.stores.reduce((a,st)=>a+s(st),0)/group.stores.length:0;
    const comb=avg(s=>s.opsScore*0.6+s.ctrlScore*0.4);
    const crits=group.stores.reduce((a,s)=>a+s.findings.filter(f=>f.t==='crit').length,0);
    return div({style:{background:'var(--surf2)',border:'.5px solid var(--bdr)',borderRadius:'var(--rl)',overflow:'hidden',marginBottom:12}},
      div({style:{padding:'10px 14px',borderBottom:'.5px solid var(--bdr)',display:'flex',alignItems:'center',gap:10}},
        div({style:{flex:1}},
          div({style:{fontWeight:700,fontSize:'13px'}},group.name),
          div({style:{fontSize:'10px',color:'var(--text3)'}},group.stores.length+' stores · '+group.stores.map(s=>'#'+s.loc).join(', '))
        ),
        div({style:{fontFamily:'var(--mono)',fontSize:'18px',fontWeight:700,color:comb>=80?'#10b981':comb>=65?'#f59e0b':'#ef4444'}},Math.round(comb)),
        crits>0&&div({style:{fontSize:'9px',color:'#f87171',fontWeight:700}},crits+' crit')
      ),
      div({style:{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(190px,1fr))',gap:6,padding:10}},
        group.stores.map(s=>h(StoreCard,{key:s.loc,store:s,onSelect:onSelectStore}))
      )
    );
  };

  return div(null,
    div({style:{display:'flex',gap:6,marginBottom:14}},
      [['operator','By Operator'],['supervisor','By Patch'],['all','All Stores']].map(([k,l])=>btn({key:k,className:'sbtn'+(view===k?' on':''),onClick:()=>setView(k)},l))
    ),
    view==='operator'&&(byOp.length>0?byOp.map((g,i)=>h(GroupCard,{key:i,group:g,onSelectStore})):div({style:{color:'var(--text3)',padding:16,fontSize:'11px'}},'Configure operator groups in Settings → Operator Groups')),
    view==='supervisor'&&(bySup.length>0?bySup.map((g,i)=>h(GroupCard,{key:i,group:g,onSelectStore})):div({style:{color:'var(--text3)',padding:16,fontSize:'11px'}},'Configure supervisor patches in Settings → Supervisor Patches')),
    view==='all'&&div({style:{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(210px,1fr))',gap:8}},stores.filter(s=>/^\d+$/.test(s.loc)).map(s=>h(StoreCard,{key:s.loc,store:s,onSelect:onSelectStore})))
  );
}

// RANKING VIEW
// UNIVERSAL EXPORT DROPDOWN  (v171)
// Reusable export button: CSV · JSON · HTML Report · Print
// Props: rows (array), columns ([{key,label}]), title, filename
//        extraHTML (optional pre-built HTML string for the report body)
function ExportDropdown({rows, columns, title, filename, extraHTML, btnClassName}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);

  // Close on outside click
  React.useEffect(()=>{
    const h=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);};
    document.addEventListener('mousedown',h);return()=>document.removeEventListener('mousedown',h);
  },[]);

  const dl = (text, fname, mime) => {
    const blob=new Blob([text],{type:mime});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download=fname;document.body.appendChild(a);a.click();
    setTimeout(()=>{URL.revokeObjectURL(url);document.body.removeChild(a);},800);
  };

  const toCSV = () => {
    if(!rows||!rows.length) return alert('No data to export.');
    const cols = columns || Object.keys(rows[0]).map(k=>({key:k,label:k}));
    const header = cols.map(c=>'"'+c.label+'"').join(',');
    const body   = rows.map(r=>cols.map(c=>{
      const v=r[c.key];
      if(v==null) return '""';
      if(typeof v==='number') return v;
      return '"'+String(v).replace(/"/g,'""')+'"';
    }).join(',')).join('\n');
    dl(header+'\n'+body, (filename||title||'export')+'.csv', 'text/csv');
    setOpen(false);
  };

  const toJSON = () => {
    if(!rows||!rows.length) return alert('No data to export.');
    dl(JSON.stringify({title,exportedAt:new Date().toISOString(),rows},null,2),
      (filename||title||'export')+'.json','application/json');
    setOpen(false);
  };

  const toHTML = () => {
    const cols = columns || (rows&&rows.length?Object.keys(rows[0]).map(k=>({key:k,label:k})):[]);
    const now = new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
    const tbl = extraHTML || (rows&&rows.length?
      '<table style="border-collapse:collapse;width:100%;font-size:11px">'+
      '<thead><tr>'+cols.map(c=>'<th style="border:1px solid #ddd;padding:5px 8px;background:#f5f5f7;font-size:9px;text-transform:uppercase;letter-spacing:.4px">'+c.label+'</th>').join('')+'</tr></thead>'+
      '<tbody>'+rows.map((r,i)=>'<tr style="background:'+(i%2?'#f9f9f9':'#fff')+'">'
        +cols.map(c=>'<td style="border:1px solid #ddd;padding:4px 8px">'+(r[c.key]!=null?r[c.key]:'')+'</td>').join('')+'</tr>').join('')+
      '</tbody></table>':'<p>No data</p>');
    const html='<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">'+
      '<title>'+title+'</title>'+
      '<style>body{font-family:system-ui,sans-serif;padding:24px;color:#1c1c1e}h1{font-size:20px;margin:0 0 4px}p.meta{font-size:11px;color:#666;margin:0 0 16px}'+
      '@media print{button{display:none}}</style></head><body>'+
      '<button onclick="window.print()" style="margin-bottom:16px;padding:6px 14px;background:#007aff;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px">🖨 Print</button>'+
      '<h1>'+title+'</h1><p class="meta">Generated '+now+' · Meridian</p>'+
      tbl+'</body></html>';
    const win=window.open('','_blank','width=1100,height=850');
    win.document.write(html);win.document.close();
    setOpen(false);
  };

  const menuStyle={position:'absolute',top:'calc(100% + 4px)',right:0,zIndex:350,
    background:'var(--surf)',border:'.5px solid var(--bdr2)',borderRadius:'var(--rl)',
    boxShadow:'0 8px 28px rgba(0,0,0,.35)',overflow:'hidden',minWidth:160};
  const itemStyle={display:'block',width:'100%',textAlign:'left',padding:'7px 14px',
    background:'none',border:'none',fontSize:'11px',cursor:'pointer',color:'var(--text)',
    borderBottom:'.5px solid var(--bdr)'};

  return div({ref,style:{position:'relative',display:'inline-block'}},
    btn({className:btnClassName||'btn btn-sm',
      style:{display:'flex',alignItems:'center',gap:4},
      onClick:()=>setOpen(o=>!o)},
      '⬇ Export',span({style:{fontSize:'9px',color:'var(--text3)'}},' '+(open?'▲':'▼'))),
    open&&div({style:menuStyle},
      btn({style:itemStyle,onClick:toCSV},'📊 Download CSV'),
      btn({style:itemStyle,onClick:toJSON},'📋 Download JSON'),
      btn({style:{...itemStyle,borderBottom:'none'},onClick:toHTML},'📄 HTML Report / Print')
    )
  );
}

function RankingView({stores, ds, settings, dateRange, onDateChange, defaultMetric, onSelectStore, onClose}) {
  const [metric, setMetric] = useState(defaultMetric||'score');
  // Sync if defaultMetric changes (when opened from different nav sources)
  React.useEffect(()=>{if(defaultMetric)setMetric(defaultMetric);},[defaultMetric]);
  // Pre-compute GC vs LY per store using dateRange
  const addDR=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x;};
  // Self-contained local date range — NOT dependent on App-level dateRange round-trip
  const [rankRange, setRankRange] = React.useState(()=>{
    const e=addDR(new Date(),-1);return{s:addDR(e,-27),e,id:'l4w'};
  });
  const [activePreset, setActivePreset] = React.useState('l4w');
  const DR = rankRange;
  const gcVsLYMap=React.useMemo(()=>{
    const lyS=addDR(DR.s,-364),lyE=addDR(DR.e,-364);
    const res={};
    (stores||[]).forEach(s=>{
      const cur=(ds.laborRows||[]).filter(r=>String(r.loc)===String(s.loc)&&r.date>=DR.s&&r.date<=DR.e&&r.gc>0);
      const ly=(ds.laborRows||[]).filter(r=>String(r.loc)===String(s.loc)&&r.date>=lyS&&r.date<=lyE&&r.gc>0);
      const gc=cur.reduce((a,r)=>a+(r.gc||0),0);
      const gcLY=ly.reduce((a,r)=>a+(r.gc||0),0);
      res[String(s.loc)]=gcLY>10?(gc-gcLY)/gcLY:null;
    });
    return res;
  },[stores,ds.laborRows,DR.s,DR.e]);

  // Quick date presets for Rankings
  const DR_PRESETS=[
    {l:'Today',   id:'today', fn:()=>{const d=new Date();return{s:d,e:d,label:'Today'}}},
    {l:'Yest',    id:'yest',  fn:()=>{const d=addDR(new Date(),-1);return{s:d,e:d,label:'Yesterday'}}},
    {l:'LW',      id:'lw',    fn:()=>{const e=addDR(new Date(),-1);const s=addDR(e,-6);return{s,e,label:'Last Week'}}},
    {l:'L2W',     id:'l2w',   fn:()=>{const e=addDR(new Date(),-1);const s=addDR(e,-13);return{s,e,label:'Last 2 Weeks'}}},
    {l:'MTD',     id:'mtd',   fn:()=>{const t=new Date();return{s:new Date(t.getFullYear(),t.getMonth(),1),e:t,label:'Month to Date'}}},
    {l:'L4W',     id:'l4w',   fn:()=>{const e=addDR(new Date(),-1);const s=addDR(e,-27);return{s,e,label:'Last 4 Weeks'}}},
    {l:'L6W',     id:'l6w',   fn:()=>{const e=addDR(new Date(),-1);const s=addDR(e,-41);return{s,e,label:'Last 6 Weeks'}}},
  ];

  const METRICS = [
    {id:'score',    l:'Combined Score',    fn:s=>s.opsScore*0.6+s.ctrlScore*0.4,  fmt:v=>Math.round(v),      higherBetter:true},
    {id:'ops',      l:'Ops Score',         fn:s=>s.opsScore,                       fmt:v=>v+'/100',           higherBetter:true},
    {id:'ctrl',     l:'Controls Score',    fn:s=>s.ctrlScore,                      fmt:v=>v+'/100',           higherBetter:true},
    {id:'oepe',     l:'OEPE (lower=better)',fn:s=>s.p.oepe||0,                    fmt:v=>v>0?Math.round(v)+'s':'—', higherBetter:false},
    {id:'tpph',     l:'TPPH (higher=better)',fn:s=>s.p.tpph||0,                  fmt:v=>v>0?v.toFixed(2):'—', higherBetter:true},
    {id:'kvst',     l:'KVS Time',          fn:s=>s.p.kvst||0,                     fmt:v=>v>0?Math.round(v)+'s':'—', higherBetter:false},
    {id:'park',     l:'DT Parked%',        fn:s=>s.p.park||0,                     fmt:v=>v>0?fP(v,1):'—',    higherBetter:null},
    {id:'labor',    l:'Labor %',           fn:s=>s.p.laborPct||0,                 fmt:v=>v>0?fP(v,1):'—',    higherBetter:false},
    {id:'t2w',      l:'2-Wk vs LY',            fn:s=>s.p.t2w||0,                      fmt:v=>fPct(v),            higherBetter:true},
    {id:'gc',       l:'GC vs LY',              fn:s=>gcVsLYMap[String(s.loc)]??-999,  fmt:v=>v>-999?(v>=0?'+':'')+(v*100).toFixed(1)+'%':'—', higherBetter:true},
    {id:'cashOS',   l:'Cash O/S',          fn:s=>Math.abs(s.p.cashOSPct||0),      fmt:v=>fP(v,3),            higherBetter:false},
    {id:'tRedA',    l:'T-Red After%',      fn:s=>s.p.tRedAPct||0,                 fmt:v=>fP(v,3),            higherBetter:false},
    {id:'ot',       l:'OT Hours',          fn:s=>s.p.otHrs||0,                    fmt:v=>v>0?v.toFixed(1):'—', higherBetter:false},
    {id:'r2p',      l:'R2P (lower=better)',fn:s=>s.p.r2p||0,                     fmt:v=>v>0?Math.round(v)+'s':'—', higherBetter:false},
    {id:'disc',     l:'Discount%',         fn:s=>s.p.discPct||0,                  fmt:v=>v>0?fP(v,2):'—',    higherBetter:false},
    {id:'mape',     l:'Forecast MAPE',     fn:s=>settings.dialedIn&&settings.dialedIn[s.loc]&&settings.dialedIn[s.loc].mape!=null?settings.dialedIn[s.loc].mape:999,
                    fmt:v=>v<900?v.toFixed(1)+'%':'—',                             higherBetter:false},
  ];
  const m=METRICS.find(x=>x.id===metric)||METRICS[0];
  // ── LOCAL metric recomputation based on selected DR ──────────────────────
  // The stores prop has pre-computed p.* metrics for a fixed App-level window.
  // This memo recomputes all key metrics from ds filtered by the CURRENT DR
  // so the period selector actually changes what the rankings show.
  const localStats = React.useMemo(()=>{
    const res={};
    const a=(rows,f)=>{const v=rows.map(r=>r[f]).filter(v=>v!=null&&v>0);return v.length?v.reduce((a,b)=>a+b)/v.length:null;};
    const az=(rows,f)=>{const v=rows.map(r=>r[f]).filter(v=>v!=null&&!isNaN(v));return v.length?v.reduce((a,b)=>a+b)/v.length:null;};
    (stores||[]).forEach(s=>{
      const loc=String(s.loc);
      const cR=(ds.ctrlRows||[]).filter(r=>String(r.loc)===loc&&r.date>=DR.s&&r.date<=DR.e);
      const lR=(ds.laborRows||[]).filter(r=>String(r.loc)===loc&&r.date>=DR.s&&r.date<=DR.e&&r.sales>0);
      const oR=(ds.opsRows||[]).filter(r=>String(r.loc)===loc&&r.date>=DR.s&&r.date<=DR.e);
      res[loc]={
        laborPct: a(cR,'laborPct') || a(lR,'laborPct'),
        tpph:     a(cR,'tpph')     || a(lR,'tpph'),
        oepe:     a(oR,'oepe'),
        kvst:     a(oR,'kvst'),
        park:     a(oR,'park'),
        otHrs:    az(lR,'otHrs'),
        cashOSPct:az(cR,'cashOSPct'),
        tRedAPct: az(cR,'tRedAPct'),
        discPct:  az(cR,'discPct'),
        r2p:      a(oR,'r2p'),
        sales:    lR.reduce((a,r)=>a+(r.sales||0),0),
      };
    });
    return res;
  },[stores,ds,rankRange.s.getTime?.()??0,rankRange.e.getTime?.()??0]);

  // Augment each store with locally-computed metrics so period changes take effect
  const augStores = React.useMemo(()=>(stores||[]).map(s=>({
    ...s,
    p:{...s.p,...(localStats[String(s.loc)]||{})}
  })),[stores,localStats]);

  const sorted=[...augStores]
    .sort((a,b)=>{
      const va=m.fn(a),vb=m.fn(b);
      // Nulls / zeros sort to bottom regardless of direction
      const aNull=va==null||va===0||va===-999;
      const bNull=vb==null||vb===0||vb===-999;
      if(aNull&&bNull) return 0;
      if(aNull) return 1;
      if(bNull) return -1;
      return m.higherBetter===false?va-vb:vb-va;
    });

  return div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.65)',zIndex:300,display:'flex',alignItems:'center',justifyContent:'center',padding:20}},
    div({style:{background:'var(--surf)',borderRadius:'var(--rl)',border:'.5px solid var(--bdr2)',width:'100%',maxWidth:640,display:'flex',flexDirection:'column',maxHeight:'88vh',overflow:'hidden'}},
      div({style:{padding:'10px 18px',borderBottom:'.5px solid var(--bdr)',display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}},
        div({style:{fontSize:'14px',fontWeight:800,color:'var(--text)'}},'🏆 District Rankings'),
        DR&&div({style:{fontSize:'8px',color:'var(--text3)',padding:'2px 7px',borderRadius:3,background:'rgba(255,255,255,.05)',border:'.5px solid var(--bdr)',marginLeft:4}},
          'Period: '+(DR.label||new Date(DR.s).toLocaleDateString('en-US',{month:'short',day:'numeric'})+' – '+new Date(DR.e).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}))),
        div({style:{display:'flex',gap:6,alignItems:'center',marginLeft:'auto'}},
          h(ExportDropdown,{
            title:'Store Rankings',
            filename:'rankings_'+new Date().toISOString().slice(0,10),
            rows:sorted.map(s=>({
              Store: sName(s.loc),
              [m.l]: m.fmt(m.fn(s)),
              'Labor %': s.p.laborPct!=null?((s.p.laborPct*100).toFixed(1)+'%'):'—',
              'TPPH': s.p.tpph!=null?s.p.tpph.toFixed(2):'—',
              'OEPE': s.p.oepe?Math.round(s.p.oepe)+'s':'—',
              'Sales': s.p.sales>0?f$(s.p.sales):'—',
            })),
          }),
          btn({onClick:onClose,style:{background:'none',border:'none',color:'var(--text2)',fontSize:20,cursor:'pointer'}},'×'))
      ),
      onDateChange&&div({style:{padding:'5px 14px',borderBottom:'.5px solid var(--bdr)',display:'flex',gap:3,flexWrap:'wrap',background:'var(--surf2)'}},
        span({style:{fontSize:'8px',color:'var(--text3)',alignSelf:'center',marginRight:4}},'Filter period:'),
        DR_PRESETS.map(p=>btn({key:p.id,className:'btn btn-sm',
          style:{fontSize:'8px',padding:'2px 6px',
            background:activePreset===p.id?'rgba(245,188,0,.12)':'transparent',
            color:activePreset===p.id?'var(--gold)':'var(--text3)',
            borderColor:activePreset===p.id?'rgba(245,188,0,.4)':'rgba(255,255,255,.1)'},
          onClick:()=>{
            const r=p.fn();
            setRankRange({s:r.s,e:r.e,id:p.id});
            setActivePreset(p.id);
            onDateChange&&onDateChange({...r,preset:p.id,label:p.l});
          }},p.l))
      ),
      div({style:{padding:'8px 18px',borderBottom:'.5px solid var(--bdr)',display:'flex',gap:4,flexWrap:'wrap'}},
        METRICS.map(mx=>btn({key:mx.id,className:'sbtn'+(metric===mx.id?' on':''),onClick:()=>setMetric(mx.id),style:{fontSize:'10px'}},mx.l.split('(')[0].trim()))
      ),
      div({style:{overflowY:'auto',flex:1}},
        sorted.map((s,i)=>{
          const val=m.fn(s);const fmt=m.fmt(val);
          const color=i===0?'#f59e0b':i<3?'#34d399':i>=sorted.length-3?'#f87171':'var(--text)';
          return div({key:s.loc,style:{display:'flex',alignItems:'center',gap:12,padding:'10px 18px',borderBottom:'.5px solid var(--bdr)',cursor:'pointer',background:'transparent'},
            onClick:()=>{onSelectStore(s);onClose();}},
            div({style:{fontFamily:'var(--mono)',fontSize:'13px',fontWeight:700,color,minWidth:24,textAlign:'right'}},i+1),
            div({style:{flex:1}},
              div({style:{fontWeight:600,fontSize:'12px'}},s.name),
              div({style:{fontSize:'9px',color:'var(--text3)'}},s.city+' · #'+s.loc)
            ),
            div({style:{fontFamily:'var(--mono)',fontSize:'16px',fontWeight:700,color}},fmt)
          );
        })
      )
    )
  );
}

// TARGET MANAGER

// MONTHLY TARGET MANAGER — Option C: Per-month versioned targets
// UNIFIED TARGETS PANEL  (v182)
// Single source of truth for all targets.
// Tier 1 📋 Official — from uploaded 2026 Yearly Targets file (DEFAULT_TARGETS)
// Tier 2 💡 Smart    — best-quartile derived from ds history
// Tier 3 —  Current  — last 4W actual average from loaded data
// Distinguishes clearly: what management set vs what data suggests.
// PERFORMANCE CALCULATOR  (v182 — New Tools)
// Interactive what-if: shows how improving one metric chains through
// the McDonald's throughput model to affect GC, Sales, Labor, TPPH.
// OEPE → throughput → GC → sales → labor needed → TPPH impact
function PerformanceCalculator({stores, ds, settings, onClose}) {
  const {useState:uSt, useMemo:uM} = React;
  const LOCS = Object.keys(STORE_NAMES).sort((a,b)=>STORE_NAMES[a].localeCompare(STORE_NAMES[b]));
  const [selLoc, setSelLoc] = uSt(LOCS[0]);
  const [oepe,   setOepe]   = uSt(140);
  const [laborP, setLaborP] = uSt(22);
  const [avgChk, setAvgChk] = uSt(10.50);

  // Compute baseline actuals from last 6W data
  const baseline = uM(()=>{
    const cutoff = addDR(new Date(),-42);
    const oR = (ds.opsRows||[]).filter(r=>String(r.loc)===selLoc&&r.date>=cutoff&&r.oepe>0);
    const lR = (ds.laborRows||[]).filter(r=>String(r.loc)===selLoc&&r.date>=cutoff&&r.sales>0);
    const avg = (rows,f)=>{const v=rows.map(r=>r[f]).filter(v=>v>0);return v.length?v.reduce((a,b)=>a+b)/v.length:null;};
    const baseOepe  = avg(oR,'oepe') || 140;
    const baseLab   = (avg(lR,'laborPct')||.22) * 100;
    const baseChk   = avg(lR,'avgCheck') || 10.50;
    const baseDailySales = avg(lR,'sales') || 12000;
    const baseGC    = avg(lR,'gc') || Math.round(baseDailySales/baseChk);
    const baseTpph  = avg(lR,'tpph') || 5.5;
    const baseHours = baseDailySales * (baseLab/100) / (avg(lR,'avgRate')||15);
    return {baseOepe,baseLab,baseChk,baseDailySales,baseGC,baseTpph,baseHours};
  },[ds,selLoc]);

  // Initialize sliders to baseline when store changes
  React.useEffect(()=>{
    setOepe(Math.round(baseline.baseOepe));
    setLaborP(parseFloat((baseline.baseLab).toFixed(1)));
    setAvgChk(parseFloat((baseline.baseChk).toFixed(2)));
  },[selLoc, baseline.baseOepe]);

  // ── Throughput model ──────────────────────────────────────────────
  // OEPE = time from order complete to car departure
  // Order-taking time ~30s, pullout time ~10s
  // Total service time ≈ OEPE + 30s order time
  // Cars per hour = 3600 / totalServiceTime
  const model = uM(()=>{
    const orderTime = 30, safetyGap = 5;
    const baseCph = 3600 / (baseline.baseOepe + orderTime + safetyGap);
    const newCph  = 3600 / (oepe + orderTime + safetyGap);
    const cphChange = (newCph - baseCph) / baseCph;

    // GC impact — not all OEPE improvement converts to GC (demand-limited vs capacity-limited)
    // Capacity-constrained store (KB tag) → 80% of throughput gain → GC
    // Demand-limited → 30% (people come when they come, speed just improves experience)
    const kb = getKB(selLoc);
    const isCapLimited = (kb.tags||[]).includes('capacity-limited') || (kb.tags||[]).includes('high-volume');
    const conversionRate = isCapLimited ? 0.75 : 0.30;
    const gcChangeRate = cphChange * conversionRate;
    const newDailyGC  = Math.round(baseline.baseGC * (1 + gcChangeRate));
    const gcDelta     = newDailyGC - baseline.baseGC;

    // Sales impact from GC change + any average check change
    const newDailySales = newDailyGC * avgChk;
    const salesDelta    = newDailySales - baseline.baseDailySales;

    // Labor impact
    const newLaborAmt  = newDailySales * (laborP/100);
    const newHours     = newLaborAmt / 15; // assume $15 avg rate
    const hoursDelta   = newHours - baseline.baseHours;

    // TPPH impact
    const newTpph = newHours > 0 ? newDailyGC / newHours : baseline.baseTpph;

    return {
      baseCph: baseCph.toFixed(1), newCph: newCph.toFixed(1),
      gcDelta, newDailyGC,
      salesDelta, newDailySales,
      hoursDelta, newHours: newHours.toFixed(0),
      newTpph: newTpph.toFixed(2),
      isCapLimited, cphChange,
    };
  },[oepe, laborP, avgChk, baseline, selLoc]);

  const delta = (v,unit,reverse)=>{
    const sign = v>=0?'+':'';
    const formatted = unit==='$'?sign+'$'+(Math.abs(v)<1000?v.toFixed(0):(v/1000).toFixed(1)+'k'):
      unit==='%'?sign+v.toFixed(1)+'%':sign+v.toFixed(1);
    const color = (v>0&&!reverse)||( v<0&&reverse) ? '#10b981' :
                  (v<0&&!reverse)||(v>0&&reverse)  ? '#ef4444' : 'var(--text3)';
    return span({style:{color,fontWeight:700,fontFamily:'var(--mono)'}},(formatted));
  };

  const f$ = v=>'$'+(v<1000?v.toFixed(0):(v/1000).toFixed(1)+'k');
  const Slider = ({label,min,max,step,val,onChg,unit,fmt})=>
    div({style:{marginBottom:14}},
      div({style:{display:'flex',justifyContent:'space-between',marginBottom:4}},
        span({style:{fontSize:'10px',fontWeight:600,color:'var(--text2)'}},(label)),
        span({style:{fontSize:'12px',fontWeight:800,color:'var(--amber)',fontFamily:'var(--mono)'}},
          (fmt?fmt(val):(unit==='s'?val+'s':val+'%')))
      ),
      h('input',{type:'range',min,max,step,value:val,
        onChange:e=>onChg(parseFloat(e.target.value)),
        style:{width:'100%',accentColor:'var(--amber)',cursor:'pointer'}})
    );

  const KpiCard = ({l,base,now,unit,reverse})=>
    div({style:{background:'var(--surf2)',border:'.5px solid var(--bdr)',borderRadius:'var(--r)',
      padding:'8px 12px',flex:'1 1 110px',minWidth:100}},
      div({style:{fontSize:'7.5px',textTransform:'uppercase',letterSpacing:'.4px',color:'var(--text3)',marginBottom:3}},(l)),
      div({style:{fontSize:'13px',fontWeight:800,fontFamily:'var(--mono)',color:'var(--text)'}},(now)),
      base!=null&&div({style:{fontSize:'8px',color:'var(--text3)',marginTop:2}},'was '+base)
    );

  return div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.82)',zIndex:455,
    display:'flex',alignItems:'center',justifyContent:'center',padding:20}},
    div({style:{background:'var(--surf)',border:'.5px solid var(--bdr2)',borderRadius:'var(--rl)',
      width:'100%',maxWidth:860,maxHeight:'92vh',display:'flex',flexDirection:'column',
      boxShadow:'0 20px 60px rgba(0,0,0,.5)',overflow:'hidden'}},
      div({style:{padding:'10px 16px',borderBottom:'.5px solid var(--bdr)',flexShrink:0,
        background:'var(--surf2)',display:'flex',alignItems:'center',gap:10}},
        span({style:{fontSize:'18px'}},'🧮'),
        div({style:{flex:1}},
          div({style:{fontSize:'13px',fontWeight:800,color:'var(--text)'}},'Performance Calculator'),
          div({style:{fontSize:'9px',color:'var(--text3)',marginTop:1}},'Interactive what-if model: how metric improvements chain through throughput → GC → sales → labor → TPPH')
        ),
        h('select',{value:selLoc,onChange:e=>setSelLoc(e.target.value),
          style:{background:'var(--surf)',border:'.5px solid var(--bdr)',borderRadius:'var(--r)',
            color:'var(--text)',fontSize:'9px',padding:'3px 6px'}},
          LOCS.map(l=>h('option',{key:l,value:l},sNameC(l)))
        ),
        btn({className:'btn btn-sm',style:{color:'var(--text3)'},onClick:onClose},'✕')
      ),
      div({style:{flex:1,overflowY:'auto',display:'flex',gap:0}},
        // Left: sliders
        div({style:{width:280,padding:'16px',borderRight:'.5px solid var(--bdr)',flexShrink:0,overflowY:'auto'}},
          div({style:{fontSize:'10px',fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.4px',marginBottom:10}},'Adjust Metrics'),
          Slider({label:'OEPE (seconds)',min:60,max:250,step:1,val:oepe,onChg:setOepe,unit:'s'}),
          Slider({label:'Labor %',min:14,max:35,step:.1,val:laborP,onChg:setLaborP,unit:'%'}),
          Slider({label:'Avg Check ($)',min:7,max:18,step:.25,val:avgChk,onChg:setAvgChk,
            fmt:v=>'$'+v.toFixed(2)}),
          div({style:{marginTop:6,padding:'8px 10px',background:'rgba(245,158,11,.07)',
            borderRadius:'var(--r)',border:'.5px solid rgba(245,158,11,.2)',fontSize:'8px',color:'var(--amber)',lineHeight:1.6}},
            model.isCapLimited
              ? '📍 Capacity-constrained store — OEPE improvements convert strongly to GC gains (~75%)'
              : '📍 Demand-limited store — OEPE gains improve experience & speed; partial GC conversion (~30%)'),
          div({style:{marginTop:8,fontSize:'7.5px',color:'var(--text3)',lineHeight:1.7}},
            'Baseline from last 6 weeks of loaded data. OEPE model: 3600 ÷ (OEPE + 35s order time) = cars/hour.')
        ),
        // Right: impact results
        div({style:{flex:1,padding:'16px',overflowY:'auto'}},
          div({style:{fontSize:'10px',fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.4px',marginBottom:10}},'Projected Impact'),
          // KPI row
          div({style:{display:'flex',gap:8,flexWrap:'wrap',marginBottom:14}},
            KpiCard({l:'DT Throughput',base:model.baseCph+'/hr',now:model.newCph+'/hr'}),
            KpiCard({l:'Daily GC',base:String(baseline.baseGC),now:String(model.newDailyGC)}),
            KpiCard({l:'Daily Sales',base:f$(baseline.baseDailySales),now:f$(model.newDailySales)}),
            KpiCard({l:'TPPH',base:baseline.baseTpph.toFixed(2),now:model.newTpph}),
            KpiCard({l:'Labor Hours',base:baseline.baseHours.toFixed(0)+'h',now:model.newHours+'h'}),
          ),
          // Change narrative
          div({style:{background:'var(--surf2)',border:'.5px solid var(--bdr)',borderRadius:'var(--r)',padding:'12px 14px'}},
            div({style:{fontSize:'11px',fontWeight:700,color:'var(--text)',marginBottom:8}},'Impact Chain'),
            ...[
              ['OEPE',        oepe+'s → '+model.newCph+' cars/hr',  (parseFloat(model.newCph)-parseFloat(model.baseCph)),'cars/hr'],
              ['Daily GC',    baseline.baseGC+' → '+model.newDailyGC, model.gcDelta,'guests/day'],
              ['Daily Sales', f$(baseline.baseDailySales)+' → '+f$(model.newDailySales), model.salesDelta,'$'],
              ['Weekly Sales',(model.salesDelta*7),'x7 days','$'],
              ['Annual Sales',(model.salesDelta*365),'x365 days','$'],
              ['TPPH',        baseline.baseTpph.toFixed(2)+' → '+model.newTpph, parseFloat(model.newTpph)-baseline.baseTpph,'guests/labor hr'],
            ].map(([l,now,chg,u],i)=>
              div({key:i,style:{display:'flex',alignItems:'baseline',gap:8,padding:'5px 0',
                borderBottom:i<5?'.5px solid rgba(255,255,255,.06)':'none'}},
                span({style:{width:100,fontSize:'9px',color:'var(--text3)',flexShrink:0}},(l)),
                span({style:{flex:1,fontSize:'9.5px',fontFamily:'var(--mono)',color:'var(--text2)'}},typeof now==='string'?now:now.toFixed(0)),
                div({style:{fontSize:'9.5px'}},
                  typeof chg==='number'&&chg!==0?delta(chg,u.startsWith('$')?'$':u.startsWith('/')?'':u,l==='Labor Hours'):null,
                  span({style:{fontSize:'7.5px',color:'var(--text3)',marginLeft:3}},typeof u==='string'&&u!==''&&!u.startsWith('x')?' '+u:''))
              )
            )
          )
        )
      )
    )
  );
}

function UnifiedTargetsPanel({stores, ds, settings, onClose}) {
  const {useState:uSt, useMemo:uM} = React;
  const [selLoc, setSelLoc] = uSt('all');
  const [selCat, setSelCat] = uSt('all');
  const [viewMode, setViewMode] = uSt('table'); // 'table' | 'cards'

  const CATS = [
    {id:'all',  l:'All Metrics'},
    {id:'svc',  l:'Service'},
    {id:'labor',l:'Labor'},
    {id:'fob',  l:'Food & Paper'},
    {id:'pos',  l:'POS Controls'},
    {id:'sales',l:'Sales'},
  ];

  // ── Metric definitions — all 39 from Metric Dictionary v2 ───────────
  const METRICS = [
    // Service
    {id:'oepe',    cat:'svc',   l:'OEPE (seconds)',     offKey:'tOepe',    unit:'s',   lowerBetter:true,  tol:10,  dataFn:(cR,lR,oR)=>avg(oR,'oepe')},
    {id:'park',    cat:'svc',   l:'DT Park %',          offKey:'tPark',    unit:'%',   lowerBetter:true,  tol:.03, dataFn:(cR,lR,oR)=>avg(oR,'park')},
    {id:'kvst',    cat:'svc',   l:'KVS Time (seconds)', offKey:'tKvst',    unit:'s',   lowerBetter:true,  tol:10,  dataFn:(cR,lR,oR)=>avg(oR,'kvst')},
    {id:'r2p',     cat:'svc',   l:'R2P (seconds)',      offKey:'tR2p',     unit:'s',   lowerBetter:false, tol:5,   dataFn:(cR,lR,oR)=>avg(oR,'r2p')},
    // Labor
    {id:'tpph',    cat:'labor', l:'TPPH',               offKey:'tTpph',    unit:'',    lowerBetter:false, tol:.2,  dataFn:(cR,lR,oR)=>avgN(cR,'tpph')||avgN(lR,'tpph')},
    {id:'labor',   cat:'labor', l:'Labor %',             offKey:'tLabor',   unit:'%',   lowerBetter:true,  tol:.02, dataFn:(cR,lR,oR)=>avgN(cR,'laborPct')||avgN(lR,'laborPct')},
    {id:'crewlbr', cat:'labor', l:'Crew Labor %',        offKey:'tCrewLabor',unit:'%', lowerBetter:true,  tol:.02, dataFn:(cR,lR,oR)=>avgN(lR,'crewLaborPct')},
    {id:'actvsNd', cat:'labor', l:'Act vs Need (hrs)',   offKey:null,       unit:'hr',  lowerBetter:false, tol:2,   dataFn:(cR,lR,oR)=>avgN(lR,'actVsNeed')},
    // FOB
    {id:'fob',     cat:'fob',   l:'FOB %',               offKey:'tFOBBase', unit:'%',   lowerBetter:true,  tol:.01, dataFn:(cR,lR,oR)=>avgN(cR,'fobPct')},
    {id:'compW',   cat:'fob',   l:'Comp Waste %',         offKey:null,       unit:'%',   lowerBetter:true,  tol:.001,dataFn:(cR,lR,oR)=>avgN(cR,'compWastePct')},
    {id:'rawW',    cat:'fob',   l:'Raw Waste %',           offKey:null,       unit:'%',   lowerBetter:true,  tol:.002,dataFn:(cR,lR,oR)=>avgN(cR,'rawWastePct')},
    {id:'cond',    cat:'fob',   l:'Condiment %',           offKey:null,       unit:'%',   lowerBetter:true,  tol:.005,dataFn:(cR,lR,oR)=>avgN(cR,'condPct')},
    {id:'empMl',   cat:'fob',   l:'Emp Meal %',            offKey:null,       unit:'%',   lowerBetter:true,  tol:.002,dataFn:(cR,lR,oR)=>avgN(cR,'empMealPct')},
    {id:'statV',   cat:'fob',   l:'Stat Var %',            offKey:null,       unit:'%',   lowerBetter:true,  tol:.005,dataFn:(cR,lR,oR)=>avgN(cR,'statVarPct')},
    {id:'disc',    cat:'fob',   l:'Disc/Coupon %',         offKey:null,       unit:'%',   lowerBetter:true,  tol:.01, dataFn:(cR,lR,oR)=>avgN(cR,'discPct')},
    // POS Controls
    {id:'cashOS',  cat:'pos',   l:'Cash O/S %',            offKey:null,       unit:'%',   lowerBetter:true,  tol:.01, dataFn:(cR,lR,oR)=>avgN(cR,'cashOSPct')},
    {id:'tRedB',   cat:'pos',   l:'T-Red Before %',        offKey:null,       unit:'%',   lowerBetter:true,  tol:.01, dataFn:(cR,lR,oR)=>avgN(cR,'tRedBPct')},
    {id:'tRedA',   cat:'pos',   l:'T-Red After %',         offKey:null,       unit:'%',   lowerBetter:true,  tol:.01, dataFn:(cR,lR,oR)=>avgN(cR,'tRedAPct')},
    {id:'discP',   cat:'pos',   l:'Discount %',            offKey:null,       unit:'%',   lowerBetter:true,  tol:.02, dataFn:(cR,lR,oR)=>avgN(cR,'discPct')},
    // Sales
    {id:'gc',      cat:'sales', l:'STW Guest Count',       offKey:null,       unit:'',    lowerBetter:false, tol:50,  dataFn:(cR,lR,oR)=>avgN(lR,'gc')},
    {id:'avgChk',  cat:'sales', l:'Avg Check ($)',          offKey:null,       unit:'$',   lowerBetter:false, tol:.25, dataFn:(cR,lR,oR)=>avgN(lR,'avgCheck')},
    {id:'sales',   cat:'sales', l:'Daily Sales ($)',        offKey:null,       unit:'$',   lowerBetter:false, tol:500, dataFn:(cR,lR,oR)=>sumN(lR,'sales')/Math.max(lR.length,1)},
  ];

  const avg  = (rows,f)=>{ const v=rows.map(r=>r[f]).filter(v=>v!=null&&v>0); return v.length?v.reduce((a,b)=>a+b)/v.length:null; };
  const avgN = (rows,f)=>avg(rows,f);
  const sumN = (rows,f)=>rows.reduce((a,r)=>a+(r[f]||0),0);
  const bqAvg = (rows,f,hi)=>{ // best-quartile average (lower=true → bottom 25%, higher=true → top 25%)
    const v=rows.map(r=>r[f]).filter(v=>v!=null&&v>0).sort((a,b)=>a-b);
    if(!v.length) return null;
    const q=Math.max(1,Math.floor(v.length/4));
    return hi?v.slice(-q).reduce((a,b)=>a+b)/q:v.slice(0,q).reduce((a,b)=>a+b)/q;
  };

  // Get data rows for selected location, last 4 weeks
  const cutoff = React.useMemo(()=>addDR(new Date(),-28),[]);
  const locRows = uM(()=>{
    const locs = selLoc==='all'?Object.keys(STORE_NAMES):[selLoc];
    const filt=(arr)=>(arr||[]).filter(r=>locs.includes(String(r.loc))&&r.date>=cutoff);
    return{cR:filt(ds.ctrlRows), lR:filt(ds.laborRows), oR:filt(ds.opsRows)};
  },[ds,selLoc,cutoff]);

  // Smart targets: best-quartile from ALL available data per loc
  const smartT = uM(()=>{
    const locs = selLoc==='all'?Object.keys(STORE_NAMES):[selLoc];
    const cAll=(ds.ctrlRows||[]).filter(r=>locs.includes(String(r.loc)));
    const lAll=(ds.laborRows||[]).filter(r=>locs.includes(String(r.loc))&&r.sales>0);
    const oAll=(ds.opsRows||[]).filter(r=>locs.includes(String(r.loc)));
    return{
      oepe:  bqAvg(oAll,'oepe',false),
      park:  bqAvg(oAll,'park',false),
      kvst:  bqAvg(oAll,'kvst',false),
      r2p:   bqAvg(oAll,'r2p',true),
      tpph:  bqAvg(lAll,'tpph',true)||bqAvg(cAll,'tpph',true),
      labor: bqAvg(cAll,'laborPct',false)||bqAvg(lAll,'laborPct',false),
      fob:   bqAvg(cAll,'fobPct',false),
      cashOS:bqAvg(cAll,'cashOSPct',false),
      tRedB: bqAvg(cAll,'tRedBPct',false),
      gc:    bqAvg(lAll,'gc',true),
      avgChk:bqAvg(lAll,'avgCheck',true),
    };
  },[ds,selLoc]);

  // Official targets — from DEFAULT_TARGETS for single store, org avg for 'all'
  const officialT = uM(()=>{
    if(selLoc==='all'){
      const locs=Object.keys(DEFAULT_TARGETS);
      const agg={};
      for(const key of ['tOepe','tPark','tKvst','tR2p','tTpph','tLabor','tCrewLabor','tFOBBase']){
        const vals=locs.map(l=>DEFAULT_TARGETS[l][key]).filter(v=>v!=null&&v>0);
        agg[key]=vals.length?vals.reduce((a,b)=>a+b)/vals.length:null;
      }
      return agg;
    }
    return DEFAULT_TARGETS[selLoc]||{};
  },[selLoc]);

  const smartKeyMap = {oepe:'oepe',park:'park',kvst:'kvst',r2p:'r2p',tpph:'tpph',labor:'labor',crewlbr:'labor',fob:'fob',cashOS:'cashOS',tRedB:'tRedB',gc:'gc',avgChk:'avgChk'};

  const fmtVal = (v,m)=>{
    if(v==null) return '—';
    if(m.unit==='s') return Math.round(v)+'s';
    if(m.unit==='%') return (v*100).toFixed(1)+'%';
    if(m.unit==='$') return '$'+v.toFixed(2);
    return v.toFixed(1);
  };
  const statusCol = (cur,off,m)=>{
    if(cur==null||off==null) return null;
    const gap = m.lowerBetter ? (cur-off)/off : (off-cur)/off;
    if(gap <= 0.05) return '#10b981';
    if(gap <= 0.15) return '#f59e0b';
    return '#ef4444';
  };
  const statusIcon = (cur,off,m)=>{
    const c=statusCol(cur,off,m);
    if(!c) return null;
    return c==='#10b981'?'✓':c==='#f59e0b'?'⚠':'✗';
  };

  const visMetrics = METRICS.filter(m=>selCat==='all'||m.cat===selCat);
  const thS={padding:'5px 8px',fontSize:'8px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.4px',color:'var(--text3)',borderBottom:'.5px solid var(--bdr)',whiteSpace:'nowrap'};

  return div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.82)',zIndex:450,display:'flex',flexDirection:'column',paddingTop:16}},
    div({style:{flex:'0 0 16px',cursor:'pointer'},onClick:onClose}),
    div({style:{flex:1,background:'var(--surf)',maxWidth:1200,margin:'0 auto',width:'calc(100% - 32px)',
      borderRadius:'var(--rl) var(--rl) 0 0',display:'flex',flexDirection:'column',overflow:'hidden',
      boxShadow:'0 -8px 40px rgba(0,0,0,.4)'}},
      // ── Header ──────────────────────────────────────────────────────
      div({style:{padding:'10px 16px',borderBottom:'.5px solid var(--bdr)',flexShrink:0,
        background:'var(--surf2)',display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}},
        span({style:{fontSize:'18px'}},'◉'),
        div({style:{flex:1}},
          div({style:{fontSize:'14px',fontWeight:800,color:'var(--text)'}},'Unified Targets'),
          div({style:{fontSize:'9px',color:'var(--text3)',marginTop:1}},
            span({style:{color:'#60a5fa'}},'📋 Official'),
            span({style:{marginLeft:8,color:'#34d399'}},'💡 Smart'),
            span({style:{color:'var(--text3)',marginLeft:8}},' · Official = 2026 yearly targets file · Smart = best-quartile from your historical data'))
        ),
        // Store selector
        h('select',{value:selLoc,onChange:e=>setSelLoc(e.target.value),
          style:{background:'var(--surf)',border:'.5px solid var(--bdr)',borderRadius:'var(--r)',
            color:'var(--text)',fontSize:'9.5px',padding:'3px 7px'}},
          h('option',{value:'all'},'All Stores (Avg)'),
          Object.keys(STORE_NAMES).sort((a,b)=>STORE_NAMES[a].localeCompare(STORE_NAMES[b])).map(l=>
            h('option',{key:l,value:l},sNameC(l))
          )
        ),
        btn({className:'btn btn-sm',style:{color:'var(--text3)'},onClick:onClose},'✕')
      ),
      // ── Category tabs ───────────────────────────────────────────────
      div({style:{display:'flex',gap:0,borderBottom:'.5px solid var(--bdr)',flexShrink:0,background:'var(--surf2)'}},
        CATS.map(c=>btn({key:c.id,
          style:{padding:'6px 14px',fontSize:'9px',fontWeight:600,background:'transparent',border:'none',
            borderBottom:selCat===c.id?'2px solid var(--amber)':'2px solid transparent',
            color:selCat===c.id?'var(--amber)':'var(--text3)',cursor:'pointer'},
          onClick:()=>setSelCat(c.id)},c.l))
      ),
      // ── Legend ──────────────────────────────────────────────────────
      div({style:{padding:'5px 16px',borderBottom:'.5px solid var(--bdr)',flexShrink:0,
        display:'flex',gap:12,flexWrap:'wrap',alignItems:'center',background:'var(--surf2)'}},
        ...[
          {l:'📋 Official',sub:'From 2026 yearly targets file — management-set. Takes priority.',c:'#60a5fa'},
          {l:'💡 Smart',   sub:'Best-quartile from your historical data — achievable baseline.',c:'#34d399'},
          {l:'📊 Current', sub:'Last 4 weeks actual average from loaded Operations Report data.',c:'var(--text2)'},
        ].map((k,i)=>div({key:i,style:{display:'flex',alignItems:'center',gap:5}},
          span({style:{fontSize:'10px',color:k.c,fontWeight:700}},k.l),
          span({style:{fontSize:'7.5px',color:'var(--text3)'}},k.sub)
        ))
      ),
      // ── Table ────────────────────────────────────────────────────────
      div({style:{flex:1,overflowY:'auto'}},
        h('table',{style:{width:'100%',borderCollapse:'collapse',fontSize:'9.5px'}},
          h('thead',null,h('tr',null,
            ...['Metric','📋 Official Target','💡 Smart Target','📊 Current (L4W)','vs Official','Status']
             .map((l,i)=>th({key:i,style:{...thS,textAlign:i>=1?'right':'left',paddingLeft:i===0?14:8}},(l)))
          )),
          h('tbody',null,...visMetrics.map((m,i)=>{
            const offVal  = m.offKey ? officialT[m.offKey] : null;
            const smKey   = smartKeyMap[m.id];
            const smVal   = smKey ? smartT[smKey] : null;
            const cur     = m.dataFn(locRows.cR, locRows.lR, locRows.oR);
            const sCol    = statusCol(cur,offVal,m);
            const sIcon   = statusIcon(cur,offVal,m);
            const gap     = cur!=null&&offVal!=null ? (m.lowerBetter?(cur-offVal):-(cur-offVal)) : null;
            const gapStr  = gap!=null?(m.unit==='s'?(gap>0?'+':'')+Math.round(gap)+'s':
              m.unit==='%'?(gap>0?'+':'')+((gap*100).toFixed(1))+'%':
              (gap>0?'+':'')+gap.toFixed(1)):null;
            return tr({key:m.id,style:{borderBottom:'.5px solid rgba(255,255,255,.04)',
              background:i%2?'rgba(255,255,255,.015)':'transparent'}},
              td({style:{padding:'5px 8px 5px 14px',fontWeight:600,color:'var(--text2)'}},(m.l)),
              td({style:{padding:'5px 8px',textAlign:'right'}},
                offVal!=null
                  ? div({style:{display:'inline-flex',alignItems:'center',gap:3}},
                      span({style:{fontFamily:'var(--mono)',fontWeight:700,color:'#60a5fa'}},(fmtVal(offVal,m))),
                      span({style:{fontSize:'7px',color:'#60a5fa',opacity:.7}},'📋'))
                  : span({style:{color:'var(--text3)',fontSize:'8px'}},'— not in file')),
              td({style:{padding:'5px 8px',textAlign:'right'}},
                smVal!=null
                  ? div({style:{display:'inline-flex',alignItems:'center',gap:3}},
                      span({style:{fontFamily:'var(--mono)',color:'#34d399'}},fmtVal(smVal,m)),
                      span({style:{fontSize:'7px',color:'#34d399',opacity:.7}},'💡'))
                  : span({style:{color:'var(--text3)',fontSize:'8px'}},'— no data')),
              td({style:{padding:'5px 8px',textAlign:'right',fontFamily:'var(--mono)',color:'var(--text2)'}},
                cur!=null ? fmtVal(cur,m) : span({style:{color:'var(--text3)',fontSize:'8px'}},'— no data')),
              td({style:{padding:'5px 8px',textAlign:'right',fontFamily:'var(--mono)',fontSize:'9px',
                color:gap!=null?(gap>0?'#ef4444':'#10b981'):'var(--text3)',fontWeight:gap!=null&&Math.abs(gap)>0?700:400}},
                gapStr||'—'),
              td({style:{padding:'5px 8px',textAlign:'right'}},
                sIcon&&span({style:{fontSize:'9px',fontWeight:700,padding:'2px 7px',borderRadius:99,
                  background:sCol+'22',color:sCol}},sIcon+' '+(sCol==='#10b981'?'On Target':sCol==='#f59e0b'?'Watch':'Off Track')))
            );
          }))
        )
      ),
      // ── Footer note ──────────────────────────────────────────────────
      div({style:{padding:'6px 16px',borderTop:'.5px solid var(--bdr)',flexShrink:0,fontSize:'8px',color:'var(--text3)',background:'var(--surf2)'}},
        '📋 Official targets loaded from: 2026 Restaurant Targets — Updated — OK — FL.xlsx  · ',
        '💡 Smart targets computed from best 25th percentile of your loaded historical data  · ',
        'Upload an Operations Report to populate Current column')
    )
  );
}

function MonthlyTargetManager({userTargets, mergedTargets, onUpdate, onClose, ds}) {
  const [activeMonth, setActiveMonth] = React.useState(ymKey(new Date()));
  const [editLoc, setEditLoc] = React.useState(null);
  const [v2, setV2] = React.useState(()=>loadTargetsV2());
  const [targetMode, setTargetMode] = React.useState('monthly');
  const [activeYear, setActiveYear] = React.useState(new Date().getFullYear());
  const [yearlyData, setYearlyData] = React.useState(()=>loadYearlyTargets(new Date().getFullYear()));
  const [showImport, setShowImport] = React.useState(false);
  const [importText, setImportText] = React.useState('');
  const [msg, setMsg] = React.useState(null);

  // Run migration on first open
  React.useEffect(()=>{
    migrateTargetsToV2(userTargets, ymKey(new Date()));
    setV2(loadTargetsV2());
  },[]);

  const refresh = ()=>setV2(loadTargetsV2());
  const showMsg = (m, isErr)=>{ setMsg({m,isErr}); setTimeout(()=>setMsg(null),3000); };

  // Get months with data (last 12 months + next 3)
  const monthList = React.useMemo(()=>{
    const now = new Date();
    const months = [];
    for(let i=-11;i<=3;i++){
      const d = new Date(now.getFullYear(), now.getMonth()+i, 1);
      const ym = ymKey(d);
      months.push({
        ym, 
        label: d.toLocaleDateString('en-US',{month:'short',year:'numeric'}),
        hasData: !!(v2[ym] && Object.keys(v2[ym]).filter(k=>k!=='_locked').length > 0),
        locked: !!(v2[ym]&&v2[ym]._locked),
        isCurrent: ym===ymKey(new Date()),
        isFuture: ym > ymKey(new Date())
      });
    }
    return months.reverse(); // newest first
  },[v2]);

  const locs = ds ? ds.storeIds.filter(l=>/^\d+$/.test(l)) : Object.keys(DEFAULT_TARGETS);
  const activeMonthData = v2[activeMonth] || {};
  const isLocked = !!activeMonthData._locked;

  const TARGET_FIELDS_CATS = [
    {cat:'Service & Ops',fields:[
      {k:'tOepe',l:'OEPE (s)',unit:'s',type:'number',min:60,max:300},
      {k:'tTpph',l:'TPPH Target',unit:'',type:'number',min:1,max:20,step:0.1},
      {k:'tKvst',l:'KVS Time (s)',unit:'s',type:'number',min:10,max:120},
      {k:'tKvsu',l:'KVS Usage',unit:'%',type:'number',min:0,max:100,scale:100},
      {k:'tPark',l:'DT Parked %',unit:'%',type:'number',min:0,max:50,step:0.1,scale:100},
      {k:'tR2p',l:'R2P (s)',unit:'s',type:'number',min:30,max:180},
      {k:'tAvgCheck',l:'Avg Check $',unit:'$',type:'number',min:0,max:50,step:0.01},
      {k:'tProdSales',l:'Product Sales $',unit:'$',type:'number',min:0,step:100},
    ]},
    {cat:'Labor',fields:[
      {k:'tLabor',l:'Labor % (Crew)',unit:'%',type:'number',min:0,max:50,step:0.1,scale:100},
      {k:'tCombLabor',l:'Combined Labor %',unit:'%',type:'number',min:0,max:70,step:0.1,scale:100},
      {k:'tBonusLabor',l:'Bonus Crew %',unit:'%',type:'number',min:0,max:50,step:0.1,scale:100},
      {k:'tGrowth',l:'Growth Goal',unit:'%',type:'number',min:-20,max:30,step:0.1,scale:100},
    ]},
    {cat:'T-Reds Before',fields:[
      {k:'tRedBPct',l:'T-Red Before %',unit:'%',type:'number',min:0,max:30,step:0.01,scale:100},
      {k:'tRedBAvg',l:'T-Red Before Avg $',unit:'$',type:'number',min:0,step:0.01},
      {k:'tRedBDollar',l:'T-Red Before Total $',unit:'$',type:'number',min:0,step:1},
    ]},
    {cat:'T-Reds After (Integrity)',fields:[
      {k:'tRedAPct',l:'T-Red After Total %',unit:'%',type:'number',min:0,max:5,step:0.01,scale:100},
      {k:'tRedAAvg',l:'T-Red After Avg $',unit:'$',type:'number',min:0,step:0.01},
      {k:'tRedADollar',l:'T-Red After Total $',unit:'$',type:'number',min:0,step:1},
    ]},
    {cat:'Promos (High Integrity Risk)',fields:[
      {k:'tPromoCnt',l:'Promo Count',unit:'',type:'number',min:0},
      {k:'tPromoPct',l:'Promo %',unit:'%',type:'number',min:0,max:20,step:0.01,scale:100},
      {k:'tPromoAmt',l:'Promo Total $',unit:'$',type:'number',min:0,step:1},
    ]},
    {cat:'Disc Coup',fields:[
      {k:'tDiscCoupPct',l:'Disc Coup %',unit:'%',type:'number',min:0,max:20,step:0.01,scale:100},
    ]},
    {cat:'Drawer / POS / Refunds',fields:[
      {k:'tDrawer',l:'Drawer Opens',unit:'',type:'number',min:0,max:200},
      {k:'tPosOverPct',l:'POS Overring %',unit:'%',type:'number',min:0,max:5,step:0.01,scale:100},
      {k:'tPosOverAmt',l:'POS Overring $',unit:'$',type:'number',min:0,step:1},
      {k:'tRefundCnt',l:'Refund Count',unit:'',type:'number',min:0},
      {k:'tRefundPct',l:'Refund %',unit:'%',type:'number',min:0,max:5,step:0.01,scale:100},
      {k:'tRefundAmt',l:'Refund $',unit:'$',type:'number',min:0,step:1},
      {k:'tRefundCash',l:'Refund Cashless $',unit:'$',type:'number',min:0,step:1},
      {k:'tManRefPct',l:'Manual Refund/Overring %',unit:'%',type:'number',min:0,max:5,step:0.01,scale:100},
      {k:'tManRefAmt',l:'Manual Refund $',unit:'$',type:'number',min:0,step:1},
    ]},
    {cat:'Cash Controls',fields:[
      {k:'tCashOSPct',l:'Cash O/S %',unit:'%',type:'number',min:-2,max:2,step:0.001,scale:100},
      {k:'tCashOSAmt',l:'Cash O/S $',unit:'$',type:'number',min:-500,max:500,step:1},
    ]},
    {cat:'Food Cost (FOB)',fields:[
      {k:'tFOBBase',l:'Base Food %',unit:'%',type:'number',min:0,max:50,step:0.1,scale:100},
      {k:'tFOBTarget',l:'FOB Target (w/o Disc Coup)',unit:'%',type:'number',min:0,max:15,step:0.01,scale:100},
      {k:'tFOBTotal',l:'Total Food Cost %',unit:'%',type:'number',min:0,max:40,step:0.1,scale:100},
      {k:'tFOBBonusBase',l:'Bonus Food Threshold',unit:'%',type:'number',min:0,max:10,step:0.01,scale:100},
      {k:'tCompWaste',l:'Comp Waste %',unit:'%',type:'number',min:0,max:5,step:0.01,scale:100},
      {k:'tRawWaste',l:'Raw Waste %',unit:'%',type:'number',min:0,max:5,step:0.01,scale:100},
      {k:'tCondiment',l:'Condiment %',unit:'%',type:'number',min:0,max:10,step:0.01,scale:100},
      {k:'tEmpFood',l:'Employee Meal %',unit:'%',type:'number',min:0,max:5,step:0.01,scale:100},
      {k:'tStatLoss',l:'Stat Loss %',unit:'%',type:'number',min:0,max:5,step:0.01,scale:100},
      {k:'tUnex',l:'Unexplained Diff %',unit:'%',type:'number',min:0,max:5,step:0.01,scale:100},
    ]},
    {cat:'P&L / Supplies',fields:[
      {k:'tPaperCost',l:'Paper Cost %',unit:'%',type:'number',min:0,max:10,step:0.01,scale:100},
      {k:'tOpSupply',l:'Op Supply $',unit:'$',type:'number',min:0,step:100},
    ]},
  ];
  const [activeCat, setActiveCat] = React.useState('Service & Ops');
  const TARGET_FIELDS = (TARGET_FIELDS_CATS.find(c=>c.cat===activeCat)||TARGET_FIELDS_CATS[0]).fields;

  const getFieldVal = (loc, field) => {
    const mData = targetMode==='yearly' ? (yearlyData[loc]||{}) : activeMonthData[loc];
    if(mData&&mData[field.k]!=null) return field.scale ? (mData[field.k]*field.scale).toFixed(field.k==='tCashOSPct'?2:1) : mData[field.k];
    const merged = mergedTargets[loc]||DEFAULT_TARGETS[loc]||{};
    if(merged[field.k]!=null) return field.scale ? (merged[field.k]*field.scale).toFixed(field.k==='tCashOSPct'?2:1) : merged[field.k];
    return '';
  };

  const saveField = (loc, field, rawVal) => {
    if(isLocked){showMsg('This month is locked. Unlock to edit.',true);return;}
    const num = parseFloat(rawVal);
    if(isNaN(num)) return;
    const stored = field.scale ? num/field.scale : num;
    if(targetMode==='yearly'){
      setYearlyTarget(activeYear, loc, {[field.k]: stored});
      setYearlyData(loadYearlyTargets(activeYear));
    } else {
      setMonthTargets(activeMonth, loc, {[field.k]: stored});
      refresh();
    }
    showMsg('Saved ✓');
  };

  const handleCopyMonth = (fromYm) => {
    if(!fromYm||fromYm===activeMonth) return;
    if(isLocked){showMsg('Unlock this month first.',true);return;}
    copyMonthTargets(fromYm, activeMonth, locs);
    refresh();
    showMsg('Copied from '+fromYm+' ✓');
  };

  const handleLock = () => {
    const nowLocked = toggleMonthLock(activeMonth);
    refresh();
    showMsg(nowLocked?'Month locked 🔒':'Month unlocked 🔓');
  };

  const handleExport = () => {
    // Export ALL stores' merged targets for active month (not just overrides)
    const exportData = {};
    locs.forEach(loc=>{
      const defaultT = DEFAULT_TARGETS[loc]||{};
      const monthT = v2[activeMonth]&&v2[activeMonth][loc]||{};
      exportData[loc] = {...defaultT,...(mergedTargets[loc]||{}),...monthT};
      // Remove internal keys
      delete exportData[loc]._locked;
    });
    const fullExport = {[activeMonth]: exportData};
    const el = document.createElement('a');
    el.href = 'data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify(fullExport,null,2));
    el.download = 'Targets_'+activeMonth+'_'+new Date().toISOString().slice(0,10)+'.json';
    el.click();
    showMsg('Exported '+locs.length+' stores for '+activeMonth+' ✓');
  };

  const handleImport = () => {
    try {
      const parsed = JSON.parse(importText);
      if(typeof parsed !== 'object') throw new Error('Invalid format');
      saveTargetsV2({...loadTargetsV2(), ...parsed});
      refresh();
      setShowImport(false);
      setImportText('');
      showMsg('Imported successfully ✓');
    } catch(e) {
      showMsg('Import failed: '+e.message, true);
    }
  };

  const coverageCount = locs.filter(loc=>activeMonthData[loc]&&Object.keys(activeMonthData[loc]).some(k=>k!=='_locked')).length;

  return div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.8)',zIndex:300,
    display:'flex',alignItems:'flex-start',justifyContent:'center',padding:'32px 16px',
    overflowY:'auto'}},

    div({style:{width:'100%',maxWidth:1060,background:'var(--surf)',borderRadius:'var(--rl)',
      border:'.5px solid var(--bdr2)',boxShadow:'0 20px 60px rgba(0,0,0,.6)',
      display:'flex',flexDirection:'column',maxHeight:'90vh',overflow:'hidden'}},

      // Header
      div({style:{display:'flex',alignItems:'center',justifyContent:'space-between',
        padding:'14px 20px',borderBottom:'.5px solid var(--bdr)',flexShrink:0,
        background:'var(--surf2)'}},
        div(null,
          div({style:{fontSize:'14px',fontWeight:800,color:'var(--amber)',
            letterSpacing:'-.2px'}},(targetMode==='monthly'?'🎯 Monthly Targets — Versioned by Period':'📅 Yearly Targets — Annual Goals')),
          div({style:{fontSize:'9px',color:'var(--text3)',marginTop:2}},
            'Targets are stored per month and automatically applied when viewing historical data')
        ),
        div({style:{display:'flex',gap:6,alignItems:'center'}},
          msg&&div({style:{fontSize:'9px',padding:'3px 8px',borderRadius:3,
            background:msg.isErr?'rgba(239,68,68,.15)':'rgba(16,185,129,.15)',
            color:msg.isErr?'#f87171':'#10b981',border:'.5px solid '+(msg.isErr?'rgba(239,68,68,.3)':'rgba(16,185,129,.3)')
          }},msg.m),
          btn({className:'btn btn-sm',onClick:()=>{
              // Export merged targets (all sources) for active month
              const exportData = {};
              locs.forEach(loc=>{
                const merged = {...(mergedTargets[loc]||DEFAULT_TARGETS[loc]||{}),
                  ...(v2[activeMonth]&&v2[activeMonth][loc]||{})};
                if(Object.keys(merged).length>0) exportData[loc]=merged;
              });
              const fullExport = {};
              fullExport[activeMonth] = exportData;
              const el=document.createElement('a');
              el.href='data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify(fullExport,null,2));
              el.download='Targets_'+activeMonth+'_'+new Date().toISOString().slice(0,10)+'.json';
              el.click();
              showMsg('Exported all stores for '+activeMonth+' ✓');
            }},'⬇ Export JSON'),
          btn({className:'btn btn-sm',onClick:()=>setShowImport(p=>!p)},'⬆ Import'),
          btn({className:'btn btn-sm',onClick:onClose},'✕')
        )
      ),

      // Mode toggle: Monthly vs Yearly
      div({style:{display:'flex',gap:0,borderBottom:'.5px solid var(--bdr)',flexShrink:0}},
        ...(['monthly','yearly']).map(m=>
          btn({key:m,onClick:()=>{setTargetMode(m);if(m==='yearly')setYearlyData(loadYearlyTargets(activeYear));},
            style:{padding:'7px 16px',fontSize:'10px',fontWeight:600,border:'none',
              borderBottom:targetMode===m?'2px solid var(--amber)':'2px solid transparent',
              background:'transparent',color:targetMode===m?'var(--amber)':'var(--text3)',
              cursor:'pointer'}},
            m==='monthly'?'📅 Monthly Targets':'🏆 Yearly Goals')
        ),
        targetMode==='yearly'&&div({style:{marginLeft:'auto',padding:'4px 12px',
          display:'flex',alignItems:'center',gap:8}},
          span({style:{fontSize:'9px',color:'var(--text3)'}},'Year:'),
          h('select',{value:activeYear,
            onChange:e=>{const y=+e.target.value;setActiveYear(y);setYearlyData(loadYearlyTargets(y));},
            style:{fontSize:'9px',background:'var(--surf)',border:'.5px solid var(--bdr)',
              borderRadius:'var(--r)',color:'var(--text)',padding:'2px 6px'}},
            [2024,2025,2026,2027].map(y=>h('option',{key:y,value:y},y))
          ),
          btn({className:'btn btn-sm',style:{fontSize:'9px'},
            onClick:()=>{
              const el=document.createElement('a');
              el.href='data:application/json;charset=utf-8,'+encodeURIComponent(exportYearlyTargets(activeYear));
              el.download='YearlyTargets_'+activeYear+'.json';el.click();
            }},'⬇ Export'),
          btn({className:'btn btn-sm btn-a',style:{fontSize:'9px'},
            onClick:()=>{
              // Apply yearly targets as the base monthly targets for all unconfigured months
              const yData=loadYearlyTargets(activeYear);
              const v2=loadTargetsV2();
              let applied=0;
              locs.forEach(loc=>{
                if(yData[loc]){
                  // Set as baseline for all months in this year that don't have overrides
                  ['01','02','03','04','05','06','07','08','09','10','11','12'].forEach(mo=>{
                    const ym=activeYear+'-'+mo;
                    if(!v2[ym]||!v2[ym][loc]) {
                      setMonthTargets(ym, loc, yData[loc]);
                      applied++;
                    }
                  });
                }
              });
              setV2(loadTargetsV2());
              showMsg('Applied yearly targets as monthly defaults ('+applied+' slots) ✓');
            }},'Apply as Monthly Defaults')
        )
      ),

      // Import panel
      showImport&&div({style:{padding:'12px 20px',borderBottom:'.5px solid var(--bdr)',
        background:'rgba(255,255,255,.02)',flexShrink:0}},
        div({style:{fontSize:'10px',fontWeight:600,color:'var(--text2)',marginBottom:6}},
          'Paste exported JSON to import targets:'),
        div({style:{display:'flex',gap:8,alignItems:'flex-start'}},
          h('textarea',{value:importText,onChange:e=>setImportText(e.target.value),
            placeholder:'{"2026-05": {"3708": {"tOepe": 140, ...}}, ...}',
            style:{flex:1,height:60,fontFamily:'var(--mono)',fontSize:'9px',
              background:'var(--surf)',border:'.5px solid var(--bdr)',borderRadius:'var(--r)',
              color:'var(--text)',padding:'6px 8px',resize:'vertical'}}),
          btn({className:'btn btn-sm btn-a',onClick:handleImport,
            style:{marginTop:0}},'Import')
        )
      ),

      // Main layout: month selector + target grid
      div({style:{display:'flex',flex:1,overflow:'hidden'}},

        // Left: month list
        div({style:{width:180,flexShrink:0,borderRight:'.5px solid var(--bdr)',
          overflowY:'auto',background:'var(--surf)'}},
          div({style:{padding:'8px 10px 4px',fontSize:'8px',fontWeight:700,
            letterSpacing:'.6px',textTransform:'uppercase',color:'var(--text3)'}},'Period'),
          monthList.map(m=>
            div({key:m.ym,onClick:()=>setActiveMonth(m.ym),
              style:{padding:'8px 12px',cursor:'pointer',borderBottom:'.5px solid var(--bdr)',
                background:activeMonth===m.ym?'var(--adim)':'transparent',
                display:'flex',alignItems:'center',justifyContent:'space-between'},
              onMouseEnter:e=>{if(activeMonth!==m.ym)e.currentTarget.style.background='rgba(255,255,255,.03)';},
              onMouseLeave:e=>{if(activeMonth!==m.ym)e.currentTarget.style.background='transparent';}},
              div(null,
                div({style:{fontSize:'11px',fontWeight:activeMonth===m.ym?700:400,
                  color:activeMonth===m.ym?'var(--amber)':m.isCurrent?'var(--text)':'var(--text2)'
                }},m.label),
                div({style:{fontSize:'8px',color:'var(--text3)',marginTop:1}},
                  m.hasData?(coverageCount+' stores set'):
                  m.isFuture?'Future — no targets yet':'Not configured')
              ),
              div({style:{display:'flex',gap:3}},
                m.locked&&span({style:{fontSize:'10px'}},'🔒'),
                m.isCurrent&&span({style:{fontSize:'8px',fontWeight:700,padding:'1px 4px',
                  borderRadius:3,background:'rgba(255,188,13,.15)',color:'var(--amber)'}},'NOW'),
                m.isFuture&&span({style:{fontSize:'8px',color:'var(--text3)'}},'upcoming')
              )
            )
          )
        ),

        // Right: target grid for active month
        div({style:{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}},

          // Month toolbar
          div({style:{display:'flex',alignItems:'center',gap:8,padding:'10px 16px',
            borderBottom:'.5px solid var(--bdr)',flexShrink:0,
            background:isLocked?'rgba(239,68,68,.04)':'var(--surf2)'}},
            div(null,
              div({style:{fontSize:'12px',fontWeight:700,color:'var(--text)',
                display:'flex',alignItems:'center',gap:6}},
                (monthList.find(m=>m.ym===activeMonth)||{}).label||activeMonth,
                isLocked&&span({style:{fontSize:'10px'}},'🔒 LOCKED')
              ),
              div({style:{fontSize:'9px',color:'var(--text3)',marginTop:1}},
                coverageCount+'/'+locs.length+' stores configured · '+
                (isLocked?'Locked — targets cannot be edited':'Click any target to edit inline'))
            ),
            div({style:{marginLeft:'auto',display:'flex',gap:6}},
              // Copy from month selector
              div({style:{display:'flex',alignItems:'center',gap:4}},
                span({style:{fontSize:'9px',color:'var(--text3)'}},'Copy from:'),
                h('select',{
                  onChange:e=>handleCopyMonth(e.target.value),
                  value:'',
                  style:{fontSize:'9px',background:'var(--surf)',border:'.5px solid var(--bdr)',
                    borderRadius:'var(--r)',color:'var(--text)',padding:'3px 6px',cursor:'pointer'}},
                  h('option',{value:''},'— Select month —'),
                  monthList.filter(m=>m.ym!==activeMonth&&m.hasData).map(m=>
                    h('option',{key:m.ym,value:m.ym},m.label)
                  )
                )
              ),
              btn({className:'btn btn-sm',onClick:handleLock},
                isLocked?'🔓 Unlock':'🔒 Lock'),
              // Apply this month's targets to App
              btn({className:'btn btn-sm btn-a',
                onClick:()=>{
                  // Merge this month's targets into userTargets (flat format for backward compat)
                  const monthData = activeMonthData;
                  const next = {};
                  locs.forEach(loc=>{
                    const mt = monthData[loc]||{};
                    if(Object.keys(mt).length>0) next[loc]=mt;
                  });
                  onUpdate(next);
                  showMsg('Applied to forecasts ✓');
                }
              },'✓ Apply to Forecasts')
            )
          ),

          // Category selector
          div({style:{display:'flex',gap:0,borderBottom:'.5px solid var(--bdr)',
            flexShrink:0,overflowX:'auto',flexWrap:'nowrap'}},
            TARGET_FIELDS_CATS.map(cat=>btn({key:cat.cat,
              onClick:()=>setActiveCat(cat.cat),
              style:{padding:'5px 10px',fontSize:'8px',fontWeight:600,border:'none',
                borderBottom:activeCat===cat.cat?'2px solid var(--amber)':'2px solid transparent',
                background:'transparent',color:activeCat===cat.cat?'var(--amber)':'var(--text3)',
                cursor:'pointer',flexShrink:0,whiteSpace:'nowrap'}},
              cat.cat+' ('+cat.fields.length+')')
            )
          ),
          // Target grid — stores as rows, selected category fields as columns
          div({style:{flex:1,overflowY:'auto'}},
            div({style:{overflowX:'auto'}},
              h('table',{style:{width:'100%',borderCollapse:'collapse',fontSize:'10px',minWidth:700}},
                h('thead',null,
                  h('tr',null,
                    h('th',{style:{padding:'6px 10px',textAlign:'left',fontWeight:700,
                      fontSize:'8px',letterSpacing:'.4px',textTransform:'uppercase',
                      color:'var(--text3)',background:'var(--surf3)',
                      borderBottom:'.5px solid var(--bdr)',position:'sticky',top:0,zIndex:2,
                      minWidth:140}},'Store'),
                    ...TARGET_FIELDS.map(f=>
                      h('th',{key:f.k,style:{padding:'6px 8px',textAlign:'center',fontWeight:600,
                        fontSize:'8px',color:'var(--text2)',background:'var(--surf3)',
                        borderBottom:'.5px solid var(--bdr)',borderLeft:'.5px solid var(--bdr)',
                        position:'sticky',top:0,zIndex:2,minWidth:90}},
                        f.l+(f.unit?' ('+f.unit+')':''))
                    )
                  )
                ),
                h('tbody',null,
                  locs.map((loc,ri)=>{
                    const isEditing = editLoc===loc;
                    const hasOverride = targetMode==='yearly' ?
      !!(yearlyData[loc]&&Object.keys(yearlyData[loc]).some(k=>k!=='_locked')) :
      !!(activeMonthData[loc]&&
                      Object.keys(activeMonthData[loc]).some(k=>k!=='_locked'));
                    return h('tr',{key:loc,
                      style:{borderBottom:'.5px solid rgba(255,255,255,.03)',
                        background:isEditing?'rgba(255,188,13,.04)':
                          hasOverride?'rgba(16,185,129,.02)':'transparent'}},
                      h('td',{style:{padding:'5px 10px',whiteSpace:'nowrap',
                        position:'sticky',left:0,background:isEditing?'rgba(255,188,13,.04)':
                          hasOverride?'rgba(16,185,129,.04)':'var(--surf)',zIndex:1}},
                        div({style:{display:'flex',alignItems:'center',gap:6}},
                          div({style:{width:4,height:4,borderRadius:'50%',flexShrink:0,
                            background:hasOverride?'#10b981':'var(--text3)'}}),
                          div(null,
                            div({style:{fontWeight:600,fontSize:'10px',color:'var(--text)'}},sName(loc)),
                            div({style:{fontSize:'8px',color:'var(--text3)'}},'#'+loc)
                          ),
                          hasOverride&&span({style:{fontSize:'7px',fontWeight:700,padding:'1px 3px',
                            borderRadius:2,background:'rgba(16,185,129,.15)',color:'#10b981'}},'SET')
                        )
                      ),
                      ...TARGET_FIELDS.map(f=>{
                        const val = getFieldVal(loc, f);
                        const isMonthOverride = !!(activeMonthData[loc]&&activeMonthData[loc][f.k]!=null);
                        return h('td',{key:f.k,style:{padding:'3px 6px',textAlign:'center',
                          borderLeft:'.5px solid rgba(255,255,255,.04)'}},
                          h('input',{
                            type:'number',min:f.min,max:f.max,step:f.step||1,
                            value:val,
                            disabled:isLocked,
                            onChange:e=>saveField(loc,f,e.target.value),
                            title:(isMonthOverride?'✓ Monthly override set':'Using '+
                              (mergedTargets[loc]&&mergedTargets[loc][f.k]!=null?'merged':'default')+' value'),
                            style:{width:'100%',textAlign:'center',fontFamily:'var(--mono)',
                              fontSize:'10px',fontWeight:isMonthOverride?700:400,
                              background:isMonthOverride?'rgba(16,185,129,.08)':'transparent',
                              color:isMonthOverride?'#10b981':'var(--text2)',
                              border:'.5px solid '+(isMonthOverride?'rgba(16,185,129,.2)':'var(--bdr)'),
                              borderRadius:'var(--r)',padding:'3px 4px',
                              cursor:isLocked?'not-allowed':'text',
                              outline:'none'}
                          })
                        );
                      })
                    );
                  })
                )
              )
            )
          )
        )
      )
    )
  );
}


// EVENT CALENDAR
function EventCalendar({userEvents, onUpdate, onClose, stores}) {
  const [editKey, setEditKey] = useState(null);
  const [editType, setEditType] = useState('other');
  const [editNote, setEditNote] = useState('');
  const [editLoc, setEditLoc] = useState('');
  const [editDate, setEditDate] = useState(fmtDI(new Date()));

  const allEvents = useMemo(()=>{
    const ev=[];
    for(const [loc,dkMap] of Object.entries(userEvents)){
      for(const [dk,info] of Object.entries(dkMap)){
        ev.push({loc,dk,date:new Date(dk+'T12:00:00'),...info});
      }
    }
    return ev.sort((a,b)=>b.date-a.date);
  },[userEvents]);

  const save=()=>{
    const next=JSON.parse(JSON.stringify(userEvents));
    if(!next[editLoc])next[editLoc]={};
    next[editLoc][editDate]={type:editType,note:editNote,icon:EVENT_TYPES[editType]?.icon||'📌',label:EVENT_TYPES[editType]?.label||'Other'};
    onUpdate(next);setEditKey(null);
  };
  const remove=(loc,dk)=>{
    const next=JSON.parse(JSON.stringify(userEvents));
    if(next[loc]){delete next[loc][dk];if(!Object.keys(next[loc]).length)delete next[loc];}
    onUpdate(next);
  };
  const startEdit=(ev)=>{setEditKey(ev.loc+'_'+ev.dk);setEditLoc(ev.loc);setEditDate(ev.dk);setEditType(ev.type||'other');setEditNote(ev.note||'');};

  return div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.65)',zIndex:300,display:'flex',flexDirection:'column',alignItems:'center',padding:20,overflowY:'auto'}},
    div({style:{background:'var(--surf)',borderRadius:'var(--rl)',border:'.5px solid var(--bdr2)',width:'100%',maxWidth:900,display:'flex',flexDirection:'column',maxHeight:'92vh',overflow:'auto',overflow:'hidden'}},
      div({style:{padding:'14px 18px',borderBottom:'.5px solid var(--bdr)',display:'flex',alignItems:'center',gap:10}},
        div(null,div({style:{fontSize:'15px',fontWeight:700}},'📅 Event Calendar'),div({style:{fontSize:'11px',color:'var(--text2)',marginTop:2}},allEvents.length+' events tagged')),
        btn({className:'btn btn-sm btn-a',onClick:()=>{setEditKey('new');setEditLoc(stores[0]?.loc||'');setEditDate(fmtDI(new Date()));setEditType('other');setEditNote('');}},'+Add Event'),
        btn({className:'btn btn-sm',style:{color:'#a5b4fc',borderColor:'rgba(165,180,252,.3)'},
          onClick:()=>{
            // Auto-tag all known holidays for current year ±1 across ALL stores
            const next=JSON.parse(JSON.stringify(userEvents));
            const yr=new Date().getFullYear();
            let count=0;
            for(let y=yr-1;y<=yr+1;y++){
              const hols=buildHolidays(y);
              for(const [dk,hol] of Object.entries(hols)){
                const evType = hol.impact==='major'?'holiday_major':hol.impact==='moderate'?'holiday':'other';
                for(const s of stores){
                  if(!next[s.loc])next[s.loc]={};
                  if(!next[s.loc][dk]){ // don't overwrite existing user tags
                    next[s.loc][dk]={type:'holiday',note:hol.label,icon:'🗓',label:'Holiday: '+hol.label,autoTagged:true};
                    count++;
                  }
                }
              }
            }
            onUpdate(next);
            alert('Auto-tagged '+count+' holiday events across all stores (current year ±1). Pre-existing tags were preserved.');
          }},'🗓 Auto-Tag Holidays'),
        btn({onClick:onClose,style:{marginLeft:'auto',background:'none',border:'none',color:'var(--text2)',fontSize:20,cursor:'pointer'}},'×')
      ),
      (editKey!=null)&&div({style:{padding:'10px 18px',borderBottom:'.5px solid var(--bdr)',background:'var(--surf2)'}},
        div({style:{display:'flex',gap:6,flexWrap:'wrap',marginBottom:6}},
          inp({type:'date',value:editDate,onChange:e=>setEditDate(e.target.value),style:{background:'var(--surf)',border:'.5px solid var(--bdr)',borderRadius:'var(--r)',color:'var(--text)',fontSize:'11px',padding:'4px 8px'}}),
          sel({value:editLoc,onChange:e=>setEditLoc(e.target.value),style:{background:'var(--surf)',border:'.5px solid var(--bdr)',borderRadius:'var(--r)',color:'var(--text)',fontSize:'11px',padding:'4px 8px'}},
            stores.map(s=>opt({key:s.loc,value:s.loc},s.name))),
          sel({value:editType,onChange:e=>setEditType(e.target.value),style:{background:'var(--surf)',border:'.5px solid var(--bdr)',borderRadius:'var(--r)',color:'var(--text)',fontSize:'11px',padding:'4px 8px'}},
            Object.entries(EVENT_TYPES).map(([k,v])=>opt({key:k,value:k},v.icon+' '+v.label)))
        ),
        div({style:{display:'flex',gap:6}},
          inp({value:editNote,onChange:e=>setEditNote(e.target.value),placeholder:'Note (optional)…',style:{flex:1,background:'var(--surf)',border:'.5px solid var(--bdr)',borderRadius:'var(--r)',color:'var(--text)',fontSize:'11px',padding:'5px 8px'}}),
          btn({className:'btn btn-a',onClick:save},'Save'),
          btn({className:'btn',onClick:()=>setEditKey(null)},'Cancel')
        )
      ),
      div({style:{overflowY:'auto',flex:1}},
        !allEvents.length&&div({style:{padding:30,textAlign:'center',color:'var(--text3)',fontSize:'13px'}},'No events tagged yet. Tag events from the Forecast Table or Anomaly Panel.'),
        allEvents.map((ev,i)=>{
          const et=EVENT_TYPES[ev.type]||EVENT_TYPES.other;
          return div({key:i,style:{display:'flex',alignItems:'center',gap:10,padding:'10px 18px',borderBottom:'.5px solid var(--bdr)'}},
            span({style:{fontSize:'18px'}}),ev.icon||et.icon,
            div({style:{flex:1}},
              div({style:{fontWeight:600,fontSize:'11px'}},ev.label||et.label),
              div({style:{fontSize:'10px',color:'var(--text3)'}},
                (STORE_NAMES[ev.loc]||ev.loc)+' · '+new Date(ev.dk+'T12:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})),
              ev.note&&div({style:{fontSize:'10px',color:'var(--text2)',marginTop:2}},ev.note)
            ),
            btn({className:'btn btn-sm',onClick:()=>startEdit(ev)},'✎ Edit'),
            btn({className:'btn btn-sm btn-red',onClick:()=>remove(ev.loc,ev.dk)},'✕')
          );
        })
      )
    )
  );
}

function OpsBarChart({perf, tgt}) {
  const ref = useRef(null);
  useChart(ref, canvas => {
    const metrics=[
      {l:'OEPE', actual:perf.oepe>0?perf.oepe:null, target:tgt.tOepe, inv:true, unit:'s'},
      {l:'TPPH', actual:perf.tpph>0?perf.tpph:null, target:tgt.tTpph, inv:false,unit:''},
      {l:'KVS t',actual:perf.kvst>0?perf.kvst:null, target:tgt.tKvst, inv:true, unit:'s'},
      {l:'Park%',actual:perf.park>0?perf.park*100:null,target:tgt.tPark?tgt.tPark*100:null,inv:true,unit:'%'},
      {l:'Labor%',actual:perf.laborPct>0?perf.laborPct*100:null,target:tgt.tLabor?tgt.tLabor*100:null,inv:null,unit:'%'},
    ].filter(m=>m.actual!==null&&m.target);
    const labels=metrics.map(m=>m.l);
    const actuals=metrics.map(m=>+m.actual.toFixed(2));
    const targets=metrics.map(m=>+m.target.toFixed(2));
    const colors=metrics.map(m=>{
      if(m.inv===null)return Math.abs(m.actual-m.target)<=1.5?'rgba(74,222,128,.7)':'rgba(248,113,113,.7)';
      return m.inv?(m.actual<=m.target?'rgba(74,222,128,.7)':'rgba(248,113,113,.7)'):
                   (m.actual>=m.target?'rgba(74,222,128,.7)':'rgba(248,113,113,.7)');
    });
    return new Chart(canvas,{type:'bar',data:{labels,datasets:[
      {label:'Actual',data:actuals,backgroundColor:colors,borderColor:colors.map(c=>c.replace('.7)','.9)')),borderWidth:1},
      {label:'Target',data:targets,backgroundColor:'transparent',borderColor:'rgba(245,158,11,.7)',borderWidth:1.5,type:'line',pointStyle:'dash',pointRadius:5,order:0},
    ]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
      plugins:{legend:LEG,tooltip:{...TT}},scales:{x:{...AX},y:{...AX}}}});
  },[perf,tgt]);
  return div({style:{height:190}},h('canvas',{ref}));
}


function CompareRadarChart({selStores, COLS, METRICS}) {
  const ref = useRef(null);
  useChart(ref, canvas => {
    if(!selStores||selStores.length<2) return null;
    const labels = METRICS.slice(0,9).map(m=>m.label);
    const toScore=(m,v,all)=>{
      if(!v||v<=0)return 50;
      const nz=all.filter(x=>x>0);if(!nz.length)return 50;
      const mn=Math.min(...nz),mx=Math.max(...nz),rng=mx-mn;
      if(rng===0)return 75;
      return m.higherBetter===false?Math.round((1-(v-mn)/rng)*100):Math.round(((v-mn)/rng)*100);
    };
    return new Chart(canvas,{type:'radar',data:{labels,datasets:selStores.map((s,i)=>({
      label:s.name,
      data:METRICS.slice(0,9).map(m=>{const all=selStores.map(s2=>m.fn(s2));return toScore(m,m.fn(s),all);}),
      borderColor:COLS[i],backgroundColor:COLS[i]+'22',borderWidth:2,pointRadius:3,pointBackgroundColor:COLS[i],
    }))},options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:LEG,tooltip:{...TT,callbacks:{label:c=>c.dataset.label+': '+c.raw+'/100'}}},
      scales:{r:{backgroundColor:'transparent',angleLines:{color:'rgba(255,255,255,.05)'},
        grid:{color:'rgba(255,255,255,.07)'},pointLabels:{color:'#94a3b8',font:{size:9}},
        ticks:{display:false},suggestedMin:0,suggestedMax:100}}}});
  },[selStores]);
  return div({style:{height:340,padding:16}},h('canvas',{ref}));
}

function CompareLineChart({selStores, COLS, ds}) {
  const ref = useRef(null);
  useChart(ref, canvas => {
    if(!ds||!ds.loaded||!selStores.length) return null;
    const cut=new Date(Date.now()-42*86400000);
    const locSet=new Set(selStores.map(s=>s.loc));
    const allDates=[...new Set(ds.laborRows.filter(r=>r.date>=cut&&locSet.has(r.loc)).map(r=>dKey(r.date)))].sort();
    const labels=allDates.map(dk=>{const d=new Date(dk+'T12:00:00');return DOW_BASE[d.getDay()].slice(0,2)+' '+d.toLocaleDateString('en-US',{month:'numeric',day:'numeric'});});
    return new Chart(canvas,{type:'line',data:{labels,datasets:selStores.map((s,i)=>{
      const data=allDates.map(dk=>{const rows=ds.laborIdx[s.loc+'_'+dk];return rows&&rows[0]&&rows[0].sales>0?Math.round(rows[0].sales):null;});
      return{label:s.name,data,borderColor:COLS[i],backgroundColor:'transparent',borderWidth:2,pointRadius:2,tension:.3,spanGaps:false};
    })},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
      plugins:{legend:LEG,tooltip:{...TT,callbacks:{label:c=>`${c.dataset.label}: $${(c.raw||0).toLocaleString()}`}}},
      scales:{x:{...AX},y:{...AX,ticks:{...AX.ticks,callback:v=>'$'+Math.round(v/1000)+'K'}}}}});
  },[selStores,ds]);
  return div({style:{height:300,padding:16}},h('canvas',{ref}));
}

export {
  fetchForecastWeather,
  getYearlyStorageKey, loadYearlyTargets, saveYearlyTargets, setYearlyTarget, getYearlyTarget, exportYearlyTargets,
  ymKey, loadTargetsV2, saveTargetsV2, getMonthTargets, getTargetsForDate, setMonthTargets,
  copyMonthTargets, toggleMonthLock, exportTargetsV2, getTargetMonths, migrateTargetsToV2,
  PEAK_SLICES, normSlice, analyzePeaks,
  mdToNodes,
  useChart, TT, AX, LEG, SalesChart, OpsRadar, TrendChart,
  wxIcon, ForecastRow, ForecastTable,
  Brief, OpsScorecard, CtrlScorecard, AITabInsight, PeaksTab, generatePlan, ActionPlanTab,
  StoreCard, DistrictGrid, OrgView, ExportDropdown, RankingView, PerformanceCalculator,
  UnifiedTargetsPanel, MonthlyTargetManager, EventCalendar,
  OpsBarChart, CompareRadarChart, CompareLineChart,
};
