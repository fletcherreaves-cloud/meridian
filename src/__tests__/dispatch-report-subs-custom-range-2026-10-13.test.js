// @vitest-environment happy-dom
// @ts-nocheck
// Owner-requested (2026-10-13): "On My Reports, can we add a date selector, please." Before this,
// report-subscriptions.js's period picker offered only 3 fixed named periods (MTD/Last 7 days/
// Last month) with no way to pick an actual date range. Added a 4th 'custom' option matching the
// EXACT period vocabulary AboveStoreOnePager (the one consumer that reads `period`) already
// implements internally (mtd/lastweek/lastmonth/custom + its own customRange state) -- same
// precedent dispatch #158's own test file documents: this panel's presets are period-anchored,
// not a fit for the shared DateRangeControl's trailing-N-days shape.
//
// Renders the REAL ReportSubscriptions component (verification must touch the call site) and
// confirms the picked {s,e} actually reaches the onLaunch callback, both for "Open now" and for
// a saved-then-relaunched subscription.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { ReportSubscriptions } from '../views/report-subscriptions.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function setInputValue(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('ReportSubscriptions (My Reports) — Custom date selector (owner-requested, 2026-10-13)', () => {
  let container, root, launched;
  beforeEach(() => {
    try { window.localStorage.clear(); } catch {}
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    launched = [];
  });
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

  const render = async () => {
    await act(async () => {
      root.render(React.createElement(ReportSubscriptions, {
        onClose: () => {}, onLaunch: (sub) => launched.push(sub),
      }));
    });
    // flush the loadReportSubs() microtask so the "Saved (N)" header settles
    await act(async () => { await Promise.resolve(); });
  };

  it('the period picker shows Custom alongside the 3 existing presets for a periods:true report (above-store is the default selection)', async () => {
    await render();
    for (const l of ['Month-to-date', 'Last 7 days', 'Last month', 'Custom']) {
      const b = [...container.querySelectorAll('button')].find(b => b.textContent === l);
      expect(b, `period pill "${l}" not found`).toBeTruthy();
    }
    // No date inputs until Custom is actually selected (mtd is the default period).
    expect(container.querySelectorAll('input[type="date"]').length).toBe(0);
  });

  it('selecting Custom reveals two date inputs, and "Open now" launches with the picked range', async () => {
    await render();
    const customBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Custom');
    await act(async () => { customBtn.click(); });

    const dateInputs = container.querySelectorAll('input[type="date"]');
    expect(dateInputs.length).toBe(2);
    await act(async () => { setInputValue(dateInputs[0], '2026-08-01'); });
    await act(async () => { setInputValue(dateInputs[1], '2026-08-10'); });

    const openBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Open now'));
    await act(async () => { openBtn.click(); });

    expect(launched).toHaveLength(1);
    expect(launched[0].period).toBe('custom');
    expect(launched[0].customRange).toEqual({ s: '2026-08-01', e: '2026-08-10' });
  });

  it('saving a Custom subscription persists the range, and relaunching it from the saved list carries the same range', async () => {
    await render();
    const customBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Custom');
    await act(async () => { customBtn.click(); });
    const dateInputs = container.querySelectorAll('input[type="date"]');
    await act(async () => { setInputValue(dateInputs[0], '2026-09-01'); });
    await act(async () => { setInputValue(dateInputs[1], '2026-09-15'); });

    const saveBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Save to My Reports'));
    await act(async () => { saveBtn.click(); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    // The saved row shows the real picked dates, not a generic "Custom" label.
    expect(container.textContent).toContain('2026-09-01 to 2026-09-15');

    const relaunchBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Open'));
    await act(async () => { relaunchBtn.click(); });

    expect(launched).toHaveLength(1);
    expect(launched[0].customRange).toEqual({ s: '2026-09-01', e: '2026-09-15' });
  });

  it('a non-custom period (Last month) carries no customRange, unchanged from before', async () => {
    await render();
    const lastMonthBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Last month');
    await act(async () => { lastMonthBtn.click(); });
    const openBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Open now'));
    await act(async () => { openBtn.click(); });

    expect(launched[0].period).toBe('lastmonth');
    expect(launched[0].customRange).toBeNull();
  });
});
