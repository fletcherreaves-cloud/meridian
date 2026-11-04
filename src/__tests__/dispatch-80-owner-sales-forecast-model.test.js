// @ts-nocheck
// Task #80 (owner-approved 2026-11-04, "let's port it") — his own manual monthly-projections
// workbook's sales-forecast model (6-week Level + damped/capped Momentum + shrink-to-fleet),
// ported from the real formulas read directly out of his Aug/Oct/Nov 2026 workbooks (see
// memory/finding-owner-sales-forecast-model-2026-11-04.md for the reverse-engineering). Every
// dial tested here (levelWeeks=6, momentumDamp=0.10, momentumCap=0.02, shrinkToFleet=0.15,
// reviewFlagThreshold=0.05) is his own fitted value from the workbook's Assumptions tab, not a
// value chosen for this port — the arithmetic is checked by hand against the formulas, not
// against what the function happens to currently return.
import { describe, it, expect } from 'vitest';
import {
  OWNER_FORECAST_PARAMS, weeklyCompSeries, computeStoreForecast, applyFleetShrinkage,
  monthActualSales, computeOwnerSalesForecast,
} from '../engine/owner-sales-forecast.js';
import { weekStartOf, addD } from '../utils/date.js';

const LOC = '3708';

describe('computeStoreForecast — Level + damped/capped Momentum (pre-shrinkage)', () => {
  it('returns null with fewer than 6 real weekly readings — same guard his own workbook uses (COUNT<6 -> blank)', () => {
    const weekly = [{ pct: 0.01 }, { pct: null }, { pct: 0.02 }, { pct: 0.00 }, { pct: -0.01 }];
    expect(computeStoreForecast(weekly)).toBeNull();
  });

  it('computes Level as the plain average of the last 6 real readings, ignoring nulls before them', () => {
    // Oldest -> newest: W-6..W-1 = 0.02, 0.01, 0.00, -0.01, -0.02, -0.03
    const weekly = [{ pct: null }, { pct: 0.02 }, { pct: 0.01 }, { pct: 0.00 }, { pct: -0.01 }, { pct: -0.02 }, { pct: -0.03 }];
    const r = computeStoreForecast(weekly);
    expect(r.level).toBeCloseTo((0.02 + 0.01 + 0.00 - 0.01 - 0.02 - 0.03) / 6, 10); // -0.005
  });

  it('Momentum = avg(last 2) - avg(prior 4), damped x0.10, NOT capped when within +/-0.02', () => {
    const weekly = [0.02, 0.01, 0.00, -0.01, -0.02, -0.03].map(pct => ({ pct }));
    const r = computeStoreForecast(weekly);
    const rawMomentum = ((-0.02 + -0.03) / 2) - ((0.02 + 0.01 + 0.00 + -0.01) / 4); // -0.025 - 0.005 = -0.03
    expect(r.rawMomentum).toBeCloseTo(rawMomentum, 10);
    expect(r.dampedMomentum).toBeCloseTo(rawMomentum * OWNER_FORECAST_PARAMS.momentumDamp, 10); // -0.003, within +/-0.02 cap
    expect(r.storeForecast).toBeCloseTo(r.level + r.dampedMomentum, 10);
    expect(r.reviewFlag).toBe(false); // |rawMomentum| = 0.03 < 0.05 threshold
  });

  it('caps damped Momentum at +/-0.02 when the raw swing is large, and sets reviewFlag when |rawMomentum| > 0.05', () => {
    const weekly = [0, 0, 0, 0, 0.00, 0.50].map(pct => ({ pct }));
    const r = computeStoreForecast(weekly);
    const rawMomentum = ((0.00 + 0.50) / 2) - ((0 + 0 + 0 + 0) / 4); // 0.25
    expect(r.rawMomentum).toBeCloseTo(rawMomentum, 10);
    expect(r.dampedMomentum).toBeCloseTo(0.02, 10); // 0.25*0.10=0.025, clamped to the +0.02 cap
    expect(r.level).toBeCloseTo((0 + 0 + 0 + 0 + 0 + 0.50) / 6, 10);
    expect(r.storeForecast).toBeCloseTo(r.level + 0.02, 10);
    expect(r.reviewFlag).toBe(true); // |0.25| > 0.05
  });

  it('caps the NEGATIVE side symmetrically', () => {
    const weekly = [0, 0, 0, 0, 0.00, -0.50].map(pct => ({ pct }));
    const r = computeStoreForecast(weekly);
    expect(r.dampedMomentum).toBeCloseTo(-0.02, 10);
    expect(r.reviewFlag).toBe(true);
  });

  it('reports Level with zero Momentum (not a refusal) when custom params need more weeks for Momentum than Level has', () => {
    const weekly = [0.02, 0.01, 0.00, -0.01, -0.02, -0.03].map(pct => ({ pct })); // exactly 6
    const params = { ...OWNER_FORECAST_PARAMS, momentumRecentWeeks: 3, momentumPriorWeeks: 4 }; // needs 7, only has 6
    const r = computeStoreForecast(weekly, params);
    expect(r.level).not.toBeNull();
    expect(r.rawMomentum).toBeNull();
    expect(r.dampedMomentum).toBe(0);
    expect(r.storeForecast).toBe(r.level);
    expect(r.reviewFlag).toBe(false);
  });
});

