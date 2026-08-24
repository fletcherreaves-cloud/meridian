// @ts-nocheck
// Dispatch #77's deferred numerator/denominator gap, resolved. Revert-sensitivity bar for THIS
// specific fix: not just "metricSumRatio computes a different number" (metric-sum-ratio.test.js
// covers that), but that rankPerformers actually SWITCHES which store wins when the true Sum/Sum
// basis reorders two stores that the old mean-of-daily basis had the other way round. Reverting
// rankPerformers to always use mean-of-daily must flip this test's expected order.
import { describe, it, expect } from 'vitest';
import { rankPerformers } from '../engine/top-bottom-performers.js';

// Store A: an uneven-volume week -- one light day, one heavy day. Its DAILY ratios average to
// something better (lower) than its true volume-weighted period figure.
//   mean-of-daily: (0.10 + 0.28) / 2 = 0.19
//   Sum/Sum:       (10 + 280) / (100 + 1000) = 290/1100 = 0.26363...
// Store B: a flat week -- every day the same ratio, so mean-of-daily and Sum/Sum agree exactly.
//   both bases: 0.20
//
// Labor % is lower-better. Under mean-of-daily, A (0.19) beats B (0.20) -- A ranks first.
// Under the true Sum/Sum, A (0.2636) is WORSE than B (0.20) -- B ranks first. The two bases
// disagree about who wins, which is exactly the "can mis-order two close stores" risk
// memory/dispatch-77.md measured and this fix closes.
function fixture() {
  return {
    opsLaborRows: [
      { loc: 'A', date: new Date('2026-08-01'), laborDollar: 10 },
      { loc: 'A', date: new Date('2026-08-02'), laborDollar: 280 },
      { loc: 'B', date: new Date('2026-08-01'), laborDollar: 50 },
      { loc: 'B', date: new Date('2026-08-02'), laborDollar: 50 },
    ],
    qsrActSummaryRows: [
      { loc: 'A', date: new Date('2026-08-01'), sales: 100 },
      { loc: 'A', date: new Date('2026-08-02'), sales: 1000 },
      { loc: 'B', date: new Date('2026-08-01'), sales: 250 },
      { loc: 'B', date: new Date('2026-08-02'), sales: 250 },
    ],
  };
}
const range = { s: new Date('2026-08-01'), e: new Date('2026-08-02') };

describe('rankPerformers -- Sum/Sum rollup for a ratio metric (dispatch #77)', () => {
  it('uses the true Sum/Sum basis when both stores can resolve numerator+denominator, and it flips the winner vs the old mean-of-daily basis', () => {
    const result = rankPerformers({}, { metricKey: 'laborPct', locs: [], range });
    // sanity: with no data there's nothing to rank, direction still resolves.
    expect(result.direction).toBe('lower');

    const full = rankPerformers(fixture(), { metricKey: 'laborPct', locs: ['A', 'B'], range });
    expect(full.rollup).toBe('sum');
    // B wins under Sum/Sum (0.20 < 0.2636) -- the OPPOSITE of what mean-of-daily would say.
    expect(full.rows.map(r => r.loc)).toEqual(['B', 'A']);
    const a = full.rows.find(r => r.loc === 'A');
    const b = full.rows.find(r => r.loc === 'B');
    expect(a.value).toBeCloseTo(290 / 1100, 5);
    expect(b.value).toBeCloseTo(0.20, 5);
  });

  it('falls back to mean-of-daily, uniformly across the whole ranking, when one store cannot resolve Sum/Sum', () => {
    const ds = fixture();
    // Store C has ONLY a precomputed ratio (no opsLaborRows/qsrActSummaryRows legs at all) --
    // e.g. a manual-only Controls upload with no auto-pulled backstop.
    ds.ctrlRows = [
      { loc: 'C', date: new Date('2026-08-01'), laborPct: 0.15 },
      { loc: 'C', date: new Date('2026-08-02'), laborPct: 0.15 },
    ];
    const result = rankPerformers(ds, { metricKey: 'laborPct', locs: ['A', 'B', 'C'], range });
    // Must NOT be 'sum' -- mixing C's daily-average against A/B's period totals would compare
    // two different kinds of number in one ranking, which is worse than being uniformly
    // approximate. The whole ranking falls back to mean-of-daily instead.
    expect(result.rollup).toBe('mean');
    // Under mean-of-daily: C (0.15) < A (0.19) < B (0.20) -- confirms the fallback actually
    // recomputes mean-of-daily for A too (not a stale Sum/Sum value), matching the pre-fix
    // behavior rather than a value-only difference.
    expect(result.rows.map(r => r.loc)).toEqual(['C', 'A', 'B']);
  });

  it('non-ratio metrics (sales) always report rollup:"mean"', () => {
    const ds = { qsrActSummaryRows: [{ loc: 'A', date: new Date('2026-08-01'), sales: 100 }] };
    const result = rankPerformers(ds, { metricKey: 'sales', locs: ['A'], range });
    expect(result.rollup).toBe('mean');
  });
});
