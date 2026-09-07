// @vitest-environment happy-dom
// @ts-nocheck
// backlog-open-2026-09-06.md §7 "Missing-targets UI in ReviewEditor (banner + one-click
// Smart-Targets seed)" -- missingReviewTargets() (review-engine.js) already existed, engine-
// tested (review-target-autofill.test.js), but had zero UI consumer. Renders the REAL
// PerformanceReviewsPanel -> ReviewEditor chain (this repo's "verification must touch the call
// site" standing rule) -- a test that only called missingReviewTargets() directly would still
// pass unchanged if the banner or its "Set Targets" button were never wired up.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { PerformanceReviewsPanel } = await import('../views/performance-reviews.js');
const { blankReview, upsertReview, DEFAULT_REVIEW_CONFIG } = await import('../engine/review-engine.js');

function installLS() {
  const store = {};
  globalThis.localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    clear: () => { for (const k in store) delete store[k]; },
  };
}

async function openReview(container, name) {
  const nameSpan = [...container.querySelectorAll('span')].find(s => s.textContent === name);
  expect(nameSpan, `review row for ${name} not found`).toBeTruthy();
  await act(async () => { nameSpan.parentElement.click(); });
}

const YEAR = new Date().getFullYear();
const NAME = 'Missing Targets Test GM';

function seedReview() {
  // No yearly-workbook targets and no target-overrides for this loc in `ds` below, so every
  // scored metric with no per-month target entered resolves to "no target" -- the exact
  // condition missingReviewTargets() flags.
  const review = blankReview(NAME, 'GM', '3708', YEAR, DEFAULT_REVIEW_CONFIG);
  upsertReview(review);
  return review;
}

describe('ReviewEditor missing-targets banner', () => {
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

  it('shows the missing-targets warning banner naming the unresolved scored metrics', async () => {
    seedReview();
    await act(async () => {
      root.render(React.createElement(PerformanceReviewsPanel, {
        stores: [{ loc: '3708', name: 'Test Store' }],
        ds: { loaded: true }, settings: {}, onClose: () => {}, userRole: 'admin',
      }));
    });
    await openReview(container, NAME);

    expect(container.textContent).toMatch(/scored metrics? with no target set/);
    // Real metric labels from this review's default config, not a placeholder -- these have no
    // yearly-workbook column and no override, so they're unconditionally missing regardless of
    // which test store this runs against (unlike e.g. Labor %, which DEFAULT_TARGETS resolves a
    // fallback for even on an unconfigured loc).
    expect(container.textContent).toMatch(/Complaint Contacts\/100K/);
    expect(container.textContent).toMatch(/EPB2B \(Pace Portal, %\)/);
  });

  it('"Set Targets →" jumps to Customize > Targets without leaving the panel', async () => {
    seedReview();
    await act(async () => {
      root.render(React.createElement(PerformanceReviewsPanel, {
        stores: [{ loc: '3708', name: 'Test Store' }],
        ds: { loaded: true }, settings: {}, onClose: () => {}, userRole: 'admin',
      }));
    });
    await openReview(container, NAME);

    const setTargetsBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Set Targets →');
    expect(setTargetsBtn, '"Set Targets →" button not found in the banner').toBeTruthy();
    await act(async () => { setTargetsBtn.click(); });

    // Real TargetsEditorSection content (same assertion dispatch-135's own deep-link test uses),
    // proving this landed on the actual Customize > Targets sub-tab, not a stub.
    expect(container.textContent).toMatch(/Set an override/);
  });

  it('no banner once every scored metric has a resolvable target (an empty missingReviewTargets result)', async () => {
    const review = blankReview(NAME, 'GM', '3708', YEAR, DEFAULT_REVIEW_CONFIG);
    // Force every scored metric's target field non-null on every month -- the same shape
    // missingReviewTargets() checks (`mo[m.key + 'Tgt'] != null`), regardless of source.
    for (const mets of Object.values(DEFAULT_REVIEW_CONFIG.metrics)) {
      for (const m of mets) {
        if (!m.scored) continue;
        for (const mo of Object.values(review.kpis.months)) mo[m.key + 'Tgt'] = 1;
      }
    }
    upsertReview(review);
    await act(async () => {
      root.render(React.createElement(PerformanceReviewsPanel, {
        stores: [{ loc: '3708', name: 'Test Store' }],
        ds: { loaded: true }, settings: {}, onClose: () => {}, userRole: 'admin',
      }));
    });
    await openReview(container, NAME);

    expect(container.textContent).not.toMatch(/with no target set/);
    expect(container.textContent).not.toMatch(/Set Targets →/);
  });
});
