// @vitest-environment happy-dom
// @ts-nocheck
// Fresh-eyes role audit (2026-11-11, memory/finding-fresh-eyes-role-audit-2026-11-11.md §2 Q3):
// "nothing I can find gives this cluster [Area Supervisor/OM/DO] a 'compare my patch to the
// OTHER patches' ranking on the home screen... nothing surfaces 'you're patch 3 of 5, here's
// why' unprompted." Renders the REAL PatchPlanFormat ("The Patch" -- the existing patch-altitude
// Curated Home front door, src/views/curated-home.js's format==='patch' branch), not just the
// computePatchStandings() engine function (already covered by patch-plan.test.js), per CLAUDE.md's
// "would this verification still pass if reverted" rule.
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { PatchPlanFormat } from '../views/patch-plan-view.js';
import { supervisorGroups } from '../constants.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function store(loc, name, over) {
  return { loc, name, hasData: true, severity: 'GREEN', sales: null, vsLYSales: null,
    laborPct: null, smgOsat: null, flags: [], ...over };
}

async function mount(props) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(React.createElement(PatchPlanFormat, props)); });
  return { container, root };
}

describe('The Patch — Patch Standings card', () => {
  let container, root;
  afterEach(() => { act(() => { root?.unmount(); }); container?.remove(); });

  it('renders a ranked Patch Standings list when the caller\'s own stores span 2+ real supervisors', async () => {
    const groups = supervisorGroups();
    const names = Object.keys(groups).filter(n => (groups[n] || []).length > 0);
    const locA = groups[names[0]][0], locB = groups[names[1]][0];
    const stores = [
      store(locA, 'Store A', { sales: 10000, vsLYSales: 25 }),
      store(locB, 'Store B', { sales: 10000, vsLYSales: -15 }),
    ];
    ({ container, root } = await mount({ ds: {}, stores, items: [], userName: 'Test User', onNav: () => {} }));
    expect(container.textContent).toContain('Patch Standings');
    expect(container.textContent).toContain(names[0]);
    expect(container.textContent).toContain(names[1]);
    expect(container.textContent).toContain('#1');
    expect(container.textContent).toContain('#2');
  });

  it('renders nothing from the card for a real, patch-restricted Area Supervisor (own stores all one patch)', async () => {
    const groups = supervisorGroups();
    const name = Object.keys(groups).find(n => (groups[n] || []).length >= 1);
    const stores = [store(groups[name][0], 'Store A', { sales: 1000, vsLYSales: 5 })];
    ({ container, root } = await mount({ ds: {}, stores, items: [], userName: 'Test User', onNav: () => {} }));
    expect(container.textContent).not.toContain('Patch Standings');
  });
});
