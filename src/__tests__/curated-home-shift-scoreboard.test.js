// @ts-nocheck
// Shift Scoreboard (task #122, owner-confirmed 2026-11-08: "Agree with your response. Go
// ahead") -- the new SM/AM/DM-selectable store format, layered on CuratedHomePanel the same way
// Game Plan was (curated-home-game-plan.test.js). Render-level against the REAL panel, mocking
// only the Supabase/morning-brief boundary.
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

const loadUserSettingMock = vi.fn();
const saveUserSettingMock = vi.fn();
vi.mock('../lib/supabase.js', () => ({
  loadUserSetting: (...args) => loadUserSettingMock(...args),
  saveUserSetting: (...args) => saveUserSettingMock(...args),
  loadInvCountSessions: async () => [],
  saveRecommendation: async () => ({ saved: 0, errors: [] }),
}));

const BRIEF_FIXTURE = {
  stores: [{ loc: '3708', name: 'Ardmore-Broadway', hasData: true, flags: [] }],
  summary: { red: 0, amber: 0, green: 1, noData: 0, totalFlags: 0 },
};
vi.mock('../features/morning-brief.js', () => ({
  computeMorningBrief: () => BRIEF_FIXTURE,
  getLatestBriefDate: () => new Date('2026-11-08T12:00:00'),
  useBriefDarByLoc: () => ({}),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { CuratedHomePanel } = await import('../views/curated-home.js');

let container, root;
beforeEach(() => {
  loadUserSettingMock.mockReset().mockResolvedValue(null);
  saveUserSettingMock.mockReset().mockResolvedValue(undefined);
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
  await act(async () => {
    root.render(React.createElement(CuratedHomePanel, { ds: {}, settings: {}, role: 'sm_am_dm', darRows: [], ...props }));
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  });
}

describe('CuratedHomePanel — Shift Scoreboard format', () => {
  it('is offered in the store-altitude format picker', async () => {
    await mount({});
    const labels = [...container.querySelectorAll('button')].map(b => b.textContent);
    expect(labels).toContain('Shift Scoreboard');
  });

  it('switching to it renders the real resolved store name and a Customize control', async () => {
    await mount({});
    const btn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Shift Scoreboard');
    expect(btn).toBeTruthy();
    await act(async () => { btn.click(); });
    expect(container.textContent).toContain('Ardmore-Broadway');
    expect(container.textContent).toContain('Shift Scoreboard');
    const customize = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Customize'));
    expect(customize).toBeTruthy();
  });

  it('an existing saved format preference is never overridden by it', async () => {
    loadUserSettingMock.mockResolvedValue('checklist');
    await mount({});
    expect(container.textContent).not.toContain('⚙ Customize');
  });

  it('is never offered at patch or district altitude', async () => {
    await mount({ role: 'area_supervisor' });
    const labels = [...container.querySelectorAll('button')].map(b => b.textContent);
    expect(labels).not.toContain('Shift Scoreboard');
  });

  it('clicking Customize reveals every catalog metric as a checkbox, all checked by default', async () => {
    await mount({});
    const btn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Shift Scoreboard');
    await act(async () => { btn.click(); });
    const gear = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Customize'));
    await act(async () => { gear.click(); });
    const checkboxes = [...container.querySelectorAll('input[type="checkbox"]')];
    expect(checkboxes.length).toBeGreaterThanOrEqual(10); // SCOREBOARD_METRICS catalog size
    expect(checkboxes.every(c => c.checked)).toBe(true);
  });

  it('unchecking a metric removes its tile and persists the new visible set', async () => {
    await mount({});
    const btn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Shift Scoreboard');
    await act(async () => { btn.click(); });
    expect(container.textContent).toContain('OEPE');
    const gear = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Customize'));
    await act(async () => { gear.click(); });
    const oepeLabel = [...container.querySelectorAll('label')].find(l => l.textContent.includes('OEPE'));
    const checkbox = oepeLabel.querySelector('input[type="checkbox"]');
    await act(async () => { checkbox.click(); });
    expect(saveUserSettingMock).toHaveBeenCalledWith('curated_home_scoreboard_metrics', expect.not.arrayContaining(['oepe']));
  });
});
