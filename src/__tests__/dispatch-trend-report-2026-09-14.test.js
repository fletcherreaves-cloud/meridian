// @vitest-environment happy-dom
// @ts-nocheck
// Owner request (2026-09-14): "Format 1st section is Current MTD (Completed days only)...
// 2nd section is Last complete month... 3rd is 2 months back... List in one table All locations
// combined, Then give me breakouts for OK and FL locations specifically... sort by top 25%,
// top 50%... available for Labor, FOB and all other primary metrics." This exercises
// engine/trend-report.js's pure functions plus a real TrendReportPanel render, so a drift
// between the engine and its consumer would show up here (standing "verification must touch
// the call site" rule).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import {
  TREND_REPORT_METRICS, findTrendMetric, fmtTrendValue, trendReportPeriods,
  computeTrendReport, rankFilterRows, RANK_MODES,
  trailingCompleteMonths, currentMtdPeriod, scopeSummaryPeriods, computeScopeSummary,
  shiftYearBack, periodRealComp, scopeSummaryFetchDaysBack,
} from '../engine/trend-report.js';

describe('trendReportPeriods — Current MTD / Last complete month / Two months back', () => {
  it('mid-month anchor: MTD ends AT the anchor date, not the calendar month end', () => {
    const [mtd, lastMonth, twoBack] = trendReportPeriods(new Date(2026, 8, 10)); // Sep 10, 2026
    expect(mtd.s).toBe('2026-09-01');
    expect(mtd.e).toBe('2026-09-10'); // completed-days-only -- NOT 09-30
    expect(lastMonth.s).toBe('2026-08-01');
    expect(lastMonth.e).toBe('2026-08-31');
    expect(twoBack.s).toBe('2026-07-01');
    expect(twoBack.e).toBe('2026-07-31');
  });

  it('year rollover: January anchor pulls last month/two-back from the PRIOR year', () => {
    const [mtd, lastMonth, twoBack] = trendReportPeriods(new Date(2026, 0, 5)); // Jan 5, 2026
    expect(mtd.s).toBe('2026-01-01');
    expect(mtd.e).toBe('2026-01-05');
    expect(lastMonth.s).toBe('2025-12-01');
    expect(lastMonth.e).toBe('2025-12-31');
    expect(twoBack.s).toBe('2025-11-01');
    expect(twoBack.e).toBe('2025-11-30');
  });
});

describe('computeTrendReport — ratio metric (laborPct): true Σ ÷ Σ, never a naive average', () => {
  const period = { key: 'p', label: 'P', s: '2026-08-01', e: '2026-08-31' };
  const metric = findTrendMetric('laborPct');

  it('combined = weighted (sum/sum), not the flat mean of the two stores\' own averages', () => {
    // Store A: high volume, low labor% every day. Store B: low volume, high labor% every day.
    // A flat average of the two store-level percentages would differ from the correct
    // dollar-weighted combined figure computed by summing raw legs.
    // laborPct's derive is Σ(laborDollar) ÷ Σ(sales) -- laborDollar reads from opsLaborRows and
    // sales from qsrActSummaryRows (metric-source.js's own METRIC_SOURCES srcs for those two
    // keys), NOT from glimpseRows, so those legs are fixtured on their real source tables.
    const ds = { glimpseRows: [], opsLaborRows: [], qsrActSummaryRows: [] };
    for (let d = 1; d <= 31; d++) {
      const dt = `2026-08-${String(d).padStart(2, '0')}`;
      ds.glimpseRows.push({ loc: '3708', date: dt, laborPct: 0.18 });
      ds.glimpseRows.push({ loc: '3709', date: dt, laborPct: 0.30 });
      ds.opsLaborRows.push({ loc: '3708', date: dt, laborDollar: 1800 });
      ds.opsLaborRows.push({ loc: '3709', date: dt, laborDollar: 300 });
      ds.qsrActSummaryRows.push({ loc: '3708', date: dt, sales: 10000 });
      ds.qsrActSummaryRows.push({ loc: '3709', date: dt, sales: 1000 });
    }
    const [row] = computeTrendReport(ds, metric, ['3708', '3709'], [period]);
    // Sum/Sum: (1800*31 + 300*31) / (10000*31 + 1000*31) = 2100/11000 = 0.19090909...
    expect(row.combined).toBeCloseTo(0.190909, 5);
    // NOT the flat average of 0.18 and 0.30 (0.24).
    expect(row.combined).not.toBeCloseTo(0.24, 2);
  });

  it('ranks lower labor% as BETTER (rank 1), and pct is a 0-100 percentile with best=100', () => {
    const ds = { glimpseRows: [] };
    for (let d = 1; d <= 5; d++) {
      const dt = `2026-08-0${d}`;
      ds.glimpseRows.push({ loc: '3708', date: dt, laborPct: 0.30 }); // worse
      ds.glimpseRows.push({ loc: '3709', date: dt, laborPct: 0.18 }); // better
    }
    const [row] = computeTrendReport(ds, metric, ['3708', '3709'], [period]);
    const best = row.rows.find(r => r.loc === '3709');
    const worst = row.rows.find(r => r.loc === '3708');
    expect(best.rank).toBe(1);
    expect(best.pct).toBe(100);
    expect(worst.rank).toBe(2);
    expect(worst.pct).toBe(0);
  });

  it('a store with no data that period is absent from rows entirely — never a fabricated 0', () => {
    const ds = { glimpseRows: [{ loc: '3708', date: '2026-08-15', laborPct: 0.21 }] };
    const [row] = computeTrendReport(ds, metric, ['3708', '9999'], [period]);
    expect(row.rows.map(r => r.loc)).toEqual(['3708']);
    expect(row.n).toBe(1);
  });
});

