// @vitest-environment happy-dom
// @ts-nocheck
// Mass-review notes 70 (2026-10-13) — "Auto-Fill from Uploaded Data... is not populating the
// 2nd half of the year (to date)." Root cause, live-measured: App.js bootstraps
// qsrActSummaryRows/glimpseRows/opsServiceRows with a fixed ~60-day trailing window from "today",
// never refreshed for an older period — the same bug class
// memory/finding-pace-to-target-window-gap-2026-10-06.md already found and fixed for
// CurrentMonthPaceSection (analytics.js). A review spans the whole YEAR (dispatch #152) and
// autoPopulateKPIs always fills all 12 months, so any month more than ~2 months in the past
// silently read nothing.
//
// This test renders the REAL PerformanceReviewsPanel -> ReviewEditor chain (this project's
// "verification must touch the call site" standing rule) with a `ds` whose auto-pulled rows only
// reach back to October — nowhere near April — and asserts that clicking the real Auto-fill
// button still populates April's sales actual. A test that only called autoPopulateKPIs(review,
// ds) directly would pass unchanged if doAutoFill's widening fetch were reverted to the old
// `autoPopulateKPIs(review, ds)` one-liner, since the bug is entirely in what `ds` the UI call
// site passes in, not in autoPopulateKPIs itself.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const LOC = '5985';
const YEAR = new Date().getFullYear(); // NewReviewForm's own default (performance-reviews.js)
const APRIL_SALES_ROW_1 = 54321.0;
const APRIL_SALES_ROW_2 = 11111.0;

vi.mock('../lib/supabase.js', async (importOriginal) => {
  const actual = await importOriginal();
  // Simulates the real auto-pulled streams having a full year of history in Supabase — the
  // widen-fetch's whole point is that this data was always there, just never re-fetched for an
  // out-of-window month.
  const wideActSummary = async () => ([
    { loc: LOC, date: new Date(`${YEAR}-04-05T12:00:00`), sales: APRIL_SALES_ROW_1, gc: 1000 },
    { loc: LOC, date: new Date(`${YEAR}-04-20T12:00:00`), sales: APRIL_SALES_ROW_2, gc: 900 },
  ]);
  return {
    ...actual,
    loadQsrActSummary: async (daysBack) => wideActSummary(daysBack),
    loadGlimpse: async () => ([]),
    loadOpsServiceStats: async () => ([]),
  };
});

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

describe('Performance Reviews Auto-Fill widens a stale ds window instead of reading nothing (mass-review notes 70)', () => {
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

  it('a review whose ds only covers the last ~2 weeks still gets April\'s sales filled via the widened fetch', async () => {
    await act(async () => {
      root.render(React.createElement(PerformanceReviewsPanel, {
        stores: [{ loc: LOC, name: 'Test Store' }],
        // Deliberately narrow — the exact live bug shape: qsrActSummaryRows only reaches back
        // ~2 weeks from "today", nowhere near April.
        ds: {
          loaded: true, opsRows: [],
          qsrActSummaryRows: [
            { loc: LOC, date: new Date(Date.now() - 10 * 86400000), sales: 999, gc: 100 },
          ],
          glimpseRows: [], opsServiceRows: [],
        },
        settings: {}, onClose: () => {}, userRole: 'admin',
        dataReady: true,
      }));
    });
    await createReview(container, 'Window Widen Test');
    await openReview(container, 'Window Widen Test');

    const autoFillBtn = [...container.querySelectorAll('button')]
      .find(b => b.textContent === 'Auto-fill from Uploaded Data');
    expect(autoFillBtn, 'Auto-fill button not found').toBeTruthy();
    expect(autoFillBtn.disabled).toBe(false);

    await act(async () => {
      autoFillBtn.click();
      // Flush the mocked loaders' promise chain + the resulting setReview — the mocks resolve
      // near-instantly, but still asynchronously (real microtask/macrotask turns).
      await new Promise(r => setTimeout(r, 50));
    });

    const saveBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Save');
    expect(saveBtn, 'Save button not found').toBeTruthy();
    await act(async () => { saveBtn.click(); });

    const reviews = getReviews();
    const saved = Object.values(reviews).find(r => r.name === 'Window Widen Test');
    expect(saved, 'saved review not found in getReviews()').toBeTruthy();
    const april = saved.kpis.months[4];
    expect(april, 'April (month 4) missing from kpis.months').toBeTruthy();
    // This is the actual regression assertion: April's auto-filled sales total must reflect the
    // WIDENED fetch's rows (54321 + 11111 = 65432), not the narrow ds's October-only window
    // (which has no April data at all and would leave mo.salesVsTgt unset).
    expect(april.salesVsTgt).toBeCloseTo(APRIL_SALES_ROW_1 + APRIL_SALES_ROW_2, 2);
  });

  it('a review whose ds already covers the full year does NOT trigger a widen fetch (no needless network cost)', async () => {
    const fullYearRows = [];
    // Includes a Dec 31 of the PRIOR year row so the oldest row is unambiguously before
    // yearStart (Jan 1 midnight) regardless of time-of-day — a same-day-but-later-hour row
    // would still (correctly) read as "doesn't reach back far enough" and trigger a widen fetch.
    fullYearRows.push({ loc: LOC, date: new Date(`${YEAR-1}-12-31T12:00:00`), sales: 500, gc: 50 });
    for (let m = 1; m <= 12; m++) {
      fullYearRows.push({ loc: LOC, date: new Date(`${YEAR}-${String(m).padStart(2,'0')}-10T12:00:00`), sales: 7777, gc: 500 });
    }
    await act(async () => {
      root.render(React.createElement(PerformanceReviewsPanel, {
        stores: [{ loc: LOC, name: 'Test Store' }],
        ds: { loaded: true, opsRows: [], qsrActSummaryRows: fullYearRows, glimpseRows: [], opsServiceRows: [] },
        settings: {}, onClose: () => {}, userRole: 'admin',
        dataReady: true,
      }));
    });
    await createReview(container, 'Already Covered Test');
    await openReview(container, 'Already Covered Test');

    const autoFillBtn = [...container.querySelectorAll('button')]
      .find(b => b.textContent === 'Auto-fill from Uploaded Data');
    await act(async () => { autoFillBtn.click(); await new Promise(r => setTimeout(r, 50)); });

    const saveBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Save');
    await act(async () => { saveBtn.click(); });

    const reviews = getReviews();
    const saved = Object.values(reviews).find(r => r.name === 'Already Covered Test');
    // The already-wide ds's own April row (7777) must win — the mocked widen-fetch's 65432
    // total must NOT appear, proving needsWiden correctly skipped the fetch when ds already
    // reaches back far enough.
    expect(saved.kpis.months[4].salesVsTgt).toBeCloseTo(7777, 2);
  });
});
