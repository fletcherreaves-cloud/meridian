// @ts-nocheck
// ── Controls ↔ Food Cost Linkage report (Reports redesign Phase 5, 2026-10-16) ───────────────
// Built on ReportShell exactly like Loss Prevention Summary (Phase 2). Data comes from
// engine/controls-food-cost-link.js — see that file's header for the owner's own ask this
// answers and why FOB's monthly ratios and Controls' daily meal/deposit facts have never been
// shown side by side before.
import * as React from 'react';
import { ReportShell } from '../components/ReportShell.js';
import { STORE_NAMES, INV_ORG_COORDS, sNameC } from '../constants.js';
import { fP, f$, fN } from '../utils/fmt.js';
import { buildControlsFoodCostReport, CONTROLS_FOOD_COST_METRICS } from '../engine/controls-food-cost-link.js';

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

export function ControlsFoodCostLinkPanel({ ds, stores, onClose }) {
  const { useState } = React;
  const [rows, setRows] = useState(null);

  const run = async ({ locs, range }) => {
    setRows(buildControlsFoodCostReport(ds, { locs, range }));
  };

  const getExportData = () => ({
    title: 'Controls ↔ Food Cost Linkage',
    headers: ['Store', 'Month', ...CONTROLS_FOOD_COST_METRICS.map(m => m.label)],
    rows: (rows || []).map(r => [sNameC(r.loc) || r.name, r.month, ...CONTROLS_FOOD_COST_METRICS.map(m => _fmt(r[m.key], m.unit))]),
  });

  return h(ReportShell, {
    title: 'Controls ↔ Food Cost Linkage', icon: '🔗', onBack: onClose,
    subtitlePrefix: 'FOB-reported food-cost ratios alongside Controls’ meal/deposit/discount facts, by store and month',
    stores: (stores && stores.length) ? stores : _allStores, invOrgCoords: INV_ORG_COORDS, storeNames: STORE_NAMES,
    onRun: run, getExportData,
  },
    div({ style: { fontSize: '10.5px', color: 'var(--text2)', lineHeight: 1.6, marginBottom: 10, padding: '8px 10px', background: 'var(--surf2)', border: '.5px solid var(--bdr)', borderRadius: 8 } },
      'How to read this: FOB reports ', h('b', null, 'once a month'), '; Controls records daily — both are resolved to the ',
      h('b', null, 'same whole calendar months'), ' covering your selected range, so the two families line up on the real ',
      'period FOB actually reports for. A store with rising Employee Meal $/count but no matching move in FOB’s own ',
      'reported Emp Meal %, or vice versa, is the disconnect worth a closer look — that comparison has never been ',
      'surfaced in one place before this report.'),
    rows == null
      ? div({ style: { textAlign: 'center', color: 'var(--text3)', padding: 30, fontSize: '11px' } }, 'Choose a date range and location, then Run Report.')
      : !rows.length
        ? div({ style: { textAlign: 'center', color: 'var(--text3)', padding: 30, fontSize: '11px' } }, 'No stores matched this selection.')
        : div({ style: { overflowX: 'auto' } },
          h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '9.5px', minWidth: 1300 } },
            h('thead', null, h('tr', null,
              th({ style: { textAlign: 'left', fontSize: '8px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.3px', padding: '4px 8px', borderBottom: '.5px solid var(--bdr)', position: 'sticky', left: 0, background: 'var(--surf)' } }, 'Store'),
              th({ style: { textAlign: 'left', fontSize: '8px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.3px', padding: '4px 8px', borderBottom: '.5px solid var(--bdr)', whiteSpace: 'nowrap' } }, 'Month'),
              ...CONTROLS_FOOD_COST_METRICS.map(m => th({ key: m.key, style: { textAlign: 'right', fontSize: '8px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.3px', padding: '4px 8px', borderBottom: '.5px solid var(--bdr)', whiteSpace: 'nowrap' } }, m.label)),
            )),
            h('tbody', null, ...rows.map((r, i) => tr({ key: r.loc + '|' + r.month, style: { borderBottom: '.5px solid var(--bdr)', background: i % 2 ? 'var(--surf2)' : 'transparent' } },
              td({ style: { padding: '5px 8px', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', position: 'sticky', left: 0, background: i % 2 ? 'var(--surf2)' : 'var(--surf)' } }, sNameC(r.loc) || r.name),
              td({ style: { padding: '5px 8px', color: 'var(--text2)', whiteSpace: 'nowrap' } }, r.month),
              ...CONTROLS_FOOD_COST_METRICS.map(m => td({ key: m.key, style: { padding: '5px 8px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text2)' } }, _fmt(r[m.key], m.unit))),
            ))),
          ),
        ),
  );
}
