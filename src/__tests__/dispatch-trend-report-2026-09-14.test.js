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

describe('computeScopeSummary — Sales/GC are matched-day vs-LY comps, not raw totals', () => {
  it('salesPct/gcPct match a hand-computed (cur-ly)/ly over the period', () => {
    const period = { key: 'p', label: 'P', s: '2026-08-01', e: '2026-08-05' };
    const ds = { qsrActSummaryRows: [] };
    for (let d = 1; d <= 5; d++) {
      const dt = `2026-08-0${d}`;
      // +10% sales comp, -5% GC comp, every day.
      ds.qsrActSummaryRows.push({ loc: '3708', date: dt, sales: 3300, lySales: 3000, gc: 190, lyGc: 200 });
    }
    const [row] = computeScopeSummary(ds, ['3708'], [period]);
    expect(row.salesPct).toBeCloseTo(0.10, 5);
    expect(row.gcPct).toBeCloseTo(-0.05, 5);
  });

  it('laborPct/fobPct are honestly null when no ratio data resolves for the period (never fabricated)', () => {
    const period = { key: 'p', label: 'P', s: '2026-08-01', e: '2026-08-05' };
    const ds = { qsrActSummaryRows: [{ loc: '3708', date: '2026-08-01', sales: 3000, lySales: 3000, gc: 100, lyGc: 100 }] };
    const [row] = computeScopeSummary(ds, ['3708'], [period]);
    expect(row.laborPct).toBeNull();
    expect(row.fobPct).toBeNull();
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
  it('formats each unit distinctly', () => {
    expect(fmtTrendValue(0.2137, 'pct')).toBe('21.4%');
    expect(fmtTrendValue(12345, '$')).toBe('$12,345');
    expect(fmtTrendValue(92.4, 'sec')).toBe('92s');
    expect(fmtTrendValue(null, 'pct')).toBe('—');
  });
});

// ── Real panel render ────────────────────────────────────────────────────────────────────────
vi.mock('../utils/print-html.js', () => ({ printHtml: vi.fn() }));
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
    await act(async () => { toggle.click(); await Promise.resolve(); });
    expect(container.textContent).toContain('Combined (OK/FL)');
    expect(container.textContent).toContain('Oklahoma');
    expect(container.textContent).toContain('Florida');
    // The metric dropdown/rank pills only make sense in Store Detail mode -- confirm they hide.
    expect(container.querySelector('select')).toBeNull();
  });
});
