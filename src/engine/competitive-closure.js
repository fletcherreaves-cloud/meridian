// @ts-nocheck
// ── Competitive / Own-Store Closure Impact engine ─────────────────────────────
// Estimates the real sales impact of a tagged closure event (a nearby competitor
// closing — `comp_closure` — or one of our own stores closing for remodel/
// construction — `own_closure`) using difference-in-differences against a
// synthetic control group, not a naive before/after comparison.
//
// Why not naive before/after: measured directly on Holdenville/Sonic (2026-09-30
// dispatch) — a flat before/after comparison said Sonic's Oct-Dec 2025 closure
// was worth +22.5% to Holdenville. Running the IDENTICAL calculation on 7 other
// district stores with no competitor event showed the whole district running
// +11.3% hot that quarter against the same flat-growth baseline — a seasonal/
// methodology artifact, not competition. The real, control-adjusted effect was
// ~+6-16% and faded over the quarter. This engine is that correction, generalized
// and reusable, built on the standard econometric approach for exactly this
// problem (difference-in-differences with a synthetic/weighted control group —
// Abadie, Diamond & Hainmueller; see memory/project-competitive-closure-engine.md
// for the research this was built against).
//
// Core idea: instead of comparing the treated store to its OWN prior period
// (which conflates the event's effect with whatever every other store in the
// district was also doing that quarter), construct a "synthetic" control — a
// weighted combination of OTHER stores, weighted to best match the treated
// store's own pre-event trend — and compare the treated store's ACTUAL
// post-event path to what the synthetic control implies it would have done
// absent the event. The gap is the event's measured effect, net of seasonality
// and district-wide trend.

import { addD, dKey } from '../utils/date.js';
import { median } from './smart-targets.js';
import { metricSeries } from './metric-source.js';
import { INV_ORG_COORDS } from '../constants.js';

const MS_DAY = 86400000;

// Event types whose per-store factor this engine is allowed to override once it
// has enough data. Narrow on purpose — weather/holiday/sports/etc. factors keep
// using the existing single-store DOW-trimmed-mean calc (computeEventFactors in
// events.js), which is the right tool for an event that hits every store the
// same way on the same day. A closure is different: it's long-running (weeks to
// months) and its effect is easily confused with whatever the rest of the
// district was doing in that same window, which is exactly what a control group
// is for.
export const CLOSURE_EVENT_TYPES = new Set(['comp_closure', 'own_closure']);

// Event types that disqualify a candidate CONTROL store for a given window — a
// control with its own closure-adjacent event overlapping the window would have
// its own baseline distorted, contaminating the synthetic control it's part of.
const CONTAMINATING_TYPES = new Set(['comp_closure', 'comp_new', 'own_closure', 'construction', 'road_closure']);

const _asDate = d => (d instanceof Date ? d : new Date(d.length === 10 ? d + 'T00:00:00' : d));

function _weekStart(dateKey) {
  const d = _asDate(dateKey);
  const monOffset = (d.getDay() + 6) % 7; // 0=Mon .. 6=Sun
  return dKey(addD(d, -monOffset));
}

// {dateKey: sales} -> weekly totals, sorted. Weekly (not daily) granularity
// because the day-of-week noise in raw daily sales swamps a control-group fit
// at that resolution — weekly is the finest grain where the synthetic-control
// weights fit stably with a realistic (5-15 store) donor pool.
function _toWeekly(seriesObj) {
  const byWeek = new Map();
  for (const [date, sales] of Object.entries(seriesObj)) {
    if (sales == null || !Number.isFinite(sales)) continue;
    const ws = _weekStart(date);
    const w = byWeek.get(ws) || { weekStart: ws, total: 0, n: 0 };
    w.total += sales; w.n += 1;
    byWeek.set(ws, w);
  }
  return [...byWeek.values()].sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1));
}

function _salesWeekly(ds, loc, start, end) {
  const obj = metricSeries(ds, loc, { s: start, e: end }, 'sales') || {};
  return _toWeekly(obj);
}

// Does `loc` carry a tagged event, in [start,end], of a type that would
// contaminate it as a control for this analysis?
function _isContaminated(userEvents, loc, start, end) {
  const evMap = userEvents && userEvents[loc];
  if (!evMap) return false;
  const s = _asDate(start), e = _asDate(end);
  for (const [dk, ev] of Object.entries(evMap)) {
    const d = _asDate(dk);
    if (d < s || d > e) continue;
    const types = (ev.tags && ev.tags.length) ? ev.tags.map(t => t.type) : [ev.type || 'other'];
    if (types.some(t => CONTAMINATING_TYPES.has(t))) return true;
  }
  return false;
}

