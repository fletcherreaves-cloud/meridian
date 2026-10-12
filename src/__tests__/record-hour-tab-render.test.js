// @vitest-environment happy-dom
// @ts-nocheck
// Record Hour -- renders the REAL RecordDayTab consumer (not just the engine import), per
// this repo's "would this verification still pass if reverted?" standing rule: a test that
// only imports computeHourRecords could pass unchanged with the tab's wiring into
// RecordDayTab (TABS entry, scoping, the Record Hour tab component itself) deleted.
import { describe, it, expect, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const LOC = '33704';

function row(loc, date, slot, netSales) {
  const [h, m] = slot.split(':').map(Number);
  return { loc, date: new Date(date + 'T00:00:00'), qtrSlot: slot, slotMinutes: h * 60 + m, netSales };
}

import { RecordDayTab } from '../views/record-day.js';

describe('RecordDayTab — Record Hour tab, rendered through the real panel', () => {
  let container, root;
  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
    try { localStorage.removeItem('mf_day_records_v1'); } catch {}
    vi.useRealTimers();
  });

  it('shows the real best 60-minute sliding-window sales figure, not a clock-hour reading', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T12:00:00'));
    const dk = '2026-05-01';
    const qsrSalesQtrHourRows = [
      row(LOC, dk, '07:00', 100),
      row(LOC, dk, '07:15', 900), row(LOC, dk, '07:30', 900), row(LOC, dk, '07:45', 900), row(LOC, dk, '08:00', 900),
      row(LOC, dk, '08:15', 2000),
    ];
    const ds = { loaded: true, storeIds: [LOC], laborRows: [], qsrSalesQtrHourRows };

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(RecordDayTab, { stores: [{ loc: LOC }], ds }));
    });

    const tabs = [...container.querySelectorAll('button')];
    const hourTab = tabs.find(b => b.textContent.includes('Record Hour'));
    expect(hourTab).toBeTruthy();
    await act(async () => { hourTab.click(); });

    // 4700 (07:15-08:15), not 2800 (the plain 07:00-08:00 clock hour) -- the exact case a
    // clock-hour-only V1 would get wrong.
    expect(container.textContent).toMatch(/4,700\.00/);
    expect(container.textContent).not.toMatch(/2,800\.00/);
    expect(container.textContent).toContain('7:15 AM');
    expect(container.textContent).toContain('8:15 AM');
    expect(container.textContent).toContain('Confirmed');
  });
});
