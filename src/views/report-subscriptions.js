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
import { ModalShell } from '../components/ModalShell.js';
import { LocationSelector } from '../components/PanelControls.js';

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

// scope stays a plain string ('all'|'ok'|'fl'|'grp:X'|storeId) — that's the persisted shape
// (report_subscriptions rows already use it, in the wild), so LocationSelector's {level,id}
// value is only a UI-layer translation, converted at the edges, never stored.
const scopeToSelectorValue = (scope) => {
  if (scope === 'all') return { level: 'all', id: null };
  if (scope === 'ok') return { level: 'state', id: 'OK' };
  if (scope === 'fl') return { level: 'state', id: 'FL' };
  if (String(scope).startsWith('grp:')) return { level: 'patch', id: scope.slice(4) };
  return { level: 'store', id: scope };
};
const selectorValueToScope = (v) => {
  if (!v || v.level === 'all') return 'all';
  if (v.level === 'state') return v.id === 'OK' ? 'ok' : v.id === 'FL' ? 'fl' : 'all';
  if (v.level === 'patch') return 'grp:' + v.id;
  if (v.level === 'store') return v.id || 'all';
  return 'all';
};

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
  // {loc} shape only — LocationSelector derives state/patch from INV_ORG_COORDS itself.
  const _stores = useMemo(() => Object.keys(STORE_NAMES).map(loc => ({ loc })), []);

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

  // ── Scope selector (shared by draft) ── LocationSelector (PanelControls.js, issue #126) —
  // the All/OK/FL toggle + two dropdowns this used to hand-roll are exactly the pill-based
  // All→State→Patch→Store hierarchy that component already standardizes app-wide
  // (feedback-selector-ui-standard.md). scope stays a plain string at the edges (above).
  const scopeSelect = () => h(LocationSelector, {
    stores: _stores, invOrgCoords: INV_ORG_COORDS, storeNames: STORE_NAMES,
    value: scopeToSelectorValue(scope), onChange: v => setScope(selectorValueToScope(v)),
  });

  return h(ModalShell, {
    title: 'My Reports', icon: '🗂', maxWidth: 760, onClose,
    subtitle: 'Save the reports and groupings you want — one-click, pre-scoped',
    headerExtra: msg ? span({ style: { fontSize: '10px', color: 'var(--text3)' } }, busy ? '…' : msg) : null,
    bodyStyle: { padding: 14, display: 'flex', flexDirection: 'column', gap: 14 },
  },
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
          'Auto-delivery (scheduled email to supervisors/owners) is coming — for now these open in-app, pre-scoped. Saved per user; synced across your devices when signed in.'));
}
