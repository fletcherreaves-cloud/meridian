// @ts-nocheck
// [sweep:data-sourcing] weekly self-maintenance sweep (2026-11-17) — targets-vs-actual.js's
// Monthly-tab TPPH row and the whole Yearly tab (TPPH/OEPE/KVS Time/R2P) were reading
// metricAvg directly for ratio-capable metrics, instead of metricRate — the exact completeness-
// artifact bug class dispatches #153/#155/#221 already fixed everywhere else (see those files'
// own tests). crewLaborPct, right next to each of these in the same arrays, already used
// metricSumRatio; tpph/oepe/kvst/r2p just never got the same treatment. Per CLAUDE.md's "would
// this verification still pass if the change were reverted" rule, this exercises the REAL
// CONSUMER (computeTargetsVsActual), not metricRate/metricSumRatio in isolation.
import { describe, it, expect } from 'vitest';
import { computeTargetsVsActual, MONTHLY_TARGET_METRICS, YEARLY_TARGET_METRICS } from '../engine/targets-vs-actual.js';

// Same completeness-artifact fixture shape as dispatch-155-metric-rate-call-sites.test.js: 5
// "complete" days at a plausible rate, plus TODAY as a low-volume in-progress day whose per-
// transaction time reads as implausibly slow/fast purely from being incomplete.
function buildDs(year, month) {
  const now = new Date();
  const mkDay = (i) => ({
    loc: '3708', date: new Date(year, month - 1, i, 12),
    _dtTotal: 50000000, _dtStore: 0, _dtHeldTime: 0, _dtCars: 1000,  // 50s/day complete
    _mfyTime: 40000000, _mfyCnt: 1000,                                // 40s/day complete (kvst)
    _fcServe: 20000000, _fcDrawer: 0, _fcCnt: 500,                    // 40s/day complete (r2p)
    gc: 1000, actHrs: 20,                                             // 50 tpph/day complete
  });
  const todayRow = {
    loc: '3708', date: new Date(year, month - 1, now.getDate(), 12),
    _dtTotal: 20000000, _dtStore: 0, _dtHeldTime: 0, _dtCars: 100,   // 200s -- in-progress artifact
    _mfyTime: 25000000, _mfyCnt: 100,                                 // 250s -- in-progress artifact
    _fcServe: 15000000, _fcDrawer: 0, _fcCnt: 60,                     // 250s -- in-progress artifact
    gc: 100, actHrs: 10,                                              // 10 tpph -- in-progress artifact
  };
  const days = [1, 2, 3, 4, 5].filter(d => d !== now.getDate()).slice(0, 5).map(mkDay);
  return { loaded: true, qsrActSummaryRows: [...days, todayRow] };
}

describe('targets-vs-actual.js Monthly tab: tpph uses the Σ/Σ rollup, not flat mean-of-daily (sweep 2026-11-17)', () => {
  it('diverges from metricAvg when the range covers the current, in-progress month', () => {
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth() + 1;
    const ds = buildDs(y, m);
    const range = { s: new Date(y, m - 1, 1), e: now };
    const row = computeTargetsVsActual(ds, '3708', { which: 'monthly', range, allMonthlyTargets: {} })[0];
    const tpph = row.metrics.find(x => x.key === 'tpph');
    expect(tpph).toBeTruthy();
    // tpph = gc ÷ actHrs. Hand-computed Σ/Σ for 5 complete days (1000gc/20hrs=50tpph) + 1
    // in-progress day (100gc/10hrs=10tpph):
    const sumTpph = (1000 * 5 + 100) / (20 * 5 + 10);
    const meanTpph = (50 * 5 + 10) / 6;
    expect(tpph.actual).toBeCloseTo(sumTpph, 4);
    expect(tpph.actual).not.toBeCloseTo(meanTpph, 1);
  });
});

describe('targets-vs-actual.js Yearly tab: tpph/oepe/kvst/r2p use the Σ/Σ rollup (sweep 2026-11-17)', () => {
  it('oepe and kvst diverge from mean-of-daily over a YTD range including the current month', () => {
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth() + 1;
    const ds = buildDs(y, m);
    const range = { s: new Date(y, m - 1, 1), e: now };
    const row = computeTargetsVsActual(ds, '3708', {
      which: 'yearly', range, targetYear: y, allYearlyTargets: {}, allMonthlyTargets: {},
    })[0];
    const oepe = row.metrics.find(x => x.key === 'yOepe');
    const kvst = row.metrics.find(x => x.key === 'yKvst');
    expect(oepe.actual).not.toBeNull();
    expect(kvst.actual).not.toBeNull();
    // Hand-computed Σ/Σ for the 5 complete days (50s/40s) + 1 in-progress day (200s/250s):
    const sumOepe = (50000000 * 5 + 20000000) / (1000 * 5 + 100) / 1000;
    const sumKvst = (40000000 * 5 + 25000000) / (1000 * 5 + 100) / 1000;
    const meanOepe = (50 * 5 + 200) / 6;
    const meanKvst = (40 * 5 + 250) / 6;
    expect(oepe.actual).toBeCloseTo(sumOepe, 4);
    expect(oepe.actual).not.toBeCloseTo(meanOepe, 1);
    expect(kvst.actual).toBeCloseTo(sumKvst, 4);
    expect(kvst.actual).not.toBeCloseTo(meanKvst, 1);
    // The Σ/Σ figure sits closer to the 5 complete days' real rate than the flat mean does --
    // the in-progress day is weighted by its actual low volume, not averaged in as representative.
    expect(Math.abs(oepe.actual - 50)).toBeLessThan(Math.abs(meanOepe - 50));
    expect(Math.abs(kvst.actual - 40)).toBeLessThan(Math.abs(meanKvst - 40));
  });

  it('yPark stays on metricAvg (no declared ratio legs for park -- not a regression)', () => {
    expect(YEARLY_TARGET_METRICS.find(m => m.key === 'yPark')).toBeTruthy();
  });

  it('all 5 migrated keys are present in their respective arrays (sanity against a broken refactor)', () => {
    expect(MONTHLY_TARGET_METRICS.some(m => m.key === 'tpph')).toBe(true);
    for (const k of ['yTpph', 'yOepe', 'yKvst', 'yR2p']) {
      expect(YEARLY_TARGET_METRICS.some(m => m.key === k)).toBe(true);
    }
  });
});
