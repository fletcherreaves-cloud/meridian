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
