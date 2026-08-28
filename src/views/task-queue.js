// @ts-nocheck
// ── Task Queue (merged with Feature Requests, dispatch #194) ──────────────────
//
// Owner's 2026-08-10 decision (memory/decisions-panel-inventory-2026-08-10.md): "Feature
// Requests -> merge into Task Queue with a type field." Every entry in this panel now carries
// a `type`: 'task' (the original Task Queue shape -- tiered work items, T1 auto/T2 PR/T3 human)
// or 'feature_request' (harvested from the retired src/views/feature-requests.js -- votable,
// publicly-submitted roadmap ideas with dev notes and a shipped-version badge).
//
// ── Why two Supabase tables still back this one panel ──────────────────────────
// `tasks` (34 live rows, measured via SUPABASE_SERVICE_ROLE_KEY Bearer, content-range 0-0/34)
// and `feature_requests` (2 live rows, content-range 0-0/2, same credential) have never shared
// a schema -- different status vocab (backlog/ready/in_progress/done/blocked vs.
// idea/planned/in-progress/completed/declined), different priority type (int 1/2/3 vs. string
// high/medium/low), and FR-only columns (submitted_by/dev_notes/completed_version/votes) `tasks`
// never had. `supabase/schema-tasks-feature-merge.sql` adds those columns to `tasks` (+ a `type`
// column, + a widened status CHECK) so the two CAN physically consolidate, and
// `scripts/migrate-feature-requests-to-tasks.mjs` copies the 2 live feature_requests rows in --
// but applying that SQL needs a Postgres DDL connection this agent session doesn't have (no
// DATABASE_URL/psql credential reaches this sandbox, only the Supabase REST API via the service
// role key, which can read/write existing columns but cannot ALTER TABLE). So it ships as a
// ready-to-run migration, same as this repo's other schema-*.sql files awaiting the owner.
//
// The PANEL merge does not wait on that: this component reads BOTH `tasks` (loadTasks, via
// updateTask/saveTask) and `feature_requests` (loadFeatureRequests, via saveFeatureRequest/
// updateFeatureRequest/voteFeatureRequest -- all four imports unchanged from feature-requests.js)
// and normalizes both into one shared item shape tagged with `type` + an internal `_src`
// provenance marker ('tasks' | 'feature_requests' | 'seed') that routes edits/votes back to the
// correct table. New Task submissions never send a `type` key (so they work identically whether
// or not the schema migration has landed -- the column's DEFAULT 'task' covers it once it has).
// New Feature Request submissions still go through saveFeatureRequest, unchanged, into
// `feature_requests` -- so nothing about actually filing a request depends on the pending SQL
// either. Once the owner runs the schema file + migration script, any `tasks` row that then
// carries type:'feature_request' is preferred over a same-titled legacy `feature_requests` row
// (see `dedupedFR` below), so the two won't double-render.
//
// SEED_ITEMS (the ~30-item pre-seeded roadmap history) was NEVER a Supabase row in the first
// place -- FeatureRequestsPanel always merged it client-side, filtering out any seed title that
// already had a matching DB row. That behavior is carried over verbatim here, so none of that
// history is gated on the pending migration at all.
//
// scripts/features.mjs (the CLI referenced from SAGE's 🐞 Log flow and this panel's own history)
// is untouched -- it still targets `feature_requests` directly, which stays the live write path
// for feature-request-type entries until a future dispatch flips it over post-migration.

import * as React from 'react';
import { loadTasks, saveTask, updateTask, loadSessionNotes, saveSessionNote, markNoteConsumed,
  loadFeatureRequests, saveFeatureRequest, updateFeatureRequest, voteFeatureRequest } from '../lib/supabase.js';

const h   = React.createElement;
const div  = (p,...c) => h('div',   p, ...c);
const span = (p,...c) => h('span',  p, ...c);
const btn  = (p,...c) => h('button',p, ...c);

const { useState, useEffect, useRef, useCallback } = React;

// ── Constants ─────────────────────────────────────────────────────────────────
const TYPE_META = {
  task:            { label:'🔧 Task',            color:'#60a5fa', bg:'rgba(96,165,250,.12)' },
  feature_request: { label:'💡 Feature Request', color:'var(--gold)', bg:'rgba(245,188,0,.12)' },
};

const TIER_META = {
  1: { label:'T1', desc:'Config / copy / minor UI — auto-safe', color:'#10b981', bg:'rgba(16,185,129,.15)' },
  2: { label:'T2', desc:'New feature / logic change — PR + review', color:'#f59e0b', bg:'rgba(245,158,11,.15)' },
  3: { label:'T3', desc:'Infra / schema / auth — human only', color:'#ef4444', bg:'rgba(239,68,68,.15)' },
};

// Priority is unified to the Task Queue's int scale (1=High/2=Medium/3=Low) for BOTH types --
// the same 1/2/3 mapping sage.js's LogIssueModal already applies when it files a Feature
// Request as a task-shaped record, so this isn't a new convention. Feature Request rows sourced
// from the (string-priority) feature_requests table are normalized to these ints on load; a new
// Feature Request submission is converted back to a string just before saveFeatureRequest.
const PRI_META = {
  1: { label:'High',   color:'#ef4444', dot:'🔴' },
  2: { label:'Medium', color:'#f59e0b', dot:'🟡' },
  3: { label:'Low',    color:'#94a3b8', dot:'🟢' },
};
const PRI_STR_TO_INT = { high:1, medium:2, low:3 };
const PRI_INT_TO_STR = { 1:'high', 2:'medium', 3:'low' };

// Status stays in each backing table's own native vocabulary (no data rewrite of the 2 live
// feature_requests rows) -- the badge/facet UI just displays both vocabularies with a shared
// visual language. 'in_progress'/'done' (task) and 'in-progress'/'completed' (feature request)
// are genuinely different stored strings; both map to the same label/color pairing below.
const STATUS_META = {
  backlog:      { label:'Backlog',     color:'#94a3b8', bg:'rgba(148,163,184,.12)' },
  ready:        { label:'Ready',       color:'#60a5fa', bg:'rgba(96,165,250,.12)'  },
  in_progress:  { label:'In Progress', color:'#f59e0b', bg:'rgba(245,158,11,.12)'  },
  done:         { label:'Done',        color:'#10b981', bg:'rgba(16,185,129,.12)'  },
  blocked:      { label:'Blocked',     color:'#ef4444', bg:'rgba(239,68,68,.12)'   },
  idea:         { label:'Idea',        color:'#94a3b8', bg:'rgba(148,163,184,.12)' },
  planned:      { label:'Planned',     color:'#60a5fa', bg:'rgba(96,165,250,.12)'  },
  'in-progress':{ label:'In Progress', color:'#f59e0b', bg:'rgba(245,158,11,.12)'  },
  completed:    { label:'Done',        color:'#10b981', bg:'rgba(16,185,129,.12)'  },
  declined:     { label:'Declined',    color:'#ef4444', bg:'rgba(239,68,68,.12)'   },
};

const TASK_STATUSES = ['backlog','ready','in_progress','done','blocked'];
const FR_STATUSES    = ['idea','planned','in-progress','completed','declined'];

