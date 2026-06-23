// @ts-nocheck
import * as React from 'react';
import { DEFAULT_TARGETS, STORE_NAMES } from '../constants.js';
import { fetchLY, getStoreOrg, avg6 } from '../engine/forecast.js';

const h=React.createElement;
const div=(p,...c)=>h('div',p,...c);
const span=(p,...c)=>h('span',p,...c);
const btn=(p,...c)=>h('button',p,...c);
const inp=(p,...c)=>h('input',p,...c);

// SMART TARGET ENGINE — Data-driven target generation per store per metric

const SMART_METRICS = [
  {k:'oepe',       src:'ops',   field:'oepe',      dir:'lower', label:'OEPE (s)',
   fmt:function(v){return v?Math.round(v)+'s':'—';}, tgtKey:'tOepe',
   desc:'Order End to Present End. Lower = faster service.'},
  {k:'tpph',       src:'labor', field:'tpph',      dir:'higher',label:'TPPH',
   fmt:function(v){return v?v.toFixed(2):'—';}, tgtKey:'tTpph',
   desc:'Transactions Per Punched Hour. Higher = better labor efficiency.'},
  {k:'laborPct',   src:'labor', field:'laborPct',  dir:'lower', label:'Labor %',
   fmt:function(v){return v?(v*100).toFixed(1)+'%':'—';}, tgtKey:'tLabor',
   desc:'Labor cost as % of net sales.'},
  {k:'cashOSPct',  src:'ctrl',  field:'cashOSPct', dir:'lower', label:'Cash O/S %',
   fmt:function(v){return v!=null?(v*100).toFixed(3)+'%':'—';}, tgtKey:'tCashOSPct', absDir:true,
   desc:'Cash over/short. Closer to 0 is better.'},
  {k:'tRedAPct',   src:'ctrl',  field:'tRedAPct',  dir:'lower', label:'T-Red After %',
   fmt:function(v){return v?(v*100).toFixed(3)+'%':'—';}, tgtKey:'tRedAPct',
   desc:'Post-total transaction reductions. Lower = better integrity.'},
  {k:'salesGrowth',src:'labor', field:'sales',     dir:'higher',label:'Sales Growth',
   fmt:function(v){return v!=null?(v>=0?'+':'')+v.toFixed(1)+'%':'—';}, tgtKey:'tGrowth', computed:true,
   desc:'Year-over-year sales growth vs same period LY.'},
  {k:'fobPct',     src:'fob',   field:'fobPct',    dir:'lower', label:'FOB %',
   fmt:function(v){return v?(v*100).toFixed(2)+'%':'—';}, tgtKey:'tFOBTarget',
   desc:'Food Over Base as % of sales (w/o discounts).'},
  {k:'avgCheck',  src:'labor', field:'avgCheck',  dir:'higher',label:'Avg Check',
   fmt:function(v){return v?'$'+v.toFixed(2):'—';}, tgtKey:'tAvgCheck',
   desc:'Average transaction value. Higher = better mix/upsell.'},
  {k:'passRate',  src:'ops',   field:'park',      dir:'lower', label:'Pass %',
   fmt:function(v){return v!=null?(v*100).toFixed(1)+'%':'—';}, tgtKey:'tPassRate',
   desc:'DT Parked %. Lower = fewer cars pulled without completing order.'},
  {k:'oppCostPct',src:'labor', field:'oppCostPct',dir:'lower', label:'Opp Cost %',
   fmt:function(v){return v!=null?(v*100).toFixed(2)+'%':'—';}, tgtKey:'tOppCost',
   desc:'Opportunity Cost as % of sales. Estimated OEPE-related lost revenue.'},
];

// Metric groupings for tab navigation in SmartTargetPanel
const METRIC_GROUPS=[
  {id:'all',      label:'All Metrics', keys:null},
  {id:'service',  label:'Service',     keys:['oepe','passRate']},
  {id:'people',   label:'People',      keys:['tpph','laborPct']},
  {id:'financial',label:'Financial',   keys:['salesGrowth','avgCheck','fobPct']},
  {id:'controls', label:'Controls',    keys:['cashOSPct','tRedAPct','oppCostPct']},
];

