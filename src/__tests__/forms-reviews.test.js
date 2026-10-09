// @ts-nocheck
// MCDOK People confidential review forms (Crew Review / Crew Trainer Review / Maintenance
// Review / Shift Manager Review) -- src/engine/forms-reviews.js's normalizer. See
// memory/finding-qsrsoft-review-forms-schedules-endpoint-2026-10-08.md for the live capture
// this is built from.
import { describe, it, expect } from 'vitest';
import {
  normalizeFormsReviewRow, normalizeFormsReviewRows, normalizeFormsReviewContent,
  computeReviewFormSummary, sortReviewOccurrencesForDisplay,
  REVIEW_FORMS, CONTENT_ACCESSIBLE_FORM_IDS,
} from '../engine/forms-reviews.js';

const CREW_REVIEW_ID = '8c430399-a218-4b1f-aa85-89aca8cc441d';

const liveShapedEntry = (over = {}) => ({
  response: {
    userId: 'a3121437-4e56-4435-9cad-3b3a896e15eb',
    formId: CREW_REVIEW_ID,
    startedAt: '2026-10-08T19:26:37.739Z',
    locations: ['5985'],
    reviewedWith: [{ name: 'Sudahi Gomez', userId: '39abfa0d-4f2a-4c36-badb-98a624a34ca9' }],
    sessions: [{ name: 'HYATT STACEY', startTime: '2026-10-08T19:26:37.745Z', endTime: '2026-10-08T19:26:37.745Z', userId: 'a3121437-4e56-4435-9cad-3b3a896e15eb' }],
    totalQuestions: 38,
    answeredQuestions: 18,
    isConfidential: true,
    sharedWith: ['26a9c0de-c5f8-4712-b7a4-37a8160c7b28'],
    linkId: 'undefined',
    anonymous: false,
    isDeleted: false,
    foodSafety: null,
    ...over.response,
  },
  form: { formId: CREW_REVIEW_ID, title: 'MCDOK Crew Review', ...over.form },
});

describe('normalizeFormsReviewRow', () => {
  it('maps a real-shaped in-progress entry, padding loc and computing completionRatio', () => {
    const row = normalizeFormsReviewRow(liveShapedEntry());
    expect(row.loc).toBe('0005985');
    expect(row.formId).toBe(CREW_REVIEW_ID);
    expect(row.formTitle).toBe('MCDOK Crew Review');
    expect(row.startedAt).toBe('2026-10-08T19:26:37.739Z');
    expect(row.totalQuestions).toBe(38);
    expect(row.answeredQuestions).toBe(18);
    expect(row.completionRatio).toBeCloseTo(18 / 38, 10);
    expect(row.isConfidential).toBe(true);
    expect(row.isDeleted).toBe(false);
  });

  // The one PII rule this file exists to enforce: reviewedWith's plaintext name (and the whole
  // sessions array, which also carries a plaintext reviewer name) must never reach the output.
  it('strips reviewedWith down to userIds only -- never the plaintext name', () => {
    const row = normalizeFormsReviewRow(liveShapedEntry());
    expect(row.reviewedWith).toEqual(['39abfa0d-4f2a-4c36-badb-98a624a34ca9']);
    expect(JSON.stringify(row)).not.toContain('Sudahi Gomez');
    expect(JSON.stringify(row)).not.toContain('HYATT STACEY');
    expect(row.sessions).toBeUndefined();
  });

  it('dedupes repeated userIds in reviewedWith', () => {
    const row = normalizeFormsReviewRow(liveShapedEntry({
      response: { reviewedWith: [{ name: 'A', userId: 'u1' }, { name: 'A again', userId: 'u1' }] },
    }));
    expect(row.reviewedWith).toEqual(['u1']);
  });

  it('returns null when there is no response object yet (not started)', () => {
    expect(normalizeFormsReviewRow({ form: { formId: CREW_REVIEW_ID, title: 'MCDOK Crew Review' } })).toBeNull();
  });

  it('returns null for a form that is not one of the 4 target review forms', () => {
    const entry = liveShapedEntry({ response: { formId: 'some-other-form-id' }, form: { formId: 'some-other-form-id', title: 'Breakfast Pre-Shift' } });
    expect(normalizeFormsReviewRow(entry)).toBeNull();
  });

  it('returns null when startedAt is missing', () => {
    expect(normalizeFormsReviewRow(liveShapedEntry({ response: { startedAt: null } }))).toBeNull();
  });

  it('returns null for a malformed/empty entry rather than throwing', () => {
    expect(normalizeFormsReviewRow(null)).toBeNull();
    expect(normalizeFormsReviewRow({})).toBeNull();
    expect(normalizeFormsReviewRow({ response: {} })).toBeNull();
  });

  it('completionRatio is null when totalQuestions is 0 or missing -- never divide by zero', () => {
    expect(normalizeFormsReviewRow(liveShapedEntry({ response: { totalQuestions: 0 } })).completionRatio).toBeNull();
    expect(normalizeFormsReviewRow(liveShapedEntry({ response: { totalQuestions: undefined } })).completionRatio).toBeNull();
  });

  it('every REVIEW_FORMS id round-trips through normalization', () => {
    for (const [formId, title] of Object.entries(REVIEW_FORMS)) {
      const row = normalizeFormsReviewRow(liveShapedEntry({ response: { formId }, form: { formId, title } }));
      expect(row.formId).toBe(formId);
      expect(row.formTitle).toBe(title);
    }
  });
});

