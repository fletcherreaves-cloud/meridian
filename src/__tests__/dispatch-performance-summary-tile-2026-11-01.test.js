// @vitest-environment happy-dom
// @ts-nocheck
// Owner req (2026-11-01), from a screenshot of the District View Enterprise Overview: "let's move
// the total company performance off of the individual location tiles under district tile view.
// Maybe give that a tile of its own that could be dynamically viewed by selecting the grouping to
// see whether one location, a patch, operator, state, organization or a selected group of
// restaurants of user choice." Replaces the three fixed Supervisor/Operator/Organization
// Performance Summary sections in store-analytics.js's StoreDash Enterprise Overview with one
// "📊 Performance Summary" tile that switches grouping via pills.
//
// Renders the REAL StoreDash consumer (not buildGroupSections in isolation — that's already
// covered by dispatch-location-groups-2026-11-01.test.js) per this repo's "would this
// verification still pass if the change were reverted" standing rule: a test that only calls the
// engine function could pass unchanged with the tile never wired into Overview's JSX.
//
// forecastRangeAsync settles synchronously (dispatch #208's own precedent — StoreDash's weekly-
// forecast effect is irrelevant here). loadCustomLocationGroups/saveCustomLocationGroups are
// mocked so this test never makes a real Supabase round trip (this sandbox has real
// VITE_SUPABASE_URL/ANON_KEY set).
import { describe, it, expect, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../engine/forecast.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, forecastRangeAsync: (loc, s, e, ds, settings, onPartial, onFinal) => { onFinal([]); } };
});

let savedGroups = null;
vi.mock('../lib/supabase.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    loadCustomLocationGroups: async () => [{ id: 'g1', name: 'MRG Restaurants', locs: ['3708', '6178'] }],
    saveCustomLocationGroups: async (groups) => { savedGroups = groups; return { saved: true }; },
  };
});

import { StoreDash } from '../views/store-analytics.js';

const NOOP = () => {};

// Real loc ids (INV_ORG_COORDS/DEF_SETTINGS seed): 3708 & 6972 -> Robert Spencer/OK/MCDOK/Ryan
// Thorley; 6178 -> Brad Denley/FL/Emerald Arches/Jacob Thorley -- so patch/operator/organization
// modes exercise the real live resolvers against real, independently-known groupings.
function store(loc, overrides = {}) {
  return {
    loc, name: 'Store ' + loc, org: 'MCDOK', gm: null, sup: null, city: 'T', state: 'OK', addr: null,
    p: { laborPct: 0.28, oepe: 175, tpph: 5, cashOSPct: 0.0005, t2w: 0.05, otHrs: 0, _cov: {} },
    t: { tOepe: 180, tTpph: 90 }, opsScore: 80, ctrlScore: 80, findings: [],
    pSales: 50000, pLY: 48000, ...overrides,
  };
}

function baseDs() {
  return { loaded: true, storeIds: ['3708', '6972', '6178'], laborRows: [], opsRows: [], records: {} };
}

function renderStoreDash(allStores) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const dateRange = { s: new Date(2025, 0, 1), e: new Date(2025, 0, 31), label: 'Test Period' };
  act(() => {
    root.render(React.createElement(StoreDash, {
      store: allStores[0], ds: baseDs(), settings: { dialedInEnabled: false }, allStores,
      onBack: NOOP, onNav: NOOP, dateRange, userEvents: {}, lockedProjections: {}, onUpdateSettings: NOOP,
    }));
  });
  return { container, root };
}

