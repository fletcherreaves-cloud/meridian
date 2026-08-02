import { describe, it, expect } from 'vitest';
import { latestVarianceByWrin, mergeVariance } from '../engine/eom-variance-raw.js';

describe('latestVarianceByWrin', () => {
  const rawItems = [{
    wrin: '1001', descr: 'Beef', cls: 'food', history: [
      { dt: '2026-07-20', tm: '10:00', isCount: true, difference: -50, variance: -10 },
      { dt: '2026-07-30', tm: '22:15', isCount: true, difference: -180, variance: -35 }, // latest count
      { dt: '2026-07-31', tm: '06:00', isCount: false, difference: 0 },                  // not a count
    ],
  }];
  it('takes the LATEST count event ≤ asOf (immediate raw variance)', () => {
    const m = latestVarianceByWrin(rawItems, { asOf: new Date('2026-07-31T12:00:00') });
    expect(m['1001'].dolDiff).toBe(-180);
    expect(m['1001'].variance).toBe(-35);
    expect(m['1001'].lastCounted).toBe('2026-07-30');
  });
  it('respects the asOf cutoff — an earlier asOf returns the earlier count', () => {
    const m = latestVarianceByWrin(rawItems, { asOf: new Date('2026-07-25T00:00:00') });
    expect(m['1001'].dolDiff).toBe(-50);
    expect(m['1001'].lastCounted).toBe('2026-07-20');
  });
  it('parses MM/DD/YYYY ledger dates (the real qsr_raw_item_detail format) — not just ISO', () => {
    // Regression: Date.parse("07/30/2026T22:15") is NaN, which silently dropped every count and zeroed
    // out the raw-source variance (forcing the lagging-aggregate fallback everywhere it was used).
    const us = [{ wrin: 'x', history: [
      { dt: '07/20/2026', tm: '10:00:00', isCount: true, difference: -50, variance: -10 },
      { dt: '07/30/2026', tm: '22:15:11', isCount: true, difference: -180, variance: -35 },
    ] }];
    const m = latestVarianceByWrin(us, { asOf: new Date('2026-07-31T12:00:00') });
    expect(m['x'].dolDiff).toBe(-180);
    expect(m['x'].lastCounted).toBe('07/30/2026');
    // and the asOf cutoff still works with US dates
    expect(latestVarianceByWrin(us, { asOf: new Date('2026-07-25T00:00:00') })['x'].dolDiff).toBe(-50);
  });
});

describe('mergeVariance', () => {
  it('prefers the raw count value, falls back to the aggregate', () => {
    const base = { a: { dolDiff: 0, variance: 0 }, b: { dolDiff: -12, variance: -2 } };  // aggregate ($0 for a = lagged)
    const raw = { a: { dolDiff: -622, variance: -120 } };                                // raw has a's real value
    const merged = mergeVariance(base, raw);
    expect(merged.a.dolDiff).toBe(-622);      // raw wins
    expect(merged.a.source).toBe('raw');
    expect(merged.b.dolDiff).toBe(-12);       // aggregate fallback
    expect(merged.b.source).toBe('aggregate');
  });
});
