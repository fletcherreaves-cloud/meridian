// @vitest-environment happy-dom
// @ts-nocheck
// Demographics per location (backlog: "Demographics per location, Census/ACS API") — Location
// Intelligence's new "🏘 Demographics" mode. Renders the REAL LocationIntelligence consumer and
// drives the actual mode-toggle/Refresh-button click path (this repo's "would this verification
// still pass if the change were reverted?" standing rule), mocking only the two network-touching
// modules (supabase.js's load/save, and census-demographics.js's fetch orchestration — already
// covered against literal Census-shaped fixtures in census-demographics.test.js) rather than
// re-deriving any of the panel's own logic here.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

vi.mock('../lib/supabase.js', () => ({
  loadStoreDemographics: vi.fn(() => Promise.resolve([])),
  saveStoreDemographics: vi.fn(() => Promise.resolve({ error: null })),
}));
vi.mock('../engine/census-demographics.js', () => ({
  fetchAllStoreDemographics: vi.fn(),
}));

import { loadStoreDemographics, saveStoreDemographics } from '../lib/supabase.js';
import { fetchAllStoreDemographics } from '../engine/census-demographics.js';
import { LocationIntelligence } from '../features/location-intel.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const DS_EMPTY = { loaded: false }; // demographics mode must work with zero Meridian ops data loaded
const STORES = [{ loc: '3708' }, { loc: '5183' }];

async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

function switchToDemographics(container) {
  const tab = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Demographics'));
  expect(tab, 'Demographics mode tab not found').toBeTruthy();
  return act(async () => { tab.click(); });
}

describe('Location Intel — Demographics mode', () => {
  let container, root;
  beforeEach(() => { loadStoreDemographics.mockClear(); saveStoreDemographics.mockClear(); fetchAllStoreDemographics.mockReset(); });
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

  it('is reachable and loads even when no Meridian ops data has been loaded (ds.loaded:false)', async () => {
    loadStoreDemographics.mockResolvedValue([]);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(LocationIntelligence, {
        store: { loc: '3708' }, allStores: STORES, ds: DS_EMPTY, settings: {}, scope: 'store', embedded: true, onClose: () => {},
      }));
    });
    await switchToDemographics(container);
    await flush();
    // The "Load your data" empty-state (which the other two modes show for ds.loaded:false)
    // must NOT appear on Demographics -- the whole point of this mode is that it doesn't need ds.
    expect(container.textContent).not.toContain('Load your data to generate Location Intelligence');
    expect(loadStoreDemographics).toHaveBeenCalled();
    expect(container.textContent).toContain('No demographic data yet');
  });

  it('shows a store\'s real saved demographics from Supabase without needing a refresh', async () => {
    loadStoreDemographics.mockResolvedValue([{
      loc: '3708', tractGeoid: '40019000600', population: 4200, medianHouseholdIncome: 58000,
      medianAge: 36.4, povertyRate: 0.1024, ownerOccupiedPct: 0.6, avgHouseholdSize: 2.6, acsVintage: 2023,
    }]);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(LocationIntelligence, {
        store: { loc: '3708' }, allStores: STORES, ds: DS_EMPTY, settings: {}, scope: 'store', embedded: true, onClose: () => {},
      }));
    });
    await switchToDemographics(container);
    await flush();
    expect(container.textContent).toContain('4,200');       // population, comma-formatted
    expect(container.textContent).toContain('$58,000');     // median household income
    expect(container.textContent).toContain('10.2%');       // poverty rate, 1 decimal
    expect(container.textContent).toContain('40019000600'); // tract GEOID
  });

  it('clicking 🔄 Refresh Demographics fetches all stores, saves them, and the newly-fetched data renders', async () => {
    loadStoreDemographics.mockResolvedValueOnce([]).mockResolvedValueOnce([
      { loc: '3708', tractGeoid: '40019000600', population: 4200, medianHouseholdIncome: 58000, medianAge: 36.4, povertyRate: 0.1, ownerOccupiedPct: 0.6, avgHouseholdSize: 2.6, acsVintage: 2023 },
    ]);
    fetchAllStoreDemographics.mockResolvedValue({
      rows: [{ loc: '3708', tractGeoid: '40019000600', population: 4200, medianHouseholdIncome: 58000, medianAge: 36.4, povertyRate: 0.1, ownerOccupiedPct: 0.6, avgHouseholdSize: 2.6, acsVintage: 2023 }],
      errors: [],
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(LocationIntelligence, {
        store: { loc: '3708' }, allStores: STORES, ds: DS_EMPTY, settings: {}, scope: 'store', embedded: true, onClose: () => {},
      }));
    });
    await switchToDemographics(container);
    await flush();
    expect(container.textContent).toContain('No demographic data yet');

    const refreshBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Refresh Demographics'));
    expect(refreshBtn).toBeTruthy();
    await act(async () => { refreshBtn.click(); });
    await flush();

    expect(fetchAllStoreDemographics).toHaveBeenCalledTimes(1);
    expect(saveStoreDemographics).toHaveBeenCalledTimes(1);
    expect(saveStoreDemographics.mock.calls[0][0][0].loc).toBe('3708');
    expect(container.textContent).toContain('4,200');
  });

  it('reports per-store failures from a partial refresh without hiding the stores that succeeded', async () => {
    loadStoreDemographics.mockResolvedValue([]);
    fetchAllStoreDemographics.mockResolvedValue({ rows: [], errors: [{ loc: '5183', error: 'Census geocoder HTTP 500' }] });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(LocationIntelligence, {
        store: { loc: '3708' }, allStores: STORES, ds: DS_EMPTY, settings: {}, scope: 'store', embedded: true, onClose: () => {},
      }));
    });
    await switchToDemographics(container);
    await flush();
    const refreshBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Refresh Demographics'));
    await act(async () => { refreshBtn.click(); });
    await flush();
    expect(container.textContent).toContain('1 store failed');
    expect(container.textContent).toContain('Census geocoder HTTP 500');
  });

  it('District level shows a per-store table, not a single-store card', async () => {
    loadStoreDemographics.mockResolvedValue([
      { loc: '3708', population: 4200, medianHouseholdIncome: 58000 },
      { loc: '5183', population: 3100, medianHouseholdIncome: 41000 },
    ]);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(LocationIntelligence, {
        allStores: STORES, ds: DS_EMPTY, settings: {}, scope: 'district', embedded: true, onClose: () => {},
      }));
    });
    await switchToDemographics(container);
    await flush();
    const table = container.querySelector('table');
    expect(table).toBeTruthy();
    expect(table.textContent).toContain('4,200');
    expect(table.textContent).toContain('3,100');
  });

  it('Print/Download (which build the statistical/AI report, not demographics) are hidden on this mode', async () => {
    loadStoreDemographics.mockResolvedValue([]);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(LocationIntelligence, {
        store: { loc: '3708' }, allStores: STORES, ds: DS_EMPTY, settings: {}, scope: 'store', embedded: true, onClose: () => {},
      }));
    });
    await switchToDemographics(container);
    await flush();
    expect([...container.querySelectorAll('button')].some(b => b.textContent.includes('🖨 Print'))).toBe(false);
    expect([...container.querySelectorAll('button')].some(b => b.textContent.includes('⬇ Download'))).toBe(false);
  });
});
