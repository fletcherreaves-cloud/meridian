// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #157 (Performance Review continuity, Phase 4b/5b UI) — Priority 2 tests.
//
// Surfaces dispatch #154's segmented-scoring engine (computeSegmentedReview), which shipped
// Phase 5a with ZERO UI. Renders the REAL PerformanceReviewsPanel -> ReviewEditor -> SummaryTab
// chain (not the engine functions in isolation — this project's "verification must touch the
// call site" standing rule) so a revert of the wiring, not just the engine, shows up here.
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

async function goToSummaryTab(container) {
  const tabBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Summary & Scores');
  expect(tabBtn, 'Summary & Scores tab not found').toBeTruthy();
  await act(async () => { tabBtn.click(); });
}

const SEGMENT_MARKER = 'ROLE / STORE CHANGE DETECTED';

describe('dispatch #157 — flat/common case (hasTransitions:false) renders NO segment UI', () => {
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

  it('a review with no staff_assignments rows shows the regular period scores, no segment section', async () => {
    await act(async () => {
      root.render(React.createElement(PerformanceReviewsPanel, {
        stores: [{ loc: '3708', name: 'Test Store' }], ds: { loaded: true }, settings: {},
        onClose: () => {}, userRole: 'admin',
      }));
    });
    await createReview(container, 'Dispatch157 Flat Case');
    await openReview(container, 'Dispatch157 Flat Case');
    await goToSummaryTab(container);

    expect(container.textContent).not.toMatch(SEGMENT_MARKER);
    expect(container.textContent).not.toMatch(/Provisional Rollup/);
    expect(container.textContent).not.toMatch(/REVIEWER COMMENTARY/);
    // The regular, unchanged baseline IS present — hero score card, category breakdown.
    expect(container.textContent).toMatch(/Overall Score/);
    expect(container.textContent).toMatch(/Category Breakdown/);
  });
});

describe('dispatch #157 — segmented review (mid-year transfer + promotion) renders both segments + provisional rollup', () => {
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

  const NAME = 'Dispatch157 Segment Test';
  const YEAR = new Date().getFullYear();
  // Mid-year store transfer + role promotion: sm_am_dm @ store 100 (Jan-Jun) -> gm @ store 200
  // (Jul-Dec) — the exact "unified mechanism" scenario dispatch #154's own engine tests use
  // (dispatch-154-segmented-scoring.test.js), now exercised through the real UI.
  const assignmentRows = [
    { person: NAME, role: 'sm_am_dm', target_type: 'store', target: '100', start: `${YEAR}-01-01` },
    { person: NAME, role: 'gm',       target_type: 'store', target: '200', start: `${YEAR}-07-01` },
  ];

  it('renders each segment with its own role/store/scores, plus the provisional rollup framing text', async () => {
    await act(async () => {
      root.render(React.createElement(PerformanceReviewsPanel, {
        stores: [{ loc: '200', name: 'Store 200' }], ds: { loaded: true, assignmentRows },
        settings: {}, onClose: () => {}, userRole: 'admin',
      }));
    });
    // NewReviewForm defaults role=GM, loc=stores[0].loc='200' — matches the post-promotion
    // segment (Jul-Dec, gm@200); no person field exists yet (Phase 4b UI gap, unrelated to this
    // dispatch) so computeSegmentedReview resolves the person via review.name (the documented
    // fallback — review-engine.js's own computeSegmentedReview header comment).
    await createReview(container, NAME);
    await openReview(container, NAME);
    await goToSummaryTab(container); // default period is 'year' — spans both segments

    expect(container.textContent).toMatch(SEGMENT_MARKER);
    expect(container.textContent).toMatch(/Provisional Rollup/);
    // The engine's own rollup.note text, surfaced verbatim (not paraphrased into something that
    // implies finality) — "starting point... not a final number" (provisionalSegmentRollup).
    expect(container.textContent).toMatch(/starting point/i);
    expect(container.textContent).toMatch(/not a final number/i);
    // Both segments' own role + store are visible, not blended into one number.
    expect(container.textContent).toMatch(/Assistant Manager/); // sm_am_dm -> AM (LADDER_ROLE_TO_REVIEW_ROLE)
    expect(container.textContent).toMatch(/General Manager/);
    expect(container.textContent).toMatch(/Store 100/);
    expect(container.textContent).toMatch(/Store 200/);
    // The known, documented autoPopulateKPIs-not-segment-aware limitation is surfaced, not silent.
    expect(container.textContent).toMatch(/known limitation/i);
  });

  it('reviewer commentary on the rollup is entered, saved via onSave/upsertReview, and reloaded correctly', async () => {
    await act(async () => {
      root.render(React.createElement(PerformanceReviewsPanel, {
        stores: [{ loc: '200', name: 'Store 200' }], ds: { loaded: true, assignmentRows },
        settings: {}, onClose: () => {}, userRole: 'admin',
      }));
    });
    await createReview(container, NAME);
    await openReview(container, NAME);
    await goToSummaryTab(container);

    const commentary = container.querySelector('textarea[placeholder^="The provisional number above"]');
    expect(commentary, 'reviewer commentary textarea not found').toBeTruthy();

    const COMMENT_TEXT = 'Weighted rollup understates it — GM ramp-up was ahead of plan by month 2, scoring this as if fully on-target from day one.';
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(commentary, COMMENT_TEXT);
      commentary.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(commentary.value).toBe(COMMENT_TEXT);

    // Save (ReviewEditor header) -> onSave -> upsertReview -> persisted through the SAME path
    // every other review edit uses, not a bespoke storage mechanism for this one field.
    const saveBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Save');
    expect(saveBtn, 'Save button not found').toBeTruthy();
    await act(async () => { saveBtn.click(); });

    const savedDirect = Object.values(getReviews()).find(r => r.name === NAME);
    expect(savedDirect?.comments?.segmentRollup?.year).toBe(COMMENT_TEXT);

    // Reload: back to the list, reopen the SAME review — proves this round-trips through
    // getReviews() on a fresh open, not just held in the editor's local React state.
    const backBtn = [...container.querySelectorAll('button')].find(b => b.textContent === '← Back');
    await act(async () => { backBtn.click(); });
    await openReview(container, NAME);
    await goToSummaryTab(container);

    const commentaryReloaded = container.querySelector('textarea[placeholder^="The provisional number above"]');
    expect(commentaryReloaded?.value).toBe(COMMENT_TEXT);
  });
});
