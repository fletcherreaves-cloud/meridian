// @ts-nocheck
import * as React from 'react';
import { dKey } from '../utils/date.js';
import { bLocIdx } from '../engine/forecast.js';
import { analyzeRegisterAudit } from '../utils/register-audit.js';
import { DEF_SETTINGS } from '../constants.js';

// ErrorBoundary React class component
class ErrorBoundary extends React.Component {
  constructor(p){super(p);this.state={err:null};}
  static getDerivedStateFromError(e){return{err:e};}
  componentDidCatch(e,i){console.error('Meridian error:',e,e?.cause||'',i);}
  render(){
    if(this.state.err){
      const e=this.state.err;
      const cause=e?.cause;
      return h('div',{style:{padding:40,fontFamily:'monospace',background:'#090e18',color:'#e2e8f0',minHeight:'100vh'}},
        h('div',{style:{color:'#f59e0b',fontSize:20,fontWeight:700,marginBottom:16}},'⚠ Meridian — Runtime Error'),
        h('div',{style:{color:'#f87171',fontSize:13,marginBottom:8}},e.message),
        cause&&h('div',{style:{color:'#fb923c',fontSize:12,marginBottom:12}},'Caused by: '+(cause.message||String(cause))),
        h('pre',{style:{color:'#64748b',fontSize:11,marginBottom:20,whiteSpace:'pre-wrap'}},e.stack||''),
        h('button',{onClick:()=>this.setState({err:null}),style:{padding:'8px 16px',background:'#f59e0b',border:'none',borderRadius:6,cursor:'pointer',fontWeight:600}},'Try to recover'),
      );
    }
    return this.props.children;
  }
}

// SECTION 7: REACT HELPERS (plain createElement)
const {useState, useEffect, useCallback, useMemo, useRef} = React;
const h = React.createElement;

// shorthand element factories
const div  = (props, ...c) => h('div',  props, ...c);
const span = (props, ...c) => h('span', props, ...c);
const btn  = (props, ...c) => h('button', props, ...c);
const inp  = (props)       => h('input',  props);
const sel  = (props, ...c) => h('select', props, ...c);
const opt  = (props, ...c) => h('option', props, ...c);
const td   = (props, ...c) => h('td',    props, ...c);
const th   = (props, ...c) => h('th',    props, ...c);
const tr   = (props, ...c) => h('tr',    props, ...c);
const tbl  = (props, ...c) => h('table', props, ...c);



// SECTION 8: DATE RANGE PICKER





function mfExportSession(ds, onMsg) {
  if(!ds||!ds.loaded){if(onMsg)onMsg('⚠ No data loaded to save');return;}
  const ROW_KEYS=['laborRows','opsRows','ctrlRows','fobRows','weatherRows',
    'peaksSvcRows','peaksSalesRows','auditRows','trendsRows'];
  const serR=function(rows){return (rows||[]).map(function(r){return r.date instanceof Date?Object.assign({},r,{date:r.date.toISOString()}):r;});};
  const serLA=function(la){var o={};for(var k in la||{}){var d=la[k];o[k]=d instanceof Date?d.toISOString():d;}return o;};
  var dsExp={storeIds:ds.storeIds,loaded:ds.loaded,records:ds.records,targets:ds.targets,
    lastActual:serLA(ds.lastActual)};
  ROW_KEYS.forEach(function(k){dsExp[k]=serR(ds[k]);});
  var data={_mcf:'session',_ver:'1.0',_ts:new Date().toISOString(),_stores:ds.storeIds.length,
    ds:dsExp,ls:{}};
  var LS_KEYS=['mf_settings','mf_dialed_in','mf_targets_v2','mf_locked_projections','mf_events','mf_backtest_results'];
  var yrKeys=Object.keys(localStorage).filter(function(k){return k.indexOf('mf_targets_yearly_')===0;});
  LS_KEYS.concat(yrKeys).forEach(function(k){var v=localStorage.getItem(k);if(v)data.ls[k]=v;});
  var blob=new Blob([JSON.stringify(data)],{type:'application/json'});
  var url=URL.createObjectURL(blob);
  var a=document.createElement('a');
  var dt=new Date().toISOString().slice(0,10).replace(/-/g,'');
  a.href=url;a.download='McForecast_Session_'+dt+'.json';
  document.body.appendChild(a);a.click();
  setTimeout(function(){URL.revokeObjectURL(url);document.body.removeChild(a);},1000);
  if(onMsg)onMsg('✓ Session saved · '+ds.storeIds.length+' stores · '+(ds.laborRows?ds.laborRows.length:0)+' labor rows');
}

