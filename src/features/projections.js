// @ts-nocheck
import * as React from 'react';
import { STORE_NAMES, sName, sNameC, DOW_BASE, DEFAULT_TARGETS } from '../constants.js';
import { dKey, sodOf, addD, eodOf, thisWeek } from '../utils/date.js';
import { isHoliday } from '../utils/holidays.js';
import { forecastDay, fetchLY, getStoreOrg, fetchLYDate } from '../engine/forecast.js';
import { computeEventFactors } from '../utils/events.js';
import { TH, f$ } from '../utils/fmt.js';
import { ForecastAudit } from '../views/analytics.js';

const h=React.createElement;
const div=(p,...c)=>h('div',p,...c);
const span=(p,...c)=>h('span',p,...c);
const btn=(p,...c)=>h('button',p,...c);
const tr=(p,...c)=>h('tr',p,...c);
const td=(p,...c)=>h('td',p,...c);
const header=(p,...c)=>h('header',p,...c);
const table=(p,...c)=>h('table',p,...c);
const th=(p,...c)=>h('th',p,...c);
const tbl=(p,...c)=>h('table',p,...c);
const inp=(p,...c)=>h('input',p,...c);
const { useState, useEffect, useRef, useMemo, useCallback } = React;

// Stores finalized projections per store per week.
// Key: 'mf_locked_projections'
// Structure: { locKey: { weekKey: { days:{date:amount}, gc:{date:gc}, model, notes, lockedAt, lockedBy } } }
const PROJ_STORE_KEY = 'mf_locked_projections';
const PROJ_LOG_KEY   = 'mf_projection_log';

function loadLockedProjections() {
  try { return JSON.parse(localStorage.getItem(PROJ_STORE_KEY)||'{}'); } catch { return {}; }
}
function saveLockedProjections(data) {
  try { localStorage.setItem(PROJ_STORE_KEY, JSON.stringify(data)); } catch(e) { console.error('Proj save:', e); }
}
function loadProjectionLog() {
  try { return JSON.parse(localStorage.getItem(PROJ_LOG_KEY)||'[]'); } catch { return []; }
}

// weekKey: ISO Monday date string for the week containing a given date
function weekKey(date) {
  const d = new Date(date);
  // Use Wednesday as week start (work week Wed-Tue)
  const day = d.getDay(); // 0=Sun,1=Mon,...,6=Sat
  const diffToWed = (day - 3 + 7) % 7; // days since last Wednesday
  const wed = new Date(d);
  wed.setDate(d.getDate() - diffToWed);
  return dKey(wed);
}

function getLockedAmount(locked, loc, date) {
  const lp = locked[loc];
  if (!lp) return null;
  const wk = weekKey(date);
  const weekData = lp[wk];
  if (!weekData) return null;
  return weekData.days[dKey(date)] ?? null;
}

function lockProjectionWeek(locked, loc, weekStartDate, dayAmounts, gcAmounts, model, notes, name) {
  const next = JSON.parse(JSON.stringify(locked));
  if (!next[loc]) next[loc] = {};
  const wk = weekKey(weekStartDate);
  next[loc][wk] = {
    days: dayAmounts,   // { 'YYYY-MM-DD': amount }
    gc:   gcAmounts,    // { 'YYYY-MM-DD': gc }
    model, notes,
    lockedAt: new Date().toISOString(),
    lockedBy: name || 'User',
    weekStart: dKey(weekStartDate),
  };
  // Append to log
  try {
    const log = loadProjectionLog();
    log.push({ loc, wk, total: Object.values(dayAmounts).reduce((a,v)=>a+v,0),
      model, notes, lockedAt: next[loc][wk].lockedAt });
    localStorage.setItem(PROJ_LOG_KEY, JSON.stringify(log.slice(-500))); // keep last 500
  } catch(e) {}
  return next;
}

// PROJECTION WORKFLOW COMPONENT
// Full-screen modal: calendar + table views
// Multi-model proposals, approve/adjust, lock

// PRE-FORECAST BRIEF — Mandatory preflight before running projections
// Shows a moment-in-time analysis snapshot that saves with the projection.
// LOCK CONFIRMATION MODAL  (v176)
// Replaces window.confirm() for all lock actions.
// Shows per-store projections, model health, MAPE, and already-locked
// status before committing. Requires deliberate confirmation.
function LockConfirmationModal({storeSummaries, periodLabel, lockType, onConfirm, onCancel}) {
  const [notes, setNotes] = React.useState('');
  const [confirmed, setConfirmed] = React.useState(false);

  const warnings = storeSummaries.filter(s => s.mape != null && s.mape > 15);
  const totalProj = storeSummaries.reduce((a,s)=>a+(s.weekTotal||0),0);
  const totalLY   = storeSummaries.reduce((a,s)=>a+(s.lyTotal||0),0);
  const vsLY      = totalLY>0 ? ((totalProj-totalLY)/totalLY*100) : null;
  const alreadyLocked = storeSummaries.filter(s=>s.isAlreadyLocked).length;
  const thS = {padding:'4px 8px',fontSize:'8px',fontWeight:700,textTransform:'uppercase',
    letterSpacing:'.4px',color:'var(--text3)',borderBottom:'.5px solid var(--bdr)'};
  const mapeCol = m => m<10?'#10b981':m<15?'#f59e0b':'#ef4444';
  const healthCol = h => h>=75?'#10b981':h>=50?'#f59e0b':'#ef4444';

  return div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.80)',zIndex:500,
    display:'flex',alignItems:'center',justifyContent:'center',padding:16}},
    div({style:{background:'var(--surf)',border:'.5px solid var(--bdr2)',borderRadius:'var(--rl)',
      width:'100%',maxWidth:820,maxHeight:'90vh',display:'flex',flexDirection:'column',
      boxShadow:'0 20px 60px rgba(0,0,0,.5)',overflow:'hidden'}},
      // Header
      div({style:{padding:'12px 16px',borderBottom:'.5px solid var(--bdr)',flexShrink:0,
        background:'var(--surf2)',display:'flex',alignItems:'center',gap:10}},
        span({style:{fontSize:'18px'}},'🔒'),
        div({style:{flex:1}},
          div({style:{fontSize:'13px',fontWeight:800,color:'var(--text)'}},'Confirm '+lockType+' Lock'),
          div({style:{fontSize:'9px',color:'var(--text3)',marginTop:1}},periodLabel)
        ),
        btn({className:'btn btn-sm',style:{color:'var(--text3)'},onClick:onCancel},'✕')
      ),
      // Summary bar
      div({style:{display:'flex',gap:16,padding:'8px 16px',background:'var(--surf2)',
        borderBottom:'.5px solid var(--bdr)',flexShrink:0,flexWrap:'wrap'}},
        ...[
          {l:'Stores',    v:storeSummaries.length},
          {l:'Total Proj',v:f$(totalProj)},
          {l:'vs LY',     v:vsLY!=null?(vsLY>=0?'+':'')+vsLY.toFixed(1)+'%':'—',
            c:vsLY!=null?(vsLY>=0?'#10b981':'#ef4444'):'var(--text3)'},
          {l:'Already Locked', v:alreadyLocked+' / '+storeSummaries.length,
            c:alreadyLocked===storeSummaries.length?'#10b981':'var(--text3)'},
          warnings.length?{l:'⚠ High MAPE',v:warnings.length+' stores',c:'#f59e0b'}:null,
        ].filter(Boolean).map((k,i)=>div({key:i,style:{textAlign:'center'}},
          div({style:{fontSize:'7px',textTransform:'uppercase',letterSpacing:'.3px',color:'var(--text3)'}},(k.l)),
          div({style:{fontSize:'12px',fontWeight:700,fontFamily:'var(--mono)',color:k.c||'var(--text)'}},k.v)
        ))
      ),
      // Store table
      div({style:{flex:1,overflowY:'auto'}},
        h('table',{style:{width:'100%',borderCollapse:'collapse',fontSize:'9px'}},
          h('thead',null,h('tr',null,
            ...['Store','Proj $','vs LY','Model','MAPE','Health','Status']
             .map((l,i)=>th({key:i,style:{...thS,textAlign:i>=1?'right':'left',paddingLeft:i===0?14:8}},(l)))
          )),
          h('tbody',null,...storeSummaries.map((s,i)=>{
            const isWarn = s.mape>15;
            return tr({key:s.loc,style:{borderBottom:'.5px solid rgba(255,255,255,.04)',
              background:isWarn?'rgba(245,158,11,.04)':i%2?'rgba(255,255,255,.015)':'transparent'}},
              td({style:{padding:'4px 8px 4px 14px',fontWeight:600,color:'var(--amber)',whiteSpace:'nowrap',fontSize:'8.5px'}},s.name),
              td({style:{padding:'4px 8px',textAlign:'right',fontFamily:'var(--mono)',color:'var(--text2)'}},s.weekTotal>0?f$(s.weekTotal):'—'),
              td({style:{padding:'4px 8px',textAlign:'right',fontFamily:'var(--mono)',fontSize:'8.5px',fontWeight:700,
                color:s.vsLY!=null?(s.vsLY>=0?'#10b981':'#ef4444'):'var(--text3)'}},
                s.vsLY!=null?(s.vsLY>=0?'+':'')+s.vsLY.toFixed(1)+'%':'—'),
              td({style:{padding:'4px 8px',textAlign:'right',fontSize:'8px',color:'var(--text3)'}},s.model||'Default'),
              td({style:{padding:'4px 8px',textAlign:'right',fontFamily:'var(--mono)',
                color:s.mape!=null?mapeCol(s.mape):'var(--text3)',fontWeight:isWarn?700:400}},
                s.mape!=null?s.mape.toFixed(1)+'%':'—'),
              td({style:{padding:'4px 8px',textAlign:'right',fontFamily:'var(--mono)',
                color:s.health!=null?healthCol(s.health):'var(--text3)'}},
                s.health!=null?s.health+'/100':'—'),
              td({style:{padding:'4px 8px',textAlign:'right',fontSize:'8px'}},
                s.isAlreadyLocked
                  ? span({style:{color:'#10b981',fontSize:'8px'}},'✓ Locked — will update')
                  : span({style:{color:'var(--text3)'}}, '○ New lock'))
            );
          }))
        )
      ),
      // Notes + confirm
      div({style:{borderTop:'.5px solid var(--bdr)',padding:'10px 14px',flexShrink:0,
        display:'flex',gap:10,alignItems:'flex-end',background:'var(--surf2)'}},
        div({style:{flex:1}},
          div({style:{fontSize:'8px',color:'var(--text3)',marginBottom:3,textTransform:'uppercase',letterSpacing:'.3px'}},'Notes (optional — saved with lock)'),
          h('input',{type:'text',value:notes,onChange:e=>setNotes(e.target.value),
            placeholder:'e.g. "Holiday week — adjusted manually for 3 stores"',
            style:{width:'100%',background:'var(--surf)',border:'.5px solid var(--bdr)',
              borderRadius:'var(--r)',color:'var(--text)',fontSize:'10px',padding:'5px 8px'}})
        ),
        div({style:{display:'flex',gap:6}},
          warnings.length>0&&!confirmed&&btn({className:'btn btn-sm',
            style:{color:'#f59e0b',borderColor:'rgba(245,158,11,.4)',fontSize:'8.5px'},
            onClick:()=>setConfirmed(true)},
            '⚠ Acknowledge '+warnings.length+' high-MAPE store'+(warnings.length>1?'s':'')),
          btn({className:'btn btn-sm',style:{color:'var(--text3)'},onClick:onCancel},'Cancel'),
          btn({className:'btn btn-sm btn-a',
            disabled: warnings.length>0&&!confirmed,
            title: warnings.length>0&&!confirmed?'Acknowledge high-MAPE stores first':'',
            style:{fontWeight:700,padding:'5px 16px',
              opacity:warnings.length>0&&!confirmed?.5:1},
            onClick:()=>onConfirm(notes)},
            '🔒 Confirm Lock — '+storeSummaries.length+' stores')
        )
      )
    )
  );
}

