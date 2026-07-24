// @ts-nocheck
// ── Graded-Visit Readiness Index ──────────────────────────────────────────────
// Predicts how a store would fare on a McDonald's 2026 PACE graded visit (CFV /
// RGRV / EcoSure Food Safety) from the operational metrics Meridian already tracks
// daily — so the owner coaches the at-risk stores BEFORE the (mostly unannounced)
// visit lands. See memory/project-graded-visits-pace.md for the standards this maps
// to and why it matters (failed visits → 14-day / 30-90-day re-visit clocks →
// 4 qualifying visits → Operations Process to Cure → Franchising Standards).
//
// Design (v1): a TRANSPARENT weighted composite, not a black box. Each sub-score is
// built from metrics scored against each store's OWN targets (DEFAULT_TARGETS) or
// the McDonald's standard, so you always see WHY a store is flagged. Weighted toward
// Service Speed + Accuracy — the areas that are both heavily graded AND proxied
// ~1:1 by the data. Food Safety is a separate binary-ish RISK FLAG (cook-temp
// criticals aren't predictable from sales; waste/holding is a directional proxy).
// Cleanliness is an acknowledged data gap.

import { DEFAULT_TARGETS } from '../constants.js';

const _normLoc = l => String(parseInt(String(l ?? '').replace(/\D/g, ''), 10) || '');
const _num = v => (typeof v === 'number' && isFinite(v)) ? v : (v != null && !isNaN(+v) ? +v : null);
const _ms = d => (d instanceof Date ? d.getTime() : new Date(String(d)).getTime());
const clamp01 = x => Math.max(0, Math.min(1, x));

// SMG rating fields may be stored as a fraction (0.95) or a percent (95). Normalize
// to a percent so fixed 0-100 targets compare correctly.
const asPct = v => (v == null ? null : (Math.abs(v) <= 1.5 ? v * 100 : v));

// Sub-score weights (renormalized over whatever has data). Speed + Accuracy dominate.
export const READINESS_WEIGHTS = { speed: 0.35, accuracy: 0.30, quality: 0.20, leadership: 0.15 };

// Metric specs. tgt: a DEFAULT_TARGETS key (per-store) OR a literal number (standard).
// dir: 'lower' (at/below target = perfect) or 'higher'. band: tolerance as a fraction
// of the target — actual worse than target by `band` scores 0. src list is tried in
// order (freshest cloud stream first); monthly metrics take the latest value/store.
const SPEED = [
  { key: 'oepe', label: 'OEPE (DT total, sec)', srcs: [['glimpseRows', 'oepe'], ['opsRows', 'oepe']], tgt: 'tOepe', dir: 'lower', band: 0.22, unit: 's' },
  { key: 'kvst', label: 'KVS time (sec)',       srcs: [['glimpseRows', 'kvst'], ['opsRows', 'kvst']], tgt: 'tKvst', dir: 'lower', band: 0.35, unit: 's' },
  { key: 'park', label: 'DT park rate',          srcs: [['opsRows', 'park']],                          tgt: 'tPark', dir: 'lower', band: 0.60, unit: 'pct' },
  { key: 'r2p',  label: 'R2P front counter (sec)', srcs: [['opsRows', 'r2p']],                         tgt: 'tR2p',  dir: 'lower', band: 0.30, unit: 's' },
];
const ACCURACY = [
  { key: 'accB2B',  label: 'SMG accuracy (B2B) %', srcs: [['smgFullscale', 'accuracyB2B']],  tgt: 95, dir: 'higher', band: 0.06, unit: 'pct', monthly: true, pct: true },
  { key: 'problem', label: 'SMG problem %',        srcs: [['smgFullscale', 'overallProblem']], tgt: 10, dir: 'lower', band: 0.80, unit: 'pct', monthly: true, pct: true },
  { key: 'tRedA',   label: 'T-Reds after total %', srcs: [['ctrlRows', 'tRedAPct']],          tgt: 'tRedAPct', dir: 'lower', band: 0.60, unit: 'pct' },
];
const QUALITY = [
  { key: 'comp', label: 'Comp waste %', srcs: [['fobRows', 'compWaste']], tgt: 'tCompWaste', dir: 'lower', band: 0.60, unit: 'pct', monthly: true },
  { key: 'raw',  label: 'Raw waste %',  srcs: [['fobRows', 'rawWaste']],  tgt: 'tRawWaste',  dir: 'lower', band: 0.60, unit: 'pct', monthly: true },
  { key: 'osat', label: 'SMG OSAT (B2B) %', srcs: [['smgFullscale', 'osatB2B']], tgt: 90, dir: 'higher', band: 0.10, unit: 'pct', monthly: true, pct: true },
];
const LEADERSHIP = [
  { key: 'tpph',  label: 'TPPH (throughput/labor-hr)', srcs: [['laborRows', 'tpph']], tgt: 'tTpph', dir: 'higher', band: 0.22, unit: '' },
  { key: 'labor', label: 'Labor % of sales', srcs: [['glimpseRows', 'laborPct'], ['laborRows', 'laborPct']], tgt: 'tCrewLabor', dir: 'lower', band: 0.18, unit: 'pct' },
  { key: 'schedGap', label: 'Schedule gap vs ideal (hrs)', srcs: [['schedRows', 'schVsIdealDiff']], tgt: 0, dir: 'abs', band: null, unit: 'hrs', absTol: 8 },
];
// Food-safety proxy metrics (waste/holding discipline). NOT a % score — feeds a flag.
const FOODSAFETY = [
  { key: 'statVar', label: 'Stat variance %', srcs: [['fobRows', 'statVar']], tgt: 'tStatLoss', dir: 'lower', band: 0.6, monthly: true },
  { key: 'raw',     label: 'Raw waste %',     srcs: [['fobRows', 'rawWaste']], tgt: 'tRawWaste', dir: 'lower', band: 0.6, monthly: true },
];

