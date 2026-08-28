// @ts-nocheck
// ── Performance Calculator (dispatch #199) — moved into Performance Review → Customize, the
// same "harvest-then-remove" move dispatch #135 item 3 already did for Targets Editor
// (targets-editor.js's TargetsEditorSection). Originally store-dash.js's `PerformanceCalculator`,
// a standalone modal (panel-registry id 'perf-calc', kind:'optional').
//
// ⚠️ Scoring-logic check (dispatch #199's explicit ask): this panel does NOT use, duplicate, or
// diverge from review-engine.js's rateMetric/ratingColor/computeScores — it never imported them
// (grep-verified against the pre-move store-dash.js). Those functions score a PERSON's review
// against 1-4 rating bands from a KPI actual-vs-target deviation. This panel does something
// unrelated: it projects a STORE's operational metrics (drive-thru cars/hr → guest count → daily
// sales → labor hours → TPPH) from slider inputs through a fixed throughput formula
// (3600 / (OEPE + order-time + safety-gap) = cars/hour, then a capacity-limited-vs-demand-limited
// conversion rate to guest count). "Performance Calculator" and "Performance Reviews" share a
// name and a section:'people', not an engine — there is nothing to reconcile or switch over;
// the move below is a pure relocation, logic ported verbatim.
//
// ⚠️ RBAC note (flagging per the same "state it, don't silently discover it" rule): perf-calc was
// gated on perm:'analytics.store' (true for every role — Supervisor/Manager/VP/GM/SM_AM_DM
// included; opt-in via Panel Manager). Performance Reviews' Customize tab is gated on
// perm:'reviews.customize', true only for Admin/Owner/Developer (see permissions.js). Folding
// perf-calc into Customize — per this dispatch's explicit instruction, mirroring #135's exact
// target location — narrows who can reach it: those other roles could previously enable and use
// it, and now cannot reach it at all (the redirected deep link in App.js checks
// perm('reviews.customize'), so it silently no-ops for them, same behavior #135 already
// established for the targets-editor redirect). This is a real access-control side effect of
// matching the specified destination, not something fixed here — flagged for the owner rather
// than silently resolved either way.
//
// CONTENT ONLY (no ModalShell/fixed-overlay/close button) — renders as one of the tabs inside
// CustomizePanel (src/views/performance-reviews.js), which already supplies the surrounding page
// chrome (RoutePanelShell) and the Customize sub-tab bar. Layout changed from a fixed two-column
// 280px-sidebar layout to a wrapping flex layout (panel-contract mobile-scroll check) since it no
// longer has its own maxHeight/overflow container to lean on.
import * as React from 'react';
import { STORE_NAMES, sNameC, getKB } from '../constants.js';
import { metricAvg } from '../engine/metric-source.js';
import { lastClosedBusinessDay } from '../engine/swing-feed.js';
import { addDR } from '../utils/date.js';

const h = React.createElement;
const div = (p,...c) => h('div',p,...c);
const span= (p,...c) => h('span',p,...c);

