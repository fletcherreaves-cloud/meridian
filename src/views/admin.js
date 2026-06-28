// @ts-nocheck
import * as React from 'react';
import { supabase } from '../lib/supabase.js';
import {
  PERMISSION_GROUPS, DEFAULT_ROLES,
  getOrgRoles, saveOrgRoles, pushOrgRolesToSupabase,
  defaultPermissionsForLevel, makeRoleId,
} from '../engine/permissions.js';

const h    = React.createElement;
const div  = (p,...c) => h('div',p,...c);
const span = (p,...c) => h('span',p,...c);
const btn  = (p,...c) => h('button',p,...c);
const inp  = (p)      => h('input',p);
const sel  = (p,...c) => h('select',p,...c);
const opt  = (p,t)    => h('option',p,t);
const { useState, useEffect, useCallback } = React;

const AMBER = 'var(--amber)';
const S2    = 'var(--surf2)';
const BDR   = 'var(--bdr)';
const TEXT  = 'var(--text)';
const TEXT2 = 'var(--text2)';
const TEXT3 = 'var(--text3)';
const R     = 'var(--r)';
const SURF  = 'var(--surf)';

const inputStyle = {
  padding:'7px 10px', background:SURF, border:`1px solid ${BDR}`,
  borderRadius:R, color:TEXT, fontSize:12, outline:'none',
};

// ── Shared Components ──────────────────────────────────────────────────────────
function RoleDot({ color, size = 10 }) {
  return div({style:{
    width:size,height:size,borderRadius:'50%',
    background:color||'#64748b',flexShrink:0,
  }});
}

function LevelBadge({ level }) {
  return span({style:{
    fontSize:9,fontWeight:700,padding:'1px 5px',borderRadius:8,
    background:'rgba(255,255,255,.07)',color:TEXT3,border:`1px solid ${BDR}`,
    whiteSpace:'nowrap',
  }}, `Level ${level}`);
}

