// @ts-nocheck
import * as React from 'react';
import { addD, dKey } from '../utils/date.js';
import { fetchWx, getForecastWeather, forecastDay, InfoIcon } from '../engine/forecast.js';
import { metricDaily, metricSeries } from '../engine/metric-source.js';
import { DEFAULT_TARGETS, STORE_NAMES, STORE_COORDS, DOW_BASE } from '../constants.js';
import { callSageOnce } from '../lib/sage-client.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);
const btn = (p, ...c) => h('button', p, ...c);

// Renders a cause's "learn more" row — the existing in-app KB article (cause.kbKey) plus an
// "Ask SAGE" button that seeds the pre-built, cause-specific question (cause.askPrompt) into
// SAGE via the same window.__MF_SAGE_SEED__ / 'mf:open-sage' convention eom-dashboard.js's own
// "Ask SAGE" buttons already use. One shared component so store-dash.js and analytics.js render
// this identically instead of each hand-rolling the same button twice.
function CauseLinks({cause}) {
  if(!cause.kbKey&&!cause.askPrompt) return null;
  return div({style:{display:'flex',alignItems:'center',gap:8,marginTop:4}},
    cause.kbKey&&h(InfoIcon,{articleKey:cause.kbKey,inline:true}),
    cause.askPrompt&&btn({
      onClick:()=>{
        try{
          window.__MF_SAGE_SEED__={context:cause.text,prompt:cause.askPrompt};
          window.dispatchEvent(new CustomEvent('mf:open-sage'));
        }catch{}
      },
      title:'Ask SAGE to dig deeper on this cause — it may search the QSRSoft KB, project notes, or live data',
      style:{background:'none',color:'var(--accent,#f5bc00)',border:'1px solid var(--accent,#f5bc00)',
        borderRadius:5,padding:'1px 7px',fontSize:9,fontWeight:700,cursor:'pointer',flexShrink:0}
    },'🧠 Ask SAGE'));
}

// ~14 same-DOW weeks -- matches the EWMA DOW forecast model's own established lookback
// convention (forecast.js's standalone EWMA model docs: "up to 14 most-recent same-DOW
// actuals"), not an invented window. Was an unbounded raw ds.laborRows scan.
const CROSS_STORE_LOOKBACK_DAYS = 98;

function crossStoreCheck(loc, ds, missDate, missDir) {
  if(!ds||!ds.loaded) return null;
  const dow = missDate.getDay();
  const allLocs = ds.storeIds||Object.keys(DEFAULT_TARGETS);
  // Bounded trailing window ending the day before the miss -- same auto-first `sales` resolver
  // (qsrActSummaryRows -> laborRows) used everywhere else, instead of a manual-only, unbounded
  // ds.laborRows filter with no fallback for a cloud-only store.
  const range = {s:addD(missDate,-CROSS_STORE_LOOKBACK_DAYS), e:addD(missDate,-1)};
  const results = [];
  for(const otherLoc of allLocs) {
    if(otherLoc===loc) continue;
    const actual = metricDaily(ds, otherLoc, missDate, 'sales');
    if(!actual||actual<=0) continue;
    // Compute that store's DOW baseline from the auto-first series, bucketed by day-of-week.
    // `T00:00:00` (not `Z`) parses the date-key in local time -- same pattern already proven in
    // store-analytics.js's ShiftAnalysisTab DOW bucketing fix, avoiding the UTC-vs-local
    // off-by-one a bare `new Date(dk)` would risk.
    const series = metricSeries(ds, otherLoc, range, 'sales');
    const peers = [];
    for(const dk in series) {
      if(new Date(dk+'T00:00:00').getDay()===dow && series[dk]>0) peers.push(series[dk]);
    }
    if(peers.length<4) continue;
    const mean = peers.reduce((a,p)=>a+p,0)/peers.length;
    const std  = Math.sqrt(peers.reduce((a,p)=>a+(p-mean)**2,0)/peers.length);
    const z    = std>0?(actual-mean)/std:0;
    if((missDir==='over'&&z<-1.2)||(missDir==='under'&&z>1.2)||Math.abs(z)>=1.5) {
      results.push({loc:otherLoc,name:STORE_NAMES[otherLoc]||otherLoc,z:+z.toFixed(2),actual,mean:Math.round(mean),sameDir:(missDir==='over'&&z<-1.2)||(missDir==='under'&&z>1.2)});
    }
  }
  const sameDir = results.filter(r=>r.sameDir);
  return {all:results, sameDir, total:allLocs.length-1};
}

