// @ts-nocheck
// views/inventory.js's invDist/invSameState/formatXferQty had zero test coverage despite being
// live -- they drive the Inventory Intelligence panel's cross-store transfer suggestions
// (same-state gate, distance, and the human-readable case/inner-pack quantity label).
import { describe, it, expect } from 'vitest';
import { invDist, invSameState, formatXferQty } from '../views/inventory.js';

// Real INV_ORG_COORDS seeds (constants.js): '3708' Ardmore OK, '6972' Seminole OK, '6178' Chipley FL.
describe('invDist', () => {
  it('is 0 for a store against itself', () => {
    expect(invDist('3708', '3708')).toBe(0);
  });

  it('returns a finite, positive mileage between two real OK stores', () => {
    const dist = invDist('3708', '6972');
    expect(Number.isFinite(dist)).toBe(true);
    expect(dist).toBeGreaterThan(0);
  });

  it('returns Infinity for an unknown loc', () => {
    expect(invDist('3708', '99999')).toBe(Infinity);
  });
});

describe('invSameState', () => {
  it('is true for two stores in the same state', () => {
    expect(invSameState('3708', '6972')).toBe(true); // both OK
  });

  it('is false for stores in different states', () => {
    expect(invSameState('3708', '6178')).toBe(false); // OK vs FL
  });

  it('is false when either loc is unknown', () => {
    expect(invSameState('3708', '99999')).toBe(false);
  });
});

describe('formatXferQty', () => {
  it('returns null for a quantity under half a case', () => {
    expect(formatXferQty(0.4, null, 'CS', 10)).toBeNull();
  });

  it('formats a whole-case quantity with no WRIN match (singular/plural)', () => {
    expect(formatXferQty(1, null, 'CS', 10)).toBe('1 case');
    expect(formatXferQty(2, null, 'CS', 10)).toBe('2 cases');
  });

  it('falls back to a half-case label when there is no full case and no WRIN match', () => {
    // upc = caseSize (10) since no WRIN master entry; halfEach = round(upc/2) = 5
    expect(formatXferQty(0.75, null, 'CS', 10)).toBe('½ case (5 EA)');
  });

  it('drops a sub-case remainder silently once a full case is present (real, not a bug)', () => {
    expect(formatXferQty(3.25, null, 'CS', 8)).toBe('3 cases');
  });

  it('uses the WRIN master entry\'s inner-pack breakdown and real unit label when matched', () => {
    // '00004-849': {ipu:6, ipc:6, upc:36, uom:'LB'} -- a real INV_MASTER entry.
    // rawQty=1.5 -> 1 full case + 0.5 remainder (18 of 36 each) -> 3 inner packs of 6 each = 18 LB.
    expect(formatXferQty(1.5, '00004-849', 'CS', null)).toBe('1 case + 3 inner packs (18 LB)');
  });

  it('uses the WRIN\'s ipu-derived half-case quantity when the remainder has no full inner pack', () => {
    // '00019-008': {ipu:1, ipc:75, upc:75, uom:'GAL'} -- only 1 inner pack per case, so any
    // partial-case remainder (remEach always < upc == ipc here) can never complete one, and the
    // half-case branch always fires. rawQty=0.5 -> remEach = round(0.5*75) = 38, fullIP = 0 ->
    // ipu=1>0 -> Math.round(upc/ipu) = Math.round(75/1) = 75.
    expect(formatXferQty(0.5, '00019-008', 'CS', null)).toBe('½ case (75 GAL)');
  });
});
