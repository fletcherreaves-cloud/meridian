// @ts-nocheck
// Game Plan (owner request 2026-11-07) -- the new front-facing GM/SM/AM/DM home screen, layered
// on top of the existing CuratedHomePanel (task #92/#106). Render-level tests against the REAL
// panel, mocking only the Supabase/morning-brief boundary -- same discipline as
// curated-home-phase2-2026-11-07.test.js.
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
}));

function flag(id, over) {
  return { id, name: id, icon: '💰', category: 'controls', severity: 'RED',
    headline: `${id} headline`, detail: `${id} detail`, action: `${id} action`, ...over };
}
let BRIEF_FIXTURE = {
  stores: [{ loc: '3708', name: 'Ardmore-Broadway', hasData: true,
    flags: [flag('DRAWER_OPENS', { severity: 'RED', headline: '19 drawer opens — HIGH cash integrity risk' })] }],
  summary: { red: 1, amber: 0, green: 0, noData: 0, totalFlags: 1 },
};
vi.mock('../features/morning-brief.js', () => ({
  computeMorningBrief: () => BRIEF_FIXTURE,
  getLatestBriefDate: () => new Date('2026-11-06T12:00:00'),
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
    root.render(React.createElement(CuratedHomePanel, { ds: {}, settings: {}, role: 'gm', darRows: [], ...props }));
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  });
}

describe('CuratedHomePanel — Game Plan default (owner request 2026-11-07)', () => {
  it('a fresh GM login with no saved format preference lands on Game Plan, with the real flagged item as "today\'s one thing"', async () => {
    await mount({});
    expect(container.textContent).toContain('19 drawer opens');
    expect(container.textContent).toContain('Ardmore-Broadway');
    expect(container.textContent).toContain("Today's one thing");
    // NOT the old generic Checklist/Bullets/Narrative shell for this default render:
    expect(container.querySelector('.ch-item')).toBeFalsy();
  });

  it('an existing saved format preference (e.g. "narrative") is NEVER overridden by the new default', async () => {
    loadUserSettingMock.mockResolvedValue('narrative');
    await mount({});
    expect(container.textContent).toContain('19 drawer opens');
    expect(container.querySelector('p')).toBeTruthy(); // narrative's own prose shape
    expect(container.textContent).not.toContain("Today's one thing");
  });

  it('"See everything flagged" switches to the full Checklist, same underlying facts', async () => {
    await mount({});
    const seeAll = [...container.querySelectorAll('button')].find(b => b.textContent.includes('See everything flagged'));
    expect(seeAll).toBeTruthy();
    await act(async () => { seeAll.click(); });
    expect(container.querySelector('.ch-item')).toBeTruthy();
    expect(container.textContent).toContain('19 drawer opens');
  });

  it('the format picker never offers "Game Plan" at patch or district altitude', async () => {
    await mount({ role: 'area_supervisor' });
    const labels = [...container.querySelectorAll('button')].map(b => b.textContent);
    expect(labels).not.toContain('Game Plan');
    await act(async () => { root.unmount(); });
    container.remove();
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
    await mount({ role: 'admin' });
    const labels2 = [...container.querySelectorAll('button')].map(b => b.textContent);
    expect(labels2).not.toContain('Game Plan');
  });

  it('zero flagged items gets an honest all-clear, never a fabricated priority', async () => {
    BRIEF_FIXTURE = { stores: [{ loc: '3708', name: 'Ardmore-Broadway', hasData: true, flags: [] }],
      summary: { red: 0, amber: 0, green: 1, noData: 0, totalFlags: 0 } };
    await mount({});
    expect(container.textContent).toContain('Nothing flagged today');
    expect(container.textContent).toContain('Steady as she goes');
  });

  it('greets the signed-in user by name when userName is provided', async () => {
    await mount({ userName: 'Maria' });
    expect(container.textContent).toContain('Maria');
  });

  it('shows a real win line only when the trailing-week vs-LY comparison is clearly positive', async () => {
    const qsrActSummaryRows = [
      { loc: '3708', date: new Date('2026-11-04T12:00:00'), sales: 11000, projSales: 10000, lySales: 9000 },
    ];
    await mount({ ds: { loaded: true, qsrActSummaryRows } });
    expect(container.textContent).toContain('vs last year');
  });
});
