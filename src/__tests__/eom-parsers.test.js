import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  mapVarianceRows, mapYieldGroups, parseYieldRange, yieldBandFor, yieldStatus,
  mapWasteEvents, summarizeWasteByManager, mapTransferLines, summarizeTransfers, flagUnmatchedTransfers,
  mapRawItemHistory, mapRawItemInfo, mapMenuItems, mapMenuItemActivity, mapMenuItemActivityCost,
} from '../engine/eom-parsers.js';

describe('mapVarianceRows', () => {
  it('carries $ for Food/Paper (ri:1), zeroes $ for Condiment (ri:0)', () => {
    const rows = [
      { wrin: '00005-086', long_desc: '100% PURE BEEF', class: 'F', ri: 1, dollar_variance: -868.13, variance: -2054, yield: 0.916, store_rawitem_id: 1385962, percentage: -0.318 },
      { wrin: '00029-009', long_desc: 'SALT/NON-IODIZED', class: 'C', ri: 0, variance: -1.73, mid_range_yield: 2000 },
    ];
    const [beef, salt] = mapVarianceRows(rows);
    expect(beef.dolDiff).toBeCloseTo(-868.13);
    expect(beef.cls).toBe('food');
    expect(beef.rawItemId).toBe(1385962);
    expect(salt.dolDiff).toBe(0); // condiment: no dollar figure
    expect(salt.unitVar).toBeCloseTo(-1.73);
    expect(salt.hasDollars).toBe(false);
  });
});

describe('yields', () => {
  it('parses "Y Range" bands and matches by wrin prefix', () => {
    expect(parseYieldRange('Y Range: 35.00 - 37.00')).toEqual({ lo: 35, hi: 37 });
    expect(parseYieldRange('Y Range: 53.1-58.7')).toEqual({ lo: 53.1, hi: 58.7 });
    const lookup = mapYieldGroups([
      { groupName: 'Big Mac Sauce', description: 'Y Range: 35.00 - 37.00', items: ['00055'] },
      { groupName: 'Fries', description: 'Y Range: 84.9 - 93.9', items: ['00004'] },
    ]);
    expect(yieldBandFor('00055-332', lookup).group).toBe('Big Mac Sauce');
    expect(yieldBandFor('99999-000', lookup)).toBeNull();
  });
  it('classifies actual yield vs band', () => {
    const band = { lo: 35, hi: 37, group: 'x' };
    expect(yieldStatus(33, band)).toBe('below');
    expect(yieldStatus(36, band)).toBe('in-band');
    expect(yieldStatus(40, band)).toBe('above');
    expect(yieldStatus(null, band)).toBe('unknown');
  });
});

describe('waste', () => {
  const raw = [
    { store_busn_dt: '2026-07-25', type: 'waste', amount: 21.27, eID: 'James T - e8483035', source: 'BOS', edited: 0 },
    { store_busn_dt: '2026-07-25', type: 'comp_waste', amount: 26.53, eID: 'James T - e8483035', source: 'BOS', edited: 1 },
    { store_busn_dt: '2026-07-24', type: 'waste', amount: 3.18, eID: 'liz r - e9762152', source: 'MobileApp', edited: 0 },
  ];
  it('maps type + manager + edited', () => {
    const [a, b] = mapWasteEvents(raw);
    expect(a.type).toBe('raw');
    expect(b.type).toBe('completed');
    expect(b.edited).toBe(true);
  });
  it('summarizes by manager with share', () => {
    const { total, byManager } = summarizeWasteByManager(mapWasteEvents(raw));
    expect(total).toBeCloseTo(50.98, 1);
    expect(byManager[0].manager).toBe('James T - e8483035'); // largest first
    expect(byManager[0].edited).toBe(1);
    expect(byManager[0].share).toBeGreaterThan(0.9);
  });
});

describe('transfers', () => {
  const rows = [
    { id: 1, type: 'Out', trans_nsn: 6972, store_busn_dt: '07/20/2026', status: 'approved', total_amt: 162.32, header_total_amt: 205.23, eID: 'Cinthya a', store_rawitem_id: 1385962, wrin: '00005-086', long_desc: 'BEEF', invty_class_cd: 'F', units_count: 384 },
    { id: 1, type: 'Out', trans_nsn: 6972, store_busn_dt: '07/20/2026', status: 'approved', total_amt: 42.91, header_total_amt: 205.23, eID: 'Cinthya a', store_rawitem_id: 1386211, wrin: '01637-095', long_desc: 'CHKN', invty_class_cd: 'F', units_count: 87 },
    { id: 2, type: 'In', trans_nsn: 24471, store_busn_dt: '07/07/2026', status: 'rejected', total_amt: 4.06, header_total_amt: 4.06, eID: 'Kody E', store_rawitem_id: 62825146, wrin: '07605-041', long_desc: 'GLOVES', invty_class_cd: 'S', units_count: 200 },
  ];
  it('groups by transfer id and flags large/unapproved', () => {
    const lines = mapTransferLines(rows);
    expect(lines[0].dir).toBe('Out');
    const s = summarizeTransfers(lines, { largeAmt: 100 });
    expect(s.outTotal).toBeCloseTo(205.23, 1);
    expect(s.inTotal).toBeCloseTo(4.06, 1);
    // transfer 1 flagged (large), transfer 2 flagged (rejected)
    expect(s.flagged.map(t => t.id).sort()).toEqual([1, 2]);
    expect(s.flagged.find(t => t.id === 2).status).toBe('rejected');
  });
});

