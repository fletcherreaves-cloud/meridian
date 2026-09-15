// @vitest-environment happy-dom
// @ts-nocheck
// Owner request (2026-09-15): "I need you to go back to 2022 for records data please." Clarified
// via AskUserQuestion to mean the LIVE Records engine (computeRecords/scopeRecordData,
// record-day.js -- "Best Day Sales"), not the separate Excel-upload ds.records report.
//
// computeRecords/scopeRecordData already scan an unbounded range (`range = {s:new
// Date('2000-01-01'), e:dataEnd}` inside computeRecords) -- the real limiter was `ds.laborRows`
// only being eagerly loaded ~400 days back at app startup, nowhere near 2022. Measured live
// (service-role read) that `labor_rows` already holds real 2022 data in Supabase (9,074 rows for
// 2022 alone, `sales` populated) -- a fetch-depth problem, not a missing-data one, so no QSRSoft
// API backfill is involved.
//
// Fix reuses the SAME wide-tier lazy-fill mechanism dispatch #170 built for ProductMixPanel's
// 90D/180D/All range options (metric-source.js's `ensureLazyFillWide`/`wideLoaders`) --
// App.js's `configureLazyFill` call gets a new `wideLoaders.laborRows` entry, and RecordDayTab /
// StoreRecordsTab each get a "Load full history (since 2022)" button that calls
// `ensureLazyFillWide('laborRows')`.
//
// Renders the REAL RecordDayTab/StoreRecordsTab consumers (not an isolated computeRecords call),
// per this repo's "would this verification still pass if reverted" standing rule, and does NOT
// mock metric-source.js's metricSeries/dailyDataFreshness (unlike dispatch-103/130/200's own
// tests) -- this test wants the REAL resolver chain (metricSeries -> METRIC_SOURCES -> ds.laborRows)
// to run over real fixture rows, so a revert of the actual App.js/record-day.js/store-analytics.js
// wiring (not just a mocked stand-in) is what this test would catch.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { configureLazyFill, _resetLazyFillForTests } from '../engine/metric-source.js';
import { RecordDayTab } from '../views/record-day.js';
import { StoreRecordsTab } from '../views/store-analytics.js';
import fs from 'fs';
import path from 'path';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const LOC = '3708'; // Ardmore-Broadway

// Narrow (pre-wide-fetch) rows -- only a recent day, matching what App.js's eager ~400-day
// loadLaborRows() call would actually carry today.
const RECENT_ROW = { loc: LOC, date: new Date('2026-06-08T00:00:00'), sales: 12000 };
// Wide (post-wide-fetch) rows -- the full history a `loadLaborRows(daysBackTo('2022-01-01'))`
// call would return: the same recent day PLUS a much larger, genuinely 2022 day. The wide loader
// REPLACES ds.laborRows entirely (matching production: one loadLaborRows call returns the whole
// window in one shot), so this must include both, not just the addition.
const DEEP_2022_ROW = { loc: LOC, date: new Date('2022-03-15T00:00:00'), sales: 50000 };
const wideRows = [RECENT_ROW, DEEP_2022_ROW];

function baseDs() {
  return { loaded: true, storeIds: [LOC], laborRows: [RECENT_ROW], records: {} };
}