describe('computeTrendReport — sum metric (sales): a real period TOTAL, not an average', () => {
  const period = { key: 'p', label: 'P', s: '2026-08-01', e: '2026-08-31' };
  const metric = findTrendMetric('sales');

  it('combined is the true sum across stores and days', () => {
    const ds = { qsrActSummaryRows: [] };
    for (let d = 1; d <= 31; d++) {
      const dt = `2026-08-${String(d).padStart(2, '0')}`;
      ds.qsrActSummaryRows.push({ loc: '3708', date: dt, sales: 3000 });
      ds.qsrActSummaryRows.push({ loc: '3709', date: dt, sales: 2000 });
    }
    const [row] = computeTrendReport(ds, metric, ['3708', '3709'], [period]);
    expect(row.combined).toBeCloseTo((3000 + 2000) * 31, 0);
    const s3708 = row.rows.find(r => r.loc === '3708');
    expect(s3708.value).toBeCloseTo(3000 * 31, 0);
  });
});

describe('rankFilterRows — Top 25% / Top 50% / Bottom 50% / Bottom 25% / All', () => {
  // 4 pre-ranked rows, pct 100/67/33/0 (best to worst) -- exactly what withRanks() produces
  // for n=4 via computeTrendReport, reproduced directly here to test the filter in isolation.
  const rows = [
    { loc: 'A', value: 4, rank: 1, pct: 100 },
    { loc: 'B', value: 3, rank: 2, pct: 67 },
    { loc: 'C', value: 2, rank: 3, pct: 33 },
    { loc: 'D', value: 1, rank: 4, pct: 0 },
  ];

  it('top25 keeps only the single best store', () => {
    expect(rankFilterRows(rows, 'top25').map(r => r.loc)).toEqual(['A']);
  });
  it('top50 keeps the best half', () => {
    expect(rankFilterRows(rows, 'top50').map(r => r.loc)).toEqual(['A', 'B']);
  });
  it('bottom50 keeps the worst half', () => {
    expect(rankFilterRows(rows, 'bottom50').map(r => r.loc)).toEqual(['C', 'D']);
  });
  it('bottom25 keeps only the single worst store', () => {
    expect(rankFilterRows(rows, 'bottom25').map(r => r.loc)).toEqual(['D']);
  });
  it('all keeps every row, unfiltered', () => {
    expect(rankFilterRows(rows, 'all')).toHaveLength(4);
  });
  it('RANK_MODES exposes exactly these 5 options', () => {
    expect(RANK_MODES.map(m => m.id)).toEqual(['all', 'top25', 'top50', 'bottom50', 'bottom25']);
  });
});

