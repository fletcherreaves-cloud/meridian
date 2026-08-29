import { describe, it, expect } from 'vitest';
import { computeItemMargins } from '../engine/pricing-engine.js';

// Synthetic qsr_product_mix-shaped fixtures — raw DB column names (desc_, sold_qty,
// unit_food_cost, unit_paper_cost), per the dispatch. loc left unpadded here (single
// digits) since normLoc()-normalization is exercised separately below.
function row(over) {
  return { loc: '1001', date: '2026-08-15', item: 1, price: 2.99, desc_: 'Item', sold_qty: 10,
    unit_food_cost: 0.5, unit_paper_cost: 0.05, ...over };
}

describe('computeItemMargins — trap 1: promo contamination (MAX, never AVG)', () => {
  it('resolves real menu price as MAX(price) same-day, not AVG', () => {
    const rows = [
      row({ item: 5, price: 6.79, sold_qty: 1, desc_: 'Big Mac' }), // real menu price
      row({ item: 5, price: 5.59, sold_qty: 4, desc_: 'Big Mac' }), // promo tier, below menu
    ];
    const out = computeItemMargins(rows);
    expect(out).toHaveLength(1);
    expect(out[0].menuPrice).toBe(6.79); // MAX, not AVG (6.19) and not sum$/units (5.59.2)
    expect(out[0].volume).toBe(5); // promo-tier units still count toward volume
  });

  it('does not let a low-volume promo-price row leak in as the real menu price', () => {
    // Promo row sold far MORE units than the real-menu-price row — AVG or a
    // volume-weighted price would be dragged toward the promo price. MAX must not be.
    const rows = [
      row({ item: 9, price: 4.5, sold_qty: 100, desc_: 'Fries' }), // heavy promo day
      row({ item: 9, price: 2.5, sold_qty: 2, desc_: 'Fries' }),
    ];
    const out = computeItemMargins(rows);
    expect(out[0].menuPrice).toBe(4.5);
  });
});

describe('computeItemMargins — trap 2: wrap-combo unit halving', () => {
  it('doubles volume/totalContrib for a "2 <wrap> ..." bundle item', () => {
    const rows = [
      row({ item: 25269, price: 7.2, sold_qty: 2, desc_: '2 Ranch Snk Wrap Ml',
        unit_food_cost: 1.833, unit_paper_cost: 0.0661 }),
    ];
    const out = computeItemMargins(rows);
    expect(out).toHaveLength(1);
    const it0 = out[0];
    expect(it0.volume).toBe(4); // 2 sold_qty x2 multiplier -- true single-wrap count
    const expectedMargin = 7.2 - 1.833 - 0.0661;
    expect(it0.marginDollars).toBeCloseTo(expectedMargin, 6);
    expect(it0.totalContrib).toBeCloseTo(expectedMargin * 4, 6);
  });

  it('does NOT double a plain single Snack Wrap (no leading count)', () => {
    const rows = [row({ item: 25254, price: 2.99, sold_qty: 11, desc_: 'Ranch Snack Wrap',
      unit_food_cost: 0.743, unit_paper_cost: 0.0186 })];
    const out = computeItemMargins(rows);
    expect(out[0].volume).toBe(11);
  });

  it('does NOT double unrelated leading-count items (piece/pack counts, not the wrap bug)', () => {
    // Live-confirmed false-positive trap: "6 McNuggets" etc. are piece counts, a
    // completely different naming convention from the wrap-halving bug, and must be
    // left alone -- a naive "starts with a digit" regex would wrongly double these.
    const rows = [
      row({ item: 60, price: 3.29, sold_qty: 14, desc_: '6 McNuggets', unit_food_cost: 0.5528, unit_paper_cost: 0.0461 }),
      row({ item: 582, price: 5.29, sold_qty: 7, desc_: '2 Biscuits & Gravy', unit_food_cost: 1.2347, unit_paper_cost: 0.2523 }),
      row({ item: 8950, price: 6.1, sold_qty: 22, desc_: '2 Chsburger Meal', unit_food_cost: 1.7354, unit_paper_cost: 0.059 }),
    ];
    const out = computeItemMargins(rows);
    const byItem = Object.fromEntries(out.map(r => [r.itemNumber, r]));
    expect(byItem[60].volume).toBe(14);
    expect(byItem[582].volume).toBe(7);
    expect(byItem[8950].volume).toBe(22);
  });
});

