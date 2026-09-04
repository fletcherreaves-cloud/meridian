// @vitest-environment happy-dom
// @ts-nocheck
// news-panel.js's location filter was a hand-rolled, coverage-only chip row (every location that
// HAD a story, flat, no state/patch tier -- Notes 62). Replaced with the standard LocationSelector
// (feedback-selector-ui-standard: All -> State -> Patch -> Store). Renders the REAL NewsPanel and
// drives the real selector, not an isolated call to the filtering logic.
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

const ARDMORE = { itemKey: 'a1', title: 'Road closed near Ardmore', url: 'https://x/1', outlet: 'KXII', published: new Date('2026-08-20'), loc: '3708', locs: ['3708'], signals: ['roads'], ambiguous: false, tier: 'local' };
const CHIPLEY = { itemKey: 'a2', title: 'Chipley business news', url: 'https://x/2', outlet: 'WMBB', published: new Date('2026-08-18'), loc: '6178', locs: ['6178'], signals: ['business'], ambiguous: false, tier: 'local' };

vi.mock('../lib/supabase.js', () => ({
  loadNewsMentions: async () => [ARDMORE, CHIPLEY],
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { NewsPanel } = await import('../views/news-panel.js');

// Real STORE_NAMES-seeded stores (Ardmore-Broadway/OK, Chipley/FL), same two dispatch-227 uses.
const STORES = [{ loc: '3708' }, { loc: '6178' }];

function mountRoot() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return { container, root: createRoot(container) };
}

async function renderPanel(root, props = {}) {
  await act(async () => {
    root.render(React.createElement(NewsPanel, { onClose: () => {}, stores: STORES, ...props }));
    await Promise.resolve(); await Promise.resolve();
  });
}

describe('NewsPanel — standard LocationSelector', () => {
  let container, root;
  afterEach(() => { if (root) act(() => root.unmount()); if (container) container.remove(); });

  it('shows both stories with "All Locations" selected', async () => {
    ({ container, root } = mountRoot());
    await renderPanel(root);
    expect(container.textContent).toContain('Road closed near Ardmore');
    expect(container.textContent).toContain('Chipley business news');
  });

  it('the standard selector is present (All Locations pill + a state-tier pill), not the old flat coverage-chip list', async () => {
    ({ container, root } = mountRoot());
    await renderPanel(root);
    const labels = [...container.querySelectorAll('button')].map(b => b.textContent);
    expect(labels).toContain('All Locations');
    // Progressive mode surfaces a state tier (OK/FL) once stores resolve -- the old chip row
    // never had one.
    expect(labels.some(t => t === 'OK' || t === 'Oklahoma')).toBe(true);
  });

  it('narrowing to one store via the selector filters out the other store\'s story', async () => {
    ({ container, root } = mountRoot());
    await renderPanel(root, { initialLoc: '3708' });
    expect(container.textContent).toContain('Road closed near Ardmore');
    expect(container.textContent).not.toContain('Chipley business news');
  });

  it('the signal-type chip row still filters independently of location', async () => {
    ({ container, root } = mountRoot());
    await renderPanel(root);
    const businessChip = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Business'));
    expect(businessChip, 'Business signal chip not found').toBeTruthy();
    await act(async () => { businessChip.click(); });
    expect(container.textContent).toContain('Chipley business news');
    expect(container.textContent).not.toContain('Road closed near Ardmore');
  });
});
