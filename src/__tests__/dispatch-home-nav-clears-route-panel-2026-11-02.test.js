// @vitest-environment happy-dom
// @ts-nocheck
// Owner-reported bug (2026-11-02): "anytime Home is clicked it should automatically take user
// back to home page. Currently when a full page panel is open it has to be closed using the
// back arrow at top left of panel before Home will show." setView('command') alone never closed
// an open routePanel (every view's render gate in App.js requires !routePanel, same as the
// Escape-key handler's own `if(routePanel){goRoute(null);return;}`), so AppSidebar's Home/
// District View nav items now also call goRoute(null) -- this renders the REAL AppSidebar and
// clicks the real nav items, not a hand-rolled handler check.
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { AppSidebar } = await import('../app/shell.js');
const h = React.createElement;

function mountSidebar(extraProps = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const calls = { setViewArgs: [], goRouteArgs: [] };
  const props = {
    view: 'store', setView: (v) => calls.setViewArgs.push(v),
    routePanel: 'dicompare', goRoute: (id) => calls.goRouteArgs.push(id),
    selStore: '3708', stores: [], ds: {},
    settings: { districtName: 'Test', navStyle: 'classic' }, onOpenModal: () => {}, onLoadFiles: () => {},
    loadMsg: '', perm: () => true, betaMode: false, panelVis: {},
    ...extraProps,
  };
  act(() => { root.render(h(AppSidebar, props)); });
  return { container, root, calls };
}

describe('AppSidebar Home/District View nav items clear an open route panel', () => {
  let container, root;
  afterEach(() => { act(() => { root?.unmount(); }); container?.remove(); });

  it('clicking Home invokes setView and goRoute(null) on the actual handler', () => {
    const r = mountSidebar();
    container = r.container; root = r.root;
    const homeBtn = [...container.querySelectorAll('*')].find(el => el.children.length === 0 && el.textContent.trim() === 'Home');
    expect(homeBtn, 'Home nav item not found').toBeTruthy();
    act(() => { homeBtn.click(); });
    expect(r.calls.setViewArgs).toContain('command');
    expect(r.calls.goRouteArgs).toContain(null);
  });

  it('clicking District View invokes setView and goRoute(null) too', () => {
    const r = mountSidebar();
    container = r.container; root = r.root;
    const dvBtn = [...container.querySelectorAll('*')].find(el => el.children.length === 0 && el.textContent.trim() === 'District View');
    expect(dvBtn, 'District View nav item not found').toBeTruthy();
    act(() => { dvBtn.click(); });
    expect(r.calls.setViewArgs).toContain('district');
    expect(r.calls.goRouteArgs).toContain(null);
  });

  it('is safe to render without routePanel/goRoute props at all (every other caller shape)', () => {
    const r = mountSidebar({ routePanel: undefined, goRoute: undefined });
    container = r.container; root = r.root;
    const homeBtn = [...container.querySelectorAll('*')].find(el => el.children.length === 0 && el.textContent.trim() === 'Home');
    expect(() => act(() => { homeBtn.click(); })).not.toThrow();
  });
});
