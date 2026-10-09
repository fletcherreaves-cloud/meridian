// @vitest-environment happy-dom
// @ts-nocheck
// Render-based tests for FormsReviewsPanel, matching this repo's own standing rule ("would this
// verification still pass if the change were reverted?") -- a test that only imports
// computeReviewFormSummary/sortReviewOccurrencesForDisplay can't tell "built" from "built but
// never wired into the panel." Mocks src/lib/supabase.js's loadQsrFormsReviews the same way
// forms-panel.test.js mocks its own loader.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

const loadQsrFormsReviewsMock = vi.fn();

vi.mock('../lib/supabase.js', () => ({
  loadQsrFormsReviews: (...args) => loadQsrFormsReviewsMock(...args),
}));

import { FormsReviewsPanel } from '../views/forms-reviews-panel.js';

const SHIFT_MGR_ID = '24409bc6-a228-473b-b070-ed4160f3c93a'; // CONTENT_ACCESSIBLE_FORM_IDS member
const CREW_REVIEW_ID = '8c430399-a218-4b1f-aa85-89aca8cc441d'; // deliberately excluded, measured denied

function row(over = {}) {
  return {
    loc: '0005985', formId: SHIFT_MGR_ID, formTitle: 'MCDOK Shift Manager Review',
    startedAt: '2026-10-08T19:00:00.000Z', totalQuestions: 58, answeredQuestions: 55,
    completionRatio: 55 / 58, reviewerUserId: null, reviewedWith: [], isConfidential: true,
    sharedWith: [], isDeleted: false,
    scorePointsPossible: 100, scorePointsReceived: 60, scorePct: 60,
    content: [{ questionId: 'q1', title: 'Follows procedures', answerLabel: 'Excellent', pointsPossible: 3, pointsReceived: 2 }],
    contentAvailable: true,
    ...over,
  };
}

async function flush(container, maxTicks = 15) {
  let last;
  for (let i = 0; i < maxTicks; i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
    if (container.textContent === last) return;
    last = container.textContent;
  }
}