const RECENT_DAYS = 45;

// ── Explainability helpers ────────────────────────────────────────────────────
// Human-readable value for a "why" sentence (the view formats its own cells).
function _fmtVal(v, unit) {
  if (v == null) return '—';
  if (unit === 'pct') { const p = Math.abs(v) <= 1.5 ? v * 100 : v; return (p < 10 ? p.toFixed(1) : Math.round(p)) + '%'; }
  if (unit === 's') return Math.round(v) + 's';
  if (unit === 'hrs') return v.toFixed(1) + 'h';
  return String(Math.round(v * 10) / 10);
}
// Plain-language explanation of why a store landed where it did — from its worst drivers.
function buildWhy(store) {
  const b = store.band;
  const bandWord = b === 'at-risk' ? 'At risk' : b === 'watch' ? 'On watch' : 'Ready';
  const bad = (store.topDrivers || []).filter(d => d.score < 0.85).slice(0, 3);
  if (!bad.length) {
    const lead = b === 'ready' ? 'Every measured area is at or near target.' : 'No single metric stands out — the gap is spread across several areas.';
    return `${bandWord}. ${lead}`;
  }
  const phrases = bad.map(d => `${d.label} at ${_fmtVal(d.actual, d.unit)} vs ${_fmtVal(d.target, d.unit)} target`);
  const gapList = phrases.length === 1 ? phrases[0]
    : phrases.slice(0, -1).join(', ') + ' and ' + phrases[phrases.length - 1];
  const fs = store.fsFlag === 'elevated' ? ' Food-safety proxies (waste/holding) are also elevated.'
    : store.fsFlag === 'watch' ? ' Food-safety proxies are worth a look.' : '';
  return `${bandWord} — the biggest gaps are ${gapList}.${fs}`;
}

// Spearman rank correlation (Pearson on ranks) — robust to the different scales of
// predicted readiness (0-100) vs an actual graded-visit score. Returns null if n<3.
function _spearman(xs, ys) {
  const n = xs.length;
  if (n < 3) return null;
  const rank = arr => {
    const idx = arr.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
    const r = new Array(n);
    for (let i = 0; i < n;) { // average ties
      let j = i; while (j + 1 < n && idx[j + 1][0] === idx[i][0]) j++;
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
      i = j + 1;
    }
    return r;
  };
  const rx = rank(xs), ry = rank(ys);
  const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
  const mx = mean(rx), my = mean(ry);
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { const a = rx[i] - mx, b = ry[i] - my; num += a * b; dx += a * a; dy += b * b; }
  return (dx && dy) ? +(num / Math.sqrt(dx * dy)).toFixed(2) : null;
}

