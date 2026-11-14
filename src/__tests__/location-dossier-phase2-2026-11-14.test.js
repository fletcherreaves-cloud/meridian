// @ts-nocheck
// Task #79 Phase 2 — Location Dossier: Scanner-curated correlations + plain-language L3M trend
// reads. See memory/plan-location-dossier-report-2026-11-04.md's "Phase 2 SHIPPED" section.
import { describe, it, expect } from 'vitest';
import {
  dossierWindows, metricTrend, dossierTrends, dossierCorrelations, topCorrelations, DOSSIER_METRICS,
} from '../engine/location-dossier.js';

// Real calendar-walked date strings (never hand-built month literals -- those silently produce
// an invalid ISO string like "2026-08-32" once a loop index runs past a real month's length).
function _dateRange(startISO, count) {
  const out = [];
  const d = new Date(startISO + 'T00:00:00');
  for (let i = 0; i < count; i++) {
    out.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

const firstHalfDates = _dateRange('2026-08-01', 46); // Aug 1 -> Sep 15 (first half of the real L3M window below)
const secondHalfDates = _dateRange('2026-09-16', 46); // Sep 16 -> Oct 31 (second half)

describe('metricTrend', () => {
  const l3m = { id: 'l3m', s: '2026-08-01', e: '2026-10-31' }; // 92 days, matches dossierWindows' real L3M shape

  it('a sustained rise with lowerIsBetter:false reads up + improving', () => {
    const rows = [
      ...firstHalfDates.map(date => ({ loc: '3708', date, sales: 1000 })),
      ...secondHalfDates.map(date => ({ loc: '3708', date, sales: 1300 })), // +30%, well past the 3% floor
    ];
    const ds = { laborRows: rows };
    const spec = { key: 'sales', agg: 'avg', lowerIsBetter: false };
    const trend = metricTrend(ds, '3708', l3m, spec);
    expect(trend).toBeTruthy();
    expect(trend.dir).toBe('up');
    expect(trend.better).toBe(true); // sales up, higher-is-better -> improving
    expect(trend.v2).toBeGreaterThan(trend.v1);
  });

  it('the SAME rise with lowerIsBetter:true reads up + worsening (direction and judgment are independent)', () => {
    const rows = [
      ...firstHalfDates.map(date => ({ loc: '3708', date, sales: 1000 })),
      ...secondHalfDates.map(date => ({ loc: '3708', date, sales: 1300 })),
    ];
    const ds = { laborRows: rows };
    const spec = { key: 'sales', agg: 'avg', lowerIsBetter: true };
    const trend = metricTrend(ds, '3708', l3m, spec);
    expect(trend.dir).toBe('up');
    expect(trend.better).toBe(false); // same rise, but lower-is-better -> worsening
  });

  it('a sub-3% move reads flat, with better:null (nothing to judge)', () => {
    const rows = [
      ...firstHalfDates.map(date => ({ loc: '3708', date, sales: 1000 })),
      ...secondHalfDates.map(date => ({ loc: '3708', date, sales: 1010 })), // +1%, under the 3% floor
    ];
    const ds = { laborRows: rows };
    const spec = { key: 'sales', agg: 'avg', lowerIsBetter: false };
    const trend = metricTrend(ds, '3708', l3m, spec);
    expect(trend.dir).toBe('flat');
    expect(trend.better).toBeNull();
  });

  it('a window shorter than 14 days returns null -- too short to split meaningfully', () => {
    const shortWindow = { id: 'tiny', s: '2026-11-01', e: '2026-11-05' };
    const ds = { laborRows: [{ loc: '3708', date: '2026-11-01', sales: 1000 }, { loc: '3708', date: '2026-11-05', sales: 1200 }] };
    expect(metricTrend(ds, '3708', shortWindow, { key: 'sales', agg: 'avg', lowerIsBetter: false })).toBeNull();
  });

  it('no resolvable data in either half returns null, not a guessed direction', () => {
    expect(metricTrend({}, '9999', l3m, { key: 'sales', agg: 'avg', lowerIsBetter: false })).toBeNull();
  });
});

describe('dossierTrends', () => {
  it('computes a trend per DOSSIER_METRICS key, keyed off the L3M window found in windows[]', () => {
    const rows = [
      ...firstHalfDates.map(date => ({ loc: '3708', date, sales: 1000 })),
      ...secondHalfDates.map(date => ({ loc: '3708', date, sales: 1300 })),
    ];
    const windows = dossierWindows(new Date('2026-11-13T12:00:00'));
    const trends = dossierTrends({ laborRows: rows }, '3708', windows);
    expect(Object.keys(trends)).toEqual(DOSSIER_METRICS.map(m => m.key));
    expect(trends.sales.dir).toBe('up');
  });

  it('returns {} when windows has no l3m entry', () => {
    expect(dossierTrends({}, '3708', [{ id: 'current', s: '2026-11-01', e: '2026-11-10' }])).toEqual({});
  });
});

describe('dossierCorrelations + topCorrelations', () => {
  it('surfaces a real sales<->gc correlation for the scoped store via the real Scanner engine', () => {
    const rows = [];
    for (let i = 0; i < 20; i++) {
      rows.push({ loc: '3708', date: `2026-09-${String(i + 1).padStart(2, '0')}`, sales: 1000 + 50 * i, gc: 100 + 5 * i });
    }
    const ds = { laborRows: rows };
    const scan = dossierCorrelations(ds, '3708', { minN: 5, minAbsR: 0.3 });
    expect(scan.results.length).toBeGreaterThan(0);
    const pair = scan.results.find(r => (r.xKey === 'sales' && r.yKey === 'gc') || (r.xKey === 'gc' && r.yKey === 'sales'));
    expect(pair).toBeTruthy();
    expect(Math.abs(pair.r)).toBeGreaterThan(0.9); // near-perfect linear construction
  });

  it('a store with no matched history surfaces nothing, not an error', () => {
    const scan = dossierCorrelations({}, '9999');
    expect(scan.results).toEqual([]);
  });

  it('topCorrelations ranks FDR-significant pairs ahead of a larger-|r| pair that is not FDR-significant', () => {
    const scanResult = {
      results: [
        { xKey: 'a', yKey: 'b', r: 0.9, fdrSig: false },
        { xKey: 'c', yKey: 'd', r: 0.5, fdrSig: true },
        { xKey: 'e', yKey: 'f', r: 0.4, fdrSig: true },
      ],
    };
    const { headline, rest } = topCorrelations(scanResult, 2);
    expect(headline.map(h => h.xKey)).toEqual(['c', 'e']); // both fdrSig, ordered by |r| within that tier
    expect(rest.map(h => h.xKey)).toEqual(['a']);
  });

  it('empty/null scan result -> empty headline and rest, no crash', () => {
    expect(topCorrelations(null)).toEqual({ headline: [], rest: [] });
    expect(topCorrelations({ results: [] })).toEqual({ headline: [], rest: [] });
  });
});
