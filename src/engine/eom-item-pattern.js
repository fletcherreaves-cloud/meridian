// @ts-nocheck
// ── EOM Item Pattern classifier ───────────────────────────────────────────────
// Given one item's variance history across periods (oldest→newest), classify the
// behavior into owner-facing "pattern chips" so an EOM action item carries its own
// provenance: is this a one-off, a chronic bleeder, a count-integrity problem, or a
// loss that's just starting to form? Pure + unit-tested — no I/O, no React.
//
// Chip vocabulary (owner's words, 2026-07-30):
//   within-tolerance   — every look-back period sits inside ±tolerance. The quiet good state.
//   high-variance      — chronically large |$| variance (most periods blow the band).
//   fluctuating        — swings sign/size period-to-period (volatile, not a steady trend).
//   loss-forming       — the RECENT periods are unfavorable AND trending worse. Catch it early.
//   inconsistent-count — a large sign-flip reversal (over-count then correction) — a count-integrity
//                        signature, not real usage. Also raised when a period is missing/uncounted.
//
// $ sign convention: dol < 0 = unfavorable (used/shrank more than expected = money lost),
// matching qsr_variance_stat.dol_diff. Callers that use the opposite sign should negate first.

export const PATTERN_META = {
  'within-tolerance':   { label: 'Within Tolerance',   color: '#4ade80', rank: 0, tone: 'good' },
  'high-variance':      { label: 'High Variance',      color: '#f87171', rank: 3, tone: 'bad'  },
  'fluctuating':        { label: 'Fluctuating',        color: '#fbbf24', rank: 2, tone: 'warn' },
  'loss-forming':       { label: 'Loss Pattern Forming', color: '#fb7185', rank: 4, tone: 'bad' },
  'inconsistent-count': { label: 'Inconsistent Count(s)', color: '#38bdf8', rank: 3, tone: 'warn' },
};

const median = (a) => {
  const s = a.filter(x => Number.isFinite(x)).slice().sort((x, y) => x - y);
  if (!s.length) return 0;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);

// series: [{ period, dol, qty?, counted? }, …] oldest→newest. `counted` (bool|null): did the item
// get counted that period (null/undefined = unknown). Returns { chips:[{id,label,color,why,tone}],
// primary, stats } where primary is the single most-actionable chip (highest rank).
export function classifyItemPattern(series = [], { tolerance = 50, recentN = 3 } = {}) {
  const pts = (series || []).filter(p => p && Number.isFinite(Number(p.dol)))
    .map(p => ({ period: p.period, dol: Number(p.dol), qty: Number(p.qty) || 0, counted: p.counted ?? null }));
  const n = pts.length;
  const dols = pts.map(p => p.dol);
  const abs = dols.map(Math.abs);
  const overCount = abs.filter(x => x > tolerance).length;
  const missing = pts.filter(p => p.counted === false).length;

  // Period-over-period reversals: a big sign-flip swing (over-count then correction).
  let maxReversal = 0, reversals = 0;
  for (let i = 1; i < n; i++) {
    const a = dols[i - 1], b = dols[i];
    if (Math.sign(a) !== Math.sign(b) && a !== 0 && b !== 0) {
      const swing = Math.abs(a - b);
      if (swing > tolerance * 2) { reversals++; maxReversal = Math.max(maxReversal, swing); }
    }
  }

  const recent = pts.slice(-Math.min(recentN, n));
  const recentUnfav = recent.filter(p => p.dol < -tolerance).length;
  const worsening = recent.length >= 2 && recent.every((p, i) => i === 0 || p.dol <= recent[i - 1].dol + 1e-9);

  const stats = {
    n, medianDol: median(dols), meanDol: mean(dols), maxAbs: Math.max(0, ...abs),
    overCount, missing, reversals, maxReversal,
    recentUnfav, recentN: recent.length, worsening,
    latestDol: n ? dols[n - 1] : 0,
  };

  const chips = [];
  const add = (id, why) => chips.push({ id, ...PATTERN_META[id], why });

  // 1) Loss forming — the urgent one. Recent window trending unfavorable + getting worse.
  if (recent.length >= 2 && recentUnfav >= Math.ceil(recent.length * 0.66) && worsening && stats.latestDol < -tolerance)
    add('loss-forming', `last ${recent.length} periods unfavorable and worsening (now ${fmtDol(stats.latestDol)})`);

  // 2) Inconsistent count — a large reversal swing, or a period the item wasn't counted.
  if (reversals >= 1 && maxReversal > tolerance * 2)
    add('inconsistent-count', `sign-flip swing of ${fmtDol(maxReversal)} — looks like an over-count then correction`);
  else if (missing >= 1)
    add('inconsistent-count', `${missing} of ${n} periods not counted — history has gaps`);

  // 3) High variance — chronically outside the band.
  if (n >= 2 && overCount >= Math.ceil(n * 0.5) && Math.abs(stats.medianDol) > tolerance)
    add('high-variance', `${overCount} of ${n} periods beyond ±${fmt0(tolerance)} (median ${fmtDol(stats.medianDol)})`);

  // 4) Fluctuating — volatile but not a clean trend (only if not already high-variance/loss-forming).
  if (!chips.some(c => c.id === 'high-variance' || c.id === 'loss-forming')
      && n >= 3 && reversals >= 1 && stats.maxAbs > tolerance)
    add('fluctuating', `swings period-to-period (max ${fmtDol(stats.maxAbs)}) without a steady direction`);

  // 5) Within tolerance — only when nothing above fired and every period is inside the band.
  if (!chips.length && n >= 1 && overCount === 0)
    add('within-tolerance', `all ${n} period${n !== 1 ? 's' : ''} inside ±${fmt0(tolerance)}`);

  chips.sort((a, b) => b.rank - a.rank);
  return { chips, primary: chips[0] || null, stats };
}

