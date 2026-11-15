// @ts-nocheck
// ── Targets vs Actual report (2026-11-15, owner request) ────────────────────────────────────
// "a new report that focuses solely on the monthly targets and daily targets (separate tabs)
// that shows clearly what the current target is vs the actual results." Date picker seeded
// with 7/14/21/28-day + MTD presets. Laid out per store (one card each), echoing the per-store
// monthly projections workbook the owner already prints and sends out — a McDonald's-accent
// header band per store, a clean target/actual/variance table underneath, built on ReportShell
// exactly like every other report in this redesign so it gets Print/CSV/Excel/PDF for free.
import * as React from 'react';
import { ReportShell } from '../components/ReportShell.js';
import { DATE_RANGE_PRESETS, MTD_PRESET } from '../components/PanelControls.js';
import { STORE_NAMES, INV_ORG_COORDS, sNameC } from '../constants.js';
import { ymKey } from '../engine/monthly-targets-v2.js';
import { computeTargetsVsActual, YEARLY_TARGET_METRICS } from '../engine/targets-vs-actual.js';
import { fP, f$, fN } from '../utils/fmt.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);
const btn = (p, ...c) => h('button', p, ...c);
const td = (p, ...c) => h('td', p, ...c);
const tr = (p, ...c) => h('tr', p, ...c);

// 7/14/28D already live in the shared catalog; 21D is new (owner asked for it specifically, and
// no existing report needed it) so it's defined here rather than added to the shared
// DATE_RANGE_PRESETS list every other report subsets from. MTD is the shared MTD_PRESET
// (PanelControls.js) — additive there too, so this is the first consumer, not a special case.
const DATE_PRESETS = [
  DATE_RANGE_PRESETS.find(p => p.id === '7d'),
  DATE_RANGE_PRESETS.find(p => p.id === '14d'),
  { id: '21d', label: '21D', days: 21 },
  DATE_RANGE_PRESETS.find(p => p.id === '28d'),
  MTD_PRESET,
];

const _STATUS_COLOR = { ok: '#10b981', watch: 'var(--amber)', miss: 'var(--crit)', none: 'var(--text3)' };
const _STATUS_LABEL = { ok: '✓ On Target', watch: '⚠ Watch', miss: '✕ Miss', none: '—' };

function _fmtVal(v, unit) {
  if (v == null) return '—';
  if (unit === 'dollar') return f$(v);
  if (unit === 'pct') return fP(v, 2);
  if (unit === 'sec') return fN(v, 0) + 's';
  return fN(v, unit === 'count' ? 1 : 2);
}
function _fmtDiff(diff, unit) {
  if (diff == null) return '—';
  const sign = diff > 0 ? '+' : '';
  if (unit === 'dollar') return sign + f$(diff);
  if (unit === 'pct') return sign + fP(diff, 2);
  if (unit === 'sec') return sign + fN(diff, 0) + 's';
  return sign + fN(diff, unit === 'count' ? 1 : 2);
}

const _allStores = Object.keys(STORE_NAMES).map(l => ({ loc: l }));

// One store's workbook card: a McDonald's-red accent band (the owner's own printed workbook's
// signature touch, meridian.css's now-superseded .proj-print-header skin) over a plain,
// theme-aware table — never a hardcoded dark/light surface, so it reads correctly in both
// themes (CLAUDE.md's light-is-default rule), with the brand accent limited to the one border +
// title, same as every semantic-color literal already used throughout this codebase.
function StoreWorkbookCard({ loc, metrics }) {
  return div({ style: { marginBottom: 16, border: '.5px solid var(--bdr)', borderRadius: 'var(--rl)', overflow: 'hidden', breakInside: 'avoid' } },
    div({ style: { padding: '8px 14px', borderLeft: '3px solid #DA291C', background: 'var(--surf2)', display: 'flex', alignItems: 'baseline', gap: 8 } },
      span({ style: { fontSize: '12px', fontWeight: 800, color: 'var(--text)' } }, sNameC(loc) || loc),
      span({ style: { fontSize: '9px', color: 'var(--text3)' } }, loc),
    ),
    div({ style: { overflowX: 'auto' } },
      h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '10.5px', minWidth: 460 } },
        h('thead', null, tr({ style: { background: 'var(--surf3)' } },
          h('th', { style: _thStyle(false) }, 'Metric'),
          h('th', { style: _thStyle(true) }, 'Target'),
          h('th', { style: _thStyle(true) }, 'Actual'),
          h('th', { style: _thStyle(true) }, 'Variance'),
          h('th', { style: _thStyle(true) }, 'Status'),
        )),
        h('tbody', null, ...metrics.map((m, i) => tr({
          key: m.key, style: { borderBottom: '.5px solid var(--bdr)', background: i % 2 ? 'var(--surf2)' : 'transparent' },
        },
          td({ style: _tdStyle(false) }, m.label),
          td({ style: _tdStyle(true) }, _fmtVal(m.target, m.unit)),
          td({ style: _tdStyle(true) }, _fmtVal(m.actual, m.unit)),
          td({ style: { ..._tdStyle(true), color: m.diff == null ? 'var(--text3)' : (m.status === 'ok' ? '#10b981' : m.status === 'miss' ? 'var(--crit)' : 'var(--text2)') } }, _fmtDiff(m.diff, m.unit)),
          td({ style: { padding: '4px 10px', textAlign: 'center', fontWeight: 700, fontSize: '9.5px', color: _STATUS_COLOR[m.status] } }, _STATUS_LABEL[m.status]),
        ))),
      ),
    ),
  );
}
const _thStyle = (right) => ({
  padding: '5px 10px', textAlign: right ? 'right' : 'left', fontSize: '9px', textTransform: 'uppercase',
  letterSpacing: '.3px', color: 'var(--text2)', fontWeight: 600, borderBottom: '.5px solid var(--bdr)',
});
const _tdStyle = (right) => ({
  padding: '4px 10px', textAlign: right ? 'right' : 'left', fontFamily: right ? 'var(--mono)' : 'var(--sans)',
  color: 'var(--text)',
});

