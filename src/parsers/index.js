// @ts-nocheck
import * as XLSX from 'xlsx';
import { DEFAULT_TARGETS, STORE_NAMES } from '../constants.js';

// ── Enhancement 3: MAPE Drift Detection ──────────────────────────────────────
// Returns {mape2w, mape6w, drift, status:'ok'|'warn'|'recalibrate'}


function parseXLDate(v){
  if(!v&&v!==0) return null;
  if(v instanceof Date){
    // Shift to noon UTC to survive timezone display in any US timezone
    const d=new Date(v); d.setUTCHours(12,0,0,0); return d;
  }
  if(typeof v==='number'){
    // Excel serial → UTC midnight → shift to noon to survive tz display
    const d=new Date((v-25569)*86400000+43200000); // +12h
    return d;
  }
  // String date like '2024-11-28' — parse as local noon
  const parts=String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(parts) return new Date(+parts[1],+parts[2]-1,+parts[3],12,0,0);
  const d=new Date(v); return isNaN(d)?null:d;
}
function findCol(hdrs,...names){
  // Exact match first (all names), then substring fallback (all names).
  // Normalizes non-breaking spaces and extra whitespace common in QSRSoft exports.
  const norm=s=>String(s||'').replace(/[\u00a0\u2009\u202f\u2060]/g,' ').replace(/\s+/g,' ').trim().toLowerCase();
  for(const name of names){
    const t=norm(name);
    for(let i=0;i<hdrs.length;i++){if(hdrs[i]!=null&&norm(String(hdrs[i]))===t)return i;}
  }
  for(const name of names){
    const t=norm(name);if(t.length<=3)continue;
    for(let i=0;i<hdrs.length;i++){if(hdrs[i]!=null&&norm(String(hdrs[i])).includes(t))return i;}
  }
  return -1;
}
// fc() — findCol with fallback chain that correctly handles column index 0
function fc(h,...names){for(const n of names){const i=findCol(h,n);if(i>=0)return i;}return -1;}
// fcx() — exact match version: finds column where header equals name exactly (not substring)
function fcx(h,...names){for(const n of names){const s=n.toLowerCase();for(let i=0;i<h.length;i++){const v=h[i];if(v&&String(v).toLowerCase().trim()===s)return i;}}return -1;}
function autoHdrRow(raw,max=5){for(let i=0;i<Math.min(max,raw.length);i++){const r=raw[i];if(r&&r.some(c=>c&&String(c).toLowerCase().trim()==='loc'))return i;}return 0;}
function parseRaw(wb,sheet){const ws=wb.Sheets[sheet]||wb.Sheets[wb.SheetNames[0]];if(!ws)return[];return XLSX.utils.sheet_to_json(ws,{header:1,defval:null,raw:true});}
function parsePct(v){if(v===null||v===undefined||v==='')return 0;if(typeof v==='number')return Math.abs(v)>1.5?v/100:v;const s=String(v).replace('%','').trim();const n=parseFloat(s);return isNaN(n)?0:(Math.abs(n)>1.5?n/100:n);}

// Date helpers

// MERIDIAN PERSISTENT STORAGE — implemented in src/db/index.js (Dexie)

// NEW FORECAST MODELS  (v190) — Adaptive Ensemble, EWMA DOW, Auto-DI
// Validated against Lifelenz Sep 2025–May 2026: AE district avg 9.29%
// vs Lifelenz 9.51% on identical evaluation window. AE wins 16/27 stores.

// Per-store auto-calibrated DI parameters (from Python grid search, recency-weighted)

// ── Labor % color helper ─────────────────────
// Returns {color, arrow, label} based on distance from target


// SECTION 3: FILE DETECTOR

// ── Restaurant Projections file parser ──────────────────────────────────────
function parseProjectionsFile(wb, filename) {
  const rows = [];
  const ws = wb.Sheets[wb.SheetNames[0]];
  if(!ws) return [];
  const raw = XLSX.utils.sheet_to_json(ws, {header:1, defval:null, raw:true});
  // Find header row (has 'Restaurant' and 'Sales Projection')
  let hi = -1;
  for(let i=0;i<Math.min(raw.length,5);i++){
    const r = raw[i]||[];
    const joined = r.map(c=>String(c||'').toLowerCase()).join(' ');
    if(joined.includes('restaurant') && (joined.includes('projection') || joined.includes('qsr soft'))) {
      hi = i; break;
    }
  }
  if(hi < 0) return [];
  const hdr = (raw[hi]||[]).map(c=>String(c||'').toLowerCase());
  const ci = k => hdr.findIndex(h=>h.includes(k));
  const C = {
    rest: ci('restaurant'),
    proj: ci('sales projection'),
    qsr:  ci('qsr soft'),
    labor:ci('crew labor'),
    tpph: ci('tpph'),
    bonus:ci('bonus crew'),
    food: ci('base food'),
  };
  for(let i=hi+1;i<raw.length;i++){
    const row = raw[i];
    if(!row||!row[C.rest]) continue;
    const restStr = String(row[C.rest]||'');
    const loc = restStr.split(' - ')[0].trim();
    if(!loc||!/^\d{4,6}$/.test(loc)) continue;
    const proj = C.proj>=0 ? parseFloat(String(row[C.proj]||0).replace(/,/g,''))||0 : 0;
    const qsr  = C.qsr>=0  ? parseFloat(row[C.qsr])||0  : 0;
    const lab  = C.labor>=0? parseFloat(row[C.labor])||0 : 0;
    const tpph = C.tpph>=0 ? parseFloat(row[C.tpph])||0  : 0;
    rows.push({loc, proj, qsr, labor:lab, tpph});
  }
  return rows;
}

// ── Apply parsed projections to DEFAULT_TARGETS ───────────────────────────
function applyProjectionsToTargets(rows, label){
  let applied = 0;
  rows.forEach(r=>{
    if(!DEFAULT_TARGETS[r.loc]) return;
    const upd = {};
    if(r.proj>0)  { upd.tJuneProj=r.proj; upd.tOperatorProj=r.proj; }
    if(r.qsr>0)   upd.tQSRSoftProj=r.qsr;
    if(r.labor>0) upd.tJuneLaborPct=r.labor;
    if(r.tpph>0)  upd.tJuneTpph=r.tpph;
    Object.assign(DEFAULT_TARGETS[r.loc], upd);
    applied++;
  });
  console.log(`[Meridian] Projections applied: ${applied} stores from ${label}`);
  return applied;
}

function sniffSheetType(wb) {
  // Peek at first sheet headers to determine data type from content
  const ws = wb.Sheets[wb.SheetNames[0]];
  if(!ws) return null;
  const raw = XLSX.utils.sheet_to_json(ws, {header:1, defval:null, raw:true});
  const hdrs = (raw[0]||[]).concat(raw[1]||[]).map(h=>String(h||'').toLowerCase());
  const joined = hdrs.join(' ');
  // OpsData signature: OEPE, KVS, DT Parked
  if(joined.includes('oepe') || joined.includes('kvs time') || joined.includes('dt parked'))
    return {type:'ops', label:'OpsData (auto-detected from content)', confidence:'high'};
  // ControlsData signature: cash over/short, t-red, discount
  if(joined.includes('cash over') || joined.includes('t-red') || joined.includes('discount pct') || joined.includes('drawer opens'))
    return {type:'ctrl', label:'ControlsData (auto-detected from content)', confidence:'high'};
  // Labor signature: punched labor, opportunity cost, projected sales
  if(joined.includes('punched labor') || joined.includes('opportunity cost') || joined.includes('projected sales') || joined.includes('salaried manager'))
    return {type:'labor', label:'Labor Analysis (auto-detected from content)', confidence:'high'};
  // Weather signature: tmax, tmin, rain
  if(joined.includes('tmax') || joined.includes('tmin') || (joined.includes('rain') && joined.includes('wmax')))
    return {type:'weather', label:'WeatherData (auto-detected from content)', confidence:'high'};
  // Peaks signature: time slice, oepe no parked
  if(joined.includes('time slice') || joined.includes('oepe no parked'))
    return {type:'peaks', label:'3 Peaks (auto-detected from content)', confidence:'high'};
  // Register audit signature: emp name, drawer sales, t-red before
  if(joined.includes('emp name') || joined.includes('drawer sales') || joined.includes('t-red before cnt'))
    return {type:'register', label:'Register Audit (auto-detected from content)', confidence:'high'};
  // Trends signature: all net sales, stw gc
  if(joined.includes('all net sales') || (joined.includes('stw gc') && joined.includes('average check')))
    return {type:'trends', label:'Trends Report (auto-detected from content)', confidence:'high'};
  // Projections file signature: 'Sales Projection' or 'QSR Soft' in headers
  if(joined.includes('sales projection') || joined.includes('qsr soft sales') || joined.includes('mcdok') && joined.includes('projection'))
    return {type:'projections', label:'Restaurant Projections (auto-detected)', confidence:'high'};
  return null;
}

