// @ts-nocheck
// ── Squadle Food Safety Checklists — task #105 Phase 2 UI (2026-11-14) ───────────────────────────
// First real UI consumer of ds.squadleChecklistRows (loaded since task #105 Phase 2 but
// deliberately left with no consuming engine/panel — see memory/finding-hme-squadle-integration-
// 2026-11-06.md's "Phase 2: surface the data" note). Compared against the existing Forms
// Completion feature (src/views/forms-panel.js, src/engine/forms-completion.js) per that note's own
// hunch — Squadle's real shift/task/action structure genuinely parallels Forms' form/occurrence
// shape closely enough to reuse the same raw-row -> flat-row -> store-day-rollup -> district-
// summary pipeline (src/engine/squadle-checklist.js), so this panel owns NO business logic beyond
// rendering what that engine computes, matching this repo's standing "panels don't reimplement
// math the engine already owns" rule.
//
// Reads directly from `ds.squadleChecklistRows` (already loaded client-side, up to 30 days back
// per loadSquadleChecklistRecords' own default) -- no separate fetch, unlike Forms' own panel.
import * as React from 'react';
import { STORE_NAMES, getStoreOrg, INV_ORG_COORDS, supervisorGroups } from '../constants.js';
import { flattenSquadleRecords, computeSquadleStoreDayRollup, computeSquadleSummary, extractFlaggedItems } from '../engine/squadle-checklist.js';
import { RoutePanelShell } from '../components/ModalShell.js';
import { LocationSelector } from '../components/PanelControls.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);
const btn = (p, ...c) => h('button', p, ...c);

const ALL_LOCS = Object.keys(STORE_NAMES);
const FL_LOCS = new Set(ALL_LOCS.filter(l => getStoreOrg(l) === 'emerald'));
const locNum = (s) => { const n = parseInt(s, 10); return Number.isNaN(n) ? String(s == null ? '' : s) : String(n); };
const storeLabel = (s) => { const n = locNum(s), nm = STORE_NAMES[n]; return nm ? n + ' — ' + nm : n; };
const fPct = v => v == null ? '—' : (v * 100).toFixed(1) + '%';
const rateColor = v => v == null ? 'var(--text3)' : v >= 0.9 ? '#10b981' : v >= 0.7 ? '#f59e0b' : '#ef4444';

const WINDOW_OPTIONS = [1, 7, 30];
const MAX_FLAGGED_ROWS = 200; // DOM cap, same reasoning as forms-panel.js's MAX_OCCURRENCE_ROWS — the underlying rollup still reflects the full set.

