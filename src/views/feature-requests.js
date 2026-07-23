// @ts-nocheck
import * as React from 'react';
import { loadFeatureRequests, saveFeatureRequest, updateFeatureRequest, voteFeatureRequest } from '../lib/supabase.js';

const h = React.createElement;
const div  = (p,...c) => h('div',  p, ...c);
const span = (p,...c) => h('span', p, ...c);
const btn  = (p,...c) => h('button', p, ...c);

// ── Seed data — historical + planned items from Meridian roadmap ───────────────
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
  { id:'seed-fob-p',   title:'FOB multi-location variance analysis',          category:'Finance',     status:'planned',   priority:'medium', completed_version:'', votes:0, submitted_by:'Fletcher Reaves', description:'Side-by-side FOB component breakdown across stores to identify where food cost overruns originate.' },
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
  { id:'seed-sage-rbac', title:'SAGE — RBAC awareness',                       category:'AI',          status:'planned',   priority:'medium', completed_version:'', votes:0, submitted_by:'Fletcher Reaves', description:'Scope what SAGE sees + recommends by the caller’s role / accessible_locs (needs a sage-chat edge-function redeploy).' },
  { id:'seed-gvp',     title:'Graded-Visit Predictor (CFV / RGR / EcoSure)',  category:'Analytics',   status:'idea',      priority:'high',   completed_version:'', votes:0, submitted_by:'Fletcher Reaves', description:'Flagship: learn the operational pattern preceding graded visits → score pass-likelihood + levers. BLOCKED on an EcoSure data sample.' },
  { id:'seed-dar-more', title:'DAR secondary fields — channel splits, GC anomalies, product-volume', category:'Data', status:'idea', priority:'low', completed_version:'', votes:0, submitted_by:'Fletcher Reaves', description:'Surface dt/is channel splits, GC baseline anomalies, sandwich/fry/beverage projections. Each needs a loader-SELECT widening first.' },
];

const STATUS_META = {
  idea:        { label:'Idea',        color:'#94a3b8', bg:'rgba(148,163,184,.12)' },
  planned:     { label:'Planned',     color:'#60a5fa', bg:'rgba(96,165,250,.12)'  },
  'in-progress':{ label:'In Progress', color:'#f59e0b', bg:'rgba(245,158,11,.12)' },
  completed:   { label:'Completed',   color:'#10b981', bg:'rgba(16,185,129,.12)'  },
  declined:    { label:'Declined',    color:'#ef4444', bg:'rgba(239,68,68,.12)'   },
};

const CATEGORY_COLORS = {
  'AI':          '#a78bfa',
  'Analytics':   '#60a5fa',
  'Data':        '#34d399',
  'Finance':     '#f59e0b',
  'Guest Voice': '#f472b6',
  'Labor':       '#fb923c',
  'UI':          '#38bdf8',
  'General':     '#94a3b8',
};

const CATEGORIES     = ['AI','Analytics','Data','Finance','Guest Voice','Labor','UI','General'];
const STATUSES       = ['idea','planned','in-progress','completed','declined'];
const PRIORITIES     = ['high','medium','low'];
const PRIORITY_COLOR = { high:'#ef4444', medium:'#f59e0b', low:'#94a3b8' };

function StatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META.idea;
  return span({ style:{ fontSize:'7.5px', fontWeight:700, padding:'2px 7px', borderRadius:99,
    background:m.bg, color:m.color, border:`.5px solid ${m.color}55`, whiteSpace:'nowrap' }}, m.label);
}

function CategoryTag({ category }) {
  const c = CATEGORY_COLORS[category] || CATEGORY_COLORS.General;
  return span({ style:{ fontSize:'7px', fontWeight:700, padding:'1px 5px', borderRadius:3,
    background:c+'18', color:c, border:`.5px solid ${c}44` }}, category);
}

