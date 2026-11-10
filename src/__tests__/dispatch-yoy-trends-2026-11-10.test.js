import { describe, it, expect } from 'vitest';
import { computeYoyMonthlySeries, yoyMetricAgg, yoyFetchDaysBack, youngStoreFlags, MONTH_NAMES } from '../engine/yoy-trend.js';

const d = s => new Date(s + 'T00:00:00');

describe('yoyMetricAgg', () => {
  it('sum for volume metrics, rate for ratio-derive metrics (reads straight off metric-source.js)', () => {
    expect(yoyMetricAgg('sales')).toBe('sum');
    expect(yoyMetricAgg('gc')).toBe('sum');
    expect(yoyMetricAgg('laborPct')).toBe('rate');
    expect(yoyMetricAgg('tpph')).toBe('rate');
  });

  it('otHrs is a volume total (summed), not a rate -- same basis as sales/gc', () => {
    expect(yoyMetricAgg('otHrs')).toBe('sum');
  });

  // Regression lock for a real bug caught before shipping: primeCostPct (laborPct + fobPct) is
  // a PERCENTAGE with no registered ratio derive (metric-source.js's rollupCapableMetricKeys()
  // excludes it, since it's a sum of two ratios, not itself a num/den pair) -- an earlier
  // version of yoyMetricAgg used `rollupCapableMetricKeys().includes(key) ? 'rate' : 'sum'`,
  // which put primeCostPct in the 'sum' branch and would have summed 30 days of ~25% readings
  // into something like 750% for a month. It must route through 'rate' (metricRate's
  // mean-of-daily fallback), not 'sum'.
  it('primeCostPct routes through "rate" (mean fallback), never "sum" (would sum raw percentages)', () => {
    expect(yoyMetricAgg('primeCostPct')).toBe('rate');
  });
});

describe('computeYoyMonthlySeries — calendar-month matching', () => {
  // Real-shaped rows for one store, two complete months (June) across 3 calendar years, plus a
  // partial July in the current year -- mirrors the exact shape verified against live
  // qsr_daily_activity_rollup data (store 0003708/loc '3708') before this engine shipped.
  function rowsFor(loc) {
    const rows = [];
    // June each year: 2 days of real sales (enough to prove exact calendar-month summing without
    // needing 30 fixture rows per month).
    for (const [y, a, b] of [[2024, 1000, 1100], [2025, 1200, 1300], [2026, 1400, 1500]]) {
      rows.push({ loc, date: d(`${y}-06-01`), sales: a });
      rows.push({ loc, date: d(`${y}-06-02`), sales: b });
    }
    // Partial July 2026 (current year, "today" = 2026-07-10) -- only the first 3 days loaded,
    // simulating a still-in-progress month.
    rows.push({ loc, date: d('2026-07-01'), sales: 500 });
    rows.push({ loc, date: d('2026-07-02'), sales: 500 });
    rows.push({ loc, date: d('2026-07-03'), sales: 500 });
    // A day AFTER "today" that must never be counted (would be zero-filled DAR noise in prod).
    rows.push({ loc, date: d('2026-07-15'), sales: 999999 });
    return rows;
  }

  // A long-established store (first real trading observed well over 24 months before the
  // oldest displayed year) so the honeymoon-ramp guard never fires on this fixture set.
  function establishedPrefix(loc) {
    return [
      { loc, date: d('2015-01-01'), transactions: 500 },
      { loc, date: d('2015-01-02'), transactions: 500 },
    ];
  }

  function makeDs(loc) {
    return { qsrActSummaryRows: [...establishedPrefix(loc), ...rowsFor(loc)], laborRows: [] };
  }

  it('matches each month to the SAME calendar month N years back, not a 364-day shift', () => {
    const ds = makeDs('3708');
    const r = computeYoyMonthlySeries(ds, { metricKey: 'sales', locs: ['3708'], yearsBack: 2, asOf: '2026-07-10' });
    expect(r.years).toEqual([2026, 2025, 2024]);
    const june = r.months.find(m => m.label === 'Jun');
    expect(june.byYear[2026].value).toBe(2900); // 1400+1500
    expect(june.byYear[2025].value).toBe(2500); // 1200+1300
    expect(june.byYear[2024].value).toBe(2100); // 1000+1100
  });

  it('clamps the in-progress current month to "today" and flags it partial — never counts a future day', () => {
    const ds = makeDs('3708');
    const r = computeYoyMonthlySeries(ds, { metricKey: 'sales', locs: ['3708'], yearsBack: 1, asOf: '2026-07-10' });
    const july = r.months.find(m => m.label === 'Jul');
    expect(july.byYear[2026].value).toBe(1500); // 500+500+500, NOT +999999 from 07-15
    expect(july.byYear[2026].partial).toBe(true);
    expect(july.byYear[2026].e).toBe('2026-07-10');
  });

  it('a month not yet reached in the current year is null, never a fabricated zero', () => {
    const ds = makeDs('3708');
    const r = computeYoyMonthlySeries(ds, { metricKey: 'sales', locs: ['3708'], yearsBack: 1, asOf: '2026-07-10' });
    const dec = r.months.find(m => m.label === 'Dec');
    expect(dec.byYear[2026]).toBeNull();
    expect(dec.byYear[2025]).not.toBeNull(); // prior year's December should still attempt to resolve
  });

  it('a prior year with no data resolves to value:null, not a crash or a zero', () => {
    const ds = makeDs('3708');
    const r = computeYoyMonthlySeries(ds, { metricKey: 'sales', locs: ['3708'], yearsBack: 2, asOf: '2026-07-10' });
    const jan = r.months.find(m => m.label === 'Jan');
    expect(jan.byYear[2026].value).toBeNull();
    expect(jan.byYear[2025].value).toBeNull();
  });
});

