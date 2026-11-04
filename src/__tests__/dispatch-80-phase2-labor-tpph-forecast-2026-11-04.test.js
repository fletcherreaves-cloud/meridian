// @ts-nocheck
// Task #80 Phase 2 (owner's reverse-engineered monthly-projections workbook, Labor %/TPPH half)
// -- memory/finding-owner-sales-forecast-model-2026-11-04.md section 2. Phase 1 (the sales comp
// model) shipped in PR #1647; this is the separate, simpler recency-weighted blend his workbook
// uses for Labor % and TPPH: SAME fixed weights for both (L3M 10% / L6W 20% / LM 30% / MTD 40%),
// no momentum or shrinkage step. TPPH additionally rounds its final blend UP to the nearest 0.05.
//
// `laborPct`/`tpph` are both `derive:{kind:'ratio'}` metrics in metric-source.js, so the ground
// truth for each window is metricSumRatio's own output (already covered by that module's own
// tests) -- these tests verify the NEW blending/rounding/trend logic on top of it, not
// metricSumRatio's correctness itself.
import { describe, it, expect } from 'vitest';
import {
  computeLaborTpphForecast, windowRange, LABOR_TPPH_WEIGHTS, TPPH_ROUND_STEP,
} from '../engine/owner-labor-tpph-forecast.js';
import { metricSumRatio } from '../engine/metric-source.js';

const LOC = '3708';
const ASOF = new Date(2026, 10, 4, 12, 0, 0); // Nov 4, 2026 -- mid-session's real "today"

// One day's worth of raw inputs feeding laborPct (laborDollar/sales) and tpph (gc/actHrs) via
// their real METRIC_SOURCES chains -- opsLaborRows/laborRows/ctrlRows, exactly as metric-source.js
// resolves them (never a precomputed laborPct/tpph field; metricSumRatio only reads the declared
// numerator/denominator legs).
function dayRows(date, { sales, laborDollar, gc, actHrs }) {
  return {
    laborRows: [{ loc: LOC, date, sales, gc }],
    opsLaborRows: [{ loc: LOC, date, laborDollar }],
    ctrlRows: [{ loc: LOC, date, actHrs }],
  };
}
function mergeDs(...days) {
  const ds = { laborRows: [], opsLaborRows: [], ctrlRows: [] };
  for (const d of days) {
    ds.laborRows.push(...d.laborRows);
    ds.opsLaborRows.push(...d.opsLaborRows);
    ds.ctrlRows.push(...d.ctrlRows);
  }
  return ds;
}

// Ground-truth window value, computed the SAME way the engine does (metricSumRatio over the
// engine's own exported windowRange), so these tests stay correct even if the exact calendar
// boundaries ever shift -- never a hand-computed calendar sum.
function groundTruth(ds, kind, key) {
  const r = metricSumRatio(ds, LOC, windowRange(kind, ASOF), key);
  return r ? r.value : null;
}

