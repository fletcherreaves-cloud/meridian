// @ts-nocheck
import * as React from 'react';
import { sName } from '../constants.js';
import { dKey } from '../utils/date.js';
import { f$, fN } from '../utils/fmt.js';

const h        = React.createElement;
const { useState, useMemo, useCallback } = React;
const div      = (p,...c) => h('div', p, ...c);
const span     = (p,...c) => h('span', p, ...c);
const table    = (p,...c) => h('table', p, ...c);
const thead    = (p,...c) => h('thead', p, ...c);
const tbody    = (p,...c) => h('tbody', p, ...c);
const tr       = (p,...c) => h('tr', p, ...c);
const TH       = (p,...c) => h('th', p, ...c);
const td       = (p,...c) => h('td', p, ...c);

// ── Constants ─────────────────────────────────────────────────────────────────

const DOW_NAMES  = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const DOW_SHORT  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const LS_KEY     = 'mf_day_records_v1';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fDate(dk) {
  if (!dk) return '—';
  const d = new Date(dk + 'T00:00:00');
  return d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric'});
}
function fDateShort(dk) {
  if (!dk) return '—';
  const d = new Date(dk + 'T00:00:00');
  return d.toLocaleDateString('en-US',{month:'short',day:'numeric'});
}
function fWeekLabel(wdk) {
  if (!wdk) return '—';
  const d = new Date(wdk + 'T00:00:00');
  const e = new Date(d); e.setDate(d.getDate() + 6);
  return d.toLocaleDateString('en-US',{month:'short',day:'numeric'}) + '–' +
         e.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
}
function fMonthLabel(ym) {
  if (!ym) return '—';
  const [y,m] = ym.split('-');
  return new Date(+y,+m-1,1).toLocaleDateString('en-US',{month:'short',year:'numeric'});
}
function fSec(v) { return v != null && v > 0 ? fN(v,0) + 's' : '—'; }
function fGC(v)  { return v > 0 ? Math.round(v).toLocaleString() : '—'; }

// ── LocalStorage persistence ──────────────────────────────────────────────────

function loadSaved() {
  try { const s = localStorage.getItem(LS_KEY); return s ? JSON.parse(s) : null; }
  catch { return null; }
}
function saveMerged(stores) {
  try { localStorage.setItem(LS_KEY, JSON.stringify({ stores, savedAt: new Date().toISOString() })); }
  catch {}
}
function clearSaved() {
  try { localStorage.removeItem(LS_KEY); } catch {}
}

function mergeVal(saved, next, isLow=false) {
  if (!saved || !saved.val) return next;
  if (!next  || !next.val)  return saved;
  if (isLow)  return (next.val > 0 && next.val < saved.val) ? next : saved;
  return next.val > saved.val ? next : saved;
}

function mergeDOW(savedDow, nextDow, isLow=false) {
  const out = {};
  for (let i = 0; i < 7; i++) {
    out[i] = mergeVal(savedDow?.[i], nextDow?.[i], isLow);
  }
  return out;
}

function mergeStores(saved, computed) {
  const result = {};
  const locs = new Set([...Object.keys(saved||{}), ...Object.keys(computed||{})]);
  for (const loc of locs) {
    const s = saved?.[loc];
    const c = computed?.[loc];
    if (!c) { result[loc] = s; continue; }
    if (!s) { result[loc] = c; continue; }
    result[loc] = {
      sales: {
        day:   mergeVal(s.sales?.day,   c.sales?.day),
        week:  mergeVal(s.sales?.week,  c.sales?.week),
        month: mergeVal(s.sales?.month, c.sales?.month),
        dow:   mergeDOW(s.sales?.dow,   c.sales?.dow),
      },
      gc: {
        day:   mergeVal(s.gc?.day,   c.gc?.day),
        week:  mergeVal(s.gc?.week,  c.gc?.week),
        month: mergeVal(s.gc?.month, c.gc?.month),
        dow:   mergeDOW(s.gc?.dow,   c.gc?.dow),
      },
      avgChk: { day: mergeVal(s.avgChk?.day, c.avgChk?.day) },
      bf:     { day: mergeVal(s.bf?.day,     c.bf?.day) },
      speed: {
        oepe: mergeVal(s.speed?.oepe, c.speed?.oepe, true),
        kvs:  mergeVal(s.speed?.kvs,  c.speed?.kvs,  true),
        r2p:  mergeVal(s.speed?.r2p,  c.speed?.r2p,  true),
      },
    };
  }
  return result;
}

// ── Core computation ──────────────────────────────────────────────────────────

