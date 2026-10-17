// @ts-nocheck
// ── FOB Reference Table report (2026-10-17, owner: "And, yes, build it") ────────────────────
// Live version of the owner's own Excel "Table 1 (2)" BX:CD reference table — Loc / L3M / L6W /
// LM / MTD / Projected / Trend for the 16 metrics he XLOOKUPs into that sheet's per-store target
// columns. Built on ReportShell exactly like every other report in this redesign; the real
// computation lives in engine/fob-reference.js (see that file's header for why the 11 FOB-leg
// metrics reconstruct true daily $ deltas instead of averaging qsr_fob's cumulative MTD rows).
import * as React from 'react';
import { ReportShell } from '../components/ReportShell.js';
import { STORE_NAMES, INV_ORG_COORDS, sNameC } from '../constants.js';
import { fP, f$, fN } from '../utils/fmt.js';
import { computeFobReferenceTable, FOB_REFERENCE_METRICS } from '../engine/fob-reference.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const td = (p, ...c) => h('td', p, ...c);
const tr = (p, ...c) => h('tr', p, ...c);
const th = (p, ...c) => h('th', p, ...c);

const WINDOW_COLS = [
  { key: 'l3m', label: 'L3M' }, { key: 'l6w', label: 'L6W' }, { key: 'lm', label: 'LM' },
  { key: 'mtd', label: 'MTD' }, { key: 'projected', label: 'Projected' },
];

const TREND_ARROW = { up: '▲', down: '▼', flat: '▬' };

function _fmt(v, kind) {
  if (v == null) return '—';
  if (kind === 'dollar') return f$(v);
  if (kind === 'rate') return fN(v, 2);
  return fP(v, 2);
}

// Trend arrow color follows the metric's own `better` direction — up is good only for
// better:'higher' metrics (Sales Projection, Comp Sales %, TPPH), bad for everything else
// (every cost % wants to trend down). Flat is always neutral.
function _trendColor(trend, better) {
  if (trend === 'flat') return 'var(--text3)';
  const good = (trend === 'up') === (better === 'higher');
  return good ? 'var(--good)' : 'var(--crit)';
}

const _allStores = Object.keys(STORE_NAMES).map(l => ({ loc: l }));

export function FobReferenceTablePanel({ ds, stores, onClose }) {
  const { useState, useMemo } = React;
  const [metricKey, setMetricKey] = useState(FOB_REFERENCE_METRICS[0].key);
  const [rows, setRows] = useState(null);

  const run = async ({ locs, range }) => {
    const asOf = range?.e ? new Date(range.e) : new Date();
    setRows(computeFobReferenceTable(ds, locs, isNaN(asOf) ? new Date() : asOf));
  };

  const metric = useMemo(() => FOB_REFERENCE_METRICS.find(m => m.key === metricKey) || FOB_REFERENCE_METRICS[0], [metricKey]);

  const getExportData = () => ({
    title: 'FOB Reference Table',
    headers: ['Store', 'Metric', ...WINDOW_COLS.map(c => c.label), 'Trend'],
    rows: (rows || []).flatMap(r => FOB_REFERENCE_METRICS.map(m => {
      const cell = r.metrics[m.key];
      return [sNameC(r.loc) || r.loc, m.label,
        ...WINDOW_COLS.map(c => _fmt(cell[c.key], m.kind)), cell.trend];
    })),
  });

  return h(ReportShell, {
    title: 'FOB Reference Table', icon: '📋', onBack: onClose,
    subtitlePrefix: 'Rolling L3M / L6W / LM / MTD / Projected / Trend for each store — live off auto-pulled streams, no manual paste',
    stores: (stores && stores.length) ? stores : _allStores, invOrgCoords: INV_ORG_COORDS, storeNames: STORE_NAMES,
    onRun: run, getExportData,
  },
    div({ style: { fontSize: '10.5px', color: 'var(--text2)', lineHeight: 1.6, marginBottom: 10, padding: '8px 10px', background: 'var(--surf2)', border: '.5px solid var(--bdr)', borderRadius: 8 } },
      'How to read this: pick a metric below — the table shows each store\'s own trailing 3-month average (L3M), ',
      'trailing 6-week average (L6W), last completed month (LM), and current month-to-date (MTD), plus a Projected ',
      'figure (blends MTD with L3M, weighted toward MTD as the month progresses) and a 6-month Trend arrow. Export ',
      'dumps every one of the 16 metrics for every selected store in one file — the same shape as the Excel reference ',
      'table, meant to inform target-setting in the master workbook, not replace it.'),
    div({ style: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 } },
      h('label', { style: { fontSize: '10px', color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.3px' } }, 'Metric'),
      h('select', {
        value: metricKey, onChange: e => setMetricKey(e.target.value),
        style: { fontSize: '11px', padding: '4px 8px', borderRadius: 6, border: '.5px solid var(--bdr)', background: 'var(--surf)', color: 'var(--text)' },
      }, ...FOB_REFERENCE_METRICS.map(m => h('option', { key: m.key, value: m.key }, m.label))),
    ),
    rows == null
      ? div({ style: { textAlign: 'center', color: 'var(--text3)', padding: 30, fontSize: '11px' } }, 'Choose a date range and location, then Run Report.')
      : !rows.length
        ? div({ style: { textAlign: 'center', color: 'var(--text3)', padding: 30, fontSize: '11px' } }, 'No stores in this selection.')
        : div({ style: { overflowX: 'auto' } },
          h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '10px', minWidth: 760 } },
            h('thead', null, h('tr', null,
              th({ style: { textAlign: 'left', fontSize: '8px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.3px', padding: '4px 8px', borderBottom: '.5px solid var(--bdr)', position: 'sticky', left: 0, background: 'var(--surf)' } }, 'Store'),
              ...WINDOW_COLS.map(c => th({ key: c.key, style: { textAlign: 'right', fontSize: '8px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.3px', padding: '4px 8px', borderBottom: '.5px solid var(--bdr)', whiteSpace: 'nowrap' } }, c.label)),
              th({ style: { textAlign: 'center', fontSize: '8px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.3px', padding: '4px 8px', borderBottom: '.5px solid var(--bdr)', whiteSpace: 'nowrap' } }, 'Trend'),
            )),
            h('tbody', null, ...rows.map((r, i) => {
              const cell = r.metrics[metric.key];
              return tr({ key: r.loc, style: { borderBottom: '.5px solid var(--bdr)', background: i % 2 ? 'var(--surf2)' : 'transparent' } },
                td({ style: { padding: '5px 8px', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', position: 'sticky', left: 0, background: i % 2 ? 'var(--surf2)' : 'var(--surf)' } }, sNameC(r.loc) || r.loc),
                ...WINDOW_COLS.map(c => td({ key: c.key, style: { padding: '5px 8px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text2)' } }, _fmt(cell[c.key], metric.kind))),
                td({ style: { padding: '5px 8px', textAlign: 'center', fontWeight: 700, color: _trendColor(cell.trend, metric.better) } }, TREND_ARROW[cell.trend]),
              );
            })),
          ),
        ),
  );
}
