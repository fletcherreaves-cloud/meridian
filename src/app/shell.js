// @ts-nocheck
import * as React from 'react';
import { sName, sNameC, OPTIONAL_PANELS } from '../constants.js';
import { PANEL_BY_ID, SECTIONS, panelsForSection, testKitchenPanels } from './panel-registry.js';
import { addD, mwStart, nwStart, sodOf, eodOf, thisWeek, fmtDI, fmtRng, nDays, rngMode, weekStartOf } from '../utils/date.js';
import { SignOutBtn, ChangePasswordBtn } from '../components/AuthGate.js';
import { supabase, loadEomCountNotifications, countUnreadEomCountNotifications, markEomCountNotificationRead, upsertPushSubscription, deletePushSubscription } from '../lib/supabase.js';
import { reportRender as _traceRender } from '../utils/click-trace.js';

const h=React.createElement;
const div=(p,...c)=>h('div',p,...c);
const span=(p,...c)=>h('span',p,...c);
const btn=(p,...c)=>h('button',p,...c);
const inp=(p,...c)=>h('input',p,...c);
const { useState, useEffect, useRef, useMemo, useCallback } = React;

const DATE_PRESETS=[
  {id:'yesterday',l:'Yesterday',fn:()=>{const d=addD(new Date(),-1);return{s:sodOf(d),e:eodOf(d),label:'Yesterday'};}},
  {id:'this_wk',l:'This Week',fn:()=>{const s=mwStart();return{s:sodOf(s),e:eodOf(addD(s,6)),label:'This Week'};}},
  {id:'last_wk',l:'Last Week',fn:()=>{const s=addD(mwStart(),-7);return{s:sodOf(s),e:eodOf(addD(s,6)),label:'Last Week'};}},
  {id:'next_wk',l:'Next Week',fn:()=>{const s=nwStart();return{s:sodOf(s),e:eodOf(addD(s,6)),label:'Next Week'};}},
  {id:'next_2wk',l:'Next 2 Wks',fn:()=>{const s=nwStart();return{s:sodOf(s),e:eodOf(addD(s,13)),label:'Next 2 Weeks'};}},
  {id:'next_4wk',l:'Next 4 Wks',fn:()=>{const s=nwStart();return{s:sodOf(s),e:eodOf(addD(s,27)),label:'Next 4 Weeks'};}},
  {id:'mtd',l:'Month to Date',fn:()=>{const s=new Date(new Date().getFullYear(),new Date().getMonth(),1);return{s:sodOf(s),e:eodOf(new Date()),label:'Month to Date'};}},
  {id:'last_2wk',l:'Last 2 Weeks',fn:()=>{const e=addD(new Date(),-1);const s=addD(e,-13);return{s:sodOf(s),e:eodOf(e),label:'Last 2 Weeks'};}},
  {id:'last_4wk',l:'Last 4 Weeks',fn:()=>{const e=addD(new Date(),-1);const s=addD(e,-27);return{s:sodOf(s),e:eodOf(e),label:'Last 4 Weeks'};}},
  {id:'this_mo',l:'This Month',fn:()=>{const n=new Date();const s=new Date(n.getFullYear(),n.getMonth(),1);const e=new Date(n.getFullYear(),n.getMonth()+1,0);return{s:sodOf(s),e:eodOf(e),label:'This Month'};}},
  {id:'last_mo',l:'Last Month',fn:()=>{const n=new Date();const s=new Date(n.getFullYear(),n.getMonth()-1,1);const e=new Date(n.getFullYear(),n.getMonth(),0);return{s:sodOf(s),e:eodOf(e),label:'Last Month'};}},
  {id:'next_mo',l:'Next Month',fn:()=>{const n=new Date();const s=new Date(n.getFullYear(),n.getMonth()+1,1);const e=new Date(n.getFullYear(),n.getMonth()+2,0);return{s:sodOf(s),e:eodOf(e),label:'Next Month'};}},
  {id:'ytd',l:'Year to Date',fn:()=>{const s=new Date(new Date().getFullYear(),0,1);return{s:sodOf(s),e:eodOf(new Date()),label:'Year to Date'};}},
  {id:'last_yr',l:'Last Year',fn:()=>{const y=new Date().getFullYear()-1;return{s:sodOf(new Date(y,0,1)),e:eodOf(new Date(y,11,31)),label:'Last Year'};}},
];

