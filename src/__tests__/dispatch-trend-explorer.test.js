// @ts-nocheck
// Tests for src/engine/trend-explorer.js — the pure aggregation/diagnostic helpers behind the
// Trend Explorer panel (owner-requested 2026-09-05, memory/project-trends-panel.md). Covers the
// part most likely to be wrong: bucketing a daily series up to weekly/monthly/yearly correctly
// (sum vs. average, matching extractMetricValues' own convention), the day-of-week breakdown
// that directly answers "controlled on xx days, struggles on xx days," and the thin filter over
// Scanner's own correlation output for the "cross-verify impact" half of the ask.
import { describe, it, expect } from 'vitest';
import { bucketMetricSeries, filterSeriesToRange, dayOfWeekBreakdown, correlatedMetricsFor } from '../engine/trend-explorer.js';

// A raw {loc,date,value}[] series exactly like extractMetricValues() returns, spanning exactly
// two of this app's own business weeks -- utils/date.js's weekStartOf() defaults to WEDNESDAY
// (McDonald's business-week convention, _weekStartDay = 3), not Sunday/Monday, so the fixture
// starts on a real Wednesday (2026-09-02) for 14 clean days = 2 whole weeks under that
// convention. A real weekday pattern (weekends higher) is baked in so the day-of-week +
// weekly-bucket tests have something real to find.
function fixtureSeries() {
  const rows = [];
  const start = new Date('2026-09-02T00:00:00'); // a Wednesday -- this app's own week start
  for (let i = 0; i < 14; i++) {
    const d = new Date(start); d.setDate(d.getDate() + i);
    const dow = d.getDay(); // 0=Sun..6=Sat
    const value = (dow === 0 || dow === 6) ? 100 : 50; // weekends run higher
    rows.push({ loc: '03708', date: d, value });
  }
  return rows;
}

// A second fixture, same weekday-pattern generator, but starting one week earlier (also a
// Wednesday) so it deliberately crosses the August/September month boundary -- used only by the
// monthly/yearly test below, kept separate from fixtureSeries() so that test's month-crossing
// doesn't disturb the plain 2-clean-weeks assumption the weekly-bucket tests rely on.
function crossMonthFixture() {
  const rows = [];
  const start = new Date('2026-08-26T00:00:00'); // also a Wednesday
  for (let i = 0; i < 14; i++) {
    const d = new Date(start); d.setDate(d.getDate() + i);
    const dow = d.getDay();
    const value = (dow === 0 || dow === 6) ? 100 : 50;
    rows.push({ loc: '03708', date: d, value });
  }
  return rows;
}

describe('bucketMetricSeries', () => {
  it('daily: one bucket per calendar day, value unchanged', () => {
    const buckets = bucketMetricSeries(fixtureSeries(), 'daily');
    expect(buckets).toHaveLength(14);
    expect(buckets[0].period).toBe('2026-09-02');
    expect(buckets[0].value).toBe(50); // Wednesday
  });

  it('weekly with aggregate:"avg" averages the 7 days in each week (never sums a rate metric)', () => {
    const buckets = bucketMetricSeries(fixtureSeries(), 'weekly', 'avg');
    expect(buckets).toHaveLength(2);
    // Each 7-day week here has 5 weekdays @50 + 2 weekend days @100 = (5*50+2*100)/7
    const expected = (5 * 50 + 2 * 100) / 7;
    expect(buckets[0].value).toBeCloseTo(expected, 5);
    expect(buckets[0].n).toBe(7);
  });

  it('weekly with aggregate:"sum" sums instead — matches signal-registry.js\'s own metric.aggregate:\'sum\' convention', () => {
    const buckets = bucketMetricSeries(fixtureSeries(), 'weekly', 'sum');
    expect(buckets[0].value).toBe(5 * 50 + 2 * 100);
  });

  it('monthly and yearly bucket correctly across a real month boundary', () => {
    const monthly = bucketMetricSeries(crossMonthFixture(), 'monthly', 'avg');
    const yearly = bucketMetricSeries(crossMonthFixture(), 'yearly', 'avg');
    // crossMonthFixture spans Aug 26 - Sep 8, 2026 -- two different months, one year.
    expect(monthly.length).toBe(2);
    expect(yearly.length).toBe(1);
    expect(yearly[0].period).toBe('2026');
    expect(yearly[0].n).toBe(14);
  });

  it('skips null/NaN values rather than corrupting the bucket average', () => {
    const rows = [
      { loc: '03708', date: new Date('2026-09-01T00:00:00'), value: 10 },
      { loc: '03708', date: new Date('2026-09-02T00:00:00'), value: null },
      { loc: '03708', date: new Date('2026-09-03T00:00:00'), value: NaN },
      { loc: '03708', date: new Date('2026-09-04T00:00:00'), value: 20 },
    ];
    const buckets = bucketMetricSeries(rows, 'monthly', 'avg');
    expect(buckets).toHaveLength(1);
    expect(buckets[0].n).toBe(2);
    expect(buckets[0].value).toBe(15);
  });
});

