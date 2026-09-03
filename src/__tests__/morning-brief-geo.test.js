// @vitest-environment happy-dom
// @ts-nocheck
// features/morning-brief.js's storeDistance/regionalRadius/getLatestBriefDate had zero test
// coverage despite being live: storeDistance/regionalRadius are imported directly by
// views/analytics.js to power the "regional broad-event" candidate queue in the AI batch-tagging
// flow, and getLatestBriefDate drives the Morning Brief panel's own date state.
//
// Writing these tests surfaced two real, live bugs, both fixed in the same commit:
//   1. storeDistance read b.lng/a.lng, but STORE_COORDS (constants.js) only has {lat,lon,tz} --
//      lng is always undefined, so every real distance computed NaN, and NaN<=radius is always
//      false. The regional-candidate queue in analytics.js has therefore never surfaced a single
//      nearby-store suggestion. Fixed: reads .lon.
//   2. regionalRadius read STORE_COORDS[loc].org, a field that doesn't exist on that table at
//      all (constants.js's real org lookup is getStoreOrg(loc), returning 'emerald'/'mcdok') --
//      always fell through to the 150mi default, so the tighter 80mi FL radius never applied.
//      Fixed: uses getStoreOrg(loc)==='emerald'.
import { describe, it, expect } from 'vitest';
import { storeDistance, regionalRadius, getLatestBriefDate } from '../features/morning-brief.js';

// Real seed stores (constants.js STORE_COORDS): '3708' Ardmore-Broadway OK, '6178' Chipley FL.
describe('storeDistance', () => {
  it('is 0 for a store against itself', () => {
    expect(storeDistance('3708', '3708')).toBeCloseTo(0, 6);
  });

  it('returns a finite, positive mileage for two real stores (was NaN before the .lon fix)', () => {
    const dist = storeDistance('3708', '6178');
    expect(Number.isFinite(dist)).toBe(true);
    expect(dist).toBeGreaterThan(0);
    // Ardmore OK to Chipley FL is a genuine long haul -- sanity-bound it, not exact-match it.
    expect(dist).toBeGreaterThan(600);
    expect(dist).toBeLessThan(800);
  });

  it('is symmetric', () => {
    expect(storeDistance('3708', '6178')).toBeCloseTo(storeDistance('6178', '3708'), 6);
  });

  it('returns Infinity for an unknown loc', () => {
    expect(storeDistance('3708', '99999')).toBe(Infinity);
    expect(storeDistance('99999', '3708')).toBe(Infinity);
  });
});

describe('regionalRadius', () => {
  it('returns 80 for a Florida (Emerald Arches) store (was always 150 before the getStoreOrg fix)', () => {
    expect(regionalRadius('6178')).toBe(80); // Chipley FL
  });

  it('returns 150 for an Oklahoma (MCDOK) store', () => {
    expect(regionalRadius('3708')).toBe(150); // Ardmore-Broadway OK
  });
});

describe('getLatestBriefDate', () => {
  it('returns the max date across laborRows/ctrlRows/peaksSvcRows', () => {
    const ds = {
      laborRows: [{ date: '2026-08-01' }, { date: '2026-08-15' }],
      ctrlRows: [{ date: '2026-08-10' }],
      peaksSvcRows: [{ date: '2026-08-20' }],
    };
    const d = getLatestBriefDate(ds);
    expect(d.toISOString().slice(0, 10)).toBe('2026-08-20');
  });

  it('accepts Date objects mixed with date strings', () => {
    const ds = { laborRows: [{ date: new Date('2026-08-05') }], ctrlRows: [], peaksSvcRows: [{ date: '2026-08-12' }] };
    const d = getLatestBriefDate(ds);
    expect(d.toISOString().slice(0, 10)).toBe('2026-08-12');
  });

  it('falls back to "now" when no rows have a date', () => {
    const before = Date.now();
    const d = getLatestBriefDate({ laborRows: [], ctrlRows: [], peaksSvcRows: [] });
    expect(d.getTime()).toBeGreaterThanOrEqual(before);
  });
});
