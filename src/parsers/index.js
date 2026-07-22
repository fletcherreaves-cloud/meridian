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
// Strip $ and , from QSRSoft CSV monetary strings before parseFloat
function parseNum(v){if(v===null||v===undefined||v==='')return 0;return parseFloat(String(v).replace(/[$,]/g,''))||0;}

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
  // SMG VOICE Operator Performance Report — must come before the generic 'voice' check below
  if(ext==='pdf'&&/^mcdonalds_voice_operator_performance_\d+/i.test(fn))return{type:'voice-performance',label:'SMG VOICE Performance Report',dr,confidence:'high'};
  // SMG VOICE Customer Comment Report (PDF filename pattern: eu065119100...)
  if(ext==='pdf'&&/^eu\d{10,}/i.test(fn))return{type:'smg-voice',label:'SMG VOICE Comment Report',dr,confidence:'high'};
  if(ext==='pdf'&&(fn.includes('voice')||fn.includes('comment report')||fn.includes('customer comment')))return{type:'smg-voice',label:'SMG VOICE Comment Report',dr,confidence:'high'};
  if(ext==='xlsx'&&(fn.includes('fullscale')||fn.includes('full_scale')||fn.includes('full scale')))return{type:'smg-fullscale',label:'SMG FullScale Report',dr,confidence:'high'};
  // Sheet-name fallback: SMG FullScale workbooks always have a "Small Graph" sheet
  if(ext==='xlsx'&&wb&&wb.SheetNames&&wb.SheetNames.some(s=>s.toLowerCase().includes('small graph')))return{type:'smg-fullscale',label:'SMG FullScale Report',dr,confidence:'high'};
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
  // MBI Labor Analysis (weekly FLH worksheet) — must precede the generic
  // 'labor analysis' match since the file is named "MBI_Labor_Analysis.xlsx".
  if(fn.includes('mbi')&&(fn.includes('labor analysis')||fn.includes('labor_analysis')))return{type:'mbi-labor',label:'MBI Labor Analysis (FLH)',dr,confidence:'high'};
  // LifeLenz People List (Simple CSV) → Crew Skills Matrix
  if(fn.includes('people_list')||fn.includes('people list'))return{type:'people-skills',label:'Crew Skills (People List)',dr,confidence:'high'};
  // LifeLenz Labor Analysis Summary Report (must come before generic 'labor analysis' match)
  // Matches both space-separated and underscore-separated filenames from the sync script
  if(fn.includes('labor analysis summary report')||fn.includes('labor_analysis_summary_report'))return{type:'ll-labor',label:'LifeLenz Labor Analysis',dr,confidence:'high'};
  // Labor Analysis
  if(fn.startsWith('labor analysis')||fn.includes('labor analysis')||fn.includes('labor_analysis'))return{type:'labor',label:'Labor Analysis',dr,confidence:'high'};
  // Service → OpsData
  // Service → OpsData (QSRSoft sheet/file naming)
  if(fn.startsWith('service ')||fn==='service')return{type:'ops',label:'OpsData (Service)',dr,confidence:'high'};
  // Controls → ControlsData (QSRSoft sheet/file naming)
  // NOTE: In the 4-sheet workbook Service=OpsData, Controls=ControlsData
  // Standalone downloads follow the same convention
  if(fn.startsWith('controls ')||fn==='controls')return{type:'ctrl',label:'ControlsData (Controls)',dr,confidence:'high'};
  // OpsTargets
  if(fn.includes('target'))return{type:'targets',label:'OpsTargets',dr,confidence:'high'};
  // ── QSRSoft email report types (must come before fuzzy matches) ─────────────
  if(fn.includes('sales ledger')||fn.includes('sales_ledger'))            return{type:'sales-ledger',      label:'QSRSoft Sales Ledger',       dr,confidence:'high'};
  if(fn.includes('daily glimpse')||fn.includes('daily_glimpse'))          return{type:'daily-glimpse',     label:'QSRSoft Daily Glimpse',      dr,confidence:'high'};
  if(fn.includes('cash sheet')||fn.includes('cash_sheet'))                return{type:'cash-sheet',        label:'QSRSoft Cash Sheet',         dr,confidence:'high'};
  if(fn.includes('labor exception')||fn.includes('labor_exception'))      return{type:'labor-exceptions',  label:'QSRSoft Labor Exceptions',   dr,confidence:'high'};
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
    const flrNeed=parseNum(r[C.flrNeed]);
    const flrSch=parseNum(r[C.flrSch]);
    const laborPctVal=parsePct(r[C.labor])||parsePct(r[C.crewLaborPct])||parsePct(r[C.totalLaborPct]);
    rows.push({loc,date:dt,isPeriodSummary:!!_summaryDate,
      sales:parseNum(r[C.sales])||parseNum(r[C.allNetSales]),
      allNetSales:parseNum(r[C.allNetSales]),
      projSales:parseNum(r[C.proj]),
      gc:parseNum(r[C.gc]),actualGC:parseNum(r[C.actualGC]),
      oppCostPct:parsePct(r[C.opp]),oppCostDollar:parseNum(r[C.oppD]),
      avgCheck:parseNum(r[C.avgChk]),tpph:parseNum(r[C.tpph]),spph:parseNum(r[C.spph]),
      actVsNeed:parseNum(r[C.avn]),laborPct:laborPctVal,
      otHrs:parseNum(r[C.otHrs]),otDollar:parseNum(r[C.otD]),
      actHrs:parseNum(r[C.actHrs]),avgRate:parseNum(r[C.avgRate]),
      salaryMgrHrs:parseNum(r[C.salMgr]),
      fixedContractHrs:parseNum(r[C.fixCon]),fixedSchedHrs:parseNum(r[C.fixSch]),
      variableNeeded:parseNum(r[C.varNeed]),
      floorMgmtNeeded:flrNeed,floorHrsSched:flrSch,
      floorCompliance:flrNeed>0?flrSch/flrNeed:null,
      // Channel sales breakdown
      salesVsLYPct:parseNum(r[C.salesVsLYPct])||null,
      dtSales:parseNum(r[C.dtSales]),dtGC:parseNum(r[C.dtGC]),dtAvgChk:parseNum(r[C.dtAvgChk]),dtPctTotal:parsePct(r[C.dtPctTotal]),
      bfSales:parseNum(r[C.bfSales]),bfGC:parseNum(r[C.bfGC]),bfAvgChk:parseNum(r[C.bfAvgChk]),bfPctTotal:parsePct(r[C.bfPctTotal]),
      delivSales:parseNum(r[C.delivSales]),delivGC:parseNum(r[C.delivGC]),delivAvgChk:parseNum(r[C.delivAvgChk]),delivPctTotal:parsePct(r[C.delivPctTotal]),
      mopSales:parseNum(r[C.mopSales]),mopGC:parseNum(r[C.mopGC]),mopAvgChk:parseNum(r[C.mopAvgChk]),mopPctTotal:parsePct(r[C.mopPctTotal]),
      kioskSales:parseNum(r[C.kioskSales]),kioskGC:parseNum(r[C.kioskGC]),kioskAvgChk:parseNum(r[C.kioskAvgChk]),kioskPctTotal:parsePct(r[C.kioskPctTotal]),
      eatInSales:parseNum(r[C.eatInSales]),eatInGC:parseNum(r[C.eatInGC]),
      inStoreSales:parseNum(r[C.inStoreSales]),inStoreGC:parseNum(r[C.inStoreGC]),inStorePctTotal:parsePct(r[C.inStorePctTotal]),
      fcSales:parseNum(r[C.fcSales]),fcGC:parseNum(r[C.fcGC]),fcPctTotal:parsePct(r[C.fcPctTotal])});
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

