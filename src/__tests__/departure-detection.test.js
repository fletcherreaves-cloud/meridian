// @ts-nocheck
// Dispatch #162 — Performance Review continuity, build item #6: departure/termination handling.
// Plan doc resolved item B (memory/plan-performance-review-continuity-2026-08-26.md), owner's own
// words: "Do the auto finalize but require approval in the ability to override it. The approval
// and potential override should come from a job title code qualified to perform the review or
// above." Covers src/engine/departure.js: detectDeparture, applyDepartureAutoFinalize (calls the
// REAL transitionReview, not a second writer of review.periods — verified by reading the review
// back through getReviews(), the same call-through-the-real-consumer standard this project's own
// "would this verification still pass if the change were reverted?" rule requires), and
// isDepartureHandled (the new-manager-panel auto-clear signal).
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { blankReview, getReviews, DEFAULT_REVIEW_CONFIG } from '../engine/review-engine.js';
import {
  detectDeparture, applyDepartureAutoFinalize, isDepartureHandled, isAutoFinalizeNote,
  findTenureRow, DEPARTURE_REASON,
} from '../engine/departure.js';

function installLS() {
  const store = {};
  globalThis.localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    clear: () => { for (const k in store) delete store[k]; },
  };
}

// A synthetic qsr_employee_tenure-shaped row (real DB column names — supabase/schema-qsr-
// employee-tenure.sql), all fields present unless overridden — same fixture discipline
// backfill-staff-assignments-2026.test.js already uses (100% synthetic geid/name/pay rate).
function tenureRow(overrides = {}) {
  return {
    loc: '0003708',
    geid: '900001',
    employment_status: 'Active',
    job_title_code: 641, // GM
    job_title_code_description: 'GENERAL MANAGER',
    hourly_pay_rate: null,
    termination_entry_date: null,
    ...overrides,
  };
}

describe('detectDeparture', () => {
  it('COMMON CASE: no matching tenure row at all — cheap, correct, not departed', () => {
    const review = blankReview('Jane GM', 'GM', '3708', 2026, DEFAULT_REVIEW_CONFIG, '900001');
    expect(detectDeparture(review, [])).toEqual({ departed: false, reason: null, tenureRow: null });
    expect(detectDeparture(review, [tenureRow({ geid: '999999' })])).toEqual({ departed: false, reason: null, tenureRow: null });
  });

  it('COMMON CASE: a matching, active, still-classifiable tenure row — not departed', () => {
    const review = blankReview('Jane GM', 'GM', '3708', 2026, DEFAULT_REVIEW_CONFIG, '900001');
    const result = detectDeparture(review, [tenureRow()]);
    expect(result.departed).toBe(false);
    expect(result.reason).toBeNull();
  });

  it('a review with no `person` set (Phase 4b person-picker gap) never matches — not departed', () => {
    const review = blankReview('Jane GM', 'GM', '3708', 2026, DEFAULT_REVIEW_CONFIG); // no person arg
    expect(review.person).toBeNull();
    expect(detectDeparture(review, [tenureRow()]).departed).toBe(false);
  });

  it('TERMINATED: termination_entry_date set on the matching row', () => {
    const review = blankReview('Jane GM', 'GM', '3708', 2026, DEFAULT_REVIEW_CONFIG, '900001');
    const result = detectDeparture(review, [tenureRow({ termination_entry_date: '2026-06-15' })]);
    expect(result.departed).toBe(true);
    expect(result.reason).toBe(DEPARTURE_REASON.TERMINATED);
    expect(result.tenureRow.geid).toBe('900001');
  });

  it('TERMINATED: employment_status inactive even with no termination_entry_date yet (real QSRSoft lag)', () => {
    const review = blankReview('Jane GM', 'GM', '3708', 2026, DEFAULT_REVIEW_CONFIG, '900001');
    const result = detectDeparture(review, [tenureRow({ employment_status: 'Inactive' })]);
    expect(result.departed).toBe(true);
    expect(result.reason).toBe(DEPARTURE_REASON.TERMINATED);
  });

  it('ROLE_EXIT: still active, but job_title_code no longer classifies into GM/AM/DM/SM', () => {
    const review = blankReview('Jane GM', 'GM', '3708', 2026, DEFAULT_REVIEW_CONFIG, '900001');
    const result = detectDeparture(review, [tenureRow({ job_title_code: 99999, job_title_code_description: 'CORPORATE ANALYST' })]);
    expect(result.departed).toBe(true);
    expect(result.reason).toBe(DEPARTURE_REASON.ROLE_EXIT);
  });

  it('NOT a departure: a role CHANGE within GM/AM/DM/SM (e.g. GM -> SM) is a transfer/promotion, not an exit', () => {
    const review = blankReview('Jane GM', 'GM', '3708', 2026, DEFAULT_REVIEW_CONFIG, '900001');
    const result = detectDeparture(review, [tenureRow({ job_title_code: 647 })]); // SM code
    expect(result.departed).toBe(false);
  });

  it('findTenureRow matches by geid, trims/stringifies, and returns null for blank person', () => {
    const rows = [tenureRow({ geid: '900001' })];
    expect(findTenureRow('900001', rows)?.geid).toBe('900001');
    expect(findTenureRow(' 900001 ', rows)?.geid).toBe('900001'); // person side is trimmed
    expect(findTenureRow('', rows)).toBeNull();
    expect(findTenureRow(null, rows)).toBeNull();
  });
});

