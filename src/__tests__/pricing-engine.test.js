import { describe, it, expect } from 'vitest';
import { computeItemMargins, enrichItemMargins, enrichItemRecipe, clampToLastClosedDay, computeComboCost, crossStoreCompare } from '../engine/pricing-engine.js';

// Synthetic qsr_product_mix-shaped fixtures — raw DB column names (desc_, sold_qty,
// unit_food_cost, unit_paper_cost), per the dispatch. loc left unpadded here (single
// digits) since normLoc()-normalization is exercised separately below.
function row(over) {
  return { loc: '1001', date: '2026-08-15', item: 1, price: 2.99, desc_: 'Item', sold_qty: 10,
    unit_food_cost: 0.5, unit_paper_cost: 0.05, ...over };
}

describe('clampToLastClosedDay — trap 5: an in-progress day silently understates "current" price', () => {
  it('clamps a data max that reaches into an in-progress day back to the last closed day', () => {
    const closed = new Date('2026-08-30T00:00:00');
    const dataMax = new Date('2026-08-31T00:00:00'); // still filling in
    expect(clampToLastClosedDay(dataMax, closed)).toBe(closed);
  });

  it('keeps the real (older) data max when the pull is lagging behind the closed cutoff', () => {
    const closed = new Date('2026-08-31T00:00:00');
    const dataMax = new Date('2026-08-28T00:00:00'); // pull hasn\'t caught up yet
    expect(clampToLastClosedDay(dataMax, closed)).toBe(dataMax);
  });

  it('passes through a data max that exactly equals the closed cutoff', () => {
    const closed = new Date('2026-08-30T00:00:00');
    const dataMax = new Date('2026-08-30T00:00:00');
    expect(clampToLastClosedDay(dataMax, closed)).toBe(dataMax);
  });

  it('returns null/undefined as-is when there is no data at all', () => {
    const closed = new Date('2026-08-30T00:00:00');
    expect(clampToLastClosedDay(null, closed)).toBeNull();
    expect(clampToLastClosedDay(undefined, closed)).toBeUndefined();
  });
});

describe('computeComboCost — custom item combination lookup', () => {
  const itemRows = [
    { itemNumber: 5, descr: 'Big Mac', menuPrice: 6.79, foodCost: 1.71, paperCost: 0.10 },
    { itemNumber: 4, descr: 'Fries Large', menuPrice: 3.99, foodCost: 0.55, paperCost: 0.08 },
    { itemNumber: 3, descr: 'Coke Large', menuPrice: 2.39, foodCost: 0.20, paperCost: 0.06 },
  ];

  it('sums food/paper cost and reference price across the picked items, qty 1 default', () => {
    const out = computeComboCost(itemRows, [{ itemNumber: 5 }, { itemNumber: 4 }]);
    expect(out.items).toHaveLength(2);
    expect(out.sumFoodCost).toBeCloseTo(1.71 + 0.55, 5);
    expect(out.sumPaperCost).toBeCloseTo(0.10 + 0.08, 5);
    expect(out.sumPrice).toBeCloseTo(6.79 + 3.99, 5);
    expect(out.count).toBe(2);
  });

  it('honors an explicit qty (e.g. "2 Big Macs")', () => {
    const out = computeComboCost(itemRows, [{ itemNumber: 5, qty: 2 }]);
    expect(out.items[0].qty).toBe(2);
    expect(out.sumFoodCost).toBeCloseTo(1.71 * 2, 5);
    expect(out.sumPrice).toBeCloseTo(6.79 * 2, 5);
    expect(out.count).toBe(2);
  });

  it('skips a picked itemNumber with no matching row rather than silently zeroing it', () => {
    const out = computeComboCost(itemRows, [{ itemNumber: 5 }, { itemNumber: 99999 }]);
    expect(out.items).toHaveLength(1); // 99999 dropped, not a phantom zero-cost row
    expect(out.count).toBe(1);
  });

  it('does not invent a suggested combo price — sumPrice is the sum of COMPONENT prices only', () => {
    // A real value meal is priced BELOW the sum of its parts; the caller must enter the
    // actual combo price separately. This function never blends the two.
    const out = computeComboCost(itemRows, [{ itemNumber: 5 }, { itemNumber: 4 }, { itemNumber: 3 }]);
    expect(out.sumPrice).toBeCloseTo(6.79 + 3.99 + 2.39, 5);
  });

  it('returns an all-zero, empty result for no picks', () => {
    const out = computeComboCost(itemRows, []);
    expect(out.items).toEqual([]);
    expect(out.sumFoodCost).toBe(0);
    expect(out.sumPaperCost).toBe(0);
    expect(out.sumPrice).toBe(0);
    expect(out.count).toBe(0);
  });
});

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

