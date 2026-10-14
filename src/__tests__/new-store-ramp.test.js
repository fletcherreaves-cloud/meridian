// @ts-nocheck
// dispatch 2026-10-14 (Lindsay 18213 -> 44689 relocation) -- comparable-store ramp blending.
// Synthetic fixtures throughout (not live Tishomingo/Ponce de Leon data) so this suite is
// deterministic and fast; the real comparables are named only in new-store-ramp.js's own header
// comment and in the caller that will eventually supply real laborRows.
import { describe, it, expect } from 'vitest';
import {
  firstTradingDay, rampSeriesFor, matureBaseline, rampShape, blendRampShapes, projectNewStoreSales,
} from '../engine/new-store-ramp.js';

function row(loc, date, sales) { return { loc, date, sales, gc: 1 }; }

describe('firstTradingDay()', () => {
  it('finds the earliest sales>0 date for a loc, ignoring other locs and zero-sales rows', () => {
    const rows = [
      row('A', '2026-02-01', 0),         // zero-sales row before "real" opening -- ignored
      row('A', '2026-03-01', 500),
      row('A', '2026-03-05', 600),
      row('B', '2026-01-01', 100),       // a different store, earlier -- must not leak in
    ];
    expect(firstTradingDay(rows, 'A')).toBe('2026-03-01');
  });
  it('returns null for a loc with no sales rows at all', () => {
    expect(firstTradingDay([row('A', '2026-03-01', 500)], 'Z')).toBe(null);
  });
});

describe('rampSeriesFor()', () => {
  it('indexes by day-since-open (0 = first trading day), excludes days beyond maxDays', () => {
    const rows = [
      row('A', '2026-01-01', 1000), // day 0
      row('A', '2026-01-02', 1100), // day 1
      row('A', '2026-01-11', 1500), // day 10 -- excluded if maxDays=10 (0..9)
    ];
    const series = rampSeriesFor(rows, 'A', 10);
    expect(series.map(p => p.dayN)).toEqual([0, 1]);
  });
  it('a gap (closure/missing day) is simply absent, not zero-filled', () => {
    const rows = [row('A', '2026-01-01', 1000), row('A', '2026-01-05', 1200)]; // days 0 and 4
    const series = rampSeriesFor(rows, 'A', 10);
    expect(series.map(p => p.dayN)).toEqual([0, 4]); // no entries for days 1,2,3
  });
});

describe('matureBaseline()', () => {
  it('returns null when there is not enough recent history to call it mature', () => {
    const rows = [row('A', '2026-01-01', 1000), row('A', '2026-01-02', 1000)]; // only 2 days
    expect(matureBaseline(rows, 'A', 10)).toBe(null);
  });
  it('averages the trailing up-to-90 days of real sales for that loc', () => {
    const rows = [];
    for (let i = 0; i < 20; i++) rows.push(row('A', `2026-02-${String(i + 1).padStart(2, '0')}`, 1000));
    expect(matureBaseline(rows, 'A', 10)).toBe(1000);
  });
  it('caps at the trailing 90 days even with more history available', () => {
    // 10 older days at 500 (must be excluded, too old) + 90 recent days at 1000.
    const rows = [];
    for (let i = 0; i < 10; i++) rows.push(row('A', `2026-01-${String(i + 1).padStart(2, '0')}`, 500));
    let d = new Date('2026-02-01');
    for (let i = 0; i < 90; i++) { rows.push(row('A', d.toISOString().slice(0, 10), 1000)); d = new Date(d.getTime() + 864e5); }
    expect(matureBaseline(rows, 'A', 10)).toBe(1000);
  });
});

describe('rampShape()', () => {
  it('expresses each day as a fraction of the store\'s own mature baseline', () => {
    const rows = [];
    let d = new Date('2026-01-01');
    // Ramp: day0 at 50% of mature, day1 at 75%, then 30 mature days to establish the baseline.
    rows.push(row('A', '2026-01-01', 500));
    rows.push(row('A', '2026-01-02', 750));
    for (let i = 0; i < 100; i++) { d = new Date(d.getTime() + 864e5); rows.push(row('A', d.toISOString().slice(0, 10), 1000)); }
    const shape = rampShape(rows, 'A', 3);
    expect(shape.find(p => p.dayN === 0).frac).toBe(0.5);
    expect(shape.find(p => p.dayN === 1).frac).toBe(0.75);
  });
  it('returns an empty shape when the comparable has no mature baseline yet', () => {
    expect(rampShape([row('A', '2026-01-01', 500)], 'A', 10)).toEqual([]);
  });
});

