// @ts-nocheck
// ── Smart Targets panel (Workstream B, P1) ───────────────────────────────────
// A data-proven target per store, from the smart-targets engine. Pilots Sales;
// the METRICS registry is the extension point for labor %, FOB, speed, etc.
// Shows the 5-column comparison: Official (management file) · Smart (this model) ·
// Current (recent run-rate) · vs Official · Confidence, plus excluded-anomaly days.
// FL and OK are anchored SEPARATELY (peers are same-state, like-sized only).
import * as React from 'react';
import { STORE_NAMES, getStoreOrg, DEF_SETTINGS, DEFAULT_TARGETS } from '../constants.js';
import { computeSmartTarget, robustBaseline, weightedRecencyProjection, weightedRecencyLevel, weightedLevel, windowRate, backtestProjectors, peerAnchor, blend, confidence, median, _isNum } from '../engine/smart-targets.js';
import { forecastModels } from '../engine/forecast.js';
import { loadDailySales, loadGlimpse, loadQsrFob, loadSmartTargetAdjustments, saveSmartTargetAdjustment, applyOfficialTargets } from '../lib/supabase.js';

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

// Metric registry — the extension point. Each entry says where the daily value
// comes from, which Official target to compare, direction, and formatting.
//   monthly:true  → a period TOTAL (summed, projected × days) — median-of-simple.
//   ratio:true    → a weighted LEVEL (Σ(value·weight)/Σweight — never averaged);
//                   `weight` gives the per-day denominator (sales, cars).
const pct1 = v => v == null ? '—' : (v * 100).toFixed(1) + '%';
const pct2 = v => v == null ? '—' : (v * 100).toFixed(2) + '%';
const secs = v => v == null ? '—' : Math.round(v) + 's';

// qsr_fob rows are DAILY but carry CUMULATIVE month-to-date amounts, so the latest
// daily row per (loc, month) IS that month's total. Collapse to one monthly point
// per store: FOB % = Σ(6 waste/variance components)/prodSales (the At-A-Glance
// canonical formula), dollar-weighted by prodSales.
function fobMonthly(rows) {
  const byMonth = new Map();
  for (const r of rows || []) {
    if (!r || !r.date || r.loc == null) continue;
    const d = new Date(String(r.date).slice(0, 10) + 'T00:00:00'); if (Number.isNaN(+d)) continue;
    const loc = locNum(r.loc);
    const k = loc + '|' + d.getFullYear() + '-' + (d.getMonth() + 1);
    const ex = byMonth.get(k);
    if (!ex || d.getTime() > ex._ms) byMonth.set(k, { r, loc, _ms: d.getTime(), _d: d });
  }
  const out = [];
  for (const { r, loc, _d } of byMonth.values()) {
    const sales = r.prodSalesAmt || 0; if (!(sales > 0)) continue;
    const fobAmt = (r.rawWasteAmt || 0) + (r.compWasteAmt || 0) + (r.condimentsAmt || 0) + (r.empMgrMealsAmt || 0) + (r.statVarianceAmt || 0) + (r.unexplainedAmt || 0);
    out.push({ loc, date: _d, v: fobAmt / sales, w: sales });
  }
  return out;
}

