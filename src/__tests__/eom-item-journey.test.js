import { describe, it, expect } from 'vitest';
import { buildItemJourney, buildStoreJourneys, storeSwingLedger, reconstructMissingProducts, SOURCE_LANE } from '../engine/eom-item-journey.js';

// A raw-item detail shaped like mapRawItemHistory() output.
const detail = (history) => ({ wrin: '00005-086', descr: '100% PURE BEEF', itemClass: 'Food', uom: 'CS', history });
const h = (dt, source, qtyChange, extra = {}) => ({
  dt, source, qtyChange, isCount: source === 'inventory', ...extra,
});

describe('buildItemJourney', () => {
  it('classifies sources into lanes and sorts chronologically', () => {
    const j = buildItemJourney(detail([
      h('2026-07-10', 'pos_sales', -40),
      h('2026-07-01', 'invoice', 100, { invoice: 'INV-1' }),
      h('2026-07-05', 'waste', -10),
    ]), { period: '2026-07' });
    expect(j.events.map(e => e.dt)).toEqual(['2026-07-01', '2026-07-05', '2026-07-10']);
    expect(j.events.map(e => e.lane)).toEqual(['received', 'waste', 'used']);
    expect(SOURCE_LANE.comp_waste).toBe('waste');
  });

  it('surfaces a count variance as a FACT attributed to date + counter', () => {
    const j = buildItemJourney(detail([
      h('2026-07-05', 'inventory', 0, { difference: -900, variance: -20, manager: 'Cinthya a' }),
    ]), { period: '2026-07' });
    const fact = j.signals.find(s => s.kind === 'fact');
    expect(fact.text).toMatch(/900 short at the 2026-07-05 count/);
    expect(fact.text).toMatch(/Cinthya a/);
  });

  it('judges an EARLY break-point as locked (recount won\'t recover)', () => {
    const j = buildItemJourney(detail([
      h('2026-07-05', 'inventory', 0, { difference: -900, variance: -20 }),
    ]), { period: '2026-07' }); // window starts 07-29 → 07-05 is early
    const inf = j.signals.find(s => s.kind === 'inference' && s.lane === 'count');
    expect(inf.text).toMatch(/locked|won't recover/i);
    expect(j.verdict.tone).toBe('bad');
  });

  it('judges a LATE break-point (in window) as recoverable', () => {
    const j = buildItemJourney(detail([
      h('2026-07-30', 'inventory', 0, { difference: -900, variance: -20 }),
    ]), { period: '2026-07' }); // 07-30 is inside the 07-29+ window
    const inf = j.signals.find(s => s.kind === 'inference' && s.lane === 'count');
    expect(inf.text).toMatch(/recover it|recount .* resubmit/i);
  });

  it('flags waste-dominated outflow as an inference', () => {
    const j = buildItemJourney(detail([
      h('2026-07-01', 'invoice', 100),
      h('2026-07-10', 'pos_sales', -50),
      h('2026-07-12', 'waste', -40),
    ]), { period: '2026-07' });
    const w = j.signals.find(s => s.kind === 'inference' && s.lane === 'waste');
    expect(w).toBeTruthy();
    expect(w.text).toMatch(/Waste is \d+(\.\d+)?%/);
  });

  it('nets counts to a clean verdict when variance is immaterial', () => {
    const j = buildItemJourney(detail([
      h('2026-07-30', 'inventory', 0, { difference: -10 }),
    ]), { period: '2026-07' });
    expect(j.verdict.tone).toBe('good');
    expect(j.verdict.text).toMatch(/On track/);
  });

  it('handles an item with no count', () => {
    const j = buildItemJourney(detail([h('2026-07-01', 'invoice', 100)]), { period: '2026-07' });
    expect(j.counts).toHaveLength(0);
    expect(j.verdict.text).toMatch(/No physical count/);
  });
});

describe('buildStoreJourneys', () => {
  it('orders items worst-net-variance first', () => {
    const items = [
      detail([h('2026-07-05', 'inventory', 0, { difference: -100 })]),
      { ...detail([h('2026-07-05', 'inventory', 0, { difference: -800 })]), wrin: 'BIG' },
    ];
    const js = buildStoreJourneys(items, { period: '2026-07' });
    expect(js[0].wrin).toBe('BIG');
  });
});

// 2026-08-31 (owner req) — "take all the items that where lost during the month, which little
// hope of recovering by a recount at eom... I want to see the accumulative total of those and
// what they were and when it happened along with if a recount took place at the time or not and
// who the counting manager was." storeSwingLedger() flattens buildStoreJourneys() into one row per
// material count-event across the whole month (not just the EOM close window), classified
// recovered (a later count this period superseded it) vs locked (the item's final count, already
// before the close window — nothing left to recover). Window for period '2026-07' starts 07-29
// (see buildItemJourney's own test above).
describe('storeSwingLedger', () => {
  it("owner's own example — nuggets lost mid-month, beef lost a week ago, mcchicken gained week 1", () => {
    const items = [
      { wrin: 'NUG', descr: 'Chicken McNuggets', itemClass: 'Food', caseSz: 40, uom: 'CS', history: [
        h('2026-07-10', 'inventory', 0, { difference: -560, variance: -80, manager: 'Lynsey Y' }),
      ] },
      { wrin: 'BEEF', descr: '4:1 Beef Patties', itemClass: 'Food', caseSz: 100, uom: 'CS', history: [
        h('2026-07-24', 'inventory', 0, { difference: -140, variance: -50, manager: 'Thorley E' }),
      ] },
      { wrin: 'MCC', descr: 'McChicken', itemClass: 'Food', caseSz: 60, uom: 'CS', history: [
        h('2026-07-05', 'inventory', 0, { difference: 300, variance: 120, manager: 'Leah B' }),
        h('2026-07-30', 'inventory', 0, { difference: -50, variance: -20, manager: 'Leah B' }),  // week-4 recount
      ] },
    ];
    const led = storeSwingLedger(items, { period: '2026-07' });
    expect(led.rows).toHaveLength(4); // NUG(1) + BEEF(1) + MCC's two count events

    const nug = led.rows.find(r => r.wrin === 'NUG');
    expect(nug.dollars).toBe(-560);
    expect(nug.cases).toBeCloseTo(2, 5);        // 80 units / 40 case size
    expect(nug.manager).toBe('Lynsey Y');
    expect(nug.recovered).toBe(false);           // never counted again this period
    expect(nug.locked).toBe(true);                // its only/last count was 07-10, before the 07-29 window

    const beef = led.rows.find(r => r.wrin === 'BEEF');
    expect(beef.cases).toBeCloseTo(0.5, 5);      // 50 units / 100 case size
    expect(beef.locked).toBe(true);

    const mccGain = led.rows.find(r => r.wrin === 'MCC' && r.dt === '2026-07-05');
    expect(mccGain.dollars).toBe(300);
    expect(mccGain.recovered).toBe(true);         // superseded by the 07-30 recount
    const mccRecount = led.rows.find(r => r.wrin === 'MCC' && r.dt === '2026-07-30');
    expect(mccRecount.recovered).toBe(false);     // this IS the final count
    expect(mccRecount.locked).toBe(false);        // 07-30 is inside the window — still fresh

    // Accumulative total across all three items' swings (owner: "show a total +/- variance dollar
    // amount... how it played into eom results").
    expect(led.totalDollars).toBe(-560 + -140 + 300 + -50);
  });

  it('excludes swings below the materiality floor', () => {
    const items = [
      { wrin: 'X', descr: 'Small item', itemClass: 'Food', caseSz: 10, history: [
        h('2026-07-10', 'inventory', 0, { difference: -10, variance: -2, manager: 'A' }),
      ] },
    ];
    const led = storeSwingLedger(items, { period: '2026-07', floor: 25 });
    expect(led.rows).toHaveLength(0);
    expect(led.totalDollars).toBe(0);
  });

  it('topSwingers ranks by net $ across the whole item, independent of locked/recovered', () => {
    const items = [
      { wrin: 'NUG', descr: 'Chicken McNuggets', itemClass: 'Food', caseSz: 40, history: [
        h('2026-07-10', 'inventory', 0, { difference: -560, variance: -80, manager: 'Lynsey Y' }),
      ] },
      { wrin: 'SMALL', descr: 'Small item', itemClass: 'Food', caseSz: 10, history: [
        h('2026-07-10', 'inventory', 0, { difference: -30, variance: -3, manager: 'A' }),
      ] },
    ];
    const led = storeSwingLedger(items, { period: '2026-07' });
    expect(led.topSwingers[0].wrin).toBe('NUG');
    expect(led.topSwingers.map(t => t.wrin)).toContain('SMALL');
  });
});

// 2026-08-31 (owner req, verbatim) — "if i was missing 100 pieces of fresh beef and 110 regular
// buns and 98 slices of cheese, i would envision that as either 100 cheeseburgers or 50 McDoubles
// possibly unaccounted for." Real recipe_serving_factor shape from a live qsr_raw_item_info capture
// (2026-08-31, store 29760): Cheeseburger factor 1 for beef, McDouble/Dbl Qtr factor 2.
describe('reconstructMissingProducts', () => {
  const RAW_ITEM_INFO = {
    BEEF: { menuItems: [
      { item_number: 7, description: 'Cheeseburger', recipe_serving_factor: 1, on_pos: 'Y' },
      { item_number: 3426, description: 'McDouble', recipe_serving_factor: 2, on_pos: 'Y' },
    ] },
    BUN: { menuItems: [
      { item_number: 7, description: 'Cheeseburger', recipe_serving_factor: 1, on_pos: 'Y' },
      { item_number: 3426, description: 'McDouble', recipe_serving_factor: 1, on_pos: 'Y' },  // shares one bun
    ] },
    CHEESE: { menuItems: [
      { item_number: 7, description: 'Cheeseburger', recipe_serving_factor: 1, on_pos: 'Y' },
      { item_number: 3426, description: 'McDouble', recipe_serving_factor: 2, on_pos: 'Y' },
    ] },
  };
  // storeSwingLedger()-shaped rows: three shortages, all missing ~100 units, all uncorrected.
  const SWINGS = [
    { wrin: 'BEEF', descr: '100% Beef Patty', dollars: -560, unitVar: -100, dt: '2026-07-10' },
    { wrin: 'BUN', descr: 'Regular Bun', dollars: -80, unitVar: -110, dt: '2026-07-11' },
    { wrin: 'CHEESE', descr: 'Cheese Slice', dollars: -60, unitVar: -98, dt: '2026-07-12' },
  ];

  it("finds Cheeseburger as the tight-fit candidate (all three ingredients agree on ~100)", () => {
    const out = reconstructMissingProducts(SWINGS, RAW_ITEM_INFO);
    const burger = out.find(c => c.description === 'Cheeseburger');
    expect(burger).toBeTruthy();
    expect(burger.contributors).toHaveLength(3);
    expect(burger.tight).toBe(true);
    expect(burger.estimatedUnits).toBeCloseTo(100, 0);
  });

  it('flags McDouble as a LOOSE candidate — beef/cheese imply 50, but bun implies 110 (not a matching recipe)', () => {
    const out = reconstructMissingProducts(SWINGS, RAW_ITEM_INFO);
    const dbl = out.find(c => c.description === 'McDouble');
    expect(dbl).toBeTruthy();
    expect(dbl.tight).toBe(false);
  });

  it('ranks the tight candidate first', () => {
    const out = reconstructMissingProducts(SWINGS, RAW_ITEM_INFO);
    expect(out[0].description).toBe('Cheeseburger');
  });

  it('ignores a candidate with only 1 corroborating ingredient (coincidence, not a signal)', () => {
    const oneItem = { wrin: 'BEEF', descr: '100% Beef Patty', dollars: -560, unitVar: -100, dt: '2026-07-10' };
    const out = reconstructMissingProducts([oneItem], RAW_ITEM_INFO);
    expect(out).toHaveLength(0);
  });

  it('never reconstructs from a GAIN (positive unitVar) — only shortages represent "missing" product', () => {
    const gain = { wrin: 'BEEF', descr: '100% Beef Patty', dollars: 560, unitVar: 100, dt: '2026-07-10' };
    const out = reconstructMissingProducts([gain, SWINGS[1], SWINGS[2]], RAW_ITEM_INFO);
    // Beef's gain doesn't corroborate — Cheeseburger/McDouble now have only bun+cheese (2 each),
    // so they can still surface, but beef must not appear among their contributors.
    for (const c of out) expect(c.contributors.some(x => x.wrin === 'BEEF')).toBe(false);
  });
});
