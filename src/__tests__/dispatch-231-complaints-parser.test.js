// @ts-nocheck
// Dispatch #231 (memory/dispatch-231-complaints-metric.md) — parseComplaintEntry()
// (src/parsers/complaints.js) turns a {store, name, case} wrapper (the seed shape
// scripts/browser-complaints-bulk-capture.js produces) into upsert-ready rows for
// customer_complaints, flattening a "Multiple Issues" case's childCases[] into their own rows.
import { describe, it, expect } from 'vitest';
import { parseComplaintEntry } from '../parsers/complaints.js';

function entry(caseOverrides = {}, store = '03708') {
  return {
    store, name: 'ARDMORE-BROADWAY',
    case: {
      locationId: '195500300689', parentCaseId: 1, childCaseId: 1,
      issueCode: 'Service', issueSubCode: 'Received Wrong Ingredients',
      incidentDate: '2026-01-05', receivedDate: '2026-01-06', caseStatus: 'CLOSED',
      abbreviatedCustomerComments: 'a preview', customerComments: 'the full text',
      childCases: [],
      ...caseOverrides,
    },
  };
}

describe('parseComplaintEntry', () => {
  it('parses a simple case into one row', () => {
    const rows = parseComplaintEntry(entry());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      store: '03708', childCaseId: 1, parentCaseId: 1,
      issueCode: 'Service', issueSubCode: 'Received Wrong Ingredients',
      incidentDate: '2026-01-05', receivedDate: '2026-01-06', caseStatus: 'CLOSED',
      customerComments: 'the full text',
    });
  });

  it('flattens a "Multiple Issues" case into one row per childCases[] entry, plus the parent', () => {
    const rows = parseComplaintEntry(entry({
      parentCaseId: 35259719, childCaseId: 35259719,
      childCases: [
        { parentCaseId: 35259719, childCaseId: 35259719, issueCode: 'Service', issueSubCode: 'Charged - Equipment or Operations Issue', incidentDate: '2026-01-20', receivedDate: '2026-01-20', caseStatus: 'CLOSED' },
        { parentCaseId: 35259719, childCaseId: 35265289, issueCode: 'Unspecified', issueSubCode: 'Mobile Refund Request', incidentDate: '2026-01-20', receivedDate: '2026-01-20', caseStatus: 'CLOSED' },
      ],
    }));
    // The parent case row (childCaseId 35259719) PLUS both nested childCases entries (one of
    // which duplicates the parent's own childCaseId=35259719 -- real API behavior, confirmed
    // against the finding file's own captured example) = 3 rows total.
    expect(rows).toHaveLength(3);
    expect(rows.map(r => r.childCaseId)).toEqual([35259719, 35259719, 35265289]);
    expect(rows[2].issueSubCode).toBe('Mobile Refund Request');
    expect(rows.every(r => r.parentCaseId === 35259719)).toBe(true);
  });

  it('skips an entry with no store', () => {
    const e = entry();
    e.store = null;
    expect(parseComplaintEntry(e)).toEqual([]);
  });

  it('skips a case with no childCaseId, but still keeps a valid sibling in childCases', () => {
    const rows = parseComplaintEntry(entry({
      childCaseId: null,
      childCases: [{ parentCaseId: 1, childCaseId: 2, issueCode: 'Quality', issueSubCode: 'Condition / Texture / Appearance', incidentDate: '2026-02-26', caseStatus: 'CLOSED' }],
    }));
    expect(rows).toHaveLength(1);
    expect(rows[0].childCaseId).toBe(2);
  });

  it('never carries a case with no `case` payload at all', () => {
    expect(parseComplaintEntry({ store: '03708', name: 'X' })).toEqual([]);
  });
});
