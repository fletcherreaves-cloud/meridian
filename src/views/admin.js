// @ts-nocheck
import * as React from 'react';
import { supabase } from '../lib/supabase.js';

const h   = React.createElement;
const div = (p,...c) => h('div',p,...c);
const span= (p,...c) => h('span',p,...c);
const btn = (p,...c) => h('button',p,...c);
const inp = (p)      => h('input',p);
const sel = (p,...c) => h('select',p,...c);
const opt = (p,t)    => h('option',p,t);
const { useState, useEffect } = React;

const AMBER = 'var(--amber)';
const S2    = 'var(--surf2)';
const BDR   = 'var(--bdr)';
const TEXT  = 'var(--text)';
const TEXT2 = 'var(--text2)';
const TEXT3 = 'var(--text3)';
const R     = 'var(--r)';
const SURF  = 'var(--surf)';

const ROLES = ['admin', 'supervisor', 'manager'];
const ROLE_COLORS = { admin:'#f59e0b', supervisor:'#3b82f6', manager:'#22c55e' };
const ROLE_DESC   = {
  admin:      'Full access · approves reviews · manages users',
  supervisor: 'Multi-store access · can view assigned stores',
  manager:    'Assigned stores only · submits reviews',
};

function RoleBadge({ role }) {
  const color = ROLE_COLORS[role] || '#64748b';
  return span({style:{
    fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:10,
    background:color+'22',border:`1px solid ${color}55`,
    color,whiteSpace:'nowrap',textTransform:'capitalize',
  }}, role || 'manager');
}