describe('FormsReviewsPanel — renders the real panel, not just the engine it calls', () => {
  let container, root;
  beforeEach(() => {
    loadQsrFormsReviewsMock.mockReset();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
  });

  it('empty result set renders an honest "no reviews synced" state, not a fake table', async () => {
    loadQsrFormsReviewsMock.mockResolvedValue([]);
    await act(async () => { root.render(React.createElement(FormsReviewsPanel, { onClose: vi.fn() })); });
    await flush(container);
    expect(container.textContent).toMatch(/No reviews synced/i);
  });

  it('a load failure renders an error state, not a silent empty table', async () => {
    loadQsrFormsReviewsMock.mockRejectedValue(new Error('network down'));
    await act(async () => { root.render(React.createElement(FormsReviewsPanel, { onClose: vi.fn() })); });
    await flush(container);
    expect(container.textContent).toMatch(/could not load/i);
  });

  it('renders the real points-weighted score (not completion %) through the summary chain', async () => {
    loadQsrFormsReviewsMock.mockResolvedValue([
      row({ scorePct: 91, scorePointsReceived: 91 }),
      row({ scorePct: 29, scorePointsReceived: 29, loc: '0010422' }),
    ]);
    await act(async () => { root.render(React.createElement(FormsReviewsPanel, { onClose: vi.fn() })); });
    await flush(container);
    expect(container.textContent).toMatch(/MCDOK Shift Manager Review/);
    expect(container.textContent).toMatch(/60\.0%/); // (91+29)/2 = 60.0, Σreceived/Σpossible
    expect(container.textContent).not.toMatch(/97\.4%|94\.8%/); // the completion-ratio numbers this is NOT
  });

  it('worst-scoring form renders first', async () => {
    loadQsrFormsReviewsMock.mockResolvedValue([
      row({ formId: 'formGood', formTitle: 'Good Form', scorePct: 90, scorePointsReceived: 90 }),
      row({ formId: 'formBad', formTitle: 'Bad Form', scorePct: 20, scorePointsReceived: 20 }),
    ]);
    await act(async () => { root.render(React.createElement(FormsReviewsPanel, { onClose: vi.fn() })); });
    await flush(container);
    const titleEls = [...container.querySelectorAll('span')].filter(s => s.textContent === 'Good Form' || s.textContent === 'Bad Form');
    const order = titleEls.map(e => e.textContent);
    expect(order.indexOf('Bad Form')).toBeLessThan(order.indexOf('Good Form'));
  });

  it('Crew Review shows "Confidential — not viewable" instead of a score bar, and never a fake percentage', async () => {
    loadQsrFormsReviewsMock.mockResolvedValue([
      row({ formId: CREW_REVIEW_ID, formTitle: 'MCDOK Crew Review', contentAvailable: false, scorePct: null, scorePointsPossible: null, scorePointsReceived: null, content: [] }),
    ]);
    await act(async () => { root.render(React.createElement(FormsReviewsPanel, { onClose: vi.fn() })); });
    await flush(container);
    expect(container.textContent).toMatch(/Confidential/i);
    expect(container.textContent).not.toMatch(/NaN%/);
  });

  it('expanding a form shows its occurrence list (store/date/answered/score)', async () => {
    loadQsrFormsReviewsMock.mockResolvedValue([row()]);
    await act(async () => { root.render(React.createElement(FormsReviewsPanel, { onClose: vi.fn() })); });
    await flush(container);
    const toggle = [...container.querySelectorAll('button')].find(b => /Occurrences/.test(b.textContent));
    expect(toggle).toBeTruthy();
    await act(async () => { toggle.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush(container);
    expect(container.textContent).toMatch(/55\/58/); // answered/total
    expect(container.textContent).toMatch(/60\.0%/); // this occurrence's own score
  });

  it('clicking an occurrence reveals its real content (question + resolved answer label + points)', async () => {
    loadQsrFormsReviewsMock.mockResolvedValue([row()]);
    await act(async () => { root.render(React.createElement(FormsReviewsPanel, { onClose: vi.fn() })); });
    await flush(container);
    const formToggle = [...container.querySelectorAll('button')].find(b => /Occurrences/.test(b.textContent));
    await act(async () => { formToggle.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush(container);
    const occRow = [...container.querySelectorAll('tbody tr')][0];
    expect(container.textContent).not.toMatch(/Follows procedures/); // content hidden until clicked
    await act(async () => { occRow.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush(container);
    expect(container.textContent).toMatch(/Follows procedures/);
    expect(container.textContent).toMatch(/Excellent/);
    expect(container.textContent).toMatch(/2\/3/); // pointsReceived/pointsPossible
  });

  it('a Crew Review occurrence\'s content drill-down explains the confidentiality restriction, never a blank/broken state', async () => {
    loadQsrFormsReviewsMock.mockResolvedValue([
      row({ formId: CREW_REVIEW_ID, formTitle: 'MCDOK Crew Review', contentAvailable: false, scorePct: null, scorePointsPossible: null, scorePointsReceived: null, content: [] }),
    ]);
    await act(async () => { root.render(React.createElement(FormsReviewsPanel, { onClose: vi.fn() })); });
    await flush(container);
    const formToggle = [...container.querySelectorAll('button')].find(b => /Occurrences/.test(b.textContent));
    await act(async () => { formToggle.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush(container);
    const occRow = [...container.querySelectorAll('tbody tr')][0];
    await act(async () => { occRow.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush(container);
    expect(container.textContent).toMatch(/not viewable by this account/i);
  });

  it('changing the window pill re-fetches with a new date range', async () => {
    loadQsrFormsReviewsMock.mockResolvedValue([]);
    await act(async () => { root.render(React.createElement(FormsReviewsPanel, { onClose: vi.fn() })); });
    await flush(container);
    expect(loadQsrFormsReviewsMock).toHaveBeenCalledTimes(1);
    const btn90 = [...container.querySelectorAll('button')].find(b => b.textContent === '90d');
    await act(async () => { btn90.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush(container);
    expect(loadQsrFormsReviewsMock).toHaveBeenCalledTimes(2);
  });
});

const STORE_A = '6178'; // FL, per constants.js INV_ORG_COORDS/STORE_NAMES -- same fixture forms-panel.test.js uses
const STORE_B = '3708'; // OK
const STORES_PROP = [{ loc: STORE_A }, { loc: STORE_B }];

describe('FormsReviewsPanel — location scope', () => {
  let container, root;
  beforeEach(() => {
    loadQsrFormsReviewsMock.mockReset();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
  });

  it('selecting a store in the location selector re-fetches with that store as the locs filter', async () => {
    loadQsrFormsReviewsMock.mockResolvedValue([]);
    await act(async () => { root.render(React.createElement(FormsReviewsPanel, { onClose: vi.fn(), stores: STORES_PROP })); });
    await flush(container);
    expect(loadQsrFormsReviewsMock).toHaveBeenCalledTimes(1);
    expect(loadQsrFormsReviewsMock.mock.calls[0][0].locs).toEqual([STORE_B, STORE_A]);

    const storeBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes(STORE_B));
    expect(storeBtn).toBeTruthy();
    await act(async () => { storeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush(container);
    expect(loadQsrFormsReviewsMock).toHaveBeenCalledTimes(2);
    expect(loadQsrFormsReviewsMock.mock.calls[1][0].locs).toEqual([STORE_B]);
  });
});
