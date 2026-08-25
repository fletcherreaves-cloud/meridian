// @ts-nocheck
import * as React from 'react';
import { sName, STORE_NAMES, INV_ORG_COORDS } from '../constants.js';
import { dKey, businessDate } from '../utils/date.js';
import { fN } from '../utils/fmt.js';
import { metricSeries, dailyDataFreshness } from '../engine/metric-source.js';
import { ModalShell, Z } from '../components/ModalShell.js';
// Dispatch #136 Part 2 -- location scope (LocationSelector, mode:'progressive' per this app's
// standing mobile-usability convention, PanelControls.js). This panel had NO location filtering
// at all before this dispatch.
import { LocationSelector, buildLocationHierarchy, locationSelectorLocs } from '../components/PanelControls.js';

// ExportDropdown lives in store-dash.js -- a 145 KB module (+ the chart.js/auto runtime it
// pulls in) that App.js deliberately keeps OUT of the entry chunk via a dynamic `import()`
// (#232 Finding 3). record-day.js itself IS statically imported by App.js (RecordDayPanel is
// not behind lazyPanel()), so a top-level `import {ExportDropdown} from './store-dash.js'` here
// would drag that whole module back into the entry chunk for every user on every load -- exactly
// the regression #232 fixed elsewhere. React.lazy defers the actual import() to first render of
// this component, which only happens once the panel is open AND has data to export, so the
// entry-chunk footprint stays a small lazy() stub, not the module itself (measured in the PR body).
const LazyExportDropdown = React.lazy(() =>
  import('./store-dash.js').then(m => ({ default: m.ExportDropdown }))
);

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
  return d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
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

// Local 2-decimal dollar formatter, scoped to this file only (dispatch #103: "For Record
// days, use 2 decimals for all dollar and any percents"). `f$` in utils/fmt.js stays at its
// global 0-decimal default -- every OTHER panel that imports `f$` is unaffected by this file.
function f$2(v) { return '$' + (v||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}); }

