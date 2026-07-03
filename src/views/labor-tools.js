// @ts-nocheck
import * as React from 'react';
import { STORE_NAMES, sName, sNameC, getKB, getKBEdits, saveKBEdits, INV_ORG_COORDS, DEFAULT_MODEL_ASSIGNMENTS, DEFAULT_TARGETS, MODEL_ASSIGNMENT_KEY, STORE_KB } from '../constants.js';
import { avg6, forecastDay, getModelAssignment, saveModelOverride } from '../engine/forecast.js';
import { addD, sodOf } from '../utils/date.js';
import { TH, f$, gCol } from '../utils/fmt.js';
import { parseCtrlData, parseOpsData } from '../parsers/index.js';
import { runModelAssignmentBacktest } from '../engine/backtest.js';
import { ExportDropdown } from './store-dash.js';

const h=React.createElement;
const div=(p,...c)=>h('div',p,...c);
const span=(p,...c)=>h('span',p,...c);
const btn=(p,...c)=>h('button',p,...c);
const tr=(p,...c)=>h('tr',p,...c);
const td=(p,...c)=>h('td',p,...c);
const th=(p,...c)=>h('th',p,...c);
const thead=(p,...c)=>h('thead',p,...c);
const tbody=(p,...c)=>h('tbody',p,...c);
const sel=(p,...c)=>h('select',p,...c);
const opt=(p,...c)=>h('option',p,...c);

function DARDaypartPanel({stores, ds, settings, onClose}) {
  const {useState:uSt, useMemo:uM} = React;
  const LOCS = Object.keys(STORE_NAMES).sort((a,b)=>STORE_NAMES[a].localeCompare(STORE_NAMES[b]));
  const [selLoc, setSelLoc] = uSt(LOCS[0]);
  const [view,   setView]   = uSt('heatmap'); // 'heatmap' | 'daypart' | 'capacity'

  const hasDAR = ds.darRows && ds.darRows.length > 0;

  const data = uM(()=>{
    if(!hasDAR) return null;
    const rows = (ds.darRows||[]).filter(r=>String(r.loc)===selLoc);
    if(!rows.length) return null;

    // Parse hour from "12:00 PM" format → 0-23
    const parseHour = h=>{
      if(!h) return null;
      const m=String(h).match(/(\d+):(\d+)\s*(AM|PM)?/i);
      if(!m) return null;
      let hr=parseInt(m[1]);
      const mn=parseInt(m[2]);
      const ampm=(m[3]||'').toUpperCase();
      if(ampm==='PM'&&hr<12) hr+=12;
      if(ampm==='AM'&&hr===12) hr=0;
      return hr;
    };

    // Group by hour
    const byHour={};
    rows.forEach(r=>{
      const hr=parseHour(r.hour);
      if(hr==null||hr<5) return; // skip overnight
      if(!byHour[hr]) byHour[hr]={oepe:[],gc:[],sales:[],n:0};
      if(r.oepe>0) byHour[hr].oepe.push(r.oepe);
      if(r.gc>0)   byHour[hr].gc.push(r.gc);
      if(r.sales>0)byHour[hr].sales.push(r.sales);
      byHour[hr].n++;
    });

    const hourData = Object.keys(byHour).map(h=>({
      hour: parseInt(h),
      label: parseInt(h)>12?`${parseInt(h)-12}pm`:parseInt(h)===12?'12pm':parseInt(h)===0?'12am':`${h}am`,
      oepe:  byHour[h].oepe.length?byHour[h].oepe.reduce((a,b)=>a+b)/byHour[h].oepe.length:null,
      gc:    byHour[h].gc.length?byHour[h].gc.reduce((a,b)=>a+b)/byHour[h].gc.length:null,
      sales: byHour[h].sales.length?byHour[h].sales.reduce((a,b)=>a+b)/byHour[h].sales.length:null,
      n:     byHour[h].n,
    })).sort((a,b)=>a.hour-b.hour);

    // Daypart definitions
    const dayparts=[
      {id:'am',   l:'AM Peak',   range:[6,9],   icon:'🌅'},
      {id:'lunch',l:'Lunch',     range:[11,13],  icon:'☀️'},
      {id:'pm',   l:'PM Peak',   range:[17,19],  icon:'🌇'},
      {id:'eve',  l:'Evening',   range:[19,22],  icon:'🌙'},
    ];

    const dpData=dayparts.map(dp=>{
      const hrs=hourData.filter(h=>h.hour>=dp.range[0]&&h.hour<=dp.range[1]);
      const avgOepe=hrs.filter(h=>h.oepe).reduce((a,h)=>a+h.oepe,0)/Math.max(hrs.filter(h=>h.oepe).length,1);
      const avgGC=hrs.filter(h=>h.gc).reduce((a,h)=>a+h.gc,0)/Math.max(hrs.filter(h=>h.gc).length,1);
      const avgSales=hrs.filter(h=>h.sales).reduce((a,h)=>a+h.sales,0)/Math.max(hrs.filter(h=>h.sales).length,1);
      return{...dp,avgOepe:avgOepe||null,avgGC:avgGC||null,avgSales:avgSales||null};
    });

    // Find capacity constraint: hour where OEPE peaks relative to GC
    const peakGCHour=hourData.reduce((a,b)=>(b.gc||0)>(a.gc||0)?b:a,hourData[0]);
    const peakOepeHour=hourData.reduce((a,b)=>(b.oepe||0)>(a.oepe||0)?b:a,hourData[0]);

    return{hourData,dpData,peakGCHour,peakOepeHour,
      maxOepe:Math.max(...hourData.map(h=>h.oepe||0)),
      maxGC:Math.max(...hourData.map(h=>h.gc||0)),
      maxSales:Math.max(...hourData.map(h=>h.sales||0)),
    };
  },[ds.darRows,selLoc]);

  const oepeCol=v=>!v?'var(--text3)':v<120?'#10b981':v<150?'#f59e0b':v<180?'#f97316':'#ef4444';

  return div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.82)',zIndex:456,
    display:'flex',flexDirection:'column',paddingTop:20}},
    div({style:{flex:'0 0 20px',cursor:'pointer'},onClick:onClose}),
    div({style:{flex:1,background:'var(--surf)',maxWidth:1100,margin:'0 auto',width:'calc(100%-32px)',
      borderRadius:'var(--rl) var(--rl) 0 0',display:'flex',flexDirection:'column',overflow:'hidden',
      boxShadow:'0 -8px 40px rgba(0,0,0,.4)',width:'calc(100% - 32px)'}},
      div({style:{padding:'10px 16px',borderBottom:'.5px solid var(--bdr)',flexShrink:0,
        background:'var(--surf2)',display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}},
        span({style:{fontSize:'18px'}},'⏱'),
        div({style:{flex:1}},
          div({style:{fontSize:'13px',fontWeight:800,color:'var(--text)'}},'DAR Daypart Analytics'),
          div({style:{fontSize:'9px',color:'var(--text3)'}},'Hourly OEPE, GC, and Sales from Daily Activity Reports — peak identification, capacity analysis')
        ),
        h('select',{value:selLoc,onChange:e=>setSelLoc(e.target.value),
          style:{background:'var(--surf)',border:'.5px solid var(--bdr)',borderRadius:'var(--r)',
            color:'var(--text)',fontSize:'9px',padding:'3px 6px'}},
          LOCS.map(l=>h('option',{key:l,value:l},sNameC(l)))
        ),
        ...['heatmap','daypart','capacity'].map(v=>
          btn({key:v,className:'btn btn-sm',
            style:{fontSize:'8.5px',background:view===v?'var(--adim)':'transparent',
              color:view===v?'var(--amber)':'var(--text3)'},
            onClick:()=>setView(v)},
            v==='heatmap'?'Hour View':v==='daypart'?'Dayparts':'Capacity')
        ),
        btn({className:'btn btn-sm',style:{color:'var(--text3)'},onClick:onClose},'✕')
      ),
      !hasDAR?div({style:{flex:1,display:'flex',alignItems:'center',justifyContent:'center',
        flexDirection:'column',gap:10,color:'var(--text3)',padding:40}},
        div({style:{fontSize:36}},'⏱'),
        div({style:{fontSize:'13px',fontWeight:700,color:'var(--text)'}},'No DAR Data Loaded'),
        div({style:{fontSize:'10px',textAlign:'center',maxWidth:400,lineHeight:1.7}},'Load Daily Activity Report files (Daily_Activity_Report_YYYYMMDD.xlsx) to see hourly performance data. Multiple DARs can be loaded for trend analysis.')
      ):
      !data?div({style:{flex:1,color:'var(--text3)',textAlign:'center',padding:40,fontSize:'11px'}},'No DAR data for this store yet.'):
      div({style:{flex:1,overflowY:'auto',padding:'12px 16px'}},
        // Summary cards
        div({style:{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap'}},
          ...[
            {l:'Peak GC Hour',     v:data.peakGCHour?.label||'—', sub:'Highest guest volume'},
            {l:'Peak OEPE Hour',   v:data.peakOepeHour?.label||'—',sub:'Slowest service',warn:true},
            {l:'Max Hourly GC',    v:data.maxGC?Math.round(data.maxGC):'—',sub:'Guests in peak hour'},
            {l:'Peak OEPE',        v:data.maxOepe?Math.round(data.maxOepe)+'s':'—',sub:'Worst hour avg'},
            {l:'DAR Days Loaded',  v:(ds.darRows||[]).filter(r=>String(r.loc)===selLoc).length,sub:'Total hourly rows'},
          ].map((k,i)=>div({key:i,style:{background:'var(--surf2)',border:'.5px solid var(--bdr)',
            borderRadius:'var(--r)',padding:'8px 12px',flex:'1 1 100px',minWidth:90}},
            div({style:{fontSize:'7.5px',textTransform:'uppercase',letterSpacing:'.4px',color:'var(--text3)'}},(k.l)),
            div({style:{fontSize:'14px',fontWeight:800,fontFamily:'var(--mono)',
              color:k.warn?oepeCol(parseFloat(k.v)):' var(--amber)'}},(k.v)),
            div({style:{fontSize:'7.5px',color:'var(--text3)'}},(k.sub))
          ))
        ),
        // Hourly bar chart (OEPE)
        view==='heatmap'&&div(null,
          div({style:{fontSize:'9px',fontWeight:700,color:'var(--text3)',textTransform:'uppercase',marginBottom:6}},'Hourly OEPE by Hour of Day'),
          div({style:{display:'flex',gap:4,alignItems:'flex-end',height:120,overflowX:'auto'}},
            data.hourData.map((h,i)=>{
              const pct=data.maxOepe>0?(h.oepe||0)/data.maxOepe*100:0;
              return div({key:i,style:{display:'flex',flexDirection:'column',alignItems:'center',gap:2,flex:'0 0 36px'}},
                h.oepe&&span({style:{fontSize:'7px',color:oepeCol(h.oepe),fontFamily:'var(--mono)'}},Math.round(h.oepe)+'s'),
                div({style:{width:24,height:Math.max(4,pct)+'%',background:oepeCol(h.oepe||0),
                  borderRadius:'3px 3px 0 0',transition:'height .3s'}}),
                span({style:{fontSize:'7.5px',color:'var(--text3)',marginTop:2}},(h.label))
              );
            })
          ),
          div({style:{marginTop:16,fontSize:'9px',fontWeight:700,color:'var(--text3)',textTransform:'uppercase',marginBottom:6}},'Hourly Guest Count'),
          div({style:{display:'flex',gap:4,alignItems:'flex-end',height:80,overflowX:'auto'}},
            data.hourData.map((h,i)=>{
              const pct=data.maxGC>0?(h.gc||0)/data.maxGC*100:0;
              return div({key:i,style:{display:'flex',flexDirection:'column',alignItems:'center',gap:2,flex:'0 0 36px'}},
                h.gc&&span({style:{fontSize:'7px',color:'#34d399',fontFamily:'var(--mono)'}},Math.round(h.gc)),
                div({style:{width:24,height:Math.max(2,pct)+'%',background:'#34d399',
                  borderRadius:'3px 3px 0 0',opacity:.7}}),
                span({style:{fontSize:'7.5px',color:'var(--text3)'}},(h.label))
              );
            })
          )
        ),
        // Daypart view
        view==='daypart'&&div({style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}},
          data.dpData.map(dp=>div({key:dp.id,style:{background:'var(--surf2)',border:'.5px solid var(--bdr)',
            borderRadius:'var(--r)',padding:'14px 16px'}},
            div({style:{fontSize:'20px',marginBottom:6}},(dp.icon)),
            div({style:{fontSize:'12px',fontWeight:800,color:'var(--text)',marginBottom:8}},(dp.l)),
            ...[
              {l:'Avg OEPE',v:dp.avgOepe?Math.round(dp.avgOepe)+'s':'—',c:oepeCol(dp.avgOepe)},
              {l:'Avg GC/hr',v:dp.avgGC?Math.round(dp.avgGC):'—',c:'#34d399'},
              {l:'Avg Sales/hr',v:dp.avgSales?'$'+Math.round(dp.avgSales):'—',c:'var(--amber)'},
            ].map((k,i)=>div({key:i,style:{display:'flex',justifyContent:'space-between',
              padding:'4px 0',borderBottom:'.5px solid rgba(255,255,255,.06)',fontSize:'9px'}},
              span({style:{color:'var(--text3)'}},(k.l)),
              span({style:{fontFamily:'var(--mono)',fontWeight:700,color:k.c}},(k.v))
            ))
          ))
        ),
        // Capacity view
        view==='capacity'&&div(null,
          div({style:{marginBottom:12,padding:'10px 14px',background:'rgba(245,158,11,.07)',
            borderRadius:'var(--r)',border:'.5px solid rgba(245,158,11,.2)',fontSize:'9px',color:'var(--amber)',lineHeight:1.7}},
            span({style:{fontWeight:700}},'Capacity Analysis — '),
            `For ${sNameC(selLoc)}: `,
            data.peakGCHour&&`Peak GC hour is ${data.peakGCHour.label} (avg ${Math.round(data.peakGCHour.gc||0)} guests). `,
            data.peakOepeHour&&`Highest OEPE is ${data.peakOepeHour.label} (avg ${Math.round(data.peakOepeHour.oepe||0)}s). `,
            data.peakGCHour&&data.peakOepeHour&&data.peakGCHour.hour===data.peakOepeHour.hour
              ?'⚠ Peak GC and worst OEPE occur in the same hour — capacity constraint confirmed.'
              :'Peak OEPE and peak GC occur at different hours — demand pattern may not be capacity-limited.'
          ),
          h('table',{style:{width:'100%',borderCollapse:'collapse',fontSize:'9px'}},
            h('thead',null,h('tr',null,
              ...['Hour','OEPE','Guest Count','Sales/hr','Throughput','Notes']
               .map((l,i)=>h('th',{key:i,style:{padding:'5px 8px',fontSize:'8px',fontWeight:700,
                 textTransform:'uppercase',letterSpacing:'.4px',color:'var(--text3)',
                 borderBottom:'.5px solid var(--bdr)',textAlign:i>0?'right':'left'}},(l)))
            )),
            h('tbody',null,...data.hourData.map((hr,i)=>{
              const throughput=hr.oepe?Math.round(3600/(hr.oepe+35)):null;
              const isPeakGC=data.peakGCHour&&hr.hour===data.peakGCHour.hour;
              const isPeakOepe=data.peakOepeHour&&hr.hour===data.peakOepeHour.hour;
              return h('tr',{key:i,style:{
                background:isPeakGC?'rgba(52,211,153,.08)':isPeakOepe?'rgba(239,68,68,.06)':
                  i%2?'rgba(255,255,255,.015)':'transparent',
                borderBottom:'.5px solid rgba(255,255,255,.04)'}},
                td({style:{padding:'5px 8px',fontWeight:600,color:'var(--text2)'}},hr.label),
                td({style:{padding:'5px 8px',textAlign:'right',fontFamily:'var(--mono)',
                  color:oepeCol(hr.oepe||0),fontWeight:700}},hr.oepe?Math.round(hr.oepe)+'s':'—'),
                td({style:{padding:'5px 8px',textAlign:'right',fontFamily:'var(--mono)',
                  color:'#34d399'}},hr.gc?Math.round(hr.gc):'—'),
                td({style:{padding:'5px 8px',textAlign:'right',fontFamily:'var(--mono)',
                  color:'var(--amber)'}},hr.sales?'$'+Math.round(hr.sales):'—'),
                td({style:{padding:'5px 8px',textAlign:'right',fontFamily:'var(--mono)',
                  color:'var(--text3)'}},throughput?throughput+'/hr':'—'),
                td({style:{padding:'5px 8px',textAlign:'right',fontSize:'8px',color:'var(--text3)'}},
                  isPeakGC?'🏆 Peak GC':isPeakOepe?'⚠ Slowest':'')
              );
            }))
          )
        )
      )
    )
  );
}

