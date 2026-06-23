// @ts-nocheck
import * as React from 'react';
import { STORE_NAMES, sName, sNameC, DEFAULT_TARGETS, STORE_COORDS, EVENT_TYPES } from '../constants.js';
import { dKey } from '../utils/date.js';

const h = React.createElement;
const { useState: uSt, useEffect: uE, useMemo: uM, useRef: uR, useCallback: uCB } = React;

// ════════════════════════════════════════════════════════════════════════════════
// MORNING INTELLIGENCE BRIEF  —  Correlation Engine + Panel
// ════════════════════════════════════════════════════════════════════════════════

// ── Supervisor patch map (from org structure) ────────────────────────────────
const SUPERVISOR_PATCHES = {
  'Spencer':   ['3708','6972','24471','32525'],
  'Langford':  ['5183','33222','29760','33704'],
  'Podroza':   ['5985','13113','43380','43701'],
  'Vaughn':    ['10422','10915','35064','31357'],
  'Estrada':   ['20475','18213','11657','33109'],
  'Denley':    ['6178','6838','10034','35242','37566','38609'],
};
const LOC_SUPERVISOR = {};
Object.entries(SUPERVISOR_PATCHES).forEach(([sup,locs])=>locs.forEach(l=>LOC_SUPERVISOR[l]=sup));