describe('yoyFetchDaysBack — the fetch-depth trap (caught before shipping)', () => {
  it('fetches meaningfully more than just the display window (margin for the honeymoon-ramp check)', () => {
    const displayDays = 3 * 365; // 3 years on screen (yearsBack=2)
    const fetchDays = yoyFetchDaysBack(2, 24, '2026-07-10');
    expect(fetchDays).toBeGreaterThan(displayDays + 365 * 2); // generous margin, not a knife-edge
  });
});

describe('young-store honeymoon-ramp guard (generalized from vs-ly.js lyQuality)', () => {
  // Exact fixtures from src/__tests__/vs-ly.test.js's own Tishomingo case (loc 43380, opened
  // 2024-12-16) -- reused rather than re-invented, per the "check whether a helper/fixture
  // exists" standing rule.
  const tishomingoRows = [
    { loc: '43380', date: d('2024-12-13'), transactions: 14 },
    { loc: '43380', date: d('2024-12-14'), transactions: 0 },
    { loc: '43380', date: d('2024-12-15'), transactions: 0 },
    { loc: '43380', date: d('2024-12-16'), transactions: 816 },
    { loc: '43380', date: d('2024-12-17'), transactions: 1224 },
  ];
  const establishedRows = [
    { loc: '3708', date: d('2015-01-01'), transactions: 500 },
    { loc: '3708', date: d('2015-01-02'), transactions: 500 },
  ];

  it('flags a store whose window reaches back into its own honeymoon ramp', () => {
    const ds = { qsrActSummaryRows: tishomingoRows };
    const flagged = youngStoreFlags(ds, ['43380'], { oldestYearStart: '2025-01-01' });
    expect(flagged).toHaveLength(1);
    expect(flagged[0].loc).toBe('43380');
    expect(flagged[0].monthsOld).toBeLessThan(24);
  });

  it('does not flag a long-established store', () => {
    const ds = { qsrActSummaryRows: establishedRows };
    const flagged = youngStoreFlags(ds, ['3708'], { oldestYearStart: '2025-01-01' });
    expect(flagged).toHaveLength(0);
  });

  it('never flags on missing data (safe non-flagging default, matches vs-ly.js\'s own contract)', () => {
    const flagged = youngStoreFlags({ qsrActSummaryRows: [] }, ['3708'], { oldestYearStart: '2025-01-01' });
    expect(flagged).toHaveLength(0);
  });

  it('EXCLUDES a flagged store from a multi-store rolled-up line (whole-line composition rule)', () => {
    const ds = {
      qsrActSummaryRows: [
        ...tishomingoRows,
        ...establishedRows,
        { loc: '43380', date: d('2026-06-01'), sales: 1000 },
        { loc: '3708', date: d('2026-06-01'), sales: 500 },
      ],
    };
    const r = computeYoyMonthlySeries(ds, { metricKey: 'sales', locs: ['43380', '3708'], yearsBack: 1, asOf: '2026-07-10' });
    expect(r.excludedLocs).toEqual(['43380']);
    expect(r.usableLocs).toEqual(['3708']);
    const june = r.months.find(m => m.label === 'Jun');
    expect(june.byYear[2026].value).toBe(500); // 43380's 1000 must NOT be included
  });

  it('does NOT exclude a single explicitly-selected young store -- surfaces the flag instead', () => {
    const ds = {
      qsrActSummaryRows: [
        ...tishomingoRows,
        { loc: '43380', date: d('2026-06-01'), sales: 1000 },
      ],
    };
    const r = computeYoyMonthlySeries(ds, { metricKey: 'sales', locs: ['43380'], yearsBack: 1, asOf: '2026-07-10' });
    expect(r.excludedLocs).toEqual([]);
    expect(r.usableLocs).toEqual(['43380']);
    expect(r.flagged).toHaveLength(1); // still surfaced for the UI caveat banner
    const june = r.months.find(m => m.label === 'Jun');
    expect(june.byYear[2026].value).toBe(1000); // data is shown, not silently dropped
  });
});

describe('MONTH_NAMES', () => {
  it('is the standard 12-entry Jan..Dec list', () => {
    expect(MONTH_NAMES).toHaveLength(12);
    expect(MONTH_NAMES[0]).toBe('Jan');
    expect(MONTH_NAMES[11]).toBe('Dec');
  });
});
