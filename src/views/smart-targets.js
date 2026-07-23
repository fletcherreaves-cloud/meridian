// @ts-nocheck
// ── Smart Targets panel (Workstream B, P1) ───────────────────────────────────
// A data-proven target per store, from the smart-targets engine. Pilots Sales;
// the METRICS registry is the extension point for labor %, FOB, speed, etc.
// Shows the 5-column comparison: Official (management file) · Smart (this model) ·
// Current (recent run-rate) · vs Official · Confidence, plus excluded-anomaly days.
// FL and OK are anchored SEPARATELY (peers are same-state, like-sized only).
import * as React from 'react';
import { STORE_NAMES, getStoreOrg, DEF_SETTINGS } from '../constants.js';
import { computeSmartTarget, robustBaseline, weightedRecencyProjection, windowRate, backtestProjectors, median, _isNum } from '../engine/smart-targets.js';
import { forecastModels } from '../engine/forecast.js';
import { loadDailySales } from '../lib/supabase.js';

// The three simple trailing projectors. A 2026-07 backtest across all 27 stores
// found these beat every engineered model (Composite/Momentum/Regression/Ensemble)
// for monthly store sales — the engineered models won 0 stores — and that the
// three are statistically TIED (~5% MAPE, differences within n=few-fold noise).
const SIMPLE = [
  { key: 'owner', name: 'T3M/T6W/T3W', short: 'Owner', project: (s, o) => weightedRecencyProjection(s, o).projection },
  { key: 'recent', name: 'Recent 3-wk run-rate', short: '3-wk', project: (s, o) => { const w = windowRate(s, o.asOf, 21); return w.rate == null ? null : w.rate * o.targetDays; } },
  { key: 'avg3m', name: '3-month average', short: '3-mo', project: (s, o) => { const w = windowRate(s, o.asOf, 90); return w.rate == null ? null : w.rate * o.targetDays; } },
];
// PRIMARY method: median of the three simple projections. Because they're tied,
// the median averages away the per-store coin-flip instead of chasing whichever
// single method happens to post the lowest MAPE on a handful of held-out folds
// (that "best-fit per store" selection was overfitting to noise). This drives the
// recommended Smart number.
const PRIMARY_KEY = 'median3';
const medianProject = (s, o) => { const v = SIMPLE.map(p => { try { return p.project(s, o); } catch { return null; } }).filter(_isNum); return v.length ? median(v) : null; };
const PROJECTORS = [
  { key: PRIMARY_KEY, name: 'Median of simple', short: 'Median', project: medianProject },
  ...SIMPLE,
];
// Engineered forecast-engine models. PRESERVED and fully computable on demand
// (the "＋ Diagnostic models" button) — they lose to the simple family for
// short-range monthly targets but are kept intact for diagnosis and potential
// longer-range use. They read the store's daily history from ds and run async.
const FCAST_MODELS = [
  { key: 'm1', name: 'Composite', short: 'Comp' },
  { key: 'm3', name: 'Momentum', short: 'Mom' },
  { key: 'm4', name: 'Regression', short: 'Reg' },
  { key: 'ens', name: 'Ensemble', short: 'Ens' },
];
const ALL_META = [...PROJECTORS, ...FCAST_MODELS];
const METH_NAME = Object.fromEntries(ALL_META.map(p => [p.key, p.name]));
const METH_SHORT = Object.fromEntries(ALL_META.map(p => [p.key, p.short]));

// Backtest history is DECOUPLED from the learning window: we pull a long history
// (BT_DAYS) purely to grade methods over many held-out periods, while the shorter
// user-selected lookback still drives the baseline/peer learning. A 90-day window
// only yields ~2 folds; BT_DAYS at 28-day periods yields up to ~13, so per-store
// "wins" stop being coin-flips.
const BT_DAYS = 400;
const BT_PERIOD = 28;
const BT_FOLDS = 6;

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
  { key: 'sales', label: 'Sales ($ / month)', direction: 'higher', official: 'tProdSales', monthly: true,
    // Fast path: sales_ledger_daily is already in memory (one product-sales row per
    // store/day) → instant. Fallback: the complete-but-heavy DAR hourly aggregate.
    mem: ds => (ds && ds.salesLedgerRows || []).map(r => ({ loc: r.loc, date: r.date, sales: r.prodSales })),
    fetch: days => loadDailySales(days),
    daily: r => r.sales,
    fmt: v => v == null ? '—' : '$' + Math.round(v).toLocaleString() },
];