// ── Correlation rules engine ─────────────────────────────────────────────────
// Each rule: { id, name, category, description, evaluate(data) → {severity,headline,detail,action} | null }
const MORNING_RULES = [

  { id:'DRAWER_OPENS', name:'Cash Integrity Risk', category:'controls', icon:'💰',
    evaluate(d){
      const v=d.drawerOpens;
      if(v==null) return null;
      if(v>=10) return {severity:'RED',
        headline:`${v} drawer opens — HIGH cash integrity risk`,
        detail:`10+ drawer opens indicates either a severely untrained employee making repeated errors (leading to T-Reds, refunds, overrings) or an experienced employee actively gaming the register to remove excess cash. Either scenario requires immediate follow-up.`,
        action:`Pull register audit detail for this date. Identify the employee(s) with highest opens. Review corresponding T-Red After Total %, refunds, and manual overrings for the same shift.`};
      if(v>=5) return {severity:'AMBER',
        headline:`${v} drawer opens — elevated cash integrity risk`,
        detail:`5–9 drawer opens is above normal. Could be an inexperienced employee struggling with the register or an early pattern worth monitoring.`,
        action:`Review register activity log. Confirm with shift manager who was on register. Check for corresponding cash variance or overring activity.`};
      return null;
    }},

  { id:'REFUND_OVERRING', name:'Large Refund or Overring', category:'controls', icon:'🧾',
    evaluate(d){
      const refund=d.refundAmt||0, over=d.posOverAmt||d.manualRefAmt||0;
      const maxV=Math.max(refund,over), isRef=refund>=over;
      if(maxV>=100) return {severity:'RED',
        headline:`$${maxV.toFixed(2)} ${isRef?'refund':'overring'} — immediate investigation required`,
        detail:`Transactions of this size are almost never legitimate without manager authorization and documentation. This is a significant red flag for POS manipulation.`,
        action:`Pull the specific transaction record. Identify employee and MOD. Obtain explanation and documentation. Review video surveillance if available.`};
      if(maxV>=50) return {severity:'AMBER',
        headline:`$${maxV.toFixed(2)} ${isRef?'refund':'overring'} — verify authorization`,
        detail:`Above the normal $50 threshold. Requires confirmation of proper manager authorization and a legitimate business reason.`,
        action:`Confirm transaction was manager-approved and documented with reason.`};
      return null;
    }},

  { id:'TRED_SPIKE', name:'T-Red After Total Spike', category:'controls', icon:'🔴',
    evaluate(d){
      const v=d.tRedAPct||d.tRedBPct||0;
      if(v==null||v===0) return null;
      const pct=v>1?v:v*100; // normalize to %
      if(pct>=3) return {severity:'RED',
        headline:`T-Red After Total at ${pct.toFixed(1)}% — controls concern`,
        detail:`T-Reds After Total represent voids after the Total button — a strong indicator of cash integrity issues. Rates above 3% warrant immediate review.`,
        action:`Review individual T-Red transactions. Cross-reference with drawer opens and cash O/S for the same shift.`};
      if(pct>=1.5) return {severity:'AMBER',
        headline:`T-Red After Total at ${pct.toFixed(1)}% — elevated`,
        detail:`Above normal range. Monitor for trend. Could indicate training issues or deliberate manipulation.`,
        action:`Review T-Red transactions and confirm with shift manager.`};
      return null;
    }},

  { id:'GC_SALES_DIVERGE', name:'Sales/GC Divergence — Theft Signal', category:'controls', icon:'📉',
    evaluate(d){
      const {salesVsExp, gcVsExp} = d;
      if(salesVsExp==null||gcVsExp==null) return null;
      const diverge = gcVsExp - salesVsExp; // GC is up relative to sales
      if(salesVsExp < -5 && gcVsExp > -2 && diverge >= 8) {
        const sev = diverge >= 15 ? 'RED' : 'AMBER';
        return {severity: sev,
          headline:`Sales ${salesVsExp.toFixed(1)}% below projection but GC only ${gcVsExp>0?'+':''}${gcVsExp.toFixed(1)}% — ${diverge.toFixed(0)}pp divergence`,
          detail:`Normal operations show sales and guest counts move together. When sales drop significantly but guest counts hold, the average check has collapsed — a pattern consistent with systematic POS reductions (voids, refunds, discounts, comp meals) inflating the gap.`,
          action:`Immediately review POS reductions for this period: manual refunds, voids, discounts, and comp meals. Calculate if reduction totals are proportionate to the sales gap. This pattern requires prompt investigation.`};
      }
      return null;
    }},

  { id:'STAFFED_SLOW', name:'Manager Not Actively Managing Floor', category:'service', icon:'👔',
    evaluate(d){
      const {actVsNeed, oepe, oepeNorm} = d;
      if(actVsNeed==null||oepe==null||!oepeNorm) return null;
      const staffOk = Math.abs(actVsNeed) <= 2;
      const oepeHigh = oepe > oepeNorm * 1.15;
      if(!staffOk||!oepeHigh) return null;
      const pctOver = Math.round((oepe/oepeNorm-1)*100);
      const sev = oepe > oepeNorm * 1.30 ? 'RED' : 'AMBER';
      return {severity: sev,
        headline:`OEPE ${Math.round(oepe)}s (${pctOver}% above norm) with adequate staffing (${actVsNeed>0?'+':''}${actVsNeed} vs needed)`,
        detail:`Staffing is not the issue — the location has what it needs. High OEPE despite adequate staffing points to the manager on duty not actively managing the floor, not properly planning the shift, or not being present during peak periods. If this persists beyond one period, it escalates to a management performance concern.`,
        action:`On next visit: observe floor management presence during peak periods. Review shift planner execution. Coach MOD on floor management fundamentals and holding crew accountable to speed standards.`};
    }},

  { id:'STAFFED_NO_PARK', name:'Drive-Through Pull-Off Risk', category:'service', icon:'🚗',
    evaluate(d){
      const {actVsNeed, oepe, oepeNorm, dtPark} = d;
      if(actVsNeed==null||oepe==null||dtPark==null) return null;
      const staffOk = Math.abs(actVsNeed) <= 2;
      const oepeHigh = oepe > (oepeNorm||160) * 1.08;
      const parkLow = dtPark <= 5;
      if(!staffOk||!oepeHigh||!parkLow) return null;
      return {severity:'AMBER',
        headline:`OEPE ${Math.round(oepe)}s with DT Parked at ${Math.round(dtPark||0)}% — manager not pulling cars`,
        detail:`Adequate staffing and high OEPE with near-zero DT Parking indicates the manager is not using the park position to manage drive-through clock times. Customers are likely pulling off rather than waiting, representing lost sales and potentially inflating speed numbers through attrition.`,
        action:`Coach MOD on proactive DT parking to prevent pull-offs and maintain flow. Review DT window positioning procedures during peak periods.`};
    }},

  { id:'TIMER_GAMING', name:'Timing Data Integrity Issue', category:'service', icon:'⏱',
    evaluate(d){
      const {kvst, oepe, oepeNorm} = d;
      if(!kvst||!oepe) return null;
      const kvsVeryLow = kvst < 40;
      const oepeHigh = oepe > (oepeNorm||160) * 1.08;
      const kvsModLow = kvst < 55;
      if(kvsVeryLow && oepeHigh) return {severity:'RED',
        headline:`KVS ${Math.round(kvst)}s but OEPE ${Math.round(oepe)}s — timing math doesn't add up`,
        detail:`If kitchen times were legitimate at ${Math.round(kvst)}s, OEPE should be significantly lower. These metrics are inconsistent. Two explanations: (1) Kitchen staff are serving orders before completion — "serving off" — which inflates KVS performance while OEPE suffers because food isn't actually ready. (2) There is a fundamental breakdown getting completed food to customers at the window. Either way, something is wrong.`,
        action:`Observe kitchen KVS compliance on next visit. Confirm employees are completing the full KVS sequence before serving. If serving off is occurring, address with crew and manager — this creates unreliable operational data and real service failure.`};
      if(kvsModLow && !oepeHigh) return {severity:'AMBER',
        headline:`KVS averaging ${Math.round(kvst)}s — unusually fast, verify accuracy`,
        detail:`Consistently low KVS times may indicate crew is completing the KVS sequence prematurely. Verify through observation.`,
        action:`Observe kitchen procedures on next visit. Confirm proper KVS sequencing and compliance.`};
      return null;
    }},

  { id:'KVS_USAGE_LOW', name:'Single-Side Kitchen Operation', category:'service', icon:'🍳',
    evaluate(d){
      const {kvsu, actVsNeed, oepe, oepeNorm} = d;
      if(kvsu==null||actVsNeed==null) return null;
      const kvsU = kvsu>1 ? kvsu : kvsu*100; // normalize to %
      const staffOk = actVsNeed >= -2; // not severely understaffed
      const kvsLow = kvsU < 20;
      const oepeHigh = oepe > (oepeNorm||160) * 1.08;
      if(!kvsLow||!staffOk||!oepeHigh) return null;
      return {severity:'AMBER',
        headline:`KVS usage ${Math.round(kvsU||0)}% with adequate staffing and high OEPE`,
        detail:`Low KVS utilization during adequate staffing windows with elevated OEPE strongly suggests the manager is operating only one side of the kitchen. At this volume level, single-side kitchen operation is a major constraint on speed and is a correctable management issue.`,
        action:`Confirm with MOD: are both kitchen sides being utilized during peak periods? Coach on dual-side kitchen management standards. KVS dual-side utilization with adequate staffing should be non-negotiable.`};
    }},

  { id:'DAYPART_OEPE', name:'Evening/Late Night OEPE Driving Variance', category:'service', icon:'🌙',
    evaluate(d){
      const {periods} = d;
      if(!periods||periods.length < 2) return null;
      const morning = periods.filter(p=>p.period<=11).map(p=>p.oepe).filter(Boolean);
      const evening = periods.filter(p=>p.period>=17).map(p=>p.oepe).filter(Boolean);
      if(!morning.length||!evening.length) return null;
      const avgAM = morning.reduce((a,b)=>a+b,0)/morning.length;
      const avgPM = evening.reduce((a,b)=>a+b,0)/evening.length;
      const gap = avgPM - avgAM;
      if(gap >= 25) return {severity:'AMBER',
        headline:`Evening OEPE (${Math.round(avgPM)}s) is ${Math.round(gap)}s higher than morning (${Math.round(avgAM)}s)`,
        detail:`A significant daypart OEPE gap typically points to evening/late night opportunities — less oversight, less accountability. This is where easy improvements hide. Fixing one daypart can move storewide metrics meaningfully.`,
        action:`Focus next coaching session on evening shift management. Review MOD floor presence and crew accountability during PM periods. Often a structural shift management issue rather than a staffing issue.`};
      return null;
    }},

  { id:'CASH_OS', name:'Cash Over/Short Variance', category:'controls', icon:'💵',
    evaluate(d){
      const v=d.cashOSAmt;
      if(v==null||v===0) return null;
      const abs = Math.abs(v);
      if(abs >= 20) return {severity: abs>=50?'RED':'AMBER',
        headline:`Cash O/S ${v<0?'short':'over'} by $${abs.toFixed(2)}`,
        detail:`${abs>=50?'Significant cash variance warrants immediate investigation.':'Cash variance above normal threshold.'} ${v<0?'Cash shorts are more concerning than overs and should always be traced.':'Cash overs can indicate pricing errors or transaction manipulation.'}`,
        action:`Reconcile drawer counts and identify the shift(s) with variance. Cross-reference with drawer opens and T-Red activity.`};
      return null;
    }},
];

// ── Compute 8-week rolling norms per store ───────────────────────────────────
function computeStoreNorms(loc, ds){
  const cutoff = new Date(Date.now()-56*24*3600*1000); // 8 weeks back
  const peaks = (ds.peaksSvcRows||[]).filter(r=>String(r.loc)===String(loc)&&r.date>=cutoff&&r.oepe>0);
  const labors = (ds.laborRows||[]).filter(r=>String(r.loc)===String(loc)&&r.date>=cutoff&&r.sales>0);
  const avg = (arr,f) => arr.length ? arr.reduce((s,r)=>s+(r[f]||0),0)/arr.length : null;
  const gcSalesRatios = labors.filter(r=>r.sales>0&&r.gc>0).map(r=>r.gc/r.sales);
  return {
    oepeNorm: avg(peaks,'oepe'),
    kvstNorm: avg(peaks.filter(r=>r.kvst>0),'kvst'),
    gcSalesRatio: gcSalesRatios.length ? gcSalesRatios.reduce((a,b)=>a+b,0)/gcSalesRatios.length : null,
  };
}