function detectType(filename, wb){
  const fn=filename.toLowerCase().replace(/\.[^.]+$/,'').trim();
  const ext=filename.split('.').pop().toLowerCase();
  const dm=filename.match(/(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})/i);
  const dr=dm?{from:dm[1],to:dm[2]}:null;
  // Mesonet: all-digit filename
  if(/^\d+$/.test(fn)&&(ext==='csv'||ext==='txt'))return{type:'weather',label:'WeatherData (Mesonet)',dr,confidence:'high'};
  // Combined Meridian workbook
  if(fn.startsWith('mcforecast pro data')||fn.includes('mcforecast pro data'))return{type:'combined',label:'Meridian Data (4 sheets)',dr,confidence:'high'};
  // *** NEW: Operations Report (combined Sales/Service/Controls/FOB) ***
  if(fn.startsWith('operations report')||fn.includes('operations report')||fn.startsWith('operations_report')||fn.includes('operations_report'))return{type:'ops_report',label:'Operations Report (Sales+Service+Controls+FOB)',dr,confidence:'high'};
  // 3 Peaks
  if(fn.startsWith('3 peaks')||fn.includes('3 peaks'))return{type:'peaks',label:'3 Peaks Report',dr,confidence:'high'};
  // Register Audit
  if(fn.startsWith('register audit')||fn.includes('register audit'))return{type:'register',label:'Register Audit',dr,confidence:'high'};
  // Trends
  if(fn.startsWith('trends')||fn.includes('trends'))return{type:'trends',label:'Trends Report',dr,confidence:'high'};
  // Records
  if(fn.startsWith('records')||fn.includes('records'))return{type:'records',label:'Records Report',dr,confidence:'high'};
  // Shift Manager Summary
  if(fn.includes('shift manager')||fn.includes('shift mgr'))return{type:'shiftmgr',label:'Shift Manager Summary',dr,confidence:'high'};
  // ── DAR — Daily Activity Report ──
  if(fn.includes('daily activity report')||fn.includes('daily_activity'))return{type:'dar',label:'Daily Activity Report (Hourly)',dr,confidence:'high'};
  // ── Product Mix ──
  if(fn.includes('product mix')||fn.includes('product_mix')||fn.includes('pmix'))return{type:'pmix',label:'Product Mix',dr,confidence:'high'};
  // Labor Analysis
  if(fn.startsWith('labor analysis')||fn.includes('labor analysis'))return{type:'labor',label:'Labor Analysis',dr,confidence:'high'};
  // Service → OpsData
  // Service → OpsData (QSRSoft sheet/file naming)
  if(fn.startsWith('service ')||fn==='service')return{type:'ops',label:'OpsData (Service)',dr,confidence:'high'};
  // Controls → ControlsData (QSRSoft sheet/file naming)
  // NOTE: In the 4-sheet workbook Service=OpsData, Controls=ControlsData
  // Standalone downloads follow the same convention
  if(fn.startsWith('controls ')||fn==='controls')return{type:'ctrl',label:'ControlsData (Controls)',dr,confidence:'high'};
  // OpsTargets
  if(fn.includes('target'))return{type:'targets',label:'OpsTargets',dr,confidence:'high'};
  // Fuzzy filename matches
  if(fn.includes('opsdata')||fn.includes('ops data'))return{type:'ops',label:'OpsData (fuzzy)',dr,confidence:'medium'};
  if(fn.includes('service')||fn.includes('oepe')||fn.includes('speed'))return{type:'ops',label:'OpsData (fuzzy)',dr,confidence:'medium'};
  if(fn.includes('control')||fn.includes('cash'))return{type:'ctrl',label:'ControlsData (fuzzy)',dr,confidence:'medium'};
  if(fn.includes('labor'))return{type:'labor',label:'Labor (fuzzy)',dr,confidence:'medium'};
  if(fn.includes('weather')||fn.includes('mesonet'))return{type:'weather',label:'WeatherData (fuzzy)',dr,confidence:'medium'};
  // Inventory Summary and Usage (paper/food/condiment)
  if(fn.includes('inventory summary')&&fn.includes('usage'))return{type:'inventory',label:'Inventory Summary & Usage',confidence:'high',loc:(()=>{const m=filename.match(/^(\d{4,6})\s*[-\u2013]/);return m?m[1]:null;})()};
  // Projections file: detected by filename before sniff
  if(fn.includes('projection')&&(filename.endsWith('.xlsm')||filename.endsWith('.xlsx')))
    return{type:'projections',label:'Restaurant Projections',dr,confidence:'high'};
  // Last resort: content-sniff the actual file headers
  if(wb){const sniffed=sniffSheetType(wb);if(sniffed)return{...sniffed,dr};}
  return{type:'unknown',label:'Unknown — select type below',dr,confidence:'low'};
}

async function readFile(file){
  return new Promise((res,rej)=>{
    const r=new FileReader();
    const isCSV=file.name.toLowerCase().endsWith('.csv')||file.name.toLowerCase().endsWith('.txt');
    if(isCSV){
      r.onload=e=>{try{res(XLSX.read(e.target.result,{type:'string',raw:true}));}catch(err){rej(err);}};
      r.readAsText(file);
    }else{
      r.onload=e=>{try{res(XLSX.read(new Uint8Array(e.target.result),{type:'array',cellDates:false,raw:true}));}catch(err){rej(err);}};
      r.readAsArrayBuffer(file);
    }
  });
}