describe('computeItemMargins — trap 3: combo vs. component double-counting', () => {
  it('keeps a combo SKU and its à la carte component as two separate rows, never summed', () => {
    const rows = [
      row({ item: 5, price: 6.79, sold_qty: 4, desc_: 'Big Mac', unit_food_cost: 1.3605, unit_paper_cost: 0.0737 }),
      row({ item: 8936, price: 6.51, sold_qty: 23, desc_: 'Big Mac Meal', unit_food_cost: 1.7075, unit_paper_cost: 0.1025 }),
    ];
    const out = computeItemMargins(rows);
    expect(out).toHaveLength(2);
    const sandwich = out.find(r => r.itemNumber === 5);
    const meal = out.find(r => r.itemNumber === 8936);
    expect(sandwich).toBeTruthy();
    expect(meal).toBeTruthy();
    // Each keeps its OWN price/cost/volume -- neither is folded into the other despite
    // sharing the "Big Mac" name.
    expect(sandwich.menuPrice).toBe(6.79);
    expect(sandwich.volume).toBe(4);
    expect(meal.menuPrice).toBe(6.51);
    expect(meal.volume).toBe(23);
    // Total contribution is NOT double-counted -- the meal's cost is its own combo cost,
    // not sandwich cost + meal cost.
    expect(meal.foodCost).toBeCloseTo(1.7075, 6);
  });

  it('never groups by description even when two different item_numbers share one', () => {
    const rows = [
      row({ item: 1, price: 1.99, sold_qty: 5, desc_: 'Hamburger' }),
      row({ item: 1001, price: 4.5, sold_qty: 3, desc_: 'Hamburger' }), // bundle-component variant, same display name
    ];
    const out = computeItemMargins(rows);
    expect(out).toHaveLength(2);
    expect(new Set(out.map(r => r.itemNumber))).toEqual(new Set([1, 1001]));
  });
});

describe('computeItemMargins — trap 4: low-volume noise does not corrupt marginPct', () => {
  it('marginPct stays correct at volume:1 (price/cost are recipe attributes, not mix-derived)', () => {
    const rows = [row({ item: 42, price: 5.0, sold_qty: 1, unit_food_cost: 1.0, unit_paper_cost: 0.5 })];
    const out = computeItemMargins(rows);
    expect(out[0].volume).toBe(1);
    expect(out[0].marginDollars).toBeCloseTo(3.5, 6);
    expect(out[0].marginPct).toBeCloseTo(0.7, 6);
  });

  it('a high-volume item at the same margin% produces a proportionally larger totalContrib', () => {
    const low = computeItemMargins([row({ item: 1, price: 5.0, sold_qty: 1, unit_food_cost: 1.0, unit_paper_cost: 0.5 })])[0];
    const high = computeItemMargins([row({ item: 2, price: 5.0, sold_qty: 1000, unit_food_cost: 1.0, unit_paper_cost: 0.5 })])[0];
    expect(low.marginPct).toBeCloseTo(high.marginPct, 6);
    expect(high.totalContrib).toBeCloseTo(low.totalContrib * 1000, 6);
  });
});

describe('computeItemMargins — window aggregation (multi-day, no averaging across a reprice)', () => {
  it('uses the MOST RECENT day\'s price/cost as "current", not an average across days', () => {
    const rows = [
      row({ item: 1, date: '2026-08-01', price: 2.79, sold_qty: 10, unit_food_cost: 0.5, unit_paper_cost: 0.05 }),
      row({ item: 1, date: '2026-08-20', price: 3.29, sold_qty: 10, unit_food_cost: 0.55, unit_paper_cost: 0.06 }),
    ];
    const out = computeItemMargins(rows);
    expect(out[0].menuPrice).toBe(3.29); // latest day, not (2.79+3.29)/2
    expect(out[0].foodCost).toBeCloseTo(0.55, 6);
    expect(out[0].volume).toBe(20); // both days' units still count toward volume
  });
});

describe('computeItemMargins — locFilter / dateRange / dual row shape', () => {
  it('locFilter accepts a padded or unpadded loc and matches either row shape', () => {
    const rows = [
      row({ loc: '0001001', item: 1, price: 3, sold_qty: 5 }), // padded, DB-shape
      row({ loc: '2002', item: 2, price: 3, sold_qty: 5 }),
    ];
    const out = computeItemMargins(rows, { locFilter: '1001' });
    expect(out).toHaveLength(1);
    expect(out[0].loc).toBe('1001');
  });

  it('dateRange excludes rows outside [start,end] inclusive', () => {
    const rows = [
      row({ item: 1, date: '2026-08-01', sold_qty: 1 }),
      row({ item: 1, date: '2026-08-10', sold_qty: 2 }),
      row({ item: 1, date: '2026-08-20', sold_qty: 4 }),
    ];
    const out = computeItemMargins(rows, { dateRange: { start: '2026-08-05', end: '2026-08-15' } });
    expect(out[0].volume).toBe(2); // only the 08-10 row is in range
  });

  it('accepts loadPmixRows()\'s camelCase mapped shape (real call-site shape)', () => {
    const rows = [
      { loc: '0001001', date: new Date('2026-08-15T00:00:00'), item: 5, price: 6.79,
        desc: 'Big Mac', soldQty: 4, unitFoodCost: 1.3605, unitPaperCost: 0.0737 },
      { loc: '0001001', date: new Date('2026-08-15T00:00:00'), item: 5, price: 5.59,
        desc: 'Big Mac', soldQty: 1, unitFoodCost: 1.3605, unitPaperCost: 0.0737 },
    ];
    const out = computeItemMargins(rows);
    expect(out).toHaveLength(1);
    expect(out[0].menuPrice).toBe(6.79);
    expect(out[0].volume).toBe(5);
    expect(out[0].foodCost).toBeCloseTo(1.3605, 6);
  });
});
