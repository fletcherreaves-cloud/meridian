// @ts-nocheck
// metric-source.js's dailyDataFreshness had zero direct test coverage despite being live:
// called from src/views/one-pager.js and src/views/record-day.js to power a "daily data is N
// days stale" guard (per the file's own comment, added after the Jul-2026 data-loss incident).
// Every hit in src/__tests__/ before this file was a vi.mock stub replacing it, never a call
// to the real implementation.
import { describe, it, expect } from 'vitest';
import { dailyDataFreshness } from '../engine/metric-source.js';

describe('dailyDataFreshness', () => {
  it('returns null for a null/undefined ds', () => {
    expect(dailyDataFreshness(null)).toBeNull();
    expect(dailyDataFreshness(undefined)).toBeNull();
  });

  it('returns null when none of the daily streams have any dated rows', () => {
    expect(dailyDataFreshness({ qsrActSummaryRows: [], glimpseRows: [] })).toBeNull();
  });

  it('returns the single newest date across ONE stream', () => {
    const ds = { glimpseRows: [{ date: '2026-08-01' }, { date: '2026-08-05' }, { date: '2026-08-03' }] };
    expect(dailyDataFreshness(ds).toISOString().slice(0, 10)).toBe('2026-08-05');
  });

  it('finds the newest date across MULTIPLE streams, not just the first one scanned', () => {
    const ds = {
      qsrActSummaryRows: [{ date: '2026-08-01' }],
      salesLedgerRows: [{ date: '2026-08-09' }],   // the true max, in a later stream
      glimpseRows: [{ date: '2026-08-05' }],
    };
    expect(dailyDataFreshness(ds).toISOString().slice(0, 10)).toBe('2026-08-09');
  });

  it('accepts a real Date object as well as a date string', () => {
    const ds = { laborRows: [{ date: new Date('2026-08-07T00:00:00Z') }] };
    expect(dailyDataFreshness(ds).toISOString().slice(0, 10)).toBe('2026-08-07');
  });

  it('skips rows with a missing or unparseable date instead of throwing', () => {
    const ds = { opsRows: [{ date: null }, { date: 'not-a-date' }, { date: '2026-08-02' }, {}] };
    expect(dailyDataFreshness(ds).toISOString().slice(0, 10)).toBe('2026-08-02');
  });

  it('ignores streams outside the fixed daily-stream list', () => {
    const ds = { someOtherRows: [{ date: '2099-01-01' }], ctrlRows: [{ date: '2026-08-04' }] };
    expect(dailyDataFreshness(ds).toISOString().slice(0, 10)).toBe('2026-08-04');
  });
});
