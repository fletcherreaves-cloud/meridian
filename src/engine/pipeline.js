// @ts-nocheck
import * as XLSX from 'xlsx';
import { STORE_NAMES, DEFAULT_TARGETS, STORE_COORDS, DEF_SETTINGS } from '../constants.js';
import { dKey, addD } from '../utils/date.js';
import { bLocIdx, compute6wk, locRows } from '../engine/forecast.js';
import { analyzeRegisterAudit } from '../utils/register-audit.js';
import { autoTagHolidays } from '../utils/holidays.js';
import { parseInventoryData } from '../views/inventory.js';
import { STORE_STAFF } from '../features/morning-brief.js';
import { fPct, f$ } from '../utils/fmt.js';
import { parseXLDate, findCol, fc, fcx, autoHdrRow, parseRaw, parsePct, parseProjectionsFile, applyProjectionsToTargets, sniffSheetType, detectType, parseLaborData, parseOpsData, parseCtrlData, parseWeatherData, parseTargets, parse3PeaksService, parse3PeaksSales, parseFOBData, parseRegisterAudit, parseShiftMgr, parseTrends, parseRecords, parseDARData, parsePMixData, validateTrend, autoDetectSheets, parseSalesLedger, parseDailyGlimpse, parseCashSheet, parseLaborExceptions } from '../parsers/index.js';

function buildDS(workbooks){
  const ds={laborRows:[],opsRows:[],ctrlRows:[],weatherRows:[],inventoryRows:[],
    peaksSvcRows:[],peaksSalesRows:[],auditRows:[],fobRows:[],trendsRows:[],
    darRows:[],   // Daily Activity Report — hourly OEPE/GC/Sales per store
    pmixData:{},  // Product Mix — item-level sales aggregated by family group
    glimpseRows:[],  // QSRSoft Daily Glimpse — daily per-store snapshot
    cashRows:[],     // QSRSoft Cash Sheet — daily cash controls + 3PO delivery platform mix
    exceptionRows:[], // QSRSoft Labor Exceptions — per-store compliance exception counts
    records:{},targets:{},loaded:false,
    laborIdx:{},opsIdx:{},ctrlIdx:{},weatherIdx:{},storeIds:[],lastActual:{},
    laborByLoc:{},opsByLoc:{},ctrlByLoc:{},darByLoc:{}};
  for(const{wb,type}of workbooks){
    try{
      if(type==='labor')    ds.laborRows.push(...parseLaborData(wb));
      else if(type==='ops') {
        ds.opsRows.push(...parseOpsData(wb));
        // Pull Controls and FOB sheets from Operations Report (same file, different sheets)
        try{const ctr=parseCtrlData(wb);if(ctr&&ctr.length)ds.ctrlRows.push(...ctr);}catch(e){}
        try{const fob=parseFOBData(wb);if(fob&&fob.length)ds.fobRows.push(...fob);}catch(e){}
      }
      else if(type==='ctrl')ds.ctrlRows.push(...parseCtrlData(wb));
  if(type==='projections'){
    const pRows=parseProjectionsFile(wb,filename||'');
    applyProjectionsToTargets(pRows,filename||'projections');
    // Also store as projRows for future reference
    if(!ds.projRows) ds.projRows=[];
    ds.projRows.push(...pRows);
  }
      else if(type==='fob')  ds.fobRows.push(...parseFOBData(wb));
      else if(type==='weather')ds.weatherRows.push(...parseWeatherData(wb));
      else if(type==='targets')Object.assign(ds.targets,parseTargets(wb));
      else if(type==='peaks'){
        const _pkSvc=parse3PeaksService(wb);
        console.log('[McForecast] 3Peaks Service rows:',_pkSvc.length,'locs:',[...new Set(_pkSvc.map(r=>r.loc))].join(','));
        ds.peaksSvcRows.push(..._pkSvc);
        const _pkSal=parse3PeaksSales(wb);
        console.log('[McForecast] 3Peaks Sales rows:',_pkSal.length);
        ds.peaksSalesRows.push(..._pkSal);
      }
      else if(type==='register')ds.auditRows.push(...parseRegisterAudit(wb));
      else if(type==='trends') ds.trendsRows.push(...parseTrends(wb));
    else if(type==='dar') {
      // Extract date from filename: Daily_Activity_Report_YYYYMMDD.xlsx
      const dm = file.name.match(/(\d{8})/);
      const dateHint = dm ? new Date(dm[1].slice(0,4)+'-'+dm[1].slice(4,6)+'-'+dm[1].slice(6,8)+'T12:00:00') : new Date();
      ds.darRows.push(...parseDARData(wb, dateHint));
    }
    else if(type==='pmix') {
      const pmx = parsePMixData(wb);
      Object.assign(ds.pmixData, pmx.byFamily ? {[file.name]: pmx} : {});
    }
      else if(type==='inventory'){const ir=parseInventoryData(wb,filename||'');if(ir.length)ds.inventoryRows.push(...ir);}
      else if(type==='records') Object.assign(ds.records,parseRecords(wb));
      else{
        // Auto-detect sheets in combined workbook
        const sh={
          labor:wb.SheetNames.find(s=>s.toLowerCase().includes('labor'))||wb.SheetNames[0],
          ops:wb.SheetNames.find(s=>s.toLowerCase()==='service'||s.toLowerCase().startsWith('service'))||null,
          ctrl:wb.SheetNames.find(s=>s.toLowerCase()==='controls'||s.toLowerCase().startsWith('controls'))||null,
          weather:wb.SheetNames.find(s=>s.toLowerCase().includes('weather'))||null,
          targets:wb.SheetNames.find(s=>s.toLowerCase().includes('target'))||null,
        };
        if(sh.labor)  ds.laborRows.push(...parseLaborData(wb,sh.labor));
        if(sh.ops)    ds.opsRows.push(...parseOpsData(wb,sh.ops));
        if(sh.ctrl)   ds.ctrlRows.push(...parseCtrlData(wb,sh.ctrl));
        if(sh.weather)ds.weatherRows.push(...parseWeatherData(wb,sh.weather));
        if(sh.targets)Object.assign(ds.targets,parseTargets(wb,sh.targets));
      }
    }catch(e){console.warn('Parse error:',type,e);}
  }
  ds.loaded=ds.laborRows.length>0;
  // Auto-tag holidays on every data load (v4.195) — was previously only a
  // side-effect of generating a Review Pack, an easy-to-miss manual trigger.
  // Idempotent: skips anything already tagged, so this is safe to run on
  // every load without overwriting manual corrections.
  if(ds.loaded){
    try{
      const _existingEvents=JSON.parse(localStorage.getItem('mf_events')||'{}');
      const {events:_taggedEvents,tagged:_autoTaggedCount}=autoTagHolidays(ds.laborRows,_existingEvents);
      if(_autoTaggedCount>0) localStorage.setItem('mf_events',JSON.stringify(_taggedEvents));
    }catch(e){console.warn('Auto-holiday-tag on load failed:',e);}
  }
  function bIdx(rows){const idx={};for(const r of rows){if(!r.loc||!r.date)continue;const k=r.loc+'_'+dKey(r.date);if(!idx[k])idx[k]=[];idx[k].push(r);}return idx;}
  // Weather-specific index: keyed by date only (station ID irrelevant for regional OK weather)
  function bWxIdx(rows){
  const idx={};
  for(const r of rows){
    if(!r.date) continue;
    const dk=dKey(r.date);
    // Per-store key for Open-Meteo data (loc-specific lookup)
    if(r.loc) idx[String(r.loc)+'_'+dk]=r;
    // Date-only key for backward compat (keeps first entry per date)
    if(!idx[dk]) idx[dk]=r;
  }
  return idx;
}
  ds.laborIdx=bIdx(ds.laborRows);ds.opsIdx=bIdx(ds.opsRows);
  ds.ctrlIdx=bIdx(ds.ctrlRows);ds.weatherIdx=bIdx(ds.weatherRows);
  ds.laborByLoc=bLocIdx(ds.laborRows);ds.opsByLoc=bLocIdx(ds.opsRows);
  ds.ctrlByLoc=bLocIdx(ds.ctrlRows);ds.darByLoc=bLocIdx(ds.darRows);
  ds.wxByDate=bWxIdx(ds.weatherRows); // date-only lookup — station ID irrelevant for regional OK
  ds.storeIds=[...new Set(ds.laborRows.map(r=>r.loc))].sort();
  for(const r of ds.laborRows){if(r.sales>0){if(!ds.lastActual[r.loc]||r.date>ds.lastActual[r.loc])ds.lastActual[r.loc]=r.date;}}
  if(ds.auditRows.length>0)ds.empRisk=analyzeRegisterAudit(ds.auditRows);
  return ds;
}


