// @ts-nocheck
// ── Top/Bottom Performers (dispatch #77 Step 3) ────────────────────────────────
// Pick metric -> scope (All/State/Org/Patch/Store, the standing pill hierarchy) -> window ->
// ranked list, best and worst ends. Reuses what already exists rather than rebuilding it:
// metricSeries (engine/metric-source.js, via engine/top-bottom-performers.js's rankPerformers)
// for auto-first sourcing, components/PanelControls.js's LocationSelector for the scope picker,
// and visit-readiness.js's Bar for the house meter style. See memory/dispatch-77.md.
//
// A metric the direction registry can't resolve (park, actVsNeed, anything undeclared) is not
// offered here at all -- PERFORMER_METRICS only lists rankable keys (see that file's own guard
// test cross-checking it against rankableMetricKeys()).
import * as React from 'react';
import { ModalShell } from '../components/ModalShell.js';
import { LocationSelector, buildLocationHierarchy, locationSelectorLocs } from '../components/PanelControls.js';
import { STORE_NAMES, INV_ORG_COORDS, sNameC } from '../constants.js';
import { Bar } from './visit-readiness.js';
import { rankPerformers, PERFORMER_METRICS } from '../engine/top-bottom-performers.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);
const btn = (p, ...c) => h('button', p, ...c);

const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const WINDOW_PRESETS = [
  { id: 'lw',  label: 'Last Week',   fn: () => { const e = addDays(new Date(), -1); return { s: addDays(e, -6), e }; } },
  { id: 'l4w', label: 'Last 4 Weeks',fn: () => { const e = addDays(new Date(), -1); return { s: addDays(e, -27), e }; } },
  { id: 'l6w', label: 'Last 6 Weeks',fn: () => { const e = addDays(new Date(), -1); return { s: addDays(e, -41), e }; } },
  { id: 'mtd', label: 'Month to Date', fn: () => { const t = new Date(); return { s: new Date(t.getFullYear(), t.getMonth(), 1), e: addDays(t, -1) }; } },
];

// Pure: min-max normalize a value into the Bar component's expected 0-100 "how good is this"
// scale, relative to the OTHER ranked rows in this same scope/window/metric -- never an
// absolute cross-metric scale (a $ figure and a % figure aren't comparable in magnitude, only
// in rank-within-their-own-list). direction is folded in here so a "lower" metric's smallest
// value still draws the longest (best) bar.
function normalize(value, rows, direction) {
  if (!rows.length) return 0;
  const vals = rows.map(r => r.value);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi === lo) return 100;
  const frac = (value - lo) / (hi - lo);
  return Math.round((direction === 'lower' ? 1 - frac : frac) * 100);
}