function computeRecords(ds, windowDays) {
  if (!ds?.loaded || !ds.laborRows?.length) return null;

  // Most recent date in dataset → reference for window
  let dataEnd = null;
  for (const r of ds.laborRows) {
    if (r.date && (!dataEnd || r.date > dataEnd)) dataEnd = r.date;
  }
  const windowStart = new Date(dataEnd.getTime() - windowDays * 86400000);

  // ── Daily aggregates from laborRows ──────────────────────────────
  const dayMap = {};
  for (const r of ds.laborRows) {
    if (!r.loc || !r.date) continue;
    const dk = dKey(r.date);
    const k  = r.loc + '_' + dk;
    if (!dayMap[k]) {
      dayMap[k] = { loc:r.loc, dk, date:r.date, sales:0, gc:0, bf:0,
                    avgChkRows:[], oepeVals:[], kvsVals:[], r2pVals:[] };
    }
    const d = dayMap[k];
    d.sales += r.sales || 0;
    d.gc    += (r.inStoreGC || 0) + (r.dtGC || 0);
    d.bf    += r.bfSales || 0;
    if (r.avgCheck > 0) d.avgChkRows.push(r.avgCheck);
  }

  // Add speed metrics from opsRows
  for (const r of ds.opsRows || []) {
    if (!r.loc || !r.date) continue;
    const dk = dKey(r.date);
    const k  = r.loc + '_' + dk;
    if (!dayMap[k]) continue;
    if (r.oepe > 0) dayMap[k].oepeVals.push(r.oepe);
    if (r.kvst > 0) dayMap[k].kvsVals.push(r.kvst);
    if (r.r2p  > 0) dayMap[k].r2pVals.push(r.r2p);
  }

  const avg = arr => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : null;

  const days = Object.values(dayMap)
    .filter(d => d.sales > 0)
    .map(d => ({
      ...d,
      avgChk: avg(d.avgChkRows),
      oepe:   avg(d.oepeVals),
      kvs:    avg(d.kvsVals),
      r2p:    avg(d.r2pVals),
      dow:    (d.date instanceof Date ? d.date : new Date(d.dk + 'T00:00:00')).getDay(),
    }));

  // ── Weekly aggregates ─────────────────────────────────────────────
  const weekMap = {}, weekGCMap = {};
  for (const d of days) {
    const dt  = d.date instanceof Date ? d.date : new Date(d.dk + 'T00:00:00');
    const ws  = new Date(dt); ws.setDate(dt.getDate() - dt.getDay());
    const wdk = dKey(ws);
    const k   = d.loc + '_' + wdk;
    if (!weekMap[k])   weekMap[k]   = { loc:d.loc, wdk, sales:0 };
    if (!weekGCMap[k]) weekGCMap[k] = { loc:d.loc, wdk, gc:0 };
    weekMap[k].sales  += d.sales;
    weekGCMap[k].gc   += d.gc;
  }

  // ── Monthly aggregates ────────────────────────────────────────────
  const monthMap = {}, monthGCMap = {};
  for (const d of days) {
    const ym = d.dk.slice(0,7);
    const k  = d.loc + '_' + ym;
    if (!monthMap[k])   monthMap[k]   = { loc:d.loc, ym, sales:0 };
    if (!monthGCMap[k]) monthGCMap[k] = { loc:d.loc, ym, gc:0 };
    monthMap[k].sales  += d.sales;
    monthGCMap[k].gc   += d.gc;
  }

  // ── Chronological record scanning per store ───────────────────────
  const locDays = {};
  for (const d of days) {
    if (!locDays[d.loc]) locDays[d.loc] = [];
    locDays[d.loc].push(d);
  }
  for (const arr of Object.values(locDays)) arr.sort((a,b)=>a.dk.localeCompare(b.dk));

  const computed = {}; // loc → record structure
  const recentBreakers = [];

  function flagRecent(loc, dk, type, val, prev, isLow=false) {
    const dt = new Date(dk + 'T00:00:00');
    if (dt >= windowStart) {
      recentBreakers.push({ loc, dk, type, val, prev, isLow });
    }
  }

  for (const [loc, arr] of Object.entries(locDays)) {
    let sMax=0, gcMax=0, bfMax=0, acMax=0;
    let oepeBest=Infinity, kvsBest=Infinity, r2pBest=Infinity;
    const dowSales={}; const dowGC={};
    for (let i=0;i<7;i++) { dowSales[i]=0; dowGC[i]=0; }

    const rec = {
      sales: { day:null, week:null, month:null, dow:{} },
      gc:    { day:null, week:null, month:null, dow:{} },
      avgChk:{ day:null },
      bf:    { day:null },
      speed: { oepe:null, kvs:null, r2p:null },
    };
    for (let i=0;i<7;i++) { rec.sales.dow[i]=null; rec.gc.dow[i]=null; }

    for (const d of arr) {
      const { dk, sales, gc, bf, avgChk, oepe, kvs, r2p, dow } = d;
      const prev_sMax=sMax, prev_gcMax=gcMax, prev_bfMax=bfMax, prev_acMax=acMax;
      const prev_oepe=oepeBest, prev_kvs=kvsBest, prev_r2p=r2pBest;
      const prev_dowS=dowSales[dow], prev_dowGC=dowGC[dow];

      if (sales > sMax)        { sMax=sales;    rec.sales.day={val:sales,dk}; flagRecent(loc,dk,'Sales Day',sales,prev_sMax>0?prev_sMax:null); }
      if (gc    > gcMax)       { gcMax=gc;       rec.gc.day={val:gc,dk};      flagRecent(loc,dk,'GC Day',gc,prev_gcMax>0?prev_gcMax:null); }
      if (bf    > bfMax)       { bfMax=bf;       rec.bf.day={val:bf,dk};      flagRecent(loc,dk,'Breakfast Sales',bf,prev_bfMax>0?prev_bfMax:null); }
      if (avgChk && avgChk>acMax) { acMax=avgChk; rec.avgChk.day={val:avgChk,dk}; flagRecent(loc,dk,'Avg Check',avgChk,prev_acMax>0?prev_acMax:null); }
      if (oepe  && oepe<oepeBest){ oepeBest=oepe; rec.speed.oepe={val:oepe,dk}; flagRecent(loc,dk,'OEPE',oepe,prev_oepe<Infinity?prev_oepe:null,true); }
      if (kvs   && kvs<kvsBest)  { kvsBest=kvs;   rec.speed.kvs={val:kvs,dk};   flagRecent(loc,dk,'KVS',kvs,prev_kvs<Infinity?prev_kvs:null,true); }
      if (r2p   && r2p<r2pBest)  { r2pBest=r2p;   rec.speed.r2p={val:r2p,dk};   flagRecent(loc,dk,'R2P',r2p,prev_r2p<Infinity?prev_r2p:null,true); }

      // DOW records
      if (sales > dowSales[dow]) {
        dowSales[dow]=sales;
        rec.sales.dow[dow]={val:sales,dk};
        flagRecent(loc,dk,`DOW Sales (${DOW_SHORT[dow]})`,sales,prev_dowS>0?prev_dowS:null);
      }
      if (gc > dowGC[dow]) {
        dowGC[dow]=gc;
        rec.gc.dow[dow]={val:gc,dk};
        flagRecent(loc,dk,`DOW GC (${DOW_SHORT[dow]})`,gc,prev_dowGC>0?prev_dowGC:null);
      }
    }
    computed[loc] = rec;
  }

  // Weekly sales+GC records per store
  const locWeeks = {};
  for (const w of Object.values(weekMap)) {
    if (!locWeeks[w.loc]) locWeeks[w.loc] = [];
    locWeeks[w.loc].push(w);
  }
  const locWeeksGC = {};
  for (const w of Object.values(weekGCMap)) {
    if (!locWeeksGC[w.loc]) locWeeksGC[w.loc] = [];
    locWeeksGC[w.loc].push(w);
  }
  for (const arr of Object.values(locWeeks)) arr.sort((a,b)=>a.wdk.localeCompare(b.wdk));
  for (const arr of Object.values(locWeeksGC)) arr.sort((a,b)=>a.wdk.localeCompare(b.wdk));

  for (const [loc, arr] of Object.entries(locWeeks)) {
    let wMax=0;
    for (const w of arr) {
      if (w.sales > wMax) {
        const prev=wMax>0?wMax:null; wMax=w.sales;
        if (!computed[loc]) continue;
        computed[loc].sales.week = { val:w.sales, wdk:w.wdk };
        flagRecent(loc, w.wdk, 'Sales Week', w.sales, prev);
      }
    }
  }
  for (const [loc, arr] of Object.entries(locWeeksGC)) {
    let wMax=0;
    for (const w of arr) {
      if (w.gc > wMax) {
        wMax=w.gc;
        if (!computed[loc]) continue;
        computed[loc].gc.week = { val:w.gc, wdk:w.wdk };
      }
    }
  }

  // Monthly records per store
  const locMonths={}, locMonthsGC={};
  for (const m of Object.values(monthMap)) {
    if (!locMonths[m.loc]) locMonths[m.loc]=[];
    locMonths[m.loc].push(m);
  }
  for (const m of Object.values(monthGCMap)) {
    if (!locMonthsGC[m.loc]) locMonthsGC[m.loc]=[];
    locMonthsGC[m.loc].push(m);
  }
  for (const [loc, arr] of Object.entries(locMonths)) {
    let mMax=0;
    for (const m of arr) {
      if (m.sales > mMax) {
        const prev=mMax>0?mMax:null; mMax=m.sales;
        if (!computed[loc]) continue;
        computed[loc].sales.month = { val:m.sales, ym:m.ym };
        flagRecent(loc, m.ym+'-01', 'Sales Month', m.sales, prev);
      }
    }
  }
  for (const [loc, arr] of Object.entries(locMonthsGC)) {
    let mMax=0;
    for (const m of arr) {
      if (m.gc > mMax) {
        mMax=m.gc;
        if (!computed[loc]) continue;
        computed[loc].gc.month = { val:m.gc, ym:m.ym };
      }
    }
  }

  recentBreakers.sort((a,b) => b.dk.localeCompare(a.dk));

  // ── Merge with localStorage all-time records ──────────────────────
  const saved    = loadSaved();
  const merged   = mergeStores(saved?.stores, computed);
  saveMerged(merged);

  // ── District heroes ───────────────────────────────────────────────
  let distSalesDay  = { val:0, loc:null, dk:null };
  let distSalesWeek = { val:0, loc:null, wdk:null };
  let distSalesMo   = { val:0, loc:null, ym:null };
  let distGCDay     = { val:0, loc:null, dk:null };
  let distOepe      = { val:Infinity, loc:null, dk:null };
  let distKvs       = { val:Infinity, loc:null, dk:null };
  let distR2p       = { val:Infinity, loc:null, dk:null };
  let distAvgChk    = { val:0, loc:null, dk:null };

  for (const [loc, r] of Object.entries(merged)) {
    if ((r.sales?.day?.val||0)   > distSalesDay.val)  distSalesDay  = {...r.sales.day,   loc};
    if ((r.sales?.week?.val||0)  > distSalesWeek.val) distSalesWeek = {...r.sales.week,  loc};
    if ((r.sales?.month?.val||0) > distSalesMo.val)   distSalesMo   = {...r.sales.month, loc};
    if ((r.gc?.day?.val||0)      > distGCDay.val)     distGCDay     = {...r.gc.day,      loc};
    if ((r.speed?.oepe?.val||Infinity) < distOepe.val) distOepe     = {...r.speed.oepe,  loc};
    if ((r.speed?.kvs?.val||Infinity)  < distKvs.val)  distKvs      = {...r.speed.kvs,   loc};
    if ((r.speed?.r2p?.val||Infinity)  < distR2p.val)  distR2p      = {...r.speed.r2p,   loc};
    if ((r.avgChk?.day?.val||0)  > distAvgChk.val)   distAvgChk    = {...r.avgChk.day,  loc};
  }

  // ── Top days ──────────────────────────────────────────────────────
  const topDays = [...days].sort((a,b)=>b.sales-a.sales).slice(0,20);

  return {
    stores: merged,
    recentBreakers,
    topDays,
    distSalesDay, distSalesWeek, distSalesMo,
    distGCDay, distOepe, distKvs, distR2p, distAvgChk,
    dataEnd, windowDays,
    totalStores: Object.keys(merged).length,
    savedAt: saved?.savedAt,
  };
}