function RequestCard({ req, isDev, onVote, onStatusChange, compact }) {
  const [expanded, setExpanded] = React.useState(false);
  const [devNotes, setDevNotes] = React.useState(req.dev_notes || '');
  const [savingNotes, setSavingNotes] = React.useState(false);

  const handleSaveNotes = async () => {
    setSavingNotes(true);
    await onStatusChange(req.id || req.seed_id, { dev_notes: devNotes });
    setSavingNotes(false);
  };

  if (compact) {
    return div({ style:{ background:'var(--surf)', border:'.5px solid var(--bdr)',
      borderRadius:'var(--r)', padding:'7px 10px', marginBottom:5, cursor:'pointer' },
      onClick:()=>setExpanded(e=>!e) },
      div({ style:{ display:'flex', alignItems:'flex-start', gap:5, marginBottom:3 }},
        span({ style:{ fontSize:'10px', fontWeight:700, color:'var(--text)', flex:1, minWidth:0,
          lineHeight:1.3, ...(expanded ? {} : { overflow:'hidden', display:'-webkit-box',
          WebkitLineClamp:2, WebkitBoxOrient:'vertical' }) }}, req.title),
        btn({ style:{ fontSize:'8px', padding:'1px 5px', borderRadius:99, border:'.5px solid var(--bdr)',
          background:'transparent', color:'var(--text3)', cursor:'pointer', flexShrink:0, whiteSpace:'nowrap' },
          onClick:e=>{ e.stopPropagation(); onVote(req); } }, '▲ ' + (req.votes || 0)),
      ),
      div({ style:{ display:'flex', alignItems:'center', gap:4, flexWrap:'wrap' }},
        h(CategoryTag, { category: req.category || 'General' }),
        span({ style:{ fontSize:'7px', color: PRIORITY_COLOR[req.priority]||'#94a3b8',
          textTransform:'uppercase', fontWeight:700 }}, req.priority),
        req.completed_version && span({ style:{ fontSize:'7px', color:'var(--text3)' }}, req.completed_version),
        span({ style:{ fontSize:'7px', color:'var(--text3)' }}, req.submitted_by || 'Anon'),
      ),
      expanded && req.description && div({ style:{ marginTop:5, fontSize:'8.5px', color:'var(--text3)', lineHeight:1.5 }}, req.description),
      expanded && req.dev_notes && div({ style:{ marginTop:4, fontSize:'8.5px', color:'#60a5fa' }},
        span({ style:{ fontWeight:700, marginRight:3 }}, 'Dev:'), req.dev_notes),
      expanded && isDev && div({ style:{ marginTop:6, display:'flex', gap:4, flexWrap:'wrap' }},
        ...STATUSES.map(s => btn({ key:s,
          style:{ fontSize:'7.5px', padding:'1px 6px', borderRadius:99, cursor:'pointer',
            border:`.5px solid ${req.status===s?STATUS_META[s].color+'88':'var(--bdr)'}`,
            background:req.status===s ? STATUS_META[s].bg : 'transparent',
            color:req.status===s ? STATUS_META[s].color : 'var(--text3)' },
          onClick:e=>{ e.stopPropagation(); onStatusChange(req.id || req.seed_id, { status:s }); }
        }, STATUS_META[s].label))
      ),
    );
  }

  return div({ style:{ background:'var(--surf2)', border:'.5px solid var(--bdr)',
    borderRadius:'var(--r)', overflow:'hidden', marginBottom:6 }},
    // Main row
    div({ style:{ padding:'8px 12px', display:'flex', alignItems:'flex-start', gap:8, cursor:'pointer' },
      onClick:()=>setExpanded(e=>!e) },
      div({ style:{ flex:1, minWidth:0 }},
        div({ style:{ display:'flex', alignItems:'center', gap:6, marginBottom:3, flexWrap:'wrap' }},
          span({ style:{ fontWeight:700, fontSize:'11px', color:'var(--text)' }}, req.title),
          h(StatusBadge, { status: req.status }),
          h(CategoryTag, { category: req.category || 'General' }),
          req.completed_version && span({ style:{ fontSize:'7px', color:'var(--text3)' }}, req.completed_version),
        ),
        req.description && span({ style:{ fontSize:'9px', color:'var(--text3)', lineHeight:1.5 }},
          req.description.length > 100 && !expanded
            ? req.description.slice(0, 100) + '…'
            : req.description
        ),
      ),
      // Right side: votes + priority
      div({ style:{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4, flexShrink:0 }},
        btn({ style:{ fontSize:'9px', padding:'2px 6px', borderRadius:99, border:'.5px solid var(--bdr)',
          background:'transparent', color:'var(--text3)', cursor:'pointer', display:'flex', alignItems:'center', gap:3 },
          onClick: e => { e.stopPropagation(); onVote(req); } },
          span(null, '▲'), span(null, req.votes || 0)
        ),
        span({ style:{ fontSize:'7px', color: req.priority==='high'?'#ef4444':req.priority==='medium'?'#f59e0b':'#94a3b8',
          textTransform:'uppercase', fontWeight:700, letterSpacing:'.3px' }}, req.priority),
        span({ style:{ fontSize:'7px', color:'var(--text3)' }}, req.submitted_by || 'Anonymous'),
      )
    ),
    // Expanded section — dev notes + status change
    expanded && div({ style:{ borderTop:'.5px solid var(--bdr)', padding:'8px 12px', display:'flex', flexDirection:'column', gap:8 }},
      req.dev_notes && div({ style:{ fontSize:'9px', color:'#60a5fa', lineHeight:1.5 }},
        span({ style:{ fontWeight:700, marginRight:4 }}, 'Dev notes:'), req.dev_notes),
      isDev && div({ style:{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }},
        span({ style:{ fontSize:'8px', color:'var(--text3)', textTransform:'uppercase', letterSpacing:'.4px' }}, 'Status:'),
        ...STATUSES.map(s => btn({ key:s,
          style:{ fontSize:'8px', padding:'2px 7px', borderRadius:99, cursor:'pointer',
            border:`.5px solid ${req.status===s?STATUS_META[s].color+'88':'var(--bdr)'}`,
            background:req.status===s ? STATUS_META[s].bg : 'transparent',
            color:req.status===s ? STATUS_META[s].color : 'var(--text3)' },
          onClick: e => { e.stopPropagation(); onStatusChange(req.id || req.seed_id, { status: s }); }
        }, STATUS_META[s].label))
      ),
      isDev && div({ style:{ display:'flex', gap:6, alignItems:'flex-start' }},
        h('textarea', { value:devNotes, onChange:e=>setDevNotes(e.target.value),
          placeholder:'Dev notes (visible to all users)…',
          style:{ flex:1, fontSize:'9px', padding:'5px 8px', background:'var(--surf)',
            border:'.5px solid var(--bdr)', borderRadius:'var(--r)', color:'var(--text)',
            resize:'vertical', minHeight:50, fontFamily:'var(--mono)', colorScheme:'dark' }}),
        btn({ style:{ fontSize:'9px', padding:'4px 10px', borderRadius:'var(--r)', cursor:'pointer',
          background:'rgba(96,165,250,.15)', color:'#60a5fa', border:'.5px solid rgba(96,165,250,.3)' },
          onClick: e => { e.stopPropagation(); handleSaveNotes(); } },
          savingNotes ? 'Saving…' : 'Save Notes')
      )
    )
  );
}