describe('filterSeriesToRange', () => {
  it('keeps only rows within [s,e] inclusive, applied BEFORE bucketing', () => {
    const filtered = filterSeriesToRange(fixtureSeries(), '2026-09-02', '2026-09-08'); // week 1
    expect(filtered).toHaveLength(7);
    expect(filtered.every(r => {
      const k = r.date.toISOString().slice(0, 10);
      return k >= '2026-09-02' && k <= '2026-09-08';
    })).toBe(true);
  });

  it('a partial week still only aggregates the in-range days once bucketed', () => {
    const filtered = filterSeriesToRange(fixtureSeries(), '2026-09-12', '2026-09-14'); // Sat+Sun+Mon of week 2
    const buckets = bucketMetricSeries(filtered, 'weekly', 'avg');
    expect(buckets).toHaveLength(1);
    expect(buckets[0].n).toBe(3); // not the full 7
  });

  it('no range (s or e missing) returns the series unfiltered', () => {
    const series = fixtureSeries();
    expect(filterSeriesToRange(series, null, null)).toBe(series);
  });
});

describe('dayOfWeekBreakdown -- THE POINT: "controlled on xx days, struggles on xx days"', () => {
  it('surfaces the exact weekday pattern baked into the fixture', () => {
    const rows = dayOfWeekBreakdown(fixtureSeries(), 'avg');
    expect(rows).toHaveLength(7);
    const sat = rows.find(r => r.label === 'Sat');
    const mon = rows.find(r => r.label === 'Mon');
    expect(sat.value).toBe(100);
    expect(mon.value).toBe(50);
    expect(sat.n).toBe(2); // two Saturdays in the 14-day fixture
  });

  it('a weekday with zero observations reports value:null, n:0 rather than dividing by zero', () => {
    const oneDayOnly = [{ loc: '03708', date: new Date('2026-09-01T00:00:00'), value: 10 }]; // a Tuesday
    const rows = dayOfWeekBreakdown(oneDayOnly, 'avg');
    const wed = rows.find(r => r.label === 'Wed');
    expect(wed.value).toBeNull();
    expect(wed.n).toBe(0);
  });
});

describe('correlatedMetricsFor -- reuses Scanner\'s own output, does not recompute correlation', () => {
  const scanResults = [
    { xKey: 'laborPct', yKey: 'calFri', xLabel: 'Labor % of Sales', yLabel: 'Friday', xCat: 'Labor', yCat: 'Calendar', r: 0.42, n: 60 },
    { xKey: 'sales', yKey: 'laborPct', xLabel: 'Daily Sales', yLabel: 'Labor % of Sales', xCat: 'Sales', yCat: 'Labor', r: -0.61, n: 60 },
    { xKey: 'oepe', yKey: 'kvst', xLabel: 'OEPE', yLabel: 'KVS Time', xCat: 'Service', yCat: 'Service', r: 0.55, n: 60 },
  ];

  it('filters to only the pairs involving the selected metric, sorted by |r| desc', () => {
    const rows = correlatedMetricsFor(scanResults, 'laborPct');
    expect(rows).toHaveLength(2);
    expect(rows[0].other.key).toBe('sales'); // |r|=0.61, the stronger of the two
    expect(rows[1].other.key).toBe('calFri'); // |r|=0.42
  });

  it('normalizes "other metric" regardless of whether the selected key was x or y', () => {
    const rows = correlatedMetricsFor(scanResults, 'laborPct');
    const friRow = rows.find(r => r.other.key === 'calFri');
    expect(friRow.other.label).toBe('Friday');
    expect(friRow.other.category).toBe('Calendar');
  });

  it('a metric with no correlated pairs returns an empty array, not an error', () => {
    expect(correlatedMetricsFor(scanResults, 'nonexistentMetric')).toEqual([]);
  });

  it('respects the limit', () => {
    expect(correlatedMetricsFor(scanResults, 'laborPct', 1)).toHaveLength(1);
  });
});
