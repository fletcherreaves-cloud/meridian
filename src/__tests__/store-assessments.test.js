// @ts-nocheck
// Store Assessments (src/views/store-assessments.js) -- backlog-master-2026-08-19.md §12 /
// backlog-open-2026-09-06.md §12's `store_assessments` table finally exists (supabase/schema-
// store-assessments.sql, 2026-09-07). These test the two pure helpers directly, same convention
// as customer-complaints.js's filterComplaintCases -- this suite runs Vitest under `node`, not
// jsdom, so the logic deciding what shows is what's tested, not the render.
import { describe, it, expect } from 'vitest';
import { mergeAssessmentRows, assessmentProgress } from '../views/store-assessments.js';

describe('mergeAssessmentRows', () => {
  it('joins every scoped store against its assessment row, defaulting to pending when none exists', () => {
    const scopedLocs = new Set(['3708', '5183']);
    const assessments = [{ loc: '3708', status: 'rated', rating: '4/5' }];
    const rows = mergeAssessmentRows(scopedLocs, assessments);
    expect(rows.length).toBe(2);
    const r3708 = rows.find(r => r.loc === '3708');
    const r5183 = rows.find(r => r.loc === '5183');
    expect(r3708.status).toBe('rated');
    expect(r3708.rating).toBe('4/5');
    expect(r5183.status).toBe('pending');
    expect(r5183.rating).toBeNull();
  });

  it('sorts pending stores before rated stores', () => {
    const scopedLocs = new Set(['3708', '5183']);
    const assessments = [{ loc: '3708', status: 'rated' }];
    const rows = mergeAssessmentRows(scopedLocs, assessments);
    expect(rows[0].status).toBe('pending');
    expect(rows[1].status).toBe('rated');
  });

  it('an assessment row for a store outside the current scope is silently excluded, not leaked in', () => {
    const scopedLocs = new Set(['3708']);
    const assessments = [{ loc: '3708', status: 'pending' }, { loc: '9999', status: 'rated' }];
    const rows = mergeAssessmentRows(scopedLocs, assessments);
    expect(rows.length).toBe(1);
    expect(rows[0].loc).toBe('3708');
  });

  it('empty scope returns an empty list, not a crash', () => {
    expect(mergeAssessmentRows(new Set(), [])).toEqual([]);
    expect(mergeAssessmentRows(null, null)).toEqual([]);
  });
});

describe('assessmentProgress', () => {
  it('counts rated/total and computes a rounded percent', () => {
    const rows = [{ status: 'rated' }, { status: 'rated' }, { status: 'pending' }, { status: 'pending' }];
    expect(assessmentProgress(rows)).toEqual({ rated: 2, total: 4, pct: 50 });
  });

  it('an empty row set is 0/0, not NaN%', () => {
    expect(assessmentProgress([])).toEqual({ rated: 0, total: 0, pct: 0 });
  });

  it('rounds a non-round percentage (8/20 = 40%, the real figure this backlog item originally tracked)', () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({ status: i < 8 ? 'rated' : 'pending' }));
    expect(assessmentProgress(rows)).toEqual({ rated: 8, total: 20, pct: 40 });
  });
});
