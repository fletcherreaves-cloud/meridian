// @ts-nocheck
// Lead-time forecast capture (2026-09-11) -- owner asked to compare Meridian's forecast against
// LifeLenz's on a genuinely apples-to-apples lead time (e.g. "LifeLenz's forecast as of the
// Thursday before the work week, 6 days out"), since lifelenz_schedule upserts on (loc,date) and
// so can never answer that retroactively -- only whatever LifeLenz's system last reported for a
// date, effectively day-of. scripts/lifelenz-pull.mjs's buildLeadTimeCaptures() is the pure
// (no-I/O) piece that decides what to write to the new immutable lifelenz_forecast_captures
// table on each daily run. See supabase/schema-lifelenz-forecast-captures.sql.
//
// Imports the REAL exported function, guarded by the script's own
// `if (import.meta.url === ...) main()` check so importing this does not also fire off a live
// LifeLenz pull (same pattern as lifelenz-attendance-pull.test.js).
import { describe, it, expect } from 'vitest';
import { buildLeadTimeCaptures } from '../../scripts/lifelenz-pull.mjs';

const TODAY = '2026-09-11';

describe('buildLeadTimeCaptures', () => {
  it('captures a future date with the correct lead_days, unpadded loc, and captured_date = today', () => {
    const rows = [
      { loc: '0003708', date: '2026-09-17', fcst_sales: 18000, adj_fcst_sales: 17500, sales: null },
    ];
    const out = buildLeadTimeCaptures(rows, TODAY);
    expect(out).toEqual([{
      loc: '3708', target_date: '2026-09-17', captured_date: TODAY,
      lead_days: 6, fcst_sales: 18000, adj_fcst_sales: 17500,
    }]);
  });

  it('excludes a date that is today or already in the past -- only genuinely future forecasts are a "forecast"', () => {
    const rows = [
      { loc: '0003708', date: '2026-09-10', fcst_sales: 17000, sales: 16800 }, // yesterday
      { loc: '0003708', date: TODAY, fcst_sales: 17500, sales: null },         // today itself
      { loc: '0003708', date: '2026-09-12', fcst_sales: 18000, sales: null },  // tomorrow -- kept
    ];
    const out = buildLeadTimeCaptures(rows, TODAY);
    expect(out).toHaveLength(1);
    expect(out[0].target_date).toBe('2026-09-12');
    expect(out[0].lead_days).toBe(1);
  });

  it('excludes a row with no fcst_sales (nothing meaningful to capture)', () => {
    const rows = [{ loc: '0003708', date: '2026-09-20', fcst_sales: null, sales: null }];
    expect(buildLeadTimeCaptures(rows, TODAY)).toEqual([]);
  });

  it('captures every store independently in the same run', () => {
    const rows = [
      { loc: '0003708', date: '2026-09-17', fcst_sales: 18000, sales: null },
      { loc: '0005985', date: '2026-09-17', fcst_sales: 21000, sales: null },
    ];
    const out = buildLeadTimeCaptures(rows, TODAY);
    expect(out.map(r => r.loc).sort()).toEqual(['3708', '5985']);
    expect(out.every(r => r.lead_days === 6)).toBe(true);
  });

  it('the Thursday-6-days-out slice the owner asked for is just a filter on this shape, not a special case', () => {
    // 2026-09-10 is a real Thursday -- captured_date=Thursday + lead_days=6 lands on the
    // following Wednesday, the day Meridian's own business week (and schedule lock) starts.
    const THURSDAY = '2026-09-10';
    expect(new Date(THURSDAY + 'T00:00:00').getDay()).toBe(4); // sanity: confirms THURSDAY really is one
    const rows = [];
    for (let i = 0; i <= 13; i++) {
      const d = new Date(THURSDAY + 'T00:00:00'); d.setDate(d.getDate() + i);
      rows.push({ loc: '0003708', date: d.toISOString().slice(0, 10), fcst_sales: 10000 + i * 100, sales: null });
    }
    const out = buildLeadTimeCaptures(rows, THURSDAY);
    const sixOut = out.find(r => r.lead_days === 6);
    expect(sixOut).toBeTruthy();
    expect(sixOut.target_date).toBe('2026-09-16'); // the Wednesday the following work week starts
  });
});