// Validate predicted readiness against the ACTUAL graded-visit scores the engine loads.
// Trust signal: do stores we rate lower actually score lower on their real visits?
export function calibrateReadiness(stores) {
  const rows = stores
    .filter(s => s.lastVisit && s.lastVisit.score != null)
    .map(s => ({ loc: s.loc, predicted: s.readiness, band: s.band, actual: +s.lastVisit.score, pass: s.lastVisit.pass, type: s.lastVisit.type, dateISO: s.lastVisit.dateISO }));
  const n = rows.length;
  const r = _spearman(rows.map(x => x.predicted), rows.map(x => x.actual));
  // Direction agreement: a store we did NOT rate "ready" should score below the group's
  // median actual (and vice-versa) — a simple, scale-free hit-rate.
  let hits = null, hitRate = null;
  if (n >= 3) {
    const med = [...rows.map(x => x.actual)].sort((a, b) => a - b)[Math.floor(n / 2)];
    hits = rows.filter(x => (x.band === 'ready') === (x.actual >= med)).length;
    hitRate = +(hits / n).toFixed(2);
  }
  const strength = r == null ? null : Math.abs(r) >= 0.6 ? 'strong' : Math.abs(r) >= 0.3 ? 'moderate' : 'weak';
  return { n, r, strength, hits, hitRate, rows: rows.sort((a, b) => a.predicted - b.predicted) };
}

// Per-store recent value for a (source, field): daily → mean over last RECENT_DAYS;
// monthly → the single latest-dated value. Returns { [loc]: value }.
function valuesByLoc(ds, source, field, monthly) {
  const rows = ds?.[source] || [];
  const out = {};
  if (monthly) {
    const latest = {}; // loc → {ms, v}
    for (const r of rows) {
      const v = _num(r[field]); if (v == null) continue;
      const d = r.date || (r.year ? new Date(r.year, (r.month || 1) - 1, 1) : null); if (!d) continue;
      const loc = _normLoc(r.loc); const ms = _ms(d);
      if (!latest[loc] || ms > latest[loc].ms) latest[loc] = { ms, v };
    }
    for (const loc in latest) out[loc] = latest[loc].v;
    return out;
  }
  const cutoff = Date.now() - RECENT_DAYS * 864e5;
  const agg = {}; // loc → {sum,n}
  for (const r of rows) {
    if (!r.date) continue; const ms = _ms(r.date); if (isNaN(ms) || ms < cutoff) continue;
    const v = _num(r[field]); if (v == null || v === 0) continue;
    const loc = _normLoc(r.loc);
    (agg[loc] || (agg[loc] = { sum: 0, n: 0 }));
    agg[loc].sum += v; agg[loc].n++;
  }
  for (const loc in agg) out[loc] = agg[loc].sum / agg[loc].n;
  return out;
}

// First source with a value for this loc. Returns {value, source} or null.
function pickValue(ds, spec, loc, cache) {
  for (const [source, field] of spec.srcs) {
    const key = source + '|' + field + '|' + (spec.monthly ? 'm' : 'd');
    const map = cache[key] || (cache[key] = valuesByLoc(ds, source, field, spec.monthly));
    const v = map[loc];
    if (v != null) {
      const val = spec.pct ? asPct(v) : v;
      return { value: val, source };
    }
  }
  return null;
}

// Score one metric 0..1 (1 = at/better than target). Also returns the resolved target.
function scoreMetric(spec, actual, loc) {
  let tgt = typeof spec.tgt === 'number' ? spec.tgt : (DEFAULT_TARGETS[loc] || {})[spec.tgt];
  if (spec.pct && typeof spec.tgt !== 'number') tgt = asPct(tgt);
  if (tgt == null) return null;
  if (spec.dir === 'abs') {
    const tol = spec.absTol || 1;
    return { score: clamp01(1 - Math.abs(actual - tgt) / tol), target: tgt };
  }
  if (!(tgt > 0)) return null;
  const band = spec.band || 0.25;
  const over = spec.dir === 'lower' ? (actual - tgt) : (tgt - actual);
  return { score: clamp01(1 - Math.max(0, over) / (tgt * band)), target: tgt };
}

