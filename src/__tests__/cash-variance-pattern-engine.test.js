// Reports redesign Tier 3 -- engine/cash-variance-pattern.js
import { describe, it, expect } from 'vitest';
import { buildCashVariancePatternReport, CASH_VARIANCE_METRICS } from '../engine/cash-variance-pattern.js';

// 2026-10-04 is a Sunday; 21 consecutive days = exactly 3 occurrences of every day-of-week,
// meeting MIN_DAYS (3) exactly for each bucket.
const D = (d) => new Date(2026, 9, 4 + d); // Oct 4, 2026 + d days
const range = { s: '2026-10-04', e: '2026-10-24' };

function buildCtrlRows(mondayCashOSPct) {
  const rows = [];
  for (let d = 0; d < 21; d++) {
    const date = D(d);
    const dow = date.getDay(); // 0=Sun..6=Sat
    rows.push({
      loc: '3708', date,
      // Mondays (dow=1) get a distinct, rising cashOSPct per occurrence so the test can verify
      // a real per-bucket mean, not a global average.
      cashOSPct: dow === 1 ? mondayCashOSPct[Math.floor(d / 7)] : 0.005,
      cashOSAmt: dow === 1 ? 50 : 5,
      posOverCnt: dow === 1 ? 3 : 1,
      posOverAmt: dow === 1 ? 30 : 10,
      manualRefAmt: 2,
      cashRefCnt: 1,
      cashlessRefCnt: 1,
      drawerOpens: 4,
      tRedACnt: 1,
      tRedAPct: 0.01,
    });
  }
  return rows;
}

describe('buildCashVariancePatternReport', () => {
  const ds = { ctrlRows: buildCtrlRows([0.01, 0.02, 0.03]), storeIds: ['3708'] };

  it('returns [] when range is missing', () => {
    expect(buildCashVariancePatternReport(ds, { locs: ['3708'], range: null })).toEqual([]);
  });

  it('produces one row per store per day-of-week with at least MIN_DAYS observed days', () => {
    const rows = buildCashVariancePatternReport(ds, { locs: ['3708'], range });
    // 7 days of week, all meeting the 3-occurrence minimum in this 21-day fixture.
    expect(rows).toHaveLength(7);
    expect(rows.every(r => r.loc === '3708' && r.name === 'Ardmore-Broadway')).toBe(true);
    expect(new Set(rows.map(r => r.dowLabel))).toEqual(new Set([
      'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
    ]));
  });

  it('computes the real per-day-of-week mean, not a global average', () => {
    const rows = buildCashVariancePatternReport(ds, { locs: ['3708'], range });
    const monday = rows.find(r => r.dowLabel === 'Monday');
    const tuesday = rows.find(r => r.dowLabel === 'Tuesday');
    expect(monday.n).toBe(3);
    expect(monday.cashOSPct).toBeCloseTo((0.01 + 0.02 + 0.03) / 3, 6);
    expect(monday.cashOSAmt).toBeCloseTo(50, 6);
    expect(monday.posOverCnt).toBeCloseTo(3, 6);
    // Every other day-of-week carries the flat 0.005/5/1 baseline, clearly distinct from Monday.
    expect(tuesday.cashOSPct).toBeCloseTo(0.005, 6);
    expect(tuesday.cashOSAmt).toBeCloseTo(5, 6);
  });

  it('never carries an employee or register field — store x day-of-week only, by design', () => {
    const rows = buildCashVariancePatternReport(ds, { locs: ['3708'], range });
    for (const r of rows) {
      expect(r.emp).toBeUndefined();
      expect(r.employee).toBeUndefined();
      expect(r.register).toBeUndefined();
      expect(r.cashier).toBeUndefined();
    }
  });

  it('resolves every metric in CASH_VARIANCE_METRICS on a day-of-week with full data', () => {
    const rows = buildCashVariancePatternReport(ds, { locs: ['3708'], range });
    const monday = rows.find(r => r.dowLabel === 'Monday');
    for (const m of CASH_VARIANCE_METRICS) expect(monday[m.key]).not.toBeNull();
  });

  it('omits a day-of-week bucket under MIN_DAYS (thin window)', () => {
    const thinDs = { ctrlRows: buildCtrlRows([0.01, 0.02, 0.03]).slice(0, 10), storeIds: ['3708'] }; // < 2 full weeks
    const rows = buildCashVariancePatternReport(thinDs, { locs: ['3708'], range: { s: '2026-10-04', e: '2026-10-13' } });
    // Only Sun(4,11)/Mon(5,12).../Fri(9) reach 2 occurrences at most within 10 days -- none hit 3.
    expect(rows).toEqual([]);
  });

  it('falls back to ds.storeIds when no locs given', () => {
    const rows = buildCashVariancePatternReport(ds, { locs: [], range });
    expect(new Set(rows.map(r => r.loc))).toEqual(new Set(['3708']));
  });
});
