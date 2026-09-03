// @ts-nocheck
// utils/fmt.js's fP/fN had zero direct test coverage despite being live -- fP (percent
// formatter) and fN (decimal-number formatter) are used 30+ times across store-dash.js,
// store-analytics.js, at-a-glance.js, store-cockpit.js for labor%/park%/discount%/cash O/S
// display. fPct and the grade helpers in the same file are already tested; these two were
// skipped.
import { describe, it, expect } from 'vitest';
import { fP, fN } from '../utils/fmt.js';

describe('fP', () => {
  it('formats a fraction as a percent string with 2 decimals by default', () => {
    expect(fP(0.25)).toBe('25.00%');
  });

  it('respects a custom decimal count', () => {
    expect(fP(0.005, 3)).toBe('0.500%');
  });

  it('formats a negative fraction', () => {
    expect(fP(-0.1)).toBe('-10.00%');
  });

  it('returns the em-dash placeholder for 0, null, undefined, and NaN (falsy guard)', () => {
    expect(fP(0)).toBe('—');
    expect(fP(null)).toBe('—');
    expect(fP(undefined)).toBe('—');
    expect(fP(NaN)).toBe('—');
  });
});

describe('fN', () => {
  it('formats a number to 1 decimal by default', () => {
    expect(fN(5.678)).toBe('5.7');
  });

  it('respects a custom decimal count', () => {
    expect(fN(-5.678, 2)).toBe('-5.68');
  });

  it('treats 0 as a real value, not "missing" (unlike fP)', () => {
    expect(fN(0)).toBe('0.0');
  });

  it('returns the em-dash placeholder only for null/undefined', () => {
    expect(fN(null)).toBe('—');
    expect(fN(undefined)).toBe('—');
  });
});
