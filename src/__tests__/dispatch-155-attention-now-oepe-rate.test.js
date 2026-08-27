// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #155 — renders the actual useAttentionFeed hook (not just the engine) via a tiny
// host component, since it's a real React hook (useState/useEffect/useMemo) and can't be called
// outside a component. `dateRange` is this hook's own caller-supplied prop (the app's top-level
// toolbar range) — nothing here assumes it excludes today, and this "Attention Now" panel is a
// LIVE-monitoring surface, so it's a real candidate for the completeness bug.
//
// Fixture mirrors the real dispatch #153 mechanism: 5 complete days at a normal rate (50s), and
// today, in-progress, with a TINY sample (20 cars) at a fast raw per-transaction rate that,
// blended in naively (mean-of-daily), reads as an alarmingly SLOW district figure purely from
// the sample being small — a false positive slowDT alert. metricRate's Σ/Σ correctly weights
// the low-volume in-progress day down, so the alert should NOT fire.
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { useAttentionFeed } from '../views/attention-now.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function Host({ ds, stores, dateRange }) {
  const feed = useAttentionFeed({ ds, stores, dateRange });
  return React.createElement('pre', null, JSON.stringify(feed));
}

describe('useAttentionFeed slowDT uses the Σ/Σ rollup, not mean-of-daily, for a range that includes today (dispatch #155)', () => {
  let container, root;
  afterEach(() => { act(() => { root?.unmount(); }); container?.remove(); });

  it('does not raise a false slowDT alert from a low-volume in-progress "today" reading', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const today = new Date();
    const d = (daysAgo) => { const x = new Date(today); x.setDate(x.getDate() - daysAgo); return x; };
    const rows = [];
    // 5 complete days at a real, on-target rate (50s -- well under store 3708's 140s target).
    for (let i = 1; i <= 5; i++) rows.push({ loc: '3708', date: d(i), _dtTotal: 50000000, _dtStore: 0, _dtHeldTime: 0, _dtCars: 1000 });
    // Today, in-progress: only 20 cars logged so far -- a tiny, still-filling sample.
    rows.push({ loc: '3708', date: d(0), _dtTotal: 20000000, _dtStore: 0, _dtHeldTime: 0, _dtCars: 20 }); // raw 1000s/day
    const ds = { loaded: true, qsrActSummaryRows: rows };
    const stores = [{ loc: '3708' }];
    const dateRange = { s: d(10), e: today };

    act(() => {
      root.render(React.createElement(Host, { ds, stores, dateRange }));
    });

    // Sanity: mean-of-daily WOULD read as an alarming 208s (well past 140+45=185, i.e. severity
    // 'warn') -- the exact false-positive shape metricRate exists to prevent. Pin the arithmetic
    // independently of the render so this test documents WHY, not just what.
    const meanOepe = (50 * 5 + 1000) / 6;
    expect(meanOepe).toBeGreaterThan(140 + 45);
    const sumOepe = (50000000 * 5 + 20000000) / (1000 * 5 + 20) / 1000;
    expect(sumOepe).toBeLessThan(140);

    expect(container.textContent).not.toContain('OEPE vs 140s target');
    expect(container.textContent).not.toContain('"dt-3708"');
  });
});
