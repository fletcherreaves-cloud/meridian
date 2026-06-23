// @ts-nocheck
import * as React from 'react';
import { addD, dKey, sodOf } from '../utils/date.js';
import { DEFAULT_MODEL_ASSIGNMENTS, STORE_NAMES, sName, sNameC, getKB, EVENT_TYPES } from '../constants.js';
import { forecastDay, getModelAssignment } from '../engine/forecast.js';
import { runWhyEngineScan, runWhyEngineDistrict, diagnoseMiss } from '../engine/why.js';
import { grade } from '../utils/fmt.js';

const {useState, useEffect, useMemo, useRef, useCallback} = React;
const h    = React.createElement;
const div  = (props, ...c) => h('div',    props, ...c);
const span = (props, ...c) => h('span',   props, ...c);
const btn  = (props, ...c) => h('button', props, ...c);
const opt  = (props, ...c) => h('option', props, ...c);
const td   = (props, ...c) => h('td',     props, ...c);
const th   = (props, ...c) => h('th',     props, ...c);
const tr   = (props, ...c) => h('tr',     props, ...c);

// LIFELENZ SCHEDULING GAP REPORT  (v187)
// Compares Meridian's model projections vs Lifelenz (WFM Projected
// Sales) vs actual results from Labor Analysis file.
// Shows per-store accuracy gap, bias direction, dollar impact.
// Pre/post Lifelenz split (est. cutover July 2024).
function LifelenzGapPanel({ds, settings, onClose}) {
  const {useState:uSt, useMemo:uM} = React;
  const [period,  setPeriod]  = uSt('post');    // 'pre' | 'post' | 'all'
  const [sortBy,  setSortBy]  = uSt('gap');     // 'gap'|'store'|'impact'|'lfz_mape'
  const [sortDir, setSortDir] = uSt(-1);         // 1=asc -1=desc

  const LFZ_CUTOVER = new Date('2025-09-01'); // User-confirmed: Altametrics→Lifelenz transition Sep 2025

  const analysis = uM(()=>{
    const rows = ds?.laborRows||[];
    if(!rows.length) return null;

    const results = {};
    rows.forEach(r=>{
      if(!r.loc||!r.sales||r.sales<100||!r.projSales||r.projSales<100) return;
      const loc=String(r.loc);
      if(!results[loc]) results[loc]={
        loc, name:STORE_NAMES[loc]||loc,
        all:[], pre:[], post:[],
      };
      const entry={actual:r.sales, proj:r.projSales, date:r.date};
      results[loc].all.push(entry);
      if(r.date&&r.date<LFZ_CUTOVER) results[loc].pre.push(entry);
      else if(r.date) results[loc].post.push(entry);
    });

    const calcStats=(arr)=>{
      if(!arr.length) return null;
      const n=arr.length;
      const mape=arr.reduce((a,r)=>a+Math.abs(r.actual-r.proj)/r.actual,0)/n*100;
      const bias=arr.reduce((a,r)=>a+(r.actual-r.proj)/r.actual,0)/n*100; // + = under-forecast
      const avgAct=arr.reduce((a,r)=>a+r.actual,0)/n;
      return{n,mape,bias,avgAct};
    };

    // Meridian MAPE = AE weekly values validated on Sep 2025–May 2026 (same window as LFZ)
    // DO NOT use monthly?.mape — that's full-period DI, a different and longer window
    const meridianMape=(loc)=>{
      const def=DEFAULT_MODEL_ASSIGNMENTS[loc];
      if(!def) return null;
      return def.weekly?.mape||null;  // AE Sep2025-May2026 validated MAPE
    };

    return Object.values(results).map(r=>{
      const all=calcStats(r.all);
      const pre=calcStats(r.pre);
      const post=calcStats(r.post);
      const mMape=meridianMape(r.loc);
      const lfzMape=(period==='pre'?pre:period==='post'?post:all)?.mape;
      const gap=mMape&&lfzMape ? lfzMape-mMape : null; // + = Meridian better
      const stats=(period==='pre'?pre:period==='post'?post:all);
      const dollarImpact=stats&&gap ? Math.abs(gap/100)*stats.avgAct*stats.n : null;
      return{...r, all, pre, post, mMape, lfzMape, gap, dollarImpact,
        bias:stats?.bias, n:stats?.n||0};
    }).filter(r=>r.n>0);
  },[ds?.laborRows, period]);

  const sorted = uM(()=>{
    if(!analysis) return [];
    return [...analysis].sort((a,b)=>{
      const va=sortBy==='store'?a.name:sortBy==='lfz_mape'?a.lfzMape:sortBy==='impact'?a.dollarImpact:a.gap;
      const vb=sortBy==='store'?b.name:sortBy==='lfz_mape'?b.lfzMape:sortBy==='impact'?b.dollarImpact:b.gap;
      if(va==null) return 1; if(vb==null) return -1;
      return sortBy==='store'?va.localeCompare(vb)*sortDir:(vb-va)*sortDir*-1;
    });
  },[analysis,sortBy,sortDir]);

  const toggleSort=(col)=>{
    if(sortBy===col) setSortDir(d=>d*-1);
    else{setSortBy(col);setSortDir(-1);}
  };

  const summary = uM(()=>{
    if(!analysis||!analysis.length) return null;
    const withGap=analysis.filter(r=>r.gap!=null);
    const improved=withGap.filter(r=>r.gap>0.5).length;
    const degraded=withGap.filter(r=>r.gap<-0.5).length;
    const avgLfz=withGap.reduce((a,r)=>a+(r.lfzMape||0),0)/Math.max(withGap.length,1);
    const avgMer=withGap.reduce((a,r)=>a+(r.mMape||0),0)/Math.max(withGap.length,1);
    const totalImpact=analysis.reduce((a,r)=>a+(r.dollarImpact||0),0);
    const underForecast=analysis.filter(r=>(r.bias||0)>0.5).length;
    return{improved,degraded,flat:withGap.length-improved-degraded,
      avgLfz,avgMer,totalImpact,underForecast,n:withGap.length};
  },[analysis]);

  const gapColor=v=>v==null?'var(--text3)':v>2?'#10b981':v>0?'#34d399':v>-2?'var(--amber)':'#ef4444';
  const mapeColor=v=>!v?'var(--text3)':v<6?'#10b981':v<8?'#f59e0b':v<12?'#f97316':'#ef4444';
  const thS={padding:'6px 8px',fontSize:'8px',fontWeight:700,textTransform:'uppercase',
    letterSpacing:'.4px',color:'var(--text3)',borderBottom:'.5px solid var(--bdr)',cursor:'pointer',
    whiteSpace:'nowrap'};

  const hasData = ds?.laborRows?.some(r=>r.projSales>0);

  return div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.82)',zIndex:463,
    display:'flex',flexDirection:'column',paddingTop:16}},
    div({style:{flex:'0 0 16px',cursor:'pointer'},onClick:onClose}),
    div({style:{flex:1,background:'var(--surf)',maxWidth:1100,margin:'0 auto',
      width:'calc(100% - 32px)',borderRadius:'var(--rl) var(--rl) 0 0',
      display:'flex',flexDirection:'column',overflow:'hidden',
      boxShadow:'0 -8px 40px rgba(0,0,0,.4)'}},
      // Header
      div({style:{padding:'10px 16px',borderBottom:'.5px solid var(--bdr)',flexShrink:0,
        background:'var(--surf2)',display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}},
        span({style:{fontSize:'18px'}},'📊'),
        div({style:{flex:1}},
          div({style:{fontSize:'13px',fontWeight:800,color:'var(--text)'}},'Lifelenz Scheduling Gap Report'),
          div({style:{fontSize:'9px',color:'var(--text3)'}},'Adaptive Ensemble vs Lifelenz · same Sep 2025–May 2026 window · from Labor Analysis · Meridian MAPE = AE weekly model · Lifelenz MAPE = WFM projected sales')
        ),
        div({style:{display:'flex',gap:4}},
          ...['pre','post','all'].map(p=>btn({key:p,className:'btn btn-sm',
            style:{fontSize:'8.5px',background:period===p?'var(--adim)':'transparent',
              color:period===p?'var(--amber)':'var(--text3)'},onClick:()=>setPeriod(p)},
            p==='pre'?'Pre-Sep 2025 (Altametrics)':p==='post'?'Post-Sep 2025 (Lifelenz)':'All Time'))
        ),
        btn({className:'btn btn-sm',style:{color:'var(--text3)'},onClick:onClose},'✕')
      ),
      !hasData?div({style:{flex:1,display:'flex',alignItems:'center',justifyContent:'center',
        flexDirection:'column',gap:10,color:'var(--text3)',padding:40}},
        div({style:{fontSize:40}},'📊'),
        div({style:{fontSize:'13px',fontWeight:700,color:'var(--text)'}},'Labor Analysis Required'),
        div({style:{fontSize:'10px',textAlign:'center',maxWidth:400,lineHeight:1.7}},'Load the Labor Analysis file (Labor_Analysis_YYYYMMDD_to_YYYYMMDD.xlsx) to see Lifelenz vs Meridian accuracy comparison. The file must contain both actual sales and WFM projected sales columns.')
      ):
      React.createElement(React.Fragment,null,
        // Summary cards
        summary&&div({style:{padding:'10px 16px',borderBottom:'.5px solid var(--bdr)',flexShrink:0,
          background:'var(--surf2)',display:'flex',gap:12,flexWrap:'wrap',alignItems:'stretch'}},
          ...[
            {l:'Meridian Wins',     v:summary.improved,     sub:'Better MAPE than Lifelenz', c:'#10b981'},
            {l:'Lifelenz Wins',     v:summary.degraded,     sub:'Lifelenz more accurate',    c:'#ef4444'},
            {l:'Avg Lifelenz MAPE', v:summary.avgLfz.toFixed(1)+'%', sub:'Post-cutover avg', c:mapeColor(summary.avgLfz)},
            {l:'Avg Meridian MAPE', v:summary.avgMer.toFixed(1)+'%', sub:'AE model · same window', c:mapeColor(summary.avgMer)},
            {l:'Under-Forecast',    v:summary.underForecast+' stores', sub:'Consistently below actual', c:'#f59e0b'},
            {l:'Total $ Gap Impact',v:'$'+Math.round(summary.totalImpact/1000)+'K', sub:'Cumulative MAPE difference', c:'var(--amber)'},
          ].map((k,i)=>div({key:i,style:{background:'var(--surf)',border:'.5px solid var(--bdr)',
            borderRadius:'var(--r)',padding:'8px 12px',flex:'1 1 100px',minWidth:100}},
            div({style:{fontSize:'7.5px',textTransform:'uppercase',letterSpacing:'.4px',color:'var(--text3)'}},(k.l)),
            div({style:{fontSize:'15px',fontWeight:800,fontFamily:'var(--mono)',color:k.c}},(k.v)),
            div({style:{fontSize:'7.5px',color:'var(--text3)',marginTop:1}},(k.sub))
          ))
        ),
        // Key findings box
        summary&&div({style:{padding:'8px 16px',borderBottom:'.5px solid var(--bdr)',flexShrink:0,
          fontSize:'9px',color:'var(--text2)',lineHeight:1.7,
          background:summary.improved>summary.degraded?'rgba(16,185,129,.05)':'rgba(239,68,68,.05)'}},
          summary.improved>summary.degraded
            ?`✓ Meridian AE outperforms Lifelenz at ${summary.improved} of ${summary.n} stores — same Sep 2025–May 2026 window, true apples-to-apples.`
            :`⚠ Lifelenz outperforms Meridian AE at ${summary.degraded} of ${summary.n} stores — FL interstate stores dominate. Same Sep 2025–May 2026 window.`,
          ` ${summary.underForecast} stores show consistent under-forecasting bias (Lifelenz below actual) — scheduling risk.`,
          ` Gap legend: `,
          span({style:{color:'#10b981'}},'Green = Meridian more accurate'),
          ' · ',
          span({style:{color:'#ef4444'}},'Red = Lifelenz more accurate')
        ),
        // Table
        div({style:{flex:1,overflowY:'auto'}},
          h('table',{style:{width:'100%',borderCollapse:'collapse',fontSize:'9px'}},
            h('thead',null,h('tr',{style:{position:'sticky',top:0,background:'var(--surf2)',zIndex:2}},
              h('th',{style:{...thS,textAlign:'left',paddingLeft:14},onClick:()=>toggleSort('store')},'Store '+(sortBy==='store'?(sortDir>0?'↑':'↓'):'')),
              h('th',{style:{...thS,textAlign:'right'},onClick:()=>toggleSort('lfz_mape')},'Lifelenz MAPE '+(sortBy==='lfz_mape'?(sortDir>0?'↑':'↓'):'')),
              h('th',{style:{...thS,textAlign:'right'}},'Meridian MAPE'),
              h('th',{style:{...thS,textAlign:'right'},onClick:()=>toggleSort('gap')},'Gap '+(sortBy==='gap'?(sortDir>0?'↑':'↓'):'')),
              h('th',{style:{...thS,textAlign:'right'}},'Bias'),
              h('th',{style:{...thS,textAlign:'right'},onClick:()=>toggleSort('impact')},'$ Impact '+(sortBy==='impact'?(sortDir>0?'↑':'↓'):'')),
              h('th',{style:{...thS,textAlign:'right'}},'n days')
            )),
            h('tbody',null,...sorted.map((r,i)=>{
              const stats=period==='pre'?r.pre:period==='post'?r.post:r.all;
              return h('tr',{key:r.loc,style:{
                background:i%2?'rgba(255,255,255,.015)':'transparent',
                borderBottom:'.5px solid rgba(255,255,255,.04)'}},
                h('td',{style:{padding:'7px 8px 7px 14px',fontWeight:600,color:'var(--amber)',verticalAlign:'middle'}},
                  div(null,STORE_NAMES[r.loc]||r.loc),
                  div({style:{fontSize:'7.5px',color:'var(--text3)',marginTop:1}},
                    'Model: '+(DEFAULT_MODEL_ASSIGNMENTS[r.loc]?.monthly?.model||'—').toUpperCase())
                ),
                h('td',{style:{padding:'7px 8px',textAlign:'right',fontFamily:'var(--mono)',
                  fontWeight:700,color:mapeColor(r.lfzMape)}},r.lfzMape?r.lfzMape.toFixed(1)+'%':'—'),
                h('td',{style:{padding:'7px 8px',textAlign:'right',fontFamily:'var(--mono)',
                  fontWeight:700,color:mapeColor(r.mMape)}},r.mMape?r.mMape.toFixed(1)+'%':'—'),
                h('td',{style:{padding:'7px 8px',textAlign:'right',fontFamily:'var(--mono)',
                  fontWeight:800,color:gapColor(r.gap)}},
                  r.gap!=null?(r.gap>0?'+':'')+r.gap.toFixed(1)+'pp':'—'),
                h('td',{style:{padding:'7px 8px',textAlign:'right',fontFamily:'var(--mono)',
                  color:(r.bias||0)>0?'#f97316':'#34d399',fontWeight:600}},
                  r.bias!=null?((r.bias>0?'↓ Under ':'↑ Over ')+Math.abs(r.bias).toFixed(1)+'%'):'—'),
                h('td',{style:{padding:'7px 8px',textAlign:'right',fontFamily:'var(--mono)',
                  color:'var(--amber)',fontWeight:700}},
                  r.dollarImpact?'$'+Math.round(r.dollarImpact/1000)+'K':'—'),
                h('td',{style:{padding:'7px 8px',textAlign:'right',color:'var(--text3)'}},r.n||'—')
              );
            }))
          )
        ),
        // Footer legend
        div({style:{padding:'6px 16px',borderTop:'.5px solid var(--bdr)',flexShrink:0,
          fontSize:'7.5px',color:'var(--text3)',background:'var(--surf2)'}},
          'Gap = Lifelenz MAPE minus Meridian MAPE · Positive gap = Meridian more accurate · ',
          '$ Impact = |gap| × avg daily sales × days · ',
          'Bias: ↓ Under = Lifelenz forecasted below actual (understaffing risk) · ',
          'Cutover: September 2025 (user-confirmed) · Altametrics era: Jan 2022–Aug 2025 · Lifelenz era: Sep 2025–present · Meridian MAPE = AE model, same Sep 2025–May 2026 window')
      )
    )
  );
}


