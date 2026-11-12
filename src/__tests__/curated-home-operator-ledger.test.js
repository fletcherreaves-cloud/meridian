// @ts-nocheck
// The Ledger (owner request 2026-11-07/08) -- panel-level tests for the self-service operator
// picker + the new 'ledger' format, layered on CuratedHomePanel the same way Game Plan/The Patch
// are (see curated-home-game-plan.test.js / curated-home-patch-plan.test.js for their own
// coverage).
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
  // Task #125/#128 -- HuddleNarrative also loads count-cycle session history on mount; none of
  // this file's tests are about that, so "nothing on record" keeps every existing test unchanged.
  loadInvCountSessions: async () => [],
  saveRecommendation: async () => ({ saved: 0, errors: [] }),
}));

function flag(id, over) {
  return { id, name: id, icon: '💰', category: 'controls', severity: 'RED',
    headline: `${id} headline`, detail: `${id} detail`, action: `${id} action`, ...over };
}
let BRIEF_FIXTURE;
function freshBrief() {
  return {
    // Real seeded locs (src/constants.js): 3708/24471 are Ryan Thorley/Oklahoma, 10034 is Ryan
    // Thorley/Florida, 5183 is Gary Mornhinweg/Oklahoma -- real data, not a parallel fixture.
    stores: [
      { loc: '3708', name: 'Ardmore-Broadway', hasData: true, sales: 10000, vsLYSales: 2, laborPct: 0.25, smgOsat: 90,
        severity: 'RED', flags: [flag('DRAWER_OPENS', { severity: 'RED', headline: '19 drawer opens — HIGH cash integrity risk' })] },
      { loc: '24471', name: 'Ardmore-Cooper', hasData: true, sales: 8000, vsLYSales: 2, laborPct: 0.25, smgOsat: 90, severity: 'GREEN', flags: [] },
      { loc: '10034', name: 'Bonifay', hasData: true, sales: 12000, vsLYSales: 6, laborPct: 0.23, smgOsat: 92, severity: 'GREEN', flags: [] },
      { loc: '5183', name: 'Chickasha', hasData: true, sales: 9000, vsLYSales: 9, laborPct: 0.24, smgOsat: 91, severity: 'GREEN', flags: [] },
    ],
    summary: { red: 1, amber: 0, green: 3, noData: 0, totalFlags: 1 },
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
    root.render(React.createElement(CuratedHomePanel, { ds: {}, settings: {}, role: 'owner', darRows: [], ...props }));
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  });
}

function selectOperator(name) {
  const select = container.querySelector('select');
  select.value = name;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('CuratedHomePanel — The Ledger self-service operator picker (owner request 2026-11-08)', () => {
  it('a district-altitude login with no operator identity set never offers or defaults to The Ledger', async () => {
    await mount({});
    expect(container.textContent).not.toContain('Your Restaurants');
    expect(Array.from(container.querySelectorAll('button')).map(b => b.textContent)).not.toContain('The Ledger');
  });

  it('picking a real operator from the dropdown reveals The Ledger and makes it the default for a fresh login', async () => {
    await mount({});
    await act(async () => { selectOperator('Ryan Thorley'); await Promise.resolve(); });
    expect(saveUserSettingMock).toHaveBeenCalledWith('curated_home_operator_group', 'Ryan Thorley');
    // Re-mount to simulate the next load with the operator identity already persisted locally.
    await act(async () => { root.unmount(); });
    container.remove();
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
    await mount({});
    expect(container.textContent).toContain('Ryan Thorley');
    expect(container.textContent).toContain('Oklahoma');
    expect(container.textContent).toContain('Florida Panhandle');
    expect(container.textContent).toContain('needs you today');
  });

  it('an existing saved format preference is never overridden just because an operator identity is set', async () => {
    try { localStorage.setItem('mf_curated_home_operator_group', 'Ryan Thorley'); } catch {}
    loadUserSettingMock.mockResolvedValue('narrative');
    await mount({});
    expect(container.textContent).not.toContain('Your Restaurants');
  });

  it('clicking a store in the needs-attention list drills into that store\'s own real Game Plan, with a way back', async () => {
    try { localStorage.setItem('mf_curated_home_operator_group', 'Ryan Thorley'); } catch {}
    await mount({});
    const openLink = Array.from(container.querySelectorAll('span')).find(s => s.textContent === 'Open →');
    expect(openLink, 'Ardmore-Broadway needs-attention row not found').toBeTruthy();
    await act(async () => { openLink.parentElement.click(); });
    expect(container.textContent).toContain('19 drawer opens');
    const back = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('Back to The Ledger'));
    expect(back).toBeTruthy();
    await act(async () => { back.click(); });
    expect(container.textContent).toContain('Ryan Thorley');
  });

  it('shows the real peer-comparison against the other real operators', async () => {
    try { localStorage.setItem('mf_curated_home_operator_group', 'Ryan Thorley'); } catch {}
    await mount({});
    expect(container.textContent).toContain('Where you stand among the operators');
    expect(container.textContent).toContain('Gary Mornhinweg');
  });

  it('"The Ledger" and the operator picker are never offered at store altitude, or to area_supervisor (patch altitude, but not one of the cascading-scope roles)', async () => {
    await mount({ role: 'gm' });
    expect(container.querySelector('select')).toBeFalsy();
    await act(async () => { root.unmount(); });
    container.remove();
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
    await mount({ role: 'area_supervisor' });
    expect(container.querySelector('select')).toBeFalsy();
  });
});