function computeOpsScore(p,t,sc){
  let score=0,max=0;
  if(t.tOepe>0&&p.oepe>0){max+=15;if(p.oepe<=t.tOepe)score+=sc.oepeT1pts;else if(p.oepe<=t.tOepe+sc.oepeT2gap)score+=sc.oepeT2pts;else if(p.oepe<=t.tOepe+sc.oepeT3gap)score+=sc.oepeT3pts;}
  if(t.tKvst>0&&p.kvst>0){max+=sc.kvstMaxPts;if(p.kvst<=t.tKvst)score+=sc.kvstMaxPts;else if(p.kvst<=t.tKvst*sc.kvstPartialPct)score+=sc.kvstPartialPts;}
  if(t.tKvsu>0&&p.kvsu>0){max+=sc.kvsuMaxPts;if(p.kvsu>=t.tKvsu)score+=sc.kvsuMaxPts;else if(p.kvsu>=t.tKvsu*sc.kvsuPartialPct)score+=sc.kvsuPartialPts;}
  if(t.tPark>0&&p.park>0){max+=sc.parkMaxPts;if(p.park<=t.tPark)score+=sc.parkMaxPts;else if(p.park<=t.tPark*sc.parkPartialPct)score+=sc.parkPartialPts;}
  if(t.tTpph>0&&p.tpph>0){max+=sc.tpphMaxPts;if(p.tpph>=t.tTpph)score+=sc.tpphMaxPts;else if(p.tpph>=t.tTpph*sc.tpphT2pct)score+=sc.tpphT2pts;else if(p.tpph>=t.tTpph*sc.tpphT3pct)score+=sc.tpphT3pts;}
  if(t.tLabor>0&&p.laborPct>0){max+=sc.laborMaxPts;const g=Math.abs(p.laborPct-t.tLabor);if(g<=sc.laborT1gap)score+=sc.laborMaxPts;else if(g<=sc.laborT2gap)score+=sc.laborT1pts;else if(g<=sc.laborT3gap)score+=sc.laborT2pts;}
  return max?+(score/max*100).toFixed(1):50;
}