export function SquadleChecklistPanel({ ds, onClose }) {
  const { useState, useMemo } = React;
  const [selLoc, setSelLoc] = useState('all');
  const [windowDays, setWindowDays] = useState(7);

  const rawRows = ds?.squadleChecklistRows || [];

  const scopedLocs = useMemo(() => {
    if (selLoc === 'all') return null; // null = no filter
    if (selLoc === 'fl') return FL_LOCS;
    if (selLoc === 'ok') return new Set(ALL_LOCS.filter(l => !FL_LOCS.has(l)));
    if (selLoc.startsWith('__patch__')) {
      return new Set((supervisorGroups()?.[selLoc.slice(9)] || []).map(String));
    }
    return new Set([selLoc]);
  }, [selLoc]);

  const cutoffStr = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() - windowDays);
    return d.toISOString().slice(0, 10);
  }, [windowDays]);

  const filteredRaw = useMemo(() => rawRows.filter(r => {
    if (r.date && r.date.toISOString().slice(0, 10) < cutoffStr) return false;
    if (scopedLocs && !scopedLocs.has(locNum(r.loc))) return false;
    return true;
  }), [rawRows, scopedLocs, cutoffStr]);

  // flattenSquadleRecords expects {loc, dt, shard, data} — ds's loader shape uses `date` (a Date)
  // and a camelCase field set (src/lib/supabase.js's loadSquadleChecklistRecords); re-shape here
  // rather than changing that loader's return contract for every other future consumer.
  const flat = useMemo(() => flattenSquadleRecords(filteredRaw.map(r => ({
    loc: r.loc, dt: r.date ? r.date.toISOString().slice(0, 10) : null, shard: r.shard, data: r.data,
  }))), [filteredRaw]);

  const rollup = useMemo(() => computeSquadleStoreDayRollup(flat), [flat]);
  const summary = useMemo(() => computeSquadleSummary(rollup), [rollup]);
  const flagged = useMemo(() => extractFlaggedItems(flat), [flat]);

  return h(RoutePanelShell, {
    icon: '🍔',
    title: 'Food Safety Checklists',
    subtitle: 'Squadle tablet checklists — completion rate and flagged readings (live-pulled daily)',
    onBack: onClose,
    headerExtra: div({ style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } },
      h(LocationSelector, {
        stores: ALL_LOCS.map(l => ({ loc: l })), invOrgCoords: INV_ORG_COORDS, storeNames: STORE_NAMES,
        mode: 'full', variant: 'dropdown',
        value: selLoc === 'all' ? { level: 'all', id: null }
          : selLoc === 'fl' ? { level: 'state', id: 'FL' }
          : selLoc === 'ok' ? { level: 'state', id: 'OK' }
          : selLoc.startsWith('__patch__') ? { level: 'patch', id: selLoc.slice(9) }
          : { level: 'store', id: selLoc },
        onChange: v => setSelLoc(
          v.level === 'all' ? 'all'
            : v.level === 'state' ? (v.id === 'OK' ? 'ok' : 'fl')
            : v.level === 'patch' ? '__patch__' + v.id
            : v.level === 'store' ? v.id
            : 'all'),
      }),
      div({ style: { display: 'flex', gap: 4 } },
        WINDOW_OPTIONS.map(d => btn({
          key: d, onClick: () => setWindowDays(d),
          style: { padding: '4px 10px', borderRadius: 'var(--r)', border: '.5px solid ' + (windowDays === d ? 'rgba(245,158,11,.4)' : 'var(--bdr)'),
            background: windowDays === d ? 'var(--adim)' : 'transparent', color: windowDays === d ? 'var(--amber)' : 'var(--text2)',
            fontSize: 10, fontWeight: windowDays === d ? 700 : 400, cursor: 'pointer' },
        }, d === 1 ? 'Today' : `${d}d`))),
    ),
  },
    // Not an error — the pull only started 2026-11-13 (task #105 Phase 2), so a few days of
    // history is expected, not a sign the stream is broken. stream-freshness.js's own Data
    // Manager tile is the place to check if this stream has genuinely gone stale.
    !rawRows.length && div({ style: { padding: 24, textAlign: 'center', color: 'var(--text3)', fontSize: 12 } },
      'No Squadle checklist data loaded yet for this session — check Data Manager for stream freshness.'),

    rawRows.length > 0 && div({ style: { padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' } },
      // District/scope summary cards
      div({ style: { display: 'flex', gap: 12, flexWrap: 'wrap' } },
        div({ style: { flex: '1 1 160px', padding: '12px 14px', borderRadius: 'var(--r)', border: '.5px solid var(--bdr)', background: 'var(--surf2)' } },
          div({ style: { fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.04em' } }, 'Completion'),
          div({ style: { fontSize: 22, fontWeight: 800, color: rateColor(summary.completionRate) } }, fPct(summary.completionRate)),
          div({ style: { fontSize: 10, color: 'var(--text3)' } }, `${summary.requiredCompletedCount.toLocaleString()} / ${summary.requiredCount.toLocaleString()} required actions`)),
        div({ style: { flex: '1 1 160px', padding: '12px 14px', borderRadius: 'var(--r)', border: '.5px solid var(--bdr)', background: 'var(--surf2)' } },
          div({ style: { fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.04em' } }, 'Flagged readings'),
          div({ style: { fontSize: 22, fontWeight: 800, color: summary.flaggedCount ? '#ef4444' : '#10b981' } }, summary.flaggedCount.toLocaleString()),
          div({ style: { fontSize: 10, color: 'var(--text3)' } }, 'temps out of range / "bad" answers')),
        div({ style: { flex: '1 1 160px', padding: '12px 14px', borderRadius: 'var(--r)', border: '.5px solid var(--bdr)', background: 'var(--surf2)' } },
          div({ style: { fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.04em' } }, 'Stores reporting'),
          div({ style: { fontSize: 22, fontWeight: 800, color: 'var(--text)' } }, summary.perStore.length),
          div({ style: { fontSize: 10, color: 'var(--text3)' } }, `over ${windowDays === 1 ? 'today' : `the last ${windowDays} days`}`))),

      // Per-store table, worst-completion-first (computeSquadleSummary's own sort)
      div({ style: { overflowX: 'auto' } },
        h('table', { style: { width: '100%', minWidth: 560, borderCollapse: 'collapse', fontSize: 12 } },
          h('thead', null, h('tr', { style: { borderBottom: '1px solid var(--bdr)' } },
            ['Store', 'Completion', 'Required Actions', 'Flagged', 'Days'].map(t =>
              h('th', { key: t, style: { textAlign: t === 'Store' ? 'left' : 'right', padding: '6px 8px', color: 'var(--text3)', fontWeight: 600, fontSize: 10, textTransform: 'uppercase' } }, t)))),
          h('tbody', null, summary.perStore.map(s => h('tr', { key: s.loc, style: { borderBottom: '.5px solid var(--bdr)' } },
            h('td', { style: { padding: '6px 8px' } }, storeLabel(s.loc)),
            h('td', { style: { padding: '6px 8px', textAlign: 'right', color: rateColor(s.completionRate), fontWeight: 700 } }, fPct(s.completionRate)),
            h('td', { style: { padding: '6px 8px', textAlign: 'right', color: 'var(--text2)' } }, `${s.requiredCompletedCount}/${s.requiredCount}`),
            h('td', { style: { padding: '6px 8px', textAlign: 'right', color: s.flaggedCount ? '#ef4444' : 'var(--text3)', fontWeight: s.flaggedCount ? 700 : 400 } }, s.flaggedCount),
            h('td', { style: { padding: '6px 8px', textAlign: 'right', color: 'var(--text3)' } }, s.days)))))),

      // Flagged items drill-down
      flagged.length > 0 && div(null,
        div({ style: { fontSize: 11, fontWeight: 700, color: 'var(--text2)', margin: '2px 0 6px', textTransform: 'uppercase', letterSpacing: '.04em' } }, `Flagged Readings (${flagged.length}${flagged.length > MAX_FLAGGED_ROWS ? ', showing newest ' + MAX_FLAGGED_ROWS : ''})`),
        div({ style: { overflowX: 'auto' } },
          h('table', { style: { width: '100%', minWidth: 760, borderCollapse: 'collapse', fontSize: 11 } },
            h('thead', null, h('tr', { style: { borderBottom: '1px solid var(--bdr)' } },
              ['Store', 'Edited', 'Shift', 'Task', 'Item', 'Value'].map(t =>
                h('th', { key: t, style: { textAlign: 'left', padding: '5px 7px', color: 'var(--text3)', fontWeight: 600, fontSize: 10, textTransform: 'uppercase' } }, t)))),
            h('tbody', null, flagged.slice(0, MAX_FLAGGED_ROWS).map((f, i) => h('tr', { key: i, style: { borderBottom: '.5px solid var(--bdr)' } },
              h('td', { style: { padding: '5px 7px' } }, storeLabel(f.loc)),
              h('td', { style: { padding: '5px 7px', color: 'var(--text3)', whiteSpace: 'nowrap' } }, f.lastEdited ? new Date(f.lastEdited).toLocaleString() : '—'),
              h('td', { style: { padding: '5px 7px', color: 'var(--text2)' } }, f.shiftName || '—'),
              h('td', { style: { padding: '5px 7px', color: 'var(--text2)' } }, f.taskName || '—'),
              h('td', { style: { padding: '5px 7px', color: 'var(--text)' } }, f.label || '—'),
              h('td', { style: { padding: '5px 7px', color: '#ef4444', fontWeight: 700 } }, String(f.value))))))))));
}