// Guard: does an Operations Report workbook carry per-day rows? A daily report
// has a Business Date column on its Sales/Service sheet; a period-summary export
// does not. We refuse period summaries — daily rows are the source of truth and
// any period figure is computed from them. Returns true when daily (or when the
// workbook isn't an ops-style sheet we should block), false for a period summary.
function opsReportIsDaily(wb){
  const names=(wb&&wb.SheetNames)||[];
  const hasDateCol=pred=>{
    const sn=names.find(s=>pred(String(s).toLowerCase()));
    if(!sn) return null; // sheet not present
    const raw=parseRaw(wb,sn); const h=raw[autoHdrRow(raw)]||[];
    return fc(h,'Business Date','Date','Period')>=0;
  };
  const checks=[hasDateCol(s=>s==='sales'||s.startsWith('sales ')),
                hasDateCol(s=>s==='service'||s.startsWith('service '))].filter(v=>v!==null);
  if(!checks.length) return true; // no recognizable Sales/Service sheet — don't block
  return checks.some(Boolean);
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
  const raw=parseRaw(wb,sheet);
  // targets files may use 'Restaurant' or 'Loc' as the store column — autoHdrRow only finds 'loc'
  const hi=(()=>{for(let i=0;i<Math.min(6,raw.length);i++){const r=raw[i]||[];if(r.some(c=>c&&/^(loc|store|restaurant|index)$/i.test(String(c).trim())))return i;}return autoHdrRow(raw);})();
  const h=raw[hi]||[];
  const C={
    loc:         fc(h,'Loc','Store','Restaurant'),
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
    const rawLoc=String(r[C.loc]||'').trim();
    // Support plain "3708" and "3708 - ARDMORE-BROADWAY" (Restaurant column format)
    const locM=rawLoc.match(/^(\d+)/);
    const loc=locM?locM[1]:'';
    if(!loc)continue;
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
  console.log(`[Targets] hdrRow=${hi} locCol=${C.loc} fobBaseCol=${C.fobBase} parsed=${Object.keys(targets).length} stores`, Object.keys(targets).slice(0,3).map(l=>({loc:l,tFOBBase:targets[l].tFOBBase,tLabor:targets[l].tLabor})));
  return targets;
}

// ── MONTHLY TARGETS PARSER ─────────────────────────────────────────────────
// Reads monthly projections file (Table 1 (2) sheet) — per-store food cost,
// labor, TPPH, and FOB component targets. Monthly values take priority over yearly.
function parseMonthlyTargets(wb){
  // Try 'Table 1 (2)' first, fall back to first sheet
  const sheetName=wb.SheetNames.includes('Table 1 (2)')?'Table 1 (2)':wb.SheetNames[0];
  const raw=parseRaw(wb,sheetName);
  // Header row: contains 'restaurant' AND ('base food' or 'fob target')
  let hi=-1;
  for(let i=0;i<Math.min(5,raw.length);i++){
    const joined=(raw[i]||[]).map(c=>String(c||'').toLowerCase()).join(' ');
    if(joined.includes('restaurant')&&(joined.includes('base food')||joined.includes('fob target'))){hi=i;break;}
  }
  if(hi<0){console.log('[MonthlyTargets] header row not found');return {};}
  const h=raw[hi]||[];
  const C={
    loc:        fc(h,'Restaurant'),
    crewLabor:  fc(h,'Crew Labor %'),
    bonusLabor: fc(h,'Bonus Crew Labor%','Bonus Crew Labor'),
    tpph:       fc(h,'TPPH\nTarget','TPPH Target','TPPH\r\nTarget'),
    labor:      fc(h,'Combined Labor %'),
    fobBase:    fc(h,'Base Food\n%','Base Food %','Base Food\r\n%'),
    discCoup:   fc(h,'Disc Coup %'),
    compWaste:  fc(h,'Comp Waste %'),
    rawWaste:   fc(h,'Raw Waste %'),
    condiment:  fc(h,'Condiment\n%','Condiment %','Condiment\r\n%'),
    empFood:    fc(h,'Emp Food\n%','Emp Food %','Emp Meal %','Emp Food\r\n%'),
    statLoss:   fc(h,'Stat Loss\n%','Stat Loss %','Stat Loss\r\n%'),
    unex:       fc(h,'Unex Diff\n%','Unex Diff %','Unex Diff\r\n%'),
    fobTarget:  fc(h,'FOB Target w/o Disc Coup','FOB Target'),
    fobTotal:   fc(h,'Total Food Cost\n%','Total Food Cost %','Total Food Cost\r\n%'),
    fobBonus:   fc(h,'Bonus Food Over Base Target','Bonus Food'),
    paperCost:  fc(h,'P &. L Paper Cost %','P & L Paper Cost %','Paper Cost %'),
    opSupply:   fc(h,'Op Supply Target'),
    salesProj:  fc(h,'Sales Projection'),
  };
  const targets={};
  for(let i=hi+1;i<raw.length;i++){
    const r=raw[i]; if(!r)continue;
    const rawLoc=String(r[C.loc]||'').trim();
    const m=rawLoc.match(/^(\d{4,6})/); if(!m)continue;
    const loc=m[1];
    const t={};
    if(C.crewLabor>=0&&parsePct(r[C.crewLabor]))  t.tCrewLabor=parsePct(r[C.crewLabor]);
    if(C.bonusLabor>=0&&parsePct(r[C.bonusLabor])) t.tBonusLabor=parsePct(r[C.bonusLabor]);
    if(C.tpph>=0&&parseFloat(r[C.tpph]))           t.tTpph=parseFloat(r[C.tpph]);
    if(C.labor>=0&&parsePct(r[C.labor]))            t.tLabor=parsePct(r[C.labor]);
    if(C.fobBase>=0&&parsePct(r[C.fobBase]))        t.tFOBBase=parsePct(r[C.fobBase]);
    if(C.discCoup>=0&&parsePct(r[C.discCoup]))      t.tDiscCoupPct=parsePct(r[C.discCoup]);
    if(C.compWaste>=0&&parsePct(r[C.compWaste]))    t.tCompWaste=parsePct(r[C.compWaste]);
    if(C.rawWaste>=0&&parsePct(r[C.rawWaste]))      t.tRawWaste=parsePct(r[C.rawWaste]);
    if(C.condiment>=0&&parsePct(r[C.condiment]))    t.tCondiment=parsePct(r[C.condiment]);
    if(C.empFood>=0&&parsePct(r[C.empFood]))        t.tEmpFood=parsePct(r[C.empFood]);
    if(C.statLoss>=0&&parsePct(r[C.statLoss]))      t.tStatLoss=parsePct(r[C.statLoss]);
    if(C.unex>=0)                                   t.tUnex=parsePct(r[C.unex]);
    if(C.fobTarget>=0&&parsePct(r[C.fobTarget]))    t.tFOBTarget=parsePct(r[C.fobTarget]);
    if(C.fobTotal>=0&&parsePct(r[C.fobTotal]))      t.tFOBTotal=parsePct(r[C.fobTotal]);
    if(C.fobBonus>=0&&parsePct(r[C.fobBonus]))      t.tFOBBonusBase=parsePct(r[C.fobBonus]);
    if(C.paperCost>=0&&parsePct(r[C.paperCost]))    t.tPaperCost=parsePct(r[C.paperCost]);
    if(C.opSupply>=0&&parseFloat(r[C.opSupply]))    t.tOpSupply=parseFloat(r[C.opSupply]);
    if(C.salesProj>=0&&parseFloat(r[C.salesProj]))  t.tProdSales=parseFloat(r[C.salesProj]);
    if(Object.keys(t).length>0) targets[loc]=t;
  }
  console.log(`[MonthlyTargets] sheet='${sheetName}' hdr=${hi} loc=${C.loc} fobBase=${C.fobBase} parsed=${Object.keys(targets).length} stores`,Object.keys(targets).slice(0,2).map(l=>({loc:l,tFOBBase:targets[l].tFOBBase,tFOBTarget:targets[l].tFOBTarget,tLabor:targets[l].tLabor})));
  return targets;
}

// ── YEARLY TARGETS PARSER ──────────────────────────────────────────────────
// Reads MCDOK yearly targets file (Table 1 sheet) — OEPE/Park/KVS/R2P/Labor/TPPH.
// Yearly values are the baseline; monthly targets override when available.
function parseYearlyTargets(wb){
  const sheetName=wb.SheetNames.includes('Table 1')?'Table 1':wb.SheetNames[0];
  const raw=parseRaw(wb,sheetName);
  // Header row: contains 'OEPE' and 'Park'
  let hi=-1;
  for(let i=0;i<Math.min(6,raw.length);i++){
    const joined=(raw[i]||[]).map(c=>String(c||'').toLowerCase()).join(' ');
    if(joined.includes('oepe')&&joined.includes('park')){hi=i;break;}
  }
  if(hi<0){console.log('[YearlyTargets] header row not found');return {};}
  const h=raw[hi]||[];
  // First 'Restaurant' column is the loc; all others are repeated for layout
  const locCol=h.findIndex(c=>String(c||'').toLowerCase().trim()==='restaurant');
  const C={
    loc:    locCol,
    oepe:   fc(h,'OEPE\nPACE','OEPE PACE','OEPE\r\nPACE'),
    park:   fc(h,'Park %'),
    kvst:   fc(h,'KVS\nPACE','KVS PACE','KVS\r\nPACE'),
    kvsu:   fc(h,'Healthy Use 2nd\nSide','Healthy Use','KVS Usage','Healthy Use 2nd\r\nSide'),
    r2p:    fc(h,'FC R2P PACE','R2P PACE','R2P'),
    tpph:   fc(h,'TPPH'),
    labor:  fc(h,'Labor'),
    fobT:   fc(h,'Food Over Base','FOB'),
  };
  const targets={};
  for(let i=hi+1;i<raw.length;i++){
    const r=raw[i]; if(!r)continue;
    const rawLoc=String(r[C.loc]||'').trim();
    const m=rawLoc.match(/^(\d{4,6})/); if(!m)continue;
    const loc=m[1];
    const t={};
    if(C.oepe>=0&&parseFloat(r[C.oepe]))  t.tOepe=parseFloat(r[C.oepe]);
    if(C.park>=0&&parsePct(r[C.park]))    t.tPark=parsePct(r[C.park]);
    if(C.kvst>=0&&parseFloat(r[C.kvst]))  t.tKvst=parseFloat(r[C.kvst]);
    if(C.kvsu>=0&&parsePct(r[C.kvsu]))    t.tKvsu=parsePct(r[C.kvsu]);
    if(C.r2p>=0&&parseFloat(r[C.r2p]))    t.tR2p=parseFloat(r[C.r2p]);
    if(C.tpph>=0&&parseFloat(r[C.tpph]))  t.tTpph=parseFloat(r[C.tpph]);
    if(C.labor>=0&&parsePct(r[C.labor]))  t.tLabor=parsePct(r[C.labor]);
    if(C.fobT>=0&&parsePct(r[C.fobT]))    t.tFOBTarget=parsePct(r[C.fobT]);
    if(Object.keys(t).length>0) targets[loc]=t;
  }
  console.log(`[YearlyTargets] sheet='${sheetName}' hdr=${hi} parsed=${Object.keys(targets).length} stores`,Object.keys(targets).slice(0,2).map(l=>({loc:l,...targets[l]})));
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


// ── QSRSoft: Sales Ledger ────────────────────────────────────────────────────
// Daily per-store channel sales with LY comparisons.
// Column layout mirrors Labor Analysis (parseLaborData already reads these),
// so route to parseLaborData — labor fields (actHrs etc.) will be 0.
// The LY and YOY columns are parsed here and stored on salesLYPct / salesLY.
function parseSalesLedger(wb, filename){
  // Find sheet: "Sales Ledger" or "Sales" or first sheet
  const sn=wb.SheetNames.find(s=>s.toLowerCase().includes('sales ledger'))
          ||wb.SheetNames.find(s=>s.toLowerCase()==='sales'||s.toLowerCase().startsWith('sales '))
          ||wb.SheetNames[0];
  const raw=parseRaw(wb,sn),hi=autoHdrRow(raw),h=raw[hi]||[];
  // QSRSoft CSV has no Date column — extract from filename (e.g. sales_ledger_daily_2026-06-30.csv)
  const _dm=(filename||'').match(/(\d{4}-\d{2}-\d{2})/);
  const _dateHint=_dm?new Date(_dm[1]+'T12:00:00'):new Date();
  const C={
    loc:   fc(h,'Loc','Location'),
    date:  fc(h,'Date','Business Date'),
    allNetSales: fc(h,'All Net Sales'),
    allNetSalesLY: findCol(h,'All Net Sales LY'),
    salesVsLYPct: findCol(h,'All Net Sales +/- %','All Net Sales YOY %'),
    gc:    fc(h,'STW GC','GC'),
    avgCheck: fc(h,'Average Check','Avg Check'),
    dtSales:  findCol(h,'DT Sales'),
    dtGC:     findCol(h,'DT GC'),
    dtAvgChk: findCol(h,'DT Average Check'),
    dtPctTotal: findCol(h,'DT % of Total Sales'),
    bfSales: fc(h,'Breakfast Net Sales','Breakfast All Net Sales','BF Net Sales'),
    bfGC:    fc(h,'Breakfast GC','BF GC'),
    bfAvgChk:fc(h,'Breakfast Average Check','BF Average Check'),
    bfPctTotal:fc(h,'Breakfast % of Total Sales','BF % of Total Sales','Breakfast %'),
    delivSales: fc(h,'McDelivery Net Sales','McDelivery All Net Sales','Delivery Net Sales'),
    delivGC:    fc(h,'McDelivery GC','Delivery GC'),
    delivAvgChk:fc(h,'McDelivery Average Check','Delivery Average Check'),
    delivPctTotal:fc(h,'McDelivery % of Total Sales','Delivery % of Total Sales'),
    mopSales: fc(h,'MOP Sales','MOP Net Sales','Mobile Order and Pay Net Sales'),
    mopGC:    fc(h,'MOP GC','MOP GCs'),
    mopAvgChk:fc(h,'MOP Average Check'),
    mopPctTotal:fc(h,'MOP Sales %','MOP % of Total Sales','MOP %'),
    kioskSales: fc(h,'Kiosk All Net Sales','Kiosk Net Sales'),
    kioskGC:    fc(h,'Kiosk GC'),
    kioskAvgChk:fc(h,'Kiosk Average Check'),
    kioskPctTotal:fc(h,'Kiosk % of Total Sales','Kiosk %'),
    fcSales: findCol(h,'FC All Net Sales'),
    fcGC:    findCol(h,'FC GC'),
    fcPctTotal:findCol(h,'FC % of Total Sales'),
    inStoreSales: findCol(h,'In-Store All Net Sales'),
    inStoreGC:    findCol(h,'In-Store GC'),
    inStorePctTotal:findCol(h,'In-Store % of Total Sales'),
    eatInSales: findCol(h,'Eat in Sales'),
    eatInGC:    findCol(h,'Eat in GC'),
  };
  const rows=[];
  for(let i=hi+1;i<raw.length;i++){
    const r=raw[i];if(!r)continue;
    const loc=String(r[C.loc]||'').trim();if(!loc||!/^\d+$/.test(loc))continue;
    const dt=C.date>=0?parseXLDate(r[C.date]):_dateHint;if(!dt)continue;
    rows.push({loc,date:dt,
      sales:parseNum(r[C.allNetSales]),
      allNetSales:parseNum(r[C.allNetSales]),
      allNetSalesLY:C.allNetSalesLY>=0?parseNum(r[C.allNetSalesLY]):0,
      salesVsLYPct:C.salesVsLYPct>=0?parsePct(r[C.salesVsLYPct]):null,
      gc:parseNum(r[C.gc]),
      avgCheck:parseNum(r[C.avgCheck]),
      dtSales:parseNum(r[C.dtSales]),dtGC:parseNum(r[C.dtGC]),
      dtAvgChk:parseNum(r[C.dtAvgChk]),dtPctTotal:parsePct(r[C.dtPctTotal]),
      bfSales:parseNum(r[C.bfSales]),bfGC:parseNum(r[C.bfGC]),
      bfAvgChk:parseNum(r[C.bfAvgChk]),bfPctTotal:parsePct(r[C.bfPctTotal]),
      delivSales:parseNum(r[C.delivSales]),delivGC:parseNum(r[C.delivGC]),
      delivAvgChk:parseNum(r[C.delivAvgChk]),delivPctTotal:parsePct(r[C.delivPctTotal]),
      mopSales:parseNum(r[C.mopSales]),mopGC:parseNum(r[C.mopGC]),
      mopAvgChk:parseNum(r[C.mopAvgChk]),mopPctTotal:parsePct(r[C.mopPctTotal]),
      kioskSales:parseNum(r[C.kioskSales]),kioskGC:parseNum(r[C.kioskGC]),
      kioskAvgChk:parseNum(r[C.kioskAvgChk]),kioskPctTotal:parsePct(r[C.kioskPctTotal]),
      fcSales:parseNum(r[C.fcSales]),fcGC:parseNum(r[C.fcGC]),
      fcPctTotal:parsePct(r[C.fcPctTotal]),
      inStoreSales:parseNum(r[C.inStoreSales]),inStoreGC:parseNum(r[C.inStoreGC]),
      inStorePctTotal:parsePct(r[C.inStorePctTotal]),
      eatInSales:parseNum(r[C.eatInSales]),eatInGC:parseNum(r[C.eatInGC]),
      // Labor fields stub — Sales Ledger has no labor data
      laborPct:0,actHrs:0,otHrs:0,tpph:0,spph:0,
    });
  }
  return rows;
}


// ── QSRSoft: Daily Glimpse ───────────────────────────────────────────────────
// Single-day per-store snapshot: sales, controls, OEPE, digital, daypart counts.
// Has a 2-row header: row 0 = section groupings, row 1 = column names with 'Loc'.
// autoHdrRow finds row 1 automatically.
function parseDailyGlimpse(wb, dateHint){
  const sn=wb.SheetNames.find(s=>s.toLowerCase().includes('glimpse'))
          ||wb.SheetNames.find(s=>s.toLowerCase().includes('daily'))
          ||wb.SheetNames[0];
  const raw=parseRaw(wb,sn);
  // autoHdrRow scans first 5 rows for one containing 'loc' — finds row 1 (row 0 is section labels)
  const hi=autoHdrRow(raw,6),h=raw[hi]||[];
  const C={
    loc:    fc(h,'Loc','Location'),
    allNetSales: fc(h,'All Net Sales'),
    salesVsPrior: findCol(h,'Sales +/-'),
    salesVsPriorMtd: findCol(h,'Sales +/- MTD'),
    salesVsPriorPct: findCol(h,'All Net Sales +/- %','+/- %'),
    dtSales: fc(h,'DT Sales','DT Net Sales'),
    dtGC:    fc(h,'DT GC','DT Guest Count'),
    dtAvgCheck: fc(h,'DT Average Check','DT Avg Check'),
    stwGC:   fc(h,'STW GC','Total GC'),
    avgCheck:fc(h,'Average Check','Avg Check'),
    laborPct: findCol(h,'Punch Labor %','Punched Labor %'),
    laborPctMtd: findCol(h,'Punch Labor % MTD'),
    promoAmt: fc(h,'Promo Amt','Promo Amount'),
    promoPct: fc(h,'Promo Pct','Promo %','Promo Percent'),
    posOverCnt: fc(h,'POS Overrings Cnt','POS Overring Count','POS Overrings Count'),
    posOverAmt: fc(h,'POS Overrings Amt','POS Overring Amount','POS Overrings Amount'),
    cashOS:    fc(h,'Cash Over/Short $','Cash Over Short $','Cash O/S $'),
    cashOSPct: fc(h,'Cash Over/Short %','Cash Over Short %','Cash O/S %'),
    tRedVoidCnt:    fc(h,'T Red After: Voided','T-Red After Voided','Voided Cnt','T Red Voided'),
    tRedDeletedCnt: fc(h,'T Red After: Deleted','T-Red After Deleted','Deleted Cnt','T Red Deleted'),
    oepe:     fc(h,'OEPE W/O Parked','OEPE Without Parked','OEPE W/o Parked'),
    oepeFull: fc(h,'OEPE W/ Parked','OEPE With Parked','OEPE w/ Parked'),
    parkedPct:fc(h,'Parked %','DT Parked %'),
    kvst:     fc(h,'KVS Time Per GC','KVS Time/GC','KVS Time'),
    kvsItems: fc(h,'KVS Items / GC','KVS Items/GC'),
    kvsHealthy:fc(h,'KVS Healthy Usage','KVS Healthy %'),
    brkCarCnt:fc(h,'Brk 7am-9am','Brk 7am','Breakfast 7am'),
    luCarCnt: fc(h,'Lu 11am-2pm','Lu 11am','Lunch 11am'),
    dnCarCnt: fc(h,'Dn 5pm-7pm','Dn 5pm','Dinner 5pm'),
    digitalPctSales:    fc(h,'Total Digital % of Sales'),
    digitalPctSalesMtd: findCol(h,'Total Digital % of Sales MTD'),
    appPctSales:        fc(h,'Digital App Percent of Sales','App % of Sales'),
  };
  const rows=[];
  for(let i=hi+1;i<raw.length;i++){
    const r=raw[i];if(!r)continue;
    const loc=String(r[C.loc]||'').trim();
    if(!loc||!/^\d+$/.test(loc))continue;
    rows.push({loc,date:dateHint||new Date(),
      allNetSales:parseNum(r[C.allNetSales]),
      salesVsPrior:parseNum(r[C.salesVsPrior]),
      salesVsPriorPct:parsePct(r[C.salesVsPriorPct]),
      dtSales:parseNum(r[C.dtSales]),
      dtGC:parseNum(r[C.dtGC]),
      dtAvgCheck:parseNum(r[C.dtAvgCheck]),
      gc:parseNum(r[C.stwGC]),
      avgCheck:parseNum(r[C.avgCheck]),
      laborPct:parsePct(r[C.laborPct]),
      promoAmt:parseNum(r[C.promoAmt]),
      promoPct:parsePct(r[C.promoPct]),
      posOverCnt:parseNum(r[C.posOverCnt]),
      posOverAmt:parseNum(r[C.posOverAmt]),
      cashOS:parseNum(r[C.cashOS]),
      cashOSPct:parsePct(r[C.cashOSPct]),
      tRedVoidCnt:parseNum(r[C.tRedVoidCnt]),
      tRedDeletedCnt:parseNum(r[C.tRedDeletedCnt]),
      oepe:parseNum(r[C.oepe]),
      oepeFull:parseNum(r[C.oepeFull]),
      parkedPct:parsePct(r[C.parkedPct]),
      kvst:parseNum(r[C.kvst]),
      kvsItems:parseNum(r[C.kvsItems]),
      kvsHealthy:parsePct(r[C.kvsHealthy]),
      brkCarCnt:parseNum(r[C.brkCarCnt]),
      luCarCnt:parseNum(r[C.luCarCnt]),
      dnCarCnt:parseNum(r[C.dnCarCnt]),
      digitalPctSales:parsePct(r[C.digitalPctSales]),
      appPctSales:parsePct(r[C.appPctSales]),
    });
  }
  return rows;
}


// ── QSRSoft: Cash Sheet ──────────────────────────────────────────────────────
// Daily per-store cash management + 3PO delivery platform breakdown.
// Subtotal rows ("Total 3708", "Grand Total") are filtered by loc pattern.
function parseCashSheet(wb, filename){
  const sn=wb.SheetNames.find(s=>s.toLowerCase().includes('cash'))
          ||wb.SheetNames[0];
  const raw=parseRaw(wb,sn),hi=autoHdrRow(raw),h=raw[hi]||[];
  // QSRSoft CSV has no Date column — extract from filename (e.g. cash_sheet_daily_2026-06-30.csv)
  const _dm=(filename||'').match(/(\d{4}-\d{2}-\d{2})/);
  const _dateHint=_dm?new Date(_dm[1]+'T12:00:00'):new Date();
  const C={
    loc:   fc(h,'Loc','Location'),
    date:  fc(h,'Date','Business Date'),
    allNetSales: fc(h,'Net Sales','All Net Sales'),
    gc:    fc(h,'STW GC','GC','Guest Count'),
    avgCheck:fc(h,'Average Check','Avg Check'),
    // 3PO platforms — actual QSRSoft CSV column names
    doorDashSales: findCol(h,'DoorDash Delivery Amt','DoorDash Net Sales','DoorDash Sales'),
    doorDashGC:    findCol(h,'DoorDash Delivery Qty','DoorDash GC','DoorDash Guest'),
    uberEatsSales: findCol(h,'UberEats Delivery Amt','UberEats Delivery Amt Total','UberEats Net Sales','Uber Eats Net Sales','UberEats Sales'),
    uberEatsGC:    findCol(h,'UberEats Delivery Qty','UberEats Delivery Qty Total','UberEats GC','Uber Eats GC','UberEats Guest'),
    grubhubSales:  findCol(h,'GrubHub Delivery Amt','GrubHub Delivery Amt Total','Grubhub Net Sales','GrubHub Net Sales','Grubhub Sales'),
    grubhubGC:     findCol(h,'GrubHub Delivery Qty','GrubHub Delivery Qty Total','Grubhub GC','GrubHub GC','Grubhub Guest'),
    total3poSales: fc(h,'Delivery Total Amt','3PO Delivery Gross Amt','Delivery Amt Total','Total 3rd Party Net Sales','Total 3PO Net Sales'),
    total3poGC:    fc(h,'Delivery Total Qty','3PO Delivery Gross Qty','Total 3rd Party GC','Total 3PO GC'),
    // Digital channels
    mopEatIn:    fc(h,'MOP Eatin Amt','MOP Eat-in','MOP Eatin','MOP Eat in'),
    mopTakeout:  fc(h,'MOP Takeout Amt','MOP Takeout','MOP Take Out'),
    kioskEatIn:  fc(h,'Kiosk Eat-In Amt','Kiosk Eat-in','Kiosk Eatin','Kiosk Eat in'),
    kioskTakeout:fc(h,'Kiosk Takeout Amt','Kiosk Takeout','Kiosk Take Out'),
    // Cash O/S
    cashOS:    fc(h,'Cash Over/Short','Cash Over Short $','Cash O/S $'),
    cashOSPct: fc(h,'Cash Over Short %','Cash Over/Short %','Cash O/S %'),
    // Refunds
    cashRefCnt:     fc(h,'Cash Refund Count','Cash Refund Cnt'),
    cashRefAmt:     fc(h,'Cash Refund Amt','Cash Refund Amount'),
    cashlessRefCnt: fc(h,'Cashless Refund Count','Cashless Refund Cnt'),
    cashlessRefAmt: fc(h,'Cashless Refund Amt','Cashless Refund Amount'),
    // POS
    posOverCnt: fc(h,'POS Overring Count','POS Overrings Cnt','POS Overring Cnt'),
    posOverAmt: fc(h,'POS Overring Amt','POS Overrings Amt','POS Overring Amount'),
    // T-Reds
    tRedVoidCnt:    fc(h,'T-Red After: Void Count','T Red After Void','T Red Voided Cnt'),
    tRedDeletedCnt: fc(h,'T-Red After: Deleted Count','T Red After Deleted','T Red Deleted Cnt'),
  };
  const rows=[];
  for(let i=hi+1;i<raw.length;i++){
    const r=raw[i];if(!r)continue;
    const loc=String(r[C.loc]||'').trim();
    // Filter subtotal rows: "Total 3708", "Grand Total", blank
    if(!loc||!/^\d+$/.test(loc))continue;
    const dt=C.date>=0?parseXLDate(r[C.date]):_dateHint;if(!dt)continue;
    rows.push({loc,date:dt,
      allNetSales:parseNum(r[C.allNetSales]),
      gc:parseNum(r[C.gc]),
      avgCheck:parseNum(r[C.avgCheck]),
      doorDashSales:parseNum(r[C.doorDashSales]),
      doorDashGC:parseNum(r[C.doorDashGC]),
      uberEatsSales:parseNum(r[C.uberEatsSales]),
      uberEatsGC:parseNum(r[C.uberEatsGC]),
      grubhubSales:parseNum(r[C.grubhubSales]),
      grubhubGC:parseNum(r[C.grubhubGC]),
      total3poSales:parseNum(r[C.total3poSales]),
      total3poGC:parseNum(r[C.total3poGC]),
      mopEatIn:parseNum(r[C.mopEatIn]),
      mopTakeout:parseNum(r[C.mopTakeout]),
      kioskEatIn:parseNum(r[C.kioskEatIn]),
      kioskTakeout:parseNum(r[C.kioskTakeout]),
      cashOS:parseNum(r[C.cashOS]),
      cashOSPct:parsePct(r[C.cashOSPct]),
      cashRefCnt:parseNum(r[C.cashRefCnt]),
      cashRefAmt:parseNum(r[C.cashRefAmt]),
      cashlessRefCnt:parseNum(r[C.cashlessRefCnt]),
      cashlessRefAmt:parseNum(r[C.cashlessRefAmt]),
      posOverCnt:parseNum(r[C.posOverCnt]),
      posOverAmt:parseNum(r[C.posOverAmt]),
      tRedVoidCnt:parseNum(r[C.tRedVoidCnt]),
      tRedDeletedCnt:parseNum(r[C.tRedDeletedCnt]),
    });
  }
  return rows;
}


// ── QSRSoft: Labor Exceptions ────────────────────────────────────────────────
// 3-sheet workbook: summary by store, summary by exception type, detail by employee.
// Detail sheet has PII (employee names, GEID, ages) — stored but not surfaced in UI by default.
function parseLaborExceptions(wb, filename){
  const rows=[];
  const _dm=(filename||'').match(/(\d{4}-\d{2}-\d{2})/);
  const _dateHint=_dm?new Date(_dm[1]+'T12:00:00'):new Date();
  // Sheet 1: Summary by location
  const sumLocSn=wb.SheetNames.find(s=>s.toLowerCase().includes('location')||s.toLowerCase().includes('store')||s.toLowerCase().includes('summary'))
               ||wb.SheetNames[0];
  const rawLoc=parseRaw(wb,sumLocSn),hiL=autoHdrRow(rawLoc),hL=rawLoc[hiL]||[];
  const CL={
    loc:    fc(hL,'Loc','Location','Store','Business Unit','Restaurant','Str #','Store #','Store Number','Restaurant Number'),
    date:   fc(hL,'Date','Period','Business Date','Week Ending','Period End','Period Start'),
    total:  findCol(hL,'Total Exceptions','Total Exc','Exception Count','Exceptions'),
    missed: findCol(hL,'Missed Break','Missed Breaks'),
    early:  findCol(hL,'Early Out','Early Punch Out'),
    late:   findCol(hL,'Late In','Late Punch In'),
    ot:     findCol(hL,'Overtime','OT Exceptions'),
    minors: findCol(hL,'Minors','Minor'),
  };
  for(let i=hiL+1;i<rawLoc.length;i++){
    const r=rawLoc[i];if(!r)continue;
    const rawLoc2=String(r[CL.loc]||'').trim();
    const loc=rawLoc2.replace(/[^0-9]/g,'');if(!loc)continue;
    const dt=CL.date>=0?parseXLDate(r[CL.date]):_dateHint;
    rows.push({loc,date:dt||_dateHint,
      totalExceptions:parseNum(r[CL.total]),
      missedBreaks:CL.missed>=0?parseNum(r[CL.missed]):0,
      earlyOut:CL.early>=0?parseNum(r[CL.early]):0,
      lateIn:CL.late>=0?parseNum(r[CL.late]):0,
      otExceptions:CL.ot>=0?parseNum(r[CL.ot]):0,
      minorExceptions:CL.minors>=0?parseNum(r[CL.minors]):0,
      _sheet:'summary',
    });
  }
  return rows;
}

// ── LifeLenz: Labor Analysis Summary Report ──────────────────────────────────
// Single-store daily scheduling data: VLH, Fixed Hours, Floor Hours, TPMH.
// Two CSV variants:
//   Old: row[0] = ["","","","","Store","0005985"], dates MM/DD/YYYY
//   New: row[0] = ["","","","","","Store","33109"], extra MAPE col, dates M/D/YY
function parseLifeLenzLabor(wb) {
  const raw = parseRaw(wb, wb.SheetNames[0]);
  if(!raw || raw.length < 3) return [];
  // Find store number by scanning row 0 for the cell after "Store" label,
  // or any all-digit cell in row 0. XLSX may parse unquoted '0003708' as 3708.
  let rawLoc = '';
  const r0 = raw[0] || [];
  for(let i = 0; i < r0.length; i++) {
    const v = String(r0[i]||'').trim();
    if(v.toLowerCase() === 'store' && i+1 < r0.length) {
      rawLoc = String(r0[i+1]||'').trim(); break;
    }
  }
  if(!rawLoc) rawLoc = r0.map(c=>String(c||'').trim()).find(v=>/^\d+$/.test(v))||'';
  if(!rawLoc || !/^\d+$/.test(rawLoc)) return [];
  const loc = String(parseInt(rawLoc, 10)); // short format e.g. '3708' to match STORE_NAMES
  const h = raw[1] || [];
  // Column index helpers — LifeLenz headers have periods/spaces
  const C = {
    date:        0,
    fcstSales:   findCol(h,'Fcst.$','Fcst. $','Forecast Sales'),
    adjFcstSales:findCol(h,'Adj. Fcst.$','Adj.Fcst.$'),
    sales:       findCol(h,'Sales'),
    salesDiff:   findCol(h,'Sales +/-'),
    fcstTCs:     findCol(h,'Fcst. TCs','Fcst.TCs'),
    adjTCs:      findCol(h,'Adj. TCs.','Adj.TCs.','Adj. TCs'),
    tcs:         findCol(h,'TCs'),
    tcsDiff:     findCol(h,'TCs +/-'),
    laborPct:    findCol(h,'Labor %'),
    projVLH:     findCol(h,'Proj. VLH','Proj.VLH'),
    schVLH:      findCol(h,'Sch. VLH','Sch.VLH'),
    needVLH:     findCol(h,'Need. VLH','Need.VLH'),
    vlh:         findCol(h,'VLH'),
    vlhDiff:     findCol(h,'VLH +/-'),
    fixGuideHrs: findCol(h,'Fix.Guide.Hrs','Fix. Guide Hrs'),
    schFixHrs:   findCol(h,'Sch.Fix.Hrs.','Sch.Fix.Hrs','Sch. Fix. Hrs'),
    projFloor:   findCol(h,'Proj.Floor','Proj. Floor'),
    schFloor:    findCol(h,'Sch.Floor','Sch. Floor'),
    needFloor:   findCol(h,'Need.Floor','Need. Floor'),
    idealTotHrs: findCol(h,'Ideal Tot.Hrs','Ideal Tot. Hrs'),
    salMgrHrs:   findCol(h,'Sal.Mgr.Hrs','Sal. Mgr. Hrs'),
    crewHrs:     findCol(h,'Crew Hrs','Crew Hours'),
    totHrsDiff:  findCol(h,'Total Hrs +/-'),
    tpmh:        findCol(h,'TPMH'),
  };
  // vlh col may collide with prefix of other cols — find the exact 'VLH' col
  if(C.vlh < 0) C.vlh = h.findIndex(v => String(v||'').trim() === 'VLH');
  const rows = [];
  for(let i = 2; i < raw.length; i++) {
    const r = raw[i];
    if(!r || !r[0]) continue;
    // XLSX may parse '06/21/2026' from CSV as a numeric date serial — use parseXLDate to handle all forms.
    // Also handle LifeLenz's 2-digit-year format: M/D/YY (e.g. "4/29/26")
    let dt = parseXLDate(r[0]);
    if(!dt || isNaN(dt.getTime())) {
      const mdy = String(r[0]).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
      if(mdy) {
        const yr = +mdy[3] < 50 ? 2000 + +mdy[3] : 1900 + +mdy[3];
        dt = new Date(yr, +mdy[1]-1, +mdy[2], 12, 0, 0);
      }
    }
    if(!dt || isNaN(dt.getTime())) continue;
    const schVLH    = parseFloat(r[C.schVLH]) || 0;
    const needVLH   = parseFloat(r[C.needVLH]) || 0;
    const crewHrs   = parseFloat(r[C.crewHrs]) || 0;
    const idealTot  = parseFloat(r[C.idealTotHrs]) || 0;
    const schFix    = parseFloat(r[C.schFixHrs]) || 0;
    rows.push({ loc, date: dt,
      fcstSales:    parseFloat(r[C.fcstSales])    || 0,
      adjFcstSales: parseFloat(r[C.adjFcstSales]) || 0,
      sales:        parseFloat(r[C.sales])         || 0,
      salesDiff:    parseFloat(r[C.salesDiff])     || 0,
      fcstTCs:      parseFloat(r[C.fcstTCs])       || 0,
      tcs:          parseFloat(r[C.tcs])            || 0,
      tcsDiff:      parseFloat(r[C.tcsDiff])        || 0,
      laborPct:     parseFloat(r[C.laborPct])       || 0,
      projVLH:      parseFloat(r[C.projVLH])        || 0,
      schVLH, needVLH,
      vlhDiff:      parseFloat(r[C.vlhDiff])        || 0,
      fixGuideHrs:  parseFloat(r[C.fixGuideHrs])    || 0,
      schFixHrs:    schFix,
      projFloor:    parseFloat(r[C.projFloor])      || 0,
      schFloor:     parseFloat(r[C.schFloor])       || 0,
      needFloor:    parseFloat(r[C.needFloor])      || 0,
      idealTotHrs:  idealTot,
      salMgrHrs:    parseFloat(r[C.salMgrHrs])      || 0,
      crewHrs,
      totHrsDiff:   parseFloat(r[C.totHrsDiff])     || 0,
      tpmh:         parseFloat(r[C.tpmh])            || 0,
      // Derived: scheduled crew vs ideal (ideal = VLH need + floor need)
      schVsIdealDiff: crewHrs > 0 && idealTot > 0 ? crewHrs - (idealTot + schFix) : 0,
      schVLHOverNeed: schVLH > 0 && needVLH > 0 ? schVLH - needVLH : 0,
    });
  }
  return rows;
}

// ── SMG VOICE Customer Comment Report (PDF) ──────────────────────────────────
// Parses the VOICE platform PDF into per-store, per-comment rows.
// Uses pdfjs-dist loaded lazily so it only ships when PDF files are dropped.
// Returns: [{ loc, storeName, reportStart, reportEnd, commentDate, visitDate,
//             nsn, text, satisfactionLabel, score }]
// ── SMG FullScale Report (Excel) ──────────────────────────────────────────────
// Structure: 1 sheet "Small Graph", 5 rows per store (ratings 5→1)
// Key 0-indexed column positions:
//   col 0  = store name ("03708 - ARDMORE-BROADWAY") in first row of each block
//   col 1  = OSAT rating label ('5','4','3','2','1')
//   col 22 = OSAT pct for that rating
//   col 44 = Overall Sat B2B pct (row0=negative, row1=positive/met-B2B)
//   col 66 = Accuracy B2B pct
//   col 88 = DT Problem pct (row0=problem rate, row1=no-problem rate)
//   col 110= Overall Problem pct
function parseSMGFullScale(wb) {
  // ── Find the sheet that contains store-number rows ─────────────────────────
  // FullScale workbooks have multiple sheets (Small Graph, Large Graph, Data, etc.)
  // Try every sheet and use the one with the most store matches.
  const STORE_PAT = /^(\d{3,6})\s*[-–]\s*(.+)/;
  const DATE_PAT  = /(\d{1,2}\/\d{1,2}\/\d{4})\s*[-–]\s*(\d{1,2}\/\d{1,2}\/\d{4})/;

  let bestRows = [], bestCount = 0;
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:null, raw:true});
    const matches = rows.filter(r => r && typeof r[0] === 'string' && STORE_PAT.test(r[0])).length;
    if (matches > bestCount) { bestCount = matches; bestRows = rows; }
  }

  if (!bestRows.length) {
    console.warn('[parseSMGFullScale] No store rows found in any sheet. SheetNames:', wb.SheetNames);
    return [];
  }

  // ── Extract report date range (search all rows, not just row 1) ────────────
  let reportStart = null, reportEnd = null, year = null, month = null;
  for (const row of bestRows.slice(0, 10)) {
    if (!row) continue;
    for (const cell of row) {
      if (typeof cell !== 'string') continue;
      const m = cell.match(DATE_PAT);
      if (m) {
        reportStart = m[1]; reportEnd = m[2];
        const parts = m[2].split('/').map(Number);
        month = parts[0]; year = parts[2];
        break;
      }
    }
    if (year) break;
  }
  // Fallback: infer from current date if title not found
  if (!year) {
    const now = new Date();
    year  = now.getFullYear();
    month = now.getMonth() + 1;
    console.warn('[parseSMGFullScale] Could not parse date from report title; using current month:', year, month);
  }

  // ── Auto-detect metric columns by scanning the first complete 5-row block ──
  // Look for the first store block and find columns that have numeric % values.
  // SMG FullScale rows: col 0 = store/rating label, col 1 = rating (1-5),
  // then groups of columns for each question metric.
  // The OSAT % column is the first numeric column after the rating in the OSAT section.
  let osatCol = 22, b2bCol = 44, accCol = 66, dtCol = 88, overallCol = 110; // defaults

  const firstStoreIdx = bestRows.findIndex(r => r && typeof r[0] === 'string' && STORE_PAT.test(r[0]));
  if (firstStoreIdx >= 0) {
    const block = bestRows.slice(firstStoreIdx, firstStoreIdx + 5);
    const byRat = {};
    for (const brow of block) {
      if (!brow) continue;
      const r = parseInt(String(brow[1]||''));
      if (!isNaN(r) && r >= 1 && r <= 5) byRat[r] = brow;
    }
    // Find first column after col 2 where rating-5 row has a number (that's OSAT pct for 5★)
    const r5 = byRat[5] || [];
    for (let c = 2; c < r5.length; c++) {
      if (typeof r5[c] === 'number' && r5[c] > 0 && r5[c] <= 1) {
        osatCol = c;
        // Guess other columns at regular intervals from first numeric col
        const step = Math.round((r5.length - c) / 5) || 22;
        b2bCol     = c + step;
        accCol     = c + step * 2;
        dtCol      = c + step * 3;
        overallCol = c + step * 4;
        console.log(`[parseSMGFullScale] Auto-detected columns: osat=${c}, step=${step}, b2b=${b2bCol}, acc=${accCol}, dt=${dtCol}, overall=${overallCol}`);
        break;
      }
    }
  }

  const result = [];
  let i = 0;
  while (i < bestRows.length) {
    const row = bestRows[i];
    if (!row || typeof row[0] !== 'string') { i++; continue; }
    const storeM = row[0].match(STORE_PAT);
    if (!storeM) { i++; continue; }

    const loc = String(parseInt(storeM[1], 10));
    const storeName = storeM[2].trim();

    const block = bestRows.slice(i, i + 5);
    const byRating = {};
    for (const brow of block) {
      if (!brow) continue;
      const r = parseInt(String(brow[1]||''));
      if (!isNaN(r) && r >= 1 && r <= 5) byRating[r] = brow;
    }

    const numPct = (brow, col) => {
      const v = brow?.[col];
      return typeof v === 'number' ? v : null;
    };

    const osat5 = numPct(byRating[5], osatCol) || 0;
    const osat4 = numPct(byRating[4], osatCol) || 0;
    const osat3 = numPct(byRating[3], osatCol) || 0;
    const osat2 = numPct(byRating[2], osatCol) || 0;
    const osat1 = numPct(byRating[1], osatCol) || 0;
    const osatTop2 = osat5 + osat4;
    const osatAvg  = (5*osat5 + 4*osat4 + 3*osat3 + 2*osat2 + 1*osat1) || null;

    result.push({
      loc, storeName, reportStart, reportEnd, year, month,
      osatTop2:        osatTop2 || null,
      osat5:           osat5    || null,
      osatAvg,
      osatB2B:         numPct(byRating[4], b2bCol),
      accuracyB2B:     numPct(byRating[4], accCol),
      dtProblem:       numPct(byRating[5], dtCol),
      overallProblem:  numPct(byRating[5], overallCol),
    });

    i += 5;
  }

  console.log(`[parseSMGFullScale] Parsed ${result.length} stores for ${year}-${month}`);
  return result;
}