describe('applyDepartureAutoFinalize', () => {
  beforeEach(() => installLS());
  afterAll(() => { try { delete globalThis.localStorage; } catch {} });

  it('no-op for a null review', () => {
    expect(applyDepartureAutoFinalize(null, [])).toEqual({ departed: false, reason: null, transitioned: [] });
  });

  it('no-op (no transition) when not departed', () => {
    const review = blankReview('Jane GM', 'GM', '3708', 2026, DEFAULT_REVIEW_CONFIG, '900001');
    const result = applyDepartureAutoFinalize(review, [tenureRow()]);
    expect(result).toEqual({ departed: false, reason: null, transitioned: [] });
  });

  it('auto-finalizes BOTH open halves (draft) via the REAL transitionReview — verified by reading the review back through getReviews()', () => {
    const review = blankReview('Jane GM', 'GM', '3708', 2026, DEFAULT_REVIEW_CONFIG, '900001');
    review.id = 'test-departure-review-1';
    localStorage.setItem('mf_perf_reviews_v1', JSON.stringify({ [review.id]: review }));

    const result = applyDepartureAutoFinalize(review, [tenureRow({ termination_entry_date: '2026-06-15' })]);
    expect(result.departed).toBe(true);
    expect(result.reason).toBe(DEPARTURE_REASON.TERMINATED);
    expect(result.transitioned.sort()).toEqual(['h1', 'h2']);

    // Read back through the REAL store, not the local `review` object — proves this went through
    // transitionReview's real upsertReview/localStorage path, not a parallel writer.
    const stored = getReviews()[review.id];
    expect(stored.periods.h1.status).toBe('auto_finalized');
    expect(stored.periods.h2.status).toBe('auto_finalized');
  });

  it('DISTINGUISHABLE FROM A HUMAN TRANSITION: the statusHistory entry is tagged with the auto-finalize marker', () => {
    const review = blankReview('Jane GM', 'GM', '3708', 2026, DEFAULT_REVIEW_CONFIG, '900001');
    review.id = 'test-departure-review-2';
    localStorage.setItem('mf_perf_reviews_v1', JSON.stringify({ [review.id]: review }));
    applyDepartureAutoFinalize(review, [tenureRow({ termination_entry_date: '2026-06-15' })]);

    const stored = getReviews()[review.id];
    const h1Entry = stored.periods.h1.statusHistory.at(-1);
    expect(h1Entry.from).toBe('draft');
    expect(h1Entry.to).toBe('auto_finalized');
    expect(isAutoFinalizeNote(h1Entry.notes)).toBe(true);
    expect(isAutoFinalizeNote(stored.periods.h1.statusNotes)).toBe(true);

    // A same-shaped manually-typed note is NOT mistaken for an auto-finalize note — this is a
    // real prefix check, not a coincidence of what departureAutoFinalizeNote happens to say.
    expect(isAutoFinalizeNote('Approved after discussion.')).toBe(false);
    expect(isAutoFinalizeNote(undefined)).toBe(false);
  });

  it('leaves an ALREADY-APPROVED half untouched (a human already finished that conversation)', () => {
    const review = blankReview('Jane GM', 'GM', '3708', 2026, DEFAULT_REVIEW_CONFIG, '900001');
    review.id = 'test-departure-review-3';
    review.periods.h1 = { status: 'approved', statusHistory: [{ from: 'submitted', to: 'approved', notes: '', at: '2026-03-01T00:00:00Z' }], statusNotes: '' };
    localStorage.setItem('mf_perf_reviews_v1', JSON.stringify({ [review.id]: review }));

    const result = applyDepartureAutoFinalize(review, [tenureRow({ termination_entry_date: '2026-06-15' })]);
    expect(result.transitioned).toEqual(['h2']); // only h2 (still draft) transitions

    const stored = getReviews()[review.id];
    expect(stored.periods.h1.status).toBe('approved'); // untouched
    expect(stored.periods.h1.statusHistory.length).toBe(1); // no new entry appended
    expect(stored.periods.h2.status).toBe('auto_finalized');
  });

  it('IDEMPOTENT: calling it again for the same still-departed person does not append a second statusHistory entry', () => {
    const review = blankReview('Jane GM', 'GM', '3708', 2026, DEFAULT_REVIEW_CONFIG, '900001');
    review.id = 'test-departure-review-4';
    localStorage.setItem('mf_perf_reviews_v1', JSON.stringify({ [review.id]: review }));
    const tenureRows = [tenureRow({ termination_entry_date: '2026-06-15' })];

    applyDepartureAutoFinalize(review, tenureRows);
    const afterFirst = getReviews()[review.id];
    expect(afterFirst.periods.h1.statusHistory.length).toBe(1);

    const secondResult = applyDepartureAutoFinalize(afterFirst, tenureRows);
    expect(secondResult.transitioned).toEqual([]); // both halves already auto_finalized -- skipped
    const afterSecond = getReviews()[review.id];
    expect(afterSecond.periods.h1.statusHistory.length).toBe(1); // unchanged
  });

  it('ROLE_EXIT reason produces a note naming the unclassifiable job code', () => {
    const review = blankReview('Jane GM', 'GM', '3708', 2026, DEFAULT_REVIEW_CONFIG, '900001');
    review.id = 'test-departure-review-5';
    localStorage.setItem('mf_perf_reviews_v1', JSON.stringify({ [review.id]: review }));
    applyDepartureAutoFinalize(review, [tenureRow({ job_title_code: 99999, job_title_code_description: 'CORPORATE ANALYST', termination_entry_date: null })]);

    const stored = getReviews()[review.id];
    expect(stored.periods.h1.statusNotes).toMatch(/role change/i);
    expect(stored.periods.h1.statusNotes).toMatch(/99999/);
  });
});