function trimmedMean(arr){
  if(!arr||!arr.length) return null;
  const s=[...arr].sort((a,b)=>a-b);
  const cut=Math.max(1,Math.floor(s.length*.10));
  const trimmed=s.slice(cut,s.length-cut);
  return trimmed.length?trimmed.reduce((a,b)=>a+b,0)/trimmed.length:null;
}

function bestSustained4wk(vals,dir){
  if(!vals||vals.length<4) return null;
  let best=null;
  for(let i=0;i<=vals.length-4;i++){
    const avg=vals.slice(i,i+4).reduce((a,b)=>a+b,0)/4;
    if(best===null||(dir==='lower'?avg<best:avg>best)) best=avg;
  }
  return best;
}

function trendSlope(vals){
  if(!vals||vals.length<4) return 0;
  const n=vals.length,sumX=n*(n-1)/2,sumY=vals.reduce((a,b)=>a+b,0);
  const sumXY=vals.reduce((a,v,i)=>a+i*v,0),sumX2=vals.reduce((a,_,i)=>a+i*i,0);
  const slope=(n*sumXY-sumX*sumY)/(n*sumX2-sumX*sumX);
  return sumY/n?(slope/(sumY/n)*4):0;
}

function roundTarget(v,tgtKey){
  if(!v&&v!==0) return null;
  if(tgtKey==='tOepe') return Math.round(v/5)*5;
  if(['tLabor','tCashOSPct','tRedAPct','tFOBTarget','tTpph'].includes(tgtKey))
    return Math.round(v*10000)/10000;
  return Math.round(v*100)/100;
}