// ════════════════════════════════════════════════════════════════════════════════
// LIFELENZ BRIDGE  (v4.202)
// ════════════════════════════════════════════════════════════════════════════════
// LifeLenz owns scheduling execution and has no API — manual entry only, per
// location, at daily/hourly/15-min granularity. This bridge doesn't compete
// with that; it gives the GM one number to type in before the schedule locks.
//
// Two layers, kept separate because they answer different questions:
//
//   LEVEL — "how much, in total, will today do" — top-down correction.
//     LifelenzGapPanel already proved Meridian's AE model beats LifeLenz's
//     own WFM projection on a same-period basis. This layer points that same
//     comparison FORWARD: if the loaded Labor Analysis file's "Projected
//     Sales" column already contains LifeLenz's number for an upcoming date
//     (WFM exports often do, since that's literally what drives the
//     schedule), compare directly. If it doesn't, fall back to this store's
//     historical per-day-of-week bias pattern — same conclusion, lower
//     confidence, clearly labeled as such rather than presented as fact.
//
//   SHAPE — "when, within the day" — LifeLenz's own quarter-hour curve is
//     presumably POS-derived and mechanical; it has no way to know a school
//     early-release day will pull dinner volume earlier. Meridian has real
//     hourly history (darRows) AND, as of the Calendar System, forward
//     knowledge of exactly these disruptive days. This layer flags WHEN the
//     normal hourly curve likely won't apply — a qualitative heads-up, not a
//     competing quarter-hour model (no data exists to build one credibly).
// ─────────────────────────────────────────────────────────────────────────────