// PRODUCT MIX DASHBOARD  (v186)
// Family group sales breakdown, discount exposure, mix shift analysis.
function ProductMixPanel({stores, ds, settings, onClose}) {
  const {useState:uSt, useMemo:uM} = React;
  const [sortBy,  setSortBy]  = uSt('units');

  const hasPMix = ds.pmixData && Object.keys(ds.pmixData).length > 0;

  const data = uM(()=>{
    if(!hasPMix) return null;
    // Aggregate across all loaded PMix files
    const combined = {};
    Object.values(ds.pmixData).forEach(pmx=>{
      Object.entries(pmx.byFamily||{}).forEach(([fam,stats])=>{
        if(!combined[fam]) combined[fam]={family:fam,units:0,disc:0,items:0};
        combined[fam].units += stats.units||0;
        combined[fam].disc  += stats.disc||0;
        combined[fam].items += stats.items||0;
      });
    });
    const families = Object.values(combined);
    const totalUnits = families.reduce((a,f)=>a+f.units,0);
    const totalDisc  = families.reduce((a,f)=>a+f.disc,0);
    return families.map(f=>({
      ...f,
      unitPct:  totalUnits>0?f.units/totalUnits:0,
      discRate: f.units>0?f.disc/f.units:0,
      discPct:  totalDisc>0?f.disc/totalDisc:0,
    })).sort((a,b)=>b.units-a.units);
  },[ds.pmixData]);

  const sorted = data ? [...data].sort((a,b)=>{
    if(sortBy==='units') return b.units-a.units;
    if(sortBy==='disc')  return b.discRate-a.discRate;
    if(sortBy==='pct')   return b.unitPct-a.unitPct;
    return 0;
  }) : [];

  const COLORS=['#f59e0b','#34d399','#60a5fa','#a78bfa','#f87171','#fb923c','#4ade80','#38bdf8'];
  const maxUnits = data?Math.max(...data.map(f=>f.units)):1;

  return div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.82)',zIndex:457,
    display:'flex',flexDirection:'column',paddingTop:20}},
    div({style:{flex:'0 0 20px',cursor:'pointer'},onClick:onClose}),
    div({style:{flex:1,background:'var(--surf)',maxWidth:1000,margin:'0 auto',
      width:'calc(100% - 32px)',borderRadius:'var(--rl) var(--rl) 0 0',
      display:'flex',flexDirection:'column',overflow:'hidden',boxShadow:'0 -8px 40px rgba(0,0,0,.4)'}},
      div({style:{padding:'10px 16px',borderBottom:'.5px solid var(--bdr)',flexShrink:0,
        background:'var(--surf2)',display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}},
        span({style:{fontSize:'18px'}},'🍔'),
        div({style:{flex:1}},
          div({style:{fontSize:'13px',fontWeight:800,color:'var(--text)'}},'Product Mix Dashboard'),
          div({style:{fontSize:'9px',color:'var(--text3)'}},'Family group unit sales, discount exposure, mix contribution — from loaded Product Mix reports')
        ),
        span({style:{fontSize:'8px',color:'var(--text3)'}},'Sort:'),
        ...['units','disc','pct'].map(s=>btn({key:s,className:'btn btn-sm',
          style:{fontSize:'8.5px',background:sortBy===s?'var(--adim)':'transparent',
            color:sortBy===s?'var(--amber)':'var(--text3)'},onClick:()=>setSortBy(s)},
          s==='units'?'Units':s==='disc'?'Disc Rate':'Mix %')),
        btn({className:'btn btn-sm',style:{color:'var(--text3)'},onClick:onClose},'✕')
      ),
      !hasPMix?div({style:{flex:1,display:'flex',alignItems:'center',justifyContent:'center',
        flexDirection:'column',gap:10,color:'var(--text3)',padding:40}},
        div({style:{fontSize:36}},'🍔'),
        div({style:{fontSize:'13px',fontWeight:700,color:'var(--text)'}},'No Product Mix Data Loaded'),
        div({style:{fontSize:'10px',textAlign:'center',maxWidth:380,lineHeight:1.7}},'Load Product Mix files (Product_Mix_YYYYMMDD_to_YYYYMMDD_[store].xlsx) to see menu analytics.')
      ):
      div({style:{flex:1,overflowY:'auto',padding:'12px 16px'}},
        // Summary strip
        data&&div({style:{display:'flex',gap:8,marginBottom:14,flexWrap:'wrap'}},
          ...[
            {l:'Family Groups',v:data.length},
            {l:'Total Units',  v:data.reduce((a,f)=>a+f.units,0).toLocaleString()},
            {l:'Disc Units',   v:data.reduce((a,f)=>a+f.disc,0).toLocaleString()},
            {l:'Overall Disc Rate',v:((data.reduce((a,f)=>a+f.disc,0)/Math.max(data.reduce((a,f)=>a+f.units,0),1))*100).toFixed(1)+'%'},
            {l:'Files Loaded', v:Object.keys(ds.pmixData||{}).length},
          ].map((k,i)=>div({key:i,style:{background:'var(--surf2)',border:'.5px solid var(--bdr)',
            borderRadius:'var(--r)',padding:'8px 12px',flex:'1 1 80px'}},
            div({style:{fontSize:'7.5px',textTransform:'uppercase',letterSpacing:'.4px',color:'var(--text3)'}},(k.l)),
            div({style:{fontSize:'13px',fontWeight:800,fontFamily:'var(--mono)',color:'var(--amber)'}},(k.v))
          ))
        ),
        // Main bar chart
        div({style:{marginBottom:16}},
          div({style:{fontSize:'9px',fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.4px',marginBottom:8}},'Unit Sales by Family Group'),
          sorted.map((f,i)=>{
            const pct=maxUnits>0?f.units/maxUnits*100:0;
            const col=COLORS[i%COLORS.length];
            return div({key:f.family,style:{marginBottom:8}},
              div({style:{display:'flex',justifyContent:'space-between',marginBottom:2,fontSize:'9px'}},
                span({style:{fontWeight:600,color:'var(--text)'}},(f.family)),
                div({style:{display:'flex',gap:12}},
                  span({style:{fontFamily:'var(--mono)',color:col,fontWeight:700}},f.units.toLocaleString()+' units'),
                  span({style:{color:'var(--text3)'}},(f.unitPct*100).toFixed(1)+'% mix'),
                  span({style:{color:(f.discRate>.1?'#f87171':'var(--text3)'),fontFamily:'var(--mono)'}},
                    (f.discRate*100).toFixed(1)+'% discounted')
                )
              ),
              div({style:{height:12,background:'rgba(255,255,255,.05)',borderRadius:4,overflow:'hidden'}},
                div({style:{height:'100%',width:pct+'%',background:col,borderRadius:4,
                  transition:'width .4s ease'}})
              )
            );
          })
        ),
        // Discount exposure analysis
        div({style:{padding:'12px 14px',background:'rgba(248,113,113,.06)',
          borderRadius:'var(--r)',border:'.5px solid rgba(248,113,113,.2)',fontSize:'8.5px',
          color:'var(--text3)',lineHeight:1.7}},
          span({style:{fontWeight:700,color:'var(--text)'}},'Discount Exposure: '),
          sorted.filter(f=>f.discRate>.10).length>0
            ?`${sorted.filter(f=>f.discRate>.10).length} family group(s) with >10% discount rate: `
              +sorted.filter(f=>f.discRate>.10).map(f=>f.family+' ('+((f.discRate*100).toFixed(0))+'%)').join(', ')
              +'. High discount rates may indicate promo over-reliance or operational comp-out issues.'
            :'No family groups exceed 10% discount rate. Discount exposure appears controlled.'
        )
      )
    )
  );
}

function ModelAssignmentPanel({stores, ds, settings, userEvents, onClose}) {
  const [filter,    setFilter]    = React.useState('all');
  const [search,    setSearch]    = React.useState('');
  const [tick,      setTick]      = React.useState(0);
  const [btRunning, setBtRunning] = React.useState(false);
  const [btProg,    setBtProg]    = React.useState(null);  // {storesDone,storesTotal,storeName,hz,model,status}
  const [btSummary, setBtSummary] = React.useState(null);  // result from runModelAssignmentBacktest
  const cancelRef = React.useRef(false);
  const refresh = () => setTick(t=>t+1);

  // ── Launch the backtest engine ──────────────────────────────────────────
  const runBacktest = async () => {
    if (!ds || !ds.laborRows || !ds.laborRows.length) {
      alert('Load an Operations Report first — no data to backtest.'); return;
    }
    if (!window.confirm(
      'Re-run Model Assignment Backtest for all 27 stores × 3 horizons?\n\n' +
      'This tests DOW, AE, EWMA, and DI (where calibrated) on live forecastDay data ' +
      'and writes the winners back as model assignments.\n\n' +
      'Manual overrides you\'ve set are preserved.\n' +
      'Runtime: ~30–90 seconds.'
    )) return;

    cancelRef.current = false;
    setBtRunning(true);
    setBtSummary(null);
    setBtProg({storesDone:0, storesTotal:Object.keys(STORE_NAMES).length, storeName:'Starting…', hz:'', model:'', status:''});

    try {
      const result = await runModelAssignmentBacktest(
        ds, settings, userEvents,
        (info) => {
          if (cancelRef.current) return;
          setBtProg({...info});
        }
      );
      if (!cancelRef.current) {
        setBtSummary(result);
        refresh(); // re-render table with updated assignments
      }
    } catch(e) {
      alert('Backtest error: ' + String(e));
    }
    setBtRunning(false);
    setBtProg(null);
  };

  const cancelBacktest = () => { cancelRef.current = true; setBtRunning(false); setBtProg(null); };

  const LOCS = Object.keys(STORE_NAMES).sort((a,b)=>STORE_NAMES[a].localeCompare(STORE_NAMES[b]));
  const HORIZONS = [
    {id:'weekly',l:'Weekly',icon:'📅',sub:'~10-day lock'},
    {id:'monthly',l:'Monthly',icon:'🗓',sub:'15th prior'},
    {id:'yearly', l:'Yearly', icon:'📆',sub:'~Dec 1'},
  ];
  const ML = {di:'🎯 DI',ly:'📅 LY',dow:'📊 DOW',ewma:'📈 EWMA',ae:'🤖 AE',addi:'🎯 DI+'};
  const mc = v=>v==null?'var(--text3)':v<6?'#10b981':v<8?'#34d399':v<10?'#f59e0b':v<14?'#f97316':'#ef4444';

  const ovr = React.useMemo(()=>{try{return JSON.parse(localStorage.getItem(MODEL_ASSIGNMENT_KEY)||'{}')}catch{return{}}},[tick]);

  const distro = React.useMemo(()=>{
    const c={weekly:{di:0,ly:0,dow:0},monthly:{di:0,ly:0,dow:0},yearly:{di:0,ly:0,dow:0}};
    LOCS.forEach(l=>HORIZONS.forEach(h=>{const m=getModelAssignment(l,h.id,settings).model||'dow';c[h.id][m]=(c[h.id][m]||0)+1;}));
    return c;
  },[tick,settings]);

  const visLocs = LOCS.filter(l=>{
    const def = DEFAULT_MODEL_ASSIGNMENTS[l]||{};
    if(search&&!STORE_NAMES[l].toLowerCase().includes(search.toLowerCase())&&!l.includes(search)) return false;
    if(filter==='override') return !!ovr[l];
    if(filter==='all') return true;
    return ['weekly','monthly','yearly'].some(h=>(getModelAssignment(l,h,settings).model||'dow')===filter);
  });

  const handleOvr = (loc,hz,m) => { saveModelOverride(loc,hz,m); refresh(); };
  const clearOvr  = (loc,hz) => {
    try{const o=JSON.parse(localStorage.getItem(MODEL_ASSIGNMENT_KEY)||'{}');
      if(o[loc]){delete o[loc][hz];if(!Object.keys(o[loc]).length)delete o[loc];}
      localStorage.setItem(MODEL_ASSIGNMENT_KEY,JSON.stringify(o));
      _masgnInvalidate();}catch{}
    refresh();
  };

  const thS={padding:'5px 8px',fontSize:'8px',fontWeight:700,textTransform:'uppercase',
    letterSpacing:'.4px',color:'var(--text3)',borderBottom:'.5px solid var(--bdr)',textAlign:'center'};

  return div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.82)',zIndex:460,
    display:'flex',flexDirection:'column',paddingTop:20}},
    div({style:{flex:'0 0 20px',cursor:'pointer'},onClick:onClose}),
    div({style:{flex:1,background:'var(--surf)',maxWidth:1080,margin:'0 auto',width:'calc(100% - 32px)',
      borderRadius:'var(--rl) var(--rl) 0 0',display:'flex',flexDirection:'column',overflow:'hidden',
      boxShadow:'0 -8px 40px rgba(0,0,0,.4)'}},
      div({style:{padding:'10px 16px',borderBottom:'.5px solid var(--bdr)',flexShrink:0,
        background:'var(--surf2)',display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}},
        span({style:{fontSize:'18px'}},'🎯'),
        div({style:{flex:1}},
          div({style:{fontSize:'13px',fontWeight:800,color:'var(--text)'}},'Model Assignments — Per Store Per Horizon'),
          div({style:{fontSize:'9px',color:'var(--text3)',marginTop:1}},
            btSummary
              ? `Last backtest: ${btSummary.runDate} — ${btSummary.changedCount} assignment${btSummary.changedCount!==1?'s':''} updated`
              : 'Walk-forward backtest: Labor Analysis 01/01/22–05/06/26 + DI calibration 05/27/26. ' +
                'Fixed v4.194: Projection Workspace now uses correct model per horizon.')
        ),
        btn({className:'btn btn-sm',
          style:{fontSize:'8px',
            background:btRunning?'rgba(248,113,113,.12)':'rgba(245,158,11,.10)',
            border:'.5px solid '+(btRunning?'rgba(248,113,113,.3)':'rgba(245,158,11,.3)'),
            color:btRunning?'#f87171':'var(--amber)',
            opacity:(!ds||!ds.laborRows||!ds.laborRows.length)?0.4:1,
            cursor:(!ds||!ds.laborRows||!ds.laborRows.length)?'not-allowed':'pointer'},
          onClick: btRunning ? cancelBacktest : runBacktest},
          btRunning ? '⏹ Cancel' : '🔄 Re-run Backtest'),
        btn({className:'btn btn-sm',style:{color:'var(--text3)'},onClick:onClose},'✕')
      ),
      // ── Backtest progress view (replaces table while running) ────────────
      btRunning && btProg && div({style:{flex:1,display:'flex',flexDirection:'column',
        alignItems:'center',justifyContent:'center',padding:'32px 24px',gap:16}},
        div({style:{fontSize:'14px',fontWeight:700,color:'var(--amber)'}},'🔄 Running Model Assignment Backtest…'),
        div({style:{width:'100%',maxWidth:480}},
          div({style:{display:'flex',justifyContent:'space-between',marginBottom:4,fontSize:'9px',color:'var(--text3)'}},
            span(null,`Store ${btProg.storesDone} of ${btProg.storesTotal}`),
            span(null,btProg.storesDone && btProg.storesTotal
              ? Math.round(btProg.storesDone/btProg.storesTotal*100)+'%' : '—')
          ),
          div({style:{height:6,background:'var(--surf)',borderRadius:99,overflow:'hidden'}},
            div({style:{height:'100%',width:(btProg.storesTotal
              ? Math.round(btProg.storesDone/btProg.storesTotal*100)+'%' : '0%'),
              background:'var(--amber)',borderRadius:99,transition:'width .3s'}})
          )
        ),
        div({style:{textAlign:'center',fontSize:'9.5px',color:'var(--text2)',lineHeight:1.7}},
          btProg.storeName && span({style:{fontWeight:700,color:'var(--text)'}},btProg.storeName),
          btProg.hz && btProg.hz !== 'done' && ' · '+btProg.hz.charAt(0).toUpperCase()+btProg.hz.slice(1),
          btProg.model && btProg.model !== '—' && span({style:{color:'var(--amber)'}},' · Testing '+btProg.model.toUpperCase())
        ),
        div({style:{fontSize:'8.5px',color:'var(--text3)',textAlign:'center',maxWidth:400,lineHeight:1.5}},
          'Calls forecastDay with forceModel for every store × horizon × model combination. ',
          'Results are written to localStorage when complete. Manual overrides are preserved.'
        ),
        btn({className:'btn btn-sm',
          style:{marginTop:8,background:'rgba(248,113,113,.1)',border:'.5px solid rgba(248,113,113,.3)',
            color:'#f87171',fontSize:'9px'},
          onClick:cancelBacktest},'⏹ Cancel')
      ),

      // ── Summary banner (shows after run, above table) ─────────────────
      !btRunning && btSummary && div({style:{
        padding:'8px 16px',borderBottom:'.5px solid var(--bdr)',flexShrink:0,
        background:'rgba(52,211,153,.06)',display:'flex',gap:12,alignItems:'center',flexWrap:'wrap'}},
        div({style:{flex:1}},
          div({style:{fontSize:'9.5px',fontWeight:700,color:'#34d399'}},
            '✅ Backtest complete — '+btSummary.runDate),
          div({style:{fontSize:'8.5px',color:'var(--text3)',marginTop:2}},
            btSummary.changedCount > 0
              ? btSummary.changedCount+' assignment'+(btSummary.changedCount!==1?'s':'')+' updated · '
              : 'No changes — all assignments confirmed · ',
            (Object.keys(STORE_NAMES).length * 3)+' total (store × horizon) evaluated'
          )
        ),
        btSummary.changes && btSummary.changes.length > 0 && div({style:{fontSize:'8px',color:'var(--text2)',maxWidth:340}},
          btSummary.changes.slice(0,4).map((c,i)=>
            div({key:i,style:{lineHeight:1.6}},
              span({style:{color:'var(--amber)',fontWeight:600}},(STORE_NAMES[c.loc]||c.loc).split(' ').slice(0,2).join(' ')),
              ' '+c.hz+': ',
              span({style:{color:'#f87171'}},c.from.toUpperCase()),
              ' → ',
              span({style:{color:'#34d399'}},c.to.toUpperCase()),
              c.mape!=null?' ('+c.mape+'% MAPE)':''
            )
          ),
          btSummary.changes.length > 4 && div({style:{color:'var(--text3)',fontStyle:'italic'}},
            '…+'+(btSummary.changes.length-4)+' more')
        ),
        btn({className:'btn btn-sm',style:{fontSize:'8px',color:'var(--text3)',flexShrink:0},
          onClick:()=>setBtSummary(null)},'✕ Dismiss')
      ),

      // ── Distribution + filters (hidden while backtest running) ─────────
      !btRunning && div({style:{padding:'6px 16px',borderBottom:'.5px solid var(--bdr)',flexShrink:0,
        background:'var(--surf2)',display:'flex',gap:12,flexWrap:'wrap',alignItems:'center'}},
        div({style:{display:'flex',gap:8}},
          ...HORIZONS.map(h=>div({key:h.id,style:{fontSize:'8.5px',color:'var(--text3)'}},
            h.icon+' '+h.l+': ',
            distro[h.id].ae  ? span({style:{color:'#34d399'}},(distro[h.id].ae||0)+' AE ') : null,
            distro[h.id].ewma? span({style:{color:'#c084fc'}},(distro[h.id].ewma||0)+' EWMA ') : null,
            distro[h.id].di  ? span({style:{color:'#f59e0b'}},(distro[h.id].di||0)+' DI ') : null,
            distro[h.id].ly  ? span({style:{color:'#60a5fa'}},(distro[h.id].ly||0)+' LY ') : null,
            (distro[h.id].dow||0) > 0 ? span({style:{color:'#a78bfa'}},(distro[h.id].dow||0)+' DOW') : null
          ))
        ),
        div({style:{marginLeft:'auto',display:'flex',gap:4,alignItems:'center'}},
          h('input',{type:'text',placeholder:'Search…',value:search,onChange:e=>setSearch(e.target.value),
            style:{background:'var(--surf)',border:'.5px solid var(--bdr)',borderRadius:'var(--r)',
              color:'var(--text)',fontSize:'9px',padding:'2px 6px',width:140}}),
          ...['all','ae','ewma','di','ly','dow','override'].map(f=>btn({key:f,className:'btn btn-sm',
            style:{fontSize:'8px',background:filter===f?'var(--adim)':'transparent',
              color:filter===f?'var(--amber)':'var(--text3)'},onClick:()=>setFilter(f)},
            f==='override'?'Overridden':f==='all'?'All':(ML[f]||f)))
        )
      ),
      !btRunning && div({style:{flex:1,overflowY:'auto'}},
        h('table',{style:{width:'100%',borderCollapse:'collapse',fontSize:'9px'}},
          h('thead',null,h('tr',{style:{position:'sticky',top:0,background:'var(--surf2)',zIndex:2}},
            h('th',{style:{...thS,textAlign:'left',paddingLeft:14,width:220}},'Store'),
            h('th',{style:{...thS,borderLeft:'.5px solid rgba(255,255,255,.07)'}},'📅 Weekly Lock\n~10 days out'),
            h('th',{style:{...thS,borderLeft:'.5px solid rgba(255,255,255,.07)'}},'🗓 Monthly Lock\n15th prior month'),
            h('th',{style:{...thS,borderLeft:'.5px solid rgba(255,255,255,.07)'}},'📆 Yearly Plan\n~Dec 1')
          )),
          h('tbody',null,
            !visLocs.length&&h('tr',null,h('td',{colSpan:4,style:{padding:'28px 14px',textAlign:'center',color:'var(--text3)',fontSize:'9px'}},
              filter==='ewma'
                ? '📈 No stores are currently assigned EWMA. The backtest tested EWMA for all stores but AE or DOW won everywhere. To manually assign EWMA to a store, select "All" filter, then click the EWMA button in any store\'s row.'
                : filter==='override'
                  ? 'No manual overrides set. Click the model buttons on any store row to override.'
                  : 'No stores match this filter.'
            )),
            ...visLocs.flatMap((loc,ri)=>{
            const def = DEFAULT_MODEL_ASSIGNMENTS[loc]||{};
            const isOvrAny = !!ovr[loc];
            return [
              h('tr',{key:loc,style:{borderTop:ri>0?'.5px solid rgba(255,255,255,.06)':'none'}},
                h('td',{style:{padding:'8px 8px 3px 14px',verticalAlign:'top'}},
                  div({style:{fontWeight:700,color:isOvrAny?'#f59e0b':'var(--amber)',fontSize:'9px'}},(STORE_NAMES[loc]||loc)+(isOvrAny?' ✎':'')),
                  def.note&&div({style:{fontSize:'7px',color:'var(--text3)',fontStyle:'italic',marginTop:2,lineHeight:1.4,maxWidth:200}},
                    def.note.slice(0,90)+(def.note.length>90?'…':''))
                ),
                ...HORIZONS.map(hz=>{
                  const asgn = getModelAssignment(loc,hz.id,settings);
                  const ovrEntry = ovr[loc] && ovr[loc][hz.id];
                  // Distinguish: manual override (no backtestDate) vs backtest result (has backtestDate)
                  const isManualOvr = !!(ovrEntry && !ovrEntry.backtestDate);
                  const isBtResult  = !!(ovrEntry &&  ovrEntry.backtestDate);
                  const m    = asgn.model||'dow';
                  // Model colors: AE=green, EWMA=purple, DI=amber, LY=blue, DOW=violet
                  const mCol = m==='ae'?'#34d399':m==='ewma'?'#c084fc':m==='di'?'#f59e0b':m==='ly'?'#60a5fa':'#a78bfa';
                  // Prefer ref from the live assignment (includes backtest ref), fall back to default
                  const ref  = asgn.ref || (def[hz.id] && def[hz.id].ref) || '';
                  return h('td',{key:hz.id,style:{padding:'8px 8px 3px',textAlign:'center',
                    borderLeft:'.5px solid rgba(255,255,255,.06)',verticalAlign:'top'}},
                    div({style:{display:'flex',alignItems:'center',justifyContent:'center',gap:4,marginBottom:3}},
                      span({style:{display:'inline-block',fontSize:'10px',fontWeight:800,
                        padding:'2px 10px',borderRadius:99,
                        background:mCol+'22',color:mCol,whiteSpace:'nowrap'}},
                        ML[m]),
                      isManualOvr && span({style:{fontSize:'7px',color:'#f59e0b',title:'Manual override'}},'✎'),
                      isBtResult  && span({style:{fontSize:'7px',color:'#34d399',title:'Auto-backtest result'}},'🔄')
                    ),
                    div({style:{fontSize:'7.5px',color:'var(--text3)',lineHeight:1.5,
                      marginBottom:3,maxWidth:160,margin:'0 auto'}},
                      (ref||'—').slice(0,54)+(ref.length>54?'…':'')),
                    div({style:{display:'flex',gap:3,justifyContent:'center',flexWrap:'wrap'}},
                      ...(['ae','ewma','di','ly','dow'].filter(opt=>opt!==m).map(opt=>
                        btn({key:opt,style:{fontSize:'7px',padding:'1px 5px',borderRadius:4,
                          background:'rgba(255,255,255,.05)',border:'.5px solid rgba(255,255,255,.1)',
                          color:'var(--text3)',cursor:'pointer'},onClick:()=>handleOvr(loc,hz.id,opt)},
                          opt.toUpperCase())
                      )),
                      isManualOvr&&btn({style:{fontSize:'7px',padding:'1px 5px',borderRadius:4,
                        background:'rgba(248,113,113,.1)',border:'.5px solid rgba(248,113,113,.3)',
                        color:'#f87171',cursor:'pointer'},onClick:()=>clearOvr(loc,hz.id)},'↺ reset')
                    )
                  );
                })
              )
            ];
          }))
        )
      ),
      !btRunning && div({style:{padding:'6px 16px',borderTop:'.5px solid var(--bdr)',flexShrink:0,
        fontSize:'7.5px',color:'var(--text3)',background:'var(--surf2)'}},
        '🎯 DI  · 📅 LY  · 📊 DOW  · 🤖 AE  · 📈 EWMA  · ',
        '🔄 = auto-backtest result  · ✎ = manual override  · ↺ reset restores backtest/default  · ',
        'Re-run Backtest updates all non-manual assignments with live forecastDay data · ',
        '"outlier days excluded" = worst ~5% of daily errors trimmed before averaging — a single bad-data day no longer skews the winner')
    )
  );
}

