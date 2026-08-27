// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #152 (Performance Review continuity, Phase 4a) — UI crash guard.
//
// This dispatch is explicitly DATA/ENGINE LAYER ONLY: the creation form's H1/H2 picker, the list
// view's period column, the in-editor period selector, and the print functions are Phase 4b, a
// separate later dispatch, and are expected to render WRONG/incomplete data against the new
// per-year shape (documented in this dispatch's PR body) -- not something this test papers over.
//
// But the dispatch's own scope note carves out one exception: "if it's a trivial one-line fix to
// keep the existing UI from crashing... fix that specific crash." This test is what actually
// FOUND that crash (per this repo's "measure it, don't reason about it" standing rule) rather
// than reasoning it away: NewReviewForm's old 6-arg `blankReview(name, role, loc, year, half,
// cfg)` call, unfixed, would shift `half` into blankReview's new `cfg` parameter slot and the
// real `cfg` object into the new `person` slot -- corrupting `templateSnapshot` into a raw
// string, which then throws inside computeScores()/computeScoreBreakdown()'s
// `Object.entries(cfg.categoryWeights)` the very first time the freshly-created review is opened.
// Fixed in this dispatch (see the `submit()` comment in performance-reviews.js). This test
// renders the REAL PerformanceReviewsPanel -> NewReviewForm -> ReviewEditor chain (not an
// isolated helper, matching dispatch #149's own test file's rationale) so a regression of either
// half of that fix shows up here again.
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

describe('dispatch #152 UI crash guard — create + open a review through the real panel', () => {
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

  it('creating a new review, then opening it, does not throw', async () => {
    await act(async () => {
      root.render(React.createElement(PerformanceReviewsPanel, {
        stores: [{ loc: '3708', name: 'Test Store' }], ds: { loaded: true }, settings: {},
        onClose: () => {}, userRole: 'admin',
      }));
    });

    const newBtn = [...container.querySelectorAll('button')].find(b => b.textContent === '+ New Review');
    expect(newBtn, '+ New Review button not found').toBeTruthy();
    await act(async () => { newBtn.click(); });

    const nameInput = container.querySelector('input[placeholder="Full name"]');
    expect(nameInput, 'Name input not found').toBeTruthy();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(nameInput, 'Dispatch152 Test');
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const createBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Create');
    expect(createBtn, 'Create button not found').toBeTruthy();
    // This is the exact call path that would have thrown pre-fix (blankReview's old 6-arg shape
    // shifting `half` into the new `cfg` slot).
    await act(async () => { createBtn.click(); });

    expect(container.textContent).toMatch(/Dispatch152 Test/);

    const nameSpan = [...container.querySelectorAll('span')].find(s => s.textContent === 'Dispatch152 Test');
    expect(nameSpan, 'review row not found in the list').toBeTruthy();
    // Open the review — exercises computeScores/computeScoreBreakdown on the freshly-created
    // review (the second half of the crash path: a corrupted templateSnapshot only actually
    // throws once something calls resolveReviewConfig -> cfg.categoryWeights against it).
    // The name span is a direct child of the clickable row div (performance-reviews.js's
    // ReviewList row markup).
    await act(async () => { nameSpan.parentElement.click(); });

    expect(container.textContent).toMatch(/Dispatch152 Test/);
  });
});
