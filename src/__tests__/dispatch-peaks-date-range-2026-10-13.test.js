// @ts-nocheck
// Mass-review notes 70 (2026-10-13) — "3 Peaks > Add option to filter dates (date selector)."
// analyzePeaks() gained an optional 5th `explicitRange` param ({s,e}), wired to a new
// DateRangeControl in PeaksTab (store-dash.js). This tests the actual logic change (the
// function the UI calls unchanged, not a detached re-implementation) — PeaksTab itself just
// threads `dateRange` state straight through to this call with no further transform, so a DOM
// render of PeaksTab would exercise the identical code path this test already covers.
import { describe, it, expect } from 'vitest';
import { analyzePeaks } from '../views/store-dash.js';

const LOC = '3708';
const d = s => new Date(s + 'T12:00:00Z');

function svcRow(date, oepe) { return { loc: LOC, date: d(date), slice: 'lunch', oepe, r2p: 80, kvst: 40, parkPct: 0.1, dtGC: 50 }; }
function salesRow(date, netSales) { return { loc: LOC, date: d(date), slice: 'lunch', netSales, gc: 100, avgCheck: 10, tpph: 5 }; }

describe('analyzePeaks — explicitRange (mass-review notes 70)', () => {
  it('with no explicitRange, behaves exactly as before (wb-trailing-window default)', () => {
    const svc = [svcRow('2026-10-01', 100)];
    const sales = [salesRow('2026-10-01', 1000)];
    const r = analyzePeaks(svc, sales, LOC, 6);
    expect(r.lunch.oepe).toBeCloseTo(100, 2);
  });

  it('an explicitRange filters to exactly that window, inclusive both ends', () => {
    const svc = [
      svcRow('2026-04-01', 200),  // outside range
      svcRow('2026-04-15', 100),  // inside
      svcRow('2026-04-30', 120),  // inside (end boundary)
      svcRow('2026-05-01', 300),  // outside
    ];
    const r = analyzePeaks(svc, [], LOC, 6, { s: '2026-04-15', e: '2026-04-30' });
    // Only the two in-range rows should count -- (100+120)/2 = 110, not polluted by the
    // 200/300 outliers outside the window.
    expect(r.lunch.oepe).toBeCloseTo(110, 2);
    expect(r.lunch.count).toBe(2);
  });

  it('an explicitRange with fewer than 3 matching rows does NOT fall back to "all data" (unlike the wb path)', () => {
    // Deliberately only 1 row in the explicit window -- the wb path's "need >=3 or use all"
    // relaxation must NOT kick in here; an explicit pick is intentional and should return
    // exactly what's in it, even if sparse.
    const svc = [
      svcRow('2026-01-01', 999),   // would pollute the average if the relaxation fired
      svcRow('2026-06-15', 50),
    ];
    const r = analyzePeaks(svc, [], LOC, 6, { s: '2026-06-01', e: '2026-06-30' });
    expect(r.lunch.oepe).toBeCloseTo(50, 2);
    expect(r.lunch.count).toBe(1);
  });

  it('an explicitRange with zero matching rows returns a real zero/empty slice, not the whole-history average', () => {
    const svc = [svcRow('2026-01-01', 999)];
    const r = analyzePeaks(svc, [], LOC, 6, { s: '2026-03-01', e: '2026-03-31' });
    expect(r.lunch.count).toBe(0);
    expect(r.lunch.oepe).toBe(0);
  });
});
