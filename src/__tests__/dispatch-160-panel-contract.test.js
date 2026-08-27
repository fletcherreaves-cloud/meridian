// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #160 — panel-contract adoption pass on AboveStoreOnePager (above-store-onepager.js).
// Renders the REAL component (this project's "verification must touch the call site" standing
// rule) so a revert of the shell/LocationSelector conversions — not just a hand-rolled helper
// tested in isolation — would show up here. OnePagerPanel (one-pager.js) has its own test file,
// dispatch-160-onepager-panel.test.js, since it needs its Supabase calls mocked to resolve
// synchronously (its whole body is gated on that promise settling, unlike this panel's).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { AboveStoreOnePager } = await import('../views/above-store-onepager.js');

function mountRoot() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return { container, root: createRoot(container) };
}

describe('dispatch #160 item 1 — AboveStoreOnePager uses RoutePanelShell, not a hand-rolled backdrop', () => {
  let container, root;
  beforeEach(() => { ({ container, root } = mountRoot()); });
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

  it('renders the RoutePanelShell header (Back button, title) instead of a hand-rolled ✕ close', async () => {
    await act(async () => {
      root.render(React.createElement(AboveStoreOnePager, {
        ds: {}, settings: {}, userEvents: {}, eventImpact: {}, onClose: () => {},
      }));
    });
    expect(container.textContent).toMatch(/Above-Store One-Pager/);
    const back = container.querySelector('button[aria-label="Back"]');
    expect(back, 'RoutePanelShell Back button not found').toBeTruthy();
    // The old hand-rolled close button was a bare '✕' btn-sm with no aria-label — gone now that
    // RoutePanelShell supplies the only dismiss control.
    const bareClose = [...container.querySelectorAll('button')].find(b => b.textContent === '✕');
    expect(bareClose, 'stale hand-rolled ✕ close button still present').toBeFalsy();
  });

  it('calling the Back button invokes onClose', async () => {
    let closed = false;
    await act(async () => {
      root.render(React.createElement(AboveStoreOnePager, {
        ds: {}, settings: {}, userEvents: {}, eventImpact: {}, onClose: () => { closed = true; },
      }));
    });
    const back = container.querySelector('button[aria-label="Back"]');
    await act(async () => { back.click(); });
    expect(closed).toBe(true);
  });

  it('AI Analyze and Print stay reachable in the header (headerExtra)', async () => {
    await act(async () => {
      root.render(React.createElement(AboveStoreOnePager, {
        ds: {}, settings: {}, userEvents: {}, eventImpact: {}, onClose: () => {},
      }));
    });
    const buttons = [...container.querySelectorAll('button')].map(b => b.textContent);
    expect(buttons.some(t => t.includes('Analyze'))).toBe(true);
    expect(buttons.some(t => t === '🖨')).toBe(true);
  });
});

describe('dispatch #160 item 3 — AboveStoreOnePager scope uses LocationSelector', () => {
  let container, root;
  beforeEach(() => { ({ container, root } = mountRoot()); });
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

  it('shows the LocationSelector pill hierarchy (All Locations + state pills) instead of the old dropdowns', async () => {
    await act(async () => {
      root.render(React.createElement(AboveStoreOnePager, {
        ds: {}, settings: {}, userEvents: {}, eventImpact: {}, onClose: () => {},
      }));
    });
    const buttons = [...container.querySelectorAll('button')].map(b => b.textContent);
    expect(buttons).toContain('All Locations');
    expect(buttons).toContain('OK');
    expect(buttons).toContain('FL');
    // The old scope UI used <select> dropdowns for patch/store — LocationSelector uses buttons
    // exclusively (the app-wide pill-style standard), so the old "— patch —"/"— store —" select
    // placeholders are gone.
    expect(container.textContent).not.toMatch(/— patch —/);
    expect(container.textContent).not.toMatch(/— store —/);
  });

  it('picking the OK state pill updates the scope (subtitle reflects Oklahoma)', async () => {
    await act(async () => {
      root.render(React.createElement(AboveStoreOnePager, {
        ds: {}, settings: {}, userEvents: {}, eventImpact: {}, onClose: () => {},
      }));
    });
    const okBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'OK');
    expect(okBtn, 'OK state pill not found').toBeTruthy();
    await act(async () => { okBtn.click(); });
    expect(container.textContent).toMatch(/Oklahoma/);
  });
});
