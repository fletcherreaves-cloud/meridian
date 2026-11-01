// @vitest-environment happy-dom
// @ts-nocheck
// Owner req (2026-11-01): custom saved location groups should be reachable "throughout the app"
// as a 6th LocationSelector scope, not just inside the new Performance Summary tile. This covers
// the additive extension: buildLocationHierarchy's new `groups` tier, locationSelectorLocs's new
// 'group' level, and LocationSelector's 'full' mode rendering a pill per saved group — all
// optional/backward compatible, so every existing caller that never passes customGroups is
// provably unaffected (first describe block below).
import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { buildLocationHierarchy, locationSelectorLocs, LocationSelector } from '../components/PanelControls.js';

const STORES = [{ loc: '3708' }, { loc: '6178' }, { loc: '5183' }];
const INV = {
  '3708': { state: 'OK', sup: 'Robert Spencer' },
  '6178': { state: 'FL', sup: 'Brad Denley' },
  '5183': { state: 'OK', sup: 'Krystiana Langford' },
};
const NAMES = { '3708': 'Ardmore', '6178': 'Chipley', '5183': 'Chickasha' };

describe('buildLocationHierarchy — backward compatibility (no customGroups passed)', () => {
  it('omitting customGroups entirely still returns a `groups` field, empty, and locs/states/patches unchanged', () => {
    const tree = buildLocationHierarchy(STORES, INV, NAMES);
    expect(tree.groups).toEqual([]);
    expect(tree.locs).toEqual(['3708', '5183', '6178']);
    expect(tree.states.map(s => s.id).sort()).toEqual(['FL', 'OK']);
  });
});

describe('buildLocationHierarchy — customGroups tier', () => {
  it('exposes a saved group as a `groups` entry with its locs intact', () => {
    const tree = buildLocationHierarchy(STORES, INV, NAMES, [
      { id: 'g1', name: 'MRG Restaurants', locs: ['3708', '6178'] },
    ]);
    expect(tree.groups).toHaveLength(1);
    expect(tree.groups[0]).toMatchObject({ id: 'g1', label: 'MRG Restaurants' });
    expect(tree.groups[0].locs.sort()).toEqual(['3708', '6178']);
  });

  it('filters a saved group down to locs that are actually in `stores` (a stale/removed store doesn\'t leak through)', () => {
    const tree = buildLocationHierarchy(STORES, INV, NAMES, [
      { id: 'g1', name: 'Stale Group', locs: ['3708', '99999'] },
    ]);
    expect(tree.groups[0].locs).toEqual(['3708']);
  });

  it('drops a saved group entirely once none of its locs remain (rather than showing an empty pill)', () => {
    const tree = buildLocationHierarchy(STORES, INV, NAMES, [
      { id: 'g1', name: 'All Gone', locs: ['99999'] },
    ]);
    expect(tree.groups).toEqual([]);
  });
});

describe('locationSelectorLocs — group level', () => {
  const tree = buildLocationHierarchy(STORES, INV, NAMES, [
    { id: 'g1', name: 'MRG Restaurants', locs: ['3708', '6178'] },
  ]);
  it("resolves {level:'group', id} to that saved group's locs", () => {
    expect(locationSelectorLocs({ level: 'group', id: 'g1' }, tree).sort()).toEqual(['3708', '6178']);
  });
  it('an unknown group id resolves to an empty array, not a throw', () => {
    expect(locationSelectorLocs({ level: 'group', id: 'nope' }, tree)).toEqual([]);
  });
});

describe('LocationSelector (mode=full) renders a pill per saved group and fires onChange with level=group', () => {
  it('clicking a group pill calls onChange({level:"group", id})', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    let lastValue = null;
    act(() => {
      root.render(React.createElement(LocationSelector, {
        stores: STORES, invOrgCoords: INV, storeNames: NAMES,
        customGroups: [{ id: 'g1', name: 'MRG Restaurants', locs: ['3708', '6178'] }],
        value: { level: 'all', id: null },
        onChange: (v) => { lastValue = v; },
      }));
    });
    const pill = [...container.querySelectorAll('button')].find(b => b.textContent.includes('MRG Restaurants'));
    expect(pill).toBeTruthy();
    act(() => { pill.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(lastValue).toEqual({ level: 'group', id: 'g1' });
    act(() => { root.unmount(); });
    container.remove();
  });

  it('with no customGroups passed, no group pill renders at all (unaffected existing behavior)', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(React.createElement(LocationSelector, {
        stores: STORES, invOrgCoords: INV, storeNames: NAMES,
        value: { level: 'all', id: null }, onChange: () => {},
      }));
    });
    expect(container.textContent).not.toContain('🔧');
    act(() => { root.unmount(); });
    container.remove();
  });
});