// ── Assemble one store's data for a target date ──────────────────────────────
function assembleBriefStoreData(loc, targetDate, ds){
  const locStr = String(loc);
  const dk = dKey(targetDate);
  const sameDay = r => String(r.loc)===locStr && dKey(r.date)===dk;
  // Also allow ±1 day for data availability
  const nearby = r => String(r.loc)===locStr && Math.abs(r.date-targetDate)<2*86400000;

  const labor  = (ds.laborRows||[]).find(sameDay) || (ds.laborRows||[]).find(nearby);
  const ctrl   = (ds.ctrlRows||[]).find(sameDay)  || (ds.ctrlRows||[]).find(nearby);
  const peaks  = (ds.peaksSvcRows||[]).filter(r=>String(r.loc)===locStr&&Math.abs(r.date-targetDate)<3*86400000);
  const norms  = computeStoreNorms(loc, ds);

  // Aggregate peaks to daily
  const avgPeaks = (f) => peaks.length ? peaks.map(r=>r[f]||0).filter(v=>v>0).reduce((a,b)=>a+b,0)/Math.max(1,peaks.filter(r=>(r[f]||0)>0).length) : null;
  const oepe = avgPeaks('oepe');
  const kvst = avgPeaks('kvst');
  const _kvsuRaw = avgPeaks('kvsu');
  const kvsu = _kvsuRaw==null?null:(_kvsuRaw<=1?_kvsuRaw*100:_kvsuRaw);
  const _parkRaw = avgPeaks('park');
  const dtPark = _parkRaw==null?null:(_parkRaw<=1?Math.round(_parkRaw*1000)/10:_parkRaw);

  // GC vs expected
  const salesVsExp = (()=>{
   const _p=labor?.projSales>0?labor.projSales:
     (()=>{const _t=typeof DEFAULT_TARGETS!=='undefined'?DEFAULT_TARGETS[locStr]:null;
           const _m=_t?.tJuneProj||_t?.tOperatorProj||_t?.tMayProj||0;
           return _m>0?Math.round(_m/30):0;})();
   return _p>0&&labor?.sales>0?(((labor.sales-_p)/_p)*100):null;
 })();
  const expGC = (norms.gcSalesRatio && labor?.sales) ? labor.sales*norms.gcSalesRatio : null;
  const gcVsExp = (expGC && labor?.gc) ? ((labor.gc-expGC)/expGC*100) : null;

  return {
    loc, name: sNameC(loc),
    supervisor: LOC_SUPERVISOR[locStr]||'Unknown',
    hasData: !!(labor||ctrl||peaks.length),
    // Labor fields
    sales:      labor?.sales>0 ? labor.sales : null,
    // projSales: prefer Lifelenz daily projection from Labor Analysis;
    // fall back to operator monthly projection ÷ 30 from DEFAULT_TARGETS
    projSales: (()=>{
      if(labor?.projSales>0) return labor.projSales;
      const tgt = typeof DEFAULT_TARGETS!=='undefined' ? DEFAULT_TARGETS[locStr] : null;
      const monthly = tgt?.tJuneProj || tgt?.tOperatorProj || tgt?.tMayProj || 0;
      return monthly>0 ? Math.round(monthly/30) : null;
    })(),
    gc:         labor?.gc>0 ? labor.gc : (labor?.actualGC>0 ? labor.actualGC : null),
    tpph:       labor?.tpph>0 ? labor.tpph :
                (ctrl?.tpph>0 ? ctrl.tpph :
                (DEFAULT_TARGETS[locStr]?.tJuneTpph>0 ? DEFAULT_TARGETS[locStr].tJuneTpph : null)),
    laborPct:   labor?.laborPct>0 ? labor.laborPct :
                (ctrl?.laborPct>0 ? ctrl.laborPct :
                (DEFAULT_TARGETS[locStr]?.tJuneLaborPct>0 ? DEFAULT_TARGETS[locStr].tJuneLaborPct : null)),
    actVsNeed:  labor?.actVsNeed != null ? labor.actVsNeed : (ctrl?.actVsNeed ?? null),
    salesVsExp, gcVsExp,
    // Controls fields
    drawerOpens:  ctrl?.drawerOpens||null,
    posOverAmt:   ctrl?.posOverAmt||null,
    manualRefAmt: ctrl?.manualRefAmt||null,
    refundAmt:    ctrl?.refundAmt||(ctrl?.cashRefAmt||0)+(ctrl?.cashlessRefAmt||0)||null,
    tRedAPct:     ctrl?.tRedAPct||null,
    tRedBPct:     ctrl?.tRedBPct||null,
    cashOSAmt:    ctrl?.cashOSAmt||null,
    // Service fields
    oepe, kvst, kvsu, dtPark,
    oepeNorm: norms.oepeNorm,
    kvstNorm: norms.kvstNorm,
    // Daypart data
    periods: peaks.map(r=>({period: r.date instanceof Date ? r.date.getHours() : 12, oepe:r.oepe, kvst:r.kvst})),
    // Data coverage
    hasLabor: !!labor,
    hasCtrl:  !!ctrl,
    hasPeaks: peaks.length > 0,
  };
}

// ── Run correlation rules against one store's assembled data ─────────────────
function evaluateStoreCorrelations(data){
  return MORNING_RULES.map(rule=>{
    try{ return rule.evaluate(data) ? {...rule.evaluate(data), id:rule.id, name:rule.name, icon:rule.icon, category:rule.category} : null; }
    catch(e){ return null; }
  }).filter(Boolean);
}

// ── Compute full district morning brief ──────────────────────────────────────
function computeMorningBrief(ds, targetDate){
  const stores = Object.keys(STORE_NAMES).map(loc=>{
    const data = assembleBriefStoreData(loc, targetDate, ds);
    const flags = evaluateStoreCorrelations(data);
    const severity = flags.some(f=>f.severity==='RED') ? 'RED'
                   : flags.some(f=>f.severity==='AMBER') ? 'AMBER'
                   : data.hasData ? 'GREEN' : 'NODATA';
    return {...data, flags, severity,
      priorityScore: (flags.filter(f=>f.severity==='RED').length*10)
                   + (flags.filter(f=>f.severity==='AMBER').length*3)
                   + (severity==='NODATA'?0:1)};
  }).sort((a,b)=>b.priorityScore-a.priorityScore);
  return {
    date: targetDate,
    generatedAt: new Date(),
    stores,
    summary:{
      red:   stores.filter(s=>s.severity==='RED').length,
      amber: stores.filter(s=>s.severity==='AMBER').length,
      green: stores.filter(s=>s.severity==='GREEN').length,
      noData:stores.filter(s=>s.severity==='NODATA').length,
      totalFlags: stores.reduce((s,st)=>s+st.flags.length,0),
    }
  };
}

