import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parsePMixData, ensureParsersXLSXReady } from '../parsers/index.js';

// #302 — parsePMixData summed the Product Mix export as if every row were a flat leaf.
// The real export (Product_Mix_20260815.xlsx, measured by hand and posted to #302) is
// hierarchical: a multi-price Menu Item # gets a SUBTOTAL row (Units Sold already summed
// across its price tiers) immediately followed by one DETAIL row per price point, and the
// sheet ends with a grand-total row (empty Desc). Naive summing measured 306,015 vs a true
// 204,708 (1.495x overstatement) on that file.
//
// This fixture reproduces the exact Hamburger group from the real export (documented in
// memory/qsrsoft-report-catalog.md) plus a single-price item and the grand-total row, to
// prove the parser's hierarchy handling on real, measured numbers. It does not reproduce
// the full 4,544-row file (not available in this environment) — the full-file 204,708 vs
// 306,015 reconciliation still needs the raw export to verify end-to-end.
await ensureParsersXLSXReady();

function wbFromAOA(aoa, sheetName = 'Product Mix 2026-08-15') {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return wb;
}

const HEADER = ['Menu Item #', 'Desc', 'Price', 'Units Sold', 'Disc Qty', 'Offer Discount $', 'Family Group'];

// Real Hamburger group from the measured export: subtotal 385 = sum of the 8 detail rows.
const HAMBURGER_GROUP = [
  [1, 'Hamburger', '$1.79 - $2.59', 385, 6, 4.50, 'Regular Entree'], // subtotal (parent)
  [1, 'Hamburger', '$1.89', 134, 2, 1.50, 'Regular Entree'],
  [1, 'Hamburger', '$1.99', 130, 2, 1.50, 'Regular Entree'],
  [1, 'Hamburger', '$1.79', 47, 1, 0.50, 'Regular Entree'],
  [1, 'Hamburger', '$2.49', 31, 1, 1.00, 'Regular Entree'],
  [1, 'Hamburger', '$2.39', 28, 0, 0, 'Regular Entree'],
  [1, 'Hamburger', '$2.59', 11, 0, 0, 'Regular Entree'],
  [1, 'Hamburger', '$2.29', 2, 0, 0, 'Regular Entree'],
  [1, 'Hamburger', '$2.32', 2, 0, 0, 'Regular Entree'],
];
// Single-price item: no separate subtotal row, the lone row is the true figure.
const SINGLE_PRICE_ITEM = [167, 'Chicken Pack', '$5.49', 42, 3, 2.10, 'Fries'];
// Grand-total row: empty Desc, nonsense price, lands after the last item's rows.
const GRAND_TOTAL_ROW = [1, null, '$24.89', 9999, 0, 0, null];

describe('parsePMixData — hierarchy (#302)', () => {
  const aoa = [HEADER, ...HAMBURGER_GROUP, SINGLE_PRICE_ITEM, GRAND_TOTAL_ROW];
  const pmx = parsePMixData(wbFromAOA(aoa));

  it('does not error on a fully-columned export', () => {
    expect(pmx.error).toBeUndefined();
  });

  it('keeps only the subtotal row for a multi-price item, not the sum of subtotal+detail', () => {
    const hamburger = pmx.rows.find(r => r.item === 1);
    expect(hamburger.units).toBe(385); // NOT 770 (385 subtotal + 385 summed detail)
  });

  it('keeps a single-price item as its own lone row', () => {
    const chicken = pmx.rows.find(r => r.item === 167);
    expect(chicken.units).toBe(42);
  });

  it('drops the grand-total row entirely (empty Desc)', () => {
    // Only 2 real items: Hamburger (1) and Chicken Pack (167) — the grand-total row's
    // units (9999) must not appear anywhere in the output.
    expect(pmx.rows.length).toBe(2);
    const totalUnits = pmx.rows.reduce((a, r) => a + r.units, 0);
    expect(totalUnits).toBe(385 + 42);
  });

  it('aggregates byFamily using the deduped (true) units, not the naive sum', () => {
    expect(pmx.byFamily['Regular Entree'].units).toBe(385);
    expect(pmx.byFamily['Fries'].units).toBe(42);
  });
});

describe('parsePMixData — column validation, fail loudly instead of silent defaults (#302)', () => {
  it('errors when Family Group is absent (default export) instead of defaulting to "Other"', () => {
    const header = ['Menu Item #', 'Desc', 'Price', 'Units Sold', 'Disc Qty', 'Offer Discount $'];
    const pmx = parsePMixData(wbFromAOA([header, [1, 'Hamburger', '$1.89', 134, 2, 1.50]]));
    expect(pmx.error).toMatch(/Family Group/);
    expect(pmx.rows).toEqual([]);
  });

  it('errors when Disc Qty / Offer Discount $ are absent instead of defaulting to 0', () => {
    const header = ['Menu Item #', 'Desc', 'Price', 'Units Sold', 'Family Group'];
    const pmx = parsePMixData(wbFromAOA([header, [1, 'Hamburger', '$1.89', 134, 'Regular Entree']]));
    expect(pmx.error).toMatch(/Disc Qty/);
    expect(pmx.error).toMatch(/Offer Discount/);
  });

  it('still parses correctly when every required column is present', () => {
    const pmx = parsePMixData(wbFromAOA([HEADER, SINGLE_PRICE_ITEM]));
    expect(pmx.error).toBeUndefined();
    expect(pmx.rows[0].units).toBe(42);
  });
});