// SECTION 4: PARSERS
function parseLaborData(wb,sheet,defaultDateOverride){
  // Accept 'Sales' (new Operations Report format) OR 'Labor Analysis' (legacy)
  if(!sheet){
    const names=(wb.SheetNames||[]);
    const salesSheet = names.find(s=>s.toLowerCase()==='sales'||s.toLowerCase().startsWith('sales '));
    const laborSheet = names.find(s=>s.toLowerCase().startsWith('labor analysis'));
    sheet = salesSheet || laborSheet || names[0] || 'Labor Analysis';
  }
  const raw=parseRaw(wb,sheet),hi=autoHdrRow(raw),h=raw[hi]||[];
  // Detect period-summary format: Operations Report summary has no Business Date column.
  // Extract "to" date from sheet name (e.g. "Sales 2026-05-01 to 2026-05-14").

  // ── Period-summary date handling ─────────────────────────────────────────
  // Operations Report sheets have no Business Date column — they're aggregated
  // over the period. Use defaultDateOverride (from filename) → sheet name → today.
  const _dateColIdx=fc(h,'Business Date','Date','Period');
  const _sheetDates=(sheet||'').match(/(\d{4}-\d{2}-\d{2})/g)||[];
  const _summaryDate=_dateColIdx<0
    ?(defaultDateOverride||(_sheetDates.length?new Date(_sheetDates[_sheetDates.length-1]+'T12:00:00'):new Date()))
    :null;
  const C={loc:fc(h,'Loc','Store'),date:_dateColIdx,
    sales:fc(h,'Product Sales'),allNetSales:fc(h,'All Net Sales'),
    proj:findCol(h,'WFM Projected Sales','Projected Sales','Proj Sales','Sales Projection','Projected Net Sales','Forecasted Sales','Forecast Sales','Proj. Sales'),
    gc:fc(h,'STW GC','GC'),actualGC:findCol(h,'Actual GC'),
    opp:fc(h,'Opportunity Cost %'),oppD:fc(h,'Opportunity Cost $'),
    avgChk:fc(h,'Average Check'),
    tpph:findCol(h,'TPPH'),spph:findCol(h,'SPPH'),avn:fc(h,'Act vs Need'),
    labor:fc(h,'Punched Labor %'),crewLaborPct:fc(h,'Crew Labor %'),
    totalLaborPct:fc(h,'Total Labor %'),
    otHrs:fc(h,'OT Hrs'),otD:fc(h,'OT $'),
    actHrs:fc(h,'Act Hrs'),avgRate:fc(h,'Avg Rate'),
    salMgr:fc(h,'Salaried Manager Hours'),
    fixCon:fc(h,'Fixed Contract Hours'),fixSch:fc(h,'Fixed Labor Hours Scheduled'),
    varNeed:fc(h,'Variable Labor Hours Needed'),
    flrNeed:fc(h,'Floor Management Hours Needed'),flrSch:fc(h,'Floor Hours Sched'),
    projTot:fc(h,'Projected Total Hrs'),totNeed:fc(h,'Total Hours Needed'),
    // ── Channel Sales (from Operations Report Sales sheet) ──
    salesVsLYPct:findCol(h,'All Net Sales +/- %'),
    dtSales:findCol(h,'DT Sales'),dtGC:findCol(h,'DT GC'),dtAvgChk:findCol(h,'DT Average Check'),dtPctTotal:findCol(h,'DT % of Total Sales'),
    bfSales:fc(h,'Breakfast All Net Sales','BF All Net Sales','Breakfast Net Sales','BF Net Sales','Breakfast Sales','BF Sales','Breakfast All Sales','Breakfast Total Sales'),bfGC:fc(h,'Breakfast GC','BF GC'),bfAvgChk:fc(h,'Breakfast Average Check','BF Average Check'),bfPctTotal:fc(h,'Breakfast % of Total Sales','BF % of Total Sales','Breakfast %','BF %'),
    delivSales:fc(h,'McDelivery Net Sales','Delivery Net Sales','Delivery All Net Sales','McDelivery Sales','Delivery Sales','3PD Net Sales','3rd Party Delivery Net Sales','3PD Sales','3PD All Net Sales','3rd Party Net Sales','McDelivery All Net Sales','Delivery Total Sales'),delivGC:fc(h,'McDelivery GC','Delivery GC'),delivAvgChk:fc(h,'McDelivery Average Check','Delivery Average Check'),delivPctTotal:fc(h,'McDelivery % of Total Sales','Delivery % of Total Sales','McDelivery %'),
    mopSales:fc(h,'MOP Sales','MOP Net Sales','Mobile Order and Pay Net Sales','Mobile Order Sales','Mobile Order & Pay Net Sales','MOB Sales','MOB Net Sales','Mobile All Net Sales','MOP All Net Sales','App Sales','Mobile App Sales'),mopGC:fc(h,'MOP GCs','MOP GC','MOB GC'),mopAvgChk:fc(h,'MOP Average Check','Mobile Order Average Check','MOB Average Check'),mopPctTotal:fc(h,'MOP Sales %','MOP % of Total Sales','MOP %','MOB %'),
    kioskSales:fc(h,'Kiosk All Net Sales','Kiosk Net Sales','Kiosk Sales','KSK Net Sales','KSK Sales','KSK All Net Sales','Self Order Kiosk Net Sales','Self-Order Kiosk Net Sales','SOK Net Sales','SOK Sales'),kioskGC:fc(h,'Kiosk GC','KSK GC'),kioskAvgChk:fc(h,'Kiosk Average Check','KSK Average Check'),kioskPctTotal:fc(h,'Kiosk % of Total Sales','Kiosk %','KSK %'),
    eatInSales:findCol(h,'Eat in Sales'),eatInGC:findCol(h,'Eat in GC'),
    inStoreSales:findCol(h,'In-Store All Net Sales'),inStoreGC:findCol(h,'In-Store GC'),inStorePctTotal:findCol(h,'In-Store % of Total Sales'),
    fcSales:findCol(h,'FC All Net Sales'),fcGC:findCol(h,'FC GC'),fcPctTotal:findCol(h,'FC % of Total Sales')};
  const rows=[];
  for(let i=hi+1;i<raw.length;i++){
    const r=raw[i];if(!r)continue;
    const loc=String(r[C.loc]||'').trim();if(!loc||!/^\d+$/.test(loc))continue;
    const dt=C.date>=0?parseXLDate(r[C.date]):_summaryDate;if(!dt)continue;
    const flrNeed=parseFloat(r[C.flrNeed])||0;
    const flrSch=parseFloat(r[C.flrSch])||0;
    const laborPctVal=parsePct(r[C.labor])||parsePct(r[C.crewLaborPct])||parsePct(r[C.totalLaborPct]);
    rows.push({loc,date:dt,
      sales:parseFloat(r[C.sales])||parseFloat(r[C.allNetSales])||0,
      allNetSales:parseFloat(r[C.allNetSales])||0,
      projSales:parseFloat(r[C.proj])||0,
      gc:parseFloat(r[C.gc])||0,actualGC:parseFloat(r[C.actualGC])||0,
      oppCostPct:parsePct(r[C.opp]),oppCostDollar:parseFloat(r[C.oppD])||0,
      avgCheck:parseFloat(r[C.avgChk])||0,tpph:parseFloat(r[C.tpph])||0,spph:parseFloat(r[C.spph])||0,
      actVsNeed:parseFloat(r[C.avn])||0,laborPct:laborPctVal,
      otHrs:parseFloat(r[C.otHrs])||0,otDollar:parseFloat(r[C.otD])||0,
      actHrs:parseFloat(r[C.actHrs])||0,avgRate:parseFloat(r[C.avgRate])||0,
      salaryMgrHrs:parseFloat(r[C.salMgr])||0,
      fixedContractHrs:parseFloat(r[C.fixCon])||0,fixedSchedHrs:parseFloat(r[C.fixSch])||0,
      variableNeeded:parseFloat(r[C.varNeed])||0,
      floorMgmtNeeded:flrNeed,floorHrsSched:flrSch,
      floorCompliance:flrNeed>0?flrSch/flrNeed:null,
      // Channel sales breakdown
      salesVsLYPct:parseFloat(r[C.salesVsLYPct])||null,
      dtSales:parseFloat(r[C.dtSales])||0,dtGC:parseFloat(r[C.dtGC])||0,dtAvgChk:parseFloat(r[C.dtAvgChk])||0,dtPctTotal:parsePct(r[C.dtPctTotal]),
      bfSales:parseFloat(r[C.bfSales])||0,bfGC:parseFloat(r[C.bfGC])||0,bfAvgChk:parseFloat(r[C.bfAvgChk])||0,bfPctTotal:parsePct(r[C.bfPctTotal]),
      delivSales:parseFloat(r[C.delivSales])||0,delivGC:parseFloat(r[C.delivGC])||0,delivAvgChk:parseFloat(r[C.delivAvgChk])||0,delivPctTotal:parsePct(r[C.delivPctTotal]),
      mopSales:parseFloat(r[C.mopSales])||0,mopGC:parseFloat(r[C.mopGC])||0,mopAvgChk:parseFloat(r[C.mopAvgChk])||0,mopPctTotal:parsePct(r[C.mopPctTotal]),
      kioskSales:parseFloat(r[C.kioskSales])||0,kioskGC:parseFloat(r[C.kioskGC])||0,kioskAvgChk:parseFloat(r[C.kioskAvgChk])||0,kioskPctTotal:parsePct(r[C.kioskPctTotal]),
      eatInSales:parseFloat(r[C.eatInSales])||0,eatInGC:parseFloat(r[C.eatInGC])||0,
      inStoreSales:parseFloat(r[C.inStoreSales])||0,inStoreGC:parseFloat(r[C.inStoreGC])||0,inStorePctTotal:parsePct(r[C.inStorePctTotal]),
      fcSales:parseFloat(r[C.fcSales])||0,fcGC:parseFloat(r[C.fcGC])||0,fcPctTotal:parsePct(r[C.fcPctTotal])});
  }
  return rows;
}

function parseOpsData(wb,sheet,defaultDateOverride){
  // Accept 'Service' (new Operations Report format) OR 'OpsData' (legacy)
  if(!sheet){
    const names=(wb.SheetNames||[]);
    const svcSheet  = names.find(s=>s.toLowerCase()==='service'||s.toLowerCase().startsWith('service '));
    const opsSheet  = names.find(s=>s.toLowerCase()==='opsdata'||s.toLowerCase().startsWith('opsdata'));
    sheet = svcSheet || opsSheet || names[0] || 'OpsData';
  }
  const raw=parseRaw(wb,sheet),hi=autoHdrRow(raw),h=raw[hi]||[];
  // Detect period-summary format: Operations Report summary has no Business Date column.
  // Extract "to" date from sheet name (e.g. "Sales 2026-05-01 to 2026-05-14").

  // ── Period-summary date handling ─────────────────────────────────────────
  // Operations Report sheets have no Business Date column — they're aggregated
  // over the period. Use defaultDateOverride (from filename) → sheet name → today.
  const _dateColIdx=fc(h,'Business Date','Date','Period');
  const _sheetDates=(sheet||'').match(/(\d{4}-\d{2}-\d{2})/g)||[];
  const _summaryDate=_dateColIdx<0
    ?(defaultDateOverride||(_sheetDates.length?new Date(_sheetDates[_sheetDates.length-1]+'T12:00:00'):new Date()))
    :null;
  const C={loc:fc(h,'Loc','Store'),date:_dateColIdx,oepe:findCol(h,'OEPE W/O Parked'),
    park:findCol(h,'DT Parked %'),kvst:findCol(h,'KVS Time Per GC'),
    kvsu:findCol(h,'KVS Healthy Usage'),r2p:findCol(h,'R2P')};
  const rows=[];
  for(let i=hi+1;i<raw.length;i++){
    const r=raw[i];if(!r)continue;
    const loc=String(r[C.loc]||'').trim();if(!loc||!/^\d+$/.test(loc))continue;
    const dt=C.date>=0?parseXLDate(r[C.date]):_summaryDate;if(!dt)continue;const kv=r[C.kvsu];
    let kvsu=0;
    if(typeof kv==='number')kvsu=kv>1?kv/100:kv;
    else if(kv){const s=String(kv).replace('%','').replace("'",'').trim();kvsu=parseFloat(s)>1?parseFloat(s)/100:parseFloat(s)||0;}
    rows.push({loc,date:dt,oepe:parseFloat(r[C.oepe])||0,park:parsePct(r[C.park]),
      kvst:parseFloat(r[C.kvst])||0,kvsu,r2p:parseFloat(r[C.r2p])||0});
  }
  return rows;
}

