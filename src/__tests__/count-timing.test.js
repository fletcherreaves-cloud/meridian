import { describe, it, expect } from 'vitest';
import { daysSinceLastCount, countTimingArtifact } from '../engine/count-timing.js';

const cnt = (dt) => ({ isCount: true, dt, source: 'inventory' });

describe('daysSinceLastCount', () => {
  it('measures days from the last prior count to the as-of date (Durant 07/29 → 08/01 = 3)', () => {
    const hist = [cnt('07/28/2026'), cnt('07/29/2026'), { source: 'pos_open', dt: '08/01/2026' }];
    expect(daysSinceLastCount(hist, '08/01/2026')).toBe(3);
  });
  it('handles ISO dates and returns null with no prior count', () => {
    expect(daysSinceLastCount([cnt('2026-07-25')], '2026-07-30')).toBe(5);
    expect(daysSinceLastCount([cnt('2026-08-05')], '2026-08-01')).toBeNull();   // only a later count
    expect(daysSinceLastCount([], '2026-08-01')).toBeNull();
  });
});

describe('countTimingArtifact', () => {
  it('flags the Durant case: day 1 of the period + 3 days of drift = artifact', () => {
    const r = countTimingArtifact({ daysSinceCount: 3, periodElapsed: 1, periodLength: 31, dollars: 201 });
    expect(r.isArtifact).toBe(true);
    expect(r.confidence).toBeGreaterThanOrEqual(0.5);
    expect(r.reason).toMatch(/tiny sales denominator/);
    expect(r.reason).toMatch(/3 days of drift/);
    expect(r.reason).toMatch(/\$201/);
  });
  it('does NOT flag a full-period count with a normal window', () => {
    const r = countTimingArtifact({ daysSinceCount: 1, periodElapsed: 28, periodLength: 31, dollars: 700 });
    expect(r.isArtifact).toBe(false);
    expect(r.reason).toBeNull();
  });
  it('mid-period with a long drift window is borderline, not a strong artifact', () => {
    const r = countTimingArtifact({ daysSinceCount: 5, periodElapsed: 20, periodLength: 31, dollars: 300 });
    expect(r.isArtifact).toBe(false);   // denominator is fine by day 20; drift alone isn't enough
    expect(r.confidence).toBeLessThan(0.5);
  });
});