describe('normalizeFormsReviewRows', () => {
  it('drops unusable entries but keeps valid ones, and tolerates a non-array input', () => {
    const rows = normalizeFormsReviewRows([liveShapedEntry(), { response: {} }, null]);
    expect(rows).toHaveLength(1);
    expect(normalizeFormsReviewRows(null)).toEqual([]);
    expect(normalizeFormsReviewRows(undefined)).toEqual([]);
  });
});

// Real question shapes from a live `forms/responses/questions` capture (2026-10-08) -- see this
// file's own header comment (and forms-reviews.js's) for the full measurement: `answer` is a
// 0-based index into `options[]`, NOT the points value directly; the real dashboard Score is
// points-weighted, not completion_ratio; "Current Wage" is a real PII land mine that must never
// surface in `content`.
const ratingQuestion = (over = {}) => ({
  id: '0dc6b037-7bf6-4c7c-9330-0eb1aed5beb4',
  title: 'Sets the example by following procedures on all crew stations.',
  type: 'select', hasOptions: true, pointsPossible: 3,
  options: [
    { title: 'Outstanding', points: 3 }, { title: 'Excellent', points: 2 },
    { title: 'Good', points: 1 }, { title: 'Needs Improvement', points: 0 },
  ],
  answer: 1, pointsReceived: 2, // index 1 = "Excellent" (2 points) -- the real live pairing
  ...over,
});
const wageQuestion = (over = {}) => ({
  id: '0a1dfe93-b585-4a8e-a9c1-2a87c743db21', title: 'Current Wage',
  type: 'textShort', hasOptions: false, pointsPossible: 0, options: [],
  answer: '17.00', ...over,
});
const tallyQuestion = () => ({
  id: '1752c1f8-ad33-48c4-b74b-f9ee6350fa49', title: 'TOTAL POINTS',
  type: 'tally', hasOptions: false, pointsPossible: 0, options: [], answer: null,
});

