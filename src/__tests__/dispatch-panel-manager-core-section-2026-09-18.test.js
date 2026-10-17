// @vitest-environment happy-dom
// @ts-nocheck
// Backlog: "Panel Manager — list every panel with a locked 'core' reference section." Before
// this, Panel Manager's own footer text just described the always-shown panels in prose ("The
// forecast / engineered-model diagnostic tools are always shown and are not listed here") --
// there was no actual reference list for the ~65 core (kind:'nav') panels, only the toggleable
// optional ones. Renders the REAL PanelManagerPanel from src/app/App.js, not a hand-rolled
// stand-in -- reverting the App.js addition must fail this test, since a test against a
// duplicated component could pass unchanged with the real one reverted.
import { describe, it, expect, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { PanelManagerPanel } from '../app/App.js';
import { PANELS } from '../app/panel-registry.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Owner request 2026-10-17 (app_access_log) -- extending Access Log beyond Pay Rate History/
// Security to the other restricted-tier panels. Mocked here (spread, not full-replacement) in
// the SAME test file that already imports PanelManagerPanel from the full App.js module, rather
// than a second dedicated test file -- importing App.js a second time (its own isolated
// environment/module graph) is what caused a stray dynamic import of at-a-glance.js/
// count-cycle.js/weekly-cadence.js to resolve after that second file's environment had already
// torn down (an EnvironmentTeardownError surfaced only under the full-suite run, not in
// isolation). One shared import of App.js avoids the duplicate exposure entirely.
const logAppAccessMock = vi.fn().mockResolvedValue({ error: null });
vi.mock('../lib/supabase.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, logAppAccess: (...args) => logAppAccessMock(...args) };
});

function mountRoot() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  return { container, root };
}

describe('PanelManagerPanel -- core panel reference section', () => {
  let container, root;
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); logAppAccessMock.mockClear(); });

  it('logs its own view on mount (app_access_log, owner request 2026-10-17)', async () => {
    ({ container, root } = mountRoot());
    await act(async () => {
      root.render(React.createElement(PanelManagerPanel, { vis: {}, onToggle: () => {}, onShowAll: () => {}, onHideAll: () => {}, perm: () => true, onClose: () => {} }));
    });
    expect(logAppAccessMock).toHaveBeenCalledWith('panel_view', 'panel-manager');
  });

  it('is collapsed by default, and expanding it lists every kind:"nav" panel, grouped by section', async () => {
    ({ container, root } = mountRoot());
    await act(async () => {
      root.render(React.createElement(PanelManagerPanel, { vis: {}, onToggle: () => {}, onShowAll: () => {}, onHideAll: () => {}, perm: () => true, onClose: () => {} }));
    });

    const navCount = PANELS.filter(p => p.kind === 'nav').length;
    // .querySelectorAll('div') is document order (ancestor before descendant), and textContent
    // aggregates descendants -- so a naive .find() on substring match grabs the outer modal
    // wrapper, not the actual clickable toggle row. The toggle row is the innermost (last)
    // matching div.
    const toggle = [...container.querySelectorAll('div')].filter(d => d.textContent.includes('Core panels')).pop();
    expect(toggle, 'core-panels toggle not found').toBeTruthy();
    expect(toggle.textContent).toContain(`(${navCount})`);

    // Collapsed: a real core-only panel's label is not yet in the DOM.
    expect(container.textContent).not.toContain('About');

    await act(async () => { toggle.click(); });

    // Expanded: 'about' (kind:'nav', section:'admin') now renders, under its real section label.
    expect(container.textContent).toContain('About');
    expect(container.textContent).toContain('Admin');
  });

  it('dims an inaccessible core panel and marks it "no access", same convention as the optional list', async () => {
    ({ container, root } = mountRoot());
    // 'above-store' requires 'analytics.district' -- deny everything so it renders dimmed.
    await act(async () => {
      root.render(React.createElement(PanelManagerPanel, { vis: {}, onToggle: () => {}, onShowAll: () => {}, onHideAll: () => {}, perm: () => false, onClose: () => {} }));
    });
    const toggle = [...container.querySelectorAll('div')].filter(d => d.textContent.includes('Core panels')).pop();
    await act(async () => { toggle.click(); });

    expect(container.textContent).toContain('Above-Store One-Pager');
    expect(container.textContent).toContain('no access');
  });
});
