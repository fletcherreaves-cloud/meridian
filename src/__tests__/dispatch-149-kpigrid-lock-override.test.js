// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #149 — Performance Review continuity, Phase 2: lock auto-populated actuals,
// reason-required override. Renders the REAL KPIGrid component (exported for exactly this,
// see its own comment in performance-reviews.js) rather than an isolated helper, per this
// repo's "would this verification still pass if reverted?" standing rule — satisfies the
// dispatch's own verification bar: "Manually verify in a rendered KPIGrid (or a targeted test)
// that: an auto-sourced actual cell is read-only for an unauthorized viewer, an authorized
// overrider can submit the 3-option dropdown form, 'Something Else' without an explanation is
// rejected client-side, and the resolved value (not the raw auto value) is what scoring uses."
// (The scoring half of that bar is covered separately, at the engine level, by
// review-locked-actuals-override.test.js — computeScores/computeScoreBreakdown against
// applyReviewOverrides' resolved review.)
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { KPIGrid } = await import('../views/performance-reviews.js');

// Minimal single-metric cfg — one src:'auto' scored metric (oepe), so exactly one pencil
// affordance exists per visible month, easy to locate unambiguously.
const cfg = {
  metrics: {
    rgr: [
      { key: 'oepe', label: 'OEPE (Peaks, sec)', weight: 1, better: 'lower', unit: 'abs',
        scored: true, t: [-5, 5, 10], src: 'auto', field: 'oepe' },
    ],
  },
};
const metrics = cfg.metrics.rgr;
const mths = [1];
const qKeys = ['q1'];

function monthsWith(oepe, oepeTgt = 140) {
  return { 1: { year: 2026, month: 1, oepe, oepeTgt } };
}

function render(props) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  return { container, root };
}

describe('KPIGrid — locked auto actual + override affordance (dispatch #149)', () => {
  let container, root;
  beforeEach(() => { ({ container, root } = render()); });
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

  it('an auto-sourced actual cell is READ-ONLY for an unauthorized viewer (no pencil affordance)', async () => {
    await act(async () => {
      root.render(React.createElement(KPIGrid, {
        metrics, months: monthsWith(200), rawMonths: monthsWith(200), mths, qKeys,
        setMonthKPI: () => { throw new Error('should never be called on a locked cell'); },
        cfg, overrides: [], canOverride: false, onAddOverride: () => {},
      }));
    });
    const input = container.querySelector('input[placeholder="Act"]');
    expect(input).toBeTruthy();
    expect(input.disabled).toBe(true);
    // No override pencil for an unauthorized viewer — the affordance doesn't exist at all.
    const pencil = [...container.querySelectorAll('button')].find(b => b.title && b.title.includes('override'));
    expect(pencil).toBeFalsy();
  });

  it('an authorized overrider sees the pencil affordance and can open the override form', async () => {
    await act(async () => {
      root.render(React.createElement(KPIGrid, {
        metrics, months: monthsWith(200), rawMonths: monthsWith(200), mths, qKeys,
        setMonthKPI: () => {}, cfg, overrides: [], canOverride: true, onAddOverride: () => {},
      }));
    });
    const pencil = [...container.querySelectorAll('button')].find(b => b.title && b.title.includes('override'));
    expect(pencil).toBeTruthy();
    await act(async () => { pencil.click(); });
    expect(container.textContent).toMatch(/Override — OEPE/);
    expect(container.textContent).toMatch(/Select a reason/);
  });

  it('"Something Else" WITHOUT an explanation is rejected client-side — no submission goes through', async () => {
    let submitted = null;
    await act(async () => {
      root.render(React.createElement(KPIGrid, {
        metrics, months: monthsWith(200), rawMonths: monthsWith(200), mths, qKeys,
        setMonthKPI: () => {}, cfg, overrides: [], canOverride: true,
        onAddOverride: (month, key, input) => { submitted = { month, key, input }; },
      }));
    });
    const pencil = [...container.querySelectorAll('button')].find(b => b.title && b.title.includes('override'));
    await act(async () => { pencil.click(); });

    const select = container.querySelector('select');
    await act(async () => {
      select.value = 'something_else';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    // Explanation textarea should now be showing (required for this reason).
    expect(container.textContent).toMatch(/Explanation \(required\)/);

    const submitBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Submit Override');
    await act(async () => { submitBtn.click(); });

    expect(submitted).toBeNull(); // rejected client-side, onAddOverride never called
    expect(container.textContent).toMatch(/explanation is required/i);
  });

  it('a valid override ("Inaccurate Data", no note required) submits and calls onAddOverride with the right shape', async () => {
    let submitted = null;
    await act(async () => {
      root.render(React.createElement(KPIGrid, {
        metrics, months: monthsWith(200), rawMonths: monthsWith(200), mths, qKeys,
        setMonthKPI: () => {}, cfg, overrides: [], canOverride: true,
        onAddOverride: (month, key, input) => { submitted = { month, key, input }; },
      }));
    });
    const pencil = [...container.querySelectorAll('button')].find(b => b.title && b.title.includes('override'));
    await act(async () => { pencil.click(); });

    const valueInput = container.querySelector('input[type="number"]');
    const select = container.querySelector('select');
    // React patches HTMLInputElement.prototype's native value setter to track "did this really
    // change" for controlled inputs — a plain `input.value = '132'` goes through that patched
    // setter and React sees no change, so the synthetic onChange never fires. Go through the
    // ORIGINAL native setter instead (the standard React-testing workaround), then dispatch the
    // native 'input' event React actually listens to for a text/number <input>'s onChange
    // ('change' is what it listens to for <select> instead, why the select-only test above
    // worked with a plain 'change' dispatch).
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    await act(async () => {
      nativeInputValueSetter.call(valueInput, '132');
      valueInput.dispatchEvent(new Event('input', { bubbles: true }));
      select.value = 'inaccurate_data';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const submitBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Submit Override');
    await act(async () => { submitBtn.click(); });

    expect(submitted).not.toBeNull();
    expect(submitted.month).toBe(1);
    expect(submitted.key).toBe('oepe');
    expect(submitted.input.value).toBe(132);
    expect(submitted.input.reason).toBe('inaccurate_data');
  });

  it('displays the RESOLVED (overridden) value, not the raw auto value, and marks the cell overridden', async () => {
    const overrides = [{
      id: 'ov1', month: 1, metricKey: 'oepe', value: 132, reason: 'inaccurate_data',
      overriddenAt: '2026-01-05T00:00:00Z',
    }];
    await act(async () => {
      root.render(React.createElement(KPIGrid, {
        metrics,
        months: monthsWith(132),   // caller (KPITab) has already resolved this via applyReviewOverrides
        rawMonths: monthsWith(200), // the raw auto-populated value, kept only for the modal's "current" display
        mths, qKeys, setMonthKPI: () => {}, cfg, overrides, canOverride: true, onAddOverride: () => {},
      }));
    });
    const input = container.querySelector('input[placeholder="Act"]');
    expect(input.value).toBe('132'); // resolved value shown, not the raw 200
    expect(container.textContent).toMatch(/overridden/i);
  });
});
