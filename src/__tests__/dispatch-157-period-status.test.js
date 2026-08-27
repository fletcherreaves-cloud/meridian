// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #157 (Performance Review continuity, Phase 4b/5b UI) — Priority 1 regression tests.
//
// dispatch #152 (v5.197) changed the review data model to per-person-per-YEAR records
// (review.periods.h1/h2 each with an independent status, transitionReview(id, half, newStatus,
// notes) now 4-arg, computeScores/computeScoreBreakdown returning {q1,q2,q3,q4,h1,h2,year}) but
// performance-reviews.js was only patched enough to stop it crashing — the KPI/Behavioral period
// view was stuck on H2, the status pill/action bar read the nonexistent review.status, and every
// transition button called the engine's 4-arg transitionReview with only 3 args (shifting
// newStatus into the half slot and writing to a garbage review.periods['submitted'] key). This
// file renders the REAL PerformanceReviewsPanel -> NewReviewForm -> ReviewList -> ReviewEditor
// chain (not an isolated helper, matching dispatch-152's own test's rationale and this project's
// "verification must touch the call site" standing rule) so a revert of either the wiring fix or
// the period selector shows up here again.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { PerformanceReviewsPanel } = await import('../views/performance-reviews.js');
const { getReviews } = await import('../engine/review-engine.js');

function installLS() {
  const store = {};
  globalThis.localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    clear: () => { for (const k in store) delete store[k]; },
  };
}

const STORES = [{ loc: '3708', name: 'Test Store' }];

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

describe('dispatch #157 — Submit->Approve transition regression (the 3-vs-4-arg bug)', () => {
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

  it('Submit -> Approve on H1 changes review.periods.h1.status while h2 stays draft', async () => {
    await act(async () => {
      root.render(React.createElement(PerformanceReviewsPanel, {
        stores: STORES, ds: { loaded: true }, settings: {}, onClose: () => {}, userRole: 'admin',
      }));
    });

    await createReview(container, 'Dispatch157 Transition Test');
    await openReview(container, 'Dispatch157 Transition Test');

    // Default period is 'year', which renders BOTH halves' StatusActionBar side by side (h1
    // first, per ReviewEditor's ['h1','h2'] render order) — exactly what lets this test exercise
    // h1 specifically while proving h2 is untouched, in one open review.
    const submitBtns = () => [...container.querySelectorAll('button')].filter(b => b.textContent === 'Submit for Review');
    expect(submitBtns().length, 'expected two Submit buttons (h1 and h2, both draft)').toBe(2);

    // Click the FIRST Submit button — h1's, per render order.
    await act(async () => { submitBtns()[0].click(); });

    // h1 is now 'submitted' (only one Submit button left, for h2); an Approve button exists for h1.
    expect(submitBtns().length, 'h2 should still show Submit for Review (untouched)').toBe(1);
    const approveBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Approve');
    expect(approveBtn, 'Approve button for h1 not found').toBeTruthy();

    await act(async () => { approveBtn.click(); });

    // Read the actual PERSISTED review object back — this is the assertion that would have
    // caught the pre-fix 3-vs-4-arg bug: transitionReview(id, 'submitted', '') pre-fix wrote to
    // review.periods['submitted'] (a garbage key), leaving periods.h1.status stuck at 'draft'
    // forever and periods.h2 untouched either way.
    const reviews = getReviews();
    const saved = Object.values(reviews).find(r => r.name === 'Dispatch157 Transition Test');
    expect(saved, 'review not found in storage').toBeTruthy();
    expect(saved.periods.h1.status).toBe('approved');
    expect(saved.periods.h2.status).toBe('draft');
    // No garbage key from the old 3-arg shift bug.
    expect(saved.periods.submitted).toBeUndefined();
    expect(saved.periods.approved).toBeUndefined();
  });
});

describe('dispatch #157 — real period selector (Q1-Q4/H1/H2/Year), fixes the stuck-on-H2 bug', () => {
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

  it('switching between H1 and H2 shows the correct months (H1=Jan-Jun, H2=Jul-Dec)', async () => {
    await act(async () => {
      root.render(React.createElement(PerformanceReviewsPanel, {
        stores: STORES, ds: { loaded: true }, settings: {}, onClose: () => {}, userRole: 'admin',
      }));
    });

    await createReview(container, 'Dispatch157 Period Test');
    await openReview(container, 'Dispatch157 Period Test');

    const periodSelect = [...container.querySelectorAll('select')]
      .find(s => [...s.options].some(o => o.value === 'h1') && [...s.options].some(o => o.value === 'year'));
    expect(periodSelect, 'period selector not found').toBeTruthy();

    const setSelect = async (value) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
      await act(async () => {
        setter.call(periodSelect, value);
        periodSelect.dispatchEvent(new Event('change', { bubbles: true }));
      });
    };

    await setSelect('h1');
    expect(container.textContent).toMatch(/Jan/);
    expect(container.textContent).not.toMatch(/Jul/);

    await setSelect('h2');
    expect(container.textContent).toMatch(/Jul/);
    expect(container.textContent).not.toMatch(/Jan/);
  });
});