// LOCK HISTORY PANEL  (v176)
// Reads from PROJ_LOG_KEY and renders a filterable table of all past
// lock events. Accessible from Projections workflow header.
function LockHistoryPanel({stores, onClose}) {
  const [search, setSearch] = React.useState('');
  const [sortBy, setSortBy] = React.useState('date');
  const log = React.useMemo(()=>{
    try{return JSON.parse(localStorage.getItem(PROJ_LOG_KEY)||'[]');}catch{return [];}
  },[]);
  // Enrich with store names
  const rows = React.useMemo(()=>{
    const enriched = log.map(e=>({...e,storeName:sName(e.loc)}));
    let r = search ? enriched.filter(e=>
      (e.storeName||'').toLowerCase().includes(search.toLowerCase())||
      (e.notes||'').toLowerCase().includes(search.toLowerCase())||
      (e.wk||'').includes(search)) : enriched;
    if(sortBy==='date')   r=[...r].sort((a,b)=>new Date(b.lockedAt)-new Date(a.lockedAt));
    if(sortBy==='store')  r=[...r].sort((a,b)=>(a.storeName||'').localeCompare(b.storeName||''));
    if(sortBy==='total')  r=[...r].sort((a,b)=>(b.total||0)-(a.total||0));
    return r;
  },[log,search,sortBy]);

  const exportCSV=()=>{
    const hdr='Store,Week,Scope,Total Locked,Model,Notes,Locked At\n';
    const body=rows.map(r=>[r.storeName||r.loc,r.wk,r.scope==='month'?'Month':'Week',r.total||0,r.model||'',r.notes||'',r.lockedAt||''].map(v=>`"${v}"`).join(',')).join('\n');
    const a=document.createElement('a');a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(hdr+body);
    a.download='LockHistory_'+dKey(new Date())+'.csv';a.click();
  };
  const thS={padding:'4px 8px',fontSize:'8px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.4px',color:'var(--text3)',borderBottom:'.5px solid var(--bdr)',cursor:'pointer'};
  const clearHistory=()=>{if(confirm('Clear all lock history? This cannot be undone.')){localStorage.removeItem(PROJ_LOG_KEY);onClose();}};

  return div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.78)',zIndex:480,
    display:'flex',flexDirection:'column',paddingTop:20}},
    div({style:{flex:'0 0 20px',cursor:'pointer'},onClick:onClose}),
    div({style:{flex:1,background:'var(--surf)',maxWidth:960,margin:'0 auto',width:'calc(100% - 32px)',
      borderRadius:'var(--rl) var(--rl) 0 0',display:'flex',flexDirection:'column',overflow:'hidden',
      boxShadow:'0 -8px 40px rgba(0,0,0,.4)'}},
      div({style:{padding:'10px 16px',borderBottom:'.5px solid var(--bdr)',flexShrink:0,
        background:'var(--surf2)',display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}},
        span({style:{fontSize:'16px'}},'📋'),
        div({style:{flex:1}},
          div({style:{fontSize:'13px',fontWeight:800,color:'var(--text)'}},'Projection Lock History'),
          div({style:{fontSize:'9px',color:'var(--text3)',marginTop:1}},rows.length+' events · last 500 kept')
        ),
        btn({className:'btn btn-sm',onClick:exportCSV},'⬇ CSV'),
        btn({className:'btn btn-sm',style:{color:'#f87171'},onClick:clearHistory},'🗑 Clear'),
        btn({className:'btn btn-sm',style:{color:'var(--text3)'},onClick:onClose},'✕')
      ),
      div({style:{display:'flex',gap:6,padding:'7px 16px',borderBottom:'.5px solid var(--bdr)',flexShrink:0,alignItems:'center',flexWrap:'wrap'}},
        h('input',{type:'text',placeholder:'Search store, notes, week…',value:search,onChange:e=>setSearch(e.target.value),
          style:{background:'var(--surf2)',border:'.5px solid var(--bdr)',borderRadius:'var(--r)',
            color:'var(--text)',fontSize:'10px',padding:'4px 8px',width:220}}),
        span({style:{fontSize:'8px',color:'var(--text3)',marginLeft:4}},'Sort:'),
        ...['date','store','total'].map(s=>btn({key:s,className:'btn btn-sm',
          style:{fontSize:'8.5px',background:sortBy===s?'var(--adim)':'transparent',
            color:sortBy===s?'var(--amber)':'var(--text3)',borderColor:sortBy===s?'rgba(245,158,11,.4)':'var(--bdr)'},
          onClick:()=>setSortBy(s)},s[0].toUpperCase()+s.slice(1)))
      ),
      div({style:{flex:1,overflowY:'auto'}},
        !rows.length ? div({style:{color:'var(--text3)',textAlign:'center',padding:40,fontSize:'11px'}},
          'No lock history found. History is recorded each time you lock projections.') :
        h('table',{style:{width:'100%',borderCollapse:'collapse',fontSize:'9px'}},
          h('thead',null,h('tr',null,
            ...['Store','Week','Scope','Total $','Model','Notes','Locked At']
             .map((l,i)=>th({key:i,style:{...thS,textAlign:i>=3?'right':'left',paddingLeft:i===0?14:8},
               onClick:()=>setSortBy(i===0?'store':i===3?'total':'date')},l))
          )),
          h('tbody',null,...rows.map((r,i)=>{
            const dt=r.lockedAt?new Date(r.lockedAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'2-digit',hour:'2-digit',minute:'2-digit'}):null;
            const scope=r.scope||'week'; // entries logged before v4.193 had no scope field — assume week (the only thing that existed then)
            return tr({key:i,style:{borderBottom:'.5px solid rgba(255,255,255,.04)',
              background:i%2?'rgba(255,255,255,.015)':'transparent'}},
              td({style:{padding:'4px 8px 4px 14px',fontWeight:600,color:'var(--amber)',fontSize:'8.5px',whiteSpace:'nowrap'}},r.storeName||r.loc),
              td({style:{padding:'4px 8px',color:'var(--text3)',fontFamily:'var(--mono)',fontSize:'8px'}},r.wk||'—'),
              td({style:{padding:'4px 8px',textAlign:'right',fontSize:'8px',fontWeight:600,
                color:scope==='month'?'#818cf8':'var(--text3)'}},scope==='month'?'📅 Month':'Week'),
              td({style:{padding:'4px 8px',textAlign:'right',fontFamily:'var(--mono)',color:'var(--text2)'}},r.total>0?f$(r.total):'—'),
              td({style:{padding:'4px 8px',textAlign:'right',fontSize:'8px',color:'var(--text3)'}},r.model||'—'),
              td({style:{padding:'4px 8px',textAlign:'right',fontSize:'8.5px',color:'var(--text2)',maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},r.notes||'—'),
              td({style:{padding:'4px 8px',textAlign:'right',fontSize:'8px',color:'var(--text3)',whiteSpace:'nowrap'}},dt||'—')
            );
          }))
        )
      )
    )
  );
}

function PreForecastBrief({stores,ds,settings,userEvents,weekStart,projPeriod,lockedProjections,onRun,onClose}){
  const [aiSummary,  setAiSummary]  = React.useState('');
  const [generating, setGenerating] = React.useState(false);
  const apiKey=(()=>{try{return localStorage.getItem('mf_anthropic_key')||'';}catch{return '';}})();
  const t=React.useMemo(()=>{
    const r={};(stores||[]).forEach(s=>{r[s.loc]=(settings.targets&&settings.targets[s.loc])||DEFAULT_TARGETS[s.loc]||{};});return r;
  },[stores,settings]);

  const brief=React.useMemo(()=>{
    if(!ds||!ds.loaded||!stores||!stores.length) return null;
    const locs=(stores||[]).filter(s=>/^\d+$/.test(s.loc)).map(s=>s.loc);
    const now=new Date();
    // ── Sales trend: last 4 weeks vs LY ────────────────────────────────
    const trendWeeks=[];
    for(let w=3;w>=0;w--){
      const wStart=addD(now,-w*7-now.getDay()+3); // Wed
      const wEnd=addD(wStart,6);
      const actual=ds.laborRows.filter(r=>locs.includes(r.loc)&&r.date>=wStart&&r.date<=wEnd&&r.sales>0).reduce((a,r)=>a+r.sales,0);
      const ly=ds.laborRows.filter(r=>locs.includes(r.loc)&&r.date>=addD(wStart,-364)&&r.date<=addD(wEnd,-364)&&r.sales>0).reduce((a,r)=>a+r.sales,0);
      if(actual>0) trendWeeks.push({label:'Wk -'+(3-w),actual,ly,vsLY:ly>0?(actual-ly)/ly:null});
    }
    const lastVsLY=trendWeeks.filter(w=>w.vsLY!=null).slice(-3);
    const avgVsLY=lastVsLY.length?lastVsLY.reduce((a,w)=>a+w.vsLY,0)/lastVsLY.length:null;
    const trendDir=lastVsLY.length>=2?(lastVsLY[lastVsLY.length-1].vsLY-lastVsLY[0].vsLY)>0.005?'improving':lastVsLY[lastVsLY.length-1].vsLY-lastVsLY[0].vsLY<-0.005?'declining':'stable':'stable';

    // ── Calendar: holidays and tagged events in forecast window ────────
    const wsDate=new Date(weekStart+'T12:00:00Z');
    const forecastDays=Array.from({length:7},(_,i)=>addD(wsDate,i));
    const calEvents=[];
    forecastDays.forEach(d=>{
      const hol=isHoliday(d);
      if(hol) calEvents.push({date:d,type:'holiday',label:hol.label,icon:'🎉'});
      const dk=dKey(d);
      const uev=settings._userEvents||{};
      locs.forEach(loc=>{
        const ev=uev[loc]&&uev[loc][dk];
        if(ev&&!calEvents.find(c=>c.date===d&&c.type==='tagged'))
          calEvents.push({date:d,type:'tagged',label:ev.label||ev.type||'Tagged Event',icon:ev.icon||'🏷',loc});
      });
    });
    // Also check LY comparison period for anomalies
    const lyRisks=[];
    forecastDays.forEach(d=>{
      const lyDate=addD(d,-364);
      const uev=settings._userEvents||{};
      const lyDk=dKey(lyDate);
      locs.forEach(loc=>{
        const ev=uev[loc]&&uev[loc][lyDk];
        if(ev) lyRisks.push({date:d,lyDate,loc,label:ev.label||'Tagged event in LY window',icon:ev.icon||'⚠'});
      });
    });

    // ── Ops snapshot: last 2 weeks metrics ──────────────────────────────
    const cut2w=addD(now,-14);
    const recentOps=ds.opsRows.filter(r=>locs.includes(r.loc)&&r.date>=cut2w&&r.oepeWoP>0);
    const avgOEPE=recentOps.length?recentOps.reduce((a,r)=>a+r.oepeWoP,0)/recentOps.length:null;
    const recentCtrl=ds.ctrlRows.filter(r=>locs.includes(r.loc)&&r.date>=cut2w&&r.tpph>0);
    const avgTPPH=recentCtrl.length?recentCtrl.reduce((a,r)=>a+r.tpph,0)/recentCtrl.length:null;
    const avgLaborPct=recentCtrl.length?recentCtrl.reduce((a,r)=>a+r.laborPct,0)/recentCtrl.length:null;

    // ── Model confidence: DI calibration status ─────────────────────────
    const dialedIn=(()=>{try{return JSON.parse(localStorage.getItem('mf_di_calibration')||'{}');}catch{return {};}})();
    const calibrated=locs.filter(l=>dialedIn[l]).length;
    const avgMAPE6w=locs.filter(l=>dialedIn[l]&&dialedIn[l].mape6w!=null).map(l=>dialedIn[l].mape6w);
    const distMAPE=avgMAPE6w.length?avgMAPE6w.reduce((a,b)=>a+b,0)/avgMAPE6w.length:null;

    // ── Projection preview (1-day sample per store) ────────────────────
    const sampleForecasts=locs.map(loc=>{
      try{const r=forecastDay(loc,wsDate,ds,{...settings,_userEvents:userEvents||{}},null,t[loc]);return r&&r.forecast>0?r.forecast:0;}catch{return 0;}
    });
    const weekFcEst=sampleForecasts.reduce((a,b)=>a+b,0)*7;

    return{trendWeeks,avgVsLY,trendDir,calEvents,lyRisks,avgOEPE,avgTPPH,avgLaborPct,calibrated,totalLocs:locs.length,distMAPE,weekFcEst,wsDate};
  },[ds,stores,settings,weekStart]);

  const generateSummary=async()=>{
    if(!apiKey||!brief) return;
    setGenerating(true);
    const{avgVsLY,trendDir,calEvents,lyRisks,avgOEPE,distMAPE,weekFcEst,calibrated,totalLocs}=brief;
    const prompt='You are a QSR district intelligence analyst for McDonald\'s. Write a 4-sentence executive briefing for the upcoming week\'s projections.\n\n'+
      'Data points:\n'+
      '- District sales vs LY: '+(avgVsLY!=null?((avgVsLY>=0?'+':'')+(avgVsLY*100).toFixed(1)+'%'):'Data pending')+'\n'+
      '- Trend direction: '+trendDir+'\n'+
      '- Calendar events this week: '+(calEvents.length?calEvents.map(e=>e.label).join(', '):'None identified')+'\n'+
      '- Known LY anchor risks: '+(lyRisks.length?lyRisks.length+' location-date combinations with tagged LY events':'None')+'\n'+
      '- District OEPE: '+(avgOEPE?Math.round(avgOEPE)+'s':'Data pending')+'\n'+
      '- Avg 6W MAPE: '+(distMAPE?distMAPE.toFixed(1)+'%':'Pending calibration')+'\n'+
      '- DI Calibrated: '+calibrated+'/'+totalLocs+' stores\n'+
      '- Estimated weekly total: '+(weekFcEst>0?'$'+Math.round(weekFcEst/1000)+'K':'Pending')+'\n\n'+
      'Write 4 clear, direct, management-ready sentences. No bullet points. Lead with the trend signal, mention any calendar factors, note model confidence, close with an action note.';
    try{
      const resp=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',
        headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
        body:JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:300,messages:[{role:'user',content:prompt}]})});
      const data=await resp.json();
      const txt=(data.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('').trim();
      setAiSummary(txt);
    }catch{setAiSummary('Unable to generate summary — check API key in Settings.');}
    setGenerating(false);
  };

  const handleRun=()=>{
    // Save moment-in-time snapshot
    if(brief){
      const snap={ts:Date.now(),weekStart,projPeriod,brief,aiSummary};
      try{localStorage.setItem('mf_pfbrief_'+weekStart,JSON.stringify(snap));}catch{}
    }
    onRun();
  };

  if(!brief) return div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.85)',zIndex:450,display:'flex',alignItems:'center',justifyContent:'center'}},
    div({style:{color:'var(--text3)',textAlign:'center'}},
      div({style:{fontSize:32,marginBottom:8}},'📋'),
      div(null,'Load data to see Pre-Forecast Brief'),
      div({style:{marginTop:12,display:'flex',gap:8,justifyContent:'center'}},
        btn({className:'btn btn-sm',onClick:onClose},'Cancel'),
        btn({className:'btn btn-a',onClick:onRun},'Skip Brief & Run Projections'))));

  const{trendWeeks,avgVsLY,trendDir,calEvents,lyRisks,avgOEPE,avgTPPH,avgLaborPct,calibrated,totalLocs,distMAPE,weekFcEst,wsDate}=brief;
  const trendCol=avgVsLY==null?'var(--text3)':avgVsLY>0.02?'#10b981':avgVsLY<-0.02?'#f87171':'#f59e0b';
  const trendIcon=trendDir==='improving'?'📈':trendDir==='declining'?'📉':'→';
  const sectionCard=(icon,title,col,children)=>div({style:{background:'var(--mid)',border:'.5px solid var(--bdr)',borderRadius:8,padding:'12px 14px',marginBottom:10,borderLeft:'3px solid '+(col||'var(--bdr)')}},
    div({style:{fontSize:'9px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.5px',color:col||'var(--text3)',marginBottom:6,display:'flex',gap:6,alignItems:'center'}},icon,' ',title),
    children);

  return div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.85)',zIndex:450,display:'flex',flexDirection:'column',overflowY:'auto'}},
    div({style:{maxWidth:760,width:'100%',margin:'0 auto',padding:'24px 16px 40px'}},
      // Header
      div({style:{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:18}},
        div(null,
          div({style:{fontSize:'9px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.8px',color:'var(--gold)',marginBottom:4}},'📋 Pre-Forecast Brief'),
          div({style:{fontSize:'18px',fontWeight:800,color:'var(--text)'}},'Projection Preflight Analysis'),
          div({style:{fontSize:'10px',color:'var(--text3)',marginTop:3}},
            'Week starting '+(wsDate.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}))+
            ' · '+totalLocs+' locations · '+new Date().toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}))),
        div({style:{display:'flex',gap:8,alignItems:'center'}},
          btn({className:'btn btn-sm',style:{color:'var(--text3)'},onClick:onClose},'Cancel'),
          btn({className:'btn btn-a',style:{padding:'7px 18px',fontWeight:700},onClick:handleRun},'▶ Run Projections →'))
      ),

      // ── Sales Trend ─────────────────────────────────────────────────────
      sectionCard(trendIcon,'Sales Trend — Last 4 Weeks',trendCol,
        div(null,
          div({style:{display:'flex',gap:8,marginBottom:8,flexWrap:'wrap'}},
            trendWeeks.map((w,i)=>{
              const vc=w.vsLY==null?'var(--text3)':w.vsLY>0.01?'#10b981':w.vsLY<-0.01?'#f87171':'#f59e0b';
              return div({key:i,style:{background:'rgba(255,255,255,.04)',border:'.5px solid var(--bdr)',borderRadius:4,padding:'6px 10px',minWidth:90,textAlign:'center'}},
                div({style:{fontSize:'8px',color:'var(--text3)',marginBottom:2}},w.label),
                div({style:{fontSize:'12px',fontFamily:'var(--mono)',fontWeight:700,color:'var(--text)'}},f$(w.actual)),
                w.vsLY!=null&&div({style:{fontSize:'9px',fontWeight:600,color:vc}},(w.vsLY>=0?'+':'')+(w.vsLY*100).toFixed(1)+'% vs LY'));
            })
          ),
          avgVsLY!=null&&div({style:{fontSize:'10px',color:trendCol,fontWeight:600}},
            trendIcon+' District is running '+(avgVsLY>=0?'+':'')+(avgVsLY*100).toFixed(1)+'% vs LY · Trend: '+trendDir)
        )
      ),

      // ── Calendar Intelligence ─────────────────────────────────────────
      sectionCard('📅','Calendar Intelligence — Forecast Window',
        calEvents.length?'#f59e0b':lyRisks.length?'#f97316':'#10b981',
        div(null,
          calEvents.length>0
            ?div(null,
                div({style:{fontSize:'9px',fontWeight:600,color:'var(--text)',marginBottom:4}},'Events in forecast period:'),
                div({style:{display:'flex',gap:6,flexWrap:'wrap'}},
                  calEvents.map((e,i)=>span({key:i,style:{fontSize:'9px',padding:'2px 8px',borderRadius:3,
                    background:'rgba(245,158,11,.1)',color:'#f59e0b',border:'.5px solid rgba(245,158,11,.3)',fontWeight:600}},
                    e.icon+' '+e.label+(e.loc?' ('+sNameC(e.loc)+')':'')))
                ))
            :div({style:{fontSize:'9px',color:'#10b981'}},'✅ No holidays or tagged events in forecast period'),
          lyRisks.length>0&&div({style:{marginTop:8,padding:'6px 8px',background:'rgba(249,115,22,.06)',borderRadius:4,
            border:'.5px solid rgba(249,115,22,.2)',fontSize:'9px',color:'#f97316'}},
            '⚠ '+lyRisks.length+' location-date combination'+(lyRisks.length!==1?'s':'')+' have tagged events in the LY comparison window — forecast will skip those LY anchors automatically')
        )
      ),

      // ── Ops Snapshot ───────────────────────────────────────────────────
      sectionCard('⚡','Operations Snapshot — Last 2 Weeks',
        (avgOEPE&&avgOEPE>170)?'#f59e0b':'#10b981',
        div({style:{display:'flex',gap:12,flexWrap:'wrap'}},
          [['OEPE',avgOEPE?Math.round(avgOEPE)+'s':'—','Target ≤150s',avgOEPE&&avgOEPE>170?'#f59e0b':avgOEPE&&avgOEPE>150?'#f97316':'#10b981'],
           ['TPPH',avgTPPH?avgTPPH.toFixed(2):'—','Target ≥5.0',avgTPPH&&avgTPPH<4.5?'#f59e0b':'#10b981'],
           ['Labor %',avgLaborPct?'$'+avgLaborPct.toFixed(1)+'%':'—','Target ~22%',null],
           ['DI Calibrated',calibrated+'/'+totalLocs,'stores','#a5b4fc'],
           ['Model MAPE',distMAPE?distMAPE.toFixed(1)+'%':'—','6-week avg',distMAPE&&distMAPE<8?'#10b981':distMAPE&&distMAPE<12?'#f59e0b':'#f87171']
          ].map(([l,v,sub,col],i)=>div({key:i,style:{background:'rgba(255,255,255,.04)',border:'.5px solid var(--bdr)',borderRadius:4,padding:'8px 12px',minWidth:100}},
            div({style:{fontSize:'8px',color:'var(--text3)',marginBottom:2}}),
            div({style:{fontSize:'8px',textTransform:'uppercase',letterSpacing:'.5px',color:'var(--text3)',marginBottom:2}},l),
            div({style:{fontSize:'15px',fontFamily:'var(--mono)',fontWeight:700,color:col||'var(--text)'}},v),
            div({style:{fontSize:'8px',color:'var(--text3)',marginTop:2}},sub)))
        )
      ),

      // ── Projection Preview ─────────────────────────────────────────────
      sectionCard('💰','Projection Preview',weekFcEst>0?'#a5b4fc':'var(--text3)',
        div({style:{fontSize:'11px',color:'var(--text2)'}},
          weekFcEst>0
            ?div(null,
                div({style:{fontSize:'10px',color:'var(--text3)',marginBottom:4}},'Estimated district week:'),
                div({style:{fontSize:'22px',fontFamily:'var(--mono)',fontWeight:800,color:'#a5b4fc',marginBottom:4}},f$(Math.round(weekFcEst))),
                div({style:{fontSize:'9px',color:'var(--text3)'}},'Based on next-week first-day sample × 7 days × '+totalLocs+' stores. Final numbers computed when you run projections.'))
            :'Load projection data to see preview')
      ),

      // ── AI Summary ─────────────────────────────────────────────────────
      div({style:{background:'rgba(96,165,250,.06)',border:'.5px solid rgba(96,165,250,.2)',borderRadius:8,padding:'12px 14px',marginBottom:12}},
        div({style:{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}},
          div({style:{fontSize:'9px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.5px',color:'#60a5fa'}},'🤖 AI Executive Summary'),
          btn({className:'btn btn-sm',style:{fontSize:'9px',color:'#60a5fa',borderColor:'rgba(96,165,250,.3)'},
            disabled:generating||!apiKey,onClick:generateSummary},
            generating?'⏳ Generating…':'Generate Summary')
        ),
        aiSummary
          ?div({style:{fontSize:'10px',color:'var(--text2)',lineHeight:1.7}},aiSummary)
          :div({style:{fontSize:'9px',color:'var(--text3)',fontStyle:'italic'}},
              apiKey?'Click "Generate Summary" for an AI-powered executive brief of this projection period.':'Add API key in Settings to enable AI summary.')
      ),

      // ── Footer actions ─────────────────────────────────────────────────
      div({style:{display:'flex',justifyContent:'space-between',alignItems:'center',
        borderTop:'.5px solid var(--bdr)',paddingTop:14,marginTop:4}},
        div({style:{fontSize:'9px',color:'var(--text3)'}},
          'This analysis is saved as a moment-in-time snapshot with your projection.'),
        div({style:{display:'flex',gap:8}},
          btn({className:'btn btn-sm',style:{color:'var(--text3)'},onClick:onClose},'← Back'),
          btn({className:'btn btn-a',style:{padding:'8px 24px',fontWeight:800,fontSize:'11px'},onClick:handleRun},
            '▶ Run Projections →'))
      )
    )
  );
}

