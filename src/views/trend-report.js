// @ts-nocheck
// Performance Trends -- owner request 2026-09-14: "Current MTD (completed days only) / Last
// complete month / Two months back", one table for All locations, plus OK/FL breakouts,
// sortable by Top/Bottom 25%/50%, reusable for Labor %, FOB % and every other primary metric.
// Meant to live inside Meridian as a real, regenerate-any-time panel -- the source for an email
// communication, not a one-off export. Print/CSV follow the same printHtml pattern smart-
// targets.js and the One-Pager panels already use (see utils/print-html.js).
import * as React from 'react';
import { STORE_NAMES, INV_ORG_COORDS, sNameC } from '../constants.js';
import { RoutePanelShell } from '../components/ModalShell.js';
import { LocationSelector, buildLocationHierarchy, locationSelectorLocs } from '../components/PanelControls.js';
import { escapeHtml } from '../utils/fmt.js';
import { loadQsrActSummary, loadOpsLaborSummary, loadQsrFob, loadOpsCashSheet } from '../lib/supabase.js';
import {
  TREND_REPORT_METRICS, findTrendMetric, fmtTrendValue, trendReportPeriods,
  computeTrendReport, rankFilterRows, RANK_MODES, scopeSummaryPeriods, computeScopeSummary,
  scopeSummaryFetchDaysBack,
} from '../engine/trend-report.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);
const btn = (p, ...c) => h('button', p, ...c);

const ALL_STORES = Object.keys(STORE_NAMES).map(loc => ({ loc }));

const _pillStyle = (active) => ({
  padding: '4px 12px', borderRadius: 'var(--r)',
  border: '.5px solid ' + (active ? 'rgba(245,158,11,.4)' : 'var(--bdr)'),
  background: active ? 'var(--adim)' : 'transparent',
  color: active ? 'var(--amber)' : 'var(--text2)',
  fontSize: '11px', fontWeight: active ? 700 : 400, cursor: 'pointer',
});

// A 3-point trend line (two-months-back -> last-month -> current MTD), styled consistently with
// trends.js's own TrendSparkline (same dimensions/stroke approach) -- each panel that needs a
// tiny inline trendline hand-rolls its own to this shared visual language rather than pulling
// chart.js into the eager bundle just for 3 points.
function MiniTrend({ points, direction }) {
  const pts = (points || []).filter(p => p.value != null);
  if (pts.length < 2) return null;
  const W = 140, H = 40, pad = 6;
  const vals = pts.map(p => p.value);
  const minY = Math.min(...vals), maxY = Math.max(...vals);
  const range = maxY - minY || 1;
  const xStep = (W - pad * 2) / (pts.length - 1);
  const xs = pts.map((_, i) => pad + i * xStep);
  const yCoord = v => H - pad - ((v - minY) / range) * (H - pad * 2);
  const poly = pts.map((p, i) => `${xs[i].toFixed(1)},${yCoord(p.value).toFixed(1)}`).join(' ');
  const lastUp = pts[pts.length - 1].value > pts[pts.length - 2].value;
  const goodUp = direction === 'higher' ? lastUp : direction === 'lower' ? !lastUp : null;
  const col = goodUp == null ? 'var(--amber)' : goodUp ? '#10b981' : '#ef4444';
  return h('svg', { width: W, height: H, style: { display: 'block' } },
    h('polyline', { points: poly, fill: 'none', stroke: col, strokeWidth: 1.75, strokeLinejoin: 'round' }),
    ...xs.map((x, i) => h('circle', { key: i, cx: x, cy: yCoord(vals[i]), r: i === xs.length - 1 ? 3 : 2, fill: col, opacity: i === xs.length - 1 ? 1 : .55 })),
  );
}

function RankBadge({ pct }) {
  if (pct == null) return null;
  const col = pct >= 75 ? '#10b981' : pct >= 50 ? '#84cc16' : pct >= 25 ? '#f97316' : '#ef4444';
  return span({ style: { fontSize: 9, fontWeight: 700, color: col, minWidth: 30, display: 'inline-block' } }, pct + '%ile');
}

