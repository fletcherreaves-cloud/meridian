// @vitest-environment happy-dom
// @ts-nocheck
// Owner req (2026-11-02): "I want to be able to multi-select any combination of locations for
// reporting and viewing." LocationSelector's existing value shape ({level:'all'|'state'|'patch'|
// 'store'|'group', id}) is inherently single-pick -- this adds an orthogonal `multi:true` prop
// that turns the control into an arbitrary-subset picker: {level:'all', id:null} (unchanged
// meaning) or {level:'multi', ids:[...]} -- an EXPLICIT loc list, length 0 included. Deliberately
// never collapses an empty `ids` back to 'all' (a report scoped to "nothing" and one scoped to
// "everything" are not the same thing) and never auto-infers "all" just because every individual
// store happens to be checked (same reasoning, the other direction).
import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { buildLocationHierarchy, locationSelectorLocs, LocationSelector } from '../components/PanelControls.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const STORES = [{ loc: '3708' }, { loc: '6178' }, { loc: '5183' }];
const INV = {
  '3708': { state: 'OK', sup: 'Robert Spencer' },
  '6178': { state: 'FL', sup: 'Brad Denley' },
  '5183': { state: 'OK', sup: 'Krystiana Langford' },
};
const NAMES = { '3708': 'Ardmore', '6178': 'Chipley', '5183': 'Chickasha' };

function mountRoot() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return { container, root: createRoot(container) };
}

describe('locationSelectorLocs -- multi level', () => {
  const tree = buildLocationHierarchy(STORES, INV, NAMES);

  it("resolves {level:'multi', ids} to that exact set, order from tree.locs", () => {
    expect(locationSelectorLocs({ level: 'multi', ids: ['6178', '3708'] }, tree)).toEqual(['6178', '3708']);
  });

  it('drops a stale id not present in tree.locs, rather than leaking it through', () => {
    expect(locationSelectorLocs({ level: 'multi', ids: ['3708', '99999'] }, tree)).toEqual(['3708']);
  });

  it('an empty ids array resolves to an empty array -- NOT all locs', () => {
    expect(locationSelectorLocs({ level: 'multi', ids: [] }, tree)).toEqual([]);
  });

  it("{level:'all'} still resolves to every loc, unaffected by the new level", () => {
    expect(locationSelectorLocs({ level: 'all', id: null }, tree)).toEqual(tree.locs);
  });
});

