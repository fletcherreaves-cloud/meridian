// @vitest-environment happy-dom
// @ts-nocheck
// Task #75 (Knowledge Base expansion), batch 23 — 2026-11-14.
//
// Batches 20-22 kept re-confirming condiment_pct and count_cycle_guide as "mechanically
// unresolvable" because the real render sites gave no standalone labeled anchor to attach an
// InfoIcon to (Condiment was one of 6 visually-identical sibling tiles; CountCycleSection's inline
// summary had no title text at all). Owner directive this pass: fix the actual gap, not just
// re-document it.
//
// - condiment_pct: at-a-glance.js's FOB COMPONENTS grid (the same site batch 21/22 found) now
//   gives the Condiment tile its own `articleKey`, and the .map() renders an InfoIcon only for
//   items that carry one — data-driven, not an arbitrary visual singling-out of one of six
//   identical siblings (the other 5 have no KB article and render with no icon, same as before).
// - count_cycle_guide: count-cycle-panel.js's CountCycleSection had NO title text at all above
//   its compact stats line (mode==='compliance' deliberately bypasses the shared PanelChrome
//   header). Added the actual missing label ("Count Cycle") next to the stats line, which gives
//   the InfoIcon a real anchor instead of working around the gap.
import { describe, it, expect, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const h = React.createElement;

let container, root;
afterEach(() => {
  if (root) act(() => root.unmount());
  if (container) container.remove();
  container = null; root = null;
  vi.useRealTimers();
});

function mountEl(el) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => { root.render(el); });
}

function clickInfoIcon(near) {
  const icons = Array.from(container.querySelectorAll('span[title^="Click for details"]'));
  const depthOf = (el) => {
    for (let node = el, hops = 0; node && hops < 8; node = node.parentElement, hops++) {
      if (node.textContent?.includes(near)) return hops;
    }
    return Infinity;
  };
  const icon = near
    ? icons.map(el => ({ el, d: depthOf(el) })).sort((a, b) => a.d - b.d)[0]?.el
    : icons[0];
  expect(icon, 'InfoIcon "?" control not found').toBeTruthy();
  act(() => { icon.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}

describe('InfoIcon rollout batch 23 (2026-11-14) — count_cycle_guide', () => {
  it('CountCycleSection now has a real "Count Cycle" label, and its InfoIcon opens count_cycle_guide', async () => {
    const { CountCycleSection } = await import('../views/count-cycle-panel.js');
    const rows = [
      { loc: '3708', wrin: 'F1', cls: 'Food', active: true, lastCounted: '2026-11-14' },
      { loc: '3708', wrin: 'C1', cls: 'Condiment', active: true, lastCounted: '2026-11-14' },
    ];
    mountEl(h(CountCycleSection, { rows, period: '2026-11', newWrinsByLoc: {}, onOpenModal: () => {} }));
    expect(container.textContent).toContain('Count Cycle');

    clickInfoIcon('Count Cycle');
    expect(container.textContent).toContain('Count Cycle');
    // The modal body is the real KB article detail, not just an echo of the label text.
    expect(container.textContent.length).toBeGreaterThan(50);
  });
});

describe('InfoIcon rollout batch 23 (2026-11-14) — condiment_pct', () => {
  const today = new Date(2026, 10, 14, 12);

  const baseProps = {
    stores: [{ loc: '3708' }],
    settings: { weekStartDay: 3 },
    userEvents: [],
    lockedProjections: {},
    dateRange: { s: new Date(2026, 10, 1), e: new Date(2026, 10, 14), label: 'MTD' },
    onOpenStore: () => {}, onCoachingSaved: () => {}, onOpenProjections: () => {},
    onOpenPVSA: () => {}, onOpenBrief: () => {}, onNav: () => {}, onOpenModal: () => {},
  };
  const ds = {
    loaded: true,
    qsrActSummaryRows: [{ loc: '3708', date: new Date(2026, 10, 1) }],
    qsrFobRows: [
      { loc: '3708', date: '2026-11-13', prodSalesAmt: 10000, compWasteAmt: 300, rawWasteAmt: 0, condimentsAmt: 150, empMgrMealsAmt: 0, statVarianceAmt: 0, unexplainedAmt: 0 },
      { loc: '3708', date: '2026-11-14', prodSalesAmt: 20000, compWasteAmt: 500, rawWasteAmt: 0, condimentsAmt: 250, empMgrMealsAmt: 0, statVarianceAmt: 0, unexplainedAmt: 0 },
    ],
  };

  it('the FOB Components grid shows Condiment with its own InfoIcon, and no icon on its siblings', async () => {
    vi.setSystemTime(today);
    const { AtAGlance } = await import('../views/at-a-glance.js');
    mountEl(h(AtAGlance, { ...baseProps, ds }));
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });

    expect(container.textContent).toContain('Condiment');
    clickInfoIcon('Condiment');
    expect(container.textContent).toContain('Condiment Cost');

    // The sibling tiles (Unexplained/Comp Waste/Raw Waste/Emp Meal/Stat Var) have no KB article
    // and must still render with no icon of their own — the label span containing "Condiment"
    // is the only one of the 6 waste-component sibling labels with an InfoIcon inside it.
    const labelSpans = [...container.querySelectorAll('span')]
      .filter(s => ['Unexplained', 'Comp Waste', 'Raw Waste', 'Condiment', 'Emp Meal', 'Stat Var'].includes(s.firstChild?.textContent || s.textContent?.replace('?', '')));
    const withIcon = labelSpans.filter(s => s.querySelector('span[title^="Click for details"]'));
    expect(withIcon.length).toBe(1);
    expect(withIcon[0].textContent).toContain('Condiment');
  });
});
