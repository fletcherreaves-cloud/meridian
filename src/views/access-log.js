// @ts-nocheck
// ── Access Log panel (owner request 2026-10-17, "usage logs/reports for auditing") ───────────
// Admin/owner-only viewer over app_access_log (supabase/schema-app-access-log.sql). Deliberately
// a plain chronological list, not a ReportShell report — this content has no real store/date-
// range scope to filter on (it's "who accessed what, across the whole tenant"), so ReportShell's
// location-selector/date-range machinery doesn't fit. Same simple RoutePanelShell + inline-query
// style as Security/Signals (no internal chrome to strip).
import * as React from 'react';
import { supabase, loadAppAccessLog } from '../lib/supabase.js';

const { useState, useEffect, useCallback } = React;
const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);
const btn = (p, ...c) => h('button', p, ...c);
const td = (p, ...c) => h('td', p, ...c);
const tr = (p, ...c) => h('tr', p, ...c);
const th = (p, ...c) => h('th', p, ...c);

const EVENT_LABELS = { login: '🔑 Login', panel_view: '👁 Panel View' };
const PANEL_LABELS = {
  'pay-rate-history': 'Pay Rate History',
  'security':         'Security',
  'admin-panel':      'User Management',
  'settings':         'Settings',
  'panel-manager':    'Panel Manager',
};

function fmtWhen(iso) {
  const d = new Date(iso);
  return isNaN(+d) ? '—' : d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function AccessLogPanel({ onClose }) {
  const [rows, setRows] = useState(null);
  const [actors, setActors] = useState({}); // id -> {name, email, role}
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    const [logRows, profilesRes] = await Promise.all([
      loadAppAccessLog(500),
      supabase ? supabase.from('profiles').select('id, name, email, role') : Promise.resolve({ data: [] }),
    ]);
    if (profilesRes?.error) setError('Could not load user names: ' + profilesRes.error.message);
    const actorMap = {};
    for (const p of (profilesRes?.data || [])) actorMap[p.id] = p;
    setActors(actorMap);
    setRows(logRows);
  }, []);

  useEffect(() => { load(); }, [load]);

  return div({ style: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 } },
    div({ style: { padding: '8px 14px', fontSize: '10.5px', color: 'var(--text2)', lineHeight: 1.6, borderBottom: '.5px solid var(--bdr)' } },
      'Sign-ins and views of five restricted-tier panels (Pay Rate History, Security, User Management, Settings, Panel Manager) — the most recent 500 events, newest first. ',
      'This is a deliberately narrow cut, not blanket usage tracking — every other panel in the app is unlogged.'),
    error && div({ style: { padding: '8px 14px', color: 'var(--crit)', fontSize: '11px' } }, error),
    div({ style: { flex: 1, overflowY: 'auto' } },
      rows == null
        ? div({ style: { textAlign: 'center', color: 'var(--text3)', padding: 30, fontSize: '11px' } }, 'Loading…')
        : !rows.length
          ? div({ style: { textAlign: 'center', color: 'var(--text3)', padding: 30, fontSize: '11px' } }, 'No access events logged yet.')
          : h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '11px' } },
            h('thead', null, h('tr', { style: { position: 'sticky', top: 0, background: 'var(--surf2)', zIndex: 2 } },
              th({ style: { textAlign: 'left', padding: '6px 10px', fontSize: '9px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.3px', borderBottom: '.5px solid var(--bdr)' } }, 'Who'),
              th({ style: { textAlign: 'left', padding: '6px 10px', fontSize: '9px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.3px', borderBottom: '.5px solid var(--bdr)' } }, 'Event'),
              th({ style: { textAlign: 'left', padding: '6px 10px', fontSize: '9px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.3px', borderBottom: '.5px solid var(--bdr)' } }, 'Panel'),
              th({ style: { textAlign: 'right', padding: '6px 10px', fontSize: '9px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.3px', borderBottom: '.5px solid var(--bdr)' } }, 'When'),
            )),
            h('tbody', null, ...rows.map((r, i) => {
              const actor = actors[r.actor_id];
              return tr({ key: r.id, style: { borderBottom: '.5px solid var(--bdr)', background: i % 2 ? 'var(--surf2)' : 'transparent' } },
                td({ style: { padding: '6px 10px', color: 'var(--text)', fontWeight: 600 } },
                  actor ? (actor.name || actor.email) : r.actor_id,
                  actor?.role ? span({ style: { marginLeft: 6, fontSize: '9px', color: 'var(--text3)' } }, '(' + actor.role + ')') : null),
                td({ style: { padding: '6px 10px', color: 'var(--text2)' } }, EVENT_LABELS[r.event_type] || r.event_type),
                td({ style: { padding: '6px 10px', color: 'var(--text2)' } }, r.panel_id ? (PANEL_LABELS[r.panel_id] || r.panel_id) : '—'),
                td({ style: { padding: '6px 10px', textAlign: 'right', color: 'var(--text3)', fontFamily: 'var(--mono)' } }, fmtWhen(r.created_at)),
              );
            }))
          )
    )
  );
}