// The pattern ids that mark a genuine problem (everything except the quiet good state).
export const BAD_PATTERNS = new Set(['high-variance', 'loss-forming', 'fluctuating', 'inconsistent-count']);

// District-wide Chronic Offenders scan (owner req 2026-07-30): across ALL in-scope stores over a
// look-back window, which ITEMS are chronically problematic on our own principles? Groups flat
// variance rows by WRIN, classifies each (loc, wrin) series, and rolls up per item: how many stores
// carry a bad pattern, the total $ at stake, and the worst pattern seen. Ranked frequency-first
// (an item bleeding across many stores is a systemic/menu/spec problem, not a one-store fluke),
// then by $. Pure — feeds the on-demand scan UI. `varRows` = [{loc,period,wrin,descr,dolDiff,variance}].
export function scanChronicOffenders(varRows = [], { periodsAsc = [], tolerance = 50, minStores = 1 } = {}) {
  // wrin -> { descr, cls, byLoc: Map(loc -> {series}) }
  const byWrin = new Map();
  const wanted = new Set(periodsAsc);
  for (const r of varRows) {
    if (wanted.size && !wanted.has(r.period)) continue;
    const w = String(r.wrin);
    if (!byWrin.has(w)) byWrin.set(w, { wrin: w, descr: r.descr, cls: r.cls, byLoc: new Map() });
    const it = byWrin.get(w);
    if (r.descr && !it.descr) it.descr = r.descr;
    const L = String(r.loc);
    if (!it.byLoc.has(L)) it.byLoc.set(L, new Map());
    it.byLoc.get(L).set(r.period, { period: r.period, dol: Number(r.dolDiff) || 0, qty: Number(r.variance) || 0 });
  }

  const order = periodsAsc.length ? periodsAsc : [...new Set(varRows.map(r => r.period))].sort();
  const out = [];
  for (const [w, it] of byWrin) {
    const stores = [];
    let totalDol = 0;
    const patternTally = {};
    for (const [loc, byPeriod] of it.byLoc) {
      const series = order.filter(p => byPeriod.has(p)).map(p => byPeriod.get(p));
      if (!series.length) continue;
      const cls = classifyItemPattern(series, { tolerance });
      const primary = cls.primary;
      const bad = primary && BAD_PATTERNS.has(primary.id);
      const latestDol = series[series.length - 1].dol;
      if (bad) {
        stores.push({ loc, primary, latestDol, series, chips: cls.chips });
        totalDol += Math.abs(latestDol);
        patternTally[primary.id] = (patternTally[primary.id] || 0) + 1;
      }
    }
    if (stores.length >= minStores) {
      // Worst pattern = highest-ranked chip appearing anywhere for this item.
      const worst = Object.keys(patternTally).sort((a, b) => (PATTERN_META[b].rank - PATTERN_META[a].rank))[0] || null;
      stores.sort((a, b) => Math.abs(b.latestDol) - Math.abs(a.latestDol));
      out.push({ wrin: w, descr: it.descr, cls: it.cls, nStores: stores.length, totalDol, worst, patternTally, stores });
    }
  }
  out.sort((a, b) => (b.nStores - a.nStores) || (b.totalDol - a.totalDol));
  return out;
}

