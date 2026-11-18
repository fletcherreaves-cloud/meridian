// @ts-nocheck
// ── OEPE w/o Parked by Daypart report ────────────────────────────────────────────────────────
// First ask (owner, 2026-11-18): "create a report for OEPE w/o parked for nights (4pm-close) for
// each location... do it for the entire night period but also for 5p-7p and 7p-cl." Same-day
// follow-up, after using it live: "For my current purposes, as prescribed is good, but adding
// multiple dayparts would be helpful. Even a start time and end time selector would be useful."
// This view now offers 5 named presets (Breakfast/Lunch/Dinner/4pm-Close/7pm-Close — the
// original 3 night segments are unchanged, just joined by 2 more) plus a Custom start/end
// hour-of-day picker. All computed client-side off ONE fetch of the full day's hourly rows
// (loadOepeHourlyActivity, Jan 1 of the "as of" year through that date) — switching daypart tabs
// or the custom range never re-queries Supabase, since every segment is just a different
// hour_slot filter over the same already-loaded rows. Real per-segment+period computation lives
// in engine/daypart-oepe-report.js.
import * as React from 'react';
import { ReportShell } from '../components/ReportShell.js';
import { STORE_NAMES, INV_ORG_COORDS, sNameC } from '../constants.js';
import { loadOepeHourlyActivity } from '../lib/supabase.js';
import { computeDaypartOepeReport, DAYPART_PRESETS, ALL_HOUR_SLOTS, customDaypartSegment } from '../engine/daypart-oepe-report.js';
import { DT_OEPE_WINDOW_COLS } from '../engine/dt-oepe-report.js';
import { hourSlotLabel } from '../utils/oepe.js';
import { useSortedRows, SortTh } from '../components/SortableTh.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const btn = (p, ...c) => h('button', p, ...c);
const select = (p, ...c) => h('select', p, ...c);
const option = (p, ...c) => h('option', p, ...c);
const td = (p, ...c) => h('td', p, ...c);
const tr = (p, ...c) => h('tr', p, ...c);

const _fmtSec = v => (v == null || isNaN(v)) ? '—' : Math.round(v) + 's';
const _dstr = d => d.toISOString().slice(0, 10);

const _allStores = Object.keys(STORE_NAMES).map(l => ({ loc: l }));

export function DaypartOepeReportPanel({ ds, stores, onClose }) {
  const { useState, useMemo } = React;
  const [raw, setRaw] = useState(null); // { rows, locs, asOf } from the last Run
  const [seg, setSeg] = useState('allNight');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [loading, setLoading] = useState(false);

  const run = async ({ locs, range }) => {
    const asOf = range?.e ? new Date(range.e) : new Date();
    const d = isNaN(asOf) ? new Date() : asOf;
    const yearStart = new Date(d.getFullYear(), 0, 1); // covers YTD, the widest of the 6 windows
    setLoading(true);
    try {
      const activityRows = await loadOepeHourlyActivity(_dstr(yearStart), _dstr(d));
      setRaw({ rows: activityRows, locs, asOf: d });
    } finally {
      setLoading(false);
    }
  };

  const activeSegmentDef = seg === 'custom'
    ? customDaypartSegment(customStart, customEnd)
    : DAYPART_PRESETS.find(p => p.key === seg);

  // Recomputed instantly on every tab/range change -- no refetch, see header.
  const rows = useMemo(() => {
    if (!raw || !activeSegmentDef) return null;
    return computeDaypartOepeReport(raw.rows, raw.locs, raw.asOf, [activeSegmentDef]);
  }, [raw, activeSegmentDef?.key, customStart, customEnd]);

  const activeSegLabel = activeSegmentDef?.label || seg;
  const displayRows = (rows || []).map(r => ({ loc: r.loc, name: sNameC(r.loc) || r.loc, ...r.segments[activeSegmentDef?.key] }));
  const { sorted, sortKey, sortDir, onSort } = useSortedRows(displayRows);

  const getExportData = () => ({
    title: `OEPE w/o Parked — ${activeSegLabel}`,
    headers: ['Store', ...DT_OEPE_WINDOW_COLS.map(c => c.label)],
    rows: (rows || []).map(r => [sNameC(r.loc) || r.loc, ...DT_OEPE_WINDOW_COLS.map(c => _fmtSec(r.segments[activeSegmentDef.key][c.key]))]),
  });

  return h(ReportShell, {
    title: 'OEPE w/o Parked by Daypart', icon: '🕐', onBack: onClose,
    subtitlePrefix: 'Drive-thru OEPE with parked/held time excluded, by daypart and store, across MTD / LM / Last 30 / Last 45 / Last 90 Days / YTD',
    stores: (stores && stores.length) ? stores : _allStores, invOrgCoords: INV_ORG_COORDS, storeNames: STORE_NAMES,
    onRun: run, getExportData,
  },
    div({ style: { fontSize: '10.5px', color: 'var(--text2)', lineHeight: 1.6, marginBottom: 10, padding: '8px 10px', background: 'var(--surf2)', border: '.5px solid var(--bdr)', borderRadius: 8 } },
      'Separate from the whole-day "DT OEPE w/o Parked" report. Same w/o-parked formula (parked/held ' +
      'time excluded, the real scored metric — never the diagnostic "with park" variant), scoped to the ' +
      'daypart or custom range picked below. Each period is a true sum of order time ÷ sum of transactions ' +
      'across its window and daypart, not an average of daily/hourly OEPE values, so a single slow or ' +
      'light-volume hour can\'t skew the figure out of proportion. The date range picker\'s end date is the ' +
      '"as of" date every column runs back from — it defaults to today. Switching daypart or custom range ' +
      'below recalculates instantly from the same Run — no need to re-run for each one.'),
    div({ style: { display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' } },
      ...DAYPART_PRESETS.map(p => btn({
        key: p.key, className: 'btn btn-sm' + (seg === p.key ? ' btn-a' : ''), onClick: () => setSeg(p.key),
      }, p.label)),
      btn({ className: 'btn btn-sm' + (seg === 'custom' ? ' btn-a' : ''), onClick: () => setSeg('custom') }, 'Custom range'),
    ),
    seg === 'custom' && div({ style: { display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14, fontSize: '11px', color: 'var(--text2)' } },
      'From', select({ value: customStart, onChange: e => setCustomStart(e.target.value), style: { padding: '4px 6px' } },
        option({ value: '' }, '—'),
        ...ALL_HOUR_SLOTS.map(s => option({ key: s, value: s }, hourSlotLabel(s))),
      ),
      'to', select({ value: customEnd, onChange: e => setCustomEnd(e.target.value), style: { padding: '4px 6px' } },
        option({ value: '' }, '—'),
        ...ALL_HOUR_SLOTS.map(s => option({ key: s, value: s }, hourSlotLabel(s))),
      ),
      '(inclusive, both ends)',
    ),
    loading
      ? div({ style: { textAlign: 'center', color: 'var(--text3)', padding: 30, fontSize: '11px' } }, 'Loading hourly activity…')
      : raw == null
        ? div({ style: { textAlign: 'center', color: 'var(--text3)', padding: 30, fontSize: '11px' } }, 'Choose a location, then Run Report.')
        : !activeSegmentDef
          ? div({ style: { textAlign: 'center', color: 'var(--text3)', padding: 30, fontSize: '11px' } }, 'Pick a Start and End time for the custom range.')
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
