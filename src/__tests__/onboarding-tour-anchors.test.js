// @vitest-environment happy-dom
// @ts-nocheck
// Task #107 — src/components/OnboardingTour.js finds its spotlight targets purely by
// `[data-tour="..."]`, matched against shell.js's AppSidebar/NotificationBell by exact string
// (the sidebar container, and the Home/Data Manager nav items' label text) -- the exact kind of
// coupling this file's own comments already accept elsewhere (e.g. the collapse-toggle's `title`
// matched by other tests). If a future rename drops one of these hooks, the tour would silently
// skip that step forever (its own fallback for a missing anchor) rather than fail loudly -- this
// file is what catches that instead, same mutation-test spirit as schema-drift.test.js.
import { describe, it, expect, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

global.performance = global.performance || { now: () => 0 };

const { AppSidebar, NotificationBell } = await import('../app/shell.js');
const h = React.createElement;

function mount(Component, props) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(h(Component, props)); });
  return { container, root };
}

describe('OnboardingTour anchors — data-tour hooks exist on their real elements', () => {
  it('AppSidebar carries sidebar/home anchors always, and the data-manager anchor once its section is expanded', () => {
    const { container } = mount(AppSidebar, {
      view: 'command', setView: () => {}, selStore: 'X', stores: [], ds: {},
      settings: { districtName: 'Test' }, onOpenModal: () => {}, onLoadFiles: () => {},
      loadMsg: '', perm: () => true, betaMode: false, panelVis: {}, panelEnabled: () => true,
      initialCollapsed: false,
    });
    expect(container.querySelector('[data-tour="sidebar"]')).toBeTruthy();
    expect(container.querySelector('[data-tour="home"]')).toBeTruthy();

    // Data Manager lives in the 'admin' section, which starts COLLAPSED by default (task #72's
    // accordion) -- not present until expanded. This is exactly why OnboardingTour.js dispatches
    // 'mf:expandSection' before looking for this anchor; this test exercises the same event.
    expect(container.querySelector('[data-tour="data-manager"]')).toBeFalsy();
    act(() => { window.dispatchEvent(new CustomEvent('mf:expandSection', { detail: { id: 'admin' } })); });
    expect(container.querySelector('[data-tour="data-manager"]')).toBeTruthy();
  });

  it('NotificationBell carries the bell anchor for a role with store-analytics access', () => {
    const { container } = mount(NotificationBell, { onOpenModal: () => {}, perm: () => true });
    expect(container.querySelector('[data-tour="bell"]')).toBeTruthy();
  });
});
