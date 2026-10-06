// @ts-nocheck
// Owner-reported (2026-10-06): LifeLenz actual sales for store 6972 (and, measured, all 27
// stores district-wide) were wrong for 2026-09-25 (~20% of the real day -- a mid-morning partial
// capture) and entirely NULL for 2026-09-26 -- and neither one was ever auto-corrected by a
// later daily run, even though the sync resumed within a few days.
//
// Root cause, confirmed live against the real table: scripts/lifelenz-pull.mjs's getLatestDate()
// used to be a bare `ORDER BY date DESC LIMIT 1` over the WHOLE lifelenz_schedule table -- which
// also holds the DAYS_FWD (14-day) forward schedule horizon this same script writes on every
// successful run. That forward horizon is always ~14 days ahead of "today", so in main()'s
// `daysSince = today - latestDate` / `daysBack = max(SAFETY_DAYS, daysSince + SAFETY_DAYS)`,
// daysSince was always deeply negative and daysBack always collapsed to exactly SAFETY_DAYS (3)
// -- FOREVER, independent of how long a real gap in past actuals was. Measured live: the table's
// true MAX(date) was 2026-10-20 while "today" was 2026-10-06, a permanent ~14-day skew. Any
// outage longer than SAFETY_DAYS (this one ran 2026-09-26 -> 2026-09-29, a LIFELENZ_TOKEN expiry)
// permanently strands the days outside that fixed window once the run resumes further out, with
// nothing to ever auto-heal them -- exactly what happened here.
//
// Fixed getLatestDate() to find the latest date STRICTLY BEFORE today with a non-null `sales` --
// the real frontier of confirmed actuals, ignoring both the forward-schedule rows and today's
// own always-partial in-progress snapshot. Drives the fix through the REAL exported function
// against a mock Supabase client that RECORDS the exact filters sent, the only way to assert on
// the query shape itself (a live call either errors or returns data, neither of which proves
// whether the dead-code bare-MAX(date) query or the fixed query actually ran) -- same pattern as
// #365's ebos-monthly-date-bounds.test.js.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const __fakeConfig = { data: null, error: null };
const __calls = [];
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from(table) {
      const builder = {
        _lt: null, _not: null,
        select() { return builder; },
        lt(col, val) { builder._lt = { col, val }; return builder; },
        not(col, op, val) { builder._not = { col, op, val }; return builder; },
        order() { return builder; },
        limit() { return builder; },
        single() {
          __calls.push({ table, lt: builder._lt, not: builder._not });
          return Promise.resolve(__fakeConfig);
        },
      };
      return builder;
    },
  }),
}));

let getLatestDate;
beforeEach(async () => {
  vi.resetModules();
  __calls.length = 0;
  __fakeConfig.data = null;
  __fakeConfig.error = null;
  vi.stubEnv('VITE_SUPABASE_URL', 'https://fake.supabase.test');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'fake-service-role-key');
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-06T12:00:00Z'));
  ({ getLatestDate } = await import('../../scripts/lifelenz-pull.mjs'));
});
afterEach(() => { vi.useRealTimers(); });

describe('#dispatch lifelenz-pull getLatestDate — gap-detection query shape', () => {
  it('filters to date STRICTLY BEFORE today and sales NOT NULL — not a bare MAX(date) over the whole table', async () => {
    __fakeConfig.data = { date: '2026-09-24' };
    await getLatestDate();
    expect(__calls).toHaveLength(1);
    expect(__calls[0].table).toBe('lifelenz_schedule');
    // Strict "<" (not "<="): today's own row is always a partial in-progress snapshot while the
    // sync runs during the business day, so it must never count as a "confirmed" frontier.
    expect(__calls[0].lt).toEqual({ col: 'date', val: '2026-10-06' });
    // Excludes NULL placeholders (future schedule-only rows, and a day the sync never reached).
    expect(__calls[0].not).toEqual({ col: 'sales', op: 'is', val: null });
  });

  it('returns the found date as a real Date', async () => {
    __fakeConfig.data = { date: '2026-09-24' };
    const d = await getLatestDate();
    expect(d.toISOString().slice(0, 10)).toBe('2026-09-24');
  });

  it('returns null on a genuinely empty table (PGRST116), not an error', async () => {
    __fakeConfig.data = null;
    __fakeConfig.error = { code: 'PGRST116', message: 'no rows' };
    const d = await getLatestDate();
    expect(d).toBeNull();
  });

  it('throws on a real read failure instead of silently escalating to the biggest backfill window', async () => {
    __fakeConfig.data = null;
    __fakeConfig.error = { code: '500', message: 'connection reset' };
    await expect(getLatestDate()).rejects.toThrow(/getLatestDate\(\) read failed/);
  });
});
