// @ts-nocheck
// The Ledger (owner request 2026-11-07/08) — pure engine tests. Uses real seeded loc ids from
// src/constants.js's DEF_SETTINGS.operators so operatorStores() exercises the real live-or-seed
// group map, not a parallel fixture.
import { describe, it, expect } from 'vitest';
import {
  operatorStores, operatorRegions, distanceBetweenRegions, operatorPeerComparison, rankNeedsAttention,
} from '../engine/operator-ledger.js';

// Real Ryan Thorley stores (src/constants.js): 3708/24471 (OK, Ardmore), 10034 (FL, Bonifay).
// Real Gary Mornhinweg store: 5183 (OK, Chickasha).
function store(loc, over) {
  return { loc, name: loc, hasData: true, sales: 10000, vsLYSales: 5, laborPct: 0.25, smgOsat: 90,
    severity: 'GREEN', flags: [], ...over };
}

describe('operatorStores', () => {
  it('returns only the real stores belonging to the named operator group', () => {
    const stores = [store('3708'), store('5183'), store('10034')];
    const ryan = operatorStores(stores, 'Ryan Thorley');
    expect(ryan.map(s => s.loc).sort()).toEqual(['10034', '3708']);
  });
  it('returns nothing for an unrecognized operator group, never a guess', () => {
    expect(operatorStores([store('3708')], 'Not A Real Operator')).toEqual([]);
  });
});

describe('operatorRegions', () => {
  it('groups by each store\'s own real state, never one blended region', () => {
    const stores = [store('3708'), store('24471'), store('10034')]; // 2 OK, 1 FL
    const regions = operatorRegions(stores);
    const byState = Object.fromEntries(regions.map(r => [r.state, r]));
    expect(byState.OK.storeCount).toBe(2);
    expect(byState.FL.storeCount).toBe(1);
  });
  it('a single-state operator gets exactly one region', () => {
    const regions = operatorRegions([store('3708'), store('24471')]);
    expect(regions).toHaveLength(1);
    expect(regions[0].state).toBe('OK');
  });
  it('dollar-weights each region\'s own vs-LY independently (never averages across regions)', () => {
    const stores = [
      store('3708', { sales: 100000, vsLYSales: 10 }),
      store('24471', { sales: 10000, vsLYSales: 10 }),
      store('10034', { sales: 50000, vsLYSales: -20 }),
    ];
    const regions = operatorRegions(stores);
    const ok = regions.find(r => r.state === 'OK');
    // Both OK stores share the same 10% vsLY, so OK's rollup must also read exactly 10%,
    // unaffected by the FL region's own, very different number.
    expect(ok.rollup.vsLYPct).toBeCloseTo(10, 5);
  });
});

describe('distanceBetweenRegions', () => {
  it('returns a real, positive straight-line distance for exactly 2 regions', () => {
    const regions = operatorRegions([store('3708'), store('10034')]);
    const mi = distanceBetweenRegions(regions);
    expect(mi).toBeGreaterThan(400); // OK<->FL panhandle is genuinely several hundred miles
    expect(mi).toBeLessThan(1500);
  });
  it('returns null for a single-region operator — nothing to compare', () => {
    const regions = operatorRegions([store('3708'), store('24471')]);
    expect(distanceBetweenRegions(regions)).toBeNull();
  });
});

describe('operatorPeerComparison', () => {
  it('ranks every real operator with real stores, flags the viewer, excludes operators with none', () => {
    const stores = [
      store('3708', { vsLYSales: 2 }),   // Ryan Thorley
      store('5183', { vsLYSales: 8 }),   // Gary Mornhinweg
    ];
    const peers = operatorPeerComparison(stores, 'Ryan Thorley');
    const names = peers.map(p => p.operator);
    expect(names).toContain('Ryan Thorley');
    expect(names).toContain('Gary Mornhinweg');
    // Operators with zero real stores in this (test) data set don't appear as a fabricated 0%.
    expect(peers.every(p => p.storeCount > 0)).toBe(true);
    expect(peers.find(p => p.operator === 'Ryan Thorley').isViewer).toBe(true);
    expect(peers.find(p => p.operator === 'Gary Mornhinweg').isViewer).toBe(false);
    // Gary's higher vsLY should rank him first.
    expect(peers[0].operator).toBe('Gary Mornhinweg');
  });
});

describe('rankNeedsAttention re-export', () => {
  it('is the same function The Patch already uses — no second implementation', () => {
    const ranked = rankNeedsAttention([store('3708', { severity: 'RED', flags: [{ headline: 'x' }] })]);
    expect(ranked[0].loc).toBe('3708');
  });
});
