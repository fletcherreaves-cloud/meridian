import { describe, it, expect } from 'vitest';
import { wAvgLaborPct, wAvgTPMH } from '../views/scheduling.js';

// A light Saturday and a heavy weekday. The plain mean of the two labor percentages
// is 25.0%, but the district actually spent 2400+2000 = $4400 of labor on $22,000 of
// sales = 20.0%. That 5-point gap is the bug this replaces.
const ROWS = [
  { loc: '1', sales: 2000,  laborPct: 30, tcs: 200,  tpmh: 4 },   // labor $600
  { loc: '1', sales: 20000, laborPct: 19, tcs: 2000, tpmh: 10 },  // labor $3800
];

describe('wAvgLaborPct', () => {
  it('weights by sales instead of averaging percentages', () => {
    // (30*2000 + 19*20000) / 22000 = 440000/22000 = 20
    expect(wAvgLaborPct(ROWS)).toBeCloseTo(20, 6);
  });

  it('differs from the naive mean — the whole point of the fix', () => {
    const naive = (30 + 19) / 2;
    expect(naive).toBe(24.5);
    expect(wAvgLaborPct(ROWS)).not.toBeCloseTo(naive, 1);
  });

  it('equals the simple mean when every day has identical sales', () => {
    const even = [
      { sales: 5000, laborPct: 20 },
      { sales: 5000, laborPct: 30 },
    ];
    expect(wAvgLaborPct(even)).toBeCloseTo(25, 6);
  });

  it('falls back to the plain mean when no row has sales yet', () => {
    // Forward-looking schedule: percentages exist, actual sales do not.
    const future = [{ sales: 0, laborPct: 22 }, { sales: 0, laborPct: 26 }];
    expect(wAvgLaborPct(future)).toBeCloseTo(24, 6);
  });

  it('ignores zero/blank rows rather than dragging the average to 0', () => {
    const mixed = [{ sales: 10000, laborPct: 20 }, { sales: 0, laborPct: 0 }];
    expect(wAvgLaborPct(mixed)).toBeCloseTo(20, 6);
  });

  it('returns 0 for empty or missing input instead of NaN', () => {
    expect(wAvgLaborPct([])).toBe(0);
    expect(wAvgLaborPct(null)).toBe(0);
    expect(wAvgLaborPct(undefined)).toBe(0);
  });
});

describe('wAvgTPMH', () => {
  it('aggregates as total transactions over total hours', () => {
    // hours recovered per row: 200/4 = 50, 2000/10 = 200 → 2200/250 = 8.8
    expect(wAvgTPMH(ROWS)).toBeCloseTo(8.8, 6);
  });

  it('differs from the naive mean of ratios', () => {
    const naive = (4 + 10) / 2; // 7
    expect(wAvgTPMH(ROWS)).not.toBeCloseTo(naive, 1);
  });

  it('recovers hours from each row own ratio, so a uniform rate round-trips', () => {
    const uniform = [
      { tcs: 100, tpmh: 5 },
      { tcs: 900, tpmh: 5 },
    ];
    expect(wAvgTPMH(uniform)).toBeCloseTo(5, 6);
  });

  it('falls back to the plain mean when transaction counts are absent', () => {
    const noTcs = [{ tcs: 0, tpmh: 6 }, { tcs: 0, tpmh: 8 }];
    expect(wAvgTPMH(noTcs)).toBeCloseTo(7, 6);
  });

  it('never divides by zero on empty or malformed input', () => {
    expect(wAvgTPMH([])).toBe(0);
    expect(wAvgTPMH(null)).toBe(0);
    expect(wAvgTPMH([{ tcs: 0, tpmh: 0 }])).toBe(0);
  });
});