describe('isDepartureHandled (the new-manager-panel auto-clear signal)', () => {
  it('false for a brand-new review — nothing has happened yet', () => {
    const review = blankReview('X', 'GM', '3708', 2026, DEFAULT_REVIEW_CONFIG);
    expect(isDepartureHandled(review)).toBe(false);
  });

  it('false for a review approved through the ORDINARY human flow — never detected as departed', () => {
    const review = blankReview('X', 'GM', '3708', 2026, DEFAULT_REVIEW_CONFIG);
    review.periods.h1 = {
      status: 'approved',
      statusHistory: [
        { from: 'draft', to: 'submitted', notes: '', at: '2026-01-01T00:00:00Z' },
        { from: 'submitted', to: 'approved', notes: '', at: '2026-01-02T00:00:00Z' },
      ],
      statusNotes: '',
    };
    expect(isDepartureHandled(review)).toBe(false);
  });

  it('true while still pending confirmation (status is auto_finalized)', () => {
    const review = blankReview('X', 'GM', '3708', 2026, DEFAULT_REVIEW_CONFIG);
    review.periods.h1 = {
      status: 'auto_finalized',
      statusHistory: [{ from: 'draft', to: 'auto_finalized', notes: '[AUTO-FINALIZE] ...', at: '2026-06-01T00:00:00Z' }],
      statusNotes: '[AUTO-FINALIZE] ...',
    };
    expect(isDepartureHandled(review)).toBe(true);
  });

  it('true after a qualified reviewer CONFIRMS the auto-finalize as final (status is now approved)', () => {
    const review = blankReview('X', 'GM', '3708', 2026, DEFAULT_REVIEW_CONFIG);
    review.periods.h1 = {
      status: 'approved',
      statusHistory: [
        { from: 'draft', to: 'auto_finalized', notes: '[AUTO-FINALIZE] ...', at: '2026-06-01T00:00:00Z' },
        { from: 'auto_finalized', to: 'approved', notes: 'Confirmed as final by qualified reviewer after auto-finalize.', at: '2026-06-02T00:00:00Z' },
      ],
      statusNotes: 'Confirmed as final by qualified reviewer after auto-finalize.',
    };
    expect(isDepartureHandled(review)).toBe(true);
  });

  it('false again after a qualified reviewer REOPENS a wrong auto-finalize ("the departure record was wrong")', () => {
    const review = blankReview('X', 'GM', '3708', 2026, DEFAULT_REVIEW_CONFIG);
    review.periods.h1 = {
      status: 'draft',
      statusHistory: [
        { from: 'draft', to: 'auto_finalized', notes: '[AUTO-FINALIZE] ...', at: '2026-06-01T00:00:00Z' },
        { from: 'auto_finalized', to: 'draft', notes: 'Reopened — auto-finalize departure record was reviewed and reversed.', at: '2026-06-02T00:00:00Z' },
      ],
      statusNotes: 'Reopened — auto-finalize departure record was reviewed and reversed.',
    };
    expect(isDepartureHandled(review)).toBe(false);
  });

  it('false again once normal human review resumes AFTER a reopen, even though auto_finalized sits earlier in history', () => {
    const review = blankReview('X', 'GM', '3708', 2026, DEFAULT_REVIEW_CONFIG);
    review.periods.h1 = {
      status: 'approved',
      statusHistory: [
        { from: 'draft', to: 'auto_finalized', notes: '[AUTO-FINALIZE] ...', at: '2026-06-01T00:00:00Z' },
        { from: 'auto_finalized', to: 'draft', notes: 'Reopened — wrong record.', at: '2026-06-02T00:00:00Z' },
        { from: 'draft', to: 'submitted', notes: '', at: '2026-06-03T00:00:00Z' },
        { from: 'submitted', to: 'approved', notes: '', at: '2026-06-04T00:00:00Z' },
      ],
      statusNotes: '',
    };
    expect(isDepartureHandled(review)).toBe(false);
  });

  it('true if EITHER half is handled, even if the other never was', () => {
    const review = blankReview('X', 'GM', '3708', 2026, DEFAULT_REVIEW_CONFIG);
    review.periods.h1 = { status: 'draft', statusHistory: [], statusNotes: '' };
    review.periods.h2 = {
      status: 'auto_finalized',
      statusHistory: [{ from: 'draft', to: 'auto_finalized', notes: '[AUTO-FINALIZE] ...', at: '2026-11-01T00:00:00Z' }],
      statusNotes: '[AUTO-FINALIZE] ...',
    };
    expect(isDepartureHandled(review)).toBe(true);
  });
});
