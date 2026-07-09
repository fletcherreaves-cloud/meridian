// @ts-nocheck
import * as React from 'react';
import { loadTasks, saveTask, updateTask, loadSessionNotes, saveSessionNote, markNoteConsumed } from '../lib/supabase.js';

const h   = React.createElement;
const div  = (p,...c) => h('div',   p, ...c);
const span = (p,...c) => h('span',  p, ...c);
const btn  = (p,...c) => h('button',p, ...c);

const { useState, useEffect, useRef, useCallback } = React;

// ── Constants ─────────────────────────────────────────────────────────────────
const TIER_META = {
  1: { label:'T1', desc:'Config / copy / minor UI — auto-safe', color:'#10b981', bg:'rgba(16,185,129,.15)' },
  2: { label:'T2', desc:'New feature / logic change — PR + review', color:'#f59e0b', bg:'rgba(245,158,11,.15)' },
  3: { label:'T3', desc:'Infra / schema / auth — human only', color:'#ef4444', bg:'rgba(239,68,68,.15)' },
};

const PRI_META = {
  1: { label:'High',   color:'#ef4444', dot:'🔴' },
  2: { label:'Medium', color:'#f59e0b', dot:'🟡' },
  3: { label:'Low',    color:'#94a3b8', dot:'🟢' },
};

const STATUS_META = {
  backlog:     { label:'Backlog',     color:'#94a3b8', bg:'rgba(148,163,184,.12)' },
  ready:       { label:'Ready',       color:'#60a5fa', bg:'rgba(96,165,250,.12)'  },
  in_progress: { label:'In Progress', color:'#f59e0b', bg:'rgba(245,158,11,.12)'  },
  done:        { label:'Done',        color:'#10b981', bg:'rgba(16,185,129,.12)'  },
  blocked:     { label:'Blocked',     color:'#ef4444', bg:'rgba(239,68,68,.12)'   },
};

const STATUSES = ['backlog','ready','in_progress','done','blocked'];

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