// ── Styles ────────────────────────────────────────────────────────────────────

const S = {
  overlay: { position:'fixed',inset:0,background:'rgba(0,0,0,.75)',zIndex:400,display:'flex',flexDirection:'column',padding:20,overflow:'hidden' },
  panel:   { background:'var(--surf)',borderRadius:'var(--rl)',border:'.5px solid var(--bdr2)',display:'flex',flexDirection:'column',flex:1,maxWidth:1400,margin:'0 auto',width:'100%',overflow:'hidden' },
  hdr:     { display:'flex',alignItems:'center',gap:12,padding:'14px 20px',borderBottom:'.5px solid var(--bdr)',flexShrink:0 },
  tabs:    { display:'flex',gap:2,padding:'0 20px',borderBottom:'.5px solid var(--bdr)',flexShrink:0,background:'var(--surf)' },
  tab:     (active) => ({ padding:'10px 16px',fontSize:13,fontWeight:600,cursor:'pointer',border:'none',background:'none',color:active?'var(--acc)':'var(--txt3)',borderBottom:active?'2px solid var(--acc)':'2px solid transparent',transition:'color .15s' }),
  body:    { flex:1,overflowY:'auto',padding:'20px 24px',display:'flex',flexDirection:'column',gap:22 },
  heroGrid:{ display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14 },
  heroCard:{ background:'var(--surf2)',border:'.5px solid var(--bdr)',borderRadius:'var(--rm)',padding:'14px 16px' },
  heroLbl: { fontSize:10,fontWeight:700,letterSpacing:.8,color:'var(--txt3)',textTransform:'uppercase',marginBottom:6 },
  heroVal: { fontSize:20,fontWeight:700,color:'var(--acc)',lineHeight:1.1,marginBottom:3 },
  heroSub: { fontSize:11,color:'var(--txt3)',lineHeight:1.4 },
  sLbl:    { fontSize:11,fontWeight:700,letterSpacing:.8,color:'var(--txt3)',textTransform:'uppercase',marginBottom:10 },
  tblWrap: { overflowX:'auto',borderRadius:'var(--rm)',border:'.5px solid var(--bdr)' },
  tbl:     { width:'100%',borderCollapse:'collapse',fontSize:12.5 },
  th:      { padding:'8px 12px',textAlign:'left',background:'var(--surf3)',borderBottom:'.5px solid var(--bdr)',color:'var(--txt2)',fontWeight:600,fontSize:11,whiteSpace:'nowrap' },
  thR:     { padding:'8px 12px',textAlign:'right',background:'var(--surf3)',borderBottom:'.5px solid var(--bdr)',color:'var(--txt2)',fontWeight:600,fontSize:11,whiteSpace:'nowrap' },
  td:      { padding:'8px 12px',borderBottom:'.5px solid var(--bdr)',color:'var(--txt)',whiteSpace:'nowrap' },
  tdR:     { padding:'8px 12px',borderBottom:'.5px solid var(--bdr)',color:'var(--txt)',textAlign:'right',whiteSpace:'nowrap' },
  tdM:     { padding:'8px 12px',borderBottom:'.5px solid var(--bdr)',color:'var(--txt3)',fontSize:11,whiteSpace:'nowrap' },
  tdMR:    { padding:'8px 12px',borderBottom:'.5px solid var(--bdr)',color:'var(--txt3)',fontSize:11,textAlign:'right',whiteSpace:'nowrap' },
  badge:   (c,bg) => ({ display:'inline-block',fontSize:10,fontWeight:700,letterSpacing:.5,color:c,background:bg,border:`1px solid ${c}`,borderRadius:4,padding:'1px 5px',textTransform:'uppercase',whiteSpace:'nowrap' }),
  select:  { padding:'5px 10px',borderRadius:'var(--rs)',border:'.5px solid var(--bdr2)',background:'var(--surf2)',color:'var(--txt)',fontSize:12.5,cursor:'pointer' },
  ghostBtn:{ padding:'5px 12px',borderRadius:'var(--rs)',border:'.5px solid var(--bdr2)',background:'transparent',color:'var(--txt2)',fontSize:12,cursor:'pointer' },
  dangerBtn:{ padding:'5px 12px',borderRadius:'var(--rs)',border:'.5px solid #ef444466',background:'transparent',color:'#ef4444',fontSize:12,cursor:'pointer' },
};

