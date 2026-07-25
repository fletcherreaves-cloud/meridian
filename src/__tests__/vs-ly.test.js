import { describe, it, expect } from 'vitest';
import { autoFirstDaily, matchedVsLY, autoFirstTotal } from '../engine/vs-ly.js';

const d = s => new Date(s + 'T00:00:00');
const range = { s: d('2026-06-01'), e: d('2026-06-28') };

describe('vs-ly shared helper', () => {
  it('matched-day: partial current coverage does NOT read as a false decline', () => {
    // Current has 2 of 28 days ($100+$100); last year (364d back) has the SAME 2 days at $100 each.
    // The old bug summed full-LY vs partial-current → big fake decline. Matched-day → 0%.
    const ds = {
      laborRows: [
        { loc: '1', date: d('2026-06-01'), sales: 100 },
        { loc: '1', date: d('2026-06-02'), sales: 100 },
        // LY rows exactly 364 days back
        { loc: '1', date: d('2025-06-02'), sales: 100 },
        { loc: '1', date: d('2025-06-03'), sales: 100 },
        // an EXTRA LY day with no current match — must be ignored by matched-day
        { loc: '1', date: d('2025-06-10'), sales: 5000 },
      ],
    };
    const r = matchedVsLY(ds, ['1'], range, 'sales');
    expect(r.days).toBe(2);
    expect(r.cur).toBe(200);
    expect(r.ly).toBe(200);
    expect(r.pct).toBeCloseTo(0, 5);
  });

  it('auto-first: current sales fall back to the DAR when manual is missing that day', () => {
    const ds = {
      laborRows: [{ loc: '1', date: d('2026-06-01'), sales: 100 }],           // manual: only day 1
      qsrActSummaryRows: [
        { loc: '1', date: d('2026-06-01'), sales: 999, lySales: 90 },          // manual wins for day 1
        { loc: '1', date: d('2026-06-02'), sales: 120, lySales: 100 },         // DAR fills day 2
      ],
    };
    const { curByDate, lyByDate } = autoFirstDaily(ds, '1', range, 'sales');
    expect(curByDate['2026-06-01']).toBe(100);   // manual preferred over DAR 999
    expect(curByDate['2026-06-02']).toBe(120);   // DAR fills the gap
    expect(lyByDate['2026-06-02']).toBe(100);    // DAR's own same-date LY
    expect(autoFirstTotal(ds, '1', range, 'sales')).toBe(220);
  });

  it('computes a real positive vs-LY from DAR lySales', () => {
    const ds = { qsrActSummaryRows: [
      { loc: '1', date: d('2026-06-01'), sales: 110, lySales: 100 },
      { loc: '1', date: d('2026-06-02'), sales: 132, lySales: 120 },
    ] };
    const r = matchedVsLY(ds, ['1'], range, 'sales');
    expect(r.pct).toBeCloseTo(0.1, 5);   // (242-220)/220
  });

  it('gc kind uses guest fields (gc / lyGc)', () => {
    const ds = { qsrActSummaryRows: [
      { loc: '1', date: d('2026-06-01'), gc: 55, lyGc: 50 },
    ] };
    const r = matchedVsLY(ds, ['1'], range, 'gc');
    expect(r.cur).toBe(55); expect(r.ly).toBe(50);
    expect(r.pct).toBeCloseTo(0.1, 5);
  });

  it('null pct when there is no comparable last-year data (honest "unavailable")', () => {
    const ds = { qsrActSummaryRows: [{ loc: '1', date: d('2026-06-01'), sales: 100 }] }; // no lySales
    const r = matchedVsLY(ds, ['1'], range, 'sales');
    expect(r.ly).toBe(0);
    expect(r.pct).toBeNull();
    expect(autoFirstTotal(ds, '1', range, 'sales')).toBe(100); // total still shows
  });

  it('sums across multiple locs', () => {
    const ds = { qsrActSummaryRows: [
      { loc: '1', date: d('2026-06-01'), sales: 100, lySales: 100 },
      { loc: '2', date: d('2026-06-01'), sales: 210, lySales: 200 },
    ] };
    const r = matchedVsLY(ds, ['1', '2'], range, 'sales');
    expect(r.cur).toBe(310); expect(r.ly).toBe(300);
  });
});