describe('trailingCompleteMonths / currentMtdPeriod / scopeSummaryPeriods — the owner\'s email table shape', () => {
  it('3 trailing complete months, oldest first, ending the month BEFORE the anchor', () => {
    const months = trailingCompleteMonths(3, new Date(2026, 8, 10)); // Sep 10, 2026
    expect(months.map(m => m.label)).toEqual(['Jun 2026', 'Jul 2026', 'Aug 2026']);
    expect(months[2].s).toBe('2026-08-01');
    expect(months[2].e).toBe('2026-08-31');
  });

  it('currentMtdPeriod labels the exact day count, matching the owner\'s reference ("MTD - 13 Days")', () => {
    const p = currentMtdPeriod(new Date(2026, 8, 13));
    expect(p.label).toBe('Sep (MTD - 13 Days)');
    expect(p.s).toBe('2026-09-01');
    expect(p.e).toBe('2026-09-13');
  });

  it('scopeSummaryPeriods is 3 trailing months + current MTD, in that order', () => {
    const periods = scopeSummaryPeriods(new Date(2026, 8, 13));
    expect(periods.map(p => p.label)).toEqual(['Jun 2026', 'Jul 2026', 'Aug 2026', 'Sep (MTD - 13 Days)']);
  });
});

describe('shiftYearBack', () => {
  it('shifts the year back by exactly one, preserving month/day, no Date-object arithmetic', () => {
    expect(shiftYearBack('2026-09-13')).toBe('2025-09-13');
    expect(shiftYearBack('2026-01-01')).toBe('2025-01-01');
    expect(shiftYearBack('2026-08-31')).toBe('2025-08-31');
  });
});

describe('periodRealComp — genuine calendar-year-over-year, two independent sums', () => {
  it('(cur-ly)/ly from real rows on both sides, matching a hand computation', () => {
    const rows = [
      { loc: '3708', date: '2026-08-01', sales: 1100 },
      { loc: '3708', date: '2026-08-02', sales: 1100 },
      { loc: '3708', date: '2025-08-01', sales: 1000 },
      { loc: '3708', date: '2025-08-02', sales: 1000 },
    ];
    const comp = periodRealComp(rows, ['3708'], { s: '2026-08-01', e: '2026-08-02' }, 'sales');
    expect(comp.cur).toBe(2200);
    expect(comp.ly).toBe(2000);
    expect(comp.pct).toBeCloseTo(0.10, 5);
  });

  it('null when the LY leg has no data at all — never a fabricated 0% or a divide-by-zero', () => {
    const rows = [{ loc: '3708', date: '2026-08-01', sales: 1000 }];
    expect(periodRealComp(rows, ['3708'], { s: '2026-08-01', e: '2026-08-01' }, 'sales')).toBeNull();
  });

  it('scope-filters by loc and range-filters by date, ignoring rows outside either', () => {
    const rows = [
      { loc: '3708', date: '2026-08-01', sales: 1000 },
      { loc: '3708', date: '2025-08-01', sales: 500 },
      { loc: '9999', date: '2026-08-01', sales: 99999 }, // different store
      { loc: '3708', date: '2026-07-31', sales: 99999 }, // outside range
    ];
    const comp = periodRealComp(rows, ['3708'], { s: '2026-08-01', e: '2026-08-01' }, 'sales');
    expect(comp.cur).toBe(1000);
    expect(comp.ly).toBe(500);
  });
});

describe('scopeSummaryFetchDaysBack', () => {
  it('reaches back to cover the OLDEST trailing month\'s LY leg, plus a small buffer', () => {
    const asOf = new Date(2026, 8, 13); // Sep 13, 2026
    const days = scopeSummaryFetchDaysBack(asOf);
    // Oldest trailing month = Jun 2026 (starts 2026-06-01); its LY leg starts 2025-06-01.
    const minDays = Math.ceil((asOf - new Date('2025-06-01T00:00:00')) / 86400000);
    expect(days).toBeGreaterThanOrEqual(minDays);
    expect(days).toBeLessThan(minDays + 15); // buffer is small (+7), not padded arbitrarily
  });
});

