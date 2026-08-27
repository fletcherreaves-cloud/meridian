// @ts-nocheck
// #191: auditRows is no longer eagerly loaded at startup — metric-source.js triggers an
// on-demand load the first time a metric chain that includes it is actually resolved. These
// tests cover the trigger mechanism itself: fires once per source, dedupes concurrent calls,
// updates ds via the injected setDs on resolve, and never fires for sources outside
// LAZY_FILL_SOURCES (laborRows/opsRows/ctrlRows stay on their existing eager-load path).
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  metricDaily, metricSeries, configureLazyFill, isLazyFillPending, ensureLazyFill, LAZY_FILL_SOURCES,
  _resetLazyFillForTests, ensureLazyFillWide, isLazyFillWidePending, isLazyFillWideLoaded, isLazyFillWideError,
} from '../engine/metric-source.js';

const d = s => new Date(s + 'T00:00:00');

describe('metric-source lazy-fill (#191)', () => {
  beforeEach(() => { _resetLazyFillForTests(); });

  it('LAZY_FILL_SOURCES is scoped to auditRows + wasteRows + pmixRows (#191, extended by #209, #292)', () => {
    expect(LAZY_FILL_SOURCES).toEqual(['auditRows', 'wasteRows', 'pmixRows']);
  });

  it('triggers the loader once and updates ds via setDs when it resolves', async () => {
    const rows = [{ loc: '1', date: d('2026-06-01'), manualRefAmt: 12.5 }];
    let resolveLoader;
    const loader = vi.fn(() => new Promise(res => { resolveLoader = res; }));
    const sets = [];
    const setDs = updater => sets.push(updater);
    configureLazyFill({ setDs, loaders: { auditRows: loader } });

    const ds = { ctrlRows: [] }; // no ctrlRows for this day → chain falls through to auditRows
    expect(metricDaily(ds, '1', d('2026-06-01'), 'manualRefAmt')).toBeNull();
    expect(loader).toHaveBeenCalledTimes(1);
    expect(isLazyFillPending('auditRows')).toBe(true);

    // Calling again before it resolves must not re-trigger the loader.
    metricDaily(ds, '1', d('2026-06-01'), 'manualRefAmt');
    expect(loader).toHaveBeenCalledTimes(1);

    resolveLoader(rows);
    await Promise.resolve(); await Promise.resolve();
    expect(isLazyFillPending('auditRows')).toBe(false);
    expect(sets.length).toBe(1);
    const prev = { auditRows: [], other: 'kept' };
    expect(sets[0](prev)).toEqual({ auditRows: rows, other: 'kept' });
  });

  it('ensureLazyFill triggers the same mechanism and reports pending state for a "load on open" consumer', async () => {
    let resolveLoader;
    const loader = vi.fn(() => new Promise(res => { resolveLoader = res; }));
    const setDs = () => {};
    configureLazyFill({ setDs, loaders: { auditRows: loader } });

    const stillPending = ensureLazyFill('auditRows');
    expect(stillPending).toBe(true);
    expect(loader).toHaveBeenCalledTimes(1);

    resolveLoader([]);
    await Promise.resolve(); await Promise.resolve();
    expect(isLazyFillPending('auditRows')).toBe(false);

    // Once loaded, a further call is a no-op (already loaded, not re-triggered).
    ensureLazyFill('auditRows');
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('a source outside LAZY_FILL_SOURCES is never triggered, and is a no-op before configureLazyFill runs', () => {
    // Simulates a test/SSR context where App.js's startup wiring never ran.
    configureLazyFill(null);
    const ds = { ctrlRows: [] };
    expect(() => metricDaily(ds, '1', d('2026-06-01'), 'laborPct')).not.toThrow();
    expect(metricDaily(ds, '1', d('2026-06-01'), 'laborPct')).toBeNull();
    expect(ensureLazyFill('laborRows')).toBe(false); // not a lazy-fill source — no-op, not pending
  });

  it('metricSeries triggers the same way as metricDaily for a range resolve', async () => {
    let resolveLoader;
    const loader = vi.fn(() => new Promise(res => { resolveLoader = res; }));
    const setDs = () => {};
    configureLazyFill({ setDs, loaders: { auditRows: loader } });

    const ds = { ctrlRows: [] };
    const out = metricSeries(ds, '9', { s: d('2026-06-01'), e: d('2026-06-05') }, 'mgrMealCnt');
    expect(out).toEqual({});
    expect(loader).toHaveBeenCalledTimes(1);
    resolveLoader([]);
    await Promise.resolve(); await Promise.resolve();
  });
});

// Dispatch #170 — the WIDE (opt-in) tier. `pmixRows`'s plain lazy-fill loader now defaults to a
// bounded window (src/lib/supabase.js's loadPmixRows, 40 days); consumers that need real
// historical breadth (ProductMixPanel's 90D/180D/All, Signal Lab/Scanner's item correlations)
// call ensureLazyFillWide instead, which is registered via a SEPARATE `wideLoaders` map on the
// same configureLazyFill hook and, once resolved, replaces the SAME ds[src] field — no new ds
// key, so every pre-existing reader of ds.pmixRows needs no change.
describe('metric-source lazy-fill — WIDE tier (dispatch #170)', () => {
  beforeEach(() => { _resetLazyFillForTests(); });

  it('ensureLazyFillWide triggers the wideLoaders entry (not the plain loaders entry) and replaces ds[src] on resolve', async () => {
    let resolveWide;
    const narrowLoader = vi.fn(() => Promise.resolve([{ tag: 'narrow' }]));
    const wideLoader = vi.fn(() => new Promise(res => { resolveWide = res; }));
    const sets = [];
    const setDs = updater => sets.push(updater);
    configureLazyFill({ setDs, loaders: { pmixRows: narrowLoader }, wideLoaders: { pmixRows: wideLoader } });

    const stillPending = ensureLazyFillWide('pmixRows');
    expect(stillPending).toBe(true);
    expect(wideLoader).toHaveBeenCalledTimes(1);
    expect(narrowLoader).not.toHaveBeenCalled(); // wide never falls back to the bounded loader
    expect(isLazyFillWidePending('pmixRows')).toBe(true);

    // Calling again before it resolves must not re-trigger the wide loader.
    ensureLazyFillWide('pmixRows');
    expect(wideLoader).toHaveBeenCalledTimes(1);

    const wideRows = [{ tag: 'wide-1' }, { tag: 'wide-2' }];
    resolveWide(wideRows);
    await Promise.resolve(); await Promise.resolve();
    expect(isLazyFillWidePending('pmixRows')).toBe(false);
    expect(isLazyFillWideLoaded('pmixRows')).toBe(true);
    expect(sets.length).toBe(1);
    // Replaces the SAME field (pmixRows), not a separate ds.pmixRowsWide key.
    const prev = { pmixRows: [{ tag: 'narrow' }], other: 'kept' };
    expect(sets[0](prev)).toEqual({ pmixRows: wideRows, other: 'kept' });

    // Once loaded, a further call is a no-op.
    ensureLazyFillWide('pmixRows');
    expect(wideLoader).toHaveBeenCalledTimes(1);
  });

  it('a source with no wideLoaders entry is a no-op (auditRows/wasteRows are unaffected by this dispatch)', () => {
    const setDs = () => {};
    configureLazyFill({ setDs, loaders: { auditRows: vi.fn() } }); // no wideLoaders at all
    expect(ensureLazyFillWide('auditRows')).toBe(false);
    expect(isLazyFillWidePending('auditRows')).toBe(false);
  });

  it('a rejected wide loader sets isLazyFillWideError, independent of the plain-tier error state', async () => {
    let rejectWide;
    const wideLoader = vi.fn(() => new Promise((_, rej) => { rejectWide = rej; }));
    configureLazyFill({ setDs: () => {}, loaders: {}, wideLoaders: { pmixRows: wideLoader } });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      ensureLazyFillWide('pmixRows');
      rejectWide(new Error('simulated wide-fetch failure'));
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
      expect(isLazyFillWideError('pmixRows')).toBe(true);
      expect(isLazyFillWidePending('pmixRows')).toBe(false);
      expect(isLazyFillWideLoaded('pmixRows')).toBe(false);
    } finally { warnSpy.mockRestore(); }
  });

  it('_resetLazyFillForTests clears wide state too, not just the plain-tier state', async () => {
    const wideLoader = vi.fn(() => Promise.resolve([]));
    configureLazyFill({ setDs: () => {}, loaders: {}, wideLoaders: { pmixRows: wideLoader } });
    ensureLazyFillWide('pmixRows');
    await Promise.resolve(); await Promise.resolve();
    expect(isLazyFillWideLoaded('pmixRows')).toBe(true);
    _resetLazyFillForTests();
    expect(isLazyFillWideLoaded('pmixRows')).toBe(false);
    expect(isLazyFillWidePending('pmixRows')).toBe(false);
  });
});
