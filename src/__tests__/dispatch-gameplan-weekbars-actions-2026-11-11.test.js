// @ts-nocheck
// Owner feedback on Game Plan (2026-11-11, live in the app): "can we be more informative as to
// what the Your Week So Far is telling a story of? And for any items listed in 3 things worth a
// few minutes, this would be a great candidate area for live linking or additional context on
// click. And due to design choice, maybe we double the squares as check offs that show checked
// once viewed or drilled into." Renders the REAL CuratedHomePanel (GM altitude defaults to Game
// Plan), same mock-boundary discipline as curated-home-game-plan.test.js.
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { dKey } from '../utils/date.js';

const loadUserSettingMock = vi.fn();
const saveUserSettingMock = vi.fn();
vi.mock('../lib/supabase.js', () => ({
  loadUserSetting: (...args) => loadUserSettingMock(...args),
  saveUserSetting: (...args) => saveUserSettingMock(...args),
  loadInvCountSessions: async () => [],
  saveRecommendation: async () => ({ saved: 0, errors: [] }),
}));

function flag(id, over) {
  return { id, name: id, icon: '💰', category: 'controls', severity: 'RED',
    headline: `${id} headline`, detail: `${id} detail`, action: `${id} action`, ...over };
}
const BRIEF_FIXTURE = {
  stores: [{ loc: '3708', name: 'Ardmore-Broadway', hasData: true,
    flags: [
      flag('CASH_OS', { severity: 'RED', headline: 'Cash O/S short by $105.84' }),
      flag('DRAWER_OPENS', { severity: 'AMBER', headline: '8 drawer opens' }),
    ] }],
  summary: { red: 1, amber: 1, green: 0, noData: 0, totalFlags: 2 },
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

// Three distinct days in the same trailing-week window curated-home-game-plan.test.js's own
// "shows a real win line" test already confirms lands inside computeGamePlanWeek's range on
// today's real system clock -- one at/above plan, one close, one clearly behind.
const qsrActSummaryRows = [
  { loc: '3708', date: new Date('2026-11-04T12:00:00'), sales: 11000, projSales: 10000, lySales: 9000 },
  { loc: '3708', date: new Date('2026-11-05T12:00:00'), sales: 9300, projSales: 10000, lySales: 9000 },
  { loc: '3708', date: new Date('2026-11-06T12:00:00'), sales: 7000, projSales: 10000, lySales: 9000 },
];

describe('Game Plan — "Your Week So Far" tells a story (owner feedback 2026-11-11)', () => {
  it('shows a color legend, the real %-of-plan number under each bar (not just a hover title), and a one-line rollup', async () => {
    await mount({ ds: { loaded: true, qsrActSummaryRows } });
    const text = container.textContent;
    expect(text).toContain('At/above plan');
    expect(text).toContain('Close (90–99%)');
    expect(text).toContain('Behind plan');
    // Real numbers, visible in text content -- not locked inside a `title` attribute only.
    expect(text).toContain('110%'); // 11000/10000
    expect(text).toContain('93%');  // 9300/10000
    expect(text).toContain('70%');  // 7000/10000
    expect(text).toMatch(/\d+ of \d+ days? at or above plan/);
    expect(text).toContain('worst was'); // a clearly-behind day (70%) names itself
  });
});

describe('Game Plan — "3 things worth a few minutes" drill-through + review checkbox (owner feedback 2026-11-11)', () => {
  it('an item whose rule maps to a real panel shows a "Go to X" link that calls onNav AND marks it reviewed', async () => {
    const onNav = vi.fn();
    await mount({ onNav });
    expect(container.textContent).toContain('Go to Security');
    const goBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Go to Security'));
    expect(goBtn).toBeTruthy();
    await act(async () => { goBtn.click(); });
    expect(onNav).toHaveBeenCalledWith('security');
    // Drilling in counts as reviewing -- the checkbox for THAT item is now checked (✓).
    const checkboxes = [...container.querySelectorAll('button[aria-label]')].filter(b => /reviewed/i.test(b.getAttribute('aria-label')));
    expect(checkboxes.some(b => b.textContent === '✓')).toBe(true);
  });

  it('clicking the square itself toggles reviewed on and off, independent of drill-through', async () => {
    await mount({});
    const checkbox = container.querySelector('button[aria-label="Mark as reviewed"]');
    expect(checkbox).toBeTruthy();
    await act(async () => { checkbox.click(); });
    expect(container.querySelector('button[aria-label="Mark as not reviewed"]').textContent).toBe('✓');
    await act(async () => { container.querySelector('button[aria-label="Mark as not reviewed"]').click(); });
    expect(container.querySelector('button[aria-label="Mark as reviewed"]').textContent).toBe('');
  });

  it('reviewed state is scoped to TODAY, not the bare item id -- a stale check from a different day never carries over', async () => {
    // Item id is loc+ruleId (not date-scoped); simulate a prior day's check under yesterday's key.
    const itemId = '3708:CASH_OS';
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    localStorage.setItem('mf_gameplan_viewed_' + dKey(yesterday), JSON.stringify({ [itemId]: true }));
    await mount({});
    // Today's render must NOT inherit yesterday's check for the same item id.
    const checkbox = container.querySelector('button[aria-label="Mark as reviewed"]');
    expect(checkbox, 'expected an unreviewed checkbox today despite a stale check under yesterday\'s key').toBeTruthy();
  });
});