function computeCtrlScore(p,sc){
  let score=0;const ac=Math.abs(p.cashOSPct||0);const{cashPts,tredPts,otPts,refundPts,discPts}=sc;
  if(ac<=sc.cashT1)score+=cashPts[0];else if(ac<=sc.cashT2)score+=cashPts[1];else if(ac<=sc.cashT3)score+=cashPts[2];else if(ac<=sc.cashT4)score+=cashPts[3];
  const tra=p.tRedAPct||0;if(tra<=sc.tredT1)score+=tredPts[0];else if(tra<=sc.tredT2)score+=tredPts[1];else if(tra<=sc.tredT3)score+=tredPts[2];
  score+=3;
  const ot=p.otHrs||0;if(ot<=sc.otT1)score+=otPts[0];else if(ot<=sc.otT2)score+=otPts[1];else if(ot<=sc.otT3)score+=otPts[2];else if(ot<=sc.otT4)score+=otPts[3];
  const rc=p.cashRefCnt||0;if(rc<=sc.refundT1)score+=refundPts[0];else if(rc<=sc.refundT2)score+=refundPts[1];else if(rc<=sc.refundT3)score+=refundPts[2];
  const dp=p.discPct||0;if(dp<=sc.discT1)score+=discPts[0];else if(dp<=sc.discT2)score+=discPts[1];else if(dp<=sc.discT3)score+=discPts[2];
  return +Math.min(100,score/40*100).toFixed(1);
}

function normalizeScores(stores,mode){
  if(!mode||mode==='absolute'||!stores||!stores.length)return stores;
  if(mode==='relative'){
    const allO=stores.map(s=>s.opsScore),allC=stores.map(s=>s.ctrlScore);
    const mxO=Math.max(...allO),mnO=Math.min(...allO),mxC=Math.max(...allC),mnC=Math.min(...allC);
    return stores.map(s=>({...s,opsScore:mxO===mnO?80:+(60+40*((s.opsScore-mnO)/(mxO-mnO))).toFixed(1),ctrlScore:mxC===mnC?80:+(60+40*((s.ctrlScore-mnC)/(mxC-mnC))).toFixed(1)}));
  }
  if(mode==='optimistic')return stores.map(s=>({...s,opsScore:+Math.min(100,s.opsScore*1.12+5).toFixed(1),ctrlScore:+Math.min(100,s.ctrlScore*1.12+5).toFixed(1)}));
  return stores;
}

