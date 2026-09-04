// @ts-nocheck
// Phase 2 (3/3) of memory/project-events-calendar-redesign-2026-09-04.md, item 8 —
// deriveWeatherCandidates (scripts/lib/weather-candidates.mjs), the candidate-day derivation for
// the weather event-impact measurement script. This environment's outbound proxy blocks
// archive-api.open-meteo.com (confirmed via its own status endpoint: connect_rejected, policy
// denial), so the script's live-fetch path could not be dry-run against real weather data the
// way the Supabase-only scripts (collapse-scoped-events.mjs, cleanup-materialized-holiday-
// events.mjs) were. These tests are the verification instead: fixture weather rows built to sit
// on exact known sides of each threshold, so a boundary regression fails a specific test.
import { describe, it, expect } from 'vitest';
import { deriveWeatherCandidates, WEATHER_THRESHOLDS } from '../../scripts/lib/weather-candidates.mjs';

const d = s => new Date(s + 'T00:00:00');
const LOC = '3708';

// A quiet baseline month (January) so the monthly-norm-deviation check has real signal.
function baselineRows(n = 20) {
  const rows = [];
  for (let i = 1; i <= n; i++) {
    rows.push({ loc: LOC, date: d(`2026-01-${String(i).padStart(2, '0')}`), tmax: 55, tmin: 35, tavg: 45, rain: 0, wspd: 10 });
  }
  return rows;
}

describe('deriveWeatherCandidates', () => {
  it('flags extreme heat (tmax > 100) and does not flag exactly 100', () => {
    const rows = [
      ...baselineRows(),
      { loc: LOC, date: d('2026-02-01'), tmax: 101, tmin: 70, tavg: 85, rain: 0, wspd: 5 },
      { loc: LOC, date: d('2026-02-02'), tmax: 100, tmin: 70, tavg: 85, rain: 0, wspd: 5 }, // boundary: NOT > 100
    ];
    const out = deriveWeatherCandidates(rows);
    expect(out[LOC]).toContain('2026-02-01');
    expect(out[LOC]).not.toContain('2026-02-02');
  });

  it('flags severe cold (tmin < 20) and does not flag exactly 20', () => {
    const rows = [
      ...baselineRows(),
      { loc: LOC, date: d('2026-02-01'), tmax: 30, tmin: 19, tavg: 24, rain: 0, wspd: 5 },
      { loc: LOC, date: d('2026-02-02'), tmax: 35, tmin: 20, tavg: 27, rain: 0, wspd: 5 }, // boundary: NOT < 20
    ];
    const out = deriveWeatherCandidates(rows);
    expect(out[LOC]).toContain('2026-02-01');
    expect(out[LOC]).not.toContain('2026-02-02');
  });

  it('flags heavy rain (> 0.5") and does not flag exactly 0.5"', () => {
    const rows = [
      ...baselineRows(),
      { loc: LOC, date: d('2026-02-01'), tmax: 55, tmin: 35, tavg: 45, rain: 0.51, wspd: 5 },
      { loc: LOC, date: d('2026-02-02'), tmax: 55, tmin: 35, tavg: 45, rain: 0.5, wspd: 5 }, // boundary
    ];
    const out = deriveWeatherCandidates(rows);
    expect(out[LOC]).toContain('2026-02-01');
    expect(out[LOC]).not.toContain('2026-02-02');
  });

  it('flags high wind (> 40 mph) and does not flag exactly 40', () => {
    const rows = [
      ...baselineRows(),
      { loc: LOC, date: d('2026-02-01'), tmax: 55, tmin: 35, tavg: 45, rain: 0, wspd: 41 },
      { loc: LOC, date: d('2026-02-02'), tmax: 55, tmin: 35, tavg: 45, rain: 0, wspd: 40 }, // boundary
    ];
    const out = deriveWeatherCandidates(rows);
    expect(out[LOC]).toContain('2026-02-01');
    expect(out[LOC]).not.toContain('2026-02-02');
  });

  it('flags a big deviation from the monthly norm (>= 15°F), computed inclusive of the candidate day itself (same as getWeatherNote)', () => {
    // January baseline established at tavg=45 across 30 days. The norm is self-inclusive (one
    // outlier day among 30 nudges the average only slightly), so the fixture uses a comfortable
    // margin above the 15°F bar rather than exactly 15 to avoid that dilution flipping the result.
    const rows = [...baselineRows(30), { loc: LOC, date: d('2026-01-21'), tmax: 75, tmin: 55, tavg: 65, rain: 0, wspd: 5 }];
    const out = deriveWeatherCandidates(rows);
    expect(out[LOC]).toContain('2026-01-21');
  });

  it('does NOT flag a normal, unremarkable day', () => {
    const rows = [...baselineRows(), { loc: LOC, date: d('2026-01-21'), tmax: 58, tmin: 36, tavg: 47, rain: 0.05, wspd: 12 }];
    const out = deriveWeatherCandidates(rows);
    expect(out[LOC]).toBeUndefined();
  });

  it('the monthly norm is computed PER STORE, not pooled across stores', () => {
    const rows = [
      ...baselineRows(30), // OK store 3708, norm ~45°F, Jan 1-30
      // FL store, much warmer baseline (~75°F, Jan 1-27) — a cold-for-FL day (Jan 28) is a big
      // deviation for FL, even though it would be unremarkable relative to 3708's own norm.
      ...Array.from({ length: 27 }, (_, i) => ({ loc: '6178', date: d(`2026-01-${String(i + 1).padStart(2, '0')}`), tmax: 80, tmin: 65, tavg: 75, rain: 0, wspd: 8 })),
      { loc: '6178', date: d('2026-01-28'), tmax: 60, tmin: 50, tavg: 55, rain: 0, wspd: 8 }, // ~20°F below FL's own norm, comfortable margin
    ];
    const out = deriveWeatherCandidates(rows);
    expect(out['6178']).toContain('2026-01-28');
    expect(out['3708']).toBeUndefined(); // 3708's own days are all at its own norm, unremarkable
  });

  it('a custom thresholds object overrides the defaults', () => {
    const rows = [...baselineRows(), { loc: LOC, date: d('2026-01-21'), tmax: 90, tmin: 35, tavg: 60, rain: 0, wspd: 5 }];
    // Default: tmax=90 is not > 100, not flagged.
    expect(deriveWeatherCandidates(rows)[LOC]).toBeUndefined();
    // Custom stricter threshold: tmax > 85 flags it.
    const out = deriveWeatherCandidates(rows, { ...WEATHER_THRESHOLDS, extremeHeatTmax: 85 });
    expect(out[LOC]).toContain('2026-01-21');
  });

  it('returns {} for empty input, not a throw', () => {
    expect(deriveWeatherCandidates([])).toEqual({});
    expect(deriveWeatherCandidates(null)).toEqual({});
  });
});
