// @vitest-environment happy-dom
// @ts-nocheck
// Owner request 2026-11-02: "give users a setting to decide which panel they see first."
// Covers the Settings UI (management.js's Appearance/"Theme" section) wiring to
// DEF_SETTINGS.defaultLandingPanel -- the read side (readDefaultLandingPanel + App.js's
// view/routePanel initializers) is covered separately in routing.test.js and is a pure
// function, easy to unit test there. This test renders the REAL Settings component (same
// pattern as settings-panel-access-log.test.js) and exercises the actual dropdown a user
// would click.
import { describe, it, expect, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { Settings } from '../views/management.js';
import { DEF_SETTINGS } from '../constants.js';
import { PANELS } from '../app/panel-registry.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../lib/supabase.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, logAppAccess: () => Promise.resolve({ error: null }) };
});

async function mount(props) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(React.createElement(Settings, props)); });
  await act(async () => { await Promise.resolve(); });
  return { container, root };
}

function clickThemeTab(container) {
  const tab = Array.from(container.querySelectorAll('div')).find(d => d.textContent === '🎨 Theme' && d.onclick);
  expect(tab, 'Theme sidebar tab should be found').toBeTruthy();
  act(() => { tab.click(); });
}

describe('Settings — Default Landing Panel (owner request 2026-11-02)', () => {
  let container, root;
  afterEach(() => { act(() => { root?.unmount(); }); container?.remove(); });

  it('defaults to Home in DEF_SETTINGS', () => {
    expect(DEF_SETTINGS.defaultLandingPanel).toBeNull();
  });

  it('renders a dropdown offering Home, District View, and every route:true panel', async () => {
    ({ container, root } = await mount({ settings: DEF_SETTINGS, onUpdate: () => {}, onClose: () => {}, userRole: 'admin' }));
    clickThemeTab(container);
    const label = Array.from(container.querySelectorAll('div')).find(d => d.textContent === 'Default Landing Panel');
    expect(label).toBeTruthy();
    const select = container.querySelector('select[value], select'); // first select in the appearance section
    const selects = Array.from(container.querySelectorAll('select'));
    const landingSelect = selects.find(s => Array.from(s.options).some(o => o.value === 'district'));
    expect(landingSelect).toBeTruthy();
    const routeIds = PANELS.filter(p => p.route).map(p => p.id);
    const optionValues = Array.from(landingSelect.options).map(o => o.value);
    expect(optionValues).toContain('command');
    expect(optionValues).toContain('district');
    for (const id of routeIds) expect(optionValues).toContain(id);
  });

  it('calling onChange with a real route panel id calls onUpdate with that id stored', async () => {
    const onUpdate = vi.fn();
    ({ container, root } = await mount({ settings: DEF_SETTINGS, onUpdate, onClose: () => {}, userRole: 'admin' }));
    clickThemeTab(container);
    const selects = Array.from(container.querySelectorAll('select'));
    const landingSelect = selects.find(s => Array.from(s.options).some(o => o.value === 'district'));
    const someRoutePanel = PANELS.find(p => p.route);
    act(() => {
      landingSelect.value = someRoutePanel.id;
      landingSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(onUpdate).toHaveBeenCalled();
    const passed = onUpdate.mock.calls[onUpdate.mock.calls.length - 1][0];
    expect(passed.defaultLandingPanel).toBe(someRoutePanel.id);
  });

  it('selecting Home back out stores null, not the literal string', async () => {
    const onUpdate = vi.fn();
    const seeded = { ...DEF_SETTINGS, defaultLandingPanel: 'district' };
    ({ container, root } = await mount({ settings: seeded, onUpdate, onClose: () => {}, userRole: 'admin' }));
    clickThemeTab(container);
    const selects = Array.from(container.querySelectorAll('select'));
    const landingSelect = selects.find(s => Array.from(s.options).some(o => o.value === 'district'));
    act(() => {
      landingSelect.value = 'command';
      landingSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const passed = onUpdate.mock.calls[onUpdate.mock.calls.length - 1][0];
    expect(passed.defaultLandingPanel).toBeNull();
  });
});