function buildBrief(p,t,os,cs,pSales,pLY,ds,loc){
  const f=[];const tR2p=t.tR2p||90;

  // ── CRITICAL FLAGS ────────────────────────────
  if(Math.abs(p.cashOSPct||0)>.005) f.push({t:'crit',m:'CRITICAL — CASH INTEGRITY: Cash Over/Short averaging '+(((p.cashOSPct||0)*100).toFixed(2))+'% of sales. Exceeds 0.5% threshold. Immediate video audit and deposit cross-reference required. This is the highest-priority integrity signal in the system.'});
  if((t.tRedAPct||0)>0&&(p.tRedAPct||0)>t.tRedAPct*1.5) f.push({t:'crit',m:'CRITICAL — POS INTEGRITY: Post-close T-Reds at '+((p.tRedAPct||0)*100).toFixed(2)+'% vs '+(t.tRedAPct*100).toFixed(2)+'% target ('+Math.round((p.tRedAPct/t.tRedAPct-1)*100)+'% over). After-close voids are the easiest and most common mechanism for skimming. Cross-reference register video for all after-hours activity.'});
  if((p.otHrs||0)>5) f.push({t:'crit',m:'CRITICAL — OVERTIME: Averaging '+(p.otHrs||0).toFixed(1)+' hrs/day of OT. At '+'$'+(p.avgRate||12).toFixed(2)+'/hr avg rate, this is adding ~$'+Math.round((p.otHrs||0)*1.5*(p.avgRate||12))+'/day in premium cost. Primary cause is typically scheduling structure, not traffic volume. Immediate schedule restructure required.'});
  if(p.hasPettyCash) f.push({t:'crit',m:'CRITICAL — PETTY CASH: Activity detected. This organization does not use petty cash — any amount present is an automatic integrity flag requiring immediate investigation.'});
  if(p.depositSuspect) f.push({t:'crit',m:'CRITICAL — DEPOSIT: Avg deposit is '+((p.depositVsSalesRatio||0)*100).toFixed(0)+'% of sales vs '+p.depositBaseline+' expected baseline for this location. Consistent shortfall is a cash diversion indicator. Cross-reference deposit slips vs POS daily reports.'});

  // ── CROSS-SIGNAL INTEGRITY ──────────────────
  if(p.r2pSuspect&&(p.tRedAPct||0)>(t.tRedAPct||.003)*1.2) f.push({t:'crit',m:'INTEGRITY ALERT — COMPOUND SIGNAL: R2P averaging '+Math.round(p.r2p||0)+'s (below 60s — early serve-off pattern) AND T-Red After elevated at '+((p.tRedAPct||0)*100).toFixed(2)+'%. Both signals appearing together strongly indicate order manipulation. Do not address separately — this warrants a coordinated video/register review.'});
  else if(p.r2pSuspect) f.push({t:'crit',m:'INTEGRITY ALERT — R2P: Averaging '+Math.round(p.r2p||0)+'s, below 60s threshold. Historically indicates orders served off EXPO monitor before food is ready, creating artificially fast times. Cross-reference EXPO reports and line video.'});
  else if((p.r2p||0)>tR2p+15) f.push({t:'watch',m:'WATCH — DINE-IN SPEED: R2P at '+Math.round(p.r2p||0)+'s vs '+tR2p+'s corporate target. Dine-in service lagging. Review EXPO workflow, kitchen-to-counter handoff, and crew positioning during service windows.'});

  // ── SCHEDULING COMPLIANCE ───────────────────
  if(p.floorCompliance!==null&&p.floorCompliance!==undefined&&(p.floorMgmtNeeded||0)>0){
    if(p.floorCompliance<0.75) f.push({t:'crit',m:'CRITICAL — SCHEDULING: Floor management compliance at '+((p.floorCompliance||0)*100).toFixed(0)+'%. Managers are not notating required floor hours on schedules. This inflates variable hour allocation and artificially increases labor cost calculations. Fix schedules before addressing labor%.'});
    else if(p.floorCompliance<0.90) f.push({t:'watch',m:'WATCH — SCHEDULING: Floor management compliance at '+((p.floorCompliance||0)*100).toFixed(0)+'% (target ≥90%). Incomplete floor hour notations are causing variable hour over-allocation. Coaching needed on schedule-building process.'});
    else f.push({t:'ok',m:'STRENGTH — SCHEDULING: Floor management compliance at '+((p.floorCompliance||0)*100).toFixed(0)+'%. Managers are correctly notating floor hours, enabling accurate variable hour allocation and reliable labor modeling.'});
  }

  // ── OPS WATCH FLAGS ─────────────────────────
  if((t.tOepe||0)>0&&(p.oepe||0)>t.tOepe+15){
    const lost=Math.round(((p.oepe||0)-t.tOepe)/30*4);
    f.push({t:'watch',m:'WATCH — OEPE: '+Math.round(p.oepe||0)+'s vs '+t.tOepe+'s target (+'+Math.round((p.oepe||0)-t.tOepe)+'s). Estimated '+lost+' additional abandoned cars per peak hour. Primary drivers are typically window staffing, beverage positioning, and pull-time execution. Review order-to-pull sequence and window crew alignment.'});
  } else if((t.tOepe||0)>0&&(p.oepe||0)>0&&(p.oepe||0)<=t.tOepe) {
    f.push({t:'ok',m:'STRENGTH — OEPE: '+Math.round(p.oepe||0)+'s vs '+t.tOepe+'s target. Drive-thru speed is meeting store-specific standard. Window execution and pull-time management are working.'});
  }

  if((t.tLabor||0)>0&&(p.laborPct||0)>t.tLabor+.02) f.push({t:'watch',m:'WATCH — LABOR: '+((p.laborPct||0)*100).toFixed(1)+'% vs '+(t.tLabor*100).toFixed(1)+'% target (+'+Math.round(((p.laborPct||0)-t.tLabor)*100*10)/10+'%). '+((p.otHrs||0)>2?'Overtime is the primary driver ($'+Math.round((p.otHrs||0)*1.5*(p.avgRate||12))+'/day premium). Restructure scheduling before cutting crew.':'Likely a volume-vs-schedule alignment issue. Review schedule build process and floor hour compliance.')});

  if((p.discPct||0)>.065) f.push({t:'watch',m:'WATCH — DISCOUNTS: '+((p.discPct||0)*100).toFixed(1)+'% of sales. P90 across district is 6.5%. Verify against active LTO calendar. Unauthorized discounting erodes net sales without corresponding traffic benefit.'});

  if((t.tPark||0)>0&&(p.park||0)>t.tPark*1.3) f.push({t:'watch',m:'WATCH — DT PARKING: '+((p.park||0)*100).toFixed(1)+'% vs '+(t.tPark*100).toFixed(1)+'% target. Kitchen is not keeping pace with DT demand. Review pull-time targets, pre-assembly process, and expediter positioning.'});

  if((t.tTpph||0)>0&&(p.tpph||0)>0&&(p.tpph||0)<t.tTpph*.9) f.push({t:'watch',m:'WATCH — THROUGHPUT: TPPH at '+(p.tpph||0).toFixed(2)+' vs '+t.tTpph.toFixed(1)+' target. Throughput is below standard — crew is not processing transactions efficiently relative to schedule. Review peak staffing alignment and window crew deployment.'});

  if((p.posOverCnt||0)>5) f.push({t:'watch',m:'WATCH — POS OVERRINGS: Averaging '+(p.posOverCnt||0).toFixed(1)+' overrings/day (target ≤5). Overrings are the operational equivalent of T-Reds — items voided after being added to an order. Pattern warrants manager-level review of POS activity.'});

  // ── SPECIFIC STRENGTHS ────────────────────────
  const critOrWatch = f.some(x=>x.t==='crit'||x.t==='watch');
  if(!critOrWatch) {
    if(cs>=90) f.push({t:'ok',m:'STRENGTH — CONTROLS ELITE ('+cs+'/100): Cash O/S '+((p.cashOSPct||0)*100).toFixed(3)+'% · T-Red After '+((p.tRedAPct||0)*100).toFixed(2)+'% · Drawer Opens '+(p.drawerOpens||0).toFixed(1)+'/day. All controls metrics within excellent ranges. This store is a cash integrity model.'});
    else if(cs>=80) f.push({t:'ok',m:'STRENGTH — CONTROLS ('+(cs)+'/100): Cash handling, POS activity, and refund patterns are within acceptable ranges. Cash O/S '+((p.cashOSPct||0)*100).toFixed(3)+'% · T-Red After '+((p.tRedAPct||0)*100).toFixed(2)+'%.'});
    if(os>=90) f.push({t:'ok',m:'STRENGTH — OPS ELITE ('+os+'/100): OEPE '+(p.oepe>0?Math.round(p.oepe)+'s':' on target')+' · TPPH '+(p.tpph||0).toFixed(2)+' · DT Parked '+((p.park||0)*100).toFixed(1)+'%. Exceptional operational execution across speed, throughput, and positioning metrics.'});
    else if(os>=80) f.push({t:'ok',m:'STRENGTH — OPS ('+os+'/100): Speed and throughput are performing well vs store-specific targets. OEPE '+(p.oepe>0?Math.round(p.oepe)+'s / target '+t.tOepe+'s':'')+' · TPPH '+(p.tpph||0).toFixed(2)+'.'});
  }

  if(f.length===0) f.push({t:'ok',m:'All monitored metrics are within normal ranges across Ops, Controls, Labor, and Scheduling. No flags raised.'});

  // ── RECORDS CONTEXT ───────────────────────────
  if(ds&&ds.records&&ds.records[loc]){
    const rec=ds.records[loc];
    const oepeRec=rec.oepe_no_parked||rec.oepe;
    if(oepeRec&&oepeRec.value>0&&(p.oepe||0)>0){
      const gap=Math.round((p.oepe||0)-oepeRec.value);
      if(gap>10) f.push({t:'watch',m:'OPPORTUNITY — OEPE: Store record is '+oepeRec.value+'s ('+( oepeRec.date instanceof Date?oepeRec.date:new Date(oepeRec.date)).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})+'), '+gap+'s better than current '+Math.round(p.oepe||0)+'s avg. That capability has been demonstrated. It can be replicated.'});
    }
    const salesRec=rec.total_sales;
    if(salesRec&&salesRec.value>0) f.push({t:'ok',m:'RECORD — SALES: All-time best single day: '+f$(salesRec.value)+' ('+(salesRec.date instanceof Date?salesRec.date:new Date(salesRec.date)).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})+').'});
  }

  // ── FORECAST LINE ────────────────────────────
  if(pLY>0) f.push({t:'fc',m:'AI FORECAST: '+f$(pSales)+' projected this period ('+fPct((pSales-pLY)/pLY)+' vs LY '+f$(pLY)+'). '+(pSales>=pLY?'Bullish — sustained momentum across T2/T4/T6 trend windows.':'Model reflects current operational headwinds and trend pressure. Improving ops factor will shift forecast upward.')});
  return f;
}

