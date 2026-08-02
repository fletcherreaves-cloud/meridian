// @ts-nocheck
// ── Above-Store One-Pager (Notes 47) — roll results across all panels for a group + period ────────
// Scheduling · Labor · FOB · Sales/GC · Controls · Voice, for a selected scope (All/OK/FL/store) and
// period (MTD / Last week / Last month). Reuses the proven one-pager-data builders + metric-source +
// vs-LY, plus the Event Impact registry's upcoming events. v1: quantified rollup (read-only) + print.
import * as React from 'react';
import { buildCurrentState, buildReviewActuals, fobByRange } from '../engine/one-pager-data.js';
import { metricAvg } from '../engine/metric-source.js';
import { matchedVsLY } from '../engine/vs-ly.js';
import { STORE_NAMES, INV_ORG_COORDS, sNameC, EVENT_TYPES } from '../constants.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);
const btn = (p, ...c) => h('button', p, ...c);

const iso = d => d.toISOString().slice(0, 10);
const fmtV = (v, fmt) => {
  if (v == null || isNaN(v)) return '—';
  if (fmt === '$') return '$' + Math.round(v).toLocaleString();
  if (fmt === '%') return (v * 100).toFixed(1) + '%';
  if (fmt === 's') return Math.round(v) + 's';
  if (fmt === 'n') return (Math.round(v * 10) / 10).toString();
  return String(v);
};
const pct = v => v == null || isNaN(v) ? '—' : ((v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '%');

export function AboveStoreOnePager({ ds, settings, userEvents, onClose }) {
  const { useState, useMemo } = React;
  const [scope, setScope] = useState('all');
  const [period, setPeriod] = useState('mtd');
  const fobRows = (ds && ds.fobRows) || [];

  const locs = useMemo(() => Object.keys(STORE_NAMES).filter(l =>
    scope === 'all' ? true : scope === 'ok' ? (INV_ORG_COORDS[l] || {}).state === 'OK'
      : scope === 'fl' ? (INV_ORG_COORDS[l] || {}).state === 'FL' : l === scope), [scope]);
  const scopeLabel = scope === 'all' ? 'All 27 stores' : scope === 'ok' ? 'Oklahoma' : scope === 'fl' ? 'Florida' : (sNameC(scope) || scope);

  const range = useMemo(() => {
    const now = new Date(); const y = now.getFullYear(), m = now.getMonth();
    if (period === 'mtd') return { s: iso(new Date(y, m, 1)), e: iso(now), label: 'Month-to-date' };
    if (period === 'lastweek') { const e = new Date(now); e.setDate(e.getDate() - 1); const s = new Date(e); s.setDate(s.getDate() - 6); return { s: iso(s), e: iso(e), label: 'Last 7 days' }; }
    const ls = new Date(y, m - 1, 1), le = new Date(y, m, 0); return { s: iso(ls), e: iso(le), label: 'Last month' };
  }, [period]);

  const data = useMemo(() => {
    try {
      const cs = buildCurrentState(ds, fobRows, locs, range);      // [{key,label,actual,target,fmt,lowerBetter}]
      const rv = buildReviewActuals(ds, locs, range);              // {gcVsLY, osat, osatB2B, accB2B, kvsPerGc, kvsHealthy, projSales, ...}
      const salesVsLY = matchedVsLY(ds, locs, range, 'sales');
      const byKey = {}; for (const r of cs) byKey[r.key] = r;
      const controls = {
        cashOS: metricAvg(ds, locs, range, 'cashOSPct'),
        tRedA: metricAvg(ds, locs, range, 'tRedAPct'),
        disc: metricAvg(ds, locs, range, 'discPct'),
      };
      const fobAgg = Object.values(fobByRange(fobRows, range));
      const fob$ = fobAgg.reduce((s, a) => s + (a.fob$ || 0), 0);
      const fobProd = fobAgg.reduce((s, a) => s + (a.prodSales || 0), 0);
      const projSales = rv.projSales;
      const pace = (projSales && byKey.sales?.actual) ? byKey.sales.actual / projSales : null;
      return { byKey, rv, salesVsLY, controls, fob$, fobProd, projSales, pace, err: null };
    } catch (e) { return { err: String(e?.message || e) }; }
  }, [ds, fobRows, locs, range]);

  // Upcoming events (next 21 days) for the scope, deduped by label.
  const upcoming = useMemo(() => {
    const start = new Date(); const end = new Date(); end.setDate(end.getDate() + 21);
    const seen = new Set(), out = [];
    for (const l of locs) { const m = (userEvents || {})[l]; if (!m) continue;
      for (const dk of Object.keys(m)) { const d = new Date(dk + 'T12:00:00'); if (d < start || d > end) continue;
        const e = m[dk]; const key = dk + '|' + (e.label || e.type); if (seen.has(key)) continue; seen.add(key);
        out.push({ dk, ...e }); } }
    return out.sort((a, b) => a.dk.localeCompare(b.dk)).slice(0, 24);
  }, [locs, userEvents]);

  const badge = (actual, target, lowerBetter) => {
    if (actual == null || target == null) return 'var(--text3)';
    const good = lowerBetter ? actual <= target : actual >= target;
    return good ? '#4ade80' : '#f87171';
  };
  const Row = (label, actual, target, fmt, lowerBetter, extra) => div({ key: label, style: { display: 'flex', alignItems: 'baseline', gap: 8, padding: '4px 0', borderTop: '1px solid var(--bdr)' } },
    span({ style: { flex: 1, fontSize: '11px', color: 'var(--text2)' } }, label),
    extra ? span({ style: { fontSize: '10px', color: 'var(--text3)' } }, extra) : null,
    span({ style: { fontSize: '12px', fontWeight: 700, color: badge(actual, target, lowerBetter), fontVariantNumeric: 'tabular-nums', minWidth: 60, textAlign: 'right' } }, fmtV(actual, fmt)),
    span({ style: { fontSize: '9px', color: 'var(--text3)', minWidth: 54, textAlign: 'right' } }, target != null ? 'tgt ' + fmtV(target, fmt) : ''));
  const Section = (title, icon, ...kids) => div({ style: { background: 'var(--surf2)', border: '.5px solid var(--bdr)', borderRadius: 8, padding: '10px 12px' } },
    div({ style: { fontSize: '11px', fontWeight: 800, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 } }, (icon ? icon + ' ' : '') + title), ...kids);

  const d = data;
  return div({ style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.82)', zIndex: 462, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 20, paddingTop: 24 } },
    div({ style: { background: 'var(--surf)', border: '.5px solid var(--bdr2)', borderRadius: 'var(--rl)', width: '100%', maxWidth: 900, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,.5)', overflow: 'hidden' } },
      // header
      div({ style: { padding: '12px 16px', borderBottom: '.5px solid var(--bdr)', background: 'var(--surf2)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } },
        span({ style: { fontSize: 18 } }, '📄'),
        div({ style: { flex: 1, minWidth: 160 } },
          div({ style: { fontSize: '13px', fontWeight: 800, color: 'var(--text)' } }, 'Above-Store One-Pager'),
          div({ style: { fontSize: '9px', color: 'var(--text3)' } }, scopeLabel + ' · ' + range.label + ' (' + range.s + ' → ' + range.e + ')')),
        div({ style: { display: 'flex', gap: 2, border: '.5px solid var(--bdr)', borderRadius: 'var(--r)', overflow: 'hidden' } },
          ...[['mtd', 'MTD'], ['lastweek', 'Last wk'], ['lastmonth', 'Last mo']].map(([v, l]) => btn({ key: v, onClick: () => setPeriod(v), style: { padding: '3px 8px', border: 'none', fontSize: '9px', cursor: 'pointer', background: period === v ? 'var(--amber)' : 'transparent', color: period === v ? '#000' : 'var(--text3)' } }, l))),
        div({ style: { display: 'flex', gap: 2, border: '.5px solid var(--bdr)', borderRadius: 'var(--r)', overflow: 'hidden' } },
          ...[['all', 'All'], ['ok', 'OK'], ['fl', 'FL']].map(([v, l]) => btn({ key: v, onClick: () => setScope(v), style: { padding: '3px 8px', border: 'none', fontSize: '9px', cursor: 'pointer', background: scope === v ? 'var(--adim)' : 'transparent', color: scope === v ? 'var(--amber)' : 'var(--text3)' } }, l))),
        h('select', { value: STORE_NAMES[scope] ? scope : '', onChange: e => e.target.value && setScope(e.target.value), style: { fontSize: '9px', padding: '3px 5px', background: 'var(--surf)', border: '.5px solid var(--bdr)', borderRadius: 'var(--r)', color: 'var(--text)' } },
          h('option', { value: '' }, '— store —'), Object.keys(STORE_NAMES).sort((a, b) => (STORE_NAMES[a] || a).localeCompare(STORE_NAMES[b] || b)).map(l => h('option', { key: l, value: l }, sNameC(l)))),
        btn({ className: 'btn btn-sm', style: { color: 'var(--text3)' }, onClick: onClose }, '✕')),
      // body
      d.err ? div({ style: { padding: 30, color: '#fca5a5', fontSize: '12px' } }, 'Could not build rollup: ' + d.err)
      : div({ style: { flex: 1, overflow: 'auto', padding: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(400px,100%),1fr))', gap: 12 } },
        // Sales / GC
        Section('Sales / GC', '💵',
          Row('Product Sales', d.byKey.sales?.actual, null, '$'),
          div({ key: 'svly', style: { display: 'flex', padding: '4px 0', borderTop: '1px solid var(--bdr)', fontSize: '11px' } }, span({ style: { flex: 1, color: 'var(--text2)' } }, 'Sales vs LY (matched)'), span({ style: { fontWeight: 700, color: (d.salesVsLY?.pct || 0) >= 0 ? '#4ade80' : '#f87171' } }, pct(d.salesVsLY?.pct))),
          div({ key: 'gcly', style: { display: 'flex', padding: '4px 0', borderTop: '1px solid var(--bdr)', fontSize: '11px' } }, span({ style: { flex: 1, color: 'var(--text2)' } }, 'Guest Counts vs LY'), span({ style: { fontWeight: 700, color: (d.rv.gcVsLY || 0) >= 0 ? '#4ade80' : '#f87171' } }, pct(d.rv.gcVsLY))),
          d.projSales ? div({ key: 'pace', style: { display: 'flex', padding: '4px 0', borderTop: '1px solid var(--bdr)', fontSize: '11px' } }, span({ style: { flex: 1, color: 'var(--text2)' } }, 'Pace to projection'), span({ style: { fontWeight: 700, color: (d.pace || 0) >= 1 ? '#4ade80' : '#f5bc00' } }, d.pace ? (d.pace * 100).toFixed(0) + '%' : '—')) : null),
        // FOB
        Section('FOB / Food Cost', '🥗',
          Row('FOB %', d.byKey.fobPct?.actual, d.byKey.fobPct?.target, '%', true),
          div({ key: 'fobd', style: { fontSize: '9px', color: 'var(--text3)', paddingTop: 3 } }, 'Σ$ ' + fmtV(d.fob$, '$') + ' ÷ Σ prod-sales ' + fmtV(d.fobProd, '$') + ' (dollar-weighted)')),
        // Labor
        Section('Labor', '👥',
          Row('Labor %', d.byKey.laborPct?.actual, d.byKey.laborPct?.target, '%', true),
          Row('TPPH', d.byKey.tpph?.actual, d.byKey.tpph?.target, 'n', false)),
        // Service / Speed
        Section('Service', '🚗',
          Row('OEPE', d.byKey.oepe?.actual, d.byKey.oepe?.target, 's', true),
          Row('R2P', d.byKey.r2p?.actual, d.byKey.r2p?.target, 's', true),
          Row('KVS Time / GC', d.rv.kvsPerGc, d.rv.kvsTimeTarget, 's', true)),
        // Controls
        Section('Controls', '🎛',
          Row('Cash Over/Short %', d.controls.cashOS, null, '%'),
          Row('T-Reds After %', d.controls.tRedA, null, '%'),
          Row('Discount %', d.controls.disc, null, '%')),
        // Voice
        Section('Guest Voice', '💬',
          Row('OSAT 5★', d.rv.osat, d.rv.osatTarget, '%', false),
          Row('OSAT B2B (1★)', d.rv.osatB2B, d.rv.osatB2BTarget, '%', true),
          d.rv.smgMonth ? div({ key: 'sm', style: { fontSize: '9px', color: 'var(--text3)', paddingTop: 3 } }, 'SMG month ' + d.rv.smgMonth + ' · n-weighted') : null),
        // Upcoming impacts
        Section('Upcoming Impacts (21 days)', '📅',
          upcoming.length === 0 ? div({ style: { fontSize: '10px', color: 'var(--text3)', padding: '4px 0' } }, 'No tagged events in the next 3 weeks for this scope.')
          : div({ style: { display: 'flex', flexDirection: 'column', gap: 2 } },
            ...upcoming.map((e, i) => { const et = EVENT_TYPES[e.type] || EVENT_TYPES.other;
              return div({ key: i, style: { display: 'flex', gap: 6, fontSize: '10px', alignItems: 'baseline', borderTop: i ? '1px solid var(--bdr)' : 'none', padding: '2px 0' } },
                span({ style: { color: 'var(--text3)', minWidth: 42 } }, e.dk.slice(5)),
                span(null, e.icon || et.icon),
                span({ style: { color: 'var(--text2)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, e.label || et.label)); })))),
      // footer
      div({ style: { padding: '8px 16px', borderTop: '.5px solid var(--bdr)', background: 'var(--surf2)', fontSize: '9px', color: 'var(--text3)' } },
        'v1 rollup — Scheduling depth + AI narrative + per-panel drilldown next. Green = at/better than target, red = worse.')));
}