function parseCtrlData(wb,sheet,defaultDateOverride){
  // Accept 'Controls' (new Operations Report format) OR 'ControlsData' (legacy)
  if(!sheet){
    const names=(wb.SheetNames||[]);
    const ctrlSheet = names.find(s=>s.toLowerCase()==='controls'||s.toLowerCase().startsWith('controls '));
    const ctrlData  = names.find(s=>s.toLowerCase().startsWith('controlsdata'));
    sheet = ctrlSheet || ctrlData || names[0] || 'ControlsData';
  }
  const raw=parseRaw(wb,sheet),hi=autoHdrRow(raw),h=raw[hi]||[];
  // ── Period-summary date handling ─────────────────────────────────────────
  // Operations Report sheets have no Business Date column — they're aggregated
  // over the period. Use defaultDateOverride (from filename) → sheet name → today.
  const _dateColIdx=fc(h,'Business Date','Date','Period');
  const _sheetDates=(sheet||'').match(/(\d{4}-\d{2}-\d{2})/g)||[];
  const _summaryDate=_dateColIdx<0
    ?(defaultDateOverride||(_sheetDates.length?new Date(_sheetDates[_sheetDates.length-1]+'T12:00:00'):new Date()))
    :null;
  const C={loc:fc(h,'Loc','Store'),date:_dateColIdx,
    // Cash
    cashOS:fc(h,'Cash Over/Short %','Cash Over/ Short %','Cash O/S %'),
    cashOSAmt:fc(h,'Cash Over/Short','Cash Over/ Short $'),
    // T-Reds
    tRedAPct:fc(h,'T-Red After Pct','T-Red After %'),
    tRedACnt:fc(h,'T-Red After Cnt','T-Red After Count'),
    tRedBPct:fc(h,'T-Red Before Pct','T-Red Before %'),
    tRedBCnt:fc(h,'T-Red Before Cnt','T-Red Before Count'),
    // POS / Refunds
    posCnt:fc(h,'POS Overrings Cnt','POS Overrings'),
    posAmt:fc(h,'POS Overrings Amt','POS Overrings $'),
    // OT — in new format at col 2
    otHrs:fc(h,'OT Hrs','OT Hours'),otD:fc(h,'OT $','OT Dollar'),
    // Labor — new format has both; prefer Actual Labor %
    actLabor:fc(h,'Actual Labor %','Punched Labor %','Labor %'),
    punchLabor:fc(h,'Punched Labor %','Punched Labor'),
    // Operations
    avn:fc(h,'Act vs Need','Act vs Need %'),
    tpph:fc(h,'TPPH','Trans Per Person Hour'),
    spph:findCol(h,'SPPH'),
    avgRate:fc(h,'Avg Rate','Avg Rate of Pay'),
    actHrs:fc(h,'Act Hrs','Actual Hours'),
    crewHrs:fc(h,'Crew Labor Hours','Crew Hours'),
    // Promo group (separate from Discount group in Operations Report)
    promoPct:fc(h,'Promo Pct','Promo %'),
    promoAmt:fc(h,'Promo Amt','Promo $'),
    promoCnt:findCol(h,'Promo Cnt'),
    // Discount group (separate from Promo)
    discPct:fc(h,'Discount Pct','Discount %'),
    discAmt:fc(h,'Discount Amt','Discount $'),
    discCnt:findCol(h,'Discount Cnt'),
    // Refunds
    cashRefCnt:fc(h,'Cash Refund Cnt'),cashRefAmt:fc(h,'Cash Refund Amt'),
    cashlessRefCnt:fc(h,'Cashless Refund Cnt'),cashlessRefAmt:fc(h,'Cashless Refund Amt'),
    manRef:fc(h,'Manual Refund/Overring Amt','Manual Refund/Overring $','Manual Refund'),
    // Drawer
    drawer:findCol(h,'Drawer Opens'),
    // Meals
    empMeal:fc(h,'Emp Meal Amt','Emp Meal $'),mgrMeal:fc(h,'Manager Meal Amt','Mgr Meal $'),
    // Cash management
    petty:fc(h,'Petty Cash Amt','Petty Cash $'),deposit:fc(h,'Deposit Amt','Deposit $'),
    salMgr:fc(h,'Salaried Manager Hours','Salaried Mgr Hrs')};
  const rows=[];
  for(let i=hi+1;i<raw.length;i++){
    const r=raw[i];if(!r)continue;
    const loc=String(r[C.loc]||'').trim();if(!loc||!/^\d+$/.test(loc))continue;
    const dt=C.date>=0?parseXLDate(r[C.date]):_summaryDate;if(!dt)continue;
    const pettyAmt=parseFloat(r[C.petty])||0;
    // Prefer Actual Labor % (punched hours ÷ sales), fall back to Punched Labor %
    const laborPctVal = parsePct(r[C.actLabor]) || parsePct(r[C.punchLabor]);
    rows.push({loc,date:dt,
      cashOSPct:parsePct(r[C.cashOS]),cashOSAmt:parseFloat(r[C.cashOSAmt])||0,
      tRedAPct:parsePct(r[C.tRedAPct]),tRedACnt:parseFloat(r[C.tRedACnt])||0,
      tRedBPct:parsePct(r[C.tRedBPct]),tRedBCnt:parseFloat(r[C.tRedBCnt])||0,
      posOverCnt:parseFloat(r[C.posCnt])||0,posOverAmt:parseFloat(r[C.posAmt])||0,
      otHrs:parseFloat(r[C.otHrs])||0,otDollar:parseFloat(r[C.otD])||0,
      laborPct:laborPctVal,actVsNeed:parseFloat(r[C.avn])||0,
      discPct:parsePct(r[C.discPct]),discAmt:parseFloat(r[C.discAmt])||0,
      discCnt:parseFloat(r[C.discCnt])||0,
      promoPct:parsePct(r[C.promoPct]),promoAmt:parseFloat(r[C.promoAmt])||0,
      promoCnt:parseFloat(r[C.promoCnt])||0,
      cashRefCnt:parseFloat(r[C.cashRefCnt])||0,cashRefAmt:parseFloat(r[C.cashRefAmt])||0,
      cashlessRefCnt:parseFloat(r[C.cashlessRefCnt])||0,cashlessRefAmt:parseFloat(r[C.cashlessRefAmt])||0,
      manualRefAmt:parseFloat(r[C.manRef])||0,drawerOpens:parseFloat(r[C.drawer])||0,
      tpph:parseFloat(r[C.tpph])||0,spph:parseFloat(r[C.spph])||0,
      avgRate:parseFloat(r[C.avgRate])||0,
      empMealAmt:parseFloat(r[C.empMeal])||0,mgrMealAmt:parseFloat(r[C.mgrMeal])||0,
      actHrs:parseFloat(r[C.actHrs])||0,crewHrs:parseFloat(r[C.crewHrs])||0,
      salaryMgrHrs:parseFloat(r[C.salMgr])||0,
      pettyAmt,hasPettyCash:pettyAmt>0,depositAmt:parseFloat(r[C.deposit])||0});
  }
  return rows;
}

function parseWeatherData(wb,sheet){
  sheet=sheet||'WeatherData';
  const raw=parseRaw(wb,sheet),hi=autoHdrRow(raw),h=raw[hi]||[];
  const C={loc:fc(h,'Loc','Store'),date:fc(h,'Date','Business Date'),yr:findCol(h,'YEAR'),mo:findCol(h,'MONTH'),dy:findCol(h,'DAY'),
    stid:findCol(h,'STID'),tmax:findCol(h,'TMAX'),tmin:findCol(h,'TMIN'),davg:findCol(h,'DAVG'),
    havg:findCol(h,'HAVG'),wcmn:findCol(h,'WCMN'),wmax:findCol(h,'WMAX'),wspd:findCol(h,'WSPD'),
    rain:findCol(h,'RAIN'),rnum:findCol(h,'RNUM'),rmax:findCol(h,'RMAX'),mslp:findCol(h,'MSLP')};
  const rows=[];
  for(let i=hi+1;i<raw.length;i++){
    const r=raw[i];if(!r)continue;
    let dt=C.date>=0?parseXLDate(r[C.date]):null;
    if(!dt&&C.yr>=0&&C.mo>=0&&C.dy>=0){const yr=parseInt(r[C.yr]),mo=parseInt(r[C.mo]),d=parseInt(r[C.dy]);if(yr&&mo&&d)dt=new Date(yr,mo-1,d);}
    if(!dt)continue;
    let loc=C.loc>=0?String(r[C.loc]||'').trim():'';
    const stid=C.stid>=0?String(r[C.stid]||'').trim():'';
    if(!loc&&stid)loc=stid;if(!loc)continue;
    rows.push({loc,date:dt,stid,tmax:parseFloat(r[C.tmax])||0,tmin:parseFloat(r[C.tmin])||0,
      davg:parseFloat(r[C.davg])||0,havg:parseFloat(r[C.havg])||0,wcmn:parseFloat(r[C.wcmn])||0,
      wmax:parseFloat(r[C.wmax])||0,wspd:parseFloat(r[C.wspd])||0,
      rain:parseFloat(r[C.rain])||0,rnum:parseFloat(r[C.rnum])||0,rmax:parseFloat(r[C.rmax])||0,
      mslp:parseFloat(r[C.mslp])||0});
  }
  return rows;
}