// Same-state stores, excluding the treated store and anything contaminated by
// its own overlapping event in the analysis window. Same-state is a coarse but
// real proxy for "same macro conditions" (weather, regional promos, local
// economy) — the thing a control group needs to share with the treated store
// for the parallel-trends assumption to hold at all.
export function pickControlPool(ds, { loc, userEvents, excludeLocs = [], startDate, endDate, maxPool = 10 } = {}) {
  const treatedState = INV_ORG_COORDS[loc] && INV_ORG_COORDS[loc].state;
  if (!treatedState) return [];
  const exclude = new Set([String(loc), ...excludeLocs.map(String)]);
  const pool = [];
  for (const candidate of Object.keys(INV_ORG_COORDS)) {
    if (exclude.has(candidate)) continue;
    if (INV_ORG_COORDS[candidate].state !== treatedState) continue;
    if (_isContaminated(userEvents, candidate, startDate, endDate)) continue;
    pool.push(candidate);
  }
  return pool.slice(0, maxPool);
}

// Euclidean projection of v onto the probability simplex {w : w>=0, sum(w)=1}.
// Standard O(K log K) algorithm (Duchi et al. 2008) — sort descending, find the
// largest index where the running mean still permits a non-negative threshold.
function _projectSimplex(v) {
  const n = v.length;
  if (n === 1) return [1];
  const u = [...v].sort((a, b) => b - a);
  let cssv = 0, rho = -1, theta = 0;
  const cumsum = new Array(n);
  for (let i = 0; i < n; i++) {
    cssv += u[i];
    cumsum[i] = cssv;
    if (u[i] - (cumsum[i] - 1) / (i + 1) > 0) rho = i;
  }
  theta = (cumsum[rho] - 1) / (rho + 1);
  return v.map(x => Math.max(x - theta, 0));
}

// Non-negative, simplex-constrained least squares: w >= 0, sum(w) = 1,
// minimizing ||y - Xw||^2 — the synthetic-control donor-weight fit (Abadie et
// al.'s own formulation uses exactly this constraint set). Plain projected
// gradient descent; the problem is small (a handful of donors, a few dozen
// weekly pre-periods) so a closed-form QP solver isn't worth a new dependency.
function _fitSimplexWeights(y, X, { iters = 1500 } = {}) {
  const T = y.length;
  const K = X.length;
  if (K === 0) return [];
  if (K === 1) return [1];
  if (T === 0) return new Array(K).fill(1 / K);

  // Scale-invariant: fit on each series as a fraction of the treated store's
  // own pre-period mean, so the step size doesn't have to be re-tuned per
  // store (a $300k/mo store and a $100k/mo store both fit the same way).
  const scale = (y.reduce((a, b) => a + b, 0) / T) || 1;
  const ys = y.map(v => v / scale);
  const Xs = X.map(col => col.map(v => v / scale));

  let w = new Array(K).fill(1 / K);
  const lr = 1 / (K * T); // conservative fixed step; iters is generous to compensate
  for (let it = 0; it < iters; it++) {
    const r = new Array(T);
    for (let t = 0; t < T; t++) {
      let pred = 0;
      for (let k = 0; k < K; k++) pred += w[k] * Xs[k][t];
      r[t] = pred - ys[t];
    }
    const grad = new Array(K).fill(0);
    for (let k = 0; k < K; k++) {
      let g = 0;
      for (let t = 0; t < T; t++) g += 2 * r[t] * Xs[k][t];
      grad[k] = g;
    }
    w = _projectSimplex(w.map((wk, k) => wk - lr * grad[k]));
  }
  return w;
}

function _rmse(a, b) {
  const n = Math.min(a.length, b.length);
  if (!n) return null;
  let s = 0;
  for (let i = 0; i < n; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s / n);
}

function _r2(actual, predicted) {
  const n = Math.min(actual.length, predicted.length);
  if (n < 2) return null;
  const mean = actual.slice(0, n).reduce((a, b) => a + b, 0) / n;
  let ssRes = 0, ssTot = 0;
  for (let i = 0; i < n; i++) {
    ssRes += (actual[i] - predicted[i]) ** 2;
    ssTot += (actual[i] - mean) ** 2;
  }
  if (ssTot === 0) return null;
  return 1 - ssRes / ssTot;
}

// Confidence is deliberately coarse (high/moderate/low) rather than a bare
// number — a pre-fit R² of 0.62 isn't meaningfully more trustworthy than 0.58
// to a GM deciding how much to trust a projection, and a single float invites
// false precision the way the naive 22.5% number did.
function _confidenceFrom({ preR2, controlCount, preWeeks }) {
  if (controlCount < 2 || preWeeks < 8) return 'low';
  if (preR2 == null) return 'low';
  if (preR2 >= 0.7 && controlCount >= 3) return 'high';
  if (preR2 >= 0.4) return 'moderate';
  return 'low';
}