function KanbanView({ items, isDev, onVote, onStatusChange }) {
  return div({ style:{ display:'flex', gap:10, overflowX:'auto', padding:'10px 16px', flex:1, alignItems:'flex-start' }},
    ...STATUSES.map(status => {
      const col = items.filter(r => r.status === status);
      const m = STATUS_META[status];
      return div({ key:status, style:{ minWidth:210, flex:'0 0 210px', display:'flex', flexDirection:'column' }},
        div({ style:{ display:'flex', alignItems:'center', gap:6, marginBottom:8 }},
          span({ style:{ fontSize:'9px', fontWeight:700, color:m.color, textTransform:'uppercase', letterSpacing:'.5px' }}, m.label),
          span({ style:{ fontSize:'8px', color:'var(--text3)', background:'rgba(255,255,255,.06)',
            padding:'1px 5px', borderRadius:99, border:'.5px solid var(--bdr)' }}, col.length),
        ),
        col.length === 0
          ? div({ style:{ fontSize:'8px', color:'var(--text3)', textAlign:'center', padding:'20px 0',
              border:'.5px dashed var(--bdr)', borderRadius:'var(--r)' }}, 'Empty')
          : col.map((req, i) => h(RequestCard, { key:req.id||req.title||i, req,
              isDev, onVote, onStatusChange, compact:true }))
      );
    })
  );
}

