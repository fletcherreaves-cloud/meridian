// @ts-nocheck
// lifelenz.js's groupDaysByWeek had zero direct test coverage despite being live: called from
// LifeLenzBridgePanel's real render path to build the "Weekly View" toggle.
import { describe, it, expect } from 'vitest';
import { groupDaysByWeek } from '../features/lifelenz.js';

// Aug 10 2026 and Aug 17 2026 are both Mondays; Aug 12/19 are the Wednesdays in each of
// those weeks -- verified independently via Date#getDay(), not re-derived from the function
// under test.
const MON1 = new Date(2026, 7, 10), WED1 = new Date(2026, 7, 12), MON2 = new Date(2026, 7, 17);

describe('groupDaysByWeek', () => {
  it('groups days falling in the same week (Monday start) together', () => {
    const days = [{ date: MON1, adjustmentPct: 5 }, { date: WED1, adjustmentPct: 15 }, { date: MON2, adjustmentPct: 10 }];
    const groups = groupDaysByWeek(days, 1);
    expect(groups).toHaveLength(2);
    expect(groups[0].days).toHaveLength(2);
    expect(groups[1].days).toHaveLength(1);
  });

  it('sets weekStart to the Monday and weekEnd 6 days later', () => {
    const groups = groupDaysByWeek([{ date: WED1, adjustmentPct: 5 }], 1);
    expect(groups[0].weekStart.getTime()).toBe(MON1.getTime());
    expect(groups[0].weekEnd.getDate()).toBe(16); // Aug 10 + 6 = Aug 16
  });

  it('averages adjustmentPct across the days in each week', () => {
    const days = [{ date: MON1, adjustmentPct: 5 }, { date: WED1, adjustmentPct: 15 }];
    expect(groupDaysByWeek(days, 1)[0].avgAdjPct).toBe(10);
  });

  it('sorts the returned groups by weekStart ascending, regardless of input order', () => {
    const days = [{ date: MON2, adjustmentPct: 10 }, { date: MON1, adjustmentPct: 5 }];
    const groups = groupDaysByWeek(days, 1);
    expect(groups[0].weekStart.getTime()).toBe(MON1.getTime());
    expect(groups[1].weekStart.getTime()).toBe(MON2.getTime());
  });

  it('returns an empty array for no days', () => {
    expect(groupDaysByWeek([], 1)).toEqual([]);
  });
});
