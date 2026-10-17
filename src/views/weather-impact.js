// @ts-nocheck
// ── Weather Impact report (Reports redesign Phase 5, 2026-10-16) ─────────────────────────────
// Built on ReportShell exactly like Loss Prevention Summary (Phase 2). Data comes from
// engine/weather-impact.js — see that file's header for why this is a simple historical split
// rather than a matched-day design.
import * as React from 'react';
import { ReportShell } from '../components/ReportShell.js';
import { STORE_NAMES, INV_ORG_COORDS, sNameC } from '../constants.js';
import { f$ } from '../utils/fmt.js';
import { buildWeatherImpactReport } from '../engine/weather-impact.js';
import { useSortedRows, SortTh } from '../components/SortableTh.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const td = (p, ...c) => h('td', p, ...c);
const tr = (p, ...c) => h('tr', p, ...c);

// Deltas here are already percentages (e.g. -28.17, not 0.2817) — the plain-number ± formatter
// promo-roi.js's own local fPct uses for the identical reason, NOT utils/fmt.js's fP/fPct (both
// of which expect a fraction and would double-multiply this).
function fDelta(n) { return n == null ? '—' : (n >= 0 ? '+' : '') + n.toFixed(1) + '%'; }
function fAvg(n) { return n == null ? '—' : f$(n); }

const COLS = [
  { key: 'rainyDays', label: 'Rainy Days', fmt: v => v == null ? '—' : String(v) },
  { key: 'dryDays', label: 'Dry Days', fmt: v => v == null ? '—' : String(v) },
  { key: 'rainySalesAvg', label: 'Avg Sales, Rainy', fmt: fAvg },
  { key: 'drySalesAvg', label: 'Avg Sales, Dry', fmt: fAvg },
  { key: 'rainSalesDeltaPct', label: 'Sales Δ (Rain)', fmt: fDelta },
  { key: 'rainGCDeltaPct', label: 'Guests Δ (Rain)', fmt: fDelta },
  { key: 'hotDays', label: 'Hot Days', fmt: v => v == null ? '—' : String(v) },
  { key: 'coolDays', label: 'Cool Days', fmt: v => v == null ? '—' : String(v) },
  { key: 'hotSalesAvg', label: 'Avg Sales, Hot Half', fmt: fAvg },
  { key: 'coolSalesAvg', label: 'Avg Sales, Cool Half', fmt: fAvg },
  { key: 'heatSalesDeltaPct', label: 'Sales Δ (Heat)', fmt: fDelta },
  { key: 'heatGCDeltaPct', label: 'Guests Δ (Heat)', fmt: fDelta },
];

const _allStores = Object.keys(STORE_NAMES).map(l => ({ loc: l }));

export function WeatherImpactPanel({ ds, stores, onClose }) {
  const { useState } = React;
  const [rows, setRows] = useState(null);
  const { sorted, sortKey, sortDir, onSort } = useSortedRows(rows);

  const run = async ({ locs, range }) => {
    setRows(buildWeatherImpactReport(ds, { locs, range }));
  };

  const getExportData = () => ({
    title: 'Weather Impact',
    headers: ['Store', ...COLS.map(c => c.label)],
    rows: (rows || []).map(r => [sNameC(r.loc) || r.name, ...COLS.map(c => c.fmt(r[c.key]))]),
  });

  return h(ReportShell, {
    title: 'Weather Impact', icon: '🌦️', onBack: onClose,
    subtitlePrefix: 'How rain and heat have historically moved this store’s sales and guest counts',
    stores: (stores && stores.length) ? stores : _allStores, invOrgCoords: INV_ORG_COORDS, storeNames: STORE_NAMES,
    onRun: run, getExportData,
  },
    div({ style: { fontSize: '10.5px', color: 'var(--text2)', lineHeight: 1.6, marginBottom: 10, padding: '8px 10px', background: 'var(--surf2)', border: '.5px solid var(--bdr)', borderRadius: 8 } },
      'How to read this: each store’s loaded days are split into rainy vs. dry, and the hotter half vs. the cooler ',
      'half (by that store’s own median high temp over the range). A real, sizable delta here is this store’s own ',
      'measured weather sensitivity — use it to prep staffing/prep ahead of a forecasted rain day or heat wave. A ',
      'simple historical split, not a matched-day design — association, not a controlled comparison.'),
    rows == null
      ? div({ style: { textAlign: 'center', color: 'var(--text3)', padding: 30, fontSize: '11px' } }, 'Choose a date range and location, then Run Report.')
      : !rows.length
        ? div({ style: { textAlign: 'center', color: 'var(--text3)', padding: 30, fontSize: '11px' } }, 'No stores matched this selection.')
        : div({ style: { overflowX: 'auto' } },
          h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '9.5px', minWidth: 1300 } },
            h('thead', null, h('tr', null,
              h(SortTh, { label: 'Store', colKey: 'name', sortKey, sortDir, onSort, style: { position: 'sticky', left: 0, background: 'var(--surf)' } }),
              ...COLS.map(c => h(SortTh, { key: c.key, label: c.label, colKey: c.key, sortKey, sortDir, onSort, align: 'right' })),
            )),
            h('tbody', null, ...sorted.map((r, i) => tr({ key: r.loc, style: { borderBottom: '.5px solid var(--bdr)', background: i % 2 ? 'var(--surf2)' : 'transparent' } },
              td({ style: { padding: '5px 8px', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', position: 'sticky', left: 0, background: i % 2 ? 'var(--surf2)' : 'var(--surf)' } }, sNameC(r.loc) || r.name),
              ...COLS.map(c => td({ key: c.key, style: { padding: '5px 8px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text2)' } }, c.fmt(r[c.key]))),
            ))),
          ),
        ),
  );
}
