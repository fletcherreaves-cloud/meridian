import { describe, it, expect } from 'vitest';
import { monthlyLaborSummary, monthlyLaborExtended } from '../engine/insights.js';

// v4.932 — data-integrity sweep signature #5: laborPct/tpph used to divide by a shared `sales`
// denominator that included every day with real sales, even days whose laborPct/tpph was
// missing (e.g. controls not synced that day) — a missing metric contributed a 0 numerator while
// its full sales still counted in the denominator, silently skewing the sales-weighted monthly
// average toward zero. Fixed with a per-metric coverage-weighted denominator.
const day = (d, sales, laborPct, tpph, otHrs = 0) => ({ loc: '3708', date: d, sales, laborPct, tpph, otHrs });

describe('monthlyLaborSummary — coverage-weighted averages', () => {
  it('a day with real sales but missing laborPct/tpph does not drag the average toward zero', () => {
    const rows = [
      day('2026-06-01', 10000, 0.30, 5),
      day('2026-06-02', 10000, 0.30, 5),
      day('2026-06-03', 10000, null, null), // controls not synced this day — sales still real
    ];
    const [m] = monthlyLaborSummary(rows);
    expect(m.laborPct).toBeCloseTo(0.30, 5); // NOT 0.20 (which a shared-denominator bug would produce)
    expect(m.tpph).toBeCloseTo(5, 5);
    expect(m.sales).toBe(30000); // the sales total itself is unaffected — every day's sales still counts
  });

  it('a month with zero coverage for a metric returns null, not 0', () => {
    const rows = [day('2026-06-01', 10000, null, null)];
    const [m] = monthlyLaborSummary(rows);
    expect(m.laborPct).toBeNull();
    expect(m.tpph).toBeNull();
  });

  it('a genuine laborPct of 0 is not treated as missing (uses !=null, not truthiness)', () => {
    const rows = [day('2026-06-01', 10000, 0, 5), day('2026-06-02', 10000, 0.20, 5)];
    const [m] = monthlyLaborSummary(rows);
    expect(m.laborPct).toBeCloseTo(0.10, 5); // (0*10000 + 0.20*10000)/20000, both days counted
  });
});

describe('monthlyLaborExtended — same fix, plus avgCheck/avgRate stay correct', () => {
  it('missing laborPct/tpph on one day does not skew the average, avgCheck/avgRate unaffected', () => {
    const rows = [
      { loc: '3708', date: '2026-06-01', sales: 10000, laborPct: 0.28, tpph: 6, otHrs: 0, avgCheck: 8, avgRate: 14 },
      { loc: '3708', date: '2026-06-02', sales: 10000, laborPct: null, tpph: null, otHrs: 0, avgCheck: 9, avgRate: 15 },
    ];
    const [m] = monthlyLaborExtended(rows);
    expect(m.laborPct).toBeCloseTo(0.28, 5);
    expect(m.tpph).toBeCloseTo(6, 5);
    expect(m.avgCheck).toBeCloseTo(8.5, 5); // unaffected — already correctly averaged by count
    expect(m.avgRate).toBeCloseTo(14.5, 5);
  });
});