// Local HTML-escaper for the print report only -- same tiny pattern every other print/export
// builder in this codebase repeats locally (analytics.js, eom-dashboard.js, skills-matrix.js,
// etc.) rather than a shared import, since it's a two-line function, not a module.
function esc(s) { return String(s==null?'':s).replace(/[&<>]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }

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
  if (!ds?.loaded) return null;

  // Most recent date across ALL core daily streams (not just laborRows) → reference for
  // window, via the shared cross-stream freshness helper.
  const dataEnd = dailyDataFreshness(ds);
  if (!dataEnd) return null;
  const windowStart = new Date(dataEnd.getTime() - windowDays * 86400000);

  // Same-day completeness gate (dispatch #103). The CURRENT McDonald's business day (4am
  // cutover -- businessDate() from utils/date.js, the standing shared helper, never
  // re-derived inline here) is still accumulating: the DAR intraday pull only lands a few
  // times a day, so a day-level metric computed from whatever rows happen to be loaded right
  // now can look like a record purely because the rest of the day hasn't landed yet.
  // Reproduced exactly for Tecumseh's 2026-08-24 "95s OEPE record": correct math over an
  // incomplete day (real data only through 15:00), and the two later hours the owner's own
  // export had were both slower -- the true full-day number was very likely worse than 95s.
  // `todayKey` marks that boundary; any `dk >= todayKey` is the still-open day (or, defensively,
  // a clock-skewed future one) and is never allowed to become a CONFIRMED all-time record --
  // it is still computed and shown, but as a visibly separate PROVISIONAL entry (see
  // `tryRecord`/`flagRecent` below), so a fast-but-partial reading can never get merged into
  // and permanently saved as the store's real best (mergeStores/saveMerged persist forever).
  const todayKey = businessDate();

  // Auto-first (data-integrity sweep signature #2) — this used to build its daily map
  // ONLY from ds.laborRows (manual-only), and only ADDED opsRows speed data to a day that
  // already had a laborRows entry — so a Records-worthy day covered solely by an auto/
  // emailed stream (sales via the DAR, speed via Glimpse/DAR) never got an entry at all,
  // and never had a chance to set or break a record.
  // Cap: a single McDonald's daily sales above $80K is almost certainly a
  // period-summary total loaded from Supabase before the isPeriodSummary flag existed.
  const DAILY_SALES_MAX = 80000;
  // Exclude period-summary rows from the laborRows leg only — metric-source.js's other
  // legs (qsrActSummaryRows etc.) never carry period-summary totals in the first place.
  const dsClean = { ...ds, laborRows: (ds.laborRows||[]).filter(r=>!r.isPeriodSummary) };
  const LOCS = ds.storeIds?.length ? ds.storeIds : Object.keys(STORE_NAMES);
  const range = { s:new Date('2000-01-01'), e:dataEnd };

  const days = [];
  for (const loc of LOCS) {
    const salesSeries = metricSeries(dsClean, loc, range, 'sales');
    const dateKeys = Object.keys(salesSeries);
    if (!dateKeys.length) continue;
    const gcSeries    = metricSeries(dsClean, loc, range, 'gc');
    const checkSeries = metricSeries(dsClean, loc, range, 'avgCheck');
    const oepeSeries  = metricSeries(dsClean, loc, range, 'oepe');
    const kvsSeries   = metricSeries(dsClean, loc, range, 'kvst');
    const r2pSeries   = metricSeries(dsClean, loc, range, 'r2p');
    // Breakfast sales has no auto/emailed chain yet — stays manual (laborRows only).
    const bfByDate = {};
    for (const r of (dsClean.laborRows||[])) {
      if (String(r.loc)!==String(loc) || !r.date) continue;
      const dk = dKey(r.date);
      bfByDate[dk] = (bfByDate[dk]||0) + (r.bfSales||0);
    }
    for (const dk of dateKeys) {
      const sales = salesSeries[dk];
      if (sales > DAILY_SALES_MAX) continue;
      const date = new Date(dk+'T12:00:00');
      days.push({
        loc, dk, date, sales,
        gc:     gcSeries[dk]||0,
        bf:     bfByDate[dk]||0,
        avgChk: checkSeries[dk]||null,
        oepe:   oepeSeries[dk]||null,
        kvs:    kvsSeries[dk]||null,
        r2p:    r2pSeries[dk]||null,
        dow:    date.getDay(),
      });
    }
  }

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

  function flagRecent(loc, dk, type, val, prev, isLow=false, isProvisional=false) {
    const dt = new Date(dk + 'T00:00:00');
    if (dt >= windowStart) {
      recentBreakers.push({ loc, dk, type, val, prev, isLow, isProvisional });
    }
  }

  // ONE shared mechanism for every record type (sales/GC/breakfast/avg-check/OEPE/KVS/R2P and
  // their DOW variants), per dispatch #103 -- not six separate same-day patches. `val` beating
  // `best` always surfaces in Recent Breaks (flagRecent), but only a CLOSED day is allowed to
  // commit: the caller only advances its running best-so-far and writes the permanent `rec.*`
  // entry when `tryRecord` returns true AND `isProvisional` is false. A provisional beat is
  // still reported (visibly flagged, distinct from a confirmed record) but the tracker/rec are
  // left exactly as they were, so today's still-accumulating value can never become "the"
  // all-time record and get baked into localStorage by saveMerged.
  function tryRecord(loc, dk, type, val, best, isLow, isProvisional) {
    const beats = isLow ? (val < best) : (val > best);
    if (!beats) return false;
    const prev = isLow ? (best < Infinity ? best : null) : (best > 0 ? best : null);
    flagRecent(loc, dk, type, val, prev, isLow, isProvisional);
    return true;
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
      // Still-open McDonald's business day (or, defensively, a future-dated row) -- a beat
      // here is reported as PROVISIONAL only; the tracker/rec below stay untouched so it can
      // never become the permanent, localStorage-persisted all-time record.
      const isProvisional = dk >= todayKey;

      if (tryRecord(loc,dk,'Sales Day',sales,sMax,false,isProvisional) && !isProvisional)   { sMax=sales;     rec.sales.day={val:sales,dk}; }
      if (tryRecord(loc,dk,'GC Day',gc,gcMax,false,isProvisional) && !isProvisional)         { gcMax=gc;       rec.gc.day={val:gc,dk}; }
      if (tryRecord(loc,dk,'Breakfast Sales',bf,bfMax,false,isProvisional) && !isProvisional) { bfMax=bf;      rec.bf.day={val:bf,dk}; }
      if (avgChk && tryRecord(loc,dk,'Avg Check',avgChk,acMax,false,isProvisional) && !isProvisional) { acMax=avgChk; rec.avgChk.day={val:avgChk,dk}; }
      if (oepe && tryRecord(loc,dk,'OEPE',oepe,oepeBest,true,isProvisional) && !isProvisional) { oepeBest=oepe; rec.speed.oepe={val:oepe,dk}; }
      if (kvs  && tryRecord(loc,dk,'KVS',kvs,kvsBest,true,isProvisional) && !isProvisional)   { kvsBest=kvs;    rec.speed.kvs={val:kvs,dk}; }
      if (r2p  && tryRecord(loc,dk,'R2P',r2p,r2pBest,true,isProvisional) && !isProvisional)   { r2pBest=r2p;    rec.speed.r2p={val:r2p,dk}; }

      // DOW records -- same gate, same shared mechanism.
      if (tryRecord(loc,dk,`DOW Sales (${DOW_SHORT[dow]})`,sales,dowSales[dow],false,isProvisional) && !isProvisional) {
        dowSales[dow]=sales;
        rec.sales.dow[dow]={val:sales,dk};
      }
      if (tryRecord(loc,dk,`DOW GC (${DOW_SHORT[dow]})`,gc,dowGC[dow],false,isProvisional) && !isProvisional) {
        dowGC[dow]=gc;
        rec.gc.dow[dow]={val:gc,dk};
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

  // ── Top days ──────────────────────────────────────────────────────
  const topDays = [...days].sort((a,b)=>b.sales-a.sales).slice(0,20);

  return {
    stores: merged,
    recentBreakers,
    topDays,
    // `days` (every store-day the scan built, unfiltered) is exposed alongside topDays so a
    // location-scoped view (dispatch #136 Part 2) can re-derive a scoped Top Days list -- the
    // district-wide top-20 filtered post-hoc to one store would usually come back near-empty,
    // not "this store's top 20." Same input the district's own topDays came from, just not yet
    // sliced to 20 or district-wide sorted.
    days,
    ...districtHeroes(merged),
    dataEnd, windowDays,
    totalStores: Object.keys(merged).length,
    savedAt: saved?.savedAt,
  };
}

// ── District heroes ────────────────────────────────────────────────────────
// Pure: the single best-in-district value per metric, given a store→record map. Extracted out of
// computeRecords (dispatch #136 Part 2) so a location-scoped view can re-pick district champions
// from a narrowed store set using the EXACT same selection logic, without re-running any of the
// record detection/scoring above it (per the dispatch's "do not touch computeRecords()'s scoring
// logic beyond location filtering" -- this only re-selects a max over already-scored records).
function districtHeroes(storesMap) {
  let distSalesDay  = { val:0, loc:null, dk:null };
  let distSalesWeek = { val:0, loc:null, wdk:null };
  let distSalesMo   = { val:0, loc:null, ym:null };
  let distGCDay     = { val:0, loc:null, dk:null };
  let distOepe      = { val:Infinity, loc:null, dk:null };
  let distKvs       = { val:Infinity, loc:null, dk:null };
  let distR2p       = { val:Infinity, loc:null, dk:null };
  let distAvgChk    = { val:0, loc:null, dk:null };

  for (const [loc, r] of Object.entries(storesMap || {})) {
    if ((r.sales?.day?.val||0)   > distSalesDay.val)  distSalesDay  = {...r.sales.day,   loc};
    if ((r.sales?.week?.val||0)  > distSalesWeek.val) distSalesWeek = {...r.sales.week,  loc};
    if ((r.sales?.month?.val||0) > distSalesMo.val)   distSalesMo   = {...r.sales.month, loc};
    if ((r.gc?.day?.val||0)      > distGCDay.val)     distGCDay     = {...r.gc.day,      loc};
    if ((r.speed?.oepe?.val||Infinity) < distOepe.val) distOepe     = {...r.speed.oepe,  loc};
    if ((r.speed?.kvs?.val||Infinity)  < distKvs.val)  distKvs      = {...r.speed.kvs,   loc};
    if ((r.speed?.r2p?.val||Infinity)  < distR2p.val)  distR2p      = {...r.speed.r2p,   loc};
    if ((r.avgChk?.day?.val||0)  > distAvgChk.val)   distAvgChk    = {...r.avgChk.day,  loc};
  }

  return { distSalesDay, distSalesWeek, distSalesMo, distGCDay, distOepe, distKvs, distR2p, distAvgChk };
}

// ── Location scoping (dispatch #136 Part 2) ─────────────────────────────────
// Pure: narrow a full computeRecords() result to one location scope. `locs` is null for "All
// Locations" (returns `data` unchanged -- no filtering, no re-derivation, byte-identical to
// today's always-full-district behavior). Never touches record detection: `stores` entries are
// already-computed per-store records (computeRecords' own per-store loop is untouched), this
// just picks which of them are in view, re-derives Top Days from the underlying `days` (so a
// single-store scope shows THAT store's top 20, not the district top-20 filtered down to
// whatever few of them happen to be that store's), and re-picks district champions via
// districtHeroes() over the narrowed store set.
function scopeRecordData(data, locs) {
  if (!data || !locs) return data;
  const locSet = new Set(locs.map(String));

  const stores = {};
  for (const [loc, r] of Object.entries(data.stores)) {
    if (locSet.has(String(loc))) stores[loc] = r;
  }
  const recentBreakers = data.recentBreakers.filter(b => locSet.has(String(b.loc)));
  const topDays = [...(data.days || [])]
    .filter(d => locSet.has(String(d.loc)))
    .sort((a,b) => b.sales - a.sales)
    .slice(0, 20);

  return {
    ...data,
    stores,
    recentBreakers,
    topDays,
    ...districtHeroes(stores),
    totalStores: Object.keys(stores).length,
  };
}

// ── Styles ────────────────────────────────────────────────────────────────────

const S = {
  // overlay/panel/hdr (hand-rolled backdrop + close button) removed -- dispatch #130 replaced
  // them with the shared ModalShell (panel-contract conformance; see RecordDayPanel below).
  tabs:    { display:'flex',gap:2,padding:'0 20px',borderBottom:'.5px solid var(--bdr)',flexShrink:0,background:'var(--surf)' },
  tab:     (active) => ({ padding:'10px 16px',fontSize:13,fontWeight:600,cursor:'pointer',border:'none',background:'none',color:active?'var(--acc)':'var(--txt3)',borderBottom:active?'2px solid var(--acc)':'2px solid transparent',transition:'color .15s' }),
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
// Provisional == today's still-open McDonald's business day (dispatch #103) -- a beat here
// is real math but not yet a confirmed all-time record, since the DAR intraday pull hasn't
// landed the rest of the day. Deliberately a distinct color from every type badge above so it
// reads as a status, not another record-type tag.
const BADGE_PROVISIONAL = () => S.badge('#f97316','rgba(249,115,22,.12)');

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

// ── Recent-record highlighting (dispatch #136 Part 2 item 3) ────────────────
// Owner: "highlight recent breaks on any method printed and displayed... highlight, use a new
// record set chip, or something that will look good" -- mechanism deliberately left open.
// Chosen mechanism: a small "🔥 NEW" text+border chip next to any record value that ALSO appears
// in `recentBreakers`, on every tab that shows a record (not just Recent Breaks), plus the same
// chip rendered into the print report's tables. Chosen over a background-tint cell because a
// background-only signal doesn't survive print by default (dispatch #129's own finding --
// print-color-adjust defaults to 'economy', unset anywhere in this codebase); a chip built from
// real glyphs/text/border prints exactly as it displays, with no extra CSS required.
//
// "Recent" is NOT a second definition -- it's a lookup straight off `recentBreakers`, which is
// already exactly "beat within windowDays of the freshest data" (RecentBreakersTab's own,
// existing control). Keyed on loc|type|dk using the SAME date-key flagRecent used when it
// created the entry (day dk, week wdk, or month ym+'-01' -- see the day/week/month flagRecent
// calls above), so a chip lights up only for the exact record cell that broke within the window.
function buildBreakIndex(recentBreakers) {
  const set = new Set();
  for (const b of (recentBreakers || [])) set.add(`${b.loc}|${b.type}|${b.dk}`);
  return set;
}
function isRecentBreak(idx, loc, type, dk) {
  return !!dk && idx.has(`${loc}|${type}|${dk}`);
}
const CHIP_STYLE = { display:'inline-flex', alignItems:'center', fontSize:9, fontWeight:800,
  color:'#f59e0b', border:'1.5px solid #f59e0b', borderRadius:4, padding:'0 4px', marginLeft:5,
  whiteSpace:'nowrap', verticalAlign:'middle', lineHeight:'14px' };
function RecentBreakChip({ show }) {
  return show ? span({ style:CHIP_STYLE, title:'Broken within the current Recent Breaks window' }, '🔥 NEW') : null;
}
// Print-report equivalent -- same glyph/border chip, inline HTML (no meridian.css available in
// the print window).
function chipHtml(show) {
  return show ? ' <span style="display:inline-block;font-size:9px;font-weight:800;color:#b45309;border:1.5px solid #b45309;border-radius:4px;padding:0 4px;margin-left:4px;white-space:nowrap">🔥 NEW</span>' : '';
}

// ── Hero Grid ─────────────────────────────────────────────────────────────────

function HeroCard({ label, val, sub, broken }) {
  return div({ style:S.heroCard },
    div({ style:S.heroLbl }, label),
    div({ style:S.heroVal }, val || '—', h(RecentBreakChip, { show:broken })),
    div({ style:S.heroSub }, sub || ''),
  );
}

function HeroGrid({ data, breakIndex }) {
  const { distSalesDay, distSalesWeek, distSalesMo, distGCDay, distOepe, distKvs, distR2p, distAvgChk } = data;
  const brk = (loc, type, dk) => isRecentBreak(breakIndex, loc, type, dk);
  return div({},
    div({ style:S.sLbl }, 'District All-Time Champions'),
    div({ style:S.heroGrid },
      h(HeroCard,{ label:'🏆 Best Day Sales',  val:distSalesDay?.val?f$2(distSalesDay.val):'—',  sub:distSalesDay?.loc?`${sName(distSalesDay.loc)} · ${fDate(distSalesDay.dk)}`:'', broken:brk(distSalesDay?.loc,'Sales Day',distSalesDay?.dk) }),
      h(HeroCard,{ label:'📅 Best Week Sales',  val:distSalesWeek?.val?f$2(distSalesWeek.val):'—', sub:distSalesWeek?.loc?`${sName(distSalesWeek.loc)} · ${fWeekLabel(distSalesWeek.wdk)}`:'', broken:brk(distSalesWeek?.loc,'Sales Week',distSalesWeek?.wdk) }),
      h(HeroCard,{ label:'📊 Best Month Sales', val:distSalesMo?.val?f$2(distSalesMo.val):'—',    sub:distSalesMo?.loc?`${sName(distSalesMo.loc)} · ${fMonthLabel(distSalesMo.ym)}`:'', broken:brk(distSalesMo?.loc,'Sales Month',distSalesMo?.ym?distSalesMo.ym+'-01':null) }),
      h(HeroCard,{ label:'👥 Best GC Day',      val:distGCDay?.val?fGC(distGCDay.val):'—',       sub:distGCDay?.loc?`${sName(distGCDay.loc)} · ${fDate(distGCDay.dk)}`:'', broken:brk(distGCDay?.loc,'GC Day',distGCDay?.dk) }),
    ),
    div({ style:{ ...S.heroGrid, marginTop:12 } },
      h(HeroCard,{ label:'⚡ Best OEPE',    val:distOepe?.val<Infinity?fSec(distOepe.val):'—',  sub:distOepe?.loc?`${sName(distOepe.loc)} · ${fDate(distOepe.dk)}`:'', broken:brk(distOepe?.loc,'OEPE',distOepe?.dk) }),
      h(HeroCard,{ label:'🍟 Best KVS',     val:distKvs?.val<Infinity?fSec(distKvs.val):'—',   sub:distKvs?.loc?`${sName(distKvs.loc)} · ${fDate(distKvs.dk)}`:'', broken:brk(distKvs?.loc,'KVS',distKvs?.dk) }),
      h(HeroCard,{ label:'📦 Best R2P',     val:distR2p?.val<Infinity?fSec(distR2p.val):'—',   sub:distR2p?.loc?`${sName(distR2p.loc)} · ${fDate(distR2p.dk)}`:'', broken:brk(distR2p?.loc,'R2P',distR2p?.dk) }),
      h(HeroCard,{ label:'💰 Best Avg Check',val:distAvgChk?.val?f$2(distAvgChk.val):'—',       sub:distAvgChk?.loc?`${sName(distAvgChk.loc)} · ${fDate(distAvgChk.dk)}`:'', broken:brk(distAvgChk?.loc,'Avg Check',distAvgChk?.dk) }),
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
                TH({style:S.th},'Record Type'), TH({style:S.th},'Status'),
                TH({style:S.thR},'New Record'),
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
                  : b.type.includes('GC') ? v=>fGC(v) : b.type.includes('Avg Check') ? v=>f$2(v) : v=>f$2(v);
                return tr({ key:i, style:b.isProvisional?{background:'rgba(249,115,22,.06)'}:null },
                  td({style:S.td}, sName(b.loc)),
                  td({style:S.td},
                    b.type.includes('Week') ? fWeekLabel(b.dk) :
                    b.type.includes('Month') ? fMonthLabel(b.dk) : fDate(b.dk),
                  ),
                  td({style:S.td}, span({style:badgeForType(b.type)}, b.type)),
                  td({style:S.td},
                    b.isProvisional
                      ? span({ style:BADGE_PROVISIONAL(), title:'Today\'s business day is still in progress -- the DAR intraday pull hasn\'t landed the rest of the day yet, so this number can still change (and may not hold up) once the day closes.' }, '⏳ Provisional — still accumulating')
                      : span({ style:S.badge('#10b981','rgba(16,185,129,.08)'), title:'Closed business day -- data is final.' }, '✓ Confirmed'),
                  ),
                  td({style:{...S.tdR,fontWeight:600,color:b.isProvisional?'#f97316':'var(--acc)'}}, fVal(b.val)),
                  td({style:S.tdMR}, b.prev!=null ? fVal(b.prev) : span({style:{color:'var(--txt3)'}}, 'first record')),
                  td({style:{...S.tdR,color:impr!=null?'#10b981':'var(--txt3)'}},
                    impr!=null ? `+${impr.toFixed(2)}%${b.isProvisional?' so far':''}` : '—'),
                );
              }),
            ),
          ),
        ),
  );
}

