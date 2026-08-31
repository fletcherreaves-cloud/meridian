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

describe('latestVarianceByWrin — same-day area entries NET, not just the raw latest (2026-08-31 fix)', () => {
  it('McNuggets #32525 real numbers: two area entries the same day net to a small swing, not -$1,988', () => {
    // 08:39:45 (-21,088 units / -$1,941.05) then 09:01:20 (+21,600 units / +$1,988.18), same day, 21min
    // apart -- a normal two-area count. Taking only the raw latest entry read as a -$1,988 loss; netted,
    // it's a +$47.13 move, matching the owner's own worked example (-21,088 + 21,600 = +512 units).
    const rawItems = [{
      wrin: '00407-958', descr: 'Chicken McNuggets', cls: 'food', history: [
        { dt: '08/29/2026', tm: '08:39:45', isCount: true, difference: -1941.05, variance: -21088 },
        { dt: '08/29/2026', tm: '09:01:20', isCount: true, difference: 1988.18, variance: 21600 },
      ],
    }];
    const m = latestVarianceByWrin(rawItems, { asOf: new Date('2026-08-30T00:00:00') });
    expect(m['00407-958'].dolDiff).toBeCloseTo(47.13, 2);
    expect(m['00407-958'].variance).toBe(512);
    expect(m['00407-958'].lastCounted).toBe('08/29/2026');
  });

  it('a genuine later-day recount still only nets against its OWN day, not the earlier day too', () => {
    const rawItems = [{
      wrin: 'x', history: [
        { dt: '2026-07-20', tm: '10:00', isCount: true, difference: -50, variance: -10 },
        { dt: '2026-07-30', tm: '09:00', isCount: true, difference: -100, variance: -20 },
        { dt: '2026-07-30', tm: '22:15', isCount: true, difference: 40, variance: 8 },   // same-day area entry
      ],
    }];
    const m = latestVarianceByWrin(rawItems, { asOf: new Date('2026-07-31T00:00:00') });
    expect(m['x'].dolDiff).toBe(-60);   // -100 + 40, NOT the 07/20 entry
    expect(m['x'].variance).toBe(-12);
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