function parseTargets(wb,sheet){
  sheet=sheet||'OpsTargets';
  const raw=parseRaw(wb,sheet),hi=autoHdrRow(raw),h=raw[hi]||[];
  const C={
    loc:         fc(h,'Loc','Store'),
    // Service targets
    oepe:        findCol(h,'Target OEPE'),
    tpph:        fc(h,'TPPH\nTarget','Target TPPH'),
    kvst:        findCol(h,'Target KVS Time'),
    kvsu:        findCol(h,'Target KVS Usage'),
    park:        findCol(h,'Target DT Parked %'),
    avgCheck:    findCol(h,'Average Check'),
    prodSales:   findCol(h,'Product Sales'),
    // Labor targets
    labor:       fc(h,'Labor Target','Combined Labor %'),
    crewLabor:   findCol(h,'Crew Labor %'),
    bonusCrew:   findCol(h,'Bonus Crew Labor%'),
    growth:      findCol(h,'Growth Goal %'),
    // Controls — T-Reds
    tRedBPct:    findCol(h,'T-Reds Before %'),
    tRedBAvg:    findCol(h,'T-Reds Before Avg'),
    tRedBDollar: findCol(h,'T-Reds Before $'),
    tRedAPct:    findCol(h,'T-Reds After %'),
    tRedAAvg:    findCol(h,'T-Reds After Avg'),
    tRedADollar: findCol(h,'T-Reds After $'),
    // Controls — Promo/Discount
    promoCnt:    findCol(h,'Promo #'),
    promoPct:    findCol(h,'Promo %'),
    promoAmt:    findCol(h,'Promo $'),
    discCoupPct: findCol(h,'Disc Coup %'),
    // Controls — Drawer/POS/Refund
    drawer:      findCol(h,'Drawer Opens'),
    posOverPct:  findCol(h,'POS Overring %'),
    posOverAmt:  findCol(h,'POS Overing $'),
    refundCnt:   findCol(h,'Refund #'),
    refundPct:   findCol(h,'Refund %'),
    refundAmt:   findCol(h,'Refund $'),
    refundCash:  findCol(h,'Refund Cashless $'),
    manRefPct:   fc(h,'Manual Refund/ Overring %','Manual Refund'),
    manRefAmt:   findCol(h,'Manual Refund/ Overring $'),
    // Controls — Cash
    cashOSPct:   fc(h,'Cash Over/ Short %','Cash Over/Short %'),
    cashOSAmt:   fc(h,'Cash Over/ Short $','Cash Over/Short $'),
    // FOB targets
    fobBase:     fc(h,'Base Food\n%','Base Food %','Base Food%','Base Food Pct','BaseFoodPct','Base Food Target','Base Food'),
    fobCompWaste:findCol(h,'Comp Waste %'),
    fobRawWaste: fc(h,'Raw Waste %','Raw Waste'),
    fobCondiment:fc(h,'Condiment\n%','Condiment %','Condiment'),
    fobEmpFood:  fc(h,'Emp Food\n%','Emp Food %','Employee Food %','Emp Food'),
    fobStatLoss: fc(h,'Stat Loss\n%','Stat Loss %','Stat Loss'),
    fobUnex:     fc(h,'Unex Diff\n%','Unex Diff %','Unexplained Diff %','Unex Diff'),
    fobTarget:   fc(h,'FOB Target w/o Disc Coup','FOB Target'),
    fobTotalFC:  fc(h,'Total Food Cost\n%','Total Food Cost %','Total Food Cost'),
    fobBonusBase:fc(h,'Bonus Food Over Base Target','Bonus Food'),
    // Other
    paperCost:   fc(h,'P &. L Paper Cost %','Paper Cost %','P&L Paper'),
    opSupply:    findCol(h,'Op Supply Target'),
    bonusCrew:   findCol(h,'Bonus Crew Labor%'),
    fobBonusBase:findCol(h,'Bonus Food Over Base Target','Bonus Food'),
    posOverAmt:  findCol(h,'POS Overing $','POS Overring $'),
    refundAmt:   findCol(h,'Refund $'),
    refundCash:  findCol(h,'Refund Cashless $'),
    manRefAmt:   findCol(h,'Manual Refund/ Overring $'),
  };
  const targets={};
  for(let i=hi+1;i<raw.length;i++){
    const r=raw[i];if(!r)continue;
    const loc=String(r[C.loc]||'').trim();if(!loc||!/^\d+$/.test(loc))continue;
    targets[loc]={
      // Service / Operations
      tOepe:       parseFloat(r[C.oepe])||140,
      tTpph:       parseFloat(r[C.tpph])||5.5,
      tKvst:       parseFloat(r[C.kvst])||50,
      tKvsu:       parsePct(r[C.kvsu]),
      tPark:       parsePct(r[C.park]),
      tAvgCheck:   parseFloat(r[C.avgCheck])||0,
      tProdSales:  parseFloat(r[C.prodSales])||0,
      tR2p:        90,
      // Labor
      tLabor:      parsePct(r[C.labor])||parsePct(r[C.crewLabor]),
      tCrewLabor:  parsePct(r[C.crewLabor]),
      tCombLabor:  parsePct(r[C.labor]),
      tGrowth:     parsePct(r[C.growth])||.05,
      // T-Reds
      tRedBPct:    parsePct(r[C.tRedBPct]),
      tRedBAvg:    parseFloat(r[C.tRedBAvg])||0,
      tRedBDollar: parseFloat(r[C.tRedBDollar])||0,
      tRedAPct:    parsePct(r[C.tRedAPct]),
      tRedAAvg:    parseFloat(r[C.tRedAAvg])||0,
      tRedADollar: parseFloat(r[C.tRedADollar])||0,
      // Promo / Discount
      tPromoCnt:   parseFloat(r[C.promoCnt])||0,
      tPromoPct:   parsePct(r[C.promoPct]),
      tPromoAmt:   parseFloat(r[C.promoAmt])||0,
      tDiscCoupPct:parsePct(r[C.discCoupPct]),
      // Drawer / POS / Refund
      tDrawer:     parseFloat(r[C.drawer])||60,
      tPosOverPct: parsePct(r[C.posOverPct]),
      tRefundCnt:  parseFloat(r[C.refundCnt])||0,
      tRefundPct:  parsePct(r[C.refundPct]),
      tManRefPct:  parsePct(r[C.manRefPct]),
      // Cash
      tCashOSPct:  parsePct(r[C.cashOSPct]),
      tCashOSAmt:  parseFloat(r[C.cashOSAmt])||0,
      // FOB
      tFOBBase:    parsePct(r[C.fobBase]),
      tCompWaste:  parsePct(r[C.fobCompWaste]),
      tRawWaste:   parsePct(r[C.fobRawWaste]),
      tCondiment:  parsePct(r[C.fobCondiment]),
      tEmpFood:    parsePct(r[C.fobEmpFood]),
      tStatLoss:   parsePct(r[C.fobStatLoss]),
      tUnex:       parsePct(r[C.fobUnex]),
      tFOBTarget:  parsePct(r[C.fobTarget]),
      tFOBTotal:   parsePct(r[C.fobTotalFC]),
      tFOBBonusBase:parseFloat(r[C.fobBonusBase])||0,
      // Other
      tBonusLabor: parsePct(r[C.bonusCrew]),
      tPaperCost:  parsePct(r[C.paperCost]),
      tOpSupply:   parseFloat(r[C.opSupply])||0,
      tPosOverAmt: parseFloat(r[C.posOverAmt])||0,
      tRefundAmt:  parseFloat(r[C.refundAmt])||0,
      tRefundCash: parseFloat(r[C.refundCash])||0,
      tManRefAmt:  parseFloat(r[C.manRefAmt])||0,
    };
  }
  return targets;
}

// ── 3 PEAKS PARSER ─────────────────────────
// Two sheets: Sales and Service, both with Time Slice rows
// Time slices: 7am-9am, 11am-2pm, 5pm-7pm
function parse3PeaksService(wb, sheet) {
  sheet = sheet || wb.SheetNames.find(s=>s.toLowerCase()==='service'||s.toLowerCase().startsWith('service '))||wb.SheetNames.find(s=>s.toLowerCase().includes('service'))||wb.SheetNames[0];
  const raw=parseRaw(wb,sheet),hi=autoHdrRow(raw,10),h=raw[hi]||[];
  const C={loc:fc(h,'Loc','Store','Location','NSN'),
    date:fc(h,'Business Date','Date','Biz Date'),
    slice:fc(h,'Time Slice','Daypart','Period'),
    oepe:fc(h,'OEPE W/O Parked','OEPE No Parked'),
    r2p:fcx(h,'R2P'),avgCTP:findCol(h,'Avg CTP'),
    kvst:fcx(h,'KVS Time Per GC'),
    kvsu:fcx(h,'KVS Healthy Usage'),
    dtGC:fcx(h,'DT GC'),
    dtOrder:fcx(h,'DT Order Time'),dtLine:fcx(h,'DT Line Time'),
    dtWin1:fcx(h,'DT Win1 Time'),dtWin2:fcx(h,'DT Win2 Time'),
    parkCnt:fcx(h,'DT Parked Count'),parkPct:fcx(h,'DT Parked %'),parkTime:fcx(h,'DT Parked Time'),
    avgDTTTL:findCol(h,'Avg DT TTL')}; 
  const rows=[];let lastLoc='';
  for(let i=hi+1;i<raw.length;i++){
    const r=raw[i];if(!r)continue;
    const rawLoc=C.loc>=0?String(r[C.loc]||'').trim():'';
    if(rawLoc&&/^\d+$/.test(rawLoc))lastLoc=rawLoc;
    const loc=lastLoc;if(!loc||!/^\d+$/.test(loc))continue;
    const dt=parseXLDate(r[C.date]);if(!dt)continue;
    const slice=String(r[C.slice]||'').trim();if(!slice)continue;
    rows.push({loc,date:dt,slice,_peakSvc:true,
      oepe:parseFloat(r[C.oepe])||0,r2p:parseFloat(r[C.r2p])||0,
      avgCTP:parseFloat(r[C.avgCTP])||0,kvst:parseFloat(r[C.kvst])||0,
      kvsu:parsePct(r[C.kvsu]),dtGC:parseFloat(r[C.dtGC])||0,
      dtOrderTime:parseFloat(r[C.dtOrder])||0,dtLineTime:parseFloat(r[C.dtLine])||0,
      dtWin1:parseFloat(r[C.dtWin1])||0,dtWin2:parseFloat(r[C.dtWin2])||0,
      parkCnt:parseFloat(r[C.parkCnt])||0,parkPct:parsePct(r[C.parkPct]),
      parkTime:parseFloat(r[C.parkTime])||0,avgDTTTL:parseFloat(r[C.avgDTTTL])||0});
  }
  return rows;
}

