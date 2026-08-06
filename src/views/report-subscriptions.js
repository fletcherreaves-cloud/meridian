// @ts-nocheck
// ── My Reports / Report Subscriptions (Notes 49) ─────────────────────────────────────────────────
// A per-user list of saved report configs: pick a report, the level/grouping (All/OK/FL/patch/store),
// the period, and — for the Above-Store One-Pager — a "build your own" subset of panels. Each saved
// subscription is a one-click launch, pre-scoped. Persistence: localStorage-primary + Supabase mirror
// (report_subscriptions, fails soft). Auto-delivery (email/cadence) is a future hook (tasks #65/#66);
// today these drive in-app, pre-scoped launch only.
import * as React from 'react';
import { loadReportSubs, saveReportSubs } from '../lib/supabase.js';
import { STORE_NAMES, INV_ORG_COORDS, sNameC, supervisorGroups } from '../constants.js';
import { ONEPAGER_PANELS } from './above-store-onepager.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);
const btn = (p, ...c) => h('button', p, ...c);

// Reports that can be subscribed to. `panels:true` = supports the build-your-own panel picker.
const REPORTS = [
  { key: 'above-store', label: 'Above-Store One-Pager', icon: '📄', periods: true, panels: true,
    desc: 'Sales/GC · FOB · Labor · Service · Controls · Voice rollup for a group + period.' },
  { key: 'calendar', label: 'Events Calendar', icon: '📅', periods: false, panels: false,
    desc: 'Tagged events (school/sports/festivals/LTOs) for the scope, print-ready.' },
  // Notes 56 #2 — the first non-QSRSoft-source panel to get a real reporting layer.
  // No period picker: readiness reads a fixed trailing window (daily metrics) plus the
  // latest month on record (SMG / FOB), so a user-chosen period would misrepresent it.
  { key: 'visit-readiness', label: 'Visit Readiness (PACE)', icon: '🛡️', periods: false, panels: false,
    desc: 'Graded-visit readiness + calibration audit: contribution per area, every target and source, declared gaps.' },
];
const PERIODS = [['mtd', 'Month-to-date'], ['lastweek', 'Last 7 days'], ['lastmonth', 'Last month']];

const scopeLabel = (scope, groups) => {
  if (scope === 'all') return 'All stores';
  if (scope === 'ok') return 'Oklahoma';
  if (scope === 'fl') return 'Florida';
  if (String(scope).startsWith('grp:')) return 'Patch: ' + scope.slice(4);
  return sNameC(scope) || scope;
};
// A short, stable id without Date.now()/Math.random() (unavailable in some contexts) — index+scope+report.
const mkId = (list) => 'sub' + (list.reduce((m, s) => Math.max(m, +(String(s.id).replace(/\D/g, '')) || 0), 0) + 1);

