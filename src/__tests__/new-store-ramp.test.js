// @ts-nocheck
// dispatch 2026-10-14 (Lindsay 18213 -> 44689 relocation) -- comparable-store ramp blending.
// Synthetic fixtures throughout (not live Tishomingo/Ponce de Leon data) so this suite is
// deterministic and fast; the real comparables are named only in new-store-ramp.js's own header
// comment and in the caller that will eventually supply real laborRows.
import { describe, it, expect } from 'vitest';
import {
  firstTradingDay, rampSeriesFor, matureBaseline, rampShape, blendRampShapes, projectNewStoreSales,
  projectLaunchPlan, HOUR_SLOTS, DEEP_OVERNIGHT_SLOTS, hourlyShapeFor, blendHourlyShapes,
  splitDayAcrossHours, QTR_SLOTS, DEEP_OVERNIGHT_QTR_SLOTS, quarterHourShapeFor,
  blendQuarterHourShapes, splitDayAcrossQuarterHours, dowShapeFor,
} from '../engine/new-store-ramp.js';

function row(loc, date, sales) { return { loc, date, sales, gc: 1 }; }
function hrow(loc, date, hourSlot, sales) { return { loc, date, hourSlot, sales }; }
// Every real HOUR_SLOT gets hourSalesFn(hourSlot) of sales, identically for `numDays` consecutive
// days -- a flat synthetic fixture so each test's expected fraction is exact arithmetic, not a
// live-data approximation.
function mkHourlyRows(loc, numDays, hourSalesFn) {
  const rows = [];
  let d = new Date('2026-01-01');
  for (let i = 0; i < numDays; i++) {
    const date = d.toISOString().slice(0, 10);
    for (const hs of HOUR_SLOTS) rows.push(hrow(loc, date, hs, hourSalesFn(hs)));
    d = new Date(d.getTime() + 864e5);
  }
  return rows;
}

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

// New Store Launch Planner (2026-11-06) -- the calendar-mapping layer over projectNewStoreSales
// above. dayN math is untouched; this only tests that dayN maps to the right real date.
describe('projectLaunchPlan()', () => {
  const mkFlat = (loc, frac) => {
    const rows = [row(loc, '2026-01-01', frac * 1000)];
    let d = new Date('2026-01-01');
    for (let i = 0; i < 100; i++) { d = new Date(d.getTime() + 864e5); rows.push(row(loc, d.toISOString().slice(0, 10), 1000)); }
    return rows;
  };
  it('maps dayN to the real calendar date starting at openDate, dayN=0 on the open date itself', () => {
    const comparables = [{ loc: 'X', laborRows: mkFlat('X', 1.0), weight: 1 }];
    const plan = projectLaunchPlan({ loc: '44689', comparables, matureWeeklySales: 70000, openDate: '2026-11-14', maxDays: 5 });
    expect(plan.map(p => p.planDate)).toEqual(['2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18']);
    expect(plan[0]).toMatchObject({ loc: '44689', dayN: 0 });
    expect(plan[0].projectedSales).toBeGreaterThan(0);
  });
  it('correctly rolls the date across a month boundary', () => {
    const comparables = [{ loc: 'X', laborRows: mkFlat('X', 1.0), weight: 1 }];
    const plan = projectLaunchPlan({ loc: 'A', comparables, matureWeeklySales: 70000, openDate: '2026-11-29', maxDays: 4 });
    expect(plan.map(p => p.planDate)).toEqual(['2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02']);
  });
  it('returns an empty plan when loc or openDate is missing', () => {
    expect(projectLaunchPlan({ comparables: [], matureWeeklySales: 1000, openDate: '2026-11-14' })).toEqual([]);
    expect(projectLaunchPlan({ loc: 'A', comparables: [], matureWeeklySales: 1000 })).toEqual([]);
  });

  // Day-of-week overlay (2026-11-07 follow-on, dowShapeFor below) -- opt-in, applied only here
  // since only this layer maps dayN to a real calendar date.
  it('applies a supplied dowShape multiplicatively per real calendar weekday', () => {
    const comparables = [{ loc: 'X', laborRows: mkFlat('X', 1.0), weight: 1 }];
    const dowShape = [0, 1, 2, 3, 4, 5, 6].map((dow) => ({ dow, frac: dow === 5 ? 1.5 : 1 })); // Friday x1.5
    const plan = projectLaunchPlan({ loc: '44689', comparables, matureWeeklySales: 70000, openDate: '2026-11-14', maxDays: 7, dowShape });
    // mkFlat('X', 1.0) is flat at 1000/day throughout -> mature=1000 -> frac=1 every day ->
    // forecastSales=10000 (70000/7) before any dowShape adjustment. A 7-day window always
    // contains exactly one real Friday, whichever calendar date openDate happens to be.
    const fridayRow = plan.find((p) => new Date(p.planDate + 'T12:00:00Z').getUTCDay() === 5);
    const nonFridayRow = plan.find((p) => new Date(p.planDate + 'T12:00:00Z').getUTCDay() !== 5);
    expect(fridayRow.projectedSales).toBeCloseTo(15000, 2);
    expect(nonFridayRow.projectedSales).toBeCloseTo(10000, 2);
  });

  it('defaults to no day-of-week adjustment when dowShape is omitted (regression guard)', () => {
    const comparables = [{ loc: 'X', laborRows: mkFlat('X', 1.0), weight: 1 }];
    const withNullShape = projectLaunchPlan({ loc: '44689', comparables, matureWeeklySales: 70000, openDate: '2026-11-14', maxDays: 5, dowShape: null });
    const withNoShapeArg = projectLaunchPlan({ loc: '44689', comparables, matureWeeklySales: 70000, openDate: '2026-11-14', maxDays: 5 });
    expect(withNullShape).toEqual(withNoShapeArg);
  });
});