// ── enrichItemMargins — dispatch #220, waste/comp/promo enrichment ──────────────────
describe('enrichItemMargins', () => {
  // Raw qsr_menu_item_activity-shaped fixture (snake_case DB columns, per the
  // dispatch/schema). Deliberately carries its OWN food_cost/paper_cost, DIFFERENT
  // from the margin row's, so a test can prove those columns are never read.
  function activityRow(over) {
    return {
      loc: '1001', store_menuitem_id: 555, date: '2026-08-27', item_number: 5,
      activity: 100, sold: 90, emp_meal: 0, mgr_meal: 0, waste: 0, promo: 0,
      free_choice_qty: 0, food_cost: 999, paper_cost: 999, total_cost: 1998,
      ...over,
    };
  }
  // One margin row for item 5 at loc 1001 — foodCost+paperCost = 1.4342, deliberately
  // nothing like the activity row's own (wrong-on-purpose) food_cost/paper_cost of 999.
  const marginRow = {
    loc: '1001', itemNumber: 5, descr: 'Big Mac', menuPrice: 6.79,
    foodCost: 1.3605, paperCost: 0.0737, marginDollars: 5.3558, marginPct: 0.789,
    volume: 50, totalContrib: 267.79,
  };

  it('computes dollars = units x the MARGIN ROW\'s own cost, never activityRows\' food_cost/paper_cost', () => {
    const activity = [activityRow({ waste: 10, emp_meal: 2, mgr_meal: 1, promo: 5, activity: 100 })];
    const out = enrichItemMargins([marginRow], activity);
    expect(out).toHaveLength(1);
    const unitCost = 1.3605 + 0.0737; // marginRow's own foodCost+paperCost, NOT the 999s above
    expect(out[0].wasteUnits).toBe(10);
    expect(out[0].wasteDollars).toBeCloseTo(10 * unitCost, 6);
    expect(out[0].compUnits).toBe(3); // emp_meal(2) + mgr_meal(1), summed together
    expect(out[0].compDollars).toBeCloseTo(3 * unitCost, 6);
    expect(out[0].promoUnits).toBe(5);
    expect(out[0].promoDollars).toBeCloseTo(5 * unitCost, 6);
    // Sanity: if activityRows' own (deliberately wrong) 999 cost columns had leaked in,
    // wasteDollars would be 9990, nowhere near this.
    expect(out[0].wasteDollars).toBeLessThan(100);
  });

  it('uses `activity`, not `sold`, as the denominator for the Pct fields', () => {
    const activity = [activityRow({ waste: 8, activity: 100, sold: 20 })]; // sold is much smaller
    const out = enrichItemMargins([marginRow], activity);
    expect(out[0].wastePctOfActivity).toBeCloseTo(8 / 100, 6); // not 8/20
  });

  it('an item present in margins but ABSENT from activity rows gets null, not 0', () => {
    const out = enrichItemMargins([marginRow], [activityRow({ item_number: 999 })]); // different item
    expect(out).toHaveLength(1);
    expect(out[0].wasteUnits).toBeNull();
    expect(out[0].wasteDollars).toBeNull();
    expect(out[0].compUnits).toBeNull();
    expect(out[0].compDollars).toBeNull();
    expect(out[0].promoUnits).toBeNull();
    expect(out[0].promoDollars).toBeNull();
    expect(out[0].wastePctOfActivity).toBeNull();
    expect(out[0].compPctOfActivity).toBeNull();
    expect(out[0].promoPctOfActivity).toBeNull();
  });

  it('a real-zero-waste item (activity rows exist, all zero) gets 0, distinguishable from the never-had-data case', () => {
    const activity = [activityRow({ waste: 0, emp_meal: 0, mgr_meal: 0, promo: 0, activity: 100 })];
    const out = enrichItemMargins([marginRow], activity);
    expect(out[0].wasteUnits).toBe(0);
    expect(out[0].wasteDollars).toBe(0);
    expect(out[0].wasteUnits).not.toBeNull();
  });

  it('SUMS across every matching activity row in the window (multi-day) -- NOT last-day-only', () => {
    // Deliberately mirrors the price/cost "latest day only" test above to prove this is
    // a genuinely different aggregation rule for waste/comp/promo.
    const activity = [
      activityRow({ date: '2026-08-01', waste: 3, emp_meal: 1, mgr_meal: 0, promo: 2, activity: 50 }),
      activityRow({ date: '2026-08-20', waste: 7, emp_meal: 0, mgr_meal: 1, promo: 1, activity: 50 }),
    ];
    const out = enrichItemMargins([marginRow], activity, { dateRange: { start: '2026-08-01', end: '2026-08-20' } });
    expect(out[0].wasteUnits).toBe(10); // 3 + 7, summed across both days
    expect(out[0].compUnits).toBe(2);   // (1+0) + (0+1)
    expect(out[0].promoUnits).toBe(3);  // 2 + 1
    expect(out[0].wastePctOfActivity).toBeCloseTo(10 / 100, 6); // activity summed too: 50+50
  });

  it('dateRange excludes activity rows outside [start,end] inclusive', () => {
    const activity = [
      activityRow({ date: '2026-07-01', waste: 999 }), // outside window
      activityRow({ date: '2026-08-10', waste: 5, activity: 20 }),
    ];
    const out = enrichItemMargins([marginRow], activity, { dateRange: { start: '2026-08-01', end: '2026-08-20' } });
    expect(out[0].wasteUnits).toBe(5); // the 999 row must not be counted
  });

  it('accepts a camelCase-mapped loader shape (itemNumber/empMeal/mgrMeal), same dual-shape tolerance as computeItemMargins', () => {
    const activity = [{
      loc: '0001001', storeMenuitemId: 555, date: new Date('2026-08-27T00:00:00'),
      itemNumber: 5, activity: 40, sold: 30, empMeal: 2, mgrMeal: 0, waste: 4, promo: 0,
    }];
    const out = enrichItemMargins([marginRow], activity);
    expect(out[0].wasteUnits).toBe(4);
    expect(out[0].compUnits).toBe(2);
  });

  it('joins on normLoc()\'d loc regardless of raw padding differences', () => {
    const activity = [activityRow({ loc: '0001001', waste: 6, activity: 30 })]; // padded
    const out = enrichItemMargins([{ ...marginRow, loc: '1001' }], activity); // unpadded margin row
    expect(out[0].wasteUnits).toBe(6);
  });

  it('an empty activityRows array yields null fields for every margin row, not a throw', () => {
    const out = enrichItemMargins([marginRow], []);
    expect(out[0].wasteUnits).toBeNull();
  });

  it('returns activityUnits (the raw summed denominator) alongside the Pct fields, null when unmatched', () => {
    const activity = [
      activityRow({ date: '2026-08-01', activity: 30 }),
      activityRow({ date: '2026-08-20', activity: 20 }),
    ];
    const out = enrichItemMargins([marginRow], activity, { dateRange: { start: '2026-08-01', end: '2026-08-20' } });
    expect(out[0].activityUnits).toBe(50); // summed, matching the Pct denominators
    const unmatched = enrichItemMargins([marginRow], [activityRow({ item_number: 999 })]);
    expect(unmatched[0].activityUnits).toBeNull();
  });
});