// Count Reliability (owner north-star 2026-07-30: "accuracy + consistency is king"). Per store, over
// a look-back window, what fraction of its multi-period items count CONSISTENTLY — i.e. WITHOUT a
// count-error signature. An `inconsistent-count` pattern (a large sign-flip swing = over-count then a
// correction, or a missing count) is the direct count-error signal → full penalty; `fluctuating` is a
// softer swing → half penalty. REAL losses (`high-variance` / `loss-forming`) are NOT held against
// reliability — those are genuine usage/loss, not counting errors. Least-reliable stores rank first
// (where to coach). `varRows` = [{loc,period,wrin,descr,dolDiff,variance}].
export function scanCountReliability(varRows = [], { periodsAsc = [], tolerance = 50, minItems = 3 } = {}) {
  const byLoc = new Map();
  for (const r of varRows) { const L = String(r.loc); (byLoc.get(L) || byLoc.set(L, []).get(L)).push(r); }
  const gradeOf = s => s >= 95 ? 'A' : s >= 88 ? 'B' : s >= 78 ? 'C' : s >= 68 ? 'D' : 'F';
  const out = [];
  for (const [loc, rows] of byLoc) {
    const series = buildItemSeries(rows, { periodsAsc });
    let nItems = 0, nInconsistent = 0, nFluct = 0;
    const worst = [];
    for (const [wrin, it] of series) {
      if ((it.series || []).length < 2) continue;   // need ≥2 periods to judge consistency
      nItems++;
      const ids = new Set(classifyItemPattern(it.series, { tolerance }).chips.map(c => c.id));
      if (ids.has('inconsistent-count')) {
        nInconsistent++;
        // Supporting facts: the swing that hurt the grade (biggest over → biggest short) + the
        // per-period $ series, so the UI can SHOW why the store is graded down, not just assert it.
        const s = it.series;
        let hi = s[0], lo = s[0];
        for (const p of s) { if (p.dol > hi.dol) hi = p; if (p.dol < lo.dol) lo = p; }
        worst.push({
          wrin, descr: it.descr, cls: it.cls,
          swingHi: hi.dol, swingHiP: hi.period, swingLo: lo.dol, swingLoP: lo.period,
          swing: Math.abs((hi.dol || 0) - (lo.dol || 0)),
          series: s.map(p => ({ period: p.period, dol: p.dol })),
        });
      } else if (ids.has('fluctuating')) nFluct++;
    }
    if (nItems < minItems) continue;                 // too few items to score meaningfully
    const penalty = nInconsistent + nFluct * 0.5;
    const score = Math.round(Math.max(0, nItems - penalty) / nItems * 100);
    worst.sort((a, b) => (b.swing || 0) - (a.swing || 0)); // biggest swing (most supporting evidence) first
    out.push({ loc, score, grade: gradeOf(score), nItems, nInconsistent, nFluct, worst: worst.slice(0, 8) });
  }
  out.sort((a, b) => a.score - b.score);             // least reliable first — where to coach
  return out;
}