describe('flagUnmatchedTransfers', () => {
  const T = (loc, id, dir, cp, total, dt) => ({ loc, transferId: id, dir, counterpartyNsn: cp, transferTotal: total, dt });
  it('flags a transfer with no mirror at the counterparty sister store', () => {
    const lines = [
      // A→B Out has a matching B In (counterparty A, same $, same day) → matched
      T('0003708', 'x1', 'Out', '3709', 200, '2026-07-30'),
      T('0003709', 'y1', 'In', '3708', 200, '2026-07-30'),
      // A→B Out with NO mirror at B → unmatched (phantom risk)
      T('0003708', 'x2', 'Out', '3709', 500, '2026-07-31'),
    ];
    const our = ['0003708', '0003709'];
    const un = flagUnmatchedTransfers(lines, our);
    expect(un.has('3708|x2')).toBe(true);
    expect(un.has('3708|x1')).toBe(false);
    expect(un.has('3709|y1')).toBe(false);
  });
  it('does NOT flag a transfer whose counterparty is outside our store set', () => {
    const lines = [T('0003708', 'x9', 'Out', '9999999', 300, '2026-07-30')];
    const un = flagUnmatchedTransfers(lines, ['0003708']);
    expect(un.size).toBe(0);
  });
});

describe('mapRawItemHistory', () => {
  it('extracts count events (source=inventory) with variance/difference/manager', () => {
    const detail = {
      full_wrin: '00005-086', long_desc: '100% PURE BEEF', uom_desc: 'Each', item_class: 'F',
      history: [
        { store_busn_dt: '2026-07-05', source: 'invoice', qty_change: 384, invoice_identifier: 'INV1' },
        { store_busn_dt: '2026-07-21', source: 'inventory', qty_change: -4608, variance: -4608, difference: -1947.88, eID: 'Cinthya a - e9755633', count_source: 'MobileApp' },
      ],
    };
    const m = mapRawItemHistory(detail);
    expect(m.wrin).toBe('00005-086');
    expect(m.history).toHaveLength(2);
    expect(m.counts).toHaveLength(1);
    expect(m.counts[0].difference).toBeCloseTo(-1947.88);
    expect(m.counts[0].manager).toBe('Cinthya a - e9755633');
    expect(m.counts[0].isCount).toBe(true);
  });
});

describe('mapRawItemInfo', () => {
  it('extracts recipe/serving-factor, combo composition, and current cost fields (dispatch #184)', () => {
    const detail = {
      full_wrin: '00005-086', long_desc: '100% PURE BEEF', invty_category_type: 'Food',
      case_qty: 40, latest_case_price: 62.15, case_price_avg: 61.02,
      primary_vdr_name: 'Martin Brower', primary_vdr: '1042', mid_range_yield: 91.6,
      recipe_item: 1, current_upt: 3.14, // real API sends 1/0, not true/'Y' -- dispatch #184's own captured sample
      menu_items: [{ item_number: '5001', item_name: 'HAMBURGER', recipe_serving_factor: 1, on_pos: 'Y' }],
      menu_item_combos: [{ main_item_number: '5001', combo_item_number: '9001', quantity: 1 }],
      upt_hist: [{ dt: 'July 2019', price: 2.98 }],
    };
    const m = mapRawItemInfo(detail);
    expect(m.wrin).toBe('00005-086');
    expect(m.descr).toBe('100% PURE BEEF');
    expect(m.invtyCategoryType).toBe('Food');
    expect(m.caseQty).toBe(40);
    expect(m.latestCasePrice).toBeCloseTo(62.15);
    expect(m.casePriceAvg).toBeCloseTo(61.02);
    expect(m.primaryVdrName).toBe('Martin Brower');
    expect(m.primaryVdr).toBe('1042');
    expect(m.midRangeYield).toBeCloseTo(91.6);
    expect(m.recipeItem).toBe(true);
    expect(m.currentUpt).toBeCloseTo(3.14);
    expect(m.menuItems).toHaveLength(1);
    expect(m.menuItems[0].recipe_serving_factor).toBe(1);
    expect(m.menuItemCombos).toHaveLength(1);
    expect(m.menuItemCombos[0].main_item_number).toBe('5001');
    expect(m.uptHist).toHaveLength(1);
  });

  it('defaults missing arrays/fields safely (an item with no combos, no history)', () => {
    const m = mapRawItemInfo({ full_wrin: '00029-009', long_desc: 'SALT/NON-IODIZED' });
    expect(m.menuItems).toEqual([]);
    expect(m.menuItemCombos).toEqual([]);
    expect(m.uptHist).toEqual([]);
    expect(m.recipeItem).toBe(false);
    expect(m.caseQty).toBeNull();
    expect(m.primaryVdr).toBeNull();
  });
});

