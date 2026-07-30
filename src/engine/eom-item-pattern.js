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
