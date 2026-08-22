// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #68 — LaborAnalyticsPanel (labor-tools.js) was gating store inclusion on manual
// laborRows/ctrlRows presence, even though laborPct/tpph/actHrs/otHrs/actVsNeed/salaryMgrHrs
// already resolve through metric-source.js's auto-first chains (a prior dispatch, #324,
// migrated the VALUES but never touched this gate). Measured live 2026-08-22: manual
// labor_rows/ctrl_rows have been EMPTY district-wide for 28+ days (0/27 stores) while the auto
// DAR + opsLaborRows streams cover all 27 — so the panel's default 4-week view was dropping
// every single store, and the top-level "No Labor Data Loaded" screen could trigger district-
// wide despite full auto coverage. Same bug class as dispatch #64 (Visit Readiness): an
// auto-first chain exists and resolves, but the inclusion/rendering gate never checks it.
//
// Per the standing "would this verification still pass if the change were reverted" rule, this
// renders the ACTUAL LaborAnalyticsPanel consumer with a fixture that has ZERO manual laborRows/
// ctrlRows and ONLY auto streams — an engine-level check of metric-source.js alone can't tell
// "the chain resolves" from "the panel actually shows it," which is exactly the gap here.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

import { LaborAnalyticsPanel } from '../views/labor-tools.js';
import { _resetLazyFillForTests } from '../engine/metric-source.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const LOC = '3708';
const days = [1, 3, 6].map(n => new Date(Date.now() - n * 864e5));

// Auto-only ds: every stream this test cares about is a cloud/auto source. Deliberately no
// ds.laborRows / ds.ctrlRows at all — the exact shape the live measurement found district-wide.
function autoOnlyDs() {
  return {
    qsrActSummaryRows: days.map(d => ({
      loc: LOC, date: d, sales: 12000, tpph: 5.4, actHrs: 210, actVsNeed: -8,
    })),
    opsLaborRows: days.map(d => ({
      loc: LOC, date: d, laborDollar: 2700, otHrs: 3.2, otDollar: 145,
    })),
  };
}

const STORES = [{ loc: LOC }];

describe('LaborAnalyticsPanel — auto-only stores are not dropped (dispatch #68)', () => {
  let container, root;
  beforeEach(() => {
    _resetLazyFillForTests();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('renders real store data for a store with zero manual laborRows/ctrlRows but full auto coverage', () => {
    const ds = autoOnlyDs();
    act(() => {
      root.render(React.createElement(LaborAnalyticsPanel, {
        stores: STORES, ds, settings: {}, onClose: () => {}, embedded: true,
      }));
    });
    const text = container.textContent;
    // Must NOT hit the dead-end "no data loaded" screen — auto streams are present.
    expect(text).not.toContain('No Labor Data Loaded');
    // Must NOT hit the per-period "nothing for this range" empty state either — the store
    // should actually appear with its auto-resolved stats.
    expect(text).not.toContain('No labor data for this period and location');
    // The store's own row should be present (storeName renders "3708 — <name>").
    expect(text).toContain('3708');
  });

  it('still shows the dead-end screen when there is truly no data anywhere (auto or manual)', () => {
    act(() => {
      root.render(React.createElement(LaborAnalyticsPanel, {
        stores: STORES, ds: {}, settings: {}, onClose: () => {}, embedded: true,
      }));
    });
    expect(container.textContent).toContain('No Labor Data Loaded');
  });

  it('a store with ONLY manual rows (no auto) still renders — the legacy path is untouched', () => {
    const ds = {
      laborRows: days.map(d => ({ loc: LOC, date: d, sales: 11000, laborPct: 0.24, tpph: 5.1 })),
    };
    act(() => {
      root.render(React.createElement(LaborAnalyticsPanel, {
        stores: STORES, ds, settings: {}, onClose: () => {}, embedded: true,
      }));
    });
    const text = container.textContent;
    expect(text).not.toContain('No Labor Data Loaded');
    expect(text).not.toContain('No labor data for this period and location');
    expect(text).toContain('3708');
  });
});
