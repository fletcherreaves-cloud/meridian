// @ts-nocheck
// Record Hour in Sales -- the real rolling-60-minute fix (src/engine/record-hour.js).
// Pure-engine coverage for the sliding-window-maximum computation, mirroring how
// computeRecords (record-day.js) gets its own dedicated unit coverage separately from the
// dispatch-103-style render-level test.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { computeHourRecords, scopeHourRecords, windowLabel, RECORD_HOUR_WINDOW_SLOTS } from '../engine/record-hour.js';

const LOC = '33704'; // Tecumseh

// Builds one quarter-hour row. `slot` is the raw "HH:MM" endQtrHourTime string (the END of
// the 15-minute bucket) -- matches scripts/qsrsoft-sales-quarter-hour-pull.mjs's mapRow.
function row(loc, date, slot, netSales) {
  const [h, m] = slot.split(':').map(Number);
  return { loc, date: new Date(date + 'T00:00:00'), qtrSlot: slot, slotMinutes: h * 60 + m, netSales };
}

afterEach(() => { vi.useRealTimers(); });

describe('computeHourRecords', () => {
  it('returns null with no rows loaded', () => {
    expect(computeHourRecords({ qsrSalesQtrHourRows: [] })).toBeNull();
    expect(computeHourRecords({})).toBeNull();
  });

  it('picks the single best 4-CONSECUTIVE-bucket window across several overlapping candidates, not just the first aligned clock hour', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T12:00:00')); // far from any fixture date -> nothing provisional
    const dk = '2026-05-01';
    // 8 contiguous quarter-hours (06:15 -> 08:00) give 5 overlapping 4-bucket candidate
    // windows. The richest single bucket (07:15, 2500) is NOT inside the richest window --
    // 06:15-07:00's three 1000s plus 07:15's 2500 (i.e. 06:15-07:15, offset from every
    // plain clock hour) sums higher than any clock-aligned hour.
    const rows = [
      row(LOC, dk, '06:15', 1000), row(LOC, dk, '06:30', 1000), row(LOC, dk, '06:45', 1000), row(LOC, dk, '07:00', 1000),
      row(LOC, dk, '07:15', 2500), row(LOC, dk, '07:30', 100),  row(LOC, dk, '07:45', 100),  row(LOC, dk, '08:00', 100),
    ];
    const data = computeHourRecords({ qsrSalesQtrHourRows: rows }, { windowDays: 9999 });
    expect(data.stores[LOC].best.sales).toBe(5500); // 06:30+06:45+07:00+07:15 buckets
    expect(data.stores[LOC].best.startMinutes).toBe(6 * 60 + 15);
    expect(data.stores[LOC].best.endMinutes).toBe(7 * 60 + 15);
    expect(data.stores[LOC].best.isProvisional).toBe(false);
  });

  it('finds a 15-min-offset window (7:15-8:15) that beats every clock-aligned hour', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T12:00:00'));
    const dk = '2026-05-01';
    const rows = [
      row(LOC, dk, '07:00', 100),
      row(LOC, dk, '07:15', 900), row(LOC, dk, '07:30', 900), row(LOC, dk, '07:45', 900), row(LOC, dk, '08:00', 900),
      row(LOC, dk, '08:15', 2000),
    ];
    const data = computeHourRecords({ qsrSalesQtrHourRows: rows }, { windowDays: 9999 });
    // 07:15-08:15 (900+900+900+2000=4700) beats 07:00-08:00 (100+900+900+900=2800).
    expect(data.stores[LOC].best.sales).toBe(4700);
    expect(data.stores[LOC].best.startMinutes).toBe(7 * 60 + 15);
    expect(data.stores[LOC].best.endMinutes).toBe(8 * 60 + 15);
    expect(windowLabel(data.stores[LOC].best.startMinutes, data.stores[LOC].best.endMinutes)).toBe('7:15 AM – 8:15 AM');
  });

  it('never bridges a gap in the quarter-hour buckets into a fake contiguous window', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T12:00:00'));
    const dk = '2026-05-01';
    // 06:45 is MISSING -- 06:15/06:30/07:00/07:15 look numerically close but are not 4
    // truly consecutive 15-minute buckets, so no window may span the gap.
    const rows = [
      row(LOC, dk, '06:15', 1000), row(LOC, dk, '06:30', 1000),
      /* gap at 06:45 */
      row(LOC, dk, '07:00', 1000), row(LOC, dk, '07:15', 1000),
    ];
    const data = computeHourRecords({ qsrSalesQtrHourRows: rows }, { windowDays: 9999 });
    expect(data).toBeTruthy();
    // Fewer than RECORD_HOUR_WINDOW_SLOTS contiguous buckets anywhere -> no best window at all
    // for this store (bestWindowForDay returns null, so it's simply absent, not a fake record).
    expect(data.stores[LOC]).toBeUndefined();
    expect(RECORD_HOUR_WINDOW_SLOTS).toBe(4);
  });

  it('flags today\'s still-open business day as PROVISIONAL and never lets it overwrite a confirmed record', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-24T15:00:00')); // business date 2026-08-24, matches dispatch-103's own fixture time
    const CLOSED_DK = '2026-08-19';
    const TODAY_DK  = '2026-08-24';
    const rows = [
      row(LOC, CLOSED_DK, '07:15', 1000), row(LOC, CLOSED_DK, '07:30', 1000), row(LOC, CLOSED_DK, '07:45', 1000), row(LOC, CLOSED_DK, '08:00', 1000),
      // Today's partial reading is HIGHER but must stay provisional only.
      row(LOC, TODAY_DK, '07:15', 2000), row(LOC, TODAY_DK, '07:30', 2000), row(LOC, TODAY_DK, '07:45', 2000), row(LOC, TODAY_DK, '08:00', 2000),
    ];
    const data = computeHourRecords({ qsrSalesQtrHourRows: rows }, { windowDays: 9999 });
    expect(data.stores[LOC].best.sales).toBe(4000);      // the closed day, not today's 8000
    expect(data.stores[LOC].best.dk).toBe(CLOSED_DK);
    expect(data.stores[LOC].best.isProvisional).toBe(false);
    // Today's bigger-but-provisional reading is still surfaced in Recent Breaks, just marked.
    const todaysBreak = data.recentBreakers.find(b => b.dk === TODAY_DK);
    expect(todaysBreak).toBeTruthy();
    expect(todaysBreak.isProvisional).toBe(true);
    expect(todaysBreak.sales).toBe(8000);
  });

  it('a brand-new store with ONLY today\'s data surfaces a provisional reading instead of nothing', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-24T15:00:00'));
    const TODAY_DK = '2026-08-24';
    const rows = [
      row(LOC, TODAY_DK, '07:15', 500), row(LOC, TODAY_DK, '07:30', 500), row(LOC, TODAY_DK, '07:45', 500), row(LOC, TODAY_DK, '08:00', 500),
    ];
    const data = computeHourRecords({ qsrSalesQtrHourRows: rows }, { windowDays: 9999 });
    expect(data.stores[LOC].best.sales).toBe(2000);
    expect(data.stores[LOC].best.isProvisional).toBe(true);
  });

  it('assigns the correct daypart, including the wrapped 24:00-28:00 (post-midnight) tail', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T12:00:00'));
    const dk = '2026-05-01';
    // Breakfast window: 06:00-07:00.
    const breakfastRows = [row(LOC, dk, '06:15', 10), row(LOC, dk, '06:30', 10), row(LOC, dk, '06:45', 10), row(LOC, dk, '07:00', 10)];
    const bfData = computeHourRecords({ qsrSalesQtrHourRows: breakfastRows }, { windowDays: 9999 });
    expect(bfData.stores[LOC].best.daypart).toBe('Breakfast');

    // Wrapped late-night window: 25:00-26:00 (01:00-02:00 the next calendar day, same business day).
    const lateRows = [row(LOC, dk, '25:15', 10), row(LOC, dk, '25:30', 10), row(LOC, dk, '25:45', 10), row(LOC, dk, '26:00', 10)];
    const lateData = computeHourRecords({ qsrSalesQtrHourRows: lateRows }, { windowDays: 9999 });
    expect(lateData.stores[LOC].best.daypart).toBe('Late Night');
  });

  it('picks the district-wide best across stores via distBest', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T12:00:00'));
    const dk = '2026-05-01';
    const LOC2 = '35064';
    const rows = [
      row(LOC,  dk, '07:15', 1000), row(LOC,  dk, '07:30', 1000), row(LOC,  dk, '07:45', 1000), row(LOC,  dk, '08:00', 1000),
      row(LOC2, dk, '07:15', 5000), row(LOC2, dk, '07:30', 5000), row(LOC2, dk, '07:45', 5000), row(LOC2, dk, '08:00', 5000),
    ];
    const data = computeHourRecords({ qsrSalesQtrHourRows: rows }, { windowDays: 9999 });
    expect(data.distBest.loc).toBe(LOC2);
    expect(data.distBest.sales).toBe(20000);
  });
});

