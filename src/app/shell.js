// @ts-nocheck
import * as React from 'react';
import { sName, sNameC, OPTIONAL_PANELS } from '../constants.js';
import { addD, mwStart, nwStart, sodOf, eodOf, thisWeek, fmtDI, fmtRng, nDays, rngMode } from '../utils/date.js';
import { SignOutBtn, ChangePasswordBtn } from '../components/AuthGate.js';
import { supabase } from '../lib/supabase.js';

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
  const navItem = (label, icon, onClick, active, badge) =>
    div({style:{display:'flex',alignItems:'center',gap:collapsed?0:8,
      padding:collapsed?'8px 0':'6px 10px',borderRadius:'var(--r)',cursor:'pointer',
      background:active?'var(--adim)':'transparent',
      color:active?'var(--amber)':'var(--text2)',
      transition:'all .15s',justifyContent:collapsed?'center':'flex-start',
      position:'relative',fontSize:'12px',fontWeight:active?600:400},
      onClick:(...a)=>{onClick(...a);closeMobile();}, title:collapsed?label:undefined,
      onMouseEnter:e=>{e.currentTarget.style.background=active?'var(--adim)':'var(--surf2)';},
      onMouseLeave:e=>{e.currentTarget.style.background=active?'var(--adim)':'transparent';}},
      span({style:{fontSize:14,flexShrink:0}},icon),
      !collapsed&&span(null,label),
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

    // ── Navigation ──────────────────────────────────────────────
    div({style:{flex:1,overflowY:'auto',overflowX:'hidden',padding:collapsed?'8px 4px':'8px'}},

      // ── DAILY ──────────────────────────────────────────────────
      navLabel('DAILY'),
      navItem('Home',              '⌂', ()=>setView('command'),         view==='command'),
      navItem('Needs Attention',   '🔴', ()=>onOpenModal('attention'),  false, needsCount),
      pis('analytics.brief', 'Daily Brief',      '☀️', ()=>onOpenModal('morning-brief'), false),
      navItem('Date-Range Report', '📅', ()=>onOpenModal('report'),     false),
      navItem('Events & Tags',     '◷', ()=>onOpenModal('events'),     false),
      // ── PERFORMANCE ────────────────────────────────────────────
      can('analytics.store') && navLabel('PERFORMANCE'),
      pis('analytics.district', 'Org Summary',        '📊', ()=>onOpenModal('operator-summary'), false),
      pis('analytics.store',    'Store Scorecard',    '⇈', ()=>onOpenModal('ranking'),           false),
      // Planning hub (Notes 24): Targets · Monthly Projections · Pace · Yearly · Smart Targets, tabbed
      pis('analytics.store',    'Planning',           '🎯', ()=>onOpenModal('planning'),          false),
      // ── LABOR & SCHEDULING ─────────────────────────────────────
      // Scheduling hub (Notes 24): Labor Analytics · Scheduling · Schedule Summary · Labor Analysis · Skills, tabbed
      can('analytics.store') && navLabel('LABOR & SCHEDULING'),
      pis('analytics.store',    'Scheduling',         '🗓', ()=>onOpenModal('sched-hub'),         false),
      // ── PEOPLE / HR (Notes 24) ─────────────────────────────────
      (can('reviews.view')||can('analytics.store')) && navLabel('PEOPLE / HR'),
      pis('reviews.view',       'Performance Reviews','📋', ()=>onOpenModal('perf-reviews'),      false),
      pis('analytics.store',    'Visit Readiness',    '🛡️', ()=>onOpenModal('visit-readiness'),    false),
      pis('analytics.store',    'Graded Visits',      '📋', ()=>onOpenModal('graded-visits'),      false),
      // ── OPERATIONS ─────────────────────────────────────────────
      can('analytics.store') && navLabel('OPERATIONS'),
      pis('analytics.store',    'Food Cost',          '🥗', ()=>onOpenModal('fob-analysis'),     false),
      pis('analytics.store',    'End of Month',       '📋', ()=>onOpenModal('fob-eom'),          false),
      pis('analytics.district', 'EOM Supervisor',     '📊', ()=>onOpenModal('eom-summary'),      false),
      pis('analytics.store',    'Guest Voice',        '💬', ()=>onOpenModal('smg-voice'),        false, ds&&ds.smgRows&&ds.smgRows.length?ds.smgRows.length:null),
      pis('analytics.store',    '3PO Delivery',       '🛵', ()=>onOpenModal('delivery-mix'),     false),
      pis('analytics.store',    'Promo / Discount ROI','🎟️', ()=>onOpenModal('promo-roi'),        false),
      // ── ANALYTICS ──────────────────────────────────────────────
      can('analytics.store') && navLabel('ANALYTICS'),
      pis('analytics.store',    'Signals',            '📡', ()=>onOpenModal('signals'),            false),
      pis('analytics.store',    'DT Speed of Service','🚗', ()=>onOpenModal('dt-sos'),             false),
      navItem('SAGE',                                  '🧠', ()=>onOpenModal('sage'),               false),
      navItem('Feature Requests',                      '💡', ()=>onOpenModal('feature-requests'),   false),
      navItem('Task Queue',                             '⚡', ()=>onOpenModal('task-queue'),         false),
      pi('analytics.brief',       'Forecast Brief',   '🔭', ()=>onOpenModal('brief'),            false),
      pi('analytics.store',       'Market Intelligence','🗺',()=>onOpenModal('loc-intel'),        false),
      pi('analytics.district',    'District View',    '⊞', ()=>{setView('district');},   view==='district'),
      pi('analytics.store',       'Store One-Pager',  '📄', ()=>onOpenModal('one-pager'),        false),
      // ── TEST KITCHEN ───────────────────────────────────────────
      // PRUNE (Notes 24, v4.517): only NAV entries are trimmed here — every panel's
      // component + modal routing in App.js is left intact, so a pruned panel is still
      // reachable via onOpenModal('<id>') and is restored by uncommenting its line below.
      // Recall list is also kept in memory/panel-catalog.md. The forecast/engineered
      // diagnostic cluster is deliberately NOT pruned (standing owner directive: protect it).
      !betaMode && navLabel('⚗ TEST KITCHEN'),
      pi('analytics.forecasting', 'Projections',        '▦',  ()=>onOpenModal('proj'),          false),
      pi('analytics.forecasting', 'Proj vs Actuals',    '◑',  ()=>onOpenModal('pvsa'),          false),
      // PRUNED — exact duplicate of "Projections" (same 'proj' modal). Recall: uncomment.
      // pi('analytics.forecasting', 'Proj Workflow',      '🔒', ()=>onOpenModal('proj'),          false),
      pi('analytics.forecasting', 'Forecast Models',    '🎯', ()=>onOpenModal('model-assign'),  false),
      pi('analytics.forecasting', 'DI Calibration',     '◎',  ()=>onOpenModal('dialedin'),      false),
      pi('analytics.forecasting', 'Forecast Accuracy',  '🎯', ()=>onOpenModal('fcst-accuracy'), false),
      pi('analytics.forecasting', 'LifeLenz Gap',       '📊', ()=>onOpenModal('lfz-gap'),       false),
      pi('analytics.forecasting', 'DI Compare',         '⚡', ()=>onOpenModal('dicompare'),     false),
      pi('analytics.forecasting', 'Fcst Reference',     '📐', ()=>onOpenModal('fcst-ref'),      false),
      pi('analytics.forecasting', 'LifeLenz Bridge',    '🌉', ()=>onOpenModal('lifelenz-bridge'),false),
      // Optional / experimental panels (registry-driven) — hidden by default, toggled back
      // on per-panel in Admin → Panel Manager. Nothing deleted; modal routing stays in App.js.
      ...OPTIONAL_PANELS.filter(p=>(panelVis&&panelVis[p.id])&&(!p.perm||can(p.perm)))
        .map(p=>pi(p.perm, p.label, p.icon, ()=>onOpenModal(p.id), false)),
      // PRUNED — overlaps "Events & Tags" (recurring-rule calendar). Recall: uncomment.
      // (Still reachable via onOpenModal('calendar-manager'); recurring rules also live in Events & Tags.)
      // pi('analytics.dashboard',   'Calendar Manager',   '📅', ()=>onOpenModal('calendar-manager'),false),
      // ── ADMIN ──────────────────────────────────────────────────
      navLabel('ADMIN'),
      pis('settings.view', 'Settings',     '⚙', ()=>onOpenModal('settings'),               false),
      pis('settings.view', 'Panel Manager','🧩', ()=>onOpenModal('panel-manager'),          false),
      navItem('Changelog',       'ℹ️', ()=>onOpenModal('about'),                false),
      navItem('Knowledge Base',  '📖', ()=>onOpenModal('kb'),                   false),
      pis('data.upload',   'Data Manager', '🗄', ()=>onOpenModal('data-manager'),           false),
      navItem('Save Session',    '💾', ()=>onSaveSession&&onSaveSession(),      false),
      navItem('Restore Session', '📂', ()=>onRestoreSession&&onRestoreSession(),false),
      navItem('Help',            '?',  ()=>onOpenModal('help'),                 false),
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
        ds&&ds.storeIds&&div({style:{whiteSpace:'nowrap'}},
          ds.storeIds.length+' stores · '+
          (ds.laborRows&&ds.laborRows.length>0?Math.floor(ds.laborRows.length/1000)+'K rows':'no data'))
      )
    )
  ));
}

