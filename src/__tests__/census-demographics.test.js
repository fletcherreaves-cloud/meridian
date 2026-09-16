// @ts-nocheck
// Census/ACS trade-area demographics (backlog: "Demographics per location, Census/ACS API").
// This session's sandbox network policy blocks geocoding.geo.census.gov / api.census.gov
// outright (confirmed via both curl and WebFetch), so the live APIs could not be smoke-tested
// before merge -- see src/engine/census-demographics.js's own header comment. These tests
// exercise the pure shaping logic directly (shapeAcsRow) against literal ACS-response fixtures,
// and the orchestration logic (geocodeToTract/fetchAcsForTract/fetchAllStoreDemographics)
// against a mocked global fetch built from the Census APIs' own documented response shapes --
// the standard way this repo tests external-pull logic it can't hit live (e.g. the QSRSoft pull
// scripts' own response-shape tests).
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ACS_VINTAGE, geocodeToTract, fetchAcsForTract, shapeAcsRow,
  fetchStoreDemographics, fetchAllStoreDemographics,
} from '../engine/census-demographics.js';

describe('shapeAcsRow — pure ACS-row shaping + the -666666666 null sentinel', () => {
  it('maps a normal ACS row into Meridian\'s camelCase shape, computing poverty rate and owner-occupied % as ratios', () => {
    const byVar = {
      B01003_001E: '4200',      // population
      B19013_001E: '58000',     // median household income
      B01002_001E: '36.4',      // median age
      B17001_002E: '420',       // below poverty
      B17001_001E: '4100',      // poverty universe
      B25003_002E: '1200',      // owner-occupied
      B25003_003E: '800',       // renter-occupied
      B25003_001E: '2000',      // occupied universe
      B25010_001E: '2.6',       // avg household size
    };
    expect(shapeAcsRow(byVar)).toEqual({
      population: 4200,
      medianHouseholdIncome: 58000,
      medianAge: 36.4,
      povertyRate: 420 / 4100,
      ownerOccupiedPct: 1200 / 2000,
      avgHouseholdSize: 2.6,
    });
  });

  it('Census\'s -666666666 suppressed-estimate sentinel becomes null, never a huge negative number', () => {
    const byVar = {
      B01003_001E: '1500', B19013_001E: '-666666666', B01002_001E: '-666666666',
      B17001_002E: '50', B17001_001E: '1400', B25003_002E: '400', B25003_003E: '600',
      B25003_001E: '1000', B25010_001E: '-666666666',
    };
    const shaped = shapeAcsRow(byVar);
    expect(shaped.medianHouseholdIncome).toBeNull();
    expect(shaped.medianAge).toBeNull();
    expect(shaped.avgHouseholdSize).toBeNull();
    expect(shaped.population).toBe(1500); // an unaffected field still parses normally
  });

  it('a zero-population poverty/occupied universe never divides by zero (null rate, not Infinity/NaN)', () => {
    const byVar = {
      B01003_001E: '0', B19013_001E: '0', B01002_001E: '0',
      B17001_002E: '0', B17001_001E: '0', B25003_002E: '0', B25003_003E: '0',
      B25003_001E: '0', B25010_001E: '0',
    };
    const shaped = shapeAcsRow(byVar);
    expect(shaped.povertyRate).toBeNull();
    expect(shaped.ownerOccupiedPct).toBeNull();
  });

  it('missing/null/empty-string values never throw, just become null', () => {
    expect(() => shapeAcsRow({})).not.toThrow();
    const shaped = shapeAcsRow({ B01003_001E: null, B19013_001E: '' });
    expect(shaped.population).toBeNull();
    expect(shaped.medianHouseholdIncome).toBeNull();
  });
});

