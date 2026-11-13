// @vitest-environment happy-dom
// @ts-nocheck
// Delivery & Channel Mix -> Channel Overview tab (src/views/delivery-mix.js).
//
// Owner-reported live bug (2026-11-13, screenshots against the real QSRSoft Operations
// Report): the SAME "Drive-Thru % of total sales" metric read 0.00% (7d), 5.96% (14d),
// 38.24% (28d), 54.42% (60d) in the app, against a real ~69-77% daily / 72.97% MTD figure
// pulled directly from QSRSoft for the same store. Root cause: ChannelOverviewTab read
// ds.laborByLoc (manual Operations Report upload only) directly for both the channel $
// numerators and the total-sales denominator -- the manual-only sourcing bug CLAUDE.md's Dev
// Rules section names. Fixed by routing through metric-source.js's existing auto-first
// dtMixPct/bfMixPct/mopMixPct/kioskMixPct/delivMixPct registry entries instead.
//
// These tests prove: (1) the panel no longer depends on ds.laborByLoc at all, (2) Drive-Thru
// resolves through the real Sum/Sum ratio (qsr_sales_mix-backed dtSalesAmt/mixNetSalesAmt),
// never a mean of daily percentages, and (3) a channel with no data anywhere shows an honest
// "no data" state instead of a misleading 0.00%.
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { DeliveryMixPanel } from '../views/delivery-mix.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const STORES = [{ loc: '3708', name: 'Tishomingo-Main & Refuge' }];
const D = (daysAgo) => { const d = new Date(); d.setDate(d.getDate() - daysAgo); d.setHours(12, 0, 0, 0); return d; };

async function mount(ds) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(DeliveryMixPanel, { ds, stores: STORES, onClose: () => {} }));
  });
  return { container, root };
}

describe('Channel Overview — auto-first sourcing (dispatch 2026-11-13)', () => {
  let container, root;
  afterEach(() => { act(() => root?.unmount()); container?.remove(); });

  it('resolves Drive-Thru % from the real auto-pulled Sales Mix stream, ignoring a conflicting manual laborByLoc value', async () => {
    const ds = {
      loaded: true,
      // Two days, real auto-pulled Sales Mix data — exactly the shape qsr_sales_mix/opsSalesMixRows
      // carries. Day 1: $10,760.58 total / $7,499.01 DT = 69.69%. Day 2: $10,252.07 / $7,687.68 = 74.99%.
      // True Sum/Sum over both days = (7499.01+7687.68)/(10760.58+10252.07) = 72.27%.
      opsSalesMixRows: [
        { loc: '3708', date: D(1), dtSalesAmt: 7499.01, netSalesAmt: 10760.58 },
        { loc: '3708', date: D(0), dtSalesAmt: 7687.68, netSalesAmt: 10252.07 },
      ],
      qsrActSummaryRows: [
        { loc: '3708', date: D(1), sales: 10760.58 },
        { loc: '3708', date: D(0), sales: 10252.07 },
      ],
      // A deliberately WRONG manual Operations Report value for the same days/store — if the
      // panel ever reads this again, the rendered % would be nowhere near 72%.
      laborByLoc: { '3708': [
        { loc: '3708', date: D(1), sales: 10760.58, dtSales: 1000, dtPctTotal: 0.09 },
        { loc: '3708', date: D(0), sales: 10252.07, dtSales: 1000, dtPctTotal: 0.09 },
      ] },
    };
    ({ container, root } = await mount(ds));
    expect(container.textContent).toContain('72.27%');
    expect(container.textContent).not.toContain('9.00%');
  });

  it('district Drive-Thru % is a true Sum/Sum ratio, not a mean of daily percentages', async () => {
    // Day A: tiny volume, extreme DT ratio (100%). Day B: large volume, low DT ratio (20%).
    // Mean-of-daily would read 60% ((100+20)/2); the real Sum/Sum is close to day B's 20%
    // because it dominates total dollars: (100+4000)/(100+20000) = 20.4%.
    const ds = {
      loaded: true,
      opsSalesMixRows: [
        { loc: '3708', date: D(1), dtSalesAmt: 100, netSalesAmt: 100 },
        { loc: '3708', date: D(0), dtSalesAmt: 4000, netSalesAmt: 20000 },
      ],
      qsrActSummaryRows: [
        { loc: '3708', date: D(1), sales: 100 },
        { loc: '3708', date: D(0), sales: 20000 },
      ],
    };
    ({ container, root } = await mount(ds));
    expect(container.textContent).toContain('20.40%');
    expect(container.textContent).not.toContain('60.00%');
  });

  it('shows an honest "no data" state for a channel with nothing in any source, not a misleading 0.00%', async () => {
    const ds = {
      loaded: true,
      opsSalesMixRows: [{ loc: '3708', date: D(0), dtSalesAmt: 5000, netSalesAmt: 10000 }],
      qsrActSummaryRows: [{ loc: '3708', date: D(0), sales: 10000 }],
      // No salesLedgerRows, no laborRows at all — Breakfast/Delivery/MOP/Kiosk have zero
      // coverage from any source for this store/window.
    };
    ({ container, root } = await mount(ds));
    expect(container.textContent).toContain('have no data for this window');
    expect(container.textContent).toContain('50.00%'); // Drive-Thru is unaffected
  });

  it('never reads ds.laborByLoc when the auto-first streams are empty — falls to real "no data", not a crash or stale read', async () => {
    const ds = { loaded: true, laborByLoc: { '3708': [{ loc: '3708', date: D(0), sales: 999, dtSales: 999, dtPctTotal: 1 }] } };
    ({ container, root } = await mount(ds));
    // No qrsActSummaryRows-backed `sales` total exists, so the store contributes no rows at all —
    // the panel must not silently fall back to the manual-only laborByLoc shape.
    expect(container.textContent).toContain('No data for this range.');
  });
});
