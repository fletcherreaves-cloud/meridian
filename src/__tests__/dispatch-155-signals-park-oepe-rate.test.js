// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #155 — renders the actual Park×OEPE quadrant tab (not just the engine). ParkOepeTab's
// own range is `{s: now-90d, e: now}` — `e` is literally `new Date()`, so it always includes
// today's still-open business day. ParkOepeTab was exported specifically to make this call site
// testable (see its own comment in signals.js) — it was previously only reachable through
// SignalsPanel's internal tab-navigation state.
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { ParkOepeTab } from '../views/signals.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('ParkOepeTab district median OEPE uses the Σ/Σ rollup for a range that includes today (dispatch #155)', () => {
  let container, root;
  afterEach(() => { act(() => { root?.unmount(); }); container?.remove(); });

  it('shows the Σ/Σ figure, not the mean-of-daily one, for a single-store window', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    const today = new Date();
    const d = (daysAgo) => { const x = new Date(today); x.setDate(x.getDate() - daysAgo); return x; };
    const rows = [];
    for (let i = 1; i <= 5; i++) rows.push({ loc: '1', date: d(i), _dtTotal: 50000000, _dtStore: 0, _dtHeldTime: 0, _dtCars: 1000 }); // 50s/day, complete
    rows.push({ loc: '1', date: d(0), _dtTotal: 20000000, _dtStore: 0, _dtHeldTime: 0, _dtCars: 100 }); // today, in-progress: 200s
    const ds = {
      storeIds: ['1'],
      qsrActSummaryRows: rows,
      glimpseRows: [{ loc: '1', date: d(3), parkedPct: 0.1 }], // gives `park` a resolvable value so the row isn't excluded
    };

    act(() => { root.render(React.createElement(ParkOepeTab, { ds })); });

    // Single store, so the district median OEPE IS that store's own metricRate figure.
    // Σ/Σ = (50000000*5+20000000)/(1000*5+100)/1000 ≈ 52.94s -> round -> 53s.
    // mean-of-daily = (50*5+200)/6 = 75.0s -> round -> 75s.
    expect(container.textContent).toContain('District median OEPE: 53s');
    expect(container.textContent).not.toContain('District median OEPE: 75s');
  });
});
