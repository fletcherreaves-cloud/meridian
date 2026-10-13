// @vitest-environment happy-dom
// @ts-nocheck
// Mass-review notes 70 (2026-10-13) — "Records > Add new record hour like we did on other
// records panel - Give more drill down options also. Including sorting and previous records
// (top 5) with when they occurred." StoreRecordsTab (store-analytics.js, the per-store Records
// tab reached from District View's store drill-down) gained a Record Hour section reusing
// record-day.js's HourRecordTab scoped to this one store, instead of rebuilding sort/top-5/
// previous-record logic that already exists and is tested in record-hour-tab-render.test.js.
//
// Renders the REAL StoreRecordsTab consumer (per this repo's "would this verification still
// pass if reverted?" standing rule) — a test that only imported computeHourRecords could pass
// unchanged with the HourRecordTab wiring into StoreRecordsTab deleted.
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { StoreRecordsTab } from '../views/store-analytics.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const LOC = '3708';

function qRow(loc, date, slot, netSales) {
  const [h, m] = slot.split(':').map(Number);
  return { loc, date: new Date(date + 'T00:00:00'), qtrSlot: slot, slotMinutes: h * 60 + m, netSales };
}

describe('StoreRecordsTab — Record Hour section (mass-review notes 70)', () => {
  let container, root;
  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
    try { localStorage.removeItem('mf_day_records_v1'); } catch {}
  });

  it('shows the real best-60-minute-window figure for this store, scoped out of the district data', async () => {
    const dk = '2026-05-01';
    const qsrSalesQtrHourRows = [
      // This store (3708): a real 4-slot best window.
      qRow(LOC, dk, '07:00', 100),
      qRow(LOC, dk, '07:15', 900), qRow(LOC, dk, '07:30', 900), qRow(LOC, dk, '07:45', 900), qRow(LOC, dk, '08:00', 900),
      // A DIFFERENT store with a much bigger number — must NOT leak into this store's scoped view.
      qRow('9999999', dk, '07:15', 50000), qRow('9999999', dk, '07:30', 50000), qRow('9999999', dk, '07:45', 50000), qRow('9999999', dk, '08:00', 50000),
    ];
    const ds = { loaded: true, storeIds: [LOC, '9999999'], laborRows: [], records: {}, qsrSalesQtrHourRows };

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(StoreRecordsTab, { ds, loc: LOC, name: 'Ardmore-Broadway' }));
    });

    expect(container.textContent).toContain('Best 60-Minute Window');
    // 3,600 = 900*4 (07:15-08:15 for store 3708) -- the other store's 200,000 must not appear.
    expect(container.textContent).toMatch(/3,600\.00/);
    expect(container.textContent).not.toMatch(/200,000\.00/);
  });

  it('exposes the Top 5 All-Time toggle and sortable Store/Date/Daypart columns (same controls as the district panel)', async () => {
    const dk = '2026-05-01';
    const ds = {
      loaded: true, storeIds: [LOC], laborRows: [], records: {},
      qsrSalesQtrHourRows: [qRow(LOC, dk, '07:15', 500), qRow(LOC, dk, '07:30', 500), qRow(LOC, dk, '07:45', 500), qRow(LOC, dk, '08:00', 500)],
    };
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(StoreRecordsTab, { ds, loc: LOC, name: 'Ardmore-Broadway' }));
    });

    const buttons = [...container.querySelectorAll('button')].map(b => b.textContent);
    expect(buttons).toContain('Top 5 All-Time');
    expect(buttons).toContain('Current Record');
    expect(container.textContent).toContain('Date');
    expect(container.textContent).toContain('Daypart');
  });

  it('does not crash and shows its own empty state when this store has no quarter-hour data at all', async () => {
    const ds = { loaded: true, storeIds: [LOC], laborRows: [], records: {} }; // no qsrSalesQtrHourRows
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(StoreRecordsTab, { ds, loc: LOC, name: 'Ardmore-Broadway' }));
    });
    expect(container.textContent).toMatch(/No quarter-hour sales data yet|No Records Data/);
  });
});