function mfRestoreSession(file, setDs, saveSettings, onMsg) {
  var reader=new FileReader();
  reader.onload=function(e){
    try{
      var data=JSON.parse(e.target.result);
      if(!data||data._mcf!=='session')throw new Error('Not a McForecast session file');
      // Restore localStorage keys first
      var ls=data.ls||{};
      Object.keys(ls).forEach(function(k){try{localStorage.setItem(k,ls[k]);}catch{}});
      // Rebuild ds object
      if(data.ds){
        var ROW_KEYS=['laborRows','opsRows','ctrlRows','fobRows','weatherRows',
          'peaksSvcRows','peaksSalesRows','auditRows','trendsRows'];
        function _bIdx(rows){var idx={};for(var i=0;i<rows.length;i++){var r=rows[i];if(!r.loc||!r.date)continue;var k=r.loc+'_'+dKey(r.date);if(!idx[k])idx[k]=[];idx[k].push(r);}return idx;}
        function _bWxIdx(rows){var idx={};for(var i=0;i<rows.length;i++){var r=rows[i];if(!r.date)continue;var k=dKey(r.date);if(!idx[k])idx[k]=r;}return idx;}
        var rds=Object.assign({},data.ds,{laborIdx:{},opsIdx:{},ctrlIdx:{},weatherIdx:{},wxByDate:{},lastActual:{}});
        for(var loc in data.ds.lastActual||{}){var v=data.ds.lastActual[loc];rds.lastActual[loc]=v?new Date(v):null;}
        ROW_KEYS.forEach(function(k){
          rds[k]=(data.ds[k]||[]).map(function(r){return r.date&&typeof r.date==='string'?Object.assign({},r,{date:new Date(r.date)}):r;});
        });
        rds.laborIdx=_bIdx(rds.laborRows);rds.opsIdx=_bIdx(rds.opsRows);
        rds.ctrlIdx=_bIdx(rds.ctrlRows);rds.weatherIdx=_bIdx(rds.weatherRows);
        rds.laborByLoc=bLocIdx(rds.laborRows);rds.opsByLoc=bLocIdx(rds.opsRows);
        rds.ctrlByLoc=bLocIdx(rds.ctrlRows);rds.darByLoc=bLocIdx(rds.darRows);
        rds.wxByDate=_bWxIdx(rds.weatherRows);
        // Convert dates nested inside ds.records (best/worst day records)
        if(rds.records&&typeof rds.records==='object'){
          Object.keys(rds.records).forEach(function(loc){
            var rec=rds.records[loc];
            if(rec&&typeof rec==='object'){
              Object.keys(rec).forEach(function(k){
                var entry=rec[k];
                if(entry&&typeof entry==='object'&&entry.date&&typeof entry.date==='string'){
                  entry.date=new Date(entry.date);
                }
              });
            }
          });
        }
        try{if(rds.auditRows&&rds.auditRows.length>0)rds.empRisk=analyzeRegisterAudit(rds.auditRows);}catch{}
        setDs(rds);
      }
      // Restore settings — apply dialedIn from mf_dialed_in if present
      if(ls['mf_settings']){
        try{
          var sv=JSON.parse(ls['mf_settings']);
          var mg=Object.assign({},DEF_SETTINGS,sv);
          mg.operators=Object.assign({},DEF_SETTINGS.operators,sv.operators||{});
          mg.supervisorGroups=Object.assign({},DEF_SETTINGS.supervisorGroups,sv.supervisorGroups||{});
          if(ls['mf_dialed_in']){
            var di=JSON.parse(ls['mf_dialed_in']);
            if(di&&Object.keys(di).length>0){mg.dialedIn=Object.assign({},di,mg.dialedIn||{});mg.dialedInEnabled=true;}
          }
          saveSettings(mg);
        }catch{}
      }
      var stCnt=((data.ds&&data.ds.storeIds)||[]).length;
      var lrCnt=((data.ds&&data.ds.laborRows)||[]).length;
      if(onMsg)onMsg('✓ Session restored · '+stCnt+' stores · '+lrCnt+' labor rows');
    }catch(err){if(onMsg)onMsg('⚠ Restore failed: '+err.message);}
  };
  reader.readAsText(file);
}

// SESSION AUTO-SAVE / AUTO-RESTORE  (v175)
// Uses IndexedDB (no size limit) for zero-friction session persistence.
// Saves full ds object automatically after every file load.
// On next startup: non-intrusive banner lets user restore with one click.
// File-based export/import (mfExportSession/mfRestoreSession) still works
// as a portable backup — this layer sits on top.
const _MF_IDB   = 'McForecastPro_Sessions_v1';
const _MF_STORE = 'sessions';
const _MF_KEY   = 'latest';