describe('geocodeToTract / fetchAcsForTract — mocked fetch, documented Census response shapes', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('parses a real-shaped Census Geocoder response into {stateFips,countyFips,tractFips,geoid}', async () => {
    global.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        result: { geographies: { 'Census Tracts': [{ STATE: '40', COUNTY: '019', TRACT: '000600', GEOID: '40019000600' }] } },
      }),
    }));
    const tract = await geocodeToTract(34.1741, -97.1434);
    expect(tract).toEqual({ stateFips: '40', countyFips: '019', tractFips: '000600', geoid: '40019000600' });
    // Confirms the actual coordinates are threaded into the request URL (x=lon, y=lat -- easy
    // to transpose and silently geocode a store to the wrong tract).
    const url = global.fetch.mock.calls[0][0];
    expect(url).toContain('x=-97.1434');
    expect(url).toContain('y=34.1741');
  });

  it('throws a clear, step-named error when the geocoder returns no matching tract (e.g. coordinates outside the US)', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ result: { geographies: {} } }) }));
    await expect(geocodeToTract(0, 0)).rejects.toThrow(/No Census Tract found/);
  });

  it('throws a clear error naming the geocoder step on a non-2xx HTTP status', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 503 }));
    await expect(geocodeToTract(34.1741, -97.1434)).rejects.toThrow(/Census geocoder HTTP 503/);
  });

  it('parses a real-shaped ACS5 [header,row] response into a variable-code-keyed object', async () => {
    global.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve([
        ['NAME', 'B01003_001E', 'B19013_001E', 'state', 'county', 'tract'],
        ['Census Tract 6, Carter County, Oklahoma', '4200', '58000', '40', '019', '000600'],
      ]),
    }));
    const byVar = await fetchAcsForTract({ stateFips: '40', countyFips: '019', tractFips: '000600' });
    expect(byVar.B01003_001E).toBe('4200');
    expect(byVar.B19013_001E).toBe('58000');
    const url = global.fetch.mock.calls[0][0];
    expect(url).toContain(`/${ACS_VINTAGE}/acs/acs5`);
    expect(url).toContain('for=tract:000600');
    expect(url).toContain('in=state:40+county:019');
  });

  it('throws a clear error when the ACS API returns only a header row (tract genuinely has no data)', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve([['NAME', 'B01003_001E']]) }));
    await expect(fetchAcsForTract({ stateFips: '40', countyFips: '019', tractFips: '999999' }))
      .rejects.toThrow(/No ACS data returned/);
  });
});

describe('fetchStoreDemographics — one store, geocoder then ACS chained', () => {
  it('returns a full record combining the geocoded tract + shaped ACS estimates', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ result: { geographies: { 'Census Tracts': [{ STATE: '40', COUNTY: '019', TRACT: '000600', GEOID: '40019000600' }] } } }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([
        ['NAME', 'B01003_001E', 'B19013_001E', 'B01002_001E', 'B17001_002E', 'B17001_001E', 'B25003_002E', 'B25003_003E', 'B25003_001E', 'B25010_001E'],
        ['x', '4200', '58000', '36.4', '420', '4100', '1200', '800', '2000', '2.6'],
      ]) });
    const rec = await fetchStoreDemographics('3708', 34.1741, -97.1434);
    expect(rec.loc).toBe('3708');
    expect(rec.tractGeoid).toBe('40019000600');
    expect(rec.acsVintage).toBe(ACS_VINTAGE);
    expect(rec.population).toBe(4200);
    expect(rec.medianHouseholdIncome).toBe(58000);
    expect(global.fetch).toHaveBeenCalledTimes(2); // geocoder then ACS, in that order
  });
});

describe('fetchAllStoreDemographics — sequential, per-store error isolation, throttled', () => {
  it('a failure on one store does not abort the batch — every OTHER store still resolves', async () => {
    const coords = { '3708': { lat: 1, lon: 1 }, '5183': { lat: 2, lon: 2 } };
    global.fetch = vi.fn()
      // store 3708: geocoder fails outright
      .mockResolvedValueOnce({ ok: false, status: 500 })
      // store 5183: geocoder + ACS both succeed
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ result: { geographies: { 'Census Tracts': [{ STATE: '40', COUNTY: '109', TRACT: '000100', GEOID: '40109000100' }] } } }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([
        ['NAME', 'B01003_001E', 'B19013_001E', 'B01002_001E', 'B17001_002E', 'B17001_001E', 'B25003_002E', 'B25003_003E', 'B25003_001E', 'B25010_001E'],
        ['x', '3000', '52000', '34', '300', '2900', '900', '600', '1500', '2.4'],
      ]) });
    const { rows, errors } = await fetchAllStoreDemographics(coords, () => {});
    expect(rows.map(r => r.loc)).toEqual(['5183']);
    expect(errors).toEqual([{ loc: '3708', error: 'Census geocoder HTTP 500' }]);
  }, 10000);

  it('a store with no coordinates on file is reported as an error, never a crash', async () => {
    const coords = { '9999': {} };
    global.fetch = vi.fn();
    const { rows, errors } = await fetchAllStoreDemographics(coords, () => {});
    expect(rows).toEqual([]);
    expect(errors).toEqual([{ loc: '9999', error: 'no coordinates on file' }]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('reports progress once per store, in order', async () => {
    const coords = { '3708': { lat: 1, lon: 1 } };
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ result: { geographies: { 'Census Tracts': [{ STATE: '40', COUNTY: '019', TRACT: '000600', GEOID: '40019000600' }] } } }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([['NAME'], ['x']]) });
    const progress = [];
    await fetchAllStoreDemographics(coords, (done, total, loc) => progress.push({ done, total, loc }));
    expect(progress).toEqual([{ done: 1, total: 1, loc: '3708' }]);
  });
});
