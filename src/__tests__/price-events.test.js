import { describe, it, expect } from 'vitest';
import {
  detectPriceSteps, priceChangeEvents, lastPriceChangeByStore, priceDailySeries,
  FLAT_WINDOW_DAYS,
} from '../engine/price-events.js';

const N_ITEMS = 3; // arbitrary small item count for the grouping tests below

// Build N consecutive daily rows for one (loc,item) at a given price, starting at `start`.
function days(loc, item, price, start, n) {
  const out = [];
  const d0 = new Date(start + 'T00:00:00Z');
  for (let i = 0; i < n; i++) {
    const d = new Date(d0.getTime() + i * 86400000);
    out.push({ loc, item, price, date: d.toISOString().slice(0, 10) });
  }
  return out;
}

describe('detectPriceSteps', () => {
  it('confirms a change flat >=14 days before and >=14 days after', () => {
    const rows = [
      ...days('1001', 1, 2.79, '2026-01-01', 14),
      ...days('1001', 1, 2.99, '2026-01-15', 14),
    ];
    const steps = detectPriceSteps(rows);
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ loc: '1001', item: '1', date: '2026-01-15', oldPrice: 2.79, newPrice: 2.99 });
    expect(steps[0].stepPct).toBeCloseTo((2.99 - 2.79) / 2.79 * 100, 5);
  });

  it('rejects a change with fewer than 14 days flat BEFORE', () => {
    const rows = [
      ...days('1001', 1, 2.79, '2026-01-01', 10), // only 10 days before
      ...days('1001', 1, 2.99, '2026-01-11', 20),
    ];
    expect(detectPriceSteps(rows)).toHaveLength(0);
  });

  it('rejects a change with fewer than 14 days flat AFTER (recent, not yet confirmed)', () => {
    const rows = [
      ...days('1001', 1, 2.79, '2026-01-01', 20),
      ...days('1001', 1, 2.99, '2026-01-21', 5), // only 5 days after -- too soon to confirm
    ];
    expect(detectPriceSteps(rows)).toHaveLength(0);
  });

  it('ignores a 1-2 day promo blip inside an otherwise flat run (the naive-method failure mode)', () => {
    const rows = [
      ...days('1001', 1, 2.79, '2026-01-01', 20),
      { loc: '1001', item: '1', price: 2.39, date: '2026-01-21' }, // single promo day
      ...days('1001', 1, 2.79, '2026-01-22', 20), // reverts
    ];
    // The blip run (1 day) never reaches 14, so it's never a confirmed "before" or "after"
    // plateau -- no false-positive change is reported.
    expect(detectPriceSteps(rows)).toHaveLength(0);
  });

  it('takes MAX(price) per day as the base menu price when multiple price rows exist (promo tiers)', () => {
    // Same day carries both a menu-price row and a lower promo-price row -- matches the
    // real qsr_product_mix shape (49/283 items at one store on one sample day had >1 row).
    const menuBefore = days('1001', 1, 2.79, '2026-01-01', 14).map(r => ({ ...r }));
    const promoBefore = days('1001', 1, 2.39, '2026-01-01', 14).map(r => ({ ...r })); // lower tier, same days
    const menuAfter = days('1001', 1, 2.99, '2026-01-15', 14);
    const steps = detectPriceSteps([...menuBefore, ...promoBefore, ...menuAfter]);
    expect(steps).toHaveLength(1);
    expect(steps[0].oldPrice).toBe(2.79); // the MAX, not the promo-diluted lower price
  });

  it('detects a second step after the first, resuming the scan correctly', () => {
    const rows = [
      ...days('1001', 1, 2.79, '2026-01-01', 14),
      ...days('1001', 1, 2.99, '2026-01-15', 14),
      ...days('1001', 1, 3.19, '2026-01-29', 14),
    ];
    const steps = detectPriceSteps(rows);
    expect(steps).toHaveLength(2);
    expect(steps[0]).toMatchObject({ date: '2026-01-15', oldPrice: 2.79, newPrice: 2.99 });
    expect(steps[1]).toMatchObject({ date: '2026-01-29', oldPrice: 2.99, newPrice: 3.19 });
  });

  it('handles multiple independent (loc,item) series without cross-contamination', () => {
    const rows = [
      ...days('1001', 1, 2.79, '2026-01-01', 14),
      ...days('1001', 1, 2.99, '2026-01-15', 14),
      ...days('1002', 1, 5.00, '2026-01-01', 30), // different store, no change
    ];
    const steps = detectPriceSteps(rows);
    expect(steps).toHaveLength(1);
    expect(steps[0].loc).toBe('1001');
  });

  it('unpads loc -- qsr_product_mix.loc is zero-padded to 7 ("0013113"), every consumer this ' +
     'engine feeds (ds.laborRows, store.loc, userEvents) keys unpadded ("13113")', () => {
    const rows = [
      ...days('0013113', 1, 2.79, '2026-01-01', 14),
      ...days('0013113', 1, 2.99, '2026-01-15', 14),
    ];
    const steps = detectPriceSteps(rows);
    expect(steps).toHaveLength(1);
    expect(steps[0].loc).toBe('13113'); // NOT '0013113'
  });

  it('respects a custom flatWindow option', () => {
    const rows = [
      ...days('1001', 1, 2.79, '2026-01-01', 7),
      ...days('1001', 1, 2.99, '2026-01-08', 7),
    ];
    expect(detectPriceSteps(rows)).toHaveLength(0); // default 14-day window rejects
    expect(detectPriceSteps(rows, { flatWindow: 7 })).toHaveLength(1); // 7-day window accepts
  });
});