function computeSmartTargets(loc, ds, settings){
  if(!ds||!ds.loaded) return null;
  const t=(ds.targets&&ds.targets[loc])||DEFAULT_TARGETS[loc]||{};
  const today=new Date();
  const mk=(weeks)=>new Date(today-weeks*7*864e5);
  const cut6w=mk(6),cut12w=mk(12),cut26w=mk(26),cut52w=mk(52),cutLY=mk(104);
  const results={};

  SMART_METRICS.forEach(function(metric){
    // Get rows for this metric's data source
    let allRows=[];
    if(metric.src==='ops')   allRows=(ds.opsRows||[]).filter(r=>r.loc===loc&&r.date>cutLY);
    else if(metric.src==='labor') allRows=(ds.laborRows||[]).filter(r=>r.loc===loc&&r.sales>0&&r.date>cutLY);
    else if(metric.src==='ctrl') allRows=(ds.ctrlRows||[]).filter(r=>r.loc===loc&&r.date>cutLY);
    else if(metric.src==='fob')  allRows=(ds.fobRows||[]).filter(r=>r.loc===loc&&r.date>cutLY);

    let vals6w=[],vals12w=[],vals26w=[],vals52w=[];

    if(metric.k==='salesGrowth'){
      allRows.filter(r=>r.date>cut26w).forEach(function(r){
        const ly=fetchLY(ds.laborIdx,ds.laborRows,loc,r.date,settings._userEvents)||0;
        if(ly>0&&r.sales>0){
          const g=(r.sales-ly)/ly*100;
          if(r.date>cut6w) vals6w.push(g);
          if(r.date>cut12w) vals12w.push(g);
          vals26w.push(g); vals52w.push(g);
        }
      });
    } else {
      allRows.forEach(function(r){
        const v=r[metric.field];
        if(typeof v!=='number'||v===0) return;
        if(r.date>cut6w) vals6w.push(v);
        if(r.date>cut12w) vals12w.push(v);
        if(r.date>cut26w) vals26w.push(v);
        if(r.date>cut52w) vals52w.push(v);
      });
    }

    const avg6w=trimmedMean(vals6w),avg12w=trimmedMean(vals12w);
    const avg26w=trimmedMean(vals26w),avg52w=trimmedMean(vals52w);
    const recent=avg6w||avg12w||avg26w||avg52w;

    const slope=trendSlope(vals26w);
    const improving=metric.dir==='lower'?slope<-0.005:slope>0.005;
    const declining=metric.dir==='lower'?slope>0.01:slope<-0.01;
    const trendLabel=improving?'↑ Improving':declining?'↓ Declining':'→ Stable';
    const trendColor=improving?'#10b981':declining?'#ef4444':'#94a3b8';

    const bestSust=bestSustained4wk(vals52w.length?vals52w:vals26w,metric.dir);
    const currentTarget=t[metric.tgtKey]||null;

    // Find comparable stores (same org, ±40% volume)
    const myAvgSales=(ds.laborRows||[]).filter(r=>r.loc===loc&&r.date>cut12w&&r.sales>0)
      .reduce((s,r,_,a)=>s+r.sales/a.length,0)||0;
    const compVals=[];
    (ds.storeIds||[]).filter(function(cl){
      return cl!==loc&&getStoreOrg(cl)===getStoreOrg(loc);
    }).forEach(function(cl){
      const cAvg=(ds.laborRows||[]).filter(r=>r.loc===cl&&r.date>cut12w&&r.sales>0)
        .reduce((s,r,_,a)=>s+r.sales/a.length,0)||0;
      if(myAvgSales>0&&Math.abs(cAvg-myAvgSales)/myAvgSales<0.40){
        let cRows=[];
        if(metric.src==='ops')   cRows=(ds.opsRows||[]).filter(r=>r.loc===cl&&r.date>cut12w);
        else if(metric.src==='labor') cRows=(ds.laborRows||[]).filter(r=>r.loc===cl&&r.sales>0&&r.date>cut12w);
        else if(metric.src==='ctrl') cRows=(ds.ctrlRows||[]).filter(r=>r.loc===cl&&r.date>cut12w);
        else if(metric.src==='fob')  cRows=(ds.fobRows||[]).filter(r=>r.loc===cl&&r.date>cut12w);
        const cV=metric.k==='salesGrowth'?[]:cRows.map(r=>r[metric.field]).filter(v=>typeof v==='number'&&v!==0);
        const cAvgM=trimmedMean(cV);
        if(cAvgM!==null) compVals.push(cAvgM);
      }
    });
    const compBest=compVals.length?(metric.dir==='lower'?Math.min.apply(null,compVals):Math.max.apply(null,compVals)):null;

    // Proposed yearly: anchor at best sustained + stretch toward best comparable
    // EXCEPTION: salesGrowth uses a realistic growth framework (not bestSust+stretch which produces 30-46%)
    let proposedYearly=null,yearlyReasoning='';
    if(recent!==null){
      if(metric.k==='salesGrowth'){
        // Realistic annual growth: trend-aware, capped at 15%, typical 2-8%
        const MAX_G=15,MIN_G=-5;
        const base=avg6w!=null?avg6w:(avg12w||0);
        const baseCapped=Math.min(MAX_G,Math.max(MIN_G,base));
        const trendAdj=improving?2:declining?-1:0.5;
        proposedYearly=roundTarget(Math.min(MAX_G,Math.max(MIN_G,baseCapped+trendAdj)),metric.tgtKey);
        yearlyReasoning='6W comp: '+(avg6w!=null?(avg6w>=0?'+':'')+avg6w.toFixed(1)+'%':'—')+
          ' | Trend adj: '+(trendAdj>=0?'+':'')+trendAdj.toFixed(1)+'% | Cap: '+MAX_G+'%';
      } else {
        const anchor=bestSust!==null?bestSust:recent;
        let stretched=anchor;
        if(compBest!==null){
          const gap=compBest-anchor;
          stretched=anchor+gap*0.30;
        }
        if(improving) stretched=metric.dir==='lower'?stretched*0.97:stretched*1.03;
        proposedYearly=metric.dir==='lower'?
          Math.min(stretched,recent*1.10):Math.max(stretched,recent*0.90);
        proposedYearly=roundTarget(proposedYearly,metric.tgtKey);
        yearlyReasoning='6W avg: '+metric.fmt(avg6w)+
          ' | Best sustained 4W: '+metric.fmt(bestSust)+
          (compBest?' | Best comparable: '+metric.fmt(compBest):'')+
          ' | Trend: '+trendLabel;
      }
    }

    // Proposed monthly: 18% step from current toward yearly
    let proposedMonthly=null,monthlyReasoning='';
    if(recent!==null&&proposedYearly!==null){
      proposedMonthly=roundTarget(recent+(proposedYearly-recent)*0.18,metric.tgtKey);
      monthlyReasoning='Current 6W: '+metric.fmt(recent)+
        ' → Monthly step (18% of gap): '+metric.fmt(proposedMonthly)+
        ' → Annual goal: '+metric.fmt(proposedYearly);
    }

    const confidence=vals12w.length>=20?'High':vals12w.length>=8?'Medium':'Low';
    results[metric.k]={
      metric,avg6w,avg12w,avg26w,avg52w,recent,bestSust,compBest,
      slope,trendLabel,trendColor,currentTarget,proposedMonthly,proposedYearly,
      yearlyReasoning,monthlyReasoning,confidence,sampleSize:vals12w.length
    };
  });
  return results;
}

