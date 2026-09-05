// @ts-nocheck
// Trend Explorer — owner-requested 2026-09-05 (memory/project-trends-panel.md). Pick any metric
// from the registry, a date range, a daily/weekly/monthly/yearly frequency, see it as a table +
// sparkline, and get a diagnostic read: which weekdays run this metric hot/cold, and what else
// moves with it (reusing Signals' own Scanner correlation engine, never a second implementation).
//
// SINGLE-STORE ONLY for v1 (memory/project-trends-panel.md's own open design question, settled
// here) — see src/engine/trend-explorer.js's header comment for why a correct district-wide
// rollup isn't generically possible from the registry today without risking the "never average
// averages" trap on rate/percentage metrics.
import * as React from 'react';
import { STORE_NAMES, INV_ORG_COORDS } from '../constants.js';
import { RoutePanelShell } from '../components/ModalShell.js';
import { DateRangeControl, DATE_RANGE_PRESETS, resolveDatePreset, LocationSelector } from '../components/PanelControls.js';
import { MetricSelect } from './signals.js';
import { METRIC_CATEGORIES, findMetric, extractMetricValues, scanAllPairs } from '../engine/signal-registry.js';
import { TREND_FREQUENCIES, bucketMetricSeries, filterSeriesToRange, dayOfWeekBreakdown, correlatedMetricsFor } from '../engine/trend-explorer.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);
const btn = (p, ...c) => h('button', p, ...c);

const ALL_STORES = Object.keys(STORE_NAMES).map(loc => ({ loc }));
const FREQ_LABELS = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' };

const _pillStyle = (active) => ({
  padding: '4px 12px', borderRadius: 'var(--r)',
  border: '.5px solid ' + (active ? 'rgba(245,158,11,.4)' : 'var(--bdr)'),
  background: active ? 'var(--adim)' : 'transparent',
  color: active ? 'var(--amber)' : 'var(--text2)',
  fontSize: '11px', fontWeight: active ? 700 : 400, cursor: 'pointer',
});

function fmtValue(v, unit) {
  if (v == null || isNaN(v)) return '—';
  if (unit === 'pct') return v.toFixed(1) + '%';
  if (unit === '$') return '$' + v.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (unit === 'sec') return v.toFixed(0) + 's';
  return v.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function periodLabel(period, frequency) {
  if (frequency === 'yearly') return period;
  if (frequency === 'monthly') { const [y, m] = period.split('-'); return new Date(+y, +m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }); }
  // daily/weekly are both YYYY-MM-DD keys (weekly = the week-start date)
  const d = new Date(period + 'T00:00:00');
  return isNaN(d) ? period : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + (frequency === 'weekly' ? ' wk' : '');
}

// A general-purpose value sparkline, styled consistently with signals.js's MiniSparkline
// (same dimensions/stroke approach) but keyed on `.value` instead of a correlation-r history —
// different enough data shape that reusing that component directly wasn't a fit.
function TrendSparkline({ points, better }) {
  if (!points?.length) return null;
  const pts = points.slice(-40);
  const W = 320, H = 56, pad = 6;
  const vals = pts.map(p => p.value);
  const minY = Math.min(...vals), maxY = Math.max(...vals);
  const range = maxY - minY || 1;
  const xStep = pts.length > 1 ? (W - pad * 2) / (pts.length - 1) : 0;
  const xs = pts.map((_, i) => pad + i * xStep);
  const yCoord = v => H - pad - ((v - minY) / range) * (H - pad * 2);
  const poly = pts.map((p, i) => `${xs[i].toFixed(1)},${yCoord(p.value).toFixed(1)}`).join(' ');
  const lastUp = pts.length > 1 && pts[pts.length - 1].value > pts[pts.length - 2].value;
  const goodUp = better === 'higher' ? lastUp : better === 'lower' ? !lastUp : null;
  const col = goodUp == null ? 'var(--amber)' : goodUp ? '#10b981' : '#ef4444';
  return h('svg', { width: W, height: H, style: { display: 'block' } },
    h('polyline', { points: poly, fill: 'none', stroke: col, strokeWidth: 1.75, strokeLinejoin: 'round' }),
    h('circle', { cx: xs[xs.length - 1], cy: yCoord(vals[vals.length - 1]), r: 3, fill: col }),
  );
}