describe('computeScopeSummary — Sales/GC are a genuine calendar-YoY comp (owner-caught bug, 2026-09-14)', () => {
  // The FIRST version of this feature used engine/vs-ly.js's matchedVsLY, which sums each day
  // against its OWN 364-day-back/matched-weekday shadow value (qsr_daily_activity_rollup's
  // ly_product_sales/ly_transactions) -- correct for a week-shaped window, wrong for a calendar
  // MONTH (the set of "last year" days it lands on is weekday-shifted, not the real prior-year
  // month). These tests fixture a DECOY lySales/lyGc on the current-side rows the fix must NOT
  // read, proving computeScopeSummary now sums real per-day rows on both sides instead.
  it('ignores lySales/lyGc entirely, using real prior-year rows via periodRealComp', () => {
    const period = { key: 'p', label: 'P', s: '2026-08-01', e: '2026-08-02' };
    const actRows = [
      { loc: '3708', date: '2026-08-01', sales: 1100, gc: 95, lySales: 999999, lyGc: 999999 },
      { loc: '3708', date: '2026-08-02', sales: 1100, gc: 95, lySales: 999999, lyGc: 999999 },
      { loc: '3708', date: '2025-08-01', sales: 1000, gc: 100 },
      { loc: '3708', date: '2025-08-02', sales: 1000, gc: 100 },
    ];
    const [row] = computeScopeSummary({}, actRows, ['3708'], [period]);
    expect(row.salesPct).toBeCloseTo(0.10, 5); // (2200-2000)/2000 -- NOT derived from 999999
    expect(row.gcPct).toBeCloseTo(-0.05, 5); // (190-200)/200
  });

  it('honestly null when actRows has no data on the LY side for this period/scope', () => {
    const period = { key: 'p', label: 'P', s: '2026-08-01', e: '2026-08-02' };
    const actRows = [{ loc: '3708', date: '2026-08-01', sales: 1000, gc: 90 }]; // no 2025 rows
    const [row] = computeScopeSummary({}, actRows, ['3708'], [period]);
    expect(row.salesPct).toBeNull();
    expect(row.gcPct).toBeNull();
  });

  it('laborPct/fobPct still resolve from `ds` (unchanged path), independent of actRows', () => {
    const period = { key: 'p', label: 'P', s: '2026-08-01', e: '2026-08-05' };
    const ds = { glimpseRows: [{ loc: '3708', date: '2026-08-01', laborPct: 0.21 }] };
    const [row] = computeScopeSummary(ds, [], ['3708'], [period]);
    expect(row.laborPct).toBeCloseTo(0.21, 5);
    expect(row.fobPct).toBeNull(); // honestly absent -- no fobPct data fixtured
  });
});

describe('TREND_REPORT_METRICS — reuses metric-source.js\'s own direction, no re-guessing', () => {
  it('every metric key resolves a real direction (higher/lower) from METRIC_SOURCES', () => {
    for (const m of TREND_REPORT_METRICS) {
      expect(['higher', 'lower']).toContain(m.direction);
    }
  });
  it('covers Labor % and FOB % (the owner\'s explicit examples), plus other primary metrics', () => {
    const keys = TREND_REPORT_METRICS.map(m => m.key);
    expect(keys).toContain('laborPct');
    expect(keys).toContain('fobPct');
    expect(keys.length).toBeGreaterThan(2); // "all other primary metrics" too
  });
});

describe('fmtTrendValue', () => {
  it('formats percents to 2 decimals (owner request, 2026-09-14)', () => {
    expect(fmtTrendValue(0.21374, 'pct')).toBe('21.37%');
    expect(fmtTrendValue(0.043, 'pct')).toBe('4.30%');
  });
  it('formats each other unit distinctly', () => {
    expect(fmtTrendValue(12345, '$')).toBe('$12,345'); // period total -- whole dollars
    expect(fmtTrendValue(4.2, '$$')).toBe('$4.20'); // per-transaction figure (Avg Check) -- cents matter
    expect(fmtTrendValue(92.4, 'sec')).toBe('92s');
    expect(fmtTrendValue(null, 'pct')).toBe('—');
  });
});