function parse3PeaksSales(wb, sheet) {
  sheet = sheet || wb.SheetNames.find(s=>s.toLowerCase()==='sales'||s.toLowerCase().startsWith('sales '))||wb.SheetNames.find(s=>s.toLowerCase().includes('sales'))||wb.SheetNames[0];
  const raw=parseRaw(wb,sheet),hi=autoHdrRow(raw,10),h=raw[hi]||[];
  const C={loc:fc(h,'Loc','Store','Location','NSN'),
    date:fc(h,'Business Date','Date','Biz Date'),
    slice:fc(h,'Time Slice','Daypart','Period'),
    netSales:fc(h,'All Net Sales','Net Sales','Total Sales','FC All Net Sales'),
    prodSales:findCol(h,'Product Sales'),gc:fc(h,'STW GC','GC','Transactions'),
    avgCheck:findCol(h,'Average Check'),tpph:findCol(h,'TPPH'),spph:findCol(h,'SPPH')};
  const rows=[];let lastLoc='';
  for(let i=hi+1;i<raw.length;i++){
    const r=raw[i];if(!r)continue;
    const rawLoc=C.loc>=0?String(r[C.loc]||'').trim():'';
    if(rawLoc&&/^\d+$/.test(rawLoc))lastLoc=rawLoc;
    const loc=lastLoc;if(!loc||!/^\d+$/.test(loc))continue;
    const dt=parseXLDate(r[C.date]);if(!dt)continue;
    const slice=String(r[C.slice]||'').trim();if(!slice)continue;
    rows.push({loc,date:dt,slice,_peakSvc:false,
      netSales:parseFloat(r[C.netSales])||0,prodSales:parseFloat(r[C.prodSales])||0,
      gc:parseFloat(r[C.gc])||0,avgCheck:parseFloat(r[C.avgCheck])||0,
      tpph:parseFloat(r[C.tpph])||0,spph:parseFloat(r[C.spph])||0});
  }
  return rows;
}

// Normalize slice names to consistent keys

// ── REGISTER AUDIT PARSER ────────────────────
// Per-employee, per-register, per-date
// FOB (Food Over Base) Parser
// Sheet name: 'FOB' in Operations Report
function parseFOBData(wb, sheet, defaultDateOverride, fromDate) {
  sheet = sheet || (wb.SheetNames||[]).find(s=>s.toLowerCase()==='fob'||s.toLowerCase().startsWith('fob '))||
          (wb.SheetNames||[]).find(s=>s.toLowerCase().includes('fob'))||'FOB';
  const raw = parseRaw(wb, sheet);
  if(!raw||!raw.length) return [];
  const hi  = autoHdrRow(raw);
  const h   = raw[hi] || [];
  const fc  = (...args) => findCol(h, ...args);

  // Detect period-summary format: Operations Report summary has no Business Date column.
  // Extract "to" date from sheet name (e.g. "Sales 2026-05-01 to 2026-05-14").
  const _dateColIdx=findCol(h,'Month','Business Date','Date','Period');
  const _sheetDates=(sheet||'').match(/(\d{4}-\d{2}-\d{2})/g)||[];
  const _summaryDate=_dateColIdx<0
    ?(defaultDateOverride||(_sheetDates.length?new Date(_sheetDates[_sheetDates.length-1]+'T12:00:00'):new Date()))
    :null;
  const C = {
    loc:        fc('Loc','Store','Location','NS#'),
    date:       _dateColIdx,
    sales:      fc('Prod Net Sales','Product Sales','Net Sales','Sales'),
    // Food Cost breakdown — Operations Report FOB column names
    baseFoodPct:fc('Base Food %','Base Food Pct','Base Food Cost %'),
    fobPct:     fc('FOB %','Food Over Base %','FOB Pct'),
    compWaste:  fc('Comp Waste %','Comp Waste Pct','Completed Waste %'),   // Completed (finished product) waste
    rawWaste:   fc('Raw Waste %','Raw Waste Pct'),                          // Raw/uncooked product waste
    condiment:  fc('Condiment %','Condiment Pct'),
    empMeal:    fc('Emp Meal %','Emp Food %','Employee Meal %'),
    statVar:    fc('Stat Var %','Stat Loss %','Statistical Variance %'),
    unexplained:fc('Unexplained %','Unexplained Pct'),
    discCoupon: fc('Disc Coupon %','Discount Coupon %','Disc Coup %'),
    // P&L promo amounts
    pLFoodPromo:fc('P & L Food Promo $','P&L Food Promo $','Food Promo'),
    pLPaperPromo:fc('P & L Paper Promo $','P&L Paper Promo $','Paper Promo'),
    pLPaperPct: fc('P & L Paper Cost %','Paper Cost %','P&L Paper Cost %'),
    pLFoodPct:  fc('P & L Food Cost %','Food Cost %','P&L Food Cost %'),
    // Cross-check metrics also in FOB
    laborPct:   fc('Actual Labor %','Labor %','Act Labor %'),
    tpph:       fc('TPPH','Trans Per Person Hour'),
    salesVsLY:  fc('Product Sales +/- %','Sales +/- %','vs LY %'),
    opsSupplies:fc('Ops Supplies','Op Supplies','Operating Supplies'),
    fobDollar:  fc('FOB $','FOB Dollar'),
    fobWOUnexpPct:    fc('FOB W/O Unexp %','FOB Without Unexplained %'),
    fobWOUnexpDollar: fc('FOB W/O Unexp $','FOB Without Unexplained $'),
    pLFoodCostDollar: fc('P & L Food Cost $','P&L Food Cost $','Food Cost $'),
    pLPaperCostDollar:fc('P & L Paper Cost $','P&L Paper Cost $','Paper Cost $'),
  };
  const rows=[];
  for(let ri=hi+1;ri<raw.length;ri++){
    const row=raw[ri];if(!row||row.every(v=>v==null||v===''))continue;
    const locRaw=String(row[C.loc]||'').trim().split('-')[0].trim().replace(/[^0-9]/g,'');
    if(!locRaw||isNaN(+locRaw))continue;
    const loc=String(+locRaw);
    const dt=C.date>=0?parseXLDate(row[C.date]):_summaryDate;
    rows.push({
      loc, date:dt,
      sales:      parseFloat(row[C.sales])||0,
      baseFoodPct:parseFloat(row[C.baseFoodPct])||0,
      fobPct:     parseFloat(row[C.fobPct])||0,
      compWaste:  parseFloat(row[C.compWaste])||0,
      rawWaste:   parseFloat(row[C.rawWaste])||0,
      condiment:  parseFloat(row[C.condiment])||0,
      empMeal:    parseFloat(row[C.empMeal])||0,
      statVar:    parseFloat(row[C.statVar])||0,
      unexplained:parseFloat(row[C.unexplained])||0,
      discCoupon: parseFloat(row[C.discCoupon])||0,
      pLFoodPromo:parseFloat(row[C.pLFoodPromo])||0,
      pLPaperPromo:parseFloat(row[C.pLPaperPromo])||0,
      pLPaperPct: parseFloat(row[C.pLPaperPct])||0,
      pLFoodPct:  parseFloat(row[C.pLFoodPct])||0,
      laborPct:   parseFloat(row[C.laborPct])||0,
      tpph:       parseFloat(row[C.tpph])||0,
      salesVsLY:  parseFloat(row[C.salesVsLY])||null,
      opsSupplies:parseFloat(row[C.opsSupplies])||0,
      fobDollar:  parseFloat(row[C.fobDollar])||0,
      fobWOUnexpPct:    parseFloat(row[C.fobWOUnexpPct])||0,
      fobWOUnexpDollar: parseFloat(row[C.fobWOUnexpDollar])||0,
      pLFoodCostDollar: parseFloat(row[C.pLFoodCostDollar])||0,
      pLPaperCostDollar:parseFloat(row[C.pLPaperCostDollar])||0,
    });
  }
  return rows;
}

