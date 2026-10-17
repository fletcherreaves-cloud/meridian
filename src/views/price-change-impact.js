// @ts-nocheck
// ── Price Change Impact report (Reports redesign Phase 5, 2026-10-16) ────────────────────────
// Built on ReportShell exactly like Loss Prevention Summary (Phase 2). Data comes from
// engine/price-change-impact.js, which reuses price-events.js's existing confirmed-step
// detector (the same one the Pricing Engine's live simulator and Signal Lab already trust) —
// this report is the retrospective view that detector has never had.
import * as React from 'react';
import { ReportShell } from '../components/ReportShell.js';
import { STORE_NAMES, INV_ORG_COORDS, sNameC } from '../constants.js';
import { f$, fN } from '../utils/fmt.js';
import { buildPriceChangeImpactReport } from '../engine/price-change-impact.js';
import { useSortedRows, SortTh } from '../components/SortableTh.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const td = (p, ...c) => h('td', p, ...c);
const tr = (p, ...c) => h('tr', p, ...c);

// Already-percentage numbers (e.g. +10, -3.2) — same convention weather-impact.js's fDelta
// uses, not utils/fmt.js's fraction-expecting fP/fPct.
function fDelta(n) { return n == null ? '—' : (n >= 0 ? '+' : '') + n.toFixed(1) + '%'; }
function fAvg(n) { return n == null ? '—' : f$(n); }
function fDays(n) { return n == null ? '—' : String(n); }

const COLS = [
  { key: 'date', label: 'Change Date', fmt: v => v || '—' },
  { key: 'itemsChanged', label: 'Items Repriced', fmt: fDays },
  { key: 'meanStepPct', label: 'Avg Price Step', fmt: fDelta },
  { key: 'beforeSalesAvg', label: 'Avg Sales, Before', fmt: fAvg },
  { key: 'afterSalesAvg', label: 'Avg Sales, After', fmt: fAvg },
  { key: 'salesDeltaPct', label: 'Sales Δ', fmt: fDelta },
  { key: 'beforeGCAvg', label: 'Avg Guests, Before', fmt: v => v == null ? '—' : fN(v, 0) },
  { key: 'afterGCAvg', label: 'Avg Guests, After', fmt: v => v == null ? '—' : fN(v, 0) },
  { key: 'gcDeltaPct', label: 'Guests Δ', fmt: fDelta },
  { key: 'beforeDaysObserved', label: 'Days Observed, Before', fmt: fDays },
  { key: 'afterDaysObserved', label: 'Days Observed, After', fmt: fDays },
];

const _allStores = Object.keys(STORE_NAMES).map(l => ({ loc: l }));

export function PriceChangeImpactPanel({ ds, stores, onClose }) {
  const { useState } = React;
  const [rows, setRows] = useState(null);
  const { sorted, sortKey, sortDir, onSort } = useSortedRows(rows);

  const run = async ({ locs, range }) => {
    setRows(buildPriceChangeImpactReport(ds, { locs, range }));
  };

  const getExportData = () => ({
    title: 'Price Change Impact',
    headers: ['Store', ...COLS.map(c => c.label)],
    rows: (rows || []).map(r => [sNameC(r.loc) || r.name, ...COLS.map(c => c.fmt(r[c.key]))]),
  });

  return h(ReportShell, {
    title: 'Price Change Impact', icon: '🎚️', onBack: onClose,
    subtitlePrefix: 'What happened to sales and guest counts in the 14 days after each confirmed repricing event',
    stores: (stores && stores.length) ? stores : _allStores, invOrgCoords: INV_ORG_COORDS, storeNames: STORE_NAMES,
    onRun: run, getExportData,
  },
    div({ style: { fontSize: '10.5px', color: 'var(--text2)', lineHeight: 1.6, marginBottom: 10, padding: '8px 10px', background: 'var(--surf2)', border: '.5px solid var(--bdr)', borderRadius: 8 } },
      'Only CONFIRMED repricing events show here — the same 14-observed-day-flat-before/after ', h('b', null, 'detector'),
      ' the Pricing Engine’s live simulator and Signal Lab already use, not a second one. One row per store per ',
      'confirmed change date within your selected range. A big, sustained sales/guest move after the change date is ',
      'this item set’s real measured price elasticity for this store — a small or flat one says the repricing cost ',
      'little in volume.'),
    rows == null
      ? div({ style: { textAlign: 'center', color: 'var(--text3)', padding: 30, fontSize: '11px' } }, 'Choose a date range and location, then Run Report.')
      : !rows.length
        ? div({ style: { textAlign: 'center', color: 'var(--text3)', padding: 30, fontSize: '11px' } }, 'No confirmed price changes in this range/selection.')
        : div({ style: { overflowX: 'auto' } },
          h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '9.5px', minWidth: 1300 } },
            h('thead', null, h('tr', null,
              h(SortTh, { label: 'Store', colKey: 'name', sortKey, sortDir, onSort, style: { position: 'sticky', left: 0, background: 'var(--surf)' } }),
              ...COLS.map(c => h(SortTh, { key: c.key, label: c.label, colKey: c.key, sortKey, sortDir, onSort, align: 'right' })),
            )),
            h('tbody', null, ...sorted.map((r, i) => tr({ key: r.loc + '|' + r.date, style: { borderBottom: '.5px solid var(--bdr)', background: i % 2 ? 'var(--surf2)' : 'transparent' } },
              td({ style: { padding: '5px 8px', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', position: 'sticky', left: 0, background: i % 2 ? 'var(--surf2)' : 'var(--surf)' } }, sNameC(r.loc) || r.name),
              ...COLS.map(c => td({ key: c.key, style: { padding: '5px 8px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text2)' } }, c.fmt(r[c.key]))),
            ))),
          ),
        ),
  );
}