// PROJECTION WORKSPACE — Enterprise One-Stop Projection Hub
// Wed-Tue work week | Group toggles | Inline overrides | Lock workflow
function ProjectionWorkflow({stores, ds, settings, userEvents, lockedProjections, onSaveLocked, onClose}) {
  const ALL_LOCS = (stores||[]).filter(s=>/^\d+$/.test(s.loc)).map(s=>s.loc);

  // ── State ──────────────────────────────────────────────
  const [groupBy,    setGroupBy]   = useState('patch');  // 'all'|'patch'|'operator'|'org'
  const [selGroup,   setSelGroup]  = useState('all');
  const [weekStart,  setWeekStart] = useState(()=>{
    const d=new Date(); const wsd=settings&&settings.weekStartDay!=null?settings.weekStartDay:3; const diff=(wsd-d.getDay()+7)%7||7;
    const w=new Date(d); w.setDate(d.getDate()+diff); return dKey(w);
  });
  const [overrides,  setOverrides] = useState({}); // {loc_date: {amt, mode:'auto'|'locked'|'approved'}}
  const [projPeriod, setProjPeriod] = useState('week');  // 'week'|'month'|'custom'
  // railSelected (v4.195 redesign): which left-rail "forecasting context" card is
  // active — 'week'|'month'|'year'. Deliberately separate from projPeriod rather
  // than reusing it directly: projPeriod's 'week'|'month'|'custom' contract drives
  // _activeHorizon/_fcstCache/computeWeek and has no 'year' value, and won't until
  // a real Yearly view exists. Selecting the Week or Month rail card keeps both in
  // sync (see setRailSelected below); selecting Year only moves railSelected so the
  // card can render today with zero risk to existing forecast logic. Custom range
  // is intentionally not a 4th rail card — it lives as a toggle inside the Week
  // card's content area (Fletcher's call) since it's an edge case, not a context.
  const [railSelected, setRailSelectedRaw] = useState('week'); // 'week'|'month'|'year'
  const [showCustomRange, setShowCustomRange] = useState(false); // Custom toggle, lives under Week card
  const setRailSelected = (v)=>{
    setRailSelectedRaw(v);
    if(v==='week'||v==='month') setProjPeriod(v);
    // 'year': projPeriod intentionally untouched — no consumer yet.
    // Navigating to Month or Year while Custom range was active clears the
    // toggle — prevents a stale "✕ Custom range" state if the user later
    // clicks back to Week without having explicitly closed Custom first.
    if(v!=='week') setShowCustomRange(false);
  };
  const [customStart,setCustomStart] = useState('');
  const [customEnd,  setCustomEnd]   = useState('');
  const [weekData,   setWeekData]  = useState({}); // {loc: [7 forecastRows]}
  const [loading,    setLoading]   = useState(false);
  const [loadingLoc, setLoadingLoc]= useState(null);
  const [deepStore,  setDeepStore] = useState(null); // loc for slide-out
  const [deepTab,    setDeepTab]   = useState('forecast'); // 'forecast'|'audit'
  const [auditDate,  setAuditDate] = useState(null);
  const [showPrint,  setShowPrint] = useState(false);
  const [showPFBrief,setShowPFBrief]=useState(false); // Pre-Forecast Brief preflight modal
  const [showLockConfirm, setShowLockConfirm] = useState(false); // lock confirmation modal
  const [lockConfirmData, setLockConfirmData] = useState(null);  // {summaries, periodLabel, lockType, onConfirm}
  const [showLockHistory, setShowLockHistory] = useState(false); // lock history panel
  const [monthLocking,   setMonthLocking]    = useState(false);  // in-progress month lock

  // ── Week days (Wed-Tue) ────────────────────────────────
  const projDays = React.useMemo(()=>{
    if(projPeriod==='month'){
      const s=new Date(weekStart+'T12:00:00');
      const monthS=new Date(s.getFullYear(),s.getMonth(),1);
      const monthE=new Date(s.getFullYear(),s.getMonth()+1,0);
      const days=[];let d=new Date(monthS);
      while(d<=monthE){days.push(new Date(d));d.setDate(d.getDate()+1);}
      return days;
    }
    if(projPeriod==='custom'&&customStart&&customEnd){
      const s=sodOf(new Date(customStart+'T12:00:00'));
      const e=eodOf(new Date(customEnd+'T12:00:00'));
      const days=[];let d=new Date(s);
      while(d<=e&&days.length<62){days.push(new Date(d));d.setDate(d.getDate()+1);}
      return days;
    }
    // Default: Wed-Tue work week (7 days)
    const s = new Date(weekStart+'T12:00:00');
    return Array.from({length:7},(_,i)=>addD(s,i));
  },[weekStart,projPeriod,customStart,customEnd]);
  // weekDays alias for backward compat with rest of component
  const weekDays = projDays;

  // ── Group structures ───────────────────────────────────
  const patches    = settings.supervisorGroups||{};
  const operators  = settings.operators||DEF_SETTINGS.operators||{};
  const orgs       = {
    'MCDOK':  ALL_LOCS.filter(l=>getStoreOrg(l)==='MCDOK'),
    'Emerald Arches': ALL_LOCS.filter(l=>getStoreOrg(l)==='Emerald Arches'),
  };

  const getActiveLocs = () => {
    if(selGroup==='all'||groupBy==='all') return ALL_LOCS;
    if(groupBy==='patch')    return patches[selGroup]||[];
    if(groupBy==='operator') return operators[selGroup]||[];
    if(groupBy==='org')      return orgs[selGroup]||[];
    return ALL_LOCS;
  };
  const activeLocs = getActiveLocs();

  // ── Compute week for all active locs ──────────────────
  const computeWeek = React.useCallback(async()=>{
    if(!ds||!ds.loaded) return;
    setLoading(true);
    const newData={};
    for(const loc of ALL_LOCS){
      setLoadingLoc(STORE_NAMES[loc]||loc);
      const t=(ds.targets&&ds.targets[loc])||DEFAULT_TARGETS[loc]||{};
      const rows=[];
      for(const d of weekDays){
        // weekDays is actually projDays — spans the full month/custom range
        // when not in week view, despite this function's legacy name. Use the
        // same _activeHorizon the cache uses so weekData and the cache never
        // disagree about which model assignment produced a given day's number.
        const r=forecastDay(loc,d,ds,{...settings,
            _userEvents:userEvents||{},
            _eventFactors:settings.useEventRegistry!==false?computeEventFactors(ds,userEvents||{}):{}
          },null,t,_activeHorizon);
        const key=loc+'_'+dKey(d);
        const ov=lockedProjections&&lockedProjections[key];
        rows.push({...r,date:d,loc,
          overrideAmt:ov?ov.amt:null,
          overrideMode:ov?ov.mode:'auto'});
      }
      newData[loc]=rows;
      await new Promise(res=>setTimeout(res,0));
    }
    setWeekData(newData);
    setLoadingLoc(null);
    setLoading(false);
  },[ds,settings,weekStart,lockedProjections,projPeriod,weekDays.length]);

  React.useEffect(()=>{computeWeek();},[computeWeek]);

  // ── Override helpers ────────────────────────────────────
  // For monthly/custom: group projDays into 7-day weeks
  const projWeeks = React.useMemo(()=>{
    if(projPeriod==='week') return [weekDays];
    const weeks=[];
    for(let i=0;i<weekDays.length;i+=7){
      weeks.push(weekDays.slice(i,Math.min(i+7,weekDays.length)));
    }
    return weeks;
  },[weekDays,projPeriod]);

  // ── Shared forecast cache ────────────────────────────────
  // Perf fix (v4.193): _fcstFn/_lyFn/_gt/CSV-export previously each called
  // forecastDay() independently and uncached for every (loc,date) pair —
  // _lyFn alone called it a 2nd time per cell just to read .lyAdj, and
  // StoreRow (run for all 27 stores on every render) recomputed the same
  // forecasts 2-3x per render with no memoization at all. This single
  // useMemo computes every (loc,date) forecast exactly once per render,
  // keyed only on the inputs that can actually change the result.
  //
  // Horizon fix (v4.194): forecastDay's 7th arg selects which per-store Model
  // Assignment (Weekly/Monthly/Yearly, set in the Model Assignment screen) is
  // used. Previously every call site omitted it, so every forecast — in Week
  // view, Month view, anywhere — silently always used the Weekly assignment.
  // The Monthly assignments were computed and stored but never actually read.
  // Now: Week view + Custom ranges of 14 days or fewer use 'weekly'; Month
  // view + Custom ranges over 14 days use 'monthly'. No 'yearly' UI exists
  // yet in Projection Workspace, so that assignment still has no consumer here.
  const _activeHorizon = projPeriod==='week' ? 'weekly'
    : projPeriod==='month' ? 'monthly'
    : (weekDays.length<=14 ? 'weekly' : 'monthly'); // custom range, sized by day count

  const _fcstCache = React.useMemo(()=>{
    const cache=new Map();
    for(const loc of ALL_LOCS){
      const t=(ds.targets&&ds.targets[loc])||DEFAULT_TARGETS[loc]||{};
      for(const d of weekDays){
        const k=loc+'|'+dKey(d);
        if(cache.has(k))continue;
        const r=forecastDay(loc,d,ds,{...settings,_userEvents:userEvents||{}},null,t,_activeHorizon);
        cache.set(k,r);
      }
    }
    return cache;
  },[ds,settings,weekDays,ALL_LOCS.join(','),_activeHorizon]);

  const _cachedForecast = (loc,d) => {
    const k=loc+'|'+dKey(d);
    return _fcstCache.get(k) || forecastDay(loc,d,ds,{...settings,_userEvents:userEvents||{}},null,(ds.targets&&ds.targets[loc])||DEFAULT_TARGETS[loc]||{},_activeHorizon);
  };

  // Forecast amount for (loc,d), respecting locked/approved overrides — replaces
  // every previous inline "_fcstFn" duplicate; now a cache lookup, not a recompute.
  const fcstAmt = (loc,d) => {
    const lp=lockedProjections&&lockedProjections[loc+'_'+dKey(d)];
    if(lp) return lp.amt;
    return _cachedForecast(loc,d).forecast||0;
  };

  // LY amount for (loc,d) — replaces every previous inline "_lyFn" duplicate.
  // No longer calls forecastDay a 2nd time: reuses the same cached result fcstAmt used.
  const lyAmt = (loc,d) => {
    const _r=_cachedForecast(loc,d);
    if(_r.lyAdj>0&&_r.lyAdj!==_r.forecast)return _r.lyAdj;
    const _ld=new Date(d);_ld.setFullYear(_ld.getFullYear()-1);
    const _lr=(ds.laborRows||[]).find(r=>String(r.loc)===String(loc)&&Math.abs(r.date-_ld)<4*86400000&&r.sales>0);
    return _lr?_lr.sales:0;
  };

  // As-originally-locked amount: the month-plan number for (loc,d), ignoring
  // any later week-level refinement. Falls back to the current effective
  // amount when no month lock ever existed for this day (nothing to compare against).
  const asLockedAmt = (loc,d) => {
    const key=loc+'_'+dKey(d);
    const entry=lockedProjections&&lockedProjections[key];
    if(!entry) return fcstAmt(loc,d);
    if(entry.source==='month') return entry.amt;
    if(entry.originalMonthLock) return entry.originalMonthLock.amt;
    return entry.amt; // week-locked with no prior month plan to compare against
  };

  const getAmt = (loc,date) => {
    const key=loc+'_'+dKey(date);
    const lp=lockedProjections&&lockedProjections[key];
    if(lp) return lp.amt;
    const wd=weekData[loc];
    if(!wd) return null;
    const row=wd.find(r=>dKey(r.date)===dKey(date));
    return row?row.forecast:null;
  };

  // source:'week'|'month' distinguishes a business-plan month lock from a
  // closer-to-the-date week refinement. When a week-lock overwrites a day
  // that was previously locked at the month level, the original month
  // number is preserved on the entry (originalMonthLock) so it's never
  // silently lost — visible in Lock History for "what we planned vs what shipped."
  const setOverride = (loc,date,amt,mode='locked',source='week') => {
    const key=loc+'_'+dKey(date);
    const prev=lockedProjections&&lockedProjections[key];
    const originalMonthLock = (source==='week'&&prev&&prev.source==='month')
      ? (prev.originalMonthLock||{amt:prev.amt,ts:prev.ts})
      : (prev&&prev.originalMonthLock)||null;
    const entry={amt,mode,source,
      ts:new Date().toISOString(),by:settings.dmName||'DM'};
    if(originalMonthLock) entry.originalMonthLock=originalMonthLock;
    const next={...(lockedProjections||{}),[key]:entry};
    onSaveLocked(next);
  };

  const clearOverride = (loc,date) => {
    const key=loc+'_'+dKey(date);
    const next={...(lockedProjections||{})};
    delete next[key]; onSaveLocked(next);
  };

  const lockRow = (loc) => {
    weekDays.forEach(d=>{
      const amt=getAmt(loc,d);
      if(amt) setOverride(loc,d,amt,'locked','week');
    });
  };

  // Batch lock helpers
  // ── Build per-store summaries for the confirmation modal ────────────
  const buildStoreSummaries = (locs) => {
    return locs.map(loc=>{
      const rows = weekData[loc]||[];
      const weekTotal = rows.reduce((a,r)=>a+(r.actual||r.forecast||0),0);
      const lyTotal   = rows.reduce((a,r)=>a+(r.lyAdj||0),0);
      const vsLY      = lyTotal>0 ? (weekTotal-lyTotal)/lyTotal*100 : null;
      const store     = (stores||[]).find(s=>s.loc===loc)||{};
      const mape      = settings.dialedIn&&settings.dialedIn[loc]?settings.dialedIn[loc].mape:null;
      const health    = store.modelHealth||null;
      const model     = settings.dialedIn&&settings.dialedIn[loc]&&settings.dialedInEnabled?'Dialed-In':'Default';
      const isAlreadyLocked = weekDays.every(d=>{
        const k=loc+'_'+dKey(d);
        return lockedProjections&&lockedProjections[k];
      });
      return { loc, name:sName(loc), weekTotal, lyTotal, vsLY, mape, health, model, isAlreadyLocked };
    });
  };

  // ── Show lock confirmation, then execute lock on confirm ─────────────
  const showLockFor = (locs, label) => {
    const summaries = buildStoreSummaries(locs);
    const periodStr = 'Week of '+new Date(weekStart+'T12:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})
      +' – '+new Date(weekDays[weekDays.length-1]).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric'});
    setLockConfirmData({
      storeSummaries: summaries,
      periodLabel: periodStr,
      lockType: label,
      onConfirm: (notes) => {
        const next={...(lockedProjections||{})};
        locs.forEach(loc=>{
          weekDays.forEach(d=>{
            const amt=getAmt(loc,d);
            if(!amt) return;
            const key=loc+'_'+dKey(d);
            const prev=lockedProjections&&lockedProjections[key];
            const originalMonthLock = (prev&&prev.source==='month')
              ? (prev.originalMonthLock||{amt:prev.amt,ts:prev.ts}) : (prev&&prev.originalMonthLock)||null;
            const entry={amt,mode:'locked',source:'week',
              ts:new Date().toISOString(),by:settings.dmName||'DM',notes};
            if(originalMonthLock) entry.originalMonthLock=originalMonthLock;
            next[key]=entry;
          });
        });
        onSaveLocked(next);
        // Log to history
        try {
          const log = loadProjectionLog();
          locs.forEach(loc=>{
            const rows=weekData[loc]||[];
            const total=rows.reduce((a,r)=>a+(r.actual||r.forecast||0),0);
            const model=settings.dialedIn&&settings.dialedIn[loc]&&settings.dialedInEnabled?'Dialed-In':'Default';
            log.push({loc,wk:weekStart,total,model,notes,scope:'week',lockedAt:new Date().toISOString()});
          });
          localStorage.setItem(PROJ_LOG_KEY,JSON.stringify(log.slice(-500)));
        }catch{}
        setShowLockConfirm(false);
        setLockConfirmData(null);
      }
    });
    setShowLockConfirm(true);
  };

  const lockAllStores = () => showLockFor(ALL_LOCS, 'All Stores');
  const lockByPatch   = (patchLocs) => showLockFor(patchLocs, 'Patch');

  // ── Month lock (business-plan freeze) ───────────────────
  // Locks every CALENDAR day (1st–last) of the target month, for every store,
  // tagged source:'month'. Unlike showLockFor (hardcoded to the current
  // weekDays/weekData), this builds its own date range and reads forecasts
  // via the shared fcstAmt/lyAmt cache, so it isn't limited to one week.
  // Later week-locks can still refine individual weeks within this month —
  // setOverride() automatically preserves the original month number when that happens.
  const getMonthCalendarDays = (yr,mo) => {
    const days=[];
    const last=new Date(yr,mo+1,0).getDate();
    for(let i=1;i<=last;i++) days.push(new Date(yr,mo,i,12));
    return days;
  };

  const showMonthLockFor = (yr,mo,forceRefresh=false) => {
    const monthDays = getMonthCalendarDays(yr,mo);
    const monthName = new Date(yr,mo,1).toLocaleDateString('en-US',{month:'long',year:'numeric'});
    // When refreshing, show LIVE forecast numbers in the preview (bypassing any
    // existing month lock) so what's previewed matches what will actually be written.
    const previewAmt = (loc,d) => {
      if(forceRefresh){
        const prev=lockedProjections&&lockedProjections[loc+'_'+dKey(d)];
        if(prev&&prev.source==='week') return prev.amt; // never preview overwriting a week refinement
        return _cachedForecast(loc,d).forecast||0;
      }
      return fcstAmt(loc,d);
    };
    const summaries = ALL_LOCS.map(loc=>{
      const monthTotal = monthDays.reduce((a,d)=>a+previewAmt(loc,d),0);
      const lyTotal = monthDays.reduce((a,d)=>a+lyAmt(loc,d),0);
      const vsLY = lyTotal>0 ? (monthTotal-lyTotal)/lyTotal*100 : null;
      const mape = settings.dialedIn&&settings.dialedIn[loc]?settings.dialedIn[loc].mape:null;
      const model = settings.dialedIn&&settings.dialedIn[loc]&&settings.dialedInEnabled?'Dialed-In':'Default';
      const isAlreadyLocked = monthDays.every(d=>{
        const k=loc+'_'+dKey(d);
        return lockedProjections&&lockedProjections[k];
      });
      return { loc, name:sName(loc), weekTotal:monthTotal, lyTotal, vsLY, mape, model, isAlreadyLocked };
    });
    setLockConfirmData({
      storeSummaries: summaries,
      periodLabel: monthName+(forceRefresh?' (REFRESH — overwrites existing month-plan numbers with current forecast; week-refined days are untouched)':' (business plan — every calendar day)'),
      lockType: (forceRefresh?'Refresh ':'')+'Month ('+monthName+')',
      onConfirm: (notes) => {
        const next={...(lockedProjections||{})};
        ALL_LOCS.forEach(loc=>{
          monthDays.forEach(d=>{
            const key=loc+'_'+dKey(d);
            const prev=lockedProjections&&lockedProjections[key];
            // Month lock/refresh never overwrites an existing WEEK lock — a closer-to-the-date
            // refinement always wins over the older month-level plan for that day.
            if(prev&&prev.source==='week') return;
            // Non-refresh mode: skip days already month-locked (no-op, by design).
            if(!forceRefresh&&prev&&prev.source==='month') return;
            const amt=forceRefresh?(_cachedForecast(loc,d).forecast||0):fcstAmt(loc,d);
            if(!amt) return;
            next[key]={amt,mode:'locked',source:'month',monthKey:yr+'-'+String(mo+1).padStart(2,'0'),
              ts:new Date().toISOString(),by:settings.dmName||'DM',notes};
          });
        });
        onSaveLocked(next);
        try {
          const log = loadProjectionLog();
          const total = summaries.reduce((a,s)=>a+s.weekTotal,0);
          log.push({loc:'ALL',wk:monthName,total,model:'—',notes,scope:forceRefresh?'month-refresh':'month',lockedAt:new Date().toISOString()});
          localStorage.setItem(PROJ_LOG_KEY,JSON.stringify(log.slice(-500)));
        }catch{}
        setShowLockConfirm(false);
        setLockConfirmData(null);
      }
    });
    setShowLockConfirm(true);
  };

  const approveRow = (loc) => {
    weekDays.forEach(d=>{
      const key=loc+'_'+dKey(d);
      const existing=lockedProjections&&lockedProjections[key];
      const amt=existing?existing.amt:getAmt(loc,d);
      if(amt) setOverride(loc,d,amt,'approved');
    });
  };

  // ── Period navigation ────────────────────────────────────
  // v4.195: generalized from week-only navWeek to navPeriod so Month view
  // gets real prev/next-month movement instead of requiring a switch to Week
  // and stepping week-by-week to cross into the target month. weekStart
  // (despite its name — legacy from week-only days) is the anchor date that
  // projDays derives the actual range from, branching on projPeriod; advancing
  // it by the right unit per period is sufficient, no other state needed.
  const navPeriod = (dir) => {
    const d=new Date(weekStart+'T12:00:00');
    if(projPeriod==='month'){
      d.setMonth(d.getMonth()+dir);
    } else {
      d.setDate(d.getDate()+dir*7); // week and custom-as-week-fallback
    }
    setWeekStart(dKey(d));
  };

  // ── Group totals ────────────────────────────────────────
  const getGroupTotal = (locs,dayIdx) =>
    locs.reduce((a,loc)=>{
      const amt=dayIdx!=null?fcstAmt(loc,weekDays[dayIdx]):
        weekDays.reduce((s,d)=>s+fcstAmt(loc,d),0);
      return a+(amt||0);
    },0);

  // ── Active group sections ───────────────────────────────
  const getGroupSections = () => {
    if(groupBy==='all') return [{label:'All Stores',locs:activeLocs}];
    if(groupBy==='patch') return Object.entries(patches)
      .filter(([,ids])=>ids.some(id=>ALL_LOCS.includes(id)))
      .map(([name,ids])=>({label:name,locs:ids.filter(id=>ALL_LOCS.includes(id))}));
    if(groupBy==='operator') return Object.entries(operators)
      .filter(([,ids])=>ids.some(id=>ALL_LOCS.includes(id)))
      .map(([name,ids])=>({label:name,locs:ids.filter(id=>ALL_LOCS.includes(id))}));
    if(groupBy==='org') return Object.entries(orgs)
      .filter(([,ids])=>ids.length>0)
      .map(([name,ids])=>({label:name,locs:ids}));
    return [{label:'All',locs:activeLocs}];
  };

  const sections = getGroupSections();
  // DOW (v4.195 fix): was hardcoded ['Wed','Thu','Fri','Sat','Sun','Mon','Tue']
  // — matched the default weekStartDay:3 (Wednesday, McDonald's standard) by
  // coincidence, but never actually read the setting. Changing weekStartDay
  // in Settings would correctly shift which calendar dates populate the
  // table (date math elsewhere already reads settings.weekStartDay) while
  // these column header LABELS stayed silently locked to Wed-start, going
  // out of sync with the dates underneath them. Now rotates the canonical
  // Sun-start DOW (module scope, line ~1835) by the actual configured day.
  // Wednesday remains the default — confirmed by Fletcher — only the source
  // of truth changed from a hardcoded local copy to the live setting.
  const _wsdLocal = settings&&settings.weekStartDay!=null?settings.weekStartDay:3;
  const DOW = Array.from({length:7},(_,i)=>DOW_BASE[(_wsdLocal+i)%7]);
  // TH (table header style) now comes from the module-scope constant above
  // — was a local redefinition identical to it.

  // ── Cell edit component ─────────────────────────────────
  const CellEdit = ({loc,date,baseAmt}) => {
    const key=loc+'_'+dKey(date);
    const lp=lockedProjections&&lockedProjections[key];
    const mode=lp?lp.mode:'auto';
    const amt=lp?lp.amt:baseAmt;
    const [editing,setEditing]=useState(false);
    const [val,setVal]=useState('');
    if(editing) return h('input',{
      autoFocus:true,
      style:{width:72,fontFamily:'var(--mono)',fontSize:'10px',textAlign:'right',
        background:'rgba(165,180,252,.15)',border:'.5px solid #a5b4fc',borderRadius:3,padding:'1px 4px'},
      defaultValue:amt||'',
      onKeyDown:e=>{
        if(e.key==='Enter'){const v=parseInt(e.target.value.replace(/\D/g,''));if(v>0)setOverride(loc,date,v,'locked');setEditing(false);}
        if(e.key==='Escape'){setEditing(false);}
      },
      onBlur:e=>{const v=parseInt(e.target.value.replace(/\D/g,''));if(v>0)setOverride(loc,date,v,'locked');setEditing(false);}
    });
    const modeIcon = mode==='approved'?'✅':mode==='locked'?'🔒':null;
    const col = mode==='approved'?'#10b981':mode==='locked'?'#a5b4fc':'var(--text)';
    return div({style:{display:'flex',alignItems:'center',gap:2,justifyContent:'flex-end'},
        onDoubleClick:()=>setEditing(true)},
      modeIcon&&span({style:{fontSize:'8px'},title:mode},[modeIcon]),
      span({style:{fontFamily:'var(--mono)',fontSize:'10px',color:col,cursor:'pointer'},
        title:'Double-click to override'},[amt?f$(amt):'—']),
      mode!=='auto'&&btn({style:{background:'none',border:'none',color:'var(--text3)',
        fontSize:'8px',cursor:'pointer',padding:0,lineHeight:1},
        title:'Clear override',onClick:()=>clearOverride(loc,date)},'✕')
    );
  };

  // ── Enhancement 2: GCA comparison sub-row ─────────────────────────────
  const GCARow = ({loc}) => {
    if(settings.useGCAModel||settings.showGCAComparison===false) return null;
    const rows=weekData[loc]||[];
    const hasGCA=rows.some(r=>r.forecastGCA&&r.forecastGCA>0);
    // Show row even without GCA data — display "needs GC data" msg so user knows why
    if(!hasGCA&&!rows.some(r=>r.ly>0)) return null; // truly no data at all
    const gcaTot=rows.reduce((a,r)=>a+(r.forecastGCA||0),0);
    const lyTot=rows.reduce((a,r)=>a+(r.forecast||0),0);
    if(!gcaTot||!lyTot) return null;
    const diff=((gcaTot-lyTot)/lyTot*100).toFixed(1);
    const colCnt=(projPeriod==='week'?7:projWeeks.length)+3;
    return tr({key:'gca_'+loc,style:{background:'rgba(96,165,250,.04)',borderBottom:'.5px solid var(--bdr)'}},
      td({style:{padding:'1px 8px 1px 20px',fontSize:'8px',color:'#60a5fa',whiteSpace:'nowrap'}},
        '↳ GCA Model'),
      ...(projPeriod==='week'
        ? rows.map((r,i)=>td({key:i,style:{padding:'1px 4px',textAlign:'right',
            fontFamily:'var(--mono)',fontSize:'8px',
            color:r.forecastGCA&&r.forecast&&r.forecastGCA>r.forecast?'#10b981':'#60a5fa'}},
            r.forecastGCA?f$(r.forecastGCA):'—'))
        : projWeeks.map((wk,wi)=>{
            const wkAmt=wk.reduce((a,d)=>{const r=rows.find(x=>dKey(x.date)===dKey(d));return a+(r&&r.forecastGCA||0);},0);
            return td({key:wi,style:{padding:'1px 4px',textAlign:'right',fontFamily:'var(--mono)',fontSize:'8px',color:'#60a5fa'}},wkAmt>0?f$(wkAmt):'—');
          })
      ),
      td({style:{padding:'1px 4px',textAlign:'right',fontFamily:'var(--mono)',fontSize:'9px',fontWeight:700,color:'#60a5fa',borderLeft:'.5px solid var(--bdr)'}},f$(gcaTot)),
      td({style:{padding:'1px 4px',textAlign:'right',fontSize:'8px',color:'var(--text3)'}},
        span({style:{fontSize:'8px',color:+diff>=0?'#10b981':'#f87171'}},
          (+diff>=0?'+':'')+diff+'% vs LY model')),
      td()
    );
  };

  // ── Enhancement 6: Daypart supplement sub-row ──────────────────────────
  const DaypartRow = ({loc}) => {
    if(settings.showDaypartSupplement===false) return null;
    const rows=weekData[loc]||[];
    const hasDp=rows.some(r=>r.dayparts&&Object.keys(r.dayparts).length>=2);
    if(!hasDp) return null;
    return tr({key:'dp_'+loc,style:{background:'rgba(52,211,153,.04)',borderBottom:'.5px solid var(--bdr)'}},
      td({style:{padding:'1px 8px 1px 20px',fontSize:'8px',color:'#34d399',whiteSpace:'nowrap'}},
        '↳ Dayparts B/L/D'),
      ...(projPeriod==='week'
        ? rows.map((r,i)=>{
            const dp=r.dayparts;
            return td({key:i,style:{padding:'1px 4px',textAlign:'right',fontSize:'7.5px',color:'var(--text3)'}},
              dp&&Object.keys(dp).length>=2
                ?div({style:{display:'flex',flexDirection:'column',gap:1,alignItems:'flex-end'}},
                   dp.breakfast&&div({style:{color:'#f59e0b'}},'🌅 $'+(dp.breakfast.forecast/1000).toFixed(1)+'K'),
                   dp.lunch&&div({style:{color:'#10b981'}},'☀ $'+(dp.lunch.forecast/1000).toFixed(1)+'K'),
                   dp.dinner&&div({style:{color:'#818cf8'}},'🌙 $'+(dp.dinner.forecast/1000).toFixed(1)+'K'))
                :'—');})
        : projWeeks.map((wk,wi)=>{
            const b=wk.reduce((a,d)=>{const r=rows.find(x=>dKey(x.date)===dKey(d));return a+(r&&r.dayparts&&r.dayparts.breakfast?r.dayparts.breakfast.forecast:0);},0);
            const l=wk.reduce((a,d)=>{const r=rows.find(x=>dKey(x.date)===dKey(d));return a+(r&&r.dayparts&&r.dayparts.lunch?r.dayparts.lunch.forecast:0);},0);
            const dn=wk.reduce((a,d)=>{const r=rows.find(x=>dKey(x.date)===dKey(d));return a+(r&&r.dayparts&&r.dayparts.dinner?r.dayparts.dinner.forecast:0);},0);
            return td({key:wi,style:{padding:'1px 4px',fontSize:'7.5px',textAlign:'right',color:'var(--text3)'}},
              (b||l||dn)?div(null,div({style:{color:'#f59e0b'}},'🌅'+f$(Math.round(b))),div({style:{color:'#10b981'}},'☀'+f$(Math.round(l))),div({style:{color:'#818cf8'}},'🌙'+f$(Math.round(dn)))):div(null,'—'));})
      ),
      td({style:{padding:'1px 4px',textAlign:'right',fontSize:'8px',color:'#34d399',
        borderLeft:'.5px solid var(--bdr)',fontFamily:'var(--mono)'}},
        (() => {
          const totals={b:0,l:0,d:0};
          rows.forEach(r=>{if(r.dayparts){totals.b+=(r.dayparts.breakfast?.forecast||0);totals.l+=(r.dayparts.lunch?.forecast||0);totals.d+=(r.dayparts.dinner?.forecast||0);}});
          return div(null,'🌅'+f$(Math.round(totals.b)),' ☀'+f$(Math.round(totals.l)),' 🌙'+f$(Math.round(totals.d)));
        })()),
      td(), td()
    );
  };

  // ── Store row ───────────────────────────────────────────
  const StoreRow = ({loc}) => {
    const store=stores.find(s=>s.loc===loc);
    const name=sName(loc); // 3708 — Ardmore-Broadway
    // Perf fix (v4.193): was two locally-defined functions that each called
    // forecastDay() uncached, with _lyFn duplicating the call _fcstFn already
    // made. Now both read from the single per-render cache built once above.
    const weekTotal=weekDays.reduce((a,d)=>a+fcstAmt(loc,d),0); // cached — matches week view exactly; this is the CURRENT EFFECTIVE total (week-lock overrides month-lock where present)
    const lyTotal=weekDays.reduce((a,d)=>a+lyAmt(loc,d),0); // cached LY — same dates as forecast
    // Original month-plan total — what was locked at the month level, ignoring
    // any later week refinements. Only meaningfully differs from weekTotal
    // when at least one day in this period has been week-refined after a month lock.
    const asLockedTotal=weekDays.reduce((a,d)=>a+asLockedAmt(loc,d),0);
    const hasRefinement = projPeriod!=='week' && Math.round(asLockedTotal)!==Math.round(weekTotal);
    const vsLY=lyTotal>0?((weekTotal-lyTotal)/lyTotal*100).toFixed(1):null;
    const allLocked=weekDays.every(d=>{const k=loc+'_'+dKey(d);return lockedProjections&&lockedProjections[k]&&lockedProjections[k].mode!=='auto';});
    const allApproved=weekDays.every(d=>{const k=loc+'_'+dKey(d);return lockedProjections&&lockedProjections[k]&&lockedProjections[k].mode==='approved';});
    const mape=settings.dialedIn&&settings.dialedIn[loc]&&settings.dialedIn[loc].mape;

    return tr({key:loc,style:{borderBottom:'.5px solid var(--bdr)',
      background:deepStore===loc?'rgba(165,180,252,.06)':'transparent'}},
      // Store name
      td({style:{padding:'4px 8px',minWidth:140,whiteSpace:'nowrap'}},
        div({style:{display:'flex',alignItems:'center',gap:4}},
          btn({style:{background:'none',border:'none',color:'#a5b4fc',cursor:'pointer',
            fontSize:'9px',padding:'0 2px'},
            onClick:()=>{setDeepStore(deepStore===loc?null:loc);setDeepTab('forecast');}},
            deepStore===loc?'▼':'▶'),
          span({style:{fontSize:'10px',fontWeight:600}},[name]),
          mape!=null&&span({style:{fontSize:'8px',color:mape<6?'#10b981':mape<10?'#f59e0b':'#f87171',
            marginLeft:2}},['±'+mape.toFixed(0)+'%'])
        )
      ),
      // Day cells — weekly (7 cols) or week-subtotals (N cols for month/custom)
      ...(projPeriod==='week'
        ? weekDays.map((d,di)=>
            td({key:di,style:{padding:'2px 4px',textAlign:'right',minWidth:82}},
              h(CellEdit,{loc,date:d,baseAmt:getAmt(loc,d)})))
        : projWeeks.map((wk,wi)=>{
            const wkAmt=wk.reduce((a,d)=>a+fcstAmt(loc,d),0);
            return td({key:wi,style:{padding:'4px 8px',textAlign:'right',
              fontFamily:'var(--mono)',fontSize:'10px',color:'var(--text)'}},
              wkAmt>0?f$(wkAmt):'—');
          })
      ),
      // Period total — labeled "Current Effective" in month/custom view since
      // it already reflects week-level refinements (fcstAmt checks lockedProjections
      // regardless of source, so a week-lock correctly overrides a month-lock here).
      td({style:{padding:'4px 8px',textAlign:'right',fontFamily:'var(--mono)',
        fontWeight:700,fontSize:'11px',color:'var(--amber)',borderLeft:'.5px solid var(--bdr)'}},
        weekTotal>0?f$(weekTotal):'—'),
      // As-Locked (Month Plan) — only shown in month/custom view. Highlights
      // when it differs from Current Effective, meaning at least one week in
      // this period has been refined since the month was originally locked.
      projPeriod!=='week'&&td({style:{padding:'4px 8px',textAlign:'right',fontFamily:'var(--mono)',
        fontSize:'10px',color:hasRefinement?'#818cf8':'var(--text3)'},
        title:hasRefinement?'Refined: '+f$(asLockedTotal)+' originally planned, now '+f$(weekTotal)+' after week-level updates.':'No week-level refinement yet — matches Current Effective.'},
        asLockedTotal>0?(f$(asLockedTotal)+(hasRefinement?' 🔄':'')):'—'),
      // LY Actual — raw same-DOW historical total for the period
      td({style:{padding:'4px 8px',textAlign:'right',fontFamily:'var(--mono)',
        fontSize:'10px',color:'var(--text3)'},
        title:'Actual sales from the same day of week, 52 weeks prior — same-DOW comparison.'},
        lyTotal>0?f$(Math.round(lyTotal)):'—'),
      // vs LY %
      td({style:{padding:'4px 8px',textAlign:'right',fontSize:'9px',
        color:vsLY!=null?(+vsLY>=0?'#10b981':'#f87171'):'var(--text3)',fontWeight:vsLY!=null?600:400}},
        vsLY!=null?((+vsLY>=0?'+':'')+vsLY+'% vs LY'):'—'),
      // Actions
      td({style:{padding:'2px 6px',whiteSpace:'nowrap'}},
        div({style:{display:'flex',gap:2}},
          btn({className:'btn btn-sm',
            style:{fontSize:'8px',padding:'1px 5px',color:allApproved?'#10b981':allLocked?'#a5b4fc':'var(--text3)'},
            title:allApproved?'Approved':'Lock this store row',
            onClick:()=>allApproved?approveRow(loc):lockRow(loc)},
            allApproved?'✅':allLocked?'🔒':'Lock'),
          btn({className:'btn btn-sm',
            style:{fontSize:'8px',padding:'1px 5px'},
            title:'View forecast detail',
            onClick:()=>{setDeepStore(deepStore===loc?null:loc);setDeepTab('forecast');}},
            '📋'),
          btn({className:'btn btn-sm',
            style:{fontSize:'8px',padding:'1px 5px'},
            title:'Forecast audit trail',
            onClick:()=>{setDeepStore(loc);setDeepTab('audit');setAuditDate(weekDays[0]);}},
            '🔬')
        )
      )
    );
  };

  // ── Section subtotal row ────────────────────────────────
  // Fixed v4.193: previously always rendered one <td> per DAY (weekDays),
  // misaligned with the header which shows one column per WEEK in month/custom
  // view. Now mirrors StoreRow's pattern — day cells in week view, week-subtotal
  // cells in month/custom view — and includes the new As-Locked column.
  const SubtotalRow = ({label,locs,style}) => {
    const periodCols = projPeriod==='week'
      ? weekDays.map((d,i)=>getGroupTotal(locs,i))
      : projWeeks.map(wk=>locs.reduce((a,loc)=>a+wk.reduce((s,d)=>s+fcstAmt(loc,d),0),0));
    const wkTotal=weekDays.reduce((a,d)=>a+getGroupTotal(locs,weekDays.indexOf(d)),0);
    const asLockedTotal=locs.reduce((a,loc)=>a+weekDays.reduce((s,d)=>s+asLockedAmt(loc,d),0),0);
    return tr({style:{background:'rgba(245,158,11,.06)',borderBottom:'1px solid var(--bdr2)',...(style||{})}},
      td({style:{padding:'4px 8px',fontSize:'9px',fontWeight:700,color:'var(--amber)'}},[label+' Total']),
      ...periodCols.map((t,i)=>td({key:i,style:{padding:'4px 8px',textAlign:'right',
        fontFamily:'var(--mono)',fontSize:'10px',fontWeight:600,color:'var(--amber)'}},t>0?f$(t):'—')),
      td({style:{padding:'4px 8px',textAlign:'right',fontFamily:'var(--mono)',
        fontWeight:700,color:'var(--amber)',borderLeft:'.5px solid var(--bdr)'}},wkTotal>0?f$(wkTotal):'—'),
      projPeriod!=='week'&&td({style:{padding:'4px 8px',textAlign:'right',fontFamily:'var(--mono)',
        fontSize:'10px',color:'var(--text3)'}},asLockedTotal>0?f$(asLockedTotal):'—'),
      td(),td(),td()  // LY Actual, vs LY, actions
    );
  };

  // ── District grand total ────────────────────────────────
  const DistrictTotal = () => {
    const periodCols = projPeriod==='week'
      ? weekDays.map((d,i)=>getGroupTotal(ALL_LOCS,i))
      : projWeeks.map(wk=>ALL_LOCS.reduce((a,loc)=>a+wk.reduce((s,d)=>s+fcstAmt(loc,d),0),0));
    const wkTotal=weekDays.reduce((a,d)=>a+getGroupTotal(ALL_LOCS,weekDays.indexOf(d)),0);
    const asLockedTotal=ALL_LOCS.reduce((a,loc)=>a+weekDays.reduce((s,d)=>s+asLockedAmt(loc,d),0),0);
    return tr({style:{background:'rgba(165,180,252,.12)',borderTop:'1px solid #a5b4fc'}},
      td({style:{padding:'6px 8px',fontWeight:800,fontSize:'11px',color:'#a5b4fc'}},'DISTRICT TOTAL'),
      ...periodCols.map((t,i)=>td({key:i,style:{padding:'6px 8px',textAlign:'right',
        fontFamily:'var(--mono)',fontWeight:800,fontSize:'11px',color:'#a5b4fc'}},t>0?f$(t):'—')),
      td({style:{padding:'6px 8px',textAlign:'right',fontFamily:'var(--mono)',
        fontWeight:800,fontSize:'13px',color:'#a5b4fc',borderLeft:'.5px solid #a5b4fc'}},
        wkTotal>0?f$(wkTotal):'—'),
      projPeriod!=='week'&&td({style:{padding:'6px 8px',textAlign:'right',fontFamily:'var(--mono)',
        fontSize:'11px',fontWeight:700,color:'#a5b4fc'}},asLockedTotal>0?f$(asLockedTotal):'—'),
      td(),td(),td()  // LY Actual, vs LY, actions
    );
  };

  // ── Deep dive slide-out ─────────────────────────────────
  const deepStoreObj = deepStore&&stores.find(s=>s.loc===deepStore);
  const deepWeekDays = deepStore&&(weekData[deepStore]||[]);

  // ── Lock deadline status (rail-ready) ─────────────────────────────────
  // Lifted out of the old header-badge IIFE (v4.193) so the Command Deck rail
  // (v4.195) and any other consumer can read the same computed status without
  // duplicating the scan. Logic unchanged from v4.193: scans the next 6 weeks
  // from today + current month, checks real lock coverage (every store × every
  // day in lockedProjections), and names the specific week(s)/month due.
  const lockStatus = React.useMemo(()=>{
    const today=new Date();
    const wsd=settings&&settings.weekStartDay!=null?settings.weekStartDay:3;
    const diffBack=(today.getDay()-wsd+7)%7;
    const thisWeekStart=new Date(today);thisWeekStart.setDate(today.getDate()-diffBack);
    thisWeekStart.setHours(12,0,0,0);

    const isWeekFullyLocked=(wkStart)=>{
      const days=Array.from({length:7},(_,i)=>{const d=new Date(wkStart);d.setDate(wkStart.getDate()+i);return d;});
      return ALL_LOCS.every(loc=>days.every(d=>{
        const k=loc+'_'+dKey(d);
        return lockedProjections&&lockedProjections[k];
      }));
    };

    const dueWeeks=[];
    for(let i=0;i<6;i++){
      const wkStart=new Date(thisWeekStart);wkStart.setDate(thisWeekStart.getDate()+i*7);
      const daysUntilStart=Math.ceil((wkStart-today)/864e5);
      const daysLeftToLock=daysUntilStart-10;
      if(daysLeftToLock>3) continue;
      if(isWeekFullyLocked(wkStart)) continue;
      const label=wkStart.toLocaleDateString('en-US',{month:'short',day:'numeric'});
      dueWeeks.push({label,daysLeftToLock,wkStart});
    }
    const worstWeek=dueWeeks.length?dueWeeks.reduce((a,b)=>a.daysLeftToLock<b.daysLeftToLock?a:b):null;
    const weeklyAlert=!!(worstWeek&&worstWeek.daysLeftToLock<=0);

    const yr=today.getFullYear(),mo=today.getMonth();
    const monthName=new Date(yr,mo,1).toLocaleDateString('en-US',{month:'long'});
    const lastDay=new Date(yr,mo+1,0).getDate();
    const monthDays=Array.from({length:lastDay},(_,i)=>new Date(yr,mo,i+1,12));
    const lockedMonthDays=monthDays.filter(d=>ALL_LOCS.every(loc=>{
      const k=loc+'_'+dKey(d);return lockedProjections&&lockedProjections[k];
    })).length;
    const monthFullyLocked=lockedMonthDays===monthDays.length;
    const monthlyDaysLeft=(()=>{const m=new Date(yr,mo,15);return Math.ceil((m-today)/864e5);})();
    const mWarn=!monthFullyLocked&&monthlyDaysLeft<=10&&monthlyDaysLeft>-(lastDay)?(monthlyDaysLeft<=0?'alert':'warn'):null;

    return {dueWeeks,worstWeek,weeklyAlert,monthName,lockedMonthDays,monthDaysLen:monthDays.length,mWarn,monthFullyLocked};
  },[settings,lockedProjections,ALL_LOCS.join(',')]);

  // ── Layered plan-vs-effective status, by patch × week (v4.195, Concept C) ──
  // Only meaningful in Month view (projWeeks holds the month's weekly buckets
  // there). For each patch and each week-bucket, determines: is every
  // store×day in that week locked at all; does any locked day in that week
  // carry source:'week' (a refinement that has diverged from the original
  // month plan, vs source:'month' / unlocked which are still "on plan");
  // and the plan total (asLockedAmt, i.e. the original month-lock number)
  // vs effective total (fcstAmt / actual locked amt) so a %-diff can show.
  // Today's date determines due/overdue exactly like lockStatus above, reusing
  // the same 10-day-prior-to-week-start rule, so the two displays never disagree.
  const layeredPatchWeeks = React.useMemo(()=>{
    if(projPeriod!=='month') return null;
    const today=new Date();
    // Month actually being viewed, derived from weekStart — NOT today's real
    // month. lockStatus.monthName is intentionally about today's calendar
    // month (used for the rail's "due weeks" logic) and must not be reused
    // here, or the header would silently show the wrong month after Prev/Next.
    const viewedMonthName = new Date(weekStart+'T12:00:00').toLocaleDateString('en-US',{month:'long',year:'numeric'});
    const patchRows = Object.entries(patches).map(([patchName,patchLocs])=>{
      const locs=patchLocs.filter(l=>ALL_LOCS.includes(l));
      const weeks=projWeeks.map(wk=>{
        const daysUntilStart=Math.ceil((wk[0]-today)/864e5);
        const daysLeftToLock=daysUntilStart-10;
        let anyLocked=false, allLocked=true, anyRefined=false;
        let planTotal=0, effTotal=0;
        for(const loc of locs){
          for(const d of wk){
            const key=loc+'_'+dKey(d);
            const entry=lockedProjections&&lockedProjections[key];
            if(entry){ anyLocked=true; if(entry.source==='week') anyRefined=true; }
            else { allLocked=false; }
            planTotal+=asLockedAmt(loc,d)||0;
            effTotal+=fcstAmt(loc,d)||0;
          }
        }
        if(!locs.length) allLocked=false;
        const pctDiff = planTotal>0 ? ((effTotal-planTotal)/planTotal*100) : 0;
        let status, statusColor;
        if(!allLocked){
          if(daysLeftToLock<=0){ status='overdue'; statusColor='var(--red)'; }
          else if(daysLeftToLock<=3){ status='due in '+daysLeftToLock+'d'; statusColor='var(--amber)'; }
          else { status='not yet locked'; statusColor='var(--text3)'; }
        } else if(anyRefined){
          status=(pctDiff>=0?'🔄 refined +':'🔄 refined ')+pctDiff.toFixed(1)+'% vs plan';
          statusColor='#818cf8';
        } else {
          status='locked, no refinement'; statusColor='var(--green)';
        }
        return {wk,allLocked,anyRefined,planTotal,effTotal,pctDiff,status,statusColor,daysLeftToLock};
      });
      const planSum=weeks.reduce((a,w)=>a+w.planTotal,0);
      const effSum=weeks.reduce((a,w)=>a+w.effTotal,0);
      return {patchName,locs,weeks,planSum,effSum};
    });
    return {patchRows,viewedMonthName};
  },[projPeriod,patches,projWeeks,lockedProjections,ALL_LOCS.join(','),weekStart]);

  // ── Pre-Forecast Brief preflight ───────────────────────────────────────
  if(showPFBrief) return h(PreForecastBrief,{
    stores,ds,settings,userEvents,weekStart,projPeriod,lockedProjections,
    onRun:()=>{setShowPFBrief(false);computeWeek();},
    onClose:()=>setShowPFBrief(false)
  });

  return div({style:{display:'flex',flexDirection:'column',height:'100%',maxHeight:'95vh'}},
    // ── Header ──
    div({style:{padding:'12px 16px',borderBottom:'.5px solid var(--bdr)',
      display:'flex',alignItems:'center',gap:10,flexShrink:0,flexWrap:'wrap'}},
      div(null,
        div({style:{fontSize:'14px',fontWeight:800}},'📋 Projection Workspace'),
        div({style:{fontSize:'9px',color:'var(--text3)',marginTop:1}},
          'Double-click any cell to override · 🔒 Lock rows · ✅ Approve · Drill down with ▶ · ✕ to collapse')
      ),
      // Custom date-range inputs — only rendered when the Custom range toggle
      // (on the rail's Week card) is active. The old "Using Weekly/Monthly
      // Assignments" header badge was removed here (v4.195) since the rail's
      // "Model in use" footer now covers that same information without
      // duplicating it in two places.
      showCustomRange&&div({style:{display:'flex',gap:4,marginLeft:8,alignItems:'center'}},
        h('input',{type:'date',style:{fontSize:'9px',padding:'1px 4px',
          background:'var(--surf2)',border:'.5px solid var(--bdr)',borderRadius:4,color:'var(--text)'},
          value:customStart,onChange:e=>setCustomStart(e.target.value)}),
        span({style:{fontSize:'9px',color:'var(--text3)',margin:'0 3px'}},'→'),
        h('input',{type:'date',style:{fontSize:'9px',padding:'1px 4px',
          background:'var(--surf2)',border:'.5px solid var(--bdr)',borderRadius:4,color:'var(--text)'},
          value:customEnd,onChange:e=>setCustomEnd(e.target.value)})
      ),
      // Group toggles
      div({style:{display:'flex',gap:4,marginLeft:8,alignItems:'center'}},
        div({style:{fontSize:'9px',color:'var(--text3)',marginRight:2}},'Group:'),
        [['all','All'],['patch','Patch'],['operator','Operator'],['org','Org']].map(([v,l])=>
          btn({key:v,className:'btn btn-sm'+(groupBy===v?' btn-a':''),
            style:{fontSize:'9px',padding:'2px 8px'},onClick:()=>setGroupBy(v)},l)
        )
      ),
      // Lock-deadline status now surfaces on the rail (left side of body, below)
      // instead of a header badge — avoids two places both claiming to show
      // lock status, per the agreed Command Deck redesign approach.
      // Period-agnostic actions only — Prev/Next nav, Brief & Refresh, Quick
      // Refresh, Lock All, Lock Month, Refresh Month, and Lock by Patch all
      // moved (v4.195) into the main-content sub-header below, contextual to
      // whichever rail card is selected, since each only makes sense for one
      // period (Lock Month doesn't apply to Week view and vice versa).
      div({style:{display:'flex',alignItems:'center',gap:6,marginLeft:'auto'}},
        btn({className:'btn btn-sm',style:{marginLeft:4},title:'Print or save as PDF (use browser Print → Save as PDF)',
          onClick:()=>window.print()},'🖨 Print'),
        btn({className:'btn btn-sm',style:{marginLeft:4},title:'Export current projection grid as CSV',
          onClick:()=>{
            const DOWn=['Wed','Thu','Fri','Sat','Sun','Mon','Tue'];
            const hdr=['Store',...weekDays.map((d,i)=>(projPeriod==='week'?DOWn[i%7]:d.toLocaleDateString('en-US',{month:'2-digit',day:'2-digit'}))+' '+d.toLocaleDateString('en-US',{month:'2-digit',day:'2-digit'})),'Week Total','LY Actual','vs LY%','Status'];
            const rows=ALL_LOCS.map(loc=>{
              const name=sName(loc);
              const dayAmts=weekDays.map(d=>fcstAmt(loc,d));
              const wkTotal=dayAmts.reduce((a,v)=>a+v,0);
              const lyTotal=weekDays.reduce((tot,d)=>tot+lyAmt(loc,d),0);
              const vsLY=lyTotal>0?((wkTotal-lyTotal)/lyTotal*100).toFixed(1)+'%':'—';
              const allApproved=weekDays.every(d=>{const k=loc+'_'+dKey(d);return lockedProjections&&lockedProjections[k]&&lockedProjections[k].mode==='approved';});
              const allLocked=weekDays.every(d=>{const k=loc+'_'+dKey(d);return lockedProjections&&lockedProjections[k];});
              return [name,...dayAmts.map(v=>v||0),wkTotal||0,lyTotal>0?Math.round(lyTotal):0,vsLY,allApproved?'Approved':allLocked?'Locked':'Draft'];
            });
            const csv=[hdr,...rows].map(r=>r.map(v=>`"${v}"`).join(',')).join('\n');
            const scope=groupBy==='all'?'AllStores':selGroup||'District';
            const fn='Projection_'+dKey(weekDays[0])+'_to_'+dKey(weekDays[weekDays.length-1])+'_'+scope+'.csv';
            const a=document.createElement('a');a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv);
            a.download=fn;a.click();
          }},'⬇ CSV'),
        btn({className:'btn btn-sm',style:{color:'var(--text3)'},
          title:'View all projection lock events with dates, totals, and notes',
          onClick:()=>setShowLockHistory(true)},'📋 History'),
        btn({className:'btn btn-sm',onClick:onClose},'✕ Close')
      )
    ),

    // ── Lock Confirmation Modal ──────────────────────────────────────────
    showLockConfirm&&lockConfirmData&&h(LockConfirmationModal,{
      storeSummaries: lockConfirmData.storeSummaries,
      periodLabel:    lockConfirmData.periodLabel,
      lockType:       lockConfirmData.lockType,
      onConfirm:      lockConfirmData.onConfirm,
      onCancel:       ()=>{setShowLockConfirm(false);setLockConfirmData(null);}
    }),

    // ── Lock History Panel ───────────────────────────────────────────────
    showLockHistory&&h(LockHistoryPanel,{
      stores,
      onClose:()=>setShowLockHistory(false)
    }),

    // ── Body: rail + grid + slide-out ──
    div({style:{display:'flex',flex:1,overflow:'hidden'}},

      // ── Left rail: forecasting context selector (Command Deck, v4.195) ──
      // Replaces the old 3-tiny-buttons period selector. Each card shows its
      // own lock status, deadline, and active model inline rather than that
      // being a separate badge elsewhere — period and model relationship is
      // now structural, not a tooltip. Width fixed at 250px per Fletcher
      // (widened from the 200px mockup to avoid truncating status text).
      div({style:{width:250,flexShrink:0,borderRight:'.5px solid var(--bdr)',
        background:'var(--surf2)',padding:12,overflowY:'auto'}},
        div({style:{fontSize:'9px',color:'var(--text3)',textTransform:'uppercase',
          letterSpacing:'.04em',marginBottom:10}},'Forecasting for'),
        div({style:{display:'flex',flexDirection:'column',gap:6}},

          // — Week card —
          (()=>{
            const active=railSelected==='week';
            const dot = lockStatus.weeklyAlert ? 'var(--red)'
              : lockStatus.worstWeek ? 'var(--amber)' : 'var(--green)';
            const deadlineTxt = !lockStatus.worstWeek ? 'all due weeks locked'
              : lockStatus.weeklyAlert ? 'OVERDUE'
              : 'due in '+lockStatus.worstWeek.daysLeftToLock+'d';
            return div({onClick:()=>setRailSelected('week'),
              title:lockStatus.dueWeeks.length?lockStatus.dueWeeks.map(w=>'Week of '+w.label+(w.daysLeftToLock<=0?' — OVERDUE':' — due in '+w.daysLeftToLock+'d')).join('\n'):undefined,
              style:{background:'var(--surf3)',borderRadius:6,padding:'8px 10px',cursor:'pointer',
                border:'1px solid '+(active?'var(--amber)':'var(--bdr)')}},
              div({style:{display:'flex',justifyContent:'space-between',alignItems:'center'}},
                span({style:{fontSize:11,fontWeight:700,color:active?'var(--amber)':'var(--text2)'}},
                  '📅 This Week'),
                span({style:{fontSize:8,color:dot}},'●')
              ),
              div({style:{fontSize:8.5,color:'var(--text3)',marginTop:3}},
                new Date(weekStart+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})
                +' · weekly model · '+deadlineTxt),
              btn({onClick:e=>{e.stopPropagation();setRailSelectedRaw('week');setShowCustomRange(v=>{const nv=!v;setProjPeriod(nv?'custom':'week');return nv;});},
                style:{fontSize:8,padding:'1px 6px',marginTop:6,background:'none',
                  border:'.5px solid var(--bdr)',borderRadius:3,color:'var(--text3)',cursor:'pointer'}},
                showCustomRange?'✕ Custom range':'Custom range…')
            );
          })(),

          // — Month card —
          (()=>{
            const active=railSelected==='month';
            const dot = lockStatus.mWarn==='alert' ? 'var(--red)'
              : lockStatus.mWarn==='warn' ? 'var(--amber)' : 'var(--green)';
            const deadlineTxt = lockStatus.monthFullyLocked ? 'fully locked'
              : lockStatus.mWarn==='alert' ? 'OVERDUE'
              : lockStatus.mWarn==='warn' ? 'due soon'
              : lockStatus.lockedMonthDays+'/'+lockStatus.monthDaysLen+' days locked';
            return div({onClick:()=>setRailSelected('month'),
              title:lockStatus.monthName+': '+lockStatus.lockedMonthDays+' of '+lockStatus.monthDaysLen+' days locked',
              style:{background:'var(--surf3)',borderRadius:6,padding:'8px 10px',cursor:'pointer',
                border:'1px solid '+(active?'var(--amber)':'var(--bdr)')}},
              div({style:{display:'flex',justifyContent:'space-between',alignItems:'center'}},
                span({style:{fontSize:11,fontWeight:700,color:active?'var(--amber)':'var(--text2)'}},
                  '🗓 '+lockStatus.monthName+' Plan'),
                span({style:{fontSize:8,color:dot}},'●')
              ),
              div({style:{fontSize:8.5,color:'var(--text3)',marginTop:3}},
                lockStatus.monthDaysLen+' days · monthly model · '+deadlineTxt)
            );
          })(),

          // — Year card (placeholder; no Yearly view exists yet) —
          div({title:'Yearly projections are on the roadmap but not yet built in Projection Workspace.',
            style:{background:'var(--surf3)',borderRadius:6,padding:'8px 10px',opacity:.45,
              border:'.5px solid var(--bdr)',cursor:'default'}},
            div({style:{display:'flex',justifyContent:'space-between',alignItems:'center'}},
              span({style:{fontSize:11,fontWeight:600,color:'var(--text3)'}},'📆 FY Year'),
              span({style:{fontSize:8,color:'var(--text3)'}},'○')
            ),
            div({style:{fontSize:8.5,color:'var(--text3)',marginTop:3}},'not yet available')
          )
        ),
        // Active model summary, matching Concept B's rail footer
        div({style:{marginTop:14,paddingTop:10,borderTop:'.5px solid var(--bdr)'}},
          div({style:{fontSize:9,color:'var(--text3)',textTransform:'uppercase',
            letterSpacing:'.04em',marginBottom:6}},'Model in use'),
          div({style:{fontFamily:'var(--mono)',fontSize:11,color:'#818cf8',fontWeight:700}},
            _activeHorizon==='monthly'?'Monthly Assignments':'Weekly Assignments'),
          div({style:{fontSize:8.5,color:'var(--text3)',marginTop:2}},
            'per-store, set in 🎯 Model Assignments')
        )
      ),

      // ── Main content: contextual sub-header (pinned) + scrollable grid ──
      div({style:{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}},

        // ── Contextual sub-header — actions specific to the selected rail
        // card (v4.195). Replaces the old always-visible button row that
        // mixed Week-only and Month-only actions together regardless of
        // which period was actually being viewed.
        div({style:{padding:'8px 14px',borderBottom:'.5px solid var(--bdr)',
          display:'flex',alignItems:'center',gap:6,flexShrink:0,flexWrap:'wrap'}},
          btn({className:'btn btn-sm',onClick:()=>navPeriod(-1)},'← Prev'),
          div({style:{fontSize:'10px',fontWeight:600,padding:'0 4px'}},
            railSelected==='month'
              ? new Date(weekStart+'T12:00:00').toLocaleDateString('en-US',{month:'long',year:'numeric'})
              : 'Week of '+new Date(weekStart+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})),
          btn({className:'btn btn-sm',onClick:()=>navPeriod(1)},'Next →'),

          railSelected==='week' && React.createElement(React.Fragment,null,
            btn({className:'btn btn-sm btn-a',style:{marginLeft:8},onClick:()=>setShowPFBrief(true),disabled:loading},
              loading?('⏳ '+loadingLoc+'…'):'📋 Brief & Refresh'),
            btn({className:'btn btn-sm',style:{marginLeft:4,fontSize:'9px',opacity:.7},
              title:'Refresh projections without showing the Pre-Forecast Brief',
              onClick:computeWeek,disabled:loading},'↻ Quick Refresh'),
            btn({className:'btn btn-sm btn-a',style:{marginLeft:4},
              title:'Review model health + projected totals, then lock all stores — opens confirmation dialog',
              onClick:lockAllStores},'🔒 Lock All'),
            // Patch-based batch lock — Week-only (v4.195): Month already has
            // its own explicit Lock Month action, so this only needs to live
            // alongside Lock All here rather than in the always-visible header.
            h('select',{
              onChange:e=>{
                if(!e.target.value) return;
                const patch=e.target.value;
                const patchLocs=ALL_LOCS.filter(loc=>{
                  const s=(stores||[]).find(x=>x.loc===loc);
                  return s&&(s.supervisor||s.patch||'')===patch;
                });
                if(patchLocs.length>0) lockByPatch(patchLocs);
                e.target.value='';
              },
              style:{fontSize:'9px',background:'var(--surf2)',border:'.5px solid var(--bdr)',
                borderRadius:'var(--r)',color:'var(--text2)',padding:'3px 8px',cursor:'pointer',marginLeft:4}},
              h('option',{value:''},'🔒 Lock by Patch...'),
              ...['Langford','Spencer','Podroza','Vaughn','Estrada','Denley'].map(p=>
                h('option',{key:p,value:p},p)
              )
            )
          ),

          railSelected==='month' && React.createElement(React.Fragment,null,
            // 📅 Month lock — business-plan freeze of every calendar day in
            // the month containing weekStart. Fixed v4.193: previously
            // computed the full list of weeks in the month but only ever
            // locked the single week on screen, while the confirmation/toast
            // said "Month (July 2026)" — misleading. Now actually locks
            // every calendar day of the target month.
            btn({className:'btn btn-sm',style:{marginLeft:8,color:'var(--amber)',borderColor:'rgba(245,158,11,.35)'},
              title:'Lock the business-plan numbers for every day of the month. Individual weeks can still be refined later with fresher data — that refinement always wins over this month plan for those specific days.',
              onClick:()=>{
                const ws=new Date(weekStart+'T12:00:00');
                showMonthLockFor(ws.getFullYear(),ws.getMonth());
              }},'📅 Lock Month'),
            // 🔄 Refresh Month Lock — deliberately overwrite already-month-
            // locked days with current live forecast data. Plain "Lock Month"
            // is a safe no-op on days already locked at the month level; this
            // is the explicit action for "re-run the plan with what we know
            // now." Week-refined days are always left untouched either way.
            btn({className:'btn btn-sm',style:{marginLeft:4,color:'#818cf8',borderColor:'rgba(165,180,252,.35)'},
              title:'Re-pull current forecast data into the month plan for every day NOT already refined at the week level. Days already locked/refined at the week level are never touched.',
              onClick:()=>{
                const ws=new Date(weekStart+'T12:00:00');
                showMonthLockFor(ws.getFullYear(),ws.getMonth(),true);
              }},'🔄 Refresh Month')
          )
        ),

        // ── Projection grid (scrolls independently of the sub-header above) ──
        div({style:{flex:1,overflowY:'auto',overflowX:'auto'}},

        // ── Layered Plan View (Concept C, v4.195) — Month view only ──
        // Patch-level (6 rows), not per-store (27 rows): the question this
        // answers — "did locking July also lock the weeks" — is a coverage
        // question, answered at a glance here; per-store financial detail
        // stays in the existing table below, untouched. Clicking a patch row
        // switches Group to Patch (if not already) and scrolls/highlights
        // that patch's section in the table.
        projPeriod==='month' && layeredPatchWeeks && div({style:{padding:'12px 14px',
          borderBottom:'1px solid var(--bdr2)',background:'var(--surf2)'}},
          div({style:{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:10}},
            div({style:{fontFamily:"'Syne',sans-serif",fontSize:13,fontWeight:800}},
              layeredPatchWeeks.viewedMonthName+' — plan vs effective'),
            div({style:{fontSize:9,color:'var(--text3)'}},'click a patch to jump to its detail below')
          ),
          div({style:{display:'flex',flexDirection:'column',gap:8}},
            ...layeredPatchWeeks.patchRows.map(({patchName,locs,weeks,planSum,effSum})=>
              div({key:patchName,onClick:()=>{
                  if(groupBy!=='patch') setGroupBy('patch');
                  // Defer scroll one tick so the table has re-rendered with
                  // patch sections if Group just switched away from something else.
                  setTimeout(()=>{
                    const el=document.getElementById('patchsec_'+patchName);
                    if(el){
                      el.scrollIntoView({behavior:'smooth',block:'start'});
                      el.style.backgroundColor='rgba(245,158,11,.35)';
                      setTimeout(()=>{el.style.backgroundColor='';},1500);
                    }
                  },groupBy!=='patch'?60:0);
                },
                style:{cursor:'pointer',background:'var(--surf3)',borderRadius:6,padding:'7px 10px',
                  border:'.5px solid var(--bdr)'}},
                div({style:{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:5}},
                  div({style:{fontSize:11,fontWeight:700,color:'var(--amber)'}},
                    patchName+' ('+locs.length+' stores)'),
                  div({style:{fontSize:9,color:'var(--text3)'}},
                    'Plan: '+f$(Math.round(planSum))+' → Effective: '+f$(Math.round(effSum)))
                ),
                div({style:{display:'flex',gap:4}},
                  ...weeks.map((w,wi)=>
                    div({key:wi,style:{flex:1},title:w.status},
                      div({style:{fontSize:7.5,color:'var(--text3)',marginBottom:2,whiteSpace:'nowrap',
                        overflow:'hidden',textOverflow:'ellipsis'}},
                        'Wk'+(wi+1)+' '+w.wk[0].toLocaleDateString('en-US',{month:'numeric',day:'numeric'})),
                      div({style:{position:'relative',height:14,borderRadius:3,overflow:'hidden',
                        background:'var(--surf)'}},
                        !w.allLocked
                          ? div({style:{width:'100%',height:'100%',background:'rgba(82,104,128,.4)'}})
                          : w.anyRefined
                            ? React.createElement(React.Fragment,null,
                                div({style:{position:'absolute',inset:0,width:'90%',background:'rgba(245,158,11,.18)'}}),
                                div({style:{position:'absolute',inset:0,width:'100%',background:'rgba(129,140,248,.35)',
                                  clipPath:'inset(0 0 0 90%)'}})
                              )
                            : div({style:{width:'100%',height:'100%',background:'rgba(245,158,11,.30)'}})
                      ),
                      w.effTotal>0&&div({style:{fontSize:8,fontFamily:'var(--mono)',fontWeight:600,
                        color:'var(--text2)',marginTop:2,whiteSpace:'nowrap',overflow:'hidden',
                        textOverflow:'ellipsis'}},
                        f$(Math.round(w.effTotal))),
                      div({style:{fontSize:7,color:w.statusColor,marginTop:1,whiteSpace:'nowrap',
                        overflow:'hidden',textOverflow:'ellipsis'}},w.status)
                    )
                  )
                )
              )
            )
          ),
          div({style:{display:'flex',gap:14,marginTop:10,paddingTop:8,borderTop:'.5px solid var(--bdr)',
            fontSize:8.5,color:'var(--text3)'}},
            span(null,h('span',{style:{display:'inline-block',width:8,height:8,
              background:'rgba(245,158,11,.5)',borderRadius:2,marginRight:4}}),'Month plan layer'),
            span(null,h('span',{style:{display:'inline-block',width:8,height:8,
              background:'rgba(129,140,248,.5)',borderRadius:2,marginRight:4}}),'Week refinement layer')
          )
        ),

        loading&&!Object.keys(weekData).length
          ? div({style:{padding:40,textAlign:'center',color:'var(--text3)'}},'⏳ Computing projections for all 27 stores…')
          : tbl({style:{width:'100%',borderCollapse:'collapse',fontSize:'10px'}},
              h('thead',null,
                // Sticky header (v4.195): column headers now stay visible while
                // scrolling through 27 stores, since the layered Month view
                // above the table pushes header rows out of view sooner than
                // before. position:sticky on the tr (not thead — more
                // consistent cross-browser) relies on each th's existing TH
                // background so rows scrolling underneath don't show through.
                tr({style:{position:'sticky',top:0,zIndex:2}},
                  th({style:{...TH,textAlign:'left',minWidth:140}},'Store'),
                  ...(projPeriod==='week'
                    ? DOW.map((d,i)=>th({key:i,style:{...TH,textAlign:'right',minWidth:82}},
                        d+' '+weekDays[i].toLocaleDateString('en-US',{month:'numeric',day:'numeric'})))
                    : projWeeks.map((wk,wi)=>th({key:wi,style:{...TH,textAlign:'right',minWidth:90}},
                        'Wk '+(wi+1)+' '+wk[0].toLocaleDateString('en-US',{month:'numeric',day:'numeric'})))
                  ),
                  th({style:{...TH,textAlign:'right',borderLeft:'.5px solid var(--bdr)'}},
                    projPeriod==='week'?'Period Total':'Current Effective'),
                  projPeriod!=='week'&&th({style:{...TH,textAlign:'right',color:'var(--text3)'},
                    title:'The original business-plan number from when the month was locked, ignoring any later week-level refinements. Differs from Current Effective only on weeks that have since been re-locked individually with fresher data.'},
                    'As Locked (Month Plan)'),
                  th({style:{...TH,textAlign:'right',color:'var(--text3)'},
                    title:'Actual sales from the same day of week, 52 weeks prior.\nMonday Jun 1, 2026 → compares to actual Monday Jun 2, 2025.\nThis column shows the raw historical value — no blending, no smoothing.'},
                    'LY Actual'),
                  th({style:{...TH,textAlign:'right'},
                    title:'Same-DOW Comparison: each projected day is compared to actual sales from the same day of week, 52 weeks prior.\n\nExample: Monday Jun 1, 2026 → actual Monday Jun 2, 2025.\nFriday Jun 5, 2026 → actual Friday Jun 6, 2025.\n\nHolidays and tagged events are skipped to the next clean comparable week.\n\nThis preserves day-of-week patterns which are the strongest predictor of QSR traffic.'},
                    'vs LY'),
                  th({style:{...TH,textAlign:'right'}})
                )
              ),
              h('tbody',null,
                ...sections.flatMap(({label,locs})=>[
                  // Section header
                  groupBy!=='all'&&tr({key:'hdr_'+label,id:'patchsec_'+label,style:{background:'rgba(245,158,11,.04)',
                    transition:'background-color .4s'}},
                    td({colSpan:20,style:{padding:'6px 8px',fontSize:'9px',fontWeight:700,
                      color:'var(--amber)',letterSpacing:'.5px',textTransform:'uppercase',
                      borderBottom:'.5px solid var(--bdr)'}},[label+' ('+locs.length+' stores)'])
                  ),
                  // Store rows
                  ...locs.filter(loc=>ALL_LOCS.includes(loc)).flatMap(loc=>[
                    h(StoreRow,{key:loc,loc}),
                    settings.showGCAComparison!==false&&h(GCARow,{key:'gca_'+loc,loc}),
                    settings.showDaypartSupplement!==false&&h(DaypartRow,{key:'dp_'+loc,loc}),
                  ].filter(Boolean)),
                  // Section subtotal
                  groupBy!=='all'&&h(SubtotalRow,{key:'sub_'+label,label,locs}),
                  // Deep dive inline (below the store section)
                  deepStore&&locs.includes(deepStore)&&tr({key:'deep_'+deepStore,
                    style:{background:'rgba(165,180,252,.04)',borderBottom:'1px solid #a5b4fc'}},
                    td({colSpan:11,style:{padding:0}},
                      div({style:{maxHeight:400,overflowY:'auto',padding:'8px 12px'}},
                        deepTab==='forecast'&&deepWeekDays.length>0&&
                          div({style:{fontSize:'10px'}},
                            div({style:{display:'flex',gap:6,marginBottom:6,alignItems:'center'}},
                              div({style:{fontWeight:700,color:'#a5b4fc'}},
                                (STORE_NAMES[deepStore]||deepStore)+' — Forecast Detail'),
                              btn({className:'btn btn-sm',style:{fontSize:'8px'},
                                onClick:()=>{setDeepTab('audit');setAuditDate(weekDays[0]);}},
                                '🔬 Audit'),
                              btn({className:'btn btn-sm',style:{fontSize:'8px',marginLeft:'auto'},
                                title:'Collapse this store detail',
                                onClick:()=>setDeepStore(null)},'✕ Close')
                            ),
                            tbl({style:{width:'100%',borderCollapse:'collapse',fontSize:'9px'}},
                              h('thead',null,tr(null,
                                ...['Date','DOW','Forecast','LY Actual','vs LY','Trend','Ops','GC'].map((l,i)=>
                                  th({key:i,style:{...TH,fontSize:'8px'}},l))
                              )),
                              h('tbody',null,deepWeekDays.map((r,i)=>{
                                const _rowLY=(r.lyAdj>0&&r.lyAdj!==r.forecast)?r.lyAdj:(()=>{
      const _lyDate=new Date(r.date); _lyDate.setFullYear(_lyDate.getFullYear()-1);
      const _lyRow=(ds.laborRows||[]).find(lr=>String(lr.loc)===String(r.loc||loc)&&
        Math.abs(lr.date-_lyDate)<4*86400000&&lr.sales>0);
      return _lyRow?_lyRow.sales:0;
    })();
    const vsLY=_rowLY>0?((r.forecast-_rowLY)/_rowLY*100).toFixed(1):null;
                                const gc=r.forecast>0&&ds?gcCrossCheck(deepStore,r.date,ds,settings,r.forecast):null;
                                return tr({key:i,style:{borderBottom:'.5px solid var(--bdr)'}},
                                  td({style:{padding:'3px 6px',fontWeight:600}},r.date.toLocaleDateString('en-US',{month:'short',day:'numeric'})),
                                  td({style:{padding:'3px 6px',color:'var(--text3)'}},[DOW[i]]),
                                  td({style:{padding:'3px 6px',textAlign:'right',fontFamily:'var(--mono)',fontWeight:700,color:'#a5b4fc'}},f$(r.forecast)),
                                  td({style:{padding:'3px 6px',textAlign:'right',fontFamily:'var(--mono)',color:'var(--text3)'}},
                                    r.lyAdj>0
                                      ? div({style:{textAlign:'right'}},
                                          div(null,f$(Math.round(r.lyAdj))),
                                          div({style:{fontSize:'7px',color:'var(--text3)',opacity:.7,marginTop:1}},
                                            (()=>{
                                              const lyDt=fetchLYDate(ds.laborIdx,deepStore,r.date,settings._userEvents);
                                              return lyDt?lyDt.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'2-digit'}):'';
                                            })()
                                          )
                                        )
                                      : '—'),
                                  td({style:{padding:'3px 6px',textAlign:'right',fontSize:'9px',
                                    color:vsLY!=null?(+vsLY>=0?'#10b981':'#f87171'):'var(--text3)'}},
                                    vsLY!=null?((+vsLY>=0?'+':'')+vsLY+'%'):'—'),
                                  td({style:{padding:'3px 6px',textAlign:'right',
                                    color:r.trend>=0?'#10b981':'#f87171'}},
                                    r.trend!=null?((r.trend>=0?'+':'')+( r.trend*100).toFixed(1)+'%'):'—'),
                                  td({style:{padding:'3px 6px',textAlign:'right',color:'var(--text3)'}},
                                    r.opsFactor!=null?r.opsFactor.toFixed(3):'—'),
                                  td({style:{padding:'3px 6px',textAlign:'center'}},
                                    gc?span({title:'Implied avg check: $'+gc.impliedCheck+' vs norm $'+gc.normCheck},
                                      gc.flag==='alert'?'🔴':gc.flag==='watch'?'⚠':'✓'):'—',
                                    span({style:{cursor:'pointer',marginLeft:4},
                                      title:'Open audit for this date',
                                      onClick:()=>{setAuditDate(r.date);setDeepTab('audit');}},
                                      '🔬')
                                  )
                                );
                              }))
                            )
                          ),
                        deepTab==='audit'&&deepStoreObj&&
                          h(ForecastAudit,{store:deepStoreObj,ds,settings,userEvents,
                            dateRange:{s:weekDays[0],e:weekDays[6]},
                            onClose:()=>setDeepTab('forecast')})
                      )
                    )
                  )
                ].filter(Boolean)),
                // District grand total
                h(DistrictTotal,{key:'grand'})
              )
            )
        )  // close inner scrollable grid div
      )  // close outer main-content flex-column wrapper
    )
  );
}

export { loadLockedProjections, saveLockedProjections, getLockedAmount, lockProjectionWeek, ProjectionWorkflow, PreForecastBrief };