// Badge helpers
const BADGE_SALES  = () => S.badge('#10b981','rgba(16,185,129,.1)');
const BADGE_GC     = () => S.badge('#8b5cf6','rgba(139,92,246,.1)');
const BADGE_SPEED  = () => S.badge('#06b6d4','rgba(6,182,212,.1)');
const BADGE_BF     = () => S.badge('#f59e0b','rgba(245,158,11,.1)');
const BADGE_ACK    = () => S.badge('#ec4899','rgba(236,72,153,.1)');
const BADGE_DOW    = () => S.badge('#64748b','rgba(100,116,139,.1)');

function badgeForType(type) {
  if (type.startsWith('DOW'))       return BADGE_DOW();
  if (type.includes('GC'))         return BADGE_GC();
  if (type.includes('OEPE')||type.includes('KVS')||type.includes('R2P')) return BADGE_SPEED();
  if (type.includes('Breakfast'))  return BADGE_BF();
  if (type.includes('Avg Check'))  return BADGE_ACK();
  return BADGE_SALES();
}

// ── Sort-able TH helper ───────────────────────────────────────────────────────

function SortTH({ label, sk, sortKey, onSort, right }) {
  const active = sortKey === sk;
  return TH({
    style:{ ...( right ? S.thR : S.th ), cursor:'pointer', color:active?'var(--acc)':'var(--txt2)', userSelect:'none' },
    onClick:()=>onSort(sk),
  }, label + (active ? ' ▾' : ''));
}