// Day-of-week shape (2026-11-07) -- a derived view over a PREDECESSOR store's real daily sales,
// not a ramp-shape comparable. See dowShapeFor's own header comment in new-store-ramp.js for why
// this is deliberately separate from forecast.js's private _dowShape.
describe('dowShapeFor()', () => {
  // Dates generated programmatically from a real day-of-week check (never hardcoded "this
  // calendar date is a Friday" literals), so the fixture can't silently drift if rebased.
  function rowsWithDowPattern(loc, numDays, dowSalesFn) {
    const rows = [];
    let d = new Date('2026-01-01T00:00:00Z');
    for (let i = 0; i < numDays; i++) {
      const date = d.toISOString().slice(0, 10);
      const dow = new Date(date + 'T12:00:00Z').getUTCDay();
      rows.push(row(loc, date, dowSalesFn(dow)));
      d = new Date(d.getTime() + 864e5);
    }
    return rows;
  }

  it('returns null when there is less than minDays of real data', () => {
    const rows = rowsWithDowPattern('X', 10, () => 100);
    expect(dowShapeFor(rows, 'X', 20)).toBeNull();
  });

  it('returns null when at least one weekday has zero real coverage', () => {
    // 6 consecutive days never completes a full week, so exactly one weekday is always missing.
    const rows = rowsWithDowPattern('X', 6, () => 100);
    expect(dowShapeFor(rows, 'X', 5)).toBeNull();
  });

  it('normalizes each weekday to a fraction of the all-weekday average, averaging to 1.0', () => {
    // 4 full weeks, Friday (dow=5) valued higher -- mirrors the real 18213 finding (Friday is
    // Lindsay's actual real peak day, not Saturday).
    const rows = rowsWithDowPattern('X', 28, (dow) => (dow === 5 ? 150 : 100));
    const shape = dowShapeFor(rows, 'X', 20);
    expect(shape).not.toBeNull();
    expect(shape).toHaveLength(7);
    expect(shape.find((d) => d.dow === 5).frac).toBeGreaterThan(1);
    expect(shape.filter((d) => d.dow !== 5).every((d) => d.frac < 1)).toBe(true);
    const avg = shape.reduce((s, d) => s + d.frac, 0) / 7;
    expect(avg).toBeCloseTo(1, 2);
  });

  it('ignores rows for a different loc', () => {
    const rows = rowsWithDowPattern('OTHER', 28, () => 100);
    expect(dowShapeFor(rows, 'X', 20)).toBeNull();
  });
});