// Domain facet, harvested from the orphaned AIInsightsLog panel's taxonomy (issue #128) for
// type:'task', merged with FeatureRequestsPanel's own category set for type:'feature_request'.
// No key collision worth normalizing away ('Labor' vs 'labor' stay two distinct badges) -- each
// is exactly what its source panel used, and merging their casing would be a data-shape change
// nobody asked for.
const CATEGORY_META = {
  ops:     { label:'Operations', color:'#60a5fa' },
  ctrl:    { label:'Controls',   color:'var(--crit)' },
  labor:   { label:'Labor',      color:'#f59e0b' },
  sales:   { label:'Sales',      color:'#34d399' },
  weather: { label:'Weather',    color:'#93c5fd' },
  anomaly: { label:'Anomaly',    color:'#f97316' },
  other:   { label:'Other',      color:'#94a3b8' },
  'AI':          { label:'AI',          color:'#a78bfa' },
  'Analytics':   { label:'Analytics',   color:'#60a5fa' },
  'Data':        { label:'Data',        color:'#34d399' },
  'Finance':     { label:'Finance',     color:'#f59e0b' },
  'Guest Voice': { label:'Guest Voice', color:'#f472b6' },
  'Labor':       { label:'Labor',       color:'#fb923c' },
  'UI':          { label:'UI',          color:'#38bdf8' },
  'General':     { label:'General',     color:'#94a3b8' },
};
const TASK_CATEGORIES = ['ops','ctrl','labor','sales','weather','anomaly','other'];
const FR_CATEGORIES   = ['AI','Analytics','Data','Finance','Guest Voice','Labor','UI','General'];

