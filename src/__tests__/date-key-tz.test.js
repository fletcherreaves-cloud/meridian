// @ts-nocheck
// dKey builds every per-(loc,date) index key in the app (219 call sites across 29 files), so a
// row's calendar day must not depend on which representation it happens to carry.
//
// The bug (found 2026-08-08, Notes 61): `new Date('2025-07-15')` parses as UTC midnight while
// getFullYear/getMonth/getDate read LOCAL, so in America/Chicago dKey('2025-07-15') returned
// "2025-07-14". Rows built by loaders (`new Date(report_date + 'T00:00:00')` — local midnight)
// keyed correctly; rows rehydrated from cache as strings keyed one day EARLY.
//
// Nothing fails while both sides of a lookup use the same representation. It breaks when they
// diverge — fetchLY indexes laborIdx with dKey(Date - 364d) while the index was built from
// string-dated rows, so every lookup missed: "precomputed<35 (0/146 rows had valid LY)".
//
// These tests are timezone-independent by construction: they assert AGREEMENT between forms
// rather than a hardcoded expected string, so they hold in UTC CI and in America/Chicago.

import { describe, it, expect } from 'vitest';
import { dKey, addD } from '../utils/date.js';

describe('dKey — representation must not change the calendar day', () => {
  it('agrees across bare string, ISO-Z string, and local-midnight Date', () => {
    const day = '2025-07-15';
    expect(dKey(day)).toBe(day);
    expect(dKey(day + 'T00:00:00.000Z')).toBe(day);
    expect(dKey(day + 'T13:22:04')).toBe(day);
    expect(dKey(new Date(day + 'T00:00:00'))).toBe(day);
  });

  it('a Date late in the local day still keys to that local day, not UTC tomorrow', () => {
    // Guards the other direction: the string fast-path must not have broken Date handling.
    // 23:30 local on 2025-07-15 is already 2025-07-16 in UTC.
    expect(dKey(new Date(2025, 6, 15, 23, 30))).toBe('2025-07-15');
  });

  it('holds across a DST boundary in both directions', () => {
    // US DST starts 2025-03-09 and ends 2025-11-02 — the classic off-by-one hotspots.
    for (const day of ['2025-03-08', '2025-03-09', '2025-03-10', '2025-11-01', '2025-11-02', '2025-11-03']) {
      expect(dKey(day), `bare string ${day}`).toBe(day);
      expect(dKey(new Date(day + 'T00:00:00')), `Date ${day}`).toBe(day);
    }
  });

  it('the LY lookup pattern round-trips: index built from strings, queried with a Date', () => {
    // This is the exact shape of the production failure. bIdx keys rows by dKey(r.date); fetchLY
    // queries with dKey(addD(date, -364)). If the two disagree, every LY lookup misses.
    const rowDate = '2025-07-16';                        // as a cache-rehydrated string
    const idx = { ['3708_' + dKey(rowDate)]: [{ sales: 1234 }] };

    const queryFrom = new Date('2026-07-15T00:00:00');   // a Date, 364 days later
    const hit = idx['3708_' + dKey(addD(queryFrom, -364))];

    expect(hit, 'LY lookup missed — dKey disagrees between index build and query').toBeTruthy();
    expect(hit[0].sales).toBe(1234);
  });

  it('every day of a month keys to itself as a bare string', () => {
    for (let d = 1; d <= 31; d++) {
      const day = `2025-01-${String(d).padStart(2, '0')}`;
      expect(dKey(day)).toBe(day);
    }
  });
});
