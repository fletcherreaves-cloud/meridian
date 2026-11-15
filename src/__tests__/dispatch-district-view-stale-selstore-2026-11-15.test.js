// @vitest-environment happy-dom
// @ts-nocheck
// Owner-reported bug (2026-11-15): "after clicking into District View first time, after
// navigating elsewhere and then reopening it, it fails to load at all. Jst blank screen."
//
// Root cause: District View's own render gate (App.js, view==='district'&&!selStore&&...)
// requires selStore to be falsy, but selStore was ONLY ever cleared by StoreDash's own Back
// button (App.js onBack:()=>{setView('district');setSelStore(null);}) -- never by switching
// views through the nav. Open a store from District View (goStore sets selStore + view='store'),
// then leave via any OTHER nav item (not StoreDash's Back arrow): selStore is left stuck set.
// District View's nav item then sets view='district' correctly, but !selStore is false forever
// -- nothing renders, no thrown error, just the blank content area the owner saw.
//
// Fix: District View's nav handler now also clears selStore, closing the gap the same way
// goRoute?.(null) (dispatch-home-nav-clears-route-panel-2026-11-02) closes the stuck-routePanel
// one. This test renders the REAL AppSidebar and clicks the real nav item, not a hand-rolled
// handler check.
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
  const calls = { setViewArgs: [], goRouteArgs: [], setSelStoreArgs: [] };
  const props = {
    view: 'store', setView: (v) => calls.setViewArgs.push(v),
    routePanel: null, goRoute: (id) => calls.goRouteArgs.push(id),
    selStore: '3708', setSelStore: (v) => calls.setSelStoreArgs.push(v),
    stores: [], ds: {},
    settings: { districtName: 'Test', navStyle: 'classic' }, onOpenModal: () => {}, onLoadFiles: () => {},
    loadMsg: '', perm: () => true, betaMode: false, panelVis: {}, initialCollapsed: false,
    ...extraProps,
  };
  act(() => { root.render(h(AppSidebar, props)); });
  return { container, root, calls };
}

describe('AppSidebar District View nav item clears a stale selStore', () => {
  let container, root;
  afterEach(() => { act(() => { root?.unmount(); }); container?.remove(); });

  it('clicking District View with a leftover selStore (e.g. after StoreDash) clears it', () => {
    const r = mountSidebar();
    container = r.container; root = r.root;
    const dvBtn = [...container.querySelectorAll('*')].find(el => el.children.length === 0 && el.textContent.trim() === 'District View');
    expect(dvBtn, 'District View nav item not found').toBeTruthy();
    act(() => { dvBtn.click(); });
    expect(r.calls.setSelStoreArgs).toContain(null);
    expect(r.calls.setViewArgs).toContain('district');
    expect(r.calls.goRouteArgs).toContain(null);
  });

  it('is safe to render and click District View without a setSelStore prop at all', () => {
    const r = mountSidebar({ setSelStore: undefined });
    container = r.container; root = r.root;
    const dvBtn = [...container.querySelectorAll('*')].find(el => el.children.length === 0 && el.textContent.trim() === 'District View');
    expect(() => act(() => { dvBtn.click(); })).not.toThrow();
    expect(r.calls.setViewArgs).toContain('district');
  });
});
