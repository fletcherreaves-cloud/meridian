// @vitest-environment happy-dom
// @ts-nocheck
// Performance Reviews Phase 2 punch list: "tag/search by score" -- ReviewList (performance-
// reviews.js) had role/year/status filters but no way to search by name or filter by score.
// Renders the REAL PerformanceReviewsPanel -> ReviewList chain (this repo's "verification must
// touch the call site" standing rule), not the filter predicate in isolation.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { PerformanceReviewsPanel, overallLabel } = await import('../views/performance-reviews.js');
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

const YEAR = new Date().getFullYear();

// Every scored KPI metric rated favorably (4/4) every month, every behavioral competency item
// rated 4/4 every quarter -- both legs computeScores' overall combine (metrics*mw + behav*bw)
// needs non-null, so overall lands at exactly 4.0 (comfortably in the "Exceeds Expectations",
// score>=3.5, band) regardless of category weights.
function scoreReviewFavorably(review, cfg) {
  for (const mets of Object.values(cfg.metrics)) {
    for (const m of mets) {
      if (!m.scored) continue;
      const favorable = m.better === 'higher' ? 10000 : -10000;
      for (const mo of Object.values(review.kpis.months)) {
        mo[m.key + 'Tgt'] = 10;
        mo[m.key] = favorable;
      }
    }
  }
  for (const q of ['q1', 'q2', 'q3', 'q4']) {
    for (const cat of Object.keys(review.behavioralRatings[q])) {
      review.behavioralRatings[q][cat] = review.behavioralRatings[q][cat].map(() => 4);
    }
  }
  return review;
}

function seedReviews() {
  const unscored = blankReview('Alice Filter Test GM', 'GM', '3708', YEAR, DEFAULT_REVIEW_CONFIG);
  const scored = scoreReviewFavorably(
    blankReview('Bob Filter Test GM', 'GM', '3708', YEAR, DEFAULT_REVIEW_CONFIG),
    DEFAULT_REVIEW_CONFIG,
  );
  upsertReview(unscored);
  upsertReview(scored);
}

describe('ReviewList search + score-band filter (Performance Reviews Phase 2, "tag/search by score")', () => {
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

  const renderPanel = async () => {
    await act(async () => {
      root.render(React.createElement(PerformanceReviewsPanel, {
        stores: [{ loc: '3708', name: 'Test Store' }],
        ds: { loaded: true }, settings: {}, onClose: () => {}, userRole: 'admin',
      }));
    });
  };
  const rowNames = () => [...container.querySelectorAll('span')]
    .filter(s => s.textContent === 'Alice Filter Test GM' || s.textContent === 'Bob Filter Test GM')
    .map(s => s.textContent);

  it('both seeded reviews show with no filters active', async () => {
    seedReviews();
    await renderPanel();
    const names = rowNames();
    expect(names).toContain('Alice Filter Test GM');
    expect(names).toContain('Bob Filter Test GM');
  });

  it('searching by name shows only the matching review', async () => {
    seedReviews();
    await renderPanel();
    const searchInput = container.querySelector('input[placeholder="Search by name…"]');
    expect(searchInput, 'search input not found').toBeTruthy();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(searchInput, 'Alice');
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const names = rowNames();
    expect(names).toContain('Alice Filter Test GM');
    expect(names).not.toContain('Bob Filter Test GM');
  });

  it('search is case-insensitive and matches a substring', async () => {
    seedReviews();
    await renderPanel();
    const searchInput = container.querySelector('input[placeholder="Search by name…"]');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(searchInput, 'bob filter');
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(rowNames()).toEqual(['Bob Filter Test GM']);
  });

  it('the score-band filter isolates the scored review (overallLabel(4) band) from the unscored one', async () => {
    seedReviews();
    await renderPanel();
    const selects = [...container.querySelectorAll('select')];
    const scoreSelect = selects.find(s => [...s.options].some(o => o.textContent === overallLabel(4)));
    expect(scoreSelect, 'score-band select not found').toBeTruthy();
    await act(async () => {
      const opt = [...scoreSelect.options].find(o => o.textContent === overallLabel(4));
      scoreSelect.value = opt.value;
      scoreSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(rowNames()).toEqual(['Bob Filter Test GM']);
  });

  it('"Not Yet Scored" isolates the unscored review from the scored one', async () => {
    seedReviews();
    await renderPanel();
    const selects = [...container.querySelectorAll('select')];
    const scoreSelect = selects.find(s => [...s.options].some(o => o.textContent === 'Not Yet Scored'));
    await act(async () => {
      const opt = [...scoreSelect.options].find(o => o.textContent === 'Not Yet Scored');
      scoreSelect.value = opt.value;
      scoreSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(rowNames()).toEqual(['Alice Filter Test GM']);
  });

  it('a search matching nothing shows "No reviews match these filters", not the misleading "No reviews yet" copy', async () => {
    seedReviews();
    await renderPanel();
    const searchInput = container.querySelector('input[placeholder="Search by name…"]');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(searchInput, 'Zzz Nobody Matches This');
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(container.textContent).toMatch(/No reviews match these filters/);
    expect(container.textContent).not.toMatch(/No reviews yet/);
  });
});
