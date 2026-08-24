// @vitest-environment happy-dom
// @ts-nocheck
// Forms dashboard Slice 2 -- render-based tests for FormsCompletionPanel, matching this repo's
// own standing rule ("would this verification still pass if the change were reverted?") from
// the #366 postmortem: a test that only imports computeFormStoreDayRollup/computeFormSummary
// can't tell "built" from "built but never wired into the panel." Mocks src/lib/supabase.js's
// loadQsrFormsCompletion the same way security-panel.test.js mocks its own loaders -- no live
// Supabase session in this sandbox.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

const loadQsrFormsCompletionMock = vi.fn();

vi.mock('../lib/supabase.js', () => ({
  loadQsrFormsCompletion: (...args) => loadQsrFormsCompletionMock(...args),
}));

import { FormsCompletionPanel } from '../views/forms-panel.js';

const FORM_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const FORM_B = 'aaaaaaaa-0000-4000-8000-000000000002';

// Already-normalized loader-shape rows (camelCase, matching loadQsrFormsCompletion's own mapped
// output) -- no raw API payload here, so no PII surface at all.
function row(formId, formTitle, occurrenceKey, statusState, loc = '0006178') {
  return { loc, formId, formTitle, occurrenceKey, statusState, missed: statusState === 'missed', hasResponse: statusState === 'completed' };
}

async function flush(container, maxTicks = 15) {
  let last;
  for (let i = 0; i < maxTicks; i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
    if (container.textContent === last) return;
    last = container.textContent;
  }
}

