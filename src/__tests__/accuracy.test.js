import { describe, it, expect } from 'vitest';
import {
  isNum, sum, weightedRate, weightedMean, mean,
  pctToFraction, fractionToPct, asFraction, perUnitSeconds, padLoc,
  reconcile, check, audit, checkRowsSumToTotal, checkInRange, checkDateCoverage,
  fetchAllPages,
} from '../lib/accuracy.js';

describe('accuracy — aggregation', () => {
  it('sum skips non-numeric', () => {
    expect(sum([{ a: 2 }, { a: 3 }, { a: null }, { a: 'x' }], r => r.a)).toBe(5);
    expect(sum([])).toBe(0);
  });

  it('weightedRate is Σnum/Σden, never an average of ratios', () => {
    // Two stores: store A 1/1=100% good, store B 0/99=0%. Straight avg = 50%.
    // Correct dollar/count-weighted = 1/100 = 1%.
    const rows = [{ good: 1, total: 1 }, { good: 0, total: 99 }];
    expect(weightedRate(rows, r => r.good, r => r.total)).toBeCloseTo(0.01, 6);
    // contrast with the WRONG way (average of per-row rates):
    const wrong = mean(rows, r => r.good / r.total);
    expect(wrong).toBeCloseTo(0.5, 6);
  });

  it('weightedRate returns null when denominator is 0', () => {
    expect(weightedRate([{ n: 5, d: 0 }], r => r.n, r => r.d)).toBeNull();
    expect(weightedRate([], r => r.n, r => r.d)).toBeNull();
  });

  it('weightedMean dollar-weights a per-store rate (fixes straight-avg FOB)', () => {
    // Store A: 30% FOB on $1,000; Store B: 20% FOB on $9,000.
    // Straight avg = 25%. Dollar-weighted = (0.30*1000 + 0.20*9000)/10000 = 21%.
    const rows = [{ fob: 0.30, sales: 1000 }, { fob: 0.20, sales: 9000 }];
    expect(weightedMean(rows, r => r.fob, r => r.sales)).toBeCloseTo(0.21, 6);
    expect(mean(rows, r => r.fob)).toBeCloseTo(0.25, 6);
  });

  it('weightedMean returns null with no weight', () => {
    expect(weightedMean([{ v: 1, w: 0 }], r => r.v, r => r.w)).toBeNull();
  });
});

describe('accuracy — scale & units', () => {
  it('pct <-> fraction round-trips', () => {
    expect(pctToFraction(25)).toBeCloseTo(0.25, 9);
    expect(fractionToPct(0.25)).toBeCloseTo(25, 9);
    expect(pctToFraction(null)).toBeNull();
  });

  it('asFraction coerces a percent-looking value, leaves a real fraction alone', () => {
    expect(asFraction(0.23, { warn: false })).toBeCloseTo(0.23, 9); // already a fraction
    expect(asFraction(23, { warn: false })).toBeCloseTo(0.23, 9);   // looked like a percent
    expect(asFraction(1, { warn: false })).toBe(1);                 // exactly 1 = 100%, untouched
    expect(asFraction(100, { warn: false })).toBeCloseTo(1, 9);
    expect(asFraction(null, { warn: false })).toBeNull();
  });

  it('perUnitSeconds converts ms sums to per-unit seconds and guards div-by-zero', () => {
    // 480,000 ms across 4 transactions = 120,000 ms each = 120 s.
    expect(perUnitSeconds(480000, 4)).toBeCloseTo(120, 6);
    expect(perUnitSeconds(4_000_000, 4, { from: 'us' })).toBeCloseTo(1, 6);
    expect(perUnitSeconds(100, 0)).toBeNull();
  });

  it('padLoc zero-pads NSN to 7 from number or string', () => {
    expect(padLoc(3708)).toBe('0003708');
    expect(padLoc('3708')).toBe('0003708');
    expect(padLoc('0003708')).toBe('0003708');
    expect(padLoc(null)).toBe('');
  });
});

describe('accuracy — reconciliation', () => {
  it('passes when sources agree within tolerance', () => {
    const r = reconcile({ ledger: 1000, dar: 1005, labor: 998 }, { tolerance: 0.01 });
    expect(r.ok).toBe(true);
  });

  it('fails when a source diverges beyond tolerance and reports the spread', () => {
    const r = reconcile({ ledger: 1000, dar: 1200 }, { tolerance: 0.01 });
    expect(r.ok).toBe(false);
    expect(r.detail).toContain('ledger');
    expect(r.detail).toContain('dar');
  });

  it('absolute tolerance mode', () => {
    expect(reconcile({ a: 100, b: 100.4 }, { tolerance: 0.5, absolute: true }).ok).toBe(true);
    expect(reconcile({ a: 100, b: 101 }, { tolerance: 0.5, absolute: true }).ok).toBe(false);
  });

  it('is a no-op with fewer than two numeric sources', () => {
    expect(reconcile({ a: 100 }).ok).toBe(true);
    expect(reconcile({ a: 100, b: null }).ok).toBe(true);
  });
});

describe('accuracy — report self-audit', () => {
  it('audit passes only when every check passes; ignores falsy entries', () => {
    const good = audit([check('a', true), check('b', true), null, false]);
    expect(good.pass).toBe(true);
    expect(good.total).toBe(2);
    const bad = audit([check('a', true), check('b', false, 'nope')]);
    expect(bad.pass).toBe(false);
    expect(bad.failed).toBe(1);
  });

  it('checkRowsSumToTotal flags a mismatch beyond tolerance', () => {
    const rows = [{ x: 10 }, { x: 20 }, { x: 30 }];
    expect(checkRowsSumToTotal(rows, r => r.x, 60).ok).toBe(true);
    expect(checkRowsSumToTotal(rows, r => r.x, 65).ok).toBe(false);
  });

  it('checkInRange guards percentages', () => {
    expect(checkInRange(50, 0, 100).ok).toBe(true);
    expect(checkInRange(120, 0, 100).ok).toBe(false);
    expect(checkInRange(NaN, 0, 100).ok).toBe(false);
  });

  it('checkDateCoverage detects missing days', () => {
    expect(checkDateCoverage(['2026-01-01', '2026-01-02', '2026-01-03'], '2026-01-01', '2026-01-03').ok).toBe(true);
    const gap = checkDateCoverage(['2026-01-01', '2026-01-03'], '2026-01-01', '2026-01-03');
    expect(gap.ok).toBe(false);
    expect(gap.detail).toContain('2026-01-02');
  });
});

describe('accuracy — pagination', () => {
  it('fetchAllPages pages past the cap until a short page', async () => {
    const total = 2350;
    const all = Array.from({ length: total }, (_, i) => i);
    const fetchPage = async (offset, limit) => all.slice(offset, offset + limit);
    const got = await fetchAllPages(fetchPage, { pageSize: 1000 });
    expect(got.length).toBe(total);
    expect(got[0]).toBe(0);
    expect(got[total - 1]).toBe(total - 1);
  });

  it('fetchAllPages stops on an empty first page', async () => {
    const got = await fetchAllPages(async () => [], { pageSize: 1000 });
    expect(got).toEqual([]);
  });
});

describe('accuracy — helpers', () => {
  it('isNum rejects NaN/Infinity/non-numbers', () => {
    expect(isNum(3)).toBe(true);
    expect(isNum(NaN)).toBe(false);
    expect(isNum(Infinity)).toBe(false);
    expect(isNum('3')).toBe(false);
    expect(isNum(null)).toBe(false);
  });
});