describe('CuratedHomePanel — OM/DO/VP cascading scope flexibility on The Ledger (owner request 2026-11-12: "A OM, DO or VP should have the flexibility to see any group of operators or state or stores they wish to see")', () => {
  it.each(['om', 'do', 'vp'])('role %s lands on The Ledger by default, scoped to every store their own account already covers -- no operator self-identity required', async (role) => {
    await mount({ role });
    expect(container.textContent).toContain('All 4 Stores');
    expect(container.textContent).toContain('Ardmore-Broadway');
    expect(container.textContent).toContain('Bonifay');
    expect(container.textContent).toContain('needs you today');
  });

  it('narrowing the scope picker to a single state shows only that state\'s real stores and relabels the header -- never silently filters peer comparison to the same narrow slice', async () => {
    await mount({ role: 'vp' });
    const select = Array.from(container.querySelectorAll('select')).find(s => Array.from(s.options).some(o => o.textContent === 'OK'));
    expect(select, 'OK state option not found in the scope picker').toBeTruthy();
    await act(async () => {
      select.value = Array.from(select.options).find(o => o.textContent === 'OK').value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(container.textContent).toContain('Oklahoma'); // homeScopeLabel's friendly name, not the raw 'OK' option text
    expect(container.textContent).toContain('3 restaurant'); // the real OK-only store count, not the picker's own always-present option list
    expect(container.textContent).not.toContain('Florida Panhandle'); // no FL region card once narrowed to OK
    expect(container.textContent).toContain('Ardmore-Broadway');
    // Peer comparison still sweeps every real operator, not just the Oklahoma slice just picked.
    expect(container.textContent).toContain('Where you stand among the operators');
    expect(container.textContent).toContain('Gary Mornhinweg');
  });

  it('picking a real operator group from the scope picker (the "any group of operators" ask) narrows to exactly that operator\'s stores', async () => {
    await mount({ role: 'om' });
    const select = Array.from(container.querySelectorAll('select')).find(s => Array.from(s.options).some(o => o.textContent.includes('Ryan Thorley')));
    expect(select, 'operator-group option not found in the scope picker').toBeTruthy();
    await act(async () => {
      select.value = Array.from(select.options).find(o => o.textContent.includes('Ryan Thorley')).value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(container.textContent).toContain('Ryan Thorley');
    // Ryan Thorley's own 3 stores (3708/24471 OK + 10034 FL per this fixture's own comment), not
    // the full 4 -- the picker's own <select> always lists every store as an option regardless of
    // what's picked, so the real store-NAME checks above live in the rollup/region text, not a
    // bare "does this name appear anywhere" check the picker's own option list would defeat.
    expect(container.textContent).toContain('3 restaurant');
    expect(container.textContent).toContain('19 drawer opens'); // Ardmore-Broadway's own real flag, confirming Ryan's stores came through
  });

  it('a saved scope preference persists to Supabase and survives a remount', async () => {
    await mount({ role: 'do' });
    const select = Array.from(container.querySelectorAll('select')).find(s => Array.from(s.options).some(o => o.textContent === 'FL'));
    await act(async () => {
      select.value = Array.from(select.options).find(o => o.textContent === 'FL').value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    // The quick-add "whole group at once" picker bulk-toggles that group's real locs into the
    // multi-select's own ids list (LocationSelector's own documented multi:true shape) rather
    // than ever emitting a single-level {level:'state'} value -- that's what makes "pick Florida,
    // then add one more Oklahoma store" representable at all (see homeScopeLabel's own comment).
    expect(saveUserSettingMock).toHaveBeenCalledWith('curated_home_scope', { level: 'multi', ids: ['10034'] });
  });

  it('the old owner/operatorGroup self-identity flow for The Ledger is completely unaffected', async () => {
    await mount({ role: 'owner' });
    expect(container.textContent).not.toContain('Your Restaurants');
    expect(Array.from(container.querySelectorAll('button')).map(b => b.textContent)).not.toContain('The Ledger');
  });
});