const METRICS = [
  { key: 'sales', label: 'Sales ($ / month)', direction: 'higher', official: 'tProdSales', officialCol: 'sales_proj', monthly: true,
    // Fast path: sales_ledger_daily is already in memory (one product-sales row per
    // store/day) → instant. Fallback: the complete-but-heavy DAR hourly aggregate.
    mem: ds => (ds && ds.salesLedgerRows || []).map(r => ({ loc: r.loc, date: r.date, sales: r.prodSales })),
    fetch: days => loadDailySales(days),
    daily: r => r.sales,
    fmt: v => v == null ? '—' : '$' + Math.round(v).toLocaleString() },
  // Labor % of sales — sales-WEIGHTED (Σ labor$/Σ sales via daily pct×sales), lower
  // is better. From Daily Glimpse (cloud-fresh). Official = per-store labor target.
  { key: 'laborpct', label: 'Labor % of sales', direction: 'lower', monthly: false, ratio: true, officialCol: 'crew_labor_pct',
    mem: ds => (ds && ds.glimpseRows || []).map(r => ({ loc: r.loc, date: r.date, v: r.laborPct, w: r.allNetSales })),
    fetch: days => loadGlimpse(days).then(rows => (rows || []).map(r => ({ loc: r.loc, date: r.date, v: r.laborPct, w: r.allNetSales }))),
    daily: r => r.v, weight: r => r.w,
    officialVal: loc => { const t = DEFAULT_TARGETS[locNum(loc)]; return t && _isNum(t.tLabor) ? t.tLabor : null; },
    fmt: pct1 },
  // DT speed (OEPE w/o parked, seconds) — car-WEIGHTED, lower is better. From Daily
  // Glimpse; weight = DT guest count (fallback total GC). Official = per-store OEPE.
  { key: 'oepe', label: 'DT speed (OEPE, sec)', direction: 'lower', monthly: false, ratio: true,
    mem: ds => (ds && ds.glimpseRows || []).map(r => ({ loc: r.loc, date: r.date, v: r.oepe, w: (r.dtGC > 0 ? r.dtGC : r.gc) })),
    fetch: days => loadGlimpse(days).then(rows => (rows || []).map(r => ({ loc: r.loc, date: r.date, v: r.oepe, w: (r.dtGC > 0 ? r.dtGC : r.gc) }))),
    daily: r => r.v, weight: r => r.w,
    officialVal: loc => { const t = DEFAULT_TARGETS[locNum(loc)]; return t && _isNum(t.tOepe) ? t.tOepe : null; },
    fmt: secs },
  // FOB % (food-cost waste/variance as % of product sales), lower is better. From
  // qsr_fob, monthly (cumulative MTD → one point/store/month), dollar-weighted by
  // prod sales — matches the At-A-Glance FOB tile formula exactly. Official = tFOBTarget.
  { key: 'fob', label: 'FOB % (food cost)', direction: 'lower', monthly: false, ratio: true, officialCol: 'fob_target_pct',
    mem: () => [],
    fetch: () => loadQsrFob().then(fobMonthly),
    daily: r => r.v, weight: r => r.w,
    officialVal: loc => { const t = DEFAULT_TARGETS[locNum(loc)]; return t && _isNum(t.tFOBTarget) ? t.tFOBTarget : null; },
    fmt: pct2 },
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
  const [adjustments, setAdjustments] = useState({});    // {loc: {excludeDates:[], eventDelta, note}} for this metric
  const [editLoc, setEditLoc] = useState(null);          // loc whose known-event editor is open
  const [editDraft, setEditDraft] = useState(null);      // {excludeText, eventDelta, note}
  const [adjMsg, setAdjMsg] = useState('');
  const [appliedOff, setAppliedOff] = useState({});      // {loc: value} applied-as-Official this session (per metric)
  const [applyMsg, setApplyMsg] = useState('');
  const [applyBusy, setApplyBusy] = useState(false);
  const fcCache = useRef(new Map());                     // `${loc}|${iso}` -> {m1,m3,m4,ens} daily forecasts
  const metric = METRICS.find(m => m.key === metricKey) || METRICS[0];
  // Applied-official overrides are per-metric — clear when the metric changes.
  useEffect(() => { setAppliedOff({}); setApplyMsg(''); }, [metricKey]);
  // The (year, month) this target is FOR — the upcoming month.
  const targetYM = useMemo(() => { const d = new Date(); const t = new Date(d.getFullYear(), d.getMonth() + 1, 1); return { ty: t.getFullYear(), tm: t.getMonth() + 1 }; }, []);

  // Per-store known-event adjustments (excluded one-off days + event delta), per metric.
  useEffect(() => {
    let live = true;
    loadSmartTargetAdjustments(metricKey).then(a => { if (live) setAdjustments(a || {}); }).catch(() => { if (live) setAdjustments({}); });
    return () => { live = false; };
  }, [metricKey]);

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
  }, [metricKey, windowDays, ds && ds.salesLedgerRows && ds.salesLedgerRows.length, ds && ds.glimpseRows && ds.glimpseRows.length]);

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

  const officialFor = loc => {
    const applied = appliedOff[locNum(loc)];
    if (applied != null) return applied;                       // just applied this session
    if (metric.officialVal) return metric.officialVal(loc);
    return ((ds && ds.monthlyTargets && ds.monthlyTargets[locNum(loc)]) || (ds && ds.monthlyTargets && ds.monthlyTargets[loc]) || {})[metric.official];
  };

  // Push Smart → Official (monthly_targets) for the upcoming month. entries = rows.
  const applyOfficial = async (entries) => {
    if (!metric.officialCol || applyBusy) return;
    const rows = (entries || []).filter(r => r && r.smart != null);
    if (!rows.length) return;
    setApplyBusy(true); setApplyMsg('Applying ' + rows.length + '…');
    const res = await applyOfficialTargets(rows.map(r => ({ loc: r.loc, val: r.smart })), targetYM.ty, targetYM.tm, metric.officialCol);
    setApplyBusy(false);
    if (res && res.errors && res.errors.length) { setApplyMsg('⚠ ' + res.errors[0]); return; }
    setAppliedOff(p => { const n = { ...p }; rows.forEach(r => { n[locNum(r.loc)] = r.smart; }); return n; });
    setApplyMsg('✓ Applied ' + rows.length + ' to ' + targetLabel);
    setTimeout(() => setApplyMsg(''), 3000);
  };

  const model = useMemo(() => {
    const now = new Date();
    // Target the UPCOMING month; convert daily → monthly using that month's day count.
    const target = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const daysInMonth = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    const cutoff = isoOf(new Date(Date.now() - windowDays * 86400000));
    const nowIso = isoOf(now);
    // Known-event exclusions: one-off days the owner marked to drop from LEARNING
    // (not from the backtest, which stays a raw method-accuracy measure).
    const exclByLoc = {};
    for (const loc of Object.keys(adjustments || {})) {
      const ex = adjustments[loc] && adjustments[loc].excludeDates;
      if (ex && ex.length) exclByLoc[loc] = new Set(ex);
    }
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
      const w = metric.weight ? metric.weight(r) : 1;
      (btByLoc[loc] = btByLoc[loc] || []).push({ d, v, w });
      if (d >= cutoff && !(exclByLoc[loc] && exclByLoc[loc].has(d))) (byLoc[loc] = byLoc[loc] || []).push({ d, v, w });
    }
    const ratio = !!metric.ratio;
    // Per-loc baseline + volume — used as peers. Monthly metrics use a robust daily
    // baseline; ratio metrics use the WEIGHTED level (Σ v·w / Σ w), never a mean.
    const baseByLoc = {};
    for (const loc of Object.keys(byLoc)) {
      if (ratio) {
        const pts = byLoc[loc].map(x => ({ value: x.v, weight: x.w }));
        const wl = weightedLevel(pts);
        baseByLoc[loc] = { baseline: wl.level, volume: pts.reduce((a, p) => a + (p.weight || 0), 0), loc };
      } else {
        const series = byLoc[loc].map(x => x.v);
        const rb = robustBaseline(series);
        baseByLoc[loc] = { baseline: rb.baseline, volume: series.reduce((a, b) => a + b, 0), loc };
      }
    }
    // Peers by state (FL vs OK kept separate).
    const peersByState = { fl: [], ok: [] };
    for (const loc of Object.keys(baseByLoc)) {
      const st = FL_LOCS.has(loc) ? 'fl' : 'ok';
      if (baseByLoc[loc].baseline != null) peersByState[st].push(baseByLoc[loc]);
    }
    // Backtest is for period-TOTAL metrics only (the projector×days bakeoff doesn't
    // apply to a weighted ratio level).
    const doBacktest = !!metric.monthly;
    const rows = Object.keys(byLoc).map(loc => {
      const entries = byLoc[loc].slice().sort((a, b) => a.d.localeCompare(b.d));
      const st = FL_LOCS.has(loc) ? 'fl' : 'ok';
      const peers = peersByState[st].filter(p => p.loc !== loc);
      const toMonthly = v => v == null ? null : (metric.monthly ? v * daysInMonth : v);
      const official = officialFor(loc);
      const adj = adjustments[loc] || {};
      const eventDelta = (metric.monthly && _isNum(adj.eventDelta)) ? adj.eventDelta : 0;
      const excludedManual = (adj.excludeDates || []).length;
      let smart, stretch, current, baseline, own, anchor, tierN, conf, excludedDays, n;
      let bt = { perMethod: {}, winner: null, folds: 0 };

      if (ratio) {
        // WEIGHTED ratio target (labor %, speed). Primary = recency-weighted blend of
        // trailing weighted-levels (the "simple wins" analog), then a bounded nudge
        // toward the good-direction quartile of like-sized same-state peers.
        const dailyW = entries.map(x => ({ date: x.d, value: x.v, weight: x.w }));
        const wl = weightedLevel(entries.map(x => ({ value: x.v, weight: x.w })));
        const rec = weightedRecencyLevel(dailyW, { asOf: now });
        baseline = wl.level;
        own = _isNum(rec.level) ? rec.level : wl.level;                 // recency level
        const vol = entries.reduce((a, x) => a + (x.w || 0), 0);
        const pa = peerAnchor(peers, vol, { direction: metric.direction, band: 2 });
        anchor = pa.anchor; tierN = pa.tierN;
        smart = own == null ? null : blend(own, anchor, { closeGapFrac: 0.5, capFrac: 0.05, direction: metric.direction });
        stretch = own;                                                  // pre-nudge level (hover)
        const last28 = entries.slice(-28).map(x => ({ value: x.v, weight: x.w }));
        current = weightedLevel(last28).level;
        n = wl.n; excludedDays = wl.excluded;
        const ratios = entries.map(x => x.v);
        const mean = ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : null;
        const sd = ratios.length > 1 ? Math.sqrt(ratios.reduce((a, b) => a + (b - mean) ** 2, 0) / (ratios.length - 1)) : null;
        conf = confidence(n, mean ? Math.abs(sd / mean) : null);
      } else {
        const series = entries.map(x => x.v);
        const vol = series.reduce((a, b) => a + b, 0);
        const r = computeSmartTarget(series, peers, { direction: metric.direction, volume: vol, capFrac: 0.08, band: 2 });
        // Recent run-rate ("Current"): mean of the last 28 daily values.
        const last28 = series.slice(-28);
        const curDaily = last28.length ? last28.reduce((a, b) => a + b, 0) / last28.length : null;
        current = toMonthly(curDaily);
        // PRIMARY Smart = median of the three simple projections (proven family).
        // Falls back to the peer-anchored computeSmartTarget only if the simple
        // family can't compute (too-thin history).
        const learnSeries = entries.map(x => ({ date: x.d, value: x.v }));
        const primary = medianProject(learnSeries, { asOf: now, targetDays: daysInMonth });
        smart = _isNum(primary) ? primary : toMonthly(r.smart);
        if (_isNum(smart) && eventDelta) smart += eventDelta;   // known-event adjustment
        stretch = toMonthly(r.smart);
        baseline = toMonthly(r.baseline); own = toMonthly(r.own); anchor = toMonthly(r.anchor);
        tierN = r.tierN; conf = r.confidence; excludedDays = r.excludedDays; n = r.n;
        // Scoreboard: which projection method fits THIS store best on held-out
        // history — over the LONG backtest window for many folds.
        const btSeries = (btByLoc[loc] || []).slice().sort((a, b) => a.d.localeCompare(b.d)).map(x => ({ date: x.d, value: x.v }));
        bt = backtestProjectors(btSeries, PROJECTORS, { periodDays: BT_PERIOD, folds: BT_FOLDS });
      }
      // vs Official — sign is direction-aware (below official is GOOD for 'lower').
      const vsOff = (smart != null && official > 0) ? (smart / official - 1) * 100 : null;
      const vsGood = vsOff == null ? null : (metric.direction === 'lower' ? vsOff <= 0 : vsOff >= 0);
      const ownerMape = bt.perMethod.owner ? bt.perMethod.owner.mape : null;
      return { loc, smart, stretch, current, official: official != null ? official : null, vsOff, vsGood,
        confidence: conf, excludedDays, n, baseline, anchor, own, tierN,
        eventDelta, excludedManual, adjNote: adj.note || '',
        winner: bt.winner, btFolds: bt.folds, btPerMethod: bt.perMethod, ownerMape };
    }).filter(r => r.smart != null);
    // Sort largest-first for totals; best-first (ascending) for 'lower' ratio metrics.
    rows.sort((a, b) => metric.direction === 'lower' ? (a.smart || 0) - (b.smart || 0) : (b.smart || 0) - (a.smart || 0));
    // Aggregate win-tally across stores (how often each method wins).
    const tally = {}; let scored = 0;
    for (const r of rows) { if (r.winner) { tally[r.winner] = (tally[r.winner] || 0) + 1; scored++; } }
    // Per-loc daily series ({date,value}) over the LONG backtest window, reused by
    // the async forecast-model (diagnostic) backtest so it grades on the same basis.
    const seriesByLoc = {};
    for (const loc of Object.keys(btByLoc)) seriesByLoc[loc] = btByLoc[loc].slice().sort((a, b) => a.d.localeCompare(b.d)).map(x => ({ date: x.d, value: x.v }));
    return { rows, daysInMonth, tally, scored, doBacktest, seriesByLoc };
  }, [hist, metricKey, windowDays, ds, adjustments, appliedOff]);

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

  // Known-event editor: open with the store's current adjustment, save to Supabase.
  const openEditor = loc => {
    const a = adjustments[locNum(loc)] || {};
    setEditDraft({ excludeText: (a.excludeDates || []).join(', '), eventDelta: a.eventDelta || '', note: a.note || '' });
    setAdjMsg(''); setEditLoc(locNum(loc));
  };
  const saveEditor = async () => {
    const loc = editLoc, d = editDraft || {};
    const excludeDates = String(d.excludeText || '').split(/[\s,]+/).map(s => s.trim()).filter(s => /^\d{4}-\d{2}-\d{2}$/.test(s));
    const eventDelta = metric.monthly ? (parseFloat(d.eventDelta) || 0) : 0;
    const note = (d.note || '').trim();
    setAdjMsg('Saving…');
    const res = await saveSmartTargetAdjustment(loc, metricKey, { excludeDates, eventDelta, note });
    if (res.errors && res.errors.length) { setAdjMsg('⚠ ' + res.errors[0]); return; }
    setAdjustments(p => { const n = { ...p }; if (!excludeDates.length && !eventDelta && !note) delete n[locNum(loc)]; else n[locNum(loc)] = { excludeDates, eventDelta, note }; return n; });
    setEditLoc(null); setEditDraft(null); setAdjMsg('');
  };
  const eventFmt = v => (v > 0 ? '+' : '−') + metric.fmt(Math.abs(v));
  const fld = { width: '100%', boxSizing: 'border-box', fontSize: 11, padding: '6px 8px', background: 'var(--surf2)', border: '.5px solid var(--bdr)', borderRadius: 6, color: 'var(--text)', colorScheme: 'dark' };
  const editorModal = !editLoc ? null : div({ style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 470, display: 'flex', alignItems: 'center', justifyContent: 'center' }, onClick: () => { setEditLoc(null); setEditDraft(null); } },
    div({ onClick: e => e.stopPropagation(), style: { background: 'var(--surf)', border: '.5px solid var(--bdr)', borderRadius: 12, width: 'min(440px, 92vw)', padding: 16, boxShadow: '0 12px 48px rgba(0,0,0,.5)' } },
      div({ style: { fontSize: 13, fontWeight: 800, color: 'var(--text)', marginBottom: 2 } }, 'Known-event adjustment'),
      div({ style: { fontSize: 11, color: 'var(--text3)', marginBottom: 12 } }, storeNm(editLoc) + ' · #' + editLoc + ' · ' + metric.label.split(' ')[0]),
      div({ style: { fontSize: 10, fontWeight: 700, color: 'var(--text2)', marginBottom: 4 } }, 'Exclude one-off days'),
      div({ style: { fontSize: 8.5, color: 'var(--text3)', marginBottom: 5 } }, 'ISO dates (YYYY-MM-DD), comma/space separated — dropped from the learning history so a holiday, outage, or remodel day never biases the target.'),
      h('textarea', { value: (editDraft && editDraft.excludeText) || '', onChange: e => setEditDraft(d => ({ ...(d || {}), excludeText: e.target.value })), placeholder: '2026-07-04, 2026-05-27', rows: 2, style: { ...fld, fontFamily: 'var(--mono)', resize: 'vertical' } }),
      metric.monthly ? div({ style: { marginTop: 12 } },
        div({ style: { fontSize: 10, fontWeight: 700, color: 'var(--text2)', marginBottom: 4 } }, 'Event delta (± added to the projected total)'),
        div({ style: { fontSize: 8.5, color: 'var(--text3)', marginBottom: 5 } }, 'A signed known-event amount added to the target (e.g. 8000 for a local event, -5000 for a road closure).'),
        h('input', { type: 'number', value: (editDraft && editDraft.eventDelta) || '', onChange: e => setEditDraft(d => ({ ...(d || {}), eventDelta: e.target.value })), placeholder: '0', style: { ...fld, fontFamily: 'var(--mono)' } })) : null,
      div({ style: { marginTop: 12 } },
        div({ style: { fontSize: 10, fontWeight: 700, color: 'var(--text2)', marginBottom: 4 } }, 'Note (optional)'),
        h('input', { value: (editDraft && editDraft.note) || '', onChange: e => setEditDraft(d => ({ ...(d || {}), note: e.target.value })), placeholder: 'Reason / context', style: fld })),
      div({ style: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 } },
        span({ style: { fontSize: 10, color: 'var(--text3)', flex: 1 } }, adjMsg),
        btn({ onClick: () => setEditDraft({ excludeText: '', eventDelta: '', note: '' }), title: 'Clear all fields (Save then removes the override)', style: { padding: '5px 10px', borderRadius: 6, border: '1px solid var(--bdr)', background: 'var(--surf)', color: 'var(--text3)', fontSize: 11, fontWeight: 600, cursor: 'pointer' } }, 'Clear'),
        btn({ onClick: () => { setEditLoc(null); setEditDraft(null); }, style: { padding: '5px 10px', borderRadius: 6, border: '1px solid var(--bdr)', background: 'var(--surf)', color: 'var(--text2)', fontSize: 11, fontWeight: 600, cursor: 'pointer' } }, 'Cancel'),
        btn({ onClick: saveEditor, style: { padding: '5px 14px', borderRadius: 6, border: '1px solid var(--amber)', background: 'var(--amber)', color: '#111', fontSize: 11, fontWeight: 800, cursor: 'pointer' } }, 'Save'))));

  // Tooltip for the Best-fit cell: each method's backtested MAPE, winner first.
  const btTitle = r => {
    if (!r.btFolds) return 'Not enough completed 28-day periods to backtest yet';
    const parts = methodsMeta.map(p => { const m = r.btPerMethod[p.key]; return m ? `${p.name}: ${m.mape}% MAPE (n=${m.n})` : `${p.name}: —`; });
    return `Best fit over ${r.btFolds} held-out 28-day period(s):\n` + parts.join('\n');
  };
  const row = r => h('tr', { key: r.loc, title: (metric.ratio
      ? `Smart = recency-weighted trailing level ${metric.fmt(r.own)} nudged toward peer best-quartile ${metric.fmt(r.anchor)} (${r.tierN} like-sized peers) · full-window weighted level ${metric.fmt(r.baseline)}`
      : `Smart = median of simple methods · peer-stretch target ${metric.fmt(r.stretch)} · baseline ${metric.fmt(r.baseline)} · own-trajectory ${metric.fmt(r.own)} · peer anchor ${metric.fmt(r.anchor)} (${r.tierN} like-sized peers)`)
      + ` · ${r.n} days, ${r.excludedDays} anomalies excluded` },
    h('td', { style: { ...td, textAlign: 'left', fontWeight: 600, fontFamily: 'inherit' } }, storeNm(r.loc) + ' ', span({ style: { color: 'var(--text3)', fontWeight: 400, fontSize: 9 } }, '#' + locNum(r.loc))),
    h('td', { style: td }, metric.fmt(r.official)),
    h('td', { style: { ...td, fontWeight: 800, color: 'var(--amber)' } }, metric.fmt(r.smart)),
    h('td', { style: td }, metric.fmt(r.current)),
    h('td', { style: { ...td, fontWeight: 700, color: r.vsGood == null ? 'var(--text3)' : r.vsGood ? '#10b981' : '#ef4444' } }, r.vsOff == null ? '—' : (r.vsOff >= 0 ? '+' : '') + r.vsOff.toFixed(1) + '%'),
    model.doBacktest ? h('td', { style: { ...td, textAlign: 'center', fontFamily: 'inherit' }, title: btTitle(r) },
      r.winner
        ? span(null, span({ style: { fontSize: 8.5, fontWeight: 800, padding: '1px 6px', borderRadius: 99, background: r.winner === PRIMARY_KEY ? 'rgba(245,188,0,.16)' : 'rgba(255,255,255,.06)', color: r.winner === PRIMARY_KEY ? 'var(--amber)' : 'var(--text2)' } }, METH_SHORT[r.winner] || r.winner),
            r.btPerMethod[r.winner] ? span({ style: { color: 'var(--text3)', fontSize: 9, marginLeft: 5 } }, r.btPerMethod[r.winner].mape + '%') : null)
        : span({ style: { color: 'var(--text3)', fontSize: 9 } }, '—')) : null,
    h('td', { style: { ...td, textAlign: 'center' } }, span({ style: { fontSize: 8.5, fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: confColor(r.confidence) + '22', color: confColor(r.confidence) } }, r.confidence)),
    h('td', { style: { ...td, color: r.excludedDays ? '#f59e0b' : 'var(--text3)' } }, r.excludedDays ? r.excludedDays + ' excl' : '—'),
    // Known-event adjustment — click to edit (exclude one-off days / add event delta).
    h('td', { style: { ...td, textAlign: 'center', cursor: 'pointer' }, onClick: () => openEditor(r.loc), title: (r.adjNote ? r.adjNote + ' · ' : '') + 'Click to add/edit a known-event adjustment (exclude one-off days, add event ±)' },
      (r.eventDelta || r.excludedManual)
        ? span({ style: { fontSize: 8.5, fontWeight: 800, padding: '1px 6px', borderRadius: 99, background: 'rgba(245,188,0,.16)', color: 'var(--amber)' } },
            (r.eventDelta ? eventFmt(r.eventDelta) : '') + (r.eventDelta && r.excludedManual ? ' · ' : '') + (r.excludedManual ? r.excludedManual + 'd' : ''))
        : span({ style: { fontSize: 12, color: 'var(--text3)', fontWeight: 700 } }, '＋')),
    // Apply-as-Official (per store)
    metric.officialCol ? h('td', { style: { ...td, textAlign: 'center', fontFamily: 'inherit' } },
      appliedOff[locNum(r.loc)] != null
        ? span({ style: { fontSize: 8.5, fontWeight: 800, color: '#10b981' }, title: 'Applied to ' + targetLabel + ' official' }, '✓ Applied')
        : btn({ onClick: () => applyOfficial([r]), disabled: r.smart == null || applyBusy, title: 'Set this store’s Smart number as the official target for ' + targetLabel, style: { padding: '1px 8px', borderRadius: 5, border: '1px solid var(--bdr)', background: 'var(--surf)', color: 'var(--amber)', fontSize: 9, fontWeight: 700, cursor: r.smart != null && !applyBusy ? 'pointer' : 'default' } }, '→ Official')) : null);

  const csvCell = c => '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"';
  // CSV numeric formatter — ratio metrics keep precision (labor % as decimal, OEPE
  // to 1 dp) rather than rounding a 0.21 to 0.
  const csvNum = v => v == null ? '' : (metric.ratio ? +v.toFixed(4) : Math.round(v));
  const exportCSV = () => {
    const lvlLabel = metric.monthly ? '(mo)' : '(level)';
    const cols = ['Store', 'NSN', 'Official', 'Smart', 'Current', 'vs Official %', 'Best-fit method', 'Best-fit MAPE %', 'Confidence', 'Anomalies excluded', 'Baseline ' + lvlLabel, 'Peer anchor ' + lvlLabel, 'Event delta', 'Days excluded (manual)', 'Days', 'Lookback days', 'Target month'];
    const lines = [cols.map(csvCell).join(',')];
    for (const r of shown) lines.push([storeNm(r.loc), locNum(r.loc), csvNum(r.official), csvNum(r.smart), csvNum(r.current), r.vsOff == null ? '' : r.vsOff.toFixed(1), r.winner ? (METH_NAME[r.winner] || r.winner) : '', (r.winner && r.btPerMethod[r.winner]) ? r.btPerMethod[r.winner].mape : '', r.confidence, r.excludedDays, csvNum(r.baseline), csvNum(r.anchor), r.eventDelta || '', r.excludedManual || '', r.n, windowDays, targetLabel].map(csvCell).join(','));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `smart-targets-${metricKey}-${targetLabel.replace(/\s+/g, '_')}.csv`; a.click(); URL.revokeObjectURL(url);
  };
  const printReport = () => {
    const esc = s => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const rowsHtml = shown.map(r => `<tr><td>${esc(storeNm(r.loc))} <span class="m">#${esc(locNum(r.loc))}</span></td><td class="n">${esc(metric.fmt(r.official))}</td><td class="n b">${esc(metric.fmt(r.smart))}</td><td class="n">${esc(metric.fmt(r.current))}</td><td class="n ${r.vsGood == null ? '' : r.vsGood ? 'up' : 'dn'}">${r.vsOff == null ? '—' : (r.vsOff >= 0 ? '+' : '') + r.vsOff.toFixed(1) + '%'}</td><td class="c">${esc(r.confidence)}</td><td class="n">${r.excludedDays || 0}</td></tr>`).join('');
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
          div({ style: { fontSize: 9, color: 'var(--text3)' } }, metric.ratio
            ? 'Recommended ' + metric.label.split(' ')[0].toLowerCase() + ' target = recency-weighted, ' + (metric.key === 'oepe' ? 'car' : 'sales') + '-weighted trailing level (Σ value·weight / Σ weight — never an average of daily ratios), nudged toward the best quartile of like-sized same-state peers. Lower is better. Hover a row for the build-up.'
            : 'Recommended monthly ' + (metric.label.split(' ')[0].toLowerCase()) + ' target for ' + targetLabel + ' = median of three simple trailing methods (T3M/T6W/T3W · recent 3-wk · 3-mo avg) — the family a 27-store backtest proved beats every engineered model. Hover a row for the peer-stretch build-up.')),
        h('select', { value: metricKey, onChange: e => setMetricKey(e.target.value), style: selStyle },
          ...METRICS.map(m => h('option', { key: m.key, value: m.key }, m.label))),
        h('select', { value: windowDays, onChange: e => setWindowDays(+e.target.value), title: 'Lookback: how far back to learn from', style: selStyle },
          h('option', { value: 60 }, 'Lookback 60d'), h('option', { value: 90 }, 'Lookback 90d'), h('option', { value: 180 }, 'Lookback 180d')),
        h('select', { value: scope, onChange: e => setScope(e.target.value), style: selStyle },
          h('option', { value: 'all' }, 'All Stores'), h('option', { value: 'fl' }, 'Florida'), h('option', { value: 'ok' }, 'Oklahoma'),
          h('optgroup', { label: '— Patches —' }, ...Object.entries(DEF_SETTINGS.supervisorGroups || {}).map(([n, l]) => h('option', { key: n, value: '__patch__' + n }, n.split(' ')[0] + ' Patch (' + l.length + ')'))),
          h('optgroup', { label: '— Florida —' }, ...ALL_LOCS.filter(l => FL_LOCS.has(l)).sort((a, b) => STORE_NAMES[a].localeCompare(STORE_NAMES[b])).map(l => h('option', { key: l, value: l }, STORE_NAMES[l]))),
          h('optgroup', { label: '— Oklahoma —' }, ...ALL_LOCS.filter(l => !FL_LOCS.has(l)).sort((a, b) => STORE_NAMES[a].localeCompare(STORE_NAMES[b])).map(l => h('option', { key: l, value: l }, STORE_NAMES[l])))),
        metric.officialCol ? btn({ onClick: () => { if (window.confirm('Apply the Smart ' + metric.label.split(' ')[0] + ' target as the OFFICIAL target for ' + targetLabel + ' across ' + shown.length + ' shown store(s)? This writes monthly_targets and feeds Projections.')) applyOfficial(shown); }, disabled: !shown.length || applyBusy, title: 'Write the Smart number to the official monthly_targets for ' + targetLabel + ' (all shown stores)', style: { padding: '3px 10px', borderRadius: 6, border: '1px solid var(--amber)', background: applyBusy ? 'var(--surf)' : 'rgba(245,188,0,.14)', color: 'var(--amber)', fontSize: 11, fontWeight: 700, cursor: shown.length && !applyBusy ? 'pointer' : 'default' } }, '✓ Apply as Official') : null,
        applyMsg ? span({ style: { fontSize: 10, fontWeight: 600, color: applyMsg.startsWith('⚠') ? '#ef4444' : '#10b981' } }, applyMsg) : null,
        btn({ onClick: exportCSV, disabled: !shown.length, title: 'Download CSV', style: { padding: '3px 9px', borderRadius: 6, border: '1px solid var(--bdr)', background: 'var(--surf)', color: 'var(--text2)', fontSize: 11, fontWeight: 600, cursor: shown.length ? 'pointer' : 'default' } }, '⬇ CSV'),
        btn({ onClick: printReport, disabled: !shown.length, title: 'Print / PDF', style: { padding: '3px 9px', borderRadius: 6, border: '1px solid var(--bdr)', background: 'var(--surf)', color: 'var(--text2)', fontSize: 11, fontWeight: 600, cursor: shown.length ? 'pointer' : 'default' } }, '🖨 Print'),
        btn({ className: 'btn btn-sm', style: { color: 'var(--text3)' }, onClick: onClose }, '✕')),

      // Body
      div({ style: { flex: 1, overflowY: 'auto', padding: '12px 16px' } },
        loading
          ? div({ style: { textAlign: 'center', padding: '48px 20px', color: 'var(--text3)', fontSize: 12 } }, 'Loading ' + metric.label.split(' ')[0].toLowerCase() + ' history…')
          : !shown.length
          ? div({ style: { textAlign: 'center', padding: '48px 20px', color: 'var(--text3)', fontSize: 12 } },
              metric.ratio
                ? 'No ' + metric.label.split(' ')[0].toLowerCase() + ' history in the selected window. This metric reads Daily Glimpse (daily_glimpse_daily) — load it to populate.'
                : 'No sales history in the selected window. Smart Targets needs daily sales (qsr_daily_activity) loaded.')
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
                  h('th', { style: th }, 'Anomalies'),
                  h('th', { style: { ...th, textAlign: 'center' }, title: 'Known-event adjustment: exclude one-off days from learning · add an event ± to the target' }, 'Adj'),
                  metric.officialCol ? h('th', { style: { ...th, textAlign: 'center' }, title: 'Apply the Smart number as the official monthly target for ' + targetLabel }, 'Apply') : null)),
                h('tbody', null, ...shown.map(row))))),
        div({ style: { fontSize: 8, color: 'var(--text3)', marginTop: 8, lineHeight: 1.5 } },
          'Official = QSRSoft monthly file (tProdSales). Smart = MEDIAN of the three simple trailing methods (T3M/T6W/T3W · recent 3-wk · 3-mo avg) — a 2026-07 backtest across all 27 stores found this family beats every engineered model (which won 0 stores) and that the three are statistically tied, so the median averages away the per-store coin-flip rather than chasing the lowest-MAPE single method. Peer-stretch target (robust baseline → capped trend → like-sized same-state peer quartile, ±' + '3·MAD anomalies dropped) is preserved on hover as a secondary figure. Current = last-28-day run rate. All monthly figures = daily × ' + model.daysInMonth + ' days. Best fit = lowest error over ' + BT_FOLDS + ' held-out ' + BT_PERIOD + '-day periods (backtest history decoupled from the learning window). ＋ Diagnostic models folds in Composite/Momentum/Regression/Ensemble — preserved intact for diagnosis / longer-range use even though they lose here. Adj = per-store known-event adjustment: exclude one-off days from learning, add a signed event ± to the target. Apply = write the Smart number to the official monthly_targets for ' + targetLabel + ' (feeds Projections; per-store or all-shown). Metrics: Sales (median-of-simple) · Labor % · DT speed (OEPE) · FOB % — ratio metrics are dollar/volume-weighted trailing levels (FOB from qsr_fob monthly, matching the At-A-Glance formula).')
      )
    ),
    editorModal
    );
}