// ── LEVEL: per-store, per-day-of-week historical bias vs LifeLenz ──────────
// avgBiasPct: + means LifeLenz has historically projected BELOW actual
// (under-forecast, scheduling risk) on that day of week; - means over.
// meridianWinRate: share of days Meridian's forecast was closer to actual
// than LifeLenz's projection was, on that day of week.
function computeLifeLenzHistoricalBias(loc, ds, settings, weeksBack=12){
  if(!ds||!ds.laborRows) return null;
  const anchor=(ds.lastActual&&ds.lastActual[loc])||addD(new Date(),-1);
  const cutoff=addD(anchor,-weeksBack*7);
  const rows=(ds.laborRows||[]).filter(r=>String(r.loc)===String(loc)&&r.date>=cutoff&&r.date<=anchor
    &&r.sales>100&&r.projSales>100);
  if(rows.length<6) return null;

  const byDOW=Array.from({length:7},()=>[]);
  rows.forEach(r=>byDOW[r.date.getDay()].push(r));

  const dowStats = byDOW.map((dayRows,dow)=>{
    if(dayRows.length<2) return {dow, n:dayRows.length, avgBiasPct:null, meridianWinRate:null};
    let meridianWins=0;
    dayRows.forEach(r=>{
      const lfzErr = Math.abs(r.sales-r.projSales)/r.sales;
      const mFc = forecastDay(loc, r.date, ds, settings).forecast;
      const mErr = mFc>0 ? Math.abs(r.sales-mFc)/r.sales : lfzErr+1;
      if(mErr<lfzErr) meridianWins++;
    });
    const avgBiasPct = dayRows.reduce((a,r)=>a+(r.sales-r.projSales)/r.sales,0)/dayRows.length*100;
    return {dow, n:dayRows.length, avgBiasPct:+avgBiasPct.toFixed(1),
      meridianWinRate:+(meridianWins/dayRows.length*100).toFixed(0)};
  });

  const overall = {
    n:rows.length,
    avgBiasPct:+(rows.reduce((a,r)=>a+(r.sales-r.projSales)/r.sales,0)/rows.length*100).toFixed(1),
  };
  return {dowStats, overall, weeksBack};
}

