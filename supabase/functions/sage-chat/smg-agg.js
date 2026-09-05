// Shared, Deno/Node-agnostic aggregation logic for SAGE's query_smg tool. Imported directly by
// supabase/functions/sage-chat/index.ts and by its Vitest test in src/__tests__/, so the SAME
// code that runs in production is what the test exercises -- not a re-implementation of it.
// Plain JS, no TypeScript, per this file family's own convention (see lifelenz-labor-agg.js).
//
// McDonald's corporate standards, hand-ported from src/views/smg-voice.js's SMG_DEFAULTS (the
// same in-app dashboard's own thresholds). Values on smg_fullscale are 0-1 fractions, same scale
// as these thresholds -- confirmed by dispatch #85 #3's fix to buildSmgSummary (src/views/sage.js),
// which had this exact 0-1-vs-percent comparison backwards before.
export const SMG_STANDARDS = { osatTop2Min: 0.90, osatB2BMin: 0.90, accuracyB2BMin: 0.95, dtProblemMax: 0.10, overallProblemMax: 0.10 };

const METRIC_KEYS = ['osat_top2', 'osat_5', 'osat_b2b', 'accuracy_b2b', 'dt_problem', 'overall_problem'];

// n-weighted average (Σ metric×n / Σn) wherever a row has both the metric and n; falls back to a
// plain mean over the rows that have the metric but not n, and ONLY when NONE of them have n --
// so one un-weighted store never silently drags a mostly-weighted figure to an unweighted average.
// "Never average averages" -- this repo's own standing rule.
export function weightedAvg(rows, key) {
  const withN = rows.filter(r => r[key] != null && r.n != null && r.n > 0);
  if (withN.length) {
    const num = withN.reduce((s, r) => s + r[key] * r.n, 0);
    const den = withN.reduce((s, r) => s + r.n, 0);
    return den > 0 ? num / den : null;
  }
  const withVal = rows.filter(r => r[key] != null);
  return withVal.length ? withVal.reduce((s, r) => s + r[key], 0) / withVal.length : null;
}

// Per-store rows with a below_standard flag per metric, sorted worst-Top2-first (the stores
// needing attention surface first, matching every other SAGE tool's own worst-first convention).
export function aggregateSmgFullscale(rows, storeNames = {}) {
  const stores = rows.map(r => ({
    loc: r.loc, name: storeNames[r.loc] || `Store ${r.loc}`,
    osat_top2: r.osat_top2, osat_5: r.osat_5, osat_b2b: r.osat_b2b,
    accuracy_b2b: r.accuracy_b2b, dt_problem: r.dt_problem, overall_problem: r.overall_problem,
    n: r.n,
    below_standard: {
      osat_top2: r.osat_top2 != null && r.osat_top2 < SMG_STANDARDS.osatTop2Min,
      osat_b2b: r.osat_b2b != null && r.osat_b2b < SMG_STANDARDS.osatB2BMin,
      accuracy_b2b: r.accuracy_b2b != null && r.accuracy_b2b < SMG_STANDARDS.accuracyB2BMin,
      dt_problem: r.dt_problem != null && r.dt_problem > SMG_STANDARDS.dtProblemMax,
      overall_problem: r.overall_problem != null && r.overall_problem > SMG_STANDARDS.overallProblemMax,
    },
  })).sort((a, b) => (a.osat_top2 ?? 1) - (b.osat_top2 ?? 1));

  const district = { store_count: stores.length };
  for (const key of METRIC_KEYS) district[key] = weightedAvg(rows, key);

  return { stores, district };
}

export const SMG_NOTE = 'All figures are 0-1 fractions (0.90 = 90%). Top-2/OSAT B2B/Accuracy B2B are higher-is-better; DT/Overall Problem are lower-is-better (% of guests who had a problem). District figures are response-count-weighted (n) where available. Source: smg_fullscale, uploaded monthly from the SMG FullScale Excel export -- not yet automated, see memory/finding-smg-reporting-api-2026-09-05.md for the automation investigation.';
