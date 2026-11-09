// @vitest-environment happy-dom
// @ts-nocheck
// Task #129 — the Spot-Check Ruler's Curated Home prompt, real-render test. Proves the prompt
// banner actually renders through the mounted CuratedHomePanel (not just that
// freshCountSessionPrompts() returns the right data — src/__tests__/spot-check-ruler.test.js
// already covers that pure logic) and that clicking it opens the real SpotCheckRulerModal.
// Per CLAUDE.md's "would this verification still pass if reverted?" rule, this renders through
// the actual consumer, not just the engine.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

const loadUserSettingMock = vi.fn();
const saveUserSettingMock = vi.fn();
const loadInvCountSessionsMock = vi.fn();

vi.mock('../lib/supabase.js', () => ({
  loadUserSetting: (...args) => loadUserSettingMock(...args),
  saveUserSetting: (...args) => saveUserSettingMock(...args),
  loadInvCountSessions: (...args) => loadInvCountSessionsMock(...args),
  saveRecommendation: async () => ({ saved: 0, errors: [] }),
  // SpotCheckRulerModal's own data loads — "nothing on record" keeps the modal's render simple
  // and deterministic for this test (it's testing that the modal OPENS and renders the
  // worksheet shell, not the full data-assembly path — spot-check-ruler.test.js covers that).
  loadQsrVarianceStat: async () => [],
  loadQsrFob: async () => [],
  loadMonthlyTargets: async () => ({}),
  loadSpotCheckRulerNote: async () => null,
  saveSpotCheckRulerNote: async () => ({ saved: false, error: 'no table' }),
  createEomShareLink: async () => ({ error: 'no-db' }),
}));

const BRIEF = {
  stores: [{ loc: '3708', name: 'Ardmore-Broadway', hasData: true, flags: [] }],
  summary: { red: 0, amber: 0, green: 1, noData: 0, totalFlags: 0 },
};
vi.mock('../features/morning-brief.js', () => ({
  computeMorningBrief: () => BRIEF,
  getLatestBriefDate: () => new Date('2026-11-06T12:00:00'),
  useBriefDarByLoc: () => ({}),
}));

import { CuratedHomePanel } from '../views/curated-home.js';

let container, root;
beforeEach(() => {
  loadUserSettingMock.mockReset().mockResolvedValue(null);
  saveUserSettingMock.mockReset().mockResolvedValue(undefined);
  loadInvCountSessionsMock.mockReset().mockResolvedValue([]);
  try { localStorage.clear(); } catch {}
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
});

async function mount(props) {
  await act(async () => { root.render(React.createElement(CuratedHomePanel, props)); });
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await Promise.resolve(); });
}

// A qualifying weekly session (Food + Condiment both covered) one day before the mocked
// "today" (2026-11-06), well inside freshCountSessionPrompts()'s default 2-day window.
const FRESH_SESSION_ROWS = [
  { loc: '3708', countDate: '2026-11-05', cls: 'Food', period: '2026-11', itemsCounted: 50, classTotal: 50, covered: true },
  { loc: '3708', countDate: '2026-11-05', cls: 'Condiment', period: '2026-11', itemsCounted: 20, classTotal: 20, covered: true },
];

describe('CuratedHomePanel — Spot-Check Ruler prompt (task #129)', () => {
  it('shows nothing when no store has a fresh qualifying count session', async () => {
    await mount({ ds: {}, settings: {}, role: 'gm', darRows: [] });
    expect(container.textContent).not.toContain('Count Follow-Up');
    expect(container.textContent).not.toContain('run the Count Follow-Up');
  });

  it('prompts when a store just logged a fresh qualifying weekly count session', async () => {
    loadInvCountSessionsMock.mockImplementation(({ period } = {}) =>
      Promise.resolve(period === '2026-11' ? FRESH_SESSION_ROWS : []));
    await mount({ ds: {}, settings: {}, role: 'gm', darRows: [] });
    expect(container.textContent).toContain('Ardmore-Broadway');
    expect(container.textContent).toContain('Count Follow-Up');
    const openBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent === 'Open Follow-Up');
    expect(openBtn).toBeTruthy();
  });

  it('opens the real SpotCheckRulerModal worksheet on click', async () => {
    loadInvCountSessionsMock.mockImplementation(({ period } = {}) =>
      Promise.resolve(period === '2026-11' ? FRESH_SESSION_ROWS : []));
    await mount({ ds: {}, settings: {}, role: 'gm', darRows: [] });
    const openBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent === 'Open Follow-Up');
    await act(async () => { openBtn.click(); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(container.textContent).toContain('📋 Count Follow-Up');
    // The 7 real questions, verbatim from the owner's own example + the 2026-11-09 expansion.
    expect(container.textContent).toContain('What was FOB after you counted?');
    expect(container.textContent).toContain('What FOB component has the most opportunity for the current count?');
    expect(container.textContent).toContain('What were your biggest variance/stat items?');
    expect(container.textContent).toContain('What items did you recount?');
    expect(container.textContent).toContain('How confident are you in your counts?');
    expect(container.textContent).toContain('Did you review the reports (FOB, On Hand, Variance/Stat)?');
    expect(container.textContent).toContain('If yes, what did you find?');
  });

  it('never prompts for a partial/spot session, even a recent one', async () => {
    loadInvCountSessionsMock.mockImplementation(({ period } = {}) =>
      Promise.resolve(period === '2026-11'
        ? [{ loc: '3708', countDate: '2026-11-05', cls: 'Food', period: '2026-11', itemsCounted: 3, classTotal: 50, covered: false }]
        : []));
    await mount({ ds: {}, settings: {}, role: 'gm', darRows: [] });
    expect(container.textContent).not.toContain('Count Follow-Up');
  });
});