describe('Performance Summary tile — grouping pills', () => {
  let container, root;
  afterEach(async () => {
    if (root) await act(async () => { root.unmount(); });
    container?.remove();
    container = null; root = null;
    savedGroups = null;
  });

  const allStores = [
    store('3708', { pSales: 10000, opsScore: 80, p: { t2w: 0.04 } }),
    store('6972', { pSales: 20000, opsScore: 90, p: { t2w: 0.06 } }),
    store('6178', { pSales: 5000, opsScore: 70, p: { t2w: -0.02 } }),
  ];

  it('renders the "📊 Performance Summary" header with the three fixed sections gone (no more "Supervisor Performance Summary" / "Operator Performance Summary" / "Organization Breakdown" headers)', async () => {
    ({ container, root } = renderStoreDash(allStores));
    await act(async () => { await Promise.resolve(); });
    expect(container.textContent).toContain('Performance Summary');
    expect(container.textContent).not.toContain('Supervisor Performance Summary');
    expect(container.textContent).not.toContain('Operator Performance Summary');
    expect(container.textContent).not.toContain('Organization Breakdown');
  });

  it('defaults to Patch mode and resolves each store to its LIVE supervisorGroups() patch (not a stale INV_ORG_COORDS[loc].sup read)', async () => {
    ({ container, root } = renderStoreDash(allStores));
    await act(async () => { await Promise.resolve(); });
    // Measured live (not assumed from INV_ORG_COORDS's static seed, which disagrees for 3708 —
    // that static field is a coordinate-map fallback, not the source of truth; supervisorGroups()
    // is, per dispatch #139): 3708 -> Zukarr Eaves ($10,000), 6972 -> Robert Spencer ($20,000),
    // 6178 -> Brad Denley ($5,000) — three separate single-store patches for this fixture.
    expect(container.textContent).toContain('Zukarr Eaves');
    expect(container.textContent).toContain('Robert Spencer');
    expect(container.textContent).toContain('Brad Denley');
    expect(container.textContent).toContain('$10,000');
    expect(container.textContent).toContain('$20,000');
  });

  it('switching to Organization mode shows MCDOK and Emerald Arches cards with the right store counts', async () => {
    ({ container, root } = renderStoreDash(allStores));
    await act(async () => { await Promise.resolve(); });
    const orgPill = [...container.querySelectorAll('button')].find(b => b.textContent.includes('🗺️ Organization'));
    expect(orgPill).toBeTruthy();
    await act(async () => { orgPill.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).toContain('MCDOK — Oklahoma');
    expect(container.textContent).toContain('Emerald Arches — Florida');
    // MCDOK total: 3708+6972 = $30,000; Emerald: 6178 = $5,000
    expect(container.textContent).toContain('$30,000');
    expect(container.textContent).toContain('$5,000');
  });

  it('switching to Operator mode groups by the live operator, not the old static INV_ORG_COORDS read', async () => {
    ({ container, root } = renderStoreDash(allStores));
    await act(async () => { await Promise.resolve(); });
    const opPill = [...container.querySelectorAll('button')].find(b => b.textContent.includes('🏢 Operator'));
    await act(async () => { opPill.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).toContain('Ryan Thorley');
    expect(container.textContent).toContain('Jacob Thorley');
  });

  it('switching to Location mode shows one card per store', async () => {
    ({ container, root } = renderStoreDash(allStores));
    await act(async () => { await Promise.resolve(); });
    const locPill = [...container.querySelectorAll('button')].find(b => b.textContent.includes('📍 Location'));
    await act(async () => { locPill.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).toContain('Store 3708');
    expect(container.textContent).toContain('Store 6972');
    expect(container.textContent).toContain('Store 6178');
  });

  it('switching to Custom Group mode loads the saved group and shows it, with an edit/delete affordance', async () => {
    ({ container, root } = renderStoreDash(allStores));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    const customPill = [...container.querySelectorAll('button')].find(b => b.textContent.includes('🔧 Custom Group'));
    await act(async () => { customPill.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).toContain('MRG Restaurants');
    // g1 = 3708 (10000) + 6178 (5000) = $15,000
    expect(container.textContent).toContain('$15,000');
    expect([...container.querySelectorAll('button')].some(b => b.title === 'Delete group')).toBe(true);
  });

  it('"➕ New Group" opens the LocationGroupPicker modal, and saving a group calls saveCustomLocationGroups', async () => {
    ({ container, root } = renderStoreDash(allStores));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    const customPill = [...container.querySelectorAll('button')].find(b => b.textContent.includes('🔧 Custom Group'));
    await act(async () => { customPill.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    const newBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('➕ New Group'));
    expect(newBtn).toBeTruthy();
    await act(async () => { newBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).toContain('New Custom Group');

    // Name it, pick a store, save.
    const nameInput = [...container.querySelectorAll('input')].find(i => i.placeholder && i.placeholder.includes('Group name'));
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(nameInput, 'Test Group');
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const storeCheckbox = [...container.querySelectorAll('label')].find(l => l.textContent.includes('3708'))?.querySelector('input[type=checkbox]');
    expect(storeCheckbox).toBeTruthy();
    await act(async () => { storeCheckbox.click(); });
    const saveBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('✓ Save Group'));
    expect(saveBtn.disabled).toBe(false);
    await act(async () => { saveBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    expect(savedGroups).toBeTruthy();
    expect(savedGroups.some(g => g.name === 'Test Group' && g.locs.includes('3708'))).toBe(true);
  });
});
