// @ts-nocheck
// ── Cash Variance Pattern report (Reports redesign Tier 3, 2026-10-16) ──────────────────────
// Built on ReportShell exactly like every other report in this redesign. Data comes from
// engine/cash-variance-pattern.js — see that file's header for why this is store × day-of-week,
// not register- or employee-level (no register-number field exists in this app's data model,
// and naming individuals in an automated report is deliberately out of scope per this repo's
// "verify, don't accuse" convention).
import * as React from 'react';
import { ReportShell } from '../components/ReportShell.js';
import { STORE_NAMES, INV_ORG_COORDS, sNameC } from '../constants.js';
import { fP, f$, fN } from '../utils/fmt.js';
import { buildCashVariancePatternReport, CASH_VARIANCE_METRICS } from '../engine/cash-variance-pattern.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const td = (p, ...c) => h('td', p, ...c);
const tr = (p, ...c) => h('tr', p, ...c);
const th = (p, ...c) => h('th', p, ...c);

function _fmt(v, unit) {
  if (v == null) return '—';
  if (unit === 'pct') return fP(v, 2);
  if (unit === '$') return f$(v);
  return fN(v, 1);
}

const _allStores = Object.keys(STORE_NAMES).map(l => ({ loc: l }));

export function CashVariancePatternPanel({ ds, stores, onClose }) {
  const { useState } = React;
  const [rows, setRows] = useState(null);

  const run = async ({ locs, range }) => {
    setRows(buildCashVariancePatternReport(ds, { locs, range }));
  };

  const getExportData = () => ({
    title: 'Cash Variance Pattern',
    headers: ['Store', 'Day of Week', 'Days Observed', ...CASH_VARIANCE_METRICS.map(m => m.label)],
    rows: (rows || []).map(r => [sNameC(r.loc) || r.name, r.dowLabel, r.n, ...CASH_VARIANCE_METRICS.map(m => _fmt(r[m.key], m.unit))]),
  });

  return h(ReportShell, {
    title: 'Cash Variance Pattern', icon: '🧾', onBack: onClose,
    subtitlePrefix: 'Cash O/S, POS overrides, refunds and T-Reds averaged by store and day of week — never by register or employee',
    stores: (stores && stores.length) ? stores : _allStores, invOrgCoords: INV_ORG_COORDS, storeNames: STORE_NAMES,
    onRun: run, getExportData,
  },
    div({ style: { fontSize: '10.5px', color: 'var(--text2)', lineHeight: 1.6, marginBottom: 10, padding: '8px 10px', background: 'var(--surf2)', border: '.5px solid var(--bdr)', borderRadius: 8 } },
      'How to read this: each row is one store’s average on one day of the week (minimum 3 observed days). Sort any ',
      'column to see which store/day combination runs the highest cash O/S, overrides or refunds — a recurring ',
      'pattern on the same day most weeks is worth a closer look at that shift’s cash-handling procedures. This ',
      'report has no built-in "flagged" threshold — real averages only, your own judgment decides what\'s worth ',
      'acting on.'),
    rows == null
      ? div({ style: { textAlign: 'center', color: 'var(--text3)', padding: 30, fontSize: '11px' } }, 'Choose a date range and location, then Run Report.')
      : !rows.length
        ? div({ style: { textAlign: 'center', color: 'var(--text3)', padding: 30, fontSize: '11px' } }, 'No store/day-of-week combination had at least 3 observed days in this selection.')
        : div({ style: { overflowX: 'auto' } },
          h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '9.5px', minWidth: 1400 } },
            h('thead', null, h('tr', null,
              th({ style: { textAlign: 'left', fontSize: '8px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.3px', padding: '4px 8px', borderBottom: '.5px solid var(--bdr)', position: 'sticky', left: 0, background: 'var(--surf)' } }, 'Store'),
              th({ style: { textAlign: 'left', fontSize: '8px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.3px', padding: '4px 8px', borderBottom: '.5px solid var(--bdr)', whiteSpace: 'nowrap' } }, 'Day'),
              th({ style: { textAlign: 'right', fontSize: '8px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.3px', padding: '4px 8px', borderBottom: '.5px solid var(--bdr)', whiteSpace: 'nowrap' } }, 'n Days'),
              ...CASH_VARIANCE_METRICS.map(m => th({ key: m.key, style: { textAlign: 'right', fontSize: '8px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.3px', padding: '4px 8px', borderBottom: '.5px solid var(--bdr)', whiteSpace: 'nowrap' } }, m.label)),
            )),
            h('tbody', null, ...rows.map((r, i) => tr({ key: r.loc + '|' + r.dow, style: { borderBottom: '.5px solid var(--bdr)', background: i % 2 ? 'var(--surf2)' : 'transparent' } },
              td({ style: { padding: '5px 8px', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', position: 'sticky', left: 0, background: i % 2 ? 'var(--surf2)' : 'var(--surf)' } }, sNameC(r.loc) || r.name),
              td({ style: { padding: '5px 8px', color: 'var(--text2)', whiteSpace: 'nowrap' } }, r.dowLabel),
              td({ style: { padding: '5px 8px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text3)' } }, r.n),
              ...CASH_VARIANCE_METRICS.map(m => td({ key: m.key, style: { padding: '5px 8px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text2)' } }, _fmt(r[m.key], m.unit))),
            ))),
          ),
        ),
  );
}