function SubmitForm({ onSubmit, onCancel }) {
  const [title,   setTitle]   = React.useState('');
  const [desc,    setDesc]    = React.useState('');
  const [cat,     setCat]     = React.useState('General');
  const [priority,setPriority]= React.useState('medium');
  const [name,    setName]    = React.useState('');
  const [saving,  setSaving]  = React.useState(false);
  const [error,   setError]   = React.useState('');

  const handleSubmit = async () => {
    if (!title.trim()) { setError('Title is required.'); return; }
    setSaving(true);
    setError('');
    const req = {
      title: title.trim(),
      description: desc.trim() || null,
      category: cat,
      priority,
      status: 'idea',
      submitted_by: name.trim() || 'Anonymous',
      votes: 0,
      is_seed: false,
    };
    const saved = await onSubmit(req);
    setSaving(false);
    if (!saved) setError('Save failed — check your connection.');
  };

  const inputStyle = { width:'100%', padding:'6px 10px', background:'var(--surf)',
    border:'.5px solid var(--bdr)', borderRadius:'var(--r)', color:'var(--text)',
    fontSize:'10px', colorScheme:'dark', boxSizing:'border-box' };

  return div({ style:{ display:'flex', flexDirection:'column', gap:10 }},
    div({ style:{ display:'flex', flexDirection:'column', gap:3 }},
      span({ style:{ fontSize:'8px', color:'var(--text3)', textTransform:'uppercase', letterSpacing:'.4px' }}, 'Title *'),
      h('input', { value:title, onChange:e=>setTitle(e.target.value), placeholder:'Short, clear feature description…', style:inputStyle })
    ),
    div({ style:{ display:'flex', flexDirection:'column', gap:3 }},
      span({ style:{ fontSize:'8px', color:'var(--text3)', textTransform:'uppercase', letterSpacing:'.4px' }}, 'Description'),
      h('textarea', { value:desc, onChange:e=>setDesc(e.target.value), placeholder:'More context, use case, or example…',
        style:{ ...inputStyle, minHeight:70, resize:'vertical', fontFamily:'inherit' }})
    ),
    div({ style:{ display:'flex', gap:10 }},
      div({ style:{ flex:1, display:'flex', flexDirection:'column', gap:3 }},
        span({ style:{ fontSize:'8px', color:'var(--text3)', textTransform:'uppercase', letterSpacing:'.4px' }}, 'Category'),
        h('select', { value:cat, onChange:e=>setCat(e.target.value), style:{ ...inputStyle, cursor:'pointer' }},
          ...CATEGORIES.map(c => h('option', { key:c, value:c }, c)))
      ),
      div({ style:{ flex:1, display:'flex', flexDirection:'column', gap:3 }},
        span({ style:{ fontSize:'8px', color:'var(--text3)', textTransform:'uppercase', letterSpacing:'.4px' }}, 'Priority'),
        h('select', { value:priority, onChange:e=>setPriority(e.target.value), style:{ ...inputStyle, cursor:'pointer' }},
          ...PRIORITIES.map(p => h('option', { key:p, value:p }, p[0].toUpperCase()+p.slice(1))))
      ),
    ),
    div({ style:{ display:'flex', flexDirection:'column', gap:3 }},
      span({ style:{ fontSize:'8px', color:'var(--text3)', textTransform:'uppercase', letterSpacing:'.4px' }}, 'Your Name'),
      h('input', { value:name, onChange:e=>setName(e.target.value), placeholder:'Optional — leave blank to submit anonymously', style:inputStyle })
    ),
    error && span({ style:{ fontSize:'9px', color:'#ef4444' }}, error),
    div({ style:{ display:'flex', gap:8, justifyContent:'flex-end' }},
      btn({ style:{ fontSize:'10px', padding:'5px 14px', borderRadius:'var(--r)', cursor:'pointer',
        background:'transparent', border:'.5px solid var(--bdr)', color:'var(--text3)' },
        onClick:onCancel }, 'Cancel'),
      btn({ style:{ fontSize:'10px', padding:'5px 14px', borderRadius:'var(--r)', cursor:'pointer',
        background:'var(--accent)', color:'#000', fontWeight:700, border:'none' },
        onClick:handleSubmit, disabled:saving },
        saving ? 'Submitting…' : 'Submit Request')
    )
  );
}