// ── Sales & Volume tab ────────────────────────────────────────────────────────

function SalesVolumeTab({ data, breakIndex }) {
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
                td({style:{...S.tdR,fontWeight:600,color:sortKey==='salesDay'?'var(--acc)':'var(--txt)'}}, r.sales?.day?.val?f$2(r.sales.day.val):'—', h(RecentBreakChip,{show:isRecentBreak(breakIndex,loc,'Sales Day',r.sales?.day?.dk)})),
                td({style:S.tdM}, fDateShort(r.sales?.day?.dk)),
                td({style:{...S.tdR,color:sortKey==='salesWeek'?'var(--acc)':'var(--txt)'}}, r.sales?.week?.val?f$2(r.sales.week.val):'—', h(RecentBreakChip,{show:isRecentBreak(breakIndex,loc,'Sales Week',r.sales?.week?.wdk)})),
                td({style:S.tdM}, r.sales?.week?.wdk?fDateShort(r.sales.week.wdk):'—'),
                td({style:{...S.tdR,color:sortKey==='salesMonth'?'var(--acc)':'var(--txt)'}}, r.sales?.month?.val?f$2(r.sales.month.val):'—', h(RecentBreakChip,{show:isRecentBreak(breakIndex,loc,'Sales Month',r.sales?.month?.ym?r.sales.month.ym+'-01':null)})),
                td({style:S.tdM}, fMonthLabel(r.sales?.month?.ym)),
                td({style:{...S.tdR,color:sortKey==='bf'?'var(--acc)':'var(--txt)'}}, r.bf?.day?.val?f$2(r.bf.day.val):'—', h(RecentBreakChip,{show:isRecentBreak(breakIndex,loc,'Breakfast Sales',r.bf?.day?.dk)})),
                td({style:{...S.tdR,color:sortKey==='avgChk'?'var(--acc)':'var(--txt)'}}, r.avgChk?.day?.val?f$2(r.avgChk.day.val):'—', h(RecentBreakChip,{show:isRecentBreak(breakIndex,loc,'Avg Check',r.avgChk?.day?.dk)})),
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
                td({style:{...S.tdR,fontWeight:600,color:sortKey==='gcDay'?'var(--acc)':'var(--txt)'}}, r.gc?.day?.val?fGC(r.gc.day.val):'—', h(RecentBreakChip,{show:isRecentBreak(breakIndex,loc,'GC Day',r.gc?.day?.dk)})),
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

function SpeedTab({ data, breakIndex }) {
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
              td({style:{...S.tdR,fontWeight:600,color:sortKey==='oepe'?'var(--acc)':'var(--txt)'}}, oepe?.val?fSec(oepe.val):'—', h(RecentBreakChip,{show:isRecentBreak(breakIndex,loc,'OEPE',oepe?.dk)})),
              td({style:S.tdM}, fDateShort(oepe?.dk)),
              td({style:{...S.tdR,color:sortKey==='kvs'?'var(--acc)':'var(--txt)'}},  kvs?.val?fSec(kvs.val):'—', h(RecentBreakChip,{show:isRecentBreak(breakIndex,loc,'KVS',kvs?.dk)})),
              td({style:S.tdM}, fDateShort(kvs?.dk)),
              td({style:{...S.tdR,color:sortKey==='r2p'?'var(--acc)':'var(--txt)'}},  r2p?.val?fSec(r2p.val):'—', h(RecentBreakChip,{show:isRecentBreak(breakIndex,loc,'R2P',r2p?.dk)})),
              td({style:S.tdM}, fDateShort(r2p?.dk)),
            );
          }),
        ),
      ),
    ),
  );
}