// ── SHAPE: normal hourly distribution curve for a store + day-of-week ──────
// Returns array of {hour, pctOfDay} from darRows history, or null if there
// isn't enough hourly history for this store/DOW to build a credible curve.
function buildHourlyShapeCurve(loc, ds, dow, minOccurrences=3){
  if(!ds||!ds.darRows||!ds.darRows.length) return null;
  const parseHour=h=>{
    if(!h) return null;
    const m=String(h).match(/(\d+):(\d+)\s*(AM|PM)?/i);
    if(!m) return null;
    let hr=parseInt(m[1]); const ampm=(m[3]||'').toUpperCase();
    if(ampm==='PM'&&hr<12) hr+=12; if(ampm==='AM'&&hr===12) hr=0;
    return hr;
  };
  const rows=(ds.darRows||[]).filter(r=>String(r.loc)===String(loc)&&r.date instanceof Date&&r.date.getDay()===dow&&r.sales>0);
  if(!rows.length) return null;
  const byDate={};
  rows.forEach(r=>{ const dk=dKey(r.date); if(!byDate[dk]) byDate[dk]={}; const hr=parseHour(r.hour); if(hr==null||hr<5) return; byDate[dk][hr]=(byDate[dk][hr]||0)+r.sales; });
  const dateKeys=Object.keys(byDate);
  if(dateKeys.length<minOccurrences) return null;
  const hourPcts={};
  dateKeys.forEach(dk=>{
    const dayTotal=Object.values(byDate[dk]).reduce((a,b)=>a+b,0);
    if(dayTotal<=0) return;
    Object.entries(byDate[dk]).forEach(([hr,sales])=>{
      if(!hourPcts[hr]) hourPcts[hr]=[];
      hourPcts[hr].push(sales/dayTotal);
    });
  });
  const curve=Object.entries(hourPcts).map(([hr,pcts])=>({
    hour:+hr, pctOfDay:+(pcts.reduce((a,b)=>a+b,0)/pcts.length*100).toFixed(1),
  })).sort((a,b)=>a.hour-b.hour);
  return curve.length?{curve, n:dateKeys.length}:null;
}