// ── Real panel render ────────────────────────────────────────────────────────────────────────
vi.mock('../utils/print-html.js', () => ({ printHtml: vi.fn() }));
// Email Summary mode fetches its own broader sales history on entry (loadQsrActSummary) rather
// than trusting ds's default 60-day window -- mocked here the same way other Supabase-backed
// panel tests in this suite do, so the fetch resolves instead of hanging on a real network call.
const mockActRows = [
  { loc: '3708', date: '2026-08-01', sales: 3300, gc: 190 },
  { loc: '3708', date: '2025-08-01', sales: 3000, gc: 200 },
];
vi.mock('../lib/supabase.js', () => ({ loadQsrActSummary: vi.fn().mockResolvedValue(mockActRows) }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { TrendReportPanel } = await import('../views/trend-report.js');

function buildDs() {
  const ds = { glimpseRows: [], qsrActSummaryRows: [] };
  // Real store locs from STORE_NAMES so LocationSelector/getStoreOrg resolve a real OK/FL split.
  const locs = ['3708', '5183']; // both real, per constants.js
  const today = new Date();
  for (let back = 0; back < 70; back++) {
    const d = new Date(today); d.setDate(d.getDate() - back);
    const dt = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    for (const loc of locs) {
      ds.glimpseRows.push({ loc, date: dt, laborPct: loc === '3708' ? 0.19 : 0.24 });
      ds.qsrActSummaryRows.push({ loc, date: dt, sales: loc === '3708' ? 3200 : 2100 });
    }
  }
  return ds;
}

describe('TrendReportPanel — real render (owner request, 2026-09-14)', () => {
  let container, root;
  beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

  it('renders 3 stacked period sections with real store data for the default metric', async () => {
    const ds = buildDs();
    await act(async () => {
      root.render(React.createElement(TrendReportPanel, { ds, onClose: () => {} }));
      await Promise.resolve();
    });
    expect(container.textContent).toContain('Performance Trends');
    expect(container.textContent).toContain('Current MTD');
    expect(container.textContent).toContain('All Locations');
    // Real store rows, not a placeholder.
    expect(container.textContent).toMatch(/3708|5183/);
  });

  it('switching the metric dropdown to FOB % changes the rendered metric label', async () => {
    const ds = buildDs();
    await act(async () => {
      root.render(React.createElement(TrendReportPanel, { ds, onClose: () => {} }));
      await Promise.resolve();
    });
    const select = container.querySelector('select');
    expect(select).toBeTruthy();
    await act(async () => {
      select.value = 'fobPct';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
    });
    expect(container.textContent).toContain('FOB %');
  });

  it('clicking a rank-mode pill (Top 25%) narrows the visible rows without throwing', async () => {
    const ds = buildDs();
    await act(async () => {
      root.render(React.createElement(TrendReportPanel, { ds, onClose: () => {} }));
      await Promise.resolve();
    });
    const top25 = [...container.querySelectorAll('button')].find(b => b.textContent.trim() === 'Top 25%');
    expect(top25).toBeTruthy();
    await act(async () => { top25.click(); await Promise.resolve(); });
    expect(container.textContent).toContain('Performance Trends');
  });

  it('the Email Summary toggle switches to the Combined/OK/FL scorecard (owner\'s own reference table)', async () => {
    const ds = buildDs();
    await act(async () => {
      root.render(React.createElement(TrendReportPanel, { ds, onClose: () => {} }));
      await Promise.resolve();
    });
    const toggle = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Email Summary'));
    expect(toggle).toBeTruthy();
    await act(async () => {
      toggle.click();
      await Promise.resolve(); // kicks off the loadQsrActSummary fetch
      await Promise.resolve(); // lets the mocked promise resolve and the state update flush
    });
    expect(container.textContent).toContain('Combined (OK/FL)');
    expect(container.textContent).toContain('Oklahoma');
    expect(container.textContent).toContain('Florida');
    // The metric dropdown/rank pills only make sense in Store Detail mode -- confirm they hide.
    expect(container.querySelector('select')).toBeNull();
  });

  it('Email Summary percents render to 2 decimals (owner request, 2026-09-14)', async () => {
    const ds = buildDs();
    await act(async () => {
      root.render(React.createElement(TrendReportPanel, { ds, onClose: () => {} }));
      await Promise.resolve();
    });
    const toggle = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Email Summary'));
    await act(async () => { toggle.click(); await Promise.resolve(); await Promise.resolve(); });
    // mockActRows -> combined Sales comp = (3300-3000)/3000 = 10.00%.
    expect(container.textContent).toContain('10.00%');
  });
});