function _mfOpenDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(_MF_IDB, 1);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(_MF_STORE))
        db.createObjectStore(_MF_STORE);
    };
    req.onsuccess = e => res(e.target.result);
    req.onerror   = e => rej(e.target.error);
    req.onblocked = () => rej(new Error('McForecastPro_Sessions IDB blocked by another open tab.'));
  });
}

// Serialize ds: Date → ISO string, skip rebuilt indices (they're derived)
function _mfSerDS(ds) {
  if (!ds) return null;
  const ROW_KEYS = ['laborRows','opsRows','ctrlRows','fobRows','weatherRows',
                    'peaksSvcRows','peaksSalesRows','auditRows','trendsRows'];
  const serR = rows => (rows||[]).map(r => {
    if (!r) return r;
    const o = {...r};
    if (o.date instanceof Date) o.date = o.date.toISOString();
    return o;
  });
  const serLA = la => {
    const o = {};
    for (const k in la||{}) { const d = la[k]; o[k] = d instanceof Date ? d.toISOString() : d; }
    return o;
  };
  const out = { loaded:ds.loaded, storeIds:ds.storeIds, targets:ds.targets, records:ds.records,
    lastActual: serLA(ds.lastActual) };
  ROW_KEYS.forEach(k => out[k] = serR(ds[k]));
  return out;
}

// Deserialize ds: ISO string → Date, rebuild indices
function _mfDeserDS(raw) {
  if (!raw) return null;
  const ROW_KEYS = ['laborRows','opsRows','ctrlRows','fobRows','weatherRows',
                    'peaksSvcRows','peaksSalesRows','auditRows','trendsRows'];
  function _bIdxL(rows){const idx={};for(const r of rows){if(!r.loc||!r.date)continue;const k=r.loc+'_'+dKey(r.date);if(!idx[k])idx[k]=[];idx[k].push(r);}return idx;}
  function _bWxL(rows){const idx={};for(const r of rows){if(!r.date)continue;idx[dKey(r.date)]=r;}return idx;}
  const rds = {...raw, laborIdx:{}, opsIdx:{}, ctrlIdx:{}, weatherIdx:{}, wxByDate:{}, lastActual:{}};
  // Restore lastActual dates
  for (const loc in raw.lastActual||{}) {
    const v = raw.lastActual[loc];
    rds.lastActual[loc] = v ? new Date(v) : null;
  }
  // Restore row date objects
  ROW_KEYS.forEach(k => {
    rds[k] = (raw[k]||[]).map(r => {
      if (!r) return r;
      const o = {...r};
      if (typeof o.date === 'string') o.date = new Date(o.date);
      return o;
    });
  });
  // Restore records dates
  if (rds.records && typeof rds.records === 'object') {
    Object.keys(rds.records).forEach(loc => {
      const rec = rds.records[loc];
      if (rec && typeof rec === 'object') {
        Object.keys(rec).forEach(k => {
          if (rec[k]?.date && typeof rec[k].date === 'string') rec[k].date = new Date(rec[k].date);
        });
      }
    });
  }
  // Rebuild indices
  rds.laborIdx  = _bIdxL(rds.laborRows);
  rds.opsIdx    = _bIdxL(rds.opsRows);
  rds.ctrlIdx   = _bIdxL(rds.ctrlRows);
  rds.weatherIdx = _bIdxL(rds.weatherRows);
  rds.laborByLoc = bLocIdx(rds.laborRows);
  rds.opsByLoc   = bLocIdx(rds.opsRows);
  rds.ctrlByLoc  = bLocIdx(rds.ctrlRows);
  rds.darByLoc   = bLocIdx(rds.darRows);
  rds.wxByDate   = _bWxL(rds.weatherRows);
  // Rebuild audit analysis if available
  try { if (rds.auditRows?.length) rds.empRisk = analyzeRegisterAudit(rds.auditRows); } catch {}
  return rds;
}

// Compute display metadata from ds
function _mfSessionMeta(ds) {
  const rows = ds.laborRows || [];
  const dates = rows.map(r => r.date).filter(d => d instanceof Date).sort((a,b) => a-b);
  return {
    storeCount:  (ds.storeIds||[]).length,
    laborRows:   rows.length,
    ctrlRows:    (ds.ctrlRows||[]).length,
    opsRows:     (ds.opsRows||[]).length,
    peakRows:    (ds.peakRows||[]).length + (ds.peaksSvcRows||[]).length,
    auditRows:   (ds.auditRows||[]).length,
    trendsRows:  (ds.trendsRows||[]).length,
    earliest:    dates.length ? dKey(dates[0])                       : null,
    latest:      dates.length ? dKey(dates[dates.length-1])          : null,
  };
}