describe('applyFleetShrinkage — pulls each store 15% toward the fleet average of storeForecast', () => {
  it('matches the workbook formula: shrinkAdj = (fleetAvgLevel - storeForecast) * 0.15, forecastComp = storeForecast + shrinkAdj', () => {
    const raw = {
      A: { storeForecast: -0.02 },
      B: { storeForecast: 0.02 },
      C: { storeForecast: 0.00 },
    };
    const out = applyFleetShrinkage(raw);
    const fleetAvg = (-0.02 + 0.02 + 0.00) / 3; // 0
    expect(out.A.fleetAvgLevel).toBeCloseTo(fleetAvg, 10);
    expect(out.A.shrinkAdj).toBeCloseTo((fleetAvg - -0.02) * 0.15, 10); // 0.003
    expect(out.A.forecastComp).toBeCloseTo(-0.02 + (fleetAvg - -0.02) * 0.15, 10);
    expect(out.B.shrinkAdj).toBeCloseTo((fleetAvg - 0.02) * 0.15, 10); // -0.003
    expect(out.C.shrinkAdj).toBeCloseTo((fleetAvg - 0.00) * 0.15, 10); // 0
  });

  it('passes through a store with no storeForecast (null, from computeStoreForecast) unchanged, and excludes it from the fleet average', () => {
    const raw = { A: { storeForecast: 0.10 }, B: null };
    const out = applyFleetShrinkage(raw);
    expect(out.B).toBeNull();
    expect(out.A.fleetAvgLevel).toBeCloseTo(0.10, 10); // B excluded, not treated as 0
  });
});

describe('monthActualSales — Sigma actual sales for one calendar month (the LY leg of LY*(1+comp))', () => {
  it('sums the auto-first sales series across every day in the month, nothing else', () => {
    const ds = {
      loaded: true,
      laborRows: [
        { loc: LOC, date: new Date('2025-10-05T00:00:00'), sales: 10000 },
        { loc: LOC, date: new Date('2025-10-12T00:00:00'), sales: 11000 },
        { loc: LOC, date: new Date('2025-11-02T00:00:00'), sales: 99999 }, // outside October — must not leak in
      ],
    };
    expect(monthActualSales(ds, LOC, 2025, 10)).toBe(10000 + 11000);
  });

  it('returns 0 for a store/month with no data at all (never null, never a crash)', () => {
    expect(monthActualSales({ loaded: true }, LOC, 2025, 10)).toBe(0);
  });
});

