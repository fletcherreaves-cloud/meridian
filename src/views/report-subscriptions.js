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
import { RoutePanelShell } from '../components/ModalShell.js';
import { LocationSelector } from '../components/PanelControls.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);
const btn = (p, ...c) => h('button', p, ...c);

// Reports that can be subscribed to. `panels:true` = supports the build-your-own panel picker.
// `category` (Reports Hub Phase 3, 2026-10-16) groups this entry alongside the hub's direct-
// launch panel tiles (src/app/reports-catalog.js) -- same category vocabulary, added here so
// label/icon/desc/category live in exactly one place rather than a second lookup table that
// could drift when a key or label changes.
export const REPORTS = [
  { key: 'above-store', label: 'Above-Store One-Pager', icon: '📄', periods: true, panels: true,
    category: 'Leadership & Above-Store',
    desc: 'Sales/GC · FOB · Labor · Service · Controls · Voice rollup for a group + period.' },
  { key: 'calendar', label: 'Events Calendar', icon: '📅', periods: false, panels: false,
    category: 'Guest Experience',
    desc: 'Tagged events (school/sports/festivals/LTOs) for the scope, print-ready.' },
  // Notes 56 #2 — the first non-QSRSoft-source panel to get a real reporting layer.
  // No period picker: readiness reads a fixed trailing window (daily metrics) plus the
  // latest month on record (SMG / FOB), so a user-chosen period would misrepresent it.
  { key: 'visit-readiness', label: 'Visit Readiness (PACE)', icon: '🛡️', periods: false, panels: false,
    category: 'Guest Experience',
    desc: 'Graded-visit readiness + calibration audit: contribution per area, every target and source, declared gaps.' },
  // Backlog: "Custom reports for non-QSRSoft panels (SMG/Voice, LifeLenz, calendars)" -- calendar
  // and PACE (visit-readiness) above were already done; this is the SMG VOICE slice. No period
  // picker, same reasoning as visit-readiness: SMGVoicePanel reads whatever's on file (comments +
  // the latest FullScale month), not a chosen window, so a period selector here would imply a
  // control that doesn't actually change what's shown.
  { key: 'smg-voice', label: 'SMG VOICE', icon: '🗣️', periods: false, panels: false,
    category: 'Guest Experience',
    desc: 'Guest satisfaction: OSAT/Accuracy B2B scorecard + comment feed, for a scope.' },
  // Owner req (2026-10-11) -- a printable/exportable district roster modeled off Count Cycle's
  // own data: last full count, regular count day (+ a drift flag against settings), this-week
  // complete/incomplete, and pending new items. No period picker -- like visit-readiness/
  // smg-voice above, this reads the current on-hand snapshot, not a chosen window.
  { key: 'weekly-count-status', label: 'Weekly Count Status', icon: '🗓', periods: false, panels: false,
    category: 'Daily & Operations',
    desc: 'Per-store weekly count roster: last full count, regular count day, this-week status, new items pending.' },
];
// 'custom' added (owner-requested, 2026-10-13) -- this picker used to offer only 3 fixed named
// periods with no way to pick an actual date range. Matches the exact period vocabulary
// AboveStoreOnePager (the one consumer that reads `period`) already implements internally
// (its own period==='custom' + customRange state) rather than introducing a second, competing
// date-range shape (e.g. DateRangeControl's trailing-N-days presets) that panel doesn't speak.
const PERIODS = [['mtd', 'Month-to-date'], ['lastweek', 'Last 7 days'], ['lastmonth', 'Last month'], ['custom', 'Custom']];

// Trailing 7 closed days -- same default AboveStoreOnePager's own customRange state seeds with,
// so switching into Custom here starts from the same sane window, not an empty one.
const defaultCustomRange = () => { const e = new Date(); e.setDate(e.getDate() - 1); const s = new Date(e); s.setDate(s.getDate() - 6);
  return { s: s.toISOString().slice(0, 10), e: e.toISOString().slice(0, 10) }; };

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

