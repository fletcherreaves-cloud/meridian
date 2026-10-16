// Reports redesign Phase 5 -- engine/item-velocity.js
import { describe, it, expect } from 'vitest';
import { buildItemVelocityReport } from '../engine/item-velocity.js';

const D = (d) => new Date(2026, 9, 1 + d); // Oct 1, 2026 + d days

describe('buildItemVelocityReport', () => {
  const range = { s: '2026-10-01', e: '2026-10-10' }; // 10 days, midpoint between Oct 5/6

  const ds = {
    pmixRows: [
      // Big Mac (code '1') -- flat volume both halves, no trend
      ...[0, 1, 2, 3, 4].map(d => ({ loc: '0003708', date: D(d), item: '1', desc: 'Big Mac', price: 5, soldQty: 20 })),
      ...[5, 6, 7, 8, 9].map(d => ({ loc: '0003708', date: D(d), item: '1', desc: 'Big Mac', price: 5, soldQty: 20 })),
      // Fries (code '2') -- trending up: 10/day first half, 30/day second half
      ...[0, 1, 2, 3, 4].map(d => ({ loc: '0003708', date: D(d), item: '2', desc: 'Fries', price: 3, soldQty: 10 })),
      ...[5, 6, 7, 8, 9].map(d => ({ loc: '0003708', date: D(d), item: '2', desc: 'Fries', price: 3, soldQty: 30 })),
      // McFlurry (code '3') -- low volume, a different store (loc 0005183, zero-padded)
      { loc: '0005183', date: D(0), item: '3', desc: 'McFlurry', price: 4, soldQty: 2 },
    ],
  };

  it('returns [] when range is missing', () => {
    expect(buildItemVelocityReport(ds, { locs: ['3708'], range: null })).toEqual([]);
  });

  it('aggregates total units/$ per item across the range, sorted by volume descending', () => {
    const rows = buildItemVelocityReport(ds, { locs: ['3708'], range });
    // Big Mac and Fries both total 200 units -- a tie, so this also confirms the sort is
    // stable (Big Mac's rows are inserted first in the fixture, so it stays first).
    expect(rows.map(r => r.item)).toEqual(['1', '2']);
    const bigMac = rows.find(r => r.item === '1');
    expect(bigMac.label).toBe('Big Mac');
    expect(bigMac.totalSoldQty).toBe(200); // 20 * 10 days
    expect(bigMac.totalRevenue).toBe(1000); // 200 * $5
  });

  it('computes a real trend split (first half vs second half, normalized per day)', () => {
    const rows = buildItemVelocityReport(ds, { locs: ['3708'], range });
    const bigMac = rows.find(r => r.item === '1');
    const fries = rows.find(r => r.item === '2');
    expect(bigMac.trendPct).toBeCloseTo(0, 1); // flat 20/day both halves
    expect(fries.trendPct).toBeCloseTo(200, 1); // 10/day -> 30/day = +200%
  });

  it('normalizes zero-padded qsr_product_mix loc codes against unpadded locs', () => {
    const rows = buildItemVelocityReport(ds, { locs: ['5183'], range });
    expect(rows).toHaveLength(1);
    expect(rows[0].item).toBe('3');
    expect(rows[0].totalSoldQty).toBe(2);
  });

  it('aggregates across every store when locs is empty (district-wide)', () => {
    const rows = buildItemVelocityReport(ds, { locs: [], range });
    expect(rows.map(r => r.item).sort()).toEqual(['1', '2', '3']);
  });

  it('caps the result at topN', () => {
    const rows = buildItemVelocityReport(ds, { locs: [], range, topN: 1 });
    expect(rows).toHaveLength(1);
    expect(rows[0].item).toBe('1'); // highest volume
  });
});
