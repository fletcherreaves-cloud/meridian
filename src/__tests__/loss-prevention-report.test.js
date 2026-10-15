// @ts-nocheck
// Reports redesign Phase 2 -- the first report built on the new shell, reusing exactly the 16
// metric-source.js keys Phase 1 just gave a real, agreed direction to.
import { describe, it, expect } from 'vitest';
import { buildLossPreventionReport, LOSS_PREVENTION_METRICS } from '../engine/loss-prevention-report.js';

const d = n => new Date(2026, 9, n);
const GOOD = '3708', OTHER = '5183';

describe('buildLossPreventionReport', () => {
  it('returns [] when no range has been selected -- a report with no criteria run, not an error', () => {
    expect(buildLossPreventionReport({}, { locs: [GOOD] })).toEqual([]);
  });

  it('one row per requested loc, with every metric resolved for that loc over the range', () => {
    const ds = {
      opsCashRows: [
        { loc: GOOD, date: d(2), discPct: 0.021, discAmt: 42, discCnt: 3 },
        { loc: OTHER, date: d(2), discPct: 0.011, discAmt: 11, discCnt: 1 },
      ],
    };
    const rows = buildLossPreventionReport(ds, { locs: [GOOD, OTHER], range: { s: '2026-10-01', e: '2026-10-10' } });
    expect(rows).toHaveLength(2);
    const good = rows.find(r => r.loc === GOOD);
    expect(good.discAmt).toBe(42);
    expect(good.discCnt).toBe(3);
    expect(good.discPct).toBeCloseTo(0.021, 6);
    const other = rows.find(r => r.loc === OTHER);
    expect(other.discAmt).toBe(11);
  });

  it('sums a count/$ metric across multiple days in the range, rather than averaging it', () => {
    const ds = {
      opsCashRows: [
        { loc: GOOD, date: d(1), discAmt: 10, discCnt: 1 },
        { loc: GOOD, date: d(2), discAmt: 20, discCnt: 2 },
      ],
    };
    const rows = buildLossPreventionReport(ds, { locs: [GOOD], range: { s: '2026-10-01', e: '2026-10-10' } });
    expect(rows[0].discAmt).toBe(30);
    expect(rows[0].discCnt).toBe(3);
  });

  it('a store with no matching rows still gets a row, with null (not fabricated zero) metrics', () => {
    const rows = buildLossPreventionReport({ opsCashRows: [] }, { locs: [GOOD], range: { s: '2026-10-01', e: '2026-10-10' } });
    expect(rows).toHaveLength(1);
    for (const m of LOSS_PREVENTION_METRICS) expect(rows[0][m.key]).toBeNull();
  });

  it('falls back to ds.storeIds when no locs are given (an "AllStores" run)', () => {
    const ds = { storeIds: [GOOD, OTHER], opsCashRows: [] };
    const rows = buildLossPreventionReport(ds, { locs: [], range: { s: '2026-10-01', e: '2026-10-10' } });
    expect(rows.map(r => r.loc).sort()).toEqual([GOOD, OTHER]);
  });

  it('covers all 16 of the Phase-1 direction-fixed loss-prevention metrics, not a subset', () => {
    expect(LOSS_PREVENTION_METRICS.map(m => m.key).sort()).toEqual([
      'cashOSAmt', 'cashOSPct', 'cashRefAmt', 'cashRefCnt', 'cashlessRefAmt', 'cashlessRefCnt',
      'discAmt', 'discCnt', 'discPct', 'drawerOpens', 'manualRefAmt', 'posOverAmt', 'posOverCnt',
      'promoAmt', 'promoCnt', 'promoPct', 'tRedACnt', 'tRedAPct', 'tRedBCnt', 'tRedBPct',
    ]);
  });
});