// Column sort for the per-store table -- independent of `rank`/`pct` (which stay the metric's
// own best-to-worst ordering, computed once by withRanks and never recomputed here). Clicking a
// header re-orders the DISPLAYED rows only.
const SORT_KEYS = {
  rank: r => r.rank,
  loc: r => Number(r.loc),
  name: r => sNameC(r.loc),
  value: r => r.value,
  pct: r => r.pct ?? -1,
};
function sortRows(rows, sort) {
  if (!sort) return rows;
  const getKey = SORT_KEYS[sort.col];
  const mul = sort.dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = getKey(a), bv = getKey(b);
    if (av < bv) return -1 * mul;
    if (av > bv) return 1 * mul;
    return 0;
  });
}
function SortableTh({ col, label, align, sort, onSort }) {
  const active = sort?.col === col;
  return h('th', {
    onClick: () => onSort(col),
    style: {
      textAlign: align || 'left', padding: '6px 10px', color: active ? 'var(--amber)' : 'var(--text3)',
      fontSize: 10, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
    },
  }, label, active ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : '');
}

function PeriodSection({ period, metric, rankMode, priorPoints }) {
  const { useState } = React;
  const [sort, setSort] = useState(null); // null = natural rank order
  const onSort = (col) => setSort(s => (s?.col === col ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' }));
  const shown = sortRows(rankFilterRows(period.rows, rankMode), sort);
  return div({ style: { border: '.5px solid var(--bdr)', borderRadius: 'var(--rl)', overflow: 'hidden' } },
    div({ style: { padding: '10px 14px', background: 'var(--surf2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 } },
      div(null,
        div({ style: { fontSize: 13, fontWeight: 800, color: 'var(--text)' } }, period.label),
        span({ style: { fontSize: 10, color: 'var(--text3)' } }, period.s + ' to ' + period.e + ' · ' + period.n + ' location(s)'),
      ),
      div({ style: { display: 'flex', alignItems: 'center', gap: 14 } },
        h(MiniTrend, { points: priorPoints, direction: metric.direction }),
        div({ style: { textAlign: 'right' } },
          div({ style: { fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.04em' } }, 'All Locations'),
          div({ style: { fontSize: 20, fontWeight: 800, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' } }, fmtTrendValue(period.combined, metric.unit)),
        ),
      ),
    ),
    !shown.length ? div({ style: { padding: 20, textAlign: 'center', color: 'var(--text3)', fontSize: 11 } }, 'No data for this period/scope.')
      : div({ style: { overflowX: 'auto' } },
        h('table', { style: { width: '100%', minWidth: 420, borderCollapse: 'collapse', fontSize: 11.5 } },
          h('thead', null, h('tr', null,
            h(SortableTh, { col: 'rank', label: 'Rank', sort, onSort }),
            h(SortableTh, { col: 'loc', label: 'Loc #', sort, onSort }),
            h(SortableTh, { col: 'name', label: 'Location', sort, onSort }),
            h(SortableTh, { col: 'value', label: metric.label, align: 'right', sort, onSort }),
            h(SortableTh, { col: 'pct', label: 'Percentile', align: 'right', sort, onSort }),
          )),
          h('tbody', null, ...shown.map(r => h('tr', { key: r.loc, style: { borderTop: '.5px solid var(--bdr)' } },
            h('td', { style: { padding: '5px 10px', color: 'var(--text3)' } }, '#' + r.rank),
            h('td', { style: { padding: '5px 10px', color: 'var(--text3)', fontVariantNumeric: 'tabular-nums' } }, r.loc),
            h('td', { style: { padding: '5px 10px', color: 'var(--text)' } }, sNameC(r.loc)),
            h('td', { style: { padding: '5px 10px', textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' } }, fmtTrendValue(r.value, metric.unit)),
            h('td', { style: { padding: '5px 10px', textAlign: 'right' } }, h(RankBadge, { pct: r.pct })),
          ))),
        ),
      ),
  );
}

function exportCSV(metric, sections, scopeLabel) {
  const lines = [`Performance Trends — ${metric.label} (${scopeLabel})`, ''];
  for (const period of sections) {
    lines.push(`${period.label} (${period.s} to ${period.e})`);
    lines.push(`All Locations,${fmtTrendValue(period.combined, metric.unit)}`);
    lines.push('Rank,Loc #,Location,Value,Percentile');
    for (const r of period.rows) lines.push(`${r.rank},${r.loc},${sNameC(r.loc)},${fmtTrendValue(r.value, metric.unit)},${r.pct ?? ''}`);
    lines.push('');
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `performance-trends-${metric.key}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function printReport(metric, sections, scopeLabel) {
  const rowsHtml = sections.map(period => `
    <h3>${escapeHtml(period.label)} <span style="font-weight:400;color:#888;font-size:12px">(${period.s} to ${period.e})</span></h3>
    <div style="margin:4px 0 8px;font-size:14px"><b>All Locations:</b> ${fmtTrendValue(period.combined, metric.unit)}</div>
    <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:18px">
      <thead><tr style="background:#f3f4f6"><th style="text-align:left;padding:5px 8px;border:1px solid #ddd">Rank</th><th style="text-align:left;padding:5px 8px;border:1px solid #ddd">Loc #</th><th style="text-align:left;padding:5px 8px;border:1px solid #ddd">Location</th><th style="text-align:right;padding:5px 8px;border:1px solid #ddd">${escapeHtml(metric.label)}</th></tr></thead>
      <tbody>${period.rows.map(r => `<tr><td style="padding:4px 8px;border:1px solid #ddd">#${r.rank}</td><td style="padding:4px 8px;border:1px solid #ddd">${escapeHtml(String(r.loc))}</td><td style="padding:4px 8px;border:1px solid #ddd">${escapeHtml(sNameC(r.loc))}</td><td style="text-align:right;padding:4px 8px;border:1px solid #ddd">${fmtTrendValue(r.value, metric.unit)}</td></tr>`).join('')}</tbody>
    </table>`).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Performance Trends</title>
    <style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#111;padding:24px}h1{font-size:18px;margin:0 0 2px}h3{font-size:14px;margin:14px 0 4px}</style>
    </head><body><h1>Performance Trends — ${escapeHtml(metric.label)}</h1><div style="color:#666;font-size:12px;margin-bottom:14px">${escapeHtml(scopeLabel)} · generated ${new Date().toLocaleDateString()}</div>${rowsHtml}</body></html>`;
  import('../utils/print-html.js').then(m => m.printHtml(html));
}

// ── Email Summary -- the owner's own reference table (2026-09-14: "for the first project, I
// also send this out in the same email"). Fixed Combined/OK/FL scopes x [Sales/GC/Labor/FOB]
// columns x [3 trailing complete months, current MTD] rows -- reproduces the reference exactly,
// a compact scorecard rather than the per-store drill-down above.
const SUMMARY_COLS = [
  { key: 'salesPct', label: 'Sales' },
  { key: 'gcPct', label: 'GC' },
  { key: 'laborPct', label: 'Labor' },
  { key: 'fobPct', label: 'FOB' },
];

function ScopeSummaryTable({ title, rows }) {
  return div({ style: { border: '.5px solid var(--bdr)', borderRadius: 'var(--rl)', overflow: 'hidden' } },
    div({ style: { padding: '8px 14px', background: 'var(--adim)', color: 'var(--amber)', fontSize: 13, fontWeight: 800 } }, title),
    div({ style: { overflowX: 'auto' } },
      h('table', { style: { width: '100%', minWidth: 420, borderCollapse: 'collapse', fontSize: 12 } },
        h('thead', null, h('tr', { style: { background: 'var(--surf2)' } },
          h('th', { style: { textAlign: 'left', padding: '6px 10px', color: 'var(--text2)' } }, 'Month'),
          ...SUMMARY_COLS.map(c => h('th', { key: c.key, style: { textAlign: 'right', padding: '6px 10px', color: 'var(--text2)' } }, c.label)),
        )),
        h('tbody', null, ...rows.map(r => h('tr', { key: r.key, style: { borderTop: '.5px solid var(--bdr)' } },
          h('td', { style: { padding: '5px 10px', fontWeight: 700, color: 'var(--text)' } }, r.label),
          ...SUMMARY_COLS.map(c => h('td', { key: c.key, style: { padding: '5px 10px', textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: 'var(--text)' } }, fmtTrendValue(r[c.key], 'pct'))),
        ))),
      ),
    ),
  );
}

function exportSummaryCSV(scopeTables) {
  const lines = [`Performance Trends — Email Summary`, ''];
  for (const { title, rows } of scopeTables) {
    lines.push(title);
    lines.push('Month,' + SUMMARY_COLS.map(c => c.label).join(','));
    for (const r of rows) lines.push([r.label, ...SUMMARY_COLS.map(c => fmtTrendValue(r[c.key], 'pct'))].join(','));
    lines.push('');
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `performance-trends-email-summary-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function printSummary(scopeTables) {
  const tablesHtml = scopeTables.map(({ title, rows }) => `
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:18px">
      <thead><tr><th colspan="${SUMMARY_COLS.length + 1}" style="text-align:left;background:#4472c4;color:#fff;padding:6px 10px">${escapeHtml(title)}</th></tr>
      <tr style="background:#dbe5f1"><th style="text-align:left;padding:5px 8px;border:1px solid #ccc">Month</th>${SUMMARY_COLS.map(c => `<th style="text-align:right;padding:5px 8px;border:1px solid #ccc">${escapeHtml(c.label)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(r => `<tr><td style="padding:4px 8px;border:1px solid #ccc;font-weight:700">${escapeHtml(r.label)}</td>${SUMMARY_COLS.map(c => `<td style="text-align:right;padding:4px 8px;border:1px solid #ccc">${fmtTrendValue(r[c.key], 'pct')}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>`).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Performance Trends — Email Summary</title>
    <style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#111;padding:24px}</style>
    </head><body><h1 style="font-size:18px;margin:0 0 12px">Performance Trends — Email Summary</h1>${tablesHtml}</body></html>`;
  import('../utils/print-html.js').then(m => m.printHtml(html));
}

export function TrendReportPanel({ ds, onClose }) {
  const { useState, useMemo, useEffect } = React;
  const [viewMode, setViewMode] = useState('detail'); // 'detail' | 'summary'
  const [metricKey, setMetricKey] = useState('laborPct');
  const [scopeValue, setScopeValue] = useState({ level: 'all', id: null });
  const [rankMode, setRankMode] = useState('all');
  // Real per-day {loc,date,sales,gc} rows for Email Summary's Sales/GC comps -- fetched fresh
  // on first entering that mode, NOT read from `ds` (whose default load is only 60 days back,
  // nowhere near the ~1 year of history a real calendar-YoY comp needs). null = not fetched yet.
  const [actRows, setActRows] = useState(null);
  const [actLoading, setActLoading] = useState(false);

  useEffect(() => {
    if (viewMode !== 'summary' || actRows != null || actLoading) return;
    setActLoading(true);
    loadQsrActSummary(scopeSummaryFetchDaysBack())
      .then(rows => setActRows(rows || []))
      .catch(() => setActRows([]))
      .finally(() => setActLoading(false));
  }, [viewMode, actRows, actLoading]);

  const metric = findTrendMetric(metricKey) || TREND_REPORT_METRICS[0];

  const tree = useMemo(() => buildLocationHierarchy(ALL_STORES, INV_ORG_COORDS, STORE_NAMES), []);
  const scopedLocs = useMemo(() => locationSelectorLocs(scopeValue, tree), [scopeValue, tree]);

  const periods = useMemo(() => trendReportPeriods(), []);

  // Store Detail's oldest period ("Two Months Back") is a full calendar month that can start
  // well before `ds`'s default load window (App.js loads qsrActSummaryRows/opsLaborRows/etc.
  // only ~60 days back) -- the SAME root cause the Email Summary "missing June" bug (v5.444) had,
  // just not yet fixed for this view. Rather than assume 60 days is still the live default (it
  // has already drifted once), fetch fresh, sufficiently-deep rows on demand -- exactly like
  // Email Summary's own actRows fetch just above -- covering every table a Store Detail metric
  // can read (sales/gc/tpph/oepe/r2p/avgCheck -> qsrActSummaryRows, laborPct -> opsLaborRows,
  // fobPct -> qsrFobRows, cashOSPct/discPct -> opsCashRows). Fetched ONCE per session (not per
  // metric switch) since all 4 loaders take the same daysBack and the periods are fixed for the
  // session; overlays (never merges into) the global `ds` arrays so every Store Detail figure is
  // computed from a real, complete month -- never a silently truncated one.
  const detailDaysBack = useMemo(() => {
    const oldestStart = periods[periods.length - 1]?.s;
    if (!oldestStart) return 60;
    const days = Math.ceil((Date.now() - new Date(oldestStart + 'T00:00:00').getTime()) / 86400000);
    return Math.max(days + 5, 60); // +5 buffer; never less than the old 60-day default
  }, [periods]);
  const [detailRows, setDetailRows] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  useEffect(() => {
    if (viewMode !== 'detail' || detailRows != null || detailLoading) return;
    setDetailLoading(true);
    Promise.all([
      loadQsrActSummary(detailDaysBack),
      loadOpsLaborSummary(detailDaysBack),
      loadQsrFob({ daysBack: detailDaysBack }),
      loadOpsCashSheet(detailDaysBack),
    ]).then(([act, labor, fob, cash]) => {
      setDetailRows({ qsrActSummaryRows: act || [], opsLaborRows: labor || [], qsrFobRows: fob || [], opsCashRows: cash || [] });
    }).catch(() => setDetailRows({ qsrActSummaryRows: [], opsLaborRows: [], qsrFobRows: [], opsCashRows: [] }))
      .finally(() => setDetailLoading(false));
  }, [viewMode, detailRows, detailLoading, detailDaysBack]);
  const detailDs = useMemo(() => (detailRows ? { ...ds, ...detailRows } : ds), [ds, detailRows]);

  const sections = useMemo(() => computeTrendReport(detailDs, metric, scopedLocs, periods), [detailDs, metric, scopedLocs, periods]);

  // twoBack -> lastMonth -> mtd, oldest first, for the mini trend line.
  const combinedTrendPoints = [...sections].reverse().map(p => ({ value: p.combined }));

  const scopeLabel = scopeValue.level === 'all' ? 'All Locations' : scopeValue.level === 'state' ? scopeValue.id + ' Locations' : scopeValue.level === 'patch' ? 'Patch ' + scopeValue.id : sNameC(scopeValue.id);

  // ── Email Summary data (Combined/OK/FL, fixed) ──────────────────────────────────────────
  const allLocs = tree.locs;
  const okLocs = useMemo(() => allLocs.filter(l => (INV_ORG_COORDS[l] || {}).state === 'OK'), [allLocs]);
  const flLocs = useMemo(() => allLocs.filter(l => (INV_ORG_COORDS[l] || {}).state === 'FL'), [allLocs]);
  const summaryPeriods = useMemo(() => scopeSummaryPeriods(), []);
  const scopeTables = useMemo(() => ([
    { title: 'Combined (OK/FL)', rows: computeScopeSummary(ds, actRows || [], allLocs, summaryPeriods) },
    { title: 'Oklahoma', rows: computeScopeSummary(ds, actRows || [], okLocs, summaryPeriods) },
    { title: 'Florida', rows: computeScopeSummary(ds, actRows || [], flLocs, summaryPeriods) },
  ]), [ds, actRows, allLocs, okLocs, flLocs, summaryPeriods]);

  return h(RoutePanelShell, {
    icon: '📈',
    title: 'Performance Trends',
    subtitle: viewMode === 'summary'
      ? 'Email Summary — 3 trailing complete months + current MTD, Combined/OK/FL'
      : 'Current MTD, last complete month, two months back — one table for all locations plus OK/FL breakouts',
    onBack: onClose,
    headerExtra: div({ style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } },
      div({ style: { display: 'flex', gap: 4 } },
        btn({ style: _pillStyle(viewMode === 'detail'), onClick: () => setViewMode('detail') }, 'Store Detail'),
        btn({ style: _pillStyle(viewMode === 'summary'), onClick: () => setViewMode('summary') }, '📧 Email Summary'),
      ),
      viewMode === 'detail' && h('select', {
        value: metric.key, onChange: e => setMetricKey(e.target.value),
        style: { background: 'var(--surf)', border: '.5px solid var(--bdr)', borderRadius: 'var(--r)', color: 'var(--text)', fontSize: 11, padding: '5px 8px' },
      }, ...TREND_REPORT_METRICS.map(m => h('option', { key: m.key, value: m.key }, m.label))),
      viewMode === 'detail' && h(LocationSelector, { stores: ALL_STORES, invOrgCoords: INV_ORG_COORDS, storeNames: STORE_NAMES, value: scopeValue, onChange: setScopeValue }),
      viewMode === 'detail' && div({ style: { display: 'flex', gap: 4 } },
        ...RANK_MODES.map(rm => btn({ key: rm.id, style: _pillStyle(rankMode === rm.id), onClick: () => setRankMode(rm.id) }, rm.label))),
      btn({
        className: 'btn btn-sm', disabled: viewMode === 'detail' && (detailLoading || detailRows == null),
        onClick: () => (viewMode === 'summary' ? exportSummaryCSV(scopeTables) : exportCSV(metric, sections, scopeLabel)),
      }, '⬇ CSV'),
      btn({
        className: 'btn btn-sm', disabled: viewMode === 'detail' && (detailLoading || detailRows == null),
        onClick: () => (viewMode === 'summary' ? printSummary(scopeTables) : printReport(metric, sections, scopeLabel)),
      }, '🖨 Print'),
    ),
  },
    viewMode === 'summary'
      ? (actLoading || actRows == null)
        ? div({ style: { padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 12 } },
          'Loading ~' + Math.round(scopeSummaryFetchDaysBack() / 30) + ' months of sales history for accurate year-over-year comps…')
        : div({ style: { display: 'flex', flexDirection: 'column', gap: 16, padding: 16 } },
          ...scopeTables.map(t => h(ScopeSummaryTable, { key: t.title, ...t })),
          div({ style: { fontSize: 10, color: 'var(--text3)', padding: '4px 4px 0' } },
            'Sales and GC are a genuine calendar-year-over-year comp — this period\'s real total vs. the exact same date range ' +
            'one year earlier, both summed independently (never a matched-weekday/364-day-shifted shadow field). ' +
            'Labor % and FOB % are a true Σnumerator ÷ Σdenominator across each period, not an average of daily percentages.')
        )
      : (detailLoading || detailRows == null)
        ? div({ style: { padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 12 } },
          'Loading ~' + Math.round(detailDaysBack / 30) + ' months of history so Two Months Back reflects the full month…')
        : div({ style: { display: 'flex', flexDirection: 'column', gap: 16, padding: 16 } },
          ...sections.map((period, i) => h(PeriodSection, {
            key: period.key, period, metric, rankMode,
            priorPoints: combinedTrendPoints.slice(0, sections.length - i),
          })),
          div({ style: { fontSize: 10, color: 'var(--text3)', padding: '4px 4px 0' } },
            'Current MTD counts only completed business days (never an in-progress "today"). ' +
            'Ratio metrics (Labor %, FOB %, TPPH, OEPE, R2P, Cash O/S %, Disc %) are a true Σnumerator ÷ Σdenominator ' +
            'across the period, not an average of daily percentages — the same convention every other Meridian rollup uses. ' +
            'Click a column header to sort.'),
        ),
  );
}
