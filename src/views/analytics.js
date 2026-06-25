// @ts-nocheck
import * as React from 'react';
import { STORE_NAMES, sName, sNameC, DOW_BASE, DEFAULT_TARGETS, DEF_SETTINGS, MODEL_CODE_LABELS, STORE_COORDS, EVENT_TYPES, EVENT_TYPE_GROUPS, getKB, INV_ORG_COORDS, DEFAULT_MODEL_ASSIGNMENTS, STORE_KB } from '../constants.js';
import { dKey, addD, mwStart, dowOf, dFmt } from '../utils/date.js';
import { isHoliday } from '../utils/holidays.js';
import { forecastDay, getWeatherNote, getDIRecommendation, computeModelHealth, modelHealthScore, fetchLY, getStoreOrg, getModelAssignment, InfoIcon, computeMAPEDrift, computeStoreSigma, fetchRow } from '../engine/forecast.js';
import { runWhyEngineScan, diagnoseMiss, runWhyEngineDistrict } from '../engine/why.js';
import { calibrateStore } from '../engine/backtest.js';
import { computeEventFactors } from '../utils/events.js';
import { EventEntryModal, EventRegistryModal } from '../features/calendar.js';
import { TH, f$, fPct, fP, grade } from '../utils/fmt.js';
import { storeDistance, regionalRadius } from '../features/morning-brief.js';
import { idbClearAll, idbPutRows, opfsClear } from '../db/index.js';
import { ExportDropdown, StoreCard } from './store-dash.js';

const h=React.createElement;
const div=(p,...c)=>h('div',p,...c);
const span=(p,...c)=>h('span',p,...c);
const btn=(p,...c)=>h('button',p,...c);
const tr=(p,...c)=>h('tr',p,...c);
const td=(p,...c)=>h('td',p,...c);
const label=(p,...c)=>h('label',p,...c);
const th=(p,...c)=>h('th',p,...c);
const tbl=(p,...c)=>h('table',p,...c);
const thead=(p,...c)=>h('thead',p,...c);
const tbody=(p,...c)=>h('tbody',p,...c);
const sel=(p,...c)=>h('select',p,...c);
const opt=(p,...c)=>h('option',p,...c);
const inp=(p,...c)=>h('input',p,...c);
const lbl=(p,...c)=>h('label',p,...c);

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

  uE(()=>{
    // Use coverage already computed from loaded rows — no IDB read needed
    if(idbCoverage && Object.keys(idbCoverage).length>0) setCov(idbCoverage);
  },[idbCoverage]);

  const STORE_LABELS = {
    laborRows:'Labor Analysis',opsRows:'Operations Report',
    ctrlRows:'Controls Data',fobRows:'FOB Report',
    auditRows:'Register Audit',peaksRows:'3 Peaks Report',
    darRows:'Daily Activity Reports',pmixRows:'Product Mix',
  };

  const totalRows = Object.values(cov).reduce((a,v)=>a+(v?.count||0),0);

  const handleClear = async()=>{
    if(!confirm('Clear ALL stored data? The app will require re-uploading files on next launch.')) return;
    setStatus('Clearing…');
    await Promise.all([idbClearAll(), opfsClear()]);
    const zeroCov = Object.fromEntries(Object.keys(STORE_LABELS).map(k=>[k,{count:0}]));
    setCov(zeroCov);
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
          div({style:{fontSize:'9px',color:'var(--text3)'}},'Local file storage (OPFS) · '+totalRows.toLocaleString()+' total rows stored · data survives browser refresh')
        ),
        btn({className:'btn btn-sm',style:{color:'var(--text3)'},onClick:onClose},'✕')
      ),
      div({style:{padding:'16px',overflowY:'auto'}},
        div(null,
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
              const wDates=rows.map(r=>r._d||'').filter(Boolean).sort();
              setCov(c=>({...c,weatherRows:{count:rows.length,from:wDates[0]||'?',to:wDates[wDates.length-1]||'?'}}));
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

export { AIInsightsTab, MetricCorrelationExplorer, WhyEnginePanel, FOBAnalysisPanel, ForecastAccuracyPanel, AIBacktestScanner, DialedInPanel, DateRangeReport, ForecastAudit, LocationBrief, ProjectionVsActualsReport, DialedInComparisonReport, DistrictPriorityBrief, AttentionPanel, AtAGlance, DataManagerPanel, StoreOnePager, ModelHealthBadge };
