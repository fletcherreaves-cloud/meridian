// @vitest-environment happy-dom
// @ts-nocheck
// GH #316 — sales is covered by Needs Attention (salesBehindLY), but guest counts — the metric
// the whole McValue 2.0 traffic story is about — produced zero finding anywhere in the app,
// despite the inputs (qsr_daily_activity's proj_total_transactions, reachable via vs-ly.js's
// matchedVsLY(ds, [loc], range, 'gc')) already being pulled and already used elsewhere. Per the
// standing "would this verification still pass if reverted" rule, this renders the ACTUAL
// useAttentionFeed hook (not just the engine functions), since the wiring itself lives in
// attention-now.js, not just attention-feed.js.
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { useAttentionFeed } from '../views/attention-now.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function Host({ ds, stores, dateRange }) {
  const feed = useAttentionFeed({ ds, stores, dateRange, max: 50 });
  return React.createElement('pre', null, JSON.stringify(feed));
}

const recent = n => new Date(Date.now() - n * 864e5);

describe('useAttentionFeed surfaces guest-count/traffic findings (GH #316)', () => {
  let container, root;
  afterEach(() => { act(() => { root?.unmount(); }); container?.remove(); });

  it('the McValue signature — sales holding while GC falls — surfaces under Traffic', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    // 20 recent days of the auto DAR rollup: sales +1% vs LY, guest counts -10% vs LY —
    // the exact "fewer, bigger transactions" pattern a sales-only detector cannot see. DAR
    // rows carry their own same-date LY fields (lySales/lyGc), which autoFirstDaily treats as
    // authoritative — well over the >=14-matched-day floor both the rolling window and
    // trafficRows require.
    const qsrActSummaryRows = Array.from({ length: 20 }, (_, i) => ({
      loc: '3708', date: recent(i + 1),
      sales: 1010, lySales: 1000,
      gc: 90, lyGc: 100,
    }));
    const ds = { loaded: true, qsrActSummaryRows };
    const stores = [{ loc: '3708' }];
    const dateRange = { s: recent(10), e: recent(1) };

    act(() => {
      root.render(React.createElement(Host, { ds, stores, dateRange }));
    });

    expect(container.textContent).toContain('Traffic');
    expect(container.textContent).toContain('traffic falling');
  });

  it('a store with no sales/GC data at all is unaffected (regression guard)', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const ds = { loaded: true };
    const stores = [{ loc: '3708' }];
    const dateRange = { s: recent(10), e: recent(1) };

    act(() => {
      root.render(React.createElement(Host, { ds, stores, dateRange }));
    });

    expect(container.textContent).not.toContain('Traffic');
  });
});