function parseRegisterAudit(wb, sheet) {
  sheet = sheet || wb.SheetNames.find(s=>s.toLowerCase().startsWith('register audit'))||wb.SheetNames[0];
  const raw=parseRaw(wb,sheet),hi=autoHdrRow(raw),h=raw[hi]||[];
  const C={emp:fc(h,'Emp Name','Employee','Employee Name','Cashier'),
    loc:fc(h,'Loc','Store'),date:fc(h,'Business Date','Date'),
    drawerSales:findCol(h,'Drawer Sales'),avgCheck:findCol(h,'Average Check'),
    drawerOpens:findCol(h,'Drawer Opens'),drawerGC:fc(h,'Drawer GC','GC'),
    empMealDisc:fc(h,'Emp Meal Disc $','Emp Meal $'),
    empMealCh:findCol(h,'Emp Meal Disc Ch'),
    manualRef:fc(h,'Manual Refund/Overring $','Manual Refund/Overing $','Manual Refund'),
    refundCnt:fc(h,'Refund Cnt','Cash Refund Cnt'),
    refundCash:fc(h,'Refund Cash $','Cash Refund Amt'),
    refundCashless:fc(h,'Refund Cashless $','Cashless Refund Amt'),
    mgrMeal:fc(h,'Mgr Meal $','Manager Meal Amt'),
    mgrMealCnt:fc(h,'Mgr Meal #','Manager Meal Cnt'),
    cashOS:fc(h,'Over/Short $','Cash Over/Short'),
    cashOSPct:fc(h,'Over/Short %','Cash Over/Short %'),
    posOverAmt:fc(h,'POS Overrings $','POS Overings $','POS Overrings Amt'),
    posOverCnt:fcx(h,'POS Overrings','POS Overrings Cnt','POS Overings Cnt'),
    promoAmt:fc(h,'Promo Amt'),promoCnt:fc(h,'Promo #','Promo Cnt','Promo Count'),
    promoPct:fc(h,'Promo Pct','Promo %'),
    tRedBCnt:findCol(h,'T-Red Before Cnt'),tRedBPct:findCol(h,'T-Red Before Pct'),
    tRedBAvg:findCol(h,'T-Red Before Avg'),tRedBDollar:fc(h,'T-Red Before $','T-Red Before Amt'),
    tRedACnt:findCol(h,'T-Red After Cnt'),tRedAPct:findCol(h,'T-Red After Pct'),
    tRedAAvg:findCol(h,'T-Red After Avg'),tRedADollar:fc(h,'T-Red After $','T-Red After Amt')};

  // The Register Audit uses GROUPED ROWS:
  //   Employee summary row: col[emp]='Aaden W', col[loc]='29760', col[date]=null
  //   Detail rows:          col[emp]=null,       col[loc]='29760', col[date]=2026-03-01
  // Strategy: carry-forward the employee name until the next employee row.
  // Also skip the 'Total' grand-total row (first data row after header).

  const rows=[]; let lastEmp=''; let lastLoc='';
  for(let i=hi+1;i<raw.length;i++){
    const r=raw[i]; if(!r) continue;

    const rawEmp = C.emp>=0 ? String(r[C.emp]||'').trim() : '';
    const rawLoc = C.loc>=0 ? String(r[C.loc]||'').trim() : '';
    const rawDate = C.date>=0 ? r[C.date] : null;

    // Skip grand total row (first row, emp='Total', no date)
    if(rawEmp.toLowerCase()==='total') continue;

    // Employee summary row: has name but no date
    if(rawEmp && !/^\d+$/.test(rawEmp) && !rawDate) {
      lastEmp = rawEmp;
      // loc may or may not be on this row — update if present
      if(rawLoc && /^\d+$/.test(rawLoc)) lastLoc = rawLoc;
      continue; // summary row itself has no per-day data
    }

    // Detail row: no employee name (carry forward), must have date and numeric loc
    const loc = (rawLoc && /^\d+$/.test(rawLoc)) ? rawLoc : lastLoc;
    if(!loc) continue;
    const dt = parseXLDate(rawDate); if(!dt) continue;
    const emp = lastEmp || rawEmp; if(!emp) continue;

    rows.push({emp, loc, date:dt,
      drawerSales:parseFloat(r[C.drawerSales])||0,
      avgCheck:parseFloat(r[C.avgCheck])||0,
      drawerOpens:parseFloat(r[C.drawerOpens])||0,
      drawerGC:parseFloat(r[C.drawerGC])||0,
      empMealDisc:parseFloat(r[C.empMealDisc])||0,
      empMealCh:parseFloat(r[C.empMealCh])||0,
      manualRefAmt:parseFloat(r[C.manualRef])||0,
      refundCnt:parseFloat(r[C.refundCnt])||0,
      refundCash:parseFloat(r[C.refundCash])||0,
      refundCashless:parseFloat(r[C.refundCashless])||0,
      mgrMealAmt:parseFloat(r[C.mgrMeal])||0,
      mgrMealCnt:parseFloat(r[C.mgrMealCnt])||0,
      cashOSDollar:parseFloat(r[C.cashOS])||0,
      cashOSPct:parsePct(r[C.cashOSPct]),
      posOverAmt:parseFloat(r[C.posOverAmt])||0,
      posOverCnt:parseFloat(r[C.posOverCnt])||0,
      promoAmt:parseFloat(r[C.promoAmt])||0,
      promoCnt:parseFloat(r[C.promoCnt])||0,
      promoPct:parsePct(r[C.promoPct]),
      tRedBCnt:parseFloat(r[C.tRedBCnt])||0,tRedBPct:parsePct(r[C.tRedBPct]),
      tRedBAvg:parseFloat(r[C.tRedBAvg])||0,tRedBDollar:parseFloat(r[C.tRedBDollar])||0,
      tRedACnt:parseFloat(r[C.tRedACnt])||0,tRedAPct:parsePct(r[C.tRedAPct]),
      tRedAAvg:parseFloat(r[C.tRedAAvg])||0,tRedADollar:parseFloat(r[C.tRedADollar])||0});
  }

  console.log('[McForecast] Register Audit parsed: '+rows.length+' rows, '+
    [...new Set(rows.map(r=>r.emp))].length+' employees, '+
    [...new Set(rows.map(r=>r.loc))].length+' stores');
  return rows;
}

// ── SHIFT MANAGER SUMMARY PARSER ───────────
function parseShiftMgr(wb, sheet) {
  sheet = sheet || wb.SheetNames.find(s=>s.toLowerCase().startsWith('shift manager'))||wb.SheetNames[0];
  const raw=parseRaw(wb,sheet),hi=autoHdrRow(raw),h=raw[hi]||[];
  const C={loc:fc(h,'Loc','Store'),date:fc(h,'Business Date','Date'),
    slice:fc(h,'Time Slice','Daypart','Period'),
    mgr:findCol(h,'Manager Name'),shifts:findCol(h,'# of Shifts'),
    sales:fc(h,'All Net Sales'),oepe:fc(h,'OEPE W/O Parked','OEPE'),
    r2p:fcx(h,'R2P'),avgCheck:findCol(h,'Average Check'),
    kvst:fc(h,'KVS Time Per GC'),kvsu:fcx(h,'KVS Healthy Usage'),
    labor:fc(h,'Punch Labor %','Punched Labor %','Punch Labor'),
    avn:findCol(h,'Act vs Need'),dtSales:findCol(h,'DT Sales')};
  const rows=[];
  for(let i=hi+1;i<raw.length;i++){
    const r=raw[i];if(!r)continue;
    const loc=String(r[C.loc]||'').trim();if(!loc||!/^\d+$/.test(loc))continue;
    const dt=parseXLDate(r[C.date]);if(!dt)continue;
    const slice=String(r[C.slice]||'').trim();
    const mgr=String(r[C.mgr]||'').trim();
    rows.push({loc,date:dt,slice,mgr,
      shifts:parseFloat(r[C.shifts])||1,
      sales:parseFloat(r[C.sales])||0,
      oepe:parseFloat(r[C.oepe])||0,r2p:parseFloat(r[C.r2p])||0,
      avgCheck:parseFloat(r[C.avgCheck])||0,
      kvst:parseFloat(r[C.kvst])||0,kvsu:parsePct(r[C.kvsu]),
      laborPct:parsePct(r[C.labor]),actVsNeed:parseFloat(r[C.avn])||0,
      dtSales:parseFloat(r[C.dtSales])||0});
  }
  return rows;
}

// ── TRENDS REPORT PARSER ─────────────────────
// Weekly aggregated LY comparisons — fiscal weeks (Wed-Tue)
function parseTrends(wb, sheet) {
  sheet = sheet || wb.SheetNames[0];
  const raw=parseRaw(wb,sheet),hi=autoHdrRow(raw),h=raw[hi]||[];
  const C={loc:fc(h,'Loc','Store'),date:fc(h,'Date','Business Date'),
    netSales:findCol(h,'All Net Sales'),netSalesPct:findCol(h,'All Net Sales +/-'),
    prodSales:findCol(h,'Product Sales'),prodSalesPct:findCol(h,'Product Sales +/-'),
    gc:findCol(h,'STW GC'),gcPct:findCol(h,'STW GC +/-'),
    avgCheck:findCol(h,'Average Check'),avgCheckPct:findCol(h,'Average Check +/-')};
  const rows=[];
  for(let i=hi+1;i<raw.length;i++){
    const r=raw[i];if(!r)continue;
    const loc=String(r[C.loc]||'').trim();if(!loc||!/^\d+$/.test(loc))continue;
    // Date is a range string like "3/26/2025 - 4/1/2025" — extract week start
    const dateStr=String(r[C.date]||'').trim();
    const dateMatch=dateStr.match(/(\d+\/\d+\/\d+)/);
    const weekStart=dateMatch?new Date(dateMatch[1]):null;
    if(!weekStart)continue;
    rows.push({loc,date:weekStart,dateLabel:dateStr,
      netSales:parseFloat(r[C.netSales])||0,
      netSalesPct:parsePct(r[C.netSalesPct]),
      prodSales:parseFloat(r[C.prodSales])||0,
      prodSalesPct:parsePct(r[C.prodSalesPct]),
      gc:parseFloat(r[C.gc])||0,gcPct:parsePct(r[C.gcPct]),
      avgCheck:parseFloat(r[C.avgCheck])||0,
      avgCheckPct:parsePct(r[C.avgCheckPct])});
  }
  return rows;
}

