// @ts-nocheck
// Record Hour leaderboard (src/engine/record-hour.js's computeHourLeaderboard/
// scopeHourLeaderboard) -- category (daypart)/metric-scoped best-hour records with a
// top-N-all-time history and a "previous record" (rank 2), built on top of the already-
// tested computeHourRecords/allWindowsForDay machinery. Mirrors record-hour.test.js's own
// row()/fixture conventions.
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  computeHourLeaderboard, scopeHourLeaderboard, HOUR_CATEGORIES, HOUR_METRICS,
} from '../engine/record-hour.js';

const LOC  = '33704'; // Tecumseh
const LOC2 = '35064';

function row(loc, date, slot, netSales, transactions = 0) {
  const [h, m] = slot.split(':').map(Number);
  return { loc, date: new Date(date + 'T00:00:00'), qtrSlot: slot, slotMinutes: h * 60 + m, netSales, transactions };
}

afterEach(() => { vi.useRealTimers(); });

describe('HOUR_CATEGORIES / HOUR_METRICS', () => {
  it('lists Any Hour plus the 5 real dayparts, and both metrics', () => {
    expect(HOUR_CATEGORIES.map(c => c.key)).toEqual(['overall', 'breakfast', 'lunch', 'afternoon', 'dinner', 'latenight']);
    expect(HOUR_CATEGORIES[0].daypart).toBeNull();
    expect(HOUR_METRICS.map(m => m.key)).toEqual(['sales', 'transactions']);
  });
});