export function ReportSubscriptions({ onClose, onLaunch }) {
  const { useState, useEffect, useMemo } = React;
  const [subs, setSubs] = useState(null);        // loaded list (null = loading)
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  // draft (add form)
  const [report, setReport] = useState('above-store');
  const [scope, setScope] = useState('all');
  const [period, setPeriod] = useState('mtd');
  const [panels, setPanels] = useState(() => new Set(ONEPAGER_PANELS.map(p => p.key)));

  const groups = useMemo(() => { try { return supervisorGroups() || {}; } catch { return {}; } }, []);
  const rptDef = REPORTS.find(r => r.key === report) || REPORTS[0];

  useEffect(() => { let live = true; loadReportSubs().then(r => { if (live) setSubs(Array.isArray(r) ? r : []); }).catch(() => { if (live) setSubs([]); }); return () => { live = false; }; }, []);

  const persist = async (next) => {
    setSubs(next); setBusy(true); setMsg('');
    try { const r = await saveReportSubs(next); setMsg(r.cloud ? 'Saved (synced)' : 'Saved (this device)'); }
    catch { setMsg('Saved (this device)'); }
    setBusy(false);
    setTimeout(() => setMsg(''), 2500);
  };

  const addSub = () => {
    const list = subs || [];
    const sub = {
      id: mkId(list), report, scope, period,
      panels: rptDef.panels ? Array.from(panels) : null,
      label: rptDef.label + ' · ' + scopeLabel(scope, groups) + (rptDef.periods ? ' · ' + (PERIODS.find(p => p[0] === period) || [])[1] : ''),
    };
    persist([...list, sub]);
  };
  const removeSub = (id) => persist((subs || []).filter(s => s.id !== id));

  const togglePanel = (k) => setPanels(prev => { const n = new Set(prev); if (n.has(k)) { if (n.size > 1) n.delete(k); } else n.add(k); return n; });

  const launch = (sub) => { onLaunch && onLaunch(sub); };

  // ── Scope selector (shared by draft) ──
  const scopeSelect = () => div({ style: { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' } },
    div({ style: { display: 'flex', gap: 2, border: '.5px solid var(--bdr)', borderRadius: 'var(--r)', overflow: 'hidden' } },
      ...[['all', 'All'], ['ok', 'OK'], ['fl', 'FL']].map(([v, l]) => btn({ key: v, onClick: () => setScope(v),
        style: { padding: '4px 10px', border: 'none', fontSize: '10px', cursor: 'pointer', background: scope === v ? 'var(--amber)' : 'transparent', color: scope === v ? '#000' : 'var(--text3)', fontWeight: scope === v ? 700 : 400 } }, l))),
    Object.keys(groups).length ? h('select', { value: String(scope).startsWith('grp:') ? scope : '', onChange: e => e.target.value && setScope(e.target.value),
      style: { fontSize: '10px', padding: '4px 6px', background: 'var(--surf)', border: '.5px solid var(--bdr)', borderRadius: 'var(--r)', color: 'var(--text)' } },
      h('option', { value: '' }, '— patch —'), Object.keys(groups).sort().map(g => h('option', { key: g, value: 'grp:' + g }, g))) : null,
    h('select', { value: STORE_NAMES[scope] ? scope : '', onChange: e => e.target.value && setScope(e.target.value),
      style: { fontSize: '10px', padding: '4px 6px', background: 'var(--surf)', border: '.5px solid var(--bdr)', borderRadius: 'var(--r)', color: 'var(--text)' } },
      h('option', { value: '' }, '— store —'),
      Object.keys(STORE_NAMES).sort((a, b) => (STORE_NAMES[a] || a).localeCompare(STORE_NAMES[b] || b)).map(l => h('option', { key: l, value: l }, sNameC(l)))));

  return div({ style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.82)', zIndex: 462, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 20, paddingTop: 24 } },
    div({ style: { background: 'var(--surf)', border: '.5px solid var(--bdr2)', borderRadius: 'var(--rl)', width: '100%', maxWidth: 760, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,.5)', overflow: 'hidden' } },
      // header
      div({ style: { padding: '12px 16px', borderBottom: '.5px solid var(--bdr)', background: 'var(--surf2)', display: 'flex', alignItems: 'center', gap: 10 } },
        span({ style: { fontSize: 18 } }, '🗂'),
        div({ style: { flex: 1 } },
          div({ style: { fontSize: '13px', fontWeight: 800, color: 'var(--text)' } }, 'My Reports'),
          div({ style: { fontSize: '9px', color: 'var(--text3)' } }, 'Save the reports and groupings you want — one-click, pre-scoped')),
        msg ? span({ style: { fontSize: '10px', color: 'var(--text3)' } }, busy ? '…' : msg) : null,
        btn({ className: 'btn btn-sm', style: { color: 'var(--text3)' }, onClick: onClose }, '✕')),
      // body
      div({ style: { flex: 1, overflow: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 14 } },
        // ── saved list ──
        div(null,
          div({ style: { fontSize: '10px', fontWeight: 800, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 } }, 'Saved (' + ((subs || []).length) + ')'),
          subs == null ? div({ style: { fontSize: '11px', color: 'var(--text3)' } }, 'Loading…')
          : subs.length === 0 ? div({ style: { fontSize: '11px', color: 'var(--text3)', padding: '8px 0' } }, 'No saved reports yet. Build one below.')
          : div({ style: { display: 'flex', flexDirection: 'column', gap: 6 } },
            ...subs.map(s => { const r = REPORTS.find(x => x.key === s.report) || {};
              return div({ key: s.id, style: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'var(--surf2)', border: '.5px solid var(--bdr)', borderRadius: 8 } },
                span({ style: { fontSize: 15 } }, r.icon || '📄'),
                div({ style: { flex: 1, minWidth: 0 } },
                  div({ style: { fontSize: '11.5px', fontWeight: 700, color: 'var(--text)' } }, s.label || r.label),
                  s.panels && s.panels.length < ONEPAGER_PANELS.length ? div({ style: { fontSize: '9px', color: 'var(--text3)' } }, 'Panels: ' + s.panels.map(k => (ONEPAGER_PANELS.find(p => p.key === k) || {}).label).filter(Boolean).join(', ')) : null),
                btn({ className: 'btn btn-sm btn-a', style: { fontSize: '10px', fontWeight: 700 }, onClick: () => launch(s) }, '▶ Open'),
                btn({ className: 'btn btn-sm', style: { fontSize: '10px', color: 'var(--text3)' }, onClick: () => removeSub(s.id), title: 'Remove' }, '🗑')); }))),
        // ── build a subscription ──
        div({ style: { borderTop: '1px solid var(--bdr)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10 } },
          div({ style: { fontSize: '10px', fontWeight: 800, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '.04em' } }, 'Build a report'),
          // report picker
          div({ style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
            ...REPORTS.map(r => btn({ key: r.key, onClick: () => setReport(r.key),
              style: { flex: '1 1 220px', textAlign: 'left', padding: '8px 10px', borderRadius: 8, cursor: 'pointer', border: '.5px solid ' + (report === r.key ? 'var(--amber)' : 'var(--bdr)'), background: report === r.key ? 'var(--adim)' : 'transparent' } },
              div({ style: { fontSize: '11.5px', fontWeight: 700, color: report === r.key ? 'var(--amber)' : 'var(--text)' } }, r.icon + ' ' + r.label),
              div({ style: { fontSize: '9px', color: 'var(--text3)', marginTop: 2 } }, r.desc)))),
          // scope
          div(null, div({ style: { fontSize: '9px', color: 'var(--text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.04em' } }, 'Level / grouping'), scopeSelect()),
          // period
          rptDef.periods ? div(null, div({ style: { fontSize: '9px', color: 'var(--text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.04em' } }, 'Period'),
            div({ style: { display: 'flex', gap: 2, border: '.5px solid var(--bdr)', borderRadius: 'var(--r)', overflow: 'hidden', width: 'fit-content' } },
              ...PERIODS.map(([v, l]) => btn({ key: v, onClick: () => setPeriod(v), style: { padding: '4px 10px', border: 'none', fontSize: '10px', cursor: 'pointer', background: period === v ? 'var(--amber)' : 'transparent', color: period === v ? '#000' : 'var(--text3)', fontWeight: period === v ? 700 : 400 } }, l)))) : null,
          // panels (build your own)
          rptDef.panels ? div(null, div({ style: { fontSize: '9px', color: 'var(--text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.04em' } }, 'Panels (build your own)'),
            div({ style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
              ...ONEPAGER_PANELS.map(p => btn({ key: p.key, onClick: () => togglePanel(p.key),
                style: { padding: '3px 10px', fontSize: '10px', borderRadius: 999, cursor: 'pointer', border: '.5px solid ' + (panels.has(p.key) ? 'var(--amber)' : 'var(--bdr)'), background: panels.has(p.key) ? 'var(--adim)' : 'transparent', color: panels.has(p.key) ? 'var(--amber)' : 'var(--text3)', fontWeight: panels.has(p.key) ? 700 : 400 } },
                (panels.has(p.key) ? '✓ ' : '') + p.label)))) : null,
          // actions
          div({ style: { display: 'flex', gap: 8, marginTop: 4 } },
            btn({ className: 'btn btn-a', style: { fontSize: '11px', fontWeight: 700 }, disabled: busy, onClick: addSub }, '➕ Save to My Reports'),
            btn({ className: 'btn', style: { fontSize: '11px' }, onClick: () => launch({ report, scope, period, panels: rptDef.panels ? Array.from(panels) : null }) }, '▶ Open now (without saving)'))),
        // footnote
        div({ style: { fontSize: '9px', color: 'var(--text3)', borderTop: '1px solid var(--bdr)', paddingTop: 8 } },
          'Auto-delivery (scheduled email to supervisors/owners) is coming — for now these open in-app, pre-scoped. Saved per user; synced across your devices when signed in.'))));
}
