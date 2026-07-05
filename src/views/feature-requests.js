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
  // Planned
  { id:'seed-sage-tl', title:'SAGE tool use — live Supabase queries',         category:'AI',          status:'planned',   priority:'high',   completed_version:'', votes:0, submitted_by:'Fletcher Reaves', description:'SAGE queries Supabase directly for live numbers instead of relying on context window data injection.' },
  { id:'seed-sage-mm', title:'SAGE cross-device session memory',              category:'AI',          status:'planned',   priority:'medium', completed_version:'', votes:0, submitted_by:'Fletcher Reaves', description:'Conversation retention and context across devices and sessions for continuity.' },
  { id:'seed-osat',    title:'Performance Review OSAT auto-fill polish',      category:'Analytics',   status:'planned',   priority:'medium', completed_version:'', votes:0, submitted_by:'Fletcher Reaves', description:'Preview SMG data being auto-filled; show which months have coverage; handle multi-month reviews cleanly.' },
  { id:'seed-beta',    title:'Beta operator onboarding',                      category:'Data',        status:'planned',   priority:'high',   completed_version:'', votes:0, submitted_by:'Fletcher Reaves', description:'Onboard a second trusted operator to Meridian beta. RBAC, restricted panel set, their own Supabase RLS config.' },
  { id:'seed-fob-p',   title:'FOB multi-location variance analysis',          category:'Finance',     status:'planned',   priority:'medium', completed_version:'', votes:0, submitted_by:'Fletcher Reaves', description:'Side-by-side FOB component breakdown across stores to identify where food cost overruns originate.' },
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

const CATEGORIES = ['AI','Analytics','Data','Finance','Guest Voice','Labor','UI','General'];
const STATUSES   = ['idea','planned','in-progress','completed','declined'];
const PRIORITIES = ['high','medium','low'];

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

function RequestCard({ req, isDev, onVote, onStatusChange }) {
  const [expanded, setExpanded] = React.useState(false);
  const [editStatus, setEditStatus] = React.useState(false);
  const [devNotes, setDevNotes] = React.useState(req.dev_notes || '');
  const [savingNotes, setSavingNotes] = React.useState(false);

  const handleSaveNotes = async () => {
    setSavingNotes(true);
    await onStatusChange(req.id || req.seed_id, { dev_notes: devNotes });
    setSavingNotes(false);
  };

  const isSeed = req.is_seed || req.id?.startsWith('seed-');

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
  const [filterStat, setFilterStat] = React.useState('all');
  const [filterCat,  setFilterCat]  = React.useState('all');
  const [showForm,   setShowForm]   = React.useState(false);
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

  // Merge seed + DB items (DB items with is_seed=true replace seed constants by seed_id matching title)
  const dbIds = new Set(dbItems.map(r => r.title));
  const seedsToShow = SEED_ITEMS.filter(s => !dbIds.has(s.title));
  const allItems = [...seedsToShow, ...dbItems].sort((a, b) => {
    const order = { 'in-progress':0, planned:1, idea:2, completed:3, declined:4 };
    return (order[a.status]??9) - (order[b.status]??9) || (b.votes||0) - (a.votes||0);
  });

  const filtered = allItems.filter(r =>
    (filterStat === 'all' || r.status === filterStat) &&
    (filterCat  === 'all' || r.category === filterCat)
  );

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
    } else {
      // Seed item — optimistic local only (no DB id yet)
      setDbItems(prev => prev.map(r => r.id === req.id ? { ...r, votes:(r.votes||0)+1 } : r));
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

  return div({ style:{ position:'fixed', inset:0, background:'rgba(0,0,0,.82)', zIndex:460,
    display:'flex', flexDirection:'column', paddingTop:20 }},
    div({ style:{ flex:'0 0 20px', cursor:'pointer' }, onClick:onClose }),
    div({ style:{ flex:1, background:'var(--surf)', maxWidth:860, margin:'0 auto',
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
        btn({ style:{ fontSize:'10px', padding:'4px 12px', borderRadius:'var(--r)', cursor:'pointer',
          background:'var(--accent)', color:'#000', fontWeight:700, border:'none', marginRight:6 },
          onClick:()=>setShowForm(s=>!s) }, showForm ? '✕ Cancel' : '+ New Request'),
        btn({ className:'btn btn-sm', style:{ color:'var(--text3)' }, onClick:onClose }, '✕')
      ),

      // Submit form
      showForm && div({ style:{ padding:'14px 16px', borderBottom:'.5px solid var(--bdr)',
        background:'rgba(245,188,0,.04)', flexShrink:0 }},
        h(SubmitForm, { onSubmit:handleSubmit, onCancel:()=>setShowForm(false) })
      ),

      // Filter bar
      div({ style:{ padding:'8px 16px', borderBottom:'.5px solid var(--bdr)', flexShrink:0,
        display:'flex', gap:12, flexWrap:'wrap', alignItems:'center' }},
        div({ style:{ display:'flex', gap:3, flexWrap:'wrap' }},
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
        div({ style:{ display:'flex', gap:3, flexWrap:'wrap', marginLeft:'auto', alignItems:'center' }},
          span({ style:{ fontSize:'7.5px', color:'var(--text3)', marginRight:2 }}, 'Category:'),
          h('select', { value:filterCat, onChange:e=>setFilterCat(e.target.value),
            style:{ fontSize:'9px', padding:'2px 6px', background:'var(--surf2)',
              border:'.5px solid var(--bdr)', borderRadius:'var(--r)', color:'var(--text)', colorScheme:'dark', cursor:'pointer' }},
            h('option', { value:'all' }, 'All'),
            ...cats.map(c => h('option', { key:c, value:c }, c)))
        )
      ),

      // List
      div({ style:{ flex:1, overflowY:'auto', padding:'10px 16px' }},
        loading && div({ style:{ textAlign:'center', color:'var(--text3)', padding:40 }}, 'Loading…'),
        !loading && filtered.length === 0 && div({ style:{ textAlign:'center', color:'var(--text3)', padding:40 }},
          'No items match the current filter.'),
        !loading && filtered.map((req, i) =>
          h(RequestCard, { key: req.id || req.title || i, req,
            isDev, onVote:handleVote, onStatusChange:handleStatusChange })
        ),
        isDev && !loading && div({ style:{ marginTop:8, padding:'6px 10px', fontSize:'8px',
          color:'var(--text3)', borderTop:'.5px solid var(--bdr)', textAlign:'center',
          lineHeight:1.6 }},
          'Dev mode: click any card to expand status controls and notes.')
      )
    )
  );
}
