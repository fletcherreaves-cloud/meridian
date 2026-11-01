// @ts-nocheck
// Owner req (2026-11-01): "a selected group of restaurants of user choice" -- an ad hoc,
// saveable, named group of stores, modeled on QSRSoft's own "Patches" multi-select picker.
// src/engine/location-groups.js owns the pure CRUD + the grouping math that replaces the three
// fixed Supervisor/Operator/Organization Performance Summary sections in store-analytics.js's
// Enterprise Overview with one selectable grouping.
import { describe, it, expect } from 'vitest';
import {
  newGroupId, addLocationGroup, updateLocationGroup, removeLocationGroup,
  buildGroupSections, summarizeGroup,
} from '../engine/location-groups.js';

describe('newGroupId', () => {
  it('produces distinct ids on successive calls', () => {
    const ids = new Set(Array.from({ length: 20 }, () => newGroupId()));
    expect(ids.size).toBe(20);
  });
});

describe('addLocationGroup / updateLocationGroup / removeLocationGroup', () => {
  it('addLocationGroup appends a new group with an id, trimmed name, and stringified locs, without mutating the input array', () => {
    const before = [];
    const after = addLocationGroup(before, { name: '  MRG Restaurants  ', locs: [3708, '6178'] });
    expect(before).toEqual([]); // input untouched
    expect(after).toHaveLength(1);
    expect(after[0].name).toBe('MRG Restaurants');
    expect(after[0].locs).toEqual(['3708', '6178']);
    expect(after[0].id).toBeTruthy();
    expect(after[0].createdAt).toBeTruthy();
  });

  it('addLocationGroup falls back to "Untitled Group" for a blank name', () => {
    const after = addLocationGroup([], { name: '   ', locs: ['3708'] });
    expect(after[0].name).toBe('Untitled Group');
  });

  it('updateLocationGroup replaces name/locs on the matching id only, bumps updatedAt, leaves other groups untouched', () => {
    const g1 = { id: 'g1', name: 'A', locs: ['3708'], createdAt: 't0', updatedAt: 't0' };
    const g2 = { id: 'g2', name: 'B', locs: ['6178'], createdAt: 't0', updatedAt: 't0' };
    const after = updateLocationGroup([g1, g2], 'g1', { name: 'A2', locs: ['3708', '5183'] });
    expect(after[0]).toMatchObject({ id: 'g1', name: 'A2', locs: ['3708', '5183'] });
    expect(after[0].updatedAt).not.toBe('t0');
    expect(after[1]).toEqual(g2); // untouched
  });

  it('removeLocationGroup drops only the matching id', () => {
    const g1 = { id: 'g1', name: 'A', locs: [] };
    const g2 = { id: 'g2', name: 'B', locs: [] };
    expect(removeLocationGroup([g1, g2], 'g1')).toEqual([g2]);
  });
});

// Store fixtures use REAL loc ids from constants.js's INV_ORG_COORDS/DEF_SETTINGS so
// operator/patch/organization grouping exercises the real live resolvers, not a stand-in map --
// 3708/6972/24471/32525 are all Robert Spencer (OK/MCDOK, operator Ryan Thorley); 6178/6838 are
// both Brad Denley (FL/Emerald Arches, operator Jacob Thorley).
function store(loc, overrides = {}) {
  return { loc, name: 'Store ' + loc, pSales: 10000, opsScore: 80, p: { t2w: 0.05 }, ...overrides };
}

