// @ts-nocheck
// ── Night OEPE w/o Parked report (owner request, 2026-11-18) ────────────────────────────────────
// "The ask for nights this time was to create a report for OEPE w/o parked for nights
// (4pm-close) for each location. Add ask - do it for the entire night period but also for 5p-7p
// and 7p-cl. ... MTD, Last month, last 30 days, last 45 days, last 90 days and YTD ... This is
// separate from previous work." A new, standalone report -- NOT a change to dt-oepe-report.js
// (the whole-day "DT OEPE w/o Parked" report), which this one reuses only for its 6 period-window
// definitions (DT_OEPE_WINDOW_COLS/dtOepeReportWindows). The real per-segment Σ/Σ computation
// lives in engine/night-oepe-report.js; this file is chrome + an on-demand fetch of the raw
// hourly rows the computation needs (no existing ds field carries the full night hour_slot range
// with the complete OEPE column set -- see lib/supabase.js's loadNightOepeActivity header).
import * as React from 'react';
import { ReportShell } from '../components/ReportShell.js';
import { STORE_NAMES, INV_ORG_COORDS, sNameC } from '../constants.js';
import { loadNightOepeActivity } from '../lib/supabase.js';
import { computeNightOepeReport, NIGHT_SEGMENTS } from '../engine/night-oepe-report.js';
import { DT_OEPE_WINDOW_COLS } from '../engine/dt-oepe-report.js';
import { useSortedRows, SortTh } from '../components/SortableTh.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const btn = (p, ...c) => h('button', p, ...c);
const td = (p, ...c) => h('td', p, ...c);
const tr = (p, ...c) => h('tr', p, ...c);

const _fmtSec = v => (v == null || isNaN(v)) ? '—' : Math.round(v) + 's';
const _dstr = d => d.toISOString().slice(0, 10);

const _allStores = Object.keys(STORE_NAMES).map(l => ({ loc: l }));

export function NightOepeReportPanel({ ds, stores, onClose }) {
  const { useState } = React;
  const [rows, setRows] = useState(null);
  const [seg, setSeg] = useState('allNight');
  const [loading, setLoading] = useState(false);

  const run = async ({ locs, range }) => {
    const asOf = range?.e ? new Date(range.e) : new Date();
    const d = isNaN(asOf) ? new Date() : asOf;
    const yearStart = new Date(d.getFullYear(), 0, 1); // covers YTD, the widest of the 6 windows
    setLoading(true);
    try {
      const activityRows = await loadNightOepeActivity(_dstr(yearStart), _dstr(d));
      setRows(computeNightOepeReport(activityRows, locs, d));
    } finally {
      setLoading(false);
    }
  };

  const activeSegLabel = NIGHT_SEGMENTS.find(s => s.key === seg)?.label || seg;
  const displayRows = (rows || []).map(r => ({ loc: r.loc, name: sNameC(r.loc) || r.loc, ...r.segments[seg] }));
  const { sorted, sortKey, sortDir, onSort } = useSortedRows(displayRows);

  const getExportData = () => ({
    title: `Night OEPE w/o Parked — ${activeSegLabel}`,
    headers: ['Store', ...DT_OEPE_WINDOW_COLS.map(c => c.label)],
    rows: (rows || []).map(r => [sNameC(r.loc) || r.loc, ...DT_OEPE_WINDOW_COLS.map(c => _fmtSec(r.segments[seg][c.key]))]),
  });

  return h(ReportShell, {
    title: 'Night OEPE w/o Parked', icon: '🌙', onBack: onClose,
    subtitlePrefix: 'Drive-thru OEPE with parked/held time excluded, nights only, by store, across MTD / LM / Last 30 / Last 45 / Last 90 Days / YTD',
    stores: (stores && stores.length) ? stores : _allStores, invOrgCoords: INV_ORG_COORDS, storeNames: STORE_NAMES,
    onRun: run, getExportData,
  },
    div({ style: { fontSize: '10.5px', color: 'var(--text2)', lineHeight: 1.6, marginBottom: 10, padding: '8px 10px', background: 'var(--surf2)', border: '.5px solid var(--bdr)', borderRadius: 8 } },
      'Separate from the whole-day "DT OEPE w/o Parked" report. Same w/o-parked formula (parked/held ' +
      'time excluded, the real scored metric — never the diagnostic "with park" variant), scoped to three ' +
      'night segments. Each period is a true sum of order time ÷ sum of transactions across its window and ' +
      'segment, not an average of daily/hourly OEPE values, so a single slow or light-volume hour can\'t skew ' +
      'the figure out of proportion. The date range picker\'s end date is the "as of" date every column runs ' +
      'back from — it defaults to today.'),
    div({ style: { display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' } },
      ...NIGHT_SEGMENTS.map(s => btn({
        key: s.key, className: 'btn btn-sm' + (seg === s.key ? ' btn-a' : ''), onClick: () => setSeg(s.key),
      }, s.label)),
    ),
    loading
      ? div({ style: { textAlign: 'center', color: 'var(--text3)', padding: 30, fontSize: '11px' } }, 'Loading night activity…')
      : rows == null
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