// ── Hero Grid ─────────────────────────────────────────────────────────────────

function HeroCard({ label, val, sub }) {
  return div({ style:S.heroCard },
    div({ style:S.heroLbl }, label),
    div({ style:S.heroVal }, val || '—'),
    div({ style:S.heroSub }, sub || ''),
  );
}

function HeroGrid({ data }) {
  const { distSalesDay, distSalesWeek, distSalesMo, distGCDay, distOepe, distKvs, distR2p, distAvgChk } = data;
  return div({},
    div({ style:S.sLbl }, 'District All-Time Champions'),
    div({ style:S.heroGrid },
      h(HeroCard,{ label:'🏆 Best Day Sales',  val:distSalesDay?.val?f$(distSalesDay.val):'—',  sub:distSalesDay?.loc?`${sName(distSalesDay.loc)} · ${fDate(distSalesDay.dk)}`:'' }),
      h(HeroCard,{ label:'📅 Best Week Sales',  val:distSalesWeek?.val?f$(distSalesWeek.val):'—', sub:distSalesWeek?.loc?`${sName(distSalesWeek.loc)} · ${fWeekLabel(distSalesWeek.wdk)}`:'' }),
      h(HeroCard,{ label:'📊 Best Month Sales', val:distSalesMo?.val?f$(distSalesMo.val):'—',    sub:distSalesMo?.loc?`${sName(distSalesMo.loc)} · ${fMonthLabel(distSalesMo.ym)}`:'' }),
      h(HeroCard,{ label:'👥 Best GC Day',      val:distGCDay?.val?fGC(distGCDay.val):'—',       sub:distGCDay?.loc?`${sName(distGCDay.loc)} · ${fDate(distGCDay.dk)}`:'' }),
    ),
    div({ style:{ ...S.heroGrid, marginTop:12 } },
      h(HeroCard,{ label:'⚡ Best OEPE',    val:distOepe?.val<Infinity?fSec(distOepe.val):'—',  sub:distOepe?.loc?`${sName(distOepe.loc)} · ${fDate(distOepe.dk)}`:'' }),
      h(HeroCard,{ label:'🍟 Best KVS',     val:distKvs?.val<Infinity?fSec(distKvs.val):'—',   sub:distKvs?.loc?`${sName(distKvs.loc)} · ${fDate(distKvs.dk)}`:'' }),
      h(HeroCard,{ label:'📦 Best R2P',     val:distR2p?.val<Infinity?fSec(distR2p.val):'—',   sub:distR2p?.loc?`${sName(distR2p.loc)} · ${fDate(distR2p.dk)}`:'' }),
      h(HeroCard,{ label:'💰 Best Avg Check',val:distAvgChk?.val?f$(distAvgChk.val):'—',       sub:distAvgChk?.loc?`${sName(distAvgChk.loc)} · ${fDate(distAvgChk.dk)}`:'' }),
    ),
  );
}

// ── Recent Breakers tab ───────────────────────────────────────────────────────

const BREAK_FILTERS = [
  { key:'all',   label:'All' },
  { key:'sales', label:'Sales' },
  { key:'gc',    label:'Guest Count' },
  { key:'speed', label:'Speed' },
  { key:'dow',   label:'Day of Week' },
];

function matchFilter(type, filter) {
  if (filter === 'all')   return true;
  if (filter === 'sales') return type.includes('Sales') && !type.startsWith('DOW');
  if (filter === 'gc')    return type.includes('GC') && !type.startsWith('DOW');
  if (filter === 'speed') return ['OEPE','KVS','R2P'].some(s=>type.includes(s));
  if (filter === 'dow')   return type.startsWith('DOW');
  return true;
}

function RecentBreakersTab({ data, windowDays, onWindowChange }) {
  const [filter, setFilter] = useState('all');
  const { recentBreakers } = data;
  const shown = recentBreakers.filter(b => matchFilter(b.type, filter));

  return div({ style:{ display:'flex',flexDirection:'column',gap:16 } },
    div({ style:{ display:'flex',alignItems:'center',gap:10,flexWrap:'wrap' } },
      div({ style:S.sLbl }, `Record Breaks in Last ${windowDays} Days`),
      div({ style:{ flex:1 } }),
      ...BREAK_FILTERS.map(f =>
        h('button',{
          key:f.key, style:{ ...S.ghostBtn, color:filter===f.key?'var(--acc)':'var(--txt3)', borderColor:filter===f.key?'var(--acc)':'var(--bdr2)' },
          onClick:()=>setFilter(f.key),
        }, f.label),
      ),
      h('select',{ style:S.select, value:windowDays, onChange:e=>onWindowChange(+e.target.value) },
        h('option',{value:30},'30 days'), h('option',{value:60},'60 days'),
        h('option',{value:90},'90 days'), h('option',{value:180},'180 days'),
      ),
    ),
    shown.length === 0
      ? div({ style:{ padding:'24px',textAlign:'center',color:'var(--txt3)',fontSize:13 } },
          `No ${filter==='all'?'':filter+' '}records broken in the last ${windowDays} days of data.`)
      : div({ style:S.tblWrap },
          table({ style:S.tbl },
            thead({},
              tr({},
                TH({style:S.th},'Store'), TH({style:S.th},'Date'),
                TH({style:S.th},'Record Type'), TH({style:S.thR},'New Record'),
                TH({style:S.thR},'Previous Best'), TH({style:S.thR},'Change'),
              ),
            ),
            tbody({},
              ...shown.map((b,i) => {
                const impr = b.prev != null
                  ? (b.isLow ? (b.prev-b.val)/b.prev*100 : (b.val-b.prev)/b.prev*100)
                  : null;
                const fVal = b.isLow
                  ? v => fSec(v)
                  : b.type.includes('GC') ? v=>fGC(v) : b.type.includes('Avg Check') ? v=>f$(v) : v=>f$(v);
                return tr({ key:i },
                  td({style:S.td}, sName(b.loc)),
                  td({style:S.td},
                    b.type.includes('Week') ? fWeekLabel(b.dk) :
                    b.type.includes('Month') ? fMonthLabel(b.dk) : fDate(b.dk),
                  ),
                  td({style:S.td}, span({style:badgeForType(b.type)}, b.type)),
                  td({style:{...S.tdR,fontWeight:600,color:'var(--acc)'}}, fVal(b.val)),
                  td({style:S.tdMR}, b.prev!=null ? fVal(b.prev) : span({style:{color:'var(--txt3)'}}, 'first record')),
                  td({style:{...S.tdR,color:impr!=null?'#10b981':'var(--txt3)'}},
                    impr!=null ? `+${impr.toFixed(1)}%` : '—'),
                );
              }),
            ),
          ),
        ),
  );
}

