// @ts-nocheck
import * as React from 'react';
import { STORE_NAMES, sName, DEFAULT_TARGETS, DOW_BASE, DEF_SETTINGS, STORE_COORDS } from '../constants.js';
import { addD, dKey, sodOf, eodOf, fmtDI } from '../utils/date.js';
import { forecastDay, forecastRange, effectivePlusUp, modelAccuracy, modelHealthScore, _wxCache } from '../engine/forecast.js';
import { analyzeRegisterAudit } from '../utils/register-audit.js';
import { OpsBarChart, CompareRadarChart, CompareLineChart } from './store-dash.js';
import { TH, f$, fPct, fP, grade } from '../utils/fmt.js';

const h=React.createElement;
const div=(p,...c)=>h('div',p,...c);
const span=(p,...c)=>h('span',p,...c);
const btn=(p,...c)=>h('button',p,...c);
const tr=(p,...c)=>h('tr',p,...c);
const td=(p,...c)=>h('td',p,...c);
const th=(p,...c)=>h('th',p,...c);
const tbl=(p,...c)=>h('table',p,...c);
const thead=(p,...c)=>h('thead',p,...c);
const tbody=(p,...c)=>h('tbody',p,...c);
const sel=(p,...c)=>h('select',p,...c);
const opt=(p,...c)=>h('option',p,...c);
const inp=(p,...c)=>h('input',p,...c);
const { useState, useEffect, useRef, useMemo, useCallback } = React;

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

export { AnomalyPanel, ShiftAnalysisTab, ModelComparisonPanel, RevenueIntelligence, RegisterAuditTab, StoreDash, StoreRecordsTab, MultiStoreComparison };