async function parseSMGVoicePDF(file) {
  const pdfjsLib = await import('pdfjs-dist');
  // pdfjs needs a worker; use the bundled legacy worker via URL
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url
    ).toString();
  }
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  // Extract all text items page by page, preserving y-position for row reconstruction
  const allLines = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    // Group items by approximate y-coordinate (within 3px = same line)
    const lineMap = new Map();
    for (const item of content.items) {
      const y = Math.round(item.transform[5] / 3) * 3;
      if (!lineMap.has(y)) lineMap.set(y, []);
      lineMap.get(y).push({ x: item.transform[4], str: item.str });
    }
    // Sort lines top-to-bottom (higher y = higher on page in PDF coords)
    const sorted = [...lineMap.entries()].sort((a, b) => b[0] - a[0]);
    for (const [, items] of sorted) {
      const text = items.sort((a, b) => a.x - b.x).map(i => i.str).join(' ').trim();
      if (text) allLines.push(text);
    }
  }

  // Parse report header: "6/22/2026 - 6/28/2026"
  let reportStart = null, reportEnd = null;
  const dateRangeM = allLines.find(l => /\d{1,2}\/\d{1,2}\/\d{4}\s*-\s*\d{1,2}\/\d{1,2}\/\d{4}/.test(l));
  if (dateRangeM) {
    const parts = dateRangeM.match(/(\d{1,2}\/\d{1,2}\/\d{4})/g);
    if (parts) { reportStart = parts[0]; reportEnd = parts[1] || parts[0]; }
  }

  // Parse store sections: line matching "NNNNN - STORE NAME" (all-caps after dash)
  const rows = [];
  let currentLoc = null, currentStoreName = null;
  const SCORE_MAP = { 'highly satisfied': 5, 'satisfied': 4, 'neutral': 3, 'dissatisfied': 2, 'highly dissatisfied': 1 };
  // Date pattern M/D/YYYY or MM/DD/YYYY
  const DATE_RE = /^(\d{1,2}\/\d{1,2}\/\d{4})/;
  // NSN pattern (5-6 digit number)
  const NSN_RE = /^(\d{5,6})$/;

  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i];
    // Store section header: e.g. "05985 - DURANT-US HWY 70"
    const storeM = line.match(/^(\d{4,6})\s*-\s*([A-Z][A-Z0-9 ,.'&/-]+)$/);
    if (storeM && line === line.toUpperCase().replace(/[^A-Z0-9\s,.'&/-]/g, '').trim() || /^\d{4,6} - /.test(line)) {
      const locM2 = line.match(/^(\d{4,6})/);
      if (locM2) { currentLoc = locM2[1]; currentStoreName = line.slice(locM2[0].length).replace(/^\s*-\s*/, '').trim(); }
      continue;
    }
    if (!currentLoc) continue;
    // Comment row: starts with a date
    if (!DATE_RE.test(line)) continue;
    const commentDateM = line.match(DATE_RE);
    if (!commentDateM) continue;
    const commentDate = commentDateM[1];
    const rest = line.slice(commentDate.length).trim();
    // Next date = visitDate
    const visitDateM = rest.match(DATE_RE);
    if (!visitDateM) continue;
    const visitDate = visitDateM[1];
    const afterDates = rest.slice(visitDateM[0].length).trim();
    // NSN (5-6 digits)
    const nsnM = afterDates.match(/^(\d{5,6})\s*/);
    const nsn = nsnM ? nsnM[1] : currentLoc;
    const afterNSN = nsnM ? afterDates.slice(nsnM[0].length) : afterDates;
    // Satisfaction label and score — look for known phrases at end of line or next lines
    let satisfactionLabel = '', score = null;
    const satRe = /(highly satisfied|satisfied|neutral|dissatisfied|highly dissatisfied)/i;
    const satM = afterNSN.match(satRe);
    let commentText = afterNSN;
    if (satM) {
      satisfactionLabel = satM[1];
      score = SCORE_MAP[satisfactionLabel.toLowerCase()] || null;
      commentText = afterNSN.slice(0, satM.index).trim();
      // Numeric score may follow: "5.0000000"
      const numM = afterNSN.slice(satM.index + satM[0].length).match(/([\d.]+)/);
      if (numM) score = parseFloat(numM[1]);
    } else {
      // Check next 1-2 lines for satisfaction label (multi-line comments)
      let combined = afterNSN;
      for (let j = i + 1; j <= i + 15 && j < allLines.length; j++) {
        combined += ' ' + allLines[j];
        const sm = combined.match(satRe);
        if (sm) {
          satisfactionLabel = sm[1];
          score = SCORE_MAP[satisfactionLabel.toLowerCase()] || null;
          commentText = combined.slice(0, sm.index).trim();
          const numM2 = combined.slice(sm.index + sm[0].length).match(/([\d.]+)/);
          if (numM2) score = parseFloat(numM2[1]);
          i = j; // skip consumed lines
          break;
        }
      }
      if (!satisfactionLabel) continue; // skip rows without satisfaction label
    }
    rows.push({ loc: currentLoc, storeName: currentStoreName, reportStart, reportEnd,
      commentDate, visitDate, nsn, text: commentText, satisfactionLabel, score });
  }
  return rows;
}

// ── MBI Labor Analysis (weekly Fixed-Labor-Hours worksheet) ──────────────────
// Parses the owner's "MBI - Labor Analysis" sheet into two streams:
//   • weekly Band-1 LifeLenz inputs per store  → lifelenz_labor_week
//   • per-store config (hours-of-op + fixed hrs) → store_labor_config
// Layout is a FIXED template (their own file): 3 header rows, data from row 4,
// stops at "Sub Total"/"Grand Total"/legend rows. Column positions are stable, so
// we read by letter (duplicate headers like two "Store Open Time Sun" make
// header-lookup ambiguous). See memory/project-labor-analysis-flh.md.
const _MBI = {
  loc: 0, projSalesMonth: 1, salesFcst: 2, laborPctActual: 3, gcFcst: 4, hoursFcst: 5,
  hoursSched: 6, schedFixedPct: 7, tpph: 8, rate: 9, laborTargetOrg: 11, actualHours: 22,
  maintHours: 28, maintPeople: 29, maintDaysOff: 30, prepHours: 31, lobbyHours: 32, is24hr: 33,
};
// Hours-of-op open/close column pairs → the weekdays they cover. Applied in this
// order so broad bands set a default and specific bands override (last wins).
const _MBI_HOURS_BANDS = [
  { o: 34, c: 35, days: ['sun','mon','tue','wed','thu','fri','sat'] }, // All Days
  { o: 37, c: 38, days: ['sun','mon','tue','wed','thu'] },             // Sun-Thu
  { o: 55, c: 56, days: ['mon','tue','wed','thu','fri','sat'] },       // Mon-Sat
  { o: 47, c: 48, days: ['mon','tue','wed','thu'] },                   // Mon-Thu
  { o: 41, c: 42, days: ['mon','tue','wed'] },                         // Mon-Wed
  { o: 43, c: 44, days: ['thu','fri','sat'] },                         // Thu-Sat
  { o: 39, c: 40, days: ['fri','sat'] },                               // Fri-Sat
  { o: 45, c: 46, days: ['sun'] },                                     // Sun
  { o: 53, c: 54, days: ['sun'] },                                     // Sun (2nd column)
  { o: 49, c: 50, days: ['fri'] },                                     // Fri
  { o: 51, c: 52, days: ['sat'] },                                     // Sat
];
// Per-day "Hours Open" columns (BF..BL) — authoritative resolved hours by weekday.
const _MBI_PERDAY = { wed: 57, thu: 58, fri: 59, sat: 60, sun: 61, mon: 62, tue: 63 };

function _mbiNum(v){ if(v===null||v===undefined||v==='')return null; const n=typeof v==='number'?v:parseFloat(String(v).replace(/[$,%]/g,'')); return isNaN(n)?null:n; }
function _mbiIsTime(v){ return typeof v==='number' && v>=0 && v<=1; }
// Hours Forecast / Scheduled / Actual are Excel [h]:mm DURATIONS — stored as
// fractions of a day (1.0 = 24h). Convert the day-serial to real hours (×24) so
// downstream math is unit-consistent (e.g. raw 62.52 → 1500.5 hours).
function _mbiHours(v){ const n=_mbiNum(v); return n==null?null:n*24; }

// Parse the raw rows array (from parseRaw) → { weekStart, weekEnd, monthTag, stores:[...] }.
function parseMbiLaborAnalysis(rows){
  if(!rows || rows.length<4) return { weekStart:null, weekEnd:null, monthTag:null, stores:[] };
  const monthTag = rows[1] && rows[1][1] ? String(rows[1][1]).trim() : null; // B2
  // Week range lives in C2 like "07/15/26 - 07/21/26".
  let weekStart=null, weekEnd=null;
  const wr = rows[1] && rows[1][2] ? String(rows[1][2]) : '';
  const m = wr.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})\s*[-–]\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/);
  const toISO = s => { const p=s.split('/'); if(p.length!==3)return null; let[mm,dd,yy]=p.map(Number); if(yy<100)yy+=2000; return `${yy}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`; };
  if(m){ weekStart=toISO(m[1]); weekEnd=toISO(m[2]); }

  const stores=[];
  for(let i=3;i<rows.length;i++){
    const r=rows[i]; if(!r) continue;
    const loc=r[_MBI.loc];
    if(loc===null||loc===undefined||loc==='') continue;
    // Stop/skip roll-up + legend rows (non-numeric location labels).
    if(typeof loc!=='number' && !/^\d{3,7}$/.test(String(loc).trim())) continue;
    const locStr = String(parseInt(loc,10)); // unpadded, matches STORE_NAMES keys

    const band1 = {
      loc: locStr,
      projSalesMonth: _mbiNum(r[_MBI.projSalesMonth]),
      salesFcst: _mbiNum(r[_MBI.salesFcst]),
      laborPctActual: _mbiNum(r[_MBI.laborPctActual]),
      gcFcst: _mbiNum(r[_MBI.gcFcst]),
      hoursFcst: _mbiHours(r[_MBI.hoursFcst]),   // [h]:mm day-serial → hours
      hoursSched: _mbiHours(r[_MBI.hoursSched]), // [h]:mm day-serial → hours
      schedFixedPct: _mbiNum(r[_MBI.schedFixedPct]),
      tpph: _mbiNum(r[_MBI.tpph]),
      rate: _mbiNum(r[_MBI.rate]),
      laborTargetOrg: _mbiNum(r[_MBI.laborTargetOrg]),
      actualHours: _mbiHours(r[_MBI.actualHours]), // [h]:mm day-serial → hours
    };

    // Resolve hours of operation to a canonical 7-weekday model.
    const hours = { sun:{}, mon:{}, tue:{}, wed:{}, thu:{}, fri:{}, sat:{} };
    for(const b of _MBI_HOURS_BANDS){
      const ov=r[b.o], cv=r[b.c];
      const hasO=_mbiIsTime(ov), hasC=_mbiIsTime(cv);
      if(!hasO && !hasC) continue;
      for(const d of b.days){ if(hasO) hours[d].open=ov; if(hasC) hours[d].close=cv; }
    }
    // Attach authoritative per-day resolved hours (BF..BL); fall back to computed.
    for(const [d,ci] of Object.entries(_MBI_PERDAY)){
      const hv=_mbiNum(r[ci]);
      const cur=hours[d];
      let comp=null;
      if(_mbiIsTime(cur.open) && _mbiIsTime(cur.close)){ comp=(cur.close-cur.open)*24; if(comp<=0)comp+=24; comp=Math.round(comp*100)/100; }
      cur.hours = (hv!=null? hv : comp);
    }
    const rawIs24 = r[_MBI.is24hr]; const is24Str = rawIs24==null?'':String(rawIs24).trim();
    const allDays24 = Object.values(hours).every(h=>h.hours===24);
    const config = {
      loc: locStr,
      is24hr: allDays24 || /^(y|yes|24)/i.test(is24Str),
      is24Note: is24Str || null,   // preserves "24 HR W/E" nuance
      maintHours: _mbiNum(r[_MBI.maintHours]),
      maintPeople: _mbiNum(r[_MBI.maintPeople]),
      maintDaysOff: r[_MBI.maintDaysOff]==null?null:String(r[_MBI.maintDaysOff]).trim(),
      prepHours: _mbiNum(r[_MBI.prepHours]),
      lobbyHours: _mbiNum(r[_MBI.lobbyHours]),
      hours,
    };
    stores.push({ loc: locStr, band1, config });
  }
  return { weekStart, weekEnd, monthTag, stores };
}