function buildStore(loc,ds,settings){
  const t=(ds&&ds.targets&&ds.targets[loc])||DEFAULT_TARGETS[loc]||{};
  const name=STORE_NAMES[loc]||('Store '+loc);
  const sc=settings.scoring||DEF_SETTINGS.scoring;
  let p;
  let p2=null,p4=null;
  if(ds&&ds.loaded){
    const _bt0=performance.now();
    p=compute6wk(loc,ds,settings.weeksBack||6);
    p2=compute6wk(loc,ds,2);
    p4=compute6wk(loc,ds,4);
    if(window._perfStats) window._perfStats.compute6wk += (performance.now()-_bt0);
  }else{
    // Mock deterministic data for demo
    function sr(n){const s=loc.split('').reduce((a,c)=>a*31+c.charCodeAt(0),0);const x=Math.sin(s*(n+1))*10000;return x-Math.floor(x);}
    p={oepe:Math.round((t.tOepe||130)*(0.88+sr(1)*.28)),kvst:Math.round((t.tKvst||50)*(0.88+sr(2)*.28)),
      kvsu:Math.min(1,Math.max(.2,(t.tKvsu||.7)*(0.75+sr(3)*.4))),park:Math.min(.5,Math.max(.02,(t.tPark||.15)*(0.65+sr(4)*.65))),
      tpph:+((t.tTpph||5.5)*(0.82+sr(5)*.35)).toFixed(2),laborPct:+((t.tLabor||.21)*(0.9+sr(6)*.22)).toFixed(4),
      actVsNeed:(sr(6)-.5)*40,otHrs:+(sr(7)*6.5).toFixed(1),cashOSPct:+((sr(8)-.45)*.014).toFixed(5),
      tRedAPct:+((t.tRedAPct||.002)*(0.4+sr(9)*2.2)).toFixed(5),discPct:+(0.03+sr(10)*.055).toFixed(3),
      cashRefCnt:+(sr(11)*5).toFixed(1),spph:+(8+sr(12)*4).toFixed(2),avgRate:+(10+sr(13)*3).toFixed(2),
      posOverCnt:+(sr(14)*8).toFixed(1),drawerOpens:+(t.tDrawer||50)*(0.8+sr(15)*.4),
      empMealAmt:+(sr(16)*30).toFixed(2),mgrMealAmt:+(sr(17)*20).toFixed(2),manualRefAmt:+(sr(18)*80).toFixed(2),
      r2p:+(75+sr(19)*40).toFixed(0),r2pSuspect:false,floorCompliance:null,floorMgmtNeeded:0,
      hasPettyCash:false,depositSuspect:false,depositVsSalesRatio:null,oppCostDollar:+(sr(20)*100).toFixed(0)};
  }
  const os=computeOpsScore(p,t,sc);
  const cs=computeCtrlScore(p,sc);
  // Velocity: delta between the last 2 weeks (p2) vs the prior 2 weeks (implied by p4).
  // p4 = 4-week avg. Prior 2 weeks = (p4*4 - p2*2) / 2 → simplifies to (2*p4 - p2).
  // velocity = p2 - (2*p4 - p2) = 2*(p2 - p4). Divide by 2 so magnitude ≈ actual delta.
  const _vd = (a,b) => (a>0&&b>0) ? +(a-b).toFixed(4) : null;
  const vel = (ds&&ds.loaded&&p2&&p4) ? {
    oepe:    _vd(p2.oepe,    p4.oepe),
    tpph:    _vd(p2.tpph,    p4.tpph),
    laborPct:_vd(p2.laborPct,p4.laborPct),
    cashOS:  _vd(Math.abs(p2.cashOSPct||0), Math.abs(p4.cashOSPct||0)),
    opsScore:+(computeOpsScore(p2,t,sc)-computeOpsScore(p4,t,sc)).toFixed(0),
    ctrlScore:+(computeCtrlScore(p2,sc)-computeCtrlScore(p4,sc)).toFixed(0),
  } : null;
  const cut4=new Date(Date.now()-28*86400000);
  const now4=new Date(Date.now());
  let pSales=0,pLY=0;
  if(ds&&ds.loaded){
    // pLY must mirror pSales's exact window width (28 days) shifted back one year —
    // missing upper bound here previously summed ~392 days of LY sales against
    // pSales's 28 days, producing a uniform ~93% "decline" on every store that
    // was a unit-window mismatch, not a real signal.
    for(const r of locRows(ds.laborByLoc, ds.laborRows, loc)){if(r.date>=cut4)pSales+=r.sales||r.projSales||0;const lyDt=addD(r.date,364);if(lyDt>=cut4&&lyDt<=now4&&r.sales>0)pLY+=r.sales;}
  }else{
    function sr(n){const s=loc.split('').reduce((a,c)=>a*31+c.charCodeAt(0),0);const x=Math.sin(s*(n+1))*10000;return x-Math.floor(x);}
    const ap=(t.tOepe<=75?2800000:t.tOepe<=110?2100000:t.tOepe<=125?1750000:1400000)/52;
    pLY=Math.round(ap*(0.92+sr(12)*.16));
    pSales=Math.round(pLY*(1+(os+cs)/200*.14-.03+(sr(13)-.5)*.06));
  }
  const _bft0=performance.now();
  const findings=buildBrief(p,t,os,cs,pSales,pLY,ds,loc);
  if(window._perfStats) window._perfStats.buildBrief += (performance.now()-_bft0);

  // ── PREDICTIVE OEPE ALERT ──────────────────────────────────────────────────
  // Fires when OEPE is currently within target but velocity shows it getting worse.
  // vel.oepe > 0 means the 2-week avg is higher than the 4-week avg (deteriorating).
  if(vel&&vel.oepe!=null&&vel.oepe>2&&t.tOepe>0&&p.oepe>0&&p.oepe<=t.tOepe){
    const gap = t.tOepe - p.oepe;           // seconds under target (positive = within target)
    const ratePerWeek = vel.oepe / 2;       // vel.oepe is per 2-week delta → convert to per week
    const weeksToBreachEst = gap / ratePerWeek;
    if(weeksToBreachEst < 8 && weeksToBreachEst > 0) {
      findings.push({t:'watch',m:'TREND ALERT — OEPE TRAJECTORY: Currently '+Math.round(p.oepe)+'s ('+Math.round(gap)+'s under target) but worsening at '+vel.oepe.toFixed(1)+'s per 2-week period. At this rate, store is on track to breach the '+Math.round(t.tOepe)+'s target in ~'+Math.round(weeksToBreachEst)+' week'+(weeksToBreachEst>=2?'s':'')+'. Address window crew alignment and pull-time execution before this becomes a flag.'});
    }
  }
  // Predictive labor drift alert
  if(vel&&vel.laborPct!=null&&vel.laborPct>0.005&&t.tLabor>0&&p.laborPct>0&&p.laborPct<=t.tLabor){
    const gap = t.tLabor - p.laborPct;
    const ratePerWeek = vel.laborPct / 2;
    const weeksToBreachEst = gap / ratePerWeek;
    if(weeksToBreachEst < 8 && weeksToBreachEst > 0) {
      findings.push({t:'watch',m:'TREND ALERT — LABOR TRAJECTORY: Currently '+(p.laborPct*100).toFixed(1)+'% (under the '+(t.tLabor*100).toFixed(1)+'% target) but trending higher at '+((vel.laborPct||0)*100).toFixed(1)+'pp per 2 weeks. Projected to exceed target in ~'+Math.round(weeksToBreachEst)+' week'+(weeksToBreachEst>=2?'s':'')+'. Review scheduling trends before it becomes a finding.'});
    }
  }

  const hasCrit=findings.some(f=>f.t==='crit');
  const concern=hasCrit?(Math.abs(p.cashOSPct||0)>.005?'Cash O/S >0.5%':(p.tRedAPct||(t.tRedAPct||0)*1.5)>0&&(p.tRedAPct||0)>(t.tRedAPct||0)*1.5?'T-Red After elevated':(p.otHrs||0)>5?'OT >5 hrs/day':'Multiple flags'):((p.oepe||0)>t.tOepe+15&&t.tOepe>0)?'OEPE over target':((p.laborPct||0)>t.tLabor+.02&&t.tLabor>0)?'Labor% over target':null;
  const strength=!hasCrit?(cs>=90?'Controls: Elite':os>=90?'Ops: Elite':cs>=80?'Controls: Strong':os>=80?'Ops: Strong':null):null;
  const sc2=STORE_COORDS[loc]||{};
  const staff=STORE_STAFF[loc]||{};
  // Find operator name from settings
  let operator='';
  for(const[op,locs] of Object.entries((settings.operators||DEF_SETTINGS.operators))){
    if(locs.includes(loc)){operator=op.replace(' (EA)','');break;}
  }
  return{loc,name,t,p,p2,p4,vel,opsScore:os,ctrlScore:cs,pSales,pLY,findings,hasCrit,concern,strength,
    city:sc2.city||'',state:sc2.state||'',addr:sc2.addr||'',org:sc2.org||'MCDOK',
    gm:staff.gm||'',gmEmail:staff.gmEmail||'',
    sup:staff.sup||'',supEmail:staff.supEmail||'',
    operator,
    hasRecords:!!(ds&&ds.records&&ds.records[loc]&&Object.keys(ds.records[loc]).filter(k=>k!=='loc').length>0)};
}



