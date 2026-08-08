// @ts-nocheck
// Notes 61 #12: Ponce de Leon (43701) reported "recentOnly window starts 2027-04-16" — a date
// eight months in the future, which reads like corruption. It was arithmetic:
// _windowStart = cleanStart + 399 days, and the store opened 2026-03-13.
//
// Measured against live Supabase on 2026-08-08: 43701 has 133 rows spanning 2026-03-13 ->
// 2026-07-23 and ZERO rows before 2026. Dialed-In is an LY-based model — fetchLY resolves ~364
// days back and every row without a real LY is dropped — so the store cannot be calibrated at
// all until it has a year of history. Widening the window would not help; the rows die on
// lyRaw<=0 either way.
//
// So this is a STATUS, not a failure. calibrateStore now detects it up front and returns
// _notYetEligible with the dates, and the panel renders it neutrally instead of as a red error
// beside genuine failures.

import { describe, it, expect } from 'vitest';
import { calibrateStore } from '../engine/backtest.js';

const dKey = d => d.toISOString().slice(0, 10);
const bIdx = rows => {
  const i = {};
  for (const r of rows) { if (!r.loc || !r.date) continue; (i[r.loc + '_' + dKey(r.date)] ||= []).push(r); }
  return i;
};

// `days` of daily history ending 14 days ago (just inside the eval cutoff).
function dsWithHistory(loc, days) {
  const rows = [];
  const end = new Date(Date.now() - 15 * 864e5);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end); d.setDate(d.getDate() - i);
    rows.push({ loc, date: d, sales: 9000 + (i % 7) * 400 });
  }
  return { laborRows: rows, qsrActSummaryRows: [], opsRows: [], ctrlRows: [], weatherRows: [],
           laborIdx: bIdx(rows), opsIdx: bIdx([]), ctrlIdx: bIdx([]), weatherIdx: {} };
}

describe('calibrateStore — store younger than its own LY lookback', () => {
  it('reports not-yet-eligible instead of a confusing window date', async () => {
    const res = await calibrateStore('99001', dsWithHistory('99001', 140), { weeksBack: 6, _userEvents: {} });

    expect(res._notYetEligible).toBe(true);
    expect(res._why).toMatch(/not yet eligible/);
    expect(res._openedOn).toBeTruthy();
    expect(res._eligibleFrom).toBeTruthy();
    // The old message leaked an internal window boundary; the new one must not.
    expect(res._why).not.toMatch(/recentOnly window/);
  });

  it('eligibility date is exactly one LY lookback after the first row', async () => {
    const ds = dsWithHistory('99002', 100);
    const res = await calibrateStore('99002', ds, { weeksBack: 6, _userEvents: {} });

    const first = ds.laborRows[0].date;
    const expected = new Date(first.getTime() + 364 * 864e5);
    expect(res._eligibleFrom).toBe(dKey(expected));
    expect(res._historyDays).toBe(99);   // 100 rows spanning 99 day-gaps
  });

  it('does NOT fire for a store with more than a year of history', async () => {
    // The guard must not swallow stores that are merely small or noisy — only ones that are
    // arithmetically too young. This one has ~2 years, so it proceeds past the check.
    const res = await calibrateStore('99003', dsWithHistory('99003', 730), { weeksBack: 6, _userEvents: {} });

    expect(res._notYetEligible).toBeUndefined();
  });

  it('an empty store is not misreported as too-new', async () => {
    const empty = { laborRows: [], qsrActSummaryRows: [], opsRows: [], ctrlRows: [], weatherRows: [],
                    laborIdx: {}, opsIdx: {}, ctrlIdx: {}, weatherIdx: {} };
    const res = await calibrateStore('99004', empty, { weeksBack: 6, _userEvents: {} });

    expect(res._notYetEligible).toBeUndefined();   // no rows at all is a different condition
    expect(res._why).toBeTruthy();
  });
});
