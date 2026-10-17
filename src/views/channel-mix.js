// @ts-nocheck
// ── Channel Mix report (Reports redesign Phase 5, 2026-10-16) ────────────────────────────────
// Built on ReportShell exactly like Loss Prevention Summary (Phase 2). Data comes from
// engine/channel-mix.js — Sales Ledger's existing DT/Delivery/MOP/Kiosk/Front-Counter % fields,
// never shown together as a trend report before.
import * as React from 'react';
import { ReportShell } from '../components/ReportShell.js';
import { STORE_NAMES, INV_ORG_COORDS, sNameC } from '../constants.js';
import { fP } from '../utils/fmt.js';
import { buildChannelMixReport, CHANNEL_MIX_METRICS } from '../engine/channel-mix.js';
import { useSortedRows, SortTh } from '../components/SortableTh.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const td = (p, ...c) => h('td', p, ...c);
const tr = (p, ...c) => h('tr', p, ...c);

// Trend columns are already in PERCENTAGE POINTS (e.g. +3.2, -1.0), not a fraction -- fP would
// multiply by 100 again. Plain ± one-decimal point formatting, same convention every other
// Phase 5 trend column in this batch uses for an already-computed delta.
function fTrendPts(n) { return n == null ? '—' : (n >= 0 ? '+' : '') + n.toFixed(1) + 'pt'; }
function fPctOrDash(v) { return v == null ? '—' : fP(v, 1); }

const _allStores = Object.keys(STORE_NAMES).map(l => ({ loc: l }));

export function ChannelMixPanel({ ds, stores, onClose }) {
  const { useState } = React;
  const [rows, setRows] = useState(null);
  const { sorted, sortKey, sortDir, onSort } = useSortedRows(rows);

  const run = async ({ locs, range }) => {
    setRows(buildChannelMixReport(ds, { locs, range }));
  };

  const getExportData = () => ({
    title: 'Channel Mix',
    headers: ['Store', ...CHANNEL_MIX_METRICS.flatMap(m => [m.label, m.label + ' Trend'])],
    rows: (rows || []).map(r => [sNameC(r.loc) || r.name, ...CHANNEL_MIX_METRICS.flatMap(m => [fPctOrDash(r[m.key]), fTrendPts(r[m.key + 'TrendPts'])])]),
  });

  return h(ReportShell, {
    title: 'Channel Mix', icon: '🔀', onBack: onClose,
    subtitlePrefix: 'DT / Delivery / Mobile Order Pickup / Kiosk / Front Counter — % of sales and how it’s trending',
    stores: (stores && stores.length) ? stores : _allStores, invOrgCoords: INV_ORG_COORDS, storeNames: STORE_NAMES,
    onRun: run, getExportData,
  },
    div({ style: { fontSize: '10.5px', color: 'var(--text2)', lineHeight: 1.6, marginBottom: 10, padding: '8px 10px', background: 'var(--surf2)', border: '.5px solid var(--bdr)', borderRadius: 8 } },
      'Each channel’s % is the period average; ', h('b', null, 'Trend'), ' compares the first half of your date ',
      'range to the second half, in percentage POINTS (not a relative change) — a store shifting several points ',
      'toward or away from a channel over the period is the real signal, not the single-period average alone.'),
    rows == null
      ? div({ style: { textAlign: 'center', color: 'var(--text3)', padding: 30, fontSize: '11px' } }, 'Choose a date range and location, then Run Report.')
      : !rows.length
        ? div({ style: { textAlign: 'center', color: 'var(--text3)', padding: 30, fontSize: '11px' } }, 'No stores matched this selection.')
        : div({ style: { overflowX: 'auto' } },
          h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '9.5px', minWidth: 1200 } },
            h('thead', null, h('tr', null,
              h(SortTh, { label: 'Store', colKey: 'name', sortKey, sortDir, onSort, style: { position: 'sticky', left: 0, background: 'var(--surf)' } }),
              ...CHANNEL_MIX_METRICS.flatMap(m => [
                h(SortTh, { key: m.key, label: m.label, colKey: m.key, sortKey, sortDir, onSort, align: 'right' }),
                h(SortTh, { key: m.key + 'T', label: 'Trend', colKey: m.key + 'TrendPts', sortKey, sortDir, onSort, align: 'right' }),
              ]),
            )),
            h('tbody', null, ...sorted.map((r, i) => tr({ key: r.loc, style: { borderBottom: '.5px solid var(--bdr)', background: i % 2 ? 'var(--surf2)' : 'transparent' } },
              td({ style: { padding: '5px 8px', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', position: 'sticky', left: 0, background: i % 2 ? 'var(--surf2)' : 'var(--surf)' } }, sNameC(r.loc) || r.name),
              ...CHANNEL_MIX_METRICS.flatMap(m => [
                td({ key: m.key, style: { padding: '5px 8px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text2)' } }, fPctOrDash(r[m.key])),
                td({ key: m.key + 'T', style: { padding: '5px 8px', textAlign: 'right', fontFamily: 'var(--mono)', color: r[m.key + 'TrendPts'] == null ? 'var(--text3)' : 'var(--text2)' } }, fTrendPts(r[m.key + 'TrendPts'])),
              ]),
            ))),
          ),
        ),
  );
}
