// @ts-nocheck
// ── Labor Opportunity Cost report (Reports redesign Phase 5, 2026-10-16) ─────────────────────
// Built on ReportShell exactly like Loss Prevention Summary (Phase 2). Data comes from
// engine/labor-opportunity-cost.js — see that file's header for the total-vs-average rule
// each column follows.
import * as React from 'react';
import { ReportShell } from '../components/ReportShell.js';
import { STORE_NAMES, INV_ORG_COORDS, sNameC } from '../constants.js';
import { f$, fN } from '../utils/fmt.js';
import { buildLaborOpportunityCostReport, LABOR_OPP_COLUMNS } from '../engine/labor-opportunity-cost.js';
import { useSortedRows, SortTh } from '../components/SortableTh.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const td = (p, ...c) => h('td', p, ...c);
const tr = (p, ...c) => h('tr', p, ...c);

function _fmt(v, unit) {
  if (v == null) return '—';
  if (unit === '$') return (v < 0 ? '-' : '') + f$(Math.abs(v));
  if (unit === '$/hr') return f$(v) + '/hr';
  return (v >= 0 ? '+' : '') + fN(v, 1);
}

// Owner-requested 2026-11-05: drop the bare "(signed)" suffix from these column labels and
// instead carry the direction with a small colored arrow + a one-line tooltip people can read
// without knowing what "signed" means. Tooltip wording depends on signedBasis (see
// engine/labor-opportunity-cost.js's LABOR_OPP_COLUMNS comment) — "vs needed" and "vs
// scheduled" are genuinely different claims and must not share one sentence.
const _SIGNED_TOOLTIP = {
  needed: {
    $: 'Positive = scheduled/spent more than needed (overstaffed). Negative = less than needed (understaffed).',
    hrs: 'Positive = more hours than needed (overstaffed). Negative = fewer hours than needed (understaffed).',
  },
  sched: {
    $: 'Positive = ran over the schedule’s $ plan. Negative = ran under the schedule’s $ plan.',
    hrs: 'Positive = worked more hours than scheduled. Negative = worked fewer hours than scheduled.',
  },
};

function SignedCell({ v, unit, signedBasis }) {
  if (v == null || !signedBasis) return _fmt(v, unit);
  const tip = _SIGNED_TOOLTIP[signedBasis]?.[unit] || '';
  const over = v >= 0;
  return div({ style: { display: 'inline-flex', alignItems: 'center', gap: 3, cursor: tip ? 'help' : undefined }, title: tip },
    h('span', { style: { color: over ? '#ef4444' : '#10b981', fontSize: '8px', lineHeight: 1 } }, over ? '▲' : '▼'),
    h('span', null, _fmt(v, unit)),
  );
}

const _allStores = Object.keys(STORE_NAMES).map(l => ({ loc: l }));

export function LaborOpportunityCostPanel({ ds, stores, onClose }) {
  const { useState } = React;
  const [rows, setRows] = useState(null);
  const { sorted, sortKey, sortDir, onSort } = useSortedRows(rows);

  const run = async ({ locs, range }) => {
    setRows(buildLaborOpportunityCostReport(ds, { locs, range }));
  };

  const getExportData = () => ({
    title: 'Labor Opportunity Cost',
    headers: ['Store', ...LABOR_OPP_COLUMNS.map(c => c.label)],
    rows: (rows || []).map(r => [sNameC(r.loc) || r.name, ...LABOR_OPP_COLUMNS.map(c => _fmt(r[c.key], c.unit))]),
  });

  return h(ReportShell, {
    title: 'Labor Opportunity Cost', icon: '⏱️', onBack: onClose,
    subtitlePrefix: 'OT, overstaffing and understaffing $ — broken into drivers, by store',
    stores: (stores && stores.length) ? stores : _allStores, invOrgCoords: INV_ORG_COORDS, storeNames: STORE_NAMES,
    onRun: run, getExportData,
  },
    div({ style: { fontSize: '10.5px', color: 'var(--text2)', lineHeight: 1.6, marginBottom: 10, padding: '8px 10px', background: 'var(--surf2)', border: '.5px solid var(--bdr)', borderRadius: 8 } },
      h('b', null, 'Totals'), ' (OT $, Opportunity Cost $, Act-vs-Sched Opportunity $) are the real $ impact ',
      'summed across your whole selected range — "how much this cost us this period." ', h('b', null, 'Averages'),
      ' (the two hour-gap columns, Sales/Person-Hr) are the typical daily figure, not a sum — a staffing gap that ',
      'persists every day shouldn’t be read as if it multiplied. A large negative Opportunity Cost $ with a large ',
      'negative Act-vs-Needed Hrs means understaffing cost real sales; a large negative $ with hours running ABOVE ',
      'need points at overstaffing instead — check both together before coaching either direction.'),
    rows == null
      ? div({ style: { textAlign: 'center', color: 'var(--text3)', padding: 30, fontSize: '11px' } }, 'Choose a date range and location, then Run Report.')
      : !rows.length
        ? div({ style: { textAlign: 'center', color: 'var(--text3)', padding: 30, fontSize: '11px' } }, 'No stores matched this selection.')
        : div({ style: { overflowX: 'auto' } },
          h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '9.5px', minWidth: 1100 } },
            h('thead', null, h('tr', null,
              h(SortTh, { label: 'Store', colKey: 'name', sortKey, sortDir, onSort, style: { position: 'sticky', left: 0, background: 'var(--surf)' } }),
              ...LABOR_OPP_COLUMNS.map(c => h(SortTh, { key: c.key, label: c.label, colKey: c.key, sortKey, sortDir, onSort, align: 'right' })),
            )),
            h('tbody', null, ...sorted.map((r, i) => tr({ key: r.loc, style: { borderBottom: '.5px solid var(--bdr)', background: i % 2 ? 'var(--surf2)' : 'transparent' } },
              td({ style: { padding: '5px 8px', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', position: 'sticky', left: 0, background: i % 2 ? 'var(--surf2)' : 'var(--surf)' } }, sNameC(r.loc) || r.name),
              ...LABOR_OPP_COLUMNS.map(c => td({ key: c.key, style: { padding: '5px 8px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text2)' } },
                h(SignedCell, { v: r[c.key], unit: c.unit, signedBasis: c.signedBasis }))),
            ))),
          ),
        ),
  );
}
