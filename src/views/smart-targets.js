// @ts-nocheck
// ── Smart Targets panel (Workstream B, P1) ───────────────────────────────────
// A data-proven target per store, from the smart-targets engine. Pilots Sales;
// the METRICS registry is the extension point for labor %, FOB, speed, etc.
// Shows the 5-column comparison: Official (management file) · Smart (this model) ·
// Current (recent run-rate) · vs Official · Confidence, plus excluded-anomaly days.
// FL and OK are anchored SEPARATELY (peers are same-state, like-sized only).
import * as React from 'react';
import { STORE_NAMES, getStoreOrg, DEF_SETTINGS } from '../constants.js';
import { computeSmartTarget, robustBaseline } from '../engine/smart-targets.js';
import { loadQsrActSummary } from '../lib/supabase.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);
const btn = (p, ...c) => h('button', p, ...c);

const ALL_LOCS = Object.keys(STORE_NAMES);
const FL_LOCS = new Set(ALL_LOCS.filter(l => getStoreOrg(l) === 'emerald'));
const locNum = s => { const n = parseInt(s, 10); return Number.isNaN(n) ? String(s == null ? '' : s) : String(n); };
const storeNm = l => STORE_NAMES[locNum(l)] || locNum(l);
const isoOf = d => (d instanceof Date ? d : new Date(d)).toISOString().slice(0, 10);

// Metric registry. Sales piloted; each entry says where the daily value comes from,
// which Official target field to compare, direction, and formatting.
const METRICS = [
  { key: 'sales', label: 'Sales ($ / month)', direction: 'higher', official: 'tProdSales',
    // Loads its own per-(loc,date) product-sales history for the full window, so it
    // doesn't depend on the 60-day, lazily-loaded ds.qsrActSummaryRows cache.
    load: days => loadQsrActSummary(days), daily: r => r.sales, monthly: true,
    fmt: v => v == null ? '—' : '$' + Math.round(v).toLocaleString() },
];

const confColor = c => c === 'High' ? '#10b981' : c === 'Med' ? '#f59e0b' : '#ef4444';