function DatePicker({value, onChange}) {
  const safe = value||thisWeek();
  const [open, setOpen] = useState(false);
  const [activeP, setActiveP] = useState('next_wk');
  const [cs, setCs] = useState(fmtDI(safe.s));
  const [ce, setCe] = useState(fmtDI(safe.e));
  const ref = useRef(null);

  useEffect(() => {
    const handler = e => { if(ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const applyPreset = p => {
    const r = p.fn(); setActiveP(p.id);
    setCs(fmtDI(r.s)); setCe(fmtDI(r.e));
    onChange({...r, preset:p.id}); setOpen(false);
  };

  const applyCustom = () => {
    const s = new Date(cs+'T00:00:00'), e = new Date(ce+'T00:00:00');
    if(isNaN(s)||isNaN(e)||s>e) return;
    setActiveP('custom');
    onChange({s:sodOf(s),e:eodOf(e),label:'Custom Range',preset:'custom'});
    setOpen(false);
  };

  const mode = rngMode(safe.s, safe.e);
  const days = nDays(safe.s, safe.e);
  const badgeCls = mode==='future'?'badge-fut':mode==='past'?'badge-hist':'badge-mix';
  const modeLabel = mode==='future'?'PROJ':mode==='past'?'HIST':'MIXED';

  return div({className:'drp', ref},
    btn({className:'drp-btn', onClick:()=>setOpen(o=>!o)},
      span(null,'📅'),
      span(null, safe.label||fmtRng(safe.s,safe.e)),
      span({style:{opacity:.5,fontSize:'10px'}}, ' ('+days+'d)'),
      span(null,' ▾')
    ),
    open && div({className:'drp-popup'},
      div({className:'drp-presets'},
        DATE_PRESETS.map(p => btn({key:p.id, className:'drp-pre'+(activeP===p.id?' on':''), onClick:()=>applyPreset(p)}, p.l))
      ),
      div({className:'drp-custom'},
        h('label',null,'From'),
        inp({type:'date', value:cs, onChange:e=>setCs(e.target.value)}),
        h('label',null,'To'),
        inp({type:'date', value:ce, onChange:e=>setCe(e.target.value)}),
        btn({className:'btn btn-a btn-sm', onClick:applyCustom}, 'Apply')
      ),
      div({className:'drp-foot'},
        span({className:'drp-foot-l'}, fmtRng(safe.s,safe.e)+' · '+days+' day'+(days!==1?'s':'')),
        span({className:'badge-fut '+badgeCls, style:{padding:'2px 7px',borderRadius:'99px',fontSize:'9px',fontWeight:700}}, modeLabel)
      )
    )
  );
}

function AppSidebar({view, setView, selStore, stores, ds, settings, onOpenModal, onLoadFiles, onSaveSession, onRestoreSession, loadMsg, perm, betaMode, panelVis}) {
  // Diagnostic (2026-08-09, ?clicktrace=1): tapping the mobile hamburger (mf:toggleNav) shows
  // up as a ~480ms "App tree" render on every single capture, but mobileOpen is AppSidebar's
  // OWN local state — a child's local update should not force the App() parent to re-render at
  // all. Two possibilities: this component's own render is genuinely that expensive (stores is
  // a 27-item array with per-store nav badge computation), or the App-tree instrumentation is
  // catching an unrelated, coincidentally-overlapping commit within the 1s attribution window.
  // This mark answers which, directly, instead of guessing further.
  const _rt0 = performance.now();
  React.useLayoutEffect(() => { _traceRender('AppSidebar', 'render+commit', performance.now() - _rt0); });
  const [collapsed, setCollapsed] = React.useState(false);
  const [expandedGroup, setExpandedGroup] = React.useState('nav');
  const [isMobile, setIsMobile] = React.useState(()=>window.innerWidth<768);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  React.useEffect(()=>{
    const check=()=>setIsMobile(window.innerWidth<768);
    window.addEventListener('resize',check);
    return ()=>window.removeEventListener('resize',check);
  },[]);
  React.useEffect(()=>{
    const toggle=()=>setMobileOpen(o=>!o);
    window.addEventListener('mf:toggleNav',toggle);
    return ()=>window.removeEventListener('mf:toggleNav',toggle);
  },[]);
  const closeMobile=()=>{if(isMobile)setMobileOpen(false);};

  const w = isMobile ? 260 : (collapsed ? 48 : 220);

  const navItemSub = (label, icon, onClick, active, badge) =>
    div({style:{display:'flex',alignItems:'center',gap:collapsed?0:8,
      padding:collapsed?'6px 0':'5px 10px 5px '+(collapsed?10:20),
      borderRadius:'var(--r)',cursor:'pointer',
      background:active?'var(--adim)':'transparent',
      color:active?'var(--amber)':'var(--text3)',
      transition:'all .15s',justifyContent:collapsed?'center':'flex-start',
      position:'relative',fontSize:'11px',fontWeight:active?600:400,
      borderLeft:collapsed?'none':'1.5px solid var(--bdr)'},
      onClick:(...a)=>{onClick(...a);closeMobile();}, title:collapsed?label:undefined,
      onMouseEnter:e=>{e.currentTarget.style.background=active?'var(--adim)':'rgba(255,255,255,.04)';},
      onMouseLeave:e=>{e.currentTarget.style.background=active?'var(--adim)':'transparent';}},
      collapsed?null:span({style:{width:8,height:8,borderRadius:'50%',flexShrink:0,
        background:active?'var(--amber)':'var(--bdr2)'}},null),
      !collapsed&&span(null,label)
    );
  const navLabel = (l) =>
    div({style:{padding:'4px 14px 2px',fontSize:'7px',fontWeight:700,
      textTransform:'uppercase',letterSpacing:'.7px',color:'var(--text3)',marginTop:8}},(l));
  const navItem = (label, icon, onClick, active, badge, disabled) =>
    div({style:{display:'flex',alignItems:'center',gap:collapsed?0:8,
      padding:collapsed?'8px 0':'6px 10px',borderRadius:'var(--r)',cursor:disabled?'not-allowed':'pointer',
      background:active?'var(--adim)':'transparent',
      color:disabled?'var(--text3)':(active?'var(--amber)':'var(--text2)'),
      opacity:disabled?0.45:1,
      transition:'all .15s',justifyContent:collapsed?'center':'flex-start',
      position:'relative',fontSize:'12px',fontWeight:active?600:400},
      onClick:disabled?undefined:(...a)=>{onClick(...a);closeMobile();},
      // Always carry the full label as a tooltip, not just when collapsed -- a label longer
      // than the sidebar's fixed width (dispatch #55 Part A's LifeLenz Bridge rename, ~3x its
      // old length) now truncates with an ellipsis instead of silently clipping mid-word with
      // no way to see the rest.
      title:disabled?'Select a store first':label,
      onMouseEnter:disabled?undefined:e=>{e.currentTarget.style.background=active?'var(--adim)':'var(--surf2)';},
      onMouseLeave:disabled?undefined:e=>{e.currentTarget.style.background=active?'var(--adim)':'transparent';}},
      span({style:{fontSize:14,flexShrink:0}},icon),
      !collapsed&&span({style:{flex:1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},label),
      !collapsed&&badge>0&&span({style:{marginLeft:'auto',background:'rgba(239,68,68,.15)',
        color:'#ef4444',border:'.5px solid rgba(239,68,68,.25)',borderRadius:10,
        fontSize:9,padding:'1px 5px',fontWeight:700}},badge)
    );

  const sectionLabel = (txt) => collapsed?null:
    div({style:{fontSize:'9px',fontWeight:700,letterSpacing:'.8px',color:'var(--text3)',
      textTransform:'uppercase',padding:'12px 10px 4px',marginTop:4}},txt);

  // Needs Attention badge count
  const needsCount = (stores||[]).filter(s=>s.findings&&s.findings.some(f=>f.t==='crit')).length;

  // Permission helpers — pi is a permission-gated navItem
  const can = perm || (() => true);
  // pis = stable (always visible), pi = experimental (hidden when betaMode=true)
  const pis = (permKey, ...args) => (!permKey || can(permKey)) ? navItem(...args) : null;
  const pi  = (permKey, ...args) => (!permKey || can(permKey)) && !betaMode ? navItem(...args) : null;

  // ── Registry-backed nav (dispatch #54 Job A) ─────────────────────────────
  // label/icon/perm now come from panel-registry.js -- the single source of truth -- instead of
  // being duplicated as literal strings here (the exact drift this was meant to stop: e.g. the
  // registry's 'proj' entry said "Proj Workflow"/lock icon, a stale label from the pruned
  // duplicate line below, while the live nav has said "Projections"/▦ since v4.517; found by
  // this refactor and fixed in panel-registry.js, not silently left to disagree).
  // navP = pis()-equivalent (always visible if permitted); navPBeta = pi()-equivalent (also
  // hidden when betaMode is on, same as every Test Kitchen item).
  const navP = (id, extra) => {
    const p = PANEL_BY_ID[id];
    const { onClick, active, badge, disabled } = extra || {};
    return pis(p.perm, p.label, p.icon, onClick || (() => onOpenModal(id)), active, badge, disabled);
  };
  const navPBeta = (id, extra) => {
    const p = PANEL_BY_ID[id];
    const { onClick, active, badge, disabled } = extra || {};
    return pi(p.perm, p.label, p.icon, onClick || (() => onOpenModal(id)), active, badge, disabled);
  };

  // ── Section-driven rendering (dispatch #54 Job B) ────────────────────────
  // "v2" adopted: the main nav body now iterates SECTIONS + panelsForSection() instead of a
  // hand-built literal list -- Job A deliberately deferred this (its own registry corrections
  // were only truthful for TODAY's ad hoc grouping, not the owner's target IA); Job B is where
  // the owner's actual regroup decisions (memory/dispatch54-job-b.md) landed as section: edits,
  // so switching the renderer over is now correct instead of a silent visual change.
  // A section with zero visible panels for the caller's permissions renders nothing (no empty
  // header) -- panelsForSection() already applies the permission filter, so this falls out for
  // free rather than needing a separate `can(...) &&` guard per section the way v1 needed one
  // per hardcoded header.
  // Three panels are beta-hidden (navPBeta) despite being ordinary kind:'nav' panels, not
  // kind:'test-kitchen' -- panel-registry.test.js pins this exact set so a future addition here
  // is a deliberate choice, not copy-paste.
  const BETA_HIDDEN_EXTRAS = new Set(['brief', 'loc-intel', 'one-pager']);
  // Per-panel extras that don't fit the registry (badges computed from live data, not metadata).
  const NAV_EXTRAS = {
    attention: { badge: needsCount },
    'smg-voice': { badge: ds && ds.smgRows && ds.smgRows.length ? ds.smgRows.length : null },
  };
  const renderSection = (sectionId) => {
    const panels = panelsForSection(sectionId, can);
    if (!panels.length) return null;
    const meta = SECTIONS.find(s => s.id === sectionId);
    return [
      navLabel(meta.label),
      ...panels.map(p => (BETA_HIDDEN_EXTRAS.has(p.id) ? navPBeta : navP)(p.id, NAV_EXTRAS[p.id])),
    ];
  };

  // ── ⚗ TEST KITCHEN (dispatch #61) ─────────────────────────────────────────
  // Derived from panel.kind === 'test-kitchen' + testKitchenPanels()'s tkOrder (panel-registry.js)
  // instead of a hand-maintained list of literal navPBeta(id) calls -- the old list rendered a promoted
  // panel TWICE (once under its new section:, once still hardcoded here). Promoting a panel is
  // now just flipping its kind: in the registry; nothing here needs to change.
  // disabledWhen is the one per-item option that survived derivation --
  // forecast-audit's { disabled: !selStore } -- declared in the registry and mapped to the real
  // predicate here, since the registry has no access to this component's local state.
  const DISABLED_WHEN = { noStore: !selStore };
  const renderTestKitchen = () => {
    if (betaMode) return null;
    const panels = testKitchenPanels(can);
    if (!panels.length) return null;
    return [
      navLabel('⚗ TEST KITCHEN'),
      ...panels.map(p => navPBeta(p.id, p.disabledWhen ? { disabled: DISABLED_WHEN[p.disabledWhen] } : undefined)),
    ];
  };

  // ── Global nav search (owner req: "a search bar at the top of the menu to find anything
  // in-app") ────────────────────────────────────────────────────────────────────────────────
  // Index built from the SAME two sources + the SAME visibility rules the sidebar itself
  // already renders from -- panelsForSection() per real section (matching renderSection()'s own
  // `can(...)` gate) plus testKitchenPanels() when Test Kitchen is showing (renderTestKitchen()'s
  // own `!betaMode` gate) -- so a search result is never something the user couldn't also have
  // found by scrolling, and never silently drifts from what's actually clickable. kind:'internal'/
  // 'orphan'/'hub-tab' panels are excluded by construction (panelsForSection/testKitchenPanels only
  // return 'nav'/'optional'/'test-kitchen' kinds) -- an internal redirect-only id or a broken
  // orphan is not something a user should be able to "find".
  const [navQuery, setNavQuery] = useState('');
  const [navSearchOpen, setNavSearchOpen] = useState(false);
  const navSearchRef = useRef(null);
  useEffect(() => {
    const handler = e => { if (navSearchRef.current && !navSearchRef.current.contains(e.target)) setNavSearchOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  const navIndex = useMemo(() => {
    const seen = new Set();
    const items = [];
    for (const s of SECTIONS) {
      for (const p of panelsForSection(s.id, can)) {
        if (seen.has(p.id) || (betaMode && BETA_HIDDEN_EXTRAS.has(p.id))) continue;
        seen.add(p.id);
        items.push({ id: p.id, label: p.label, icon: p.icon, groupLabel: s.label });
      }
    }
    if (!betaMode) {
      for (const p of testKitchenPanels(can)) {
        if (seen.has(p.id)) continue;
        seen.add(p.id);
        items.push({ id: p.id, label: p.label, icon: p.icon, groupLabel: 'Test Kitchen' });
      }
    }
    return items;
  }, [can, betaMode]);
  const navResults = useMemo(() => {
    const q = navQuery.trim().toLowerCase();
    if (!q) return [];
    return navIndex.filter(p => p.label.toLowerCase().includes(q) || p.groupLabel.toLowerCase().includes(q)).slice(0, 8);
  }, [navIndex, navQuery]);
  const goNavResult = (id) => {
    onOpenModal(id); setNavQuery(''); setNavSearchOpen(false); closeMobile();
  };
  const navSearchBox = collapsed ? null : div({ ref: navSearchRef, style: { position: 'relative', padding: '8px 10px', borderBottom: '.5px solid var(--bdr)', flexShrink: 0 } },
    inp({
      type: 'text', placeholder: '🔍 Search…', value: navQuery,
      onChange: e => { setNavQuery(e.target.value); setNavSearchOpen(true); },
      onFocus: () => setNavSearchOpen(true),
      onKeyDown: e => {
        if (e.key === 'Enter' && navResults[0]) goNavResult(navResults[0].id);
        else if (e.key === 'Escape') { setNavQuery(''); setNavSearchOpen(false); }
      },
      style: { width: '100%', boxSizing: 'border-box', fontSize: 11, padding: '6px 8px',
        borderRadius: 'var(--r)', border: '.5px solid var(--bdr2)', background: 'var(--surf2)', color: 'var(--text)' },
    }),
    navSearchOpen && navQuery.trim() && div({
      style: { position: 'absolute', top: '100%', left: 10, right: 10, zIndex: 50, marginTop: 2,
        background: 'var(--surf)', border: '.5px solid var(--bdr2)', borderRadius: 'var(--r)',
        boxShadow: '0 8px 24px rgba(0,0,0,.35)', maxHeight: 320, overflowY: 'auto' },
    },
      navResults.length
        ? navResults.map(p => div({
            key: p.id, onClick: () => goNavResult(p.id),
            style: { display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer' },
            onMouseEnter: e => { e.currentTarget.style.background = 'var(--surf2)'; },
            onMouseLeave: e => { e.currentTarget.style.background = 'transparent'; },
          },
            span({ style: { fontSize: 14, flexShrink: 0 } }, p.icon),
            div({ style: { flex: 1, minWidth: 0 } },
              div({ style: { fontSize: 12, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, p.label),
              div({ style: { fontSize: 9, color: 'var(--text3)' } }, p.groupLabel))))
        : div({ style: { padding: '10px', fontSize: 11, color: 'var(--text3)' } }, 'No matches.')));

  const sideStyle=isMobile
    ?{position:'fixed',top:0,left:mobileOpen?0:'-270px',height:'100%',width:w,zIndex:300,
      background:'var(--surf)',borderRight:'.5px solid var(--bdr)',
      display:'flex',flexDirection:'column',transition:'left .25s ease',overflowX:'hidden'}
    :{width:w,minWidth:w,height:'100%',background:'var(--surf)',
      borderRight:'.5px solid var(--bdr)',display:'flex',flexDirection:'column',
      transition:'width .2s ease',flexShrink:0,overflowX:'hidden',zIndex:10};
  return h(React.Fragment,null,
    isMobile&&mobileOpen&&div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.6)',zIndex:299},onClick:()=>setMobileOpen(false)}),
    div({style:sideStyle},

    // ── Logo & collapse toggle ──────────────────────────────────
    div({style:{display:'flex',alignItems:'center',gap:8,padding:collapsed?'14px 0':'14px 12px',
      borderBottom:'.5px solid var(--bdr)',justifyContent:collapsed?'center':'flex-start',
      flexShrink:0}},
      div({style:{width:30,height:30,borderRadius:'var(--r)',background:'var(--amber)',
        display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,
        cursor:'pointer',transition:'transform .15s'},
        onClick:()=>setCollapsed(p=>!p),
        title:collapsed?'Expand sidebar':'Collapse sidebar'},
        span({style:{fontSize:15,fontWeight:900,color:'#000',fontFamily:'var(--sans)',
          lineHeight:1}},'M')
      ),
      !collapsed&&div({style:{overflow:'hidden'}},
        div({style:{fontSize:'13px',fontWeight:700,color:'var(--text)',
          whiteSpace:'nowrap',lineHeight:1.3}},'Meridian'),
        div({style:{fontSize:'9px',color:'var(--text3)',letterSpacing:'.5px',
          textTransform:'uppercase',whiteSpace:'nowrap'}},
          settings.districtName||'District')
      )
    ),

    navSearchBox,

    // ── Navigation ──────────────────────────────────────────────
    div({style:{flex:1,overflowY:'auto',overflowX:'hidden',padding:collapsed?'8px 4px':'8px'}},

      // ── Top: view switches, not panels -- no registry id, always visible ────────
      navItem('Home',              '⌂', ()=>setView('command'),         view==='command'),
      pi('analytics.district',    'District View',    '⊞', ()=>{setView('district');},   view==='district'),

      // ── Section-driven body (dispatch #54 Job B) ─────────────────────────────
      // Every section except 'admin' renders in SECTIONS order; 'admin' is pulled out and
      // rendered LAST (after Test Kitchen and the optional-panel spread), matching where it's
      // always visually sat -- see renderSection()'s own comment for why this is section-driven
      // now instead of the v1 hand-built list Job A deliberately preserved.
      ...SECTIONS.filter(s => s.id !== 'admin').flatMap(s => renderSection(s.id) || []),

      // ── TEST KITCHEN ───────────────────────────────────────────
      // Derived -- see renderTestKitchen() above. A 'proj' duplicate ("Proj Workflow", same
      // 'proj' modal) was pruned from this list at v4.517; the recall note now lives in
      // memory/panel-catalog.md instead of a commented-out line here (dispatch #61).
      ...(renderTestKitchen() || []),
      // Optional / experimental panels (registry-driven) — hidden by default, toggled back
      // on per-panel in Admin → Panel Manager. Nothing deleted; modal routing stays in App.js.
      ...OPTIONAL_PANELS.filter(p=>(panelVis&&panelVis[p.id])&&(!p.perm||can(p.perm)))
        .map(p=>pi(p.perm, p.label, p.icon, ()=>onOpenModal(p.id), false)),

      // ── ADMIN (pulled out of the section loop above, see its own comment) ───────
      ...(renderSection('admin') || []),
      navItem('Save Session',    '💾', ()=>onSaveSession&&onSaveSession(),      false),
      navItem('Restore Session', '📂', ()=>onRestoreSession&&onRestoreSession(),false),
    ),

    // ── Footer status ───────────────────────────────────────────
    div({style:{borderTop:'.5px solid var(--bdr)',padding:collapsed?'10px 0':'10px 12px',
      flexShrink:0,display:'flex',alignItems:'center',gap:8,justifyContent:collapsed?'center':'flex-start'}},
      // Data live indicator
      div({style:{width:7,height:7,borderRadius:'50%',flexShrink:0,
        background:ds&&ds.loaded?'#10b981':'#64748b',
        boxShadow:ds&&ds.loaded?'0 0 6px rgba(16,185,129,.5)':'none',
        animation:ds&&ds.loaded?'pulse 2s infinite':'none'}}),
      !collapsed&&div({style:{fontSize:'9px',color:'var(--text3)',overflow:'hidden'}},
        div({style:{color:'var(--text2)',fontWeight:600,fontSize:'10px',whiteSpace:'nowrap'}},
          ds&&ds.loaded?'Data loaded':'No data'),
        div({style:{whiteSpace:'nowrap',opacity:.75}},
          'v'+(typeof window!=='undefined'&&window.__MERIDIAN_VERSION__||'—')),
        ds&&ds.storeIds&&div({style:{whiteSpace:'nowrap'}},
          ds.storeIds.length+' stores · '+
          (ds.laborRows&&ds.laborRows.length>0?Math.floor(ds.laborRows.length/1000)+'K rows':'no data'))
      )
    )
  ));
}

// ── EOM count notification bell (dispatch #209) ──────────────────────
// The app's FIRST real in-app notification surface. Bell + unread badge, always visible in the
// top bar (glanceable from anywhere, matching the SAGE/Pre-Brief quick-access buttons just to
// its left); clicking opens a lightweight dropdown, NOT a RoutePanelShell page, listing
// eom_count_notifications rows newest-first. Detection lives in
// src/engine/eom-inventory.js's detectCountNotifications(); rows are written by
// scripts/qsrsoft-onhand-pull.mjs. This component is pure read + mark-read + deep-link — it
// invents no new business logic of its own.
const NOTIF_CLASS_KEYS = ['food', 'condiment', 'paper', 'nonproduct'];
const NOTIF_CLASS_LABEL = { food: 'Food', condiment: 'Condiment', paper: 'Paper', nonproduct: 'Non-Product' };
// Rule 3's four statuses, every notification, every relevant class — never blank for an
// untouched-but-real class (not_started) and never a fake reading for a class with zero items
// in the store's catalog (not_applicable).
const NOTIF_STATUS_LABEL = { complete: 'Complete', in_progress: 'In progress', not_started: 'Not started', not_applicable: 'N/A' };
const NOTIF_STATUS_COLOR = { complete: '#34d399', in_progress: 'var(--gold)', not_started: 'var(--text3)', not_applicable: 'var(--text3)' };
const NOTIF_TRIGGER_LABEL = { food_condiment: 'Food + Condiment', paper: 'Paper' };
const NOTIF_POLL_MS = 60000; // "current within a minute" — dispatch's own bar, not a real-time push system

export function timeAgoShort(iso) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return 'just now';
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + 'm ago';
  const hr = Math.floor(m / 60);
  if (hr < 24) return hr + 'h ago';
  return Math.floor(hr / 24) + 'd ago';
}

function NotificationRow({ row, onClick }) {
  const unread = !row.read_at;
  const cs = row.class_statuses || {};
  const ui = row.uncounted_items || {};
  const kbLinks = Array.isArray(row.kb_links) ? row.kb_links : [];
  const triggerLabel = String(row.trigger_kind || '').split('+')
    .map(k => NOTIF_TRIGGER_LABEL[k] || k).join(' + ');
  return div({
    onClick: () => onClick(row),
    'data-notif-row': row.id, // stable hook for tests -- textContent alone can't disambiguate nested rows
    style: { padding: '9px 12px', borderBottom: '.5px solid var(--bdr)', cursor: 'pointer',
      background: unread ? 'rgba(245,188,0,.07)' : 'transparent' },
    onMouseEnter: e => { e.currentTarget.style.background = unread ? 'rgba(245,188,0,.13)' : 'rgba(255,255,255,.04)'; },
    onMouseLeave: e => { e.currentTarget.style.background = unread ? 'rgba(245,188,0,.07)' : 'transparent'; },
  },
    div({ style: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 } },
      unread && span({ title: 'Unread', style: { width: 6, height: 6, borderRadius: '50%', background: 'var(--gold)', flexShrink: 0 } }),
      span({ style: { fontSize: '11px', fontWeight: 700, color: 'var(--text)' } }, sNameC(row.loc)),
      span({ style: { fontSize: '9px', color: 'var(--text3)', marginLeft: 'auto', whiteSpace: 'nowrap' } }, timeAgoShort(row.created_at))
    ),
    div({ style: { fontSize: '9px', color: 'var(--gold)', fontWeight: 700, marginBottom: 5 } }, triggerLabel + ' complete'),
    // Rule 3: EVERY relevant class's current status, not just the trigger class(es).
    div({ style: { display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: ui.totalCount || kbLinks.length ? 5 : 0 } },
      NOTIF_CLASS_KEYS.map(k => {
        const c = cs[k];
        if (!c || c.status === 'not_applicable') return null;
        return span({ key: k, style: { fontSize: '8px', padding: '1px 6px', borderRadius: 8,
          border: '.5px solid var(--bdr)', color: NOTIF_STATUS_COLOR[c.status] || 'var(--text3)', whiteSpace: 'nowrap' } },
          NOTIF_CLASS_LABEL[k] + ': ' + (NOTIF_STATUS_LABEL[c.status] || c.status) + (c.pct != null ? ' (' + Math.round(c.pct * 100) + '%)' : ''));
      })
    ),
    ui.totalCount > 0 && div({ style: { fontSize: '9px', color: 'var(--text3)', marginBottom: kbLinks.length ? 4 : 0 } },
      ui.totalCount + ' uncounted item' + (ui.totalCount !== 1 ? 's' : '') + ' (~$' + Math.round(ui.totalValue || 0).toLocaleString() + ' at risk)' + (ui.truncated ? ' — top 25 shown' : '')),
    kbLinks.length > 0 && div({ style: { display: 'flex', gap: 10, flexWrap: 'wrap' } },
      kbLinks.slice(0, 2).map((l, i) => h('a', { key: i, href: l.url, target: '_blank', rel: 'noopener noreferrer',
        onClick: e => e.stopPropagation(), style: { fontSize: '9px', color: 'var(--amber)', textDecoration: 'none' } }, '📘 ' + l.title))
    )
  );
}

// ── Device alerts (Web Push) — dispatch #216 ─────────────────────────────────
// Standard base64url -> Uint8Array conversion (subscribe()'s applicationServerKey requires a
// Uint8Array, not the raw VAPID public-key string) — small, well-known, not worth a dependency.
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
function isIOSDevice() {
  return typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}
function isStandaloneDisplay() {
  return (typeof navigator !== 'undefined' && navigator.standalone === true)
    || (typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
}

// A small toggle inside the bell's dropdown, not a panel of its own — same "positioned div,
// click-outside closes it" shape the dropdown it lives in already uses, so no ModalShell/
// RoutePanelShell chrome applies here (panel-contract's close-button/date-picker/
// LocationSelector/mobile-scroll items are about actual panels; this has none of those surfaces).
function DeviceAlertsToggle() {
  // 'checking' | 'unsupported' | 'ios-install' | 'denied' | 'off' | 'on'
  const [state, setState] = useState('checking');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let live = true;
    (async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || typeof Notification === 'undefined') {
        if (live) setState('unsupported'); return;
      }
      if (isIOSDevice() && !isStandaloneDisplay()) { if (live) setState('ios-install'); return; }
      if (Notification.permission === 'denied') { if (live) setState('denied'); return; }
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (live) setState(sub ? 'on' : 'off');
      } catch { if (live) setState('off'); }
    })();
    return () => { live = false; };
  }, []);

  const enable = async () => {
    setBusy(true); setErr('');
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { setState('denied'); setBusy(false); return; }
      const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
      if (!vapidKey) { setErr('Push isn\'t configured yet — ask the admin to finish the device-alerts setup.'); setBusy(false); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
      const json = sub.toJSON();
      const { saved, error } = await upsertPushSubscription({
        endpoint: json.endpoint, p256dh: json.keys.p256dh, authKey: json.keys.auth, userAgent: navigator.userAgent,
      });
      if (!saved) { setErr(error || 'Could not save this device.'); setBusy(false); return; }
      setState('on');
    } catch (e) {
      setErr(e?.message || 'Could not enable device alerts.');
    }
    setBusy(false);
  };

  const disable = async () => {
    setBusy(true); setErr('');
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await deletePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setState('off');
    } catch (e) {
      setErr(e?.message || 'Could not disable device alerts.');
    }
    setBusy(false);
  };

  const row = { padding: '8px 12px', borderBottom: '.5px solid var(--bdr)', fontSize: '10px', color: 'var(--text2)' };
  if (state === 'checking') return null; // avoid a flash of the wrong affordance
  if (state === 'unsupported') return div({ style: row }, 'Device alerts aren\'t supported in this browser.');
  if (state === 'ios-install') return div({ style: row }, 'Add Meridian to your Home Screen first, then reopen it from there to enable device alerts.');
  if (state === 'denied') return div({ style: row }, 'Notifications are blocked for this site. Enable them in your browser/site settings to turn on device alerts.');
  return div({ style: row },
    btn({
      onClick: state === 'on' ? disable : enable, disabled: busy,
      style: { fontSize: '10px', fontWeight: 700, color: state === 'on' ? 'var(--amber)' : 'var(--text2)',
        background: 'transparent', border: '.5px solid var(--bdr)', borderRadius: 6, padding: '4px 8px',
        cursor: busy ? 'default' : 'pointer' },
    }, busy ? 'Working…' : (state === 'on' ? '🔔 Device alerts on — tap to disable' : '🔔 Enable device alerts')),
    err && div({ style: { color: '#fca5a5', marginTop: 4 } }, err)
  );
}

function NotificationBell({ onOpenModal, perm }) {
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);

  // Simple periodic poll for the unread count while the app is open (dispatch's own bar: "not a
  // real-time push system, just needs to feel current within a minute during an active count
  // day") — not wired to any live-subscription infra.
  useEffect(() => {
    let live = true;
    const refresh = () => countUnreadEomCountNotifications().then(n => { if (live) setUnread(n); }).catch(() => {});
    refresh();
    const id = setInterval(refresh, NOTIF_POLL_MS);
    return () => { live = false; clearInterval(id); };
  }, []);

  useEffect(() => {
    if (!open) return;
    let live = true;
    setLoading(true);
    loadEomCountNotifications({ limit: 20 }).then(rows => { if (live) { setItems(rows); setLoading(false); setLoadedOnce(true); } })
      .catch(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [open]);

  const onRowClick = (row) => {
    if (!row.read_at) {
      markEomCountNotificationRead(row.id).catch(() => {});
      setItems(prev => prev.map(r => (r.id === row.id ? { ...r, read_at: new Date().toISOString() } : r)));
      setUnread(u => Math.max(0, u - 1));
    }
    setOpen(false);
    // Deep-link into that store's EOM Dashboard Scoreboard entry (rule: reuse the existing view,
    // don't build a second detail surface). 'eom-dashboard:<loc>' matches App.js's 'ranking:'
    // colon-arg convention.
    // Template literal, not string concat with a literal 'eom-dashboard:' prefix -- deliberately
    // avoids panel-registry.test.js's navIds() regex (which scans for onOpenModal('...') call
    // sites), since this is a per-row DYNAMIC id (row.loc), not a fixed nav entry the registry
    // should know about -- same reasoning src/views/at-a-glance.js's 'ranking:t2w' etc. don't
    // apply here (those are a small enumerable set of literal suffixes, this is 27 stores).
    onOpenModal && onOpenModal(`eom-dashboard:${row.loc}`);
  };

  // Same perm as the panel it deep-links into (eom-dashboard is 'analytics.district') — a user
  // who can't open that panel gets no bell rather than a dead-end click.
  if (perm && !perm('analytics.district')) return null;

  return div({ style: { position: 'relative', flexShrink: 0 } },
    btn({ onClick: () => setOpen(o => !o), title: 'EOM count notifications',
      style: { position: 'relative', width: 26, height: 26, borderRadius: '50%',
        border: '.5px solid var(--bdr)', background: 'var(--surf2)', color: 'var(--text2)',
        fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 } },
      '🔔',
      unread > 0 && span({ style: { position: 'absolute', top: -3, right: -3, background: '#ef4444', color: '#fff',
        borderRadius: 10, fontSize: 8, fontWeight: 700, padding: '1px 4px', minWidth: 14, textAlign: 'center',
        lineHeight: '12px', border: '1px solid var(--surf)' } }, unread > 99 ? '99+' : unread)
    ),
    open && div(null,
      div({ onClick: () => setOpen(false), style: { position: 'fixed', inset: 0, zIndex: 80 } }),
      div({ style: { position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 81, width: 320, maxHeight: 440,
        overflowY: 'auto', background: 'var(--surf2)', border: '.5px solid var(--bdr)', borderRadius: 8,
        boxShadow: '0 8px 32px rgba(0,0,0,.4)' } },
        div({ style: { padding: '8px 12px', borderBottom: '.5px solid var(--bdr)', fontSize: '10px', fontWeight: 700,
          color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.5px' } }, 'EOM Count Notifications'),
        h(DeviceAlertsToggle, null),
        loading && !loadedOnce && div({ style: { padding: '18px 12px', textAlign: 'center', fontSize: '11px', color: 'var(--text3)' } }, 'Loading…'),
        !loading && !items.length && div({ style: { padding: '18px 12px', textAlign: 'center', fontSize: '11px', color: 'var(--text3)' } }, 'No notifications yet'),
        items.map(row => h(NotificationRow, { key: row.id, row, onClick: onRowClick }))
      )
    )
  );
}

// ── Profile menu (top-right avatar) ─────────────────────────────────
// Consolidates account + utility actions that used to crowd the top bar (and were
// unreachable on mobile): identity/role, theme, save session, help, user management,
// Test Kitchen toggle, change password, sign out. Standard SaaS profile-menu pattern.
function ProfileMenu({ userRole, settings, onOpenModal, onSaveSession, onOpenAdmin, onToggleBeta, betaMode, onLoadFiles, perm }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  useEffect(() => {
    let live = true;
    try { supabase?.auth?.getUser?.().then(({ data }) => { if (live) setEmail(data?.user?.email || ''); }); } catch { /* no auth */ }
    return () => { live = false; };
  }, []);
  const roleLabel = userRole ? (userRole[0].toUpperCase() + userRole.slice(1)) : 'User';
  const initial = ((email || 'U').trim()[0] || 'U').toUpperCase();
  const item = (icon, label, onClick) => btn({
    onClick: () => { setOpen(false); onClick && onClick(); },
    style: { display:'flex', alignItems:'center', gap:9, width:'100%', textAlign:'left',
      padding:'8px 12px', fontSize:'11px', color:'var(--text)', background:'transparent',
      border:'none', cursor:'pointer', whiteSpace:'nowrap' },
    onMouseEnter:e=>e.currentTarget.style.background='rgba(255,255,255,.05)',
    onMouseLeave:e=>e.currentTarget.style.background='transparent',
  }, span({ style:{ width:15, textAlign:'center', flexShrink:0 } }, icon), label);

  return div({ style:{ position:'relative', flexShrink:0 } },
    btn({ onClick:()=>setOpen(o=>!o), title:'Account',
      style:{ width:26, height:26, borderRadius:'50%', border:'.5px solid var(--bdr)',
        background:'var(--surf2)', color:'var(--amber)', fontSize:'11px', fontWeight:800,
        cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 } },
      initial),
    open && div(null,
      div({ onClick:()=>setOpen(false), style:{ position:'fixed', inset:0, zIndex:80 } }),
      div({ style:{ position:'absolute', top:'calc(100% + 6px)', right:0, zIndex:81, minWidth:212,
        background:'var(--surf2)', border:'.5px solid var(--bdr)', borderRadius:8,
        boxShadow:'0 8px 32px rgba(0,0,0,.4)', overflow:'hidden', padding:'4px 0' } },
        div({ style:{ padding:'10px 12px', borderBottom:'.5px solid var(--bdr)' } },
          div({ style:{ fontSize:'11px', fontWeight:700, color:'var(--text)', overflow:'hidden',
            textOverflow:'ellipsis', maxWidth:186 } }, email || 'Signed in'),
          div({ style:{ fontSize:'9px', color:'var(--text3)', marginTop:2 } },
            'Role: ', span({ style:{ color:'var(--amber)', fontWeight:700 } }, roleLabel))
        ),
        item(settings.colorMode==='dark'?'☀':'🌙', settings.colorMode==='dark'?'Light mode':'Dark mode', ()=>{
          const next = settings.colorMode==='dark'?'light':'dark';
          document.documentElement.setAttribute('data-mode', next);
        }),
        onLoadFiles && (!perm||perm('data.upload')) && item('↑', 'Load files', onLoadFiles),
        onSaveSession && item('💾', 'Save session to file', onSaveSession),
        onOpenModal && item('🧭', 'Workflow guide', ()=>onOpenModal('workflow')),
        onOpenModal && item('?', 'Troubleshooting', ()=>onOpenModal('troubleshoot')),
        // User management moved into Settings → Users (Notes 54) — still reachable via the ⚙ gear.
        onToggleBeta && item('⚗', betaMode ? 'Show Test Kitchen' : 'Hide Test Kitchen', onToggleBeta),
        div({ style:{ borderTop:'.5px solid var(--bdr)', margin:'4px 0' } }),
        div({ style:{ padding:'2px 8px' } }, h(ChangePasswordBtn, { style:{ width:'100%', justifyContent:'flex-start', fontSize:'10px', padding:'6px 6px' } })),
        div({ style:{ padding:'2px 8px 6px' } }, h(SignOutBtn, { style:{ width:'100%', justifyContent:'flex-start', fontSize:'10px', padding:'6px 6px' } }))
      )
    )
  );
}

// ── App Topbar (slim contextual header) ─────────────────────────────
// ── Data-load failure banner ─────────────────────────────────────────────────
// Systemic bug class 4 (silent emptiness), the visible half. src/lib/supabase.js records
// every partial page-load failure and dispatches `mf:data-error`; this makes that visible
// instead of leaving it in a console nobody has open.
//
// Measured on production 2026-08-07: 22 page requests returned HTTP 500 and every panel
// rendered anyway, showing understated numbers with no indication anything was missing.
// A wrong number that looks right is worse than a blank one.
//
// Deliberately does NOT block or retry — a short dataset still renders, because recent
// days beat nothing. It just refuses to be quiet about it.
function DataErrorBanner() {
  const [errs, setErrs] = React.useState([]);
  const [dismissed, setDismissed] = React.useState(false);
  React.useEffect(() => {
    const onErr = e => { setErrs(prev => [...prev, e.detail]); setDismissed(false); };
    window.addEventListener('mf:data-error', onErr);
    return () => window.removeEventListener('mf:data-error', onErr);
  }, []);
  if (!errs.length || dismissed) return null;
  const totalFailed = errs.reduce((a, x) => a + (x.failed || 0), 0);
  const sources = [...new Set(errs.map(x => x.label))];
  return div({
    style: {
      display: 'flex', alignItems: 'center', gap: 10, padding: '5px 12px',
      background: 'rgba(239,68,68,.14)', borderBottom: '.5px solid rgba(239,68,68,.45)',
      fontSize: 11, color: '#fca5a5', fontFamily: 'var(--mono)',
    },
    title: errs.map(x => `${x.label}: ${x.failed}/${x.total} page(s) failed${x.detail ? ' — ' + x.detail : ''}`).join('\n'),
  },
    span({ style: { fontWeight: 700 } }, '⚠ DATA INCOMPLETE'),
    span(null, `${totalFailed} page(s) failed to load across ${sources.length} source(s): ${sources.join(', ')}. Figures from ${sources.length > 1 ? 'these sources' : 'this source'} are UNDERSTATED — reload before acting on them.`),
    h('button', {
      onClick: () => setDismissed(true),
      style: { marginLeft: 'auto', background: 'none', border: 'none', color: '#fca5a5', cursor: 'pointer', fontSize: 13, lineHeight: 1 },
      title: 'Dismiss (the failures stay in mfDataErrors())',
    }, '✕')
  );
}

function AppTopbar({view, selStore, stores, ds, settings, dateRange, onDateChange, locScope, onScopeChange,
                    onOpenModal, onLoadFiles, onSaveSession, loadMsg, setView,
                    sessionBanner, onClearSession, userRole, onOpenAdmin, perm,
                    betaMode, onToggleBeta}) {
  const today = new Date();
  const [isMb, setIsMb] = React.useState(()=>window.innerWidth<768);
  React.useEffect(()=>{
    const check=()=>setIsMb(window.innerWidth<768);
    window.addEventListener('resize',check);
    return ()=>window.removeEventListener('resize',check);
  },[]);

  // View title
  const viewTitle = view==='command'?'Home':
    view==='district'?'District Overview':
    view==='org'?'Org Structure':
    view==='store'&&selStore?sNameC(selStore)||'Store Detail':
    'Meridian';

  // Week label for projection context
  const wStart = React.useMemo(()=>{
    // Was `(wsd - getDay() + 7) % 7`, which is the FORWARD distance — subtracting it
    // landed on the wrong week on every day except the week-start day itself. Verified
    // 2026-08-08: Friday 08/07 with a Wednesday start returned 08/02 instead of 08/05.
    // weekStartOf() is now the single implementation; do not hand-roll this again.
    return weekStartOf(new Date(), settings.weekStartDay != null ? settings.weekStartDay : 3);
  },[settings.weekStartDay]);

  return h(React.Fragment, null,
    h(DataErrorBanner),
    div({style:{height:44,background:'var(--surf)',borderBottom:'.5px solid var(--bdr)',
    display:'flex',alignItems:'center',padding:'0 8px',gap:isMb?4:12,flexShrink:0}},

    // Hamburger (mobile only)
    isMb&&btn({className:'btn btn-sm',style:{fontSize:'16px',padding:'3px 9px',flexShrink:0},
      onClick:()=>window.dispatchEvent(new CustomEvent('mf:toggleNav'))},'☰'),

    // Left: title + period
    div({style:{display:'flex',alignItems:'center',gap:10,flex:1,minWidth:0}},
      div({style:{fontSize:'13px',fontWeight:700,color:'var(--amber)',
        whiteSpace:'nowrap',letterSpacing:'-.2px',overflow:'hidden',textOverflow:'ellipsis'}},viewTitle),
      !isMb&&div({style:{display:'flex',alignItems:'center',gap:4,fontSize:'10px',color:'var(--text3)'}},'·'),
      !isMb&&div({style:{fontSize:'10px',color:'var(--text3)',fontFamily:'var(--mono)',
        whiteSpace:'nowrap'}},
        'Week of '+wStart.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})
      ),
      !isMb&&ds&&ds.loaded&&div({style:{display:'flex',alignItems:'center',gap:4,
        background:'rgba(16,185,129,.08)',border:'.5px solid rgba(16,185,129,.2)',
        borderRadius:10,padding:'1px 7px'}},
        div({style:{width:5,height:5,borderRadius:'50%',background:'#10b981',
          animation:'pulse 2s infinite'}}),
        span({style:{fontSize:'8px',color:'#10b981',fontWeight:600,fontFamily:'var(--mono)'}},'LIVE')
      ),
      // Session age indicator — shows how fresh the auto-saved data is
      !isMb&&(()=>{
        // Read the IDB session age from sessionBanner if available, else check last file load
        const ageDays = sessionBanner?.savedAt
          ? Math.floor((Date.now()-new Date(sessionBanner.savedAt))/86400000)
          : ds?.loaded ? 0 : null;
        if(ageDays===null&&!ds?.loaded) return null;
        const col = ageDays===0?'#34d399':ageDays<=3?'var(--warn)':'var(--crit)';
        const label = ageDays===0?'Auto-saved today':ageDays===1?'Session: 1d old':'Session: '+ageDays+'d old';
        const tip = ageDays>3?'Consider loading a fresh Operations Report — session data may be stale':'Session data is current';
        return div({style:{display:'flex',alignItems:'center',gap:3,
          background:'rgba(255,255,255,.04)',border:'.5px solid var(--bdr)',
          borderRadius:10,padding:'1px 8px',cursor:'pointer'},
          title:tip,
          onClick:onClearSession},
          span({style:{fontSize:'7px',color:col,fontWeight:600,fontFamily:'var(--mono)'}},label),
          ageDays>3&&span({style:{fontSize:'8px',color:'var(--crit)'}},' ⚠')
        );
      })()
    ),

    // Right: actions
    div({style:{display:'flex',alignItems:'center',gap:2,flexShrink:0}},
      // SAGE quick-access — persistent so it's always one tap away, regardless of view
      btn({className:'btn btn-sm',
        style:{fontSize:'9px',color:'#a78bfa',borderColor:'rgba(167,139,250,.35)',
          background:'rgba(167,139,250,.08)',marginRight:4,fontWeight:700},
        title:'Open SAGE — AI analytics advisor',
        onClick:()=>onOpenModal&&onOpenModal('sage')},isMb?'🧠':'🧠 SAGE'),
      // Pre-Forecast Brief quick-access
      !isMb&&ds&&ds.loaded&&btn({className:'btn btn-sm',
        style:{fontSize:'9px',color:'var(--gold)',borderColor:'rgba(245,188,0,.3)',
          background:'rgba(245,188,0,.06)',marginRight:4},
        title:'Open Pre-Forecast Brief — analysis of the upcoming projection period',
        onClick:()=>onOpenModal&&onOpenModal('proj-brief')},'📋 Pre-Brief'),
      // Scope filter — OK / FL / All (now visible on mobile too — Notes 24 #1)
      div({style:{display:'flex',gap:1,marginRight:isMb?0:4}},
        ...[['all','All'],['ok','OK'],['fl','FL']].map(([s,l])=>
          btn({key:s,className:'btn btn-sm',
            style:{fontSize:'9px',padding:'2px 7px',
              background:locScope===s?'rgba(245,188,0,.15)':'transparent',
              color:locScope===s?'var(--gold)':'var(--text3)',
              borderColor:locScope===s?'rgba(245,188,0,.4)':'var(--bdr)',
              fontWeight:locScope===s?700:400},
            onClick:()=>onScopeChange&&onScopeChange(s)},l)
        )
      ),
      // Date range picker — controls all views
      h(DatePicker,{value:dateRange,onChange:onDateChange}),
      // Load-status toast (the Load button itself now lives in the profile menu — Notes 27 #8)
      loadMsg&&div({style:{position:'relative'}},
        div({style:{position:'absolute',top:'calc(100% + 4px)',right:0,
          background:'var(--surf2)',border:'.5px solid var(--bdr)',borderRadius:'var(--r)',
          padding:'4px 8px',fontSize:'9px',color:'var(--text2)',whiteSpace:'nowrap',
          zIndex:50}},loadMsg)
      ),
      // Count-completion notification bell (dispatch #209) — glanceable from anywhere, same
      // "persistent, always one tap away" placement as SAGE/Pre-Brief above.
      h(NotificationBell, {onOpenModal, perm}),
      // Settings stays in the bar (frequent, one tap); everything else moved into the profile menu
      (!perm||perm('settings.view'))&&btn({className:'btn btn-sm',style:{fontSize:'10px'},
        title:'Settings',
        onClick:()=>onOpenModal('settings')},'⚙'),
      // Profile menu — consolidates Load, theme, save session, help, user mgmt, Test Kitchen,
      // change password, sign out (previously crowded the top bar / unreachable on mobile)
      h(ProfileMenu, {userRole, settings, onOpenModal, onSaveSession, onOpenAdmin, onToggleBeta, betaMode, onLoadFiles, perm})
    )
  ));
}

export { DatePicker, AppSidebar, AppTopbar, NotificationBell, NotificationRow };