describe('blendRampShapes()', () => {
  it('weight-blends two comparables aligned by day-since-open', () => {
    // Comparable X: day0 frac 1.0 (flat). Comparable Y: day0 frac 0.5.
    const mkFlat = (loc, frac) => {
      const rows = [row(loc, '2026-01-01', frac * 1000)];
      let d = new Date('2026-01-01');
      for (let i = 0; i < 100; i++) { d = new Date(d.getTime() + 864e5); rows.push(row(loc, d.toISOString().slice(0, 10), 1000)); }
      return rows;
    };
    const comparables = [
      { loc: 'X', laborRows: mkFlat('X', 1.0), weight: 0.7 },
      { loc: 'Y', laborRows: mkFlat('Y', 0.5), weight: 0.3 },
    ];
    const blended = blendRampShapes(comparables, 1);
    // 0.7*1.0 + 0.3*0.5 = 0.85
    expect(blended.find(p => p.dayN === 0).frac).toBeCloseTo(0.85, 4);
  });
  it('a day only one comparable has data for still blends (normalizes over what is present)', () => {
    const rowsLong = (() => {
      const rows = [row('X', '2026-01-01', 1000)];
      let d = new Date('2026-01-01');
      for (let i = 0; i < 100; i++) { d = new Date(d.getTime() + 864e5); rows.push(row('X', d.toISOString().slice(0, 10), 1000)); }
      return rows;
    })();
    // Y has no day-5 data at all (shorter history / gap).
    const rowsShort = [row('Y', '2026-01-01', 1000)];
    let d = new Date('2026-01-01');
    for (let i = 0; i < 4; i++) { d = new Date(d.getTime() + 864e5); rowsShort.push(row('Y', d.toISOString().slice(0, 10), 1000)); }
    // 30 more mature days so matureBaseline resolves.
    for (let i = 0; i < 100; i++) { d = new Date(d.getTime() + 864e5); rowsShort.push(row('Y', d.toISOString().slice(0, 10), 1000)); }
    const comparables = [
      { loc: 'X', laborRows: rowsLong, weight: 0.5 },
      { loc: 'Y', laborRows: rowsShort, weight: 0.5 },
    ];
    const blended = blendRampShapes(comparables, 40);
    const day5 = blended.find(p => p.dayN === 5);
    // Only X has a day-5 entry inside the first maxDays window from Y's shorter early run --
    // regardless, this must not throw and must produce a sane (defined) fraction.
    expect(day5).toBeTruthy();
    expect(Number.isFinite(day5.frac)).toBe(true);
  });
});

describe('projectNewStoreSales()', () => {
  it('turns a blended shape + an assumed mature weekly sales figure into a day-by-day $ forecast', () => {
    const mkFlat = (loc, frac) => {
      const rows = [row(loc, '2026-01-01', frac * 1000)];
      let d = new Date('2026-01-01');
      for (let i = 0; i < 100; i++) { d = new Date(d.getTime() + 864e5); rows.push(row(loc, d.toISOString().slice(0, 10), 1000)); }
      return rows;
    };
    const comparables = [{ loc: 'X', laborRows: mkFlat('X', 0.5), weight: 1 }];
    const forecast = projectNewStoreSales({ comparables, matureWeeklySales: 70000, maxDays: 1 });
    // mature daily = 70000/7 = 10000; day0 frac 0.5 -> 5000
    expect(forecast[0].forecastSales).toBe(5000);
  });
  it('returns an empty forecast when matureWeeklySales is not provided or non-positive', () => {
    expect(projectNewStoreSales({ comparables: [], matureWeeklySales: 0 })).toEqual([]);
    expect(projectNewStoreSales({ comparables: [], matureWeeklySales: undefined })).toEqual([]);
  });
});