export function TargetsVsActualReportPanel({ ds, stores, onClose }) {
  const { useState } = React;
  const [tab, setTab] = useState('monthly');
  const [result, setResult] = useState(null); // { monthly: [...], daily: [...] } | null

  const run = async ({ range, locs }) => {
    const rangeEnd = range?.e ? new Date(range.e) : new Date();
    const targetMonthYm = range?.e ? (() => {
      const d = new Date(range.e);
      return d.getFullYear() + '-' + (d.getMonth() + 1);
    })() : ymKey(new Date());
    const targetYear = rangeEnd.getFullYear();
    const allMonthlyTargets = ds?.allMonthlyTargets || {};
    const allYearlyTargets = ds?.allYearlyTargets || {};
    setResult({
      monthly: computeTargetsVsActual(ds, locs, { which: 'monthly', range, allMonthlyTargets, targetMonthYm }),
      daily: computeTargetsVsActual(ds, locs, { which: 'daily', range }),
      yearly: computeTargetsVsActual(ds, locs, { which: 'yearly', range, allYearlyTargets, targetYear }),
    });
  };

  const activeRows = result ? result[tab] : null;
  const _tabTitle = tab === 'daily' ? 'Daily' : tab === 'yearly' ? 'Yearly' : 'Monthly';

  const getExportData = () => ({
    title: _tabTitle + ' Targets vs Actual',
    headers: ['Store', 'Metric', 'Target', 'Actual', 'Variance', 'Status'],
    rows: (activeRows || []).flatMap(r => r.metrics.map(m => [
      sNameC(r.loc) || r.loc, m.label, _fmtVal(m.target, m.unit), _fmtVal(m.actual, m.unit),
      _fmtDiff(m.diff, m.unit), _STATUS_LABEL[m.status],
    ])),
  });

  return h(ReportShell, {
    title: 'Targets vs Actual', icon: '🎯', onBack: onClose,
    subtitlePrefix: _tabTitle + ' targets vs actual results, per store',
    stores: (stores && stores.length) ? stores : _allStores, invOrgCoords: INV_ORG_COORDS, storeNames: STORE_NAMES,
    datePresets: DATE_PRESETS, defaultPresetId: '28d',
    onRun: run, getExportData,
  },
    div({ style: { display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' } },
      ['monthly', 'daily', 'yearly'].map(t => btn({
        key: t, className: 'btn btn-sm' + (tab === t ? ' btn-a' : ''), onClick: () => setTab(t),
      }, t === 'monthly' ? '📅 Monthly Targets' : t === 'daily' ? '☀️ Daily Targets' : '📆 Yearly Targets')),
    ),
    div({ style: { fontSize: '10px', color: 'var(--text3)', marginBottom: 12 } },
      tab === 'monthly'
        ? 'Target reads the real monthly override for the selected range\'s month where one has been saved, falling back to the standing default target otherwise — the same target MonthlyTargetManager edits.'
        : tab === 'yearly'
        ? `Target reads the uploaded yearly targets workbook for the selected range's year — no fallback, since not every store/year has one uploaded. Covers the ${YEARLY_TARGET_METRICS.length} yearly-workbook fields with a verified daily/auto actual source; CSAT, Digital, and People (OSAT, turnover, headcount, McDelivery, etc.) aren't wired in yet — see Yearly Projections → Target Categories for those targets on their own.`
        : 'Target is each store\'s standing daily operational target — there is no monthly override for these.'),
    activeRows == null
      ? div({ style: { textAlign: 'center', color: 'var(--text3)', padding: 30, fontSize: '11px' } }, 'Choose a date range and location, then Run Report.')
      : !activeRows.length
        ? div({ style: { textAlign: 'center', color: 'var(--text3)', padding: 30, fontSize: '11px' } }, 'No stores in this selection.')
        : div(null, ...activeRows.map(r => h(StoreWorkbookCard, { key: r.loc + tab, loc: r.loc, metrics: r.metrics }))),
  );
}
