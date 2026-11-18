// @ts-nocheck
// ── DT OEPE w/o Parked report (owner request, 2026-11-17) ───────────────────────────────────────
// "give a report that shows specifically DT OEPE w/o parked for the following periods for each
// location: MTD, LM, Last 30 Days, Last 45 Days, Last 90 days and YTD." DT OEPE here always
// excludes parked/held time -- the real, scored formula (METRIC_SOURCES.oepe /
// src/utils/oepe.js's oepeSeconds()), never the diagnostic-only "with park" variant. Built on
// ReportShell exactly like every other report in this redesign (see fob-reference-table.js); the
// real computation lives in engine/dt-oepe-report.js.
import * as React from 'react';
import { ReportShell } from '../components/ReportShell.js';
import { STORE_NAMES, INV_ORG_COORDS, sNameC } from '../constants.js';
import { computeDtOepeReport, DT_OEPE_WINDOW_COLS } from '../engine/dt-oepe-report.js';
import { useSortedRows, SortTh } from '../components/SortableTh.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const td = (p, ...c) => h('td', p, ...c);
const tr = (p, ...c) => h('tr', p, ...c);

const _fmtSec = v => (v == null || isNaN(v)) ? '—' : Math.round(v) + 's';

const _allStores = Object.keys(STORE_NAMES).map(l => ({ loc: l }));

export function DtOepeReportPanel({ ds, stores, onClose }) {
  const { useState } = React;
  const [rows, setRows] = useState(null);

  const run = async ({ locs, range }) => {
    const asOf = range?.e ? new Date(range.e) : new Date();
    setRows(computeDtOepeReport(ds, locs, isNaN(asOf) ? new Date() : asOf));
  };

  const displayRows = (rows || []).map(r => ({ loc: r.loc, name: sNameC(r.loc) || r.loc, ...r }));
  const { sorted, sortKey, sortDir, onSort } = useSortedRows(displayRows);

  const getExportData = () => ({
    title: 'DT OEPE w/o Parked',
    headers: ['Store', ...DT_OEPE_WINDOW_COLS.map(c => c.label)],
    rows: (rows || []).map(r => [sNameC(r.loc) || r.loc, ...DT_OEPE_WINDOW_COLS.map(c => _fmtSec(r[c.key]))]),
  });

  return h(ReportShell, {
    title: 'DT OEPE w/o Parked', icon: '⏱️', onBack: onClose,
    subtitlePrefix: 'Drive-thru OEPE with parked/held time excluded, by store, across MTD / LM / Last 30 / Last 45 / Last 90 Days / YTD',
    stores: (stores && stores.length) ? stores : _allStores, invOrgCoords: INV_ORG_COORDS, storeNames: STORE_NAMES,
    onRun: run, getExportData,
  },
    div({ style: { fontSize: '10.5px', color: 'var(--text2)', lineHeight: 1.6, marginBottom: 10, padding: '8px 10px', background: 'var(--surf2)', border: '.5px solid var(--bdr)', borderRadius: 8 } },
      'DT OEPE here always excludes parked/held time — the real, scored formula, never the diagnostic-only "with park" ' +
      'variant. Each period is a true sum of order time ÷ sum of transactions across its window, not an average of daily ' +
      'OEPE values, so a single slow or light-volume day can\'t skew the figure out of proportion. The date range picker\'s ' +
      'end date is the "as of" date every column runs back from — it defaults to today.'),
    rows == null
      ? div({ style: { textAlign: 'center', color: 'var(--text3)', padding: 30, fontSize: '11px' } }, 'Choose a location, then Run Report.')
      : !rows.length
        ? div({ style: { textAlign: 'center', color: 'var(--text3)', padding: 30, fontSize: '11px' } }, 'No stores in this selection.')
        : div({ style: { overflowX: 'auto' } },
          h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '10px', minWidth: 680 } },
            h('thead', null, h('tr', null,
              h(SortTh, { label: 'Store', colKey: 'name', sortKey, sortDir, onSort, style: { position: 'sticky', left: 0, background: 'var(--surf)' } }),
              ...DT_OEPE_WINDOW_COLS.map(c => h(SortTh, { key: c.key, label: c.label, colKey: c.key, sortKey, sortDir, onSort, align: 'right' })),
            )),
            h('tbody', null, ...sorted.map((r, i) =>
              tr({ key: r.loc, style: { borderBottom: '.5px solid var(--bdr)', background: i % 2 ? 'var(--surf2)' : 'transparent' } },
                td({ style: { padding: '5px 8px', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', position: 'sticky', left: 0, background: i % 2 ? 'var(--surf2)' : 'var(--surf)' } }, r.name),
                ...DT_OEPE_WINDOW_COLS.map(c => td({ key: c.key, style: { padding: '5px 8px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text2)' } }, _fmtSec(r[c.key]))),
              ),
            )),
          ),
        ),
  );
}
