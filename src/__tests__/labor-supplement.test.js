// @ts-nocheck
import { describe, it, expect } from 'vitest';
import { supplementLaborWithSched } from '../engine/labor-supplement.js';

describe('supplementLaborWithSched', () => {
  it('returns laborRows unchanged when qsrActSummaryRows is empty/absent', () => {
    const laborRows = [{ loc: '3708', date: new Date('2026-08-01'), sales: 1000 }];
    expect(supplementLaborWithSched(laborRows, [])).toBe(laborRows);
    expect(supplementLaborWithSched(laborRows, undefined)).toBe(laborRows);
  });

  it('auto DAR wins the sales figure for an overlapping day', () => {
    const laborRows = [{ loc: '3708', date: new Date('2026-08-01T00:00:00'), sales: 1000, laborPct: 0.21 }];
    const qsrActSummaryRows = [{ loc: '3708', date: new Date('2026-08-01T00:00:00'), sales: 1050 }];
    const out = supplementLaborWithSched(laborRows, qsrActSummaryRows);
    expect(out).toHaveLength(1);
    expect(out[0].sales).toBe(1050);
    expect(out[0].laborPct).toBe(0.21); // other manual fields untouched
  });

  it('fills a day the manual report never covered', () => {
    const laborRows = [{ loc: '3708', date: new Date('2026-08-01T00:00:00'), sales: 1000 }];
    const qsrActSummaryRows = [{ loc: '3708', date: new Date('2026-08-02T00:00:00'), sales: 900 }];
    const out = supplementLaborWithSched(laborRows, qsrActSummaryRows);
    expect(out).toHaveLength(2);
    expect(out.find(r => r.sales === 900)).toBeTruthy();
  });

  it('ignores a zero/negative auto sales row (not real data)', () => {
    const laborRows = [{ loc: '3708', date: new Date('2026-08-01T00:00:00'), sales: 1000 }];
    const qsrActSummaryRows = [{ loc: '3708', date: new Date('2026-08-02T00:00:00'), sales: 0 }];
    const out = supplementLaborWithSched(laborRows, qsrActSummaryRows);
    expect(out).toBe(laborRows); // no change — the only auto row is a zero
  });

  it('is a no-op (same array reference) when nothing actually changes', () => {
    const laborRows = [{ loc: '3708', date: new Date('2026-08-01T00:00:00'), sales: 1000 }];
    const qsrActSummaryRows = [{ loc: '3708', date: new Date('2026-08-01T00:00:00'), sales: 1000 }]; // identical
    expect(supplementLaborWithSched(laborRows, qsrActSummaryRows)).toBe(laborRows);
  });
});
