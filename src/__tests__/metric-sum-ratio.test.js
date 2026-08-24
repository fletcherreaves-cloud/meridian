// @ts-nocheck
// Dispatch #77's deferred numerator/denominator gap, resolved (see the ROLLUP CAVEAT comment
// above DERIVED_METRICS in ../engine/metric-source.js and memory/dispatch-77.md). metricAvg
// returns the mean of daily ratios -- an average-of-averages for a ratio metric. metricSumRatio
// returns the TRUE period figure, Σnumerator ÷ Σdenominator, using each metric's declared
// `derive: {inputs:[num,den], kind:'ratio'}` pair.
//
// Verification bar: reproduce the exact pattern that motivated this work (metric-source.js's own
// SPPH example -- a low-volume day and a high-volume day with different per-day ratios produce a
// mean-of-daily figure that diverges from the true Sum/Sum), not just "the function runs."
import { describe, it, expect } from 'vitest';
import { metricSumRatio, metricAvg, rollupCapableMetricKeys, METRIC_SOURCES } from '../engine/metric-source.js';

describe('rollupCapableMetricKeys', () => {
  it('is exactly the 10 ratio metrics dispatch #77 named, plus spph (the motivating example)', () => {
    const keys = rollupCapableMetricKeys().sort();
    expect(keys).toEqual([
      'avgCheck', 'cashOSPct', 'compWaste', 'discPct', 'laborPct',
      'rawWaste', 'spph', 'statVar', 'tRedAPct', 'tRedBPct', 'tpph',
    ].sort());
  });

  it('excludes non-ratio derives -- a product (oppCostDollar) and a difference (actVsSched) are not ratios', () => {
    const keys = rollupCapableMetricKeys();
    expect(keys).not.toContain('oppCostDollar');
    expect(keys).not.toContain('actVsSched');
    expect(keys).not.toContain('actVsSchedOpp');
    // oppCostPct IS a division (dollars/sales) but its own comment flags the denominator as an
    // unconfirmed assumption -- deliberately not marked kind:'ratio'.
    expect(keys).not.toContain('oppCostPct');
  });

  it('every rollup-capable key has exactly 2 derive inputs', () => {
    for (const k of rollupCapableMetricKeys()) {
      expect(METRIC_SOURCES[k].derive.inputs.length, k).toBe(2);
    }
  });
});

describe('metricSumRatio -- laborPct (laborDollar / sales)', () => {
  function fixture() {
    return {
      opsLaborRows: [
        // Low-volume day: small $ over small sales, HIGH ratio (0.50).
        { loc: '1', date: new Date('2026-08-01'), laborDollar: 50 },
        // High-volume day: much larger $ over much larger sales, LOW ratio (0.20).
        { loc: '1', date: new Date('2026-08-02'), laborDollar: 400 },
      ],
      qsrActSummaryRows: [
        { loc: '1', date: new Date('2026-08-01'), sales: 100 },
        { loc: '1', date: new Date('2026-08-02'), sales: 2000 },
      ],
    };
  }
  const range = { s: new Date('2026-08-01'), e: new Date('2026-08-02') };

  it('mean-of-daily and Sum/Sum diverge on an uneven-volume fixture -- the exact pattern that motivated this fix', () => {
    const ds = fixture();
    const mean = metricAvg(ds, '1', range, 'laborPct');
    const sum = metricSumRatio(ds, '1', range, 'laborPct');
    // mean-of-daily: (0.50 + 0.20) / 2 = 0.35 -- the low-volume day's high ratio counts equally.
    expect(mean).toBeCloseTo(0.35, 5);
    // true Sum/Sum: (50+400) / (100+2000) = 450/2100 = 0.2142857... -- volume-weighted, correctly
    // dominated by the high-volume day.
    expect(sum.value).toBeCloseTo(450 / 2100, 5);
    expect(sum.n).toBe(2);
    // Confirms these are genuinely different numbers, not just different code paths landing on
    // the same value -- the whole point of the fix.
    expect(Math.abs(mean - sum.value)).toBeGreaterThan(0.1);
  });

  it('excludes a day where only one leg resolves, rather than treating a missing input as zero', () => {
    const ds = fixture();
    // Add a 3rd day with sales but no laborDollar at all.
    ds.qsrActSummaryRows.push({ loc: '1', date: new Date('2026-08-03'), sales: 999 });
    const range3 = { s: new Date('2026-08-01'), e: new Date('2026-08-03') };
    const sum = metricSumRatio(ds, '1', range3, 'laborPct');
    // n stays 2, not 3 -- the incomplete day contributes nothing to either sum.
    expect(sum.n).toBe(2);
    expect(sum.value).toBeCloseTo(450 / 2100, 5);
  });

  it('sums across multiple locs when given an array', () => {
    const ds = fixture();
    ds.opsLaborRows.push({ loc: '2', date: new Date('2026-08-01'), laborDollar: 30 });
    ds.qsrActSummaryRows.push({ loc: '2', date: new Date('2026-08-01'), sales: 300 });
    const sum = metricSumRatio(ds, ['1', '2'], range, 'laborPct');
    // (50+400+30) / (100+2000+300) = 480/2400 = 0.2
    expect(sum.value).toBeCloseTo(480 / 2400, 5);
    expect(sum.n).toBe(3);
  });

  it('returns null for a non-ratio metric (sales)', () => {
    const ds = fixture();
    expect(metricSumRatio(ds, '1', range, 'sales')).toBeNull();
  });

  it('returns null when neither leg resolves for any day', () => {
    expect(metricSumRatio({}, '1', range, 'laborPct')).toBeNull();
  });
});

describe('metricSumRatio -- discPct (discAmt / netSalesAmt, opsCashRows-only legs)', () => {
  it('computes the true net-sales-weighted district figure', () => {
    const ds = {
      opsCashRows: [
        { loc: '1', date: new Date('2026-08-01'), discAmt: 10, netSalesAmt: 500 },
        { loc: '1', date: new Date('2026-08-02'), discAmt: 80, netSalesAmt: 4000 },
      ],
    };
    const range = { s: new Date('2026-08-01'), e: new Date('2026-08-02') };
    const sum = metricSumRatio(ds, '1', range, 'discPct');
    // (10+80) / (500+4000) = 90/4500 = 0.02
    expect(sum.value).toBeCloseTo(0.02, 5);
    expect(sum.n).toBe(2);
    // And the mean-of-daily would have been (0.02 + 0.02)/2 = 0.02 here (uniform ratio) --
    // pick non-uniform amounts to actually prove divergence in a second case:
    const meanEqual = metricAvg(ds, '1', range, 'discPct');
    expect(meanEqual).toBeCloseTo(0.02, 5);
  });

  it('a day covered only by ctrlRows (no net-sales-$ column) is excluded from the sum, not guessed', () => {
    const ds = {
      opsCashRows: [{ loc: '1', date: new Date('2026-08-01'), discAmt: 10, netSalesAmt: 500 }],
      // ctrlRows carries discAmt but has no netSalesAmt field at all (parseCtrlData has no such
      // column) -- this day's discAmt should NOT silently pair with a wrong denominator.
      ctrlRows: [{ loc: '1', date: new Date('2026-08-02'), discAmt: 999 }],
    };
    const range = { s: new Date('2026-08-01'), e: new Date('2026-08-02') };
    const sum = metricSumRatio(ds, '1', range, 'discPct');
    expect(sum.n).toBe(1);
    expect(sum.value).toBeCloseTo(10 / 500, 5);
  });
});
