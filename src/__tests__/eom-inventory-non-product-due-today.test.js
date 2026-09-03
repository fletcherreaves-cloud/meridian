// @ts-nocheck
// eom-inventory.js's nonProductDueToday had zero direct test coverage despite being live:
// called from computeCountProgress (same file), eom-digest.js, and eom-diagnosis.js (2 call
// sites) to decide whether a store's Non-Product count is due today (last calendar day of the
// month) vs. still expected-uncounted ("tmrw") -- the exact off-by-one Notes 38 was filed over.
import { describe, it, expect } from 'vitest';
import { nonProductDueToday } from '../engine/eom-inventory.js';

describe('nonProductDueToday', () => {
  it('is false the day before the last day of the period', () => {
    expect(nonProductDueToday('2026-07', new Date(2026, 6, 30, 9))).toBe(false);
  });

  it('is true ON the last day of the period', () => {
    expect(nonProductDueToday('2026-07', new Date(2026, 6, 31, 9))).toBe(true);
  });

  it('is true once past the last day (early next-month close)', () => {
    expect(nonProductDueToday('2026-07', new Date(2026, 7, 1, 9))).toBe(true);
  });

  it('correctly finds the last day of a non-leap-year February', () => {
    expect(nonProductDueToday('2026-02', new Date(2026, 1, 27, 9))).toBe(false);
    expect(nonProductDueToday('2026-02', new Date(2026, 1, 28, 9))).toBe(true);
  });

  it('ignores the time-of-day component (compares calendar dates only)', () => {
    expect(nonProductDueToday('2026-07', new Date(2026, 6, 31, 23, 59))).toBe(true);
  });

  it('returns false for a falsy period', () => {
    expect(nonProductDueToday(null, new Date())).toBe(false);
    expect(nonProductDueToday('', new Date())).toBe(false);
  });

  it('returns false for an unparseable asOf', () => {
    expect(nonProductDueToday('2026-07', 'not-a-date')).toBe(false);
  });
});
