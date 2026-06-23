// @ts-nocheck
import { addD, dKey } from '../utils/date.js';
import { fetchRow, fetchWx, getForecastWeather, forecastDay } from '../engine/forecast.js';
import { DEFAULT_TARGETS, STORE_NAMES, STORE_COORDS, DOW_BASE } from '../constants.js';

const h = React.createElement;
const a = (p, ...c) => h('a', p, ...c);
function crossStoreCheck(loc, ds, missDate, missDir) {
  if(!ds||!ds.loaded||!ds.laborRows) return null;
  const dk = dKey(missDate);
  const dow = missDate.getDay();
  const allLocs = ds.storeIds||Object.keys(DEFAULT_TARGETS);
  const results = [];
  for(const otherLoc of allLocs) {
    if(otherLoc===loc) continue;
    const actual = fetchRow(ds.laborIdx, otherLoc, missDate, 'sales');
    if(!actual||actual<=0) continue;
    // Compute that store DOW baseline
    const peers = ds.laborRows.filter(row=>row.loc===otherLoc&&row.date.getDay()===dow&&row.sales>0);
    if(peers.length<4) continue;
    const mean = peers.reduce((a,p)=>a+p.sales,0)/peers.length;
    const std  = Math.sqrt(peers.reduce((a,p)=>a+(p.sales-mean)**2,0)/peers.length);
    const z    = std>0?(actual-mean)/std:0;
    if((missDir==='over'&&z<-1.2)||(missDir==='under'&&z>1.2)||Math.abs(z)>=1.5) {
      results.push({loc:otherLoc,name:STORE_NAMES[otherLoc]||otherLoc,z:+z.toFixed(2),actual,mean:Math.round(mean),sameDir:(missDir==='over'&&z<-1.2)||(missDir==='under'&&z>1.2)});
    }
  }
  const sameDir = results.filter(r=>r.sameDir);
  return {all:results, sameDir, total:allLocs.length-1};
}

// ── AI-powered event lookup ──────────────────
// Calls Anthropic API to search for what might have happened on a specific date
// in Oklahoma that could explain a district-wide sales anomaly
async function lookupMissEvent(date, affectedStores, wRow, setResult, affectedLocs) {
  const apiKey=(()=>{try{return localStorage.getItem('mf_anthropic_key')||'';}catch{return '';}})();
  const dateStr=date.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'});
  const wxNote=wRow?'Weather: '+Math.round(wRow.tmax||0)+'F hi, rain '+((wRow.rain||0).toFixed(2))+'in, wind '+(wRow.wmax||0)+'mph':'No weather data.'
  const thisCoord=STORE_COORDS[loc]||{};
  const thisCity=thisCoord.city||'Oklahoma';
  const affectedCities=affectedLocs&&affectedLocs.length
    ?[...new Set([thisCity,...affectedLocs.map(l=>(STORE_COORDS[l.loc]||{}).city||l.name.split(' ')[0]).filter(Boolean)])].slice(0,8)
    :[thisCity];
  const cityList=affectedCities.join(', ');
  const firstLoc=typeof affectedStores==='string'?affectedStores.split(',')[0]:String(affectedStores||loc||'');
  const storeCoords=STORE_COORDS[firstLoc]||STORE_COORDS[loc]||{};
  const stateStr=storeCoords.state||'Oklahoma';
  const isFL=stateStr==='FL';
  const regionNote=(affectedCities.length>3?'Multiple stores affected.':'Isolated to 1-2 stores — likely local.')
    +' '+(isFL?'Florida Panhandle region.':'South-central Oklahoma.');
  const searchCity=affectedCities[0];
  const searchUrl='https://www.google.com/search?q='+encodeURIComponent('"'+date.toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})+' '+searchCity+' '+stateStr+' weather OR event OR closed OR news')
  // Build prompt
  const prompt='You are a McDonald\'s district analytics assistant. A sales anomaly was detected in '+cityList+' on '+dateStr+'.\n\n'+wxNote+'\n'+regionNote+'\n\nSearch for local news, severe weather, events, road closures, or disruptions on '+dateStr+' in '+stateStr+'. Provide 2-3 sentence summary. If nothing relevant found, say so.'
  if(!apiKey){
    window.open(searchUrl,'_blank');
    setResult({loading:false,text:'',searchUrl,error:'No Anthropic API key — opened Google search instead.\n\nTo enable AI Lookup:\n1. Settings \u2192 AI & Integrations\n2. Paste your Anthropic API key\n3. Get one free at console.anthropic.com'});
    return;
  }
  try{
    setResult({loading:true,text:'',error:null,searchUrl});
    const res=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
      body:JSON.stringify({
        model:'claude-haiku-4-5-20251001',
        max_tokens:1024,
        tools:[{type:'web_search_20250305',name:'web_search'}],
        messages:[{role:'user',content:prompt}]
      })});
    if(!res.ok){const err=await res.json().catch(()=>({}));throw new Error((err.error&&err.error.message)||'HTTP '+res.status);}
    const data=await res.json();
    const text=(data.content||[])
      .filter(b=>b.type==='text'&&b.text&&b.text.trim())
      .map(b=>b.text.trim()).join('\n\n')||
      ((data.content||[]).some(b=>b.type==='tool_use')?'Web search ran but no summary was generated. Try again.':'No analysis generated.');
    setResult({loading:false,text,error:null,searchUrl});
  }catch(e){
    setResult({loading:false,text:'',error:'AI lookup failed: '+e.message,searchUrl});
  }
}

