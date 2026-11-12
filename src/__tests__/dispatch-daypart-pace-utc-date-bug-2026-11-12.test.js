// Owner-caught live 2026-11-12, 6:48pm CST: Daypart Pace's "Today" tab read "No data for
// 2026-11-12 -- sync runs ~5am CDT" while the real local date was still 2026-11-11 evening.
// Root cause: targetDate was computed via `new Date().toISOString().slice(0,10)` -- the UTC
// calendar day, which is already tomorrow for any US timezone once local time crosses
// (24 - UTC offset): 6pm CST (UTC-6), 7pm CDT (UTC-5), every single day, for roughly the last
// 6 hours of local business. Fixed by routing through businessDate()/lastClosedBusinessDay()
// (utils/date.js) -- the standing local+4am-aware helpers CLAUDE.md already mandates for this
// exact recurring bug class ("Never re-derive the cutover inline").
//
// This file runs with TZ forced to America/Chicago (set before any Date is constructed, restored
// after) -- the default test-runner TZ is UTC, where local time == UTC and the bug this test
// exists to catch can't be reproduced at all (there would be no UTC/local gap to expose).
// @vitest-environment happy-dom
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const ORIGINAL_TZ = process.env.TZ;
beforeAll(() => { process.env.TZ = 'America/Chicago'; });
afterAll(() => { process.env.TZ = ORIGINAL_TZ; });

describe('daypartTargetDate — local/business-day date, never the UTC calendar day', () => {
  it('reproduces the exact owner report: 6:48pm CST on Nov 11 must read "today" as Nov 11, not Nov 12', async () => {
    const { daypartTargetDate } = await import('../views/store-analytics.js');
    // 2026-11-11T18:48:00 CST == 2026-11-12T00:48:00Z -- the UTC day has already rolled to the
    // 12th while local wall-clock time is still the evening of the 11th.
    const now = new Date('2026-11-12T00:48:00Z');
    expect(daypartTargetDate('today', now)).toBe('2026-11-11');
  });

  it('the old buggy UTC-slice would have failed this exact case (documents what broke)', async () => {
    const { daypartTargetDate } = await import('../views/store-analytics.js');
    const now = new Date('2026-11-12T00:48:00Z');
    expect(now.toISOString().slice(0, 10)).toBe('2026-11-12'); // the bug: one day ahead of local
    expect(daypartTargetDate('today', now)).not.toBe(now.toISOString().slice(0, 10));
  });

  it('holds across the whole CDT (UTC-5) risk window too -- 7:30pm CDT still reads as today', async () => {
    const { daypartTargetDate } = await import('../views/store-analytics.js');
    // 2026-07-15T19:30:00 CDT == 2026-07-16T00:30:00Z
    const now = new Date('2026-07-16T00:30:00Z');
    expect(daypartTargetDate('today', now)).toBe('2026-07-15');
  });

  it('a middle-of-the-day read is unaffected (no UTC/local day boundary in play)', async () => {
    const { daypartTargetDate } = await import('../views/store-analytics.js');
    const now = new Date('2026-11-12T18:00:00Z'); // noon CST
    expect(daypartTargetDate('today', now)).toBe('2026-11-12');
  });

  it('"yesterday" is one real business day back from the correctly-resolved today, not the buggy UTC date', async () => {
    const { daypartTargetDate } = await import('../views/store-analytics.js');
    const now = new Date('2026-11-12T00:48:00Z'); // 6:48pm CST Nov 11
    expect(daypartTargetDate('yesterday', now)).toBe('2026-11-10');
  });

  it('a 2am local view (before the 4am business-day rollover) still reads "today" as the still-open prior business day', async () => {
    const { daypartTargetDate } = await import('../views/store-analytics.js');
    // 2026-11-12T02:00:00 CST == 2026-11-12T08:00:00Z -- the local CALENDAR date has already
    // flipped to the 12th, but the 4am-anchored BUSINESS day (started 4am the 11th) has not.
    const now = new Date('2026-11-12T08:00:00Z');
    expect(daypartTargetDate('today', now)).toBe('2026-11-11');
  });
});
