// @ts-nocheck
// ── YoY Trends (task #90, design doc memory/plan-yoy-trend-dashboard-2026-11-05.md) ──────────
// Year-over-year TREND -- a full monthly series across multiple years, not a single point-in-
// time percentage. Confirmed as a genuine gap (not a re-skin) after auditing every existing
// trend-adjacent panel: Performance Trends (sequential period-over-period, not YoY), Trend
// Explorer (single-store, exploratory, no multi-year overlay), vs-ly.js (one aggregate number,
// never a trend line).
//
// Metric registry: PERFORMER_METRICS (engine/top-bottom-performers.js) -- the same list
// Leaderboards and Targets Editor Tier 2 already standardize on, so this is the THIRD reuse of
// it, not a new fourth registry.
//
// Calendar matching: engine/yoy-trend.js's computeYoyMonthlySeries, which matches each month to
// the SAME calendar month N year(s) back (verified against live production data before shipping
// -- see that file's header comment). Deliberately NOT vs-ly.js's matchedVsLY/364-day-shadow
// matching, which is correct for a trading-WEEK comparison and wrong for a calendar month.
import * as React from 'react';
import { Chart } from 'chart.js/auto';
import { STORE_NAMES, INV_ORG_COORDS, sNameC } from '../constants.js';
import { RoutePanelShell } from '../components/ModalShell.js';
import { LocationSelector, buildLocationHierarchy, locationSelectorLocs } from '../components/PanelControls.js';
import { InfoIcon } from '../engine/forecast.js';
import { ExportDropdown, TT, AX, LEG } from './store-dash.js';
import { loadQsrActSummary, loadOpsLaborSummary, loadQsrFob, loadOpsCashSheet } from '../lib/supabase.js';
import { lastClosedBusinessDay } from '../utils/date.js';
import { PERFORMER_METRICS } from '../engine/top-bottom-performers.js';
import { computeYoyMonthlySeries, yoyFetchDaysBack } from '../engine/yoy-trend.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);
const btn = (p, ...c) => h('button', p, ...c);

const ALL_STORES = Object.keys(STORE_NAMES).map(loc => ({ loc }));

const YEARS_BACK_OPTIONS = [
  { yearsBack: 1, label: '2 years' },
  { yearsBack: 2, label: '3 years' },
  { yearsBack: 3, label: '4 years' },
];

const _pillStyle = (active) => ({
  padding: '4px 12px', borderRadius: 'var(--r)',
  border: '.5px solid ' + (active ? 'rgba(245,158,11,.4)' : 'var(--bdr)'),
  background: active ? 'var(--adim)' : 'transparent',
  color: active ? 'var(--amber)' : 'var(--text2)',
  fontSize: '11px', fontWeight: active ? 700 : 400, cursor: 'pointer',
});

// Amber (the house gold accent) at full strength for the current year, progressively fainter
// for each prior year back -- a SEQUENTIAL encoding (one hue, decreasing lightness/opacity) for
// an ordinal "years back" dimension, not a categorical palette (there is no identity distinction
// between the lines beyond their recency -- same metric, same store scope, different year).
// Dash pattern lengthens with age too, so even a greyscale printout keeps them distinguishable
// without relying on color alone.
const GOLD = [245, 158, 11]; // rgb for var(--amber), #f59e0b-ish — matches house accent
function yearStyle(i, isCurrent) {
  const opacity = isCurrent ? 1 : Math.max(0.35, 1 - i * 0.28);
  const color = `rgba(${GOLD[0]},${GOLD[1]},${GOLD[2]},${opacity})`;
  return {
    borderColor: color,
    backgroundColor: 'transparent',
    borderWidth: isCurrent ? 2.5 : 1.5,
    borderDash: isCurrent ? [] : [6, 3].map(n => n + i * 2),
    pointRadius: isCurrent ? 3 : 2,
    pointBackgroundColor: color,
    tension: 0.25,
    spanGaps: false,
  };
}

// Same useChart lifecycle convention store-dash.js's own charts use (build on mount/dep-change,
// destroy on cleanup) -- hand-rolled here rather than importing that file's private useChart,
// since this view already imports store-dash.js once for ExportDropdown and a second named
// hook import would be the only reason to widen that coupling further.
function useChart(canvasRef, buildFn, deps) {
  const { useRef, useEffect } = React;
  const chartRef = useRef(null);
  useEffect(() => {
    if (!canvasRef.current) return undefined;
    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
    try { chartRef.current = buildFn(canvasRef.current); } catch (e) { console.warn('YoY chart error:', e); }
    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
  }, deps); // eslint-disable-line
}

