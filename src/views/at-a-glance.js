// @ts-nocheck
// ── At A Glance — the district home screen ────────────────────────────────────
// Extracted out of analytics.js (issue #124): analytics.js held ~692 KB in the entry
// chunk, and AtAGlance (plus its 3 exclusive tiles) was the single biggest contributor
// — identified in Notes 61 as "the next real reduction," deferred to the redesign, and
// now overdue: 5 consecutive PRs each took a reasonable slice of the 850KB gzip budget
// and headroom fell from ~8KB to ~5.9KB without any one of them being a bad call.
//
// This is the app's DEFAULT LANDING VIEW (view==='command' in App.js), not a modal —
// unlike every other lazyPanel() consumer, which is opened by a deliberate user click and
// can show a full-screen "Loading…" overlay without it reading as a regression. App.js
// gives this component its OWN lazy wrapper with a fallback that matches the dashboard's
// background (no dark scrim over the nav/topbar) instead of reusing the generic
// _panelFallback, plus a startup prefetch so the chunk has almost always already arrived
// by the time ds/stores are ready (T1 alone can take several seconds) — see App.js.
import * as React from 'react';
import { STORE_NAMES, sNameC, DEFAULT_TARGETS, STORE_COORDS, INV_ORG_COORDS } from '../constants.js';
import { dKey, addD, mwStart } from '../utils/date.js';
import { forecastDay, modelHealthScore, getStoreOrg, computeMAPEDrift, computeStoreSigma, locRows } from '../engine/forecast.js';
import { computeEventFactors } from '../utils/events.js';
import { f$, fP } from '../utils/fmt.js';
import { reconcile as _recon } from '../lib/accuracy.js';
import { supabase, loadSagePromptRuns, loadEomCountStatus, loadQsrRawItemDetail, loadQsrVarianceStat, saveUserSetting, loadUserSetting } from '../lib/supabase.js';
import { ledgerScopeDiff, closeWindowStartFor } from '../engine/eom-ledger-baseline.js';
import { metricSeries, metricAvg } from '../engine/metric-source.js';
import { resolveLaborTarget } from '../engine/labor-basis.js';

const h=React.createElement;
const div=(p,...c)=>h('div',p,...c);
const span=(p,...c)=>h('span',p,...c);
const btn=(p,...c)=>h('button',p,...c);
const tr=(p,...c)=>h('tr',p,...c);
const td=(p,...c)=>h('td',p,...c);
const label=(p,...c)=>h('label',p,...c);
const th=(p,...c)=>h('th',p,...c);
const thead=(p,...c)=>h('thead',p,...c);
const tbody=(p,...c)=>h('tbody',p,...c);
const lbl=(p,...c)=>h('label',p,...c);