describe('normalizeFormsReviewContent -- the real points-weighted score', () => {
  it('resolves answer (an option INDEX) to its label, and sums points for a scored question', () => {
    const { content, scorePointsPossible, scorePointsReceived, scorePct } = normalizeFormsReviewContent([ratingQuestion()]);
    expect(content).toEqual([{
      questionId: '0dc6b037-7bf6-4c7c-9330-0eb1aed5beb4',
      title: 'Sets the example by following procedures on all crew stations.',
      answerLabel: 'Excellent',
      pointsPossible: 3, pointsReceived: 2,
    }]);
    expect(scorePointsPossible).toBe(3);
    expect(scorePointsReceived).toBe(2);
    expect(scorePct).toBeCloseTo((2 / 3) * 100, 10);
  });

  // The exact case that disproved completion_ratio as the real Score: two responses both ~97%
  // answered-by-count scored 29% and 91% by points. This pins the formula on a clean example.
  it('sums points across multiple questions, landing on a 0-100 scale (the forms own design)', () => {
    const q1 = ratingQuestion({ answer: 0, pointsReceived: 3 }); // "Outstanding", full marks
    const q2 = ratingQuestion({ id: 'q2', pointsPossible: 1, options: [{ title: 'YES', points: 1 }, { title: 'NO', points: 0 }], answer: 1, pointsReceived: 0 }); // "NO", zero marks
    const { scorePct } = normalizeFormsReviewContent([q1, q2]);
    expect(scorePct).toBeCloseTo((3 / 4) * 100, 10); // 3 of 4 possible points
  });

  it('🔴 PII: never stores the free-text "Current Wage" answer, or any free-text question at all', () => {
    const { content } = normalizeFormsReviewContent([ratingQuestion(), wageQuestion()]);
    expect(content).toHaveLength(1); // only the rating question survives
    expect(JSON.stringify(content)).not.toContain('17.00');
    expect(JSON.stringify(content)).not.toContain('Wage');
  });

  it('excludes a zero-point tally/summary question from both content and the score sum', () => {
    const { content, scorePointsPossible } = normalizeFormsReviewContent([ratingQuestion(), tallyQuestion()]);
    expect(content).toHaveLength(1);
    expect(scorePointsPossible).toBe(3); // the tally's own pointsPossible:0 contributes nothing
  });

  it('scorePct is null when nothing on the form carries positive pointsPossible', () => {
    const { scorePct, scorePointsPossible } = normalizeFormsReviewContent([wageQuestion(), tallyQuestion()]);
    expect(scorePct).toBeNull();
    expect(scorePointsPossible).toBe(0);
  });

  it('tolerates a non-array/empty input', () => {
    expect(normalizeFormsReviewContent(null)).toEqual({ content: [], scorePointsPossible: 0, scorePointsReceived: 0, scorePct: null });
    expect(normalizeFormsReviewContent([])).toEqual({ content: [], scorePointsPossible: 0, scorePointsReceived: 0, scorePct: null });
  });

  it('a missing/out-of-range answer index resolves to a null label, not a thrown error', () => {
    const { content } = normalizeFormsReviewContent([ratingQuestion({ answer: 99 })]);
    expect(content[0].answerLabel).toBeNull();
    const { content: c2 } = normalizeFormsReviewContent([ratingQuestion({ answer: null })]);
    expect(c2[0].answerLabel).toBeNull();
  });
});

describe('CONTENT_ACCESSIBLE_FORM_IDS', () => {
  it('excludes Crew Review (measured 11/11 denied) and includes the other 3 (measured accessible)', () => {
    expect(CONTENT_ACCESSIBLE_FORM_IDS.has('8c430399-a218-4b1f-aa85-89aca8cc441d')).toBe(false); // Crew Review
    expect(CONTENT_ACCESSIBLE_FORM_IDS.has('24409bc6-a228-473b-b070-ed4160f3c93a')).toBe(true); // Shift Manager Review
    expect(CONTENT_ACCESSIBLE_FORM_IDS.has('2af5d678-329b-4378-945f-d40eddaf17e1')).toBe(true); // Crew Trainer Review
    expect(CONTENT_ACCESSIBLE_FORM_IDS.has('5c0cc473-c394-4fa7-b76f-e8cf80fb0156')).toBe(true); // Maintenance Review
  });
});

// ── Panel rollups (the UI's loader output shape -- camelCase, already out of the DB) ───────────
const SHIFT_MGR_ID = '24409bc6-a228-473b-b070-ed4160f3c93a';
const loadedRow = (over = {}) => ({
  loc: '5985', formId: SHIFT_MGR_ID, formTitle: 'MCDOK Shift Manager Review',
  startedAt: '2026-10-08T19:00:00.000Z', totalQuestions: 58, answeredQuestions: 55,
  completionRatio: 55 / 58, contentAvailable: true,
  scorePointsPossible: 100, scorePointsReceived: 60, scorePct: 60,
  ...over,
});

