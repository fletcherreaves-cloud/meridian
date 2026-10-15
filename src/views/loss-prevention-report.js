// @ts-nocheck
// ── Loss Prevention Summary report (Reports redesign Phase 2 proof-of-concept, 2026-10-15) ────
// First real report built on the new ReportShell (date range + LocationSelector + Run, then
// Print/CSV/Excel/PDF export, all for free) -- see src/components/ReportShell.js and
// src/utils/report-export.js. The data itself comes from engine/loss-prevention-report.js,
// which reuses exactly the 16 metric-source.js keys Phase 1 just gave a real, agreed-upon
// direction to (memory/project-reports-redesign.md).
import * as React from 'react';
import { ReportShell } from '../components/ReportShell.js';
import { STORE_NAMES, INV_ORG_COORDS, sNameC } from '../constants.js';
import { fP, f$, fN } from '../utils/fmt.js';
import { buildLossPreventionReport, LOSS_PREVENTION_METRICS } from '../engine/loss-prevention-report.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const td = (p, ...c) => h('td', p, ...c);
const tr = (p, ...c) => h('tr', p, ...c);
const th = (p, ...c) => h('th', p, ...c);

function _fmt(v, unit) {
  if (v == null) return '—';
  if (unit === 'pct') return fP(v, 2);
  if (unit === '$') return f$(v);
  return fN(v, 0);
}

const _allStores = Object.keys(STORE_NAMES).map(l => ({ loc: l }));

export function LossPreventionReportPanel({ ds, stores, onClose }) {
  const { useState, useMemo } = React;
  const [rows, setRows] = useState(null);

  const run = async ({ locs, range }) => {
    setRows(buildLossPreventionReport(ds, { locs, range }));
  };

  const getExportData = () => ({
    title: 'Loss Prevention Summary',
    headers: ['Store', ...LOSS_PREVENTION_METRICS.map(m => m.label)],
    rows: (rows || []).map(r => [sNameC(r.loc) || r.name, ...LOSS_PREVENTION_METRICS.map(m => _fmt(r[m.key], m.unit))]),
  });

  return h(ReportShell, {
    title: 'Loss Prevention Summary', icon: '🛡️', onBack: onClose,
    subtitlePrefix: 'Discount / Promo / Cash O-S / Refunds / Overrides / T-Reds, by store',
    stores: (stores && stores.length) ? stores : _allStores, invOrgCoords: INV_ORG_COORDS, storeNames: STORE_NAMES,
    onRun: run, getExportData,
  },
    rows == null
      ? div({ style: { textAlign: 'center', color: 'var(--text3)', padding: 30, fontSize: '11px' } }, 'Choose a date range and location, then Run Report.')
      : !rows.length
        ? div({ style: { textAlign: 'center', color: 'var(--text3)', padding: 30, fontSize: '11px' } }, 'No stores matched this selection.')
        : div({ style: { overflowX: 'auto' } },
          h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '9.5px', minWidth: 1100 } },
            h('thead', null, h('tr', null,
              th({ style: { textAlign: 'left', fontSize: '8px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.3px', padding: '4px 8px', borderBottom: '.5px solid var(--bdr)', position: 'sticky', left: 0, background: 'var(--surf)' } }, 'Store'),
              ...LOSS_PREVENTION_METRICS.map(m => th({ key: m.key, style: { textAlign: 'right', fontSize: '8px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.3px', padding: '4px 8px', borderBottom: '.5px solid var(--bdr)', whiteSpace: 'nowrap' } }, m.label)),
            )),
            h('tbody', null, ...rows.map((r, i) => tr({ key: r.loc, style: { borderBottom: '.5px solid var(--bdr)', background: i % 2 ? 'var(--surf2)' : 'transparent' } },
              td({ style: { padding: '5px 8px', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', position: 'sticky', left: 0, background: i % 2 ? 'var(--surf2)' : 'var(--surf)' } }, sNameC(r.loc) || r.name),
              ...LOSS_PREVENTION_METRICS.map(m => td({ key: m.key, style: { padding: '5px 8px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text2)' } }, _fmt(r[m.key], m.unit))),
            ))),
          ),
        ),
  );
}
