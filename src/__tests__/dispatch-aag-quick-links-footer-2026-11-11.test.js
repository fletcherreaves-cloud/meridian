// @vitest-environment happy-dom
// @ts-nocheck
// Task #133 (owner request 2026-11-08): surface 3 external operational links on At A Glance —
// atMcd (McDonald's Intranet), MBSync (Martin Brower truck ordering), PACE Portal. Owner offered
// sidebar or AAG footer, delegated the pick to Claude: AAG footer, since the sidebar is mid
// "lean and mean" cleanup and AAG is the page everyone actually lands on. Renders the real
// AtAGlance component and asserts the real anchors render with the real URLs/target, not a
// hand-rolled stand-in.
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { AtAGlance } from '../views/at-a-glance.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('At A Glance — operational Quick Links footer', () => {
  let container, root;
  const day = n => new Date(2026, 9, n, 12);
  const NOOP = () => {};
  const baseProps = {
    stores: [{ loc: '10422' }],
    ds: { loaded: false },
    settings: { weekStartDay: 3 },
    userEvents: [],
    lockedProjections: {},
    dateRange: { s: day(1), e: day(9), label: 'MTD' },
    onOpenStore: NOOP, onCoachingSaved: NOOP, onOpenProjections: NOOP,
    onOpenPVSA: NOOP, onOpenBrief: NOOP, onNav: NOOP, onOpenModal: NOOP,
  };

  afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

  it('renders atMcd, MBSync, and PACE Portal as real external links', async () => {
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
    await act(async () => { root.render(React.createElement(AtAGlance, baseProps)); });

    const links = [...container.querySelectorAll('a')];
    const byLabel = label => links.find(a => a.textContent.trim() === label);

    const atMcd = byLabel('atMcd');
    expect(atMcd, 'atMcd link not found').toBeTruthy();
    expect(atMcd.getAttribute('href')).toBe('https://www.atmcd.com/');
    expect(atMcd.getAttribute('target')).toBe('_blank');
    expect(atMcd.getAttribute('rel')).toBe('noopener noreferrer');

    const mbSync = byLabel('MBSync');
    expect(mbSync, 'MBSync link not found').toBeTruthy();
    expect(mbSync.getAttribute('href')).toBe('https://martinbrower.my.site.com/Sync/s/aggregatehomepage');

    const pace = byLabel('PACE Portal');
    expect(pace, 'PACE Portal link not found').toBeTruthy();
    expect(pace.getAttribute('href')).toBe('https://pace.mcd.com/login');
  });
});
