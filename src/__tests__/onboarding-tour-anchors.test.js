// @vitest-environment happy-dom
// @ts-nocheck
// Task #107 — src/components/OnboardingTour.js finds its spotlight targets purely by
// `[data-tour="..."]`, matched against shell.js's AppSidebar/AppTopbar/NotificationBell by exact
// string (the sidebar container, the Home nav item's label text, and AppTopbar's scope-filter
// control) -- the exact kind of coupling this file's own comments already accept elsewhere (e.g.
// the collapse-toggle's `title` matched by other tests). If a future rename drops one of these
// hooks, the tour would silently skip that step forever (its own fallback for a missing anchor)
// rather than fail loudly -- this file is what catches that instead, same mutation-test spirit
// as schema-drift.test.js.
import { describe, it, expect, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

global.performance = global.performance || { now: () => 0 };
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { AppSidebar, AppTopbar, NotificationBell } = await import('../app/shell.js');
const h = React.createElement;

function mount(Component, props) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(h(Component, props)); });
  return { container, root };
}

describe('OnboardingTour anchors — data-tour hooks exist on their real elements', () => {
  it('AppSidebar carries the sidebar/home anchors', () => {
    const { container } = mount(AppSidebar, {
      view: 'command', setView: () => {}, selStore: 'X', stores: [], ds: {},
      settings: { districtName: 'Test' }, onOpenModal: () => {}, onLoadFiles: () => {},
      loadMsg: '', perm: () => true, betaMode: false, panelVis: {}, panelEnabled: () => true,
      initialCollapsed: false,
    });
    expect(container.querySelector('[data-tour="sidebar"]')).toBeTruthy();
    expect(container.querySelector('[data-tour="home"]')).toBeTruthy();
  });

  it('AppTopbar carries the scope-filter anchor on its own topbar control, always present', () => {
    const { container } = mount(AppTopbar, {
      view: 'command', setView: () => {}, selStore: null, stores: [], ds: {}, settings: {},
      dateRange: null, onDateChange: () => {}, locScope: 'all', onScopeChange: () => {},
      loadMsg: '', perm: () => true, userRole: 'gm', realUserRole: 'gm', canViewAsRole: false,
      viewAsRole: null, onChangeViewAsRole: null, viewAsRoleOptions: [], viewAsScope: null,
    });
    expect(container.querySelector('[data-tour="scope-filter"]')).toBeTruthy();
  });

  it('NotificationBell carries the bell anchor for a role with store-analytics access', () => {
    const { container } = mount(NotificationBell, { onOpenModal: () => {}, perm: () => true });
    expect(container.querySelector('[data-tour="bell"]')).toBeTruthy();
  });
});