function StoreKBEditor({onClose}) {
  const [edits,   setEdits]   = React.useState(getKBEdits);
  const [selLoc,  setSelLoc]  = React.useState(Object.keys(STORE_NAMES).sort((a,b)=>STORE_NAMES[a].localeCompare(STORE_NAMES[b]))[0]);
  const [draft,   setDraft]   = React.useState(null);
  const [saved,   setSaved]   = React.useState(false);
  const [search,  setSearch]  = React.useState('');

  // Load draft from current KB (merged) when loc changes
  React.useEffect(()=>{
    const kb = {...(STORE_KB[selLoc]||{notes:'',tags:[]}), ...(edits[selLoc]||{})};
    setDraft({notes: kb.notes||'', tags: (kb.tags||[]).join(', ')});
    setSaved(false);
  },[selLoc]);

  const saveDraft = () => {
    const newEdits = {...edits, [selLoc]:{
      notes: draft.notes,
      tags:  draft.tags.split(',').map(t=>t.trim()).filter(Boolean),
    }};
    setEdits(newEdits);
    saveKBEdits(newEdits);
    setSaved(true);
    setTimeout(()=>setSaved(false),2000);
  };

  const resetLoc = () => {
    const newEdits = {...edits}; delete newEdits[selLoc];
    setEdits(newEdits); saveKBEdits(newEdits);
    const kb = STORE_KB[selLoc]||{notes:'',tags:[]};
    setDraft({notes:kb.notes||'',tags:(kb.tags||[]).join(', ')});
    setSaved(false);
  };

  const ALL_KB_LOCS = Object.keys(STORE_NAMES).sort((a,b)=>STORE_NAMES[a].localeCompare(STORE_NAMES[b]));
  const filteredLocs = ALL_KB_LOCS.filter(l=>{
    if(!search) return true;
    const q=search.toLowerCase();
    return l.includes(q)||(STORE_NAMES[l]||'').toLowerCase().includes(q)||
      (getKB(l).notes||'').toLowerCase().includes(q);
  });

  // Tag color helper
  const tagCol = t => t.includes('fl')?'#60a5fa':t.includes('well-run')||t.includes('excellent')?'#10b981':
    t.includes('watch')||t.includes('degrad')||t.includes('recalib')?'#f87171':
    t.includes('improving')?'#34d399':t.includes('tourist')||t.includes('interstate')?'#a78bfa':
    t.includes('new-location')||t.includes('insufficient')?'#f59e0b':'#64748b';

  return div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.82)',zIndex:460,display:'flex',
    alignItems:'flex-start',justifyContent:'center',padding:24}},
    div({style:{background:'var(--surf)',border:'.5px solid var(--bdr2)',borderRadius:'var(--rl)',
      width:'100%',maxWidth:900,maxHeight:'90vh',display:'flex',flexDirection:'column',
      boxShadow:'0 20px 60px rgba(0,0,0,.5)',overflow:'hidden'}},
      // Header
      div({style:{padding:'10px 16px',borderBottom:'.5px solid var(--bdr)',flexShrink:0,
        background:'var(--surf2)',display:'flex',alignItems:'center',gap:10}},
        span({style:{fontSize:'18px'}},'📍'),
        div({style:{flex:1}},
          div({style:{fontSize:'13px',fontWeight:800,color:'var(--text)'}},'Store Knowledge Base'),
          div({style:{fontSize:'9px',color:'var(--text3)',marginTop:1}},
            'Operational context per location. Used by Ops Analysis, Anomaly Scanner, Pre-Forecast Brief, and DI calibration warnings.')
        ),
        btn({className:'btn btn-sm',style:{color:'var(--text3)'},onClick:onClose},'✕')
      ),
      // Body: left list + right editor
      div({style:{display:'flex',flex:1,overflow:'hidden'}},
        // Left: store list
        div({style:{width:230,borderRight:'.5px solid var(--bdr)',display:'flex',flexDirection:'column',flexShrink:0}},
          div({style:{padding:'6px 8px',borderBottom:'.5px solid var(--bdr)'}},
            h('input',{type:'text',placeholder:'Search stores…',value:search,
              onChange:e=>setSearch(e.target.value),
              style:{width:'100%',background:'var(--surf)',border:'.5px solid var(--bdr)',
                borderRadius:'var(--r)',color:'var(--text)',fontSize:'9.5px',padding:'4px 7px'}})
          ),
          div({style:{flex:1,overflowY:'auto'}},
            filteredLocs.map(loc=>{
              const kb = {...(STORE_KB[loc]||{tags:[]}), ...(edits[loc]||{})};
              const isEdited = !!edits[loc];
              return div({key:loc,
                style:{padding:'6px 10px',cursor:'pointer',borderBottom:'.5px solid rgba(255,255,255,.04)',
                  background:selLoc===loc?'rgba(245,158,11,.1)':'transparent',
                  borderLeft:selLoc===loc?'2px solid var(--amber)':'2px solid transparent'},
                onClick:()=>setSelLoc(loc)},
                div({style:{display:'flex',alignItems:'center',gap:4}},
                  div({style:{fontSize:'8.5px',fontWeight:600,color:selLoc===loc?'var(--amber)':'var(--text2)',flex:1,lineHeight:1.3}},
                    STORE_NAMES[loc]||loc),
                  isEdited&&span({style:{fontSize:'7px',color:'#f59e0b'}},'✎')
                ),
                div({style:{display:'flex',gap:2,flexWrap:'wrap',marginTop:2}},
                  (kb.tags||[]).slice(0,3).map((t,i)=>
                    span({key:i,style:{fontSize:'6.5px',padding:'1px 4px',borderRadius:99,
                      background:'rgba(255,255,255,.07)',color:tagCol(t)}},t)
                  )
                )
              );
            })
          )
        ),
        // Right: editor
        div({style:{flex:1,overflowY:'auto',padding:'14px 16px',display:'flex',flexDirection:'column',gap:10}},
          !draft?null:React.createElement(React.Fragment,null,
            div({style:{display:'flex',alignItems:'center',gap:8,marginBottom:4}},
              div({style:{flex:1}},
                div({style:{fontSize:'13px',fontWeight:700,color:'var(--amber)'}},(STORE_NAMES[selLoc]||selLoc)),
                div({style:{fontSize:'8px',color:'var(--text3)'}},'Store #'+selLoc)
              ),
              edits[selLoc]&&btn({className:'btn btn-sm',style:{color:'#f87171',fontSize:'8.5px'},onClick:resetLoc},'↺ Reset to default'),
              saved&&span({style:{fontSize:'9px',color:'#10b981',fontWeight:700}},'✓ Saved!'),
              btn({className:'btn btn-sm btn-a',style:{fontWeight:700,padding:'4px 14px'},onClick:saveDraft},'💾 Save')
            ),
            // Quick Tags — pre-defined operational factors
            div(null,
              div({style:{fontSize:'8px',fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.4px',marginBottom:6}},
                'Operational Factors — click to toggle'),
              (()=>{
                const QUICK_TAGS=[
                  {group:'Performance',items:[
                    {tag:'well-run',label:'✓ Well-Run',col:'#10b981'},
                    {tag:'high-volume',label:'↑ High Volume',col:'#60a5fa'},
                    {tag:'improving',label:'↗ Improving',col:'#34d399'},
                    {tag:'model-degrading',label:'⚠ Model Degrading',col:'#f87171'},
                  ]},
                  {group:'Management',items:[
                    {tag:'gm-in-training',label:'🎓 GM in Training',col:'#f59e0b'},
                    {tag:'new-gm',label:'👤 New GM (<6mo)',col:'#f59e0b'},
                    {tag:'fl',label:'⭐ FL Store',col:'#60a5fa'},
                    {tag:'high-turnover',label:'🔄 High Turnover',col:'#f87171'},
                  ]},
                  {group:'Location',items:[
                    {tag:'tourist',label:'🏖 Tourist Area',col:'#a78bfa'},
                    {tag:'interstate',label:'🛣 Interstate',col:'#a78bfa'},
                    {tag:'seasonal',label:'❄ Seasonal Variance',col:'#a78bfa'},
                    {tag:'school-zone',label:'🏫 School Zone',col:'#a78bfa'},
                  ]},
                  {group:'Physical',items:[
                    {tag:'capacity-limited',label:'⚡ Capacity Limited',col:'#f59e0b'},
                    {tag:'single-lane',label:'🚗 Single DT Lane',col:'#f59e0b'},
                    {tag:'new-location',label:'🆕 New/Ramp-Up',col:'#f59e0b'},
                    {tag:'remodel',label:'🔨 Post-Remodel',col:'#f59e0b'},
                  ]},
                  {group:'Context',items:[
                    {tag:'loves-gas-station',label:'⛽ Gas Station',col:'#64748b'},
                    {tag:'historical-anomaly',label:'📈 Historical Anomaly',col:'#64748b'},
                    {tag:'di-skipped',label:'⏭ DI Skipped',col:'#64748b'},
                    {tag:'insufficient-data',label:'📊 Insuf. Data',col:'#64748b'},
                  ]},
                ];
                const activeTags=new Set(draft.tags.split(',').map(t=>t.trim()).filter(Boolean));
                const toggleTag=(tag)=>{
                  const next=new Set(activeTags);
                  if(next.has(tag)) next.delete(tag); else next.add(tag);
                  setDraft(d=>({...d,tags:[...next].join(', ')}));
                };
                return div(null,
                  QUICK_TAGS.map(grp=>div({key:grp.group,style:{marginBottom:6}},
                    div({style:{fontSize:'7px',textTransform:'uppercase',letterSpacing:'.5px',color:'var(--text3)',marginBottom:3}},grp.group),
                    div({style:{display:'flex',gap:4,flexWrap:'wrap'}},
                      grp.items.map(item=>{
                        const on=activeTags.has(item.tag);
                        return btn({key:item.tag,onClick:()=>toggleTag(item.tag),
                          style:{fontSize:'8px',padding:'3px 8px',borderRadius:99,cursor:'pointer',border:'none',
                            background:on?item.col+'30':'rgba(255,255,255,.06)',
                            color:on?item.col:'var(--text3)',
                            outline:on?'1px solid '+item.col+'80':'1px solid transparent',
                            transition:'all .15s'}},item.label);
                      })
                    )
                  ))
                );
              })()
            ),
            // Notes field
            div(null,
              div({style:{fontSize:'8px',fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.4px',marginBottom:4}},
                'Additional Context'),
              h('textarea',{value:draft.notes,rows:5,
                onChange:e=>setDraft(d=>({...d,notes:e.target.value})),
                placeholder:'Describe the location\'s specific situation, recent changes, management context, equipment issues, local competition, or any factors that explain unusual performance…',
                style:{width:'100%',background:'var(--surf)',border:'.5px solid var(--bdr)',
                  borderRadius:'var(--r)',color:'var(--text)',fontSize:'10px',
                  padding:'7px 10px',resize:'vertical',lineHeight:1.6,boxSizing:'border-box'}})
            ),
            // Custom tags (any tags not in quick list)
            (()=>{
              const activeTags=draft.tags.split(',').map(t=>t.trim()).filter(Boolean);
              const KNOWN_TAGS=new Set(['well-run','high-volume','improving','model-degrading','gm-in-training','new-gm','fl','high-turnover','tourist','interstate','seasonal','school-zone','capacity-limited','single-lane','new-location','remodel','loves-gas-station','historical-anomaly','di-skipped','insufficient-data']);
              const customTags=activeTags.filter(t=>!KNOWN_TAGS.has(t));
              return div(null,
                div({style:{fontSize:'8px',fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.4px',marginBottom:4}},'Custom Tags'),
                h('input',{type:'text',
                  value:customTags.join(', '),
                  onChange:e=>{
                    const quickTags=activeTags.filter(t=>KNOWN_TAGS.has(t));
                    const newCustom=e.target.value.split(',').map(t=>t.trim()).filter(Boolean);
                    setDraft(d=>({...d,tags:[...quickTags,...newCustom].join(', ')}));
                  },
                  placeholder:'Additional tags (comma-separated)…',
                  style:{width:'100%',background:'var(--surf)',border:'.5px solid var(--bdr)',
                    borderRadius:'var(--r)',color:'var(--text)',fontSize:'10px',
                    padding:'6px 10px',boxSizing:'border-box'}})
              );
            })(),
            // How this info is used
            div({style:{padding:'8px 10px',background:'rgba(255,255,255,.03)',
              borderRadius:'var(--r)',border:'.5px solid var(--bdr)',fontSize:'8.5px',color:'var(--text3)',lineHeight:1.7}},
              span({style:{fontWeight:700,color:'var(--text)'}},'How this is used: '),
              '📊 Ops Analysis — note shown on every anomaly. ',
              '🔍 Anomaly Scanner — seasonal/tourist tags raise thresholds. ',
              '🎯 DI Calibration — new-location prevents calibration warnings. ',
              '📋 Pre-Forecast Brief — management context informs AI commentary. ',
              '⭐ FL stores — highlighted in District View.'
            )
          )
        )
      )
    )
  );
}

function OperatorSummaryPanel({stores, ds, settings, onClose}) {
  const {useState:uSt, useMemo:uM} = React;
  const [selPeriod, setSelPeriod] = uSt('4wk');
  const [cStart,    setCStart]    = uSt('');
  const [cEnd,      setCEnd]      = uSt('');
  const [expanded,  setExpanded]  = uSt({});
  const [sortMet,   setSortMet]   = uSt('sales');
  const [groupBy,   setGroupBy]   = uSt('operator');
  const [focusGroup, setFocusGroup] = uSt('__all__'); // focus filter

  // Build loc→group maps from settings (fall back to INV_ORG_COORDS)
  const locToOp  = uM(()=>{
    const m={};
    const ops=(settings&&settings.operators)||{};
    for(const [name,locs] of Object.entries(ops)) for(const l of locs) m[String(l)]=name;
    // fallback for any loc not in settings
    for(const loc of Object.keys(INV_ORG_COORDS)) if(!m[loc]) m[loc]=INV_ORG_COORDS[loc]?.op||'Unknown';
    return m;
  },[settings]);
  const locToSup = uM(()=>{
    const m={};
    const sups=(settings&&settings.supervisorGroups)||{};
    for(const [name,locs] of Object.entries(sups)) for(const l of locs) m[String(l)]=name;
    for(const loc of Object.keys(INV_ORG_COORDS)) if(!m[loc]) m[loc]=INV_ORG_COORDS[loc]?.sup||'Unknown';
    return m;
  },[settings]);

  const GROUP_OPTS = [
    {id:'operator',   l:'Operator'},
    {id:'supervisor', l:'Supervisor'},
    {id:'market',     l:'Market'},
  ];
  const groupIcon = groupBy==='supervisor' ? '🧑‍💼' : groupBy==='market' ? '📍' : '👔';

  const today = new Date();
  const addDx = (d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x;};
  const PERIODS=[
    {id:'2wk', l:'2 Wk',    fn:()=>({s:sodOf(addDx(today,-13)),  e:today})},
    {id:'4wk', l:'4 Wk',    fn:()=>({s:sodOf(addDx(today,-27)),  e:today})},
    {id:'6wk', l:'6 Wk',    fn:()=>({s:sodOf(addDx(today,-41)),  e:today})},
    {id:'mtd', l:'MTD',     fn:()=>({s:new Date(today.getFullYear(),today.getMonth(),1),e:today})},
    {id:'lm',  l:'Last Mo', fn:()=>({s:new Date(today.getFullYear(),today.getMonth()-1,1),e:new Date(today.getFullYear(),today.getMonth(),0)})},
    {id:'3m',  l:'3 Mo',    fn:()=>({s:sodOf(addDx(today,-89)),  e:today})},
    {id:'6m',  l:'6 Mo',    fn:()=>({s:sodOf(addDx(today,-179)), e:today})},
    {id:'ytd', l:'YTD',     fn:()=>({s:new Date(today.getFullYear(),0,1),e:today})},
    {id:'custom',l:'Custom',fn:()=>({s:cStart?new Date(cStart+'T00:00:00'):null,e:cEnd?new Date(cEnd+'T00:00:00'):null})},
  ];
  const curP  = PERIODS.find(p=>p.id===selPeriod)||PERIODS[1];
  const range = uM(()=>{const r=curP.fn();return(r.s&&r.e&&!isNaN(r.s)&&!isNaN(r.e)&&r.s<=r.e)?r:null;},[selPeriod,cStart,cEnd]);
  const allLocs = uM(()=>(stores||[]).filter(s=>/^\d+$/.test(s.loc)).map(s=>s.loc),[stores]);

  const opGroups = uM(()=>{
    const groups={};
    for(const loc of allLocs){
      const c=INV_ORG_COORDS[loc]||{};
      const key = groupBy==='supervisor' ? (locToSup[loc]||c.sup||'Unknown')
                : groupBy==='market'     ? (c.state||'?')
                : (locToOp[loc]||c.op||'Unknown');
      if(!groups[key]) groups[key]={key,locs:[],state:new Set(),sups:new Set(),ops:new Set()};
      groups[key].locs.push(loc);
      groups[key].state.add(c.state||'?');
      groups[key].sups.add(locToSup[loc]||c.sup||'Unknown');
      groups[key].ops.add(locToOp[loc]||c.op||'Unknown');
    }
    return Object.values(groups).map(g=>({
      op:g.key, locs:g.locs,
      state:[...g.state].join('/'),
      sups:[...g.sups].join(', '),
      ops:[...g.ops].join(', '),
    }));
  },[allLocs, groupBy, locToOp, locToSup]);

  // All unique group names for focus dropdown
  const groupNames = uM(()=>['__all__',...opGroups.map(g=>g.op)],[opGroups]);

  const opStats = uM(()=>{
    if(!range||!ds) return [];
    const _avg =(rows,f)=>{const v=rows.map(r=>r[f]).filter(v=>v!=null&&!isNaN(v)&&v>0);return v.length?v.reduce((a,b)=>a+b,0)/v.length:null;};
    const _avgZ=(rows,f)=>{const v=rows.map(r=>r[f]).filter(v=>v!=null&&!isNaN(v));return v.length?v.reduce((a,b)=>a+b,0)/v.length:null;};
    const _sum =(rows,f)=>{const v=rows.map(r=>r[f]).filter(v=>v!=null&&!isNaN(v));return v.length?v.reduce((a,b)=>a+b,0):0;};
    const rangeDays=Math.max(1,Math.floor((range.e.getTime()-range.s.getTime())/86400000)+1);
    const lyS=addDx(range.s,-364), lyE=addDx(range.e,-364);

    return opGroups.map(g=>{
      const storeData=g.locs.map(loc=>{
        const tgt=(settings.targets&&settings.targets[loc])||DEFAULT_TARGETS[loc]||{};
        const lRows=(ds.laborRows||[]).filter(r=>r.date>=range.s&&r.date<=range.e&&r.sales>0&&String(r.loc)===loc);
        const cRows=(ds.ctrlRows||[]).filter(r=>r.date>=range.s&&r.date<=range.e&&String(r.loc)===loc);
        const oRows=(ds.opsRows||[]).filter(r=>r.date>=range.s&&r.date<=range.e&&String(r.loc)===loc);
        const fRows=(ds.fobRows||[]).filter(r=>r.date>=range.s&&r.date<=range.e&&String(r.loc)===loc);
        const lyRows=(ds.laborRows||[]).filter(r=>r.date>=lyS&&r.date<=lyE&&r.sales>0&&String(r.loc)===loc);
        const sales      = _sum(lRows,'sales');
        const lySales    = _sum(lyRows,'sales');
        const laborPct   = _avg(cRows,'laborPct')||_avg(lRows,'laborPct');
        const tpph       = _avg(cRows,'tpph')||_avg(lRows,'tpph');
        const oepe       = _avg(oRows,'oepe')||_avg(cRows,'oepe')||_avg(lRows,'oepe');
        const otHrs      = _avg(lRows,'otHrs')||(_avg(cRows,'otHrs')!=null?(_avg(cRows,'otHrs')/rangeDays):null);
        const cashOS     = _avgZ(cRows,'cashOSPct');
        const baseFoodPct= _avg(fRows,'baseFoodPct');
        const totFoodPct = _avg(fRows,'pLFoodPct');
        return{loc,tgt,sales,lySales,laborPct,tpph,oepe,otHrs,cashOS,baseFoodPct,totFoodPct,days:rangeDays,
          storeName:loc+' — '+(STORE_NAMES[loc]||loc)};
      });
      const totSales=storeData.reduce((a,s)=>a+s.sales,0);
      const totLY   =storeData.reduce((a,s)=>a+s.lySales,0);
      const vsLY    =totSales>0&&totLY>0?(totSales-totLY)/totLY:null;
      const wAvg=f=>{let tS=0,tV=0;for(const s of storeData){if(s[f]!=null&&s.sales>0){tS+=s.sales;tV+=s[f]*s.sales;}}return tS>0?tV/tS:null;};
      const simAvg=f=>{const v=storeData.map(s=>s[f]).filter(v=>v!=null);return v.length?v.reduce((a,b)=>a+b,0)/v.length:null;};
      return{op:g.op,state:g.state,sups:g.sups,storeCount:g.locs.length,
        totSales,totLY,vsLY,
        laborPct:wAvg('laborPct'),tpph:simAvg('tpph'),oepe:simAvg('oepe'),
        otHrs:simAvg('otHrs'),cashOS:simAvg('cashOS'),
        baseFoodPct:wAvg('baseFoodPct'),totFoodPct:wAvg('totFoodPct'),
        stores:storeData};
    }).filter(g=>g.stores.some(s=>s.sales>0));
  },[range,opGroups,ds,settings]);

  const SORT_OPTS=[
    {id:'sales', l:'Sales',   fn:(a,b)=>b.totSales-a.totSales},
    {id:'vly',   l:'vs LY',   fn:(a,b)=>(b.vsLY||0)-(a.vsLY||0)},
    {id:'labor', l:'Labor %', fn:(a,b)=>(a.laborPct||99)-(b.laborPct||99)},
    {id:'food',  l:'Food %',  fn:(a,b)=>(b.baseFoodPct||0)-(a.baseFoodPct||0)},
    {id:'tpph',  l:'TPPH',    fn:(a,b)=>(b.tpph||0)-(a.tpph||0)},
    {id:'oepe',  l:'OEPE',    fn:(a,b)=>(a.oepe||9999)-(b.oepe||9999)},
  ];
  const sortedOps=uM(()=>{
    let ops=[...opStats];
    if(focusGroup!=='__all__') ops=ops.filter(o=>o.op===focusGroup);
    return ops.sort((SORT_OPTS.find(s=>s.id===sortMet)||SORT_OPTS[0]).fn);
  },[opStats,sortMet,focusGroup]);

  const hasFOB = uM(()=>opStats.some(o=>o.baseFoodPct!=null),[opStats]);

  // Formatting helpers
  const fPO=(v,d=1)=>v!=null?(v*100).toFixed(d)+'%':'—';
  const fNO=(v,d=2)=>v!=null?v.toFixed(d):'—';
  const lbCol=(pct,tgt)=>{if(!pct||!tgt)return'var(--text2)';const d=Math.abs(pct-tgt)*100;return d<=.5?'#10b981':d<=1.5?'#f59e0b':'#ef4444';};
  const tpCol=(v,tgt)=>{if(!v||!tgt)return'var(--text2)';return v>=tgt?'#10b981':v>=tgt*.9?'#f59e0b':'#ef4444';};
  const fcCol=(v,tgt)=>{if(!v)return'var(--text2)';if(!tgt)return v<0.30?'#10b981':v<0.33?'#f59e0b':'#ef4444';return v<=tgt?'#10b981':v<=tgt+0.005?'#f59e0b':'#ef4444';};
  const thS={padding:'5px 8px',fontSize:'8px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.4px',color:'var(--text3)',borderBottom:'.5px solid var(--bdr)',whiteSpace:'nowrap'};

  if(!ds||!ds.loaded||opStats.length===0)
    return div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.85)',zIndex:450,display:'flex',alignItems:'center',justifyContent:'center'}},
      div({style:{textAlign:'center',color:'var(--text3)',padding:40}},
        div({style:{fontSize:40,marginBottom:12}},'📊'),
        div({style:{fontSize:'14px',fontWeight:700,color:'var(--text)',marginBottom:8}},'No Data Loaded'),
        div({style:{fontSize:'11px',marginBottom:16,lineHeight:1.6}},'Load an Operations Report or Labor Analysis.'),
        btn({className:'btn btn-sm',onClick:onClose},'Close')));

  return div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.82)',zIndex:450,display:'flex',flexDirection:'column',paddingTop:20}},
    div({style:{flex:'0 0 20px',cursor:'pointer'},onClick:onClose}),
    div({style:{flex:1,background:'var(--surf)',maxWidth:1300,margin:'0 auto',width:'calc(100% - 32px)',
      borderRadius:'var(--rl) var(--rl) 0 0',display:'flex',flexDirection:'column',overflow:'hidden',
      boxShadow:'0 -8px 40px rgba(0,0,0,.4)'}},

      // ── Header ────────────────────────────────────────────────────────────────
      div({style:{padding:'10px 16px',borderBottom:'.5px solid var(--bdr)',flexShrink:0,background:'var(--surf2)',
        display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}},
        div({style:{fontSize:'14px',fontWeight:800,color:'var(--text)'}},groupIcon+' District Summary'),
        div({style:{fontSize:'9px',color:'var(--text3)'}},'Sales, labor, food cost & service by '+GROUP_OPTS.find(g=>g.id===groupBy).l.toLowerCase()+' · Expand rows for store detail'),
        div({style:{marginLeft:'auto',display:'flex',gap:6,alignItems:'center'}},
          h(ExportDropdown,{
            title:'District Summary (by '+GROUP_OPTS.find(g=>g.id===groupBy).l+') — '+curP.l,
            filename:'district_summary_'+groupBy+'_'+selPeriod+'_'+new Date().toISOString().slice(0,10),
            rows:sortedOps.map(op=>({
              Group:         op.op,
              Market:        op.state,
              Stores:        op.storeCount,
              'Sales':       op.totSales>0?f$(op.totSales):'—',
              'LY Sales':    op.totLY>0?f$(op.totLY):'—',
              'vs LY':       op.vsLY!=null?((op.vsLY>=0?'+':'')+((op.vsLY*100).toFixed(1))+'%'):'—',
              'Labor %':     op.laborPct!=null?((op.laborPct*100).toFixed(1)+'%'):'—',
              'Base Food %': op.baseFoodPct!=null?((op.baseFoodPct*100).toFixed(1)+'%'):'—',
              'Total Food %':op.totFoodPct!=null?((op.totFoodPct*100).toFixed(1)+'%'):'—',
              'TPPH':        op.tpph!=null?op.tpph.toFixed(2):'—',
              'OEPE (s)':    op.oepe?Math.round(op.oepe)+'s':'—',
              'OT/Day':      op.otHrs!=null?op.otHrs.toFixed(1):'—',
            })),
            extraHTML:(()=>{
              const thS='border:1px solid #ddd;padding:4px 8px;font-size:9px;text-transform:uppercase;letter-spacing:.3px;font-weight:700;background:#f5f5f7';
              const tdS='border:1px solid #e0e0e0;padding:4px 8px;font-size:10px';
              const tdSr=tdS+';text-align:right;font-family:monospace';
              return '<style>.op-card{margin-bottom:24px;border:1px solid #ddd;border-radius:8px;overflow:hidden}'+
                '.op-hdr{background:#f5f5f7;padding:8px 12px;font-weight:700;font-size:12px;border-bottom:1px solid #ddd}'+
                '.op-meta{font-size:10px;color:#666;font-weight:normal;margin-left:8px}</style>'+
              sortedOps.map(op=>
                '<div class="op-card"><div class="op-hdr">'+groupIcon+' '+op.op+
                ' <span class="op-meta">'+op.state+' · '+op.storeCount+' stores · Sales: '+f$(op.totSales)+
                (op.vsLY!=null?' · vs LY: '+(op.vsLY>=0?'+':'')+((op.vsLY*100).toFixed(1))+'%':'')+'</span></div>'+
                '<table style="width:100%;border-collapse:collapse">'+
                '<thead><tr>'+['Store','Sales','LY Sales','vs LY','Labor%','Tgt','Base Food','Tot Food','TPPH','OEPE','OT/Day'].map((h,i)=>
                  '<th style="'+thS+(i===0?';text-align:left':'')+'">'+h+'</th>').join('')+'</tr></thead>'+
                '<tbody>'+op.stores.filter(s=>s.sales>0).map((s,i)=>{
                  const vsLY=s.sales>0&&s.lySales>0?((s.sales-s.lySales)/s.lySales):null;
                  return '<tr style="background:'+(i%2?'#fafafa':'#fff')+'">'+
                    '<td style="'+tdS+';font-weight:600">'+s.storeName+'</td>'+
                    '<td style="'+tdSr+'">'+( s.sales>0?f$(s.sales):'—')+'</td>'+
                    '<td style="'+tdSr+';color:#666">'+( s.lySales>0?f$(s.lySales):'—')+'</td>'+
                    '<td style="'+tdSr+';color:'+(vsLY!=null?(vsLY>=0?'#10b981':'#ef4444'):'#999')+'">'+( vsLY!=null?((vsLY>=0?'+':'')+((vsLY*100).toFixed(1))+'%'):'—')+'</td>'+
                    '<td style="'+tdSr+'">'+( s.laborPct!=null?((s.laborPct*100).toFixed(1)+'%'):'—')+'</td>'+
                    '<td style="'+tdSr+';color:#999">'+( s.tgt.tLabor?((s.tgt.tLabor*100).toFixed(1)+'%'):'—')+'</td>'+
                    '<td style="'+tdSr+'">'+( s.baseFoodPct!=null?((s.baseFoodPct*100).toFixed(1)+'%'):'—')+'</td>'+
                    '<td style="'+tdSr+'">'+( s.totFoodPct!=null?((s.totFoodPct*100).toFixed(1)+'%'):'—')+'</td>'+
                    '<td style="'+tdSr+'">'+( s.tpph!=null?s.tpph.toFixed(2):'—')+'</td>'+
                    '<td style="'+tdSr+'">'+( s.oepe?Math.round(s.oepe)+'s':'—')+'</td>'+
                    '<td style="'+tdSr+'">'+( s.otHrs!=null?s.otHrs.toFixed(1):'—')+'</td>'+
                  '</tr>';
                }).join('')+
                '</tbody></table></div>'
              ).join('');
            })(),
          }),
          btn({className:'btn btn-sm',style:{color:'var(--text3)'},onClick:onClose},'✕'))
      ),

      // ── Controls bar (period · group-by · focus · sort) ────────────────────
      div({style:{flexShrink:0,borderBottom:'.5px solid var(--bdr)',background:'var(--surf)'}},
        // Row 1: Period
        div({style:{display:'flex',gap:3,padding:'7px 16px 6px',flexWrap:'wrap',alignItems:'center',borderBottom:'.5px solid rgba(255,255,255,.04)'}},
          span({style:{fontSize:'8px',color:'var(--text3)',marginRight:4,textTransform:'uppercase',letterSpacing:'.3px',flexShrink:0}},'Period:'),
          ...PERIODS.map(p=>p.id!=='custom'?
            btn({key:p.id,style:{padding:'3px 9px',borderRadius:99,border:'.5px solid '+(selPeriod===p.id?'rgba(245,158,11,.4)':'var(--bdr)'),background:selPeriod===p.id?'var(--adim)':'transparent',color:selPeriod===p.id?'var(--amber)':'var(--text2)',fontSize:'9.5px',cursor:'pointer'},onClick:()=>setSelPeriod(p.id)},p.l):
            btn({key:'custom',style:{padding:'3px 9px',borderRadius:99,border:'.5px solid '+(selPeriod==='custom'?'rgba(245,158,11,.4)':'var(--bdr)'),background:selPeriod==='custom'?'var(--adim)':'transparent',color:selPeriod==='custom'?'var(--amber)':'var(--text2)',fontSize:'9.5px',cursor:'pointer'},onClick:()=>setSelPeriod('custom')},'Custom')
          ),
          selPeriod==='custom'&&React.createElement(React.Fragment,null,
            h('input',{type:'date',value:cStart,onChange:e=>setCStart(e.target.value),style:{marginLeft:6,background:'var(--surf2)',border:'.5px solid var(--bdr)',borderRadius:'var(--r)',color:'var(--text)',fontSize:'9.5px',padding:'2px 6px',colorScheme:'dark'}}),
            span({style:{fontSize:'9px',color:'var(--text3)',margin:'0 3px'}},'→'),
            h('input',{type:'date',value:cEnd,onChange:e=>setCEnd(e.target.value),style:{background:'var(--surf2)',border:'.5px solid var(--bdr)',borderRadius:'var(--r)',color:'var(--text)',fontSize:'9.5px',padding:'2px 6px',colorScheme:'dark'}})
          )
        ),
        // Row 2: Group by + Focus + Sort
        div({style:{display:'flex',gap:12,padding:'6px 16px 7px',flexWrap:'wrap',alignItems:'center'}},
          div({style:{display:'flex',gap:3,alignItems:'center'}},
            span({style:{fontSize:'8px',color:'var(--text3)',marginRight:4,textTransform:'uppercase',letterSpacing:'.3px',flexShrink:0}},'Group:'),
            ...GROUP_OPTS.map(g=>btn({key:g.id,
              style:{padding:'3px 9px',borderRadius:99,border:'.5px solid '+(groupBy===g.id?'rgba(96,165,250,.4)':'var(--bdr)'),
                background:groupBy===g.id?'rgba(96,165,250,.12)':'transparent',
                color:groupBy===g.id?'#60a5fa':'var(--text2)',fontSize:'9.5px',cursor:'pointer'},
              onClick:()=>{ setGroupBy(g.id); setFocusGroup('__all__'); setExpanded({}); }},g.l))
          ),
          div({style:{display:'flex',gap:3,alignItems:'center'}},
            span({style:{fontSize:'8px',color:'var(--text3)',marginRight:4,textTransform:'uppercase',letterSpacing:'.3px',flexShrink:0}},'Focus:'),
            h('select',{value:focusGroup,onChange:e=>setFocusGroup(e.target.value),
              style:{background:'var(--surf2)',border:'.5px solid var(--bdr)',borderRadius:'var(--r)',color:focusGroup==='__all__'?'var(--text2)':'var(--amber)',
                fontSize:'9.5px',padding:'3px 8px',cursor:'pointer',colorScheme:'dark',maxWidth:200}},
              h('option',{value:'__all__'},'All Groups'),
              ...opGroups.map(g=>h('option',{key:g.op,value:g.op},g.op))
            )
          ),
          div({style:{display:'flex',gap:3,alignItems:'center',marginLeft:'auto'}},
            span({style:{fontSize:'8px',color:'var(--text3)',marginRight:4,flexShrink:0}},'Sort:'),
            ...SORT_OPTS.filter(s=>s.id!=='food'||hasFOB).map(s=>btn({key:s.id,
              style:{padding:'3px 9px',borderRadius:'var(--r)',border:'.5px solid '+(sortMet===s.id?'rgba(245,158,11,.4)':'var(--bdr)'),background:sortMet===s.id?'var(--adim)':'transparent',color:sortMet===s.id?'var(--amber)':'var(--text2)',fontSize:'9.5px',cursor:'pointer'},
              onClick:()=>setSortMet(s.id)},s.l+(sortMet===s.id?' ↓':'')))
          )
        )
      ),

      // ── Group cards ────────────────────────────────────────────────────────
      div({style:{flex:1,overflowY:'auto',padding:'12px 16px 40px'}},
        sortedOps.length===0?div({style:{color:'var(--text3)',textAlign:'center',padding:40,fontSize:'11px'}},'No data for selected period.'):
        sortedOps.map((op)=>{
          const isExp=!!expanded[op.op];
          const distTgt=op.stores.length?{
            tLabor:op.stores.reduce((a,s)=>a+(s.tgt.tLabor||0),0)/op.stores.length,
            tTpph: op.stores.reduce((a,s)=>a+(s.tgt.tTpph||0),0)/op.stores.length,
            tOepe: op.stores.reduce((a,s)=>a+(s.tgt.tOepe||0),0)/op.stores.length,
          }:{};
          return div({key:op.op,style:{marginBottom:10,border:'.5px solid var(--bdr)',borderRadius:'var(--rl)',overflow:'hidden'}},
            // Summary bar
            div({style:{background:'var(--surf2)',padding:'10px 14px',cursor:'pointer',
              display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'},
              onClick:()=>setExpanded(p=>({...p,[op.op]:!p[op.op]}))},
              div({style:{minWidth:180,flexShrink:0}},
                div({style:{fontSize:'12px',fontWeight:800,color:'var(--text)'}},groupIcon+' '+op.op),
                div({style:{fontSize:'8.5px',color:'var(--text3)',marginTop:2}},
                  op.storeCount+' stores · '+op.state+
                  (groupBy==='operator'&&op.sups?' · '+op.sups:
                   groupBy==='supervisor'&&op.ops?' · '+op.ops:''))
              ),
              div({style:{display:'flex',gap:10,flex:1,flexWrap:'wrap',justifyContent:'flex-end',alignItems:'center'}},
                ...[
                  {l:'Sales',      v:op.totSales>0?f$(op.totSales):'—',                   col:'var(--text)'},
                  {l:'vs LY',      v:op.vsLY!=null?(op.vsLY>=0?'+':'')+fPO(op.vsLY):'—',  col:op.vsLY!=null?(op.vsLY>=0?'#10b981':'#ef4444'):'var(--text3)'},
                  {l:'LY Sales',   v:op.totLY>0?f$(op.totLY):'—',                         col:'var(--text3)'},
                  {l:'Labor %',    v:fPO(op.laborPct),                                      col:lbCol(op.laborPct,distTgt.tLabor)},
                  ...(hasFOB?[
                    {l:'Base Food', v:fPO(op.baseFoodPct),                                  col:fcCol(op.baseFoodPct,null)},
                    {l:'Tot Food',  v:fPO(op.totFoodPct),                                   col:fcCol(op.totFoodPct,null)},
                  ]:[]),
                  {l:'TPPH',       v:fNO(op.tpph),                                          col:tpCol(op.tpph,distTgt.tTpph)},
                  {l:'OEPE',       v:op.oepe?Math.round(op.oepe)+'s':'—',                   col:op.oepe&&distTgt.tOepe?(op.oepe<=distTgt.tOepe?'#10b981':'#f97316'):'var(--text2)'},
                  {l:'OT/Day',     v:op.otHrs!=null?fNO(op.otHrs,1):'—',                   col:op.otHrs!=null?(op.otHrs<=2?'#10b981':op.otHrs<=4?'#f59e0b':'#ef4444'):'var(--text2)'},
                ].map((k,i)=>div({key:i,style:{textAlign:'center',minWidth:55}},
                  div({style:{fontSize:'7px',textTransform:'uppercase',letterSpacing:'.4px',color:'var(--text3)',marginBottom:1}},k.l),
                  div({style:{fontSize:'12px',fontFamily:'var(--mono)',fontWeight:700,color:k.col}},k.v)
                ))
              ),
              span({style:{fontSize:'12px',color:'var(--text3)',flexShrink:0}},isExp?'▲':'▼')
            ),
            // Store detail table (expanded)
            isExp&&div({style:{overflowX:'auto'}},
              h('table',{style:{width:'100%',borderCollapse:'collapse',fontSize:'9px',minWidth:hasFOB?900:760}},
                h('thead',null,h('tr',null,
                  ...[['Store','left'],['Sales','right'],['LY Sales','right'],['vs LY','right'],
                    ['Labor%','right'],['Tgt','right'],
                    ...(hasFOB?[['Base Food','right'],['Tot Food','right']]:[]),
                    ['TPPH','right'],['OEPE','right'],['OT/Day','right'],['Days','right']]
                  .map((c,i)=>th({key:i,style:{...thS,textAlign:c[1],paddingLeft:i===0?14:8}},c[0]))
                )),
                h('tbody',null,...op.stores.filter(s=>s.sales>0).map((s,i)=>{
                  const vsLY=s.sales>0&&s.lySales>0?(s.sales-s.lySales)/s.lySales:null;
                  return tr({key:s.loc,style:{borderBottom:'.5px solid rgba(255,255,255,.04)',background:i%2?'rgba(255,255,255,.015)':'transparent'}},
                    td({style:{padding:'4px 8px 4px 14px',fontWeight:600,color:'var(--amber)',whiteSpace:'nowrap',fontSize:'8.5px'}},s.storeName),
                    td({style:{padding:'4px 8px',textAlign:'right',fontFamily:'var(--mono)',fontWeight:700,color:'var(--text2)'}},s.sales>0?f$(s.sales):'—'),
                    td({style:{padding:'4px 8px',textAlign:'right',fontFamily:'var(--mono)',color:'var(--text3)',fontSize:'8.5px'}},s.lySales>0?f$(s.lySales):'—'),
                    td({style:{padding:'4px 8px',textAlign:'right',fontFamily:'var(--mono)',color:vsLY!=null?(vsLY>=0?'#10b981':'#ef4444'):'var(--text3)',fontSize:'8.5px',fontWeight:700}},vsLY!=null?(vsLY>=0?'+':'')+fPO(vsLY):'—'),
                    td({style:{padding:'4px 8px',textAlign:'right',fontFamily:'var(--mono)',fontWeight:700,color:lbCol(s.laborPct,s.tgt.tLabor)}},fPO(s.laborPct)),
                    td({style:{padding:'4px 8px',textAlign:'right',fontFamily:'var(--mono)',color:'var(--text3)',fontSize:'8.5px'}},s.tgt.tLabor?fPO(s.tgt.tLabor):'—'),
                    ...(hasFOB?[
                      td({style:{padding:'4px 8px',textAlign:'right',fontFamily:'var(--mono)',color:fcCol(s.baseFoodPct,null)}},fPO(s.baseFoodPct)),
                      td({style:{padding:'4px 8px',textAlign:'right',fontFamily:'var(--mono)',color:fcCol(s.totFoodPct,null)}},fPO(s.totFoodPct)),
                    ]:[]),
                    td({style:{padding:'4px 8px',textAlign:'right',fontFamily:'var(--mono)',color:tpCol(s.tpph,s.tgt.tTpph)}},fNO(s.tpph)),
                    td({style:{padding:'4px 8px',textAlign:'right',fontFamily:'var(--mono)',color:s.oepe&&s.tgt.tOepe?(s.oepe<=s.tgt.tOepe?'#10b981':'#f97316'):'var(--text2)'}},s.oepe?Math.round(s.oepe)+'s':'—'),
                    td({style:{padding:'4px 8px',textAlign:'right',fontFamily:'var(--mono)',color:s.otHrs!=null?(s.otHrs<=2?'#10b981':s.otHrs<=4?'#f59e0b':'#ef4444'):'var(--text2)'}},s.otHrs!=null?fNO(s.otHrs,1):'—'),
                    td({style:{padding:'4px 8px',textAlign:'right',color:'var(--text3)'}},s.days)
                  );
                }))
              )
            )
          );
        })
      )
    )
  );
}

// ── end OperatorSummaryPanel ─────────────────────────────────────────────────

function LaborAnalyticsPanel({stores, ds, settings, onClose}) {
  const {useState:uSt,useMemo:uM} = React;
  const allLocs = uM(()=>(stores||[]).filter(s=>/^\d+$/.test(s.loc)).map(s=>s.loc),[stores]);
  const okLocs  = uM(()=>allLocs.filter(l=>(INV_ORG_COORDS[l]||{}).state==='OK'),[allLocs]);
  const flLocs  = uM(()=>allLocs.filter(l=>(INV_ORG_COORDS[l]||{}).state==='FL'),[allLocs]);

  const [selPeriod,setSelPeriod] = uSt('4wk');
  const [cStart,   setCStart]    = uSt('');
  const [cEnd,     setCEnd]      = uSt('');
  const [selLoc,   setSelLoc]    = uSt('all');
  const [tab,      setTab]       = uSt('overview');
  const [sortMet,  setSortMet]   = uSt('laborPct');
  const [sortDir,  setSortDir]   = uSt(1);

  const today = new Date();
  const addDx = (d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x;};

  const PERIODS = [
    // sodOf() normalizes start to midnight local time so the start day's rows
    // (stored at noon UTC) are never excluded by a time-of-day mismatch.
    // Offset is (n-1) so that n calendar days are always returned:
    //   sodOf(addDx(today,-13)) = midnight 13 days ago → today = 14 days ✓
    {id:'2wk',  l:'2 Wk',   fn:()=>({s:sodOf(addDx(today,-13)),  e:today})},
    {id:'4wk',  l:'4 Wk',   fn:()=>({s:sodOf(addDx(today,-27)),  e:today})},
    {id:'6wk',  l:'6 Wk',   fn:()=>({s:sodOf(addDx(today,-41)),  e:today})},
    {id:'mtd',  l:'MTD',    fn:()=>({s:new Date(today.getFullYear(),today.getMonth(),1), e:today})},
    {id:'lm',   l:'Last Mo',fn:()=>({s:new Date(today.getFullYear(),today.getMonth()-1,1), e:new Date(today.getFullYear(),today.getMonth(),0)})},
    {id:'3m',   l:'3 Mo',   fn:()=>({s:sodOf(addDx(today,-89)),  e:today})},
    {id:'6m',   l:'6 Mo',   fn:()=>({s:sodOf(addDx(today,-179)), e:today})},
    {id:'ytd',  l:'YTD',    fn:()=>({s:new Date(today.getFullYear(),0,1), e:today})},
    {id:'ly',   l:'Last Yr',fn:()=>({s:new Date(today.getFullYear()-1,0,1), e:new Date(today.getFullYear()-1,11,31)})},
    {id:'custom',l:'Custom',fn:()=>({s:cStart?new Date(cStart+'T00:00:00'):null, e:cEnd?new Date(cEnd+'T00:00:00'):null})},
  ];
  const curP  = PERIODS.find(p=>p.id===selPeriod)||PERIODS[1];
  const range = uM(()=>{const r=curP.fn();return(r.s&&r.e&&!isNaN(r.s)&&!isNaN(r.e)&&r.s<=r.e)?r:null;},[selPeriod,cStart,cEnd]);

  const activeLocs = uM(()=>{
    if(selLoc==='all') return allLocs;
    if(selLoc==='ok')  return okLocs;
    if(selLoc==='fl')  return flLocs;
    return allLocs.includes(selLoc)?[selLoc]:[];
  },[selLoc,allLocs,okLocs,flLocs]);

  // ── Per-location stats ──
  const locStats = uM(()=>{
    if(!range||!ds) return [];
    // v>0 avg: treats 0 as "field not parsed" — matches avg6() behavior for rate metrics
    const _avg =(rows,f)=>{const v=rows.map(r=>r[f]).filter(v=>v!=null&&!isNaN(v)&&v>0);return v.length?v.reduce((a,b)=>a+b,0)/v.length:null;};
    // Any-value avg: 0 and negatives valid (otHrs=0 means no OT; actVsNeed can be negative)
    const _avgZ=(rows,f)=>{const v=rows.map(r=>r[f]).filter(v=>v!=null&&!isNaN(v));return v.length?v.reduce((a,b)=>a+b,0)/v.length:null;};
    const _sum =(rows,f)=>{const v=rows.map(r=>r[f]).filter(v=>v!=null&&!isNaN(v));return v.length?v.reduce((a,b)=>a+b,0):0;};
    return activeLocs.map(loc=>{
      const tgt=(settings.targets&&settings.targets[loc])||DEFAULT_TARGETS[loc]||{};
      // lRows: daily labor rows — correct source for day count and sales totals
      const lRows=(ds.laborRows||[]).filter(r=>r.date>=range.s&&r.date<=range.e&&r.sales>0&&String(r.loc)===loc);
      // cRows: ctrlRows from Operations Report Controls sheet OR Shift Mgr Summary.
      // CRITICAL: parseCtrlData (Operations Report) pushes NO sales field, so r.sales>0
      // is always false for those rows. Remove sales filter here — gate by date+loc only.
      const cRows=(ds.ctrlRows||[]).filter(r=>r.date>=range.s&&r.date<=range.e&&String(r.loc)===loc);
      if(!lRows.length&&!cRows.length) return null;
      // ── Period length from date range (calendar days the user selected) ──────
      // Using rangeDays for "days" ensures "2 Wk" always shows 14, "4 Wk" shows 28, etc.
      // regardless of how many rows happen to be in the loaded data files.
      const rangeDays = Math.max(1, Math.floor((range.e.getTime()-range.s.getTime())/86400000)+1);
      // Day count for display = calendar days in range
      const days       = rangeDays;
      const totalSales = _sum(lRows,'sales');
      // Period-summary detection: significantly fewer ctrl rows than calendar days.
      // Operations Report produces 1 aggregate row per store for the entire period.
      // Robust detection that works even when lRows is empty (no daily Labor Analysis loaded).
      const cIsSummary = cRows.length>0 && cRows.length < Math.max(3,Math.floor(rangeDays/4)) && rangeDays>3;
      // Always use calendar days for per-day normalization
      const normDays   = rangeDays;
      // ── Rate/percentage metrics ─────────────────────────────────────────────
      // Period-average rates from Operations Report are correct as-is.
      // Fallback chain: ctrlRows → laborRows
      const laborPct  = _avg(cRows,'laborPct')  || _avg(lRows,'laborPct');
      const tpph      = _avg(cRows,'tpph')      || _avg(lRows,'tpph');
      const avgRate   = _avg(cRows,'avgRate')   || _avg(lRows,'avgRate');
      const actVsNeed = _avgZ(cRows.length?cRows:lRows,'actVsNeed');
      // ── Volume metrics (hours) ──────────────────────────────────────────────
      // Daily lRows already gives true per-day average.
      // Period-summary cRows gives period TOTAL → must divide by normDays.
      // Also divide when lRows is sparse (< 3 days) since they don't represent a real daily avg.
      const _perDay=(cSrc,lSrc,f)=>{
        const daily=_avgZ(lSrc,f);
        if(daily!=null&&lSrc.length>=3) return daily; // only trust daily if we have ≥3 data points
        // _avg (v>0) for cRows: parseCtrlData defaults missing cols to 0 via ||0.
        // _avgZ would return 0.0; _avg returns null → shows — for unparsed columns.
        // Daily lRows use _avgZ so genuine "no OT today = 0" is preserved.
        const tot=_avg(cSrc,f);
        if(tot==null) return (daily!=null?daily:null);
        return (cIsSummary||lSrc.length<3) ? tot/normDays : tot;
      };
      const otHrs     = _perDay(cRows,lRows,'otHrs');
      const actHrs    = _perDay(cRows,lRows,'actHrs');
      const crewHrs   = _avg(lRows,'crewHrs')      || (cIsSummary?null:_avg(cRows,'crewHrs'));
      const salMgrHrs = _avg(lRows,'salaryMgrHrs') || (cIsSummary?null:_avg(cRows,'salaryMgrHrs'));
      // OT cost: prefer parsed dollar amount; fall back to estimated OT premium
      const otDolRaw  = _sum(cRows.length?cRows:lRows,'otDollar');
      const otCostEst = (otHrs||0)>0&&(avgRate||0)>0 ? Math.round((otHrs||0)*0.5*(avgRate||0)*normDays) : 0;
      const otCost    = otDolRaw>1 ? otDolRaw : otCostEst;
      const otCostEd  = otDolRaw<=1 && otCostEst>0;
      return{loc,days,laborPct,tpph,otHrs,avgRate,actVsNeed,actHrs,crewHrs,salMgrHrs,
        otCost,otCostEd,totalSales,tgt,
        storeName:loc+' — '+(STORE_NAMES[loc]||loc)};
    }).filter(Boolean);
  },[range,activeLocs,ds,settings]);

  // ── District weighted aggregates ──
  const dist = uM(()=>{
    if(!locStats.length) return null;
    const wA=f=>{let tS=0,tV=0,n=0;locStats.forEach(s=>{if(s[f]!=null&&s.totalSales>0){tS+=s.totalSales;tV+=s[f]*s.totalSales;n++;}});return n&&tS>0?tV/tS:null;};
    const sA=f=>{const v=locStats.map(s=>s[f]).filter(v=>v!=null);return v.length?v.reduce((a,b)=>a+b,0)/v.length:null;};
    return{laborPct:wA('laborPct'),tpph:sA('tpph'),otHrs:sA('otHrs'),avgRate:sA('avgRate'),actVsNeed:sA('actVsNeed'),
      otCost:locStats.reduce((a,s)=>a+(s.otCost||0),0),
      otCostEd:locStats.some(s=>s.otCostEd),
      totalSales:locStats.reduce((a,s)=>a+(s.totalSales||0),0),
      storeCount:locStats.length};
  },[locStats]);

  // ── District avg targets ──
  const distTgt = uM(()=>{
    if(!activeLocs.length) return{tLabor:0,tTpph:0};
    const tL=activeLocs.map(l=>{const t=(settings.targets&&settings.targets[l])||DEFAULT_TARGETS[l]||{};return t.tLabor||0;}).filter(v=>v>0);
    const tT=activeLocs.map(l=>{const t=(settings.targets&&settings.targets[l])||DEFAULT_TARGETS[l]||{};return t.tTpph||0;}).filter(v=>v>0);
    return{tLabor:tL.length?tL.reduce((a,b)=>a+b,0)/tL.length:0, tTpph:tT.length?tT.reduce((a,b)=>a+b,0)/tT.length:0};
  },[activeLocs,settings]);

  // ── DOW breakdown ──
  const DOW_N=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const dowStats = uM(()=>{
    if(!range||!ds) return [];
    // DOW breakdown uses daily lRows only — period-summary ctrlRows have a single
    // date and add no day-of-week signal. lRows requires sales>0 to filter bad rows.
    const all=(ds.laborRows||[]).filter(r=>r.date>=range.s&&r.date<=range.e&&r.sales>0&&activeLocs.includes(String(r.loc)));
    return DOW_N.map((name,dow)=>{
      const rows=all.filter(r=>new Date(r.date).getDay()===dow);
      const avg=f=>{const v=rows.map(r=>r[f]).filter(v=>v!=null&&!isNaN(v)&&v>0);return v.length?v.reduce((a,b)=>a+b,0)/v.length:null;};
      const avgZ=f=>{const v=rows.map(r=>r[f]).filter(v=>v!=null&&!isNaN(v));return v.length?v.reduce((a,b)=>a+b,0)/v.length:null;};
      return{name,dow,count:rows.length,laborPct:avg('laborPct'),tpph:avg('tpph'),otHrs:avgZ('otHrs'),actVsNeed:avgZ('actVsNeed')};
    });
  },[range,activeLocs,ds]);

  // ── 6-week rolling trend (weekly buckets) ──
  const trendData = uM(()=>{
    if(!ds) return [];
    const weeks=[];
    for(let w=5;w>=0;w--){
      const wEnd=addDx(today,-w*7), wStart=addDx(wEnd,-7);
      // 6-week trend uses daily lRows only — ctrlRows period summaries skew weekly buckets
      const rows=(ds.laborRows||[]).filter(r=>r.date>=wStart&&r.date<wEnd&&r.sales>0&&activeLocs.includes(String(r.loc)));
      const avg=f=>{const v=rows.map(r=>r[f]).filter(v=>v!=null&&!isNaN(v)&&v>0);return v.length?v.reduce((a,b)=>a+b,0)/v.length:null;};
      const avgZ=f=>{const v=rows.map(r=>r[f]).filter(v=>v!=null&&!isNaN(v));return v.length?v.reduce((a,b)=>a+b,0)/v.length:null;};
      weeks.push({label:wEnd.toLocaleDateString('en-US',{month:'short',day:'numeric'}),laborPct:avg('laborPct'),tpph:avg('tpph'),otHrs:avgZ('otHrs'),actVsNeed:avgZ('actVsNeed')});
    }
    return weeks;
  },[activeLocs,ds]);

  // ── Formatters ──
  const pFmtL = (v,d=1)=>v!=null?(v*100).toFixed(d)+'%':'—';
  const nFmtL = (v,d=2)=>v!=null?v.toFixed(d):'—';
  const avnFmt= v=>v!=null?((v>0?'+':'')+v.toFixed(0)+' hrs'):'—';

  // ── Color helpers ──
  const lbCol=(pct,tgt)=>{if(pct==null||!tgt)return'var(--text2)';const d=Math.abs(pct-tgt)*100;return d<=(settings.laborGreenPct||0.5)?'#10b981':d<=(settings.laborYellowPct||1.5)?'#f59e0b':'#ef4444';};
  const tpCol=(v,tgt)=>{if(!v||!tgt)return'var(--text2)';return v>=tgt?'#10b981':v>=tgt*.9?'#f59e0b':'#ef4444';};
  const otCol=v=>{if(v==null)return'var(--text2)';return v<=2?'#10b981':v<=4?'#f59e0b':'#ef4444';};
  const avCol=v=>{if(v==null)return'var(--text2)';return Math.abs(v)<=30?'#10b981':Math.abs(v)<=60?'#f59e0b':'#ef4444';};

  // ── Rank metric definitions ──
  const RANK_MET=[
    {id:'laborPct', l:'Labor %',     lB:true,  fmt:s=>pFmtL(s.laborPct),          col:s=>lbCol(s.laborPct,s.tgt.tLabor)},
    {id:'tpph',     l:'TPPH',        lB:false, fmt:s=>nFmtL(s.tpph),              col:s=>tpCol(s.tpph,s.tgt.tTpph)},
    {id:'otHrs',    l:'OT Hrs/Day',  lB:true,  fmt:s=>nFmtL(s.otHrs,1),           col:s=>otCol(s.otHrs)},
    {id:'actVsNeed',l:'Act vs Need', lB:null,  fmt:s=>avnFmt(s.actVsNeed),         col:s=>avCol(s.actVsNeed)},
    {id:'avgRate',  l:'AROP',        lB:null,  fmt:s=>s.avgRate?'$'+nFmtL(s.avgRate,2):'—', col:()=>'var(--text2)'},
    {id:'actHrs',   l:'Act Hrs/Day', lB:null,  fmt:s=>nFmtL(s.actHrs,1),          col:()=>'var(--text2)'},
    {id:'otCost',   l:'OT Cost',     lB:true,  fmt:s=>s.otCost>0?(s.otCostEd?'~':'')+f$(s.otCost):'—', col:s=>s.otCost>500?'#ef4444':s.otCost>100?'#f59e0b':'#10b981'},
  ];
  const curMet=RANK_MET.find(m=>m.id===sortMet)||RANK_MET[0];
  const rankSorted=uM(()=>[...locStats].sort((a,b)=>{
    const va=a[sortMet],vb=b[sortMet];
    if(va==null&&vb==null)return 0;if(va==null)return 1;if(vb==null)return-1;
    const nat=curMet.lB===false?-1:1;
    return(va-vb)*nat*sortDir;
  }),[locStats,sortMet,sortDir,curMet]);

  const thSL={padding:'5px 8px',fontSize:'8px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.4px',color:'var(--text3)',borderBottom:'.5px solid var(--bdr)',whiteSpace:'nowrap'};

  // ── No data guard ──
  const hasData=ds&&((ds.laborRows||[]).length>0||(ds.ctrlRows||[]).length>0);
  if(!hasData)return div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.85)',zIndex:450,display:'flex',alignItems:'center',justifyContent:'center'}},
    div({style:{textAlign:'center',color:'var(--text3)',padding:40}},
      div({style:{fontSize:40,marginBottom:12}},'👷'),
      div({style:{fontSize:'14px',fontWeight:700,color:'var(--text)',marginBottom:8}},'No Labor Data Loaded'),
      div({style:{fontSize:'11px',marginBottom:16,lineHeight:1.6}},'Load a Labor Analysis or Operations Report to populate this dashboard.'),
      btn({className:'btn btn-sm',onClick:onClose},'Close')));

  // ── KPI cards ──
  const kpiCards=()=>{
    if(!dist) return null;
    const labDiffPP=dist.laborPct&&distTgt.tLabor?(dist.laborPct-distTgt.tLabor)*100:null;
    const cards=[
      {l:'Labor %',      v:pFmtL(dist.laborPct),
       sub:distTgt.tLabor?(labDiffPP!=null?(labDiffPP>0?'▲ ':'▼ ')+Math.abs(labDiffPP).toFixed(1)+'% vs '+pFmtL(distTgt.tLabor)+' target':'—'):'No target set',
       col:lbCol(dist.laborPct,distTgt.tLabor),
       bg:labDiffPP!=null&&labDiffPP>(settings.laborYellowPct||1.5)?'rgba(239,68,68,.06)':labDiffPP!=null&&labDiffPP>(settings.laborGreenPct||0.5)?'rgba(245,158,11,.06)':'rgba(16,185,129,.06)'},
      {l:'TPPH',         v:nFmtL(dist.tpph),
       sub:distTgt.tTpph?'Target: '+nFmtL(distTgt.tTpph,1):'No target set',
       col:tpCol(dist.tpph,distTgt.tTpph), bg:'rgba(255,255,255,.02)'},
      {l:'OT Hrs / Day', v:nFmtL(dist.otHrs,1),
       sub:'District avg  ·  Target: ≤ 2.0 hrs',
       col:otCol(dist.otHrs),
       bg:(dist.otHrs||0)>4?'rgba(239,68,68,.06)':(dist.otHrs||0)>2?'rgba(245,158,11,.06)':'rgba(16,185,129,.06)'},
      {l:'Act vs Need',  v:avnFmt(dist.actVsNeed),
       sub:'+ overstaffed  ·  − understaffed',
       col:avCol(dist.actVsNeed), bg:'rgba(255,255,255,.02)'},
      {l:'OT Cost (Period)',v:(dist.otCostEd?'~ ':'')+f$(dist.otCost),
       sub:(dist.otCostEd?'Estimated premium  ·  ':'')+(dist.avgRate?'$'+nFmtL(dist.avgRate,2)+'/hr AROP  ·  ':'')+(dist.storeCount)+' locations',
       col:dist.otCost>5000?'#ef4444':dist.otCost>1000?'#f59e0b':'#a5b4fc',
       bg:'rgba(165,180,252,.04)'},
    ];
    return div({style:{display:'flex',gap:8,padding:'10px 16px',flexWrap:'wrap',borderBottom:'.5px solid var(--bdr)',flexShrink:0,background:'var(--surf2)'}},
      ...cards.map((k,i)=>div({key:i,style:{flex:'1 1 130px',minWidth:130,background:k.bg,border:'.5px solid var(--bdr)',borderRadius:6,padding:'8px 12px'}},
        div({style:{fontSize:'8px',textTransform:'uppercase',letterSpacing:'.5px',color:'var(--text3)',marginBottom:2}},k.l),
        div({style:{fontSize:'15px',fontFamily:'var(--mono)',fontWeight:700,color:k.col}},k.v),
        div({style:{fontSize:'8px',color:'var(--text3)',marginTop:2}},k.sub)
      ))
    );
  };

  // ── Period pill bar ──
  const periodBar=div({style:{display:'flex',gap:3,padding:'7px 16px',borderBottom:'.5px solid var(--bdr)',flexShrink:0,background:'var(--surf)',flexWrap:'wrap',alignItems:'center'}},
    span({style:{fontSize:'8px',color:'var(--text3)',marginRight:4,textTransform:'uppercase',letterSpacing:'.3px'}},'Period:'),
    ...PERIODS.map(p=>p.id!=='custom'?
      btn({key:p.id,style:{padding:'3px 9px',borderRadius:99,border:'.5px solid '+(selPeriod===p.id?'rgba(245,158,11,.4)':'var(--bdr)'),background:selPeriod===p.id?'var(--adim)':'transparent',color:selPeriod===p.id?'var(--amber)':'var(--text2)',fontSize:'9.5px',cursor:'pointer'},onClick:()=>setSelPeriod(p.id)},p.l):
      btn({key:'custom',style:{padding:'3px 9px',borderRadius:99,border:'.5px solid '+(selPeriod==='custom'?'rgba(245,158,11,.4)':'var(--bdr)'),background:selPeriod==='custom'?'var(--adim)':'transparent',color:selPeriod==='custom'?'var(--amber)':'var(--text2)',fontSize:'9.5px',cursor:'pointer'},onClick:()=>setSelPeriod('custom')},'Custom')
    ),
    selPeriod==='custom'&&React.createElement(React.Fragment,null,
      h('input',{type:'date',value:cStart,onChange:e=>setCStart(e.target.value),style:{marginLeft:6,background:'var(--surf2)',border:'.5px solid var(--bdr)',borderRadius:'var(--r)',color:'var(--text)',fontSize:'9.5px',padding:'2px 6px'}}),
      span({style:{fontSize:'9px',color:'var(--text3)',margin:'0 3px'}},'→'),
      h('input',{type:'date',value:cEnd,onChange:e=>setCEnd(e.target.value),style:{background:'var(--surf2)',border:'.5px solid var(--bdr)',borderRadius:'var(--r)',color:'var(--text)',fontSize:'9.5px',padding:'2px 6px'}})
    )
  );

  // ── OVERVIEW TAB (table) ──
  const overviewTab=()=>{
    if(!locStats.length) return div({style:{color:'var(--text3)',textAlign:'center',padding:40,fontSize:'12px'}},'No labor data for this period and location. Try widening the date range.');
    const cols=[{l:'Store',a:'left'},{l:'Labor %',a:'right'},{l:'Tgt',a:'right'},{l:'vs Tgt',a:'right'},{l:'TPPH',a:'right'},{l:'Tgt TPPH',a:'right'},{l:'OT Hrs/Day',a:'right'},{l:'Act vs Need',a:'right'},{l:'AROP',a:'right'},{l:'Act Hrs/Day',a:'right'},{l:'OT Cost',a:'right'},{l:'Days',a:'right'}];
    return div({style:{overflowX:'auto'}},
      div({style:{padding:'5px 16px 2px',fontSize:'8.5px',color:'var(--text3)',display:'flex',gap:16,borderBottom:'.5px solid rgba(255,255,255,.04)'}},
        span(null,locStats.length+' locations · '+curP.l+' period'),
        dist&&span(null,'District Labor: '+pFmtL(dist.laborPct)),
        dist&&span(null,'TPPH: '+nFmtL(dist.tpph)),
        span({style:{marginLeft:'auto',fontStyle:'italic'}},'OT Cost ~ = estimated premium (0.5× premium on OT hrs × AROP × days)')
      ),
      h('table',{style:{width:'100%',borderCollapse:'collapse',fontSize:'9.5px',minWidth:860}},
        h('thead',null,h('tr',null,...cols.map((c,i)=>th({key:i,style:{...thSL,textAlign:c.a,paddingLeft:i===0?16:8}},c.l)))),
        h('tbody',null,...locStats.map((s,i)=>{
          const lc=lbCol(s.laborPct,s.tgt.tLabor),tc=tpCol(s.tpph,s.tgt.tTpph),oc=otCol(s.otHrs),ac=avCol(s.actVsNeed);
          const ld=s.laborPct!=null&&s.tgt.tLabor?(s.laborPct-s.tgt.tLabor)*100:null;
          return tr({key:s.loc,style:{borderBottom:'.5px solid rgba(255,255,255,.04)',background:i%2?'rgba(255,255,255,.015)':'transparent'}},
            td({style:{padding:'5px 8px 5px 16px',fontWeight:600,color:'var(--text)',whiteSpace:'nowrap',fontSize:'9px'}},s.storeName),
            td({style:{padding:'5px 8px',textAlign:'right',fontFamily:'var(--mono)',fontWeight:700,color:lc}},pFmtL(s.laborPct)),
            td({style:{padding:'5px 8px',textAlign:'right',fontFamily:'var(--mono)',color:'var(--text3)',fontSize:'8.5px'}},s.tgt.tLabor?pFmtL(s.tgt.tLabor):'—'),
            td({style:{padding:'5px 8px',textAlign:'right',fontFamily:'var(--mono)',fontWeight:700,color:lc,fontSize:'8.5px'}},ld!=null?(ld>0?'+':'')+ld.toFixed(1)+'%':'—'),
            td({style:{padding:'5px 8px',textAlign:'right',fontFamily:'var(--mono)',fontWeight:700,color:tc}},nFmtL(s.tpph)),
            td({style:{padding:'5px 8px',textAlign:'right',fontFamily:'var(--mono)',color:'var(--text3)',fontSize:'8.5px'}},s.tgt.tTpph?nFmtL(s.tgt.tTpph,1):'—'),
            td({style:{padding:'5px 8px',textAlign:'right',fontFamily:'var(--mono)',fontWeight:700,color:oc}},nFmtL(s.otHrs,1)),
            td({style:{padding:'5px 8px',textAlign:'right',fontFamily:'var(--mono)',color:ac}},avnFmt(s.actVsNeed)),
            td({style:{padding:'5px 8px',textAlign:'right',fontFamily:'var(--mono)',color:'var(--text2)'}},s.avgRate?'$'+nFmtL(s.avgRate,2):'—'),
            td({style:{padding:'5px 8px',textAlign:'right',fontFamily:'var(--mono)',color:'var(--text2)'}},nFmtL(s.actHrs,1)),
            td({style:{padding:'5px 8px',textAlign:'right',fontFamily:'var(--mono)',fontSize:'8.5px',color:s.otCost>500?'#ef4444':s.otCost>100?'#f59e0b':'var(--text2)'}},s.otCost>0?(s.otCostEd?'~':'')+f$(s.otCost):'—'),
            td({style:{padding:'5px 8px',textAlign:'right',color:'var(--text3)',fontSize:'8.5px'}},s.days)
          );
        })),
        dist&&h('tfoot',null,tr(null,
          td({style:{padding:'6px 8px 6px 16px',fontWeight:700,fontSize:'9px',borderTop:'.5px solid var(--bdr2)',color:'var(--amber)'}},'District Avg'),
          td({style:{padding:'6px 8px',textAlign:'right',fontFamily:'var(--mono)',fontWeight:700,color:lbCol(dist.laborPct,distTgt.tLabor),borderTop:'.5px solid var(--bdr2)'}},pFmtL(dist.laborPct)),
          td({style:{padding:'6px 8px',textAlign:'right',fontFamily:'var(--mono)',color:'var(--text3)',fontSize:'8.5px',borderTop:'.5px solid var(--bdr2)'}},distTgt.tLabor?pFmtL(distTgt.tLabor):'—'),
          td({style:{borderTop:'.5px solid var(--bdr2)'}}),
          td({style:{padding:'6px 8px',textAlign:'right',fontFamily:'var(--mono)',fontWeight:700,color:tpCol(dist.tpph,distTgt.tTpph),borderTop:'.5px solid var(--bdr2)'}},nFmtL(dist.tpph)),
          td({style:{padding:'6px 8px',textAlign:'right',fontFamily:'var(--mono)',color:'var(--text3)',fontSize:'8.5px',borderTop:'.5px solid var(--bdr2)'}},distTgt.tTpph?nFmtL(distTgt.tTpph,1):'—'),
          td({style:{padding:'6px 8px',textAlign:'right',fontFamily:'var(--mono)',fontWeight:700,color:otCol(dist.otHrs),borderTop:'.5px solid var(--bdr2)'}},nFmtL(dist.otHrs,1)),
          td({style:{padding:'6px 8px',textAlign:'right',fontFamily:'var(--mono)',color:avCol(dist.actVsNeed),borderTop:'.5px solid var(--bdr2)'}},avnFmt(dist.actVsNeed)),
          td({style:{padding:'6px 8px',textAlign:'right',fontFamily:'var(--mono)',color:'var(--text2)',borderTop:'.5px solid var(--bdr2)'}},dist.avgRate?'$'+nFmtL(dist.avgRate,2):'—'),
          td({style:{borderTop:'.5px solid var(--bdr2)'}}),
          td({style:{padding:'6px 8px',textAlign:'right',fontFamily:'var(--mono)',fontSize:'8.5px',fontWeight:700,color:dist.otCost>2000?'#ef4444':dist.otCost>500?'#f59e0b':'var(--text2)',borderTop:'.5px solid var(--bdr2)'}},(dist.otCostEd?'~':'')+f$(dist.otCost)),
          td({style:{padding:'6px 8px',textAlign:'right',color:'var(--text3)',fontSize:'8.5px',borderTop:'.5px solid var(--bdr2)'}},dist.storeCount+' locs')
        ))
      )
    );
  };

  // ── RANKINGS TAB ──
  const rankingsTab=()=>div({style:{padding:'0 16px'}},
    div({style:{display:'flex',gap:4,marginBottom:10,flexWrap:'wrap',alignItems:'center'}},
      span({style:{fontSize:'8.5px',color:'var(--text3)',marginRight:4}},'Sort by:'),
      ...RANK_MET.map(m=>btn({key:m.id,
        style:{padding:'3px 9px',borderRadius:'var(--r)',border:'.5px solid '+(sortMet===m.id?'rgba(245,158,11,.4)':'var(--bdr)'),background:sortMet===m.id?'var(--adim)':'transparent',color:sortMet===m.id?'var(--amber)':'var(--text2)',fontSize:'9.5px',cursor:'pointer'},
        onClick:()=>{if(sortMet===m.id)setSortDir(d=>d*-1);else{setSortMet(m.id);setSortDir(1);}},
      },m.l+(sortMet===m.id?(sortDir===1?' ↑':' ↓'):'')))
    ),
    h('table',{style:{width:'100%',borderCollapse:'collapse',fontSize:'9.5px',minWidth:720}},
      h('thead',null,h('tr',null,
        th({style:{...thSL,textAlign:'center',width:32}},'#'),
        th({style:{...thSL,textAlign:'left'}},'Store'),
        ...RANK_MET.map((m,i)=>th({key:i,style:{...thSL,textAlign:'right',color:m.id===sortMet?'var(--amber)':'var(--text3)',cursor:'pointer'},onClick:()=>{if(sortMet===m.id)setSortDir(d=>d*-1);else{setSortMet(m.id);setSortDir(1);}}},m.l+(m.id===sortMet?(sortDir===1?' ↑':' ↓'):'')))
      )),
      h('tbody',null,...rankSorted.map((s,i)=>tr({key:s.loc,style:{borderBottom:'.5px solid rgba(255,255,255,.04)',background:i%2?'rgba(255,255,255,.015)':'transparent'}},
        td({style:{padding:'5px 8px',textAlign:'center',fontFamily:'var(--mono)',fontSize:'8.5px',color:'var(--text3)'}},
          i===0?span({style:{fontSize:'11px'}},'🥇'):i===1?span({style:{fontSize:'11px'}},'🥈'):i===2?span({style:{fontSize:'11px'}},'🥉'):(i+1)),
        td({style:{padding:'5px 8px',fontWeight:600,color:'var(--text)',whiteSpace:'nowrap',fontSize:'9px'}},s.storeName),
        ...RANK_MET.map((m,j)=>td({key:j,style:{padding:'5px 8px',textAlign:'right',fontFamily:'var(--mono)',fontWeight:m.id===sortMet?700:400,color:m.col(s)}},m.fmt(s)))
      )))
    )
  );

  // ── DOW TAB ──
  const dowTab=()=>div({style:{padding:'0 16px'}},
    div({style:{fontSize:'9px',color:'var(--text3)',marginBottom:10}},'Average metrics by day of week. Faded rows have no records in this period.'),
    h('table',{style:{width:'100%',borderCollapse:'collapse',fontSize:'9.5px'}},
      h('thead',null,h('tr',null,
        ...[{l:'Day',a:'left'},{l:'Labor %',a:'right'},{l:'vs Target',a:'right'},{l:'TPPH',a:'right'},{l:'vs Target',a:'right'},{l:'OT Hrs/Day',a:'right'},{l:'Act vs Need',a:'right'},{l:'Sample Days',a:'right'}]
        .map((c,i)=>th({key:i,style:{...thSL,textAlign:c.a,paddingLeft:i===0?16:8}},c.l))
      )),
      h('tbody',null,...dowStats.map((d,i)=>{
        const lpDiff=d.laborPct!=null&&distTgt.tLabor?(d.laborPct-distTgt.tLabor)*100:null;
        const tpDiff=d.tpph!=null&&distTgt.tTpph?(d.tpph-distTgt.tTpph):null;
        return tr({key:i,style:{borderBottom:'.5px solid rgba(255,255,255,.04)',background:d.count>0?i%2?'rgba(255,255,255,.015)':'transparent':'transparent',opacity:d.count>0?1:.35}},
          td({style:{padding:'5px 8px 5px 16px',fontWeight:600,color:'var(--text)',width:60}},d.name),
          td({style:{padding:'5px 8px',textAlign:'right',fontFamily:'var(--mono)',fontWeight:700,color:lbCol(d.laborPct,distTgt.tLabor)}},pFmtL(d.laborPct)),
          td({style:{padding:'5px 8px',textAlign:'right',fontFamily:'var(--mono)',fontSize:'8.5px',color:lbCol(d.laborPct,distTgt.tLabor)}},lpDiff!=null?(lpDiff>0?'+':'')+lpDiff.toFixed(1)+'%':'—'),
          td({style:{padding:'5px 8px',textAlign:'right',fontFamily:'var(--mono)',fontWeight:700,color:tpCol(d.tpph,distTgt.tTpph)}},nFmtL(d.tpph)),
          td({style:{padding:'5px 8px',textAlign:'right',fontFamily:'var(--mono)',fontSize:'8.5px',color:tpCol(d.tpph,distTgt.tTpph)}},tpDiff!=null?(tpDiff>0?'+':'')+tpDiff.toFixed(2):'—'),
          td({style:{padding:'5px 8px',textAlign:'right',fontFamily:'var(--mono)',fontWeight:700,color:otCol(d.otHrs)}},nFmtL(d.otHrs,1)),
          td({style:{padding:'5px 8px',textAlign:'right',fontFamily:'var(--mono)',color:avCol(d.actVsNeed)}},avnFmt(d.actVsNeed)),
          td({style:{padding:'5px 8px',textAlign:'right',color:'var(--text3)',fontSize:'8.5px'}},d.count>0?d.count:'—')
        );
      }))
    )
  );

  // ── TREND TAB (SVG sparklines) ──
  const trendTab=()=>{
    const hasAny=trendData.some(w=>w.laborPct!=null||w.tpph!=null||w.otHrs!=null);
    if(!hasAny) return div({style:{color:'var(--text3)',textAlign:'center',padding:40,fontSize:'12px'}},'No trend data available for this selection.');
    const sparkline=(key,label,fmt,colFn,tgtVal)=>{
      const vals=trendData.map(d=>d[key]).filter(v=>v!=null&&!isNaN(v));
      if(!vals.length) return null;
      const minV=Math.min(...vals)*0.95;
      const rawMax=Math.max(...vals)*1.05;
      const maxV=rawMax<=minV?minV+0.001:rawMax;
      const W=580,H=74,pX=10,pYt=16,pYb=18;
      const xOf=i=>pX+(i/Math.max(trendData.length-1,1))*(W-pX*2);
      const yOf=v=>pYt+(1-(v-minV)/(maxV-minV))*(H-pYt-pYb);
      const pts=trendData.map((d,i)=>[xOf(i),d[key]!=null?yOf(d[key]):null]);
      const poly=pts.filter(p=>p[1]!=null).map(p=>p.join(',')).join(' ');
      const filledPoly=pts.filter(p=>p[1]!=null);
      const areaStr=filledPoly.length>1?poly+' '+xOf(trendData.length-1)+','+(H-pYb)+' '+xOf(0)+','+(H-pYb):'';
      const tY=tgtVal!=null&&(maxV-minV)>0?yOf(Math.min(Math.max(tgtVal,minV),maxV)):null;
      return div({style:{background:'var(--surf2)',border:'.5px solid var(--bdr)',borderRadius:'var(--r)',padding:'10px 14px',marginBottom:10}},
        div({style:{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}},
          div({style:{fontSize:'10px',fontWeight:700,color:'var(--text)'}},'📊 '+label),
          tY!=null&&div({style:{fontSize:'8px',color:'rgba(245,158,11,.8)'}},'— target: '+fmt(tgtVal))
        ),
        h('svg',{viewBox:'0 0 '+W+' '+H,style:{width:'100%',height:H,display:'block',overflow:'visible'}},
          h('defs',null,h('linearGradient',{id:'lg_la_'+key,x1:'0',y1:'0',x2:'0',y2:'1'},
            h('stop',{offset:'0%',stopColor:'#60a5fa',stopOpacity:.18}),
            h('stop',{offset:'100%',stopColor:'#60a5fa',stopOpacity:0})
          )),
          areaStr&&h('polygon',{points:areaStr,fill:'url(#lg_la_'+key+')'}),
          tY!=null&&h('line',{x1:pX,y1:tY,x2:W-pX,y2:tY,stroke:'rgba(245,158,11,.45)',strokeWidth:1,strokeDasharray:'5,4'}),
          poly&&h('polyline',{points:poly,fill:'none',stroke:'#60a5fa',strokeWidth:1.5,strokeLinejoin:'round',strokeLinecap:'round'}),
          ...trendData.map((d,i)=>{
            if(d[key]==null||isNaN(d[key]))return null;
            const px=xOf(i),py=yOf(d[key]),col=colFn(d[key]);
            return React.createElement(React.Fragment,{key:i},
              h('circle',{cx:px,cy:py,r:3,fill:col,stroke:'var(--surf2)',strokeWidth:1.2}),
              h('text',{x:px,y:py-8,textAnchor:'middle',fontSize:8,fill:col,fontWeight:600},fmt(d[key])),
              h('text',{x:px,y:H,textAnchor:'middle',fontSize:7,fill:'var(--text3)'},d.label)
            );
          }).filter(Boolean)
        )
      );
    };
    return div({style:{padding:'0 16px 12px'}},
      sparkline('laborPct','Labor %',  v=>pFmtL(v),  v=>lbCol(v,distTgt.tLabor), distTgt.tLabor||null),
      sparkline('tpph',    'TPPH',     v=>nFmtL(v,2),v=>tpCol(v,distTgt.tTpph),  distTgt.tTpph||null),
      sparkline('otHrs',   'OT Hours / Day', v=>nFmtL(v,1),otCol, 2),
      sparkline('actVsNeed','Act vs Need (hrs)', avnFmt, avCol, null)
    );
  };

  // ── INSIGHTS TAB (v4.197) ─────────────────────────────────────────────────
  // Surfaces ranked, actionable labor intelligence from the current period's
  // locStats + trendData. Each insight carries a severity level (critical /
  // warning / positive), a store attribution, a cost-impact estimate, and a
  // specific recommended action. Sorted critical-first, then by $ impact so
  // the highest-value intervention is always at the top.
  //
  // Generator rules (fired in this priority order):
  //   CRITICAL  labor > target + 2 pp      → excess labor cost identified
  //   CRITICAL  OT hrs/day > 4             → unsustainable OT level
  //   WARNING   labor > target + 1 pp      → trending over, review schedule
  //   WARNING   labor < target − 2 pp      → understaffed, service risk
  //   WARNING   OT hrs/day > 2             → above-threshold OT
  //   WARNING   TPPH < target × 0.88       → scheduling inefficiency
  //   WARNING   |Act vs Need| > 80 hrs     → severe scheduling gap
  //   WARNING   district labor trending up  → 2+ consecutive weeks rising
  //   POSITIVE  N stores within green band → acknowledge wins
  //   POSITIVE  district OT below 1 hr/day → exceptional efficiency
  const insightsTab = () => {
    if(!locStats.length) return div({style:{color:'var(--text3)',textAlign:'center',padding:40,fontSize:'12px'}},
      'No labor data for this period. Try widening the date range.');

    const insights = [];

    // ── Per-store rules ──────────────────────────────────────────────────
    locStats.forEach(s => {
      const lpDiff  = s.laborPct!=null&&s.tgt.tLabor ? (s.laborPct-s.tgt.tLabor)*100 : null;
      const lpPP    = lpDiff!=null ? Math.abs(lpDiff).toFixed(1) : null;
      const excessDollar = lpDiff!=null&&lpDiff>0&&s.totalSales>0
        ? Math.round(s.totalSales*(lpDiff/100)) : 0;

      // ── Critical: over-labor ≥ 2 pp ───────────────────────────────────
      if(lpDiff!=null&&lpDiff>=2) {
        insights.push({
          level:'critical', loc:s.loc, metric:'laborPct',
          headline:`Labor ${(s.laborPct*100).toFixed(1)}% — +${lpPP}pp over target`,
          detail:`${lpPP} percentage points above the ${(s.tgt.tLabor*100).toFixed(1)}% target. `+
            (excessDollar>0?`Estimated excess cost this period: ${f$(excessDollar)}.`:''),
          action:'Audit next week\'s schedule. Reduce over-assignments on low-traffic shifts. Tighten OT approvals.',
          impact:excessDollar,
        });
      }
      // ── Warning: over-labor 1–2 pp ────────────────────────────────────
      else if(lpDiff!=null&&lpDiff>=1) {
        insights.push({
          level:'warning', loc:s.loc, metric:'laborPct',
          headline:`Labor ${(s.laborPct*100).toFixed(1)}% — +${lpPP}pp over target`,
          detail:`Approaching the critical threshold. Estimated excess: ${f$(excessDollar)}.`,
          action:'Review current week schedule. Flag for GM discussion before next week locks.',
          impact:excessDollar,
        });
      }

      // ── Warning: under-labor ≤ −2 pp (service risk) ───────────────────
      if(lpDiff!=null&&lpDiff<=-2) {
        insights.push({
          level:'warning', loc:s.loc, metric:'underLabor',
          headline:`Labor ${(s.laborPct*100).toFixed(1)}% — −${lpPP}pp under target`,
          detail:`Understaffing at this level risks service degradation, OEPE pressure, and crew burnout.`,
          action:'Verify open positions are filled. Check if crew is breaking properly. Review peak-hour coverage.',
          impact:0,
        });
      }

      // ── Critical: OT > 4 hrs/day ──────────────────────────────────────
      if(s.otHrs!=null&&s.otHrs>4) {
        insights.push({
          level:'critical', loc:s.loc, metric:'otHrs',
          headline:`OT ${s.otHrs.toFixed(1)} hrs/day — excessive overtime`,
          detail:`More than 4 daily OT hours is unsustainable. `+
            (s.otCost>0?`Period cost: ${s.otCostEd?'~':''}${f$(s.otCost)}.`:''),
          action:'Audit OT approvals. Determine if root cause is chronic understaffing, call-outs, or scheduling errors. Increase base crew if needed.',
          impact:s.otCost||0,
        });
      }
      // ── Warning: OT 2–4 hrs/day ───────────────────────────────────────
      else if(s.otHrs!=null&&s.otHrs>2) {
        insights.push({
          level:'warning', loc:s.loc, metric:'otHrs',
          headline:`OT ${s.otHrs.toFixed(1)} hrs/day — above target`,
          detail:`Target is ≤2 hrs/day. Period premium: ${s.otCostEd?'~':''}${f$(s.otCost||0)}.`,
          action:'Review weekend and close-shift scheduling. Identify if specific shifts drive OT.',
          impact:s.otCost||0,
        });
      }

      // ── Warning: TPPH < 88% of target ────────────────────────────────
      if(s.tpph!=null&&s.tgt.tTpph&&s.tpph<s.tgt.tTpph*0.88) {
        const shortfall = ((1-s.tpph/s.tgt.tTpph)*100).toFixed(0);
        insights.push({
          level:'warning', loc:s.loc, metric:'tpph',
          headline:`TPPH ${s.tpph.toFixed(2)} — ${shortfall}% below target`,
          detail:`Target is ${s.tgt.tTpph.toFixed(1)} TPPH. Low TPPH relative to target indicates crew hours are high relative to transaction volume.`,
          action:'Review daypart deployment — are crew scheduled during slow periods? Check for splits vs dead-time coverage.',
          impact:0,
        });
      }

      // ── Warning: severe scheduling gap (Act vs Need) ──────────────────
      if(s.actVsNeed!=null&&Math.abs(s.actVsNeed)>80) {
        const dir = s.actVsNeed>0 ? 'over' : 'under';
        insights.push({
          level:'warning', loc:s.loc, metric:'actVsNeed',
          headline:`Act vs Need: ${s.actVsNeed>0?'+':''}${s.actVsNeed.toFixed(0)} hrs — severely ${dir}scheduled`,
          detail:`Actual hours ${s.actVsNeed>0?'exceed':'fall short of'} the labor model's computed need by ${Math.abs(s.actVsNeed).toFixed(0)} hrs.`,
          action:s.actVsNeed>0
            ? 'Align schedule to labor model output. Reduce excess coverage on predicted low-volume windows.'
            : 'Increase scheduled crew on high-volume windows. Review if labor model reflects current traffic.',
          impact:0,
        });
      }
    });

    // ── District trend check: labor rising 2+ consecutive weeks ──────────
    if(trendData.length>=3) {
      const recent3 = trendData.slice(-3);
      const allRising = recent3.every((w,i)=>i===0||(w.laborPct!=null&&recent3[i-1].laborPct!=null&&w.laborPct>recent3[i-1].laborPct));
      if(allRising&&recent3[2].laborPct!=null&&recent3[0].laborPct!=null) {
        const rise = ((recent3[2].laborPct-recent3[0].laborPct)*100).toFixed(1);
        insights.push({
          level:'warning', loc:null, metric:'districtTrend',
          headline:`District labor trending up +${rise}pp over 3 weeks`,
          detail:`The district average labor % has risen ${rise} percentage points over the last 3 weekly periods, a pattern that compounds quickly if unchecked.`,
          action:'Hold district call focused on schedule discipline. Identify which stores are driving the rise.',
          impact:0,
        });
      }
    }

    // ── Positive: stores on target ────────────────────────────────────────
    const onTarget = locStats.filter(s=>{
      const lpd=s.laborPct!=null&&s.tgt.tLabor?(s.laborPct-s.tgt.tLabor)*100:null;
      return lpd!=null&&Math.abs(lpd)<=(settings.laborGreenPct||0.5);
    });
    if(onTarget.length>0) {
      const nameList = onTarget.slice(0,3).map(s=>STORE_NAMES[s.loc]||s.loc).join(', ');
      insights.push({
        level:'positive', loc:null, metric:'onTarget',
        headline:`${onTarget.length} store${onTarget.length>1?'s':''} on target: ${nameList}${onTarget.length>3?'…':''}`,
        detail:'These stores are within the green band of their labor % target this period.',
        action:'',
        impact:0,
      });
    }

    // ── Positive: district OT under 1 hr/day ──────────────────────────────
    if(dist&&dist.otHrs!=null&&dist.otHrs<1) {
      insights.push({
        level:'positive', loc:null, metric:'districtOT',
        headline:`District OT averaging only ${dist.otHrs.toFixed(1)} hrs/day — excellent`,
        detail:'Consistently low OT is a sign of strong schedule discipline and stable crew coverage.',
        action:'',
        impact:0,
      });
    }

    // ── Sort: critical → warning → positive; within level by $ impact ─────
    const PLV={critical:0,warning:1,positive:2};
    insights.sort((a,b)=>{
      if(PLV[a.level]!==PLV[b.level]) return PLV[a.level]-PLV[b.level];
      return b.impact-a.impact;
    });

    // ── Summary bar ───────────────────────────────────────────────────────
    const critN   = insights.filter(i=>i.level==='critical').length;
    const warnN   = insights.filter(i=>i.level==='warning').length;
    const posN    = insights.filter(i=>i.level==='positive').length;
    const totalImpact = insights.reduce((a,i)=>a+(i.impact||0),0);

    const summaryBar = div({style:{
      display:'flex',gap:12,alignItems:'center',flexWrap:'wrap',
      background:'var(--surf2)',border:'.5px solid var(--bdr)',borderRadius:'var(--r)',
      padding:'10px 14px',marginBottom:12}},
      div({style:{flex:1}},
        div({style:{fontSize:'11px',fontWeight:700,color:'var(--text)',marginBottom:3}},
          '⚡ Labor Intelligence — '+curP.l+
          (selLoc!=='all'&&selLoc!=='ok'&&selLoc!=='fl'?' · '+(STORE_NAMES[selLoc]||selLoc):selLoc==='ok'?' · MCDOK':selLoc==='fl'?' · Emerald Arches':' · All Locations')
        ),
        div({style:{display:'flex',gap:10,flexWrap:'wrap',fontSize:'9px'}},
          critN>0&&span({style:{color:'#ef4444',fontWeight:700}},critN+' critical'),
          warnN>0&&span({style:{color:'#f59e0b',fontWeight:600}},warnN+' warning'+(critN?'':'')),
          posN>0&&span({style:{color:'#34d399'}},posN+' positive'),
          critN===0&&warnN===0&&span({style:{color:'#34d399',fontWeight:700}},'✅ No issues detected'),
          totalImpact>0&&span({style:{color:'var(--text3)',marginLeft:4}},'·  Est. excess labor cost: '+f$(totalImpact))
        )
      ),
      // Quick legend
      div({style:{display:'flex',flexDirection:'column',gap:2,fontSize:'7.5px',color:'var(--text3)'}},
        div(null,'🚨 Critical — act today'),
        div(null,'⚠️ Warning — monitor this week'),
        div(null,'✅ Positive — acknowledge the win')
      )
    );

    // ── Insight cards ─────────────────────────────────────────────────────
    const insightCards = insights.length===0
      ? div({style:{color:'var(--text3)',textAlign:'center',padding:40,fontSize:'12px'}},
          '✅ No labor issues detected for this period and location scope. All stores within acceptable bands.')
      : div({style:{display:'flex',flexDirection:'column',gap:8}},
          ...insights.map((ins,i)=>{
            const isC=ins.level==='critical', isP=ins.level==='positive';
            const borderCol=isC?'rgba(239,68,68,.4)':isP?'rgba(52,211,153,.3)':'rgba(245,158,11,.3)';
            const bgCol    =isC?'rgba(239,68,68,.05)':isP?'rgba(52,211,153,.05)':'rgba(245,158,11,.04)';
            const icon     =isC?'🚨':isP?'✅':'⚠️';
            const iconCol  =isC?'#ef4444':isP?'#34d399':'#f59e0b';
            return div({key:i,style:{border:'.5px solid '+borderCol,borderRadius:'var(--r)',padding:'10px 14px',background:bgCol}},
              div({style:{display:'flex',alignItems:'flex-start',gap:10}},
                span({style:{fontSize:'13px',flexShrink:0,lineHeight:'20px'}},icon),
                div({style:{flex:1,minWidth:0}},
                  div({style:{display:'flex',alignItems:'baseline',gap:6,flexWrap:'wrap',marginBottom:3}},
                    ins.loc&&span({style:{fontSize:'8px',fontWeight:700,color:'var(--amber)',background:'rgba(245,158,11,.1)',
                      border:'.5px solid rgba(245,158,11,.25)',padding:'1px 7px',borderRadius:99,whiteSpace:'nowrap',flexShrink:0}},
                      STORE_NAMES[ins.loc]||ins.loc),
                    div({style:{fontSize:'10.5px',fontWeight:700,color:iconCol,lineHeight:1.3}},ins.headline)
                  ),
                  ins.detail&&div({style:{fontSize:'8.5px',color:'var(--text2)',marginBottom:ins.action?5:0,lineHeight:1.55}},ins.detail),
                  ins.action&&div({style:{fontSize:'8.5px',color:'var(--text3)',lineHeight:1.4}},
                    span({style:{color:'var(--amber)',fontWeight:700,fontStyle:'normal'}},'Action: '),ins.action)
                ),
                ins.impact>0&&div({style:{textAlign:'right',flexShrink:0}},
                  div({style:{fontSize:'9px',fontWeight:700,color:'#ef4444',fontFamily:'var(--mono)'}},
                    '−'+f$(ins.impact)),
                  div({style:{fontSize:'7px',color:'var(--text3)'}},'est. cost')
                )
              )
            );
          })
        );

    return div({style:{padding:'0 16px 20px'}},
      summaryBar,
      insightCards
    );
  };

  // ── TABS config ──
  const TABS=[{id:'overview',l:'📋 Overview'},{id:'rankings',l:'⇈ Rankings'},{id:'dow',l:'📅 Day of Week'},{id:'trend',l:'📈 6-Wk Trend'},{id:'insights',l:'⚡ Insights'}];

  return div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.82)',zIndex:450,display:'flex',flexDirection:'column',paddingTop:20}},
    div({style:{flex:'0 0 20px',cursor:'pointer'},onClick:onClose}),
    div({style:{flex:1,background:'var(--surf)',maxWidth:1200,margin:'0 auto',width:'calc(100% - 32px)',
      borderRadius:'var(--rl) var(--rl) 0 0',display:'flex',flexDirection:'column',overflow:'hidden',
      boxShadow:'0 -8px 40px rgba(0,0,0,.4)'}},
      // Header
      div({style:{padding:'10px 16px',borderBottom:'.5px solid var(--bdr)',flexShrink:0,background:'var(--surf2)',display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}},
        div({style:{fontSize:'14px',fontWeight:800,color:'var(--text)'}},'👷 Labor Analytics'),
        div({style:{display:'flex',flexDirection:'column',gap:1}},
          div({style:{fontSize:'7.5px',color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.4px'}},'Location'),
          h('select',{value:selLoc,onChange:e=>setSelLoc(e.target.value),
            style:{background:'var(--surf3)',border:'.5px solid var(--bdr)',borderRadius:'var(--r)',color:'var(--text)',fontSize:'10px',padding:'3px 8px',maxWidth:215}},
            h('option',{value:'all'},'All Locations ('+allLocs.length+')'),
            h('option',{value:'ok'},'MCDOK — OK ('+okLocs.length+')'),
            h('option',{value:'fl'},'Emerald Arches — FL ('+flLocs.length+')'),
            allLocs.map(l=>h('option',{key:l,value:l},sNameC(l)))
          )
        ),
        dist&&span({style:{fontSize:'9px',padding:'3px 10px',borderRadius:99,background:'rgba(255,255,255,.04)',border:'.5px solid var(--bdr)',color:'var(--text2)'}},
          dist.storeCount+' stores'+(dist.totalSales>0?'  ·  $'+(dist.totalSales/1000).toFixed(0)+'K sales':'')
        ),
        div({style:{marginLeft:'auto',display:'flex',gap:6,alignItems:'center'}},
                    h(ExportDropdown,{
            title:'Labor Analytics — '+curP.l,
            filename:'labor_analytics_'+selPeriod+'_'+new Date().toISOString().slice(0,10),
            rows:locStats.map(s=>({
              'Store':           s.storeName,
              'Labor %':         s.laborPct!=null?((s.laborPct*100).toFixed(1)+'%'):'—',
              'Target Labor %':  s.tgt.tLabor?((s.tgt.tLabor*100).toFixed(1)+'%'):'—',
              'vs Target':       (s.laborPct&&s.tgt.tLabor)?((s.laborPct-s.tgt.tLabor)*100>0?'+':'')+((s.laborPct-s.tgt.tLabor)*100).toFixed(1)+'%':'—',
              'TPPH':            s.tpph!=null?s.tpph.toFixed(2):'—',
              'Target TPPH':     s.tgt.tTpph?s.tgt.tTpph.toFixed(1):'—',
              'OT Hrs/Day':      s.otHrs!=null?s.otHrs.toFixed(1):'—',
              'Act vs Need':     s.actVsNeed!=null?((s.actVsNeed>0?'+':'')+s.actVsNeed.toFixed(0)+' hrs'):'—',
              'AROP':            s.avgRate?('$'+s.avgRate.toFixed(2)):'—',
              'Act Hrs/Day':     s.actHrs!=null?s.actHrs.toFixed(1):'—',
              'OT Cost':         s.otCost>0?((s.otCostEd?'~':'')+f$(s.otCost)):'—',
              'Days':            s.days,
            }))
          }),
          btn({className:'btn btn-sm',style:{color:'var(--text3)'},onClick:onClose},'✕'))
      ),
      // Period pills
      periodBar,
      // KPI cards
      kpiCards(),
      // Tab bar
      div({style:{display:'flex',gap:0,borderBottom:'.5px solid var(--bdr)',flexShrink:0,background:'var(--surf)',padding:'0 16px'}},
        ...TABS.map(t=>btn({key:t.id,
          style:{padding:'7px 14px',border:'none',borderBottom:tab===t.id?'2px solid var(--amber)':'2px solid transparent',
            fontSize:'11px',fontWeight:tab===t.id?700:400,background:'transparent',
            color:tab===t.id?'var(--amber)':'var(--text3)',cursor:'pointer',marginBottom:-1},
          onClick:()=>setTab(t.id)},t.l))
      ),
      // Tab content
      div({style:{flex:1,overflowY:'auto',paddingTop:12,paddingBottom:40}},
        tab==='overview' && overviewTab(),
        tab==='rankings' && rankingsTab(),
        tab==='dow'      && dowTab(),
        tab==='trend'    && trendTab(),
        tab==='insights' && insightsTab()
      )
    )
  );
}

export { DARDaypartPanel, ProductMixPanel, LaborAnalyticsPanel, OperatorSummaryPanel, ModelAssignmentPanel, StoreKBEditor };
