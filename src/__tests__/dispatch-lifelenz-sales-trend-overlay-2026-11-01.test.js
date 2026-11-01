// @ts-nocheck
// Owner req (2026-11-01), from a screenshot of the Store Dashboard "Sales Trend" chart
// (Tishomingo-Main & Refuge, Actual/AI Forecast/Goal/LY Sales): "Can we add/overlay LifeLens
// forecasts to this chart as well?" (LifeLenz, the labor-scheduling system's own sales forecast).
//
// Sourced from ds.schedRows — already loaded app-wide by App.js's loadLifeLenzSchedule(), no new
// fetch. Same loc+date matching convention as lifelenz.js's computeLifeLenzAdjustment/runAccuracy
// (String(loc) + dKey(date), preferring adjFcstSales over fcstSales). That panel's own "Accuracy"
// mode already treats ds.schedRows as the reference LifeLenz number for PAST dates too, not the
// lead-time-matched lifelenz_forecast_captures table (no UI consumer yet per
// memory/finding-live-projections-lifelenz-2026-09-14.md) — so this overlay follows the one
// existing precedent rather than inventing a second convention.
import { describe, it, expect } from 'vitest';
import { lifeLenzSeries } from '../views/store-dash.js';

function day(dateStr, { isFuture = false } = {}) {
  return { date: new Date(dateStr + 'T12:00:00'), isFuture };
}

describe('lifeLenzSeries', () => {
  it('returns null when there are no schedRows', () => {
    expect(lifeLenzSeries([day('2026-10-20')], [], '3708')).toBeNull();
    expect(lifeLenzSeries([day('2026-10-20')], null, '3708')).toBeNull();
  });

  it('returns null when loc is missing', () => {
    const sched = [{ loc: '3708', date: new Date('2026-10-20T12:00:00'), fcstSales: 9000 }];
    expect(lifeLenzSeries([day('2026-10-20')], sched, null)).toBeNull();
  });

  it('matches rows by loc + calendar date and reads fcstSales', () => {
    const sched = [
      { loc: '3708', date: new Date('2026-10-20T12:00:00'), fcstSales: 9123.4 },
      { loc: '5183', date: new Date('2026-10-20T12:00:00'), fcstSales: 1 }, // different store — must not match
    ];
    const rows = [day('2026-10-20'), day('2026-10-21')];
    const out = lifeLenzSeries(rows, sched, '3708');
    expect(out.data).toEqual([9123, null]);
  });

  it('prefers adjFcstSales over fcstSales when both are present', () => {
    const sched = [{ loc: '3708', date: new Date('2026-10-20T12:00:00'), fcstSales: 9000, adjFcstSales: 9500 }];
    const out = lifeLenzSeries([day('2026-10-20')], sched, '3708');
    expect(out.data).toEqual([9500]);
  });

  it('falls back to fcstSales when adjFcstSales is zero/absent', () => {
    const sched = [{ loc: '3708', date: new Date('2026-10-20T12:00:00'), fcstSales: 8800, adjFcstSales: 0 }];
    const out = lifeLenzSeries([day('2026-10-20')], sched, '3708');
    expect(out.data).toEqual([8800]);
  });

  it('matches loc as a loose string (zero-padded vs unpadded)', () => {
    const sched = [{ loc: '3708', date: new Date('2026-10-20T12:00:00'), fcstSales: 7000 }];
    const out = lifeLenzSeries([day('2026-10-20')], sched, 3708);
    expect(out.data).toEqual([7000]);
  });

  it('returns null when no row has a usable positive forecast value for this loc', () => {
    const sched = [{ loc: '3708', date: new Date('2026-10-20T12:00:00'), fcstSales: 0 }];
    expect(lifeLenzSeries([day('2026-10-20')], sched, '3708')).toBeNull();
  });

  it('sets anyPast=true only when a matched day is NOT isFuture (the leak caveat trigger)', () => {
    const sched = [
      { loc: '3708', date: new Date('2026-10-20T12:00:00'), fcstSales: 9000 },
      { loc: '3708', date: new Date('2026-11-05T12:00:00'), fcstSales: 9500 },
    ];
    const pastOnly = lifeLenzSeries([day('2026-10-20', { isFuture: false })], sched, '3708');
    expect(pastOnly.anyPast).toBe(true);

    const futureOnly = lifeLenzSeries([day('2026-11-05', { isFuture: true })], sched, '3708');
    expect(futureOnly.anyPast).toBe(false);
  });
});