describe('priceChangeEvents', () => {
  it('groups confirmed steps into a district-round EVENT when several items move on one date', () => {
    const rows = [];
    for (let item = 1; item <= N_ITEMS; item++) {
      rows.push(...days('1001', item, 2.79, '2026-01-01', 14));
      rows.push(...days('1001', item, 2.99, '2026-01-15', 14));
    }
    const events = priceChangeEvents(rows);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ loc: '1001', date: '2026-01-15', itemsChanged: N_ITEMS });
    expect(events[0].meanStepPct).toBeCloseTo((2.99 - 2.79) / 2.79 * 100, 5);
  });

  it('reports an event even when only ONE item changes -- no minimum-items floor', () => {
    // An earlier version gated events at >=8 items; verified WRONG against real production
    // data (see price-events.js's own comment on priceChangeEvents) -- it silently dropped
    // 4 real stores from the known 2026-06-13/06-26 district rounds whose confirmed change
    // only touched 5-7 items. A single confirmed (14/14-flat-validated) step is real signal.
    const rows = [
      ...days('1001', 1, 2.79, '2026-01-01', 14),
      ...days('1001', 1, 2.99, '2026-01-15', 14),
    ];
    const events = priceChangeEvents(rows);
    expect(events).toHaveLength(1);
    expect(events[0].itemsChanged).toBe(1);
  });

  it('separates two stores repricing on DIFFERENT dates into two events (the wave-1/wave-2 split)', () => {
    const rows = [];
    for (let item = 1; item <= N_ITEMS; item++) {
      rows.push(...days('1001', item, 2.79, '2026-06-01', 14));   // Jun 1-14
      rows.push(...days('1001', item, 2.99, '2026-06-15', 30));   // wave 1: Jun 15
      rows.push(...days('1002', item, 2.79, '2026-06-01', 27));   // Jun 1-27
      rows.push(...days('1002', item, 2.99, '2026-06-28', 14));   // wave 2: Jun 28
    }
    const events = priceChangeEvents(rows);
    expect(events).toHaveLength(2);
    const byLoc = Object.fromEntries(events.map(e => [e.loc, e]));
    expect(byLoc['1001'].date).toBe('2026-06-15');
    expect(byLoc['1002'].date).toBe('2026-06-28');
  });
});

describe('lastPriceChangeByStore', () => {
  it('returns only the MOST RECENT confirmed event per store', () => {
    const rows = [];
    for (let item = 1; item <= N_ITEMS; item++) {
      rows.push(...days('1001', item, 2.79, '2026-01-01', 14));
      rows.push(...days('1001', item, 2.99, '2026-01-15', 14));
      rows.push(...days('1001', item, 3.19, '2026-01-29', 14));
    }
    const out = lastPriceChangeByStore(rows);
    expect(out['1001'].date).toBe('2026-01-29'); // the LATER of the two events, not the first
    expect(out['1001'].itemsChanged).toBe(N_ITEMS);
  });

  it('is empty for a store with no confirmed event', () => {
    const rows = days('1001', 1, 2.79, '2026-01-01', 60); // flat the whole time
    expect(lastPriceChangeByStore(rows)).toEqual({});
  });
});

describe('priceDailySeries', () => {
  it('produces a continuous daysSinceChange ramp, and itemsChanged/meanStepPct only on the event day', () => {
    const rows = [];
    for (let item = 1; item <= N_ITEMS; item++) {
      rows.push(...days('1001', item, 2.79, '2026-01-01', 14));
      rows.push(...days('1001', item, 2.99, '2026-01-15', 20));
    }
    const series = priceDailySeries(rows);
    const byDate = Object.fromEntries(series.map(r => [r.date, r]));

    // Before the change: no event has happened yet -- daysSinceChange is null.
    expect(byDate['2026-01-05'].daysSinceChange).toBeNull();
    expect(byDate['2026-01-05'].itemsChanged).toBe(0);

    // On the event day itself.
    expect(byDate['2026-01-15'].daysSinceChange).toBe(0);
    expect(byDate['2026-01-15'].itemsChanged).toBe(N_ITEMS);
    expect(byDate['2026-01-15'].meanStepPct).toBeCloseTo((2.99 - 2.79) / 2.79 * 100, 5);

    // 10 days after the change -- ramp continues, no new item-change that day.
    expect(byDate['2026-01-25'].daysSinceChange).toBe(10);
    expect(byDate['2026-01-25'].itemsChanged).toBe(0);
  });

  it('covers every day present in the input, not just event days', () => {
    const rows = days('1001', 1, 5.00, '2026-01-01', 30); // no change at all
    const series = priceDailySeries(rows);
    expect(series).toHaveLength(30);
    expect(series.every(r => r.daysSinceChange === null)).toBe(true);
  });
});