describe('enrichItemRecipe', () => {
  // Raw qsr_menu_item_recipe-shaped fixture (snake_case DB COLUMNS -- but the `recipe`/
  // `hist_recipe` jsonb columns themselves hold mapMenuItemRecipe()'s CAMELCASE per-ingredient
  // output verbatim, since that's what scripts/qsrsoft-menu-item-recipe-pull.mjs actually
  // writes -- enrichItemRecipe() below passes those arrays through unmodified, it does not
  // re-map them). food_cost/paper_cost deliberately DIFFER from the margin row's own, so a test
  // can prove those are kept as separate recipeFoodCost/recipePaperCost fields, never
  // overwriting foodCost/paperCost.
  function recipeRow(over) {
    return {
      loc: '1001', store_menuitem_id: 555, item_number: 5, description: 'Big Mac',
      daypart_code: 'Regular', family_group: 'Regular Entree', combination_item: false, on_pos: true,
      food_cost: 1.36, paper_cost: 0.0737, total_cost: 1.4337,
      recipe: [
        { fullWrin: '00005-086', longDesc: '100% PURE BEEF', startDate: '2026-05-13', servings: 2, cls: 'F', looseUnitCost: 0.4273, costPrice: 0.8545 },
        { fullWrin: '00284-166', longDesc: 'WRAP/HAMBURGER', startDate: '2026-05-13', servings: 1, cls: 'P', looseUnitCost: 0.016, costPrice: 0.016 },
      ],
      hist_recipe: [],
      updated_at: '2026-08-30T00:00:00Z',
      ...over,
    };
  }
  const marginRow = {
    loc: '1001', itemNumber: 5, descr: 'Big Mac', menuPrice: 6.79,
    foodCost: 1.3605, paperCost: 0.0737, marginDollars: 5.3558, marginPct: 0.789,
    volume: 50, totalContrib: 267.79,
  };

  it('joins recipe/BOM fields onto the margin row without touching its own foodCost/paperCost', () => {
    const out = enrichItemRecipe([marginRow], [recipeRow()]);
    expect(out).toHaveLength(1);
    expect(out[0].foodCost).toBe(1.3605);   // untouched -- the proven margin-basis cost
    expect(out[0].paperCost).toBe(0.0737);  // untouched
    expect(out[0].recipeFoodCost).toBe(1.36);   // the recipe endpoint's OWN cost, kept separate
    expect(out[0].recipePaperCost).toBe(0.0737);
    expect(out[0].recipe).toHaveLength(2);
    expect(out[0].recipe[0].fullWrin).toBe('00005-086');
    expect(out[0].familyGroup).toBe('Regular Entree');
    expect(out[0].daypartCode).toBe('Regular');
    expect(out[0].onPos).toBe(true);
  });

  it('an item present in margins but ABSENT from recipe rows gets recipe:null, not []', () => {
    const out = enrichItemRecipe([marginRow], [recipeRow({ item_number: 999 })]); // different item
    expect(out).toHaveLength(1);
    expect(out[0].recipe).toBeNull();
    expect(out[0].histRecipe).toBeNull();
    expect(out[0].recipeFoodCost).toBeNull();
    expect(out[0].familyGroup).toBeNull();
  });

  it('an item WITH a recipe row but a genuinely empty ingredient list gets recipe:[], distinguishable from null', () => {
    const out = enrichItemRecipe([marginRow], [recipeRow({ recipe: [] })]);
    expect(out[0].recipe).toEqual([]);
    expect(out[0].recipe).not.toBeNull();
  });

  it('accepts a camelCase-mapped shape (itemNumber/foodCost/onPos), same dual-shape tolerance as the sibling enrich functions', () => {
    const camel = {
      loc: '0001001', storeMenuitemId: 555, itemNumber: 5, description: 'Big Mac',
      familyGroup: 'Regular Entree', onPos: true, foodCost: 1.36, paperCost: 0.0737,
      recipe: [{ fullWrin: 'X', longDesc: 'Y', servings: 1, cls: 'F', costPrice: 1 }],
      histRecipe: [], updatedAt: '2026-08-30T00:00:00Z',
    };
    const out = enrichItemRecipe([marginRow], [camel]);
    expect(out[0].recipeFoodCost).toBe(1.36);
    expect(out[0].onPos).toBe(true);
    expect(out[0].recipe).toHaveLength(1);
  });

  it('joins on normLoc()\'d loc regardless of raw padding differences', () => {
    const out = enrichItemRecipe([{ ...marginRow, loc: '1001' }], [recipeRow({ loc: '0001001' })]);
    expect(out[0].recipe).toHaveLength(2);
  });

  it('an empty recipeRows array yields null recipe fields for every margin row, not a throw', () => {
    const out = enrichItemRecipe([marginRow], []);
    expect(out[0].recipe).toBeNull();
  });

  it('two recipe rows resolving to the same (loc,item_number) keep the first, never silently merge two recipes', () => {
    const out = enrichItemRecipe([marginRow], [
      recipeRow({ store_menuitem_id: 555, food_cost: 1.36 }),
      recipeRow({ store_menuitem_id: 999999, food_cost: 9.99 }), // a different store_menuitem_id, same item_number
    ]);
    expect(out[0].recipeFoodCost).toBe(1.36); // the first one, not summed/averaged with 9.99
  });
});