function SageRunsTile() {
  const [runs, setRuns] = React.useState(null);
  React.useEffect(() => { let live = true; loadSagePromptRuns(6).then(r => { if (live) setRuns(r || []); }).catch(() => { if (live) setRuns([]); }); return () => { live = false; }; }, []);
  const rel = ts => { if (!ts) return ''; const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000); if (s < 3600) return Math.max(1, Math.floor(s / 60)) + 'm ago'; if (s < 86400) return Math.floor(s / 3600) + 'h ago'; return Math.floor(s / 86400) + 'd ago'; };
  const card = (...kids) => h('div', { style: { background: 'var(--surf2,#151821)', border: '.5px solid var(--bdr,#2a2f3a)', borderRadius: 12, overflow: 'hidden' } }, ...kids);
  const head = h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '.5px solid var(--bdr,#2a2f3a)' } },
    h('span', { style: { fontSize: 15 } }, '🧭'),
    h('div', { style: { flex: 1 } },
      h('div', { style: { fontSize: 12, fontWeight: 800, color: 'var(--text,#e8eaed)' } }, 'SAGE Scheduled Runs'),
      h('div', { style: { fontSize: 9, color: 'var(--text3,#6b7280)' } }, 'Auto-run prompt results · manage in SAGE → 📚 Prompts')));
  if (runs === null) return card(head, h('div', { style: { padding: 16, fontSize: 11, color: 'var(--text3,#6b7280)', textAlign: 'center' } }, 'Loading…'));
  if (!runs.length) return card(head, h('div', { style: { padding: '16px 14px', fontSize: 11, color: 'var(--text3,#6b7280)', lineHeight: 1.5 } }, 'No scheduled runs yet. In SAGE, save a prompt (📚 Prompts) and set a schedule to have it run automatically — results land here.'));
  return card(head, h('div', null, ...runs.map(r => h('div', { key: r.id, style: { padding: '8px 14px', borderBottom: '.5px solid rgba(255,255,255,.05)' } },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
      h('span', { style: { width: 6, height: 6, borderRadius: '50%', background: r.ok ? '#10b981' : '#ef4444', flexShrink: 0 } }),
      h('div', { style: { fontSize: 11, fontWeight: 700, color: 'var(--text,#e8eaed)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, r.title || 'Prompt'),
      h('span', { style: { fontSize: 9, color: 'var(--text3,#6b7280)' } }, rel(r.ranAt))),
    h('div', { style: { fontSize: 10, color: 'var(--text3,#9aa0aa)', marginTop: 2, lineHeight: 1.4, maxHeight: 30, overflow: 'hidden' } },
      r.ok ? ((r.resultMd || '').replace(/[#*|`>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 140) || '—') : ('⚠ ' + (r.error || 'failed')))))));
}

// EOM Count-progress tile — surfaces the EOM Scoreboard front-and-center during the last 3
// days of the month (Notes 34). Computes the same buckets as the dashboard scoreboard from
// eom_count_status alone (no on-hand load); click opens the EOM Dashboard (Scoreboard tab).
function EOMScoreboardTile({ onOpenModal }) {
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const inWindow = now.getDate() >= lastDay - 2;   // last 3 days of the month
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [rows, setRows] = React.useState(null);
  React.useEffect(() => {
    if (!inWindow) return;
    let live = true;
    loadEomCountStatus({ period }).then(r => { if (live) setRows(r || []); }).catch(() => { if (live) setRows([]); });
    return () => { live = false; };
  }, [inWindow, period]);
  if (!inWindow) return null;

  const bucketOf = r => {
    const pct = r.pctCounted ?? 0;
    if ((r.commsStatus || 'none') !== 'none') return 'comms';
    if ((r.diagnosisStatus || 'pending') !== 'pending') return 'reviewed';
    if (pct >= 0.9) return 'ready';
    if (pct > 0.01) return 'counting';
    return 'notstarted';
  };
  const PILL = { notstarted: ['Not started', '#6b7280'], counting: ['Counting', '#38bdf8'], ready: ['Ready for you', '#f5bc00'], reviewed: ['Reviewed', '#4ade80'], comms: ['Comms sent', '#a78bfa'] };
  const tally = { notstarted: 0, counting: 0, ready: 0, reviewed: 0, comms: 0 };
  for (const r of (rows || [])) tally[bucketOf(r)]++;
  const readyN = tally.ready;
  // Freshness: latest eom_count_status import (updated_at) across stores = last count pull.
  const freshTs = (rows || []).reduce((m, r) => Math.max(m, r.updatedAt ? new Date(r.updatedAt).getTime() : 0), 0);
  const freshLbl = freshTs ? new Date(freshTs).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';

  const card = (...kids) => h('div', { onClick: () => onOpenModal && onOpenModal('eom-dashboard'), style: { background: 'var(--surf2,#151821)', border: '.5px solid ' + (readyN > 0 ? 'rgba(245,188,0,.5)' : 'var(--bdr,#2a2f3a)'), borderRadius: 12, overflow: 'hidden', cursor: 'pointer' }, title: 'Open the EOM Dashboard scoreboard' }, ...kids);
  const head = h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '.5px solid var(--bdr,#2a2f3a)' } },
    h('span', { style: { fontSize: 15 } }, '📦'),
    h('div', { style: { flex: 1 } },
      h('div', { style: { fontSize: 12, fontWeight: 800, color: 'var(--text,#e8eaed)' } }, 'EOM Count Progress'),
      h('div', { style: { fontSize: 9, color: 'var(--text3,#6b7280)' } }, 'Last 3 days · ' + (freshLbl ? 'imported ' + freshLbl : 'tap to open the scoreboard'))),
    readyN > 0 ? h('span', { style: { fontSize: 10, fontWeight: 800, color: '#111', background: '#f5bc00', borderRadius: 10, padding: '2px 8px' } }, readyN + ' ready') : null);
  if (rows === null) return card(head, h('div', { style: { padding: 16, fontSize: 11, color: 'var(--text3,#6b7280)', textAlign: 'center' } }, 'Loading…'));
  if (!rows.length) return card(head, h('div', { style: { padding: '16px 14px', fontSize: 11, color: 'var(--text3,#6b7280)', lineHeight: 1.5 } }, 'Counts populate as stores work through the last-3-day window (the On-Hand pull runs ~8a/10a/2p CT).'));
  return card(head, h('div', { style: { padding: '10px 14px', display: 'flex', gap: 6, flexWrap: 'wrap' } },
    ...['ready', 'counting', 'reviewed', 'comms', 'notstarted'].map(k => h('div', { key: k, style: { flex: '1 1 70px', border: '.5px solid var(--bdr,#2a2f3a)', borderLeft: '3px solid ' + PILL[k][1], borderRadius: 8, padding: '6px 8px' } },
      h('div', { style: { fontSize: 9, color: 'var(--text3,#6b7280)', textTransform: 'uppercase', letterSpacing: '.3px' } }, PILL[k][0]),
      h('div', { style: { fontSize: 18, fontWeight: 800, color: k === 'ready' && tally[k] > 0 ? '#f5bc00' : 'var(--text,#e8eaed)' } }, String(tally[k]))))));
}

// Items Recounted tile (Notes 45 #81) — district-wide close-window recount rollup on the main
// dashboard: how many items stores went back and re-verified during the EOM close, and whether
// those recounts collectively pulled variance TOWARD zero (helped) or away (hurt). Same close-window
// engine as the Change Monitor (ledgerScopeDiff). Visible in the close window + the first days after.
// Click opens the EOM Dashboard → Change Monitor.
function ItemsRecountedTile({ onOpenModal }) {
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const day = now.getDate();
  // Relevant during the close window (last 3 days) and the first week after (recounts just landed).
  const inWindow = day >= lastDay - 2 || day <= 7;
  // In the first week the just-closed PRIOR month is the interesting period; otherwise this month.
  const target = (day <= 7) ? new Date(now.getFullYear(), now.getMonth() - 1, 1) : now;
  const period = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}`;
  // undefined = still loading · null = genuinely no rows · {} = result
  const [diff, setDiff] = React.useState(undefined);
  // Separate from `diff`. Until v4.864 a failed read and an empty period both set
  // diff=null, so a transient 500 rendered "No ledger detail" — indistinguishable from
  // "nothing was recounted". Verified 2026-08-07: period 2026-07 held 695 rows across 27
  // stores (54 items recounted, $3,680 net recovered) while the tile showed no data.
  const [loadErr, setLoadErr] = React.useState(null);
  const [tryN, setTryN] = React.useState(0);
  React.useEffect(() => {
    if (!inWindow) return;
    let live = true;
    (async () => {
      let failed = false;
      try {
        const [rawDetail, variance] = await Promise.all([
          loadQsrRawItemDetail({ period }).catch(() => { failed = true; return []; }),
          loadQsrVarianceStat({ period }).catch(() => []),
        ]);
        if (!live) return;
        // fetchAll marks a truncated read non-enumerably rather than throwing.
        if (rawDetail && rawDetail._partial) failed = true;
        if (failed) { setLoadErr('read failed'); setDiff(undefined); return; }
        setLoadErr(null);
        if (!rawDetail || !rawDetail.length) { setDiff(null); return; }
        const norm = s => String(s || '').replace(/^0+/, '') || String(s || '');
        const rawByLoc = {}, perLoc = {};
        for (const r of rawDetail) {
          const k = norm(r.loc);
          (rawByLoc[k] || (rawByLoc[k] = [])).push({ wrin: r.wrin, descr: r.descr, history: r.history, caseSz: r.caseSz, uom: r.uom });
        }
        for (const v of (variance || [])) {
          const k = norm(v.loc);
          if (!perLoc[k]) perLoc[k] = { closeWindowStart: closeWindowStartFor(period, 3), statVar: {} };
          if (v.dolDiff != null) perLoc[k].statVar[String(v.wrin)] = v.dolDiff;
        }
        for (const k of Object.keys(rawByLoc)) if (!perLoc[k]) perLoc[k] = { closeWindowStart: closeWindowStartFor(period, 3), statVar: {} };
        setDiff(ledgerScopeDiff(rawByLoc, perLoc));
      } catch { if (live) { setLoadErr('read failed'); setDiff(undefined); } }
    })();
    return () => { live = false; };
    // tryN is in the deps so a retry actually re-runs. Without it the effect's deps
    // (inWindow, period) never change during a session, so ONE transient failure at
    // cold start pinned the tile to its empty state until a full reload.
  }, [inWindow, period, tryN]);
  if (!inWindow) return null;

  const totalRecounted = diff && diff.stores ? diff.stores.reduce((s, x) => s + (x.nRecounted || 0), 0) : 0;
  const helped = diff ? (diff.totalHelped || 0) : 0;
  const hurt = diff ? (diff.totalHurt || 0) : 0;
  const net = helped - hurt;                                     // + = collectively toward zero
  const dir = Math.abs(net) < 25 ? 'flat' : net > 0 ? 'helped' : 'hurt';
  const DIR = { helped: ['↑ Helped', '#10b981'], hurt: ['↓ Hurt', '#ef4444'], flat: ['→ Neutral', '#9aa0aa'] };
  const money = n => '$' + Math.round(Math.abs(n)).toLocaleString();
  const perLbl = target.toLocaleDateString([], { month: 'short', year: 'numeric' });

  const card = (...kids) => h('div', { onClick: () => onOpenModal && onOpenModal('eom-dashboard'),
    style: { background: 'var(--surf2,#151821)', border: '.5px solid ' + (totalRecounted > 0 ? 'rgba(96,165,250,.4)' : 'var(--bdr,#2a2f3a)'), borderRadius: 12, overflow: 'hidden', cursor: 'pointer' },
    title: 'Open the EOM Dashboard → Change Monitor' }, ...kids);
  const head = h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '.5px solid var(--bdr,#2a2f3a)' } },
    h('span', { style: { fontSize: 15 } }, '🔁'),
    h('div', { style: { flex: 1 } },
      h('div', { style: { fontSize: 12, fontWeight: 800, color: 'var(--text,#e8eaed)' } }, 'Items Recounted'),
      h('div', { style: { fontSize: 9, color: 'var(--text3,#6b7280)' } }, perLbl + ' close window · did recounts help or hurt')),
    totalRecounted > 0 ? h('span', { style: { fontSize: 10, fontWeight: 800, color: DIR[dir][1], background: 'rgba(255,255,255,.05)', borderRadius: 10, padding: '2px 8px', border: '.5px solid ' + DIR[dir][1] } }, DIR[dir][0]) : null);
  // A failed read is NOT "no data" — say so, and offer a way out. The tile fires an
  // uncoordinated district-wide read at dashboard mount, competing with the cold-start
  // burst, so a transient 500 here is expected rather than exceptional.
  if (loadErr) return card(head, h('div', { style: { padding: '16px 14px', fontSize: 11, color: 'var(--text3,#6b7280)', lineHeight: 1.5 } },
    h('div', { style: { color: '#f59e0b', fontWeight: 700, marginBottom: 4 } }, 'Could not load ledger detail'),
    h('div', null, 'The read failed — this is not the same as "no recounts". '),
    h('button', {
      onClick: (e) => { e.stopPropagation(); setLoadErr(null); setDiff(undefined); setTryN(n => n + 1); },
      style: { marginTop: 8, background: 'none', border: '1px solid var(--bdr2,#3a4050)', borderRadius: 6, color: 'var(--text2,#9aa4b2)', padding: '4px 10px', cursor: 'pointer', fontSize: 11 },
    }, '↻ Retry')));
  if (diff === undefined) return card(head, h('div', { style: { padding: 16, fontSize: 11, color: 'var(--text3,#6b7280)', textAlign: 'center' } }, 'Loading…'));
  if (diff === null) return card(head, h('div', { style: { padding: '16px 14px', fontSize: 11, color: 'var(--text3,#6b7280)', lineHeight: 1.5 } }, 'No ledger detail for ' + perLbl + ' yet — recounts appear here once stores count in the close window.'));
  if (totalRecounted === 0) return card(head, h('div', { style: { padding: '16px 14px', fontSize: 11, color: 'var(--text3,#6b7280)', lineHeight: 1.5 } }, 'No recounts detected yet across ' + (diff.nStores || 0) + ' stores. A recount = an item re-verified on a later day of the close window.'));
  return card(head, h('div', { style: { padding: '10px 14px', display: 'flex', gap: 10, alignItems: 'stretch' } },
    // big number
    h('div', { style: { flex: '0 0 auto', display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 76, borderRight: '.5px solid var(--bdr,#2a2f3a)', paddingRight: 12 } },
      h('div', { style: { fontSize: 30, fontWeight: 800, color: 'var(--text,#e8eaed)', lineHeight: 1 } }, String(totalRecounted)),
      h('div', { style: { fontSize: 9, color: 'var(--text3,#6b7280)', textTransform: 'uppercase', letterSpacing: '.3px', marginTop: 3 } }, 'items · ' + (diff.active || 0) + ' stores')),
    // net + breakdown
    h('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4 } },
      h('div', { style: { fontSize: 13, fontWeight: 800, color: DIR[dir][1] } }, dir === 'flat' ? 'Net wash' : (money(net) + ' variance ' + (net > 0 ? 'recovered' : 'lost'))),
      h('div', { style: { fontSize: 10, color: 'var(--text3,#9aa0aa)', display: 'flex', gap: 10, flexWrap: 'wrap' } },
        h('span', null, h('span', { style: { color: '#10b981', fontWeight: 700 } }, money(helped)), ' toward zero'),
        h('span', null, h('span', { style: { color: '#ef4444', fontWeight: 700 } }, money(hurt)), ' away')),
      h('div', { style: { fontSize: 10, color: 'var(--text3,#6b7280)', display: 'flex', gap: 10, flexWrap: 'wrap' } },
        h('span', null, h('span', { style: { color: '#4ade80', fontWeight: 700 } }, diff.improved || 0), ' improving'),
        (diff.worsened || 0) > 0 ? h('span', null, h('span', { style: { color: '#f87171', fontWeight: 700 } }, diff.worsened), ' made worse') : null,
        h('span', null, h('span', { style: { color: '#9aa0aa', fontWeight: 700 } }, diff.noAction || 0), ' no action')))));
}

function AtAGlance({stores, ds, settings, userEvents, lockedProjections, dateRange, onOpenStore, onOpenProjections, onOpenPVSA, onOpenBrief, onNav, onOpenModal}) {
  const today = new Date();
  const allLocs = (stores||[]).filter(s=>/^\d+$/.test(s.loc)).map(s=>s.loc);
  // Market split by store state (STORE_COORDS carries no org, so it defaulted
  // every store to MCDOK and left the FL pill empty). OK: = Oklahoma stores,
  // FL: = Florida (panhandle) stores — matching the pill labels.
  const stateOf = loc => (INV_ORG_COORDS[String(loc)]||{}).state;
  // Canonical org mapping (matches getStoreOrg in constants.js): MCDOK = Oklahoma,
  // Emerald Arches = Florida panhandle. This was previously inverted, which made the
  // projection table tag every FL store "OK" and every OK store "FL".
  const orgOf = loc => stateOf(loc)==='FL' ? 'Emerald Arches' : 'MCDOK';
  const okLocs = allLocs.filter(l=>stateOf(l)==='OK');
  const flLocs = allLocs.filter(l=>stateOf(l)==='FL');

  // ── Date range comes from the toolbar (global App state) ───────────────
  // The toolbar date picker controls the date range for all views including At a Glance.

  const inRange = (d,r) => d&&r&&r.s&&r.e&&d>=r.s&&d<=r.e;

  // ── Comment mode ─────────────────────────────────────────────
  const [commentMode,setCommentMode] = React.useState(()=>localStorage.getItem('mf_comment_mode')||'rule');
  const [aiComment,setAiComment] = React.useState(null);
  const [aiLoading,setAiLoading] = React.useState(false);

  // ── Section config ───────────────────────────────────────────
  const DEF_SECS=[
    {id:'sage',label:'SAGE Scheduled Runs',icon:'🧭',on:true},
    {id:'intelligence',label:'Intelligence Summary',icon:'🧠',on:true},
    {id:'projections',label:'Projections & Forecasting',icon:'📈',on:true},
    {id:'sales',label:'Sales & Guest Counts',icon:'💰',on:true},
    {id:'digital',label:'Digital Sales',icon:'📱',on:true},
    {id:'service',label:'Service',icon:'⚡',on:true},
    {id:'controls',label:'Controls & Labor',icon:'🔒',on:true},
    {id:'fob',label:'FOB & Food Cost',icon:'🍟',on:true},
    {id:'radar',label:'District Pulse',icon:'🎯',on:true},
    {id:'leaderboard',label:'Store Leaderboard',icon:'🏆',on:true},
    {id:'labor',label:'Labor (standalone)',icon:'👥',on:false},
  ];
  const [secs,setSecs] = React.useState(()=>{
    try{const s=JSON.parse(localStorage.getItem('mf_kpi_secs')||'null');if(!s)return DEF_SECS;const merged=[...s];DEF_SECS.forEach(d=>{if(!merged.find(m=>m.id===d.id))merged.push(d);});return merged;}catch(e){return DEF_SECS;}
  });
  // Cross-device sync (2026-08-04) — mf_kpi_secs was localStorage-only, so tile visibility
  // (e.g. Labor on/off) silently diverged per device with no way to reconcile. Supabase is
  // the source of truth once it responds; localStorage stays as the instant-paint cache
  // (same architecture as every other client-cache-fallback-only setting per CLAUDE.md).
  React.useEffect(()=>{
    let live=true;
    loadUserSetting('kpi_secs').then(remote=>{
      if(!live||!Array.isArray(remote)||!remote.length) return;
      const merged=[...remote];DEF_SECS.forEach(d=>{if(!merged.find(m=>m.id===d.id))merged.push(d);});
      setSecs(merged);
      try{localStorage.setItem('mf_kpi_secs',JSON.stringify(merged));}catch{}
    }).catch(()=>{});
    return ()=>{live=false;};
  },[]);
  const [showSecCfg,setShowSecCfg] = React.useState(false);
  const [lbMetric,setLbMetric] = React.useState('sales'); // leaderboard selected metric
  const saveSecs = s=>{setSecs(s);try{localStorage.setItem('mf_kpi_secs',JSON.stringify(s));}catch{};saveUserSetting('kpi_secs',s).catch(()=>{});};
  // ── Per-section collapse (mobile, session-only) ───────────────
  const [collapsedSecs, setCollapsedSecs] = React.useState({});
  const collapseToggle = id => setCollapsedSecs(p => ({...p, [id]: !p[id]}));
  const collBtn = id => btn({
    style:{fontSize:'12px',background:'none',border:'none',color:'var(--text3)',
      cursor:'pointer',padding:'4px 8px',borderRadius:3,flexShrink:0,
      minWidth:32,minHeight:32,display:'flex',alignItems:'center',justifyContent:'center',
      touchAction:'manipulation'},
    onClick:e=>{e.stopPropagation();collapseToggle(id);},
    title:collapsedSecs[id]?'Expand section':'Collapse section'
  },collapsedSecs[id]?'▸':'▾');
  const toggleSec = id=>saveSecs(secs.map(s=>s.id===id?{...s,on:!s.on}:s));
  const moveSec = (id,dir)=>{
    const idx=secs.findIndex(s=>s.id===id);if(idx<0)return;
    const n=[...secs];const to=idx+dir;if(to<0||to>=n.length)return;
    [n[idx],n[to]]=[n[to],n[idx]];saveSecs(n);
  };

  // ── Action checklist ─────────────────────────────────────────
  const [cl,setCl] = React.useState(()=>{
    try{return JSON.parse(localStorage.getItem('mf_checklist_v2')||'[]');}catch(e){return [];}
  });
  const [showArchive,setShowArchive] = React.useState(false);
  const saveCl = c=>{setCl(c);localStorage.setItem('mf_checklist_v2',JSON.stringify(c));};

  // Auto-generate checklist items from app state
  const autoItems = React.useMemo(()=>{
    const items=[];
    // Freshness = newest business date across manual labor AND every auto-synced
    // feed (DAR summary, FOB, Daily Glimpse, Cash Sheet), clamped to today so a
    // stale manual upload can't mask fresh auto data and LifeLenz's forward
    // schedule can't skew it.
    const _tMs=today.getTime();
    const _pick=arr=>(arr||[]).map(r=>r.date).filter(Boolean)
      .map(d=>d instanceof Date?d.getTime():new Date(d).getTime());
    const _freshD=[..._pick(ds?.laborRows),..._pick(ds?.qsrActSummaryRows),..._pick(ds?.qsrFobRows),
      ..._pick(ds?.glimpseRows),..._pick(ds?.cashRows)].filter(ms=>!isNaN(ms)&&ms<=_tMs);
    const latestLab = _freshD.length?new Date(Math.max(..._freshD)):null;
    const dataAge = latestLab?Math.floor((today-latestLab)/864e5):999;
    if(dataAge>14) items.push({id:'auto_data_stale',priority:'high',
      text:'Sales data is '+dataAge+' days old — QSRSoft auto-sync may be down',
      detail:'Check the daily pull (Signals → Sync), or upload an Operations Report as fallback.'});
    else if(dataAge>7) items.push({id:'auto_data_warn',priority:'medium',
      text:'Sales data is '+dataAge+' days old — verify auto-sync',detail:''});
    const wsd=settings.weekStartDay!=null?settings.weekStartDay:3;
    const ws=new Date(today);while(ws.getDay()!==wsd)ws.setDate(ws.getDate()-1);
    const wsKey=dKey(ws);
    const lp=lockedProjections||{};
    const unlocked=allLocs.filter(loc=>!lp[loc+'_'+wsKey]);
    if(unlocked.length>0) items.push({id:'auto_locks',priority:'high',
      text:unlocked.length+' store'+(unlocked.length>1?'s':'')+' missing this week\'s projection lock',
      detail:unlocked.map(l=>STORE_NAMES[l]||l).join(', ')});
    // Guard null scores: `null < 50` is true in JS, so an insufficient-data store used to
    // count as red here while the header (which skips null) didn't — the 1-vs-2 mismatch.
    const redStores=allLocs.filter(loc=>{const s=modelHealthScore(loc,ds,settings).score;return s!=null&&s<50;});
    if(redStores.length>0) items.push({id:'auto_red_health',priority:'high',
      text:redStores.length+' store'+(redStores.length>1?'s':'')+' at red model health',
      detail:redStores.map(l=>STORE_NAMES[l]||l).join(', ')});
    const uncal=allLocs.filter(loc=>{
      const di=settings.dialedIn&&settings.dialedIn[loc];
      if(!di)return true;
      return di.runDate&&Math.floor((today-new Date(di.runDate))/864e5)>30;
    });
    if(uncal.length>3) items.push({id:'auto_calibration',priority:'medium',
      text:uncal.length+' stores need Dialed-In calibration (>30 days)',
      detail:'Go to Dialed-In → Run & Apply'});
    return items;
  },[ds?.laborRows?.length,allLocs,settings,lockedProjections]);

  const activeCl=cl.filter(c=>!c.archivedAt);
  const archivedCl=cl.filter(c=>c.archivedAt);
  const activeAutoItems=autoItems.filter(ai=>!cl.find(c=>c.id===ai.id&&c.archivedAt&&(today-new Date(c.archivedAt))<86400000));
  const allActiveItems=[...activeAutoItems,...activeCl.filter(c=>!c.id.startsWith('auto_'))];

  const archiveItem=id=>{
    const now=new Date().toISOString();
    // For auto items: add to cl with archivedAt
    if(id.startsWith('auto_')){
      const existing=cl.find(c=>c.id===id);
      if(existing) saveCl(cl.map(c=>c.id===id?{...c,archivedAt:now}:c));
      else saveCl([...cl,{id,archivedAt:now,text:autoItems.find(a=>a.id===id)?.text||'',isAuto:true}]);
    } else {
      saveCl(cl.map(c=>c.id===id?{...c,archivedAt:now}:c));
    }
  };
  const restoreItem=id=>saveCl(cl.map(c=>c.id===id?{...c,archivedAt:null}:c));
  const deleteItem=id=>saveCl(cl.filter(c=>c.id!==id));

  // ── Aggregation helpers ───────────────────────────────────────

  // effectiveDateRange: use toolbar period if it has data, otherwise fall
  // back to most recent 30 days of loaded data so tiles always show content.
  const effectiveDateRange = React.useMemo(()=>{
    if(!dateRange?.s) return dateRange;
    // Auto-aware (Notes: Jul-2026). The old check only looked at manual laborRows, so once
    // manual uploads stopped it fell back to a 30-day window ending at the LAST MANUAL date
    // (~Jul 15) — pinning every At-A-Glance tile to "as of 7/15" even though the auto DAR /
    // emailed streams were current. Now treat the selected range as populated when ANY
    // current-window stream (manual OR auto DAR OR Daily Glimpse) has a day in it, and if it
    // genuinely has none, anchor the fallback to the FRESHEST date across all of them.
    const _t=d=>d instanceof Date?d.getTime():new Date(d).getTime();
    const inSel=r=>r.date&&_t(r.date)>=_t(dateRange.s)&&_t(r.date)<=_t(dateRange.e);
    const streams=[ds?.laborRows,ds?.qsrActSummaryRows,ds?.glimpseRows];
    const hasData=streams.some(arr=>(arr||[]).some(inSel));
    if(hasData)return{...dateRange,isFallback:false};
    const dates=streams.flatMap(arr=>(arr||[]).map(r=>r.date)).filter(Boolean).map(_t).filter(t=>!isNaN(t));
    if(!dates.length)return{...dateRange,isFallback:false};
    const maxD=new Date(Math.max(...dates));
    const minD=new Date(maxD);minD.setDate(minD.getDate()-29);minD.setHours(0,0,0,0);
    const toD=new Date(maxD);toD.setHours(23,59,59,999);
    return{s:minD,e:toD,isFallback:true,
      fallbackLabel:maxD.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})};
  },[dateRange,ds?.laborRows?.length,ds?.qsrActSummaryRows?.length,ds?.glimpseRows?.length]);

  const labInRange = React.useMemo(()=>{
    // FRESHEST-PER-DAY merge, not all-or-nothing (Notes: Jul-2026 "reverts to old date" bug).
    // The old code used ONLY manual rows whenever ANY manual row fell in the range — so a
    // range spanning the last manual upload (e.g. MTD) dropped every auto day AFTER it, and
    // on load the tile flipped from current (auto, before laborRows arrived) back to the last
    // manual date once laborRows loaded. Now: auto fills every day, manual overrides the same
    // day it covers (an intentional upload), so recent days always show from the auto stream.
    const inR=r=>r&&r.date&&inRange(r.date,effectiveDateRange);
    const manual=(ds?.laborRows||[]).filter(inR);
    const auto=(ds?.qsrActSummaryRows||[]).filter(inR);
    const k=r=>String(r.loc)+'|'+(r.date instanceof Date?r.date.toISOString().slice(0,10):String(r.date).slice(0,10));
    const m=new Map();
    for(const r of auto)   m.set(k(r),r);   // auto/DAR fills every day (incl. the recent ones)
    for(const r of manual) m.set(k(r),r);   // a manual upload intentionally overrides its own day
    return [...m.values()];
  },[ds?.laborRows?.length,ds?.qsrActSummaryRows?.length,effectiveDateRange]);

  // True during the post-reload load race: the core daily streams haven't populated ds
  // yet (App.js loads them from Supabase a beat after first paint). Lets a tile show
  // "Loading…" instead of "No data for this period" — the latter reads as "nothing
  // exists" when the data is simply still in flight (the blank-Sales-tile-on-reload report).
  const coreStreamsLoading=React.useMemo(()=>{
    const n=k=>(ds?.[k]?.length||0);
    return (n('laborRows')+n('qsrActSummaryRows')+n('opsRows')+n('glimpseRows')+n('ctrlRows')+n('salesLedgerRows'))===0;
  },[ds?.laborRows?.length,ds?.qsrActSummaryRows?.length,ds?.opsRows?.length,ds?.glimpseRows?.length,ds?.ctrlRows?.length,ds?.salesLedgerRows?.length]);

  // True when labInRange is sourced from QSRSoft auto-sync rather than manual upload
  const usingQsrFallback=React.useMemo(()=>{
    const manual=(ds?.laborRows||[]).filter(r=>inRange(r.date,effectiveDateRange));
    return manual.length===0&&(ds?.qsrActSummaryRows||[]).length>0;
  },[ds?.laborRows?.length,ds?.qsrActSummaryRows?.length,effectiveDateRange]);

  const opsInRange = React.useMemo(()=>
    (ds?.opsRows||[]).filter(r=>inRange(r.date,effectiveDateRange))
  ,[ds?.opsRows?.length,effectiveDateRange]);

  const ctrlInRange = React.useMemo(()=>
    (ds?.ctrlRows||[]).filter(r=>inRange(r.date,effectiveDateRange))
  ,[ds?.ctrlRows?.length,effectiveDateRange]);

  // FOB is monthly data (dated the 1st of each month).
  // Always show the most recent available month — don't filter by the weekly dateRange.
  const fobRecent = React.useMemo(()=>{
    const rows=ds?.fobRows||[];
    if(!rows.length)return [];
    const dates=rows.map(r=>r.date).filter(Boolean);
    if(!dates.length)return [];
    const maxDate=new Date(Math.max(...dates));
    return rows.filter(r=>r.date&&
      r.date.getFullYear()===maxDate.getFullYear()&&
      r.date.getMonth()===maxDate.getMonth());
  },[ds?.fobRows?.length]);
  // Auto FOB fallback from qsr_fob → percentages of Product Net Sales. Each FOB
  // component = component_amt / prodSalesAmt (FOB total excludes Disc/Coupon,
  // reference only). P&L Food/Paper Cost = (begin + purchases + adjustments +
  // transfers − promotions − end) / prodSalesAmt — confirmed against the report
  // (store 5985: base food 22.7%, P&L food 27.3%). NOTE: qsr_fob is month-to-date,
  // so this shows current running MTD cost. Manual FOB Report takes precedence.
  const fobAuto = React.useMemo(()=>{
    const rows=ds?.qsrFobRows||[];
    if(!rows.length) return [];
    const byLoc=new Map();
    for(const r of rows){
      const d=r.date instanceof Date?r.date:new Date(r.date+'T00:00:00');
      const ex=byLoc.get(String(r.loc));
      if(!ex||d>ex._d) byLoc.set(String(r.loc),{...r,_d:d});
    }
    const pct=(n,s)=>s>0&&n!=null?n/s:null;
    return [...byLoc.values()].map(r=>{
      const s=r.prodSalesAmt||0;
      const fobAmt=(r.rawWasteAmt||0)+(r.compWasteAmt||0)+(r.condimentsAmt||0)+(r.empMgrMealsAmt||0)+(r.statVarianceAmt||0)+(r.unexplainedAmt||0);
      const foodCost=(r.pnlFoodCostBegin||0)+(r.pnlFoodCostPurchases||0)+(r.pnlFoodCostAdjustments||0)+(r.pnlFoodCostTransfers||0)-(r.pnlFoodCostPromotions||0)-(r.pnlFoodCostEnd||0);
      const paperCost=(r.pnlPaperCostBegin||0)+(r.pnlPaperCostPurchases||0)+(r.pnlPaperCostAdjustments||0)+(r.pnlPaperCostTransfers||0)-(r.pnlPaperCostPromotions||0)-(r.pnlPaperCostEnd||0);
      return {loc:String(parseInt(r.loc,10)),date:r._d, // qsr_fob loc is zero-padded — normalize to match allLocs
        fobPct:pct(fobAmt,s), baseFoodPct:pct(r.totalBaseFood,s),
        rawWaste:pct(r.rawWasteAmt,s), compWaste:pct(r.compWasteAmt,s),
        condiment:pct(r.condimentsAmt,s), empMeal:pct(r.empMgrMealsAmt,s),
        statVar:pct(r.statVarianceAmt,s), unexplained:pct(r.unexplainedAmt,s),
        discCoupon:pct(r.discountCouponsAmt,s),
        pLFoodPct:pct(foodCost,s), pLPaperPct:pct(paperCost,s), _auto:true};
    });
  },[ds?.qsrFobRows?.length]);
  const fobInRange = fobRecent.length?fobRecent:fobAuto; // manual FOB Report first, else auto qsr_fob (per-store)

  // Dollar-weighted FOB roll-up from qsr_fob raw amounts. The TRUE grouped average
  // is Σ(component $) / Σ(Prod Net Sales $), NOT a straight average of store %s —
  // a high-volume store must pull the average more than a low-volume one. Both the
  // current MTD and the last completed month come from qsr_fob (each month's final
  // row = that month's actual), so both periods are accurate and from one source.
  const fobByMonth = React.useMemo(()=>{
    const m=new Map(); // loc|YYYY-MM -> latest row that month (= that month's MTD-final)
    for(const r of (ds?.qsrFobRows||[])){
      const d=r.date instanceof Date?r.date:new Date(r.date+'T00:00:00');
      if(isNaN(d))continue;
      const loc=String(parseInt(r.loc,10));
      const ym=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
      const k=loc+'|'+ym;const ex=m.get(k);
      if(!ex||d.getTime()>ex._ms) m.set(k,{...r,loc,_ms:d.getTime(),_ym:ym});
    }
    return [...m.values()];
  },[ds?.qsrFobRows?.length]);
  const fobPeriods = React.useMemo(()=>{
    if(!fobByMonth.length) return null;
    const yms=[...new Set(fobByMonth.map(r=>r._ym))].sort();
    const curYM=yms[yms.length-1],priorYM=yms.length>1?yms[yms.length-2]:null;
    const lbl=ym=>ym?new Date(ym+'-01T12:00:00').toLocaleDateString('en-US',{month:'short'}):null;
    return {curYM,priorYM,curLabel:lbl(curYM),priorLabel:lbl(priorYM),
      cur:fobByMonth.filter(r=>r._ym===curYM),
      prior:priorYM?fobByMonth.filter(r=>r._ym===priorYM):[]};
  },[fobByMonth]);
  // Dollar-weighted aggregate over a set of qsr_fob raw rows.
  const fobAgg = (rows)=>{
    if(!rows||!rows.length) return null;
    const S=f=>rows.reduce((a,r)=>a+(r[f]||0),0);
    const sales=S('prodSalesAmt');const p=n=>sales>0?n/sales:null;
    const fobAmt=S('rawWasteAmt')+S('compWasteAmt')+S('condimentsAmt')+S('empMgrMealsAmt')+S('statVarianceAmt')+S('unexplainedAmt');
    const food=S('pnlFoodCostBegin')+S('pnlFoodCostPurchases')+S('pnlFoodCostAdjustments')+S('pnlFoodCostTransfers')-S('pnlFoodCostPromotions')-S('pnlFoodCostEnd');
    const paper=S('pnlPaperCostBegin')+S('pnlPaperCostPurchases')+S('pnlPaperCostAdjustments')+S('pnlPaperCostTransfers')-S('pnlPaperCostPromotions')-S('pnlPaperCostEnd');
    return {sales,fobPct:p(fobAmt),baseFoodPct:p(S('totalBaseFood')),
      rawWaste:p(S('rawWasteAmt')),compWaste:p(S('compWasteAmt')),condiment:p(S('condimentsAmt')),
      empMeal:p(S('empMgrMealsAmt')),statVar:p(S('statVarianceAmt')),unexplained:p(S('unexplainedAmt')),
      discCoupon:p(S('discountCouponsAmt')),pLFoodPct:p(food),pLPaperPct:p(paper)};
  };

  // Service + Controls: prefer the selected date range; fall back to the most
  // recent available week when no data exists for the current period.
  const _recentWeek = (rows) => {
    if(!rows.length) return {rows:[],isStale:false,label:null};
    const inR = rows.filter(r=>inRange(r.date,effectiveDateRange));
    if(inR.length) return {rows:inR,isStale:false,label:null};
    const maxD = new Date(Math.max(...rows.map(r=>r.date)));
    const wkStart = new Date(maxD); wkStart.setDate(maxD.getDate()-6);
    const recent = rows.filter(r=>r.date&&r.date>=wkStart&&r.date<=maxD);
    const lbl = maxD.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'2-digit'});
    return {rows:recent,isStale:true,label:'Most recent: wk of '+lbl};
  };
  const opsEffective  = React.useMemo(()=>_recentWeek(ds?.opsRows ||[]),[ds?.opsRows?.length,effectiveDateRange]);

  // Freshest-wins merge: union two same-shape row arrays by (loc, day). The
  // primary (manual upload) overrides the secondary (auto pull/email) for the
  // SAME day — a manual upload is an intentional override — while the auto source
  // fills in every day the manual data doesn't cover (e.g. the days since the last
  // manual upload). Net: whatever is freshest per date always shows.
  const mergeFresh = (primary, secondary) => {
    const k = r => String(r.loc)+'|'+(r.date instanceof Date?r.date.toISOString().slice(0,10):String(r.date).slice(0,10));
    const m = new Map();
    for(const r of (secondary||[])) if(r&&r.date) m.set(k(r),r);
    for(const r of (primary||[]))   if(r&&r.date) m.set(k(r),r); // manual overrides same-day auto
    return [...m.values()];
  };

  // Controls: manual Controls sheet merged with the CLEAN auto-synced fields from
  // Daily Glimpse + Cash Sheet (promo, cash O/S, POS overrings, refunds, labor %),
  // since #37, the auto Operations Report cash-sheet for T-Reds Before/After % + drawer
  // opens (loadOpsCashSheet derives these net-sales-weighted, same math as discPct), and
  // since 2026-08-04, the auto DAR TPPH (real transactions ÷ actual punched hours — already
  // reconciled to QSRSoft's own Shift Manager Summary transPerPunchedHour figure, see the
  // `tpph` derivation in loadQsrActSummary/supabase.js). Act vs Need still has no clean auto
  // equivalent — DAR's `total_needed_hours` uses a different "need" methodology than the
  // Controls Report's own Act vs Need column, unverified against a real number, so it stays
  // manual-only rather than shipping an unreconciled guess.
  const ctrlAuto = React.useMemo(()=>{
    const byKey=new Map();
    const kk=r=>String(r.loc)+'|'+(r.date instanceof Date?r.date.toISOString().slice(0,10):String(r.date).slice(0,10));
    for(const g of (ds?.glimpseRows||[])){
      byKey.set(kk(g),{loc:g.loc,date:g.date,
        promoPct:g.promoPct,promoAmt:g.promoAmt,
        cashOSPct:g.cashOSPct,cashOSAmt:g.cashOS,
        posOverCnt:g.posOverCnt,posOverAmt:g.posOverAmt,
        laborPct:g.laborPct});
    }
    for(const c of (ds?.cashRows||[])){
      const key=kk(c);const ex=byKey.get(key)||{loc:c.loc,date:c.date};
      byKey.set(key,{...ex,
        cashOSPct:ex.cashOSPct??c.cashOSPct,cashOSAmt:ex.cashOSAmt??c.cashOS,
        posOverCnt:ex.posOverCnt??c.posOverCnt,posOverAmt:ex.posOverAmt??c.posOverAmt,
        cashRefCnt:c.cashRefCnt,cashRefAmt:c.cashRefAmt,
        cashlessRefCnt:c.cashlessRefCnt,cashlessRefAmt:c.cashlessRefAmt});
    }
    for(const o of (ds?.opsCashRows||[])){
      const key=kk(o);const ex=byKey.get(key)||{loc:o.loc,date:o.date};
      byKey.set(key,{...ex,
        tRedBPct:ex.tRedBPct??o.tRedBPct,tRedAPct:ex.tRedAPct??o.tRedAPct,
        drawerOpens:ex.drawerOpens??o.drawerOpens,
        // T-Red counts + refund counts/$ (2026-08-04) — same auto-fresh backstop pattern as the
        // T-Red percents above; these were still manual-Controls-only, reading 0 with no upload.
        tRedACnt:ex.tRedACnt??o.tRedACnt,tRedBCnt:ex.tRedBCnt??o.tRedBCnt,
        cashRefCnt:ex.cashRefCnt??o.cashRefCnt,cashRefAmt:ex.cashRefAmt??o.cashRefAmt,
        cashlessRefCnt:ex.cashlessRefCnt??o.cashlessRefCnt,cashlessRefAmt:ex.cashlessRefAmt??o.cashlessRefAmt,
        // Cash O/S % + $ (2026-08-04 follow-up) — missed in the first pass. Unlike the other
        // opsCashRows fields above, this one OVERRIDES glimpseRows/cashRows rather than only
        // filling gaps: both those layers already SET cashOSPct/cashOSAmt (often to exactly 0,
        // not undefined) whenever they have any row for the day, so the usual `ex.field??o.field`
        // gap-fill pattern would keep a stale/wrong 0 instead of the real opsCashRows number.
        // qsr_cash_sheet's cash_over_or_short is the same field EOM Supervisor's Cash +/- fix
        // (v4.796) already verified exact-to-the-penny against real QSRSoft data — treat it as
        // authoritative here too, same trust order.
        cashOSPct:o.cashOSPct??ex.cashOSPct,cashOSAmt:o.cashOSAmt??ex.cashOSAmt});
    }
    for(const q of (ds?.qsrActSummaryRows||[])){
      const key=kk(q);const ex=byKey.get(key)||{loc:q.loc,date:q.date};
      byKey.set(key,{...ex, tpph:ex.tpph??q.tpph});
    }
    // OT hours/$ (2026-08-04) — qsr_labor_summary's over_time_total_hours/_dollars, already
    // pulled by ops-pull and already aliased to otHrs/otDollar by loadOpsLaborSummary, but never
    // merged into ctrlAuto — Controls & Integrity's OT Hours read manual-ctrlRows-only (0 with
    // no upload) even with real auto OT data available.
    for(const l of (ds?.opsLaborRows||[])){
      const key=kk(l);const ex=byKey.get(key)||{loc:l.loc,date:l.date};
      byKey.set(key,{...ex, otHrs:ex.otHrs??l.otHrs,otDollar:ex.otDollar??l.otDollar});
    }
    return [...byKey.values()];
  },[ds?.glimpseRows?.length,ds?.cashRows?.length,ds?.opsCashRows?.length,ds?.qsrActSummaryRows?.length,ds?.opsLaborRows?.length]);
  const ctrlEffective = React.useMemo(()=>_recentWeek(mergeFresh(ds?.ctrlRows,ctrlAuto)),[ds?.ctrlRows?.length,ctrlAuto,effectiveDateRange]);

  // Service metrics (OEPE / KVS): manual Operations Report merged with auto Daily
  // Glimpse, freshest-per-day. R2P has no auto source, so it only shows from manual.
  const svcEffective = React.useMemo(()=>{
    // FIELD-AWARE merge (Notes: Jul-2026) — each metric takes its freshest available source,
    // low→high precedence: auto DAR (oepe/r2p/park/kvs derived) → emailed Glimpse (oepe/park/kvs) →
    // manual Ops (all). This lets R2P/OEPE/DT-Parked/KVS-Healthy all fill from the current DAR
    // even when the manual Ops report is stale (Ops stopped Jul 15).
    const kk=r=>String(r.loc)+'|'+(r.date instanceof Date?r.date.toISOString().slice(0,10):String(r.date).slice(0,10));
    const m=new Map();
    const layer=(rows,map)=>{ for(const r of (rows||[])){ if(!r||!r.date)continue; const k=kk(r); const ex=m.get(k)||{loc:r.loc,date:r.date}; for(const dst in map){ const v=r[map[dst]]; if(v!=null&&!isNaN(v)&&v!==0) ex[dst]=v; } m.set(k,ex); } };
    // DAR carries MFY serve time → KVS Time derives from it too. park/kvsHealthy (2026-08-04) —
    // owner pointed out DT-Parked/KVS-Healthy's raw ingredients (dt_carsheld, healthy_count/
    // unhealthy_count) were already in qsr_daily_activity, just not selected/wired through; both
    // now computed in loadQsrActSummary and reconciled exact against the Operations Report
    // (store 3708 8/3: DAR park 13.58% vs Ops Report 13.59%). DAR is also LIVE intraday, unlike
    // qsr_service_stats which has no row until the day finalizes — see memory/
    // finding-live-intraday-operations-report-data.md.
    layer(ds?.qsrActSummaryRows,{oepe:'oepe',r2p:'r2p',kvst:'kvst',park:'park',kvsu:'kvsHealthy'});
    // Auto Operations Report service-stats summary — only has data for CLOSED/finalized days
    // (confirmed 2026-08-04: zero rows for the in-progress day across repeated checks), so it
    // mainly backstops/overrides DAR for days where BOTH exist; DAR remains the only live-intraday
    // source for all of these fields. Yields to Glimpse/manual where those have data.
    layer(ds?.opsServiceRows,{oepe:'oepe',park:'park',kvst:'kvst',kvsu:'kvsHealthy'});
    layer(ds?.glimpseRows,{oepe:'oepe',park:'parkedPct',kvst:'kvst',kvsu:'kvsHealthy'});
    layer(ds?.opsRows,{oepe:'oepe',park:'park',kvst:'kvst',kvsu:'kvsu',r2p:'r2p'});
    const res=_recentWeek([...m.values()]);
    return {...res,auto:(ds?.opsRows||[]).length===0};
  },[ds?.opsRows?.length,ds?.glimpseRows?.length,ds?.qsrActSummaryRows?.length,ds?.opsServiceRows?.length,effectiveDateRange]);

  // Channel sales mix: manual labor channel rows merged with auto Sales Ledger,
  // freshest-per-day (manual overrides the same day; ledger fills recent gaps).
  const channelRows = React.useMemo(()=>{
    const lab=(ds?.laborRows||[]).filter(r=>r.dtSales||r.bfSales||r.mopSales||r.kioskSales);
    const led=(ds?.salesLedgerRows||[]);
    const merged=mergeFresh(lab,led).filter(r=>inRange(r.date,effectiveDateRange));
    return {rows:merged,auto:lab.length===0&&led.length>0};
  },[ds?.laborRows?.length,ds?.salesLedgerRows?.length,effectiveDateRange]);

  // anyMode=true keeps 0 (and negative) values — for SIGNED/zero-legitimate fields (Cash O/S %,
  // T-Reds %, Discount %, Promo %: a real 0% is good news, not "no data"), matching
  // metric-source.js's own 'any' vs 'pos' mode split. Default (false) is unchanged everywhere
  // else — a genuine 0 for OEPE/TPPH/Labor%/etc. really does mean no data for an operating store.
  // 2026-08-04: was blanket-excluding 0 for ALL fields — a store with 0 T-Red incidents (great!)
  // showed a blank "—" instead of "0.00%", which is exactly what "still missing a lot of data"
  // on the AAG Controls & Integrity tile turned out to be (T-Red After Count showed 0 correctly
  // via sumOf, which never filtered zeros, while T-Red After % showed "—" via this function).
  const avgOf=(rows,field,anyMode)=>{const v=rows.map(r=>r[field]).filter(x=>x!=null&&!isNaN(x)&&(anyMode||x>0));return v.length?v.reduce((a,b)=>a+b,0)/v.length:null;};
  const sumOf=(rows,field)=>rows.reduce((a,r)=>a+(r[field]||0),0);
  const pctOf=(a,b)=>b>0?((a/b-1)*100).toFixed(2)+'%':null;

  // ── "As of" tile freshness ────────────────────────────────────
  // Each tile states its timeframe from its OWN source rows (not the toolbar
  // selection), so the label can never claim a period the tile isn't showing.
  // Timeframe tag (v4.837). This used to render "as of 8/5" — the newest date only.
  // That answers "how fresh is this?" but not the owner's actual question about the
  // AAG tiles: "what am I looking at, time-frame-wise — MTD? a rolling 30? one day?"
  // Now it renders the real SPAN of the rows being aggregated (the end of which is
  // still the as-of date), in the same footprint, and says out loud when the tile has
  // silently fallen off the selected period onto the 30-day fallback window.
  const _spanTag = (rows) => {
    const tMs=today.getTime(); let lo=null,hi=null; const days=new Set();
    for(const r of (rows||[])){ if(!r||!r.date)continue;
      const d=r.date instanceof Date?r.date:new Date(r.date); const ms=d.getTime();
      if(isNaN(ms)||ms>tMs)continue;
      if(!lo||ms<lo.getTime())lo=d;
      if(!hi||ms>hi.getTime())hi=d;
      days.add(dKey(d));
    }
    if(!hi) return null;
    const f=d=>d.toLocaleDateString('en-US',{month:'numeric',day:'numeric'});
    const one=!lo||f(lo)===f(hi);
    const fb=!!(effectiveDateRange&&effectiveDateRange.isFallback);
    const tip='Data shown spans '+(one?f(hi):f(lo)+'–'+f(hi))+' · '+days.size+' day'+(days.size===1?'':'s')+' present'
      +(fb?'  ⚠ No data in the selected period ('+(dateRange&&dateRange.label||'selected range')
        +') — showing the most recent 30 days of available data instead.':'');
    return span({
      style:{fontSize:'8px',color:fb?'#f59e0b':'var(--text3)',fontStyle:'italic',whiteSpace:'nowrap'},
      title:tip},
      (one?f(hi):f(lo)+'–'+f(hi))+(fb?' ⚠':''));
  };

  const labByLoc=loc=>labInRange.filter(r=>r.loc===String(loc));
  const opsByLoc=loc=>opsInRange.filter(r=>r.loc===String(loc));
  const ctrlByLoc=loc=>ctrlInRange.filter(r=>r.loc===String(loc));
  const fobByLoc=loc=>fobInRange.filter(r=>r.loc===String(loc));

  // ── Data status ────────────────────────────────────────────────
  const latestLab=React.useMemo(()=>{
    // Newest actual business date across manual labor AND every auto-synced feed
    // (DAR summary, FOB, Daily Glimpse, Cash Sheet). Max so a stale manual upload
    // can't mask fresh auto data; clamp to today so LifeLenz's forward schedule
    // (or any future-dated row) can't skew it.
    const tMs=today.getTime();
    const pick=arr=>(arr||[]).map(r=>r.date).filter(Boolean)
      .map(d=>d instanceof Date?d.getTime():new Date(d).getTime());
    const all=[...pick(ds?.laborRows),...pick(ds?.qsrActSummaryRows),...pick(ds?.qsrFobRows),
      ...pick(ds?.glimpseRows),...pick(ds?.cashRows)].filter(ms=>!isNaN(ms)&&ms<=tMs);
    return all.length?new Date(Math.max(...all)):null;
  },[ds?.laborRows?.length,ds?.qsrActSummaryRows?.length,ds?.qsrFobRows?.length,ds?.glimpseRows?.length,ds?.cashRows?.length]);
  const dataAge=latestLab?Math.floor((today-latestLab)/864e5):999;
  const ageClr=dataAge<=3?'#10b981':dataAge<=7?'#f59e0b':'#f87171';

  // Sales reconciliation (accuracy layer, Workstream A): cross-check period PRODUCT
  // sales across independent sources for the active scope. Only DAR-summary
  // (its `sales` = Σ product_sales) and Sales-Ledger (`prodSales`) carry product
  // sales, so those two reconcile; Labor's single `sales` is a net/total basis with
  // no product split — shown for reference in the tooltip, NOT reconciled (mixing
  // bases would false-alarm). Flags when the two product-sales totals differ >2%.
  const salesRecon = React.useMemo(()=>{
    const inScope = r => r && r.loc && r.date && allLocs.includes(String(r.loc)) && inRange(r.date, effectiveDateRange);
    const darTot = sumOf((ds?.qsrActSummaryRows||[]).filter(inScope), 'sales');
    const ledTot = sumOf((ds?.salesLedgerRows||[]).filter(inScope), 'prodSales');
    const labTot = sumOf((ds?.laborRows||[]).filter(inScope), 'sales');
    const src = {};
    if(darTot>0) src.DAR = darTot;
    if(ledTot>0) src.Ledger = ledTot;
    return { r:_recon(src, {tolerance:0.02}), count:Object.keys(src).length, darTot, ledTot, labTot };
  },[ds?.qsrActSummaryRows?.length, ds?.salesLedgerRows?.length, ds?.laborRows?.length, effectiveDateRange, stores]);

  // ── Today's movers (cloud-fresh DAR) ───────────────────────────
  // Surfaces what changed since you last looked, straight from the freshest
  // auto-synced daily-activity data — the "something new when I open the app".
  const moversStrip=React.useMemo(()=>{
    const rows=(ds?.qsrActSummaryRows||[]).filter(r=>allLocs.includes(String(r.loc))&&r.date);
    if(!rows.length) return null;
    const ms=r=>r.date instanceof Date?r.date.getTime():new Date(r.date).getTime();
    const maxMs=Math.max(...rows.map(ms));
    const day=rows.filter(r=>ms(r)===maxMs);
    // Comp guard: a store only ranks as a "mover" if it had a real last-year
    // baseline that day (≥$1k) and a sane YoY swing (≤200%). Without this a new
    // store with a near-zero LY baseline pins the top with a nonsense "+2390%".
    const ly=day.filter(r=>r.salesVsLYPct!=null&&(r.lySales||0)>=1000&&Math.abs(r.salesVsLYPct)<=200).sort((a,b)=>b.salesVsLYPct-a.salesVsLYPct);
    if(!ly.length&&!day.length) return null;
    const up=ly.slice(0,3).filter(r=>r.salesVsLYPct>0);
    const down=ly.slice(-3).reverse().filter(r=>r.salesVsLYPct<0);
    // DT until-serve: sum(µs)/sum(cars)/1000 = avg seconds per car (matches DT panel).
    const dt=day.map(r=>({loc:r.loc,dt:r._dtCars>0?r._dtTotal/r._dtCars/1000:null})).filter(r=>r.dt!=null&&r.dt>0&&r.dt<1200).sort((a,b)=>b.dt-a.dt);
    return {date:new Date(maxMs),up,down,slowDT:dt.slice(0,2),
      behind:ly.filter(r=>r.salesVsLYPct<0).length,total:ly.length};
  },[ds?.qsrActSummaryRows?.length,allLocs]);

  // ── Model health ───────────────────────────────────────────────
  const hlth=React.useMemo(()=>{
    let g=0,y=0,r=0;
    allLocs.forEach(loc=>{const h=modelHealthScore(loc,ds,settings);if(h.score==null)return;if(h.score>=75)g++;else if(h.score>=50)y++;else r++;});
    return{green:g,yellow:y,red:r};
  },[allLocs,ds?.laborRows?.length,settings?.dialedIn]);

  // ── Rule-based state comment ───────────────────────────────────
  const ruleComment=React.useMemo(()=>{
    const issues=[];const good=[];
    if(dataAge>14)issues.push({lvl:'critical',msg:'data is '+dataAge+' days old'});
    else if(dataAge>7)issues.push({lvl:'warning',msg:'data is '+dataAge+' days stale'});
    else good.push(dataAge===0?'data loaded today':'data is '+dataAge+'d old');
    const wsd=settings.weekStartDay!=null?settings.weekStartDay:3;
    const ws=new Date(today);while(ws.getDay()!==wsd)ws.setDate(ws.getDate()-1);
    const wsKey=dKey(ws);const lp=lockedProjections||{};
    const nLocked=allLocs.filter(loc=>lp[loc+'_'+wsKey]).length;
    if(nLocked===allLocs.length&&allLocs.length>0)good.push('all '+allLocs.length+' projection locks complete');
    else if(allLocs.length-nLocked>5)issues.push({lvl:'warning',msg:(allLocs.length-nLocked)+' projection locks still needed'});
    if(hlth.red>0)issues.push({lvl:'warning',msg:hlth.red+' store'+(hlth.red>1?'s':'')+' at red model health'});
    else if(hlth.green>=allLocs.length*.75&&allLocs.length>0)good.push(hlth.green+' stores at trusted health');
    if(!ds?.loaded||(!ds.laborRows?.length&&!ds.qsrActSummaryRows?.length))issues.push({lvl:'critical',msg:'no data loaded — check connection or upload Operations Report'});
    if(issues.some(i=>i.lvl==='critical'))
      return{tone:'critical',color:'#f87171',text:'🚨 Action required — '+issues.map(i=>i.msg).join('; ')+'.'};
    if(issues.length>0)
      return{tone:'warning',color:'#f59e0b',text:'⚠️  A few items need attention: '+issues.map(i=>i.msg).join(', ')+'.'};
    return{tone:'good',color:'#10b981',text:'✅ Things are looking up! '+(good.length?good.join(', ').replace(/^./,s=>s.toUpperCase())+'.':"District is on track.")};
  },[dataAge,hlth,allLocs,lockedProjections,ds?.loaded,settings?.weekStartDay]);

  const fetchAIComment=async()=>{
    const apiKey=(()=>{try{return localStorage.getItem('mf_anthropic_key')||'';}catch{return '';}})();
    if(!apiKey){
      setAiComment('No API key configured. Go to Settings → AI & Integrations and add your Anthropic API key.');
      return;
    }
    setAiLoading(true);
    try{
      const summary={dataAge,healthGreen:hlth.green,healthYellow:hlth.yellow,healthRed:hlth.red,
        totalStores:allLocs.length,lockedStores:allLocs.filter(l=>(lockedProjections||{})[l+'_'+dKey(new Date())]).length,
        ruleComment:ruleComment.text};
      const res=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',
        headers:{'Content-Type':'application/json','x-api-key':apiKey,
          'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
        body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:200,
          messages:[{role:'user',content:'You are an assistant for a McDonald\'s district operations tool. Write ONE short paragraph (2-3 sentences, plain English, warm but professional tone) summarizing the state of the district for the operator\'s morning dashboard. Data: '+JSON.stringify(summary)+'. Keep it concise and actionable.'}]})});
      const d=await res.json();
      setAiComment((d.content||[]).map(b=>b.text||'').join(''));
    }catch(e){setAiComment('AI narrative unavailable: '+e.message);}
    setAiLoading(false);
  };

  // ── Helpers ────────────────────────────────────────────────────
  const Chip=({label,val,vs,good,fmt})=>{
    const clr=vs!=null?(good==='high'?val>=vs:'low'?val<=vs:val>=vs)?'#10b981':'#f87171':'var(--text3)';
    return div({style:{display:'flex',flexDirection:'column',alignItems:'center',minWidth:60,gap:2}},
      div({style:{fontSize:'16px',fontFamily:'var(--mono)',fontWeight:700,color:clr}},
        fmt?fmt(val):(val!=null?val.toFixed(1):'—')),
      div({style:{fontSize:'7px',color:'var(--text3)',letterSpacing:'.5px',textTransform:'uppercase'}},label)
    );
  };

  const MktBadge=({ok,fl,fmt})=>div({style:{display:'flex',gap:6,marginTop:4,flexWrap:'wrap'}},
    ok!=null&&span({style:{fontSize:'9px',background:'rgba(59,130,246,.15)',color:'#60a5fa',borderRadius:3,padding:'1px 5px'}},
      'OK: '+(fmt?fmt(ok):ok.toFixed(1))),
    fl!=null&&span({style:{fontSize:'9px',background:'rgba(16,185,129,.15)',color:'#34d399',borderRadius:3,padding:'1px 5px'}},
      'FL: '+(fmt?fmt(fl):fl.toFixed(1)))
  );

  const SecCard=({id,label,icon,children})=>div({style:{background:'var(--surf)',border:'.5px solid var(--bdr)',borderRadius:8,overflow:'hidden',marginBottom:10}},
    div({style:{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',background:'var(--surf2)',borderBottom:'.5px solid var(--bdr)'}},
      span({style:{fontSize:14}},icon),
      span({style:{fontSize:'11px',fontWeight:700,color:'var(--text)',letterSpacing:'.3px'}}),
      span({style:{fontSize:'11px',fontWeight:700,color:'var(--text)'}},label)
    ),
    div({style:{padding:'10px 12px'}},children)
  );

  const KpiRow=({label,val,okAvg,flAvg,tgt,fmtFn,goodDir})=>{
    const tgtClr=tgt!=null&&val!=null?(goodDir==='low'?val<=tgt:val>=tgt)?'#10b981':'#f87171':'transparent';
    return div({style:{display:'flex',alignItems:'center',gap:8,padding:'4px 0',borderBottom:'.5px solid rgba(255,255,255,.04)'}},
      div({style:{fontSize:'9px',color:'var(--text3)',width:130,flexShrink:0}},label),
      div({style:{fontSize:'11px',fontFamily:'var(--mono)',fontWeight:600,color:'var(--text)',width:70}},(fmtFn?fmtFn(val):(val!=null?val.toFixed(1):' — '))),
      tgt!=null&&div({style:{width:8,height:8,borderRadius:'50%',background:tgtClr,flexShrink:0}}),
      (okAvg!=null||flAvg!=null)&&MktBadge({ok:okAvg,fl:flAvg,fmt:fmtFn})
    );
  };

  // ── Projection section ─────────────────────────────────────────
  const projSec=React.useMemo(()=>{
    const mapeFn=loc=>{const di=settings.dialedIn?.[loc];return di?.mape6w??di?.mape4w??di?.mape;};
    const mapeVals=allLocs.map(mapeFn).filter(v=>v!=null);
    const avgMape=mapeVals.length?mapeVals.reduce((a,b)=>a+b,0)/mapeVals.length:null;
    const okMapeVals=okLocs.map(mapeFn).filter(v=>v!=null);
    const flMapeVals=flLocs.map(mapeFn).filter(v=>v!=null);
    const okMape=okMapeVals.length?okMapeVals.reduce((a,b)=>a+b,0)/okMapeVals.length:null;
    const flMape=flMapeVals.length?flMapeVals.reduce((a,b)=>a+b,0)/flMapeVals.length:null;
    const wsd=settings.weekStartDay!=null?settings.weekStartDay:3;
    const ws=new Date(today);while(ws.getDay()!==wsd)ws.setDate(ws.getDate()-1);
    const wsKey=dKey(ws);const lp=lockedProjections||{};
    const locked=allLocs.filter(loc=>lp[loc+'_'+wsKey]).length;
    return{avgMape,okMape,flMape,locked,total:allLocs.length,health:hlth};
  },[allLocs,okLocs,flLocs,settings?.dialedIn,lockedProjections,hlth]);

  // ── Sales section ─────────────────────────────────────────────
  const salesSec=React.useMemo(()=>{
    if(!labInRange.length)return null;
    const byLoc=loc=>labInRange.filter(r=>r.loc===String(loc));
    const totSales=allLocs.reduce((a,l)=>a+sumOf(byLoc(l),'allNetSales'),0)||allLocs.reduce((a,l)=>a+sumOf(byLoc(l),'sales'),0);
    const totGC=allLocs.reduce((a,l)=>a+sumOf(byLoc(l),'gc'),0);
    const avgChk=totGC>0?totSales/totGC:0;
    const channels=[
      {key:'dtSales',pctKey:'dtPctTotal',label:'Drive-Thru'},
      {key:'bfSales',pctKey:'bfPctTotal',label:'Breakfast'},
      {key:'delivSales',pctKey:'delivPctTotal',label:'McDelivery'},
      {key:'mopSales',pctKey:'mopPctTotal',label:'MOP'},
      {key:'kioskSales',pctKey:'kioskPctTotal',label:'Kiosk'},
      {key:'eatInSales',pctKey:null,label:'Eat-In'},
    ];
    const labScoped=labInRange.filter(r=>allLocs.includes(String(r.loc)));
    // Channel splits: manual labor rows when present, else auto-synced Sales Ledger.
    // % must divide by the SAME source's total sales (not totSales, which comes
    // from a different array) or the ratios blow up.
    const chScoped=channelRows.rows.filter(r=>allLocs.includes(String(r.loc)));
    const chTot=sumOf(chScoped,'allNetSales')||sumOf(chScoped,'sales')||totSales;
    const chData=channels.map(ch=>{
      const s=sumOf(chScoped,ch.key);
      const pct=chTot>0&&s>0?s/chTot:null;
      return{...ch,sales:s,pct,okAvgPct:null,flAvgPct:null};
    });
    // vs-LY as a dollar/guest-weighted RATIO-OF-AGGREGATES over COMP stores only.
    // The old code averaged each store-day's salesVsLYPct — one new store with a
    // near-zero last-year baseline (e.g. a store opened this year) then dominated the
    // mean and produced nonsense like "+2390%" (and "+403%" on guest count). Instead:
    // sum REAL current$ and REAL last-year$ per store (last year = the same calendar
    // window 364 days back, from laborRows; cloud-only devices fall back to each
    // row's lySales), keep only stores with a genuine prior-year baseline (LY ≥ 20%
    // of current — drops brand-new / still-ramping stores from the COMPARISON, not
    // from the sales totals), and divide the aggregates. Returned as a FRACTION to
    // match the tile's *100 render.
    // MATCHED-DAY vs-LY (v4.508). The prior code summed current$ over the whole current
    // window but LY$ over whatever LY days happened to have data — with no day-matching.
    // When the current window covered many days but LY covered only a sparse subset, the
    // ratio exploded (a store whose LY spanned ~23% of the current days read ~+330%). Fix:
    // build per-(loc,date) LY maps, then accumulate current AND LY together per store
    // ONLY on days where BOTH sides have real data, so coverage is identical day-for-day.
    const _iso=d=>(d instanceof Date?d:new Date(d)).toISOString().slice(0,10);
    const lyS=addD(dateRange.s,-364),lyE=addD(dateRange.e,-364);
    const labLY=(ds?.laborRows||[]).filter(r=>r.date>=lyS&&r.date<=lyE&&allLocs.includes(String(r.loc))&&r.gc>0);
    const lySalesByLocDate={}, lyGcByLocDate={};
    for(const r of labLY){ const k=String(r.loc)+'|'+_iso(r.date); lySalesByLocDate[k]=(lySalesByLocDate[k]||0)+(r.sales||0); lyGcByLocDate[k]=(lyGcByLocDate[k]||0)+(r.gc||0); }
    // Per-store matched-day sums (sales + GC). LY for a current day = the actual LY
    // laborRow 364d back, else that row's own lySales field (cloud-only devices).
    const mCurS={}, mLyS={}, mCurG={}, mLyG={};
    for(const r of labInRange){
      const l=String(r.loc); if(!allLocs.includes(l)) continue;
      const cur=(r.allNetSales||r.sales)||0, curG=r.gc||0;
      const lk=l+'|'+_iso(addD(r.date,-364));
      // LY sources, in order: matched 364-day-back manual row → row's own LY field.
      // Cloud-fresh devices have no manual laborRows, so the row's own LY (DAR
      // ly_product_sales / ly_transactions, or Sales-Ledger all_net_sales_ly) is what
      // keeps vs-LY populated instead of blanking out.
      let ly=lySalesByLocDate[lk]; if((ly==null||ly<=0)&&(r.lySales>0||r.allNetSalesLY>0)) ly=r.lySales>0?r.lySales:r.allNetSalesLY;
      let lyG=lyGcByLocDate[lk]; if((lyG==null||lyG<=0)&&r.lyGc>0) lyG=r.lyGc;
      if(cur>0&&ly>0){ mCurS[l]=(mCurS[l]||0)+cur; mLyS[l]=(mLyS[l]||0)+ly; }
      if(curG>0&&lyG>0){ mCurG[l]=(mCurG[l]||0)+curG; mLyG[l]=(mLyG[l]||0)+lyG; }
    }
    // Ratio-of-aggregates over comp stores. Matched days keep coverage equal, so the
    // LY≥20%-of-current guard now only drops genuine new/ramping stores from the COMP.
    const compVsLY=(locSet,curMap,lyMap)=>{
      let cur=0, base=0;
      for(const l of locSet){ const c=curMap[String(l)]||0, b=lyMap[String(l)]||0; if(b<=0||b<0.2*c) continue; cur+=c; base+=b; }
      return base>0 ? (cur-base)/base : null;   // FRACTION
    };
    const salesVsLY=compVsLY(allLocs,mCurS,mLyS);
    const okSalesVsLY=compVsLY(okLocs,mCurS,mLyS);
    const flSalesVsLY=compVsLY(flLocs,mCurS,mLyS);
    // Display totals stay FULL current-window sums (these are actuals, not comps).
    const curSalesByLoc=l=>(sumOf(byLoc(l),'allNetSales')||sumOf(byLoc(l),'sales'));
    const okSales=okLocs.reduce((a,l)=>a+curSalesByLoc(l),0);
    const flSales=flLocs.reduce((a,l)=>a+curSalesByLoc(l),0);
    // GC vs LY — same matched-day comp.
    const gcVsLY=Object.keys(mLyG).length?compVsLY(allLocs,mCurG,mLyG):null;
    // Avg check vs LY — per-guest ratio, both sides over matched days.
    const totSalesLY=Object.values(mLyS).reduce((a,b)=>a+b,0);
    const totGCLY=Object.values(mLyG).reduce((a,b)=>a+b,0);
    const curMS=Object.values(mCurS).reduce((a,b)=>a+b,0), curMG=Object.values(mCurG).reduce((a,b)=>a+b,0);
    const avgCheckLY=totGCLY>0?totSalesLY/totGCLY:0;
    const avgChkMatched=curMG>0?curMS/curMG:avgChk;
    const avgCheckVsLY=avgCheckLY>0?(avgChkMatched-avgCheckLY)/avgCheckLY:null;
    return{totSales,totGC,avgChk,channels:chData,salesVsLY,gcVsLY,avgCheckVsLY,okSales,flSales,okSalesVsLY,flSalesVsLY};
  },[labInRange,channelRows,allLocs,okLocs,flLocs,ds?.laborRows,dateRange]);

  // ── Labor section ─────────────────────────────────────────────
  const laborSec=React.useMemo(()=>{
    // Labor productivity metrics (TPPH, labor%, OT, Act vs Need) live in the
    // Controls sheet (ctrlRows/Billable Sales group) — NOT the Sales sheet (labInRange).
    // Use the merged controls source (manual + auto Glimpse) so Labor % fills from
    // the auto feed on days without a manual upload. Fall back to labInRange.
    const cRows=ctrlEffective.rows.length?ctrlEffective.rows:[];
    const lRows=labInRange;
    if(!cRows.length&&!lRows.length)return null;
    const cScoped=cRows.filter(r=>allLocs.includes(String(r.loc)));
    const lScoped=lRows.filter(r=>allLocs.includes(String(r.loc)));
    // Labor %/TPPH now auto-first per-day via metric-source.js (2026-08-06) instead of pooling
    // ALL rows into one flat avgOf — that pooled-average approach silently returned "--" for
    // TPPH whenever the current window's MANUAL ctrlRows upload existed but its sheet format
    // predates a TPPH column: parseCtrlData defaults the field to `0` (not null) when the Excel
    // column is missing, and mergeFresh's whole-row override meant that manual $0 TPPH row
    // entirely replaced the day's ctrlAuto row (which DID have real TPPH from qsr_act_summary),
    // even though avgOf itself correctly excludes 0 (v>0 filter) — the auto DATA never reached
    // cScoped in the first place. metricAvg resolves per-day, per-source, treating a 0/missing
    // manual value as "keep looking" (mode:'pos') rather than letting one blank column block
    // every other source for that day. Root-caused investigating the AAG Controls & Integrity
    // TPPH "--" gap first reported 2026-08-04 (v4.808's fix didn't fully close it).
    const laborPct=metricAvg(ds,allLocs,effectiveDateRange,'laborPct');
    const tpph=metricAvg(ds,allLocs,effectiveDateRange,'tpph');
    const avn=avgOf(cScoped,'actVsNeed')||avgOf(lScoped,'actVsNeed');
    const otHrs=sumOf(cScoped,'otHrs')||sumOf(lScoped,'otHrs');
    const actHrs=sumOf(cScoped,'actHrs')||sumOf(lScoped,'actHrs');
    const crewHrs=sumOf(cScoped,'crewHrs');
    const avgRate=avgOf(cScoped,'avgRate')||avgOf(lScoped,'avgRate');
    // Market averages — sales-weighted Σ(pct×sales)/Σsales, NOT mktAvg's average-of-
    // per-store-averages (2026-08-06, cleanup-backlog Class 1 — widest-blast-radius item:
    // this fed every AAG OK-vs-FL market comparison tile with a number where a low-volume
    // store's % counted exactly as much as a high-volume one, and each store's OWN daily
    // average was itself unweighted). cRows (Controls) carries the preferred Punched Labor %/
    // TPPH but has no sales column of its own, so weight it via a same-(loc,date) lookup into
    // lRows (labInRange), which always carries `sales` (the app's established master sales
    // source — project-data-redundancy.md).
    const _dk=d=>d instanceof Date?d.toISOString().slice(0,10):String(d||'').slice(0,10);
    const salesByKey=new Map();
    for(const r of lRows){ if(r.sales>0) salesByKey.set(String(r.loc)+'|'+_dk(r.date),r.sales); }
    const wMkt=(locs,field)=>{
      let n=0,d=0;
      for(const r of cRows){
        if(!locs.includes(String(r.loc)))continue;
        const v=r[field];if(v==null||isNaN(v))continue;
        const s=salesByKey.get(String(r.loc)+'|'+_dk(r.date));if(!(s>0))continue;
        n+=v*s;d+=s;
      }
      if(d>0)return n/d;
      // No Controls row matched a sales figure (e.g. cRows empty this period) — weight lRows directly.
      let n2=0,d2=0;
      for(const r of lRows){
        if(!locs.includes(String(r.loc)))continue;
        const v=r[field],s=r.sales;
        if(v==null||isNaN(v)||!(s>0))continue;
        n2+=v*s;d2+=s;
      }
      return d2>0?n2/d2:null;
    };
    const okLaborAvg=wMkt(okLocs,'laborPct');
    const flLaborAvg=wMkt(flLocs,'laborPct');
    const okTpphAvg=wMkt(okLocs,'tpph');
    const flTpphAvg=wMkt(flLocs,'tpph');
    const ranked=[...allLocs].map(loc=>{
      const cr=cRows.filter(r=>r.loc===String(loc));
      const lr=lRows.filter(r=>r.loc===String(loc));
      return{loc,laborPct:avgOf(cr,'laborPct')||avgOf(lr,'laborPct'),tpph:avgOf(cr,'tpph')||avgOf(lr,'tpph')};
    }).filter(x=>x.laborPct!=null).sort((a,b)=>a.laborPct-b.laborPct);
    return{laborPct,tpph,avn,otHrs,actHrs,crewHrs,avgRate,okLaborAvg,flLaborAvg,okTpphAvg,flTpphAvg,ranked};
  },[labInRange,ctrlEffective,allLocs,okLocs,flLocs,ds,effectiveDateRange]);

  // ── Service section ───────────────────────────────────────────
  const serviceSec=React.useMemo(()=>{
    const {rows:opsEff,isStale:opsSt,label:opsStaleLbl,auto:svcAuto}=svcEffective;
    if(!opsEff.length)return null;
    const opsScoped=opsEff.filter(r=>allLocs.includes(String(r.loc)));
    const oepe=avgOf(opsScoped,'oepe');
    const park=avgOf(opsScoped,'park');
    const kvst=avgOf(opsScoped,'kvst');
    const kvsu=avgOf(opsScoped,'kvsu');
    const r2p=avgOf(opsScoped,'r2p');
    // Market averages — GC-weighted Σ(metric×GC)/ΣGC, NOT mktAvg's average-of-per-store-
    // averages (2026-08-06, cleanup-backlog Class 1). These are per-transaction SERVICE TIME
    // metrics (seconds/fractions), not %-of-sales, so the natural weight is guest count
    // (transactions), not dollars — opsEff has no GC column of its own, so weight via a
    // same-(loc,date) lookup into labInRange's `gc` (STW GC).
    const _dk=d=>d instanceof Date?d.toISOString().slice(0,10):String(d||'').slice(0,10);
    const gcByKey=new Map();
    for(const r of labInRange){ if(r.gc>0) gcByKey.set(String(r.loc)+'|'+_dk(r.date),r.gc); }
    const wMkt=(locs,field)=>{
      let n=0,d=0;
      for(const r of opsEff){
        if(!locs.includes(String(r.loc)))continue;
        const v=r[field];if(v==null||isNaN(v)||v<=0)continue;
        const g=gcByKey.get(String(r.loc)+'|'+_dk(r.date));if(!(g>0))continue;
        n+=v*g;d+=g;
      }
      return d>0?n/d:null;
    };
    return{
      oepe,okOepe:wMkt(okLocs,'oepe'),flOepe:wMkt(flLocs,'oepe'),
      park,okPark:wMkt(okLocs,'park'),flPark:wMkt(flLocs,'park'),
      kvst,okKvst:wMkt(okLocs,'kvst'),flKvst:wMkt(flLocs,'kvst'),
      kvsu,okKvsu:wMkt(okLocs,'kvsu'),flKvsu:wMkt(flLocs,'kvsu'),
      r2p,okR2p:wMkt(okLocs,'r2p'),flR2p:wMkt(flLocs,'r2p'),
      isStale:opsSt,staleLabel:opsStaleLbl,auto:svcAuto,
    };
  },[svcEffective,allLocs,okLocs,flLocs,labInRange]);

  // ── Controls section ─────────────────────────────────────────
  const ctrlSec=React.useMemo(()=>{
    const {rows:ctrlEff,isStale:ctrlSt,label:ctrlStaleLbl}=ctrlEffective;
    if(!ctrlEff.length)return null;
    const ctrlScoped=ctrlEff.filter(r=>allLocs.includes(String(r.loc)));
    const a=(f,anyMode)=>avgOf(ctrlScoped,f,anyMode);
    const s=f=>sumOf(ctrlScoped,f);
    // Field names match exactly what parseCtrlData stores. T-Reds/Promo/Cash O/S are SIGNED,
    // zero-legitimate fields (anyMode=true) — a real 0% is a good result, not "no data" (2026-08-04).
    return{
      // T-Reds (correct field names)
      tRedBPct:a('tRedBPct',true),tRedBCnt:s('tRedBCnt'),
      tRedAPct:a('tRedAPct',true),tRedACnt:s('tRedACnt'),
      // Promo — now correctly mapped to Promo Pct group (separate from Discount)
      promoPct:a('promoPct',true),promoCnt:s('promoCnt'),promoAmt:s('promoAmt'),
      // Cash
      cashOSPct:a('cashOSPct',true),cashOSAmt:s('cashOSAmt'),
      // Refunds — separate cash and cashless in parseCtrlData
      cashRefCnt:s('cashRefCnt'),cashRefAmt:s('cashRefAmt'),
      cashlessRefCnt:s('cashlessRefCnt'),cashlessRefAmt:s('cashlessRefAmt'),
      manualRefAmt:s('manualRefAmt'),
      // POS Overrings — stored as posOverCnt/posOverAmt
      overringCnt:s('posOverCnt'),overringAmt:s('posOverAmt'),
      drawerOpens:s('drawerOpens'),
      // Meals
      empMealAmt:s('empMealAmt'),mgrMealAmt:s('mgrMealAmt'),
      // Labor (Controls Billable Sales group — the right source)
      discPct:a('discPct',true),tpph:a('tpph'),laborPct:a('laborPct'),
      actVsNeed:a('actVsNeed'),otHrs:s('otHrs'),actHrs:s('actHrs'),
      // Market averages — sales-weighted Σ($ ÷ sales × sales)/Σsales, NOT mktAvg's
      // average-of-per-store-averages (2026-08-06, cleanup-backlog Class 1). ctrlEff has no
      // sales column of its own (same gap as laborSec's cRows) — weight via a same-(loc,date)
      // lookup into labInRange, which always carries `sales`. anyMode fields (0 is real data,
      // not "missing") — only the weight (sales>0) gates inclusion, never the value itself.
      ...(()=>{
        const _dk=d=>d instanceof Date?d.toISOString().slice(0,10):String(d||'').slice(0,10);
        const salesByKey=new Map();
        for(const r of labInRange){ if(r.sales>0) salesByKey.set(String(r.loc)+'|'+_dk(r.date),r.sales); }
        const wMkt=(locs,field)=>{
          let n=0,d=0;
          for(const r of ctrlEff){
            if(!locs.includes(String(r.loc)))continue;
            const v=r[field];if(v==null||isNaN(v))continue;
            const sKey=salesByKey.get(String(r.loc)+'|'+_dk(r.date));if(!(sKey>0))continue;
            n+=v*sKey;d+=sKey;
          }
          return d>0?n/d:null;
        };
        return {
          okTRedAPct:wMkt(okLocs,'tRedAPct'),flTRedAPct:wMkt(flLocs,'tRedAPct'),
          okTRedBPct:wMkt(okLocs,'tRedBPct'),flTRedBPct:wMkt(flLocs,'tRedBPct'),
          okPromoPct:wMkt(okLocs,'promoPct'),flPromoPct:wMkt(flLocs,'promoPct'),
          okCashOSPct:wMkt(okLocs,'cashOSPct'),flCashOSPct:wMkt(flLocs,'cashOSPct'),
        };
      })(),
      isStale:ctrlSt,staleLabel:ctrlStaleLbl,
    };
  },[ctrlEffective,allLocs,okLocs,flLocs,labInRange]);

  // ── FOB section ───────────────────────────────────────────────
  const fobSec=React.useMemo(()=>{
    // Prefer the dollar-weighted qsr_fob roll-up (TRUE grouped average + both
    // periods from one consistent source). Fall back to the manual FOB Report
    // (straight-average %s) only when qsr_fob is unavailable.
    if(fobPeriods){
      const scope=(rows,locs)=>rows.filter(r=>locs.includes(String(r.loc)));
      const mtd=fobAgg(scope(fobPeriods.cur,allLocs));
      if(!mtd) return null;
      const prior=fobAgg(scope(fobPeriods.prior,allLocs));
      const mtdOk=fobAgg(scope(fobPeriods.cur,okLocs)),mtdFl=fobAgg(scope(fobPeriods.cur,flLocs));
      const pr=f=>prior?prior[f]:null;
      // Disc/Coupon district total — verified 2026-08-04 the direct mtd.discCoupon computation
      // (same fobAgg() call that already produces real fobPct/pLFoodPct/baseFoodPct for the SAME
      // scoped rows) sometimes came back blank/zero even though the underlying qsr_fob data and
      // the OK/FL regional splits were provably correct (district total ≈0.51% cross-checked
      // against Supabase directly). Rather than ship an unexplained direct fix, backstop it with
      // the dollar-weighted combination of the two regional splits — mathematically identical to
      // the district figure by construction (Σdistrict = ΣOK + ΣFL), correct regardless of what
      // causes the direct path to miss. Falsy check (not `??`) is deliberate — the first attempt
      // used `??` and stayed broken because the direct path was landing on a literal 0, not
      // null/undefined, so `??` never triggered the fallback; discCoupon is always ≥0 in practice
      // (a discount amount), so treating 0 as "use the fallback" is safe here.
      const discCouponTotal = mtd.discCoupon || ((mtdOk||mtdFl) ?
        (((mtdOk?.discCoupon||0)*(mtdOk?.sales||0) + (mtdFl?.discCoupon||0)*(mtdFl?.sales||0)) /
         (((mtdOk?.sales||0) + (mtdFl?.sales||0)) || 1)) : null);
      // Sales-weighted targets across the scope (owner: pass targets to the AAG tile like the
      // diagnosis strip). Σ(target × store sales) / Σsales, per component.
      const _curS=scope(fobPeriods.cur,allLocs);
      const wTgt=(tk)=>{let n=0,d=0;for(const r of _curS){const t=DEFAULT_TARGETS[String(parseInt(r.loc,10))]?.[tk];const s=r.prodSalesAmt||0;if(t!=null&&s){n+=t*s;d+=s;}}return d?n/d:null;};
      const tgts={fobPct:wTgt('tFOBTarget'),unexplained:wTgt('tUnex'),compWaste:wTgt('tCompWaste'),rawWaste:wTgt('tRawWaste'),condiment:wTgt('tCondiment'),empMeal:wTgt('tEmpFood'),statVar:wTgt('tStatLoss'),baseFoodPct:wTgt('tFOBBase'),pLFoodPct:wTgt('tFOBTotal')};
      return {
        tgts,
        fobPct:mtd.fobPct,baseFoodPct:mtd.baseFoodPct,unexplained:mtd.unexplained,
        compWaste:mtd.compWaste,rawWaste:mtd.rawWaste,condiment:mtd.condiment,
        empMeal:mtd.empMeal,statVar:mtd.statVar,discCoupon:discCouponTotal,
        pLFoodPct:mtd.pLFoodPct,pLPaperPct:mtd.pLPaperPct,
        primaryIsMTD:true,curMonth:fobPeriods.curLabel,priorMonth:fobPeriods.priorLabel,
        okFobPct:mtdOk&&mtdOk.fobPct,flFobPct:mtdFl&&mtdFl.fobPct,
        okPLFoodPct:mtdOk&&mtdOk.pLFoodPct,flPLFoodPct:mtdFl&&mtdFl.pLFoodPct,
        okBaseFoodPct:mtdOk&&mtdOk.baseFoodPct,flBaseFoodPct:mtdFl&&mtdFl.baseFoodPct,
        okUnexp:mtdOk&&mtdOk.unexplained,flUnexp:mtdFl&&mtdFl.unexplained,
        okCompWaste:mtdOk&&mtdOk.compWaste,flCompWaste:mtdFl&&mtdFl.compWaste,
        okRawWaste:mtdOk&&mtdOk.rawWaste,flRawWaste:mtdFl&&mtdFl.rawWaste,
        okCondiment:mtdOk&&mtdOk.condiment,flCondiment:mtdFl&&mtdFl.condiment,
        okEmpMeal:mtdOk&&mtdOk.empMeal,flEmpMeal:mtdFl&&mtdFl.empMeal,
        okStatVar:mtdOk&&mtdOk.statVar,flStatVar:mtdFl&&mtdFl.statVar,
        okDiscCoupon:mtdOk&&mtdOk.discCoupon,flDiscCoupon:mtdFl&&mtdFl.discCoupon,
        priorFobPct:pr('fobPct'),priorBaseFoodPct:pr('baseFoodPct'),priorPLFoodPct:pr('pLFoodPct'),priorPLPaperPct:pr('pLPaperPct'),
        priorUnexplained:pr('unexplained'),priorCompWaste:pr('compWaste'),priorRawWaste:pr('rawWaste'),
        priorCondiment:pr('condiment'),priorEmpMeal:pr('empMeal'),priorStatVar:pr('statVar'),priorDiscCoupon:pr('discCoupon'),
      };
    }
    // Fallback: manual FOB Report only (no auto qsr_fob). fobRecent rows here are the
    // MANUAL upload's already-computed per-store-day %s (no raw $ amounts to re-sum the
    // way fobAgg does for the auto MTD path above) — but they DO carry `sales`, so this
    // can still be a real Σ(pct×sales)/Σsales weighted average instead of mktAvg's
    // average-of-per-store-averages (2026-08-06, cleanup-backlog Class 1).
    if(!fobRecent.length)return null;
    const scoped=fobRecent.filter(r=>allLocs.includes(String(r.loc)));
    const a=f=>avgOf(scoped,f);
    const wAvg=(rows,f)=>{let n=0,d=0;for(const r of rows){const v=r[f],s=r.sales||0;if(v!=null&&!isNaN(v)&&s>0){n+=v*s;d+=s;}}return d?n/d:null;};
    const wScope=(locs,f)=>wAvg(fobRecent.filter(r=>locs.includes(String(r.loc))),f);
    return{
      fobPct:a('fobPct'),baseFoodPct:a('baseFoodPct'),unexplained:a('unexplained'),
      compWaste:a('compWaste'),rawWaste:a('rawWaste'),condiment:a('condiment'),
      empMeal:a('empMeal'),statVar:a('statVar'),discCoupon:a('discCoupon'),
      pLFoodPct:a('pLFoodPct'),pLPaperPct:a('pLPaperPct'),primaryIsMTD:false,
      okFobPct:wScope(okLocs,'fobPct'),flFobPct:wScope(flLocs,'fobPct'),
      okPLFoodPct:wScope(okLocs,'pLFoodPct'),flPLFoodPct:wScope(flLocs,'pLFoodPct'),
      okBaseFoodPct:wScope(okLocs,'baseFoodPct'),flBaseFoodPct:wScope(flLocs,'baseFoodPct'),
      okUnexp:wScope(okLocs,'unexplained'),flUnexp:wScope(flLocs,'unexplained'),
      okCompWaste:wScope(okLocs,'compWaste'),flCompWaste:wScope(flLocs,'compWaste'),
      okRawWaste:wScope(okLocs,'rawWaste'),flRawWaste:wScope(flLocs,'rawWaste'),
      okCondiment:wScope(okLocs,'condiment'),flCondiment:wScope(flLocs,'condiment'),
      okEmpMeal:wScope(okLocs,'empMeal'),flEmpMeal:wScope(flLocs,'empMeal'),
      okStatVar:wScope(okLocs,'statVar'),flStatVar:wScope(flLocs,'statVar'),
      okDiscCoupon:wScope(okLocs,'discCoupon'),flDiscCoupon:wScope(flLocs,'discCoupon'),
    };
  },[fobPeriods,fobRecent,allLocs,okLocs,flLocs]);

  // ── Intelligence Summary (Morning Brief) ─────────────────────────
  const intelSec=React.useMemo(()=>{
    if(!stores.length) return null;
    // Weighted district targets (sales-weighted where possible, else simple avg)
    const getTgt=(tKey,dflt)=>{
      const vals=allLocs.map(l=>{const t=(settings.targets&&settings.targets[l])||DEFAULT_TARGETS[l]||{};return t[tKey]??dflt;});
      return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:dflt;
    };
    // #164: laborTgt routes through resolveLaborTarget (tCrewLabor), not the generic
    // getTgt('tLabor', ...) — same field the score/findings/other panels now all cite.
    const laborTgt=(()=>{const vals=allLocs.map(l=>{const t=(settings.targets&&settings.targets[l])||DEFAULT_TARGETS[l]||{};return resolveLaborTarget(t)??0.22;});return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:0.22;})();
    const fobTgt=getTgt('tFOBTotal',0.279);
    const oepeTgt=getTgt('tOepe',140);
    const tpphTgt=getTgt('tTpph',5.5);
    const parkTgt=getTgt('tPark',0.12);
    // Per-store alert analysis
    const diMap=settings.dialedIn||{};
    const storeAlerts=allLocs.map(loc=>{
      const t=(settings.targets&&settings.targets[loc])||DEFAULT_TARGETS[loc]||{};
      const locLabor=laborSec?.ranked?.find(r=>r.loc===String(loc))?.laborPct;
      const locMape=diMap[loc]?.mape6w??diMap[loc]?.mape4w??diMap[loc]?.mape;
      const s=stores.find(st=>st.loc===String(loc));
      const p=s?.p||{};
      const issues=[];
      if(p.t4w!=null&&p.t4w<-0.05) issues.push('sales↓');
      if(locLabor!=null&&locLabor>(resolveLaborTarget(t)||laborTgt)+0.02) issues.push('labor↑');
      if(locMape!=null&&locMape>10) issues.push('mape↑');
      return{loc,issues};
    }).filter(x=>x.issues.length>0);
    const declineSt=storeAlerts.filter(x=>x.issues.includes('sales↓')).length;
    const laborSt=storeAlerts.filter(x=>x.issues.includes('labor↑')).length;
    const mapeSt=storeAlerts.filter(x=>x.issues.includes('mape↑')).length;
    return{laborTgt,fobTgt,oepeTgt,tpphTgt,parkTgt,storeAlerts,declineSt,laborSt,mapeSt};
  },[allLocs,stores,settings,laborSec]);

  // ── Existing district projection (reuse existing data) ────────
  const [deepStore,setDeepStore]=React.useState(null);
  const [projPeriod,setProjPeriod]=React.useState('week');

  const userName=settings.userName||'';
  const hour=today.getHours();
  const greetWord=hour<12?'Good morning':hour<17?'Good afternoon':'Good evening';

  const [headerScrolled, setHeaderScrolled] = React.useState(false);
  const handleAAGScroll = React.useCallback((e) => {
    setHeaderScrolled(e.currentTarget.scrollTop > 60);
  }, []);

  const pF=v=>v!=null?fP(v):'—';
  const pFn=(v,d=1)=>v!=null?((v*100).toFixed(d)+'%'):'—';
  const sFmt=v=>v!=null?f$(Math.round(v)):'—';
  const tFmt=v=>v!=null?Math.round(v)+'s':'—';

  // ── Weekly trend (last 6 completed weeks, for Projections sparkline) ─
  // ── Deferred CI + Drift (Enhancement 3+4) ────────────────────────────────
  // Computed asynchronously after initial render to avoid blocking the page
  // load with 2,000+ forecastDay calls. Yields to the event loop between each
  // store so no single macrotask exceeds ~150ms.
  const [ciAndDrift,setCiAndDrift]=React.useState(null);
  React.useEffect(()=>{
    if(!ds||!ds.loaded||!stores||!stores.length){setCiAndDrift(null);return;}
    let cancelled=false;
    const Y=()=>new Promise(r=>setTimeout(r,0)); // yield helper
    const run=async()=>{
      try{
        const nextWeekStart=mwStart();
        const cfg={...settings,_userEvents:userEvents||{}};

        // computeStoreSigma inlined with per-row yields (every 5 forecastDay calls)
        // prevents any single macrotask from exceeding ~40ms
        const sigmas=[];
        for(const s of stores){
          const loc=s.loc;
          const anchor=ds.lastActual&&ds.lastActual[loc]?ds.lastActual[loc]:new Date();
          const cutoff=addD(anchor,-42);
          const _locLab=locRows(ds.laborByLoc,ds.laborRows,loc);
          const rows=_locLab.filter(r=>r.date>=cutoff&&r.date<=anchor&&r.sales>0);
          if(rows.length<7){sigmas.push(0.07);await Y();continue;}
          const errs=[];
          for(let i=0;i<rows.length;i++){
            if(i>0&&i%5===0){await Y();if(cancelled)return;}
            try{
              const fc=forecastDay(loc,rows[i].date,ds,cfg,null,null);
              if(fc&&!fc.isFuture&&fc.actual&&fc.actual>0){
                const e=(fc.actual-fc.forecast)/fc.actual;
                if(Math.abs(e)<0.40) errs.push(e);
              }
            }catch{}
          }
          if(errs.length>=5){
            const mean=errs.reduce((a,b)=>a+b,0)/errs.length;
            sigmas.push(+Math.sqrt(errs.reduce((a,b)=>a+(b-mean)**2,0)/errs.length).toFixed(4));
          }else sigmas.push(0.07);
          await Y();
        }
        if(cancelled)return;

        const avgSigma=sigmas.reduce((a,b)=>a+b,0)/sigmas.length||0.07;

        // forecastDay for next week projection — yield between stores
        const dayFcs=[];
        for(const s of stores){
          try{const r=forecastDay(s.loc,nextWeekStart,ds,settings);dayFcs.push(r&&!r.noLYData?(r.forecast||0):0);}catch{dayFcs.push(0);}
          await Y();
        }
        if(cancelled)return;

        const weekFcTotal=dayFcs.reduce((a,b)=>a+b,0)*7;
        const ciLow=weekFcTotal>0?Math.round(weekFcTotal*(1-1.645*avgSigma)):0;
        const ciHigh=weekFcTotal>0?Math.round(weekFcTotal*(1+1.645*avgSigma)):0;

        // computeMAPEDrift inlined with per-row yields
        const driftStores=[];
        for(const s of stores){
          const loc=s.loc;
          const anchor=ds.lastActual&&ds.lastActual[loc]?ds.lastActual[loc]:new Date();
          const cut2=addD(anchor,-14),cut6=addD(anchor,-42);
          const _locLab=locRows(ds.laborByLoc,ds.laborRows,loc);
          const rows6=_locLab.filter(r=>r.date>=cut6&&r.date<=anchor&&r.sales>0);
          if(rows6.length<7){await Y();continue;}
          const rows2=rows6.filter(r=>r.date>=cut2);
          const errOf=async(rowsToProcess)=>{
            const errs=[];
            for(let i=0;i<rowsToProcess.length;i++){
              if(i>0&&i%5===0){await Y();if(cancelled)return null;}
              try{
                const fc=forecastDay(loc,rowsToProcess[i].date,ds,cfg,null,null);
                if(!fc||fc.isFuture||!fc.actual||fc.actual<=0||!fc.forecast) continue;
                errs.push(Math.abs(fc.actual-fc.forecast)/fc.actual*100);
              }catch{}
            }
            return errs;
          };
          const err6=await errOf(rows6);if(err6===null||cancelled)return;
          if(!err6.length){await Y();continue;}
          const err2=await errOf(rows2);if(err2===null||cancelled)return;
          const mape6=err6.reduce((a,b)=>a+b,0)/err6.length;
          const mape2=err2.length?err2.reduce((a,b)=>a+b,0)/err2.length:mape6;
          const drift=Math.abs(mape2-mape6);
          const d={mape2w:+mape2.toFixed(1),mape6w:+mape6.toFixed(1),drift:+drift.toFixed(1),
            status:drift>=5?'recalibrate':drift>=2?'warn':'ok'};
          if(d.status!=='ok'&&d.drift>=2) driftStores.push({s,d});
          await Y();
        }
        if(cancelled)return;
        setCiAndDrift({ciLow,ciHigh,driftStores,avgSigma});
      }catch(e){if(!cancelled)setCiAndDrift(null);}
    };
    run();
    return()=>{cancelled=true;};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[ds&&ds.laborRows&&ds.laborRows.length,stores&&stores.length]);

  // Auto-first (data-integrity sweep signature #2, MEDIUM item) — was ds.laborRows only,
  // manual-only; sits next to code elsewhere in this view that already migrated OEPE/Labor/
  // T-Reds for the same reason.
  const weeklyTrend=React.useMemo(()=>{    if(!ds?.loaded||!allLocs?.length)return[];
    const wsd=settings?.weekStartDay??3;
    const getWS=d=>{const w=new Date(d);while(w.getDay()!==wsd)w.setDate(w.getDate()-1);w.setHours(0,0,0,0);return w;};
    const sumSales=range=>allLocs.reduce((tot,loc)=>tot+Object.values(metricSeries(ds,loc,range,'sales')).reduce((a,b)=>a+b,0),0);
    const result=[];
    for(let w=6;w>=1;w--){
      const ws=getWS(addD(today,-(w*7))),we=addD(new Date(ws),6);we.setHours(23,59,59,999);
      const sales=sumSales({s:ws,e:we});
      if(!sales){result.push({label:'—',sales:0,vsLY:null});continue;}
      const lyWs=addD(new Date(ws),-364),lyWe=addD(new Date(we),-364);
      const lySales=sumSales({s:lyWs,e:lyWe});
      result.push({label:ws.toLocaleDateString('en-US',{month:'short',day:'numeric'}),
        sales,lySales,vsLY:lySales>0?(sales-lySales)/lySales:null});
    }
    return result;
  },[ds,allLocs,settings?.weekStartDay]);

  // ── Leaderboard store rankings ────────────────────────────────────────
  const lbData=React.useMemo(()=>{
    const META={
      sales:{getVal:loc=>{const r=labInRange.filter(r=>r.loc===String(loc));const v=r.reduce((a,x)=>a+(x.allNetSales||0),0);return r.length&&v>0?v:null;},
        fmt:v=>f$(Math.round(v)),higherBetter:true,label:'Net Sales',unit:'$'},
      // OEPE/Labor/T-Reds read the AUTO+manual merged effective sources (svcEffective/ctrlEffective) so
      // they populate from the cloud DAR/Glimpse feeds — not just manual Ops/Controls uploads, which
      // stopped mid-July and left these three tabs blank. Fall back to the raw in-range arrays if empty.
      oepe:{getVal:loc=>avgOf((svcEffective.rows||[]).filter(r=>r.loc===String(loc)),'oepe') ?? avgOf(opsInRange.filter(r=>r.loc===String(loc)),'oepe'),
        fmt:v=>Math.round(v)+'s',higherBetter:false,label:'OEPE W/O Parked',unit:'s'},
      labor:{getVal:loc=>avgOf((ctrlEffective.rows||[]).filter(r=>r.loc===String(loc)),'laborPct') ?? avgOf(labInRange.filter(r=>r.loc===String(loc)),'laborPct'),
        fmt:v=>((v||0)*100).toFixed(2)+'%',higherBetter:false,label:'Labor %',unit:'%'},
      tred:{getVal:loc=>avgOf((ctrlEffective.rows||[]).filter(r=>r.loc===String(loc)),'tRedAPct',true) ?? avgOf(ctrlInRange.filter(r=>r.loc===String(loc)),'tRedAPct',true),
        fmt:v=>((v||0)*100).toFixed(2)+'%',higherBetter:false,label:'T-Red After %',unit:'%'},
    };
    const m=META[lbMetric]||META.sales;
    const data=allLocs.map(loc=>({loc,name:STORE_NAMES[String(loc)]||loc,
      value:m.getVal(loc),org:flLocs.includes(String(loc))?'FL':'OK'}))
      .filter(x=>x.value!=null)
      .sort((a,b)=>m.higherBetter?b.value-a.value:a.value-b.value);
    const avg=data.length?data.reduce((a,s)=>a+s.value,0)/data.length:null;
    return{data,avg,fmt:m.fmt,label:m.label,higherBetter:m.higherBetter};
  },[lbMetric,labInRange,opsInRange,ctrlInRange,svcEffective,ctrlEffective,allLocs,flLocs]);

  // Digital sales section useMemo
  const digitalSec=React.useMemo(()=>{
    // Channel breakdown (deliv/mop/kiosk) comes from channelRows = manual labor MERGED with the
    // emailed Sales Ledger — NOT labInRange (labor + DAR), because the DAR has no channel split,
    // so once manual labor stopped the tile read 0% digital (Notes: Jul-2026). Sales Ledger is
    // the current channel source.
    const chRows=channelRows.rows||[];
    if(!chRows.length)return null;
    const sm=allLocs.map(loc=>{
      const rows=chRows.filter(r=>r.loc===String(loc));
      const tot=rows.reduce((a,r)=>a+(r.allNetSales||r.sales||0),0);
      if(!tot)return null;
      const deliv=rows.reduce((a,r)=>a+(r.delivSales||0),0);
      const mop=rows.reduce((a,r)=>a+(r.mopSales||0),0);
      const kiosk=rows.reduce((a,r)=>a+(r.kioskSales||0),0);
      const dt=rows.reduce((a,r)=>a+(r.dtSales||0),0);
      const eatIn=rows.reduce((a,r)=>a+(r.eatInSales||0),0);
      return{loc,tot,deliv,mop,kiosk,dig:deliv+mop+kiosk,dt,eatIn,org:flLocs.includes(String(loc))?'FL':'OK'};
    }).filter(Boolean);
    if(!sm.length)return null;
    const distTot=sm.reduce((a,s)=>a+s.tot,0);
    if(!distTot)return null;
    const distDig=sm.reduce((a,s)=>a+s.dig,0);
    const distDeliv=sm.reduce((a,s)=>a+s.deliv,0);
    const distMop=sm.reduce((a,s)=>a+s.mop,0);
    const distKiosk=sm.reduce((a,s)=>a+s.kiosk,0);
    const pct=v=>distTot>0?v/distTot:null;
    const mktPct=(locs,field)=>{const ms=sm.filter(s=>locs.includes(String(s.loc)));const t=ms.reduce((a,s)=>a+s.tot,0);const v=ms.reduce((a,s)=>a+s[field],0);return t>0?v/t:null;};
    return{digitalPct:pct(distDig),delivPct:pct(distDeliv),mopPct:pct(distMop),kioskPct:pct(distKiosk),
      digitalSales:distDig,delivSales:distDeliv,mopSales:distMop,kioskSales:distKiosk,totSales:distTot,
      okDigPct:mktPct(okLocs,'dig'),flDigPct:mktPct(flLocs,'dig'),
      okDelivPct:mktPct(okLocs,'deliv'),flDelivPct:mktPct(flLocs,'deliv'),
      okMopPct:mktPct(okLocs,'mop'),flMopPct:mktPct(flLocs,'mop'),
      okKioskPct:mktPct(okLocs,'kiosk'),flKioskPct:mktPct(flLocs,'kiosk'),
      digStoreCount:sm.filter(s=>s.dig>0).length,storeCount:sm.length};
  },[channelRows,okLocs,flLocs,allLocs]);

  // ── No data state ─────────────────────────────────────────────
  // noData is false when either manual laborRows OR auto-synced qsrActSummaryRows are present
  const noData=!ds?.laborRows?.length&&!ds?.qsrActSummaryRows?.length;

  // ── District weekly projections — memoized so 189 forecastDay calls only fire
  // when ds/stores/settings/userEvents actually change, not on every render
  // (opening Data Manager, state updates, etc. previously re-ran all 189 calls).
  const weekProjections=React.useMemo(()=>{
    if(!ds||!ds.loaded||!stores||!stores.length)return null;
    const _today=new Date();
    const wsd=settings.weekStartDay!=null?settings.weekStartDay:3;
    const ws=new Date(_today);while(ws.getDay()!==wsd)ws.setDate(ws.getDate()-1);
    const weekDays=Array.from({length:7},(_,i)=>addD(new Date(ws.getFullYear(),ws.getMonth(),ws.getDate(),12),i));
    const wsKey=dKey(new Date(ws.getFullYear(),ws.getMonth(),ws.getDate(),12));
    // computeEventFactors called ONCE here — not 189× inside the loop
    const _eventFactors=settings.useEventRegistry!==false?computeEventFactors(ds,userEvents||{}):{};
    const cfg={...settings,_userEvents:userEvents||{},_eventFactors};
    const _allLocs=(stores||[]).filter(s=>/^\d+$/.test(s.loc)).map(s=>s.loc);
    // Cloud actuals supplement: the forecast engine reads actuals ONLY from manually
    // uploaded laborRows (laborIdx), so the current partial week — whose actuals arrive
    // in the auto-synced qsrActSummaryRows (DAR) — showed blank Actual/vs LY/Acc% all
    // week. Index the cloud daily sales/LY per (normLoc, dayKey) and fill any day the
    // manual path left at 0 (freshest-wins: manual is never overridden). ly is upgraded
    // to the cloud row's REAL last-year sales when present (fixes vs-LY on filled days).
    const _nl=l=>String(parseInt(String(l).replace(/\D/g,''),10)||'');
    const _cloudAct={}, _cloudLY={};
    for(const r of (ds.qsrActSummaryRows||[])){
      if(!r||r.loc==null||!r.date)continue;
      const k=_nl(r.loc)+'|'+dKey(r.date);
      const s=(r.allNetSales||r.sales)||0;
      if(s>0&&_cloudAct[k]==null)_cloudAct[k]=s;
      if(r.lySales>0&&_cloudLY[k]==null)_cloudLY[k]=r.lySales;
    }
    const storeProjs=_allLocs.map(loc=>{
      const t=(ds.targets&&ds.targets[loc])||DEFAULT_TARGETS[loc]||{};
      const rowDays=weekDays.map(d=>{
        const r=forecastDay(loc,d,ds,cfg,null,t);
        let act=r.actual||0, ly=r.lyAdj||0;
        if(act<=0){ const ck=_nl(loc)+'|'+dKey(d); const ca=_cloudAct[ck]; if(ca>0){ act=ca; const cly=_cloudLY[ck]; if(cly>0)ly=cly; } }
        return{fc:r.forecast||0,act,ly};
      });
      const wkTotal=rowDays.reduce((a,r)=>a+r.fc,0);
      const lyTotal=rowDays.reduce((a,r)=>a+r.ly,0);
      const actualTotal=rowDays.reduce((a,r)=>a+r.act,0);
      const vsLY=lyTotal>0?((wkTotal-lyTotal)/lyTotal*100).toFixed(2):null;
      return{loc,name:STORE_NAMES[String(loc)]||loc,wkTotal,lyTotal,actualTotal,vsLY,org:orgOf(loc),rowDays};
    }).sort((a,b)=>b.wkTotal-a.wkTotal);
    return{storeProjs,weekDays,wsKey};
  },[ds?.laborRows?.length,ds?.qsrActSummaryRows?.length,stores,settings,userEvents]);

  // ── RENDER ────────────────────────────────────────────────────
  return div({style:{display:'flex',flexDirection:'column',height:'100%',overflowY:'auto'},
    onScroll:handleAAGScroll},

    // ── WELCOME HEADER ─────────────────────────────────────────
    div({style:{background:'linear-gradient(135deg,#090e18 0%,rgba(10,18,40,.98) 100%)',
      padding:headerScrolled?'6px 24px':'18px 24px 14px',
      borderBottom:'1px solid var(--bdr)',flexShrink:0,
      transition:'padding .2s ease'}},

      // Title row — always visible, compact when scrolled
      div({style:{display:'flex',alignItems:'center',justifyContent:'space-between',
        marginBottom:headerScrolled?0:8}},
        div(null,
          div({style:{fontSize:headerScrolled?'14px':'22px',fontWeight:800,color:'var(--amber)',
            letterSpacing:'-0.5px',lineHeight:1.1,transition:'font-size .2s ease'}},
            'At a Glance'),
          !headerScrolled&&(userName
            ?div({style:{fontSize:'13px',color:'rgba(255,255,255,.8)',marginTop:2,fontWeight:500}},
                greetWord+', '+userName+'!')
            :div({style:{fontSize:'12px',color:'rgba(255,255,255,.5)',marginTop:2}},
                greetWord+'!  ',
                span({style:{fontSize:'10px',color:'rgba(245,158,11,.6)',cursor:'pointer'},
                  onClick:()=>{}/* Settings is a separate nav */,
                  title:'Go to Settings → Your Name to personalize your greeting'},
                  '(Add your name in Settings ✎)')))
        ),
        // Period label — always visible
        div({style:{fontSize:'10px',padding:'4px 10px',borderRadius:4,
          background:'rgba(255,255,255,.18)',border:'.5px solid rgba(255,255,255,.4)',
          color:'#fff',fontWeight:500,letterSpacing:'.2px',whiteSpace:'nowrap'}},
          dateRange&&dateRange.s?
            dateRange.s.toLocaleDateString('en-US',{month:'short',day:'numeric'})+
            ' – '+dateRange.e.toLocaleDateString('en-US',{month:'short',day:'numeric'}):
            'This Week')
      ),

      // State comment + freshness — hidden when scrolled
      !headerScrolled&&div(null,
        div({style:{display:'flex',alignItems:'center',gap:8,marginBottom:6}},
          div({style:{flex:1,fontSize:'11px',lineHeight:1.5,
            color:commentMode==='ai'&&aiComment?'rgba(255,255,255,.85)':ruleComment.color}},
            commentMode==='rule'?ruleComment.text:
            aiLoading?'Generating...':(aiComment||ruleComment.text)),
          div({style:{display:'flex',gap:4}},
            ['rule','ai'].map(m=>btn({key:m,
              style:{fontSize:'9px',padding:'2px 8px',borderRadius:3,cursor:'pointer',fontWeight:500,
                background:commentMode===m?'rgba(245,158,11,.35)':'rgba(255,255,255,.18)',
                color:commentMode===m?'var(--amber)':'#fff',
                border:commentMode===m?'.5px solid rgba(245,158,11,.6)':'.5px solid rgba(255,255,255,.4)'},
              onClick:()=>{setCommentMode(m);if(m==='ai'&&!aiComment)fetchAIComment();}},
              m==='rule'?'Rule-Based':'AI Narrative'))
          )
        ),
        div({style:{fontSize:'9px',color:ageClr}},
          '● Data: '+(latestLab?latestLab.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})+' ('+dataAge+'d ago)':'Not loaded')),
        salesRecon.count>=2&&div({
          title:(salesRecon.r.ok?'Product-sales sources agree within 2%':'Product-sales sources disagree by '+((salesRecon.r.relative||0)*100).toFixed(2)+'% (>2%)')
            +'\nDAR (Σ product sales): $'+Math.round(salesRecon.darTot).toLocaleString()
            +'\nSales Ledger (product): $'+Math.round(salesRecon.ledTot).toLocaleString()
            +(salesRecon.labTot>0?'\nLabor (net basis — reference only, not reconciled): $'+Math.round(salesRecon.labTot).toLocaleString():''),
          style:{fontSize:'9px',fontWeight:700,color:salesRecon.r.ok?'#10b981':'#f59e0b',cursor:'default',whiteSpace:'nowrap'}},
          salesRecon.r.ok?'✓ Sales reconciled':'⚠ Sales sources differ '+((salesRecon.r.relative||0)*100).toFixed(2)+'%')
      )
    ),

    // ── TODAY'S MOVERS (auto-fresh) ─────────────────────────────
    moversStrip&&(moversStrip.up.length||moversStrip.down.length||moversStrip.slowDT.length)&&div({
      style:{background:'linear-gradient(90deg,rgba(245,188,0,.06),transparent)',
        borderBottom:'.5px solid var(--bdr)',padding:'7px 24px',flexShrink:0,
        display:'flex',alignItems:'center',gap:12,flexWrap:'wrap',fontSize:'11px'}},
      span({style:{fontWeight:700,color:'var(--amber)',whiteSpace:'nowrap'}},'📊 Today’s Movers'),
      span({style:{fontSize:'8px',color:'var(--text3)',whiteSpace:'nowrap'}},
        'sales & DT speed · as of '+moversStrip.date.toLocaleDateString('en-US',{month:'short',day:'numeric'})),
      (moversStrip.up.length||moversStrip.down.length)&&span({style:{fontSize:'8px',fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.3px',whiteSpace:'nowrap'}},'Sales vs LY'),
      ...moversStrip.up.map((r,i)=>span({key:'u'+i,style:{color:'#10b981',whiteSpace:'nowrap',fontWeight:600},title:'Net sales vs last year'},
        '▲ '+(STORE_NAMES[r.loc]||r.loc)+' '+(r.salesVsLYPct>=0?'+':'')+r.salesVsLYPct.toFixed(2)+'%')),
      ...moversStrip.down.map((r,i)=>span({key:'d'+i,style:{color:'#f87171',whiteSpace:'nowrap',fontWeight:600},title:'Net sales vs last year'},
        '▼ '+(STORE_NAMES[r.loc]||r.loc)+' '+r.salesVsLYPct.toFixed(2)+'%')),
      moversStrip.slowDT.length&&span({style:{fontSize:'8px',fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.3px',whiteSpace:'nowrap'}},'Slowest DT'),
      ...moversStrip.slowDT.map((r,i)=>span({key:'dt'+i,style:{color:'var(--text2)',whiteSpace:'nowrap'},title:'Average drive-thru until-serve time today'},
        '🚗 '+(STORE_NAMES[r.loc]||r.loc)+' '+Math.round(r.dt)+'s')),
      moversStrip.total>0&&span({style:{color:'var(--text3)',whiteSpace:'nowrap',marginLeft:'auto'},title:'Stores with net sales below last year today'},
        moversStrip.behind+' of '+moversStrip.total+' stores behind LY')
    ),

    // ── ACTION CHECKLIST ───────────────────────────────────────
    div({style:{background:'var(--surf)',borderBottom:'.5px solid var(--bdr)',
      padding:'6px 24px',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'flex-end',gap:6}},
      archivedCl.length>0&&btn({style:{fontSize:'9px',color:'var(--text3)',background:'none',border:'none',cursor:'pointer'},
        onClick:()=>setShowArchive(!showArchive)},
        (showArchive?'Hide':'Show')+' archive ('+archivedCl.length+')'),
      btn({style:{fontSize:'10px',color:'var(--text3)',background:'none',border:'none',cursor:'pointer',
        padding:'2px 6px',borderRadius:3,border:'.5px solid var(--bdr)'},
        onClick:()=>setShowSecCfg(!showSecCfg)},'Sections ☰')
    ),

    allActiveItems.length>0&&div({style:{background:'var(--surf)',borderBottom:'.5px solid var(--bdr)',
      padding:'10px 24px',flexShrink:0}},
      div({style:{fontSize:'11px',fontWeight:700,color:'var(--amber)',marginBottom:6}},
        '📋 Action Checklist ('+allActiveItems.length+' active)'),
      div({style:{display:'flex',flexDirection:'column',gap:4}},
        allActiveItems.map(item=>
          div({key:item.id,style:{display:'flex',alignItems:'flex-start',gap:8,padding:'5px 8px',
            borderRadius:5,background:item.priority==='high'?'rgba(248,113,113,.08)':
              item.priority==='medium'?'rgba(245,158,11,.08)':'rgba(255,255,255,.04)',
            border:'.5px solid '+(item.priority==='high'?'rgba(248,113,113,.2)':
              item.priority==='medium'?'rgba(245,158,11,.2)':'rgba(255,255,255,.08)')}},
            btn({style:{flexShrink:0,width:16,height:16,borderRadius:3,
              border:'.5px solid var(--bdr)',background:'transparent',cursor:'pointer',
              display:'flex',alignItems:'center',justifyContent:'center',marginTop:1},
              onClick:()=>archiveItem(item.id)},''),
            div({style:{flex:1,minWidth:0}},
              div({style:{fontSize:'10px',fontWeight:500,color:'var(--text)'}},item.text),
              item.detail&&div({style:{fontSize:'9px',color:'var(--text3)',marginTop:2,wordBreak:'break-all'}},item.detail)
            ),
            span({style:{fontSize:'8px',color:item.priority==='high'?'#f87171':'#f59e0b',flexShrink:0,marginTop:2}},
              item.priority==='high'?'●':item.priority==='medium'?'◑':'')
          )
        )
      ),
      showArchive&&archivedCl.length>0&&div({style:{marginTop:8,borderTop:'.5px solid var(--bdr)',paddingTop:8}},
        div({style:{fontSize:'9px',fontWeight:700,color:'var(--text3)',marginBottom:4}},'ARCHIVED'),
        archivedCl.map(item=>
          div({key:item.id,style:{display:'flex',alignItems:'center',gap:8,padding:'3px 6px',opacity:.6}},
            div({style:{flex:1,fontSize:'9px',color:'var(--text3)',textDecoration:'line-through'}},item.text),
            btn({style:{fontSize:'9px',color:'var(--amber)',background:'none',border:'none',cursor:'pointer'},
              onClick:()=>restoreItem(item.id)},'Restore'),
            btn({style:{fontSize:'9px',color:'#f87171',background:'none',border:'none',cursor:'pointer'},
              onClick:()=>deleteItem(item.id)},'✕')
          )
        )
      )
    ),

    // ── SECTION CONFIG PANEL ──────────────────────────────────
    showSecCfg&&div({style:{background:'var(--surf2)',borderBottom:'.5px solid var(--bdr)',
      padding:'10px 24px',flexShrink:0}},
      div({style:{fontSize:'11px',fontWeight:700,color:'var(--amber)',marginBottom:8}},'⚙ Configure KPI Sections'),
      div({style:{display:'flex',flexWrap:'wrap',gap:6}},
        secs.map((s,i)=>
          div({key:s.id,style:{display:'flex',alignItems:'center',gap:6,padding:'4px 8px',
            borderRadius:5,background:s.on?'rgba(245,158,11,.12)':'rgba(255,255,255,.04)',
            border:'.5px solid '+(s.on?'rgba(245,158,11,.3)':'var(--bdr)')}},
            btn({style:{fontSize:'9px',background:'none',border:'none',cursor:'pointer',color:'var(--text3)'},
              onClick:()=>moveSec(s.id,-1),disabled:i===0},'↑'),
            btn({style:{fontSize:'9px',background:'none',border:'none',cursor:'pointer',color:'var(--text3)'},
              onClick:()=>moveSec(s.id,1),disabled:i===secs.length-1},'↓'),
            span({style:{fontSize:'12px'}},s.icon),
            span({style:{fontSize:'10px',color:s.on?'var(--amber)':'var(--text3)'}},s.label),
            btn({style:{fontSize:'9px',padding:'1px 6px',borderRadius:3,cursor:'pointer',
              background:s.on?'var(--amber)':'rgba(255,255,255,.08)',
              color:s.on?'var(--navy)':'var(--text3)',border:'none'},
              onClick:()=>toggleSec(s.id)},s.on?'On':'Off')
          )
        )
      )
    ),

    // ── LOADED DATA SUMMARY ────────────────────────────────────
    div({style:{background:'var(--surf)',borderBottom:'.5px solid var(--bdr)',
      padding:headerScrolled?'0 24px':'8px 24px',flexShrink:0,display:'flex',alignItems:'center',
      gap:16,flexWrap:'wrap',overflow:'hidden',
      maxHeight:headerScrolled?0:'120px',transition:'max-height .2s ease, padding .2s ease'}},
      div({style:{fontSize:'10px',fontWeight:700,color:'var(--text3)',
        letterSpacing:'.5px',textTransform:'uppercase',flexShrink:0}},'Loaded Data'),
      ...(()=>{
        // Each category shows the FRESHEST across its manual AND auto/emailed streams
        // (Notes: Jul-2026). Manual uploads legitimately stop when the owner stops
        // uploading; anchoring the strip to manual alone made it read weeks-stale even
        // though the auto DAR/Glimpse/Ledger/qsr_fob streams were current. Union the
        // relevant streams so the date range reflects reality (auto/emailed-first rule).
        const _u=(...arrs)=>arrs.flatMap(a=>a||[]);
        const sources=[
          {name:'Sales',      rows:_u(ds?.qsrActSummaryRows,ds?.salesLedgerRows,ds?.laborRows),icon:'💰'},
          {name:'Scheduling', rows:ds?.schedRows,icon:'📅'},
          {name:'Service',    rows:_u(ds?.glimpseRows,ds?.qsrActSummaryRows,ds?.opsRows),icon:'⚡'},
          {name:'Controls',   rows:_u(ds?.glimpseRows,ds?.cashRows,ds?.ctrlRows),icon:'🔒'},
          {name:'FOB',        rows:_u(ds?.qsrFobRows,ds?.fobRows),icon:'🍟'},
        ];
        return sources.map(src=>{
          const rows=src.rows||[];
          if(!rows.length)return div({key:src.name,style:{fontSize:'9px',
            color:'rgba(255,255,255,.25)',padding:'2px 8px',borderRadius:3,
            background:'rgba(255,255,255,.04)',border:'.5px solid var(--bdr)'}},
            src.icon+' '+src.name+': Not loaded');
          // Robust across streams: some (qsr_fob) carry string dates + zero-padded locs.
          // Parse dates to ms (skip unparseable → no "Invalid Date"); normalize loc so a
          // padded "0003708" and "3708" don't double-count the store list.
          const ms=rows.map(r=>{const d=r?.date instanceof Date?r.date:(r?.date?new Date(r.date):null);return d&&!isNaN(d.getTime())?d.getTime():null;}).filter(v=>v!=null);
          const minD=ms.length?new Date(Math.min(...ms)):null;
          const maxD=ms.length?new Date(Math.max(...ms)):null;
          const fmt=d=>d?d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'2-digit'}):'?';
          const uniqueLocs=new Set(rows.map(r=>{const n=parseInt(r.loc,10);return isNaN(n)?String(r.loc):String(n);})).size;
          return div({key:src.name,style:{fontSize:'9px',
            color:'var(--text)',padding:'2px 8px',borderRadius:3,
            background:'rgba(16,185,129,.08)',border:'.5px solid rgba(16,185,129,.2)'}},
            src.icon+' '+src.name+': '+fmt(minD)+' – '+fmt(maxD)+
            ' ('+rows.length.toLocaleString()+' rows, '+uniqueLocs+' stores)');
        });
      })()
    ),
    div({style:{flex:1,overflowY:'auto',padding:'12px 24px'}},

      noData&&div({style:{padding:'24px',textAlign:'center',color:'var(--text3)',fontSize:'12px'}},
        div({style:{fontSize:'24px',marginBottom:8}},'📂'),
        div({style:{fontWeight:600,color:'var(--text)',marginBottom:4}},'No data loaded'),
        div(null,'Upload Operations Report to see your At a Glance dashboard.')
      ),

      !noData&&usingQsrFallback&&div({style:{
        margin:'0 0 10px',padding:'8px 12px',borderRadius:6,
        background:'rgba(96,165,250,.08)',border:'.5px solid rgba(96,165,250,.25)',
        display:'flex',alignItems:'center',gap:8,fontSize:'10px',color:'#93c5fd',
      }},
        span({style:{fontSize:'14px'}},'⚡'),
        div(null,
          span({style:{fontWeight:700}},'Showing auto-synced QSRSoft data'),
          span({style:{color:'var(--text3)'}},' — sales & guest counts from daily QSRSoft sync (last 35 days). Upload an Operations Report to add labor, service, and controls data.')
        )
      ),

      !noData&&div({style:{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(min(380px,100%),1fr))',gap:10}},

        // ── SAGE SCHEDULED RUNS TILE (first) ───────────────────
        h(EOMScoreboardTile,{key:'eom-sb',onOpenModal}),
        h(ItemsRecountedTile,{key:'eom-recount',onOpenModal}),
        secs.find(s=>s.id==='sage'&&s.on)&&h(SageRunsTile,{key:'sage'}),

        // ── PROJECTIONS SECTION ──
        // ── INTELLIGENCE SUMMARY TILE ──────────────────────────
        secs.find(s=>s.id==='intelligence'&&s.on)&&(()=>{
          const sl=salesSec,lb=laborSec,fb=fobSec,sv=serviceSec,it=intelSec;
          const noData=!sl&&!lb&&!fb&&!sv;
          // Signal row helper
          const sigRow=(icon,label,valStr,subStr,col,statusDot,navFn)=>
            div({key:label,style:{display:'flex',alignItems:'center',gap:8,padding:'6px 12px',
              borderBottom:'.5px solid rgba(255,255,255,.05)',cursor:navFn?'pointer':'default'},
              onClick:navFn||undefined},
              span({style:{fontSize:'14px',width:20,textAlign:'center'}},icon),
              div({style:{flex:1,minWidth:0}},
                div({style:{fontSize:'9px',fontWeight:600,color:'var(--text)',letterSpacing:'.2px'}},''+label),
                div({style:{fontSize:'8px',color:'var(--text3)',marginTop:1,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}},''+subStr)
              ),
              div({style:{textAlign:'right',flexShrink:0}},
                div({style:{fontSize:'13px',fontWeight:800,fontFamily:'var(--mono)',color:col,lineHeight:1}},valStr),
                div({style:{fontSize:'8px',color:statusDot==='🟢'?'#10b981':statusDot==='🟡'?'#f59e0b':statusDot==='🔴'?'#ef4444':'var(--text3)',fontWeight:700,marginTop:1}},
                  statusDot==='🟢'?'▲ On Track':statusDot==='🟡'?'△ Watch':statusDot==='🔴'?'⚠ Attention':'— No Data')
              )
            );

          // Build signals
          const svLY=sl?.salesVsLY;
          const gcVLY=sl?.gcVsLY;
          const labor=lb?.laborPct;
          const fobFC=fb?.pLFoodPct;
          const mape=projSec?.avgMape;
          const oepe=sv?.oepe;
          const park=sv?.park;

          const signals=[
            {icon:'💰',label:'Sales vs LY (comp)',
             val:svLY!=null?(svLY>=0?'+':'')+(svLY*100).toFixed(2)+'%':'—',
             sub:sl?'$'+(sl.totSales/1000).toFixed(0)+'K total · '+(sl.totGC||0).toLocaleString()+' guests':'Load Operations Report',
             col:svLY==null?'var(--text3)':svLY>=0.01?'#10b981':svLY>=-0.03?'#f59e0b':'#ef4444',
             dot:svLY==null?'—':svLY>=0?'🟢':svLY>=-0.03?'🟡':'🔴',
             nav:()=>onOpenModal&&onOpenModal('ranking:t2w')},
            {icon:'👥',label:'Guest Count vs LY (comp)',
             val:gcVLY!=null?(gcVLY>=0?'+':'')+(gcVLY*100).toFixed(2)+'%':'—',
             sub:gcVLY!=null?'Check Avg: $'+(sl?.avgChk||0).toFixed(2)+(sl?.avgCheckVsLY!=null?' ('+(sl.avgCheckVsLY>=0?'+':'')+(sl.avgCheckVsLY*100).toFixed(2)+'% vs LY)':''):'No LY guest count data',
             col:gcVLY==null?'var(--text3)':gcVLY>=0?'#10b981':gcVLY>=-0.03?'#f59e0b':'#ef4444',
             dot:gcVLY==null?'—':gcVLY>=0?'🟢':gcVLY>=-0.03?'🟡':'🔴',
             nav:()=>onOpenModal&&onOpenModal('ranking:gc')},
            {icon:'👷',label:'Labor %',
             val:labor!=null?(labor*100).toFixed(2)+'%':'—',
             sub:it&&labor!=null?'Target '+((it.laborTgt||0)*100).toFixed(2)+'% · '+(labor-(it.laborTgt||0)>=0?'+':'')+((labor-(it.laborTgt||0))*100).toFixed(2)+'pts vs target'+(it.laborSt>0?' · ⚠ '+it.laborSt+' loc over':''):'No labor data',
             col:labor==null?'var(--text3)':labor>(it?.laborTgt||0.22)+0.02?'#ef4444':labor>(it?.laborTgt||0.22)?'#f59e0b':'#10b981',
             dot:labor==null?'—':labor>(it?.laborTgt||0.22)+0.02?'🔴':labor>(it?.laborTgt||0.22)?'🟡':'🟢',
             nav:()=>onOpenModal&&onOpenModal('labor-analytics')},
            {icon:'🥗',label:'Total Food Cost %',
             val:fobFC!=null?(fobFC*100).toFixed(2)+'%':'—',
             sub:it&&fobFC!=null?'Target '+((it.fobTgt||0)*100).toFixed(2)+'% · '+(fobFC-(it.fobTgt||0)>=0?'+':'')+((fobFC-(it.fobTgt||0))*100).toFixed(2)+'pts vs target'+(fb?.unexplained>0.001?' · ❓ Unexplained: '+(fb.unexplained*100).toFixed(2)+'%':''):'Load FOB data',
             col:fobFC==null?'var(--text3)':fobFC>(it?.fobTgt||0.279)+0.005?'#ef4444':fobFC>(it?.fobTgt||0.279)?'#f59e0b':'#10b981',
             dot:fobFC==null?'—':fobFC>(it?.fobTgt||0.279)+0.005?'🔴':fobFC>(it?.fobTgt||0.279)?'🟡':'🟢',
             nav:()=>onOpenModal&&onOpenModal('fob-analysis')},
            {icon:'🎯',label:'Forecast Accuracy (MAPE)',
             val:mape!=null?mape.toFixed(2)+'%':'—',
             sub:mape!=null?(projSec.locked||0)+'/'+allLocs.length+' locked · '+(projSec.locked===allLocs.length?'All projections locked':'Locks pending')+'  · Model health: 🟢'+projSec.health.green+' 🟡'+projSec.health.yellow+' 🔴'+projSec.health.red:'Run Dialed-In calibration to compute MAPE',
             col:mape==null?'var(--text3)':mape<5?'#10b981':mape<8?'#f59e0b':'#ef4444',
             dot:mape==null?'—':mape<5?'🟢':mape<8?'🟡':'🔴',
             nav:()=>onOpenModal&&onOpenModal('fcst-accuracy')},
            oepe!=null&&{icon:'⚡',label:'OEPE / Drive-Thru Speed',
             val:Math.round(oepe)+'s',
             sub:it?'Target '+Math.round(it.oepeTgt||140)+'s · DT Parked: '+((park||0)*100).toFixed(2)+'%'+(park>(it.parkTgt||0.12)?' ⚠ Over target':''):'No service data',
             col:oepe<(it?.oepeTgt||140)?'#10b981':oepe<(it?.oepeTgt||140)+15?'#f59e0b':'#ef4444',
             dot:oepe<(it?.oepeTgt||140)?'🟢':oepe<(it?.oepeTgt||140)+15?'🟡':'🔴',
             nav:()=>onOpenModal&&onOpenModal('ranking:oepe')},
          ].filter(Boolean);

          return div({style:{background:'var(--surf)',border:'.5px solid var(--bdr)',borderRadius:8,overflow:'hidden',
            // Gold accent on top border for "command center" visual weight
            boxShadow:'inset 0 1px 0 rgba(245,188,0,.3)'}},
            // Header
            div({style:{display:'flex',alignItems:'center',gap:6,padding:'8px 12px',
              background:'linear-gradient(90deg,var(--surf2) 0%,rgba(245,188,0,.06) 100%)',
              borderBottom:'.5px solid var(--bdr)'}},
              span({style:{fontSize:'14px'}},'🧠'),
              div({style:{flex:1}},
                div({style:{fontSize:'11px',fontWeight:800,color:'var(--gold)',letterSpacing:'-.2px'}},'Intelligence Summary'),
                div({style:{fontSize:'8px',color:'var(--text3)',marginTop:1}},
                  'District morning brief · '+dateRange.label+' · '+(noData?'Load data files to populate':''+allLocs.length+' locations'))
              ),
              noData&&span({style:{fontSize:'9px',color:'var(--text3)',fontStyle:'italic'}},'No data loaded'),
              !noData&&it&&(it.declineSt+it.laborSt+it.mapeSt>0)&&
                div({style:{display:'flex',gap:4}},
                  it.declineSt>0&&span({style:{fontSize:'8px',padding:'2px 6px',borderRadius:3,fontWeight:700,background:'rgba(239,68,68,.12)',color:'#ef4444',border:'.5px solid rgba(239,68,68,.3)'}},it.declineSt+' declining'),
                  it.laborSt>0&&span({style:{fontSize:'8px',padding:'2px 6px',borderRadius:3,fontWeight:700,background:'rgba(245,158,11,.12)',color:'#f59e0b',border:'.5px solid rgba(245,158,11,.3)'}},it.laborSt+' labor ↑'),
                  it.mapeSt>0&&span({style:{fontSize:'8px',padding:'2px 6px',borderRadius:3,fontWeight:700,background:'rgba(139,92,246,.12)',color:'#a78bfa',border:'.5px solid rgba(139,92,246,.3)'}},it.mapeSt+' MAPE ↑')
                ),
              collBtn('intelligence')
            ),
            !collapsedSecs['intelligence']&&h(React.Fragment,null,
            // Signal rows
            div(null,...signals.map(s=>sigRow(s.icon,s.label,s.val,s.sub,s.col,s.dot,s.nav))),
            // Footer — clickable alert chips
            !noData&&it&&it.storeAlerts.length>0&&div({style:{padding:'6px 12px',borderTop:'.5px solid var(--bdr)',
              background:'var(--surf2)',display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}},
              span({style:{fontSize:'8px',color:'var(--text3)',marginRight:2}},'Needs attention:'),
              it.storeAlerts.slice(0,8).map(a=>
                div({key:a.loc,style:{fontSize:'8px',padding:'2px 7px',borderRadius:3,cursor:'pointer',
                  background:'rgba(239,68,68,.08)',border:'.5px solid rgba(239,68,68,.2)',
                  color:'var(--text2)',display:'flex',gap:4,alignItems:'center'},
                  onClick:()=>onOpenStore&&onOpenStore(a.loc),title:'Click to open '+a.loc},
                  span({style:{fontWeight:700,color:'var(--gold)'}},sNameC(a.loc).split(',')[0].trim()),
                  span({style:{color:'var(--text3)'}},'·'),
                  span(null,a.issues.join(', '))
                )
              ),
              it.storeAlerts.length>8&&span({style:{fontSize:'8px',color:'var(--text3)'}},'+'+( it.storeAlerts.length-8)+' more'),
              btn({style:{marginLeft:'auto',fontSize:'8px',padding:'2px 9px',borderRadius:4,
                background:'rgba(245,158,11,.1)',border:'.5px solid rgba(245,158,11,.25)',
                color:'var(--amber)',cursor:'pointer',flexShrink:0},
                onClick:()=>onOpenModal&&onOpenModal('priority-brief')},
                '🎯 Priority Brief →')
            )
            )
          );
        })(),

        // ── PROJECTIONS SECTION ──
        secs.find(s=>s.id==='projections'&&s.on)&&div({style:{background:'var(--surf)',border:'.5px solid var(--bdr)',borderRadius:8,overflow:'hidden'}},
          div({style:{display:'flex',alignItems:'center',gap:6,padding:'8px 12px',background:'var(--surf2)',borderBottom:'.5px solid var(--bdr)',cursor:'pointer'},
            onClick:onOpenProjections},
            span(null,'📈'),
            span({style:{fontSize:'11px',fontWeight:700,color:'var(--text)',flex:1}},'Projections & Forecasting'),
            span({style:{fontSize:'9px',color:'var(--amber)'}},'→'),
            collBtn('projections')
          ),
          !collapsedSecs['projections']&&h(React.Fragment,null,
          div({style:{padding:'10px 12px',display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}},
            div({style:{textAlign:'center'}},
              div({style:{fontSize:'18px',fontWeight:800,fontFamily:'var(--mono)',
                color:projSec.avgMape!=null?(projSec.avgMape<8?'#10b981':projSec.avgMape<12?'#f59e0b':'#f87171'):'var(--text3)'}},
                projSec.avgMape!=null?projSec.avgMape.toFixed(2)+'%':'—'),
              div({style:{fontSize:'8px',color:'var(--text3)',letterSpacing:'.5px',textTransform:'uppercase'}},'Avg MAPE (6W)'),
              MktBadge({ok:projSec.okMape,fl:projSec.flMape,fmt:v=>v.toFixed(2)+'%'})
            ),
            div({style:{textAlign:'center'}},
              div({style:{fontSize:'18px',fontWeight:800,fontFamily:'var(--mono)',
                color:projSec.locked===projSec.total?'#10b981':projSec.locked>projSec.total*.5?'#f59e0b':'#f87171'}},
                projSec.locked+'/'+projSec.total),
              div({style:{fontSize:'8px',color:'var(--text3)',letterSpacing:'.5px',textTransform:'uppercase'}},'Locks Complete')
            ),
            div({style:{textAlign:'center'},
              title:'Model Health: Each store scored 0-100 on 4 factors — Data Freshness (30pts), Calibration Quality (30pts), Recent Accuracy/MAPE (20pts), Sample Size (20pts). Green ≥75 | Yellow 50-74 | Red <50. Hover individual store models for breakdown.'},
              div({style:{display:'flex',justifyContent:'center',gap:4}},
                [['🟢',projSec.health.green,'≥75'],['🟡',projSec.health.yellow,'50-74'],['🔴',projSec.health.red,'<50']].map(([e,n,range])=>
                  span({key:e,style:{fontSize:'10px'},title:e+' = '+n+' stores scoring '+range},e+n)
                )
              ),
              div({style:{fontSize:'8px',color:'var(--text3)',letterSpacing:'.5px',textTransform:'uppercase',marginTop:2}},'Model Health ⓘ')
            )
          ),
          // ── Confidence Interval + Drift row ─────────────────
          ciAndDrift&&(()=>{
            const{ciLow,ciHigh,driftStores}=ciAndDrift;
            if(!ciLow&&!ciHigh) return null;
            return div({style:{padding:'6px 12px 8px',borderTop:'.5px solid var(--bdr)',
              display:'flex',gap:12,alignItems:'center',flexWrap:'wrap'}},
              div({style:{flex:1}},
                div({style:{fontSize:'8px',color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.5px',marginBottom:2}},'Next Week · 90% Confidence'),
                div({style:{fontSize:'11px',fontFamily:'var(--mono)',fontWeight:700,color:'var(--text)'}},
                  '$'+(ciLow/1000).toFixed(0)+'K',span({style:{color:'var(--text3)',fontWeight:400}},' – '),
                  '$'+(ciHigh/1000).toFixed(0)+'K')
              ),
              driftStores.length>0&&div({style:{display:'flex',gap:4,flexWrap:'wrap'}},
                driftStores.slice(0,4).map(({s,d})=>{
                  const col=d.status==='recalibrate'?'#f87171':'#f59e0b';
                  return span({key:s.loc,title:(STORE_NAMES[s.loc]||s.loc)+' — MAPE drift: '+d.mape2w.toFixed(2)+'% (2wk) vs '+d.mape6w.toFixed(2)+'% (6wk)',
                    style:{fontSize:'8px',padding:'1px 5px',borderRadius:3,background:col+'22',
                      color:col,border:'.5px solid '+col+'44',fontWeight:600,cursor:'default'}},
                    sNameC(s.loc).split(' ').pop()+' ⚠')})
              )
            );
          })(),
          // ── 6-week sparkline trend ──────────────────────────────
          weeklyTrend.some(w=>w.sales>0)&&div({style:{padding:'8px 12px 10px',borderTop:'.5px solid var(--bdr)'}},
            div({style:{fontSize:'8px',color:'var(--text3)',letterSpacing:'.5px',textTransform:'uppercase',marginBottom:4}},
              '6-Week District Sales Trend'),
            (()=>{
              const maxS=Math.max(...weeklyTrend.map(w=>w.sales).filter(x=>x>0))||1;
              const bw=34,gap=6,tot=weeklyTrend.length;
              const svgW=tot*(bw+gap)-gap, svgH=60;
              return h('svg',{viewBox:'0 0 '+(svgW+4)+' '+svgH,
                style:{width:'100%',height:76,overflow:'visible'}},
                weeklyTrend.map((wk,i)=>{
                  const barH=Math.max(3,Math.round((wk.sales/maxS)*44));
                  const x=i*(bw+gap)+2, y=48-barH;
                  const clr=wk.vsLY==null?'rgba(255,255,255,.25)':wk.vsLY>=0?'#10b981':wk.vsLY>-.05?'#f59e0b':'#f87171';
                  return h('g',{key:i},
                    h('rect',{x,y,width:bw,height:barH,rx:2,fill:clr,fillOpacity:.8}),
                    wk.sales>0&&h('text',{x:x+bw/2,y:y-2,textAnchor:'middle',fontSize:'9',fontWeight:'700',fill:'rgba(255,255,255,.85)'},
                      '$'+(wk.sales/1000).toFixed(0)+'K'),
                    h('text',{x:x+bw/2,y:54,textAnchor:'middle',fontSize:'6',fill:'rgba(255,255,255,.4)'},
                      wk.label||'—'),
                    wk.vsLY!=null&&h('text',{x:x+bw/2,y:58,textAnchor:'middle',fontSize:'8',fontWeight:'600',
                      fill:wk.vsLY>=0?'#10b981':'#f87171'},
                      (wk.vsLY>=0?'+':'')+((wk.vsLY*100).toFixed(2))+'%')
                  );
                })
              );
            })()
          )
          )
        ),

        // ── LOCK DEADLINE COUNTDOWN ──────────────────────────────────────
        (()=>{
          const t=new Date();
          // Weekly deadline: 10 days before next work-week start (next Wed)
          const nextWed=new Date(t);nextWed.setDate(t.getDate()+(3-t.getDay()+7)%7+7);
          const wkLeft=Math.ceil((nextWed-t)/864e5)-10;
          // Monthly deadline: 15th of next month
          const moDeadline=new Date(t.getFullYear(),t.getMonth()+1,15);
          const moLeft=Math.ceil((moDeadline-t)/864e5);
          // Yearly deadline: ~30 days before new year
          const yrDeadline=new Date(t.getFullYear(),11,1); // Dec 1
          const yrLeft=Math.ceil((yrDeadline-t)/864e5);
          const deadlines=[
            {l:'Weekly Lock',days:wkLeft,note:'lock by '+(new Date(nextWed.getTime()-10*864e5)).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})},
            {l:'Monthly Lock',days:moLeft,note:'lock by '+moDeadline.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})},
            yrLeft>0&&yrLeft<60&&{l:'Yearly Lock',days:yrLeft,note:'lock by '+yrDeadline.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})},
          ].filter(Boolean);
          const col=d=>d<=0?'#f87171':d<=3?'#f97316':d<=7?'#f59e0b':'#34d399';
          const label=d=>d<=0?'OVERDUE':d===1?'Tomorrow':d+'d';
          const urgent=deadlines.some(d=>d.days<=3);
          if(!urgent&&deadlines.every(d=>d.days>10)) return null; // hide when all comfortable
          return div({style:{
            background:urgent?'rgba(249,115,22,.06)':'rgba(52,211,153,.04)',
            border:'.5px solid '+(urgent?'rgba(249,115,22,.25)':'rgba(52,211,153,.18)'),
            borderRadius:'var(--r)',padding:'8px 12px',margin:'8px 0',
            display:'flex',gap:12,alignItems:'center',flexWrap:'wrap',cursor:'pointer'},
            onClick:()=>onOpenProjections&&onOpenProjections(),
            title:'Click to open Projection Workflow'},
            span({style:{fontSize:'11px'}},'🔒'),
            div({style:{fontSize:'8px',fontWeight:700,color:'var(--text2)',textTransform:'uppercase',letterSpacing:'.4px',flexShrink:0}},'Lock Deadlines'),
            ...deadlines.map((d,i)=>div({key:i,style:{display:'flex',gap:4,alignItems:'center'}},
              div({style:{fontSize:'8px',color:'var(--text3)'}},(d.l)+':'),
              div({style:{fontSize:'10px',fontWeight:800,fontFamily:'var(--mono)',color:col(d.days)}},(label(d.days))),
              div({style:{fontSize:'7px',color:'var(--text3)',fontStyle:'italic'}},'('+d.note+')')
            )),
            div({style:{marginLeft:'auto',fontSize:'8px',color:urgent?'#f97316':'#34d399',fontStyle:'italic'}},
              urgent?'⚠ Action needed':'→ Open Projections')
          );
        })(),

        // ── SALES SECTION ──
        secs.find(s=>s.id==='sales'&&s.on)&&div({style:{background:'var(--surf)',border:'.5px solid var(--bdr)',borderRadius:8,overflow:'hidden'}},
          div({style:{display:'flex',alignItems:'center',gap:6,padding:'8px 12px',background:'var(--surf2)',borderBottom:'.5px solid var(--bdr)',cursor:'pointer'},
            onClick:()=>onOpenModal&&onOpenModal('ranking')},
            span(null,'💰'),
            span({style:{fontSize:'11px',fontWeight:700,color:'var(--text)',flex:1}},'Sales & Guest Counts'),
            _spanTag(labInRange),
            span({style:{fontSize:'9px',color:'var(--amber)'}},'→'),
            salesSec&&salesSec.salesVsLY!=null&&span({style:{fontSize:'10px',fontFamily:'var(--mono)',
              color:(salesSec.salesVsLY*100)>=0?'#10b981':'#f87171'}},
              ((salesSec.salesVsLY*100)>=0?'+':'')+((salesSec.salesVsLY||0)*100).toFixed(2)+'% vs LY'),
            collBtn('sales')
          ),
          !collapsedSecs['sales']&&(salesSec?div({style:{padding:'10px 12px'}},
            // Top metrics
            div({style:{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:8}},
              div({style:{textAlign:'center'}},
                div({style:{fontSize:'16px',fontWeight:800,fontFamily:'var(--mono)',color:'var(--amber)'}},
                  sFmt(salesSec.totSales)),
                div({style:{fontSize:'8px',color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.5px'}},'Net Sales'),
                salesSec.salesVsLY!=null&&div({style:{fontSize:'9px',fontFamily:'var(--mono)',fontWeight:600,
                  color:salesSec.salesVsLY>=0?'#10b981':'#f87171',marginTop:2}},
                  (salesSec.salesVsLY>=0?'+':'')+(salesSec.salesVsLY*100).toFixed(2)+'% vs LY'),
                MktBadge({ok:salesSec.okSalesVsLY!=null?(salesSec.okSalesVsLY*100):null,
                          fl:salesSec.flSalesVsLY!=null?(salesSec.flSalesVsLY*100):null,
                          fmt:v=>(v>=0?'+':'')+v.toFixed(2)+'%'})
              ),
              div({style:{textAlign:'center'}},
                div({style:{fontSize:'16px',fontWeight:800,fontFamily:'var(--mono)',color:'var(--text)'}},
                  salesSec.totGC>0?Math.round(salesSec.totGC).toLocaleString():'—'),
                div({style:{fontSize:'8px',color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.5px'}},'Guest Count')
              ),
              div({style:{textAlign:'center'}},
                div({style:{fontSize:'16px',fontWeight:800,fontFamily:'var(--mono)',color:'var(--text)'}},
                  salesSec.avgChk>0?('$'+salesSec.avgChk.toFixed(2)):'—'),
                div({style:{fontSize:'8px',color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.5px'}},'Avg Check')
              )
            ),
            // Channel breakdown
            salesSec.channels.some(c=>c.sales>0)&&div({style:{borderTop:'.5px solid var(--bdr)',paddingTop:8}},
              div({style:{fontSize:'9px',fontWeight:600,color:'var(--text3)',marginBottom:4,letterSpacing:'.5px'}},'CHANNEL MIX'),
              div({style:{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:4}},
                salesSec.channels.filter(c=>c.sales>0).map(ch=>
                  div({key:ch.key,style:{textAlign:'center',padding:'4px 2px',borderRadius:4,background:'rgba(255,255,255,.04)'}},
                    div({style:{fontSize:'11px',fontWeight:700,fontFamily:'var(--mono)',color:'var(--text)'}},
                      ch.pct!=null?(ch.pct*100).toFixed(2)+'%':'—'),
                    div({style:{fontSize:'8px',color:'var(--text3)',lineHeight:1.2}},ch.label)
                  )
                )
              )
            )
          ):div({style:{padding:'12px',textAlign:'center',color:'var(--text3)',fontSize:'10px'}},coreStreamsLoading?'Loading…':'No sales data for this period'))
        ),

        // ── LABOR SECTION ──
        secs.find(s=>s.id==='labor'&&s.on)&&div({style:{background:'var(--surf)',border:'.5px solid var(--bdr)',borderRadius:8,overflow:'hidden'}},
          div({style:{display:'flex',alignItems:'center',gap:6,padding:'8px 12px',background:'var(--surf2)',borderBottom:'.5px solid var(--bdr)',cursor:'pointer'},
            onClick:()=>onOpenModal&&onOpenModal('ranking')},
            span(null,'👥'),
            span({style:{fontSize:'11px',fontWeight:700,color:'var(--text)',flex:1}},'Labor'),
            _spanTag(labInRange),
            span({style:{fontSize:'9px',color:'var(--amber)'}},'→'),
            collBtn('labor')
          ),
          !collapsedSecs['labor']&&(laborSec?div({style:{padding:'10px 12px'}},
            div({style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}},
              div({style:{textAlign:'center'}},
                div({style:{fontSize:'18px',fontWeight:800,fontFamily:'var(--mono)',
                  color:laborSec.laborPct!=null?(laborSec.laborPct<.28?'#10b981':laborSec.laborPct<.32?'#f59e0b':'#f87171'):'var(--text3)'}},
                  laborSec.laborPct!=null?((laborSec.laborPct||0)*100).toFixed(2)+'%':'—'),
                div({style:{fontSize:'8px',color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.5px'}},'Labor %'),
                MktBadge({ok:laborSec.okLaborAvg,fl:laborSec.flLaborAvg,fmt:v=>((v||0)*100).toFixed(2)+'%'})
              ),
              div({style:{textAlign:'center'}},
                div({style:{fontSize:'18px',fontWeight:800,fontFamily:'var(--mono)',color:'var(--text)'}},
                  laborSec.tpph!=null?laborSec.tpph.toFixed(1):'—'),
                div({style:{fontSize:'8px',color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.5px'}},'TPPH'),
                MktBadge({ok:laborSec.okTpphAvg,fl:laborSec.flTpphAvg,fmt:v=>(v||0).toFixed(1)})
              )
            ),
            div({style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}},
              div({style:{textAlign:'center',padding:'6px',borderRadius:5,
                background:laborSec.avn!=null?(laborSec.avn>=-2?'rgba(16,185,129,.08)':'rgba(248,113,113,.08)'):'rgba(255,255,255,.04)'}},
                div({style:{fontSize:'14px',fontWeight:700,fontFamily:'var(--mono)',
                  color:laborSec.avn!=null?(laborSec.avn>=-2?'#10b981':'#f87171'):'var(--text3)'}},
                  laborSec.avn!=null?(laborSec.avn>0?'+':'')+laborSec.avn.toFixed(1):'—'),
                div({style:{fontSize:'8px',color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.5px'}},'Avg Act vs Need')
              ),
              div({style:{textAlign:'center',padding:'6px',borderRadius:5,
                background:laborSec.otHrs>0?'rgba(248,113,113,.08)':'rgba(16,185,129,.08)'}},
                div({style:{fontSize:'14px',fontWeight:700,fontFamily:'var(--mono)',
                  color:laborSec.otHrs>0?'#f87171':'#10b981'}},
                  laborSec.otHrs.toFixed(1)+'h'),
                div({style:{fontSize:'8px',color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.5px'}},'OT Hours')
              )
            )
          ):div({style:{padding:'12px',textAlign:'center',color:'var(--text3)',fontSize:'10px'}},coreStreamsLoading?'Loading…':'No labor data for this period'))
        ),

        // ── SERVICE SECTION ──
        secs.find(s=>s.id==='service'&&s.on)&&div({style:{background:'var(--surf)',border:'.5px solid var(--bdr)',borderRadius:8,overflow:'hidden'}},
          div({style:{display:'flex',alignItems:'center',gap:6,padding:'8px 12px',background:'var(--surf2)',borderBottom:'.5px solid var(--bdr)',cursor:'pointer'},
            onClick:()=>onOpenModal&&onOpenModal('ranking')},
            span(null,'⚡'),
            span({style:{fontSize:'11px',fontWeight:700,color:'var(--text)',flex:1}},'Service'),
            _spanTag(svcEffective.rows),
            serviceSec?.isStale&&span({style:{fontSize:'8px',color:'var(--text3)',fontStyle:'italic'}},serviceSec.staleLabel),
            span({style:{fontSize:'9px',color:'var(--amber)'}},'→'),
            collBtn('service')
          ),
          !collapsedSecs['service']&&(serviceSec?div({style:{padding:'10px 12px'}},
            [
              {label:'OEPE W/O Parked',val:serviceSec.oepe,ok:serviceSec.okOepe,fl:serviceSec.flOepe,fmt:v=>Math.round(v)+'s',goodDir:'low',tgt:160},
              {label:'DT Parked %',val:serviceSec.park,ok:serviceSec.okPark,fl:serviceSec.flPark,fmt:v=>((v||0)*100).toFixed(2)+'%',goodDir:'low',tgt:.10},
              {label:'KVS Time Per GC',val:serviceSec.kvst,ok:serviceSec.okKvst,fl:serviceSec.flKvst,fmt:v=>Math.round(v)+'s',goodDir:'low',tgt:55},
              {label:'KVS Healthy Usage',val:serviceSec.kvsu,ok:serviceSec.okKvsu,fl:serviceSec.flKvsu,fmt:v=>((v||0)*100).toFixed(2)+'%',goodDir:'high',tgt:.90},
              {label:'R2P',val:serviceSec.r2p,ok:serviceSec.okR2p,fl:serviceSec.flR2p,fmt:v=>Math.round(v)+'s',goodDir:'low',tgt:90},
            ].map((row,i)=>{
              const clr=row.tgt!=null&&row.val!=null?(row.goodDir==='low'?row.val<=row.tgt:row.val>=row.tgt)?'#10b981':'#f87171':'var(--text)';
              return div({key:i,style:{display:'flex',alignItems:'center',gap:8,padding:'4px 0',
                borderBottom:i<4?'.5px solid rgba(255,255,255,.04)':'none'}},
                div({style:{fontSize:'9px',color:'var(--text3)',width:130,flexShrink:0}},row.label),
                div({style:{fontSize:'11px',fontFamily:'var(--mono)',fontWeight:600,color:clr,width:48}},
                  row.val!=null?row.fmt(row.val):'—'),
                div({style:{flex:1}},MktBadge({ok:row.ok,fl:row.fl,fmt:row.fmt}))
              );
            })
          ):div({style:{padding:'12px',textAlign:'center',color:'var(--text3)',fontSize:'10px'}},coreStreamsLoading?'Loading…':'No service data for this period'))
        ),

        // ── CONTROLS SECTION ──
        secs.find(s=>s.id==='controls'&&s.on)&&div({style:{background:'var(--surf)',border:'.5px solid var(--bdr)',borderRadius:8,overflow:'hidden'}},
          div({style:{display:'flex',alignItems:'center',gap:6,padding:'8px 12px',background:'var(--surf2)',borderBottom:'.5px solid var(--bdr)',cursor:'pointer'},
            onClick:()=>onNav&&onNav('district')},
            span(null,'🔒'),
            span({style:{fontSize:'11px',fontWeight:700,color:'var(--text)',flex:1}},'Controls & Integrity'),
            _spanTag(ctrlEffective.rows),
            ctrlSec?.isStale&&span({style:{fontSize:'8px',color:'var(--text3)',fontStyle:'italic'}},ctrlSec.staleLabel),
            span({style:{fontSize:'9px',color:'var(--amber)'}},'→'),
            collBtn('controls')
          ),
          !collapsedSecs['controls']&&(ctrlSec?div({style:{padding:'10px 12px'}},
            // ── Labor sub-section ─────────────────────────────────────
            laborSec&&div({style:{marginBottom:10,paddingBottom:8,borderBottom:'.5px solid var(--bdr)'}},
              div({style:{fontSize:'8px',fontWeight:700,color:'var(--text3)',letterSpacing:'.5px',
                textTransform:'uppercase',marginBottom:5}},'Labor Metrics'),
              div({style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:4}},
                [
                  {lbl:'Labor %',v:laborSec.laborPct,ok:laborSec.okLaborAvg,fl:laborSec.flLaborAvg,
                   fmt:v=>((v||0)*100).toFixed(2)+'%',clr:(laborSec.laborPct||0)<.22?'#10b981':(laborSec.laborPct||0)<.26?'#f59e0b':'#f87171'},
                  {lbl:'TPPH',v:laborSec.tpph,ok:laborSec.okTpphAvg,fl:laborSec.flTpphAvg,
                   fmt:v=>(v||0).toFixed(1),clr:(laborSec.tpph||0)>=5?'#10b981':(laborSec.tpph||0)>=4?'#f59e0b':'#f87171'},
                  {lbl:'Act vs Need',v:laborSec.avn,ok:null,fl:null,
                   fmt:v=>(v>=0?'+':'')+((v||0).toFixed(1)),
                   clr:(laborSec.avn||0)>=0?'rgba(255,255,255,.8)':'#f87171'},
                  {lbl:'OT Hours',v:laborSec.otHrs,ok:null,fl:null,
                   fmt:v=>(v||0).toFixed(1)+'h',
                   clr:(laborSec.otHrs||0)<20?'#10b981':(laborSec.otHrs||0)<50?'#f59e0b':'#f87171'},
                ].map((r,i)=>div({key:'lm'+i,style:{padding:'4px 5px',borderRadius:3,background:'rgba(255,255,255,.03)'}},
                  div({style:{display:'flex',justifyContent:'space-between',alignItems:'baseline'}},
                    span({style:{fontSize:'8px',color:'var(--text3)'}},r.lbl),
                    span({style:{fontSize:'10px',fontFamily:'var(--mono)',fontWeight:700,color:r.clr}},
                      r.v!=null?r.fmt(r.v):'--')),
                  (r.ok!=null||r.fl!=null)&&div({style:{marginTop:1}},MktBadge({ok:r.ok,fl:r.fl,fmt:r.fmt}))))
              )
            ),
            // ── Integrity metrics ──────────────────────────────────────
            div({style:{fontSize:'8px',fontWeight:700,color:'var(--text3)',letterSpacing:'.5px',
              textTransform:'uppercase',marginBottom:5}},'Integrity Metrics'),
            [
              {label:'T-Red After %',val:ctrlSec.tRedAPct,ok:ctrlSec.okTRedAPct,fl:ctrlSec.flTRedAPct,fmt:v=>((v||0)*100).toFixed(2)+'%',goodDir:'low'},
              {label:'T-Red After Count',val:ctrlSec.tRedACnt,ok:null,fl:null,fmt:v=>Math.round(v)+'',goodDir:'low'},
              {label:'T-Red Before %',val:ctrlSec.tRedBPct,ok:ctrlSec.okTRedBPct,fl:ctrlSec.flTRedBPct,fmt:v=>((v||0)*100).toFixed(2)+'%',goodDir:'low'},
              {label:'Promo/Disc %',val:ctrlSec.promoPct,ok:ctrlSec.okPromoPct,fl:ctrlSec.flPromoPct,fmt:v=>((v||0)*100).toFixed(2)+'%',goodDir:'low'},
              {label:'Cash O/S %',val:ctrlSec.cashOSPct,ok:ctrlSec.okCashOSPct,fl:ctrlSec.flCashOSPct,fmt:v=>((v||0)*100).toFixed(2)+'%',goodDir:'low'},
              {label:'Cash O/S $',val:ctrlSec.cashOSAmt,ok:null,fl:null,fmt:v=>(v<0?'(':'')+'$'+Math.abs(v).toFixed(2)+(v<0?')':''),goodDir:'low'},
              {label:'Cash Refunds',val:ctrlSec.cashRefCnt,ok:null,fl:null,fmt:v=>Math.round(v)+'',goodDir:'low'},
              {label:'POS Overrings',val:ctrlSec.overringCnt,ok:null,fl:null,fmt:v=>Math.round(v)+'',goodDir:'low'},
              {label:'OT Hours',val:ctrlSec.otHrs,ok:null,fl:null,fmt:v=>(v||0).toFixed(1)+'h',goodDir:'low'},
            ].map((row,i)=>
              div({key:i,style:{display:'flex',alignItems:'center',gap:8,padding:'3px 0',
                borderBottom:i<8?'.5px solid rgba(255,255,255,.04)':'none'}},
                div({style:{fontSize:'9px',color:'var(--text3)',width:130,flexShrink:0}},row.label),
                div({style:{fontSize:'10px',fontFamily:'var(--mono)',fontWeight:600,color:'var(--text)',width:64}},
                  row.val!=null?row.fmt(row.val):'—'),
                div({style:{flex:1}},MktBadge({ok:row.ok,fl:row.fl,fmt:row.fmt}))
              )
            )
          ):div({style:{padding:'12px',textAlign:'center',color:'var(--text3)',fontSize:'10px'}},'No controls data — upload Operations Report'))
        ),

        // ── FOB SECTION ──
        secs.find(s=>s.id==='fob'&&s.on)&&div({style:{background:'var(--surf)',border:'.5px solid var(--bdr)',borderRadius:8,overflow:'hidden'}},
          div({style:{display:'flex',alignItems:'center',gap:6,padding:'8px 12px',background:'var(--surf2)',borderBottom:'.5px solid var(--bdr)',cursor:'pointer'},
            onClick:()=>onOpenBrief&&onOpenBrief()},
            span(null,'🍟'),
            span({style:{fontSize:'11px',fontWeight:700,color:'var(--text)',flex:1}},'FOB & Food Cost'),
            _spanTag(fobAuto),
            span({style:{fontSize:'9px',color:'var(--amber)'}},'→'),
            collBtn('fob')
          ),
          !collapsedSecs['fob']&&(fobSec?div({style:{padding:'10px 12px'}},
            // Big FOB%, Food Cost%, Base Food%
            div({style:{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:6,marginBottom:8}},
              div({style:{textAlign:'center',padding:'8px',borderRadius:5,
                background:fobSec.fobPct!=null?(fobSec.fobPct<.035?'rgba(16,185,129,.08)':fobSec.fobPct<.055?'rgba(245,158,11,.08)':'rgba(248,113,113,.08)'):'rgba(255,255,255,.04)'}},
                div({style:{fontSize:'16px',fontWeight:800,fontFamily:'var(--mono)',
                  color:fobSec.fobPct!=null?(fobSec.fobPct<.035?'#10b981':fobSec.fobPct<.055?'#f59e0b':'#f87171'):'var(--text3)'}},
                  fobSec.fobPct!=null?((fobSec.fobPct||0)*100).toFixed(2)+'%':'—'),
                div({style:{fontSize:'8px',color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.5px'}},'FOB %'+(fobSec.primaryIsMTD?' · MTD':'')),
                (fobSec.tgts&&fobSec.tgts.fobPct!=null&&fobSec.fobPct!=null)&&(()=>{const dp=(fobSec.fobPct-fobSec.tgts.fobPct)*100;return div({style:{fontSize:'8px',fontWeight:700,fontFamily:'var(--mono)',marginTop:1,color:dp>0.001?'#f87171':'#10b981'},title:'vs sales-weighted FOB target'},`${dp>=0?'+':''}${dp.toFixed(2)} vs tgt ${(fobSec.tgts.fobPct*100).toFixed(2)}%`);})(),
                fobSec.priorFobPct!=null&&div({style:{fontSize:'8px',color:'var(--text3)',fontFamily:'var(--mono)',marginTop:1},title:'Last completed month (final)'},((fobSec.priorFobPct||0)*100).toFixed(2)+'% '+(fobSec.priorMonth||'')),
                MktBadge({ok:fobSec.okFobPct,fl:fobSec.flFobPct,fmt:v=>((v||0)*100).toFixed(2)+'%'})
              ),
              div({style:{textAlign:'center',padding:'8px',borderRadius:5,background:'rgba(255,255,255,.04)'}},
                div({style:{fontSize:'16px',fontWeight:800,fontFamily:'var(--mono)',color:'var(--text)'}},
                  fobSec.pLFoodPct!=null?((fobSec.pLFoodPct||0)*100).toFixed(2)+'%':'—'),
                div({style:{fontSize:'8px',color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.5px'}},'P&L Food Cost %'+(fobSec.primaryIsMTD?' · MTD':'')),
                fobSec.priorPLFoodPct!=null&&div({style:{fontSize:'8px',color:'var(--text3)',fontFamily:'var(--mono)',marginTop:1},title:'Last completed month (final)'},((fobSec.priorPLFoodPct||0)*100).toFixed(2)+'% '+(fobSec.priorMonth||'')),
                MktBadge({ok:fobSec.okPLFoodPct,fl:fobSec.flPLFoodPct,fmt:v=>((v||0)*100).toFixed(2)+'%'})
              ),
              div({style:{textAlign:'center',padding:'8px',borderRadius:5,background:'rgba(255,255,255,.04)'}},
                div({style:{fontSize:'16px',fontWeight:800,fontFamily:'var(--mono)',color:'var(--text)'}},
                  fobSec.baseFoodPct!=null?((fobSec.baseFoodPct||0)*100).toFixed(2)+'%':'—'),
                div({style:{fontSize:'8px',color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.5px'}},'Base Food %'+(fobSec.primaryIsMTD?' · MTD':'')),
                fobSec.priorBaseFoodPct!=null&&div({style:{fontSize:'8px',color:'var(--text3)',fontFamily:'var(--mono)',marginTop:1},title:'Last completed month (final)'},((fobSec.priorBaseFoodPct||0)*100).toFixed(2)+'% '+(fobSec.priorMonth||'')),
                MktBadge({ok:fobSec.okBaseFoodPct,fl:fobSec.flBaseFoodPct,fmt:v=>((v||0)*100).toFixed(2)+'%'})
              )
            ),
            // Waste components
            div({style:{borderTop:'.5px solid var(--bdr)',paddingTop:8}},
              div({style:{fontSize:'9px',fontWeight:600,color:'var(--text3)',marginBottom:4,letterSpacing:'.5px'}},
                'FOB COMPONENTS'+(fobSec.primaryIsMTD?' · '+(fobSec.curMonth||'MTD')+' MTD vs '+(fobSec.priorMonth||'prior'):'')),
              div({style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:3}},
                [
                  {l:'Unexplained',v:fobSec.unexplained,ok:fobSec.okUnexp,fl:fobSec.flUnexp,prior:fobSec.priorUnexplained,tgt:fobSec.tgts&&fobSec.tgts.unexplained,alert:(fobSec.unexplained||0)>.003},
                  {l:'Comp Waste',v:fobSec.compWaste,ok:fobSec.okCompWaste,fl:fobSec.flCompWaste,prior:fobSec.priorCompWaste,tgt:fobSec.tgts&&fobSec.tgts.compWaste},
                  {l:'Raw Waste',v:fobSec.rawWaste,ok:fobSec.okRawWaste,fl:fobSec.flRawWaste,prior:fobSec.priorRawWaste,tgt:fobSec.tgts&&fobSec.tgts.rawWaste},
                  {l:'Condiment',v:fobSec.condiment,ok:fobSec.okCondiment,fl:fobSec.flCondiment,prior:fobSec.priorCondiment,tgt:fobSec.tgts&&fobSec.tgts.condiment},
                  {l:'Emp Meal',v:fobSec.empMeal,ok:fobSec.okEmpMeal,fl:fobSec.flEmpMeal,prior:fobSec.priorEmpMeal,tgt:fobSec.tgts&&fobSec.tgts.empMeal},
                  {l:'Stat Var',v:fobSec.statVar,ok:fobSec.okStatVar,fl:fobSec.flStatVar,prior:fobSec.priorStatVar,tgt:fobSec.tgts&&fobSec.tgts.statVar},
                ].map((item,i)=>
                  div({key:i,style:{display:'flex',flexDirection:'column',
                    padding:'2px 5px',borderRadius:3,
                    background:item.alert?'rgba(248,113,113,.08)':'rgba(255,255,255,.02)'}},
                    div({style:{display:'flex',justifyContent:'space-between',alignItems:'center'}},
                      span({style:{fontSize:'8px',color:'var(--text3)'}},item.l),
                      span({style:{fontSize:'9px',fontFamily:'var(--mono)',fontWeight:600,
                        color:item.alert?'#f87171':'var(--text)'}},
                        item.v!=null?((item.v||0)*100).toFixed(2)+'%':'—')
                    ),
                    (item.tgt!=null&&item.v!=null)&&(()=>{const dp=(item.v-item.tgt)*100;return div({style:{fontSize:'7px',fontFamily:'var(--mono)',fontWeight:700,textAlign:'right',color:dp>0.001?'#f87171':'#10b981'},title:'vs sales-weighted target'},`${dp>=0?'+':''}${dp.toFixed(2)} (tgt ${(item.tgt*100).toFixed(2)}%)`);})(),
                    fobSec.primaryIsMTD&&item.prior!=null&&div({style:{fontSize:'7px',color:'var(--text3)',fontFamily:'var(--mono)',textAlign:'right'},title:'Last completed month (final)'},
                      ((item.prior||0)*100).toFixed(2)+'% '+(fobSec.priorMonth||'')),
                    (item.ok!=null||item.fl!=null)&&div({style:{marginTop:1}},
                      MktBadge({ok:item.ok,fl:item.fl,fmt:v=>((v||0)*100).toFixed(2)+'%'}))
                  )
                )
              ),
              // Disc/Coupon — tracked but not included in FOB calculation
              div({style:{marginTop:4,paddingTop:4,borderTop:'.5px dashed rgba(255,255,255,.1)'}},
                div({style:{display:'flex',flexDirection:'column',
                  padding:'2px 5px',borderRadius:3,background:'rgba(255,255,255,.02)'}},
                  div({style:{display:'flex',justifyContent:'space-between',alignItems:'center'}},
                    span({style:{fontSize:'8px',color:'var(--text)',fontWeight:600}},
                      'Disc/Coupon ',
                      span({style:{fontSize:'7px',color:'var(--amber)',fontWeight:600},
                        title:'Disc/Coupon is tracked for awareness but is NOT included in the FOB calculation.'},'*')),
                    span({style:{fontSize:'9px',fontFamily:'var(--mono)',fontWeight:600,color:'rgba(255,255,255,.5)'}},
                      fobSec.discCoupon!=null?((fobSec.discCoupon||0)*100).toFixed(2)+'%':'—')
                  ),
                  (fobSec.okDiscCoupon!=null||fobSec.flDiscCoupon!=null)&&div({style:{marginTop:1}},
                    MktBadge({ok:fobSec.okDiscCoupon,fl:fobSec.flDiscCoupon,fmt:v=>((v||0)*100).toFixed(2)+'%'})),
                  div({style:{fontSize:'7px',color:'rgba(255,255,255,.3)',marginTop:2}},
                    '* Not included in FOB calculation — monitored for trend only')
                )
              )
            )
          ):div({style:{padding:'12px',textAlign:'center',color:'var(--text3)',fontSize:'10px'}},'No FOB data — upload Operations Report with FOB sheet'))
        ),

        // ── DIGITAL SALES SECTION ──────────────────────────────────
        secs.find(s=>s.id==='digital'&&s.on)&&div({style:{background:'var(--surf)',border:'.5px solid var(--bdr)',borderRadius:8,overflow:'hidden'}},
          div({style:{display:'flex',alignItems:'center',gap:6,padding:'8px 12px',background:'var(--surf2)',borderBottom:'.5px solid var(--bdr)',cursor:'pointer'},
            onClick:()=>onOpenModal&&onOpenModal('ranking')},
            span(null,'\uD83D\uDCF1'),
            span({style:{fontSize:'11px',fontWeight:700,color:'var(--text)',flex:1}},'Digital Sales'),
            _spanTag(channelRows.rows),
            digitalSec&&span({style:{fontSize:'9px',color:'#60a5fa',fontWeight:600}},
              'McDelivery + MOP + Kiosk'),
            span({style:{fontSize:'9px',color:'var(--amber)'}},' \u2192'),
            collBtn('digital')
          ),
          !collapsedSecs['digital']&&(digitalSec?div({style:{padding:'10px 12px'}},
            // ── Hero metric: Digital Mix ──────────────────────────────
            div({style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:10}},
              div({style:{textAlign:'center',padding:'8px',borderRadius:6,
                background:'rgba(96,165,250,.1)',border:'.5px solid rgba(96,165,250,.2)'}},
                div({style:{fontSize:'22px',fontWeight:900,fontFamily:'var(--mono)',color:'#60a5fa'}},
                  digitalSec.digitalPct!=null?((digitalSec.digitalPct||0)*100).toFixed(2)+'%':'--'),
                div({style:{fontSize:'8px',color:'rgba(96,165,250,.7)',letterSpacing:'.5px',
                  textTransform:'uppercase',marginTop:2}},'Digital Mix'),
                MktBadge({ok:digitalSec.okDigPct,fl:digitalSec.flDigPct,fmt:v=>((v||0)*100).toFixed(2)+'%'})
              ),
              div({style:{textAlign:'center',padding:'8px',borderRadius:6,background:'rgba(255,255,255,.04)'}},
                div({style:{fontSize:'18px',fontWeight:800,fontFamily:'var(--mono)',color:'var(--text)'}},
                  digitalSec.digitalSales>0?f$(Math.round(digitalSec.digitalSales)):'--'),
                div({style:{fontSize:'8px',color:'var(--text3)',letterSpacing:'.5px',
                  textTransform:'uppercase',marginTop:2}},'Digital Revenue'),
                div({style:{fontSize:'8px',color:'var(--text3)',marginTop:2}},
                  'of '+f$(Math.round(digitalSec.totSales))+' total'),
                div({style:{fontSize:'8px',color:'rgba(96,165,250,.6)',marginTop:2}},
                  digitalSec.digStoreCount+'/'+digitalSec.storeCount+' stores reporting digital')
              )
            ),
            // ── Digital Mix Bar ───────────────────────────────────────
            div({style:{marginBottom:10}},
              div({style:{display:'flex',justifyContent:'space-between',fontSize:'8px',
                color:'var(--text3)',marginBottom:3}},
                span(null,'Digital'),span(null,'Traditional')),
              div({style:{background:'rgba(255,255,255,.06)',borderRadius:4,height:12,overflow:'hidden',
                display:'flex'}},
                div({style:{width:((digitalSec.digitalPct||0)*100).toFixed(1)+'%',
                  background:'linear-gradient(90deg,#60a5fa,#818cf8)',height:'100%',
                  borderRadius:'4px 0 0 4px',transition:'width .8s ease',
                  display:'flex',alignItems:'center',justifyContent:'center',
                  fontSize:'7px',color:'#fff',fontWeight:700,overflow:'hidden'}},
                  ((digitalSec.digitalPct||0)*100)>8?((digitalSec.digitalPct||0)*100).toFixed(2)+'%':''),
                div({style:{flex:1,display:'flex',alignItems:'center',justifyContent:'center',
                  fontSize:'7px',color:'rgba(255,255,255,.4)'}},
                  (((1-(digitalSec.digitalPct||0))*100).toFixed(2))+'%')
              )
            ),
            // ── Channel breakdown ─────────────────────────────────────
            div({style:{fontSize:'8px',fontWeight:700,color:'var(--text3)',letterSpacing:'.5px',
              textTransform:'uppercase',marginBottom:5}},'Digital Channels'),
            div({style:{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:5,marginBottom:8}},
              [
                {icon:'\uD83D\uDE9A',label:'McDelivery',pct:digitalSec.delivPct,ok:digitalSec.okDelivPct,fl:digitalSec.flDelivPct,clr:'#f59e0b'},
                {icon:'\uD83D\uDCF2',label:'MOP',pct:digitalSec.mopPct,ok:digitalSec.okMopPct,fl:digitalSec.flMopPct,clr:'#34d399'},
                {icon:'\u2328\uFE0F',label:'Kiosk',pct:digitalSec.kioskPct,ok:digitalSec.okKioskPct,fl:digitalSec.flKioskPct,clr:'#a78bfa'},
              ].map((ch,i)=>div({key:'ch'+i,style:{padding:'6px',borderRadius:5,textAlign:'center',
                background:'rgba(255,255,255,.03)',border:'.5px solid rgba(255,255,255,.07)'}},
                div({style:{fontSize:'10px',marginBottom:2}},ch.icon),
                div({style:{fontSize:'12px',fontWeight:800,fontFamily:'var(--mono)',color:ch.clr}},
                  ch.pct!=null?((ch.pct||0)*100).toFixed(2)+'%':'--'),
                div({style:{fontSize:'7px',color:'var(--text3)',marginBottom:3}},ch.label),
                MktBadge({ok:ch.ok,fl:ch.fl,fmt:v=>((v||0)*100).toFixed(2)+'%'})
              ))
            ),
            // ── Strategy note ──────────────────────────────────────────
            div({style:{padding:'5px 8px',borderRadius:4,background:'rgba(96,165,250,.05)',
              border:'.5px solid rgba(96,165,250,.15)'}},
              div({style:{fontSize:'8px',color:'rgba(96,165,250,.7)',lineHeight:1.5}},
                '\uD83D\uDCA1 McDonald\'s digital strategy targets 40%+ digital mix system-wide. '+
                'MOP & Kiosk drive higher avg check. McDelivery expands trade area beyond 3-mile radius.')
            )
          ):div({style:{padding:'12px',textAlign:'center',color:'var(--text3)',fontSize:'10px'}},
            'No channel data — upload Operations Report with Sales sheet'))
        ),

        // ── DISTRICT PULSE RADAR ──
        secs.find(s=>s.id==='radar'&&s.on)&&(()=>{
          // Scores: 0-1 where 1.0 = at or better than target, 0 = significantly below
          const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v||0));
          const METRICS=[
            {label:'Sales vs LY',short:'Sales',icon:'💰',angle:270,
              score:salesSec?.salesVsLY!=null?clamp(0.5+(salesSec.salesVsLY*10),0,1):0.5,
              display:salesSec?.salesVsLY!=null?((salesSec.salesVsLY*100)>=0?'+':'')+((salesSec.salesVsLY||0)*100).toFixed(2)+'%':'—',
              hint:'Target: flat or better vs last year'},
            {label:'Service',short:'OEPE',icon:'⚡',angle:342,
              score:serviceSec?.oepe?clamp(150/serviceSec.oepe,0,1):0.5,
              display:serviceSec?.oepe?Math.round(serviceSec.oepe)+'s':'—',
              hint:'Target: ≤150s OEPE'},
            {label:'Labor',short:'Labor%',icon:'👥',angle:54,
              score:laborSec?.laborPct?clamp(0.22/Math.max(0.01,laborSec.laborPct),0,1):0.5,
              display:laborSec?.laborPct?((laborSec.laborPct||0)*100).toFixed(2)+'%':'—',
              hint:'Target: ≤22% labor'},
            {label:'T-Reds',short:'T-Red',icon:'🔒',angle:126,
              score:ctrlSec?.tRedAPct?clamp(0.003/Math.max(0.001,ctrlSec.tRedAPct),0,1):0.5,
              display:ctrlSec?.tRedAPct?((ctrlSec.tRedAPct||0)*100).toFixed(2)+'%':'—',
              hint:'Target: ≤0.30% T-Red After'},
            {label:'FOB',short:'FOB%',icon:'🍟',angle:198,
              score:fobSec?.fobPct?clamp(0.04/Math.max(0.005,fobSec.fobPct),0,1):0.5,
              display:fobSec?.fobPct?((fobSec.fobPct||0)*100).toFixed(2)+'%':'—',
              hint:'Target: ≤4.0% FOB'},
          ];
          const overallScore=Math.round(METRICS.reduce((a,m)=>a+m.score,0)/METRICS.length*100);
          const scoreClr=overallScore>=75?'#10b981':overallScore>=50?'#f59e0b':'#f87171';
          const scoreBg=overallScore>=75?'rgba(16,185,129,.12)':overallScore>=50?'rgba(245,158,11,.12)':'rgba(248,113,113,.12)';
          const cx=100,cy=100,maxR=68;
          const RAD=d=>d*Math.PI/180;
          const pt=(a,r)=>[cx+r*Math.cos(RAD(a)),cy+r*Math.sin(RAD(a))];
          const gPoly=r=>METRICS.map(m=>pt(m.angle,r)).map(([x,y])=>x.toFixed(1)+','+y.toFixed(1)).join(' ');
          const dataPoly=METRICS.map(m=>pt(m.angle,maxR*m.score)).map(([x,y])=>x.toFixed(1)+','+y.toFixed(1)).join(' ');
          return div({style:{background:'var(--surf)',border:'.5px solid var(--bdr)',borderRadius:8,overflow:'hidden'}},
            div({style:{display:'flex',alignItems:'center',gap:6,padding:'8px 12px',background:'var(--surf2)',borderBottom:'.5px solid var(--bdr)'}},
              span(null,'🎯'),
              span({style:{fontSize:'11px',fontWeight:700,color:'var(--text)',flex:1}},'District Pulse'),
              // The radar composites five metrics off FOUR different sources (sales/labor =
              // labInRange, OEPE = svcEffective, T-Reds = ctrlEffective, FOB = fobAuto), which
              // can span different windows. Tag their union — the honest outer span of
              // everything feeding the shape — rather than picking one and implying the rest
              // match it.
              _spanTag([...labInRange,...(svcEffective.rows||[]),...(ctrlEffective.rows||[]),...(fobAuto||[])]),
              span({style:{fontSize:'9px',color:'var(--text3)',marginRight:4}},'Performance vs Targets'),
              collBtn('radar')
            ),
            !collapsedSecs['radar']&&div({style:{padding:'12px',display:'flex',gap:12,alignItems:'center',flexWrap:'wrap'}},
              // SVG Radar
              div({style:{flex:'0 0 auto',position:'relative'}},
                h('svg',{viewBox:'0 0 200 200',style:{width:180,height:180}},
                  // Background pentagons
                  ...[1,.67,.33].map((pct,gi)=>
                    h('polygon',{key:'g'+gi,points:gPoly(maxR*pct),
                      fill:'none',stroke:'rgba(255,255,255,.08)',strokeWidth:.5})
                  ),
                  // Axis spokes
                  ...METRICS.map((m,i)=>{
                    const [ax,ay]=pt(m.angle,maxR);
                    return h('line',{key:'sp'+i,x1:100,y1:100,x2:ax.toFixed(1),y2:ay.toFixed(1),
                      stroke:'rgba(255,255,255,.12)',strokeWidth:.5});
                  }),
                  // Data fill polygon
                  h('polygon',{points:dataPoly,
                    fill:scoreClr+'33',stroke:scoreClr,strokeWidth:1.5,strokeLinejoin:'round'}),
                  // Target ring (outer pentagon)
                  h('polygon',{points:gPoly(maxR),fill:'none',stroke:scoreClr,strokeWidth:.5,strokeDasharray:'2,2',opacity:.4}),
                  // Vertex dots on data polygon
                  ...METRICS.map((m,i)=>{
                    const [dx,dy]=pt(m.angle,maxR*m.score);
                    return h('circle',{key:'dot'+i,cx:dx.toFixed(1),cy:dy.toFixed(1),r:3,
                      fill:scoreClr,stroke:'var(--surf)',strokeWidth:1});
                  }),
                  // Axis labels
                  ...METRICS.map((m,i)=>{
                    const [lx,ly]=pt(m.angle,maxR*1.32);
                    const ta=lx<cx-4?'end':lx>cx+4?'start':'middle';
                    return h('g',{key:'lab'+i},
                      h('text',{x:lx.toFixed(1),y:(ly-3).toFixed(1),textAnchor:ta,fontSize:6.5,
                        fill:'rgba(255,255,255,.6)',fontWeight:'600'},m.short),
                      h('text',{x:lx.toFixed(1),y:(ly+5).toFixed(1),textAnchor:ta,fontSize:5.5,
                        fill:scoreClr,fontFamily:'monospace'},m.display)
                    );
                  }),
                  // Center score
                  h('circle',{cx:100,cy:100,r:16,fill:scoreBg,stroke:scoreClr,strokeWidth:.5}),
                  h('text',{x:100,y:98,textAnchor:'middle',dominantBaseline:'middle',
                    fontSize:13,fontWeight:700,fill:scoreClr,fontFamily:'monospace'},overallScore),
                  h('text',{x:100,y:111,textAnchor:'middle',fontSize:4.5,fill:'rgba(255,255,255,.35)'},'SCORE')
                )
              ),
              // Metric legend
              div({style:{flex:1,minWidth:0}},
                div({style:{fontSize:'9px',color:'var(--text3)',fontWeight:700,letterSpacing:'.5px',
                  textTransform:'uppercase',marginBottom:6}},'Metric Breakdown'),
                ...METRICS.map((m,i)=>{
                  const pct=Math.round(m.score*100);
                  const barClr=pct>=75?'#10b981':pct>=50?'#f59e0b':'#f87171';
                  return div({key:'leg'+i,style:{marginBottom:5}},
                    div({style:{display:'flex',justifyContent:'space-between',marginBottom:2}},
                      span({style:{fontSize:'8px',color:'var(--text)',fontWeight:500}},m.icon+' '+m.label),
                      span({style:{fontSize:'8px',fontFamily:'monospace',color:barClr,fontWeight:700}},m.display)
                    ),
                    div({style:{background:'rgba(255,255,255,.06)',borderRadius:2,height:4,overflow:'hidden'}},
                      div({style:{width:pct+'%',height:'100%',background:barClr,
                        borderRadius:2,transition:'width .6s ease'}})
                    ),
                    div({style:{fontSize:'6px',color:'rgba(255,255,255,.25)',marginTop:1}},m.hint)
                  );
                }),
                div({style:{marginTop:8,paddingTop:6,borderTop:'.5px solid var(--bdr)',
                  display:'flex',justifyContent:'space-between',alignItems:'center'}},
                  div({style:{fontSize:'8px',color:'var(--text3)'}},'Overall District Health'),
                  div({style:{fontSize:'13px',fontWeight:800,fontFamily:'monospace',color:scoreClr}},overallScore+'/100')
                )
              )
            )
          );
        })(),
        // ── STORE LEADERBOARD ──
        secs.find(s=>s.id==='leaderboard'&&s.on)&&div({style:{background:'var(--surf)',border:'.5px solid var(--bdr)',borderRadius:8,overflow:'hidden'}},
          div({style:{display:'flex',alignItems:'center',gap:6,padding:'8px 12px',background:'var(--surf2)',borderBottom:'.5px solid var(--bdr)',cursor:'pointer'},
            onClick:()=>onOpenModal&&onOpenModal('ranking')},
            span(null,'🏆'),
            span({style:{fontSize:'11px',fontWeight:700,color:'var(--text)',flex:1}},'Store Leaderboard'),
            // Metric-aware: each leaderboard tab reads a different source (Sales = labInRange,
            // OEPE = svcEffective, Labor%/T-Reds = ctrlEffective), and those sources can span
            // different windows. Tag the one the SELECTED tab actually uses.
            _spanTag(lbMetric==='oepe'?svcEffective.rows
                    :(lbMetric==='labor'||lbMetric==='tred')?ctrlEffective.rows
                    :labInRange),
            span({style:{fontSize:'9px',color:'var(--amber)'}},'→'),
            collBtn('leaderboard')
          ),
          !collapsedSecs['leaderboard']&&div({style:{padding:'8px 12px'}},
            // Metric tabs
            div({style:{display:'flex',gap:3,marginBottom:8,flexWrap:'wrap'}},
              [['sales','💰 Sales'],['oepe','⚡ OEPE'],['labor','👥 Labor%'],['tred','🔒 T-Reds']].map(([k,l])=>
                btn({key:k,style:{fontSize:'9px',padding:'3px 8px',borderRadius:4,cursor:'pointer',fontWeight:600,
                  background:lbMetric===k?'var(--amber)':'rgba(255,255,255,.07)',
                  color:lbMetric===k?'var(--navy)':'var(--text3)',border:'none'},
                  onClick:()=>setLbMetric(k)},l)
              )
            ),
            lbData.data.length===0?div({style:{textAlign:'center',color:'var(--text3)',fontSize:'10px',padding:'16px 0'}},'No data for this period'):
            (()=>{
              const {data,avg,fmt,label,higherBetter}=lbData;
              const top3=data.slice(0,3),bot3=data.slice(-3).reverse();
              const maxV=Math.max(...data.map(s=>s.value));
              const StoreRow=({s,rank,isTop})=>{
                const medal=['🥇','🥈','🥉'];
                const vsAvg=avg&&avg>0?((s.value-avg)/avg*100):null;
                const barPct=maxV>0?Math.min(100,s.value/maxV*100):0;
                const clr=isTop?(rank===0?'#f59e0b':rank===1?'rgba(255,255,255,.6)':'rgba(180,120,60,.9)'):'#f87171';
                return div({style:{marginBottom:5,padding:'4px 6px',borderRadius:5,
                  background:isTop?'rgba(16,185,129,.06)':'rgba(248,113,113,.06)',
                  border:'.5px solid '+(isTop?'rgba(16,185,129,.15)':'rgba(248,113,113,.15)')}},
                  div({style:{display:'flex',alignItems:'center',gap:5,marginBottom:3}},
                    span({style:{fontSize:rank<3?'13px':'9px',flexShrink:0}},rank<3?medal[rank]:(isTop?'↑':'↓')),
                    span({style:{fontSize:'9px',color:'var(--text)',fontWeight:600,flex:1,
                      overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:120}},
                      s.name),
                    span({style:{marginLeft:'auto',fontSize:'7px',
                      background:s.org==='FL'?'rgba(52,211,153,.15)':'rgba(96,165,250,.15)',
                      color:s.org==='FL'?'#34d399':'#60a5fa',
                      padding:'1px 4px',borderRadius:2,fontWeight:700,flexShrink:0}},s.org),
                    span({style:{fontSize:'10px',fontFamily:'monospace',fontWeight:700,
                      color:isTop?'#10b981':'#f87171',marginLeft:4,flexShrink:0}},fmt(s.value))
                  ),
                  div({style:{display:'flex',gap:4,alignItems:'center'}},
                    div({style:{flex:1,background:'rgba(255,255,255,.06)',borderRadius:2,height:3}},
                      div({style:{width:barPct.toFixed(0)+'%',height:'100%',
                        background:isTop?'rgba(16,185,129,.6)':'rgba(248,113,113,.5)',borderRadius:2}})
                    ),
                    vsAvg!=null&&span({style:{fontSize:'7px',fontFamily:'monospace',flexShrink:0,
                      color:((higherBetter&&vsAvg>=0)||(!higherBetter&&vsAvg<=0))?'rgba(16,185,129,.7)':'rgba(248,113,113,.7)'}},
                      (vsAvg>=0?'+':'')+vsAvg.toFixed(2)+'% vs avg')
                  )
                );
              };
              return div(null,
                div({style:{fontSize:'8px',color:'#10b981',fontWeight:700,letterSpacing:'.5px',
                  textTransform:'uppercase',marginBottom:4}},'▲ Top 3 — '+label),
                ...top3.map((s,i)=>h(StoreRow,{key:'t'+s.loc,s,rank:i,isTop:true})),
                avg!=null&&div({style:{textAlign:'center',fontSize:'8px',color:'var(--text3)',
                  padding:'4px 0',borderTop:'.5px dashed rgba(255,255,255,.1)',
                  borderBottom:'.5px dashed rgba(255,255,255,.1)',margin:'4px 0'}},
                  'District Avg: '+fmt(avg)+' ('+data.length+' stores)'),
                div({style:{fontSize:'8px',color:'#f87171',fontWeight:700,letterSpacing:'.5px',
                  textTransform:'uppercase',margin:'4px 0'}},'▼ Bottom 3 — '+label),
                ...bot3.map((s,i)=>h(StoreRow,{key:'b'+s.loc,s,rank:i,isTop:false}))
              );
            })()
          )
        ),
      ), // end grid

      // ── DISTRICT PROJECTIONS MINI TABLE ────────────────────────
      !noData&&weekProjections&&(()=>{
        // weekProjections useMemo computed the projections above — no forecastDay calls here
        const {storeProjs,weekDays,wsKey}=weekProjections;
        const lp=lockedProjections||{};
        const DOWabbr=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
        const distTotal=storeProjs.reduce((a,s)=>a+s.wkTotal,0);
        const distLY=storeProjs.reduce((a,s)=>a+s.lyTotal,0);
        const distVsLY=distLY>0?((distTotal-distLY)/distLY*100).toFixed(2):null;
        return div({style:{marginTop:16,borderTop:'.5px solid var(--bdr)',paddingTop:12}},
          // Header row
          div({style:{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}},
            div(null,
              div({style:{fontSize:'12px',fontWeight:700,color:'var(--text)'}},'📊 This Week — District Projection'),
              div({style:{fontSize:'9px',color:'var(--text3)',marginTop:2}},
                'Week of '+weekDays[0].toLocaleDateString('en-US',{month:'short',day:'numeric'})+
                ' – '+weekDays[6].toLocaleDateString('en-US',{month:'short',day:'numeric'})+
                '  ·  District Total: '+f$(Math.round(distTotal))+
                (distVsLY!=null?'  ·  vs LY: '+(+distVsLY>=0?'+':'')+distVsLY+'%':''))
            ),
            btn({style:{fontSize:'10px',padding:'4px 12px',borderRadius:5,cursor:'pointer',
              background:'rgba(245,158,11,.15)',color:'var(--amber)',
              fontWeight:600,border:'.5px solid rgba(245,158,11,.3)'},
              onClick:onOpenProjections},'Full Projections →')
          ),
          // Store list
          div({style:{overflowX:'auto'}},
            h('table',{style:{width:'max-content',minWidth:'100%',borderCollapse:'collapse',fontSize:'10px'}},
              h('thead',null,
                h('tr',null,
                  h('th',{style:{textAlign:'left',padding:'4px 6px',color:'var(--text3)',fontWeight:600,fontSize:'9px',
                    borderBottom:'.5px solid var(--bdr)',whiteSpace:'nowrap'}},'Store'),
                  weekDays.map((d,i)=>h('th',{key:i,style:{textAlign:'right',padding:'4px 6px',color:'var(--text3)',
                    fontWeight:600,fontSize:'9px',borderBottom:'.5px solid var(--bdr)',whiteSpace:'nowrap'}},
                    DOWabbr[d.getDay()])),
                  h('th',{style:{textAlign:'right',padding:'4px 8px',color:'var(--amber)',fontWeight:700,
                    fontSize:'9px',borderBottom:'.5px solid var(--bdr)',borderLeft:'.5px solid var(--bdr)',
                    whiteSpace:'nowrap'}},'Proj'),
                  h('th',{style:{textAlign:'right',padding:'4px 6px',color:'#34d399',fontWeight:700,
                    fontSize:'9px',borderBottom:'.5px solid var(--bdr)',whiteSpace:'nowrap'}},'Actual'),
                  h('th',{style:{textAlign:'right',padding:'4px 6px',color:'var(--text3)',fontWeight:600,
                    fontSize:'9px',borderBottom:'.5px solid var(--bdr)',whiteSpace:'nowrap'},
                    title:'vs LY (actual days only): actual sales for completed days vs the same days last year. Partial weeks compare only days where data exists.'},'vs LY'),
                  h('th',{style:{textAlign:'right',padding:'4px 6px',color:'var(--text3)',fontWeight:600,
                    fontSize:'9px',borderBottom:'.5px solid var(--bdr)',whiteSpace:'nowrap'},
                    title:'Acc% (completed days only): |actual minus projected| / actual for days where actuals exist. Green <5%, Yellow 5-10%, Red >=10%. Blank for future days.'},'Acc%'),
                  h('th',{style:{textAlign:'center',padding:'4px 6px',color:'var(--text3)',fontWeight:600,
                    fontSize:'9px',borderBottom:'.5px solid var(--bdr)',whiteSpace:'nowrap'}},'Lock')
                )
              ),
              h('tbody',null,
                storeProjs.map((sp,si)=>{
                  const isLocked=!!(lp[sp.loc+'_'+wsKey]);
                  const rowDays=sp.rowDays;
                  const actualTotal=sp.actualTotal;
                  const hasActuals=actualTotal>0;
                  const lyForActualDays=rowDays.reduce((a,r)=>a+(r.act>0?r.ly:0),0);
                  const vsLYAct=lyForActualDays>0&&hasActuals?((actualTotal-lyForActualDays)/lyForActualDays*100).toFixed(2):null;
                  const projForActualDays=rowDays.reduce((a,r)=>a+(r.act>0?r.fc:0),0);
                  const accPct=hasActuals&&projForActualDays>0?(Math.abs(actualTotal-projForActualDays)/actualTotal*100).toFixed(2):null;
                  const accClr=accPct==null?'var(--text3)':parseFloat(accPct)<5?'#10b981':parseFloat(accPct)<10?'#f59e0b':'#f87171';
                  const vsLYNum=sp.vsLY!=null?parseFloat(sp.vsLY):null;
                  const vsClr=vsLYNum==null?'var(--text3)':vsLYNum>=0?'#10b981':'#f87171';
                  const vsLYActNum=vsLYAct!=null?parseFloat(vsLYAct):null;
                  const vsActClr=vsLYActNum==null?'var(--text3)':vsLYActNum>=0?'#10b981':'#f87171';
                  return h('tr',{key:sp.loc,style:{borderBottom:'.5px solid rgba(255,255,255,.04)',
                    background:si%2===0?'transparent':'rgba(255,255,255,.02)'}},
                    h('td',{style:{padding:'4px 6px',color:'var(--text)',whiteSpace:'nowrap',maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',fontSize:'10px'}},
                      span({style:{marginRight:4,fontSize:'7px',color:sp.org==='MCDOK'?'#60a5fa':'#34d399'}},sp.org==='MCDOK'?'OK':'FL'),
                      sp.name),
                    rowDays.map((d,i)=>h('td',{key:i,style:{textAlign:'right',padding:'4px 6px',
                      fontFamily:'var(--mono)',fontSize:'9px',
                      color:d.act>0?'#34d399':'var(--text3)'}},
                      d.act>0?f$(Math.round(d.act)):d.fc>0?f$(Math.round(d.fc)):'—')),
                    h('td',{style:{textAlign:'right',padding:'4px 8px',fontFamily:'var(--mono)',
                      fontWeight:700,fontSize:'10px',color:'var(--amber)',
                      borderLeft:'.5px solid var(--bdr)'}},
                      sp.wkTotal>0?f$(Math.round(sp.wkTotal)):'—'),
                    h('td',{style:{textAlign:'right',padding:'4px 6px',fontFamily:'var(--mono)',
                      fontSize:'9px',color:'#34d399'}},
                      hasActuals?f$(Math.round(actualTotal)):'—'),
                    h('td',{style:{textAlign:'right',padding:'4px 6px',fontFamily:'var(--mono)',
                      fontSize:'9px',color:vsActClr}},
                      vsLYAct!=null?(vsLYActNum>=0?'+':'')+vsLYAct+'%':'—'),
                    h('td',{style:{textAlign:'right',padding:'4px 6px',fontFamily:'var(--mono)',
                      fontSize:'9px',color:accClr}},
                      accPct!=null?accPct+'%':'—'),
                    h('td',{style:{textAlign:'center',padding:'4px 6px',fontSize:'10px'}},
                      isLocked?'🔒':'⬜')
                  );
                }),
                // District total row
                h('tr',{style:{borderTop:'.5px solid var(--amber)',background:'rgba(245,158,11,.05)'}},
                  h('td',{style:{padding:'5px 6px',fontWeight:700,fontSize:'10px',color:'var(--amber)'}},'District Total'),
                  weekDays.map((_,i)=>h('td',{key:i,style:{}})),
                  h('td',{style:{textAlign:'right',padding:'5px 8px',fontFamily:'var(--mono)',
                    fontWeight:800,fontSize:'11px',color:'var(--amber)',borderLeft:'.5px solid var(--bdr)'}},
                    f$(Math.round(distTotal))),
                  h('td',{style:{textAlign:'right',padding:'5px 6px',fontFamily:'var(--mono)',
                    fontSize:'10px',color:'#34d399'}},
                    (()=>{const da=storeProjs.reduce((a,s)=>a+(s.actualTotal||0),0);return da>0?f$(Math.round(da)):'—';})()),
                  h('td',{style:{textAlign:'right',padding:'5px 6px',fontFamily:'var(--mono)',
                    fontSize:'10px',color:distVsLY!=null?(+distVsLY>=0?'#10b981':'#f87171'):'var(--text3)'}},
                    distVsLY!=null?((+distVsLY>=0?'+':'')+distVsLY+'%'):'—'),
                  h('td',{style:{textAlign:'right',padding:'5px 6px',fontFamily:'var(--mono)',
                    fontSize:'10px',color:'var(--text3)'}},'—'),
                  h('td',null)
                )
              )
            )
          )
        );
      })()

    ) // end main scroll
  ); // end AtAGlance
}


export { AtAGlance };
