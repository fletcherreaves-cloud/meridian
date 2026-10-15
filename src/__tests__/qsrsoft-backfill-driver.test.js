// @ts-nocheck
// Pure chunk-picking logic for scripts/qsrsoft-backfill-driver.mjs (owner request 2026-10-15,
// "meter the data in"). Covers only targetStartDate()/nextChunk() -- no network, no Supabase --
// the actual pull/cursor-write behavior needs real credentials and is exercised live, not here.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { targetStartDate, nextChunk, TYPES } from '../../scripts/qsrsoft-backfill-driver.mjs';

describe('targetStartDate', () => {
  it('is exactly N years before "today", computed fresh (not frozen)', () => {
    expect(targetStartDate(new Date('2026-10-15T12:00:00Z'), 7)).toBe('2019-10-15');
    expect(targetStartDate(new Date('2026-10-15T12:00:00Z'), 5)).toBe('2021-10-15');
  });

  it('two calls a day apart both recede by exactly one day (never a frozen campaign-start anchor)', () => {
    const d1 = targetStartDate(new Date('2026-10-15T12:00:00Z'), 7);
    const d2 = targetStartDate(new Date('2026-10-16T12:00:00Z'), 7);
    expect(d1).toBe('2019-10-15');
    expect(d2).toBe('2019-10-16');
  });
});

describe('nextChunk', () => {
  const today = new Date('2026-10-15T12:00:00Z');

  it('first run (no cursor yet): walks back from yesterday, chunkDays wide', () => {
    const c = nextChunk({ earliestDatePulled: null, today, chunkDays: 90, yearsBack: 7 });
    expect(c.end).toBe('2026-10-14'); // yesterday -- today's own day is covered by the live pull
    // 90 days ending 2026-10-14 starts 2026-07-17 (89 days earlier)
    expect(c.start).toBe('2026-07-17');
  });

  it('a subsequent run picks up the day BEFORE the cursor, not from the cursor itself', () => {
    const c = nextChunk({ earliestDatePulled: '2026-07-17', today, chunkDays: 90, yearsBack: 7 });
    expect(c.end).toBe('2026-07-16'); // the day before the already-covered 2026-07-17
    expect(c.start).toBe('2026-04-18');
  });

  it('clips the final chunk to the target floor instead of overshooting past it', () => {
    // Cursor sitting 40 days above the 7-year floor (2019-10-15) -- a full 90-day chunk would
    // overshoot the floor by 50 days; the chunk must stop exactly at the floor.
    const c = nextChunk({ earliestDatePulled: '2019-11-24', today, chunkDays: 90, yearsBack: 7 });
    expect(c.end).toBe('2019-11-23');
    expect(c.start).toBe('2019-10-15'); // clipped to the floor, not 2019-08-25
  });

  it('returns null once the cursor has reached (or passed) the floor -- the "done" signal', () => {
    expect(nextChunk({ earliestDatePulled: '2019-10-15', today, chunkDays: 90, yearsBack: 7 })).toBeNull();
    expect(nextChunk({ earliestDatePulled: '2019-10-01', today, chunkDays: 90, yearsBack: 7 })).toBeNull();
  });

  it('the floor itself recedes with "today", so a campaign running for months still terminates', () => {
    // Same cursor position, but "today" has advanced 200 days -- the floor has receded by the
    // same 200 days, so what used to be a live chunk is now past the (newly receded) floor.
    const laterToday = new Date('2027-05-03T12:00:00Z'); // ~200 days after 2026-10-15
    const c = nextChunk({ earliestDatePulled: '2019-11-24', today: laterToday, chunkDays: 90, yearsBack: 7 });
    expect(c).toBeNull(); // 2019-11-23 is now before the receded floor (2020-05-03)
  });
});

// Live dry-run (2026-10-15) caught exactly this: TYPES.ops.destDateCol was wrongly 'date' --
// qsr_cash_sheet (like qsr_daily_activity) actually uses 'dt'. nextChunk()/targetStartDate()'s
// pure logic can't catch a wrong column name at all; it only surfaces on a real Supabase read.
// This cross-checks each TYPES entry's destDateCol against the column name the REAL pull
// script itself queries that table by, so a future typo here fails in CI instead of in a
// scheduled run against production.
describe('TYPES.*.destDateCol matches the column each pull script itself actually queries', () => {
  const EXTRACTORS = {
    ebos: { file: 'scripts/qsrsoft-ebos-pull.mjs', re: /onConflict:\s*'loc,(\w+)'/ },
    dar:  { file: 'scripts/qsrsoft-dar-pull.mjs',  re: /onConflict:\s*'loc,(\w+),hour_slot'/ },
    ops:  { file: 'scripts/qsrsoft-ops-pull.mjs',  re: /from\('qsr_cash_sheet'\)\.select\('(?:loc,)?(\w+)/ },
  };

  for (const [type, { file, re }] of Object.entries(EXTRACTORS)) {
    it(`${type}: destDateCol ('${TYPES[type].destDateCol}') matches ${file}'s own real column`, () => {
      const src = readFileSync(file, 'utf8');
      const m = re.exec(src);
      expect(m, `pattern not found in ${file} -- update EXTRACTORS if that script's query shape changed`).not.toBeNull();
      expect(TYPES[type].destDateCol).toBe(m[1]);
    });
  }
});
