// @ts-nocheck
// ── Reports Hub (Phase 3, 2026-10-16) ─────────────────────────────────────────
// Categorized landing page over every report-shaped panel in the app — the owner's ask
// (memory/project-reports-redesign.md): "I want to go quickly find a report on certain
// metrics... categorized within reports." Cross-lists existing panels by category tag (owner
// decision: cross-list, not relocate — each panel keeps its own nav entry; this is a second,
// categorized entry point reached via the 'my-reports' route). "My Reports" (saved subscriptions
// + build-a-report) folds in here as its own tab, per the same decision, instead of staying a
// separate narrower panel — ReportSubscriptionsBody is embedded unchanged (see that file's own
// header for why the extraction is behavior-identical).
import * as React from 'react';
import { RoutePanelShell } from '../components/ModalShell.js';
import { reportsCatalog, REPORT_CATEGORIES } from '../app/reports-catalog.js';
import { ReportSubscriptionsBody } from './report-subscriptions.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);
const btn = (p, ...c) => h('button', p, ...c);

const tabStyle = (active) => ({
  padding: '6px 12px', fontSize: '11px', fontWeight: 700, borderRadius: 999, cursor: 'pointer',
  border: '.5px solid ' + (active ? 'var(--amber)' : 'var(--bdr)'),
  background: active ? 'var(--adim)' : 'transparent',
  color: active ? 'var(--amber)' : 'var(--text3)',
});

/** can: App's perm(key) helper. onOpenPanel(id): routes to a direct-launch panel's own existing
 *  route (goRoute(id)). onLaunchSubscription(key): reuses the exact onLaunch switch 'my-reports'
 *  already had (above-store/calendar/visit-readiness/smg-voice/weekly-count-status). onClose:
 *  goRoute(null). */
export function ReportsHub({ can, onOpenPanel, onLaunchSubscription, onClose }) {
  const { useState, useMemo } = React;
  const [tab, setTab] = useState('all'); // 'all' | one of REPORT_CATEGORIES | 'my-reports'

  const catalog = useMemo(() => reportsCatalog(can), [can]);
  const grouped = useMemo(() => {
    const m = {};
    for (const cat of REPORT_CATEGORIES) m[cat] = catalog.filter(e => e.category === cat);
    return m;
  }, [catalog]);
  const visibleCats = tab === 'all' ? REPORT_CATEGORIES : tab === 'my-reports' ? [] : [tab];
  const totalCount = catalog.length;

  const tile = (e) => btn({
    key: e.kind + ':' + (e.id || e.key),
    onClick: () => e.kind === 'panel' ? onOpenPanel(e.id) : onLaunchSubscription(e.key),
    className: 'btn',
    style: {
      textAlign: 'left', padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
      border: '.5px solid var(--bdr)', background: 'var(--surf2)',
      display: 'flex', flexDirection: 'column', gap: 4, minHeight: 64,
    },
  },
    span({ style: { fontSize: '12.5px', fontWeight: 700, color: 'var(--text)' } }, (e.icon || '📄') + ' ' + e.label),
    span({ style: { fontSize: '10px', color: 'var(--text3)' } }, e.desc));

  return h(RoutePanelShell, {
    title: 'Reports Hub', icon: '🗂', onBack: onClose,
    subtitle: 'Every report in one place — categorized, pre-scoped, printable/shareable',
    bodyStyle: { display: 'flex', flexDirection: 'column', gap: 16 },
  },
    // category tab strip — wraps on narrow screens rather than scrolling horizontally
    // (panel-contract.md's mobile-scroll convention, applied here since this is a tab strip,
    // not a wide table).
    div({ style: { display: 'flex', gap: 6, flexWrap: 'wrap', borderBottom: '1px solid var(--bdr)', paddingBottom: 10 } },
      btn({ onClick: () => setTab('all'), style: tabStyle(tab === 'all') }, 'All (' + totalCount + ')'),
      ...REPORT_CATEGORIES.filter(c => grouped[c].length).map(c =>
        btn({ key: c, onClick: () => setTab(c), style: tabStyle(tab === c) }, c + ' (' + grouped[c].length + ')')),
      btn({ onClick: () => setTab('my-reports'), style: tabStyle(tab === 'my-reports') }, '⭐ My Reports')),

    tab === 'my-reports'
      ? h(ReportSubscriptionsBody, { onLaunch: onLaunchSubscription })
      : div({ style: { display: 'flex', flexDirection: 'column', gap: 18 } },
        ...visibleCats.filter(c => grouped[c].length).map(c =>
          div({ key: c },
            div({ style: { fontSize: '10px', fontWeight: 800, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 } }, c),
            div({ style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 } },
              ...grouped[c].map(tile))))));
}