// ── RECORDS REPORT PARSER ────────────────────
// Store all-time bests per KPI — used for aspirational targeting & brief context
function parseRecords(wb, sheet) {
  sheet = sheet || wb.SheetNames[0];
  const raw=parseRaw(wb,sheet);
  if(!raw||!raw.length) return {};
  // Records file: Row 0 = group labels (DT Sales, DT Transactions...),
  //               Row 1 = col types (Loc, Value, Date, Value, Date...)
  // autoHdrRow finds 'Loc' at row 1 (hi=1); group labels are at row 0
  const hi = autoHdrRow(raw);
  const hGroup = (hi>0 ? raw[hi-1] : raw[0]) || [];
  const hCols  = raw[hi] || [];
  const locCol = findCol(hCols,'Loc');
  const colPairs = [];
  // Scan group-label row for named KPIs
  for(let i=0;i<hGroup.length;i++){
    const grp=String(hGroup[i]||'').trim();
    if(!grp||grp.toLowerCase()==='loc') continue;
    // Find corresponding Value/Date pair in hCols starting at column i
    for(let j=i;j<Math.min(i+4,hCols.length-1);j++){
      if(String(hCols[j]||'').toLowerCase()==='value'&&
         String(hCols[j+1]||'').toLowerCase()==='date'){
        colPairs.push({label:grp,valCol:j,dateCol:j+1});
        break;
      }
    }
  }
  // Fallback: if no group row, use old single-row approach
  if(!colPairs.length){
    for(let i=0;i<hCols.length-1;i++){
      const cur=String(hCols[i]||'').trim(),next=String(hCols[i+1]||'').trim();
      if(cur&&next.toLowerCase()==='date'&&cur.toLowerCase()!=='date'){
        colPairs.push({label:cur,valCol:i,dateCol:i+1});i++;
      }
    }
  }
  const records={};
  for(let i=hi+1;i<raw.length;i++){
    const r=raw[i];if(!r)continue;
    const loc=String(r[locCol]||'').trim();if(!loc||!/^\d+$/.test(loc))continue;
    const storeRecs={loc};
    for(const{label,valCol,dateCol}of colPairs){
      const val=parseFloat(r[valCol])||0;
      const dt=parseXLDate(r[dateCol]);
      const key=label.replace(/\s+/g,'_').replace(/[^a-zA-Z0-9_]/g,'').toLowerCase();
      if(val>0) storeRecs[key]={value:val,date:dt,label};
    }
    records[loc]=storeRecs;
  }
  return records;
}

// DAILY ACTIVITY REPORT (DAR) PARSER  (v179)
// Parses hourly store metrics (OEPE, GC, Sales, R2P) from DAR file
// Date extracted from filename hint set during file loading.
function parseDARData(wb, dateHint) {
  let dt = dateHint;
  if(!dt||isNaN(dt)) { const m=(wb.SheetNames[0]||'').match(/(\d{4}-\d{2}-\d{1,2})/); if(m)dt=new Date(m[1]+'T12:00:00'); }
  if(!dt||isNaN(dt)) return [];
  const rows=[];
  // Main sheet (service data per hour)
  const s0=wb.SheetNames[0],r0=parseRaw(wb,s0),h0=r0[0]||[];
  const C0={loc:fc(h0,'Loc','Store'),hour:fc(h0,'End Time','Hour'),
    oepe:fc(h0,'OEPE','OEPE W/O Parked'),oepePk:findCol(h0,'OEPE W/O Parked'),
    r2p:findCol(h0,'R2P'),ctp:findCol(h0,'Avg CTP')};
  // Sales sheet
  const s1=wb.SheetNames.find(s=>s.toLowerCase()==='sales')||wb.SheetNames[1];
  const r1=s1?parseRaw(wb,s1):[],h1=r1[0]||[];
  const C1={loc:fc(h1,'Loc','Store'),hour:fc(h1,'End Time','Hour'),
    sales:fc(h1,'All Net Sales'),gc:findCol(h1,'STW GC'),check:findCol(h1,'All Net Avg Check')};
  const salMap={};
  for(let i=1;i<r1.length;i++){const r=r1[i];if(!r||r[C1.loc]==null)continue;
    const k=String(r[C1.loc]).trim()+'_'+(r[C1.hour]||'');
    salMap[k]={sales:r[C1.sales]||0,gc:r[C1.gc]||0,check:r[C1.check]||0};}
  for(let i=1;i<r0.length;i++){const r=r0[i];if(!r||r[C0.loc]==null)continue;
    const loc=String(r[C0.loc]).trim(),hour=r[C0.hour]||'',sal=salMap[loc+'_'+hour]||{};
    rows.push({loc,date:dt,hour,oepe:parseFloat(r[C0.oepe])||0,
      oepePk:parseFloat(r[C0.oepePk])||0,r2p:parseFloat(r[C0.r2p])||0,
      ctp:parseFloat(r[C0.ctp])||0,sales:sal.sales||0,gc:sal.gc||0,check:sal.check||0});}
  return rows;
}

// PRODUCT MIX PARSER  (v179)
// Parses item-level unit sales; aggregates by Family Group
function parsePMixData(wb) {
  const sh=wb.SheetNames.find(s=>s.toLowerCase().includes('pmix')||s.toLowerCase().includes('product mix'))||wb.SheetNames[0];
  const raw=parseRaw(wb,sh),hi=autoHdrRow(raw,3),h=raw[hi]||[];
  const C={item:fc(h,'Menu Item #','Item #','Item'),units:fc(h,'Units Sold','Units'),
    disc:fc(h,'Disc Qty','Discount Qty'),discAmt:fc(h,'Offer Discount $'),
    desc:fc(h,'Desc','Description'),family:fc(h,'Family Group','Category')};
  const rows=[],byFamily={};
  for(let i=hi+1;i<raw.length;i++){const r=raw[i];if(!r||r[C.item]==null)continue;
    const fam=r[C.family]||'Other',units=parseFloat(r[C.units])||0;
    rows.push({item:r[C.item],units,disc:parseFloat(r[C.disc])||0,
      discAmt:parseFloat(r[C.discAmt])||0,desc:r[C.desc]||'',family:fam});
    if(!byFamily[fam])byFamily[fam]={family:fam,units:0,disc:0,items:0};
    byFamily[fam].units+=units;byFamily[fam].disc+=parseFloat(r[C.disc])||0;byFamily[fam].items++;}
  return {rows,byFamily};
}


// ── PEAK ANALYTICS ───────────────────────────
// Compute 6-week peak averages and trend for each time slice

// ── TRENDS VALIDATION ────────────────────────
// Cross-check engine trend vs QSRSoft reported trend
function validateTrend(trendsRows, loc, engineT2W) {
  const recent=trendsRows.filter(r=>r.loc===loc).sort((a,b)=>b.date-a.date);
  if(!recent.length)return null;
  const lastWk=recent[0];
  const diff=Math.abs((engineT2W||0)-lastWk.netSalesPct);
  return{qsrTrend:lastWk.netSalesPct,engineTrend:engineT2W||0,
    variance:diff,aligned:diff<.02,
    label:diff<.01?'Confirmed':diff<.02?'Close match':'Diverging — review LY data'};
}

function autoDetectSheets(wb){
  const n=wb.SheetNames;
  return{
    // Match 'Sales 2022-...' or 'Labor Analysis' or first sheet
    labor:n.find(s=>s.toLowerCase().startsWith('sales '))||n.find(s=>s.toLowerCase().includes('labor'))||n[0],
    ops:n.find(s=>s.toLowerCase()==='service'||s.toLowerCase().startsWith('service '))||null,
    ctrl:n.find(s=>s.toLowerCase()==='controls'||s.toLowerCase().startsWith('controls '))||null,
    weather:n.find(s=>s.toLowerCase().includes('weather'))||null,
    targets:n.find(s=>s.toLowerCase().includes('target'))||null,
    fob:n.find(s=>s.toLowerCase()==='fob'||s.toLowerCase().startsWith('fob '))||null,
    sales:n.find(s=>s.toLowerCase()==='sales')||null
  };
}

export { parseXLDate, findCol, fc, fcx, autoHdrRow, parseRaw, parsePct, parseProjectionsFile, applyProjectionsToTargets, sniffSheetType, detectType, parseLaborData, parseOpsData, parseCtrlData, parseWeatherData, parseTargets, parse3PeaksService, parse3PeaksSales, parseFOBData, parseRegisterAudit, parseShiftMgr, parseTrends, parseRecords, parseDARData, parsePMixData, validateTrend, autoDetectSheets };