// Launch Planner hourly breakdown (2026-11-06) -- a derived view over the same real hour_slot
// rows, not a new day-indexed ramp concept. Synthetic flat fixtures throughout, same reasoning
// as the day-level suite above: deterministic, exact-arithmetic expectations.
describe('hourlyShapeFor()', () => {
  it('returns null when there is not enough history to call it mature', () => {
    const rows = mkHourlyRows('A', 2, () => 100);
    expect(hourlyShapeFor(rows, 'A', 10)).toBe(null);
  });
  it('expresses each hour as a fraction of the day total, summing to ~1 across all 24 hours', () => {
    const rows = mkHourlyRows('A', 20, () => 100); // flat: every hour gets 100, every day
    const result = hourlyShapeFor(rows, 'A', 10);
    expect(result).toBeTruthy();
    expect(result.shape).toHaveLength(24);
    const sum = result.shape.reduce((a, p) => a + p.frac, 0);
    expect(sum).toBeCloseTo(1, 4);
    // Flat distribution -> every hour is an equal 1/24 share.
    expect(result.shape[0].frac).toBeCloseTo(1 / 24, 4);
  });
  it('flags nearlyClosedOvernight when the deep-overnight slots carry under 1% of real daily sales', () => {
    const rows = mkHourlyRows('A', 20, (hs) => (DEEP_OVERNIGHT_SLOTS.includes(hs) ? 0 : 100));
    const result = hourlyShapeFor(rows, 'A', 10);
    expect(result.overnightFrac).toBe(0);
    expect(result.nearlyClosedOvernight).toBe(true);
  });
  it('a genuinely 24-hour store (real overnight volume) is NOT flagged', () => {
    const rows = mkHourlyRows('A', 20, () => 100); // flat, including the overnight slots
    const result = hourlyShapeFor(rows, 'A', 10);
    expect(result.nearlyClosedOvernight).toBe(false);
  });
  it('an hour_slot with no rows at all (sparse/missing data) contributes 0, not NaN, and the shape still sums to ~1', () => {
    const rows = mkHourlyRows('A', 20, (hs) => (hs === '10:00' ? undefined : 100)).filter((r) => r.sales !== undefined);
    const result = hourlyShapeFor(rows, 'A', 10);
    expect(result).toBeTruthy();
    const missingHour = result.shape.find((p) => p.hourSlot === '10:00');
    expect(missingHour.frac).toBe(0);
    const sum = result.shape.reduce((a, p) => a + p.frac, 0);
    expect(sum).toBeCloseTo(1, 3);
  });
});

describe('blendHourlyShapes()', () => {
  it('weight-blends two comparables by hour_slot', () => {
    const flat = mkHourlyRows('X', 20, () => 100); // 1/24 per hour
    const closedOvernight = mkHourlyRows('Y', 20, (hs) => (DEEP_OVERNIGHT_SLOTS.includes(hs) ? 0 : 100));
    const comparables = [
      { loc: 'X', hourlyRows: flat, weight: 0.5 },
      { loc: 'Y', hourlyRows: closedOvernight, weight: 0.5 },
    ];
    const blended = blendHourlyShapes(comparables);
    expect(blended).toBeTruthy();
    // '06:00' (not deep-overnight) -- both comparables carry real volume there.
    const normalHour = blended.shape.find((p) => p.hourSlot === '06:00');
    expect(normalHour.frac).toBeGreaterThan(0);
    // '24:00' (deep-overnight) -- X contributes 1/24, Y contributes 0, blended at 0.5/0.5 weight.
    const overnightHour = blended.shape.find((p) => p.hourSlot === '24:00');
    expect(overnightHour.frac).toBeCloseTo(0.5 * (1 / 24), 3);
  });
  it('flags anyNearlyClosedOvernight true if even one blended comparable is near-closed overnight', () => {
    const flat = mkHourlyRows('X', 20, () => 100);
    const closedOvernight = mkHourlyRows('Y', 20, (hs) => (DEEP_OVERNIGHT_SLOTS.includes(hs) ? 0 : 100));
    const blended = blendHourlyShapes([
      { loc: 'X', hourlyRows: flat, weight: 0.7 },
      { loc: 'Y', hourlyRows: closedOvernight, weight: 0.3 },
    ]);
    expect(blended.anyNearlyClosedOvernight).toBe(true);
  });
  it('returns null when no comparable has enough history to produce a shape', () => {
    expect(blendHourlyShapes([{ loc: 'X', hourlyRows: mkHourlyRows('X', 2, () => 100), weight: 1 }])).toBe(null);
  });
});

