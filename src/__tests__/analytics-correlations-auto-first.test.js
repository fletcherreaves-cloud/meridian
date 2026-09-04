// @vitest-environment happy-dom
// @ts-nocheck
// analytics.js's computeAllCorrelations/computeMetricAverages (DistrictLensPanel, the "Metric
// Correlation Explorer") used to join RAW ds.laborRows/opsRows/ctrlRows rows by date --
// manual-upload-only. loadQsrVarianceStat-style auto/cloud streams (qsrActSummaryRows,
// glimpseRows, DAR) were never read at all, so on any store/day where only the auto stream had
// data, the correlation explorer went blank (notes-61 measured labor_rows 16 days stale while
// every auto stream was current -- same signature #2 data-integrity class as several other
// dispatches this repo has already fixed). Fixed to source via metric-source.js's metricSeries
// (auto-first per metric), same as computeMetricAverages had already been fixed to do.
//
// Per "would this verification still pass if reverted?": these fixtures carry ONLY an auto
// stream (qsrActSummaryRows / qsrFobRows) and explicitly NO ds.laborRows/opsRows/ctrlRows at
// all -- under the old code `joined` would always be empty ([]), so a revert fails this.
import { describe, it, expect } from 'vitest';
import { computeAllCorrelations, computeMetricAverages } from '../views/analytics.js';

const d = s => new Date(s + 'T00:00:00');
const LOC = '3708'; // Ardmore-Broadway, real STORE_NAMES entry

// A clear negative relationship: slower drive-thru (higher OEPE) tracks lower sales.
const DAYS = [
  ['2026-08-01', 180, 8000], ['2026-08-02', 150, 9000], ['2026-08-03', 200, 7000],
  ['2026-08-04', 160, 8800], ['2026-08-05', 140, 9500], ['2026-08-06', 220, 6500],
  ['2026-08-07', 170, 8200], ['2026-08-08', 190, 7500], ['2026-08-09', 155, 9100],
  ['2026-08-10', 210, 6800], ['2026-08-11', 145, 9300], ['2026-08-12', 175, 8000],
];
const qsrActSummaryRows = DAYS.map(([date, oepe, sales]) => ({ loc: LOC, date: d(date), oepe, sales, gc: Math.round(sales / 10) }));

describe('computeAllCorrelations -- auto-first sourcing', () => {
  it('computes a real correlation from an auto-only stream (no laborRows/opsRows/ctrlRows at all)', () => {
    const ds = { loaded: true, qsrActSummaryRows };
    const result = computeAllCorrelations(ds);
    const row = (result[LOC]?.sales || []).find(c => c.id === 'oepe');
    expect(row, 'oepe correlation vs sales not found for ' + LOC).toBeTruthy();
    expect(row.n).toBe(12);
    // Strong negative: slower service tracks lower sales, matching the fixture's construction.
    expect(row.r).toBeLessThan(-0.5);
    expect(row.sig).toBeTruthy();
  });

  it('returns [] (not a crash) for a store with no data at all', () => {
    const ds = { loaded: true, qsrActSummaryRows };
    const result = computeAllCorrelations(ds);
    expect(result['9999999']?.sales ?? []).toEqual([]);
  });

  it('returns {} when ds is not loaded', () => {
    expect(computeAllCorrelations({ loaded: false })).toEqual({});
    expect(computeAllCorrelations(null)).toEqual({});
  });
});

describe('computeMetricAverages -- auto-first sourcing', () => {
  it('resolves a predictor average from an auto-only stream', () => {
    const ds = { loaded: true, qsrActSummaryRows };
    const result = computeMetricAverages(ds);
    const expectedMean = DAYS.reduce((s, [, oepe]) => s + oepe, 0) / DAYS.length;
    expect(result[LOC].oepe).toBeCloseTo(expectedMean, 1);
  });

  it('fobPct now resolves (was always null -- PREDICTOR_METRIC_KEY had no fobPct entry until this fix)', () => {
    // fobPct derives from fobTotalAmt (sum of 6 components) / prodSalesAmt, all sourced from
    // qsrFobRows (metric-source.js).
    const qsrFobRows = [{
      loc: LOC, date: d('2026-08-15'),
      compWasteAmt: 400, rawWasteAmt: 300, condimentsAmt: 200, empMgrMealsAmt: 100, statVarianceAmt: 300, unexplainedAmt: 100, // sums to 1400
      prodSalesAmt: 40000, // fobPct = 1400/40000 = 3.5%
    }];
    const ds = { loaded: true, qsrFobRows };
    const result = computeMetricAverages(ds);
    expect(result[LOC].fobPct).toBeCloseTo(0.035, 4);
  });
});