// ── Profile menu (top-right avatar) ─────────────────────────────────
// Consolidates account + utility actions that used to crowd the top bar (and were
// unreachable on mobile): identity/role, theme, save session, help, user management,
// Test Kitchen toggle, change password, sign out. Standard SaaS profile-menu pattern.
function ProfileMenu({ userRole, settings, onOpenModal, onSaveSession, onOpenAdmin, onToggleBeta, betaMode }) {
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
        onSaveSession && item('💾', 'Save session to file', onSaveSession),
        onOpenModal && item('❔', 'Help & guide', ()=>onOpenModal('help')),
        onOpenAdmin && item('👥', 'User management', onOpenAdmin),
        onToggleBeta && item('⚗', betaMode ? 'Show Test Kitchen' : 'Hide Test Kitchen', onToggleBeta),
        div({ style:{ borderTop:'.5px solid var(--bdr)', margin:'4px 0' } }),
        div({ style:{ padding:'2px 8px' } }, h(ChangePasswordBtn, { style:{ width:'100%', justifyContent:'flex-start', fontSize:'10px', padding:'6px 6px' } })),
        div({ style:{ padding:'2px 8px 6px' } }, h(SignOutBtn, { style:{ width:'100%', justifyContent:'flex-start', fontSize:'10px', padding:'6px 6px' } }))
      )
    )
  );
}