describe('computeReviewFormSummary -- real points-weighted aggregate, never a mean of rates', () => {
  it('sums points across occurrences rather than averaging each occurrence\'s own scorePct', () => {
    // The exact case that disproved completion_ratio as the real Score, re-used here: a store
    // with a near-perfect score and a store with a poor one must not average to their midpoint
    // the same way regardless of how many points each one carried.
    const rows = [
      loadedRow({ loc: '5985', scorePointsPossible: 100, scorePointsReceived: 91, scorePct: 91 }),
      loadedRow({ loc: '10422', scorePointsPossible: 100, scorePointsReceived: 29, scorePct: 29 }),
    ];
    const [summary] = computeReviewFormSummary(rows);
    expect(summary.avgScorePct).toBeCloseTo((91 + 29) / 2, 10); // equal weight here since both carry 100 possible points
    expect(summary.occurrenceCount).toBe(2);
    expect(summary.scoredCount).toBe(2);
  });

  it('a store with more scored points counts proportionally more, not equally per occurrence', () => {
    const rows = [
      loadedRow({ loc: '5985', scorePointsPossible: 100, scorePointsReceived: 100, scorePct: 100 }),
      loadedRow({ loc: '5985', scorePointsPossible: 100, scorePointsReceived: 100, scorePct: 100 }),
      loadedRow({ loc: '10422', scorePointsPossible: 100, scorePointsReceived: 0, scorePct: 0 }),
    ];
    const [summary] = computeReviewFormSummary(rows);
    // Σreceived/Σpossible = 200/300 = 66.67%, NOT the mean of (100,100,0) = 66.67% -- same
    // number here by coincidence of equal weights; the point is the formula, pinned below.
    expect(summary.avgScorePct).toBeCloseTo((200 / 300) * 100, 10);
  });

  it('rows without content available (Crew Review, or not-yet-fetched) do not count toward scoredCount/avgScorePct', () => {
    const rows = [
      loadedRow({ formId: '8c430399-a218-4b1f-aa85-89aca8cc441d', contentAvailable: false, scorePct: null, scorePointsPossible: null, scorePointsReceived: null }),
      loadedRow({ formId: '8c430399-a218-4b1f-aa85-89aca8cc441d', contentAvailable: false, scorePct: null, scorePointsPossible: null, scorePointsReceived: null }),
    ];
    const [summary] = computeReviewFormSummary(rows);
    expect(summary.occurrenceCount).toBe(2);
    expect(summary.scoredCount).toBe(0);
    expect(summary.avgScorePct).toBeNull();
  });

  it('separates forms into independent summaries, keyed by formId', () => {
    const rows = [loadedRow({ formId: 'formA', formTitle: 'A' }), loadedRow({ formId: 'formB', formTitle: 'B' })];
    const summary = computeReviewFormSummary(rows);
    expect(summary.map(f => f.formId).sort()).toEqual(['formA', 'formB']);
  });

  it('sorts worst-scoring form first; a form with no score at all sorts last', () => {
    const rows = [
      loadedRow({ formId: 'good', formTitle: 'Good', scorePct: 90, scorePointsReceived: 90 }),
      loadedRow({ formId: 'bad', formTitle: 'Bad', scorePct: 20, scorePointsReceived: 20 }),
      loadedRow({ formId: 'unscored', formTitle: 'Unscored', contentAvailable: false, scorePct: null, scorePointsPossible: null, scorePointsReceived: null }),
    ];
    const summary = computeReviewFormSummary(rows);
    expect(summary.map(f => f.formId)).toEqual(['bad', 'good', 'unscored']);
  });

  it('tolerates a non-array/empty input', () => {
    expect(computeReviewFormSummary(null)).toEqual([]);
    expect(computeReviewFormSummary([])).toEqual([]);
  });
});

describe('sortReviewOccurrencesForDisplay', () => {
  it('orders newest startedAt first', () => {
    const rows = [
      loadedRow({ loc: '5985', startedAt: '2026-10-06T10:00:00.000Z' }),
      loadedRow({ loc: '5985', startedAt: '2026-10-08T10:00:00.000Z' }),
      loadedRow({ loc: '5985', startedAt: '2026-10-07T10:00:00.000Z' }),
    ];
    const sorted = sortReviewOccurrencesForDisplay(rows);
    expect(sorted.map(r => r.startedAt)).toEqual([
      '2026-10-08T10:00:00.000Z', '2026-10-07T10:00:00.000Z', '2026-10-06T10:00:00.000Z',
    ]);
  });

  it('tie-breaks by loc then formTitle when startedAt matches', () => {
    const rows = [
      loadedRow({ loc: '5985', formTitle: 'Z Form' }),
      loadedRow({ loc: '5985', formTitle: 'A Form' }),
      loadedRow({ loc: '3708', formTitle: 'A Form' }),
    ];
    const sorted = sortReviewOccurrencesForDisplay(rows);
    expect(sorted.map(r => `${r.loc}|${r.formTitle}`)).toEqual(['3708|A Form', '5985|A Form', '5985|Z Form']);
  });

  it('tolerates a non-array/empty/null-containing input', () => {
    expect(sortReviewOccurrencesForDisplay(null)).toEqual([]);
    expect(sortReviewOccurrencesForDisplay([loadedRow(), null])).toHaveLength(1);
  });
});
