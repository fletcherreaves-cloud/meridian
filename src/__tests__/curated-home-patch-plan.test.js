// @ts-nocheck
// The Patch (owner request 2026-11-07, "build The Patch next") -- the new front-facing
// DO/OM/Area Supervisor home screen, layered on CuratedHomePanel the same way Game Plan is.
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
let BRIEF_FIXTURE;
function freshBrief() {
  return {
    // 3708 and 5183 are real seeded INV_ORG_COORDS stores (src/constants.js).
    stores: [
      { loc: '3708', name: 'Ardmore-Broadway', hasData: true, severity: 'RED',
        flags: [flag('DRAWER_OPENS', { severity: 'RED', headline: '19 drawer opens — HIGH cash integrity risk' })] },
      { loc: '5183', name: 'Chickasha', hasData: true, severity: 'GREEN', flags: [] },
    ],
    summary: { red: 1, amber: 0, green: 1, noData: 0, totalFlags: 1 },
  };
}
vi.mock('../features/morning-brief.js', () => ({
  computeMorningBrief: () => BRIEF_FIXTURE,
  getLatestBriefDate: () => new Date('2026-11-06T12:00:00'),
  useBriefDarByLoc: () => ({}),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { CuratedHomePanel } = await import('../views/curated-home.js');

let container, root;
beforeEach(() => {
  BRIEF_FIXTURE = freshBrief();
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
    root.render(React.createElement(CuratedHomePanel, { ds: {}, settings: {}, role: 'do', darRows: [], ...props }));
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  });
}

describe('CuratedHomePanel — The Patch default (owner request 2026-11-07)', () => {
  it('a fresh DO/OM/area_supervisor login with no saved preference lands on The Patch, with real store names and a real needs-attention count', async () => {
    await mount({});
    expect(container.textContent).toContain('Your Patch');
    expect(container.textContent).toContain('Ardmore-Broadway');
    expect(container.textContent).toContain('needs you today');
  });

  it('an existing saved format preference is never overridden by the new default', async () => {
    loadUserSettingMock.mockResolvedValue('narrative');
    await mount({});
    expect(container.textContent).not.toContain('Your Patch');
  });

  it('clicking a store in the needs-attention list drills into that store\'s own real Game Plan, with a way back', async () => {
    await mount({});
    // The row div (onClick) is the direct parent of its own "Open →" span -- querying for the
    // innermost element with that exact text and clicking its parent avoids matching an outer
    // wrapper div whose textContent happens to also contain both strings.
    const openLink = Array.from(container.querySelectorAll('span')).find(s => s.textContent === 'Open →');
    expect(openLink, 'Ardmore-Broadway needs-attention row not found').toBeTruthy();
    await act(async () => { openLink.parentElement.click(); });
    expect(container.textContent).toContain('19 drawer opens');
    expect(container.textContent).toContain("Today's one thing");
    const back = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('Back to The Patch'));
    expect(back).toBeTruthy();
    await act(async () => { back.click(); });
    expect(container.textContent).toContain('Your Patch');
  });

  it('"The Patch" is never offered in the format picker at store or district altitude', async () => {
    await mount({ role: 'gm' });
    expect(Array.from(container.querySelectorAll('button')).map(b => b.textContent)).not.toContain('The Patch');
    await act(async () => { root.unmount(); });
    container.remove();
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
    await mount({ role: 'admin' });
    expect(Array.from(container.querySelectorAll('button')).map(b => b.textContent)).not.toContain('The Patch');
  });

  it('a patch with every store clean shows an honest all-clear, never a fabricated attention item', async () => {
    BRIEF_FIXTURE = { stores: [{ loc: '3708', name: 'Ardmore-Broadway', hasData: true, flags: [] }],
      summary: { red: 0, amber: 0, green: 1, noData: 0, totalFlags: 0 } };
    await mount({});
    expect(container.textContent).toContain('Every store in your patch is clean right now');
  });
});