describe('Records "go back to 2022" (owner request, 2026-09-15)', () => {
  let container, root;
  beforeEach(() => {
    _resetLazyFillForTests();
    // computeRecords merges every computed result into localStorage's all-time-best ledger
    // ('mf_day_records_v1', "records accumulate across uploads" by design) -- without clearing
    // it, one test's $50,000/2022 record permanently sticks around as every later test's
    // starting all-time-best, regardless of what ds that later test provides. Caught live: a
    // debug run showed StoreRecordsTab rendering $50,000 on its FIRST render with wideLoader
    // never even called, tracing back to this persisted ledger, not the lazy-fill mechanism.
    localStorage.removeItem('mf_day_records_v1');
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
    _resetLazyFillForTests();
    localStorage.removeItem('mf_day_records_v1');
  });

  // App.js is not itself rendered here (it needs far more context than any other Meridian view
  // -- no test in this suite renders it directly, see e.g. lazy-panel-error-boundary.test.js
  // importing just `lazyPanel`) -- so this pins the wiring at the source-text level: a real
  // `wideLoaders.laborRows` entry anchored to the calendar date 2022-01-01, not a round day
  // count that would silently drift as "today" moves forward. Combined with the render tests
  // below (which prove `ensureLazyFillWide('laborRows')` actually produces deep data end to
  // end), this closes the gap between "the wiring exists" and "the wiring works."
  it('App.js wires a laborRows wide-tier loader anchored to 2022-01-01', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../app/App.js'), 'utf8');
    expect(src).toMatch(/wideLoaders:\s*{[^}]*laborRows:\s*\(\)\s*=>\s*loadLaborRows\(/);
    expect(src).toContain("daysBackTo('2022-01-01')");
  });

  function Host({ wideLoader, Component, props }) {
    const [ds, setDs] = React.useState(baseDs());
    configureLazyFill({ setDs, loaders: {}, wideLoaders: { laborRows: wideLoader } });
    return React.createElement(Component, { ...props, ds });
  }

  // Awaits the ACTUAL promise the code path under test is using (not a guessed number of
  // microtask hops), so no pending .then() from this test can leak into the next one and
  // silently pre-populate its ds -- exactly the cross-test contamination the shared
  // module-level _lazyFillHook/_lazyWideState state in metric-source.js is vulnerable to.
  async function flushWideFetch(wideLoader) {
    await act(async () => {
      await wideLoader.mock.results[0].value;
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it('RecordDayTab: clicking "Load full history" calls ensureLazyFillWide(\'laborRows\'), never a bounded loader', async () => {
    const wideLoader = vi.fn(() => Promise.resolve(wideRows));
    await act(async () => {
      root.render(React.createElement(Host, { wideLoader, Component: RecordDayTab, props: { stores: [{ loc: LOC }] } }));
    });

    expect(container.textContent).toContain('Best Day Sales');
    expect(container.textContent).toContain('$12,000.00'); // narrow-window record only, so far
    expect(container.textContent).not.toContain('$50,000.00');

    const btn = Array.from(container.querySelectorAll('button')).find(b => /Load full history/i.test(b.textContent || ''));
    expect(btn).toBeTruthy();
    expect(wideLoader).not.toHaveBeenCalled();

    await act(async () => { btn.dispatchEvent(new Event('click', { bubbles: true })); });
    expect(wideLoader).toHaveBeenCalledTimes(1);
    // Drain the promise this click just kicked off -- otherwise it resolves during a LATER
    // test (after _resetLazyFillForTests() has already reassigned _lazyFillHook to that test's
    // own Host), and its stale .then() callback writes wideRows into that unrelated ds. This
    // bit the very next test in this file before this drain was added.
    await flushWideFetch(wideLoader);
  });

  it('RecordDayTab: once the wide fetch resolves, Best Day Sales reflects the real 2022 record, not just the narrow window', async () => {
    const wideLoader = vi.fn(() => Promise.resolve(wideRows));
    await act(async () => {
      root.render(React.createElement(Host, { wideLoader, Component: RecordDayTab, props: { stores: [{ loc: LOC }] } }));
    });
    const btn = Array.from(container.querySelectorAll('button')).find(b => /Load full history/i.test(b.textContent || ''));
    await act(async () => { btn.dispatchEvent(new Event('click', { bubbles: true })); });
    await flushWideFetch(wideLoader);

    // The $50,000 2022 day is the new all-time district champion -- both the value AND its real
    // 2022 date must surface, proving the resolver actually read the deep row, not just a bigger
    // number from somewhere else.
    expect(container.textContent).toContain('$50,000.00');
    expect(container.textContent).toContain('Mar 15, 2022');
    // Button reflects the loaded state -- no longer offered (already have full history).
    expect(Array.from(container.querySelectorAll('button')).some(b => /Load full history/i.test(b.textContent || ''))).toBe(false);
  });

  it('StoreRecordsTab: same wide-tier wiring, scoped to one store', async () => {
    const wideLoader = vi.fn(() => Promise.resolve(wideRows));
    await act(async () => {
      root.render(React.createElement(Host, { wideLoader, Component: StoreRecordsTab, props: { loc: LOC, name: 'Ardmore-Broadway' } }));
    });
    expect(container.textContent).toContain('$12,000.00');
    expect(container.textContent).not.toContain('$50,000.00');

    const btn = Array.from(container.querySelectorAll('button')).find(b => /Load full history/i.test(b.textContent || ''));
    expect(btn).toBeTruthy();
    await act(async () => { btn.dispatchEvent(new Event('click', { bubbles: true })); });
    await flushWideFetch(wideLoader);

    expect(wideLoader).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('$50,000.00');
  });
});
