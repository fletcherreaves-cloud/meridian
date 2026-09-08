// @vitest-environment happy-dom
// @ts-nocheck
// backlog-open-2026-09-06.md #246 "Items Recounted tile hidden ~21 days/month" -- owner-directed
// 2026-09-07: "I would like to see it put into effect for weekly counts as well." Then, v3
// (2026-09-08, Madill loc 13113, owner: "the different count data should be easy to get from
// the raw item detail... thought we already were"): dropped the qsr_onhand/inv_count_sessions
// store-level "weekly session" concept entirely. The tile now derives each item's own recount
// window INTRINSICALLY from qsr_raw_item_detail's own count-day clustering
// (ledgerBaselineDiff's `autoWindowDays`, eom-ledger-baseline.js) — no store-level window
// source needed at all, and no store is excluded up front; an item that doesn't cluster simply
// doesn't register as recounted.
//
// Renders the REAL AtAGlance -> ItemsRecountedTile call site (this repo's "verification must
// touch the call site" rule) against a mocked lib/supabase.js, not just ledgerScopeDiff() in
// isolation -- a test that only called the engine function would still pass unchanged if the
// tile were never wired to it.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const cnt = (dt, dolVar) => ({ isCount: true, dt, tm: '10:00', difference: dolVar, variance: null });
function rawDetailFixture() {
  return [
    // 3708: counted -300 on 09-01, re-verified 2 days later (within autoWindowDays=3) and found
    // more (-80) -> a real recount, moved toward zero -> "helped".
    { loc: '3708', wrin: 'F0', descr: 'Test Item', cls: 'food',
      history: [cnt('2026-09-01', -300), cnt('2026-09-03', -80)] },
    // 5183: also counted twice this period, but 19 days apart (far outside autoWindowDays) --
    // ordinary weekly-cadence recurrence, NOT a recount, and must not register as one.
    { loc: '5183', wrin: 'F0', descr: 'Other Item', cls: 'food',
      history: [cnt('2026-09-01', -300), cnt('2026-09-20', -80)] },
  ];
}

vi.mock('../lib/supabase.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
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

describe('Items Recounted tile — intrinsic per-item window from raw_item_detail alone (2026-09-08)', () => {
  let container, root;
  beforeEach(() => {
    vi.setSystemTime(new Date(2026, 8, 21, 12)); // Sep 21 2026 -- NOT the EOM close window
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
    // Only 3708's item clustered within autoWindowDays and moved toward zero.
    expect(container.textContent).toMatch(/helped|recovered/i);
  });

  it('does not count a store\'s far-apart (ordinary weekly-cadence) counts as a recount', async () => {
    await act(async () => {
      root.render(h(AtAGlance, { ...baseProps, ds }));
      await new Promise(r => setTimeout(r, 0));
    });
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });

    // 1 store ACTIVE (3708) -- 5183 has raw detail too, but its two counts are 19 days apart,
    // outside autoWindowDays, so it contributes zero activity despite having no store-level
    // gate excluding it upfront (that's the whole point of the 2026-09-08 simplification).
    expect(container.textContent).toMatch(/1\s*stores?/);
  });
});
