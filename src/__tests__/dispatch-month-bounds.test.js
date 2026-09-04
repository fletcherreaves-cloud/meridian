// @ts-nocheck
// scripts/lib/month-bounds.mjs -- extracted 2026-09-04 after the SAME bug (hardcoding `${period}-31`
// as a Postgres date-range upper bound) was found independently a third time: once already fixed
// in src/lib/supabase.js (dispatch #365), then reintroduced in scripts/eom-snapshot-pull.mjs (where
// it hard-crashed the scheduled EOM Baseline Snapshot workflow once the active period rolled to
// September 2026, a 30-day month) and scripts/qsrsoft-onhand-pull.mjs (found live-armed, not yet
// triggered). These tests exist so a fourth reintroduction fails here instead of in production.
import { describe, it, expect } from 'vitest';
import { monthEndDate, nextMonthStart } from '../../scripts/lib/month-bounds.mjs';

describe('monthEndDate', () => {
  it('THE TRAP: a 30-day month (September) does not return day 31', () => {
    expect(monthEndDate('2026-09')).toBe('2026-09-30');
  });
  it('a 31-day month returns day 31', () => {
    expect(monthEndDate('2026-08')).toBe('2026-08-31');
  });
  it('April, June, November also have 30 days', () => {
    expect(monthEndDate('2026-04')).toBe('2026-04-30');
    expect(monthEndDate('2026-06')).toBe('2026-06-30');
    expect(monthEndDate('2026-11')).toBe('2026-11-30');
  });
  it('February in a leap year returns the 29th', () => {
    expect(monthEndDate('2028-02')).toBe('2028-02-29'); // 2028 is a leap year
  });
  it('February in a non-leap year returns the 28th', () => {
    expect(monthEndDate('2026-02')).toBe('2026-02-28');
  });
});

describe('nextMonthStart', () => {
  it('a normal month rolls to the 1st of the following month', () => {
    expect(nextMonthStart('2026-09')).toBe('2026-10-01');
  });
  it('December rolls over into January of the following YEAR', () => {
    expect(nextMonthStart('2026-12')).toBe('2027-01-01');
  });
  it('is always a real calendar date, unlike the `${period}-31` bug it replaces', () => {
    for (const m of ['01','02','03','04','05','06','07','08','09','10','11','12']) {
      const s = nextMonthStart(`2026-${m}`);
      expect(new Date(s).toString()).not.toBe('Invalid Date');
    }
  });
});