// ── Day of Week tab ───────────────────────────────────────────────────────────

function DOWTab({ data, breakIndex }) {
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
                    metric==='sales'?f$2(r.val):fGC(r.val),
                    h(RecentBreakChip,{show:isRecentBreak(breakIndex,r.loc,`DOW ${metric==='sales'?'Sales':'GC'} (${DOW_SHORT[dow]})`,r.dk)})),
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

function TopDaysTab({ data, breakIndex }) {
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
              td({style:{...S.tdR,fontWeight:600,color:i===0?'var(--acc)':'var(--txt)'}}, f$2(d.sales), h(RecentBreakChip,{show:isRecentBreak(breakIndex,d.loc,'Sales Day',d.dk)})),
              td({style:S.tdR}, d.gc?fGC(d.gc):'—'),
            ),
          ),
        ),
      ),
    ),
  );
}

// ── CSV/Excel export (per current tab) ─────────────────────────────────────────
//
// Design call (dispatch #130): reuse the shared ExportDropdown for a TAB-SCOPED CSV/JSON
// export (so a click from Speed genuinely produces speed rows, not sales rows -- what the
// dispatch's verification bar checks) and keep the district-wide multi-tab document as a
// SEPARATE "Print Report" action (buildFullReportHtml below), because the two serve different
// jobs: a spreadsheet of one table vs. a single "look what we hit" document meant to be shared/
// posted. Doesn't thread each tab's own internal sort/filter state through (SalesVolumeTab's
// sortKey, RecentBreakersTab's chip filter, DOWTab's day/metric picker) -- the export is the
// tab's FULL underlying dataset, a superset of whatever the on-screen sort/filter happens to be,
// which keeps this presentation-only change from having to lift four separate pieces of local
// UI state out of their tab components.
function tabExportSpec(tab, data, windowDays) {
  const today = new Date().toISOString().slice(0,10);
  if (!data) return { rows:[], columns:[], title:'Record Day Intelligence', filename:`record-day-${today}` };

  if (tab === 'recent') {
    const rows = data.recentBreakers.map(b => {
      const dateStr = b.type.includes('Week') ? fWeekLabel(b.dk) : b.type.includes('Month') ? fMonthLabel(b.dk) : fDate(b.dk);
      const fVal = b.isLow ? fSec : b.type.includes('GC') ? fGC : f$2;
      const impr = b.prev!=null ? (b.isLow ? (b.prev-b.val)/b.prev*100 : (b.val-b.prev)/b.prev*100) : null;
      return {
        Store: sName(b.loc), Date: dateStr, 'Record Type': b.type,
        Status: b.isProvisional ? 'Provisional' : 'Confirmed',
        'New Record': fVal(b.val),
        'Previous Best': b.prev!=null ? fVal(b.prev) : 'first record',
        'Change %': impr!=null ? `+${impr.toFixed(2)}%${b.isProvisional?' so far':''}` : '—',
      };
    });
    return { rows, columns:['Store','Date','Record Type','Status','New Record','Previous Best','Change %'].map(k=>({key:k,label:k})),
      title:`Record Breaks — Last ${windowDays} Days`, filename:`record-day-recent-breaks-${windowDays}d-${today}` };
  }

  if (tab === 'speed') {
    const locs = Object.keys(data.stores).sort((a,b) => (data.stores[a].speed?.oepe?.val||Infinity) - (data.stores[b].speed?.oepe?.val||Infinity));
    const rows = locs.map(loc => {
      const r = data.stores[loc];
      return {
        Store: sName(loc),
        'Best OEPE': r.speed?.oepe?.val ? fSec(r.speed.oepe.val) : '—', 'OEPE Date': fDateShort(r.speed?.oepe?.dk),
        'Best KVS':  r.speed?.kvs?.val  ? fSec(r.speed.kvs.val)  : '—', 'KVS Date':  fDateShort(r.speed?.kvs?.dk),
        'Best R2P':  r.speed?.r2p?.val  ? fSec(r.speed.r2p.val)  : '—', 'R2P Date':  fDateShort(r.speed?.r2p?.dk),
      };
    });
    return { rows, columns:['Store','Best OEPE','OEPE Date','Best KVS','KVS Date','Best R2P','R2P Date'].map(k=>({key:k,label:k})),
      title:'Speed of Service Records by Store', filename:`record-day-speed-${today}` };
  }

  if (tab === 'dow') {
    const rows = [];
    for (const loc of Object.keys(data.stores)) {
      const r = data.stores[loc];
      for (let i=0;i<7;i++) {
        const s = r.sales?.dow?.[i], g = r.gc?.dow?.[i];
        if (!s?.val && !g?.val) continue;
        rows.push({
          Store: sName(loc), Day: DOW_NAMES[i],
          'Best Sales': s?.val ? f$2(s.val) : '—', 'Sales Date': s?.dk ? fDate(s.dk) : '—',
          'Best GC': g?.val ? fGC(g.val) : '—', 'GC Date': g?.dk ? fDate(g.dk) : '—',
        });
      }
    }
    return { rows, columns:['Store','Day','Best Sales','Sales Date','Best GC','GC Date'].map(k=>({key:k,label:k})),
      title:'Best Day-of-Week Records — All Stores', filename:`record-day-dow-${today}` };
  }

  if (tab === 'topdays') {
    const rows = data.topDays.map((d,i) => ({ Rank:i+1, Store:sName(d.loc), Date:fDate(d.dk), Sales:f$2(d.sales), GC:d.gc?fGC(d.gc):'—' }));
    return { rows, columns:['Rank','Store','Date','Sales','GC'].map(k=>({key:k,label:k})),
      title:`District Top ${data.topDays.length} Sales Days — All Time`, filename:`record-day-top-days-${today}` };
  }

  if (tab === 'sales') {
    const locs = Object.keys(data.stores).sort((a,b) => (data.stores[b].sales?.day?.val||0) - (data.stores[a].sales?.day?.val||0));
    const rows = locs.map(loc => {
      const r = data.stores[loc];
      return {
        Store: sName(loc),
        'Best Day Sales': r.sales?.day?.val ? f$2(r.sales.day.val) : '—', 'Day Date': fDateShort(r.sales?.day?.dk),
        'Best Week Sales': r.sales?.week?.val ? f$2(r.sales.week.val) : '—', 'Week Of': r.sales?.week?.wdk ? fDateShort(r.sales.week.wdk) : '—',
        'Best Month Sales': r.sales?.month?.val ? f$2(r.sales.month.val) : '—', Month: fMonthLabel(r.sales?.month?.ym),
        'Best Breakfast Day': r.bf?.day?.val ? f$2(r.bf.day.val) : '—',
        'Best Avg Check': r.avgChk?.day?.val ? f$2(r.avgChk.day.val) : '—',
        'Best GC Day': r.gc?.day?.val ? fGC(r.gc.day.val) : '—', 'GC Day Date': fDateShort(r.gc?.day?.dk),
        'Best GC Week': r.gc?.week?.val ? fGC(r.gc.week.val) : '—', 'GC Week Of': r.gc?.week?.wdk ? fDateShort(r.gc.week.wdk) : '—',
        'Best GC Month': r.gc?.month?.val ? fGC(r.gc.month.val) : '—', 'GC Month': fMonthLabel(r.gc?.month?.ym),
      };
    });
    return { rows, columns:['Store','Best Day Sales','Day Date','Best Week Sales','Week Of','Best Month Sales','Month',
      'Best Breakfast Day','Best Avg Check','Best GC Day','GC Day Date','Best GC Week','GC Week Of','Best GC Month','GC Month'].map(k=>({key:k,label:k})),
      title:'Sales & Volume Records by Store', filename:`record-day-sales-${today}` };
  }

  // 'overview' (and any unrecognized tab) -- district champions, the same set HeroGrid renders.
  const rows = [
    { Metric:'Best Day Sales',   Value: data.distSalesDay.val?f$2(data.distSalesDay.val):'—',   Store: data.distSalesDay.loc?sName(data.distSalesDay.loc):'—',  'Date / Period': data.distSalesDay.loc?fDate(data.distSalesDay.dk):'—' },
    { Metric:'Best Week Sales',  Value: data.distSalesWeek.val?f$2(data.distSalesWeek.val):'—', Store: data.distSalesWeek.loc?sName(data.distSalesWeek.loc):'—','Date / Period': data.distSalesWeek.loc?fWeekLabel(data.distSalesWeek.wdk):'—' },
    { Metric:'Best Month Sales', Value: data.distSalesMo.val?f$2(data.distSalesMo.val):'—',     Store: data.distSalesMo.loc?sName(data.distSalesMo.loc):'—',    'Date / Period': data.distSalesMo.loc?fMonthLabel(data.distSalesMo.ym):'—' },
    { Metric:'Best GC Day',      Value: data.distGCDay.val?fGC(data.distGCDay.val):'—',         Store: data.distGCDay.loc?sName(data.distGCDay.loc):'—',        'Date / Period': data.distGCDay.loc?fDate(data.distGCDay.dk):'—' },
    { Metric:'Best OEPE',        Value: data.distOepe.val<Infinity?fSec(data.distOepe.val):'—', Store: data.distOepe.loc?sName(data.distOepe.loc):'—',          'Date / Period': data.distOepe.loc?fDate(data.distOepe.dk):'—' },
    { Metric:'Best KVS',         Value: data.distKvs.val<Infinity?fSec(data.distKvs.val):'—',   Store: data.distKvs.loc?sName(data.distKvs.loc):'—',            'Date / Period': data.distKvs.loc?fDate(data.distKvs.dk):'—' },
    { Metric:'Best R2P',         Value: data.distR2p.val<Infinity?fSec(data.distR2p.val):'—',   Store: data.distR2p.loc?sName(data.distR2p.loc):'—',            'Date / Period': data.distR2p.loc?fDate(data.distR2p.dk):'—' },
    { Metric:'Best Avg Check',   Value: data.distAvgChk.val?f$2(data.distAvgChk.val):'—',       Store: data.distAvgChk.loc?sName(data.distAvgChk.loc):'—',      'Date / Period': data.distAvgChk.loc?fDate(data.distAvgChk.dk):'—' },
  ];
  return { rows, columns:['Metric','Value','Store','Date / Period'].map(k=>({key:k,label:k})),
    title:'Record Day Intelligence — District Champions', filename:`record-day-overview-${today}` };
}