// ── TaskCard ──────────────────────────────────────────────────────────────────
function TaskCard({ task, onUpdate, onDelete }) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState(task.notes || '');
  const [savingNotes, setSavingNotes] = useState(false);
  const pri = PRI_META[task.priority] || PRI_META[2];
  const tierColor = (TIER_META[task.tier] || TIER_META[1]).color;

  const saveNotes = async () => {
    setSavingNotes(true);
    await onUpdate(task.id, { notes });
    setSavingNotes(false);
  };

  return div({ style:{ borderRadius:8, overflow:'hidden', marginBottom:8,
    border:`.5px solid rgba(255,255,255,.08)`, background:'var(--surf2)',
    borderLeft:`3px solid ${tierColor}` }},

    // ── Collapsed row ──
    div({ onClick:()=>setOpen(o=>!o),
      style:{ display:'flex', alignItems:'center', gap:10, padding:'12px 14px',
        cursor:'pointer', minHeight:44 }},
      span({ style:{ fontSize:13, flexShrink:0 }}, pri.dot),
      div({ style:{ flex:1, minWidth:0 }},
        div({ style:{ fontSize:13, fontWeight:600, color:'var(--text)',
          whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}, task.title),
        task.description && !open && div({ style:{ fontSize:10, color:'var(--text3)',
          whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', marginTop:2 }},
          task.description),
      ),
      div({ style:{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }},
        h(TierBadge, { tier:task.tier }),
        h(StatusBadge, { status:task.status }),
        span({ style:{ fontSize:12, color:'var(--text3)', marginLeft:2 }}, open?'▲':'▼'),
      ),
    ),

    // ── Expanded ──
    open && div({ style:{ padding:'0 14px 14px', borderTop:'.5px solid rgba(255,255,255,.06)' }},

      task.description && div({ style:{ fontSize:12, color:'var(--text2)', lineHeight:1.5,
        padding:'10px 0 12px' }}, task.description),

      // Priority buttons
      div({ style:{ marginBottom:12 }},
        div({ style:{ fontSize:'9px', fontWeight:700, color:'var(--text3)',
          textTransform:'uppercase', letterSpacing:'.5px', marginBottom:6 }}, 'Priority'),
        div({ style:{ display:'flex', gap:8 }},
          ...Object.entries(PRI_META).map(([p, m]) =>
            btn({ key:p, onClick:()=>onUpdate(task.id,{priority:+p}),
              style:{ flex:1, padding:'10px 0', borderRadius:8, border:`.5px solid ${task.priority===+p?m.color:m.color+'44'}`,
                background:task.priority===+p?m.color+'22':'transparent',
                color:task.priority===+p?m.color:'var(--text3)',
                fontSize:12, fontWeight:task.priority===+p?800:500, cursor:'pointer',
                display:'flex', flexDirection:'column', alignItems:'center', gap:3 }},
              span(null, m.dot), span({ style:{fontSize:9}}, m.label)
            )
          )
        )
      ),

      // Tier buttons
      div({ style:{ marginBottom:12 }},
        div({ style:{ fontSize:'9px', fontWeight:700, color:'var(--text3)',
          textTransform:'uppercase', letterSpacing:'.5px', marginBottom:6 }}, 'Tier — safety level'),
        div({ style:{ display:'flex', gap:8 }},
          ...Object.entries(TIER_META).map(([t, m]) =>
            btn({ key:t, onClick:()=>onUpdate(task.id,{tier:+t}),
              style:{ flex:1, padding:'8px 4px', borderRadius:8, border:`.5px solid ${task.tier===+t?m.color:m.color+'44'}`,
                background:task.tier===+t?m.color+'22':'transparent',
                color:task.tier===+t?m.color:'var(--text3)',
                fontSize:11, fontWeight:task.tier===+t?800:500, cursor:'pointer' }},
              m.label
            )
          )
        ),
        div({ style:{ fontSize:'9px', color:'var(--text3)', marginTop:4 }},
          (TIER_META[task.tier]||TIER_META[1]).desc)
      ),

      // Status buttons
      div({ style:{ marginBottom:12 }},
        div({ style:{ fontSize:'9px', fontWeight:700, color:'var(--text3)',
          textTransform:'uppercase', letterSpacing:'.5px', marginBottom:6 }}, 'Status'),
        div({ style:{ display:'flex', flexWrap:'wrap', gap:6 }},
          ...STATUSES.map(s => {
            const m = STATUS_META[s];
            return btn({ key:s, onClick:()=>onUpdate(task.id,{status:s}),
              style:{ padding:'8px 12px', borderRadius:99, border:`.5px solid ${task.status===s?m.color:m.color+'44'}`,
                background:task.status===s?m.bg:'transparent',
                color:task.status===s?m.color:'var(--text3)',
                fontSize:11, fontWeight:task.status===s?700:400, cursor:'pointer' }},
              m.label
            );
          })
        )
      ),

      // Notes for this task
      div({ style:{ marginBottom:8 }},
        div({ style:{ fontSize:'9px', fontWeight:700, color:'var(--text3)',
          textTransform:'uppercase', letterSpacing:'.5px', marginBottom:6 }}, 'Notes'),
        h('textarea', {
          value:notes, onChange:e=>setNotes(e.target.value),
          placeholder:'Context, links, clarifications…',
          rows:3,
          style:{ width:'100%', background:'var(--mid2)', border:'.5px solid var(--bdr)',
            borderRadius:6, color:'var(--text)', fontSize:12, padding:'8px 10px',
            resize:'vertical', fontFamily:'inherit', boxSizing:'border-box' }
        }),
        div({ style:{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:6 }},
          task.result_summary && span({ style:{ fontSize:'9px', color:'var(--text3)' }},
            '🤖 '+task.result_summary.slice(0,80)+(task.result_summary.length>80?'…':'')),
          div({ style:{ display:'flex', gap:8, marginLeft:'auto' }},
            btn({ onClick:()=>onDelete(task.id),
              style:{ padding:'6px 12px', borderRadius:6, border:'.5px solid rgba(239,68,68,.3)',
                background:'transparent', color:'#f87171', fontSize:11, cursor:'pointer' }},
              'Remove'),
            btn({ onClick:saveNotes, disabled:savingNotes,
              style:{ padding:'6px 14px', borderRadius:6, border:'.5px solid var(--gold)',
                background:'rgba(245,188,0,.1)', color:'var(--gold)',
                fontSize:11, fontWeight:700, cursor:'pointer' }},
              savingNotes?'Saving…':'Save Notes'),
          )
        )
      ),

      task.result_pr && div({ style:{ fontSize:'9px', color:'#60a5fa', marginTop:4 }},
        '🔗 PR: '+task.result_pr),
      div({ style:{ fontSize:'9px', color:'var(--text3)', marginTop:6 }},
        'Added '+timeAgo(task.created_at)+(task.source&&task.source!=='manual'?' · via '+task.source:'')),
    )
  );
}

// ── AddTaskSheet ──────────────────────────────────────────────────────────────
function AddTaskSheet({ onSave, onClose }) {
  const [title, setTitle]   = useState('');
  const [desc,  setDesc]    = useState('');
  const [tier,  setTier]    = useState(1);
  const [pri,   setPri]     = useState(2);
  const [notes, setNotes]   = useState('');
  const [saving, setSaving] = useState(false);
  const titleRef = useRef(null);

  useEffect(()=>{ setTimeout(()=>titleRef.current?.focus(), 80); },[]);

  const submit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    await onSave({ title:title.trim(), description:desc.trim()||null,
      tier, priority:pri, notes:notes.trim()||null, status:'backlog', source:'manual' });
    onClose();
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

        div({ style:{ fontSize:16, fontWeight:800, color:'var(--text)', marginBottom:16 }},
          'Add Task'),

        // Title
        div({ style:{ marginBottom:14 }},
          div({ style:{ fontSize:'10px', fontWeight:700, color:'var(--text3)',
            textTransform:'uppercase', letterSpacing:'.5px', marginBottom:6 }}, 'Title *'),
          h('input', { ref:titleRef, value:title, onChange:e=>setTitle(e.target.value),
            placeholder:'What needs to be done?',
            onKeyDown:e=>e.key==='Enter'&&submit(),
            style:{ width:'100%', background:'var(--mid2)', border:`.5px solid ${title?'var(--gold)':'var(--bdr)'}`,
              borderRadius:8, color:'var(--text)', fontSize:15, padding:'12px 14px',
              fontFamily:'inherit', boxSizing:'border-box', outline:'none' }})
        ),

        // Tier
        div({ style:{ marginBottom:14 }},
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

        // Description
        div({ style:{ marginBottom:14 }},
          div({ style:{ fontSize:'10px', fontWeight:700, color:'var(--text3)',
            textTransform:'uppercase', letterSpacing:'.5px', marginBottom:6 }},
            'Description'),
          h('textarea', { value:desc, onChange:e=>setDesc(e.target.value),
            placeholder:'What exactly should be built or changed?',
            rows:3,
            style:{ width:'100%', background:'var(--mid2)', border:'.5px solid var(--bdr)',
              borderRadius:8, color:'var(--text)', fontSize:13, padding:'10px 14px',
              resize:'none', fontFamily:'inherit', boxSizing:'border-box', outline:'none' }})
        ),

        // Notes for AI
        div({ style:{ marginBottom:20 }},
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
            saving?'Adding…':'Add Task')
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
                border:`.5px solid ${n.consumed?'rgba(255,255,255,.06)':'rgba(245,188,0,.2)'}` }},
                div({ style:{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }},
                  div({ style:{ fontSize:12, color:n.consumed?'var(--text3)':'var(--text)',
                    lineHeight:1.5, flex:1, whiteSpace:'pre-wrap' }}, n.body),
                  div({ style:{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:6, flexShrink:0 }},
                    span({ style:{ fontSize:'9px', color:'var(--text3)', whiteSpace:'nowrap' }},
                      timeAgo(n.created_at)),
                    !n.consumed && btn({ onClick:()=>consume(n.id),
                      style:{ fontSize:'9px', padding:'3px 8px', borderRadius:4,
                        border:'.5px solid rgba(255,255,255,.15)', background:'transparent',
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
export function TaskQueuePanel({ onClose }) {
  const [tab,     setTab]     = useState('queue');
  const [tasks,   setTasks]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [filter,  setFilter]  = useState('active'); // 'active' | 'done' | 'all' | 1 | 2 | 3

  const refresh = useCallback(async () => {
    setLoading(true);
    const rows = await loadTasks();
    setTasks(rows);
    setLoading(false);
  }, []);

  useEffect(()=>{ refresh(); },[]);

  const handleUpdate = useCallback(async (id, updates) => {
    await updateTask(id, updates);
    setTasks(prev => prev.map(t => t.id===id ? {...t,...updates} : t));
  },[]);

  const handleDelete = useCallback(async (id) => {
    await updateTask(id, { status:'scrapped' });
    setTasks(prev => prev.filter(t => t.id!==id));
  },[]);

  const handleSave = useCallback(async (task) => {
    const saved = await saveTask(task);
    if (saved) setTasks(prev => [...prev, saved].sort((a,b)=>a.priority-b.priority||new Date(a.created_at)-new Date(b.created_at)));
  },[]);

  const filtered = tasks.filter(t => {
    if (filter==='active') return t.status!=='done';
    if (filter==='done')   return t.status==='done';
    if (filter==='all')    return true;
    if (typeof filter==='number') return t.tier===filter;
    return true;
  });

  const activeCt  = tasks.filter(t=>t.status!=='done').length;
  const readyCt   = tasks.filter(t=>t.status==='ready').length;
  const highCt    = tasks.filter(t=>t.priority===1&&t.status!=='done').length;

  // ── Stats bar ──
  const statBar = () => div({ style:{ display:'flex', gap:12, padding:'10px 16px',
    borderBottom:'.5px solid var(--bdr)', flexWrap:'wrap' }},
    ...[
      { label:'Active',   val:activeCt,       col:'var(--text)' },
      { label:'Ready',    val:readyCt,        col:'#60a5fa' },
      { label:'🔴 High',  val:highCt,         col:'#ef4444' },
      { label:'T1 auto',  val:tasks.filter(t=>t.tier===1&&t.status!=='done').length, col:'#10b981' },
    ].map((s,i) =>
      div({ key:i, style:{ textAlign:'center' }},
        div({ style:{ fontSize:18, fontWeight:800, color:s.col, fontFamily:'var(--mono)' }}, s.val),
        div({ style:{ fontSize:'9px', color:'var(--text3)', marginTop:1 }}, s.label)
      )
    )
  );

  // ── Filter pills ──
  const filterPills = () => div({ style:{ display:'flex', gap:6, padding:'10px 16px',
    overflowX:'auto', flexWrap:'nowrap', borderBottom:'.5px solid var(--bdr)' }},
    ...([
      { key:'active', label:'Active' },
      { key:'all',    label:'All' },
      { key:'done',   label:'Done' },
      { key:1,        label:'T1 Auto' },
      { key:2,        label:'T2 PR' },
      { key:3,        label:'T3 Human' },
    ].map(f =>
      btn({ key:f.key, onClick:()=>setFilter(f.key),
        style:{ padding:'7px 14px', borderRadius:99, whiteSpace:'nowrap',
          border:`.5px solid ${filter===f.key?'var(--gold)':'rgba(255,255,255,.12)'}`,
          background:filter===f.key?'rgba(245,188,0,.12)':'transparent',
          color:filter===f.key?'var(--gold)':'var(--text3)',
          fontSize:12, fontWeight:filter===f.key?700:400, cursor:'pointer' }},
        f.label)
    ))
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
          'Autonomous + manual work tracking'),
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
        filterPills(),
        loading
          ? div({ style:{ textAlign:'center', padding:40, color:'var(--text3)' }}, 'Loading…')
          : filtered.length===0
            ? div({ style:{ textAlign:'center', padding:'48px 24px', color:'var(--text3)' }},
                div({ style:{ fontSize:32, marginBottom:12 }}, '✅'),
                div({ style:{ fontSize:14, fontWeight:700, marginBottom:6 }},
                  filter==='done' ? 'Nothing done yet' : 'Queue is clear'),
                filter==='active' && div({ style:{ fontSize:12 }}, 'Tap + to add your first task')
              )
            : div({ style:{ padding:'10px 12px 80px' }},
                filtered.map(t =>
                  h(TaskCard, { key:t.id, task:t, onUpdate:handleUpdate, onDelete:handleDelete })
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

    showAdd && h(AddTaskSheet, { onSave:handleSave, onClose:()=>setShowAdd(false) }),
  );
}
