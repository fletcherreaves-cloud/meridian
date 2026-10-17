// @ts-nocheck
// ── Item Velocity report (Reports redesign Phase 5, 2026-10-16) ──────────────────────────────
// Built on ReportShell exactly like Loss Prevention Summary (Phase 2). Data comes from
// engine/item-velocity.js — one pass over ds.pmixRows, not the per-item Signal Lab resolver.
import * as React from 'react';
import { ReportShell } from '../components/ReportShell.js';
import { STORE_NAMES, INV_ORG_COORDS, sNameC } from '../constants.js';
import { f$, fN } from '../utils/fmt.js';
import { buildItemVelocityReport, DEFAULT_TOP_N } from '../engine/item-velocity.js';
import { useSortedRows, SortTh } from '../components/SortableTh.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const td = (p, ...c) => h('td', p, ...c);
const tr = (p, ...c) => h('tr', p, ...c);

// Already-percentage number (e.g. +200, -35.5) — same convention weather-impact.js's fDelta.
function fTrend(n) { return n == null ? '—' : (n >= 0 ? '+' : '') + n.toFixed(1) + '%'; }

const _allStores = Object.keys(STORE_NAMES).map(l => ({ loc: l }));

export function ItemVelocityPanel({ ds, stores, onClose }) {
  const { useState } = React;
  const [rows, setRows] = useState(null);
  const { sorted, sortKey, sortDir, onSort } = useSortedRows(rows);

  const run = async ({ locs, range }) => {
    setRows(buildItemVelocityReport(ds, { locs, range }));
  };

  const getExportData = () => ({
    title: 'Item Velocity',
    headers: ['Item', 'Units Sold', 'Revenue ($)', 'Trend (1st half → 2nd half)'],
    rows: (rows || []).map(r => [r.label, fN(r.totalSoldQty, 0), f$(r.totalRevenue), fTrend(r.trendPct)]),
  });

  return h(ReportShell, {
    title: 'Item Velocity', icon: '🔥', onBack: onClose,
    subtitlePrefix: `What's selling and what's dying, across the selected stores (top ${DEFAULT_TOP_N} by volume)`,
    stores: (stores && stores.length) ? stores : _allStores, invOrgCoords: INV_ORG_COORDS, storeNames: STORE_NAMES,
    onRun: run, getExportData,
  },
    div({ style: { fontSize: '10.5px', color: 'var(--text2)', lineHeight: 1.6, marginBottom: 10, padding: '8px 10px', background: 'var(--surf2)', border: '.5px solid var(--bdr)', borderRadius: 8 } },
      'One row per item sold across the stores you pick, aggregated into a district (or single-store) total, ',
      'sorted by units sold. ', h('b', null, 'Trend'), ' compares the first half of your date range to the second ',
      'half (each normalized to a per-day rate) — a big move either way is worth a look: a fast riser may be worth ',
      'featuring, a fast faller may be worth checking for a quality or availability issue.'),
    rows == null
      ? div({ style: { textAlign: 'center', color: 'var(--text3)', padding: 30, fontSize: '11px' } }, 'Choose a date range and location, then Run Report.')
      : !rows.length
        ? div({ style: { textAlign: 'center', color: 'var(--text3)', padding: 30, fontSize: '11px' } }, 'No product-mix data for this selection.')
        : div({ style: { overflowX: 'auto' } },
          h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '9.5px', minWidth: 700 } },
            h('thead', null, h('tr', null,
              h(SortTh, { label: 'Item', colKey: 'label', sortKey, sortDir, onSort, style: { position: 'sticky', left: 0, background: 'var(--surf)' } }),
              h(SortTh, { label: 'Units Sold', colKey: 'totalSoldQty', sortKey, sortDir, onSort, align: 'right' }),
              h(SortTh, { label: 'Revenue ($)', colKey: 'totalRevenue', sortKey, sortDir, onSort, align: 'right' }),
              h(SortTh, { label: 'Trend', colKey: 'trendPct', sortKey, sortDir, onSort, align: 'right' }),
            )),
            h('tbody', null, ...sorted.map((r, i) => tr({ key: r.item, style: { borderBottom: '.5px solid var(--bdr)', background: i % 2 ? 'var(--surf2)' : 'transparent' } },
              td({ style: { padding: '5px 8px', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', position: 'sticky', left: 0, background: i % 2 ? 'var(--surf2)' : 'var(--surf)' } }, r.label),
              td({ style: { padding: '5px 8px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text2)' } }, fN(r.totalSoldQty, 0)),
              td({ style: { padding: '5px 8px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text2)' } }, f$(r.totalRevenue)),
              td({ style: { padding: '5px 8px', textAlign: 'right', fontFamily: 'var(--mono)', color: r.trendPct == null ? 'var(--text3)' : r.trendPct >= 0 ? '#10b981' : '#ef4444' } }, fTrend(r.trendPct)),
            ))),
          ),
        ),
  );
}
