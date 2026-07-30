// @ts-nocheck
// ── Opportunity $ engine ───────────────────────────────────────────────────────
// Converts performance gaps into recoverable DOLLARS, per store and rolled to a
// district, so a leader sees "this gap ≈ $X". Flagship of the "intelligence system"
// vision (see memory/design-opportunity-dollars.md). Pure + fully testable: it takes
// a normalized per-store input array and returns dollars — no ds/Supabase coupling
// (a thin adapter maps ds → these inputs via metric-source/vs-ly/qsr_fob).
//
// v1 pillars (all data already pulled):
//   • Labor — (actualLabor% − benchLabor%) × netSales
//   • Food/FOB — (actualFOB% − benchFOB%) × prodSales
//   • GC/Sales — (benchGCperDay − actualGCperDay) × avgCheck × days
// Benchmark modes: 'target' (each store's own agreed target — the accountability $) or
// 'bic' (district best-in-class rate — the aspirational $). Default 'target'.
//
// GUARDRAILS (Meridian standing rules): floor every pillar at $0 (beating the
// benchmark = $0 opportunity, never a negative "credit"); pillars are disjoint (no
// double-count); dollar-weighted rollups (Σ$, never average-of-averages); the
// benchmark used is returned so the UI can show the methodology.

const num = v => (typeof v === 'number' && isFinite(v)) ? v : null;
const pos0 = v => (v > 0 ? v : 0);