const confColor = c => c === 'High' ? '#10b981' : c === 'Med' ? '#f59e0b' : '#ef4444';

export function SmartTargetsPanel({ ds, stores, settings, onClose }) {
  const { useState, useMemo, useEffect, useRef } = React;
  const [metricKey, setMetricKey] = useState('sales');
  const [scope, setScope] = useState('all');
  const [windowDays, setWindowDays] = useState(90);
  const [hist, setHist] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModels, setShowModels] = useState(false); // fold forecast-engine models into the scoreboard
  const [modelBt, setModelBt] = useState({});           // {[loc]: {perMethod, winner, folds}} incl. forecast models
  const [modelBusy, setModelBusy] = useState(false);
  const fcCache = useRef(new Map());                     // `${loc}|${iso}` -> {m1,m3,m4,ens} daily forecasts
  const metric = METRICS.find(m => m.key === metricKey) || METRICS[0];

  // Source this metric's daily history: prefer the in-memory feed (instant); only
  // fetch the heavy DAR aggregate if that feed is too thin for a baseline.
  useEffect(() => {
    let live = true;
    setLoading(true);
    // Pull the FULL backtest history (not just the learning window) so the
    // scoreboard has enough held-out periods; the learning window is applied
    // later in the model memo.
    const cutoff = isoOf(new Date(Date.now() - BT_DAYS * 86400000));
    const mem = (metric.mem ? metric.mem(ds) : []).filter(r => {
      if (!r || !r.date || !r.loc) return false;
      const v = metric.daily(r);
      return typeof v === 'number' && !isNaN(v) && v > 0 && isoOf(r.date) >= cutoff;
    });
    const memLocs = new Set(mem.map(r => locNum(r.loc))), memDays = new Set(mem.map(r => isoOf(r.date)));
    if (mem.length && memLocs.size >= 8 && memDays.size >= 20) { setHist(mem); setLoading(false); return; }
    Promise.resolve(metric.fetch(BT_DAYS + 5)).then(rows => { if (live) { setHist(rows || []); setLoading(false); } })
      .catch(() => { if (live) { setHist([]); setLoading(false); } });
    return () => { live = false; };
    // Depend on the ledger feed LENGTH, not the whole ds — ds changes many times at
    // startup and was re-firing this fetch (the flicker).
  }, [metricKey, windowDays, ds && ds.salesLedgerRows && ds.salesLedgerRows.length]);

  // The upcoming month this target is FOR (e.g., next month). The lookback window
  // above is how far back we learn from — a separate thing.
  const targetLabel = useMemo(() => { const d = new Date(); d.setMonth(d.getMonth() + 1, 1); return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); }, []);

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
    // Target the UPCOMING month; convert daily → monthly using that month's day count.
    const target = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const daysInMonth = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    const cutoff = isoOf(new Date(Date.now() - windowDays * 86400000));
    const nowIso = isoOf(now);
    // Two per-loc daily series: the short LEARNING window (baseline/peers/Smart)
    // and the long BACKTEST window (grading methods over many held-out periods).
    const byLoc = {};    // learning window
    const btByLoc = {};  // full backtest window
    for (const r of (hist || [])) {
      if (!r || !r.date || !r.loc) continue;
      const d = isoOf(r.date);
      if (d > nowIso) continue;
      const v = metric.daily(r);
      if (typeof v !== 'number' || isNaN(v) || v <= 0) continue;
      const loc = locNum(r.loc);
      (btByLoc[loc] = btByLoc[loc] || []).push({ d, v });
      if (d >= cutoff) (byLoc[loc] = byLoc[loc] || []).push({ d, v });
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
    // Only backtest monthly-projected metrics (period totals). Ratio metrics later.
    const doBacktest = !!metric.monthly;
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
      const current = toMonthly(curDaily);
      const official = officialFor(loc);
      // PRIMARY Smart number = median of the three simple projections for the
      // upcoming period (the proven family). For monthly metrics the projectors
      // already scale by targetDays; for ratio metrics we take the blended daily
      // level. Falls back to the peer-anchored computeSmartTarget only if the
      // simple family can't compute (too-thin history).
      const learnSeries = entries.map(x => ({ date: x.d, value: x.v }));
      let smart;
      if (metric.monthly) {
        const primary = medianProject(learnSeries, { asOf: now, targetDays: daysInMonth });
        smart = _isNum(primary) ? primary : toMonthly(r.smart);
      } else {
        smart = toMonthly(r.smart); // ratio metrics keep the baseline path until wired
      }
      // Peer-anchored stretch target — preserved as a secondary figure (hover).
      const stretch = toMonthly(r.smart);
      const vsOff = (smart != null && official > 0) ? (smart / official - 1) * 100 : null;
      // Scoreboard: which projection method fits THIS store best on held-out
      // history — now over the LONG backtest window for many folds.
      let bt = { perMethod: {}, winner: null, folds: 0 };
      if (doBacktest) {
        const btSeries = (btByLoc[loc] || []).slice().sort((a, b) => a.d.localeCompare(b.d)).map(x => ({ date: x.d, value: x.v }));
        bt = backtestProjectors(btSeries, PROJECTORS, { periodDays: BT_PERIOD, folds: BT_FOLDS });
      }
      const ownerMape = bt.perMethod.owner ? bt.perMethod.owner.mape : null;
      return { loc, smart, stretch, current, official: official != null ? official : null, vsOff,
        confidence: r.confidence, excludedDays: r.excludedDays, n: r.n, baseline: toMonthly(r.baseline),
        anchor: toMonthly(r.anchor), own: toMonthly(r.own), tierN: r.tierN,
        winner: bt.winner, btFolds: bt.folds, btPerMethod: bt.perMethod, ownerMape };
    }).filter(r => r.smart != null);
    rows.sort((a, b) => (b.smart || 0) - (a.smart || 0));
    // Aggregate win-tally across stores (how often each method wins).
    const tally = {}; let scored = 0;
    for (const r of rows) { if (r.winner) { tally[r.winner] = (tally[r.winner] || 0) + 1; scored++; } }
    // Per-loc daily series ({date,value}) over the LONG backtest window, reused by
    // the async forecast-model (diagnostic) backtest so it grades on the same basis.
    const seriesByLoc = {};
    for (const loc of Object.keys(btByLoc)) seriesByLoc[loc] = btByLoc[loc].slice().sort((a, b) => a.d.localeCompare(b.d)).map(x => ({ date: x.d, value: x.v }));
    return { rows, daysInMonth, tally, scored, doBacktest, seriesByLoc };
  }, [hist, metricKey, windowDays, ds]);

  // When the learning window/metric changes the series changes, so any computed
  // forecast-model backtest is stale — drop it and its cache.
  useEffect(() => { setModelBt({}); setShowModels(false); fcCache.current.clear(); }, [metricKey, windowDays, hist]);

  // Daily forecasts for (loc, date) from the forecast engine, cached. Causal:
  // forecastModels uses LY + trailing same-DOW actuals up to `date` only.
  const fcModelsFor = (loc, iso) => {
    const key = loc + '|' + iso;
    let m = fcCache.current.get(key);
    if (!m) {
      let res = null;
      try { res = forecastModels(loc, new Date(iso + 'T00:00:00'), ds, settings || DEF_SETTINGS); } catch { res = null; }
      m = {};
      if (res && res.allModels) for (const x of res.allModels) if (typeof x.forecast === 'number') m[x.key] = x.forecast;
      fcCache.current.set(key, m);
    }
    return m;
  };

  // Fold the forecast-engine models into the per-store scoreboard. Async + chunked
  // so the UI stays responsive; where a store lacks daily history (ds.laborRows),
  // a model simply doesn't score (shown as no-data rather than a fake number).
  const runModelBacktest = async () => {
    setShowModels(true);
    if (modelBusy || !model.seriesByLoc) return;
    setModelBusy(true);
    await new Promise(r => setTimeout(r, 12)); // let the spinner paint
    const out = {}; const locs = Object.keys(model.seriesByLoc); let i = 0;
    for (const loc of locs) {
      const fcProj = FCAST_MODELS.map(fm => ({ key: fm.key, name: fm.name, project: (s, o) => {
        const end = new Date(o.asOf); end.setDate(end.getDate() + o.targetDays);
        let sum = 0, n = 0; const d = new Date(o.asOf);
        while (d < end) { const v = fcModelsFor(loc, isoOf(d))[fm.key]; if (typeof v === 'number' && v > 0) { sum += v; n++; } d.setDate(d.getDate() + 1); }
        return n ? sum * (o.targetDays / n) : null; // scale up if some days had no forecast
      } }));
      out[loc] = backtestProjectors(model.seriesByLoc[loc], [...PROJECTORS, ...fcProj], { periodDays: BT_PERIOD, folds: BT_FOLDS });
      if (++i % 4 === 0) await new Promise(r => setTimeout(r, 0)); // yield to keep UI live
    }
    setModelBt(out); setModelBusy(false);
  };

  // Effective scoreboard: swap in the fuller (incl. forecast models) result per loc
  // once it's computed. Falls back to the instant 3-method backtest otherwise.
  const useModels = showModels && Object.keys(modelBt).length > 0;
  const methodsMeta = useModels ? ALL_META : PROJECTORS;
  const shownRaw = model.rows.filter(r => activeLocs === null || activeLocs.has(locNum(r.loc)));
  const shown = shownRaw.map(r => { const mb = modelBt[r.loc]; return (useModels && mb) ? { ...r, winner: mb.winner, btPerMethod: mb.perMethod, btFolds: mb.folds } : r; });

  const selStyle = { fontSize: 10, padding: '3px 7px', background: 'var(--surf2)', border: '.5px solid var(--bdr)', borderRadius: 'var(--r)', color: 'var(--text)', colorScheme: 'dark', cursor: 'pointer' };
  const th = { padding: '6px 9px', fontSize: 8.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: 'var(--text3)', borderBottom: '.5px solid var(--bdr)', whiteSpace: 'nowrap', textAlign: 'right', background: 'var(--surf2)', position: 'sticky', top: 0 };
  const td = { padding: '5px 9px', fontSize: 11, borderBottom: '.5px solid rgba(255,255,255,.04)', whiteSpace: 'nowrap', textAlign: 'right', fontFamily: 'var(--mono)' };

  // Tooltip for the Best-fit cell: each method's backtested MAPE, winner first.
  const btTitle = r => {
    if (!r.btFolds) return 'Not enough completed 28-day periods to backtest yet';
    const parts = methodsMeta.map(p => { const m = r.btPerMethod[p.key]; return m ? `${p.name}: ${m.mape}% MAPE (n=${m.n})` : `${p.name}: —`; });
    return `Best fit over ${r.btFolds} held-out 28-day period(s):\n` + parts.join('\n');
  };
  const row = r => h('tr', { key: r.loc, title: `Smart = median of simple methods · peer-stretch target ${metric.fmt(r.stretch)} · baseline ${metric.fmt(r.baseline)} · own-trajectory ${metric.fmt(r.own)} · peer anchor ${metric.fmt(r.anchor)} (${r.tierN} like-sized peers) · ${r.n} days, ${r.excludedDays} anomalies excluded` },
    h('td', { style: { ...td, textAlign: 'left', fontWeight: 600, fontFamily: 'inherit' } }, storeNm(r.loc) + ' ', span({ style: { color: 'var(--text3)', fontWeight: 400, fontSize: 9 } }, '#' + locNum(r.loc))),
    h('td', { style: td }, metric.fmt(r.official)),
    h('td', { style: { ...td, fontWeight: 800, color: 'var(--amber)' } }, metric.fmt(r.smart)),
    h('td', { style: td }, metric.fmt(r.current)),
    h('td', { style: { ...td, fontWeight: 700, color: r.vsOff == null ? 'var(--text3)' : r.vsOff >= 0 ? '#10b981' : '#ef4444' } }, r.vsOff == null ? '—' : (r.vsOff >= 0 ? '+' : '') + r.vsOff.toFixed(1) + '%'),
    model.doBacktest ? h('td', { style: { ...td, textAlign: 'center', fontFamily: 'inherit' }, title: btTitle(r) },
      r.winner
        ? span(null, span({ style: { fontSize: 8.5, fontWeight: 800, padding: '1px 6px', borderRadius: 99, background: r.winner === PRIMARY_KEY ? 'rgba(245,188,0,.16)' : 'rgba(255,255,255,.06)', color: r.winner === PRIMARY_KEY ? 'var(--amber)' : 'var(--text2)' } }, METH_SHORT[r.winner] || r.winner),
            r.btPerMethod[r.winner] ? span({ style: { color: 'var(--text3)', fontSize: 9, marginLeft: 5 } }, r.btPerMethod[r.winner].mape + '%') : null)
        : span({ style: { color: 'var(--text3)', fontSize: 9 } }, '—')) : null,
    h('td', { style: { ...td, textAlign: 'center' } }, span({ style: { fontSize: 8.5, fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: confColor(r.confidence) + '22', color: confColor(r.confidence) } }, r.confidence)),
    h('td', { style: { ...td, color: r.excludedDays ? '#f59e0b' : 'var(--text3)' } }, r.excludedDays ? r.excludedDays + ' excl' : '—'));

  const csvCell = c => '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"';
  const exportCSV = () => {
    const cols = ['Store', 'NSN', 'Official', 'Smart', 'Current', 'vs Official %', 'Best-fit method', 'Best-fit MAPE %', 'Confidence', 'Anomalies excluded', 'Baseline (mo)', 'Peer anchor (mo)', 'Days', 'Lookback days', 'Target month'];
    const lines = [cols.map(csvCell).join(',')];
    for (const r of shown) lines.push([storeNm(r.loc), locNum(r.loc), r.official == null ? '' : Math.round(r.official), r.smart == null ? '' : Math.round(r.smart), r.current == null ? '' : Math.round(r.current), r.vsOff == null ? '' : r.vsOff.toFixed(1), r.winner ? (METH_NAME[r.winner] || r.winner) : '', (r.winner && r.btPerMethod[r.winner]) ? r.btPerMethod[r.winner].mape : '', r.confidence, r.excludedDays, r.baseline == null ? '' : Math.round(r.baseline), r.anchor == null ? '' : Math.round(r.anchor), r.n, windowDays, targetLabel].map(csvCell).join(','));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `smart-targets-${metricKey}-${targetLabel.replace(/\s+/g, '_')}.csv`; a.click(); URL.revokeObjectURL(url);
  };
  const printReport = () => {
    const esc = s => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const rowsHtml = shown.map(r => `<tr><td>${esc(storeNm(r.loc))} <span class="m">#${esc(locNum(r.loc))}</span></td><td class="n">${esc(metric.fmt(r.official))}</td><td class="n b">${esc(metric.fmt(r.smart))}</td><td class="n">${esc(metric.fmt(r.current))}</td><td class="n ${r.vsOff == null ? '' : r.vsOff >= 0 ? 'up' : 'dn'}">${r.vsOff == null ? '—' : (r.vsOff >= 0 ? '+' : '') + r.vsOff.toFixed(1) + '%'}</td><td class="c">${esc(r.confidence)}</td><td class="n">${r.excludedDays || 0}</td></tr>`).join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Smart Targets — ${esc(targetLabel)}</title>
      <style>body{font-family:-apple-system,Segoe UI,Arial,sans-serif;color:#111;margin:26px;font-size:12px}
      h1{font-size:17px;margin:0 0 2px}.sub{color:#666;font-size:11px;margin-bottom:14px}
      table{width:100%;border-collapse:collapse}th{text-align:right;font-size:9px;text-transform:uppercase;letter-spacing:.4px;color:#666;border-bottom:2px solid #f5bc00;padding:6px 8px}th:first-child{text-align:left}
      td{padding:5px 8px;border-bottom:1px solid #eee}td.n{text-align:right;font-variant-numeric:tabular-nums}td.b{font-weight:800}td.c{text-align:center}td.up{color:#158a3a;font-weight:700}td.dn{color:#c0392b;font-weight:700}.m{color:#999;font-size:10px}
      @media print{body{margin:0}}</style></head><body>
      <h1>Smart Targets — ${esc(metric.label)}</h1>
      <div class="sub">Recommended target for <b>${esc(targetLabel)}</b> · learned from a ${windowDays}-day lookback · ${shown.length} stores · generated ${esc(new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }))}</div>
      <table><thead><tr><th>Store</th><th>Official</th><th>Smart</th><th>Current</th><th>vs Official</th><th style="text-align:center">Conf</th><th>Anomalies</th></tr></thead><tbody>${rowsHtml}</tbody></table>
      </body></html>`;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(html); w.document.close(); w.focus(); setTimeout(() => w.print(), 250);
  };

  return div({ style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.82)', zIndex: 460, display: 'flex', flexDirection: 'column', paddingTop: 20 } },
    div({ style: { flex: '0 0 20px', cursor: 'pointer' }, onClick: onClose }),
    div({ style: { flex: 1, background: 'var(--surf)', maxWidth: 1080, margin: '0 auto', width: 'calc(100% - 24px)', borderRadius: 'var(--rl) var(--rl) 0 0', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 -8px 40px rgba(0,0,0,.4)' } },
      // Header
      div({ style: { padding: '10px 16px', borderBottom: '.5px solid var(--bdr)', flexShrink: 0, background: 'var(--surf2)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } },
        span({ style: { fontSize: 18 } }, '🧭'),
        div({ style: { flex: 1 } },
          div({ style: { fontSize: 14, fontWeight: 800, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } }, 'Smart Targets',
            span({ style: { fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: 'rgba(245,188,0,.15)', color: 'var(--amber)' } }, 'Target: ' + targetLabel)),
          div({ style: { fontSize: 9, color: 'var(--text3)' } }, 'Recommended monthly ' + (metric.label.split(' ')[0].toLowerCase()) + ' target for ' + targetLabel + ' = median of three simple trailing methods (T3M/T6W/T3W · recent 3-wk · 3-mo avg) — the family a 27-store backtest proved beats every engineered model. Hover a row for the peer-stretch build-up.')),
        h('select', { value: metricKey, onChange: e => setMetricKey(e.target.value), style: selStyle },
          ...METRICS.map(m => h('option', { key: m.key, value: m.key }, m.label))),
        h('select', { value: windowDays, onChange: e => setWindowDays(+e.target.value), title: 'Lookback: how far back to learn from', style: selStyle },
          h('option', { value: 60 }, 'Lookback 60d'), h('option', { value: 90 }, 'Lookback 90d'), h('option', { value: 180 }, 'Lookback 180d')),
        h('select', { value: scope, onChange: e => setScope(e.target.value), style: selStyle },
          h('option', { value: 'all' }, 'All Stores'), h('option', { value: 'fl' }, 'Florida'), h('option', { value: 'ok' }, 'Oklahoma'),
          h('optgroup', { label: '— Patches —' }, ...Object.entries(DEF_SETTINGS.supervisorGroups || {}).map(([n, l]) => h('option', { key: n, value: '__patch__' + n }, n.split(' ')[0] + ' Patch (' + l.length + ')'))),
          h('optgroup', { label: '— Florida —' }, ...ALL_LOCS.filter(l => FL_LOCS.has(l)).sort((a, b) => STORE_NAMES[a].localeCompare(STORE_NAMES[b])).map(l => h('option', { key: l, value: l }, STORE_NAMES[l]))),
          h('optgroup', { label: '— Oklahoma —' }, ...ALL_LOCS.filter(l => !FL_LOCS.has(l)).sort((a, b) => STORE_NAMES[a].localeCompare(STORE_NAMES[b])).map(l => h('option', { key: l, value: l }, STORE_NAMES[l])))),
        btn({ onClick: exportCSV, disabled: !shown.length, title: 'Download CSV', style: { padding: '3px 9px', borderRadius: 6, border: '1px solid var(--bdr)', background: 'var(--surf)', color: 'var(--text2)', fontSize: 11, fontWeight: 600, cursor: shown.length ? 'pointer' : 'default' } }, '⬇ CSV'),
        btn({ onClick: printReport, disabled: !shown.length, title: 'Print / PDF', style: { padding: '3px 9px', borderRadius: 6, border: '1px solid var(--bdr)', background: 'var(--surf)', color: 'var(--text2)', fontSize: 11, fontWeight: 600, cursor: shown.length ? 'pointer' : 'default' } }, '🖨 Print'),
        btn({ className: 'btn btn-sm', style: { color: 'var(--text3)' }, onClick: onClose }, '✕')),

      // Body
      div({ style: { flex: 1, overflowY: 'auto', padding: '12px 16px' } },
        loading
          ? div({ style: { textAlign: 'center', padding: '48px 20px', color: 'var(--text3)', fontSize: 12 } }, 'Loading sales history…')
          : !shown.length
          ? div({ style: { textAlign: 'center', padding: '48px 20px', color: 'var(--text3)', fontSize: 12 } },
              'No sales history in the selected window. Smart Targets needs daily sales (qsr_daily_activity) loaded.')
          : div(null,
            // Aggregate scoreboard: how often each method wins across shown stores.
            model.doBacktest && shown.some(r => r.winner)
              ? div({ style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10, padding: '8px 11px', background: 'var(--surf2)', border: '.5px solid var(--bdr)', borderRadius: 8 } },
                  span({ style: { fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.4px', color: 'var(--text3)' } }, 'Method scoreboard'),
                  ...methodsMeta.map(p => { const shownWins = shown.filter(r => r.winner === p.key).length; return span({ key: p.key, title: METH_NAME[p.key], style: { fontSize: 10, display: 'inline-flex', alignItems: 'center', gap: 5 } },
                    span({ style: { fontWeight: 700, color: p.key === PRIMARY_KEY ? 'var(--amber)' : 'var(--text2)' } }, p.name),
                    span({ style: { fontWeight: 800, fontFamily: 'var(--mono)', padding: '1px 7px', borderRadius: 99, background: p.key === PRIMARY_KEY ? 'rgba(245,188,0,.16)' : 'rgba(255,255,255,.06)', color: p.key === PRIMARY_KEY ? 'var(--amber)' : 'var(--text)' } }, shownWins)); }),
                  useModels
                    ? span({ style: { fontSize: 8.5, color: 'var(--text3)', marginLeft: 'auto' } }, 'wins per store · lowest backtested MAPE · diagnostic models included')
                    : btn({ onClick: runModelBacktest, disabled: modelBusy, title: 'Fold the engineered models (Composite/Momentum/Regression/Ensemble) into the backtest for diagnosis. They lost 0-for-27 to the simple family for monthly sales but are preserved here. Needs daily labor history; runs in the background.', style: { marginLeft: 'auto', padding: '3px 9px', borderRadius: 6, border: '1px solid var(--bdr)', background: 'var(--surf)', color: 'var(--text2)', fontSize: 10, fontWeight: 700, cursor: modelBusy ? 'default' : 'pointer' } }, modelBusy ? 'Running models…' : '＋ Diagnostic models'))
              : null,
            div({ style: { background: 'var(--surf2)', border: '.5px solid var(--bdr)', borderRadius: 8, overflow: 'auto' } },
              h('table', { style: { width: '100%', borderCollapse: 'collapse' } },
                h('thead', null, h('tr', null,
                  h('th', { style: { ...th, textAlign: 'left' } }, 'Store'),
                  h('th', { style: th }, 'Official'),
                  h('th', { style: th }, 'Smart'),
                  h('th', { style: th }, 'Current'),
                  h('th', { style: th }, 'vs Official'),
                  model.doBacktest ? h('th', { style: { ...th, textAlign: 'center' }, title: 'Which projection method fits this store best on held-out history (lowest MAPE)' }, 'Best fit') : null,
                  h('th', { style: { ...th, textAlign: 'center' } }, 'Conf'),
                  h('th', { style: th }, 'Anomalies'))),
                h('tbody', null, ...shown.map(row))))),
        div({ style: { fontSize: 8, color: 'var(--text3)', marginTop: 8, lineHeight: 1.5 } },
          'Official = QSRSoft monthly file (tProdSales). Smart = MEDIAN of the three simple trailing methods (T3M/T6W/T3W · recent 3-wk · 3-mo avg) — a 2026-07 backtest across all 27 stores found this family beats every engineered model (which won 0 stores) and that the three are statistically tied, so the median averages away the per-store coin-flip rather than chasing the lowest-MAPE single method. Peer-stretch target (robust baseline → capped trend → like-sized same-state peer quartile, ±' + '3·MAD anomalies dropped) is preserved on hover as a secondary figure. Current = last-28-day run rate. All monthly figures = daily × ' + model.daysInMonth + ' days. Best fit = lowest error over ' + BT_FOLDS + ' held-out ' + BT_PERIOD + '-day periods (backtest history decoupled from the learning window). ＋ Diagnostic models folds in Composite/Momentum/Regression/Ensemble — preserved intact for diagnosis / longer-range use even though they lose here. Pilot metric: Sales; more metrics use the same engine.')
      )
    ));
}