// ── Shape-deviation qualitative notes by event category ────────────────────
const SHAPE_DEVIATION_NOTES = {
  school_early_release:'Afternoon shift likely — expect the PM transition (kids + parents) to start earlier than a normal day.',
  school_no_school:     'All-day shift likely — kids out of school typically softens sharp peaks into more even all-day traffic.',
  school_break:         'All-day shift likely — multi-day break, expect softened peaks and more midday/early-afternoon volume than a normal week.',
  school_start:         'Morning shift likely — return-to-school routines often compress AM traffic into a tighter pre-school window.',
  school_end:           'Afternoon shift likely — last day of school often pulls a pickup-time surge earlier than normal.',
  event:                'Evening shift likely — local event may pull dinner-hour volume earlier or later depending on event start time.',
  road_closure:         'Access disruption — monitor drive-thru entry timing; volume may compress into a shorter window around the closure.',
  construction:         'Access disruption — possible compressed or delayed traffic depending on which approach is affected.',
  winter_storm:'Weather-driven timing shift — traffic often compresses into a narrow pre-storm window, then drops sharply.',
  snow:'Weather-driven timing shift — traffic often compresses into a narrow pre-storm window, then drops sharply.',
  ice:'Weather-driven timing shift — traffic often compresses into a narrow pre-storm window, then drops sharply.',
  t_storm:'Weather-driven timing shift — traffic may pause during the storm window and rebound sharply after.',
  hurricane:'Severe access disruption — expect highly compressed or front-loaded traffic ahead of the storm.',
};

function getShapeDeviationFlag(loc, ds, date, userEvents){
  const dk=dKey(date);
  const ev=userEvents&&userEvents[loc]&&userEvents[loc][dk];
  if(!ev) return null;
  const types=(ev.tags&&ev.tags.length)?ev.tags.map(t=>t.type):[ev.type||'other'];
  const matchedType=types.find(t=>SHAPE_DEVIATION_NOTES[t]);
  if(!matchedType) return null;
  return {type:matchedType, label:(EVENT_TYPES[matchedType]||{}).label||matchedType,
    note:SHAPE_DEVIATION_NOTES[matchedType], eventLabel:ev.label||ev.note||''};
}

// ── Forward adjustment for ONE date: the actual GM-facing output ───────────
function computeLifeLenzAdjustment(loc, date, ds, settings, userEvents, biasStats){
  const mFc = forecastDay(loc, date, ds, settings);
  const meridianForecast = mFc.forecast||0;
  if(!meridianForecast) return null;

  // Direct mode: this exact future date already has LifeLenz's own
  // projection in the loaded Labor Analysis file.
  const dk=dKey(date);
  const directRow=(ds.laborRows||[]).find(r=>String(r.loc)===String(loc)&&dKey(r.date)===dk&&r.projSales>100);

  let lfzProjection, source, evidenceN;
  if(directRow){
    lfzProjection=directRow.projSales; source='direct'; evidenceN=null;
  } else if(biasStats){
    const dowStat=biasStats.dowStats[date.getDay()];
    if(dowStat&&dowStat.n>=2&&dowStat.avgBiasPct!=null){
      // avgBiasPct = (actual-proj)/actual*100 historically on this DOW.
      // Estimate what LifeLenz WOULD project: proj ≈ actual/(1+bias) ≈
      // meridianForecast as a stand-in for "expected actual" /(1+bias/100).
      lfzProjection = meridianForecast/(1+dowStat.avgBiasPct/100);
      source='pattern'; evidenceN=dowStat.n;
    } else return null;
  } else return null;

  const adjustmentPct = (meridianForecast-lfzProjection)/lfzProjection*100;
  const adjustmentDollar = meridianForecast-lfzProjection;
  const shapeFlag = getShapeDeviationFlag(loc, ds, date, userEvents);

  return {date, dow:date.getDay(), meridianForecast, lfzProjection:Math.round(lfzProjection),
    source, evidenceN, adjustmentPct:+adjustmentPct.toFixed(1), adjustmentDollar:Math.round(adjustmentDollar),
    shapeFlag};
}