function diagnoseMiss(loc, ds, userEvents, r) {
  if(!r) return [];
  const causes=[];
  const missDir=r.actual>r.forecast?'under':'over';
  const missPct=Math.abs(r.varPct||0)*100;
  const ev=userEvents&&userEvents[loc]&&userEvents[loc][dKey(r.date)];

  // ── 1. Event tag ─────────────────────────
  if(ev) causes.push({icon:'📌',color:'#a5b4fc',weight:'PRIMARY',
    text:'Tagged event: '+ev.label+(ev.note?' — '+ev.note:'')+'. '+(missDir==='under'?'Event likely drove incremental sales above baseline.':'Event suppressed sales below model baseline.')});

  // ── 2. Cross-store correlation ────────────
  const cross = crossStoreCheck(loc, ds, r.date, missDir);
  if(cross&&cross.sameDir.length>=2) {
    const pct = Math.round(cross.sameDir.length/cross.total*100);
    const names = cross.sameDir.slice(0,4).map(s=>s.name.split(' ')[0]).join(', ')+(cross.sameDir.length>4?' +more':'');
    const severity = cross.sameDir.length>=8?'DISTRICT-WIDE':cross.sameDir.length>=4?'MULTI-STORE':'REGIONAL';
    causes.push({icon:'🏪',color:cross.sameDir.length>=8?'#ef4444':cross.sameDir.length>=4?'#f97316':'#f59e0b',
      weight:severity, crossData:cross, missDate:r.date, missDir,
      text:cross.sameDir.length+' of '+cross.total+' other stores ('+pct+'%) also showed '+(missDir==='over'?'below-normal':'above-normal')+' sales on this date ('+names+'). This is almost certainly a district-wide or regional event, NOT a store-specific issue. Use AI Lookup below to identify the cause.'});
  } else if(cross&&cross.sameDir.length===1) {
    causes.push({icon:'🏪',color:'#94a3b8',weight:'NOTE',
      text:'1 other store showed a similar pattern on this date ('+cross.sameDir[0].name+'). May be coincidence or a localized event affecting nearby stores.'});
  }

  // ── 3. Weather ────────────────────────────
  const wAdj=r.wAdj||0;
  const wRow=(fetchWx(ds,r.date))||getForecastWeather(loc,r.date);
  if(Math.abs(wAdj)>0.015){
    const rain=wRow?wRow.rain||0:0;const tmax=wRow?wRow.tmax||0:0;
    const wxDesc=rain>1.5?'heavy rain ('+rain.toFixed(1)+'")':rain>0.25?'rain ('+rain.toFixed(1)+'")':tmax>100?'extreme heat ('+tmax+'F)':tmax>95?'very hot ('+tmax+'F)':tmax<28?'freezing ('+tmax+'F)':tmax<35?'very cold ('+tmax+'F)':wind>30?'high winds ('+wind+'mph)':''
    const mismatch=(missDir==='under'&&wAdj<0)||(missDir==='over'&&wAdj>0);
    causes.push({icon:'🌦',color:'#93c5fd',weight:mismatch?'PRIMARY':'CONTRIBUTING',
      text:'Weather adj: '+(wAdj*100>0?'+':'')+(wAdj*100).toFixed(1)+'% for '+wxDesc+'. '+(mismatch?'Weather impact exceeded model estimate.':'Weather model aligned but other factors drove miss.')});
  } else if(wRow&&wRow.rain>1.0) {
    causes.push({icon:'🌧',color:'#93c5fd',weight:'CONTRIBUTING',
      text:'Rain detected ('+wRow.rain.toFixed(1)+'in): model note — minimal weather adjustment applied. Calibrate weather coefficients if needed.'});
  }

  // ── 4. Ops factor ─────────────────────────
  const opsFactor=r.opsFactor||1;
  if(Math.abs(opsFactor-1)>0.02) causes.push({icon:'⚙️',color:'#f59e0b',weight:'CONTRIBUTING',
    text:'Ops factor: '+(opsFactor>=1?'+':'')+((opsFactor-1)*100).toFixed(1)+'% on this date. '+(
      opsFactor<1&&r.actual<r.forecast?'Below-average execution likely suppressed transactions — ops drag aligned with the miss.':
      opsFactor<1&&r.actual>r.forecast?'Despite ops headwinds ('+((opsFactor-1)*100).toFixed(1)+'% drag), crew outperformed the forecast — strong execution overcame model expectations.':
      opsFactor>=1&&r.actual>r.forecast?'Strong execution drove volume above the forecast.':
      'Favorable ops metrics, though actual came in below forecast — other factors may have offset the advantage.'
    )});

  // ── 5. Trend divergence ───────────────────
  if(Math.abs((r.t2||0)-(r.t6||0))>0.04) causes.push({icon:'📈',color:'#84cc16',weight:'CONTRIBUTING',
    text:'Trend divergence: T2W='+(((r.t2||0)*100)>0?'+':'')+((r.t2||0)*100).toFixed(1)+'% vs T6W='+(((r.t6||0)*100)>0?'+':'')+((r.t6||0)*100).toFixed(1)+'%. Blended forecast carries higher uncertainty when short and long trend windows disagree.'});

  // ── 6. No LY data ─────────────────────────
  if(r.noLYData) causes.push({icon:'📂',color:'#94a3b8',weight:'PRIMARY',
    text:'No last-year baseline for this date. District averages substituted. New store projections have higher variance until 12+ months of history exist.'});

  // ── 7. Single-store anomaly ───────────────
  if(ds&&ds.loaded&&missPct>8&&!r.noLYData&&(!cross||cross.sameDir.length<2)){
    const dow=r.date.getDay();
    const peers=ds.laborRows.filter(row=>row.loc===loc&&row.date.getDay()===dow&&row.sales>0);
    if(peers.length>=5){
      const mean=peers.reduce((a,p)=>a+p.sales,0)/peers.length;
      const std=Math.sqrt(peers.reduce((a,p)=>a+(p.sales-mean)**2,0)/peers.length);
      const z=std>0?(r.actual-mean)/std:0;
      if(Math.abs(z)>=2.0) causes.push({icon:'🔍',color:Math.abs(z)>=3?'#ef4444':'#f97316',weight:'PRIMARY',
        text:'Store-specific anomaly: actual was '+(z>0?'+':'')+z.toFixed(1)+'σ from normal '+DOW_BASE[dow]+' baseline ($'+Math.round(r.actual).toLocaleString()+' vs avg $'+Math.round(mean).toLocaleString()+'). Isolated to this store — check staffing, equipment, or local events on that date.'+((!ev&&!cross)||cross.sameDir.length<2?' Consider tagging in Event Calendar.':'')});
    }
  }

  // ── 8. Fallback ───────────────────────────
  if(causes.length===0) causes.push({icon:'❓',color:'#64748b',weight:'UNKNOWN',
    text:'No dominant signal. Weather neutral, ops near baseline, trends aligned, no cross-store correlation. Likely random variance. Tag in Event Calendar if cause is known.'});
  return causes;
}