// SMART TARGET PANEL — Interactive review/approve/export UI
function SmartTargetPanel({stores, ds, settings, onClose}) {
  const [mode,      setMode]      = React.useState('monthly'); // 'monthly'|'yearly'
  const [metricTab, setMetricTab] = React.useState('all');
  const [selLoc,    setSelLoc]    = React.useState(null);
  const [selMetric, setSelMetric] = React.useState(null);
  const [overrides, setOverrides] = React.useState({});  // {loc_metric: value}
  const [approved,  setApproved]  = React.useState({});  // {loc_metric: true}
  const [computing, setComputing] = React.useState(false);
  const [gridData,  setGridData]  = React.useState(null);

  // Metrics visible in current tab
  const activeMetrics = React.useMemo(()=>{
    const grp=METRIC_GROUPS.find(g=>g.id===metricTab);
    if(!grp||!grp.keys) return SMART_METRICS;
    return SMART_METRICS.filter(m=>grp.keys.includes(m.k));
  },[metricTab]);

  const allLocs = React.useMemo(()=>
    (stores||[]).filter(s=>/^\d+$/.test(s.loc)).sort((a,b)=>+a.loc-+b.loc).map(s=>s.loc)
  ,[stores]);

  // Compute targets for all stores
  React.useEffect(()=>{
    if(!ds||!ds.loaded) return;
    setComputing(true);
    setTimeout(function(){
      const g={};
      allLocs.forEach(function(loc){ g[loc]=computeSmartTargets(loc,ds,settings); });
      setGridData(g);
      setComputing(false);
    },50);
  },[ds,settings,allLocs.join(',')]);

  const getVal = (loc,mk)=>{
    const key=loc+'_'+mk;
    if(overrides[key]!=null) return overrides[key];
    const d=gridData&&gridData[loc]&&gridData[loc][mk];
    if(!d) return null;
    return mode==='monthly'?d.proposedMonthly:d.proposedYearly;
  };

  const approveAll = ()=>{
    const next={...approved};
    allLocs.forEach(loc=>SMART_METRICS.forEach(m=>{next[loc+'_'+m.k]=true;}));
    setApproved(next);
  };
  const approveLoc = (loc)=>{
    const next={...approved};
    SMART_METRICS.forEach(m=>{next[loc+'_'+m.k]=true;});
    setApproved(next);
  };

  const approvedCount=Object.values(approved).filter(Boolean).length;
  const totalCount=allLocs.length*SMART_METRICS.length;

  const selData = selLoc&&selMetric&&gridData&&gridData[selLoc]&&gridData[selLoc][selMetric];

  // Export helper - build CSV for current mode
  const exportCSV = ()=>{
    const hdr=['Loc','Org','Owner','Patch',...SMART_METRICS.map(m=>m.label+' (Proposed)'),
               ...SMART_METRICS.map(m=>m.label+' (Current)')];
    const rows=allLocs.map(loc=>{
      const s=(stores||[]).find(x=>x.loc===loc)||{};
      const proposedVals=SMART_METRICS.map(m=>getVal(loc,m.k)||'');
      const currentVals=SMART_METRICS.map(m=>{
        const d=gridData&&gridData[loc]&&gridData[loc][m.k];
        return d?d.currentTarget||'':'';
      });
      return [loc,s.org||'',s.owner||'',s.supervisor||'',...proposedVals,...currentVals];
    });
    const csv=[hdr,...rows].map(r=>r.join(',')).join('\n');
    const el=document.createElement('a');
    el.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv);
    el.download='SmartTargets_'+(mode==='monthly'?'Monthly':'Yearly2027')+'_'+
      new Date().toISOString().slice(0,10)+'.csv';
    el.click();
  };

  return div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.7)',zIndex:450,
    display:'flex',justifyContent:'flex-end'}},
    div({style:{flex:1},onClick:onClose}),
    div({style:{width:'92%',height:'100%',background:'var(--surf)',
      borderLeft:'.5px solid var(--bdr2)',display:'flex',flexDirection:'column',
      boxShadow:'-20px 0 60px rgba(0,0,0,.5)'}},

      // Header
      div({style:{padding:'12px 20px',borderBottom:'.5px solid var(--bdr)',
        display:'flex',alignItems:'center',gap:12,flexShrink:0,background:'var(--surf2)'}},
        div(null,
          div({style:{fontSize:'14px',fontWeight:800,color:'var(--amber)',letterSpacing:'-.2px'}},
            '🎯 Smart Target Engine'),
          div({style:{fontSize:'9px',color:'var(--text3)',marginTop:2}},
            computing?'Computing targets from historical data...'
            :gridData?approvedCount+'/'+totalCount+' fields approved · Analyzing '+allLocs.length+' locations'
            :'Load data to generate targets')
        ),
        // Mode toggle
        div({style:{display:'flex',gap:0,border:'.5px solid var(--bdr)',borderRadius:'var(--r)',
          overflow:'hidden',marginLeft:'auto'}},
          ['monthly','yearly'].map(m=>btn({key:m,onClick:()=>setMode(m),
            style:{padding:'5px 14px',fontSize:'9px',fontWeight:600,border:'none',
              background:mode===m?'var(--amber)':' var(--surf)',
              color:mode===m?'#000':'var(--text3)',cursor:'pointer'}},
            m==='monthly'?'📅 Monthly (Next)':'📅 Yearly (2027)'))
        ),
        btn({className:'btn btn-sm btn-a',onClick:approveAll},'✓ Approve All'),
        btn({className:'btn btn-sm',onClick:exportCSV},'⬇ Export CSV'),
        btn({className:'btn btn-sm',onClick:onClose},'✕')
      ),

      // Legend
      div({style:{padding:'5px 20px',borderBottom:'.5px solid var(--bdr)',
        display:'flex',gap:16,fontSize:'8px',color:'var(--text3)',flexShrink:0}},
        div(null,'🟢 Approved'),
        div(null,'🟡 Pending review'),
        div(null,'✏️ Manually overridden'),
        div(null,'⚪ No data'),
        div({style:{marginLeft:'auto',fontStyle:'italic'}},
          mode==='monthly'?'Proposed = current 6W avg + 18% step toward yearly goal'
          :'Proposed = best sustained 4W + 30% stretch toward best comparable store')
      ),

      // Metric category tabs
      div({style:{padding:'6px 20px',borderBottom:'.5px solid var(--bdr)',
        display:'flex',gap:4,flexShrink:0,background:'var(--surf)'}},
        METRIC_GROUPS.map(g=>btn({key:g.id,
          onClick:()=>setMetricTab(g.id),
          style:{padding:'3px 10px',fontSize:'9px',fontWeight:600,borderRadius:'var(--r)',
            border:'.5px solid '+(metricTab===g.id?'rgba(245,158,11,.5)':'var(--bdr)'),
            background:metricTab===g.id?'var(--adim)':'transparent',
            color:metricTab===g.id?'var(--amber)':'var(--text3)',cursor:'pointer'}},g.label))
      ),

      // Main layout: grid + detail panel
      div({style:{display:'flex',flex:1,overflow:'hidden'}},

        // LEFT: Store × Metric grid
        div({style:{flex:1,overflowY:'auto',overflowX:'auto'}},
          computing&&div({style:{padding:40,textAlign:'center',color:'var(--text3)',
            fontSize:'11px'}},'Computing data-driven targets for all 27 stores…'),

          !computing&&gridData&&h('table',{style:{borderCollapse:'collapse',
            fontSize:'9px',width:'100%',minWidth:800}},
            // Header row
            h('thead',null,
              h('tr',null,
                h('th',{style:{padding:'6px 10px',background:'var(--surf3)',
                  borderBottom:'.5px solid var(--bdr)',position:'sticky',top:0,left:0,
                  zIndex:3,fontWeight:700,textAlign:'left',fontSize:'8px',
                  color:'var(--text3)',minWidth:150}},'Store'),
                ...activeMetrics.map(m=>h('th',{key:m.k,style:{
                  padding:'6px 8px',background:'var(--surf3)',
                  borderBottom:'.5px solid var(--bdr)',position:'sticky',top:0,
                  zIndex:2,fontWeight:700,textAlign:'center',fontSize:'8px',
                  color:'var(--text3)',minWidth:90,whiteSpace:'nowrap'}},
                  m.label)),
                h('th',{style:{padding:'6px 8px',background:'var(--surf3)',
                  borderBottom:'.5px solid var(--bdr)',position:'sticky',top:0,
                  zIndex:2,width:60}})
              )
            ),
            h('tbody',null, allLocs.map(function(loc){
              const locData=gridData[loc]||{};
              const store=(stores||[]).find(s=>s.loc===loc)||{};
              const locApproved=activeMetrics.every(m=>approved[loc+'_'+m.k]);
              return h('tr',{key:loc,
                style:{borderBottom:'.5px solid rgba(255,255,255,.04)',
                  background:selLoc===loc?'var(--adim)':'transparent'}},
                // Store name cell
                h('td',{style:{padding:'5px 10px',position:'sticky',left:0,
                  background:selLoc===loc?'var(--adim)':'var(--surf)',
                  borderRight:'.5px solid var(--bdr)',zIndex:1,cursor:'pointer'},
                  onClick:()=>setSelLoc(selLoc===loc?null:loc)},
                  div({style:{fontWeight:600,color:'var(--text)',fontSize:'9px'}},
                    sNameC(loc)),
                  div({style:{fontSize:'7px',color:'var(--text3)',marginTop:1}},
                    store.supervisor||store.patch||'')
                ),
                // Metric cells
                ...activeMetrics.map(function(m){
                  const d=locData[m.k];
                  const key=loc+'_'+m.k;
                  const isApproved=approved[key];
                  const isOverride=overrides[key]!=null;
                  const val=getVal(loc,m.k);
                  const hasData=d&&d.recent!=null;
                  const bg=isApproved?'rgba(16,185,129,.1)':
                    isOverride?'rgba(245,158,11,.1)':'transparent';
                  return h('td',{key:m.k,
                    style:{padding:'4px 6px',textAlign:'center',cursor:'pointer',
                      background:bg,
                      border:selLoc===loc&&selMetric===m.k?'1px solid var(--amber)':'1px solid transparent'},
                    onClick:function(){setSelLoc(loc);setSelMetric(m.k);}},
                    hasData?div(null,
                      // Proposed value (editable inline)
                      h('input',{
                        value:isOverride?overrides[key]:(val!=null?val:''),
                        onChange:function(e){
                          const v=parseFloat(e.target.value);
                          if(!isNaN(v)){
                            setOverrides(prev=>({...prev,[key]:v}));
                          } else if(e.target.value===''){
                            setOverrides(prev=>{const n={...prev};delete n[key];return n;});
                          }
                        },
                        style:{width:'70px',textAlign:'center',
                          background:'transparent',border:'none',
                          color:isApproved?'#10b981':isOverride?'#f59e0b':'var(--text)',
                          fontFamily:'var(--mono)',fontSize:'9px',fontWeight:700,
                          outline:'none',cursor:'text'}
                      }),
                      // Trend indicator
                      div({style:{fontSize:'7px',color:d.trendColor,marginTop:1}},
                        d.trendLabel+' | '+d.confidence)
                    ):div({style:{color:'var(--text3)',fontSize:'8px'}},'—')
                  );
                }),
                // Approve row button
                h('td',{style:{padding:'4px 6px',textAlign:'center'}},
                  btn({className:'btn btn-sm',
                    style:{fontSize:'7px',padding:'2px 6px',
                      background:locApproved?'rgba(16,185,129,.2)':'var(--surf2)',
                      color:locApproved?'#10b981':'var(--text3)'},
                    onClick:()=>approveLoc(loc)},
                    locApproved?'✓':'Approve')
                )
              );
            }))
          )
        ),

        // RIGHT: Detail panel for selected cell
        selData&&div({style:{width:300,flexShrink:0,borderLeft:'.5px solid var(--bdr)',
          overflowY:'auto',background:'var(--surf2)'}},
          div({style:{padding:16}},
            div({style:{fontSize:'8px',fontWeight:700,letterSpacing:'.5px',
              textTransform:'uppercase',color:'var(--amber)',marginBottom:4}},
              (STORE_NAMES[selLoc]||selLoc)+' · '+selData.metric.label),

            // Stat tiles
            ...[
              ['6W Avg', selData.metric.fmt(selData.avg6w), '#60a5fa'],
              ['12W Avg', selData.metric.fmt(selData.avg12w), '#94a3b8'],
              ['Best 4W', selData.metric.fmt(selData.bestSust), '#10b981'],
              ['Comparable Best', selData.metric.fmt(selData.compBest), '#f59e0b'],
              ['Current Target', selData.metric.fmt(selData.currentTarget), '#e2e8f0'],
            ].map(([lbl,val,col])=>div({key:lbl,style:{
              display:'flex',justifyContent:'space-between',alignItems:'center',
              padding:'5px 8px',marginBottom:3,background:'rgba(255,255,255,.04)',
              borderRadius:'var(--r)'}},
              span({style:{fontSize:'8px',color:'var(--text3)'}},'lbl'),
              span({style:{fontSize:'9px',fontWeight:700,color:col,
                fontFamily:'var(--mono)'}},val)
            )),

            div({style:{height:1,background:'var(--bdr)',margin:'8px 0'}}),

            // Proposed targets
            div({style:{padding:'8px',background:'rgba(16,185,129,.08)',
              borderRadius:'var(--r)',border:'.5px solid rgba(16,185,129,.2)',
              marginBottom:8}},
              div({style:{fontSize:'8px',fontWeight:700,color:'#10b981',marginBottom:4}},
                'PROPOSED '+mode.toUpperCase()),
              div({style:{fontSize:'12px',fontWeight:800,color:'#10b981',
                fontFamily:'var(--mono)'}},
                selData.metric.fmt(getVal(selLoc,selData.metric.k))),
              div({style:{fontSize:'8px',color:'var(--text3)',marginTop:4,lineHeight:1.6}},
                mode==='monthly'?selData.monthlyReasoning:selData.yearlyReasoning)
            ),

            div({style:{fontSize:'8px',color:'var(--text3)',lineHeight:1.6,
              fontStyle:'italic'}},selData.metric.desc),

            div({style:{height:1,background:'var(--bdr)',margin:'8px 0'}}),

            // Approve / override actions
            div({style:{display:'flex',gap:6}},
              btn({className:'btn btn-sm btn-a',
                style:{flex:1,fontSize:'8px'},
                onClick:()=>setApproved(p=>({...p,[selLoc+'_'+selMetric]:true}))},
                approved[selLoc+'_'+selMetric]?'✓ Approved':'Approve'),
              btn({className:'btn btn-sm',
                style:{fontSize:'8px'},
                onClick:()=>{
                  setOverrides(p=>{const n={...p};delete n[selLoc+'_'+selMetric];return n;});
                  setApproved(p=>{const n={...p};delete n[selLoc+'_'+selMetric];return n;});
                }},'Reset')
            )
          )
        )
      )
    )
  );
}

export { computeSmartTargets, SmartTargetPanel };
