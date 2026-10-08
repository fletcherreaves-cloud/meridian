// @ts-nocheck
// MCDOK People confidential review forms (Crew Review / Crew Trainer Review / Maintenance
// Review / Shift Manager Review) -- src/engine/forms-reviews.js's normalizer. See
// memory/finding-qsrsoft-review-forms-schedules-endpoint-2026-10-08.md for the live capture
// this is built from.
import { describe, it, expect } from 'vitest';
import { normalizeFormsReviewRow, normalizeFormsReviewRows, REVIEW_FORMS } from '../engine/forms-reviews.js';

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