// ════════════════════════════════════════════════════════════════════════════════
// WHY ENGINE  (v4.201 — Engine 2)
// ════════════════════════════════════════════════════════════════════════════════
// Systematizes miss attribution: takes the already-trusted qualitative
// diagnosis (diagnoseMiss, above) and the forecast's own multiplicative
// factor chain, and runs them across every day in a window for every store —
// turning "explain this one bad day someone clicked into" into "show me my
// district's systemic miss patterns over time."
//
// Two complementary layers, kept deliberately separate rather than forced
// into one number:
//   COMPOSITION (new, exact algebra) — how many dollars of TODAY'S FORECAST
//     came from the weather/ops/trend/event adjustments. This is pure,
//     unambiguous decomposition of forecastDay's own multiplicative chain
//     (forecast = lyAdjH × opsFactor × (1+wAdj) × (1+trendFactor) ×
//     (1+evFactor) × (1+plusUp)) — it describes how the forecast was BUILT,
//     not a claim about why it missed.
//   DIAGNOSIS (existing, reused via diagnoseMiss) — the qualitative causes:
//     event tags, cross-store correlation, weather/ops mismatch, anomaly
//     z-scores. This is what explains WHY actual diverged from forecast.
// Kept separate because conflating "composition of the forecast" with
// "explanation of the miss" risks false precision — the existing mismatch
// logic in diagnoseMiss is the trusted source for directional causation;
// composition is purely descriptive arithmetic layered alongside it.
// ─────────────────────────────────────────────────────────────────────────────