// ── AI-powered event lookup ──────────────────
// Routed through sage-chat (web_search_20260209 server-side) to search for what
// might have happened on a specific date that could explain a district-wide sales anomaly
async function lookupMissEvent(date, affectedStores, wRow, setResult, affectedLocs) {
  const dateStr=date.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'});
  const wxNote=wRow?'Weather: '+Math.round(wRow.tmax||0)+'F hi, rain '+((wRow.rain||0).toFixed(2))+'in, wind '+(wRow.wmax||0)+'mph':'No weather data.'
  // Dispatch #72 C1 -- `loc` was read at three spots below without ever being a parameter of
  // this function. Its only real call site (store-dash.js:746) passes the caller's own `loc`
  // positionally as `affectedStores` -- `firstLoc` a few lines down was already deriving the
  // exact same value from `affectedStores`, just too late to help `thisCoord` above it and
  // still falling back to the nonexistent `loc`. Computed once, up front, from the one input
  // that actually carries it.
  const loc=typeof affectedStores==='string'?affectedStores.split(',')[0]:String(affectedStores||'');
  const thisCoord=STORE_COORDS[loc]||{};
  const thisCity=thisCoord.city||'Oklahoma';
  const affectedCities=affectedLocs&&affectedLocs.length
    ?[...new Set([thisCity,...affectedLocs.map(l=>(STORE_COORDS[l.loc]||{}).city||l.name.split(' ')[0]).filter(Boolean)])].slice(0,8)
    :[thisCity];
  const cityList=affectedCities.join(', ');
  const storeCoords=STORE_COORDS[loc]||{};
  const stateStr=storeCoords.state||'Oklahoma';
  const isFL=stateStr==='FL';
  const regionNote=(affectedCities.length>3?'Multiple stores affected.':'Isolated to 1-2 stores — likely local.')
    +' '+(isFL?'Florida Panhandle region.':'South-central Oklahoma.');
  const searchCity=affectedCities[0];
  const searchUrl='https://www.google.com/search?q='+encodeURIComponent('"'+date.toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})+' '+searchCity+' '+stateStr+' weather OR event OR closed OR news')
  // Build prompt
  const prompt='A sales anomaly was detected in '+cityList+' on '+dateStr+'.\n\n'+wxNote+'\n'+regionNote+'\n\nSearch for local news, severe weather, events, road closures, or disruptions on '+dateStr+' in '+stateStr+'. Provide 2-3 sentence summary. If nothing relevant found, say so.'
  try{
    setResult({loading:true,text:'',error:null,searchUrl});
    const text=await callSageOnce(
      [{role:'user', content:prompt}],
      'You are a McDonald\'s district analytics assistant. Use web search to find out what happened.',
    );
    setResult({loading:false,text:text||'No analysis generated.',error:null,searchUrl});
  }catch(e){
    setResult({loading:false,text:'',error:'AI lookup failed: '+e.message,searchUrl});
  }
}

