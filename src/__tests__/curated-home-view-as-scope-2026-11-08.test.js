// @ts-nocheck
// @vitest-environment happy-dom
// Owner request 2026-11-08: narrowing the View As Role sandbox to a specific store/patch. This
// is the correctness half of that feature -- an admin/owner's own `ds` is unrestricted, so
// without viewAsScope, "View as GM" would arbitrarily show whichever store sorts first, and
// "View as DO" would show every store in the district as if it were one patch. Mounts the real
// CuratedHomePanel the same way curated-home-patch-plan.test.js does.
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
    // Real seeded locs (src/constants.js supervisorGroups()): 3708 + 24471 (Zukarr Eaves'
    // patch), 5183 (Krystiana Langford's patch) -- real current data, not a parallel fixture.
    stores: [
      { loc: '3708', name: 'Ardmore-Broadway', hasData: true, severity: 'RED',
        flags: [flag('DRAWER_OPENS', { severity: 'RED', headline: '19 drawer opens — HIGH cash integrity risk' })] },
      { loc: '24471', name: 'Ardmore-Cooper', hasData: true, severity: 'GREEN', flags: [] },
      { loc: '5183', name: 'Chickasha', hasData: true, severity: 'GREEN', flags: [] },
    ],
    summary: { red: 1, amber: 0, green: 2, noData: 0, totalFlags: 1 },
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
    root.render(React.createElement(CuratedHomePanel, { ds: {}, settings: {}, role: 'gm', darRows: [], ...props }));
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  });
}

describe('CuratedHomePanel — View As Role scope narrowing (owner request 2026-11-08)', () => {
  it('with no viewAsScope, a simulated GM sees whichever store has data (existing behavior, unchanged)', async () => {
    await mount({ role: 'gm' });
    expect(container.textContent).toContain('19 drawer opens');
  });

  it('viewAsScope narrows a store-altitude simulation to exactly that one real store', async () => {
    await mount({ role: 'gm', viewAsScope: '24471' });
    // 24471 (Ardmore-Cooper) has no flags -- Game Plan's own all-clear framing should show,
    // never 3708's drawer-opens headline leaking in just because it's the same patch/district.
    expect(container.textContent).not.toContain('19 drawer opens');
  });

  it('viewAsScope narrows a patch-altitude simulation to exactly that one real supervisor\'s patch', async () => {
    await mount({ role: 'do', viewAsScope: 'Zukarr Eaves' });
    const openLink = Array.from(container.querySelectorAll('span')).find(s => s.textContent === 'Open →');
    await act(async () => { openLink.parentElement.click(); });
    // Zukarr Eaves' patch is 3708 + 24471 -- Chickasha (5183, Krystiana Langford's patch)
    // must never appear once narrowed.
    expect(container.textContent).not.toContain('Chickasha');
  });

  it('an unrelated supervisor name narrows the patch to zero real stores -- an honest all-clear, never a fabricated one', async () => {
    await mount({ role: 'do', viewAsScope: 'Someone Not Real' });
    expect(container.textContent).toContain('Every store in your patch is clean right now');
  });
});
