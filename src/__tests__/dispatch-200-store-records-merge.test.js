// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #200 (Task Group C) — Store Analytics' per-store "Records" tab (StoreRecordsTab,
// store-analytics.js) merges with the main-menu "Record Days" panel's richer, live-data engine
// (computeRecords()/scopeRecordData(), record-day.js), scoped to one store. Owner, live: "why
// don't we merge the records tab in there with the results from the records panel on the main
// menu. It would provide an even more robust records experience for each location in district
// view."
//
// Renders the REAL StoreRecordsTab consumer (not just computeRecords in isolation), per this
// repo's "would this verification still pass if the change were reverted" standing rule — a
// test that only imports computeRecords could pass unchanged with StoreRecordsTab never wired
// to it. Mocks src/engine/metric-source.js the same way dispatch #103's own record-day test
// does (dispatch-103-record-day-provisional.test.js), keeping everything else in that module
// real via importOriginal (dispatch #168's pattern) since store-analytics.js also imports
// metricSeries/metricAvg/ensureLazyFill/isLazyFillPending from the same module for unrelated
// tabs.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const LOC = '3708'; // Ardmore-Broadway

// Fixture spans a day, a week, and a month boundary so sales.day/week/month/dow all resolve to
// something real, plus one OEPE reading so a speed record renders too. All dates are safely in
// the past (well before "today") so nothing here is a still-open, provisional business day.
const DAY1 = '2026-06-01'; // Monday
const DAY2 = '2026-06-08'; // Monday, one week later -- becomes the week/month/DOW winner
const SALES = { [DAY1]: 8000, [DAY2]: 12000 };
const GC    = { [DAY1]: 800,  [DAY2]: 1000 };
const OEPE  = { [DAY1]: 130,  [DAY2]: 118 };

vi.mock('../engine/metric-source.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    dailyDataFreshness: () => new Date('2026-06-10T00:00:00'),
    metricSeries: (ds, loc, range, key) => {
      if (String(loc) !== LOC) return {};
      if (key === 'sales') return { ...SALES };
      if (key === 'gc')    return { ...GC };
      if (key === 'oepe')  return { ...OEPE };
      return {};
    },
  };
});

import { StoreRecordsTab } from '../views/store-analytics.js';

function baseDs(overrides = {}) {
  return { loaded: true, storeIds: [LOC], laborRows: [], records: {}, ...overrides };
}

describe('#200 StoreRecordsTab — merged with the Record Days live-data engine, rendered through the real panel', () => {
  let container, root;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
  });

  it('renders live week/month/day-of-week/speed records computed from daily data, no upload required', async () => {
    await act(async () => {
      root.render(React.createElement(StoreRecordsTab, { ds: baseDs(), loc: LOC, name: 'Ardmore-Broadway' }));
    });
    const text = container.textContent;
    expect(text).toContain('Live Data Records');
    // Best Day/Week/Month Sales all resolve to the $12,000 (2026-06-08) reading.
    expect(text).toContain('$12,000.00');
    expect(text).toContain('Day-of-Week Bests');
    expect(text).toContain('Mon'); // both DAY1/DAY2 are Mondays
    expect(text).toContain('Best OEPE');
    expect(text).toContain('118s');
  });

  it('still shows the uploaded all-time-records section when ds.records has data — the two sources are additive, not merged into one number', async () => {
    const ds = baseDs({ records: { [LOC]: { total_sales: { value: 55000, date: new Date('2019-12-24') } } } });
    await act(async () => {
      root.render(React.createElement(StoreRecordsTab, { ds, loc: LOC, name: 'Ardmore-Broadway' }));
    });
    const text = container.textContent;
    expect(text).toContain('All-Time Store Records');
    expect(text).toContain('$55,000'); // Excel-sourced record, formatted by f$ (0-decimal), unchanged
    expect(text).toContain('Live Data Records'); // both sections present at once
  });

  it('falls back to the old "no data" empty state only when NEITHER source has anything for this store', async () => {
    const ds = { loaded: true, storeIds: [], laborRows: [], records: {} }; // no storeIds, no records
    await act(async () => {
      root.render(React.createElement(StoreRecordsTab, { ds, loc: '9999999', name: 'No Data Store' }));
    });
    expect(container.textContent).toContain('No Records Data');
  });

  it('changing the Recent Record Breaks window re-runs the live engine and stays scoped to this one store', async () => {
    await act(async () => {
      root.render(React.createElement(StoreRecordsTab, { ds: baseDs(), loc: LOC, name: 'Ardmore-Broadway' }));
    });
    const select = [...container.querySelectorAll('select')].find(s => s.value === '60');
    expect(select).toBeTruthy();
    await act(async () => {
      select.value = '30';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(container.textContent).toContain('Last 30 Days');
  });
});
