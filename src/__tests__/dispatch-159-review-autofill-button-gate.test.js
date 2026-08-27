// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #159 — the UI half of the fix. Renders the REAL PerformanceReviewsPanel ->
// ReviewEditor -> KPITab chain (this project's "verification must touch the call site"
// standing rule — a test that only calls autoPopulateKPIs directly, as
// dispatch-159-review-autofill-cloud-race.test.js does, would still pass unchanged if the
// button's own gating were reverted, since it never renders the button at all).
//
// Before this dispatch, "Auto-fill from Uploaded Data" was enabled the instant `ds.loaded`
// was true — with no dependency on whether the Supabase auto/cloud streams
// (qsrActSummaryRows/glimpseRows/opsServiceRows) that OEPE/R2P/KVS/Labor% resolve from FIRST
// had actually landed in `ds` yet (App.js's "T1", a real network round-trip that settles well
// after the local-IDB-restore effect flips `ds.loaded`). `dataReady` is App.js's honest "T1
// finished" signal, threaded PerformanceReviewsPanel -> ReviewEditor -> KPITab.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { PerformanceReviewsPanel } = await import('../views/performance-reviews.js');

function installLS() {
  const store = {};
  globalThis.localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    clear: () => { for (const k in store) delete store[k]; },
  };
}

async function createReview(container, name) {
  const newBtn = [...container.querySelectorAll('button')].find(b => b.textContent === '+ New Review');
  await act(async () => { newBtn.click(); });
  const nameInput = container.querySelector('input[placeholder="Full name"]');
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(nameInput, name);
    nameInput.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const createBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Create');
  await act(async () => { createBtn.click(); });
}

async function openReview(container, name) {
  const nameSpan = [...container.querySelectorAll('span')].find(s => s.textContent === name);
  expect(nameSpan, `review row for ${name} not found`).toBeTruthy();
  await act(async () => { nameSpan.parentElement.click(); });
}

function autoFillBtn(container) {
  return [...container.querySelectorAll('button')].find(b => b.textContent === 'Auto-fill from Uploaded Data');
}

describe('dispatch #159 — Auto-fill button waits for the real cloud streams, not just ds.loaded', () => {
  let container, root;
  beforeEach(() => {
    installLS();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
    try { delete globalThis.localStorage; } catch {}
  });

  it('dataReady=false (T1 still in flight): ds.loaded alone is NOT enough — button stays disabled with a "still loading" hint', async () => {
    await act(async () => {
      root.render(React.createElement(PerformanceReviewsPanel, {
        stores: [{ loc: '5985', name: 'Test Store' }],
        ds: { loaded: true, opsRows: [] }, // ds.loaded true — same state as right after IDB restore
        settings: {}, onClose: () => {}, userRole: 'admin',
        dataReady: false, // T1 (qsrActSummaryRows/glimpseRows/opsServiceRows) has not landed yet
      }));
    });
    await createReview(container, 'Dispatch159 Race Test A');
    await openReview(container, 'Dispatch159 Race Test A');

    const btn = autoFillBtn(container);
    expect(btn, 'Auto-fill button not found').toBeTruthy();
    expect(btn.disabled).toBe(true);
    expect(container.textContent).toMatch(/still loading/i);
  });

  it('dataReady=true (T1 landed): the same ds.loaded state now enables the button, no stale warning', async () => {
    await act(async () => {
      root.render(React.createElement(PerformanceReviewsPanel, {
        stores: [{ loc: '5985', name: 'Test Store' }],
        ds: { loaded: true, opsRows: [] },
        settings: {}, onClose: () => {}, userRole: 'admin',
        dataReady: true,
      }));
    });
    await createReview(container, 'Dispatch159 Race Test B');
    await openReview(container, 'Dispatch159 Race Test B');

    const btn = autoFillBtn(container);
    expect(btn, 'Auto-fill button not found').toBeTruthy();
    expect(btn.disabled).toBe(false);
    expect(container.textContent).not.toMatch(/still loading/i);
  });

  it('dataReady omitted (existing callers, e.g. other render paths / tests not yet wired to the signal): defaults to ready, matching pre-dispatch behavior', async () => {
    await act(async () => {
      root.render(React.createElement(PerformanceReviewsPanel, {
        stores: [{ loc: '5985', name: 'Test Store' }],
        ds: { loaded: true, opsRows: [] },
        settings: {}, onClose: () => {}, userRole: 'admin',
        // dataReady intentionally omitted
      }));
    });
    await createReview(container, 'Dispatch159 Race Test C');
    await openReview(container, 'Dispatch159 Race Test C');

    const btn = autoFillBtn(container);
    expect(btn.disabled).toBe(false);
  });
});