// ── App Topbar (slim contextual header) ─────────────────────────────
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
    const d=new Date(); const wsd=settings.weekStartDay!=null?settings.weekStartDay:3;
    const diff=(wsd-d.getDay()+7)%7; const w=new Date(d); w.setDate(d.getDate()-diff);
    return w;
  },[settings.weekStartDay]);

  return div({style:{height:44,background:'var(--surf)',borderBottom:'.5px solid var(--bdr)',
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
        const col = ageDays===0?'#34d399':ageDays<=3?'#f59e0b':'#f87171';
        const label = ageDays===0?'Auto-saved today':ageDays===1?'Session: 1d old':'Session: '+ageDays+'d old';
        const tip = ageDays>3?'Consider loading a fresh Operations Report — session data may be stale':'Session data is current';
        return div({style:{display:'flex',alignItems:'center',gap:3,
          background:'rgba(255,255,255,.04)',border:'.5px solid rgba(255,255,255,.1)',
          borderRadius:10,padding:'1px 8px',cursor:'pointer'},
          title:tip,
          onClick:onClearSession},
          span({style:{fontSize:'7px',color:col,fontWeight:600,fontFamily:'var(--mono)'}},label),
          ageDays>3&&span({style:{fontSize:'8px',color:'#f87171'}},' ⚠')
        );
      })()
    ),

    // Right: actions
    div({style:{display:'flex',alignItems:'center',gap:2,flexShrink:0}},
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
              borderColor:locScope===s?'rgba(245,188,0,.4)':'rgba(255,255,255,.1)',
              fontWeight:locScope===s?700:400},
            onClick:()=>onScopeChange&&onScopeChange(s)},l)
        )
      ),
      // Date range picker — controls all views
      h(DatePicker,{value:dateRange,onChange:onDateChange}),
      // Load files — hidden for roles without data.upload
      (!perm||perm('data.upload'))&&div({style:{position:'relative'}},
        btn({className:'btn btn-sm',style:{fontSize:'10px'},
          onClick:onLoadFiles},'↑ Load'),
        loadMsg&&div({style:{position:'absolute',top:'calc(100% + 4px)',right:0,
          background:'var(--surf2)',border:'.5px solid var(--bdr)',borderRadius:'var(--r)',
          padding:'4px 8px',fontSize:'9px',color:'var(--text2)',whiteSpace:'nowrap',
          zIndex:50}},loadMsg)
      ),
      // Settings stays in the bar (frequent, one tap); everything else moved into the profile menu
      (!perm||perm('settings.view'))&&btn({className:'btn btn-sm',style:{fontSize:'10px'},
        title:'Settings',
        onClick:()=>onOpenModal('settings')},'⚙'),
      // Profile menu — consolidates theme, save session, help, user mgmt, Test Kitchen,
      // change password, sign out (previously ~7 buttons, several unreachable on mobile)
      h(ProfileMenu, {userRole, settings, onOpenModal, onSaveSession, onOpenAdmin, onToggleBeta, betaMode})
    )
  );
}

export { DatePicker, AppSidebar, AppTopbar };