// ── Sales & Volume tab ────────────────────────────────────────────────────────

function SalesVolumeTab({ data }) {
  const [sortKey, setSortKey] = useState('salesDay');
  const { stores } = data;

  const locs = Object.keys(stores);
  const sorted = [...locs].sort((a,b) => {
    const ra=stores[a], rb=stores[b];
    if (sortKey==='salesDay')   return (rb.sales?.day?.val||0)   - (ra.sales?.day?.val||0);
    if (sortKey==='salesWeek')  return (rb.sales?.week?.val||0)  - (ra.sales?.week?.val||0);
    if (sortKey==='salesMonth') return (rb.sales?.month?.val||0) - (ra.sales?.month?.val||0);
    if (sortKey==='gcDay')      return (rb.gc?.day?.val||0)      - (ra.gc?.day?.val||0);
    if (sortKey==='gcWeek')     return (rb.gc?.week?.val||0)     - (ra.gc?.week?.val||0);
    if (sortKey==='gcMonth')    return (rb.gc?.month?.val||0)    - (ra.gc?.month?.val||0);
    if (sortKey==='avgChk')     return (rb.avgChk?.day?.val||0)  - (ra.avgChk?.day?.val||0);
    if (sortKey==='bf')         return (rb.bf?.day?.val||0)      - (ra.bf?.day?.val||0);
    return 0;
  });

  const S2 = (sk,lbl) => h(SortTH,{label:lbl,sk,sortKey,onSort:setSortKey,right:true});

  return div({ style:{ display:'flex',flexDirection:'column',gap:20 } },
    // Sales records
    div({},
      div({ style:S.sLbl }, 'Sales Records by Store'),
      div({ style:S.tblWrap },
        table({ style:S.tbl },
          thead({},
            tr({},
              TH({style:S.th},'Store'),
              S2('salesDay','Best Day'), TH({style:S.thR},'Date'),
              S2('salesWeek','Best Week'), TH({style:S.thR},'Week Of'),
              S2('salesMonth','Best Month'), TH({style:S.thR},'Month'),
              S2('bf','Best Breakfast Day'),
              S2('avgChk','Best Avg Check'),
            ),
          ),
          tbody({},
            ...sorted.map((loc,i) => {
              const r=stores[loc];
              return tr({ key:loc, style:{background:i%2?'':'rgba(255,255,255,.015)'} },
                td({style:{...S.td,fontWeight:500}}, sName(loc)),
                td({style:{...S.tdR,fontWeight:600,color:sortKey==='salesDay'?'var(--acc)':'var(--txt)'}}, r.sales?.day?.val?f$(r.sales.day.val):'—'),
                td({style:S.tdM}, fDateShort(r.sales?.day?.dk)),
                td({style:{...S.tdR,color:sortKey==='salesWeek'?'var(--acc)':'var(--txt)'}}, r.sales?.week?.val?f$(r.sales.week.val):'—'),
                td({style:S.tdM}, r.sales?.week?.wdk?fDateShort(r.sales.week.wdk):'—'),
                td({style:{...S.tdR,color:sortKey==='salesMonth'?'var(--acc)':'var(--txt)'}}, r.sales?.month?.val?f$(r.sales.month.val):'—'),
                td({style:S.tdM}, fMonthLabel(r.sales?.month?.ym)),
                td({style:{...S.tdR,color:sortKey==='bf'?'var(--acc)':'var(--txt)'}}, r.bf?.day?.val?f$(r.bf.day.val):'—'),
                td({style:{...S.tdR,color:sortKey==='avgChk'?'var(--acc)':'var(--txt)'}}, r.avgChk?.day?.val?f$(r.avgChk.day.val):'—'),
              );
            }),
          ),
        ),
      ),
    ),
    // GC records
    div({},
      div({ style:S.sLbl }, 'Guest Count Records by Store'),
      div({ style:S.tblWrap },
        table({ style:S.tbl },
          thead({},
            tr({},
              TH({style:S.th},'Store'),
              S2('gcDay','Best GC Day'), TH({style:S.thR},'Date'),
              S2('gcWeek','Best GC Week'), TH({style:S.thR},'Week Of'),
              S2('gcMonth','Best GC Month'), TH({style:S.thR},'Month'),
            ),
          ),
          tbody({},
            ...sorted.map((loc,i) => {
              const r=stores[loc];
              return tr({ key:loc, style:{background:i%2?'':'rgba(255,255,255,.015)'} },
                td({style:{...S.td,fontWeight:500}}, sName(loc)),
                td({style:{...S.tdR,fontWeight:600,color:sortKey==='gcDay'?'var(--acc)':'var(--txt)'}}, r.gc?.day?.val?fGC(r.gc.day.val):'—'),
                td({style:S.tdM}, fDateShort(r.gc?.day?.dk)),
                td({style:{...S.tdR,color:sortKey==='gcWeek'?'var(--acc)':'var(--txt)'}}, r.gc?.week?.val?fGC(r.gc.week.val):'—'),
                td({style:S.tdM}, r.gc?.week?.wdk?fDateShort(r.gc.week.wdk):'—'),
                td({style:{...S.tdR,color:sortKey==='gcMonth'?'var(--acc)':'var(--txt)'}}, r.gc?.month?.val?fGC(r.gc.month.val):'—'),
                td({style:S.tdM}, fMonthLabel(r.gc?.month?.ym)),
              );
            }),
          ),
        ),
      ),
    ),
  );
}

