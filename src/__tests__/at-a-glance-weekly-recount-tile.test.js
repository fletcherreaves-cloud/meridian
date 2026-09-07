// @vitest-environment happy-dom
// @ts-nocheck
// backlog-open-2026-09-06.md #246 "Items Recounted tile hidden ~21 days/month" -- owner-directed
// 2026-09-07: "I would like to see it put into effect for weekly counts as well." The tile
// (at-a-glance.js's ItemsRecountedTile) was gated to a district-wide EOM close window (last 3
// days of month + first week after); it now runs always, with a per-store window anchored to
// each store's own most recent complete weekly count (weeklyRecountWindows(), count-cycle.js).
//
// Renders the REAL AtAGlance -> ItemsRecountedTile call site (this repo's "verification must
// touch the call site" rule) against a mocked lib/supabase.js, not just weeklyRecountWindows()
// in isolation -- a test that only called the engine function would still pass unchanged if the
// tile were never wired to it.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Store 3708 has a full active universe of 20 Food / 20 Condiment (small, so 95% needs 19/20).
// Weekly count on 09-01 covers all 20+20 (100%, clears COVER_FRAC=0.95) -- qualifies. A recount
// on 09-02 for one item found MORE inventory (moved the loss toward zero) -> "helped".
// Store 5183 never reaches 95% coverage this period (only 10/20 Food) -> excluded entirely.
const onHandRow = (loc, cls, wrin, date) => ({ loc, cls, wrin, active: true, last_counted: date });
function onHandFixture() {
  const rows = [];
  for (let i = 0; i < 20; i++) {
    rows.push(onHandRow('3708', 'Food', `F${i}`, '2026-09-01'));
    rows.push(onHandRow('3708', 'Condiment', `C${i}`, '2026-09-01'));
  }
  for (let i = 0; i < 10; i++) rows.push(onHandRow('5183', 'Food', `F${i}`, '2026-09-01'));
  for (let i = 0; i < 20; i++) rows.push(onHandRow('5183', 'Condiment', `C${i}`, '2026-09-01'));
  return rows;
}

const cnt = (dt, dolVar) => ({ isCount: true, dt, tm: '10:00', difference: dolVar, variance: null });
function rawDetailFixture() {
  return [
    // 3708: counted -300 on the weekly count day, re-verified 2 days later and found more (-80) -> helped.
    { loc: '3708', wrin: 'F0', descr: 'Test Item', cls: 'food',
      history: [cnt('2026-09-01', -300), cnt('2026-09-03', -80)] },
    // 5183 has raw detail too, but no qualifying window -> must not contribute to the tile at all.
    { loc: '5183', wrin: 'F0', descr: 'Other Item', cls: 'food',
      history: [cnt('2026-09-01', -300), cnt('2026-09-03', -80)] },
  ];
}

vi.mock('../lib/supabase.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    loadQsrOnHand: () => Promise.resolve(onHandFixture()),
    loadQsrRawItemDetail: () => Promise.resolve(rawDetailFixture()),
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
  dateRange: { s: new Date(2026, 8, 1), e: new Date(2026, 8, 4), label: 'MTD' },
  onOpenStore: NOOP, onCoachingSaved: NOOP, onOpenProjections: NOOP,
  onOpenPVSA: NOOP, onOpenBrief: NOOP, onNav: NOOP, onOpenModal: NOOP,
};

describe('Items Recounted tile — per-store weekly window (owner-directed 2026-09-07)', () => {
  let container, root;
  beforeEach(() => {
    vi.setSystemTime(new Date(2026, 8, 4, 12)); // Sep 4 2026, mid-month -- NOT the EOM close window
    localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
    vi.useRealTimers();
  });

  // Past AtAGlance's own noData gate (!ds.laborRows.length && !ds.qsrActSummaryRows.length) --
  // same minimal fixture shape at-a-glance-checklist-freshness.test.js's freshDs() uses.
  const ds = { loaded: true, qsrActSummaryRows: [{ loc: '3708', date: new Date(2026, 8, 1) }] };

  it('shows recount activity mid-month, outside the old EOM close window', async () => {
    await act(async () => {
      root.render(h(AtAGlance, { ...baseProps, ds }));
      await new Promise(r => setTimeout(r, 0));
    });
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });

    expect(container.textContent).toContain('Items Recounted');
    // Only 3708 qualified (full 95%+ coverage) and it had one recounted item, moved toward zero.
    expect(container.textContent).toMatch(/helped|recovered/i);
  });

  it('excludes a store with no qualifying weekly count from the total', async () => {
    await act(async () => {
      root.render(h(AtAGlance, { ...baseProps, ds }));
      await new Promise(r => setTimeout(r, 0));
    });
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });

    // 1 store contributing (3708), not 2 -- 5183's raw detail exists but has no qualifying window.
    expect(container.textContent).toMatch(/1\s*stores?/);
  });
});
