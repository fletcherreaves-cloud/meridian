// @vitest-environment happy-dom
// @ts-nocheck
// Task #107 (2026-11-07) — src/components/OnboardingTour.js, the narrow first-login nav
// walkthrough. Covers the flag-consumption gate, step progression/skip/finish, and the
// skip-past-a-missing-anchor fallback (a role without a given nav item must not get stuck).
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { OnboardingTour, TOUR_PENDING_FLAG_KEY } from '../components/OnboardingTour.js';

function makeAnchor(name) {
  const el = document.createElement('div');
  el.setAttribute('data-tour', name);
  document.body.appendChild(el);
  return el;
}

async function mount() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(React.createElement(OnboardingTour)); });
  await act(async () => { await Promise.resolve(); });
  return { container, root };
}

describe('OnboardingTour', () => {
  let container, root, anchors;

  beforeEach(() => {
    sessionStorage.clear();
    anchors = ['sidebar', 'home', 'scope-filter', 'bell'].map(makeAnchor);
  });

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    anchors.forEach(a => a.remove());
    vi.restoreAllMocks();
  });

  it('renders nothing when no pending-tour flag is set', async () => {
    ({ container, root } = await mount());
    expect(container.textContent).toBe('');
  });

  it('consumes the flag (removes it) and shows the first step when all anchors are present', async () => {
    sessionStorage.setItem(TOUR_PENDING_FLAG_KEY, '1');
    ({ container, root } = await mount());
    expect(sessionStorage.getItem(TOUR_PENDING_FLAG_KEY)).toBeNull();
    expect(container.textContent).toContain('Your navigation');
    expect(container.textContent).toContain('1 of 4');
  });

  it('advances through steps on Next and shows "Done" on the last one', async () => {
    sessionStorage.setItem(TOUR_PENDING_FLAG_KEY, '1');
    ({ container, root } = await mount());

    const clickBtn = async (text) => {
      const btn = Array.from(container.querySelectorAll('button')).find(b => b.textContent === text);
      await act(async () => { btn.click(); });
    };

    expect(container.textContent).toContain('Your navigation');
    await clickBtn('Next');
    expect(container.textContent).toContain('Home');
    await clickBtn('Next');
    expect(container.textContent).toContain('Location scope');
    await clickBtn('Next');
    expect(container.textContent).toContain('Notifications');
    expect(container.textContent).toContain('4 of 4');
    expect(Array.from(container.querySelectorAll('button')).some(b => b.textContent === 'Done')).toBe(true);

    await clickBtn('Done');
    expect(container.textContent).toBe('');
  });

  it('"Back" returns to the previous step', async () => {
    sessionStorage.setItem(TOUR_PENDING_FLAG_KEY, '1');
    ({ container, root } = await mount());
    const clickBtn = async (text) => {
      const btn = Array.from(container.querySelectorAll('button')).find(b => b.textContent === text);
      await act(async () => { btn.click(); });
    };
    await clickBtn('Next'); // -> Home
    expect(container.textContent).toContain('Home');
    await clickBtn('Back'); // -> sidebar
    expect(container.textContent).toContain('Your navigation');
  });

  it('"Skip tour" ends the tour immediately from any step', async () => {
    sessionStorage.setItem(TOUR_PENDING_FLAG_KEY, '1');
    ({ container, root } = await mount());
    const skipBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent === 'Skip tour');
    await act(async () => { skipBtn.click(); });
    expect(container.textContent).toBe('');
  });

  it('skips a step whose anchor is missing from the DOM (e.g. a role without the scope filter)', async () => {
    document.querySelector('[data-tour="scope-filter"]').remove();
    anchors = anchors.filter(a => a.getAttribute('data-tour') !== 'scope-filter');
    sessionStorage.setItem(TOUR_PENDING_FLAG_KEY, '1');
    ({ container, root } = await mount());

    const clickBtn = async (text) => {
      const btn = Array.from(container.querySelectorAll('button')).find(b => b.textContent === text);
      await act(async () => { btn.click(); });
    };
    expect(container.textContent).toContain('Your navigation');
    await clickBtn('Next'); // -> Home
    expect(container.textContent).toContain('Home');
    await clickBtn('Next'); // scope-filter anchor missing -> auto-skips straight to Notifications
    expect(container.textContent).toContain('Notifications');
  });

  it('ends the tour quietly if every remaining anchor is missing', async () => {
    anchors.forEach(a => a.remove());
    anchors = [];
    sessionStorage.setItem(TOUR_PENDING_FLAG_KEY, '1');
    ({ container, root } = await mount());
    expect(container.textContent).toBe('');
  });

  it('nudges the mobile nav drawer open when the sidebar anchor is off-canvas', async () => {
    const sidebarEl = document.querySelector('[data-tour="sidebar"]');
    vi.spyOn(sidebarEl, 'getBoundingClientRect').mockReturnValue({ top: 0, left: -270, width: 260, height: 600 });
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    sessionStorage.setItem(TOUR_PENDING_FLAG_KEY, '1');
    ({ container, root } = await mount());
    expect(dispatchSpy.mock.calls.some(c => c[0].type === 'mf:toggleNav')).toBe(true);
  });
});