// ── Speed tab ────────────────────────────────────────────────────────────────

function SpeedTab({ data }) {
  const [sortKey, setSortKey] = useState('oepe');
  const { stores } = data;

  const locs = Object.keys(stores);
  const sorted = [...locs].sort((a,b) => {
    const ra=stores[a], rb=stores[b];
    const va = ra.speed?.[sortKey]?.val || Infinity;
    const vb = rb.speed?.[sortKey]?.val || Infinity;
    return va - vb; // lower = better
  });

  const S2 = (sk,lbl) => h(SortTH,{label:lbl,sk,sortKey,onSort:setSortKey,right:true});

  return div({ style:{ display:'flex',flexDirection:'column',gap:16 } },
    div({ style:S.sLbl }, 'Speed of Service Records by Store'),
    div({ style:{ fontSize:12, color:'var(--txt3)', marginBottom:4 } },
      'Lower is better — these are all-time fastest (lowest) times recorded for each store.'),
    div({ style:S.tblWrap },
      table({ style:S.tbl },
        thead({},
          tr({},
            TH({style:S.th},'Store'),
            S2('oepe','Best OEPE'), TH({style:S.thR},'Date'),
            S2('kvs','Best KVS'), TH({style:S.thR},'Date'),
            S2('r2p','Best R2P'), TH({style:S.thR},'Date'),
          ),
        ),
        tbody({},
          ...sorted.map((loc,i) => {
            const r=stores[loc];
            const oepe=r.speed?.oepe, kvs=r.speed?.kvs, r2p=r.speed?.r2p;
            return tr({ key:loc, style:{background:i%2?'':'rgba(255,255,255,.015)'} },
              td({style:{...S.td,fontWeight:500}}, sName(loc)),
              td({style:{...S.tdR,fontWeight:600,color:sortKey==='oepe'?'var(--acc)':'var(--txt)'}}, oepe?.val?fSec(oepe.val):'—'),
              td({style:S.tdM}, fDateShort(oepe?.dk)),
              td({style:{...S.tdR,color:sortKey==='kvs'?'var(--acc)':'var(--txt)'}},  kvs?.val?fSec(kvs.val):'—'),
              td({style:S.tdM}, fDateShort(kvs?.dk)),
              td({style:{...S.tdR,color:sortKey==='r2p'?'var(--acc)':'var(--txt)'}},  r2p?.val?fSec(r2p.val):'—'),
              td({style:S.tdM}, fDateShort(r2p?.dk)),
            );
          }),
        ),
      ),
    ),
  );
}

// ── Day of Week tab ───────────────────────────────────────────────────────────

function DOWTab({ data }) {
  const [dow,     setDow]     = useState(1); // default: Monday
  const [metric,  setMetric]  = useState('sales');
  const { stores } = data;

  const locs = Object.keys(stores);
  const rows = locs.map(loc => {
    const val = metric==='sales' ? stores[loc]?.sales?.dow?.[dow]?.val
                                 : stores[loc]?.gc?.dow?.[dow]?.val;
    const dk  = metric==='sales' ? stores[loc]?.sales?.dow?.[dow]?.dk
                                 : stores[loc]?.gc?.dow?.[dow]?.dk;
    return { loc, val:val||0, dk };
  }).filter(r=>r.val>0).sort((a,b)=>b.val-a.val);

  return div({ style:{ display:'flex',flexDirection:'column',gap:16 } },
    div({ style:{ display:'flex',alignItems:'center',gap:10,flexWrap:'wrap' } },
      div({ style:S.sLbl }, 'Best Day-of-Week Records'),
      div({ style:{ flex:1 } }),
      h('select',{ style:S.select, value:dow, onChange:e=>setDow(+e.target.value) },
        ...DOW_NAMES.map((n,i)=>h('option',{key:i,value:i},n)),
      ),
      h('select',{ style:S.select, value:metric, onChange:e=>setMetric(e.target.value) },
        h('option',{value:'sales'},'Sales'), h('option',{value:'gc'},'Guest Count'),
      ),
    ),
    div({ style:{ fontSize:12,color:'var(--txt3)',marginBottom:4 } },
      `All-time best ${metric==='sales'?'sales':'guest count'} on a ${DOW_NAMES[dow]} for each store.`),
    rows.length === 0
      ? div({ style:{ padding:'24px',textAlign:'center',color:'var(--txt3)',fontSize:13 } },
          `No ${DOW_NAMES[dow]} data found.`)
      : div({ style:S.tblWrap },
          table({ style:S.tbl },
            thead({},
              tr({},
                TH({style:{...S.th,width:40}},'#'),
                TH({style:S.th},'Store'),
                TH({style:S.th},'Date Set'),
                TH({style:S.thR},`Best ${DOW_NAMES[dow]} ${metric==='sales'?'Sales':'GC'}`),
              ),
            ),
            tbody({},
              ...rows.map((r,i)=>
                tr({ key:r.loc },
                  td({style:{...S.td,color:i<3?'var(--acc)':'var(--txt3)',fontWeight:700}}, i+1),
                  td({style:{...S.td,fontWeight:500}}, sName(r.loc)),
                  td({style:S.tdM}, fDate(r.dk)),
                  td({style:{...S.tdR,fontWeight:600,color:i===0?'var(--acc)':'var(--txt)'}},
                    metric==='sales'?f$(r.val):fGC(r.val)),
                ),
              ),
            ),
          ),
        ),
    // All-DOW matrix for selected store
    div({ style:{ marginTop:16 } },
      div({ style:S.sLbl }, `${DOW_NAMES[dow]} Context — All Stores Ranked`),
      div({ style:{ color:'var(--txt3)',fontSize:12 } }, `#1 best ${DOW_NAMES[dow]} ${metric==='sales'?'sales':'GC'} ever: ${rows[0]?`${sName(rows[0].loc)} on ${fDate(rows[0].dk)}`:'—'}`),
    ),
  );
}