// ── Helper: get latest date that has any brief data ──────────────────────────
function getLatestBriefDate(ds){
  const allDates = [
    ...(ds.laborRows||[]).map(r=>r.date),
    ...(ds.ctrlRows||[]).map(r=>r.date),
    ...(ds.peaksSvcRows||[]).map(r=>r.date),
  ].filter(Boolean);
  if(!allDates.length) return new Date();
  return new Date(Math.max(...allDates.map(d=>d instanceof Date?d:new Date(d))));
}

// ── Severity helpers ─────────────────────────────────────────────────────────
const SCOLOR = {RED:'#ef4444',AMBER:'#f59e0b',GREEN:'#10b981',NODATA:'#4a6080'};
const SBG    = {RED:'rgba(239,68,68,.08)',AMBER:'rgba(245,158,11,.07)',GREEN:'rgba(16,185,129,.06)',NODATA:'rgba(255,255,255,.03)'};
const SBDR   = {RED:'rgba(239,68,68,.3)',AMBER:'rgba(245,158,11,.25)',GREEN:'rgba(16,185,129,.2)',NODATA:'rgba(255,255,255,.07)'};

// ── StoreBriefCard component ─────────────────────────────────────────────────
function StoreBriefCard({store, expanded, setExpanded}){
  const isOpen = expanded === store.loc;
  const {severity, flags, name, supervisor, hasData,
         sales, projSales, gc, oepe, oepeNorm, drawerOpens,
         actVsNeed, tpph, laborPct, kvst, dtPark} = store;
  const c = SCOLOR[severity], bg = SBG[severity], bdr = SBDR[severity];

  return h('div',{
    key:store.loc,
    style:{background:bg,border:`1px solid ${bdr}`,borderRadius:'10px',
           marginBottom:'8px',overflow:'hidden',transition:'all .2s'}},

    // ── Card header (always visible) ──────────────────────────────────────
    h('div',{
      style:{padding:'12px 14px',cursor:'pointer',display:'flex',alignItems:'flex-start',gap:'10px'},
      onClick:()=>setExpanded(isOpen?null:store.loc)},

      // Severity badge
      h('div',{style:{
        width:'32px',height:'32px',borderRadius:'50%',background:c,flexShrink:0,
        display:'flex',alignItems:'center',justifyContent:'center',
        fontSize:'12px',color:'white',fontWeight:800,marginTop:'1px'}},
        severity==='RED'?'!!':severity==='AMBER'?'!':severity==='GREEN'?'✓':'?'),

      // Store info
      h('div',{style:{flex:1,minWidth:0}},
        h('div',{style:{display:'flex',alignItems:'center',gap:'6px',flexWrap:'wrap',marginBottom:'3px'}},
          h('span',{style:{fontWeight:700,fontSize:'13px',color:'var(--text,#111827)'}},name),
          h('span',{style:{fontSize:'10px',color:'var(--text3,#6b7280)',background:'rgba(128,128,128,.1)',
                           borderRadius:'4px',padding:'1px 6px'}},supervisor),
          !hasData&&h('span',{style:{fontSize:'10px',color:'var(--text3,#9ca3af)',fontStyle:'italic'}},'no data'),
        ),
        flags.length>0
          ? h('div',{style:{display:'flex',flexWrap:'wrap',gap:'4px',marginTop:'4px'}},
              flags.slice(0,3).map(f=>
                h('span',{key:f.id,style:{
                  fontSize:'10px',fontWeight:600,padding:'2px 7px',borderRadius:'99px',
                  background:f.severity==='RED'?'rgba(239,68,68,.15)':'rgba(245,158,11,.15)',
                  border:`1px solid ${f.severity==='RED'?'rgba(239,68,68,.3)':'rgba(245,158,11,.3)'}`,
                  color:SCOLOR[f.severity]}},
                  f.icon+' '+f.name)),
              flags.length>3&&h('span',{style:{fontSize:'10px',color:'#4a6080',padding:'2px 7px'}},
                `+${flags.length-3} more`)
            )
          : hasData&&h('div',{style:{fontSize:'11px',color:'var(--green,#059669)',marginTop:'2px'}},'✓ No flags — all metrics within range'),
      ),

      // Quick metrics strip
      h('div',{style:{display:'flex',gap:'8px',flexShrink:0,alignItems:'flex-start'}},
        sales!=null&&h('div',{style:{textAlign:'right'}},
          h('div',{style:{fontFamily:'monospace',fontSize:'11px',fontWeight:700,
                          color:projSales&&sales<projSales*0.95?'#ef4444':projSales&&sales<projSales?'#f59e0b':'#10b981'}},
            '$'+(sales/1000).toFixed(1)+'K'),
          h('div',{style:{fontSize:'9px',color:'#4a6080'}},'sales')),
        oepe!=null&&h('div',{style:{textAlign:'right'}},
          h('div',{style:{fontFamily:'monospace',fontSize:'11px',fontWeight:700,
                          color:oepeNorm&&oepe>oepeNorm*1.15?'#ef4444':oepeNorm&&oepe>oepeNorm*1.05?'#f59e0b':'#10b981'}},
            oepe.toFixed(0)+'s'),
          h('div',{style:{fontSize:'9px',color:'#4a6080'}},'OEPE')),
        drawerOpens!=null&&h('div',{style:{textAlign:'right'}},
          h('div',{style:{fontFamily:'monospace',fontSize:'11px',fontWeight:700,
                          color:drawerOpens>=10?'#ef4444':drawerOpens>=5?'#f59e0b':'#10b981'}},
            drawerOpens.toFixed(0)),
          h('div',{style:{fontSize:'9px',color:'#4a6080'}},'D.Opens')),
        h('div',{style:{fontSize:'14px',color:'#4a6080',marginTop:'6px',transition:'transform .2s',
                         transform:isOpen?'rotate(180deg)':'rotate(0deg)'}},'▾')
      ),
    ),

    // ── Expanded detail ────────────────────────────────────────────────────
    isOpen && h('div',{style:{borderTop:`1px solid ${bdr}`,padding:'14px'}},
      // All flags expanded
      flags.length>0 && h('div',{style:{marginBottom:'14px'}},
        flags.map(f=>
          h('div',{key:f.id,
            style:{background:f.severity==='RED'?'rgba(239,68,68,.07)':'rgba(245,158,11,.06)',
                   border:`1px solid ${f.severity==='RED'?'rgba(239,68,68,.2)':'rgba(245,158,11,.2)'}`,
                   borderRadius:'8px',padding:'12px 14px',marginBottom:'8px'}},
            h('div',{style:{fontWeight:700,fontSize:'12px',color:SCOLOR[f.severity],marginBottom:'6px'}},
              f.icon+' '+f.name+' — '+f.headline),
            h('p',{style:{fontSize:'12px',color:'var(--text,#374151)',lineHeight:'1.7',marginBottom:'8px'}},f.detail),
            h('div',{style:{fontSize:'11px',fontWeight:600,color:'var(--text,#1f2937)',
                            borderLeft:'2px solid '+SCOLOR[f.severity],paddingLeft:'8px',lineHeight:'1.6'}},
              '→ '+f.action),
          ))
      ),
      // Key metrics detail grid
      h('div',{style:{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(100px,1fr))',gap:'7px'}},
        [
          ['Sales',  sales!=null?'$'+(sales/1000).toFixed(1)+'K':'—'],
          ['Projected',projSales!=null?'$'+(projSales/1000).toFixed(1)+'K':'—'],
          ['vs Proj', store.salesVsExp!=null?(store.salesVsExp>0?'+':'')+store.salesVsExp.toFixed(1)+'%':'—',
            store.salesVsExp!=null?(store.salesVsExp>-3?'#10b981':store.salesVsExp>-8?'#f59e0b':'#ef4444'):null],
          ['GC',     gc!=null?gc.toFixed(0):'—'],
          ['OEPE',   oepe!=null?oepe.toFixed(0)+'s':'—', oepeNorm&&oepe?oepe>oepeNorm*1.15?'#ef4444':oepe>oepeNorm*1.05?'#f59e0b':'#10b981':null],
          ['OEPE Norm',oepeNorm!=null?oepeNorm.toFixed(0)+'s':'—'],
          ['KVS',    kvst!=null?kvst.toFixed(0)+'s':'—'],
          ['DT Parked',dtPark!=null?dtPark.toFixed(0)+'%':'—'],
          ['Act vs Need',actVsNeed!=null?(actVsNeed>0?'+':'')+actVsNeed.toFixed(1):'—',
            actVsNeed!=null?(Math.abs(actVsNeed)<=2?'#10b981':Math.abs(actVsNeed)<=4?'#f59e0b':'#ef4444'):null],
          ['TPPH',   tpph!=null?tpph.toFixed(1):'—'],
          ['Labor%', laborPct!=null?((laborPct>1?laborPct:laborPct*100).toFixed(1))+'%':'—'],
          ['Drawer Opens',drawerOpens!=null?drawerOpens.toFixed(0):'—',
            drawerOpens!=null?(drawerOpens<5?'#10b981':drawerOpens<10?'#f59e0b':'#ef4444'):null],
        ].map(([lbl,val,clr])=>
          h('div',{style:{background:'rgba(255,255,255,.04)',borderRadius:'6px',padding:'8px 10px',textAlign:'center'}},
            h('div',{style:{fontFamily:'monospace',fontSize:'13px',fontWeight:700,color:clr||'var(--text,#111827)'}},val),
            h('div',{style:{fontSize:'9px',color:'#4a6080',textTransform:'uppercase',letterSpacing:'.06em',marginTop:'2px'}},lbl)
          )
        )
      ),
      h('div',{style:{fontSize:'10px',color:'var(--text3,#6b7280)',marginTop:'10px',display:'flex',gap:'10px',flexWrap:'wrap'}},
        h('span',null,'Data: '+([store.hasLabor&&'Labor',store.hasCtrl&&'Controls',store.hasPeaks&&'3 Peaks'].filter(Boolean).join(' · ')||'None loaded')+(!store.hasPeaks?' · (need 3 Peaks covering '+briefDate.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})+')':'')),
      )
    )
  );
}