// Compute a sub-score for a spec group. Returns { score(0-100)|null, drivers:[…], n }.
function subScore(ds, specs, loc, cache) {
  let sum = 0, n = 0; const drivers = [];
  for (const spec of specs) {
    const picked = pickValue(ds, spec, loc, cache);
    if (!picked) continue;
    const sc = scoreMetric(spec, picked.value, loc);
    if (!sc) continue;
    sum += sc.score; n++;
    drivers.push({ key: spec.key, label: spec.label, actual: picked.value, target: sc.target, score: sc.score, dir: spec.dir, unit: spec.unit, source: picked.source });
  }
  if (!n) return { score: null, drivers: [], n: 0 };
  drivers.sort((a, b) => a.score - b.score); // worst first
  return { score: +(sum / n * 100).toFixed(1), drivers, n };
}

// ── Public: per-store + district readiness ────────────────────────────────────
export function computeVisitReadiness(ds, opts = {}) {
  const weights = opts.weights || READINESS_WEIGHTS;
  const locs = Object.keys(DEFAULT_TARGETS).filter(l => /^\d+$/.test(l));
  const cache = {};
  const gv = ds?.gradedVisits || ds?.graded_visits || [];
  const lastVisitByLoc = {};
  for (const v of gv) {
    const loc = _normLoc(v.store || v.loc); if (!loc || v.score == null) continue;
    const ms = _ms(v.dateISO || v.date || 0);
    if (!lastVisitByLoc[loc] || ms > lastVisitByLoc[loc].ms) lastVisitByLoc[loc] = { ms, score: v.score, pass: v.pass, type: v.reportType, dateISO: v.dateISO || v.date };
  }

  const stores = [];
  for (const loc of locs) {
    const speed = subScore(ds, SPEED, loc, cache);
    const accuracy = subScore(ds, ACCURACY, loc, cache);
    const quality = subScore(ds, QUALITY, loc, cache);
    const leadership = subScore(ds, LEADERSHIP, loc, cache);
    const subs = { speed, accuracy, quality, leadership };

    // Weighted composite over available sub-scores.
    let wSum = 0, acc = 0;
    for (const k of Object.keys(weights)) {
      if (subs[k].score != null) { acc += subs[k].score * weights[k]; wSum += weights[k]; }
    }
    if (wSum === 0) continue; // no data at all for this store
    const readiness = +(acc / wSum).toFixed(1);
    const coverage = +(wSum / (weights.speed + weights.accuracy + weights.quality + weights.leadership)).toFixed(2);

    // Food-safety risk flag (separate). Elevated waste/holding proxies → risk.
    const fs = subScore(ds, FOODSAFETY, loc, cache);
    const fsFlag = fs.score == null ? 'unknown' : fs.score >= 75 ? 'low' : fs.score >= 55 ? 'watch' : 'elevated';

    // Top risk drivers across all sub-scores (lowest metric scores).
    const allDrivers = [...speed.drivers, ...accuracy.drivers, ...quality.drivers, ...leadership.drivers]
      .sort((a, b) => a.score - b.score).slice(0, 4);

    const store = {
      loc, readiness, coverage, subs,
      band: readiness >= 85 ? 'ready' : readiness >= 70 ? 'watch' : 'at-risk',
      fsFlag, fsScore: fs.score,
      topDrivers: allDrivers,
      lastVisit: lastVisitByLoc[loc] || null,
    };
    store.why = buildWhy(store);   // plain-language explanation (explainability & trust)
    stores.push(store);
  }

  stores.sort((a, b) => a.readiness - b.readiness); // most at-risk first

  // District rollup (simple mean of store readiness + sub-score means).
  const mean = arr => arr.length ? +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : null;
  const district = stores.length ? {
    nStores: stores.length,
    readiness: mean(stores.map(s => s.readiness)),
    atRisk: stores.filter(s => s.band === 'at-risk').length,
    watch: stores.filter(s => s.band === 'watch').length,
    ready: stores.filter(s => s.band === 'ready').length,
    fsElevated: stores.filter(s => s.fsFlag === 'elevated').length,
    subs: {
      speed: mean(stores.map(s => s.subs.speed.score).filter(x => x != null)),
      accuracy: mean(stores.map(s => s.subs.accuracy.score).filter(x => x != null)),
      quality: mean(stores.map(s => s.subs.quality.score).filter(x => x != null)),
      leadership: mean(stores.map(s => s.subs.leadership.score).filter(x => x != null)),
    },
  } : null;

  // Model check: how well predicted readiness tracks the actual graded-visit scores.
  const calibration = calibrateReadiness(stores);

  return { stores, district, weights, calibration, gapNote: 'Cleanliness has no reliable daily-data proxy and is excluded from the score.' };
}
