// @ts-nocheck
// #242 — unit tests for the classifier itself. See engine/salaried-coverage.js's header for the
// #241 measurement (4 complete / 12 partial / 11 absent, out of 27 stores, July 2026).
import { describe, it, expect } from 'vitest';
import { salariedCoverage, deriveIfSalariedComplete } from '../engine/salaried-coverage.js';

describe('salariedCoverage', () => {
  it('complete: both salaried hours and dollars > 0', () => {
    const rows = [{ salaried_manager_hours: 40, salaried_manager_dollars: 900 }];
    expect(salariedCoverage(rows)).toBe('complete');
  });

  it('partial: dollars only (Bonifay/DeFuniak Springs shape)', () => {
    const rows = [{ salaried_manager_hours: 0, salaried_manager_dollars: 900 }];
    expect(salariedCoverage(rows)).toBe('partial');
  });

  it('partial: hours only (Ponce de Leon/OK-store shape)', () => {
    const rows = [{ salaried_manager_hours: 40, salaried_manager_dollars: 0 }];
    expect(salariedCoverage(rows)).toBe('partial');
  });

  it('absent: neither', () => {
    const rows = [{ salaried_manager_hours: 0, salaried_manager_dollars: 0 }];
    expect(salariedCoverage(rows)).toBe('absent');
  });

  it('absent: missing fields entirely (null/undefined), not a crash', () => {
    expect(salariedCoverage([{}])).toBe('absent');
    expect(salariedCoverage([])).toBe('absent');
    expect(salariedCoverage(undefined)).toBe('absent');
  });

  it('sums across multiple rows before classifying — one zero day does not flip a configured store to partial', () => {
    const rows = [
      { salaried_manager_hours: 40, salaried_manager_dollars: 900 },
      { salaried_manager_hours: 0, salaried_manager_dollars: 0 }, // a closed day, say
    ];
    expect(salariedCoverage(rows)).toBe('complete');
  });

  it('is not keyed on any hardcoded store/market list — same shape input, same output regardless of loc', () => {
    const flPartial = [{ loc: '5183', salaried_manager_hours: 40, salaried_manager_dollars: 0 }]; // Ponce de Leon shape
    const okPartial = [{ loc: '9999', salaried_manager_hours: 40, salaried_manager_dollars: 0 }];
    expect(salariedCoverage(flPartial)).toBe(salariedCoverage(okPartial));
  });
});

describe('deriveIfSalariedComplete', () => {
  it('returns the computed value when coverage is complete', () => {
    const rows = [{ salaried_manager_hours: 40, salaried_manager_dollars: 900 }];
    const result = deriveIfSalariedComplete(rows, r => r.reduce((a, x) => a + x.salaried_manager_dollars, 0));
    expect(result).toBe(900);
  });

  it('returns null (never a computed number) when coverage is partial', () => {
    const rows = [{ salaried_manager_hours: 40, salaried_manager_dollars: 0 }];
    const result = deriveIfSalariedComplete(rows, () => 12345);
    expect(result).toBeNull();
  });

  it('returns null when coverage is absent', () => {
    const rows = [{ salaried_manager_hours: 0, salaried_manager_dollars: 0 }];
    const result = deriveIfSalariedComplete(rows, () => 12345);
    expect(result).toBeNull();
  });
});
