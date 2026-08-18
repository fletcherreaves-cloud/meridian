import { describe, it, expect } from 'vitest';
import { autoFirstDaily, matchedVsLY, autoFirstTotal, firstRealTradingDate, lyQuality } from '../engine/vs-ly.js';

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

  it('accepts STRING ranges against Date-typed rows (One-Pager regression)', () => {
    // The One-Pager passes ISO-string ranges ("2026-06-01"); rows carry Date objects.
    // A raw `Date >= "2026-06-01"` coerces to `number >= NaN` = false and dropped EVERY
    // row → matchedVsLY returned null (blank GC-vs-LY + District-Outliers vs-LY).
    const ds = { qsrActSummaryRows: [
      { loc: '1', date: d('2026-06-01'), gc: 55, lyGc: 50, sales: 110, lySales: 100 },
      { loc: '1', date: d('2026-06-15'), gc: 66, lyGc: 60, sales: 132, lySales: 120 },
    ] };
    const strRange = { s: '2026-06-01', e: '2026-06-28' };
    const g = matchedVsLY(ds, ['1'], strRange, 'gc');
    expect(g.days).toBe(2); expect(g.cur).toBe(121); expect(g.ly).toBe(110);
    expect(g.pct).toBeCloseTo(0.1, 5);
    const s = matchedVsLY(ds, ['1'], strRange, 'sales');
    expect(s.pct).toBeCloseTo(0.1, 5);
    // out-of-window string range must exclude everything
    expect(matchedVsLY(ds, ['1'], { s: '2026-07-01', e: '2026-07-31' }, 'gc').pct).toBeNull();
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

// dispatch20 addendum, 2026-08-18 — the young-restaurant vs-LY trap. Fixtures below are the
// REAL measured qsr_daily_activity_rollup numbers for Tishomingo (loc 43380, opened
// 2024-12-16) verified live this session, not invented: 2024-12-13 = $104.97/14 transactions
// (a training/soft-open day), 2024-12-14 and 12-15 both zero, 2024-12-16 = $10,058.48/816
// transactions (real trading start, sustained the following days at 1224/1200/1146/1043).
describe('firstRealTradingDate — the young-restaurant anchor', () => {
  const tishomingoRows = [
    { loc: '43380', date: d('2024-12-13'), transactions: 14 },
    { loc: '43380', date: d('2024-12-14'), transactions: 0 },
    { loc: '43380', date: d('2024-12-15'), transactions: 0 },
    { loc: '43380', date: d('2024-12-16'), transactions: 816 },
    { loc: '43380', date: d('2024-12-17'), transactions: 1224 },
    { loc: '43380', date: d('2024-12-18'), transactions: 1200 },
    { loc: '43380', date: d('2024-12-19'), transactions: 1146 },
    { loc: '43380', date: d('2024-12-20'), transactions: 1043 },
  ];

  it('skips the isolated training-day spike and anchors on the real, sustained start', () => {
    const ds = { qsrActSummaryRows: tishomingoRows };
    expect(firstRealTradingDate(ds, '43380')).toBe('2024-12-16'); // NOT '2024-12-13'
  });

  it('accepts a genuine grand-opening day with immediate sustained volume (Ponce de Leon, ' +
     'loc 43701, opened 2026-03-13 -- real measured figures: 514/623/558/526/562/569 ' +
     'transactions the first 6 days, no training-day noise)', () => {
    const ponceRows = ['2026-03-13','2026-03-14','2026-03-15','2026-03-16','2026-03-17','2026-03-18']
      .map((dt, i) => ({ loc: '43701', date: d(dt), transactions: [514,623,558,526,562,569][i] }));
    const ds = { qsrActSummaryRows: ponceRows };
    expect(firstRealTradingDate(ds, '43701')).toBe('2026-03-13');
  });

  it('returns null when no data is available for the loc (safe non-flagging default)', () => {
    expect(firstRealTradingDate({ qsrActSummaryRows: [] }, '43380')).toBeNull();
  });

  it('does not anchor on a day whose immediate next day is missing entirely (a gap, not ' +
     'confirmed sustained trading)', () => {
    const ds = { qsrActSummaryRows: [
      { loc: '1', date: d('2026-01-01'), transactions: 500 },
      { loc: '1', date: d('2026-01-05'), transactions: 500 }, // gap -- 01-02 through 01-04 missing
    ] };
    expect(firstRealTradingDate(ds, '1')).toBeNull();
  });
});

describe('lyQuality', () => {
  it('flags Tishomingo unreliable when the LY leg falls inside its first 24 months', () => {
    const ds = { qsrActSummaryRows: tishomingoRowsFor('43380') };
    // A comparison window whose LY leg (364 days back) lands ~7 months after the 2024-12-16
    // open -- well inside the 24-month honeymoon-ramp window.
    const r = { s: d('2026-07-01'), e: d('2026-07-28') };
    const q = lyQuality(ds, '43380', r);
    expect(q.reliable).toBe(false);
    expect(q.firstTradingDate).toBe('2024-12-16');
    expect(q.monthsOld).toBeGreaterThan(0);
    expect(q.monthsOld).toBeLessThan(24);
  });

  it('does not flag a store whose LY leg lands well past the 24-month mark', () => {
    const ds = { qsrActSummaryRows: tishomingoRowsFor('43380') };
    // LY leg ~10 years after opening -- clearly past the honeymoon-ramp window.
    const r = { s: d('2036-07-01'), e: d('2036-07-28') };
    const q = lyQuality(ds, '43380', r);
    expect(q.reliable).toBe(true);
  });

  it('returns reliable:null (not false) when there is no trading-date data to judge from -- ' +
     'an established store simply outside the loaded ds window must never read as "flagged"', () => {
    const q = lyQuality({ qsrActSummaryRows: [] }, '3708', range);
    expect(q.reliable).toBeNull();
  });

  it('matchedVsLY surfaces flagged locs additively -- cur/ly/pct/days are unchanged, callers ' +
     'opt into excluding a flagged store themselves rather than having the aggregate silently ' +
     'change under every existing caller', () => {
    const ds = { qsrActSummaryRows: [
      ...tishomingoRowsFor('43380'),
      { loc: '43380', date: d('2026-07-01'), sales: 1000, lySales: 900 },
      { loc: '3708', date: d('2026-07-01'), sales: 500, lySales: 480 },
    ] };
    const r = matchedVsLY(ds, ['43380', '3708'], { s: d('2026-07-01'), e: d('2026-07-28') }, 'sales');
    expect(r.cur).toBe(1500); expect(r.ly).toBe(1380); // both stores still summed
    expect(r.flagged).toHaveLength(1);
    expect(r.flagged[0].loc).toBe('43380');
  });

  function tishomingoRowsFor(loc) {
    return [
      { loc, date: d('2024-12-13'), transactions: 14 },
      { loc, date: d('2024-12-14'), transactions: 0 },
      { loc, date: d('2024-12-15'), transactions: 0 },
      { loc, date: d('2024-12-16'), transactions: 816 },
      { loc, date: d('2024-12-17'), transactions: 1224 },
    ];
  }
});
