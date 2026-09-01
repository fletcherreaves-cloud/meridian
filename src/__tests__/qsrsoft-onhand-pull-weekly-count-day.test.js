// @ts-nocheck
// 2026-09-01 (owner req, verbatim): "we have the days of week that each store counts. Let's pull
// data for those days between 8am and 5pm, hourly to start." A REAL behavioral test of the new
// runMode() branch (not a source-text regex), per CLAUDE.md's "would this verification still
// pass if the change were reverted?" standing rule -- pins the exact gating boundaries and the
// priority order against the existing EOM count-window mode.
//
// No dummy env vars needed: qsrsoft-onhand-pull.mjs's module-scope `supabase` const goes through
// safeCreateClient (scripts/lib/safe-supabase-client.mjs), which never throws regardless of what's
// in process.env at import time.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { runMode, recentPeriodKeys } from '../../scripts/qsrsoft-onhand-pull.mjs';

describe('qsrsoft-onhand-pull.mjs runMode() -- weekly-count-day mode', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('fires outside the EOM window, inside 8am-5pm CT, on an ordinary mid-month day', () => {
    vi.useFakeTimers();
    // 2026-08-15 15:00 UTC == 10:00 CDT -- mid-month (well outside the last-3-days EOM window),
    // mid-morning Central time.
    vi.setSystemTime(new Date('2026-08-15T15:00:00Z'));
    expect(runMode()).toBe('weekly-count-day');
  });

  it('does NOT fire before 8am CT (and this instant also misses the separate daily progress-snapshot slot)', () => {
    vi.useFakeTimers();
    // 2026-08-15 09:00 UTC == 04:00 CDT -- before both the 8am-5pm weekly-count-day window
    // and the unrelated 10:00-14:00 UTC daily progress-snapshot slot.
    vi.setSystemTime(new Date('2026-08-15T09:00:00Z'));
    expect(runMode()).toBe(null);
  });

  it('does NOT fire at/after 5pm CT (half-open [8,17))', () => {
    vi.useFakeTimers();
    // 2026-08-15 22:00 UTC == 17:00 CDT exactly.
    vi.setSystemTime(new Date('2026-08-15T22:00:00Z'));
    expect(runMode()).toBe(null);
  });

  it('fires right at the 8am CT start boundary', () => {
    vi.useFakeTimers();
    // 2026-08-15 13:00 UTC == 08:00 CDT exactly.
    vi.setSystemTime(new Date('2026-08-15T13:00:00Z'));
    expect(runMode()).toBe('weekly-count-day');
  });

  it('the existing EOM count-window mode still wins during the last-3-days window -- weekly-' +
     'count-day never shadows it', () => {
    vi.useFakeTimers();
    // 2026-08-29 15:00 UTC == 10:00 CDT -- inside BOTH the EOM window (Aug has 31 days, so the
    // last 3 are 29/30/31) and the 8am-5pm weekly-count-day hours. count-window must win.
    vi.setSystemTime(new Date('2026-08-29T15:00:00Z'));
    expect(runMode()).toBe('count-window');
  });

  it('the EOM window still returns null outside ITS OWN (wider, 8a-10p) business hours, not ' +
     'accidentally caught by the narrower weekly-count-day gate', () => {
    vi.useFakeTimers();
    // 2026-08-29 07:00 UTC == 02:00 CDT -- inside the EOM window, but 2am is outside both gates.
    vi.setSystemTime(new Date('2026-08-29T07:00:00Z'));
    expect(runMode()).toBe(null);
  });
});

describe('recentPeriodKeys -- trailing period list ending at (and including) the given period', () => {
  it('returns N periods, oldest first, ending with the given period', () => {
    expect(recentPeriodKeys('2026-09', 6)).toEqual([
      '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09',
    ]);
  });

  it('crosses a year boundary correctly', () => {
    expect(recentPeriodKeys('2026-02', 4)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });

  it('n=1 returns just the given period', () => {
    expect(recentPeriodKeys('2026-09', 1)).toEqual(['2026-09']);
  });
});