describe('FormsCompletionPanel — renders the real panel, not just the engine it calls', () => {
  let container, root;
  beforeEach(() => {
    loadQsrFormsCompletionMock.mockReset();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
  });

  it('empty result set renders an honest "no data synced yet" state, not a fake table', async () => {
    loadQsrFormsCompletionMock.mockResolvedValue([]);
    await act(async () => { root.render(React.createElement(FormsCompletionPanel, { onClose: vi.fn() })); });
    await flush(container);
    expect(container.textContent).toMatch(/No form completions synced/i);
  });

  it('a load failure renders an error state, not a silent empty table', async () => {
    loadQsrFormsCompletionMock.mockRejectedValue(new Error('network down'));
    await act(async () => { root.render(React.createElement(FormsCompletionPanel, { onClose: vi.fn() })); });
    await flush(container);
    expect(container.textContent).toMatch(/could not load/i);
  });

  it('renders per-form pass rate through the real rollup+summary chain, with the number BESIDE the bar', async () => {
    loadQsrFormsCompletionMock.mockResolvedValue([
      row(FORM_A, 'Breakfast Pre-Shift', '2026-08-19T11:00:00Z', 'completed'),
      row(FORM_A, 'Breakfast Pre-Shift', '2026-08-19T12:00:00Z', 'completed'),
      row(FORM_A, 'Breakfast Pre-Shift', '2026-08-19T13:00:00Z', 'completed'),
      row(FORM_A, 'Breakfast Pre-Shift', '2026-08-19T14:00:00Z', 'missed'), // 3/4 = 75%
    ]);
    await act(async () => { root.render(React.createElement(FormsCompletionPanel, { onClose: vi.fn() })); });
    await flush(container);
    expect(container.textContent).toMatch(/Breakfast Pre-Shift/);
    expect(container.textContent).toMatch(/75\.0%/);
    expect(container.textContent).toMatch(/3 of 4 resolved occurrences completed/);
  });

  it('open ("--") rows never count toward the denominator -- the panel does not read raw rows, only the engine output', async () => {
    loadQsrFormsCompletionMock.mockResolvedValue([
      row(FORM_A, 'Travel Path', '2026-08-19T11:00:00Z', 'completed'),
      row(FORM_A, 'Travel Path', '2026-08-19T12:00:00Z', 'open'),
      row(FORM_A, 'Travel Path', '2026-08-19T13:00:00Z', 'open'),
    ]);
    await act(async () => { root.render(React.createElement(FormsCompletionPanel, { onClose: vi.fn() })); });
    await flush(container);
    expect(container.textContent).toMatch(/100\.0%/);
    expect(container.textContent).toMatch(/1 of 1 resolved occurrences completed/);
  });

  it('worst form renders first, and a per-form threshold input is present for each form', async () => {
    loadQsrFormsCompletionMock.mockResolvedValue([
      row(FORM_A, 'Good Form', '2026-08-19T11:00:00Z', 'completed'),
      row(FORM_B, 'Bad Form', '2026-08-19T11:00:00Z', 'missed'),
    ]);
    await act(async () => { root.render(React.createElement(FormsCompletionPanel, { onClose: vi.fn() })); });
    await flush(container);
    const titleEls = [...container.querySelectorAll('span')].filter(s => s.textContent === 'Good Form' || s.textContent === 'Bad Form');
    const order = titleEls.map(e => e.textContent);
    expect(order.indexOf('Bad Form')).toBeLessThan(order.indexOf('Good Form'));
    const thresholdInputs = [...container.querySelectorAll('input[type="number"]')];
    expect(thresholdInputs).toHaveLength(2);
    expect(thresholdInputs.every(i => i.value === '80')).toBe(true); // default 80% threshold
  });

  it('renders its OWN per-stream freshness reading -- never pooled with anything else (#171)', async () => {
    const now = new Date();
    const freshIso = new Date(now.getTime() - 60 * 60 * 1000).toISOString(); // 1h ago -- today
    loadQsrFormsCompletionMock.mockResolvedValue([row(FORM_A, 'Breakfast Pre-Shift', freshIso, 'completed')]);
    await act(async () => { root.render(React.createElement(FormsCompletionPanel, { onClose: vi.fn() })); });
    await flush(container);
    expect(container.textContent).toMatch(/Synced today/);
  });

  it('a stale window (last occurrence 10 days ago) reads as stale, not silently "ok"', async () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    loadQsrFormsCompletionMock.mockResolvedValue([row(FORM_A, 'Breakfast Pre-Shift', tenDaysAgo, 'completed')]);
    await act(async () => { root.render(React.createElement(FormsCompletionPanel, { onClose: vi.fn() })); });
    await flush(container);
    expect(container.textContent).toMatch(/Last synced 10d ago/);
  });

  it('changing the window pill re-fetches with a new date range', async () => {
    loadQsrFormsCompletionMock.mockResolvedValue([]);
    await act(async () => { root.render(React.createElement(FormsCompletionPanel, { onClose: vi.fn() })); });
    await flush(container);
    expect(loadQsrFormsCompletionMock).toHaveBeenCalledTimes(1);
    const btn30 = [...container.querySelectorAll('button')].find(b => b.textContent === '30d');
    await act(async () => { btn30.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush(container);
    expect(loadQsrFormsCompletionMock).toHaveBeenCalledTimes(2);
  });
});

// ── Dispatch #101 — per-occurrence detail, location selector, real date range, "completed by" ───
// Real store/patch fixtures, matching the shape INV_ORG_COORDS/STORE_NAMES actually use (unpadded
// loc keys) -- see the panel's own comment on why loadQsrFormsCompletion's `.loc` is already
// unpadded ("NaN" for the NOLOC no-store sentinel) by the time the panel ever sees it.
const STORE_A = '6178';  // FL, per constants.js INV_ORG_COORDS/STORE_NAMES
const STORE_B = '3708';  // OK
const STORES_PROP = [{ loc: STORE_A }, { loc: STORE_B }];

describe('FormsCompletionPanel — dispatch #101: per-occurrence detail, location + date-range controls', () => {
  let container, root;
  beforeEach(() => {
    loadQsrFormsCompletionMock.mockReset();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
  });

  it('expanding a form shows real store/form/date/completion%/time-to-complete/status for its occurrences, and the existing rollup row is untouched', async () => {
    loadQsrFormsCompletionMock.mockResolvedValue([
      {
        loc: STORE_A, formId: FORM_A, formTitle: 'Breakfast Pre-Shift',
        occurrenceKey: '2026-08-19T11:00:00Z', statusState: 'completed', missed: false, hasResponse: true,
        completionRatio: 93 / 94, timeToCompleteMs: 109940, userId: null,
      },
    ]);
    await act(async () => { root.render(React.createElement(FormsCompletionPanel, { onClose: vi.fn(), stores: STORES_PROP, userRole: 'manager' })); });
    await flush(container);
    // Rollup row unchanged (existing behavior, re-asserted here so a revert of the detail view
    // would be caught if it also broke the rollup).
    expect(container.textContent).toMatch(/100\.0%/);
    expect(container.textContent).toMatch(/1 of 1 resolved occurrences completed/);
    // Detail hidden until expanded.
    expect(container.textContent).not.toMatch(/98\.9%/);
    const toggle = [...container.querySelectorAll('button')].find(b => /Occurrences/.test(b.textContent));
    expect(toggle).toBeTruthy();
    await act(async () => { toggle.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush(container);
    // Store resolved via sName/STORE_NAMES -- not a bare loc code.
    expect(container.textContent).toMatch(/6178 — Chipley-St Rd 77/);
    expect(container.textContent).toMatch(/Breakfast Pre-Shift/);
    expect(container.textContent).toMatch(/2026-08-19/); // localDayKey, America/Chicago
    expect(container.textContent).toMatch(/98\.9%/); // fPct(93/94)
    expect(container.textContent).toMatch(/1m 50s/); // formatDuration(109940)
    expect(container.textContent).toMatch(/Completed/);
  });

  it('a missed occurrence with no userId shows an em dash for "completed by", never a fabricated name', async () => {
    loadQsrFormsCompletionMock.mockResolvedValue([
      { loc: STORE_A, formId: FORM_A, formTitle: 'Breakfast Pre-Shift', occurrenceKey: '2026-08-19T11:00:00Z', statusState: 'missed', missed: true, hasResponse: false, completionRatio: null, timeToCompleteMs: null, userId: null },
    ]);
    await act(async () => { root.render(React.createElement(FormsCompletionPanel, { onClose: vi.fn(), stores: STORES_PROP, userRole: 'admin' })); });
    await flush(container);
    const toggle = [...container.querySelectorAll('button')].find(b => /Occurrences/.test(b.textContent));
    await act(async () => { toggle.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush(container);
    const row = [...container.querySelectorAll('tbody tr')][0];
    expect(row.textContent).toMatch(/—/);
    expect(row.textContent).not.toMatch(/ID /); // no diagnostic ID shown when there is no userId
  });

  it('"completed by" — a real userId is a UUID (never a name), shown ONLY to the privileged role tier', async () => {
    const REAL_SHAPE_ID = '848854c8-30f1-7076-c6f7-dcf35091bd06'; // shape only, matches the measured live sample
    loadQsrFormsCompletionMock.mockResolvedValue([
      { loc: STORE_A, formId: FORM_A, formTitle: 'Breakfast Pre-Shift', occurrenceKey: '2026-08-19T11:00:00Z', statusState: 'completed', missed: false, hasResponse: true, completionRatio: 1, timeToCompleteMs: 5000, userId: REAL_SHAPE_ID },
    ]);
    // Non-privileged role: never sees the raw ID.
    await act(async () => { root.render(React.createElement(FormsCompletionPanel, { onClose: vi.fn(), stores: STORES_PROP, userRole: 'manager' })); });
    await flush(container);
    let toggle = [...container.querySelectorAll('button')].find(b => /Occurrences/.test(b.textContent));
    await act(async () => { toggle.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush(container);
    expect(container.textContent).not.toMatch(new RegExp(REAL_SHAPE_ID));

    // Privileged role: sees a short, explicitly-labeled diagnostic fragment -- never the bare
    // full UUID printed as if it were a name. Same component instance, so `expanded` state
    // survives this re-render (already expanded above) -- do NOT click the toggle again, that
    // would collapse it back.
    await act(async () => { root.render(React.createElement(FormsCompletionPanel, { onClose: vi.fn(), stores: STORES_PROP, userRole: 'admin' })); });
    await flush(container);
    expect(container.textContent).toMatch(/ID 848854c8…/);
    expect(container.textContent).not.toMatch(new RegExp(REAL_SHAPE_ID)); // full UUID never printed in text
  });

  it('selecting a store in the location selector re-fetches with that store as the locs filter', async () => {
    loadQsrFormsCompletionMock.mockResolvedValue([]);
    await act(async () => { root.render(React.createElement(FormsCompletionPanel, { onClose: vi.fn(), stores: STORES_PROP, userRole: 'admin' })); });
    await flush(container);
    expect(loadQsrFormsCompletionMock).toHaveBeenCalledTimes(1);
    // 'all' scope resolves to every store in the passed `stores` prop (sorted numerically) --
    // matches locationSelectorLocs's own contract, same as every other LocationSelector consumer.
    expect(loadQsrFormsCompletionMock.mock.calls[0][0].locs).toEqual([STORE_B, STORE_A]);

    const storeBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes(STORE_B) && b.textContent.includes('Ardmore'));
    expect(storeBtn).toBeTruthy();
    await act(async () => { storeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush(container);
    expect(loadQsrFormsCompletionMock).toHaveBeenCalledTimes(2);
    expect(loadQsrFormsCompletionMock.mock.calls[1][0].locs).toEqual([STORE_B]);
  });

  it('a custom date range re-fetches with the apiWindowForDays-derived window, and clearing it returns to the window pill', async () => {
    loadQsrFormsCompletionMock.mockResolvedValue([]);
    await act(async () => { root.render(React.createElement(FormsCompletionPanel, { onClose: vi.fn(), stores: STORES_PROP, userRole: 'admin' })); });
    await flush(container);
    expect(loadQsrFormsCompletionMock).toHaveBeenCalledTimes(1);

    const customToggle = [...container.querySelectorAll('button')].find(b => b.textContent === 'Custom…');
    await act(async () => { customToggle.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush(container);
    const dateInputs = [...container.querySelectorAll('input[type="date"]')];
    expect(dateInputs).toHaveLength(2);
    const setVal = (el, v) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    await act(async () => { setVal(dateInputs[0], '2026-08-19'); setVal(dateInputs[1], '2026-08-19'); });
    const applyBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Apply');
    await act(async () => { applyBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush(container);
    expect(loadQsrFormsCompletionMock).toHaveBeenCalledTimes(2);
    expect(loadQsrFormsCompletionMock.mock.calls[1][0]).toMatchObject({
      start: '2026-08-19T05:00:00.000Z', end: '2026-08-20T04:59:59.999Z',
    });
    expect(container.textContent).toMatch(/Using 2026-08-19 → 2026-08-19/);

    const clearBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Clear'));
    await act(async () => { clearBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush(container);
    expect(loadQsrFormsCompletionMock).toHaveBeenCalledTimes(3);
  });
});