// Workbook wrapper — pick the labor-analysis sheet and parse it.
function parseMbiLaborAnalysisWb(wb){
  const name = (wb.SheetNames||[]).find(n=>/labor\s*analysis/i.test(n)) || wb.SheetNames[0];
  return parseMbiLaborAnalysis(parseRaw(wb, name));
}

// ── LifeLenz People List (Simple CSV) → Crew Skills Matrix ───────────────────
// Explodes the packed "SCHEDULE JOBS" string ("BEVERAGE SPECIALIST (3), DRIVE
// THRU (3), ...") into a per-employee { job: rating(1-5) } map so it can render
// as a skills matrix (renamed "Skill Levels"). Also parses home store + primary
// role. Header carries a BOM; job/role cells are wrapped in literal quotes.
function _stripQuotes(s){ return s==null?'':String(s).replace(/^﻿/,'').replace(/^"+|"+$/g,'').trim(); }

// Parse "BEVERAGE SPECIALIST (3), DRIVE THRU (5), ..." → { job: rating }.
function parseSkillJobs(raw){
  const s = _stripQuotes(raw); const out = {};
  if(!s) return out;
  const re = /([^,()]+?)\s*\((\d)\)/g; let m;
  while((m = re.exec(s))){ const job = m[1].trim().replace(/\s+/g,' '); const rating = parseInt(m[2],10);
    if(job && rating>=1 && rating<=5) out[job] = rating; }
  return out;
}

