// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #156 — OperatorSummaryPanel's single top-level empty-data gate
// (`if(!ds||!ds.loaded||opStats.length===0) return <'No Data Loaded' full-panel screen>`) folded
// "nothing loaded at all" together with "the currently-selected range resolves zero rows". Since
// cStart/cEnd both start as `''`, `range` (and therefore `opStats`) resolves to `[]` the INSTANT
// the "Custom" period pill is clicked -- before either date input has a value -- which fired the
// gate and replaced the entire panel (header, Period/Group/Focus/Sort controls, both
// `<input type="date">` fields) with a dead-end screen whose only way out is closing the panel.
//
// This test renders the REAL OperatorSummaryPanel (not an isolated helper), starts it on its
// default '4wk' period with real data so results are visible, clicks "Custom", and asserts the
// period pills and both date inputs are still present and interactive immediately after -- the
// assertion that fails against the pre-fix gate (`opStats.length===0` throws the whole panel into
// the "No Data Loaded" screen, which has no period pills and no date inputs) and passes once the
// gate is split per the fix (`hasData`, independent of range/opStats, gates the full panel; a
// zero-row period surfaces only inside the "Group cards" results area via the panel's own
// previously-unreachable `sortedOps.length===0` placeholder).
//
// Also includes a regression guard asserting LaborAnalyticsPanel -- confirmed in dispatch #156 to
// NOT share this bug (its one gate, `hasData`, is already independent of range/locStats) -- keeps
// its controls visible on "Custom" today, so a future edit to that sibling panel that reintroduces
// the coupling gets caught here too.
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

const { OperatorSummaryPanel, LaborAnalyticsPanel } = await import('../views/labor-tools.js');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const NOOP = () => {};
const today = new Date();
const d = (daysAgo) => { const x = new Date(today); x.setDate(x.getDate() - daysAgo); return x; };

// A few days of real qsrActSummaryRows so the default '4wk' period resolves non-empty opStats --
// the panel must start on a populated state before we click "Custom", matching how a user would
// actually encounter this (mid-session, with results already on screen).
function fixtureRows() {
  const rows = [];
  for (let i = 1; i <= 5; i++) rows.push({ loc: '10422', date: d(i), gc: 1000, actHrs: 100, sales: 10000 });
  return rows;
}

function clickButtonByText(container, text) {
  const btns = Array.from(container.querySelectorAll('button'));
  const target = btns.find(b => b.textContent.trim() === text);
  expect(target, `expected a <button> with text "${text}"`).toBeTruthy();
  act(() => { target.dispatchEvent(new Event('click', { bubbles: true })); });
}

describe('OperatorSummaryPanel Custom-period controls stay visible (dispatch #156)', () => {
  let container, root;
  afterEach(() => { act(() => { root?.unmount(); }); container?.remove(); });

  it('clicking "Custom" leaves the Period pills and both date inputs present and interactive', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const ds = { loaded: true, qsrActSummaryRows: fixtureRows() };
    act(() => {
      root.render(React.createElement(OperatorSummaryPanel, { stores: [{ loc: '10422' }], ds, settings: {}, onClose: NOOP }));
    });
    // Sanity: starts on a populated state (default '4wk'), not already on the empty-data screen.
    expect(container.textContent).not.toContain('No Data Loaded');

    clickButtonByText(container, 'Custom');

    // The pre-fix gate (`opStats.length===0`) would have replaced the whole panel with the
    // full-screen "No Data Loaded" dialog at this point -- no period pills, no date inputs.
    expect(container.textContent).not.toContain('No Data Loaded');
    const periodLabel = Array.from(container.querySelectorAll('span')).find(s => s.textContent.trim() === 'Period:');
    expect(periodLabel, 'Period controls bar must still be in the DOM after selecting Custom').toBeTruthy();
    // "Custom" itself must still be selectable (present as a live button, not just static text).
    const customBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent.trim() === 'Custom');
    expect(customBtn).toBeTruthy();
    expect(customBtn.disabled).toBe(false);

    const dateInputs = container.querySelectorAll('input[type="date"]');
    expect(dateInputs.length).toBe(2);
    for (const inp of dateInputs) expect(inp.disabled).toBe(false);

    // Results area shows the (now-reachable) empty-period placeholder, not a blanked panel.
    expect(container.textContent).toContain('No data for selected period.');
  });

  it('typing both custom dates resolves and displays results again (end-to-end)', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const ds = { loaded: true, qsrActSummaryRows: fixtureRows() };
    act(() => {
      root.render(React.createElement(OperatorSummaryPanel, { stores: [{ loc: '10422' }], ds, settings: {}, onClose: NOOP }));
    });
    clickButtonByText(container, 'Custom');

    const [startInput, endInput] = container.querySelectorAll('input[type="date"]');
    const iso = (dt) => dt.toISOString().slice(0, 10);
    const setValue = (el, val) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      act(() => {
        setter.call(el, val);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });
    };
    setValue(startInput, iso(d(6)));
    setValue(endInput, iso(d(1)));

    expect(container.textContent).not.toContain('No data for selected period.');
    expect(container.textContent).not.toContain('No Data Loaded');
  });
});

describe('LaborAnalyticsPanel Custom-period controls stay visible (regression guard, dispatch #156)', () => {
  let container, root;
  afterEach(() => { act(() => { root?.unmount(); }); container?.remove(); });

  it('clicking "Custom" leaves the Period pills and both date inputs present today -- confirms the sibling panel is unaffected', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const ds = { loaded: true, qsrActSummaryRows: fixtureRows() };
    act(() => {
      root.render(React.createElement(LaborAnalyticsPanel, { stores: [{ loc: '10422' }], ds, settings: {}, onClose: NOOP }));
    });
    expect(container.textContent).not.toContain('No Labor Data Loaded');

    clickButtonByText(container, 'Custom');

    expect(container.textContent).not.toContain('No Labor Data Loaded');
    const periodLabel = Array.from(container.querySelectorAll('span')).find(s => s.textContent.trim() === 'Period:');
    expect(periodLabel).toBeTruthy();
    const dateInputs = container.querySelectorAll('input[type="date"]');
    expect(dateInputs.length).toBe(2);
    for (const inp of dateInputs) expect(inp.disabled).toBe(false);
  });
});