describe('computeHourLeaderboard', () => {
  it('returns null with no rows loaded', () => {
    expect(computeHourLeaderboard({ qsrSalesQtrHourRows: [] })).toBeNull();
    expect(computeHourLeaderboard({})).toBeNull();
  });

  it('ranks the top 5 confirmed days best-first, with rank 2 as the "previous record"', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T12:00:00'));
    const rows = [];
    // 6 days, ascending values 1000..6000 -- so the top5 should be [6000,5000,4000,3000,2000],
    // dropping the oldest/smallest (1000), and "previous" (rank 2) should be 5000.
    const vals = [1000, 2000, 3000, 4000, 5000, 6000];
    vals.forEach((v, i) => {
      const dk = `2026-05-${String(10 + i).padStart(2, '0')}`;
      rows.push(row(LOC, dk, '07:15', v / 4), row(LOC, dk, '07:30', v / 4), row(LOC, dk, '07:45', v / 4), row(LOC, dk, '08:00', v / 4));
    });
    const data = computeHourLeaderboard({ qsrSalesQtrHourRows: rows }, { windowDays: 9999, category: 'overall', metric: 'sales' });
    const top = data.stores[LOC].top;
    expect(top.map(t => t.value)).toEqual([6000, 5000, 4000, 3000, 2000]);
    expect(top[0].value).toBe(6000);      // current record
    expect(top[1].value).toBe(5000);      // previous record
    expect(data.distTop[0].value).toBe(6000);
    expect(data.distTop[0].loc).toBe(LOC);
  });

  it('restricts to ONE daypart category, not whichever daypart the global best happens to land in', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T12:00:00'));
    const dk = '2026-05-01';
    const rows = [
      // Breakfast window (06:15-07:15): modest.
      row(LOC, dk, '06:15', 100), row(LOC, dk, '06:30', 100), row(LOC, dk, '06:45', 100), row(LOC, dk, '07:00', 100),
      // Dinner window (19:15-20:15): much bigger -- this is the OVERALL best, but must not
      // leak into the 'breakfast' category's own leaderboard.
      row(LOC, dk, '19:15', 5000), row(LOC, dk, '19:30', 5000), row(LOC, dk, '19:45', 5000), row(LOC, dk, '20:00', 5000),
    ];
    const bf = computeHourLeaderboard({ qsrSalesQtrHourRows: rows }, { windowDays: 9999, category: 'breakfast', metric: 'sales' });
    expect(bf.stores[LOC].top[0].value).toBe(400);
    expect(bf.stores[LOC].top[0].daypart).toBe('Breakfast');

    const dinner = computeHourLeaderboard({ qsrSalesQtrHourRows: rows }, { windowDays: 9999, category: 'dinner', metric: 'sales' });
    expect(dinner.stores[LOC].top[0].value).toBe(20000);
    expect(dinner.stores[LOC].top[0].daypart).toBe('Dinner');

    const lunch = computeHourLeaderboard({ qsrSalesQtrHourRows: rows }, { windowDays: 9999, category: 'lunch', metric: 'sales' });
    expect(lunch).toBeTruthy();
    expect(lunch.stores[LOC]).toBeUndefined();   // no lunch-hour data at all for this store
  });

  it('switches ranking by metric (transactions vs sales) independently', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T12:00:00'));
    const dk = '2026-05-01';
    const rows = [
      row(LOC, dk, '07:15', 1000, 50), row(LOC, dk, '07:30', 1000, 50),
      row(LOC, dk, '07:45', 1000, 50), row(LOC, dk, '08:00', 1000, 50),
      // Higher transactions, lower sales, overlapping start at 08:15.
      row(LOC, dk, '08:15', 100, 300),
    ];
    // Two overlapping 4-slot windows: 07:00-08:00 (1000x4=4000 sales, 50x4=200 txns) and
    // 07:15-08:15 (1000x3+100=3100 sales, 50x3+300=450 txns). Sales favors the first window,
    // transactions favors the second -- the two metrics must rank them in opposite order.
    const bySales = computeHourLeaderboard({ qsrSalesQtrHourRows: rows }, { windowDays: 9999, category: 'overall', metric: 'sales' });
    expect(bySales.stores[LOC].top[0].startMinutes).toBe(7 * 60);        // 07:00-08:00 wins on $
    expect(bySales.stores[LOC].top[0].value).toBe(4000);

    const byTx = computeHourLeaderboard({ qsrSalesQtrHourRows: rows }, { windowDays: 9999, category: 'overall', metric: 'transactions' });
    expect(byTx.stores[LOC].top[0].startMinutes).toBe(7 * 60 + 15);      // 07:15-08:15 wins on txns
    expect(byTx.stores[LOC].top[0].value).toBe(450);
  });

  it('keeps today\'s provisional reading out of the permanent top-N', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-24T15:00:00'));
    const CLOSED_DK = '2026-08-19';
    const TODAY_DK  = '2026-08-24';
    const rows = [
      row(LOC, CLOSED_DK, '07:15', 1000), row(LOC, CLOSED_DK, '07:30', 1000), row(LOC, CLOSED_DK, '07:45', 1000), row(LOC, CLOSED_DK, '08:00', 1000),
      row(LOC, TODAY_DK, '07:15', 9000), row(LOC, TODAY_DK, '07:30', 9000), row(LOC, TODAY_DK, '07:45', 9000), row(LOC, TODAY_DK, '08:00', 9000),
    ];
    const data = computeHourLeaderboard({ qsrSalesQtrHourRows: rows }, { windowDays: 9999 });
    expect(data.stores[LOC].top.map(t => t.value)).toEqual([4000]);   // today's 36000 excluded
    expect(data.stores[LOC].provisionalToday.value).toBe(36000);
    expect(data.stores[LOC].provisionalToday.isProvisional).toBe(true);
  });
});

describe('scopeHourLeaderboard', () => {
  it('returns data unchanged when locs is null', () => {
    const data = { stores: {}, distTop: [], topN: 5 };
    expect(scopeHourLeaderboard(data, null)).toBe(data);
  });

  it('narrows stores + re-derives distTop from only the scoped stores', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T12:00:00'));
    const dk = '2026-05-01';
    const rows = [
      row(LOC,  dk, '07:15', 1000), row(LOC,  dk, '07:30', 1000), row(LOC,  dk, '07:45', 1000), row(LOC,  dk, '08:00', 1000),
      row(LOC2, dk, '07:15', 5000), row(LOC2, dk, '07:30', 5000), row(LOC2, dk, '07:45', 5000), row(LOC2, dk, '08:00', 5000),
    ];
    const data = computeHourLeaderboard({ qsrSalesQtrHourRows: rows }, { windowDays: 9999 });
    expect(data.distTop[0].loc).toBe(LOC2);

    const scoped = scopeHourLeaderboard(data, [LOC]);
    expect(Object.keys(scoped.stores)).toEqual([LOC]);
    expect(scoped.distTop[0].loc).toBe(LOC);
    expect(scoped.distTop[0].value).toBe(4000);
    expect(scoped.totalStores).toBe(1);
  });
});