// ── Seed data — historical + planned items from Meridian roadmap ───────────────
// Harvested verbatim from feature-requests.js's SEED_ITEMS. Never a Supabase row (see header
// comment) -- a client-side historical overlay, merged the same way it always was: any seed
// title already covered by a live feature_requests/tasks row is suppressed so it doesn't
// double-render once that title graduates to a real record.
const SEED_ITEMS = [
  // Completed
  { id:'seed-sage',    title:'SAGE AI Chat Assistant',                       category:'AI',          status:'completed', priority:'high',   completed_version:'v4.281', votes:0, submitted_by:'Fletcher Reaves', description:'Claude Opus-powered AI advisor with streaming, JWT-verified Edge Function, adaptive thinking.' },
  { id:'seed-sb-ops',  title:'Supabase persistence — operational data',       category:'Data',        status:'completed', priority:'high',   completed_version:'v4.301', votes:0, submitted_by:'Fletcher Reaves', description:'Move fobRows, opsRows, ctrlRows, darRows, smgFullscale from OPFS to Supabase for true cross-device access.' },
  { id:'seed-smg-cal', title:'SMG VOICE auto-calibrate thresholds',           category:'Guest Voice', status:'completed', priority:'medium', completed_version:'v4.310', votes:0, submitted_by:'Fletcher Reaves', description:'p75/p25 percentile engine derives OSAT, B2B, and problem rate thresholds from historical data automatically.' },
  { id:'seed-grid',    title:'District grid Option A+C tile layout',          category:'UI',          status:'completed', priority:'medium', completed_version:'v4.311', votes:0, submitted_by:'Fletcher Reaves', description:'4px accent bar, FL/OK chip, 4-metric rows (Sales, Labor, OEPE, TPPH), model health score per store card.' },
  { id:'seed-orgsum',  title:'Org Summary group selector',                    category:'Analytics',   status:'completed', priority:'medium', completed_version:'v4.314', votes:0, submitted_by:'Fletcher Reaves', description:'Renamed from Operator Summary. Groups: Company (all stores), Org (FL/OK), Operator, Patch (supervisor territory).' },
  { id:'seed-dm',      title:'Data Manager cloud-first update',               category:'Data',        status:'completed', priority:'low',    completed_version:'v4.315', votes:0, submitted_by:'Fletcher Reaves', description:'Supabase section now shows operational row coverage. Header updated to reflect cloud-first architecture.' },
  { id:'seed-fr',      title:'Feature Requests module',                       category:'UI',          status:'completed', priority:'low',    completed_version:'v4.316', votes:0, submitted_by:'Fletcher Reaves', description:'Track feature ideas from all users. Pre-seeded with roadmap history. Supabase-backed for cross-user submissions.' },
  { id:'seed-ebos',    title:'QSRSoft eBOS purchases automation',             category:'Data',        status:'completed', priority:'high',   completed_version:'v4.340', votes:0, submitted_by:'Fletcher Reaves', description:'Daily GitHub Actions sync of op supplies purchases via Playwright auth → qsr_ebos_daily table.' },
  { id:'seed-dar',     title:'QSRSoft Daily Activity (DAR) automation',       category:'Data',        status:'completed', priority:'high',   completed_version:'v4.356', votes:0, submitted_by:'Fletcher Reaves', description:'Hourly intraday data for all 27 stores, quarter-hour granularity → qsr_daily_activity. Runs daily 5am CDT.' },
  { id:'seed-daypart', title:'Store Dashboard daypart card',                  category:'Analytics',   status:'completed', priority:'high',   completed_version:'v4.357', votes:0, submitted_by:'Fletcher Reaves', description:'Aggregates hour slots to Breakfast/Lunch/PM/Dinner/Late from qsr_daily_activity. Shows vs projection, vs LY.' },
  { id:'seed-pace',    title:'Morning Brief district hourly pace',            category:'Analytics',   status:'completed', priority:'high',   completed_version:'v4.358', votes:0, submitted_by:'Fletcher Reaves', description:'TodayPaceCard: today sales pace vs 30-day mean by hour slot from qsr_daily_activity.' },
  { id:'seed-signals', title:'Signals LiveOps panel',                        category:'Analytics',   status:'completed', priority:'high',   completed_version:'v4.360', votes:0, submitted_by:'Fletcher Reaves', description:'Live operational alerts from qsr_daily_activity: sales pace, DT serve time, labor vs needed hours.' },
  { id:'seed-qsrproj', title:'Projections QSRSoft baseline column',          category:'Analytics',   status:'completed', priority:'medium', completed_version:'v4.369', votes:0, submitted_by:'Fletcher Reaves', description:'Adds proj_sales_dollars from qsr_daily_activity as a second comparison line in Projections grid.' },
  // Planned
  { id:'seed-sage-tl', title:'SAGE tool use — live Supabase queries',         category:'AI',          status:'completed', priority:'high',   completed_version:'v4.379', votes:0, submitted_by:'Fletcher Reaves', description:'SAGE queries Supabase directly for live numbers (query_daily_activity, query_lifelenz_labor, query_forecast_snapshots) instead of context-window injection.' },
  { id:'seed-mape',    title:'MAPE daily — three-way forecast accuracy',      category:'Analytics',   status:'completed', priority:'high',   completed_version:'v4.379', votes:0, submitted_by:'Fletcher Reaves', description:'Proj vs Actuals report: Meridian forecast vs QSRSoft proj vs actual, MAPE over held-out weeks (forecast_snapshots).' },
  { id:'seed-dt-sos',  title:'DT Speed-of-Service Analytics panel',          category:'Analytics',   status:'completed', priority:'high',   completed_version:'v4.37', votes:0, submitted_by:'Fletcher Reaves', description:'All-station speed panel (DT/front-counter/kitchen-MFY/beverage), cross-store, by hour, 90-day trend, best slots + worst stores.' },
  { id:'seed-sage-mm', title:'SAGE cross-device session memory',              category:'AI',          status:'planned',   priority:'medium', completed_version:'', votes:0, submitted_by:'Fletcher Reaves', description:'Conversation retention and context across devices and sessions for continuity.' },
  { id:'seed-osat',    title:'Performance Review OSAT auto-fill polish',      category:'Analytics',   status:'planned',   priority:'medium', completed_version:'', votes:0, submitted_by:'Fletcher Reaves', description:'Preview SMG data being auto-filled; show which months have coverage; handle multi-month reviews cleanly.' },
  { id:'seed-beta',    title:'Beta operator onboarding',                      category:'Data',        status:'planned',   priority:'high',   completed_version:'', votes:0, submitted_by:'Fletcher Reaves', description:'Onboard a second trusted operator to Meridian beta. RBAC, restricted panel set, their own Supabase RLS config.' },
  { id:'seed-fob-p',   title:'FOB multi-location variance analysis',          category:'Finance',     status:'completed', priority:'medium', completed_version:'v4.543', votes:0, submitted_by:'Fletcher Reaves', description:'Side-by-side FOB component breakdown across stores (EOM Dashboard → 📊 FOB breakdown): 6 controllable components as %/$, dollar-weighted district comparison, outlier + primary-driver flags — spots where food cost overruns originate.' },
  { id:'seed-eom',     title:'EOM Dashboard + food-cost diagnosis engine',    category:'Finance',     status:'completed', priority:'high',   completed_version:'v4.542', votes:0, submitted_by:'Fletcher Reaves', description:'All-stores End-of-Month view: count progress, FOB $/% + components, editable diagnosis flow, recount+action-plan comms, and the Item Journey visual guide (per-item count-cycle timeline with verified-fact vs likely-inference signals). Two modes: EOM count-completion + year-round progress.' },
  // ── Shipped 2026-07-23 (Smart Targets / Labor / SAGE / Projections batch) ──
  { id:'seed-st-model', title:'Smart Targets model — median-of-simple + deeper backtest', category:'Analytics', status:'completed', priority:'high', completed_version:'v4.483', votes:0, submitted_by:'Fletcher Reaves', description:'27-store backtest proved simple trailing beats engineered models for monthly sales; recommended = median of T3M/T6W/T3W · recent-3wk · 3-mo-avg. Engineered models preserved as diagnostics.' },
  { id:'seed-st-metrics', title:'Smart Targets — Labor % / DT speed / FOB % metrics', category:'Analytics', status:'completed', priority:'high', completed_version:'v4.489', votes:0, submitted_by:'Fletcher Reaves', description:'Ratio metrics (dollar/volume-weighted trailing levels, direction lower). FOB % matches the At-A-Glance formula.' },
  { id:'seed-st-adj',  title:'Smart Targets — known-event (+/-) adjustments',  category:'Analytics',   status:'completed', priority:'medium', completed_version:'v4.486', votes:0, submitted_by:'Fletcher Reaves', description:'Per-store exclude one-off days from learning + add a signed event delta to the target (smart_target_adjustments).' },
  { id:'seed-st-apply', title:'Smart Targets — Apply as Official',             category:'Analytics',   status:'completed', priority:'high',   completed_version:'v4.489', votes:0, submitted_by:'Fletcher Reaves', description:'Per-store + bulk write of the Smart number into monthly_targets (partial upsert) for the upcoming month; feeds Projections.' },
  { id:'seed-ll-labor', title:'LifeLenz Labor Analysis auto-pull',            category:'Labor',       status:'completed', priority:'high',   completed_version:'v4.485', votes:0, submitted_by:'Fletcher Reaves', description:'Weekly Band-1 derived from the daily lifelenz_schedule (Hours Fcst = Proj VLH+Fixed+Floor); auto wins, manual MBI gap-fills.' },
  { id:'seed-sage-log', title:'SAGE — log a data issue → Task / Feature Request', category:'AI',       status:'completed', priority:'medium', completed_version:'v4.487', votes:0, submitted_by:'Fletcher Reaves', description:'🐞 Log on any answer: detects the data source, suggests Task vs FR, drafts a troubleshooting prompt into the ticket.' },
  { id:'seed-sage-lib', title:'SAGE — saved prompt library + auto-scheduling', category:'AI',         status:'completed', priority:'medium', completed_version:'v4.488', votes:0, submitted_by:'Fletcher Reaves', description:'📚 save/run prompts; ⏰ schedule daily/weekly (GitHub Action runner); 🧭 Scheduled-Runs At-A-Glance tile.' },
  { id:'seed-pace',    title:'Pace to Target — monthly MTD actual vs official', category:'Analytics',  status:'completed', priority:'high',   completed_version:'v4.490', votes:0, submitted_by:'Fletcher Reaves', description:'Dedicated view: MTD actual vs the official monthly target, run-rate pace + % ahead/behind, Store/Patch/Operator toggle.' },
  { id:'seed-gc-pace', title:'Signals — guest-count tracking-to-plan',         category:'Analytics',   status:'completed', priority:'medium', completed_version:'v4.491', votes:0, submitted_by:'Fletcher Reaves', description:'GC pace alongside $ pace, with a traffic-vs-sales divergence flag (leading indicator of a check-average slip).' },
  { id:'seed-yearly',  title:'Yearly Projections view',                       category:'Analytics',   status:'completed', priority:'medium', completed_version:'v4.492', votes:0, submitted_by:'Fletcher Reaves', description:'Annual target (Σ monthly) vs YTD actual (prorated), Projected Full Year, FY-vs-target, OK/FL/grand subtotals.' },
  // ── Remaining / next ──
  { id:'seed-sage-rbac', title:'SAGE — RBAC awareness',                       category:'AI',          status:'completed', priority:'medium', completed_version:'v4.494', votes:0, submitted_by:'Fletcher Reaves', description:'Scope what SAGE sees + recommends by the caller’s role / accessible_locs. Shipped — needs a sage-chat edge-function redeploy to take effect.' },
  { id:'seed-gvp',     title:'Graded-Visit Predictor (CFV / RGR / EcoSure)',  category:'Analytics',   status:'idea',      priority:'high',   completed_version:'', votes:0, submitted_by:'Fletcher Reaves', description:'Flagship: learn the operational pattern preceding graded visits → score pass-likelihood + levers. BLOCKED on an EcoSure data sample.' },
  { id:'seed-dar-more', title:'DAR secondary fields — channel splits, GC anomalies, product-volume', category:'Data', status:'idea', priority:'low', completed_version:'', votes:0, submitted_by:'Fletcher Reaves', description:'Surface dt/is channel splits, GC baseline anomalies, sandwich/fry/beverage projections. Each needs a loader-SELECT widening first.' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function timeAgo(ts) {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h/24)}d ago`;
}

// Normalizes a `tasks` row into the shared display shape. Every field the panel already had
// stays as-is; `type` defaults to 'task' for the (overwhelming, pre-migration) common case
// where the column doesn't exist live yet or was never set.
function normalizeTaskRow(r) {
  return { ...r, _src:'tasks', type: r.type || 'task' };
}

// Normalizes a feature_requests row OR a SEED_ITEMS entry into the shared display shape.
// `src` is 'feature_requests' (real DB row) or 'seed' (client-side history, never persisted).
function normalizeFRRow(r, src) {
  return { ...r, _src:src, type:'feature_request',
    priority: PRI_STR_TO_INT[r.priority] || 2 };
}

// ── TypeBadge ─────────────────────────────────────────────────────────────────
function TypeBadge({ type }) {
  const m = TYPE_META[type] || TYPE_META.task;
  return span({ style:{ fontSize:'9px', fontWeight:800, padding:'2px 7px', borderRadius:99,
    background:m.bg, color:m.color, border:`.5px solid ${m.color}55`, flexShrink:0,
    whiteSpace:'nowrap' }}, m.label);
}

// ── TierBadge ─────────────────────────────────────────────────────────────────
function TierBadge({ tier }) {
  const m = TIER_META[tier] || TIER_META[1];
  return span({ style:{ fontSize:'9px', fontWeight:800, padding:'2px 6px', borderRadius:4,
    background:m.bg, color:m.color, border:`.5px solid ${m.color}55`, flexShrink:0,
    letterSpacing:'.03em' }}, m.label);
}

// ── StatusBadge ───────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META.backlog;
  return span({ style:{ fontSize:'9px', fontWeight:700, padding:'2px 8px', borderRadius:99,
    background:m.bg, color:m.color, border:`.5px solid ${m.color}44`, whiteSpace:'nowrap' }}, m.label);
}

// ── CategoryBadge ─────────────────────────────────────────────────────────────
function CategoryBadge({ category }) {
  if (!category) return null;
  const m = CATEGORY_META[category] || CATEGORY_META.other;
  return span({ style:{ fontSize:'9px', fontWeight:700, padding:'1px 6px', borderRadius:3,
    background:m.color+'22', color:m.color, border:`.5px solid ${m.color}44`, whiteSpace:'nowrap' }}, m.label);
}

// ── VoteButton ────────────────────────────────────────────────────────────────
function VoteButton({ item, voted, onVote }) {
  return btn({ onClick:e=>{ e.stopPropagation(); onVote(item); }, disabled:voted,
    style:{ fontSize:'10px', padding:'3px 8px', borderRadius:99, cursor:voted?'default':'pointer',
      border:`.5px solid ${voted?'var(--gold)':'var(--bdr)'}`,
      background:voted?'rgba(245,188,0,.15)':'transparent',
      color:voted?'var(--gold)':'var(--text3)', display:'flex', alignItems:'center', gap:4,
      flexShrink:0, fontWeight:700 }},
    span(null,'▲'), span(null, item.votes||0));
}

// ── TaskCard ──────────────────────────────────────────────────────────────────
function TaskCard({ item, isDev, votedIds, onUpdate, onDelete, onVote }) {
  const [open, setOpen] = useState(false);
  const isFR = item.type === 'feature_request';
  const [notes, setNotes] = useState((isFR ? item.dev_notes : item.notes) || '');
  const [savingNotes, setSavingNotes] = useState(false);
  const pri = PRI_META[item.priority] || PRI_META[2];
  const tierColor = (TIER_META[item.tier] || TIER_META[1]).color;
  const statusOptions = isFR ? FR_STATUSES : TASK_STATUSES;
  const canEditDevFields = isFR ? isDev : true; // task notes were always editable; FR dev_notes is dev/admin-only, matching the original panel
  const readOnly = item._src === 'seed'; // historical roadmap entries -- not persisted, not editable

  const saveNotes = async () => {
    setSavingNotes(true);
    await onUpdate(item, isFR ? { dev_notes: notes } : { notes });
    setSavingNotes(false);
  };

  return div({ style:{ borderRadius:8, overflow:'hidden', marginBottom:8,
    border:`.5px solid var(--bdr)`, background:'var(--surf2)',
    borderLeft:`3px solid ${isFR ? TYPE_META.feature_request.color : tierColor}` }},

    // ── Collapsed row ──
    div({ onClick:()=>setOpen(o=>!o),
      style:{ display:'flex', alignItems:'center', gap:10, padding:'12px 14px',
        cursor:'pointer', minHeight:44 }},
      isFR ? null : span({ style:{ fontSize:13, flexShrink:0 }}, pri.dot),
      div({ style:{ flex:1, minWidth:0 }},
        div({ style:{ fontSize:13, fontWeight:600, color:'var(--text)',
          whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}, item.title),
        (item.description || item.loc || item.submitted_by) && !open && div({ style:{ fontSize:10, color:'var(--text3)',
          whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', marginTop:2 }},
          (item.loc ? '#'+item.loc+' · ' : '') +
          (isFR && item.submitted_by ? 'by '+item.submitted_by+' · ' : '') +
          (item.description||'')),
      ),
      div({ style:{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }},
        isFR && h(VoteButton, { item, voted:votedIds.has(item.id||item.title), onVote }),
        h(TypeBadge, { type:item.type }),
        h(CategoryBadge, { category:item.category }),
        !isFR && h(TierBadge, { tier:item.tier }),
        h(StatusBadge, { status:item.status }),
        span({ style:{ fontSize:12, color:'var(--text3)', marginLeft:2 }}, open?'▲':'▼'),
      ),
    ),

    // ── Expanded ──
    open && div({ style:{ padding:'0 14px 14px', borderTop:'.5px solid var(--bdr)' }},

      item.description && div({ style:{ fontSize:12, color:'var(--text2)', lineHeight:1.5,
        padding:'10px 0 12px' }}, item.description),

      item.loc && div({ style:{ fontSize:11, color:'var(--text3)', marginBottom:8 }},
        '📍 Store #'+item.loc),

      isFR && item.completed_version && span({ style:{ fontSize:'10px', color:'#10b981',
        display:'block', marginBottom:8 }}, '✅ Shipped '+item.completed_version),

      // Category buttons
      !readOnly && div({ style:{ marginBottom:12 }},
        div({ style:{ fontSize:'9px', fontWeight:700, color:'var(--text3)',
          textTransform:'uppercase', letterSpacing:'.5px', marginBottom:6 }}, 'Category'),
        div({ style:{ display:'flex', gap:6, flexWrap:'wrap' }},
          ...(isFR?FR_CATEGORIES:TASK_CATEGORIES).map(c => {
            const m = CATEGORY_META[c];
            return btn({ key:c, onClick:()=>onUpdate(item,{category:item.category===c?null:c}),
              style:{ padding:'5px 10px', borderRadius:99, border:`.5px solid ${item.category===c?m.color:m.color+'44'}`,
                background:item.category===c?m.color+'22':'transparent',
                color:item.category===c?m.color:'var(--text3)',
                fontSize:11, fontWeight:item.category===c?700:400, cursor:'pointer' }},
              m.label
            );
          })
        )
      ),

      // Priority buttons
      !readOnly && div({ style:{ marginBottom:12 }},
        div({ style:{ fontSize:'9px', fontWeight:700, color:'var(--text3)',
          textTransform:'uppercase', letterSpacing:'.5px', marginBottom:6 }}, 'Priority'),
        div({ style:{ display:'flex', gap:8 }},
          ...Object.entries(PRI_META).map(([p, m]) =>
            btn({ key:p, onClick:()=>onUpdate(item,{priority:+p}),
              style:{ flex:1, padding:'10px 0', borderRadius:8, border:`.5px solid ${item.priority===+p?m.color:m.color+'44'}`,
                background:item.priority===+p?m.color+'22':'transparent',
                color:item.priority===+p?m.color:'var(--text3)',
                fontSize:12, fontWeight:item.priority===+p?800:500, cursor:'pointer',
                display:'flex', flexDirection:'column', alignItems:'center', gap:3 }},
              span(null, m.dot), span({ style:{fontSize:9}}, m.label)
            )
          )
        )
      ),

      // Tier buttons — task type only, meaningless for a feature request
      !readOnly && !isFR && div({ style:{ marginBottom:12 }},
        div({ style:{ fontSize:'9px', fontWeight:700, color:'var(--text3)',
          textTransform:'uppercase', letterSpacing:'.5px', marginBottom:6 }}, 'Tier — safety level'),
        div({ style:{ display:'flex', gap:8 }},
          ...Object.entries(TIER_META).map(([t, m]) =>
            btn({ key:t, onClick:()=>onUpdate(item,{tier:+t}),
              style:{ flex:1, padding:'8px 4px', borderRadius:8, border:`.5px solid ${item.tier===+t?m.color:m.color+'44'}`,
                background:item.tier===+t?m.color+'22':'transparent',
                color:item.tier===+t?m.color:'var(--text3)',
                fontSize:11, fontWeight:item.tier===+t?800:500, cursor:'pointer' }},
              m.label
            )
          )
        ),
        div({ style:{ fontSize:'9px', color:'var(--text3)', marginTop:4 }},
          (TIER_META[item.tier]||TIER_META[1]).desc)
      ),

      // Status buttons — statusOptions is type-specific so this always writes a value the
      // item's own backing table's CHECK constraint already accepts.
      !readOnly && div({ style:{ marginBottom:12 }},
        div({ style:{ fontSize:'9px', fontWeight:700, color:'var(--text3)',
          textTransform:'uppercase', letterSpacing:'.5px', marginBottom:6 }}, 'Status'),
        div({ style:{ display:'flex', flexWrap:'wrap', gap:6 }},
          ...statusOptions.map(s => {
            const m = STATUS_META[s];
            return btn({ key:s, onClick:()=>onUpdate(item,{status:s}),
              style:{ padding:'8px 12px', borderRadius:99, border:`.5px solid ${item.status===s?m.color:m.color+'44'}`,
                background:item.status===s?m.bg:'transparent',
                color:item.status===s?m.color:'var(--text3)',
                fontSize:11, fontWeight:item.status===s?700:400, cursor:'pointer' }},
              m.label
            );
          })
        )
      ),

      readOnly && div({ style:{ fontSize:'9px', color:'var(--text3)', marginBottom:10 }},
        'Historical roadmap entry — read-only.'),

      // Notes / Dev notes
      !readOnly && (canEditDevFields || !isFR) && div({ style:{ marginBottom:8 }},
        div({ style:{ fontSize:'9px', fontWeight:700, color:'var(--text3)',
          textTransform:'uppercase', letterSpacing:'.5px', marginBottom:6 }},
          isFR ? 'Dev Notes (visible to all users)' : 'Notes'),
        h('textarea', {
          value:notes, onChange:e=>setNotes(e.target.value),
          placeholder: isFR ? 'Status commentary for everyone who can see this request…' : 'Context, links, clarifications…',
          rows:3,
          style:{ width:'100%', background:'var(--mid2)', border:'.5px solid var(--bdr)',
            borderRadius:6, color:'var(--text)', fontSize:12, padding:'8px 10px',
            resize:'vertical', fontFamily:'inherit', boxSizing:'border-box' }
        }),
        div({ style:{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:6 }},
          item.result_summary && span({ style:{ fontSize:'9px', color:'var(--text3)' }},
            '🤖 '+item.result_summary.slice(0,80)+(item.result_summary.length>80?'…':'')),
          div({ style:{ display:'flex', gap:8, marginLeft:'auto' }},
            !isFR && btn({ onClick:()=>onDelete(item),
              style:{ padding:'6px 12px', borderRadius:6, border:'.5px solid rgba(239,68,68,.3)',
                background:'transparent', color:'var(--crit)', fontSize:11, cursor:'pointer' }},
              'Remove'),
            btn({ onClick:saveNotes, disabled:savingNotes,
              style:{ padding:'6px 14px', borderRadius:6, border:'.5px solid var(--gold)',
                background:'rgba(245,188,0,.1)', color:'var(--gold)',
                fontSize:11, fontWeight:700, cursor:'pointer' }},
              savingNotes?'Saving…':'Save Notes'),
          )
        )
      ),
      isFR && !canEditDevFields && item.dev_notes && div({ style:{ fontSize:'9px', color:'#60a5fa', marginTop:4, lineHeight:1.5 }},
        span({ style:{ fontWeight:700, marginRight:4 }}, 'Dev notes:'), item.dev_notes),

      item.result_pr && div({ style:{ fontSize:'9px', color:'#60a5fa', marginTop:4 }},
        '🔗 PR: '+item.result_pr),
      div({ style:{ fontSize:'9px', color:'var(--text3)', marginTop:6 }},
        isFR
          ? 'Submitted by '+(item.submitted_by||'Anonymous')+(item.created_at?' · '+timeAgo(item.created_at):'')
          : 'Added '+timeAgo(item.created_at)+(item.source&&item.source!=='manual'?' · via '+item.source:'')),
    )
  );
}

// ── AddEntrySheet ─────────────────────────────────────────────────────────────
function AddEntrySheet({ defaultType, onSaveTask, onSaveFR, onClose }) {
  const [type,  setType]    = useState(defaultType==='feature_request'?'feature_request':'task');
  const [title, setTitle]   = useState('');
  const [desc,  setDesc]    = useState('');
  const [tier,  setTier]    = useState(1);
  const [pri,   setPri]     = useState(2);
  const [cat,   setCat]     = useState(null);
  const [notes, setNotes]   = useState('');
  const [submittedBy, setSubmittedBy] = useState('');
  const [saving, setSaving] = useState(false);
  const titleRef = useRef(null);
  const isFR = type === 'feature_request';

  useEffect(()=>{ setCat(null); },[type]); // categories differ per type — don't carry a task category into an FR submission or vice versa
  useEffect(()=>{ setTimeout(()=>titleRef.current?.focus(), 80); },[]);

  const submit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    const ok = isFR
      ? await onSaveFR({ title:title.trim(), description:desc.trim()||null, category:cat||'General',
          priority: PRI_INT_TO_STR[pri]||'medium', status:'idea',
          submitted_by: submittedBy.trim()||'Anonymous', votes:0, is_seed:false })
      : await onSaveTask({ title:title.trim(), description:desc.trim()||null,
          tier, priority:pri, category:cat, notes:notes.trim()||null, status:'backlog', source:'manual' });
    setSaving(false);
    if (ok) onClose();
    else alert('Could not save — check your connection and try again. Your entry is still here.');
  };

  const selBtn = (val, cur, set, label, color) =>
    btn({ onClick:()=>set(val),
      style:{ flex:1, padding:'11px 4px', borderRadius:8,
        border:`.5px solid ${cur===val?color:color+'44'}`,
        background:cur===val?color+'22':'transparent',
        color:cur===val?color:'var(--text3)',
        fontSize:13, fontWeight:cur===val?800:500, cursor:'pointer' }},
      label);

  return div({ style:{ position:'fixed', inset:0, zIndex:800,
    display:'flex', flexDirection:'column', justifyContent:'flex-end' }},

    // Backdrop
    div({ onClick:onClose,
      style:{ position:'absolute', inset:0, background:'rgba(0,0,0,.6)' }}),

    // Sheet
    div({ style:{ position:'relative', background:'var(--surf)',
      borderRadius:'16px 16px 0 0', padding:'0 0 env(safe-area-inset-bottom,16px)',
      maxHeight:'90vh', overflowY:'auto',
      boxShadow:'0 -4px 40px rgba(0,0,0,.5)' }},

      // Handle
      div({ style:{ display:'flex', justifyContent:'center', padding:'10px 0 4px' }},
        div({ style:{ width:40, height:4, borderRadius:2, background:'rgba(255,255,255,.2)' }})),

      div({ style:{ padding:'8px 20px 20px' }},

        div({ style:{ fontSize:16, fontWeight:800, color:'var(--text)', marginBottom:12 }},
          'Add Entry'),

        // Type toggle
        div({ style:{ marginBottom:14 }},
          div({ style:{ fontSize:'10px', fontWeight:700, color:'var(--text3)',
            textTransform:'uppercase', letterSpacing:'.5px', marginBottom:6 }}, 'Type'),
          div({ style:{ display:'flex', gap:8 }},
            selBtn('task', type, setType, TYPE_META.task.label, TYPE_META.task.color),
            selBtn('feature_request', type, setType, TYPE_META.feature_request.label, TYPE_META.feature_request.color),
          )
        ),

        // Title
        div({ style:{ marginBottom:14 }},
          div({ style:{ fontSize:'10px', fontWeight:700, color:'var(--text3)',
            textTransform:'uppercase', letterSpacing:'.5px', marginBottom:6 }}, 'Title *'),
          h('input', { ref:titleRef, value:title, onChange:e=>setTitle(e.target.value),
            placeholder: isFR ? 'Short, clear feature description…' : 'What needs to be done?',
            onKeyDown:e=>e.key==='Enter'&&submit(),
            style:{ width:'100%', background:'var(--mid2)', border:`.5px solid ${title?'var(--gold)':'var(--bdr)'}`,
              borderRadius:8, color:'var(--text)', fontSize:15, padding:'12px 14px',
              fontFamily:'inherit', boxSizing:'border-box', outline:'none' }})
        ),

        // Tier — task only
        !isFR && div({ style:{ marginBottom:14 }},
          div({ style:{ fontSize:'10px', fontWeight:700, color:'var(--text3)',
            textTransform:'uppercase', letterSpacing:'.5px', marginBottom:6 }}, 'Tier'),
          div({ style:{ display:'flex', gap:8 }},
            ...Object.entries(TIER_META).map(([t,m]) =>
              selBtn(+t, tier, setTier, m.label, m.color))
          ),
          div({ style:{ fontSize:'10px', color:'var(--text3)', marginTop:5 }},
            (TIER_META[tier]||TIER_META[1]).desc)
        ),

        // Priority
        div({ style:{ marginBottom:14 }},
          div({ style:{ fontSize:'10px', fontWeight:700, color:'var(--text3)',
            textTransform:'uppercase', letterSpacing:'.5px', marginBottom:6 }}, 'Priority'),
          div({ style:{ display:'flex', gap:8 }},
            ...Object.entries(PRI_META).map(([p,m]) =>
              selBtn(+p, pri, setPri,
                div(null, span({style:{fontSize:16}},m.dot), div({style:{fontSize:10,marginTop:2}},m.label)),
                m.color))
          )
        ),

        // Category (optional) — options depend on type
        div({ style:{ marginBottom:14 }},
          div({ style:{ fontSize:'10px', fontWeight:700, color:'var(--text3)',
            textTransform:'uppercase', letterSpacing:'.5px', marginBottom:6 }}, 'Category (optional)'),
          div({ style:{ display:'flex', gap:6, flexWrap:'wrap' }},
            ...(isFR?FR_CATEGORIES:TASK_CATEGORIES).map(c => {
              const m = CATEGORY_META[c];
              return btn({ key:c, onClick:()=>setCat(cat===c?null:c),
                style:{ padding:'6px 12px', borderRadius:99, border:`.5px solid ${cat===c?m.color:m.color+'44'}`,
                  background:cat===c?m.color+'22':'transparent',
                  color:cat===c?m.color:'var(--text3)',
                  fontSize:11, fontWeight:cat===c?700:400, cursor:'pointer' }},
                m.label
              );
            })
          )
        ),

        // Submitted by — feature request only
        isFR && div({ style:{ marginBottom:14 }},
          div({ style:{ fontSize:'10px', fontWeight:700, color:'var(--text3)',
            textTransform:'uppercase', letterSpacing:'.5px', marginBottom:6 }}, 'Your Name'),
          h('input', { value:submittedBy, onChange:e=>setSubmittedBy(e.target.value),
            placeholder:'Optional — leave blank to submit anonymously',
            style:{ width:'100%', background:'var(--mid2)', border:'.5px solid var(--bdr)',
              borderRadius:8, color:'var(--text)', fontSize:13, padding:'10px 14px',
              fontFamily:'inherit', boxSizing:'border-box', outline:'none' }})
        ),

        // Description
        div({ style:{ marginBottom:14 }},
          div({ style:{ fontSize:'10px', fontWeight:700, color:'var(--text3)',
            textTransform:'uppercase', letterSpacing:'.5px', marginBottom:6 }},
            'Description'),
          h('textarea', { value:desc, onChange:e=>setDesc(e.target.value),
            placeholder: isFR ? 'More context, use case, or example…' : 'What exactly should be built or changed?',
            rows:3,
            style:{ width:'100%', background:'var(--mid2)', border:'.5px solid var(--bdr)',
              borderRadius:8, color:'var(--text)', fontSize:13, padding:'10px 14px',
              resize:'none', fontFamily:'inherit', boxSizing:'border-box', outline:'none' }})
        ),

        // Notes for AI — task only
        !isFR && div({ style:{ marginBottom:20 }},
          div({ style:{ fontSize:'10px', fontWeight:700, color:'var(--text3)',
            textTransform:'uppercase', letterSpacing:'.5px', marginBottom:6 }},
            'Notes for AI  '),
          div({ style:{ fontSize:'10px', color:'var(--text3)', marginBottom:6 }},
            'Constraints, links, context the agent needs before starting'),
          h('textarea', { value:notes, onChange:e=>setNotes(e.target.value),
            placeholder:'e.g. "Don\'t touch the FOB parser. PR into a feature branch only."',
            rows:2,
            style:{ width:'100%', background:'var(--mid2)', border:'.5px solid var(--bdr)',
              borderRadius:8, color:'var(--text)', fontSize:13, padding:'10px 14px',
              resize:'none', fontFamily:'inherit', boxSizing:'border-box', outline:'none' }})
        ),

        // Buttons
        div({ style:{ display:'flex', gap:10 }},
          btn({ onClick:onClose,
            style:{ flex:1, padding:'14px', borderRadius:10,
              border:'.5px solid var(--bdr)', background:'transparent',
              color:'var(--text3)', fontSize:14, fontWeight:600, cursor:'pointer' }},
            'Cancel'),
          btn({ onClick:submit, disabled:!title.trim()||saving,
            style:{ flex:2, padding:'14px', borderRadius:10,
              border:'none', background:title.trim()?'var(--gold)':'rgba(245,188,0,.3)',
              color:title.trim()?'#0f1117':'rgba(245,188,0,.5)',
              fontSize:14, fontWeight:800, cursor:title.trim()?'pointer':'default' }},
            saving?'Adding…':(isFR?'Submit Request':'Add Task'))
        )
      )
    )
  );
}

// ── SessionNotesTab ───────────────────────────────────────────────────────────
function SessionNotesTab() {
  const [notes, setNotes]     = useState([]);
  const [body, setBody]       = useState('');
  const [saving, setSaving]   = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const rows = await loadSessionNotes();
    setNotes(rows);
    setLoading(false);
  }, []);

  useEffect(()=>{ refresh(); },[]);

  const submit = async () => {
    if (!body.trim()) return;
    setSaving(true);
    await saveSessionNote(body.trim());
    setBody('');
    await refresh();
    setSaving(false);
  };

  const consume = async (id) => {
    await markNoteConsumed(id);
    setNotes(n => n.map(x => x.id===id ? {...x,consumed:true} : x));
  };

  return div({ style:{ padding:'0 0 80px' }},
    div({ style:{ padding:'16px 16px 12px', borderBottom:'.5px solid var(--bdr)' }},
      div({ style:{ fontSize:13, fontWeight:800, color:'var(--text)', marginBottom:4 }},
        '📝 Notes for Next AI Session'),
      div({ style:{ fontSize:'11px', color:'var(--text3)', lineHeight:1.5, marginBottom:12 }},
        'Drop context here — priorities, what\'s changed at stores, things to avoid, links. The autonomous agent reads these before starting any session.'),
      h('textarea', {
        value:body, onChange:e=>setBody(e.target.value),
        placeholder:'e.g. "Focus on mobile UI this week. Ardmore store had a POS swap 7/10 — data gap expected. Don\'t modify the forecast engine."',
        rows:4,
        style:{ width:'100%', background:'var(--mid2)', border:`.5px solid ${body?'var(--gold)':'var(--bdr)'}`,
          borderRadius:10, color:'var(--text)', fontSize:13, padding:'12px 14px',
          resize:'none', fontFamily:'inherit', boxSizing:'border-box', outline:'none' }
      }),
      btn({ onClick:submit, disabled:!body.trim()||saving,
        style:{ marginTop:10, width:'100%', padding:'13px',
          borderRadius:10, border:'none',
          background:body.trim()?'var(--gold)':'rgba(245,188,0,.25)',
          color:body.trim()?'#0f1117':'rgba(245,188,0,.5)',
          fontSize:14, fontWeight:800, cursor:body.trim()?'pointer':'default' }},
        saving?'Saving…':'Save Note')
    ),

    div({ style:{ padding:'12px 16px 8px' }},
      div({ style:{ fontSize:'10px', fontWeight:700, color:'var(--text3)',
        textTransform:'uppercase', letterSpacing:'.5px', marginBottom:10 }},
        loading?'Loading…':`${notes.length} notes`),
      loading
        ? div({ style:{ color:'var(--text3)', fontSize:12, textAlign:'center', padding:24 }}, 'Loading…')
        : notes.length===0
          ? div({ style:{ color:'var(--text3)', fontSize:12, padding:'24px 0', textAlign:'center' }},
              'No notes yet. Drop context above before your next session.')
          : notes.map(n =>
              div({ key:n.id, style:{ marginBottom:10, padding:'12px 14px', borderRadius:8,
                background:n.consumed?'transparent':'rgba(245,188,0,.04)',
                border:`.5px solid ${n.consumed?'var(--bdr)':'rgba(245,188,0,.2)'}` }},
                div({ style:{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }},
                  div({ style:{ fontSize:12, color:n.consumed?'var(--text3)':'var(--text)',
                    lineHeight:1.5, flex:1, whiteSpace:'pre-wrap' }}, n.body),
                  div({ style:{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:6, flexShrink:0 }},
                    span({ style:{ fontSize:'9px', color:'var(--text3)', whiteSpace:'nowrap' }},
                      timeAgo(n.created_at)),
                    !n.consumed && btn({ onClick:()=>consume(n.id),
                      style:{ fontSize:'9px', padding:'3px 8px', borderRadius:4,
                        border:'.5px solid var(--bdr2)', background:'transparent',
                        color:'var(--text3)', cursor:'pointer' }},
                      '✓ Mark read')
                  )
                ),
                n.consumed && span({ style:{ fontSize:'9px', color:'var(--text3)', marginTop:4, display:'block' }},
                  '✓ Consumed by agent')
              )
            )
    )
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────────
// initialType: 'feature_request' | 'task' | null — pre-selects the type filter, used by App.js's
// ?modal=feature-requests redirect so the old deep link still lands on Feature Request content.
export function TaskQueuePanel({ onClose, settings, initialType }) {
  const isDev = settings?.role === 'developer' || settings?.role === 'admin';

  const [tab,     setTab]     = useState('queue');
  const [items,   setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [filter,  setFilter]  = useState('active'); // 'active' | 'done' | 'all' | 1 | 2 | 3 (tier, task-only)
  const [typeFilter, setTypeFilter] = useState(initialType==='feature_request'?'feature_request':'all'); // 'all' | 'task' | 'feature_request'
  const [catFilter, setCatFilter] = useState('all');
  const [searchText, setSearchText] = useState('');
  const [votedIds, setVotedIds] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('mf_voted_reqs') || '[]')); }
    catch { return new Set(); }
  });

  const refresh = useCallback(async () => {
    setLoading(true);
    const [taskRows, frRows] = await Promise.all([loadTasks(), loadFeatureRequests()]);
    const normTasks = taskRows.map(normalizeTaskRow);
    const normFR    = frRows.map(r => normalizeFRRow(r, 'feature_requests'));
    // A `tasks` row that has already been migrated to type:'feature_request' (post schema
    // migration) wins over a same-titled legacy `feature_requests` row, so the two never
    // double-render once the owner runs the migration script.
    const migratedFRTitles = new Set(normTasks.filter(t=>t.type==='feature_request').map(t=>t.title));
    const dedupedFR = normFR.filter(r => !migratedFRTitles.has(r.title));
    const liveFRTitles = new Set([...dedupedFR, ...normTasks].map(r=>r.title));
    const seedToShow = SEED_ITEMS.filter(s => !liveFRTitles.has(s.title));
    const normSeed = seedToShow.map(s => normalizeFRRow(s, 'seed'));
    setItems([...normTasks, ...dedupedFR, ...normSeed]);
    setLoading(false);
  }, []);

  useEffect(()=>{ refresh(); },[]);

  const handleUpdate = useCallback(async (item, updates) => {
    if (item._src === 'seed') return; // historical, never persisted
    if (item._src === 'feature_requests') {
      if (!isDev && updates.dev_notes === undefined && updates.status === undefined) { /* allow (non-dev fields, none in this UI though) */ }
      const updated = await updateFeatureRequest(item.id, updates);
      if (updated) setItems(prev => prev.map(x => (x._src==='feature_requests'&&x.id===item.id) ? normalizeFRRow(updated,'feature_requests') : x));
      return;
    }
    await updateTask(item.id, updates);
    setItems(prev => prev.map(x => (x._src==='tasks'&&x.id===item.id) ? {...x,...updates} : x));
  },[isDev]);

  const handleDelete = useCallback(async (item) => {
    if (item._src !== 'tasks') return; // Feature Requests were never delete-able from this panel; only Tasks were
    await updateTask(item.id, { status:'scrapped' });
    setItems(prev => prev.filter(x => !(x._src==='tasks'&&x.id===item.id)));
  },[]);

  const handleVote = useCallback(async (item) => {
    const key = item.id || item.title;
    if (votedIds.has(key)) return;
    const newVoted = new Set(votedIds); newVoted.add(key);
    setVotedIds(newVoted);
    localStorage.setItem('mf_voted_reqs', JSON.stringify([...newVoted]));
    if (item._src === 'feature_requests') {
      const updated = await voteFeatureRequest(item.id, item.votes || 0);
      if (updated) setItems(prev => prev.map(x => (x._src==='feature_requests'&&x.id===item.id) ? normalizeFRRow(updated,'feature_requests') : x));
    }
    // seed / tasks-sourced FR rows: local-only vote tally (matches the original panel's behavior
    // for seed items — no persistence target for those).
  },[votedIds]);

  const handleSaveTask = useCallback(async (task) => {
    const saved = await saveTask(task); // no `type` key — DB default ('task', once migrated) or simply absent, both read as 'task'
    if (saved) {
      setItems(prev => [...prev, normalizeTaskRow(saved)].sort((a,b)=>a.priority-b.priority||new Date(a.created_at)-new Date(b.created_at)));
      return true;
    }
    return false; // saveTask already console.warn'd the Supabase error — surface it to the user too
  },[]);

  const handleSaveFR = useCallback(async (req) => {
    const saved = await saveFeatureRequest(req);
    if (saved) {
      setItems(prev => [normalizeFRRow(saved,'feature_requests'), ...prev]);
      return true;
    }
    return false;
  },[]);

  const filtered = items.filter(t => {
    if (typeFilter!=='all' && t.type!==typeFilter) return false;
    if (catFilter!=='all' && (t.category||null)!==catFilter) return false;
    if (filter==='active') { if (t.status==='done'||t.status==='completed'||t.status==='declined') return false; }
    else if (filter==='done') { if (!(t.status==='done'||t.status==='completed'||t.status==='declined')) return false; }
    else if (typeof filter==='number') { if (t.type!=='task' || t.priority!==filter) return false; } // filter here is actually priority for the 1/2/3 chips, kept as tier-labeled chips below for continuity with the original UI's T1/T2/T3 language on task priority... see filterPills
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      const hay = (t.title+' '+(t.description||'')+' '+(t.submitted_by||'')).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const activeCt  = items.filter(t=>!(t.status==='done'||t.status==='completed'||t.status==='declined')).length;
  const taskCt    = items.filter(t=>t.type==='task').length;
  const frCt      = items.filter(t=>t.type==='feature_request').length;
  const highCt    = items.filter(t=>t.priority===1&&!(t.status==='done'||t.status==='completed'||t.status==='declined')).length;

  // ── Stats bar ──
  const statBar = () => div({ style:{ display:'flex', gap:12, padding:'10px 16px',
    borderBottom:'.5px solid var(--bdr)', flexWrap:'wrap' }},
    ...[
      { label:'Active',   val:activeCt,       col:'var(--text)' },
      { label:'🔧 Tasks',  val:taskCt,         col:TYPE_META.task.color },
      { label:'💡 Requests', val:frCt,         col:TYPE_META.feature_request.color },
      { label:'🔴 High',  val:highCt,         col:'#ef4444' },
    ].map((s,i) =>
      div({ key:i, style:{ textAlign:'center' }},
        div({ style:{ fontSize:18, fontWeight:800, color:s.col, fontFamily:'var(--mono)' }}, s.val),
        div({ style:{ fontSize:'9px', color:'var(--text3)', marginTop:1 }}, s.label)
      )
    )
  );

  // ── Type filter pills ──
  const typeFilterPills = () => div({ style:{ display:'flex', gap:6, padding:'10px 16px 0' }},
    ...[
      { key:'all', label:'All' },
      { key:'task', label:TYPE_META.task.label },
      { key:'feature_request', label:TYPE_META.feature_request.label },
    ].map(f =>
      btn({ key:f.key, onClick:()=>setTypeFilter(f.key),
        style:{ padding:'7px 14px', borderRadius:99, whiteSpace:'nowrap',
          border:`.5px solid ${typeFilter===f.key?'var(--gold)':'var(--bdr)'}`,
          background:typeFilter===f.key?'rgba(245,188,0,.12)':'transparent',
          color:typeFilter===f.key?'var(--gold)':'var(--text3)',
          fontSize:12, fontWeight:typeFilter===f.key?700:400, cursor:'pointer' }},
        f.label)
    )
  );

  // ── Status/tier filter pills ──
  const filterPills = () => div({ style:{ display:'flex', gap:6, padding:'10px 16px',
    overflowX:'auto', flexWrap:'nowrap', borderBottom:'.5px solid var(--bdr)' }},
    ...([
      { key:'active', label:'Active' },
      { key:'all',    label:'All' },
      { key:'done',   label:'Done' },
      ...(typeFilter==='feature_request' ? [] : [
        { key:1, label:'High' },
        { key:2, label:'Medium' },
        { key:3, label:'Low' },
      ]),
    ].map(f =>
      btn({ key:f.key, onClick:()=>setFilter(f.key),
        style:{ padding:'7px 14px', borderRadius:99, whiteSpace:'nowrap',
          border:`.5px solid ${filter===f.key?'var(--gold)':'var(--bdr)'}`,
          background:filter===f.key?'rgba(245,188,0,.12)':'transparent',
          color:filter===f.key?'var(--gold)':'var(--text3)',
          fontSize:12, fontWeight:filter===f.key?700:400, cursor:'pointer' }},
        f.label)
    )),
    h('input', { value:searchText, onChange:e=>setSearchText(e.target.value),
      placeholder:'Search…', style:{ marginLeft:'auto', fontSize:'11px', padding:'5px 10px',
        background:'var(--surf2)', border:'.5px solid var(--bdr)', borderRadius:99,
        color:'var(--text)', outline:'none', width:110, flexShrink:0 }})
  );

  // ── Category filter pills — only shown once at least one item is categorized ──
  const presentCats = [...new Set(items.map(t=>t.category).filter(Boolean))];
  const catFilterPills = () => presentCats.length===0 ? null : div({ style:{ display:'flex', gap:6,
    padding:'0 16px 10px', overflowX:'auto', flexWrap:'nowrap', borderBottom:'.5px solid var(--bdr)' }},
    btn({ onClick:()=>setCatFilter('all'),
      style:{ padding:'5px 12px', borderRadius:99, whiteSpace:'nowrap',
        border:`.5px solid ${catFilter==='all'?'var(--text3)':'var(--bdr)'}`,
        background:catFilter==='all'?'rgba(255,255,255,.06)':'transparent',
        color:catFilter==='all'?'var(--text)':'var(--text3)',
        fontSize:11, fontWeight:catFilter==='all'?700:400, cursor:'pointer' }},
      'All categories'),
    ...presentCats.map(c => {
      const m = CATEGORY_META[c] || CATEGORY_META.other;
      return btn({ key:c, onClick:()=>setCatFilter(c),
        style:{ padding:'5px 12px', borderRadius:99, whiteSpace:'nowrap',
          border:`.5px solid ${catFilter===c?m.color:m.color+'44'}`,
          background:catFilter===c?m.color+'22':'transparent',
          color:catFilter===c?m.color:'var(--text3)',
          fontSize:11, fontWeight:catFilter===c?700:400, cursor:'pointer' }},
        m.label);
    })
  );

  return div({ style:{ position:'fixed', inset:0, zIndex:400, display:'flex',
    flexDirection:'column', background:'var(--bg)' }},

    // ── Header ──
    div({ style:{ display:'flex', alignItems:'center', gap:12, padding:'14px 16px',
      borderBottom:'.5px solid var(--bdr)', background:'var(--surf)', flexShrink:0 }},
      btn({ onClick:onClose,
        style:{ padding:'8px 14px', borderRadius:8, border:'.5px solid var(--bdr)',
          background:'transparent', color:'var(--text3)', fontSize:13,
          fontWeight:600, cursor:'pointer', flexShrink:0 }},
        '← Back'),
      div({ style:{ flex:1 }},
        div({ style:{ fontSize:16, fontWeight:800, color:'var(--text)' }}, '⚡ Task Queue'),
        div({ style:{ fontSize:'10px', color:'var(--text3)', marginTop:1 }},
          'Autonomous + manual work tracking, plus feature requests · vote for what matters most'),
      ),
      activeCt>0 && span({ style:{ background:'rgba(245,188,0,.15)', color:'var(--gold)',
        border:'.5px solid rgba(245,188,0,.3)', borderRadius:99,
        fontSize:11, fontWeight:800, padding:'4px 10px' }},
        activeCt),
    ),

    // ── Tabs ──
    div({ style:{ display:'flex', borderBottom:'.5px solid var(--bdr)', background:'var(--surf)',
      flexShrink:0 }},
      ...['queue','notes'].map(t =>
        btn({ key:t, onClick:()=>setTab(t),
          style:{ flex:1, padding:'12px 0', border:'none', background:'transparent',
            borderBottom:tab===t?'2px solid var(--gold)':'2px solid transparent',
            color:tab===t?'var(--gold)':'var(--text3)',
            fontSize:13, fontWeight:tab===t?700:400, cursor:'pointer' }},
          t==='queue'?'📋 Queue':'📝 AI Notes')
      )
    ),

    // ── Body ──
    div({ style:{ flex:1, overflowY:'auto' }},
      tab==='queue' ? div(null,
        statBar(),
        typeFilterPills(),
        filterPills(),
        catFilterPills(),
        loading
          ? div({ style:{ textAlign:'center', padding:40, color:'var(--text3)' }}, 'Loading…')
          : filtered.length===0
            ? div({ style:{ textAlign:'center', padding:'48px 24px', color:'var(--text3)' }},
                div({ style:{ fontSize:32, marginBottom:12 }}, '✅'),
                div({ style:{ fontSize:14, fontWeight:700, marginBottom:6 }},
                  filter==='done' ? 'Nothing done yet' : 'Queue is clear'),
                filter==='active' && div({ style:{ fontSize:12 }}, 'Tap + to add your first entry')
              )
            : div({ style:{ padding:'10px 12px 80px' }},
                filtered.map(item =>
                  h(TaskCard, { key:(item._src+'-'+(item.id||item.title)), item, isDev, votedIds,
                    onUpdate:handleUpdate, onDelete:handleDelete, onVote:handleVote })
                )
              )
      ) : h(SessionNotesTab)
    ),

    // ── Add button (fixed bottom, queue tab only) ──
    tab==='queue' && btn({ onClick:()=>setShowAdd(true),
      style:{ position:'fixed', bottom:'calc(16px + env(safe-area-inset-bottom,0px))',
        right:16, zIndex:500,
        width:56, height:56, borderRadius:28,
        background:'var(--gold)', border:'none',
        color:'#0f1117', fontSize:28, fontWeight:700,
        cursor:'pointer', boxShadow:'0 4px 20px rgba(245,188,0,.4)',
        display:'flex', alignItems:'center', justifyContent:'center' }},
      '+'),

    showAdd && h(AddEntrySheet, { defaultType:typeFilter==='all'?'task':typeFilter,
      onSaveTask:handleSaveTask, onSaveFR:handleSaveFR, onClose:()=>setShowAdd(false) }),
  );
}
