// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #158 item 1 — custom date-range picker on the Leadership (Above-Store) One-Pager.
// Renders the REAL AboveStoreOnePager component (this project's "verification must touch the
// call site" standing rule) so a revert of the wiring — not just a hand-rolled range-math
// helper tested in isolation — would show up here. Mirrors src/views/one-pager.js's own
// rangeMode==='custom' pattern (hand-rolled two <input type="date"> fields), which dispatch
// #158's own PR body explains was chosen over the shared DateRangeControl because this panel's
// 3 existing presets (mtd/lastweek/lastmonth) are period-anchored, the same class
// memory/panel-contract.md's own table already carves out for report-subscriptions.js.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { AboveStoreOnePager } = await import('../views/above-store-onepager.js');

function setInputValue(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('dispatch #158 item 1 — AboveStoreOnePager custom date range', () => {
  let container, root;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
  });

  it('shows exactly 4 period options (MTD / Last wk / Last mo / Custom) — the 3 fixed presets plus the new one', async () => {
    await act(async () => {
      root.render(React.createElement(AboveStoreOnePager, {
        ds: {}, settings: {}, userEvents: {}, eventImpact: {}, onClose: () => {},
      }));
    });
    const labels = ['MTD', 'Last wk', 'Last mo', 'Custom'];
    for (const l of labels) {
      const b = [...container.querySelectorAll('button')].find(b => b.textContent === l);
      expect(b, `period pill "${l}" not found`).toBeTruthy();
    }
    // No date inputs until Custom is actually selected (mtd is the default period).
    expect(container.querySelectorAll('input[type="date"]').length).toBe(0);
  });

  it('selecting Custom reveals two date inputs and drives the header range display', async () => {
    await act(async () => {
      root.render(React.createElement(AboveStoreOnePager, {
        ds: {}, settings: {}, userEvents: {}, eventImpact: {}, onClose: () => {},
      }));
    });
    const customBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Custom');
    await act(async () => { customBtn.click(); });

    const dateInputs = container.querySelectorAll('input[type="date"]');
    expect(dateInputs.length).toBe(2);

    await act(async () => { setInputValue(dateInputs[0], '2026-08-01'); });
    await act(async () => { setInputValue(dateInputs[1], '2026-08-10'); });

    // Both the raw ISO window and the human-readable custom label ("Aug 1 – Aug 10, 2026",
    // not a raw ISO range — dispatch #158 scope point 3) reach the header text.
    expect(container.textContent).toMatch(/2026-08-01 → 2026-08-10/);
    expect(container.textContent).toMatch(/Aug 1 – Aug 10, 2026/);
  });

  it('every builder call already flows the custom {s,e} through with zero engine changes (no crash, header renders)', async () => {
    // A ds with SOME real-shaped rows in the custom window -- exercises buildCurrentState /
    // buildReviewActuals / matchedVsLY / metricAvg / fobByRange-derived aggregates /
    // buildScheduleActuals / buildPerLocationRows against a genuine custom {s,e}, not just an
    // empty ds that only proves the error-catch branch renders.
    const ds = {
      qsrFobRows: [],
      laborRows: [{ loc: '3708', date: '2026-08-05', laborPct: 0.24, sales: 5000, netSales: 5000 }],
      opsRows: [],
      ctrlRows: [],
    };
    await act(async () => {
      root.render(React.createElement(AboveStoreOnePager, {
        ds, settings: {}, userEvents: {}, eventImpact: {}, onClose: () => {},
      }));
    });
    const customBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Custom');
    await act(async () => { customBtn.click(); });
    const dateInputs = container.querySelectorAll('input[type="date"]');
    await act(async () => { setInputValue(dateInputs[0], '2026-08-01'); });
    await act(async () => { setInputValue(dateInputs[1], '2026-08-10'); });

    // Didn't crash, and the panel's own title still renders -- the custom range reached every
    // downstream builder without throwing past the component's try/catch.
    expect(container.textContent).toMatch(/Above-Store One-Pager/);
  });
});