// ── Top Days tab ──────────────────────────────────────────────────────────────

function TopDaysTab({ data }) {
  const { topDays } = data;
  return div({ style:{ display:'flex',flexDirection:'column',gap:16 } },
    div({ style:S.sLbl }, `District Top ${topDays.length} Sales Days — All Time`),
    div({ style:S.tblWrap },
      table({ style:S.tbl },
        thead({},
          tr({},
            TH({style:{...S.th,width:40}},'#'),
            TH({style:S.th},'Store'), TH({style:S.th},'Date'),
            TH({style:S.thR},'Sales'), TH({style:S.thR},'GC'),
          ),
        ),
        tbody({},
          ...topDays.map((d,i)=>
            tr({ key:d.loc+d.dk },
              td({style:{...S.td,color:i<3?'var(--acc)':'var(--txt3)',fontWeight:700}}, i+1),
              td({style:S.td}, sName(d.loc)),
              td({style:S.td}, fDate(d.dk)),
              td({style:{...S.tdR,fontWeight:600,color:i===0?'var(--acc)':'var(--txt)'}}, f$(d.sales)),
              td({style:S.tdR}, d.gc?fGC(d.gc):'—'),
            ),
          ),
        ),
      ),
    ),
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────────

const TABS = [
  { key:'overview',  label:'Overview' },
  { key:'recent',    label:'Recent Breaks' },
  { key:'sales',     label:'Sales & Volume' },
  { key:'speed',     label:'Speed of Service' },
  { key:'dow',       label:'Day of Week' },
  { key:'topdays',   label:'Top Days' },
];

export function RecordDayPanel({ stores, ds, onClose }) {
  const [windowDays, setWindowDays] = useState(60);
  const [tab,        setTab]        = useState('overview');
  const [resetKey,   setResetKey]   = useState(0);
  const [confirmReset, setConfirmReset] = useState(false);

  const data = useMemo(() => computeRecords(ds, windowDays), [ds, windowDays, resetKey]);

  const handleReset = useCallback(() => {
    clearSaved();
    setConfirmReset(false);
    setResetKey(k => k + 1);
  }, []);

  const closeOnBg = e => { if (e.target === e.currentTarget) onClose(); };

  const recentCount = data?.recentBreakers?.length || 0;

  return div({ style:S.overlay, onClick:closeOnBg },
    div({ style:S.panel },

      // Header
      div({ style:S.hdr },
        span({ style:{ fontSize:18 } }, '🏆'),
        div({ style:{ flex:1 } },
          div({ style:{ fontWeight:700, fontSize:16 } }, 'Record Day Intelligence'),
          div({ style:{ fontSize:11,color:'var(--txt3)' } },
            data
              ? `${data.totalStores} stores · data through ${fDate(dKey(data.dataEnd))} · records accumulate across uploads`
              : 'Upload sales data to track records',
          ),
        ),
        confirmReset
          ? div({ style:{ display:'flex',alignItems:'center',gap:8,fontSize:12 } },
              span({ style:{color:'var(--txt3)'} }, 'Reset all saved records?'),
              h('button',{ style:S.dangerBtn, onClick:handleReset }, 'Yes, reset'),
              h('button',{ style:S.ghostBtn, onClick:()=>setConfirmReset(false) }, 'Cancel'),
            )
          : h('button',{ style:S.dangerBtn, onClick:()=>setConfirmReset(true) }, 'Reset Records'),
        h('button',{
          onClick:onClose,
          style:{ background:'none',border:'none',color:'var(--txt3)',fontSize:20,cursor:'pointer',padding:'4px 8px',marginLeft:8 },
        }, '✕'),
      ),

      // Tab bar
      div({ style:S.tabs },
        ...TABS.map(t =>
          h('button',{ key:t.key, style:S.tab(tab===t.key), onClick:()=>setTab(t.key) },
            t.label + (t.key==='recent' && recentCount ? ` (${recentCount})` : ''),
          ),
        ),
      ),

      // Body
      !data
        ? div({ style:{ flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--txt3)',fontSize:14 } },
            'No sales data loaded. Upload your data to begin tracking records.')
        : div({ style:S.body },
            tab==='overview' && h(HeroGrid, { data }),
            tab==='recent'   && h(RecentBreakersTab, { data, windowDays, onWindowChange:setWindowDays }),
            tab==='sales'    && h(SalesVolumeTab,     { data }),
            tab==='speed'    && h(SpeedTab,            { data }),
            tab==='dow'      && h(DOWTab,              { data }),
            tab==='topdays'  && h(TopDaysTab,          { data }),
          ),
    ),
  );
}