// "0011657 - PURCELL" / "0033704 - TECUMSEH, OK" → { loc:'11657', name:'PURCELL' }.
function parseHomeStore(raw){
  const s = _stripQuotes(raw); const m = s.match(/^(\d{3,7})\s*-\s*(.+)$/);
  if(!m) return { loc:null, name: s || null };
  return { loc: String(parseInt(m[1],10)), name: m[2].trim() };
}

// "Primary (00650 - CREW PERSON)" → { isPrimary:true, code:'00650', role:'CREW PERSON' }.
function parseJobRate(raw){
  const s = _stripQuotes(raw); const m = s.match(/(\w+)?\s*\(\s*(\d+)\s*-\s*(.+?)\)/);
  if(!m) return { isPrimary:/primary/i.test(s), code:null, role: s || null };
  return { isPrimary:/primary/i.test(m[1]||''), code:m[2], role:m[3].trim() };
}

function parsePeopleSkills(rows){
  if(!rows || rows.length<2) return { employees:[], jobs:[], pulledLoc:null, pulledStore:null };
  const employees = []; const jobSet = new Set();
  // Store this file was pulled for = the modal (most common) home store.
  const locCount = {};
  for(let i=1;i<rows.length;i++){
    const r = rows[i]; if(!r) continue;
    const name = _stripQuotes(r[0]); if(!name) continue;
    const skills = parseSkillJobs(r[1]);
    const home = parseHomeStore(r[2]);
    const school = _stripQuotes(r[3]); const rate = parseJobRate(r[4]);
    for(const j of Object.keys(skills)) jobSet.add(j);
    if(home.loc) locCount[home.loc] = (locCount[home.loc]||0)+1;
    employees.push({ employee:name, loc:home.loc, homeStore:home.name,
      role:rate.role, roleCode:rate.code, isPrimaryRole:rate.isPrimary,
      schoolCalendar:(school && school!=='-')?school:null, skills });
  }
  const pulledLoc = Object.keys(locCount).sort((a,b)=>locCount[b]-locCount[a])[0] || null;
  const pulledStore = pulledLoc ? (employees.find(e=>e.loc===pulledLoc)||{}).homeStore || null : null;
  return { employees, jobs:[...jobSet].sort(), pulledLoc, pulledStore };
}

function parsePeopleSkillsWb(wb){
  return parsePeopleSkills(parseRaw(wb, wb.SheetNames[0]));
}

export { parseXLDate, findCol, fc, fcx, autoHdrRow, parseRaw, parsePct, parseProjectionsFile, applyProjectionsToTargets, sniffSheetType, detectType, parseLaborData, parseOpsData, parseCtrlData, parseWeatherData, parseTargets, parseMonthlyTargets, parseYearlyTargets, parse3PeaksService, parse3PeaksSales, parseFOBData, parseRegisterAudit, parseShiftMgr, parseTrends, parseRecords, parseDARData, parsePMixData, validateTrend, autoDetectSheets, parseSalesLedger, parseDailyGlimpse, parseCashSheet, parseLaborExceptions, parseLifeLenzLabor, parseSMGVoicePDF, parseSMGFullScale, opsReportIsDaily, parseMbiLaborAnalysis, parseMbiLaborAnalysisWb, parsePeopleSkills, parsePeopleSkillsWb, parseSkillJobs };
