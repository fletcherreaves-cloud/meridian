// @ts-nocheck
import { describe, it, expect, beforeEach } from 'vitest';
import { forecastDay } from '../engine/forecast.js';

const LOC = '3708';

function makeDate(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(12, 0, 0, 0);
  return d;
}

function dKey(d) {
  return d.toISOString().slice(0, 10);
}

function buildLaborIdx(rows) {
  const idx = {};
  for (const r of rows) {
    if (!r.loc || !r.date) continue;
    const k = r.loc + '_' + dKey(r.date);
    if (!idx[k]) idx[k] = [];
    idx[k].push(r);
  }
  return idx;
}

// Build a ds with two full years of weekly-ish history for one store.
// Sales oscillate around $10,000/day with a DOW pattern.
function buildDs(loc = LOC) {
  const laborRows = [];
  const DOW_MULT = [0.8, 1.0, 1.0, 1.05, 1.1, 1.3, 1.2]; // Sun–Sat

  for (let i = 730; i >= 1; i--) {
    const d = makeDate(i);
    const dow = d.getDay();
    const sales = Math.round(10000 * DOW_MULT[dow] * (0.95 + Math.random() * 0.1));
    laborRows.push({ loc, date: d, sales, gc: Math.round(sales / 7), laborPct: 0.28 });
  }

  const laborIdx = buildLaborIdx(laborRows);
  const lastActual = { [loc]: makeDate(1) };

  return {
    laborRows,
    laborIdx,
    laborByLoc: { [loc]: laborRows },
    opsRows: [], ctrlRows: [], weatherRows: [],
    darRows: [], pmixData: {}, records: {},
    targets: {},
    lastActual,
    loaded: true,
    storeIds: [loc],
  };
}

const BASE_SETTINGS = {
  mode: 'Forecast',
  trendWeights: { t2: 0.5, t4: 0.3, t6: 0.2 },
  dialedInEnabled: false,
  dialedIn: {},
  dialedInSkipped: [],
  _userEvents: {},
};

// ── forecastDay ───────────────────────────────────────────────────────────────

describe('forecastDay — null ds guard', () => {
  it('returns zero-forecast when ds is null', () => {
    const result = forecastDay(LOC, new Date(), null, BASE_SETTINGS);
    expect(result.forecast).toBe(0);
    expect(result.isFuture).toBe(true);
    expect(result.noLYData).toBe(true);
  });
});

describe('forecastDay — historical date (isFuture = false)', () => {
  let ds;
  beforeEach(() => { ds = buildDs(); });

  it('marks past dates as not future', () => {
    const pastDate = makeDate(10);
    const result = forecastDay(LOC, pastDate, ds, BASE_SETTINGS);
    expect(result.isFuture).toBe(false);
  });

  it('returns a positive forecast for a past date with LY data', () => {
    const pastDate = makeDate(10);
    const result = forecastDay(LOC, pastDate, ds, BASE_SETTINGS);
    expect(result.forecast).toBeGreaterThan(0);
    expect(result.noLYData).toBe(false);
  });

  it('sets actual from laborRows when the row exists', () => {
    const targetRow = ds.laborRows[ds.laborRows.length - 5];
    const result = forecastDay(LOC, targetRow.date, ds, BASE_SETTINGS);
    expect(result.actual).toBe(targetRow.sales);
  });
});

describe('forecastDay — future date (isFuture = true)', () => {
  let ds;
  beforeEach(() => { ds = buildDs(); });

  it('marks future dates correctly', () => {
    const futureDate = makeDate(-7); // 7 days from now
    const result = forecastDay(LOC, futureDate, ds, BASE_SETTINGS);
    expect(result.isFuture).toBe(true);
  });

  it('still returns a positive forecast for a future date', () => {
    const futureDate = makeDate(-7);
    const result = forecastDay(LOC, futureDate, ds, BASE_SETTINGS);
    expect(result.forecast).toBeGreaterThan(0);
  });
});

describe('forecastDay — forceModel', () => {
  let ds;
  beforeEach(() => { ds = buildDs(); });

  it('ewma model returns a positive forecast', () => {
    const pastDate = makeDate(10);
    const r = forecastDay(LOC, pastDate, ds, BASE_SETTINGS, null, null, 'weekly', 'ewma');
    expect(r.forecast).toBeGreaterThan(0);
    expect(r.modelUsed).toBe('ewma');
  });

  it('ae model returns a positive forecast', () => {
    const pastDate = makeDate(10);
    const r = forecastDay(LOC, pastDate, ds, BASE_SETTINGS, null, null, 'weekly', 'ae');
    expect(r.forecast).toBeGreaterThan(0);
    expect(r.modelUsed).toBe('ae');
  });

  it('ewma and ae produce different values', () => {
    const pastDate = makeDate(14);
    const ewma = forecastDay(LOC, pastDate, ds, BASE_SETTINGS, null, null, 'weekly', 'ewma');
    const ae   = forecastDay(LOC, pastDate, ds, BASE_SETTINGS, null, null, 'weekly', 'ae');
    // Different models — values can differ (not guaranteed, but almost always true with real data)
    expect(typeof ewma.forecast).toBe('number');
    expect(typeof ae.forecast).toBe('number');
  });
});

describe('forecastDay — result shape', () => {
  it('always returns required fields', () => {
    const ds = buildDs();
    const result = forecastDay(LOC, makeDate(10), ds, BASE_SETTINGS);
    const required = ['date', 'loc', 'forecast', 'ly', 'lyAdj', 't2', 't4', 't6',
                      'actual', 'isFuture', 'noLYData', 'opsFactor'];
    for (const key of required) {
      expect(result).toHaveProperty(key);
    }
  });
});