/**
 * Measure a closure event's actual impact via DiD against a synthetic control.
 * `loc` is the TREATED store (the one whose sales are expected to move) —
 * for a competitor closing nearby, that's the McDonald's store; for our own
 * store closing, pass a sibling store here to measure displaced-demand
 * capture (this function doesn't care why the window is being treated as an
 * event, only that something changed in the treated store's environment).
 */
export function computeClosureImpact(ds, {
  loc, startDate, endDate, userEvents = {}, controlLocs = null,
  preDays = 270, minControlPreWeeks = 8,
} = {}) {
  const start = _asDate(startDate), end = _asDate(endDate);
  const preStart = addD(start, -preDays);
  const preEnd = addD(start, -1);

  const pool = controlLocs && controlLocs.length
    ? controlLocs
    : pickControlPool(ds, { loc, userEvents, startDate, endDate });

  const treatedPre = _salesWeekly(ds, loc, preStart, preEnd);
  const treatedEvent = _salesWeekly(ds, loc, start, end);
  if (!treatedPre.length || !treatedEvent.length) {
    return { loc, startDate: dKey(start), endDate: dKey(end), ok: false, reason: 'no_treated_data', controlLocs: pool };
  }

  const controlsPre = {}, controlsEvent = {};
  for (const c of pool) {
    controlsPre[c] = _salesWeekly(ds, c, preStart, preEnd);
    controlsEvent[c] = _salesWeekly(ds, c, start, end);
  }
  const usableControls = pool.filter(c => controlsPre[c].length >= minControlPreWeeks && controlsEvent[c].length > 0);
  if (!usableControls.length) {
    return { loc, startDate: dKey(start), endDate: dKey(end), ok: false, reason: 'no_usable_controls', controlLocs: pool };
  }

  // Align on weeks every usable series (treated + all controls) actually has,
  // in the pre-period — a donor missing a pre-period week would otherwise
  // silently misalign the weight fit against the treated store's series.
  const preWeekSets = [new Set(treatedPre.map(w => w.weekStart)), ...usableControls.map(c => new Set(controlsPre[c].map(w => w.weekStart)))];
  const commonPreWeeks = [...preWeekSets[0]].filter(wk => preWeekSets.every(s => s.has(wk))).sort();

  if (commonPreWeeks.length < minControlPreWeeks) {
    return { loc, startDate: dKey(start), endDate: dKey(end), ok: false, reason: 'insufficient_overlap', controlLocs: usableControls };
  }

  const byWeek = (rows) => Object.fromEntries(rows.map(r => [r.weekStart, r.total]));
  const treatedPreByWk = byWeek(treatedPre);
  const controlsPreByWk = Object.fromEntries(usableControls.map(c => [c, byWeek(controlsPre[c])]));

  const y = commonPreWeeks.map(wk => treatedPreByWk[wk]);
  const X = usableControls.map(c => commonPreWeeks.map(wk => controlsPreByWk[c][wk]));
  const weights = _fitSimplexWeights(y, X);

  const synthAt = (wkIdx, controlByWkFn) => {
    let s = 0;
    usableControls.forEach((c, k) => { s += weights[k] * (controlByWkFn(c)[wkIdx] ?? 0); });
    return s;
  };
  const preSynthetic = commonPreWeeks.map(wk => synthAt(wk, c => controlsPreByWk[c]));
  const preFitRmse = _rmse(y, preSynthetic);
  const preFitR2 = _r2(y, preSynthetic);

  const controlsEventByWk = Object.fromEntries(usableControls.map(c => [c, byWeek(controlsEvent[c])]));
  const treatedEventByWk = byWeek(treatedEvent);
  const eventWeeks = treatedEvent.map(w => w.weekStart).filter(wk => usableControls.every(c => controlsEventByWk[c][wk] != null));

  const weekly = eventWeeks.map((wk, i) => {
    const actual = treatedEventByWk[wk];
    const synthetic = synthAt(wk, c => controlsEventByWk[c]);
    const impactDollars = actual - synthetic;
    const impactPct = synthetic > 0 ? impactDollars / synthetic : null;
    return { weekStart: wk, weekIndex: i, treatedActual: actual, syntheticExpected: synthetic, impactDollars, impactPct };
  }).filter(w => w.impactPct != null);

  // Equal-weight flat control average, same math minus the fit — the fallback
  // and the cross-check this engine owes anyone who asks "why trust the
  // weights." Reported alongside, never hidden.
  const flatAt = (wkIdx, controlByWkFn) => usableControls.reduce((s, c) => s + (controlByWkFn(c)[wkIdx] ?? 0), 0) / usableControls.length;
  const flatWeekly = eventWeeks.map((wk, i) => {
    const actual = treatedEventByWk[wk];
    const synthetic = flatAt(wk, c => controlsEventByWk[c]);
    const impactPct = synthetic > 0 ? (actual - synthetic) / synthetic : null;
    return { weekStart: wk, weekIndex: i, impactPct };
  }).filter(w => w.impactPct != null);

  const pcts = weekly.map(w => w.impactPct);
  const totalDollarImpact = weekly.reduce((s, w) => s + w.impactDollars, 0);
  const confidence = _confidenceFrom({ preR2: preFitR2, controlCount: usableControls.length, preWeeks: commonPreWeeks.length });

  return {
    ok: true,
    loc, startDate: dKey(start), endDate: dKey(end),
    controlLocs: usableControls,
    weights: Object.fromEntries(usableControls.map((c, k) => [c, weights[k]])),
    preFit: { rmse: preFitRmse, r2: preFitR2, weeks: commonPreWeeks.length },
    weekly, flatWeekly,
    summary: {
      totalDollarImpact,
      medianImpactPct: median(pcts),
      firstWeekImpactPct: pcts[0] ?? null,
      lastWeekImpactPct: pcts[pcts.length - 1] ?? null,
      confidence,
    },
  };
}