describe('mapMenuItems', () => {
  it('splits "{item_number} - {description}" into real fields (dispatch #186)', () => {
    const rows = [
      { data: 4194793, value: '1 - Hamburger' },
      { data: 4195010, value: '10 - McRib' },
      { data: 4227570, value: '17 - 2 Southern Style Ckn' }, // description itself starts with a digit
      { data: 5895959, value: '70 - Do Not Use' },
    ];
    const m = mapMenuItems(rows);
    expect(m).toHaveLength(4);
    expect(m[0]).toEqual({ storeMenuitemId: 4194793, itemNumber: 1, description: 'Hamburger', value: '1 - Hamburger' });
    expect(m[1].itemNumber).toBe(10);
    expect(m[1].description).toBe('McRib');
    // A description that itself leads with digits must not truncate the parse early.
    expect(m[2].itemNumber).toBe(17);
    expect(m[2].description).toBe('2 Southern Style Ckn');
    expect(m[3].itemNumber).toBe(70);
    expect(m[3].description).toBe('Do Not Use');
  });

  it('keeps the raw value and nulls the parsed fields on an unrecognized shape, rather than dropping the row', () => {
    const m = mapMenuItems([{ data: 999, value: 'no dash here' }, { data: 1000, value: null }]);
    expect(m).toHaveLength(2);
    expect(m[0].itemNumber).toBeNull();
    expect(m[0].description).toBeNull();
    expect(m[0].value).toBe('no dash here');
    expect(m[1].value).toBe('');
  });

  it('drops rows with no id and defaults on an empty/missing response', () => {
    expect(mapMenuItems([{ value: '1 - Hamburger' }])).toEqual([]);
    expect(mapMenuItems([])).toEqual([]);
    expect(mapMenuItems(undefined)).toEqual([]);
  });

  it('matches every one of the 5,466 rows in the real owner-captured sample (store 3708)', () => {
    // memory/captures/menu-items-list-2026-08-28.json -- confirms the regex holds on the full
    // real response, not just the handful of hand-picked rows above.
    const capture = JSON.parse(
      readFileSync(join(process.cwd(), 'memory/captures/menu-items-list-2026-08-28.json'), 'utf8'),
    );
    const m = mapMenuItems(capture);
    expect(m).toHaveLength(5466);
    expect(m.filter(r => r.itemNumber == null)).toHaveLength(0);
    const ids = new Set(m.map(r => r.storeMenuitemId));
    expect(ids.size).toBe(5466); // storeMenuitemId is 1:1 unique, per the dispatch's own finding
  });
});

describe('mapMenuItemActivity', () => {
  it('extracts the per-day counts from the getMenuItemActivity wrapper (dispatch #193, dispatch #185 sample)', () => {
    const resp = { currentBusinessTime: '06:06', getMenuItemActivity: [
      { date_range: '2026-08-28', activity: 12, sold: 10, emp_meal: 1, mgr_meal: 0, waste: 1, promo: 0, free_choice_qty: 0, datetime_range: 'Fri - 08/28/2026 | 00:00 to 23:45' },
    ] };
    const [row] = mapMenuItemActivity(resp);
    expect(row.dateRange).toBe('2026-08-28');
    expect(row.activity).toBe(12);
    expect(row.sold).toBe(10);
    expect(row.empMeal).toBe(1);
    expect(row.waste).toBe(1);
  });
  it('defaults safely on an empty/missing response', () => {
    expect(mapMenuItemActivity({})).toEqual([]);
    expect(mapMenuItemActivity(undefined)).toEqual([]);
  });
});

describe('mapMenuItemActivityCost', () => {
  it('extracts food/paper/total cost from the flat response (dispatch #193, dispatch #185 sample)', () => {
    const resp = { food_cost: 0.6292658241696025, paper_cost: 0.015955, total_cost: 0.6452208241696026, last_close_business_date: '2026-08-27' };
    const m = mapMenuItemActivityCost(resp);
    expect(m.foodCost).toBeCloseTo(0.6292658241696025);
    expect(m.paperCost).toBeCloseTo(0.015955);
    expect(m.totalCost).toBeCloseTo(0.6452208241696026);
    expect(m.lastCloseBusinessDate).toBe('2026-08-27');
  });
  it('defaults missing fields to null rather than 0 (0 is a real, distinct food cost value)', () => {
    const m = mapMenuItemActivityCost({});
    expect(m.foodCost).toBeNull();
    expect(m.paperCost).toBeNull();
    expect(m.totalCost).toBeNull();
  });
});