describe('computeLaborTpphForecast', () => {
  it('blends L3M/L6W/LM/MTD with the documented weights (0.10/0.20/0.30/0.40), matching metricSumRatio ground truth per window', () => {
    // One real day per window, each with a distinct laborDollar/sales ratio. Windows nest
    // (MTD ⊂ L6W ⊂ L3M for this asOf, LM ⊂ L6W too), so every window's TRUE Sum/Sum reflects
    // every day that falls inside it -- exactly what groundTruth() measures directly, rather
        // than assuming disjoint contributions.
    const ds = mergeDs(
      dayRows(new Date(2026, 7, 15), { sales: 100, laborDollar: 15, gc: 1000, actHrs: 200 }),  // Aug 15 -- L3M only
      dayRows(new Date(2026, 8, 25), { sales: 100, laborDollar: 22, gc: 1000, actHrs: 210 }),  // Sep 25 -- L6W + L3M (before LM/MTD start)
      dayRows(new Date(2026, 9, 10), { sales: 100, laborDollar: 26, gc: 1000, actHrs: 220 }),  // Oct 10 -- LM + L6W + L3M
      dayRows(new Date(2026, 10, 2), { sales: 100, laborDollar: 30, gc: 1000, actHrs: 230 }),  // Nov 2 -- MTD + L6W + L3M
    );
    const out = computeLaborTpphForecast(ds, LOC, ASOF)[LOC];

    const expWindows = {
      l3m: groundTruth(ds, 'l3m', 'laborPct'), l6w: groundTruth(ds, 'l6w', 'laborPct'),
      lm: groundTruth(ds, 'lm', 'laborPct'), mtd: groundTruth(ds, 'mtd', 'laborPct'),
    };
    expect(out.laborPct.windows).toEqual(expWindows);
    const expBlend = Object.entries(LABOR_TPPH_WEIGHTS)
      .reduce((acc, [k, w]) => ({ sum: acc.sum + expWindows[k] * w, wt: acc.wt + w }), { sum: 0, wt: 0 });
    expect(out.laborPct.value).toBeCloseTo(expBlend.sum / expBlend.wt, 10);
  });

  it('rounds the final blended TPPH UP to the nearest 0.05, keeping the unrounded blend on rawValue', () => {
    const ds = mergeDs(
      dayRows(new Date(2026, 7, 15), { sales: 100, laborDollar: 20, gc: 983, actHrs: 200 }),
      dayRows(new Date(2026, 10, 2), { sales: 100, laborDollar: 20, gc: 983, actHrs: 200 }),
    );
    const out = computeLaborTpphForecast(ds, LOC, ASOF)[LOC];
    expect(out.tpph.rawValue).toBeCloseTo(983 / 200, 10); // 4.915 -- not a multiple of 0.05
    expect(out.tpph.value).toBeCloseTo(Math.ceil(out.tpph.rawValue / TPPH_ROUND_STEP) * TPPH_ROUND_STEP, 10);
    expect(out.tpph.value).toBeGreaterThanOrEqual(out.tpph.rawValue); // the deliberate conservative bias -- never rounds down
  });

  it('a monotonically increasing window sequence trends "up"; a flat one trends "flat"', () => {
    const upDs = mergeDs(
      dayRows(new Date(2026, 7, 15), { sales: 100, laborDollar: 10, gc: 1000, actHrs: 200 }),
      dayRows(new Date(2026, 8, 25), { sales: 100, laborDollar: 20, gc: 1000, actHrs: 200 }),
      dayRows(new Date(2026, 9, 10), { sales: 100, laborDollar: 30, gc: 1000, actHrs: 200 }),
      dayRows(new Date(2026, 10, 2), { sales: 100, laborDollar: 40, gc: 1000, actHrs: 200 }),
    );
    expect(computeLaborTpphForecast(upDs, LOC, ASOF)[LOC].laborPct.trend).toBe('up');

    const flatDs = mergeDs(
      dayRows(new Date(2026, 7, 15), { sales: 100, laborDollar: 25, gc: 1000, actHrs: 200 }),
      dayRows(new Date(2026, 8, 25), { sales: 100, laborDollar: 25, gc: 1000, actHrs: 200 }),
      dayRows(new Date(2026, 9, 10), { sales: 100, laborDollar: 25, gc: 1000, actHrs: 200 }),
      dayRows(new Date(2026, 10, 2), { sales: 100, laborDollar: 25, gc: 1000, actHrs: 200 }),
    );
    expect(computeLaborTpphForecast(flatDs, LOC, ASOF)[LOC].laborPct.trend).toBe('flat');
  });

  it('renormalizes the weights over whichever windows have real data, rather than nulling out, when one window is empty', () => {
    // No day at all in the L3M-only zone (before L6W starts) -- L3M, L6W, LM, MTD all still
    // resolve (L3M's range still covers the L6W/LM/MTD days), so this instead exercises a
    // genuinely store-with-no-L3M-era-history case by starting history only 20 days before asOf
    // (inside L6W, outside L3M's reach is impossible since L3M is the broadest window and always
    // covers anything L6W covers) -- so to produce a REAL missing window, drop MTD's own day
    // instead: a store whose very recent (last 3 days) data hasn't landed yet.
    const ds = mergeDs(
      dayRows(new Date(2026, 7, 15), { sales: 100, laborDollar: 20, gc: 1000, actHrs: 200 }),
      dayRows(new Date(2026, 8, 25), { sales: 100, laborDollar: 20, gc: 1000, actHrs: 200 }),
      dayRows(new Date(2026, 9, 10), { sales: 100, laborDollar: 20, gc: 1000, actHrs: 200 }),
      // deliberately nothing in Nov 1-3 (MTD) -- the one day that falls ONLY inside MTD's own
      // start boundary and no earlier window's start boundary is irrelevant here since every
      // earlier day already covers MTD's range too via L3M/L6W; what actually nulls MTD is
      // having NO row at all in [Nov 1, Nov 3].
    );
    const out = computeLaborTpphForecast(ds, LOC, ASOF)[LOC];
    expect(out.laborPct.windows.mtd).toBeNull();
    expect(out.laborPct.windows.l3m).not.toBeNull();
    expect(out.laborPct.value).not.toBeNull();
    const present = ['l3m', 'l6w', 'lm'];
    const expBlend = present.reduce((a, k) => a + out.laborPct.windows[k] * LABOR_TPPH_WEIGHTS[k], 0)
      / present.reduce((a, k) => a + LABOR_TPPH_WEIGHTS[k], 0);
    expect(out.laborPct.value).toBeCloseTo(expBlend, 10);
  });

  it('a store with no data anywhere in any window returns null for both metrics, not a fabricated number', () => {
    const ds = { laborRows: [], opsLaborRows: [], ctrlRows: [] };
    const out = computeLaborTpphForecast(ds, LOC, ASOF)[LOC];
    expect(out.laborPct.value).toBeNull();
    expect(out.tpph.value).toBeNull();
    expect(out.tpph.rawValue).toBeNull();
    expect(out.laborPct.trend).toBeNull();
  });

  it('accepts and keys multiple locs in one call', () => {
    const OTHER = '5183';
    const ds = {
      laborRows: [
        { loc: LOC, date: new Date(2026, 10, 2), sales: 100, gc: 1000 },
        { loc: OTHER, date: new Date(2026, 10, 2), sales: 200, gc: 2000 },
      ],
      opsLaborRows: [
        { loc: LOC, date: new Date(2026, 10, 2), laborDollar: 20 },
        { loc: OTHER, date: new Date(2026, 10, 2), laborDollar: 60 },
      ],
      ctrlRows: [
        { loc: LOC, date: new Date(2026, 10, 2), actHrs: 200 },
        { loc: OTHER, date: new Date(2026, 10, 2), actHrs: 400 },
      ],
    };
    const out = computeLaborTpphForecast(ds, [LOC, OTHER], ASOF);
    expect(Object.keys(out).sort()).toEqual([LOC, OTHER].sort());
    expect(out[LOC].laborPct.windows.mtd).toBeCloseTo(0.20, 10);
    expect(out[OTHER].laborPct.windows.mtd).toBeCloseTo(0.30, 10);
  });
});