export function AdminPanel({ onClose }) {
  const [users, setUsers]             = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteSent, setInviteSent]   = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [editingLocs, setEditingLocs] = useState({});
  const [savingLocs, setSavingLocs]   = useState({});

  const isConfigured = !!supabase;

  const loadUsers = async () => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    setError('');
    const { data, error: err } = await supabase
      .from('profiles').select('*').order('created_at', { ascending: false });
    if (err) setError('Could not load users: ' + err.message);
    else setUsers(data || []);
    setLoading(false);
  };

  useEffect(() => { loadUsers(); }, []);

  const updateRole = async (userId, newRole) => {
    const { error: err } = await supabase.from('profiles').update({ role: newRole }).eq('id', userId);
    if (err) { alert('Role update failed: ' + err.message); return; }
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
  };

  const startEditLocs = (user) => {
    setEditingLocs(prev => ({
      ...prev,
      [user.id]: (user.accessible_locs || []).join(', '),
    }));
  };

  const saveLocs = async (userId) => {
    setSavingLocs(prev => ({ ...prev, [userId]: true }));
    const raw = editingLocs[userId] || '';
    const locs = raw.split(',').map(s => s.trim()).filter(Boolean);
    const { error: err } = await supabase.from('profiles')
      .update({ accessible_locs: locs.length ? locs : null })
      .eq('id', userId);
    setSavingLocs(prev => ({ ...prev, [userId]: false }));
    if (err) { alert('Location update failed: ' + err.message); return; }
    setUsers(prev => prev.map(u => u.id === userId
      ? { ...u, accessible_locs: locs.length ? locs : null } : u));
    setEditingLocs(prev => { const n = { ...prev }; delete n[userId]; return n; });
  };

  const cancelLocs = (userId) => {
    setEditingLocs(prev => { const n = { ...prev }; delete n[userId]; return n; });
  };

  const sendInvite = async (e) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviteLoading(true);
    const redirectTo = window.location.origin +
      (window.location.pathname.startsWith('/meridian') ? '/meridian/' : '/');
    const { error: err } = await supabase.auth.signInWithOtp({
      email: inviteEmail.trim(),
      options: { emailRedirectTo: redirectTo },
    });
    setInviteLoading(false);
    if (err) { alert('Could not send invite: ' + err.message); return; }
    setInviteSent(true);
    const sent = inviteEmail.trim();
    setInviteEmail('');
    setTimeout(() => setInviteSent(false), 6000);
    setTimeout(loadUsers, 2500);
  };

  const inputStyle = {
    padding:'7px 10px', background:SURF, border:`1px solid ${BDR}`,
    borderRadius:R, color:TEXT, fontSize:12, outline:'none',
  };

  return div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.55)',zIndex:200,
    display:'flex',alignItems:'center',justifyContent:'center'}},
    div({style:{width:'min(900px,96vw)',maxHeight:'90vh',background:SURF,
      borderRadius:R,display:'flex',flexDirection:'column',overflow:'hidden',
      boxShadow:'0 20px 60px rgba(0,0,0,.4)',border:`1px solid ${BDR}`}},

      // Header
      div({style:{display:'flex',alignItems:'center',gap:12,padding:'14px 20px',
        borderBottom:`1px solid ${BDR}`,flexShrink:0,background:S2}},
        span({style:{fontSize:20}},'👤'),
        div({style:{flex:1}},
          div({style:{fontWeight:700,fontSize:15,color:TEXT}},'User Management'),
          div({style:{fontSize:11,color:TEXT3}},'Manage access, roles, and store assignments')),
        btn({onClick:loadUsers,
          style:{background:'none',border:`1px solid ${BDR}`,color:TEXT2,
            borderRadius:R,padding:'4px 10px',fontSize:11,cursor:'pointer',marginRight:4}},
          '↺ Refresh'),
        btn({onClick:onClose,style:{background:'none',border:`1px solid ${BDR}`,color:TEXT2,
          borderRadius:R,padding:'4px 10px',fontSize:11,cursor:'pointer'}},'✕ Close')
      ),

      div({style:{flex:1,overflowY:'auto',padding:20,display:'flex',flexDirection:'column',gap:20}},

        // Not configured
        !isConfigured && div({style:{padding:32,textAlign:'center',color:TEXT3,
          background:S2,borderRadius:R,border:`1px solid ${BDR}`}},
          div({style:{fontSize:28,marginBottom:10}},'🔌'),
          div({style:{fontWeight:600,color:TEXT2,marginBottom:6,fontSize:14}},'Supabase not configured'),
          div({style:{fontSize:12,lineHeight:1.6}},'Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY',
            h('br'),
            'to .env.local and restart the dev server.')),

        isConfigured && h(React.Fragment, null,

          // Invite card
          div({style:{background:S2,borderRadius:R,border:`1px solid ${BDR}`,padding:16}},
            div({style:{display:'flex',alignItems:'flex-start',gap:16,flexWrap:'wrap'}},
              div({style:{flex:1,minWidth:260}},
                div({style:{fontWeight:600,fontSize:13,color:TEXT,marginBottom:4}},
                  'Invite a new user'),
                div({style:{fontSize:11,color:TEXT3,lineHeight:1.6}},
                  'A sign-in link is sent to their email. Once they log in, their profile appears below — set their role and store access here.')
              ),
              h('form',{onSubmit:sendInvite,
                style:{display:'flex',gap:8,alignItems:'flex-start',flexShrink:0}},
                inp({type:'email',placeholder:'colleague@email.com',
                  value:inviteEmail,onChange:e=>setInviteEmail(e.target.value),
                  required:true,style:{...inputStyle,width:220}}),
                btn({type:'submit',disabled:inviteLoading||!inviteEmail.trim(),
                  style:{padding:'7px 14px',background:AMBER,color:'#000',border:'none',
                    borderRadius:R,fontSize:12,fontWeight:700,flexShrink:0,
                    cursor:inviteLoading||!inviteEmail.trim()?'not-allowed':'pointer',
                    opacity:inviteLoading||!inviteEmail.trim()?0.6:1}},
                  inviteLoading ? 'Sending…' : 'Send Invite')
              )
            ),
            inviteSent && div({style:{marginTop:10,padding:'6px 10px',
              background:'rgba(34,197,94,.1)',border:'1px solid rgba(34,197,94,.3)',
              borderRadius:R,fontSize:11,color:'#22c55e'}},
              '✓ Sign-in link sent — ask them to check their inbox and spam folder. Once they log in, they\'ll appear in the list below.')
          ),

          // Role legend
          div({style:{display:'flex',gap:14,flexWrap:'wrap'}},
            ...ROLES.map(role => div({key:role,
              style:{display:'flex',alignItems:'center',gap:6,fontSize:10,color:TEXT3}},
              h(RoleBadge,{role}),
              ROLE_DESC[role]
            ))
          ),

          // Users table
          div({style:{background:S2,borderRadius:R,border:`1px solid ${BDR}`,overflow:'hidden'}},
            div({style:{display:'grid',
              gridTemplateColumns:'1fr 110px 1fr',
              padding:'8px 14px',borderBottom:`1px solid ${BDR}`,
              fontSize:10,fontWeight:700,color:TEXT3,textTransform:'uppercase',letterSpacing:'.4px',gap:12}},
              span(null,'User'), span(null,'Role'), span(null,'Accessible Stores (leave blank = all)')
            ),

            loading && div({style:{padding:28,textAlign:'center',color:TEXT3,fontSize:12}},
              'Loading users…'),
            error  && div({style:{padding:14,color:'#f87171',fontSize:12}}, error),
            !loading && !error && users.length === 0 &&
              div({style:{padding:28,textAlign:'center',color:TEXT3,fontSize:12}},
                'No users yet. Send an invite above to get started.'),

            !loading && !error && users.map((user, idx) => {
              const isEditing = editingLocs[user.id] !== undefined;
              const isSaving  = savingLocs[user.id];
              const locsDisplay = (user.accessible_locs || []).join(', ');

              return div({key:user.id,
                style:{display:'grid',gridTemplateColumns:'1fr 110px 1fr',
                  padding:'12px 14px',gap:12,alignItems:'center',
                  borderBottom:idx<users.length-1?`1px solid ${BDR}`:'none',
                  background:idx%2===0?'transparent':'rgba(255,255,255,.015)'}},

                // User info
                div({style:{minWidth:0}},
                  div({style:{display:'flex',alignItems:'center',gap:8}},
                    div({style:{width:28,height:28,borderRadius:'50%',flexShrink:0,
                      background:ROLE_COLORS[user.role]||'#64748b',
                      display:'flex',alignItems:'center',justifyContent:'center',
                      fontSize:12,fontWeight:700,color:'#000'}},
                      (user.name||user.email||'?').charAt(0).toUpperCase()),
                    div({style:{minWidth:0}},
                      div({style:{fontWeight:600,fontSize:12,color:TEXT,
                        overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},
                        user.name || user.email.split('@')[0]),
                      div({style:{fontSize:10,color:TEXT3,
                        overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},
                        user.email),
                      user.created_at && div({style:{fontSize:9,color:TEXT3,marginTop:1}},
                        'Joined '+new Date(user.created_at).toLocaleDateString('en-US',
                          {month:'short',day:'numeric',year:'numeric'}))
                    )
                  )
                ),

                // Role selector
                sel({value:user.role||'manager',
                  onChange:e=>updateRole(user.id,e.target.value),
                  style:{padding:'5px 6px',background:SURF,border:`1px solid ${BDR}`,
                    borderRadius:R,color:TEXT,fontSize:11,cursor:'pointer',width:'100%'}},
                  ...ROLES.map(r=>opt({value:r,key:r},r.charAt(0).toUpperCase()+r.slice(1)))
                ),

                // Location field
                user.role === 'admin'
                  ? div({style:{fontSize:11,color:TEXT3,fontStyle:'italic'}},
                      'All stores (admin)')
                  : isEditing
                    ? div({style:{display:'flex',gap:6,alignItems:'center'}},
                        inp({value:editingLocs[user.id],
                          placeholder:'e.g. 3708, 29760, 5985',
                          onChange:e=>setEditingLocs(prev=>({...prev,[user.id]:e.target.value})),
                          style:{flex:1,padding:'5px 8px',background:SURF,
                            border:`1px solid ${AMBER}`,borderRadius:R,
                            color:TEXT,fontSize:11,outline:'none'}}),
                        btn({onClick:()=>saveLocs(user.id),disabled:isSaving,
                          style:{padding:'4px 9px',background:AMBER,color:'#000',
                            border:'none',borderRadius:R,fontSize:11,fontWeight:700,
                            cursor:isSaving?'not-allowed':'pointer',flexShrink:0}},
                          isSaving?'…':'Save'),
                        btn({onClick:()=>cancelLocs(user.id),
                          style:{padding:'4px 9px',background:'none',color:TEXT3,
                            border:`1px solid ${BDR}`,borderRadius:R,fontSize:11,cursor:'pointer',flexShrink:0}},
                          'Cancel')
                      )
                    : div({style:{display:'flex',alignItems:'center',gap:6,cursor:'pointer'},
                        onClick:()=>startEditLocs(user)},
                        span({style:{fontSize:11,color:locsDisplay?TEXT2:TEXT3,flex:1,
                          overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},
                          locsDisplay||'No stores assigned — click to set'),
                        span({style:{fontSize:10,color:TEXT3,flexShrink:0}},'✎')
                      )
              );
            })
          )
        )
      )
    )
  );
}
