// @vitest-environment happy-dom
// @ts-nocheck
// Owner request 2026-10-02 (Jan-Mar 2026 backfill): "flag them clearly" so a reconstructed
// store-month is never mistaken for a real approved target when reviewing/editing the Monthly
// Projections grid. mt[loc]._dataSource (mapped from monthly_targets.data_source by
// loadMonthlyTargets/loadAllMonthlyTargets, see dispatch-jan-mar-reconstruction-flag-2026-10-02
// .test.js) drives a period-level banner (all-reconstructed vs. partially-reconstructed) and a
// per-store row badge.
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MonthlyProjectionsPanel } from '../views/analytics.js';
import { STORE_NAMES } from '../constants.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const [A, B] = ['3708', '5183'];

describe('MonthlyProjectionsPanel — reconstruction flag badge', () => {
  let container, root;
  afterEach(() => { if (root) act(() => root.unmount()); if (container) container.remove(); });

  async function render(ds) {
    container = document.createElement('div'); document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(MonthlyProjectionsPanel, {
        ds, stores: [{ loc: A, name: STORE_NAMES[A] }, { loc: B, name: STORE_NAMES[B] }],
        settings: {}, onClose: () => {},
      }));
    });
  }

  it('a real (non-reconstructed) period shows no reconstruction banner or row badge', async () => {
    await render({
      loaded: true,
      monthlyTargets: {
        [A]: { tProdSales: 300000, tCrewLabor: 0.21, _year: 2026, _month: 10 },
        [B]: { tProdSales: 200000, tCrewLabor: 0.22, _year: 2026, _month: 10 },
      },
      monthlyTargetsMeta: { year: 2026, month: 10 },
      allMonthlyTargets: {},
    });
    expect(container.textContent).not.toContain('Reconstructed');
    expect(container.textContent).not.toContain('⚠');
  });

  it('a fully-reconstructed period shows the "Reconstructed" banner, not "Partially Reconstructed"', async () => {
    await render({
      loaded: true,
      monthlyTargets: {
        [A]: { tProdSales: 342661, tCrewLabor: 0.221, _year: 2026, _month: 1, _dataSource: 'reconstructed_leak_free_2026-10-02' },
        [B]: { tProdSales: 260000, tCrewLabor: 0.23, _year: 2026, _month: 1, _dataSource: 'reconstructed_leak_free_2026-10-02' },
      },
      monthlyTargetsMeta: { year: 2026, month: 1 },
      allMonthlyTargets: {},
    });
    expect(container.textContent).toContain('⚠ Reconstructed');
    expect(container.textContent).not.toContain('Partially Reconstructed');
  });

  it('a mixed period (some real, some reconstructed stores) shows "Partially Reconstructed", not the unqualified banner, and badges only the reconstructed row', async () => {
    await render({
      loaded: true,
      monthlyTargets: {
        [A]: { tProdSales: 342661, tCrewLabor: 0.221, _year: 2026, _month: 1, _dataSource: 'reconstructed_leak_free_2026-10-02' },
        [B]: { tProdSales: 260000, tCrewLabor: 0.23, _year: 2026, _month: 1 }, // real, no flag
      },
      monthlyTargetsMeta: { year: 2026, month: 1 },
      allMonthlyTargets: {},
    });
    expect(container.textContent).toContain('⚠ Partially Reconstructed');
    // Exactly one row-level warning glyph (store A's), not two.
    const rows = [...container.querySelectorAll('tr')];
    const rowA = rows.find(r => r.textContent.includes(STORE_NAMES[A]));
    const rowB = rows.find(r => r.textContent.includes(STORE_NAMES[B]));
    expect(rowA.textContent).toContain('⚠');
    expect(rowB.textContent).not.toContain('⚠');
  });
});
