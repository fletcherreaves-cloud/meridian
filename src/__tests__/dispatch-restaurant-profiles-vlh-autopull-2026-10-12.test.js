// @vitest-environment happy-dom
// @ts-nocheck
// Restaurant Profiles (StoreKBEditor, labor-tools.js) — owner req 2026-10-12: Store Format
// option changes (remove Dessert Kiosk; add Gas Alliance/SPOD/Walmart) plus four new Layout &
// Equipment sections (DT Layout, Service Area Layout, Beverage, Production Area Layout) modeled
// on and auto-pulled from Store VLH Config (store_vlh_config) wherever that table has a real
// value, manual-select for the rest. Renders the REAL StoreKBEditor component (standing rule
// from #366 — a test that only checks the option-array constants can't tell "the dropdown has
// the right options" from "the dropdown never got wired to them").
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

// Every real store gets the SAME known config, so the test doesn't need to know (or hardcode)
// which store is alphabetically first / selected by default — whichever one renders, the
// auto-pull values are the same, known strings. Built from the REAL STORE_NAMES/normLoc at call
// time (import() inside the mock body, after all real modules are loaded) rather than hardcoding
// a loc that could drift if the store list changes.
vi.mock('../lib/supabase.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    loadVlhStoreConfigs: async () => {
      const { STORE_NAMES } = await import('../constants.js');
      const map = {};
      for (const loc of Object.keys(STORE_NAMES)) {
        const unpadded = String(parseInt(loc, 10));
        map[unpadded] = { loc: unpadded, aot: false, dt_type: 'single_2booth', in_store: 'crew_pour', kitchen: 'opl', vlh_guide: 'standard', coffee: 'both' };
      }
      return map;
    },
  };
});

import { StoreKBEditor } from '../views/labor-tools.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

async function flush(container, maxTicks = 15) {
  let last = null;
  for (let i = 0; i < maxTicks; i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
    if (container.textContent === last) return;
    last = container.textContent;
  }
}

// A field's <select> lives in the SAME wrapper div as its label row. Matches ONLY on the label
// row's own first child being an exact text node === labelText (never a looser `startsWith`,
// which also matches an ANCESTOR wrapper whose concatenated textContent happens to start with
// the same word -- that ancestor's nearest <select> would be the WRONG field's, the first one
// in its grid, not this one's).
function selectFor(container, labelText) {
  const labelDiv = [...container.querySelectorAll('div')].find(d =>
    d.childNodes[0]?.nodeType === 3 && d.childNodes[0].textContent === labelText);
  return labelDiv?.parentElement?.querySelector('select');
}

describe('Restaurant Profiles — Store Format options (owner req 2026-10-12)', () => {
  let container, root;
  beforeEach(() => {
    localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
    localStorage.clear();
  });

  it('Store Format no longer offers Dessert Kiosk, and offers the three new non-traditional formats', async () => {
    await act(async () => { root.render(React.createElement(StoreKBEditor, { onClose: () => {} })); });
    await flush(container);
    const profileTab = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Profile'));
    await act(async () => { profileTab.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush(container);
    const storeFormatSelect = selectFor(container, 'Store Format');
    expect(storeFormatSelect).toBeTruthy();
    const optionLabels = [...storeFormatSelect.querySelectorAll('option')].map(o => o.textContent);
    expect(optionLabels).not.toContain('Dessert Kiosk');
    expect(optionLabels).toContain('Traditional');
    expect(optionLabels).toContain('Gas Alliance');
    expect(optionLabels).toContain('Special Point of Distribution (SPOD)');
    expect(optionLabels).toContain('Walmart');
  });
});

describe('Restaurant Profiles — Layout & Equipment auto-pull from Store VLH Config (owner req 2026-10-12)', () => {
  let container, root;
  beforeEach(() => {
    localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
    localStorage.clear();
  });

  async function openProfileTab() {
    await act(async () => { root.render(React.createElement(StoreKBEditor, { onClose: () => {} })); });
    await flush(container);
    const profileTab = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Profile'));
    await act(async () => { profileTab.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush(container);
  }

  it('DT Layout / Service Area Layout / Beverage / Production Area Layout all pre-fill from the real store_vlh_config row, with the auto-pull badge shown', async () => {
    await openProfileTab();
    expect(container.textContent).toMatch(/Layout & Equipment/);
    expect(selectFor(container, 'DT Layout').value).toBe('Single Lane 2 Booth');
    expect(selectFor(container, 'Beverage').value).toBe('Crew Pour');
    expect(selectFor(container, 'Production Area Layout').value).toBe('OPL');
    expect(selectFor(container, 'Service Area Layout').value).toBe('BDAP + McCafe');
    // The badge renders once per auto-filled field -- 4 fields, 4 badges.
    expect([...container.querySelectorAll('span')].filter(s => s.textContent === '📡 Store VLH Config').length).toBe(4);
  });

  it('picking a different value overrides the auto-pull and drops the badge for that field', async () => {
    await openProfileTab();
    const dtSelect = selectFor(container, 'DT Layout');
    expect(dtSelect.value).toBe('Single Lane 2 Booth'); // auto-filled before any interaction
    await act(async () => {
      dtSelect.value = 'No Drive Thru';
      dtSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flush(container);
    expect(selectFor(container, 'DT Layout').value).toBe('No Drive Thru');
    // The other 3 fields are untouched and still auto-filled/badged.
    expect([...container.querySelectorAll('span')].filter(s => s.textContent === '📡 Store VLH Config').length).toBe(3);
  });

  it('Save persists the real, resolved value for an untouched auto-pulled field -- not an empty string', async () => {
    await openProfileTab();
    const saveBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Save'));
    await act(async () => { saveBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush(container);
    const edits = JSON.parse(localStorage.getItem('mf_store_kb_edits') || '{}');
    const savedLoc = Object.keys(edits)[0];
    expect(savedLoc).toBeTruthy();
    expect(edits[savedLoc].profile.dtLayout).toBe('Single Lane 2 Booth');
    expect(edits[savedLoc].profile.beverage).toBe('Crew Pour');
    expect(edits[savedLoc].profile.productionAreaLayout).toBe('OPL');
    expect(edits[savedLoc].profile.serviceAreaLayout).toBe('BDAP + McCafe');
    // Once truly saved, re-opening should show it as a real value, not an auto-pull suggestion
    // -- the badge is about "not yet confirmed," which no longer applies after Save.
    await flush(container);
    expect([...container.querySelectorAll('span')].filter(s => s.textContent === '📡 Store VLH Config').length).toBe(0);
  });
});

describe('Restaurant Profiles — a store with no Store VLH Config row degrades to plain manual selection', () => {
  let container, root;
  beforeEach(() => {
    localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
    localStorage.clear();
  });

  it('no config row (this file\'s own default mock is overridden to {}) -- no crash, no badge, fields sit unselected', async () => {
    const supabaseLib = await import('../lib/supabase.js');
    const spy = vi.spyOn(supabaseLib, 'loadVlhStoreConfigs').mockResolvedValue({});
    await act(async () => { root.render(React.createElement(StoreKBEditor, { onClose: () => {} })); });
    await flush(container);
    const profileTab = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Profile'));
    await act(async () => { profileTab.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush(container);
    expect(selectFor(container, 'DT Layout').value).toBe('');
    expect([...container.querySelectorAll('span')].filter(s => s.textContent === '📡 Store VLH Config').length).toBe(0);
    expect(container.textContent).toMatch(/No Store VLH Config on file/);
    spy.mockRestore();
  });
});
