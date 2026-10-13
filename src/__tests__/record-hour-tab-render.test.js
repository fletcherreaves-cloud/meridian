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

  it('the Category dropdown restricts to one daypart -- not whichever daypart the overall best happens to land in', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T12:00:00'));
    const dk = '2026-05-01';
    const qsrSalesQtrHourRows = [
      // Breakfast: modest. Dinner: the overall best.
      row(LOC, dk, '06:15', 50), row(LOC, dk, '06:30', 50), row(LOC, dk, '06:45', 50), row(LOC, dk, '07:00', 50),
      row(LOC, dk, '19:15', 5000), row(LOC, dk, '19:30', 5000), row(LOC, dk, '19:45', 5000), row(LOC, dk, '20:00', 5000),
    ];
    const ds = { loaded: true, storeIds: [LOC], laborRows: [], qsrSalesQtrHourRows };

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(RecordDayTab, { stores: [{ loc: LOC }], ds }));
    });
    const hourTab = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Record Hour'));
    await act(async () => { hourTab.click(); });

    // Default (Any Hour) shows the overall best -- the $20,000 dinner window.
    expect(container.textContent).toMatch(/20,000\.00/);

    const categorySelect = [...container.querySelectorAll('select')][0];
    await act(async () => {
      categorySelect.value = 'breakfast';
      categorySelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    // Restricted to Breakfast -- must show the $200 breakfast window, not the dinner figure.
    expect(container.textContent).toMatch(/200\.00/);
    expect(container.textContent).not.toMatch(/20,000\.00/);
  });

  it('the Top 5 All-Time toggle ranks every CONFIRMED day, not just the current record', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T12:00:00'));
    const rows = [];
    [1000, 2000, 3000].forEach((v, i) => {
      const dk = `2026-05-0${i + 1}`;
      rows.push(row(LOC, dk, '07:15', v / 4), row(LOC, dk, '07:30', v / 4), row(LOC, dk, '07:45', v / 4), row(LOC, dk, '08:00', v / 4));
    });
    const ds = { loaded: true, storeIds: [LOC], laborRows: [], qsrSalesQtrHourRows: rows };

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(RecordDayTab, { stores: [{ loc: LOC }], ds }));
    });
    const hourTab = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Record Hour'));
    await act(async () => { hourTab.click(); });
    const top5Btn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Top 5 All-Time');
    expect(top5Btn).toBeTruthy();
    await act(async () => { top5Btn.click(); });

    // All 3 confirmed days should appear, ranked best-first.
    expect(container.textContent).toMatch(/3,000\.00/);
    expect(container.textContent).toMatch(/2,000\.00/);
    expect(container.textContent).toMatch(/1,000\.00/);
  });
});
