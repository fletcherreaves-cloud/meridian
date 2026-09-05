// @ts-nocheck
// Dispatch #231 follow-on (2026-09-05) — Customer Complaints browsing panel
// (src/views/customer-complaints.js). Component rendering itself isn't unit-tested anywhere in
// src/ (this suite runs under Vitest's `node` environment, no jsdom) — these tests cover the
// extracted pure filter predicate that decides what shows, same convention as every other panel
// here (e.g. graded-visits.js's moduleEntries/hourMetrics).
import { describe, it, expect } from 'vitest';
import { filterComplaintCases, locNum } from '../views/customer-complaints.js';

describe('locNum (customer complaints panel)', () => {
  it('strips leading zeros so a 5-digit customer_complaints loc matches STORE_NAMES keys', () => {
    expect(locNum('03708')).toBe('3708');
    expect(locNum('3708')).toBe('3708');
  });
});

describe('filterComplaintCases', () => {
  const cases = () => ([
    { childCaseId: 1, loc: '03708', incidentDate: '2026-01-05', caseStatus: 'CLOSED', issueCode: 'Service', issueSubCode: 'Received Wrong Ingredients', customerComments: 'Order was missing fries.' },
    { childCaseId: 2, loc: '03708', incidentDate: '2026-02-10', caseStatus: 'OPEN', issueCode: 'Quality', issueSubCode: 'Condition / Texture', customerComments: 'Burger was cold.' },
    { childCaseId: 3, loc: '00689', incidentDate: '2026-01-20', caseStatus: 'CLOSED', issueCode: 'Cleanliness', issueSubCode: 'Dining Room', customerComments: null },
  ]);

  it('scopes by loc via a locNum-normalized Set', () => {
    const result = filterComplaintCases(cases(), { scopedLocs: new Set(['3708']) });
    expect(result.map(c => c.childCaseId)).toEqual([2, 1]); // newest incidentDate first
  });

  it('passes everything through when scopedLocs is not provided', () => {
    expect(filterComplaintCases(cases(), {})).toHaveLength(3);
  });

  it('filters by caseStatus, "all" being a no-op', () => {
    expect(filterComplaintCases(cases(), { statusFilter: 'OPEN' }).map(c => c.childCaseId)).toEqual([2]);
    expect(filterComplaintCases(cases(), { statusFilter: 'all' })).toHaveLength(3);
  });

  it('filters by incidentDate range, inclusive', () => {
    const result = filterComplaintCases(cases(), { dateRange: { s: '2026-01-01', e: '2026-01-31' } });
    expect(result.map(c => c.childCaseId).sort()).toEqual([1, 3]);
  });

  it('searches issueCode/issueSubCode/customerComments case-insensitively', () => {
    expect(filterComplaintCases(cases(), { q: 'fries' }).map(c => c.childCaseId)).toEqual([1]);
    expect(filterComplaintCases(cases(), { q: 'CLEANLINESS' }).map(c => c.childCaseId)).toEqual([3]);
    expect(filterComplaintCases(cases(), { q: 'nonexistent' })).toEqual([]);
  });

  it('never throws on a null customerComments when searching', () => {
    expect(() => filterComplaintCases(cases(), { q: 'anything' })).not.toThrow();
  });

  it('sorts newest incidentDate first', () => {
    expect(filterComplaintCases(cases(), {}).map(c => c.childCaseId)).toEqual([2, 3, 1]);
  });

  it('combines all filters together', () => {
    const result = filterComplaintCases(cases(), {
      scopedLocs: new Set(['3708']), statusFilter: 'CLOSED',
      dateRange: { s: '2026-01-01', e: '2026-01-31' }, q: 'fries',
    });
    expect(result.map(c => c.childCaseId)).toEqual([1]);
  });

  it('returns an empty array for an empty/missing case list', () => {
    expect(filterComplaintCases([], {})).toEqual([]);
    expect(filterComplaintCases(null, {})).toEqual([]);
  });
});