// ── Full district print report (all 6 tabs, one document) ──────────────────────
//
// Design call (dispatch #130): a full multi-tab document, not a per-tab print. This panel is
// explicitly a "look what we hit" trophy report (owner's framing) -- the kind of thing that gets
// shared/posted whole, not consulted one tab at a time the way an operational panel (e.g. Needs
// Attention) is. StoreOnePager's generateAndPrint (analytics.js) is the precedent this follows:
// build one self-contained HTML document, open it in a new tab via window.open, give it its own
// Print button (window.print()) and @media print rules, rather than printing the live app DOM.
function reportTable(headers, rows) {
  if (!rows.length) return '<p style="color:#9ca3af;font-size:12px;padding:8px 0">No data.</p>';
  return `<table style="width:100%;border-collapse:collapse;font-size:11px">
    <thead><tr>${headers.map(h=>`<th style="padding:6px 10px;text-align:left;font-size:10px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.04em;border-bottom:2px solid #e5e7eb;background:#f8fafc">${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r,i)=>`<tr style="background:${i%2?'#fff':'#fafafa'}">${r.map(c=>`<td style="padding:5px 10px;border-bottom:1px solid #f1f5f9;color:#111">${c}</td>`).join('')}</tr>`).join('')}</tbody>
  </table>`;
}

function reportSection(title, bodyHtml) {
  return `<div style="padding:20px 32px;border-top:1px solid #e5e7eb">
    <div style="font-size:11px;font-weight:700;letter-spacing:.06em;color:#6b7280;text-transform:uppercase;margin-bottom:12px">${esc(title)}</div>
    ${bodyHtml}
  </div>`;
}

function buildFullReportHtml(data, windowDays) {
  const now = new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});
  const through = fDate(dKey(data.dataEnd));
  // Dispatch #136 Part 2 item 3 -- the SAME recent-break lookup the on-screen tabs use (see
  // buildBreakIndex above), so the print report's "🔥 NEW" chip lights up on exactly the same
  // cells the live panel highlights, not a second recency rule.
  const idx = buildBreakIndex(data.recentBreakers);

  const heroCard = (label, val, sub, chip) => `<div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:12px 14px">
    <div style="font-size:10px;font-weight:700;letter-spacing:.06em;color:#6b7280;text-transform:uppercase;margin-bottom:5px">${esc(label)}</div>
    <div style="font-size:17px;font-weight:800;color:#0f172a;margin-bottom:2px">${val||'—'}${chip||''}</div>
    <div style="font-size:10px;color:#6b7280">${esc(sub||'')}</div>
  </div>`;
  const heroSection = `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:10px">
      ${heroCard('🏆 Best Day Sales', data.distSalesDay.val?f$2(data.distSalesDay.val):'—', data.distSalesDay.loc?`${sName(data.distSalesDay.loc)} · ${fDate(data.distSalesDay.dk)}`:'', chipHtml(isRecentBreak(idx,data.distSalesDay.loc,'Sales Day',data.distSalesDay.dk)))}
      ${heroCard('📅 Best Week Sales', data.distSalesWeek.val?f$2(data.distSalesWeek.val):'—', data.distSalesWeek.loc?`${sName(data.distSalesWeek.loc)} · ${fWeekLabel(data.distSalesWeek.wdk)}`:'', chipHtml(isRecentBreak(idx,data.distSalesWeek.loc,'Sales Week',data.distSalesWeek.wdk)))}
      ${heroCard('📊 Best Month Sales', data.distSalesMo.val?f$2(data.distSalesMo.val):'—', data.distSalesMo.loc?`${sName(data.distSalesMo.loc)} · ${fMonthLabel(data.distSalesMo.ym)}`:'', chipHtml(isRecentBreak(idx,data.distSalesMo.loc,'Sales Month',data.distSalesMo.ym?data.distSalesMo.ym+'-01':null)))}
      ${heroCard('👥 Best GC Day', data.distGCDay.val?fGC(data.distGCDay.val):'—', data.distGCDay.loc?`${sName(data.distGCDay.loc)} · ${fDate(data.distGCDay.dk)}`:'', chipHtml(isRecentBreak(idx,data.distGCDay.loc,'GC Day',data.distGCDay.dk)))}
    </div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">
      ${heroCard('⚡ Best OEPE', data.distOepe.val<Infinity?fSec(data.distOepe.val):'—', data.distOepe.loc?`${sName(data.distOepe.loc)} · ${fDate(data.distOepe.dk)}`:'', chipHtml(isRecentBreak(idx,data.distOepe.loc,'OEPE',data.distOepe.dk)))}
      ${heroCard('🍟 Best KVS', data.distKvs.val<Infinity?fSec(data.distKvs.val):'—', data.distKvs.loc?`${sName(data.distKvs.loc)} · ${fDate(data.distKvs.dk)}`:'', chipHtml(isRecentBreak(idx,data.distKvs.loc,'KVS',data.distKvs.dk)))}
      ${heroCard('📦 Best R2P', data.distR2p.val<Infinity?fSec(data.distR2p.val):'—', data.distR2p.loc?`${sName(data.distR2p.loc)} · ${fDate(data.distR2p.dk)}`:'', chipHtml(isRecentBreak(idx,data.distR2p.loc,'R2P',data.distR2p.dk)))}
      ${heroCard('💰 Best Avg Check', data.distAvgChk.val?f$2(data.distAvgChk.val):'—', data.distAvgChk.loc?`${sName(data.distAvgChk.loc)} · ${fDate(data.distAvgChk.dk)}`:'', chipHtml(isRecentBreak(idx,data.distAvgChk.loc,'Avg Check',data.distAvgChk.dk)))}
    </div>`;

  const recentRows = data.recentBreakers.map(b => {
    const dateStr = b.type.includes('Week') ? fWeekLabel(b.dk) : b.type.includes('Month') ? fMonthLabel(b.dk) : fDate(b.dk);
    const fVal = b.isLow ? fSec : b.type.includes('GC') ? fGC : f$2;
    const impr = b.prev!=null ? (b.isLow ? (b.prev-b.val)/b.prev*100 : (b.val-b.prev)/b.prev*100) : null;
    return [esc(sName(b.loc)), esc(dateStr), esc(b.type), b.isProvisional?'⏳ Provisional':'✓ Confirmed',
      `<b>${fVal(b.val)}</b>`, b.prev!=null?fVal(b.prev):'first record',
      impr!=null?`+${impr.toFixed(2)}%${b.isProvisional?' so far':''}`:'—'];
  });

  const salesLocs = Object.keys(data.stores).sort((a,b) => (data.stores[b].sales?.day?.val||0) - (data.stores[a].sales?.day?.val||0));
  const salesRows = salesLocs.map(loc => {
    const r = data.stores[loc];
    return [esc(sName(loc)), (r.sales?.day?.val?`<b>${f$2(r.sales.day.val)}</b>`:'—')+chipHtml(isRecentBreak(idx,loc,'Sales Day',r.sales?.day?.dk)), fDateShort(r.sales?.day?.dk),
      (r.sales?.week?.val?f$2(r.sales.week.val):'—')+chipHtml(isRecentBreak(idx,loc,'Sales Week',r.sales?.week?.wdk)), r.sales?.week?.wdk?fDateShort(r.sales.week.wdk):'—',
      (r.sales?.month?.val?f$2(r.sales.month.val):'—')+chipHtml(isRecentBreak(idx,loc,'Sales Month',r.sales?.month?.ym?r.sales.month.ym+'-01':null)), fMonthLabel(r.sales?.month?.ym)];
  });
  const gcRows = salesLocs.map(loc => {
    const r = data.stores[loc];
    return [esc(sName(loc)), (r.gc?.day?.val?`<b>${fGC(r.gc.day.val)}</b>`:'—')+chipHtml(isRecentBreak(idx,loc,'GC Day',r.gc?.day?.dk)), fDateShort(r.gc?.day?.dk),
      r.gc?.week?.val?fGC(r.gc.week.val):'—', r.gc?.week?.wdk?fDateShort(r.gc.week.wdk):'—',
      r.gc?.month?.val?fGC(r.gc.month.val):'—', fMonthLabel(r.gc?.month?.ym)];
  });

  const speedLocs = Object.keys(data.stores).sort((a,b) => (data.stores[a].speed?.oepe?.val||Infinity) - (data.stores[b].speed?.oepe?.val||Infinity));
  const speedRows = speedLocs.map(loc => {
    const r = data.stores[loc];
    return [esc(sName(loc)), (r.speed?.oepe?.val?`<b>${fSec(r.speed.oepe.val)}</b>`:'—')+chipHtml(isRecentBreak(idx,loc,'OEPE',r.speed?.oepe?.dk)), fDateShort(r.speed?.oepe?.dk),
      (r.speed?.kvs?.val?fSec(r.speed.kvs.val):'—')+chipHtml(isRecentBreak(idx,loc,'KVS',r.speed?.kvs?.dk)), fDateShort(r.speed?.kvs?.dk),
      (r.speed?.r2p?.val?fSec(r.speed.r2p.val):'—')+chipHtml(isRecentBreak(idx,loc,'R2P',r.speed?.r2p?.dk)), fDateShort(r.speed?.r2p?.dk)];
  });

  // District DOW leaders — the #1 store per day-of-week, not the full store×day matrix (that
  // full breakdown is what the CSV/Excel export is for; the print report stays print-length).
  const dowRows = DOW_NAMES.map((name,i) => {
    let best = null;
    for (const [loc,r] of Object.entries(data.stores)) {
      const v = r.sales?.dow?.[i];
      if (v?.val && (!best || v.val > best.val)) best = { ...v, loc };
    }
    return [esc(name), best?esc(sName(best.loc)):'—',
      best?`<b>${f$2(best.val)}</b>`+chipHtml(isRecentBreak(idx,best.loc,`DOW Sales (${DOW_SHORT[i]})`,best.dk)):'—',
      best?fDate(best.dk):'—'];
  });

  const topRows = data.topDays.map((d,i) => [i+1, esc(sName(d.loc)), fDate(d.dk),
    `<b>${f$2(d.sales)}</b>`+chipHtml(isRecentBreak(idx,d.loc,'Sales Day',d.dk)), d.gc?fGC(d.gc):'—']);

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Record Day Intelligence — District Report</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&family=JetBrains+Mono:wght@400;700&display=swap');
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Inter',sans-serif;background:#f8fafc;color:#111;font-size:13px}
  @media print{
    body{background:white}
    .no-print{display:none!important}
    .page{box-shadow:none!important;margin:0!important;border-radius:0!important;max-width:100%!important}
  }
</style>
</head><body>
<div class="no-print" style="background:#1e293b;padding:12px 24px;display:flex;align-items:center;gap:12px">
  <span style="color:#f59e0b;font-weight:800;font-size:16px">Meridian</span>
  <span style="color:#94a3b8;font-size:13px">Record Day Intelligence — District Report</span>
  <button onclick="window.print()" style="margin-left:auto;background:#f59e0b;border:none;color:#000;padding:7px 20px;border-radius:6px;font-weight:700;cursor:pointer;font-size:13px">🖨 Print / Save as PDF</button>
  <button onclick="window.close()" style="background:transparent;border:1px solid #475569;color:#94a3b8;padding:7px 14px;border-radius:6px;cursor:pointer">Close</button>
</div>
<div class="page" style="max-width:1000px;margin:24px auto;background:white;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,.10);overflow:hidden">
  <div style="background:linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%);padding:28px 32px;color:white">
    <div style="display:flex;justify-content:space-between;align-items:flex-start">
      <div>
        <div style="font-size:11px;letter-spacing:.08em;color:#94a3b8;text-transform:uppercase;margin-bottom:6px">District Report</div>
        <div style="font-size:26px;font-weight:900;letter-spacing:-.5px">🏆 Record Day Intelligence</div>
        <div style="margin-top:8px;font-size:12px;color:#94a3b8">${data.totalStores} stores · data through ${esc(through)} · records accumulate across uploads</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:11px;color:#94a3b8">Recent Breaks Window</div>
        <div style="font-size:16px;font-weight:700;color:#f59e0b">Last ${windowDays} Days</div>
        <div style="font-size:11px;color:#94a3b8;margin-top:4px">Generated ${now}</div>
      </div>
    </div>
  </div>

  ${reportSection('District All-Time Champions', heroSection)}
  ${reportSection(`Record Breaks — Last ${windowDays} Days`, reportTable(['Store','Date','Record Type','Status','New Record','Previous Best','Change %'], recentRows))}
  ${reportSection('Sales Records by Store', reportTable(['Store','Best Day','Date','Best Week','Week Of','Best Month','Month'], salesRows))}
  ${reportSection('Guest Count Records by Store', reportTable(['Store','Best GC Day','Date','Best GC Week','Week Of','Best GC Month','Month'], gcRows))}
  ${reportSection('Speed of Service Records by Store', reportTable(['Store','Best OEPE','Date','Best KVS','Date','Best R2P','Date'], speedRows))}
  ${reportSection('Day-of-Week Sales Leaders — Best Store per Day', reportTable(['Day','Store','Best Sales','Date'], dowRows))}
  ${reportSection(`District Top ${data.topDays.length} Sales Days — All Time`, reportTable(['#','Store','Date','Sales','GC'], topRows))}

  <div style="padding:12px 32px;background:#0f172a;display:flex;justify-content:space-between;align-items:center">
    <span style="color:#f59e0b;font-weight:800;font-size:14px">Meridian</span>
    <span style="color:#475569;font-size:11px">QSR Forecasting & Analytics · Generated ${now} · CONFIDENTIAL</span>
  </div>
</div>
</body></html>`;
  return html;
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
  // Dispatch #136 Part 2 -- location scope (LocationSelector, mode:'progressive'). This panel
  // had no location filtering at all before this dispatch; computeRecords() itself is untouched
  // (still scores every store) -- scoping happens as a pure post-computation filter below
  // (scopeRecordData), per the dispatch's own "very likely a UI-layer filter on top of already
  // store-keyed data, not an engine change" steer.
  const [scope, setScope] = useState({ level:'all', id:null });

  const data = useMemo(() => computeRecords(ds, windowDays), [ds, windowDays, resetKey]);

  const tree = useMemo(() => buildLocationHierarchy(stores, INV_ORG_COORDS, STORE_NAMES), [stores]);
  // null (not tree.locs) for 'all' -- scopeRecordData treats null as "no filtering, return data
  // unchanged" so the common "All Locations" case never pays for a copy/re-derivation it doesn't
  // need, and can never disagree with computeRecords' own output by construction.
  const scopedLocs = useMemo(
    () => (scope.level === 'all' ? null : locationSelectorLocs(scope, tree)),
    [scope, tree]);
  // The one thing every tab, the export, and the print report actually render from. Scoping
  // computeRecords' full result here -- rather than inside it -- is what lets print/export
  // "carry the location scope" for free: they already take `viewData`/`windowDays`, so a scope
  // change reaches them the same render it reaches the screen, no separate plumbing.
  const viewData = useMemo(() => scopeRecordData(data, scopedLocs), [data, scopedLocs]);
  // Dispatch #136 Part 2 item 3 -- one recent-break lookup per render, shared by every tab below
  // (RecentBreakersTab excluded -- every row there already IS a recent break).
  const breakIndex = useMemo(() => buildBreakIndex(viewData?.recentBreakers), [viewData]);

  const handleReset = useCallback(() => {
    clearSaved();
    setConfirmReset(false);
    setResetKey(k => k + 1);
  }, []);

  const recentCount = viewData?.recentBreakers?.length || 0;

  // Per-tab CSV/Excel export spec -- recomputed whenever the active tab, the underlying
  // (now scope-filtered) records, or the Recent Breaks window changes, so an export triggered
  // right after switching tabs, scope, or the window always reflects what's actually on screen,
  // never a stale or unscoped one.
  const exportSpec = useMemo(() => tabExportSpec(tab, viewData, windowDays), [tab, viewData, windowDays]);

  const handlePrintReport = useCallback(() => {
    const html = buildFullReportHtml(viewData, windowDays);
    const w = window.open('', '_blank', 'width=1050,height=850,scrollbars=yes');
    if (w) { w.document.write(html); w.document.close(); }
    else { alert('Allow pop-ups for this page to open the report. Then try again.'); }
  }, [viewData, windowDays]);

  return h(ModalShell, {
    title: 'Record Day Intelligence',
    icon: '🏆',
    onClose,
    maxWidth: 1400,
    zIndex: Z.nested,
    subtitle: viewData
      ? `${viewData.totalStores} stores${scope.level!=='all'?' in scope':''} · data through ${fDate(dKey(viewData.dataEnd))} · records accumulate across uploads`
      : 'Upload sales data to track records',
    headerExtra: div({ style:{ display:'flex',alignItems:'center',gap:8,flexWrap:'wrap' } },
      viewData && h(React.Suspense, { fallback: h('button',{ style:{...S.ghostBtn, opacity:.5}, disabled:true }, '⬇ Export') },
        h(LazyExportDropdown, { btnClassName:undefined, rows:exportSpec.rows, columns:exportSpec.columns, title:exportSpec.title, filename:exportSpec.filename }),
      ),
      viewData && h('button',{ style:S.ghostBtn, onClick:handlePrintReport }, '🖨 Print Report'),
      confirmReset
        ? div({ style:{ display:'flex',alignItems:'center',gap:8,fontSize:12 } },
            span({ style:{color:'var(--txt3)'} }, 'Reset all saved records?'),
            h('button',{ style:S.dangerBtn, onClick:handleReset }, 'Yes, reset'),
            h('button',{ style:S.ghostBtn, onClick:()=>setConfirmReset(false) }, 'Cancel'),
          )
        : h('button',{ style:S.dangerBtn, onClick:()=>setConfirmReset(true) }, 'Reset Records'),
    ),
    subHeader: div({},
      (stores && stores.length > 0) && div({ style:{ padding:'8px 20px 6px', borderBottom:'.5px solid var(--bdr)' } },
        h(LocationSelector, { stores, invOrgCoords:INV_ORG_COORDS, storeNames:STORE_NAMES, value:scope, onChange:setScope, mode:'progressive' })),
      div({ style:S.tabs },
        ...TABS.map(t =>
          h('button',{ key:t.key, style:S.tab(tab===t.key), onClick:()=>setTab(t.key) },
            t.label + (t.key==='recent' && recentCount ? ` (${recentCount})` : ''),
          ),
        ),
      ),
    ),
    bodyStyle: viewData
      ? { padding:'20px 24px', display:'flex', flexDirection:'column', gap:22 }
      : { display:'flex', alignItems:'center', justifyContent:'center' },
  },
    !viewData && div({ style:{ color:'var(--txt3)', fontSize:14 } },
      'No sales data loaded. Upload your data to begin tracking records.'),
    viewData && viewData.totalStores===0 && div({ style:{ color:'var(--txt3)', fontSize:13, padding:'8px 0' } },
      'No stores in this scope have record data yet.'),
    viewData && viewData.totalStores>0 && tab==='overview' && h(HeroGrid, { data:viewData, breakIndex }),
    viewData && viewData.totalStores>0 && tab==='recent'   && h(RecentBreakersTab, { data:viewData, windowDays, onWindowChange:setWindowDays }),
    viewData && viewData.totalStores>0 && tab==='sales'    && h(SalesVolumeTab,     { data:viewData, breakIndex }),
    viewData && viewData.totalStores>0 && tab==='speed'    && h(SpeedTab,            { data:viewData, breakIndex }),
    viewData && viewData.totalStores>0 && tab==='dow'      && h(DOWTab,              { data:viewData, breakIndex }),
    viewData && viewData.totalStores>0 && tab==='topdays'  && h(TopDaysTab,          { data:viewData, breakIndex }),
  );
}