// "Suggest where to look for more context on a finding, with links — even external" (owner,
// Notes 73 #4). Checked before building anything new: the in-app half already exists
// (KB_ARTICLES/InfoIcon, forecast.js) and the external half already exists too — SAGE's own
// search_qsr_kb (the real QSRSoft Help Center) + search_project_memory + its live data tools
// (query_labor_summary, query_forecast_snapshots, web_search). So each cause below gets a
// `kbKey` (an EXISTING KB article, never a new one written for this) for the quick in-app
// definition, and an `askPrompt` (a cause-specific question pre-seeded into SAGE via the same
// window.__MF_SAGE_SEED__/'mf:open-sage' convention eom-dashboard.js's "Ask SAGE" buttons
// already use) that lets SAGE itself decide which of its tools — including the external one —
// actually answers it. No parallel help mechanism; just wiring two that already exist onto causes.
function diagnoseMiss(loc, ds, userEvents, r) {
  if(!r) return [];
  const causes=[];
  const missDir=r.actual>r.forecast?'under':'over';
  const missPct=Math.abs(r.varPct||0)*100;
  const ev=userEvents&&userEvents[loc]&&userEvents[loc][dKey(r.date)];
  const storeName=STORE_NAMES[loc]||loc;
  const dateStr=r.date.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'});

  // ── 1. Event tag ─────────────────────────
  if(ev) causes.push({icon:'📌',color:'#a5b4fc',weight:'PRIMARY',
    text:'Tagged event: '+ev.label+(ev.note?' — '+ev.note:'')+'. '+(missDir==='under'?'Event likely drove incremental sales above baseline.':'Event suppressed sales below model baseline.'),
    remedy:'Already accounted for — no action needed. If this event recurs on a predictable schedule, make it a recurring Calendar rule so future forecasts adjust for it automatically instead of missing every time.',
    kbKey:'event_registry',
    askPrompt:'A "'+ev.label+'" event was tagged at '+storeName+' on '+dateStr+'. Search project memory and the QSRSoft KB for whether this event type has a known, learnable sales impact pattern we should be relying on instead of treating each occurrence as one-off.'});

  // ── 2. Cross-store correlation ────────────
  const cross = crossStoreCheck(loc, ds, r.date, missDir);
  if(cross&&cross.sameDir.length>=2) {
    const pct = (cross.sameDir.length/cross.total*100).toFixed(2);
    const names = cross.sameDir.slice(0,4).map(s=>s.name.split(' ')[0]).join(', ')+(cross.sameDir.length>4?' +more':'');
    const severity = cross.sameDir.length>=8?'DISTRICT-WIDE':cross.sameDir.length>=4?'MULTI-STORE':'REGIONAL';
    causes.push({icon:'🏪',color:cross.sameDir.length>=8?'#ef4444':cross.sameDir.length>=4?'#f97316':'#f59e0b',
      weight:severity, crossData:cross, missDate:r.date, missDir,
      text:cross.sameDir.length+' of '+cross.total+' other stores ('+pct+'%) also showed '+(missDir==='over'?'below-normal':'above-normal')+' sales on this date ('+names+'). This is almost certainly a district-wide or regional event, NOT a store-specific issue. Use AI Lookup below to identify the cause.',
      remedy:'Don’t hold this store’s manager accountable for it alone — a swing this wide across '+cross.sameDir.length+' stores is outside any one manager’s control. Confirm the cause with AI Lookup, then tag it once in Event Calendar so every affected store’s forecast corrects, not just this one.',
      kbKey:'why_engine_guide',
      askPrompt:cross.sameDir.length+' stores besides '+storeName+' ('+names+') showed the same '+(missDir==='over'?'below-normal':'above-normal')+' sales pattern on '+dateStr+'. Search for local news, weather, or events on that date that could explain a swing this wide across that many stores.'});
  } else if(cross&&cross.sameDir.length===1) {
    causes.push({icon:'🏪',color:'#94a3b8',weight:'NOTE',
      text:'1 other store showed a similar pattern on this date ('+cross.sameDir[0].name+'). May be coincidence or a localized event affecting nearby stores.',
      remedy:'Worth a quick check with that store’s manager — if you both confirm a shared cause (weather, a nearby closure), tag it in both stores’ calendars so neither forecast repeats the miss.',
      kbKey:'why_engine_guide',
      askPrompt:storeName+' and '+cross.sameDir[0].name+' both showed a similar sales pattern on '+dateStr+'. Search for local news or weather near both stores on that date that might tie them together.'});
  }

  // ── 3. Weather ────────────────────────────
  const wAdj=r.wAdj||0;
  const wRow=(fetchWx(ds,r.date))||getForecastWeather(loc,r.date);
  if(Math.abs(wAdj)>0.015){
    const rain=wRow?wRow.rain||0:0;const tmax=wRow?wRow.tmax||0:0;
    // Dispatch #72 B3 -- `wind` was a free variable; wRow's wind field is `wmax` (see line 39's
    // own 'wind '+(wRow.wmax||0)+'mph' a few lines up in this same file). Short-circuit-guarded
    // by the preceding ternary arms, so this only threw when rain/tmax fell through to the
    // wind branch.
    const wind=wRow?wRow.wmax||0:0;
    const wxDesc=rain>1.5?'heavy rain ('+rain.toFixed(1)+'")':rain>0.25?'rain ('+rain.toFixed(1)+'")':tmax>100?'extreme heat ('+tmax+'F)':tmax>95?'very hot ('+tmax+'F)':tmax<28?'freezing ('+tmax+'F)':tmax<35?'very cold ('+tmax+'F)':wind>30?'high winds ('+wind+'mph)':''
    const mismatch=(missDir==='under'&&wAdj<0)||(missDir==='over'&&wAdj>0);
    causes.push({icon:'🌦',color:'#93c5fd',weight:mismatch?'PRIMARY':'CONTRIBUTING',
      text:'Weather adj: '+(wAdj*100>0?'+':'')+(wAdj*100).toFixed(2)+'% for '+wxDesc+'. '+(mismatch?'Weather impact exceeded model estimate.':'Weather model aligned but other factors drove miss.'),
      remedy:mismatch
        ?'The model correctly flagged weather as a factor but undersized it. If this weather type keeps under-predicting at this store, flag it for a coefficient recalibration rather than treating each miss as a one-off.'
        :'Weather tracked as expected here — look at the other causes below for what actually drove the miss, not this one.',
      kbKey:'weather_adjustment',
      askPrompt:'Weather adjustment at '+storeName+' on '+dateStr+' was '+(wAdj*100).toFixed(2)+'% for '+(wxDesc||'weather')+((mismatch)?', which undersized the real impact':'')+'. Should this store\'s weather coefficients be recalibrated, and has this weather type undersized the forecast before at this store?'});
  } else if(wRow&&wRow.rain>1.0) {
    causes.push({icon:'🌧',color:'#93c5fd',weight:'CONTRIBUTING',
      text:'Rain detected ('+wRow.rain.toFixed(1)+'in): model note — minimal weather adjustment applied. Calibrate weather coefficients if needed.',
      remedy:'The model didn’t treat this rain as material. If rain this size reliably moves sales at this store, flag it so the weather sensitivity for this location gets recalibrated.',
      kbKey:'weather_adjustment',
      askPrompt:storeName+' got '+wRow.rain.toFixed(1)+'in of rain on '+dateStr+' but the model applied almost no weather adjustment. Has rain this size moved sales at this store historically, and should its weather sensitivity be recalibrated?'});
  }

  // ── 4. Ops factor ─────────────────────────
  const opsFactor=r.opsFactor||1;
  if(Math.abs(opsFactor-1)>0.02) causes.push({icon:'⚙️',color:'#f59e0b',weight:'CONTRIBUTING',
    text:'Ops factor: '+(opsFactor>=1?'+':'')+((opsFactor-1)*100).toFixed(2)+'% on this date. '+(
      opsFactor<1&&r.actual<r.forecast?'Below-average execution likely suppressed transactions — ops drag aligned with the miss.':
      opsFactor<1&&r.actual>r.forecast?'Despite ops headwinds ('+((opsFactor-1)*100).toFixed(2)+'% drag), crew outperformed the forecast — strong execution overcame model expectations.':
      opsFactor>=1&&r.actual>r.forecast?'Strong execution drove volume above the forecast.':
      'Favorable ops metrics, though actual came in below forecast — other factors may have offset the advantage.'
    ),
    remedy:
      opsFactor<1&&r.actual<r.forecast?'Check scheduling against actual punches for this date — thin staffing or a late open are the usual causes of an ops-drag day like this.':
      opsFactor<1&&r.actual>r.forecast?'The crew pushed through a tough staffing day and still beat the forecast — worth recognizing with the team, not flagging as a problem.':
      opsFactor>=1&&r.actual>r.forecast?'Strong crew performance — worth noting what the team did right (staffing level, speed) so it can be repeated.':
      'Execution was fine — look at the other causes below before assuming an ops problem on this date.',
    kbKey:'forecast_formula',
    askPrompt:'Pull the exact labor summary for '+storeName+' on '+dateStr+' — OT, Act-vs-Need staffing gap, OEPE/TPPH — and tell me whether staffing was the real driver of the '+(opsFactor<1?'ops drag':'ops lift')+' that day.'});

  // ── 5. Trend divergence ───────────────────
  if(Math.abs((r.t2||0)-(r.t6||0))>0.04) causes.push({icon:'📈',color:'#84cc16',weight:'CONTRIBUTING',
    text:'Trend divergence: T2W='+(((r.t2||0)*100)>0?'+':'')+((r.t2||0)*100).toFixed(2)+'% vs T6W='+(((r.t6||0)*100)>0?'+':'')+((r.t6||0)*100).toFixed(2)+'%. Blended forecast carries higher uncertainty when short and long trend windows disagree.',
    remedy:'Short- and long-term trends disagree, so this forecast is inherently less reliable right now. Don’t over-correct a target off one day like this — wait for the trend windows to re-converge.',
    kbKey:'forecast_formula',
    askPrompt:'Pull '+storeName+'\'s recent forecast accuracy snapshots and tell me whether the 2-week or 6-week trend has been the better predictor lately, so I know which one to trust until they re-converge.'});

  // ── 6. No LY data ─────────────────────────
  if(r.noLYData) causes.push({icon:'📂',color:'#94a3b8',weight:'PRIMARY',
    text:'No last-year baseline for this date. District averages substituted. New store projections have higher variance until 12+ months of history exist.',
    remedy:'Expected for a new or recently-relocated store. Grade it against district averages, not its own forecast, until 12+ months of real history exist to re-run this comparison against.',
    kbKey:'new_store_ramp',
    askPrompt:storeName+' has no valid last-year baseline for '+dateStr+'. Search project memory for how new-store forecasts should be graded until it has 12+ months of real history.'});

  // ── 7. Single-store anomaly ───────────────
  if(ds&&ds.loaded&&missPct>8&&!r.noLYData&&(!cross||cross.sameDir.length<2)){
    const dow=r.date.getDay();
    const peers=ds.laborRows.filter(row=>row.loc===loc&&row.date.getDay()===dow&&row.sales>0);
    if(peers.length>=5){
      const mean=peers.reduce((a,p)=>a+p.sales,0)/peers.length;
      const std=Math.sqrt(peers.reduce((a,p)=>a+(p.sales-mean)**2,0)/peers.length);
      const z=std>0?(r.actual-mean)/std:0;
      if(Math.abs(z)>=2.0) causes.push({icon:'🔍',color:Math.abs(z)>=3?'#ef4444':'#f97316',weight:'PRIMARY',
        text:'Store-specific anomaly: actual was '+(z>0?'+':'')+z.toFixed(1)+'σ from normal '+DOW_BASE[dow]+' baseline ($'+Math.round(r.actual).toLocaleString()+' vs avg $'+Math.round(mean).toLocaleString()+'). Isolated to this store — check staffing, equipment, or local events on that date.'+((!ev&&!cross)||cross.sameDir.length<2?' Consider tagging in Event Calendar.':''),
        remedy:'Isolated to this store on this date — walk back through that day’s staffing, any equipment downtime, or a local event with the GM before assuming it’s a real trend. If a real cause turns up, tag it in Event Calendar so it stops skewing the model.',
        kbKey:'why_engine_guide',
        askPrompt:storeName+' was '+z.toFixed(1)+'σ off its normal '+DOW_BASE[dow]+' baseline on '+dateStr+' with no weather or cross-store explanation. Search for local news or events that date, and pull this store\'s recent labor summary for anything unusual.'});
    }
  }

  // ── 8. Fallback ───────────────────────────
  if(causes.length===0) causes.push({icon:'❓',color:'#64748b',weight:'UNKNOWN',
    text:'No dominant signal. Weather neutral, ops near baseline, trends aligned, no cross-store correlation. Likely random variance. Tag in Event Calendar if cause is known.',
    remedy:'No action needed — this reads as ordinary day-to-day variance. If this store keeps landing in "unexplained" misses regularly rather than occasionally, that pattern is worth a deeper look at its baseline.',
    kbKey:'why_engine_guide',
    askPrompt:'No dominant cause explains '+storeName+'\'s miss on '+dateStr+'. Look at this store\'s broader miss pattern in forecast accuracy — is "unexplained" a one-off here, or a recurring blind spot worth a deeper look?'});
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
  crossStoreCheck, lookupMissEvent, diagnoseMiss, CauseLinks,
  computeForecastComposition, classifyMissCauses,
  runWhyEngineScan, runWhyEngineDistrict,
};