// Decompose one forecastDay() result into its dollar-quantified factors.
// Exact algebra given the known multiplicative chain — for factor x where
// forecast includes a (1+x) multiplier, the dollar contribution of that
// factor is forecast × x/(1+x) (i.e. forecast minus what forecast would be
// with that one factor removed, holding the others fixed).
function computeForecastComposition(r){
  if(!r||!r.forecast) return null;
  const f = r.forecast;
  const wAdj = r.wAdj||0;
  const opsFactor = r.opsFactor!=null?r.opsFactor:1;
  const trendFactor = r.trendFactor||0;
  const evFactor = r._evFactor||0;
  const weatherDollars = f * (wAdj/(1+wAdj));
  const opsDollars     = f * ((opsFactor-1)/Math.max(opsFactor,0.01));
  const trendDollars   = f * (trendFactor/(1+trendFactor));
  const eventDollars   = f * (evFactor/(1+evFactor));
  const baseDollars    = f - weatherDollars - opsDollars - trendDollars - eventDollars;
  return {
    forecast:f, base:baseDollars,
    weatherDollars, opsDollars, trendDollars, eventDollars,
    weatherPct: f?weatherDollars/f*100:0, opsPct: f?opsDollars/f*100:0,
    trendPct: f?trendDollars/f*100:0, eventPct: f?eventDollars/f*100:0,
  };
}

// Classify a day's diagnoseMiss() causes into one bucket — used to track,
// in aggregate, what SHARE of a store's misses are explained by something
// already in the system (event tag, regional pattern) versus genuinely
// unexplained (a real calibration gap, not just missing context).
function classifyMissCauses(causes){
  if(!causes||!causes.length) return 'unexplained';
  if(causes.some(c=>c.text&&c.text.startsWith('Tagged event'))) return 'event';
  if(causes.some(c=>c.weight==='DISTRICT-WIDE'||c.weight==='MULTI-STORE'||c.weight==='REGIONAL')) return 'regional';
  if(causes.some(c=>c.weight==='PRIMARY'&&c.text&&c.text.includes('Weather'))) return 'weather';
  if(causes.some(c=>c.weight==='PRIMARY'&&c.text&&c.text.includes('Store-specific anomaly'))) return 'isolated_anomaly';
  if(causes.some(c=>c.weight==='UNKNOWN')) return 'unexplained';
  return 'contributing_factors'; // has some signal (ops/trend) but no dominant cause
}

