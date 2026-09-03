// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #160 — panel-contract adoption pass on OnePagerPanel (one-pager.js, the "Leadership
// One-Pager"). Renders the REAL component (this project's "verification must touch the call
// site" standing rule). Supabase is mocked (same pattern as crew-schedule-panel.test.js) because
// OnePagerPanel's entire body is gated on loadQsrFob's promise settling — in a sandbox with no
// real Supabase config, an unmocked call attempts a real fetch that hangs until test teardown
// instead of resolving, leaving the panel stuck on "Loading…" and every assertion below it dead.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { STORE_NAMES } from '../constants.js';

vi.mock('../lib/supabase.js', () => ({
  loadQsrFob: async () => [],
  loadActionItems: async () => [],
  loadOnePagers: async () => [],
  saveOnePager: async () => ({}),
  saveActionItem: async () => ({}),
  updateActionItem: async () => ({}),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { OnePagerPanel } = await import('../views/one-pager.js');

const STORES = [{ loc: '3708' }, { loc: '3709' }];

function mountRoot() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return { container, root: createRoot(container) };
}

async function renderPanel(root, extraProps) {
  await act(async () => {
    root.render(React.createElement(OnePagerPanel, {
      ds: {}, stores: STORES, settings: {}, onClose: () => {}, ...extraProps,
    }));
    // Flush the mocked loadQsrFob microtask so the body renders past "Loading…".
    await Promise.resolve(); await Promise.resolve();
  });
}

describe('dispatch #160 item 1 — OnePagerPanel uses RoutePanelShell, not a hand-rolled backdrop', () => {
  let container, root;
  beforeEach(() => { ({ container, root } = mountRoot()); });
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

  it('renders the RoutePanelShell header (Back button, title) and the body past "Loading…"', async () => {
    await renderPanel(root);
    expect(container.textContent).toMatch(/Leadership One-Pager/);
    const back = container.querySelector('button[aria-label="Back"]');
    expect(back, 'RoutePanelShell Back button not found').toBeTruthy();
    expect(container.textContent).not.toMatch(/Loading…/);
    expect(container.textContent).toMatch(/Current state/);
  });

  it('calling the Back button invokes onClose', async () => {
    let closed = false;
    await renderPanel(root, { onClose: () => { closed = true; } });
    const back = container.querySelector('button[aria-label="Back"]');
    await act(async () => { back.click(); });
    expect(closed).toBe(true);
  });
});

describe('dispatch #160 item 4 — the five print/export actions collapse into one ActionMenu', () => {
  let container, root;
  beforeEach(() => { ({ container, root } = mountRoot()); });
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

  it('shows a single "🖨 Reports" trigger, closed by default, instead of five separate header buttons', async () => {
    await renderPanel(root);
    const menuBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Reports'));
    expect(menuBtn, '🖨 Reports ActionMenu trigger not found').toBeTruthy();
    // Closed by default — the five items aren't in the DOM as top-level header buttons.
    expect(container.textContent).not.toMatch(/📝 Discussion/);
    expect([...container.querySelectorAll('button')].some(b => b.textContent === 'Print')).toBe(false);
  });

  it('opening the menu reveals all five report actions by their (de-emojified) labels', async () => {
    await renderPanel(root);
    const menuBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Reports'));
    await act(async () => { menuBtn.click(); });
    const itemLabels = ['Print', 'Discussion sheet', 'Weekly Review', 'Download Word (filled)', 'Download Word (blank)'];
    for (const label of itemLabels) {
      const item = [...container.querySelectorAll('button')].find(b => b.textContent === label);
      expect(item, `ActionMenu item "${label}" not found after opening`).toBeTruthy();
    }
  });

  it('Save stays its own directly-clickable header button (a commit action, not folded into the menu)', async () => {
    await renderPanel(root);
    const saveBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Save'));
    expect(saveBtn, 'Save button not found').toBeTruthy();
  });

  it('the Cascade level select stays directly reachable in the header', async () => {
    await renderPanel(root);
    expect(container.querySelector('select[title="Cascade level"]')).toBeTruthy();
  });
});

describe('dispatch #160 item 3 — OnePagerPanel scope is deliberately left hand-rolled', () => {
  let container, root;
  beforeEach(() => { ({ container, root } = mountRoot()); });
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

  it('keeps the Org/OK/FL + per-store pill picker (NOT converted to LocationSelector — its arbitrary multi-select "fine control" toggling of individual stores is richer than LocationSelector\'s single-level {all|state|patch|store} value shape, so converting would remove real capability, not just reskin the UI)', async () => {
    await renderPanel(root);
    const buttons = [...container.querySelectorAll('button')].map(b => b.textContent);
    expect(buttons).toContain('Org');
    expect(buttons).toContain('OK');
    expect(buttons).toContain('FL');
    // LocationSelector's own "All Locations" pill label is distinct from this panel's "Org" —
    // proves this scope picker is still its pre-existing hand-rolled self, not swapped in.
    expect(buttons).not.toContain('All Locations');
    // The individual store pills (the "fine control" LocationSelector can't reproduce) are
    // still present, one per store in the passed-in `stores` list, labeled via the same nm()
    // helper the rest of the panel uses (real store name when known, e.g. STORE_NAMES['3708']).
    expect(buttons).toContain(STORE_NAMES['3708'] || '3708');
    expect(buttons).toContain(STORE_NAMES['3709'] || '3709');
  });
});
