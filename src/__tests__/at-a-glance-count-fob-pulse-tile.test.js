// @vitest-environment happy-dom
// @ts-nocheck
// Owner req (2026-10-12): "a new tile on AAG for Daily Weekly (toggle on tile) would be sweet."
// CountFobPulseTile (at-a-glance.js) is a separate, always-on tile (NOT month-end-gated like
// EOMScoreboardTile) with its own Day/Week toggle, reusing the SAME engines (cycleCompliance,
// fobDailyTrace) the EOM Dashboard's own Scoreboard Weekly/Daily view uses, so the two can never
// disagree. Renders the REAL AtAGlance -> CountFobPulseTile call site, not the component in
// isolation, per this repo's "verification must touch the call site" rule.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const today = new Date(2026, 9, 12, 12); // Oct 12 2026, matches the fixture dates below
const todayStr = '2026-10-12';

const ONHAND = [
  { loc: '3708', wrin: 'F1', cls: 'Food', active: true, lastCounted: todayStr },
  { loc: '3708', wrin: 'C1', cls: 'Condiment', active: true, lastCounted: todayStr },
  { loc: '5183', wrin: 'F1', cls: 'Food', active: true, lastCounted: '2026-09-01' },
  { loc: '5183', wrin: 'C1', cls: 'Condiment', active: true, lastCounted: '2026-09-01' },
];

vi.mock('../lib/supabase.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    loadQsrOnHand: () => Promise.resolve(ONHAND),
    loadQsrRawItemDetail: () => Promise.resolve([]),
    loadQsrVarianceStat: () => Promise.resolve([]),
  };
});

const { AtAGlance } = await import('../views/at-a-glance.js');
const h = React.createElement;

const NOOP = () => {};
const baseProps = {
  stores: [{ loc: '3708' }, { loc: '5183' }],
  settings: { weekStartDay: 3 },
  userEvents: [],
  lockedProjections: {},
  dateRange: { s: new Date(2026, 9, 1), e: new Date(2026, 9, 12), label: 'MTD' },
  onOpenStore: NOOP, onCoachingSaved: NOOP, onOpenProjections: NOOP,
  onOpenPVSA: NOOP, onOpenBrief: NOOP, onNav: NOOP, onOpenModal: NOOP,
};
const ds = {
  loaded: true,
  qsrActSummaryRows: [{ loc: '3708', date: new Date(2026, 9, 1) }],
  qsrFobRows: [
    { loc: '3708', date: '2026-10-11', prodSalesAmt: 10000, compWasteAmt: 300, rawWasteAmt: 0, condimentsAmt: 0, empMgrMealsAmt: 0, statVarianceAmt: 0, unexplainedAmt: 0 },
    { loc: '3708', date: '2026-10-12', prodSalesAmt: 20000, compWasteAmt: 500, rawWasteAmt: 0, condimentsAmt: 0, empMgrMealsAmt: 0, statVarianceAmt: 0, unexplainedAmt: 0 },
  ],
};

describe('Count & FOB Pulse tile (dispatch 2026-10-12)', () => {
  let container, root;
  beforeEach(() => {
    vi.setSystemTime(today);
    localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.useRealTimers(); });

  const render = async () => {
    await act(async () => { root.render(h(AtAGlance, { ...baseProps, ds })); await new Promise(r => setTimeout(r, 0)); });
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
  };

  it('renders the tile with a Day/Week toggle, defaulting to Week', async () => {
    await render();
    expect(container.textContent).toContain('Count & FOB Pulse');
    const dayBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Day');
    const weekBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Week');
    expect(dayBtn).toBeTruthy();
    expect(weekBtn).toBeTruthy();
  });

  it('Week view shows a weekly complete/overdue/never breakdown', async () => {
    await render();
    expect(container.textContent).toMatch(/Complete/);
    expect(container.textContent).toMatch(/Overdue/);
  });

  it('clicking Day shows a "Counted today" count instead', async () => {
    await render();
    const dayBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Day');
    await act(async () => { dayBtn.click(); });
    expect(container.textContent).toMatch(/Counted today/);
    // 3708 counted today, 5183 did not -> 1/2.
    expect(container.textContent).toContain('1/2');
  });
});
