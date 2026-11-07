// @ts-nocheck
// Curated Home Phase 2 (task #106, owner ask 2026-11-07: "more graphical... tiles/mini tiles...
// clickable links back to relevant data"). Render-level tests against the REAL CuratedHomePanel
// (this repo's own "would this verification still pass if reverted?" rule) -- mocks only the
// Supabase/morning-brief boundary, never the panel or the role-voice engine themselves.
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

vi.mock('../lib/supabase.js', () => ({
  loadUserSetting: async () => null,
  saveUserSetting: async () => ({}),
}));

function flag(id, over) {
  return { id, name: id, icon: '💰', category: 'controls', severity: 'RED',
    headline: `${id} headline`, detail: `${id} detail`, action: `${id} action`, ...over };
}
function store(loc, name, hasData, flags) {
  return { loc, name, hasData, flags: flags || [] };
}

const BRIEF_FIXTURE = {
  stores: [
    store('3708', 'Ardmore-Broadway', true, [flag('DRAWER_OPENS', { severity: 'RED', headline: '19 drawer opens' })]),
    store('5183', 'Chickasha', true, [flag('DAYPART_OEPE', { severity: 'AMBER', headline: 'Evening OEPE drift' })]),
  ],
  summary: { red: 1, amber: 1, green: 0, noData: 0, totalFlags: 2 },
};

vi.mock('../features/morning-brief.js', () => ({
  computeMorningBrief: () => BRIEF_FIXTURE,
  getLatestBriefDate: () => '2026-11-06',
  useBriefDarByLoc: () => ({}),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { CuratedHomePanel } = await import('../views/curated-home.js');

function mountRoot() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return { container, root: createRoot(container) };
}
async function renderPanel(root, props) {
  await act(async () => {
    root.render(React.createElement(CuratedHomePanel, { ds: {}, settings: {}, role: 'gm', darRows: [], ...props }));
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  });
  // Game Plan (owner request 2026-11-07) is now the front-facing default at store altitude --
  // this whole file exercises Checklist/Bullets/Narrative specifically (Game Plan has its own
  // dedicated test file), so every test here switches to Checklist right after mount, exactly
  // as a real GM clicking the always-present format picker would. document.body is scoped to
  // this one test's own container (beforeEach/afterEach append/remove exactly one per test).
  const checklistBtn = [...document.body.querySelectorAll('button')].find(b => b.textContent === 'Checklist');
  if (checklistBtn) await act(async () => { checklistBtn.click(); });
}

describe('Curated Home Phase 2 — graphical summary + drill-through', () => {
  let container, root;
  beforeEach(() => { ({ container, root } = mountRoot()); });
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

  it('shows real store counts in the summary stat tiles, not just icons', async () => {
    await renderPanel(root);
    expect(container.textContent).toContain('Red stores');
    expect(container.textContent).toContain('Amber stores');
    expect(container.textContent).toContain('Green stores');
    // Real numbers from the fixture's summary, not a placeholder:
    const counts = [...container.querySelectorAll('span')].filter(el => el.textContent.trim() === '1');
    expect(counts.length).toBeGreaterThanOrEqual(2); // red:1, amber:1
  });

  it('renders each flagged item as a tile with its headline, detail, and affected store', async () => {
    await renderPanel(root);
    expect(container.textContent).toContain('19 drawer opens');
    expect(container.textContent).toContain('DRAWER_OPENS detail');
    expect(container.textContent).toContain('Ardmore-Broadway');
  });

  it('renders the Bullets format as tiles too (same ItemCard), not a plain <li> list', async () => {
    await renderPanel(root);
    const bulletsBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Bullets');
    await act(async () => { bulletsBtn.click(); });
    expect(container.querySelector('li')).toBeNull(); // old plain-<li> treatment is gone
    expect(container.textContent).toContain('19 drawer opens');
  });

  it('a drill-through link calls onNav with the real panel-registry id for the item\'s rule', async () => {
    const onNav = vi.fn();
    await renderPanel(root, { onNav });
    const securityLink = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Go to Security'));
    expect(securityLink, 'Security drill-through link not found for DRAWER_OPENS').toBeTruthy();
    await act(async () => { securityLink.click(); });
    expect(onNav).toHaveBeenCalledWith('security');

    const sosLink = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Go to DT Speed of Service'));
    expect(sosLink, 'DT Speed of Service drill-through link not found for DAYPART_OEPE').toBeTruthy();
    await act(async () => { sosLink.click(); });
    expect(onNav).toHaveBeenCalledWith('dt-sos');
  });

  it('renders no drill-through links at all when onNav is not supplied (no dead buttons)', async () => {
    await renderPanel(root); // no onNav prop
    const anyGoTo = [...container.querySelectorAll('button')].find(b => b.textContent.startsWith('Go to '));
    expect(anyGoTo).toBeFalsy();
  });

  it('Narrative format still reads as prose but includes a drill-through chip row', async () => {
    const onNav = vi.fn();
    await renderPanel(root, { onNav });
    const narrativeBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Narrative');
    await act(async () => { narrativeBtn.click(); });
    expect(container.querySelector('p')).toBeTruthy(); // still real prose
    const securityLink = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Go to Security'));
    expect(securityLink).toBeTruthy();
  });
});
