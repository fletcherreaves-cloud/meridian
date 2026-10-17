// @ts-nocheck
// qsr_fob is a MONTH-TO-DATE CUMULATIVE snapshot per (loc, date) -- confirmed in
// src/views/at-a-glance.js's own comment and fobByMonth/fobAgg logic. extractMetricValues'
// 'monthly' path used to average every day's cumulative value for the 7 FOB-sourced metrics
// bridged through AUTO_FIRST_KEY_MAP (fobPct/compWaste/rawWaste/statVar/condiment/empMeal/
// unexplained), which understates the real monthly ratio -- a monotonically growing curve's
// mean sits below its endpoint. Fixed to take the LATEST dated row's value per (loc, month)
// instead, matching at-a-glance.js's own fobByMonth convention.
import { describe, it, expect } from 'vitest';
import { extractMetricValues } from '../engine/signal-registry.js';

const LOC = '3708';

// 30 daily rows, each a growing cumulative MTD snapshot: day N's compWasteAmt/prodSalesAmt =
// 150*N / 10000*N = a CONSTANT 1.5% ratio per day, but the RAW cumulative legs grow all month.
function buildMonthRows(year, month, throughDay) {
  const rows = [];
  for (let day = 1; day <= throughDay; day++) {
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    rows.push({ loc: '0003708', date: iso, prodSalesAmt: 10000 * day, compWasteAmt: 150 * day });
  }
  return rows;
}

describe('extractMetricValues — FOB monthly rollup no longer averages a cumulative MTD snapshot', () => {
  it('compWaste at monthly granularity returns the LAST day\'s value, not the mean of all 30 cumulative days', () => {
    const qsrFobRows = buildMonthRows(2026, 9, 30);
    const ds = { qsrFobRows, storeIds: [LOC] };
    const monthly = extractMetricValues('compWaste', ds, 'monthly', LOC);
    expect(monthly).toHaveLength(1);
    // Day 30's cumulative ratio = 150*30/10000*30 = 0.015 exactly (the real month-end figure).
    expect(monthly[0].value).toBeCloseTo(0.015, 6);
  });

  it('the old mean-of-cumulative-days bug would have understated the ratio -- proving the fix actually changed behavior', () => {
    // Construct a case where the ratio ITSELF drifts across the month (not constant like the
    // fixture above), so mean-of-daily-cumulative and latest-day diverge measurably. Leg grows
    // linearly (50/day) while sales stays flat -- cumulative ratio rises through the month, so
    // the (wrong) mean of all days sits well below day 30's real end-of-month ratio.
    const rows = [];
    for (let day = 1; day <= 30; day++) {
      const iso = `2026-09-${String(day).padStart(2, '0')}`;
      rows.push({ loc: '0003708', date: iso, prodSalesAmt: 300000, compWasteAmt: 50 * day });
    }
    const ds = { qsrFobRows: rows, storeIds: [LOC] };
    const monthly = extractMetricValues('compWaste', ds, 'monthly', LOC);
    const realEndOfMonth = (50 * 30) / 300000; // 1500/300000 = 0.005
    expect(monthly[0].value).toBeCloseTo(realEndOfMonth, 6);
    // The old (wrong) behavior would have been close to the mean of day 1..30's ratios, which
    // for a linearly-growing numerator over a constant denominator is roughly half the endpoint.
    const wrongMean = rows.reduce((a, r) => a + r.compWasteAmt / r.prodSalesAmt, 0) / rows.length;
    expect(wrongMean).toBeLessThan(realEndOfMonth * 0.6);
    expect(monthly[0].value).not.toBeCloseTo(wrongMean, 4);
  });

  it('picks the latest row even when daily rows arrive out of date order', () => {
    const rows = [
      { loc: '0003708', date: '2026-09-15', prodSalesAmt: 150000, compWasteAmt: 750 },
      { loc: '0003708', date: '2026-09-30', prodSalesAmt: 300000, compWasteAmt: 1800 }, // true month-end
      { loc: '0003708', date: '2026-09-05', prodSalesAmt: 50000, compWasteAmt: 200 },
    ];
    const ds = { qsrFobRows: rows, storeIds: [LOC] };
    const monthly = extractMetricValues('compWaste', ds, 'monthly', LOC);
    expect(monthly[0].value).toBeCloseTo(1800 / 300000, 6);
  });

  it('a genuinely per-day-independent metric (laborPct) is unaffected -- still mean-of-daily', () => {
    const opsLaborRows = [
      { loc: '3708', date: new Date('2026-09-01'), laborDollar: 2000 },
      { loc: '3708', date: new Date('2026-09-02'), laborDollar: 3000 },
    ];
    const laborRows = [
      { loc: '3708', date: new Date('2026-09-01'), sales: 10000 },
      { loc: '3708', date: new Date('2026-09-02'), sales: 10000 },
    ];
    const ds = { opsLaborRows, laborRows, storeIds: [LOC] };
    const monthly = extractMetricValues('laborPct', ds, 'monthly', LOC);
    // day1 ratio 0.20, day2 ratio 0.30 -> mean 0.25 (unchanged generic behavior, not latest-only 0.30)
    expect(monthly[0].value).toBeCloseTo(0.25, 6);
  });

  it('fobPct, rawWaste, statVar, condiment, empMeal, unexplained all take the same latest-row treatment', () => {
    const rows = [];
    for (let day = 1; day <= 10; day++) {
      const iso = `2026-09-${String(day).padStart(2, '0')}`;
      rows.push({
        loc: '0003708', date: iso, prodSalesAmt: 10000 * day,
        rawWasteAmt: 100 * day, compWasteAmt: 150 * day, condimentsAmt: 80 * day,
        empMgrMealsAmt: 40 * day, statVarianceAmt: 60 * day, unexplainedAmt: 10 * day,
      });
    }
    const ds = { qsrFobRows: rows, storeIds: [LOC] };
    for (const [key, expected] of [
      ['fobPct', (100 + 150 + 80 + 40 + 60 + 10) * 10 / (10000 * 10)],
      ['rawWaste', (100 * 10) / (10000 * 10)],
      ['statVar', (60 * 10) / (10000 * 10)],
      ['condiment', (80 * 10) / (10000 * 10)],
      ['empMeal', (40 * 10) / (10000 * 10)],
      ['unexplained', (10 * 10) / (10000 * 10)],
    ]) {
      const monthly = extractMetricValues(key, ds, 'monthly', LOC);
      expect(monthly[0].value, key).toBeCloseTo(expected, 6);
    }
  });
});
