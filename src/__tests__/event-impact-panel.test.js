// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #108 — render-based tests for EventImpactPanel's GC-lift columns. Per this repo's
// standing rule ("would this verification still pass if the change were reverted?"), a test that
// only imports measureEventLift can't tell "the engine computes GC lift" from "the panel actually
// shows it" — this renders the real panel component (mocking only the Supabase load/save + the
// forecast cache refresh) the same way forms-panel.test.js does for FormsCompletionPanel.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

const loadEventImpactMock = vi.fn();
const saveEventImpactMock = vi.fn();
const setEventImpactMock = vi.fn();

vi.mock('../lib/supabase.js', () => ({
  loadEventImpact: (...args) => loadEventImpactMock(...args),
  saveEventImpact: (...args) => saveEventImpactMock(...args),
}));
vi.mock('../engine/forecast.js', () => ({
  setEventImpact: (...args) => setEventImpactMock(...args),
}));

import { EventImpactPanel } from '../views/event-impact.js';

// React's controlled-input tracker ignores a plain `el.value = x` before dispatching 'change' --
// this is the standard workaround (set via the native setter so React's tracker sees a real change).
function setNativeValue(el, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

async function flush(container, maxTicks = 15) {
  let last;
  for (let i = 0; i < maxTicks; i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
    if (container.textContent === last) return;
    last = container.textContent;
  }
}

describe('EventImpactPanel — GC-lift columns render alongside sales, independently (Dispatch #108)', () => {
  let container, root;
  beforeEach(() => {
    loadEventImpactMock.mockReset(); saveEventImpactMock.mockReset(); setEventImpactMock.mockReset();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
  });

  it('defaults to the sports type and shows a GC Home %/GC Away % header pair alongside Home %/Away %', async () => {
    loadEventImpactMock.mockResolvedValue([]);
    await act(async () => { root.render(React.createElement(EventImpactPanel, { onClose: vi.fn() })); });
    await flush(container);
    const headers = [...container.querySelectorAll('th')].map(t => t.textContent);
    expect(headers).toEqual(expect.arrayContaining(['Home %', 'Away %', 'GC Home %', 'GC Away %']));
  });

  it('renders a measured holiday row with BOTH sales and GC lift, independently', async () => {
    loadEventImpactMock.mockResolvedValue([
      { loc: '3708', eventType: 'holiday', homeImpact: 0.0161, awayImpact: null,
        measuredHome: 0.0161, measuredAway: null, nHome: 70, nAway: null,
        gcHomeImpact: -0.1169, gcAwayImpact: null,
        measuredGcHome: -0.1169, measuredGcAway: null, nGcHome: 40, nGcAway: null,
        source: 'measured', storeType: null, note: 'measured' },
    ]);
    await act(async () => {
      root.render(React.createElement(EventImpactPanel, { onClose: vi.fn() }));
    });
    await flush(container);
    // Switch the type dropdown to 'holiday' (the panel defaults to 'sports').
    const select = container.querySelector('select');
    await act(async () => { select.value = 'holiday'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    await flush(container);

    expect(container.textContent).toMatch(/1\.61/);   // sales home input, pctOf(0.0161) -> "1.61"
    expect(container.textContent).toMatch(/-11\.69/); // GC home input, pctOf(-0.1169) -> "-11.69"
    expect(container.textContent).toMatch(/gc -11\.69%/); // measured cell carries the gc twin
    expect(container.textContent).toMatch(/gc 40/);   // n cell carries the gc twin
  });

  it('a store with sales lift but NO GC lift still shows the row (independent coverage, not paired)', async () => {
    loadEventImpactMock.mockResolvedValue([
      { loc: '3708', eventType: 'holiday', homeImpact: 0.05, awayImpact: null,
        measuredHome: 0.05, measuredAway: null, nHome: 12, nAway: null,
        gcHomeImpact: null, gcAwayImpact: null,
        measuredGcHome: null, measuredGcAway: null, nGcHome: null, nGcAway: null,
        source: 'measured', storeType: null, note: 'measured, pre-2024 only — no GC coverage' },
    ]);
    await act(async () => { root.render(React.createElement(EventImpactPanel, { onClose: vi.fn() })); });
    await flush(container);
    const select = container.querySelector('select');
    await act(async () => { select.value = 'holiday'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    await flush(container);
    expect(container.textContent).toMatch(/5\.00/);          // sales still renders
    expect(container.textContent).not.toMatch(/gc null/);    // no fabricated GC text
    // Reset control still shows -- store DOES have a measured value (sales), just not GC.
    expect([...container.querySelectorAll('button')].some(b => b.title === 'Reset to measured')).toBe(true);
  });

  it('resetToMeasured restores GC fields to their measured seed, not just sales', async () => {
    loadEventImpactMock.mockResolvedValue([
      { loc: '3708', eventType: 'holiday', homeImpact: 0.05, awayImpact: null,
        measuredHome: 0.05, measuredAway: null, nHome: 12, nAway: null,
        gcHomeImpact: -0.03, gcAwayImpact: null,
        measuredGcHome: -0.03, measuredGcAway: null, nGcHome: 8, nGcAway: null,
        source: 'measured', storeType: null, note: null },
    ]);
    saveEventImpactMock.mockResolvedValue({ errors: [] });
    await act(async () => { root.render(React.createElement(EventImpactPanel, { onClose: vi.fn() })); });
    await flush(container);
    const select = container.querySelector('select');
    await act(async () => { select.value = 'holiday'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    await flush(container);

    // Edit the GC input away from its measured value.
    const inputs = [...container.querySelectorAll('input')];
    const gcInput = inputs.find(i => i.value === '-3.00');
    expect(gcInput).toBeTruthy();
    await act(async () => { setNativeValue(gcInput, '9.99'); });
    await flush(container);
    // Input values live in the DOM node's `value` property, not textContent -- check the node,
    // and confirm the panel registered a real edit (dirty-count footer badge).
    expect([...container.querySelectorAll('input')].some(i => i.value === '9.99')).toBe(true);
    expect(container.textContent).toMatch(/1 unsaved/);

    // Reset -> back to the measured GC seed.
    const resetBtn = [...container.querySelectorAll('button')].find(b => b.title === 'Reset to measured');
    await act(async () => { resetBtn.click(); });
    await flush(container);
    expect([...container.querySelectorAll('input')].some(i => i.value === '-3.00')).toBe(true);
  });
});
