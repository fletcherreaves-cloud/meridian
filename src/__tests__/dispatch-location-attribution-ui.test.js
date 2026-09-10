// @vitest-environment happy-dom
// @ts-nocheck
// Backlog item / notes-33-queue.md's "AI recommendations" A — the location-attribution
// tightening's UI half. Renders the REAL PerformanceReviewsPanel -> SegmentedReviewSection
// chain (this repo's "verification must touch the call site" standing rule), reusing
// dispatch-157's own proven mid-year-transfer fixture, so a revert of the wiring (not just
// engine/review-engine.js's periodAttributionSplit) shows up here.
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
async function goToSummaryTab(container) {
  const tabBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Summary & Scores');
  expect(tabBtn, 'Summary & Scores tab not found').toBeTruthy();
  await act(async () => { tabBtn.click(); });
}

const NEEDS_ATTENTION_MARKER = /No single store holds a clear majority/;
const YEAR = new Date().getFullYear();

describe('SegmentedReviewSection location-attribution split (backlog: "AI recommendations" A)', () => {
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

  it('a genuinely close mid-year split (Jan-Jun / Jul-Dec) shows the day-weighted split AND the needsAttention warning', async () => {
    const NAME = 'Attribution Split Close Case';
    // Same fixture shape dispatch-157's own UI test uses -- Jan-Jun @ store 100, Jul-Dec @
    // store 200, ~50/50 regardless of leap year, well under the 70% threshold either way.
    const assignmentRows = [
      { person: NAME, role: 'sm_am_dm', target_type: 'store', target: '100', start: `${YEAR}-01-01` },
      { person: NAME, role: 'gm',       target_type: 'store', target: '200', start: `${YEAR}-07-01` },
    ];
    await act(async () => {
      root.render(React.createElement(PerformanceReviewsPanel, {
        stores: [{ loc: '200', name: 'Store 200' }], ds: { loaded: true, assignmentRows },
        settings: {}, onClose: () => {}, userRole: 'admin',
      }));
    });
    await createReview(container, NAME);
    await openReview(container, NAME);
    await goToSummaryTab(container);

    expect(container.textContent).toMatch(/Day-Weighted Split/);
    expect(container.textContent).toMatch(NEEDS_ATTENTION_MARKER);
    expect(container.textContent).toMatch(/Store 100/);
    expect(container.textContent).toMatch(/Store 200/);
  });

  it('a late-year transfer (clear majority, Dec only at the new store) shows the split but NOT the warning', async () => {
    const NAME = 'Attribution Split Majority Case';
    // Jan-Nov @ store 300 (~91% of the year), Dec @ store 400 (~8-9%) -- a real transfer
    // (hasTransitions:true, the section renders) but a clear majority either way, leap year
    // or not, so this is a robust "no warning" fixture.
    const assignmentRows = [
      { person: NAME, role: 'gm', target_type: 'store', target: '300', start: `${YEAR}-01-01` },
      { person: NAME, role: 'gm', target_type: 'store', target: '400', start: `${YEAR}-12-01` },
    ];
    await act(async () => {
      root.render(React.createElement(PerformanceReviewsPanel, {
        stores: [{ loc: '400', name: 'Store 400' }], ds: { loaded: true, assignmentRows },
        settings: {}, onClose: () => {}, userRole: 'admin',
      }));
    });
    await createReview(container, NAME);
    await openReview(container, NAME);
    await goToSummaryTab(container);

    expect(container.textContent).toMatch(/ROLE \/ STORE CHANGE DETECTED/); // hasTransitions still true
    expect(container.textContent).toMatch(/Day-Weighted Split/);
    expect(container.textContent).not.toMatch(NEEDS_ATTENTION_MARKER);
    expect(container.textContent).toMatch(/Store 300/);
    expect(container.textContent).toMatch(/Store 400/);
  });

  it('the flat/common case (no transfer) shows neither the segment section nor the split -- unchanged baseline', async () => {
    const NAME = 'Attribution Split Flat Case';
    await act(async () => {
      root.render(React.createElement(PerformanceReviewsPanel, {
        stores: [{ loc: '3708', name: 'Test Store' }], ds: { loaded: true }, settings: {},
        onClose: () => {}, userRole: 'admin',
      }));
    });
    await createReview(container, NAME);
    await openReview(container, NAME);
    await goToSummaryTab(container);

    expect(container.textContent).not.toMatch(/ROLE \/ STORE CHANGE DETECTED/);
    expect(container.textContent).not.toMatch(/Day-Weighted Split/);
    expect(container.textContent).not.toMatch(NEEDS_ATTENTION_MARKER);
  });
});