// ── Rubber-band scan (integrity #47, the "variance collapse" catch) ───────────
// The padding-compounds-then-explodes pattern. An item that runs OVER (a gain = usage understated
// = inventory padded, a "loan against next month") for >=2 periods and then SNAPS to a large SHORT
// has had its accumulated padding catch up — the classic single-month blow-up. Directional cousin
// of `inconsistent-count` (which is sign-agnostic): rubber-band specifically means over-run → short.
// Needs multi-period history (reuses the same district variance pull as Chronic/Reliability).
// Per store: the items showing the snap, worst (biggest snap) first; stores ranked by total snap $.
export function scanRubberBand(varRows = [], { periodsAsc = [], tolerance = 50, minPeriods = 3, minOverRun = 2 } = {}) {
  const byLoc = new Map();
  for (const r of varRows) { const L = String(r.loc); (byLoc.get(L) || byLoc.set(L, []).get(L)).push(r); }
  const out = [];
  for (const [loc, rows] of byLoc) {
    const series = buildItemSeries(rows, { periodsAsc });
    const items = [];
    for (const [wrin, it] of series) {
      const s = it.series;
      if (s.length < minPeriods) continue;
      // Walk oldest→newest tracking the current OVER run; when a SHORT lands after an over-run of
      // >= minOverRun, that's a snap — recovered = min(short magnitude, accumulated over).
      let runN = 0, runSum = 0, runFrom = null, best = null;
      for (const p of s) {
        const d = p.dol || 0;
        if (d > tolerance) { if (!runN) runFrom = p.period; runN++; runSum += d; }
        else {
          if (d < -tolerance && runN >= minOverRun) {
            const snap = Math.min(Math.abs(d), runSum);
            if (!best || snap > best.snap) best = { snap, overSum: runSum, overN: runN, from: runFrom, to: p.period, shortDol: d };
          }
          runN = 0; runSum = 0; runFrom = null;
        }
      }
      if (best && best.snap >= tolerance * 2) {
        items.push({ wrin, descr: it.descr, cls: it.cls, ...best, series: s.map(p => ({ period: p.period, dol: p.dol })) });
      }
    }
    if (!items.length) continue;
    items.sort((a, b) => b.snap - a.snap);
    out.push({ loc, nItems: items.length, totalSnap: items.reduce((x, i) => x + i.snap, 0), worst: items.slice(0, 8) });
  }
  out.sort((a, b) => b.totalSnap - a.totalSnap);      // biggest rubber-band exposure first
  return out;
}

function fmtDol(v) { const s = v < 0 ? '-' : ''; return `${s}$${Math.abs(Math.round(v)).toLocaleString()}`; }
function fmt0(v) { return `$${Math.round(v).toLocaleString()}`; }

// Group flat variance rows (loc,period,wrin,dolDiff,variance) into per-item series keyed by wrin,
// oldest→newest, restricted to the given loc. `periodsAsc` bounds + orders the window.
export function buildItemSeries(varRows = [], { loc, periodsAsc = [] } = {}) {
  const wanted = new Set(periodsAsc);
  const byWrin = new Map();
  for (const r of varRows) {
    if (loc != null && String(r.loc) !== String(loc)) continue;
    if (wanted.size && !wanted.has(r.period)) continue;
    const w = String(r.wrin);
    if (!byWrin.has(w)) byWrin.set(w, { wrin: w, descr: r.descr, cls: r.cls, byPeriod: new Map() });
    const it = byWrin.get(w);
    if (r.descr && !it.descr) it.descr = r.descr;
    it.byPeriod.set(r.period, { period: r.period, dol: Number(r.dolDiff) || 0, qty: Number(r.variance) || 0 });
  }
  const order = periodsAsc.length ? periodsAsc : [...new Set(varRows.map(r => r.period))].sort();
  const out = new Map();
  for (const [w, it] of byWrin) {
    const series = order.filter(p => it.byPeriod.has(p)).map(p => it.byPeriod.get(p));
    out.set(w, { wrin: w, descr: it.descr, cls: it.cls, series });
  }
  return out;
}