function DayOfWeekBars({ rows, unit }) {
  const vals = rows.map(r => r.value).filter(v => v != null);
  const maxV = Math.max(0.001, ...vals.map(Math.abs));
  return div({ style: { display: 'flex', gap: 6, alignItems: 'flex-end', height: 70 } },
    ...rows.map(r => div({ key: r.dow, style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flex: 1 } },
      div({ title: r.value == null ? 'No data' : fmtValue(r.value, unit) + ` (n=${r.n})`,
        style: { width: '100%', height: (r.value == null ? 2 : Math.max(3, Math.abs(r.value) / maxV * 40)) + 'px',
          background: r.value == null ? 'var(--bdr)' : 'var(--amber)', borderRadius: 2 } }),
      span({ style: { fontSize: 9, color: 'var(--text3)' } }, r.label),
    )),
  );
}

export function TrendExplorerPanel({ ds, onClose }) {
  const { useState, useMemo, useEffect } = React;
  const [metricKey, setMetricKey] = useState(null);
  const [storeLoc, setStoreLoc] = useState(null);
  const [dateRange, setDateRange] = useState(() => resolveDatePreset('90d'));
  const [frequency, setFrequency] = useState('daily');

  const meta = metricKey ? findMetric(metricKey) : null;
  const baseGranularity = meta?.granularity?.includes('daily') ? 'daily' : 'monthly';
  const availFrequencies = baseGranularity === 'daily' ? TREND_FREQUENCIES : ['monthly', 'yearly'];

  // Auto-restrict frequency when the picked metric doesn't support daily (matches
  // SignalBuilder's own auto-restrict-on-metric-change pattern in signals.js).
  useEffect(() => {
    if (meta && !availFrequencies.includes(frequency)) setFrequency(availFrequencies[0]);
  }, [metricKey]);

  const rawSeries = useMemo(() => (
    metricKey && storeLoc ? extractMetricValues(metricKey, ds, baseGranularity, storeLoc) : []
  ), [ds, metricKey, storeLoc, baseGranularity]);

  const rangeFiltered = useMemo(() => filterSeriesToRange(rawSeries, dateRange?.s, dateRange?.e), [rawSeries, dateRange?.s, dateRange?.e]);

  const aggMode = meta?.aggregate === 'sum' ? 'sum' : 'avg';
  const bucketed = useMemo(() => bucketMetricSeries(rangeFiltered, frequency, aggMode), [rangeFiltered, frequency, aggMode]);
  const dowRows = useMemo(() => baseGranularity === 'daily' ? dayOfWeekBreakdown(rangeFiltered, aggMode) : [], [rangeFiltered, aggMode, baseGranularity]);

  // Scanner's full pairwise sweep -- expensive, so memoized on [store, baseGranularity] only
  // (NOT on metricKey — changing which metric you're LOOKING AT doesn't need a recompute, only
  // filtering via correlatedMetricsFor below does).
  const scanResults = useMemo(() => (
    storeLoc ? scanAllPairs(ds, { granularity: baseGranularity, scopeLoc: storeLoc }).results : []
  ), [ds, storeLoc, baseGranularity]);
  const correlated = useMemo(() => correlatedMetricsFor(scanResults, metricKey, 5), [scanResults, metricKey]);

  const latest = bucketed[bucketed.length - 1];
  const prior = bucketed[bucketed.length - 2];
  const delta = latest && prior && prior.value ? ((latest.value - prior.value) / Math.abs(prior.value)) * 100 : null;
  const deltaGood = delta == null || !meta?.better ? null : (meta.better === 'higher' ? delta > 0 : delta < 0);

  return h(RoutePanelShell, {
    icon: '📈',
    title: 'Trend Explorer',
    subtitle: 'Any metric, any period, any frequency — with a day-of-week read and what else moves with it',
    onBack: onClose,
    headerExtra: div({ style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } },
      h(MetricSelect, { value: metricKey, onChange: setMetricKey, label: 'Metric' }),
      h(LocationSelector, { stores: ALL_STORES, invOrgCoords: INV_ORG_COORDS, storeNames: STORE_NAMES, mode: 'store',
        value: storeLoc ? { level: 'store', id: storeLoc } : { level: 'all', id: null },
        onChange: v => setStoreLoc(v.id || null) }),
      h(DateRangeControl, { presets: DATE_RANGE_PRESETS, value: dateRange, onChange: setDateRange }),
    ),
  },
    !metricKey && div({ style: { padding: 30, textAlign: 'center', color: 'var(--text3)' } }, 'Pick a metric above to start.'),
    metricKey && !storeLoc && div({ style: { padding: 30, textAlign: 'center', color: 'var(--text3)' } },
      'Pick a store to see ' + meta.label + '\'s trend. (District-wide rollups aren\'t built yet — see the panel\'s own notes on why.)'),
    metricKey && storeLoc && div({ style: { display: 'flex', flexDirection: 'column', gap: 16, padding: 16 } },

      // ── Frequency + summary ──────────────────────────────────────────
      div({ style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 } },
        div({ style: { display: 'flex', gap: 6 } },
          ...availFrequencies.map(f => btn({ key: f, style: _pillStyle(frequency === f), onClick: () => setFrequency(f) }, FREQ_LABELS[f]))),
        latest && div({ style: { display: 'flex', alignItems: 'baseline', gap: 8 } },
          span({ style: { fontSize: 22, fontWeight: 800, color: 'var(--text)' } }, fmtValue(latest.value, meta.unit)),
          delta != null && span({ style: { fontSize: 12, fontWeight: 700, color: deltaGood == null ? 'var(--text3)' : deltaGood ? '#10b981' : '#ef4444' } },
            (delta >= 0 ? '▲ ' : '▼ ') + Math.abs(delta).toFixed(1) + '% vs prior ' + frequency.replace('ly', '')),
        ),
      ),

      // ── Sparkline + table ────────────────────────────────────────────
      div({ style: { display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' } },
        div(null,
          h(TrendSparkline, { points: bucketed, better: meta.better }),
          span({ style: { fontSize: 10, color: 'var(--text3)' } }, bucketed.length + ' ' + frequency + ' period(s)')),
        div({ style: { overflowX: 'auto', maxHeight: 220, flex: 1, minWidth: 240 } },
          h('table', { style: { width: 'max-content', minWidth: '100%', borderCollapse: 'collapse', fontSize: 11 } },
            h('thead', null, h('tr', null,
              h('th', { style: { textAlign: 'left', padding: '4px 8px', color: 'var(--text3)' } }, 'Period'),
              h('th', { style: { textAlign: 'right', padding: '4px 8px', color: 'var(--text3)' } }, meta.label))),
            h('tbody', null, ...[...bucketed].reverse().map(b => h('tr', { key: b.period },
              h('td', { style: { padding: '3px 8px', borderTop: '.5px solid var(--bdr)' } }, periodLabel(b.period, frequency)),
              h('td', { style: { padding: '3px 8px', borderTop: '.5px solid var(--bdr)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' } }, fmtValue(b.value, meta.unit))))),
          ),
        ),
      ),

      // ── Diagnostic: day-of-week read ─────────────────────────────────
      dowRows.length > 0 && div(null,
        div({ style: { fontSize: 11, fontWeight: 700, color: 'var(--text2)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.04em' } }, 'By day of week'),
        h(DayOfWeekBars, { rows: dowRows, unit: meta.unit }),
      ),

      // ── Diagnostic: what else moves with this ────────────────────────
      div(null,
        div({ style: { fontSize: 11, fontWeight: 700, color: 'var(--text2)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.04em' } }, 'Moves together with'),
        correlated.length === 0 && span({ style: { fontSize: 11, color: 'var(--text3)' } }, 'No metrics clear the significance bar for this store/period yet.'),
        div({ style: { display: 'flex', flexDirection: 'column', gap: 6 } },
          ...correlated.map(c => div({ key: c.other.key, style: { padding: '6px 10px', border: '.5px solid var(--bdr)', borderRadius: 'var(--r)', fontSize: 11, display: 'flex', justifyContent: 'space-between' } },
            span(null, c.other.category ? c.other.category + ' · ' : '', c.other.label),
            span({ style: { fontWeight: 700, color: c.r > 0 ? '#10b981' : '#ef4444' } }, (c.r > 0 ? '+' : '') + c.r.toFixed(2) + ' r, n=' + c.n))),
        ),
        h('div', { style: { fontSize: 10, color: 'var(--text3)', marginTop: 6 } }, 'Statistical association ("move together"), never a causal claim.'),
      ),
    ),
  );
}