describe('LocationSelector multi:true, pills variant', () => {
  it('clicking an unselected store pill adds it to ids', () => {
    const { container, root } = mountRoot();
    let last = null;
    act(() => {
      root.render(React.createElement(LocationSelector, {
        stores: STORES, invOrgCoords: INV, storeNames: NAMES, multi: true,
        value: { level: 'multi', ids: [] }, onChange: (v) => { last = v; },
      }));
    });
    const pill = [...container.querySelectorAll('button')].find((b) => b.textContent.includes('Ardmore'));
    expect(pill).toBeTruthy();
    act(() => { pill.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(last).toEqual({ level: 'multi', ids: ['3708'] });
    act(() => { root.unmount(); }); container.remove();
  });

  it('clicking an already-selected store pill removes it from ids', () => {
    const { container, root } = mountRoot();
    let last = null;
    act(() => {
      root.render(React.createElement(LocationSelector, {
        stores: STORES, invOrgCoords: INV, storeNames: NAMES, multi: true,
        value: { level: 'multi', ids: ['3708', '6178'] }, onChange: (v) => { last = v; },
      }));
    });
    const pill = [...container.querySelectorAll('button')].find((b) => b.textContent.includes('Ardmore'));
    act(() => { pill.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(last).toEqual({ level: 'multi', ids: ['6178'] });
    act(() => { root.unmount(); }); container.remove();
  });

  it('a State pill bulk-adds every loc in that state when not all are selected yet', () => {
    const { container, root } = mountRoot();
    let last = null;
    // OK has 2 locs here (3708, 5183); only one pre-selected.
    act(() => {
      root.render(React.createElement(LocationSelector, {
        stores: STORES, invOrgCoords: INV, storeNames: NAMES, multi: true,
        value: { level: 'multi', ids: ['3708'] }, onChange: (v) => { last = v; },
      }));
    });
    const okPill = [...container.querySelectorAll('button')].find((b) => b.textContent === 'OK');
    expect(okPill).toBeTruthy();
    act(() => { okPill.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(last.level).toBe('multi');
    expect(last.ids.sort()).toEqual(['3708', '5183']);
    act(() => { root.unmount(); }); container.remove();
  });

  it('clicking that same State pill again (now fully selected) bulk-removes the whole state', () => {
    const { container, root } = mountRoot();
    let last = null;
    act(() => {
      root.render(React.createElement(LocationSelector, {
        stores: STORES, invOrgCoords: INV, storeNames: NAMES, multi: true,
        value: { level: 'multi', ids: ['3708', '5183', '6178'] }, onChange: (v) => { last = v; },
      }));
    });
    const okPill = [...container.querySelectorAll('button')].find((b) => b.textContent === 'OK');
    act(() => { okPill.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(last).toEqual({ level: 'multi', ids: ['6178'] });
    act(() => { root.unmount(); }); container.remove();
  });

  it('the "All Locations" pill switches to {level:"all"}, not an exhaustive ids list', () => {
    const { container, root } = mountRoot();
    let last = null;
    act(() => {
      root.render(React.createElement(LocationSelector, {
        stores: STORES, invOrgCoords: INV, storeNames: NAMES, multi: true,
        value: { level: 'multi', ids: ['3708'] }, onChange: (v) => { last = v; },
      }));
    });
    const allPill = [...container.querySelectorAll('button')].find((b) => b.textContent === 'All Locations');
    act(() => { allPill.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(last).toEqual({ level: 'all', id: null });
    act(() => { root.unmount(); }); container.remove();
  });

  it('the "None" pill clears to an explicit empty ids list, not {level:"all"}', () => {
    const { container, root } = mountRoot();
    let last = null;
    act(() => {
      root.render(React.createElement(LocationSelector, {
        stores: STORES, invOrgCoords: INV, storeNames: NAMES, multi: true,
        value: { level: 'all', id: null }, onChange: (v) => { last = v; },
      }));
    });
    const nonePill = [...container.querySelectorAll('button')].find((b) => b.textContent === 'None');
    act(() => { nonePill.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(last).toEqual({ level: 'multi', ids: [] });
    act(() => { root.unmount(); }); container.remove();
  });

  it("mode:'store' hides the State/Patch bulk-toggle row (no hierarchy worth bulk-toggling)", () => {
    const { container, root } = mountRoot();
    act(() => {
      root.render(React.createElement(LocationSelector, {
        stores: STORES, invOrgCoords: INV, storeNames: NAMES, multi: true, mode: 'store',
        value: { level: 'multi', ids: [] }, onChange: () => {},
      }));
    });
    const buttons = [...container.querySelectorAll('button')].map((b) => b.textContent);
    expect(buttons).not.toContain('OK');
    expect(buttons).not.toContain('FL');
    expect(buttons.some((t) => t.includes('Ardmore'))).toBe(true);
    act(() => { root.unmount(); }); container.remove();
  });
});

describe('LocationSelector multi:true, dropdown variant', () => {
  it('renders a native multiple <select> of individual stores, grouped by state', () => {
    const { container, root } = mountRoot();
    act(() => {
      root.render(React.createElement(LocationSelector, {
        stores: STORES, invOrgCoords: INV, storeNames: NAMES, multi: true, variant: 'dropdown',
        value: { level: 'multi', ids: [] }, onChange: () => {},
      }));
    });
    const sel = container.querySelector('select');
    expect(sel).toBeTruthy();
    expect(sel.multiple).toBe(true);
    const optgroups = [...sel.querySelectorAll('optgroup')].map((g) => g.label).sort();
    expect(optgroups).toEqual(['FL', 'OK']);
    act(() => { root.unmount(); }); container.remove();
  });

  it('selecting multiple options fires onChange with every selected loc', () => {
    const { container, root } = mountRoot();
    let last = null;
    act(() => {
      root.render(React.createElement(LocationSelector, {
        stores: STORES, invOrgCoords: INV, storeNames: NAMES, multi: true, variant: 'dropdown',
        value: { level: 'multi', ids: [] }, onChange: (v) => { last = v; },
      }));
    });
    const sel = container.querySelector('select');
    const opt3708 = [...sel.querySelectorAll('option')].find((o) => o.value === '3708');
    const opt6178 = [...sel.querySelectorAll('option')].find((o) => o.value === '6178');
    act(() => {
      opt3708.selected = true;
      opt6178.selected = true;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(last.level).toBe('multi');
    expect(last.ids.sort()).toEqual(['3708', '6178']);
    act(() => { root.unmount(); }); container.remove();
  });

  it('the "+ Add group…" quick-add select bulk-toggles a whole state at once, same as the pills bulk row', () => {
    const { container, root } = mountRoot();
    let last = null;
    act(() => {
      root.render(React.createElement(LocationSelector, {
        stores: STORES, invOrgCoords: INV, storeNames: NAMES, multi: true, variant: 'dropdown',
        value: { level: 'multi', ids: [] }, onChange: (v) => { last = v; },
      }));
    });
    const selects = [...container.querySelectorAll('select')];
    const quickAdd = selects.find((s) => [...s.options].some((o) => o.value === 'state:OK'));
    expect(quickAdd, '+ Add group… select with a state:OK option not found').toBeTruthy();
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
      setter.call(quickAdd, 'state:OK');
      quickAdd.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(last.level).toBe('multi');
    expect(last.ids.sort()).toEqual(['3708', '5183']); // both OK locs in this fixture
    act(() => { root.unmount(); }); container.remove();
  });

  it("mode:'store' omits the quick-add group select (no state/patch hierarchy to bulk-toggle)", () => {
    const { container, root } = mountRoot();
    act(() => {
      root.render(React.createElement(LocationSelector, {
        stores: STORES, invOrgCoords: INV, storeNames: NAMES, multi: true, variant: 'dropdown', mode: 'store',
        value: { level: 'multi', ids: [] }, onChange: () => {},
      }));
    });
    const selects = [...container.querySelectorAll('select')];
    expect(selects.length).toBe(1); // just the store checklist, no quick-add select
    act(() => { root.unmount(); }); container.remove();
  });

  it('the "All" button beside the dropdown switches to {level:"all"}', () => {
    const { container, root } = mountRoot();
    let last = null;
    act(() => {
      root.render(React.createElement(LocationSelector, {
        stores: STORES, invOrgCoords: INV, storeNames: NAMES, multi: true, variant: 'dropdown',
        value: { level: 'multi', ids: ['3708'] }, onChange: (v) => { last = v; },
      }));
    });
    const allBtn = [...container.querySelectorAll('button')].find((b) => b.textContent === 'All');
    act(() => { allBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(last).toEqual({ level: 'all', id: null });
    act(() => { root.unmount(); }); container.remove();
  });
});
