// @ts-nocheck
// count-cycle.js's sessionQualities/sessionLabel had zero direct test coverage despite being
// live: called from detectSessions (count-cycle.js) and directly from the live automation
// writer scripts/qsrsoft-onhand-pull.mjs. count-cycle.test.js imports both but only exercises
// them indirectly through cycleCompliance/detectSessions, never invokes them by name.
import { describe, it, expect } from 'vitest';
import { sessionQualities, sessionLabel } from '../engine/count-cycle.js';

// '2026-06-10': June has 30 days, day 10 is outside the 4-day close window (10 <= 30-4).
const NON_EOM_DATE = '2026-06-10';
// '2026-06-28': day 28 is inside the 4-day close window (28 > 30-4).
const EOM_DATE = '2026-06-28';

describe('sessionQualities', () => {
  it('satisfies weekly when Food + Condiment are both covered', () => {
    const q = sessionQualities(NON_EOM_DATE, ['Food', 'Condiment'], 10);
    expect(q).toEqual({ satisfiesWeekly: true, satisfiesMidPaper: false, isEom: false, isPartial: false, isSpot: false });
  });

  it('satisfies mid-month paper when Paper is covered outside the close window', () => {
    const q = sessionQualities(NON_EOM_DATE, ['Paper'], 30);
    expect(q).toEqual({ satisfiesWeekly: false, satisfiesMidPaper: true, isEom: false, isPartial: false, isSpot: false });
  });

  it('satisfies both weekly and mid-month paper simultaneously when all three are covered', () => {
    const q = sessionQualities(NON_EOM_DATE, ['Food', 'Condiment', 'Paper'], 40);
    expect(q.satisfiesWeekly).toBe(true);
    expect(q.satisfiesMidPaper).toBe(true);
    expect(q.isEom).toBe(false);
  });

  it('classifies a large Paper-covered session inside the close window as EOM, not mid-paper', () => {
    const q = sessionQualities(EOM_DATE, ['Paper'], 60);
    expect(q).toEqual({ satisfiesWeekly: false, satisfiesMidPaper: false, isEom: true, isPartial: false, isSpot: false });
  });

  it('requires n >= 50 for EOM credit inside the close window; a smaller session falls to partial', () => {
    const q = sessionQualities(EOM_DATE, ['Paper'], 30);
    expect(q).toEqual({ satisfiesWeekly: false, satisfiesMidPaper: false, isEom: false, isPartial: true, isSpot: false });
  });

  it('classifies an uncovered session with n >= 25 as partial', () => {
    const q = sessionQualities(NON_EOM_DATE, [], 25);
    expect(q.isPartial).toBe(true);
    expect(q.isSpot).toBe(false);
  });

  it('classifies an uncovered session with n < 25 as a spot check', () => {
    const q = sessionQualities(NON_EOM_DATE, [], 10);
    expect(q.isPartial).toBe(false);
    expect(q.isSpot).toBe(true);
  });
});

describe('sessionLabel', () => {
  it('labels a weekly-only session', () => {
    expect(sessionLabel(sessionQualities(NON_EOM_DATE, ['Food', 'Condiment'], 10))).toBe('Weekly');
  });

  it('labels a mid-month-paper-only session', () => {
    expect(sessionLabel(sessionQualities(NON_EOM_DATE, ['Paper'], 30))).toBe('Mid-month paper');
  });

  it('joins multiple satisfied qualities with " + " (Weekly + Mid-month paper)', () => {
    expect(sessionLabel(sessionQualities(NON_EOM_DATE, ['Food', 'Condiment', 'Paper'], 40)))
      .toBe('Weekly + Mid-month paper');
  });

  it('labels an EOM session', () => {
    expect(sessionLabel(sessionQualities(EOM_DATE, ['Paper'], 60))).toBe('End of month');
  });

  it('labels a partial session', () => {
    expect(sessionLabel(sessionQualities(NON_EOM_DATE, [], 25))).toBe('Partial');
  });

  it('labels a spot-check session', () => {
    expect(sessionLabel(sessionQualities(NON_EOM_DATE, [], 10))).toBe('Spot check');
  });
});
