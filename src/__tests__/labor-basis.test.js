import { describe, it, expect } from 'vitest';
import { resolveLaborTarget, DEFAULT_LABOR_BASIS, LABOR_BASIS_FIELDS } from '../engine/labor-basis.js';

// #153: single named resolution point for "the store's labor % target" — the field that used
// to be read inline (t.tLabor) at every call site, disagreeing with the field the monthly
// approval cycle actually populates (tCrewLabor).
describe('resolveLaborTarget', () => {
  it('defaults to tCrewLabor', () => {
    expect(DEFAULT_LABOR_BASIS).toBe('tCrewLabor');
    expect(resolveLaborTarget({ tLabor: 0.22, tCrewLabor: 0.21 })).toBe(0.21);
  });

  it('an explicit basis overrides the default', () => {
    expect(resolveLaborTarget({ tLabor: 0.22, tCrewLabor: 0.21 }, 'tLabor')).toBe(0.22);
  });

  it('returns null for a missing/non-numeric field rather than 0 or NaN', () => {
    expect(resolveLaborTarget({})).toBeNull();
    expect(resolveLaborTarget({ tCrewLabor: null })).toBeNull();
    expect(resolveLaborTarget({ tCrewLabor: 'not a number' })).toBeNull();
  });

  it('returns null for a null/undefined target object', () => {
    expect(resolveLaborTarget(null)).toBeNull();
    expect(resolveLaborTarget(undefined)).toBeNull();
  });

  it('tBonusLabor and tCombLabor are declared reserved, not removed', () => {
    expect(LABOR_BASIS_FIELDS.tBonusLabor.status).toBe('reserved');
    expect(LABOR_BASIS_FIELDS.tCombLabor.status).toBe('reserved');
  });
});