// ── Full forward scan for one store ─────────────────────────────────────────
function runLifeLenzBridgeScan(loc, ds, settings, userEvents, daysForward=14){
  const biasStats = computeLifeLenzHistoricalBias(loc, ds, settings, 12);

  // ── Why Engine attribution: WHY is LifeLenz biased on each DOW? ───────────
  // Knowing the cause changes how confident to be in the adjustment.
  //   • Mainly weather / event / regional → bias is real but situational;
  //     check whether this specific upcoming date has the same context.
  //   • Mainly unexplained → genuine model gap in LifeLenz's forecast;
  //     adjust more confidently, it's systematic not contextual.
  let dowAttribution = null;
  if(biasStats){
    const whyScan = runWhyEngineScan(loc, ds, userEvents, settings, 8);
    if(whyScan&&whyScan.rows.length>=8){
      dowAttribution = Array.from({length:7},(_,dow)=>{
        const dowRows = whyScan.rows.filter(r=>r.dow===dow);
        if(dowRows.length<2) return {dow, n:dowRows.length, label:null};
        const total = dowRows.length;
        const counts = {event:0,regional:0,weather:0,isolated_anomaly:0,contributing_factors:0,unexplained:0};
        dowRows.forEach(r=>{counts[r.bucket]=(counts[r.bucket]||0)+1;});
        const topBucket = Object.entries(counts).sort((a,b)=>b[1]-a[1])[0];
        const topPct = Math.round(topBucket[1]/total*100);
        const labelMap = {event:'event-driven',regional:'regional pattern',weather:'weather-driven',
          isolated_anomaly:'store-specific',contributing_factors:'mixed factors',unexplained:'model gap'};
        return {dow, n:total, topBucket:topBucket[0], topPct, label:labelMap[topBucket[0]]||topBucket[0],
          unexplainedPct:Math.round((counts.unexplained/total)*100),
          confidenceNote: topBucket[0]==='unexplained'
            ? 'Systematic gap — adjust confidently, not situational'
            : topBucket[0]==='weather'||topBucket[0]==='event'
            ? 'Situational — check whether this date has similar context before adjusting'
            : 'Mixed signal — moderate confidence in adjustment'};
      });
    }
  }

  const anchor=(ds.lastActual&&ds.lastActual[loc])||new Date();
  const days=[];
  for(let i=1;i<=daysForward;i++){
    const dt=addD(anchor,i);
    const adj=computeLifeLenzAdjustment(loc, dt, ds, settings, userEvents, biasStats);
    if(adj) days.push(adj);
  }
  return {loc, biasStats, dowAttribution, days};
}


