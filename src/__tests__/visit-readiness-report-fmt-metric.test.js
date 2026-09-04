// @ts-nocheck
// visit-readiness-report.js's fmtMetric had zero direct test coverage despite being live: the
// shared formatter for the Visit Readiness print report and audit CSV -- called 9x in the same
// file so a value reads identically across the on-screen panel, print, and CSV export.
import { describe, it, expect } from 'vitest';
import { fmtMetric } from '../views/visit-readiness-report.js';

describe('fmtMetric', () => {
  it('returns an em dash for null, undefined, or NaN', () => {
    expect(fmtMetric(null)).toBe('—');
    expect(fmtMetric(undefined)).toBe('—');
    expect(fmtMetric(NaN)).toBe('—');
  });

  it('pct unit: treats a small magnitude (<=1.5) as a fraction and multiplies by 100', () => {
    expect(fmtMetric(0.955, 'pct')).toBe('95.50%');
    expect(fmtMetric(0.5, 'pct')).toBe('50.00%');
  });

  it('pct unit: treats a large magnitude (>1.5) as already a percent value', () => {
    expect(fmtMetric(95.5, 'pct')).toBe('95.50%');
  });

  it('pct unit: the 1.5 boundary itself is treated as a fraction', () => {
    expect(fmtMetric(1.5, 'pct')).toBe('150.00%');
  });

  it('s (seconds) unit: rounds to the nearest whole second', () => {
    expect(fmtMetric(125.6, 's')).toBe('126s');
    expect(fmtMetric(125.4, 's')).toBe('125s');
  });

  it('hrs unit: one decimal place', () => {
    expect(fmtMetric(3.456, 'hrs')).toBe('3.5h');
    expect(fmtMetric(3, 'hrs')).toBe('3.0h');
  });

  it('default (no unit): rounds to two decimals, no trailing zeros', () => {
    expect(fmtMetric(3.14159)).toBe('3.14');
    expect(fmtMetric(3)).toBe('3');
  });
});