export function PerformanceCalculatorSection({ ds }) {
  const {useState:uSt, useMemo:uM} = React;
  const LOCS = Object.keys(STORE_NAMES).sort((a,b)=>STORE_NAMES[a].localeCompare(STORE_NAMES[b]));
  const [selLoc, setSelLoc] = uSt(LOCS[0]);
  const [oepe,   setOepe]   = uSt(140);
  const [laborP, setLaborP] = uSt(22);
  const [avgChk, setAvgChk] = uSt(10.50);

  // Compute baseline actuals from last 6W data. oepe/laborPct/tpph/sales/gc/avgCheck/avgRate
  // all route through metric-source.js's auto-first resolver — these are just slider STARTING
  // POINTS the user freely adjusts from, so staleness here was always low-stakes (unlike a
  // live monitoring number). avgCheck and avgRate (derived: laborPct×sales÷actHrs) are both
  // in METRIC_SOURCES now (data-integrity sweep, MEDIUM-confidence item — the old comment here
  // claiming "no registered auto source yet" for them was stale).
  const baseline = uM(()=>{
    // Ends on the last CLOSED business day, not literal "now" (signature #4) — low-risk here
    // (slider starting points, not a live monitoring number), but a known-contaminated window
    // left in place is how this recurs a sixth time.
    const lastClosedPC = lastClosedBusinessDay();
    const cutoff = addDR(lastClosedPC,-41);
    const range = {s: cutoff, e: lastClosedPC};
    const baseOepe  = metricAvg(ds,selLoc,range,'oepe') || 140;
    const baseLab   = (metricAvg(ds,selLoc,range,'laborPct')||.22) * 100;
    const baseChk   = metricAvg(ds,selLoc,range,'avgCheck') || 10.50;
    const baseDailySales = metricAvg(ds,selLoc,range,'sales') || 12000;
    const baseGC    = metricAvg(ds,selLoc,range,'gc') || Math.round(baseDailySales/baseChk);
    const baseTpph  = metricAvg(ds,selLoc,range,'tpph') || 5.5;
    const baseHours = baseDailySales * (baseLab/100) / (metricAvg(ds,selLoc,range,'avgRate')||15);
    return {baseOepe,baseLab,baseChk,baseDailySales,baseGC,baseTpph,baseHours};
  },[ds,selLoc]);

  // Initialize sliders to baseline when store changes
  React.useEffect(()=>{
    setOepe(Math.round(baseline.baseOepe));
    setLaborP(parseFloat((baseline.baseLab).toFixed(1)));
    setAvgChk(parseFloat((baseline.baseChk).toFixed(2)));
  },[selLoc, baseline.baseOepe]);

  // ── Throughput model ──────────────────────────────────────────────
  // OEPE = time from order complete to car departure
  // Order-taking time ~30s, pullout time ~10s
  // Total service time ≈ OEPE + 30s order time
  // Cars per hour = 3600 / totalServiceTime
  const model = uM(()=>{
    const orderTime = 30, safetyGap = 5;
    const baseCph = 3600 / (baseline.baseOepe + orderTime + safetyGap);
    const newCph  = 3600 / (oepe + orderTime + safetyGap);
    const cphChange = (newCph - baseCph) / baseCph;

    // GC impact — not all OEPE improvement converts to GC (demand-limited vs capacity-limited)
    // Capacity-constrained store (KB tag) → 80% of throughput gain → GC
    // Demand-limited → 30% (people come when they come, speed just improves experience)
    const kb = getKB(selLoc);
    const isCapLimited = (kb.tags||[]).includes('capacity-limited') || (kb.tags||[]).includes('high-volume');
    const conversionRate = isCapLimited ? 0.75 : 0.30;
    const gcChangeRate = cphChange * conversionRate;
    const newDailyGC  = Math.round(baseline.baseGC * (1 + gcChangeRate));
    const gcDelta     = newDailyGC - baseline.baseGC;

    // Sales impact from GC change + any average check change
    const newDailySales = newDailyGC * avgChk;
    const salesDelta    = newDailySales - baseline.baseDailySales;

    // Labor impact
    const newLaborAmt  = newDailySales * (laborP/100);
    const newHours     = newLaborAmt / 15; // assume $15 avg rate
    const hoursDelta   = newHours - baseline.baseHours;

    // TPPH impact
    const newTpph = newHours > 0 ? newDailyGC / newHours : baseline.baseTpph;

    return {
      baseCph: baseCph.toFixed(1), newCph: newCph.toFixed(1),
      gcDelta, newDailyGC,
      salesDelta, newDailySales,
      hoursDelta, newHours: newHours.toFixed(0),
      newTpph: newTpph.toFixed(2),
      isCapLimited, cphChange,
    };
  },[oepe, laborP, avgChk, baseline, selLoc]);

  const delta = (v,unit,reverse)=>{
    const sign = v>=0?'+':'';
    const formatted = unit==='$'?sign+'$'+(Math.abs(v)<1000?v.toFixed(0):(v/1000).toFixed(1)+'k'):
      unit==='%'?sign+v.toFixed(2)+'%':sign+v.toFixed(1);
    const color = (v>0&&!reverse)||( v<0&&reverse) ? '#10b981' :
                  (v<0&&!reverse)||(v>0&&reverse)  ? '#ef4444' : 'var(--text3)';
    return span({style:{color,fontWeight:700,fontFamily:'var(--mono)'}},(formatted));
  };

  const f$ = v=>'$'+(v<1000?v.toFixed(0):(v/1000).toFixed(1)+'k');
  const Slider = ({label,min,max,step,val,onChg,unit,fmt})=>
    div({style:{marginBottom:14}},
      div({style:{display:'flex',justifyContent:'space-between',marginBottom:4}},
        span({style:{fontSize:'10px',fontWeight:600,color:'var(--text2)'}},(label)),
        span({style:{fontSize:'12px',fontWeight:800,color:'var(--amber)',fontFamily:'var(--mono)'}},
          (fmt?fmt(val):(unit==='s'?val+'s':val+'%')))
      ),
      h('input',{type:'range',min,max,step,value:val,
        onChange:e=>onChg(parseFloat(e.target.value)),
        style:{width:'100%',accentColor:'var(--amber)',cursor:'pointer'}})
    );

  const KpiCard = ({l,base,now,unit,reverse})=>
    div({style:{background:'var(--surf2)',border:'.5px solid var(--bdr)',borderRadius:'var(--r)',
      padding:'8px 12px',flex:'1 1 110px',minWidth:100}},
      div({style:{fontSize:'7.5px',textTransform:'uppercase',letterSpacing:'.4px',color:'var(--text3)',marginBottom:3}},(l)),
      div({style:{fontSize:'13px',fontWeight:800,fontFamily:'var(--mono)',color:'var(--text)'}},(now)),
      base!=null&&div({style:{fontSize:'8px',color:'var(--text3)',marginTop:2}},'was '+base)
    );

  return div({style:{display:'flex',flexDirection:'column'}},
    div({style:{padding:'10px 16px',borderBottom:'.5px solid var(--bdr)',
      background:'var(--surf2)',display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}},
      span({style:{fontSize:'18px'}},'🧮'),
      div({style:{flex:'1 1 220px'}},
        div({style:{fontSize:'13px',fontWeight:800,color:'var(--text)'}},'Performance Calculator'),
        div({style:{fontSize:'9px',color:'var(--text3)',marginTop:1}},'Interactive what-if model: how metric improvements chain through throughput → GC → sales → labor → TPPH')
      ),
      h('select',{value:selLoc,onChange:e=>setSelLoc(e.target.value),
        style:{background:'var(--surf)',border:'.5px solid var(--bdr)',borderRadius:'var(--r)',
          color:'var(--text)',fontSize:'9px',padding:'3px 6px'}},
        LOCS.map(l=>h('option',{key:l,value:l},sNameC(l)))
      ),
    ),
    div({style:{flex:1,display:'flex',flexWrap:'wrap',gap:0}},
      // Left: sliders
      div({style:{flex:'1 1 260px',maxWidth:320,padding:'16px',borderRight:'.5px solid var(--bdr)'}},
        div({style:{fontSize:'10px',fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.4px',marginBottom:10}},'Adjust Metrics'),
        Slider({label:'OEPE (seconds)',min:60,max:250,step:1,val:oepe,onChg:setOepe,unit:'s'}),
        Slider({label:'Labor %',min:14,max:35,step:.1,val:laborP,onChg:setLaborP,unit:'%'}),
        Slider({label:'Avg Check ($)',min:7,max:18,step:.25,val:avgChk,onChg:setAvgChk,
          fmt:v=>'$'+v.toFixed(2)}),
        div({style:{marginTop:6,padding:'8px 10px',background:'rgba(245,158,11,.07)',
          borderRadius:'var(--r)',border:'.5px solid rgba(245,158,11,.2)',fontSize:'8px',color:'var(--amber)',lineHeight:1.6}},
          model.isCapLimited
            ? '📍 Capacity-constrained store — OEPE improvements convert strongly to GC gains (~75%)'
            : '📍 Demand-limited store — OEPE gains improve experience & speed; partial GC conversion (~30%)'),
        div({style:{marginTop:8,fontSize:'7.5px',color:'var(--text3)',lineHeight:1.7}},
          'Baseline from last 6 weeks of loaded data. OEPE model: 3600 ÷ (OEPE + 35s order time) = cars/hour.')
      ),
      // Right: impact results
      div({style:{flex:'2 1 340px',padding:'16px'}},
        div({style:{fontSize:'10px',fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.4px',marginBottom:10}},'Projected Impact'),
        // KPI row
        div({style:{display:'flex',gap:8,flexWrap:'wrap',marginBottom:14}},
          KpiCard({l:'DT Throughput',base:model.baseCph+'/hr',now:model.newCph+'/hr'}),
          KpiCard({l:'Daily GC',base:String(baseline.baseGC),now:String(model.newDailyGC)}),
          KpiCard({l:'Daily Sales',base:f$(baseline.baseDailySales),now:f$(model.newDailySales)}),
          KpiCard({l:'TPPH',base:baseline.baseTpph.toFixed(2),now:model.newTpph}),
          KpiCard({l:'Labor Hours',base:baseline.baseHours.toFixed(0)+'h',now:model.newHours+'h'}),
        ),
        // Change narrative
        div({style:{background:'var(--surf2)',border:'.5px solid var(--bdr)',borderRadius:'var(--r)',padding:'12px 14px'}},
          div({style:{fontSize:'11px',fontWeight:700,color:'var(--text)',marginBottom:8}},'Impact Chain'),
          ...[
            ['OEPE',        oepe+'s → '+model.newCph+' cars/hr',  (parseFloat(model.newCph)-parseFloat(model.baseCph)),'cars/hr'],
            ['Daily GC',    baseline.baseGC+' → '+model.newDailyGC, model.gcDelta,'guests/day'],
            ['Daily Sales', f$(baseline.baseDailySales)+' → '+f$(model.newDailySales), model.salesDelta,'$'],
            ['Weekly Sales',(model.salesDelta*7),'x7 days','$'],
            ['Annual Sales',(model.salesDelta*365),'x365 days','$'],
            ['TPPH',        baseline.baseTpph.toFixed(2)+' → '+model.newTpph, parseFloat(model.newTpph)-baseline.baseTpph,'guests/labor hr'],
          ].map(([l,now,chg,u],i)=>
            div({key:i,style:{display:'flex',alignItems:'baseline',gap:8,padding:'5px 0',
              borderBottom:i<5?'.5px solid var(--bdr)':'none'}},
              span({style:{width:100,fontSize:'9px',color:'var(--text3)',flexShrink:0}},(l)),
              span({style:{flex:1,fontSize:'9.5px',fontFamily:'var(--mono)',color:'var(--text2)'}},typeof now==='string'?now:now.toFixed(0)),
              div({style:{fontSize:'9.5px'}},
                typeof chg==='number'&&chg!==0?delta(chg,u.startsWith('$')?'$':u.startsWith('/')?'':u,l==='Labor Hours'):null,
                span({style:{fontSize:'7.5px',color:'var(--text3)',marginLeft:3}},typeof u==='string'&&u!==''&&!u.startsWith('x')?' '+u:''))
            )
          )
        )
      )
    )
  );
}
