// @ts-nocheck
// Unit tests for scripts/import-complaints-history.mjs's padLoc()/buildRow() -- the customer_complaints
// upsert-row builder. parseComplaintEntry() itself is covered separately
// (dispatch-231-complaints-parser.test.js) -- this file tests buildRow()'s own mapping (loc
// padding, column names) working over that parser's output shape.
import { describe, it, expect } from 'vitest';
import { padLoc, buildRow, dedupeByChildCaseId } from '../../scripts/import-complaints-history.mjs';

describe('padLoc (complaints import)', () => {
  it('zero-pads a bare NSN to the 5-digit convention (matches graded_visits)', () => {
    expect(padLoc('3708')).toBe('03708');
    expect(padLoc(3708)).toBe('03708');
    expect(padLoc('03708')).toBe('03708');
  });
});

describe('buildRow (complaints import)', () => {
  const parsedRow = () => ({
    store: '3708', childCaseId: 35139570, parentCaseId: 35139570,
    issueCode: 'Service', issueSubCode: 'Received Wrong Ingredients',
    incidentDate: '2026-01-05', receivedDate: '2026-01-06', caseStatus: 'CLOSED',
    abbreviatedCustomerComments: 'a preview', customerComments: 'the full text',
  });

  it('maps every field to its customer_complaints column name', () => {
    const row = buildRow(parsedRow());
    expect(row).toMatchObject({
      child_case_id: 35139570, parent_case_id: 35139570, loc: '03708',
      issue_code: 'Service', issue_sub_code: 'Received Wrong Ingredients',
      incident_date: '2026-01-05', received_date: '2026-01-06', case_status: 'CLOSED',
      abbreviated_customer_comments: 'a preview', customer_comments: 'the full text',
    });
    expect(row.updated_at).toBeTruthy();
  });

  it('pads loc through to the 5-digit convention', () => {
    const row = buildRow({ ...parsedRow(), store: '689' });
    expect(row.loc).toBe('00689');
  });

  // Measured on the first real capture (2026-09-05, 3033 raw entries): some cases have no
  // incidentDate at all, which the customer_complaints NOT NULL constraint rejected outright.
  it('falls back to receivedDate for incident_date when incidentDate is missing', () => {
    const row = buildRow({ ...parsedRow(), incidentDate: null });
    expect(row.incident_date).toBe('2026-01-06');
    expect(row.received_date).toBe('2026-01-06');
  });

  it('leaves incident_date null when neither incidentDate nor receivedDate is present', () => {
    const row = buildRow({ ...parsedRow(), incidentDate: null, receivedDate: null });
    expect(row.incident_date).toBeNull();
  });
});

// Measured on the first real import run (2026-09-05, post incident_date fix): "ON CONFLICT DO
// UPDATE command cannot affect row a second time" -- a "Multiple Issues" case's own childCases[]
// entry can share its real child_case_id with the top-level case row (dispatch-231-complaints-
// parser.test.js documents this as real API behavior), and Postgres refuses two rows with the
// same conflict target in one upsert statement.
describe('dedupeByChildCaseId (complaints import)', () => {
  it('collapses rows sharing a child_case_id, keeping the last occurrence', () => {
    const rows = [
      { child_case_id: 1, issue_code: 'GenericParent' },
      { child_case_id: 2, issue_code: 'Unrelated' },
      { child_case_id: 1, issue_code: 'SpecificChild' },
    ];
    const result = dedupeByChildCaseId(rows);
    expect(result).toHaveLength(2);
    expect(result.find(r => r.child_case_id === 1).issue_code).toBe('SpecificChild');
    expect(result.find(r => r.child_case_id === 2).issue_code).toBe('Unrelated');
  });

  it('leaves rows with no duplicates untouched', () => {
    const rows = [{ child_case_id: 1 }, { child_case_id: 2 }, { child_case_id: 3 }];
    expect(dedupeByChildCaseId(rows)).toEqual(rows);
  });

  it('returns an empty array for no rows', () => {
    expect(dedupeByChildCaseId([])).toEqual([]);
  });
});
