// @vitest-environment happy-dom
// @ts-nocheck
// Performance Reviews Phase 2 punch list: "YoY trend view" -- the one still-genuinely-open item
// from the 2026-09-10 re-measurement (Dev Plan tab, wage-section wiring, tag/search-by-score
// were all already shipped). A review record has NO stable identity for the reviewed person --
// review.geid is the ATTRIBUTING MANAGER's id (Notes 33 A#3), only set for shift-attributable
// roles, never the reviewed person's own -- so name (case/whitespace-normalized) is the only
// signal yearlyTrendFor (review-engine.js) can match on across years.
//
// Renders the REAL PerformanceReviewsPanel -> ReviewList chain (this repo's "verification must
// touch the call site" standing rule, same precedent as dispatch-review-list-search-score-filter
// .test.js), not yearlyTrendFor in isolation -- a revert of either the engine function or its
// ReviewList wiring must fail these.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { PerformanceReviewsPanel } = await import('../views/performance-reviews.js');
const { blankReview, upsertReview, DEFAULT_REVIEW_CONFIG, yearlyTrendFor } = await import('../engine/review-engine.js');

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

// Same favorable-scoring helper as dispatch-review-list-search-score-filter.test.js — every
// scored KPI metric 4/4 every month, every behavioral item 4/4 every quarter, so overall lands
// at exactly 4.0 regardless of category weights.
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

describe('yearlyTrendFor (engine, review-engine.js)', () => {
  it('matches by name across years (case/whitespace-insensitive), sorted ascending', () => {
    const r1 = scoreReviewFavorably(blankReview('Carol Trend Test GM', 'GM', '3708', YEAR - 1, DEFAULT_REVIEW_CONFIG), DEFAULT_REVIEW_CONFIG);
    const r2 = scoreReviewFavorably(blankReview('  carol trend test gm  ', 'GM', '3708', YEAR, DEFAULT_REVIEW_CONFIG), DEFAULT_REVIEW_CONFIG);
    const reviews = { [r1.id]: r1, [r2.id]: r2 };
    const trend = yearlyTrendFor(reviews, DEFAULT_REVIEW_CONFIG, 'Carol Trend Test GM');
    expect(trend).toEqual([{ year: YEAR - 1, overall: 4 }, { year: YEAR, overall: 4 }]);
  });

  it('excludes a different person entirely', () => {
    const r1 = scoreReviewFavorably(blankReview('Carol Trend Test GM', 'GM', '3708', YEAR, DEFAULT_REVIEW_CONFIG), DEFAULT_REVIEW_CONFIG);
    const other = scoreReviewFavorably(blankReview('Someone Else GM', 'GM', '3708', YEAR, DEFAULT_REVIEW_CONFIG), DEFAULT_REVIEW_CONFIG);
    const reviews = { [r1.id]: r1, [other.id]: other };
    expect(yearlyTrendFor(reviews, DEFAULT_REVIEW_CONFIG, 'Carol Trend Test GM')).toEqual([{ year: YEAR, overall: 4 }]);
  });

  it('is safe on junk input', () => {
    expect(yearlyTrendFor({}, DEFAULT_REVIEW_CONFIG, 'Nobody')).toEqual([]);
    expect(yearlyTrendFor(null, DEFAULT_REVIEW_CONFIG, 'Nobody')).toEqual([]);
    expect(yearlyTrendFor({ a: blankReview('X', 'GM', '3708', YEAR, DEFAULT_REVIEW_CONFIG) }, DEFAULT_REVIEW_CONFIG, '')).toEqual([]);
  });
});

describe('ReviewList YoY trend strip (Performance Reviews Phase 2 punch list)', () => {
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
  const searchFor = async (text) => {
    const searchInput = container.querySelector('input[placeholder="Search by name…"]');
    expect(searchInput, 'search input not found').toBeTruthy();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(searchInput, text);
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };

  it('shows the trend strip with both years once the search isolates a person scored in 2 years', async () => {
    const r1 = scoreReviewFavorably(blankReview('Carol Trend Test GM', 'GM', '3708', YEAR - 1, DEFAULT_REVIEW_CONFIG), DEFAULT_REVIEW_CONFIG);
    const r2 = scoreReviewFavorably(blankReview('Carol Trend Test GM', 'GM', '3708', YEAR, DEFAULT_REVIEW_CONFIG), DEFAULT_REVIEW_CONFIG);
    upsertReview(r1); upsertReview(r2);
    await renderPanel();
    await searchFor('Carol Trend');
    expect(container.textContent).toMatch(/Carol Trend Test GM — year over year/i);
    expect(container.textContent).toContain(String(YEAR - 1));
    expect(container.textContent).toContain(String(YEAR));
  });

  it('does NOT show a trend strip for a person with only one scored year', async () => {
    const r1 = scoreReviewFavorably(blankReview('Dana OneYear Test GM', 'GM', '3708', YEAR, DEFAULT_REVIEW_CONFIG), DEFAULT_REVIEW_CONFIG);
    upsertReview(r1);
    await renderPanel();
    await searchFor('Dana OneYear');
    expect(container.textContent).not.toMatch(/year over year/i);
  });

  it('does NOT show a trend strip when the search matches more than one distinct person', async () => {
    const r1 = scoreReviewFavorably(blankReview('Erin Multi Test GM', 'GM', '3708', YEAR - 1, DEFAULT_REVIEW_CONFIG), DEFAULT_REVIEW_CONFIG);
    const r2 = scoreReviewFavorably(blankReview('Erin Multi Test AS', 'AS', '3708', YEAR, DEFAULT_REVIEW_CONFIG), DEFAULT_REVIEW_CONFIG);
    upsertReview(r1); upsertReview(r2);
    await renderPanel();
    await searchFor('Erin Multi');
    expect(container.textContent).not.toMatch(/year over year/i);
  });

  it('does NOT show a trend strip with no active search, even if a person has 2 scored years', async () => {
    const r1 = scoreReviewFavorably(blankReview('Frank Notrend Test GM', 'GM', '3708', YEAR - 1, DEFAULT_REVIEW_CONFIG), DEFAULT_REVIEW_CONFIG);
    const r2 = scoreReviewFavorably(blankReview('Frank Notrend Test GM', 'GM', '3708', YEAR, DEFAULT_REVIEW_CONFIG), DEFAULT_REVIEW_CONFIG);
    upsertReview(r1); upsertReview(r2);
    await renderPanel();
    expect(container.textContent).not.toMatch(/year over year/i);
  });
});