// ── MorningBriefPanel ────────────────────────────────────────────────────────
function MorningBriefPanel({ds, settings}){
  const uSt=React.useState, uM=React.useMemo, uCB=React.useCallback, uE=React.useEffect;
  const [briefDate, setBriefDate] = uSt(()=>getLatestBriefDate(ds));
  const [expanded, setExpanded] = uSt(null);
  const [filter, setFilter] = uSt('ALL'); // ALL | RED | AMBER | GREEN
  const [supervisorFilter, setSupervisorFilter] = uSt('ALL');
  const [generating, setGenerating] = uSt(false);

  // Re-sync date if ds changes
  uE(()=>{ const ld=getLatestBriefDate(ds); if(ld) setBriefDate(ld); },[ds]);

  const brief = uM(()=>computeMorningBrief(ds, briefDate),[ds, briefDate]);
  const filtered = uM(()=>{
    let s = brief.stores;
    if(filter!=='ALL') s=s.filter(st=>st.severity===filter);
    if(supervisorFilter!=='ALL') s=s.filter(st=>st.supervisor===supervisorFilter);
    return s;
  },[brief,filter,supervisorFilter]);

  const dateStr = briefDate instanceof Date ? briefDate.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'}) : '';
  const {red,amber,green,noData,totalFlags} = brief.summary;
  const supervisors = [...new Set(Object.keys(SUPERVISOR_PATCHES))];

  return h('div',{style:{padding:'16px',maxWidth:'860px',margin:'0 auto'}},

    // ── Header ──────────────────────────────────────────────────────────────
    h('div',{style:{marginBottom:'20px'}},
      h('div',{style:{display:'flex',alignItems:'flex-start',justifyContent:'space-between',flexWrap:'wrap',gap:'10px'}},
        h('div',null,
          h('div',{style:{fontSize:'11px',fontWeight:700,letterSpacing:'.1em',textTransform:'uppercase',color:'#f59e0b',marginBottom:'4px'}},'Morning Intelligence Brief'),
          h('div',{style:{fontFamily:"'Syne',sans-serif",fontSize:'22px',fontWeight:900,letterSpacing:'-.03em',color:'var(--text,#111827)'}},dateStr),
          h('div',{style:{fontSize:'11px',color:'#4a6080',marginTop:'3px'}},
            totalFlags+' flag'+(totalFlags!==1?'s':'')+' across '+brief.stores.filter(s=>s.hasData).length+' stores with data · '+(noData>0?noData+' stores no data · ':'')+
            'Generated '+new Date().toLocaleTimeString()),
        ),
        h('div',{style:{display:'flex',gap:'8px',alignItems:'center',flexWrap:'wrap'}},
          h('input',{type:'date',
            value:briefDate instanceof Date?briefDate.toISOString().slice(0,10):'',
            onChange:e=>setBriefDate(new Date(e.target.value+'T12:00:00')),
            style:{background:'rgba(255,255,255,.07)',border:'1px solid rgba(255,255,255,.12)',
                   borderRadius:'7px',padding:'6px 10px',color:'var(--text,#111827)',fontSize:'12px',cursor:'pointer'}}),
          h('button',{
            onClick:()=>exportBriefHTML(brief),
            style:{background:'rgba(245,158,11,.15)',border:'1px solid rgba(245,158,11,.3)',
                   color:'#f59e0b',borderRadius:'7px',padding:'7px 14px',cursor:'pointer',
                   fontSize:'12px',fontWeight:600}},
            '📤 Export Brief'),
        )
      )
    ),

    // ── District pulse KPIs ──────────────────────────────────────────────────
    h('div',{style:{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'8px',marginBottom:'16px'}},
      [
        ['🔴',red,'Stores Need Attention','#ef4444','rgba(239,68,68,.08)','rgba(239,68,68,.25)','RED'],
        ['🟡',amber,'Stores Flag Review','#f59e0b','rgba(245,158,11,.07)','rgba(245,158,11,.25)','AMBER'],
        ['🟢',green,'Stores All Clear','#10b981','rgba(16,185,129,.06)','rgba(16,185,129,.2)','GREEN'],
        ['⚪',noData,'Stores No Data','#4a6080','rgba(255,255,255,.03)','rgba(255,255,255,.08)','NODATA'],
      ].map(([icon,count,label,c,bg,bdr,fv])=>
        h('div',{key:fv,
          onClick:()=>setFilter(filter===fv?'ALL':fv),
          style:{background:filter===fv||filter==='ALL'?bg:'rgba(255,255,255,.02)',
                 border:`1px solid ${filter===fv?c:bdr}`,borderRadius:'9px',
                 padding:'12px 14px',cursor:'pointer',transition:'all .15s',
                 textAlign:'center'}},
          h('div',{style:{fontSize:'22px',fontWeight:900,color:c,fontFamily:"'Syne',sans-serif",letterSpacing:'-.03em'}},count),
          h('div',{style:{fontSize:'10px',color:'#4a6080',textTransform:'uppercase',letterSpacing:'.07em',marginTop:'3px'}},label)
        )
      )
    ),

    // ── Filters row ──────────────────────────────────────────────────────────
    h('div',{style:{display:'flex',gap:'6px',marginBottom:'14px',flexWrap:'wrap',alignItems:'center'}},
      h('span',{style:{fontSize:'11px',color:'#4a6080',marginRight:'4px'}},'Supervisor:'),
      ['ALL',...supervisors].map(sup=>
        h('button',{key:sup,
          onClick:()=>setSupervisorFilter(sup),
          style:{padding:'4px 10px',borderRadius:'99px',border:'1px solid',fontSize:'11px',
                 fontWeight:600,cursor:'pointer',
                 background:supervisorFilter===sup?'rgba(245,158,11,.15)':'transparent',
                 borderColor:supervisorFilter===sup?'rgba(245,158,11,.4)':'rgba(255,255,255,.1)',
                 color:supervisorFilter===sup?'#f59e0b':'#4a6080'}},sup)
      ),
    ),

    // ── Store cards ──────────────────────────────────────────────────────────
    filtered.length===0
      ? h('div',{style:{textAlign:'center',padding:'40px',color:'#4a6080',fontSize:'13px'}},'No stores match the current filter')
      : filtered.map(store=>
          h(StoreBriefCard,{key:store.loc,store,expanded,setExpanded})
        ),
  );
}