// Auto-save to IndexedDB (called after every file load)
async function mfIDBSave(ds) {
  if (!ds || !ds.loaded) return false;
  try {
    const db   = await _mfOpenDB();
    const data = {
      savedAt: new Date().toISOString(),
      meta:    _mfSessionMeta(ds),
      dsRaw:   _mfSerDS(ds),
      // ls keys (settings, events, etc.) are already persisted by their own handlers
    };
    await new Promise((res, rej) => {
      const tx = db.transaction(_MF_STORE, 'readwrite');
      tx.objectStore(_MF_STORE).put(data, _MF_KEY);
      tx.oncomplete = res;
      tx.onerror    = e => rej(e.target.error);
    });
    db.close();
    return true;
  } catch (e) {
    console.warn('[McForecast] IDB auto-save failed:', e);
    return false;
  }
}

// Load latest session from IndexedDB
async function mfIDBLoad() {
  try {
    const db  = await _mfOpenDB();
    const rec = await new Promise((res, rej) => {
      const tx  = db.transaction(_MF_STORE, 'readonly');
      const req = tx.objectStore(_MF_STORE).get(_MF_KEY);
      req.onsuccess = e => res(e.target.result);
      req.onerror   = e => rej(e.target.error);
    });
    db.close();
    return rec || null;
  } catch (e) {
    console.warn('[McForecast] IDB load failed:', e);
    return null;
  }
}

// Clear session from IndexedDB
async function mfIDBClear() {
  try {
    const db = await _mfOpenDB();
    await new Promise((res, rej) => {
      const tx = db.transaction(_MF_STORE, 'readwrite');
      tx.objectStore(_MF_STORE).delete(_MF_KEY);
      tx.oncomplete = res; tx.onerror = e => rej(e.target.error);
    });
    db.close();
  } catch (e) { console.warn('[McForecast] IDB clear failed:', e); }
}

// ── SessionBanner component ────────────────────────────────────────────────
function SessionBanner({session, onRestore, onDismiss}) {
  const [restoring, setRestoring] = React.useState(false);
  if (!session) return null;
  const { meta, savedAt } = session;
  const ageDays = savedAt ? Math.floor((Date.now() - new Date(savedAt)) / 86400000) : null;
  const ageLabel = ageDays === 0 ? 'today' : ageDays === 1 ? 'yesterday' : ageDays + ' days ago';
  const ageCol = ageDays > 7 ? '#f87171' : ageDays > 3 ? '#f59e0b' : '#34d399';
  const dateLabel = savedAt
    ? new Date(savedAt).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit'})
    : 'Unknown';

  const doRestore = async () => {
    setRestoring(true);
    try { await onRestore(session); } finally { setRestoring(false); }
  };

  return div({style:{
    background:'rgba(52,211,153,.07)', border:'.5px solid rgba(52,211,153,.25)',
    borderRadius:'var(--r)', padding:'10px 14px', marginBottom:8,
    display:'flex', alignItems:'center', gap:10, flexWrap:'wrap',
  }},
    span({style:{fontSize:'16px'}},'📂'),
    div({style:{flex:1}},
      div({style:{fontSize:'11px',fontWeight:700,color:'var(--text)',marginBottom:2}},
        'Session found — ',span({style:{color:ageCol}},ageLabel),
        span({style:{color:'var(--text3)',fontWeight:400}},
          '  ·  Saved '+dateLabel)),
      div({style:{fontSize:'9px',color:'var(--text3)',display:'flex',gap:10,flexWrap:'wrap'}},
        meta?.storeCount&&span(null,meta.storeCount+' stores'),
        meta?.laborRows&&span(null,(meta.laborRows).toLocaleString()+' labor rows'),
        meta?.earliest&&meta?.latest&&span(null,meta.earliest+' → '+meta.latest),
        meta?.peakRows>0&&span(null,meta.peakRows+' peaks rows'),
        meta?.auditRows>0&&span(null,meta.auditRows+' audit rows'),
      )
    ),
    div({style:{display:'flex',gap:6,flexShrink:0}},
      btn({className:'btn btn-sm',
        style:{background:'rgba(52,211,153,.15)',borderColor:'rgba(52,211,153,.4)',
          color:'#34d399',fontWeight:700,padding:'4px 14px'},
        disabled:restoring, onClick:doRestore},
        restoring?'⏳ Restoring…':'✓ Restore Session'),
      btn({className:'btn btn-sm',style:{color:'var(--text3)'},onClick:onDismiss},'Not now')
    )
  );
}
// ── end session system ──────────────────────────────────────────────────────

export { ErrorBoundary, mfExportSession, mfRestoreSession, mfIDBLoad, mfIDBSave, mfIDBClear, _mfOpenDB, _mfSerDS, _mfDeserDS, _mfSessionMeta, SessionBanner };