// ── Users Tab ─────────────────────────────────────────────────────────────────
function UsersTab({ orgRoles }) {
  const [users, setUsers]             = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteSent, setInviteSent]   = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [editingLocs, setEditingLocs] = useState({});
  const [savingLocs,  setSavingLocs]  = useState({});

  const loadUsers = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true); setError('');
    const { data, error: err } = await supabase
      .from('profiles').select('*').order('created_at', { ascending: false });
    if (err) setError('Could not load users: ' + err.message);
    else setUsers(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const updateRole = async (userId, newRole) => {
    const { error: err } = await supabase.from('profiles').update({ role: newRole }).eq('id', userId);
    if (err) { alert('Role update failed: ' + err.message); return; }
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
  };

  const saveLocs = async (userId) => {
    setSavingLocs(prev => ({ ...prev, [userId]: true }));
    const raw = editingLocs[userId] || '';
    const locs = raw.split(',').map(s => s.trim()).filter(Boolean);
    const { error: err } = await supabase.from('profiles')
      .update({ accessible_locs: locs.length ? locs : null }).eq('id', userId);
    setSavingLocs(prev => ({ ...prev, [userId]: false }));
    if (err) { alert('Location update failed: ' + err.message); return; }
    setUsers(prev => prev.map(u => u.id === userId
      ? { ...u, accessible_locs: locs.length ? locs : null } : u));
    setEditingLocs(prev => { const n = { ...prev }; delete n[userId]; return n; });
  };

  const sendInvite = async (e) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviteLoading(true);
    const redirectTo = window.location.origin +
      (window.location.pathname.startsWith('/meridian') ? '/meridian/' : '/');
    const { error: err } = await supabase.auth.signInWithOtp({
      email: inviteEmail.trim(), options: { emailRedirectTo: redirectTo },
    });
    setInviteLoading(false);
    if (err) { alert('Could not send invite: ' + err.message); return; }
    setInviteSent(true);
    setInviteEmail('');
    setTimeout(() => setInviteSent(false), 6000);
    setTimeout(loadUsers, 2500);
  };

  const sortedRoles = [...orgRoles].sort((a,b)=>a.level-b.level);

  if (!supabase) return div({style:{padding:32,textAlign:'center',color:TEXT3,
    background:S2,borderRadius:R,border:`1px solid ${BDR}`}},
    div({style:{fontSize:28,marginBottom:10}},'🔌'),
    div({style:{fontWeight:600,color:TEXT2,marginBottom:6,fontSize:14}},'Supabase not configured'),
    div({style:{fontSize:12}},'Connect Supabase to manage users.'));

  return div({style:{display:'flex',flexDirection:'column',gap:20}},

    // Invite
    div({style:{background:S2,borderRadius:R,border:`1px solid ${BDR}`,padding:16}},
      div({style:{display:'flex',alignItems:'flex-start',gap:16,flexWrap:'wrap'}},
        div({style:{flex:1,minWidth:240}},
          div({style:{fontWeight:600,fontSize:13,color:TEXT,marginBottom:4}},'Invite a new user'),
          div({style:{fontSize:11,color:TEXT3,lineHeight:1.6}},
            'A sign-in link is sent to their email. Set their role below once they log in.')),
        h('form',{onSubmit:sendInvite,style:{display:'flex',gap:8,alignItems:'flex-start',flexShrink:0}},
          inp({type:'email',placeholder:'colleague@email.com',value:inviteEmail,
            onChange:e=>setInviteEmail(e.target.value),required:true,
            style:{...inputStyle,width:220}}),
          btn({type:'submit',disabled:inviteLoading||!inviteEmail.trim(),
            style:{padding:'7px 14px',background:AMBER,color:'#000',border:'none',
              borderRadius:R,fontSize:12,fontWeight:700,flexShrink:0,
              cursor:inviteLoading||!inviteEmail.trim()?'not-allowed':'pointer',
              opacity:inviteLoading||!inviteEmail.trim()?0.6:1}},
            inviteLoading ? 'Sending…' : 'Send Invite'))
      ),
      inviteSent && div({style:{marginTop:10,padding:'6px 10px',
        background:'rgba(34,197,94,.1)',border:'1px solid rgba(34,197,94,.3)',
        borderRadius:R,fontSize:11,color:'#22c55e'}},
        '✓ Sign-in link sent — once they log in, set their role below.')
    ),

    // Role legend
    div({style:{display:'flex',gap:12,flexWrap:'wrap'}},
      ...sortedRoles.map(role => div({key:role.id,
        style:{display:'flex',alignItems:'center',gap:6,fontSize:10,color:TEXT3}},
        h(RoleDot,{color:role.color,size:8}),
        span({style:{color:TEXT2,fontWeight:500}},role.label),
        span(null,'· Level '+role.level)
      ))
    ),

    // Users table
    div({style:{background:S2,borderRadius:R,border:`1px solid ${BDR}`,overflow:'hidden'}},
      div({style:{display:'grid',gridTemplateColumns:'1fr 130px 1fr',
        padding:'8px 14px',borderBottom:`1px solid ${BDR}`,
        fontSize:10,fontWeight:700,color:TEXT3,textTransform:'uppercase',letterSpacing:'.4px',gap:12}},
        span(null,'User'), span(null,'Role'), span(null,'Accessible Stores (blank = all)')
      ),
      loading && div({style:{padding:28,textAlign:'center',color:TEXT3,fontSize:12}},'Loading users…'),
      error   && div({style:{padding:14,color:'#f87171',fontSize:12}}, error),
      !loading&&!error&&users.length===0 &&
        div({style:{padding:28,textAlign:'center',color:TEXT3,fontSize:12}},
          'No users yet. Send an invite above to get started.'),
      !loading&&!error&&users.map((user,idx) => {
        const isEditing = editingLocs[user.id] !== undefined;
        const isSaving  = savingLocs[user.id];
        const roleObj   = sortedRoles.find(r=>r.id===user.role);
        const locsDisplay = (user.accessible_locs||[]).join(', ');
        return div({key:user.id,
          style:{display:'grid',gridTemplateColumns:'1fr 130px 1fr',
            padding:'12px 14px',gap:12,alignItems:'center',
            borderBottom:idx<users.length-1?`1px solid ${BDR}`:'none',
            background:idx%2===0?'transparent':'rgba(255,255,255,.015)'}},
          div({style:{minWidth:0}},
            div({style:{display:'flex',alignItems:'center',gap:8}},
              div({style:{width:28,height:28,borderRadius:'50%',flexShrink:0,
                background:roleObj?.color||'#64748b',
                display:'flex',alignItems:'center',justifyContent:'center',
                fontSize:12,fontWeight:700,color:'#000'}},
                (user.name||user.email||'?').charAt(0).toUpperCase()),
              div({style:{minWidth:0}},
                div({style:{fontWeight:600,fontSize:12,color:TEXT,
                  overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},
                  user.name||user.email.split('@')[0]),
                div({style:{fontSize:10,color:TEXT3,
                  overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},user.email),
                user.created_at&&div({style:{fontSize:9,color:TEXT3,marginTop:1}},
                  'Joined '+new Date(user.created_at).toLocaleDateString('en-US',
                    {month:'short',day:'numeric',year:'numeric'}))
              )
            )
          ),
          sel({value:user.role||'manager',
            onChange:e=>updateRole(user.id,e.target.value),
            style:{padding:'5px 6px',background:SURF,border:`1px solid ${BDR}`,
              borderRadius:R,color:TEXT,fontSize:11,cursor:'pointer',width:'100%'}},
            ...sortedRoles.map(r=>opt({value:r.id,key:r.id},r.label))
          ),
          user.role==='admin'
            ? div({style:{fontSize:11,color:TEXT3,fontStyle:'italic'}},'All stores (admin)')
            : isEditing
              ? div({style:{display:'flex',gap:6,alignItems:'center'}},
                  inp({value:editingLocs[user.id],placeholder:'e.g. 3708, 29760',
                    onChange:e=>setEditingLocs(prev=>({...prev,[user.id]:e.target.value})),
                    style:{flex:1,padding:'5px 8px',background:SURF,
                      border:`1px solid ${AMBER}`,borderRadius:R,color:TEXT,fontSize:11,outline:'none'}}),
                  btn({onClick:()=>saveLocs(user.id),disabled:isSaving,
                    style:{padding:'4px 9px',background:AMBER,color:'#000',
                      border:'none',borderRadius:R,fontSize:11,fontWeight:700,
                      cursor:isSaving?'not-allowed':'pointer',flexShrink:0}},
                    isSaving?'…':'Save'),
                  btn({onClick:()=>setEditingLocs(prev=>{const n={...prev};delete n[user.id];return n;}),
                    style:{padding:'4px 9px',background:'none',color:TEXT3,
                      border:`1px solid ${BDR}`,borderRadius:R,fontSize:11,cursor:'pointer',flexShrink:0}},
                    'Cancel')
                )
              : div({style:{display:'flex',alignItems:'center',gap:6,cursor:'pointer'},
                  onClick:()=>setEditingLocs(prev=>({...prev,[user.id]:(user.accessible_locs||[]).join(', ')}))},
                  span({style:{fontSize:11,color:locsDisplay?TEXT2:TEXT3,flex:1,
                    overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},
                    locsDisplay||'No stores assigned — click to set'),
                  span({style:{fontSize:10,color:TEXT3,flexShrink:0}},'✎')
                )
        );
      })
    )
  );
}

// ── Roles Tab ─────────────────────────────────────────────────────────────────
const COLOR_OPTIONS = [
  '#f59e0b','#3b82f6','#22c55e','#ef4444','#8b5cf6',
  '#06b6d4','#f97316','#ec4899','#64748b','#10b981',
];

function RolesTab({ orgRoles, setOrgRoles }) {
  const [expandedId,  setExpandedId]  = useState(null);
  const [editingId,   setEditingId]   = useState(null);
  const [editLabel,   setEditLabel]   = useState('');
  const [editLevel,   setEditLevel]   = useState(2);
  const [editColor,   setEditColor]   = useState('#3b82f6');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newLabel,    setNewLabel]    = useState('');
  const [newLevel,    setNewLevel]    = useState(3);
  const [newColor,    setNewColor]    = useState('#22c55e');
  const [saving,      setSaving]      = useState(false);

  const sorted = [...orgRoles].sort((a,b)=>a.level-b.level);

  const persist = async (roles) => {
    setSaving(true);
    saveOrgRoles(roles);
    setOrgRoles(roles);
    await pushOrgRolesToSupabase(supabase, roles);
    setSaving(false);
  };

  const togglePermission = (roleId, permKey) => {
    const next = orgRoles.map(r =>
      r.id !== roleId ? r : {
        ...r, permissions: { ...r.permissions, [permKey]: !r.permissions?.[permKey] }
      }
    );
    persist(next);
  };

  const startEdit = (role) => {
    setEditingId(role.id);
    setEditLabel(role.label);
    setEditLevel(role.level);
    setEditColor(role.color);
  };

  const saveEdit = () => {
    const next = orgRoles.map(r =>
      r.id !== editingId ? r :
        { ...r, label: editLabel.trim()||r.label, level: editLevel, color: editColor }
    );
    persist(next);
    setEditingId(null);
  };

  const deleteRole = (roleId) => {
    const role = orgRoles.find(r=>r.id===roleId);
    if (role?.system) return;
    if (!confirm(`Delete role "${role?.label}"? Users assigned to this role will need to be reassigned.`)) return;
    persist(orgRoles.filter(r=>r.id!==roleId));
    if (expandedId===roleId) setExpandedId(null);
  };

  const addRole = () => {
    if (!newLabel.trim()) return;
    const newRole = {
      id: makeRoleId(newLabel),
      label: newLabel.trim(),
      level: newLevel,
      color: newColor,
      system: false,
      permissions: defaultPermissionsForLevel(newLevel),
    };
    persist([...orgRoles, newRole]);
    setShowAddForm(false);
    setNewLabel(''); setNewLevel(3); setNewColor('#22c55e');
    setExpandedId(newRole.id);
  };

  const resetToDefaults = (roleId) => {
    if (!confirm('Reset this role\'s permissions to defaults?')) return;
    const role = orgRoles.find(r=>r.id===roleId);
    if (!role) return;
    const next = orgRoles.map(r=>
      r.id!==roleId ? r : {...r, permissions: defaultPermissionsForLevel(r.level)}
    );
    persist(next);
  };

  return div({style:{display:'flex',flexDirection:'column',gap:12}},

    div({style:{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}},
      div({style:{fontSize:11,color:TEXT3,lineHeight:1.6}},
        'Roles are ordered by authority level (1 = highest). Level-1 roles bypass all permission checks.',
        saving && span({style:{marginLeft:10,color:AMBER,fontSize:10}},'Saving…')
      ),
      btn({onClick:()=>setShowAddForm(v=>!v),
        style:{padding:'5px 12px',background:showAddForm?'transparent':AMBER,
          color:showAddForm?TEXT3:'#000',border:`1px solid ${showAddForm?BDR:AMBER}`,
          borderRadius:R,fontSize:11,fontWeight:700,cursor:'pointer'}},
        showAddForm ? 'Cancel' : '+ New Role')
    ),

    // Add role form
    showAddForm && div({style:{background:S2,borderRadius:R,border:`1px solid ${AMBER}44`,
      padding:14,display:'flex',gap:10,alignItems:'flex-end',flexWrap:'wrap'}},
      div(null,
        div({style:{fontSize:10,color:TEXT3,marginBottom:4}},'Role name'),
        inp({value:newLabel,onChange:e=>setNewLabel(e.target.value),
          placeholder:'e.g. Senior Supervisor',autoFocus:true,
          style:{...inputStyle,width:180}})
      ),
      div(null,
        div({style:{fontSize:10,color:TEXT3,marginBottom:4}},'Level (1=highest)'),
        inp({type:'number',min:1,max:99,value:newLevel,
          onChange:e=>setNewLevel(parseInt(e.target.value)||2),
          style:{...inputStyle,width:70}})
      ),
      div(null,
        div({style:{fontSize:10,color:TEXT3,marginBottom:4}},'Color'),
        div({style:{display:'flex',gap:4,flexWrap:'wrap',width:140}},
          ...COLOR_OPTIONS.map(c=>div({key:c,onClick:()=>setNewColor(c),
            style:{width:18,height:18,borderRadius:'50%',background:c,cursor:'pointer',
              border:newColor===c?'2px solid white':'2px solid transparent',flexShrink:0}}))
        )
      ),
      div({style:{fontSize:10,color:TEXT3}},
        'Starts with defaults for level ',newLevel<=1?'1 (admin)':newLevel<=2?'2 (supervisor)':'3+ (manager)'),
      btn({onClick:addRole,disabled:!newLabel.trim(),
        style:{padding:'7px 14px',background:AMBER,color:'#000',border:'none',
          borderRadius:R,fontSize:12,fontWeight:700,cursor:newLabel.trim()?'pointer':'not-allowed',
          opacity:newLabel.trim()?1:.5,flexShrink:0}},
        'Create Role')
    ),

    // Roles list
    ...sorted.map(role => {
      const isExpanded = expandedId === role.id;
      const isEditing  = editingId  === role.id;

      return div({key:role.id,
        style:{background:S2,borderRadius:R,border:`1px solid ${isExpanded?role.color+'55':BDR}`,
          overflow:'hidden',transition:'border-color .15s'}},

        // Role header
        div({style:{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',
          cursor:'pointer',background:isExpanded?role.color+'11':'transparent'},
          onClick:()=>setExpandedId(isExpanded?null:role.id)},
          h(RoleDot,{color:role.color,size:12}),
          isEditing
            ? h(React.Fragment,null,
                inp({value:editLabel,autoFocus:true,
                  onClick:e=>e.stopPropagation(),
                  onChange:e=>setEditLabel(e.target.value),
                  style:{...inputStyle,padding:'3px 8px',fontSize:12,width:160}}),
                inp({type:'number',min:1,max:99,value:editLevel,
                  onClick:e=>e.stopPropagation(),
                  onChange:e=>setEditLevel(parseInt(e.target.value)||role.level),
                  style:{...inputStyle,padding:'3px 6px',fontSize:11,width:60},
                  title:'Level (1=highest authority)'}),
                div({style:{display:'flex',gap:3},onClick:e=>e.stopPropagation()},
                  ...COLOR_OPTIONS.map(c=>div({key:c,onClick:()=>setEditColor(c),
                    style:{width:14,height:14,borderRadius:'50%',background:c,cursor:'pointer',
                      border:editColor===c?'2px solid white':'2px solid transparent'}}))
                ),
                btn({onClick:e=>{e.stopPropagation();saveEdit();},
                  style:{padding:'3px 10px',background:AMBER,color:'#000',border:'none',
                    borderRadius:R,fontSize:11,fontWeight:700,cursor:'pointer'}},
                  'Save'),
                btn({onClick:e=>{e.stopPropagation();setEditingId(null);},
                  style:{padding:'3px 8px',background:'none',color:TEXT3,
                    border:`1px solid ${BDR}`,borderRadius:R,fontSize:11,cursor:'pointer'}},
                  'Cancel')
              )
            : h(React.Fragment,null,
                span({style:{fontWeight:600,fontSize:13,color:TEXT,flex:1}}, role.label),
                h(LevelBadge,{level:role.level}),
                role.system && span({style:{fontSize:9,color:TEXT3,padding:'1px 5px',
                  borderRadius:4,border:`1px solid ${BDR}`,marginLeft:4}},'system'),
                !isEditing&&btn({onClick:e=>{e.stopPropagation();startEdit(role);},
                  style:{background:'none',border:'none',color:TEXT3,fontSize:11,
                    cursor:'pointer',padding:'2px 6px'}},
                  '✎ Edit'),
                !role.system&&btn({onClick:e=>{e.stopPropagation();deleteRole(role.id);},
                  style:{background:'none',border:'none',color:'#ef4444',fontSize:11,
                    cursor:'pointer',padding:'2px 6px'}},
                  'Delete'),
                span({style:{fontSize:12,color:TEXT3,marginLeft:4}},
                  isExpanded ? '▲' : '▼')
              )
        ),

        // Permission editor (expanded)
        isExpanded && div({style:{padding:'0 14px 14px',
          borderTop:`1px solid ${BDR}`}},
          div({style:{display:'flex',alignItems:'center',justifyContent:'space-between',
            padding:'8px 0 10px'}},
            div({style:{fontSize:11,color:TEXT3}},
              role.level<=1
                ? 'Level-1 roles have all permissions by default and cannot be restricted.'
                : 'Toggle permissions on/off for this role. Changes save immediately.'),
            role.level>1&&btn({onClick:()=>resetToDefaults(role.id),
              style:{background:'none',border:`1px solid ${BDR}`,color:TEXT3,
                borderRadius:R,padding:'3px 8px',fontSize:10,cursor:'pointer'}},
              'Reset to defaults')
          ),
          div({style:{display:'flex',flexDirection:'column',gap:16}},
            ...PERMISSION_GROUPS.map(group =>
              div({key:group.group},
                div({style:{fontSize:10,fontWeight:700,color:TEXT3,textTransform:'uppercase',
                  letterSpacing:'.5px',marginBottom:8}}),
                div({style:{fontSize:11,fontWeight:600,color:TEXT2,marginBottom:6}}),
                div({style:{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',gap:6}},
                  div({style:{gridColumn:'1/-1',fontSize:10,fontWeight:700,color:TEXT3,
                    textTransform:'uppercase',letterSpacing:'.5px',marginBottom:2}}, group.group),
                  ...group.items.map(item => {
                    const enabled = role.level<=1 ? true : !!role.permissions?.[item.key];
                    return div({key:item.key,
                      style:{display:'flex',alignItems:'center',gap:8,padding:'5px 8px',
                        borderRadius:R,background:enabled?role.color+'11':'transparent',
                        border:`1px solid ${enabled?role.color+'33':BDR}`,
                        cursor:role.level<=1?'default':'pointer',
                        transition:'all .1s'},
                      onClick:()=>role.level>1&&togglePermission(role.id,item.key)},
                      div({style:{width:16,height:16,borderRadius:4,flexShrink:0,
                        background:enabled?role.color:'transparent',
                        border:`1.5px solid ${enabled?role.color:BDR}`,
                        display:'flex',alignItems:'center',justifyContent:'center',
                        color:'#000',fontSize:10,fontWeight:700}},
                        enabled?'✓':''),
                      span({style:{fontSize:11,color:enabled?TEXT:TEXT3}}, item.label)
                    );
                  })
                )
              )
            )
          )
        )
      );
    })
  );
}

// ── Main Panel ─────────────────────────────────────────────────────────────────
export function AdminPanel({ onClose, orgRoles: initRoles, setOrgRoles: setAppRoles }) {
  const [tab, setTab]           = useState('users');
  const [orgRoles, setOrgRoles] = useState(() => initRoles || getOrgRoles());

  const handleSetRoles = (roles) => {
    setOrgRoles(roles);
    if (setAppRoles) setAppRoles(roles);
  };

  const tabs = [
    { key:'users', label:'Users' },
    { key:'roles', label:'Roles & Permissions' },
  ];

  return div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.55)',zIndex:200,
    display:'flex',alignItems:'center',justifyContent:'center'}},
    div({style:{width:'min(960px,96vw)',maxHeight:'90vh',background:SURF,
      borderRadius:R,display:'flex',flexDirection:'column',overflow:'hidden',
      boxShadow:'0 20px 60px rgba(0,0,0,.4)',border:`1px solid ${BDR}`}},

      // Header
      div({style:{display:'flex',alignItems:'center',gap:12,padding:'14px 20px',
        borderBottom:`1px solid ${BDR}`,flexShrink:0,background:S2}},
        span({style:{fontSize:20}},'👤'),
        div({style:{flex:1}},
          div({style:{fontWeight:700,fontSize:15,color:TEXT}},'User Management'),
          div({style:{fontSize:11,color:TEXT3}},'Manage users, roles, permissions, and store assignments')),
        btn({onClick:onClose,style:{background:'none',border:`1px solid ${BDR}`,color:TEXT2,
          borderRadius:R,padding:'4px 10px',fontSize:11,cursor:'pointer'}},'✕ Close')
      ),

      // Tab bar
      div({style:{display:'flex',gap:0,borderBottom:`1px solid ${BDR}`,flexShrink:0}},
        ...tabs.map(t => btn({key:t.key,onClick:()=>setTab(t.key),
          style:{padding:'9px 18px',background:'none',border:'none',
            borderBottom:tab===t.key?`2px solid ${AMBER}`:'2px solid transparent',
            color:tab===t.key?AMBER:TEXT2,fontSize:12,fontWeight:tab===t.key?700:400,
            cursor:'pointer',transition:'all .15s',marginBottom:-1}},
          t.label))
      ),

      // Body
      div({style:{flex:1,overflowY:'auto',padding:20}},
        tab==='users' && h(UsersTab,{orgRoles}),
        tab==='roles' && h(RolesTab,{orgRoles,setOrgRoles:handleSetRoles})
      )
    )
  );
}