function YoyChart({ series, metric }) {
  const { useRef } = React;
  const ref = useRef(null);
  useChart(ref, canvas => {
    if (!series) return null;
    const labels = series.months.map(m => m.label);
    const datasets = series.years.map((y, i) => {
      const isCurrent = i === 0;
      const data = series.months.map(m => {
        const pt = m.byYear[y];
        return pt ? pt.value : null;
      });
      return {
        label: String(y) + (isCurrent ? ' (current)' : ''),
        data,
        ...yearStyle(i, isCurrent),
      };
    });
    return new Chart(canvas, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        // Reuse the house TT/AX/LEG Chart.js style objects (store-dash.js) rather than
        // hand-rolling new ones -- same tooltip/axis/legend look every other chart in the app
        // uses, and avoids a second literal copy of AX's white-alpha grid-line color (a
        // Chart.js-canvas-config exemption per light-mode-white-alpha.test.js's own header
        // comment, but reusing the already-counted shared constant is still cleaner than a
        // second copy of it).
        plugins: { legend: LEG, tooltip: { ...TT, callbacks: { label: c => c.dataset.label + ': ' + (c.raw != null ? metric.fmt(c.raw) : '—') } } },
        scales: { x: AX, y: AX },
      },
    });
  }, [series, metric]);
  return div({ style: { height: 340, padding: 16 } }, h('canvas', { ref }));
}

function fmtDelta(cur, prior) {
  if (cur == null || prior == null || prior === 0) return '—';
  const pct = (cur - prior) / Math.abs(prior);
  return (pct >= 0 ? '+' : '') + (pct * 100).toFixed(2) + '%';
}