/**
 * Reduce a computeClosureImpact() result to the single clamped scalar
 * src/engine/forecast.js's `_evFactor` block expects at
 * `settings._eventFactors[loc][eventType]` — a fractional multiplicative
 * delta, e.g. 0.12 for "+12%". Clamped to the same ±25% ceiling the Event
 * Impact Registry and stored-expected-impact paths already enforce in
 * forecast.js (±0.25) — this is the third path into that block, and forecast.js
 * itself applies no clamp on this path today, so this engine clamps its own
 * output defensively rather than relying on the caller to.
 */
export function summarizeClosureFactor(result, { clamp = 0.25 } = {}) {
  if (!result || !result.ok || result.summary.medianImpactPct == null) return 0;
  return Math.max(-clamp, Math.min(clamp, result.summary.medianImpactPct));
}

/**
 * Forward-looking projection for a closure that's happening NOW (no post-
 * period data of its own yet to measure) — maps a previously-MEASURED
 * closure's weekly impact curve (the `weekly` array from a past
 * computeClosureImpact() call, e.g. a comparable competitor closure
 * elsewhere) onto a different store's own baseline for a target window,
 * matched by week-offset-from-closure-start. This is the generalization of
 * the by-hand Pauls Valley/Braum's projection (2026-09-30 dispatch): no
 * ground truth exists yet for Braum's closure, so the best available
 * estimate is Sonic's own measured decay curve applied to Pauls Valley's own
 * normal-growth baseline.
 */
export function projectAnalogImpact(ds, {
  loc, startDate, endDate, sourceWeekly, growthWindowDays = 273,
} = {}) {
  const start = _asDate(startDate), end = _asDate(endDate);
  const growthEnd = addD(start, -1);
  const growthStart = addD(growthEnd, -growthWindowDays + 1);
  const priorYearStart = addD(growthStart, -365);
  const priorYearEnd = addD(growthEnd, -365);

  const recentTotal = Object.values(metricSeries(ds, loc, { s: growthStart, e: growthEnd }, 'sales') || {})
    .filter(Number.isFinite).reduce((a, b) => a + b, 0);
  const priorTotal = Object.values(metricSeries(ds, loc, { s: priorYearStart, e: priorYearEnd }, 'sales') || {})
    .filter(Number.isFinite).reduce((a, b) => a + b, 0);
  if (!priorTotal) return { ok: false, reason: 'no_growth_baseline', loc };
  const growth = recentTotal / priorTotal - 1;

  const priorYearWeekly = _toWeekly(metricSeries(ds, loc, { s: addD(start, -365), e: addD(end, -365) }, 'sales') || {});

  const bySourceOffset = {};
  (sourceWeekly || []).forEach(w => { if (Number.isFinite(w.weekIndex) && w.impactPct != null) bySourceOffset[w.weekIndex] = w.impactPct; });

  const weekly = priorYearWeekly.map((w, i) => {
    const baseline = w.total * (1 + growth);
    const liftPct = bySourceOffset[i] ?? null;
    const projected = liftPct != null ? baseline * (1 + liftPct) : baseline;
    return { weekIndex: i, weekStart: dKey(addD(_asDate(w.weekStart), 365)), baseline, liftPct, projected, incrementalDollars: liftPct != null ? projected - baseline : 0 };
  });

  const totalBaseline = weekly.reduce((s, w) => s + w.baseline, 0);
  const totalProjected = weekly.reduce((s, w) => s + w.projected, 0);
  return {
    ok: true, loc, startDate: dKey(start), endDate: dKey(end), growth,
    weekly,
    summary: { totalBaseline, totalProjected, totalIncrementalDollars: totalProjected - totalBaseline },
  };
}