// SECTION 6: DATE PRESETS

function mergeDS(existing, wb, type, filename) {
  // type may be a string ('peaks') or a detectType() object ({type:'peaks',...}) — normalize
  if(type && typeof type === 'object') type = type.type || 'unknown';
  // Clone existing DS arrays (shallow) and add new parsed rows
  const ds = {
    ...existing,
    laborRows:     [...existing.laborRows],
    opsRows:       [...existing.opsRows],
    ctrlRows:      [...existing.ctrlRows],
    weatherRows:   [...existing.weatherRows],
    peaksSvcRows:  [...(existing.peaksSvcRows||[])],
    peaksSalesRows:[...(existing.peaksSalesRows||[])],
    auditRows:     [...(existing.auditRows||[])],
    fobRows:       [...(existing.fobRows||[])],
    trendsRows:    [...(existing.trendsRows||[])],
    inventoryRows: [...(existing.inventoryRows||[])],
    glimpseRows:   [...(existing.glimpseRows||[])],
    cashRows:      [...(existing.cashRows||[])],
    exceptionRows: [...(existing.exceptionRows||[])],
    targets:       {...existing.targets},
    records:       {...existing.records},
  };
  try {
    console.log('[McForecast] Parsing file type:', type, '| Sheets:', wb.SheetNames.join(', '));
    const _beforeRows = {labor:ds.laborRows.length, ops:ds.opsRows.length, ctrl:ds.ctrlRows.length, peaks:(ds.peaksSvcRows||[]).length, audit:(ds.auditRows||[]).length};
    if(type==='labor')    ds.laborRows.push(...parseLaborData(wb));
    else if(type==='ops') ds.opsRows.push(...parseOpsData(wb));
    else if(type==='ctrl')ds.ctrlRows.push(...parseCtrlData(wb));
    else if(type==='weather')ds.weatherRows.push(...parseWeatherData(wb));
    else if(type==='targets')Object.assign(ds.targets,parseTargets(wb));
    else if(type==='peaks'){ds.peaksSvcRows.push(...parse3PeaksService(wb));ds.peaksSalesRows.push(...parse3PeaksSales(wb));}
    else if(type==='register')ds.auditRows.push(...parseRegisterAudit(wb));
    else if(type==='trends')ds.trendsRows.push(...parseTrends(wb));
    else if(type==='inventory'){const ir=parseInventoryData(wb,filename||'');if(ir.length)ds.inventoryRows.push(...ir);}
    else if(type==='dar'){
      const dm=(filename||'').match(/(\d{8})/);
      const dh=dm?new Date(dm[1].slice(0,4)+'-'+dm[1].slice(4,6)+'-'+dm[1].slice(6,8)+'T12:00:00'):new Date();
      if(!ds.darRows)ds.darRows=[];
      ds.darRows.push(...parseDARData(wb,dh));
    }
    else if(type==='pmix'){
      if(!ds.pmixData)ds.pmixData={};
      const pmx=parsePMixData(wb);
      ds.pmixData[filename||'pmix']=pmx;
    }
    else if(type==='shiftmgr'){if(!ds.shiftRows)ds.shiftRows=[];ds.shiftRows.push(...parseShiftMgr(wb));}
    else if(type==='records')Object.assign(ds.records,parseRecords(wb));
    // ── QSRSoft email report types ──────────────────────────────────────────
    else if(type==='sales-ledger')ds.laborRows.push(...parseSalesLedger(wb));
    else if(type==='daily-glimpse'){
      const _dm=(filename||'').match(/(\d{4}-\d{2}-\d{2})/);
      const _dh=_dm?new Date(_dm[1]+'T12:00:00'):new Date();
      ds.glimpseRows.push(...parseDailyGlimpse(wb,_dh));
    }
    else if(type==='cash-sheet')ds.cashRows.push(...parseCashSheet(wb));
    else if(type==='labor-exceptions')ds.exceptionRows.push(...parseLaborExceptions(wb));
    else if(type==='ops_report'||type==='combined'){
      // Operations Report: Sales + Service + Controls + FOB sheets.
      // All sheets are period-summary format (no Business Date column).
      // Extract period date from filename (most reliable — never truncated like sheet names).
      // Handles YYYYMMDD, YYYY-MM-DD, and sheet-name fallback for any filename format.
      const _fn=String(filename||'');
      const _fnD8=_fn.match(/(\d{8})/g)||[];
      const _fnDash=_fn.match(/(\d{4}-\d{2}-\d{2})/g)||[];
      let _toDate,_fromDate;
      if(_fnD8.length>=2){
        const fmt=s=>s.slice(0,4)+'-'+s.slice(4,6)+'-'+s.slice(6,8);
        _fromDate=new Date(fmt(_fnD8[0])+'T12:00:00');
        _toDate=new Date(fmt(_fnD8[_fnD8.length-1])+'T12:00:00');
      } else if(_fnDash.length>=2){
        _fromDate=new Date(_fnDash[0]+'T12:00:00');
        _toDate=new Date(_fnDash[_fnDash.length-1]+'T12:00:00');
      } else {
        // Fallback: collect all complete YYYY-MM-DD dates from sheet names
        const _shDates=[...(new Set((wb.SheetNames||[]).flatMap(s=>(s.match(/(\d{4}-\d{2}-\d{2})/g)||[]))))].sort();
        _fromDate=_shDates.length?new Date(_shDates[0]+'T12:00:00'):null;
        _toDate=_shDates.length?new Date(_shDates[_shDates.length-1]+'T12:00:00'):new Date();
      }
      console.log('[McForecast] Ops Report date range:',_fromDate?.toDateString(),'→',_toDate?.toDateString(),'| from file:',_fn.slice(-40));
      try{ds.laborRows.push(...parseLaborData(wb,null,_toDate));}
      catch(e){console.warn('[McForecast] Sales sheet parse error:',e.message);}
      try{ds.opsRows.push(...parseOpsData(wb,null,_toDate));}
      catch(e){console.warn('[McForecast] Service sheet parse error:',e.message);}
      try{const ctr=parseCtrlData(wb,null,_toDate);if(ctr&&ctr.length)ds.ctrlRows.push(...ctr);}
      catch(e){console.warn('[McForecast] Controls sheet parse error:',e.message);}
      try{ds.fobRows.push(...parseFOBData(wb,null,_toDate,_fromDate));}
      catch(e){console.warn('[McForecast] FOB sheet parse error:',e.message);}
    }
    else {
      // Try to auto-detect sheets
      const sh=autoDetectSheets(wb);
      if(sh.labor)ds.laborRows.push(...parseLaborData(wb,sh.labor));
      if(sh.ops)ds.opsRows.push(...parseOpsData(wb,sh.ops));
      if(sh.ctrl)ds.ctrlRows.push(...parseCtrlData(wb,sh.ctrl));
    }
  } catch(e){console.warn('mergeDS parse error:',type,filename,e);}
  console.log('[McForecast] After parse - Labor:', ds.laborRows.length, 'Ops:', ds.opsRows.length, 'Ctrl:', ds.ctrlRows.length, '3Peaks:', (ds.peaksSvcRows||[]).length, 'Audit:', (ds.auditRows||[]).length);
  // Deduplication: for each (loc, date) key, keep only the LAST row added.
  // Channel-field rescue: when removing an earlier row, preserve any non-zero
  // channel sales/pct fields into the surviving row. This handles the case where
  // an Operations Report (channel-rich) is loaded first, then a Labor Analysis
  // (channel-empty) is loaded for the same dates — without rescue, the Labor
  // Analysis row wins and channel data is silently lost.
  const CH_FIELDS = ['bfSales','bfGC','bfAvgChk','bfPctTotal',
    'delivSales','delivGC','delivAvgChk','delivPctTotal',
    'mopSales','mopGC','mopAvgChk','mopPctTotal',
    'kioskSales','kioskGC','kioskAvgChk','kioskPctTotal',
    'eatInSales','eatInGC','inStoreSales','inStoreGC','inStorePctTotal',
    'fcSales','fcGC','fcPctTotal'];
  function dedup(rows){
    const seen={};
    for(let i=rows.length-1;i>=0;i--){
      const r=rows[i];if(!r.loc||!r.date)continue;
      const k=r.loc+'_'+dKey(r.date);
      if(!seen[k]){seen[k]=i;}
      else{
        // Rescue non-zero channel fields from the row being discarded into the kept row
        const kept=rows[seen[k]];
        for(const f of CH_FIELDS){if((r[f]||0)!==0&&!(kept[f]||0))kept[f]=r[f];}
        rows.splice(i,1);
      }
    }
    return rows;
  }
  dedup(ds.laborRows);dedup(ds.opsRows);dedup(ds.ctrlRows);dedup(ds.fobRows);
  // Rebuild indexes
  function bIdx(rows){const idx={};for(const r of rows){if(!r.loc||!r.date)continue;const k=r.loc+'_'+dKey(r.date);if(!idx[k])idx[k]=[];idx[k].push(r);}return idx;}
  function bWxIdx(rows){const idx={};for(const r of rows){if(!r.date)continue;const k=dKey(r.date);if(!idx[k])idx[k]=r;}return idx;}
  ds.laborIdx=bIdx(ds.laborRows);ds.opsIdx=bIdx(ds.opsRows);
  ds.ctrlIdx=bIdx(ds.ctrlRows);ds.weatherIdx=bIdx(ds.weatherRows);
  ds.laborByLoc=bLocIdx(ds.laborRows);ds.opsByLoc=bLocIdx(ds.opsRows);
  ds.ctrlByLoc=bLocIdx(ds.ctrlRows);ds.darByLoc=bLocIdx(ds.darRows);
  ds.wxByDate=bWxIdx(ds.weatherRows);
  ds.storeIds=[...new Set(ds.laborRows.map(r=>r.loc))].sort();
  ds.loaded=ds.laborRows.length>0;
  // Auto-tag holidays on every data load (v4.195) — was previously only a
  // side-effect of generating a Review Pack, an easy-to-miss manual trigger.
  // Idempotent: skips anything already tagged, so this is safe to run on
  // every load without overwriting manual corrections.
  if(ds.loaded){
    try{
      const _existingEvents=JSON.parse(localStorage.getItem('mf_events')||'{}');
      const {events:_taggedEvents,tagged:_autoTaggedCount}=autoTagHolidays(ds.laborRows,_existingEvents);
      if(_autoTaggedCount>0) localStorage.setItem('mf_events',JSON.stringify(_taggedEvents));
    }catch(e){console.warn('Auto-holiday-tag on load failed:',e);}
  }
  ds.lastActual={};
  for(const r of ds.laborRows){if(r.sales>0){if(!ds.lastActual[r.loc]||r.date>ds.lastActual[r.loc])ds.lastActual[r.loc]=r.date;}}
  if(ds.auditRows.length>0)ds.empRisk=analyzeRegisterAudit(ds.auditRows);
  return ds;
}

export { buildDS, mergeDS, buildStore, buildBrief, computeOpsScore, computeCtrlScore, normalizeScores };