function MonthlyTable({ series, metric }) {
  const years = series.years; // newest first: [current, current-1, current-2, ...]
  const curY = years[0], priorY = years[1];
  // NOT metric.direction -- PERFORMER_METRICS entries carry only {key,label,fmt}, no direction.
  // The real direction (metricDirection(), metric-source.js) is on series.direction, computed by
  // computeYoyMonthlySeries -- read from there so a missing field never silently reads as
  // "higher is better" (undefined*-1 would be NaN, not a wrong-but-plausible answer, but better
  // to never rely on a field this object doesn't have).
  const direction = series.direction;
  return div({ style: { overflowX: 'auto' } },
    h('table', { style: { width: '100%', minWidth: 460, borderCollapse: 'collapse', fontSize: 11.5 } },
      h('thead', null, h('tr', null,
        h('th', { style: { textAlign: 'left', padding: '6px 10px', color: 'var(--text3)', fontSize: 10 } }, 'Month'),
        h('th', { style: { textAlign: 'right', padding: '6px 10px', color: 'var(--text3)', fontSize: 10 } }, String(curY)),
        priorY != null && h('th', { style: { textAlign: 'right', padding: '6px 10px', color: 'var(--text3)', fontSize: 10 } }, 'LY (' + priorY + ')'),
        priorY != null && h('th', { style: { textAlign: 'right', padding: '6px 10px', color: 'var(--text3)', fontSize: 10 } }, 'Δ%'),
      )),
      h('tbody', null, ...series.months.map(mo => {
        const curPt = mo.byYear[curY];
        const priorPt = priorY != null ? mo.byYear[priorY] : null;
        return h('tr', { key: mo.m, style: { borderTop: '.5px solid var(--bdr)' } },
          h('td', { style: { padding: '5px 10px', color: 'var(--text)' } },
            mo.label, curPt && curPt.partial ? ' (MTD)' : ''),
          h('td', { style: { padding: '5px 10px', textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' } },
            curPt && curPt.value != null ? metric.fmt(curPt.value) : '—'),
          priorY != null && h('td', { style: { padding: '5px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text2)' } },
            priorPt && priorPt.value != null ? metric.fmt(priorPt.value) : '—'),
          priorY != null && h('td', { style: { padding: '5px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' } },
            (() => {
              const d = curPt && priorPt ? fmtDelta(curPt.value, priorPt.value) : '—';
              const good = curPt && priorPt && curPt.value != null && priorPt.value != null
                ? (curPt.value - priorPt.value) * (direction === 'lower' ? -1 : 1) >= 0
                : null;
              const col = good == null ? 'var(--text3)' : good ? '#10b981' : 'var(--crit)';
              return span({ style: { color: col, fontWeight: 700 } }, d);
            })()),
        );
      })),
    ),
  );
}

function exportRows(series, metric) {
  const years = series.years;
  return series.months.map(mo => {
    const row = { Month: mo.label };
    for (const y of years) {
      const pt = mo.byYear[y];
      row[String(y)] = pt && pt.value != null ? (pt.partial ? metric.fmt(pt.value) + ' (MTD)' : metric.fmt(pt.value)) : '—';
    }
    return row;
  });
}

export function YoyTrendsPanel({ ds, onClose }) {
  const { useState, useMemo, useEffect } = React;
  const [metricKey, setMetricKey] = useState('sales');
  const [scopeValue, setScopeValue] = useState({ level: 'all', id: null });
  const [yearsBack, setYearsBack] = useState(2); // 3 years total: current + 2 prior (doc default)

  const tree = useMemo(() => buildLocationHierarchy(ALL_STORES, INV_ORG_COORDS, STORE_NAMES), []);
  const scopedLocs = useMemo(() => locationSelectorLocs(scopeValue, tree), [scopeValue, tree]);

  const asOf = useMemo(() => lastClosedBusinessDay(), []);

  const daysBack = useMemo(() => yoyFetchDaysBack(yearsBack, 24, asOf), [yearsBack, asOf]);

  const [fetchedRows, setFetchedRows] = useState(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      loadQsrActSummary(daysBack),
      loadOpsLaborSummary(daysBack),
      loadQsrFob({ daysBack }),
      loadOpsCashSheet(daysBack),
    ]).then(([act, labor, fob, cash]) => {
      if (!alive) return;
      setFetchedRows({ qsrActSummaryRows: act || [], opsLaborRows: labor || [], qsrFobRows: fob || [], opsCashRows: cash || [] });
    }).catch(() => { if (alive) setFetchedRows({ qsrActSummaryRows: [], opsLaborRows: [], qsrFobRows: [], opsCashRows: [] }); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [daysBack]);

  const fullDs = useMemo(() => (fetchedRows ? { ...ds, ...fetchedRows } : ds), [ds, fetchedRows]);

  const metric = PERFORMER_METRICS.find(m => m.key === metricKey) || PERFORMER_METRICS[0];

  const series = useMemo(() => {
    if (!fetchedRows) return null;
    return computeYoyMonthlySeries(fullDs, { metricKey: metric.key, locs: scopedLocs, yearsBack, asOf });
  }, [fullDs, fetchedRows, metric.key, scopedLocs, yearsBack, asOf]);

  const scopeLabel = scopeValue.level === 'all' ? 'All Locations' : scopeValue.level === 'state' ? scopeValue.id + ' Locations' : scopeValue.level === 'patch' ? 'Patch ' + scopeValue.id : sNameC(scopeValue.id);

  const rows = series ? exportRows(series, metric) : [];
  const columns = series ? [
    { key: 'Month', label: 'Month' },
    ...series.years.map(y => ({ key: String(y), label: String(y) })),
  ] : [];

  return h(RoutePanelShell, {
    icon: '📅',
    title: 'YoY Trends',
    subtitle: div({ style: { display: 'flex', alignItems: 'center' } },
      span(null, `Year-over-year, by calendar month — ${YEARS_BACK_OPTIONS.find(o => o.yearsBack === yearsBack)?.label || ''}, ${scopeLabel}`),
      h(InfoIcon, { articleKey: 'yoy_trends_guide' })),
    onBack: onClose,
    headerExtra: div({ style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } },
      h('select', {
        value: metric.key, onChange: e => setMetricKey(e.target.value),
        style: { background: 'var(--surf)', border: '.5px solid var(--bdr)', borderRadius: 'var(--r)', color: 'var(--text)', fontSize: 11, padding: '5px 8px' },
      }, ...PERFORMER_METRICS.map(m => h('option', { key: m.key, value: m.key }, m.label))),
      h(LocationSelector, { stores: ALL_STORES, invOrgCoords: INV_ORG_COORDS, storeNames: STORE_NAMES, value: scopeValue, onChange: setScopeValue, variant: 'dropdown', multi: true }),
      div({ style: { display: 'flex', gap: 4 } },
        ...YEARS_BACK_OPTIONS.map(o => btn({ key: o.yearsBack, style: _pillStyle(yearsBack === o.yearsBack), onClick: () => setYearsBack(o.yearsBack) }, o.label))),
      h(ExportDropdown, { rows, columns, title: `YoY Trends — ${metric.label} (${scopeLabel})`, filename: `yoy-trends-${metric.key}-${new Date().toISOString().slice(0, 10)}` }),
    ),
  },
    loading || !series
      ? div({ style: { padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 12 } }, 'Loading history for the selected scope…')
      : div({ style: { padding: 16 } },
        series.flagged.length > 0 && div({
          style: { marginBottom: 14, padding: '10px 14px', background: 'rgba(245,158,11,.08)', border: '.5px solid rgba(245,158,11,.3)', borderRadius: 'var(--rl)', fontSize: 11, color: 'var(--text2)' },
        },
          series.excludedLocs.length > 0
            ? `⚠ ${series.excludedLocs.length} location(s) excluded from this rollup — too new to compare across the full ${series.years.length}-year window (opened within the honeymoon-ramp period): ${series.flagged.map(f => sNameC(f.loc)).join(', ')}.`
            : `⚠ This store opened within the honeymoon-ramp window for part of this comparison — early years may reflect grand-opening performance, not real year-over-year change.`),
        h('div', { style: { background: 'var(--surf2)', border: '.5px solid var(--bdr)', borderRadius: 'var(--rl)', marginBottom: 16, overflow: 'hidden' } },
          h(YoyChart, { series, metric }),
        ),
        h('div', { style: { border: '.5px solid var(--bdr)', borderRadius: 'var(--rl)', overflow: 'hidden' } },
          h(MonthlyTable, { series, metric }),
        ),
        div({ style: { fontSize: 10, color: 'var(--text3)', padding: '10px 4px 0' } },
          'Each month compares the SAME calendar month across years (e.g. September vs. the prior September) — not a 364-day/weekday-shifted comparison. ' +
          'A ratio metric (Labor %, FOB %, TPPH, etc.) is a true Σnumerator ÷ Σdenominator for the month, not an average of daily percentages. ' +
          'The current month shows "(MTD)" when it is still in progress — its total reflects completed days only, so it is not directly comparable to a full prior month until the month closes.'),
      ),
  );
}