describe('splitDayAcrossHours()', () => {
  it('splits a daily total proportionally by the blended shape, exactly to the cent', () => {
    const blended = { shape: HOUR_SLOTS.map((h) => ({ hourSlot: h, frac: 1 / 24 })) };
    const out = splitDayAcrossHours(1200, blended);
    expect(out).toHaveLength(24);
    const sum = out.reduce((a, p) => a + p.sales, 0);
    expect(sum).toBeCloseTo(1200, 2);
    expect(out[0].sales).toBeCloseTo(50, 2);
  });
  it('the last slot absorbs any rounding remainder so the total stays accurate to the cent', () => {
    const blended = { shape: HOUR_SLOTS.map((h) => ({ hourSlot: h, frac: 1 / 24 })) };
    const out = splitDayAcrossHours(1000, blended); // 1000/24 does not divide evenly to the cent
    const sum = out.reduce((a, p) => a + p.sales, 0);
    // Summing 24 independently-rounded floats re-introduces a sub-cent float residue even though
    // the LAST slot was computed as an exact subtraction from the running total -- toBeCloseTo,
    // not toBe, is the correct bar here (same convention the sibling test above already uses).
    expect(sum).toBeCloseTo(1000, 2);
  });
  it('returns an empty array when there is no blend or no total', () => {
    expect(splitDayAcrossHours(0, { shape: [] })).toEqual([]);
    expect(splitDayAcrossHours(1000, null)).toEqual([]);
  });
});

// Launch Planner 15-min breakdown (2026-11-07) -- same derived-view approach, one level finer,
// against the real qsr_sales_quarter_hour table (built for the separate "Record Hour" feature;
// the 2026-11-06 hourly build missed it and wrongly concluded no quarter-hour data existed).
// Mirrors the hourlyShapeFor/blendHourlyShapes/splitDayAcrossHours suites above exactly.
function qrow(loc, date, qtrSlot, sales) { return { loc, date, qtrSlot, sales }; }
function mkQtrRows(loc, numDays, qtrSalesFn) {
  const rows = [];
  let d = new Date('2026-01-01');
  for (let i = 0; i < numDays; i++) {
    const date = d.toISOString().slice(0, 10);
    for (const qs of QTR_SLOTS) rows.push(qrow(loc, date, qs, qtrSalesFn(qs)));
    d = new Date(d.getTime() + 864e5);
  }
  return rows;
}

describe('QTR_SLOTS', () => {
  it('is exactly 96 real 15-minute slots, 04:15 through 28:00', () => {
    expect(QTR_SLOTS).toHaveLength(96);
    expect(QTR_SLOTS[0]).toBe('04:15');
    expect(QTR_SLOTS[QTR_SLOTS.length - 1]).toBe('28:00');
  });
});

describe('DEEP_OVERNIGHT_QTR_SLOTS', () => {
  it('is the 4 quarter-hour slots composing each of the 6 DEEP_OVERNIGHT_SLOTS hour buckets', () => {
    expect(DEEP_OVERNIGHT_QTR_SLOTS).toHaveLength(DEEP_OVERNIGHT_SLOTS.length * 4);
    // The '05:00' hour bucket (4am-5am) is composed of these 4 real 15-min slots.
    expect(DEEP_OVERNIGHT_QTR_SLOTS).toEqual(expect.arrayContaining(['04:15', '04:30', '04:45', '05:00']));
  });
});