// Fixtures modeled on the live measurement documented in the crossStoreCompare header comment
// (store 3708 vs. the district, real qsr_product_mix, 2026-08-25..08-31): Big Mac priced
// $4.99-$6.99 across stores with near-uniform ~$1.44 food cost; Double Quarter Cheese priced
// $6.19-$9.59; every store's Big-Mac-to-DQC margin gap sits ~10-15pts except one outlier store
// (~23pts, double the norm) whose Big Mac is completely average but whose DQC is mispriced
// relative to how that SAME store prices everything else. A third item (Quarter Pounder) is
// included per store purely so median() has 3 points, not 2 (avoiding a median that just
// degenerates to a 2-item average).
describe('crossStoreCompare — self-relative margin gap (never a peer-price-deviation flag)', () => {
  const crossStoreRows = [
    // Store 1001 -- normal, ~12pt DQC gap
    { loc: '1001', itemNumber: 5, descr: 'Big Mac', menuPrice: 5.99, foodCost: 1.44, paperCost: 0.08, marginPct: 0.76, volume: 200 },
    { loc: '1001', itemNumber: 3, descr: 'Quarter Pounder', menuPrice: 5.49, foodCost: 1.30, paperCost: 0.07, marginPct: 0.75, volume: 150 },
    { loc: '1001', itemNumber: 8, descr: 'Double Quarter Cheese', menuPrice: 7.59, foodCost: 1.90, paperCost: 0.09, marginPct: 0.63, volume: 90 },
    // Store 1002 -- normal, ~11pt DQC gap
    { loc: '1002', itemNumber: 5, descr: 'Big Mac', menuPrice: 6.49, foodCost: 1.45, paperCost: 0.08, marginPct: 0.77, volume: 220 },
    { loc: '1002', itemNumber: 3, descr: 'Quarter Pounder', menuPrice: 5.79, foodCost: 1.31, paperCost: 0.07, marginPct: 0.76, volume: 140 },
    { loc: '1002', itemNumber: 8, descr: 'Double Quarter Cheese', menuPrice: 8.29, foodCost: 1.91, paperCost: 0.09, marginPct: 0.65, volume: 100 },
    // Store 1003 -- normal, ~12pt DQC gap
    { loc: '1003', itemNumber: 5, descr: 'Big Mac', menuPrice: 4.99, foodCost: 1.43, paperCost: 0.08, marginPct: 0.75, volume: 180 },
    { loc: '1003', itemNumber: 3, descr: 'Quarter Pounder', menuPrice: 4.59, foodCost: 1.29, paperCost: 0.07, marginPct: 0.74, volume: 130 },
    { loc: '1003', itemNumber: 8, descr: 'Double Quarter Cheese', menuPrice: 6.19, foodCost: 1.89, paperCost: 0.08, marginPct: 0.62, volume: 70 },
    // Store 0035064 -- the outlier: Big Mac completely average, DQC mispriced relative to its
    // own other items (~23pt gap, ~double the ~11-12pt norm above)
    { loc: '0035064', itemNumber: 5, descr: 'Big Mac', menuPrice: 6.99, foodCost: 1.44, paperCost: 0.08, marginPct: 0.76, volume: 210 },
    { loc: '0035064', itemNumber: 3, descr: 'Quarter Pounder', menuPrice: 5.99, foodCost: 1.30, paperCost: 0.07, marginPct: 0.75, volume: 160 },
    { loc: '0035064', itemNumber: 8, descr: 'Double Quarter Cheese', menuPrice: 9.59, foodCost: 1.90, paperCost: 0.09, marginPct: 0.52, volume: 85 },
  ];

  it('computes each store\'s own median margin across its items, not a district-wide median', () => {
    const out = crossStoreCompare(crossStoreRows);
    expect(out.storeMedians['1001']).toBeCloseTo(0.75, 6);
    expect(out.storeMedians['1002']).toBeCloseTo(0.76, 6);
    expect(out.storeMedians['1003']).toBeCloseTo(0.74, 6);
    expect(out.storeMedians['0035064']).toBeCloseTo(0.75, 6);
  });

  it('price legitimately spans the full $4.99-$6.99 / $6.19-$9.59 range -- this is never itself flagged', () => {
    const out = crossStoreCompare(crossStoreRows);
    const bigMac = out.byItem.find(i => i.itemNumber === 5);
    const dqc = out.byItem.find(i => i.itemNumber === 8);
    expect(bigMac.priceMin).toBeCloseTo(4.99, 6);
    expect(bigMac.priceMax).toBeCloseTo(6.99, 6);
    expect(dqc.priceMin).toBeCloseTo(6.19, 6);
    expect(dqc.priceMax).toBeCloseTo(9.59, 6);
  });

  it('marginGapPts is self-relative (item margin vs. that store\'s OWN median), not vs. any peer store', () => {
    const out = crossStoreCompare(crossStoreRows);
    const dqc = out.byItem.find(i => i.itemNumber === 8);
    const byLoc = Object.fromEntries(dqc.stores.map(s => [s.loc, s]));
    expect(byLoc['1001'].marginGapPts).toBeCloseTo(-12, 6);
    expect(byLoc['1002'].marginGapPts).toBeCloseTo(-11, 6);
    expect(byLoc['1003'].marginGapPts).toBeCloseTo(-12, 6);
    expect(byLoc['0035064'].marginGapPts).toBeCloseTo(-23, 6);
  });

  it('flags the real signal: the outlier store\'s gap is ~double its peers\' even though its Big Mac (and its price) is unremarkable', () => {
    const out = crossStoreCompare(crossStoreRows);
    const dqc = out.byItem.find(i => i.itemNumber === 8);
    const byLoc = Object.fromEntries(dqc.stores.map(s => [s.loc, s]));
    const peerGaps = ['1001', '1002', '1003'].map(l => Math.abs(byLoc[l].marginGapPts));
    const peerAvg = peerGaps.reduce((a, b) => a + b, 0) / peerGaps.length;
    expect(Math.abs(byLoc['0035064'].marginGapPts)).toBeGreaterThan(peerAvg * 1.8);

    const bigMac = out.byItem.find(i => i.itemNumber === 5);
    const bmByLoc = Object.fromEntries(bigMac.stores.map(s => [s.loc, s]));
    // its Big Mac gap stays small/unremarkable -- the outlier is item-specific, not store-wide
    expect(Math.abs(bmByLoc['0035064'].marginGapPts)).toBeLessThan(5);
  });

  it('rows missing marginPct are excluded from a store\'s own median but still pass through in stores[]', () => {
    const out = crossStoreCompare([
      ...crossStoreRows,
      { loc: '1001', itemNumber: 99, descr: 'No margin data', menuPrice: 3.99, foodCost: null, paperCost: null, marginPct: null, volume: 5 },
    ]);
    expect(out.storeMedians['1001']).toBeCloseTo(0.75, 6); // unchanged by the null row
    const noMarginItem = out.byItem.find(i => i.itemNumber === 99);
    expect(noMarginItem.stores[0].marginGapPts).toBeNull();
  });

  it('rows with a null loc or itemNumber are dropped rather than corrupting a group', () => {
    const out = crossStoreCompare([
      { loc: null, itemNumber: 5, marginPct: 0.9 },
      { loc: '1001', itemNumber: null, marginPct: 0.9 },
      { loc: '1001', itemNumber: 5, descr: 'Big Mac', menuPrice: 5.99, foodCost: 1.44, paperCost: 0.08, marginPct: 0.76, volume: 200 },
    ]);
    expect(out.byItem).toHaveLength(1);
    expect(out.byItem[0].stores).toHaveLength(1);
  });

  it('an empty itemRows array yields empty output, not a throw', () => {
    expect(crossStoreCompare([])).toEqual({ byItem: [], storeMedians: {} });
    expect(crossStoreCompare(undefined)).toEqual({ byItem: [], storeMedians: {} });
  });
});