describe('weeklyCompSeries + computeOwnerSalesForecast — end to end against matched-day cloud data', () => {
  // Build 13 trailing weeks (oldest -> newest) of CURRENT + LY (364 days earlier) daily rows
  // for one store, using the SAME week-boundary helper the engine itself uses, so the fixture
  // and the code under test agree on what "week -1" means without re-deriving it by hand.
  function buildWeeklyRows(loc, asOf, weekCompPcts, baseLy = 10000) {
    const curWeekStart = weekStartOf(asOf);
    const rows = [];
    weekCompPcts.forEach((pct, idx) => {
      const i = weekCompPcts.length - idx; // oldest first -> i counts down from N to 1
      const wkStart = addD(curWeekStart, -7 * i);
      for (let d = 0; d < 7; d++) {
        const curDate = addD(wkStart, d);
        const lyDate = addD(curDate, -364);
        const lySales = baseLy;
        const curSales = baseLy * (1 + pct);
        rows.push({ loc, date: curDate, sales: curSales });
        rows.push({ loc, date: lyDate, sales: lySales });
      }
    });
    return rows;
  }

  it('reconstructs the exact weekly comp% fed in, via matched-day vs-LY, for a store with full history', () => {
    const asOf = new Date('2026-11-01T00:00:00');
    const pcts = [0.02, 0.01, 0.00, -0.01, -0.02, -0.03, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00];
    const ds = { loaded: true, laborRows: buildWeeklyRows(LOC, asOf, pcts) };
    const weekly = weeklyCompSeries(ds, LOC, asOf, 13);
    expect(weekly).toHaveLength(13);
    weekly.forEach((w, i) => expect(w.pct).toBeCloseTo(pcts[i], 6));
  });

  it('computeOwnerSalesForecast: two comp-store fleet, full chain to a forecast dollar figure', () => {
    const asOf = new Date('2026-11-01T00:00:00');
    // Store A: flat then a real -6% dip the last two weeks (crosses the 0.05 REVIEW threshold).
    const pctsA = [0, 0, 0, 0, -0.06, -0.06];
    // Store B: flat throughout — the "nothing to see here" case most stores land in.
    const pctsB = [0, 0, 0, 0, 0, 0];
    const rowsA = buildWeeklyRows('A', asOf, pctsA, 10000);
    const rowsB = buildWeeklyRows('B', asOf, pctsB, 20000);
    // LY sales for the TARGET month (Nov 2025) — independent of the weekly comp fixture above.
    const lyMonthRows = [
      { loc: 'A', date: new Date('2025-11-10T00:00:00'), sales: 300000 },
      { loc: 'B', date: new Date('2025-11-10T00:00:00'), sales: 600000 },
    ];
    const ds = { loaded: true, laborRows: [...rowsA, ...rowsB, ...lyMonthRows] };
    const out = computeOwnerSalesForecast(ds, ['A', 'B'], 2026, 11, asOf);

    expect(out.A.lySales).toBe(300000);
    expect(out.B.lySales).toBe(600000);
    // A's raw momentum is a real dip -> flagged; B is flat -> not flagged.
    expect(out.A.reviewFlag).toBe(true);
    expect(out.B.reviewFlag).toBe(false);
    // forecastSales = lySales * (1 + forecastComp) for both, and A's forecast is below LY
    // (negative comp) while B's sits very close to flat (small shrink-only adjustment).
    expect(out.A.forecastSales).toBeCloseTo(300000 * (1 + out.A.forecastComp), 6);
    expect(out.B.forecastSales).toBeCloseTo(600000 * (1 + out.B.forecastComp), 6);
    expect(out.A.forecastSales).toBeLessThan(300000);
  });

  it('forecastSales is null when a store has no LY sales for the target month, even with a full comp history', () => {
    const asOf = new Date('2026-11-01T00:00:00');
    const rows = buildWeeklyRows(LOC, asOf, [0, 0, 0, 0, 0, 0], 10000);
    const ds = { loaded: true, laborRows: rows }; // no 2025-11 rows at all for this store
    const out = computeOwnerSalesForecast(ds, [LOC], 2026, 11, asOf);
    expect(out[LOC].lySales).toBe(0);
    expect(out[LOC].forecastSales).toBeNull();
    expect(out[LOC].forecastComp).not.toBeNull(); // the comp model itself still resolved
  });

  it('forecastComp (and forecastSales) stay null for a brand-new store with no comp history at all', () => {
    const asOf = new Date('2026-11-01T00:00:00');
    const ds = { loaded: true, laborRows: [{ loc: 'NEW', date: new Date('2025-11-10T00:00:00'), sales: 50000 }] };
    const out = computeOwnerSalesForecast(ds, ['NEW'], 2026, 11, asOf);
    expect(out.NEW.forecastComp).toBeUndefined();
    expect(out.NEW.forecastSales).toBeNull();
    expect(out.NEW.lySales).toBe(50000); // the LY leg still resolves independently
  });
});