describe('scopeHourRecords', () => {
  it('returns data unchanged when locs is null (the "All Locations" contract)', () => {
    const data = { stores: { a: {} }, recentBreakers: [], distBest: null, totalStores: 1 };
    expect(scopeHourRecords(data, null)).toBe(data);
  });

  it('narrows stores/recentBreakers/distBest to the given location set', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T12:00:00'));
    const dk = '2026-05-01';
    const LOC2 = '35064';
    const rows = [
      row(LOC,  dk, '07:15', 1000), row(LOC,  dk, '07:30', 1000), row(LOC,  dk, '07:45', 1000), row(LOC,  dk, '08:00', 1000),
      row(LOC2, dk, '07:15', 5000), row(LOC2, dk, '07:30', 5000), row(LOC2, dk, '07:45', 5000), row(LOC2, dk, '08:00', 5000),
    ];
    const data = computeHourRecords({ qsrSalesQtrHourRows: rows }, { windowDays: 9999 });
    const scoped = scopeHourRecords(data, [LOC]);
    expect(Object.keys(scoped.stores)).toEqual([LOC]);
    expect(scoped.distBest.loc).toBe(LOC);
    expect(scoped.totalStores).toBe(1);
    expect(scoped.recentBreakers.every(b => b.loc === LOC)).toBe(true);
  });
});

describe('windowLabel', () => {
  it('formats a plain same-day window', () => {
    expect(windowLabel(7 * 60, 8 * 60)).toBe('7:00 AM – 8:00 AM');
  });
  it('formats a wrapped post-midnight window using wall-clock time', () => {
    expect(windowLabel(25 * 60, 26 * 60)).toBe('1:00 AM – 2:00 AM');
  });
  it('formats noon/midnight boundaries correctly', () => {
    expect(windowLabel(0, 60)).toBe('12:00 AM – 1:00 AM');
    expect(windowLabel(12 * 60, 13 * 60)).toBe('12:00 PM – 1:00 PM');
  });
});