// ReportSubscriptionsBody (Reports Hub Phase 3, 2026-10-16) -- the saved-list + build-a-report
// form, extracted from ReportSubscriptions below with ZERO behavior change, so the Reports Hub
// (src/views/reports-hub.js) can embed it as its own "My Reports" tab without a second, nested
// RoutePanelShell. ReportSubscriptions keeps wrapping this in its own shell unchanged, so every
// existing test that renders <ReportSubscriptions> still exercises the exact same tree.
export function ReportSubscriptionsBody({ onLaunch }) {
  const { useState, useEffect, useMemo } = React;
  const [subs, setSubs] = useState(null);        // loaded list (null = loading)
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  // draft (add form)
  const [report, setReport] = useState('above-store');
  const [scope, setScope] = useState('all');
  const [period, setPeriod] = useState('mtd');
  const [customRange, setCustomRange] = useState(defaultCustomRange);
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

  const periodLabel = () => period === 'custom' ? (customRange.s + ' to ' + customRange.e) : (PERIODS.find(p => p[0] === period) || [])[1];

  const addSub = () => {
    const list = subs || [];
    const sub = {
      id: mkId(list), report, scope, period,
      customRange: (rptDef.periods && period === 'custom') ? customRange : null,
      panels: rptDef.panels ? Array.from(panels) : null,
      label: rptDef.label + ' · ' + scopeLabel(scope, groups) + (rptDef.periods ? ' · ' + periodLabel() : ''),
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

  // Body only -- no shell of its own (Reports Hub Phase 3, 2026-10-16). The save/sync indicator
  // that used to live in RoutePanelShell's headerExtra now renders as the first row here instead,
  // so it still shows up whether this body is reached via the thin ReportSubscriptions wrapper
  // below or embedded in the Reports Hub's "My Reports" tab.
  return div({ style: { display: 'flex', flexDirection: 'column', gap: 14 } },
        msg ? div({ style: { fontSize: '10px', color: 'var(--text3)' } }, busy ? '…' : msg) : null,
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
          // period — a real date selector (owner-requested, 2026-10-13), not just 3 fixed names.
          // 'custom' reveals two <input type="date"> fields; everything else is unchanged.
          rptDef.periods ? div(null, div({ style: { fontSize: '9px', color: 'var(--text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.04em' } }, 'Period'),
            div({ style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } },
              div({ style: { display: 'flex', gap: 2, border: '.5px solid var(--bdr)', borderRadius: 'var(--r)', overflow: 'hidden', width: 'fit-content' } },
                ...PERIODS.map(([v, l]) => btn({ key: v, onClick: () => setPeriod(v), style: { padding: '4px 10px', border: 'none', fontSize: '10px', cursor: 'pointer', background: period === v ? 'var(--amber)' : 'transparent', color: period === v ? '#000' : 'var(--text3)', fontWeight: period === v ? 700 : 400 } }, l))),
              period === 'custom' ? div({ style: { display: 'flex', gap: 6, alignItems: 'center' } },
                h('input', { type: 'date', value: customRange.s, max: customRange.e, onChange: e => setCustomRange(r => ({ ...r, s: e.target.value })),
                  style: { background: 'var(--surf)', border: '.5px solid var(--bdr)', borderRadius: 'var(--r)', color: 'var(--text)', fontSize: '11px', padding: '4px 8px' } }),
                span({ style: { fontSize: '10px', color: 'var(--text3)' } }, 'to'),
                h('input', { type: 'date', value: customRange.e, min: customRange.s, onChange: e => setCustomRange(r => ({ ...r, e: e.target.value })),
                  style: { background: 'var(--surf)', border: '.5px solid var(--bdr)', borderRadius: 'var(--r)', color: 'var(--text)', fontSize: '11px', padding: '4px 8px' } })) : null)) : null,
          // panels (build your own)
          rptDef.panels ? div(null, div({ style: { fontSize: '9px', color: 'var(--text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.04em' } }, 'Panels (build your own)'),
            div({ style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
              ...ONEPAGER_PANELS.map(p => btn({ key: p.key, onClick: () => togglePanel(p.key),
                style: { padding: '3px 10px', fontSize: '10px', borderRadius: 999, cursor: 'pointer', border: '.5px solid ' + (panels.has(p.key) ? 'var(--amber)' : 'var(--bdr)'), background: panels.has(p.key) ? 'var(--adim)' : 'transparent', color: panels.has(p.key) ? 'var(--amber)' : 'var(--text3)', fontWeight: panels.has(p.key) ? 700 : 400 } },
                (panels.has(p.key) ? '✓ ' : '') + p.label)))) : null,
          // actions
          div({ style: { display: 'flex', gap: 8, marginTop: 4 } },
            btn({ className: 'btn btn-a', style: { fontSize: '11px', fontWeight: 700 }, disabled: busy, onClick: addSub }, '➕ Save to My Reports'),
            btn({ className: 'btn', style: { fontSize: '11px' }, onClick: () => launch({ report, scope, period, customRange: (rptDef.periods && period === 'custom') ? customRange : null, panels: rptDef.panels ? Array.from(panels) : null }) }, '▶ Open now (without saving)'))),
        // footnote
        div({ style: { fontSize: '9px', color: 'var(--text3)', borderTop: '1px solid var(--bdr)', paddingTop: 8 } },
          'Auto-delivery (scheduled email to supervisors/owners) is coming — for now these open in-app, pre-scoped. Saved per user; synced across your devices when signed in.'));
}

// ReportSubscriptions — thin RoutePanelShell wrapper around ReportSubscriptionsBody above,
// unchanged in behavior from before the Phase 3 extraction (route:true, dispatch #206 — swapped
// ModalShell for RoutePanelShell). Kept as its own export so any existing direct deep link /
// test against <ReportSubscriptions> keeps working unmodified.
export function ReportSubscriptions({ onClose, onLaunch }) {
  return h(RoutePanelShell, {
    title: 'My Reports', icon: '🗂', onBack: onClose,
    subtitle: 'Save the reports and groupings you want — one-click, pre-scoped',
  }, h(ReportSubscriptionsBody, { onLaunch }));
}