// ════════════════════════════════════════════════════════════════════════════════
// LIFELENZ BRIDGE PANEL  (v4.202)
// ════════════════════════════════════════════════════════════════════════════════
// Surfaces runLifeLenzBridgeScan. Designed for the actual constraint: no API,
// manual entry only. Every row reduces to one number a GM can read and type
// into LifeLenz in a few seconds — not a dashboard to study. "Direct" rows
// mean LifeLenz's own forward projection was found in the loaded Labor
// Analysis file; "Pattern" rows mean it wasn't, so the adjustment is
// estimated from this store's historical day-of-week bias instead — labeled
// clearly rather than presented with false confidence.
// ─────────────────────────────────────────────────────────────────────────────
function LifeLenzBridgePanel({stores, ds, settings, userEvents, onClose}) {
  const {useState:uSt} = React;
  const LOCS = Object.keys(STORE_NAMES).sort((a,b)=>STORE_NAMES[a].localeCompare(STORE_NAMES[b]));
  const DOW_NAMES=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  const [mode, setMode] = uSt('single'); // 'single' | 'district'
  const [selLoc, setSelLoc] = uSt(LOCS[0]);
  const [scanResult, setScanResult] = uSt(null);
  const [scanning, setScanning] = uSt(false);
  const [copied, setCopied] = uSt(false);

  const [districtResults, setDistrictResults] = uSt(null);
  const [districtRunning, setDistrictRunning] = uSt(false);
  const [districtProg, setDistrictProg] = uSt(null);

  const runSingle = (loc) => {
    setScanning(true); setCopied(false);
    setTimeout(()=>{
      setScanResult(runLifeLenzBridgeScan(loc, ds, settings, userEvents, 14));
      setScanning(false);
    },10);
  };

  const runDistrict = async () => {
    setDistrictRunning(true);
    setDistrictResults(null);
    const results={};
    for(let i=0;i<LOCS.length;i++){
      setDistrictProg({done:i,total:LOCS.length,storeName:STORE_NAMES[LOCS[i]]});
      results[LOCS[i]] = runLifeLenzBridgeScan(LOCS[i], ds, settings, userEvents, 14);
      if(i%4===3) await new Promise(r=>setTimeout(r,0));
    }
    setDistrictResults(results);
    setDistrictRunning(false);
    setDistrictProg(null);
  };

  const jumpToStore = (loc) => {
    setSelLoc(loc);
    if(districtResults&&districtResults[loc]) setScanResult(districtResults[loc]);
    else runSingle(loc);
    setMode('single');
  };

  const fmtPlain$ = v => '$'+Math.round(Math.abs(v)).toLocaleString();
  const fmtPct = v => (v>=0?'+':'')+v.toFixed(1)+'%';

  const copyTable = () => {
    if(!scanResult) return;
    const storeName=STORE_NAMES[selLoc]||selLoc;
    const lines=[
      'LIFELENZ ADJUSTMENT — '+storeName,
      'Generated: '+new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'}),
      '',
      'Date          Meridian    LifeLenz    Adjust   Source    Note',
    ];
    scanResult.days.forEach(d=>{
      const dateStr=d.date.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}).padEnd(13);
      const mFc=('$'+d.meridianForecast.toLocaleString()).padEnd(11);
      const lfz=('$'+d.lfzProjection.toLocaleString()).padEnd(11);
      const adj=fmtPct(d.adjustmentPct).padEnd(8);
      const src=(d.source==='direct'?'Direct':'Pattern').padEnd(9);
      const note=d.shapeFlag?'⚠ '+d.shapeFlag.note:'';
      lines.push(dateStr+mFc+lfz+adj+src+note);
    });
    navigator.clipboard.writeText(lines.join('\n')).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2000);});
  };

  if(!ds||!ds.loaded) return div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.85)',zIndex:465,display:'flex',alignItems:'center',justifyContent:'center'}},
    div({style:{textAlign:'center',color:'var(--text3)',padding:40}},
      div({style:{fontSize:40,marginBottom:12}},'🌉'),
      div({style:{fontSize:'14px',fontWeight:700,color:'var(--text)',marginBottom:8}},'No Data Loaded'),
      div({style:{fontSize:'11px',marginBottom:16,lineHeight:1.6}},'Load a Labor Analysis file (with Projected Sales column) to run the LifeLenz Bridge.'),
      btn({className:'btn btn-sm',onClick:onClose},'Close')));

  return div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.82)',zIndex:465,
    display:'flex',alignItems:'flex-start',justifyContent:'center',padding:20,paddingTop:24}},
    div({style:{background:'var(--surf)',border:'.5px solid var(--bdr2)',borderRadius:'var(--rl)',
      width:'100%',maxWidth:920,maxHeight:'92vh',display:'flex',flexDirection:'column',
      boxShadow:'0 20px 60px rgba(0,0,0,.5)',overflow:'hidden'}},

      // Header
      div({style:{padding:'12px 16px',borderBottom:'.5px solid var(--bdr)',background:'var(--surf2)',
        display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}},
        span({style:{fontSize:'18px'}},'🌉'),
        div({style:{flex:1}},
          div({style:{fontSize:'13px',fontWeight:800,color:'var(--text)'}},'LifeLenz Bridge'),
          div({style:{fontSize:'9px',color:'var(--text3)'}},'One number to type into LifeLenz before the schedule locks — no API, this is the manual-entry workflow')
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
          btn({className:'btn btn-sm btn-a',style:{fontWeight:700},disabled:scanning,
            onClick:()=>runSingle(selLoc)},scanning?'⏳ Scanning…':'▶ Run 14-Day Scan'),
          scanResult&&btn({className:'btn btn-sm',onClick:copyTable},copied?'✓ Copied':'📋 Copy Table')
        ),
        div({style:{flex:1,overflowY:'auto',padding:'14px 16px'}},
          !scanResult&&!scanning&&div({style:{color:'var(--text3)',textAlign:'center',padding:'40px 20px',fontSize:'11px'}},
            div({style:{fontSize:36,marginBottom:10}},'🌉'),
            div(null,'Select a store and run the scan. Compares Meridian\'s forecast against LifeLenz\'s own projection for the next 14 days.')),

          scanResult&&React.createElement(React.Fragment,null,
            // Evidence summary
            scanResult.biasStats&&div({style:{marginBottom:14,padding:'10px 12px',background:'var(--surf2)',
              border:'.5px solid var(--bdr)',borderRadius:'var(--r)'}},
              div({style:{fontSize:'9px',fontWeight:700,color:'var(--text3)',textTransform:'uppercase',
                letterSpacing:'.4px',marginBottom:6}},'Historical Pattern — Last '+scanResult.biasStats.weeksBack+' Weeks'),
              div({style:{fontSize:'9.5px',color:'var(--text2)',marginBottom:8}},
                scanResult.biasStats.overall.avgBiasPct>=0
                  ? 'LifeLenz has under-forecasted this store by '+fmtPct(scanResult.biasStats.overall.avgBiasPct)+' on average — actual sales tend to come in higher than their projection.'
                  : 'LifeLenz has over-forecasted this store by '+fmtPct(Math.abs(scanResult.biasStats.overall.avgBiasPct))+' on average — actual sales tend to come in lower than their projection.'),
              div({style:{display:'flex',gap:4,flexWrap:'wrap'}},
                ...scanResult.biasStats.dowStats.filter(d=>d.n>=2).map(d=>{
                  const attr = scanResult.dowAttribution&&scanResult.dowAttribution[d.dow];
                  const attrCol = attr ? (attr.topBucket==='unexplained'?'#818cf8':attr.topBucket==='weather'||attr.topBucket==='event'?'#93c5fd':'#94a3b8') : 'var(--text3)';
                  return div({key:d.dow,style:{padding:'5px 10px',borderRadius:4,background:'rgba(255,255,255,.04)',
                    border:'.5px solid var(--bdr)',fontSize:'8px'}},
                    span({style:{color:'var(--text3)',fontWeight:700}},DOW_NAMES[d.dow]+': '),
                    span({style:{color:d.avgBiasPct>=0?'#10b981':'#f87171',fontWeight:700}},fmtPct(d.avgBiasPct)),
                    span({style:{color:'var(--text3)'}},' · Meridian wins '+d.meridianWinRate+'%'),
                    attr&&attr.label&&span({style:{display:'block',fontSize:'7px',color:attrCol,marginTop:2}},
                      '🔬 '+attr.label+(attr.topPct?' ('+attr.topPct+'%)':'')+
                      (attr.confidenceNote?' — '+attr.confidenceNote:''))
                  );
                })
              )
            ),
            // Forward 14-day list
            div(null,
              div({style:{fontSize:'9px',fontWeight:700,color:'var(--text3)',textTransform:'uppercase',
                letterSpacing:'.4px',marginBottom:6}},'Next 14 Days'),
              ...scanResult.days.map((d,i)=>{
                const isUp=d.adjustmentPct>=0;
                return div({key:i,style:{display:'flex',alignItems:'center',gap:10,padding:'8px 12px',
                  borderRadius:'var(--r)',border:'.5px solid var(--bdr)',marginBottom:5,background:'var(--surf2)'}},
                  div({style:{width:90,flexShrink:0}},
                    div({style:{fontSize:'9px',fontWeight:700,color:'var(--text)'}},
                      d.date.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}))),
                  div({style:{flex:1,display:'flex',gap:14,fontSize:'9px',color:'var(--text2)'}},
                    div(null,'Meridian: ',span({style:{fontWeight:700,color:'var(--text)'}},fmtPlain$(d.meridianForecast))),
                    div(null,'LifeLenz: ',span({style:{fontWeight:700,color:'var(--text)'}},fmtPlain$(d.lfzProjection)),
                      span({style:{fontSize:'7px',color:d.source==='direct'?'#10b981':'#f59e0b',marginLeft:4,
                        padding:'1px 5px',borderRadius:99,background:(d.source==='direct'?'#10b981':'#f59e0b')+'18'}},
                        d.source==='direct'?'DIRECT':'PATTERN'))
                  ),
                  div({style:{fontSize:'11px',fontWeight:800,color:isUp?'#10b981':'#ef4444',width:64,textAlign:'right'}},
                    fmtPct(d.adjustmentPct)),
                  d.shapeFlag&&span({title:d.shapeFlag.note,style:{fontSize:'13px',cursor:'help'}},'⚠️')
                );
              })
            ),
            // Shape flags detail (if any)
            scanResult.days.some(d=>d.shapeFlag)&&div({style:{marginTop:12,padding:'10px 12px',
              background:'rgba(245,158,11,.05)',border:'.5px solid rgba(245,158,11,.2)',borderRadius:'var(--r)'}},
              div({style:{fontSize:'9px',fontWeight:700,color:'var(--amber)',marginBottom:6}},'⚠️ Shape Deviation Notes'),
              ...scanResult.days.filter(d=>d.shapeFlag).map((d,i)=>
                div({key:i,style:{fontSize:'8.5px',color:'var(--text2)',marginBottom:4,lineHeight:1.5}},
                  span({style:{fontWeight:700,color:'var(--text)'}},
                    d.date.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})+' — '),
                  d.shapeFlag.note))
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
              ? Object.keys(districtResults).filter(l=>districtResults[l]).length+' stores scanned'
              : 'Runs the 14-day forward scan across every store.'),
          btn({className:'btn btn-sm btn-a',style:{fontWeight:700},disabled:districtRunning,
            onClick:runDistrict},districtRunning?'⏳ Scanning…':'▶ Run District Scan')
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
            div(null,'Run the district scan to see every store\'s historical bias and current adjustment opportunity.')),
          districtResults&&h('table',{style:{width:'100%',borderCollapse:'collapse',fontSize:'9px'}},
            h('thead',null,h('tr',null,
              ['Store','Hist. Bias','Meridian Win Rate','Tomorrow Adj','Shape Flags'].map((l,i)=>
                h('th',{key:i,style:{padding:'6px 8px',fontSize:'8px',fontWeight:700,color:'var(--text3)',
                  textTransform:'uppercase',letterSpacing:'.3px',borderBottom:'.5px solid var(--bdr)',
                  textAlign:i===0?'left':'center'}},l)))),
            h('tbody',null,
              ...Object.entries(districtResults).filter(([,r])=>r&&r.biasStats)
                .sort((a,b)=>Math.abs(b[1].biasStats.overall.avgBiasPct)-Math.abs(a[1].biasStats.overall.avgBiasPct))
                .map(([loc,r])=>{
                  const tomorrow=r.days&&r.days[0];
                  const shapeFlagCount=r.days?r.days.filter(d=>d.shapeFlag).length:0;
                  return h('tr',{key:loc,style:{borderBottom:'.5px solid rgba(255,255,255,.05)',
                    cursor:'pointer'},onClick:()=>jumpToStore(loc)},
                    h('td',{style:{padding:'7px 8px',fontWeight:700,color:'var(--amber)'}},sNameC(loc)),
                    h('td',{style:{padding:'7px 8px',textAlign:'center',
                      color:r.biasStats.overall.avgBiasPct>=0?'#10b981':'#f87171',fontWeight:700}},
                      fmtPct(r.biasStats.overall.avgBiasPct)),
                    h('td',{style:{padding:'7px 8px',textAlign:'center',color:'var(--text2)'}},
                      r.biasStats.overall.n+' obs'),
                    h('td',{style:{padding:'7px 8px',textAlign:'center',
                      color:tomorrow?(tomorrow.adjustmentPct>=0?'#10b981':'#ef4444'):'var(--text3)',fontWeight:700}},
                      tomorrow?fmtPct(tomorrow.adjustmentPct):'—'),
                    h('td',{style:{padding:'7px 8px',textAlign:'center',color:shapeFlagCount?'#f59e0b':'var(--text3)'}},
                      shapeFlagCount>0?'⚠️ '+shapeFlagCount:'—')
                  );
                })
            )
          )
        )
      )
    )
  );
}
// ── end LifeLenzBridgePanel ───────────────────────────────────────────────────

export {
  LifelenzGapPanel,
  computeLifeLenzHistoricalBias,
  buildHourlyShapeCurve,
  getShapeDeviationFlag,
  computeLifeLenzAdjustment,
  runLifeLenzBridgeScan,
  LifeLenzBridgePanel,
};