// ── Export standalone brief HTML ─────────────────────────────────────────────
function exportBriefHTML(brief){
  const dateStr = brief.date instanceof Date
    ? brief.date.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'})
    : 'Unknown Date';
  const {red,amber,green,noData,totalFlags} = brief.summary;

  const storeHTML = brief.stores.filter(s=>s.hasData||s.flags.length>0).map(s=>{
    const c = SCOLOR[s.severity];
    const flagsHTML = s.flags.map(f=>`
      <div class="flag flag-${f.severity.toLowerCase()}">
        <div class="flag-title">${f.icon} ${f.name}</div>
        <div class="flag-headline">${f.headline}</div>
        <p class="flag-detail">${f.detail}</p>
        <div class="flag-action">→ ${f.action}</div>
      </div>`).join('');
    const metricsHTML = [
      ['Sales',      s.sales!=null?'$'+(s.sales/1000).toFixed(1)+'K':'—'],
      ['Projected',  s.projSales!=null?'$'+(s.projSales/1000).toFixed(1)+'K':'—'],
      ['vs Proj',    s.salesVsExp!=null?(s.salesVsExp>0?'+':'')+s.salesVsExp.toFixed(1)+'%':'—'],
      ['OEPE',       s.oepe!=null?s.oepe.toFixed(0)+'s':'—'],
      ['KVS',        s.kvst!=null?s.kvst.toFixed(0)+'s':'—'],
      ['DT Park%',   s.dtPark!=null?s.dtPark.toFixed(0)+'%':'—'],
      ['Act vs Need',s.actVsNeed!=null?(s.actVsNeed>=0?'+':'')+s.actVsNeed.toFixed(1):'—'],
      ['D.Opens',    s.drawerOpens!=null?s.drawerOpens.toFixed(0):'—'],
      ['Labor%',     s.laborPct!=null?((s.laborPct>1?s.laborPct:s.laborPct*100).toFixed(1))+'%':'—'],
    ].map(([l,v])=>`<div class="metric"><div class="metric-val">${v}</div><div class="metric-lbl">${l}</div></div>`).join('');
    return `<div class="store-card sev-${s.severity.toLowerCase()}">
      <div class="store-hdr">
        <div class="store-dot" style="background:${c}">${s.severity==='RED'?'!!':s.severity==='AMBER'?'!':'✓'}</div>
        <div class="store-info">
          <div class="store-name">${s.name}</div>
          <div class="store-sup">${s.supervisor}</div>
        </div>
        <div class="metric-row-mini">${metricsHTML}</div>
      </div>
      ${s.flags.length?'<div class="flags">'+flagsHTML+'</div>':'<div class="no-flags">✓ No flags — all metrics within normal range</div>'}
    </div>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Morning Brief — ${dateStr}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;900&display=swap');
:root{--navy:#080e1c;--surf:#0d1829;--amber:#f59e0b;--green:#10b981;--red:#ef4444;--text:#eef2ff;--text2:#7da0c4;--text3:#3d5a7a;--bdr:rgba(255,255,255,.08)}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:var(--navy);color:var(--text);font-size:13px;line-height:1.6;padding:20px}
.wrap{max-width:900px;margin:0 auto}
.header{margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid var(--bdr)}
.header h1{font-family:'Syne',sans-serif;font-size:28px;font-weight:900;letter-spacing:-.03em;margin-bottom:3px}
.header .sub{font-size:12px;color:var(--text3)}
.pulse{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px}
.pulse-card{border-radius:8px;padding:12px;text-align:center;border:1px solid}
.pulse-val{font-size:24px;font-weight:900;font-family:'Syne',sans-serif}
.pulse-lbl{font-size:9px;text-transform:uppercase;letter-spacing:.07em;margin-top:2px;color:var(--text3)}
.store-card{border-radius:9px;border:1px solid;margin-bottom:8px;overflow:hidden;break-inside:avoid}
.sev-red{border-color:rgba(239,68,68,.3);background:rgba(239,68,68,.06)}
.sev-amber{border-color:rgba(245,158,11,.3);background:rgba(245,158,11,.05)}
.sev-green{border-color:rgba(16,185,129,.2);background:rgba(16,185,129,.04)}
.store-hdr{padding:10px 14px;display:flex;align-items:flex-start;gap:10px;flex-wrap:wrap}
.store-dot{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:white;flex-shrink:0}
.store-name{font-size:13px;font-weight:700}
.store-sup{font-size:10px;color:var(--text3)}
.metric-row-mini{display:flex;gap:6px;flex-wrap:wrap;margin-left:auto}
.metric{background:rgba(255,255,255,.04);border-radius:5px;padding:5px 8px;text-align:center}
.metric-val{font-size:11px;font-weight:700;font-family:monospace}
.metric-lbl{font-size:8px;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-top:1px}
.flags{padding:10px 14px;border-top:1px solid var(--bdr)}
.flag{border-radius:7px;padding:10px 12px;margin-bottom:6px;border:1px solid}
.flag-red{background:rgba(239,68,68,.07);border-color:rgba(239,68,68,.2)}
.flag-amber{background:rgba(245,158,11,.06);border-color:rgba(245,158,11,.2)}
.flag-title{font-size:11px;font-weight:700;margin-bottom:3px}
.flag-red .flag-title{color:var(--red)}
.flag-amber .flag-title{color:var(--amber)}
.flag-headline{font-size:12px;font-weight:600;color:var(--text);margin-bottom:5px}
.flag-detail{font-size:11px;color:var(--text2);line-height:1.7;margin-bottom:5px}
.flag-action{font-size:11px;font-weight:600;color:var(--text);border-left:2px solid;padding-left:7px;line-height:1.5}
.flag-red .flag-action{border-color:var(--red)}
.flag-amber .flag-action{border-color:var(--amber)}
.no-flags{padding:8px 14px;font-size:11px;color:var(--green)}
.eyebrow{font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--amber);margin-bottom:3px;font-weight:700}
@media print{
  body{background:white;color:#0a0f1e;padding:10px}
  .store-card{break-inside:avoid;background:white!important;border-color:#ddd!important}
  .flag{background:#fff8f0!important;border-color:#fde68a!important}
  .flag-red{background:#fff0f0!important;border-color:#fca5a5!important}
  .metric{background:#f8f8f8!important}
  .sev-red{background:#fff5f5!important}
  .sev-amber{background:#fffbeb!important}
  .sev-green{background:#f0fdf4!important}
}
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <div class="eyebrow">Meridian · Morning Intelligence Brief</div>
    <h1>${dateStr}</h1>
    <div class="sub">${totalFlags} flag${totalFlags!==1?'s':''} · ${red} attention · ${amber} review · ${green} clear · Generated ${new Date().toLocaleString()}</div>
  </div>
  <div class="pulse">
    <div class="pulse-card" style="border-color:rgba(239,68,68,.3);background:rgba(239,68,68,.07)"><div class="pulse-val" style="color:#ef4444">${red}</div><div class="pulse-lbl">Need Attention</div></div>
    <div class="pulse-card" style="border-color:rgba(245,158,11,.3);background:rgba(245,158,11,.06)"><div class="pulse-val" style="color:#f59e0b">${amber}</div><div class="pulse-lbl">Flag Review</div></div>
    <div class="pulse-card" style="border-color:rgba(16,185,129,.25);background:rgba(16,185,129,.05)"><div class="pulse-val" style="color:#10b981">${green}</div><div class="pulse-lbl">All Clear</div></div>
    <div class="pulse-card" style="border-color:rgba(255,255,255,.08);background:transparent"><div class="pulse-val" style="color:#4a6080">${noData}</div><div class="pulse-lbl">No Data</div></div>
  </div>
  ${storeHTML}
</div>
</body>
</html>`;

  const blob=new Blob([html],{type:'text/html'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download='Meridian_Morning_Brief_'+brief.date.toISOString().slice(0,10)+'.html';
  a.click();
  URL.revokeObjectURL(url);
}


window.onerror = function(msg, src, line, col, err) {
  document.getElementById('root').innerHTML =
    '<div style="padding:40px;font-family:monospace;background:#090e18;color:#e2e8f0;min-height:100vh">' +
    '<div style="color:#f59e0b;font-size:18px;font-weight:700;margin-bottom:16px">⚠ McForecast — Script Error</div>' +
    '<div style="color:#ef4444;font-size:13px;margin-bottom:8px">' + msg + '</div>' +
    '<div style="color:#94a3b8;font-size:11px">Line ' + line + ', Col ' + col + '</div>' +
    '<div style="color:#94a3b8;font-size:11px;margin-top:8px">' + (src||'') + '</div>' +
    '<div style="color:#64748b;font-size:10px;margin-top:16px">Open DevTools Console (F12) for full stack trace.</div>' +
    '</div>';
  return true;
};

// SECTION 1: CONFIG & STORE NAMES
const APP_VERSION = 'v5.37a';
const APP_BUILD   = '2026-05-02';
// STORE_NAMES, sName, sNameC → imported from ./constants.js


const CONTACTS={
  aboveStore:[
    {name:'Molly Mcgill',    email:'Molly@mcdok.com',     role:'Above Store'},
    {name:'Hugh Bonner',     email:'Hugh@mcdok.com',      role:'Above Store'},
    {name:'Fletcher Reaves', email:'Fletcher@mcdok.com',  role:'Above Store'},
  ],
  operators:{
    'Ryan Thorley':       {emails:['Ryan@mcdok.com','Ryan@emeraldarches.com'], org:'MCDOK/EA'},
    'Gary Mornhinweg':    {emails:['Gary@mcdok.com'],       org:'MCDOK'},
    'Rick/Kathy Thorley': {emails:['rick@mcdok.com','kathy@mcdok.com'], org:'MCDOK'},
    'Jacob Thorley':      {emails:['Jacob@emeraldarches.com'], org:'Emerald Arches'},
  },
  supervisors:{
    'Robert Spencer':     {email:'Robert@mcdok.com'},
    'Krystiana Langford': {email:'Krystiana@mcdok.com'},
    'Ashley Podroza':     {email:'Ashley@mcdok.com'},
    'Steven Vaughn':      {email:'Steven@mcdok.com'},
    'Amanda Estrada':     {email:'Amanda@mcdok.com'},
    'Brad Denley':        {email:'Brad@emeraldarches.com'},
  }
};

// Email routing for reports
function getReportRecipients(scope, stores, settings) {
  const above=CONTACTS.aboveStore.map(c=>c.email);
  const allOps=Object.values(CONTACTS.operators).flatMap(o=>o.emails);
  if(scope==='all')   return [...new Set([...above,...allOps])];
  if(scope==='MCDOK'){
    const ops=Object.values(CONTACTS.operators).filter(o=>o.org==='MCDOK').flatMap(o=>o.emails);
    return [...new Set([...above,...ops])];
  }
  if(scope==='Emerald Arches'){
    const ops=Object.values(CONTACTS.operators).filter(o=>o.org==='Emerald Arches').flatMap(o=>o.emails);
    return [...new Set([...above,...ops])];
  }
  if(scope==='patch'&&stores.length){
    const supName=stores[0].sup;
    const supEmail=supName?CONTACTS.supervisors[supName]?.email:'';
    const opEmails=stores.flatMap(s=>{
      const op=Object.entries(CONTACTS.operators).find(([k])=>k===s.operator||k.replace(' (EA)','')===s.operator);
      return op?op[1].emails:[];
    });
    return [...new Set([...above,...(supEmail?[supEmail]:[]),...opEmails])];
  }
  if(scope==='store'&&stores.length){
    const s=stores[0];
    const gmEmail=s.gmEmail?[s.gmEmail]:[];
    const supEmail=s.supEmail?[s.supEmail]:[];
    return [...new Set([...gmEmail,...supEmail,...above])];
  }
  return above;
}

const STORE_STAFF={
  '3708': {gm:'Cinthya Armedariz',  gmEmail:'Cinthya@mcdok.com',  sup:'Robert Spencer',    supEmail:'Robert@mcdok.com'},
  '5183': {gm:'Mukarram Norman',    gmEmail:'Mukarram@mcdok.com',  sup:'Krystiana Langford',supEmail:'Krystiana@mcdok.com'},
  '5985': {gm:'Stacey Hyatt',       gmEmail:'Stacey@mcdok.com',   sup:'Ashley Podroza',    supEmail:'Ashley@mcdok.com'},
  '6972': {gm:'Nick Rice',          gmEmail:'Nick@mcdok.com',     sup:'Robert Spencer',    supEmail:'Robert@mcdok.com'},
  '10422':{gm:'Ashleyh Hegwer',     gmEmail:'Ashleyh@mcdok.com',  sup:'Ashley Podroza',    supEmail:'Ashley@mcdok.com'},
  '10915':{gm:'Caleb Nunnelley',    gmEmail:'Caleb@mcdok.com',    sup:'Steven Vaughn',     supEmail:'Steven@mcdok.com'},
  '11657':{gm:'Jessie Hiatt',       gmEmail:'Jessie@mcdok.com',   sup:'Amanda Estrada',    supEmail:'Amanda@mcdok.com'},
  '13113':{gm:'Chris Abbey',        gmEmail:'Chris@mcdok.com',    sup:'Ashley Podroza',    supEmail:'Ashley@mcdok.com'},
  '18213':{gm:'Cora Bahling',       gmEmail:'Cora@mcdok.com',     sup:'Krystiana Langford',supEmail:'Krystiana@mcdok.com'},
  '20475':{gm:'Derek McGirt',       gmEmail:'Derek@mcdok.com',    sup:'Amanda Estrada',    supEmail:'Amanda@mcdok.com'},
  '24471':{gm:'Mystykal Abbey',     gmEmail:'Mystykal@mcdok.com', sup:'Robert Spencer',    supEmail:'Robert@mcdok.com'},
  '29760':{gm:'Heather Danforth',   gmEmail:'Heather@mcdok.com',  sup:'Krystiana Langford',supEmail:'Krystiana@mcdok.com'},
  '31357':{gm:'Brady Giambaresi',   gmEmail:'Brady@mcdok.com',    sup:'Amanda Estrada',    supEmail:'Amanda@mcdok.com'},
  '32525':{gm:'Aliyah Richardson',  gmEmail:'Aliyah@mcdok.com',   sup:'Robert Spencer',    supEmail:'Robert@mcdok.com'},
  '33109':{gm:'Rey Araiz',          gmEmail:'Rey@mcdok.com',      sup:'Ashley Podroza',    supEmail:'Ashley@mcdok.com'},
  '33222':{gm:'Carol Escusa',       gmEmail:'Carol@mcdok.com',    sup:'Krystiana Langford',supEmail:'Krystiana@mcdok.com'},
  '33704':{gm:'Candy Barksdale',    gmEmail:'Candy@mcdok.com',    sup:'Steven Vaughn',     supEmail:'Steven@mcdok.com'},
  '34222':{gm:'Hunter McKee',       gmEmail:'Hunter@mcdok.com',   sup:'Steven Vaughn',     supEmail:'Steven@mcdok.com'},
  '35064':{gm:'Lynsey Yahola',      gmEmail:'Lynsey@mcdok.com',   sup:'Steven Vaughn',     supEmail:'Steven@mcdok.com'},
  '43380':{gm:'Zukarr Eaves',       gmEmail:'Zukarr@mcdok.com',   sup:'Ashley Podroza',    supEmail:'Ashley@mcdok.com'},
  '6178': {gm:'Janet Jeter',        gmEmail:'Janet@emeraldarches.com',       sup:'Brad Denley',supEmail:'Brad@emeraldarches.com'},
  '6838': {gm:'Stephanie Harris',   gmEmail:'Stephanie@emeraldarches.com',   sup:'Brad Denley',supEmail:'Brad@emeraldarches.com'},
  '10034':{gm:'Harlee Yates',       gmEmail:'Harlee@emeraldarches.com',      sup:'Brad Denley',supEmail:'Brad@emeraldarches.com'},
  '35242':{gm:'Michele Nixon',      gmEmail:'Michele@emeraldarches.com',     sup:'Brad Denley',supEmail:'Brad@emeraldarches.com'},
  '37566':{gm:'Debra Herndon',      gmEmail:'Debra@emeraldarches.com',       sup:'Brad Denley',supEmail:'Brad@emeraldarches.com'},
  '38609':{gm:'Christina Bencokzy', gmEmail:'Christina@emeraldarches.com',   sup:'Brad Denley',supEmail:'Brad@emeraldarches.com'},
  '43701':{gm:'Shannon Hardin',     gmEmail:'Shannon@emeraldarches.com',     sup:'Brad Denley',supEmail:'Brad@emeraldarches.com'},
};




// Store coordinates for live weather forecasts (Open-Meteo API)

// Geographic distance (miles) between two store coords — used for regional event matching
function storeDistance(locA, locB) {
  const a=STORE_COORDS[locA], b=STORE_COORDS[locB];
  if(!a||!b||!a.lat||!b.lat) return Infinity;
  const R=3959, toR=d=>d*Math.PI/180;
  const dLat=toR(b.lat-a.lat), dLon=toR(b.lng-a.lng);
  const x=Math.sin(dLat/2)**2+Math.cos(toR(a.lat))*Math.cos(toR(b.lat))*Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
}
// Regional radius per org — Oklahoma stores span ~250mi, FL panhandle ~100mi
function regionalRadius(loc){return (STORE_COORDS[loc]&&STORE_COORDS[loc].org==='Emerald Arches')?80:150;}

export { computeMorningBrief, getLatestBriefDate, MorningBriefPanel, exportBriefHTML, getReportRecipients, storeDistance, regionalRadius, STORE_STAFF, CONTACTS };