// Percentile of a numeric array (linear interpolation). p in [0,1].
export function percentile(arr, p) {
  const s = (arr || []).filter(v => v != null && isFinite(v)).sort((a, b) => a - b);
  if (!s.length) return null;
  if (s.length === 1) return s[0];
  const idx = p * (s.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return s[lo] + (s[hi] - s[lo]) * (idx - lo);
}

// Best-in-class rate across stores. For a cost rate (lower is better) that's a low
// percentile (default p10); for GC/day (higher is better) a high percentile (p90).
export function bestInClass(values, { higherIsBetter = false, frac = 0.1 } = {}) {
  const p = higherIsBetter ? (1 - frac) : frac;
  return percentile(values, p);
}

// One store's three pillars. `store` fields (any missing pillar → skipped, $0):
//   loc, netSales, prodSales, days, avgCheck,
//   laborPctActual, laborPctTarget, fobPctActual, fobPctTarget,
//   gcPerDayActual   (+ benchmarks injected by computeOpportunity)
function storePillars(store, bench) {
  const netSales  = num(store.netSales);
  const prodSales = num(store.prodSales) ?? netSales;
  const days      = num(store.days) || 0;
  const avgCheck  = num(store.avgCheck);

  // Labor: excess labor % × the sales it's spent against.
  const laborA = num(store.laborPctActual);
  const laborB = num(bench.laborPct);
  const labor$ = (laborA != null && laborB != null && netSales != null)
    ? pos0(laborA - laborB) * netSales : 0;

  // Food/FOB: excess food-over-base % × product sales.
  const fobA = num(store.fobPctActual);
  const fobB = num(bench.fobPct);
  const food$ = (fobA != null && fobB != null && prodSales != null)
    ? pos0(fobA - fobB) * prodSales : 0;

  // GC / traffic opportunity = SALES-TO-PLAN shortfall (Notes 35): pos0(projected prod
  // sales/day − actual sales/day) × days. Tied directly to Projected Prod Sales, so it's a
  // bounded, sane $ (a store behind plan by ~$X/day) — NO avg-check multiplication, which is
  // what let it explode to millions/week. Falls back to the old GC-gap × avg-check form only
  // when no projected-sales figure exists (non-One-Pager callers).
  const projSD = num(store.projSalesPerDay), salesD = num(store.salesPerDay);
  let gc$, gcDriver;
  if (projSD != null && salesD != null && days > 0) {
    const gapDay = pos0(projSD - salesD);
    gc$ = gapDay * days;
    gcDriver = { mode: 'sales', actual: salesD, bench: projSD, gapPerDay: gapDay, days };
  } else {
    const gcA = num(store.gcPerDayActual), gcB = num(bench.gcPerDay);
    gc$ = (gcA != null && gcB != null && avgCheck != null && days > 0) ? pos0(gcB - gcA) * avgCheck * days : 0;
    gcDriver = { mode: 'gc', actual: gcA, bench: gcB, gapPerDay: (gcA != null && gcB != null) ? pos0(gcB - gcA) : null, avgCheck, days };
  }

  return {
    loc: store.loc,
    days,                                 // window day-count — lets the UI express $ per week
    labor$, food$, gc$,
    total$: labor$ + food$ + gc$,
    drivers: {
      labor: { actual: laborA, bench: laborB, gapPts: (laborA != null && laborB != null) ? pos0(laborA - laborB) : null, base: netSales },
      food:  { actual: fobA,  bench: fobB,  gapPts: (fobA != null && fobB != null) ? pos0(fobA - fobB) : null, base: prodSales },
      gc:    gcDriver,
    },
  };
}

// Main entry. `stores` = normalized per-store inputs (see storePillars). Options:
//   mode: 'target' (default — each store vs its own *Target field) | 'bic'
//   bicFrac: percentile fraction for best-in-class (default 0.1)
// Returns { perStore:[…], district:{labor$,food$,gc$,total$}, benchmarks, mode }.
// gcBench: 'auto' (default) — GC benchmarks against the store's gcPerDayTarget, else the
//   district best-in-class GC/day. 'projection' — GC benchmarks ONLY against gcPerDayTarget
//   (the store's plan); when absent the GC pillar is skipped ($0), never BIC. This is the
//   One-Pager's pace-to-projection mode so a down sales trend can't inflate the GC gap.
export function computeOpportunity(stores = [], { mode = 'target', bicFrac = 0.1, gcBench = 'auto' } = {}) {
  const list = (stores || []).filter(Boolean);

  // District best-in-class rates (always computed — shown as context even in target mode).
  const bic = {
    laborPct: bestInClass(list.map(s => num(s.laborPctActual)), { higherIsBetter: false, frac: bicFrac }),
    fobPct:   bestInClass(list.map(s => num(s.fobPctActual)),   { higherIsBetter: false, frac: bicFrac }),
    gcPerDay: bestInClass(list.map(s => num(s.gcPerDayActual)), { higherIsBetter: true,  frac: bicFrac }),
  };

  const perStore = list.map(s => {
    // In 'target' mode each store benchmarks against its OWN agreed target; in 'bic'
    // mode all stores benchmark against the single district best-in-class rate.
    const bench = mode === 'bic' ? bic : {
      laborPct: num(s.laborPctTarget),
      fobPct:   num(s.fobPctTarget),
      // 'projection' → plan only (null when absent → GC pillar skipped). 'auto' → plan else BIC.
      gcPerDay: gcBench === 'projection' ? num(s.gcPerDayTarget) : (num(s.gcPerDayTarget) ?? bic.gcPerDay),
    };
    return { ...storePillars(s, bench), bench };
  });

  const district = perStore.reduce((a, p) => ({
    labor$: a.labor$ + p.labor$, food$: a.food$ + p.food$, gc$: a.gc$ + p.gc$, total$: a.total$ + p.total$,
  }), { labor$: 0, food$: 0, gc$: 0, total$: 0 });

  return { perStore, district, benchmarks: bic, mode };
}

// Annualize a per-period $ figure (e.g. monthly → ×12, weekly → ×52) for the
// "$X/year silently eroding margin" framing.
export function annualize(perPeriod$, periodsPerYear = 12) {
  return (num(perPeriod$) || 0) * periodsPerYear;
}

// Rank stores by total $ opportunity (biggest first) — the "where to look" order.
export function rankByOpportunity(perStore = []) {
  return [...perStore].sort((a, b) => (b.total$ || 0) - (a.total$ || 0));
}