describe('buildGroupSections', () => {
  const stores = [
    store('3708', { pSales: 10000, opsScore: 80, p: { t2w: 0.04 } }),
    store('6972', { pSales: 20000, opsScore: 90, p: { t2w: 0.06 } }),
    store('6178', { pSales: 5000, opsScore: 70, p: { t2w: -0.02 } }),
  ];

  it("'location' mode returns one group per store, each containing just that store", () => {
    const sections = buildGroupSections('location', stores, {});
    expect(sections).toHaveLength(3);
    expect(sections.find(s => s.key === '3708').stores).toHaveLength(1);
  });

  it("'patch' mode groups by the live supervisorGroupsLive map passed in, dropping empty groups", () => {
    const sections = buildGroupSections('patch', stores, {
      supervisorGroupsLive: { 'Robert Spencer': ['3708', '6972'], 'Brad Denley': ['6178'], 'Empty Patch': ['99999'] },
    });
    const names = sections.map(s => s.name).sort();
    expect(names).toEqual(['Brad Denley', 'Robert Spencer']); // Empty Patch dropped (no matching stores)
    expect(sections.find(s => s.name === 'Robert Spencer').stores).toHaveLength(2);
  });

  it("'operator' mode groups by the live operatorGroupsFn(loc) resolver", () => {
    const opMap = { '3708': 'Ryan Thorley', '6972': 'Ryan Thorley', '6178': 'Jacob Thorley' };
    const sections = buildGroupSections('operator', stores, { operatorGroupsFn: (loc) => opMap[loc] || null });
    const ryan = sections.find(s => s.name === 'Ryan Thorley');
    expect(ryan.stores.map(s => s.loc).sort()).toEqual(['3708', '6972']);
    expect(sections.find(s => s.name === 'Jacob Thorley').stores).toHaveLength(1);
  });

  it("'organization' mode splits by getStoreOrgFn(loc), labeling MCDOK/Emerald Arches, and drops an org with no matching stores", () => {
    const orgMap = { '3708': 'mcdok', '6972': 'mcdok', '6178': 'emerald' };
    const sections = buildGroupSections('organization', stores, { getStoreOrgFn: (loc) => orgMap[loc] });
    expect(sections).toHaveLength(2);
    const mcdok = sections.find(s => s.key === 'mcdok');
    expect(mcdok.name).toBe('MCDOK — Oklahoma');
    expect(mcdok.stores).toHaveLength(2);
    expect(sections.find(s => s.key === 'emerald').name).toBe('Emerald Arches — Florida');
  });

  it("'organization' drops a side with zero stores instead of rendering an empty card", () => {
    const sections = buildGroupSections('organization', stores, { getStoreOrgFn: () => 'mcdok' });
    expect(sections).toHaveLength(1);
    expect(sections[0].key).toBe('mcdok');
  });

  it("'custom' mode resolves each saved group's locs against the real store list", () => {
    const customGroups = [
      { id: 'g1', name: 'MRG Restaurants', locs: ['3708', '6178'] },
      { id: 'g2', name: 'Ghost Group', locs: ['99999'] }, // no matching store -- still returned, 0 stores
    ];
    const sections = buildGroupSections('custom', stores, { customGroups });
    expect(sections).toHaveLength(2);
    expect(sections.find(s => s.key === 'g1').stores.map(s => s.loc).sort()).toEqual(['3708', '6178']);
    expect(sections.find(s => s.key === 'g2').stores).toHaveLength(0);
  });

  it('an unknown mode returns an empty array rather than throwing', () => {
    expect(buildGroupSections('bogus', stores, {})).toEqual([]);
  });

  it('non-numeric-loc stores (e.g. a district-aggregate pseudo-row) are excluded from every mode', () => {
    const withAgg = [...stores, { loc: 'district-total', pSales: 999999 }];
    const sections = buildGroupSections('location', withAgg, {});
    expect(sections.some(s => s.key === 'district-total')).toBe(false);
  });
});

describe('summarizeGroup', () => {
  it('computes n/totalSales/avgOps/avgTrend over a group of stores', () => {
    const out = summarizeGroup([
      store('a', { pSales: 100, opsScore: 80, p: { t2w: 0.10 } }),
      store('b', { pSales: 300, opsScore: 60, p: { t2w: 0.02 } }),
    ]);
    expect(out.n).toBe(2);
    expect(out.totalSales).toBe(400);
    expect(out.avgOps).toBe(70);
    expect(out.avgTrend).toBeCloseTo(0.06);
  });

  it('returns null avgOps/avgTrend (not NaN or 0) for an empty group', () => {
    const out = summarizeGroup([]);
    expect(out.n).toBe(0);
    expect(out.totalSales).toBe(0);
    expect(out.avgOps).toBeNull();
    expect(out.avgTrend).toBeNull();
  });

  it('avgTrend excludes stores with no p.t2w reading rather than treating a missing trend as 0', () => {
    const out = summarizeGroup([
      store('a', { p: { t2w: 0.10 } }),
      store('b', { p: {} }), // no t2w -- must not drag the average toward 0
    ]);
    expect(out.avgTrend).toBeCloseTo(0.10);
  });
});