export function SmartTargetsPanel({ ds, stores, settings, onClose }) {
  const { useState, useMemo, useEffect } = React;
  const [metricKey, setMetricKey] = useState('sales');
  const [scope, setScope] = useState('all');
  const [windowDays, setWindowDays] = useState(90);
  const [hist, setHist] = useState([]);
  const [loading, setLoading] = useState(true);
  const metric = METRICS.find(m => m.key === metricKey) || METRICS[0];

  // Load this metric's own daily history for the full window.
  useEffect(() => {
    let live = true;
    setLoading(true);
    Promise.resolve(metric.load(windowDays + 5)).then(rows => { if (live) { setHist(rows || []); setLoading(false); } })
      .catch(() => { if (live) { setHist([]); setLoading(false); } });
    return () => { live = false; };
  }, [metricKey, windowDays]);

  // Active locs for the scope filter (All → State → Patch → Store).
  const activeLocs = useMemo(() => {
    if (scope === 'all') return null;
    if (scope === 'fl') return new Set(ALL_LOCS.filter(l => FL_LOCS.has(l)));
    if (scope === 'ok') return new Set(ALL_LOCS.filter(l => !FL_LOCS.has(l)));
    if (scope.startsWith('__patch__')) return new Set(((DEF_SETTINGS.supervisorGroups || {})[scope.slice(9)] || []).map(l => locNum(l)));
    return new Set([locNum(scope)]);
  }, [scope]);

  const officialFor = loc => ((ds && ds.monthlyTargets && ds.monthlyTargets[locNum(loc)]) || (ds && ds.monthlyTargets && ds.monthlyTargets[loc]) || {})[metric.official];

  const model = useMemo(() => {
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const cutoff = isoOf(new Date(Date.now() - windowDays * 86400000));
    // Per-loc daily series within the window.
    const byLoc = {};
    for (const r of (hist || [])) {
      if (!r || !r.date || !r.loc) continue;
      const d = isoOf(r.date);
      if (d < cutoff || d > isoOf(now)) continue;
      const v = metric.daily(r);
      if (typeof v !== 'number' || isNaN(v) || v <= 0) continue;
      (byLoc[locNum(r.loc)] = byLoc[locNum(r.loc)] || []).push({ d, v });
    }
    // Per-loc robust baseline (daily) + volume (total in window) — used as peers.
    const baseByLoc = {};
    for (const loc of Object.keys(byLoc)) {
      const series = byLoc[loc].map(x => x.v);
      const rb = robustBaseline(series);
      baseByLoc[loc] = { baseline: rb.baseline, volume: series.reduce((a, b) => a + b, 0), loc };
    }
    // Peers by state (FL vs OK kept separate).
    const peersByState = { fl: [], ok: [] };
    for (const loc of Object.keys(baseByLoc)) {
      const st = FL_LOCS.has(loc) ? 'fl' : 'ok';
      if (baseByLoc[loc].baseline != null) peersByState[st].push(baseByLoc[loc]);
    }
    const rows = Object.keys(byLoc).map(loc => {
      const entries = byLoc[loc].slice().sort((a, b) => a.d.localeCompare(b.d));
      const series = entries.map(x => x.v);
      const st = FL_LOCS.has(loc) ? 'fl' : 'ok';
      const peers = peersByState[st].filter(p => p.loc !== loc);
      const vol = series.reduce((a, b) => a + b, 0);
      const r = computeSmartTarget(series, peers, { direction: metric.direction, volume: vol, capFrac: 0.08, band: 2 });
      // Recent run-rate ("Current"): mean of the last 28 daily values.
      const last28 = series.slice(-28);
      const curDaily = last28.length ? last28.reduce((a, b) => a + b, 0) / last28.length : null;
      const toMonthly = v => v == null ? null : (metric.monthly ? v * daysInMonth : v);
      const smart = toMonthly(r.smart);
      const current = toMonthly(curDaily);
      const official = officialFor(loc);
      const vsOff = (smart != null && official > 0) ? (smart / official - 1) * 100 : null;
      return { loc, smart, current, official: official != null ? official : null, vsOff,
        confidence: r.confidence, excludedDays: r.excludedDays, n: r.n, baseline: toMonthly(r.baseline),
        anchor: toMonthly(r.anchor), own: toMonthly(r.own), tierN: r.tierN };
    }).filter(r => r.smart != null);
    rows.sort((a, b) => (b.smart || 0) - (a.smart || 0));
    return { rows, daysInMonth };
  }, [hist, metricKey, windowDays, ds]);

  const shown = model.rows.filter(r => activeLocs === null || activeLocs.has(locNum(r.loc)));

  const selStyle = { fontSize: 10, padding: '3px 7px', background: 'var(--surf2)', border: '.5px solid var(--bdr)', borderRadius: 'var(--r)', color: 'var(--text)', colorScheme: 'dark', cursor: 'pointer' };
  const th = { padding: '6px 9px', fontSize: 8.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: 'var(--text3)', borderBottom: '.5px solid var(--bdr)', whiteSpace: 'nowrap', textAlign: 'right', background: 'var(--surf2)', position: 'sticky', top: 0 };
  const td = { padding: '5px 9px', fontSize: 11, borderBottom: '.5px solid rgba(255,255,255,.04)', whiteSpace: 'nowrap', textAlign: 'right', fontFamily: 'var(--mono)' };

  const row = r => h('tr', { key: r.loc, title: `baseline ${metric.fmt(r.baseline)} · own-trajectory ${metric.fmt(r.own)} · peer anchor ${metric.fmt(r.anchor)} (${r.tierN} like-sized peers) · ${r.n} days, ${r.excludedDays} anomalies excluded` },
    h('td', { style: { ...td, textAlign: 'left', fontWeight: 600, fontFamily: 'inherit' } }, storeNm(r.loc) + ' ', span({ style: { color: 'var(--text3)', fontWeight: 400, fontSize: 9 } }, '#' + locNum(r.loc))),
    h('td', { style: td }, metric.fmt(r.official)),
    h('td', { style: { ...td, fontWeight: 800, color: 'var(--amber)' } }, metric.fmt(r.smart)),
    h('td', { style: td }, metric.fmt(r.current)),
    h('td', { style: { ...td, fontWeight: 700, color: r.vsOff == null ? 'var(--text3)' : r.vsOff >= 0 ? '#10b981' : '#ef4444' } }, r.vsOff == null ? '—' : (r.vsOff >= 0 ? '+' : '') + r.vsOff.toFixed(1) + '%'),
    h('td', { style: { ...td, textAlign: 'center' } }, span({ style: { fontSize: 8.5, fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: confColor(r.confidence) + '22', color: confColor(r.confidence) } }, r.confidence)),
    h('td', { style: { ...td, color: r.excludedDays ? '#f59e0b' : 'var(--text3)' } }, r.excludedDays ? r.excludedDays + ' excl' : '—'));

  return div({ style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.82)', zIndex: 460, display: 'flex', flexDirection: 'column', paddingTop: 20 } },
    div({ style: { flex: '0 0 20px', cursor: 'pointer' }, onClick: onClose }),
    div({ style: { flex: 1, background: 'var(--surf)', maxWidth: 1080, margin: '0 auto', width: 'calc(100% - 24px)', borderRadius: 'var(--rl) var(--rl) 0 0', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 -8px 40px rgba(0,0,0,.4)' } },
      // Header
      div({ style: { padding: '10px 16px', borderBottom: '.5px solid var(--bdr)', flexShrink: 0, background: 'var(--surf2)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } },
        span({ style: { fontSize: 18 } }, '🧭'),
        div({ style: { flex: 1 } },
          div({ style: { fontSize: 14, fontWeight: 800, color: 'var(--text)' } }, 'Smart Targets'),
          div({ style: { fontSize: 9, color: 'var(--text3)' } }, 'Data-proven target per store: robust baseline → bounded trend → like-sized peer stretch (FL/OK separate) → capped blend. Hover a row for the build-up.')),
        h('select', { value: metricKey, onChange: e => setMetricKey(e.target.value), style: selStyle },
          ...METRICS.map(m => h('option', { key: m.key, value: m.key }, m.label))),
        h('select', { value: windowDays, onChange: e => setWindowDays(+e.target.value), style: selStyle },
          h('option', { value: 60 }, '60-day base'), h('option', { value: 90 }, '90-day base'), h('option', { value: 180 }, '180-day base')),
        h('select', { value: scope, onChange: e => setScope(e.target.value), style: selStyle },
          h('option', { value: 'all' }, 'All Stores'), h('option', { value: 'fl' }, 'Florida'), h('option', { value: 'ok' }, 'Oklahoma'),
          h('optgroup', { label: '— Patches —' }, ...Object.entries(DEF_SETTINGS.supervisorGroups || {}).map(([n, l]) => h('option', { key: n, value: '__patch__' + n }, n.split(' ')[0] + ' Patch (' + l.length + ')'))),
          h('optgroup', { label: '— Florida —' }, ...ALL_LOCS.filter(l => FL_LOCS.has(l)).sort((a, b) => STORE_NAMES[a].localeCompare(STORE_NAMES[b])).map(l => h('option', { key: l, value: l }, STORE_NAMES[l]))),
          h('optgroup', { label: '— Oklahoma —' }, ...ALL_LOCS.filter(l => !FL_LOCS.has(l)).sort((a, b) => STORE_NAMES[a].localeCompare(STORE_NAMES[b])).map(l => h('option', { key: l, value: l }, STORE_NAMES[l])))),
        btn({ className: 'btn btn-sm', style: { color: 'var(--text3)' }, onClick: onClose }, '✕')),

      // Body
      div({ style: { flex: 1, overflowY: 'auto', padding: '12px 16px' } },
        loading
          ? div({ style: { textAlign: 'center', padding: '48px 20px', color: 'var(--text3)', fontSize: 12 } }, 'Loading sales history…')
          : !shown.length
          ? div({ style: { textAlign: 'center', padding: '48px 20px', color: 'var(--text3)', fontSize: 12 } },
              'No sales history in the selected window. Smart Targets needs daily sales (qsr_daily_activity) loaded.')
          : div({ style: { background: 'var(--surf2)', border: '.5px solid var(--bdr)', borderRadius: 8, overflow: 'auto' } },
              h('table', { style: { width: '100%', borderCollapse: 'collapse' } },
                h('thead', null, h('tr', null,
                  h('th', { style: { ...th, textAlign: 'left' } }, 'Store'),
                  h('th', { style: th }, 'Official'),
                  h('th', { style: th }, 'Smart'),
                  h('th', { style: th }, 'Current'),
                  h('th', { style: th }, 'vs Official'),
                  h('th', { style: { ...th, textAlign: 'center' } }, 'Conf'),
                  h('th', { style: th }, 'Anomalies'))),
                h('tbody', null, ...shown.map(row)))),
        div({ style: { fontSize: 8, color: 'var(--text3)', marginTop: 8, lineHeight: 1.5 } },
          'Official = QSRSoft monthly file (tProdSales). Smart = robust daily baseline (median, ±' + '3·MAD anomalies dropped) projected by a capped trend, nudged toward the top-quartile of like-sized same-state peers, capped at 8% move, never below baseline. Current = last-28-day run rate. All monthly figures = daily × ' + model.daysInMonth + ' days. Anomalies = days set aside from the baseline. Pilot metric: Sales; more metrics use the same engine.')
      )
    ));
}
