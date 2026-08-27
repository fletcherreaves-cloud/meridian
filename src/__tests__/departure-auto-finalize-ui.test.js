// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #162 — Performance Review continuity, build item #6: departure/termination handling.
// The UI half of the fix — renders the REAL PerformanceReviewsPanel -> ReviewEditor ->
// StatusActionBar chain (this project's "verification must touch the call site" standing rule —
// a test that only calls applyDepartureAutoFinalize/canApproveDeparture directly, as
// departure-detection.test.js and permissions.test.js do, would still pass unchanged if the
// panel's own departure-sweep effect or StatusActionBar's gating were reverted, since neither
// would ever render).
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
const GEID = '900001';
const NAME = 'Departed GM Test';

const terminatedTenureRows = [{
  loc: '0003708', geid: GEID, employment_status: 'Active',
  job_title_code: 641, job_title_code_description: 'GENERAL MANAGER',
  hourly_pay_rate: null, termination_entry_date: '2026-06-15',
}];

function seedReview() {
  const review = blankReview(NAME, 'GM', '3708', YEAR, DEFAULT_REVIEW_CONFIG, GEID);
  upsertReview(review);
  return review;
}

describe('dispatch #162 — departure auto-finalize sweep + distinguishable UI status', () => {
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

  it('a departed person\'s open review auto-finalizes on load, rendering a status distinct from a normal Approved review', async () => {
    seedReview();
    await act(async () => {
      root.render(React.createElement(PerformanceReviewsPanel, {
        stores: [{ loc: '3708', name: 'Test Store' }],
        ds: { loaded: true, tenureRows: terminatedTenureRows },
        settings: {}, onClose: () => {}, userRole: 'admin',
      }));
    });
    await openReview(container, NAME);

    // The distinguishable status badge (REVIEW_STATUSES.auto_finalized), never the same label as
    // a normal human Approved.
    expect(container.textContent).toMatch(/Auto-Finalized/);
    expect(container.textContent).not.toMatch(/^Approved$/m);
    // The auto-finalize note itself, surfaced in the status bar (departure reason named).
    expect(container.textContent).toMatch(/Departure detected/);
    expect(container.textContent).toMatch(/termination on record/);
  });

  it('KPI editing is locked while auto_finalized, same as a normally-approved review', async () => {
    seedReview();
    await act(async () => {
      root.render(React.createElement(PerformanceReviewsPanel, {
        stores: [{ loc: '3708', name: 'Test Store' }],
        ds: { loaded: true, tenureRows: terminatedTenureRows },
        settings: {}, onClose: () => {}, userRole: 'admin',
      }));
    });
    await openReview(container, NAME);

    // Note: this codebase's PrimaryBtn (performance-reviews.js) doesn't forward a `disabled` prop
    // to the underlying <button> at all (pre-existing, unrelated to this dispatch — the SAME gap
    // exists for a normally-Approved review) — isReadOnly is only ever signalled via style
    // (opacity/cursor), which is what every other read-only-state assertion in this codebase's own
    // tests also checks. Verifying THAT signal here proves _locked() actually includes
    // 'auto_finalized' (this dispatch's own change), not a claim this button is truly unclickable.
    const saveBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Save');
    expect(saveBtn, 'Save button not found').toBeTruthy();
    expect(saveBtn.style.opacity).toBe('0.45');
    expect(saveBtn.style.cursor).toBe('not-allowed');
  });

  it('an UNQUALIFIED viewer (a peer GM — 0 levels above) sees the status but NOT Approve/Reopen', async () => {
    seedReview();
    await act(async () => {
      root.render(React.createElement(PerformanceReviewsPanel, {
        stores: [{ loc: '3708', name: 'Test Store' }],
        ds: { loaded: true, tenureRows: terminatedTenureRows },
        settings: {}, onClose: () => {}, userRole: 'gm',
      }));
    });
    await openReview(container, NAME);

    expect(container.textContent).toMatch(/Auto-Finalized/);
    expect([...container.querySelectorAll('button')].some(b => b.textContent === 'Approve as Final')).toBe(false);
    expect([...container.querySelectorAll('button')].some(b => b.textContent === 'Reopen')).toBe(false);
  });

  it('a QUALIFIED reviewer (area_supervisor — the GM\'s own direct reviewer, 1 level above) sees Approve as Final / Reopen', async () => {
    seedReview();
    await act(async () => {
      root.render(React.createElement(PerformanceReviewsPanel, {
        stores: [{ loc: '3708', name: 'Test Store' }],
        ds: { loaded: true, tenureRows: terminatedTenureRows },
        settings: {}, onClose: () => {}, userRole: 'area_supervisor',
      }));
    });
    await openReview(container, NAME);

    expect([...container.querySelectorAll('button')].some(b => b.textContent === 'Approve as Final')).toBe(true);
    expect([...container.querySelectorAll('button')].some(b => b.textContent === 'Reopen')).toBe(true);
  });

  it('ADMIN always sees Approve as Final / Reopen regardless of ladder distance (the unconditional escape hatch)', async () => {
    seedReview();
    await act(async () => {
      root.render(React.createElement(PerformanceReviewsPanel, {
        stores: [{ loc: '3708', name: 'Test Store' }],
        ds: { loaded: true, tenureRows: terminatedTenureRows },
        settings: {}, onClose: () => {}, userRole: 'admin',
      }));
    });
    await openReview(container, NAME);

    expect([...container.querySelectorAll('button')].some(b => b.textContent === 'Approve as Final')).toBe(true);
    expect([...container.querySelectorAll('button')].some(b => b.textContent === 'Reopen')).toBe(true);
  });

  it('clicking "Approve as Final" as a qualified reviewer transitions to Approved and clears the action buttons', async () => {
    seedReview();
    await act(async () => {
      root.render(React.createElement(PerformanceReviewsPanel, {
        stores: [{ loc: '3708', name: 'Test Store' }],
        ds: { loaded: true, tenureRows: terminatedTenureRows },
        settings: {}, onClose: () => {}, userRole: 'area_supervisor',
      }));
    });
    await openReview(container, NAME);

    // Narrow to H1 only — the default 'year' period renders BOTH halves' StatusActionBar (both
    // auto_finalized here, since the review started fully in draft/draft), so an unscoped
    // 'Approve as Final' query would still find H2's own button after approving H1's.
    const periodSel = container.querySelector('select');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
      setter.call(periodSel, 'h1');
      periodSel.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const approveBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Approve as Final');
    expect(approveBtn).toBeTruthy();
    await act(async () => { approveBtn.click(); });

    // The auto_finalize-specific action ('Approve as Final') is gone — status is no longer
    // 'auto_finalized'. A plain 'Reopen' MAY still render (the pre-existing, unrelated Approved-
    // status reopen affordance, gated by the ordinary reviews.approve permission area_supervisor
    // already holds) — that's expected, not this dispatch's concern.
    expect([...container.querySelectorAll('button')].some(b => b.textContent === 'Approve as Final')).toBe(false);
    // StatusBadge now reads the plain Approved label (REVIEW_STATUSES.approved), not Auto-Finalized —
    // status genuinely transitioned, not just visually hidden.
    expect(container.textContent).toMatch(/Approved/);
    expect(container.textContent).not.toMatch(/Auto-Finalized/);
  });

  it('a review with NO departure signal (active, still-classifiable tenure row) never auto-finalizes — stays Draft', async () => {
    const review = blankReview('Still Employed GM', 'GM', '3708', YEAR, DEFAULT_REVIEW_CONFIG, '900002');
    upsertReview(review);
    const activeTenureRows = [{
      loc: '0003708', geid: '900002', employment_status: 'Active',
      job_title_code: 641, job_title_code_description: 'GENERAL MANAGER',
      hourly_pay_rate: null, termination_entry_date: null,
    }];
    await act(async () => {
      root.render(React.createElement(PerformanceReviewsPanel, {
        stores: [{ loc: '3708', name: 'Test Store' }],
        ds: { loaded: true, tenureRows: activeTenureRows },
        settings: {}, onClose: () => {}, userRole: 'admin',
      }));
    });
    await openReview(container, 'Still Employed GM');

    expect(container.textContent).not.toMatch(/Auto-Finalized/);
    expect(container.textContent).toMatch(/Draft/);
  });
});