// ── Single-store scan: run composition + diagnosis across a window ─────────
function runWhyEngineScan(loc, ds, userEvents, settings, weeksBack=8){
  if(!ds||!ds.laborRows) return null;
  const anchor = (ds.lastActual&&ds.lastActual[loc]) || addD(new Date(),-1);
  const cutoff = addD(anchor, -weeksBack*7);
  const days=[]; let d=new Date(cutoff);
  while(d<=anchor){ days.push(new Date(d)); d=addD(d,1); }

  const rows = days.map(dt=>{
    const r = forecastDay(loc, dt, ds, settings, null, null);
    if(!r||r.isFuture||!r.actual||r.actual<=0||!r.forecast) return null;
    const comp = computeForecastComposition(r);
    const causes = diagnoseMiss(loc, ds, userEvents, r);
    const bucket = classifyMissCauses(causes);
    const missPct = (r.actual-r.forecast)/r.actual*100;
    const missDollars = r.actual - r.forecast;
    return {date:dt, dow:dt.getDay(), r, comp, causes, bucket, missPct, missDollars};
  }).filter(Boolean);

  if(!rows.length) return null;

  const n = rows.length;
  const mape = rows.reduce((a,x)=>a+Math.abs(x.missPct),0)/n;
  const avgComp = (key)=> rows.reduce((a,x)=>a+(x.comp?x.comp[key]:0),0)/n;

  // DOW pattern: average abs miss % by day of week
  const dowStats = Array.from({length:7},(_,dow)=>{
    const dayRows = rows.filter(x=>x.dow===dow);
    if(!dayRows.length) return {dow, n:0, avgAbsMissPct:null};
    return {dow, n:dayRows.length,
      avgAbsMissPct: dayRows.reduce((a,x)=>a+Math.abs(x.missPct),0)/dayRows.length};
  });
  const worstDOW = dowStats.filter(d=>d.n>=2).sort((a,b)=>(b.avgAbsMissPct||0)-(a.avgAbsMissPct||0))[0]||null;

  // Bucket counts — what share of misses are explained vs not
  const bucketCounts = {};
  rows.forEach(x=>{ bucketCounts[x.bucket]=(bucketCounts[x.bucket]||0)+1; });
  const explainedN = n - (bucketCounts.unexplained||0) - (bucketCounts.contributing_factors||0);
  const explainedPct = n ? explainedN/n*100 : 0;

  // Worst misses (by absolute dollar gap), capped to top 10 for the UI
  const worst = [...rows].sort((a,b)=>Math.abs(b.missDollars)-Math.abs(a.missDollars)).slice(0,10);

  return {
    loc, n, mape:+mape.toFixed(1), weeksBack,
    avgWeatherDollars:avgComp('weatherDollars'), avgOpsDollars:avgComp('opsDollars'),
    avgTrendDollars:avgComp('trendDollars'), avgEventDollars:avgComp('eventDollars'),
    dowStats, worstDOW, bucketCounts, explainedPct:+explainedPct.toFixed(0),
    worst, rows,
  };
}

// ── District batch: run the scan for every store, sequential + paced ───────
async function runWhyEngineDistrict(stores, ds, userEvents, settings, weeksBack, onProgress){
  const LOCS = (stores||[]).map(s=>s.loc);
  const results = {};
  for(let i=0;i<LOCS.length;i++){
    const loc = LOCS[i];
    if(onProgress) onProgress({done:i, total:LOCS.length, storeName:STORE_NAMES[loc]||loc});
    results[loc] = runWhyEngineScan(loc, ds, userEvents, settings, weeksBack);
    if(i%4===3) await new Promise(r=>setTimeout(r,0)); // yield periodically, this is CPU-bound not network
  }
  if(onProgress) onProgress({done:LOCS.length, total:LOCS.length, storeName:'Done'});
  return results;
}

export {
  crossStoreCheck, lookupMissEvent, diagnoseMiss,
  computeForecastComposition, classifyMissCauses,
  runWhyEngineScan, runWhyEngineDistrict,
};