function PerformerRow({ rank, row, metric, rows, direction, onSelect }) {
  return div({
    key: row.loc, onClick: () => onSelect && onSelect(row.loc),
    'data-testid': 'performer-row', 'data-loc': row.loc,
    style: { display: 'flex', alignItems: 'center', gap: 10, padding: '7px 14px', borderBottom: '.5px solid var(--bdr)', cursor: onSelect ? 'pointer' : 'default' },
  },
    div({ style: { width: 20, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' } }, rank),
    div({ style: { width: 140, fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, sNameC(row.loc) || row.loc),
    h(Bar, { score: normalize(row.value, rows, direction), w: 70 }),
    div({ style: { fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, minWidth: 74, textAlign: 'right' } }, metric.fmt(row.value)),
    div({ style: { fontSize: 9, color: 'var(--text3)', minWidth: 34, textAlign: 'right' } }, 'n=' + row.n),
  );
}

export function TopBottomPerformers({ stores, ds, onClose, onSelectStore }) {
  const { useState, useMemo } = React;
  const [metricKey, setMetricKey] = useState('sales');
  const [scope, setScope] = useState({ level: 'all', id: null });
  const [windowId, setWindowId] = useState('l4w');

  const metric = PERFORMER_METRICS.find(m => m.key === metricKey) || PERFORMER_METRICS[0];
  const range = useMemo(() => (WINDOW_PRESETS.find(w => w.id === windowId) || WINDOW_PRESETS[1]).fn(), [windowId]);

  const tree = useMemo(() => buildLocationHierarchy(stores, INV_ORG_COORDS, STORE_NAMES), [stores]);
  const locs = useMemo(() => locationSelectorLocs(scope, tree), [scope, tree]);

  const result = useMemo(
    () => rankPerformers(ds, { metricKey, locs, range: { s: range.s, e: range.e } }),
    [ds, metricKey, locs, range.s, range.e],
  );

  const { direction, rows, thinRows } = result;
  const top = rows.slice(0, 5);
  const bottom = rows.length > 5 ? rows.slice(-5).reverse() : [];

  return h(ModalShell, {
    title: '🏆 Top/Bottom Performers', onClose, maxWidth: 720,
    subtitle: 'Ranked at the individual store — never a cross-store average',
  },
    div({ style: { padding: '8px 14px', borderBottom: '.5px solid var(--bdr)', display: 'flex', gap: 4, flexWrap: 'wrap' } },
      PERFORMER_METRICS.map(m => btn({
        key: m.key, className: 'sbtn' + (metricKey === m.key ? ' on' : ''), style: { fontSize: 10 },
        onClick: () => setMetricKey(m.key),
      }, m.label))),
    div({ style: { padding: '8px 14px', borderBottom: '.5px solid var(--bdr)' } },
      h(LocationSelector, { stores, invOrgCoords: INV_ORG_COORDS, storeNames: STORE_NAMES, value: scope, onChange: setScope })),
    div({ style: { padding: '6px 14px', borderBottom: '.5px solid var(--bdr)', display: 'flex', gap: 5, alignItems: 'center', background: 'var(--surf2)' } },
      span({ style: { fontSize: 8, color: 'var(--text3)', marginRight: 2 } }, 'Window:'),
      WINDOW_PRESETS.map(w => btn({
        key: w.id, className: 'btn btn-sm', style: {
          fontSize: 9, padding: '2px 9px',
          background: windowId === w.id ? 'rgba(245,188,0,.14)' : 'transparent',
          color: windowId === w.id ? 'var(--gold)' : 'var(--text3)',
          borderColor: windowId === w.id ? 'rgba(245,188,0,.4)' : 'var(--bdr)',
        },
        onClick: () => setWindowId(w.id),
      }, w.label))),
    // The figure in each row is the MEAN OF THAT STORE'S DAILY VALUES over the window, which for
    // a ratio metric is an average-of-averages, NOT the period figure a P&L would show (the true
    // Sum/Sum is deferred -- see engine/top-bottom-performers.js's header and
    // memory/dispatch-77.md). Say so on the surface rather than letting a bare "Labor %" imply
    // the period value: the standing rule is that a panel states its metric's window and basis.
    div({ style: { padding: '2px 14px 8px', fontSize: 9, color: 'var(--text3)', fontStyle: 'italic' } },
      'Figures are the daily average over the window, not the period total — ratios are not '
      + 'volume-weighted. n = days of data.'),
    div({ style: { overflowY: 'auto', flex: 1 } },
      !direction ? div({ style: { padding: 20, fontSize: 12, color: 'var(--text3)' } },
        'This metric has no ruled direction yet — not rankable.') :
      !rows.length ? div({ style: { padding: 20, fontSize: 12, color: 'var(--text3)' } },
        'No stores in this scope have enough data for ' + metric.label + ' over this window.') :
      [
        div({ key: 'top', style: { padding: '8px 14px 2px', fontSize: 9, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em' } }, '🥇 Best'),
        ...top.map((row, i) => h(PerformerRow, { key: 'top-' + row.loc, rank: i + 1, row, metric, rows, direction, onSelect: onSelectStore })),
        bottom.length ? div({ key: 'bottom-hdr', style: { padding: '10px 14px 2px', fontSize: 9, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em' } }, '🔻 Needs Attention') : null,
        ...bottom.map((row, i) => h(PerformerRow, { key: 'bot-' + row.loc, rank: rows.length - i, row, metric, rows, direction, onSelect: onSelectStore })),
        thinRows.length ? div({ key: 'thin-hdr', style: { padding: '10px 14px 4px', fontSize: 9, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em' } },
          'Insufficient data — excluded from ranking') : null,
        ...thinRows.map(row => div({ key: 'thin-' + row.loc, style: { display: 'flex', alignItems: 'center', gap: 10, padding: '6px 14px', borderBottom: '.5px solid var(--bdr)', opacity: .6 } },
          div({ style: { width: 160, fontSize: 11 } }, sNameC(row.loc) || row.loc),
          div({ style: { fontSize: 9, color: 'var(--text3)' } }, 'n=' + row.n + ' (too little data to rank against n=' + Math.round(result.maxN) + ')'))),
      ]),
  );
}