export function FeatureRequestsPanel({ ds, settings, onClose }) {
  const isDev = settings?.role === 'developer' || settings?.role === 'admin';

  const [dbItems,    setDbItems]    = React.useState([]);
  const [loading,    setLoading]    = React.useState(true);
  const [viewMode,   setViewMode]   = React.useState('list');
  const [filterStat, setFilterStat] = React.useState('all');
  const [filterCat,  setFilterCat]  = React.useState('all');
  const [filterPri,  setFilterPri]  = React.useState('all');
  const [filterAge,  setFilterAge]  = React.useState('all');
  const [searchUser, setSearchUser] = React.useState('');
  const [searchText, setSearchText] = React.useState('');
  const [showForm,   setShowForm]   = React.useState(false);
  const [showHow,    setShowHow]    = React.useState(false);
  const [votedIds,   setVotedIds]   = React.useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('mf_voted_reqs') || '[]')); }
    catch { return new Set(); }
  });

  React.useEffect(() => {
    loadFeatureRequests().then(rows => {
      setDbItems(rows);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const dbTitles = new Set(dbItems.map(r => r.title));
  const seedsToShow = SEED_ITEMS.filter(s => !dbTitles.has(s.title));
  const allItems = [...seedsToShow, ...dbItems].sort((a, b) => {
    const order = { 'in-progress':0, planned:1, idea:2, completed:3, declined:4 };
    return (order[a.status]??9) - (order[b.status]??9) || (b.votes||0) - (a.votes||0);
  });

  const ageMs = { '7d':7*86400000, '30d':30*86400000, '90d':90*86400000 };
  const now = Date.now();

  const filtered = allItems.filter(r => {
    if (filterStat !== 'all' && r.status !== filterStat) return false;
    if (filterCat  !== 'all' && (r.category||'General') !== filterCat) return false;
    if (filterPri  !== 'all' && r.priority !== filterPri) return false;
    if (filterAge  !== 'all' && r.created_at && now - new Date(r.created_at).getTime() > ageMs[filterAge]) return false;
    if (searchUser.trim() && !(r.submitted_by||'').toLowerCase().includes(searchUser.trim().toLowerCase())) return false;
    if (searchText.trim()) {
      const t = searchText.trim().toLowerCase();
      if (!(r.title+' '+(r.description||'')).toLowerCase().includes(t)) return false;
    }
    return true;
  });

  const cats = [...new Set(allItems.map(r => r.category || 'General'))].sort();

  const handleVote = async (req) => {
    const id = req.id || req.seed_id || req.title;
    if (votedIds.has(id)) return;
    const newVoted = new Set(votedIds); newVoted.add(id);
    setVotedIds(newVoted);
    localStorage.setItem('mf_voted_reqs', JSON.stringify([...newVoted]));
    if (req.id && !req.id.startsWith('seed-')) {
      const updated = await voteFeatureRequest(req.id, req.votes || 0);
      if (updated) setDbItems(prev => prev.map(r => r.id === updated.id ? updated : r));
    }
  };

  const handleStatusChange = async (id, updates) => {
    if (!isDev) return;
    if (id && !String(id).startsWith('seed-')) {
      const updated = await updateFeatureRequest(id, updates);
      if (updated) setDbItems(prev => prev.map(r => r.id === updated.id ? updated : r));
    }
  };

  const handleSubmit = async (req) => {
    const saved = await saveFeatureRequest(req);
    if (saved) {
      setDbItems(prev => [saved, ...prev]);
      setShowForm(false);
    }
    return saved;
  };

  const counts = {};
  ['all',...STATUSES].forEach(s => {
    counts[s] = s === 'all' ? allItems.length : allItems.filter(r => r.status === s).length;
  });

  const hasFilter = filterStat!=='all'||filterCat!=='all'||filterPri!=='all'||filterAge!=='all'||searchUser||searchText;

  const selStyle = { fontSize:'9px', padding:'2px 6px', background:'var(--surf2)',
    border:'.5px solid var(--bdr)', borderRadius:'var(--r)', color:'var(--text)', colorScheme:'dark', cursor:'pointer' };
  const inpStyle = { fontSize:'9px', padding:'2px 8px', background:'var(--surf2)',
    border:'.5px solid var(--bdr)', borderRadius:'var(--r)', color:'var(--text)', colorScheme:'dark', outline:'none' };

  return div({ style:{ position:'fixed', inset:0, background:'rgba(0,0,0,.82)', zIndex:460,
    display:'flex', flexDirection:'column', paddingTop:20 }},
    div({ style:{ flex:'0 0 20px', cursor:'pointer' }, onClick:onClose }),
    div({ style:{ flex:1, background:'var(--surf)', maxWidth:viewMode==='kanban'?1120:860, margin:'0 auto',
      width:'calc(100% - 32px)', borderRadius:'var(--rl) var(--rl) 0 0',
      display:'flex', flexDirection:'column', overflow:'hidden', boxShadow:'0 -8px 40px rgba(0,0,0,.4)' }},

      // Header
      div({ style:{ padding:'10px 16px', borderBottom:'.5px solid var(--bdr)', flexShrink:0,
        background:'var(--surf2)', display:'flex', alignItems:'center', gap:10 }},
        span({ style:{ fontSize:'18px' }}, '💡'),
        div({ style:{ flex:1 }},
          div({ style:{ fontSize:'14px', fontWeight:800, color:'var(--text)' }}, 'Feature Requests'),
          div({ style:{ fontSize:'9px', color:'var(--text3)' }},
            `${allItems.length} items · vote for what matters most · ideas shape the roadmap`)
        ),
        div({ style:{ display:'flex', borderRadius:'var(--r)', border:'.5px solid var(--bdr)', overflow:'hidden', marginRight:8 }},
          ...['list','kanban'].map(v => btn({ key:v,
            style:{ fontSize:'9px', padding:'3px 10px', cursor:'pointer', border:'none',
              background:viewMode===v?'rgba(245,188,0,.18)':'transparent',
              color:viewMode===v?'var(--accent)':'var(--text3)', fontWeight:viewMode===v?700:400 },
            onClick:()=>setViewMode(v) },
            v==='list' ? '≡ List' : '⬛ Kanban'))
        ),
        btn({ style:{ fontSize:'10px', padding:'4px 12px', borderRadius:'var(--r)', cursor:'pointer',
          background:'var(--accent)', color:'#000', fontWeight:700, border:'none', marginRight:6 },
          onClick:()=>setShowForm(s=>!s) }, showForm ? '✕ Cancel' : '+ New Request'),
        btn({ className:'btn btn-sm', style:{ color:'var(--text3)' }, onClick:onClose }, '✕')
      ),

      // How-this-works info box
      div({ style:{ borderBottom:'.5px solid var(--bdr)', flexShrink:0,
        background:'rgba(96,165,250,.05)' }},
        div({ style:{ display:'flex', alignItems:'center', gap:8, padding:'7px 16px',
          cursor:'pointer', userSelect:'none' }, onClick:()=>setShowHow(s=>!s) },
          span({ style:{ fontSize:'10px', color:'#60a5fa' }}, showHow ? '▾' : '▸'),
          span({ style:{ fontSize:'10px', fontWeight:700, color:'#60a5fa' }},
            'How to use this queue with Claude Code'),
          span({ style:{ fontSize:'9px', color:'var(--text3)', marginLeft:'auto' }},
            showHow ? 'collapse' : 'expand')
        ),
        showHow && div({ style:{ padding:'0 16px 14px', display:'flex', flexDirection:'column', gap:10 }},
          // Step-by-step
          div({ style:{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }},
            div({ style:{ background:'rgba(255,255,255,.04)', borderRadius:6, padding:'10px 12px',
              border:'.5px solid rgba(96,165,250,.2)' }},
              div({ style:{ fontSize:'10px', fontWeight:700, color:'#60a5fa', marginBottom:6 }},
                '1  Submit a request in this panel'),
              div({ style:{ fontSize:'9px', color:'var(--text2)', lineHeight:1.7 }},
                '• Click "+ New Request" above\n• Fill in Title (required), Description, Category, Priority\n• Hit Submit — it saves to Supabase instantly\n• Status starts as "Idea"')
            ),
            div({ style:{ background:'rgba(255,255,255,.04)', borderRadius:6, padding:'10px 12px',
              border:'.5px solid rgba(245,188,0,.2)' }},
              div({ style:{ fontSize:'10px', fontWeight:700, color:'var(--accent)', marginBottom:6 }},
                '2  Start a Claude Code session'),
              div({ style:{ fontSize:'9px', color:'var(--text2)', lineHeight:1.7 }},
                '• Open Claude Code (Terminal or App)\n• Say: "Check the Feature Requests queue and work on the top items"\n• Or say: "Work on the idea I submitted about [title]"\n• Claude reads the queue, implements, marks done')
            )
          ),
          // Tips row
          div({ style:{ background:'rgba(255,255,255,.03)', borderRadius:6, padding:'10px 12px',
            border:'.5px solid var(--bdr)' }},
            div({ style:{ fontSize:'10px', fontWeight:700, color:'var(--text2)', marginBottom:6 }},
              'Tips for better results'),
            div({ style:{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6 }},
              ...[
                ['Be specific in the title', 'Bad: "Fix the chart". Good: "Record Day Best Week is double-counting Jun 24 data"'],
                ['Use description for context', 'Explain WHY it matters, not just what. Include store numbers, dates, or screenshots if relevant.'],
                ['Set priority intentionally', 'High = breaking/blocking. Medium = important but not urgent. Low = nice to have.'],
              ].map(([h2,b],i)=>div({key:i, style:{fontSize:'9px',color:'var(--text2)',lineHeight:1.6}},
                span({style:{fontWeight:700,color:'var(--text)',display:'block',marginBottom:2}},h2),b))
            )
          ),
          // Dev CLI note (only show to dev/admin)
          isDev && div({ style:{ background:'rgba(16,185,129,.05)', borderRadius:6, padding:'10px 12px',
            border:'.5px solid rgba(16,185,129,.2)' }},
            div({ style:{ fontSize:'10px', fontWeight:700, color:'#10b981', marginBottom:6 }},
              'CLI Reference (Developer)'),
            div({ style:{ fontFamily:'var(--mono)', fontSize:'8.5px', color:'#10b981',
              lineHeight:1.9, whiteSpace:'pre' }},
              'node scripts/features.mjs list                     # see all queue items\n' +
              'node scripts/features.mjs list --status=idea       # only new ideas\n' +
              'node scripts/features.mjs add --title="..." --priority=high --category=Analytics\n' +
              'node scripts/features.mjs update <id> --status=completed --completed_version=v4.x\n' +
              'node scripts/features.mjs sync-memory              # refresh memory file from DB\n\n' +
              'Requires SUPABASE_SERVICE_ROLE_KEY in .env.local\n' +
              '(Supabase Dashboard → Settings → API → service_role secret)'
            )
          )
        )
      ),

      // Submit form
      showForm && div({ style:{ padding:'14px 16px', borderBottom:'.5px solid var(--bdr)',
        background:'rgba(245,188,0,.04)', flexShrink:0 }},
        h(SubmitForm, { onSubmit:handleSubmit, onCancel:()=>setShowForm(false) })
      ),

      // Filter bar
      div({ style:{ padding:'8px 16px', borderBottom:'.5px solid var(--bdr)', flexShrink:0,
        display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }},
        // Status pills — hidden in kanban (columns are the status)
        viewMode === 'list' && div({ style:{ display:'flex', gap:3, flexWrap:'wrap' }},
          ...['all', ...STATUSES].map(s => {
            const m = s === 'all' ? { label:'All', color:'var(--text2)', bg:'rgba(255,255,255,.06)' } : STATUS_META[s];
            const active = filterStat === s;
            return btn({ key:s, style:{ fontSize:'8.5px', padding:'2px 8px', borderRadius:99, cursor:'pointer',
              border:`.5px solid ${active ? m.color+'88' : 'var(--bdr)'}`,
              background:active ? m.bg : 'transparent',
              color:active ? m.color : 'var(--text3)', fontWeight:active ? 700 : 400 },
              onClick:()=>setFilterStat(s) },
              m.label + (counts[s] ? ` (${counts[s]})` : ''))
          })
        ),
        div({ style:{ display:'flex', gap:6, flexWrap:'wrap', marginLeft:'auto', alignItems:'center' }},
          h('select', { value:filterPri, onChange:e=>setFilterPri(e.target.value), style:selStyle },
            h('option',{value:'all'},'Priority: All'),
            ...PRIORITIES.map(p=>h('option',{key:p,value:p},p[0].toUpperCase()+p.slice(1)))),
          h('select', { value:filterCat, onChange:e=>setFilterCat(e.target.value), style:selStyle },
            h('option',{value:'all'},'Category: All'),
            ...cats.map(c=>h('option',{key:c,value:c},c))),
          h('select', { value:filterAge, onChange:e=>setFilterAge(e.target.value), style:selStyle },
            h('option',{value:'all'},'Any date'),
            h('option',{value:'7d'},'Last 7 days'),
            h('option',{value:'30d'},'Last 30 days'),
            h('option',{value:'90d'},'Last 90 days')),
          h('input',{ value:searchUser, onChange:e=>setSearchUser(e.target.value),
            placeholder:'Submitter…', style:{...inpStyle,width:90} }),
          h('input',{ value:searchText, onChange:e=>setSearchText(e.target.value),
            placeholder:'Search…', style:{...inpStyle,width:110} }),
          hasFilter && btn({ style:{ fontSize:'8px', padding:'2px 8px', borderRadius:99, cursor:'pointer',
            border:'.5px solid var(--bdr)', background:'transparent', color:'var(--text3)' },
            onClick:()=>{ setFilterStat('all');setFilterCat('all');setFilterPri('all');
              setFilterAge('all');setSearchUser('');setSearchText(''); }
          }, '✕ Clear'),
        )
      ),

      // Content — list or kanban
      viewMode === 'kanban'
        ? h(KanbanView, { items:filtered, isDev, onVote:handleVote, onStatusChange:handleStatusChange })
        : div({ style:{ flex:1, overflowY:'auto', padding:'10px 16px' }},
            loading && div({ style:{ textAlign:'center', color:'var(--text3)', padding:40 }}, 'Loading…'),
            !loading && filtered.length === 0 && div({ style:{ textAlign:'center', color:'var(--text3)', padding:40 }},
              'No items match the current filter.'),
            !loading && filtered.map((req, i) =>
              h(RequestCard, { key:req.id||req.title||i, req,
                isDev, onVote:handleVote, onStatusChange:handleStatusChange })
            ),
            isDev && !loading && div({ style:{ marginTop:8, padding:'6px 10px', fontSize:'8px',
              color:'var(--text3)', borderTop:'.5px solid var(--bdr)', textAlign:'center', lineHeight:1.6 }},
              'Dev mode: click any card to expand status controls and notes.')
          )
    )
  );
}