describe('quarterHourShapeFor()', () => {
  it('returns null when there is not enough history to call it mature', () => {
    const rows = mkQtrRows('A', 2, () => 25);
    expect(quarterHourShapeFor(rows, 'A', 10)).toBe(null);
  });
  it('expresses each 15-min slot as a fraction of the day total, summing to ~1 across all 96 slots', () => {
    const rows = mkQtrRows('A', 20, () => 25); // flat: every slot gets 25, every day
    const result = quarterHourShapeFor(rows, 'A', 10);
    expect(result).toBeTruthy();
    expect(result.shape).toHaveLength(96);
    const sum = result.shape.reduce((a, p) => a + p.frac, 0);
    expect(sum).toBeCloseTo(1, 4);
    expect(result.shape[0].frac).toBeCloseTo(1 / 96, 4);
  });
  it('flags nearlyClosedOvernight when the deep-overnight slots carry under 1% of real daily sales', () => {
    const rows = mkQtrRows('A', 20, (qs) => (DEEP_OVERNIGHT_QTR_SLOTS.includes(qs) ? 0 : 25));
    const result = quarterHourShapeFor(rows, 'A', 10);
    expect(result.overnightFrac).toBe(0);
    expect(result.nearlyClosedOvernight).toBe(true);
  });
  it('a genuinely 24-hour store (real overnight volume) is NOT flagged', () => {
    const rows = mkQtrRows('A', 20, () => 25); // flat, including the overnight slots
    const result = quarterHourShapeFor(rows, 'A', 10);
    expect(result.nearlyClosedOvernight).toBe(false);
  });
});

describe('blendQuarterHourShapes()', () => {
  it('weight-blends two comparables by qtr_slot', () => {
    const flat = mkQtrRows('X', 20, () => 25); // 1/96 per slot
    const closedOvernight = mkQtrRows('Y', 20, (qs) => (DEEP_OVERNIGHT_QTR_SLOTS.includes(qs) ? 0 : 25));
    const blended = blendQuarterHourShapes([
      { loc: 'X', qtrHourRows: flat, weight: 0.5 },
      { loc: 'Y', qtrHourRows: closedOvernight, weight: 0.5 },
    ]);
    expect(blended).toBeTruthy();
    const normalSlot = blended.shape.find((p) => p.qtrSlot === '06:00');
    expect(normalSlot.frac).toBeGreaterThan(0);
    const overnightSlot = blended.shape.find((p) => p.qtrSlot === '24:00');
    expect(overnightSlot.frac).toBeCloseTo(0.5 * (1 / 96), 3);
  });
  it('flags anyNearlyClosedOvernight true if even one blended comparable is near-closed overnight', () => {
    const flat = mkQtrRows('X', 20, () => 25);
    const closedOvernight = mkQtrRows('Y', 20, (qs) => (DEEP_OVERNIGHT_QTR_SLOTS.includes(qs) ? 0 : 25));
    const blended = blendQuarterHourShapes([
      { loc: 'X', qtrHourRows: flat, weight: 0.7 },
      { loc: 'Y', qtrHourRows: closedOvernight, weight: 0.3 },
    ]);
    expect(blended.anyNearlyClosedOvernight).toBe(true);
  });
  it('returns null when no comparable has enough history to produce a shape', () => {
    expect(blendQuarterHourShapes([{ loc: 'X', qtrHourRows: mkQtrRows('X', 2, () => 25), weight: 1 }])).toBe(null);
  });
});

describe('splitDayAcrossQuarterHours()', () => {
  it('splits a daily total proportionally by the blended shape, exactly to the cent', () => {
    const blended = { shape: QTR_SLOTS.map((qs) => ({ qtrSlot: qs, frac: 1 / 96 })) };
    const out = splitDayAcrossQuarterHours(960, blended);
    expect(out).toHaveLength(96);
    const sum = out.reduce((a, p) => a + p.sales, 0);
    expect(sum).toBeCloseTo(960, 2);
    expect(out[0].sales).toBeCloseTo(10, 2);
  });
  it('the last slot absorbs any rounding remainder so the total stays accurate to the cent', () => {
    const blended = { shape: QTR_SLOTS.map((qs) => ({ qtrSlot: qs, frac: 1 / 96 })) };
    const out = splitDayAcrossQuarterHours(1000, blended);
    const sum = out.reduce((a, p) => a + p.sales, 0);
    expect(sum).toBeCloseTo(1000, 2);
  });
  it('returns an empty array when there is no blend or no total', () => {
    expect(splitDayAcrossQuarterHours(0, { shape: [] })).toEqual([]);
    expect(splitDayAcrossQuarterHours(1000, null)).toEqual([]);
  });
});
